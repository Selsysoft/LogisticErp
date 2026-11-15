import { useCurrencies } from "../../../../pages/finance/common";
import type { Fund, PayMethod } from "../../../../pages/finance/types";
import { ZtoBranchSelect } from "../../../components";
import { FundSelect } from "./FundSelect";
import { Help, useModalText } from "./parts";
import {
  currencyLabel,
  fieldElementId,
  methodOptions,
  type FormField,
  type ModalIds,
  type SettlementFormValues,
  type ValidationError,
} from "./settlementFormLogic";

/*
 * Ödeme ve tahsilat modallarının ortak form parçaları (APM/EPM/CMP aynı işaretleme): başlık, alan
 * hatası bağlantısı, iş yeri sütunu, para birimi seçicisi, nakit/banka fon kutuları, açıklama ve
 * düzeltme gerekçesi. Hata metni modal başındaki tek `.alert` listesindedir; alan `aria-describedby`
 * ile yalnız hata görünürken ona bağlanır (MWG accessible-error-announcement).
 */

export type FieldError = { invalid: boolean; describedBy: string | undefined };

/** Gösterilen hatalardan alanın ARIA durumu. */
export function fieldErrorOf(
  errors: readonly ValidationError[],
  ids: ModalIds,
  form: Pick<SettlementFormValues, "method">,
  field: FormField,
): FieldError {
  const invalid = errors.some((error) => error.field === field);
  const elementId = fieldElementId(ids, field, form);
  return { invalid, describedBy: invalid && elementId ? `${elementId}-error` : undefined };
}

/** Hata listesi maddeleri: alanın ilk hatası `<öğe>-error` kimliğini taşır. */
export function errorItems(
  errors: readonly ValidationError[],
  ids: ModalIds,
  form: Pick<SettlementFormValues, "method">,
  text: (key: string) => string,
): { id: string; text: string }[] {
  const used = new Set<string>();
  return errors.map((error, index) => {
    const base = `${fieldElementId(ids, error.field, form) ?? "settlementForm"}-error`;
    const id = used.has(base) ? `${base}-${index}` : base;
    used.add(base);
    return { id, text: text(error.key) };
  });
}

export function ModalHeader({
  titleId,
  icon,
  title,
  className,
  onClose,
}: {
  titleId: string;
  icon: string;
  title: string;
  className?: string;
  onClose: () => void;
}) {
  const { tm } = useModalText();
  return (
    <div className={className ? `modal-header ${className}` : "modal-header"}>
      <h5 className="modal-title" id={titleId}>
        <i className={`fas ${icon}`} aria-hidden="true" /> {title}
      </h5>
      <button
        type="button"
        className="close"
        data-dismiss="modal"
        aria-label={tm("shared.close")}
        onClick={onClose}
      >
        <span aria-hidden="true">&times;</span>
      </button>
    </div>
  );
}

export function MethodSelect({
  id,
  label,
  mode,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  mode: "add" | "edit";
  value: PayMethod | "";
  onChange: (method: PayMethod | "") => void;
  error: FieldError;
}) {
  const { tm } = useModalText();
  return (
    <div className="form-group">
      <label htmlFor={id} className="required-field">
        <i className="fas fa-credit-card" aria-hidden="true" /> {label}
      </label>
      <select
        id={id}
        name={id}
        className="form-control no-select2"
        required
        value={value}
        onChange={(event) => onChange(event.target.value as PayMethod | "")}
        aria-invalid={error.invalid}
        aria-describedby={error.describedBy}
      >
        <option value="">{tm("shared.select")}</option>
        {methodOptions(mode).map((method) => (
          <option key={method} value={method}>
            {tm(`method.${method}`)}
          </option>
        ))}
      </select>
    </div>
  );
}

export function DateInput({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: FieldError;
}) {
  return (
    <div className="form-group">
      <label htmlFor={id} className="required-field">
        <i className="fas fa-calendar" aria-hidden="true" /> {label}
      </label>
      <input
        id={id}
        name={id}
        type="date"
        className="form-control"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error.invalid}
        aria-describedby={error.describedBy}
      />
    </div>
  );
}

export function DocumentNoInput({
  id,
  label,
  placeholder,
  help,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="form-group">
      <label htmlFor={id}>
        <i className="fas fa-file-alt" aria-hidden="true" /> {label}
      </label>
      <input
        id={id}
        name={id}
        className="form-control"
        placeholder={placeholder}
        maxLength={50}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <Help>{help}</Help>
    </div>
  );
}

/** "İş Yeri Bilgisi" sütunu (`ZtoBranchSelect` varyant A, yerel select — ZTO `no-select2`). */
export function BranchGroup({
  id,
  help,
  value,
  onChange,
  companyId,
  error,
}: {
  id: string;
  help: string;
  value: string;
  onChange: (branchId: string) => void;
  /** Kaydın/ön değerin şirketi (Rev 1 F5); undefined → aktif şirket. */
  companyId: string | null | undefined;
  error: FieldError;
}) {
  const { tm } = useModalText();
  return (
    <div className="field-group">
      <div className="field-group-title">
        <i className="fas fa-building" aria-hidden="true" /> {tm("shared.workPlaceTitle")}
      </div>
      <div className="form-group">
        <label htmlFor={id} className="required-field">
          <i className="fas fa-industry" aria-hidden="true" /> {tm("shared.workPlace")}
        </label>
        <ZtoBranchSelect
          id={id}
          name={id}
          className="form-control no-select2"
          required
          value={value}
          onChange={onChange}
          companyId={companyId === undefined ? "active" : companyId}
          placeholder={tm("shared.select")}
          aria-invalid={error.invalid}
          aria-describedby={error.describedBy}
        />
        <Help icon="fa-info-circle">{help}</Help>
      </div>
    </div>
  );
}

export function CurrencySelect({
  id,
  value,
  onChange,
  disabled,
  withPlaceholder,
  help,
  lockNote,
  error,
}: {
  id: string;
  value: string;
  onChange: (currency: string) => void;
  disabled: boolean;
  /** Tahsilatta (CMP) ilk seçenek "Seçiniz"; ödemede (APM) yok. */
  withPlaceholder?: boolean;
  help: string;
  /** Ciro kilidi notu ("Ciro modunda değiştirilemez"). */
  lockNote?: string | null;
  error?: FieldError;
}) {
  const { tm } = useModalText();
  const currencies = useCurrencies();
  const list = currencies.data ?? [];
  const known = list.some((currency) => currency.code === value);
  return (
    <div className="form-group">
      <label htmlFor={id} className="required-field">
        <i className="fas fa-coins" aria-hidden="true" /> {tm("shared.currency")}
      </label>
      <select
        id={id}
        name={id}
        className="form-control no-select2"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-invalid={error?.invalid ?? false}
        aria-describedby={error?.describedBy}
      >
        {withPlaceholder && <option value="">{tm("shared.select")}</option>}
        {!known && value && <option value={value}>{value}</option>}
        {list.map((currency) => (
          <option key={currency.code} value={currency.code}>
            {currencyLabel(currency)}
          </option>
        ))}
      </select>
      {lockNote && (
        <small className="form-text text-warning">
          <i className="fas fa-lock" aria-hidden="true" /> {lockNote}
        </small>
      )}
      <Help>{help}</Help>
    </div>
  );
}

/** Nakit / banka fon kutusu (`#cashFields` / `#bankFields`). */
export function FundGroup({
  containerId,
  selectId,
  kind,
  title,
  branchId,
  companyId,
  value,
  onChange,
  error,
  display,
}: {
  containerId: string;
  selectId: string;
  kind: "CASH" | "BANK";
  title: string;
  branchId: string;
  companyId: string | null | undefined;
  value: string;
  onChange: (fundAccountId: string, fund: Fund | null) => void;
  error: FieldError;
  /** Banka/Kasa Hareketleri'nden gelen kilitli fon (`#BankIDDisplay`, CMP deseni). */
  display?: string | null;
}) {
  const { tm } = useModalText();
  const labelId = `${selectId}-label`;
  return (
    <div id={containerId}>
      <div className="field-group">
        <div className="field-group-title">
          <i
            className={kind === "CASH" ? "fas fa-wallet" : "fas fa-university"}
            aria-hidden="true"
          />{" "}
          {title}
        </div>
        <div className="form-group">
          <label
            id={labelId}
            className="required-field"
            htmlFor={display ? `${selectId}Display` : undefined}
          >
            <i
              className={kind === "CASH" ? "fas fa-cash-register" : "fas fa-building"}
              aria-hidden="true"
            />{" "}
            {kind === "CASH" ? tm("fund.cashLabel") : tm("fund.bankLabel")}
          </label>
          {display ? (
            <input
              type="text"
              id={`${selectId}Display`}
              className="form-control"
              readOnly
              style={{ backgroundColor: "#e9ecef", cursor: "not-allowed" }}
              value={display}
            />
          ) : (
            <FundSelect
              id={selectId}
              kind={kind}
              branchId={branchId}
              companyId={companyId}
              value={value}
              onChange={onChange}
              ariaLabelledBy={error.describedBy ? `${labelId} ${error.describedBy}` : labelId}
            />
          )}
          <Help icon="fa-filter">
            {kind === "CASH" ? tm("fund.cashHelp") : tm("fund.bankHelp")}
          </Help>
        </div>
      </div>
    </div>
  );
}

export function DescriptionGroup({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="form-group">
      <label htmlFor={id}>
        <i className="fas fa-align-left" aria-hidden="true" /> {label}
      </label>
      <textarea
        id={id}
        name="Description"
        className="form-control"
        rows={3}
        maxLength={500}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

/** Düzenleme: isteğe bağlı "Düzeltme gerekçesi" (Blackrose eki, OK-12.2a-16). */
export function ReasonGroup({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { tm } = useModalText();
  return (
    <div className="form-group">
      <label htmlFor={id}>
        <small>{tm("shared.correctionReason")}</small>
      </label>
      <textarea
        id={id}
        name="CorrectionReason"
        className="form-control"
        rows={2}
        maxLength={500}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function ModalFooter({
  pending,
  onCancel,
  onSave,
  update,
}: {
  pending: boolean;
  onCancel: () => void;
  onSave: () => void;
  /** Tahsilat düzenleme: "Güncelle" `btn-primary btn-update` (CMP:1522-1528). */
  update?: boolean;
}) {
  const { tm } = useModalText();
  return (
    <div className="modal-footer">
      <button type="button" className="btn btn-secondary" data-dismiss="modal" onClick={onCancel}>
        <i className="fas fa-times" aria-hidden="true" /> {tm("shared.cancel")}
      </button>
      <button
        type="button"
        className={update ? "btn btn-primary btn-update" : "btn btn-success btn-save"}
        onClick={onSave}
        disabled={pending}
        aria-busy={pending || undefined}
      >
        <i className={pending ? "fas fa-spinner fa-spin" : "fas fa-save"} aria-hidden="true" />{" "}
        {update ? tm("shared.update") : tm("shared.save")}
      </button>
    </div>
  );
}
