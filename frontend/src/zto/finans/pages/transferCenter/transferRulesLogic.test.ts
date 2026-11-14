import { describe, expect, it } from "vitest";
import i18n from "../../../../i18n";
import { FUNDS, makeFund } from "./transferCenterTestUtils";
import {
  allowsIntercompany,
  bankCashSourceKind,
  bankCashTargetKind,
  bankKey,
  effectiveTargetBranch,
  evaluateBankCashTargets,
  evaluateBankTargets,
  fundsIn,
  infoAlertKey,
  isIntercompany,
  requiresTargetBranch,
  showsSourceTypeHint,
  sourceAmountLabelKey,
  sourceEnabled,
  targetBranchCompany,
  transferTypeOf,
} from "./transferRulesLogic";

const tc = (key: string) => i18n.t(`ztoFinans:transferCenter.${key}`);
const hint = (key: string) => tc(`hints.${key}`);
const byId = (id: string) => FUNDS.find((f) => f.id === id)!;
const reasons = (evaluation: ReturnType<typeof evaluateBankTargets>) =>
  Object.fromEntries(evaluation.options.map((o) => [o.fund.id, o.reason]));

describe("bankKey ve havuzlar", () => {
  it("banka adı büyük/küçük harf ve boşluk duyarsız; bankName yoksa ad", () => {
    expect(bankKey({ bankName: "  Ziraat   Bankası ", name: "x" })).toBe("ziraat bankası");
    expect(bankKey({ bankName: null, name: "İŞ BANKASI" })).toBe("iş bankası");
  });

  it("fundsIn: tür + iş yeri + aktif + vadesiz; iş yeri yoksa boş", () => {
    const list = [
      ...FUNDS,
      makeFund({ id: "x", active: false }),
      makeFund({ id: "y", accountType: "CREDIT" }),
    ];
    expect(fundsIn(list, "BANK", "b1").map((f) => f.id)).toEqual(["f1", "f2", "f3"]);
    expect(fundsIn(list, "CASH", "b1").map((f) => f.id)).toEqual(["k1"]);
    expect(fundsIn(list, "BANK", "")).toEqual([]);
  });

  it("hedef iş yeri: Virman'da kaynağa kilitli, EFT/Havale/Döviz'de ayrı", () => {
    expect(requiresTargetBranch("VIRMAN", "VIREMENT")).toBe(false);
    expect(requiresTargetBranch("VIRMAN", "EFT")).toBe(true);
    expect(requiresTargetBranch("VIRMAN", "WIRE")).toBe(true);
    expect(requiresTargetBranch("FX", "")).toBe(true);
    expect(requiresTargetBranch("BANKCASH", "")).toBe(false);
    expect(effectiveTargetBranch("VIRMAN", "VIREMENT", "b1", "b2")).toBe("b1");
    expect(effectiveTargetBranch("VIRMAN", "EFT", "b1", "b2")).toBe("b2");
  });
});

describe("evaluateBankTargets — Virman / EFT / Havale (bsjs:592-704)", () => {
  const base = { mode: "VIRMAN" as const, sourceBranchId: "b1", targetBranchId: "", funds: FUNDS };

  it("alt tür seçilmemişse seçici kapalı, ipucu yok", () => {
    const result = evaluateBankTargets({ ...base, subType: "", source: byId("f1") });
    expect(result).toEqual({ options: [], enabled: false, hints: [], tone: null });
  });

  it("Virman: aynı banka + aynı para birimi; farklı banka ve para birimi pasif, ipucu sırası birebir", () => {
    const result = evaluateBankTargets({ ...base, subType: "VIREMENT", source: byId("f1") });
    expect(reasons(result)).toEqual({
      f1: "sameAccount",
      f2: "currencyMismatch",
      f3: "notSameBankForVirman",
    });
    expect(result.enabled).toBe(true);
    expect(result.hints).toEqual(["currencyMismatch", "notSameBankForVirman", "sameAccount"]);
    expect(result.hints.map(hint)).toEqual([
      "Farklı para birimine sahip bankalar pasif.",
      "Virman için farklı bankalar pasif.",
      "Aynı hesap pasif.",
    ]);
    // Seçilebilir hedef yok → text-warning.
    expect(result.tone).toBe("info");
  });

  it("kaynak yokken her seçenek 'Önce kaynak banka seçiniz.' ve seçici kapalı", () => {
    const result = evaluateBankTargets({ ...base, subType: "VIREMENT", source: null });
    expect(new Set(Object.values(reasons(result)))).toEqual(new Set(["needSource"]));
    expect(result.enabled).toBe(false);
    expect(result.hints.map(hint)).toEqual(["Önce kaynak banka seçiniz."]);
  });

  it("EFT: hedef iş yeri yokken 'Önce hedef iş yeri seçiniz.'", () => {
    const result = evaluateBankTargets({ ...base, subType: "EFT", source: byId("f1") });
    expect(result.enabled).toBe(false);
    expect(result.hints.map(hint)).toEqual(["Önce hedef iş yeri seçiniz."]);
  });

  it("EFT: aynı iş yerinde aynı banka pasif; başka iş yerindeki aynı banka seçilebilir", () => {
    const same = evaluateBankTargets({
      ...base,
      subType: "EFT",
      source: byId("f1"),
      targetBranchId: "b1",
    });
    expect(reasons(same).f3).toBeNull();
    expect(same.hints).toEqual(["currencyMismatch", "sameAccount"]);
    const sameBank = evaluateBankTargets({
      ...base,
      subType: "EFT",
      source: makeFund({ id: "z", bankName: "Ziraat" }),
      targetBranchId: "b1",
    });
    expect(reasons(sameBank).f1).toBe("sameBankSameWorkPlace");
    expect(tc("hints.sameBankSameWorkPlace")).toBe(
      "Aynı iş yeri + aynı banka EFT/Havale için pasif.",
    );
    const other = evaluateBankTargets({
      ...base,
      subType: "WIRE",
      source: byId("f1"),
      targetBranchId: "b2",
    });
    expect(reasons(other)).toEqual({ f4: null });
    expect(other.tone).toBeNull();
  });

  it("EFT başka şirketin iş yerine: şirket kuralı yok (şirketler arası kip)", () => {
    const result = evaluateBankTargets({
      ...base,
      subType: "EFT",
      source: byId("f1"),
      targetBranchId: "b3",
    });
    expect(reasons(result)).toEqual({ f5: null });
  });

  it("hiç seçilebilir hedef yoksa 'Seçilebilir hedef banka yok.' (text-warning)", () => {
    const result = evaluateBankTargets({
      ...base,
      subType: "VIREMENT",
      source: byId("f1"),
      funds: [byId("f1")],
    });
    expect(result.hints).toEqual(["sameAccount"]);
    const lone = evaluateBankTargets({
      ...base,
      subType: "EFT",
      source: byId("f1"),
      targetBranchId: "b9",
      funds: FUNDS,
    });
    expect(lone.options).toEqual([]);
    expect(lone.tone).toBe("warning");
    expect(tc("hints.noTarget")).toBe("Seçilebilir hedef banka yok.");
  });

  it("Virman hedefinde şirket farkı (kural aynası) pasif", () => {
    const foreign = makeFund({ id: "q", companyId: "c2" });
    const result = evaluateBankTargets({
      ...base,
      subType: "VIREMENT",
      source: byId("f1"),
      funds: [byId("f1"), foreign],
    });
    expect(reasons(result).q).toBe("companyMismatch");
  });
});

describe("evaluateBankTargets — Döviz (bsjs:706-795)", () => {
  const base = { mode: "FX" as const, subType: "" as const, sourceBranchId: "b1", funds: FUNDS };

  it("hedef iş yeri yokken seçici kapalı + 'Önce hedef iş yeri seçiniz.'", () => {
    const result = evaluateBankTargets({ ...base, source: byId("f2"), targetBranchId: "" });
    expect(result.enabled).toBe(false);
    expect(result.options).toEqual([]);
    expect(result.hints.map(hint)).toEqual(["Önce hedef iş yeri seçiniz."]);
    const none = evaluateBankTargets({ ...base, source: null, targetBranchId: "" });
    expect(none.hints).toEqual(["needSource", "needTargetWorkPlace"]);
  });

  it("farklı iş yerinde hedef seçilebilir (iş yeri kısıtı yok); aynı para birimi pasif", () => {
    const result = evaluateBankTargets({ ...base, source: byId("f2"), targetBranchId: "b2" });
    expect(reasons(result)).toEqual({ f4: null });
    const same = evaluateBankTargets({ ...base, source: byId("f1"), targetBranchId: "b1" });
    expect(reasons(same)).toEqual({ f1: "sameAccount", f2: null, f3: "fxSameCurrency" });
    expect(same.hints.map(hint)).toEqual([
      "Aynı para birimine sahip hedef bankalar pasif.",
      "Aynı hesap pasif.",
    ]);
    expect(tc("reasons.fxSameCurrency")).toBe(
      "Döviz bozumda hedef banka farklı para biriminde olmalı.",
    );
  });

  it("aynı banka + aynı para birimi ayrıca sayılır; başka şirket pasif", () => {
    const sameBank = makeFund({ id: "zz", bankName: "ziraat" });
    const result = evaluateBankTargets({
      ...base,
      source: byId("f1"),
      targetBranchId: "b1",
      funds: [byId("f1"), sameBank],
    });
    expect(result.hints).toEqual(["fxSameCurrency", "fxSameBankAndCurrency", "sameAccount"]);
    const foreign = evaluateBankTargets({
      ...base,
      source: byId("f2"),
      targetBranchId: "b3",
    });
    expect(reasons(foreign)).toEqual({ f5: "companyMismatch" });
    expect(foreign.hints).toEqual(["companyMismatch"]);
  });
});

describe("Banka & Kasa (bsjs:1260-1311)", () => {
  it("yöne göre kaynak/hedef türleri", () => {
    expect([bankCashSourceKind("BANK_TO_CASH"), bankCashTargetKind("BANK_TO_CASH")]).toEqual([
      "BANK",
      "CASH",
    ]);
    expect([bankCashSourceKind("CASH_TO_BANK"), bankCashTargetKind("CASH_TO_BANK")]).toEqual([
      "CASH",
      "BANK",
    ]);
    expect([bankCashSourceKind("CASH_TO_CASH"), bankCashTargetKind("CASH_TO_CASH")]).toEqual([
      "CASH",
      "CASH",
    ]);
  });

  it("farklı para birimi ve Kasadan Kasaya'da aynı kasa pasif; ipucu metinleri", () => {
    const usdCash = makeFund({ id: "k9", kind: "CASH", currency: "USD" });
    const bc = evaluateBankCashTargets({
      direction: "BANK_TO_CASH",
      source: byId("f1"),
      targetBranchId: "b1",
      funds: [...FUNDS, usdCash],
    });
    expect(bc.options.map((o) => [o.fund.id, o.reason])).toEqual([
      ["k1", null],
      ["k9", "currencyMismatch"],
    ]);
    expect(tc(`hints.${bc.hint}`)).toBe(
      "Sadece aynı para birimine sahip hedef hesaplar seçilebilir.",
    );
    const cc = evaluateBankCashTargets({
      direction: "CASH_TO_CASH",
      source: byId("k1"),
      targetBranchId: "b1",
      funds: FUNDS,
    });
    expect(cc.options.map((o) => o.reason)).toEqual(["sameAccount"]);
    expect(cc.hint).toBe("cashToCashSameCurrency");
    expect(
      evaluateBankCashTargets({
        direction: "CASH_TO_BANK",
        source: null,
        targetBranchId: "b1",
        funds: FUNDS,
      }).hint,
    ).toBeNull();
    expect(
      evaluateBankCashTargets({ direction: "", source: null, targetBranchId: "b1", funds: FUNDS }),
    ).toEqual({
      options: [],
      hint: null,
    });
  });
});

describe("tür, şirketler arası kip ve metinler", () => {
  it("transferTypeOf", () => {
    expect(transferTypeOf("FX", "", "")).toBe("FX_EXCHANGE");
    expect(transferTypeOf("BANKCASH", "", "CASH_TO_BANK")).toBe("CASH_TO_BANK");
    expect(transferTypeOf("BANKCASH", "", "")).toBeNull();
    expect(transferTypeOf("VIRMAN", "WIRE", "")).toBe("WIRE");
    expect(transferTypeOf("VIRMAN", "", "")).toBeNull();
  });

  it("şirketler arası: EFT/Havale/Banka&Kasa evet, Virman/Döviz hayır", () => {
    expect(
      ["EFT", "WIRE", "BANK_TO_CASH", "CASH_TO_BANK", "CASH_TO_CASH"].every((t) =>
        allowsIntercompany(t as never),
      ),
    ).toBe(true);
    expect(allowsIntercompany("VIREMENT")).toBe(false);
    expect(allowsIntercompany("FX_EXCHANGE")).toBe(false);
    expect(allowsIntercompany(null)).toBe(false);
    expect(isIntercompany("EFT", byId("f1"), byId("f5"))).toBe(true);
    expect(isIntercompany("EFT", byId("f1"), byId("f3"))).toBe(false);
    expect(isIntercompany("VIREMENT", byId("f1"), byId("f5"))).toBe(false);
    expect(isIntercompany("EFT", null, byId("f5"))).toBe(false);
    expect(targetBranchCompany("FX", "c1")).toBe("c1");
    expect(targetBranchCompany("VIRMAN", "c1")).toBeNull();
  });

  it("bilgi kutusu metinleri bsjs:560-590 birebir", () => {
    expect(tc(infoAlertKey(null, "", ""))).toBe(
      "Transfer tipi seçimine göre işlem kapsamı burada gösterilir.",
    );
    expect(tc(infoAlertKey("VIRMAN", "VIREMENT", ""))).toBe(
      "Virman aynı iş yeri, banka ve para biriminin farklı hesapları arasındaki işlemidir.",
    );
    expect(tc(infoAlertKey("VIRMAN", "EFT", ""))).toBe(
      "EFT farklı iş yeri, banka ve aynı para birimi transfer işlemidir.",
    );
    expect(tc(infoAlertKey("VIRMAN", "WIRE", ""))).toContain("Kısa fark: EFT genelde");
    expect(tc(infoAlertKey("VIRMAN", "", ""))).toContain("tiplerinden birini seçin");
    expect(tc(infoAlertKey("FX", "", ""))).toContain("Kur fiyatına göre hesaplanır.");
    expect(tc(infoAlertKey("BANKCASH", "", "BANK_TO_CASH"))).toContain("Bankadan Kasaya farklı");
    expect(tc(infoAlertKey("BANKCASH", "", "CASH_TO_BANK"))).toContain("Kasadan Bankaya farklı");
    expect(tc(infoAlertKey("BANKCASH", "", "CASH_TO_CASH"))).toBe(
      "Kasadan Kasaya aynı para birimi ile kasa transfer işlemidir.",
    );
    expect(tc(infoAlertKey("BANKCASH", "", ""))).toContain("transfer desteklenir.");
  });

  it("tutar etiketi, kaynak seçici etkinliği ve 'Önce transfer tipini seçiniz.' ipucu", () => {
    expect(tc(sourceAmountLabelKey("VIRMAN", "VIREMENT"))).toBe("Virman Tutarı");
    expect(tc(sourceAmountLabelKey("VIRMAN", "EFT"))).toBe("EFT Tutarı");
    expect(tc(sourceAmountLabelKey("VIRMAN", "WIRE"))).toBe("Havale Tutarı");
    expect(tc(sourceAmountLabelKey("VIRMAN", ""))).toBe("Kaynak Tutar");
    expect(tc(sourceAmountLabelKey("BANKCASH", ""))).toBe("Transfer Tutarı");
    expect(tc(sourceAmountLabelKey("FX", ""))).toBe("Kaynak Tutar");
    expect(sourceEnabled("VIRMAN", "", "", "b1")).toBe(false);
    expect(sourceEnabled("VIRMAN", "EFT", "", "b1")).toBe(true);
    expect(sourceEnabled("FX", "", "", "b1")).toBe(true);
    expect(sourceEnabled("BANKCASH", "", "", "b1")).toBe(false);
    expect(sourceEnabled("BANKCASH", "", "BANK_TO_CASH", "b1")).toBe(true);
    expect(sourceEnabled("FX", "", "", "")).toBe(false);
    expect(showsSourceTypeHint("VIRMAN", "", "b1")).toBe(true);
    expect(showsSourceTypeHint("VIRMAN", "EFT", "b1")).toBe(false);
    expect(showsSourceTypeHint("FX", "", "b1")).toBe(false);
    expect(tc("form.typeHint")).toBe("Önce transfer tipini seçiniz.");
    // Alt tür boşaltılınca gösterilen ayrı bilgi iletisi (bsjs:66-69) budama özeti değildir.
    expect(tc("form.pickTypeFirst")).toBe("Lütfen önce transfer tipini seçin.");
  });
});
