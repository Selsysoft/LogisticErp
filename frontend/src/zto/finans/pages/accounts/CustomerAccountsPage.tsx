import { createColumnHelper } from "@tanstack/react-table";
import {
  createContext,
  KeyboardEvent,
  ReactNode,
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAuthStore } from "../../../../auth/authStore";
import { activeCompanies } from "../../../../auth/companyStore";
import {
  setAccountActive,
  useAccountGroups,
  useAccountHistory,
  useAccountList,
  useFinanceMutation,
} from "../../../../pages/finance/accountApi";
import { today as localToday, useCan, useMultiCompany } from "../../../../pages/finance/common";
import { useInvoiceGaps } from "../../../../pages/finance/fundApi";
import { missingByAccount } from "../../../../pages/finance/settlementWarnings";
import type { Account, CurrencyAmount } from "../../../../pages/finance/types";
import { flattenTree, useBranchTree } from "../../../branch/branchTree";
import {
  ZtoAlert,
  ZtoAuditCell,
  ZtoBranchMultiSelect,
  ZtoDataTable,
  ZtoDefinitionDetailsModal,
  ZtoTooltip,
  currencySymbol,
  formatDate,
  formatN2,
  formatNumber,
  useZtoConfirm,
  useZtoSnackbar,
  type DataTableLanguage,
} from "../../../components";
import { errorMessage } from "../../../components/definitionLogic";
import {
  ZTO_FINANS_BASE,
  ZTO_SLUGS,
  accountBankAccountsPath,
  accountEditPath,
  accountTransactionsPath,
  collectionsPath,
  paymentsPath,
  statementPath,
  transferCenterPath,
} from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { ZtoTopPanel } from "../../ZtoTopPanel";
import { useDefinitionNotice } from "../definitions/definitionHooks";
import { MenuDivider, MenuItem, PhaseButton, PhaseMenuItem, ZtoMenuButton } from "./AccountsMenu";
import {
  NO_QUICK_FILTERS,
  PLAN_FILTERS,
  accountStats,
  applyQuickFilters,
  branchLabelOf,
  buildRowsChunked,
  comparePlanDate,
  defaultOrder,
  groupAction,
  groupCollator,
  groupFilterOptions,
  invoiceGapAmounts,
  plannedTry,
  planDateClass,
  rowClassOf,
  totalsModes,
  type AccountRow,
  type FinanceEntry,
  type PlanFilter,
  type QuickFilters,
  type TotalsMode,
} from "./accountsListLogic";

const column = createColumnHelper<AccountRow>();

/** CAI:5839 "dom". */
const ACCOUNTS_DOM =
  '<"row align-items-center mb-2"<"col-12 col-md dt-length-col"l><"col-12 col-md-auto dt-filter-center"f><"col d-none d-md-block dt-toggle-col text-right">>rt<"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>';
const LENGTH_MENU = [10, 25, 50, 100, -1];
const ROTATE_MS = 5000;
const TH = "th-modern";

// ---------------------------------------------------------------------------------------------
// Dönen para birimi hücreleri (CAI startCurrencyRotators: tek global sayaç, 5 sn; satır üzerinde
// fare ya da odak varken durur; noktaya tıklayınca o öğe).
// ---------------------------------------------------------------------------------------------

type Rotation = {
  indexFor: (id: string, count: number) => number;
  pause: (id: string, paused: boolean) => void;
  select: (id: string, index: number) => void;
};

const RotationContext = createContext<Rotation>({
  indexFor: () => 0,
  pause: () => undefined,
  select: () => undefined,
});

function RotationProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState<ReadonlyMap<string, number>>(new Map());
  const offsets = useRef(new Map<string, number>());
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), ROTATE_MS);
    return () => clearInterval(timer);
  }, []);
  const position = useCallback(
    (id: string) => paused.get(id) ?? tick + (offsets.current.get(id) ?? 0),
    [paused, tick],
  );
  const value = useMemo<Rotation>(
    () => ({
      indexFor: (id, count) => (count <= 1 ? 0 : ((position(id) % count) + count) % count),
      pause: (id, on) =>
        setPaused((current) => {
          if (on === current.has(id)) return current;
          const next = new Map(current);
          if (on) {
            next.set(id, tick + (offsets.current.get(id) ?? 0));
          } else {
            offsets.current.set(id, (current.get(id) ?? tick) - tick);
            next.delete(id);
          }
          return next;
        }),
      select: (id, index) => {
        offsets.current.set(id, index - tick);
        setPaused((current) => {
          if (!current.has(id)) return current;
          const next = new Map(current);
          next.set(id, index);
          return next;
        });
      },
    }),
    [position, tick],
  );
  return <RotationContext.Provider value={value}>{children}</RotationContext.Provider>;
}

type AmountField = "debt" | "payment" | "receivable" | "collection";

const FIELD_STYLE: Record<AmountField, { cls: string; wrap: string; badge: string }> = {
  debt: { cls: "text-danger", wrap: "currency-rotator-debt", badge: "cbr-r" },
  payment: { cls: "text-success", wrap: "currency-rotator-payment", badge: "cbr-g" },
  receivable: { cls: "text-success", wrap: "currency-rotator-credit", badge: "cbr-b" },
  collection: { cls: "text-success", wrap: "currency-rotator-collection", badge: "cbr-a" },
};

function ScopeBadge({ entry }: { entry: FinanceEntry }) {
  const { t } = useTranslation("ztoFinans");
  if (entry.scopeLabel === null && !entry.scopeUndefined) return null;
  const label = entry.scopeLabel ?? t("accounts.row.undefinedWorkPlace");
  return (
    <small
      className={`account-workplace-badge ${entry.scopeUndefined ? "wp-o" : "wp-s"}`}
      title={
        entry.scopeUndefined ? t("accounts.row.undefinedWorkPlace") : t("accounts.row.workPlace")
      }
    >
      <i
        className={`faw ${entry.scopeUndefined ? "fa-exclamation-triangle" : "fa-building"}`}
        style={{ fontSize: 8 }}
        aria-hidden="true"
      />{" "}
      {label}
    </small>
  );
}

function AmountSpan({
  entry,
  field,
  rotating,
}: {
  entry: FinanceEntry;
  field: AmountField | "balance";
  rotating: boolean;
}) {
  const { t } = useTranslation("ztoFinans");
  const symbol = currencySymbol(entry.currency);
  if (field === "balance") {
    const b = entry.balance;
    const title =
      b.tone === "debt"
        ? t("accounts.row.debt")
        : b.tone === "credit"
          ? t("accounts.row.credit")
          : t("accounts.row.balanced");
    return (
      <span className={`${b.className} ca-b`}>
        {formatN2(b.abs)}{" "}
        <small className={rotating ? `currency-badge-rotating ${b.badgeClass}` : undefined}>
          {symbol}
        </small>{" "}
        <i className={`faw ${b.icon}`} title={title} aria-hidden="true" />
        <span className="sr-only">{title}</span>
        <ScopeBadge entry={entry} />
      </span>
    );
  }
  const style = FIELD_STYLE[field];
  return (
    <span className={`${style.cls} ca-a`}>
      {formatN2(entry[field])}{" "}
      <small className={rotating ? `currency-badge-rotating ${style.badge}` : undefined}>
        {symbol}
      </small>
      <ScopeBadge entry={entry} />
    </span>
  );
}

function RotatingAmounts({
  row,
  field,
  dots = false,
  pauseIcon = false,
}: {
  row: AccountRow;
  field: AmountField | "balance";
  dots?: boolean;
  pauseIcon?: boolean;
}) {
  const rotation = useContext(RotationContext);
  const entries = row.entries;
  if (entries.length <= 1) {
    return <AmountSpan entry={entries[0]} field={field} rotating={false} />;
  }
  const active = rotation.indexFor(row.id, entries.length);
  const wrap = field === "balance" ? "currency-rotator-balance" : FIELD_STYLE[field].wrap;
  return (
    <div
      className={`currency-rotating-wrapper ${wrap}`}
      onMouseEnter={() => rotation.pause(row.id, true)}
      onMouseLeave={() => rotation.pause(row.id, false)}
      onFocus={() => rotation.pause(row.id, true)}
      onBlur={() => rotation.pause(row.id, false)}
    >
      {pauseIcon && <i className="faw fa-pause currency-pause-icon" aria-hidden="true" />}
      {entries.map((entry, index) => (
        <div
          key={entry.key}
          className={index === active ? "currency-item active" : "currency-item"}
          aria-hidden={index === active ? undefined : true}
        >
          <AmountSpan entry={entry} field={field} rotating />
        </div>
      ))}
      {dots && (
        <div className="currency-indicator" aria-hidden="true">
          {entries.map((entry, index) => (
            <span
              key={entry.key}
              className={index === active ? "currency-dot active" : "currency-dot"}
              onClick={(event) => {
                event.stopPropagation();
                rotation.select(row.id, index);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PairCell({
  row,
  first,
  second,
  labels,
}: {
  row: AccountRow;
  first: AmountField | "balance";
  second: AmountField;
  labels: [string, string];
}) {
  return (
    <>
      <div className="account-financial-pair__item currency-rotating-cell" data-label={labels[0]}>
        <RotatingAmounts
          row={row}
          field={first}
          dots={first === "debt"}
          pauseIcon={first === "debt"}
        />
      </div>
      <div className="account-financial-pair__item currency-rotating-cell" data-label={labels[1]}>
        <RotatingAmounts row={row} field={second} />
      </div>
    </>
  );
}

/**
 * Eksik fatura işareti (12.2 K-12.2-4, Blackrose eki; ZTO görsel dili): kırmızı ünlem + ipucu.
 * Yalnız renk değil: `aria-label` ve klavyeyle odaklanabilir kapsayıcı (ipucu odakta da açılır).
 */
function InvoiceGapMark({ row }: { row: AccountRow }) {
  const { t } = useTranslation("ztoFinans");
  if (row.invoiceGap.length === 0) return null;
  const label = t("accounts.row.invoiceGap", {
    amount: invoiceGapAmounts(row.invoiceGap, (a, c) => `${formatN2(a)} ${currencySymbol(c)}`),
  });
  return (
    <ZtoTooltip content={label}>
      <span className="account-invoice-gap" tabIndex={0} role="img" aria-label={label}>
        <i className="fas fa-exclamation-circle text-danger ml-1" aria-hidden="true" />
      </span>
    </ZtoTooltip>
  );
}

function PlannedCell({ planned, label }: { planned: CurrencyAmount[]; label: string }) {
  return (
    <div className="account-financial-pair__item" data-label={label}>
      {planned.length > 0 ? (
        planned.map((p) => (
          <span key={p.currency} className="text-primary ca-a">
            {formatN2(p.amount)} <small>{currencySymbol(p.currency)}</small>
          </span>
        ))
      ) : (
        <span className="text-muted">-</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Sayfa
// ---------------------------------------------------------------------------------------------

type DetailState = { account: Account; history: boolean } | null;

/**
 * Cari Kartlar (ZTO CustomerAccounts/Index.cshtml + _AccountsTableBody.cshtml; 12.1 §5.7). Üst panel,
 * düğme şeridi, filtre kartı, gizli istatistik kartları, `#customerAccountsTable`. Plan öğeleri
 * `planSummary`'den salt okunur, plan modalları "Faz 12.4" (OK-25). Sil = pasifleştir (OK-15).
 */
export function CustomerAccountsPage() {
  useZtoRootClass("customer-accounts-page");
  useZtoRootClass("zto-page-customer-accounts");
  const { t } = useTranslation("ztoFinans");
  const { t: tc } = useTranslation();
  const canManage = useCan("FINANCE_MANAGE");
  const canEmployee = useCan("FINANCE_EMPLOYEE_VIEW");
  const canFleet = useCan("FLEET_VIEW");
  const canPost = useCan("FINANCE_PAYMENT_CREATE");
  const multiCompany = useMultiCompany();
  const companies = useAuthStore((state) => state.me?.companies);
  const snackbar = useZtoSnackbar();
  const { confirm, confirmModal } = useZtoConfirm();
  const [notice, setNotice] = useDefinitionNotice();
  const today = localToday();

  const [planFilter, setPlanFilter] = useState<PlanFilter>("");
  const [groupDraft, setGroupDraft] = useState("");
  const [group, setGroup] = useState("");
  const [branchDraft, setBranchDraft] = useState<string[]>([]);
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [hideZeroDebt, setHideZeroDebt] = useState(false);
  const [hideCustomers, setHideCustomers] = useState(false);
  const [onlyRedBalance, setOnlyRedBalance] = useState(false);
  const [missingInvoice, setMissingInvoice] = useState(false);
  const [showPassive, setShowPassive] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [mode, setMode] = useState<TotalsMode>("CURRENCY");
  const [detail, setDetail] = useState<DetailState>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const groups = useAccountGroups();
  const list = useAccountList({
    subGroups: group ? [group] : undefined,
    branchIds: branchIds.length > 0 ? branchIds : undefined,
    active: showPassive ? undefined : true,
    balanceGroupBy: mode,
    includePlanSummary: true,
  });
  const tree = useBranchTree("all", true);
  // Eksik faturalı cariler: aktif şirket için tek istek (K-12.2-4 "cari listesi").
  const gaps = useInvoiceGaps({});
  const invoiceGaps = useMemo(() => missingByAccount(gaps.data ?? []), [gaps.data]);
  const history = useAccountHistory(detail?.account.id, { enabled: !!detail?.history });

  const names = useMemo(() => {
    const branch = new Map<string, { name: string; group: string | null }>();
    for (const company of tree.data ?? []) {
      for (const g of company.groups) {
        for (const b of g.branches) {
          branch.set(b.id, { name: b.name, group: g.groupId ? g.groupName : null });
        }
      }
    }
    const company = new Map(activeCompanies(companies).map((c) => [c.id, c.shortName]));
    return { branch, company, count: flattenTree(tree.data ?? []).length };
  }, [tree.data, companies]);

  // Satır modeli 50 ms bütçeli parçalarla kurulur (MWG break-up-long-tasks); bu sürede örtü görünür.
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [building, setBuilding] = useState(false);
  useEffect(() => {
    const data = list.data;
    if (!data) return;
    const controller = new AbortController();
    setBuilding(true);
    buildRowsChunked(
      defaultOrder(data, today),
      {
        today,
        mode,
        branchLabel: (id) => {
          const entry = names.branch.get(id);
          return entry ? branchLabelOf(entry.name, entry.group) : undefined;
        },
        branchName: (id) => names.branch.get(id)?.name,
        companyName: (id) => names.company.get(id),
        invoiceGaps,
      },
      { signal: controller.signal },
    )
      .then((built) => {
        setRows(built);
        setBuilding(false);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [list.data, mode, names, today, invoiceGaps]);

  const filters = useDeferredValue<QuickFilters>(
    useMemo(
      () => ({ plan: planFilter, hideZeroDebt, hideCustomers, onlyRedBalance, missingInvoice }),
      [planFilter, hideZeroDebt, hideCustomers, onlyRedBalance, missingInvoice],
    ),
  );
  const visible = useMemo(() => applyQuickFilters(rows, filters, today), [rows, filters, today]);
  const stats = useMemo(() => accountStats(list.data ?? [], today), [list.data, today]);

  const toggleActive = useFinanceMutation(
    ({ id, active }: { id: string; active: boolean }) => setAccountActive(id, active),
    {
      onSuccess: (_data, { active }) =>
        snackbar.show(
          active ? t("accounts.actions.activated") : t("accounts.actions.deactivated"),
          "success",
        ),
      onError: (error) => snackbar.show(errorMessage(error, t("accounts.actions.failed")), "error"),
    },
  );
  const { mutate: mutateActive } = toggleActive;

  const openDetail = useCallback((account: Account, withHistory: boolean) => {
    setDetail({ account, history: withHistory });
    setDetailOpen(true);
  }, []);

  const language = useMemo<DataTableLanguage>(() => {
    // Yerel metindeki {{total}} … DataTables yer tutucularına çevrilir; ZtoDataTable doldurur.
    const dt = { total: "_TOTAL_", start: "_START_", end: "_END_", max: "_MAX_", menu: "_MENU_" };
    return {
      info: t("accounts.language.info", dt),
      infoEmpty: t("accounts.language.infoEmpty"),
      infoFiltered: t("accounts.language.infoFiltered", dt),
      search: t("accounts.language.search"),
      lengthMenu: t("accounts.language.lengthMenu", dt),
      emptyTable: t("accounts.language.emptyTable"),
      zeroRecords: t("accounts.language.zeroRecords"),
    };
  }, [t]);

  const columns = useMemo(() => {
    const c = (key: string) => t(`accounts.columns.${key}`);
    const pair = (a: string, b: string) => `${c(a)} / ${c(b)}`;
    return [
      column.accessor((row) => row.nextDueDate ?? undefined, {
        id: "planDate",
        header: () => (
          <>
            <i className="fas fa-calendar mr-1" aria-hidden="true" />
            {c("planDate")}
          </>
        ),
        sortingFn: (a, b) => comparePlanDate(a.original.nextDueDate, b.original.nextDueDate),
        sortUndefined: "last",
        meta: {
          headerClassName: TH,
          exportHeader: c("planDate"),
          searchValue: (_value: string | undefined, row: AccountRow) =>
            row.nextDueDate ? formatDate(row.nextDueDate) : t("accounts.row.none"),
        },
        cell: ({ row: { original: row } }) =>
          row.nextDueDate ? (
            <span className={planDateClass(row.category)} style={{ fontWeight: 600, fontSize: 12 }}>
              <i className="faw fa-calendar-day mr-1" aria-hidden="true" />
              {formatDate(row.nextDueDate)}
            </span>
          ) : (
            <span className="text-muted" style={{ fontSize: 11 }}>
              <i className="faw fa-calendar-times mr-1" aria-hidden="true" />
              {t("accounts.row.none")}
            </span>
          ),
      }),
      column.accessor("code", {
        header: c("code"),
        enableSorting: false,
        meta: { headerClassName: TH },
        cell: ({ getValue }) => (
          <strong style={{ color: "#1e40af", fontSize: 11 }}>{getValue()}</strong>
        ),
      }),
      column.accessor("name", {
        id: "account",
        header: c("account"),
        enableSorting: false,
        meta: {
          headerClassName: TH,
          searchValue: (value: string, row: AccountRow) => `${value} ${row.branchLabel ?? ""}`,
        },
        cell: ({ row: { original: row } }) => (
          <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11 }}>
            <a
              href={accountTransactionsPath(row.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary ca-link"
              title={t("accounts.row.openTransactions")}
            >
              <span>{row.name}</span>{" "}
              <i
                className="faw fa-external-link-alt"
                style={{ fontSize: 9, opacity: 0.75 }}
                aria-hidden="true"
              />
              <span className="sr-only"> {tc("common.a11y.opensInNewTab")}</span>
            </a>
            {!row.active && (
              <span className="badge badge-secondary align-self-start">
                {t("accounts.row.passive")}
              </span>
            )}
            {row.branchLabel ? (
              <small className="text-muted" style={{ fontSize: 10, fontWeight: 500 }}>
                <i
                  className="faw fa-industry"
                  style={{ fontSize: 9, opacity: 0.75 }}
                  aria-hidden="true"
                />{" "}
                {row.branchLabel}
              </small>
            ) : (
              <small className="text-muted" style={{ fontSize: 10, fontWeight: 500 }}>
                <i
                  className="faw fa-exclamation-triangle text-danger"
                  style={{ fontSize: 9 }}
                  aria-hidden="true"
                />{" "}
                <span className="text-danger">{t("accounts.row.undefinedWorkPlace")}</span>
              </small>
            )}
          </div>
        ),
      }),
      column.accessor("groupName", {
        id: "group",
        header: c("group"),
        sortingFn: (a, b) => groupCollator.compare(a.original.groupName, b.original.groupName),
        meta: { headerClassName: TH, cellClassName: "account-group-cell" },
        cell: ({ row: { original: row } }) => (
          <span
            className="account-group-badge"
            title={row.groupName}
            style={{
              background: row.badge.bg,
              color: row.badge.color,
              borderColor: row.badge.border,
            }}
          >
            <i className={`faw ${row.badge.icon}`} style={{ fontSize: 9 }} aria-hidden="true" />{" "}
            {row.groupName}
          </span>
        ),
      }),
      column.display({
        id: "debtPayment",
        header: pair("debt", "payment"),
        meta: { className: "text-right account-financial-pair", headerClassName: TH },
        cell: ({ row: { original: row } }) => (
          <PairCell row={row} first="debt" second="payment" labels={[c("debt"), c("payment")]} />
        ),
      }),
      column.display({
        id: "receivableCollection",
        header: pair("receivable", "collection"),
        meta: { className: "text-right account-financial-pair", headerClassName: TH },
        cell: ({ row: { original: row } }) => (
          <PairCell
            row={row}
            first="receivable"
            second="collection"
            labels={[c("receivable"), c("collection")]}
          />
        ),
      }),
      column.display({
        id: "balancePlanned",
        header: pair("balance", "planned"),
        meta: { className: "text-right account-financial-pair", headerClassName: TH },
        cell: ({ row: { original: row } }) => (
          <>
            <div
              className="account-financial-pair__item currency-rotating-cell"
              data-label={c("balance")}
            >
              <RotatingAmounts row={row} field="balance" />
              <InvoiceGapMark row={row} />
            </div>
            <PlannedCell planned={row.planned} label={c("planned")} />
          </>
        ),
      }),
      column.display({
        id: "status",
        header: c("status"),
        meta: {
          headerClassName: TH,
          searchValue: (_value: unknown, row: AccountRow) =>
            `${t(`accounts.planStatus.${row.planStatus.key}`)} ${t(`accounts.approvalStatus.${row.approval.key}`)}`,
        },
        cell: ({ row: { original: row } }) => (
          <div
            style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}
          >
            <span
              className={`badge badge-${row.planStatus.badge}`}
              style={{ fontSize: 10, position: "relative" }}
            >
              {t(`accounts.planStatus.${row.planStatus.key}`)}
              {row.planCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    background: "#dc2626",
                    color: "#fff",
                    borderRadius: 999,
                    fontSize: 8,
                    fontWeight: 700,
                    padding: "1px 4px",
                    lineHeight: 1.5,
                    minWidth: 14,
                    textAlign: "center",
                  }}
                  title={t("accounts.row.planCount", { n: row.planCount })}
                >
                  {row.planCount}
                </span>
              )}
            </span>
            <span className={`badge badge-${row.approval.badge}`} style={{ fontSize: 10 }}>
              {t(`accounts.approvalStatus.${row.approval.key}`)}
            </span>
          </div>
        ),
      }),
      column.display({
        id: "actions",
        header: c("actions"),
        meta: {
          headerClassName: TH,
          cellClassName: "definition-list-actions-cell",
          searchable: false,
        },
        cell: ({ row: { original: row } }) => (
          <RowActions
            row={row}
            canManage={canManage}
            canFleet={canFleet}
            canPost={canPost}
            pending={toggleActive.isPending}
            onDetail={openDetail}
            onActive={async (active) => {
              if (
                !active &&
                !(await confirm({
                  title: t("accounts.actions.confirmTitle"),
                  message: t("accounts.actions.confirmDelete"),
                  note: null,
                  confirmText: t("accounts.actions.delete"),
                  variant: "danger",
                }))
              ) {
                return;
              }
              mutateActive({ id: row.id, active });
            }}
          />
        ),
      }),
    ];
  }, [
    t,
    tc,
    canManage,
    canFleet,
    canPost,
    toggleActive.isPending,
    openDetail,
    confirm,
    mutateActive,
  ]);

  const modes = totalsModes(multiCompany);
  const modeMeta: Record<TotalsMode, { icon: string; label: string; title: string }> = {
    CURRENCY: {
      icon: "fa-layer-group",
      label: t("accounts.totals.general"),
      title: t("accounts.totals.generalTitle"),
    },
    BRANCH: {
      icon: "fa-building",
      label: t("accounts.totals.workplace"),
      title: t("accounts.totals.workplaceTitle"),
    },
    COMPANY: {
      icon: "fa-landmark",
      label: t("accounts.totals.company"),
      title: t("accounts.totals.companyTitle"),
    },
  };

  const domSlots = {
    "dt-toggle-col": (
      <>
        <button
          type="button"
          id="btnRedBalanceOnly"
          className={onlyRedBalance ? "dt-redbal-switch active" : "dt-redbal-switch"}
          role="switch"
          aria-checked={onlyRedBalance}
          title={t("accounts.totals.redBalance")}
          onClick={() => setOnlyRedBalance((value) => !value)}
        >
          <span className="rb-label">{t("accounts.totals.redBalance")}</span>
          <span className="rb-track" aria-hidden="true">
            <span className="rb-knob" />
          </span>
        </button>
        <div id="totalsModeToggle" role="group" aria-label={t("accounts.totals.general")}>
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              className={mode === m ? "tmt-btn is-active" : "tmt-btn"}
              data-mode={m === "CURRENCY" ? "general" : m === "BRANCH" ? "workplace" : "company"}
              aria-pressed={mode === m}
              title={modeMeta[m].title}
              onClick={() => setMode(m)}
            >
              <i className={`fas ${modeMeta[m].icon} mr-1`} aria-hidden="true" />
              {modeMeta[m].label}
            </button>
          ))}
        </div>
      </>
    ),
  };

  const clearFilters = () => {
    setPlanFilter("");
    setGroupDraft("");
    setGroup("");
    setBranchDraft([]);
    setBranchIds([]);
    setHideZeroDebt(false);
    setHideCustomers(false);
    setOnlyRedBalance(NO_QUICK_FILTERS.onlyRedBalance);
    setMissingInvoice(NO_QUICK_FILTERS.missingInvoice);
  };

  const loading = list.isPending || building || (list.isFetching && rows.length === 0);
  const detailAccount = detail?.account;

  return (
    <div className="col-md-12">
      <br />
      <ZtoTopPanel title={t("accounts.title")} subtitle={t("accounts.subtitle")} />

      <div className="container-fluid">
        <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <div className="d-flex gap-2 flex-wrap">
            <Link
              to={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.allTransactions}`}
              className="erp-btn erp-btn-info"
            >
              <i className="fas fa-list" aria-hidden="true" />
              <span>{t("accounts.buttons.allTransactions")}</span>
            </Link>
            <PhaseButton step="12.4" className="erp-btn erp-btn-info">
              <i className="fas fa-calendar-alt" aria-hidden="true" />
              <span>{t("accounts.buttons.allPlans")}</span>
            </PhaseButton>
            <PhaseButton step="12.4" className="erp-btn erp-btn-warning">
              <i className="fas fa-check-circle" aria-hidden="true" />
              <span>{t("accounts.buttons.approvals")}</span>
              <ApprovalCounts
                draft={stats.draftPlans}
                pending={stats.pendingPlans}
                approved={stats.approvedPlans}
              />
            </PhaseButton>
            <div className="btn-divider" />
            {canEmployee && (
              <PhaseButton step="12.9" className="erp-btn erp-btn-success">
                <i className="fas fa-user-tie" aria-hidden="true" />
                <span>{t("accounts.buttons.personnel")}</span>
              </PhaseButton>
            )}
            <ZtoMenuButton
              id="paymentCollectionMenu"
              buttonClassName="erp-btn erp-btn-primary dropdown-toggle"
              label={
                <>
                  <i className="fas fa-exchange-alt" aria-hidden="true" />
                  <span>{t("accounts.buttons.paymentCollection")}</span>
                </>
              }
            >
              <MenuItem
                className="dropdown-item"
                style={{ fontSize: 11 }}
                icon="fas fa-cash-register text-primary mr-2"
                label={t("accounts.buttons.payments")}
                to={paymentsPath()}
              />
              <MenuItem
                className="dropdown-item"
                style={{ fontSize: 11 }}
                icon="fas fa-hand-holding-usd text-success mr-2"
                label={t("accounts.buttons.collections")}
                to={collectionsPath()}
              />
              <MenuItem
                className="dropdown-item"
                style={{ fontSize: 11 }}
                title={t("accounts.buttons.checksTitle")}
                icon="fas fa-money-check text-warning mr-2"
                label={t("accounts.buttons.checks")}
                to="/finance/instruments"
              />
              <MenuItem
                className="dropdown-item"
                style={{ fontSize: 11 }}
                title={t("accounts.buttons.billsTitle")}
                icon="fas fa-file-invoice-dollar text-secondary mr-2"
                label={t("accounts.buttons.bills")}
                to="/finance/instruments"
              />
            </ZtoMenuButton>
            <div className="btn-divider" />
            <ZtoMenuButton
              id="financialMenu"
              buttonClassName="erp-btn erp-btn-success dropdown-toggle"
              label={
                <>
                  <i className="fas fa-money-bill-wave" aria-hidden="true" />
                  <span>{t("accounts.buttons.financial")}</span>
                </>
              }
            >
              <PhaseMenuItem
                step="12.8"
                className="dropdown-item"
                style={{ fontSize: 11 }}
                icon="fas fa-money-bill-alt text-success mr-2"
                label={t("accounts.buttons.treasury")}
              />
              <MenuItem
                className="dropdown-item"
                style={{ fontSize: 11 }}
                icon="fas fa-exchange-alt text-info mr-2"
                label={t("accounts.buttons.bankTransfer")}
                to={transferCenterPath()}
              />
            </ZtoMenuButton>
            <ZtoMenuButton
              id="creditMenu"
              buttonClassName="erp-btn erp-btn-info dropdown-toggle"
              label={
                <>
                  <i className="fas fa-chart-pie" aria-hidden="true" />
                  <span>{t("accounts.buttons.creditInvest")}</span>
                </>
              }
            >
              <PhaseMenuItem
                step="12.5"
                className="dropdown-item"
                style={{ fontSize: 11 }}
                icon="fas fa-hand-holding-usd text-warning mr-2"
                label={t("accounts.buttons.credits")}
              />
              <PhaseMenuItem
                step="12.6"
                className="dropdown-item"
                style={{ fontSize: 11 }}
                icon="fas fa-piggy-bank text-success mr-2"
                label={t("accounts.buttons.deposits")}
              />
            </ZtoMenuButton>
          </div>
          {canManage && (
            <Link
              to={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.newAccount}`}
              className="erp-btn erp-btn-success"
            >
              <i className="fas fa-plus" aria-hidden="true" />
              <span>{t("accounts.buttons.newAccount")}</span>
            </Link>
          )}
        </div>
      </div>

      <div className="erp-filter-card">
        <div className="row align-items-end">
          <div className="col-md-2 col-6 mb-2 mb-md-0">
            <label className="filter-label" htmlFor="planStatusFilter">
              {t("accounts.filters.planStatus")}
            </label>
            <select
              id="planStatusFilter"
              className="filter-field"
              value={planFilter}
              onChange={(event) => setPlanFilter(event.target.value as PlanFilter)}
            >
              {PLAN_FILTERS.map((value) => (
                <option key={value || "all"} value={value}>
                  {t(`accounts.filters.${value || "planAll"}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2 col-6 mb-2 mb-md-0">
            <label className="filter-label" htmlFor="accountGroupFilter">
              {t("accounts.filters.group")}
            </label>
            <select
              id="accountGroupFilter"
              className="filter-field"
              value={groupDraft}
              onChange={(event) => setGroupDraft(event.target.value)}
            >
              <option value="">{t("accounts.filters.groupAll")}</option>
              {groupFilterOptions(groups.data ?? []).map((g) => (
                <option key={g.code} value={g.code}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2 col-6 mb-2 mb-md-0">
            <ZtoBranchMultiSelect
              variant="dropdown"
              value={branchDraft}
              onChange={setBranchDraft}
              onApply={(value) => {
                setBranchDraft(value);
                setBranchIds(value);
              }}
              emptyMeansAll
              scope="all"
              label={t("accounts.filters.workPlace")}
            />
          </div>
          <div className="col-md-2 col-6 mb-2 mb-md-0">
            <span className="filter-label" id="quickFiltersLabel">
              {t("accounts.filters.quick")}
            </span>
            {/* flex-wrap: Blackrose eki üçüncü düğme ("Eksik Faturalı") dar sütunda yandaki
                sütunun üstüne taşıyordu (12.2 son kapı e2e). */}
            <div
              className="d-flex flex-wrap gap-2"
              role="group"
              aria-labelledby="quickFiltersLabel"
            >
              <button
                type="button"
                id="btnHideZeroDebt"
                className={hideZeroDebt ? "btn-toggle-filter active" : "btn-toggle-filter"}
                role="switch"
                aria-checked={hideZeroDebt}
                aria-label={t("accounts.filters.zeroDebt")}
                title={t(
                  hideZeroDebt
                    ? "accounts.filters.zeroDebtHidden"
                    : "accounts.filters.zeroDebtShown",
                )}
                onClick={() => setHideZeroDebt((value) => !value)}
              >
                <i
                  className={hideZeroDebt ? "fas fa-eye" : "fas fa-eye-slash"}
                  aria-hidden="true"
                />
                <span className="btn-toggle-text d-none d-lg-inline">
                  {t("accounts.filters.zeroDebt")}
                </span>
              </button>
              <button
                type="button"
                id="btnHideCustomers"
                className={hideCustomers ? "btn-toggle-filter active" : "btn-toggle-filter"}
                role="switch"
                aria-checked={hideCustomers}
                aria-label={t("accounts.filters.customers")}
                title={t(
                  hideCustomers
                    ? "accounts.filters.customersHidden"
                    : "accounts.filters.customersShown",
                )}
                onClick={() => setHideCustomers((value) => !value)}
              >
                <i
                  className={hideCustomers ? "fas fa-user" : "fas fa-user-slash"}
                  aria-hidden="true"
                />
                <span className="btn-toggle-text d-none d-lg-inline">
                  {t("accounts.filters.customers")}
                </span>
              </button>
              <button
                type="button"
                id="btnMissingInvoice"
                className={missingInvoice ? "btn-toggle-filter active" : "btn-toggle-filter"}
                role="switch"
                aria-checked={missingInvoice}
                aria-label={t("accounts.filters.missingInvoice")}
                title={t(
                  missingInvoice
                    ? "accounts.filters.missingInvoiceOn"
                    : "accounts.filters.missingInvoiceOff",
                )}
                onClick={() => setMissingInvoice((value) => !value)}
              >
                <i className="fas fa-file-invoice" aria-hidden="true" />
                <span className="btn-toggle-text d-none d-lg-inline">
                  {t("accounts.filters.missingInvoice")}
                </span>
              </button>
            </div>
          </div>
          <div className="col-md-2 col-6 mb-2 mb-md-0" style={{ display: "none" }}>
            <label className="filter-label" htmlFor="searchInputAccount">
              {t("accounts.filters.search")}
            </label>
            <input
              type="text"
              id="searchInputAccount"
              className="filter-field"
              placeholder={t("accounts.filters.searchPlaceholder")}
            />
          </div>
          <div className="col-md-4 col-12">
            <div className="d-flex flex-wrap align-items-end" style={{ gap: 6 }}>
              <button
                type="button"
                className="filter-btn btn-filter-apply"
                onClick={() => {
                  setGroup(groupDraft);
                  setBranchIds(branchDraft);
                }}
              >
                <i className="fas fa-filter" aria-hidden="true" />{" "}
                <span className="d-none d-sm-inline">{t("accounts.filters.apply")}</span>
              </button>
              <button
                type="button"
                className="filter-btn btn-filter-clear"
                aria-label={t("accounts.filters.clear")}
                title={t("accounts.filters.clear")}
                onClick={clearFilters}
              >
                <i className="fas fa-times" aria-hidden="true" />
              </button>
              <PhaseButton
                step="12.4"
                className="filter-btn btn-filter-heatmap"
                title={t("accounts.filters.heatmapTitle")}
              >
                <i className="fas fa-chart-area" aria-hidden="true" />{" "}
                {t("accounts.filters.heatmap")}
              </PhaseButton>
              <PhaseButton
                step="12.4"
                className="filter-btn btn-filter-heatmap"
                style={{ position: "relative", paddingRight: 10 }}
                title={t("accounts.filters.reminderTitle")}
              >
                <i className="fas fa-bell" aria-hidden="true" />
                {stats.overduePlans > 0 && (
                  <span
                    id="reminderOverdueBadge"
                    style={{
                      position: "absolute",
                      top: -6,
                      right: -6,
                      minWidth: 16,
                      height: 16,
                      lineHeight: "16px",
                      padding: "0 4px",
                      borderRadius: 999,
                      background: "#dc2626",
                      color: "#fff",
                      fontSize: 9,
                      fontWeight: 700,
                      textAlign: "center",
                      border: "1px solid #fff",
                    }}
                  >
                    {stats.overduePlans}
                  </span>
                )}
              </PhaseButton>
              <button
                type="button"
                id="btnToggleStatsCards"
                className="filter-btn btn-filter-heatmap"
                title={t("accounts.filters.statsTitle")}
                aria-expanded={showStats}
                aria-controls="statsCardsRow"
                onClick={() => setShowStats((value) => !value)}
              >
                <i className={showStats ? "fas fa-eye-slash" : "fas fa-eye"} aria-hidden="true" />{" "}
                <span className="d-none d-sm-inline">
                  {t(showStats ? "accounts.filters.hide" : "accounts.filters.show")}
                </span>
              </button>
              <div className="form-check ml-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="showPassiveAccounts"
                  checked={showPassive}
                  onChange={(event) => setShowPassive(event.target.checked)}
                />
                <label className="form-check-label" htmlFor="showPassiveAccounts">
                  {t("accounts.filters.showPassive")}
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <StatsCards
        show={showStats}
        stats={stats}
        planFilter={planFilter}
        onPlan={(value) => setPlanFilter((current) => (current === value ? "" : value))}
      />

      {notice && (
        <ZtoAlert
          variant={notice.variant}
          message={notice.message}
          onClose={() => setNotice(null)}
        />
      )}
      {list.isError && (
        <div
          className="alert alert-danger alert-dismissible fade show"
          role="alert"
          style={{ borderRadius: 6, borderLeft: "4px solid #ef4444" }}
        >
          <i className="fas fa-exclamation-circle mr-2" aria-hidden="true" />
          {errorMessage(list.error, t("accounts.actions.failed"))}
        </div>
      )}

      <div className="card" style={{ borderRadius: 6, boxShadow: "0 1px 8px rgba(0,0,0,0.05)" }}>
        <div className="card-body" style={{ position: "relative" }} aria-busy={loading}>
          <div
            id="cariLoadingOverlay"
            className={loading ? "active" : undefined}
            aria-hidden={!loading}
          >
            <div className="cari-loading-box" role="status">
              <div className="cari-loading-spinner" />
              <div className="cari-loading-text">
                {t("accounts.loading.title")}
                <span className="cari-dots" aria-hidden="true">
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
              </div>
              <div className="cari-loading-sub">{t("accounts.loading.sub")}</div>
              <div className="cari-loading-bar" aria-hidden="true">
                <span />
              </div>
            </div>
          </div>
          <div className="table-responsive">
            <RotationProvider>
              <ZtoDataTable
                id="customerAccountsTable"
                columns={columns}
                data={visible}
                getRowId={(row) => row.id}
                dom={ACCOUNTS_DOM}
                tableClassName="table table-compact table-hover mb-0"
                tableDataAttributes={{
                  "data-totals-mode": mode === "CURRENCY" ? "general" : "workplace",
                }}
                pageLength={10}
                lengthMenu={LENGTH_MENU}
                order={[]}
                language={language}
                lengthAriaLabel={t("accounts.lengthAria")}
                cellDataLabel
                domSlots={domSlots}
                rowClassName={(row) =>
                  [rowClassOf(row.category), row.active ? undefined : "definition-row--inactive"]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
              />
            </RotationProvider>
          </div>
        </div>
      </div>

      <ZtoDefinitionDetailsModal
        show={detailOpen}
        onHide={() => setDetailOpen(false)}
        entityKey="customer-account"
        entityTitle={t("accounts.detail.entityTitle")}
        recordTitle={detailAccount?.name}
        recordId={detailAccount?.code ?? ""}
        status={
          detailAccount
            ? t(detailAccount.active ? "accounts.detail.active" : "accounts.detail.passive")
            : undefined
        }
        fields={
          detailAccount
            ? [
                { label: t("accounts.detail.name"), value: detailAccount.name },
                { label: t("accounts.detail.code"), value: detailAccount.code },
                {
                  label: t("accounts.detail.group"),
                  value: detailAccount.subGroupName || detailAccount.subGroup,
                },
                { label: t("accounts.detail.taxNumber"), value: detailAccount.taxNumber ?? "" },
                { label: t("accounts.detail.phone"), value: detailAccount.phone ?? "" },
                {
                  label: t("accounts.detail.status"),
                  value: t(
                    detailAccount.active ? "accounts.detail.active" : "accounts.detail.passive",
                  ),
                },
              ]
            : []
        }
        audit={detailAccount ?? null}
        history={
          detail?.history
            ? (history.data ?? []).map((entry) => ({
                at: entry.at,
                actor: entry.actorEmail,
                event: entry.event,
                details: entry.details,
              }))
            : undefined
        }
        historyEventLabel={(event) => t(`accounts.historyEvents.${event}`, { defaultValue: event })}
      />
      {confirmModal}
    </div>
  );
}

function ApprovalCounts({
  draft,
  pending,
  approved,
}: {
  draft: number;
  pending: number;
  approved: number;
}) {
  const { t } = useTranslation("ztoFinans");
  const badge = (count: number, title: string, gradient: string) =>
    count > 0 && (
      <span
        className="badge badge-pill"
        title={title}
        style={{ background: gradient, color: "white", fontSize: 9, padding: "3px 7px" }}
      >
        {count}
      </span>
    );
  return (
    <div className="d-inline-flex align-items-center ml-2 gap-1">
      {badge(
        draft,
        t("accounts.approvalCounts.draft"),
        "linear-gradient(135deg, #94a3b8, #64748b)",
      )}
      {badge(
        pending,
        t("accounts.approvalCounts.pending"),
        "linear-gradient(135deg, #f59e0b, #d97706)",
      )}
      {badge(
        approved,
        t("accounts.approvalCounts.approved"),
        "linear-gradient(135deg, #10b981, #059669)",
      )}
    </div>
  );
}

function StatsCards({
  show,
  stats,
  planFilter,
  onPlan,
}: {
  show: boolean;
  stats: ReturnType<typeof accountStats>;
  planFilter: PlanFilter;
  onPlan: (value: Exclude<PlanFilter, "">) => void;
}) {
  const { t } = useTranslation("ztoFinans");
  const cards: Array<{ key: Exclude<PlanFilter, "">; css: string; icon: string; count: number }> = [
    { key: "overdue", css: "card-overdue", icon: "fa-exclamation-triangle", count: stats.overdue },
    { key: "today", css: "card-today", icon: "fa-calendar-day", count: stats.today },
    { key: "noplan", css: "card-noplan", icon: "fa-question-circle", count: stats.noplan },
    { key: "future", css: "card-future", icon: "fa-calendar-alt", count: stats.future },
    { key: "pending", css: "card-pending", icon: "fa-hourglass-half", count: stats.pending },
    { key: "approved", css: "card-approved", icon: "fa-check-circle", count: stats.approved },
  ];
  const cell = { paddingLeft: 4, paddingRight: 4 };
  const press = (key: Exclude<PlanFilter, "">) => (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPlan(key);
    }
  };
  const breakdown = (amounts: CurrencyAmount[]) =>
    amounts.length > 0 ? (
      <ul className="list-unstyled mb-0">
        {amounts.map((a) => (
          <li key={a.currency}>
            {formatN2(a.amount)} {currencySymbol(a.currency)}
          </li>
        ))}
      </ul>
    ) : (
      <span>-</span>
    );
  return (
    <div
      id="statsCardsRow"
      className="row mb-3"
      style={{ display: show ? undefined : "none", marginLeft: -4, marginRight: -4 }}
    >
      {cards.map((card) => (
        <div key={card.key} className="col-4 col-md-2 col-xl mb-2" style={cell}>
          <div
            className={`plan-stat-card ${card.css}${planFilter === card.key ? " active" : ""}`}
            role="button"
            tabIndex={0}
            aria-pressed={planFilter === card.key}
            onClick={() => onPlan(card.key)}
            onKeyDown={press(card.key)}
          >
            <div className="plan-stat-content">
              <div className="plan-stat-icon">
                <i className={`fas ${card.icon}`} aria-hidden="true" />
              </div>
              <div className="plan-stat-details">
                <span className="plan-stat-label">{t(`accounts.stats.${card.key}`)}</span>
                <span className="plan-stat-value">{card.count}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
      <div className="col-6 col-md-3 col-xl mb-2" style={cell}>
        <div className="plan-stat-card card-total currency-stat-card" id="plannedCard" tabIndex={0}>
          <div className="plan-stat-content">
            <div className="plan-stat-icon">
              <i className="fas fa-coins" aria-hidden="true" />
            </div>
            <div className="plan-stat-details">
              <span className="plan-stat-label">
                {t("accounts.stats.planned")}{" "}
                <span className="currency-mini-badge" title={t("accounts.stats.multiCurrency")}>
                  <i className="fas fa-globe" aria-hidden="true" />
                </span>
              </span>
              <span className="plan-stat-value" id="totalPlannedDisplay">
                {formatNumber(plannedTry(stats.planned), 0)}{" "}
                <span className="erp-stat-currency">₺</span>
              </span>
              <div className="erp-stat-estimate">
                <span className="estimate-badge">
                  <i className="fas fa-clock" aria-hidden="true" /> {t("accounts.stats.estimate")}
                </span>
              </div>
            </div>
          </div>
          <div className="currency-tooltip" id="plannedTooltip">
            {breakdown(stats.planned)}
          </div>
        </div>
      </div>
      <div className="col-6 col-md-3 col-xl mb-2" style={cell}>
        <div className="plan-stat-card card-average currency-stat-card" id="debtCard" tabIndex={0}>
          <div className="plan-stat-content">
            <div className="plan-stat-icon">
              <i className="fas fa-balance-scale" aria-hidden="true" />
            </div>
            <div className="plan-stat-details">
              <span className="plan-stat-label">
                {t("accounts.stats.debtCredit")}{" "}
                <span className="currency-mini-badge" title={t("accounts.stats.multiCurrency")}>
                  <i className="fas fa-globe" aria-hidden="true" />
                </span>
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 1 }}>
                <span
                  className="plan-stat-value"
                  id="totalDebtDisplay"
                  style={{ color: "#ef4444", fontSize: 12, lineHeight: 1.3 }}
                >
                  {formatNumber(stats.debtTl, 0)}{" "}
                  <span className="erp-stat-currency" style={{ fontSize: 10 }}>
                    ₺
                  </span>
                  <small style={{ fontSize: 9, opacity: 0.8, marginLeft: 2 }}>
                    {t("accounts.stats.debt")}
                  </small>
                </span>
                <span
                  className="plan-stat-value"
                  id="totalCreditDisplay"
                  style={{ color: "#10b981", fontSize: 12, lineHeight: 1.3 }}
                >
                  {formatNumber(stats.creditTl, 0)}{" "}
                  <span className="erp-stat-currency" style={{ fontSize: 10 }}>
                    ₺
                  </span>
                  <small style={{ fontSize: 9, opacity: 0.8, marginLeft: 2 }}>
                    {t("accounts.stats.credit")}
                  </small>
                </span>
              </div>
              <div className="erp-stat-estimate">
                <span className="estimate-badge">
                  <i className="fas fa-clock" aria-hidden="true" /> {t("accounts.stats.estimate")}
                </span>
              </div>
            </div>
          </div>
          <div className="currency-tooltip" id="debtTooltip">
            <strong>{t("accounts.stats.debt")}</strong>
            {breakdown(stats.debtByCurrency)}
            <strong>{t("accounts.stats.credit")}</strong>
            {breakdown(stats.creditByCurrency)}
          </div>
        </div>
      </div>
    </div>
  );
}

function RowActions({
  row,
  canManage,
  canFleet,
  canPost,
  pending,
  onDetail,
  onActive,
}: {
  row: AccountRow;
  canManage: boolean;
  canFleet: boolean;
  /** FINANCE_PAYMENT_CREATE: "Ödeme Ekle" (12.2a §5.13; yetkisizde gizli). */
  canPost: boolean;
  pending: boolean;
  onDetail: (account: Account, history: boolean) => void;
  onActive: (active: boolean) => void;
}) {
  const { t } = useTranslation("ztoFinans");
  const { t: tc } = useTranslation();
  const a = (key: string) => t(`accounts.actions.${key}`);
  const special = groupAction(row.groupCode, canFleet);
  const showPlans = !row.isCustomer;
  return (
    <div className="d-flex gap-1 flex-nowrap definition-row-actions">
      <button
        type="button"
        className="btn btn-sm definition-detail-button account-detail-primary"
        title={a("detailTitle")}
        aria-label={a("detailTitle")}
        onClick={() => onDetail(row.account, false)}
      >
        <i className="faw fa-eye" aria-hidden="true" />
        <span>{a("detail")}</span>
      </button>
      <ZtoAuditCell {...row.account} />
      <ZtoMenuButton
        buttonClassName="action-btn action-btn-secondary dropdown-toggle"
        buttonStyle={{ padding: "4px 6px" }}
        title={a("more")}
        ariaLabel={tc("common.a11y.rowActions", { name: row.name })}
        label={<i className="faw fa-ellipsis-v" aria-hidden="true" />}
        menuClassName="dropdown-menu dropdown-menu-right account-actions-menu"
        menuStyle={{ fontSize: 12 }}
        align="right"
      >
        <MenuItem
          icon="faw fa-eye text-primary mr-2"
          label={a("detailTitle")}
          onSelect={() => onDetail(row.account, false)}
        />
        <MenuItem
          icon="faw fa-history text-secondary mr-2"
          label={a("history")}
          onSelect={() => onDetail(row.account, true)}
        />
        {showPlans && (
          <>
            <MenuDivider />
            {row.nextDueDate === null ? (
              <PhaseMenuItem
                step="12.4"
                icon="faw fa-calendar-plus text-primary mr-2"
                label={a("planCreate")}
              />
            ) : (
              <>
                <PhaseMenuItem
                  step="12.4"
                  icon="faw fa-calendar-check text-info mr-2"
                  label={a("planEdit")}
                />
                {row.approval.key === "planned" && (
                  <PhaseMenuItem
                    step="12.4"
                    icon="faw fa-paper-plane text-warning mr-2"
                    label={a("planSend")}
                  />
                )}
                <PhaseMenuItem
                  step="12.4"
                  className="dropdown-item py-2 text-danger"
                  icon="faw fa-trash mr-2"
                  label={a("planDelete")}
                />
              </>
            )}
          </>
        )}
        <MenuDivider />
        <MenuItem
          icon="faw fa-list text-info mr-2"
          label={a("transactions")}
          to={accountTransactionsPath(row.id)}
        />
        <MenuItem
          icon="faw fa-university text-primary mr-2"
          label={a("bankAccounts")}
          to={accountBankAccountsPath(row.id)}
        />
        <MenuDivider />
        {/* ZTO _AccountsTableBody:570-577: müşteri dışı carilerde Ödemeler yeni sekmede, Yeni Ödeme
            modalı cari ön seçili (12.2a §5.13). */}
        {showPlans && canPost && (
          <MenuItem
            icon="faw fa-money-bill-wave text-success mr-2"
            label={a("addPayment")}
            href={paymentsPath({ id: row.id, openModal: true })}
            newTab
          />
        )}
        <MenuItem
          icon="faw fa-file-alt text-secondary mr-2"
          label={a("statement")}
          href={statementPath(row.id)}
          newTab
        />
        {special && (
          <>
            <MenuItem
              icon={`faw ${special.icon} text-success mr-2`}
              label={a(special.labelKey)}
              href={special.href}
              newTab
            />
            <MenuDivider />
          </>
        )}
        {canManage && (
          <>
            <MenuItem
              icon="faw fa-edit text-warning mr-2"
              label={a("edit")}
              to={accountEditPath(row.id)}
            />
            {row.active ? (
              <MenuItem
                className="dropdown-item py-2 text-danger"
                icon="faw fa-trash mr-2"
                label={a("delete")}
                onSelect={pending ? undefined : () => onActive(false)}
              />
            ) : (
              <MenuItem
                className="dropdown-item py-2 text-success"
                icon="faw fa-undo mr-2"
                label={a("activate")}
                onSelect={pending ? undefined : () => onActive(true)}
              />
            )}
          </>
        )}
      </ZtoMenuButton>
    </div>
  );
}
