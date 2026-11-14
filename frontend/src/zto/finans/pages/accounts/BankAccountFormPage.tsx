import { zodResolver } from "@hookform/resolvers/zod";
import { ReactNode, useMemo, useState } from "react";
import { useForm, type FieldPath, type UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  createBankAccount,
  updateBankAccount,
  useAccount,
  useBankAccount,
  useFinanceMutation,
} from "../../../../pages/finance/accountApi";
import { today as localToday, useCurrencies } from "../../../../pages/finance/common";
import type { AccountBankAccount } from "../../../../pages/finance/types";
import { errorIdOf, fieldA11yProps, fieldStateOf, useFormErrorAnnouncer } from "../../../a11y";
import { currencySymbol, useZtoSnackbar } from "../../../components";
import { errorCode, errorMessage } from "../../../components/definitionLogic";
import { accountBankAccountsPath } from "../../navItems";
import { ZtoPageLoading } from "../../ZtoSuspenseOutlet";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import {
  BANK_CATEGORIES,
  BANK_KINDS,
  BANK_LIMITS,
  bankBody,
  bankErrorField,
  bankFormFrom,
  bankFormSchema,
  emptyBankForm,
  normalizeIbanInput,
  type BankFormValues,
} from "./bankAccountLogic";

const RED = { color: "red" } as const;

export type BankAccountFormPageProps = { mode?: "add" | "edit" };

/**
 * Yeni Banka Hesabı / Banka Hesabı Düzenle (ZTO BankAccounts/Add.cshtml, Edit.cshtml; 12.1 §5.9).
 * Add ve Edit aynı kural: IBAN ya da hesap no zorunlu, kategori zorunlu. Son İşlem Tarihi ÇIKAR.
 * Edit tam IBAN'ı `GET /bank-accounts/{id}`'den alır (FINANCE_MANAGE).
 */
export function BankAccountFormPage({ mode = "add" }: BankAccountFormPageProps) {
  useZtoRootClass("zto-page-bank-account-form");
  const { id, bankAccountId } = useParams();
  const { t } = useTranslation("ztoFinans");
  const editing = mode === "edit";
  const bank = useBankAccount(editing ? bankAccountId : undefined);
  const accountId = editing ? bank.data?.accountId : id;
  const account = useAccount(accountId);

  if ((editing && bank.isPending) || (!editing && account.isPending)) return <ZtoPageLoading />;
  const failure = (editing ? bank.error : account.error) ?? null;
  if (failure || !accountId) {
    return (
      <div className="container-fluid">
        <br />
        <div className="alert alert-danger" role="alert">
          {errorMessage(failure, t("accounts.bank.loadFailed"))}
        </div>
      </div>
    );
  }
  return (
    <BankAccountForm
      key={bank.data?.id ?? "new"}
      accountId={accountId}
      accountLabel={
        account.data
          ? `${account.data.name} (${account.data.subGroupName || account.data.subGroup})`
          : (bank.data?.accountName ?? "")
      }
      existing={editing ? bank.data : undefined}
    />
  );
}

type FormApi = UseFormReturn<BankFormValues>;

function BankAccountForm({
  accountId,
  accountLabel,
  existing,
}: {
  accountId: string;
  accountLabel: string;
  existing?: AccountBankAccount;
}) {
  const { t } = useTranslation("ztoFinans");
  const { t: tc } = useTranslation();
  const navigate = useNavigate();
  const snackbar = useZtoSnackbar();
  const currencies = useCurrencies();
  const announcer = useFormErrorAnnouncer();
  const editing = existing !== undefined;
  const [formError, setFormError] = useState<string | null>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const f = (key: string) => t(`accounts.bankForm.${key}`);

  const schema = useMemo(
    () =>
      bankFormSchema({
        required: t("accounts.form.required"),
        selectRequired: t("accounts.form.selectRequired"),
        identifierRequired: f("identifierRequired"),
        accountNumberInvalid: t("accounts.form.accountNumberInvalid"),
        tooLong: (max) => t("accounts.form.tooLong", { max }),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- f yalnız t'den türetilir
    [t],
  );
  const form = useForm<BankFormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    shouldFocusError: true,
    defaultValues: existing ? bankFormFrom(existing) : emptyBankForm(localToday()),
  });
  const { register, handleSubmit, formState, setError, getFieldState } = form;
  const listPath = accountBankAccountsPath(accountId);

  const save = useFinanceMutation(
    (values: BankFormValues) =>
      existing
        ? updateBankAccount(existing.id, bankBody(values))
        : createBankAccount(accountId, bankBody(values)),
    {
      onSuccess: () => {
        snackbar.show(f(editing ? "updated" : "created"), "success");
        navigate(listPath);
      },
      onError: (error) => {
        const code = errorCode(error);
        const message = code === "IBAN_TAKEN" ? f("ibanTaken") : errorMessage(error, f("error"));
        if (bankErrorField(code) === "iban") {
          setError("iban", { message }, { shouldFocus: true });
        } else {
          setFormError(message);
        }
      },
    },
  );

  const ibanError = fieldStateOf(formState, "iban");
  const ibanShown = Boolean((ibanError.touched || ibanError.submitted) && ibanError.error);
  const field = (name: FieldPath<BankFormValues>, id: string, label: string) => {
    const base = register(name);
    const registered =
      name === "iban"
        ? {
            ...base,
            onChange: (event: Parameters<typeof base.onChange>[0]) => {
              event.target.value = normalizeIbanInput(event.target.value);
              return base.onChange(event);
            },
          }
        : base;
    const a11y = fieldA11yProps(name, fieldStateOf(formState, name, { id }));
    // "İkisinden biri" kuralının hatası IBAN altında; hesap no da aynı metne bağlanır (§5.9 MWG).
    if (name === "accountNumber" && ibanShown) {
      a11y["aria-describedby"] = [a11y["aria-describedby"], errorIdOf("IBAN")]
        .filter(Boolean)
        .join(" ");
      a11y["aria-invalid"] = true;
    }
    return {
      ...registered,
      ...a11y,
      onBlur: async (event: Parameters<typeof base.onBlur>[0]) => {
        await registered.onBlur(event);
        announcer.announceFieldError(name, label, getFieldState(name).error?.message);
      },
    };
  };
  const cls = (name: FieldPath<BankFormValues>) => {
    const state = fieldStateOf(formState, name);
    return (state.touched || state.submitted) && state.error
      ? "form-control is-invalid"
      : "form-control";
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

  return (
    <>
      <br />
      <div className="col-md-12">
        <div className={editing ? "cst-wrap cst-edit" : "cst-wrap"}>
          <div className="cst-card">
            <header className="cst-card-head">
              <div className="cst-head-left">
                <span className="cst-head-icon" aria-hidden="true">
                  <i className="fas fa-credit-card" />
                </span>
                <div className="cst-head-title">
                  <h5>{f(editing ? "editTitle" : "addTitle")}</h5>
                  <p>
                    {existing
                      ? `${existing.bankName}${existing.ibanMasked ? ` · ${existing.ibanMasked}` : ""}`
                      : accountLabel}
                  </p>
                </div>
              </div>
              <Link
                to={listPath}
                className={editing ? "cst-list-link" : "cst-list-link cst-list-link--muted"}
              >
                <i className="fas fa-arrow-left" aria-hidden="true" /> {f("back")}
              </Link>
            </header>
            <div className="cst-body">
              {formError && (
                <div className="alert alert-danger alert-dismissible fade show" role="alert">
                  <i className="fas fa-exclamation-triangle" aria-hidden="true" /> {formError}
                  <button
                    type="button"
                    className="close"
                    aria-label={tc("common.a11y.close")}
                    onClick={() => setFormError(null)}
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </div>
              )}
              {announcer.region}
              <form
                noValidate
                aria-busy={save.isPending}
                onSubmit={handleSubmit((values) => {
                  setFormError(null);
                  save.mutate(values);
                })}
              >
                <div className="row">
                  <Col>
                    <label htmlFor="BankName" className="form-label">
                      {f("bankName")}: {star}
                    </label>
                    <input
                      type="text"
                      className={cls("bankName")}
                      required
                      aria-required="true"
                      autoComplete="off"
                      maxLength={BANK_LIMITS.bankName}
                      autoFocus
                      placeholder={editing ? undefined : t("accounts.bankRow.bankNamePlaceholder")}
                      {...field("bankName", "BankName", f("bankName"))}
                    />
                    <FieldError form={form} name="bankName" id="BankName" />
                  </Col>
                  <Col>
                    <label htmlFor="BranchName" className="form-label">
                      {f("branchName")}:
                    </label>
                    <input
                      type="text"
                      className={cls("branchName")}
                      autoComplete="off"
                      maxLength={BANK_LIMITS.branchName}
                      placeholder={
                        editing ? undefined : t("accounts.bankRow.branchNamePlaceholder")
                      }
                      {...field("branchName", "BranchName", f("branchName"))}
                    />
                    <FieldError form={form} name="branchName" id="BranchName" />
                  </Col>
                  <Col>
                    <label htmlFor="AccountNumber" className="form-label">
                      {f("accountNumber")}:{" "}
                    </label>
                    <input
                      type="text"
                      className={ibanShown ? "form-control is-invalid" : cls("accountNumber")}
                      autoComplete="off"
                      maxLength={BANK_LIMITS.accountNumber}
                      placeholder={editing ? undefined : "1234567890"}
                      {...field("accountNumber", "AccountNumber", f("accountNumber"))}
                    />
                    <FieldError form={form} name="accountNumber" id="AccountNumber" />
                  </Col>
                  <Col>
                    <label htmlFor="IBAN" className="form-label">
                      {f("iban")}:
                    </label>
                    <input
                      type="text"
                      className={cls("iban")}
                      maxLength={BANK_LIMITS.iban}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      placeholder={t("accounts.bankRow.ibanPlaceholder")}
                      {...field("iban", "IBAN", f("iban"))}
                    />
                    <FieldError form={form} name="iban" id="IBAN" />
                  </Col>
                </div>
                <br />
                <div className="row">
                  <Col>
                    <label htmlFor="AccountHolderName" className="form-label">
                      {f("holderName")}:
                    </label>
                    <input
                      type="text"
                      className={cls("holderName")}
                      autoComplete="off"
                      maxLength={BANK_LIMITS.holderName}
                      placeholder={
                        editing ? undefined : t("accounts.bankRow.holderNamePlaceholder")
                      }
                      {...field("holderName", "AccountHolderName", f("holderName"))}
                    />
                    <FieldError form={form} name="holderName" id="AccountHolderName" />
                  </Col>
                  <Col>
                    <label htmlFor="AccountType" className="form-label">
                      {f("kind")}:
                    </label>
                    <select
                      className="form-control"
                      {...field("accountKind", "AccountType", f("kind"))}
                    >
                      <option value="">{f("pleaseSelect")}</option>
                      {BANK_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {tc(`finance.bankAccountKind.${kind}`)}
                        </option>
                      ))}
                    </select>
                  </Col>
                  <Col>
                    <label htmlFor="CurrencyID" className="form-label">
                      {f("currency")}: {star}
                    </label>
                    <select
                      className={cls("currency")}
                      required
                      aria-required="true"
                      {...field("currency", "CurrencyID", f("currency"))}
                    >
                      <option value="" disabled>
                        {f("pleaseSelect")}
                      </option>
                      {currencyOptions.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <FieldError form={form} name="currency" id="CurrencyID" />
                  </Col>
                  <Col>
                    <label htmlFor="AccountCategory" className="form-label">
                      {f("category")}:{star}
                    </label>
                    <select
                      className={cls("category")}
                      required
                      aria-required="true"
                      {...field("category", "AccountCategory", f("category"))}
                    >
                      <option value="">{f("pleaseSelect")}</option>
                      {BANK_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {tc(`finance.bankAccountCategory.${category}`)}
                        </option>
                      ))}
                    </select>
                    <FieldError form={form} name="category" id="AccountCategory" />
                  </Col>
                </div>
                <br />
                <div className="row">
                  <Col>
                    <label htmlFor="AccountOpenDate" className="form-label">
                      {f("openedOn")}:
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      {...field("openedOn", "AccountOpenDate", f("openedOn"))}
                    />
                  </Col>
                </div>
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
                        maxLength={BANK_LIMITS.description}
                        placeholder={t("accounts.bankRow.descriptionPlaceholder")}
                        {...field("description", "Description", f("description"))}
                      />
                      <button
                        type="button"
                        className="btn btn-info"
                        style={{ position: "relative" }}
                        aria-label={f("descriptionTip")}
                        aria-expanded={tipOpen}
                        onMouseEnter={() => setTipOpen(true)}
                        onMouseLeave={() => setTipOpen(false)}
                        onFocus={() => setTipOpen(true)}
                        onBlur={() => setTipOpen(false)}
                      >
                        <i className="fas fa-info-circle" aria-hidden="true" />
                        <span
                          id="DescriptionTip"
                          className="tooltip-text"
                          style={{ display: tipOpen ? "block" : undefined }}
                        >
                          {f("descriptionTip")}
                        </span>
                      </button>
                    </div>
                    <FieldError form={form} name="description" id="Description" />
                  </div>
                </div>
                <br />
                <hr />
                <div className="row">
                  <div className="col-md-12">
                    <button
                      type="submit"
                      id="submitButton"
                      className={
                        editing ? "btn btn-success col-md-12" : "btn btn-primary col-md-12"
                      }
                      disabled={save.isPending}
                      aria-busy={save.isPending}
                    >
                      <i className={editing ? "fas fa-save" : "fas fa-plus"} aria-hidden="true" />{" "}
                      {save.isPending ? (
                        <>
                          {f(editing ? "updating" : "creating")}{" "}
                          <i className="fas fa-spinner fa-spin" aria-hidden="true" />
                        </>
                      ) : (
                        f(editing ? "update" : "create")
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Col({ children }: { children: ReactNode }) {
  return <div className="col-md-3">{children}</div>;
}

function FieldError({
  form,
  name,
  id,
}: {
  form: FormApi;
  name: FieldPath<BankFormValues>;
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
