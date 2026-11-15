import { describe, expect, it } from "vitest";
import {
  BANK_SENTENCE,
  EDIT_METHODS,
  PAY_METHODS,
  addDaysIso,
  allocationBody,
  amountText,
  apiErrorInfo,
  apiErrorReason,
  applyBankSentence,
  bankAccountLabel,
  calculationText,
  collectionBody,
  correctionBody,
  correctionOriginalOf,
  correctionRate,
  currencyLabel,
  dottedDate,
  dropStaleRate,
  emptyForm,
  endorsableLabel,
  errorOf,
  exchangeRateOf,
  fieldElementId,
  formFromDetail,
  formatDecimalInput,
  fundKindOf,
  fundLabel,
  inputAmount,
  isBankLike,
  isPayMethod,
  isPositiveAmount,
  isValidCheckNumber,
  lockReasonErrorCode,
  lockReasonErrorKey,
  methodOptions,
  modalIds,
  payMethodOf,
  paymentBody,
  presetForm,
  previewBody,
  rateText,
  settlementBody,
  slashDate,
  todayIso,
  validateCollection,
  validatePayment,
  withAccount,
  withBranch,
  withCurrency,
  withMethod,
  type SettlementFormValues,
} from "./settlementFormLogic";

const TODAY = "2026-11-15";

function form(patch: Partial<SettlementFormValues> = {}): SettlementFormValues {
  return {
    ...emptyForm(TODAY),
    accountId: "a1",
    branchId: "b1",
    method: "CASH",
    amount: "1500,25",
    fundAccountId: "f1",
    ...patch,
  };
}

const keys = (errors: { key: string }[]) => errors.map((error) => error.key);

describe("yöntem yardımcıları", () => {
  it("ZTO yöntem sırası ve düzenleme alt kümesi; Diğer yok", () => {
    expect(PAY_METHODS).toEqual(["CASH", "BANK", "CHECK", "NOTE", "CREDIT_CARD"]);
    expect(EDIT_METHODS).toEqual(["CASH", "BANK", "CREDIT_CARD"]);
    expect(methodOptions("add")).toBe(PAY_METHODS);
    expect(methodOptions("edit")).toBe(EDIT_METHODS);
    expect(isPayMethod("NOTE")).toBe(true);
    expect(isPayMethod("OTHER")).toBe(false);
    expect(payMethodOf("CREDIT_CARD")).toBe("CREDIT_CARD");
    expect(payMethodOf("OTHER")).toBe("");
    expect(payMethodOf(null)).toBe("");
  });

  it("fon türü ve banka benzeri yöntemler", () => {
    expect(fundKindOf("CASH")).toBe("CASH");
    expect(fundKindOf("BANK")).toBe("BANK");
    expect(fundKindOf("CREDIT_CARD")).toBe("BANK");
    expect(fundKindOf("CHECK")).toBeNull();
    expect(fundKindOf("")).toBeNull();
    expect(isBankLike("CREDIT_CARD")).toBe(true);
    expect(isBankLike("CASH")).toBe(false);
  });
});

describe("tarihler (yerel takvim)", () => {
  it("bugün yerel parçalardan; UTC gece yarısı sınırında kaymaz", () => {
    expect(todayIso(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");
    expect(todayIso(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });

  it("gün ekleme ay/yıl sınırını aşar; geçersiz girdi boş", () => {
    expect(addDaysIso("2026-12-15", 30)).toBe("2027-01-14");
    expect(addDaysIso("2026-02-27", 2)).toBe("2026-03-01");
    expect(addDaysIso("bozuk", 1)).toBe("");
  });

  it("açıklama cümlesi ve liste tarih biçimleri", () => {
    expect(slashDate("2026-11-05")).toBe("05/11/2026");
    expect(slashDate("")).toBe("");
    expect(dottedDate("2026-11-05")).toBe("05.11.2026");
    expect(dottedDate(null)).toBe("-");
  });
});

describe("tutar girişi (ZTO formatDecimalInput)", () => {
  it("rakam ve tek ayırıcı; son ayırıcı ondalık; ondalık kesilir; baştaki sıfır atılır", () => {
    expect(formatDecimalInput("12a3,456")).toBe("123,45");
    expect(formatDecimalInput("1.234,56")).toBe("1234,56");
    expect(formatDecimalInput("1,234.5")).toBe("1234.5");
    expect(formatDecimalInput("05")).toBe("5");
    expect(formatDecimalInput("0,5")).toBe("0,5");
    expect(formatDecimalInput("1.23456", 4)).toBe("1.2345");
    expect(formatDecimalInput("")).toBe("");
  });

  it("API ondalık metni; pozitiflik; önyükleme", () => {
    expect(amountText("12,5")).toBe("12.50");
    expect(amountText("12,")).toBe("12.00");
    expect(amountText(",")).toBe("");
    expect(amountText("abc")).toBe("");
    expect(amountText(null)).toBe("");
    expect(isPositiveAmount("0,00")).toBe(false);
    expect(isPositiveAmount("0,01")).toBe(true);
    expect(isPositiveAmount("")).toBe(false);
    expect(inputAmount("1500.0000")).toBe("1500.00");
    expect(inputAmount("0")).toBe("");
    expect(inputAmount(null)).toBe("");
  });
});

describe("doğrulama — ödeme (ZTO metinleri)", () => {
  it("boş formda temel alanlar sırasıyla", () => {
    expect(keys(validatePayment(emptyForm(TODAY)))).toEqual([
      "account",
      "branch",
      "paymentMethod",
      "amount",
    ]);
    expect(keys(validatePayment({ ...emptyForm(TODAY), date: "" }))).toContain("paymentDate");
  });

  it("nakit kasa, banka/kredi kartı banka ister", () => {
    expect(keys(validatePayment(form({ fundAccountId: "" })))).toEqual(["cash"]);
    expect(keys(validatePayment(form({ method: "BANK", fundAccountId: "" })))).toEqual(["bank"]);
    expect(keys(validatePayment(form({ method: "CREDIT_CARD", fundAccountId: "" })))).toEqual([
      "bank",
    ]);
    expect(validatePayment(form())).toEqual([]);
  });

  it("kendi çek: banka, numara (^\\d{7}$ iki iletiyle), vade", () => {
    const base = form({ method: "CHECK", fundAccountId: "" });
    expect(keys(validatePayment(base))).toEqual(["checkBank", "checkNumberIssued"]);
    const bad = {
      ...base,
      check: { ...base.check, fundAccountId: "f", number: "12a", dueDate: "" },
    };
    expect(keys(validatePayment(bad))).toEqual(["checkDigits", "checkLength", "dueDate"]);
    const short = { ...base, check: { ...base.check, fundAccountId: "f", number: "123456" } };
    expect(keys(validatePayment(short))).toEqual(["checkLength"]);
    const ok = { ...base, check: { ...base.check, fundAccountId: "f", number: "1234567" } };
    expect(validatePayment(ok)).toEqual([]);
    expect(isValidCheckNumber(" 1234567 ")).toBe(true);
    expect(isValidCheckNumber("12345678")).toBe(false);
  });

  it("ciro: çek seçimi; senet: numara ve vade; eşleştirme aşımı", () => {
    const endorse = form({ method: "CHECK" });
    endorse.check = { ...endorse.check, mode: "ENDORSE" };
    expect(keys(validatePayment(endorse))).toEqual(["endorsedCheck"]);
    const note = form({ method: "NOTE" });
    note.note = { ...note.note, dueDate: "" };
    expect(keys(validatePayment(note))).toEqual(["noteNumber", "dueDate"]);
    expect(keys(validatePayment(form(), { allocationExceeded: true }))).toEqual([
      "allocationPayment",
    ]);
  });
});

describe("doğrulama — tahsilat", () => {
  it("temel alanlar, para birimi ve düzenleme kimliği", () => {
    expect(keys(validateCollection({ ...emptyForm(TODAY), currency: "", date: "" }))).toEqual([
      "account",
      "branch",
      "collectionMethod",
      "collectionAmount",
      "collectionDate",
      "collectionCurrency",
    ]);
    expect(keys(validateCollection(form(), { edit: true, editId: null }))).toEqual([
      "collectionId",
    ]);
    expect(validateCollection(form(), { edit: true, editId: "s1" })).toEqual([]);
  });

  it("çek: numara, vade, Bankaya Yatırıldı iken banka; portföyde banka gerekmez", () => {
    const check = form({ method: "CHECK", fundAccountId: "" });
    expect(keys(validateCollection(check))).toEqual(["checkNumber", "checkDepositBank"]);
    const portfolio = {
      ...check,
      check: { ...check.check, status: "PORTFOLIO" as const, number: "7654321" },
    };
    expect(validateCollection(portfolio)).toEqual([]);
  });

  it("senet, nakit, banka, eşleştirme aşımı", () => {
    expect(keys(validateCollection(form({ method: "NOTE" })))).toEqual(["noteNumber"]);
    expect(keys(validateCollection(form({ fundAccountId: "" })))).toEqual(["cash"]);
    expect(keys(validateCollection(form({ method: "BANK", fundAccountId: "" })))).toEqual(["bank"]);
    expect(keys(validateCollection(form(), { allocationExceeded: true }))).toEqual([
      "allocationCollection",
    ]);
    expect(errorOf(validateCollection(form({ fundAccountId: "" })), "fundAccountId")).toBe("cash");
    expect(errorOf([], "amount")).toBeNull();
  });
});

describe("istek gövdesi", () => {
  it("nakit: fon, ortak alanlar, metin tutar; boş açıklama/belge no gönderilmez", () => {
    expect(paymentBody(form({ description: "  ", documentNo: " F-1 " }))).toEqual({
      method: "CASH",
      accountId: "a1",
      branchId: "b1",
      money: { amount: "1500.25", currency: "TRY" },
      date: TODAY,
      description: undefined,
      documentNo: "F-1",
      allocations: undefined,
      fundAccountId: "f1",
    });
  });

  it("banka TRANSFER, kredi kartı CREDIT_CARD; karşı taraf hesabı", () => {
    const bank = paymentBody(form({ method: "BANK", counterpartyBankAccountId: "cb1" }));
    expect(bank).toMatchObject({
      method: "BANK",
      channel: "TRANSFER",
      counterpartyBankAccountId: "cb1",
    });
    expect(paymentBody(form({ method: "CREDIT_CARD" }))).toMatchObject({
      method: "BANK",
      channel: "CREDIT_CARD",
      counterpartyBankAccountId: undefined,
    });
  });

  it("kendi çek, ciro ve senet", () => {
    const own = form({ method: "CHECK" });
    own.check = { ...own.check, number: " 1234567 ", bankName: "Ziraat", fundAccountId: "fb" };
    expect(paymentBody(own).instrument).toEqual({
      kind: "CHECK",
      number: "1234567",
      bankName: "Ziraat",
      dueDate: "2026-12-15",
      fundAccountId: "fb",
    });
    const endorse = form({ method: "CHECK" });
    endorse.check = { ...endorse.check, mode: "ENDORSE", instrumentId: "i1" };
    expect(paymentBody(endorse)).toMatchObject({ method: "CHECK", instrumentId: "i1" });
    expect(paymentBody(endorse).instrument).toBeUndefined();
    const note = form({ method: "NOTE" });
    note.note = { ...note.note, number: "S-9" };
    expect(paymentBody(note)).toMatchObject({
      method: "CHECK",
      instrument: { kind: "NOTE", number: "S-9", bankName: undefined, fundAccountId: undefined },
    });
    expect(paymentBody(form({ method: "" })).method).toBe("CASH");
  });

  it("tahsilat: AT_BANK + banka, Kasaya Al = PORTFOLIO, senet PORTFOLIO, kur yalnız dövizde", () => {
    const atBank = form({ method: "CHECK" });
    atBank.check = { ...atBank.check, number: "1234567", fundAccountId: "fb" };
    expect(collectionBody(atBank).instrument).toMatchObject({
      initialStatus: "AT_BANK",
      fundAccountId: "fb",
    });
    const cashBox = { ...atBank, check: { ...atBank.check, status: "CASH_BOX" as const } };
    expect(collectionBody(cashBox).instrument).toMatchObject({
      initialStatus: "PORTFOLIO",
      fundAccountId: undefined,
    });
    const note = form({ method: "NOTE" });
    note.note = { ...note.note, number: "S", bankName: "İş" };
    expect(collectionBody(note).instrument).toMatchObject({
      kind: "NOTE",
      initialStatus: "PORTFOLIO",
    });
    expect(collectionBody(form({ currency: "USD", exchangeRate: "34,1234" })).exchangeRate).toBe(
      34.1234,
    );
    expect(
      collectionBody(form({ currency: "TRY", exchangeRate: "34" })).exchangeRate,
    ).toBeUndefined();
    expect(collectionBody(form({ method: "BANK" }))).toMatchObject({ channel: "TRANSFER" });
    expect(collectionBody(form({ method: "" })).method).toBe("CASH");
    expect(exchangeRateOf(form({ currency: "EUR", exchangeRate: "" }))).toBeUndefined();
    expect(exchangeRateOf(form({ currency: "EUR", exchangeRate: "0" }))).toBeUndefined();
    expect(settlementBody("PAYMENT", form()).method).toBe("CASH");
    expect(settlementBody("COLLECTION", form()).method).toBe("CASH");
  });

  it("eşleştirme gövdesi yalnız > 0 satırlar, metin tutar", () => {
    expect(
      allocationBody([
        { targetType: "PURCHASE_INVOICE", targetId: "t1", amount: "10,5" },
        { targetType: "PURCHASE_INVOICE", targetId: "t2", amount: "0" },
      ]),
    ).toEqual([{ targetType: "PURCHASE_INVOICE", targetId: "t1", amount: "10.50" }]);
    expect(allocationBody([])).toBeUndefined();
  });

  it("önizleme gövdesi: eksik alanda null; çekte araç yok; açıklama/eşleştirme alınmaz", () => {
    expect(previewBody("PAYMENT", form({ accountId: "" }))).toBeNull();
    expect(previewBody("PAYMENT", form({ fundAccountId: "" }))).toBeNull();
    expect(previewBody("PAYMENT", form({ description: "x" }))).toEqual({
      method: "CASH",
      accountId: "a1",
      branchId: "b1",
      money: { amount: "1500.25", currency: "TRY" },
      date: TODAY,
      fundAccountId: "f1",
    });
    const own = form({ method: "CHECK", fundAccountId: "" });
    own.check = { ...own.check, number: "1234567" };
    const preview = previewBody("PAYMENT", own);
    expect(preview?.instrument).toBeUndefined();
    const endorse = form({ method: "CHECK" });
    endorse.check = { ...endorse.check, mode: "ENDORSE", instrumentId: "i1" };
    expect(previewBody("PAYMENT", endorse)?.instrumentId).toBe("i1");
    expect(previewBody("COLLECTION", form({ method: "BANK" }))?.channel).toBe("TRANSFER");
  });
});

describe("seçenek metinleri", () => {
  it("fon, para birimi, karşı taraf hesabı, ciro edilebilir çek", () => {
    expect(
      fundLabel({
        kind: "BANK",
        name: "Ana",
        bankName: "Ziraat",
        bankBranchName: "Konak",
        currency: "USD",
      }),
    ).toBe("Ziraat - Konak ($)");
    expect(
      fundLabel({
        kind: "BANK",
        name: "Ana",
        bankName: "Ziraat",
        bankBranchName: null,
        currency: "TRY",
      }),
    ).toBe("Ziraat (₺)");
    expect(
      fundLabel({
        kind: "BANK",
        name: "Ana",
        bankName: null,
        bankBranchName: null,
        currency: "TRY",
      }),
    ).toBe("Ana");
    expect(
      fundLabel({
        kind: "CASH",
        name: "Kasa",
        bankName: "x",
        bankBranchName: null,
        currency: "TRY",
      }),
    ).toBe("Kasa");
    expect(currencyLabel({ code: "TRY", name: "Türk Lirası" })).toBe("₺ - (Türk Lirası)");
    expect(bankAccountLabel({ bankName: "Ziraat", ibanMasked: "TR** 123456" })).toBe(
      "Ziraat - TR** 123456",
    );
    expect(bankAccountLabel({ bankName: "Ziraat", ibanMasked: null })).toBe("Ziraat");
    const tm = (key: string, values?: Record<string, string | number>) =>
      `${key}:${JSON.stringify(values ?? {})}`;
    const label = endorsableLabel(
      {
        number: "1234567",
        bankName: null,
        money: { amount: "100.0000", currency: "TRY" },
        dueDate: "2026-12-01",
      },
      "Demir",
      (amount) => `#${amount}`,
      tm,
    );
    expect(label).toBe(
      'check.optionNumber:{"number":"1234567","bank":"-"} | #100.0000 ₺ | check.optionDrawer:{"name":"Demir"} | check.optionDue:{"date":"01.12.2026"}',
    );
    expect(
      endorsableLabel(
        {
          number: "1",
          bankName: "B",
          money: { amount: "1", currency: "TRY" },
          dueDate: "2026-01-01",
        },
        null,
        String,
        tm,
      ),
    ).not.toContain("optionDrawer");
  });
});

describe("karşı taraf açıklama cümlesi (S-8)", () => {
  const sentence =
    "[Ziraat - Konak] - 15/11/2026 - TR** 123456 iban bilgisine sahip hesaba yatırılmıştır.";

  it("yoksa yeni satırla eklenir, varsa yerine konur, null silinir", () => {
    expect(applyBankSentence("", sentence)).toBe(sentence);
    expect(applyBankSentence("Kira", sentence)).toBe(`Kira\n${sentence}`);
    const other = sentence.replace("Ziraat", "Garanti");
    expect(applyBankSentence(`Kira\n${sentence}`, other)).toBe(`Kira\n${other}`);
    expect(applyBankSentence(`Kira\n${sentence}`, null)).toBe("Kira");
    // Hesap sahibi adı cümlede yok (kalıp yalnız maskeli IBAN'ı kapsar).
    expect(new RegExp(BANK_SENTENCE.source).test(sentence)).toBe(true);
  });
});

describe("düzenleme kilidi (§5.7)", () => {
  it("her kilit nedeni katalog koduna; düzeltilmiş kayıt ALREADY_CORRECTED", () => {
    expect(lockReasonErrorCode("TRANSFERRED")).toBe("TRANSACTION_TRANSFERRED");
    expect(lockReasonErrorCode("REVERSED")).toBe("SETTLEMENT_REVERSED");
    expect(lockReasonErrorCode("REVERSED", "s2")).toBe("SETTLEMENT_ALREADY_CORRECTED");
    expect(lockReasonErrorCode("CHECK")).toBe("SETTLEMENT_CHECK_NOT_REVERSIBLE");
    expect(lockReasonErrorCode("PLAN")).toBe("SETTLEMENT_LINKED_TO_PLAN");
    expect(lockReasonErrorCode("INTERCOMPANY")).toBe("SETTLEMENT_LINKED_TO_INTERCOMPANY");
    expect(lockReasonErrorCode("FX_SOURCE")).toBe("SETTLEMENT_USED_IN_FX_EXCHANGE");
    expect(lockReasonErrorCode("VEHICLE_EXPENSE")).toBe("SETTLEMENT_SOURCE_MANAGED");
    expect(lockReasonErrorCode("NO_ACCOUNT")).toBe("SETTLEMENT_NOT_CORRECTABLE");
    expect(lockReasonErrorCode(null)).toBe("SETTLEMENT_NOT_CORRECTABLE");
    expect(lockReasonErrorKey("TRANSFERRED")).toBe("finance.error.TRANSACTION_TRANSFERRED");
  });
});

describe("hata ayrıştırma", () => {
  it("kod ve ileti; ağ hatasında kod null", () => {
    expect(apiErrorInfo({ body: { code: "X", message: "m" } })).toEqual({
      code: "X",
      message: "m",
    });
    expect(apiErrorInfo(new Error("ağ"))).toEqual({ code: null, message: "ağ" });
    expect(apiErrorInfo(null)).toEqual({ code: null, message: "" });
    expect(apiErrorInfo("düz")).toEqual({ code: null, message: "düz" });
  });
});

describe("öğe kimlikleri (APM/EPM/CMP)", () => {
  it("ödeme ekleme ve düzenleme", () => {
    const add = modalIds("PAYMENT", "add");
    expect(add).toMatchObject({
      root: "addPaymentModal",
      form: "paymentForm",
      remaining: "remainingDebtInfo",
      account: "CustomerAccountID",
      method: "PaymentMethod",
      amount: "PaymentAmountInput",
      cashFields: "cashFields",
      description: "Description",
      counterparty: "CustomerBankAccountID",
      allocationPrefix: "",
    });
    const edit = modalIds("PAYMENT", "edit");
    expect(edit).toMatchObject({
      root: "editPaymentModal",
      form: "editPaymentForm",
      remaining: "editRemainingDebtInfo",
      account: "editCustomerAccountID",
      method: "editPaymentMethod",
      cashFields: "editCashFields",
      description: "editDescription",
      allocationPrefix: "edit",
    });
  });

  it("tahsilat düzenleme: girişlerde Edit, kaplarda edit öneki", () => {
    expect(modalIds("COLLECTION", "add")).toMatchObject({
      root: "addCollectionModal",
      form: "collectionForm",
      remaining: "remainingCreditInfo",
      amount: "CollectionAmountInput",
      calculation: "calculationCollectionResult",
    });
    expect(modalIds("COLLECTION", "edit")).toMatchObject({
      root: "editCollectionModal",
      form: "editCollectionForm",
      remaining: "editRemainingCreditInfo",
      account: "EditCustomerAccountID",
      method: "EditCollectionMethod",
      bankFields: "editBankFields",
      bank: "EditBankID",
      exchangeRate: "EditExchangeRate",
      description: "EditDescription",
    });
  });

  it("hatalı alanın odak öğesi", () => {
    const ids = modalIds("PAYMENT", "add");
    expect(fieldElementId(ids, "accountId", form())).toBe("CustomerAccountID");
    expect(fieldElementId(ids, "branchId", form())).toBe("WorkPlaceID");
    expect(fieldElementId(ids, "method", form())).toBe("PaymentMethod");
    expect(fieldElementId(ids, "amount", form())).toBe("PaymentAmountInput");
    expect(fieldElementId(ids, "date", form())).toBe("PaymentDate");
    expect(fieldElementId(ids, "currency", form())).toBe("CurrencyID");
    expect(fieldElementId(ids, "fundAccountId", form())).toBe("CashID");
    expect(fieldElementId(ids, "fundAccountId", form({ method: "BANK" }))).toBe("BankID");
    expect(fieldElementId(ids, "check.instrumentId", form())).toBe("EndorsableCheckID");
    expect(fieldElementId(ids, "check.fundAccountId", form())).toBe("CheckBankID");
    expect(fieldElementId(ids, "check.number", form())).toBe("CheckNumber");
    expect(fieldElementId(ids, "check.dueDate", form())).toBe("DueDate");
    expect(fieldElementId(ids, "note.number", form())).toBe("BillNumber");
    expect(fieldElementId(ids, "note.dueDate", form())).toBe("BillDueDate");
    expect(fieldElementId(ids, "allocations", form())).toBe("selectAllInvoices");
    expect(fieldElementId(modalIds("PAYMENT", "edit"), "allocations", form())).toBe(
      "editSelectAllInvoices",
    );
    expect(fieldElementId(ids, "id", form())).toBeNull();
  });
});

describe("önyükleme ve ön değerler", () => {
  it("düzenleme: kayıt alanları, kur metni, yalnız aktif ve kapsam içi eşleşmeler", () => {
    const values = formFromDetail(
      {
        item: {
          accountId: "a1",
          documentNo: null,
          displayMethod: "CREDIT_CARD",
          settlementDate: "2026-11-01",
          branchId: "b1",
          money: { amount: "250.5000", currency: "USD" },
          exchangeRate: 34.5,
          fundAccountId: "f1",
          counterpartyBankAccountId: null,
          description: null,
        },
        allocations: [
          {
            targetType: "PURCHASE_INVOICE",
            targetId: "t1",
            money: { amount: "100.0000" },
            active: true,
            outOfScope: false,
          },
          {
            targetType: "PURCHASE_INVOICE",
            targetId: "t2",
            money: { amount: "50" },
            active: false,
            outOfScope: false,
          },
          {
            targetType: "PURCHASE_INVOICE",
            targetId: null,
            money: { amount: "5" },
            active: true,
            outOfScope: true,
          },
        ],
      },
      TODAY,
    );
    expect(values).toMatchObject({
      accountId: "a1",
      documentNo: "",
      method: "CREDIT_CARD",
      date: "2026-11-01",
      currency: "USD",
      amount: "250.50",
      exchangeRate: "34.5000",
      fundAccountId: "f1",
      description: "",
      allocations: [{ targetType: "PURCHASE_INVOICE", targetId: "t1", amount: "100.00" }],
    });
    expect(rateText(null, "USD")).toBe("");
    expect(rateText(30, "TRY")).toBe("");
    const nullAccount = formFromDetail(
      {
        item: {
          ...values,
          accountId: null,
          documentNo: "D",
          displayMethod: "CASH",
          settlementDate: TODAY,
          branchId: "b",
          money: { amount: "1", currency: "TRY" },
          exchangeRate: null,
          fundAccountId: null,
          counterpartyBankAccountId: "cb",
          description: "x",
        },
        allocations: [],
      },
      TODAY,
    );
    expect(nullAccount).toMatchObject({
      accountId: "",
      fundAccountId: "",
      counterpartyBankAccountId: "cb",
    });
  });

  it("ekleme: fon yöntemi, iş yerini ve para birimini belirler; uyumsuz fon atılır", () => {
    const fund = { kind: "CASH" as const, branchId: "b9", currency: "EUR" };
    expect(presetForm({ fundAccountId: "f9" }, fund, TODAY)).toMatchObject({
      method: "CASH",
      branchId: "b9",
      currency: "EUR",
      fundAccountId: "f9",
    });
    expect(
      presetForm({ fundAccountId: "f9", method: "BANK", currency: "USD" }, fund, TODAY),
    ).toMatchObject({ method: "BANK", currency: "USD", fundAccountId: "" });
    expect(
      presetForm(
        { fundAccountId: "fb", method: "CREDIT_CARD" },
        { kind: "BANK", branchId: "b1", currency: "TRY" },
        TODAY,
      ),
    ).toMatchObject({ method: "CREDIT_CARD", fundAccountId: "fb" });
    expect(presetForm({ accountId: "a1", branchId: "b1" }, null, TODAY)).toMatchObject({
      accountId: "a1",
      branchId: "b1",
      method: "",
      currency: "TRY",
    });
    expect(presetForm({}, { kind: "BANK", branchId: "b2", currency: "TRY" }, TODAY).method).toBe(
      "BANK",
    );
  });

  it("alan değişimleri bağımlı alanları sıfırlar", () => {
    const base = form({
      method: "BANK",
      counterpartyBankAccountId: "cb",
      allocations: [{ targetType: "PURCHASE_INVOICE", targetId: "t", amount: "1" }],
    });
    expect(withMethod(base, "CREDIT_CARD")).toMatchObject({
      fundAccountId: "f1",
      counterpartyBankAccountId: "cb",
    });
    expect(withMethod(base, "CASH")).toMatchObject({
      fundAccountId: "",
      counterpartyBankAccountId: "",
    });
    const check = withMethod({ ...base, check: { ...base.check, number: "1" } }, "CHECK");
    expect(check.check.number).toBe("1");
    expect(withMethod(check, "NOTE").check.number).toBe("");
    expect(withBranch(base, "b1")).toBe(base);
    expect(withBranch(base, "b2")).toMatchObject({
      branchId: "b2",
      fundAccountId: "",
      allocations: [],
    });
    expect(withAccount(base, "a1")).toBe(base);
    const sentence = "[Z - K] - 01/01/2026 - TR** 1 iban bilgisine sahip hesaba yatırılmıştır.";
    expect(withAccount({ ...base, description: `Not\n${sentence}` }, "a2")).toMatchObject({
      accountId: "a2",
      counterpartyBankAccountId: "",
      description: "Not",
      allocations: [],
    });
    expect(withCurrency(base, "TRY")).toBe(base);
    expect(withCurrency({ ...base, exchangeRate: "34" }, "USD")).toMatchObject({
      currency: "USD",
      exchangeRate: "34",
      allocations: [],
    });
    expect(withCurrency({ ...base, currency: "USD", exchangeRate: "34" }, "TRY").exchangeRate).toBe(
      "",
    );
    expect(calculationText("1500,5", "USD")).toBe("1500.50 $");
    expect(calculationText("", "USD")).toBeNull();
  });
});

describe("düzeltmede kur (goc-defter:F1)", () => {
  const usd = (patch: Partial<SettlementFormValues> = {}): SettlementFormValues => ({
    ...emptyForm("2026-11-15"),
    accountId: "a1",
    branchId: "b1",
    method: "BANK",
    fundAccountId: "bk3",
    currency: "USD",
    amount: "1000",
    date: "2026-11-10",
    ...patch,
  });
  const original = correctionOriginalOf({
    settlementDate: "2026-11-10",
    money: { currency: "USD" },
    exchangeRate: 35,
  });

  it("ödeme: tarih ve para birimi aynıysa kaydın kuru, değişirse TCMB (undefined)", () => {
    expect(original).toEqual({ date: "2026-11-10", currency: "USD", exchangeRate: 35 });
    expect(correctionRate(usd(), original)).toBe(35);
    expect(correctionRate(usd({ date: "2026-11-11" }), original)).toBeUndefined();
    expect(correctionRate(usd({ currency: "EUR" }), original)).toBeUndefined();
    expect(correctionRate(usd({ currency: "TRY" }), original)).toBeUndefined();
    expect(correctionRate(usd(), { ...original, exchangeRate: null })).toBeUndefined();
    expect(correctionBody("PAYMENT", usd(), original).exchangeRate).toBe(35);
    expect(
      correctionBody("PAYMENT", usd({ date: "2026-11-11" }), original).exchangeRate,
    ).toBeUndefined();
    // Ekleme gövdesi değişmez: yeni ödeme TCMB kuruyla (§5.7).
    expect(paymentBody(usd()).exchangeRate).toBeUndefined();
  });

  it("tahsilat: tarih/para birimi değişince önyüklenen kur temizlenir; yazılan kur kalır", () => {
    const loaded = usd({ method: "CASH", exchangeRate: "35.0000" });
    expect(dropStaleRate(loaded, original)).toBe(loaded);
    expect(dropStaleRate({ ...loaded, date: "2026-11-11" }, original).exchangeRate).toBe("");
    expect(dropStaleRate({ ...loaded, currency: "EUR" }, original).exchangeRate).toBe("");
    const typed = { ...loaded, date: "2026-11-11", exchangeRate: "36.1" };
    expect(dropStaleRate(typed, original)).toBe(typed);
    // Tahsilatta düzeltme gövdesi formdaki kuru kullanır.
    expect(correctionBody("COLLECTION", typed, original).exchangeRate).toBe(36.1);
    expect(
      correctionBody(
        "COLLECTION",
        dropStaleRate({ ...loaded, date: "2026-11-11" }, original),
        original,
      ).exchangeRate,
    ).toBeUndefined();
  });
});

describe("hata nedeni (zto-onyuz:F5)", () => {
  it("details içindeki reason=X değeri; yoksa null", () => {
    expect(
      apiErrorReason({ body: { code: "X", details: ["targetId=i1", "reason=CURRENCY"] } }),
    ).toBe("CURRENCY");
    expect(apiErrorReason({ body: { code: "X", details: ["targetId=i1"] } })).toBeNull();
    expect(apiErrorReason({ body: { code: "X" } })).toBeNull();
    expect(apiErrorReason(new Error("ağ"))).toBeNull();
    expect(apiErrorReason(null)).toBeNull();
  });
});
