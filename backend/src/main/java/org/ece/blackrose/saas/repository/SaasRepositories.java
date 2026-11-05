package org.ece.blackrose.saas.repository;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.saas.domain.Plan;
import org.ece.blackrose.saas.domain.SaasInvoice;
import org.ece.blackrose.saas.domain.SaasTypes.SaasInvoiceStatus;
import org.ece.blackrose.saas.domain.Subscription;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public final class SaasRepositories {

  private SaasRepositories() {}

  public interface PlanRepository extends JpaRepository<Plan, UUID> {

    Optional<Plan> findByCode(String code);

    List<Plan> findAllByOrderByMonthlyPriceAscCodeAsc();
  }

  public interface SubscriptionRepository extends JpaRepository<Subscription, UUID> {

    Optional<Subscription> findByTenantId(UUID tenantId);
  }

  public interface SaasInvoiceRepository extends JpaRepository<SaasInvoice, UUID> {

    List<SaasInvoice> findByTenantIdAndStatusOrderByDueOnAsc(
        UUID tenantId, SaasInvoiceStatus status);

    Page<SaasInvoice> findByTenantIdOrderByPeriodStartDesc(UUID tenantId, Pageable pageable);

    Page<SaasInvoice> findByStatusInOrderByDueOnDesc(
        Collection<SaasInvoiceStatus> status, Pageable pageable);

    long countByStatusAndDueOnBefore(SaasInvoiceStatus status, LocalDate date);

    long countByTenantIdAndStatus(UUID tenantId, SaasInvoiceStatus status);
  }
}
