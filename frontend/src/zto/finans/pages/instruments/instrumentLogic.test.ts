import { describe, expect, it } from "vitest";
import instruments from "../../../../locales/tr/ztoFinans/instruments";
import type { InstrumentListItem, InstrumentStatus } from "../../../../pages/finance/types";
import {
  accountingStatus,
  canEditInstrument,
  dueBadgeClass,
  holdingPlace,
  isOpenStatus,
  isOverdue,
  isOwnCheckPaid,
  noteTypeLabelKey,
  partyColumns,
  remainingDays,
  statusLabelKey,
  statusSubKey,
  transitionMenu,
} from "./index";

const ALL: InstrumentStatus[] = [
  "PORTFOLIO",
  "AT_BANK",
  "COLLECTED",
  "COLLECTED_TO_CASH",
  "ENDORSED",
  "ISSUED",
  "PAID",
  "BOUNCED",
  "PROTESTED",
  "RETURNED",
  "CANCELLED",
  "COLLATERAL",
];

/** `instruments.a.b` anahtarını parçanın ağacında çözer. */
function text(key: string | null): string | undefined {
  if (!key) return undefined;
  const [ns, ...rest] = key.split(".");
  expect(ns).toBe("instruments");
  let node: unknown = instruments;
  for (const part of rest) node = (node as Record<string, unknown> | undefined)?.[part];
  return typeof node === "string" ? node : undefined;
}

function item(patch: Partial<InstrumentListItem> = {}): InstrumentListItem {
  return {
    id: "i1",
    kind: "CHECK",
    direction: "RECEIVED",
    number: "0000001",
    bankName: "Akbank",
    bankBranch: null,
    issueDate: "2026-11-01",
    dueDate: "2026-12-01",
    money: { amount: "100.00", currency: "TRY" },
    status: "PORTFOLIO",
    accountId: "a1",
    accountCode: "C1",
    accountName: "Müşteri A",
    accountType: "CUSTOMER",
    employeeMasked: false,
    endorsedAccountId: null,
    endorsedAccountName: null,
    drawerName: null,
    branchId: "b1",
    branchName: "Merkez",
    companyId: "c1",
    companyName: "Kara Ltd",
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
    description: null,
    noteType: null,
    collateral: false,
    settledDate: null,
    originSettlementId: "s1",
    originSettlementStatus: "POSTED",
    movementCount: 1,
    lastMovementDate: "2026-11-01",
    allowedTransitions: [],
    ...patch,
  };
}

describe("statusLabelKey (§5.2 tablo)", () => {
  it("her durum ve tür için ZTO metni var", () => {
    for (const status of ALL) {
      expect(text(statusLabelKey("CHECK", "RECEIVED", status)), status).toBeTruthy();
      expect(text(statusLabelKey("NOTE", "ISSUED", status)), status).toBeTruthy();
    }
  });

  it("çek ve senet etiketleri", () => {
    const check = (s: InstrumentStatus) => text(statusLabelKey("CHECK", "RECEIVED", s));
    const note = (s: InstrumentStatus) => text(statusLabelKey("NOTE", "ISSUED", s));
    expect(check("PORTFOLIO")).toBe("Portföyde");
    expect(check("AT_BANK")).toBe("Bankada");
    expect(check("COLLECTED_TO_CASH")).toBe("Tahsil Edildi");
    expect(check("ISSUED")).toBe("Kullanıldı");
    expect(check("PAID")).toBe("Tahsil Edildi");
    expect(check("BOUNCED")).toBe("Karşılıksız");
    expect(check("CANCELLED")).toBe("İptal");
    expect(note("ISSUED")).toBe("Portföyde");
    expect(note("COLLECTED")).toBe("Ödendi");
    expect(note("PAID")).toBe("Ödendi");
    expect(note("PROTESTED")).toBe("Protestolu");
    expect(note("COLLATERAL")).toBe("Teminata Verildi");
    expect(note("RETURNED")).toBe("İptal");
    expect(text(statusSubKey("RETURNED"))).toBe("İade");
    expect(statusSubKey("CANCELLED")).toBeNull();
  });

  it("kendi çekimiz ödendi rozeti ve açık durumlar", () => {
    expect(isOwnCheckPaid({ kind: "CHECK", direction: "ISSUED", status: "PAID" })).toBe(true);
    expect(isOwnCheckPaid({ kind: "NOTE", direction: "ISSUED", status: "PAID" })).toBe(false);
    expect(isOwnCheckPaid({ kind: "CHECK", direction: "RECEIVED", status: "COLLECTED" })).toBe(
      false,
    );
    expect(ALL.filter(isOpenStatus)).toEqual(["PORTFOLIO", "AT_BANK", "ISSUED", "COLLATERAL"]);
  });
});

describe("accountingStatus (CHK:42-56, 676-722)", () => {
  const view = (patch: Partial<InstrumentListItem>) => {
    const result = accountingStatus(item(patch));
    return [text(result.labelKey), result.className, result.icon, result.endorsedTo];
  };

  it("tüm dallar", () => {
    expect(view({ status: "PORTFOLIO" })).toEqual([
      "Portföyde (Elde)",
      "badge-info",
      "fa-wallet",
      null,
    ]);
    expect(view({ status: "AT_BANK" })).toEqual([
      "Tahsil Edilecek",
      "badge-warning",
      "fa-clock",
      null,
    ]);
    expect(view({ status: "COLLECTED" })[0]).toBe("Tahsil Edildi");
    expect(view({ status: "COLLECTED_TO_CASH" })[1]).toBe("badge-success");
    expect(view({ status: "PAID", direction: "ISSUED" })).toEqual([
      "Ödendi",
      "badge-success",
      "fa-check-circle",
      null,
    ]);
    expect(view({ status: "ENDORSED", endorsedAccountName: "Tedarikçi B" })).toEqual([
      "Ciro Edildi",
      "badge-warning",
      "fa-exchange-alt",
      "Tedarikçi B",
    ]);
    expect(
      view({ status: "ISSUED", direction: "ISSUED", fundAccountId: "f1", fundKind: "BANK" }),
    ).toEqual(["Bankadan Ödenecek", "badge-primary", "fa-university", null]);
    expect(view({ status: "ISSUED", direction: "ISSUED" })).toEqual([
      "Kasadan Ödenecek",
      "badge-warning",
      "fa-hand-holding-usd",
      null,
    ]);
    // Kasa fonlu verilen çek / senet: tanımsız → "-".
    expect(
      view({ status: "ISSUED", direction: "ISSUED", fundAccountId: "k1", fundKind: "CASH" })[0],
    ).toBe("-");
    // Yön kuralı: verilen portföy/banka satırı muhasebe etiketi almaz.
    expect(view({ status: "PORTFOLIO", direction: "ISSUED" })[0]).toBe("-");
    expect(view({ status: "AT_BANK", direction: "ISSUED" })[0]).toBe("-");
    for (const status of ["BOUNCED", "PROTESTED", "RETURNED", "CANCELLED", "COLLATERAL"] as const) {
      expect(view({ status }), status).toEqual([
        "-",
        "badge-secondary",
        "fa-question-circle",
        null,
      ]);
    }
  });
});

describe("vade", () => {
  it("remainingDays takvim günüyle (ay/yıl sınırı, geçersiz)", () => {
    expect(remainingDays("2026-11-16", "2026-11-16")).toBe(0);
    expect(remainingDays("2026-12-01", "2026-11-16")).toBe(15);
    expect(remainingDays("2026-11-10", "2026-11-16")).toBe(-6);
    expect(remainingDays("2027-01-01", "2026-12-31")).toBe(1);
    expect(remainingDays("2026-03-30", "2026-03-28")).toBe(2);
    expect(remainingDays(null, "2026-11-16")).toBeNull();
    expect(remainingDays("31.12.2026", "2026-11-16")).toBeNull();
  });

  it("dueBadgeClass eşikleri", () => {
    expect(dueBadgeClass(-1)).toBe("badge-danger");
    expect(dueBadgeClass(0)).toBe("badge-warning");
    expect(dueBadgeClass(7)).toBe("badge-warning");
    expect(dueBadgeClass(8)).toBe("badge-info");
    expect(dueBadgeClass(null)).toBe("badge-secondary");
  });

  it("isOverdue yalnız açık durumda", () => {
    const today = "2026-11-16";
    expect(isOverdue(item({ status: "PORTFOLIO", dueDate: "2026-11-15" }), today)).toBe(true);
    expect(isOverdue(item({ status: "COLLATERAL", dueDate: "2026-11-15" }), today)).toBe(true);
    expect(isOverdue(item({ status: "ISSUED", dueDate: "2026-11-16" }), today)).toBe(false);
    expect(isOverdue(item({ status: "COLLECTED", dueDate: "2026-01-01" }), today)).toBe(false);
  });
});

describe("partyColumns ve holdingPlace", () => {
  it("alınan çek: keşideci metni yoksa cari; sahibi şirket ya da ciro edilen", () => {
    expect(partyColumns(item())).toEqual({
      drawer: "Müşteri A",
      drawerSub: null,
      firstPayee: "Müşteri A",
      holder: { kind: "company", name: "Kara Ltd", badgeKey: null },
    });
    const endorsed = partyColumns(
      item({ status: "ENDORSED", drawerName: "Ali Veli", endorsedAccountName: "Tedarikçi B" }),
    );
    expect(endorsed.drawer).toBe("Ali Veli");
    expect(endorsed.holder.kind).toBe("endorsed");
    expect(endorsed.holder.name).toBe("Tedarikçi B");
    expect(text(endorsed.holder.badgeKey)).toBe("Ciro Edildi");
  });

  it("verilen çek: keşideci şirket + iş yeri, rozet Kendi Çekimiz; maskede null", () => {
    const own = partyColumns(item({ direction: "ISSUED", status: "ISSUED" }));
    expect([own.drawer, own.drawerSub, own.firstPayee]).toEqual([
      "Kara Ltd",
      "Merkez",
      "Müşteri A",
    ]);
    expect(own.holder.kind).toBe("ownCheck");
    expect(text(own.holder.badgeKey)).toBe("Kendi Çekimiz");
    const masked = partyColumns(item({ employeeMasked: true, accountName: null }));
    expect([masked.drawer, masked.firstPayee]).toEqual([null, null]);
  });

  it("tutulma yeri", () => {
    expect(holdingPlace(item({ custodyFundName: "Merkez Kasa" }))).toEqual({
      kind: "custody",
      name: "Merkez Kasa",
      labelKey: null,
    });
    expect(text(holdingPlace(item({ status: "AT_BANK" })).labelKey)).toBe("Bankada");
    expect(text(holdingPlace(item({ status: "ENDORSED" })).labelKey)).toBe("Ciro Edildi");
    expect(holdingPlace(item({ status: "COLLECTED" })).kind).toBe("none");
    expect(text(holdingPlace(item({ status: "COLLECTED" })).labelKey)).toBe("-");
  });
});

describe("transitionMenu", () => {
  const labels = (menu: ReturnType<typeof transitionMenu>) =>
    menu.map((entry) => [entry.action, entry.target, text(entry.labelKey)]);

  it("alınan portföy çeki: ZTO sırası + Kasaya Al (Ciro); ENDORSED/CANCELLED atlanır", () => {
    const menu = transitionMenu(
      item({
        allowedTransitions: [
          "RETURNED",
          "COLLECTED",
          "AT_BANK",
          "COLLECTED_TO_CASH",
          "ENDORSED",
          "CANCELLED",
        ],
      }),
      "check",
    );
    expect(labels(menu)).toEqual([
      ["transition", "AT_BANK", "Bankaya Yatır"],
      ["transition", "COLLECTED_TO_CASH", "Kasaya Tahsil Et"],
      ["transition", "COLLECTED", "Bankaya Tahsil Et"],
      ["custody", null, "Kasaya Al (Ciro)"],
      ["transition", "RETURNED", "İptal Et"],
    ]);
  });

  it("kendi çekimiz açık + köken POSTED: Çek Ödendi İşaretle, Karşılıksız, İptal Et (kayıt)", () => {
    const menu = transitionMenu(
      item({
        direction: "ISSUED",
        status: "ISSUED",
        allowedTransitions: ["PAID", "BOUNCED"],
        originSettlementId: "s7",
      }),
      "check",
    );
    expect(labels(menu)).toEqual([
      ["transition", "PAID", "Çek Ödendi İşaretle"],
      ["transition", "BOUNCED", "Karşılıksız"],
      ["cancelSettlement", null, "İptal Et"],
    ]);
    expect(menu[2]).toMatchObject({ settlementId: "s7" });
  });

  it("köken kaydı REVERSED ya da yoksa iptal öğesi yok", () => {
    const base: Partial<InstrumentListItem> = {
      direction: "ISSUED",
      status: "ISSUED",
      allowedTransitions: ["PAID"],
    };
    expect(
      transitionMenu(item({ ...base, originSettlementStatus: "REVERSED" }), "check").map(
        (e) => e.action,
      ),
    ).toEqual(["transition"]);
    expect(
      transitionMenu(
        item({ ...base, originSettlementId: null, originSettlementStatus: null }),
        "check",
      ),
    ).toHaveLength(1);
  });

  it("AT_BANK çeki: Bankaya Tahsil Et, Karşılıksız, Portföye Geri Al", () => {
    expect(
      labels(
        transitionMenu(
          item({ status: "AT_BANK", allowedTransitions: ["PORTFOLIO", "BOUNCED", "COLLECTED"] }),
          "check",
        ),
      ),
    ).toEqual([
      ["transition", "COLLECTED", "Bankaya Tahsil Et"],
      ["transition", "BOUNCED", "Karşılıksız"],
      ["transition", "PORTFOLIO", "Portföye Geri Al"],
    ]);
  });

  it("senet: ZTO etiketleri, BR ekleri sonda, custody yok", () => {
    const menu = transitionMenu(
      item({
        kind: "NOTE",
        allowedTransitions: [
          "AT_BANK",
          "COLLECTED",
          "COLLECTED_TO_CASH",
          "RETURNED",
          "COLLATERAL",
          "PROTESTED",
        ],
      }),
      "bill",
    );
    expect(labels(menu)).toEqual([
      ["transition", "COLLATERAL", "Teminata Ver"],
      ["transition", "COLLECTED", "Ödendi Olarak İşaretle"],
      ["transition", "PROTESTED", "Protestolu Olarak İşaretle"],
      ["transition", "RETURNED", "İptal Et"],
      ["transition", "COLLECTED_TO_CASH", "Kasaya Tahsil Et"],
      ["transition", "AT_BANK", "Bankaya Yatır"],
    ]);
    const issued = transitionMenu(
      item({
        kind: "NOTE",
        direction: "ISSUED",
        status: "ISSUED",
        allowedTransitions: ["PAID", "PROTESTED"],
      }),
      "bill",
    );
    expect(labels(issued)).toEqual([
      ["transition", "PAID", "Ödendi Olarak İşaretle"],
      ["transition", "PROTESTED", "Protestolu Olarak İşaretle"],
      ["cancelSettlement", null, "İptal Et"],
    ]);
    expect(
      labels(
        transitionMenu(
          item({ kind: "NOTE", status: "COLLATERAL", allowedTransitions: ["PORTFOLIO"] }),
          "bill",
        ),
      ),
    ).toEqual([["transition", "PORTFOLIO", "Portföye Geri Al"]]);
  });

  it("maskeli satır ve son durumlar boş menü", () => {
    expect(
      transitionMenu(item({ employeeMasked: true, allowedTransitions: ["AT_BANK"] }), "check"),
    ).toEqual([]);
    expect(transitionMenu(item({ status: "COLLECTED", allowedTransitions: [] }), "check")).toEqual(
      [],
    );
  });

  it("her hedefin iki varyantta da etiketi var", () => {
    for (const target of ALL.filter(
      (s) => s !== "ENDORSED" && s !== "CANCELLED" && s !== "ISSUED",
    )) {
      for (const variant of ["check", "bill"] as const) {
        const menu = transitionMenu(
          item({ direction: "RECEIVED", status: "AT_BANK", allowedTransitions: [target] }),
          variant,
        );
        expect(text(menu[0]?.labelKey ?? null), `${variant}/${target}`).toBeTruthy();
      }
    }
  });
});

describe("diğer yardımcılar", () => {
  it("canEditInstrument ve noteTypeLabelKey", () => {
    expect(canEditInstrument(item())).toBe(true);
    expect(canEditInstrument(item({ status: "CANCELLED" }))).toBe(false);
    expect(canEditInstrument(item({ status: "RETURNED" }))).toBe(false);
    expect(canEditInstrument(item({ employeeMasked: true }))).toBe(false);
    expect(text(noteTypeLabelKey("ORDER"))).toBe("Emre Yazılı Senet");
    expect(text(noteTypeLabelKey("BOND"))).toBe("Bono");
    expect(noteTypeLabelKey(null)).toBeNull();
  });
});
