import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useAccountList } from "../../../../pages/finance/accountApi";
import { useEndorsableChecks } from "../../../../pages/finance/settlementApi";
import type { Fund } from "../../../../pages/finance/types";
import { formatMoney, formatN2 } from "../../../components";
import { FundSelect } from "./FundSelect";
import type {
  CheckFieldsProps,
  CheckFieldsValue,
  IssuedCheckMode,
  ReceivedCheckStatus,
} from "./index";
import { Help, PhaseNote, useModalText } from "./parts";
import { dottedDate, endorsableLabel, todayIso } from "./settlementFormLogic";

/*
 * Çek alanları (12.2a_TASARIM §5.9). issued = ödeme (APM:706-917): "Kendi Çekimiz" / "Müşteri Çeki
 * Ciro Et"; received = tahsilat (CMP:417-616): "Bankaya Yatırıldı" / "Portföyde (Elde)" / "Kasaya Al
 * (Ciro)". Koçan, manuel numara düğmesi, keşide tarihi, şube adı (tahsilat) ve çek açıklaması 12.3'e
 * kadar devre dışı (OK-12.2a-10); çek numarası her zaman elle girilir (`^\d{7}$` istemcide).
 * Çek durumu/türü Bootstrap 4 `.btn-group-toggle` radyolarıdır (gerçek `input[type=radio]` + `label`,
 * grup `role="radiogroup"`; MWG forms).
 */

type Toggle<T extends string> = {
  value: T;
  /** Ödeme çek türü: `label#btnOwnCheck`; tahsilat çek durumu: `input#checkStatusBank`. */
  labelId?: string;
  inputId?: string;
  className: string;
  icon: string;
  label: string;
  inputValue: string;
  style?: CSSProperties;
};

function ToggleGroup<T extends string>({
  name,
  labelledBy,
  id,
  options,
  value,
  onChange,
  disabled,
}: {
  name: string;
  labelledBy: string;
  id?: string;
  options: Toggle<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const [focused, setFocused] = useState<T | null>(null);
  return (
    <div
      className="btn-group btn-group-toggle w-100"
      data-toggle="buttons"
      id={id}
      role="radiogroup"
      aria-labelledby={labelledBy}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <label
            key={option.value}
            id={option.labelId}
            className={[
              "btn",
              option.className,
              checked ? "active" : "",
              focused === option.value ? "focus" : "",
              disabled ? "disabled" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            style={option.style}
          >
            <input
              type="radio"
              name={name}
              id={option.inputId}
              value={option.inputValue}
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(option.value)}
              onFocus={() => setFocused(option.value)}
              onBlur={() => setFocused(null)}
            />
            <i className={`fas ${option.icon}`} aria-hidden="true" /> {option.label}
          </label>
        );
      })}
    </div>
  );
}

function errorProps(error: string | undefined, id: string) {
  return {
    "aria-invalid": !!error,
    "aria-describedby": error ? `${id}-error` : undefined,
  };
}

export function CheckFields(props: CheckFieldsProps) {
  return props.variant === "issued" ? <IssuedCheck {...props} /> : <ReceivedCheck {...props} />;
}

function IssuedCheck({
  value,
  onChange,
  branchId,
  companyId,
  currency,
  onEndorsedCheck,
  errors = {},
  disabled,
}: CheckFieldsProps) {
  const { tm } = useModalText();
  const set = (patch: Partial<CheckFieldsValue>) => onChange({ ...value, ...patch });
  const endorse = value.mode === "ENDORSE";
  const checks = useEndorsableChecks(companyId, null, { enabled: endorse });
  const accounts = useAccountList({ active: true }, { enabled: endorse });
  const [fund, setFund] = useState<Fund | null>(null);
  const drawerOf = useMemo(() => {
    const names = new Map((accounts.data ?? []).map((account) => [account.id, account.name]));
    return (accountId: string) => names.get(accountId) ?? null;
  }, [accounts.data]);
  const list = checks.data ?? [];
  const selected = list.find((check) => check.id === value.instrumentId) ?? null;

  const setMode = (mode: IssuedCheckMode) => {
    if (mode === value.mode) return;
    set({ mode, instrumentId: "" });
    onEndorsedCheck?.(null);
  };

  const pickCheck = (id: string) => {
    set({ instrumentId: id });
    onEndorsedCheck?.(list.find((check) => check.id === id) ?? null);
  };

  const options: Toggle<IssuedCheckMode>[] = [
    {
      value: "OWN",
      labelId: "btnOwnCheck",
      className: "btn-outline-primary",
      icon: "fa-book",
      label: tm("check.own"),
      inputValue: "own",
    },
    {
      value: "ENDORSE",
      labelId: "btnEndorseCheck",
      className: "btn-outline-success",
      icon: "fa-random",
      label: tm("check.endorse"),
      inputValue: "endorse",
    },
  ];

  let helpText: ReactNode = (
    <>
      {tm("check.endorsableHelpLead")} <strong>{tm("check.endorsableHelpStatus")}</strong>
      {tm("check.endorsableHelpTail")}
    </>
  );
  if (checks.isFetching) {
    helpText = (
      <>
        <i className="fas fa-spinner fa-spin" id="endorsableCheckLoader" aria-hidden="true" />{" "}
        {helpText}
      </>
    );
  } else if (checks.data && list.length === 0) {
    helpText = (
      <>
        <i className="fas fa-info-circle text-warning" aria-hidden="true" />{" "}
        {tm("check.endorsableEmptyHelp")}
      </>
    );
  } else if (list.length > 0) {
    helpText = (
      <>
        <i className="fas fa-check-circle text-success" aria-hidden="true" />{" "}
        {tm("check.endorsableFound", { count: list.length })}
      </>
    );
  }

  return (
    <div id="ownCheckSection">
      <div id="checkFields">
        <div className="field-group">
          <div className="field-group-title">
            <i className="fas fa-money-check" aria-hidden="true" /> {tm("check.title")}
          </div>
          <div className="form-group">
            <label className="font-weight-bold" id="checkTypeLabel">
              <i className="fas fa-exchange-alt" aria-hidden="true" /> {tm("check.type")}
            </label>
            <ToggleGroup
              id="checkTypeToggle"
              name="checkTypeOption"
              labelledBy="checkTypeLabel"
              options={options}
              value={value.mode}
              onChange={setMode}
              disabled={disabled}
            />
            <Help>{tm("check.typeHelp")}</Help>
          </div>

          {endorse && (
            <div id="endorsableCheckSection">
              <div className="alert alert-success" style={{ fontSize: 11 }}>
                <i className="fas fa-info-circle" aria-hidden="true" />{" "}
                <strong>{tm("check.endorseInfoLead")}</strong>
                {tm("check.endorseInfoText")}
                <span className="badge badge-warning">{tm("check.endorseInfoBadge")}</span>{" "}
                {tm("check.endorseInfoTail")}
              </div>
              <div className="form-group">
                <label htmlFor="EndorsableCheckID" className="required-field">
                  <i className="fas fa-money-check-alt" aria-hidden="true" />{" "}
                  {tm("check.endorsable")}
                </label>
                <select
                  id="EndorsableCheckID"
                  name="EndorsableCheckID"
                  className="form-control no-select2"
                  value={selected ? value.instrumentId : ""}
                  onChange={(event) => pickCheck(event.target.value)}
                  disabled={disabled}
                  required
                  {...errorProps(errors.instrumentId, "EndorsableCheckID")}
                >
                  <option value="">
                    {checks.isPending
                      ? tm("check.endorsableLoading")
                      : tm("check.endorsablePlaceholder")}
                  </option>
                  {checks.isError && <option value="">{tm("check.endorsableLoadFailed")}</option>}
                  {checks.data && list.length === 0 && (
                    <option value="" disabled>
                      {tm("check.endorsableEmpty")}
                    </option>
                  )}
                  {list.map((check) => (
                    <option key={check.id} value={check.id}>
                      {endorsableLabel(check, drawerOf(check.accountId), formatN2, tm)}
                    </option>
                  ))}
                </select>
                <small className="form-text text-muted" id="endorsableCheckHelpText">
                  {helpText}
                </small>
              </div>
              {selected && (
                <div id="selectedEndorsableCheckInfo">
                  <div className="card border-success" style={{ fontSize: 12 }}>
                    <div className="card-header bg-success text-white py-2">
                      <i className="fas fa-check-circle" aria-hidden="true" />{" "}
                      {tm("check.selectedTitle")}
                    </div>
                    <div className="card-body py-2">
                      <div className="row">
                        <InfoCell label={tm("check.infoNumber")} id="infoCheckNumber">
                          {selected.number}
                        </InfoCell>
                        <InfoCell label={tm("check.infoBank")} id="infoCheckBank">
                          {selected.bankName ?? "-"}
                        </InfoCell>
                        <InfoCell
                          label={tm("check.infoAmount")}
                          id="infoCheckAmount"
                          className="text-success"
                          style={{ fontSize: 15 }}
                        >
                          {formatMoney(selected.money.amount, selected.money.currency)}
                        </InfoCell>
                        <InfoCell label={tm("check.infoDueDate")} id="infoCheckDueDate" top>
                          {dottedDate(selected.dueDate)}
                        </InfoCell>
                        <InfoCell label={tm("check.infoDrawer")} id="infoCheckDrawer" top>
                          {drawerOf(selected.accountId) ?? "-"}
                        </InfoCell>
                        <InfoCell label={tm("check.infoCash")} id="infoCheckCash" top>
                          -
                        </InfoCell>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {!endorse && (
            <div id="ownCheckFields">
              <div className="alert alert-info" style={{ fontSize: 11 }}>
                <i className="fas fa-info-circle" aria-hidden="true" />{" "}
                <strong>{tm("shared.note")}</strong> {tm("check.ownInfo")}
              </div>
              <div className="form-group">
                <label id="CheckBankID-label" className="required-field">
                  <i className="fas fa-university" aria-hidden="true" /> {tm("check.issuedBank")}
                </label>
                <FundSelect
                  id="CheckBankID"
                  kind="BANK"
                  branchId={branchId}
                  currency={currency}
                  companyId={companyId}
                  value={value.fundAccountId}
                  onChange={(fundAccountId, picked) => {
                    setFund(picked);
                    set({ fundAccountId, bankName: picked?.bankName ?? "" });
                  }}
                  disabled={disabled}
                  ariaLabelledBy={
                    errors.fundAccountId
                      ? "CheckBankID-label CheckBankID-error"
                      : "CheckBankID-label"
                  }
                />
                <Help icon="fa-filter">{tm("check.issuedBankHelp")}</Help>
              </div>
              <div className="form-row">
                <div className="col-md-6">
                  <div className="form-group">
                    <label htmlFor="CheckBookID">
                      <i className="fas fa-book" aria-hidden="true" /> {tm("check.checkBook")}
                    </label>
                    <select
                      id="CheckBookID"
                      name="CheckBookID"
                      className="form-control no-select2"
                      disabled
                      title={tm("shared.phase123")}
                      aria-describedby="CheckBookID-phase"
                    >
                      <option value="">{tm("check.checkBookPlaceholder")}</option>
                    </select>
                    <PhaseNote id="CheckBookID-phase" step="12.3" />
                    <small className="form-text text-muted">
                      <i className="fas fa-info-circle" aria-hidden="true" />{" "}
                      <span className="text-success">{tm("check.checkBookHelpGreen")}</span>{" "}
                      {tm("check.checkBookHelpUsable")}{" "}
                      <span className="text-muted">{tm("check.checkBookHelpGray")}</span>{" "}
                      {tm("check.checkBookHelpUsed")}
                    </small>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <i className="fas fa-receipt" aria-hidden="true" /> {tm("check.action")}
                    <button
                      type="button"
                      className="btn btn-sm btn-info"
                      id="toggleManualCheck"
                      style={{ fontSize: 11 }}
                      disabled
                      title={tm("shared.phase123")}
                      aria-describedby="toggleManualCheck-phase"
                    >
                      <i className="fas fa-edit" aria-hidden="true" /> {tm("check.manual")}
                    </button>
                    <PhaseNote id="toggleManualCheck-phase" step="12.3" />
                    <Help>{tm("check.manualHelp")}</Help>
                  </div>
                </div>
              </div>
              <div className="form-row">
                <div className="col-md-6">
                  <CheckNumberInput
                    value={value.number}
                    onChange={(number) => set({ number })}
                    error={errors.number}
                    disabled={disabled}
                  />
                </div>
                <div className="col-md-6">
                  <div className="form-group">
                    <label htmlFor="BankName">
                      <i className="fas fa-university" aria-hidden="true" /> {tm("check.bankName")}
                    </label>
                    <input
                      type="text"
                      id="BankName"
                      name="BankName"
                      className="form-control"
                      placeholder={tm("check.autoFill")}
                      readOnly
                      value={value.bankName}
                    />
                    <Help>{tm("check.autoFillHelp")}</Help>
                  </div>
                </div>
              </div>
              <div className="form-row">
                <div className="col-md-6">
                  <div className="form-group">
                    <label htmlFor="BranchName">
                      <i className="fas fa-code-branch" aria-hidden="true" />{" "}
                      {tm("check.branchName")}
                    </label>
                    <input
                      type="text"
                      id="BranchName"
                      name="BranchName"
                      className="form-control"
                      placeholder={tm("check.autoFill")}
                      readOnly
                      value={value.fundAccountId ? (fund?.bankBranchName ?? "") : ""}
                    />
                    <Help>{tm("check.autoFillHelp")}</Help>
                  </div>
                </div>
                <div className="col-md-3">
                  <IssueDateInput id="IssueDate" label={tm("check.issueDate")} />
                </div>
                <div className="col-md-3">
                  <DueDateInput
                    id="DueDate"
                    label={tm("check.dueDate")}
                    value={value.dueDate}
                    onChange={(dueDate) => set({ dueDate })}
                    error={errors.dueDate}
                    disabled={disabled}
                  />
                </div>
              </div>
              <DisabledDescription
                id="CheckDescription"
                label={tm("check.description")}
                placeholder={tm("check.descriptionPlaceholder")}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReceivedCheck({ value, onChange, errors = {}, disabled }: CheckFieldsProps) {
  const { tm } = useModalText();
  const set = (patch: Partial<CheckFieldsValue>) => onChange({ ...value, ...patch });
  const style = { padding: "6px 12px" };
  const options: Toggle<ReceivedCheckStatus>[] = [
    {
      value: "AT_BANK",
      inputId: "checkStatusBank",
      className: "btn-outline-primary",
      icon: "fa-university",
      label: tm("check.atBank"),
      inputValue: "Bankada",
      style,
    },
    {
      value: "PORTFOLIO",
      inputId: "checkStatusPortfolio",
      className: "btn-outline-success",
      icon: "fa-wallet",
      label: tm("check.portfolio"),
      inputValue: "Portföyde",
      style,
    },
    {
      value: "CASH_BOX",
      inputId: "checkStatusKasaCiro",
      className: "btn-outline-warning",
      icon: "fa-cash-register",
      label: tm("check.cashBox"),
      inputValue: "KasayaCiro",
      style,
    },
  ];
  return (
    <div id="checkFields">
      <div className="field-group">
        <div className="field-group-title">
          <i className="fas fa-money-check" aria-hidden="true" /> {tm("check.receivedTitle")}
        </div>
        <div className="alert alert-info" style={{ fontSize: 11 }}>
          <i className="fas fa-info-circle" aria-hidden="true" />{" "}
          <strong>{tm("shared.note")}</strong> {tm("check.receivedInfo")}
        </div>
        <div className="form-row mb-3">
          <div className="col-md-12">
            <label className="required-field" style={{ fontWeight: 600 }} id="checkStatusLabel">
              <i className="fas fa-info-circle" aria-hidden="true" /> {tm("check.status")}
            </label>
            <ToggleGroup
              name="CheckStatus"
              labelledBy="checkStatusLabel"
              options={options}
              value={value.status}
              onChange={(status) =>
                set({ status, fundAccountId: status === "AT_BANK" ? value.fundAccountId : "" })
              }
              disabled={disabled}
            />
            <small className="form-text text-muted">
              <i className="fas fa-lightbulb" aria-hidden="true" />{" "}
              <strong>{tm("check.atBankHelpLead")}</strong> {tm("check.atBankHelp")}
              <br />
              <strong>{tm("check.portfolioHelpLead")}</strong> {tm("check.portfolioHelp")}
              <br />
              <strong>{tm("check.cashBoxHelpLead")}</strong> {tm("check.cashBoxHelp")}
            </small>
          </div>
        </div>
        <div className="form-row">
          <div className="col-md-6">
            <CheckNumberInput
              value={value.number}
              onChange={(number) => set({ number })}
              error={errors.number}
              disabled={disabled}
              labelRequired
            />
          </div>
          <div className="col-md-6">
            <div className="form-group">
              <label htmlFor="BankName">
                <i className="fas fa-university" aria-hidden="true" /> {tm("check.receivedBank")}
              </label>
              <input
                type="text"
                id="BankName"
                name="BankName"
                className="form-control"
                placeholder={tm("check.receivedBankPlaceholder")}
                maxLength={100}
                autoComplete="off"
                value={value.bankName}
                onChange={(event) => set({ bankName: event.target.value })}
                disabled={disabled}
              />
              <Help>{tm("check.receivedBankHelp")}</Help>
            </div>
          </div>
        </div>
        <div className="form-row">
          <div className="col-md-6">
            <div className="form-group">
              <label htmlFor="BranchName">
                <i className="fas fa-code-branch" aria-hidden="true" /> {tm("check.branchName")}
              </label>
              <input
                type="text"
                id="BranchName"
                name="BranchName"
                className="form-control"
                placeholder={tm("check.receivedBranchPlaceholder")}
                disabled
                title={tm("shared.phase123")}
                aria-describedby="BranchName-phase"
              />
              <PhaseNote id="BranchName-phase" step="12.3" />
              <Help>{tm("check.receivedBranchHelp")}</Help>
            </div>
          </div>
          <div className="col-md-3">
            <IssueDateInput id="IssueDate" label={tm("check.issueDate")} required />
          </div>
          <div className="col-md-3">
            <DueDateInput
              id="DueDate"
              label={tm("check.dueDate")}
              value={value.dueDate}
              onChange={(dueDate) => set({ dueDate })}
              error={errors.dueDate}
              disabled={disabled}
              labelRequired
            />
          </div>
        </div>
        <DisabledDescription
          id="CheckDescription"
          label={tm("check.description")}
          placeholder={tm("check.descriptionPlaceholder")}
        />
      </div>
    </div>
  );
}

function InfoCell({
  label,
  id,
  children,
  className,
  style,
  top,
}: {
  label: string;
  id: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  top?: boolean;
}) {
  return (
    <div className={top ? "col-md-4 mt-1" : "col-md-4"}>
      <small className="text-muted d-block">{label}</small>
      <strong id={id} className={className} style={style}>
        {children}
      </strong>
    </div>
  );
}

function CheckNumberInput({
  value,
  onChange,
  error,
  disabled,
  labelRequired,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  labelRequired?: boolean;
}) {
  const { tm } = useModalText();
  return (
    <div className="form-group">
      <label htmlFor="CheckNumber" className={labelRequired ? "required-field" : undefined}>
        <i className="fas fa-hashtag" aria-hidden="true" /> {tm("check.number")}
      </label>
      <input
        type="text"
        id="CheckNumber"
        name="CheckNumber"
        className="form-control"
        placeholder="1234567"
        maxLength={7}
        pattern="[0-9]{7}"
        inputMode="numeric"
        autoComplete="off"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        {...errorProps(error, "CheckNumber")}
      />
      <small className="form-text text-muted">
        <i className="fas fa-info-circle" aria-hidden="true" /> {tm("check.numberHelp")}
      </small>
    </div>
  );
}

/** Keşide / Düzenlenme tarihi: 12.3'e kadar devre dışı, bugün gösterilir (gönderilmez). */
export function IssueDateInput({
  id,
  label,
  required,
}: {
  id: string;
  label: string;
  required?: boolean;
}) {
  const { tm } = useModalText();
  return (
    <div className="form-group">
      <label htmlFor={id} className={required ? "required-field" : undefined}>
        <i className="fas fa-calendar-plus" aria-hidden="true" /> {label}
      </label>
      <input
        type="date"
        id={id}
        name={id}
        className="form-control"
        value={todayIso()}
        readOnly
        disabled
        title={tm("shared.phase123")}
        aria-describedby={`${id}-phase`}
      />
      <PhaseNote id={`${id}-phase`} step="12.3" />
    </div>
  );
}

export function DueDateInput({
  id,
  label,
  value,
  onChange,
  error,
  disabled,
  labelRequired,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  /** Tahsilatta (CMP) etiket yıldızlı; ödemede (APM) etiket yıldızsız, alan yine `required`. */
  labelRequired?: boolean;
}) {
  return (
    <div className="form-group">
      <label htmlFor={id} className={labelRequired ? "required-field" : undefined}>
        <i className="fas fa-calendar-check" aria-hidden="true" /> {label}
      </label>
      <input
        type="date"
        id={id}
        name={id}
        className="form-control"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        {...errorProps(error, id)}
      />
    </div>
  );
}

/** Çek / senet açıklaması: 12.3'e kadar devre dışı (kolonu yok). */
export function DisabledDescription({
  id,
  label,
  placeholder,
}: {
  id: string;
  label: string;
  placeholder: string;
}) {
  const { tm } = useModalText();
  return (
    <div className="form-group">
      <label htmlFor={id}>
        <i className="fas fa-sticky-note" aria-hidden="true" /> {label}
      </label>
      <textarea
        id={id}
        name={id}
        className="form-control"
        rows={2}
        placeholder={placeholder}
        disabled
        title={tm("shared.phase123")}
        aria-describedby={`${id}-phase`}
      />
      <PhaseNote id={`${id}-phase`} step="12.3" />
    </div>
  );
}
