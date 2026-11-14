import { zodResolver } from "@hookform/resolvers/zod";
import { useQueries } from "@tanstack/react-query";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
  type UseFormReturn,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiGet } from "../../../../api/client";
import { useAuthStore } from "../../../../auth/authStore";
import { activeCompanies, isMultiCompany } from "../../../../auth/companyStore";
import {
  createAccount,
  financeKeys,
  setLimits,
  updateProfile,
  useAccount,
  useAccountGroups,
  useAccountHistory,
  useAccountSearch,
  useBankAccounts,
  useFinanceMutation,
} from "../../../../pages/finance/accountApi";
import { today as localToday, useCan, useCurrencies } from "../../../../pages/finance/common";
import type { Account, AccountBankAccount, AccountGroup } from "../../../../pages/finance/types";
import { errorIdOf, fieldA11yProps, fieldStateOf, useFormErrorAnnouncer } from "../../../a11y";
import { ZtoBranchSelect, currencySymbol } from "../../../components";
import { errorCode, errorMessage } from "../../../components/definitionLogic";
import { ZTO_FINANS_BASE, ZTO_SLUGS, accountEditPath } from "../../navItems";
import { ZtoPageLoading } from "../../ZtoSuspenseOutlet";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import {
  ACCOUNT_LIMITS,
  accountErrorField,
  accountFormFrom,
  accountFormSchema,
  bankErrorRow,
  createBody,
  digitsOnly,
  emptyAccountForm,
  emptyBankRow,
  groupChange,
  historyText,
  limitsChange,
  profileBody,
  recordDate,
  selectableGroups,
  taxRequired,
  typeOfGroup,
  type AccountFormValues,
} from "./accountFormLogic";
import { BANK_CATEGORIES, BANK_KINDS, BANK_LIMITS, normalizeIbanInput } from "./bankAccountLogic";

const LIST_PATH = `${ZTO_FINANS_BASE}/${ZTO_SLUGS.accounts}`;
const DUPLICATE_DELAY_MS = 350;

export type AccountFormPageProps = { mode?: "add" | "edit" };

/**
 * Yeni Cari Kart / Cari Kart Düzenle (ZTO CustomerAccounts/Add.cshtml, Edit.cshtml; 12.1 §5.8).
 * Referans Hesap, Masraf Türü, Şube (il) ve Kredi Banka Cari Hesabı ÇIKAR; banka satırında Son İşlem
 * Tarihi ÇIKAR (MX8 N3). Form `noValidate`: ZTO iletileri zod'dan, ilk geçersiz alana RHF odaklanır.
 */
export function AccountFormPage({ mode = "add" }: AccountFormPageProps) {
  useZtoRootClass("zto-page-account-form");
  const { id } = useParams();
  const { t } = useTranslation("ztoFinans");
  const editing = mode === "edit";
  const account = useAccount(editing ? id : undefined);
  const banks = useBankAccounts(editing ? id : undefined, false);
  // Liste uçları IBAN/hesap no'yu maskeli döner (OK-13); düzenleme formu (FINANCE_MANAGE) satırların
  // açık değerini `GET /bank-accounts/{id}` ile alır, yoksa kayıtta tanımlayıcısız satır 422 olur.
  const bankDetails = useQueries({
    queries: (banks.data ?? []).map((bank) => ({
      queryKey: financeKeys.bankAccount(bank.id),
      queryFn: () =>
        apiGet<AccountBankAccount>(`/finance/bank-accounts/${encodeURIComponent(bank.id)}`),
    })),
  });
  const groups = useAccountGroups();

  const detailsPending = bankDetails.some((query) => query.isPending);
  if ((editing && (account.isPending || banks.isPending || detailsPending)) || groups.isPending) {
    return <ZtoPageLoading />;
  }
  const failure =
    (editing &&
      (account.error ?? banks.error ?? bankDetails.find((query) => query.error)?.error)) ||
    groups.error;
  if (failure) {
    return (
      <div className="container-fluid">
        <br />
        <div className="alert alert-danger" role="alert">
          {errorMessage(failure, t("accounts.form.loadFailed"))}
        </div>
      </div>
    );
  }
  return (
    <AccountForm
      key={account.data?.id ?? "new"}
      mode={mode}
      existing={editing ? account.data : undefined}
      banks={editing ? withPlainIdentifiers(banks.data ?? [], bankDetails) : []}
      groups={groups.data ?? []}
    />
  );
}

/** Liste satırlarına detay ucundan gelen açık IBAN / hesap no'yu ekler (detay yoksa liste değeri). */
function withPlainIdentifiers(
  banks: AccountBankAccount[],
  details: readonly { data?: AccountBankAccount }[],
): AccountBankAccount[] {
  return banks.map((bank, index) => {
    const detail = details[index]?.data;
    return detail
      ? {
          ...bank,
          iban: detail.iban ?? bank.iban,
          accountNumber: detail.accountNumber ?? bank.accountNumber,
        }
      : bank;
  });
}

type FormApi = UseFormReturn<AccountFormValues>;

function AccountForm({
  mode,
  existing,
  banks,
  groups,
}: {
  mode: "add" | "edit";
  existing?: Account;
  banks: AccountBankAccount[];
  groups: AccountGroup[];
}) {
  const { t } = useTranslation("ztoFinans");
  const { t: tc } = useTranslation();
  const navigate = useNavigate();
  const editing = mode === "edit";
  const canEmployee = useCan("FINANCE_EMPLOYEE_VIEW");
  const companies = useAuthStore((state) => state.me?.companies);
  const multiCompany = isMultiCompany(companies);
  const currencies = useCurrencies();
  const announcer = useFormErrorAnnouncer();
  const today = localToday();
  const defaultCountry = t("accounts.form.countryDefault");
  const [formError, setFormError] = useState<string | null>(null);
  const originalBankIds = useMemo(() => banks.filter((b) => b.active).map((b) => b.id), [banks]);

  const messages = useMemo(
    () => ({
      required: t("accounts.form.required"),
      selectRequired: t("accounts.form.selectRequired"),
      taxRequired: t("accounts.form.taxRequired"),
      tooLong: (max: number) => t("accounts.form.tooLong", { max }),
      invalidNumber: t("accounts.form.invalidNumber"),
      ibanShort: t("accounts.form.ibanShort"),
      accountNumberInvalid: t("accounts.form.accountNumberInvalid"),
      emailInvalid: t("accounts.form.emailInvalid"),
    }),
    [t],
  );
  const schema = useMemo(() => accountFormSchema(mode, messages), [mode, messages]);
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    shouldFocusError: true,
    defaultValues: existing
      ? accountFormFrom(existing, banks, defaultCountry)
      : emptyAccountForm(today, defaultCountry),
  });
  const { control, register, handleSubmit, formState, setError, getFieldState } = form;
  const subGroup = useWatch({ control, name: "subGroup" });

  const groupOptions = useMemo(
    () => selectableGroups(groups, canEmployee, existing?.subGroup),
    [groups, canEmployee, existing?.subGroup],
  );
  const change = editing ? groupChange(groups, existing?.subGroup ?? "", subGroup) : null;
  const taxStar = !editing && taxRequired(subGroup);
  const currencyOptions = (currencies.data ?? [{ code: "TRY", name: "Türk Lirası" }]).map((c) => ({
    value: c.code,
    label: `${currencySymbol(c.code)} (${c.name})`,
  }));

  const save = useFinanceMutation(
    async (values: AccountFormValues) => {
      const type = typeOfGroup(groups, values.subGroup) ?? existing?.type ?? "CUSTOMER";
      if (!existing) return createAccount(createBody(values, type));
      // Profil PUT'u limit almaz (AccountProfileRequest); değişen kart limiti ayrı uçla yazılır.
      // Limit ÖNCE: ikisi de idempotent PUT'tur, profil hatasında yeniden denemek limiti aynı
      // değerle yeniden yazar. Profil önce olsaydı limit hatasından sonraki denemede formdaki yeni
      // banka satırları (id'siz) ikinci kez eklenirdi.
      const limits = limitsChange(values, existing);
      if (limits) await setLimits(existing.id, limits);
      return updateProfile(existing.id, profileBody(values, type, originalBankIds));
    },
    {
      onSuccess: (account) =>
        navigate(LIST_PATH, {
          state: {
            flash: existing
              ? t("accounts.form.updated")
              : t("accounts.form.created", { code: account.code }),
          },
        }),
      onError: (error, values) => {
        const code = errorCode(error);
        const message = errorMessage(error, t("accounts.form.error"));
        const field = accountErrorField(code);
        if (field === "bank" && values.bankAccounts.length > 0) {
          const index = bankErrorRow(values.bankAccounts);
          setError(`bankAccounts.${index}.iban`, { message }, { shouldFocus: true });
        } else if (field === "code" && editing) {
          setError(
            "code",
            { message: code === "ACCOUNT_CODE_TAKEN" ? t("accounts.form.codeTaken") : message },
            { shouldFocus: true },
          );
        } else if (field === "taxNumber" || field === "subGroup") {
          setError(field, { message }, { shouldFocus: true });
        } else {
          setFormError(message);
        }
      },
    },
  );

  const a11y = (name: FieldPath<AccountFormValues>, id: string) =>
    fieldA11yProps(name, fieldStateOf(formState, name, { id }));
  const announceOnBlur = (name: FieldPath<AccountFormValues>, label: string) => () =>
    announcer.announceFieldError(name, label, getFieldState(name).error?.message);
  const field = (
    name: FieldPath<AccountFormValues>,
    id: string,
    label: string,
    options: { setValueAs?: (value: string) => string } = {},
  ) => {
    const registered = register(name, options.setValueAs ? { setValueAs: options.setValueAs } : {});
    return {
      ...registered,
      ...a11y(name, id),
      onBlur: async (event: Parameters<typeof registered.onBlur>[0]) => {
        await registered.onBlur(event);
        announceOnBlur(name, label)();
      },
    };
  };

  const label = (key: string) => t(`accounts.form.${key}`);
  const req = <span aria-hidden="true"> *</span>;

  return (
    <>
      <br />
      <div className="container-fluid">
        <div className="card">
          <div className="card-header d-flex justify-content-between align-items-center">
            <h6 className="card-title mb-0">
              <i className="fas fa-user-tie" aria-hidden="true" />{" "}
              {label(editing ? "editTitle" : "addTitle")}
            </h6>
            <Link to={LIST_PATH} className="btn btn-light btn-sm border">
              <i className="fas fa-arrow-left" aria-hidden="true" /> {label("backToList")}
            </Link>
          </div>
          <div className="card-body">
            {formError && (
              <div className="alert alert-danger alert-dismissible" role="alert">
                <button
                  type="button"
                  className="close"
                  aria-label={tc("common.a11y.close")}
                  onClick={() => setFormError(null)}
                >
                  <span aria-hidden="true">×</span>
                </button>
                {formError}
              </div>
            )}
            {announcer.region}
            <form
              id="customerForm"
              noValidate
              aria-busy={save.isPending}
              onSubmit={handleSubmit((values) => {
                setFormError(null);
                save.mutate(values);
              })}
            >
              <div className="row">
                <div className="col-12 mb-2">
                  <div className="card border h-100">
                    <div className="card-header py-1 px-2">
                      <strong>
                        <i className="fas fa-id-card mr-1" aria-hidden="true" />
                        {label("basic")}
                      </strong>
                    </div>
                    <div className="card-body py-1 px-2">
                      <BasicRow
                        form={form}
                        editing={editing}
                        multiCompany={multiCompany}
                        companies={activeCompanies(companies)}
                        groupOptions={groupOptions}
                        field={field}

                        announce={announceOnBlur}
                      />
                      {change && (
                        <div
                          id="refMigrateInfo"
                          role="status"
                          style={{
                            background: "#fffbeb",
                            border: "1px solid #fde68a",
                            borderLeft: "4px solid #d97706",
                            color: "#92400e",
                            borderRadius: 10,
                            padding: "9px 12px",
                            fontSize: 12,
                            lineHeight: 1.6,
                            marginBottom: 6,
                          }}
                        >
                          <i
                            className="fas fa-exchange-alt"
                            style={{ color: "#d97706" }}
                            aria-hidden="true"
                          />{" "}
                          <b>{label("groupChanged")}</b>{" "}
                          <span id="refMigrateText">
                            '{change.from}' → '{change.to}'
                          </span>
                          <br />
                          {label("groupChangedNote")}
                        </div>
                      )}
                      <div className="row">
                        <div className="col-md-6 mb-0">
                          <label className="small mb-0" htmlFor="AccountName">
                            {label("name")}
                            {req}
                          </label>
                          <input
                            className={inputClass(formState, "name")}
                            required
                            aria-required="true"
                            maxLength={ACCOUNT_LIMITS.name}
                            placeholder={editing ? undefined : label("namePlaceholder")}
                            autoComplete="off"
                            autoFocus={!editing}
                            {...field("name", "AccountName", label("name"))}
                          />
                          <FieldError form={form} name="name" id="AccountName" />
                          {!editing && <DuplicateWarning control={control} />}
                        </div>
                        <div className="col-md-6 mb-0">
                          <label className="small mb-0" htmlFor="Phone">
                            {label("phone")}
                          </label>
                          <input
                            className="form-control form-control-sm"
                            type="tel"
                            inputMode="tel"
                            autoComplete="off"
                            maxLength={ACCOUNT_LIMITS.phone}
                            {...field("phone", "Phone", label("phone"))}
                          />
                          <FieldError form={form} name="phone" id="Phone" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <Section icon="fa-coins" title={label("tax")}>
                  <div className="row">
                    <div className="col-md-4 mb-1">
                      <label className="small mb-0" htmlFor="TaxNumber">
                        {label("taxNumber")}
                        {taxStar && (
                          <span id="taxRequiredStar" className="text-danger" aria-hidden="true">
                            {" "}
                            *
                          </span>
                        )}
                      </label>
                      <Controller
                        control={control}
                        name="taxNumber"
                        render={({ field: f }) => (
                          <input
                            className={inputClass(formState, "taxNumber")}
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={ACCOUNT_LIMITS.taxNumber}
                            required={taxStar}
                            aria-required={taxStar || undefined}
                            readOnly={existing?.taxNumberMasked}
                            title={existing?.taxNumberMasked ? label("taxNumberMasked") : undefined}
                            {...a11y("taxNumber", "TaxNumber")}
                            name={f.name}
                            ref={f.ref}
                            value={f.value}
                            onChange={(event) =>
                              f.onChange(
                                existing?.taxNumberMasked
                                  ? event.target.value
                                  : digitsOnly(event.target.value),
                              )
                            }
                            onBlur={() => {
                              f.onBlur();
                              setTimeout(announceOnBlur("taxNumber", label("taxNumber")), 0);
                            }}
                          />
                        )}
                      />
                      <FieldError form={form} name="taxNumber" id="TaxNumber" />
                    </div>
                    <div className="col-md-4 mb-1">
                      <label className="small mb-0" htmlFor="TaxOffice">
                        {label("taxOffice")}
                      </label>
                      <input
                        className="form-control form-control-sm"
                        autoComplete="off"
                        maxLength={ACCOUNT_LIMITS.taxOffice}
                        {...field("taxOffice", "TaxOffice", label("taxOffice"))}
                      />
                    </div>
                    <div className="col-md-4 mb-1">
                      <label className="small mb-0" htmlFor="CompanyType">
                        {label("companyType")}
                      </label>
                      <select
                        className="form-control form-control-sm"
                        {...field("companyType", "CompanyType", label("companyType"))}
                      >
                        <option value="">{label("select")}</option>
                        <option value="INDIVIDUAL">{tc("finance.companyType.INDIVIDUAL")}</option>
                        <option value="CORPORATE">{tc("finance.companyType.CORPORATE")}</option>
                      </select>
                    </div>
                  </div>
                  <div className="row">
                    <div className="col-md-4 mb-0">
                      <label className="small mb-0" htmlFor="CurrencyID">
                        {label("currency")}
                        {req}
                      </label>
                      <select
                        className={inputClass(formState, "defaultCurrency")}
                        required
                        aria-required="true"
                        {...field("defaultCurrency", "CurrencyID", label("currency"))}
                      >
                        <option value="">{label("select")}</option>
                        {currencyOptions.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <FieldError form={form} name="defaultCurrency" id="CurrencyID" />
                    </div>
                    <div className="col-md-4 mb-0">
                      <label className="small mb-0" htmlFor="CreditLimit">
                        {label("creditLimit")}
                      </label>
                      <input
                        className={inputClass(formState, "creditLimit")}
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        {...field("creditLimit", "CreditLimit", label("creditLimit"))}
                      />
                      <FieldError form={form} name="creditLimit" id="CreditLimit" />
                    </div>
                    <div className="col-md-4 mb-0">
                      <label className="small mb-0" htmlFor="RiskLimit">
                        {label("riskLimit")}
                      </label>
                      <input
                        className={inputClass(formState, "riskLimit")}
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        {...field("riskLimit", "RiskLimit", label("riskLimit"))}
                      />
                      <FieldError form={form} name="riskLimit" id="RiskLimit" />
                    </div>
                  </div>
                </Section>

                <Section icon="fa-address-book" title={label("contact")}>
                  <div className="row">
                    <TextField
                      form={form}
                      field={field}
                      name="email"
                      id="Email"
                      type="email"
                      cols="col-md-6 mb-1"
                      max={ACCOUNT_LIMITS.email}
                      label={label("email")}
                    />
                    <TextField
                      form={form}
                      field={field}
                      name="website"
                      id="Website"
                      type="url"
                      cols="col-md-6 mb-1"
                      max={ACCOUNT_LIMITS.website}
                      label={label("website")}
                    />
                  </div>
                  <div className="row">
                    <TextField
                      form={form}
                      field={field}
                      name="contactName"
                      id="ContactPerson"
                      cols="col-md-4 mb-0"
                      max={ACCOUNT_LIMITS.contactName}
                      label={label("contactName")}
                    />
                    <TextField
                      form={form}
                      field={field}
                      name="contactTitle"
                      id="ContactTitle"
                      cols="col-md-4 mb-0"
                      max={ACCOUNT_LIMITS.contactTitle}
                      label={label("contactTitle")}
                    />
                    <TextField
                      form={form}
                      field={field}
                      name="contactMobile"
                      id="ContactMobile"
                      type="tel"
                      inputMode="tel"
                      cols="col-md-4 mb-0"
                      max={ACCOUNT_LIMITS.contactMobile}
                      label={label("contactMobile")}
                    />
                  </div>
                </Section>

                <Section icon="fa-map-marker-alt" title={label("addressCard")}>
                  <div className="row">
                    <div className="col-12 mb-1">
                      <label className="small mb-0" htmlFor="Address">
                        {label("address")}
                      </label>
                      <textarea
                        className={inputClass(formState, "address")}
                        rows={2}
                        autoComplete="off"
                        maxLength={ACCOUNT_LIMITS.address}
                        {...field("address", "Address", label("address"))}
                      />
                      <FieldError form={form} name="address" id="Address" />
                    </div>
                  </div>
                  <div className="row">
                    <TextField
                      form={form}
                      field={field}
                      name="city"
                      id="City"
                      cols="col-md-3 mb-0"
                      max={ACCOUNT_LIMITS.city}
                      label={label("city")}
                    />
                    <TextField
                      form={form}
                      field={field}
                      name="district"
                      id="District"
                      cols="col-md-3 mb-0"
                      max={ACCOUNT_LIMITS.district}
                      label={label("district")}
                    />
                    <TextField
                      form={form}
                      field={field}
                      name="country"
                      id="Country"
                      cols="col-md-3 mb-0"
                      max={ACCOUNT_LIMITS.country}
                      label={label("country")}
                    />
                    <TextField
                      form={form}
                      field={field}
                      name="postalCode"
                      id="PostalCode"
                      inputMode="numeric"
                      cols="col-md-3 mb-0"
                      max={ACCOUNT_LIMITS.postalCode}
                      label={label("postalCode")}
                    />
                  </div>
                </Section>

                <Section icon="fa-file-invoice-dollar" title={label("payment")}>
                  <div className="row">
                    <div className="col-md-6 mb-0">
                      <label className="small mb-0" htmlFor="PaymentTerms">
                        {label("paymentTerms")}
                      </label>
                      <textarea
                        className={inputClass(formState, "paymentTerms")}
                        rows={2}
                        maxLength={ACCOUNT_LIMITS.paymentTerms}
                        {...field("paymentTerms", "PaymentTerms", label("paymentTerms"))}
                      />
                      <FieldError form={form} name="paymentTerms" id="PaymentTerms" />
                    </div>
                    <div className="col-md-6 mb-0">
                      <label className="small mb-0" htmlFor="Notes">
                        {label("notes")}
                      </label>
                      <textarea
                        className={inputClass(formState, "notes")}
                        rows={2}
                        maxLength={ACCOUNT_LIMITS.notes}
                        {...field("notes", "Notes", label("notes"))}
                      />
                      <FieldError form={form} name="notes" id="Notes" />
                    </div>
                  </div>
                </Section>

                <BankRows
                  form={form}
                  editing={editing}
                  today={today}
                  currencyOptions={currencyOptions}
                  a11y={a11y}
                  announce={announceOnBlur}
                />

                {editing && existing && <RecordInfo account={existing} />}
              </div>

              <div className="mt-3">
                <button
                  type="submit"
                  className="btn btn-success"
                  disabled={save.isPending}
                  aria-busy={save.isPending}
                >
                  <i className="fas fa-save" aria-hidden="true" />{" "}
                  {label(editing ? "update" : "save")}
                </button>{" "}
                <Link to={LIST_PATH} className="btn btn-secondary">
                  {label("cancel")}
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

type FieldFn = (
  name: FieldPath<AccountFormValues>,
  id: string,
  label: string,
  options?: { setValueAs?: (value: string) => string },
) => ReturnType<FormApi["register"]> & ReturnType<typeof fieldA11yProps>;
type A11yFn = (name: FieldPath<AccountFormValues>, id: string) => ReturnType<typeof fieldA11yProps>;
type AnnounceFn = (name: FieldPath<AccountFormValues>, label: string) => () => void;

function inputClass(
  formState: FormApi["formState"],
  name: FieldPath<AccountFormValues>,
  base = "form-control form-control-sm",
): string {
  const state = fieldStateOf(formState, name);
  return (state.touched || state.submitted) && state.error ? `${base} is-invalid` : base;
}

/** Hata metni: her zaman DOM'da (id = errorId), yalnız hata görünürken gösterilir (§5.0 #12). */
function FieldError({
  form,
  name,
  id,
}: {
  form: FormApi;
  name: FieldPath<AccountFormValues>;
  id: string;
}) {
  const state = fieldStateOf(form.formState, name);
  const shown = Boolean((state.touched || state.submitted) && state.error);
  return (
    <div id={errorIdOf(id)} className="invalid-feedback d-block" hidden={!shown}>
      {shown ? state.error : null}
    </div>
  );
}

function Section({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="col-md-6 mb-2">
      <div className="card border h-100">
        <div className="card-header py-1 px-3">
          <small className="text-muted font-weight-bold text-uppercase">
            <i className={`fas ${icon} mr-1`} aria-hidden="true" />
            {title}
          </small>
        </div>
        <div className="card-body py-1 px-2">{children}</div>
      </div>
    </div>
  );
}

function TextField({
  form,
  field,
  name,
  id,
  label,
  cols,
  max,
  type = "text",
  inputMode,
}: {
  form: FormApi;
  field: FieldFn;
  name: FieldPath<AccountFormValues>;
  id: string;
  label: string;
  cols: string;
  max: number;
  type?: "text" | "email" | "tel" | "url";
  inputMode?: "tel" | "numeric";
}) {
  return (
    <div className={cols}>
      <label className="small mb-0" htmlFor={id}>
        {label}
      </label>
      <input
        className={inputClass(form.formState, name)}
        type={type}
        inputMode={inputMode}
        autoComplete="off"
        maxLength={max}
        {...field(name, id, label)}
      />
      <FieldError form={form} name={name} id={id} />
    </div>
  );
}

function BasicRow({
  form,
  editing,
  multiCompany,
  companies,
  groupOptions,
  field,
  announce,
}: {
  form: FormApi;
  editing: boolean;
  multiCompany: boolean;
  companies: { id: string; shortName: string }[];
  groupOptions: AccountGroup[];
  field: FieldFn;
  announce: AnnounceFn;
}) {
  const { t } = useTranslation("ztoFinans");
  const label = (key: string) => t(`accounts.form.${key}`);
  const cols = 1 + 1 + (editing ? 1 : 0) + (multiCompany ? 1 : 0);
  const col = cols >= 4 ? "col-md-3" : cols === 3 ? "col-md-4" : "col-md-6";
  const req = <span aria-hidden="true"> *</span>;
  // ZtoBranchSelect'in odaklanan combobox'ı FieldError'a bağlanır (errorIdOf("WorkPlaceID")).
  const branchA11y = fieldA11yProps(
    "branchId",
    fieldStateOf(form.formState, "branchId", { id: "WorkPlaceID" }),
  );
  return (
    <div className="row">
      <div className={`${col} mb-1 order-1`}>
        <label className="small mb-0" htmlFor="AccountGroup">
          {label("group")}
          {req}
        </label>
        <select
          className={inputClass(form.formState, "subGroup")}
          required
          aria-required="true"
          {...field("subGroup", "AccountGroup", label("group"))}
        >
          <option value="">{label("groupPlaceholder")}</option>
          {groupOptions.map((g) => (
            <option key={g.code} value={g.code}>
              {g.name}
            </option>
          ))}
        </select>
        <FieldError form={form} name="subGroup" id="AccountGroup" />
      </div>
      <div className={`${col} mb-1 order-3`}>
        <label className="small mb-0" htmlFor="WorkPlaceID">
          {label("workPlace")}
          {req}
        </label>
        <Controller
          control={form.control}
          name="branchId"
          render={({ field: f }) => (
            <span
              onBlur={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                f.onBlur();
                setTimeout(announce("branchId", label("workPlace")), 0);
              }}
              style={{ display: "contents" }}
            >
              <ZtoBranchSelect
                id="WorkPlaceID"
                name={f.name}
                value={f.value}
                onChange={(value) => f.onChange(value)}
                required
                scope="all"
                placeholder={label("workPlacePlaceholder")}
                companyId={null}
                className="form-control form-control-sm"
                aria-invalid={branchA11y["aria-invalid"]}
                aria-describedby={branchA11y["aria-describedby"]}
              />
            </span>
          )}
        />
        <FieldError form={form} name="branchId" id="WorkPlaceID" />
      </div>
      {editing && (
        <div className={`${col} mb-1 order-4`}>
          <label className="small mb-0" htmlFor="AccountCode">
            {label("code")}
            {req}
          </label>
          <input
            className={inputClass(form.formState, "code")}
            required
            aria-required="true"
            autoComplete="off"
            maxLength={ACCOUNT_LIMITS.code}
            {...field("code", "AccountCode", label("code"))}
          />
          <FieldError form={form} name="code" id="AccountCode" />
        </div>
      )}
      {multiCompany && (
        <div className={`${col} mb-1 order-5`}>
          <label className="small mb-0" htmlFor="CompanyID">
            {label("company")}
          </label>
          <select
            className="form-control form-control-sm"
            {...field("companyId", "CompanyID", label("company"))}
          >
            <option value="">{label("companyShared")}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.shortName}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

/** Benzer cari uyarısı (Add.cshtml:763-791): 3+ karakter, 350 ms sonra ilk 5 sonuç. */
function DuplicateWarning({ control }: { control: FormApi["control"] }) {
  const { t } = useTranslation("ztoFinans");
  const { t: tc } = useTranslation();
  const name = useWatch({ control, name: "name" });
  const [term, setTerm] = useState("");
  useEffect(() => {
    const value = (name ?? "").trim();
    if (value.length < 3) {
      setTerm("");
      return;
    }
    const timer = setTimeout(() => setTerm(value), DUPLICATE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [name]);
  const search = useAccountSearch(term, { enabled: term.length >= 3 });
  const hits = term.length >= 3 ? (search.data ?? []).slice(0, 5) : [];
  return (
    <div role="status">
      {hits.length > 0 && (
        <div id="dupNameWarn" className="dup-name-warn">
          <div className="dup-name-head">
            <i className="fas fa-exclamation-triangle" aria-hidden="true" />{" "}
            {t("accounts.form.duplicateHead")}
          </div>
          <div id="dupNameList">
            {hits.map((hit) => (
              <a
                key={hit.id}
                className="dup-name-item"
                href={accountEditPath(hit.id)}
                target="_blank"
                rel="noopener noreferrer"
                title={t("accounts.form.duplicateLinkTitle")}
              >
                <span>
                  <i className="fas fa-user-tie" aria-hidden="true" /> {hit.name}{" "}
                  <small style={{ opacity: 0.75 }}>({hit.subGroupName || hit.subGroup})</small>
                  <span className="sr-only"> {tc("common.a11y.opensInNewTab")}</span>
                </span>
                <span className="dn-code">{hit.code}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BankRows({
  form,
  editing,
  today,
  currencyOptions,
  a11y,
  announce,
}: {
  form: FormApi;
  editing: boolean;
  today: string;
  currencyOptions: { value: string; label: string }[];
  a11y: A11yFn;
  announce: AnnounceFn;
}) {
  const { t } = useTranslation("ztoFinans");
  const { t: tc } = useTranslation();
  const { control, register, formState } = form;
  const { fields, append, remove } = useFieldArray({
    control,
    name: "bankAccounts",
    keyName: "_k",
  });
  const addRef = useRef<HTMLButtonElement>(null);
  const focusRow = useRef<number | null>(null);
  const b = (key: string) => t(`accounts.bankRow.${key}`);

  useEffect(() => {
    if (focusRow.current !== null && focusRow.current < fields.length) {
      document.getElementById(`bank-${focusRow.current}-bankName`)?.focus();
      focusRow.current = null;
    }
  }, [fields.length]);

  const input = (
    index: number,
    key: "bankName" | "branchName" | "accountNumber" | "iban" | "holderName" | "openedOn",
    labelText: string,
    extra: Record<string, unknown> = {},
  ) => {
    const name = `bankAccounts.${index}.${key}` as const;
    const id = `bank-${index}-${key}`;
    const base = register(name);
    // ZTO .iban-input: değer RHF okumadan önce büyük harf + A-Z0-9'a süzülür.
    const registered =
      key === "iban"
        ? {
            ...base,
            onChange: (event: Parameters<typeof base.onChange>[0]) => {
              event.target.value = normalizeIbanInput(event.target.value);
              return base.onChange(event);
            },
          }
        : base;
    return (
      <>
        <label className="small mb-0 text-muted" htmlFor={id}>
          {labelText}
          {key === "bankName" && <span aria-hidden="true"> *</span>}
        </label>
        <input
          className={inputClass(formState, name)}
          autoComplete="off"
          {...extra}
          {...registered}
          {...a11y(name, id)}
          onBlur={async (event) => {
            await registered.onBlur(event);
            announce(name, labelText)();
          }}
        />
        <FieldError form={form} name={name} id={id} />
      </>
    );
  };

  return (
    <div className="col-12">
      <div className="card border">
        <div className="card-header py-2 d-flex justify-content-between align-items-center">
          <strong>
            <i className="fas fa-university mr-1" aria-hidden="true" />
            {t("accounts.form.banks")}
          </strong>
          <button
            ref={addRef}
            type="button"
            className="btn btn-sm btn-outline-primary"
            id="addBankRowBtn"
            onClick={() => {
              focusRow.current = fields.length;
              append(emptyBankRow(today), { shouldFocus: false });
            }}
          >
            <i className="fas fa-plus" aria-hidden="true" /> {t("accounts.form.addBank")}
          </button>
        </div>
        <div className="card-body p-2">
          <div
            className={
              fields.length >= 3
                ? "customer-bank-rows-scroll border rounded bg-light customer-bank-rows-scroll--capped"
                : "customer-bank-rows-scroll border rounded bg-light"
            }
          >
            <div id="bankRowsContainer" className="p-2">
              {fields.map((row, index) => {
                const rowValues = form.getValues(`bankAccounts.${index}`);
                const bankRequired =
                  !!rowValues && (rowValues.iban !== "" || rowValues.accountNumber !== "");
                return (
                  <div key={row._k} className="border rounded p-2 mb-2 bank-row">
                    <div className="row g-1">
                      <div className="col-12 col-md-6 col-lg-3">
                        {input(index, "bankName", b("bankName"), {
                          placeholder: b("bankNamePlaceholder"),
                          maxLength: BANK_LIMITS.bankName,
                          "aria-required": bankRequired || undefined,
                        })}
                      </div>
                      <div className="col-12 col-md-6 col-lg-3">
                        {input(index, "branchName", b("branchName"), {
                          placeholder: b("branchNamePlaceholder"),
                          maxLength: BANK_LIMITS.branchName,
                        })}
                      </div>
                      <div className="col-12 col-md-6 col-lg-3">
                        {input(index, "accountNumber", b("accountNumber"), {
                          placeholder: "1234567890",
                          maxLength: BANK_LIMITS.accountNumber,
                        })}
                      </div>
                      <div className="col-12 col-md-6 col-lg-3">
                        {input(index, "iban", b("iban"), {
                          placeholder: b("ibanPlaceholder"),
                          maxLength: BANK_LIMITS.iban,
                          autoCapitalize: "characters",
                          spellCheck: false,
                          className: `${inputClass(formState, `bankAccounts.${index}.iban`)} iban-input`,
                        })}
                      </div>
                    </div>
                    <div className="row g-1 mt-1">
                      <div className="col-12 col-md-6 col-lg-6">
                        {input(index, "holderName", b("holderName"), {
                          placeholder: b("holderNamePlaceholder"),
                          maxLength: BANK_LIMITS.holderName,
                        })}
                      </div>
                      <div className="col-12 col-md-6 col-lg-6">
                        <label className="small mb-0 text-muted" htmlFor={`bank-${index}-currency`}>
                          {b("currency")}
                        </label>
                        <select
                          id={`bank-${index}-currency`}
                          className="form-control form-control-sm"
                          {...register(`bankAccounts.${index}.currency`)}
                        >
                          <option value="">{b("currencyPlaceholder")}</option>
                          {currencyOptions.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="row g-1 mt-1">
                      <div className="col-12 col-md-6 col-lg-3">
                        <label className="small mb-0 text-muted" htmlFor={`bank-${index}-kind`}>
                          {b("kind")}
                        </label>
                        <select
                          id={`bank-${index}-kind`}
                          className="form-control form-control-sm"
                          {...register(`bankAccounts.${index}.accountKind`)}
                        >
                          {BANK_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                              {tc(`finance.bankAccountKind.${kind}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-12 col-md-6 col-lg-3">
                        <label className="small mb-0 text-muted" htmlFor={`bank-${index}-category`}>
                          {b("category")}
                        </label>
                        <select
                          id={`bank-${index}-category`}
                          className="form-control form-control-sm"
                          {...register(`bankAccounts.${index}.category`)}
                        >
                          {BANK_CATEGORIES.map((category) => (
                            <option key={category} value={category}>
                              {tc(`finance.bankAccountCategory.${category}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-12 col-md-6 col-lg-3">
                        {input(index, "openedOn", b("openedOn"), { type: "date" })}
                      </div>
                    </div>
                    <div className="row g-1 mt-1">
                      <div className="col-12">
                        <label
                          className="small mb-0 text-muted"
                          htmlFor={`bank-${index}-description`}
                        >
                          {b("description")}
                        </label>
                        <textarea
                          id={`bank-${index}-description`}
                          className="form-control form-control-sm"
                          rows={2}
                          style={{ resize: "vertical" }}
                          maxLength={BANK_LIMITS.description}
                          placeholder={b("descriptionPlaceholder")}
                          {...register(`bankAccounts.${index}.description`)}
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger remove-bank-row mt-1"
                      aria-label={tc("common.a11y.removeBankRow", { n: index + 1 })}
                      onClick={() => {
                        remove(index);
                        addRef.current?.focus();
                      }}
                    >
                      <i className="fas fa-trash" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="card-footer text-muted small py-2">
          {t(editing ? "accounts.form.banksFooterEdit" : "accounts.form.banksFooterAdd")}
        </div>
      </div>
    </div>
  );
}

/** Kayıt Bilgileri (Edit.cshtml:429-457): salt bilgi + Değişiklik Geçmişi. */
function RecordInfo({ account }: { account: Account }) {
  const { t } = useTranslation("ztoFinans");
  const history = useAccountHistory(account.id);
  const label = (key: string) => t(`accounts.form.${key}`);
  const updated = account.updateCount > 0;
  const text = historyText(history.data ?? [], (event) =>
    t(`accounts.historyEvents.${event}`, { defaultValue: event }),
  );
  return (
    <div className="col-12 mb-2">
      <div className="card border">
        <div className="card-header py-1 px-3">
          <small className="text-muted font-weight-bold text-uppercase">
            <i className="fas fa-history mr-1" aria-hidden="true" />
            {label("record")}
          </small>
        </div>
        <div className="card-body py-2 px-2">
          <div className="row">
            {(
              [
                ["createdAt", "recCreatedAt", recordDate(account.createdAt)],
                ["createdBy", "recCreatedBy", account.createdBy || "-"],
                ["updatedAt", "recUpdatedAt", updated ? recordDate(account.updatedAt) : "-"],
                ["updatedBy", "recUpdatedBy", updated ? account.updatedBy || "-" : "-"],
              ] as const
            ).map(([key, id, value]) => (
              <div key={key} className="col-md-3 mb-1">
                <label className="small mb-0" htmlFor={id}>
                  {label(key)}
                </label>
                <input
                  id={id}
                  className="form-control form-control-sm"
                  value={value}
                  disabled
                  readOnly
                />
              </div>
            ))}
          </div>
          <label className="small mb-0 mt-1" htmlFor="recChangeLog">
            {label("changeLog")}
          </label>
          <textarea
            id="recChangeLog"
            className="form-control form-control-sm"
            rows={4}
            disabled
            readOnly
            style={{
              fontSize: 11,
              lineHeight: 1.6,
              background: "#f4f7fb",
              resize: "vertical",
              whiteSpace: "pre-wrap",
            }}
            value={text || label("noChanges")}
          />
        </div>
      </div>
    </div>
  );
}
