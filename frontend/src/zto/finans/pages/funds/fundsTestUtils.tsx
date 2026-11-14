import type {
  Fund,
  FundDetail,
  FundSummaryRow,
  FundTransactionPage,
  FundTransactionRow,
} from "../../../../pages/finance/types";
import type { BranchTree } from "../../../../pages/organization/types";
import { fakeApi } from "../definitions/definitionTestUtils";

/** 12.2 banka/kasa ekranı testlerinin sahte verisi (yalnız testler içe aktarır). */

export const MANAGER = ["FINANCE_VIEW", "FINANCE_MANAGE", "FINANCE_PAYMENT_CREATE"];

export const FUND_TREE: BranchTree = [
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
          { id: "b1", code: "IY-1", name: "Merkez", active: true },
          { id: "b2", code: "IY-2", name: "Depo", active: true },
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
        branches: [{ id: "b3", code: "IY-3", name: "Çankaya", active: true }],
      },
    ],
  },
];

export function makeFund(overrides: Partial<Fund> = {}): Fund {
  return {
    id: "f1",
    code: "ZRT-1",
    name: "Ziraat Vadesiz",
    kind: "BANK",
    currency: "TRY",
    branchId: "b1",
    companyId: "c1",
    bankName: "T.C. Ziraat Bankası A.Ş.",
    iban: "TR330006100519786457841326",
    allowNegative: false,
    balance: 1500,
    accountType: "DEMAND",
    accountNo: "****1234",
    bankBranchName: "Konak",
    description: null,
    active: true,
    currentBalance: 1500,
    futureCount: 0,
    futureNet: 0,
    openingBalance: 1000,
    openingDate: "2026-01-01",
    transactionCount: 4,
    ...overrides,
  };
}

export function makeDetail(overrides: Partial<FundDetail> = {}): FundDetail {
  return {
    ...makeFund(),
    accountNo: "12345678",
    createdBy: "ayse@acme.com",
    createdAt: "2026-01-01T09:00:00Z",
    updatedBy: "ayse@acme.com",
    updatedAt: "2026-02-01T09:00:00Z",
    updateCount: 2,
    lastTransactionDate: "2026-11-10",
    ...overrides,
  };
}

export function makeRow(overrides: Partial<FundTransactionRow> = {}): FundTransactionRow {
  return {
    id: "t1",
    fundAccountId: "f1",
    fundCode: "ZRT-1",
    fundName: "Ziraat Vadesiz",
    bankName: "T.C. Ziraat Bankası A.Ş.",
    kind: "BANK",
    accountType: "DEMAND",
    companyId: "c1",
    branchId: "b1",
    currency: "TRY",
    transactionDate: "2026-11-10",
    direction: "OUT",
    amount: 250,
    exchangeRate: 1,
    tlAmount: 250,
    runningBalance: 1250,
    description: "Lastik ödemesi",
    sourceType: "SETTLEMENT",
    sourceId: "s1",
    accountingType: "ACCOUNT_PAYMENT",
    transferCode: null,
    category: null,
    accountId: "a1",
    accountCode: "320.01",
    accountName: "Ankara Lastik",
    reversal: false,
    reversed: false,
    createdBy: "ayse@acme.com",
    createdAt: "2026-11-10T08:00:00Z",
    ...overrides,
  };
}

export function txPage(
  rows: FundTransactionRow[],
  summary: FundTransactionPage["summary"] = null,
): FundTransactionPage {
  return { content: rows, page: 0, size: 50, totalElements: rows.length, totalPages: 1, summary };
}

export function summaryRow(overrides: Partial<FundSummaryRow> = {}): FundSummaryRow {
  return {
    companyId: "c1",
    kind: "BANK",
    accountType: "DEMAND",
    currency: "TRY",
    count: 1,
    inactiveCount: 0,
    currentBalance: 1500,
    balance: 1500,
    futureNet: 0,
    openingTotal: 1000,
    ...overrides,
  };
}

/** Ortak uçlar: ağaç, para birimleri, plan sayıları, sparkline. */
export function mockFundCommon() {
  fakeApi.on("GET", /^\/organization\/branch-tree\?/, FUND_TREE);
  fakeApi.on("GET", "/finance/currencies", [
    { code: "TRY", name: "Türk Lirası" },
    { code: "USD", name: "Amerikan Doları" },
  ]);
  fakeApi.on("GET", /^\/finance\/payment-plans\?status=PENDING/, {
    content: [],
    page: 0,
    size: 1,
    totalElements: 3,
    totalPages: 3,
  });
  fakeApi.on("GET", /^\/finance\/payment-plans\?status=(DRAFT|APPROVED|REJECTED|PAID)/, {
    content: [],
    page: 0,
    size: 1,
    totalElements: 0,
    totalPages: 0,
  });
  fakeApi.on("GET", /^\/finance\/funds\/sparklines\?/, (call: { path: string }) =>
    [...call.path.matchAll(/ids=([^&]+)/g)].map((m) => ({
      fundId: decodeURIComponent(m[1]),
      points: [100, -50, 20],
    })),
  );
}
