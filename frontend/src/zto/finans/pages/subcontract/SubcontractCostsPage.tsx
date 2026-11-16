import { createColumnHelper } from "@tanstack/react-table";
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../../../auth/authStore";
import { useActiveCompanyId } from "../../../../auth/companyStore";
import {
  SUBCONTRACT_DAYS_DEFAULT,
  useSubcontractSummary,
} from "../../../../pages/operations/subcontractApi";
import type { SubcontractCarrierRow } from "../../../../pages/operations/types";
import { ZTO_DOM, ZtoDataTable, formatNumber } from "../../../components";
import { accountTransactionsPath, carrierDetailPath } from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { salesTruckButtons } from "./exportButtons";
import { SubcontractFilters } from "./SubcontractFilters";
import { addressOf, currencyBreakdown, formatN0 } from "./subcontractLogic";

type Row = SubcontractCarrierRow & { index: number };

const column = createColumnHelper<Row>();
const LENGTH_MENU = [10, 25, 50, 100, -1];
const HEADER_ROW = {
  margin: 2,
  display: "flex",
  justifyContent: "space-between",
  flexDirection: "row",
  alignItems: "center",
} as const;
const FILTERS = { display: "flex", alignItems: "center", gap: 8 } as const;
const WORKPLACE_HEADER = { textAlign: "right", color: "#007bff" } as const;
const ACCOUNT_LINK = {
  color: "#0d6efd",
  textDecoration: "none",
  fontWeight: 700,
  borderBottom: "1px dashed #0d6efd",
  cursor: "pointer",
} as const;
const LINK_ICON = { fontSize: 10, marginLeft: 4, opacity: 0.75 } as const;
const TOTAL_ROW = { backgroundColor: "#667eea", color: "white" } as const;
const BUTTON_FONT = { fontSize: 11 } as const;

/**
 * Sevk İhracat Nakliye Hesapları (ZTO Views/SalesTruckExpenses/Index.cshtml:216-640; 12.7_TASARIM
 * §5.7 STI). Taşeron firma başına etap sayısı ve net nakliye toplamı (para birimi kırılımlı); süre
 * sabit 150 gün. "Araçlar ve Detaylar" firma detayına (CSD) gider. Okuma SHIPMENT_VIEW.
 */
export function SubcontractCostsPage() {
  useZtoRootClass("zto-page-sales-truck-expenses");
  const { t } = useTranslation("ztoFinans");
  const l = (key: string, options?: Record<string, unknown>) =>
    t(`salesTruckExpenses.list.${key}`, options);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const branchIds = params.getAll("branchIds");
  const summary = useSubcontractSummary({ days: SUBCONTRACT_DAYS_DEFAULT, branchIds });
  const fullName = useAuthStore((state) => state.me?.fullName ?? "");
  const companies = useAuthStore((state) => state.me?.companies);
  const activeCompanyId = useActiveCompanyId();
  const companyName =
    companies?.find((company) => company.id === activeCompanyId)?.shortName ??
    (companies?.length === 1 ? companies[0].shortName : undefined) ??
    fullName;

  const rows = useMemo<Row[]>(
    () => (summary.data?.carriers ?? []).map((carrier, i) => ({ ...carrier, index: i + 1 })),
    [summary.data],
  );

  const columns = useMemo(
    () => [
      column.accessor("index", { id: "index", header: l("columns.index") }),
      column.accessor("accountName", {
        id: "carrier",
        header: l("columns.carrier"),
        cell: ({ row }) => (
          <Link
            to={accountTransactionsPath(row.original.accountId)}
            target="_blank"
            rel="noopener noreferrer"
            title={l("accountLinkTitle")}
            style={ACCOUNT_LINK}
          >
            <b>{row.original.accountName}</b>
            <i className="fas fa-external-link-alt" style={LINK_ICON} aria-hidden="true" />
          </Link>
        ),
      }),
      column.accessor((row) => row.companyNames ?? "", {
        id: "company",
        header: l("columns.company"),
        cell: ({ getValue }) => getValue() || <span className="text-muted">-</span>,
      }),
      column.accessor((row) => row.phone ?? "", {
        id: "contact",
        header: l("columns.contact"),
        cell: ({ getValue }) =>
          getValue() ? (
            <div>
              <i className="fas fa-phone" aria-hidden="true" /> {getValue()}
            </div>
          ) : (
            <span className="text-muted">-</span>
          ),
      }),
      column.accessor((row) => addressOf(row.city, row.district) ?? "", {
        id: "address",
        header: l("columns.address"),
        cell: ({ getValue }) =>
          getValue() ? (
            <span title={getValue()}>{getValue()}</span>
          ) : (
            <span className="text-muted">-</span>
          ),
      }),
      column.accessor("legCount", { id: "legCount", header: l("columns.legCount") }),
      column.accessor((row) => currencyBreakdown(row.netTotals), {
        id: "total",
        header: l("columns.total"),
        cell: ({ getValue }) => <strong>{getValue()}</strong>,
        sortingFn: (a, b) =>
          Number(a.original.netTotals[0]?.amount ?? 0) -
          Number(b.original.netTotals[0]?.amount ?? 0),
      }),
      column.display({
        id: "actions",
        header: l("columns.actions"),
        meta: { exportable: false },
        enableSorting: false,
        cell: ({ row }) => (
          <div className="btn-group">
            <button
              type="button"
              className="btn btn-primary btn-sm detail-button"
              style={BUTTON_FONT}
              title={l("detailTitle")}
              onClick={() =>
                navigate(carrierDetailPath(row.original.accountId, SUBCONTRACT_DAYS_DEFAULT))
              }
            >
              <i className="fas fa-eye" aria-hidden="true" /> {l("detailButton")}
            </button>
          </div>
        ),
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- l yalnız t'ye bağlı
    [t, navigate],
  );

  const changeBranches = (ids: string[]) => {
    const next = new URLSearchParams(params);
    next.delete("branchIds");
    for (const id of ids) next.append("branchIds", id);
    setParams(next, { replace: true });
  };

  const data = summary.data;
  const tdNormal = (content: ReactNode, className = "total-value") => (
    <td className={className}>{content}</td>
  );

  return (
    <div className="col-md-12">
      <div className="row">
        <div className="col-md-7">
          <div className="content">
            <h5>
              <i className="fas fa-chart-line" aria-hidden="true" /> <b>{l("title")}</b>
            </h5>
            <hr />
          </div>
        </div>
        <div className="col-md-2">
          <div className="content">
            <h5 style={WORKPLACE_HEADER}>
              <i className="fas fa-industry" aria-hidden="true" /> <b>{companyName}</b>
            </h5>
            <hr />
          </div>
        </div>
        <div className="col-md-3">
          <div className="welcome">
            <div className="welcome-content">
              {l("hello")}, <b>{companyName}</b>
            </div>
            <div className="welcome-content lower-opacity">{l("subtitle")}</div>
          </div>
        </div>
      </div>

      <br />

      <div className="row g-2 mb-3">
        <div className="col-sm-4">
          <div className="stat-card --blue">
            <div className="stat-label">
              <i className="fas fa-building" aria-hidden="true" /> {l("stats.carriers")}
            </div>
            <div className="stat-value">{data?.carrierCount ?? 0}</div>
          </div>
        </div>
        <div className="col-sm-4">
          <div className="stat-card --purple">
            <div className="stat-label">
              <i className="fas fa-truck" aria-hidden="true" /> {l("stats.legs")}
            </div>
            <div className="stat-value">{formatNumber(data?.legCount ?? 0, 0)}</div>
          </div>
        </div>
        <div className="col-sm-4">
          <div className="stat-card --green">
            <div className="stat-label">
              <i className="fas fa-money-bill-wave" aria-hidden="true" /> {l("stats.total")}
            </div>
            <div className="stat-value small-val">
              {(data?.netTotals.length ? data.netTotals : [{ currency: "TRY", amount: "0" }]).map(
                (total) => (
                  <div key={total.currency}>{formatN0(total.amount, total.currency)}</div>
                ),
              )}
            </div>
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
                    <i className="fas fa-list-ul" aria-hidden="true" /> {l("cardTitle")}
                  </h6>
                </div>
                <div style={FILTERS}>
                  <SubcontractFilters
                    suffix="STE"
                    branchIds={branchIds}
                    onChange={changeBranches}
                  />
                </div>
              </div>
            </header>
            <div className="card-body">
              <div className="table-responsive">
                <ZtoDataTable
                  id="dataTable2"
                  columns={columns}
                  data={rows}
                  getRowId={(row) => row.accountId}
                  tableClassName="table table-hover"
                  tableStyle={{ fontSize: 12 }}
                  dom={ZTO_DOM.lengthButtonsFilter}
                  pageLength={10}
                  lengthMenu={LENGTH_MENU}
                  order={[{ id: "index", desc: false }]}
                  buttons={salesTruckButtons({
                    copy: t("salesTruckExpenses.buttons.copy"),
                    excel: t("salesTruckExpenses.buttons.excel"),
                    print: t("salesTruckExpenses.buttons.print"),
                    pdf: t("salesTruckExpenses.buttons.pdf"),
                  })}
                  exportTitle={l("exportTitle")}
                  fileName="sevk-nakliye-ozetleri"
                  exportExcludeLastColumn
                  processing={summary.isFetching}
                  emptyText={
                    summary.isPending ? (
                      l("loading")
                    ) : summary.isError ? (
                      <span className="text-danger">{l("loadFailed")}</span>
                    ) : (
                      l("empty")
                    )
                  }
                  footer={
                    <tr className="total-row" style={TOTAL_ROW}>
                      <td />
                      <td className="total-label" colSpan={1} style={{ textAlign: "center" }}>
                        <i className="fas fa-calculator me-1" aria-hidden="true" /> {l("total")}
                      </td>
                      <td />
                      <td />
                      <td colSpan={1} />
                      {tdNormal(data?.legCount ?? 0)}
                      {tdNormal(<strong>{currencyBreakdown(data?.netTotals)}</strong>)}
                      <td />
                    </tr>
                  }
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
