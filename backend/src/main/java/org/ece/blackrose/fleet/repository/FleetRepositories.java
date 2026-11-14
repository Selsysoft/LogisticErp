package org.ece.blackrose.fleet.repository;

import jakarta.persistence.LockModeType;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.fleet.domain.ComplianceDocument;
import org.ece.blackrose.fleet.domain.Driver;
import org.ece.blackrose.fleet.domain.FleetSettings;
import org.ece.blackrose.fleet.domain.FleetTypes.ExpenseKind;
import org.ece.blackrose.fleet.domain.FleetTypes.SubjectType;
import org.ece.blackrose.fleet.domain.ResourceBlock;
import org.ece.blackrose.fleet.domain.Vehicle;
import org.ece.blackrose.fleet.domain.VehicleExpense;
import org.ece.blackrose.organization.BranchFilter;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public final class FleetRepositories {

  private FleetRepositories() {}

  public interface VehicleRepository extends JpaRepository<Vehicle, UUID> {

    Optional<Vehicle> findByPlate(String plate);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from Vehicle v where v.id = :id")
    Optional<Vehicle> findForUpdate(@Param("id") UUID id);

    @Query(
        """
        select v from Vehicle v
        where (:search = '' or lower(v.plate) like concat('%', :search, '%')
               or lower(coalesce(v.brand, '')) like concat('%', :search, '%'))
          and (:allBranches = true or v.branchId is null or v.branchId in :branchIds)
        """)
    Page<Vehicle> search(
        @Param("search") String search,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        Pageable pageable);

    /** Şubesiz araç her kullanıcıya görünür. */
    default Page<Vehicle> search(String search, BranchFilter filter, Pageable pageable) {
      return search(search, filter.allBranches(), filter.branchIds(), pageable);
    }
  }

  public interface DriverRepository extends JpaRepository<Driver, UUID> {

    Optional<Driver> findByCode(String code);

    Optional<Driver> findByUserId(UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from Driver d where d.id = :id")
    Optional<Driver> findForUpdate(@Param("id") UUID id);

    @Query(
        """
        select d from Driver d
        where (:search = '' or lower(d.fullName) like concat('%', :search, '%')
               or lower(d.code) like concat('%', :search, '%'))
          and (:allBranches = true or d.branchId is null or d.branchId in :branchIds)
        """)
    Page<Driver> search(
        @Param("search") String search,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        Pageable pageable);

    /** Şubesiz sürücü her kullanıcıya görünür. */
    default Page<Driver> search(String search, BranchFilter filter, Pageable pageable) {
      return search(search, filter.allBranches(), filter.branchIds(), pageable);
    }
  }

  public interface ComplianceDocumentRepository extends JpaRepository<ComplianceDocument, UUID> {

    List<ComplianceDocument> findBySubjectTypeAndSubjectIdOrderByExpiresOnDesc(
        SubjectType subjectType, UUID subjectId);

    List<ComplianceDocument> findBySubjectTypeAndSubjectIdIn(
        SubjectType subjectType, Collection<UUID> subjectIds);

    /** Her araç/sürücü ve belge türü için son geçerlilik tarihli belge. */
    @Query(
        value =
            """
            select * from (
              select distinct on (subject_type, subject_id, doc_type) *
              from compliance_document
              where deleted = false
              order by subject_type, subject_id, doc_type, expires_on desc
            ) latest
            where expires_on <= :until
            order by expires_on
            """,
        nativeQuery = true)
    List<ComplianceDocument> latestExpiringBy(@Param("until") LocalDate until);
  }

  public interface VehicleExpenseRepository extends JpaRepository<VehicleExpense, UUID> {

    @Query(
        """
        select e from VehicleExpense e
        where (:vehicleId is null or e.vehicleId = :vehicleId)
          and (:kind is null or e.kind = :kind)
          and (:allBranches = true or e.branchId in :branchIds)
        """)
    Page<VehicleExpense> search(
        @Param("vehicleId") UUID vehicleId,
        @Param("kind") ExpenseKind kind,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        Pageable pageable);

    default Page<VehicleExpense> search(
        UUID vehicleId, ExpenseKind kind, BranchFilter filter, Pageable pageable) {
      return search(vehicleId, kind, filter.allBranches(), filter.branchIds(), pageable);
    }

    List<VehicleExpense> findByExpenseDateBetween(LocalDate from, LocalDate to);

    List<VehicleExpense> findByVehicleIdInAndExpenseDateBetween(
        Collection<UUID> vehicleIds, LocalDate from, LocalDate to);

    List<VehicleExpense> findByVehicleIdAndKindOrderByOdometerKmAscExpenseDateAsc(
        UUID vehicleId, ExpenseKind kind);

    /** Her araç için son bakım planı. */
    @Query(
        value =
            """
            select distinct on (vehicle_id) * from vehicle_expense
            where deleted = false and (next_due_date is not null or next_due_km is not null)
            order by vehicle_id, expense_date desc, created_at desc
            """,
        nativeQuery = true)
    List<VehicleExpense> latestMaintenancePlans();
  }

  public interface ResourceBlockRepository extends JpaRepository<ResourceBlock, UUID> {

    List<ResourceBlock> findBySubjectTypeAndSubjectIdOrderByStartDateDesc(
        SubjectType subjectType, UUID subjectId);

    @Query(
        """
        select b from ResourceBlock b
        where b.subjectType = :type and b.startDate <= :end and b.endDate >= :start
        """)
    List<ResourceBlock> overlapping(
        @Param("type") SubjectType type,
        @Param("start") LocalDate start,
        @Param("end") LocalDate end);
  }

  public interface FleetSettingsRepository extends JpaRepository<FleetSettings, Integer> {}
}
