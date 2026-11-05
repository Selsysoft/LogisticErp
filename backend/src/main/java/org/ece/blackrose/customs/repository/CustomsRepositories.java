package org.ece.blackrose.customs.repository;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.customs.domain.BorderCrossing;
import org.ece.blackrose.customs.domain.CustomsDeclaration;
import org.ece.blackrose.customs.domain.DeclarationLine;
import org.ece.blackrose.customs.domain.PermitUsage;
import org.ece.blackrose.customs.domain.RoadPermit;
import org.ece.blackrose.customs.domain.TransitDocument;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public final class CustomsRepositories {

  private CustomsRepositories() {}

  public interface CustomsDeclarationRepository extends JpaRepository<CustomsDeclaration, UUID> {

    List<CustomsDeclaration> findAllByOrderByDeclaredOnDesc();

    @Query(value = "select nextval('customs_declaration_number_seq')", nativeQuery = true)
    long nextNumber();
  }

  public interface DeclarationLineRepository extends JpaRepository<DeclarationLine, UUID> {

    List<DeclarationLine> findByDeclarationIdOrderByCreatedAt(UUID declarationId);

    List<DeclarationLine> findByDeclarationIdIn(List<UUID> declarationIds);
  }

  public interface TransitDocumentRepository extends JpaRepository<TransitDocument, UUID> {

    boolean existsByDocumentNo(String documentNo);

    List<TransitDocument> findAllByOrderByDeadlineAsc();
  }

  public interface RoadPermitRepository extends JpaRepository<RoadPermit, UUID> {

    boolean existsByNumber(String number);

    List<RoadPermit> findAllByOrderByValidToAsc();

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from RoadPermit p where p.id = :id")
    Optional<RoadPermit> findForUpdate(@Param("id") UUID id);
  }

  public interface PermitUsageRepository extends JpaRepository<PermitUsage, UUID> {

    List<PermitUsage> findByPermitIdOrderByUsedOnDesc(UUID permitId);

    boolean existsByPermitIdAndShipmentId(UUID permitId, UUID shipmentId);

    /** İptal edilen seferin kullanımı kotadan düşmez. */
    @Query(
        """
        select count(u) from PermitUsage u, Shipment s
        where s.id = u.shipmentId and u.permitId = :permitId
          and s.status <> org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus.CANCELLED
        """)
    long countActive(@Param("permitId") UUID permitId);
  }

  public interface BorderCrossingRepository extends JpaRepository<BorderCrossing, UUID> {

    List<BorderCrossing> findAllByOrderByCrossedOnDesc();
  }
}
