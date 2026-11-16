import { createColumnHelper } from "@tanstack/react-table";
import { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "../../../../auth/authStore";
import { activeCompanies } from "../../../../auth/companyStore";
import { useAccountList } from "../../../../pages/finance/accountApi";
import { useCan, useMultiCompany } from "../../../../pages/finance/common";
import { useInstrumentList } from "../../../../pages/finance/instrumentApi";
import type { InstrumentListItem, NoteType } from "../../../../pages/finance/types";
import {
  ZtoDataTable,
  ZtoSearchableSelect,
  ZtoSelect,
  formatDate,
  formatN2,
  formatMoneyValue,
} from "../../../components";
import { exportExcel } from "../../../export";
import { ZTO_FINANS_BASE, ZTO_SLUGS, billEditPath, checksPath, paymentsPath } from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { MenuDivider, MenuItem, ZtoMenuButton } from "../accounts/AccountsMenu";
import { todayIso } from "../fundTransactions/fundTransactionsLogic";
import { PaymentModal } from "../settlementModals";
import { ReverseSettlementModal } from "../settlements/ReverseSettlementModal";
import { accountOptions } from "../settlements/settlementListLogic";
import { BillDetailModal } from "./BillDetailModal";
import { BillStatusModal } from "./BillStatusModal";
import {
  BILL_STATUS_FILTER_OPTIONS,
  EMPTY_BILL_FILTERS,
  NOTE_TYPES,
  billMenuIcon,
  billParties,
  billStats,
  billStatusBadgeClass,
  compareBills,
  filterBills,
  maturity,
  type BillFilters,
  type BillParty,
  type BillStatusFilter,
} from "./billsLogic";
import { InstrumentMovementsModal } from "./InstrumentMovementsModal";
import {
  canEditInstrument,
  noteTypeLabelKey,
  statusLabelKey,
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
const FULL: CSSProperties = { width: "100%" };
const MENU_TOGGLE: CSSProperties = { fontSize: 11 };
const NOTICE: CSSProperties = {
  position: "fixed",
  top: 70,
  right: 20,
  zIndex: 9999,
  minWidth: 300,
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
};
const PAGE_LENGTH = 25;
const LENGTH_MENU = [10, 25, 50, 100, -1];

type Filters = BillFilters & { companyId: string };
type Notice = { variant: "success" | "danger" | "warning"; text: string } | null;
type StatusTarget = { item: InstrumentListItem; target: InstrumentListItem["status"] } | null;

/**
 * Senetler (ZTO Views/Bills/Bills.cshtml; 12.3_TASARIM §5.5). Liste istemci kipindedir (OK-12.3-15):
 * senetler bir kez okunur, durum/tür/cari süzgeci "Filtrele" ile istemcide uygulanır, özet kartları
 * ZTO'daki gibi süzgeçten bağımsızdır. Satır menüsü yalnız sunucunun `allowedTransitions` alanından
 * kurulur; "Sil" çizilmez (ters kayıt ilkesi). "Yeni Ödeme Senedi" 12.2a ödeme modalını yöntem kilitli
 * açar (OK-12.3-12).
 */
export function BillsPage() {
  useZtoRootClass("zto-page-bills");
  const { t } = useTranslation("ztoFinans");
  const { t: tc } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const multiCompany = useMultiCompany();
  const canPost = useCan("FINANCE_PAYMENT_CREATE");
  const me = useAuthStore((state) => state.me);
  const today = todayIso();

  // Derin bağlantı (billsPath): yalnız ilk çizimde okunur, sonra URL'den silinir.
  const [link] = useState(() => ({
    accountId: params.get("accountId") ?? "",
    openPayment: params.get("openBillPaymentModal") === "true",
  }));
  const initial = useMemo<Filters>(
    () => ({ ...EMPTY_BILL_FILTERS, accountId: link.accountId, companyId: "" }),
    [link.accountId],
  );
  const [draft, setDraft] = useState<Filters>(initial);
  const [applied, setApplied] = useState<Filters>(initial);
  const [payment, setPayment] = useState(() => canPost && link.openPayment);
  const [statusTarget, setStatusTarget] = useState<StatusTarget>(null);
  const [detail, setDetail] = useState<InstrumentListItem | null>(null);
  const [movements, setMovements] = useState<InstrumentListItem | null>(null);
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (params.has("accountId") || params.has("openBillPaymentModal")) {
      navigate({ search: "" }, { replace: true });
    }
    // Yalnız ilk çizimde.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bildirim 3 sn (başarı) / 5 sn (hata) sonra kapanır.
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

  const list = useInstrumentList({
    kind: "NOTE",
    companyId: multiCompany ? applied.companyId || null : undefined,
  });
  const all = useMemo(() => list.data?.rows ?? [], [list.data]);
  const rows = useMemo(() => filterBills(all, applied).sort(compareBills), [all, applied]);
  const stats = useMemo(() => billStats(all, today), [all, today]);

  const accounts = useAccountList({});
  const accountItems = useMemo(() => accountOptions(accounts.data ?? []), [accounts.data]);

  const b = (key: string, options?: Record<string, unknown>) => t(`bills.${key}`, options);
  const statusText = (item: Pick<InstrumentListItem, "kind" | "direction" | "status">) =>
    t(statusLabelKey("NOTE", item.direction, item.status));
  const masked = tc("common.a11y.maskedEmployee");

  const columns = useMemo(() => {
    const c = (key: string) => t(`bills.table.${key}`);
    const party = (row: InstrumentListItem, value: BillParty) =>
      row.employeeMasked && value.name === row.accountName ? (
        <span title={masked}>—</span>
      ) : (
        <>
          {value.code ?? ""}
          <br />
          <small className="text-muted">{value.name || "-"}</small>
        </>
      );
    return [
      column.accessor("number", {
        id: "number",
        header: c("number"),
        cell: ({ getValue }) => <strong>{getValue() || "-"}</strong>,
      }),
      column.accessor((row) => (row.noteType ? t(noteTypeLabelKey(row.noteType) ?? "") : ""), {
        id: "noteType",
        header: c("noteType"),
        cell: ({ getValue }) => getValue() || "-",
      }),
      column.accessor((row) => billParties(row).drawer.name ?? "", {
        id: "drawer",
        header: c("drawer"),
        cell: ({ row }) => party(row.original, billParties(row.original).drawer),
      }),
      column.accessor((row) => row.accountName ?? "", {
        id: "drawee",
        header: c("drawee"),
        cell: ({ row }) => party(row.original, billParties(row.original).drawee),
      }),
      column.accessor((row) => billParties(row).payee.name ?? "", {
        id: "payee",
        header: c("payee"),
        cell: ({ row }) => party(row.original, billParties(row.original).payee),
      }),
      ...(multiCompany
        ? [column.accessor("companyName", { id: "company", header: c("company") })]
        : []),
      column.accessor((row) => Number(row.money.amount), {
        id: "amount",
        header: c("amount"),
        cell: ({ row }) => (
          <span className="font-weight-bold">{formatMoneyValue(row.original.money)}</span>
        ),
      }),
      column.accessor((row) => row.issueDate ?? "", {
        id: "issueDate",
        header: c("issueDate"),
        meta: { className: "text-center" },
        cell: ({ getValue }) => (getValue() ? formatDate(getValue()) : "-"),
      }),
      column.accessor("dueDate", {
        id: "dueDate",
        header: c("dueDate"),
        meta: { className: "text-center font-weight-bold" },
        cell: ({ getValue }) => formatDate(getValue()),
      }),
      column.accessor((row) => maturity(row.dueDate, today)?.days ?? 0, {
        id: "remaining",
        header: c("remaining"),
        meta: { className: "text-center" },
        cell: ({ row }) => <MaturityBadge dueDate={row.original.dueDate} today={today} />,
      }),
      column.accessor((row) => statusText(row), {
        id: "status",
        header: c("status"),
        meta: { className: "text-center" },
        cell: ({ row, getValue }) => (
          <span className={`badge ${billStatusBadgeClass(row.original.status)}`}>{getValue()}</span>
        ),
      }),
      column.accessor((row) => (row.collateral ? c("yes") : c("no")), {
        id: "collateral",
        header: c("collateral"),
        meta: { className: "text-center" },
        cell: ({ row }) =>
          row.original.collateral ? (
            <span className="badge badge-warning">
              <i className="fas fa-shield-alt" aria-hidden="true" /> {c("yes")}
            </span>
          ) : (
            <span className="text-muted">{c("no")}</span>
          ),
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
            onTransition={(item, target) => setStatusTarget({ item, target })}
            onCancelSettlement={(id) => setReverseId(id)}
            onDetail={setDetail}
            onMovements={setMovements}
          />
        ),
      }),
    ];
    // statusText yalnız t'ye bağlı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, masked, multiCompany, canPost, today]);

  const update = (patch: Partial<Filters>) => setDraft((d) => ({ ...d, ...patch }));
  const apply = () => setApplied({ ...draft });
  const clear = () => {
    const reset = { ...EMPTY_BILL_FILTERS, companyId: "" };
    setDraft(reset);
    setApplied(reset);
  };
  const filterByStatus = (status: BillStatusFilter) => {
    const next = { ...applied, status };
    setDraft(next);
    setApplied(next);
  };

  const exportList = async () => {
    setExporting(true);
    try {
      const c = (key: string) => t(`bills.table.${key}`);
      const headers = [
        c("number"),
        c("noteType"),
        c("drawer"),
        c("drawee"),
        c("payee"),
        ...(multiCompany ? [c("company")] : []),
        c("amount"),
        c("issueDate"),
        c("dueDate"),
        c("remaining"),
        c("status"),
        c("collateral"),
      ];
      const text = (value: BillParty) =>
        [value.code, value.name].filter((part) => part).join(" - ") || "-";
      await exportExcel({
        title: b("header.crumb"),
        headers,
        rows: rows.map((row) => {
          const parties = billParties(row);
          const hide = (value: BillParty) =>
            row.employeeMasked && value.name === row.accountName ? masked : text(value);
          return [
            row.number,
            row.noteType ? t(noteTypeLabelKey(row.noteType) ?? "") : "-",
            hide(parties.drawer),
            hide(parties.drawee),
            hide(parties.payee),
            ...(multiCompany ? [row.companyName] : []),
            `${formatN2(row.money.amount)} ${row.money.currency}`,
            row.issueDate ? formatDate(row.issueDate) : "-",
            formatDate(row.dueDate),
            maturity(row.dueDate, today)?.days ?? "",
            statusText(row),
            row.collateral ? c("yes") : c("no"),
          ];
        }),
        fileName: `${b("excelFile")}_${today}`,
      });
    } catch {
      setNotice({ variant: "danger", text: b("excelFailed") });
    } finally {
      setExporting(false);
    }
  };

  const h = (key: string, options?: Record<string, unknown>) => b(`header.${key}`, options);
  const f = (key: string) => b(`filter.${key}`);
  const s = (key: string) => b(`stats.${key}`);
  const companyOptions = [
    { value: "", label: f("allCompanies") },
    ...activeCompanies(me?.companies).map((co) => ({ value: co.id, label: co.shortName })),
  ];

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
                      <i className="fas fa-file-invoice-dollar" />
                    </div>
                    <div className="ml-3">
                      <h6 className="mb-0 text-dark" style={TITLE} id="billsTitle">
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
                      <i className="fas fa-file-invoice-dollar" aria-hidden="true" />
                      <span id="totalChipCount">{h("chipTotal", { count: stats.total })}</span>
                    </div>
                    <div className="erp-info-chip chip-primary">
                      <i className="fas fa-filter" aria-hidden="true" />
                      <span>{h("chipFilter")}</span>
                    </div>
                    <div className="erp-info-chip chip-warning">
                      <i className="fas fa-clock" aria-hidden="true" />
                      <span id="overdueChipCount">
                        {h("chipOverdue", { count: stats.overdueCount })}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="d-flex align-items-center" style={RIGHT_GAP}>
                  {canPost && (
                    <>
                      <button
                        type="button"
                        className="erp-btn erp-btn-primary"
                        onClick={() => setPayment(true)}
                      >
                        <i className="fas fa-plus" aria-hidden="true" />
                        <span className="d-none d-md-inline">{h("newItem")}</span>
                        <span className="sr-only d-md-none">{h("newItem")}</span>
                      </button>
                      <div className="btn-divider" />
                    </>
                  )}
                  <Link
                    to={paymentsPath()}
                    className="erp-btn erp-btn-success"
                    title={h("paymentsTitle")}
                  >
                    <i className="fas fa-money-bill-wave" aria-hidden="true" />
                    <span className="d-none d-md-inline">{h("payments")}</span>
                  </Link>
                  <Link to={checksPath()} className="erp-btn erp-btn-info" title={h("checksTitle")}>
                    <i className="fas fa-money-check" aria-hidden="true" />
                    <span className="d-none d-md-inline">{h("checks")}</span>
                  </Link>
                  <div className="btn-divider" />
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
                    <div className="col-md-3 col-sm-6">
                      <label className="filter-label" htmlFor="filterCompany">
                        <i className="fas fa-landmark" aria-hidden="true" /> {f("company")}
                      </label>
                      <ZtoSelect
                        id="filterCompany"
                        className="filter-field no-select2"
                        value={draft.companyId}
                        onChange={(value) => update({ companyId: value })}
                        options={companyOptions}
                        placeholder={null}
                      />
                    </div>
                  )}
                  <div className="col-md-3 col-sm-6">
                    <label className="filter-label" htmlFor="filterStatus">
                      <i className="fas fa-filter" aria-hidden="true" /> {f("status")}
                    </label>
                    <select
                      id="filterStatus"
                      className="filter-field"
                      value={draft.status}
                      onChange={(event) =>
                        update({ status: event.target.value as BillStatusFilter })
                      }
                    >
                      <option value="">{f("allStatuses")}</option>
                      {BILL_STATUS_FILTER_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {b(`statusFilter.${status}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-3 col-sm-6">
                    <label className="filter-label" htmlFor="filterBillType">
                      <i className="fas fa-file-invoice" aria-hidden="true" /> {f("noteType")}
                    </label>
                    <select
                      id="filterBillType"
                      className="filter-field"
                      value={draft.noteType}
                      onChange={(event) =>
                        update({ noteType: event.target.value as NoteType | "" })
                      }
                    >
                      <option value="">{f("allTypes")}</option>
                      {NOTE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {t(noteTypeLabelKey(type) ?? "")}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-3 col-sm-6">
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
                  <div className="col-md-3 col-sm-12">
                    <div className="filter-actions">
                      <button type="button" className="filter-btn btn-filter-apply" onClick={apply}>
                        <i className="fas fa-filter" aria-hidden="true" /> {f("apply")}
                      </button>
                      <button type="button" className="filter-btn btn-filter-clear" onClick={clear}>
                        <i className="fas fa-times" aria-hidden="true" /> {f("clear")}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="row">
                <StatCard
                  className="card-total"
                  icon="fa-file-invoice-dollar"
                  label={s("total")}
                  sub={s("totalSub")}
                  onClick={() => filterByStatus("")}
                  progress
                >
                  <span id="totalCount">{stats.total}</span>
                </StatCard>
                <StatCard
                  className="card-overdue"
                  icon="fa-wallet"
                  label={s("portfolioAmount")}
                  sub={s("portfolioAmountSub")}
                  onClick={() => filterByStatus("PORTFOLIO")}
                >
                  <span id="totalAmount">
                    {stats.portfolioAmounts.length === 0
                      ? formatMoneyValue({ amount: "0", currency: "TRY" })
                      : stats.portfolioAmounts.map((money, index) => (
                          <span key={money.currency}>
                            {index > 0 && <br />}
                            {formatMoneyValue(money)}
                          </span>
                        ))}
                  </span>
                </StatCard>
                <StatCard
                  className="card-collected"
                  icon="fa-folder-open"
                  label={s("portfolio")}
                  sub={s("portfolioSub")}
                  onClick={() => filterByStatus("PORTFOLIO")}
                >
                  <span id="portfolioCount">{stats.portfolioCount}</span>
                </StatCard>
                <StatCard
                  className="card-bounced"
                  icon="fa-exclamation-triangle"
                  label={s("overdue")}
                  sub={s("overdueSub")}
                  onClick={() => filterByStatus("")}
                >
                  <span id="overdueCount">{stats.overdueCount}</span>
                </StatCard>
              </div>

              {list.data?.truncated && (
                <div className="alert alert-warning mt-2 mb-0" role="status">
                  {t("instruments.truncated")}
                </div>
              )}
              <div className="sr-only" role="status">
                {list.isSuccess ? b("table.resultCount", { count: rows.length }) : ""}
              </div>
              <div
                className="table-responsive mt-3"
                role="region"
                aria-labelledby="billsTitle"
                tabIndex={0}
              >
                <ZtoDataTable
                  id="billsTable"
                  columns={columns}
                  data={rows}
                  getRowId={(row) => row.id}
                  tableClassName="table table-compact table-bordered table-striped table-hover bil-phone-card-table"
                  pageLength={PAGE_LENGTH}
                  lengthMenu={LENGTH_MENU}
                  order={[{ id: "dueDate", desc: false }]}
                  processing={list.isFetching}
                  cellDataLabel
                  emptyText={
                    list.isPending ? (
                      <span>
                        <i className="fas fa-spinner fa-spin" aria-hidden="true" />{" "}
                        {b("table.loading")}
                      </span>
                    ) : list.isError ? (
                      <span className="text-danger">{b("table.loadFailed")}</span>
                    ) : (
                      b("table.empty")
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
          <strong>
            <i
              className={`fas ${notice.variant === "success" ? "fa-check-circle" : "fa-exclamation-circle"}`}
              aria-hidden="true"
            />{" "}
            {b(notice.variant === "success" ? "notice.success" : "notice.error")}
          </strong>{" "}
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

      <BillStatusModal
        item={statusTarget?.item ?? null}
        target={statusTarget?.target ?? null}
        onHide={() => setStatusTarget(null)}
        onDone={(text) => setNotice({ variant: "success", text })}
      />
      <BillDetailModal item={detail} onHide={() => setDetail(null)} />
      <InstrumentMovementsModal
        show={movements !== null}
        onHide={() => setMovements(null)}
        instrument={movements}
      />
      <ReverseSettlementModal
        settlementId={reverseId}
        type="PAYMENT"
        onHide={() => setReverseId(null)}
        onDone={(text) => setNotice({ variant: "success", text })}
      />
      <PaymentModal
        show={payment}
        onHide={() => setPayment(false)}
        mode="add"
        presetMethod="NOTE"
        presetAccountId={link.accountId || undefined}
      />
    </div>
  );
}

function StatCard({
  className,
  icon,
  label,
  sub,
  onClick,
  progress,
  children,
}: {
  className: string;
  icon: string;
  label: string;
  sub: string;
  onClick: () => void;
  progress?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="col-xl-3 col-lg-3 col-md-6 col-6">
      {/* ZTO kart tıklanır (filterByStatus); klavye karşılığı role=button + Enter/Space. */}
      <div
        className={`erp-stat-card ${className}`}
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
          }
        }}
      >
        <div className="erp-stat-content">
          <div className="erp-stat-icon" aria-hidden="true">
            <i className={`fas ${icon}`} />
          </div>
          <div className="erp-stat-details">
            <span className="erp-stat-label">{label}</span>
            <div className="erp-stat-value">{children}</div>
            <span className="erp-stat-subtext">{sub}</span>
            {progress && (
              <div className="erp-stat-progress" aria-hidden="true">
                <div className="erp-stat-progress-bar" style={FULL} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MaturityBadge({ dueDate, today }: { dueDate: string; today: string }) {
  const { t } = useTranslation("ztoFinans");
  const value = maturity(dueDate, today);
  if (!value) return <>-</>;
  const m = (key: string, count?: number) => t(`bills.maturity.${key}`, { count });
  if (value.kind === "overdue") {
    return (
      <span className="badge badge-danger" title={m("overdueTitle")}>
        {m("overdue", Math.abs(value.days))}
      </span>
    );
  }
  return (
    <span className={`badge ${value.className}`} title={m(`${value.kind}Title`)}>
      {m("days", value.days)}
    </span>
  );
}

/** Satır menüsü (BIL:3300-3420): "Durum Değiştir" + "İşlemler"; ZTO özel dropdown sınıfları. */
function RowMenu({
  item,
  canPost,
  onTransition,
  onCancelSettlement,
  onDetail,
  onMovements,
}: {
  item: InstrumentListItem;
  canPost: boolean;
  onTransition: (item: InstrumentListItem, target: InstrumentListItem["status"]) => void;
  onCancelSettlement: (settlementId: string) => void;
  onDetail: (item: InstrumentListItem) => void;
  onMovements: (item: InstrumentListItem) => void;
}) {
  const { t } = useTranslation("ztoFinans");
  const menu: InstrumentMenuItem[] = canPost ? transitionMenu(item, "bill") : [];
  const m = (key: string) => t(`bills.menu.${key}`);
  const select = (entry: InstrumentMenuItem) => {
    if (entry.action === "cancelSettlement") onCancelSettlement(entry.settlementId);
    else if (entry.action === "transition") onTransition(item, entry.target);
  };
  return (
    <div className="btn-group">
      <ZtoMenuButton
        groupClassName="dropdown"
        buttonClassName="btn btn-light dropdown-toggle-custom"
        buttonStyle={MENU_TOGGLE}
        menuClassName="dropdown-menu-custom"
        ariaLabel={`${t("bills.table.menu")} — ${item.number}`}
        label={<i className="fas fa-ellipsis-v" aria-hidden="true" />}
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
                  className="dropdown-item-custom"
                  icon={`fas ${billMenuIcon(key)}`}
                  label={t(entry.labelKey)}
                  onSelect={() => select(entry)}
                />
              );
            })}
            <MenuDivider />
          </>
        )}
        <h6 className="dropdown-header" role="presentation">
          <i className="fas fa-cog" aria-hidden="true" /> {m("actionsHeader")}
        </h6>
        {!item.employeeMasked && (
          <MenuItem
            className="dropdown-item-custom"
            icon="fas fa-eye text-info"
            label={m("detail")}
            onSelect={() => onDetail(item)}
          />
        )}
        {canPost && canEditInstrument(item) && (
          <MenuItem
            className="dropdown-item-custom"
            icon="fas fa-edit text-warning"
            label={m("edit")}
            to={billEditPath(item.id)}
          />
        )}
        <MenuItem
          className="dropdown-item-custom"
          icon="fas fa-history text-secondary"
          label={m("movements")}
          onSelect={() => onMovements(item)}
        />
      </ZtoMenuButton>
    </div>
  );
}
