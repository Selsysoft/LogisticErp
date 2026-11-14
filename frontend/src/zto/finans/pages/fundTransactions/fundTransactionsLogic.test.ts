import { afterEach, describe, expect, it } from "vitest";
import type { Fund, FundTransactionRow } from "../../../../pages/finance/types";
import {
  ACCOUNTING_TYPES,
  LENGTH_MENU,
  PAGE_LENGTH,
  ZTO_ACCOUNTING_COUNT,
  accountingKeyOf,
  accountingValueOf,
  activityFundLabel,
  addDaysIso,
  addMonthsIso,
  balanceEquation,
  canEditPayment,
  csvAmount,
  csvCell,
  csvContent,
  csvFileName,
  csvLines,
  defaultFilters,
  fundLabel,
  fundOptions,
  rowNumber,
  serverPageSize,
  toParams,
  todayIso,
  type CsvTexts,
} from "./fundTransactionsLogic";

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

function fund(overrides: Partial<Fund> = {}): Fund {
  return {
    id: "f1",
    code: "ZRT-1",
    name: "Ziraat",
    kind: "BANK",
    currency: "TRY",
    branchId: "b1",
    companyId: "c1",
    bankName: null,
    iban: null,
    allowNegative: false,
    balance: 0,
    accountType: "DEMAND",
    accountNo: null,
    bankBranchName: "Merkez",
    description: null,
    active: true,
    currentBalance: 0,
    futureCount: 0,
    futureNet: 0,
    openingBalance: 0,
    openingDate: null,
    transactionCount: 0,
    ...overrides,
  };
}

function row(overrides: Partial<FundTransactionRow> = {}): FundTransactionRow {
  return {
    id: "t1",
    fundAccountId: "f1",
    fundCode: "ZRT-1",
    fundName: "Ziraat",
    bankName: null,
    kind: "BANK",
    accountType: "DEMAND",
    companyId: "c1",
    branchId: "b1",
    currency: "TRY",
    transactionDate: "2026-11-10",
    direction: "OUT",
    amount: 1234.5,
    exchangeRate: 1,
    tlAmount: 1234.5,
    runningBalance: 765.5,
    description: "=HYPERLINK(1)",
    sourceType: "SETTLEMENT",
    sourceId: "s1",
    accountingType: "ACCOUNT_PAYMENT",
    transferCode: null,
    category: null,
    accountId: "a1",
    accountCode: "320.01",
    accountName: "Ankara; Lastik",
    reversal: false,
    reversed: false,
    createdBy: "u",
    createdAt: "2026-11-10T08:00:00Z",
    ...overrides,
  };
}

describe("fundTransactionsLogic — muhasebe tipleri", () => {
  it("BT ZTO sırası (16) + Blackrose ekleri", () => {
    const bank = ACCOUNTING_TYPES.BANK.map((o) => o.key);
    expect(bank.slice(0, ZTO_ACCOUNTING_COUNT.BANK)).toEqual([
      "all",
      "accountPayment",
      "accountCollection",
      "eft",
      "wire",
      "virement",
      "fxExchange",
      "bankToCash",
      "cashToBank",
      "netSalary",
      "creditDrawdown",
      "checkCollection",
      "noteCollection",
      "expense",
      "income",
      "other",
    ]);
    expect(bank.slice(ZTO_ACCOUNTING_COUNT.BANK)).toEqual([
      "transferCost",
      "opening",
      "intercompany",
      "checkPayment",
      "notePayment",
      "legacyTransfer",
    ]);
  });

  it("CT 18 seçenek ZTO sırasıyla; iki çift aynı değere eşlenir", () => {
    const cash = ACCOUNTING_TYPES.CASH.slice(0, ZTO_ACCOUNTING_COUNT.CASH);
    expect(cash).toHaveLength(18);
    expect(cash.map((o) => o.key)).toEqual([
      "all",
      "accountPayment",
      "accountCollection",
      "eft",
      "wire",
      "virement",
      "fxExchange",
      "bankToCash",
      "cashToBank",
      "cashToCash",
      "netSalary",
      "checkCollection",
      "noteCollection",
      "bankWithdrawal",
      "bankDeposit",
      "expense",
      "income",
      "other",
    ]);
    expect(accountingValueOf("CASH", "bankToCash")).toBe("BANK_TO_CASH");
    expect(accountingValueOf("CASH", "bankWithdrawal")).toBe("BANK_TO_CASH");
    expect(accountingValueOf("CASH", "cashToBank")).toBe("CASH_TO_BANK");
    expect(accountingValueOf("CASH", "bankDeposit")).toBe("CASH_TO_BANK");
    expect(accountingValueOf("CASH", "all")).toBeUndefined();
    expect(accountingValueOf("BANK", "yok")).toBeUndefined();
    expect(accountingKeyOf("CASH", "BANK_TO_CASH")).toBe("bankToCash");
    expect(accountingKeyOf("BANK", "LEGACY_TRANSFER")).toBe("legacyTransfer");
    expect(accountingKeyOf("BANK", "XYZ")).toBeNull();
    expect(accountingKeyOf("BANK", null)).toBeNull();
  });
});

describe("fundTransactionsLogic — tarih ve süzgeç", () => {
  it("yerel takvim bugün, UTC ve İstanbul'da gece yarısı kayması yok", () => {
    for (const tz of ["UTC", "Europe/Istanbul"]) {
      process.env.TZ = tz;
      expect(todayIso(new Date(2026, 10, 14, 0, 30))).toBe("2026-11-14");
      expect(todayIso(new Date(2026, 10, 14, 23, 50))).toBe("2026-11-14");
    }
  });

  it("gün ve ay aritmetiği (ay sonu taşması)", () => {
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonthsIso("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonthsIso("2026-01-15", -1)).toBe("2025-12-15");
  });

  it("varsayılanlar: −7 gün; bitiş BT +1, CT bugün; temizle = ilk varsayılan", () => {
    expect(defaultFilters("BANK", "2026-11-14")).toEqual({
      companyId: "",
      branchId: "",
      fundId: "",
      direction: "",
      accountingKey: "all",
      from: "2026-11-07",
      to: "2026-11-15",
    });
    expect(defaultFilters("CASH", "2026-11-14", { fundId: "k1", companyId: "c1" })).toMatchObject({
      fundId: "k1",
      companyId: "c1",
      to: "2026-11-14",
    });
  });

  it("parametreler: şirket yalnız çok şirkette (boş = konsolide), muhasebe tipi değeri", () => {
    const filters = {
      ...defaultFilters("CASH", "2026-11-14"),
      fundId: "k1",
      branchId: "b1",
      accountingKey: "bankDeposit",
      direction: "IN" as const,
    };
    expect(
      toParams("CASH", filters, { multiCompany: false, q: " x ", summary: true, currency: "USD" }),
    ).toEqual({
      companyId: undefined,
      kind: "CASH",
      fundIds: ["k1"],
      branchIds: ["b1"],
      direction: "IN",
      accountingTypes: ["CASH_TO_BANK"],
      currency: "USD",
      from: "2026-11-07",
      to: "2026-11-14",
      q: "x",
      summary: true,
      sort: "desc",
    });
    const all = toParams(
      "BANK",
      { ...defaultFilters("BANK", "2026-11-14"), from: "", to: "" },
      { multiCompany: true },
    );
    expect(all).toMatchObject({
      companyId: null,
      fundIds: undefined,
      branchIds: undefined,
      direction: undefined,
      accountingTypes: undefined,
      from: undefined,
      to: undefined,
      q: undefined,
    });
    expect(
      toParams(
        "BANK",
        { ...defaultFilters("BANK", "2026-11-14"), companyId: "c2" },
        { multiCompany: true },
      ).companyId,
    ).toBe("c2");
  });

  it("sayfa boyutu: ZTO lengthMenu, 'Tümü' = 500; BT 50, CT 25", () => {
    expect(LENGTH_MENU).toEqual([10, 25, 50, 100, -1]);
    expect(PAGE_LENGTH).toEqual({ BANK: 50, CASH: 25 });
    expect(serverPageSize(-1)).toBe(500);
    expect(serverPageSize(25)).toBe(25);
    expect(rowNumber(2, 25, 0)).toBe(51);
  });
});

describe("fundTransactionsLogic — seçenekler ve satırlar", () => {
  const typeLabel = () => "Vadesiz";

  it("fon seçenekleri: yalnız Vadesiz + aktif + iş yeri; seçili olan her zaman", () => {
    const funds = [
      fund(),
      fund({ id: "f2", accountType: "CREDIT", name: "Kredi" }),
      fund({ id: "f3", active: false, name: "Pasif" }),
      fund({ id: "f4", branchId: "b2", name: "Diğer İş Yeri", bankBranchName: null, code: "" }),
      fund({ id: "k1", kind: "CASH", name: "Kasa", code: "K1" }),
    ];
    expect(fundOptions(funds, "BANK", "", "", typeLabel).map((o) => o.value)).toEqual(["f1", "f4"]);
    expect(fundOptions(funds, "BANK", "b1", "f3", typeLabel).map((o) => o.value)).toEqual([
      "f1",
      "f3",
    ]);
    expect(fundOptions(funds, "BANK", "", "", typeLabel)[0].label).toBe(
      "Ziraat | Merkez (ZRT-1) [Vadesiz]",
    );
    expect(fundOptions(funds, "BANK", "b2", "", typeLabel)[0].label).toBe(
      "Diğer İş Yeri [Vadesiz]",
    );
    expect(fundOptions(funds, "CASH", "", "", typeLabel)).toEqual([
      { value: "k1", label: "Kasa (K1)" },
    ]);
    expect(
      fundOptions([fund({ accountType: undefined as never })], "BANK", "", "", typeLabel),
    ).toHaveLength(1);
    expect(fundLabel(fund({ kind: "CASH", name: "K", code: "C" }), "CASH", "x")).toBe("K (C)");
    expect(activityFundLabel(fund(), "BANK", "Vadesiz")).toBe("Ziraat | Merkez [Vadesiz]");
    expect(activityFundLabel(fund({ bankBranchName: null }), "BANK", "Vadesiz")).toBe(
      "Ziraat [Vadesiz]",
    );
    expect(activityFundLabel(fund({ name: "K", code: "C" }), "CASH", "x")).toBe("K (C)");
  });

  it("bakiye denklemi ve ödeme düzenleme", () => {
    const fmt = (n: number) => n.toFixed(2);
    expect(balanceEquation(row(), fmt)).toBe("(2000.00) - (1234.50) = 765.50");
    expect(balanceEquation(row({ direction: "IN", amount: 10, runningBalance: 10 }), fmt)).toBe(
      "(0.00) + (10.00) = 10.00",
    );
    expect(canEditPayment(row())).toBe(true);
    expect(canEditPayment(row({ direction: "IN" }))).toBe(false);
    expect(canEditPayment(row({ accountingType: "EXPENSE" }))).toBe(false);
  });
});

describe("fundTransactionsLogic — CSV", () => {
  const texts: CsvTexts = {
    headers:
      "Sıra No;Tarih;Banka;Banka Kodu;İşlem Türü;Muhasebe Tipi;Tutar;Para Birimi;Cari Hesap Kodu;Cari Hesap Adı;Açıklama".split(
        ";",
      ),
    companyHeader: "Şirket",
    directionLabel: (d) => (d === "IN" ? "Giriş" : "Çıkış"),
    accountingLabel: () => "Cari Ödeme",
    companyName: () => "Acme",
  };

  it("hücre: ZTO kaçışı + formül öneki; sayı hücrelerine önek yok", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell("")).toBe("");
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell("=1+2")).toBe("'=1+2");
    expect(csvCell("-12,50", true)).toBe("-12,50");
    expect(csvAmount(1234.5)).toBe("1234,50");
    expect(csvAmount(-0.005)).toBe("-0,01");
  });

  it("BT satırları başlık ve şirket sütunuyla", () => {
    const lines = csvLines("BANK", [row()], texts, true);
    expect(lines[0]).toBe(
      "Sıra No;Tarih;Banka;Banka Kodu;İşlem Türü;Muhasebe Tipi;Tutar;Para Birimi;Cari Hesap Kodu;Cari Hesap Adı;Açıklama;Şirket",
    );
    expect(lines[1]).toBe(
      '1;10.11.2026;Ziraat;ZRT-1;Çıkış;Cari Ödeme;1234,50;₺;320.01;"Ankara; Lastik";\'=HYPERLINK(1);Acme',
    );
  });

  it("CT satırları cari sütunsuz; dosya adı ve BOM", () => {
    const cashTexts = {
      ...texts,
      headers: [
        "İşlem No",
        "Tarih",
        "Kasa",
        "Kasa Kodu",
        "İşlem Türü",
        "Muhasebe Tipi",
        "Tutar",
        "Para Birimi",
        "Açıklama",
      ],
    };
    const lines = csvLines(
      "CASH",
      [row({ direction: "IN", description: null, accountCode: null })],
      cashTexts,
      false,
    );
    expect(lines[1]).toBe("1;10.11.2026;Ziraat;ZRT-1;Giriş;Cari Ödeme;1234,50;₺;");
    expect(
      csvLines(
        "BANK",
        [row({ accountCode: null, accountName: null, description: null })],
        texts,
        false,
      )[1],
    ).toBe("1;10.11.2026;Ziraat;ZRT-1;Çıkış;Cari Ödeme;1234,50;₺;;;");
    expect(csvFileName("BANK", "2026-11-14")).toBe("banka_hareketleri_2026-11-14.csv");
    expect(csvFileName("CASH", "2026-11-14")).toBe("kasa_hareketleri_2026-11-14.csv");
    expect(csvContent(["a", "b"])).toBe(String.fromCharCode(0xfeff) + "a\nb\n");
  });
});
