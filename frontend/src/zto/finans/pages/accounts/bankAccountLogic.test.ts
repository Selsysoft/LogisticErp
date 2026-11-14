import { describe, expect, it } from "vitest";
import type { AccountBankAccount } from "../../../../pages/finance/types";
import {
  BANK_CATEGORIES,
  BANK_KINDS,
  bankBody,
  bankErrorField,
  bankFormFrom,
  bankFormSchema,
  emptyBankForm,
  hasIdentifier,
  lastFour,
  normalizeAccountNumber,
  normalizeIbanInput,
  optional,
  type BankFormValues,
} from "./bankAccountLogic";

const MESSAGES = {
  required: "Lütfen bu alanı doldurun.",
  selectRequired: "Lütfen listeden bir öğe seçin.",
  identifierRequired: "IBAN veya hesap numarası girilmelidir.",
  accountNumberInvalid: "Hesap numarası yalnız harf, rakam ve tire içerebilir.",
  tooLong: (max: number) => `En fazla ${max} karakter girilebilir.`,
};

const issues = (input: BankFormValues) => {
  const result = bankFormSchema(MESSAGES).safeParse(input);
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message]));
};

function form(overrides: Partial<BankFormValues> = {}): BankFormValues {
  return {
    ...emptyBankForm("2026-11-14"),
    bankName: "Ziraat",
    currency: "TRY",
    iban: "TR330006100519786457841326",
    ...overrides,
  };
}

describe("IBAN girdisi ve maske", () => {
  it("büyük harf, yalnız A-Z0-9 (ZTO .iban-input)", () => {
    expect(normalizeIbanInput("tr33 0006-1005.1978 64ı")).toBe("TR3300061005197864I");
    expect(normalizeIbanInput("")).toBe("");
  });

  it("maskeli IBAN'ın son dört hanesi (okuma metni)", () => {
    expect(lastFour("TR33 **** 1326")).toBe("1326");
    expect(lastFour("****12")).toBe("12");
    expect(lastFour(null)).toBe("");
  });

  it("ikisinden biri kuralı", () => {
    expect(hasIdentifier({ iban: "", accountNumber: "" })).toBe(false);
    expect(hasIdentifier({ iban: " ", accountNumber: "123" })).toBe(true);
    expect(hasIdentifier({ iban: "TR1" })).toBe(true);
    expect(hasIdentifier({})).toBe(false);
  });
});

describe("form şeması", () => {
  it("varsayılanlar BAA: Vadesiz, Yan Hesap, bugün", () => {
    expect(emptyBankForm("2026-11-14")).toMatchObject({
      accountKind: "DEMAND",
      category: "SUB",
      openedOn: "2026-11-14",
      currency: "",
    });
    expect(BANK_KINDS).toEqual(["TIME", "DEMAND", "SAVINGS", "CORPORATE"]);
    expect(BANK_CATEGORIES).toEqual(["MAIN", "SUB"]);
  });

  it("geçerli form; zorunlular ve ikisinden biri hatası IBAN altında", () => {
    expect(issues(form())).toEqual({});
    expect(issues(form({ iban: "", accountNumber: "12345" }))).toEqual({});
    expect(
      issues(form({ bankName: " ", currency: "", category: "", iban: "", accountNumber: "" })),
    ).toEqual({
      bankName: MESSAGES.required,
      currency: MESSAGES.selectRequired,
      category: MESSAGES.selectRequired,
      iban: MESSAGES.identifierRequired,
    });
    expect(issues(form({ description: "x".repeat(501) }))).toEqual({
      description: MESSAGES.tooLong(500),
    });
  });

  it("gövde: isteğe bağlılar boşsa yok, IBAN normalize, tür boşsa yok", () => {
    expect(
      bankBody(
        form({ iban: "tr33 0006 1005 1978 6457 8413 26", accountKind: "", branchName: " " }),
      ),
    ).toEqual({
      bankName: "Ziraat",
      branchName: undefined,
      accountNumber: undefined,
      iban: "TR330006100519786457841326",
      holderName: undefined,
      currency: "TRY",
      accountKind: undefined,
      category: "SUB",
      openedOn: "2026-11-14",
      description: undefined,
    });
    expect(optional("  a ")).toBe("a");
    expect(optional(null)).toBeUndefined();
  });

  it("hesap no: sunucu kuralı ^[A-Za-z0-9-]*$; boşluklar atılır", () => {
    expect(issues(form({ accountNumber: "123/45" }))).toEqual({
      accountNumber: MESSAGES.accountNumberInvalid,
    });
    expect(issues(form({ iban: "", accountNumber: "0012 3456 7890" }))).toEqual({});
    expect(bankBody(form({ iban: "", accountNumber: "0012 3456 7890" })).accountNumber).toBe(
      "001234567890",
    );
    expect(issues(form({ accountNumber: "AB-12" }))).toEqual({});
    expect(normalizeAccountNumber(" 12 3	4 ")).toBe("1234");
  });

  it("mevcut hesaptan form değerleri", () => {
    const bank = {
      bankName: "Ziraat",
      branchName: null,
      accountNumber: "123",
      iban: null,
      holderName: "Ali",
      accountKind: "TIME",
      currency: "USD",
      category: "MAIN",
      openedOn: null,
      description: null,
    } as unknown as AccountBankAccount;
    expect(bankFormFrom(bank)).toEqual({
      bankName: "Ziraat",
      branchName: "",
      accountNumber: "123",
      iban: "",
      holderName: "Ali",
      accountKind: "TIME",
      currency: "USD",
      category: "MAIN",
      openedOn: "",
      description: "",
    });
    expect(
      bankFormFrom({ ...bank, accountKind: "X", category: "Y" } as AccountBankAccount),
    ).toMatchObject({ accountKind: "", category: "" });
  });

  it("sunucu hata kodu → IBAN alanı", () => {
    expect(bankErrorField("IBAN_TAKEN")).toBe("iban");
    expect(bankErrorField("IBAN_INVALID")).toBe("iban");
    expect(bankErrorField("BANK_ACCOUNT_IDENTIFIER_REQUIRED")).toBe("iban");
    expect(bankErrorField("BRANCH_OUT_OF_SCOPE")).toBeNull();
    expect(bankErrorField(undefined)).toBeNull();
  });
});
