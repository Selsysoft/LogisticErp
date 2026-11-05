package org.ece.blackrose.warehouse.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentRepository;
import org.ece.blackrose.tenant.TenantClock;
import org.ece.blackrose.warehouse.domain.StockBalance;
import org.ece.blackrose.warehouse.domain.StockItem;
import org.ece.blackrose.warehouse.domain.StockMovement;
import org.ece.blackrose.warehouse.domain.StockMovement.Details;
import org.ece.blackrose.warehouse.domain.Warehouse;
import org.ece.blackrose.warehouse.domain.WarehouseBin;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.CountStatus;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.CustomsStatus;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.MovementType;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.StockBalanceRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.StockCountRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.StockItemRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.StockMovementRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.WarehouseBinRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.WarehouseInvoiceRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.WarehouseRepository;
import org.ece.blackrose.warehouse.web.WarehouseDtos.CustomsReleaseRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.IssueRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.ReceiptRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Müşteri malının giriş ve çıkışı. Miktar yalnız hareketle değişir. Her işlem depo satırını
 * kilitlediği için sayım ve fatura ile çakışmaz.
 */
@Service
public class StockService {

  private static final String NO_LOT = "";

  private final WarehouseRepository warehouses;
  private final WarehouseBinRepository bins;
  private final StockItemRepository items;
  private final StockBalanceRepository balances;
  private final StockMovementRepository movements;
  private final StockCountRepository counts;
  private final WarehouseInvoiceRepository invoices;
  private final ShipmentRepository shipments;
  private final TenantClock clock;

  public StockService(
      WarehouseRepository warehouses,
      WarehouseBinRepository bins,
      StockItemRepository items,
      StockBalanceRepository balances,
      StockMovementRepository movements,
      StockCountRepository counts,
      WarehouseInvoiceRepository invoices,
      ShipmentRepository shipments,
      TenantClock clock) {
    this.warehouses = warehouses;
    this.bins = bins;
    this.items = items;
    this.balances = balances;
    this.movements = movements;
    this.counts = counts;
    this.invoices = invoices;
    this.shipments = shipments;
    this.clock = clock;
  }

  @Transactional
  public StockMovement receive(ReceiptRequest request) {
    WarehouseBin bin = findBin(request.binId());
    Warehouse warehouse = lockForMovement(bin.getWarehouseId());
    StockItem item = findItem(request.itemId());
    ensureShipment(request.shipmentId());
    ensureDateOpen(item.getAccountId(), warehouse.getId(), request.date());
    String lot = normalizeLot(request.lotNo());
    ensureSameExpiry(item.getId(), lot, request.expiryDate());
    CustomsStatus status = warehouse.isBonded() ? CustomsStatus.UNDER_BOND : CustomsStatus.NONE;
    StockBalance balance = balanceFor(bin, item, lot, request.expiryDate(), status);
    return apply(
        MovementType.RECEIPT,
        balance,
        request.quantity(),
        new Details(
            request.date(), request.shipmentId(), null, null, request.reference(), request.note()));
  }

  @Transactional
  public StockMovement issue(IssueRequest request) {
    StockBalance balance = findBalance(request.balanceId());
    Warehouse warehouse = lockForMovement(balance.getWarehouseId());
    ensureShipment(request.shipmentId());
    ensureDateOpen(balance.getAccountId(), warehouse.getId(), request.date());
    StockBalance locked = lockBalance(balance);
    if (locked.getCustomsStatus() == CustomsStatus.UNDER_BOND) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "CUSTOMS_HOLD",
          "Antrepo rejimindeki mal gümrük işlemi bitmeden çıkarılamaz.");
    }
    return apply(
        MovementType.ISSUE,
        locked,
        request.quantity().negate(),
        new Details(
            request.date(), request.shipmentId(), null, null, request.reference(), request.note()));
  }

  /** Gümrük işlemi biten miktarı serbest bakiyeye geçirir; toplam stok değişmez. */
  @Transactional
  public StockMovement releaseCustoms(CustomsReleaseRequest request) {
    StockBalance balance = findBalance(request.balanceId());
    lockForMovement(balance.getWarehouseId());
    ensureDateOpen(balance.getAccountId(), balance.getWarehouseId(), request.date());
    StockBalance locked = lockBalance(balance);
    if (locked.getCustomsStatus() != CustomsStatus.UNDER_BOND) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "NOT_UNDER_BOND", "Bu bakiye antrepo rejiminde değil.");
    }
    Details details = new Details(request.date(), null, null, null, request.reference(), null);
    apply(MovementType.CUSTOMS_RELEASE, locked, request.quantity().negate(), details);
    StockBalance cleared =
        balanceFor(
            findBin(locked.getBinId()),
            findItem(locked.getItemId()),
            locked.getLotNo(),
            locked.getExpiryDate(),
            CustomsStatus.CLEARED);
    return apply(MovementType.CUSTOMS_RELEASE, cleared, request.quantity(), details);
  }

  /** Yanlış giriş veya çıkışı ters hareketle düzeltir. */
  @Transactional
  public StockMovement reverse(UUID movementId, LocalDate date) {
    StockMovement original =
        movements
            .findById(movementId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "MOVEMENT_NOT_FOUND", "Hareket bulunamadı."));
    lockForMovement(original.getWarehouseId());
    if (original.getType() != MovementType.RECEIPT && original.getType() != MovementType.ISSUE) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "MOVEMENT_NOT_REVERSIBLE", "Yalnız giriş ve çıkış ters çevrilir.");
    }
    if (movements.existsByReversesId(movementId)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "MOVEMENT_ALREADY_REVERSED", "Hareket zaten ters çevrilmiş.");
    }
    ensureDateOpen(original.getAccountId(), original.getWarehouseId(), date);
    StockBalance balance =
        balances
            .findByBinIdAndItemIdAndLotNoAndCustomsStatus(
                original.getBinId(),
                original.getItemId(),
                original.getLotNo(),
                original.getCustomsStatus())
            .orElseThrow();
    return apply(
        MovementType.REVERSAL,
        balance,
        original.getQuantity().negate(),
        new Details(date, original.getShipmentId(), null, movementId, null, null));
  }

  /** Bakiyeyi değiştirip hareketi yazar. Stok eksiye düşemez. */
  StockMovement apply(
      MovementType type, StockBalance balance, BigDecimal quantity, Details details) {
    if (balance.getQuantity().add(quantity).signum() < 0) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "INSUFFICIENT_STOCK",
          "Stok yetersiz. Mevcut: " + balance.getQuantity().stripTrailingZeros().toPlainString());
    }
    balance.add(quantity);
    return movements.save(new StockMovement(type, balance, quantity, details));
  }

  /** Bakiye satırını kilitli getirir, yoksa oluşturur. */
  StockBalance balanceFor(
      WarehouseBin bin, StockItem item, String lot, LocalDate expiry, CustomsStatus status) {
    return balances
        .findByBinIdAndItemIdAndLotNoAndCustomsStatus(bin.getId(), item.getId(), lot, status)
        .orElseGet(() -> balances.save(new StockBalance(bin, item, lot, expiry, status)));
  }

  void ensureDateOpen(UUID accountId, UUID warehouseId, LocalDate date) {
    if (date.isAfter(clock.today())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "DATE_IN_FUTURE", "Gelecek tarihli işlem yapılamaz.");
    }
    if (invoices.covers(accountId, warehouseId, date)) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "PERIOD_INVOICED",
          "Bu tarih faturalanmış dönemde. Önce fatura iptal edilmelidir.");
    }
  }

  static String normalizeLot(String lot) {
    return lot == null ? NO_LOT : lot.trim();
  }

  private void ensureSameExpiry(UUID itemId, String lot, LocalDate expiry) {
    if (lot.isEmpty()) {
      return;
    }
    balances
        .findFirstByItemIdAndLotNo(itemId, lot)
        .filter(
            existing ->
                existing.getExpiryDate() == null
                    ? expiry != null
                    : !existing.getExpiryDate().equals(expiry))
        .ifPresent(
            existing -> {
              throw new BusinessException(
                  HttpStatus.CONFLICT,
                  "LOT_EXPIRY_MISMATCH",
                  "Aynı lotta farklı son kullanma tarihi olamaz.");
            });
  }

  private StockBalance lockBalance(StockBalance balance) {
    return balances
        .findByBinIdAndItemIdAndLotNoAndCustomsStatus(
            balance.getBinId(), balance.getItemId(), balance.getLotNo(), balance.getCustomsStatus())
        .orElseThrow();
  }

  private Warehouse lockForMovement(UUID warehouseId) {
    Warehouse warehouse =
        warehouses
            .findForUpdate(warehouseId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "WAREHOUSE_NOT_FOUND", "Depo bulunamadı."));
    if (counts.existsByWarehouseIdAndStatus(warehouseId, CountStatus.OPEN)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "COUNT_OPEN", "Depoda açık sayım var; hareket yapılamaz.");
    }
    return warehouse;
  }

  private void ensureShipment(UUID shipmentId) {
    if (shipmentId != null && !shipments.existsById(shipmentId)) {
      throw new BusinessException(HttpStatus.NOT_FOUND, "SHIPMENT_NOT_FOUND", "Sefer bulunamadı.");
    }
  }

  private WarehouseBin findBin(UUID id) {
    return bins.findById(id)
        .orElseThrow(
            () -> new BusinessException(HttpStatus.NOT_FOUND, "BIN_NOT_FOUND", "Göz bulunamadı."));
  }

  private StockItem findItem(UUID id) {
    return items
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(HttpStatus.NOT_FOUND, "ITEM_NOT_FOUND", "Ürün bulunamadı."));
  }

  private StockBalance findBalance(UUID id) {
    return balances
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "BALANCE_NOT_FOUND", "Stok bakiyesi bulunamadı."));
  }
}
