import { createContext, useContext } from "react";

/**
 * Hızlı Bakiye Özeti modalı (ZTO `#treasuryModal`, CustomerAccounts/Index.cshtml:5048-5322; 12.8 §5.10).
 * ZtoFinansLayout sağlar; yan menü `quickBalance` öğesi, Cari Kartlar "Finansal Varlık Durumu" menüsü ve
 * `?treasury=1` açar. Veri kancası `reportApi.ts` `useTreasuryReport`; bu bağlam kancası onunla
 * karışmasın diye `useTreasuryModal` adını taşır (Rev 1 FE-USETREASURY-NAME).
 */
export type TreasuryApi = { open: () => void };

export const TreasuryContext = createContext<TreasuryApi | null>(null);

const NOOP: TreasuryApi = { open: () => undefined };

/** Layout dışında (ör. birim testi) `open` etkisizdir. */
export function useTreasuryModal(): TreasuryApi {
  return useContext(TreasuryContext) ?? NOOP;
}

/** `?treasury=1` adresle modal açılır (`quickCariContext` deseni). */
export const TREASURY_PARAM = "treasury";

export function hasTreasuryParam(search: string): boolean {
  return new URLSearchParams(search).get(TREASURY_PARAM) === "1";
}

/** Parametre silinmiş sorgu dizgisi ("?a=1" ya da ""). */
export function withoutTreasuryParam(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(TREASURY_PARAM);
  const rest = params.toString();
  return rest === "" ? "" : `?${rest}`;
}
