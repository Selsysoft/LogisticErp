import type { CheckBook, CheckLeaf, InstrumentListItem } from "../../../../pages/finance/types";

/** FE-2 testleri (Senetler, Koçanlar, Düzenle, Belgeler) için örnek kayıtlar. */
export const POSTER = ["FINANCE_VIEW", "FINANCE_PAYMENT_CREATE"];
export const MANAGER = ["FINANCE_VIEW", "FINANCE_PAYMENT_CREATE", "FINANCE_MANAGE"];
export const VIEWER = ["FINANCE_VIEW"];

export function makeInstrument(overrides: Partial<InstrumentListItem> = {}): InstrumentListItem {
  return {
    id: "n1",
    kind: "NOTE",
    direction: "RECEIVED",
    number: "SEN-001",
    bankName: null,
    bankBranch: null,
    issueDate: "2026-11-01",
    dueDate: "2026-12-31",
    money: { amount: "1500.00", currency: "TRY" },
    status: "PORTFOLIO",
    accountId: "a1",
    accountCode: "120.01",
    accountName: "Kuzey Lojistik",
    accountType: "CUSTOMER",
    employeeMasked: false,
    endorsedAccountId: null,
    endorsedAccountName: null,
    drawerName: null,
    branchId: "b1",
    branchName: "Merkez",
    companyId: "co1",
    companyName: "Acme",
    fundAccountId: null,
    fundName: null,
    fundKind: null,
    fundBankName: null,
    custodyFundId: null,
    custodyFundName: null,
    checkLeafId: null,
    checkBookId: null,
    checkBookSerial: null,
    leafNo: null,
    description: null,
    noteType: "BOND",
    collateral: false,
    settledDate: null,
    originSettlementId: "s1",
    originSettlementStatus: "POSTED",
    movementCount: 1,
    lastMovementDate: "2026-11-01",
    allowedTransitions: [],
    ...overrides,
  };
}

export function makeLeaf(overrides: Partial<CheckLeaf> = {}): CheckLeaf {
  return {
    id: "l1",
    checkBookId: "cb1",
    checkBookSerial: "ZB-001",
    leafNo: 1,
    number: "0001234",
    micrCode: null,
    status: "UNUSED",
    usedDate: null,
    voidReason: null,
    fundAccountId: "f1",
    fundName: "Ziraat TL",
    fundBankName: "Ziraat",
    fundBankBranchName: "Kadıköy",
    fundIban: "TR000000000000000000000001",
    branchId: "b1",
    branchName: "Merkez",
    companyId: "co1",
    instrumentId: null,
    instrumentStatus: null,
    ...overrides,
  };
}

export function makeBook(overrides: Partial<CheckBook> = {}): CheckBook {
  return {
    id: "cb1",
    companyId: "co1",
    branchId: "b1",
    branchName: "Merkez",
    fundAccountId: "f1",
    fundName: "Ziraat TL",
    fundBankName: "Ziraat",
    serialNo: "ZB-001",
    bankCode: null,
    branchCode: null,
    startNumber: "0001234",
    endNumber: "0001243",
    leafCount: 10,
    unusedCount: 7,
    usedCount: 2,
    voidCount: 1,
    createdAt: "2026-11-01T10:00:00",
    ...overrides,
  };
}

export const pageOf = <T>(content: T[]) => ({
  content,
  page: 0,
  size: 500,
  totalElements: content.length,
  totalPages: 1,
});
