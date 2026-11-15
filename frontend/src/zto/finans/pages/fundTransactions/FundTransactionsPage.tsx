import { createColumnHelper } from "@tanstack/react-table";
import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../../../auth/authStore";
import { activeCompanies, useActiveCompanyId } from "../../../../auth/companyStore";
import { useCan, useMultiCompany } from "../../../../pages/finance/common";
import {
  exportFundTransactions,
  useFund,
  useFundList,
  useFundTransactions,
} from "../../../../pages/finance/fundApi";
import type { Fund, FundKind, FundTransactionRow } from "../../../../pages/finance/types";
import { mapInChunks } from "../../../a11y";
import { useBranchTree } from "../../../branch/branchTree";
import {
  ZtoBranchSelect,
  ZtoDataTable,
  ZtoSearchableSelect,
  ZtoSelect,
  ZtoTooltip,
  currencySymbol,
  formatDate,
  formatN2,
  type DataTableState,
} from "../../../components";
import { errorCode, errorMessage } from "../../../components/definitionLogic";
import { downloadBlob } from "../../../export";
import { ZTO_FINANS_BASE, ZTO_SLUGS, accountTransactionsPath, paymentsPath } from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import {
  SETTLEMENT_MODAL_PARAMS,
  branchIndex,
  companyNames,
  parseSettlementModal,
  type SettlementModalRequest,
} from "../funds/fundsLogic";
import { CollectionModal, PaymentModal } from "../settlementModals";
import { ActivityReportModal } from "./ActivityReportModal";
import { FundTransactionDetailModal } from "./FundTransactionDetailModal";
import { SelectedFundSummary } from "./SelectedFundSummary";
import {
  ACCOUNTING_TYPES,
  DIRECTIONS,
  LENGTH_MENU,
  PAGE_LENGTH,
  accountingKeyOf,
  balanceEquation,
  canEditPayment,
  csvContent,
  csvFileName,
  csvHeader,
  csvRow,
  defaultFilters,
  fundOptions,
  rowNumber,
  serverPageSize,
  toParams,
  todayIso,
  type CsvTexts,
  type TxFilters,
} from "./fundTransactionsLogic";

const column = createColumnHelper<FundTransactionRow>();
const TABLE_DOM =
  '<"row"<"col-sm-12 col-md-6"l><"col-sm-12 col-md-6"f>>rt<"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>';
const CELL_BOLD: CSSProperties = { fontWeight: 600, fontSize: 11 };
const CELL_WP: CSSProperties = { fontWeight: 600, color: "#334155", fontSize: 11 };
const CELL_FUND: CSSProperties = { fontWeight: 600, color: "#1e40af", fontSize: 11 };
const CELL_BADGE: CSSProperties = { fontSize: 11, padding: "4px 8px" };
const CELL_AMOUNT: CSSProperties = { fontWeight: 700, fontSize: 11 };
const CELL_DESC: CSSProperties = { fontSize: 11, color: "#64748b" };
const ACCOUNT_LINK: CSSProperties = {
  color: "#1e40af",
  textDecoration: "none",
  fontWeight: 500,
  fontSize: 11,
};
const INFO_ICON: CSSProperties = { fontSize: 11, cursor: "help" };
const ACTIONS_GAP: CSSProperties = { gap: 6 };
const HEAD_GAP: CSSProperties = { gap: 12 };
const CARD: CSSProperties = { borderRadius: 8, boxShadow: "0 1px 8px rgba(0,0,0,0.05)" };
const HEADER: CSSProperties = { padding: "10px 20px" };
const TITLE: CSSProperties = { fontSize: 14, fontWeight: 600 };
const ICON_STYLE: Record<FundKind, CSSProperties> = {
  BANK: { background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)", color: "#fff" },
  CASH: { background: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", color: "#fff" },
};
const SPIN_MS = 700;

type Notice = { variant: "danger" | "warning"; text: string } | null;

/**
 * Sayfa içi ödeme / tahsilat modalı (ZTO BT:726-732 `_AddPaymentModal` + `_CollectionModalsPartial`).
 * `open=false` iken ön değerler kapanış animasyonu boyunca korunur; `seq` her açılışta yeni örnek verir.
 */
type SettlementModalState = SettlementModalRequest & {
  open: boolean;
  seq: number;
  fundId?: string;
  branchId?: string;
  currency?: string;
};

/**
 * Banka / Kasa Hareketleri (ZTO BankTransactions/Index.cshtml, CashTransactions/Index.cshtml; 12.2
 * §5.9). Tek bileşen, `kind` = BANK (mavi) | CASH (turuncu). Sunucu sayfalı (`/funds/transactions`,
 * açık page/size, "Tümü" = 500); yürüyen bakiye sunucuda (ZTO B10). Süzgeç: (≥ 2 şirket) ŞİRKET,
 * İŞ YERİ, Banka/Kasa (ZtoSearchableSelect), İşlem Türü, MUHASEBE TİPİ, tarih aralığı.
 */
export function FundTransactionsPage({ kind = "BANK" }: { kind?: FundKind }) {
  const bank = kind === "BANK";
  useZtoRootClass(bank ? "zto-page-bank-transactions" : "zto-page-cash-transactions");
  const { t } = useTranslation("ztoFinans");
  const { t: tc } = useTranslation();
  const [params, setParams] = useSearchParams();
  const multiCompany = useMultiCompany();
  const activeCompany = useActiveCompanyId();
  const canPost = useCan("FINANCE_PAYMENT_CREATE");
  const me = useAuthStore((state) => state.me);
  const today = todayIso();
  const initial = useMemo(
    () =>
      defaultFilters(kind, today, {
        companyId: activeCompany ?? "",
        branchId: params.get("branchId") ?? "",
        fundId: params.get("fundId") ?? "",
      }),
    // Yalnız ilk çizimde (URL parametreleri ilk değerdir).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const currency = params.get("currency") ?? undefined;
  const [draft, setDraft] = useState<TxFilters>(initial);
  const [applied, setApplied] = useState<TxFilters>(initial);
  const [table, setTable] = useState<DataTableState | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [activity, setActivity] = useState(0);
  const [notice, setNotice] = useState<Notice>(null);
  const [spinning, setSpinning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const spinTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(spinTimer.current), []);
  const [modal, setModal] = useState<SettlementModalState | null>(null);
  // ZTO `?openModal=true` / `?openCollection=true&collectionMethod=…` (kart bağlantıları): ilk çizimde
  // okunur; yetkisiz kullanıcıda yok sayılır.
  const [deepLink] = useState(() => (canPost ? parseSettlementModal(params, kind) : null));

  const tree = useBranchTree();
  const branches = useMemo(() => branchIndex(tree.data), [tree.data]);
  const companies = useMemo(() => companyNames(me?.companies), [me?.companies]);
  const companyName = useCallback((id: string) => companies.get(id) ?? "", [companies]);
  const fundCompany = multiCompany ? draft.companyId || null : undefined;
  const funds = useFundList({ kind, companyId: fundCompany });
  const selectedFund = useFund(applied.fundId || undefined);

  const pageLength = table?.length ?? PAGE_LENGTH[kind];
  const size = serverPageSize(pageLength);
  const page = table && pageLength > 0 ? Math.floor(table.start / pageLength) : 0;
  const sortDesc = table?.sorting[0]?.desc ?? true;
  const query = useMemo(
    () => ({
      ...toParams(kind, applied, {
        q: table?.search,
        multiCompany,
        summary: !!applied.fundId,
        currency,
      }),
      sort: sortDesc ? ("desc" as const) : ("asc" as const),
    }),
    [kind, applied, table?.search, multiCompany, currency, sortDesc],
  );
  const transactions = useFundTransactions(query, page, size);
  const rows = transactions.data?.content ?? [];
  const total = transactions.data?.totalElements ?? 0;
  const accountingLabel = useCallback(
    (row: Pick<FundTransactionRow, "accountingType">) => {
      const key = accountingKeyOf(kind, row.accountingType);
      return key ? t(`fundTransactions.accountingTypes.${key}`) : row.accountingType;
    },
    [kind, t],
  );

  const tt = (key: string, options?: Record<string, unknown>) =>
    t(`fundTransactions.table.${key}`, options);
  const columns = useMemo(() => {
    const c = (key: string) => t(`fundTransactions.table.${key}`);
    const list = [
      column.display({
        id: "no",
        header: () => (
          <>
            <i />
            {c("no")}
          </>
        ),
        enableSorting: false,
        cell: ({ row }) => <span style={CELL_BOLD}>{rowNumber(page, size, row.index)}</span>,
      }),
      column.accessor("transactionDate", {
        id: "date",
        header: () => (
          <>
            <i />
            {c("date")}
          </>
        ),
        cell: ({ getValue }) => <span style={CELL_BOLD}>{formatDate(getValue())}</span>,
      }),
      column.accessor((row) => branches.get(row.branchId)?.name ?? "", {
        id: "workPlace",
        enableSorting: false,
        header: () => (
          <>
            <i className="fas fa-building mr-1" aria-hidden="true" />
            {c("workPlace")}
          </>
        ),
        cell: ({ getValue }) => <span style={CELL_WP}>{getValue() || "-"}</span>,
      }),
      column.accessor("fundName", {
        id: "fund",
        enableSorting: false,
        header: () => (
          <>
            <i
              className={`fas ${bank ? "fa-university" : "fa-cash-register"} mr-1`}
              aria-hidden="true"
            />
            {c(bank ? "bank" : "cash")}
          </>
        ),
        cell: ({ getValue }) => <div style={CELL_FUND}>{getValue() || "-"}</div>,
      }),
      ...(multiCompany
        ? [
            column.accessor((row) => companyName(row.companyId), {
              id: "company",
              enableSorting: false,
              header: () => (
                <>
                  <i className="fas fa-landmark mr-1" aria-hidden="true" />
                  {c("company")}
                </>
              ),
              cell: ({ getValue }) => <span style={CELL_WP}>{getValue() || "-"}</span>,
            }),
          ]
        : []),
      column.accessor("direction", {
        id: "type",
        enableSorting: false,
        header: () => (
          <>
            <i className="fas fa-exchange-alt mr-1" aria-hidden="true" />
            {c("type")}
          </>
        ),
        meta: { cellClassName: "text-center" },
        cell: ({ row }) => {
          const income = row.original.direction === "IN";
          return (
            <>
              <span
                className={`badge ${income ? "badge-success" : "badge-danger"}`}
                style={CELL_BADGE}
              >
                <i
                  className={`fas ${income ? "fa-arrow-down" : "fa-arrow-up"} mr-1`}
                  aria-hidden="true"
                />
                {c(income ? "in" : "out")}
              </span>
              {(row.original.reversal || row.original.reversed) && (
                <span className="badge badge-light ml-1">{c("reversed")}</span>
              )}
            </>
          );
        },
      }),
      column.accessor((row) => accountingLabel(row), {
        id: "accounting",
        enableSorting: false,
        header: () => (
          <>
            <i className="fas fa-tag mr-1" aria-hidden="true" />
            {c("accounting")}
          </>
        ),
        cell: ({ getValue }) => (
          <span className="badge badge-secondary" style={{ fontSize: 11 }}>
            {getValue() || "-"}
          </span>
        ),
      }),
      column.accessor("amount", {
        id: "amount",
        enableSorting: false,
        header: () => (
          <>
            <i className="fas fa-coins mr-1" aria-hidden="true" />
            {c("amount")}
          </>
        ),
        meta: { cellClassName: "text-right", headerClassName: "text-right" },
        cell: ({ row }) => {
          const income = row.original.direction === "IN";
          return (
            <span className={income ? "text-success" : "text-danger"} style={CELL_AMOUNT}>
              {income ? "+" : "-"}
              {formatN2(row.original.amount)} {currencySymbol(row.original.currency)}
            </span>
          );
        },
      }),
      column.accessor("runningBalance", {
        id: "balance",
        enableSorting: false,
        header: () => (
          <>
            <i className="fas fa-wallet mr-1" aria-hidden="true" />
            {c("balance")}
          </>
        ),
        meta: { cellClassName: "text-right", headerClassName: "text-right" },
        cell: ({ row }) => {
          const value = row.original.runningBalance;
          const equation = balanceEquation(row.original, formatN2);
          return (
            <>
              <span className={value >= 0 ? "text-success" : "text-danger"} style={CELL_AMOUNT}>
                {formatN2(value)} {currencySymbol(row.original.currency)}
              </span>
              <ZtoTooltip content={equation}>
                <i
                  className="fas fa-info-circle text-muted ml-1 balance-tooltip"
                  style={INFO_ICON}
                  tabIndex={0}
                  role="img"
                  aria-label={c("balanceInfo").replace("{{equation}}", equation)}
                />
              </ZtoTooltip>
            </>
          );
        },
      }),
      ...(bank
        ? [
            column.accessor((row) => row.accountName ?? "", {
              id: "account",
              enableSorting: false,
              header: () => (
                <>
                  <i className="fas fa-user-tie mr-1" aria-hidden="true" />
                  {c("account")}
                </>
              ),
              cell: ({ row }) =>
                row.original.accountId && row.original.accountName ? (
                  <a
                    href={accountTransactionsPath(row.original.accountId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={ACCOUNT_LINK}
                    title={c("accountLink")}
                  >
                    <i className="fas fa-external-link-alt mr-1" aria-hidden="true" />
                    {row.original.accountName}
                  </a>
                ) : (
                  "—"
                ),
            }),
          ]
        : []),
      column.accessor((row) => row.description ?? "", {
        id: "description",
        enableSorting: false,
        header: () => (
          <>
            <i className="fas fa-comment mr-1" aria-hidden="true" />
            {c("description")}
          </>
        ),
        cell: ({ getValue }) => <span style={CELL_DESC}>{getValue() || "-"}</span>,
      }),
      column.display({
        id: "actions",
        enableSorting: false,
        header: c("action"),
        meta: { cellClassName: "text-center" },
        cell: ({ row }) => (
          <>
            <button
              type="button"
              className={`btn btn-sm ${bank ? "btn-outline-info" : "btn-outline-warning"}`}
              title={c("detail")}
              aria-label={c("detail")}
              onClick={() => setDetailId(row.original.id)}
            >
              <i className="fas fa-eye" aria-hidden="true" />
            </button>
            {canPost &&
              canEditPayment(row.original) &&
              row.original.sourceType === "SETTLEMENT" && (
                <a
                  className="btn btn-sm btn-outline-primary ml-1"
                  href={paymentsPath({ openEditPayment: true, paymentId: row.original.sourceId })}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={c("editPayment")}
                  aria-label={`${c("editPayment")} ${tc("common.a11y.opensInNewTab")}`}
                >
                  <i className="fas fa-edit" aria-hidden="true" />
                </a>
              )}
          </>
        ),
      }),
    ];
    return list;
  }, [t, tc, bank, page, size, branches, multiCompany, companyName, accountingLabel, canPost]);

  const update = (patch: Partial<TxFilters>, apply: boolean) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (apply) setApplied(next);
  };
  const typeLabel = (fund: { accountType: string | null }) =>
    t(`funds.common.accountTypes.${fund.accountType ?? "DEMAND"}`);
  const fundItems = fundOptions(funds.data ?? [], kind, draft.branchId, draft.fundId, typeLabel);
  const selectedFundData = applied.fundId ? selectedFund.data : undefined;

  /**
   * Modal ön değerleri (ZTO openPaymentModalFromBank / openCollectionModalFromBank): süzgeçteki banka /
   * kasa, onun iş yeri ve para birimi; fon yoksa süzgeçteki iş yeri ve URL para birimi.
   */
  const openSettlement = (request: SettlementModalRequest, fundId: string, branchId: string) => {
    const fund: Fund | undefined =
      (funds.data ?? []).find((x) => x.id === fundId) ??
      (selectedFund.data?.id === fundId ? selectedFund.data : undefined);
    setModal((previous) => ({
      ...request,
      open: true,
      seq: (previous?.seq ?? 0) + 1,
      fundId: fund?.id,
      branchId: fund?.branchId ?? (branchId || undefined),
      currency: fund?.currency ?? currency,
    }));
  };
  const openSettlementRef = useRef(openSettlement);
  openSettlementRef.current = openSettlement;
  const closeSettlement = () => setModal((previous) => previous && { ...previous, open: false });

  // Parametreler okunduktan sonra URL'den silinir (ZTO `history.replaceState`); fundId/branchId/currency
  // süzgeç değeri olarak kalır.
  useEffect(() => {
    if (!SETTLEMENT_MODAL_PARAMS.some((key) => params.has(key))) return;
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        SETTLEMENT_MODAL_PARAMS.forEach((key) => next.delete(key));
        return next;
      },
      { replace: true },
    );
    // Yalnız ilk çizim.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Ön seçili fon varsa fon listesi gelince açılır (iş yeri / para birimi fondan).
  const deepLinkDone = useRef(false);
  const fundsSettled = !initial.fundId || !funds.isPending;
  useEffect(() => {
    if (!deepLink || deepLinkDone.current || !fundsSettled) return;
    deepLinkDone.current = true;
    openSettlementRef.current(deepLink, initial.fundId, initial.branchId);
  }, [deepLink, fundsSettled, initial.fundId, initial.branchId]);

  const refresh = () => {
    setSpinning(true);
    setApplied({ ...draft });
    void transactions.refetch();
    clearTimeout(spinTimer.current);
    spinTimer.current = setTimeout(() => setSpinning(false), SPIN_MS);
  };
  const clear = () => {
    const reset = defaultFilters(kind, today, { companyId: activeCompany ?? "" });
    setDraft(reset);
    setApplied(reset);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const data = await exportFundTransactions({ ...query, summary: undefined }, activeCompany);
      if (data.length === 0) {
        setNotice({ variant: "warning", text: t("fundTransactions.csv.empty") });
        return;
      }
      const texts: CsvTexts = {
        headers: t(`fundTransactions.csv.${bank ? "headersBank" : "headersCash"}`).split(";"),
        companyHeader: t("fundTransactions.csv.company"),
        directionLabel: (direction) => tt(direction === "IN" ? "in" : "out"),
        accountingLabel,
        companyName,
      };
      const lines = await mapInChunks(data, (row, index) =>
        csvRow(kind, row, index, texts, multiCompany),
      );
      const blob = new Blob([csvContent([csvHeader(texts, multiCompany), ...lines])], {
        type: "text/csv;charset=utf-8;",
      });
      downloadBlob(blob, csvFileName(kind, today));
    } catch (error) {
      setNotice({
        variant: "danger",
        text:
          errorCode(error) === "RESULT_TOO_LARGE"
            ? t("fundTransactions.csv.tooLarge")
            : t("fundTransactions.csv.failed"),
      });
    } finally {
      setExporting(false);
    }
  };

  const h = (key: string) => t(`fundTransactions.header.${key}`);
  const f = (key: string) => t(`fundTransactions.filter.${key}`);
  const backPath = bank
    ? `${ZTO_FINANS_BASE}/${ZTO_SLUGS.banks}`
    : `${ZTO_FINANS_BASE}/${ZTO_SLUGS.accounts}`;
  const titleId = bank ? "bankTransactionsTitle" : "cashTransactionsTitle";
  const companyOptions = [
    { value: "", label: f("allCompanies") },
    ...activeCompanies(me?.companies).map((c) => ({ value: c.id, label: c.shortName })),
  ];

  return (
    <div className="container-fluid">
      <br />
      <div className="row">
        <div className="col-12">
          <div className="card" style={CARD}>
            <div className="card-header bg-white border-bottom" style={HEADER}>
              <div className="d-flex justify-content-between align-items-center flex-wrap">
                <div className="d-flex align-items-center flex-wrap" style={HEAD_GAP}>
                  <Link
                    to={backPath}
                    className="erp-btn erp-btn-secondary"
                    title={h(bank ? "backBank" : "backCash")}
                  >
                    <i className="fas fa-arrow-left" aria-hidden="true" />
                    <span className="d-none d-md-inline">{h("back")}</span>
                  </Link>
                  <div className="d-flex align-items-center">
                    <div className="erp-header-icon" style={ICON_STYLE[kind]} aria-hidden="true">
                      <i className={`fas ${bank ? "fa-university" : "fa-cash-register"}`} />
                    </div>
                    <div className="ml-3">
                      <h6 className="mb-0 text-dark" style={TITLE} id={titleId}>
                        {h(bank ? "titleBank" : "titleCash")}
                      </h6>
                      <div className="erp-breadcrumb mt-1">
                        <span>
                          <i className="fas fa-chart-line" aria-hidden="true" /> {h("finance")}
                        </span>
                        <span className="separator" aria-hidden="true">
                          ›
                        </span>
                        <span
                          className={`${bank ? "text-primary" : "text-warning"} font-weight-semibold`}
                          aria-current="page"
                        >
                          {h(bank ? "crumbBank" : "crumbCash")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div
                  className={`d-flex align-items-center${bank ? "" : " flex-wrap"}`}
                  style={ACTIONS_GAP}
                >
                  {canPost && (
                    <>
                      <button
                        type="button"
                        className="erp-btn erp-btn-success"
                        id="btnNewPayment"
                        title={h("newPaymentTitle")}
                        aria-haspopup="dialog"
                        onClick={() =>
                          openSettlement(
                            { type: "PAYMENT", method: kind },
                            draft.fundId,
                            draft.branchId,
                          )
                        }
                      >
                        <i className="fas fa-plus-circle" aria-hidden="true" />
                        <span className="d-none d-md-inline">{h("newPayment")}</span>
                        <span className="sr-only d-md-none">{h("newPayment")}</span>
                      </button>
                      <button
                        type="button"
                        className="erp-btn erp-btn-info"
                        id="btnNewCollection"
                        title={h("newCollectionTitle")}
                        aria-haspopup="dialog"
                        onClick={() =>
                          openSettlement(
                            { type: "COLLECTION", method: kind },
                            draft.fundId,
                            draft.branchId,
                          )
                        }
                      >
                        <i className="fas fa-hand-holding-usd" aria-hidden="true" />
                        <span className="d-none d-md-inline">{h("newCollection")}</span>
                        <span className="sr-only d-md-none">{h("newCollection")}</span>
                      </button>
                      <div className="btn-divider" />
                    </>
                  )}
                  {bank ? (
                    <Link
                      to={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.cashTransactions}`}
                      className="erp-btn erp-btn-success"
                      title={h("cashTransactions")}
                    >
                      <i className="fas fa-wallet" aria-hidden="true" />
                      <span className="d-none d-md-inline">{h("allCash")}</span>
                    </Link>
                  ) : (
                    <Link
                      to={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.bankTransactions}`}
                      className="erp-btn erp-btn-primary"
                      title={h("bankTransactions")}
                    >
                      <i className="fas fa-exchange-alt" aria-hidden="true" />
                      <span className="d-none d-md-inline">{h("allBank")}</span>
                    </Link>
                  )}
                  <div className="btn-divider" />
                  <Link
                    to={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.banks}`}
                    className="erp-btn erp-btn-info"
                    title={h("banks")}
                  >
                    <i className="fas fa-university" aria-hidden="true" />
                    <span className="d-none d-md-inline">{h("banks")}</span>
                  </Link>
                  <Link
                    to={`${ZTO_FINANS_BASE}/${ZTO_SLUGS.cashes}`}
                    className={bank ? "erp-btn erp-btn-info" : "erp-btn erp-btn-warning"}
                    title={h("cashes")}
                  >
                    <i className="fas fa-wallet" aria-hidden="true" />
                    <span className="d-none d-md-inline">{h("cashes")}</span>
                  </Link>
                  <div className="btn-divider" />
                  <button
                    type="button"
                    className="erp-btn erp-btn-warning"
                    title={h("activity")}
                    onClick={() => setActivity((n) => n + 1)}
                  >
                    <i
                      className={`fas ${bank ? "fa-chart-bar" : "fa-chart-line"}`}
                      aria-hidden="true"
                    />
                    <span className="d-none d-md-inline">{h("activity")}</span>
                  </button>
                  <button
                    type="button"
                    className={bank ? "erp-btn erp-btn-primary" : "erp-btn erp-btn-success"}
                    title={h("excelTitle")}
                    aria-busy={exporting}
                    disabled={exporting}
                    onClick={() => void exportCsv()}
                  >
                    <i className="fas fa-file-excel" aria-hidden="true" />
                    <span className="d-none d-md-inline">{h("excel")}</span>
                  </button>
                  <button
                    type="button"
                    className="erp-btn erp-btn-secondary"
                    title={h("print")}
                    aria-label={h("print")}
                    onClick={() => window.print()}
                  >
                    <i className="fas fa-print" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>

            <div className="card-body p-3">
              {notice && (
                <div
                  className={`alert alert-${notice.variant}`}
                  role={notice.variant === "danger" ? "alert" : "status"}
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
              {selectedFundData && (
                <SelectedFundSummary
                  kind={kind}
                  fund={selectedFundData}
                  workPlaceName={branches.get(selectedFundData.branchId)?.name ?? ""}
                  summary={transactions.data?.summary}
                  filteredCount={total}
                />
              )}

              <div className="erp-filter-card">
                <div className="row align-items-end">
                  {multiCompany && (
                    <div className="col-md-2 col-6 mb-2 mb-md-0">
                      <label className="filter-label" htmlFor="filterCompany">
                        <i className="fas fa-landmark" aria-hidden="true" /> {f("company")}
                      </label>
                      <ZtoSelect
                        id="filterCompany"
                        className="filter-field"
                        value={draft.companyId}
                        onChange={(value) =>
                          update({ companyId: value, branchId: "", fundId: "" }, true)
                        }
                        options={companyOptions}
                        placeholder={null}
                      />
                    </div>
                  )}
                  <div className="col-md-2 col-6 mb-2 mb-md-0">
                    <label className="filter-label" htmlFor="filterWorkPlace">
                      <i className="fas fa-building" aria-hidden="true" /> {f("workPlace")}
                    </label>
                    <ZtoBranchSelect
                      id="filterWorkPlace"
                      className="filter-field"
                      value={draft.branchId}
                      allowAll
                      placeholder={f("allWorkPlaces")}
                      companyId={multiCompany ? draft.companyId || null : undefined}
                      onChange={(value) => {
                        const keep = (funds.data ?? []).find((x) => x.id === draft.fundId);
                        update(
                          {
                            branchId: value,
                            fundId: keep && (!value || keep.branchId === value) ? draft.fundId : "",
                          },
                          true,
                        );
                      }}
                    />
                  </div>
                  <div className="col-md-2 col-6 mb-2 mb-md-0">
                    <label
                      className="filter-label"
                      id="filterFundLabel"
                      htmlFor={bank ? "filterBank" : "filterCash"}
                    >
                      <i
                        className={`fas ${bank ? "fa-university" : "fa-cash-register"}`}
                        aria-hidden="true"
                      />{" "}
                      {f(bank ? "bank" : "cash")}
                    </label>
                    <ZtoSearchableSelect
                      id={bank ? "filterBank" : "filterCash"}
                      ariaLabelledBy="filterFundLabel"
                      value={draft.fundId}
                      onChange={(value) => update({ fundId: value }, true)}
                      options={fundItems}
                      placeholder={f(bank ? "allBanks" : "allCashes")}
                      searchPlaceholder={f(bank ? "searchBank" : "searchCash")}
                      noResultsText={f(bank ? "noBank" : "noCash")}
                    />
                  </div>
                  <div className="col-md-1 col-6 mb-2 mb-md-0">
                    <label className="filter-label" htmlFor="filterTransactionType">
                      <i className="fas fa-exchange-alt" aria-hidden="true" /> {f("direction")}
                    </label>
                    <select
                      id="filterTransactionType"
                      className="filter-field"
                      value={draft.direction}
                      onChange={(event) =>
                        update({ direction: event.target.value as TxFilters["direction"] }, false)
                      }
                    >
                      {DIRECTIONS.map((direction) => (
                        <option key={direction || "all"} value={direction}>
                          {direction === ""
                            ? f("directionAll")
                            : f(
                                `direction${direction === "IN" ? "In" : "Out"}${bank ? "Bank" : "Cash"}`,
                              )}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-2 col-6 mb-2 mb-md-0">
                    <label className="filter-label" htmlFor="filterAccountingType">
                      <i
                        className={`fas ${bank ? "fa-file-invoice" : "fa-tag"}`}
                        aria-hidden="true"
                      />{" "}
                      {f("accounting")}
                    </label>
                    <select
                      id="filterAccountingType"
                      className="filter-field"
                      value={draft.accountingKey}
                      onChange={(event) => update({ accountingKey: event.target.value }, false)}
                    >
                      {ACCOUNTING_TYPES[kind].map((option) => (
                        <option key={option.key} value={option.key}>
                          {t(`fundTransactions.accountingTypes.${option.key}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-2 col-6 mb-2 mb-md-0">
                    <label className="filter-label" htmlFor="filterStartDate">
                      <i className="fas fa-calendar" aria-hidden="true" /> {f("start")}
                    </label>
                    <input
                      type="date"
                      id="filterStartDate"
                      className="filter-field"
                      value={draft.from}
                      onChange={(event) => update({ from: event.target.value }, false)}
                    />
                  </div>
                  <div className="col-md-2 col-6 mb-2 mb-md-0">
                    <label className="filter-label" htmlFor="filterEndDate">
                      <i className="fas fa-calendar" aria-hidden="true" />{" "}
                      {f(bank ? "endBank" : "endCash")}
                    </label>
                    <input
                      type="date"
                      id="filterEndDate"
                      className="filter-field"
                      value={draft.to}
                      onChange={(event) => update({ to: event.target.value }, false)}
                    />
                  </div>
                  <div className="col-md-1 col-6">
                    <div className="filter-actions">
                      <button
                        type="button"
                        className="filter-btn btn-filter-apply"
                        title={f("apply")}
                        aria-label={f("apply")}
                        onClick={() => setApplied({ ...draft })}
                      >
                        <i className="fas fa-filter" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="filter-btn btn-filter-clear"
                        title={f("clear")}
                        aria-label={f("clear")}
                        onClick={clear}
                      >
                        <i className="fas fa-times" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="filter-btn btn-filter-refresh"
                        title={f("refresh")}
                        aria-label={f("refresh")}
                        onClick={refresh}
                      >
                        <i
                          className={`fas fa-sync-alt${spinning ? " is-spinning" : ""}`}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {transactions.isError && (
                <div className="alert alert-danger" role="alert">
                  {tt("loadFailed", { message: errorMessage(transactions.error, "") })}
                </div>
              )}
              <div className="sr-only" role="status">
                {transactions.isSuccess ? tt("resultCount", { count: total }) : ""}
              </div>
              <div
                className="table-responsive"
                role="region"
                aria-labelledby={titleId}
                tabIndex={0}
              >
                <ZtoDataTable
                  id="transactionsTable"
                  columns={columns}
                  data={rows}
                  getRowId={(row) => row.id}
                  tableClassName="table table-compact table-hover"
                  tableStyle={{ width: "100%" }}
                  dom={TABLE_DOM}
                  pageLength={PAGE_LENGTH[kind]}
                  lengthMenu={LENGTH_MENU}
                  order={[{ id: "date", desc: true }]}
                  manualPagination
                  recordsTotal={total}
                  processing={transactions.isFetching}
                  onStateChange={setTable}
                  emptyText={transactions.isPending ? tt("loading") : tt("empty")}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <FundTransactionDetailModal
        kind={kind}
        transactionId={detailId}
        onHide={() => setDetailId(null)}
        multiCompany={multiCompany}
        companyName={companyName}
      />
      {canPost && modal && (
        <>
          <PaymentModal
            key={`payment-${modal.seq}`}
            show={modal.open && modal.type === "PAYMENT"}
            onHide={closeSettlement}
            mode="add"
            presetFundAccountId={modal.type === "PAYMENT" ? modal.fundId : undefined}
            presetBranchId={modal.branchId}
            presetCurrency={modal.currency}
            presetMethod={modal.method}
          />
          <CollectionModal
            key={`collection-${modal.seq}`}
            show={modal.open && modal.type === "COLLECTION"}
            onHide={closeSettlement}
            mode="add"
            presetFundAccountId={modal.type === "COLLECTION" ? modal.fundId : undefined}
            presetBranchId={modal.branchId}
            presetCurrency={modal.currency}
            presetMethod={modal.method}
          />
        </>
      )}
      {activity > 0 && (
        <ActivityReportModal
          key={activity}
          kind={kind}
          show
          onHide={() => setActivity(0)}
          funds={(funds.data ?? []).filter((fund) => fund.kind === kind)}
          initialFundId={applied.fundId}
        />
      )}
    </div>
  );
}
