/*
 * Kur Farkı Raporu saf mantığı (12.8_TASARIM §5.7; ZTO Views/RecipeFinance/FxReport.cshtml + JS
 * `fxLoadRates`/`fxCut`). Para alanları ondalık metindir (`zto/decimal.ts`); fark sunucuda hesaplanır
 * (OK-12.8-5), istemci yalnız gösterir ve onaylanan farkı `expectedDifference` olarak geri gönderir.
 */
import { ApiError } from "../../../../api/client";
import type { FxDifferencesParams } from "../../../../pages/finance/reportApi";
import type { FxCutState, FxDifferenceRow, LedgerSide } from "../../../../pages/finance/types";
import { cmpDec, subDec } from "../../../decimal";
import { currencySymbol, formatDate, formatN2, formatNumber } from "../../../format";

/** "Kes" düğmesini kapatan neden (öncelik sırasıyla; Rev 1 F4/F7). */
export type FxCutBlock = "INACTIVE" | "SETTLED" | "AFTER_VALUATION" | "NO_RATE" | "ZERO";

/** 0,01 TL altı fark kesilmez (sunucu `FX_DIFFERENCE_ZERO`; ZTO `Math.abs(diff) < 0.01`). */
const MIN_DIFFERENCE = "0.01";

/** |x| (ondalık metin). */
export function absDec(value: string): string {
  return cmpDec(value, "0") < 0 ? subDec("0", value) : subDec(value, "0");
}

/**
 * Kes düğmesinin kapalı olma nedeni; null = etkin. Etkin yalnız kurlar getirilmişken, değerleme engeli
 * yokken, fark ≥ 0,01 ve cari aktifken (§5.7). `title` öncelik: pasif cari > SETTLED > AFTER_VALUATION.
 */
export function cutBlock(row: FxDifferenceRow, withRates: boolean): FxCutBlock | null {
  if (!row.accountActive) return "INACTIVE";
  if (row.valuationBlock === "SETTLED") return "SETTLED";
  if (row.valuationBlock === "AFTER_VALUATION") return "AFTER_VALUATION";
  if (!withRates || row.difference === null) return "NO_RATE";
  if (cmpDec(absDec(row.difference), MIN_DIFFERENCE) < 0) return "ZERO";
  return null;
}

/** Kapalı düğmenin `title` anahtarı ve değerleri; ZTO varsayılan başlığı ("Kur farkı cari kaydını kes") için null. */
export function cutBlockTitle(
  block: FxCutBlock | null,
  row: FxDifferenceRow,
): { key: string; values?: Record<string, string> } | null {
  switch (block) {
    case "INACTIVE":
    case "AFTER_VALUATION":
      return { key: `fxReport.blocked.${block}` };
    case "SETTLED":
      return { key: "fxReport.blocked.SETTLED", values: { date: formatDate(row.closedOn) } };
    default:
      return null;
  }
}

/** Yön rozeti: CREDIT = "Borç" (`badge-danger`), DEBIT = "Alacak" (`badge-success`) — ZTO `Kind`. */
export function directionBadge(direction: FxDifferenceRow["direction"]): {
  className: string;
  key: "debt" | "credit";
} {
  return direction === "CREDIT"
    ? { className: "badge badge-danger", key: "debt" }
    : { className: "badge badge-success", key: "credit" };
}

/** Fark metni: ZTO `(diff >= 0 ? '+' : '') + N2`; fark yoksa "-". */
export function formatDifference(difference: string | null): string {
  if (difference === null) return "-";
  const text = formatN2(difference);
  return cmpDec(difference, "0") >= 0 ? `+${text}` : text;
}

/** Fark hücresi sınıfı: GAIN `fx-pos`, LOSS `fx-neg` (ZTO lehimize/aleyhimize). */
export function differenceClass(row: FxDifferenceRow): string {
  if (row.effect === "GAIN") return "text-right fx-diff fx-pos";
  if (row.effect === "LOSS") return "text-right fx-diff fx-neg";
  return "text-right fx-diff";
}

/** Kur hücresi (N4) ya da "-". */
export function formatRate(rate: string | null): string {
  return rate === null ? "-" : formatNumber(rate, 4);
}

/** Tutar hücresi (N2) ya da "-". */
export function formatAmount(amount: string | null): string {
  return amount === null ? "-" : formatN2(amount);
}

/**
 * Kesilecek belgenin yanı (§3.2.3 adım 12): fark pozitifse kaynağın yönü, değilse tersi; DEBIT =
 * Alacak (RECEIVABLE). `same` = belge kaynakla aynı yönde (ZTO "aynı yön"/"ters yön").
 */
export function cutSide(row: FxDifferenceRow): { side: LedgerSide; same: boolean } {
  const positive = row.difference !== null && cmpDec(row.difference, "0") > 0;
  const docDebit = (row.direction === "DEBIT") === positive;
  return { side: docDebit ? "RECEIVABLE" : "PAYABLE", same: positive };
}

/** Kaynak kısmen açık mı (`0 < openRemaining < amount`; onay uyarısı, Rev 1 F4). */
export function isPartiallyOpen(row: FxDifferenceRow): boolean {
  return cmpDec(row.openRemaining, "0") > 0 && cmpDec(row.openRemaining, row.amount) < 0;
}

/** Onay metninin ikinci (ve kısmen açık kaynakta üçüncü) satırının değerleri. */
export function confirmValues(row: FxDifferenceRow): {
  amount: string;
  side: LedgerSide;
  same: boolean;
  rate: string;
  date: string;
  partial: { amount: string; currency: string } | null;
} {
  const { side, same } = cutSide(row);
  return {
    amount: formatN2(absDec(row.difference ?? "0")),
    side,
    same,
    rate: formatRate(row.currentRate),
    date: formatDate(row.currentRateDate),
    partial: isPartiallyOpen(row)
      ? { amount: formatN2(row.openRemaining), currency: row.currency }
      : null,
  };
}

/** `details` ("anahtar=değer") listesinden değer. */
export function detailValue(details: readonly string[] | undefined, key: string): string | null {
  const prefix = `${key}=`;
  const hit = (details ?? []).find((item) => item.startsWith(prefix));
  return hit === undefined ? null : hit.slice(prefix.length);
}

/**
 * Kesim hatasının iletisi (§5.7): kod bazlı özel metin, diğerinde sunucu iletisi. `refetch` = rapor
 * otomatik yeniden sorgulanır (`FX_DIFFERENCE_CHANGED`, `FX_SOURCE_SETTLED`).
 */
export function cutErrorMessage(error: unknown): {
  key: string | null;
  values?: Record<string, string>;
  message: string | null;
  refetch: boolean;
} {
  if (error instanceof ApiError || isApiErrorLike(error)) {
    const body = (error as ApiError).body;
    const code = body?.code;
    switch (code) {
      case "FX_DIFFERENCE_EXISTS":
        return {
          key: "fxReport.errors.FX_DIFFERENCE_EXISTS",
          values: { documentNo: detailValue(body.details, "documentNo") ?? "-" },
          message: null,
          refetch: true,
        };
      case "FX_DIFFERENCE_ZERO":
      case "FX_SOURCE_NOT_FOUND":
        return { key: `fxReport.errors.${code}`, message: null, refetch: false };
      case "FX_DIFFERENCE_CHANGED":
        return { key: "fxReport.errors.FX_DIFFERENCE_CHANGED", message: null, refetch: true };
      case "FX_SOURCE_SETTLED":
        return {
          key: "fxReport.errors.FX_SOURCE_SETTLED",
          values: { date: formatDate(detailValue(body.details, "closedOn")) },
          message: null,
          refetch: true,
        };
      default:
        return body?.message
          ? { key: null, message: body.message, refetch: false }
          : { key: "fxReport.errors.generic", message: null, refetch: false };
    }
  }
  return { key: "fxReport.errors.generic", message: null, refetch: false };
}

function isApiErrorLike(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "body" in error &&
    typeof (error as { body?: unknown }).body === "object"
  );
}

/**
 * Kur yenileme hatasında snackbar gösterilir mi (Rev 1 FE-FXR-REFRESH-ERR): uç TCMB hatasını yutar ve
 * 202 döner; hata dalı yalnız ağ (ApiError olmayan), 403 ve 5xx'tir.
 */
export function shouldNotifyRefreshError(error: unknown): boolean {
  if (error instanceof ApiError || isApiErrorLike(error)) {
    const status = (error as { status?: number }).status ?? 0;
    return status === 403 || status >= 500;
  }
  return error !== undefined && error !== null;
}

/** Süzgeç durumu (Blackrose eki satırı; §5.7). */
export type FxFilters = {
  /** "" = tüm şirketler (konsolide); yalnız ≥ 2 şirkette seçilir. */
  companyId: string;
  accountId: string;
  accountLabel: string;
  currency: string;
  cutState: FxCutState;
  /** `"YYYY-MM-DD"`; varsayılan bugün. */
  valuationDate: string;
};

export function defaultFxFilters(today: string, companyId = ""): FxFilters {
  return {
    companyId,
    accountId: "",
    accountLabel: "",
    currency: "",
    cutState: "ALL",
    valuationDate: today,
  };
}

/**
 * Rapor parametreleri. Tek şirkette `companyId` gönderilmez (aktif şirket kuralı); çok şirkette ""
 * konsolide (null), dolu değer o şirket.
 */
export function fxParams(
  filters: FxFilters,
  withRates: boolean,
  multiCompany: boolean,
): FxDifferencesParams {
  return {
    companyId: multiCompany ? filters.companyId || null : undefined,
    accountId: filters.accountId || undefined,
    currency: filters.currency || undefined,
    cutState: filters.cutState,
    valuationDate: filters.valuationDate || undefined,
    withRates,
  };
}

/** Para birimi seçenekleri: TRY hariç (yalnız TL dışı kayıtlar listelenir). */
export function foreignCurrencies<T extends { code: string }>(currencies: readonly T[]): T[] {
  return currencies.filter((currency) => currency.code !== "TRY");
}

/** Kaynak etiketi: ACCOUNT_DOCUMENT'ta belge türü adı, diğerinde `fxReport.source.<tür>` anahtarı. */
export function sourceLabel(row: FxDifferenceRow, label: (sourceType: string) => string): string {
  return row.documentTypeName ?? label(row.sourceType);
}

/** ZtoRcpTable arama metni (ZTO satır `textContent`'i). */
export function rowSearchText(row: FxDifferenceRow, kind: string, source: string): string {
  return [
    kind,
    formatDate(row.transactionDate),
    row.accountName,
    row.accountCode,
    row.documentNo ?? "",
    source,
    formatN2(row.amount),
    row.currency,
    currencySymbol(row.currency),
    formatRate(row.transactionRate),
    formatN2(row.tlAmount),
    formatRate(row.currentRate),
    formatAmount(row.currentTl),
    formatDifference(row.difference),
    row.cut?.documentNo ?? "",
  ].join(" ");
}

/** Sunucu sayfa sınırını aşan sonuç (ZTO sabit 500 yerine; OK-12.8-22). */
export function isTruncated(totalElements: number, rowCount: number): boolean {
  return totalElements > rowCount;
}
