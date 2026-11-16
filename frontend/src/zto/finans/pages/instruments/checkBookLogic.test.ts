import { describe, expect, it } from "vitest";
import {
  EMPTY_CHECK_BOOK_FORM,
  canDeleteLeaf,
  canVoidLeaf,
  checkBookBody,
  checkBookTotals,
  compareLeaves,
  createdSummary,
  digitsOnly,
  firstError,
  leafCount,
  leafCountClass,
  leafStatusClass,
  validateCheckBook,
} from "./checkBookLogic";
import { makeBook, makeLeaf } from "./billsTestUtils";

const VALID = {
  ...EMPTY_CHECK_BOOK_FORM,
  fundAccountId: "f1",
  serialNo: " ZB-M-2024-001 ",
  startNumber: "1234567",
  endNumber: "1234617",
};

describe("leafCount", () => {
  it("ZTO örneği: 1234567 - 1234617 arası 51 yaprak", () => {
    expect(leafCount("1234567", "1234617")).toBe(51);
    expect(leafCount("0000001", "0000001")).toBe(1);
  });

  it("geçersiz ya da ters aralıkta 0", () => {
    expect(leafCount("123456", "1234617")).toBe(0);
    expect(leafCount("1234617", "1234567")).toBe(0);
    expect(leafCount("12a4567", "1234617")).toBe(0);
  });

  it("gösterge sınıfı ve rakam süzgeci", () => {
    expect(leafCountClass(10)).toBe("alert-success");
    expect(leafCountClass(51)).toBe("alert-warning");
    expect(leafCountClass(1001)).toBe("alert-danger");
    expect(digitsOnly("12a-34567890", 7)).toBe("1234567");
  });
});

describe("validateCheckBook (ZTO iletileri)", () => {
  it("geçerli form hatasız, gövde kırpılır ve boş MICR gönderilmez", () => {
    expect(validateCheckBook(VALID)).toEqual({});
    expect(checkBookBody(VALID)).toEqual({
      fundAccountId: "f1",
      serialNo: "ZB-M-2024-001",
      startNumber: "1234567",
      endNumber: "1234617",
    });
    expect(checkBookBody({ ...VALID, bankCode: "0001", branchCode: "1124" })).toMatchObject({
      bankCode: "0001",
      branchCode: "1124",
    });
  });

  it("alan iletileri sırayla", () => {
    const errors = validateCheckBook(EMPTY_CHECK_BOOK_FORM);
    expect(errors).toEqual({
      fundAccountId: "fundAccountId",
      serialNo: "serialNo",
      startNumber: "startNumber",
      endNumber: "endNumber",
    });
    expect(firstError(errors)).toBe("fundAccountId");
    expect(firstError({})).toBeNull();
  });

  it("aralık ve MICR kodları", () => {
    expect(validateCheckBook({ ...VALID, endNumber: "1234500" }).endNumber).toBe("endNumber");
    expect(validateCheckBook({ ...VALID, endNumber: "1235567" }).range).toBe("range");
    expect(validateCheckBook({ ...VALID, bankCode: "01" })).toEqual({
      bankCode: "bankCode",
      branchCode: "branchCode",
    });
    expect(validateCheckBook({ ...VALID, serialNo: "x".repeat(51) }).serialNo).toBe("serialNo");
  });
});

describe("liste yardımcıları", () => {
  it("başarı özeti ilk 10 atlanan numara", () => {
    expect(createdSummary({ createdCount: 5, skippedNumbers: [] })).toEqual({
      created: 5,
      skippedCount: 0,
      numbers: "",
    });
    const many = Array.from({ length: 12 }, (_, i) => String(i).padStart(7, "0"));
    const summary = createdSummary({ createdCount: 1, skippedNumbers: many });
    expect(summary.skippedCount).toBe(12);
    expect(summary.numbers.endsWith("0000009, …")).toBe(true);
  });

  it("durum sınıfı, eylemler, toplamlar, sıra", () => {
    expect(leafStatusClass("UNUSED")).toBe("status-available");
    expect(leafStatusClass("USED")).toBe("status-used");
    expect(leafStatusClass("VOID")).toBe("status-cancelled");
    expect(canVoidLeaf(makeLeaf({ status: "USED" }))).toBe(true);
    expect(canVoidLeaf(makeLeaf({ status: "VOID" }))).toBe(false);
    expect(canDeleteLeaf(makeLeaf({ status: "USED" }))).toBe(false);
    expect(canDeleteLeaf(makeLeaf())).toBe(true);
    expect(
      checkBookTotals([makeBook(), makeBook({ unusedCount: 1, usedCount: 0, voidCount: 0 })]),
    ).toEqual({ books: 2, leaves: 11, available: 8, used: 2 });
    const rows = [
      makeLeaf({ id: "b2", checkBookSerial: "B", leafNo: 2 }),
      makeLeaf({ id: "a1", checkBookSerial: "A", leafNo: 1 }),
      makeLeaf({ id: "b1", checkBookSerial: "B", leafNo: 1 }),
    ];
    expect(rows.sort(compareLeaves).map((row) => row.id)).toEqual(["a1", "b1", "b2"]);
  });
});
