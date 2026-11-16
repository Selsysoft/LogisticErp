import { describe, expect, it } from "vitest";
import { currencyRows, rateDateText, rateValueText } from "./currenciesLogic";

describe("currenciesLogic", () => {
  const currencies = [
    { code: "TRY", name: "Türk Lirası" },
    { code: "USD", name: "Amerikan Doları" },
    { code: "eur", name: "Euro" },
    { code: "GBP", name: "İngiliz Sterlini" },
  ];
  const rates = [
    { currency: "USD", rateDate: "2026-11-13", rate: 34.1234, source: "TCMB" },
    { currency: "EUR", rateDate: "2026-11-13", rate: 37.5, source: "TCMB" },
  ];

  it("satırlar: TRY kur yok, kur eşlemesi büyük/küçük harf duyarsız, kur yoksa null", () => {
    const rows = currencyRows(currencies, rates);
    expect(rows.map((row) => row.code)).toEqual(["TRY", "USD", "EUR", "GBP"]);
    expect(rows[0]).toMatchObject({
      base: true,
      rate: null,
      rateDate: null,
      symbolText: "₺ (TRY)",
    });
    expect(rows[1]).toMatchObject({
      base: false,
      rate: 34.1234,
      rateDate: "2026-11-13",
      symbolText: "$ (USD)",
    });
    expect(rows[2]).toMatchObject({ rate: 37.5, symbolText: "€ (EUR)" });
    expect(rows[3]).toMatchObject({ rate: null, rateDate: null, symbolText: "£ (GBP)" });
  });

  it("biçim: kur N4 tr-TR, tarih dd.MM.yyyy", () => {
    expect(rateValueText(34.1234)).toBe("34,1234");
    expect(rateValueText(1234.5)).toBe("1.234,5000");
    expect(rateDateText("2026-11-13")).toBe("13.11.2026");
    expect(rateDateText(null)).toBe("");
  });
});
