import type {
  Branch,
  BranchGroup,
  BranchGroupType,
  Company,
} from "../../../../pages/organization/types";
import { formatLocation } from "../../../components/definitionLogic";
import type { ZtoDefinitionField } from "../../../components/ZtoDefinitionDetailsModal";

/**
 * ztoFinans çeviri fonksiyonu: sayfanın `useTranslation("ztoFinans")` ile aldığı `t` verilir
 * (locales.test.ts literal anahtarları bu ad alanında arar).
 */
export type Translate = (key: string) => string;

/**
 * Şube tipi gösterimi, ZTO birebir: liste, arama ve Detay'da ham değer — MAIN "Ana Şube", SUB "Şube"
 * (ZTO'da "Yan Şube" seçeneğinin değeri "Şube"dir, BranchProvince/Add.cshtml:47); null → "".
 */
export function groupTypeText(type: BranchGroupType | null, t: Translate): string {
  if (type === "MAIN") return t("branchGroups.typeMain");
  if (type === "SUB") return t("branchGroups.typeSubValue");
  return "";
}

export function statusText(active: boolean, t: Translate): string {
  return t(active ? "definitions.active" : "definitions.passive");
}

/** İş Yeri: Adı, Telefon, Adres, Durum (DefinitionAuditRegistry.cs:61) + Şube, (≥2) Şirket, Konum. */
export function workPlaceDetailFields(
  branch: Branch,
  multiCompany: boolean,
  t: Translate,
): ZtoDefinitionField[] {
  const fields: ZtoDefinitionField[] = [
    { label: t("definitions.fieldName"), value: branch.name },
    { label: t("definitions.fieldPhone"), value: branch.phone },
    { label: t("definitions.fieldAddress"), value: branch.address },
    { label: t("definitions.status"), value: statusText(branch.active, t) },
    {
      label: t("definitions.fieldGroup"),
      value: branch.branchGroupName ?? t("definitions.unspecified"),
    },
  ];
  if (multiCompany) fields.push({ label: t("definitions.company"), value: branch.companyName });
  fields.push({
    label: t("definitions.fieldLocation"),
    value: formatLocation(branch.latitude, branch.longitude),
  });
  return fields;
}

/** Şube: Adı, Şube Türü, Telefon, E-posta, Durum (DefinitionAuditRegistry.cs:62) + (≥2) Şirket. */
export function branchGroupDetailFields(
  group: BranchGroup,
  multiCompany: boolean,
  t: Translate,
): ZtoDefinitionField[] {
  const fields: ZtoDefinitionField[] = [
    { label: t("definitions.fieldName"), value: group.name },
    { label: t("branchGroups.typeField"), value: groupTypeText(group.groupType, t) },
    { label: t("definitions.fieldPhone"), value: group.phone },
    { label: t("definitions.fieldEmail"), value: group.email },
    { label: t("definitions.status"), value: statusText(group.active, t) },
  ];
  if (multiCompany) fields.push({ label: t("definitions.company"), value: group.companyName });
  return fields;
}

/** Şirket: Unvan, Kısa Ad, VKN/TCKN, Vergi Dairesi, Telefon, E-posta, Adres, Durum (§6.8). */
export function companyDetailFields(company: Company, t: Translate): ZtoDefinitionField[] {
  return [
    { label: t("companies.companyTitle"), value: company.title },
    { label: t("companies.shortName"), value: company.shortName },
    { label: t("companies.taxNumber"), value: company.taxNumber },
    { label: t("companies.taxOffice"), value: company.taxOffice },
    { label: t("definitions.fieldPhone"), value: company.phone },
    { label: t("definitions.fieldEmail"), value: company.email },
    { label: t("definitions.fieldAddress"), value: company.address },
    { label: t("definitions.status"), value: statusText(company.active, t) },
  ];
}

/** ZTO tanım ekranlarının yolları (/zto-finans/tanimlar/…). */
export const DEFINITION_PATHS = {
  workPlaces: "/zto-finans/tanimlar/is-yerleri",
  branchGroups: "/zto-finans/tanimlar/subeler",
  companies: "/zto-finans/tanimlar/sirketler",
} as const;

export type CompanyTab = "genel" | "e-belge" | "seriler";

/** Şirket formunun etkin sekmesi (`?sekme=`); eklemede yalnız Genel. */
export function companyTab(value: string | null, editing: boolean): CompanyTab {
  if (!editing) return "genel";
  return value === "e-belge" || value === "seriler" ? value : "genel";
}
