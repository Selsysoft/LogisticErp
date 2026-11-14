import { createColumnHelper } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { apiDownload } from "../../../../api/client";
import {
  cancelDocument,
  useAccountDocument,
  useAccountInvoices,
  useFinanceMutation,
} from "../../../../pages/finance/accountApi";
import type { Account, AccountInvoiceRow, InvoiceDirection } from "../../../../pages/finance/types";
import {
  ZtoConfirmModal,
  ZtoDataTable,
  ZtoModal,
  currencySymbol,
  formatDate,
  formatN2,
  useZtoSnackbar,
} from "../../../components";
import { apiErrorOf, documentTypeBadge } from "./transactionsLogic";

export type InvoicesModalProps = {
  show: boolean;
  onHide: () => void;
  direction: InvoiceDirection;
  account: Account;
  /** Açılışta seçili para birimi (sayfanın para birimi). */
  currency: string;
};

/** ZTO belge türü süzgeç seçenekleri (Müstahsil Makbuzu ÇIKAR). */
const DOC_TYPES: Record<InvoiceDirection, string[]> = {
  PURCHASE: ["ALIS_FATURASI", "E_FATURA", "HIZMET_FATURASI", "DIGER"],
  SALES: [
    "SATIS_FATURASI",
    "IADE_FATURASI",
    "SEVK_IRSALIYESI",
    "HIZMET_FATURASI",
    "E_FATURA",
    "E_ARSIV_FATURA",
  ],
};

const DOC_TYPE_NAMES: Record<string, string> = {
  ALIS_FATURASI: "Alış Faturası",
  E_FATURA: "E-Fatura",
  HIZMET_FATURASI: "Hizmet Faturası",
  DIGER: "Diğer",
  SATIS_FATURASI: "Satış Faturası",
  IADE_FATURASI: "İade Faturası",
  SEVK_IRSALIYESI: "Sevk İrsaliyesi",
  E_ARSIV_FATURA: "E-Arşiv Fatura",
};

const column = createColumnHelper<AccountInvoiceRow>();

/**
 * Alış / Satış Fatura Listesi (ZTO Transactions.cshtml:2919-3076 invoicesModal, :3104-3258
 * salesInvoicesModal): para birimi düğmeleri, belge türü / yansıma / tarih süzgeçleri; "Manuel Fatura
 * Kayıtları" (cari belgeleri) ve "Referanslı Faturalar" (alış, navlun, depo). `GET /accounts/{id}/invoices`.
 */
export function InvoicesModal({ show, onHide, direction, account, currency }: InvoicesModalProps) {
  const { t } = useTranslation("ztoFinans");
  const navigate = useNavigate();
  const snackbar = useZtoSnackbar();
  const sales = direction === "SALES";
  const [docType, setDocType] = useState("");
  const [reflected, setReflected] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedCurrency, setSelectedCurrency] = useState(currency);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AccountInvoiceRow | null>(null);

  useEffect(() => {
    if (show) setSelectedCurrency(currency);
  }, [show, currency]);

  const invoices = useAccountInvoices(show ? account.id : undefined, {
    direction,
    documentType: docType || undefined,
    reflected: reflected === "" ? undefined : reflected === "1",
    from: from || undefined,
    to: to || undefined,
  });
  const rows = useMemo(() => invoices.data ?? [], [invoices.data]);
  const currencies = useMemo(() => {
    const set = new Set(rows.map((r) => r.currency));
    set.add(selectedCurrency);
    return [...set].sort();
  }, [rows, selectedCurrency]);
  const visible = rows.filter((r) => r.currency === selectedCurrency);
  const manual = visible.filter((r) => r.kind === "ACCOUNT_DOCUMENT");
  const referenced = visible.filter((r) => r.kind !== "ACCOUNT_DOCUMENT");

  const cancel = useFinanceMutation((id: string) => cancelDocument(id), {
    onSuccess: () => {
      snackbar.show(t("transactions.invoices.deleted"), "success");
      setDeleting(null);
    },
  });

  const columns = useMemo(
    () => [
      column.accessor("invoiceDate", {
        header: t("transactions.invoices.date"),
        cell: (c) => formatDate(c.getValue()),
      }),
      column.accessor("number", { header: t("transactions.invoices.documentNo") }),
      column.accessor("documentTypeName", {
        header: t("transactions.invoices.documentType"),
        cell: (c) => (
          <span className={`badge ${documentTypeBadge(c.getValue()).className}`}>
            {c.getValue()}
          </span>
        ),
      }),
      column.accessor((r) => r.netAmount + r.vatAmount, {
        id: "gross",
        header: t("transactions.invoices.gross"),
        meta: { cellClassName: "text-right font-weight-bold" },
        cell: (c) => `${formatN2(c.getValue())} ${currencySymbol(c.row.original.currency)}`,
      }),
      column.accessor("totalAmount", {
        header: t("transactions.invoices.net"),
        meta: { cellClassName: "text-right font-weight-bold text-success" },
        cell: (c) => `${formatN2(c.getValue())} ${currencySymbol(c.row.original.currency)}`,
      }),
      column.accessor("reflected", {
        header: t(
          sales
            ? "transactions.invoices.salesReflectionCol"
            : "transactions.invoices.purchaseReflectionCol",
        ),
        meta: { cellClassName: "text-center" },
        cell: (c) =>
          c.row.original.status === "CANCELLED" ? (
            <span className="badge badge-secondary">{t("transactions.invoices.cancelled")}</span>
          ) : c.getValue() ? (
            <span className="badge badge-success">
              <i className="fas fa-check" aria-hidden="true" /> {t("transactions.invoices.yes")}
            </span>
          ) : (
            <span className="badge badge-danger">
              <i className="fas fa-times" aria-hidden="true" /> {t("transactions.invoices.no")}
            </span>
          ),
      }),
      column.display({
        id: "description",
        header: t("transactions.invoices.description"),
        cell: () => "-",
      }),
      column.display({
        id: "actions",
        header: t("transactions.invoices.detail"),
        enableSorting: false,
        meta: { cellClassName: "text-center text-nowrap" },
        cell: (c) => (
          <>
            <button
              type="button"
              className="btn btn-sm btn-info"
              aria-label={`${t("transactions.invoices.detail")} ${c.row.original.number}`}
              onClick={() => setDetailId(c.row.original.id)}
            >
              <i className="fas fa-eye" aria-hidden="true" />
            </button>
            {c.row.original.status === "OPEN" && (
              <button
                type="button"
                className="btn btn-sm btn-danger ml-1"
                aria-label={`${t("transactions.table.delete")} ${c.row.original.number}`}
                onClick={() => setDeleting(c.row.original)}
              >
                <i className="fas fa-trash" aria-hidden="true" />
              </button>
            )}
          </>
        ),
      }),
    ],
    [t, sales],
  );

  const openReferenced = (row: AccountInvoiceRow) => {
    if (row.kind === "FREIGHT_INVOICE")
      void apiDownload(`/shipment/invoices/${row.id}/pdf`, `${row.number}.pdf`);
    else if (row.kind === "WAREHOUSE_INVOICE")
      void apiDownload(`/warehouse/invoices/${row.id}/pdf`, `${row.number}.pdf`);
    else {
      onHide();
      navigate("/finance/invoices");
    }
  };

  const prefix = sales ? "salesInvoice" : "invoice";
  return (
    <>
      <ZtoModal
        show={show}
        onHide={onHide}
        rootId={sales ? "salesInvoicesModal" : "invoicesModal"}
        size="xl"
        scrollable
        headerClassName={sales ? "bg-success text-white" : "bg-info text-white"}
        closeButtonClassName="text-white"
        title={
          <>
            <i className="fas fa-file-invoice-dollar mr-2" aria-hidden="true" />
            {t(
              sales ? "transactions.invoices.salesTitle" : "transactions.invoices.purchaseTitle",
            )}{" "}
            -{" "}
            <span id={sales ? "salesInvoiceAccountName" : "invoiceAccountName"}>
              {account.name}
            </span>
          </>
        }
        footer={
          <button type="button" className="btn btn-secondary" onClick={onHide}>
            <i className="fas fa-times mr-1" aria-hidden="true" />
            {t("transactions.invoices.close")}
          </button>
        }
      >
        <div className="row mb-2">
          <div className="col-md-12">
            <span className="font-weight-bold small d-block" id={`${prefix}CurrencyLabel`}>
              <i className="fas fa-coins mr-1" aria-hidden="true" />{" "}
              {t("transactions.invoices.currency")}
            </span>
            <div
              id={`${prefix}ModalCurrencyButtons`}
              className="d-flex flex-wrap"
              style={{ gap: 4 }}
              role="group"
              aria-labelledby={`${prefix}CurrencyLabel`}
            >
              {currencies.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`btn btn-sm currency-btn${c === selectedCurrency ? " active" : ""}`}
                  aria-pressed={c === selectedCurrency}
                  onClick={() => setSelectedCurrency(c)}
                >
                  {currencySymbol(c)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="row mb-3">
          <div className="col-md-3">
            <label className="small font-weight-bold" htmlFor={`${prefix}DocTypeFilter`}>
              {t("transactions.invoices.documentType")}
            </label>
            <select
              id={`${prefix}DocTypeFilter`}
              className="form-control form-control-sm no-select2"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
            >
              <option value="">{t("transactions.invoices.all")}</option>
              {DOC_TYPES[direction].map((code) => (
                <option key={code} value={code}>
                  {DOC_TYPE_NAMES[code]}
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-3">
            <label className="small font-weight-bold" htmlFor={`${prefix}ReflectionFilter`}>
              {t(
                sales
                  ? "transactions.invoices.salesReflection"
                  : "transactions.invoices.purchaseReflection",
              )}
            </label>
            <select
              id={`${prefix}ReflectionFilter`}
              className="form-control form-control-sm no-select2"
              value={reflected}
              onChange={(e) => setReflected(e.target.value)}
            >
              <option value="">{t("transactions.invoices.all")}</option>
              <option value="1">
                {t(
                  sales
                    ? "transactions.invoices.salesReflected"
                    : "transactions.invoices.purchaseReflected",
                )}
              </option>
              <option value="0">
                {t(
                  sales
                    ? "transactions.invoices.salesNotReflected"
                    : "transactions.invoices.purchaseNotReflected",
                )}
              </option>
            </select>
          </div>
          <div className="col-md-3">
            <label className="small font-weight-bold" htmlFor={`${prefix}StartDate`}>
              {t("transactions.invoices.start")}
            </label>
            <input
              type="date"
              id={`${prefix}StartDate`}
              className="form-control form-control-sm"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="col-md-3">
            <label className="small font-weight-bold" htmlFor={`${prefix}EndDate`}>
              {t("transactions.invoices.end")}
            </label>
            <input
              type="date"
              id={`${prefix}EndDate`}
              className="form-control form-control-sm"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        {invoices.isPending && (
          <div className="text-center py-5" role="status">
            <div className="spinner-border text-info">
              <span className="sr-only">{t("transactions.loading")}</span>
            </div>
            <p className="mt-2">{t("transactions.invoices.loading")}</p>
          </div>
        )}
        {invoices.isError && (
          <div className="alert alert-danger" role="alert">
            {t("transactions.invoices.error", {
              message: apiErrorOf(invoices.error)?.message ?? "",
            })}
          </div>
        )}
        <div className="card">
          <div className="card-header bg-secondary text-white">
            <h6 className="mb-0">
              <i className="fas fa-keyboard mr-2" aria-hidden="true" />
              {t(
                sales
                  ? "transactions.invoices.manualSales"
                  : "transactions.invoices.manualPurchase",
              )}
            </h6>
          </div>
          <div className="card-body p-2">
            {manual.length > 0 ? (
              <ZtoDataTable
                id={sales ? "salesInvoicesTable" : "invoicesTable"}
                columns={columns}
                data={manual}
                getRowId={(r) => r.id}
                tableClassName="table table-hover table-bordered table-sm"
                pageLength={25}
                order={[{ id: "invoiceDate", desc: true }]}
              />
            ) : (
              !invoices.isPending && (
                <div className="alert alert-info text-center mb-0" role="status">
                  <i className="fas fa-info-circle mr-2" aria-hidden="true" />
                  {t(
                    sales
                      ? "transactions.invoices.emptySales"
                      : "transactions.invoices.emptyPurchase",
                  )}
                </div>
              )
            )}
          </div>
        </div>
        <div id={sales ? "referencedSalesInvoicesSection" : "referencedInvoicesSection"}>
          <hr className="mt-4 mb-3" />
          <div className="card">
            <div className="card-header bg-secondary text-white">
              <h6 className="mb-0">
                <i className="fas fa-link mr-2" aria-hidden="true" />
                {t("transactions.invoices.referenced")}
              </h6>
            </div>
            <div className="card-body p-2">
              {referenced.length > 0 ? (
                <div className="table-responsive">
                  <table
                    className="table table-hover table-bordered table-sm"
                    style={{ fontSize: 11 }}
                  >
                    <thead className="thead-light">
                      <tr>
                        <th scope="col">{t("transactions.invoices.type")}</th>
                        <th scope="col">{t("transactions.invoices.invoiceNo")}</th>
                        <th scope="col">{t("transactions.invoices.date")}</th>
                        <th scope="col">{t("transactions.invoices.account")}</th>
                        <th scope="col">{t("transactions.invoices.workplace")}</th>
                        <th scope="col">{t("transactions.invoices.amount")}</th>
                        <th scope="col" style={{ width: 80 }}>
                          {t("transactions.invoices.detail")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {referenced.map((r) => (
                        <tr key={`${r.kind}-${r.id}`}>
                          <td>
                            <span className="badge badge-primary">
                              {t(`transactions.invoices.kinds.${r.kind}`)}
                            </span>
                            {r.status === "CANCELLED" && (
                              <span className="badge badge-secondary ml-1">
                                {t("transactions.invoices.cancelled")}
                              </span>
                            )}
                          </td>
                          <td>{r.number || "-"}</td>
                          <td>{formatDate(r.invoiceDate)}</td>
                          <td>{account.name}</td>
                          <td>-</td>
                          <td>{`${formatN2(r.totalAmount)} ${currencySymbol(r.currency)}`}</td>
                          <td className="text-center">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-info"
                              aria-label={`${t("transactions.invoices.detail")} ${r.number}`}
                              onClick={() => openReferenced(r)}
                            >
                              <i className="fas fa-file-invoice-dollar" aria-hidden="true" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                !invoices.isPending && (
                  <div className="alert alert-info text-center mb-0" role="status">
                    <i className="fas fa-info-circle mr-2" aria-hidden="true" />
                    {t(
                      sales
                        ? "transactions.invoices.emptyReferencedSales"
                        : "transactions.invoices.emptyReferencedPurchase",
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </ZtoModal>
      <DocumentInfoModal documentId={detailId} onHide={() => setDetailId(null)} />
      <ZtoConfirmModal
        show={deleting !== null}
        variant="danger"
        title={t(
          sales ? "transactions.invoices.salesDeleteTitle" : "transactions.invoices.deleteTitle",
        )}
        message={t("transactions.invoices.deleteQuestion")}
        confirmText={t("transactions.invoices.deleteConfirm")}
        initialFocus="cancel"
        onCancel={() => setDeleting(null)}
        onConfirm={() => (deleting ? cancel.mutateAsync(deleting.id) : undefined)}
        onError={(e) =>
          snackbar.show(apiErrorOf(e)?.message ?? t("transactions.document.networkError"), "error")
        }
      />
    </>
  );
}

/** Manuel fatura kaydı detayı (belge alanları ve vergi kırılımı). */
function DocumentInfoModal({
  documentId,
  onHide,
}: {
  documentId: string | null;
  onHide: () => void;
}) {
  const { t } = useTranslation("ztoFinans");
  const doc = useAccountDocument(documentId ?? undefined);
  const d = doc.data;
  const rows: Array<[string, string]> = d
    ? [
        [t("transactions.detail.date"), formatDate(d.documentDate)],
        [t("transactions.detail.documentNo"), d.documentNo],
        [t("transactions.detail.documentType"), d.documentTypeName],
        [t("transactions.detail.due"), d.dueDate ? formatDate(d.dueDate) : "-"],
        [t("transactions.detail.amount"), `${formatN2(d.amount)} ${currencySymbol(d.currency)}`],
        [
          t("transactions.detail.method"),
          t(`translation:finance.paymentMethod.${d.paymentMethod}`, {
            defaultValue: d.paymentMethod,
          }),
        ],
        [t("transactions.detail.description"), d.description ?? "-"],
        ...(d.tax
          ? ([
              [t("transactions.document.discountAmount"), formatN2(d.tax.discountAmount)],
              [t("transactions.document.netExclVat"), formatN2(d.tax.netExclVat)],
              [t("transactions.document.vatAmount"), formatN2(d.tax.vatAmount)],
              [t("transactions.document.totalInclVat"), formatN2(d.tax.totalInclVat)],
              [t("transactions.document.withholding"), formatN2(d.tax.withholdingAmount)],
              [t("transactions.document.otherTaxes"), formatN2(d.tax.otherTaxesAmount)],
              [t("transactions.document.netPayable"), formatN2(d.tax.netPayable)],
            ] as Array<[string, string]>)
          : []),
      ]
    : [];
  return (
    <ZtoModal
      show={documentId !== null}
      onHide={onHide}
      className="transaction-detail-modal"
      size="lg"
      scrollable
      headerClassName="bg-secondary text-white"
      closeButtonClassName="text-white"
      title={
        <>
          <i className="fas fa-file-invoice mr-2" aria-hidden="true" />
          {t("transactions.detail.title")}
        </>
      }
      footer={
        <button type="button" className="btn btn-secondary" onClick={onHide}>
          {t("transactions.detail.close")}
        </button>
      }
    >
      {doc.isPending ? (
        <p className="text-center py-4" role="status">
          {t("transactions.detail.loading")}
        </p>
      ) : (
        <table className="table table-sm table-bordered mb-0">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th scope="row" className="font-weight-normal text-muted" style={{ width: "40%" }}>
                  {label}
                </th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ZtoModal>
  );
}
