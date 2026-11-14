import { describe, expect, it } from "vitest";
import { makeFund } from "./transferCenterTestUtils";
import {
  calculateFx,
  computedField,
  costSummary,
  costsOnSource,
  directionPair,
  editTargetAmount,
  formatAmountInput,
  fromRateOperation,
  parseAmountInput,
  rateCurrencyLabel,
  round,
  toCalcMode,
  toRateOperation,
} from "./fxCalcLogic";

describe("parseAmountInput (ZTO :1720-1734)", () => {
  it("tr-TR, düz ve US biçimleri; boş/geçersiz 0", () => {
    expect(parseAmountInput("1.234,56")).toBe(1234.56);
    expect(parseAmountInput("1234.56")).toBe(1234.56);
    expect(parseAmountInput("1,234.56")).toBe(1234.56);
    expect(parseAmountInput(" 12 500,5 ")).toBe(12500.5);
    expect(parseAmountInput("")).toBe(0);
    expect(parseAmountInput(null)).toBe(0);
    expect(parseAmountInput("abc")).toBe(0);
    expect(parseAmountInput(42)).toBe(42);
    expect(parseAmountInput(Number.NaN)).toBe(0);
    expect(parseAmountInput("   ")).toBe(0);
  });

  it("round ve tr-TR giriş biçimi", () => {
    expect(round(1.005)).toBe(1.01);
    expect(round(-1.005)).toBe(-1.01);
    expect(round(Number.POSITIVE_INFINITY)).toBe(0);
    expect(round(1.23456789, 6)).toBe(1.234568);
    expect(formatAmountInput(1234.5)).toBe("1.234,50");
    expect(formatAmountInput(0)).toBe("");
  });
});

describe("calculateFx — üç kip × iki işlem", () => {
  it("Kaynak + Kur => Hedef", () => {
    expect(
      calculateFx({ mode: "source-rate", operation: "/", source: 3400, rate: 34, target: 0 }),
    ).toEqual({
      source: 3400,
      rate: 34,
      target: 100,
      effectiveRate: 1 / 34,
    });
    expect(
      calculateFx({ mode: "source-rate", operation: "*", source: 100, rate: 34.1234, target: 0 })
        .target,
    ).toBe(3412.34);
    expect(
      calculateFx({ mode: "source-rate", operation: "/", source: 100, rate: 0, target: 0 }),
    ).toMatchObject({
      target: 0,
      effectiveRate: 0,
    });
  });

  it("Kur + Hedef => Kaynak", () => {
    expect(
      calculateFx({ mode: "rate-target", operation: "/", source: 0, rate: 34, target: 100 }).source,
    ).toBe(3400);
    expect(
      calculateFx({ mode: "rate-target", operation: "*", source: 0, rate: 34, target: 3400 })
        .source,
    ).toBe(100);
    expect(
      calculateFx({ mode: "rate-target", operation: "*", source: 0, rate: 0, target: 3400 }).source,
    ).toBe(0);
  });

  it("Kaynak + Hedef => Kur (6 hane; sunucu ±0,01 denetimini büyük tutarda da sağlar)", () => {
    const divide = calculateFx({
      mode: "source-target",
      operation: "/",
      source: 1_000_000,
      rate: 0,
      target: 30_000,
    });
    expect(divide.rate).toBe(33.333333);
    expect(Math.abs(1_000_000 / divide.rate - 30_000)).toBeLessThanOrEqual(0.01);
    expect(divide.effectiveRate).toBeCloseTo(0.03, 10);
    const multiply = calculateFx({
      mode: "source-target",
      operation: "*",
      source: 100,
      rate: 0,
      target: 3412.34,
    });
    expect(multiply.rate).toBe(34.1234);
    expect(
      calculateFx({ mode: "source-target", operation: "*", source: 0, rate: 5, target: 10 })
        .effectiveRate,
    ).toBe(0);
  });

  it("hesaplanan alan ve kur eki", () => {
    expect(computedField("source-rate")).toBe("target");
    expect(computedField("rate-target")).toBe("source");
    expect(computedField("source-target")).toBe("rate");
    expect(rateCurrencyLabel("/", "₺", "$")).toBe("₺/$");
    expect(rateCurrencyLabel("*", "₺", "$")).toBe("$/₺");
  });

  it("sunucu eşlemeleri", () => {
    expect(toRateOperation("*")).toBe("MULTIPLY");
    expect(toRateOperation("/")).toBe("DIVIDE");
    expect(fromRateOperation("MULTIPLY")).toBe("*");
    expect(fromRateOperation("DIVIDE")).toBe("/");
    expect(fromRateOperation(null)).toBe("/");
    expect(toCalcMode("source-rate")).toBe("SOURCE_RATE");
    expect(toCalcMode("rate-target")).toBe("RATE_TARGET");
    expect(toCalcMode("source-target")).toBe("SOURCE_TARGET");
  });
});

/*
 * Sunucu FX_AMOUNT_MISMATCH denetiminin kipe bağlı sözleşmesi (F-12.2-1, F-12.2-R1, T-12.2-01):
 * sunucu hesaplanan tarafı doğrular — SOURCE_RATE hedefi (round2(kaynak op kur) ± 0,01),
 * RATE_TARGET kaynağı (round2(hedef op⁻¹ kur) ± 0,01), SOURCE_TARGET kuru (round6(oran) ± 1e-6).
 * Ön yüz hesabı ZTO ile aynı kalır; kullanıcının yazdığı tutarlar değişmeden gönderilir.
 */
function serverAccepts(
  mode: "source-rate" | "rate-target" | "source-target",
  operation: "*" | "/",
  { source, rate, target }: { source: number; rate: number; target: number },
): boolean {
  const divide = operation === "/";
  const eps = 1e-9;
  if (mode === "rate-target") {
    const expected = round(divide ? target * rate : target / rate, 2);
    return Math.abs(expected - source) <= 0.01 + eps;
  }
  if (mode === "source-target") {
    const expected = round(divide ? source / target : target / source, 6);
    return Math.abs(expected - rate) <= 0.000001 + eps;
  }
  return Math.abs(round(divide ? source / rate : source * rate, 2) - target) <= 0.01 + eps;
}

/** Kipten bağımsız eski sunucu kuralı (yalnız SOURCE_RATE için doğru). */
function legacyTargetCheck(
  operation: "*" | "/",
  r: { source: number; rate: number; target: number },
) {
  const expected = round(operation === "/" ? r.source / r.rate : r.source * r.rate, 2);
  return Math.abs(expected - r.target) <= 0.01 + 1e-9;
}

describe("calculateFx — sunucu kipe bağlı tutar denetimi (F-12.2-1)", () => {
  it("Kur + Hedef => Kaynak, ×: kesirli kurda kaynak 2 haneye yuvarlanır ve kabul edilir", () => {
    const usdTry = calculateFx({
      mode: "rate-target",
      operation: "*",
      source: 0,
      rate: 34.5,
      target: 1000,
    });
    expect(usdTry.source).toBe(28.99);
    expect(usdTry.target).toBe(1000);
    expect(serverAccepts("rate-target", "*", usdTry)).toBe(true);
    // Eski kipten bağımsız kural bu kaydı reddediyordu (28,99 × 34,5 = 1000,16).
    expect(legacyTargetCheck("*", usdTry)).toBe(false);
    const other = calculateFx({
      mode: "rate-target",
      operation: "*",
      source: 0,
      rate: 34.1234,
      target: 1000,
    });
    expect(other.source).toBe(29.31);
    expect(serverAccepts("rate-target", "*", other)).toBe(true);
  });

  it("Kur + Hedef => Kaynak, /: kur 1'den küçükken (0,03) kaynak kabul edilir", () => {
    const r = calculateFx({
      mode: "rate-target",
      operation: "/",
      source: 0,
      rate: 0.03,
      target: 33_345.6,
    });
    expect(r.source).toBe(1000.37);
    expect(serverAccepts("rate-target", "/", r)).toBe(true);
    expect(legacyTargetCheck("/", r)).toBe(false);
  });

  it("Kaynak + Hedef => Kur: 6 haneli kur büyük tutarda ve kur < 1 iken kabul edilir", () => {
    const cases: Array<["*" | "/", number, number, number]> = [
      ["*", 100_000, 3_412_345.67, 34.123457],
      ["*", 100_000.37, 3_456_789.12, 34.567763],
      ["/", 1000, 33_345.67, 0.029989],
      ["*", 1_000_000, 33_345_670.12, 33.34567],
    ];
    for (const [operation, source, target, rate] of cases) {
      const r = calculateFx({ mode: "source-target", operation, source, rate: 0, target });
      expect(r.rate, `${operation} ${source}→${target}`).toBe(rate);
      expect(r.source).toBe(source);
      expect(r.target).toBe(target);
      expect(serverAccepts("source-target", operation, r)).toBe(true);
    }
    // 1000 USD → 33.345,67 TRY "/": eski kural hedefi 33.345,56 bekliyordu (fark 0,11).
    const legacy = calculateFx({
      mode: "source-target",
      operation: "/",
      source: 1000,
      rate: 0,
      target: 33_345.67,
    });
    expect(legacyTargetCheck("/", legacy)).toBe(false);
  });

  it("uyuşmayan değerler yine reddedilir", () => {
    expect(serverAccepts("source-rate", "*", { source: 100, rate: 34.5, target: 3450.02 })).toBe(
      false,
    );
    expect(serverAccepts("rate-target", "*", { source: 29.01, rate: 34.5, target: 1000 })).toBe(
      false,
    );
    expect(
      serverAccepts("source-target", "*", { source: 100_000, rate: 34.1234, target: 3_412_345.67 }),
    ).toBe(false);
  });

  it("her kip × işlem için rastgele girdilerde hesap sunucu denetiminden geçer", () => {
    let seed = 20261114;
    const next = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const modes = ["source-rate", "rate-target", "source-target"] as const;
    for (const mode of modes) {
      for (const operation of ["*", "/"] as const) {
        for (let i = 0; i < 300; i++) {
          const amount = round(1 + next() * 2_000_000, 2);
          const fx = round(0.01 + next() * 60, 4);
          const input =
            mode === "source-rate"
              ? { source: amount, rate: fx, target: 0 }
              : mode === "rate-target"
                ? { source: 0, rate: fx, target: amount }
                : {
                    source: amount,
                    rate: 0,
                    target: round(operation === "/" ? amount / fx : amount * fx, 2) || 0.01,
                  };
          const r = calculateFx({ mode, operation, ...input });
          expect(
            serverAccepts(mode, operation, r),
            `${mode} ${operation} ${JSON.stringify(input)}`,
          ).toBe(true);
        }
      }
    }
  });
});

describe("maliyet (KMV TL tabanı — B13 düzeltmesi)", () => {
  const base = { kmvRate: 0.2, commission: 10, fee: 5, source: 100, target: 3400 };

  it("TL hedefte: KMV = hedef × oran / 100", () => {
    const costs = costSummary({ ...base, sourceCurrency: "USD", targetCurrency: "TRY" });
    expect(costs).toEqual({
      kmvBase: 3400,
      kmv: 6.8,
      commission: 10,
      fee: 5,
      total: 21.8,
      kmvSide: "target",
    });
    expect(costsOnSource(costs, "", "f1")).toBe(15);
    expect(costsOnSource(costs, "f9", "f1")).toBe(0);
  });

  it("TL kaynakta KMV kaynak fondan; TL yoksa KMV 0 ve taban null", () => {
    const tlSource = costSummary({
      ...base,
      source: 3400,
      target: 100,
      sourceCurrency: "TRY",
      targetCurrency: "USD",
    });
    expect(tlSource.kmvSide).toBe("source");
    expect(costsOnSource(tlSource, "f1", "f1")).toBe(21.8);
    const none = costSummary({
      ...base,
      commission: -1,
      sourceCurrency: "USD",
      targetCurrency: "EUR",
    });
    expect(none).toMatchObject({ kmvBase: null, kmv: 0, commission: 0, total: 5, kmvSide: null });
  });

  it("düzenleme hedef tutarı ve yön çifti", () => {
    expect(editTargetAmount(100, 34, "*")).toBe(3400);
    expect(editTargetAmount(3400, 34, "/")).toBe(100);
    expect(editTargetAmount(0, 34, "*")).toBe(0);
    expect(editTargetAmount(10, 0, "*")).toBe(0);
    expect(directionPair(makeFund({ currency: "USD" }), makeFund())).toEqual(["USD", "TRY"]);
    expect(directionPair(null, null)).toEqual(["", ""]);
  });
});
