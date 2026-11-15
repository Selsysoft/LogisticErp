import { createColumnHelper } from "@tanstack/react-table";
import {
  CSSProperties,
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../../../auth/authStore";
import { activeCompanies, useActiveCompanyId } from "../../../../auth/companyStore";
import { useAccountGroups, useAccountList } from "../../../../pages/finance/accountApi";
import { useCan, useCompanyName, useMultiCompany } from "../../../../pages/finance/common";
import {
  SETTLEMENT_EXPORT_MAX_PAGES,
  SETTLEMENT_EXPORT_PAGE_SIZE,
  fetchAllSettlements,
  useSettlementList,
} from "../../../../pages/finance/settlementApi";
import type {
  PayMethod,
  SettlementListItem,
  SettlementType,
} from "../../../../pages/finance/types";
import { useBranchTree } from "../../../branch/branchTree";
import {
  ZtoBranchSelect,
  ZtoDataTable,
  ZtoSearchableSelect,
  ZtoSelect,
  formatDate,
  type DataTableState,
} from "../../../components";
import { exportExcel } from "../../../export";
import {
  ZTO_FINANS_BASE,
  ZTO_SLUGS,
  accountTransactionsPath,
  fundTransactionsPath,
  paymentsPath,
  transferCenterPath,
} from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { PhaseButton } from "../accounts/AccountsMenu";
import { todayIso } from "../fundTransactions/fundTransactionsLogic";
import { CollectionModal, PaymentModal } from "../settlementModals";
import { DailyReportModal } from "./DailyReportModal";
import { ReverseSettlementModal } from "./ReverseSettlementModal";
import { SettlementDetailModal } from "./SettlementDetailModal";
import { MethodBadge } from "./settlementCells";
import { parseSettlementDeepLink, remainingSearch } from "./settlementDeepLink";
import {
  LENGTH_MENU,
  MAX_SORTS,
  METHOD_OPTIONS,
  PAGE_LENGTH,
  TABLE_DOM,
  accountOptions,
  accountingCell,
  amountText,
  canDelete,
  canEdit,
  canShowDetail,
  defaultFilters,
  exportRow,
  fxCell,
  groupValue,
  isSubmitEnter,
  listParams,
  rateText,
  sourceCell,
  workPlaceGroups,
  type SettlementFilters,
} from "./settlementListLogic";

const column = createColumnHelper<SettlementListItem>();
const CARD_HEADER: CSSProperties = { padding: "10px 20px" };
const LEFT_GAP: CSSProperties = { gap: 12 };
const RIGHT_GAP: CSSProperties = { gap: 6 };
const CHIPS: CSSProperties = { gap: 8, marginLeft: 15 };
const TITLE: CSSProperties = { fontSize: 14, fontWeight: 600 };
const BACK: CSSProperties = { marginRight: 8 };
const ACCOUNT_LINK: CSSProperties = { display: "block", color: "#007bff", textDecoration: "none" };
const ACCOUNT_NAME: CSSProperties = { color: "#007bff" };
const ACCOUNT_CODE: CSSProperties = { color: "#007bff", opacity: 0.85 };
const EXTERNAL_ICON: CSSProperties = { fontSize: 10 };
const PAY_AMOUNT: CSSProperties = { whiteSpace: "nowrap", display: "block", textAlign: "right" };
const COL_AMOUNT: CSSProperties = { textAlign: "right", verticalAlign: "middle" };
const COL_AMOUNT_STACK: CSSProperties = { alignItems: "flex-end" };
const RATE_LINE: CSSProperties = { fontSize: 11 };
const RATE_ICON: CSSProperties = { fontSize: 9 };
const ACCOUNTING_BADGE: CSSProperties = { fontSize: 11 };
const CASH_SOURCE: CSSProperties = { color: "#ea7a00", fontWeight: 600 };
const BANK_SOURCE: CSSProperties = { color: "#007bff", fontWeight: 600 };
const FX_BOX: CSSProperties = { minWidth: 130 };
const FX_TRACK: CSSProperties = { height: 6, backgroundColor: "rgba(23, 162, 184, 0.18)" };
const FX_BUTTON: CSSProperties = { lineHeight: 1 };
const FX_BUTTON_ICON: CSSProperties = { fontSize: 10 };
const DATE_110: CSSProperties = { width: 110 };
const NOTICE: CSSProperties = {
  position: "fixed",
  top: 70,
  right: 20,
  zIndex: 99999,
  minWidth: 300,
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
};

type Notice = { variant: "success" | "danger" | "warning"; text: string } | null;

type ModalState = {
  show: boolean;
  mode: "add" | "edit";
  settlementId?: string;
  presetAccountId?: string;
  presetBranchId?: string;
  presetFundAccountId?: string;
  presetMethod?: PayMethod;
  presetCurrency?: string;
};

const CLOSED: ModalState = { show: false, mode: "add" };

/**
 * Ödemeler (ZTO Views/CustomerAccountPayment/Payments.cshtml + payments.js liste bölümü) ve Tahsilatlar
 * (Views/CustomerAccountCollection/Collections.cshtml + collections.js) — 12.2a_TASARIM §5.5, §5.6.
 * İki sayfa aynı iskeleti paylaşır; farklar (başlık, süzgeç düzeni ve etiketleri, Hesap Grubu, sütunlar,
 * "Kur:" satırı, Döviz Bozum, Düzenle/Sil kuralları) `type` ile seçilir. Liste sunucu sayfalıdır
 * (`page`/`size` açık, 10/25/50/100; "Tümü" yok — Rev 1 F10).
 */
export function SettlementListPage({ type }: { type: SettlementType }) {
  const payment = type === "PAYMENT";
  useZtoRootClass(payment ? "zto-page-payments" : "zto-page-collections");
  const { t } = useTranslation("ztoFinans");
  const { t: tc } = useTranslation();
  const ns = payment ? "payments" : "collections";
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const multiCompany = useMultiCompany();
  const activeCompany = useActiveCompanyId();
  const companyName = useCompanyName();
  const canPost = useCan("FINANCE_PAYMENT_CREATE");
  const me = useAuthStore((state) => state.me);
  const today = todayIso();

  // Açılış parametreleri yalnız ilk çizimde okunur (ZTO handleUrlParameters + replaceState).
  const [link] = useState(() => parseSettlementDeepLink(type, params));
  const initial = useMemo(
    () => ({ ...defaultFilters(today, activeCompany ?? ""), accountId: link.accountId ?? "" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [draft, setDraft] = useState<SettlementFilters>(initial);
  const [applied, setApplied] = useState<SettlementFilters>(initial);
  const [table, setTable] = useState<DataTableState | null>(null);
  const [detailId, setDetailId] = useState<string | null>(link.settlementId ?? null);
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [daily, setDaily] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [exporting, setExporting] = useState(false);
  const [modal, setModal] = useState<ModalState>(() => {
    if (!canPost || (!link.openAdd && !link.editId)) return CLOSED;
    return {
      show: true,
      mode: link.editId ? "edit" : "add",
      settlementId: link.editId,
      presetAccountId: link.accountId,
      presetBranchId: link.branchId,
      presetFundAccountId: link.fundAccountId,
      presetMethod: link.method,
      presetCurrency: link.currency,
    };
  });

  useEffect(() => {
    const rest = remainingSearch(type, params);
    if (rest !== null) navigate({ search: rest ? `?${rest}` : "" }, { replace: true });
    // Yalnız ilk çizimde.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bildirim 3 sn (başarı) / 5 sn (hata) sonra kapanır (ZTO hatası (d) düzeltmesi).
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

  const query = useMemo(
    () => listParams(applied, table, multiCompany),
    [applied, table, multiCompany],
  );
  const list = useSettlementList(type, query);
  const rows = list.data?.content ?? [];
  const total = list.data?.totalElements ?? 0;

  const accounts = useAccountList({});
  const accountItems = useMemo(() => accountOptions(accounts.data ?? []), [accounts.data]);
  const groups = useAccountGroups();
  const tree = useBranchTree();
  const companyFilter = multiCompany ? draft.companyId || null : (activeCompany ?? null);
  const workPlaceItems = useMemo(
    () => workPlaceGroups(tree.data, companyFilter),
    [tree.data, companyFilter],
  );

  const methodLabel = useCallback((method: PayMethod) => t(`payments.list.method.${method}`), [t]);
  const accountingLabel = useCallback(
    (cell: ReturnType<typeof accountingCell>) =>
      cell.key === "intercompany"
        ? t("payments.list.table.intercompany")
        : t(`${ns}.accounting.${cell.key}`),
    [t, ns],
  );

  const columns = useMemo(() => {
    const c = (key: string) => t(`payments.list.table.${key}`);
    const masked = tc("common.a11y.maskedEmployee");
    const newTab = tc("common.a11y.opensInNewTab");
    const list = [
      column.accessor("settlementDate", {
        id: "date",
        header: c("date"),
        cell: ({ getValue }) => formatDate(getValue()),
      }),
      column.accessor("branchName", {
        id: "workPlace",
        header: c("workPlace"),
        cell: ({ row }) =>
          payment ? (
            <>
              <div className="font-weight-bold">{row.original.branchName || "-"}</div>
              <small className="text-muted">{row.original.branchGroupName || "-"}</small>
            </>
          ) : (
            row.original.branchName || "-"
          ),
      }),
      ...(multiCompany
        ? [
            column.accessor((row) => companyName(row.companyId), {
              id: "company",
              header: c("company"),
              enableSorting: false,
            }),
          ]
        : []),
      column.accessor((row) => row.accountName ?? "", {
        id: "account",
        header: c("account"),
        cell: ({ row }) => {
          const r = row.original;
          if (r.employeeMasked) return masked;
          if (!r.accountId) {
            return (
              <>
                <div className="font-weight-bold">{r.accountName ?? ""}</div>
                <small className="text-muted">{r.accountCode ?? ""}</small>
              </>
            );
          }
          return (
            <a
              href={accountTransactionsPath(r.accountId)}
              className="account-transaction-link"
              target="_blank"
              rel="noopener noreferrer"
              style={ACCOUNT_LINK}
              title={c("accountLink")}
            >
              <div className="font-weight-bold" style={ACCOUNT_NAME}>
                {r.accountName}{" "}
                <i className="fas fa-external-link-alt" style={EXTERNAL_ICON} aria-hidden="true" />
              </div>
              <small style={ACCOUNT_CODE}>{r.accountCode}</small>
              <span className="sr-only">{newTab}</span>
            </a>
          );
        },
      }),
      column.accessor((row) => row.documentNo ?? "", {
        id: "documentNo",
        header: c("documentNo"),
        cell: ({ getValue }) => getValue() || "-",
      }),
      column.accessor((row) => row.money.amount, {
        id: "amount",
        header: c("amount"),
        cell: ({ row }) =>
          payment ? (
            <span
              className="font-weight-bold text-danger payment-amount-cell text-nowrap"
              style={PAY_AMOUNT}
            >
              {amountText(row.original.money)}
            </span>
          ) : (
            <div style={COL_AMOUNT}>
              <div className="d-flex flex-column" style={COL_AMOUNT_STACK}>
                <div className="font-weight-bold text-success">
                  {amountText(row.original.money)}
                </div>
                <small className="text-muted" style={RATE_LINE}>
                  <i className="fas fa-exchange-alt mr-1" style={RATE_ICON} aria-hidden="true" />{" "}
                  {t("collections.fx.rate", { rate: rateText(row.original.exchangeRate) })}
                </small>
              </div>
            </div>
          ),
      }),
      column.display({
        id: "method",
        header: t(`${ns}.table.method`),
        enableSorting: false,
        cell: ({ row }) => <MethodBadge row={row.original} />,
      }),
      column.display({
        id: "accounting",
        header: c("accounting"),
        enableSorting: false,
        cell: ({ row }) => {
          const cell = accountingCell(row.original);
          return (
            <>
              <span className={`badge ${cell.className}`} style={ACCOUNTING_BADGE}>
                <i className={`fas ${cell.icon} mr-1`} aria-hidden="true" />
                {accountingLabel(cell)}
              </span>
              {cell.plan && (
                <div>
                  <small className="text-muted">{c("plan")}</small>
                </div>
              )}
            </>
          );
        },
      }),
      column.display({
        id: "source",
        header: c("source"),
        enableSorting: false,
        cell: ({ row }) => {
          const source = sourceCell(row.original);
          if (!source) return "-";
          const cash = source.kind === "CASH";
          const content = (
            <>
              <i
                className={`fas ${cash ? "fa-cash-register" : "fa-university"} mr-1`}
                aria-hidden="true"
              />
              {payment ? "" : " "}
              {source.text}
            </>
          );
          return payment ? (
            <span style={cash ? CASH_SOURCE : BANK_SOURCE}>{content}</span>
          ) : (
            <a
              href={fundTransactionsPath(source.kind, { fundId: source.fundAccountId })}
              target="_blank"
              rel="noopener noreferrer"
              title={c(cash ? "cashLink" : "bankLink")}
              style={cash ? CASH_SOURCE : BANK_SOURCE}
            >
              {content}
              <span className="sr-only">{newTab}</span>
            </a>
          );
        },
      }),
      column.accessor((row) => row.description ?? "", {
        id: "description",
        header: c("description"),
        enableSorting: false,
        cell: ({ getValue }) => (
          <div className="desc-clamp" title={getValue()}>
            {getValue() || "-"}
          </div>
        ),
      }),
      ...(payment
        ? []
        : [
            column.display({
              id: "fx",
              header: t("collections.table.fx"),
              enableSorting: false,
              cell: ({ row }) => <FxCellView row={row.original} />,
            }),
          ]),
      column.display({
        id: "actions",
        header: c("action"),
        enableSorting: false,
        meta: { exportable: false },
        cell: ({ row }) => {
          const r = row.original;
          const prefix = payment ? "btn-payment" : "btn-collection";
          const edit = canPost && canEdit(type, r);
          const remove = canPost && canDelete(type, r);
          const buttons = (
            <>
              {canShowDetail(r) && (
                <button
                  type="button"
                  className={`btn btn-sm btn-info mr-1 ${prefix}-detail`}
                  title={c("detail")}
                  aria-label={c("detail")}
                  onClick={() => setDetailId(r.id)}
                >
                  <i className="fas fa-eye" aria-hidden="true" />
                </button>
              )}
              {edit && (
                <button
                  type="button"
                  className={`btn btn-sm btn-warning ${prefix}-edit${payment ? " mr-1" : ""}`}
                  title={c("edit")}
                  aria-label={c("edit")}
                  onClick={() => setModal({ show: true, mode: "edit", settlementId: r.id })}
                >
                  <i className="fas fa-edit" aria-hidden="true" />
                </button>
              )}
              {remove && (
                <button
                  type="button"
                  className={`btn btn-sm btn-danger ${prefix}-delete`}
                  title={c("delete")}
                  aria-label={c("delete")}
                  onClick={() => setReverseId(r.id)}
                >
                  <i className="fas fa-trash" aria-hidden="true" />
                </button>
              )}
            </>
          );
          return <div className={payment ? "btn-group" : "btn btn-sm btn-group"}>{buttons}</div>;
        },
      }),
    ];
    return list;
  }, [t, tc, ns, payment, multiCompany, companyName, accountingLabel, canPost, type]);

  const update = (patch: Partial<SettlementFilters>) => setDraft((d) => ({ ...d, ...patch }));
  const apply = () => setApplied({ ...draft });
  const clear = () => {
    const reset = defaultFilters(today, activeCompany ?? "");
    setDraft(reset);
    setApplied(reset);
  };
  const onFieldKey = (event: KeyboardEvent<HTMLElement>) => {
    if (isSubmitEnter(event.nativeEvent)) {
      event.preventDefault();
      apply();
    }
  };

  const exportList = async () => {
    setExporting(true);
    try {
      const { page: _page, size: _size, ...rest } = query;
      void _page;
      void _size;
      const data = await fetchAllSettlements(type, rest, activeCompany);
      const headers = [
        t("payments.list.table.date"),
        t("payments.list.table.workPlace"),
        ...(multiCompany ? [t("payments.list.table.company")] : []),
        t("payments.list.table.account"),
        t("payments.list.table.documentNo"),
        t("payments.list.table.amount"),
        t(`${ns}.table.method`),
        t("payments.list.table.accounting"),
        t("payments.list.table.source"),
        t("payments.list.table.description"),
        ...(payment ? [] : [t("collections.table.fx")]),
      ];
      const texts = {
        headers,
        method: methodLabel,
        accounting: accountingLabel,
        masked: tc("common.a11y.maskedEmployee"),
        companyName: multiCompany ? (id: string) => companyName(id) : undefined,
      };
      await exportExcel({
        title: t(`${ns}.header.crumb`),
        headers,
        rows: data.content.map((row) => exportRow(type, row, texts, formatDate)),
        fileName: `${t(`${ns}.excelFile`)}_${today}`,
      });
      if (data.truncated) {
        setNotice({
          variant: "warning",
          text: t("payments.list.excelTruncated", {
            count: SETTLEMENT_EXPORT_PAGE_SIZE * SETTLEMENT_EXPORT_MAX_PAGES,
            total: data.totalElements,
          }),
        });
      }
    } catch {
      setNotice({ variant: "danger", text: t("payments.list.excelFailed") });
    } finally {
      setExporting(false);
    }
  };

  const h = (key: string) => t(`${ns}.header.${key}`);
  const fl = (key: string) => t(`payments.list.filter.${key}`);
  const f = (key: string) => t(`${ns}.filter.${key}`);
  const titleId = payment ? "paymentsTitle" : "collectionsTitle";
  const companyOptions = [
    { value: "", label: fl("allCompanies") },
    ...activeCompanies(me?.companies).map((co) => ({ value: co.id, label: co.shortName })),
  ];
  const groupOptions = (groups.data ?? [])
    .filter((g) => g.selectable)
    .map((g) => ({ value: groupValue(g.accountType, g.code), label: g.name }));
  const rowCol = payment ? "col-xl-2 col-lg-2 col-md-2 col-sm-6" : "col-md-2 col-sm-6";
  const dateCol = payment ? rowCol : "col-md-1 col-sm-6";
  const pageTable = (
    <ZtoDataTable
      id={payment ? "paymentsTable" : "collectionsTable"}
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      tableClassName={`table table-compact table-bordered table-striped table-hover${
        payment ? " pym-phone-card-table" : ""
      }`}
      dom={TABLE_DOM}
      pageLength={PAGE_LENGTH}
      lengthMenu={LENGTH_MENU}
      maxMultiSortColCount={MAX_SORTS}
      order={[{ id: "date", desc: true }]}
      manualPagination
      recordsTotal={total}
      processing={list.isFetching}
      onStateChange={setTable}
      cellDataLabel
      emptyText={
        list.isPending ? (
          <span className="text-muted">
            <i className="fas fa-spinner fa-spin mr-2" aria-hidden="true" />
            {t("payments.list.table.loading")}
          </span>
        ) : list.isError ? (
          <span className="text-danger">
            <i className="fas fa-exclamation-triangle" aria-hidden="true" />{" "}
            {t("payments.list.table.loadFailed")}
          </span>
        ) : (
          <span className="text-muted">
            <i className="fas fa-inbox fa-2x mb-2" aria-hidden="true" />
            <p className="mb-0">{t("payments.list.table.empty")}</p>
          </span>
        )
      }
    />
  );

  const accountFilter = (
    <div className={rowCol}>
      <label className="filter-label" id="filterAccountLabel" htmlFor="filterAccount">
        <i className="fas fa-building" aria-hidden="true" /> {f("account")}
      </label>
      <ZtoSearchableSelect
        id="filterAccount"
        className="filter-field"
        ariaLabelledBy="filterAccountLabel"
        value={draft.accountId}
        onChange={(value) => update({ accountId: value })}
        options={accountItems}
        placeholder={fl("allAccounts")}
        searchPlaceholder={fl("searchAccount")}
        noResultsText={fl("noAccount")}
      />
    </div>
  );
  const workPlaceFilter = (
    <div className={rowCol}>
      <label className="filter-label" id="filterWorkPlaceLabel" htmlFor="filterWorkPlace">
        <i className="fas fa-industry" aria-hidden="true" /> {f("workPlace")}
      </label>
      {payment ? (
        <ZtoBranchSelect
          id="filterWorkPlace"
          className="filter-field no-select2"
          value={draft.branchId}
          allowAll
          companyId={multiCompany ? draft.companyId || null : undefined}
          onChange={(value) => update({ branchId: value })}
        />
      ) : (
        <ZtoSearchableSelect
          id="filterWorkPlace"
          className="filter-field"
          ariaLabelledBy="filterWorkPlaceLabel"
          value={draft.branchId}
          onChange={(value) => update({ branchId: value })}
          options={workPlaceItems}
          placeholder={fl("allWorkPlaces")}
          searchPlaceholder={fl("searchWorkPlace")}
          noResultsText={fl("noWorkPlace")}
        />
      )}
    </div>
  );
  const dateFilters = (
    <>
      <div className={dateCol}>
        <label className="filter-label" htmlFor="filterDateStart">
          <i className="fas fa-calendar-day" aria-hidden="true" /> {f("start")}
        </label>
        <input
          type="date"
          id="filterDateStart"
          className="filter-field"
          style={payment ? undefined : DATE_110}
          value={draft.from}
          onChange={(event) => update({ from: event.target.value })}
          onKeyDown={onFieldKey}
        />
      </div>
      <div className={dateCol}>
        <label className="filter-label" htmlFor="filterDateEnd">
          <i className="fas fa-calendar-day" aria-hidden="true" /> {f("end")}
        </label>
        <input
          type="date"
          id="filterDateEnd"
          className="filter-field"
          style={payment ? undefined : DATE_110}
          value={draft.to}
          onChange={(event) => update({ to: event.target.value })}
          onKeyDown={onFieldKey}
        />
      </div>
    </>
  );
  const methodFilter = (
    <div className={rowCol}>
      <label className="filter-label" htmlFor="filterMethod">
        <i className="fas fa-credit-card" aria-hidden="true" /> {f("method")}
      </label>
      <select
        id="filterMethod"
        className="filter-field"
        value={draft.method}
        onChange={(event) => update({ method: event.target.value as PayMethod | "" })}
        onKeyDown={onFieldKey}
      >
        <option value="">{f("allMethods")}</option>
        {METHOD_OPTIONS.map((method) => (
          <option key={method} value={method}>
            {t(`payments.list.method.${method === "BANK" ? "BANK_OPTION" : method}`)}
          </option>
        ))}
      </select>
    </div>
  );
  const actionButtons = (
    <>
      <button type="button" className="filter-btn btn-filter-apply" onClick={apply}>
        <i className="fas fa-filter" aria-hidden="true" /> {fl("apply")}
      </button>
      <button type="button" className="filter-btn btn-filter-clear" onClick={clear}>
        <i className="fas fa-times" aria-hidden="true" /> {fl("clear")}
      </button>
    </>
  );

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
                      <i className={`fas ${payment ? "fa-money-bill-wave" : "fa-money-check"}`} />
                    </div>
                    <div className="ml-3">
                      <h6 className="mb-0 text-dark" style={TITLE} id={titleId}>
                        {h("title")}
                      </h6>
                      <div className="erp-breadcrumb mt-1">
                        <span>
                          <i className="fas fa-chart-line" aria-hidden="true" /> {h("finance")}
                        </span>
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
                      <span>{h("chipMethods")}</span>
                    </div>
                    <div className="erp-info-chip chip-primary">
                      <i className="fas fa-filter" aria-hidden="true" />
                      <span>{h("chipFilter")}</span>
                    </div>
                  </div>
                </div>
                <div className="d-flex align-items-center" style={RIGHT_GAP}>
                  {canPost && (
                    <>
                      <button
                        type="button"
                        className="erp-btn erp-btn-success"
                        onClick={() => setModal({ show: true, mode: "add" })}
                      >
                        <i className="fas fa-plus" aria-hidden="true" />
                        <span className="d-none d-md-inline">{h("newItem")}</span>
                        <span className="sr-only d-md-none">{h("newItem")}</span>
                      </button>
                      <div className="btn-divider" />
                    </>
                  )}
                  {!payment && (
                    <Link
                      to={paymentsPath()}
                      className="erp-btn erp-btn-info"
                      title={h("paymentsTitle")}
                    >
                      <i className="fas fa-cash-register" aria-hidden="true" />
                      <span className="d-none d-md-inline">{h("payments")}</span>
                    </Link>
                  )}
                  <PhaseButton
                    step="12.3"
                    className="erp-btn erp-btn-info"
                    title={h("checksTitle")}
                  >
                    <i className="fas fa-money-check" aria-hidden="true" />
                    <span className="d-none d-md-inline">{h("checks")}</span>
                  </PhaseButton>
                  <PhaseButton
                    step="12.3"
                    className="erp-btn erp-btn-warning"
                    title={h("notesTitle")}
                  >
                    <i className="fas fa-file-invoice-dollar" aria-hidden="true" />
                    <span className="d-none d-md-inline">{h("notes")}</span>
                  </PhaseButton>
                  <div className="btn-divider" />
                  <button
                    type="button"
                    className="erp-btn erp-btn-info"
                    title={h("daily")}
                    onClick={() => setDaily(true)}
                  >
                    <i className="fas fa-chart-line" aria-hidden="true" />
                    <span className="d-none d-md-inline">{h("daily")}</span>
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
                    className="erp-btn erp-btn-primary"
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
                <div className={payment ? "row align-items-end" : "row"}>
                  {multiCompany && (
                    <div className={rowCol}>
                      <label className="filter-label" htmlFor="filterCompany">
                        <i className="fas fa-landmark" aria-hidden="true" /> {fl("company")}
                      </label>
                      <ZtoSelect
                        id="filterCompany"
                        className="filter-field no-select2"
                        value={draft.companyId}
                        onChange={(value) => update({ companyId: value, branchId: "" })}
                        options={companyOptions}
                        placeholder={null}
                      />
                    </div>
                  )}
                  {accountFilter}
                  {!payment && (
                    <div className="col-md-2 col-sm-6">
                      <label className="filter-label" htmlFor="accountGroupFilter">
                        <i className="fas fa-layer-group" aria-hidden="true" /> {f("group")}
                      </label>
                      <select
                        id="accountGroupFilter"
                        className="filter-field"
                        value={draft.group}
                        onChange={(event) => update({ group: event.target.value })}
                        onKeyDown={onFieldKey}
                      >
                        <option value="">{f("allGroups")}</option>
                        {groupOptions.map((g) => (
                          <option key={g.value} value={g.value}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {workPlaceFilter}
                  {dateFilters}
                  {methodFilter}
                  {payment ? (
                    <div className="col-xl-2 col-lg-2 col-md-2 col-sm-12">
                      <div className="d-flex align-items-end justify-content-end">
                        <div className="filter-actions filter-actions-nowrap">{actionButtons}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="col-md-1 col-sm-12">
                      <div className="filter-actions">{actionButtons}</div>
                    </div>
                  )}
                </div>
              </div>

              <div className="sr-only" role="status">
                {list.isSuccess ? t("payments.list.table.resultCount", { count: total }) : ""}
              </div>
              <div
                className="table-responsive mt-3"
                role="region"
                aria-labelledby={titleId}
                tabIndex={0}
              >
                {pageTable}
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

      <SettlementDetailModal settlementId={detailId} type={type} onHide={() => setDetailId(null)} />
      <ReverseSettlementModal
        settlementId={reverseId}
        type={type}
        onHide={() => setReverseId(null)}
        onDone={(text) => setNotice({ variant: "success", text })}
      />
      <DailyReportModal type={type} show={daily} onHide={() => setDaily(false)} />
      {payment ? (
        <PaymentModal
          show={modal.show}
          onHide={() => setModal((m) => ({ ...m, show: false }))}
          mode={modal.mode}
          settlementId={modal.settlementId}
          presetAccountId={modal.presetAccountId}
          presetBranchId={modal.presetBranchId}
          presetFundAccountId={modal.presetFundAccountId}
          presetMethod={modal.presetMethod}
          presetCurrency={modal.presetCurrency}
        />
      ) : (
        <CollectionModal
          show={modal.show}
          onHide={() => setModal((m) => ({ ...m, show: false }))}
          mode={modal.mode}
          settlementId={modal.settlementId}
          presetAccountId={modal.presetAccountId}
          presetBranchId={modal.presetBranchId}
          presetFundAccountId={modal.presetFundAccountId}
          presetMethod={modal.presetMethod}
          presetCurrency={modal.presetCurrency}
        />
      )}
    </div>
  );
}

/** Döviz Bozum hücresi (cjs:3635-3758; Rev 1 F7). */
function FxCellView({ row }: { row: SettlementListItem }) {
  const { t } = useTranslation("ztoFinans");
  const { t: tc } = useTranslation();
  const cell = fxCell(row);
  const x = (key: string) => t(`collections.fx.${key}`);
  if (cell.kind === "notFx") {
    return <span className="badge badge-secondary">{x("notFx")}</span>;
  }
  const badge = x(
    cell.status === "WAITING" ? "waiting" : cell.status === "DONE" ? "done" : "partial",
  );
  const newTab = tc("common.a11y.opensInNewTab");
  return (
    <div className="d-flex flex-column" style={FX_BOX}>
      <div className="d-flex align-items-center mb-1">
        <span className={`badge ${cell.badgeClass}`} title={badge}>
          {badge}
        </span>
        {cell.showTransfers && (
          <a
            href={transferCenterPath({ tab: "transfers" })}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2"
            title={x("transfers")}
          >
            <i className="fas fa-external-link-alt text-success" aria-hidden="true" />
            <span className="sr-only">
              {x("transfers")} {newTab}
            </span>
          </a>
        )}
        {cell.showExchange && (
          <a
            className="btn btn-xs btn-outline-info ml-1 px-1 py-0"
            style={FX_BUTTON}
            href={transferCenterPath({ tab: "new", transferType: "exchange" })}
            target="_blank"
            rel="noopener noreferrer"
            title={x("exchange")}
          >
            <i className="fas fa-exchange-alt" style={FX_BUTTON_ICON} aria-hidden="true" />
            <span className="sr-only">
              {x("exchange")} {newTab}
            </span>
          </a>
        )}
      </div>
      <div className="progress" style={FX_TRACK}>
        <div
          className={`progress-bar ${cell.barClass}`}
          role="progressbar"
          style={{ width: `${cell.width}%` }}
          aria-valuenow={Number(cell.width)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={tc("common.a11y.fxProgress")}
        />
      </div>
      <small className="text-muted mt-1">{cell.info}</small>
    </div>
  );
}
