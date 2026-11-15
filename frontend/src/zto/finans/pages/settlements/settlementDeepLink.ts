import type { PayMethod, SettlementType } from "../../../../pages/finance/types";

/*
 * Ödemeler / Tahsilatlar sayfa açılış parametreleri (12.2a_TASARIM §5.3; ZTO Payments.cshtml:2027-2060,
 * pjs handleUrlParameters :357-515, CollectionConfig). Saf ayrıştırıcı: sayfa ilk çizimde okur, modal
 * ön değerlerini kurar ve okunan anahtarları URL'den siler (ZTO `history.replaceState`).
 */

/** ZTO metni ve Blackrose kodu → yöntem ("Banka Havalesi/Eft" ZTO seçenek metni de kabul edilir). */
const METHOD_ALIASES: Readonly<Record<string, PayMethod>> = {
  nakit: "CASH",
  cash: "CASH",
  banka: "BANK",
  "banka havalesi/eft": "BANK",
  bank: "BANK",
  çek: "CHECK",
  cek: "CHECK",
  check: "CHECK",
  senet: "NOTE",
  note: "NOTE",
  "kredi kartı": "CREDIT_CARD",
  "kredi karti": "CREDIT_CARD",
  credit_card: "CREDIT_CARD",
};

/**
 * Türkçe metinler tr küçük harfiyle ("KREDİ KARTI" → "kredi kartı"), kodlar dilden bağımsız küçük
 * harfle eşlenir (tr'de "CREDIT_CARD" → "credıt_card" olurdu).
 */
export function parseMethodParam(value: string | null | undefined): PayMethod | undefined {
  const raw = (value ?? "").trim();
  if (!raw) return undefined;
  return METHOD_ALIASES[raw.toLocaleLowerCase("tr")] ?? METHOD_ALIASES[raw.toLowerCase()];
}

function isTrue(value: string | null): boolean {
  return (value ?? "").trim().toLowerCase() === "true";
}

function text(value: string | null): string | undefined {
  const v = (value ?? "").trim();
  return v ? v : undefined;
}

export type SettlementDeepLink = {
  /** `id`: cari (liste süzgeci + modal ön seçimi). */
  accountId?: string;
  /** `openModal=true`: Yeni Ödeme / Yeni Tahsilat. */
  openAdd: boolean;
  /** `openEditPayment=true&paymentId=` / `openEditCollection=true&collectionId=`. */
  editId?: string;
  /** `bankId` ya da `cashId`. */
  fundAccountId?: string;
  /** `workPlaceId`. */
  branchId?: string;
  /** `currencyId` (ISO kod). */
  currency?: string;
  /** `paymentMethod` / `collectionMethod`. */
  method?: PayMethod;
  /** `settlementId`: Detay modalı (backend kaynak rotası). */
  settlementId?: string;
};

/** Türe göre ZTO parametre adları. */
export function paramNames(type: SettlementType) {
  return type === "PAYMENT"
    ? { edit: "openEditPayment", editId: "paymentId", method: "paymentMethod" }
    : { edit: "openEditCollection", editId: "collectionId", method: "collectionMethod" };
}

/** Okunup URL'den silinen anahtarlar. */
export function consumedKeys(type: SettlementType): string[] {
  const names = paramNames(type);
  return [
    "id",
    "openModal",
    names.edit,
    names.editId,
    "bankId",
    "cashId",
    "workPlaceId",
    "currencyId",
    names.method,
    "settlementId",
  ];
}

export function parseSettlementDeepLink(
  type: SettlementType,
  params: URLSearchParams,
): SettlementDeepLink {
  const names = paramNames(type);
  const editId = isTrue(params.get(names.edit)) ? text(params.get(names.editId)) : undefined;
  return {
    accountId: text(params.get("id")),
    openAdd: isTrue(params.get("openModal")) && !editId,
    editId,
    fundAccountId: text(params.get("bankId")) ?? text(params.get("cashId")),
    branchId: text(params.get("workPlaceId")),
    currency: text(params.get("currencyId"))?.toUpperCase(),
    method: parseMethodParam(params.get(names.method)),
    settlementId: text(params.get("settlementId")),
  };
}

/** Okunan anahtarlar silinmiş arama metni (`?` olmadan); değişiklik yoksa null. */
export function remainingSearch(type: SettlementType, params: URLSearchParams): string | null {
  const keys = consumedKeys(type);
  if (!keys.some((key) => params.has(key))) return null;
  const next = new URLSearchParams(params);
  for (const key of keys) next.delete(key);
  return next.toString();
}
