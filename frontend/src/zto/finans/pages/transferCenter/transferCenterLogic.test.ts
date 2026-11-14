import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "../../../../i18n";
import type { TransferListRow } from "../../../../pages/finance/types";
import { FUNDS, TREE, makeFund, makeRow } from "./transferCenterTestUtils";
import {
  ACCOUNTING_TYPES,
  EMPTY_FX_SELECTION,
  SUMMARY_CARDS,
  addDays,
  bankOptionLabel,
  branchIndex,
  buildIntercompanyBody,
  buildTransferBody,
  cashOptionLabel,
  collectionBadge,
  deepLinkSteps,
  defaultRange,
  editModalStyle,
  errorKey,
  errorParts,
  flatBranchOptions,
  fundOptionLabel,
  hasPrefill,
  intercompanyInfoText,
  intercompanyReasonText,
  kindsOf,
  negativeBalance,
  isoDayOrEmpty,
  linkRange,
  parseDeepLink,
  rateText,
  reverseDate,
  rowTypeKey,
  selectionSources,
  selectionTotal,
  statementBadgeClass,
  statementTypeKey,
  summaryCount,
  todayIso,
  transferBadgeClass,
  typeFilterOptions,
  validateDraft,
  type TransferDraft,
} from "./transferCenterLogic";

const tc = (key: string) => i18n.t(`ztoFinans:transferCenter.${key}`);
const byId = (id: string) => FUNDS.find((f) => f.id === id)!;

afterEach(() => {
  vi.useRealTimers();
});

describe("tarihler (yerel takvim)", () => {
  it("bugün, gün ekleme ve −7/+1 varsayılanı; ay/yıl geçişi", () => {
    expect(todayIso(new Date(2026, 10, 14, 23, 59))).toBe("2026-11-14");
    expect(todayIso(new Date(2026, 0, 1, 0, 1))).toBe("2026-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(defaultRange("2026-11-14")).toEqual({ from: "2026-11-07", to: "2026-11-15" });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 14, 0, 30));
    expect(defaultRange()).toEqual({ from: "2026-11-07", to: "2026-11-15" });
    expect(todayIso()).toBe("2026-11-14");
  });

  it("iptal tarihi max(bugün, transfer tarihi) — ileri tarihli transfer kendi tarihinde", () => {
    expect(reverseDate("2026-11-10", "2026-11-14")).toBe("2026-11-14");
    expect(reverseDate("2026-11-20", "2026-11-14")).toBe("2026-11-20");
    expect(reverseDate("2026-11-14", "2026-11-14")).toBe("2026-11-14");
  });
});

describe("derin bağlantı (bsjs handleTabAndTransferFromQuery)", () => {
  it("varsayılan: Yeni Transfer sekmesi, tür yok, ön doldurma yok", () => {
    const link = parseDeepLink("");
    expect(link).toMatchObject({ tab: "new", mode: null, subType: "", direction: "" });
    expect(hasPrefill(link)).toBe(false);
    expect(parseDeepLink("?tab=xyz").tab).toBe("new");
  });

  it("'EFT Al': transferType=eft&targetFundId&targetBranchId → tür, hedef iş yeri, sonra hedef banka", () => {
    const link = parseDeepLink("?tab=new&transferType=eft&targetFundId=f5&targetBranchId=b3");
    expect(link).toMatchObject({
      mode: "VIRMAN",
      subType: "EFT",
      targetFundId: "f5",
      targetBranchId: "b3",
    });
    expect(hasPrefill(link)).toBe(true);
    expect(deepLinkSteps(link, FUNDS)).toEqual([
      { kind: "type", mode: "VIRMAN", subType: "EFT", direction: "" },
      { kind: "targetBranch", branchId: "b3" },
      { kind: "targetFund", fundId: "f5" },
    ]);
  });

  it("targetBranchId verilmemişse hedef iş yeri fonun iş yerinden türetilir", () => {
    const link = parseDeepLink("transferType=havale&sourceFundId=f1&targetFundId=f4");
    expect(link.subType).toBe("WIRE");
    expect(deepLinkSteps(link, FUNDS)).toEqual([
      { kind: "type", mode: "VIRMAN", subType: "WIRE", direction: "" },
      { kind: "sourceBranch", branchId: "b1" },
      { kind: "targetBranch", branchId: "b2" },
      { kind: "sourceFund", fundId: "f1" },
      { kind: "targetFund", fundId: "f4" },
    ]);
    // Liste henüz gelmediyse (bilinmeyen fon) iş yeri adımı yok.
    expect(deepLinkSteps(parseDeepLink("targetFundId=zz"), FUNDS)).toEqual([
      { kind: "targetFund", fundId: "zz" },
    ]);
  });

  it("Virman'da hedef iş yeri adımı yazılmaz (kaynağa kilitli); bilinmeyen tür Virman", () => {
    const link = parseDeepLink("transferType=bilinmeyen&sourceBranchId=b1&targetBranchId=b2");
    expect(link.subType).toBe("VIREMENT");
    expect(deepLinkSteps(link, FUNDS).map((s) => s.kind)).toEqual(["type", "sourceBranch"]);
  });

  it("exchange/dovizbozum takma adları ve Banka & Kasa yönleri; direction yalnız Banka & Kasa'da", () => {
    expect(parseDeepLink("transferType=exchange").mode).toBe("FX");
    expect(parseDeepLink("transferType=DovizBozum").mode).toBe("FX");
    expect(parseDeepLink("transferType=bankcash")).toMatchObject({
      mode: "BANKCASH",
      direction: "BANK_TO_CASH",
    });
    expect(parseDeepLink("transferType=kasadanbankaya").direction).toBe("CASH_TO_BANK");
    expect(parseDeepLink("transferType=cashcash").direction).toBe("CASH_TO_CASH");
    expect(parseDeepLink("transferType=bankcash&direction=CashToCash").direction).toBe(
      "CASH_TO_CASH",
    );
    expect(parseDeepLink("transferType=bankcash&direction=yanlis").direction).toBe("BANK_TO_CASH");
    expect(parseDeepLink("transferType=eft&direction=CashToCash").direction).toBe("");
  });

  it("Transferler sekmesi araması (§3.2.7 kaynak bağlantısı)", () => {
    const link = parseDeepLink(new URLSearchParams("tab=transfers&q=VRM-000004"));
    expect(link).toMatchObject({ tab: "transfers", q: "VRM-000004" });
    expect(hasPrefill(link)).toBe(false);
    expect(hasPrefill(parseDeepLink("sourceBranchId=b1"))).toBe(true);
  });

  it("bağlantı transfer tarihini taşır; geçersiz tarih yok sayılır (F-12.2-R2)", () => {
    const link = parseDeepLink("tab=transfers&q=VRM-000004&from=2026-09-01&to=2026-09-01");
    expect(link).toMatchObject({ q: "VRM-000004", from: "2026-09-01", to: "2026-09-01" });
    expect(hasPrefill(link)).toBe(false);
    expect(parseDeepLink("tab=transfers&from=2026-02-30&to=01.09.2026")).toMatchObject({
      from: "",
      to: "",
    });
    expect(parseDeepLink("tab=transfers&from=2026-9-1").from).toBe("");
    expect(parseDeepLink("").from).toBe("");
    expect(isoDayOrEmpty("2028-02-29")).toBe("2028-02-29");
    expect(isoDayOrEmpty("2026-13-01")).toBe("");
  });

  it("Transferler aralığı: bağlantı tarihi, tek taraf, ters sıra, yoksa varsayılan", () => {
    expect(linkRange("2026-09-01", "2026-09-01", "2026-11-14")).toEqual({
      from: "2026-09-01",
      to: "2026-09-01",
    });
    expect(linkRange("2026-09-01", "", "2026-11-14")).toEqual({
      from: "2026-09-01",
      to: "2026-09-01",
    });
    expect(linkRange("", "2026-09-03", "2026-11-14")).toEqual({
      from: "2026-09-03",
      to: "2026-09-03",
    });
    expect(linkRange("2026-09-05", "2026-09-01", "2026-11-14")).toEqual({
      from: "2026-09-01",
      to: "2026-09-05",
    });
    expect(linkRange("", "", "2026-11-14")).toEqual(defaultRange("2026-11-14"));
  });
});

describe("iş yeri dizini ve seçenek metinleri", () => {
  const index = branchIndex(TREE);

  it("ZTO banka seçeneği 'BankName - (sym) [İş yeri - Şube]', kasa 'Ad - (sym)'", () => {
    expect(index.get("b3")).toEqual({
      name: "Beta İY",
      groupName: "Ankara",
      companyId: "c2",
      companyName: "Beta",
    });
    expect(bankOptionLabel(byId("f2"), index)).toBe("Ziraat - ($) [Merkez - İzmir]");
    expect(bankOptionLabel(makeFund({ branchId: "?" }), index)).toBe("Ziraat - (₺)");
    expect(bankOptionLabel(makeFund({ bankName: null }), index)).toBe(
      "Ziraat Vadesiz - (₺) [Merkez - İzmir]",
    );
    expect(cashOptionLabel(byId("k1"))).toBe("Merkez Kasa - (₺)");
    expect(fundOptionLabel(byId("k1"), index)).toBe("Merkez Kasa - (₺)");
    expect(fundOptionLabel(byId("f1"), index)).toBe("Ziraat - (₺) [Merkez - İzmir]");
    expect(branchIndex(undefined).size).toBe(0);
  });

  it("Banka & Kasa düz iş yeri listesi: yalnız aktif; ≥ 2 şirkette 'Şirket › İş yeri'", () => {
    expect(flatBranchOptions(TREE, null, true).map((o) => o.label)).toEqual([
      "Acme › Merkez",
      "Acme › Şube",
      "Beta › Beta İY",
    ]);
    expect(flatBranchOptions(TREE, "c1", false)).toEqual([
      { value: "b1", label: "Merkez" },
      { value: "b2", label: "Şube" },
    ]);
    expect(flatBranchOptions(undefined, null, false)).toEqual([]);
  });
});

describe("doğrulama (bsjs:3133-3308 sırası ve metinleri)", () => {
  const valid: TransferDraft = {
    mode: "VIRMAN",
    subType: "VIREMENT",
    direction: "",
    date: "2026-11-14",
    source: byId("f1"),
    target: makeFund({ id: "f9" }),
    amount: 100,
    calcMode: "source-rate",
    rate: 1,
    intercompany: false,
    reason: "",
  };
  const message = (draft: Partial<TransferDraft>) => {
    const error = validateDraft({ ...valid, ...draft });
    return error ? tc(error.key) : null;
  };

  it("Banka & Kasa: yön → kaynak → hedef → aynı kasa → para birimi", () => {
    const bc = { mode: "BANKCASH" as const, direction: "CASH_TO_CASH" as const };
    expect(message({ ...bc, direction: "" })).toBe("Transfer yönünü seçiniz.");
    expect(message({ ...bc, source: null })).toBe("Kaynak hesap seçiniz.");
    expect(message({ ...bc, target: null })).toBe("Hedef hesap seçiniz.");
    expect(message({ ...bc, source: byId("k1"), target: byId("k1") })).toBe(
      "Kaynak ve hedef kasa aynı olamaz.",
    );
    expect(
      message({
        ...bc,
        source: byId("k1"),
        target: makeFund({ id: "k8", kind: "CASH", currency: "USD" }),
      }),
    ).toBe("Kaynak ve hedef hesap aynı para biriminde olmalıdır.");
    expect(validateDraft({ ...valid, ...bc, source: byId("k1"), target: byId("k2") })).toBeNull();
  });

  it("Virman/Döviz: bankalar → aynı banka → tutar → tarih → tip → hesaplama → kur → neden", () => {
    expect(message({ target: null })).toBe("Kaynak ve hedef banka seçiniz.");
    expect(validateDraft({ ...valid, source: null })?.field).toBe("source");
    expect(message({ target: byId("f1") })).toBe("Kaynak ve hedef banka aynı olamaz.");
    expect(message({ amount: 0 })).toBe("Geçerli bir tutar giriniz.");
    expect(message({ date: "" })).toBe("Tarih seçiniz.");
    expect(message({ subType: "" })).toBe("Transfer tipi seçiniz.");
    expect(message({ mode: "FX", calcMode: "" })).toBe(
      "Döviz bozum için hesaplama tipini seçiniz.",
    );
    expect(message({ mode: "FX", rate: 0 })).toBe("Geçerli bir kur fiyatı giriniz.");
    expect(message({ intercompany: true })).toBe("Transfer nedeni seçiniz.");
    expect(validateDraft({ ...valid, intercompany: true, reason: "DEBT_PAID" })).toBeNull();
    expect(validateDraft(valid)).toBeNull();
  });
});

describe("istek gövdeleri", () => {
  const draft = {
    mode: "FX" as const,
    subType: "" as const,
    direction: "" as const,
    date: "2026-11-14",
    source: byId("f2"),
    target: byId("f1"),
    amount: 100,
    calcMode: "source-rate" as const,
    rate: 34,
    intercompany: false,
    reason: "" as const,
    description: "  ",
    documentNo: " D-1 ",
  };

  it("aynı para birimli tür: yalnız kaynak tutar; boş açıklama gönderilmez", () => {
    expect(
      buildTransferBody(
        { ...draft, mode: "VIRMAN", source: byId("f1"), target: byId("f4") },
        "EFT",
      ),
    ).toEqual({
      transferType: "EFT",
      fromFundId: "f1",
      toFundId: "f4",
      money: { amount: "100.00", currency: "TRY" },
      date: "2026-11-14",
      documentNo: "D-1",
      description: undefined,
    });
  });

  it("döviz bozumu: hedef tutar, kur, işlem, kip, masraflar ve kaynaklar", () => {
    const body = buildTransferBody(draft, "FX_EXCHANGE", {
      targetAmount: 3400,
      rate: 34,
      operation: "*",
      calcMode: "source-rate",
      kmvRate: 0.2,
      commission: 10,
      fee: 0,
      costFundId: "f3",
      sources: [{ kind: "SETTLEMENT", id: "s1", usedAmount: 100 }],
    });
    expect(body).toMatchObject({
      transferType: "FX_EXCHANGE",
      money: { amount: "100.00", currency: "USD" },
      targetMoney: { amount: "3400.00", currency: "TRY" },
      rate: 34,
      rateOperation: "MULTIPLY",
      calcMode: "SOURCE_RATE",
      costs: [
        { kind: "KMV", ratePercent: 0.2 },
        { kind: "COMMISSION", fundAccountId: "f3", amount: 10 },
      ],
      sources: [{ kind: "SETTLEMENT", id: "s1", usedAmount: 100 }],
    });
    const bare = buildTransferBody(draft, "FX_EXCHANGE", {
      targetAmount: 3400,
      rate: 34,
      operation: "/",
      calcMode: "rate-target",
      kmvRate: 0,
      commission: 0,
      fee: 5,
      costFundId: "",
      sources: [],
    });
    expect(bare.costs).toEqual([{ kind: "FEE", fundAccountId: undefined, amount: 5 }]);
    expect(bare.sources).toBeUndefined();
    expect(bare.calcMode).toBe("RATE_TARGET");
  });

  it("şirketler arası gövde; izin verilmeyen türde hata", () => {
    const ic = {
      ...draft,
      mode: "VIRMAN" as const,
      source: byId("f1"),
      target: byId("f5"),
      reason: "LOAN_GIVEN" as const,
    };
    expect(buildIntercompanyBody(ic, "EFT")).toEqual({
      transferType: "EFT",
      reasonType: "LOAN_GIVEN",
      fromFundId: "f1",
      toFundId: "f5",
      money: { amount: "100.00", currency: "TRY" },
      date: "2026-11-14",
      documentNo: "D-1",
      description: undefined,
    });
    expect(() => buildIntercompanyBody(ic, "VIREMENT")).toThrow();
  });

  it("şirketler arası metinler (§3.4.1 adım 8)", () => {
    expect(intercompanyReasonText("DEBT_PAID", "Acme", "Beta")).toBe(
      "Acme - Beta 'YE BORCUNU ÖDÜYOR / Beta - Acme 'TAN ALACAĞINI TAHSİL EDİYOR",
    );
    expect(intercompanyReasonText("LOAN_GIVEN", "Acme", "Beta")).toBe(
      "Acme - Beta 'YE BORÇ VERİYOR / Beta - Acme 'TAN BORÇ ALIYOR",
    );
    expect(intercompanyInfoText("Acme", "Beta")).toBe(
      "Şirketler arası transfer: Acme → Beta. Grup şirketi carilerine otomatik kayıt oluşur.",
    );
  });
});

describe("BS-12 eşiği", () => {
  it("yalnız eksiye izinli kaynakta ve sonuç < 0 iken", () => {
    expect(negativeBalance(makeFund({ balance: 100 }), 150)).toBeNull();
    expect(negativeBalance(makeFund({ balance: 100, allowNegative: true }), 90, 5)).toBeNull();
    expect(negativeBalance(makeFund({ balance: 100, allowNegative: true }), 100, 5)).toEqual({
      before: 100,
      outgoing: 105,
      after: -5,
    });
    expect(negativeBalance(null, 10)).toBeNull();
  });
});

describe("hata kodu → metin", () => {
  it("bilinen kodlar ön yüz metni, ZTO metni sunucuda olanlar null", () => {
    expect(tc(errorKey("COMPANY_MISMATCH")!)).toBe(
      "Şirketler arası aktarım 'Şirketler Arası Virman' ile yapılır.",
    );
    expect(tc(errorKey("FUND_INACTIVE")!)).toBe("Pasif banka/kasa hesabıyla işlem yapılamaz.");
    expect(tc(errorKey("IDEMPOTENCY_KEY_REUSED")!)).toBe(
      "Bu işlem anahtarı başka bir istek için kullanılmış.",
    );
    expect(tc(errorKey("TRANSFER_SAME_FUND", "CASH")!)).toBe("Kaynak ve hedef kasa aynı olamaz.");
    expect(tc(errorKey("TRANSFER_SAME_FUND")!)).toBe("Kaynak ve hedef banka aynı olamaz.");
    expect(errorKey("TRANSFER_RULE_VIOLATION")).toBeNull();
    expect(errorKey("INSUFFICIENT_FUNDS")).toBeNull();
    expect(errorKey(null)).toBeNull();
  });

  it("errorParts: ApiError gövdesi, düz Error, bilinmeyen", () => {
    expect(errorParts({ body: { code: "X", message: "m" } })).toEqual({ code: "X", message: "m" });
    expect(errorParts(new Error("boom"))).toEqual({ code: null, message: "boom" });
    expect(errorParts(null)).toEqual({ code: null, message: null });
  });
});

describe("Transferler sekmesi yardımcıları", () => {
  it("rozet sınıfları ve tür anahtarları", () => {
    const cls = (transferType: TransferListRow["transferType"]) =>
      transferBadgeClass(makeRow({ transferType }));
    expect(
      [
        "VIREMENT",
        "EFT",
        "WIRE",
        "FX_EXCHANGE",
        "BANK_TO_CASH",
        "CASH_TO_BANK",
        "CASH_TO_CASH",
      ].map((t) => cls(t as never)),
    ).toEqual(["virman", "eft", "havale", "doviz", "bankcash", "bankcash", "bankcash"]);
    expect(transferBadgeClass(makeRow({ recordType: "INTERCOMPANY", transferType: "EFT" }))).toBe(
      "intercompany",
    );
    expect(tc(rowTypeKey(makeRow({ transferType: "WIRE" })))).toBe("Havale");
    expect(tc(rowTypeKey(makeRow({ recordType: "INTERCOMPANY" })))).toBe("Şirketler Arası");
  });

  it("tahsilat durum rozetleri (getExchangeStatusBadge)", () => {
    expect(collectionBadge("COMPLETE")).toEqual({
      className: "badge badge-success",
      key: "collectionState.COMPLETE",
    });
    expect(tc(collectionBadge("PARTIAL").key)).toBe("Kısmi Bozum");
    expect(tc(collectionBadge("PENDING").key)).toBe("Bozum Bekliyor");
    expect(collectionBadge("CANCELLED").className).toBe("badge badge-danger");
    expect(tc(collectionBadge(null).key)).toBe("Yok");
  });

  it("'Kur / Yön' metni: '/' kaynak sembolü, 'x' hedef sembolü", () => {
    expect(rateText(34.12346, "DIVIDE", "TRY", "USD")).toEqual({
      symbol: "/",
      value: "34.1235",
      currency: "₺",
    });
    expect(rateText(0.0293, "MULTIPLY", "TRY", "USD")).toEqual({
      symbol: "x",
      value: "0.0293",
      currency: "$",
    });
    expect(rateText(null, null, "TRY", "USD").value).toBe("1.0000");
  });

  it("özet kartları (B12) ve süzgeç seçenekleri", () => {
    expect(SUMMARY_CARDS.map((c) => tc(c.key))).toEqual([
      "Virman / EFT / Havale",
      "Döviz Bozum",
      "Bankadan Kasaya",
      "Kasadan Bankaya",
      "Kasadan Kasaya",
      "Toplam",
      "Şirketler Arası",
    ]);
    expect(summaryCount([{ group: "TOTAL", count: 4, amounts: [] }], "TOTAL")).toBe(4);
    expect(summaryCount(undefined, "TOTAL")).toBe(0);
    expect(typeFilterOptions(false)).toHaveLength(8);
    expect(typeFilterOptions(true).at(-1)).toBe("INTERCOMPANY");
  });

  it("düzenleme modalı başlıkları ve hesap türleri", () => {
    expect(tc(editModalStyle("FX_EXCHANGE").titleKey)).toBe("Döviz Bozum Düzenle");
    expect(editModalStyle("VIREMENT")).toMatchObject({
      headerClassName: "bg-primary text-white",
      icon: "fas fa-random",
    });
    expect(editModalStyle("EFT").icon).toBe("fas fa-exchange-alt");
    expect(editModalStyle("WIRE").icon).toBe("fas fa-paper-plane");
    expect(editModalStyle("BANK_TO_CASH").headerClassName).toBe("bg-success text-white");
    expect(editModalStyle("CASH_TO_BANK").icon).toBe("fas fa-arrow-circle-left");
    expect(tc(editModalStyle("CASH_TO_CASH").titleKey)).toBe("Kasadan Kasaya Düzenle");
    expect(kindsOf("BANK_TO_CASH")).toEqual(["BANK", "CASH"]);
    expect(kindsOf("CASH_TO_BANK")).toEqual(["CASH", "BANK"]);
    expect(kindsOf("CASH_TO_CASH")).toEqual(["CASH", "CASH"]);
    expect(kindsOf("EFT")).toEqual(["BANK", "BANK"]);
  });
});

describe("ekstre yardımcıları", () => {
  it("rozet sınıfı ve tür metni (muhasebe tipi, bilinmeyende yön)", () => {
    const row = (accountingType: string, direction: "IN" | "OUT" = "IN") => ({
      accountingType,
      direction,
    });
    expect(statementBadgeClass(row("EFT"))).toBe("eft");
    expect(statementBadgeClass(row("WIRE"))).toBe("havale");
    expect(statementBadgeClass(row("FX_EXCHANGE"))).toBe("doviz");
    expect(statementBadgeClass(row("CASH_TO_BANK"))).toBe("bankcash");
    expect(statementBadgeClass(row("LEGACY_TRANSFER"))).toBe("virman");
    expect(statementBadgeClass(row("ACCOUNT_COLLECTION"))).toBe("in");
    expect(statementBadgeClass(row("ACCOUNT_PAYMENT", "OUT"))).toBe("out");
    expect(tc(statementTypeKey(row("LEGACY_TRANSFER")))).toBe("Virman (eski)");
    expect(tc(statementTypeKey(row("YENI")))).toBe("Giriş");
    expect(tc(statementTypeKey(row("YENI", "OUT")))).toBe("Çıkış");
    for (const type of ACCOUNTING_TYPES) {
      expect(i18n.exists(`ztoFinans:transferCenter.accountingTypes.${type}`), type).toBe(true);
    }
  });
});

describe("döviz bozumu kaynak seçimi", () => {
  it("toplam ve kaynak satırları (yalnız tutarı > 0)", () => {
    const selection = {
      ...EMPTY_FX_SELECTION,
      collectionId: "s1",
      collectionRemaining: 100.004,
      breaks: { t1: 20, t2: 0 },
    };
    expect(selectionTotal(selection)).toBe(120);
    expect(selectionSources(selection)).toEqual([
      { kind: "SETTLEMENT", id: "s1", usedAmount: 100 },
      { kind: "TRANSFER", id: "t1", usedAmount: 20 },
    ]);
    expect(selectionSources(EMPTY_FX_SELECTION)).toEqual([]);
  });
});
