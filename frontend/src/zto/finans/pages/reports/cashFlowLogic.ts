/*
 * Nakit Akış saf mantığı (12.8_TASARIM §5.8; ZTO Views/RecipeFinance/CashFlow.cshtml,
 * RecipeFinanceController.CashFlow). Haftalar, tutarlar, Net ve Kümülatif sunucudan gelir (ondalık
 * metin; OK-12.8-9); istemci yalnız etiketler ve biçimler. Tarihler `"YYYY-MM-DD"` dizgisidir.
 */
import type { CashFlowParams } from "../../../../pages/finance/reportApi";
import { CASH_FLOW_DEFAULT_WEEKS } from "../../../../pages/finance/reportApi";
import type { CashFlowWeek } from "../../../../pages/finance/types";
import { cmpDec, fromScaled, toScaled } from "../../../decimal";
import { currencySymbol, formatN2, formatNumber } from "../../../format";
import { formatDayMonth } from "../../reports/reportDates";

/** Hafta etiketi: ZTO `$"{ws:dd.MM} – {we:dd.MM}"` (U+2013 çevresinde boşluk). */
export function weekLabel(week: Pick<CashFlowWeek, "weekStart" | "weekEnd">): string {
  return `${formatDayMonth(week.weekStart)} – ${formatDayMonth(week.weekEnd)}`;
}

/** Net/Kümülatif sınıfı: ≥ 0 `cf-pos`, < 0 `cf-neg` (ZTO). */
export function signClass(value: string): "cf-pos" | "cf-neg" {
  return cmpDec(value, "0") >= 0 ? "cf-pos" : "cf-neg";
}

/**
 * Tutar biçimi: TL karşılığı kipinde tam sayı (ZTO `N0`), para birimi kipinde N2 + simge.
 */
export function formatCashAmount(value: string, currency: string | null): string {
  if (currency === null) return formatNumber(value, 0);
  const symbol = currencySymbol(currency);
  return symbol ? `${formatN2(value)} ${symbol}` : formatN2(value);
}

/** Kümülatif sağlaması: önceki haftaların Net toplamı + bu hafta (sunucu değeriyle aynı olmalı). */
export function runningTotals(rows: readonly Pick<CashFlowWeek, "net">[]): string[] {
  let total = 0n;
  return rows.map((row) => {
    total += toScaled(row.net);
    return fromScaled(total);
  });
}

/** Görüntü satırı (ZtoRcpTable `text` ve hücreler). */
export type CashFlowDisplayRow = {
  key: string;
  label: string;
  receivableDue: string;
  receivedChecks: string;
  issuedChecks: string;
  notes: string;
  net: string;
  netClass: "cf-pos" | "cf-neg";
  cumulative: string;
  cumulativeClass: "cf-pos" | "cf-neg";
};

export function cashFlowRows(
  rows: readonly CashFlowWeek[],
  currency: string | null,
): CashFlowDisplayRow[] {
  return rows.map((row) => ({
    key: `${row.index}-${row.weekStart}`,
    label: weekLabel(row),
    receivableDue: formatCashAmount(row.receivableDue, currency),
    receivedChecks: formatCashAmount(row.receivedChecks, currency),
    issuedChecks: formatCashAmount(row.issuedChecks, currency),
    notes: formatCashAmount(row.notesInfo, currency),
    net: formatCashAmount(row.net, currency),
    netClass: signClass(row.net),
    cumulative: formatCashAmount(row.cumulative, currency),
    cumulativeClass: signClass(row.cumulative),
  }));
}

/** Arama metni (ZTO satır `textContent`). */
export function cashFlowSearchText(row: CashFlowDisplayRow): string {
  return [
    row.label,
    row.receivableDue,
    row.receivedChecks,
    row.issuedChecks,
    row.notes,
    row.net,
    row.cumulative,
  ].join(" ");
}

/** Süzgeç (Blackrose eki): şirket ("" = konsolide; ≥ 2 şirkette) ve para birimi ("" = TL karşılığı). */
export type CashFlowFilters = { companyId: string; currency: string };

export function cashFlowParams(filters: CashFlowFilters, multiCompany: boolean): CashFlowParams {
  return {
    weeks: CASH_FLOW_DEFAULT_WEEKS,
    currency: filters.currency || undefined,
    companyId: multiCompany ? filters.companyId || null : undefined,
  };
}
