package org.ece.blackrose.saas.web;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.util.EnumSet;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.repository.IdentityRepositories.AuditLogRepository;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.identity.web.IdentityDtos.AuditLogResponse;
import org.ece.blackrose.identity.web.IdentityMapper;
import org.ece.blackrose.saas.domain.Plan;
import org.ece.blackrose.saas.domain.SaasInvoice;
import org.ece.blackrose.saas.domain.SaasTypes.SaasInvoiceStatus;
import org.ece.blackrose.saas.repository.SaasRepositories.PlanRepository;
import org.ece.blackrose.saas.repository.SaasRepositories.SaasInvoiceRepository;
import org.ece.blackrose.saas.service.BillingService;
import org.ece.blackrose.saas.service.SaasConsoleService;
import org.ece.blackrose.saas.service.SubscriptionService;
import org.ece.blackrose.saas.service.TenantDataExporter;
import org.ece.blackrose.saas.web.SaasDtos.ChangePlanRequest;
import org.ece.blackrose.saas.web.SaasDtos.CloseTenantRequest;
import org.ece.blackrose.saas.web.SaasDtos.ExtendTrialRequest;
import org.ece.blackrose.saas.web.SaasDtos.HealthResponse;
import org.ece.blackrose.saas.web.SaasDtos.InvoiceResponse;
import org.ece.blackrose.saas.web.SaasDtos.MarkPaidRequest;
import org.ece.blackrose.saas.web.SaasDtos.PlanResponse;
import org.ece.blackrose.saas.web.SaasDtos.SavePlanRequest;
import org.ece.blackrose.saas.web.SaasDtos.TenantOverview;
import org.ece.blackrose.tenant.TenantContext;
import org.ece.blackrose.tenant.domain.Tenant;
import org.ece.blackrose.tenant.domain.TenantStatus;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Yalnız SaaS yöneticisi erişir (SecurityConfig). Her çağrı denetim günlüğüne yazılır. */
@RestController
@RequestMapping("/api/v1/admin")
public class AdminSaasController {

  private static final int MAX_INVOICES = 200;

  private final SubscriptionService subscriptions;
  private final BillingService billing;
  private final SaasConsoleService console;
  private final TenantDataExporter exporter;
  private final PlanRepository plans;
  private final SaasInvoiceRepository invoices;
  private final TenantRepository tenants;
  private final AuditLogRepository auditLogs;
  private final AuditService audit;
  private final IdentityMapper identityMapper;

  public AdminSaasController(
      SubscriptionService subscriptions,
      BillingService billing,
      SaasConsoleService console,
      TenantDataExporter exporter,
      PlanRepository plans,
      SaasInvoiceRepository invoices,
      TenantRepository tenants,
      AuditLogRepository auditLogs,
      AuditService audit,
      IdentityMapper identityMapper) {
    this.subscriptions = subscriptions;
    this.billing = billing;
    this.console = console;
    this.exporter = exporter;
    this.plans = plans;
    this.invoices = invoices;
    this.tenants = tenants;
    this.auditLogs = auditLogs;
    this.audit = audit;
    this.identityMapper = identityMapper;
  }

  @GetMapping("/tenants")
  List<TenantOverview> tenants() {
    return console.overview();
  }

  @PostMapping("/tenants/{id}/activate")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void activate(@PathVariable UUID id) {
    subscriptions.activate(id);
  }

  @PutMapping("/tenants/{id}/plan")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void changePlan(@PathVariable UUID id, @Valid @RequestBody ChangePlanRequest request) {
    subscriptions.changePlan(id, request.planId());
  }

  @PostMapping("/tenants/{id}/extend-trial")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void extendTrial(@PathVariable UUID id, @Valid @RequestBody ExtendTrialRequest request) {
    subscriptions.extendTrial(id, request.until());
  }

  @PostMapping("/tenants/{id}/suspend")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void suspend(@PathVariable UUID id) {
    subscriptions.suspend(id);
  }

  @PostMapping("/tenants/{id}/resume")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void resume(@PathVariable UUID id) {
    subscriptions.resume(id);
  }

  @PostMapping("/tenants/{id}/close")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void close(@PathVariable UUID id, @Valid @RequestBody CloseTenantRequest request) {
    subscriptions.close(id, request.confirmCode());
  }

  /** KVKK taşınabilirlik talebi için. Erişim hem yönetici hem firma günlüğüne yazılır. */
  @GetMapping("/tenants/{id}/export")
  void export(@PathVariable UUID id, HttpServletResponse response)
      throws IOException, SQLException {
    Tenant tenant = tenants.findById(id).orElseThrow(AdminSaasController::tenantNotFound);
    if (EnumSet.of(TenantStatus.PROVISIONING, TenantStatus.FAILED).contains(tenant.getStatus())) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "TENANT_NOT_EXPORTABLE", "Firmanın altyapısı hazır değil.");
    }
    audit.record(AuditEvent.TENANT_DATA_EXPORTED, tenant.getCode(), null);
    TenantContext.set(tenant.getCode(), tenant.getSchemaName());
    try {
      audit.record(AuditEvent.TENANT_DATA_EXPORTED, tenant.getCode(), "SaaS yöneticisi");
    } finally {
      TenantContext.clear();
    }
    response.setContentType("application/zip");
    response.setHeader(
        HttpHeaders.CONTENT_DISPOSITION,
        ContentDisposition.attachment()
            .filename(tenant.getCode() + "-veri.zip", StandardCharsets.UTF_8)
            .build()
            .toString());
    exporter.write(tenant, response.getOutputStream());
  }

  @GetMapping("/plans")
  List<PlanResponse> plans() {
    return plans.findAllByOrderByMonthlyPriceAscCodeAsc().stream()
        .map(AdminSaasController::toResponse)
        .toList();
  }

  @PostMapping("/plans")
  @ResponseStatus(HttpStatus.CREATED)
  PlanResponse createPlan(@Valid @RequestBody SavePlanRequest request) {
    return toResponse(subscriptions.savePlan(null, request));
  }

  @PutMapping("/plans/{id}")
  PlanResponse updatePlan(@PathVariable UUID id, @Valid @RequestBody SavePlanRequest request) {
    return toResponse(subscriptions.savePlan(id, request));
  }

  @GetMapping("/invoices")
  List<InvoiceResponse> invoices() {
    return invoices
        .findByStatusInOrderByDueOnDesc(
            EnumSet.allOf(SaasInvoiceStatus.class), PageRequest.of(0, MAX_INVOICES))
        .stream()
        .map(this::toResponse)
        .toList();
  }

  @PostMapping("/invoices/{id}/pay")
  InvoiceResponse pay(@PathVariable UUID id, @Valid @RequestBody MarkPaidRequest request) {
    return toResponse(subscriptions.markPaid(id, request.date(), request.reference()));
  }

  @PostMapping("/invoices/{id}/void")
  InvoiceResponse voidInvoice(@PathVariable UUID id) {
    return toResponse(subscriptions.voidInvoice(id));
  }

  @PostMapping("/billing/run")
  BillingService.RunResult runBilling() {
    return billing.runAll();
  }

  @GetMapping("/health")
  HealthResponse health() {
    return console.health();
  }

  @GetMapping("/audit-logs")
  PageResponse<AuditLogResponse> auditLogs(
      @PageableDefault(size = 50, sort = "createdAt", direction = Sort.Direction.DESC)
          Pageable pageable) {
    return PageResponse.from(auditLogs.findAll(pageable), identityMapper::toResponse);
  }

  private InvoiceResponse toResponse(SaasInvoice invoice) {
    String code = tenants.findById(invoice.getTenantId()).map(Tenant::getCode).orElse(null);
    return SaasMappers.toResponse(invoice, code);
  }

  private static PlanResponse toResponse(Plan plan) {
    return new PlanResponse(
        plan.getId(),
        plan.getCode(),
        plan.getName(),
        plan.getMonthlyPrice(),
        plan.getCurrency(),
        plan.getMaxUsers(),
        plan.getMaxVehicles(),
        plan.getMaxShipmentsMonth(),
        plan.isActive());
  }

  private static BusinessException tenantNotFound() {
    return new BusinessException(HttpStatus.NOT_FOUND, "TENANT_NOT_FOUND", "Firma bulunamadı.");
  }
}
