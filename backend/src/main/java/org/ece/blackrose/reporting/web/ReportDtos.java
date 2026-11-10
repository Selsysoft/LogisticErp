package org.ece.blackrose.reporting.web;

import io.swagger.v3.oas.annotations.media.Schema;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.ece.blackrose.finance.web.FinanceDtos.CurrencyTotal;

public final class ReportDtos {

  private ReportDtos() {}

  /** Kârlılığın gruplama eksenleri. */
  public enum ProfitGroup {
    SHIPMENT,
    CUSTOMER,
    ROUTE,
    VEHICLE,
    OWNERSHIP
  }

  public enum ExportFormat {
    XLSX,
    PDF
  }

  public enum ExportReport {
    PROFITABILITY,
    DRIVERS,
    POSITION,
    FORECAST
  }

  public record ProfitRow(
      String key,
      String label,
      long shipments,
      BigDecimal revenueTl,
      BigDecimal costTl,
      BigDecimal marginTl,
      BigDecimal marginPercent) {}

  public record ProfitReport(
      List<ProfitRow> rows,
      long totalElements,
      BigDecimal revenueTl,
      BigDecimal costTl,
      BigDecimal marginTl,
      BigDecimal marginPercent) {}

  /**
   * Yalnız sistemin gerçekten ölçtüğü göstergeler. Boş km, bekleme süresi ve eksiksiz teslim için
   * veri tutulmadığından burada yoktur.
   */
  public record KpiReport(
      long shipments,
      long cancelled,
      long delivered,
      long onTime,
      BigDecimal onTimePercent,
      BigDecimal averageFreightTl,
      BigDecimal averageFillPercent) {}

  public record DriverRow(
      String driverId,
      String driverName,
      long shipments,
      long delivered,
      long onTime,
      BigDecimal onTimePercent) {}

  public record ForecastRow(
      LocalDate weekStart,
      boolean overdue,
      String currency,
      BigDecimal inflow,
      BigDecimal outflow,
      BigDecimal net) {}

  public record PositionRow(
      String currency,
      BigDecimal cash,
      BigDecimal receivable,
      BigDecimal payable,
      BigDecimal net) {}

  public record SettlementPerformanceRow(
      String currency, BigDecimal collected, BigDecimal paid, long collections, long payments) {}

  public record OperationsWidget(KpiReport lastThirtyDays, long inTransit, long waitingInvoice) {}

  public record FinanceWidget(
      List<CurrencyTotal> overdue,
      List<CurrencyTotal> dueThisWeek,
      long pendingApproval,
      List<PositionRow> position) {}

  public record FleetWidget(long overdueReminders, long upcomingReminders) {}

  public record CustomsWidget(long openTransits, long overdueTransits) {}

  /** Yetkisi olmayan bölüm boş döner; veri sunucudan hiç çıkmaz. */
  @Schema(name = "ReportDashboardResponse")
  public record DashboardResponse(
      OperationsWidget operations,
      FinanceWidget finance,
      FleetWidget fleet,
      CustomsWidget customs) {}
}
