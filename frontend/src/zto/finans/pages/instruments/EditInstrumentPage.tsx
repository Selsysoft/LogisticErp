import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import {
  useCheckNumber,
  useInstrument,
  useInstrumentTransition,
  useUpdateInstrument,
} from "../../../../pages/finance/instrumentApi";
import type { InstrumentListItem, NoteType } from "../../../../pages/finance/types";
import { errorIdOf, fieldA11yProps, useFormErrorAnnouncer } from "../../../a11y";
import { ZtoConfirmModal, formatN2 } from "../../../components";
import { billsPath, checksPath } from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { todayIso } from "../fundTransactions/fundTransactionsLogic";
import { ReverseSettlementModal } from "../settlements/ReverseSettlementModal";
import { NOTE_TYPES, billParties } from "./billsLogic";
import {
  cancelAction,
  canEditDueDate,
  correctionPath,
  diffBody,
  errorTextOf,
  formFromItem,
  isEmptyBody,
  needsNumberCheck,
  numberConflict,
  numberLocked,
  remainingView,
  sanitizeCheckNumber,
  validateEdit,
  type EditErrors,
  type EditForm,
} from "./editInstrumentLogic";
import type { EditInstrumentPageProps } from "./index";
import { noteTypeLabelKey, statusLabelKey } from "./instrumentLogic";

const READONLY: CSSProperties = { backgroundColor: "#f8f9fa" };
const LOCKED: CSSProperties = { backgroundColor: "#f8f9fa", cursor: "not-allowed" };
const CHECK_DEBOUNCE_MS = 400;

type Field = keyof EditErrors;
const FIELD_IDS: Record<Field, string> = {
  number: "checkNumberInput",
  bankName: "BankName",
  dueDate: "dueDateInput",
};

/**
 * Çek / Senet Düzenle (ZTO Checks/EditCheck, Bills/EditBill; 12.3_TASARIM §5.7). İki ekran tek bileşen:
 * `kind` rotadan gelir. Yalnız finansal olmayan alanlar düzenlenir (PATCH, yalnız değişenler); tutar,
 * para birimi ve cari salt okunurdur ve köken kaydın "Düzelt" akışıyla değişir. "Çeki Sil" yerine
 * "İptal Et" (ters kayıt): alınan portföy çekinde keşideciye iade, verilen çekte köken ödemenin iptali.
 */
export function EditInstrumentPage({ kind: routeKind = "CHECK" }: EditInstrumentPageProps) {
  useZtoRootClass("zto-page-edit-instrument");
  const { id = "" } = useParams();
  const { t, i18n } = useTranslation("ztoFinans");
  const { t: tc } = useTranslation();
  const detail = useInstrument(id);
  const item = detail.data?.item ?? null;
  const kind = item?.kind ?? routeKind;
  const bill = kind === "NOTE";
  const update = useUpdateInstrument();
  const transition = useInstrumentTransition();
  const announcer = useFormErrorAnnouncer();
  const today = todayIso();

  const [original, setOriginal] = useState<EditForm | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [notice, setNotice] = useState<{ variant: "success" | "danger"; text: string } | null>(
    null,
  );
  const [confirmReturn, setConfirmReturn] = useState(false);
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [checkedNumber, setCheckedNumber] = useState("");
  const loadedId = useRef<string | null>(null);

  useEffect(() => {
    if (!item || loadedId.current === item.id) return;
    loadedId.current = item.id;
    const next = formFromItem(item);
    setOriginal(next);
    setForm(next);
  }, [item]);

  // Tekillik ön denetimi: numara değişince 400 ms sonra (ECK checkDuplicateCheckNumber).
  useEffect(() => {
    const timer = setTimeout(() => setCheckedNumber(form?.number.trim() ?? ""), CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [form?.number]);
  const shouldCheck =
    !!item && !!original && needsNumberCheck(kind, original.number, checkedNumber);
  const numberCheck = useCheckNumber(
    {
      companyId: item?.companyId,
      kind: "CHECK",
      direction: item?.direction ?? "RECEIVED",
      number: checkedNumber,
      excludeId: item?.id,
    },
    { enabled: shouldCheck },
  );
  const conflict = shouldCheck ? numberConflict(numberCheck.data) : null;

  const e = (key: string, options?: Record<string, unknown>) => t(`editInstrument.${key}`, options);
  const k = (key: string, options?: Record<string, unknown>) =>
    e(`${bill ? "bill" : "check"}.${key}`, options);
  const lookup = (key: string) => (i18n.exists(key, { ns: "ztoFinans" }) ? t(key) : null);
  const listPath = bill ? billsPath() : checksPath();

  const errors = useMemo<EditErrors>(() => (form ? validateEdit(kind, form) : {}), [form, kind]);
  const conflictText = conflict
    ? e("numberTaken", {
        account: conflict.account,
        status: conflict.status
          ? t(statusLabelKey(kind, item?.direction ?? "RECEIVED", conflict.status))
          : "-",
      })
    : null;
  const message = (field: Field): string | null => {
    if (field === "number" && !errors.number && conflictText) return conflictText;
    const key = errors[field];
    return key ? e(key) : null;
  };
  const shown = (field: Field) =>
    (touched[field] || submitted || (field === "number" && !!conflictText)) && !!message(field);
  const a11y = (field: Field) =>
    fieldA11yProps(field, {
      id: FIELD_IDS[field],
      touched: touched[field] || (field === "number" && !!conflictText),
      submitted,
      error: message(field),
    });
  const invalidClass = (field: Field) => (shown(field) ? " is-invalid" : "");
  const feedback = (field: Field) => (
    <div id={errorIdOf(FIELD_IDS[field])} className="invalid-feedback" hidden={!shown(field)}>
      {shown(field) ? message(field) : ""}
    </div>
  );
  const blur = (field: Field, label: string) => {
    setTouched((s) => ({ ...s, [field]: true }));
    announcer.announceFieldError(field, label, message(field));
  };
  const set = (patch: Partial<EditForm>) => setForm((f) => (f ? { ...f, ...patch } : f));

  async function save() {
    if (!item || !form || !original) return;
    setSubmitted(true);
    setNotice(null);
    const first = (["number", "bankName", "dueDate"] as const).find((field) => message(field));
    if (first) {
      document.getElementById(FIELD_IDS[first])?.focus();
      if (first === "number" && !bill) setNotice({ variant: "danger", text: k("submitInvalid") });
      return;
    }
    const body = diffBody(item, original, form);
    if (isEmptyBody(body)) {
      setNotice({ variant: "success", text: e("noChanges") });
      return;
    }
    try {
      const saved = await update.mutateAsync({ id: item.id, body });
      const next = formFromItem(saved);
      setOriginal(next);
      setForm(next);
      setSubmitted(false);
      setTouched({});
      setNotice({ variant: "success", text: e("saved") });
    } catch (err) {
      setNotice({
        variant: "danger",
        text: errorTextOf(err, e("failed"), ["instruments"], lookup),
      });
    }
  }

  async function confirmReturned() {
    if (!item) return;
    await transition.mutateAsync({ id: item.id, body: { toStatus: "RETURNED", date: today } });
    setConfirmReturn(false);
    setNotice({ variant: "success", text: e("returned") });
  }

  const headerClass = bill ? "card-header bg-warning text-dark" : "card-header bg-info text-white";
  const headerIcon = bill ? "fa-file-invoice-dollar" : "fa-money-check";
  const action = item ? cancelAction(item) : null;
  const fix = item ? correctionPath(item) : null;
  const remaining = form ? remainingView(form.dueDate, today) : null;
  const statusText = item ? t(statusLabelKey(kind, item.direction, item.status)) : "";

  return (
    <div className={`container-fluid${bill ? " edit-bill" : ""}`}>
      <div className="row">
        <div className="col-12">
          <div className="card">
            <div className={headerClass}>
              <h6 className="card-title mb-0" id="editInstrumentTitle">
                <i className={`fas ${headerIcon}`} aria-hidden="true" />{" "}
                {k("title", { number: original?.number ?? item?.number ?? "" })}
              </h6>
              <div className="card-tools">
                <Link to={listPath} className="btn btn-light btn-sm">
                  <i className="fas fa-arrow-left" aria-hidden="true" /> {k("back")}
                </Link>
              </div>
            </div>
            <div className="card-body">
              {notice && (
                <div
                  className={`alert alert-${notice.variant} alert-dismissible`}
                  role={notice.variant === "success" ? "status" : "alert"}
                >
                  <button
                    type="button"
                    className="close"
                    aria-label={tc("common.a11y.close")}
                    onClick={() => setNotice(null)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                  <strong>
                    <i
                      className={`fas ${notice.variant === "success" ? "fa-check-circle" : "fa-exclamation-triangle"}`}
                      aria-hidden="true"
                    />{" "}
                    {e(notice.variant === "success" ? "notice.success" : "notice.error")}
                  </strong>
                  <br />
                  {notice.text}
                </div>
              )}
              {detail.isPending && (
                <p className="text-muted">
                  <i className="fas fa-spinner fa-spin" aria-hidden="true" /> {e("loading")}
                </p>
              )}
              {detail.isError && (
                <div className="alert alert-danger" role="alert">
                  {e("notFound")}
                </div>
              )}
              {item && form && (
                <form
                  id={bill ? "editBillForm" : "editCheckForm"}
                  noValidate
                  aria-labelledby="editInstrumentTitle"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                  }}
                >
                  <div className="card mb-3">
                    <div className="card-header bg-light">
                      <h6 className="mb-0">
                        <i
                          className={`fas ${bill ? "fa-file-alt" : "fa-file-invoice"}`}
                          aria-hidden="true"
                        />{" "}
                        {k("infoCard")}
                      </h6>
                    </div>
                    <div className="card-body">
                      <div className="row">
                        <div className="col-md-4">
                          <div className="form-group">
                            <label htmlFor="checkNumberInput">
                              {bill ? (
                                k("number")
                              ) : (
                                <>
                                  {k("number")} <span className="text-danger">*</span>
                                </>
                              )}
                              {numberLocked(item) && (
                                <span className="badge badge-info ml-2">{e("leafBadge")}</span>
                              )}
                            </label>
                            <input
                              type="text"
                              {...a11y("number")}
                              className={`form-control${invalidClass("number")}`}
                              maxLength={bill ? 50 : 7}
                              pattern={bill ? undefined : "[0-9]{7}"}
                              inputMode={bill ? undefined : "numeric"}
                              autoComplete="off"
                              placeholder={k("numberPlaceholder")}
                              required
                              readOnly={numberLocked(item)}
                              style={numberLocked(item) ? READONLY : undefined}
                              title={numberLocked(item) ? e("leafLocked") : undefined}
                              value={form.number}
                              onChange={(event) =>
                                set({
                                  number: bill
                                    ? event.target.value
                                    : sanitizeCheckNumber(event.target.value),
                                })
                              }
                              onBlur={() => blur("number", k("number"))}
                            />
                            {!bill && (
                              <small className="form-text text-muted">
                                <i className="fas fa-info-circle" aria-hidden="true" />{" "}
                                {k("numberHelp")}
                              </small>
                            )}
                            {feedback("number")}
                          </div>
                        </div>
                        <div className="col-md-4">
                          {bill ? (
                            <div className="form-group">
                              <label htmlFor="BillType">{k("noteType")}</label>
                              <select
                                id="BillType"
                                className="form-control"
                                required
                                value={form.noteType}
                                onChange={(event) =>
                                  set({ noteType: event.target.value as NoteType })
                                }
                              >
                                {!form.noteType && <option value="">-</option>}
                                {NOTE_TYPES.map((type) => (
                                  <option key={type} value={type}>
                                    {t(noteTypeLabelKey(type) ?? "")}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="form-group">
                              <label htmlFor="CheckType">{k("type")}</label>
                              <select
                                id="CheckType"
                                className="form-control"
                                disabled
                                title={k("typeLocked")}
                                style={LOCKED}
                                value={item.direction}
                              >
                                <option value="RECEIVED">{k("typeReceived")}</option>
                                <option value="ISSUED">{k("typeIssued")}</option>
                              </select>
                              <small className="form-text text-muted">
                                <i className="fas fa-lock" aria-hidden="true" /> {k("typeLocked")}
                              </small>
                            </div>
                          )}
                        </div>
                        <div className="col-md-4">
                          <div className="form-group">
                            <label htmlFor="CheckStatus">{e("status")}</label>
                            <input
                              type="text"
                              id="CheckStatus"
                              className="form-control"
                              readOnly
                              style={READONLY}
                              value={statusText}
                            />
                          </div>
                        </div>
                      </div>
                      {bill ? (
                        <div className="row">
                          <div className="col-md-6">
                            <div className="form-check mt-4">
                              <input
                                type="checkbox"
                                id="IsCollateral"
                                className="form-check-input"
                                checked={item.collateral}
                                disabled
                                readOnly
                              />
                              <label htmlFor="IsCollateral" className="form-check-label">
                                <strong>{k("collateral")}</strong>
                                <small className="form-text text-muted">
                                  {k("collateralHelp")}
                                </small>
                              </label>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="row">
                          <div className="col-md-6">
                            <div className="form-group">
                              <label htmlFor="BankName">{e("bankName")}</label>
                              <input
                                type="text"
                                {...a11y("bankName")}
                                className={`form-control${invalidClass("bankName")}`}
                                required
                                maxLength={100}
                                placeholder={e("bankNamePlaceholder")}
                                value={form.bankName}
                                onChange={(event) => set({ bankName: event.target.value })}
                                onBlur={() => blur("bankName", e("bankName"))}
                              />
                              {feedback("bankName")}
                            </div>
                          </div>
                          <div className="col-md-6">
                            <div className="form-group">
                              <label htmlFor="BranchName">{e("bankBranch")}</label>
                              <input
                                type="text"
                                id="BranchName"
                                className="form-control"
                                maxLength={100}
                                placeholder={e("bankBranchPlaceholder")}
                                value={form.bankBranch}
                                onChange={(event) => set({ bankBranch: event.target.value })}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="card mb-3">
                    <div className="card-header bg-light">
                      <h6 className="mb-0">
                        <i className="fas fa-money-bill-wave" aria-hidden="true" />{" "}
                        {e("amountCard")}
                      </h6>
                    </div>
                    <div className="card-body">
                      <div className="row">
                        <div className="col-md-4">
                          <div className="form-group">
                            <label htmlFor="amountInput">{e("amount")}</label>
                            <input
                              type="text"
                              id="amountInput"
                              className="form-control"
                              readOnly
                              style={READONLY}
                              value={formatN2(item.money.amount)}
                            />
                            {fix && (
                              <small className="form-text">
                                <Link to={fix} title={e("correctTitle")}>
                                  <i className="fas fa-pen" aria-hidden="true" /> {e("correct")}
                                </Link>
                              </small>
                            )}
                          </div>
                        </div>
                        <div className="col-md-4">
                          <div className="form-group">
                            <label htmlFor="CurrencyID">{e("currency")}</label>
                            <input
                              type="text"
                              id="CurrencyID"
                              className="form-control"
                              readOnly
                              style={READONLY}
                              value={item.money.currency}
                            />
                          </div>
                        </div>
                        <div className="col-md-4">
                          <div className="form-group">
                            <label htmlFor="issueDateInput">{k("issueDate")}</label>
                            <input
                              type="date"
                              id="issueDateInput"
                              className="form-control"
                              value={form.issueDate}
                              onChange={(event) => set({ issueDate: event.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="row">
                        <div className="col-md-6">
                          <div className="form-group">
                            <label htmlFor="dueDateInput">{e("dueDate")}</label>
                            <input
                              type="date"
                              {...a11y("dueDate")}
                              className={`form-control${invalidClass("dueDate")}`}
                              required
                              disabled={!canEditDueDate(item)}
                              title={canEditDueDate(item) ? undefined : e("dueLocked")}
                              value={form.dueDate}
                              onChange={(event) => {
                                set({ dueDate: event.target.value });
                                setTouched((s) => ({ ...s, dueDate: true }));
                              }}
                              onBlur={() => blur("dueDate", e("dueDate"))}
                            />
                            {!canEditDueDate(item) && (
                              <small className="form-text text-muted">{e("dueLocked")}</small>
                            )}
                            {feedback("dueDate")}
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="form-group">
                            <label htmlFor="daysRemaining">{e("remaining")}</label>
                            <input
                              type="text"
                              id="daysRemaining"
                              className="form-control"
                              readOnly
                              style={{ ...READONLY, color: remaining?.color || undefined }}
                              value={
                                !remaining || remaining.days === null
                                  ? ""
                                  : remaining.expired
                                    ? e("remainingExpired")
                                    : e("remainingDays", { count: remaining.days })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <PartiesCard
                    item={item}
                    form={form}
                    bill={bill}
                    onDrawer={(v) => set({ drawerName: v })}
                  />

                  <div className="card mb-3">
                    <div className="card-header bg-light">
                      <h6 className="mb-0">
                        <i className="fas fa-comment-alt" aria-hidden="true" />{" "}
                        {e("descriptionCard")}
                      </h6>
                    </div>
                    <div className="card-body">
                      <div className="form-group">
                        <label htmlFor="Description">{e("description")}</label>
                        <textarea
                          id="Description"
                          className="form-control"
                          rows={4}
                          maxLength={500}
                          placeholder={k("descriptionPlaceholder")}
                          value={form.description}
                          onChange={(event) => set({ description: event.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="form-group">
                    <button
                      type="submit"
                      className="btn btn-success btn-lg"
                      id="submitBtn"
                      disabled={update.isPending}
                      aria-busy={update.isPending}
                    >
                      {update.isPending ? (
                        <>
                          <i className="fas fa-spinner fa-spin" aria-hidden="true" /> {e("saving")}
                        </>
                      ) : (
                        <>
                          <i className="fas fa-save" aria-hidden="true" /> {e("save")}
                        </>
                      )}
                    </button>{" "}
                    <Link to={listPath} className="btn btn-secondary btn-lg">
                      <i className="fas fa-times" aria-hidden="true" /> {e("cancel")}
                    </Link>
                    {action && (
                      <button
                        type="button"
                        className="btn btn-danger btn-lg float-right"
                        onClick={() =>
                          action.kind === "return"
                            ? setConfirmReturn(true)
                            : setReverseId(action.settlementId)
                        }
                      >
                        <i className="fas fa-ban" aria-hidden="true" /> {k("cancelItem")}
                      </button>
                    )}
                  </div>
                  {announcer.region}
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      <ZtoConfirmModal
        show={confirmReturn}
        variant="warning"
        title={e("returnTitle")}
        message={e("returnBody")}
        note={`${e("returnWarning")} ${e("returnIrreversible")}`}
        confirmText={e("returnConfirm")}
        cancelText={e("cancel")}
        onConfirm={confirmReturned}
        onCancel={() => setConfirmReturn(false)}
        onError={(err) => {
          setConfirmReturn(false);
          setNotice({
            variant: "danger",
            text: errorTextOf(err, e("failed"), ["instruments"], lookup),
          });
        }}
      />
      <ReverseSettlementModal
        settlementId={reverseId}
        type="PAYMENT"
        onHide={() => setReverseId(null)}
        onDone={(text) => setNotice({ variant: "success", text })}
      />
    </div>
  );
}

/** "Taraf Bilgileri" (ECK iki sütun; EBL bilgi kutusu + üç sütun). */
function PartiesCard({
  item,
  form,
  bill,
  onDrawer,
}: {
  item: InstrumentListItem;
  form: EditForm;
  bill: boolean;
  onDrawer: (value: string) => void;
}) {
  const { t } = useTranslation("ztoFinans");
  const e = (key: string) => t(`editInstrument.${key}`);
  const k = (key: string) => e(`${bill ? "bill" : "check"}.${key}`);
  const parties = billParties(item);
  const text = (code: string | null, name: string | null) =>
    [code, name].filter((part) => part).join(" - ") || "-";
  const readonly = (id: string, label: string, value: string) => (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <input type="text" id={id} className="form-control" readOnly style={READONLY} value={value} />
      <small className="form-text text-muted">
        {e("current")} <strong>{value}</strong>
      </small>
    </div>
  );
  const drawer =
    item.direction === "RECEIVED" ? (
      <div className="form-group">
        <label htmlFor="DrawerName">{k("drawer")}</label>
        <input
          type="text"
          id="DrawerName"
          className="form-control"
          maxLength={200}
          placeholder={item.accountName ?? ""}
          value={form.drawerName}
          onChange={(event) => onDrawer(event.target.value)}
        />
        <small className="form-text text-muted">
          {e("current")} <strong>{item.drawerName || item.accountName || "-"}</strong>
        </small>
      </div>
    ) : (
      readonly("DrawerName", k("drawer"), text(parties.drawer.code, parties.drawer.name))
    );
  return (
    <div className="card mb-3">
      <div className="card-header bg-light">
        <h6 className="mb-0">
          <i className="fas fa-users" aria-hidden="true" /> {e("partiesCard")}
        </h6>
      </div>
      <div className="card-body">
        {bill && (
          <div className="alert alert-info">
            <i className="fas fa-info-circle" aria-hidden="true" />{" "}
            <strong>{k("partiesInfoLabel")}</strong> {k("partiesInfo")}
          </div>
        )}
        <div className="row">
          <div className={bill ? "col-md-4" : "col-md-6"}>{drawer}</div>
          {bill && (
            <div className="col-md-4">
              {readonly("DraweeID", k("drawee"), text(parties.drawee.code, parties.drawee.name))}
            </div>
          )}
          <div className={bill ? "col-md-4" : "col-md-6"}>
            {readonly(
              "PayeeCustomerID",
              k("payee"),
              bill
                ? text(parties.payee.code, parties.payee.name)
                : text(item.accountCode, item.accountName),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
