import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState, type FocusEvent } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Trans, useTranslation } from "react-i18next";
import {
  createDocument,
  reviseDocument,
  useAccountBalances,
  useAccountDocument,
  useDocumentTypes,
  useFinanceMutation,
  useIdempotencyKey,
} from "../../../../pages/finance/accountApi";
import { today, useBranches, useCurrencies } from "../../../../pages/finance/common";
import type { Account, DocumentSide } from "../../../../pages/finance/types";
import { fieldA11yProps, fieldStateOf, useFormErrorAnnouncer } from "../../../a11y";
import {
  ZtoBranchSelect,
  ZtoModal,
  currencySymbol,
  formatN2,
  useZtoSnackbar,
} from "../../../components";
import {
  PAYMENT_METHODS,
  documentFormSchema,
  emptyDocumentValues,
  numberOf,
  remainingAfterSave,
  summaryError,
  toDocumentBody,
  valuesFromDocument,
  type DocumentFormValues,
} from "./documentLogic";
import {
  apiErrorOf,
  computeTax,
  documentTypeOptions,
  isCustomerType,
  pickInvoiceGap,
} from "./transactionsLogic";

export type DocumentModalProps = {
  show: boolean;
  onHide: () => void;
  /** PAYABLE = Borç Ekle (addDebtModal), RECEIVABLE = Alacak Ekle (addCreditModal). */
  side: DocumentSide;
  account: Account;
  /** Revize kipi: açık belgenin id'si (başlık "Güncelle"). */
  documentId?: string | null;
  defaultCurrency: string;
  defaultBranchId: string;
};

/**
 * Borç/Alacak Ekle modalı (ZTO Transactions.cshtml:1683-2075 addDebtModal, :1310-1680 addCreditModal;
 * Müstahsil ve araç seçimi ÇIKAR). DOM ZTO'daki gibi `.modal-content > .modal-header + form >
 * (.modal-body + .modal-footer)` olduğu için ZtoModal çıplak kipte. Gönderim `POST /accounts/{id}/documents`
 * (revize `POST /account-documents/{id}/revise`), modal açılışı başına Idempotency-Key.
 */
export function DocumentModal({
  show,
  onHide,
  side,
  account,
  documentId,
  defaultCurrency,
  defaultBranchId,
}: DocumentModalProps) {
  const { t } = useTranslation("ztoFinans");
  const snackbar = useZtoSnackbar();
  const debt = side === "PAYABLE";
  const p = debt ? "debt" : "credit";
  const customer = isCustomerType(account.type);
  const types = useDocumentTypes();
  const currencies = useCurrencies();
  const document = useAccountDocument(documentId ?? undefined);
  const idempotencyKey = useIdempotencyKey(show);
  const announcer = useFormErrorAnnouncer();
  const [serverError, setServerError] = useState<string | null>(null);

  const typeList = useMemo(
    () => documentTypeOptions(types.data ?? [], side, customer),
    [types.data, side, customer],
  );

  const defaults = useMemo(
    () =>
      emptyDocumentValues({
        date: today(),
        documentType: typeList.defaultCode,
        currency: defaultCurrency,
        branchId: defaultBranchId,
      }),
    [typeList.defaultCode, defaultCurrency, defaultBranchId],
  );

  const form = useForm<DocumentFormValues>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: defaults,
    mode: "onTouched",
  });
  const { register, handleSubmit, reset, formState, control, setValue } = form;

  // Açılışta boş form (revizede belge gelince değerleri). Tür listesi sonradan gelirse yalnız boş tür alanı
  // varsayılanla doldurulur; formu sıfırlamaz (kullanıcının girdisi ve gönderim durumu korunur).
  const defaultsRef = useRef(defaults);
  defaultsRef.current = defaults;
  useEffect(() => {
    if (!show) return;
    setServerError(null);
    announcer.clear();
    if (!documentId) reset(defaultsRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız açılışta
  }, [show, documentId]);
  useEffect(() => {
    if (show && documentId && document.data) reset(valuesFromDocument(document.data));
  }, [show, documentId, document.data, reset]);
  useEffect(() => {
    if (!show || documentId || !typeList.defaultCode) return;
    if (!form.getValues("documentType")) setValue("documentType", typeList.defaultCode);
  }, [show, documentId, typeList.defaultCode, form, setValue]);

  const values = useWatch({ control });
  const selectedType = typeList.options.find((x) => x.code === values.documentType);
  const invoiceSection = selectedType?.invoiceSection ?? false;
  const tax = computeTax(numberOf(values.amount ?? ""), {
    discountRate: numberOf(values.discountRate ?? ""),
    vatRate: numberOf(values.vatRate ?? ""),
    withholdingAmount: numberOf(values.withholdingAmount ?? ""),
    otherTaxesAmount: numberOf(values.otherTaxesAmount ?? ""),
  });
  const symbol = currencySymbol(values.currency ?? defaultCurrency);
  const footerNet = invoiceSection ? tax.netPayable : numberOf(values.amount ?? "") || 0;

  // 12.2 eksik fatura (§5.14 "fatura girişi"): seçilen tür fatura sayılıyorsa carinin iş yeri şirketindeki
  // eksik tutar ve bu belge kaydedilince kalan (yansıtılmayan belgede net ödenecek tutar düşer).
  const countsAsInvoice = selectedType?.countsAsInvoice === true;
  const branches = useBranches();
  const balances = useAccountBalances(show && countsAsInvoice ? account.id : undefined, {
    groupBy: "CURRENCY",
    companyId: null,
  });
  const branchCompany = branches.data?.find((b) => b.id === values.branchId)?.companyId ?? null;
  const gapRow = balances.data?.invoiceGaps
    ? pickInvoiceGap(
        balances.data.invoiceGaps,
        side,
        values.currency ?? defaultCurrency,
        branchCompany,
      )
    : null;
  const missing = gapRow?.missing ?? 0;
  const previousDoc = documentId ? document.data : undefined;
  const previousType = previousDoc
    ? (types.data ?? []).find((x) => x.side === side && x.code === previousDoc.documentType)
    : undefined;
  const remaining = remainingAfterSave(
    missing,
    {
      countsAsInvoice,
      reflect: invoiceSection ? values.reflectToLedger !== false : true,
      net: footerNet,
    },
    previousDoc && previousDoc.status === "OPEN"
      ? {
          countsAsInvoice: previousType?.countsAsInvoice === true,
          reflect: previousDoc.reflectToLedger,
          net: previousDoc.tax?.netPayable ?? previousDoc.amount,
        }
      : null,
  );
  // Canlı bölge pencere açıkken hep DOM'da (boşken Bootstrap `sr-only`); ilk eksik fatura notu
  // eklendiğinde duyurulur (F-12.2-R7). Görünür düzen değişmez.
  const showGapNote = countsAsInvoice && missing > 1;
  const gapNote = (
    <div
      className={showGapNote ? "col-12 mb-2" : "sr-only"}
      id={`${p}InvoiceGapNote`}
      role="status"
    >
      {showGapNote && (
        <>
          <small className="text-danger d-block">
            <i className="fas fa-exclamation-circle mr-1" aria-hidden="true" />
            {t("transactions.summary.invoiceGap", { amount: `${formatN2(missing)} ${symbol}` })}
          </small>
          <small className="text-danger d-block">
            {t("transactions.document.remainingAfterSave", {
              amount: `${formatN2(remaining)} ${symbol}`,
            })}
          </small>
        </>
      )}
    </div>
  );

  const mutation = useFinanceMutation(
    (body: DocumentFormValues) => {
      const request = toDocumentBody(body, side, invoiceSection);
      return documentId
        ? reviseDocument(documentId, request, idempotencyKey)
        : createDocument(account.id, request, idempotencyKey);
    },
    {
      onSuccess: () => {
        const typeName = selectedType?.name ?? "";
        const message = debt
          ? t(
              documentId
                ? "transactions.document.debtUpdated"
                : "transactions.document.debtCreated",
            )
          : documentId
            ? t("transactions.document.creditUpdated", { type: typeName })
            : t("transactions.document.creditCreated", { type: typeName });
        snackbar.show(message, "success");
        onHide();
      },
      onError: (error) => {
        const api = apiErrorOf(error);
        if (api) {
          const prefix = t(
            debt ? "transactions.document.debtError" : "transactions.document.creditError",
          );
          setServerError(`${prefix} ${api.message}`.trim());
        } else {
          setServerError(t("transactions.document.networkError"));
        }
      },
    },
  );

  const errors = formState.errors;
  const summary = formState.isSubmitted ? summaryError(errors) : null;
  const a11y = (name: keyof DocumentFormValues, id: string) =>
    fieldA11yProps(name, fieldStateOf(formState, name, { id }));
  // İş yeri ZtoBranchSelect: hata bağlantısı bileşenin yerel select'ine iletilir (F5).
  const branchA11y = a11y("branchId", debt ? "workPlaceID" : "creditWorkPlaceID");
  const errorText = (name: keyof DocumentFormValues, id: string) => {
    const state = fieldStateOf(formState, name, { id });
    const shown = (state.touched || state.submitted) && state.error;
    return (
      <div
        id={`${id}-error`}
        className="invalid-feedback"
        style={shown ? { display: "block" } : undefined}
      >
        {shown ? t(`transactions.document.${state.error as "fieldRequired"}`) : null}
      </div>
    );
  };
  const blurAnnounce = (name: keyof DocumentFormValues, label: string) => () => {
    const error = form.getFieldState(name).error?.message;
    announcer.announceFieldError(
      name,
      label,
      error ? t(`transactions.document.${error as "fieldRequired"}`) : null,
    );
  };
  const reg = (name: keyof DocumentFormValues, label: string) => {
    const r = register(name);
    return {
      ...r,
      onBlur: async (event: FocusEvent<HTMLElement>) => {
        await r.onBlur(event);
        blurAnnounce(name, label)();
      },
    };
  };
  const invalid = (name: keyof DocumentFormValues, id: string) =>
    a11y(name, id)["aria-invalid"] ? " is-invalid" : "";

  const titleId = debt ? "addDebtModalLabel" : "addCreditModalLabel";
  const title = documentId
    ? t("transactions.document.reviseTitle")
    : t(debt ? "transactions.document.debtTitle" : "transactions.document.creditTitle");
  const req = (
    <span className="text-danger" aria-hidden="true">
      *
    </span>
  );
  const readOnlyMoney = (id: string, value: number, extraClass = "bg-light") => (
    <div className="input-group">
      <input
        type="number"
        className={`form-control ${extraClass}`}
        id={id}
        value={value.toFixed(2)}
        readOnly
        aria-readonly="true"
      />
      <div className="input-group-append">
        <span
          className={`input-group-text ${p}-currency-symbol${extraClass.includes("bg-success") ? " bg-success text-white" : ""}`}
        >
          {symbol}
        </span>
      </div>
    </div>
  );

  const reflectBox = invoiceSection && (
    <div className="col-md-12 mb-3" id={`${p}ReflectionCheckboxContainer`}>
      <div className="custom-control custom-checkbox">
        <input
          type="checkbox"
          className="custom-control-input"
          id={`${p}ReflectionStatus`}
          {...register("reflectToLedger")}
        />
        <label className="custom-control-label font-weight-bold" htmlFor={`${p}ReflectionStatus`}>
          <i
            className={`fas fa-exchange-alt ${debt ? "text-primary" : "text-success"}`}
            aria-hidden="true"
          />{" "}
          {t(debt ? "transactions.document.reflectDebt" : "transactions.document.reflectCredit")}
        </label>
        <small className="form-text text-muted ml-4">
          {t(
            debt
              ? "transactions.document.reflectDebtHelp"
              : "transactions.document.reflectCreditHelp",
          )}
        </small>
      </div>
    </div>
  );

  const ids = debt
    ? {
        discountRate: "discountRate",
        discountAmount: "discountAmount",
        vatRate: "vatRate",
        excl: "totalPriceExcludingVAT",
        vat: "vatAmount",
        incl: "totalPriceIncludingVAT",
        withholding: "withholdingTaxAmount",
        other: "otherTaxesAmount",
        net: "netPayableAmountFatura",
      }
    : {
        discountRate: "creditDiscountRate",
        discountAmount: "creditDiscountAmount",
        vatRate: "creditVatRate",
        excl: "creditTotalPriceExcludingVAT",
        vat: "creditVatAmount",
        incl: "creditTotalPriceIncludingVAT",
        withholding: "creditWithholdingTaxAmount",
        other: "creditOtherTaxesAmount",
        net: "creditNetPayableAmount",
      };

  const invoiceFields = invoiceSection && (
    <div
      id={debt ? "faturaAlisSection" : "creditFaturaSection"}
      className={debt ? "col-12" : "col-12 mt-3"}
    >
      {!debt && reflectBox}
      <h6 className={debt ? "text-primary" : "text-success"}>
        <i className="fas fa-file-invoice-dollar" aria-hidden="true" />{" "}
        {t("transactions.document.invoiceInfo")}
      </h6>
      <div className="row">
        <div className="col-md-3 mb-2">
          <label htmlFor={ids.discountRate}>{t("transactions.document.discountRate")}</label>
          <input
            type="number"
            className={`form-control ${debt ? "fatura-input" : "credit-fatura-input"}`}
            id={ids.discountRate}
            step="0.01"
            min="0"
            max="100"
            inputMode="decimal"
            {...register("discountRate")}
          />
        </div>
        <div className="col-md-3 mb-2">
          <label htmlFor={ids.discountAmount}>{t("transactions.document.discountAmount")}</label>
          {readOnlyMoney(ids.discountAmount, tax.discountAmount)}
        </div>
        <div className="col-md-3 mb-2">
          <label htmlFor={ids.vatRate}>{t("transactions.document.vatRate")}</label>
          <input
            type="number"
            className={`form-control ${debt ? "fatura-input" : "credit-fatura-input"}`}
            id={ids.vatRate}
            step="0.01"
            min="0"
            max="100"
            inputMode="decimal"
            {...register("vatRate")}
          />
        </div>
        <div className="col-md-3 mb-2">
          <label htmlFor={ids.excl}>{t("transactions.document.netExclVat")}</label>
          {readOnlyMoney(ids.excl, tax.netExclVat)}
        </div>
      </div>
      <div className="row">
        <div className="col-md-3 mb-2">
          <label htmlFor={ids.vat}>{t("transactions.document.vatAmount")}</label>
          {readOnlyMoney(ids.vat, tax.vatAmount)}
        </div>
        <div className="col-md-3 mb-2">
          <label htmlFor={ids.incl}>{t("transactions.document.totalInclVat")}</label>
          {readOnlyMoney(ids.incl, tax.totalInclVat)}
        </div>
        <div className="col-md-3 mb-2">
          <label htmlFor={ids.withholding}>{t("transactions.document.withholding")}</label>
          <div className="input-group">
            <input
              type="number"
              className={`form-control ${debt ? "fatura-input" : "credit-fatura-input"}`}
              id={ids.withholding}
              step="0.01"
              min="0"
              inputMode="decimal"
              {...register("withholdingAmount")}
            />
            <div className="input-group-append">
              <span className={`input-group-text ${p}-currency-symbol`}>{symbol}</span>
            </div>
          </div>
        </div>
        <div className="col-md-3 mb-2">
          <label htmlFor={ids.other}>{t("transactions.document.otherTaxes")}</label>
          <div className="input-group">
            <input
              type="number"
              className={`form-control ${debt ? "fatura-input" : "credit-fatura-input"}`}
              id={ids.other}
              step="0.01"
              min="0"
              inputMode="decimal"
              {...register("otherTaxesAmount")}
            />
            <div className="input-group-append">
              <span className={`input-group-text ${p}-currency-symbol`}>{symbol}</span>
            </div>
          </div>
        </div>
      </div>
      {debt && (
        <div className="row">
          <div className="col-md-12 mb-2">
            <label htmlFor={ids.net}>
              <strong>{t("transactions.document.netPayable")}</strong>
            </label>
            {readOnlyMoney(ids.net, tax.netPayable, "bg-success text-white font-weight-bold")}
          </div>
        </div>
      )}
    </div>
  );

  const descriptionField = (
    <div className={debt ? "col-12 mb-3 mt-2" : "col-12 mb-3"}>
      <label htmlFor={`${p}Description`} className="font-weight-bold">
        <i className="fas fa-comment-alt" aria-hidden="true" />{" "}
        {t("transactions.document.description")}
      </label>
      <textarea
        className="form-control"
        id={`${p}Description`}
        rows={3}
        maxLength={500}
        placeholder={t(
          debt
            ? "transactions.document.debtDescriptionPlaceholder"
            : "transactions.document.creditDescriptionPlaceholder",
        )}
        {...register("description")}
      />
    </div>
  );

  return (
    <ZtoModal
      show={show}
      onHide={onHide}
      bare
      size="lg"
      scrollable
      rootId={debt ? "addDebtModal" : "addCreditModal"}
      ariaLabelledBy={titleId}
    >
      <div className="modal-header">
        <h5 className="modal-title" id={titleId}>
          <i className="fas fa-plus-circle mr-2" aria-hidden="true" />
          {title}
        </h5>
        <button
          type="button"
          className="close text-white"
          aria-label={t("modal.close")}
          onClick={onHide}
        >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <form
        id={debt ? "addDebtForm" : "addCreditForm"}
        noValidate
        onSubmit={handleSubmit((v) => {
          setServerError(null);
          mutation.mutate(v);
        })}
      >
        <div
          className="modal-body"
          style={{ maxHeight: "70vh", overflowY: "auto", overflowX: "hidden" }}
        >
          {(summary || serverError) && (
            <div className="alert alert-danger" role="alert">
              {serverError ?? t(`transactions.document.${summary!}`)}
            </div>
          )}
          <div className="row">
            <div className="col-md-3 mb-3">
              <label htmlFor={`${p}Date`} className="font-weight-bold">
                <i className="fas fa-calendar-alt" aria-hidden="true" />{" "}
                {t("transactions.document.date")} {req}
              </label>
              <input
                type="date"
                className={`form-control${invalid("documentDate", `${p}Date`)}`}
                required
                aria-required="true"
                autoFocus
                {...a11y("documentDate", `${p}Date`)}
                {...reg("documentDate", t("transactions.document.date"))}
              />
              {errorText("documentDate", `${p}Date`)}
            </div>
            <div className="col-md-3 mb-3">
              <label htmlFor={`${p}DocumentNo`} className="font-weight-bold">
                <i className="fas fa-file-alt" aria-hidden="true" />{" "}
                {t("transactions.document.documentNo")} {req}
              </label>
              <input
                type="text"
                className={`form-control${invalid("documentNo", `${p}DocumentNo`)}`}
                placeholder={t(
                  debt
                    ? "transactions.document.debtNoPlaceholder"
                    : "transactions.document.creditNoPlaceholder",
                )}
                required
                aria-required="true"
                maxLength={50}
                autoComplete="off"
                {...a11y("documentNo", `${p}DocumentNo`)}
                {...reg("documentNo", t("transactions.document.documentNo"))}
              />
              {errorText("documentNo", `${p}DocumentNo`)}
            </div>
            <div className="col-md-3 mb-3">
              <label htmlFor={`${p}DocumentType`} className="font-weight-bold">
                <i className="fas fa-tag" aria-hidden="true" />{" "}
                {t("transactions.document.documentType")} {req}
              </label>
              <select
                className={`form-control no-select2${invalid("documentType", `${p}DocumentType`)}`}
                required
                aria-required="true"
                style={{ cursor: "pointer" }}
                {...a11y("documentType", `${p}DocumentType`)}
                {...reg("documentType", t("transactions.document.documentType"))}
              >
                <option value="" disabled={debt && customer}>
                  {t("transactions.document.select")}
                </option>
                {typeList.options.map((type) => (
                  <option key={type.code} value={type.code}>
                    {type.name}
                  </option>
                ))}
              </select>
              {errorText("documentType", `${p}DocumentType`)}
            </div>
            <div className="col-md-3 mb-3">
              <label htmlFor={`${p}DueDate`} className="font-weight-bold">
                <i className="fas fa-calendar-check" aria-hidden="true" />{" "}
                {t(debt ? "transactions.document.debtDue" : "transactions.document.due")}
              </label>
              <input
                type="date"
                className="form-control"
                id={`${p}DueDate`}
                {...register("dueDate")}
              />
            </div>
            <div className="col-md-3 mb-3">
              <label htmlFor={`${p}Amount`} className="font-weight-bold">
                <i className="fas fa-money-bill" aria-hidden="true" />{" "}
                {t(debt ? "transactions.document.debtAmount" : "transactions.document.amount")}{" "}
                {req}
              </label>
              <div className="input-group">
                <input
                  type="number"
                  className={`form-control${invalid("amount", `${p}Amount`)}`}
                  placeholder="0.00"
                  step="0.01"
                  min="0.01"
                  inputMode="decimal"
                  required
                  aria-required="true"
                  {...a11y("amount", `${p}Amount`)}
                  {...reg(
                    "amount",
                    t(debt ? "transactions.document.debtAmount" : "transactions.document.amount"),
                  )}
                />
                <div className="input-group-append">
                  <span
                    className={`input-group-text ${p}-currency-symbol`}
                    id={`${p}CurrencySymbol`}
                  >
                    {symbol}
                  </span>
                </div>
              </div>
              {errorText("amount", `${p}Amount`)}
            </div>
            <div className="col-md-3 mb-3">
              <label htmlFor={`${p}CurrencyID`} className="form-label small">
                {t("transactions.document.currency")} <span aria-hidden="true">*</span>
              </label>
              <select
                className={`form-control no-select2${invalid("currency", `${p}CurrencyID`)}`}
                required
                aria-required="true"
                {...a11y("currency", `${p}CurrencyID`)}
                {...reg("currency", t("transactions.document.currency"))}
              >
                {(currencies.data ?? [{ code: defaultCurrency, name: defaultCurrency }]).map(
                  (c) => (
                    <option key={c.code} value={c.code}>
                      {`${c.name} (${currencySymbol(c.code)})`}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="col-md-3 mb-3">
              <label htmlFor={`${p}PaymentMethod`} className="font-weight-bold">
                <i className="fas fa-money-check-alt" aria-hidden="true" />{" "}
                {t("transactions.document.paymentMethod")} {req}
              </label>
              <select
                className={`form-control no-select2${invalid("paymentMethod", `${p}PaymentMethod`)}`}
                required
                aria-required="true"
                style={debt ? undefined : { cursor: "pointer" }}
                {...a11y("paymentMethod", `${p}PaymentMethod`)}
                {...reg("paymentMethod", t("transactions.document.paymentMethod"))}
              >
                <option value="">{t("transactions.document.select")}</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`translation:finance.paymentMethod.${m}`)}
                  </option>
                ))}
              </select>
              <small className="form-text text-muted">
                <i className="fas fa-info" aria-hidden="true" />{" "}
                {t("transactions.document.infoOnly")}
              </small>
              {errorText("paymentMethod", `${p}PaymentMethod`)}
            </div>
            <div className="col-md-3 mb-3">
              <label
                htmlFor={debt ? "workPlaceID" : "creditWorkPlaceID"}
                className="font-weight-bold"
              >
                <i className="fas fa-building" aria-hidden="true" />{" "}
                {t("transactions.document.workplace")} {req}
              </label>
              <ZtoBranchSelect
                id={debt ? "workPlaceID" : "creditWorkPlaceID"}
                value={values.branchId ?? ""}
                onChange={(id) =>
                  setValue("branchId", id, {
                    shouldValidate: formState.isSubmitted,
                    shouldTouch: true,
                  })
                }
                required
                className="form-control no-select2"
                placeholder={t("transactions.document.workplacePlaceholder")}
                aria-invalid={branchA11y["aria-invalid"]}
                aria-describedby={branchA11y["aria-describedby"]}
              />
              {errorText("branchId", debt ? "workPlaceID" : "creditWorkPlaceID")}
            </div>
            {debt && reflectBox}
            {debt && invoiceFields}
            {debt && gapNote}
            {descriptionField}
          </div>
          {!debt && invoiceFields}
          {!debt && <div className="row">{gapNote}</div>}
          <div className={debt ? "alert mb-0 alert-info" : "alert mb-0 alert-success"}>
            <i className="fas fa-info-circle mr-2" aria-hidden="true" />
            <strong>{t("transactions.document.note")}:</strong>{" "}
            <Trans
              t={t}
              i18nKey={debt ? "transactions.document.debtNote" : "transactions.document.creditNote"}
              values={{ name: account.name }}
              components={{ b: <b /> }}
            />
          </div>
        </div>
        <div className="modal-footer">
          {!debt && (
            <div className="mr-auto" style={{ minWidth: 240 }}>
              <label
                className="small font-weight-bold mb-1 d-block"
                htmlFor="creditFooterNetPayable"
              >
                <i className="fas fa-hand-holding-usd text-success" aria-hidden="true" />{" "}
                {t("transactions.document.netCollectable")}
              </label>
              <div className="input-group input-group-sm">
                <input
                  type="text"
                  className="form-control bg-success text-white font-weight-bold"
                  id="creditFooterNetPayable"
                  readOnly
                  aria-readonly="true"
                  value={formatN2(footerNet)}
                />
                <div className="input-group-append">
                  <span
                    className="input-group-text credit-currency-symbol bg-success text-white"
                    id="creditFooterNetSymbol"
                  >
                    {symbol}
                  </span>
                </div>
              </div>
            </div>
          )}
          <button type="button" className="btn btn-secondary" onClick={onHide}>
            <i className="fas fa-times mr-1" aria-hidden="true" />{" "}
            {t("transactions.document.cancel")}
          </button>
          <button
            type="submit"
            className={debt ? "btn btn-primary" : "btn btn-success"}
            id={debt ? "saveDebtBtn" : "saveCreditBtn"}
            disabled={mutation.isPending}
            aria-busy={mutation.isPending}
          >
            {mutation.isPending ? (
              <>
                <i className="fas fa-spinner fa-spin mr-1" aria-hidden="true" />{" "}
                {t("transactions.document.saving")}
              </>
            ) : (
              <>
                <i className="fas fa-save mr-1" aria-hidden="true" />{" "}
                {t("transactions.document.save")}
              </>
            )}
          </button>
        </div>
      </form>
      {announcer.region}
    </ZtoModal>
  );
}
