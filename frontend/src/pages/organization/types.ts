/**
 * Organization modülü API tipleri (12.1a tasarımı §5.1, §5.3, §6.2). Her dışa aktarılan interface
 * sözleşme testinde (api/contract.test.ts) `${ad}` ya da `${ad}Response` şemasıyla karşılaştırılır;
 * istek gövdeleri bu yüzden type alias'tır.
 */

export type TaxIdType = "VKN" | "TCKN";
export type BranchGroupType = "MAIN" | "SUB";
export type DocumentType =
  | "FREIGHT_INVOICE"
  | "WAREHOUSE_INVOICE"
  /** 12.2: transfer merkezi (VRM) ve şirketler arası virman (SVR) serileri. */
  | "FUND_TRANSFER"
  | "INTERCOMPANY_TRANSFER";
export type EDocumentProfile = "TICARIFATURA" | "TEMELFATURA" | "EARSIVFATURA";

/** Şema `CompanyResponse`. */
export interface Company {
  id: string;
  code: string;
  title: string;
  shortName: string;
  taxIdType: TaxIdType;
  taxNumber: string | null;
  taxOffice: string | null;
  mersisNo: string | null;
  tradeRegistryNo: string | null;
  sgkWorkplaceNo: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  postalCode: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  kepAddress: string | null;
  website: string | null;
  logoFileId: string | null;
  defaultFundAccountId: string | null;
  defaultCompany: boolean;
  active: boolean;
  edocumentEnabled: boolean;
  edocumentTestMode: boolean;
  branchCount: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  updateCount: number;
}

/** Şema `CompanyEDocumentSettingsResponse`; şifre hiçbir zaman dönmez (`passwordSet`). */
export interface CompanyEDocumentSettings {
  companyId: string;
  provider: string;
  enabled: boolean;
  testMode: boolean;
  serviceUrl: string | null;
  username: string | null;
  passwordSet: boolean;
  defaultProfile: EDocumentProfile;
  invoiceSeries: string | null;
  despatchSeries: string | null;
  despatchEnabled: boolean;
  inboxEnabled: boolean;
  inboxLastSync: string | null;
  senderTaxNumber: string | null;
  senderTitle: string;
}

/** Şema `DocumentSeriesResponse`. */
export interface DocumentSeries {
  id: string;
  companyId: string;
  docType: DocumentType;
  year: number | null;
  prefix: string;
  nextValue: number;
  padding: number;
  sample: string;
}

/** Şema `BranchGroupResponse` (ZTO "Şube"). */
export interface BranchGroup {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  groupType: BranchGroupType | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  managerName: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  active: boolean;
  branchCount: number;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  updateCount: number;
}

/**
 * Şema `BranchResponse`: iş yeri (ZTO "İş Yeri", Blackrose "branch"), §5.1. ZTO tanım ekranları
 * (F1) bu tipi kullanır; MUI finans ekranları `pages/finance/types.ts` `Branch`'ı (F2) kullanır.
 */
export interface Branch {
  id: string;
  code: string;
  name: string;
  companyId: string;
  companyName: string;
  branchGroupId: string | null;
  branchGroupName: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  latitude: number | null;
  longitude: number | null;
  sgkWorkplaceNo: string | null;
  active: boolean;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  updateCount: number;
}

/** Sayfalı yanıt (`PageResponse`). */
export type PageResponse<T> = {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

/** Şema `BranchTreeBranchResponse`: iş yeri (Blackrose "branch"). */
export interface BranchTreeBranch {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

/** Şema `BranchTreeGroupResponse`; `groupId` null = grupsuz iş yerleri ("Diğer"). */
export interface BranchTreeGroup {
  groupId: string | null;
  groupName: string;
  groupActive: boolean;
  branches: BranchTreeBranch[];
}

/** Şema `BranchTreeCompanyResponse`; sunucuda `companyId` hep doludur. */
export interface BranchTreeCompany {
  companyId: string | null;
  companyName: string;
  companyActive: boolean;
  groups: BranchTreeGroup[];
}

export type BranchTree = BranchTreeCompany[];

/** /auth/me şirketleri (şema `MeCompanyResponse`). auth/authStore.ts `Me` bunu içe aktarır. */
export interface MeCompany {
  id: string;
  code: string;
  shortName: string;
  title: string;
  defaultCompany: boolean;
  active: boolean;
}

// İstek gövdeleri type alias (sözleşme testi yanıt şemasıyla karşılaştırmasın):

/** §5.1 `SaveCompanyRequest` (POST ve PUT). */
export type SaveCompanyBody = {
  code: string;
  title: string;
  shortName: string;
  taxIdType: TaxIdType;
  taxNumber: string | null;
  taxOffice: string | null;
  mersisNo: string | null;
  tradeRegistryNo: string | null;
  sgkWorkplaceNo: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  kepAddress: string | null;
  website: string | null;
  /** Yalnız PUT'ta anlamlı. */
  defaultFundAccountId?: string | null;
  /** true = varsayılan yap; null/false = değiştirme. */
  defaultCompany?: boolean | null;
  /** POST null → true; PUT null → değişmez. */
  active?: boolean | null;
};

/** §5.1 `SaveCompanyEDocumentSettingsRequest`; `password` null/"" = değişmez. */
export type SaveCompanyEDocumentSettingsBody = {
  enabled: boolean;
  testMode: boolean;
  serviceUrl: string | null;
  username: string | null;
  password: string | null;
  defaultProfile: EDocumentProfile;
  invoiceSeries: string | null;
  despatchSeries: string | null;
  despatchEnabled: boolean;
  inboxEnabled: boolean;
};

/** §5.1 `UpdateDocumentSeriesRequest`. */
export type UpdateDocumentSeriesBody = {
  prefix: string;
  nextValue: number;
};

/** §5.1 `SaveBranchGroupRequest`; PUT'ta `companyId` null = değişmez (formlar mevcut değeri gönderir). */
export type SaveBranchGroupBody = {
  companyId: string | null;
  name: string;
  groupType: BranchGroupType | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  managerName: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  active?: boolean | null;
};

/**
 * §5.1 `SaveBranchRequest` (POST ve PUT; `{code, name}` tek başına geçerli). Düzenleme formları
 * `companyId` ve `branchGroupId`'yi her zaman kaydın mevcut değeriyle gönderir (§5.1 ön yüz kuralı).
 */
export type SaveBranchBody = {
  /** POST null → IY-0001…; PUT null → değişmez. */
  code?: string | null;
  name: string;
  companyId?: string | null;
  branchGroupId?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  district?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  sgkWorkplaceNo?: string | null;
};
