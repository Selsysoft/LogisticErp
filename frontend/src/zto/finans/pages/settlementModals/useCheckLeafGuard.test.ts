import { describe, expect, it } from "vitest";
import settlementModals from "../../../../locales/tr/ztoFinans/settlementModals";
import type { CheckLeaf } from "../../../../pages/finance/types";
import { checkLeafGuardResult } from "./useCheckLeafGuard";

/** Gerçek Türkçe metinlerle `tm` (`settlementModals.*`). */
const tm = (key: string) => {
  const node = key
    .split(".")
    .reduce<unknown>(
      (acc, part) => (acc as Record<string, unknown> | undefined)?.[part],
      settlementModals,
    );
  if (typeof node !== "string") throw new Error(`anahtar yok: ${key}`);
  return node;
};

function leaf(patch: Partial<CheckLeaf> = {}): CheckLeaf {
  return {
    id: "l1",
    checkBookId: "cb1",
    checkBookSerial: "A-1",
    leafNo: 3,
    number: "0001234",
    micrCode: null,
    status: "UNUSED",
    usedDate: null,
    voidReason: null,
    fundAccountId: "f1",
    fundName: "Ziraat TL",
    fundBankName: "Ziraat Bankası",
    fundBankBranchName: null,
    fundIban: null,
    branchId: "b1",
    branchName: "Merkez",
    companyId: "c1",
    instrumentId: null,
    instrumentStatus: null,
    ...patch,
  };
}

const run = (
  number: string,
  leaves: CheckLeaf[] | undefined,
  editing: Parameters<typeof checkLeafGuardResult>[0]["editing"] = null,
) => checkLeafGuardResult({ number, fundAccountId: "f1", leaves, editing }, tm);

describe("checkLeafGuardResult (CLG:57-85)", () => {
  it("3 haneden kısa ya da rakam dışı numarada ve yanıt yokken boşta", () => {
    expect(run("12", [])).toEqual({ state: "idle", message: null });
    expect(run("12a4", [])).toEqual({ state: "idle", message: null });
    expect(run("1234567", undefined)).toEqual({ state: "idle", message: null });
  });

  it("koçanda yok: manuel kullanılabilir", () => {
    expect(run("1234567", [leaf({ number: "1234568" })])).toEqual({
      state: "free",
      message: "Koçan kayıtlarında bu numara yok — manuel kullanılabilir.",
    });
  });

  it("kullanılmamış yaprak: manuel girilemez, koçandan seçilmeli (baştaki sıfırlar önemsiz)", () => {
    const result = run("1234", [leaf()]);
    expect(result.state).toBe("leafManualForbidden");
    expect(result.message).toBe(
      "Bu çek numarası koçan yaprağı olarak kayıtlı: Ziraat Bankası (kullanılmamış yaprak · Koçan: A-1) — manuel olarak kullanılamaz, lütfen koçandan seçiniz.",
    );
  });

  it("kullanılmış yaprak: tekrar kullanılamaz; banka adı yoksa 'Bilinmeyen banka'", () => {
    const result = run("0001234", [
      leaf({ status: "USED", fundBankName: null, checkBookSerial: "" }),
      leaf({ id: "l2", status: "VOID" }),
    ]);
    expect(result.state).toBe("leafUsed");
    expect(result.message).toBe(
      "Bu çek numarası koçan yaprağı olarak kayıtlı: Bilinmeyen banka (kullanılmış yaprak), Ziraat Bankası (iptal edilmiş yaprak · Koçan: A-1) — bu çek zaten kullanılmış (ödemesi mevcut), tekrar kullanılamaz.",
    );
  });

  it("düzenleme: kaydın kendi yaprağı ve yapraksız eski numarası serbest (Rev 1 F1)", () => {
    const own = { currentLeafId: "l1", currentNumber: "0001234", currentFundAccountId: "f1" };
    expect(run("0001234", [leaf({ status: "USED" })], own)).toEqual({
      state: "free",
      message: null,
    });
    const manual = { currentLeafId: null, currentNumber: "0001234", currentFundAccountId: "f1" };
    expect(run("0001234", undefined, manual)).toEqual({ state: "free", message: null });
    // Banka değişince istisna kalkar.
    const otherFund = { ...manual, currentFundAccountId: "f2" };
    expect(run("0001234", [leaf()], otherFund).state).toBe("leafManualForbidden");
  });
});
