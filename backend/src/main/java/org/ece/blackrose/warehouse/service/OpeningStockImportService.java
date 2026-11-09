package org.ece.blackrose.warehouse.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.integration.service.CsvRows;
import org.ece.blackrose.integration.service.CsvRows.Line;
import org.ece.blackrose.integration.service.CsvRows.RowException;
import org.ece.blackrose.tenant.TenantClock;
import org.ece.blackrose.warehouse.domain.StockItem;
import org.ece.blackrose.warehouse.domain.Warehouse;
import org.ece.blackrose.warehouse.domain.WarehouseBin;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.CountStatus;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.StockBalanceRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.StockCountRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.StockItemRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.WarehouseBinRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.WarehouseInvoiceRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.WarehouseRepository;
import org.ece.blackrose.warehouse.web.WarehouseDtos.ReceiptRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.SaveStockItemRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Önceki sistemden depodaki müşteri mallarının açılış stoğu. Her satır "Açılış stoğu" referanslı
 * bir giriştir; göz, lot, son kullanma, gümrüklü depo ve faturalanmış dönem kuralları normal
 * girişle aynıdır, yanlış satır giriş gibi ters çevrilir. Önce önizlenir; içe aktarma ya hep ya
 * hiçtir. Müşteri carisi önceden olmalıdır; ürün yoksa müşteri adına, göz yoksa depoda açılır. Aynı
 * göz, ürün ve lotta stok varsa satır reddedilir: açılış boş depoya yapılır.
 */
@Service
public class OpeningStockImportService {

  public static final String REFERENCE = "Açılış stoğu";
  static final int MAX_ROWS = 10000;

  public enum RowStatus {
    READY,
    ERROR
  }

  public record Row(
      int line,
      String accountCode,
      String sku,
      String name,
      String bin,
      String lot,
      LocalDate expiry,
      BigDecimal quantity,
      String unit,
      boolean newItem,
      boolean newBin,
      RowStatus status,
      String error) {}

  public record Result(
      boolean applied,
      boolean valid,
      int itemsToCreate,
      int binsToCreate,
      int receipts,
      List<Row> rows) {}

  private record Columns(
      int account, int sku, int name, int unit, int bin, int lot, int expiry, int quantity) {}

  private record Parsed(
      Row row, Account account, StockItem item, WarehouseBin bin, String lot, String unit) {}

  private final WarehouseRepository warehouses;
  private final WarehouseBinRepository bins;
  private final StockItemRepository items;
  private final StockBalanceRepository balances;
  private final StockCountRepository counts;
  private final WarehouseInvoiceRepository invoices;
  private final AccountRepository accounts;
  private final StockService stock;
  private final TenantClock clock;
  private final AuditService audit;

  public OpeningStockImportService(
      WarehouseRepository warehouses,
      WarehouseBinRepository bins,
      StockItemRepository items,
      StockBalanceRepository balances,
      StockCountRepository counts,
      WarehouseInvoiceRepository invoices,
      AccountRepository accounts,
      StockService stock,
      TenantClock clock,
      AuditService audit) {
    this.warehouses = warehouses;
    this.bins = bins;
    this.items = items;
    this.balances = balances;
    this.counts = counts;
    this.invoices = invoices;
    this.accounts = accounts;
    this.stock = stock;
    this.clock = clock;
    this.audit = audit;
  }

  @Transactional(readOnly = true)
  public Result preview(byte[] content, UUID warehouseId, LocalDate date) {
    List<Parsed> parsed = check(content, warehouse(warehouseId), date);
    return result(parsed, false);
  }

  @Transactional
  public Result apply(byte[] content, UUID warehouseId, LocalDate date) {
    Warehouse warehouse = warehouse(warehouseId);
    List<Parsed> parsed = check(content, warehouse, date);
    if (parsed.stream().anyMatch(p -> p.row().status() == RowStatus.ERROR)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "OPENING_STOCK_INVALID",
          "Dosyada hatalı satır var; önizlemedeki hataları düzeltip yeniden yükleyin.");
    }
    Map<String, StockItem> createdItems = new HashMap<>();
    Map<String, WarehouseBin> createdBins = new HashMap<>();
    for (Parsed p : parsed) {
      StockItem item = p.item();
      if (item == null) {
        item =
            createdItems.computeIfAbsent(
                p.account().getId() + "|" + p.row().sku(),
                key ->
                    items.save(
                        new StockItem(
                            new SaveStockItemRequest(
                                p.account().getId(),
                                p.row().sku(),
                                p.row().name(),
                                p.unit(),
                                BigDecimal.ONE))));
      }
      WarehouseBin bin = p.bin();
      if (bin == null) {
        bin =
            createdBins.computeIfAbsent(
                p.row().bin(), code -> bins.save(new WarehouseBin(warehouse.getId(), code, null)));
      }
      stock.receive(
          new ReceiptRequest(
              item.getId(),
              bin.getId(),
              p.lot(),
              p.row().expiry(),
              p.row().quantity(),
              date,
              null,
              REFERENCE,
              null));
    }
    audit.record(
        AuditEvent.OPENING_STOCK_IMPORTED,
        warehouse.getCode(),
        parsed.size()
            + " giriş, "
            + createdItems.size()
            + " yeni ürün, "
            + createdBins.size()
            + " yeni göz");
    return result(parsed, true);
  }

  private Warehouse warehouse(UUID id) {
    if (id == null) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "WAREHOUSE_REQUIRED", "Depo seçilmelidir.");
    }
    return warehouses
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "WAREHOUSE_NOT_FOUND", "Depo bulunamadı."));
  }

  private List<Parsed> check(byte[] content, Warehouse warehouse, LocalDate date) {
    if (date == null || date.isAfter(clock.today())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "OPENING_DATE_INVALID", "Açılış tarihi ileri bir gün olamaz.");
    }
    if (counts.existsByWarehouseIdAndStatus(warehouse.getId(), CountStatus.OPEN)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "COUNT_OPEN", "Depoda açık sayım var; önce sayımı kapatın.");
    }
    Columns columns = columns(CsvRows.header(content));
    List<Line> lines = CsvRows.parse(content);
    if (lines.isEmpty()) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "OPENING_IMPORT_EMPTY", "Dosyada başlıktan sonra satır yok.");
    }
    if (lines.size() > MAX_ROWS) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "OPENING_IMPORT_TOO_LARGE",
          "Dosyada en çok " + MAX_ROWS + " satır olabilir.");
    }
    List<Parsed> parsed = new ArrayList<>();
    Set<String> seen = new HashSet<>();
    Map<String, LocalDate> lotExpiry = new HashMap<>();
    Map<String, String[]> itemNames = new HashMap<>();
    for (Line line : lines) {
      try {
        parsed.add(parse(line, columns, warehouse, date, seen, lotExpiry, itemNames));
      } catch (RowException | BusinessException ex) {
        parsed.add(
            new Parsed(
                new Row(
                    line.number(),
                    line.text(columns.account()),
                    line.text(columns.sku()),
                    columns.name() < 0 ? null : line.text(columns.name()),
                    line.text(columns.bin()),
                    columns.lot() < 0 ? null : line.text(columns.lot()),
                    null,
                    null,
                    null,
                    false,
                    false,
                    RowStatus.ERROR,
                    ex.getMessage()),
                null,
                null,
                null,
                null,
                null));
      }
    }
    return parsed;
  }

  private Parsed parse(
      Line line,
      Columns columns,
      Warehouse warehouse,
      LocalDate date,
      Set<String> seen,
      Map<String, LocalDate> lotExpiry,
      Map<String, String[]> itemNames) {
    String accountCode = line.required(columns.account(), "Müşteri kodu");
    Account account =
        accounts
            .findByCode(accountCode)
            .orElseThrow(
                () ->
                    new RowException("Müşteri carisi yok: " + accountCode + ". Önce cariyi açın."));
    if (account.getType() != AccountType.CUSTOMER) {
      throw new RowException(accountCode + " müşteri carisi değil.");
    }
    if (invoices.covers(account.getId(), warehouse.getId(), date)) {
      throw new RowException("Açılış tarihi bu müşterinin faturalanmış döneminde.");
    }
    String sku = line.required(columns.sku(), "Ürün kodu");
    if (sku.length() > 50) {
      throw new RowException("Ürün kodu en çok 50 karakter olabilir.");
    }
    String binCode = line.required(columns.bin(), "Göz");
    if (binCode.length() > 30) {
      throw new RowException("Göz kodu en çok 30 karakter olabilir.");
    }
    String lot = StockService.normalizeLot(columns.lot() < 0 ? null : line.text(columns.lot()));
    if (lot.length() > 50) {
      throw new RowException("Lot en çok 50 karakter olabilir.");
    }
    String expiryText = columns.expiry() < 0 ? null : line.text(columns.expiry());
    LocalDate expiry;
    try {
      expiry = expiryText == null ? null : CsvRows.date(expiryText);
    } catch (RuntimeException ex) {
      throw new RowException("Son kullanma tarihi okunamadı: " + expiryText);
    }
    String quantityText = line.required(columns.quantity(), "Miktar");
    if (CsvRows.ambiguousThousands(quantityText)) {
      throw new RowException(
          "Miktar belirsiz: "
              + quantityText
              + ". Ondalık için virgül kullanın (1,500) veya ayırıcısız yazın (1500).");
    }
    BigDecimal quantity = CsvRows.amount(quantityText, "Miktar");
    if (quantity.signum() <= 0) {
      throw new RowException("Miktar sıfırdan büyük olmalıdır.");
    }
    if (quantity.stripTrailingZeros().scale() > 3) {
      throw new RowException("Miktarda en çok üç ondalık olabilir.");
    }

    StockItem item = items.findByAccountIdAndSku(account.getId(), sku).orElse(null);
    String name;
    String unit;
    if (item != null) {
      name = item.getName();
      unit = item.getUnit();
    } else {
      name = line.required(columns.name(), "Ürün adı (yeni ürün için)");
      unit = columns.unit() < 0 ? null : line.text(columns.unit());
      if (unit == null) {
        throw new RowException("Birim boş (yeni ürün için).");
      }
      if (name.length() > 200 || unit.length() > 20) {
        throw new RowException("Ürün adı en çok 200, birim en çok 20 karakter olabilir.");
      }
      String[] earlier = itemNames.putIfAbsent(accountCode + "|" + sku, new String[] {name, unit});
      if (earlier != null && (!earlier[0].equals(name) || !earlier[1].equals(unit))) {
        throw new RowException("Aynı ürünün satırlarında ad veya birim farklı.");
      }
    }
    WarehouseBin bin = bins.findByWarehouseIdAndCode(warehouse.getId(), binCode).orElse(null);

    if (!seen.add(accountCode + "|" + sku + "|" + binCode + "|" + lot)) {
      throw new RowException("Aynı göz, ürün ve lot dosyada iki kez var.");
    }
    if (item != null
        && bin != null
        && balances.existsByBinIdAndItemIdAndLotNoAndQuantityGreaterThan(
            bin.getId(), item.getId(), lot, BigDecimal.ZERO)) {
      throw new RowException("Bu göz, ürün ve lotta zaten stok var; açılış boş depoya yapılır.");
    }
    if (!lot.isEmpty()) {
      String lotKey = accountCode + "|" + sku + "|" + lot;
      if (lotExpiry.containsKey(lotKey) && !Objects.equals(lotExpiry.get(lotKey), expiry)) {
        throw new RowException("Aynı lotta farklı son kullanma tarihi olamaz.");
      }
      lotExpiry.put(lotKey, expiry);
      if (item != null) {
        balances
            .findFirstByItemIdAndLotNo(item.getId(), lot)
            .filter(existing -> !Objects.equals(existing.getExpiryDate(), expiry))
            .ifPresent(
                existing -> {
                  throw new RowException("Bu lot sistemde başka son kullanma tarihiyle kayıtlı.");
                });
      }
    }
    return new Parsed(
        new Row(
            line.number(),
            accountCode,
            sku,
            name,
            binCode,
            lot.isEmpty() ? null : lot,
            expiry,
            quantity,
            unit,
            item == null,
            bin == null,
            RowStatus.READY,
            null),
        account,
        item,
        bin,
        lot,
        unit);
  }

  private static Result result(List<Parsed> parsed, boolean applied) {
    List<Row> rows = parsed.stream().map(Parsed::row).toList();
    boolean valid = rows.stream().noneMatch(row -> row.status() == RowStatus.ERROR);
    long newItems =
        rows.stream()
            .filter(Row::newItem)
            .map(row -> row.accountCode() + "|" + row.sku())
            .distinct()
            .count();
    long newBins = rows.stream().filter(Row::newBin).map(Row::bin).distinct().count();
    int receipts = (int) rows.stream().filter(row -> row.status() == RowStatus.READY).count();
    return new Result(applied, valid, (int) newItems, (int) newBins, receipts, rows);
  }

  private static Columns columns(List<String> header) {
    Map<String, Integer> index = CsvRows.headerIndex(header);
    int account = CsvRows.column(index, "MUSTERI_KODU", "CARI_KODU", "MUSTERI");
    int sku = CsvRows.column(index, "URUN_KODU", "STOK_KODU", "SKU");
    int bin = CsvRows.column(index, "GOZ", "ADRES", "RAF");
    int quantity = CsvRows.column(index, "MIKTAR", "ADET");
    List<String> missing = new ArrayList<>();
    if (account < 0) {
      missing.add("müşteri kodu");
    }
    if (sku < 0) {
      missing.add("ürün kodu");
    }
    if (bin < 0) {
      missing.add("göz");
    }
    if (quantity < 0) {
      missing.add("miktar");
    }
    if (!missing.isEmpty()) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "OPENING_IMPORT_HEADER",
          "Başlıkta şu sütunlar bulunamadı: " + String.join(", ", missing) + ".");
    }
    return new Columns(
        account,
        sku,
        CsvRows.column(index, "URUN_ADI", "AD", "URUN"),
        CsvRows.column(index, "BIRIM"),
        bin,
        CsvRows.column(index, "LOT", "PARTI"),
        CsvRows.column(index, "SON_KULLANMA", "SKT", "SON_KULLANMA_TARIHI"),
        quantity);
  }
}
