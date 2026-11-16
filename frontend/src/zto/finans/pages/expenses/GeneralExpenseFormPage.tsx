import { CSSProperties, DragEvent, FormEvent, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiBlobUrl, apiGet } from "../../../../api/client";
import { newIdempotencyKey, useDocumentTypes } from "../../../../pages/finance/accountApi";
import { companyOfBranch } from "../../../../pages/finance/branchOptions";
import { useBranches, useCan, useCurrencies } from "../../../../pages/finance/common";
import {
  useCreateExpense,
  useExpense,
  useExpenseContextOptions,
  useExpenseFiles,
  useExpenseItems,
  useReviseExpense,
  useUploadExpenseDocument,
  type ExpenseContextSearchType,
} from "../../../../pages/finance/expenseApi";
import { useFundList } from "../../../../pages/finance/fundApi";
import type {
  ExpenseContextType,
  ExpenseDetail,
  ExpensePaymentMethod,
  ExpenseType,
} from "../../../../pages/finance/types";
import type { StoredFile } from "../../../../pages/crm/types";
import { errorIdOf } from "../../../a11y";
import {
  ZtoAccountSearch,
  ZtoAlert,
  ZtoBranchSelect,
  ZtoConfirmModal,
  ZtoSearchableSelect,
  useZtoSnackbar,
} from "../../../components";
import { errorCode, errorMessage } from "../../../components/definitionLogic";
import { currencySymbol, formatN2 } from "../../../format";
import { expenseItemInvoicesPath, generalExpensesPath } from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { ZtoPageLoading } from "../../ZtoSuspenseOutlet";
import { ExpenseLineCards } from "./ExpenseLineCards";
import { localToday } from "./expenseDates";
import {
  BASE_CURRENCY,
  CONTEXT_ICONS,
  CONTEXT_TYPES,
  DEPARTMENTS,
  FIELD_IDS,
  FILE_ACCEPT,
  INVOICE_NUMBER_MAX,
  DESCRIPTION_MAX,
  PAYMENT_METHODS,
  REASON_MAX,
  computeTotals,
  documentTypeOptions,
  emptyLine,
  formatFileSize,
  initialState,
  itemOptionsFor,
  serverErrorField,
  stateFromDetail,
  toRequest,
  validateFile,
  validateForm,
  type ExpenseFormState,
  type FormError,
  type LineField,
} from "./expenseFormLogic";

const TOTALS_SECTION: CSSProperties = { backgroundColor: "#e8f4f8", borderLeftColor: "#17a2b8" };
const TOTALS_TITLE: CSSProperties = { color: "#17a2b8" };
const GRAND_FIELD: CSSProperties = { backgroundColor: "#fff", fontWeight: "bold" };
const GRAND_TOTAL: CSSProperties = {
  backgroundColor: "#28a745",
  color: "black",
  fontWeight: "bold",
  fontSize: 16,
};
const BOLD: CSSProperties = { fontWeight: "bold" };
const ICON: CSSProperties = { fontSize: "4em" };
const POINTER: CSSProperties = { cursor: "pointer" };
const EDIT_BUTTON: CSSProperties = { width: "45%", maxWidth: 300 };
const SMALL_BUTTON: CSSProperties = { fontSize: 10 };
const SHOWN: CSSProperties = { display: "block" };
const LEGEND: CSSProperties = {
  border: 0,
  padding: 0,
  margin: 0,
  width: "auto",
  fontSize: "inherit",
};

type Mode = "new" | "edit";

/**
 * Genel Masraf formu (ZTO ProductionExpenses/Add + Edit; 12.7_TASARIM §5.6). Rota `genel-masraflar/yeni`
 * (PEA) ya da `genel-masraflar/:id/duzenle` (PEE). Düzenleme yerinde güncelleme değil "revise"dir:
 * eski kayıt ters çevrilir, yeni kayıt açılır (OK-12.7-17); yalnız POSTED kayıt düzenlenir.
 */
export function GeneralExpenseFormPage() {
  useZtoRootClass("zto-page-expense-form");
  const { id } = useParams();
  const { t } = useTranslation("ztoFinans");
  const items = useExpenseItems();
  const detail = useExpense(id);
  const [closed, setClosed] = useState(false);

  if (items.isPending || (id && detail.isPending)) return <ZtoPageLoading />;
  if (id) {
    const status = (detail.error as { status?: number } | null)?.status;
    const reversed = detail.data?.status === "REVERSED" || status === 404;
    if (reversed || detail.error || !detail.data) {
      return (
        <div className="col-md-12">
          <br />
          {!closed && (
            <ZtoAlert
              variant="danger"
              message={
                reversed
                  ? t("expenses.form.reversed")
                  : errorMessage(detail.error, t("expenses.form.loadFailed"))
              }
              onClose={() => setClosed(true)}
            />
          )}
          <Link to={generalExpensesPath()} className="btn btn-secondary m-1">
            <i className="fas fa-arrow-left" aria-hidden="true" /> {t("expenses.form.back")}
          </Link>
        </div>
      );
    }
    return <ExpenseForm key={detail.data.id} mode="edit" existing={detail.data} />;
  }
  return <ExpenseForm key="new" mode="new" />;
}

function ExpenseForm({ mode, existing }: { mode: Mode; existing?: ExpenseDetail }) {
  const { t, i18n } = useTranslation("ztoFinans");
  const f = (key: string, options?: Record<string, unknown>) => t(`expenses.form.${key}`, options);
  const navigate = useNavigate();
  const snackbar = useZtoSnackbar();
  const items = useExpenseItems();
  const types = useQuery({
    queryKey: ["finance", "expense-types"],
    queryFn: () => apiGet<ExpenseType[]>("/finance/expense-types"),
  });
  const currencies = useCurrencies();
  const documentTypes = useDocumentTypes();
  const branches = useBranches();
  const canPay = useCan("FINANCE_PAYMENT_CREATE");
  const create = useCreateExpense();
  const revise = useReviseExpense();
  const upload = useUploadExpenseDocument();
  const existingFiles = useExpenseFiles(existing?.id);

  const [state, setState] = useState<ExpenseFormState>(() =>
    existing ? stateFromDetail(existing, items.data) : initialState(localToday()),
  );
  /** Görünür hata metinleri (alan kimliği → metin): blur ve gönderimde yazılır, girişte silinir. */
  const [shown, setShown] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [removeDocument, setRemoveDocument] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [contextQuery, setContextQuery] = useState("");
  const idempotencyKey = useRef(newIdempotencyKey());
  const fileRef = useRef<HTMLInputElement>(null);

  const companyId = companyOfBranch(branches.data, state.branchId) ?? null;
  const fundKind = state.paymentMethod === "CASH" ? "CASH" : "BANK";
  const funds = useFundList(
    { kind: fundKind, active: true, companyId },
    { enabled: !!state.paymentMethod && state.paymentMethod !== "ACCOUNT" },
  );
  const searchType =
    state.contextType === "GENERAL" ? null : (state.contextType as ExpenseContextSearchType);
  const contextOptions = useExpenseContextOptions(searchType, contextQuery, state.branchId);

  const itemOptions = itemOptionsFor(items.data, state.expenseTypeId, existing?.expenseItemId);
  const selectedItem = items.data?.find((item) => item.id === state.expenseItemId);
  const selectedType = types.data?.find((type) => type.id === state.expenseTypeId);
  const docOptions = documentTypeOptions(documentTypes.data);
  const symbol = currencySymbol(state.currency);
  const totals = useMemo(() => computeTotals(state.lines), [state.lines]);
  const existingFile: StoredFile | undefined = existingFiles.data?.[0];
  const showExisting = mode === "edit" && !!existingFile && !removeDocument;

  const errorText = (error: FormError) => f(`errors.${error.message}`);
  const clear = (fieldId: string) =>
    setShown((prev) => {
      if (!(fieldId in prev)) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  const blur = (fieldId: string) => {
    const error = validateForm(state, mode).find((candidate) => candidate.field === fieldId);
    setShown((prev) => {
      const next = { ...prev };
      if (error) next[fieldId] = errorText(error);
      else delete next[fieldId];
      return next;
    });
  };
  const set = <K extends keyof ExpenseFormState>(key: K, value: ExpenseFormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
    clear(FIELD_IDS[key as keyof typeof FIELD_IDS] ?? String(key));
  };
  const a11y = (fieldId: string) => ({
    id: fieldId,
    "aria-invalid": !!shown[fieldId],
    "aria-describedby": shown[fieldId] ? errorIdOf(fieldId) : undefined,
    onBlur: () => blur(fieldId),
  });
  const errorFor = (fieldId: string) => (
    <small id={errorIdOf(fieldId)} className="text-danger" hidden={!shown[fieldId]}>
      {shown[fieldId]}
    </small>
  );
  const required = (
    <>
      {" "}
      <span className="text-danger">*</span>
    </>
  );

  // ---- satırlar --------------------------------------------------------------------------
  const changeLine = (index: number, field: LineField, value: string) => {
    setState((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
    }));
    clear(`detail-${index}-${field}`);
    clear(FIELD_IDS.lines);
  };
  const clearLineErrors = () =>
    setShown((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([key]) => !key.startsWith("detail-"))),
    );
  const addLine = () => {
    setState((prev) => ({ ...prev, lines: [...prev.lines, emptyLine(selectedItem?.defaultUnit)] }));
    clear(FIELD_IDS.lines);
  };
  const removeLine = (index: number) => {
    if (state.lines.length <= 1) {
      snackbar.show(f("lastLine"), "warning");
      return;
    }
    setState((prev) => ({ ...prev, lines: prev.lines.filter((_, i) => i !== index) }));
    clearLineErrors();
  };

  // ---- dosya -----------------------------------------------------------------------------
  const pickFile = (picked: File | undefined) => {
    if (!picked) return;
    const problem = validateFile(picked);
    if (problem) {
      snackbar.show(f(`errors.${problem}`), "error");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(picked);
  };
  const dropZoneDrag = (event: DragEvent<HTMLDivElement>, over: boolean | null) => {
    event.preventDefault();
    event.stopPropagation();
    if (over !== null && !busy) setDragging(over);
  };
  const viewExisting = async () => {
    if (!existingFile) return;
    const url = await apiBlobUrl(`/files/${encodeURIComponent(existingFile.id)}/content`);
    window.open(url, "_blank", "noopener");
  };

  // ---- gönderim --------------------------------------------------------------------------
  const focusField = (fieldId: string) => {
    const element = document.getElementById(fieldId);
    element?.focus();
    element?.scrollIntoView?.({ block: "center" });
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const errors = validateForm(state, mode);
    if (errors.length > 0) {
      const next: Record<string, string> = {};
      for (const error of errors) next[error.field] ??= errorText(error);
      setShown(next);
      const first = errors[0];
      if (first.field === FIELD_IDS.lines) snackbar.show(errorText(first), "error");
      focusField(first.field);
      return;
    }
    let body;
    try {
      body = toRequest(state);
    } catch {
      snackbar.show(f("prepareFailed"), "error");
      return;
    }
    setBusy(true);
    try {
      const saved =
        mode === "new" || !existing
          ? await create.mutateAsync({ body, idempotencyKey: idempotencyKey.current })
          : await revise.mutateAsync({
              id: existing.id,
              body: {
                expense: body,
                reason: state.reason.trim(),
                // ZTO PEE: "Yeni doküman yüklerseniz eskisi silinir."
                removeDocument: removeDocument || !!file,
              },
              idempotencyKey: idempotencyKey.current,
            });
      let message = f(mode === "new" ? "created" : "updated");
      let kind: "success" | "warning" = "success";
      if (file) {
        try {
          await upload.mutateAsync({ expenseId: saved.id, file });
          message += ` ${f("uploaded")}`;
        } catch (error) {
          message += ` ${f("uploadFailed", { message: errorMessage(error, "") })}`;
          kind = "warning";
        }
      }
      snackbar.show(message, kind);
      navigate(expenseItemInvoicesPath(saved.expenseItemId));
    } catch (error) {
      setBusy(false);
      const code = errorCode(error);
      const key = `expenses.form.errors.${code}`;
      const text =
        code && i18n.exists(key, { ns: "ztoFinans" })
          ? t(key)
          : errorMessage(error, f("saveFailed"));
      const field = serverErrorField(code, state.lines);
      if (field) {
        setShown((prev) => ({ ...prev, [field]: text }));
        focusField(field);
      } else {
        snackbar.show(text, "error");
      }
    }
  };

  // ---- seçim olayları -------------------------------------------------------------------
  const changeType = (value: string) => {
    setState((prev) => ({ ...prev, expenseTypeId: value, expenseItemId: "" }));
    clear(FIELD_IDS.expenseTypeId);
  };
  const changePayment = (value: ExpensePaymentMethod | "") => {
    setState((prev) => ({
      ...prev,
      paymentMethod: value,
      supplierAccountId: "",
      supplierLabel: "",
      fundAccountId: "",
    }));
    clear(FIELD_IDS.paymentMethod);
    clear(FIELD_IDS.supplierAccountId);
    clear(FIELD_IDS.fundAccountId);
  };
  const changeBranch = (value: string) => {
    // Kasa/banka şirkete bağlıdır: şirket değişince seçim temizlenir.
    const sameCompany =
      companyOfBranch(branches.data, value) === companyOfBranch(branches.data, state.branchId);
    setState((prev) => ({
      ...prev,
      branchId: value,
      fundAccountId: sameCompany ? prev.fundAccountId : "",
    }));
    clear(FIELD_IDS.branchId);
  };
  const changeCurrency = (value: string) => {
    setState((prev) => ({
      ...prev,
      currency: value,
      exchangeRate: value === BASE_CURRENCY ? "" : prev.exchangeRate,
    }));
    clear(FIELD_IDS.currency);
    clear(FIELD_IDS.exchangeRate);
  };
  const changeContextType = (value: ExpenseContextType) => {
    setState((prev) => ({ ...prev, contextType: value, contextId: "", contextLabel: "" }));
    setContextQuery("");
    clear(FIELD_IDS.contextId);
  };

  const contextItems = useMemo(() => {
    const rows = (contextOptions.data ?? []).map((row) => ({ value: row.id, label: row.label }));
    if (state.contextId && !rows.some((row) => row.value === state.contextId)) {
      rows.unshift({ value: state.contextId, label: state.contextLabel || state.contextId });
    }
    return rows;
  }, [contextOptions.data, state.contextId, state.contextLabel]);

  const title = selectedType?.name ?? existing?.expenseTypeName ?? f("typeTitleEmpty");
  const titleColor = state.expenseTypeId ? "#28a745" : "#6c757d";
  const sectionTitle = (text: string) => (
    <legend style={LEGEND}>
      <h5>{text}</h5>
    </legend>
  );

  return (
    <div className="col-md-12">
      <br />
      <br />
      <ol className="breadcrumb">
        <li>
          <Link to={generalExpensesPath()}>{f("breadcrumbRoot")}</Link>
        </li>
        <li className="divider" />
        {mode === "edit" && existing ? (
          <>
            <li>
              <Link to={expenseItemInvoicesPath(existing.expenseItemId)}>
                {f("breadcrumbInvoices")}
              </Link>
            </li>
            <li className="divider" />
            <li className="active">{f("breadcrumbEdit")}</li>
          </>
        ) : (
          <li className="active">{f("breadcrumbNew")}</li>
        )}
      </ol>
      {mode === "edit" && existing ? (
        <h6>
          {f("titleEdit")} | {existing.invoiceNumber ?? ""}
        </h6>
      ) : (
        <h5>{f("titleNew")}</h5>
      )}
      <hr />

      <form noValidate onSubmit={onSubmit} aria-busy={busy}>
        <div className="row">
          {/* Sol Üst: Görsel */}
          <div className="col-md-3">
            <div className="expense-type-icon" id="expenseTypeIcon">
              <i
                className={CONTEXT_ICONS[state.contextType]}
                style={{ ...ICON, color: titleColor }}
                aria-hidden="true"
              />
              <p id="expenseTypeTitle" style={{ color: titleColor }}>
                {title}
              </p>
            </div>
          </div>

          {/* Masraf Bilgileri */}
          <div className="col-md-3">
            <fieldset className="form-section">
              {sectionTitle(f("sectionInfo"))}
              <label htmlFor={FIELD_IDS.expenseTypeId}>
                {f("expenseType")}
                {required}
              </label>
              <div className="input-group">
                <select
                  {...a11y(FIELD_IDS.expenseTypeId)}
                  className="form-control"
                  required
                  value={state.expenseTypeId}
                  disabled={busy}
                  onChange={(event) => changeType(event.target.value)}
                >
                  <option value="">{f("expenseTypePlaceholder")}</option>
                  {(types.data ?? []).map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
                <span className="input-group-text" title={f("expenseTypeHint")}>
                  <i className="fas fa-info-circle" aria-hidden="true" />
                  <span className="sr-only">{f("expenseTypeHint")}</span>
                </span>
              </div>
              {errorFor(FIELD_IDS.expenseTypeId)}

              <div className="mt-3">
                <label htmlFor={FIELD_IDS.expenseItemId}>
                  {f("expenseItem")}
                  {required}
                </label>
                <div className="category-wrapper">
                  <select
                    {...a11y(FIELD_IDS.expenseItemId)}
                    className="form-control category-select"
                    required
                    value={state.expenseItemId}
                    disabled={busy}
                    onChange={(event) => set("expenseItemId", event.target.value)}
                  >
                    <option value="">
                      {state.expenseTypeId ? f("expenseItemPlaceholder") : f("expenseItemPickType")}
                    </option>
                    {itemOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                {errorFor(FIELD_IDS.expenseItemId)}
              </div>

              <div className="mt-3">
                <label htmlFor={FIELD_IDS.invoiceNumber}>{f("invoiceNumber")}</label>
                <input
                  {...a11y(FIELD_IDS.invoiceNumber)}
                  className="form-control"
                  placeholder={f("invoiceNumberPlaceholder")}
                  maxLength={INVOICE_NUMBER_MAX}
                  autoComplete="off"
                  spellCheck={false}
                  value={state.invoiceNumber}
                  disabled={busy}
                  onChange={(event) => set("invoiceNumber", event.target.value)}
                />
                {errorFor(FIELD_IDS.invoiceNumber)}
              </div>

              <div className="mt-3">
                <label htmlFor={FIELD_IDS.paymentMethod}>
                  {f("paymentMethod")}
                  {required}
                </label>
                <select
                  {...a11y(FIELD_IDS.paymentMethod)}
                  className="form-control"
                  required
                  value={state.paymentMethod}
                  disabled={busy}
                  onChange={(event) => changePayment(event.target.value as ExpensePaymentMethod)}
                >
                  {PAYMENT_METHODS.map((method) => (
                    <option
                      key={method}
                      value={method}
                      disabled={method !== "ACCOUNT" && !canPay}
                      title={method !== "ACCOUNT" && !canPay ? f("paymentNoPermission") : undefined}
                    >
                      {f(`paymentMethodOptions.${method}`)}
                    </option>
                  ))}
                </select>
                {errorFor(FIELD_IDS.paymentMethod)}
              </div>

              {state.paymentMethod === "ACCOUNT" ? (
                <div className="mt-3">
                  <label id="supplierAccountLabel" htmlFor={FIELD_IDS.supplierAccountId}>
                    {f("supplier")}
                    {required}
                  </label>
                  <ZtoAccountSearch
                    variant="listGroup"
                    ids={{ input: FIELD_IDS.supplierAccountId }}
                    placeholder={f("supplierPlaceholder")}
                    emptyText={f("supplierEmpty")}
                    minLength={2}
                    delayMs={300}
                    types={["SUPPLIER", "CARRIER", "CUSTOMER", "BANK", "INTERCOMPANY"]}
                    value={
                      state.supplierAccountId
                        ? { id: state.supplierAccountId, label: state.supplierLabel }
                        : null
                    }
                    ariaLabelledBy="supplierAccountLabel"
                    labelOf={(hit) => `${hit.code} - ${hit.name}`}
                    onSelect={(hit) => {
                      setState((prev) => ({
                        ...prev,
                        supplierAccountId: hit.id,
                        supplierLabel: `${hit.code} - ${hit.name}`,
                      }));
                      clear(FIELD_IDS.supplierAccountId);
                    }}
                    onClear={() =>
                      setState((prev) => ({ ...prev, supplierAccountId: "", supplierLabel: "" }))
                    }
                    onInputChange={() =>
                      setState((prev) =>
                        prev.supplierAccountId
                          ? { ...prev, supplierAccountId: "", supplierLabel: "" }
                          : prev,
                      )
                    }
                  />
                  {errorFor(FIELD_IDS.supplierAccountId)}
                </div>
              ) : (
                <div className="mt-3">
                  <label htmlFor={FIELD_IDS.fundAccountId}>
                    {f("fund")}
                    {required}
                  </label>
                  <select
                    {...a11y(FIELD_IDS.fundAccountId)}
                    className="form-control"
                    required
                    value={state.fundAccountId}
                    disabled={busy}
                    onChange={(event) => set("fundAccountId", event.target.value)}
                  >
                    <option value="">{f("fundPlaceholder")}</option>
                    {(funds.data ?? []).map((fund) => (
                      <option key={fund.id} value={fund.id}>
                        {fund.name} ({fund.currency})
                      </option>
                    ))}
                  </select>
                  {errorFor(FIELD_IDS.fundAccountId)}
                </div>
              )}
            </fieldset>
          </div>

          {/* Doküman Yükleme */}
          <div className="col-md-3">
            <fieldset className="form-section">
              {sectionTitle(f("sectionDocument"))}
              {showExisting && existingFile && (
                <div className="existing-document">
                  <div className="document-info">
                    <div className="document-icon">
                      <i className="fas fa-file" aria-hidden="true" />
                    </div>
                    <div className="document-details">
                      <div className="document-name">{f("existingDocument")}</div>
                      <div className="document-size">{existingFile.fileName}</div>
                    </div>
                  </div>
                  <div className="d-flex gap-2 justify-content-center">
                    <button
                      type="button"
                      style={SMALL_BUTTON}
                      className="btn btn-sm btn-success m-1"
                      onClick={() => void viewExisting()}
                    >
                      <i className="fas fa-eye" aria-hidden="true" /> {f("viewDocument")}
                    </button>
                    <button
                      type="button"
                      style={SMALL_BUTTON}
                      className="btn btn-sm btn-danger m-1"
                      disabled={busy}
                      onClick={() => setConfirmRemove(true)}
                    >
                      <i className="fas fa-trash" aria-hidden="true" /> {f("removeDocument")}
                    </button>
                  </div>
                </div>
              )}

              <input
                ref={fileRef}
                type="file"
                id="DocumentFileInput"
                name="DocumentFile"
                accept={FILE_ACCEPT}
                style={{ display: "none" }}
                tabIndex={-1}
                aria-hidden="true"
                onChange={(event) => pickFile(event.target.files?.[0])}
              />
              <div
                className={`document-upload-area${dragging ? " dragover" : ""}`}
                id="DocumentUploadArea"
                role="button"
                tabIndex={busy ? -1 : 0}
                aria-label={f("uploadPickLabel")}
                aria-describedby="DocumentUploadHelp"
                aria-disabled={busy}
                onClick={() => !busy && fileRef.current?.click()}
                onKeyDown={(event) => {
                  if (!busy && (event.key === "Enter" || event.key === " ")) {
                    event.preventDefault();
                    fileRef.current?.click();
                  }
                }}
                onDragEnter={(event) => dropZoneDrag(event, true)}
                onDragOver={(event) => dropZoneDrag(event, true)}
                onDragLeave={(event) => dropZoneDrag(event, false)}
                onDrop={(event) => {
                  dropZoneDrag(event, false);
                  if (!busy) pickFile(event.dataTransfer?.files?.[0]);
                }}
              >
                <div className="upload-icon">
                  <i className="fas fa-cloud-upload-alt" aria-hidden="true" />
                </div>
                <div className="upload-text">
                  <span id="UploadMainText">
                    {file
                      ? f("uploadChange")
                      : mode === "edit" && existingFile
                        ? f("uploadNew")
                        : f("uploadMain")}
                  </span>
                </div>
                <div className="upload-subtext">{f("uploadFormats")}</div>
                <div className="allowed-formats">{f("uploadMax")}</div>
              </div>

              <div
                className="document-preview"
                id="DocumentPreview"
                style={file ? SHOWN : undefined}
              >
                {file && (
                  <div className="document-info">
                    <div className="document-icon">
                      <i className="fas fa-file-invoice" aria-hidden="true" />
                    </div>
                    <div className="document-details">
                      <div className="document-name" id="DocumentName">
                        {file.name}
                      </div>
                      <div className="document-size" id="DocumentSize">
                        {formatFileSize(file.size)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="remove-document btn btn-link p-0"
                      aria-label={f("removeFile")}
                      disabled={busy}
                      onClick={() => {
                        setFile(null);
                        if (fileRef.current) fileRef.current.value = "";
                      }}
                    >
                      <i className="fas fa-times" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>

              <small className="text-muted" id="DocumentUploadHelp">
                {mode === "edit" && existingFile ? f("uploadHelpEdit") : f("uploadHelp")}
              </small>
            </fieldset>
          </div>

          {/* Genel Bilgiler */}
          <div className="col-md-3">
            <fieldset className="form-section">
              {sectionTitle(f("sectionGeneral"))}
              <div className="mb-3">
                <label htmlFor={FIELD_IDS.currency}>
                  {f("currency")}
                  {required}
                </label>
                <select
                  {...a11y(FIELD_IDS.currency)}
                  className="form-control"
                  required
                  value={state.currency}
                  disabled={busy}
                  onChange={(event) => changeCurrency(event.target.value)}
                >
                  <option value="">{f("currencyPlaceholder")}</option>
                  {(currencies.data ?? [{ code: BASE_CURRENCY, name: BASE_CURRENCY }]).map(
                    (currency) => (
                      <option key={currency.code} value={currency.code}>
                        {currency.code} - {currency.name}
                      </option>
                    ),
                  )}
                </select>
                {errorFor(FIELD_IDS.currency)}
              </div>

              {state.currency && state.currency !== BASE_CURRENCY && (
                <div className="mb-3">
                  <label htmlFor={FIELD_IDS.exchangeRate}>{f("exchangeRate")}</label>
                  <input
                    {...a11y(FIELD_IDS.exchangeRate)}
                    aria-describedby={
                      shown[FIELD_IDS.exchangeRate]
                        ? `${errorIdOf(FIELD_IDS.exchangeRate)} ExchangeRateHint`
                        : "ExchangeRateHint"
                    }
                    type="number"
                    step="0.0001"
                    min="0"
                    inputMode="decimal"
                    className="form-control"
                    value={state.exchangeRate}
                    disabled={busy}
                    onChange={(event) => set("exchangeRate", event.target.value)}
                  />
                  <small className="text-muted" id="ExchangeRateHint">
                    {f("exchangeRateHint")}
                  </small>
                  {errorFor(FIELD_IDS.exchangeRate)}
                </div>
              )}

              <div className="mb-3">
                <label htmlFor={FIELD_IDS.department}>
                  {f("department")}
                  {required}
                </label>
                <select
                  {...a11y(FIELD_IDS.department)}
                  className="form-control"
                  required
                  value={state.department}
                  disabled={busy}
                  onChange={(event) =>
                    set("department", event.target.value as ExpenseFormState["department"])
                  }
                >
                  <option value="">{f("departmentPlaceholder")}</option>
                  {DEPARTMENTS.map((department) => (
                    <option key={department} value={department}>
                      {t(`expenses.department.${department}`)}
                    </option>
                  ))}
                </select>
                {errorFor(FIELD_IDS.department)}
              </div>

              <div className="mb-3">
                <label htmlFor={FIELD_IDS.branchId}>
                  {f("branch")}
                  {required}
                </label>
                <ZtoBranchSelect
                  id={FIELD_IDS.branchId}
                  name="WorkPlaceID"
                  className="form-control"
                  required
                  value={state.branchId}
                  onChange={changeBranch}
                  disabled={busy}
                  defaultToUserBranch={mode === "new"}
                  placeholder={f("branchPlaceholder")}
                  aria-invalid={!!shown[FIELD_IDS.branchId]}
                  aria-describedby={
                    shown[FIELD_IDS.branchId] ? errorIdOf(FIELD_IDS.branchId) : undefined
                  }
                />
                {errorFor(FIELD_IDS.branchId)}
              </div>

              <div className="mb-3">
                <label htmlFor={FIELD_IDS.invoiceDate}>
                  {f("invoiceDate")}
                  {required}
                </label>
                <input
                  {...a11y(FIELD_IDS.invoiceDate)}
                  className="form-control"
                  type="date"
                  required
                  value={state.invoiceDate}
                  disabled={busy}
                  onChange={(event) => set("invoiceDate", event.target.value)}
                />
                {errorFor(FIELD_IDS.invoiceDate)}
              </div>

              <div className="mb-3">
                <label htmlFor={FIELD_IDS.dueDate}>{f("dueDate")}</label>
                <input
                  {...a11y(FIELD_IDS.dueDate)}
                  className="form-control"
                  type="date"
                  min={state.invoiceDate || undefined}
                  value={state.dueDate}
                  disabled={busy}
                  onChange={(event) => set("dueDate", event.target.value)}
                />
                {errorFor(FIELD_IDS.dueDate)}
              </div>
            </fieldset>
          </div>
        </div>

        {/* Bağlam Bilgileri (ZTO .production-only "Üretim Bilgileri" yerinde) */}
        <div className="row">
          <div className="col-md-12">
            <fieldset className="form-section">
              {sectionTitle(f("sectionContext"))}
              <div className="row">
                <div className="col-md-4">
                  <label htmlFor={FIELD_IDS.contextType}>{f("contextType")}</label>
                  <select
                    id={FIELD_IDS.contextType}
                    className="form-control"
                    value={state.contextType}
                    disabled={busy}
                    onChange={(event) =>
                      changeContextType(event.target.value as ExpenseContextType)
                    }
                  >
                    {CONTEXT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(`expenses.context.${type}`)}
                      </option>
                    ))}
                  </select>
                </div>
                {searchType && (
                  <>
                    <div className="col-md-4">
                      <label htmlFor="contextSearch">{f("contextSearch")}</label>
                      <input
                        id="contextSearch"
                        type="search"
                        className="form-control"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder={f("contextSearchPlaceholder")}
                        aria-describedby="contextSearchHint"
                        value={contextQuery}
                        disabled={busy}
                        onChange={(event) => setContextQuery(event.target.value)}
                      />
                      <small className="text-muted" id="contextSearchHint">
                        {f("contextSearchHint")}
                      </small>
                    </div>
                    <div className="col-md-4">
                      <label id="contextIdLabel" htmlFor={FIELD_IDS.contextId}>
                        {f(`contextField.${searchType}`)}
                        {required}
                      </label>
                      <ZtoSearchableSelect
                        id={FIELD_IDS.contextId}
                        ariaLabelledBy="contextIdLabel"
                        value={state.contextId}
                        options={contextItems}
                        placeholder={f("contextPlaceholder")}
                        searchPlaceholder={f("contextSearchPlaceholder")}
                        noResultsText={f("contextNoResults")}
                        includeEmptyOption={false}
                        disabled={busy}
                        onChange={(value) => {
                          const option = contextItems.find((row) => row.value === value);
                          setState((prev) => ({
                            ...prev,
                            contextId: value,
                            contextLabel: option?.label ?? "",
                          }));
                          clear(FIELD_IDS.contextId);
                        }}
                      />
                      {errorFor(FIELD_IDS.contextId)}
                    </div>
                  </>
                )}
              </div>
            </fieldset>
          </div>
        </div>

        {/* MASRAF DETAYLARI */}
        <div className="row mt-3">
          <div className="col-md-12">
            <fieldset className="form-section">
              {sectionTitle(f("sectionDetails"))}
              <ExpenseLineCards
                lines={state.lines}
                symbol={symbol}
                errors={shown}
                disabled={busy}
                onChange={changeLine}
                onAdd={addLine}
                onRemove={removeLine}
                onBlur={blur}
              />
              {errorFor(FIELD_IDS.lines)}
            </fieldset>
          </div>
        </div>

        {/* GENEL TOPLAM */}
        <div className="row mt-3">
          <div className="col-md-12">
            <fieldset className="form-section" style={TOTALS_SECTION}>
              <legend style={LEGEND}>
                <h5 style={TOTALS_TITLE}>{f("sectionTotals")}</h5>
              </legend>
              <div className="row">
                {(
                  [
                    ["GrandNetAmount", "grandNet", totals.netAmount, "bg-primary-custom"],
                    ["GrandTaxAmount", "grandVat", totals.vatAmount, "bg-primary-custom"],
                    [
                      "GrandDiscountAmount",
                      "grandDiscount",
                      totals.discountAmount,
                      "bg-info-custom",
                    ],
                  ] as const
                ).map(([id, label, value, addon]) => (
                  <div className="col-md-3" key={id}>
                    <label htmlFor={id}>{f(label)}</label>
                    <div className="input-group">
                      <input
                        type="text"
                        className="form-control"
                        id={id}
                        readOnly
                        aria-readonly="true"
                        style={GRAND_FIELD}
                        value={formatN2(value)}
                      />
                      <div className={`input-group-text ${addon}`}>
                        <span className="currency-symbol">{symbol}</span>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="col-md-3">
                  <label htmlFor="GrandTotalAmount">{f("grandTotal")} *</label>
                  <div className="input-group">
                    <input
                      type="text"
                      className="form-control"
                      id="GrandTotalAmount"
                      readOnly
                      aria-readonly="true"
                      aria-live="polite"
                      style={GRAND_TOTAL}
                      value={formatN2(totals.totalAmount)}
                    />
                    <div className="input-group-text bg-success-custom">
                      <span className="currency-symbol" style={BOLD}>
                        {symbol}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </fieldset>
          </div>
        </div>

        {/* Açıklama */}
        <div className="row mt-3">
          <div className="col-md-12">
            <fieldset className="form-section">
              <legend style={LEGEND}>
                <h5>
                  <label htmlFor={FIELD_IDS.description} className="mb-0">
                    {f("sectionDescription")}
                  </label>
                </h5>
              </legend>
              <input
                {...a11y(FIELD_IDS.description)}
                className="form-control"
                placeholder={f("descriptionPlaceholder")}
                maxLength={DESCRIPTION_MAX}
                value={state.description}
                disabled={busy}
                onChange={(event) => set("description", event.target.value)}
              />
              {errorFor(FIELD_IDS.description)}
            </fieldset>
          </div>
        </div>

        <div className="row">
          <div className="col-md-12 mb-1 col-sm-12">
            <div className="form-section" style={TOTALS_SECTION}>
              <label htmlFor={FIELD_IDS.documentType}>{f("documentType")}</label>
              <select
                {...a11y(FIELD_IDS.documentType)}
                className="form-control no-select2"
                name="DocumentType"
                style={POINTER}
                required
                value={state.documentType}
                disabled={busy}
                onChange={(event) => set("documentType", event.target.value)}
              >
                <option value="">{f("documentTypePlaceholder")}</option>
                {docOptions.map((type) => (
                  <option key={type.code} value={type.code}>
                    {type.name}
                  </option>
                ))}
              </select>
              {errorFor(FIELD_IDS.documentType)}
            </div>
          </div>
        </div>

        {mode === "edit" && (
          <div className="row">
            <div className="col-md-12 mb-1">
              <div className="form-section">
                <label htmlFor={FIELD_IDS.reason}>
                  {f("reason")}
                  {required}
                </label>
                <input
                  {...a11y(FIELD_IDS.reason)}
                  className="form-control"
                  required
                  maxLength={REASON_MAX}
                  placeholder={f("reasonPlaceholder")}
                  value={state.reason}
                  disabled={busy}
                  onChange={(event) => set("reason", event.target.value)}
                />
                {errorFor(FIELD_IDS.reason)}
              </div>
            </div>
          </div>
        )}

        {mode === "edit" && existing ? (
          <div className="row">
            <div className="col-md-12 d-flex justify-content-center gap-2">
              <Link
                to={expenseItemInvoicesPath(existing.expenseItemId)}
                className="btn btn-secondary m-1"
                style={EDIT_BUTTON}
              >
                <i className="fas fa-arrow-left" aria-hidden="true" /> {f("back")}
              </Link>
              <button
                type="submit"
                className="btn btn-success m-1"
                style={EDIT_BUTTON}
                id="submitBtn"
                disabled={busy}
              >
                {busy ? (
                  <>
                    <i className="fas fa-spinner fa-spin" aria-hidden="true" />{" "}
                    {f("submittingEdit")}
                  </>
                ) : (
                  <>
                    <i className="fas fa-save" aria-hidden="true" /> {f("submitEdit")}
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="row mt-4">
            <div className="col-md-12">
              <button
                type="submit"
                className="btn btn-primary col-md-12"
                id="submitBtn"
                disabled={busy}
              >
                {busy ? (
                  <>
                    <i className="fas fa-spinner fa-spin" aria-hidden="true" /> {f("submittingNew")}
                  </>
                ) : (
                  <>
                    <i className="fas fa-plus" aria-hidden="true" /> {f("submitNew")}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </form>

      <ZtoConfirmModal
        show={confirmRemove}
        variant="danger"
        message={f("removeDocumentConfirm")}
        onConfirm={() => {
          setRemoveDocument(true);
          setConfirmRemove(false);
        }}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}
