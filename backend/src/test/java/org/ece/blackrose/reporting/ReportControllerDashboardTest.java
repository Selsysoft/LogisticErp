package org.ece.blackrose.reporting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.customs.repository.CustomsRepositories.TransitDocumentRepository;
import org.ece.blackrose.finance.service.PaymentPlanService;
import org.ece.blackrose.finance.web.FinanceDtos;
import org.ece.blackrose.fleet.service.FleetInsightService;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.reporting.service.DashboardCache;
import org.ece.blackrose.reporting.service.ReportService;
import org.ece.blackrose.reporting.web.ReportController;
import org.ece.blackrose.reporting.web.ReportDtos.DashboardResponse;
import org.ece.blackrose.reporting.web.ReportDtos.PositionRow;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentRepository;
import org.ece.blackrose.tenant.TenantClock;
import org.ece.blackrose.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Pano önbelleğinin controller bağlantısı: kullanıcının iş yeri kapsamı önbellek anahtarına girer,
 * ALL kullanıcının (döviz pozisyonu dolu) panosu aynı kiracıdaki LIMITED kullanıcıya sızmaz ve
 * tersi de olmaz. IT profilinde önbellek süresi 0 olduğundan bu bağlantı burada sınanır.
 */
class ReportControllerDashboardTest {

  private static final LocalDate TODAY = LocalDate.of(2026, 11, 13);
  private static final UUID A1 = UUID.randomUUID();

  private final BranchScopeService scope = mock(BranchScopeService.class);
  private final ReportService reports = mock(ReportService.class);
  private final PaymentPlanService plans = mock(PaymentPlanService.class);
  private final TenantClock clock = mock(TenantClock.class);

  @BeforeEach
  void setUp() {
    TenantContext.set("t1", "tenant_t1");
    SecurityContextHolder.getContext()
        .setAuthentication(
            new TestingAuthenticationToken("kullanici", null, "FINANCE_VIEW", "REPORT_VIEW"));
    FinanceDtos.DashboardResponse summary =
        new FinanceDtos.DashboardResponse(List.of(), List.of(), List.of(), 0, List.of());
    when(clock.today()).thenReturn(TODAY);
    when(plans.dashboard(any(LocalDate.class))).thenReturn(summary);
    when(plans.dashboard(any(LocalDate.class), isNull())).thenReturn(summary);
    when(reports.position())
        .thenReturn(
            List.of(
                new PositionRow(
                    "TRY", null, BigDecimal.TEN, BigDecimal.ONE, BigDecimal.ONE, BigDecimal.TEN)));
  }

  @AfterEach
  void tearDown() {
    SecurityContextHolder.clearContext();
    TenantContext.clear();
  }

  @Test
  void allKullanicininPanosuLimitedKullaniciyaSizmaz() {
    ReportController controller = controller();

    when(scope.allowedOrNull()).thenReturn(null);
    assertThat(controller.dashboard().finance().position()).isNotEmpty();

    when(scope.allowedOrNull()).thenReturn(Set.of(A1));
    DashboardResponse limited = controller.dashboard();
    assertThat(limited.finance().position()).isNull();

    when(scope.allowedOrNull()).thenReturn(null);
    assertThat(controller.dashboard().finance().position()).isNotEmpty();
    verify(reports, times(1)).position();
  }

  @Test
  void limitedKullanicininPanosuAllKullaniciyaSizmaz() {
    ReportController controller = controller();

    when(scope.allowedOrNull()).thenReturn(Set.of(A1));
    assertThat(controller.dashboard().finance().position()).isNull();

    when(scope.allowedOrNull()).thenReturn(null);
    assertThat(controller.dashboard().finance().position()).isNotEmpty();
  }

  private ReportController controller() {
    return new ReportController(
        new DashboardCache(Duration.ofMinutes(1)),
        scope,
        reports,
        plans,
        mock(FleetInsightService.class),
        mock(TransitDocumentRepository.class),
        mock(ShipmentRepository.class),
        clock);
  }
}
