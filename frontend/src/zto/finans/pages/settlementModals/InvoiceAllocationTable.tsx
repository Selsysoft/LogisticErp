import { useEffect, useMemo, useRef, useState } from "react";
import { useOpenInvoices } from "../../../../pages/finance/settlementApi";
import type { AllocationBody, OpenInvoice } from "../../../../pages/finance/types";
import { currencySymbol, formatN2 } from "../../../components";
import {
  clampToAmount,
  isExceeded,
  maxFor,
  remainingTotals,
  rowState,
  selectAll,
  selectAllState,
  setAmount,
  toggleRow,
  totalOf,
  type AllocationWarning,
} from "./allocationLogic";
import type { InvoiceAllocationTableProps } from "./index";
import { useModalText } from "./parts";
import { dottedDate, formatDecimalInput } from "./settlementFormLogic";

/*
 * "Fatura Eşleştirme (Opsiyonel)" (12.2a_TASARIM §5.9, OK-12.2a-2; ZTO CMP "Sipariş Tahsisi"
 * :766-835 + collections.js 1318-1660 akışının fatura uyarlaması). Açık kalemler yalnız "Faturaları
 * Yükle" tıklanınca (`GET /settlements/open-invoices`); düzenlemede kayıtlı eşleşme varsa kendiliğinden
 * yüklenir. Tutarlar ondalık metin (`decimal.ts`; float yok — Rev 1 F-5). ZTO uyarıları toast yerine
 * bölüm içi durum satırında (MWG persistent-toast-notifications: modalda toast yok).
 */

function omit(record: Record<string, string>, key: string): Record<string, string> {
  const next = { ...record };
  delete next[key];
  return next;
}

function pre(prefix: string, base: string): string {
  return prefix ? `${prefix}${base[0].toUpperCase()}${base.slice(1)}` : base;
}

export function InvoiceAllocationTable({
  type,
  accountId,
  branchId,
  currency,
  settlementAmount,
  excludeSettlementId,
  value,
  onChange,
  onExceededChange,
  disabled,
  idPrefix = "",
}: InvoiceAllocationTableProps) {
  const { tm } = useModalText();
  const payment = type === "PAYMENT";
  const [requested, setRequested] = useState(false);
  const [warning, setWarning] = useState<AllocationWarning | "selectAccount" | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Düzenlemede kayıtlı eşleşmeler görünsün diye tablo kendiliğinden yüklenir.
  const preloaded = useRef(false);
  useEffect(() => {
    if (!preloaded.current && value.length > 0) {
      preloaded.current = true;
      setRequested(true);
    }
  }, [value.length]);

  // Cari / iş yeri / para birimi değişince tablo kapanır (yeniden "Faturaları Yükle").
  const scopeKey = `${accountId ?? ""}|${branchId ?? ""}|${currency}`;
  const lastScope = useRef(scopeKey);
  useEffect(() => {
    if (lastScope.current === scopeKey) return;
    lastScope.current = scopeKey;
    setRequested(false);
    setWarning(null);
    setDrafts({});
  }, [scopeKey]);

  const params =
    accountId && branchId && currency
      ? { type, accountId, branchId, currency, excludeSettlementId }
      : null;
  const invoices = useOpenInvoices(params, { enabled: requested && !!params });
  const rows: OpenInvoice[] = useMemo(
    () => (requested ? (invoices.data ?? []) : []),
    [requested, invoices.data],
  );

  const exceeded = isExceeded(value, settlementAmount);
  const reported = useRef<boolean | null>(null);
  const report = useRef(onExceededChange);
  report.current = onExceededChange;
  useEffect(() => {
    if (reported.current === exceeded) return;
    reported.current = exceeded;
    report.current?.(exceeded);
  }, [exceeded]);

  // Tutar değişince seçili satırlar yeni üst sınırlara kırpılır (ZTO updateOrderMaxAmounts).
  const latestValue = useRef(value);
  latestValue.current = value;
  const latestChange = useRef(onChange);
  latestChange.current = onChange;
  useEffect(() => {
    if (rows.length === 0) return;
    const current = latestValue.current;
    const clamped = clampToAmount(rows, current, currency, settlementAmount);
    if (JSON.stringify(clamped) !== JSON.stringify(current)) latestChange.current(clamped);
  }, [rows, currency, settlementAmount]);

  const load = () => {
    if (!accountId) {
      setWarning("selectAccount");
      return;
    }
    setWarning(null);
    if (requested) void invoices.refetch();
    else setRequested(true);
  };

  const selected = (id: string) => value.find((row) => row.targetId === id);
  const all = selectAllState(rows, value, currency);
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // MWG checkbox: kısmi seçim yalnız DOM özelliğiyle (`indeterminate`) gösterilir.
    if (selectAllRef.current) selectAllRef.current.indeterminate = all.indeterminate;
  }, [all.indeterminate]);

  const apply = (next: AllocationBody[], nextWarning: AllocationWarning | null) => {
    setWarning(nextWarning);
    onChange(next);
  };

  const totals = remainingTotals(rows);
  const symbol = currencySymbol(currency);
  const titleId = pre(idPrefix, "invoiceAllocationTitle");
  const status = invoices.isFetching ? "loading" : invoices.isError ? "error" : null;

  return (
    <div className="field-group" id={pre(idPrefix, "invoiceAllocationSection")}>
      <div className="field-group-title" id={titleId}>
        <i className="fas fa-cart-arrow-down" aria-hidden="true" /> {tm("allocation.title")}
      </div>
      <div className="alert alert-info" style={{ fontSize: 11, marginBottom: 15 }}>
        <i className="fas fa-info-circle" aria-hidden="true" /> <strong>{tm("shared.note")}</strong>{" "}
        {payment ? tm("allocation.infoPayment") : tm("allocation.infoCollection")}
      </div>
      <div className="row mb-2">
        <div className="col-md-12">
          <button
            type="button"
            className="btn btn-sm btn-primary mb-2"
            onClick={load}
            disabled={disabled}
          >
            <i className="fas fa-sync" aria-hidden="true" /> {tm("allocation.load")}
          </button>
          <span
            id={pre(idPrefix, "invoicesLoadingStatus")}
            className="text-muted ml-2"
            style={{ fontSize: 12 }}
            role="status"
          >
            {status === "loading" && (
              <>
                <i className="fas fa-spinner fa-spin" aria-hidden="true" /> {tm("shared.loading")}
              </>
            )}
            {status === "error" && (
              <span className="text-danger">{tm("allocation.loadFailed")}</span>
            )}
            {warning && (
              <span className="text-warning" id={pre(idPrefix, "allocationRowWarning")}>
                <i className="fas fa-exclamation-triangle" aria-hidden="true" />{" "}
                {tm(`allocation.${warning}`)}
              </span>
            )}
          </span>
        </div>
      </div>

      {requested && totals.length > 0 && (
        <div
          id={pre(idPrefix, "orderCreditInfo")}
          className="alert alert-warning"
          style={{ fontSize: 12, marginBottom: 15 }}
        >
          <i className="fas fa-exclamation-triangle" aria-hidden="true" />{" "}
          <strong>
            {payment ? tm("allocation.remainingPayment") : tm("allocation.remainingCollection")}
          </strong>{" "}
          <span id={pre(idPrefix, "totalRemainingOrderAmount")}>
            {totals
              .map((total) => `${formatN2(total.total)} ${currencySymbol(total.currency)}`)
              .join(" | ")}
          </span>
        </div>
      )}

      {requested && rows.length > 0 && (
        <div
          id={pre(idPrefix, "invoicesContainer")}
          style={{ maxHeight: 400, overflowY: "auto", marginBottom: 15 }}
          role="region"
          aria-labelledby={titleId}
          tabIndex={0}
        >
          <table
            className="table table-sm table-bordered table-hover"
            style={{ fontSize: 12, marginBottom: 0 }}
          >
            <thead className="thead-light">
              <tr>
                <th style={{ width: 40, textAlign: "center" }}>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    id={pre(idPrefix, "selectAllInvoices")}
                    aria-label={tm("allocation.selectAll")}
                    checked={all.checked}
                    disabled={disabled || all.disabled}
                    onChange={(event) => {
                      setDrafts({});
                      apply(
                        selectAll(rows, event.target.checked, currency, settlementAmount),
                        null,
                      );
                    }}
                    aria-invalid={exceeded}
                    aria-describedby={exceeded ? pre(idPrefix, "allocationWarning") : undefined}
                  />
                </th>
                <th>{tm("allocation.number")}</th>
                <th>{tm("allocation.type")}</th>
                <th>{tm("allocation.dueDate")}</th>
                <th className="text-right">{tm("allocation.total")}</th>
                <th className="text-right">{tm("allocation.allocated")}</th>
                <th className="text-right">{tm("allocation.remaining")}</th>
                <th style={{ width: 180 }}>{tm("allocation.amount")}</th>
              </tr>
            </thead>
            <tbody id={pre(idPrefix, "invoicesTableBody")}>
              {rows.map((invoice) => {
                const state = rowState(invoice, currency);
                const row = selected(invoice.id);
                const rowSymbol = currencySymbol(invoice.currency);
                const max = maxFor(invoice, currency, settlementAmount);
                const inputId = pre(idPrefix, `invoiceAmount_${invoice.id}`);
                const draft = drafts[invoice.id];
                return (
                  <tr
                    key={invoice.id}
                    data-invoice-id={invoice.id}
                    className={state.hasRemaining ? undefined : "table-secondary"}
                  >
                    <td className="text-center align-middle">
                      <input
                        type="checkbox"
                        className="order-checkbox"
                        aria-label={tm("allocation.rowLabel", { number: invoice.number })}
                        checked={!!row}
                        disabled={disabled || !state.canAllocate}
                        onChange={(event) => {
                          setDrafts((current) => omit(current, invoice.id));
                          const result = toggleRow(
                            invoice,
                            event.target.checked,
                            value,
                            currency,
                            settlementAmount,
                          );
                          apply(result.selection, result.warning);
                        }}
                      />
                    </td>
                    <td className="align-middle">
                      <div>
                        <strong>{invoice.number}</strong>
                      </div>
                      <small className="text-muted">{dottedDate(invoice.invoiceDate)}</small>
                    </td>
                    <td className="align-middle">{invoice.typeName}</td>
                    <td className="align-middle">{dottedDate(invoice.dueDate)}</td>
                    <td className="text-right align-middle">
                      <span className="text-primary">
                        {formatN2(invoice.total)} {rowSymbol}
                      </span>
                    </td>
                    <td className="text-right align-middle">
                      <span className="text-success">
                        {formatN2(invoice.allocated)} {rowSymbol}
                      </span>
                    </td>
                    <td className="text-right align-middle">
                      <span
                        className={
                          state.hasRemaining ? "text-danger font-weight-bold" : "text-success"
                        }
                      >
                        {formatN2(invoice.remaining)} {rowSymbol}
                      </span>
                    </td>
                    <td className="align-middle">
                      <div className="input-group input-group-sm">
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          className="form-control form-control-sm order-amount-input"
                          id={inputId}
                          aria-label={tm("allocation.amountLabel", { number: invoice.number })}
                          placeholder="0.00"
                          disabled={disabled || !state.canAllocate}
                          value={draft ?? row?.amount ?? ""}
                          onChange={(event) =>
                            setDrafts((current) => ({
                              ...current,
                              [invoice.id]: formatDecimalInput(event.target.value, 2),
                            }))
                          }
                          onBlur={() => {
                            if (draft === undefined) return;
                            setDrafts((current) => omit(current, invoice.id));
                            const result = setAmount(
                              invoice,
                              draft,
                              value,
                              currency,
                              settlementAmount,
                            );
                            apply(result.selection, result.warning);
                          }}
                        />
                        <div className="input-group-append">
                          <span className="input-group-text" style={{ fontSize: 11 }}>
                            {rowSymbol}
                          </span>
                        </div>
                      </div>
                      <small className="text-muted" style={{ fontSize: 9, display: "block" }}>
                        {state.canAllocate || !state.hasRemaining ? (
                          <>
                            <i className="fas fa-arrow-up" aria-hidden="true" />{" "}
                            {tm("allocation.max", { amount: formatN2(max) })}
                          </>
                        ) : (
                          <>
                            <i className="fas fa-lock" aria-hidden="true" />{" "}
                            {tm("allocation.otherCurrency")}
                          </>
                        )}
                      </small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="table-secondary">
              <tr>
                <td colSpan={6} className="text-right">
                  <strong>{tm("allocation.totalLabel")}</strong>
                </td>
                <td colSpan={2}>
                  <span
                    id={pre(idPrefix, "totalAllocatedAmount")}
                    className="font-weight-bold text-success"
                  >
                    {formatN2(totalOf(value))}
                  </span>{" "}
                  <span className="currency-symbol">{symbol}</span>
                  <div
                    id={pre(idPrefix, "allocationWarning")}
                    className="text-danger"
                    style={{ fontSize: 11, marginTop: 3 }}
                    hidden={!exceeded}
                  >
                    <i className="fas fa-exclamation-circle" aria-hidden="true" />{" "}
                    {payment
                      ? tm("allocation.exceededPayment")
                      : tm("allocation.exceededCollection")}
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {requested && invoices.isSuccess && rows.length === 0 && (
        <div
          id={pre(idPrefix, "noInvoicesMessage")}
          className="alert alert-light text-center"
          style={{ fontSize: 12 }}
        >
          <i className="fas fa-inbox" aria-hidden="true" />{" "}
          {payment ? tm("allocation.emptyPayment") : tm("allocation.emptyCollection")}
        </div>
      )}
    </div>
  );
}
