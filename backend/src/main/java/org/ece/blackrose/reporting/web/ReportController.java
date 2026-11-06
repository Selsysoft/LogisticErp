package org.ece.blackrose.reporting.web;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.customs.domain.CustomsTypes.TransitStatus;
import org.ece.blackrose.customs.repository.CustomsRepositories.TransitDocumentRepository;
import org.ece.blackrose.finance.service.PaymentPlanService;
import org.ece.blackrose.fleet.service.FleetInsightService;
import org.ece.blackrose.reporting.service.DashboardCache;
import org.ece.blackrose.reporting.service.ReportService;
import org.ece.blackrose.reporting.service.TableExporter;
import org.ece.blackrose.reporting.service.TableExporter.Table;
import org.ece.blackrose.reporting.web.ReportDtos.CustomsWidget;
import org.ece.blackrose.reporting.web.ReportDtos.DashboardResponse;
import org.ece.blackrose.reporting.web.ReportDtos.DriverRow;
import org.ece.blackrose.reporting.web.ReportDtos.ExportFormat;
import org.ece.blackrose.reporting.web.ReportDtos.ExportReport;
import org.ece.blackrose.reporting.web.ReportDtos.FinanceWidget;
import org.ece.blackrose.reporting.web.ReportDtos.FleetWidget;
import org.ece.blackrose.reporting.web.ReportDtos.ForecastRow;
import org.ece.blackrose.reporting.web.ReportDtos.KpiReport;
import org.ece.blackrose.reporting.web.ReportDtos.OperationsWidget;
import org.ece.blackrose.reporting.web.ReportDtos.PositionRow;
import org.ece.blackrose.reporting.web.ReportDtos.ProfitGroup;
import org.ece.blackrose.reporting.web.ReportDtos.ProfitReport;
import org.ece.blackrose.reporting.web.ReportDtos.SettlementPerformanceRow;
import org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentRepository;
import org.ece.blackrose.tenant.TenantClock;
import org.ece.blackrose.tenant.TenantContext;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/reports")
public class ReportController {

  private static final String OPERATIONS =
      "hasAuthority('REPORT_VIEW') and hasAuthority('SHIPMENT_VIEW')";
  private static final String FINANCE =
      "hasAuthority('REPORT_VIEW') and hasAuthority('FINANCE_VIEW')";
  private static final String FLEET = "hasAuthority('REPORT_VIEW') and hasAuthority('FLEET_VIEW')";
  private static final String ANY_REPORT = "hasAuthority('REPORT_VIEW')";
  private static final int MAX_PAGE_SIZE = 200;
  private static final int EXPORT_LIMIT = 10_000;
  private static final int DASHBOARD_DAYS = 30;
  private static final MediaType XLSX =
      MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  private final ReportService reports;
  private final PaymentPlanService plans;
  private final FleetInsightService fleet;
  private final TransitDocumentRepository transits;
  private final ShipmentRepository shipments;
  private final TenantClock clock;

  private static final Set<String> DASHBOARD_PERMISSIONS =
      Set.of("SHIPMENT_VIEW", "FINANCE_VIEW", "FLEET_VIEW", "CUSTOMS_VIEW");

  private final DashboardCache dashboardCache;

  public ReportController(
      DashboardCache dashboardCache,
      ReportService reports,
      PaymentPlanService plans,
      FleetInsightService fleet,
      TransitDocumentRepository transits,
      ShipmentRepository shipments,
      TenantClock clock) {
    this.dashboardCache = dashboardCache;
    this.reports = reports;
    this.plans = plans;
    this.fleet = fleet;
    this.transits = transits;
    this.shipments = shipments;
    this.clock = clock;
  }

  @GetMapping("/profitability")
  @PreAuthorize(OPERATIONS)
  ProfitReport profitability(
      @RequestParam ProfitGroup group,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) UUID branchId,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "50") int size) {
    return reports.profitability(
        group, from, to, branchId, Math.max(page, 0), Math.max(1, Math.min(size, MAX_PAGE_SIZE)));
  }

  @GetMapping("/kpi")
  @PreAuthorize(OPERATIONS)
  KpiReport kpi(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) UUID branchId) {
    return reports.kpi(from, to, branchId);
  }

  @GetMapping("/drivers")
  @PreAuthorize(FLEET)
  List<DriverRow> drivers(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) UUID branchId) {
    return reports.drivers(from, to, branchId);
  }

  @GetMapping("/position")
  @PreAuthorize(FINANCE)
  List<PositionRow> position() {
    return reports.position();
  }

  @GetMapping("/forecast")
  @PreAuthorize(FINANCE)
  List<ForecastRow> forecast() {
    return reports.forecast();
  }

  @GetMapping("/settlement-performance")
  @PreAuthorize(FINANCE)
  List<SettlementPerformanceRow> settlementPerformance(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
    return reports.settlementPerformance(from, to);
  }

  /** Her oturum açan kullanıcı çağırır; yalnız yetkili olduğu bölümler dolu döner. */
  @GetMapping("/dashboard")
  @Transactional(readOnly = true)
  public DashboardResponse dashboard() {
    Set<String> widgets = new HashSet<>(authorities());
    widgets.retainAll(DASHBOARD_PERMISSIONS);
    return dashboardCache.get(
        TenantContext.currentCode().orElseThrow(), widgets, () -> buildDashboard(widgets));
  }

  private DashboardResponse buildDashboard(Set<String> authorities) {
    LocalDate today = clock.today();
    OperationsWidget operations = null;
    if (authorities.contains("SHIPMENT_VIEW")) {
      operations =
          new OperationsWidget(
              reports.kpi(today.minusDays(DASHBOARD_DAYS), today, null),
              shipments.countByStatus(ShipmentStatus.IN_TRANSIT),
              shipments.countByStatus(ShipmentStatus.DELIVERED));
    }
    FinanceWidget finance = null;
    if (authorities.contains("FINANCE_VIEW")) {
      var summary = plans.dashboard(today);
      finance =
          new FinanceWidget(
              summary.overdue(),
              summary.dueThisWeek(),
              summary.pendingApproval(),
              reports.position());
    }
    FleetWidget fleetWidget = null;
    if (authorities.contains("FLEET_VIEW")) {
      var reminders = fleet.reminders(today, null);
      long overdue = reminders.stream().filter(reminder -> reminder.overdue()).count();
      fleetWidget = new FleetWidget(overdue, reminders.size() - overdue);
    }
    CustomsWidget customs = null;
    if (authorities.contains("CUSTOMS_VIEW")) {
      var open =
          transits.findAllByOrderByDeadlineAsc().stream()
              .filter(transit -> transit.getStatus() == TransitStatus.OPEN)
              .toList();
      customs =
          new CustomsWidget(
              open.size(),
              open.stream().filter(transit -> transit.getDeadline().isBefore(today)).count());
    }
    return new DashboardResponse(operations, finance, fleetWidget, customs);
  }

  /** Yetki rapor türüne göre içeride denetlenir; tek uç birden çok raporu dışa aktarır. */
  @GetMapping("/export")
  @PreAuthorize(ANY_REPORT)
  ResponseEntity<byte[]> export(
      @RequestParam ExportReport report,
      @RequestParam ExportFormat format,
      @RequestParam(required = false) ProfitGroup group,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) UUID branchId) {
    LocalDate end = to != null ? to : clock.today();
    LocalDate start = from != null ? from : end.minusDays(DASHBOARD_DAYS);
    String subtitle = start + " - " + end;
    Table table =
        switch (report) {
          case PROFITABILITY -> {
            require("SHIPMENT_VIEW");
            ProfitReport data =
                reports.profitability(
                    group != null ? group : ProfitGroup.SHIPMENT,
                    start,
                    end,
                    branchId,
                    0,
                    EXPORT_LIMIT);
            List<List<Object>> rows = new ArrayList<>();
            data.rows()
                .forEach(
                    row ->
                        rows.add(
                            cells(
                                row.label(),
                                row.shipments(),
                                row.revenueTl(),
                                row.costTl(),
                                row.marginTl(),
                                row.marginPercent())));
            rows.add(
                cells(
                    "Toplam",
                    null,
                    data.revenueTl(),
                    data.costTl(),
                    data.marginTl(),
                    data.marginPercent()));
            yield new Table(
                "Kârlılık",
                subtitle,
                List.of("Kırılım", "Sefer", "Gelir (TL)", "Gider (TL)", "Kâr (TL)", "Kâr %"),
                rows);
          }
          case DRIVERS -> {
            require("FLEET_VIEW");
            List<List<Object>> rows = new ArrayList<>();
            reports
                .drivers(start, end, branchId)
                .forEach(
                    row ->
                        rows.add(
                            cells(
                                row.driverName(),
                                row.shipments(),
                                row.delivered(),
                                row.onTime(),
                                row.onTimePercent())));
            yield new Table(
                "Sürücü performansı",
                subtitle,
                List.of("Sürücü", "Sefer", "Teslim", "Zamanında", "Zamanında %"),
                rows);
          }
          case POSITION -> {
            require("FINANCE_VIEW");
            List<List<Object>> rows = new ArrayList<>();
            reports
                .position()
                .forEach(
                    row ->
                        rows.add(
                            cells(
                                row.currency(),
                                row.cash(),
                                row.receivable(),
                                row.payable(),
                                row.net())));
            yield new Table(
                "Döviz pozisyonu",
                clock.today().toString(),
                List.of("Para birimi", "Banka ve kasa", "Alacak", "Borç", "Net"),
                rows);
          }
          case FORECAST -> {
            require("FINANCE_VIEW");
            List<List<Object>> rows = new ArrayList<>();
            reports
                .forecast()
                .forEach(
                    row ->
                        rows.add(
                            cells(
                                row.overdue() ? "Vadesi geçmiş" : row.weekStart().toString(),
                                row.currency(),
                                row.inflow(),
                                row.outflow(),
                                row.net())));
            yield new Table(
                "Nakit öngörüsü",
                clock.today().toString(),
                List.of("Hafta", "Para birimi", "Beklenen giriş", "Planlı çıkış", "Net"),
                rows);
          }
        };
    boolean excel = format == ExportFormat.XLSX;
    byte[] content = excel ? TableExporter.excel(table) : TableExporter.pdf(table);
    String fileName =
        "rapor-" + report.name().toLowerCase(java.util.Locale.ROOT) + (excel ? ".xlsx" : ".pdf");
    return ResponseEntity.ok()
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment()
                .filename(fileName, StandardCharsets.UTF_8)
                .build()
                .toString())
        .contentType(excel ? XLSX : MediaType.APPLICATION_PDF)
        .body(content);
  }

  private static List<Object> cells(Object... values) {
    return new ArrayList<>(java.util.Arrays.asList(values));
  }

  private static void require(String authority) {
    if (!authorities().contains(authority)) {
      throw new BusinessException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Bu rapor için yetkiniz yok.");
    }
  }

  private static Set<String> authorities() {
    return SecurityContextHolder.getContext().getAuthentication().getAuthorities().stream()
        .map(GrantedAuthority::getAuthority)
        .collect(Collectors.toSet());
  }
}
