import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { useCan, useMultiCompany } from "../../../../pages/finance/common";
import { useFundTransactions, useTransfers } from "../../../../pages/finance/fundApi";
import type { TransferListRow } from "../../../../pages/finance/types";
import { ZtoAccessDenied, ZtoPageHeader } from "../../../components";
import { ZTO_FINANS_BASE, ZTO_SLUGS, type TransferCenterTab } from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { DeleteTransferModal } from "./DeleteTransferModal";
import { EditFxTransferModal } from "./EditFxTransferModal";
import { EditTransferModal } from "./EditTransferModal";
import { ExchangeBreakReportModal } from "./ExchangeBreakReportModal";
import { FundStatementTab } from "./FundStatementTab";
import { NewTransferForm } from "./NewTransferForm";
import { defaultRange, parseDeepLink } from "./transferCenterLogic";
import { TransfersTab } from "./TransfersTab";

// ZTO sidebar düzeni: container-fluid + padding-left:25px; margin-top:60px ZTO'nun sabit üst çubuğu
// içindir, AppShell çubuğu akışta olduğundan alınmaz (12.0 kararı, AllTransactionsPage ile aynı).
const PAGE_STYLE = { paddingLeft: 25 } as const;
const ACCOUNTS_LINK_STYLE = { color: "#007bff", fontWeight: "bold" } as const;

const TABS: Array<{
  key: TransferCenterTab;
  id: string;
  panel: string;
  icon: string;
  badge?: string;
}> = [
  { key: "new", id: "newTransfer-tab", panel: "newTransferPanel", icon: "fas fa-plus-circle" },
  {
    key: "transfers",
    id: "transfers-tab",
    panel: "transfersPanel",
    icon: "fas fa-exchange-alt",
    badge: "badge badge-primary",
  },
  {
    key: "bank",
    id: "statement-tab",
    panel: "statementPanel",
    icon: "fas fa-list-alt",
    badge: "badge badge-info",
  },
  {
    key: "cash",
    id: "cash-statement-tab",
    panel: "cashStatementPanel",
    icon: "fas fa-cash-register",
    badge: "badge badge-success",
  },
];

const BADGE_IDS: Record<string, string> = {
  transfers: "transferCountBadge",
  bank: "bankStatementCountBadge",
  cash: "cashStatementCountBadge",
};

/**
 * Transfer Merkezi (ZTO Views/BankStatement/Index.cshtml + wwwroot/js/zt/bankstatement/index.js;
 * 12.2_TASARIM §5.11): başlık, BS-1 rapor penceresi, dört sekme (Yeni Transfer, Transferler, Tüm Banka
 * / Kasa Ekstreleri), düzenleme ve silme pencereleri. Derin bağlantı `?tab&transferType&…`.
 */
export function TransferCenterPage() {
  useZtoRootClass("zto-page-transfer-center");
  const { t } = useTranslation("ztoFinans");
  const tc = (key: string) => t(`transferCenter.${key}`);
  const [searchParams] = useSearchParams();
  const link = useMemo(() => parseDeepLink(searchParams), [searchParams]);
  const canWrite = useCan("FINANCE_PAYMENT_CREATE");
  const multiCompany = useMultiCompany();
  const [tab, setTab] = useState<TransferCenterTab>(link.tab);
  // Transferler bir kez tembel yüklenir; ekstreler her gösterimde tazelenir (ZTO).
  const [visited, setVisited] = useState<Set<TransferCenterTab>>(() => new Set([link.tab]));
  const [formKey, setFormKey] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [editRow, setEditRow] = useState<TransferListRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<TransferListRow | null>(null);
  const [counts, setCounts] = useState<Partial<Record<TransferCenterTab, number>>>({});
  const tabRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  // Rozet sayıları açılışta size=1 sorgularla (totalElements); sekme yüklenince onun sayısı geçer.
  const range = useMemo(() => defaultRange(), []);
  const transferCount = useTransfers(range, 0, 1);
  const bankCount = useFundTransactions({ kind: "BANK", ...range }, 0, 1);
  const cashCount = useFundTransactions({ kind: "CASH", ...range }, 0, 1);
  const badge = (key: TransferCenterTab) =>
    counts[key] ??
    (key === "transfers"
      ? transferCount.data?.totalElements
      : key === "bank"
        ? bankCount.data?.totalElements
        : cashCount.data?.totalElements) ??
    0;

  const show = useCallback((key: TransferCenterTab) => {
    setTab(key);
    setVisited((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
  }, []);
  const setCount = useCallback(
    (key: TransferCenterTab, count: number) =>
      setCounts((prev) => (prev[key] === count ? prev : { ...prev, [key]: count })),
    [],
  );
  const onTransfersCount = useCallback((n: number) => setCount("transfers", n), [setCount]);
  const onBankCount = useCallback((n: number) => setCount("bank", n), [setCount]);
  const onCashCount = useCallback((n: number) => setCount("cash", n), [setCount]);

  // Sekme listesi ok tuşlarıyla gezilir (görünüm aynı; yalnız ARIA ve klavye).
  function onTabKey(event: KeyboardEvent<HTMLAnchorElement>, index: number) {
    const keys: Record<string, number> = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    };
    const next = keys[event.key];
    if (next === undefined) return;
    event.preventDefault();
    show(TABS[next].key);
    tabRefs.current[next]?.focus();
  }

  const header = (
    <div className="card mb-3">
      <ZtoPageHeader
        variant="panel"
        icon="fas fa-check-circle"
        title={tc("title")}
        breadcrumb={[
          {
            icon: "fas fa-user-tie",
            label: <span style={ACCOUNTS_LINK_STYLE}>{tc("breadcrumbAccounts")}</span>,
            to: `${ZTO_FINANS_BASE}/${ZTO_SLUGS.accounts}`,
          },
          { icon: "fas fa-exchange-alt", label: tc("breadcrumbCurrent") },
        ]}
        actions={
          <div className="d-flex align-items-center gap-2">
            <Link
              to={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.banks}`}
              className="erp-btn erp-btn-success mr-2"
            >
              <i className="fas fa-university" aria-hidden="true" />
              <span>{tc("banks")}</span>
            </Link>
            <Link
              to={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.bankTransactions}`}
              className="erp-btn erp-btn-info mr-2"
            >
              <i className="fas fa-exchange-alt" aria-hidden="true" />
              <span>{tc("allBankTransactions")}</span>
            </Link>
            <div className="btn-divider" />
            <Link
              to={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.cashes}`}
              className="erp-btn erp-btn-warning mr-2"
            >
              <i className="fas fa-cash-register" aria-hidden="true" />
              <span>{tc("cashes")}</span>
            </Link>
            <Link
              to={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.cashTransactions}`}
              className="erp-btn erp-btn-info mr-2"
            >
              <i className="fas fa-exchange-alt" aria-hidden="true" />
              <span>{tc("allCashTransactions")}</span>
            </Link>
            <div className="btn-divider" />
            <Link
              to={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.accounts}`}
              className="erp-btn erp-btn-secondary"
            >
              <i className="fas fa-arrow-left" aria-hidden="true" />
              <span>{tc("backToAccounts")}</span>
            </Link>
          </div>
        }
      />
    </div>
  );

  const pane = (key: TransferCenterTab, panel: string, labelledBy: string, content: ReactNode) => (
    <div
      className={`tab-pane fade${tab === key ? " show active" : ""}`}
      id={panel}
      role="tabpanel"
      aria-labelledby={labelledBy}
      hidden={tab !== key}
    >
      {content}
    </div>
  );

  return (
    <div className="container-fluid bank-statement-page" style={PAGE_STYLE}>
      {header}
      <div className="row mb-2 align-items-center">
        <div className="col-auto ml-auto">
          <button
            type="button"
            className="btn btn-sm btn-info"
            id="btnExchangeBreakReport"
            title={tc("fxReportButtonTitle")}
            onClick={() => setReportOpen(true)}
          >
            <i className="fas fa-project-diagram mr-1" aria-hidden="true" /> {tc("fxReportButton")}
          </button>
        </div>
      </div>
      <ExchangeBreakReportModal show={reportOpen} onHide={() => setReportOpen(false)} />

      <ul className="nav nav-tabs" id="mainTabs" role="tablist">
        {TABS.map((item, index) => (
          <li className="nav-item" key={item.key} role="presentation">
            <a
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              className={`nav-link${tab === item.key ? " active" : ""}`}
              id={item.id}
              href={`#${item.panel}`}
              role="tab"
              aria-selected={tab === item.key}
              aria-controls={item.panel}
              tabIndex={tab === item.key ? 0 : -1}
              onClick={(event) => {
                event.preventDefault();
                show(item.key);
              }}
              onKeyDown={(event) => onTabKey(event, index)}
            >
              <i className={item.icon} aria-hidden="true" /> {tc(`tabs.${item.key}`)}
              {item.badge && (
                <>
                  {" "}
                  <span className={item.badge} id={BADGE_IDS[item.key]}>
                    {badge(item.key)}
                  </span>
                </>
              )}
            </a>
          </li>
        ))}
      </ul>

      <div className="tab-content" id="mainTabContent">
        {pane(
          "bank",
          "statementPanel",
          "statement-tab",
          visited.has("bank") && (
            <FundStatementTab
              kind="BANK"
              active={tab === "bank"}
              multiCompany={multiCompany}
              onCount={onBankCount}
            />
          ),
        )}
        {pane(
          "cash",
          "cashStatementPanel",
          "cash-statement-tab",
          visited.has("cash") && (
            <FundStatementTab
              kind="CASH"
              active={tab === "cash"}
              multiCompany={multiCompany}
              onCount={onCashCount}
            />
          ),
        )}
        {pane(
          "transfers",
          "transfersPanel",
          "transfers-tab",
          visited.has("transfers") && (
            <TransfersTab
              initialQuery={link.q}
              initialFrom={link.from}
              initialTo={link.to}
              multiCompany={multiCompany}
              canWrite={canWrite}
              onEdit={setEditRow}
              onDelete={setDeleteRow}
              onCount={onTransfersCount}
            />
          ),
        )}
        {pane(
          "new",
          "newTransferPanel",
          "newTransfer-tab",
          canWrite ? (
            <NewTransferForm
              key={formKey}
              link={link}
              onSaved={() => {
                setFormKey((k) => k + 1);
                show("transfers");
              }}
            />
          ) : (
            <ZtoAccessDenied />
          ),
        )}
      </div>

      <EditTransferModal
        row={editRow && editRow.transferType !== "FX_EXCHANGE" ? editRow : null}
        onHide={() => setEditRow(null)}
      />
      <EditFxTransferModal
        row={editRow && editRow.transferType === "FX_EXCHANGE" ? editRow : null}
        onHide={() => setEditRow(null)}
      />
      <DeleteTransferModal row={deleteRow} onHide={() => setDeleteRow(null)} />
    </div>
  );
}
