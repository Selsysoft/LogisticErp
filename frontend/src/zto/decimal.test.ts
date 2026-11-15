import { describe, expect, it } from "vitest";
import {
  addDec,
  cmpDec,
  DEC_FACTOR,
  DEC_SCALE,
  fromScaled,
  minDec,
  subDec,
  sumDec,
  toScaled,
  tryScaled,
} from "./decimal";
import { parseTrNumber } from "./format";

describe("toScaled", () => {
  it("0.1 + 0.2 = 0.3 (float hatası yok)", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(toScaled("0.1") + toScaled("0.2")).toBe(toScaled("0.3"));
    expect(toScaled(0.1) + toScaled(0.2)).toBe(toScaled(0.3));
    expect(addDec("0.1", "0.2")).toBe("0.30");
    expect(cmpDec(addDec("0.10", "0.20"), "0.30")).toBe(0);
  });

  it("ölçek 10⁴; metin biçimleri", () => {
    expect(DEC_SCALE).toBe(4);
    expect(DEC_FACTOR).toBe(10000n);
    expect(toScaled("1500.25")).toBe(15002500n);
    expect(toScaled("1500")).toBe(15000000n);
    expect(toScaled(" 12.5 ")).toBe(125000n);
    expect(toScaled(".5")).toBe(5000n);
    expect(toScaled("3.")).toBe(30000n);
    expect(toScaled("+3")).toBe(30000n);
    expect(toScaled("-0.5")).toBe(-5000n);
    expect(toScaled("0001.1000")).toBe(11000n);
    expect(toScaled("123456789012345678.1234")).toBe(1234567890123456781234n);
  });

  it("4 ondalık sınırı: 5. hanede HALF_UP (sıfırdan uzağa)", () => {
    expect(toScaled("1.2345")).toBe(12345n);
    expect(toScaled("1.23454")).toBe(12345n);
    expect(toScaled("1.23455")).toBe(12346n);
    expect(toScaled("1.234549999")).toBe(12345n);
    expect(toScaled("0.00005")).toBe(1n);
    expect(toScaled("0.00004")).toBe(0n);
    expect(toScaled("-0.00005")).toBe(-1n);
    expect(toScaled("9.99995")).toBe(100000n);
    expect(toScaled(1.00005)).toBe(10001n);
  });

  it("boş değerler sıfır; bigint ölçekli kabul edilir", () => {
    expect(toScaled(null)).toBe(0n);
    expect(toScaled(undefined)).toBe(0n);
    expect(toScaled("")).toBe(0n);
    expect(toScaled("  ")).toBe(0n);
    expect(toScaled(5n)).toBe(5n);
    expect(toScaled(0)).toBe(0n);
    expect(toScaled(-0)).toBe(0n);
  });

  it("geçersiz girdi: tryScaled null, toScaled RangeError", () => {
    for (const bad of ["abc", "1,5", "1.250,50", "1e3", "1.2.3", ".", "-", "+", "1 000", "--1"]) {
      expect(tryScaled(bad), bad).toBeNull();
      expect(() => toScaled(bad), bad).toThrow(RangeError);
    }
    expect(tryScaled(Number.NaN)).toBeNull();
    expect(tryScaled(Number.POSITIVE_INFINITY)).toBeNull();
    expect(tryScaled(1e21)).toBeNull();
    expect(tryScaled("7.25")).toBe(72500n);
  });

  it("TR girişi parseTrNumber çıktısıyla ölçeklenir", () => {
    expect(toScaled(parseTrNumber("1.250,50"))).toBe(12505000n);
    expect(toScaled(parseTrNumber("0,1"))).toBe(1000n);
    expect(toScaled(parseTrNumber("1.000.000,99"))).toBe(10000009900n);
    expect(toScaled(parseTrNumber(""))).toBe(0n);
  });
});

describe("fromScaled", () => {
  it("en az 2 ondalık, sondaki fazla sıfırlar atılır", () => {
    expect(fromScaled(0n)).toBe("0.00");
    expect(fromScaled(3000n)).toBe("0.30");
    expect(fromScaled(12345n)).toBe("1.2345");
    expect(fromScaled(12340n)).toBe("1.234");
    expect(fromScaled(15002500n)).toBe("1500.25");
    expect(fromScaled(-5n)).toBe("-0.0005");
    expect(fromScaled(-15000000n)).toBe("-1500.00");
  });

  it("en az ondalık parametresi 0–4'e kırpılır", () => {
    expect(fromScaled(15000000n, 0)).toBe("1500");
    expect(fromScaled(15000000n, 4)).toBe("1500.0000");
    expect(fromScaled(15000000n, 9)).toBe("1500.0000");
    expect(fromScaled(15000000n, -1)).toBe("1500");
    expect(fromScaled(12345n, 0)).toBe("1.2345");
  });

  it("metin → ölçekli → metin gidiş dönüşü", () => {
    for (const text of ["0.30", "1500.25", "1.2345", "-42.10", "999999999.99"]) {
      expect(fromScaled(toScaled(text))).toBe(text);
    }
  });
});

describe("işlemler", () => {
  it("addDec / subDec", () => {
    expect(addDec("1500.25", 0.75)).toBe("1501.00");
    expect(subDec("100", "0.01")).toBe("99.99");
    expect(subDec("0.3", "0.1")).toBe("0.20");
    expect(subDec(null, "5")).toBe("-5.00");
    expect(addDec(toScaled("1"), "1")).toBe("2.00");
  });

  it("cmpDec: eşitlik, aşım, eksik", () => {
    expect(cmpDec("0.30", "0.3")).toBe(0);
    expect(cmpDec("0.3001", "0.3")).toBe(1);
    expect(cmpDec("-1", "0")).toBe(-1);
    expect(cmpDec(addDec("0.1", "0.2"), "0.3")).toBe(0);
    // Toplam tahsis = tahsilat tutarı: aşım yok (allocationLogic sınırı).
    expect(cmpDec(sumDec(["0.10", "0.20"]), "0.30") > 0).toBe(false);
    expect(cmpDec(sumDec(["0.10", "0.21"]), "0.30") > 0).toBe(true);
  });

  it("minDec: en küçük; tek değer", () => {
    expect(minDec("250.00", "100.5")).toBe("100.50");
    expect(minDec("5")).toBe("5.00");
    expect(minDec("1", "-2", "0")).toBe("-2.00");
  });

  it("sumDec: boş liste 0.00; boş öğeler sıfır; yineleyici kabul edilir", () => {
    expect(sumDec([])).toBe("0.00");
    expect(sumDec(["0.1", null, "", "0.2", undefined])).toBe("0.30");
    expect(sumDec(new Set(["1.0001", "2.0002"]))).toBe("3.0003");
    expect(sumDec(Array.from({ length: 10 }, () => "0.1"))).toBe("1.00");
    expect(() => sumDec(["1", "x"])).toThrow(RangeError);
  });
});
