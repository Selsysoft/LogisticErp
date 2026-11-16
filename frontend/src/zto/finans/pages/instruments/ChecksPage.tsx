import { createColumnHelper } from "@tanstack/react-table";
import {
  CSSProperties,
  KeyboardEvent,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../../../auth/authStore";
import { activeCompanies, useActiveCompanyId } from "../../../../auth/companyStore";
import { useAccountList } from "../../../../pages/finance/accountApi";
import { useCan, useMultiCompany } from "../../../../pages/finance/common";
import { useCheckBooks, useInstrumentList } from "../../../../pages/finance/instrumentApi";
import type { InstrumentListItem } from "../../../../pages/finance/types";
import {
  ZtoDataTable,
  ZtoSearchableSelect,
  ZtoSelect,
  exportExcel,
  formatDate,
  formatN2,
} from "../../../components";
import { currencySymbol } from "../../../format";
import {
  ZTO_FINANS_BASE,
  ZTO_SLUGS,
  accountTransactionsPath,
  billsPath,
  checkBooksPath,
  checkDocumentsPath,
  checkEditPath,
  fundTransactionsPath,
  paymentsPath,
} from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { MenuDivider, MenuItem, ZtoMenuButton } from "../accounts/AccountsMenu";
import { todayIso } from "../fundTransactions/fundTransactionsLogic";
import { PaymentModal } from "../settlementModals";
import { ReverseSettlementModal } from "../settlements/ReverseSettlementModal";
import { accountOptions } from "../settlements/settlementListLogic";
import { CheckLeaf3DModal } from "./CheckLeaf3DModal";
import { CheckReportModal } from "./CheckReportModal";
import { CheckStatusModal } from "./CheckStatusModal";
import {
  STATUS_FILTER_OPTIONS,
  checksListParams,
  descriptionPreview,
  filterChecks,
  filtersFromSearch,
  filtersToSearch,
  hasActiveFilter,
  isEndorsable,
  isOwnCheck,
  menuTarget,
  parseChecksDeepLink,
  remainingCell,
  remainingChecksSearch,
  sortChecks,
  statusTargets,
  type ChecksFilters,
  type StatusFilter,
  type StatusTarget,
} from "./checksLogic";
import { EndorsableChecksModal } from "./EndorsableChecksModal";
import { InstrumentMovementsModal } from "./InstrumentMovementsModal";
import {
  accountingStatus,
  canEditInstrument,
  holdingPlace,
  isOverdue,
  isOwnCheckPaid,
  partyColumns,
  statusLabelKey,
  statusSubKey,
  transitionMenu,
  type InstrumentMenuItem,
} from "./instrumentLogic";

const column = createColumnHelper<InstrumentListItem>();
const CARD_HEADER: CSSProperties = { padding: "10px 20px" };
const LEFT_GAP: CSSProperties = { gap: 12 };
const RIGHT_GAP: CSSProperties = { gap: 6 };
const CHIPS: CSSProperties = { gap: 8, marginLeft: 15 };
const TITLE: CSSProperties = { fontSize: 14, fontWeight: 600 };
const BACK: CSSProperties = { marginRight: 8 };
const LINK: CSSProperties = { color: "#1e40af", textDecoration: "none", fontWeight: 600 };
const NUMBER: CSSProperties = { cursor: "pointer" };
const SMALL_BADGE: CSSProperties = { fontSize: 10 };
const HOLD_BADGE: CSSProperties = {
  fontSize: 10,
  display: "inline-block",
  maxWidth: 80,
  whiteSpace: "normal",
  wordWrap: "break-word",
  lineHeight: 1.3,
};
const ACC_BADGE: CSSProperties = { fontSize: 10, padding: "4px 8px" };
const HOLDER_BADGE: CSSProperties = {
  fontSize: 9,
  padding: "2px 5px",
  marginLeft: 1,
  cursor: "default",
};
const PAID_BADGE: CSSProperties = {
  background: "linear-gradient(135deg,#0d9488,#0f766e)",
  color: "#fff",
  fontSize: 10,
  padding: "4px 10px",
  borderRadius: 5,
  fontWeight: 600,
};
const PAID_STATUS_BADGE: CSSProperties = {
  ...PAID_BADGE,
  boxShadow: "0 1px 3px rgba(15,118,110,0.25)",
};
const ENDORSABLE_BADGE: CSSProperties = {
  backgroundColor: "#7c3aed",
  color: "white",
  fontSize: 9,
  padding: "3px 6px",
  marginTop: 2,
};
const MOVE_BTN: CSSProperties = { fontSize: 10, padding: "2px 8px", borderRadius: 4 };
const MOVE_DATE: CSSProperties = { fontSize: 9, marginTop: 2 };
const NOWRAP: CSSProperties = { whiteSpace: "nowrap" };
const MENU_BTN: CSSProperties = { padding: "4px 6px", fontSize: 11 };
const MENU: CSSProperties = { fontSize: 12 };
const SEARCH_LABEL: CSSProperties = { fontSize: 12, color: "#64748b" };
const SEARCH_INPUT: CSSProperties = { minWidth: 260 };
const TABLE_STYLE: CSSProperties = { fontSize: 11 };
const CIRO_COL: CSSProperties = { display: "flex", alignItems: "flex-end" };
const CIRO_BTN: CSSProperties = {
  position: "relative",
  width: "100%",
  whiteSpace: "nowrap",
  justifyContent: "center",
  paddingLeft: 6,
  paddingRight: 6,
  fontWeight: 700,
  background: "linear-gradient(135deg,#7c3aed,#6d28d9)",
  color: "#fff",
  borderColor: "#6d28d9",
};
const CIRO_BADGE: CSSProperties = {
  background: "#fff",
  color: "#6d28d9",
  borderRadius: 20,
  fontSize: 9.5,
  fontWeight: 800,
  padding: "0 5px",
};
const NOTICE: CSSProperties = {
  position: "fixed",
  top: 70,
  right: 20,
  zIndex: 99999,
  minWidth: 300,
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
};
const TABLE_DOM =
  '<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6"f>>rt<"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>';
const LENGTH_MENU = [10, 25, 50, 100, -1];

/** Menü öğesi simgesi (CHK:888-1033). */
const MENU_ICONS: Record<string, string> = {
  AT_BANK: "fas fa-university text-warning mr-2",
  COLLECTED_TO_CASH: "fas fa-cash-register text-success mr-2",
  COLLECTED: "fas fa-check-circle text-success mr-2",
  PAID: "fas fa-check-circle text-success mr-2",
  BOUNCED: "fas fa-times-circle text-danger mr-2",
  PROTESTED: "fas fa-gavel text-danger mr-2",
  COLLATERAL: "fas fa-shield-alt text-primary mr-2",
  PORTFOLIO: "fas fa-undo text-info mr-2",
  custody: "fas fa-wallet text-info mr-2",
  RETURNED: "fas fa-ban text-danger mr-2",
  cancelSettlement: "fas fa-ban text-danger mr-2",
};

type Notice = { variant: "success" | "danger" | "warning"; text: string } | null;

type PaymentState = {
  show: boolean;
  fundAccountId?: string;
  branchId?: string;
  currency?: string;
  endorseId?: string;
};

type StatusState = { item: InstrumentListItem; target: StatusTarget | ""; targets: StatusTarget[] };

/**
 * Çekler (ZTO Views/Checks/Checks.cshtml + ChecksController.Checks; 12.3_TASARIM §5.4). Süzgeç URL'de
 * tutulur; liste istemci kipinde (`fetchAllInstruments`, en çok 5.000 satır) ve DataTables gibi
 * sayfalanır. Satır menüsü yalnız sunucunun `allowedTransitions` alanından kurulur. Personel carili
 * satırda cari/keşideci/açıklama "—" ve menüde yalnız "Hareket Geçmişi" (OK-12.3-18).
 */
export function ChecksPage() {
  useZtoRootClass("zto-page-checks");
  const { t } = useTranslation("ztoFinans");
  const { t: tc } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const multiCompany = useMultiCompany();
  const activeCompany = useActiveCompanyId() ?? "";
  const me = useAuthStore((state) => state.me);
  const canPost = useCan("FINANCE_PAYMENT_CREATE");
  const today = todayIso();
  const defaultCompany = multiCompany ? activeCompany : "";

  // Derin bağlantı yalnız ilk çizimde (ZTO PaymentConfig.openModalOnLoad + replaceState).
  const [link] = useState(() => parseChecksDeepLink(params));
  const [payment, setPayment] = useState<PaymentState>(() =>
    canPost && link.openPayment
      ? {
          show: true,
          fundAccountId: link.fundAccountId,
          branchId: link.branchId,
          currency: link.currency,
        }
      : { show: false },
  );
  useEffect(() => {
    const rest = remainingChecksSearch(params);
    if (rest !== null) navigate({ search: rest ? `?${rest}` : "" }, { replace: true });
    // Yalnız ilk çizimde.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applied = useMemo(
    () => filtersFromSearch(params, today, defaultCompany),
    [params, today, defaultCompany],
  );
  const [draft, setDraft] = useState<ChecksFilters>(applied);
  useEffect(() => setDraft(applied), [applied]);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [notice, setNotice] = useState<Notice>(null);
  const [movementsOf, setMovementsOf] = useState<InstrumentListItem | null>(null);
  const [leafOf, setLeafOf] = useState<InstrumentListItem | null>(null);
  const [status, setStatus] = useState<StatusState | null>(null);
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [ciroOpen, setCiroOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const noticeTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    clearTimeout(noticeTimer.current);
    if (notice) {
      noticeTimer.current = setTimeout(
        () => setNotice(null),
        notice.variant === "success" ? 3000 : 5000,
      );
    }
    return () => clearTimeout(noticeTimer.current);
  }, [notice]);

  const list = useInstrumentList(checksListParams(applied, multiCompany));
  const listCompany = multiCompany ? applied.companyId || null : undefined;
  const endorsableList = useInstrumentList({
    kind: "CHECK",
    endorsable: true,
    companyId: listCompany,
  });
  const endorsableRows = useMemo(
    () => (endorsableList.data?.rows ?? []).filter(isEndorsable),
    [endorsableList.data],
  );
  const sorted = useMemo(() => sortChecks(list.data?.rows ?? [], today), [list.data, today]);
  const rows = useMemo(() => filterChecks(sorted, deferredSearch), [sorted, deferredSearch]);
  const overdueCount = useMemo(
    () => sorted.filter((row) => isOverdue(row, today)).length,
    [sorted, today],
  );

  const accounts = useAccountList({});
  const accountItems = useMemo(() => accountOptions(accounts.data ?? []), [accounts.data]);
  const books = useCheckBooks({ companyId: listCompany });
  const bookOptions = useMemo(
    () => [
      { value: "", label: t("checks.filter.allCheckBooks") },
      ...(books.data ?? []).map((book) => ({
        value: book.id,
        label: `${book.serialNo} — ${book.fundBankName ?? book.fundName}`,
      })),
    ],
    [books.data, t],
  );

  const openMenuAction = useCallback(
    (item: InstrumentListItem, entry: InstrumentMenuItem, menu: InstrumentMenuItem[]) => {
      if (entry.action === "cancelSettlement") {
        setReverseId(entry.settlementId);
        return;
      }
      setStatus({ item, target: menuTarget(entry) ?? "", targets: statusTargets(menu) });
    },
    [],
  );

  const columns = useMemo(() => {
    const c = (key: string, values?: Record<string, unknown>) => t(`checks.table.${key}`, values);
    const masked = tc("common.a11y.maskedEmployee");
    const newTab = tc("common.a11y.opensInNewTab");
    const accountLink = (id: string | null, name: string | null) =>
      id && name ? (
        <a
          href={accountTransactionsPath(id)}
          target="_blank"
          rel="noopener noreferrer"
          style={LINK}
          title={c("accountLink")}
        >
          {name}
          <span className="sr-only"> {newTab}</span>
        </a>
      ) : (
        <span>{name ?? ""}</span>
      );
    return [
      column.accessor((row) => row.checkBookSerial ?? "", {
        id: "checkBook",
        header: c("checkBook"),
        cell: ({ row }) =>
          row.original.checkBookSerial ? (
            <>
              <div>
                <strong className="text-primary">{row.original.checkBookSerial}</strong>
              </div>
              {row.original.leafNo !== null && (
                <small className="text-muted">
                  <i className="fas fa-file-alt" aria-hidden="true" />{" "}
                  {c("leaf", { n: row.original.leafNo })}
                </small>
              )}
            </>
          ) : (
            <span className="text-muted" title={c("manualTitle")}>
              <i className="fas fa-edit" aria-hidden="true" /> {c("manual")}
            </span>
          ),
      }),
      column.accessor("number", {
        id: "number",
        header: c("number"),
        cell: ({ row }) => (
          <>
            <button
              type="button"
              className="btn btn-link p-0 border-0 align-baseline"
              style={NUMBER}
              title={c("numberTitle")}
              onClick={() => setLeafOf(row.original)}
            >
              <strong className="text-primary">{row.original.number}</strong>
            </button>
            {row.original.bankBranch && (
              <>
                <br />
                <small className="text-muted">{row.original.bankBranch}</small>
              </>
            )}
          </>
        ),
      }),
      ...(multiCompany
        ? [
            column.accessor("companyName", {
              id: "company",
              header: c("company"),
            }),
          ]
        : []),
      column.accessor((row) => row.bankName ?? "", {
        id: "bank",
        header: c("bank"),
        cell: ({ row }) =>
          isOwnCheck(row.original) && row.original.fundAccountId ? (
            <a
              href={fundTransactionsPath("BANK", { fundId: row.original.fundAccountId })}
              target="_blank"
              rel="noopener noreferrer"
              style={LINK}
              title={c("bankLink")}
            >
              {row.original.bankName}
              <span className="sr-only"> {newTab}</span>
            </a>
          ) : (
            <span>{row.original.bankName}</span>
          ),
      }),
      column.accessor((row) => (row.employeeMasked ? "" : (partyColumns(row).drawer ?? "")), {
        id: "drawer",
        header: c("drawer"),
        cell: ({ row }) => {
          const r = row.original;
          if (r.employeeMasked && !isOwnCheck(r)) return masked;
          const party = partyColumns(r);
          return isOwnCheck(r) ? (
            <span>{party.drawer}</span>
          ) : r.drawerName ? (
            <span>{party.drawer}</span>
          ) : (
            accountLink(r.accountId, party.drawer)
          );
        },
      }),
      column.accessor((row) => (row.employeeMasked ? "" : (row.accountName ?? "")), {
        id: "firstPayee",
        header: c("firstPayee"),
        cell: ({ row }) => {
          const r = row.original;
          if (r.employeeMasked) return masked;
          return isOwnCheck(r) ? (
            accountLink(r.accountId, r.accountName)
          ) : (
            <span>{r.accountName ?? ""}</span>
          );
        },
      }),
      column.display({
        id: "holder",
        header: c("holder"),
        cell: ({ row }) => {
          const party = partyColumns(row.original);
          if (party.holder.kind === "endorsed") {
            return (
              <span className="badge badge-warning" style={SMALL_BADGE}>
                {t("instruments.party.endorsed")}
              </span>
            );
          }
          if (party.holder.kind === "ownCheck") {
            return (
              <span className="badge badge-primary" style={SMALL_BADGE}>
                {t("instruments.party.ownCheck")}
              </span>
            );
          }
          return (
            <span className="badge badge-success" style={SMALL_BADGE}>
              {c("customerCheck")}
            </span>
          );
        },
      }),
      column.accessor((row) => Number(row.money.amount), {
        id: "amount",
        header: c("amount"),
        cell: ({ row }) => (
          <span className="font-weight-bold">
            {formatN2(row.original.money.amount)} {currencySymbol(row.original.money.currency)}
          </span>
        ),
      }),
      column.display({
        id: "holding",
        header: c("holding"),
        cell: ({ row }) => {
          const place = holdingPlace(row.original);
          if (place.kind === "custody") {
            return (
              <span className="badge badge-success" style={HOLD_BADGE}>
                <i className="fas fa-wallet" aria-hidden="true" /> {place.name}
              </span>
            );
          }
          if (place.kind === "bank") {
            return (
              <span className="badge badge-primary" style={HOLD_BADGE}>
                <i className="fas fa-university" aria-hidden="true" /> {t(place.labelKey ?? "")}
              </span>
            );
          }
          if (place.kind === "endorsed") {
            return (
              <span className="badge badge-warning" style={SMALL_BADGE}>
                <i className="fas fa-exchange-alt" aria-hidden="true" /> {t(place.labelKey ?? "")}
              </span>
            );
          }
          return <span className="text-muted">-</span>;
        },
      }),
      column.display({
        id: "accounting",
        header: c("accounting"),
        cell: ({ row }) => {
          const acc = accountingStatus(row.original);
          return (
            <>
              <span className={`badge ${acc.className}`} style={ACC_BADGE}>
                <i className={`fas ${acc.icon} mr-1`} aria-hidden="true" />
                {t(acc.labelKey)}
              </span>
              {acc.endorsedTo && !row.original.employeeMasked && (
                <span className="badge badge-dark" style={HOLDER_BADGE} title={acc.endorsedTo}>
                  <i className="fas fa-user" aria-hidden="true" />
                  <span className="sr-only"> {acc.endorsedTo}</span>
                </span>
              )}
            </>
          );
        },
      }),
      column.accessor((row) => row.issueDate ?? "", {
        id: "issueDate",
        header: c("issueDate"),
        cell: ({ getValue }) => (getValue() ? formatDate(getValue()) : ""),
      }),
      column.accessor("dueDate", {
        id: "dueDate",
        header: c("dueDate"),
        cell: ({ getValue }) => formatDate(getValue()),
      }),
      column.display({
        id: "remaining",
        header: c("remaining"),
        cell: ({ row }) => {
          const cell = remainingCell(row.original, today);
          if (cell.kind === "ownPaid") {
            return (
              <span className="badge" style={PAID_BADGE} title={t("instruments.paidBadgeTitle")}>
                <i className="fas fa-money-check-alt mr-1" aria-hidden="true" />
                {t("instruments.paidBadge")}
              </span>
            );
          }
          if (cell.kind === "label") {
            return <span className={`badge ${cell.className}`}>{t(cell.labelKey)}</span>;
          }
          return (
            <span className={`badge ${cell.className}`}>
              {c(cell.overdue ? "daysPassed" : "daysLeft", { count: cell.count })}
            </span>
          );
        },
      }),
      column.accessor((row) => t(statusLabelKey(row.kind, row.direction, row.status)), {
        id: "status",
        header: c("status"),
        cell: ({ row, getValue }) => {
          const r = row.original;
          const sub = statusSubKey(r.status);
          return (
            <>
              {isOwnCheckPaid(r) ? (
                <span
                  className="badge"
                  style={PAID_STATUS_BADGE}
                  title={t("instruments.paidBadgeTitle")}
                >
                  <i className="fas fa-money-check-alt mr-1" aria-hidden="true" />
                  {t("instruments.paidBadge")}
                </span>
              ) : (
                <span className={`badge ${statusBadgeClass(r.status)}`}>
                  {getValue()}
                  {sub && <small className="d-block">{t(sub)}</small>}
                </span>
              )}
              {isEndorsable(r) && (
                <>
                  <br />
                  <span className="badge" style={ENDORSABLE_BADGE} title={c("endorsableTitle")}>
                    <i className="fas fa-exchange-alt mr-1" aria-hidden="true" />
                    {c("endorsable")}
                  </span>
                </>
              )}
            </>
          );
        },
      }),
      column.accessor("movementCount", {
        id: "movement",
        header: c("movement"),
        cell: ({ row }) => {
          const r = row.original;
          const date = r.lastMovementDate ?? r.settledDate;
          return (
            <div style={NOWRAP}>
              {r.movementCount > 0 ? (
                <div>
                  <button
                    type="button"
                    className={`btn btn-sm ${r.status === "ENDORSED" ? "btn-warning" : "btn-info"}`}
                    style={MOVE_BTN}
                    title={c("movementsTitle")}
                    onClick={() => setMovementsOf(r)}
                  >
                    <i
                      className={`fas ${r.status === "ENDORSED" ? "fa-exchange-alt" : "fa-history"}`}
                      aria-hidden="true"
                    />{" "}
                    {r.movementCount}
                    <span className="sr-only"> {c("movementsTitle")}</span>
                  </button>
                </div>
              ) : (
                <span className="text-muted">-</span>
              )}
              {date && (
                <small className="text-muted d-block" style={MOVE_DATE}>
                  {formatDate(date)}
                </small>
              )}
            </div>
          );
        },
      }),
      column.accessor((row) => (row.employeeMasked ? "" : (row.description ?? "")), {
        id: "description",
        header: c("description"),
        enableSorting: false,
        cell: ({ row, getValue }) => {
          if (row.original.employeeMasked) return <span className="text-muted">{masked}</span>;
          const text = getValue();
          return text ? (
            <small title={text}>{descriptionPreview(text)}</small>
          ) : (
            <span className="text-muted">-</span>
          );
        },
      }),
      column.display({
        id: "actions",
        header: c("action"),
        enableSorting: false,
        meta: { exportable: false },
        cell: ({ row }) => (
          <RowMenu
            item={row.original}
            canPost={canPost}
            onMovements={() => setMovementsOf(row.original)}
            onDetail={() => setLeafOf(row.original)}
            onAction={openMenuAction}
          />
        ),
      }),
    ];
  }, [t, tc, multiCompany, today, canPost, openMenuAction]);

  const update = (patch: Partial<ChecksFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const apply = (next: ChecksFilters = draft) => {
    const query = filtersToSearch(next, today, defaultCompany);
    setParams(query, { replace: true });
  };
  // ZTO clearFilters: tüm süzgeçler boş, vade −7/+30 (varsayılanlar URL'ye yazılmaz).
  const clear = () => setParams(new URLSearchParams(), { replace: true });
  const onFieldKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      apply();
    }
  };

  const exportList = async () => {
    setExporting(true);
    try {
      const c = (key: string) => t(`checks.table.${key}`);
      const masked = tc("common.a11y.maskedEmployee");
      const headers = [
        c("checkBook"),
        c("number"),
        ...(multiCompany ? [c("company")] : []),
        c("bank"),
        c("drawer"),
        c("firstPayee"),
        c("amount"),
        c("accounting"),
        c("issueDate"),
        c("dueDate"),
        c("status"),
        c("description"),
      ];
      await exportExcel({
        title: t("checks.header.title"),
        headers,
        rows: rows.map((r) => [
          r.checkBookSerial
            ? `${r.checkBookSerial}${r.leafNo !== null ? ` / ${r.leafNo}` : ""}`
            : c("manual"),
          r.number,
          ...(multiCompany ? [r.companyName] : []),
          r.bankName ?? "",
          r.employeeMasked && !isOwnCheck(r) ? masked : (partyColumns(r).drawer ?? ""),
          r.employeeMasked ? masked : (r.accountName ?? ""),
          `${formatN2(r.money.amount)} ${currencySymbol(r.money.currency)}`,
          t(accountingStatus(r).labelKey),
          r.issueDate ? formatDate(r.issueDate) : "",
          formatDate(r.dueDate),
          t(statusLabelKey(r.kind, r.direction, r.status)),
          r.employeeMasked ? masked : (r.description ?? ""),
        ]),
        fileName: `${t("checks.excelFile")}_${today}`,
      });
    } catch {
      setNotice({ variant: "danger", text: t("checks.statusModal.failed") });
    } finally {
      setExporting(false);
    }
  };

  const h = (key: string, values?: Record<string, unknown>) => t(`checks.header.${key}`, values);
  const f = (key: string, values?: Record<string, unknown>) => t(`checks.filter.${key}`, values);
  const companyOptions = [
    { value: "", label: f("allCompanies") },
    ...activeCompanies(me?.companies).map((co) => ({ value: co.id, label: co.shortName })),
  ];
  const total = list.data?.rows.length ?? 0;
  const ciroCount = endorsableRows.length;

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12">
          <div className="card">
            <div className="card-header bg-white border-bottom" style={CARD_HEADER}>
              <div className="d-flex justify-content-between align-items-center flex-wrap">
                <div className="d-flex align-items-center flex-wrap" style={LEFT_GAP}>
                  <Link
                    to={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.accounts}`}
                    className="erp-btn erp-btn-secondary"
                    title={h("backTitle")}
                    style={BACK}
                  >
                    <i className="fas fa-arrow-left" aria-hidden="true" />
                    <span className="d-none d-md-inline">{h("back")}</span>
                  </Link>
                  <div className="d-flex align-items-center">
                    <div className="erp-header-icon" aria-hidden="true">
                      <i className="fas fa-money-check" />
                    </div>
                    <div className="ml-3">
                      <h6 className="mb-0 text-dark" style={TITLE} id="checksTitle">
                        {h("title")}
                      </h6>
                      <div className="erp-breadcrumb mt-1">
                        <span>
                          <i className="fas fa-chart-line" aria-hidden="true" /> {h("finance")}
                        </span>
                        <span className="separator" aria-hidden="true">
                          ›
                        </span>
                        <span>{h("account")}</span>
                        <span className="separator" aria-hidden="true">
                          ›
                        </span>
                        <span className="text-primary font-weight-semibold" aria-current="page">
                          {h("crumb")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="d-none d-lg-flex align-items-center" style={CHIPS}>
                    <div className="erp-info-chip chip-success">
                      <i className="fas fa-wallet" aria-hidden="true" />
                      <span>{h("chipCount", { count: total })}</span>
                    </div>
                    {hasActiveFilter(applied, today, defaultCompany) && (
                      <div className="erp-info-chip chip-primary">
                        <i className="fas fa-filter" aria-hidden="true" />
                        <span>{h("chipFilter")}</span>
                      </div>
                    )}
                    <div className="erp-info-chip chip-warning">
                      <i className="fas fa-clock" aria-hidden="true" />
                      <span id="overdueChipCount">{h("chipOverdue", { count: overdueCount })}</span>
                    </div>
                  </div>
                </div>
                <div className="d-flex align-items-center" style={RIGHT_GAP}>
                  {canPost && (
                    <>
                      <button
                        type="button"
                        className="erp-btn erp-btn-primary"
                        onClick={() => setPayment({ show: true })}
                      >
                        <i className="fas fa-plus" aria-hidden="true" />
                        <span className="d-none d-md-inline">{h("newCheck")}</span>
                        <span className="sr-only d-md-none">{h("newCheck")}</span>
                      </button>
                      <div className="btn-divider" />
                    </>
                  )}
                  <Link
                    to={checkBooksPath()}
                    className="erp-btn erp-btn-info"
                    title={h("checkBooks")}
                  >
                    <i className="fas fa-book" aria-hidden="true" />
                    <span className="d-none d-md-inline">{h("checkBooks")}</span>
                  </Link>
                  <Link
                    to={paymentsPath()}
                    className="erp-btn erp-btn-success"
                    title={h("paymentsTitle")}
                  >
                    <i className="fas fa-money-bill-wave" aria-hidden="true" />
                    <span className="d-none d-md-inline">{h("payments")}</span>
                  </Link>
                  <Link
                    to={billsPath()}
                    className="erp-btn erp-btn-warning"
                    title={h("billsTitle")}
                  >
                    <i className="fas fa-file-invoice-dollar" aria-hidden="true" />
                    <span className="d-none d-md-inline">{h("bills")}</span>
                  </Link>
                  <div className="btn-divider" />
                  <button
                    type="button"
                    className="erp-btn erp-btn-warning"
                    title={h("reportTitle")}
                    onClick={() => setReportOpen(true)}
                  >
                    <i className="fas fa-chart-bar" aria-hidden="true" />
                    <span className="d-none d-md-inline">{h("report")}</span>
                  </button>
                  <button
                    type="button"
                    className="erp-btn erp-btn-success"
                    title={h("excelTitle")}
                    aria-busy={exporting}
                    disabled={exporting}
                    onClick={() => void exportList()}
                  >
                    <i className="fas fa-file-excel" aria-hidden="true" />
                    <span className="d-none d-md-inline">{h("excel")}</span>
                  </button>
                  <button
                    type="button"
                    className="erp-btn erp-btn-info"
                    title={h("print")}
                    onClick={() => window.print()}
                  >
                    <i className="fas fa-print" aria-hidden="true" />
                    <span className="d-none d-md-inline">{h("print")}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="card-body p-2">
              <div className="erp-filter-card">
                <div className="row">
                  {multiCompany && (
                    <div className="col-md-2 col-sm-6">
                      <label className="filter-label" htmlFor="filterCompany">
                        <i className="fas fa-landmark" aria-hidden="true" /> {f("company")}
                      </label>
                      <ZtoSelect
                        id="filterCompany"
                        className="filter-field no-select2"
                        value={draft.companyId}
                        onChange={(value) => update({ companyId: value, checkBookId: "" })}
                        options={companyOptions}
                        placeholder={null}
                      />
                    </div>
                  )}
                  <div className="col-md-2 col-sm-6">
                    <label className="filter-label" htmlFor="filterStatus">
                      <i className="fas fa-filter" aria-hidden="true" /> {f("status")}
                    </label>
                    <select
                      id="filterStatus"
                      className="filter-field"
                      value={draft.status}
                      onChange={(event) => update({ status: event.target.value as StatusFilter })}
                      onKeyDown={onFieldKey}
                    >
                      {STATUS_FILTER_OPTIONS.map((option) => (
                        <option key={option || "all"} value={option}>
                          {t(`checks.statusOption.${option || "all"}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-2 col-sm-6">
                    <label
                      className="filter-label"
                      id="filterCustomerLabel"
                      htmlFor="filterCustomer"
                    >
                      <i className="fas fa-user-tie" aria-hidden="true" /> {f("account")}
                    </label>
                    <ZtoSearchableSelect
                      id="filterCustomer"
                      className="filter-field"
                      ariaLabelledBy="filterCustomerLabel"
                      value={draft.accountId}
                      onChange={(value) => update({ accountId: value })}
                      options={accountItems}
                      placeholder={f("allAccounts")}
                      searchPlaceholder={f("searchAccount")}
                      noResultsText={f("noAccount")}
                    />
                  </div>
                  <div className="col-md-2 col-sm-6">
                    <label className="filter-label" htmlFor="filterCheckBook">
                      <i className="fas fa-book" aria-hidden="true" /> {f("checkBook")}
                    </label>
                    <select
                      id="filterCheckBook"
                      className="filter-field"
                      value={draft.checkBookId}
                      onChange={(event) => update({ checkBookId: event.target.value })}
                      onKeyDown={onFieldKey}
                    >
                      {bookOptions.map((option) => (
                        <option key={option.value || "all"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-2 col-sm-6">
                    <label className="filter-label" htmlFor="filterDateStart">
                      <i className="fas fa-calendar-check" aria-hidden="true" /> {f("dueStart")}
                    </label>
                    <input
                      type="date"
                      id="filterDateStart"
                      className="filter-field"
                      value={draft.dueFrom}
                      onChange={(event) => update({ dueFrom: event.target.value })}
                      onKeyDown={onFieldKey}
                    />
                  </div>
                  <div className="col-md-2 col-sm-6">
                    <label className="filter-label" htmlFor="filterDateEnd">
                      <i className="fas fa-calendar-check" aria-hidden="true" /> {f("dueEnd")}
                    </label>
                    <input
                      type="date"
                      id="filterDateEnd"
                      className="filter-field"
                      value={draft.dueTo}
                      onChange={(event) => update({ dueTo: event.target.value })}
                      onKeyDown={onFieldKey}
                    />
                  </div>
                  <div className="col-md-1 col-sm-6">
                    <div className="filter-actions">
                      <button
                        type="button"
                        className="filter-btn btn-filter-apply"
                        title={f("apply")}
                        onClick={() => apply()}
                      >
                        <i className="fas fa-filter" aria-hidden="true" />
                        <span className="sr-only">{f("apply")}</span>
                      </button>
                      <button
                        type="button"
                        className="filter-btn btn-filter-clear"
                        title={f("clear")}
                        onClick={clear}
                      >
                        <i className="fas fa-times" aria-hidden="true" />
                        <span className="sr-only">{f("clear")}</span>
                      </button>
                    </div>
                  </div>
                  <div className="col-md-1 col-sm-6" style={CIRO_COL}>
                    <button
                      type="button"
                      id="ciroEdilebilirBtn"
                      className="filter-btn"
                      title={f("ciroTitle")}
                      style={CIRO_BTN}
                      onClick={() => setCiroOpen(true)}
                    >
                      <i className="fas fa-exchange-alt" aria-hidden="true" /> {f("ciro")}
                      {ciroCount > 0 && (
                        <span id="ciroCountBadge" style={CIRO_BADGE}>
                          {ciroCount}
                        </span>
                      )}
                      <span className="sr-only">{f("ciroCount", { count: ciroCount })}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="d-flex justify-content-end mt-2">
                <div className="form-inline">
                  <label htmlFor="checksSearch" className="mr-2 mb-0" style={SEARCH_LABEL}>
                    <i className="fas fa-search" aria-hidden="true" /> {t("checks.search.label")}
                  </label>
                  <input
                    type="search"
                    id="checksSearch"
                    className="form-control form-control-sm"
                    placeholder={t("checks.search.placeholder")}
                    style={SEARCH_INPUT}
                    value={search}
                    autoComplete="off"
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
              </div>

              {list.data?.truncated && (
                <div className="alert alert-warning mt-2 mb-0" role="status">
                  <i className="fas fa-exclamation-triangle" aria-hidden="true" />{" "}
                  {t("instruments.truncated")}
                </div>
              )}
              <div className="sr-only" role="status">
                {list.isSuccess ? t("checks.table.resultCount", { count: rows.length }) : ""}
              </div>
              <div
                className="mt-3 table-responsive"
                role="region"
                aria-labelledby="checksTitle"
                tabIndex={0}
              >
                <ZtoDataTable
                  id="checksTable"
                  columns={columns}
                  data={rows}
                  getRowId={(row) => row.id}
                  tableClassName="table table-compact table-bordered table-striped table-hover chk-phone-card-table"
                  tableStyle={TABLE_STYLE}
                  dom={TABLE_DOM}
                  pageLength={50}
                  lengthMenu={LENGTH_MENU}
                  order={[]}
                  processing={list.isFetching}
                  cellDataLabel
                  rowClassName={(row) => (isOverdue(row, today) ? "table-danger" : undefined)}
                  emptyText={
                    list.isPending ? (
                      <span className="text-muted">
                        <i className="fas fa-spinner fa-spin mr-2" aria-hidden="true" />
                        {t("checks.table.loading")}
                      </span>
                    ) : list.isError ? (
                      <span className="text-danger">
                        <i className="fas fa-exclamation-triangle" aria-hidden="true" />{" "}
                        {t("checks.table.loadFailed")}
                      </span>
                    ) : (
                      <span className="text-muted">{t("checks.table.empty")}</span>
                    )
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {notice && (
        <div
          className={`alert alert-${notice.variant} alert-dismissible fade show`}
          role={notice.variant === "success" ? "status" : "alert"}
          style={NOTICE}
        >
          {notice.text}
          <button
            type="button"
            className="close"
            aria-label={tc("common.a11y.close")}
            onClick={() => setNotice(null)}
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      )}

      <EndorsableChecksModal
        show={ciroOpen}
        onHide={() => setCiroOpen(false)}
        rows={endorsableRows}
        loading={endorsableList.isPending}
        onEndorse={
          canPost
            ? (item) => {
                setCiroOpen(false);
                setPayment({ show: true, endorseId: item.id, currency: item.money.currency });
              }
            : undefined
        }
        onCollectToCash={
          canPost
            ? (item) => {
                setCiroOpen(false);
                const menu = transitionMenu(item, "check");
                setStatus({ item, target: "COLLECTED_TO_CASH", targets: statusTargets(menu) });
              }
            : undefined
        }
      />
      <InstrumentMovementsModal
        show={movementsOf !== null}
        onHide={() => setMovementsOf(null)}
        instrument={movementsOf}
      />
      <CheckLeaf3DModal item={leafOf} onHide={() => setLeafOf(null)} />
      <CheckStatusModal
        item={status?.item ?? null}
        initialTarget={status?.target ?? ""}
        targets={status?.targets ?? []}
        onHide={() => setStatus(null)}
        onNotice={setNotice}
      />
      <ReverseSettlementModal
        settlementId={reverseId}
        type="PAYMENT"
        onHide={() => setReverseId(null)}
        onDone={(text) => setNotice({ variant: "success", text })}
      />
      <CheckReportModal show={reportOpen} onHide={() => setReportOpen(false)} />
      {canPost && (
        <PaymentModal
          show={payment.show}
          onHide={() => setPayment({ show: false })}
          mode="add"
          presetMethod="CHECK"
          presetFundAccountId={payment.fundAccountId}
          presetBranchId={payment.branchId}
          presetCurrency={payment.currency}
          presetEndorseInstrumentId={payment.endorseId}
        />
      )}
    </div>
  );
}

/** Durum rozeti sınıfı (ZTO `StatusBadge`). */
function statusBadgeClass(status: InstrumentListItem["status"]): string {
  switch (status) {
    case "PORTFOLIO":
      return "badge-info";
    case "AT_BANK":
      return "badge-warning";
    case "COLLECTED":
    case "COLLECTED_TO_CASH":
    case "PAID":
      return "badge-success";
    case "BOUNCED":
    case "PROTESTED":
      return "badge-danger";
    case "ENDORSED":
      return "badge-warning";
    case "ISSUED":
      return "badge-primary";
    case "CANCELLED":
    case "RETURNED":
      return "badge-dark";
    default:
      return "badge-secondary";
  }
}

/** Satır menüsü (CHK:866-1083): "Durum Değiştir" yalnız POST izninde ve `allowedTransitions`'tan. */
function RowMenu({
  item,
  canPost,
  onMovements,
  onDetail,
  onAction,
}: {
  item: InstrumentListItem;
  canPost: boolean;
  onMovements: () => void;
  onDetail: () => void;
  onAction: (
    item: InstrumentListItem,
    entry: InstrumentMenuItem,
    menu: InstrumentMenuItem[],
  ) => void;
}) {
  const { t } = useTranslation("ztoFinans");
  const m = (key: string) => t(`checks.menu.${key}`);
  const menu = canPost ? transitionMenu(item, "check") : [];
  const masked = item.employeeMasked;
  return (
    <div className="d-flex gap-1 flex-wrap">
      <ZtoMenuButton
        buttonClassName="action-btn action-btn-secondary dropdown-toggle"
        buttonStyle={MENU_BTN}
        label={<i className="fas fa-ellipsis-v" aria-hidden="true" />}
        title={m("trigger")}
        ariaLabel={`${m("trigger")} ${item.number}`}
        menuClassName="dropdown-menu dropdown-menu-right"
        menuStyle={MENU}
        align="right"
      >
        {menu.length > 0 && (
          <>
            <h6 className="dropdown-header" role="presentation">
              <i className="fas fa-exchange-alt" aria-hidden="true" /> {m("statusHeader")}
            </h6>
            {menu.map((entry) => {
              const key = entry.action === "transition" ? entry.target : entry.action;
              return (
                <MenuItem
                  key={key}
                  icon={MENU_ICONS[key] ?? "fas fa-circle mr-2"}
                  label={t(entry.labelKey)}
                  onSelect={() => onAction(item, entry, menu)}
                />
              );
            })}
            <MenuDivider />
          </>
        )}
        <h6 className="dropdown-header" role="presentation">
          <i className="fas fa-cog" aria-hidden="true" /> {m("actionsHeader")}
        </h6>
        {!masked && (
          <MenuItem
            icon="fas fa-folder text-primary mr-2"
            label={m("documents")}
            href={checkDocumentsPath(item.id)}
            newTab
          />
        )}
        <MenuItem
          icon="fas fa-history text-info mr-2"
          label={
            <>
              {m("movements")}
              {item.movementCount > 0 && (
                <span className="badge badge-info float-right">{item.movementCount}</span>
              )}
            </>
          }
          onSelect={onMovements}
        />
        {!masked && (
          <MenuItem
            icon="fas fa-money-check-alt text-success mr-2"
            label={m("detail")}
            onSelect={onDetail}
          />
        )}
        {canPost && canEditInstrument(item) && (
          <MenuItem
            icon="fas fa-edit text-warning mr-2"
            label={m("edit")}
            to={checkEditPath(item.id)}
          />
        )}
        {item.status === "ENDORSED" && item.allowedTransitions.length === 0 && (
          <div
            className="dropdown-item text-muted py-2"
            role="menuitem"
            aria-disabled="true"
            tabIndex={-1}
            style={{ cursor: "not-allowed" }}
          >
            <i className="fas fa-ban text-danger mr-2" aria-hidden="true" />
            {m("endorsedLocked")}
          </div>
        )}
      </ZtoMenuButton>
    </div>
  );
}
