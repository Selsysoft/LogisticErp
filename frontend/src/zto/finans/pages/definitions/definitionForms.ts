import { z } from "zod";
import type {
  Branch,
  BranchGroup,
  BranchGroupType,
  Company,
  CompanyEDocumentSettings,
  EDocumentProfile,
  SaveBranchBody,
  SaveBranchGroupBody,
  SaveCompanyBody,
  SaveCompanyEDocumentSettingsBody,
  TaxIdType,
} from "../../../../pages/organization/types";
import {
  blankToNull,
  formatLocation,
  isValidTaxNumber,
  parseLocation,
} from "../../../components/definitionLogic";

/**
 * ZTO tanım formlarının saf mantığı (12.1a §6.10–§6.12): form değerleri, doğrulama (zod; mesajlar
 * ztoFinans anahtarlarıdır) ve istek gövdeleri. Sayfalar yalnız çizer.
 */

/** Alan → ztoFinans çeviri anahtarı. */
export type FormErrors<K extends string> = Partial<Record<K, string>>;

const REQUIRED = "definitions.required";

function errorsOf<K extends string>(result: z.ZodSafeParseResult<unknown>): FormErrors<K> {
  const errors: FormErrors<K> = {};
  if (result.success) return errors;
  for (const issue of result.error.issues) {
    const key = String(issue.path[0]) as K;
    errors[key] ??= issue.message;
  }
  return errors;
}

const required = (max: number) => z.string().trim().min(1, REQUIRED).max(max, REQUIRED);

// ---------------------------------------------------------------------------------------------
// İş yeri (ZTO WorkPlace)
// ---------------------------------------------------------------------------------------------

export type WorkPlaceValues = {
  name: string;
  phone: string;
  companyId: string;
  branchGroupId: string;
  address: string;
  location: string;
};

export type WorkPlaceField = keyof WorkPlaceValues;

export function emptyWorkPlace(companyId: string | undefined): WorkPlaceValues {
  return {
    name: "",
    phone: "",
    companyId: companyId ?? "",
    branchGroupId: "",
    address: "",
    location: "",
  };
}

export function workPlaceFromBranch(branch: Branch): WorkPlaceValues {
  return {
    name: branch.name,
    phone: branch.phone ?? "",
    companyId: branch.companyId,
    branchGroupId: branch.branchGroupId ?? "",
    address: branch.address ?? "",
    location: formatLocation(branch.latitude, branch.longitude),
  };
}

/**
 * ZTO birebir zorunluluklar (Add ve Edit): Ad, Telefon, Şube, Adres; ≥2 şirkette Şirket. Konum
 * isteğe bağlı ama "enlem,boylam" olmalı (S-6: API'de grup isteğe bağlı, yalnız bu formda zorunlu).
 */
export function validateWorkPlace(
  values: WorkPlaceValues,
  multiCompany: boolean,
): FormErrors<WorkPlaceField> {
  const schema = z.object({
    name: required(50),
    phone: z
      .string()
      .min(1, REQUIRED)
      .regex(/^\d{1,11}$/, "workPlaces.phoneInvalid"),
    companyId: multiCompany ? z.string().min(1, REQUIRED) : z.string(),
    branchGroupId: z.string().min(1, REQUIRED),
    address: required(100),
    location: z
      .string()
      .refine((v) => parseLocation(v) !== "invalid", "workPlaces.locationInvalid"),
  });
  return errorsOf<WorkPlaceField>(schema.safeParse(values));
}

/**
 * POST/PUT gövdesi. Düzenlemede `companyId` ve `branchGroupId` alan gizli olsa da kaydın değeriyle
 * her zaman gönderilir (§5.1 ön yüz kuralı); formda olmayan alanlar (kod, il, ilçe, SGK) mevcut
 * değerle korunur. Eklemede şirket ≥2 şirkette seçilenle, tek görünen şirket varsayılan değilse
 * (`implicitCompanyId`, LIMITED kullanıcı) onunla gönderilir; aksi hâlde sunucu varsayılana düşer.
 */
export function workPlaceBody(
  values: WorkPlaceValues,
  options: { multiCompany: boolean; existing?: Branch; implicitCompanyId?: string },
): SaveBranchBody {
  const location = parseLocation(values.location);
  const coordinates = location && location !== "invalid" ? location : null;
  const body: SaveBranchBody = {
    name: values.name.trim(),
    phone: blankToNull(values.phone),
    branchGroupId: values.branchGroupId || null,
    address: blankToNull(values.address),
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
  };
  const { existing } = options;
  if (existing) {
    return {
      code: existing.code,
      ...body,
      companyId: values.companyId || existing.companyId,
      city: existing.city,
      district: existing.district,
      sgkWorkplaceNo: existing.sgkWorkplaceNo,
    };
  }
  if (options.multiCompany) {
    return { ...body, companyId: values.companyId || null };
  }
  // Şirket alanı yokken görünen tek şirket varsayılan değilse (LIMITED) o şirket gönderilir.
  return options.implicitCompanyId ? { ...body, companyId: options.implicitCompanyId } : body;
}

// ---------------------------------------------------------------------------------------------
// Şube (ZTO BranchProvince → branch_group)
// ---------------------------------------------------------------------------------------------

export type BranchGroupValues = {
  companyId: string;
  name: string;
  phone: string;
  address: string;
  email: string;
  groupType: "" | BranchGroupType;
  taxNumber: string;
  taxOffice: string;
  active: boolean;
};

export type BranchGroupField = keyof BranchGroupValues;

export function emptyBranchGroup(companyId: string | undefined): BranchGroupValues {
  return {
    companyId: companyId ?? "",
    name: "",
    phone: "",
    address: "",
    email: "",
    groupType: "",
    taxNumber: "",
    taxOffice: "",
    active: true,
  };
}

export function branchGroupValues(group: BranchGroup): BranchGroupValues {
  return {
    companyId: group.companyId,
    name: group.name,
    phone: group.phone ?? "",
    address: group.address ?? "",
    email: group.email ?? "",
    groupType: group.groupType ?? "",
    taxNumber: group.taxNumber ?? "",
    taxOffice: group.taxOffice ?? "",
    active: group.active,
  };
}

const optionalEmail = (message: string) =>
  z.string().refine((v) => v.trim() === "" || z.email().safeParse(v.trim()).success, message);

export function validateBranchGroup(
  values: BranchGroupValues,
  multiCompany: boolean,
): FormErrors<BranchGroupField> {
  const schema = z.object({
    companyId: multiCompany ? z.string().min(1, REQUIRED) : z.string(),
    name: required(50),
    email: optionalEmail("branchGroups.emailInvalid"),
  });
  return errorsOf<BranchGroupField>(schema.safeParse(values));
}

/**
 * PUT'ta `companyId` alan gizli olsa da mevcut değerle gönderilir (§5.1). Eklemede tek görünen şirket
 * varsayılan değilse (`implicitCompanyId`, LIMITED kullanıcı) o şirket gönderilir; aksi hâlde null.
 */
export function branchGroupBody(
  values: BranchGroupValues,
  options: { multiCompany: boolean; existing?: BranchGroup; implicitCompanyId?: string },
): SaveBranchGroupBody {
  const companyId = options.existing
    ? values.companyId || options.existing.companyId
    : options.multiCompany
      ? values.companyId || null
      : (options.implicitCompanyId ?? null);
  return {
    companyId,
    name: values.name.trim(),
    groupType: values.groupType || null,
    phone: blankToNull(values.phone),
    email: blankToNull(values.email),
    address: blankToNull(values.address),
    managerName: options.existing?.managerName ?? null,
    taxNumber: blankToNull(values.taxNumber),
    taxOffice: blankToNull(values.taxOffice),
    active: values.active,
  };
}

// ---------------------------------------------------------------------------------------------
// Şirket
// ---------------------------------------------------------------------------------------------

export type CompanyValues = {
  code: string;
  title: string;
  shortName: string;
  taxIdType: TaxIdType;
  taxNumber: string;
  taxOffice: string;
  mersisNo: string;
  tradeRegistryNo: string;
  sgkWorkplaceNo: string;
  address: string;
  city: string;
  district: string;
  postalCode: string;
  phone: string;
  email: string;
  kepAddress: string;
  website: string;
  defaultFundAccountId: string;
  defaultCompany: boolean;
  active: boolean;
};

export type CompanyField = keyof CompanyValues;

export const EMPTY_COMPANY: CompanyValues = {
  code: "",
  title: "",
  shortName: "",
  taxIdType: "VKN",
  taxNumber: "",
  taxOffice: "",
  mersisNo: "",
  tradeRegistryNo: "",
  sgkWorkplaceNo: "",
  address: "",
  city: "",
  district: "",
  postalCode: "",
  phone: "",
  email: "",
  kepAddress: "",
  website: "",
  defaultFundAccountId: "",
  defaultCompany: false,
  active: true,
};

export function companyValues(company: Company): CompanyValues {
  return {
    code: company.code,
    title: company.title,
    shortName: company.shortName,
    taxIdType: company.taxIdType,
    taxNumber: company.taxNumber ?? "",
    taxOffice: company.taxOffice ?? "",
    mersisNo: company.mersisNo ?? "",
    tradeRegistryNo: company.tradeRegistryNo ?? "",
    sgkWorkplaceNo: company.sgkWorkplaceNo ?? "",
    address: company.address ?? "",
    city: company.city ?? "",
    district: company.district ?? "",
    postalCode: company.postalCode ?? "",
    phone: company.phone ?? "",
    email: company.email ?? "",
    kepAddress: company.kepAddress ?? "",
    website: company.website ?? "",
    defaultFundAccountId: company.defaultFundAccountId ?? "",
    defaultCompany: company.defaultCompany,
    active: company.active,
  };
}

export function validateCompany(values: CompanyValues): FormErrors<CompanyField> {
  const schema = z.object({
    code: z
      .string()
      .min(1, REQUIRED)
      .regex(/^[A-Z0-9_-]{1,20}$/, "companies.codeInvalid"),
    title: required(300),
    shortName: required(100),
    taxNumber: z
      .string()
      .refine((v) => isValidTaxNumber(values.taxIdType, v), "companies.taxInvalid"),
    mersisNo: z.string().refine((v) => v === "" || /^\d{16}$/.test(v), "companies.mersisInvalid"),
    email: optionalEmail("companies.emailInvalid"),
    kepAddress: optionalEmail("companies.emailInvalid"),
  });
  return errorsOf<CompanyField>(schema.safeParse(values));
}

/** POST gövdesinde `defaultFundAccountId` yok (create'te kabul edilmez, §4.2 (5)). */
export function companyBody(values: CompanyValues, editing: boolean): SaveCompanyBody {
  const body: SaveCompanyBody = {
    code: values.code.trim(),
    title: values.title.trim(),
    shortName: values.shortName.trim(),
    taxIdType: values.taxIdType,
    taxNumber: blankToNull(values.taxNumber),
    taxOffice: blankToNull(values.taxOffice),
    mersisNo: blankToNull(values.mersisNo),
    tradeRegistryNo: blankToNull(values.tradeRegistryNo),
    sgkWorkplaceNo: blankToNull(values.sgkWorkplaceNo),
    address: blankToNull(values.address),
    city: blankToNull(values.city),
    district: blankToNull(values.district),
    postalCode: blankToNull(values.postalCode),
    phone: blankToNull(values.phone),
    email: blankToNull(values.email),
    kepAddress: blankToNull(values.kepAddress),
    website: blankToNull(values.website),
    defaultCompany: values.defaultCompany,
    active: values.active,
  };
  return editing
    ? { ...body, defaultFundAccountId: blankToNull(values.defaultFundAccountId) }
    : body;
}

// ---------------------------------------------------------------------------------------------
// e-Belge ayarı (Uyumsoft/Settings.cshtml)
// ---------------------------------------------------------------------------------------------

export type EDocumentValues = {
  enabled: boolean;
  despatchEnabled: boolean;
  inboxEnabled: boolean;
  serviceUrl: string;
  username: string;
  password: string;
  defaultProfile: EDocumentProfile;
  invoiceSeries: string;
  despatchSeries: string;
  testMode: boolean;
};

export function eDocumentValues(settings: CompanyEDocumentSettings): EDocumentValues {
  return {
    enabled: settings.enabled,
    despatchEnabled: settings.despatchEnabled,
    inboxEnabled: settings.inboxEnabled,
    serviceUrl: settings.serviceUrl ?? "",
    username: settings.username ?? "",
    password: "",
    defaultProfile: settings.defaultProfile,
    invoiceSeries: settings.invoiceSeries ?? "",
    despatchSeries: settings.despatchSeries ?? "",
    testMode: settings.testMode,
  };
}

/** Servis adresi boş ya da http(s)://… olmalı; değilse hata anahtarı. */
export function validateEDocument(values: EDocumentValues): string | null {
  const url = values.serviceUrl.trim();
  return url === "" || /^https?:\/\/.+/.test(url) ? null : "companies.uyUrlInvalid";
}

/** Şifre boşsa null gönderilir: sunucu kayıtlı şifreyi değiştirmez (ZTO UyumsoftController:166-176). */
export function eDocumentBody(values: EDocumentValues): SaveCompanyEDocumentSettingsBody {
  return {
    enabled: values.enabled,
    testMode: values.testMode,
    serviceUrl: blankToNull(values.serviceUrl),
    username: blankToNull(values.username),
    password: values.password === "" ? null : values.password,
    defaultProfile: values.defaultProfile,
    invoiceSeries: blankToNull(values.invoiceSeries),
    despatchSeries: blankToNull(values.despatchSeries),
    despatchEnabled: values.despatchEnabled,
    inboxEnabled: values.inboxEnabled,
  };
}

// ---------------------------------------------------------------------------------------------
// Belge serisi
// ---------------------------------------------------------------------------------------------

/** "Önek *" deseni ve sıradaki numaranın geri alınamaması (§4.6 DOCUMENT_SERIES_BACKWARDS). */
export function validateSeries(
  prefix: string,
  nextValue: string,
  current: number,
): { prefix?: string; nextValue?: string } {
  const errors: { prefix?: string; nextValue?: string } = {};
  if (prefix === "") errors.prefix = REQUIRED;
  else if (!/^[A-Z0-9-]{1,10}$/.test(prefix)) errors.prefix = "companies.seriesPrefixInvalid";
  if (nextValue === "") errors.nextValue = REQUIRED;
  else if (!/^\d+$/.test(nextValue) || Number(nextValue) < Math.max(1, current)) {
    errors.nextValue = "companies.seriesForwardOnly";
  }
  return errors;
}
