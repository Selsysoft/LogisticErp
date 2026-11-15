import type { AllocationBody, OpenInvoice } from "../../../../pages/finance/types";
import { cmpDec, fromScaled, sumDec, toScaled, tryScaled } from "../../../decimal";
import { amountText } from "./settlementFormLogic";

/*
 * "Fatura Eşleştirme (Opsiyonel)" tablosunun saf mantığı (12.2a_TASARIM §5.9, OK-12.2a-2; ZTO
 * collections.js "Sipariş Tahsisi" 1318-1660 akışının fatura uyarlaması). Tutarlar ondalık metin; toplama
 * ve karşılaştırma `zto/decimal.ts` ile (Rev 1 F-5: "0.10" + "0.20" sınırında sahte aşım yok).
 */

const ZERO = "0.00";

/** Girişten ölçekli değer; geçersiz/boş → 0. */
function scaledOf(value: string | null | undefined): bigint {
  const text = amountText(value);
  return text === "" ? 0n : (tryScaled(text) ?? 0n);
}

function maxScaled(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function minScaled(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

/** Satırın durumu: para birimi eşleşiyor mu, eşleştirilebilir mi (kalan > 0). */
export function rowState(invoice: OpenInvoice, currency: string) {
  const currencyMatches = invoice.currency === currency;
  const hasRemaining = toScaled(invoice.remaining) > 0n;
  return { currencyMatches, hasRemaining, canAllocate: currencyMatches && hasRemaining };
}

/** Satırın üst sınırı: `min(kalan, ödeme/tahsilat tutarı)` (ZTO `maxAllocatable`); eşleşmezse 0. */
export function maxFor(invoice: OpenInvoice, currency: string, settlementAmount: string): string {
  if (!rowState(invoice, currency).canAllocate) return ZERO;
  return fromScaled(
    maxScaled(0n, minScaled(toScaled(invoice.remaining), scaledOf(settlementAmount))),
  );
}

/** Seçili satırların toplamı. */
export function totalOf(selection: readonly AllocationBody[]): string {
  return sumDec(selection.map((row) => amountText(row.amount) || "0"));
}

/** Toplam eşleştirme ödeme/tahsilat tutarını aşıyor mu. */
export function isExceeded(
  selection: readonly AllocationBody[],
  settlementAmount: string,
): boolean {
  return cmpDec(totalOf(selection), fromScaled(scaledOf(settlementAmount))) > 0;
}

/** Diğer satırların toplamı. */
function othersTotal(selection: readonly AllocationBody[], targetId: string): bigint {
  return selection
    .filter((row) => row.targetId !== targetId)
    .reduce((sum, row) => sum + scaledOf(row.amount), 0n);
}

export type AllocationWarning = "currencyMismatch" | "noRemaining" | "totalExceeded";

/**
 * Satır işaretlenince "Eşleştirilecek" = `min(kalan, tutar − diğerlerinin toplamı)` (ZTO
 * `toggleOrderSelection`); sıfır ya da altıysa "0.00" ve "Bu fatura için tahsis edilebilecek tutar
 * kalmadı." uyarısı. Para birimi uyuşmazsa seçilmez.
 */
export function autoFill(
  invoice: OpenInvoice,
  selection: readonly AllocationBody[],
  currency: string,
  settlementAmount: string,
): { amount: string; warning: AllocationWarning | null } {
  const state = rowState(invoice, currency);
  if (!state.currencyMatches) return { amount: ZERO, warning: "currencyMismatch" };
  const available = minScaled(
    toScaled(invoice.remaining),
    scaledOf(settlementAmount) - othersTotal(selection, invoice.id),
  );
  if (available <= 0n || !state.hasRemaining) return { amount: ZERO, warning: "noRemaining" };
  return { amount: fromScaled(available), warning: null };
}

/** Satırı seçer (autoFill) ya da kaldırır. */
export function toggleRow(
  invoice: OpenInvoice,
  checked: boolean,
  selection: readonly AllocationBody[],
  currency: string,
  settlementAmount: string,
): { selection: AllocationBody[]; warning: AllocationWarning | null } {
  const rest = selection.filter((row) => row.targetId !== invoice.id);
  if (!checked) return { selection: rest, warning: null };
  const fill = autoFill(invoice, selection, currency, settlementAmount);
  if (fill.warning === "currencyMismatch") return { selection: rest, warning: fill.warning };
  return {
    selection: [
      ...rest,
      { targetType: invoice.targetType, targetId: invoice.id, amount: fill.amount },
    ],
    warning: fill.warning,
  };
}

/**
 * Elle girilen tutar (ZTO `validateOrderAmount`): satırın üst sınırına ve `tutar − diğerleri`'ne
 * kırpılır; toplam aşılırsa "Toplam tahsis tutarı aşıldı!" uyarısı. Seçili değilse önce seçilir.
 */
export function setAmount(
  invoice: OpenInvoice,
  text: string,
  selection: readonly AllocationBody[],
  currency: string,
  settlementAmount: string,
): { selection: AllocationBody[]; amount: string; warning: AllocationWarning | null } {
  if (!rowState(invoice, currency).canAllocate) {
    return {
      selection: selection.filter((row) => row.targetId !== invoice.id),
      amount: "",
      warning: null,
    };
  }
  let value = maxScaled(0n, scaledOf(text));
  const max = toScaled(maxFor(invoice, currency, settlementAmount));
  if (value > max) value = max;
  let warning: AllocationWarning | null = null;
  const room = scaledOf(settlementAmount) - othersTotal(selection, invoice.id);
  if (value > room) {
    value = maxScaled(0n, room);
    warning = "totalExceeded";
  }
  const amount = fromScaled(value);
  const row = { targetType: invoice.targetType, targetId: invoice.id, amount };
  const exists = selection.some((item) => item.targetId === invoice.id);
  return {
    selection: exists
      ? selection.map((item) => (item.targetId === invoice.id ? row : item))
      : [...selection, row],
    amount,
    warning,
  };
}

/** Eşleştirilebilir satırlar. */
export function allocatable(invoices: readonly OpenInvoice[], currency: string): OpenInvoice[] {
  return invoices.filter((invoice) => rowState(invoice, currency).canAllocate);
}

/** "Tümünü seç" kutusu: hepsi seçiliyse işaretli, bir kısmı seçiliyse `indeterminate`. */
export function selectAllState(
  invoices: readonly OpenInvoice[],
  selection: readonly AllocationBody[],
  currency: string,
): { checked: boolean; indeterminate: boolean; disabled: boolean } {
  const ids = allocatable(invoices, currency).map((invoice) => invoice.id);
  const selected = ids.filter((id) => selection.some((row) => row.targetId === id)).length;
  return {
    checked: ids.length > 0 && selected === ids.length,
    indeterminate: selected > 0 && selected < ids.length,
    disabled: ids.length === 0,
  };
}

/**
 * "Tümünü seç": eşleştirilebilir satırlar sırayla `autoFill` ile doldurulur (kalan tutar bitince
 * sonrakiler 0); kaldırınca seçim boşalır. ZTO kalanı satır sayısına eşit böler (float); burada
 * ondalık güvenli sıralı doldurma (bilinçli sapma).
 */
export function selectAll(
  invoices: readonly OpenInvoice[],
  checked: boolean,
  currency: string,
  settlementAmount: string,
): AllocationBody[] {
  if (!checked) return [];
  let selection: AllocationBody[] = [];
  for (const invoice of allocatable(invoices, currency)) {
    selection = toggleRow(invoice, true, selection, currency, settlementAmount).selection;
  }
  return selection;
}

/** Tutar değişince seçili satırlar yeni üst sınırlara kırpılır (ZTO `updateOrderMaxAmounts`). */
export function clampToAmount(
  invoices: readonly OpenInvoice[],
  selection: readonly AllocationBody[],
  currency: string,
  settlementAmount: string,
): AllocationBody[] {
  return selection.flatMap((row) => {
    const invoice = invoices.find((item) => item.id === row.targetId);
    if (!invoice) return [row];
    if (!rowState(invoice, currency).canAllocate) return [];
    const max = maxFor(invoice, currency, settlementAmount);
    return [cmpDec(amountText(row.amount) || "0", max) > 0 ? { ...row, amount: max } : row];
  });
}

/** "Kalan Fatura Borçları/Alacakları:" para birimi toplamları (sıra: ilk görülme). */
export function remainingTotals(
  invoices: readonly OpenInvoice[],
): { currency: string; total: string }[] {
  const order: string[] = [];
  const sums = new Map<string, bigint>();
  for (const invoice of invoices) {
    if (!sums.has(invoice.currency)) order.push(invoice.currency);
    sums.set(invoice.currency, (sums.get(invoice.currency) ?? 0n) + toScaled(invoice.remaining));
  }
  return order.map((currency) => ({ currency, total: fromScaled(sums.get(currency) ?? 0n) }));
}

/** İstek gövdesi: seçili ve tutarı > 0 satırlar. */
export function toBody(selection: readonly AllocationBody[]): AllocationBody[] {
  return selection
    .map((row) => ({ ...row, amount: amountText(row.amount) }))
    .filter((row) => row.amount !== "" && toScaled(row.amount) > 0n);
}
