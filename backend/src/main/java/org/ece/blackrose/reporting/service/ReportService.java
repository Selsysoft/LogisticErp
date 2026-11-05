package org.ece.blackrose.reporting.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.reporting.service.ForecastCalculator.Due;
import org.ece.blackrose.reporting.service.ForecastCalculator.OpenInvoice;
import org.ece.blackrose.reporting.web.ReportDtos.DriverRow;
import org.ece.blackrose.reporting.web.ReportDtos.ForecastRow;
import org.ece.blackrose.reporting.web.ReportDtos.KpiReport;
import org.ece.blackrose.reporting.web.ReportDtos.PositionRow;
import org.ece.blackrose.reporting.web.ReportDtos.ProfitGroup;
import org.ece.blackrose.reporting.web.ReportDtos.ProfitReport;
import org.ece.blackrose.reporting.web.ReportDtos.ProfitRow;
import org.ece.blackrose.reporting.web.ReportDtos.SettlementPerformanceRow;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Yönetim raporları. Hesaplar veritabanında yapılır. Gelir, kesilmiş faturanın net TL tutarı;
 * gider, sefere yazılan ve iptal edilmemiş giderdir. Faturalanmamış sefer kârlılığa girmez.
 */
@Service
@Transactional(readOnly = true)
public class ReportService {

  private static final BigDecimal HUNDRED = new BigDecimal("100");
  private static final int MONEY_SCALE = 2;
  private static final int MAX_PERIOD_DAYS = 1830;
  private static final int FORECAST_WEEKS = 12;
  private static final String OWN_FLEET = "Öz filo";
  private static final String SUBCONTRACTOR = "Taşeron";

  /** Dönemdeki kesinleşmiş seferler ve her birinin gelir ve gideri. */
  private static final String BASE =
      """
      with base as (
        select s.id, s.number, s.account_id, s.origin, s.destination,
          coalesce((select fi.net_tl from freight_invoice fi
                    where fi.shipment_id = s.id and fi.status = 'ISSUED' and fi.deleted = false), 0)
            as revenue,
          coalesce((select sum(c.tl_amount) from trip_cost c
                    left join vehicle_expense ve on ve.id = c.vehicle_expense_id
                    where c.shipment_id = s.id and c.deleted = false
                      and (c.vehicle_expense_id is null or ve.deleted = false)), 0) as cost
        from shipment s
        where s.deleted = false and s.status in ('INVOICED', 'CLOSED')
          and s.planned_pickup >= :start and s.planned_pickup < :end %s
      ),
      legs as (
        select b.id, b.revenue, b.cost, l.vehicle_id, l.carrier_account_id,
               count(*) over (partition by b.id) as leg_count
        from base b join shipment_leg l on l.shipment_id = b.id and l.deleted = false
      )
      """;

  private static final Map<ProfitGroup, String> GROUPS =
      Map.of(
          ProfitGroup.SHIPMENT,
          """
          select cast(b.id as varchar) as k, b.number || ' · ' || a.name as label,
                 1 as shipments, b.revenue, b.cost
          from base b join account a on a.id = b.account_id
          """,
          ProfitGroup.CUSTOMER,
          """
          select cast(b.account_id as varchar) as k, a.name as label, count(*) as shipments,
                 sum(b.revenue) as revenue, sum(b.cost) as cost
          from base b join account a on a.id = b.account_id
          group by b.account_id, a.name
          """,
          ProfitGroup.ROUTE,
          """
          select b.origin || ' - ' || b.destination as k, b.origin || ' - ' || b.destination as label,
                 count(*) as shipments, sum(b.revenue) as revenue, sum(b.cost) as cost
          from base b group by b.origin, b.destination
          """,
          ProfitGroup.VEHICLE,
          """
          select coalesce(cast(l.vehicle_id as varchar), cast(l.carrier_account_id as varchar), '-') as k,
                 coalesce(v.plate, 'Taşeron: ' || a.name, 'Atanmamış') as label,
                 count(distinct l.id) as shipments,
                 sum(l.revenue / l.leg_count) as revenue, sum(l.cost / l.leg_count) as cost
          from legs l
          left join vehicle v on v.id = l.vehicle_id
          left join account a on a.id = l.carrier_account_id
          group by 1, 2
          """,
          ProfitGroup.OWNERSHIP,
          """
          select case when l.carrier_account_id is null then 'OWN' else 'CARRIER' end as k,
                 case when l.carrier_account_id is null then '%s' else '%s' end as label,
                 count(distinct l.id) as shipments,
                 sum(l.revenue / l.leg_count) as revenue, sum(l.cost / l.leg_count) as cost
          from legs l group by 1, 2
          """
              .formatted(OWN_FLEET, SUBCONTRACTOR));

  @PersistenceContext private EntityManager entityManager;
  private final TenantClock clock;

  public ReportService(TenantClock clock) {
    this.clock = clock;
  }

  public ProfitReport profitability(
      ProfitGroup group, LocalDate from, LocalDate to, UUID branchId, int page, int size) {
    ensurePeriod(from, to);
    String sql =
        BASE.formatted(branchId == null ? "" : "and s.branch_id = :branch")
            + """
            select q.k, q.label, q.shipments, q.revenue, q.cost,
                   count(*) over () as total_rows,
                   sum(q.revenue) over () as total_revenue,
                   sum(q.cost) over () as total_cost
            from (%s) q
            order by q.revenue desc, q.label
            limit :limit offset :offset
            """
                .formatted(GROUPS.get(group));
    Query query = period(sql, from, to, branchId);
    query.setParameter("limit", size);
    query.setParameter("offset", page * size);
    List<ProfitRow> rows = new ArrayList<>();
    long total = 0;
    BigDecimal totalRevenue = BigDecimal.ZERO;
    BigDecimal totalCost = BigDecimal.ZERO;
    for (Object row : query.getResultList()) {
      Object[] cells = (Object[]) row;
      BigDecimal revenue = money(cells[3]);
      BigDecimal cost = money(cells[4]);
      rows.add(
          new ProfitRow(
              (String) cells[0],
              (String) cells[1],
              ((Number) cells[2]).longValue(),
              revenue,
              cost,
              revenue.subtract(cost),
              percent(revenue.subtract(cost), revenue)));
      total = ((Number) cells[5]).longValue();
      totalRevenue = money(cells[6]);
      totalCost = money(cells[7]);
    }
    BigDecimal margin = totalRevenue.subtract(totalCost);
    return new ProfitReport(
        rows, total, totalRevenue, totalCost, margin, percent(margin, totalRevenue));
  }

  public KpiReport kpi(LocalDate from, LocalDate to, UUID branchId) {
    ensurePeriod(from, to);
    String branch = branchId == null ? "" : "and s.branch_id = :branch";
    String sql =
        """
        select
          count(*) filter (where s.status <> 'CANCELLED') as shipments,
          count(*) filter (where s.status = 'CANCELLED') as cancelled,
          count(*) filter (where s.status in ('DELIVERED', 'INVOICED', 'CLOSED')) as delivered,
          count(*) filter (where s.status in ('DELIVERED', 'INVOICED', 'CLOSED')
                             and p.delivered_at <= s.planned_delivery) as on_time,
          avg(fi.net_tl) as average_freight,
          avg(fill.percent) as average_fill
        from shipment s
        left join proof_of_delivery p on p.shipment_id = s.id
        left join freight_invoice fi
          on fi.shipment_id = s.id and fi.status = 'ISSUED' and fi.deleted = false
        left join lateral (
          select 100 * sum(c.weight_kg) / nullif(max(v.capacity_ton) * 1000, 0) as percent
          from shipment_cargo c, shipment_leg l
          join vehicle v on v.id = l.vehicle_id
          where c.shipment_id = s.id and c.deleted = false
            and l.shipment_id = s.id and l.deleted = false and l.sequence_no = 1
        ) fill on true
        where s.deleted = false and s.planned_pickup >= :start and s.planned_pickup < :end %s
        """
            .formatted(branch);
    Object[] cells = (Object[]) period(sql, from, to, branchId).getSingleResult();
    long delivered = ((Number) cells[2]).longValue();
    long onTime = ((Number) cells[3]).longValue();
    return new KpiReport(
        ((Number) cells[0]).longValue(),
        ((Number) cells[1]).longValue(),
        delivered,
        onTime,
        percent(BigDecimal.valueOf(onTime), BigDecimal.valueOf(delivered)),
        nullableMoney(cells[4]),
        nullableMoney(cells[5]));
  }

  public List<DriverRow> drivers(LocalDate from, LocalDate to, UUID branchId) {
    ensurePeriod(from, to);
    String branch = branchId == null ? "" : "and s.branch_id = :branch";
    String sql =
        """
        select cast(d.id as varchar), d.full_name,
          count(distinct s.id) as shipments,
          count(distinct s.id) filter (where s.status in ('DELIVERED', 'INVOICED', 'CLOSED'))
            as delivered,
          count(distinct s.id) filter (where s.status in ('DELIVERED', 'INVOICED', 'CLOSED')
                                         and p.delivered_at <= s.planned_delivery) as on_time
        from shipment_leg l
        join driver d on d.id = l.driver_id
        join shipment s on s.id = l.shipment_id
        left join proof_of_delivery p on p.shipment_id = s.id
        where l.deleted = false and s.deleted = false and s.status <> 'CANCELLED'
          and s.planned_pickup >= :start and s.planned_pickup < :end %s
        group by d.id, d.full_name
        order by shipments desc, d.full_name
        """
            .formatted(branch);
    List<DriverRow> rows = new ArrayList<>();
    for (Object row : period(sql, from, to, branchId).getResultList()) {
      Object[] cells = (Object[]) row;
      long delivered = ((Number) cells[3]).longValue();
      long onTime = ((Number) cells[4]).longValue();
      rows.add(
          new DriverRow(
              (String) cells[0],
              (String) cells[1],
              ((Number) cells[2]).longValue(),
              delivered,
              onTime,
              percent(BigDecimal.valueOf(onTime), BigDecimal.valueOf(delivered))));
    }
    return rows;
  }

  /** Cari ve banka/kasa bakiyelerinin para birimi kırılımı. */
  public List<PositionRow> position() {
    String sql =
        """
        with balances as (
          select currency,
                 sum(case when direction = 'DEBIT' then amount else -amount end) as balance
          from account_transaction where deleted = false group by account_id, currency
        ),
        cash as (
          select currency, sum(case when direction = 'IN' then amount else -amount end) as cash
          from fund_transaction where deleted = false group by currency
        ),
        accounts as (
          select currency,
                 coalesce(sum(balance) filter (where balance > 0), 0) as receivable,
                 coalesce(-sum(balance) filter (where balance < 0), 0) as payable
          from balances group by currency
        )
        select coalesce(a.currency, c.currency), coalesce(c.cash, 0),
               coalesce(a.receivable, 0), coalesce(a.payable, 0)
        from accounts a full join cash c on c.currency = a.currency
        order by 1
        """;
    List<PositionRow> rows = new ArrayList<>();
    for (Object row : entityManager.createNativeQuery(sql).getResultList()) {
      Object[] cells = (Object[]) row;
      BigDecimal cash = money(cells[1]);
      BigDecimal receivable = money(cells[2]);
      BigDecimal payable = money(cells[3]);
      rows.add(
          new PositionRow(
              String.valueOf(cells[0]).trim(),
              cash,
              receivable,
              payable,
              cash.add(receivable).subtract(payable)));
    }
    return rows;
  }

  public List<ForecastRow> forecast() {
    Map<String, BigDecimal> balances = new HashMap<>();
    for (Object row :
        entityManager
            .createNativeQuery(
                """
                select cast(account_id as varchar), currency,
                       sum(case when direction = 'DEBIT' then amount else -amount end)
                from account_transaction where deleted = false group by account_id, currency
                """)
            .getResultList()) {
      Object[] cells = (Object[]) row;
      balances.put(cells[0] + "|" + String.valueOf(cells[1]).trim(), money(cells[2]));
    }
    List<OpenInvoice> invoices = new ArrayList<>();
    for (Object row :
        entityManager
            .createNativeQuery(
                """
                select cast(account_id as varchar), currency, total_amount, due_date
                from freight_invoice where status = 'ISSUED' and deleted = false
                union all
                select cast(account_id as varchar), currency, total_amount, due_date
                from warehouse_invoice where status = 'ISSUED' and deleted = false
                """)
            .getResultList()) {
      Object[] cells = (Object[]) row;
      invoices.add(
          new OpenInvoice(
              (String) cells[0], String.valueOf(cells[1]).trim(), money(cells[2]), date(cells[3])));
    }
    List<Due> outflows = new ArrayList<>();
    for (Object row :
        entityManager
            .createNativeQuery(
                """
                select currency, amount, due_date from payment_plan
                where deleted = false and status in ('DRAFT', 'PENDING', 'APPROVED')
                """)
            .getResultList()) {
      Object[] cells = (Object[]) row;
      outflows.add(new Due(String.valueOf(cells[0]).trim(), money(cells[1]), date(cells[2])));
    }
    return ForecastCalculator.weekly(
        ForecastCalculator.openReceivables(invoices, balances),
        outflows,
        clock.today(),
        FORECAST_WEEKS);
  }

  public List<SettlementPerformanceRow> settlementPerformance(LocalDate from, LocalDate to) {
    ensurePeriod(from, to);
    Query query =
        entityManager.createNativeQuery(
            """
            select currency,
              coalesce(sum(amount) filter (where type = 'COLLECTION'), 0),
              coalesce(sum(amount) filter (where type = 'PAYMENT'), 0),
              count(*) filter (where type = 'COLLECTION'),
              count(*) filter (where type = 'PAYMENT')
            from settlement
            where deleted = false and status = 'POSTED'
              and settlement_date between :from and :to
            group by currency order by currency
            """);
    query.setParameter("from", from);
    query.setParameter("to", to);
    List<SettlementPerformanceRow> rows = new ArrayList<>();
    for (Object row : query.getResultList()) {
      Object[] cells = (Object[]) row;
      rows.add(
          new SettlementPerformanceRow(
              String.valueOf(cells[0]).trim(),
              money(cells[1]),
              money(cells[2]),
              ((Number) cells[3]).longValue(),
              ((Number) cells[4]).longValue()));
    }
    return rows;
  }

  private Query period(String sql, LocalDate from, LocalDate to, UUID branchId) {
    Query query = entityManager.createNativeQuery(sql);
    query.setParameter("start", clock.startOf(from));
    query.setParameter("end", clock.startOf(to.plusDays(1)));
    if (branchId != null) {
      query.setParameter("branch", branchId);
    }
    return query;
  }

  private static void ensurePeriod(LocalDate from, LocalDate to) {
    if (to.isBefore(from)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "PERIOD_INVALID", "Bitiş tarihi başlangıçtan önce olamaz.");
    }
    if (from.plusDays(MAX_PERIOD_DAYS).isBefore(to)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "PERIOD_TOO_LONG", "Rapor dönemi en çok 5 yıl olabilir.");
    }
  }

  private static LocalDate date(Object value) {
    return value instanceof java.sql.Date sql ? sql.toLocalDate() : (LocalDate) value;
  }

  private static BigDecimal money(Object value) {
    return value == null
        ? BigDecimal.ZERO.setScale(MONEY_SCALE)
        : new BigDecimal(value.toString()).setScale(MONEY_SCALE, RoundingMode.HALF_UP);
  }

  private static BigDecimal nullableMoney(Object value) {
    return value == null ? null : money(value);
  }

  private static BigDecimal percent(BigDecimal part, BigDecimal whole) {
    return whole.signum() == 0
        ? null
        : part.multiply(HUNDRED).divide(whole, MONEY_SCALE, RoundingMode.HALF_UP);
  }
}
