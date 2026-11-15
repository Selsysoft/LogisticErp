import type {
  AccountType,
  BalanceBreakdownRow,
  Plan,
  SettlementType,
} from "../../../../pages/finance/types";
import { fromScaled, toScaled, tryScaled } from "../../../decimal";
import { amountText } from "./settlementFormLogic";

/*
 * Plan sonrası modal ("Ödeme Başarılı!", 12.2a_TASARIM §5.10, OK-12.2a-11; ZTO pjs:5900-6371) saf
 * mantığı: tetik (ödeyen şirkette, ödemenin para biriminde kalan borç > 0 ve cari müşteri değil — ZTO
 * B1 düzeltilmiş), kalan borç listesi, satır doğrulaması (ZTO metinleri), para birimi toplamları ve
 * kısmi başarı özeti. Kalan borç = şirket başına `max(0, credit − debit)` (OK-12.2-1).
 */

export type BalanceRowLike = Pick<
  BalanceBreakdownRow,
  "currency" | "companyId" | "debit" | "credit"
> & { segment?: BalanceBreakdownRow["segment"] };

/** Para birimi başına kalan borç (yalnız > 0; ilk görülme sırası). `companyId` null → tüm şirketler. */
export function remainingDebtByCurrency(
  rows: readonly BalanceRowLike[] | null | undefined,
  companyId: string | null,
): { currency: string; amount: string }[] {
  const order: string[] = [];
  const sums = new Map<string, bigint>();
  for (const row of rows ?? []) {
    if (row.segment && row.segment !== "ALL") continue;
    if (companyId !== null && row.companyId !== companyId) continue;
    const net = (tryScaled(row.credit) ?? 0n) - (tryScaled(row.debit) ?? 0n);
    if (!sums.has(row.currency)) order.push(row.currency);
    sums.set(row.currency, (sums.get(row.currency) ?? 0n) + (net > 0n ? net : 0n));
  }
  return order
    .filter((currency) => (sums.get(currency) ?? 0n) > 0n)
    .map((currency) => ({ currency, amount: fromScaled(sums.get(currency) ?? 0n) }));
}

/**
 * Tetik: yalnız ödeme ekleme kipinde; cari müşteri değil; ödemenin şirketinde ve para biriminde kalan
 * borç > 0 (B1: TRY borcu 0 iken EUR borcu yüzünden TRY ödemesinde açılmaz).
 */
export function shouldOffer(input: {
  type: SettlementType;
  mode: "add" | "edit";
  accountType: AccountType | null | undefined;
  rows: readonly BalanceRowLike[] | null | undefined;
  companyId: string;
  currency: string;
}): boolean {
  if (input.type !== "PAYMENT" || input.mode !== "add") return false;
  if (!input.accountType || input.accountType === "CUSTOMER") return false;
  return remainingDebtByCurrency(input.rows, input.companyId).some(
    (row) => row.currency === input.currency,
  );
}

/** Açılış gecikmesi (ZTO `setTimeout(…, 1000)`). */
export const OFFER_DELAY_MS = 1000;

// ---------------------------------------------------------------------------------------------
// Plan satırları
// ---------------------------------------------------------------------------------------------

export type PlanRowSource = "MANUAL" | "INVOICE";

export type PlanRow = {
  /** Satır anahtarı (React) ve "#" sütunu. */
  index: number;
  /** Mevcut plan (salt okunur). */
  planId: string | null;
  status: Plan["status"] | null;
  date: string;
  /** `type=number` girişi (nokta ondalık) ya da mevcut planın tutarı. */
  amount: string;
  currency: string;
  description: string;
  /** Şube (branch_group) seçimi; mevcut planda gösterim adı. */
  groupKey: string;
  branchId: string;
  source: PlanRowSource;
  readOnly: boolean;
};

export function newRow(index: number, date: string, currency: string): PlanRow {
  return {
    index,
    planId: null,
    status: null,
    date,
    amount: "",
    currency,
    description: "",
    groupKey: "",
    branchId: "",
    source: "MANUAL",
    readOnly: false,
  };
}

/** Mevcut açık plandan salt okunur satır (Kaynak: fatura bağlıysa "Fatura"). */
export function rowFromPlan(index: number, plan: Plan): PlanRow {
  return {
    index,
    planId: plan.id,
    status: plan.status,
    date: plan.dueDate,
    amount: plan.money.amount,
    currency: plan.money.currency,
    description: plan.description ?? "",
    groupKey: "",
    branchId: plan.branchId,
    source: plan.purchaseInvoiceId ? "INVOICE" : "MANUAL",
    readOnly: true,
  };
}

/** Plan modalında listelenen açık durumlar. */
export const OPEN_STATUSES: readonly Plan["status"][] = [
  "DRAFT",
  "PENDING",
  "APPROVED",
  "REJECTED",
];

/** Mevcut plan kaldırılabilir mi (iptal listesine eklenir): yalnız DRAFT / REJECTED. */
export function canRemove(row: Pick<PlanRow, "readOnly" | "status">): boolean {
  return !row.readOnly || row.status === "DRAFT" || row.status === "REJECTED";
}

/**
 * Kaydet doğrulaması (pjs:6264-6300; ZTO her satırda ilk hatada durur). "Banka seçiniz." 12.4'e
 * kadar uygulanmaz (Banka sütunu devre dışı).
 */
export function validateRows(rows: readonly PlanRow[], accountId: string | null): string[] {
  if (!accountId) return ["errAccount"];
  const errors: string[] = [];
  for (const row of rows) {
    if (row.readOnly) continue;
    if (!row.date) {
      errors.push("errDate");
      continue;
    }
    const scaled = tryScaled(amountText(row.amount));
    if (scaled === null || scaled <= 0n) {
      errors.push("errAmount");
      continue;
    }
    if (!row.groupKey) {
      errors.push("errGroup");
      continue;
    }
    if (!row.branchId) errors.push("errBranch");
  }
  return errors;
}

/** "Toplam" satırları: para birimi başına (ilk görülme sırası; ZTO `updatePPPlanTotal`). */
export function planTotals(rows: readonly PlanRow[]): { currency: string; total: string }[] {
  const order: string[] = [];
  const sums = new Map<string, bigint>();
  for (const row of rows) {
    const value = tryScaled(amountText(row.amount)) ?? 0n;
    if (!sums.has(row.currency)) order.push(row.currency);
    sums.set(row.currency, (sums.get(row.currency) ?? 0n) + value);
  }
  return order.map((currency) => ({ currency, total: fromScaled(sums.get(currency) ?? 0n) }));
}

/** Yeni plan gövdesi (`POST /finance/payment-plans`, DRAFT). */
export function planBody(row: PlanRow, accountId: string) {
  const description = row.description.trim();
  return {
    accountId,
    branchId: row.branchId,
    money: { amount: amountText(row.amount), currency: row.currency },
    dueDate: row.date,
    description: description === "" ? null : description,
  };
}

export type PlanResult = { ok: boolean; message?: string };

/** Kısmi başarı özeti: başarılı/başarısız sayıları ve tekil hata iletileri. */
export function summarizeResults(results: readonly PlanResult[]): {
  success: number;
  failed: number;
  messages: string[];
} {
  const failed = results.filter((result) => !result.ok);
  return {
    success: results.length - failed.length,
    failed: failed.length,
    messages: [...new Set(failed.map((result) => result.message ?? "").filter(Boolean))],
  };
}

/** Görüntülenecek tutar (mevcut planın "1500.0000" tutarı dahil). */
export function amountOf(row: Pick<PlanRow, "amount">): string {
  const text = amountText(row.amount);
  return text === "" ? "0.00" : fromScaled(toScaled(text));
}
