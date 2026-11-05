package org.ece.blackrose.driverapp.repository;

import java.util.List;
import java.util.UUID;
import org.ece.blackrose.driverapp.domain.DriverEvent;
import org.ece.blackrose.driverapp.domain.DriverExpense;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public final class DriverAppRepositories {

  private DriverAppRepositories() {}

  public interface DriverEventRepository extends JpaRepository<DriverEvent, UUID> {}

  public interface DriverExpenseRepository extends JpaRepository<DriverExpense, UUID> {

    List<DriverExpense> findTop30ByDriverIdOrderByCreatedAtDesc(UUID driverId);

    Page<DriverExpense> findByStatusOrderByCreatedAtDesc(
        DriverExpense.Status status, Pageable pageable);
  }
}
