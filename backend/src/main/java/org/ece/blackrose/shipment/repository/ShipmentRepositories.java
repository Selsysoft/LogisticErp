package org.ece.blackrose.shipment.repository;

import jakarta.persistence.LockModeType;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.shipment.domain.FreightInvoice;
import org.ece.blackrose.shipment.domain.ProofOfDelivery;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.domain.ShipmentCargo;
import org.ece.blackrose.shipment.domain.ShipmentDocument;
import org.ece.blackrose.shipment.domain.ShipmentEvent;
import org.ece.blackrose.shipment.domain.ShipmentLeg;
import org.ece.blackrose.shipment.domain.ShipmentTrackingLink;
import org.ece.blackrose.shipment.domain.ShipmentTypes.DocumentStatus;
import org.ece.blackrose.shipment.domain.ShipmentTypes.DocumentType;
import org.ece.blackrose.shipment.domain.ShipmentTypes.InvoiceStatus;
import org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus;
import org.ece.blackrose.shipment.domain.TripCost;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

public final class ShipmentRepositories {

  private ShipmentRepositories() {}

  private static final String ACTIVE =
      "(org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus.QUOTED,"
          + " org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus.PLANNED,"
          + " org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus.LOADED,"
          + " org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus.IN_TRANSIT)";

  public interface ShipmentRepository extends JpaRepository<Shipment, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select s from Shipment s where s.id = :id")
    Optional<Shipment> findForUpdate(@Param("id") UUID id);

    @Query(
        """
        select s from Shipment s
        where (:status is null or s.status = :status)
          and (:search = '' or lower(s.number) like concat('%', :search, '%')
               or lower(s.origin) like concat('%', :search, '%')
               or lower(s.destination) like concat('%', :search, '%'))
          and (:allBranches = true or s.branchId in :branchIds)
        """)
    Page<Shipment> search(
        @Param("status") ShipmentStatus status,
        @Param("search") String search,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        Pageable pageable);

    default Page<Shipment> search(
        ShipmentStatus status, String search, BranchFilter filter, Pageable pageable) {
      return search(status, search, filter.allBranches(), filter.branchIds(), pageable);
    }

    List<Shipment> findByPlannedPickupBetweenOrderByPlannedPickup(Instant from, Instant to);

    long countByStatus(ShipmentStatus status);

    long countByStatusAndBranchIdIn(ShipmentStatus status, Collection<UUID> branchIds);

    /** Sürücünün etabına atandığı etkin seferler ve yakın zamanda teslim edilenler. */
    @Query(
        """
        select s from Shipment s
        where exists (
            select 1 from ShipmentLeg l where l.shipmentId = s.id and l.driverId = :driver)
          and (s.status in :active or (s.status = :delivered and s.updatedAt >= :since))
        order by s.plannedPickup
        """)
    List<Shipment> visibleToDriver(
        @Param("driver") UUID driver,
        @Param("active") Collection<ShipmentStatus> active,
        @Param("delivered") ShipmentStatus delivered,
        @Param("since") Instant since);

    @Query(value = "select nextval('shipment_number_seq')", nativeQuery = true)
    long nextNumber();

    @Query(value = "select nextval('cmr_number_seq')", nativeQuery = true)
    long nextCmrNumber();

    @Query(value = "select nextval('waybill_number_seq')", nativeQuery = true)
    long nextWaybillNumber();
  }

  public interface ShipmentCargoRepository extends JpaRepository<ShipmentCargo, UUID> {

    List<ShipmentCargo> findByShipmentIdOrderByCreatedAt(UUID shipmentId);
  }

  public interface ShipmentLegRepository extends JpaRepository<ShipmentLeg, UUID> {

    List<ShipmentLeg> findByShipmentIdOrderBySequenceNo(UUID shipmentId);

    List<ShipmentLeg> findByShipmentIdIn(Collection<UUID> shipmentIds);

    boolean existsByShipmentIdAndDriverId(UUID shipmentId, UUID driverId);

    /** Aynı anda başka etapta kullanılan kaynağı bulur. Teslim edilen sefer kaynağı bırakır. */
    @Query(
        "select l from ShipmentLeg l, Shipment s where s.id = l.shipmentId and s.status in "
            + ACTIVE
            + " and l.id <> :legId and l.plannedStart < :end and l.plannedEnd > :start"
            + " and (l.vehicleId in :resources or l.trailerId in :resources"
            + " or l.driverId in :resources)")
    List<ShipmentLeg> conflicting(
        @Param("legId") UUID legId,
        @Param("resources") Collection<UUID> resources,
        @Param("start") Instant start,
        @Param("end") Instant end);

    /** Verilen anda aracın bulunduğu, gideri hâlâ yazılabilen sefer etabı. */
    @Query(
        """
        select l from ShipmentLeg l, Shipment s
        where s.id = l.shipmentId
          and s.status not in (
            org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus.CANCELLED,
            org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus.CLOSED)
          and (l.vehicleId = :vehicleId or l.trailerId = :vehicleId)
          and l.plannedStart <= :at and l.plannedEnd >= :at
        """)
    List<ShipmentLeg> billableAt(@Param("vehicleId") UUID vehicleId, @Param("at") Instant at);

    @Query(
        "select l from ShipmentLeg l, Shipment s where s.id = l.shipmentId and s.status in "
            + ACTIVE
            + " and l.plannedStart < :end and l.plannedEnd > :start")
    List<ShipmentLeg> activeBetween(@Param("start") Instant start, @Param("end") Instant end);
  }

  public interface ShipmentEventRepository extends JpaRepository<ShipmentEvent, UUID> {

    List<ShipmentEvent> findByShipmentIdOrderByCreatedAt(UUID shipmentId);
  }

  public interface ShipmentTrackingLinkRepository
      extends JpaRepository<ShipmentTrackingLink, UUID> {

    Optional<ShipmentTrackingLink> findByTokenHash(String tokenHash);

    List<ShipmentTrackingLink> findByShipmentIdAndRevokedAtIsNull(UUID shipmentId);

    /** Görüntüleme sayacı; herkese açık istekte varlık güncellenmez, yarış da olmaz. */
    @Modifying
    @Query(
        "update ShipmentTrackingLink l set l.viewCount = l.viewCount + 1, l.lastViewedAt = :now"
            + " where l.id = :id")
    void markViewed(@Param("id") UUID id, @Param("now") Instant now);
  }

  public interface ProofOfDeliveryRepository extends JpaRepository<ProofOfDelivery, UUID> {

    Optional<ProofOfDelivery> findByShipmentId(UUID shipmentId);
  }

  public interface ShipmentDocumentRepository extends JpaRepository<ShipmentDocument, UUID> {

    List<ShipmentDocument> findByShipmentIdOrderByType(UUID shipmentId);

    Optional<ShipmentDocument> findByShipmentIdAndType(UUID shipmentId, DocumentType type);

    List<ShipmentDocument> findByTypeAndStatus(DocumentType type, DocumentStatus status);
  }

  public interface FreightInvoiceRepository extends JpaRepository<FreightInvoice, UUID> {

    Optional<FreightInvoice> findByShipmentIdAndStatus(UUID shipmentId, InvoiceStatus status);

    List<FreightInvoice> findByStatus(InvoiceStatus status);

    List<FreightInvoice> findByShipmentIdInAndStatus(
        Collection<UUID> shipmentIds, InvoiceStatus status);
  }

  public interface TripCostRepository extends JpaRepository<TripCost, UUID> {

    List<TripCost> findByShipmentIdOrderByCreatedAt(UUID shipmentId);

    List<TripCost> findByShipmentIdIn(Collection<UUID> shipmentIds);

    Optional<TripCost> findByVehicleExpenseId(UUID vehicleExpenseId);

    List<TripCost> findByVehicleExpenseIdIn(Collection<UUID> vehicleExpenseIds);

    Optional<TripCost> findByLegIdAndKind(
        UUID legId, org.ece.blackrose.shipment.domain.ShipmentTypes.CostKind kind);

    /** Etabın verilen türdeki (silinmemiş) giderleri; dolu kiracıda birden çok olabilir (V39). */
    List<TripCost> findByLegIdAndKindOrderByCreatedAt(
        UUID legId, org.ece.blackrose.shipment.domain.ShipmentTypes.CostKind kind);

    /** Silinmiş/ters çevrilmiş dahil (idempotent ters kayıt için). */
    @Query(value = "select * from trip_cost where id = :id", nativeQuery = true)
    Optional<TripCost> findAnyById(@Param("id") UUID id);

    /** Satırı kilitler; silinmiş/ters çevrilmiş dahil. */
    @Query(value = "select * from trip_cost where id = :id for update", nativeQuery = true)
    Optional<TripCost> lockById(@Param("id") UUID id);

    /** Seferde verilen türde ve durumda silinmemiş gider var mı (sefer iptali, Rev 1 F2). */
    boolean existsByShipmentIdAndKindAndStatus(
        UUID shipmentId,
        org.ece.blackrose.shipment.domain.ShipmentTypes.CostKind kind,
        org.ece.blackrose.shipment.domain.ShipmentTypes.TripCostStatus status);
  }

  /**
   * Sevk Nakliye Masrafları okuması (12.7 §3.4): taşerona verilen etaplar ve SUBCONTRACTOR
   * giderleri. Etap başına bir satır (dolu kiracıda aynı etapta iki gider varsa iki satır); maliyet
   * yoksa maliyet alanları null. Firma özeti bu satırlardan serviste toplanır.
   */
  public interface SubcontractQueryRepository extends Repository<ShipmentLeg, UUID> {

    @Query(
        value =
            """
            select s.id as "shipmentId", s.number as "shipmentNumber",
                   s.status as "shipmentStatus", ca.name as "customerName",
                   (select min(sc.description) from shipment_cargo sc
                     where sc.shipment_id = s.id and sc.deleted = false) as "cargoDescription",
                   (select fi.number from freight_invoice fi
                     where fi.shipment_id = s.id and fi.deleted = false
                       and fi.status <> 'CANCELLED'
                     order by fi.invoice_date desc, fi.created_at desc
                     limit 1) as "freightInvoiceNumber",
                   s.branch_id as "branchId", b.name as "branchName",
                   co.short_name as "companyName", l.planned_start as "plannedStart",
                   l.transport_mode as "transportMode", l.id as "legId",
                   l.sequence_no as "legSequenceNo", l.carrier_account_id as "carrierAccountId",
                   a.name as "carrierName", a.code as "carrierCode", a.phone as "carrierPhone",
                   a.city as "carrierCity", a.district as "carrierDistrict",
                   c.id as "costId", c.status as "costStatus", c.amount as "amount",
                   c.currency as "currency", c.vat_amount as "vatAmount",
                   c.withholding_amount as "withholdingAmount",
                   c.deduction_amount as "deductionAmount", c.document_no as "documentNo",
                   c.document_type as "documentType", c.cost_date as "costDate",
                   c.exchange_rate as "exchangeRate", c.description as "description",
                   c.posted_at as "postedAt", t.id as "transactionId",
                   t.transaction_date as "transactionDate",
                   t.description as "transactionDescription"
              from shipment_leg l
              join shipment s on s.id = l.shipment_id
              join branch b on b.id = s.branch_id
              join account a on a.id = l.carrier_account_id
              left join company co on co.id = b.company_id
              left join account ca on ca.id = s.account_id
              left join trip_cost c on c.leg_id = l.id and c.kind = 'SUBCONTRACTOR'
                   and c.deleted = false
              left join account_transaction t on t.source_type = 'TRIP_COST'
                   and t.source_id = c.id and t.deleted = false
             where l.deleted = false and s.deleted = false
               and l.carrier_account_id is not null and s.status <> 'CANCELLED'
               and l.planned_start >= :since
               and (:allCompanies = true or b.company_id = :companyId)
               and (:allBranches = true or s.branch_id in (:branchIds))
               and (:allCarriers = true or l.carrier_account_id = :carrierId)
               and (:allLegs = true or l.id = :legId)
             order by l.planned_start desc, s.number, l.sequence_no, c.created_at
            """,
        nativeQuery = true)
    @SuppressWarnings("java:S107")
    List<SubcontractRow> rows(
        @Param("since") Instant since,
        @Param("allCompanies") boolean allCompanies,
        @Param("companyId") UUID companyId,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        @Param("allCarriers") boolean allCarriers,
        @Param("carrierId") UUID carrierId,
        @Param("allLegs") boolean allLegs,
        @Param("legId") UUID legId);

    /** Süzgeçli liste; {@code carrierId}/{@code legId} null ise süzülmez. */
    default List<SubcontractRow> rows(
        Instant since, BranchFilter filter, UUID carrierId, UUID legId) {
      return rows(
          since,
          filter.companyId() == null,
          filter.companyId() == null ? BranchFilter.NONE : filter.companyId(),
          filter.allBranches(),
          filter.branchIds(),
          carrierId == null,
          carrierId == null ? BranchFilter.NONE : carrierId,
          legId == null,
          legId == null ? BranchFilter.NONE : legId);
    }

    /** Giderin seferi (silinmiş dahil); kilit sırası için sefer kilidinden önce okunur. */
    @Query(value = "select shipment_id from trip_cost where id = :id", nativeQuery = true)
    Optional<UUID> shipmentIdOf(@Param("id") UUID costId);

    /**
     * Gidere bağlı açık ödeme planı var mı ({@code FinanceRepositories.OPEN_PLAN} TRIP_COST dalıyla
     * aynı koşul: kapanışta açılan taslak plan hareketle aynı cari, iş yeri, tutar ve açıklamayı
     * taşır).
     */
    @Query(
        value =
            """
            select exists (
              select 1 from account_transaction t
                join payment_plan p on p.account_id = t.account_id
                 and p.branch_id = t.branch_id and p.amount = t.amount
                 and p.currency = t.currency
                 and p.description is not distinct from t.description
               where t.source_type = 'TRIP_COST' and t.source_id = :costId
                 and t.deleted = false and p.purchase_invoice_id is null
                 and p.deleted = false
                 and p.status in ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED'))
            """,
        nativeQuery = true)
    boolean existsOpenPlanForTripCost(@Param("costId") UUID costId);
  }

  /** {@link SubcontractQueryRepository#rows} satırı. */
  public interface SubcontractRow {
    UUID getShipmentId();

    String getShipmentNumber();

    String getShipmentStatus();

    String getCustomerName();

    String getCargoDescription();

    String getFreightInvoiceNumber();

    UUID getBranchId();

    String getBranchName();

    String getCompanyName();

    Instant getPlannedStart();

    String getTransportMode();

    UUID getLegId();

    int getLegSequenceNo();

    UUID getCarrierAccountId();

    String getCarrierName();

    String getCarrierCode();

    String getCarrierPhone();

    String getCarrierCity();

    String getCarrierDistrict();

    UUID getCostId();

    String getCostStatus();

    BigDecimal getAmount();

    String getCurrency();

    BigDecimal getVatAmount();

    BigDecimal getWithholdingAmount();

    BigDecimal getDeductionAmount();

    String getDocumentNo();

    String getDocumentType();

    LocalDate getCostDate();

    BigDecimal getExchangeRate();

    String getDescription();

    Instant getPostedAt();

    UUID getTransactionId();

    LocalDate getTransactionDate();

    String getTransactionDescription();
  }
}
