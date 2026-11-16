import { describe, expect, it } from "vitest";
import { makeInstrument } from "./billsTestUtils";
import {
  cancelAction,
  canEditDueDate,
  correctionPath,
  diffBody,
  errorTextOf,
  formFromItem,
  isEmptyBody,
  needsNumberCheck,
  numberConflict,
  numberLocked,
  remainingView,
  sanitizeCheckNumber,
  validateEdit,
} from "./editInstrumentLogic";

const check = makeInstrument({
  kind: "CHECK",
  number: "1234567",
  bankName: "Ziraat",
  noteType: null,
  drawerName: "Ali",
  description: "eski",
});

describe("diffBody", () => {
  it("yalnız değişen alanlar; boşaltılan metin '' gider", () => {
    const original = formFromItem(check);
    expect(isEmptyBody(diffBody(check, original, original))).toBe(true);
    const body = diffBody(check, original, {
      ...original,
      number: " 7654321 ",
      bankBranch: "Kadıköy",
      drawerName: "",
      description: "",
      dueDate: "2027-01-05",
    });
    expect(body).toEqual({
      number: "7654321",
      bankBranch: "Kadıköy",
      drawerName: "",
      description: "",
      dueDate: "2027-01-05",
    });
  });

  it("verilen çekte keşideci ve çekte senet türü gönderilmez", () => {
    const issued = makeInstrument({ kind: "CHECK", direction: "ISSUED", noteType: null });
    const original = formFromItem(issued);
    expect(diffBody(issued, original, { ...original, drawerName: "X", noteType: "BOND" })).toEqual(
      {},
    );
    const note = makeInstrument({ noteType: "BOND" });
    const noteForm = formFromItem(note);
    expect(diffBody(note, noteForm, { ...noteForm, noteType: "PLAIN" })).toEqual({
      noteType: "PLAIN",
    });
  });
});

describe("validateEdit", () => {
  const form = formFromItem(check);

  it("çek numarası ZTO sırası: boş → uzunluk → rakam", () => {
    expect(validateEdit("CHECK", { ...form, number: "" }).number).toBe("numberRequired");
    expect(validateEdit("CHECK", { ...form, number: "123" }).number).toBe("numberLength");
    expect(validateEdit("CHECK", { ...form, number: "12a4567" }).number).toBe("numberDigits");
    expect(validateEdit("CHECK", form)).toEqual({});
  });

  it("banka adı, vade ve tarih sırası", () => {
    expect(validateEdit("CHECK", { ...form, bankName: " " }).bankName).toBe("bankNameRequired");
    expect(validateEdit("CHECK", { ...form, dueDate: "" }).dueDate).toBe("dueDateRequired");
    expect(
      validateEdit("CHECK", { ...form, issueDate: "2027-01-02", dueDate: "2027-01-01" }).dueDate,
    ).toBe("check.datesInvalid");
    const note = formFromItem(makeInstrument());
    expect(validateEdit("NOTE", { ...note, number: "" }).number).toBe("bill.numberRequired");
    expect(
      validateEdit("NOTE", { ...note, issueDate: "2027-01-02", dueDate: "2027-01-01" }).dueDate,
    ).toBe("bill.datesInvalid");
  });

  it("numara girişi ve ön denetim", () => {
    expect(sanitizeCheckNumber("12-34a5678")).toBe("1234567");
    expect(needsNumberCheck("CHECK", "1234567", "1234567")).toBe(false);
    expect(needsNumberCheck("CHECK", "1234567", "7654321")).toBe(true);
    expect(needsNumberCheck("CHECK", "1234567", "765")).toBe(false);
    expect(needsNumberCheck("NOTE", "A", "B")).toBe(false);
    expect(numberConflict(undefined)).toBeNull();
    expect(
      numberConflict({
        valid: true,
        available: false,
        conflictId: "x",
        conflictStatus: "PORTFOLIO",
        conflictAccountName: null,
      }),
    ).toEqual({ account: "-", status: "PORTFOLIO" });
  });
});

describe("ekran durumu", () => {
  it("kalan gün görünümü", () => {
    expect(remainingView("2026-11-20", "2026-11-16")).toEqual({
      days: 4,
      expired: false,
      color: "orange",
    });
    expect(remainingView("2026-12-20", "2026-11-16").color).toBe("green");
    expect(remainingView("2026-11-01", "2026-11-16")).toMatchObject({
      expired: true,
      color: "red",
    });
    expect(remainingView("", "2026-11-16").days).toBeNull();
  });

  it("vade kilidi, koçan kilidi", () => {
    expect(canEditDueDate(makeInstrument({ status: "COLLATERAL" }))).toBe(true);
    expect(canEditDueDate(makeInstrument({ status: "PAID" }))).toBe(false);
    expect(numberLocked(makeInstrument({ checkLeafId: "l1" }))).toBe(true);
    expect(numberLocked(makeInstrument())).toBe(false);
  });

  it("düzelt bağlantısı köken kaydına gider", () => {
    expect(correctionPath(makeInstrument())).toBe(
      "/zto-finans/tahsilatlar?openEditCollection=true&collectionId=s1",
    );
    expect(correctionPath(makeInstrument({ direction: "ISSUED", status: "ISSUED" }))).toContain(
      "openEditPayment=true&paymentId=s1",
    );
    expect(correctionPath(makeInstrument({ status: "PAID" }))).toBeNull();
    expect(correctionPath(makeInstrument({ originSettlementStatus: "REVERSED" }))).toBeNull();
  });

  it("İptal Et eylemi", () => {
    expect(cancelAction(makeInstrument({ allowedTransitions: ["RETURNED"] }))).toEqual({
      kind: "return",
    });
    expect(cancelAction(makeInstrument({ direction: "ISSUED", status: "ISSUED" }))).toEqual({
      kind: "reverse",
      settlementId: "s1",
    });
    expect(cancelAction(makeInstrument())).toBeNull();
    expect(
      cancelAction(makeInstrument({ allowedTransitions: ["RETURNED"], employeeMasked: true })),
    ).toBeNull();
  });

  it("hata metni: önek sırası, sunucu iletisi, varsayılan", () => {
    const err = Object.assign(new Error("sunucu"), { body: { code: "X_CODE" } });
    const lookup = (key: string) => (key === "b.errors.X_CODE" ? "çeviri" : null);
    expect(errorTextOf(err, "varsayılan", ["a", "b"], lookup)).toBe("çeviri");
    expect(errorTextOf(err, "varsayılan", ["a"], lookup)).toBe("sunucu");
    expect(errorTextOf(null, "varsayılan", ["a"], lookup)).toBe("varsayılan");
  });
});
