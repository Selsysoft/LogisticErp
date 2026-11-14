import type {
  Account,
  AccountBankAccount,
  AccountGroup,
  AccountPlanSummary,
  Balance,
} from "../../../../pages/finance/types";
import type { BranchTree } from "../../../../pages/organization/types";
import { fakeApi, page } from "../definitions/definitionTestUtils";

/** Cari ekranı testlerinin sahte verisi (yalnız testler içe aktarır). */

export const GROUPS: AccountGroup[] = [
  ["MUSTERI", "CUSTOMER", "Müşteri", 10, true],
  ["GENEL", "SUPPLIER", "Tedarikçi", 30, true],
  ["YEDEK_PARCA_SERVIS", "SUPPLIER", "Yedek Parça / Servis Tedarikçisi", 40, true],
  ["TASERON_NAKLIYECI", "CARRIER", "Nakliye Firması", 80, true],
  ["SURUCU", "EMPLOYEE", "Personel (Sürücü)", 100, true],
  ["ADAY", "LEAD", "Aday Müşteri", 130, false],
].map(([code, accountType, name, sortOrder, selectable]) => ({
  code: code as string,
  accountType: accountType as AccountGroup["accountType"],
  name: name as string,
  reportType: null,
  codePrefix: (code as string).slice(0, 3),
  sortOrder: sortOrder as number,
  typeDefault: false,
  selectable: selectable as boolean,
  active: true,
}));

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

export function planSummary(overrides: Partial<AccountPlanSummary> = {}): AccountPlanSummary {
  return {
    nextDueDate: null,
    overdueCount: 0,
    dueTodayCount: 0,
    draftCount: 0,
    pendingCount: 0,
    approvedCount: 0,
    planned: [],
    ...overrides,
  };
}

export function balance(overrides: Partial<Balance> = {}): Balance {
  return {
    currency: "TRY",
    debit: 0,
    credit: 0,
    balance: 0,
    tlBalance: 0,
    companyId: "c1",
    branchId: "b1",
    debt: 0,
    payment: 0,
    receivable: 0,
    collection: 0,
    ...overrides,
  };
}

export function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "a1",
    code: "TED-000001",
    name: "Ankara Lastik",
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
    creditLimit: 0,
    riskLimit: 0,
    companyLimits: null,
    taxOffice: null,
    companyType: null,
    phone: "02320000000",
    email: null,
    website: null,
    contactName: null,
    contactTitle: null,
    contactMobile: null,
    address: null,
    city: null,
    district: null,
    country: "Türkiye",
    postalCode: null,
    paymentTerms: null,
    notes: null,
    planSummary: planSummary(),
    createdBy: "ayse@acme.com",
    createdAt: "2026-03-04T08:05:00",
    updatedBy: "ayse@acme.com",
    updatedAt: "2026-03-04T08:05:00",
    updateCount: 0,
    ...overrides,
  };
}

export function makeBank(overrides: Partial<AccountBankAccount> = {}): AccountBankAccount {
  return {
    id: "bk1",
    accountId: "a1",
    accountCode: "TED-000001",
    accountName: "Ankara Lastik",
    accountType: "SUPPLIER",
    bankName: "Ziraat Bankası",
    branchName: "Merkez",
    accountNumber: null,
    accountNumberMasked: "****7890",
    iban: null,
    ibanMasked: "TR33 **** 1326",
    holderName: "Ankara Lastik",
    currency: "TRY",
    accountKind: "DEMAND",
    category: "SUB",
    openedOn: "2026-01-02",
    lastTransactionOn: null,
    description: "Ana hesap",
    active: true,
    createdBy: "ayse@acme.com",
    createdAt: "2026-03-04T08:05:00",
    updatedBy: "ayse@acme.com",
    updatedAt: "2026-03-04T08:05:00",
    updateCount: 0,
    ...overrides,
  };
}

/** Ortak sahte uçlar: gruplar, şube ağacı, para birimleri. */
export function mockCommon() {
  fakeApi.on("GET", "/finance/account-groups", GROUPS);
  fakeApi.on("GET", /^\/organization\/branch-tree\?/, TREE);
  fakeApi.on("GET", "/finance/currencies", [
    { code: "TRY", name: "Türk Lirası" },
    { code: "USD", name: "Amerikan Doları" },
  ]);
  fakeApi.on("GET", /^\/finance\/accounts\/[^/?]+\/history\?/, page([]));
}

export const MANAGER = ["FINANCE_VIEW", "FINANCE_MANAGE", "FINANCE_PAYMENT_CREATE"];
