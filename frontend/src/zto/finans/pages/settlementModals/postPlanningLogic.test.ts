import { describe, expect, it } from "vitest";
import type { Plan } from "../../../../pages/finance/types";
import {
  OFFER_DELAY_MS,
  OPEN_STATUSES,
  amountOf,
  canRemove,
  newRow,
  planBody,
  planTotals,
  remainingDebtByCurrency,
  rowFromPlan,
  shouldOffer,
  summarizeResults,
  validateRows,
  type BalanceRowLike,
} from "./postPlanningLogic";

const bal = (
  currency: string,
  companyId: string | null,
  debit: number,
  credit: number,
  segment?: BalanceRowLike["segment"],
): BalanceRowLike => ({ currency, companyId, debit, credit, segment });

function plan(patch: Partial<Plan> = {}): Plan {
  return {
    id: "p1",
    accountId: "a1",
    branchId: "b1",
    companyId: "c1",
    money: { amount: "1500.0000", currency: "TRY" },
    dueDate: "2026-12-01",
    status: "DRAFT",
    purchaseInvoiceId: null,
    description: null,
    rejectNote: null,
    ...patch,
  };
}

describe("postPlanningLogic", () => {
  it("kalan borç: şirket başına max(0, credit − debit), para birimi bazında", () => {
    const rows = [
      bal("TRY", "c1", 100, 300),
      bal("TRY", "c2", 0, 50),
      bal("EUR", "c1", 10, 5),
      bal("USD", "c1", 0, 0, "BEFORE"),
    ];
    expect(remainingDebtByCurrency(rows, "c1")).toEqual([{ currency: "TRY", amount: "200.00" }]);
    expect(remainingDebtByCurrency(rows, null)).toEqual([{ currency: "TRY", amount: "250.00" }]);
    expect(remainingDebtByCurrency(undefined, null)).toEqual([]);
  });

  it("tetik: yalnız ödeme ekleme, cari müşteri değil, ödemenin şirketi ve para birimi (B1)", () => {
    const rows = [bal("TRY", "c1", 500, 500), bal("EUR", "c1", 0, 100)];
    const base = {
      type: "PAYMENT" as const,
      mode: "add" as const,
      accountType: "SUPPLIER" as const,
      rows,
      companyId: "c1",
    };
    // B1: TRY borç 0 + EUR borç > 0 iken TRY ödemesinde tetik yok.
    expect(shouldOffer({ ...base, currency: "TRY" })).toBe(false);
    expect(shouldOffer({ ...base, currency: "EUR" })).toBe(true);
    expect(shouldOffer({ ...base, currency: "EUR", accountType: "CUSTOMER" })).toBe(false);
    expect(shouldOffer({ ...base, currency: "EUR", accountType: null })).toBe(false);
    expect(shouldOffer({ ...base, currency: "EUR", mode: "edit" })).toBe(false);
    expect(shouldOffer({ ...base, currency: "EUR", type: "COLLECTION" })).toBe(false);
    expect(shouldOffer({ ...base, currency: "EUR", companyId: "c2" })).toBe(false);
    expect(OFFER_DELAY_MS).toBe(1000);
  });

  it("satırlar: yeni (Manuel) ve mevcut plandan salt okunur (Fatura kaynağı)", () => {
    expect(newRow(1, "2026-11-15", "TRY")).toMatchObject({
      index: 1,
      planId: null,
      source: "MANUAL",
      readOnly: false,
      currency: "TRY",
    });
    expect(rowFromPlan(2, plan({ purchaseInvoiceId: "inv", description: "x" }))).toMatchObject({
      index: 2,
      planId: "p1",
      status: "DRAFT",
      amount: "1500.0000",
      source: "INVOICE",
      readOnly: true,
      description: "x",
    });
    expect(rowFromPlan(3, plan()).source).toBe("MANUAL");
    expect(OPEN_STATUSES).toEqual(["DRAFT", "PENDING", "APPROVED", "REJECTED"]);
  });

  it("kaldırma yalnız yeni satır ya da DRAFT/REJECTED plan", () => {
    expect(canRemove({ readOnly: false, status: null })).toBe(true);
    expect(canRemove({ readOnly: true, status: "DRAFT" })).toBe(true);
    expect(canRemove({ readOnly: true, status: "REJECTED" })).toBe(true);
    expect(canRemove({ readOnly: true, status: "APPROVED" })).toBe(false);
    expect(canRemove({ readOnly: true, status: "PENDING" })).toBe(false);
  });

  it("doğrulama metin anahtarları (ZTO sırası, satır başına ilk hata; Banka 12.4)", () => {
    const empty = newRow(1, "", "TRY");
    const amountless = { ...newRow(2, "2026-11-15", "TRY"), amount: "0" };
    const groupless = { ...newRow(3, "2026-11-15", "TRY"), amount: "10" };
    const branchless = { ...groupless, index: 4, groupKey: "g1" };
    const ok = { ...branchless, index: 5, branchId: "b1" };
    const locked = { ...rowFromPlan(6, plan()), date: "" };
    expect(validateRows([empty, amountless, groupless, branchless, ok, locked], "a1")).toEqual([
      "errDate",
      "errAmount",
      "errGroup",
      "errBranch",
    ]);
    expect(validateRows([ok], null)).toEqual(["errAccount"]);
    expect(validateRows([ok], "a1")).toEqual([]);
  });

  it("toplamlar, gövde, kısmi başarı özeti, tutar gösterimi", () => {
    const rows = [
      { ...newRow(1, "2026-11-15", "TRY"), amount: "10.5" },
      { ...newRow(2, "2026-11-15", "USD"), amount: "3" },
      { ...newRow(3, "2026-11-15", "TRY"), amount: "" },
      rowFromPlan(4, plan()),
    ];
    expect(planTotals(rows)).toEqual([
      { currency: "TRY", total: "1510.50" },
      { currency: "USD", total: "3.00" },
    ]);
    expect(planBody({ ...rows[0], branchId: "b1", description: "  " }, "a1")).toEqual({
      accountId: "a1",
      branchId: "b1",
      money: { amount: "10.50", currency: "TRY" },
      dueDate: "2026-11-15",
      description: null,
    });
    expect(planBody({ ...rows[0], branchId: "b1", description: " Kira " }, "a1").description).toBe(
      "Kira",
    );
    expect(
      summarizeResults([
        { ok: true },
        { ok: false, message: "x" },
        { ok: false, message: "x" },
        { ok: false },
      ]),
    ).toEqual({ success: 1, failed: 3, messages: ["x"] });
    expect(amountOf({ amount: "" })).toBe("0.00");
    expect(amountOf({ amount: "1500.0000" })).toBe("1500.00");
  });
});
