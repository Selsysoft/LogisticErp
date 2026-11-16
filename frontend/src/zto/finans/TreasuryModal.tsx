import { KeyboardEvent, ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useActiveCompanyId } from "../../auth/companyStore";
import { useBranches } from "../../pages/finance/common";
import { useTreasuryReport } from "../../pages/finance/reportApi";
import type { Treasury, TreasuryFund, TreasuryInstrument } from "../../pages/finance/types";
import { ZtoChartLazy, ZtoModal, useZtoSnackbar } from "../components";
import { exportExcelWorkbook } from "../export";
import { currencySymbol, formatDate, formatDateTime, formatN2 } from "../format";
import { fundTransactionsPath } from "./navItems";
import {
  assetDistribution,
  balanceClass,
  dailySeries,
  daysClass,
  drawerLabel,
  dueSeries,
  fundBankName,
  fundTotals,
  instrumentTotals,
  nextTreasuryTab,
  noteTypeLabel,
  ratesText,
  signColor,
  summaryCards,
  tlCardRows,
  TREASURY_TABS,
  treasuryBranchGroups,
  treasuryBranchIds,
  treasurySheets,
  treasuryWorkPlaces,
  type TreasuryTab,
} from "./treasuryLogic";
import { restoreSidebarFocusLater } from "./sidebarFocus";

const TITLE_ID = "treasuryModalLabel";
const BRANCH_FILTER_ID = "treasuryBranchFilter";

const TAB_META: Record<TreasuryTab, { id: string; pane: string; icon: string; badge?: string }> = {
  banks: { id: "banks-tab", pane: "banksPanel", icon: "fas fa-university", badge: "badge-primary" },
  cashes: { id: "cashes-tab", pane: "cashesPanel", icon: "fas fa-wallet", badge: "badge-success" },
  checks: {
    id: "checks-tab",
    pane: "checksPanel",
    icon: "fas fa-money-check",
    badge: "badge-warning",
  },
  bills: {
    id: "bills-tab",
    pane: "billsPanel",
    icon: "fas fa-file-invoice-dollar",
    badge: "badge-info",
  },
  charts: { id: "charts-tab", pane: "chartsPanel", icon: "fas fa-chart-area" },
};

const SELECT_STYLE = { width: 150, fontSize: 11 } as const;
const TABLE_STYLE = { fontSize: 11 } as const;
const FOOT_STYLE = { background: "#f1f5f9", fontWeight: 600 } as const;
const ROW_STYLE = { borderBottom: "1px solid #f3f4f6" } as const;
const LABEL_STYLE = { fontSize: 10, fontWeight: 500 } as const;
const CHART_OPTIONS = { aspectRatio: 1.5 } as const;
const HEADS = {
  banks: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
  cashes: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
  checks: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
  bills: "linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)",
  assets: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
} as const;

const money = (amount: string, currency: string) =>
  `${formatN2(amount)} ${currencySymbol(currency)}`;

/**
 * Hızlı Bakiye Özeti — "Finansal Varlık Durumları" modalı (ZTO Views/CustomerAccounts/Index.cshtml
 * #treasuryModal :5048-5322, JS :7335-8320; 12.8_TASARIM §5.10). Çıplak ZtoModal: başlık, gövde ve alt
 * bilgi ZTO işaretlemesiyle (satır içi stiller dahil) yazılır; diyalog `.modal-xl.zto-treasury-dialog`
 * (%95 genişlik, `pages/treasury-modal.css`). Şube (iş yeri grubu) → İş Yeri seçicileri API'ye
 * `branchIds` gönderir (OK-12.8-21). Veri yalnız modal açıkken çekilir; grafikler sekme ilk açılınca.
 */
export function TreasuryModal({ show, onHide }: { show: boolean; onHide: () => void }) {
  const { t } = useTranslation("ztoFinans");
  const snackbar = useZtoSnackbar();
  const activeCompanyId = useActiveCompanyId();
  const branches = useBranches();
  const [branchGroupId, setBranchGroupId] = useState("");
  const [workPlaceId, setWorkPlaceId] = useState("");
  const [tab, setTab] = useState<TreasuryTab>("banks");
  const [chartsSeen, setChartsSeen] = useState(false);
  const tabRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  // Aktif şirketteki iş yerleri (konsolidede tümü); sunucu kapsamı ayrıca daraltır.
  const scoped = useMemo(
    () =>
      (branches.data ?? []).filter(
        (branch) => !activeCompanyId || branch.companyId === activeCompanyId,
      ),
    [branches.data, activeCompanyId],
  );
  const groups = treasuryBranchGroups(scoped);
  const workPlaces = treasuryWorkPlaces(scoped, branchGroupId);
  const branchIds = treasuryBranchIds(scoped, branchGroupId, workPlaceId);
  const report = useTreasuryReport({ branchIds }, { enabled: show });
  const data = report.data;
  const loading = report.isPending || (report.isFetching && report.isPlaceholderData);

  useEffect(() => {
    if (tab === "charts") setChartsSeen(true);
  }, [tab]);

  const selectTab = (next: TreasuryTab) => setTab(next);
  const onTabKey = (event: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    const next = nextTreasuryTab(index, event.key, TREASURY_TABS.length);
    if (next === null) return;
    event.preventDefault();
    selectTab(TREASURY_TABS[next]);
    tabRefs.current[next]?.focus();
  };

  const exportExcel = async () => {
    if (!data) return;
    try {
      await exportExcelWorkbook({
        fileName: t("treasury.excelFile"),
        sheets: treasurySheets(data, { t: (key, values) => t(key, values) }),
      });
    } catch {
      snackbar.show(t("treasury.excelFailed"), "error");
    }
  };

  const counts: Record<TreasuryTab, number | null> = {
    banks: data?.banks.length ?? 0,
    cashes: data?.cashes.length ?? 0,
    checks: data?.pendingChecks.length ?? 0,
    bills: data?.pendingBills.length ?? 0,
    charts: null,
  };

  return (
    <ZtoModal
      show={show}
      onHide={onHide}
      rootId="treasuryModal"
      bare
      size="xl"
      dialogClassName="zto-treasury-dialog"
      ariaLabelledBy={TITLE_ID}
      onEntered={() => document.getElementById(BRANCH_FILTER_ID)?.focus()}
      onExited={() => restoreSidebarFocusLater()}
    >
      <div
        className="modal-header"
        style={{
          background: "linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)",
          color: "#fff",
          padding: "12px 20px",
        }}
      >
        <h5 className="modal-title" id={TITLE_ID}>
          <i className="fas fa-money-bill-alt" aria-hidden="true" /> {t("treasury.title")}
          <small className="d-block" style={{ fontSize: 11, opacity: 0.8 }}>
            {t("treasury.subtitle")}
          </small>
        </h5>
        <div className="d-flex align-items-center">
          <select
            id={BRANCH_FILTER_ID}
            className="form-control no-select2 form-control-sm mr-2"
            style={SELECT_STYLE}
            aria-label={t("treasury.branchGroupLabel")}
            value={branchGroupId}
            onChange={(event) => {
              setBranchGroupId(event.target.value);
              setWorkPlaceId("");
            }}
          >
            <option value="">{t("treasury.allBranchGroups")}</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
          <select
            id="treasuryWorkPlaceFilter"
            className="form-control no-select2 form-control-sm mr-2"
            style={SELECT_STYLE}
            aria-label={t("treasury.workPlaceLabel")}
            value={workPlaceId}
            onChange={(event) => setWorkPlaceId(event.target.value)}
          >
            <option value="">{t("treasury.allWorkPlaces")}</option>
            {workPlaces.map((place) => (
              <option key={place.id} value={place.id}>
                {place.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-sm btn-light mr-2"
            style={{ fontSize: 11 }}
            aria-label={t("treasury.refresh")}
            title={t("treasury.refresh")}
            disabled={report.isFetching}
            onClick={() => void report.refetch()}
          >
            <i className="fas fa-sync-alt" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="close text-white"
            data-dismiss="modal"
            aria-label={t("treasury.close")}
            onClick={onHide}
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      </div>
      <div
        className="modal-body"
        style={{ padding: 15, maxHeight: "80vh", overflowY: "auto", background: "#f8fafc" }}
      >
        {loading && (
          <div id="treasuryLoading" className="text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="sr-only">{t("treasury.loading")}</span>
            </div>
            <p className="mt-2 text-muted">{t("treasury.loadingText")}</p>
          </div>
        )}
        {!loading && report.isError && (
          <div className="alert alert-danger" role="alert">
            {t("treasury.loadError", { message: report.error.message })}
          </div>
        )}
        {!loading && data && (
          <div id="treasuryContent">
            <div className="row mb-3" id="treasurySummaryCards">
              <SummaryCards data={data} />
            </div>
            {data.missingRates.length > 0 && (
              <div className="alert alert-warning py-1" role="status" style={{ fontSize: 11 }}>
                {t("treasury.missingRates", { list: data.missingRates.join(", ") })}
              </div>
            )}

            <ul
              className="nav nav-tabs"
              id="treasuryTabs"
              role="tablist"
              aria-label={t("treasury.tabsLabel")}
              style={{ borderBottom: "2px solid #e2e8f0" }}
            >
              {TREASURY_TABS.map((key, index) => {
                const selected = key === tab;
                const meta = TAB_META[key];
                return (
                  <li className="nav-item" key={key} role="presentation">
                    <a
                      ref={(element) => {
                        tabRefs.current[index] = element;
                      }}
                      className={selected ? "nav-link active" : "nav-link"}
                      id={meta.id}
                      href={`#${meta.pane}`}
                      role="tab"
                      aria-selected={selected}
                      tabIndex={selected ? 0 : -1}
                      onClick={(event) => {
                        event.preventDefault();
                        selectTab(key);
                      }}
                      onKeyDown={(event) => onTabKey(event, index)}
                    >
                      <i className={meta.icon} aria-hidden="true" /> {t(`treasury.tabs.${key}`)}
                      {meta.badge && (
                        <>
                          {" "}
                          <span className={`badge ${meta.badge} ml-1`}>{counts[key]}</span>
                        </>
                      )}
                    </a>
                  </li>
                );
              })}
            </ul>

            <div className="tab-content" id="treasuryTabContent" style={{ paddingTop: 15 }}>
              <Pane id="banks" tab={tab}>
                <FundTable kind="BANK" funds={data.banks} />
              </Pane>
              <Pane id="cashes" tab={tab}>
                <FundTable kind="CASH" funds={data.cashes} />
              </Pane>
              <Pane id="checks" tab={tab}>
                <InstrumentTable kind="CHECK" items={data.pendingChecks} />
              </Pane>
              <Pane id="bills" tab={tab}>
                <InstrumentTable kind="NOTE" items={data.pendingBills} />
              </Pane>
              <Pane id="charts" tab={tab}>
                {chartsSeen && <Charts data={data} />}
              </Pane>
            </div>
          </div>
        )}
      </div>
      <div className="modal-footer" style={{ background: "#f8fafc", padding: "10px 20px" }}>
        <div className="d-flex justify-content-between align-items-center w-100">
          <small className="text-muted" id="treasuryLastUpdate">
            {data ? (
              <>
                <i className="fas fa-clock mr-1" aria-hidden="true" />
                {t("treasury.lastUpdate", { date: formatDateTime(data.generatedAt) })}
                {ratesText(data.rates) && (
                  <>
                    <br />
                    {t("treasury.ratesLine", { rates: ratesText(data.rates) })}
                  </>
                )}
              </>
            ) : (
              "-"
            )}
          </small>
          <div>
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              disabled={!data}
              onClick={() => void exportExcel()}
            >
              <i className="fas fa-file-excel" aria-hidden="true" /> {t("treasury.excel")}
            </button>{" "}
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => window.print()}
            >
              <i className="fas fa-print" aria-hidden="true" /> {t("treasury.print")}
            </button>{" "}
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              data-dismiss="modal"
              onClick={onHide}
            >
              <i className="fas fa-times" aria-hidden="true" /> {t("treasury.close")}
            </button>
          </div>
        </div>
      </div>
    </ZtoModal>
  );
}

function Pane({ id, tab, children }: { id: TreasuryTab; tab: TreasuryTab; children: ReactNode }) {
  const meta = TAB_META[id];
  const selected = id === tab;
  return (
    <div
      className={selected ? "tab-pane fade show active" : "tab-pane fade"}
      id={meta.pane}
      role="tabpanel"
      aria-labelledby={meta.id}
      hidden={!selected}
    >
      {children}
    </div>
  );
}

function SummaryCards({ data }: { data: Treasury }) {
  const { t } = useTranslation("ztoFinans");
  const net = data.netTl;
  return (
    <>
      {summaryCards(data).map((card) => (
        <div className="col-6 col-md-4 col-lg-3 mb-2" key={card.key}>
          <div
            className="card h-100"
            style={{ borderLeft: `3px solid ${card.border}`, borderRadius: 6 }}
          >
            <div className="card-body p-2">
              <CardHead
                icon={card.icon}
                gradient={card.gradient}
                color={card.color}
                title={t(`treasury.cards.${card.key}`)}
                sub={t(card.sub.key, { count: card.sub.count })}
              />
              {card.rows.map((row) => (
                <div
                  key={row.currency}
                  className="d-flex justify-content-between align-items-center py-1"
                  style={ROW_STYLE}
                >
                  <span className="text-muted" style={LABEL_STYLE}>
                    {row.currency}
                  </span>
                  <strong style={{ fontSize: 12, color: row.color ?? card.color }}>
                    {money(row.amount, row.currency)}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
      <div className="col-6 col-md-4 col-lg-3 mb-2">
        <div
          className="card h-100"
          style={{
            borderLeft: "3px solid #ef4444",
            borderRadius: 6,
            background: "linear-gradient(135deg, #fef2f2 0%, #fff 100%)",
          }}
        >
          <div className="card-body p-2">
            <CardHead
              icon="fas fa-lira-sign"
              gradient="linear-gradient(135deg, #ef4444, #dc2626)"
              color="#dc2626"
              title={t("treasury.cards.tl")}
              sub={t("treasury.cards.tlSub")}
            />
            {tlCardRows(data).map((row) => (
              <div
                key={row.key}
                className="d-flex justify-content-between align-items-center py-1"
                style={ROW_STYLE}
              >
                <span className="text-muted" style={LABEL_STYLE}>
                  {t(`treasury.cards.${row.key}`)}
                </span>
                <strong style={{ fontSize: 12, color: row.color }}>
                  {money(row.amount, "TRY")}
                </strong>
              </div>
            ))}
            <div
              className="d-flex justify-content-between align-items-center py-1 mt-1"
              style={{ borderTop: "2px solid #e5e7eb", paddingTop: 8 }}
            >
              <span style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>
                {t("treasury.cards.tlNet")}
              </span>
              <strong style={{ fontSize: 14, color: signColor(net) }}>{money(net, "TRY")}</strong>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function CardHead(props: {
  icon: string;
  gradient: string;
  color: string;
  title: string;
  sub: string;
}) {
  return (
    <div className="d-flex align-items-center mb-2">
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: props.gradient,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-hidden="true"
      >
        <i className={`${props.icon} text-white`} style={{ fontSize: 11 }} />
      </div>
      <div className="ml-2 flex-grow-1">
        <strong style={{ fontSize: 11, color: props.color }}>{props.title}</strong>
        <small className="d-block text-muted" style={{ fontSize: 9 }}>
          {props.sub}
        </small>
      </div>
    </div>
  );
}

function FundTable({ kind, funds }: { kind: "BANK" | "CASH"; funds: TreasuryFund[] }) {
  const { t } = useTranslation("ztoFinans");
  const c = (key: string) => t(`treasury.col.${key}`);
  const bank = kind === "BANK";
  const totals = fundTotals(funds);
  const action = (fund: TreasuryFund) => (
    <Link
      to={fundTransactionsPath(kind, { fundId: fund.fundAccountId })}
      className={`btn btn-sm ${bank ? "btn-outline-primary" : "btn-outline-success"}`}
      title={t("treasury.movements")}
      aria-label={`${t("treasury.movements")}: ${bank ? fundBankName(fund) : fund.name}`}
    >
      <i className="fas fa-list" aria-hidden="true" />
    </Link>
  );
  return (
    <div className="table-responsive">
      <table
        className="table table-sm table-hover"
        id={bank ? "treasuryBanksTable" : "treasuryCashesTable"}
        style={TABLE_STYLE}
      >
        <thead style={{ background: bank ? HEADS.banks : HEADS.cashes, color: "#fff" }}>
          <tr>
            <th>{c("branchGroup")}</th>
            <th>{c("workPlace")}</th>
            {bank ? (
              <>
                <th>{c("bank")}</th>
                <th>{c("bankBranch")}</th>
                <th>{c("iban")}</th>
              </>
            ) : (
              <>
                <th>{c("cashCode")}</th>
                <th>{c("cashName")}</th>
              </>
            )}
            <th className="text-right">{c("balance")}</th>
            <th className="text-right">{c("in30")}</th>
            <th className="text-right">{c("out30")}</th>
            {bank && (
              <>
                <th className="text-center">{c("checks")}</th>
                <th className="text-center">{c("notes")}</th>
              </>
            )}
            <th>{c("action")}</th>
          </tr>
        </thead>
        <tbody id={bank ? "treasuryBanksBody" : "treasuryCashesBody"}>
          {funds.length === 0 ? (
            <tr>
              <td colSpan={bank ? 11 : 8} className="text-center text-muted">
                {t(bank ? "treasury.emptyBanks" : "treasury.emptyCashes")}
              </td>
            </tr>
          ) : (
            funds.map((fund) => (
              <tr key={fund.fundAccountId}>
                <td>
                  <span className="badge badge-light">{fund.branchGroupName || "-"}</span>
                </td>
                <td>{fund.branchName || "-"}</td>
                {bank ? (
                  <>
                    <td>
                      <strong style={{ color: "#1e40af" }}>{fundBankName(fund)}</strong>
                    </td>
                    <td>
                      <small>{fund.bankBranchName || "-"}</small>
                      <br />
                      <small className="text-muted">{fund.accountNoMasked || "-"}</small>
                    </td>
                    <td>
                      <small className="text-muted">{fund.iban || "-"}</small>
                    </td>
                  </>
                ) : (
                  <>
                    <td>
                      <strong>{fund.code || "-"}</strong>
                    </td>
                    <td style={{ color: "#166534" }}>{fund.name}</td>
                  </>
                )}
                <td
                  className={`text-right ${balanceClass(fund.balance)}`}
                  style={{ fontWeight: 700 }}
                >
                  {money(fund.balance, fund.currency)}
                </td>
                <td className="text-right text-success">{money(fund.in30, fund.currency)}</td>
                <td className="text-right text-danger">{money(fund.out30, fund.currency)}</td>
                {bank && (
                  <>
                    <td className="text-center">
                      {fund.checkCount > 0 ? (
                        <span className="badge badge-warning">{fund.checkCount}</span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="text-center">
                      {fund.noteCount > 0 ? (
                        <span className="badge badge-info">{fund.noteCount}</span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  </>
                )}
                <td>{action(fund)}</td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot style={FOOT_STYLE}>
          {totals.map((total) => (
            <tr key={total.currency}>
              <td colSpan={bank ? 5 : 4} className="text-right">
                <strong>{t("treasury.total", { currency: total.currency })}</strong>
              </td>
              <td className="text-right" style={{ fontWeight: 700 }}>
                {money(total.balance, total.currency)}
              </td>
              <td className="text-right text-success">{money(total.in30, total.currency)}</td>
              <td className="text-right text-danger">{money(total.out30, total.currency)}</td>
              {bank && (
                <>
                  <td className="text-center">{total.checkCount}</td>
                  <td className="text-center">{total.noteCount}</td>
                </>
              )}
              <td />
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
}

function InstrumentTable({ kind, items }: { kind: "CHECK" | "NOTE"; items: TreasuryInstrument[] }) {
  const { t } = useTranslation("ztoFinans");
  const c = (key: string) => t(`treasury.col.${key}`);
  const check = kind === "CHECK";
  const totals = instrumentTotals(items);
  const masked = t("treasury.maskedDrawer");
  return (
    <div className="table-responsive">
      <table
        className="table table-sm table-hover"
        id={check ? "treasuryChecksTable" : "treasuryBillsTable"}
        style={TABLE_STYLE}
      >
        <thead style={{ background: check ? HEADS.checks : HEADS.bills, color: "#fff" }}>
          <tr>
            {check ? (
              <>
                <th>{c("checkNo")}</th>
                <th>{c("bank")}</th>
                <th>{c("branch")}</th>
              </>
            ) : (
              <>
                <th>{c("noteNo")}</th>
                <th>{c("type")}</th>
                <th>{c("bank")}</th>
              </>
            )}
            <th>{c("drawer")}</th>
            <th className="text-right">{c("amount")}</th>
            <th>{c("dueDate")}</th>
            <th>{c("daysLeft")}</th>
            <th>{c("status")}</th>
            {check && <th>{c("type")}</th>}
          </tr>
        </thead>
        <tbody id={check ? "treasuryChecksBody" : "treasuryBillsBody"}>
          {items.length === 0 ? (
            <tr>
              <td colSpan={check ? 9 : 8} className="text-center text-muted">
                {t(check ? "treasury.emptyChecks" : "treasury.emptyBills")}
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <tr key={item.instrumentId}>
                <td>
                  <strong>{item.number}</strong>
                </td>
                {check ? (
                  <>
                    <td>{item.bankName || "-"}</td>
                    <td>{item.bankBranch || "-"}</td>
                  </>
                ) : (
                  <>
                    <td>
                      <small>{noteTypeLabel(item, (key, values) => t(key, values))}</small>
                    </td>
                    <td>{item.bankName || "-"}</td>
                  </>
                )}
                <td className={item.masked ? "text-muted" : undefined}>
                  {drawerLabel(item, masked)}
                </td>
                <td
                  className="text-right"
                  style={{ fontWeight: 600, color: check ? "#92400e" : "#0e7490" }}
                >
                  {money(item.amount, item.currency)}
                </td>
                <td>{formatDate(item.dueDate)}</td>
                <td className={daysClass(item.daysLeft)} style={{ fontWeight: 600 }}>
                  {t("treasury.days", { count: item.daysLeft })}
                </td>
                <td>
                  <span className={`badge ${check ? "badge-warning" : "badge-info"}`}>
                    {t(`treasury.status.${item.status}`, { defaultValue: item.status })}
                  </span>
                </td>
                {check && (
                  <td>
                    <small>{t(`treasury.direction.${item.direction}`)}</small>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
        <tfoot style={FOOT_STYLE}>
          {totals.map((total) => (
            <tr key={total.currency}>
              <td colSpan={4} className="text-right">
                <strong>{t("treasury.total", { currency: total.currency })}</strong>
              </td>
              <td className="text-right" style={{ fontWeight: 700 }}>
                {money(total.amount, total.currency)}
              </td>
              <td colSpan={check ? 4 : 3} />
            </tr>
          ))}
        </tfoot>
      </table>
    </div>
  );
}

function ChartCard(props: { icon: string; gradient: string; title: string; children: ReactNode }) {
  return (
    <div className="col-md-6 mb-3">
      <div className="card" style={{ borderRadius: 8 }}>
        <div className="card-header py-2" style={{ background: props.gradient, color: "#fff" }}>
          <i className={props.icon} aria-hidden="true" /> {props.title}
        </div>
        <div className="card-body">
          <Suspense fallback={null}>{props.children}</Suspense>
        </div>
      </div>
    </div>
  );
}

function Charts({ data }: { data: Treasury }) {
  const { t } = useTranslation("ztoFinans");
  const bank = dailySeries(data.bankDaily);
  const cash = dailySeries(data.cashDaily);
  const due = dueSeries(data.dueBuckets);
  const flow = (series: typeof bank) => [
    {
      label: t("treasury.charts.in"),
      data: series.inData,
      backgroundColor: "rgba(16, 185, 129, 0.7)",
      borderColor: "rgba(16, 185, 129, 1)",
      borderWidth: 1,
    },
    {
      label: t("treasury.charts.out"),
      data: series.outData,
      backgroundColor: "rgba(239, 68, 68, 0.7)",
      borderColor: "rgba(239, 68, 68, 1)",
      borderWidth: 1,
    },
  ];
  return (
    <>
      <div className="row">
        <ChartCard
          icon="fas fa-university"
          gradient={HEADS.banks}
          title={t("treasury.charts.bank")}
        >
          <ZtoChartLazy
            type="bar"
            data={{ labels: bank.labels, datasets: flow(bank) }}
            valueFormat={{ currency: "TRY" }}
            options={CHART_OPTIONS}
            ariaLabel={t("treasury.charts.bank")}
          />
        </ChartCard>
        <ChartCard icon="fas fa-wallet" gradient={HEADS.cashes} title={t("treasury.charts.cash")}>
          <ZtoChartLazy
            type="line"
            data={{
              labels: cash.labels,
              datasets: [
                {
                  label: t("treasury.charts.in"),
                  data: cash.inData,
                  borderColor: "rgba(16, 185, 129, 1)",
                  backgroundColor: "rgba(16, 185, 129, 0.1)",
                  fill: true,
                  tension: 0.4,
                },
                {
                  label: t("treasury.charts.out"),
                  data: cash.outData,
                  borderColor: "rgba(239, 68, 68, 1)",
                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                  fill: true,
                  tension: 0.4,
                },
              ],
            }}
            valueFormat={{ currency: "TRY" }}
            options={CHART_OPTIONS}
            ariaLabel={t("treasury.charts.cash")}
          />
        </ChartCard>
      </div>
      <div className="row">
        <ChartCard
          icon="fas fa-chart-pie"
          gradient={HEADS.assets}
          title={t("treasury.charts.assets")}
        >
          <ZtoChartLazy
            type="doughnut"
            data={{
              labels: [
                t("treasury.charts.bankBalance"),
                t("treasury.charts.cashBalance"),
                t("treasury.charts.pendingChecks"),
                t("treasury.charts.pendingBills"),
              ],
              datasets: [
                {
                  data: assetDistribution(data),
                  backgroundColor: [
                    "rgba(59, 130, 246, 0.8)",
                    "rgba(16, 185, 129, 0.8)",
                    "rgba(245, 158, 11, 0.8)",
                    "rgba(6, 182, 212, 0.8)",
                  ],
                  borderColor: [
                    "rgba(59, 130, 246, 1)",
                    "rgba(16, 185, 129, 1)",
                    "rgba(245, 158, 11, 1)",
                    "rgba(6, 182, 212, 1)",
                  ],
                  borderWidth: 2,
                },
              ],
            }}
            valueFormat={{ currency: "TRY" }}
            options={CHART_OPTIONS}
            ariaLabel={t("treasury.charts.assets")}
          />
        </ChartCard>
        <ChartCard
          icon="fas fa-calendar-alt"
          gradient={HEADS.checks}
          title={t("treasury.charts.due")}
        >
          <ZtoChartLazy
            type="bar"
            stacked
            data={{
              labels: due.labels,
              datasets: [
                {
                  label: t("treasury.charts.checks"),
                  data: due.checks,
                  backgroundColor: "rgba(245, 158, 11, 0.8)",
                  borderColor: "rgba(245, 158, 11, 1)",
                  borderWidth: 1,
                },
                {
                  label: t("treasury.charts.bills"),
                  data: due.notes,
                  backgroundColor: "rgba(6, 182, 212, 0.8)",
                  borderColor: "rgba(6, 182, 212, 1)",
                  borderWidth: 1,
                },
              ],
            }}
            valueFormat={{ currency: "TRY" }}
            options={CHART_OPTIONS}
            ariaLabel={t("treasury.charts.due")}
          />
        </ChartCard>
      </div>
    </>
  );
}
