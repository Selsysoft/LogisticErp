import { describe, expect, it } from "vitest";
import type { AllocationBody, OpenInvoice } from "../../../../pages/finance/types";
import {
  allocatable,
  autoFill,
  clampToAmount,
  isExceeded,
  maxFor,
  remainingTotals,
  rowState,
  selectAll,
  selectAllState,
  setAmount,
  toBody,
  toggleRow,
  totalOf,
} from "./allocationLogic";

function invoice(id: string, remaining: string, patch: Partial<OpenInvoice> = {}): OpenInvoice {
  return {
    targetType: "PURCHASE_INVOICE",
    id,
    number: `F-${id}`,
    typeName: "Alış Faturası",
    invoiceDate: "2026-11-01",
    dueDate: null,
    currency: "TRY",
    total: "1000.0000",
    allocated: "0.0000",
    remaining,
    branchId: "b1",
    companyId: "c1",
    ...patch,
  };
}

const row = (targetId: string, amount: string): AllocationBody => ({
  targetType: "PURCHASE_INVOICE",
  targetId,
  amount,
});

describe("allocationLogic", () => {
  it("satır durumu: para birimi ve kalan", () => {
    expect(rowState(invoice("1", "10"), "TRY")).toEqual({
      currencyMatches: true,
      hasRemaining: true,
      canAllocate: true,
    });
    expect(rowState(invoice("1", "10", { currency: "USD" }), "TRY").canAllocate).toBe(false);
    expect(rowState(invoice("1", "0"), "TRY").canAllocate).toBe(false);
    expect(allocatable([invoice("1", "0"), invoice("2", "5")], "TRY").map((i) => i.id)).toEqual([
      "2",
    ]);
  });

  it("üst sınır min(kalan, tutar); eşleşmezse 0", () => {
    expect(maxFor(invoice("1", "300"), "TRY", "200")).toBe("200.00");
    expect(maxFor(invoice("1", "150.5"), "TRY", "200")).toBe("150.50");
    expect(maxFor(invoice("1", "150", { currency: "EUR" }), "TRY", "200")).toBe("0.00");
  });

  it("toplam ve aşım ondalık güvenli (0.10 + 0.20 = 0.30 sahte aşım yok — Rev 1 F-5)", () => {
    const selection = [row("1", "0.10"), row("2", "0.20")];
    expect(totalOf(selection)).toBe("0.30");
    expect(isExceeded(selection, "0.3")).toBe(false);
    expect(isExceeded(selection, "0.29")).toBe(true);
    expect(isExceeded([row("1", "1,5")], "")).toBe(true);
    expect(totalOf([])).toBe("0.00");
  });

  it("autoFill: min(kalan, tutar − diğerleri); para birimi ve kalan yok uyarıları", () => {
    expect(autoFill(invoice("1", "300"), [], "TRY", "200")).toEqual({
      amount: "200.00",
      warning: null,
    });
    expect(autoFill(invoice("2", "300"), [row("1", "150")], "TRY", "200")).toEqual({
      amount: "50.00",
      warning: null,
    });
    expect(autoFill(invoice("2", "300"), [row("1", "200")], "TRY", "200")).toEqual({
      amount: "0.00",
      warning: "noRemaining",
    });
    expect(autoFill(invoice("1", "300", { currency: "USD" }), [], "TRY", "200").warning).toBe(
      "currencyMismatch",
    );
  });

  it("toggleRow seçer/kaldırır; para birimi uyuşmazsa seçmez", () => {
    const picked = toggleRow(invoice("1", "80"), true, [], "TRY", "200");
    expect(picked).toEqual({ selection: [row("1", "80.00")], warning: null });
    expect(toggleRow(invoice("1", "80"), false, picked.selection, "TRY", "200").selection).toEqual(
      [],
    );
    expect(toggleRow(invoice("1", "80", { currency: "EUR" }), true, [], "TRY", "200")).toEqual({
      selection: [],
      warning: "currencyMismatch",
    });
  });

  it("setAmount kırpar: satır üst sınırı ve toplam (uyarı)", () => {
    const first = setAmount(invoice("1", "100"), "150", [], "TRY", "200");
    expect(first.amount).toBe("100.00");
    expect(first.warning).toBeNull();
    const second = setAmount(invoice("2", "500"), "150", first.selection, "TRY", "200");
    expect(second).toMatchObject({ amount: "100.00", warning: "totalExceeded" });
    expect(second.selection).toEqual([row("1", "100.00"), row("2", "100.00")]);
    const update = setAmount(invoice("1", "100"), "40", second.selection, "TRY", "200");
    expect(update.selection).toEqual([row("1", "40.00"), row("2", "100.00")]);
    expect(
      setAmount(invoice("3", "10", { currency: "USD" }), "5", [row("3", "1")], "TRY", "200"),
    ).toEqual({
      selection: [],
      amount: "",
      warning: null,
    });
    expect(setAmount(invoice("1", "100"), "-5", [], "TRY", "200").amount).toBe("0.00");
  });

  it("Tümünü seç: işaretli / kısmi (indeterminate) / pasif; sıralı doldurma", () => {
    const list = [invoice("1", "120"), invoice("2", "120"), invoice("3", "9", { currency: "USD" })];
    expect(selectAllState(list, [], "TRY")).toEqual({
      checked: false,
      indeterminate: false,
      disabled: false,
    });
    expect(selectAllState(list, [row("1", "1")], "TRY")).toEqual({
      checked: false,
      indeterminate: true,
      disabled: false,
    });
    const all = selectAll(list, true, "TRY", "200");
    expect(all).toEqual([row("1", "120.00"), row("2", "80.00")]);
    expect(selectAllState(list, all, "TRY").checked).toBe(true);
    expect(selectAll(list, false, "TRY", "200")).toEqual([]);
    expect(selectAllState([invoice("1", "0")], [], "TRY").disabled).toBe(true);
  });

  it("tutar düşünce seçili satırlar kırpılır; listede olmayan korunur; eşleşmeyen atılır", () => {
    const list = [invoice("1", "120"), invoice("2", "120", { currency: "USD" })];
    expect(
      clampToAmount(list, [row("1", "120"), row("2", "5"), row("9", "7")], "TRY", "50"),
    ).toEqual([row("1", "50.00"), row("9", "7")]);
    expect(clampToAmount(list, [row("1", "10")], "TRY", "50")).toEqual([row("1", "10")]);
  });

  it("kalan toplamları para birimi başına; gövde yalnız > 0", () => {
    expect(
      remainingTotals([
        invoice("1", "10"),
        invoice("2", "5.5", { currency: "USD" }),
        invoice("3", "2"),
      ]),
    ).toEqual([
      { currency: "TRY", total: "12.00" },
      { currency: "USD", total: "5.50" },
    ]);
    expect(toBody([row("1", "10,5"), row("2", "0"), row("3", "")])).toEqual([row("1", "10.50")]);
  });
});
