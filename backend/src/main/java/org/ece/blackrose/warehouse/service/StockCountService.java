package org.ece.blackrose.warehouse.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.tenant.TenantClock;
import org.ece.blackrose.warehouse.domain.StockBalance;
import org.ece.blackrose.warehouse.domain.StockCount;
import org.ece.blackrose.warehouse.domain.StockCountLine;
import org.ece.blackrose.warehouse.domain.StockItem;
import org.ece.blackrose.warehouse.domain.StockMovement.Details;
import org.ece.blackrose.warehouse.domain.WarehouseBin;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.CountStatus;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.CustomsStatus;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.MovementType;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.StockBalanceRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.StockCountLineRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.StockCountRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.StockItemRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.WarehouseBinRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.WarehouseRepository;
import org.ece.blackrose.warehouse.web.WarehouseDtos.AddCountLineRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Sayım, açıldığı andaki stoğu dondurur; kapanırken farklar düzeltme hareketi olur. */
@Service
public class StockCountService {

  private final StockCountRepository counts;
  private final StockCountLineRepository lines;
  private final WarehouseRepository warehouses;
  private final WarehouseBinRepository bins;
  private final StockItemRepository items;
  private final StockBalanceRepository balances;
  private final StockService stock;
  private final TenantClock clock;

  public StockCountService(
      StockCountRepository counts,
      StockCountLineRepository lines,
      WarehouseRepository warehouses,
      WarehouseBinRepository bins,
      StockItemRepository items,
      StockBalanceRepository balances,
      StockService stock,
      TenantClock clock) {
    this.counts = counts;
    this.lines = lines;
    this.warehouses = warehouses;
    this.bins = bins;
    this.items = items;
    this.balances = balances;
    this.stock = stock;
    this.clock = clock;
  }

  @Transactional
  public StockCount open(UUID warehouseId, LocalDate date) {
    lockWarehouse(warehouseId);
    if (date.isAfter(clock.today())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "DATE_IN_FUTURE", "Gelecek tarihli işlem yapılamaz.");
    }
    if (counts.existsByWarehouseIdAndStatus(warehouseId, CountStatus.OPEN)) {
      throw new BusinessException(HttpStatus.CONFLICT, "COUNT_OPEN", "Depoda açık sayım var.");
    }
    String number = "SY-%d-%06d".formatted(date.getYear(), counts.nextNumber());
    StockCount count = counts.save(new StockCount(number, warehouseId, date));
    for (StockBalance balance :
        balances.findByWarehouseIdAndQuantityGreaterThan(warehouseId, BigDecimal.ZERO)) {
      lines.save(
          new StockCountLine(
              count.getId(),
              balance.getBinId(),
              balance.getItemId(),
              balance.getLotNo(),
              balance.getExpiryDate(),
              balance.getCustomsStatus(),
              balance.getQuantity()));
    }
    return count;
  }

  @Transactional
  public void enter(UUID lineId, BigDecimal quantity) {
    StockCountLine line =
        lines
            .findById(lineId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "COUNT_LINE_NOT_FOUND", "Sayım satırı bulunamadı."));
    ensureOpen(line.getCountId());
    line.count(quantity);
  }

  /** Kayıtlarda olmayan ama depoda bulunan mal için satır ekler. */
  @Transactional
  public StockCountLine addLine(UUID countId, AddCountLineRequest request) {
    StockCount count = ensureOpen(countId);
    WarehouseBin bin = findBin(request.binId());
    if (!bin.getWarehouseId().equals(count.getWarehouseId())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "BIN_OTHER_WAREHOUSE", "Göz bu depoya ait değil.");
    }
    if (!items.existsById(request.itemId())) {
      throw new BusinessException(HttpStatus.NOT_FOUND, "ITEM_NOT_FOUND", "Ürün bulunamadı.");
    }
    String lot = StockService.normalizeLot(request.lotNo());
    CustomsStatus status =
        warehouses.findById(count.getWarehouseId()).orElseThrow().isBonded()
            ? CustomsStatus.UNDER_BOND
            : CustomsStatus.NONE;
    if (lines.existsByCountIdAndBinIdAndItemIdAndLotNoAndCustomsStatus(
        countId, bin.getId(), request.itemId(), lot, status)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "COUNT_LINE_EXISTS", "Bu ürün ve lot için sayım satırı zaten var.");
    }
    StockCountLine line =
        new StockCountLine(
            countId,
            bin.getId(),
            request.itemId(),
            lot,
            request.expiryDate(),
            status,
            BigDecimal.ZERO);
    line.count(request.countedQuantity());
    return lines.save(line);
  }

  /** Tüm satırlar sayılmadan kapatılamaz. */
  @Transactional
  public StockCount post(UUID countId) {
    StockCount count = find(countId);
    lockWarehouse(count.getWarehouseId());
    if (count.getStatus() == CountStatus.POSTED) {
      return count;
    }
    List<StockCountLine> all = lines.findByCountId(countId);
    if (all.stream().anyMatch(line -> line.getCountedQuantity() == null)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "COUNT_INCOMPLETE", "Sayılmamış satırlar var.");
    }
    for (StockCountLine line : all) {
      if (line.difference().signum() != 0) {
        postDifference(count, line);
      }
    }
    count.post();
    return count;
  }

  private void postDifference(StockCount count, StockCountLine line) {
    WarehouseBin bin = findBin(line.getBinId());
    StockItem item = items.findById(line.getItemId()).orElseThrow();
    stock.ensureDateOpen(item.getAccountId(), count.getWarehouseId(), count.getCountDate());
    StockBalance balance =
        stock.balanceFor(bin, item, line.getLotNo(), line.getExpiryDate(), line.getCustomsStatus());
    stock.apply(
        MovementType.ADJUSTMENT,
        balance,
        line.difference(),
        new Details(count.getCountDate(), null, count.getId(), null, count.getNumber(), null));
  }

  private StockCount ensureOpen(UUID countId) {
    StockCount count = find(countId);
    if (count.getStatus() != CountStatus.OPEN) {
      throw new BusinessException(HttpStatus.CONFLICT, "COUNT_CLOSED", "Sayım kapatılmış.");
    }
    return count;
  }

  private StockCount find(UUID id) {
    return counts
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "COUNT_NOT_FOUND", "Sayım bulunamadı."));
  }

  private WarehouseBin findBin(UUID id) {
    return bins.findById(id)
        .orElseThrow(
            () -> new BusinessException(HttpStatus.NOT_FOUND, "BIN_NOT_FOUND", "Göz bulunamadı."));
  }

  private void lockWarehouse(UUID id) {
    warehouses
        .findForUpdate(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "WAREHOUSE_NOT_FOUND", "Depo bulunamadı."));
  }
}
