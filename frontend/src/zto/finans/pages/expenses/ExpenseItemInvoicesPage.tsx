import { createColumnHelper } from "@tanstack/react-table";
import { CSSProperties, MouseEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { apiBlobUrl, apiGet } from "../../../../api/client";
import type { StoredFile } from "../../../../pages/crm/types";
import { useCan, useCompanyName, useMultiCompany } from "../../../../pages/finance/common";
import {
  expenseFilesPath,
  useExpenseItems,
  useExpenseList,
  useExpenseSummary,
  useReverseExpense,
} from "../../../../pages/finance/expenseApi";
import type { ExpenseListItem } from "../../../../pages/finance/types";
import {
  ZtoBranchSelect,
  ZtoDataTable,
  ZtoModal,
  currencySymbol,
  useZtoSnackbar,
} from "../../../components";
import { expenseEditPath, generalExpensesPath } from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { formatIsoDate, localToday } from "./expenseDates";
import {
  REVERSE_REASON_MAX,
  branchIdsOf,
  currencyOptionText,
  footerTotal,
  moneyText,
  reverseDateOf,
  sortInvoices,
} from "./expenseListLogic";
import { EXPENSE_EXPORT_BUTTONS } from "./GeneralExpensesPage";
import { InvoiceDetailsModal } from "./InvoiceDetailsModal";

type Row = ExpenseListItem & { no: number };
const column = createColumnHelper<Row>();

const CURRENCY_CARD: CSSProperties = { borderLeft: "4px solid #17a2b8" };
const FILTER_LABEL: CSSProperties = { fontWeight: "bold" };
const FILTER_SELECT: CSSProperties = { maxWidth: 250 };
const HEADER_ROW: CSSProperties = {
  margin: 2,
  display: "flex",
  justifyContent: "space-between",
  flexDirection: "row",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
};
const HEADER_TOOLS: CSSProperties = { display: "flex", alignItems: "center", gap: 8 };
const ALIGN_CENTER: CSSProperties = { alignItems: "center" };
const TABLE_TITLE: CSSProperties = { margin: 0, fontSize: 14 };
const TABLE: CSSProperties = { fontSize: 11 };
const RIGHT: CSSProperties = { textAlign: "right" };
const TRASH_ICON: CSSProperties = { fontSize: 48, color: "#dc3545" };
const GROUP_TITLE: CSSProperties = {
  display: "inline",
  margin: 0,
  fontSize: "inherit",
  fontWeight: "inherit",
  color: "inherit",
};

/** Belgenin ilk dosyasını yeni sekmede açar (yetkili blob URL; ZTO /MaterialStockAll/GetFile). */
async function openDocument(expenseId: string) {
  const target = window.open("", "_blank");
  try {
    const files = await apiGet<StoredFile[]>(expenseFilesPath(expenseId));
    const file = files[0];
    if (!file) throw new Error("-");
    const url = await apiBlobUrl(`/files/${encodeURIComponent(file.id)}/content`);
    if (target) target.location.href = url;
    else window.open(url, "_blank");
  } catch (error) {
    target?.close();
    throw error;
  }
}

/**
 * Masraf kaleminin faturaları (ZTO Views/ProductionExpenses/ExpenseGroupDetails.cshtml:289-718;
 * 12.7_TASARIM §5.5). Kartlar ve süzgeç seçenekleri kalem özetinden (para birimi kırılımlı), satırlar
 * `GET /finance/expenses?expenseItemId&currency` (en çok 500). "Sil" gerekçeli ters kayıttır
 * (OK-12.7-4); düzenleme form sayfasına gider (revise).
 */
export function ExpenseItemInvoicesPage() {
  useZtoRootClass("zto-page-expense-group-details");
  const { itemId = "" } = useParams();
  const { t } = useTranslation("ztoFinans");
  const k = (key: string, options?: Record<string, unknown>) =>
    t(`expenses.invoices.${key}`, options);
  const d = (key: string, options?: Record<string, unknown>) =>
    t(`expenses.deleteModal.${key}`, options);
  const snackbar = useZtoSnackbar();
  const canManage = useCan("FINANCE_MANAGE");
  const multiCompany = useMultiCompany();
  const companyName = useCompanyName();
  const [branchId, setBranchId] = useState("");
  const [currency, setCurrency] = useState("");
  const [picked, setPicked] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const branchIds = branchIdsOf(branchId);

  const items = useExpenseItems();
  const item = items.data?.find((x) => x.id === itemId);
  const summary = useExpenseSummary({ branchIds });
  const itemSummary = summary.data?.find((x) => x.expenseItemId === itemId);
  const currencies = itemSummary?.totals ?? [];
  const list = useExpenseList({
    expenseItemId: itemId,
    currency: currency || undefined,
    branchIds,
    size: 500,
  });
  const rows = useMemo<Row[]>(
    () => sortInvoices(list.data?.content ?? []).map((row, index) => ({ ...row, no: index + 1 })),
    [list.data],
  );
  const footer = footerTotal(rows);
  const reverse = useReverseExpense();
  const name = item?.name ?? itemSummary?.expenseItemName ?? "";
  const phone = itemSummary?.lastSupplierPhone ?? "";
  const city = itemSummary?.lastSupplierCity ?? "";

  const columns = useMemo(() => {
    const c = (key: string) => t(`expenses.invoices.${key}`);
    return [
      column.accessor("no", { id: "no", header: c("no") }),
      column.accessor((row) => row.invoiceNumber ?? "", {
        id: "invoiceNo",
        header: c("invoiceNo"),
      }),
      column.accessor((row) => row.description ?? "", {
        id: "description",
        header: c("description"),
      }),
      column.accessor("expenseTypeName", { id: "type", header: c("expenseType") }),
      column.accessor((row) => t(`expenses.department.${row.department}`), {
        id: "department",
        header: c("department"),
      }),
      column.accessor("branchName", {
        id: "branch",
        header: c("workPlace"),
        cell: ({ getValue }) => getValue() || <span className="text-muted">-</span>,
      }),
      ...(multiCompany
        ? [
            column.accessor((row) => companyName(row.companyId), {
              id: "company",
              header: c("company"),
            }),
          ]
        : []),
      column.accessor("currency", {
        id: "currency",
        header: c("currency"),
        cell: ({ getValue }) => (
          <span className="badge bg-info text-white">{currencySymbol(getValue())}</span>
        ),
      }),
      column.accessor((row) => Number(row.totalAmount), {
        id: "amount",
        header: c("amount"),
        meta: {
          exportValue: (row: Row) => moneyText(row.totalAmount, row.currency),
          searchValue: (_value: number, row: Row) => moneyText(row.totalAmount, row.currency),
        },
        cell: ({ row }) => (
          <div style={RIGHT}>
            <strong className="text-danger">
              {moneyText(row.original.totalAmount, row.original.currency)}
            </strong>
          </div>
        ),
      }),
      column.accessor("invoiceDate", {
        id: "date",
        header: c("invoiceDate"),
        meta: {
          exportValue: (row: Row) => formatIsoDate(row.invoiceDate),
          searchValue: (value: string) => formatIsoDate(value),
        },
        cell: ({ getValue }) => formatIsoDate(getValue()),
      }),
      column.display({
        id: "document",
        header: c("document"),
        enableSorting: false,
        meta: { searchable: false, exportable: false },
        cell: ({ row }) =>
          row.original.hasDocument ? (
            <div className="btn-group" role="group">
              <a
                href="#"
                className="btn btn-sm btn-dark"
                title={c("viewDocument")}
                aria-label={c("viewDocument")}
                onClick={(event: MouseEvent) => {
                  event.preventDefault();
                  openDocument(row.original.id).catch((error: unknown) =>
                    snackbar.show(
                      t("expenses.invoices.documentFailed", {
                        message: error instanceof Error ? error.message : String(error),
                      }),
                      "error",
                    ),
                  );
                }}
              >
                <i className="fas fa-receipt" aria-hidden="true" />
              </a>
              <button
                type="button"
                className="btn btn-sm btn-info text-white view-details-btn"
                title={c("details")}
                aria-label={c("details")}
                onClick={() => setPicked(row.original)}
              >
                <i className="fas fa-file-invoice-dollar" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <span className="text-muted">-</span>
          ),
      }),
      column.display({
        id: "action",
        header: c("action"),
        enableSorting: false,
        meta: { searchable: false, exportable: false },
        cell: ({ row }) =>
          canManage ? (
            <>
              <Link
                to={expenseEditPath(row.original.id)}
                className="btn btn-sm btn-warning text-white"
                title={c("edit")}
                aria-label={c("edit")}
              >
                <i className="fas fa-edit" aria-hidden="true" />
              </Link>{" "}
              <button
                type="button"
                className="btn btn-sm btn-danger text-white"
                title={c("delete")}
                aria-label={c("delete")}
                onClick={() => {
                  setReason("");
                  setReasonError(false);
                  setDeleting(row.original);
                }}
              >
                <i className="fas fa-trash" aria-hidden="true" />
              </button>
            </>
          ) : null,
      }),
    ];
  }, [t, multiCompany, companyName, canManage, snackbar]);

  const confirmDelete = async () => {
    if (!deleting || reverse.isPending) return;
    if (!reason.trim()) {
      setReasonError(true);
      document.getElementById("deleteReason")?.focus();
      return;
    }
    try {
      await reverse.mutateAsync({
        id: deleting.id,
        body: { date: reverseDateOf(localToday(), deleting.invoiceDate), reason: reason.trim() },
      });
      setDeleting(null);
      snackbar.show(d("done"), "success");
    } catch (error) {
      snackbar.show(
        d("error", { message: error instanceof Error ? error.message : String(error) }),
        "error",
      );
    }
  };

  const unspecified = d("unspecified");
  const colCountBefore = multiCompany ? 8 : 7;

  return (
    <div className="container-fluid">
      <br />
      <ol className="breadcrumb">
        <li>
          <Link to={generalExpensesPath()}>{k("breadcrumbRoot")}</Link>
        </li>
        <li className="divider" />
        <li className="active">{k("breadcrumbCurrent")}</li>
      </ol>

      <div className="group-header">
        {/* ZTO geçersiz <h7> kullanır (satır içi, biçimsiz); erişilebilir başlık aynı görünümle. */}
        <h1 style={GROUP_TITLE}>
          <i className="fas fa-layer-group" aria-hidden="true" /> {k("header", { name })}
        </h1>
      </div>

      {(items.isError || list.isError) && (
        <div className="alert alert-danger" role="alert">
          {k("loadFailed")} {(items.error ?? list.error)?.message}
        </div>
      )}
      {items.isSuccess && !item && (
        <div className="alert alert-warning" role="alert">
          {k("notFound")}
        </div>
      )}

      <div className="row">
        <div className="col-md-3">
          <div className="summary-card">
            <div className="summary-title">{k("accountCode")}</div>
            <div className="summary-value">{item?.code ?? itemSummary?.expenseItemCode ?? ""}</div>
          </div>
        </div>
        <div className="col-md-2">
          <div className="summary-card">
            <div className="summary-title">{k("invoiceCount")}</div>
            <div className="summary-value">{itemSummary?.invoiceCount ?? 0}</div>
          </div>
        </div>
        {currencies.length > 0 ? (
          currencies.map((total) => (
            <div key={total.currency} className="col-md-2">
              <div className="summary-card" style={CURRENCY_CARD}>
                <div className="summary-title">
                  <i className="fas fa-coins" aria-hidden="true" /> {total.currency}
                </div>
                <div className="summary-value">{moneyText(total.totalAmount, total.currency)}</div>
                <small className="text-muted">
                  {k("invoiceCountSmall", { count: total.count })}
                </small>
              </div>
            </div>
          ))
        ) : (
          <div className="col-md-12">
            <div className="alert alert-info">
              <i className="fas fa-info-circle" aria-hidden="true" /> {k("noCurrency")}
            </div>
          </div>
        )}
        <div className="col-md-2">
          <div className="summary-card">
            <div className="summary-title">{k("taxNumber")}</div>
            <div className="summary-value">
              {itemSummary?.lastSupplierTaxNumberMasked || <span className="text-muted">-</span>}
            </div>
          </div>
        </div>
        <div className="col-md-2">
          <div className="summary-card">
            <div className="summary-title">{k("phoneCity")}</div>
            <div className="summary-value">
              {phone && city ? (
                `${phone} / ${city}`
              ) : phone || city ? (
                phone || city
              ) : (
                <span className="text-muted">{k("noInfo")}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="row mb-3">
        <div className="col-md-12">
          <div className="card">
            <div className="card-body p-2">
              <div className="d-flex align-items-center">
                <label className="mb-0 me-2 mr-2" style={FILTER_LABEL} htmlFor="currencyFilter">
                  <i className="fas fa-filter" aria-hidden="true" /> {k("currencyFilter")}
                </label>
                <select
                  id="currencyFilter"
                  className="form-control form-control-sm"
                  style={FILTER_SELECT}
                  value={currency}
                  onChange={(event) => setCurrency(event.target.value)}
                >
                  <option value="">{k("all")}</option>
                  {currencies.map((total) => (
                    <option key={total.currency} value={total.currency}>
                      {currencyOptionText(total)}
                    </option>
                  ))}
                </select>
                <button
                  id="clearFilter"
                  type="button"
                  className="btn btn-sm btn-secondary ms-2 ml-2"
                  onClick={() => setCurrency("")}
                >
                  <i className="fas fa-times" aria-hidden="true" /> {k("clear")}
                </button>
                <span
                  id="filterInfo"
                  className="ms-3 ml-3 text-muted"
                  style={currency ? undefined : { display: "none" }}
                  aria-live="polite"
                >
                  <i className="fas fa-info-circle" aria-hidden="true" />{" "}
                  <span id="filterCount">{currency ? rows.length : ""}</span> {k("showing")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div style={HEADER_ROW}>
            <div style={ALIGN_CENTER}>
              <h5 className="card-title mb-0" style={TABLE_TITLE}>
                <i className="fas fa-list" aria-hidden="true" /> {k("tableTitle")}
              </h5>
            </div>
            <div style={HEADER_TOOLS}>
              <ZtoBranchSelect
                id="workPlaceFilterEGD"
                className="pe-filter-select no-select2"
                value={branchId}
                allowAll
                onChange={setBranchId}
              />
            </div>
          </div>
        </div>
        <div className="card-body">
          <div className="table-responsive">
            <ZtoDataTable
              id="dataTable2"
              tableClassName="table table-hover"
              tableStyle={TABLE}
              columns={columns}
              data={rows}
              getRowId={(row) => row.id}
              dom="Bfrtip"
              order={[{ id: "no", desc: false }]}
              buttons={EXPENSE_EXPORT_BUTTONS}
              exportTitle={k("pdfTitle", { name })}
              exportExcludeLastColumn
              processing={list.isFetching}
              footer={
                rows.length > 0 ? (
                  <tr id="footerTotalRow" className="table-secondary">
                    <th colSpan={colCountBefore} className="text-end text-right">
                      {k("total")}
                    </th>
                    <th id="footerTotal">
                      {footer.kind === "single" ? (
                        moneyText(footer.amount, footer.currency)
                      ) : (
                        <span className="text-muted">{k("mixed")}</span>
                      )}
                    </th>
                    <th colSpan={3} />
                  </tr>
                ) : undefined
              }
            />
          </div>
        </div>
      </div>

      <InvoiceDetailsModal
        expenseId={picked?.id ?? null}
        invoiceNumber={picked?.invoiceNumber ?? null}
        onHide={() => setPicked(null)}
      />

      <ZtoModal
        show={deleting !== null}
        onHide={() => !reverse.isPending && setDeleting(null)}
        id="deleteConfirmationModal"
        centered
        titleAs="h6"
        headerClassName="bg-danger text-white"
        closeButtonClassName="text-white"
        closeDisabled={reverse.isPending}
        backdrop={reverse.isPending ? "static" : true}
        title={
          <>
            <i className="fas fa-exclamation-triangle" aria-hidden="true" /> {d("title")}
          </>
        }
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={reverse.isPending}
              onClick={() => setDeleting(null)}
            >
              <i className="fas fa-times" aria-hidden="true" /> {d("cancel")}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              id="confirmDeleteBtn"
              disabled={reverse.isPending}
              aria-busy={reverse.isPending || undefined}
              onClick={confirmDelete}
            >
              {reverse.isPending ? (
                <>
                  <i className="fas fa-spinner fa-spin" aria-hidden="true" /> {d("deleting")}
                </>
              ) : (
                <>
                  <i className="fas fa-trash" aria-hidden="true" /> {d("confirm")}
                </>
              )}
            </button>
          </>
        }
      >
        {deleting && (
          <>
            <div className="text-center mb-3">
              <i className="fas fa-trash-alt" style={TRASH_ICON} aria-hidden="true" />
            </div>
            <h5 className="text-center mb-3" id="deleteWarningMessage">
              {deleting.invoiceNumber
                ? d("questionNumbered", { no: deleting.invoiceNumber })
                : d("question")}
            </h5>
            <div className="alert alert-warning">
              <i className="fas fa-info-circle" aria-hidden="true" />{" "}
              <strong>{d("warningLabel")}</strong> {d("warning")}
            </div>
            <div className="alert alert-secondary mt-2" id="deleteDetails">
              <small>
                <i className="fas fa-file-invoice" aria-hidden="true" />{" "}
                <span id="deleteInvoiceNumber">
                  {d("invoiceNo", { value: deleting.invoiceNumber || unspecified })}
                </span>
                <br />
                <i className="fas fa-coins" aria-hidden="true" />{" "}
                <span id="deleteInvoiceAmount">
                  {d("amount", { value: moneyText(deleting.totalAmount, deleting.currency) })}
                </span>
                <br />
                <i className="fas fa-calendar" aria-hidden="true" />{" "}
                <span id="deleteInvoiceDate">
                  {d("date", { value: formatIsoDate(deleting.invoiceDate) || unspecified })}
                </span>
              </small>
            </div>
            <div className="form-group mb-0">
              <label htmlFor="deleteReason">
                {d("reason")} <span className="text-danger">*</span>
              </label>
              <textarea
                id="deleteReason"
                className={`form-control${reasonError ? " is-invalid" : ""}`}
                rows={3}
                maxLength={REVERSE_REASON_MAX}
                required
                aria-invalid={reasonError || undefined}
                aria-describedby={reasonError ? "deleteReasonError" : undefined}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  if (event.target.value.trim()) setReasonError(false);
                }}
              />
              {reasonError && (
                <div id="deleteReasonError" className="invalid-feedback d-block">
                  {d("reasonRequired")}
                </div>
              )}
            </div>
          </>
        )}
      </ZtoModal>
    </div>
  );
}
