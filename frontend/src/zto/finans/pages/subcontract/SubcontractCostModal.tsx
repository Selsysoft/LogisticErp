import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "../../../../api/client";
import { useDocumentTypes } from "../../../../pages/finance/accountApi";
import { useCurrencies } from "../../../../pages/finance/common";
import type { SubcontractCostRow } from "../../../../pages/operations/types";
import { useSaveSubcontractCost } from "../../../../pages/operations/subcontractApi";
import { ZtoModal, currencySymbol, useZtoSnackbar } from "../../../components";
import { localToday } from "../expenses/expenseDates";
import {
  DESCRIPTION_MAX,
  DOCUMENT_NO_MAX,
  computeSubcontract,
  documentTypeOptions,
  formFromRow,
  toSaveRequest,
  validateSubcontract,
  type SubcontractField,
  type SubcontractForm,
} from "./subcontractLogic";

const INFO_STYLE = {
  background: "linear-gradient(135deg,#f1f5f9,#e2e8f0)",
  borderRadius: 8,
  padding: "10px 14px",
  borderLeft: "4px solid #667eea",
} as const;
const INFO_ROW = {
  display: "flex",
  gap: 14,
  flexWrap: "wrap",
  fontSize: 11,
  color: "#475569",
} as const;
const READONLY = { background: "#f8f9fa", color: "#6c757d" } as const;
const CURRENCY_SELECT = { maxWidth: 170, borderLeft: "1px solid #ced4da" } as const;
const RATE_INPUT = { maxWidth: 110 } as const;
const SYMBOL = {
  fontSize: 10,
  background: "#4e73df",
  color: "#fff",
  borderColor: "#4e73df",
} as const;
const SUBTITLE = { fontSize: 10 } as const;

const FIELD_IDS: Record<SubcontractField, string> = {
  currency: "CurrencyID",
  amount: "TransportCompanyPrice",
  exchangeRate: "ExchangeRate",
  vatAmount: "KDVAmount",
  withholdingAmount: "WithholdingTax",
  deductionAmount: "DeductionAmount",
  costDate: "CostDate",
};

type Props = {
  /** Düzenlenen etap; kapanış animasyonu bitene kadar korunur (onExited'de temizlenir). */
  row: SubcontractCostRow | null;
  show: boolean;
  onHide: () => void;
  onExited?: () => void;
};

const formKey = (row: SubcontractCostRow | null) =>
  row ? `${row.legId}:${row.costId ?? ""}:${row.status ?? ""}` : "";

/**
 * "Nakliye Firması & Fiyat Düzenle" (ZTO CompanySalesDetails.cshtml:762-965; 12.7_TASARIM §5.7).
 * Kaydet = `PUT …/legs/{legId}/subcontract-cost` (kaydet + cariye işle, Y6). Nakliye firması ve iş
 * yeri salt okunurdur (OK-12.7-5); kur ve belge tarihi ZTO'ya eklendi (OK-12.7-21). Açılışta tutar
 * alanına odaklanır; kapanınca odak tetikleyici düğmeye döner (react-bootstrap restoreFocus).
 */
export function SubcontractCostModal({ row, show, onHide, onExited }: Props) {
  const { t } = useTranslation("ztoFinans");
  const m = (key: string, options?: Record<string, unknown>) =>
    t(`salesTruckExpenses.modal.${key}`, options);
  const snackbar = useZtoSnackbar();
  const currencies = useCurrencies();
  const documentTypes = useDocumentTypes();
  const save = useSaveSubcontractCost();
  const today = localToday();
  const [form, setForm] = useState<SubcontractForm | null>(() =>
    row ? formFromRow(row, today) : null,
  );
  const [loadedKey, setLoadedKey] = useState(formKey(row));
  const [invalid, setInvalid] = useState<SubcontractField | null>(null);
  const [errorText, setErrorText] = useState("");
  // Başka satır açılınca form o satırdan yeniden kurulur (render sırasında durum ayarı).
  if (row && formKey(row) !== loadedKey) {
    setLoadedKey(formKey(row));
    setForm(formFromRow(row, today));
    setInvalid(null);
    setErrorText("");
  }

  if (!row || !form) {
    return null;
  }
  const current = form;
  const totals = computeSubcontract(current);
  const symbol = currencySymbol(current.currency) || "₺";
  const typeOptions = documentTypeOptions(documentTypes.data);
  const update = (patch: Partial<SubcontractForm>) => {
    setForm((value) => (value ? { ...value, ...patch } : value));
    // MWG forms: hata, kullanıcı alanı düzelttiğinde (input) temizlenir.
    if (invalid) {
      setInvalid(null);
      setErrorText("");
    }
  };
  const invalidProps = (field: SubcontractField) =>
    invalid === field
      ? { "aria-invalid": true as const, "aria-describedby": "subcontractFormError" }
      : {};

  async function submit(target: SubcontractCostRow) {
    const error = validateSubcontract(current);
    if (error) {
      const text = m(`errors.${error.key}`);
      setInvalid(error.field);
      setErrorText(text);
      snackbar.show(text, "warning");
      document.getElementById(FIELD_IDS[error.field])?.focus();
      return;
    }
    try {
      await save.mutateAsync({
        shipmentId: target.shipmentId,
        legId: target.legId,
        body: toSaveRequest(current),
      });
      snackbar.show(m("saved"), "success");
      onHide();
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : String(failure);
      snackbar.show(
        failure instanceof ApiError ? m("error", { message }) : m("serverError", { message }),
        "error",
      );
    }
  }

  const symbolSpan = (
    <span className="input-group-text modal-currency-symbol" style={SYMBOL} aria-hidden="true">
      {symbol}
    </span>
  );
  const readonlyAmount = (id: string, value: string, live = false) => (
    <input
      type="number"
      id={id}
      className="form-control"
      step="1"
      min="0"
      value={value}
      readOnly
      aria-live={live ? "polite" : undefined}
    />
  );

  const footer = (
    <>
      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onHide}>
        <i className="fas fa-times mr-1 me-1" aria-hidden="true" /> {m("cancel")}
      </button>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        id="saveSales"
        disabled={save.isPending}
        onClick={() => void submit(row)}
      >
        {save.isPending ? (
          <>
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />{" "}
            {m("saving")}
          </>
        ) : (
          <>
            <i className="fas fa-save mr-1 me-1" aria-hidden="true" /> {m("save")}
          </>
        )}
      </button>
    </>
  );

  return (
    <ZtoModal
      show={show}
      onHide={onHide}
      onExited={onExited}
      onEntered={() => document.getElementById(FIELD_IDS.amount)?.focus()}
      size="lg"
      rootId="salesModal"
      id="salesModal"
      headerClassName="modal-header-gradient"
      closeButtonClassName="text-white"
      closeDisabled={save.isPending}
      title={
        <span className="text-white mb-0">
          <i className="fas fa-edit mr-2 me-2" aria-hidden="true" /> {m("title")}
          <small className="text-white-50 mt-1 d-block" style={SUBTITLE}>
            {t(`salesTruckExpenses.transportMode.${row.transportMode}`)}
          </small>
        </span>
      }
      bodyClassName="p-0"
      footer={footer}
    >
      <div id="modalContent">
        <form
          id="salesForm"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit(row);
          }}
        >
          <div id="salesModalInfoSection" className="mb-3" style={INFO_STYLE}>
            <div style={INFO_ROW}>
              <div>
                <i className="fas fa-user text-primary mr-1" aria-hidden="true" />
                <strong>{m("info.customer")}</strong>{" "}
                <span id="info-customer">{row.customerName || "-"}</span>
              </div>
              <div>
                <i className="fas fa-hashtag text-secondary mr-1" aria-hidden="true" />
                <strong>{m("info.batch")}</strong>{" "}
                <span id="info-batch">{row.cargoDescription || "-"}</span>
              </div>
              <div>
                <i className="fas fa-file-invoice text-info mr-1" aria-hidden="true" />
                <strong>{m("info.invoice")}</strong>{" "}
                <span id="info-invoice">{row.freightInvoiceNumber || "-"}</span>
              </div>
              <div>
                <i className="fas fa-truck text-success mr-1" aria-hidden="true" />
                <strong>{m("info.plate")}</strong>{" "}
                <span id="info-plate">{row.vehiclePlate || "-"}</span>
              </div>
              <div>
                <i className="fas fa-truck-loading text-warning mr-1" aria-hidden="true" />
                <strong>{m("info.trailer")}</strong>{" "}
                <span id="info-dorse">{row.trailerPlate || "-"}</span>
              </div>
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-header">
              <i className="fas fa-truck mr-1 me-1" aria-hidden="true" /> {m("sections.transport")}
            </div>
            <div className="modal-section-body">
              <div className="row">
                <div className="col-md-6 mb-2">
                  <label className="modal-label" htmlFor="TransportType">
                    {m("transportMode")}
                  </label>
                  <input
                    type="text"
                    id="TransportType"
                    className="form-control"
                    readOnly
                    style={READONLY}
                    value={t(`salesTruckExpenses.transportMode.${row.transportMode}`)}
                  />
                </div>
                <div className="col-md-6 mb-2">
                  <label className="modal-label" htmlFor="TransportCompany">
                    {m("carrier")}
                  </label>
                  <select
                    id="TransportCompany"
                    className="form-control no-select2"
                    disabled
                    value={row.carrierAccountId ?? ""}
                  >
                    <option value={row.carrierAccountId ?? ""}>{row.carrierName ?? "-"}</option>
                  </select>
                </div>
              </div>
              <div className="row">
                <div className="col-md-12 mb-2">
                  <label className="modal-label" htmlFor="TransportCompanyPrice">
                    <i className="fas fa-money-bill-wave mr-1 me-1" aria-hidden="true" />{" "}
                    {m("amountCurrency")}
                  </label>
                  <div className="input-group input-group-sm">
                    <input
                      type="number"
                      id="TransportCompanyPrice"
                      className="form-control"
                      step="0.01"
                      min="0"
                      required
                      placeholder={m("amountPlaceholder")}
                      inputMode="decimal"
                      value={current.amount}
                      onChange={(event) => update({ amount: event.target.value })}
                      {...invalidProps("amount")}
                    />
                    <select
                      id="CurrencyID"
                      className="form-control no-select2"
                      style={CURRENCY_SELECT}
                      aria-label={m("currencyLabel")}
                      value={current.currency}
                      onChange={(event) =>
                        update({ currency: event.target.value, exchangeRate: "" })
                      }
                      {...invalidProps("currency")}
                    >
                      <option value="">{m("currencyPlaceholder")}</option>
                      {(currencies.data ?? [{ code: current.currency, name: current.currency }])
                        .filter((currency) => currency.code)
                        .map((currency) => (
                          <option key={currency.code} value={currency.code}>
                            {currencySymbol(currency.code)} - {currency.name}
                          </option>
                        ))}
                    </select>
                    {current.currency && current.currency !== "TRY" && (
                      <input
                        type="number"
                        id="ExchangeRate"
                        className="form-control"
                        style={RATE_INPUT}
                        step="0.0001"
                        min="0"
                        inputMode="decimal"
                        placeholder={m("rate")}
                        aria-label={m("rate")}
                        title={m("rateHint")}
                        value={current.exchangeRate}
                        onChange={(event) => update({ exchangeRate: event.target.value })}
                        {...invalidProps("exchangeRate")}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-header">
              <i className="fas fa-calculator mr-1 me-1" aria-hidden="true" />{" "}
              {m("sections.amounts")}
            </div>
            <div className="modal-section-body">
              <div className="row">
                <div className="col-6 col-md-3 mb-2">
                  <label className="modal-label" htmlFor="KDVAmount">
                    {m("vat")}
                  </label>
                  <div className="input-group input-group-sm">
                    <input
                      type="number"
                      id="KDVAmount"
                      className="form-control"
                      step="1"
                      min="0"
                      inputMode="decimal"
                      value={current.vatAmount}
                      onChange={(event) => update({ vatAmount: event.target.value })}
                      {...invalidProps("vatAmount")}
                    />
                    {symbolSpan}
                  </div>
                </div>
                <div className="col-6 col-md-3 mb-2">
                  <label className="modal-label" htmlFor="WithholdingTax">
                    {m("withholding")}
                  </label>
                  <div className="input-group input-group-sm">
                    <input
                      type="number"
                      id="WithholdingTax"
                      className="form-control"
                      step="1"
                      min="0"
                      inputMode="decimal"
                      value={current.withholdingAmount}
                      onChange={(event) => update({ withholdingAmount: event.target.value })}
                      {...invalidProps("withholdingAmount")}
                    />
                    {symbolSpan}
                  </div>
                </div>
                <div className="col-6 col-md-3 mb-2">
                  <label className="modal-label" htmlFor="TotalAmount">
                    {m("total")}
                  </label>
                  <div className="input-group input-group-sm">
                    {readonlyAmount("TotalAmount", totals.total)}
                    {symbolSpan}
                  </div>
                </div>
                <div className="col-6 col-md-3 mb-2">
                  <label className="modal-label" htmlFor="AdvanceAmount">
                    {m("advance")}
                  </label>
                  <div className="input-group input-group-sm">
                    {readonlyAmount("AdvanceAmount", "0")}
                    {symbolSpan}
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      disabled
                      title={m("advanceTitle")}
                    >
                      {m("advancePay")}
                    </button>
                  </div>
                </div>
              </div>
              <div className="row">
                <div className="col-6 col-md-3 mb-2">
                  <label className="modal-label" htmlFor="RemainingAmount">
                    {m("remaining")}
                  </label>
                  <div className="input-group input-group-sm">
                    {readonlyAmount("RemainingAmount", totals.remaining)}
                    {symbolSpan}
                  </div>
                </div>
                <div className="col-6 col-md-3 mb-2">
                  <label className="modal-label" htmlFor="DeductionAmount">
                    {m("deduction")}
                  </label>
                  <div className="input-group input-group-sm">
                    <input
                      type="number"
                      id="DeductionAmount"
                      className="form-control"
                      step="1"
                      min="0"
                      inputMode="decimal"
                      value={current.deductionAmount}
                      onChange={(event) => update({ deductionAmount: event.target.value })}
                      {...invalidProps("deductionAmount")}
                    />
                    {symbolSpan}
                  </div>
                </div>
                <div className="col-6 col-md-3 mb-2">
                  <label className="modal-label" htmlFor="BalanceAmount">
                    {m("balance")}
                  </label>
                  <div className="input-group input-group-sm">
                    {readonlyAmount("BalanceAmount", totals.balance, true)}
                    {symbolSpan}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-header">
              <i className="fas fa-file-alt mr-1 me-1" aria-hidden="true" />{" "}
              {m("sections.document")}
            </div>
            <div className="modal-section-body">
              <div className="row">
                <div className="col-md-12 mb-2">
                  <label className="modal-label" htmlFor="WorkPlaceID">
                    {m("workPlace")}
                  </label>
                  <select
                    className="form-control no-select2"
                    id="WorkPlaceID"
                    name="WorkPlaceID"
                    required
                    disabled
                    value={row.branchId}
                  >
                    <option value={row.branchId}>{row.branchName}</option>
                  </select>
                </div>
              </div>
              <div className="row">
                <div className="col-md-6 mb-2">
                  <label className="modal-label" htmlFor="debtDocumentNo">
                    {m("documentNo")}
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    id="debtDocumentNo"
                    placeholder={m("documentNoPlaceholder")}
                    maxLength={DOCUMENT_NO_MAX}
                    autoComplete="off"
                    spellCheck={false}
                    value={current.documentNo}
                    onChange={(event) => update({ documentNo: event.target.value })}
                  />
                </div>
                <div className="col-md-6 mb-2">
                  <label className="modal-label" htmlFor="debtDocumentType">
                    {m("documentType")}
                  </label>
                  <select
                    className="form-control no-select2"
                    id="debtDocumentType"
                    name="debtDocumentType"
                    value={current.documentType}
                    onChange={(event) => update({ documentType: event.target.value })}
                  >
                    <option value="">{m("documentTypePlaceholder")}</option>
                    {typeOptions.map((type) => (
                      <option key={type.code} value={type.code}>
                        {type.name}
                      </option>
                    ))}
                    {current.documentType &&
                      documentTypes.data &&
                      !typeOptions.some((type) => type.code === current.documentType) && (
                        <option value={current.documentType}>{current.documentType}</option>
                      )}
                  </select>
                </div>
              </div>
              <div className="row">
                <div className="col-md-6 mb-2">
                  <label className="modal-label" htmlFor="CostDate">
                    {m("costDate")}
                  </label>
                  <input
                    type="date"
                    className="form-control"
                    id="CostDate"
                    required
                    value={current.costDate}
                    onChange={(event) => update({ costDate: event.target.value })}
                    {...invalidProps("costDate")}
                  />
                </div>
              </div>
              <div className="row">
                <div className="col-md-12 mb-1">
                  <label className="modal-label" htmlFor="Description">
                    {m("description")}
                  </label>
                  <textarea
                    id="Description"
                    className="form-control form-control-sm"
                    rows={2}
                    maxLength={DESCRIPTION_MAX}
                    placeholder={m("descriptionPlaceholder")}
                    value={current.description}
                    onChange={(event) => update({ description: event.target.value })}
                  />
                </div>
              </div>
              <div id="subcontractFormError" className="small text-danger" role="alert">
                {errorText}
              </div>
            </div>
          </div>
        </form>
      </div>
    </ZtoModal>
  );
}
