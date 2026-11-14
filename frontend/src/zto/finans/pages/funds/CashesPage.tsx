import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../../../auth/authStore";
import { useCan, useMultiCompany } from "../../../../pages/finance/common";
import { useFundList, useFundSparklines } from "../../../../pages/finance/fundApi";
import { useBranchTree } from "../../../branch/branchTree";
import { ZtoAlert, formatNumber } from "../../../components";
import { errorCode, errorMessage } from "../../../components/definitionLogic";
import { ZTO_FINANS_BASE, ZTO_SLUGS, fundTransactionsPath, newCashPath } from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { ZtoPageLoading } from "../../ZtoSuspenseOutlet";
import type { FundFlash } from "./BanksPage";
import { CashCard } from "./CashCard";
import { CashDetailModal } from "./CashDetailModal";
import { FundDeleteModal } from "./FundDeleteModal";
import { FundGroupHeader } from "./FundGroupHeader";
import {
  FilterIndicator,
  SearchCard,
  SearchIndicator,
  SearchNoResults,
  StatCard,
  useChipFilters,
  useFilteredCards,
  useFundSearch,
  useRefreshState,
} from "./FundListParts";
import {
  CASH_GROUP_MODES,
  branchIndex,
  buildCard,
  cashGroupCounts,
  cashStats,
  companyNames,
  groupCashes,
  parseCashGroup,
  progressPct,
  statItems,
  toggleChip,
  type CashGroupMode,
  type FundCard,
} from "./fundsLogic";

const TAB_ICON: Record<CashGroupMode, string> = {
  all: "fas fa-list",
  workplace: "fas fa-industry",
  branch: "fas fa-building",
  currency: "fas fa-coins",
  company: "fas fa-landmark",
};
const HEADER_ICON = {
  background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
  color: "white",
};

/**
 * Kasalar (ZTO CashIntroduction/Index.cshtml + _CashCardsListPartial.cshtml; 12.2 §5.8). Gruplama kipi
 * `?group=all|workplace|branch|currency|company` (varsayılan workplace; şirket kipi ≥ 2 şirkette,
 * Blackrose eki). Dört kart para birimi başına toplam/ortalama/açılış ve şube grubu sayısı.
 */
export function CashesPage() {
  useZtoRootClass("zto-page-cashes");
  const { t } = useTranslation("ztoFinans");
  const location = useLocation();
  const [params] = useSearchParams();
  const multiCompany = useMultiCompany();
  const mode = parseCashGroup(params.get("group"), multiCompany);
  const canManage = useCan("FINANCE_MANAGE");
  const canPost = useCan("FINANCE_PAYMENT_CREATE");
  const me = useAuthStore((state) => state.me);
  const [flash, setFlash] = useState<FundFlash | null>(
    () => (location.state as { flash?: FundFlash } | null)?.flash ?? null,
  );
  const [deleting, setDeleting] = useState<FundCard | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const list = useFundList({ kind: "CASH" });
  const tree = useBranchTree();
  const refresh = useRefreshState(list.refetch);
  const search = useFundSearch();
  const chips = useChipFilters();

  const funds = useMemo(() => list.data ?? [], [list.data]);
  const branches = useMemo(() => branchIndex(tree.data), [tree.data]);
  const companies = useMemo(() => companyNames(me?.companies), [me?.companies]);
  const cards = useMemo(
    () => funds.map((f) => buildCard(f, branches, companies)),
    [funds, branches, companies],
  );
  const visible = useFilteredCards(cards, chips.filters, search.words);
  const sparks = useFundSparklines(funds.map((f) => f.id));
  const sparkMap = useMemo(
    () => new Map((sparks.data ?? []).map((s) => [s.fundId, s.points])),
    [sparks.data],
  );
  const stats = useMemo(() => cashStats(cards), [cards]);
  const counts = useMemo(() => cashGroupCounts(cards), [cards]);
  const c = (key: string, options?: Record<string, unknown>) => t(`funds.cashes.${key}`, options);
  const groups = useMemo(
    () => groupCashes(visible, mode, t("funds.cashes.groupAll"), t("funds.common.unknown")),
    [visible, mode, t],
  );

  if (list.isPending) return <ZtoPageLoading />;

  const chipCard = (
    type: "company" | "workplace" | "bank" | "currency",
    title: string,
    icon: string,
    filterType: string,
    allLabel?: string,
  ) => (
    <StatCard
      key={type}
      title={title}
      iconClassName={icon}
      filterType={filterType}
      items={statItems(cards, visible, type, chips.filters[type], allLabel)}
      active={chips.filters[type] ?? null}
      onToggle={(value) => chips.toggle(type, toggleChip(chips.filters[type], value))}
    />
  );
  const accountsPath = `${ZTO_FINANS_BASE}/${ZTO_SLUGS.accounts}`;
  const tabs = CASH_GROUP_MODES.filter((m) => m !== "company" || multiCompany);
  const refreshCode = errorCode(refresh.error) ?? errorMessage(refresh.error, "-");

  return (
    <div className="container-fluid">
      <br />
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap">
        <div className="d-flex align-items-center">
          <Link
            to={accountsPath}
            className="erp-btn erp-btn-secondary mr-3"
            title={t("funds.common.backToAccounts")}
          >
            <i className="fas fa-arrow-left" aria-hidden="true" />
            <span className="d-none d-md-inline">{t("funds.common.back")}</span>
          </Link>
          <div className="erp-header-icon" style={HEADER_ICON} aria-hidden="true">
            <i className="fas fa-cash-register" />
          </div>
          <div>
            <h5 className="mb-0 font-weight-bold">{c("title")}</h5>
            <div className="erp-breadcrumb">
              <Link to={accountsPath}>{t("funds.common.finance")}</Link>
              <span className="separator" aria-hidden="true">
                /
              </span>
              <span aria-current="page">{c("title")}</span>
            </div>
          </div>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <Link to={fundTransactionsPath("CASH")} className="erp-btn erp-btn-success mr-2">
            <i className="fas fa-exchange-alt" aria-hidden="true" />
            <span>{c("allTransactions")}</span>
          </Link>
          <div className="btn-divider" />
          <Link
            to={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.banks}`}
            className="erp-btn erp-btn-primary mr-2"
          >
            <i className="fas fa-university" aria-hidden="true" />
            <span>{c("banks")}</span>
          </Link>
          <Link to={fundTransactionsPath("BANK")} className="erp-btn erp-btn-info mr-2">
            <i className="fas fa-money-check-alt" aria-hidden="true" />
            <span>{c("allBankTransactions")}</span>
          </Link>
          {canManage && (
            <>
              <div className="btn-divider" />
              <Link to={newCashPath()} className="erp-btn erp-btn-warning">
                <i className="fas fa-plus" aria-hidden="true" />
                <span>{c("newCash")}</span>
              </Link>
            </>
          )}
        </div>
      </div>

      {flash && (
        <ZtoAlert
          variant={flash.variant}
          message={
            <>
              <i
                className={`fas ${flash.variant === "success" ? "fa-check-circle" : "fa-exclamation-circle"}`}
                aria-hidden="true"
              />{" "}
              {flash.message}
            </>
          }
          onClose={() => setFlash(null)}
        />
      )}
      {refresh.error !== null && (
        <ZtoAlert
          variant="danger"
          message={`${t("funds.list.refreshFailed")} ${t("funds.list.refreshError", { code: refreshCode })}`}
          onClose={refresh.dismiss}
        />
      )}
      {list.isError && (
        <div className="alert alert-danger" role="alert">
          {errorMessage(list.error, c("loadFailed"))}
        </div>
      )}

      <div className="row mb-3">
        <div className="col-lg-3 col-md-6 col-6 mb-2">
          <div className="erp-stat-card card-count">
            <div className="erp-stat-content">
              <div className="erp-stat-icon" aria-hidden="true">
                <i className="fas fa-wallet" />
              </div>
              <div className="erp-stat-details">
                <span className="erp-stat-label">{c("stat.total")}</span>
                <div className="erp-currency-compact-list">
                  {stats.currencies.map((s) => (
                    <div key={s.currency} className="erp-currency-compact-item">
                      <span className="amount">
                        {formatNumber(s.total, 0)} {s.symbol}
                      </span>
                      <span className="meta">{c("stat.totalMeta", { count: s.count })}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-lg-3 col-md-6 col-6 mb-2">
          <div className="erp-stat-card card-average">
            <div className="erp-stat-content">
              <div className="erp-stat-icon" aria-hidden="true">
                <i className="fas fa-chart-bar" />
              </div>
              <div className="erp-stat-details">
                <span className="erp-stat-label">{c("stat.average")}</span>
                <div className="erp-currency-compact-list">
                  {stats.currencies.map((s) => (
                    <div key={s.currency} className="erp-currency-compact-item">
                      <span className="amount">
                        {formatNumber(s.average, 0)} {s.symbol}
                      </span>
                      <span className="meta">{c("stat.averageMeta")}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-lg-3 col-md-6 col-6 mb-2">
          <div className="erp-stat-card card-count">
            <div className="erp-stat-content">
              <div className="erp-stat-icon" aria-hidden="true">
                <i className="fas fa-coins" />
              </div>
              <div className="erp-stat-details">
                <span className="erp-stat-label">{c("stat.opening")}</span>
                <div className="erp-currency-compact-list">
                  {stats.currencies.map((s) => (
                    <div key={s.currency} className="erp-currency-compact-item">
                      <span className="amount">
                        {formatNumber(s.opening, 0)} {s.symbol}
                      </span>
                      <span className="meta">{c("stat.openingMeta")}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="col-lg-3 col-md-6 col-6 mb-2">
          <div className="erp-stat-card card-methods">
            <div className="erp-stat-content">
              <div className="erp-stat-icon" aria-hidden="true">
                <i className="fas fa-building" />
              </div>
              <div className="erp-stat-details">
                <span className="erp-stat-label">{c("stat.branches")}</span>
                <div className="erp-stat-value">{stats.branchCount}</div>
                <span className="erp-stat-subtext">
                  {c("stat.branchesSub", { count: stats.currencyCount })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="filters-toolbar search-container">
        <SearchCard
          inputId="cashSearchInput"
          clearId="clearCashSearch"
          buttonId="searchCashButton"
          placeholder={c("search.placeholder")}
          label={c("search.label")}
          search={search}
          autoFocus
        />
        <div className="dynamic-filter-cards">
          {multiCompany &&
            chipCard("company", t("funds.common.companies"), "fas fa-landmark", "companyname")}
          {chipCard(
            "workplace",
            t("funds.list.workplaces"),
            "fas fa-building text-success",
            "workplacename",
          )}
          {chipCard(
            "bank",
            c("chips.cashes"),
            "fas fa-cash-register text-primary",
            "cashname",
            c("chips.allCashes"),
          )}
          {chipCard(
            "currency",
            t("funds.list.currencies"),
            "fas fa-coins text-warning",
            "currencysymbol",
          )}
        </div>
      </div>

      <FilterIndicator
        visible={visible.length}
        total={cards.length}
        filters={chips.filters}
        onClear={chips.clear}
      />

      <div className="type-tabs">
        {tabs.map((tab) => (
          <Link
            key={tab}
            to={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.cashes}?group=${tab}`}
            className={`type-tab ${tab}${mode === tab ? " active" : ""}`}
            aria-current={mode === tab ? "page" : undefined}
          >
            <i className={TAB_ICON[tab]} aria-hidden="true" /> {c(`tabs.${tab}`)}{" "}
            <span className="count">{counts[tab]}</span>
          </Link>
        ))}
        <button
          type="button"
          id="refreshCashesBtn"
          className={`type-tabs-refresh ${refresh.state}`.trim()}
          title={t("funds.list.refreshTitle")}
          aria-label={t("funds.list.refreshTitle")}
          aria-busy={refresh.state === "is-refreshing"}
          onClick={() => void refresh.run()}
        >
          <i className="fas fa-sync-alt" aria-hidden="true" />
          <span>{t("funds.list.refresh")}</span>
        </button>
      </div>

      <SearchIndicator term={search.term} count={visible.length} onClear={search.clear} />

      <div id="accountListContainer" className="account-list-container">
        {search.words.length > 0 && visible.length === 0 && cards.length > 0 && (
          <SearchNoResults
            text={c("search.noResultsText", { term: search.term })}
            onClear={search.clear}
          />
        )}
        {cards.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">
              <i className="fas fa-cash-register" />
            </div>
            <h3 className="empty-state-title">{c("empty.title")}</h3>
            <p className="empty-state-description">{c("empty.text")}</p>
            {canManage && (
              <Link to={newCashPath()} className="btn btn-warning btn-lg">
                <i className="fas fa-plus" aria-hidden="true" /> {c("empty.create")}
              </Link>
            )}
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.key}>
              <FundGroupHeader
                variant="cash"
                icon={group.icon}
                color="#d97706"
                name={group.name}
                countText={c("groupCount", { count: group.cards.length })}
                totals={group.totals}
              />
              {group.cards.map((card) => (
                <CashCard
                  key={card.fund.id}
                  card={card}
                  pct={progressPct(card, group.cards)}
                  words={search.words}
                  deltas={sparkMap.get(card.fund.id) ?? (sparks.isPending ? null : [])}
                  canManage={canManage}
                  canPost={canPost}
                  multiCompany={multiCompany}
                  onDetail={(selected) => setDetailId(selected.fund.id)}
                  onDelete={setDeleting}
                />
              ))}
              <div className="mb-4" />
            </div>
          ))
        )}
      </div>

      <CashDetailModal
        fundId={detailId}
        onHide={() => setDetailId(null)}
        branches={branches}
        companyName={(id) => companies.get(id) ?? ""}
        multiCompany={multiCompany}
      />
      <FundDeleteModal
        fund={deleting?.fund ?? null}
        onHide={() => setDeleting(null)}
        onDeleted={() => {
          setDeleting(null);
          setFlash({ variant: "success", message: c("deleted") });
        }}
        onDeactivated={() => {
          setDeleting(null);
          setFlash({ variant: "success", message: c("deactivated") });
        }}
        onError={(message) => {
          setDeleting(null);
          setFlash({ variant: "danger", message });
        }}
      />
    </div>
  );
}
