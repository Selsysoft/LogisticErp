import type { Fund, FxCalcMode, RateOperation } from "../../../../pages/finance/types";

/*
 * Döviz bozumu hesapları (12.2_TASARIM §5.11 "Tutar satırı"; ZTO bsjs `calculateTransfer` :1736-1811,
 * `parseAmountInput` :1720-1734, `updateRateCurrencyLabel` :519-525, `updateExchangeCalcModeUI`
 * :871-891, `recalculateEditExchangeTargetAmount` :466-491). Çapraz kur yok (S-3).
 */

/** `÷/×` düğmesi (`selectedCalculationOperation`; varsayılan "/"). */
export type CalcOperation = "*" | "/";
/** `#exchangeCalcMode` değerleri. */
export type ZtoCalcMode = "source-rate" | "rate-target" | "source-target";

/** Sayıyı verilen ondalığa yuvarlar (yarım yukarı, kayan nokta düzeltmeli). */
export function round(value: number, digits = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round((value + Math.sign(value) * Number.EPSILON) * factor) / factor;
}

/**
 * ZTO `parseAmountInput`: son virgül son noktadan sonraysa tr-TR ("1.234,56"), değilse düz/US
 * ("1234.56", "1,234.56"); boş ya da geçersizde 0.
 */
export function parseAmountInput(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  let text = String(value).trim().replace(/\s/g, "");
  if (!text) return 0;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  text = lastComma > lastDot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  const parsed = parseFloat(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

const N2 = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ZTO `formatNumber` (tr-TR, 2 hane); hesaplanan alanlara yazılan metin. */
export function formatAmountInput(value: number): string {
  return value > 0 ? N2.format(value) : "";
}

export type FxInputs = {
  mode: ZtoCalcMode;
  operation: CalcOperation;
  source: number;
  rate: number;
  target: number;
};

export type FxResult = {
  source: number;
  rate: number;
  target: number;
  /** Yan paneldeki "Efektif Kur" ("/" kipinde 1 / kur). */
  effectiveRate: number;
};

/**
 * Hesaplama kipine göre eksik değeri çözer. "/" → hedef = kaynak ÷ kur; "×" → hedef = kaynak × kur;
 * "Kur + Hedef => Kaynak" ve "Kaynak + Hedef => Kur" ters çözülür. Tutarlar 2, hesaplanan kur 6 hane.
 * Sunucu `calcMode`'a göre hesaplanan tarafı doğrulamalıdır (F-12.2-1): SOURCE_RATE hedefi,
 * RATE_TARGET kaynağı (round2 ± 0,01), SOURCE_TARGET kuru (round6 ± 1e-6); kipten bağımsız hedef
 * denetimi bu iki kipte kesirli kurlarda 422 FX_AMOUNT_MISMATCH üretir (fxCalcLogic.test.ts).
 */
export function calculateFx({ mode, operation, source, rate, target }: FxInputs): FxResult {
  const divide = operation === "/";
  const effectiveRate = divide ? (rate > 0 ? 1 / rate : 0) : rate;
  if (mode === "source-rate") {
    const computed = rate > 0 ? (divide ? source / rate : source * rate) : 0;
    return { source, rate, target: round(computed), effectiveRate };
  }
  if (mode === "rate-target") {
    const computed = rate > 0 ? (divide ? target * rate : target / rate) : 0;
    return { source: round(computed), rate, target, effectiveRate };
  }
  if (source > 0 && target > 0) {
    const solved = divide ? source / target : target / source;
    const solvedRate = round(solved, 6);
    return {
      source,
      rate: solvedRate,
      target,
      effectiveRate: divide ? target / source : solved,
    };
  }
  return { source, rate, target, effectiveRate: 0 };
}

/** Kipte salt okunur (hesaplanan) alan (`readonly-amount`). */
export function computedField(mode: ZtoCalcMode): "source" | "rate" | "target" {
  if (mode === "rate-target") return "source";
  if (mode === "source-target") return "rate";
  return "target";
}

/** "₺/$" eki: "×" → hedef/kaynak, "/" → kaynak/hedef sembolü. */
export function rateCurrencyLabel(
  operation: CalcOperation,
  source: string,
  target: string,
): string {
  return operation === "*" ? `${target}/${source}` : `${source}/${target}`;
}

export function toRateOperation(operation: CalcOperation): RateOperation {
  return operation === "*" ? "MULTIPLY" : "DIVIDE";
}

export function fromRateOperation(operation: RateOperation | null | undefined): CalcOperation {
  return operation === "MULTIPLY" ? "*" : "/";
}

export function toCalcMode(mode: ZtoCalcMode): FxCalcMode {
  if (mode === "rate-target") return "RATE_TARGET";
  if (mode === "source-target") return "SOURCE_TARGET";
  return "SOURCE_RATE";
}

export type CostInputs = {
  kmvRate: number;
  commission: number;
  fee: number;
  source: number;
  target: number;
  sourceCurrency: string | null;
  targetCurrency: string | null;
};

export type CostSummary = {
  /** KMV tabanı TL taraf (B13 düzeltmesi); TL taraf yoksa null (sunucu 422 KMV_REQUIRES_TRY). */
  kmvBase: number | null;
  kmv: number;
  commission: number;
  fee: number;
  total: number;
  /** KMV'nin düştüğü taraf (TL taraf). */
  kmvSide: "source" | "target" | null;
};

/** Maliyet paneli: KMV = TL taraf × oran / 100, Komisyon, Masraf, TOPLAM (hepsi ₺ gösterilir). */
export function costSummary(input: CostInputs): CostSummary {
  const kmvSide =
    input.sourceCurrency === "TRY" ? "source" : input.targetCurrency === "TRY" ? "target" : null;
  const kmvBase = kmvSide === "source" ? input.source : kmvSide === "target" ? input.target : null;
  const kmv = kmvBase !== null && input.kmvRate > 0 ? round((kmvBase * input.kmvRate) / 100) : 0;
  const commission = Math.max(0, input.commission);
  const fee = Math.max(0, input.fee);
  return { kmvBase, kmv, commission, fee, total: round(kmv + commission + fee), kmvSide };
}

/**
 * Kaynak fondan düşecek masraflar (BS-12 eşiği): Komisyon/Masraf masraf bankası boşsa ya da kaynaksa,
 * KMV TL taraf kaynaksa.
 */
export function costsOnSource(
  costs: CostSummary,
  costFundId: string,
  sourceFundId: string,
): number {
  const onSource = !costFundId || costFundId === sourceFundId;
  return round(
    (onSource ? costs.commission + costs.fee : 0) + (costs.kmvSide === "source" ? costs.kmv : 0),
  );
}

/** BS-3 düzenleme: hedef = kaynak × kur ("*") ya da kaynak ÷ kur ("/"); geçersizde 0. */
export function editTargetAmount(source: number, rate: number, operation: CalcOperation): number {
  if (!(source > 0) || !(rate > 0)) return 0;
  return round(operation === "/" ? source / rate : source * rate);
}

/** Kaynak/hedef döviz kodları ("USD → TRY" yön çifti, `#exchangeDirectionPair`). */
export function directionPair(source: Fund | null, target: Fund | null): [string, string] {
  return [source?.currency ?? "", target?.currency ?? ""];
}
