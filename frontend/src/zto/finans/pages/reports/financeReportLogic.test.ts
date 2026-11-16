// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { BranchTree } from "../../../../pages/organization/types";
import type { LedgerAccountRow, Statement, StatementLine } from "../../../../pages/finance/types";
import { financeReportPath } from "../../navItems";
import {
  COMPANY_CONSOLIDATED,
  STATEMENT_MAX_ROWS,
  apiPeriod,
  balanceSuffix,
  branchGroupOptions,
  cellValue,
  compareCurrency,
  companySelectValue,
  companyUrlValue,
  currencyTotals,
  display,
  fetchStatementCapped,
  frMode,
  frQuery,
  isClosed,
  ledgerState,
  listColumns,
  listRowKey,
  matchesSearch,
  netSide,
  nextSort,
  parseFrState,
  parseRange,
  presetOf,
  reportCompany,
  resolveBranchIds,
  settleAge,
  settleBucket,
  sheetCell,
  sheetNumberFormats,
  sheetRowCount,
  sortMethods,
  sortRows,
  statementBlocks,
  statementPeriod,
  sumBySymbol,
  tableToSheet,
  tileKeys,
  tileTotals,
  workplaceOptions,
} from "./financeReportLogic";

const TODAY = "2026-11-16";

function makeLedgerRow(overrides: Partial<LedgerAccountRow> = {}): LedgerAccountRow {
  return {
    accountId: "a1",
    accountCode: "MUS-0001",
    accountName: "Kuzey Lojistik",
    accountType: "CUSTOMER",
    subGroup: "MUSTERI",
    subGroupName: "Müşteri",
    active: true,
    companyId: "c1",
    companyName: "Acme",
    currency: "TRY",
    opening: "100.00",
    debt: "10.00",
    payment: "5.00",
    receivable: "500.00",
    penalty: "20.00",
    collection: "200.00",
    closing: "415.00",
    lastSettlementDate: "2026-11-10",
    lastSettlementAmount: "200.00",
    lastMovementDate: "2026-11-12",
    ...overrides,
  };
}

const TREE: BranchTree = [
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
          { id: "b1", code: "IY1", name: "Merkez", active: true },
          { id: "b2", code: "IY2", name: "Depo", active: true },
        ],
      },
      {
        groupId: null,
        groupName: "Diğer",
        groupActive: true,
        branches: [{ id: "b3", code: "IY3", name: "Liman", active: true }],
      },
      { groupId: "g2", groupName: "Boş Şube", groupActive: true, branches: [] },
    ],
  },
];

describe("dönem (ZTO ReportDateRange)", () => {
  it("varsayılan Tümü; range=all", () => {
    expect(parseRange({}, TODAY)).toEqual({
      preset: "all",
      isAll: true,
      from: null,
      to: TODAY,
      invalid: false,
    });
    expect(parseRange({ range: "all", from: "2026-01-01" }, TODAY).isAll).toBe(true);
  });

  it("hazır aralıklar bugün dahil (7 = bugün−6, 30 = bugün−29)", () => {
    expect(parseRange({ range: "7" }, TODAY)).toMatchObject({ preset: "7", from: "2026-11-10" });
    expect(parseRange({ range: "30" }, TODAY)).toMatchObject({ preset: "30", from: "2026-10-18" });
    expect(parseRange({ range: "today" }, TODAY)).toMatchObject({ from: TODAY, to: TODAY });
  });

  it("from/to: tek uç tamamlanır, ters aralık yer değiştirir, kutular hazır aralığa denkse etkin", () => {
    expect(parseRange({ from: "2026-11-01" }, TODAY)).toMatchObject({
      from: "2026-11-01",
      to: TODAY,
    });
    expect(parseRange({ to: "2026-11-30" }, TODAY)).toMatchObject({
      from: "2026-11-01",
      to: "2026-11-30",
    });
    expect(parseRange({ from: "2026-11-20", to: "2026-11-01" }, TODAY)).toMatchObject({
      from: "2026-11-01",
      to: "2026-11-20",
      preset: "custom",
    });
    expect(parseRange({ from: "2026-11-10", to: TODAY }, TODAY).preset).toBe("7");
    expect(presetOf(TODAY, TODAY, TODAY)).toBe("today");
  });

  it("çözülemeyen değer uyarı verir ve varsayılana düşer", () => {
    expect(parseRange({ range: "90" }, TODAY)).toMatchObject({ isAll: true, invalid: true });
    expect(parseRange({ from: "2026-13-01" }, TODAY)).toMatchObject({ isAll: true, invalid: true });
    expect(parseRange({ from: "1999-01-01" }, TODAY).invalid).toBe(true);
    expect(parseRange({ from: "2026-11-01", to: "x" }, TODAY)).toMatchObject({
      from: "2026-11-01",
      to: TODAY,
      invalid: true,
    });
  });

  it("API ve ekstre dönemi", () => {
    expect(apiPeriod(parseRange({}, TODAY))).toEqual({});
    expect(apiPeriod(parseRange({ range: "7" }, TODAY))).toEqual({ from: "2026-11-10", to: TODAY });
    expect(statementPeriod(parseRange({}, TODAY))).toEqual({ from: "0001-01-01", to: TODAY });
    expect(statementPeriod(parseRange({ range: "today" }, TODAY))).toEqual({
      from: TODAY,
      to: TODAY,
    });
  });
});

describe("URL durumu ve kip", () => {
  it("tür beyaz listesi; PERSONNEL yalnız izinle", () => {
    const params = new URLSearchParams(
      "type=sales&cur=usd&account=a1&branchGroupId=g1&branchId=b1",
    );
    const state = parseFrState(params, TODAY, false);
    expect(state).toMatchObject({ type: "SALES", cur: "USD", account: "a1", invalidType: false });
    expect(frMode(state)).toBe("statement");
    expect(parseFrState(new URLSearchParams("type=PERSONNEL"), TODAY, false)).toMatchObject({
      type: null,
      invalidType: true,
    });
    expect(parseFrState(new URLSearchParams("type=PERSONNEL"), TODAY, true).type).toBe("PERSONNEL");
    expect(parseFrState(new URLSearchParams("type=garden"), TODAY, true).invalidType).toBe(true);
    expect(frMode({ type: "SALES", account: "" })).toBe("list");
    expect(frMode({ type: null, account: "" })).toBe("overview");
  });

  it("iç bağlantılar tüm süzgeçleri (branchGroupId dahil) korur", () => {
    const state = parseFrState(
      new URLSearchParams(
        "from=2026-11-01&to=2026-11-15&cur=EUR&branchGroupId=g1&branchId=b2&companyId=c2",
      ),
      TODAY,
      true,
    );
    const query = frQuery(state, { type: "SUPPLIERS", account: "a9" });
    expect(query).toEqual({
      type: "SUPPLIERS",
      range: undefined,
      from: "2026-11-01",
      to: "2026-11-15",
      cur: "EUR",
      account: "a9",
      branchGroupId: "g1",
      branchId: "b2",
      companyId: "c2",
    });
    expect(financeReportPath(query)).toBe(
      "/zto-finans/finans-raporlari?type=SUPPLIERS&from=2026-11-01&to=2026-11-15&cur=EUR&account=a9&branchGroupId=g1&branchId=b2&companyId=c2",
    );
    const all = parseFrState(new URLSearchParams("branchGroupId=g1"), TODAY, true);
    expect(financeReportPath(frQuery(all, { type: "SALES" }))).toBe(
      "/zto-finans/finans-raporlari?type=SALES&range=all&branchGroupId=g1",
    );
  });

  it("şirket: tek şirkette parametre yok, all = konsolide, boş = aktif şirket", () => {
    expect(reportCompany("c2", false)).toBeUndefined();
    expect(reportCompany("", true)).toBeUndefined();
    expect(reportCompany(COMPANY_CONSOLIDATED, true)).toBeNull();
    expect(reportCompany("c2", true)).toBe("c2");
    expect(companySelectValue("", "c1")).toBe("c1");
    expect(companySelectValue("", null)).toBe(COMPANY_CONSOLIDATED);
    expect(companyUrlValue("c1", "c1")).toBe("");
    expect(companyUrlValue(COMPANY_CONSOLIDATED, "c1")).toBe(COMPANY_CONSOLIDATED);
    expect(companyUrlValue(COMPANY_CONSOLIDATED, null)).toBe("");
  });

  it("resolveBranchIds: iş yeri > şube > yok; ağaç yoksa bekler; boş şube boş sonuç", () => {
    expect(resolveBranchIds("b9", "g1", undefined)).toEqual({
      ready: true,
      ids: ["b9"],
      empty: false,
    });
    expect(resolveBranchIds("", "", undefined)).toEqual({
      ready: true,
      ids: undefined,
      empty: false,
    });
    expect(resolveBranchIds("", "g1", undefined)).toEqual({
      ready: false,
      ids: undefined,
      empty: false,
    });
    expect(resolveBranchIds("", "g1", TREE)).toEqual({
      ready: true,
      ids: ["b1", "b2"],
      empty: false,
    });
    expect(resolveBranchIds("", "g2", TREE)).toEqual({ ready: true, ids: undefined, empty: true });
  });

  it("şube ve iş yeri seçenekleri (grupsuz iş yeri şube seçeneği değildir)", () => {
    expect(branchGroupOptions(TREE)).toEqual([
      { value: "g1", label: "İzmir" },
      { value: "g2", label: "Boş Şube" },
    ]);
    expect(workplaceOptions(TREE, "").map((o) => o.value)).toEqual(["b1", "b2", "b3"]);
    expect(workplaceOptions(TREE, "g1").map((o) => o.label)).toEqual(["Merkez", "Depo"]);
    expect(branchGroupOptions(undefined)).toEqual([]);
  });
});

describe("işaret ve durum (FrLedger)", () => {
  it("display: alacak yanında aynen, borç yanında ters (Rev 1 FE-FRI-SIGN)", () => {
    expect(display("PAYABLE", "-100")).toBe("100.00");
    expect(display("PAYABLE", "50")).toBe("-50.00");
    expect(display("RECEIVABLE", "-100")).toBe("-100.00");
  });

  it("Durum ham closing'den, 0,005 toleransla", () => {
    expect(ledgerState("0.004")).toBe("CLOSED");
    expect(ledgerState("-0.004")).toBe("CLOSED");
    expect(ledgerState("10")).toBe("THEY_OWE");
    expect(ledgerState("-10")).toBe("WE_OWE");
    expect(isClosed("0.005")).toBe(false);
    expect(netSide("1")).toBe("theyOwe");
    expect(netSide("-1")).toBe("weOwe");
    expect(netSide("0")).toBeNull();
    expect(balanceSuffix("5")).toBe("B");
    expect(balanceSuffix("-5")).toBe("A");
    expect(balanceSuffix("0")).toBe("");
  });

  it("currencyTotals: açık satırlardan ayrı borcumuz/alacağımız, net hepsinden, TL önce", () => {
    const totals = currencyTotals([
      { currency: "USD", closing: "10" },
      { currency: "TRY", closing: "100" },
      { currency: "TRY", closing: "-40" },
      { currency: "TRY", closing: "0.001" },
    ]);
    expect(totals).toEqual([
      { currency: "TRY", weOwe: "40.00", theyOwe: "100.00", net: "60.001", open: 2 },
      { currency: "USD", weOwe: "0.00", theyOwe: "10.00", net: "10.00", open: 1 },
    ]);
    expect(compareCurrency("EUR", "CHF")).toBeLessThan(0);
    expect(compareCurrency("AUD", "CHF")).toBeLessThan(0);
  });

  it("sumBySymbol: ilk görülme sırası, |toplam| < 0,005 yazılmaz, ondalık güvenli", () => {
    expect(
      sumBySymbol([
        { sym: "$", v: "0.1" },
        { sym: "₺", v: "1.000" },
        { sym: "$", v: "0.2" },
        { sym: "€", v: "0.004" },
      ]),
    ).toEqual([
      { sym: "$", total: "0.30" },
      { sym: "₺", total: "1.00" },
    ]);
  });
});

describe("liste kipi", () => {
  it("satır anahtarı cari × şirket × para birimi", () => {
    expect(listRowKey(makeLedgerRow({ companyId: "c2", currency: "USD" }))).toBe("a1|c2|USD");
  });

  it("son tahsilat kovası ve yaşı (ileri tarih = son 30 gün)", () => {
    expect(settleBucket(null, TODAY)).toBe("none");
    expect(settleBucket("2026-11-30", TODAY)).toBe("last30");
    expect(settleBucket("2026-10-17", TODAY)).toBe("last30");
    expect(settleBucket("2026-10-16", TODAY)).toBe("d31To90");
    expect(settleBucket("2026-08-18", TODAY)).toBe("d31To90");
    expect(settleBucket("2026-08-17", TODAY)).toBe("d90");
    expect(settleAge(TODAY, TODAY)).toBe(0);
    expect(settleAge(null, TODAY)).toBeNull();
  });

  it("arama: kod + ad, tr küçük harf (İ/ı)", () => {
    const row = makeLedgerRow({ accountCode: "IST-1", accountName: "İSTANBUL Iğdır" });
    expect(matchesSearch(row, "istanbul")).toBe(true);
    expect(matchesSearch(row, "ığdır")).toBe(true);
    expect(matchesSearch(row, "ist-1 izmir")).toBe(false);
    expect(matchesSearch(row, "  ")).toBe(true);
  });

  it("sütunlar yana göre; Şirket yalnız istenirse", () => {
    expect(listColumns("RECEIVABLE", false).map((c) => c.id)).toEqual([
      "code",
      "name",
      "group",
      "currency",
      "opening",
      "sales",
      "penalty",
      "otherDebt",
      "collection",
      "payment",
      "closing",
      "lastSettlement",
      "settlementAmount",
      "lastMovement",
    ]);
    expect(listColumns("PAYABLE", true).map((c) => c.id)).toEqual([
      "code",
      "name",
      "company",
      "group",
      "currency",
      "opening",
      "purchase",
      "paid",
      "refund",
      "collection",
      "closing",
      "lastSettlement",
      "settlementAmount",
      "lastMovement",
    ]);
  });

  it("hücre değerleri: İade = alacak + ceza, Devir/Kalan display", () => {
    const row = makeLedgerRow({ opening: "-30", closing: "-70" });
    expect(cellValue(row, "refund", "PAYABLE")).toBe("520.00");
    expect(cellValue(row, "opening", "PAYABLE")).toBe("30.00");
    expect(cellValue(row, "closing", "PAYABLE")).toBe("70.00");
    expect(cellValue(row, "closing", "RECEIVABLE")).toBe("-70.00");
    expect(cellValue(row, "currency", "PAYABLE")).toBe("₺");
    expect(
      cellValue(makeLedgerRow({ lastSettlementAmount: null }), "settlementAmount", "PAYABLE"),
    ).toBe("0");
  });

  it("sıralama: sayısal ham ondalıkla, metin tr; ilk tık artan, tekrar ters", () => {
    const rows = [
      makeLedgerRow({ accountId: "x", accountName: "Çınar", closing: "9" }),
      makeLedgerRow({ accountId: "y", accountName: "Ceren", closing: "10" }),
      makeLedgerRow({ accountId: "z", accountName: "Ahmet", closing: "-2" }),
    ];
    const first = nextSort(null, "closing");
    expect(first).toEqual({ column: "closing", direction: "ascending" });
    expect(sortRows(rows, first, "RECEIVABLE").map((r) => r.accountId)).toEqual(["z", "x", "y"]);
    // Borç yanında display ters işaret.
    expect(sortRows(rows, first, "PAYABLE").map((r) => r.accountId)).toEqual(["y", "x", "z"]);
    const second = nextSort(first, "closing");
    expect(second?.direction).toBe("descending");
    expect(nextSort(second, "name")).toEqual({ column: "name", direction: "ascending" });
    expect(
      sortRows(rows, { column: "name", direction: "ascending" }, "RECEIVABLE").map(
        (r) => r.accountName,
      ),
    ).toEqual(["Ahmet", "Ceren", "Çınar"]);
    expect(sortRows(rows, null, "RECEIVABLE")).toEqual(rows);
  });

  it("kutucuklar: ayrı cari sayısı, yan bazlı alanlar", () => {
    const rows = [
      makeLedgerRow(),
      makeLedgerRow({ companyId: "c2" }),
      makeLedgerRow({
        accountId: "a2",
        currency: "USD",
        closing: "-5",
        receivable: "1",
        penalty: "0",
      }),
    ];
    expect(tileKeys("RECEIVABLE").map((k) => k.key)).toEqual([
      "credit",
      "collection",
      "penalty",
      "kalan",
    ]);
    expect(tileKeys("PAYABLE").map((k) => `${k.key}:${k.css}`)).toEqual([
      "debt:",
      "payment:ok",
      "credit:",
      "kalan:warn",
    ]);
    const receivable = tileTotals(rows, "RECEIVABLE");
    expect(receivable.count).toBe(2);
    expect(receivable.totals.credit).toEqual([
      { sym: "₺", total: "1000.00" },
      { sym: "$", total: "1.00" },
    ]);
    const payable = tileTotals(rows, "PAYABLE");
    expect(payable.totals.credit[0]).toEqual({ sym: "₺", total: "1040.00" });
    expect(payable.totals.kalan).toEqual([
      { sym: "₺", total: "-830.00" },
      { sym: "$", total: "5.00" },
    ]);
  });
});

function line(overrides: Partial<StatementLine> = {}): StatementLine {
  return {
    id: "l1",
    date: "2026-11-01",
    direction: "DEBIT",
    amount: 100,
    exchangeRate: null,
    tlAmount: null,
    description: null,
    sourceType: "ACCOUNT_DOCUMENT",
    balance: 0,
    currency: "TRY",
    companyId: "c1",
    branchId: "b1",
    sourceId: "s1",
    kind: "RECEIVABLE",
    sign: 1,
    reversal: false,
    reversed: false,
    transferRole: null,
    documentNo: null,
    documentType: null,
    documentDate: null,
    dueDate: null,
    paymentMethod: null,
    createdBy: "x",
    createdAt: "2026-11-01T10:00:00Z",
    ...overrides,
  };
}

function statement(
  lines: StatementLine[],
  openings: Array<{ currency: string; amount: number }> = [],
) {
  return {
    currency: "TRY",
    openingBalance: 0,
    openingBalances: openings,
    lines,
    page: 0,
    size: lines.length,
    totalElements: lines.length,
    totalPages: 1,
  } as unknown as Statement;
}

describe("ekstre kipi (FrLedger.Statement)", () => {
  it("devir + tarih/oluşturma/tür sırası + yürüyen bakiye + dönem toplamı", () => {
    const blocks = statementBlocks(
      statement(
        [
          line({
            id: "c",
            date: "2026-11-02",
            direction: "CREDIT",
            amount: 30,
            kind: "COLLECTION",
          }),
          line({
            id: "b",
            date: "2026-11-01",
            direction: "CREDIT",
            amount: 20,
            kind: "COLLECTION",
          }),
          line({ id: "a", date: "2026-11-01", amount: 100, kind: "RECEIVABLE" }),
          line({ id: "u", currency: "USD", amount: 5 }),
        ],
        [
          { currency: "TRY", amount: 50 },
          { currency: "EUR", amount: 7 },
          { currency: "GBP", amount: 0 },
        ],
      ),
    );
    expect(blocks.map((b) => b.currency)).toEqual(["TRY", "USD", "EUR"]);
    const tl = blocks[0];
    expect(tl.opening).toBe("50.00");
    expect(tl.rows.map((r) => [r.line.id, r.debit, r.credit, r.balance])).toEqual([
      ["a", "100.00", "0.00", "150.00"],
      ["b", "0.00", "20.00", "130.00"],
      ["c", "0.00", "30.00", "100.00"],
    ]);
    expect([tl.periodDebit, tl.periodCredit, tl.closing]).toEqual(["100.00", "50.00", "100.00"]);
    expect(blocks[2]).toMatchObject({ currency: "EUR", rows: [], closing: "7.00" });
    expect(statementBlocks(statement([line()]), "USD")).toEqual([]);
  });

  it("aynı gün ve saatte borç/alacak önce, ödeme/tahsilat sonra", () => {
    const blocks = statementBlocks(
      statement([
        line({ id: "1", kind: "COLLECTION", direction: "CREDIT" }),
        line({ id: "2", kind: "PAYMENT" }),
        line({ id: "3", kind: "RECEIVABLE" }),
        line({ id: "4", kind: "DEBT", direction: "CREDIT" }),
      ]),
    );
    expect(blocks[0].rows.map((r) => r.line.kind)).toEqual([
      "DEBT",
      "RECEIVABLE",
      "PAYMENT",
      "COLLECTION",
    ]);
  });

  it("sayfalar 30 ile sınırlı; fazlası truncated", async () => {
    const calls: number[] = [];
    const result = await fetchStatementCapped(async (page) => {
      calls.push(page);
      return { ...statement([line({ id: `p${page}` })]), totalPages: 3 } as Statement;
    }, 2);
    expect(calls).toEqual([0, 1]);
    expect(result.truncated).toBe(true);
    expect(result.statement.lines.map((l) => l.id)).toEqual(["p0", "p1"]);
    const full = await fetchStatementCapped(async () => statement([line()]));
    expect(full.truncated).toBe(false);
    expect(STATEMENT_MAX_ROWS).toBe(60000);
  });

  it("yöntem sırası: ödeme önce, sonra yöntem ve para birimi", () => {
    expect(
      sortMethods([
        { type: "COLLECTION", method: "CASH", currency: "TRY", amount: "1" },
        { type: "PAYMENT", method: "CHECK", currency: "USD", amount: "1" },
        { type: "PAYMENT", method: "CHECK", currency: "TRY", amount: "1" },
        { type: "PAYMENT", method: "BANK", currency: "TRY", amount: "1" },
      ]).map((m) => `${m.type}:${m.method}:${m.currency}`),
    ).toEqual([
      "PAYMENT:BANK:TRY",
      "PAYMENT:CHECK:TRY",
      "PAYMENT:CHECK:USD",
      "COLLECTION:CASH:TRY",
    ]);
  });
});

describe("Excel (finance-report.js sheetRows)", () => {
  it("data-v sayısal → sayı, boş → boş hücre, yoksa metin", () => {
    expect(sheetCell({ text: "1.234,50 ₺", v: "1234.50" })).toBe(1234.5);
    expect(sheetCell({ text: "x", v: " " })).toBeNull();
    expect(sheetCell({ text: "MUS-1", v: "MUS-1" })).toBe("MUS-1");
    expect(sheetCell({ text: "=SUM(A1)" })).toBe("=SUM(A1)");
  });

  it("tablodan sayfa: ad, son başlık satırı, yalnız DOM'daki (görünen) satırlar", () => {
    document.body.innerHTML = `
      <table data-fr-sheet="Satış">
        <thead><tr><th>Kod</th><th>Kalan</th></tr></thead>
        <tbody>
          <tr><td data-v="K1">K1</td><td data-v="10.5">10,50</td></tr>
          <tr><td>  K2 </td><td data-v="">-</td></tr>
        </tbody>
      </table>`;
    const sheet = tableToSheet(document.querySelector("table") as HTMLTableElement);
    expect(sheet.name).toBe("Satış");
    expect(sheet.headers).toEqual(["Kod", "Kalan"]);
    expect(sheet.rows).toEqual([
      [
        { text: "K1", v: "K1" },
        { text: "10,50", v: "10.5" },
      ],
      [{ text: "K2" }, { text: "-", v: "" }],
    ]);
    expect(sheetRowCount([sheet, sheet])).toBe(4);
    expect(sheetNumberFormats(sheet)).toEqual([undefined, "#,##0.00"]);
  });
});
