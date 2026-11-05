package org.ece.blackrose.shipment.repository;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.shipment.domain.FreightInvoice;
import org.ece.blackrose.shipment.domain.ProofOfDelivery;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.domain.ShipmentCargo;
import org.ece.blackrose.shipment.domain.ShipmentDocument;
import org.ece.blackrose.shipment.domain.ShipmentEvent;
import org.ece.blackrose.shipment.domain.ShipmentLeg;
import org.ece.blackrose.shipment.domain.ShipmentTypes.DocumentType;
import org.ece.blackrose.shipment.domain.ShipmentTypes.InvoiceStatus;
import org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus;
import org.ece.blackrose.shipment.domain.TripCost;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
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
        """)
    Page<Shipment> search(
        @Param("status") ShipmentStatus status, @Param("search") String search, Pageable pageable);

    List<Shipment> findByPlannedPickupBetweenOrderByPlannedPickup(Instant from, Instant to);

    @Query(value = "select nextval('shipment_number_seq')", nativeQuery = true)
    long nextNumber();

    @Query(value = "select nextval('cmr_number_seq')", nativeQuery = true)
    long nextCmrNumber();

    @Query(value = "select nextval('waybill_number_seq')", nativeQuery = true)
    long nextWaybillNumber();

    @Query(value = "select nextval('freight_invoice_number_seq')", nativeQuery = true)
    long nextInvoiceNumber();
  }

  public interface ShipmentCargoRepository extends JpaRepository<ShipmentCargo, UUID> {

    List<ShipmentCargo> findByShipmentIdOrderByCreatedAt(UUID shipmentId);
  }

  public interface ShipmentLegRepository extends JpaRepository<ShipmentLeg, UUID> {

    List<ShipmentLeg> findByShipmentIdOrderBySequenceNo(UUID shipmentId);

    List<ShipmentLeg> findByShipmentIdIn(Collection<UUID> shipmentIds);

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

    @Query(
        "select l from ShipmentLeg l, Shipment s where s.id = l.shipmentId and s.status in "
            + ACTIVE
            + " and l.plannedStart < :end and l.plannedEnd > :start")
    List<ShipmentLeg> activeBetween(@Param("start") Instant start, @Param("end") Instant end);
  }

  public interface ShipmentEventRepository extends JpaRepository<ShipmentEvent, UUID> {

    List<ShipmentEvent> findByShipmentIdOrderByCreatedAt(UUID shipmentId);
  }

  public interface ProofOfDeliveryRepository extends JpaRepository<ProofOfDelivery, UUID> {

    Optional<ProofOfDelivery> findByShipmentId(UUID shipmentId);
  }

  public interface ShipmentDocumentRepository extends JpaRepository<ShipmentDocument, UUID> {

    List<ShipmentDocument> findByShipmentIdOrderByType(UUID shipmentId);

    Optional<ShipmentDocument> findByShipmentIdAndType(UUID shipmentId, DocumentType type);
  }

  public interface FreightInvoiceRepository extends JpaRepository<FreightInvoice, UUID> {

    Optional<FreightInvoice> findByShipmentIdAndStatus(UUID shipmentId, InvoiceStatus status);

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
  }
}
