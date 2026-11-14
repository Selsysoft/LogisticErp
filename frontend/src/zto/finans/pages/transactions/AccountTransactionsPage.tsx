import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../../../auth/authStore";
import { activeCompanies, useActiveCompanyId } from "../../../../auth/companyStore";
import {
  useAccount,
  useAccountBalances,
  useAccountTransactions,
  useDocumentTypes,
  useRollovers,
} from "../../../../pages/finance/accountApi";
import { useBranches, useCan, useMultiCompany } from "../../../../pages/finance/common";
import type { AccountTransactionRow, DocumentSide } from "../../../../pages/finance/types";
import { TX_SEARCH_IDS, ZtoAccountSearch, currencySymbol, formatN2 } from "../../../components";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { accountTransactionsPath, statementPath, ZTO_FINANS_BASE } from "../../navItems";
import { CariSidebar } from "./CariSidebar";
import { CariTransferModal } from "./CariTransferModal";
import { DeleteTransactionModal } from "./DeleteTransactionModal";
import { DocumentModal } from "./DocumentModal";
import { EditLimitsModal } from "./EditLimitsModal";
import { InvoicesModal } from "./InvoicesModal";
import { LimitCard } from "./LimitCard";
import { RolloverModal } from "./RolloverModal";
import {
  RolloverBreakdown,
  SummaryCard,
  WorkplaceDistribution,
  type DistributionGroup,
} from "./SummaryCard";
import { TransactionDetailModal } from "./TransactionDetailModal";
import { TransactionTables } from "./TransactionTables";
import {
  SEASON_ALL,
  SEASON_OPENING,
  balanceChip,
  currencyButtons,
  defaultSeason,
  effectiveLimits,
  isCustomerType,
  kindTotals,
  newestFirst,
  runningBalances,
  seasonOptions,
  seasonWindow,
  sortSeasons,
  tabOrder,
  type TabKey,
} from "./transactionsLogic";

/** Fatura Tarihi sütunu yalnız malzeme/ilaç tedarikçisi karşılığı gruplarda (TR:47). */
const INVOICE_DATE_GROUPS = new Set(["YEDEK_PARCA_SERVIS", "AKARYAKIT"]);

/**
 * Cari Hareketler (ZTO AccountTransaction/Transactions.cshtml + transactions.js; 12.1 §5.10). Veri:
 * `useAccountTransactions` (seçili para birimi, sezon penceresi, iş yeri), kırılımlı bakiyeler (özet, devir,
 * iş yeri dağılımı), sezonlar. Modallar: Borç/Alacak Ekle, Detay, Sil, Limit, Faturalar, Cari Devir, Cari Taşıma.
 */
export function AccountTransactionsPage() {
  useZtoRootClass("zto-page-account-transactions");
  const { t } = useTranslation("ztoFinans");
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canManage = useCan("FINANCE_MANAGE");
  const canPost = useCan("FINANCE_PAYMENT_CREATE");
  const multiCompany = useMultiCompany();
  const companies = useAuthStore((s) => s.me?.companies);
  const activeCompanyId = useActiveCompanyId();

  const account = useAccount(id);
  const rollovers = useRollovers(id);
  const branches = useBranches();
  const documentTypes = useDocumentTypes();
  const distribution = useAccountBalances(id, { groupBy: "BRANCH" });

  const [branchFilter, setBranchFilter] = useState("");
  const [tab, setTab] = useState<TabKey>("ALL");
  const [documentSide, setDocumentSide] = useState<DocumentSide | null>(null);
  const [reviseId, setReviseId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AccountTransactionRow | null>(null);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [invoices, setInvoices] = useState<"PURCHASE" | "SALES" | null>(null);
  const [rolloverOpen, setRolloverOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const a = account.data;
  const customer = isCustomerType(a?.type);
  const seasons = useMemo(() => sortSeasons(rollovers.data ?? []), [rollovers.data]);
  const season = defaultSeason(seasons, params.get("rolloverId"));
  const seasonRange = seasonWindow(seasons, season);
  const activeSeason = seasons.find((s) => s.active) ?? null;
  const branchIds = branchFilter ? [branchFilter] : undefined;

  const currencies = useMemo(
    () => currencyButtons(distribution.data?.rows ?? [], a?.defaultCurrency ?? null),
    [distribution.data, a?.defaultCurrency],
  );
  const currency = params.get("currency") || a?.defaultCurrency || currencies[0] || "TRY";
  const symbol = currencySymbol(currency);

  // Özet: seçili sezon penceresi (Tümü → ALL; Açılış → ilk devrin BEFORE; sezon → kendi devrinin AFTER, asOf pencere sonu).
  const summaryQuery =
    season === SEASON_ALL || seasons.length === 0
      ? { segment: "ALL" as const, params: { groupBy: "CURRENCY" as const, branchIds } }
      : season === SEASON_OPENING
        ? {
            segment: "BEFORE" as const,
            params: { groupBy: "CURRENCY" as const, branchIds, rolloverId: seasons[0].id },
          }
        : {
            segment: "AFTER" as const,
            params: {
              groupBy: "CURRENCY" as const,
              branchIds,
              rolloverId: season,
              asOf: seasonRange.to,
            },
          };
  const summary = useAccountBalances(a ? id : undefined, summaryQuery.params);
  const breakdown = useAccountBalances(a && activeSeason ? id : undefined, {
    groupBy: "CURRENCY",
    branchIds,
    rolloverId: activeSeason?.id,
  });

  const transactions = useAccountTransactions({
    accountId: a ? id : "",
    from: seasonRange.from,
    to: seasonRange.to,
    currency,
    branchIds,
  });
  const rows = useMemo(() => newestFirst(transactions.data ?? []), [transactions.data]);
  const balances = useMemo(() => runningBalances(rows), [rows]);
  const points = useMemo(
    () =>
      rows
        .slice()
        .reverse()
        .map((r) => ({ date: r.transactionDate, balance: balances.get(r.id) ?? 0 })),
    [rows, balances],
  );

  useEffect(() => {
    if (a) document.title = t("transactions.pageTitle", { name: a.name });
  }, [a, t]);

  const branchName = useCallback(
    (branchId: string | null | undefined) =>
      branches.data?.find((b) => b.id === branchId)?.name ?? "",
    [branches.data],
  );
  const typeNames = useMemo(
    () => new Map((documentTypes.data ?? []).map((d) => [d.code, d.name])),
    [documentTypes.data],
  );
  const typeName = useCallback(
    (row: AccountTransactionRow) => {
      if (!row.documentType) return "";
      return (
        typeNames.get(row.documentType) ??
        t(`translation:finance.source.${row.documentType}`, { defaultValue: row.documentType })
      );
    },
    [typeNames, t],
  );

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  // İş yeri dağılımı: şube satırları; ≥2 aktif şirkette şirket başlıkları altında.
  const distributionGroups = useMemo((): DistributionGroup[] => {
    const rowsAll = (distribution.data?.rows ?? []).filter(
      (r) => r.segment === "ALL" && r.currency === currency,
    );
    const byBranch = new Map<string, DistributionGroup>();
    for (const r of rowsAll) {
      const key = r.branchId ?? "none";
      const g = byBranch.get(key) ?? { key, label: branchName(r.branchId), rows: [] };
      g.rows.push(r);
      byBranch.set(key, g);
    }
    const list = [...byBranch.values()].sort((x, y) => x.label.localeCompare(y.label, "tr"));
    if (!multiCompany) return list;
    const byCompany = new Map<string, DistributionGroup>();
    for (const g of list) {
      const branch = branches.data?.find((b) => b.id === g.key);
      const ckey = branch?.companyId ?? "none";
      const c = byCompany.get(ckey) ?? {
        key: `c-${ckey}`,
        label: branch?.companyName ?? "-",
        rows: [],
        children: [],
      };
      c.rows.push(...g.rows);
      c.children!.push(g);
      byCompany.set(ckey, c);
    }
    return [...byCompany.values()];
  }, [distribution.data, currency, branchName, multiCompany, branches.data]);

  const workplaceOptions = useMemo(() => {
    const ids = new Set(
      (distribution.data?.rows ?? []).map((r) => r.branchId).filter((x): x is string => !!x),
    );
    return [...ids]
      .map((bid) => ({ id: bid, name: branchName(bid) }))
      .sort((x, y) => x.name.localeCompare(y.name, "tr"));
  }, [distribution.data, branchName]);

  if (account.isPending) {
    return (
      <div className="container-fluid">
        <p className="text-muted p-3" role="status">
          {t("transactions.loading")}
        </p>
      </div>
    );
  }
  if (account.isError || !a) {
    return (
      <div className="container-fluid">
        <div className="alert alert-danger m-3" role="alert">
          {account.isError ? t("transactions.loadError") : t("transactions.notFound")}
        </div>
      </div>
    );
  }

  const totals = kindTotals(summary.data?.rows ?? [], currency, summaryQuery.segment);
  const totalBalance = kindTotals(distribution.data?.rows ?? [], currency, "ALL").balance;
  const chip = balanceChip(customer, totalBalance);
  const limits = effectiveLimits(a, multiCompany ? activeCompanyId : null);
  const companyName =
    activeCompanies(companies).find((c) => c.id === activeCompanyId)?.shortName ?? null;
  const invoiceTotal =
    summary.data?.payableInvoiceTotals.find((x) => x.currency === currency)?.amount ?? 0;
  const tabs = tabOrder(customer);
  const options = seasonOptions(seasons, {
    all: t("transactions.header.allSeasons"),
    opening: t("transactions.header.opening"),
    active: t("transactions.header.active"),
  });
  const openStatement = () =>
    globalThis.open(
      statementPath(a.id, {
        branchId: branchFilter || undefined,
        companyId: activeCompanyId ?? undefined,
      }),
      "_blank",
      "noopener",
    );
  const settlementsLink = () => globalThis.open("/finance/settlements", "_blank", "noopener");

  return (
    <>
      <CariSidebar account={a} branchName={branchName(a.branchId)} canEdit={canManage} />
      <div className="container-fluid">
        <div className="row">
          <div className="col-12">
            <div className="card">
              <div className="card-header bg-white border-bottom" style={{ padding: "10px 20px" }}>
                <div className="d-flex justify-content-between align-items-center flex-wrap">
                  <div className="d-flex align-items-center flex-wrap" style={{ gap: 12 }}>
                    <Link
                      to={`${ZTO_FINANS_BASE}/cari-hareketler`}
                      className="erp-btn erp-btn-secondary ml-3"
                      title={t("transactions.header.backTitle")}
                      style={{ marginRight: 8 }}
                    >
                      <i className="fas fa-arrow-left" aria-hidden="true" />
                      <span className="d-none d-md-inline">{t("transactions.header.back")}</span>
                    </Link>
                    <div className="d-flex align-items-center">
                      <div className="erp-header-icon">
                        <i className="fas fa-file-invoice-dollar" aria-hidden="true" />
                      </div>
                      <div className="ml-3">
                        <h6 className="mb-0 text-dark" style={{ fontSize: 14, fontWeight: 600 }}>
                          {t("transactions.header.title")}
                        </h6>
                        <div className="erp-breadcrumb mt-1">
                          <span>
                            <i className="fas fa-building" aria-hidden="true" /> {a.subGroupName}
                          </span>
                          <span className="separator" aria-hidden="true">
                            ›
                          </span>
                          <span
                            className="text-primary font-weight-semibold"
                            title={a.name}
                            style={{
                              display: "inline-block",
                              maxWidth: 260,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              verticalAlign: "bottom",
                            }}
                          >
                            {a.name}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div
                      className="d-none d-lg-flex align-items-center"
                      style={{ gap: 8, marginLeft: 15 }}
                    >
                      <div className="erp-info-chip">
                        <i className="fas fa-hashtag" aria-hidden="true" />
                        <span>{a.code}</span>
                      </div>
                      {chip && (
                        <div className={`erp-info-chip ${chip.className}`}>
                          <i className={chip.icon} aria-hidden="true" />
                          <span>
                            {formatN2(chip.amount)} {symbol}
                          </span>
                        </div>
                      )}
                    </div>
                    <div
                      id="currencyButtonsContainer"
                      role="group"
                      aria-label={t("transactions.document.currency")}
                    >
                      {currencies.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`btn btn-sm currency-btn${c === currency ? " active" : ""}`}
                          data-currency-id={c}
                          title={c}
                          aria-pressed={c === currency}
                          onClick={() => setParam("currency", c)}
                        >
                          {currencySymbol(c)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="d-flex align-items-center" style={{ gap: 6, flexWrap: "nowrap" }}>
                    <ZtoAccountSearch
                      variant="atcs"
                      ids={TX_SEARCH_IDS}
                      placeholder={t("transactions.header.search")}
                      emptyText={t("transactions.header.searchEmpty")}
                      excludeId={a.id}
                      wrapStyle={{
                        width: 280,
                        maxWidth: 280,
                        minWidth: 0,
                        flex: "0 1 280px",
                        marginRight: 6,
                      }}
                      onSelect={(hit) => navigate(accountTransactionsPath(hit.id))}
                    />
                    <div
                      className="d-flex align-items-center"
                      style={{ gap: 6, marginRight: 6, whiteSpace: "nowrap" }}
                    >
                      <label
                        className="mb-0"
                        htmlFor="ctSeasonSelect"
                        style={{ fontSize: 12, fontWeight: 600, color: "#0f766e" }}
                      >
                        <i className="fas fa-calendar-alt mr-1" aria-hidden="true" />
                        {t("transactions.header.seasons")}:
                      </label>
                      <select
                        id="ctSeasonSelect"
                        className="form-control form-control-sm no-select2"
                        style={{ minWidth: 210, fontSize: 12 }}
                        title={t("transactions.header.seasonTitle")}
                        value={season}
                        onChange={(e) => setParam("rolloverId", e.target.value)}
                      >
                        {options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card-body p-2">
                <div className="row g-2" id="limitLayoutRow">
                  <div className="col-12 col-lg-8">
                    <SummaryCard
                      customer={customer}
                      totals={totals}
                      symbol={symbol}
                      invoiceTotal={invoiceTotal}
                    />
                    {activeSeason && breakdown.data && (
                      <RolloverBreakdown
                        breakdown={breakdown.data}
                        currency={currency}
                        symbol={symbol}
                        splitDate={breakdown.data.splitDate}
                      />
                    )}
                    <WorkplaceDistribution
                      groups={distributionGroups}
                      customer={customer}
                      currency={currency}
                      symbol={symbol}
                      loading={distribution.isPending}
                    />
                  </div>
                  <div className="col-12 col-lg-4">
                    <LimitCard
                      credit={limits.credit}
                      risk={limits.risk}
                      symbol={symbol}
                      points={points}
                      balance={totalBalance}
                      canEdit={canManage}
                      onEdit={() => setLimitsOpen(true)}
                    />
                  </div>
                </div>

                <div className="row mt-2 mb-2">
                  <div className="col-12">
                    <div className="erp-action-toolbar">
                      <div className="toolbar-label">
                        <i className="fas fa-tools" aria-hidden="true" />
                        <span>{t("transactions.toolbar.label")}</span>
                      </div>
                      <div className="d-flex align-items-center ml-3 mr-auto">
                        <label
                          className="mb-0 mr-2 small text-muted text-nowrap"
                          htmlFor="workPlaceFilter"
                        >
                          <i className="fas fa-building" aria-hidden="true" />{" "}
                          {t("transactions.toolbar.workplace")}:
                        </label>
                        <select
                          id="workPlaceFilter"
                          className="form-control form-control-sm no-select2"
                          style={{ minWidth: 160 }}
                          value={branchFilter}
                          onChange={(e) => setBranchFilter(e.target.value)}
                        >
                          <option value="">{t("transactions.toolbar.allWorkplaces")}</option>
                          {workplaceOptions.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="toolbar-actions">
                        {canPost && (
                          <button
                            type="button"
                            className="erp-action-btn btn-success"
                            title={t("transactions.toolbar.addCreditTitle")}
                            onClick={() => setDocumentSide("RECEIVABLE")}
                          >
                            <i className="fas fa-plus-circle" aria-hidden="true" />
                            <span>{t("transactions.toolbar.addCredit")}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="erp-action-btn btn-primary"
                          title={t("transactions.toolbar.addCollectionTitle")}
                          onClick={settlementsLink}
                        >
                          <i className="fas fa-hand-holding-usd" aria-hidden="true" />
                          <span>{t("transactions.toolbar.addCollection")}</span>
                          <span className="sr-only">
                            {" "}
                            {t("translation:common.a11y.opensInNewTab")}
                          </span>
                        </button>
                        {canPost && (
                          <button
                            type="button"
                            className="erp-action-btn btn-danger"
                            title={t("transactions.toolbar.addDebtTitle")}
                            onClick={() => setDocumentSide("PAYABLE")}
                          >
                            <i className="fas fa-plus-circle" aria-hidden="true" />
                            <span>{t("transactions.toolbar.addDebt")}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="erp-action-btn btn-warning"
                          title={t("transactions.toolbar.addPaymentTitle")}
                          onClick={settlementsLink}
                        >
                          <i className="fas fa-money-check-alt" aria-hidden="true" />
                          <span>{t("transactions.toolbar.addPayment")}</span>
                          <span className="sr-only">
                            {" "}
                            {t("translation:common.a11y.opensInNewTab")}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="erp-action-btn btn-secondary"
                          title={t("transactions.toolbar.statementTitle")}
                          onClick={openStatement}
                          style={{ background: "linear-gradient(135deg, #6c757d, #495057)" }}
                        >
                          <i className="fas fa-file-alt" aria-hidden="true" />
                          <span>{t("transactions.toolbar.statement")}</span>
                          <span className="sr-only">
                            {" "}
                            {t("translation:common.a11y.opensInNewTab")}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="erp-action-btn btn-info"
                          title={t("transactions.toolbar.purchaseInvoicesTitle")}
                          onClick={() => setInvoices("PURCHASE")}
                          style={{ background: "linear-gradient(135deg, #17a2b8, #138496)" }}
                        >
                          <i className="fas fa-file-invoice-dollar" aria-hidden="true" />
                          <span>{t("transactions.toolbar.purchaseInvoices")}</span>
                        </button>
                        <button
                          type="button"
                          className="erp-action-btn btn-info"
                          title={t("transactions.toolbar.salesInvoicesTitle")}
                          onClick={() => setInvoices("SALES")}
                          style={{
                            background: customer
                              ? "linear-gradient(135deg, #78c1b2, #138496)"
                              : "linear-gradient(135deg,   #5CE65C ,#008000)",
                          }}
                        >
                          <i className="fas fa-file-invoice-dollar" aria-hidden="true" />
                          <span>{t("transactions.toolbar.salesInvoices")}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <TransactionTables
                  account={a}
                  tabs={tabs}
                  tab={tab}
                  onTab={setTab}
                  rows={rows}
                  balances={balances}
                  seasons={seasons}
                  seasonSelected={season !== SEASON_ALL}
                  loading={transactions.isFetching}
                  showInvoiceDate={INVOICE_DATE_GROUPS.has(a.subGroup)}
                  typeName={typeName}
                  canVoidRows={canPost}
                  canEditDocuments={canPost}
                  onDetail={(r) => setDetailId(r.id)}
                  onEdit={(r) => {
                    setReviseId(r.sourceId);
                    setDocumentSide(r.kind === "RECEIVABLE" ? "RECEIVABLE" : "PAYABLE");
                  }}
                  onDelete={setDeleting}
                  tabActions={
                    canManage ? (
                      <>
                        <button
                          type="button"
                          className="erp-action-btn"
                          id="btnCariDevir"
                          title={t("transactions.tabs.rolloverTitle")}
                          style={{
                            color: "#0f766e",
                            borderColor: "#99f6e4",
                            background: "#f0fdfa",
                            whiteSpace: "nowrap",
                          }}
                          onClick={() => setRolloverOpen(true)}
                        >
                          <i className="fas fa-calendar-check" aria-hidden="true" />
                          <span>{t("transactions.tabs.rollover")}</span>
                        </button>
                        <button
                          type="button"
                          className="erp-action-btn"
                          id="btnCariTasima"
                          title={t("transactions.tabs.transferTitle")}
                          style={{
                            color: "#4338ca",
                            borderColor: "#c7d2fe",
                            background: "#eef2ff",
                            whiteSpace: "nowrap",
                          }}
                          onClick={() => setTransferOpen(true)}
                        >
                          <i className="fas fa-exchange-alt" aria-hidden="true" />
                          <span>{t("transactions.tabs.transfer")}</span>
                        </button>
                      </>
                    ) : null
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <DocumentModal
        show={documentSide !== null}
        onHide={() => {
          setDocumentSide(null);
          setReviseId(null);
        }}
        side={documentSide ?? "PAYABLE"}
        account={a}
        documentId={reviseId}
        defaultCurrency={currency}
        defaultBranchId={branchFilter || a.branchId || ""}
      />
      <TransactionDetailModal transactionId={detailId} onHide={() => setDetailId(null)} />
      <DeleteTransactionModal
        row={deleting}
        typeLabel={deleting ? typeName(deleting) || t(`transactions.kind.${deleting.kind}`) : ""}
        onHide={() => setDeleting(null)}
      />
      <EditLimitsModal
        show={limitsOpen}
        onHide={() => setLimitsOpen(false)}
        account={a}
        companyId={multiCompany ? activeCompanyId : null}
        companyName={companyName}
        currency={a.defaultCurrency ?? currency}
      />
      {invoices && (
        <InvoicesModal
          show
          onHide={() => setInvoices(null)}
          direction={invoices}
          account={a}
          currency={currency}
        />
      )}
      {canManage && (
        <>
          <RolloverModal
            show={rolloverOpen}
            onHide={() => setRolloverOpen(false)}
            accountId={a.id}
            onSeasonChange={(rid) => setParam("rolloverId", rid)}
          />
          <CariTransferModal
            show={transferOpen}
            onHide={() => setTransferOpen(false)}
            account={a}
          />
        </>
      )}
    </>
  );
}
