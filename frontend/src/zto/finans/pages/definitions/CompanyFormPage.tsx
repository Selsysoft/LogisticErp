import { useTranslation } from "react-i18next";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useCompany } from "../../../../pages/organization/api";
import { ZtoDefinitionBreadcrumb } from "../../../components";
import { errorMessage } from "../../../components/definitionLogic";
import { ZtoPageLoading } from "../../ZtoSuspenseOutlet";
import { useZtoRootClass } from "../../ZtoRootClassContext";
import { CompanyEDocumentTab } from "./CompanyEDocumentTab";
import { CompanyGeneralTab } from "./CompanyGeneralTab";
import { CompanySeriesTab } from "./CompanySeriesTab";
import { companyTab, DEFINITION_PATHS, type CompanyTab } from "./definitionDetails";

export type CompanyFormPageProps = { mode?: "add" | "edit" };

const TABS: ReadonlyArray<{ id: CompanyTab; label: string }> = [
  { id: "genel", label: "companies.tabGeneral" },
  { id: "e-belge", label: "companies.tabEDocument" },
  { id: "seriler", label: "companies.tabSeries" },
];

/**
 * Yeni Şirket / Şirket Düzenle (12.1a §6.12): ZTO görünümünde yeni ekran. Sekmeler Genel / e-Belge /
 * Seriler (`?sekme=`); eklemede yalnız Genel etkin (e-Belge ayarı ve seriler şirket kaydıyla oluşur).
 */
export function CompanyFormPage({ mode }: CompanyFormPageProps) {
  const { id } = useParams();
  const editing = (mode ?? (id ? "edit" : "add")) === "edit";
  const { t } = useTranslation("ztoFinans");
  useZtoRootClass("definition-form-page");
  const [search] = useSearchParams();
  const tab = companyTab(search.get("sekme"), editing);
  const company = useCompany(editing ? id : undefined);

  if (editing && company.isPending) return <ZtoPageLoading />;
  if (editing && company.isError) {
    return (
      <div className="container-fluid">
        <br />
        <div className="alert alert-danger" role="alert">
          {errorMessage(company.error, t("definitions.loadFailed"))}
        </div>
      </div>
    );
  }
  const existing = editing ? company.data : undefined;

  return (
    <div className="container-fluid">
      <br />
      <ZtoDefinitionBreadcrumb
        items={[
          { label: t("companies.crumb"), to: DEFINITION_PATHS.companies },
          { label: t(editing ? "definitions.editCrumb" : "definitions.addCrumb") },
        ]}
        title={t(editing ? "companies.editTitle" : "companies.addTitle")}
        icon="fas fa-landmark"
        showHr={!editing}
      />
      <ul className="nav nav-tabs mb-3" role="tablist">
        {TABS.map((item) => {
          const active = item.id === tab;
          const disabled = !editing && item.id !== "genel";
          return (
            <li key={item.id} className="nav-item" role="presentation">
              {disabled ? (
                <a className="nav-link disabled" role="tab" aria-disabled="true" tabIndex={-1}>
                  {t(item.label)}
                </a>
              ) : (
                <Link
                  to={item.id === "genel" ? "?" : `?sekme=${item.id}`}
                  replace
                  className={active ? "nav-link active" : "nav-link"}
                  role="tab"
                  aria-selected={active}
                >
                  {t(item.label)}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      {tab === "genel" && <CompanyGeneralTab key={existing?.id ?? "new"} existing={existing} />}
      {tab === "e-belge" && existing && <CompanyEDocumentTab companyId={existing.id} />}
      {tab === "seriler" && existing && <CompanySeriesTab companyId={existing.id} />}
    </div>
  );
}
