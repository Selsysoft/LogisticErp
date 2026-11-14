import type {
  Account,
  AccountDocumentType,
  AccountTransactionRow,
  TransferableTransaction,
} from "../../../../pages/finance/types";
import type { BranchTree } from "../../../../pages/organization/types";
import { fakeApi, page } from "../definitions/definitionTestUtils";

/** Cari Hareketler testlerinin ortak verileri (yalnız testler içe aktarır). */

export function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "a1",
    code: "TED-001",
    name: "Demir Tedarik",
    type: "SUPPLIER",
    taxNumber: "1234567890",
    taxNumberMasked: false,
    branchId: "b1",
    companyId: null,
    representsCompanyId: null,
    balances: [],
    subGroup: "GENEL",
    subGroupName: "Tedarikçi",
    active: true,
    defaultCurrency: "TRY",
    creditLimit: 1000,
    riskLimit: 500,
    companyLimits: [],
    taxOffice: "Konak",
    companyType: "CORPORATE",
    phone: "02321112233",
    email: null,
    website: null,
    contactName: null,
    contactTitle: null,
    contactMobile: null,
    address: null,
    city: "İzmir",
    district: null,
    country: "Türkiye",
    postalCode: null,
    paymentTerms: null,
    notes: null,
    planSummary: null,
    createdBy: "ayse@acme.com",
    createdAt: "2026-01-02T08:00:00",
    updatedBy: "ayse@acme.com",
    updatedAt: "2026-01-02T08:00:00",
    updateCount: 0,
    ...overrides,
  };
}

export function docType(
  side: "RECEIVABLE" | "PAYABLE",
  code: string,
  name: string,
  extra: Partial<AccountDocumentType> = {},
): AccountDocumentType {
  return {
    side,
    code,
    name,
    audience: "ALL",
    invoiceSection: false,
    penalty: false,
    isDefault: false,
    selectable: true,
    sortOrder: 100,
    ...extra,
  };
}

export const DOC_TYPES: AccountDocumentType[] = [
  docType("PAYABLE", "ALIS_FATURASI", "Alış Faturası", {
    audience: "OTHER",
    invoiceSection: true,
    isDefault: true,
    sortOrder: 110,
  }),
  docType("PAYABLE", "KASA_FISI", "Kasa Fişi", { audience: "OTHER", sortOrder: 120 }),
  docType("PAYABLE", "CEZA_FATURASI", "Ceza Faturası", {
    audience: "CUSTOMER",
    penalty: true,
    sortOrder: 10,
  }),
  docType("PAYABLE", "CEZA_BIZE", "Ceza (bize kesilen)", { penalty: true, sortOrder: 195 }),
  docType("PAYABLE", "KUR_FARKI", "Kur Farkı", { selectable: false, sortOrder: 900 }),
  docType("RECEIVABLE", "SATIS_FATURASI", "Satış Faturası", {
    invoiceSection: true,
    isDefault: true,
    sortOrder: 10,
  }),
  docType("RECEIVABLE", "CEZA_KARSI_TARAF", "Ceza / Kesinti (karşı tarafa kesilen)", {
    penalty: true,
    sortOrder: 95,
  }),
];

export const TREE: BranchTree = [
  {
    companyId: "c1",
    companyName: "Acme",
    companyActive: true,
    groups: [
      {
        groupId: "g1",
        groupName: "İzmir",
        groupActive: true,
        branches: [{ id: "b1", code: "IY-1", name: "Merkez", active: true }],
      },
    ],
  },
];

export function makeRow(
  id: string,
  overrides: Partial<AccountTransactionRow> = {},
): AccountTransactionRow {
  return {
    id,
    transactionDate: "2026-03-01",
    createdAt: "2026-03-01T10:00:00",
    createdBy: "ayse@acme.com",
    accountId: "a1",
    accountCode: "TED-001",
    accountName: "Demir Tedarik",
    accountType: "SUPPLIER",
    subGroup: "GENEL",
    subGroupName: "Tedarikçi",
    branchId: "b1",
    branchName: "Merkez",
    companyId: "c1",
    kind: "DEBT",
    sign: 1,
    direction: "CREDIT",
    amount: 1200,
    currency: "TRY",
    exchangeRate: 1,
    tlAmount: 1200,
    description: "Alış",
    sourceType: "ACCOUNT_DOCUMENT",
    sourceId: `d-${id}`,
    documentNo: "FTR-1",
    documentType: "ALIS_FATURASI",
    documentDate: "2026-03-01",
    dueDate: null,
    paymentMethod: "BANK",
    reversal: false,
    reversed: false,
    transferRole: null,
    transferredOut: false,
    ...overrides,
  };
}

export function transferable(
  id: string,
  overrides: Partial<TransferableTransaction> = {},
): TransferableTransaction {
  return {
    transactionId: id,
    transactionDate: "2026-03-01",
    kind: "DEBT",
    sign: 1,
    documentNo: `B-${id}`,
    documentType: "ALIS_FATURASI",
    branchId: "b1",
    branchName: "Merkez",
    companyId: "c1",
    direction: "CREDIT",
    amount: 100,
    currency: "TRY",
    description: null,
    instruments: [],
    instrumentGroup: null,
    blockedReason: null,
    ...overrides,
  };
}

/** Ortak sahte yanıtlar: belge türleri, para birimleri, şube ağacı. */
export function commonApi() {
  fakeApi.on("GET", "/finance/account-document-types", DOC_TYPES);
  fakeApi.on("GET", "/finance/currencies", [
    { code: "TRY", name: "Türk Lirası" },
    { code: "USD", name: "ABD Doları" },
  ]);
  fakeApi.on("GET", /^\/organization\/branch-tree/, TREE);
  fakeApi.on("GET", /^\/organization\/branches/, page([]));
}
