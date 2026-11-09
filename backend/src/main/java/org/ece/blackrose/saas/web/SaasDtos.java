package org.ece.blackrose.saas.web;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.saas.domain.SaasTypes.LimitedResource;
import org.ece.blackrose.saas.domain.SaasTypes.SaasInvoiceStatus;
import org.ece.blackrose.saas.domain.SaasTypes.SubscriptionStatus;
import org.ece.blackrose.saas.domain.SaasTypes.SuspendReason;
import org.ece.blackrose.saas.service.DependencyHealth.Dependency;
import org.ece.blackrose.saas.service.PresenceTracker.Presence;
import org.ece.blackrose.tenant.domain.TenantStatus;

public final class SaasDtos {

  private SaasDtos() {}

  public enum HealthStatus {
    OK,
    DEGRADED,
    CRITICAL
  }

  public record Usage(int users, int vehicles, int shipmentsMonth) {}

  public record LimitUsage(
      LimitedResource resource, int used, Integer limit, boolean warning, boolean reached) {}

  public record SavePlanRequest(
      @NotBlank @Pattern(regexp = "^[A-Z0-9_-]{2,32}$") String code,
      @NotBlank @Size(max = 100) String name,
      @NotNull @DecimalMin("0") BigDecimal monthlyPrice,
      @NotBlank @Pattern(regexp = "^[A-Z]{3}$") String currency,
      @Min(1) Integer maxUsers,
      @Min(1) Integer maxVehicles,
      @Min(1) Integer maxShipmentsMonth,
      boolean active) {}

  public record PlanResponse(
      UUID id,
      String code,
      String name,
      BigDecimal monthlyPrice,
      String currency,
      Integer maxUsers,
      Integer maxVehicles,
      Integer maxShipmentsMonth,
      boolean active) {}

  public record ChangePlanRequest(@NotNull UUID planId) {}

  public record ExtendTrialRequest(@NotNull LocalDate until) {}

  public record CloseTenantRequest(@NotBlank String confirmCode) {}

  public record MarkPaidRequest(
      @NotNull LocalDate date, @NotBlank @Size(max = 200) String reference) {}

  public record InvoiceResponse(
      UUID id,
      UUID tenantId,
      String tenantCode,
      String number,
      String planName,
      LocalDate periodStart,
      LocalDate periodEnd,
      BigDecimal amount,
      String currency,
      SaasInvoiceStatus status,
      LocalDate issuedOn,
      LocalDate dueOn,
      LocalDate paidOn,
      String paymentRef,
      int failedAttempts,
      int reminderCount) {}

  public record TenantOverview(
      UUID id,
      String code,
      String name,
      TenantStatus status,
      UUID planId,
      String planName,
      SubscriptionStatus subscriptionStatus,
      SuspendReason suspendReason,
      LocalDate trialEndsOn,
      LocalDate nextBillingOn,
      List<LimitUsage> limits,
      Presence online,
      long openInvoices) {}

  public record SlowEndpoint(String endpoint, long count, long meanMillis, long maxMillis) {}

  /** İstek sayıları uygulama açıldığından beri birikir. */
  public record HealthResponse(
      HealthStatus status,
      List<String> issues,
      boolean databaseUp,
      long databaseMillis,
      int connectionsActive,
      int connectionsIdle,
      int connectionsWaiting,
      long requests,
      long serverErrors,
      List<SlowEndpoint> slowestEndpoints,
      Map<TenantStatus, Long> tenantsByStatus,
      long onlineActive,
      long onlineIdle,
      long overdueInvoices,
      List<Dependency> dependencies) {}

  /** Firmanın kendi aboneliği. */
  public record MySubscriptionResponse(
      String planName,
      BigDecimal monthlyPrice,
      String currency,
      SubscriptionStatus status,
      LocalDate trialEndsOn,
      LocalDate nextBillingOn,
      List<LimitUsage> limits,
      List<InvoiceResponse> invoices) {}
}
