import { describe, expect, it } from "vitest";
import type { FundDetail } from "../../../../pages/finance/types";
import {
  ZTO_BANKS,
  bankOptions,
  createFundBody,
  emptyFundForm,
  fundErrorField,
  fundFormFrom,
  fundFormSchema,
  isMasked,
  needsOpeningRate,
  normalizeAccountNo,
  normalizeIban,
  openingAmount,
  openingChanged,
  openingRateValue,
  updateFundBody,
  validTrIban,
  type FundFormValues,
} from "./fundFormLogic";

const MESSAGES = {
  required: "zorunlu",
  selectRequired: "seçiniz",
  ibanInvalid: "iban",
  numberInvalid: "sayı",
  tooLong: (max: number) => `en çok ${max}`,
};

function detail(overrides: Partial<FundDetail> = {}): FundDetail {
  return {
    id: "f1",
    code: "ZRT-1",
    name: "Ziraat Vadesiz",
    kind: "BANK",
    currency: "TRY",
    branchId: "b1",
    companyId: "c1",
    bankName: "Eski Banka A.Ş.",
    iban: "TR330006100519786457841326",
    allowNegative: false,
    balance: 1000,
    accountType: "DEMAND",
    accountNo: "12345678",
    bankBranchName: "Merkez",
    description: "not",
    active: true,
    currentBalance: 900,
    futureCount: 0,
    futureNet: 0,
    openingBalance: 500,
    openingDate: "2026-01-01",
    transactionCount: 1,
    createdBy: "a@x",
    createdAt: "2026-01-01T10:00:00Z",
    updatedBy: "a@x",
    updatedAt: "2026-01-02T10:00:00Z",
    updateCount: 1,
    lastTransactionDate: "2026-02-01",
    ...overrides,
  };
}

const filled = (overrides: Partial<FundFormValues> = {}): FundFormValues => ({
  ...emptyFundForm("2026-11-14"),
  bankName: "Akbank T.A.Ş.",
  code: " AKB-1 ",
  name: " Akbank Vadesiz ",
  currency: "TRY",
  branchId: "b1",
  iban: "TR33 0006 1005 1978 6457 8413 26",
  accountNo: "0012 3456",
  bankBranchName: " Kadıköy ",
  openingBalance: "-12.345",
  ...overrides,
});

describe("fundFormLogic", () => {
  it("ZTO banka listesi sırası; kayıtlı değer listede yoksa en üstte", () => {
    expect(ZTO_BANKS).toHaveLength(32);
    expect(ZTO_BANKS[0]).toBe("Türkiye Vakıflar Bankası T.A.O.");
    expect(ZTO_BANKS.at(-1)).toBe("Diğer");
    expect(bankOptions("Eski Banka A.Ş.")[0]).toBe("Eski Banka A.Ş.");
    expect(bankOptions("Akbank T.A.Ş.")).toEqual([...ZTO_BANKS]);
    expect(bankOptions(null)).toHaveLength(32);
  });

  it("IBAN süzgeci ve TR mod-97 doğrulaması", () => {
    expect(normalizeIban("tr33 0006-1005")).toBe("TR3300061005");
    expect(validTrIban("")).toBe(true);
    expect(validTrIban("TR33 0006 1005 1978 6457 8413 26")).toBe(true);
    expect(validTrIban("TR34 0006 1005 1978 6457 8413 26")).toBe(false);
    expect(validTrIban("DE89370400440532013000")).toBe(false);
    expect(normalizeAccountNo(" 12 34 ")).toBe("1234");
    expect(isMasked("****1234")).toBe(true);
    expect(isMasked(null)).toBe(false);
  });

  it("açılış tutarı ve değişiklik", () => {
    expect(openingAmount("12,345")).toBe(12.35);
    expect(openingAmount("abc")).toBe(0);
    const saved = detail();
    expect(openingChanged(fundFormFrom(saved, "2026-11-14"), saved)).toBe(false);
    expect(openingChanged({ ...fundFormFrom(saved, "x"), openingBalance: "600" }, saved)).toBe(
      true,
    );
    expect(openingChanged({ ...fundFormFrom(saved, "x"), openingDate: "2026-02-01" }, saved)).toBe(
      true,
    );
    expect(
      fundFormFrom(detail({ openingDate: null, bankName: null, iban: null }), "2026-11-14"),
    ).toMatchObject({
      openingDate: "2026-11-14",
      bankName: "",
      iban: "",
      active: "true",
    });
    expect(
      fundFormFrom(
        detail({ active: false, accountNo: null, bankBranchName: null, description: null }),
        "d",
      ).active,
    ).toBe("false");
  });

  it("şema: banka seçimi yalnız BANK'ta zorunlu; IBAN ve tutar denetimi", () => {
    const bank = fundFormSchema("BANK", MESSAGES);
    const cash = fundFormSchema("CASH", MESSAGES);
    expect(bank.safeParse(filled()).success).toBe(true);
    const errors = bank.safeParse(
      filled({ bankName: "", iban: "TR00", openingBalance: "x", code: " " }),
    );
    expect(errors.success).toBe(false);
    const messages = errors.error?.issues.map((i) => `${i.path.join(".")}:${i.message}`) ?? [];
    expect(messages).toEqual(
      expect.arrayContaining([
        "bankName:seçiniz",
        "iban:iban",
        "openingBalance:sayı",
        "code:zorunlu",
      ]),
    );
    expect(cash.safeParse(filled({ bankName: "", iban: "" })).success).toBe(true);
    expect(bank.safeParse(filled({ openingBalance: " " })).success).toBe(false);
    expect(bank.safeParse(filled({ code: "x".repeat(51) })).error?.issues[0].message).toBe(
      "en çok 50",
    );
  });

  it("yeni gövde: Vadesiz, kırpılmış, IBAN/hesap no normalize; kasada banka alanları yok", () => {
    expect(createFundBody(filled(), "BANK")).toEqual({
      code: "AKB-1",
      name: "Akbank Vadesiz",
      kind: "BANK",
      currency: "TRY",
      branchId: "b1",
      bankName: "Akbank T.A.Ş.",
      iban: "TR330006100519786457841326",
      allowNegative: false,
      accountType: "DEMAND",
      accountNo: "00123456",
      bankBranchName: "Kadıköy",
      description: undefined,
      active: true,
      openingBalance: -12.35,
      openingDate: "2026-11-14",
    });
    expect(createFundBody(filled({ active: "false" }), "CASH")).toMatchObject({
      kind: "CASH",
      bankName: undefined,
      iban: undefined,
      accountNo: undefined,
      bankBranchName: undefined,
      active: false,
    });
  });

  it("güncelleme gövdesi: açılış yalnız değişince, maskeli hesap no gönderilmez", () => {
    const saved = detail();
    const same = updateFundBody(fundFormFrom(saved, "x"), saved, "BANK");
    expect(same).toMatchObject({
      openingBalance: null,
      openingDate: undefined,
      accountNo: "12345678",
    });
    const changed = updateFundBody(
      { ...fundFormFrom(saved, "x"), openingBalance: "700" },
      saved,
      "BANK",
    );
    expect(changed).toMatchObject({ openingBalance: 700, openingDate: "2026-01-01" });
    const masked = detail({ accountNo: "****5678" });
    expect(updateFundBody(fundFormFrom(masked, "x"), masked, "BANK").accountNo).toBeUndefined();
    expect(
      updateFundBody({ ...fundFormFrom(masked, "x"), accountNo: "999" }, masked, "BANK").accountNo,
    ).toBe("999");
    expect(updateFundBody(fundFormFrom(saved, "x"), saved, "CASH")).toMatchObject({
      bankName: undefined,
      iban: undefined,
      accountNo: undefined,
      bankBranchName: undefined,
    });
  });

  it("eksik kayıtlı değerler: açılış ve hesap no yoksa", () => {
    const bare = detail({ openingBalance: undefined as never, openingDate: null, accountNo: null });
    const values = { ...fundFormFrom(bare, "2026-11-14"), openingBalance: "0", openingDate: "" };
    expect(openingChanged(values, bare)).toBe(false);
    expect(updateFundBody({ ...values, accountNo: "" }, bare, "BANK").accountNo).toBeUndefined();
  });

  it("döviz açılış kuru (OK-12.2-37): yalnız TRY dışı ve açılış ≠ 0 iken gövdeye girer", () => {
    expect(needsOpeningRate({ currency: "USD", openingBalance: "100" })).toBe(true);
    expect(needsOpeningRate({ currency: "USD", openingBalance: "0" })).toBe(false);
    expect(needsOpeningRate({ currency: "TRY", openingBalance: "100" })).toBe(false);
    expect(needsOpeningRate({ currency: "", openingBalance: "100" })).toBe(false);
    expect(openingRateValue(" 35,5 ")).toBe(35.5);
    expect(openingRateValue("")).toBeUndefined();
    expect(openingRateValue("0")).toBeUndefined();
    expect(openingRateValue("x")).toBeUndefined();

    const usd = filled({ currency: "USD", openingBalance: "5000", openingRate: "35" });
    expect(createFundBody(usd, "BANK").openingRate).toBe(35);
    expect(createFundBody({ ...usd, openingRate: "" }, "BANK").openingRate).toBeUndefined();
    expect(createFundBody({ ...usd, currency: "TRY" }, "BANK").openingRate).toBeUndefined();
    expect(fundFormSchema("BANK", MESSAGES).safeParse(usd).success).toBe(true);
    const invalid = fundFormSchema("BANK", MESSAGES).safeParse({ ...usd, openingRate: "-1" });
    expect(invalid.error?.issues.map((i) => `${i.path.join(".")}:${i.message}`)).toEqual([
      "openingRate:sayı",
    ]);

    // Düzenlemede para birimi kayıtlı değerden; kur yalnız açılış değişince gider.
    const saved = detail({ currency: "USD" });
    const form = { ...fundFormFrom(saved, "x"), currency: "", openingRate: "36" };
    expect(form.openingRate).toBe("36");
    expect(fundFormFrom(saved, "x").openingRate).toBe("");
    expect(updateFundBody(form, saved, "BANK").openingRate).toBeUndefined();
    expect(updateFundBody({ ...form, openingBalance: "6000" }, saved, "BANK")).toMatchObject({
      openingBalance: 6000,
      openingRate: 36,
    });
  });

  it("sunucu hata kodu → alan", () => {
    expect(fundErrorField("RATE_MISSING")).toBe("openingRate");
    expect(fundErrorField("FUND_CODE_TAKEN")).toBe("code");
    expect(fundErrorField("INSUFFICIENT_FUNDS")).toBe("openingBalance");
    expect(fundErrorField("IBAN_INVALID")).toBe("iban");
    expect(fundErrorField("FUND_COMPANY_LOCKED")).toBe("branchId");
    expect(fundErrorField("COMPANY_MISMATCH")).toBe("branchId");
    expect(fundErrorField(undefined)).toBeNull();
  });
});
