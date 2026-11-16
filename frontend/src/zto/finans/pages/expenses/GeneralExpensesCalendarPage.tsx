import { CSSProperties, Suspense, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useCan } from "../../../../pages/finance/common";
import { useExpenseCalendar, useExpenseMonthly } from "../../../../pages/finance/expenseApi";
import type { ExpenseCalendarEntry, ExpenseCurrencyTotal } from "../../../../pages/finance/types";
import { ZtoBranchSelect, ZtoChartLazy } from "../../../components";
import { generalExpensesPath, newExpensePath } from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import {
  CHART_COLORS,
  TR_MONTHS,
  WEEKDAY_HEADERS,
  buildMonthGrid,
  dayAriaLabel,
  entriesByDay,
  entryTotals,
  fillMonths,
  groupDayEntries,
  lastMonthKeys,
  longDate,
  monthTitle,
  yearOptions,
} from "./expenseCalendarLogic";
import { formatIsoDate, isoParts, localToday, shiftMonth } from "./expenseDates";
import { branchIdsOf, isPositive, moneyText } from "./expenseListLogic";
import { ExpenseTabs, ExpenseTopPanel } from "./GeneralExpensesPage";
import { InvoiceDetailsModal } from "./InvoiceDetailsModal";

const WEEKDAY_HEAD: CSSProperties = { color: "white", background: "#007bff" };
const SELECT_WIDTH: CSSProperties = { width: 150 };
const DATE_BADGE: CSSProperties = { padding: "6px 10px", fontSize: 11 };
const PAD6: CSSProperties = { padding: 6 };
const BIG_BADGE: CSSProperties = { fontSize: "100%" };
const ENTRY_BUTTON: CSSProperties = {
  background: "none",
  border: 0,
  padding: 0,
  textAlign: "left",
  width: "100%",
};
const MONTHS = 6;

type Picked = { id: string; invoiceNumber: string | null } | null;

function totalsText(totals: ExpenseCurrencyTotal[]): string {
  return totals.length
    ? totals.map((total) => moneyText(total.totalAmount, total.currency)).join(" + ")
    : moneyText("0", "TRY");
}

/**
 * Genel Masraflar takvimi (ZTO Views/ProductionExpenses/Index.cshtml:483-1099; 12.7_TASARIM §5.5).
 * Pazartesi başlangıçlı ay ızgarası (salt dizge tarihler), seçili günün "Tür - Kategori" kartları,
 * tüm zamanlar toplamı (para birimi başına satır) ve son 6 ayın ₺ karşılığı yığılı grafiği. Kayıt
 * rozeti Fatura Detayları modalını açar. ZTO'nun gizli "Raporla" ve gün silme düğmeleri taşınmadı.
 */
export function GeneralExpensesCalendarPage() {
  useZtoRootClass("zto-page-expense-calendar");
  const { t } = useTranslation("ztoFinans");
  const k = (key: string, options?: Record<string, unknown>) =>
    t(`expenses.calendar.${key}`, options);
  const canManage = useCan("FINANCE_MANAGE");
  const today = localToday();
  const todayParts = isoParts(today) ?? { year: 2026, month: 1, day: 1 };
  const [view, setView] = useState({ year: todayParts.year, month: todayParts.month });
  const [selected, setSelected] = useState(today);
  const [branchId, setBranchId] = useState("");
  const [picked, setPicked] = useState<Picked>(null);
  const branchIds = branchIdsOf(branchId);

  const calendar = useExpenseCalendar({ year: view.year, month: view.month, branchIds });
  const monthly = useExpenseMonthly({ months: MONTHS, branchIds });
  const byDay = useMemo(() => entriesByDay(calendar.data), [calendar.data]);
  const grid = useMemo(() => buildMonthGrid(view.year, view.month), [view]);
  const dayEntries = useMemo<ExpenseCalendarEntry[]>(
    () => byDay.get(selected) ?? [],
    [byDay, selected],
  );
  const groups = useMemo(() => groupDayEntries(dayEntries), [dayEntries]);
  const dayTotals = useMemo(() => entryTotals(dayEntries), [dayEntries]);
  const allTime = calendar.data?.allTime ?? [];
  const chart = useMemo(
    () => fillMonths(monthly.data ?? [], lastMonthKeys(today, MONTHS)),
    [monthly.data, today],
  );
  const chartData = useMemo(
    () => ({
      labels: chart.labels,
      datasets: chart.series.map((series, index) => ({
        label: series.label,
        data: series.data,
        backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
        borderWidth: 1,
        borderRadius: 4,
      })),
    }),
    [chart],
  );

  const move = (delta: number) =>
    setView((current) => shiftMonth(current.year, current.month, delta));

  return (
    <div className="col-md-12">
      <br />
      <ExpenseTopPanel title={k("title")} icon="fas fa-calculator" branchId={branchId} />
      <ExpenseTabs />
      <br />
      <div className="pe-toolbar">
        <div className="pe-toolbar-left">
          <div className="pe-legend-mini">
            <span className="legend-square orange-square" aria-hidden="true" />
            {k("legendHasData")}
          </div>
          <div className="pe-legend-mini">
            <span className="legend-square green-square" aria-hidden="true" />
            {k("legendToday")}
          </div>
          <div className="pe-legend-mini">
            <span className="legend-square blue-border-square" aria-hidden="true" />
            {k("legendSelected")}
          </div>
          <ZtoBranchSelect
            id="workPlaceFilterPE"
            className="pe-filter-select no-select2"
            value={branchId}
            allowAll
            onChange={setBranchId}
          />
        </div>
        <div className="pe-toolbar-right">
          {canManage && (
            <Link to={newExpensePath()} className="pe-btn pe-btn-success" title={k("newExpense")}>
              <i className="fas fa-plus" aria-hidden="true" /> {k("newExpense")}
            </Link>
          )}
          <Link
            to={generalExpensesPath()}
            className="pe-btn pe-btn-primary"
            title={k("listViewTitle")}
          >
            <i className="fas fa-list" aria-hidden="true" /> {k("listView")}
          </Link>
        </div>
      </div>

      <div className="card mt-2 pe-card pe-calendar-compact calendar-container">
        <div className="card-body">
          {calendar.isError && (
            <div className="alert alert-danger" role="alert">
              {k("loadFailed")} {calendar.error.message}
            </div>
          )}
          <div className="calendar-header">
            <div className="calendar-title" aria-live="polite">
              <i className="far fa-calendar-alt" aria-hidden="true" />{" "}
              {monthTitle(view.year, view.month)}
            </div>
            <div className="calendar-nav">
              <button
                id="prevMonth"
                type="button"
                className="btn btn-primary"
                aria-label={k("prevMonth")}
                onClick={() => move(-1)}
              >
                <i className="fas fa-chevron-left" aria-hidden="true" />
              </button>
              <label className="sr-only" htmlFor="monthSelect">
                {k("month")}
              </label>
              <select
                id="monthSelect"
                className="form-control no-select2"
                style={SELECT_WIDTH}
                value={view.month}
                onChange={(event) => setView({ ...view, month: Number(event.target.value) })}
              >
                {TR_MONTHS.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="yearSelect">
                {k("year")}
              </label>
              <select
                id="yearSelect"
                className="form-control no-select2"
                style={SELECT_WIDTH}
                value={view.year}
                onChange={(event) => setView({ ...view, year: Number(event.target.value) })}
              >
                {yearOptions(todayParts.year).map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
              <button
                id="nextMonth"
                type="button"
                className="btn btn-primary"
                aria-label={k("nextMonth")}
                onClick={() => move(1)}
              >
                <i className="fas fa-chevron-right" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div className="calendar-days">
            {WEEKDAY_HEADERS.map((name) => (
              <div key={name} className="calendar-day text-muted small" style={WEEKDAY_HEAD}>
                {name}
              </div>
            ))}
            {grid.map((cell) => {
              if (cell.kind === "blank") {
                return <div key={cell.key} className="calendar-day other-month" />;
              }
              const count = byDay.get(cell.iso)?.length ?? 0;
              const classes = ["calendar-day"];
              if (cell.weekend) classes.push("weekend");
              if (cell.iso === selected) classes.push("active");
              if (count > 0) classes.push("has-data");
              if (cell.iso === today) classes.push("today");
              return (
                <div
                  key={cell.key}
                  className={classes.join(" ")}
                  data-date={cell.iso}
                  role="button"
                  tabIndex={0}
                  aria-label={dayAriaLabel(cell.iso, count)}
                  aria-current={cell.iso === today ? "date" : undefined}
                  aria-pressed={cell.iso === selected}
                  onClick={() => setSelected(cell.iso)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected(cell.iso);
                    }
                  }}
                >
                  <span className="day-number">{cell.day}</span>
                  {count > 0 && (
                    <>
                      {" "}
                      <i
                        className="fas fa-money-bill-wave text-white small-icon-days"
                        aria-hidden="true"
                      />
                    </>
                  )}
                  {cell.iso === today && (
                    <>
                      {" "}
                      <i
                        className="fas fa-calendar-day text-green small-icon-days"
                        aria-hidden="true"
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card mt-3 pe-card">
        <div className="pe-card-header">
          <h6 className="pe-card-title">
            <i className="fas fa-eye" aria-hidden="true" /> {k("records")}
          </h6>
          <div className="btn-group">
            <div id="badge-date" className="badge badge-primary" style={DATE_BADGE}>
              {longDate(selected)}
            </div>
          </div>
        </div>
        <div className="card-body">
          {groups.map((group) => (
            <div key={group.key} className="category-card2 mb-4" data-date={selected}>
              <div className="category-header d-flex justify-content-between align-items-center bg-light p-2 border rounded">
                <div>
                  <i className="fas fa-calendar-alt" aria-hidden="true" /> {selected}{" "}
                  <span className="badge badge-warning" style={PAD6}>
                    {k("type")}: {group.expenseTypeName}
                  </span>{" "}
                  <span className="badge badge-info" style={PAD6}>
                    {k("category")}: {group.expenseItemName}
                  </span>
                </div>
                <div>
                  <span className="badge badge-success" style={PAD6}>
                    {totalsText(group.totals)} {k("total")}
                  </span>
                </div>
              </div>
              <div className="card-body p-2">
                {group.entries.map((entry) => (
                  <div key={entry.id} className="expense-item border-bottom py-2">
                    <button
                      type="button"
                      style={ENTRY_BUTTON}
                      title={k("openDetails")}
                      onClick={() =>
                        setPicked({ id: entry.id, invoiceNumber: entry.invoiceNumber })
                      }
                    >
                      <div className="expense-text font-weight-bold">
                        <i className="fas fa-receipt text-primary" aria-hidden="true" />{" "}
                        {entry.expenseItemName}
                        <span className="badge badge-info ml-2" style={PAD6}>
                          {moneyText(entry.totalAmount, entry.currency)}
                        </span>
                      </div>
                    </button>
                    <div className="expense-meta mt-2">
                      <div className="expense-meta-item">
                        <i className="fas fa-tags text-secondary" aria-hidden="true" />
                        <span>
                          {k("expenseType")}: <b>{entry.expenseTypeName}</b>
                        </span>
                      </div>
                      <div className="expense-meta-item">
                        <i className="fas fa-tags text-secondary" aria-hidden="true" />
                        <span>
                          {k("expenseCategory")}: <b>{entry.expenseItemName}</b>
                        </span>
                      </div>
                      <div className="expense-meta-item">
                        <i className="fas fa-barcode text-secondary" aria-hidden="true" />
                        <span>
                          {k("context")}:{" "}
                          {entry.contextType === "GENERAL" || !entry.contextLabel
                            ? k("generalExpense")
                            : `${t(`expenses.context.${entry.contextType}`)} - ${entry.contextLabel}`}
                        </span>
                      </div>
                      <div className="expense-meta-item">
                        <i className="fas fa-user-tag text-secondary" aria-hidden="true" />
                        <span>
                          {k("supplier")}: {entry.supplierName || k("none")}
                        </span>
                      </div>
                      <div className="expense-meta-item">
                        <i className="fas fa-building text-secondary" aria-hidden="true" />
                        <span>
                          {k("department")}: {t(`expenses.department.${entry.department}`)}
                        </span>
                      </div>
                      <div className="expense-meta-item">
                        <i className="fas fa-calendar-day text-secondary" aria-hidden="true" />
                        <span>
                          {k("expenseDate")}: {formatIsoDate(entry.invoiceDate)}
                        </span>
                      </div>
                      {entry.invoiceNumber && (
                        <div className="expense-meta-item">
                          <i className="fas fa-hashtag text-secondary" aria-hidden="true" />
                          <span>
                            {k("invoiceNo")}: {entry.invoiceNumber}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <div id="noRecordsMessage" className="text-muted">
              {k("noRecords")}
            </div>
          )}
        </div>
        <div
          className="card-footer bg-light d-flex justify-content-between"
          id="selectedDateTotals"
        >
          <div>
            <i className="fas fa-list-ol" aria-hidden="true" />{" "}
            <strong>{k("selectedCount")}</strong>{" "}
            <span className="badge badge-secondary" style={BIG_BADGE} id="selectedDateCount">
              {dayEntries.length}
            </span>
          </div>
          <div>
            <i className="fas fa-coins" aria-hidden="true" /> <strong>{k("selectedTotal")}</strong>{" "}
            <span className="badge badge-success" style={BIG_BADGE} id="selectedDateTotal">
              {totalsText(dayTotals)}
            </span>
          </div>
        </div>

        <div className="total-amount-card pe-summary-compact mt-3">
          {(allTime.length ? allTime : [null]).map((row, index) => (
            <div
              key={row?.currency ?? index}
              className={index > 0 ? "mt-3 pt-3 border-top" : undefined}
            >
              <div className="row">
                <div className="col-md-6">
                  <h6 className="text-info">
                    <i className="fas fa-file-invoice-dollar" aria-hidden="true" />{" "}
                    {k("allTimeCount")} <span className="amount-highlight">{row?.count ?? 0}</span>
                  </h6>
                </div>
                <div className="col-md-6 text-right">
                  <h6 className="text-danger">
                    <i className="fas fa-money-bill-wave" aria-hidden="true" /> {k("allTimeTotal")}{" "}
                    <span className="amount-highlight">
                      {moneyText(row?.netAmount ?? "0", row?.currency ?? "TRY")}
                    </span>
                  </h6>
                </div>
              </div>
              {row &&
                (isPositive(row.vatAmount) ||
                  isPositive(row.discountAmount) ||
                  isPositive(row.totalAmount)) && (
                  <div className="row mt-3 pt-3 border-top">
                    <div className="col-md-4">
                      <h6 className="text-warning">
                        <i className="fas fa-percentage" aria-hidden="true" /> {k("allTimeVat")}{" "}
                        <span className="amount-highlight">
                          {moneyText(row.vatAmount, row.currency)}
                        </span>
                      </h6>
                    </div>
                    <div className="col-md-4">
                      <h6 className="text-danger">
                        <i className="fas fa-tag" aria-hidden="true" /> {k("allTimeDiscount")}{" "}
                        <span className="amount-highlight">
                          {moneyText(row.discountAmount, row.currency)}
                        </span>
                      </h6>
                    </div>
                    <div className="col-md-4 text-right">
                      <h6 className="text-success">
                        <i className="fas fa-file-invoice-dollar" aria-hidden="true" />{" "}
                        {k("allTimeInvoice")}{" "}
                        <span className="amount-highlight">
                          {moneyText(row.totalAmount, row.currency)}
                        </span>
                      </h6>
                    </div>
                  </div>
                )}
            </div>
          ))}
        </div>
      </div>

      <div className="card mt-3 pe-card">
        <div className="pe-card-header">
          <h6 className="pe-card-title">
            <i className="fas fa-chart-bar" aria-hidden="true" /> {k("chartTitle")}
          </h6>
        </div>
        <div className="card-body">
          <Suspense fallback={null}>
            <ZtoChartLazy
              type="bar"
              data={chartData}
              stacked
              legend="bottom"
              valueFormat={{ currency: "TRY" }}
              ariaLabel={`${k("chartTitle")} (${k("chartAxis")})`}
              emptyText={k("chartEmpty")}
              colorize={false}
              options={{ scales: { y: { title: { display: true, text: k("chartAxis") } } } }}
            />
          </Suspense>
        </div>
      </div>

      <InvoiceDetailsModal
        expenseId={picked?.id ?? null}
        invoiceNumber={picked?.invoiceNumber ?? null}
        onHide={() => setPicked(null)}
      />
    </div>
  );
}
