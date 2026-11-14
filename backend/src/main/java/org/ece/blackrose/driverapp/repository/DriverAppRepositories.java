package org.ece.blackrose.driverapp.repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.driverapp.domain.DriverEvent;
import org.ece.blackrose.driverapp.domain.DriverExpense;
import org.ece.blackrose.organization.BranchFilter;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public final class DriverAppRepositories {

  private DriverAppRepositories() {}

  public interface DriverEventRepository extends JpaRepository<DriverEvent, UUID> {}

  public interface DriverExpenseRepository extends JpaRepository<DriverExpense, UUID> {

    List<DriverExpense> findTop30ByDriverIdOrderByCreatedAtDesc(UUID driverId);

    Page<DriverExpense> findByStatusOrderByCreatedAtDesc(
        DriverExpense.Status status, Pageable pageable);

    /** Ofis onay listesi; LIMITED kullanıcıda yalnız kapsamdaki seferlerin masrafları. */
    @Query(
        """
        select e from DriverExpense e
        where e.status = :status
          and (:allBranches = true or exists (
                select 1 from Shipment s where s.id = e.shipmentId and s.branchId in :branchIds))
        order by e.createdAt desc
        """)
    Page<DriverExpense> review(
        @Param("status") DriverExpense.Status status,
        @Param("allBranches") boolean allBranches,
        @Param("branchIds") Collection<UUID> branchIds,
        Pageable pageable);

    default Page<DriverExpense> review(
        DriverExpense.Status status, BranchFilter filter, Pageable pageable) {
      return review(status, filter.allBranches(), filter.branchIds(), pageable);
    }
  }
}
