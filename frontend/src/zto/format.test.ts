import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  currencySymbol,
  formatAmount,
  formatDate,
  formatDateTime,
  formatMoney,
  formatMoneyValue,
  formatN2,
  formatNumber,
  parseTrNumber,
  toIsoDate,
  toNumber,
} from "./format";

describe("toNumber", () => {
  it("sayı ve API dizgesini sayıya çevirir", () => {
    expect(toNumber(12.5)).toBe(12.5);
    expect(toNumber("1234.5000")).toBe(1234.5);
    expect(toNumber("-3")).toBe(-3);
  });

  it("boş ve geçersizde null", () => {
    expect(toNumber(null)).toBeNull();
    expect(toNumber(undefined)).toBeNull();
    expect(toNumber("")).toBeNull();
    expect(toNumber("  ")).toBeNull();
    expect(toNumber("abc")).toBeNull();
    expect(toNumber(Number.NaN)).toBeNull();
    expect(toNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("formatN2 / formatNumber", () => {
  it("ZTO N2 biçimi", () => {
    expect(formatN2(1234.56)).toBe("1.234,56");
    expect(formatN2(1234567.891)).toBe("1.234.567,89");
    expect(formatN2("1234.5000")).toBe("1.234,50");
    expect(formatN2(0)).toBe("0,00");
    expect(formatN2(-1234.5)).toBe("-1.234,50");
  });

  it("yuvarlanınca sıfır olan eksi değer işaretsiz yazılır", () => {
    expect(formatN2(-0.001)).toBe("0,00");
    expect(formatN2(-0)).toBe("0,00");
    expect(formatNumber(-0.4, 0)).toBe("0");
  });

  it("basamak sayısı", () => {
    expect(formatNumber(1234.5678, 0)).toBe("1.235");
    expect(formatNumber(1234.5678, 4)).toBe("1.234,5678");
    expect(formatNumber(1.5, 1)).toBe("1,5");
    expect(formatNumber(2)).toBe("2,00");
  });

  it("geçersiz basamak sınırlanır", () => {
    expect(formatNumber(1.25, -3)).toBe("1");
    expect(formatNumber(1, 2.9)).toBe("1,00");
    expect(formatNumber(1, 99)).toBe(`1,${"0".repeat(20)}`);
  });

  it("boş/geçersizde boş dizge", () => {
    expect(formatN2(null)).toBe("");
    expect(formatN2(undefined)).toBe("");
    expect(formatN2("x")).toBe("");
  });

  it("formatAmount MUI finans ekranlarındaki 2–4 basamaklı biçim", () => {
    expect(formatAmount("1234.5")).toBe("1.234,50");
    expect(formatAmount(36.12345)).toBe("36,1235");
  });
});

describe("formatMoney", () => {
  it("tutar + boşluk + simge (ZTO yazımı)", () => {
    expect(formatMoney(1234.56, "TRY")).toBe("1.234,56 ₺");
    expect(formatMoney(1234.56)).toBe("1.234,56 ₺");
    expect(formatMoney("10", "USD")).toBe("10,00 $");
    expect(formatMoney(10, "eur")).toBe("10,00 €");
    expect(formatMoney(10, "GBP")).toBe("10,00 £");
    expect(formatMoney(10, "TL")).toBe("10,00 ₺");
  });

  it("bilinmeyen kod olduğu gibi, boş kodda yalnız tutar", () => {
    expect(formatMoney(5, "CHF")).toBe("5,00 CHF");
    expect(formatMoney(5, "")).toBe("5,00");
    expect(formatMoney(5, null)).toBe("5,00");
  });

  it("boş tutarda boş dizge", () => {
    expect(formatMoney(null, "TRY")).toBe("");
    expect(formatMoney("", "TRY")).toBe("");
  });

  it("Money nesnesi", () => {
    expect(formatMoneyValue({ amount: "1500.0000", currency: "EUR" })).toBe("1.500,00 €");
    expect(formatMoneyValue(null)).toBe("");
    expect(formatMoneyValue(undefined)).toBe("");
  });

  it("currencySymbol", () => {
    expect(currencySymbol("try")).toBe("₺");
    expect(currencySymbol(" USD ")).toBe("$");
    expect(currencySymbol(undefined)).toBe("");
  });
});

describe("parseTrNumber", () => {
  it("tr-TR yazımını çözer", () => {
    expect(parseTrNumber("1.234,56")).toBe(1234.56);
    expect(parseTrNumber("1234,56")).toBe(1234.56);
    expect(parseTrNumber("1.234.567")).toBe(1234567);
    expect(parseTrNumber("1234")).toBe(1234);
    expect(parseTrNumber("-1.234,5")).toBe(-1234.5);
    expect(parseTrNumber("+12")).toBe(12);
    expect(parseTrNumber(" 1 234,50 ")).toBe(1234.5);
    expect(parseTrNumber("1 234,5")).toBe(1234.5);
    expect(parseTrNumber("0,5")).toBe(0.5);
  });

  it("sayı girişini olduğu gibi döndürür", () => {
    expect(parseTrNumber(12.5)).toBe(12.5);
    expect(parseTrNumber(Number.NaN)).toBeNull();
  });

  it("geçersizde null", () => {
    expect(parseTrNumber("")).toBeNull();
    expect(parseTrNumber(null)).toBeNull();
    expect(parseTrNumber(undefined)).toBeNull();
    expect(parseTrNumber("abc")).toBeNull();
    expect(parseTrNumber("12.5")).toBeNull();
    expect(parseTrNumber("1.23,4")).toBeNull();
    expect(parseTrNumber("1,2,3")).toBeNull();
    expect(parseTrNumber(",5")).toBeNull();
    expect(parseTrNumber("1,")).toBeNull();
    expect(parseTrNumber("--1")).toBeNull();
  });
});

describe("tarih biçimleri", () => {
  let previousTz: string | undefined;

  beforeEach(() => {
    previousTz = process.env.TZ;
  });

  afterEach(() => {
    if (previousTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTz;
    }
  });

  it("tarih-yalnız ISO dizgesi UTC'nin batısında da aynı gün kalır", () => {
    process.env.TZ = "America/New_York";
    // Senaryonun gerçek olduğunun kanıtı: new Date bu dizgeyi bir önceki güne kaydırır.
    expect(new Date("2026-03-01").getDate()).toBe(28);
    for (const tz of ["America/New_York", "Pacific/Honolulu", "Europe/Istanbul", "Asia/Tokyo"]) {
      process.env.TZ = tz;
      expect(formatDate("2026-03-01")).toBe("01.03.2026");
      expect(formatDateTime("2026-03-01")).toBe("01.03.2026 00:00");
      expect(toIsoDate("2026-03-01")).toBe("2026-03-01");
    }
  });

  it("Date yerel takvim gününe göre", () => {
    process.env.TZ = "America/New_York";
    const lateEvening = new Date(2026, 0, 31, 23, 30);
    expect(formatDate(lateEvening)).toBe("31.01.2026");
    expect(formatDateTime(lateEvening)).toBe("31.01.2026 23:30");
    expect(toIsoDate(lateEvening)).toBe("2026-01-31");
  });

  it("saatli ISO dizgesi yerel saatle", () => {
    process.env.TZ = "Europe/Istanbul";
    expect(formatDateTime("2026-11-13T07:05:00Z")).toBe("13.11.2026 10:05");
    expect(formatDate("2026-11-13T22:30:00Z")).toBe("14.11.2026");
    expect(formatDateTime("2026-11-13T09:04:00")).toBe("13.11.2026 09:04");
  });

  it("gg.aa.yyyy girişinde gün ile ay yer değiştirmez (new Date ABD sırası yok)", () => {
    expect(formatDate("01.03.2026")).toBe("01.03.2026");
    expect(formatDate("13.03.2026")).toBe("13.03.2026");
    expect(formatDate("1.3.2026")).toBe("01.03.2026");
    expect(formatDate(" 1.3.2026 ")).toBe("01.03.2026");
    expect(formatDateTime("1.3.2026 10:00")).toBe("01.03.2026 10:00");
    expect(formatDate("31.02.2026")).toBe("");
    expect(formatDateTime("1.3.2026 24:00")).toBe("");
    expect(formatDateTime("1.3.2026 10:60")).toBe("");
    // Yerel ayara bağlı biçimler kabul edilmez.
    expect(formatDate("03/01/2026")).toBe("");
    expect(formatDate("March 1, 2026")).toBe("");
    expect(toIsoDate("1.3.2026 10:00")).toBe("2026-03-01");
  });

  it("toIsoDate dd.MM.yyyy kabul eder", () => {
    expect(toIsoDate("13.11.2026")).toBe("2026-11-13");
    expect(toIsoDate("1.2.2026")).toBe("2026-02-01");
    expect(toIsoDate("29.02.2028")).toBe("2028-02-29");
  });

  it("geçersiz tarihlerde boş/null", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("")).toBe("");
    expect(formatDate("bozuk")).toBe("");
    expect(formatDate("2026-02-30")).toBe("");
    expect(formatDate(new Date(Number.NaN))).toBe("");
    expect(formatDateTime("bozuk")).toBe("");
    expect(toIsoDate("31.02.2026")).toBeNull();
    expect(toIsoDate("2026-13-01")).toBeNull();
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate("x")).toBeNull();
  });
});
