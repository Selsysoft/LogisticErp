package org.ece.blackrose.warehouse.repository;

import jakarta.persistence.LockModeType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.warehouse.domain.HandlingCharge;
import org.ece.blackrose.warehouse.domain.HandlingRate;
import org.ece.blackrose.warehouse.domain.StockBalance;
import org.ece.blackrose.warehouse.domain.StockCount;
import org.ece.blackrose.warehouse.domain.StockCountLine;
import org.ece.blackrose.warehouse.domain.StockItem;
import org.ece.blackrose.warehouse.domain.StockMovement;
import org.ece.blackrose.warehouse.domain.Warehouse;
import org.ece.blackrose.warehouse.domain.WarehouseBin;
import org.ece.blackrose.warehouse.domain.WarehouseContract;
import org.ece.blackrose.warehouse.domain.WarehouseInvoice;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.CountStatus;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.CustomsStatus;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.HandlingKind;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public final class WarehouseRepositories {

  private WarehouseRepositories() {}

  public interface WarehouseRepository extends JpaRepository<Warehouse, UUID> {

    boolean existsByCode(String code);

    List<Warehouse> findAllByOrderByCode();

    /** Stok, sayım ve fatura işlemleri depo satırını kilitleyerek birbirini bekler. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select w from Warehouse w where w.id = :id")
    Optional<Warehouse> findForUpdate(@Param("id") UUID id);
  }

  public interface WarehouseBinRepository extends JpaRepository<WarehouseBin, UUID> {

    boolean existsByWarehouseIdAndCode(UUID warehouseId, String code);

    List<WarehouseBin> findByWarehouseIdOrderByCode(UUID warehouseId);
  }

  public interface StockItemRepository extends JpaRepository<StockItem, UUID> {

    boolean existsByAccountIdAndSku(UUID accountId, String sku);

    List<StockItem> findAllByOrderBySku();
  }

  public interface StockBalanceRepository extends JpaRepository<StockBalance, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<StockBalance> findByBinIdAndItemIdAndLotNoAndCustomsStatus(
        UUID binId, UUID itemId, String lotNo, CustomsStatus customsStatus);

    List<StockBalance> findByWarehouseIdAndQuantityGreaterThan(
        UUID warehouseId, BigDecimal quantity);

    Optional<StockBalance> findFirstByItemIdAndLotNo(UUID itemId, String lotNo);

    @Query(
        """
        select b from StockBalance b
        where b.quantity > 0
          and (:warehouseId is null or b.warehouseId = :warehouseId)
          and (:accountId is null or b.accountId = :accountId)
          and (cast(:expiresBy as date) is null or b.expiryDate <= :expiresBy)
        """)
    Page<StockBalance> search(
        @Param("warehouseId") UUID warehouseId,
        @Param("accountId") UUID accountId,
        @Param("expiresBy") LocalDate expiresBy,
        Pageable pageable);
  }

  public interface DailyQuantity {
    UUID getItemId();

    LocalDate getMovedOn();

    BigDecimal getQuantity();
  }

  public interface StockMovementRepository extends JpaRepository<StockMovement, UUID> {

    boolean existsByReversesId(UUID reversesId);

    @Query(
        """
        select m from StockMovement m
        where (:warehouseId is null or m.warehouseId = :warehouseId)
          and (:accountId is null or m.accountId = :accountId)
          and (:itemId is null or m.itemId = :itemId)
        """)
    Page<StockMovement> search(
        @Param("warehouseId") UUID warehouseId,
        @Param("accountId") UUID accountId,
        @Param("itemId") UUID itemId,
        Pageable pageable);

    @Query(
        """
        select m.itemId as itemId, m.movedOn as movedOn, sum(m.quantity) as quantity
        from StockMovement m
        where m.accountId = :accountId and m.warehouseId = :warehouseId and m.movedOn <= :to
        group by m.itemId, m.movedOn
        """)
    List<DailyQuantity> dailyQuantities(
        @Param("accountId") UUID accountId,
        @Param("warehouseId") UUID warehouseId,
        @Param("to") LocalDate to);
  }

  public interface StockCountRepository extends JpaRepository<StockCount, UUID> {

    boolean existsByWarehouseIdAndStatus(UUID warehouseId, CountStatus status);

    @Query(value = "select nextval('stock_count_number_seq')", nativeQuery = true)
    long nextNumber();
  }

  public interface StockCountLineRepository extends JpaRepository<StockCountLine, UUID> {

    List<StockCountLine> findByCountId(UUID countId);

    boolean existsByCountIdAndBinIdAndItemIdAndLotNoAndCustomsStatus(
        UUID countId, UUID binId, UUID itemId, String lotNo, CustomsStatus customsStatus);
  }

  public interface WarehouseContractRepository extends JpaRepository<WarehouseContract, UUID> {

    @Query(
        """
        select count(c) > 0 from WarehouseContract c
        where c.accountId = :accountId and c.warehouseId = :warehouseId
          and c.startDate <= :end and c.endDate >= :start
        """)
    boolean overlaps(
        @Param("accountId") UUID accountId,
        @Param("warehouseId") UUID warehouseId,
        @Param("start") LocalDate start,
        @Param("end") LocalDate end);
  }

  public interface HandlingRateRepository extends JpaRepository<HandlingRate, UUID> {

    List<HandlingRate> findByContractId(UUID contractId);

    Optional<HandlingRate> findByContractIdAndKind(UUID contractId, HandlingKind kind);
  }

  public interface HandlingChargeRepository extends JpaRepository<HandlingCharge, UUID> {

    List<HandlingCharge> findByContractIdOrderByChargedOnDesc(UUID contractId);

    List<HandlingCharge> findByContractIdAndInvoiceIdIsNullAndChargedOnBetween(
        UUID contractId, LocalDate from, LocalDate to);

    List<HandlingCharge> findByInvoiceId(UUID invoiceId);
  }

  public interface WarehouseInvoiceRepository extends JpaRepository<WarehouseInvoice, UUID> {

    List<WarehouseInvoice> findByContractIdOrderByPeriodFromDesc(UUID contractId);

    @Query(
        """
        select count(i) > 0 from WarehouseInvoice i
        where i.contractId = :contractId
          and i.status = org.ece.blackrose.warehouse.domain.WarehouseTypes.WarehouseInvoiceStatus.ISSUED
          and i.periodFrom <= :to and i.periodTo >= :from
        """)
    boolean overlaps(
        @Param("contractId") UUID contractId,
        @Param("from") LocalDate from,
        @Param("to") LocalDate to);

    /** Faturalanmış döneme hareket yazılırsa kesilmiş depolama ücreti geçersiz kalır. */
    @Query(
        """
        select count(i) > 0 from WarehouseInvoice i, WarehouseContract c
        where c.id = i.contractId and c.accountId = :accountId and c.warehouseId = :warehouseId
          and i.status = org.ece.blackrose.warehouse.domain.WarehouseTypes.WarehouseInvoiceStatus.ISSUED
          and i.periodFrom <= :date and i.periodTo >= :date
        """)
    boolean covers(
        @Param("accountId") UUID accountId,
        @Param("warehouseId") UUID warehouseId,
        @Param("date") LocalDate date);

    @Query(value = "select nextval('warehouse_invoice_number_seq')", nativeQuery = true)
    long nextNumber();
  }
}
