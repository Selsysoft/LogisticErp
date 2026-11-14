import type { Fund, TransferListRow } from "../../../../pages/finance/types";
import type { BranchTree } from "../../../../pages/organization/types";

/** Transfer Merkezi testlerinin ortak verileri (yalnız testler içe aktarır). */

export function makeFund(overrides: Partial<Fund> = {}): Fund {
  return {
    id: "f1",
    code: "B001",
    name: "Ziraat Vadesiz",
    kind: "BANK",
    currency: "TRY",
    branchId: "b1",
    companyId: "c1",
    bankName: "Ziraat",
    iban: null,
    allowNegative: false,
    balance: 1000,
    accountType: "DEMAND",
    accountNo: null,
    bankBranchName: null,
    description: null,
    active: true,
    currentBalance: 1000,
    futureCount: 0,
    futureNet: 0,
    openingBalance: 0,
    openingDate: null,
    transactionCount: 0,
    ...overrides,
  };
}

/** İki şirket: c1 (Merkez b1, Şube b2) ve c2 (Beta İY b3). */
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
        branches: [
          { id: "b1", code: "M", name: "Merkez", active: true },
          { id: "b2", code: "S", name: "Şube", active: true },
        ],
      },
    ],
  },
  {
    companyId: "c2",
    companyName: "Beta",
    companyActive: true,
    groups: [
      {
        groupId: "g2",
        groupName: "Ankara",
        groupActive: true,
        branches: [
          { id: "b3", code: "B", name: "Beta İY", active: true },
          { id: "b4", code: "P", name: "Pasif İY", active: false },
        ],
      },
    ],
  },
];

/** Bankalar ve kasalar: b1'de Ziraat TRY (f1), Ziraat USD (f2), Garanti TRY (f3), kasa TRY (k1); b2'de
 *  Ziraat TRY (f4); b3 (Beta) Garanti TRY (f5), kasa TRY (k2). */
export const FUNDS: Fund[] = [
  makeFund(),
  makeFund({ id: "f2", code: "B002", name: "Ziraat USD", currency: "USD", balance: 500 }),
  makeFund({ id: "f3", code: "B003", name: "Garanti", bankName: "Garanti" }),
  makeFund({ id: "k1", code: "K001", name: "Merkez Kasa", kind: "CASH", bankName: null }),
  makeFund({ id: "f4", code: "B004", name: "Ziraat Şube", branchId: "b2" }),
  makeFund({
    id: "f5",
    code: "B005",
    name: "Beta Garanti",
    bankName: "Garanti",
    branchId: "b3",
    companyId: "c2",
  }),
  makeFund({
    id: "k2",
    code: "K002",
    name: "Beta Kasa",
    kind: "CASH",
    bankName: null,
    branchId: "b3",
    companyId: "c2",
  }),
];

export function makeRow(overrides: Partial<TransferListRow> = {}): TransferListRow {
  return {
    recordType: "FUND_TRANSFER",
    id: "t1",
    code: "VRM-000001",
    transferType: "VIREMENT",
    reasonType: null,
    transferDate: "2026-11-10",
    companyId: "c1",
    toCompanyId: null,
    fromFundId: "f1",
    fromFundCode: "B001",
    fromFundName: "Ziraat Vadesiz",
    fromKind: "BANK",
    fromBranchId: "b1",
    toFundId: "f3",
    toFundCode: "B003",
    toFundName: "Garanti",
    toKind: "BANK",
    toBranchId: "b1",
    sourceMoney: { amount: "100.00", currency: "TRY" },
    targetMoney: { amount: "100.00", currency: "TRY" },
    rate: null,
    rateOperation: null,
    costTotalTl: 0,
    costFundNames: null,
    collection: null,
    description: null,
    status: "POSTED",
    documentNo: null,
    ...overrides,
  };
}
