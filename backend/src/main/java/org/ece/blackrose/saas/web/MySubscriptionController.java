package org.ece.blackrose.saas.web;

import java.util.List;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.saas.domain.Plan;
import org.ece.blackrose.saas.domain.Subscription;
import org.ece.blackrose.saas.repository.SaasRepositories.PlanRepository;
import org.ece.blackrose.saas.repository.SaasRepositories.SaasInvoiceRepository;
import org.ece.blackrose.saas.repository.SaasRepositories.SubscriptionRepository;
import org.ece.blackrose.saas.service.PlanLimitService;
import org.ece.blackrose.saas.web.SaasDtos.InvoiceResponse;
import org.ece.blackrose.saas.web.SaasDtos.MySubscriptionResponse;
import org.ece.blackrose.tenant.TenantContext;
import org.ece.blackrose.tenant.domain.Tenant;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Firma yalnız kendi aboneliğini görür: kimlik, oturumun tenant bağlamından alınır. */
@RestController
public class MySubscriptionController {

  private static final int RECENT_INVOICES = 12;

  private final TenantRepository tenants;
  private final SubscriptionRepository subscriptions;
  private final PlanRepository plans;
  private final SaasInvoiceRepository invoices;
  private final PlanLimitService limits;

  public MySubscriptionController(
      TenantRepository tenants,
      SubscriptionRepository subscriptions,
      PlanRepository plans,
      SaasInvoiceRepository invoices,
      PlanLimitService limits) {
    this.tenants = tenants;
    this.subscriptions = subscriptions;
    this.plans = plans;
    this.invoices = invoices;
    this.limits = limits;
  }

  @GetMapping("/api/v1/subscription")
  @PreAuthorize("hasAuthority('SUBSCRIPTION_VIEW')")
  MySubscriptionResponse mine() {
    Tenant tenant = tenants.findByCode(TenantContext.currentCode().orElseThrow()).orElseThrow();
    Subscription subscription =
        subscriptions
            .findByTenantId(tenant.getId())
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "SUBSCRIPTION_NOT_FOUND", "Abonelik bulunamadı."));
    Plan plan = plans.findById(subscription.getPlanId()).orElseThrow();
    List<InvoiceResponse> recent =
        invoices
            .findByTenantIdOrderByPeriodStartDesc(
                tenant.getId(), PageRequest.of(0, RECENT_INVOICES))
            .stream()
            .map(invoice -> SaasMappers.toResponse(invoice, tenant.getCode()))
            .toList();
    return new MySubscriptionResponse(
        plan.getName(),
        plan.getMonthlyPrice(),
        plan.getCurrency(),
        subscription.getStatus(),
        subscription.getTrialEndsOn(),
        subscription.getNextBillingOn(),
        limits.usageOf(tenant, plan),
        recent);
  }
}
