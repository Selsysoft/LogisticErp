import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChangeEvent, FormEvent, ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { apiBlobUrl, apiRequest, apiUpload } from "../../../../api/client";
import { invalidateOrganization, useCompanyBankFunds } from "../../../../pages/organization/api";
import type { Company, TaxIdType } from "../../../../pages/organization/types";
import { ZtoAlert, ZtoSelect } from "../../../components";
import {
  companyCodeInput,
  digitsOnly,
  errorMessage,
  isAcceptableLogo,
} from "../../../components/definitionLogic";
import { DEFINITION_PATHS } from "./definitionDetails";
import {
  companyBody,
  companyValues,
  EMPTY_COMPANY,
  validateCompany,
  type CompanyField,
  type CompanyValues,
  type FormErrors,
} from "./definitionForms";
import { useCan } from "./definitionHooks";
import { SubmitContent } from "./DefinitionParts";

const RED = { color: "red" } as const;
const LOGO_STYLE = { maxWidth: 120, maxHeight: 60, display: "block", marginBottom: 8 } as const;

export type CompanyGeneralTabProps = { existing?: Company };

/**
 * Şirket › Genel (12.1a §6.12): BranchProvince/Edit.cshtml iki sütun düzeni (div.form-group, iki
 * noktasız etiketler, zorunlularda kırmızı yıldız). Varsayılan banka hesabı ve logo yalnız düzenlemede.
 */
export function CompanyGeneralTab({ existing }: CompanyGeneralTabProps) {
  const { t } = useTranslation("ztoFinans");
  const navigate = useNavigate();
  const client = useQueryClient();
  const editing = existing !== undefined;
  const canSeeFunds = useCan("FINANCE_VIEW");
  const [values, setValues] = useState<CompanyValues>(() =>
    existing ? companyValues(existing) : EMPTY_COMPANY,
  );
  const [errors, setErrors] = useState<FormErrors<CompanyField>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [logoNotice, setLogoNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [logoFileId, setLogoFileId] = useState(existing?.logoFileId ?? null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const funds = useCompanyBankFunds(existing?.id, editing && canSeeFunds);

  useEffect(() => {
    if (!logoFileId) {
      setLogoUrl(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    apiBlobUrl(`/files/${logoFileId}/content`)
      .then((created) => {
        if (cancelled) URL.revokeObjectURL(created);
        else {
          url = created;
          setLogoUrl(created);
        }
      })
      .catch(() => setLogoUrl(null));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [logoFileId]);

  const save = useMutation({
    mutationFn: () => {
      const body = companyBody(values, editing);
      return existing
        ? apiRequest<Company>("PUT", `/organization/companies/${existing.id}`, body)
        : apiRequest<Company>("POST", "/organization/companies", body);
    },
    onSuccess: async () => {
      await invalidateOrganization(client, { reloadMe: true });
      navigate(DEFINITION_PATHS.companies, {
        state: { flash: t(editing ? "companies.updated" : "companies.created") },
      });
    },
    onError: (error) => setFailure(errorMessage(error, t("definitions.error"))),
  });

  const logo = useMutation({
    mutationFn: (file: File | null) => {
      if (file === null) {
        return apiRequest<unknown>("DELETE", `/organization/companies/${existing!.id}/logo`).then(
          () => null,
        );
      }
      const form = new FormData();
      form.append("file", file);
      return apiUpload<Company>(`/organization/companies/${existing!.id}/logo`, form).then(
        (company) => company.logoFileId,
      );
    },
    onSuccess: async (fileId) => {
      setLogoFileId(fileId);
      setLogoNotice({
        ok: true,
        message: t(fileId ? "companies.logoChanged" : "companies.logoRemoved"),
      });
      await invalidateOrganization(client);
    },
    onError: (error) =>
      setLogoNotice({ ok: false, message: errorMessage(error, t("companies.logoInvalid")) }),
  });

  const set = <K extends CompanyField>(field: K, value: CompanyValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateCompany(values);
    setErrors(found);
    setFailure(null);
    if (Object.values(found).some(Boolean)) return;
    save.mutate();
  };

  const onLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!isAcceptableLogo(file)) {
      setLogoNotice({ ok: false, message: t("companies.logoInvalid") });
      return;
    }
    logo.mutate(file);
  };

  const error = (field: CompanyField) =>
    errors[field] ? <div className="invalid-feedback d-block">{t(errors[field]!)}</div> : null;
  const invalid = (field: CompanyField) =>
    errors[field] ? "form-control is-invalid" : "form-control";
  const label = (id: string, text: string, star = false) => (
    <label htmlFor={id}>
      {text}
      {star && (
        <>
          {" "}
          <span style={RED}>*</span>
        </>
      )}
    </label>
  );
  const text = (
    field: CompanyField,
    id: string,
    caption: string,
    options: {
      star?: boolean;
      max?: number;
      type?: string;
      digits?: number;
      transform?: (v: string) => string;
    } = {},
  ): ReactNode => (
    <div className="form-group definition-form-field">
      {label(id, caption, options.star)}
      <input
        type={options.type ?? "text"}
        className={invalid(field)}
        id={id}
        maxLength={options.max}
        inputMode={options.digits ? "numeric" : undefined}
        required={options.star}
        value={values[field] as string}
        onChange={(event) => {
          const raw = event.target.value;
          const next = options.digits
            ? digitsOnly(raw, options.digits)
            : options.transform
              ? options.transform(raw)
              : raw;
          set(field, next as CompanyValues[typeof field]);
        }}
      />
      {error(field)}
    </div>
  );
  const check = (field: "defaultCompany" | "active", id: string, caption: string) => (
    <div className="form-group form-check">
      <input
        className="form-check-input"
        type="checkbox"
        id={id}
        checked={values[field]}
        onChange={(event) => set(field, event.target.checked)}
      />
      <label className="form-check-label" htmlFor={id}>
        {caption}
      </label>
    </div>
  );

  return (
    <>
      {failure && <ZtoAlert variant="danger" message={failure} onClose={() => setFailure(null)} />}
      <form className="definition-form" noValidate onSubmit={submit}>
        <div className="row">
          <div className="col-md-6 definition-form-grid">
            {text("code", "Code", t("companies.code"), {
              star: true,
              max: 20,
              transform: companyCodeInput,
            })}
            {text("title", "Title", t("companies.companyTitle"), { star: true, max: 300 })}
            {text("shortName", "ShortName", t("companies.shortName"), { star: true, max: 100 })}
            <div className="form-group definition-form-field">
              {label("TaxIdType", t("companies.taxIdType"), true)}
              <ZtoSelect
                id="TaxIdType"
                value={values.taxIdType}
                onChange={(value) => set("taxIdType", (value || "VKN") as TaxIdType)}
                options={[
                  { value: "VKN", label: "VKN" },
                  { value: "TCKN", label: "TCKN" },
                ]}
                placeholder={null}
                allowClear={false}
                minimumResultsForSearch={Infinity}
              />
            </div>
            {text("taxNumber", "TaxNumber", t("companies.taxNumber"), { digits: 11 })}
            {text("taxOffice", "TaxOffice", t("companies.taxOffice"), { max: 100 })}
            {text("mersisNo", "MersisNo", t("companies.mersis"), { digits: 16 })}
            {text("tradeRegistryNo", "TradeRegistryNo", t("companies.tradeRegistry"), { max: 50 })}
            {text("sgkWorkplaceNo", "SgkWorkplaceNo", t("companies.sgk"), { max: 26 })}
          </div>
          <div className="col-md-6 definition-form-grid">
            <div className="form-group definition-form-field definition-form-field--wide">
              {label("Address", t("companies.address"))}
              <textarea
                className="form-control"
                id="Address"
                rows={3}
                maxLength={500}
                value={values.address}
                onChange={(event) => set("address", event.target.value)}
              />
            </div>
            {text("city", "City", t("companies.city"), { max: 100 })}
            {text("district", "District", t("companies.district"), { max: 100 })}
            {text("postalCode", "PostalCode", t("companies.postalCode"), { max: 10 })}
            {text("phone", "Phone", t("companies.phone"), { max: 30 })}
            {text("email", "Email", t("companies.email"), { max: 254, type: "email" })}
            {text("kepAddress", "KepAddress", t("companies.kep"), { max: 254, type: "email" })}
            {text("website", "Website", t("companies.website"), { max: 200 })}
            {editing && canSeeFunds && (
              <div className="form-group definition-form-field">
                {label("DefaultFund", t("companies.defaultFund"))}
                <ZtoSelect
                  id="DefaultFund"
                  value={values.defaultFundAccountId}
                  onChange={(value) => set("defaultFundAccountId", value)}
                  options={(funds.data ?? []).map((fund) => ({
                    value: fund.id,
                    label: fund.bankName ? `${fund.name} (${fund.bankName})` : fund.name,
                  }))}
                  placeholder={t("definitions.pleaseSelect")}
                  allowClear
                />
              </div>
            )}
            {editing && (
              <div className="form-group definition-form-field definition-form-field--wide">
                {label("Logo", t("companies.logo"))}
                {logoUrl && <img src={logoUrl} alt={t("companies.logo")} style={LOGO_STYLE} />}
                <input
                  type="file"
                  className="form-control-file"
                  id="Logo"
                  accept="image/png,image/jpeg"
                  disabled={logo.isPending}
                  onChange={onLogo}
                />
                {logoFileId && (
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger mt-2"
                    disabled={logo.isPending}
                    onClick={() => logo.mutate(null)}
                  >
                    <i className="fas fa-trash-alt" /> {t("companies.removeLogo")}
                  </button>
                )}
                {logoNotice && (
                  <small
                    className={logoNotice.ok ? "form-text text-success" : "form-text text-danger"}
                    role={logoNotice.ok ? "status" : "alert"}
                  >
                    {logoNotice.message}
                  </small>
                )}
              </div>
            )}
            {check("defaultCompany", "DefaultCompany", t("companies.defaultCompany"))}
            {check("active", "Status", t("definitions.active"))}
          </div>
        </div>
        <br />
        <div className="row">
          <div className="col-md-12 definition-form-actions">
            {editing ? (
              <button
                type="submit"
                id="submitButton"
                className="btn btn-info btn-block"
                disabled={save.isPending}
              >
                <SubmitContent
                  pending={save.isPending}
                  icon="fas fa-edit"
                  idle={t("definitions.update")}
                  busy={t("definitions.updating")}
                />
              </button>
            ) : (
              <button
                type="submit"
                id="submitButton"
                className="btn btn-primary col-md-12"
                disabled={save.isPending}
              >
                <SubmitContent
                  pending={save.isPending}
                  icon="fas fa-plus"
                  idle={t("companies.create")}
                  busy={t("companies.creating")}
                />
              </button>
            )}
          </div>
        </div>
      </form>
    </>
  );
}
