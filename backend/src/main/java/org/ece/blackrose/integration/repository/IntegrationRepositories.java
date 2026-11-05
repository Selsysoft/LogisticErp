package org.ece.blackrose.integration.repository;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FundTransaction;
import org.ece.blackrose.integration.domain.BankStatementLine;
import org.ece.blackrose.integration.domain.EDocument;
import org.ece.blackrose.integration.domain.EDocumentSettings;
import org.ece.blackrose.integration.domain.Geofence;
import org.ece.blackrose.integration.domain.GeofenceEvent;
import org.ece.blackrose.integration.domain.ImportBatch;
import org.ece.blackrose.integration.domain.ImportRow;
import org.ece.blackrose.integration.domain.IntegrationTypes.EDocumentSource;
import org.ece.blackrose.integration.domain.IntegrationTypes.EDocumentStatus;
import org.ece.blackrose.integration.domain.IntegrationTypes.ImportKind;
import org.ece.blackrose.integration.domain.RouteDistance;
import org.ece.blackrose.integration.domain.VehiclePosition;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public final class IntegrationRepositories {

  private IntegrationRepositories() {}

  public interface EDocumentSettingsRepository extends JpaRepository<EDocumentSettings, Integer> {}

  public interface EDocumentRepository extends JpaRepository<EDocument, UUID> {

    List<EDocument> findAllByOrderByCreatedAtDesc();

    List<EDocument> findByStatus(EDocumentStatus status);

    boolean existsBySourceTypeAndSourceIdAndStatusIn(
        EDocumentSource sourceType, UUID sourceId, Collection<EDocumentStatus> statuses);

    List<EDocument> findByStatusIn(Collection<EDocumentStatus> statuses);
  }

  public interface ImportBatchRepository extends JpaRepository<ImportBatch, UUID> {

    List<ImportBatch> findAllByOrderByCreatedAtDesc();
  }

  public interface ImportRowRepository extends JpaRepository<ImportRow, UUID> {

    List<ImportRow> findByBatchIdOrderByLineNo(UUID batchId);

    boolean existsByKindAndExternalKey(ImportKind kind, String externalKey);
  }

  public interface VehiclePositionRepository extends JpaRepository<VehiclePosition, UUID> {

    boolean existsByVehicleIdAndRecordedAt(UUID vehicleId, Instant recordedAt);

    Optional<VehiclePosition> findFirstByVehicleIdAndRecordedAtBeforeOrderByRecordedAtDesc(
        UUID vehicleId, Instant recordedAt);

    Optional<VehiclePosition> findFirstByVehicleIdOrderByRecordedAtDesc(UUID vehicleId);

    @Query(
        value =
            """
            select distinct on (vehicle_id) * from vehicle_position
            order by vehicle_id, recorded_at desc
            """,
        nativeQuery = true)
    List<VehiclePosition> latestPerVehicle();
  }

  public interface GeofenceRepository extends JpaRepository<Geofence, UUID> {}

  public interface GeofenceEventRepository extends JpaRepository<GeofenceEvent, UUID> {

    List<GeofenceEvent> findAllByOrderByOccurredAtDesc(Pageable pageable);
  }

  public interface BankStatementLineRepository extends JpaRepository<BankStatementLine, UUID> {

    boolean existsByFundAccountIdAndExternalKey(UUID fundAccountId, String externalKey);

    List<BankStatementLine> findByFundAccountIdOrderByLineDateDesc(UUID fundAccountId);

    /** Hiçbir ekstre satırına bağlanmamış hesap hareketleri. */
    @Query(
        """
        select t from FundTransaction t
        where t.fundAccountId = :fundId and t.transactionDate between :from and :to
          and not exists (
            select 1 from BankStatementLine l where l.matchedTransactionId = t.id)
        order by t.transactionDate desc
        """)
    List<FundTransaction> openTransactions(
        @Param("fundId") UUID fundId, @Param("from") LocalDate from, @Param("to") LocalDate to);
  }

  public interface RouteDistanceRepository extends JpaRepository<RouteDistance, UUID> {

    Optional<RouteDistance> findByRouteKey(String routeKey);

    List<RouteDistance> findAllByOrderByOriginAscDestinationAsc();
  }
}
