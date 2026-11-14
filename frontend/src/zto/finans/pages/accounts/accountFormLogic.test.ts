import { describe, expect, it } from "vitest";
import type { Account, AccountBankAccount, AccountGroup } from "../../../../pages/finance/types";
import {
  accountErrorField,
  accountFormFrom,
  accountFormSchema,
  bankErrorRow,
  bankRowFrom,
  createBody,
  digitsOnly,
  emptyAccountForm,
  emptyBankRow,
  groupChange,
  hasShortIban,
  historyText,
  isEmptyBankRow,
  limitsChange,
  parseLimit,
  profileBody,
  recordDate,
  selectableGroups,
  taxRequired,
  typeOfGroup,
  type AccountFormValues,
} from "./accountFormLogic";

const MESSAGES = {
  required: "Lütfen bu alanı doldurun.",
  selectRequired: "Lütfen listeden bir öğe seçin.",
  taxRequired: "TC/Vergi No alanı boş geçilemez. Lütfen TC/Vergi No bilgisini giriniz.",
  tooLong: (max: number) => `En fazla ${max} karakter girilebilir.`,
  invalidNumber: "Geçerli bir sayı giriniz (0 veya üzeri).",
  ibanShort: "IBAN alanları en az 16 karakter olmalıdır.",
  accountNumberInvalid: "Hesap numarası yalnız harf, rakam ve tire içerebilir.",
  emailInvalid: "Geçerli bir e-posta adresi giriniz.",
};

const TODAY = "2026-11-14";

function group(
  code: string,
  accountType: AccountGroup["accountType"],
  extra: Partial<AccountGroup> = {},
) {
  return {
    code,
    accountType,
    name: code,
    reportType: null,
    codePrefix: code.slice(0, 3),
    sortOrder: 10,
    typeDefault: false,
    selectable: true,
    active: true,
    ...extra,
  } satisfies AccountGroup;
}

const GROUPS: AccountGroup[] = [
  group("GENEL", "SUPPLIER", { name: "Tedarikçi", sortOrder: 30 }),
  group("MUSTERI", "CUSTOMER", { name: "Müşteri", sortOrder: 10 }),
  group("SURUCU", "EMPLOYEE", { name: "Personel (Sürücü)", sortOrder: 100 }),
  group("ADAY", "LEAD", { selectable: false, sortOrder: 130 }),
  group("ESKI", "SUPPLIER", { active: false, sortOrder: 200 }),
  group("YEDEK_PARCA_SERVIS", "SUPPLIER", { name: "Yedek Parça", sortOrder: 40 }),
];

function values(overrides: Partial<AccountFormValues> = {}): AccountFormValues {
  return {
    ...emptyAccountForm(TODAY, "Türkiye"),
    subGroup: "GENEL",
    branchId: "b1",
    name: "Ankara Lastik",
    ...overrides,
  };
}

function bank(overrides: Partial<AccountBankAccount> = {}): AccountBankAccount {
  return {
    id: "bk1",
    accountId: "a1",
    accountCode: "TED-000001",
    accountName: "Ankara Lastik",
    accountType: "SUPPLIER",
    bankName: "Ziraat",
    branchName: null,
    accountNumber: null,
    accountNumberMasked: null,
    iban: "TR330006100519786457841326",
    ibanMasked: "TR33 **** 1326",
    holderName: "Ankara Lastik",
    currency: "TRY",
    accountKind: "DEMAND",
    category: "SUB",
    openedOn: "2026-01-01",
    lastTransactionOn: null,
    description: null,
    active: true,
    createdBy: "x",
    createdAt: "2026-01-01T00:00:00Z",
    updatedBy: "x",
    updatedAt: "2026-01-01T00:00:00Z",
    updateCount: 0,
    ...overrides,
  };
}

const issues = (mode: "add" | "edit", input: AccountFormValues) => {
  const result = accountFormSchema(mode, MESSAGES).safeParse(input);
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path.join("."), i.message]));
};

describe("zod şeması (ZTO iletileri)", () => {
  it("geçerli Add formu", () => {
    expect(issues("add", values())).toEqual({});
  });

  it("zorunlu alanlar: grup, iş yeri, ad, para birimi; Edit'te kod", () => {
    const empty = { ...values(), subGroup: "", branchId: "", name: "  ", defaultCurrency: "" };
    expect(issues("add", empty)).toEqual({
      subGroup: MESSAGES.selectRequired,
      branchId: MESSAGES.selectRequired,
      name: MESSAGES.required,
      defaultCurrency: MESSAGES.selectRequired,
    });
    expect(issues("edit", values({ code: "" }))).toEqual({ code: MESSAGES.required });
    expect(issues("add", values({ code: "" }))).toEqual({});
  });

  it("vergi no yıldızı YPS/AKY; yalnız Add'de istemci uyarısı", () => {
    expect(taxRequired("YEDEK_PARCA_SERVIS")).toBe(true);
    expect(taxRequired("AKARYAKIT")).toBe(true);
    expect(taxRequired("GENEL")).toBe(false);
    expect(issues("add", values({ subGroup: "AKARYAKIT" }))).toEqual({
      taxNumber: MESSAGES.taxRequired,
    });
    expect(issues("add", values({ subGroup: "AKARYAKIT", taxNumber: "1234567890" }))).toEqual({});
    expect(issues("edit", values({ subGroup: "AKARYAKIT", code: "AKY-1" }))).toEqual({});
  });

  it("uzunluk ve limit sayıları", () => {
    expect(issues("add", values({ name: "x".repeat(201) }))).toEqual({
      name: MESSAGES.tooLong(200),
    });
    expect(issues("add", values({ creditLimit: "-1", riskLimit: "abc" }))).toEqual({
      creditLimit: MESSAGES.invalidNumber,
      riskLimit: MESSAGES.invalidNumber,
    });
    expect(parseLimit("")).toBeUndefined();
    expect(parseLimit("1.234,50")).toBe(1234.5);
    expect(parseLimit("12.5")).toBe(12.5);
    expect(parseLimit("-3")).toBeNull();
  });

  it("e-posta: boş geçerli, biçimsiz değer reddedilir (sunucu @Email)", () => {
    expect(issues("add", values({ email: "" }))).toEqual({});
    expect(issues("add", values({ email: " info@ornek.com.tr " }))).toEqual({});
    expect(issues("add", values({ email: "abc" }))).toEqual({ email: MESSAGES.emailInvalid });
  });

  it("banka satırı hesap no: harf/rakam/tire; boşluklar atılarak gönderilir", () => {
    const row = (accountNumber: string) => ({
      ...emptyBankRow(TODAY),
      bankName: "Ziraat",
      accountNumber,
    });
    expect(issues("add", values({ bankAccounts: [row("123/45")] }))).toEqual({
      "bankAccounts.0.accountNumber": MESSAGES.accountNumberInvalid,
    });
    expect(issues("add", values({ bankAccounts: [row("0012 3456 7890")] }))).toEqual({});
    const body = createBody(values({ bankAccounts: [row("0012 3456 7890")] }), "SUPPLIER");
    expect(body.bankAccounts?.[0].accountNumber).toBe("001234567890");
    const edit = profileBody(values({ code: "T", bankAccounts: [row("12-AB 9")] }), "SUPPLIER", []);
    expect(edit.bankAccounts?.[0].accountNumber).toBe("12-AB9");
  });

  it("banka satırı: boş satır atlanır, dolu satırda Banka Adı, 1–15 karakter IBAN uyarısı", () => {
    const row = emptyBankRow(TODAY);
    expect(row).toMatchObject({ accountKind: "DEMAND", category: "SUB", openedOn: TODAY });
    expect(isEmptyBankRow(row)).toBe(true);
    expect(issues("add", values({ bankAccounts: [row] }))).toEqual({});
    expect(issues("add", values({ bankAccounts: [{ ...row, iban: "TR12 3456" }] }))).toEqual({
      "bankAccounts.0.bankName": MESSAGES.required,
      "bankAccounts.0.iban": MESSAGES.ibanShort,
    });
    expect(
      issues(
        "add",
        values({
          bankAccounts: [{ ...row, bankName: "Ziraat", iban: "TR330006100519786457841326" }],
        }),
      ),
    ).toEqual({});
    expect(hasShortIban([{ iban: "TR12" }, { iban: "" }])).toBe(true);
    expect(hasShortIban([{ iban: "" }, { iban: "TR330006100519786457841326" }])).toBe(false);
  });
});

describe("gruplar", () => {
  it("formda selectable && active; EMPLOYEE yalnız izinle; mevcut grup korunur", () => {
    expect(selectableGroups(GROUPS, false).map((g) => g.code)).toEqual([
      "MUSTERI",
      "GENEL",
      "YEDEK_PARCA_SERVIS",
    ]);
    expect(selectableGroups(GROUPS, true).map((g) => g.code)).toContain("SURUCU");
    expect(selectableGroups(GROUPS, false, "ADAY").map((g) => g.code)).toContain("ADAY");
    expect(typeOfGroup(GROUPS, "MUSTERI")).toBe("CUSTOMER");
    expect(typeOfGroup(GROUPS, "YOK")).toBeUndefined();
  });

  it("tür değişince bilgi kutusu ('eski' → 'yeni')", () => {
    expect(groupChange(GROUPS, "GENEL", "GENEL")).toBeNull();
    expect(groupChange(GROUPS, "", "GENEL")).toBeNull();
    expect(groupChange(GROUPS, "GENEL", "MUSTERI")).toEqual({ from: "Tedarikçi", to: "Müşteri" });
    expect(groupChange(GROUPS, "GENEL", "BILINMEYEN")).toEqual({
      from: "Tedarikçi",
      to: "BILINMEYEN",
    });
  });
});

describe("gövdeler", () => {
  it("Add gövdesi: boş banka satırı gönderilmez, IBAN normalize, kart para birimi yedek", () => {
    const body = createBody(
      values({
        phone: " 0532 ",
        companyType: "CORPORATE",
        creditLimit: "1000",
        riskLimit: "",
        bankAccounts: [
          emptyBankRow(TODAY),
          {
            ...emptyBankRow(TODAY),
            bankName: "Ziraat",
            iban: "tr33 0006 1005 1978 6457 8413 26",
          },
        ],
      }),
      "SUPPLIER",
    );
    expect(body).toMatchObject({
      name: "Ankara Lastik",
      type: "SUPPLIER",
      subGroup: "GENEL",
      branchId: "b1",
      phone: "0532",
      companyType: "CORPORATE",
      creditLimit: 1000,
      defaultCurrency: "TRY",
      country: "Türkiye",
    });
    expect(body.riskLimit).toBeUndefined();
    expect(body.code).toBeUndefined();
    expect(body.taxNumber).toBeUndefined();
    expect(body.companyId).toBeUndefined();
    expect(body.bankAccounts).toEqual([
      {
        bankName: "Ziraat",
        branchName: undefined,
        accountNumber: undefined,
        iban: "TR330006100519786457841326",
        holderName: undefined,
        currency: "TRY",
        accountKind: "DEMAND",
        category: "SUB",
        openedOn: TODAY,
        description: undefined,
      },
    ]);
  });

  it("Edit gövdesi: deactivatedBankAccountIds kaldırılan ve boşaltılan mevcut satırlar", () => {
    const kept = bankRowFrom(bank({ id: "k" }));
    const emptied = {
      ...bankRowFrom(bank({ id: "e" })),
      bankName: "",
      iban: "",
      accountNumber: "",
    };
    const added = {
      ...emptyBankRow(TODAY),
      bankName: "Vakıf",
      accountNumber: "123",
      currency: "USD",
    };
    const body = profileBody(
      values({ code: " TED-1 ", bankAccounts: [kept, emptied, added] }),
      "SUPPLIER",
      ["k", "e", "removed"],
    );
    expect(body.code).toBe("TED-1");
    expect(body.subGroup).toBe("GENEL");
    expect(body.deactivatedBankAccountIds).toEqual(["e", "removed"]);
    // Profil PUT'u (AccountProfileRequest) limit almaz; limitler PUT /limits ile (limitsChange).
    expect(body).not.toHaveProperty("creditLimit");
    expect(body).not.toHaveProperty("riskLimit");
    expect(body.bankAccounts?.map((b) => [b.id, b.bankName, b.currency])).toEqual([
      ["k", "Ziraat", "TRY"],
      [undefined, "Vakıf", "USD"],
    ]);
  });

  it("limitsChange: değişmezse null; değişince kart limiti (companyId null); boş alan → null", () => {
    const account = { creditLimit: 0, riskLimit: 0 } as unknown as Account;
    expect(limitsChange(values({ creditLimit: "0", riskLimit: "0" }), account)).toBeNull();
    expect(limitsChange(values({ creditLimit: "0.00", riskLimit: "0,00" }), account)).toBeNull();
    expect(limitsChange(values({ creditLimit: "50000", riskLimit: "0" }), account)).toEqual({
      companyId: null,
      creditLimit: 50000,
      riskLimit: 0,
    });
    expect(limitsChange(values({ creditLimit: "", riskLimit: "0" }), account)).toEqual({
      companyId: null,
      creditLimit: null,
      riskLimit: 0,
    });
    const unset = { creditLimit: null, riskLimit: null } as unknown as Account;
    expect(limitsChange(values({ creditLimit: "", riskLimit: "" }), unset)).toBeNull();
    expect(limitsChange(values({ creditLimit: "1.234,50", riskLimit: "" }), unset)).toEqual({
      companyId: null,
      creditLimit: 1234.5,
      riskLimit: null,
    });
  });

  it("accountFormFrom: mevcut kart ve aktif banka satırları; ülke boşsa varsayılan", () => {
    const account = {
      id: "a1",
      code: "TED-1",
      name: "X",
      type: "SUPPLIER",
      taxNumber: "*******1234",
      taxNumberMasked: true,
      branchId: null,
      companyId: "c1",
      subGroup: "GENEL",
      defaultCurrency: null,
      creditLimit: 5,
      riskLimit: null,
      companyType: "INDIVIDUAL",
      country: " ",
    } as unknown as Account;
    const form = accountFormFrom(account, [bank(), bank({ id: "p", active: false })], "Türkiye");
    expect(form).toMatchObject({
      code: "TED-1",
      branchId: "",
      companyId: "c1",
      taxNumber: "*******1234",
      defaultCurrency: "TRY",
      creditLimit: "5",
      riskLimit: "",
      companyType: "INDIVIDUAL",
      country: "Türkiye",
      phone: "",
    });
    expect(form.bankAccounts.map((r) => r.id)).toEqual(["bk1"]);
    expect(bankRowFrom(bank({ accountKind: "", category: "" }))).toMatchObject({
      accountKind: "DEMAND",
      category: "SUB",
      iban: "TR330006100519786457841326",
      branchName: "",
    });
  });
});

describe("yardımcılar", () => {
  it("digitsOnly, recordDate, historyText", () => {
    expect(digitsOnly("12a 34-5")).toBe("12345");
    expect(recordDate(null)).toBe("-");
    expect(recordDate("2026-03-04T08:05:00")).toBe("04.03.2026 08:05");
    expect(
      historyText(
        [
          {
            at: "2026-03-04T08:05:00",
            actorEmail: "ayse@acme.com",
            event: "ACCOUNT_UPDATED",
            details: null,
          },
          { at: "2026-03-01T09:00:00", actorEmail: null, event: "ACCOUNT_CREATED", details: "x" },
        ],
        (e) => (e === "ACCOUNT_UPDATED" ? "Cari kart güncellendi" : e),
      ),
    ).toBe(
      "04.03.2026 08:05 ayse@acme.com: Cari kart güncellendi\n01.03.2026 09:00 -: ACCOUNT_CREATED",
    );
    expect(historyText([], (e) => e)).toBe("");
  });

  it("sunucu hata kodu → alan; banka hatası satırı", () => {
    expect(accountErrorField("ACCOUNT_CODE_TAKEN")).toBe("code");
    expect(accountErrorField("ACCOUNT_CODE_EXHAUSTED")).toBe("code");
    expect(accountErrorField("TAX_NUMBER_REQUIRED")).toBe("taxNumber");
    expect(accountErrorField("TAX_NUMBER_INVALID")).toBe("taxNumber");
    expect(accountErrorField("ACCOUNT_TYPE_LOCKED")).toBe("subGroup");
    expect(accountErrorField("ACCOUNT_GROUP_INVALID")).toBe("subGroup");
    expect(accountErrorField("ACCOUNT_TYPE_RESERVED")).toBe("subGroup");
    expect(accountErrorField("IBAN_TAKEN")).toBe("bank");
    expect(accountErrorField("IBAN_INVALID")).toBe("bank");
    expect(accountErrorField("BANK_ACCOUNT_IDENTIFIER_REQUIRED")).toBe("bank");
    expect(accountErrorField("ACCOUNT_COMPANY_LOCKED")).toBeNull();
    expect(accountErrorField(undefined)).toBeNull();
    const row = emptyBankRow(TODAY);
    expect(bankErrorRow([row, { ...row, bankName: "A" }, { ...row, iban: "TR1" }])).toBe(2);
    expect(bankErrorRow([row, { ...row, bankName: "A" }])).toBe(1);
    expect(bankErrorRow([row])).toBe(0);
  });
});
