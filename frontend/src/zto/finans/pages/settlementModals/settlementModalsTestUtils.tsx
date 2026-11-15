import type {
  AccountBalanceBreakdown,
  BalanceBreakdownRow,
  Fund,
  OpenInvoice,
  Settlement,
  SettlementDetail,
  SettlementListItem,
} from "../../../../pages/finance/types";
import type { BranchTree } from "../../../../pages/organization/types";
import { fakeApi, page, type ApiCall } from "../definitions/definitionTestUtils";
import { makeAccount } from "../transactions/transactionsTestUtils";

/** Ödeme/tahsilat modal testlerinin ortak verileri (yalnız testler içe aktarır). */

export const TREE_TWO: BranchTree = [
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
  {
    companyId: "c2",
    companyName: "Beta",
    companyActive: true,
    groups: [
      {
        groupId: "g2",
        groupName: "Ankara",
        groupActive: true,
        branches: [{ id: "b2", code: "IY-2", name: "Beta Depo", active: true }],
      },
    ],
  },
];

export function fund(id: string, patch: Partial<Fund> = {}): Fund {
  return {
    id,
    code: id.toUpperCase(),
    name: `Fon ${id}`,
    kind: "CASH",
    currency: "TRY",
    branchId: "b1",
    companyId: "c1",
    bankName: null,
    iban: null,
    allowNegative: false,
    balance: 0,
    accountType: "DEMAND",
    accountNo: null,
    bankBranchName: null,
    description: null,
    active: true,
    currentBalance: 0,
    futureCount: 0,
    futureNet: 0,
    openingBalance: 0,
    openingDate: null,
    transactionCount: 0,
    ...patch,
  } as Fund;
}

export const FUNDS: Fund[] = [
  fund("k1", { name: "Merkez Kasa" }),
  fund("bk1", { kind: "BANK", name: "Ziraat Ana", bankName: "Ziraat", bankBranchName: "Konak" }),
  fund("bk2", {
    kind: "BANK",
    name: "Beta Banka",
    bankName: "Garanti",
    branchId: "b2",
    companyId: "c2",
  }),
];

export function balanceRow(patch: Partial<BalanceBreakdownRow>): BalanceBreakdownRow {
  return {
    segment: "ALL",
    currency: "TRY",
    companyId: "c1",
    branchId: null,
    debit: 0,
    credit: 0,
    balance: 0,
    tlBalance: 0,
    debt: 0,
    payment: 0,
    receivable: 0,
    collection: 0,
    ...patch,
  };
}

export function breakdown(rows: BalanceBreakdownRow[]): AccountBalanceBreakdown {
  return {
    groupBy: "COMPANY",
    splitDate: null,
    rows,
    payableInvoiceTotals: [],
    receivableInvoiceTotals: [],
    invoiceGaps: [],
  };
}

export function settlement(patch: Partial<Settlement> = {}): Settlement {
  return {
    id: "s-new",
    type: "PAYMENT",
    method: "CASH",
    accountId: "a1",
    branchId: "b1",
    fundAccountId: "k1",
    instrumentId: null,
    expenseItemId: null,
    planId: null,
    money: { amount: "250.0000", currency: "TRY" },
    settlementDate: "2026-11-15",
    description: null,
    status: "POSTED",
    companyId: "c1",
    documentNo: null,
    channel: null,
    counterpartyBankAccountId: null,
    correctsSettlementId: null,
    reverseReason: null,
    reversedOn: null,
    ...patch,
  };
}

export function listItem(patch: Partial<SettlementListItem> = {}): SettlementListItem {
  return {
    id: "s1",
    type: "PAYMENT",
    method: "CASH",
    channel: null,
    displayMethod: "CASH",
    accountId: "a1",
    accountCode: "TED-001",
    accountName: "Demir Tedarik",
    accountType: "SUPPLIER",
    accountSubGroup: "GENEL",
    accountGroupName: "Tedarikçi",
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
    money: { amount: "100.0000", currency: "TRY" },
    exchangeRate: null,
    tlAmount: null,
    settlementDate: "2026-11-10",
    documentNo: "D-1",
    description: "Eski açıklama",
    status: "POSTED",
    counterpartyBankAccountId: null,
    counterpartyIbanMasked: null,
    counterpartyBankName: null,
    correctsSettlementId: null,
    correctedById: null,
    reverseReason: null,
    reversedOn: null,
    createdAt: "2026-11-10T09:00:00Z",
    createdBy: "ayse@acme.com",
    intercompany: false,
    credit: false,
    transferred: false,
    fxUsed: "0",
    fxRemaining: "0",
    lockReason: null,
    reversible: true,
    correctable: true,
    ...patch,
  };
}

export function detail(patch: Partial<SettlementListItem> = {}): SettlementDetail {
  return {
    item: listItem(patch),
    lines: [],
    instrument: null,
    plan: null,
    allocations: [],
    fundIbanMasked: null,
    bankStatementMatched: false,
  };
}

export function openInvoice(
  id: string,
  remaining: string,
  patch: Partial<OpenInvoice> = {},
): OpenInvoice {
  return {
    targetType: "PURCHASE_INVOICE",
    id,
    number: `F-${id}`,
    typeName: "Alış Faturası",
    invoiceDate: "2026-11-01",
    dueDate: "2026-12-01",
    currency: "TRY",
    total: "1000.0000",
    allocated: "0.0000",
    remaining,
    branchId: "b1",
    companyId: "c1",
    ...patch,
  };
}

function query(path: string): URLSearchParams {
  return new URLSearchParams(path.split("?")[1] ?? "");
}

/** Modalların ortak sahte yanıtları (sonradan kaydedilen yanıt önce eşleşir). */
export function modalApi(options: { tree?: BranchTree; rows?: BalanceBreakdownRow[] } = {}) {
  fakeApi.on("GET", "/finance/currencies", [
    { code: "TRY", name: "Türk Lirası" },
    { code: "USD", name: "ABD Doları" },
  ]);
  fakeApi.on("GET", /^\/organization\/branch-tree/, options.tree ?? TREE_TWO);
  fakeApi.on("GET", /^\/organization\/branches/, page([]));
  fakeApi.on("GET", /^\/finance\/accounts\?/, page([makeAccount()]));
  fakeApi.on("GET", /^\/finance\/accounts\/a1(\?|$)/, makeAccount());
  fakeApi.on("GET", /^\/finance\/accounts\/a1\/balances/, breakdown(options.rows ?? []));
  fakeApi.on("GET", /^\/finance\/accounts\/a1\/bank-accounts/, []);
  fakeApi.on("GET", /^\/finance\/payment-plans\?/, page([]));
  fakeApi.on("GET", /^\/finance\/funds\?/, ({ path }: ApiCall) => {
    const q = query(path);
    const kind = q.get("kind");
    const branches = q.getAll("branchId");
    return FUNDS.filter(
      (item) =>
        (!kind || item.kind === kind) &&
        (branches.length === 0 || branches.includes(item.branchId)),
    );
  });
  fakeApi.on("GET", /^\/finance\/funds\/[^/?]+(\?|$)/, ({ path }: ApiCall) => {
    const id = path.split("/")[3].split("?")[0];
    return FUNDS.find((item) => item.id === id);
  });
  fakeApi.on("POST", /^\/finance\/settlements\/check/, { warnings: [], invoiceGaps: [] });
  fakeApi.on("GET", /^\/finance\/instruments\?/, page([]));
}
