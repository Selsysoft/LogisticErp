/**
 * Para tutarları için ondalık aritmetik (12.2a_TASARIM §4, Rev 1 F-5/SEC-04). API'de `Money.amount`
 * ve "decimal" alanlar ondalık metindir ("1500.25"); istemci toplama ve karşılaştırmayı `number`
 * (IEEE-754) ile yapmaz — `0.1 + 0.2 !== 0.3` sınırda sahte "aşım" üretir. Değerler 10⁴ ölçekli
 * `bigint`'e çevrilir (sunucu `numeric(_, 4)` ile aynı kesinlik), işlem tam sayıda yapılır, sonuç
 * yine ondalık metin döner.
 *
 * Girdi (`DecimalInput`):
 * - `string`: "1500", "1500.25", "-0.5", ".5", "+3" (nokta ondalık ayırıcı; binlik ayırıcı ve
 *   virgül kabul edilmez — kullanıcı girişi önce `parseTrNumber` ile sayıya çevrilir), baş/son boşluk
 *   yok sayılır;
 * - `number`: sonlu sayı (ör. `parseTrNumber` çıktısı); en yakın 10⁻⁶'ya getirilip ölçeklenir;
 * - `bigint`: **zaten ölçekli** değer (`toScaled` çıktısı) — `5n` = 0.0005;
 * - `null`/`undefined`/"" → 0.
 * 4 haneden fazla ondalık yarım yukarı (sıfırdan uzağa; Java `HALF_UP`) yuvarlanır. Geçersiz metin ya
 * da sonsuz sayı `RangeError` atar; kullanıcı girişini denetlemek için `tryScaled` kullanılır.
 */

export type DecimalInput = string | number | bigint | null | undefined;

/** Ondalık hane sayısı (ölçek). */
export const DEC_SCALE = 4;
/** 10⁴. */
export const DEC_FACTOR = 10n ** BigInt(DEC_SCALE);

const DECIMAL_TEXT = /^([+-])?(\d*)(?:\.(\d*))?$/;

/** "12.34567" gibi metni ölçekli bigint'e çevirir; biçim geçersizse null. */
function parseText(text: string): bigint | null {
  const trimmed = text.trim();
  if (trimmed === "") return 0n;
  const match = DECIMAL_TEXT.exec(trimmed);
  if (!match) return null;
  const [, sign, whole = "", fraction = ""] = match;
  if (whole === "" && fraction === "") return null;
  const padded = (fraction + "0".repeat(DEC_SCALE + 1)).slice(0, DEC_SCALE + 1);
  // Bir hane fazlası (yuvarlama hanesi): 10⁵ ölçekli mutlak değer. HALF_UP yalnız ilk atılan haneye
  // bakar (≥ 5 → yukarı); sonraki haneler sonucu değiştirmez.
  const extended = BigInt(whole || "0") * DEC_FACTOR * 10n + BigInt(padded);
  const rounded = (extended + 5n) / 10n;
  return sign === "-" ? -rounded : rounded;
}

/** Ölçekli değer; geçersiz girdide null (kullanıcı girişi denetimi için). */
export function tryScaled(value: DecimalInput): bigint | null {
  if (value === null || value === undefined) return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const text = value.toFixed(6);
    // 1e21 ve üstünde toFixed üstel gösterim döndürür.
    return /e/i.test(text) ? null : parseText(text);
  }
  return parseText(value);
}

/** Ölçekli (10⁴) bigint: `toScaled("0.1") + toScaled("0.2") === toScaled("0.3")`. */
export function toScaled(value: DecimalInput): bigint {
  const scaled = tryScaled(value);
  if (scaled === null) {
    throw new RangeError(`Geçersiz ondalık değer: ${String(value)}`);
  }
  return scaled;
}

/**
 * Ölçekli değeri ondalık metne çevirir: en az `minFractionDigits` (vars. 2, en çok 4) ondalık; fazla
 * sondaki sıfırlar atılır. `12345n` → "1.2345", `3000n` → "0.30", `-5n` → "-0.0005", `0n` → "0.00".
 * Biçimlendirme (binlik, virgül) değil, API/gövde metnidir; ekranda `formatN2` kullanılır.
 */
export function fromScaled(scaled: bigint, minFractionDigits = 2): string {
  const min = Math.max(0, Math.min(DEC_SCALE, Math.trunc(minFractionDigits)));
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const whole = (abs / DEC_FACTOR).toString();
  let fraction = (abs % DEC_FACTOR).toString().padStart(DEC_SCALE, "0");
  while (fraction.length > min && fraction.endsWith("0")) {
    fraction = fraction.slice(0, -1);
  }
  const text = fraction === "" ? whole : `${whole}.${fraction}`;
  return negative ? `-${text}` : text;
}

/** a + b (ondalık metin). */
export function addDec(a: DecimalInput, b: DecimalInput): string {
  return fromScaled(toScaled(a) + toScaled(b));
}

/** a − b (ondalık metin). */
export function subDec(a: DecimalInput, b: DecimalInput): string {
  return fromScaled(toScaled(a) - toScaled(b));
}

/** Karşılaştırma: a < b → -1, eşit → 0, a > b → 1 ("0.30" ile "0.3" eşittir). */
export function cmpDec(a: DecimalInput, b: DecimalInput): -1 | 0 | 1 {
  const x = toScaled(a);
  const y = toScaled(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** En küçük değer (ondalık metin); en az bir değer gerekir. */
export function minDec(first: DecimalInput, ...rest: DecimalInput[]): string {
  let min = toScaled(first);
  for (const value of rest) {
    const scaled = toScaled(value);
    if (scaled < min) min = scaled;
  }
  return fromScaled(min);
}

/** Toplam (ondalık metin); boş listede "0.00". */
export function sumDec(values: Iterable<DecimalInput>): string {
  let total = 0n;
  for (const value of values) total += toScaled(value);
  return fromScaled(total);
}
