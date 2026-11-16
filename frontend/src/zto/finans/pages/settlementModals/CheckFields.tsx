import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useAccountList } from "../../../../pages/finance/accountApi";
import { useCheckLeafLookup, useCheckLeaves } from "../../../../pages/finance/instrumentApi";
import { useEndorsableChecks } from "../../../../pages/finance/settlementApi";
import type { CheckLeaf, Instrument } from "../../../../pages/finance/types";
import { formatMoney, formatN2 } from "../../../components";
import { FundSelect } from "./FundSelect";
import type {
  CheckFieldsProps,
  CheckFieldsValue,
  CheckLeafGuardResult,
  IssuedCheckMode,
  ReceivedCheckStatus,
} from "./index";
import { Help, useModalText } from "./parts";
import { dottedDate, endorsableLabel } from "./settlementFormLogic";
import { useCheckLeafGuard, type LeafGuardEditing } from "./useCheckLeafGuard";

/*
 * Çek alanları (12.2a_TASARIM §5.9; 12.3 §5.10). issued = ödeme (APM:706-917): "Kendi Çekimiz" /
 * "Müşteri Çeki Ciro Et"; received = tahsilat (CMP:417-616): "Bankaya Yatırıldı" / "Portföyde (Elde)"
 * / "Kasaya Al (Ciro)". 12.3: koçan seçici (yalnız kullanılmamış yapraklar; düzenlemede kaydın kendi
 * yaprağı başta), "Manuel Çek Numarası Gir" ↔ "Koçandan Seç" (payments.js:849-873), manuel numarada
 * koçan yaprağı denetimi (CLG), keşide tarihi, şube adı ve çek açıklaması. Ciro seçicide düzenlenen
 * kaydın ciro edilmiş çeki başa eklenir ve seçili gelir (Rev 1 F1).
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
  editing,
  onLeafGuardChange,
}: CheckFieldsProps) {
  const { tm } = useModalText();
  const set = (patch: Partial<CheckFieldsValue>) => onChange({ ...value, ...patch });
  const endorse = value.mode === "ENDORSE";
  const checks = useEndorsableChecks(companyId, null, { enabled: endorse });
  const accounts = useAccountList({ active: true }, { enabled: endorse });
  const drawerOf = useMemo(() => {
    const names = new Map((accounts.data ?? []).map((account) => [account.id, account.name]));
    return (accountId: string | null) => (accountId ? (names.get(accountId) ?? null) : null);
  }, [accounts.data]);
  // Düzenleme: kaydın ciro ettiği çek (ENDORSED) portföy listesinde yok; başa eklenir (Rev 1 F1).
  const editedEndorsed: Instrument | null =
    editing?.currentInstrument && editing.currentInstrument.direction === "RECEIVED"
      ? editing.currentInstrument
      : null;
  const list = useMemo(() => {
    const rows = checks.data ?? [];
    if (!editedEndorsed) return rows;
    return [editedEndorsed, ...rows.filter((check) => check.id !== editedEndorsed.id)];
  }, [checks.data, editedEndorsed]);
  const selected = list.find((check) => check.id === value.instrumentId) ?? null;

  // Ön seçili çek (derin bağlantı "Ciro Et", düzenleme) liste gelince bir kez bildirilir: tutar ve
  // para birimi çekten kilitlenir.
  const reportedCheck = useRef("");
  const latestOnEndorsed = useRef(onEndorsedCheck);
  latestOnEndorsed.current = onEndorsedCheck;
  useEffect(() => {
    if (!endorse || !selected || reportedCheck.current === selected.id) return;
    reportedCheck.current = selected.id;
    latestOnEndorsed.current?.(selected);
  }, [endorse, selected]);

  const setMode = (mode: IssuedCheckMode) => {
    if (mode === value.mode) return;
    set({ mode, instrumentId: "" });
    onEndorsedCheck?.(null);
  };

  const pickCheck = (id: string) => {
    set({ instrumentId: id });
    reportedCheck.current = id;
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
  } else if (checks.data && list.length === 0 && !editedEndorsed) {
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
                  {checks.data && list.length === 0 && !editedEndorsed && (
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
                    const bank = {
                      fundAccountId,
                      bankName: picked?.bankName ?? "",
                      bankBranch: picked?.bankBranchName ?? "",
                    };
                    // Yalnız bildirim (ön seçim/düzenleme): numara ve yaprak korunur. Banka değişince
                    // ZTO gibi numara temizlenir ve koçan kipine dönülür (payments.js:808-833).
                    set(
                      fundAccountId === value.fundAccountId
                        ? bank
                        : { ...bank, number: "", checkLeafId: "", manualNumber: false },
                    );
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
              <OwnCheckNumberFields
                value={value}
                set={set}
                companyId={companyId}
                editing={editing}
                errors={errors}
                disabled={disabled}
                onLeafGuardChange={onLeafGuardChange}
              />
              <DescriptionInput
                id="CheckDescription"
                label={tm("check.description")}
                placeholder={tm("check.descriptionPlaceholder")}
                value={value.description ?? ""}
                onChange={(description) => set({ description })}
                disabled={disabled}
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
                set({
                  status,
                  fundAccountId: status === "AT_BANK" ? value.fundAccountId : "",
                  custodyFundId: status === "AT_BANK" ? "" : value.custodyFundId,
                })
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
                maxLength={100}
                autoComplete="off"
                value={value.bankBranch ?? ""}
                onChange={(event) => set({ bankBranch: event.target.value })}
                disabled={disabled}
              />
              <Help>{tm("check.receivedBranchHelp")}</Help>
            </div>
          </div>
          <div className="col-md-3">
            <IssueDateInput
              id="IssueDate"
              label={tm("check.issueDate")}
              required
              value={value.issueDate ?? ""}
              onChange={(issueDate) => set({ issueDate })}
              error={errors.issueDate}
              disabled={disabled}
            />
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
        <DescriptionInput
          id="CheckDescription"
          label={tm("check.description")}
          placeholder={tm("check.descriptionPlaceholder")}
          value={value.description ?? ""}
          onChange={(description) => set({ description })}
          disabled={disabled}
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
  readOnly,
  guard,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  labelRequired?: boolean;
  /** "Kendi Çekimiz" koçan kipinde numara koçandan dolar (APM `readonly`). */
  readOnly?: boolean;
  /** Manuel numaranın koçan denetimi (CLG notu input altında; engelde kırmızı çerçeve). */
  guard?: CheckLeafGuardResult;
}) {
  const { tm } = useModalText();
  const blocked = guard?.state === "leafUsed" || guard?.state === "leafManualForbidden";
  const note = guard?.message ? "CheckNumber-leaf" : undefined;
  const describedBy = [errorProps(error, "CheckNumber")["aria-describedby"], note]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="form-group">
      <label htmlFor="CheckNumber" className={labelRequired ? "required-field" : undefined}>
        <i className="fas fa-hashtag" aria-hidden="true" /> {tm("check.number")}
      </label>
      <input
        type="text"
        id="CheckNumber"
        name="CheckNumber"
        className={blocked ? "form-control chk-leaf-blocked" : "form-control"}
        placeholder="1234567"
        maxLength={7}
        pattern="[0-9]{7}"
        inputMode="numeric"
        autoComplete="off"
        required
        readOnly={readOnly}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        aria-invalid={!!error || blocked}
        aria-describedby={describedBy || undefined}
      />
      <small className="form-text text-muted">
        <i className="fas fa-info-circle" aria-hidden="true" /> {tm("check.numberHelp")}
      </small>
      {guard?.message && (
        <small
          id="CheckNumber-leaf"
          className={`form-text chk-leaf-note ${blocked ? "chk-bad" : "chk-ok"}`}
        >
          <i
            className={`fas ${blocked ? "fa-ban" : "fa-check-circle"}`}
            style={{ fontSize: 10 }}
            aria-hidden="true"
          />{" "}
          {guard.message}
        </small>
      )}
    </div>
  );
}

/**
 * "Kendi Çekimiz" koçan / numara satırları (APM:825-901): Çek Koçanı (yalnız kullanılmamış yapraklar;
 * ZTO seçenek metni "Yaprak {n} - Çek No: {no} ({seri})"), "Manuel Çek Numarası Gir" ↔ "Koçandan
 * Seç", Çek Numarası (koçan kipinde salt okunur), Banka Adı / Şube Adı (bankadan), Keşide ve Vade.
 */
function OwnCheckNumberFields({
  value,
  set,
  companyId,
  editing,
  errors,
  disabled,
  onLeafGuardChange,
}: {
  value: CheckFieldsValue;
  set: (patch: Partial<CheckFieldsValue>) => void;
  companyId: string | null;
  editing: CheckFieldsProps["editing"];
  errors: NonNullable<CheckFieldsProps["errors"]>;
  disabled?: boolean;
  onLeafGuardChange?: CheckFieldsProps["onLeafGuardChange"];
}) {
  const { tm } = useModalText();
  const manual = !!value.manualNumber;
  const fundAccountId = value.fundAccountId;
  const leaves = useCheckLeaves(
    { fundAccountId, status: "UNUSED", companyId },
    { enabled: !!fundAccountId },
  );
  // Düzenleme: kaydın kendi yaprağı (USED) UNUSED listesinde yok; numarasıyla aranıp başa eklenir.
  const currentLeafId = editing?.currentLeafId ?? null;
  const currentInstrument = editing?.currentInstrument ?? null;
  const ownLeafMissing =
    !!currentLeafId && !(leaves.data?.rows ?? []).some((leaf) => leaf.id === currentLeafId);
  const currentLookup = useCheckLeafLookup(
    ownLeafMissing ? (currentInstrument?.number ?? null) : null,
    fundAccountId,
    { companyId, enabled: ownLeafMissing && !!fundAccountId },
  );
  const options = useMemo<CheckLeaf[]>(() => {
    const rows = leaves.data?.rows ?? [];
    const own = currentLeafId
      ? (currentLookup.data ?? []).find((leaf) => leaf.id === currentLeafId)
      : undefined;
    return own ? [own, ...rows] : rows;
  }, [leaves.data, currentLookup.data, currentLeafId]);

  const guardEditing = useMemo<LeafGuardEditing | null>(
    () =>
      editing
        ? {
            currentLeafId,
            currentNumber: currentInstrument?.number ?? null,
            currentFundAccountId: currentInstrument?.fundAccountId ?? null,
          }
        : null,
    [editing, currentLeafId, currentInstrument],
  );
  const guard = useCheckLeafGuard(value.number, fundAccountId, guardEditing, {
    enabled: manual && !disabled,
    companyId,
  });
  const latestGuardChange = useRef(onLeafGuardChange);
  latestGuardChange.current = onLeafGuardChange;
  useEffect(() => {
    latestGuardChange.current?.(guard.state);
  }, [guard.state]);
  // Bölüm kapanınca (yöntem/tür değişimi) engel kalkar.
  useEffect(() => () => latestGuardChange.current?.("idle"), []);

  /** ZTO GetAvailableCheckBooks displayText: "Yaprak {n} - Çek No: {no} ({seri})". */
  const leafOptionText = (leaf: CheckLeaf) => {
    const text = tm("check.leafOption", { leaf: leaf.leafNo, number: leaf.number });
    return leaf.checkBookSerial
      ? `${text} ${tm("check.leafOptionSerial", { serial: leaf.checkBookSerial })}`
      : text;
  };

  const pickLeaf = (leafId: string) => {
    const leaf = options.find((item) => item.id === leafId) ?? null;
    set({ checkLeafId: leaf ? leaf.id : "", number: leaf ? leaf.number : "" });
  };

  const toggleManual = () => {
    if (manual) {
      set({ manualNumber: false, number: "", checkLeafId: "" });
    } else {
      set({ manualNumber: true, checkLeafId: "" });
      requestAnimationFrame(() => document.getElementById("CheckNumber")?.focus());
    }
  };

  let placeholder = tm("check.checkBookPlaceholder");
  if (fundAccountId) {
    if (leaves.isPending) placeholder = tm("check.checkBookLoading");
    else if (leaves.isError) placeholder = tm("check.checkBookLoadFailed");
    else if (options.length === 0) placeholder = tm("check.checkBookEmpty");
    else placeholder = tm("check.checkBook");
  }

  return (
    <>
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
              value={manual ? "" : value.checkLeafId || ""}
              onChange={(event) => pickLeaf(event.target.value)}
              disabled={disabled || manual || !fundAccountId}
              aria-describedby="CheckBookID-help"
            >
              <option value="">{placeholder}</option>
              {options.map((leaf) => (
                <option key={leaf.id} value={leaf.id} style={{ color: "#28a745" }}>
                  {leafOptionText(leaf)}
                </option>
              ))}
            </select>
            <small className="form-text text-muted" id="CheckBookID-help">
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
              onClick={toggleManual}
              disabled={disabled}
              aria-pressed={manual}
            >
              <i className={`fas ${manual ? "fa-book" : "fa-edit"}`} aria-hidden="true" />{" "}
              {manual ? tm("check.fromBook") : tm("check.manual")}
            </button>
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
            readOnly={!manual}
            guard={manual ? guard : undefined}
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
              <i className="fas fa-code-branch" aria-hidden="true" /> {tm("check.branchName")}
            </label>
            <input
              type="text"
              id="BranchName"
              name="BranchName"
              className="form-control"
              placeholder={tm("check.autoFill")}
              readOnly
              value={fundAccountId ? (value.bankBranch ?? "") : ""}
            />
            <Help>{tm("check.autoFillHelp")}</Help>
          </div>
        </div>
        <div className="col-md-3">
          <IssueDateInput
            id="IssueDate"
            label={tm("check.issueDate")}
            value={value.issueDate ?? ""}
            onChange={(issueDate) => set({ issueDate })}
            error={errors.issueDate}
            disabled={disabled}
          />
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
    </>
  );
}

/** Keşide / Düzenlenme tarihi (APM/CMP; varsayılan bugün, vadeden sonra olamaz). */
export function IssueDateInput({
  id,
  label,
  required,
  value,
  onChange,
  error,
  disabled,
}: {
  id: string;
  label: string;
  /** Tahsilatta (CMP) etiket yıldızlı; ödemede (APM) etiket yıldızsız, alan yine `required`. */
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}) {
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
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        {...errorProps(error, id)}
      />
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

/** Çek / senet açıklaması (`instrument.description`, ≤ 500). */
export function DescriptionInput({
  id,
  label,
  placeholder,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
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
        maxLength={500}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    </div>
  );
}
