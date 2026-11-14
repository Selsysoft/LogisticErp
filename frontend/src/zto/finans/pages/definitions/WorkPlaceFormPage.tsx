import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../../../../api/client";
import { useAuthStore } from "../../../../auth/authStore";
import {
  activeCompanies,
  formDefaultCompanyId,
  implicitCompanyId,
  isMultiCompany,
  useActiveCompanyId,
} from "../../../../auth/companyStore";
import {
  invalidateOrganization,
  useBranch,
  useBranchGroups,
} from "../../../../pages/organization/api";
import type { Branch } from "../../../../pages/organization/types";
import { ZtoAlert, ZtoDefinitionBreadcrumb, ZtoSelect, formatDateTime } from "../../../components";
import {
  dateTimeLocalValue,
  digitsOnly,
  errorMessage,
  mapsUrl,
  parseLocation,
} from "../../../components/definitionLogic";
import type { ZtoSelectOption } from "../../../components/selectLogic";
import { ZtoPageLoading } from "../../ZtoSuspenseOutlet";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { DEFINITION_PATHS } from "./definitionDetails";
import {
  emptyWorkPlace,
  validateWorkPlace,
  workPlaceBody,
  workPlaceFromBranch,
  type FormErrors,
  type WorkPlaceField,
  type WorkPlaceValues,
} from "./definitionForms";
import { useCan } from "./definitionHooks";
import { SubmitContent } from "./DefinitionParts";

const RED = { color: "red" } as const;

export type WorkPlaceFormPageProps = {
  /** Verilmezse rotadaki `:id`'den çıkarılır. */
  mode?: "add" | "edit";
};

/**
 * Yeni İş Yeri / İş Yeri Düzenle (12.1a §6.10): ZTO Views/WorkPlace/Add.cshtml ve Edit.cshtml düzeni
 * birebir, sınıflar introduction-details.js enhanceDefinitionForm sonrası hâliyle (Şablon D). Gömülü
 * Google haritası çıkarıldı (D19): Konum elle "enlem,boylam" yazılır, "Haritada Göster" yeni sekmede açar.
 */
export function WorkPlaceFormPage({ mode }: WorkPlaceFormPageProps) {
  const { id } = useParams();
  const editing = (mode ?? (id ? "edit" : "add")) === "edit";
  const { t } = useTranslation("ztoFinans");
  useZtoRootClass("definition-form-page");
  const branch = useBranch(editing ? id : undefined);

  if (editing && branch.isPending) return <ZtoPageLoading />;
  if (editing && branch.isError) {
    return (
      <div className="container-fluid">
        <br />
        <div className="alert alert-danger" role="alert">
          {errorMessage(branch.error, t("definitions.loadFailed"))}
        </div>
      </div>
    );
  }
  return (
    <WorkPlaceForm key={branch.data?.id ?? "new"} existing={editing ? branch.data : undefined} />
  );
}

function WorkPlaceForm({ existing }: { existing?: Branch }) {
  const { t } = useTranslation("ztoFinans");
  const navigate = useNavigate();
  const client = useQueryClient();
  const me = useAuthStore((state) => state.me);
  const activeCompanyId = useActiveCompanyId();
  const multiCompany = isMultiCompany(me?.companies);
  const canManageGroups = useCan("BRANCH_MANAGE");
  const editing = existing !== undefined;
  const [values, setValues] = useState<WorkPlaceValues>(() =>
    existing
      ? workPlaceFromBranch(existing)
      : emptyWorkPlace(formDefaultCompanyId(activeCompanyId, me?.companies)),
  );
  const [errors, setErrors] = useState<FormErrors<WorkPlaceField>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [openedAt] = useState(() => dateTimeLocalValue(new Date()));

  const groups = useBranchGroups({
    active: true,
    companyId: multiCompany ? values.companyId || undefined : undefined,
  });
  const groupOptions = useMemo<ZtoSelectOption[]>(() => {
    const options = (groups.data ?? []).map((g) => ({ value: g.id, label: g.name }));
    // Mevcut grup pasifse listede yoktur; kaydın değeri yine görünsün.
    if (
      existing?.branchGroupId &&
      existing.branchGroupId === values.branchGroupId &&
      !options.some((o) => o.value === existing.branchGroupId)
    ) {
      options.push({ value: existing.branchGroupId, label: existing.branchGroupName ?? "" });
    }
    return options;
  }, [groups.data, existing, values.branchGroupId]);
  const companyOptions = activeCompanies(me?.companies).map((c) => ({
    value: c.id,
    label: c.shortName,
  }));

  const save = useMutation({
    mutationFn: () => {
      const body = workPlaceBody(values, {
        multiCompany,
        existing,
        implicitCompanyId: implicitCompanyId(me?.companies),
      });
      return existing
        ? apiRequest<Branch>("PUT", `/organization/branches/${existing.id}`, body)
        : apiRequest<Branch>("POST", "/organization/branches", body);
    },
    onSuccess: async () => {
      await invalidateOrganization(client);
      navigate(DEFINITION_PATHS.workPlaces, {
        state: { flash: t(editing ? "workPlaces.updated" : "workPlaces.created") },
      });
    },
    // 409 BRANCH_COMPANY_LOCKED dahil sunucu hataları formda gösterilir; formda kalınır.
    onError: (error) => setFailure(errorMessage(error, t("definitions.error"))),
  });

  const set = (field: WorkPlaceField, value: string) => {
    setValues((current) => ({
      ...current,
      [field]: value,
      // Şirket değişince Şube seçimi temizlenir (grup şirkete aittir).
      ...(field === "companyId" && value !== current.companyId ? { branchGroupId: "" } : {}),
    }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateWorkPlace(values, multiCompany);
    setErrors(found);
    setFailure(null);
    if (Object.values(found).some(Boolean)) return;
    save.mutate();
  };

  const error = (field: WorkPlaceField) =>
    errors[field] ? <div className="invalid-feedback d-block">{t(errors[field]!)}</div> : null;
  const invalid = (field: WorkPlaceField, base = "form-control") =>
    errors[field] ? `${base} is-invalid` : base;

  const location = parseLocation(values.location);
  const mapHref =
    location && location !== "invalid" ? mapsUrl(location.latitude, location.longitude) : undefined;
  const groupEmpty = groups.isSuccess && (groups.data?.length ?? 0) === 0;

  const companyField = multiCompany && (
    <div className="row">
      <div className="col-md-12 definition-form-field">
        <label htmlFor="CompanyID" className="form-label">
          {t("definitions.company")}: <span style={RED}>*</span>
        </label>
        <ZtoSelect
          id="CompanyID"
          value={values.companyId}
          onChange={(value) => set("companyId", value)}
          options={companyOptions}
          placeholder={t("definitions.pleaseSelect")}
          required
        />
        {error("companyId")}
      </div>
    </div>
  );

  const groupField = (
    <div className="row">
      <div className="col-md-12 definition-form-field">
        <label htmlFor="BranchProvinceID" className="form-label">
          {t("workPlaces.group")}: <span style={RED}>*</span>
        </label>
        <ZtoSelect
          id="BranchProvinceID"
          value={values.branchGroupId}
          onChange={(value) => set("branchGroupId", value)}
          options={groupOptions}
          placeholder={t("definitions.pleaseSelect")}
          allowClear
          required
        />
        {groupEmpty && (
          <small className="form-text text-muted">
            {t("definitions.groupListEmpty")}{" "}
            {canManageGroups && (
              <Link to={`${DEFINITION_PATHS.branchGroups}/yeni`}>{t("definitions.addGroup")}</Link>
            )}
          </small>
        )}
        {error("branchGroupId")}
      </div>
    </div>
  );

  const addressLocationRow = (
    <div className="row definition-form-grid">
      <div className="col-md-6 definition-form-field definition-form-field--wide">
        <label htmlFor="Address">{t("workPlaces.address")}:</label>
        <div className="input-group">
          <input
            type="text"
            className={invalid("address", "form-control ")}
            id="Address"
            maxLength={100}
            required
            value={values.address}
            onChange={(event) => set("address", event.target.value)}
          />
        </div>
        {error("address")}
      </div>
      <div className="col-md-6 definition-form-field definition-form-field--wide">
        <label htmlFor="Location">{t("workPlaces.location")}:</label>
        <div className="input-group">
          <input
            type="text"
            className={invalid("location", "form-control ")}
            id="Location"
            placeholder="41.015137,28.979530"
            value={values.location}
            onChange={(event) => set("location", event.target.value)}
          />
          <div className="input-group-append">
            <a
              className={
                mapHref ? "btn btn-outline-secondary" : "btn btn-outline-secondary disabled"
              }
              href={mapHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={mapHref ? undefined : true}
            >
              {t("workPlaces.showOnMap")}
            </a>
          </div>
        </div>
        {error("location")}
      </div>
    </div>
  );

  const failureAlert = failure && (
    <ZtoAlert variant="danger" message={failure} onClose={() => setFailure(null)} />
  );

  if (!editing) {
    return (
      <div className="container-fluid">
        <br />
        <ZtoDefinitionBreadcrumb
          items={[
            { label: t("workPlaces.crumb"), to: DEFINITION_PATHS.workPlaces },
            { label: t("definitions.addCrumb") },
          ]}
          title={t("workPlaces.addTitle")}
          icon="fas fa-building"
          showHr
        />
        {failureAlert}
        <form className="definition-form" noValidate onSubmit={submit}>
          <div className="row">
            <div className="col-md-12 definition-form-field">
              <label htmlFor="Name" className="form-label">
                {t("workPlaces.name")}: <span style={RED}>*</span>
              </label>
              <input
                type="text"
                className={invalid("name", "form-control ")}
                id="Name"
                maxLength={50}
                required
                value={values.name}
                onChange={(event) => set("name", event.target.value)}
              />
              {error("name")}
            </div>
          </div>
          <br />
          <div className="row">
            <div className="col-md-12 definition-form-field">
              <label htmlFor="PhoneNumber" className="form-label">
                {t("workPlaces.phone")}: <span style={RED}>*</span>
              </label>
              <input
                type="text"
                className={invalid("phone", "form-control number-input")}
                id="PhoneNumber"
                inputMode="numeric"
                required
                value={values.phone}
                onChange={(event) => set("phone", digitsOnly(event.target.value, 11))}
              />
              {error("phone")}
            </div>
          </div>
          <br />
          {companyField && (
            <>
              {companyField}
              <br />
            </>
          )}
          {groupField}
          <br />
          {addressLocationRow}
          <br />
          <div className="row">
            <div className="col-md-12 definition-form-field">
              <label htmlFor="CreationDate" className="form-label">
                {t("definitions.createdAt")}: <span style={RED}>*</span>
              </label>
              <input
                type="datetime-local"
                className="form-control"
                id="CreationDate"
                step={1}
                readOnly
                value={openedAt}
              />
            </div>
          </div>
          <br />
          <div className="row">
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
                  idle={t("workPlaces.create")}
                  busy={t("workPlaces.creating")}
                />
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="container-fluid">
      <br />
      <ZtoDefinitionBreadcrumb
        items={[
          { label: t("workPlaces.crumb"), to: DEFINITION_PATHS.workPlaces },
          { label: t("definitions.editCrumb") },
        ]}
        title={t("workPlaces.editTitle")}
        icon="fas fa-building"
      />
      {failureAlert}
      <form className="definition-form" noValidate onSubmit={submit}>
        <div className="form-group definition-form-field definition-form-field--wide">
          <label htmlFor="Code">{t("workPlaces.code")}</label>
          <input type="text" className="form-control" id="Code" readOnly value={existing.code} />
          <br />
          <label htmlFor="Name">{t("workPlaces.name")}</label>
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
          <br />
          <label htmlFor="PhoneNumber">{t("workPlaces.phone")}</label>
          <input
            type="text"
            className={invalid("phone", "form-control number-input")}
            id="PhoneNumber"
            inputMode="numeric"
            required
            value={values.phone}
            onChange={(event) => set("phone", digitsOnly(event.target.value, 11))}
          />
          {error("phone")}
          <br />
          {companyField}
          {groupField}
          {addressLocationRow}
          <br />
          <label htmlFor="CreationDate">{t("definitions.createdAt")}</label>
          <input
            type="text"
            className="form-control"
            id="CreationDate"
            readOnly
            value={formatDateTime(existing.createdAt)}
          />
          <br />
        </div>
        <br />
        <button type="submit" id="submitButton" className="btn btn-info" disabled={save.isPending}>
          {save.isPending ? (
            <SubmitContent
              pending
              icon="fas fa-info"
              idle={t("definitions.update")}
              busy={t("definitions.updating")}
            />
          ) : (
            t("definitions.update")
          )}
        </button>
      </form>
    </div>
  );
}
