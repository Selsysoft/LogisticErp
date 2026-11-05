import { describe, expect, it } from "vitest";
import { kindsFor } from "./common";

describe("e-belge türleri", () => {
  it("irsaliye yalnız e-İrsaliye, fatura e-Fatura veya e-Arşiv olur", () => {
    expect(kindsFor("WAYBILL")).toEqual(["EIRSALIYE"]);
    expect(kindsFor("FREIGHT_INVOICE")).toEqual(["EFATURA", "EARSIV"]);
  });
});
