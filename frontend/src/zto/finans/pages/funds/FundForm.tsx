import { zodResolver } from "@hookform/resolvers/zod";
import { CSSProperties, ReactNode, useId, useMemo, useState } from "react";
import { Controller, useForm, type FieldPath, type UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../../../../auth/authStore";
import { useCurrencies, useMultiCompany } from "../../../../pages/finance/common";
import { useCreateFund, useFund, useUpdateFund } from "../../../../pages/finance/fundApi";
import type { FundDetail, FundKind } from "../../../../pages/finance/types";
import { errorIdOf, fieldA11yProps, fieldStateOf, useFormErrorAnnouncer } from "../../../a11y";
import { useBranchTree } from "../../../branch/branchTree";
import { ZtoBranchSelect, ZtoSelect, currencySymbol, formatN2 } from "../../../components";
import { errorCode, errorMessage } from "../../../components/definitionLogic";
import { ZTO_FINANS_BASE, ZTO_SLUGS } from "../../navItems";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { ZtoPageLoading } from "../../ZtoSuspenseOutlet";
import type { FundFlash } from "./BanksPage";
import {
  FUND_LIMITS,
  bankOptions,
  createFundBody,
  emptyFundForm,
  fundErrorField,
  fundFormFrom,
  fundFormSchema,
  needsOpeningRate,
  normalizeIban,
  updateFundBody,
  type FundFormValues,
} from "./fundFormLogic";
import { branchGroupName, branchIndex, companyNames } from "./fundsLogic";
import { todayIso } from "../fundTransactions/fundTransactionsLogic";

const RED: CSSProperties = { color: "red" };
const TOOLTIP_SHOWN: CSSProperties = { display: "block" };
const INFO_BUTTON: CSSProperties = { position: "relative" };

export type FundFormPageProps = { kind: FundKind; mode: "add" | "edit" };

/**
 * Banka / Kasa Yeni-Düzenle (ZTO BankIntroduction/Add.cshtml:45-212, Edit.cshtml:56-206;
 * CashIntroduction/Add.cshtml:45-160, Edit.cshtml; 12.2 §5.6, §5.8). Alan sırası ve etiketler ZTO;
 * Blackrose eki satırı Açıklama'dan sonra (Başlangıç Tarihi, Durum, Eksi bakiyeye izin ver).
 */
export function FundFormPage({ kind, mode }: FundFormPageProps) {
  useZtoRootClass(kind === "BANK" ? "zto-page-bank-form" : "zto-page-cash-form");
  const { id } = useParams();
  const { t } = useTranslation("ztoFinans");
  const editing = mode === "edit";
  const fund = useFund(editing ? id : undefined);
  if (editing && fund.isPending) return <ZtoPageLoading />;
  if (editing && (fund.isError || !fund.data)) {
    return (
      <div className="col-md-12">
        <br />
        <div className="alert alert-danger" role="alert">
          {errorMessage(fund.error, t("funds.form.loadFailed"))}
        </div>
      </div>
    );
  }
  if (editing && fund.data && (fund.data.accountType ?? "DEMAND") !== "DEMAND") {
    return (
      <div className="col-md-12">
        <br />
        <div className="alert alert-danger" role="alert">
          {t("funds.form.managedOnly")}
        </div>
      </div>
    );
  }
  return (
    <FundForm key={fund.data?.id ?? "new"} kind={kind} existing={editing ? fund.data : undefined} />
  );
}

type FormApi = UseFormReturn<FundFormValues>;

function FundForm({ kind, existing }: { kind: FundKind; existing?: FundDetail }) {
  const { t } = useTranslation("ztoFinans");
  const navigate = useNavigate();
  const currencies = useCurrencies();
  const tree = useBranchTree();
  const multiCompany = useMultiCompany();
  const me = useAuthStore((state) => state.me);
  const announcer = useFormErrorAnnouncer();
  const tipId = useId();
  const [tipOpen, setTipOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const bank = kind === "BANK";
  const editing = existing !== undefined;
  const f = (key: string, options?: Record<string, unknown>) => t(`funds.form.${key}`, options);
  const today = todayIso();
  const listPath = `${ZTO_FINANS_BASE}/${bank ? ZTO_SLUGS.banks : ZTO_SLUGS.cashes}`;

  const schema = useMemo(
    () =>
      fundFormSchema(kind, {
        required: t("funds.form.required"),
        selectRequired: t("funds.form.selectRequired"),
        ibanInvalid: t("funds.form.ibanInvalid"),
        numberInvalid: t("funds.form.numberInvalid"),
        tooLong: (max) => t("funds.form.tooLong", { max }),
      }),
    [kind, t],
  );
  const form = useForm<FundFormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    shouldFocusError: true,
    defaultValues: existing ? fundFormFrom(existing, today) : emptyFundForm(today),
  });
  const { register, handleSubmit, formState, setError, getFieldState, control, watch } = form;
  const branchId = watch("branchId");
  const watchedCurrency = watch("currency");
  const watchedOpening = watch("openingBalance");
  const showRate = needsOpeningRate({
    currency: existing?.currency ?? watchedCurrency ?? "",
    openingBalance: watchedOpening ?? "",
  });
  const branches = useMemo(() => branchIndex(tree.data), [tree.data]);
  const companies = useMemo(() => companyNames(me?.companies), [me?.companies]);
  const companyOfBranch = branches.get(branchId)?.companyId ?? null;

  const flash = (message: string): { state: { flash: FundFlash } } => ({
    state: { flash: { variant: "success", message } },
  });
  const onError = (error: Error) => {
    const code = errorCode(error);
    const field = fundErrorField(code);
    const message =
      code === "INSUFFICIENT_FUNDS"
        ? f("negativeOpening")
        : code === "RATE_MISSING"
          ? f("rateMissing")
          : code === "FUND_CODE_TAKEN"
            ? f("codeTaken")
            : errorMessage(error, f("saveFailed"));
    if (field === "openingRate" && !showRate) setFormError(message);
    else if (field && !(editing && field === "code"))
      setError(field, { message }, { shouldFocus: true });
    else setFormError(message);
  };
  const create = useCreateFund({
    onSuccess: () =>
      navigate(listPath, flash(bank ? t("funds.banks.created") : t("funds.cashes.created"))),
    onError,
  });
  const update = useUpdateFund({
    onSuccess: () =>
      navigate(listPath, flash(bank ? t("funds.banks.updated") : t("funds.cashes.updated"))),
    onError,
  });
  const saving = create.isPending || update.isPending;

  const field = (name: FieldPath<FundFormValues>, id: string, label: string) => {
    const base = register(name);
    const registered =
      name === "iban"
        ? {
            ...base,
            onChange: (event: Parameters<typeof base.onChange>[0]) => {
              event.target.value = normalizeIban(event.target.value);
              return base.onChange(event);
            },
          }
        : base;
    return {
      ...registered,
      ...fieldA11yProps(name, fieldStateOf(formState, name, { id })),
      onBlur: async (event: Parameters<typeof base.onBlur>[0]) => {
        await registered.onBlur(event);
        announcer.announceFieldError(name, label, getFieldState(name).error?.message);
      },
    };
  };
  const cls = (name: FieldPath<FundFormValues>, base = "form-control") => {
    const state = fieldStateOf(formState, name);
    return (state.touched || state.submitted) && state.error ? `${base} is-invalid` : base;
  };
  const star = (
    <span style={RED} aria-hidden="true">
      *
    </span>
  );
  const currencyOptions = (currencies.data ?? [{ code: "TRY", name: "Türk Lirası" }]).map((c) => ({
    value: c.code,
    label: `${currencySymbol(c.code)} - ${c.name}`,
  }));

  const codeField = (
    <>
      <label htmlFor={bank ? "BankCode" : "CashCode"} className="form-label">
        {bank ? f("code") : f("cashCode")}: {star}
      </label>
      <input
        type="text"
        className={cls("code")}
        required
        readOnly={editing}
        autoComplete="off"
        maxLength={FUND_LIMITS.code}
        {...field("code", bank ? "BankCode" : "CashCode", bank ? f("code") : f("cashCode"))}
      />
      <FieldError form={form} name="code" id={bank ? "BankCode" : "CashCode"} />
    </>
  );
  const nameLabel = bank ? (editing ? f("bankNameEdit") : f("accountName")) : f("cashName");
  const nameField = (
    <>
      <label htmlFor={bank ? "BankName" : "CashName"} className="form-label">
        {nameLabel}: {star}
      </label>
      <input
        type="text"
        className={cls("name")}
        required
        autoComplete="off"
        maxLength={FUND_LIMITS.name}
        {...field("name", bank ? "BankName" : "CashName", nameLabel)}
      />
      <FieldError form={form} name="name" id={bank ? "BankName" : "CashName"} />
    </>
  );
  const currencyField = (
    <>
      <label htmlFor="CurrencyID" className="form-label">
        {f("currency")}: {star}
      </label>
      <select
        className={cls("currency")}
        required
        disabled={editing}
        {...field("currency", "CurrencyID", f("currency"))}
      >
        <option value="" disabled>
          {f("choose")}
        </option>
        {currencyOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldError form={form} name="currency" id="CurrencyID" />
    </>
  );
  const branchField = (
    <>
      <label htmlFor="WorkPlaceID" className="form-label" id="WorkPlaceIDLabel">
        {f("workPlace")}: {star}
      </label>
      <Controller
        control={control}
        name="branchId"
        render={({ field: controlled }) => (
          <ZtoBranchSelect
            id="WorkPlaceID"
            name="WorkPlaceID"
            value={controlled.value}
            onChange={(value) => {
              controlled.onChange(value);
              controlled.onBlur();
            }}
            required
            companyId="active"
            placeholder={f("choose")}
            className={cls("branchId")}
          />
        )}
      />
      <FieldError form={form} name="branchId" id="WorkPlaceID" />
      {multiCompany && companyOfBranch && (
        <small className="text-muted d-block">
          {f("company", { name: companies.get(companyOfBranch) ?? "" })}
        </small>
      )}
    </>
  );
  const provinceField = (
    <>
      <label htmlFor="BranchProvinceID" className="form-label">
        {f("branchProvince")}: {star}
      </label>
      <input
        type="text"
        id="BranchProvinceID"
        className="form-control"
        readOnly
        value={branchGroupName(branches, branchId)}
      />
    </>
  );
  const openingField = (
    <>
      <label htmlFor="InitialBalance" className="form-label">
        {f("opening")}: {star}
      </label>
      <input
        type="number"
        step="0.01"
        inputMode="decimal"
        className={cls("openingBalance")}
        required
        {...field("openingBalance", "InitialBalance", f("opening"))}
      />
      <FieldError form={form} name="openingBalance" id="InitialBalance" />
    </>
  );
  const rateProps = field("openingRate", "OpeningRate", f("openingRate"));
  const currentField = (
    <>
      <label htmlFor="Balance" className="form-label">
        {f("current")}: {star}
      </label>
      <input
        type="text"
        id="Balance"
        className="form-control"
        readOnly
        value={formatN2(existing?.currentBalance ?? 0)}
      />
    </>
  );

  return (
    <div className="col-md-12">
      <br />
      <ol className="breadcrumb">
        <li>
          <Link to={listPath}>{bank ? f("banks") : f("cashes")}</Link>
        </li>
        <li className="divider" />
        <li className="active" aria-current="page">
          {bank ? f(editing ? "editBank" : "newBank") : f(editing ? "editCash" : "newCash")}
        </li>
      </ol>
      <h5>{bank ? f(editing ? "editBank" : "newBank") : f(editing ? "editCash" : "newCash")}</h5>
      <hr />
      {formError && (
        <div className="alert alert-danger" role="alert">
          <i className="fas fa-exclamation-triangle" aria-hidden="true" /> {formError}
        </div>
      )}
      {announcer.region}
      <form
        noValidate
        aria-busy={saving}
        onSubmit={handleSubmit((values) => {
          setFormError(null);
          if (existing)
            update.mutate({ id: existing.id, body: updateFundBody(values, existing, kind) });
          else create.mutate(createFundBody(values, kind));
        })}
      >
        {bank ? (
          <>
            <div className="row">
              <div className="col-md-3">
                <label htmlFor="Bank" className="form-label" id="BankLabel">
                  {f("bank")}: {star}
                </label>
                <Controller
                  control={control}
                  name="bankName"
                  render={({ field: controlled }) => (
                    <ZtoSelect
                      id="Bank"
                      name="Bank"
                      value={controlled.value}
                      onChange={(value) => {
                        controlled.onChange(value);
                        controlled.onBlur();
                      }}
                      options={bankOptions(existing?.bankName).map((name) => ({
                        value: name,
                        label: name,
                      }))}
                      placeholder={f("bankPlaceholder")}
                      required
                      className={cls("bankName")}
                    />
                  )}
                />
                <FieldError form={form} name="bankName" id="Bank" />
              </div>
              <div className="col-md-2">{codeField}</div>
              <div className="col-md-3">{nameField}</div>
              <div className="col-md-2">
                <label htmlFor="BranchName" className="form-label">
                  {f("branchName")}:
                </label>
                <input
                  type="text"
                  className={cls("bankBranchName")}
                  autoComplete="off"
                  maxLength={FUND_LIMITS.bankBranchName}
                  {...field("bankBranchName", "BranchName", f("branchName"))}
                />
                <FieldError form={form} name="bankBranchName" id="BranchName" />
              </div>
              <div className="col-md-2">{currencyField}</div>
            </div>
            <br />
            <div className="row">
              <div className="col-md-3">
                <label htmlFor="AccountNumber" className="form-label">
                  {f("accountNo")}:
                </label>
                <input
                  type="text"
                  className={cls("accountNo")}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={FUND_LIMITS.accountNo}
                  {...field("accountNo", "AccountNumber", f("accountNo"))}
                />
                <FieldError form={form} name="accountNo" id="AccountNumber" />
              </div>
              <div className="col-md-3">
                <label htmlFor="Iban" className="form-label">
                  {f("iban")}:
                </label>
                <input
                  type="text"
                  className={cls("iban")}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={FUND_LIMITS.iban}
                  placeholder={f("ibanPlaceholder")}
                  {...field("iban", "Iban", f("iban"))}
                />
                <FieldError form={form} name="iban" id="Iban" />
              </div>
              <div className="col-md-3">{branchField}</div>
              <div className="col-md-3">{provinceField}</div>
            </div>
            <br />
            <div className="row">
              <div className="col-md-3">{openingField}</div>
              <div className="col-md-3">{currentField}</div>
            </div>
          </>
        ) : (
          <>
            <div className="row">
              <div className="col-md-3">{codeField}</div>
              <div className="col-md-3">{nameField}</div>
              <div className="col-md-3">{currencyField}</div>
              <div className="col-md-3">{branchField}</div>
            </div>
            <br />
            <div className="row">
              <div className="col-md-3">{provinceField}</div>
              <div className="col-md-3">{openingField}</div>
              <div className="col-md-3">{currentField}</div>
            </div>
          </>
        )}
        <br />
        <div className="row">
          <div className="col-md-12">
            <label htmlFor="Description" className="form-label">
              {f("description")}:
            </label>
            <div className="input-group">
              <textarea
                className={cls("description")}
                rows={3}
                maxLength={FUND_LIMITS.description}
                placeholder={bank ? f("descriptionBank") : f("descriptionCash")}
                {...field("description", "Description", f("description"))}
              />
              <button
                type="button"
                className="btn btn-info"
                style={INFO_BUTTON}
                aria-label={f("tipLabel")}
                aria-describedby={tipId}
                onMouseEnter={() => setTipOpen(true)}
                onMouseLeave={() => setTipOpen(false)}
                onFocus={() => setTipOpen(true)}
                onBlur={() => setTipOpen(false)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setTipOpen(false);
                }}
              >
                <i className="fas fa-info-circle" aria-hidden="true" />
                <span
                  className="tooltip-text"
                  id={tipId}
                  role="tooltip"
                  style={tipOpen ? TOOLTIP_SHOWN : undefined}
                >
                  {bank ? f("tipBank") : f("tipCash")}
                </span>
              </button>
            </div>
            <FieldError form={form} name="description" id="Description" />
          </div>
        </div>
        <br />
        <div className="row">
          <div className="col-md-3">
            <label htmlFor="OpeningDate" className="form-label">
              {f("openingDate")}:
            </label>
            <input
              type="date"
              className={cls("openingDate")}
              {...field("openingDate", "OpeningDate", f("openingDate"))}
            />
          </div>
          {showRate && (
            <div className="col-md-3">
              {/* Blackrose eki (OK-12.2-37): döviz açılışında kur tablosu boşsa elle kur. */}
              <label htmlFor="OpeningRate" className="form-label">
                {f("openingRate")}:
              </label>
              <input
                type="number"
                step="0.000001"
                min="0"
                inputMode="decimal"
                className={cls("openingRate")}
                {...rateProps}
                aria-describedby={[rateProps["aria-describedby"], "OpeningRateHint"]
                  .filter(Boolean)
                  .join(" ")}
              />
              <small id="OpeningRateHint" className="text-muted d-block">
                {f("openingRateHint")}
              </small>
              <FieldError form={form} name="openingRate" id="OpeningRate" />
            </div>
          )}
          <div className="col-md-3">
            <label htmlFor="Status" className="form-label">
              {f("status")}:
            </label>
            <select className="form-control" {...field("active", "Status", f("status"))}>
              <option value="true">{f("active")}</option>
              <option value="false">{f("passive")}</option>
            </select>
          </div>
          <div className="col-md-3 d-flex align-items-end">
            <div className="form-check mb-2">
              <input
                type="checkbox"
                className="form-check-input"
                {...field("allowNegative", "AllowNegative", f("allowNegative"))}
              />
              <label htmlFor="AllowNegative" className="form-check-label">
                {f("allowNegative")}
              </label>
            </div>
          </div>
        </div>
        <br />
        <hr />
        <div className="row">
          <div className="col-md-12">
            <button
              type="submit"
              id="submitButton"
              className="btn btn-primary col-md-12"
              disabled={saving}
            >
              {saving ? (
                <>
                  <i className={editing ? "fas fa-save" : "fas fa-plus"} aria-hidden="true" />{" "}
                  {submitText(kind, editing, true, f)}{" "}
                  <i className="fas fa-spinner fa-spin" aria-hidden="true" />
                </>
              ) : (
                <>
                  <i className={editing ? "fas fa-save" : "fas fa-plus"} aria-hidden="true" />{" "}
                  {submitText(kind, editing, false, f)}
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function submitText(
  kind: FundKind,
  editing: boolean,
  busy: boolean,
  f: (key: string) => string,
): string {
  const noun = kind === "BANK" ? "Bank" : "Cash";
  if (editing) return f(busy ? `updating${noun}` : `update${noun}`);
  return f(busy ? `creating${noun}` : `create${noun}`);
}

function FieldError({
  form,
  name,
  id,
}: {
  form: FormApi;
  name: FieldPath<FundFormValues>;
  id: string;
}): ReactNode {
  const state = fieldStateOf(form.formState, name);
  const shown = Boolean((state.touched || state.submitted) && state.error);
  return (
    <div id={errorIdOf(id)} className="invalid-feedback d-block" hidden={!shown}>
      {shown ? state.error : ""}
    </div>
  );
}
