import type {
  DailyFundBalance,
  DailyInstrumentMovement,
  DailyReport,
  SettlementDetail,
  SettlementListItem,
} from "../../../../pages/finance/types";
import { fakeApi } from "../definitions/definitionTestUtils";
import { FUND_TREE } from "../funds/fundsTestUtils";

/** 12.2a Ödemeler / Tahsilatlar / Günlük rapor testlerinin sahte verisi (yalnız testler içe aktarır). */

export const SETTLEMENT_MANAGER = ["FINANCE_VIEW", "FINANCE_PAYMENT_CREATE"];
export const SETTLEMENT_VIEWER = ["FINANCE_VIEW"];

export function makeItem(overrides: Partial<SettlementListItem> = {}): SettlementListItem {
  return {
    id: "s1",
    type: "PAYMENT",
    method: "CASH",
    channel: null,
    displayMethod: "CASH",
    accountId: "a1",
    accountCode: "120.01",
    accountName: "Kuzey Lojistik",
    accountType: "SUPPLIER",
    accountSubGroup: "TED",
    accountGroupName: "Tedarikçiler",
    employeeMasked: false,
    branchId: "b1",
    branchName: "Merkez",
    branchGroupName: "İzmir",
    companyId: "c1",
    fundAccountId: "k1",
    fundName: "Merkez Kasa",
    fundKind: "CASH",
    fundBankName: null,
    fundBankBranchName: null,
    instrumentId: null,
    instrumentKind: null,
    instrumentNumber: null,
    instrumentStatus: null,
    expenseItemId: null,
    expenseItemName: null,
    planId: null,
    money: { amount: "1500.00", currency: "TRY" },
    exchangeRate: null,
    tlAmount: 1500,
    settlementDate: "2026-11-14",
    documentNo: "FT-1",
    description: "Kasım ödemesi",
    status: "POSTED",
    counterpartyBankAccountId: null,
    counterpartyIbanMasked: null,
    counterpartyBankName: null,
    correctsSettlementId: null,
    correctedById: null,
    reverseReason: null,
    reversedOn: null,
    createdAt: "2026-11-14T08:05:09Z",
    createdBy: "ayse@acme.com",
    intercompany: false,
    credit: false,
    transferred: false,
    fxUsed: "0",
    fxRemaining: "0",
    lockReason: null,
    reversible: true,
    correctable: true,
    ...overrides,
  };
}

/** Banka satırı (Ziraat, Konak şubesi). */
export function bankItem(overrides: Partial<SettlementListItem> = {}): SettlementListItem {
  return makeItem({
    method: "BANK",
    channel: "TRANSFER",
    displayMethod: "BANK",
    fundAccountId: "f1",
    fundName: "Ziraat Vadesiz",
    fundKind: "BANK",
    fundBankName: "Ziraat",
    fundBankBranchName: "Konak",
    ...overrides,
  });
}

export function makeDetail(overrides: Partial<SettlementDetail> = {}): SettlementDetail {
  return {
    item: makeItem(),
    lines: [],
    instrument: null,
    plan: null,
    allocations: [],
    fundIbanMasked: null,
    bankStatementMatched: false,
    ...overrides,
  };
}

export function makeBalance(overrides: Partial<DailyFundBalance> = {}): DailyFundBalance {
  return {
    fundAccountId: "f1",
    name: "Ziraat Vadesiz",
    kind: "BANK",
    currency: "TRY",
    branchId: "b1",
    branchName: "Merkez",
    bankName: "Ziraat",
    bankBranchName: "Konak",
    balanceAtDate: "1000.00",
    balanceNow: "1250.50",
    ...overrides,
  };
}

export function makeMovement(
  overrides: Partial<DailyInstrumentMovement> = {},
): DailyInstrumentMovement {
  return {
    branchId: "b1",
    branchName: "Merkez",
    fundAccountId: "f1",
    fundName: "Ziraat Vadesiz",
    fundKind: "BANK",
    currency: "TRY",
    count: 2,
    total: "300.00",
    ...overrides,
  };
}

export function makeReport(overrides: Partial<DailyReport> = {}): DailyReport {
  return {
    type: "PAYMENT",
    date: "2026-11-14",
    rows: [],
    totals: [],
    fundBalances: [],
    instrumentFundMovements: [],
    ...overrides,
  };
}

/** Kabuk ve ortak seçicilerin istekleri (şube ağacı, para birimleri, kenar çubuğu plan sayıları). */
export function settlementCommonApi() {
  fakeApi.on("GET", /^\/organization\/branch-tree\?/, FUND_TREE);
  fakeApi.on("GET", "/finance/currencies", [
    { code: "TRY", name: "Türk Lirası" },
    { code: "USD", name: "Amerikan Doları" },
  ]);
  fakeApi.on("GET", /^\/finance\/payment-plans\?/, {
    content: [],
    page: 0,
    size: 1,
    totalElements: 0,
    totalPages: 0,
  });
}
