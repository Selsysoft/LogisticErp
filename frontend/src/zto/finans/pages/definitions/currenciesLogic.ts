/*
 * Para Birimleri saf mantığı (12.8_TASARIM §5.9; ZTO Views/Currency/Index.cshtml). Salt okunur kur
 * ekranı (OK-12.8-13): satır = `GET /finance/currencies`; "Kur Bilgisi" o günün (ya da öncesindeki son)
 * TCMB döviz alış kuru, "Kur Tarihi" kurun tarihidir. Kur tarihi `"YYYY-MM-DD"` dizgisidir; ekranda
 * `dd.MM.yyyy` (MWG `capture-location-agnostic-data`: `new Date` ile ayrıştırılmaz).
 */
import { currencySymbol, formatDate, formatNumber } from "../../../format";
import type { Rate } from "../../../../pages/finance/types";

export type CurrencyRow = {
  code: string;
  name: string;
  /** "₺ (TRY)". */
  symbolText: string;
  /** TRY'de null (kur yok, "—"); kur bulunamazsa da null. */
  rate: number | null;
  /** "YYYY-MM-DD" ya da null. */
  rateDate: string | null;
  /** TRY satırı (kur bilgisi "—"). */
  base: boolean;
};

export const BASE_CURRENCY = "TRY";

/** Para birimi satırları; kur aynı kodun `Rate` kaydından. */
export function currencyRows(
  currencies: ReadonlyArray<{ code: string; name: string }>,
  rates: readonly Rate[],
): CurrencyRow[] {
  const byCode = new Map(rates.map((rate) => [rate.currency.toUpperCase(), rate]));
  return currencies.map((currency) => {
    const code = currency.code.toUpperCase();
    const base = code === BASE_CURRENCY;
    const rate = base ? undefined : byCode.get(code);
    return {
      code,
      name: currency.name,
      symbolText: `${currencySymbol(code)} (${code})`,
      rate: rate && Number.isFinite(Number(rate.rate)) ? Number(rate.rate) : null,
      rateDate: rate?.rateDate ?? null,
      base,
    };
  });
}

/** Kur değeri 4 haneli tr-TR ("34,1234"). */
export function rateValueText(rate: number): string {
  return formatNumber(rate, 4);
}

/** "dd.MM.yyyy"; boşta "". */
export function rateDateText(value: string | null): string {
  return value ? formatDate(value) : "";
}
