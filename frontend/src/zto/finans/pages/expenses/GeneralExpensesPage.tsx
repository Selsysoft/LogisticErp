import { createColumnHelper } from "@tanstack/react-table";
import { CSSProperties, Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../../../auth/authStore";
import { useCan } from "../../../../pages/finance/common";
import { useExpenseSummary } from "../../../../pages/finance/expenseApi";
import type { ExpenseCurrencyTotal, ExpenseItemSummary } from "../../../../pages/finance/types";
import { useBranchTree } from "../../../branch/branchTree";
import {
  ZtoBranchSelect,
  ZtoDataTable,
  ZtoTooltip,
  currencySymbol,
  formatN2,
  type ZtoButton,
} from "../../../components";
import {
  expenseCalendarPath,
  expenseItemInvoicesPath,
  generalExpensesPath,
  newExpensePath,
} from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { formatIsoDate } from "./expenseDates";
import {
  branchHeader,
  branchIdsOf,
  branchText,
  currencyClass,
  dateSortKey,
  filterCategoryCards,
  moneyText,
  moneyTextN0,
  resultCountText,
  totalInvoiceCount,
  totalsByCurrency,
  truncateName,
} from "./expenseListLogic";

const column = createColumnHelper<ExpenseItemSummary>();

const INDUSTRY: CSSProperties = { color: "#007bff" };
const BRANCH: CSSProperties = { color: "#0056b3", textDecoration: "none" };
const WORKPLACE: CSSProperties = { color: "#007bff" };
const HEADER_ROW: CSSProperties = {
  margin: 2,
  display: "flex",
  justifyContent: "space-between",
  flexDirection: "row",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
};
const HEADER_TOOLS: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};
const TITLE: CSSProperties = { margin: 0, alignItems: "center" };
const ALIGN_CENTER: CSSProperties = { alignItems: "center" };
const TABLE: CSSProperties = { fontSize: 11 };
const TYPE_BADGE: CSSProperties = { fontSize: 11, padding: "0.4em 0.6em" };
const RIGHT: CSSProperties = { textAlign: "right" };
const RED: CSSProperties = { color: "red" };
const ACTION_GROUP: CSSProperties = { fontSize: 11 };
const ACTION_BUTTON: CSSProperties = { fontSize: 11, padding: "2px 6px" };
const SEARCH_BOX: CSSProperties = { maxWidth: 300 };
const SEARCH_INPUT: CSSProperties = { borderRadius: "0 0.25rem 0.25rem 0" };
const SCROLL: CSSProperties = { overflowX: "auto", whiteSpace: "nowrap", paddingBottom: 10 };
const CARDS: CSSProperties = { gap: 15 };
const CARD: CSSProperties = { width: 300, cursor: "pointer" };
const CARD_LEFT: CSSProperties = { flex: 1, minWidth: 0, maxWidth: 180 };
const CARD_TITLE: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
const CARD_SMALL: CSSProperties = { fontSize: 10 };
const CARD_RIGHT: CSSProperties = { flexShrink: 0, marginLeft: 8, minWidth: 0 };
const CARD_AMOUNT: CSSProperties = { fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" };
const CARD_WRAPPER: CSSProperties = { minWidth: 90 };
const DOTS_CENTER: CSSProperties = { justifyContent: "center" };
const DOTS_END: CSSProperties = { justifyContent: "flex-end", marginTop: 8 };
const RESULT_INFO: CSSProperties = { fontSize: 11 };
const NO_RESULT: CSSProperties = { width: "100%", minHeight: 120 };

/** ZTO DataTables Buttons (IndexExpenses/ExpenseGroupDetails initDataTable). */
export const EXPENSE_EXPORT_BUTTONS: ZtoButton[] = [
  {
    extend: "copy",
    className: "btn btn-grey rounded",
    text: (
      <>
        <i className="fa fa-copy" aria-hidden="true" /> Kopyala
      </>
    ),
  },
  {
    extend: "excel",
    className: "btn btn-green rounded",
    text: (
      <>
        <i className="fa fa-file-excel" aria-hidden="true" /> Excel
      </>
    ),
  },
  {
    extend: "print",
    className: "btn btn-blue rounded",
    text: (
      <>
        <i className="fa fa-print" aria-hidden="true" /> Yazdır
      </>
    ),
  },
  {
    extend: "pdf",
    className: "btn btn-red rounded",
    text: (
      <>
        <i className="fa fa-file-pdf" aria-hidden="true" /> PDF
      </>
    ),
  },
];

const ROTATION_MS = 5000;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  } catch {
    return false;
  }
}

/** ZTO para birimi döngüsü (5 sn); hareket azaltma tercihinde durur. */
export function useRotationTick(enabled: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!enabled || prefersReducedMotion()) return;
    const timer = setInterval(() => setTick((value) => value + 1), ROTATION_MS);
    return () => clearInterval(timer);
  }, [enabled]);
  return tick;
}

/**
 * PEL/PEI üst şeridi (IndexExpenses.cshtml:769-804, Index.cshtml:478-513): başlık, şube/iş yeri
 * başlığı, karşılama. ZTO'daki 👋 ve marka adı alınmadı (ZtoTopPanel kuralı).
 */
export function ExpenseTopPanel({
  title,
  icon,
  branchId,
}: {
  title: string;
  icon: string;
  branchId: string;
}) {
  const { t } = useTranslation("ztoFinans");
  const fullName = useAuthStore((state) => state.me?.fullName ?? "");
  const tree = useBranchTree("mine");
  const header = branchHeader(tree.data, branchId);
  return (
    <div className="row">
      <div className="col-md-7">
        <div className="content">
          <h5>
            <i className={icon} aria-hidden="true" /> <b>{title}</b>
          </h5>
          <hr />
        </div>
      </div>
      <div className="col-md-2">
        <div className="mt-2">
          <div className="d-flex justify-content-between align-items-start">
            <div className="me-3 mr-2">
              <i className="fas fa-industry fa-2x" style={INDUSTRY} aria-hidden="true" />
            </div>
            <div className="text-end flex-grow-1">
              <span className="d-block mb-1 fw-bold" style={BRANCH}>
                <i className="fas fa-map-marker-alt me-1" aria-hidden="true" />{" "}
                {header.groupName || t("expenses.top.allBranches")}
              </span>
              <small className="d-block fw-bold" style={WORKPLACE}>
                <i className="fas fa-globe me-1" aria-hidden="true" />{" "}
                {header.branchName || t("expenses.top.allWorkPlaces")}
              </small>
            </div>
          </div>
          <hr />
        </div>
      </div>
      <div className="col-md-3">
        <div className="welcome">
          <div className="welcome-content">
            {t("expenses.top.hello")}, <b>{fullName}</b>
          </div>
          <div className="welcome-content lower-opacity">{t("expenses.top.welcomeBack")}</div>
        </div>
      </div>
    </div>
  );
}

/** "Takvim Görünümü | Genel Masraf Hesapları" sekmeleri. */
export function ExpenseTabs() {
  const { t } = useTranslation("ztoFinans");
  return (
    <ul className="nav nav-tabs">
      <li className="nav-item">
        <NavLink className="nav-link" to={expenseCalendarPath()} end>
          <i className="fas fa-calendar-alt" aria-hidden="true" /> {t("expenses.list.tabCalendar")}
        </NavLink>
      </li>
      <li className="nav-item">
        <NavLink className="nav-link" to={generalExpensesPath()} end>
          <i className="fas fa-receipt" aria-hidden="true" /> {t("expenses.list.tabList")}
        </NavLink>
      </li>
    </ul>
  );
}

function Dots({ count, active, style }: { count: number; active: number; style?: CSSProperties }) {
  return (
    <div className="currency-dots-container" style={style} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className={`currency-dot${index === active ? " active" : ""}`} />
      ))}
    </div>
  );
}

function TotalsTooltip({ name, totals }: { name: string; totals: ExpenseCurrencyTotal[] }) {
  const { t } = useTranslation("ztoFinans");
  return (
    <div className="text-left">
      <div>
        <i className="fas fa-coins" aria-hidden="true" /> <strong>{name}</strong>
      </div>
      {totals.map((total) => (
        <div key={total.currency}>
          {currencySymbol(total.currency)} {total.currency}:{" "}
          {t("expenses.list.tooltipCountValue", { count: total.count })} ·{" "}
          {moneyText(total.totalAmount, total.currency)}
        </div>
      ))}
    </div>
  );
}

/**
 * Genel Masraf Hesapları listesi (ZTO Views/ProductionExpenses/IndexExpenses.cshtml:762-1297;
 * 12.7_TASARIM §5.5). Kalem bazlı özet (`GET /finance/expenses/summary`); tutarlar para birimi
 * kırılımlı, ₺ ile toplanmaz. "Cari Hesap" = kalem adı, "Cari Kod" = kalem kodu, Vergi No son
 * tedarikçinin maskeli VKN'si (OK-12.7-12).
 */
export function GeneralExpensesPage() {
  useZtoRootClass("zto-page-general-expenses");
  const { t } = useTranslation("ztoFinans");
  const k = (key: string, options?: Record<string, unknown>) => t(`expenses.list.${key}`, options);
  const navigate = useNavigate();
  const canManage = useCan("FINANCE_MANAGE");
  const [branchId, setBranchId] = useState("");
  const [search, setSearch] = useState("");
  const summary = useExpenseSummary({ branchIds: branchIdsOf(branchId) });
  const rows = useMemo(() => summary.data ?? [], [summary.data]);
  const totals = useMemo(() => totalsByCurrency(rows), [rows]);
  const invoiceCount = useMemo(() => totalInvoiceCount(rows), [rows]);
  const cards = useMemo(() => filterCategoryCards(rows, search), [rows, search]);
  const rotating = rows.some((row) => row.totals.length > 1) || totals.length > 1;
  const tick = useRotationTick(rotating);

  const columns = useMemo(() => {
    const c = (key: string) => t(`expenses.list.${key}`);
    return [
      column.accessor("expenseItemName", {
        id: "account",
        header: c("account"),
        cell: ({ getValue }) => <strong>{getValue()}</strong>,
      }),
      column.accessor("expenseItemCode", { id: "code", header: c("accountCode") }),
      column.accessor((row) => row.lastSupplierTaxNumberMasked ?? "-", {
        id: "tax",
        header: c("taxNumber"),
      }),
      column.accessor((row) => row.lastSupplierPhone ?? "", { id: "phone", header: c("phone") }),
      column.accessor((row) => row.lastSupplierCity ?? "", { id: "city", header: c("city") }),
      column.accessor("expenseTypeName", {
        id: "type",
        header: c("expenseType"),
        cell: ({ getValue }) => (
          <span className="badge bg-info text-white" style={TYPE_BADGE}>
            {getValue()}
          </span>
        ),
      }),
      column.accessor((row) => branchText(row.branchNames), {
        id: "branch",
        header: c("workPlace"),
      }),
      column.accessor("invoiceCount", {
        id: "count",
        header: c("invoiceCount"),
        meta: { cellClassName: "text-right" },
        cell: ({ row }) => <CountCell row={row.original} tick={tick} />,
      }),
      column.accessor((row) => row.totals[0]?.totalAmount ?? "0", {
        id: "total",
        header: c("totalAmount"),
        enableSorting: false,
        meta: {
          searchValue: (_value: string, row: ExpenseItemSummary) =>
            row.totals.map((x) => moneyText(x.totalAmount, x.currency)).join(" "),
          exportValue: (row: ExpenseItemSummary) =>
            row.totals.map((x) => moneyText(x.totalAmount, x.currency)).join(" / "),
        },
        cell: ({ row }) => <AmountCell row={row.original} tick={tick} />,
      }),
      column.accessor((row) => dateSortKey(row.lastInvoiceDate), {
        id: "last",
        header: c("lastInvoiceDate"),
        meta: {
          searchValue: (_value: string, row: ExpenseItemSummary) =>
            formatIsoDate(row.lastInvoiceDate),
          exportValue: (row: ExpenseItemSummary) => formatIsoDate(row.lastInvoiceDate),
        },
        cell: ({ row }) => formatIsoDate(row.original.lastInvoiceDate),
      }),
      column.display({
        id: "actions",
        header: c("actions"),
        enableSorting: false,
        meta: { searchable: false, exportable: false },
        cell: ({ row }) => (
          <div className="btn-group" role="group" style={ACTION_GROUP}>
            <Link
              to={expenseItemInvoicesPath(row.original.expenseItemId)}
              className="btn btn-info text-white"
              style={ACTION_BUTTON}
              title={c("viewInvoices")}
            >
              <i className="fas fa-eye" aria-hidden="true" /> {c("viewInvoices")}
            </Link>
          </div>
        ),
      }),
    ];
  }, [t, tick]);

  return (
    <div className="col-md-12">
      <br />
      <ExpenseTopPanel title={k("title")} icon="fas fa-receipt" branchId={branchId} />
      <ExpenseTabs />
      <br />
      <div className="row">
        <div className="col-xl-12">
          <section className="card custom-card">
            <header className="card-header custom-card-header">
              <div style={HEADER_ROW}>
                <div style={ALIGN_CENTER}>
                  <h6 style={TITLE}>
                    <i className="fas fa-list-ul" aria-hidden="true" /> {k("cardTitle")}
                  </h6>
                </div>
                <div style={HEADER_TOOLS}>
                  <ZtoBranchSelect
                    id="workPlaceFilterIE"
                    className="pe-filter-select no-select2"
                    value={branchId}
                    allowAll
                    onChange={setBranchId}
                  />
                  {canManage && (
                    <Link
                      to={newExpensePath()}
                      className="pe-btn pe-btn-success"
                      title={k("newExpenseTitle")}
                    >
                      <i className="fas fa-plus" aria-hidden="true" /> {k("newExpense")}
                    </Link>
                  )}
                  <Link
                    to={expenseCalendarPath()}
                    className="pe-btn pe-btn-primary"
                    title={k("chartViewTitle")}
                  >
                    <i className="fas fa-chart-bar" aria-hidden="true" /> {k("chartView")}
                  </Link>
                </div>
              </div>
            </header>
            <div className="card-body">
              {summary.isError && (
                <div className="alert alert-danger" role="alert">
                  {k("loadFailed")} {summary.error.message}
                </div>
              )}
              <div className="table-responsive">
                <ZtoDataTable
                  id="dataTable2"
                  tableClassName="table table-hover"
                  tableStyle={TABLE}
                  columns={columns}
                  data={rows}
                  getRowId={(row) => row.expenseItemId}
                  order={[{ id: "last", desc: true }]}
                  dom={'<"row"<"col-sm-2"l><"col-sm-4"B><"col-sm-6 text-right"f>>rtip'}
                  lengthMenu={[10, 25, 50, 100, -1]}
                  pageLength={50}
                  buttons={EXPENSE_EXPORT_BUTTONS}
                  exportTitle={k("pdfTitle")}
                  exportExcludeLastColumn
                  processing={summary.isPending}
                />
              </div>
            </div>
          </section>
        </div>
      </div>

      <br />
      <div className="row mb-4">
        <div className="col-md-12">
          <div className="card">
            <div className="card-header bg-info text-white d-flex justify-content-between align-items-center">
              <div>
                <h6 className="mb-0">
                  <i className="fas fa-chart-bar me-2" aria-hidden="true" />
                  {k("summaryTitle")}
                </h6>
              </div>
              <div className="d-flex align-items-center" style={SEARCH_BOX} role="search">
                <div className="input-group input-group-sm">
                  <span className="input-group-text bg-white border-0">
                    <i className="fas fa-search text-info" aria-hidden="true" />
                  </span>
                  <label className="sr-only" htmlFor="categorySearch">
                    {k("searchLabel")}
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-sm border-0"
                    id="categorySearch"
                    placeholder={k("searchPlaceholder")}
                    style={SEARCH_INPUT}
                    autoComplete="off"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <button
                    className="btn btn-light btn-sm border-0"
                    type="button"
                    id="clearSearch"
                    aria-label={k("clearSearch")}
                    onClick={() => {
                      setSearch("");
                      document.getElementById("categorySearch")?.focus();
                    }}
                  >
                    <i className="fas fa-times" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
            <div className="card-body">
              {rows.length > 0 ? (
                <>
                  <div className="horizontal-scroll-container" style={SCROLL}>
                    <div className="d-flex flex-nowrap" style={CARDS} id="categoryCards">
                      {cards.map((row) => (
                        <CategoryCard
                          key={row.expenseItemId}
                          row={row}
                          tick={tick}
                          onOpen={() => navigate(expenseItemInvoicesPath(row.expenseItemId))}
                        />
                      ))}
                      {cards.length === 0 && (
                        <div
                          className="d-flex align-items-center justify-content-center"
                          style={NO_RESULT}
                          id="noResultsMessage"
                        >
                          <div className="text-center">
                            <i className="fas fa-search fa-2x text-muted mb-2" aria-hidden="true" />
                            <p className="text-muted mb-0">
                              {k("noResults", { term: search.trim() })}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div
                    className="mt-2 text-end"
                    id="searchResultInfo"
                    style={{ ...RESULT_INFO, display: search.trim() ? undefined : "none" }}
                    aria-live="polite"
                  >
                    <span id="resultCount" className="text-muted">
                      {search.trim() ? resultCountText(cards.length) : ""}
                    </span>
                  </div>
                  <div className="col-md-12 mt-3">
                    <div className="card bg-dark text-white">
                      <div className="card-body">
                        <div className="row">
                          <div className="col-md-6">
                            <h6 className="mb-0">
                              <i className="fas fa-calculator me-2" aria-hidden="true" />{" "}
                              {k("totalExpense")}
                            </h6>
                            <small>{k("totalInvoiceCount", { count: invoiceCount })}</small>
                          </div>
                          <div className="col-md-6 text-end">
                            {totals.length > 1 ? (
                              <>
                                <div className="card-currency-wrapper">
                                  {totals.map((total, index) => (
                                    <div
                                      key={total.currency}
                                      className={`card-currency-item${index === tick % totals.length ? " active" : ""}`}
                                    >
                                      <h6 className="mb-0">
                                        {moneyText(total.totalAmount, total.currency)}
                                      </h6>
                                      <small>
                                        {k("invoiceCountSmall", { count: total.count })}
                                      </small>
                                    </div>
                                  ))}
                                </div>
                                <Dots
                                  count={totals.length}
                                  active={tick % totals.length}
                                  style={DOTS_END}
                                />
                              </>
                            ) : (
                              totals.length === 1 && (
                                <>
                                  <h6 className="mb-0">
                                    {moneyText(totals[0].totalAmount, totals[0].currency)}
                                  </h6>
                                  <small>{k("allItems")}</small>
                                </>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="col-md-12">
                  <div className="alert alert-info">
                    <i className="fas fa-info-circle me-2" aria-hidden="true" />
                    {k("empty")}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CountCell({ row, tick }: { row: ExpenseItemSummary; tick: number }) {
  if (row.totals.length <= 1) {
    return <span className="badge badge-primary">{row.invoiceCount}</span>;
  }
  const active = tick % row.totals.length;
  return (
    <>
      <div className="currency-rotating-wrapper">
        {row.totals.map((total, index) => (
          <div key={total.currency} className={`currency-item${index === active ? " active" : ""}`}>
            <span className="badge badge-primary">{total.count}</span>
          </div>
        ))}
      </div>
      <Dots count={row.totals.length} active={active} />
    </>
  );
}

function AmountCell({ row, tick }: { row: ExpenseItemSummary; tick: number }) {
  if (row.totals.length === 0) return null;
  if (row.totals.length === 1) {
    const total = row.totals[0];
    return (
      <div style={RIGHT}>
        <strong style={RED}>{moneyText(total.totalAmount, total.currency)}</strong>
      </div>
    );
  }
  const active = tick % row.totals.length;
  return (
    <div style={RIGHT}>
      <div className="currency-rotating-wrapper">
        {row.totals.map((total, index) => (
          <div key={total.currency} className={`currency-item${index === active ? " active" : ""}`}>
            <ZtoTooltip content={<TotalsTooltip name={row.expenseItemName} totals={row.totals} />}>
              <span
                className={`currency-badge-rotating ${currencyClass(total.currency)}`}
                tabIndex={0}
              >
                <strong>{formatN2(total.totalAmount)}</strong>{" "}
                <span>{currencySymbol(total.currency)}</span>
              </span>
            </ZtoTooltip>
          </div>
        ))}
      </div>
      <Dots count={row.totals.length} active={active} />
    </div>
  );
}

function CategoryCard({
  row,
  tick,
  onOpen,
}: {
  row: ExpenseItemSummary;
  tick: number;
  onOpen: () => void;
}) {
  const { t } = useTranslation("ztoFinans");
  const multiple = row.totals.length > 1;
  const active = multiple ? tick % row.totals.length : 0;
  return (
    <div
      className="card summary-card flex-shrink-0 category-card"
      style={CARD}
      role="link"
      tabIndex={0}
      aria-label={`${row.expenseItemName} (${row.expenseItemCode})`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div className="card-body bg-light">
        <div className="d-flex justify-content-between align-items-start">
          <div style={CARD_LEFT}>
            <h6 className="card-title mb-1" style={CARD_TITLE} title={row.expenseItemName}>
              {truncateName(row.expenseItemName)}
            </h6>
            <p className="card-text mb-1" style={CARD_SMALL}>
              <small className="text-muted">{row.expenseItemCode}</small>
            </p>
            <p className="card-text mb-0" style={CARD_SMALL}>
              <small className="text-muted">
                {t("expenses.list.invoiceCountSmall", { count: row.invoiceCount })}
              </small>
            </p>
          </div>
          <div className="text-end" style={CARD_RIGHT}>
            {multiple ? (
              <div className="card-currency-wrapper" style={CARD_WRAPPER}>
                {row.totals.map((total, index) => (
                  <div
                    key={total.currency}
                    className={`card-currency-item${index === active ? " active" : ""}`}
                    style={RIGHT}
                  >
                    <h6 className="mb-0" style={CARD_AMOUNT}>
                      {moneyTextN0(total.totalAmount, total.currency)}
                    </h6>
                  </div>
                ))}
              </div>
            ) : (
              row.totals.map((total) => (
                <Fragment key={total.currency}>
                  <h6 className="mb-0" style={CARD_AMOUNT}>
                    {moneyTextN0(total.totalAmount, total.currency)}
                  </h6>
                </Fragment>
              ))
            )}
          </div>
        </div>
        {multiple && (
          <div className="text-center mt-2">
            <Dots count={row.totals.length} active={active} style={DOTS_CENTER} />
          </div>
        )}
      </div>
    </div>
  );
}
