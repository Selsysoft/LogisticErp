import { describe, expect, it } from "vitest";
import tr from "../../locales/tr";
import {
  allocationWarningText,
  checkKey,
  defaultReverseDate,
  displayGaps,
  gapsForCompany,
  invoiceGapText,
  isConfirmationRequired,
  isMissing,
  missingByAccount,
  needsConfirmation,
  newSettlementPath,
  normalizedAmount,
  parseConfirmationDetails,
  parseNewSettlement,
  settlementCheckBody,
  settlementErrorKeys,
  settlementLockErrorCode,
  type Translate,
} from "./settlementWarnings";
import type { AccountInvoiceGap, SettlementWarning } from "./types";

/** Gerçek Türkçe metinlerle basit `t` (i18next yer tutucuları {{x}}). */
const t: Translate = (key, values = {}) => {
  const node = key
    .split(".")
    .reduce<unknown>(
      (acc, part) => (acc as Record<string, unknown> | undefined)?.[part],
      tr.translation,
    );
  if (typeof node !== "string") throw new Error(`anahtar yok: ${key}`);
  return node.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name] ?? ""));
};
const fmt = (amount: number, currency: string) => `${amount.toFixed(2)} ${currency}`;
const names: Record<string, string> = { A: "Alfa", B: "Beta" };
const companyName = (id: string) => names[id] ?? "—";

const warning = (extra: Partial<SettlementWarning> = {}): SettlementWarning => ({
  code: "COMPANY_ALLOCATION_EXCEEDED",
  severity: "CONFIRM",
  currency: "TRY",
  companyId: "B",
  companyOutstanding: 50,
  amount: 150,
  excess: 100,
  others: [{ companyId: "A", outstanding: 100 }],
  partialScope: false,
  otherHiddenExists: false,
  ...extra,
});

const gap = (extra: Partial<AccountInvoiceGap> = {}): AccountInvoiceGap => ({
  accountId: "acc",
  side: "PAYABLE",
  companyId: null,
  currency: "TRY",
  ledgerTotal: 150,
  invoiceTotal: 100,
  missing: 50,
  ...extra,
});

describe("allocationWarningText", () => {
  it("kullanıcı örneği: B'de 50 borç, 150 ödeme → fark 100 ve A'daki borç", () => {
    expect(allocationWarningText(warning(), companyName, fmt, t)).toBe(
      "Bu şirketin cariye borcu 50.00 TRY; ödeme 150.00 TRY, borçtan 100.00 TRY fazla. " +
        "Diğer şirketlerdeki borç: Alfa 100.00 TRY.",
    );
  });

  it("borçsuz cari: diğer şirket satırı yok", () => {
    expect(
      allocationWarningText(
        warning({ companyOutstanding: 0, amount: 10, excess: 10, others: [] }),
        companyName,
        fmt,
        t,
      ),
    ).toBe("Bu şirketin cariye borcu 0.00 TRY; ödeme 10.00 TRY, borçtan 10.00 TRY fazla.");
  });

  it("gizli kısım yalnız bayrak cümlesiyle; tutar hiç yazılmaz (SEC-12.2-02)", () => {
    const text = allocationWarningText(
      warning({
        others: [
          { companyId: "A", outstanding: 0 },
          { companyId: "X", outstanding: 30 },
        ],
        otherHiddenExists: true,
        partialScope: true,
      }),
      companyName,
      fmt,
      t,
    );
    expect(text).toContain("Diğer şirketlerdeki borç: — 30.00 TRY.");
    expect(text).not.toContain("Alfa");
    expect(text).toContain("Diğer şirketlerde/iş yerlerinde de borç var.");
    expect(
      text.endsWith("Yetkili olmadığınız iş yerlerindeki bakiye nedeniyle onay gerekiyor."),
    ).toBe(true);
  });

  it("tahsilat (INFO) bilgi metni", () => {
    expect(
      allocationWarningText(
        warning({ severity: "INFO", companyOutstanding: 20, amount: 30, excess: 10 }),
        companyName,
        fmt,
        t,
      ),
    ).toBe("Bu şirketteki cari borcu 20.00 TRY; tahsilat 30.00 TRY, borçtan 10.00 TRY fazla.");
  });
});

describe("needsConfirmation", () => {
  it("yalnız CONFIRM uyarısı onay ister", () => {
    expect(needsConfirmation(null)).toBe(false);
    expect(needsConfirmation({ warnings: [], invoiceGaps: [] })).toBe(false);
    expect(needsConfirmation({ warnings: [warning({ severity: "INFO" })], invoiceGaps: [] })).toBe(
      false,
    );
    expect(needsConfirmation({ warnings: [warning()], invoiceGaps: [] })).toBe(true);
  });
});

describe("parseConfirmationDetails", () => {
  const error = (details: unknown, code = "CONFIRMATION_REQUIRED") => ({
    status: 409,
    body: { code, message: "onay", details },
  });

  it("§3.6 details satırlarını uyarıya çevirir", () => {
    expect(
      parseConfirmationDetails(
        error([
          "warning=COMPANY_ALLOCATION_EXCEEDED",
          "currency=TRY",
          "companyId=B",
          "companyOutstanding=50.00",
          "amount=150.00",
          "excess=100.00",
          "other.A=100.00",
          "partialScope=false",
          "otherHiddenExists=true",
          "bozuk",
          "=x",
          "other.=5",
          42,
        ]),
      ),
    ).toEqual(warning({ otherHiddenExists: true }));
  });

  it("başka hata, boş ya da eksik ayrıntı → null", () => {
    expect(parseConfirmationDetails(error(["amount=1", "currency=TRY"], "OTHER"))).toBeNull();
    expect(parseConfirmationDetails(error([]))).toBeNull();
    expect(parseConfirmationDetails(error(undefined))).toBeNull();
    expect(parseConfirmationDetails(error(["currency=TRY"]))).toBeNull();
    expect(parseConfirmationDetails(new Error("x"))).toBeNull();
    expect(parseConfirmationDetails(null)).toBeNull();
  });

  it("eksik/sayı olmayan tutarlar 0, eksik kimlikler boş", () => {
    expect(
      parseConfirmationDetails(error(["amount=abc", "currency=USD", "partialScope=true"])),
    ).toMatchObject({
      amount: 0,
      currency: "USD",
      companyId: "",
      companyOutstanding: 0,
      excess: 0,
      partialScope: true,
      otherHiddenExists: false,
      others: [],
    });
  });

  it("isConfirmationRequired", () => {
    expect(isConfirmationRequired(error([]))).toBe(true);
    expect(isConfirmationRequired(error([], "X"))).toBe(false);
    expect(isConfirmationRequired(undefined)).toBe(false);
  });
});

describe("checkKey ve settlementCheckBody", () => {
  const base = {
    accountId: "acc",
    branchId: "b1",
    fundAccountId: "f1",
    method: "CASH",
    amount: "150",
    currency: "TRY",
    description: "x",
    date: "2026-11-14",
  };

  it("kararlı: yalnız ilgili alanlar; açıklama/tarih değişince aynı, tutar biçimi normalize", () => {
    const key = checkKey(base);
    expect(key).toBe("acc|b1|f1|CASH|150|TRY|||");
    expect(checkKey({ ...base, description: "başka", date: "2026-01-01" })).toBe(key);
    expect(checkKey({ ...base, amount: "150,00" })).toBe(key);
    expect(checkKey({ ...base, amount: " 150.0 " })).toBe(key);
    expect(checkKey({ ...base, amount: "151" })).not.toBe(key);
    expect(checkKey({ ...base, instrumentId: "i1" })).not.toBe(key);
    expect(checkKey({ ...base, number: "A-1", bankName: "Z", dueDate: "2026-12-01" })).toBe(key);
    // 12.2a §5.14: kanal ve araç türü anahtara girer (sabit sırada sona).
    expect(checkKey({ ...base, channel: "CREDIT_CARD" })).toBe(
      "acc|b1|f1|CASH|150|TRY||CREDIT_CARD|",
    );
    expect(checkKey({ ...base, instrumentKind: "NOTE" })).toBe("acc|b1|f1|CASH|150|TRY|||NOTE");
    expect(checkKey({})).toBe("||||||||");
    expect(checkKey({ accountId: true as unknown as string })).toBe("||||||||");
  });

  it("normalizedAmount", () => {
    expect(normalizedAmount("12,5")).toBe("12.5");
    expect(normalizedAmount("")).toBe("");
    expect(normalizedAmount("abc")).toBe("");
    expect(normalizedAmount(undefined)).toBe("");
  });

  it("gövde zorunlu alanlar doluyken; fon boşsa alan yok, tarih yoksa bugün", () => {
    expect(settlementCheckBody(base, "CASH", "2026-11-14")).toEqual({
      method: "CASH",
      accountId: "acc",
      branchId: "b1",
      fundAccountId: "f1",
      money: { amount: "150", currency: "TRY" },
      date: "2026-11-14",
    });
    expect(
      settlementCheckBody({ ...base, fundAccountId: "", date: "" }, "CHECK", "2026-01-02"),
    ).toEqual({
      method: "CHECK",
      accountId: "acc",
      branchId: "b1",
      money: { amount: "150", currency: "TRY" },
      date: "2026-01-02",
      // 12.2a §5.14: F-12.2-R4 sunucuda kapandı, yer tutucu çek/senet eklenmez.
    });
    expect(
      settlementCheckBody(
        { ...base, fundAccountId: "", instrumentKind: "NOTE", dueDate: "2026-12-31" },
        "CHECK",
        "2026-01-02",
      ),
    ).not.toHaveProperty("instrument");
    const endorsed = settlementCheckBody(
      { ...base, fundAccountId: "", instrumentId: "i1" },
      "CHECK",
      "2026-01-02",
    );
    expect(endorsed).toMatchObject({ instrumentId: "i1" });
    expect(endorsed).not.toHaveProperty("instrument");
    expect(
      settlementCheckBody({ ...base, instrumentId: "i1" }, "CASH", "2026-11-14"),
    ).not.toHaveProperty("instrumentId");
    for (const missing of ["accountId", "branchId", "currency", "amount"]) {
      expect(settlementCheckBody({ ...base, [missing]: "" }, "CASH", "2026-11-14")).toBeNull();
    }
    expect(settlementCheckBody({ ...base, amount: "0" }, "CASH", "2026-11-14")).toBeNull();
  });

  it("kanal yalnız BANK yönteminde ve geçerli değerde gövdeye yazılır (sunucu CHANNEL_INVALID)", () => {
    expect(
      settlementCheckBody({ ...base, channel: "CREDIT_CARD" }, "BANK", "2026-11-14"),
    ).toMatchObject({ method: "BANK", channel: "CREDIT_CARD" });
    expect(
      settlementCheckBody({ ...base, channel: "TRANSFER" }, "BANK", "2026-11-14")?.channel,
    ).toBe("TRANSFER");
    expect(
      settlementCheckBody({ ...base, channel: "CREDIT_CARD" }, "CASH", "2026-11-14"),
    ).not.toHaveProperty("channel");
    expect(
      settlementCheckBody({ ...base, channel: "WIRE" }, "BANK", "2026-11-14"),
    ).not.toHaveProperty("channel");
  });
});

describe("iptal tarihi ve kilit nedenleri (12.2a §3.5, §3.12)", () => {
  it("varsayılan iptal tarihi max(bugün, kayıt tarihi)", () => {
    expect(defaultReverseDate("2026-11-10", "2026-11-15")).toBe("2026-11-15");
    expect(defaultReverseDate("2026-11-20", "2026-11-15")).toBe("2026-11-20");
    expect(defaultReverseDate("2026-11-15", "2026-11-15")).toBe("2026-11-15");
    expect(defaultReverseDate("2026-12-31", "2027-01-01")).toBe("2027-01-01");
  });

  it("kilit nedeni → hata kodu; her kodun Türkçe iletisi var", () => {
    const cases: [Parameters<typeof settlementLockErrorCode>[0], string][] = [
      ["REVERSED", "SETTLEMENT_REVERSED"],
      ["CHECK", "SETTLEMENT_CHECK_NOT_REVERSIBLE"],
      ["PLAN", "SETTLEMENT_LINKED_TO_PLAN"],
      ["INTERCOMPANY", "SETTLEMENT_LINKED_TO_INTERCOMPANY"],
      ["FX_SOURCE", "SETTLEMENT_USED_IN_FX_EXCHANGE"],
      ["VEHICLE_EXPENSE", "SETTLEMENT_SOURCE_MANAGED"],
      ["TRANSFERRED", "TRANSACTION_TRANSFERRED"],
      ["NO_ACCOUNT", "SETTLEMENT_NOT_CORRECTABLE"],
      [null, "SETTLEMENT_NOT_CORRECTABLE"],
      [undefined, "SETTLEMENT_NOT_CORRECTABLE"],
    ];
    for (const [reason, code] of cases) {
      expect(settlementLockErrorCode(reason)).toBe(code);
      expect(t(`finance.error.${code}`).length).toBeGreaterThan(0);
    }
    expect(settlementLockErrorCode("REVERSED", "s2")).toBe("SETTLEMENT_ALREADY_CORRECTED");
    expect(settlementLockErrorCode("CHECK", "s2")).toBe("SETTLEMENT_CHECK_NOT_REVERSIBLE");
    expect(t("finance.error.TRANSACTION_TRANSFERRED")).toBe(
      "Cari taşıma geri alınmadan düzenlenemez/silinemez.",
    );
  });

  it("hata anahtar adayları en özelden genele; tür/neden ekli ZTO iletileri", () => {
    expect(settlementErrorKeys("ALLOCATION_TARGET_INVALID", "PAYMENT", "CURRENCY")).toEqual([
      "finance.error.ALLOCATION_TARGET_INVALID_CURRENCY_PAYMENT",
      "finance.error.ALLOCATION_TARGET_INVALID_CURRENCY",
      "finance.error.ALLOCATION_TARGET_INVALID_PAYMENT",
      "finance.error.ALLOCATION_TARGET_INVALID",
    ]);
    expect(settlementErrorKeys("X")).toEqual(["finance.error.X"]);
    expect(settlementErrorKeys("X", null, "R")).toEqual(["finance.error.X_R", "finance.error.X"]);
    const first = (keys: string[]) => {
      for (const key of keys) {
        try {
          return t(key);
        } catch {
          // sonraki aday
        }
      }
      return null;
    };
    expect(first(settlementErrorKeys("ALLOCATION_EXCEEDS_SETTLEMENT", "PAYMENT"))).toBe(
      "Toplam tahsis tutarı ödeme tutarını aşıyor!",
    );
    expect(first(settlementErrorKeys("ALLOCATION_EXCEEDS_SETTLEMENT", "COLLECTION"))).toBe(
      "Toplam tahsis tutarı tahsilat tutarını aşıyor!",
    );
    expect(first(settlementErrorKeys("SETTLEMENT_NOT_FOUND", "PAYMENT"))).toBe(
      "Ödeme bilgileri alınamadı.",
    );
    expect(first(settlementErrorKeys("SETTLEMENT_NOT_FOUND", "COLLECTION"))).toBe(
      "Tahsilat bilgileri alınamadı.",
    );
    expect(first(settlementErrorKeys("ALLOCATION_TARGET_INVALID", "COLLECTION", "CLOSED"))).toBe(
      "Bu fatura için tahsis edilebilecek tutar kalmadı.",
    );
    expect(first(settlementErrorKeys("ALLOCATION_TARGET_INVALID", "COLLECTION", "CURRENCY"))).toBe(
      "Bu faturanın para birimi seçilen tahsilat para birimi ile aynı değil.",
    );
    expect(first(settlementErrorKeys("ALLOCATION_TARGET_INVALID", "PAYMENT", "CURRENCY"))).toBe(
      "Bu faturanın para birimi seçilen ödeme para birimi ile aynı değil.",
    );
    // Sunucu iletisi kalanlar (§3.12 "sunucu iletisi"): anahtar yok.
    expect(first(settlementErrorKeys("ALLOCATION_TARGET_INVALID", "PAYMENT", "SIDE"))).toBeNull();
    expect(first(settlementErrorKeys("CORRECTION_TARGET_INVALID", "PAYMENT"))).toBeNull();
    expect(first(settlementErrorKeys("REVERSE_BEFORE_SETTLEMENT", "PAYMENT"))).toBeNull();
  });
});

describe("eksik fatura", () => {
  it("metinler: PAYABLE cari alacağı, RECEIVABLE cari borcu (kullanıcı örneği 150/100 → 50)", () => {
    expect(invoiceGapText(gap(), fmt, t)).toBe(
      "Cari alacağı 150.00 TRY, girilen fatura 100.00 TRY: kalan 50.00 TRY için fatura bilgisi eksik.",
    );
    expect(invoiceGapText(gap({ side: "RECEIVABLE" }), fmt, t)).toBe(
      "Cari borcu 150.00 TRY, kesilen fatura 100.00 TRY: kalan 50.00 TRY için fatura bilgisi eksik.",
    );
  });

  it("tolerans 1 birim", () => {
    expect(isMissing({ missing: 1 })).toBe(false);
    expect(isMissing({ missing: 1.01 })).toBe(true);
    expect(isMissing({ missing: -50 })).toBe(false);
  });

  const rows = [
    gap({ companyId: "A", ledgerTotal: 100, invoiceTotal: 100, missing: 0 }),
    gap({ companyId: "B", ledgerTotal: 50, invoiceTotal: 0, missing: 50 }),
    gap({ companyId: null, ledgerTotal: 150, invoiceTotal: 100, missing: 50 }),
    gap({ companyId: "B", currency: "USD", missing: 0.5 }),
    gap({ accountId: "other", companyId: "B", missing: 7 }),
  ];

  it("gapsForCompany: şirket satırı; konsolide null satırı; null yoksa şirketler toplanır", () => {
    expect(gapsForCompany(rows, "B", { accountId: "acc" }).map((g) => g.missing)).toEqual([50]);
    expect(gapsForCompany(rows, "A", { accountId: "acc" })).toEqual([]);
    expect(gapsForCompany(rows, null, { accountId: "acc" })).toEqual([rows[2]]);
    const companyOnly = [
      gap({ companyId: "A", ledgerTotal: 100, invoiceTotal: 90, missing: 10 }),
      gap({ companyId: "B", ledgerTotal: 50, invoiceTotal: 0, missing: 50 }),
    ];
    expect(gapsForCompany(companyOnly, null)).toEqual([
      gap({ companyId: null, ledgerTotal: 150, invoiceTotal: 90, missing: 60 }),
    ]);
    expect(gapsForCompany(undefined, null)).toEqual([]);
    expect(gapsForCompany(rows, null, { side: "RECEIVABLE" })).toEqual([]);
    expect(gapsForCompany(rows, "B", { currency: "USD" })).toEqual([]);
  });

  it("displayGaps: şirket seçili → o şirket; konsolide çok şirket → şirket başına; tek şirket → konsolide", () => {
    expect(displayGaps(rows, "B", true, { accountId: "acc" }).map((g) => g.companyId)).toEqual([
      "B",
    ]);
    expect(displayGaps(rows, null, true, { accountId: "acc" }).map((g) => g.companyId)).toEqual([
      "B",
    ]);
    expect(displayGaps(rows, null, false, { accountId: "acc" })).toEqual([rows[2]]);
    expect(displayGaps([rows[2]], null, true)).toEqual([rows[2]]);
    expect(displayGaps(null, null, true)).toEqual([]);
  });

  it("missingByAccount: para birimi başına toplam, iki taraf toplanır, yalnız > 1", () => {
    const map = missingByAccount([
      gap({ missing: 50 }),
      gap({ side: "RECEIVABLE", missing: 10.25 }),
      gap({ currency: "USD", missing: 3 }),
      gap({ accountId: "x", missing: 1 }),
    ]);
    expect(map.get("acc")).toEqual([
      { currency: "TRY", amount: 60.25 },
      { currency: "USD", amount: 3 },
    ]);
    expect(map.has("x")).toBe(false);
  });
});

describe("ödeme penceresi bağlantısı (OK-12.2-22)", () => {
  it("yol üretir ve geri ayrıştırır", () => {
    const path = newSettlementPath({ type: "PAYMENT", method: "CASH", fundAccountId: "f 1" });
    expect(path).toBe("/finance/settlements?new=PAYMENT&method=CASH&fundAccountId=f+1");
    const params = new URL(path, "http://x").searchParams;
    expect(parseNewSettlement(params)).toEqual({
      type: "PAYMENT",
      method: "CASH",
      fundAccountId: "f 1",
    });
    expect(newSettlementPath({ type: "COLLECTION", method: "BANK" })).toBe(
      "/finance/settlements?new=COLLECTION&method=BANK",
    );
  });

  it("geçersiz tür ya da yöntem → null; yöntem yoksa BANK", () => {
    expect(parseNewSettlement(new URLSearchParams(""))).toBeNull();
    expect(parseNewSettlement(new URLSearchParams("new=X"))).toBeNull();
    expect(parseNewSettlement(new URLSearchParams("new=PAYMENT&method=CARD"))).toBeNull();
    expect(parseNewSettlement(new URLSearchParams("new=COLLECTION"))).toEqual({
      type: "COLLECTION",
      method: "BANK",
    });
  });
});
