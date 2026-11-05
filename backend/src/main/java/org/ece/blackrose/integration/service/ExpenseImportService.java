package org.ece.blackrose.integration.service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.fleet.domain.FleetTypes.ExpenseKind;
import org.ece.blackrose.fleet.domain.Vehicle;
import org.ece.blackrose.fleet.domain.VehicleExpense;
import org.ece.blackrose.fleet.repository.FleetRepositories.VehicleRepository;
import org.ece.blackrose.fleet.service.VehicleExpenseService;
import org.ece.blackrose.fleet.web.FleetDtos.SaveVehicleExpenseRequest;
import org.ece.blackrose.integration.domain.ImportBatch;
import org.ece.blackrose.integration.domain.ImportRow;
import org.ece.blackrose.integration.domain.ImportRow.Parsed;
import org.ece.blackrose.integration.domain.IntegrationTypes.ImportKind;
import org.ece.blackrose.integration.domain.IntegrationTypes.ImportRowStatus;
import org.ece.blackrose.integration.repository.IntegrationRepositories.ImportBatchRepository;
import org.ece.blackrose.integration.repository.IntegrationRepositories.ImportRowRepository;
import org.ece.blackrose.organization.BranchRepository;
import org.ece.blackrose.shipment.domain.ShipmentLeg;
import org.ece.blackrose.shipment.domain.ShipmentTypes.CostKind;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentLegRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentRepository;
import org.ece.blackrose.shipment.service.TripFinanceService;
import org.ece.blackrose.shipment.web.ShipmentDtos.SaveCostRequest;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * HGS/OGS ve yakıt kartı dosyaları. Önce eşleştirilip gösterilir, kullanıcı onaylayınca gider
 * yazılır. Aynı hareket ikinci dosyada gelirse atlanır.
 */
@Service
public class ExpenseImportService {

  private static final String TRY = "TRY";

  private final ImportBatchRepository batches;
  private final ImportRowRepository rows;
  private final VehicleRepository vehicles;
  private final ShipmentLegRepository legs;
  private final ShipmentRepository shipments;
  private final AccountRepository accounts;
  private final BranchRepository branches;
  private final TripFinanceService tripFinance;
  private final VehicleExpenseService vehicleExpenses;
  private final TenantClock clock;

  public ExpenseImportService(
      ImportBatchRepository batches,
      ImportRowRepository rows,
      VehicleRepository vehicles,
      ShipmentLegRepository legs,
      ShipmentRepository shipments,
      AccountRepository accounts,
      BranchRepository branches,
      TripFinanceService tripFinance,
      VehicleExpenseService vehicleExpenses,
      TenantClock clock) {
    this.batches = batches;
    this.rows = rows;
    this.vehicles = vehicles;
    this.legs = legs;
    this.shipments = shipments;
    this.accounts = accounts;
    this.branches = branches;
    this.tripFinance = tripFinance;
    this.vehicleExpenses = vehicleExpenses;
    this.clock = clock;
  }

  @Transactional
  public ImportBatch upload(
      ImportKind kind, String fileName, byte[] content, UUID accountId, UUID branchId) {
    if (!accounts.existsById(accountId)) {
      throw new BusinessException(HttpStatus.NOT_FOUND, "ACCOUNT_NOT_FOUND", "Cari bulunamadı.");
    }
    if (!branches.existsById(branchId)) {
      throw new BusinessException(HttpStatus.BAD_REQUEST, "BRANCH_NOT_FOUND", "Şube bulunamadı.");
    }
    ImportBatch batch =
        batches.save(
            new ImportBatch(kind, fileName == null ? "dosya" : fileName, accountId, branchId));
    Map<String, Vehicle> byPlate =
        vehicles.findAll().stream()
            .collect(
                Collectors.toMap(
                    vehicle -> CsvRows.plate(vehicle.getPlate()),
                    Function.identity(),
                    (a, b) -> a));
    int duplicates = 0;
    for (CsvRows.Line line : CsvRows.parse(content)) {
      try {
        Parsed parsed = kind == ImportKind.TOLL ? parseToll(line) : parseFuel(line);
        if (rows.existsByKindAndExternalKey(kind, parsed.externalKey())) {
          duplicates++;
          continue;
        }
        ImportRow row = new ImportRow(batch.getId(), kind, line.number(), parsed);
        autoMatch(row, byPlate.get(CsvRows.plate(parsed.plate())));
        rows.saveAndFlush(row);
      } catch (CsvRows.RowException ex) {
        rows.save(ImportRow.error(batch.getId(), kind, line.number(), ex.getMessage()));
      }
    }
    batch.countDuplicates(duplicates);
    return batch;
  }

  /** plaka;tarih_saat;gecis_noktasi;tutar;para_birimi;referans */
  private Parsed parseToll(CsvRows.Line line) {
    String currency = line.text(4);
    return new Parsed(
        CsvRows.key(line.text(5), line.raw()),
        line.required(0, "Plaka"),
        instant(line.required(1, "Tarih")),
        line.text(2),
        positive(CsvRows.amount(line.required(3, "Tutar"), "Tutar"), "Tutar"),
        currency == null ? TRY : currency,
        null,
        null);
  }

  /** plaka;tarih_saat;litre;tutar;km;istasyon;para_birimi;referans */
  private Parsed parseFuel(CsvRows.Line line) {
    String currency = line.text(6);
    return new Parsed(
        CsvRows.key(line.text(7), line.raw()),
        line.required(0, "Plaka"),
        instant(line.required(1, "Tarih")),
        line.text(5),
        positive(CsvRows.amount(line.required(3, "Tutar"), "Tutar"), "Tutar"),
        currency == null ? TRY : currency,
        positive(CsvRows.amount(line.required(2, "Litre"), "Litre"), "Litre"),
        positive(CsvRows.amount(line.required(4, "Km"), "Km"), "Km"));
  }

  private void autoMatch(ImportRow row, Vehicle vehicle) {
    if (vehicle == null) {
      row.match(null, null, ImportRowStatus.UNMATCHED, "Plaka kayıtlı değil.");
      return;
    }
    UUID shipment =
        legs.billableAt(vehicle.getId(), row.getOccurredAt()).stream()
            .map(ShipmentLeg::getShipmentId)
            .findFirst()
            .orElse(null);
    // Yakıt araç gideridir, sefersiz de yazılır. Geçiş ücreti sefer gideridir, sefer ister.
    boolean ready = row.getKind() == ImportKind.FUEL || shipment != null;
    row.match(
        vehicle.getId(),
        shipment,
        ready ? ImportRowStatus.MATCHED : ImportRowStatus.UNMATCHED,
        ready ? null : "Bu zamanda aracın seferi bulunamadı.");
  }

  /** Elle sefer seçer. Plaka bilinmese de geçiş ücreti bir sefere yazılabilir. */
  @Transactional
  public ImportRow assign(UUID rowId, UUID shipmentId) {
    ImportRow row = open(rowId);
    if (!shipments.existsById(shipmentId)) {
      throw new BusinessException(HttpStatus.NOT_FOUND, "SHIPMENT_NOT_FOUND", "Sefer bulunamadı.");
    }
    if (row.getKind() == ImportKind.FUEL && row.getVehicleId() == null) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "VEHICLE_REQUIRED",
          "Yakıt gideri için plaka araç kütüğünde olmalıdır.");
    }
    row.match(row.getVehicleId(), shipmentId, ImportRowStatus.MATCHED, null);
    return row;
  }

  @Transactional
  public ImportRow ignore(UUID rowId) {
    ImportRow row = open(rowId);
    row.mark(ImportRowStatus.IGNORED);
    return row;
  }

  /**
   * Eşleşen satırları gider olarak yazar. Bir satır reddedilirse tüm işlem geri alınır ve hangi
   * satır olduğu söylenir; böylece dosya yarım kalmaz.
   */
  @Transactional
  public int post(UUID batchId) {
    ImportBatch batch =
        batches
            .findById(batchId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "IMPORT_NOT_FOUND", "İçe aktarım bulunamadı."));
    int posted = 0;
    for (ImportRow row : rows.findByBatchIdOrderByLineNo(batchId)) {
      if (row.getStatus() != ImportRowStatus.MATCHED) {
        continue;
      }
      try {
        if (row.getKind() == ImportKind.TOLL) {
          postToll(batch, row);
        } else {
          postFuel(batch, row);
        }
      } catch (BusinessException ex) {
        throw new BusinessException(
            ex.getStatus(), ex.getCode(), "Satır " + row.getLineNo() + ": " + ex.getMessage());
      }
      row.mark(ImportRowStatus.POSTED);
      posted++;
    }
    return posted;
  }

  private void postToll(ImportBatch batch, ImportRow row) {
    LocalDate date = clock.dateOf(row.getOccurredAt());
    tripFinance.addCost(
        row.getShipmentId(),
        new SaveCostRequest(
            CostKind.TOLL,
            null,
            batch.getAccountId(),
            null,
            row.getMoney(),
            null,
            date,
            Objects.requireNonNullElse(row.getPlace(), "HGS/OGS") + " · " + row.getPlate()));
  }

  private void postFuel(ImportBatch batch, ImportRow row) {
    LocalDate date = clock.dateOf(row.getOccurredAt());
    VehicleExpense expense =
        vehicleExpenses.create(
            row.getVehicleId(),
            new SaveVehicleExpenseRequest(
                ExpenseKind.FUEL,
                date,
                row.getOdometerKm(),
                "Yakıt kartı",
                row.getMoney(),
                batch.getBranchId(),
                batch.getAccountId(),
                null,
                null,
                row.getLiters(),
                row.getPlace(),
                null,
                null,
                null));
    if (row.getShipmentId() != null) {
      // Araç gideri finansa yazıldı; sefere yalnız kârlılık için bağlanır.
      tripFinance.addCost(
          row.getShipmentId(),
          new SaveCostRequest(
              CostKind.FUEL, null, null, expense.getId(), null, null, null, "Yakıt kartı"));
    }
  }

  private ImportRow open(UUID rowId) {
    ImportRow row =
        rows.findById(rowId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "IMPORT_ROW_NOT_FOUND", "Satır bulunamadı."));
    if (row.getStatus() == ImportRowStatus.POSTED || row.getStatus() == ImportRowStatus.ERROR) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "IMPORT_ROW_CLOSED", "Bu satır değiştirilemez.");
    }
    return row;
  }

  private Instant instant(String value) {
    return clock.instantOf(CsvRows.dateTime(value));
  }

  private static BigDecimal positive(BigDecimal value, String label) {
    if (value.signum() <= 0) {
      throw new CsvRows.RowException(label + " sıfırdan büyük olmalıdır.");
    }
    return value;
  }

  public List<ImportRow> rowsOf(UUID batchId) {
    return rows.findByBatchIdOrderByLineNo(batchId);
  }
}
