import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFundList } from "../../../../pages/finance/fundApi";
import { useCreateCheckBook } from "../../../../pages/finance/instrumentApi";
import { fieldA11yProps, errorIdOf, useFormErrorAnnouncer } from "../../../a11y";
import { ZtoModal } from "../../../components";
import { fundLabel } from "../settlementModals/settlementFormLogic";
import {
  EMPTY_CHECK_BOOK_FORM,
  checkBookBody,
  createdSummary,
  digitsOnly,
  firstError,
  leafCount,
  leafCountClass,
  validateCheckBook,
  type CheckBookField,
  type CheckBookForm,
} from "./checkBookLogic";
import { errorTextOf } from "./editInstrumentLogic";

type Props = {
  show: boolean;
  onHide: () => void;
  /** Başarı iletisi (modal kapandıktan sonra). */
  onDone: (message: string) => void;
};

/** Alan → giriş kimliği (ZTO adları). */
const FIELD_IDS: Record<CheckBookField, string> = {
  fundAccountId: "BankIntroductionID",
  serialNo: "CheckBookSerialNo",
  startNumber: "StartCheckNumber",
  endNumber: "EndCheckNumber",
  range: "EndCheckNumber",
  bankCode: "BankCode",
  branchCode: "BranchCode",
};

/**
 * M15 "Yeni Çek Defteri Ekle" (ZTO CheckBooks/Index.cshtml #addCheckBookModal :254-412, validateForm ve
 * calculateCheckCount :790-830). Banka hesabı iş yeri seçimsiz, görünür aktif banka fonlarıdır. Alan
 * iletileri ZTO ile birebir; ZTO yalnız ilk hatayı gösterir, burada her alan kendi hatasını taşır ve
 * gönderimde ilk hatalı alana odaklanılır. Gerçek `required`/`pattern` nitelikleri ZTO'daki gibi
 * durur; doğrulama istemci mantığıyla (`noValidate`).
 */
export function AddCheckBookModal({ show, onHide, onDone }: Props) {
  const { t, i18n } = useTranslation("ztoFinans");
  const create = useCreateCheckBook();
  const announcer = useFormErrorAnnouncer();
  const banks = useFundList({ kind: "BANK", active: true }, { enabled: show });
  const [form, setForm] = useState<CheckBookForm>(EMPTY_CHECK_BOOK_FORM);
  const [touched, setTouched] = useState<Partial<Record<CheckBookField, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = (key: string, options?: Record<string, unknown>) =>
    t(`checkBooks.modal.${key}`, options);

  useEffect(() => {
    if (!show) return;
    setForm(EMPTY_CHECK_BOOK_FORM);
    setTouched({});
    setSubmitted(false);
    setError(null);
    announcer.clear();
    // announcer.clear kararlı.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const errors = useMemo(() => validateCheckBook(form), [form]);
  const count = leafCount(form.startNumber, form.endNumber);
  const options = (banks.data ?? []).filter((fund) => fund.kind === "BANK" && fund.active);

  const message = (field: CheckBookField) => {
    const key = errors[field];
    return key ? t(`checkBooks.errors.${key}`) : null;
  };
  const a11y = (field: CheckBookField) =>
    fieldA11yProps(field, {
      id: FIELD_IDS[field],
      touched: touched[field],
      submitted,
      error: message(field),
    });
  const invalid = (field: CheckBookField) =>
    (touched[field] || submitted) && message(field) ? " is-invalid" : "";
  const feedback = (field: CheckBookField) => (
    <div
      id={errorIdOf(FIELD_IDS[field])}
      className="invalid-feedback"
      hidden={!((touched[field] || submitted) && message(field))}
    >
      {message(field)}
    </div>
  );
  const blur = (field: CheckBookField, label: string) => {
    setTouched((s) => ({ ...s, [field]: true }));
    announcer.announceFieldError(field, label, message(field));
  };
  const set = (patch: Partial<CheckBookForm>) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setSubmitted(true);
    setError(null);
    const first = firstError(errors);
    if (first) {
      document.getElementById(FIELD_IDS[first])?.focus();
      return;
    }
    try {
      const result = await create.mutateAsync(checkBookBody(form));
      const summary = createdSummary(result);
      onHide();
      onDone(
        summary.skippedCount === 0
          ? m("created", { count: summary.created })
          : m("createdSkipped", {
              created: summary.created,
              count: summary.skippedCount,
              numbers: summary.numbers,
            }),
      );
    } catch (err) {
      setError(
        errorTextOf(err, m("failed"), ["checkBooks", "instruments"], (key) =>
          i18n.exists(key, { ns: "ztoFinans" }) ? t(key) : null,
        ),
      );
    }
  }

  const rangeError = (touched.endNumber || submitted) && errors.range;

  return (
    <ZtoModal
      show={show}
      onHide={onHide}
      size="lg"
      rootId="addCheckBookModal"
      className="erp-modal"
      title={
        <>
          <i className="fas fa-plus" aria-hidden="true" /> {m("title")}
        </>
      }
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onHide}>
            <i className="fas fa-times" aria-hidden="true" /> {m("cancel")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            id="saveCheckBookBtn"
            disabled={create.isPending}
            aria-busy={create.isPending}
            onClick={() => void save()}
          >
            {create.isPending ? (
              <>
                <i className="fas fa-spinner fa-spin" aria-hidden="true" /> {m("saving")}
              </>
            ) : (
              <>
                <i className="fas fa-save" aria-hidden="true" /> {m("save")}
              </>
            )}
          </button>
        </>
      }
    >
      <form
        id="checkBookForm"
        noValidate
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="field-group">
          <div className="field-group-title">
            <i className="fas fa-university" aria-hidden="true" /> {m("bankGroup")}
          </div>
          <div className="form-group">
            <label htmlFor="BankIntroductionID">
              {m("bank")} <span className="text-danger">*</span>
            </label>
            <select
              {...a11y("fundAccountId")}
              name="BankIntroductionID"
              className={`form-control no-select2${invalid("fundAccountId")}`}
              required
              value={form.fundAccountId}
              onChange={(event) => set({ fundAccountId: event.target.value })}
              onBlur={() => blur("fundAccountId", m("bank"))}
            >
              <option value="">{m("bankPlaceholder")}</option>
              {options.map((fund) => (
                <option key={fund.id} value={fund.id}>
                  {fundLabel(fund)}
                </option>
              ))}
            </select>
            {feedback("fundAccountId")}
          </div>
        </div>

        <div className="field-group">
          <div className="field-group-title">
            <i className="fas fa-book" aria-hidden="true" /> {m("bookGroup")}
          </div>
          <div className="row">
            <div className="col-md-12">
              <div className="form-group">
                <label htmlFor="CheckBookSerialNo">
                  {m("serial")} <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  {...a11y("serialNo")}
                  name="CheckBookSerialNo"
                  className={`form-control${invalid("serialNo")}`}
                  placeholder={m("serialPlaceholder")}
                  maxLength={50}
                  required
                  autoComplete="off"
                  value={form.serialNo}
                  onChange={(event) => set({ serialNo: event.target.value })}
                  onBlur={() => blur("serialNo", m("serial"))}
                />
                <small className="text-muted">{m("serialHelp")}</small>
                {feedback("serialNo")}
              </div>
            </div>
          </div>
          <div className="row">
            {(["startNumber", "endNumber"] as const).map((field) => (
              <div className="col-md-6" key={field}>
                <div className="form-group">
                  <label htmlFor={FIELD_IDS[field]}>
                    {m(field === "startNumber" ? "start" : "end")}{" "}
                    <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    {...a11y(field)}
                    name={field === "startNumber" ? "StartCheckNumber" : "EndCheckNumber"}
                    className={`form-control${invalid(field)}`}
                    placeholder={field === "startNumber" ? "1234567" : "1234617"}
                    maxLength={7}
                    pattern="[0-9]{7}"
                    inputMode="numeric"
                    autoComplete="off"
                    required
                    value={form[field]}
                    onChange={(event) => set({ [field]: digitsOnly(event.target.value, 7) })}
                    onBlur={() => blur(field, m(field === "startNumber" ? "start" : "end"))}
                  />
                  <small className="text-muted">{m("numberHelp")}</small>
                  {feedback(field)}
                </div>
              </div>
            ))}
          </div>
          {count > 0 && (
            <div className="row">
              <div className="col-md-12">
                <div className={`alert ${leafCountClass(count)}`} id="checkCountInfo" role="status">
                  <i className="fas fa-calculator" aria-hidden="true" />{" "}
                  <strong>{m("countLabel")}</strong> <span id="totalCheckCount">{count}</span>{" "}
                  {m("countSuffix")}
                  {rangeError && (
                    <>
                      <br />
                      <strong>{m("countTooMany")}</strong>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="field-group">
          <div className="field-group-title">
            <i className="fas fa-barcode" aria-hidden="true" /> {m("micrGroup")}
          </div>
          <div className="row">
            {(["bankCode", "branchCode"] as const).map((field) => (
              <div className="col-md-6" key={field}>
                <div className="form-group">
                  <label htmlFor={FIELD_IDS[field]}>{m(field)}</label>
                  <input
                    type="text"
                    {...a11y(field)}
                    name={FIELD_IDS[field]}
                    className={`form-control${invalid(field)}`}
                    placeholder={field === "bankCode" ? "0001" : "1124"}
                    maxLength={4}
                    pattern="[0-9]{4}"
                    inputMode="numeric"
                    autoComplete="off"
                    value={form[field]}
                    onChange={(event) => set({ [field]: digitsOnly(event.target.value, 4) })}
                    onBlur={() => blur(field, m(field))}
                  />
                  <small className="text-muted">{m(`${field}Help`)}</small>
                  {feedback(field)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="alert alert-info">
          <i className="fas fa-info-circle" aria-hidden="true" /> <strong>{m("infoLabel")}</strong>{" "}
          {m("info")}
          <br />
          <strong>{m("exampleLabel")}</strong> {m("example")}
        </div>
        {error && (
          <div className="alert alert-danger mb-0" role="alert">
            {error}
          </div>
        )}
        {announcer.region}
      </form>
    </ZtoModal>
  );
}
