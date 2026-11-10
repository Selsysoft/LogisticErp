import { CurrencyTotal } from "./types";

type QueryValue = string | number | null | undefined;

/** Boş filtreleri atarak sorgu metni kurar. */
export function reportQuery(params: Record<string, QueryValue>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

/** Payda sıfırsa sunucu boş döner; bu durum "%0" gibi gösterilmemelidir. */
export function formatPercent(value: number | null) {
  if (value === null) {
    return "—";
  }
  return `%${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(Number(value))}`;
}

/** Para birimleri toplanmaz; her biri ayrı yazılır. */
export function formatTotals(totals: CurrencyTotal[]) {
  if (totals.length === 0) {
    return "—";
  }
  const amount = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2 });
  return totals.map((row) => `${amount.format(row.total)} ${row.currency}`).join(" · ");
}
