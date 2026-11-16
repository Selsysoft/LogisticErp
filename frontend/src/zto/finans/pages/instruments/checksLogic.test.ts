import { describe, expect, it } from "vitest";
import type { InstrumentListItem, InstrumentMovement } from "../../../../pages/finance/types";
import {
  amountInWords,
  buildStatusRequest,
  cashHelpKey,
  cashRule,
  checkPriority,
  checksListParams,
  defaultChecksFilters,
  descriptionPreview,
  detailBadgeClass,
  filterChecks,
  filtersFromSearch,
  filtersToSearch,
  hasActiveFilter,
  initialStatusForm,
  isEndorsable,
  isReversingTarget,
  menuTarget,
  micrSerial,
  movementIcon,
  movementParties,
  needsBank,
  parseChecksDeepLink,
  remainingCell,
  remainingChecksSearch,
  sortChecks,
  stampOf,
  statusFilterOf,
  statusFilterStatuses,
  statusTargets,
  targetConfirmKey,
  targetHelp,
  targetOptionKey,
  targetWarningKey,
  validateStatusForm,
  type StatusForm,
} from "./checksLogic";
import { transitionMenu } from "./instrumentLogic";

const TODAY = "2026-11-16";

function item(overrides: Partial<InstrumentListItem> = {}): InstrumentListItem {
  return {
    id: "i1",
    kind: "CHECK",
    direction: "RECEIVED",
    number: "0000123",
    bankName: "Ziraat",
    bankBranch: "Konak",
    issueDate: "2026-11-01",
    dueDate: "2026-12-01",
    money: { amount: "1500.00", currency: "TRY" },
    status: "PORTFOLIO",
    accountId: "a1",
    accountCode: "120.01",
    accountName: "Kuzey Lojistik",
    accountType: "CUSTOMER",
    employeeMasked: false,
    endorsedAccountId: null,
    endorsedAccountName: null,
    drawerName: null,
    branchId: "b1",
    branchName: "Merkez",
    companyId: "c1",
    companyName: "Acme",
    fundAccountId: null,
    fundName: null,
    fundKind: null,
    fundBankName: null,
    custodyFundId: null,
    custodyFundName: null,
    checkLeafId: null,
    checkBookId: null,
    checkBookSerial: null,
    leafNo: null,
    description: "Kasım tahsilatı",
    noteType: null,
    collateral: false,
    settledDate: null,
    originSettlementId: "s1",
    originSettlementStatus: "POSTED",
    movementCount: 1,
    lastMovementDate: "2026-11-01",
    allowedTransitions: [],
    ...overrides,
  };
}

function movement(overrides: Partial<InstrumentMovement> = {}): InstrumentMovement {
  return {
    id: "m1",
    fromStatus: "PORTFOLIO",
    toStatus: "AT_BANK",
    movementDate: "2026-11-10",
    note: null,
    createdBy: "ayse",
    movementType: "STATUS",
    fromAccountId: null,
    toAccountId: null,
    accountTransferId: null,
    fundAccountId: "f1",
    fundName: "Ziraat Vadesiz",
    ...overrides,
  };
}

describe("durum süzgeci", () => {
  it("'Tahsil Edildi' üç durumu, 'İptal' iki durumu kapsar; boş seçenek süzmez", () => {
    expect(statusFilterStatuses("COLLECTED")).toEqual(["COLLECTED", "COLLECTED_TO_CASH", "PAID"]);
    expect(statusFilterStatuses("CANCELLED")).toEqual(["CANCELLED", "RETURNED"]);
    expect(statusFilterStatuses("ISSUED")).toEqual(["ISSUED"]);
    expect(statusFilterStatuses("")).toEqual([]);
    expect(statusFilterStatuses("XYZ")).toEqual([]);
  });

  it("URL'deki sunucu durumu süzgeç seçeneğine eşlenir", () => {
    expect(statusFilterOf("paid")).toBe("COLLECTED");
    expect(statusFilterOf("RETURNED")).toBe("CANCELLED");
    expect(statusFilterOf("AT_BANK")).toBe("AT_BANK");
    expect(statusFilterOf("bilinmez")).toBe("");
    expect(statusFilterOf(null)).toBe("");
  });
});

describe("süzgeç durumu", () => {
  it("varsayılan vade bugün −7 … +30 (ZTO), diğer alanlar boş", () => {
    expect(defaultChecksFilters(TODAY)).toEqual({
      status: "",
      accountId: "",
      checkBookId: "",
      dueFrom: "2026-11-09",
      dueTo: "2026-12-16",
      companyId: "",
    });
  });

  it("URL gidiş-dönüşü: varsayılanlar yazılmaz, geçersiz tarih varsayılana düşer", () => {
    const filters = {
      ...defaultChecksFilters(TODAY),
      status: "COLLECTED" as const,
      accountId: "a1",
      dueTo: "2027-01-31",
    };
    const query = filtersToSearch(filters, TODAY);
    expect(query.toString()).toBe("status=COLLECTED&accountId=a1&dueTo=2027-01-31");
    expect(filtersFromSearch(query, TODAY)).toEqual(filters);
    expect(filtersFromSearch(new URLSearchParams("dueFrom=bozuk"), TODAY).dueFrom).toBe(
      "2026-11-09",
    );
    expect(hasActiveFilter(defaultChecksFilters(TODAY), TODAY)).toBe(false);
    expect(hasActiveFilter(filters, TODAY)).toBe(true);
  });

  it("çok şirkette varsayılan şirket aktif şirket; boş seçim tüm şirketler (null)", () => {
    const params = filtersFromSearch(new URLSearchParams(), TODAY, "c1");
    expect(params.companyId).toBe("c1");
    expect(checksListParams(params, true).companyId).toBe("c1");
    expect(checksListParams({ ...params, companyId: "" }, true).companyId).toBeNull();
    expect(checksListParams(params, false).companyId).toBeUndefined();
    expect(filtersToSearch({ ...params, companyId: "" }, TODAY, "c1").get("companyId")).toBe("");
  });

  it("liste parametreleri: CHECK, durumlar, cari, koçan, vade aralığı", () => {
    const filters = {
      ...defaultChecksFilters(TODAY),
      status: "CANCELLED" as const,
      checkBookId: "k1",
    };
    expect(checksListParams(filters, false)).toEqual({
      kind: "CHECK",
      statuses: ["CANCELLED", "RETURNED"],
      accountId: undefined,
      checkBookId: "k1",
      dueFrom: "2026-11-09",
      dueTo: "2026-12-16",
      companyId: undefined,
    });
  });
});

describe("derin bağlantı (openCheckPaymentModal)", () => {
  it("ZTO parametreleri ayrıştırılır, para birimi büyük harf", () => {
    const params = new URLSearchParams(
      "bankId=f1&workPlaceId=b1&currencyId=usd&openCheckPaymentModal=TRUE&accountId=a1",
    );
    expect(parseChecksDeepLink(params)).toEqual({
      openPayment: true,
      fundAccountId: "f1",
      branchId: "b1",
      currency: "USD",
    });
    expect(parseChecksDeepLink(new URLSearchParams("openCheckPaymentModal=1")).openPayment).toBe(
      false,
    );
  });

  it("okunan anahtarlar silinir; süzgeç anahtarları kalır; silinecek yoksa null", () => {
    expect(
      remainingChecksSearch(
        new URLSearchParams("bankId=f1&openCheckPaymentModal=true&accountId=a1"),
      ),
    ).toBe("accountId=a1");
    expect(remainingChecksSearch(new URLSearchParams("accountId=a1"))).toBeNull();
  });
});

describe("sıralama önceliği", () => {
  it("0 = vadesi geçmiş açık, 1 = ≤ 7 gün, 2 = diğer ve kapalı", () => {
    expect(checkPriority(item({ dueDate: "2026-11-15" }), TODAY)).toBe(0);
    expect(checkPriority(item({ dueDate: "2026-11-23" }), TODAY)).toBe(1);
    expect(checkPriority(item({ dueDate: "2026-11-24" }), TODAY)).toBe(2);
    expect(checkPriority(item({ dueDate: "2026-11-01", status: "COLLECTED" }), TODAY)).toBe(2);
  });

  it("öncelik, sonra vade artan, sonra numara", () => {
    const rows = [
      item({ id: "far", dueDate: "2027-01-01" }),
      item({ id: "near", dueDate: "2026-11-20" }),
      item({ id: "late", dueDate: "2026-11-10" }),
      item({ id: "doneLate", dueDate: "2026-10-01", status: "PAID" }),
      item({ id: "late2", dueDate: "2026-11-10", number: "0000001" }),
    ];
    expect(sortChecks(rows, TODAY).map((r) => r.id)).toEqual([
      "late2",
      "late",
      "near",
      "doneLate",
      "far",
    ]);
  });
});

describe("satır hücreleri", () => {
  it("Kalan Gün: kendi çek ödendi, ciro, iptal, kapanmış, geçmiş, yakın", () => {
    expect(remainingCell(item({ direction: "ISSUED", status: "PAID" }), TODAY)).toEqual({
      kind: "ownPaid",
    });
    expect(remainingCell(item({ status: "ENDORSED" }), TODAY)).toMatchObject({
      labelKey: "checks.table.endorsed",
      className: "badge-warning",
    });
    expect(remainingCell(item({ status: "RETURNED" }), TODAY)).toMatchObject({
      className: "badge-dark",
    });
    expect(remainingCell(item({ status: "COLLECTED" }), TODAY)).toMatchObject({
      labelKey: "instruments.status.check.COLLECTED",
      className: "badge-info",
    });
    expect(remainingCell(item({ dueDate: "2026-11-13" }), TODAY)).toEqual({
      kind: "days",
      count: 3,
      overdue: true,
      className: "badge-danger",
    });
    expect(remainingCell(item({ dueDate: "2026-11-20" }), TODAY)).toMatchObject({
      count: 4,
      className: "badge-warning",
    });
    expect(remainingCell(item({ dueDate: "2026-12-20" }), TODAY)).toMatchObject({
      className: "badge-info",
    });
  });

  it("ciro edilebilir: alınan, portföyde, maskesiz", () => {
    expect(isEndorsable(item())).toBe(true);
    expect(isEndorsable(item({ direction: "ISSUED" }))).toBe(false);
    expect(isEndorsable(item({ status: "AT_BANK" }))).toBe(false);
    expect(isEndorsable(item({ employeeMasked: true }))).toBe(false);
  });

  it("açıklama 50 karakterde kesilir", () => {
    expect(descriptionPreview("a".repeat(51))).toBe(`${"a".repeat(50)}...`);
    expect(descriptionPreview("kısa")).toBe("kısa");
    expect(descriptionPreview(null)).toBe("");
  });

  it("arama Türkçe harf duyarsız; maskeli satırda cari adı aranmaz", () => {
    const rows = [
      item({ id: "x", accountName: "IŞIK Ltd" }),
      item({ id: "y", accountName: "Işık Gizli", employeeMasked: true }),
      item({ id: "z", number: "0009999" }),
    ];
    expect(filterChecks(rows, "ışık").map((r) => r.id)).toEqual(["x"]);
    expect(filterChecks(rows, "9999").map((r) => r.id)).toEqual(["z"]);
    expect(filterChecks(rows, "  ")).toHaveLength(3);
  });
});

describe("movementParties", () => {
  const names = (id: string | null) => (id === "a2" ? "Güney" : id === "a1" ? "Kuzey" : null);

  it("ilk hareket: alınan çek cari → Portföy; verilen çek iş yeri → cari", () => {
    const first = movement({ fromStatus: null, toStatus: "PORTFOLIO" });
    expect(movementParties(first, item(), 0)).toEqual({
      from: { kind: "text", text: "Kuzey Lojistik" },
      to: { kind: "key", key: "checks.movements.portfolio" },
    });
    expect(movementParties(first, item({ direction: "ISSUED" }), 0)).toEqual({
      from: { kind: "text", text: "Merkez" },
      to: { kind: "text", text: "Kuzey Lojistik" },
    });
  });

  it("bankaya yatırma, tahsil, ciro, taşıma, iptal, iade", () => {
    const it0 = item({ endorsedAccountName: "Batı" });
    expect(movementParties(movement(), it0, 1).to).toEqual({
      kind: "text",
      text: "Ziraat Vadesiz",
    });
    expect(movementParties(movement({ toStatus: "PAID" }), it0, 1).from).toEqual({
      kind: "text",
      text: "-",
    });
    expect(movementParties(movement({ toStatus: "ENDORSED" }), it0, 1).to).toEqual({
      kind: "text",
      text: "Batı",
    });
    expect(
      movementParties(
        movement({ movementType: "TRANSFERRED", fromAccountId: "a1", toAccountId: "a2" }),
        it0,
        2,
        names,
      ),
    ).toEqual({ from: { kind: "text", text: "Kuzey" }, to: { kind: "text", text: "Güney" } });
    expect(movementParties(movement({ toStatus: "CANCELLED" }), it0, 2)).toEqual({
      from: { kind: "text", text: "-" },
      to: { kind: "text", text: "-" },
    });
    expect(movementParties(movement({ toStatus: "RETURNED" }), it0, 2).to).toEqual({
      kind: "text",
      text: "Kuzey Lojistik",
    });
    expect(movementParties(movement({ toStatus: "PORTFOLIO", fundName: null }), it0, 2).to).toEqual(
      { kind: "key", key: "checks.movements.portfolio" },
    );
  });

  it("maskeli satırda cari adı gizlenir", () => {
    const first = movement({ fromStatus: null, toStatus: "PORTFOLIO" });
    expect(movementParties(first, item({ employeeMasked: true }), 0).from).toEqual({
      kind: "text",
      text: "-",
    });
  });

  it("simgeler: giriş, ciro, tahsil, iade, taşıma, diğer", () => {
    expect(movementIcon(movement({ fromStatus: null }), 0).icon).toBe("fa-arrow-down");
    expect(movementIcon(movement({ toStatus: "ENDORSED" }), 1).className).toBe("text-warning");
    expect(movementIcon(movement({ toStatus: "COLLECTED" }), 1).icon).toBe("fa-check-circle");
    expect(movementIcon(movement({ toStatus: "BOUNCED" }), 1).icon).toBe("fa-undo");
    expect(movementIcon(movement({ movementType: "TRANSFERRED" }), 1).className).toBe("text-info");
    expect(movementIcon(movement(), 1).icon).toBe("fa-circle");
  });
});

describe("M3 durum modalı", () => {
  const atBank = item({
    status: "AT_BANK",
    fundAccountId: "f1",
    fundKind: "BANK",
    allowedTransitions: ["COLLECTED", "BOUNCED", "PORTFOLIO"],
  });
  const form = (overrides: Partial<StatusForm>): StatusForm => ({
    ...initialStatusForm(atBank, "", TODAY),
    ...overrides,
  });

  it("seçenekler satır menüsünden; köken kaydı iptali M3 açmaz", () => {
    const issued = item({
      direction: "ISSUED",
      status: "ISSUED",
      allowedTransitions: ["PAID"],
    });
    const menu = transitionMenu(issued, "check");
    expect(statusTargets(menu)).toEqual(["PAID"]);
    expect(menuTarget(menu[menu.length - 1])).toBeNull();
    const portfolio = transitionMenu(
      item({ allowedTransitions: ["AT_BANK", "RETURNED"] }),
      "check",
    );
    expect(statusTargets(portfolio)).toEqual(["AT_BANK", "custody", "RETURNED"]);
  });

  it("açılış: banka çekin banka fonu, kasa emanet kasası, tarih bugün", () => {
    expect(initialStatusForm(atBank, "COLLECTED", TODAY)).toEqual({
      target: "COLLECTED",
      bankId: "f1",
      cashId: "",
      date: TODAY,
      note: "",
    });
    expect(initialStatusForm(item({ custodyFundId: "k1" }), "", TODAY).cashId).toBe("k1");
  });

  it("ZTO doğrulama iletileri", () => {
    expect(validateStatusForm(form({}), atBank)?.key).toBe("checks.statusModal.errors.target");
    expect(validateStatusForm(form({ target: "COLLECTED", bankId: "" }), atBank)?.key).toBe(
      "checks.statusModal.errors.bankRequired",
    );
    expect(validateStatusForm(form({ target: "PORTFOLIO" }), atBank)).toEqual({
      field: "cashId",
      key: "checks.statusModal.errors.cashForPortfolio",
    });
    expect(validateStatusForm(form({ target: "custody" }), item())?.key).toBe(
      "checks.statusModal.errors.cashForCustody",
    );
    expect(validateStatusForm(form({ target: "COLLECTED_TO_CASH" }), item())?.key).toBe(
      "checks.statusModal.errors.cashForCollect",
    );
    expect(validateStatusForm(form({ target: "BOUNCED", date: "" }), atBank)?.field).toBe("date");
    expect(validateStatusForm(form({ target: "BOUNCED" }), atBank)).toBeNull();
  });

  it("kasa kuralı: portföydeki emanetli çekte kasa isteğe bağlı; verilen çekte yok", () => {
    expect(cashRule("PORTFOLIO", { ...atBank, custodyFundId: "k1" })).toEqual({
      visible: true,
      required: false,
    });
    expect(cashRule("PORTFOLIO", item({ direction: "ISSUED" })).visible).toBe(false);
    expect(cashRule("AT_BANK", item()).visible).toBe(false);
    expect(needsBank("PAID")).toBe(true);
    expect(needsBank("BOUNCED")).toBe(false);
  });

  it("gönderim gövdeleri", () => {
    expect(buildStatusRequest(form({ target: "COLLECTED" }), atBank)).toEqual({
      kind: "transition",
      body: { toStatus: "COLLECTED", date: TODAY, fundAccountId: "f1" },
    });
    expect(buildStatusRequest(form({ target: "PORTFOLIO", cashId: "k1" }), atBank)).toEqual({
      kind: "transition",
      body: { toStatus: "PORTFOLIO", date: TODAY, custodyFundId: "k1" },
    });
    expect(
      buildStatusRequest(form({ target: "COLLECTED_TO_CASH", bankId: "", cashId: "k1" }), item()),
    ).toEqual({
      kind: "transition",
      body: { toStatus: "COLLECTED_TO_CASH", date: TODAY, fundAccountId: "k1" },
    });
    expect(buildStatusRequest(form({ target: "custody", cashId: "k1" }), item())).toEqual({
      kind: "custody",
      body: { custodyFundId: "k1", date: TODAY },
    });
    expect(buildStatusRequest(form({ target: "RETURNED", note: "  iade  " }), item())).toEqual({
      kind: "transition",
      body: { toStatus: "RETURNED", date: TODAY, note: "iade" },
    });
  });

  it("etiketler, yardım ve uyarı metinleri (kendi çekimizde 'Çek Ödendi')", () => {
    expect(targetOptionKey("COLLECTED", true)).toBe("checks.statusModal.option.PAID");
    expect(targetOptionKey("COLLECTED", false)).toBe("checks.statusModal.option.COLLECTED");
    expect(targetConfirmKey("PAID", true)).toBe("checks.statusModal.confirmLabel.PAID");
    expect(targetConfirmKey("custody", false)).toBe("checks.statusModal.confirmLabel.custody");
    expect(targetHelp("", false)).toEqual({ key: "checks.statusModal.help.choose", className: "" });
    expect(targetHelp("COLLECTED", true).key).toBe("checks.statusModal.help.PAID");
    expect(targetHelp("COLLECTED", false).key).toBe("checks.statusModal.help.COLLECTED");
    expect(targetHelp("AT_BANK", false).className).toBe("text-warning");
    expect(targetHelp("COLLATERAL", false).key).toBe("checks.statusModal.help.other");
    for (const target of [
      "PORTFOLIO",
      "custody",
      "COLLECTED_TO_CASH",
      "BOUNCED",
      "RETURNED",
    ] as const) {
      expect(targetHelp(target, false).key).toBe(`checks.statusModal.help.${target}`);
    }
    expect(targetWarningKey("BOUNCED")).toBe("checks.statusModal.warning.BOUNCED");
    expect(targetWarningKey("RETURNED")).toBe("checks.statusModal.warning.RETURNED");
    expect(targetWarningKey("AT_BANK")).toBeNull();
    expect(cashHelpKey("custody", true).key).toBe("checks.statusModal.cashHelp.custody");
    expect(cashHelpKey("COLLECTED_TO_CASH", true).key).toBe("checks.statusModal.cashHelp.collect");
    expect(cashHelpKey("PORTFOLIO", true).className).toBe("text-danger");
    expect(cashHelpKey("PORTFOLIO", false).key).toBe("checks.statusModal.cashHelp.optional");
    expect(isReversingTarget("BOUNCED")).toBe(true);
    expect(isReversingTarget("AT_BANK")).toBe(false);
  });
});

describe("M4 çek yaprağı", () => {
  it("tutar Türkçe yazıya çevrilir (ZTO c3dYazi)", () => {
    expect(amountInWords("1250.50")).toBe("#BinİkiYüzElliTürkLirasıElliKuruş#");
    expect(amountInWords(0)).toBe("#SıfırTürkLirası#");
    expect(amountInWords("2001001")).toBe("#İkiMilyonBinBirTürkLirası#");
    expect(amountInWords("3000000000.05")).toBe("#ÜçMilyarTürkLirasıBeşKuruş#");
    expect(amountInWords("115")).toBe("#YüzOnBeşTürkLirası#");
  });

  it("damga ve rozet: sahipliğe göre ÖDENDİ / TAHSİL EDİLDİ", () => {
    expect(stampOf(item({ status: "PAID", direction: "ISSUED" }))).toEqual({
      key: "checks.leaf.stamp.PAID",
      color: "#16a34a",
    });
    expect(stampOf(item({ status: "COLLECTED" }))?.key).toBe("checks.leaf.stamp.COLLECTED");
    for (const status of [
      "PORTFOLIO",
      "AT_BANK",
      "BOUNCED",
      "PROTESTED",
      "RETURNED",
      "ISSUED",
      "ENDORSED",
      "COLLATERAL",
    ] as const) {
      expect(stampOf(item({ status }))).not.toBeNull();
    }
    expect(detailBadgeClass("PORTFOLIO")).toBe("badge-info");
    expect(detailBadgeClass("AT_BANK")).toBe("badge-warning");
    expect(detailBadgeClass("PAID")).toBe("badge-success");
    expect(detailBadgeClass("BOUNCED")).toBe("badge-danger");
    expect(detailBadgeClass("CANCELLED")).toBe("badge-secondary");
    expect(detailBadgeClass("ISSUED")).toBe("badge-primary");
    expect(detailBadgeClass("ENDORSED")).toBe("badge-light");
    expect(micrSerial("AB-12 34")).toBe("AB1234");
    expect(micrSerial(null)).toBe("00000000");
  });
});
