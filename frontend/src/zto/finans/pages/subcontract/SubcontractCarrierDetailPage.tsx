import { createColumnHelper } from "@tanstack/react-table";
import { useMemo, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useCan } from "../../../../pages/finance/common";
import { useSubcontractDetail } from "../../../../pages/operations/subcontractApi";
import type { SubcontractCostRow } from "../../../../pages/operations/types";
import { ZTO_DOM, ZtoDataTable, ZtoTooltip } from "../../../components";
import { accountTransactionsPath, shipmentExpensesPath } from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { formatIsoDate } from "../expenses/expenseDates";
import { DeleteCostModal } from "./DeleteCostModal";
import { salesTruckButtons } from "./exportButtons";
import { ShippingDetailModal } from "./ShippingDetailModal";
import { SubcontractCostModal } from "./SubcontractCostModal";
import { SubcontractFilters } from "./SubcontractFilters";
import {
  TRANSPORT_BADGES,
  compareNatural,
  currencyBreakdown,
  deleteActionOf,
  financeLines,
  financeTotals,
  formatN0,
  parseDays,
  vehicleNo,
  type DeleteAction,
  type FinanceKey,
} from "./subcontractLogic";

const column = createColumnHelper<SubcontractCostRow>();
const LENGTH_MENU = [10, 25, 50, 100, 250, -1];
const HEADER_ROW = {
  margin: 2,
  display: "flex",
  justifyContent: "space-between",
  flexDirection: "row",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 6,
} as const;
const FILTERS = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } as const;
const HEADER_LINK = {
  color: "#ffffff",
  textDecoration: "none",
  fontWeight: 700,
  borderBottom: "1px dashed rgba(255,255,255,0.6)",
  cursor: "pointer",
} as const;
const HEADER_LINK_ICON = { fontSize: 10, marginLeft: 3, opacity: 0.85, color: "#ffffff" } as const;
const DAYS_GROUP = { width: 130 } as const;
const DAYS_ICON = { fontSize: 10 } as const;
const DAYS_INPUT = { fontSize: 10, textAlign: "center" } as const;
const DAYS_SUFFIX = { fontSize: 9 } as const;
const BADGE = { fontSize: 10 } as const;
const FONT_11 = { fontSize: 11 } as const;
const SHOW_BUTTON = {
  background: "linear-gradient(135deg, #17a2b8, #138496)",
  color: "white",
  border: "none",
  fontSize: 11,
  marginRight: 4,
} as const;
const DELETE_BUTTON = { fontSize: 11, marginLeft: 4 } as const;
const TOTAL_ROW = { backgroundColor: "#667eea", color: "white" } as const;
const TOOLTIP_BODY = { textAlign: "left", fontSize: 11 } as const;

type Pending = { row: SubcontractCostRow; action: DeleteAction } | null;

/**
 * Nakliye firması detayı (ZTO Views/SalesTruckExpenses/CompanySalesDetails.cshtml:395-1566;
 * 12.7_TASARIM §5.7 CSD). Taşerona verilen her etap bir satır; "Nakliye Tutarı Düzenle" giderin
 * KDV/tevkifat/kesinti ve belge bilgisini kaydedip cariye işler (Y6). Sil: POSTED → ters kayıt,
 * OPEN → DELETE (Rev 1 F6). Düzenle/Sil SHIPMENT_INVOICE yoksa gizlidir.
 */
export function SubcontractCarrierDetailPage() {
  useZtoRootClass("zto-page-sales-truck-details");
  const { t } = useTranslation("ztoFinans");
  const d = (key: string, options?: Record<string, unknown>) =>
    t(`salesTruckExpenses.detail.${key}`, options);
  const { accountId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const days = parseDays(params.get("days"));
  const branchIds = params.getAll("branchIds");
  const [daysDraft, setDaysDraft] = useState(String(days));
  const [daysFor, setDaysFor] = useState(days);
  if (daysFor !== days) {
    setDaysFor(days);
    setDaysDraft(String(days));
  }
  const detail = useSubcontractDetail(accountId, { days, branchIds });
  const canInvoice = useCan("SHIPMENT_INVOICE");

  const [editing, setEditing] = useState<{ row: SubcontractCostRow | null; show: boolean }>({
    row: null,
    show: false,
  });
  const [viewing, setViewing] = useState<{ row: SubcontractCostRow | null; show: boolean }>({
    row: null,
    show: false,
  });
  const [pending, setPending] = useState<Pending>(null);

  const rows = useMemo(() => detail.data?.rows ?? [], [detail.data]);
  const accountName = detail.data?.accountName ?? "";

  const updateParams = (patch: { days?: number; branchIds?: string[] }) => {
    const next = new URLSearchParams(params);
    if (patch.days !== undefined) next.set("days", String(patch.days));
    if (patch.branchIds !== undefined) {
      next.delete("branchIds");
      for (const id of patch.branchIds) next.append("branchIds", id);
    }
    setParams(next, { replace: true });
  };
  // ZTO `change`: değer odak kaybında ya da Enter'da uygulanır; 1–365 dışı → 150.
  const commitDays = () => {
    const value = parseDays(daysDraft);
    setDaysDraft(String(value));
    if (value !== days) updateParams({ days: value });
  };
  const onDaysKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDays();
    }
  };

  const tooltip = (lines: Array<{ key: FinanceKey; value: string }>) => (
    <div style={TOOLTIP_BODY}>
      {lines.map((line, i) => (
        <span key={line.key}>
          {i > 0 && <br />}
          <b>{d(`finance.${line.key}`)}</b> {line.value}
        </span>
      ))}
    </div>
  );

  const columns = useMemo(
    () => [
      column.accessor((row) => vehicleNo(row), {
        id: "vehicleNo",
        header: d("columns.vehicleNo"),
        cell: ({ getValue }) => <strong>{getValue()}</strong>,
        sortingFn: (a, b) => compareNatural(vehicleNo(a.original), vehicleNo(b.original)),
      }),
      column.accessor((row) => row.customerName ?? "-", {
        id: "customer",
        header: d("columns.customer"),
      }),
      column.accessor((row) => row.cargoDescription ?? "-", {
        id: "batchNo",
        header: d("columns.batchNo"),
      }),
      column.accessor((row) => row.freightInvoiceNumber ?? row.documentNo ?? "-", {
        id: "invoiceNo",
        header: d("columns.invoiceNo"),
      }),
      column.accessor((row) => row.vehiclePlate ?? "-", {
        id: "plate",
        header: d("columns.plate"),
        cell: ({ getValue }) => <span className="plate-badge">{getValue()}</span>,
      }),
      column.accessor((row) => row.trailerPlate ?? "-", {
        id: "trailerPlate",
        header: d("columns.trailerPlate"),
      }),
      column.accessor("branchName", {
        id: "branch",
        header: d("columns.branch"),
        cell: ({ getValue }) =>
          getValue() ? (
            <span>{getValue()}</span>
          ) : (
            <span>
              <i style={{ color: "red" }} className="fas fa-exclamation" aria-hidden="true" /> -
            </span>
          ),
      }),
      column.accessor((row) => row.driverName ?? "", {
        id: "driver",
        header: d("columns.driver"),
        cell: ({ getValue }) => getValue() || <span className="text-muted">-</span>,
      }),
      column.display({
        id: "phone",
        header: d("columns.phone"),
        cell: () => <span className="text-muted">-</span>,
        meta: { exportValue: () => "-" },
      }),
      column.accessor((row) => row.loadingDate ?? "", {
        id: "loadingDate",
        header: d("columns.loadingDate"),
        meta: {
          cellClassName: "text-nowrap",
          exportValue: (row) => formatIsoDate(row.loadingDate),
        },
        cell: ({ getValue }) =>
          getValue() ? formatIsoDate(getValue()) : <span className="text-muted">-</span>,
      }),
      column.accessor((row) => t(`salesTruckExpenses.transportMode.${row.transportMode}`), {
        id: "transportMode",
        header: d("columns.transportMode"),
        cell: ({ row, getValue }) => {
          const badge = TRANSPORT_BADGES[row.original.transportMode] ?? TRANSPORT_BADGES.ROAD;
          return (
            <span className={`badge ${badge.badge}`} style={BADGE}>
              <i className={`fas ${badge.icon}`} aria-hidden="true" /> {getValue()}
            </span>
          );
        },
      }),
      column.accessor((row) => (row.money ? formatN0(row.money.amount, row.money.currency) : "-"), {
        id: "freight",
        header: d("columns.freight"),
        sortingFn: (a, b) =>
          Number(a.original.money?.amount ?? 0) - Number(b.original.money?.amount ?? 0),
      }),
      column.display({
        id: "finance",
        header: d("columns.finance"),
        meta: { cellClassName: "text-center", exportable: false },
        cell: ({ row }) => (
          <ZtoTooltip content={tooltip(financeLines(financeTotals([row.original])))}>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary fin-info-btn"
              style={FONT_11}
            >
              <i className="fas fa-coins text-warning" aria-hidden="true" /> {d("financeButton")}
            </button>
          </ZtoTooltip>
        ),
      }),
      column.display({
        id: "actions",
        header: d("columns.actions"),
        meta: { cellClassName: "text-center", exportable: false },
        cell: ({ row }) => {
          const action = deleteActionOf(row.original);
          return (
            <>
              <button
                type="button"
                className="btn btn-sm btn-info show-shipping-detail-btn"
                title={d("showDetail")}
                aria-label={d("showDetail")}
                style={SHOW_BUTTON}
                onClick={() => setViewing({ row: row.original, show: true })}
              >
                <i className="fas fa-eye text-white" aria-hidden="true" />
              </button>
              {canInvoice && (
                <button
                  type="button"
                  className="btn btn-info btn-sm edit-sales-button"
                  style={FONT_11}
                  title={d("edit")}
                  aria-label={d("edit")}
                  onClick={() => setEditing({ row: row.original, show: true })}
                >
                  <i className="fas fa-edit" aria-hidden="true" />
                </button>
              )}
              {canInvoice && action && (
                <button
                  type="button"
                  className="btn btn-danger btn-sm delete-sales-expense-button"
                  style={DELETE_BUTTON}
                  title={d("delete")}
                  aria-label={d("delete")}
                  onClick={() => setPending({ row: row.original, action })}
                >
                  <i className="fas fa-trash" aria-hidden="true" />
                </button>
              )}
            </>
          );
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- d/tooltip yalnız t'ye bağlı
    [t, canInvoice],
  );

  const totals = financeTotals(rows);

  return (
    <div className="container-fluid main-content">
      <div className="page-header">
        <br />
        <br />
        <div className="mt-3">
          <nav aria-label="breadcrumb">
            <ol className="breadcrumb">
              <li className="breadcrumb-item">
                <Link to={shipmentExpensesPath()} className="text-decoration-none fw-bold">
                  <i className="fas fa-file-invoice-dollar me-2" aria-hidden="true" /> {d("crumb")}
                </Link>
              </li>
              <li className="breadcrumb-item active fw-bold" aria-current="page">
                <i className="fas fa-building me-2" aria-hidden="true" /> {accountName}
              </li>
            </ol>
          </nav>
        </div>
      </div>

      <div className="row g-2 mb-3">
        <div className="col-sm-4">
          <div className="stat-card --blue">
            <div className="stat-label">
              <i className="fas fa-list" aria-hidden="true" /> {d("stats.trips")}
            </div>
            <div className="stat-value">{rows.length}</div>
          </div>
        </div>
        <div className="col-sm-4">
          <div className="stat-card --green">
            <div className="stat-label">
              <i className="fas fa-truck" aria-hidden="true" /> {d("stats.total")}
            </div>
            <div className="stat-value small-val">{currencyBreakdown(detail.data?.netTotals)}</div>
          </div>
        </div>
        <div className="col-sm-4">
          <div className="stat-card --purple">
            <div className="stat-label">
              <i className="fas fa-calendar-alt" aria-hidden="true" /> {d("stats.filter")}
            </div>
            <div className="stat-value">{d("stats.filterValue", { days })}</div>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-xl-12">
          <section className="card custom-card">
            <header className="card-header custom-card-header">
              <div style={HEADER_ROW}>
                <div style={{ alignItems: "center" }}>
                  <h6 style={{ margin: 0, alignItems: "center" }}>
                    <i className="fas fa-chart-line" aria-hidden="true" />{" "}
                    <span>{d("headerPrefix")} </span>
                    {accountId && (
                      <Link
                        to={accountTransactionsPath(accountId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t("salesTruckExpenses.list.accountLinkTitle")}
                        style={HEADER_LINK}
                      >
                        {accountName}
                        <i
                          className="fas fa-external-link-alt"
                          style={HEADER_LINK_ICON}
                          aria-hidden="true"
                        />
                      </Link>
                    )}
                  </h6>
                </div>
                <div style={FILTERS}>
                  <SubcontractFilters
                    suffix="CSD"
                    branchIds={branchIds}
                    onChange={(ids) => updateParams({ branchIds: ids })}
                  />
                  <div className="input-group input-group-sm" style={DAYS_GROUP}>
                    <div className="input-group-prepend">
                      <span className="input-group-text bg-white py-1">
                        <i
                          className="fas fa-calendar-day text-muted"
                          style={DAYS_ICON}
                          aria-hidden="true"
                        />
                      </span>
                    </div>
                    <input
                      type="number"
                      className="form-control py-1"
                      id="daysFilter"
                      min={1}
                      max={365}
                      inputMode="numeric"
                      style={DAYS_INPUT}
                      title={t("salesTruckExpenses.filters.daysTitle")}
                      aria-label={t("salesTruckExpenses.filters.daysLabel")}
                      value={daysDraft}
                      onChange={(event) => setDaysDraft(event.target.value)}
                      onBlur={commitDays}
                      onKeyDown={onDaysKey}
                    />
                    <div className="input-group-append">
                      <span className="input-group-text bg-white py-1" style={DAYS_SUFFIX}>
                        {t("salesTruckExpenses.filters.days")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </header>
            <div className="card-body">
              <div className="table-responsive">
                <ZtoDataTable
                  id="dataTable2"
                  columns={columns}
                  data={rows}
                  getRowId={(row) => row.legId}
                  tableClassName="table table-hover"
                  tableStyle={{ fontSize: 12 }}
                  dom={ZTO_DOM.lengthButtonsFilter}
                  pageLength={100}
                  lengthMenu={LENGTH_MENU}
                  order={[{ id: "vehicleNo", desc: true }]}
                  buttons={salesTruckButtons({
                    copy: t("salesTruckExpenses.buttons.copy"),
                    excel: t("salesTruckExpenses.buttons.excel"),
                    print: t("salesTruckExpenses.buttons.print"),
                    pdf: t("salesTruckExpenses.buttons.pdf"),
                  })}
                  exportTitle={d("exportTitle", { name: accountName })}
                  fileName="sevk-nakliye-masraf-detaylari"
                  exportExcludeLastColumn
                  processing={detail.isFetching}
                  emptyText={
                    detail.isPending ? (
                      d("loading")
                    ) : detail.isError ? (
                      <span className="text-danger">{d("loadFailed")}</span>
                    ) : (
                      d("empty")
                    )
                  }
                  footer={
                    <tr className="total-row" style={TOTAL_ROW}>
                      <td />
                      <td className="total-label" colSpan={1} style={{ textAlign: "center" }}>
                        <i className="fas fa-calculator me-1" aria-hidden="true" /> {d("total")}
                      </td>
                      <td />
                      <td />
                      <td />
                      <td />
                      <td />
                      <td />
                      <td />
                      <td />
                      <td />
                      <td className="total-value" id="totalTransportPrice">
                        {currencyBreakdown(detail.data?.netTotals)}
                      </td>
                      <td className="total-value text-center">
                        <ZtoTooltip content={tooltip(financeLines(totals))}>
                          <button
                            type="button"
                            className="btn btn-sm btn-light fin-info-btn"
                            style={FONT_11}
                          >
                            <i className="fas fa-coins text-warning" aria-hidden="true" />{" "}
                            {d("financeTotalButton")}
                          </button>
                        </ZtoTooltip>
                      </td>
                      <td />
                    </tr>
                  }
                />
              </div>
            </div>
          </section>
        </div>
      </div>

      <SubcontractCostModal
        row={editing.row}
        show={editing.show}
        onHide={() => setEditing((state) => ({ ...state, show: false }))}
        onExited={() => setEditing({ row: null, show: false })}
      />
      <ShippingDetailModal
        row={viewing.row}
        show={viewing.show}
        onHide={() => setViewing((state) => ({ ...state, show: false }))}
        onExited={() => setViewing({ row: null, show: false })}
      />
      <DeleteCostModal pending={pending} onClose={() => setPending(null)} />
    </div>
  );
}
