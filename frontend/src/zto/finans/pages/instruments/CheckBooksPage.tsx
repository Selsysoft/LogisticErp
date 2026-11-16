import { createColumnHelper } from "@tanstack/react-table";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useCan } from "../../../../pages/finance/common";
import { useFundList } from "../../../../pages/finance/fundApi";
import {
  useCheckBooks,
  useCheckLeaves,
  useDeleteCheckLeaf,
  useVoidCheckLeaf,
} from "../../../../pages/finance/instrumentApi";
import type { CheckLeaf, CheckLeafStatus } from "../../../../pages/finance/types";
import { ZtoConfirmModal, ZtoDataTable, formatDateTime } from "../../../components";
import { exportExcel } from "../../../export";
import { checksPath } from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { todayIso } from "../fundTransactions/fundTransactionsLogic";
import { fundLabel } from "../settlementModals/settlementFormLogic";
import { AddCheckBookModal } from "./AddCheckBookModal";
import {
  EMPTY_LEAF_FILTERS,
  canDeleteLeaf,
  canVoidLeaf,
  checkBookTotals,
  compareLeaves,
  leafStatusClass,
  type LeafFilters,
} from "./checkBookLogic";
import { errorTextOf } from "./editInstrumentLogic";

const column = createColumnHelper<CheckLeaf>();
const CARD_HEADER: CSSProperties = { padding: "10px 20px" };
const LEFT_GAP: CSSProperties = { gap: 12 };
const RIGHT_GAP: CSSProperties = { gap: 6 };
const CHIPS: CSSProperties = { gap: 8, marginLeft: 15 };
const TITLE: CSSProperties = { fontSize: 14, fontWeight: 600 };
const ACTIONS_GAP: CSSProperties = { gap: 8 };
const NOTICE: CSSProperties = {
  position: "fixed",
  top: 70,
  right: 20,
  zIndex: 9999,
  minWidth: 300,
  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
};
const LEAF_STATUSES: readonly CheckLeafStatus[] = ["UNUSED", "USED", "VOID"];

type Notice = { variant: "success" | "danger"; text: string } | null;
type Pending = { kind: "void" | "delete"; leaf: CheckLeaf } | null;

/**
 * Çek Koçanları (ZTO Views/CheckBooks/Index.cshtml; 12.3_TASARIM §5.6). Kenar çubuğunda yok, Çekler'in
 * alt yolu. Yapraklar istemci kipinde okunur (en çok 5.000); süzgeç sunucuya gider (banka, seri, durum).
 * Koçan oluşturma, yaprak iptali ve silme `FINANCE_MANAGE` ister; yetkisizde düğmeler çizilmez.
 */
export function CheckBooksPage() {
  useZtoRootClass("zto-page-check-books");
  const { t, i18n } = useTranslation("ztoFinans");
  const { t: tc } = useTranslation();
  const canManage = useCan("FINANCE_MANAGE");
  const [draft, setDraft] = useState<LeafFilters>(EMPTY_LEAF_FILTERS);
  const [applied, setApplied] = useState<LeafFilters>(EMPTY_LEAF_FILTERS);
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [exporting, setExporting] = useState(false);
  const voidLeaf = useVoidCheckLeaf();
  const deleteLeaf = useDeleteCheckLeaf();

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

  const books = useCheckBooks();
  const totals = useMemo(() => checkBookTotals(books.data ?? []), [books.data]);
  const banks = useFundList({ kind: "BANK", active: true });
  const bankOptions = (banks.data ?? []).filter((fund) => fund.kind === "BANK");
  const leaves = useCheckLeaves({
    fundAccountId: applied.fundAccountId || undefined,
    serial: applied.serial.trim() || undefined,
    status: applied.status || undefined,
  });
  const rows = useMemo(() => [...(leaves.data?.rows ?? [])].sort(compareLeaves), [leaves.data]);

  const k = (key: string, options?: Record<string, unknown>) => t(`checkBooks.${key}`, options);
  const lookup = (key: string) => (i18n.exists(key, { ns: "ztoFinans" }) ? t(key) : null);

  const columns = useMemo(() => {
    const c = (key: string) => t(`checkBooks.table.${key}`);
    return [
      column.accessor("checkBookSerial", {
        id: "serial",
        header: c("serial"),
        cell: ({ getValue }) => <strong>{getValue() || "-"}</strong>,
      }),
      column.accessor("leafNo", { id: "leafNo", header: c("leafNo") }),
      column.accessor("number", {
        id: "number",
        header: c("number"),
        cell: ({ getValue }) => <strong className="text-primary">{getValue()}</strong>,
      }),
      column.accessor((row) => row.fundBankName ?? "", {
        id: "bank",
        header: c("bank"),
        cell: ({ getValue }) => getValue() || "-",
      }),
      column.accessor((row) => row.fundBankBranchName ?? "", {
        id: "branch",
        header: c("branch"),
        cell: ({ getValue }) => getValue() || "-",
      }),
      column.accessor((row) => row.fundIban ?? "", {
        id: "iban",
        header: c("iban"),
        cell: ({ getValue }) => <small>{getValue() || "-"}</small>,
      }),
      column.accessor((row) => row.branchName ?? "", {
        id: "workPlace",
        header: c("workPlace"),
        cell: ({ getValue }) => getValue() || "-",
      }),
      column.accessor((row) => row.micrCode ?? "", {
        id: "micr",
        header: c("micr"),
        cell: ({ getValue }) => <small>{getValue() || "-"}</small>,
      }),
      column.accessor((row) => t(`checkBooks.status.${row.status}`), {
        id: "status",
        header: c("status"),
        cell: ({ row, getValue }) => (
          <span className={`check-status-badge ${leafStatusClass(row.original.status)}`}>
            {getValue()}
          </span>
        ),
      }),
      column.accessor((row) => row.usedDate ?? "", {
        id: "usedDate",
        header: c("usedDate"),
        cell: ({ getValue }) =>
          getValue() ? formatDateTime(getValue()) : <span className="text-muted">-</span>,
      }),
      column.display({
        id: "actions",
        header: c("actions"),
        enableSorting: false,
        meta: { exportable: false },
        cell: ({ row }) => {
          const leaf = row.original;
          const voidable = canManage && canVoidLeaf(leaf);
          const deletable = canManage && canDeleteLeaf(leaf);
          if (!voidable && !deletable) return <span className="text-muted">-</span>;
          return (
            <>
              {voidable && (
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  title={c("void")}
                  aria-label={`${c("void")} — ${leaf.number}`}
                  onClick={() => setPending({ kind: "void", leaf })}
                >
                  <i className="fas fa-ban" aria-hidden="true" />
                </button>
              )}{" "}
              {deletable && (
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  title={c("delete")}
                  aria-label={`${c("delete")} — ${leaf.number}`}
                  onClick={() => setPending({ kind: "delete", leaf })}
                >
                  <i className="fas fa-trash" aria-hidden="true" />
                </button>
              )}
            </>
          );
        },
      }),
    ];
  }, [t, canManage]);

  const confirmPending = async () => {
    if (!pending) return;
    if (pending.kind === "void") {
      await voidLeaf.mutateAsync({ id: pending.leaf.id });
      setNotice({ variant: "success", text: k("confirm.voided") });
    } else {
      await deleteLeaf.mutateAsync(pending.leaf.id);
      setNotice({ variant: "success", text: k("confirm.deleted") });
    }
    setPending(null);
  };

  const exportList = async () => {
    setExporting(true);
    try {
      const c = (key: string) => k(`table.${key}`);
      await exportExcel({
        title: k("header.crumb"),
        headers: [
          c("serial"),
          c("leafNo"),
          c("number"),
          c("bank"),
          c("branch"),
          c("iban"),
          c("workPlace"),
          c("micr"),
          c("status"),
          c("usedDate"),
        ],
        rows: rows.map((row) => [
          row.checkBookSerial,
          row.leafNo,
          row.number,
          row.fundBankName ?? "-",
          row.fundBankBranchName ?? "-",
          row.fundIban ?? "-",
          row.branchName ?? "-",
          row.micrCode ?? "-",
          k(`status.${row.status}`),
          row.usedDate ? formatDateTime(row.usedDate) : "-",
        ]),
        fileName: `${k("excelFile")}_${todayIso()}`,
      });
    } catch {
      setNotice({ variant: "danger", text: k("excelFailed") });
    } finally {
      setExporting(false);
    }
  };

  const h = (key: string, options?: Record<string, unknown>) => k(`header.${key}`, options);
  const f = (key: string) => k(`filter.${key}`);

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12">
          <div className="card">
            <div className="card-header bg-white border-bottom" style={CARD_HEADER}>
              <div className="d-flex justify-content-between align-items-center flex-wrap">
                <div className="d-flex align-items-center flex-wrap" style={LEFT_GAP}>
                  <Link
                    to={checksPath()}
                    className="erp-btn erp-btn-secondary"
                    title={h("backTitle")}
                  >
                    <i className="fas fa-arrow-left" aria-hidden="true" />
                    <span className="d-none d-md-inline">{h("back")}</span>
                  </Link>
                  <div className="d-flex align-items-center">
                    <div className="erp-header-icon" aria-hidden="true">
                      <i className="fas fa-book" />
                    </div>
                    <div className="ml-3">
                      <h6 className="mb-0 text-dark" style={TITLE} id="checkBooksTitle">
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
                      <i className="fas fa-book" aria-hidden="true" />
                      <span>{h("chipBooks", { count: totals.books })}</span>
                    </div>
                    <div className="erp-info-chip chip-primary">
                      <i className="fas fa-file" aria-hidden="true" />
                      <span>{h("chipLeaves", { count: totals.leaves })}</span>
                    </div>
                    <div className="erp-info-chip chip-success">
                      <i className="fas fa-check-circle" aria-hidden="true" />
                      <span>{h("chipAvailable", { count: totals.available })}</span>
                    </div>
                    <div className="erp-info-chip chip-warning">
                      <i className="fas fa-check" aria-hidden="true" />
                      <span>{h("chipUsed", { count: totals.used })}</span>
                    </div>
                  </div>
                </div>
                <div className="d-flex align-items-center" style={RIGHT_GAP}>
                  <Link to={checksPath()} className="erp-btn erp-btn-info" title={h("checksTitle")}>
                    <i className="fas fa-money-check" aria-hidden="true" />
                    <span className="d-none d-md-inline">{h("checks")}</span>
                  </Link>
                  {canManage && (
                    <button
                      type="button"
                      className="erp-btn erp-btn-primary"
                      onClick={() => setAdding(true)}
                    >
                      <i className="fas fa-plus" aria-hidden="true" />
                      <span className="d-none d-md-inline">{h("newBook")}</span>
                      <span className="sr-only d-md-none">{h("newBook")}</span>
                    </button>
                  )}
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
                </div>
              </div>
            </div>

            <div className="card-body p-2">
              <div className="erp-filter-card">
                <form
                  className="row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setApplied({ ...draft });
                  }}
                >
                  <div className="col-md-4">
                    <label className="filter-label" htmlFor="filterBankAccount">
                      <i className="fas fa-university" aria-hidden="true" /> {f("bank")}
                    </label>
                    <select
                      id="filterBankAccount"
                      className="filter-field"
                      value={draft.fundAccountId}
                      onChange={(event) =>
                        setDraft((d) => ({ ...d, fundAccountId: event.target.value }))
                      }
                    >
                      <option value="">{f("all")}</option>
                      {bankOptions.map((fund) => (
                        <option key={fund.id} value={fund.id}>
                          {fundLabel(fund)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-3">
                    <label className="filter-label" htmlFor="filterSerialNo">
                      <i className="fas fa-barcode" aria-hidden="true" /> {f("serial")}
                    </label>
                    <input
                      type="text"
                      id="filterSerialNo"
                      className="filter-field"
                      placeholder={f("serialPlaceholder")}
                      autoComplete="off"
                      value={draft.serial}
                      onChange={(event) => setDraft((d) => ({ ...d, serial: event.target.value }))}
                    />
                  </div>
                  <div className="col-md-3">
                    <label className="filter-label" htmlFor="filterStatus">
                      <i className="fas fa-filter" aria-hidden="true" /> {f("status")}
                    </label>
                    <select
                      id="filterStatus"
                      className="filter-field"
                      value={draft.status}
                      onChange={(event) =>
                        setDraft((d) => ({
                          ...d,
                          status: event.target.value as CheckLeafStatus | "",
                        }))
                      }
                    >
                      <option value="">{f("all")}</option>
                      {LEAF_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {k(`status.${status}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-2">
                    <span className="filter-label" aria-hidden="true">
                      &nbsp;
                    </span>
                    <div className="d-flex gap-2" style={ACTIONS_GAP}>
                      <button type="submit" className="filter-btn btn-filter-apply">
                        <i className="fas fa-search" aria-hidden="true" /> {f("search")}
                      </button>
                      <button
                        type="button"
                        className="filter-btn btn-filter-clear"
                        title={f("clear")}
                        aria-label={f("clear")}
                        onClick={() => {
                          setDraft(EMPTY_LEAF_FILTERS);
                          setApplied(EMPTY_LEAF_FILTERS);
                        }}
                      >
                        <i className="fas fa-times" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </form>
              </div>

              {leaves.data?.truncated && (
                <div className="alert alert-warning mt-2 mb-0" role="status">
                  {k("table.truncated")}
                </div>
              )}
              <div className="sr-only" role="status">
                {leaves.isSuccess ? k("table.resultCount", { count: rows.length }) : ""}
              </div>
              <div
                className="table-responsive mt-3"
                role="region"
                aria-labelledby="checkBooksTitle"
                tabIndex={0}
              >
                <ZtoDataTable
                  id="checkBooksTable"
                  columns={columns}
                  data={rows}
                  getRowId={(row) => row.id}
                  tableClassName="table table-compact table-bordered table-striped table-hover"
                  pageLength={25}
                  lengthMenu={[10, 25, 50, 100, -1]}
                  order={[
                    { id: "serial", desc: false },
                    { id: "leafNo", desc: false },
                  ]}
                  processing={leaves.isFetching}
                  cellDataLabel
                  emptyText={
                    leaves.isPending ? (
                      <span>
                        <i className="fas fa-spinner fa-spin" aria-hidden="true" />{" "}
                        {k("table.loading")}
                      </span>
                    ) : leaves.isError ? (
                      <span className="text-danger">{k("table.loadFailed")}</span>
                    ) : (
                      k("table.empty")
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
            {k(notice.variant === "success" ? "notice.success" : "notice.error")}
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

      <AddCheckBookModal
        show={adding}
        onHide={() => setAdding(false)}
        onDone={(text) => setNotice({ variant: "success", text })}
      />
      <ZtoConfirmModal
        show={pending !== null}
        variant={pending?.kind === "delete" ? "danger" : "warning"}
        title={k(pending?.kind === "delete" ? "confirm.deleteTitle" : "confirm.voidTitle")}
        message={k(pending?.kind === "delete" ? "confirm.delete" : "confirm.void")}
        note={pending ? pending.leaf.number : null}
        confirmText={pending?.kind === "delete" ? k("table.delete") : k("table.void")}
        cancelText={k("confirm.cancel")}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
        onError={(err) => {
          const kind = pending?.kind;
          setPending(null);
          setNotice({
            variant: "danger",
            text: errorTextOf(
              err,
              k(kind === "delete" ? "confirm.deleteFailed" : "confirm.voidFailed"),
              ["checkBooks", "instruments"],
              lookup,
            ),
          });
        }}
      />
    </div>
  );
}
