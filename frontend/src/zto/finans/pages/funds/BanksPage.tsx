import { useQueries } from "@tanstack/react-query";
import { CSSProperties, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { apiGet } from "../../../../api/client";
import { useAuthStore } from "../../../../auth/authStore";
import { useActiveCompanyId } from "../../../../auth/companyStore";
import { useCan, useMultiCompany } from "../../../../pages/finance/common";
import { useFundList, useFundSparklines, useFundSummary } from "../../../../pages/finance/fundApi";
import type { FundAccountType, Page } from "../../../../pages/finance/types";
import { useBranchTree } from "../../../branch/branchTree";
import { ZtoAlert, formatNumber } from "../../../components";
import { errorCode, errorMessage } from "../../../components/definitionLogic";
import {
  ZTO_FINANS_BASE,
  ZTO_SLUGS,
  fundTransactionsPath,
  newBankPath,
  transferCenterPath,
} from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { ZtoPageLoading } from "../../ZtoSuspenseOutlet";
import { MenuItem, PhaseMenuItem, ZtoMenuButton } from "../accounts/AccountsMenu";
import { BankAccountCard } from "./BankAccountCard";
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
  ACCOUNT_TYPES,
  APPROVAL_BADGES,
  accountTypeMeta,
  branchIndex,
  buildCard,
  companyNames,
  groupBanks,
  parseAccountType,
  progressPct,
  statItems,
  summaryByType,
  toggleChip,
  typeCounts,
  type FundCard,
} from "./fundsLogic";

export type FundFlash = { variant: "success" | "danger"; message: string };

const BADGE: CSSProperties = { color: "white", fontSize: 9, padding: "3px 7px" };
const MENU_ITEM: CSSProperties = { fontSize: 11 };
const STAT_CARD_CLASS: Record<FundAccountType, string> = {
  DEMAND: "card-total",
  CREDIT: "card-average",
  DEPOSIT: "card-count",
  INVESTMENT: "card-methods",
};
const TYPE_TAB_ICON: Record<FundAccountType | "ALL", string> = {
  ALL: "fa-list",
  DEMAND: "fa-wallet",
  CREDIT: "fa-hand-holding-usd",
  DEPOSIT: "fa-piggy-bank",
  INVESTMENT: "fa-chart-line",
};

/** "Ödeme Onay Yönetimi" rozet sayıları: plan durumlarının toplamı (`size=1`, `totalElements`). */
function useApprovalCounts(enabled: boolean) {
  const results = useQueries({
    queries: APPROVAL_BADGES.filter((b) => b.status !== "ORDERED").map((badge) => ({
      queryKey: ["finance", "fund-center", "plan-count", badge.status],
      queryFn: () =>
        apiGet<Page<unknown>>(`/finance/payment-plans?status=${badge.status}&page=0&size=1`),
      enabled,
      staleTime: 60_000,
    })),
  });
  const counts: Record<string, number> = { ORDERED: 0 };
  APPROVAL_BADGES.filter((b) => b.status !== "ORDERED").forEach((badge, index) => {
    counts[badge.status] = results[index]?.data?.totalElements ?? 0;
  });
  return counts;
}

/**
 * Bankalar (ZTO BankIntroduction/Index.cshtml + _AccountCardsListPartial.cshtml; 12.2 §5.5). Liste
 * aktif şirkete göre (konsolidede tümü); ≥ 2 şirkette "Şirketler" çip kartı ve konsolidede şirket
 * grup başlıkları (Blackrose eki, §5.12). Özet kartları tür sekmesinden bağımsız (ZTO B1 düzeltmesi).
 */
export function BanksPage() {
  useZtoRootClass("zto-page-banks");
  const { t } = useTranslation("ztoFinans");
  const location = useLocation();
  const [params] = useSearchParams();
  const typeFilter = parseAccountType(params.get("type"));
  const canManage = useCan("FINANCE_MANAGE");
  const canPost = useCan("FINANCE_PAYMENT_CREATE");
  const canPlans = useCan("FINANCE_VIEW");
  const multiCompany = useMultiCompany();
  const activeCompany = useActiveCompanyId();
  const me = useAuthStore((state) => state.me);
  const [flash, setFlash] = useState<FundFlash | null>(
    () => (location.state as { flash?: FundFlash } | null)?.flash ?? null,
  );
  const [deleting, setDeleting] = useState<FundCard | null>(null);

  const list = useFundList({ kind: "BANK" });
  const summary = useFundSummary({ kind: "BANK" });
  const tree = useBranchTree();
  const approval = useApprovalCounts(canPlans);
  const refresh = useRefreshState(list.refetch);
  const search = useFundSearch();
  const chips = useChipFilters();

  const funds = useMemo(() => list.data ?? [], [list.data]);
  const cards = useMemo(() => {
    const branches = branchIndex(tree.data);
    const companies = companyNames(me?.companies);
    return funds
      .filter((f) => typeFilter === null || (f.accountType ?? "DEMAND") === typeFilter)
      .map((f) => buildCard(f, branches, companies));
  }, [funds, tree.data, me?.companies, typeFilter]);
  const visible = useFilteredCards(cards, chips.filters, search.words);
  const sparks = useFundSparklines(funds.map((f) => f.id));
  const sparkMap = useMemo(
    () => new Map((sparks.data ?? []).map((s) => [s.fundId, s.points])),
    [sparks.data],
  );
  const stats = useMemo(() => summaryByType(summary.data ?? [], "BANK"), [summary.data]);
  const counts = useMemo(() => typeCounts(funds), [funds]);
  const groups = useMemo(
    () => groupBanks(visible, multiCompany && activeCompany === null),
    [visible, multiCompany, activeCompany],
  );

  if (list.isPending) return <ZtoPageLoading />;

  const b = (key: string, options?: Record<string, unknown>) => t(`funds.banks.${key}`, options);
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
  const hasSearch = search.words.length > 0;
  const refreshCode = errorCode(refresh.error) ?? errorMessage(refresh.error, "-");

  return (
    <div className="container-fluid">
      <br />
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap">
        <div className="d-flex align-items-center">
          <Link
            to={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.accounts}`}
            className="erp-btn erp-btn-secondary mr-3"
            title={t("funds.common.backToAccounts")}
          >
            <i className="fas fa-arrow-left" aria-hidden="true" />
            <span className="d-none d-md-inline">{t("funds.common.home")}</span>
          </Link>
          <div className="erp-header-icon" aria-hidden="true">
            <i className="fas fa-university" />
          </div>
          <div>
            <h5 className="mb-0 font-weight-bold" id="banksTitle">
              {b("title")}
            </h5>
            <div className="erp-breadcrumb">
              <Link to={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.accounts}`}>
                {t("funds.common.finance")}
              </Link>
              <span className="separator" aria-hidden="true">
                /
              </span>
              <span aria-current="page">{b("title")}</span>
            </div>
          </div>
        </div>
        <div className="d-flex gap-2 flex-wrap">
          <a
            href="/finance/plans"
            target="_blank"
            rel="noopener noreferrer"
            id="paymentApprovalBtn"
            className="erp-btn erp-btn-warning mr-2"
          >
            <i className="fas fa-check-circle" aria-hidden="true" />
            <span>{b("approval")}</span>
            <div className="d-inline-flex align-items-center ml-2 gap-1">
              {APPROVAL_BADGES.map((badge) =>
                (approval[badge.status] ?? 0) > 0 ? (
                  <span
                    key={badge.status}
                    className="badge badge-pill mr-1"
                    title={b(`approvalStatus.${badge.status}`)}
                    style={{ ...BADGE, background: badge.gradient }}
                  >
                    {approval[badge.status]}
                    <span className="sr-only"> {b(`approvalStatus.${badge.status}`)}</span>
                  </span>
                ) : null,
              )}
            </div>
          </a>
          <div className="btn-divider" />
          <Link to={fundTransactionsPath("BANK")} className="erp-btn erp-btn-info mr-2">
            <i className="fas fa-exchange-alt" aria-hidden="true" />
            <span>{b("allTransactions")}</span>
          </Link>
          <Link
            to={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.cashes}`}
            className="erp-btn erp-btn-warning mr-2"
          >
            <i className="fas fa-cash-register" aria-hidden="true" />
            <span>{b("cashes")}</span>
          </Link>
          <div className="btn-divider" />
          <Link
            to={transferCenterPath()}
            className="erp-btn erp-btn-success mr-2"
            title={b("transferTitle")}
          >
            <i className="fas fa-exchange-alt" aria-hidden="true" />
            <span>{b("transfer")}</span>
          </Link>
          <div className="btn-divider" />
          <ZtoMenuButton
            buttonClassName="erp-btn erp-btn-info dropdown-toggle"
            label={
              <>
                <i className="fas fa-chart-pie" aria-hidden="true" />
                <span>{b("creditInvest")}</span>
              </>
            }
          >
            <PhaseMenuItem
              icon="fas fa-hand-holding-usd text-warning mr-2"
              label={b("credits")}
              step="12.5"
              className="dropdown-item"
              style={MENU_ITEM}
            />
            <PhaseMenuItem
              icon="fas fa-piggy-bank text-success mr-2"
              label={b("deposits")}
              step="12.6"
              className="dropdown-item"
              style={MENU_ITEM}
            />
            <MenuItem
              icon="fas fa-chart-line text-info mr-2"
              label={
                <>
                  {b("investments")}
                  <span className="sr-only"> ({t("funds.common.outOfScope")})</span>
                </>
              }
              className="dropdown-item disabled"
              style={MENU_ITEM}
              title={t("funds.common.outOfScope")}
            />
          </ZtoMenuButton>
          {canManage && (
            <>
              <div className="btn-divider" />
              <Link to={newBankPath()} className="erp-btn erp-btn-primary" title={b("newDemand")}>
                <i className="fas fa-plus" aria-hidden="true" />
                <span>{b("newDemand")}</span>
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
          {errorMessage(list.error, b("loadFailed"))}
        </div>
      )}

      <div className="row mb-1">
        {ACCOUNT_TYPES.map((type) => {
          const stat = stats[type];
          return (
            <div key={type} className="col-lg-3 col-md-6 col-6 mb-2">
              <div className={`erp-stat-card ${STAT_CARD_CLASS[type]}`}>
                <div className="erp-stat-content">
                  <div className="erp-stat-icon" aria-hidden="true">
                    <i className={`fas ${accountTypeMeta(type).icon}`} />
                  </div>
                  <div className="erp-stat-details">
                    <span className="erp-stat-label">{b(`stat.${type}`)}</span>
                    <div className="erp-currency-compact-list">
                      {stat.currencies.map((c) => (
                        <div key={c.currency} className="erp-currency-compact-item">
                          <span className={type === "CREDIT" ? "amount text-danger" : "amount"}>
                            {formatNumber(c.total, 0)} {c.symbol}
                          </span>
                          <span className="meta">{c.count}</span>
                        </div>
                      ))}
                    </div>
                    <span className="erp-stat-subtext">
                      {b(`stat.${type}Sub`, { count: stat.count })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="filters-toolbar search-container">
        <SearchCard
          inputId="accountSearchInput"
          clearId="clearSearch"
          buttonId="searchButton"
          placeholder={b("search.placeholder")}
          label={b("search.label")}
          search={search}
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
            b("chips.banks"),
            "fas fa-university text-primary",
            "bankname",
            b("chips.allBanks"),
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
        {(["ALL", ...ACCOUNT_TYPES] as const).map((tab) => {
          const active = tab === "ALL" ? typeFilter === null : typeFilter === tab;
          const slug = tab === "ALL" ? "all" : accountTypeMeta(tab).slug;
          return (
            <Link
              key={tab}
              to={
                tab === "ALL"
                  ? `${ZTO_FINANS_BASE}/${ZTO_SLUGS.banks}`
                  : `${ZTO_FINANS_BASE}/${ZTO_SLUGS.banks}?type=${tab}`
              }
              className={`type-tab ${slug}${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <i className={`fas ${TYPE_TAB_ICON[tab]}`} aria-hidden="true" /> {b(`tabs.${tab}`)}{" "}
              <span className="count">{counts[tab]}</span>
            </Link>
          );
        })}
        <button
          type="button"
          id="refreshAccountsBtn"
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
        {hasSearch && visible.length === 0 && cards.length > 0 && (
          <SearchNoResults
            text={b("search.noResultsText", { term: search.term })}
            onClear={search.clear}
          />
        )}
        {cards.length === 0 ? (
          <div className="text-center py-5">
            <i className="fas fa-university fa-4x text-muted mb-3" aria-hidden="true" />
            <h5 className="text-muted">{b("empty.title")}</h5>
            <p className="text-muted">{b("empty.text")}</p>
            {canManage && (
              <Link to={newBankPath()} className="btn btn-primary">
                <i className="fas fa-plus" aria-hidden="true" /> {b("newDemand")}
              </Link>
            )}
          </div>
        ) : (
          groups.map((company) => (
            <div key={company.companyId ?? "all"}>
              {company.companyId !== null && (
                <FundGroupHeader
                  variant="account"
                  icon="fa-landmark"
                  color="#334155"
                  name={company.companyName}
                  countText={b("groupCount", {
                    count: company.types.reduce((acc, g) => acc + g.cards.length, 0),
                  })}
                  totals={company.totals}
                />
              )}
              {company.types.map((group) => {
                const meta = accountTypeMeta(group.type);
                return (
                  <div key={group.type}>
                    <FundGroupHeader
                      variant="account"
                      icon={meta.icon}
                      color={meta.color}
                      name={b(`groups.${group.type}`)}
                      countText={b("groupCount", { count: group.cards.length })}
                      totals={group.totals}
                      totalColor={group.type === "CREDIT" ? "#ef4444" : meta.color}
                    />
                    {group.cards.map((card) => (
                      <BankAccountCard
                        key={card.fund.id}
                        card={card}
                        pct={progressPct(card, group.cards)}
                        words={search.words}
                        deltas={sparkMap.get(card.fund.id) ?? (sparks.isPending ? null : [])}
                        canManage={canManage}
                        canPost={canPost}
                        multiCompany={multiCompany}
                        onDelete={setDeleting}
                      />
                    ))}
                    <div className="mb-4" />
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      <FundDeleteModal
        fund={deleting?.fund ?? null}
        onHide={() => setDeleting(null)}
        onDeleted={() => {
          setDeleting(null);
          setFlash({ variant: "success", message: b("deleted") });
        }}
        onDeactivated={() => {
          setDeleting(null);
          setFlash({ variant: "success", message: b("deactivated") });
        }}
        onError={(message) => {
          setDeleting(null);
          setFlash({ variant: "danger", message });
        }}
      />
    </div>
  );
}
