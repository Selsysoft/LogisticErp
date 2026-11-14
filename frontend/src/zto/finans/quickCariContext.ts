import { createContext, useContext } from "react";

/**
 * Hızlı Cari İşlemi modalı (ZTO `openQuickCariModal()`, _ProductionLayout.cshtml:3889-3898).
 * ZtoFinansLayout sağlar; yan menü öğesi ve AllTransactions boş durum düğmesi açar.
 */
export type QuickCariApi = { open: () => void };

export const QuickCariContext = createContext<QuickCariApi | null>(null);

const NOOP: QuickCariApi = { open: () => undefined };

/** Layout dışında (ör. birim testi) `open` etkisizdir. */
export function useQuickCari(): QuickCariApi {
  return useContext(QuickCariContext) ?? NOOP;
}

/** `?quickcari=1` adresle modal açılır (AllTransactions.cshtml:1400-1409). */
export const QUICK_CARI_PARAM = "quickcari";

export function hasQuickCariParam(search: string): boolean {
  return new URLSearchParams(search).get(QUICK_CARI_PARAM) === "1";
}

/** Parametre silinmiş sorgu dizgisi ("?a=1" ya da ""). */
export function withoutQuickCariParam(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(QUICK_CARI_PARAM);
  const rest = params.toString();
  return rest === "" ? "" : `?${rest}`;
}
