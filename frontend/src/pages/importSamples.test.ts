import { describe, expect, it } from "vitest";
import balance from "../../../docs/ornekler/acilis-bakiyesi.csv?raw";
import invoices from "../../../docs/ornekler/acik-faturalar.csv?raw";
import stock from "../../../docs/ornekler/acilis-stogu.csv?raw";
import {
  OPENING_BALANCE_SAMPLE,
  OPENING_INVOICE_SAMPLE,
  OPENING_STOCK_SAMPLE,
} from "./importSamples";

/** Windows'ta git satır sonlarını CRLF yapabilir. */
const lf = (text: string) => text.replace(/\r\n/g, "\n");

describe("içe aktarma örnekleri", () => {
  it("geçiş rehberindeki dosyalarla aynıdır", () => {
    expect(OPENING_BALANCE_SAMPLE).toBe(lf(balance));
    expect(OPENING_INVOICE_SAMPLE).toBe(lf(invoices));
    expect(OPENING_STOCK_SAMPLE).toBe(lf(stock));
  });
});
