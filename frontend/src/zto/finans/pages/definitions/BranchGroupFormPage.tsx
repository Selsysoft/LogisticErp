import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../../../../api/client";
import { useAuthStore } from "../../../../auth/authStore";
import {
  activeCompanies,
  formDefaultCompanyId,
  implicitCompanyId,
  isMultiCompany,
  useActiveCompanyId,
} from "../../../../auth/companyStore";
import { invalidateOrganization, useBranchGroup } from "../../../../pages/organization/api";
import type { BranchGroup } from "../../../../pages/organization/types";
import { ZtoAlert, ZtoDefinitionBreadcrumb, ZtoSelect, formatDateTime } from "../../../components";
import {
  dateTimeLocalValue,
  digitsOnly,
  errorCode,
  errorMessage,
} from "../../../components/definitionLogic";
import { ZtoPageLoading } from "../../ZtoSuspenseOutlet";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { DEFINITION_PATHS } from "./definitionDetails";
import {
  branchGroupBody,
  branchGroupValues,
  emptyBranchGroup,
  validateBranchGroup,
  type BranchGroupField,
  type BranchGroupValues,
  type FormErrors,
} from "./definitionForms";
import { SubmitContent } from "./DefinitionParts";

const RED = { color: "red" } as const;
const CHECK_STYLE = { marginTop: 35 } as const;

export type BranchGroupFormPageProps = { mode?: "add" | "edit" };

/**
 * Yeni Şube / Şube Düzenle (12.1a §6.11): ZTO Views/BranchProvince/Add.cshtml (tek satır, akışkan
 * sütunlar, iki noktalı etiketler) ve Edit.cshtml (iki sütun, form-group'lar, iki noktasız etiketler)
 * birebir; "Aktif" onay kutusu gerçekten kaydedilir (ZTO hatası #5 düzeltmesi), Edit'teki salt okunur
 * "ID" gösterilmez (grupta kod yok).
 */
export function BranchGroupFormPage({ mode }: BranchGroupFormPageProps) {
  const { id } = useParams();
  const editing = (mode ?? (id ? "edit" : "add")) === "edit";
  const { t } = useTranslation("ztoFinans");
  useZtoRootClass("definition-form-page");
  const group = useBranchGroup(editing ? id : undefined);

  if (editing && group.isPending) return <ZtoPageLoading />;
  if (editing && group.isError) {
    return (
      <div className="container-fluid">
        <br />
        <div className="alert alert-danger" role="alert">
          {errorMessage(group.error, t("definitions.loadFailed"))}
        </div>
      </div>
    );
  }
  return (
    <BranchGroupForm key={group.data?.id ?? "new"} existing={editing ? group.data : undefined} />
  );
}

function BranchGroupForm({ existing }: { existing?: BranchGroup }) {
  const { t } = useTranslation("ztoFinans");
  const navigate = useNavigate();
  const client = useQueryClient();
  const me = useAuthStore((state) => state.me);
  const activeCompanyId = useActiveCompanyId();
  const multiCompany = isMultiCompany(me?.companies);
  const editing = existing !== undefined;
  const [values, setValues] = useState<BranchGroupValues>(() =>
    existing
      ? branchGroupValues(existing)
      : emptyBranchGroup(formDefaultCompanyId(activeCompanyId, me?.companies)),
  );
  const [errors, setErrors] = useState<FormErrors<BranchGroupField>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [openedAt] = useState(() => dateTimeLocalValue(new Date()));

  const save = useMutation({
    mutationFn: () => {
      const body = branchGroupBody(values, {
        multiCompany,
        existing,
        implicitCompanyId: implicitCompanyId(me?.companies),
      });
      return existing
        ? apiRequest<BranchGroup>("PUT", `/organization/branch-groups/${existing.id}`, body)
        : apiRequest<BranchGroup>("POST", "/organization/branch-groups", body);
    },
    onSuccess: async () => {
      await invalidateOrganization(client);
      navigate(DEFINITION_PATHS.branchGroups, {
        state: { flash: t(editing ? "branchGroups.updated" : "branchGroups.saved") },
      });
    },
    onError: (error) =>
      setFailure(
        errorCode(error) === "BRANCH_GROUP_HAS_ACTIVE_BRANCHES"
          ? t("branchGroups.hasBranches")
          : errorMessage(error, t("definitions.error")),
      ),
  });

  const set = <K extends BranchGroupField>(field: K, value: BranchGroupValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateBranchGroup(values, multiCompany);
    setErrors(found);
    setFailure(null);
    if (Object.values(found).some(Boolean)) return;
    save.mutate();
  };

  const error = (field: BranchGroupField) =>
    errors[field] ? <div className="invalid-feedback d-block">{t(errors[field]!)}</div> : null;
  const invalid = (field: BranchGroupField, base = "form-control") =>
    errors[field] ? `${base} is-invalid` : base;
  /** Add: "Etiket:" (+ yıldız); Edit: "Etiket" (iki noktasız, birebir). */
  const label = (text: string, star = false): ReactNode => (
    <>
      {text}
      {editing ? "" : ":"}
      {star && (
        <>
          {" "}
          <span style={RED}>*</span>
        </>
      )}
    </>
  );

  const fields = {
    company: multiCompany && (
      <>
        <label htmlFor="CompanyID" className={editing ? undefined : "form-label"}>
          {label(t("definitions.company"), true)}
        </label>
        <ZtoSelect
          id="CompanyID"
          value={values.companyId}
          onChange={(value) => set("companyId", value)}
          options={activeCompanies(me?.companies).map((c) => ({ value: c.id, label: c.shortName }))}
          placeholder={t("definitions.pleaseSelect")}
          required
        />
        {error("companyId")}
      </>
    ),
    name: (
      <>
        <label htmlFor="Name" className={editing ? undefined : "form-label"}>
          {label(t("branchGroups.name"), true)}
        </label>
        <input
          type="text"
          className={invalid("name")}
          id="Name"
          maxLength={50}
          required
          value={values.name}
          onChange={(event) => set("name", event.target.value)}
        />
        {error("name")}
      </>
    ),
    phone: (
      <>
        <label htmlFor="Phone" className={editing ? undefined : "form-label"}>
          {label(t("branchGroups.phone"))}
        </label>
        <input
          type="text"
          className="form-control number-input"
          id="Phone"
          inputMode="numeric"
          maxLength={11}
          value={values.phone}
          onChange={(event) => set("phone", digitsOnly(event.target.value, 11))}
        />
      </>
    ),
    address: (
      <>
        <label htmlFor="Address" className={editing ? undefined : "form-label"}>
          {label(t("branchGroups.address"))}
        </label>
        <input
          type="text"
          className="form-control"
          id="Address"
          maxLength={100}
          value={values.address}
          onChange={(event) => set("address", event.target.value)}
        />
      </>
    ),
    email: (
      <>
        <label htmlFor="Email" className={editing ? undefined : "form-label"}>
          {label(t("branchGroups.email"))}
        </label>
        <input
          type="email"
          className={invalid("email")}
          id="Email"
          value={values.email}
          onChange={(event) => set("email", event.target.value)}
        />
        {error("email")}
      </>
    ),
    type: (
      <>
        <label htmlFor="BranchType" className={editing ? undefined : "form-label"}>
          {label(t("branchGroups.type"))}
        </label>
        <ZtoSelect
          id="BranchType"
          value={values.groupType}
          onChange={(value) => set("groupType", value as BranchGroupValues["groupType"])}
          options={[
            { value: "MAIN", label: t("branchGroups.typeMain") },
            { value: "SUB", label: t("branchGroups.typeSub") },
          ]}
          placeholder={t("definitions.pleaseSelect")}
          allowClear
        />
      </>
    ),
    taxNumber: (
      <>
        <label htmlFor="TaxNumber" className={editing ? undefined : "form-label"}>
          {label(t("branchGroups.taxNumber"))}
        </label>
        <input
          type="text"
          className="form-control"
          id="TaxNumber"
          inputMode="numeric"
          value={values.taxNumber}
          onChange={(event) => set("taxNumber", digitsOnly(event.target.value, 11))}
        />
      </>
    ),
    taxOffice: (
      <>
        <label htmlFor="TaxOffice" className={editing ? undefined : "form-label"}>
          {label(t("branchGroups.taxOffice"))}
        </label>
        <input
          type="text"
          className="form-control"
          id="TaxOffice"
          maxLength={100}
          value={values.taxOffice}
          onChange={(event) => set("taxOffice", event.target.value)}
        />
      </>
    ),
    createdAt: (
      <>
        <label htmlFor="CreationDate" className={editing ? undefined : "form-label"}>
          {label(t("definitions.createdAt"), !editing)}
        </label>
        {editing ? (
          <input
            type="text"
            className="form-control"
            id="CreationDate"
            readOnly
            value={formatDateTime(existing.createdAt)}
          />
        ) : (
          <input
            type="datetime-local"
            className="form-control"
            id="CreationDate"
            step={1}
            readOnly
            value={openedAt}
          />
        )}
      </>
    ),
    status: (
      <>
        <input
          className="form-check-input"
          type="checkbox"
          id="Status"
          checked={values.active}
          onChange={(event) => set("active", event.target.checked)}
        />
        <label className="form-check-label" htmlFor="Status">
          {t("definitions.active")}
        </label>
      </>
    ),
  };

  const failureAlert = failure && (
    <ZtoAlert variant="danger" message={failure} onClose={() => setFailure(null)} />
  );

  if (!editing) {
    const col = (size: 6 | 12, content: ReactNode) => (
      <div className={`col-md-${size} definition-form-field`}>{content}</div>
    );
    return (
      <div className="container-fluid">
        <br />
        <ZtoDefinitionBreadcrumb
          items={[
            { label: t("branchGroups.crumb"), to: DEFINITION_PATHS.branchGroups },
            { label: t("definitions.addCrumb") },
          ]}
          title={t("branchGroups.addTitle")}
          icon="fas fa-city"
          showHr
        />
        {failureAlert}
        <form className="definition-form" noValidate onSubmit={submit}>
          <div className="row definition-form-grid">
            {fields.company && col(6, fields.company)}
            {col(6, fields.name)}
            {col(6, fields.phone)}
            {col(12, fields.address)}
            {col(6, fields.email)}
            {col(6, fields.type)}
            {col(6, fields.taxNumber)}
            {col(6, fields.taxOffice)}
            {col(6, fields.createdAt)}
            <div className="col-md-6">
              <div className="form-check" style={CHECK_STYLE}>
                {fields.status}
              </div>
            </div>
          </div>
          <br />
          <div className="col-md-12 definition-form-actions">
            <button
              type="submit"
              id="submitButton"
              className="btn btn-primary col-md-12"
              disabled={save.isPending}
            >
              <SubmitContent
                pending={save.isPending}
                icon="fas fa-plus"
                idle={t("branchGroups.create")}
                busy={t("branchGroups.creating")}
              />
            </button>
          </div>
        </form>
      </div>
    );
  }

  const group = (content: ReactNode) => (
    <div className="form-group definition-form-field">{content}</div>
  );
  return (
    <div className="container-fluid">
      <br />
      <ZtoDefinitionBreadcrumb
        items={[
          { label: t("branchGroups.crumb"), to: DEFINITION_PATHS.branchGroups },
          { label: t("definitions.editCrumb") },
        ]}
        title={t("branchGroups.editTitle")}
        icon="fas fa-city"
      />
      {failureAlert}
      <form className="definition-form" noValidate onSubmit={submit}>
        <div className="row">
          <div className="col-md-6 definition-form-grid">
            {fields.company && group(fields.company)}
            {group(fields.name)}
            {group(fields.phone)}
            {group(fields.address)}
            {group(fields.email)}
          </div>
          <div className="col-md-6 definition-form-grid">
            {group(fields.type)}
            {group(fields.taxNumber)}
            {group(fields.taxOffice)}
            {group(fields.createdAt)}
            <div className="form-group form-check">{fields.status}</div>
          </div>
        </div>
        <br />
        <div className="row">
          <div className="col-md-12 definition-form-actions">
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
          </div>
        </div>
      </form>
    </div>
  );
}
