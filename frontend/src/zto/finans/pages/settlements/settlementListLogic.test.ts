import { describe, expect, it } from "vitest";
import collections from "../../../../locales/tr/ztoFinans/collections";
import payments from "../../../../locales/tr/ztoFinans/payments";
import type { BranchTree } from "../../../branch/branchTree";
import {
  LENGTH_MENU,
  METHOD_OPTIONS,
  MAX_SORTS,
  PAGE_LENGTH,
  TABLE_DOM,
  accountOptions,
  accountingCell,
  amountText,
  canDelete,
  canEdit,
  canShowDetail,
  defaultFilters,
  deleteMessageParts,
  exportRow,
  fxCell,
  groupValue,
  isReverseDateValid,
  isSubmitEnter,
  listParams,
  methodBadge,
  parseGroup,
  payMethodOf,
  rateText,
  reverseBounds,
  sortParams,
  sourceCell,
  workPlaceGroups,
} from "./settlementListLogic";
import { bankItem, makeItem } from "./settlementsTestUtils";

const TABLE = { start: 20, length: 10, search: "  fatura ", sorting: [] };

describe("tablo ayarları (Rev 1 F10)", () => {
  it("ZTO pageLength 25, [10,25,50,100], 'Tümü' (-1) yok (zto-onyuz:F6)", () => {
    expect(PAGE_LENGTH).toBe(25);
    expect(LENGTH_MENU).toEqual([10, 25, 50, 100]);
    expect(LENGTH_MENU).not.toContain(-1);
    expect(TABLE_DOM).toContain('"col-sm-12 col-md-6"l');
  });

  it("yöntem seçenekleri ZTO sırasıyla, 'Diğer' yok", () => {
    expect(METHOD_OPTIONS).toEqual(["CASH", "BANK", "CHECK", "NOTE", "CREDIT_CARD"]);
  });
});

describe("süzgeç ve sorgu", () => {
  it("varsayılan aralık yerel takvimde bugün−7…bugün (ay ve yıl sınırı)", () => {
    expect(defaultFilters("2026-11-15")).toEqual({
      companyId: "",
      accountId: "",
      group: "",
      branchId: "",
      from: "2026-11-08",
      to: "2026-11-15",
      method: "",
    });
    expect(defaultFilters("2026-01-03", "c1")).toMatchObject({
      companyId: "c1",
      from: "2025-12-27",
      to: "2026-01-03",
    });
  });

  it("Hesap Grubu değeri ↔ accountType + subGroup", () => {
    expect(groupValue("SUPPLIER", "TED")).toBe("SUPPLIER:TED");
    expect(parseGroup("SUPPLIER:TED")).toEqual({ accountType: "SUPPLIER", subGroup: "TED" });
    expect(parseGroup("CUSTOMER:")).toEqual({ accountType: "CUSTOMER", subGroup: undefined });
    expect(parseGroup("")).toEqual({});
    expect(parseGroup(":X")).toEqual({});
  });

  it("sıralama beyaz listesi; tarih sıralamasına createdAt eklenir; boşsa varsayılan", () => {
    expect(sortParams(undefined)).toEqual(["settlementDate,desc", "createdAt,desc"]);
    expect(sortParams([{ id: "date", desc: false }])).toEqual([
      "settlementDate,asc",
      "createdAt,asc",
    ]);
    expect(
      sortParams([
        { id: "amount", desc: true },
        { id: "description", desc: false },
      ]),
    ).toEqual(["amount,desc"]);
    expect(sortParams([{ id: "account", desc: false }])).toEqual(["accountName,asc"]);
    expect(sortParams([{ id: "method", desc: false }])).toEqual([
      "settlementDate,desc",
      "createdAt,desc",
    ]);
  });

  it("Shift çok sütunlu sıralama en çok MAX_SORTS (3) anahtar üretir (zto-onyuz:F3)", () => {
    expect(MAX_SORTS).toBe(3);
    expect(
      sortParams([
        { id: "date", desc: true },
        { id: "amount", desc: false },
        { id: "documentNo", desc: false },
      ]),
    ).toEqual(["settlementDate,desc", "createdAt,desc", "amount,asc"]);
    const four = sortParams([
      { id: "workPlace", desc: false },
      { id: "account", desc: true },
      { id: "documentNo", desc: false },
      { id: "amount", desc: true },
    ]);
    expect(four).toEqual(["branchName,asc", "accountName,desc", "documentNo,asc"]);
    // Tarih üçüncü sırada: createdAt'e yer kalmaz; aynı alan tekrar edilmez.
    expect(
      sortParams([
        { id: "amount", desc: false },
        { id: "amount", desc: true },
        { id: "account", desc: false },
        { id: "date", desc: true },
      ]),
    ).toEqual(["amount,asc", "accountName,asc", "settlementDate,desc"]);
  });

  it("liste sorgusu: POSTED + hasAccount, sayfa/boyut tablodan, arama q", () => {
    const filters = {
      ...defaultFilters("2026-11-15"),
      accountId: "a1",
      group: "SUPPLIER:TED",
      branchId: "b1",
      method: "CREDIT_CARD" as const,
    };
    expect(listParams(filters, TABLE, false)).toEqual({
      companyId: undefined,
      accountId: "a1",
      accountType: "SUPPLIER",
      subGroup: "TED",
      branchIds: ["b1"],
      methods: ["CREDIT_CARD"],
      status: "POSTED",
      hasAccount: true,
      from: "2026-11-08",
      to: "2026-11-15",
      q: "fatura",
      page: 2,
      size: 10,
      sort: ["settlementDate,desc", "createdAt,desc"],
    });
  });

  it("tablo yokken ilk sayfa 25 satır; boş alanlar yazılmaz; çoklu şirkette konsolide null", () => {
    const params = listParams({ ...defaultFilters("2026-11-15"), from: "", to: "" }, null, true);
    expect(params).toMatchObject({
      companyId: null,
      accountId: undefined,
      branchIds: undefined,
      methods: undefined,
      from: undefined,
      to: undefined,
      q: undefined,
      page: 0,
      size: 25,
    });
    expect(listParams({ ...defaultFilters("2026-11-15", "c2") }, null, true).companyId).toBe("c2");
    expect(
      listParams(
        defaultFilters("2026-11-15"),
        { ...TABLE, start: 50, length: 0, search: "" },
        false,
      ),
    ).toMatchObject({ size: 25, page: 2, q: undefined });
  });

  it("Enter = Filtrele; IME bileşimi (isComposing / keyCode 229) yok sayılır", () => {
    expect(isSubmitEnter({ key: "Enter" })).toBe(true);
    expect(isSubmitEnter({ key: "Enter", isComposing: true })).toBe(false);
    expect(isSubmitEnter({ key: "Enter", keyCode: 229 })).toBe(false);
    expect(isSubmitEnter({ key: "a" })).toBe(false);
  });
});

describe("seçenek listeleri", () => {
  it("cari seçeneği 'kod - ad (grup)'", () => {
    expect(
      accountOptions([
        { id: "a1", code: "120.01", name: "Kuzey", subGroupName: "Tedarikçiler" },
        { id: "a2", code: "120.02", name: "Güney", subGroupName: null },
      ]),
    ).toEqual([
      { value: "a1", label: "120.01 - Kuzey (Tedarikçiler)" },
      { value: "a2", label: "120.02 - Güney" },
    ]);
  });

  it("iş yeri seçici: şube optgroup'ları, pasif iş yeri ve boş şube yok, şirket süzgeci", () => {
    const tree: BranchTree = [
      {
        companyId: "c1",
        companyName: "Acme",
        companyActive: true,
        groups: [
          {
            groupId: "g1",
            groupName: "İzmir",
            groupActive: true,
            branches: [
              { id: "b1", code: "1", name: "Merkez", active: true },
              { id: "b2", code: "2", name: "Eski", active: false },
            ],
          },
          {
            groupId: "g2",
            groupName: "Boş",
            groupActive: true,
            branches: [{ id: "b9", code: "9", name: "Kapalı", active: false }],
          },
        ],
      },
      {
        companyId: "c2",
        companyName: "Beta",
        companyActive: true,
        groups: [
          {
            groupId: "g3",
            groupName: "Ankara",
            groupActive: true,
            branches: [{ id: "b3", code: "3", name: "Çankaya", active: true }],
          },
        ],
      },
    ];
    expect(workPlaceGroups(tree, null)).toEqual([
      { label: "İzmir", options: [{ value: "b1", label: "Merkez" }] },
      { label: "Ankara", options: [{ value: "b3", label: "Çankaya" }] },
    ]);
    expect(workPlaceGroups(tree, "c2")).toEqual([
      { label: "Ankara", options: [{ value: "b3", label: "Çankaya" }] },
    ]);
    expect(workPlaceGroups(undefined, null)).toEqual([]);
  });
});

describe("hücreler", () => {
  it("yöntem rozeti: sınıflar ve çek/senet numara satırı", () => {
    expect(methodBadge(makeItem())).toEqual({
      method: "CASH",
      className: "badge-success",
      sub: null,
    });
    expect(methodBadge(bankItem()).className).toBe("badge-primary");
    expect(methodBadge(makeItem({ displayMethod: "CREDIT_CARD" })).className).toBe("badge-danger");
    expect(methodBadge(makeItem({ displayMethod: "CHECK", instrumentNumber: "1234567" }))).toEqual({
      method: "CHECK",
      className: "badge-info",
      sub: { kind: "CHECK", className: "text-info", number: "1234567" },
    });
    expect(methodBadge(makeItem({ displayMethod: "NOTE", instrumentNumber: "S-9" })).sub).toEqual({
      kind: "NOTE",
      className: "text-warning",
      number: "S-9",
    });
    expect(
      methodBadge(makeItem({ displayMethod: "CHECK", instrumentNumber: null })).sub,
    ).toBeNull();
    expect(payMethodOf({ displayMethod: "OTHER" })).toBe("BANK");
  });

  it("muhasebe tipi: cari / çek / senet / şirketler arası; plan alt satırı", () => {
    expect(accountingCell(makeItem())).toEqual({
      key: "regular",
      className: "badge-success",
      icon: "fa-user",
      plan: false,
    });
    expect(accountingCell(makeItem({ displayMethod: "CREDIT_CARD", planId: "p1" }))).toMatchObject({
      key: "regular",
      plan: true,
    });
    expect(accountingCell(makeItem({ displayMethod: "CHECK" }))).toMatchObject({
      key: "check",
      className: "badge-secondary",
      icon: "fa-file-alt",
    });
    expect(accountingCell(makeItem({ displayMethod: "NOTE" })).key).toBe("note");
    expect(accountingCell(bankItem({ intercompany: true }))).toMatchObject({
      key: "intercompany",
      className: "badge-primary",
      icon: "fa-university",
    });
  });

  it("kaynak: kasa adı; banka 'banka - şube', yoksa fon adı; fonsuz null", () => {
    expect(sourceCell(makeItem())).toEqual({
      kind: "CASH",
      fundAccountId: "k1",
      text: "Merkez Kasa",
    });
    expect(sourceCell(bankItem())?.text).toBe("Ziraat - Konak");
    expect(sourceCell(bankItem({ fundBankBranchName: null }))?.text).toBe("Ziraat");
    expect(sourceCell(bankItem({ fundBankName: "  " }))?.text).toBe("Ziraat Vadesiz");
    expect(sourceCell(makeItem({ fundAccountId: null, fundKind: null }))).toBeNull();
    expect(sourceCell(makeItem({ fundName: null }))?.text).toBe("");
  });

  it("tutar 'N2 sembol'; tahsilat 'Kur:' her satırda, kur yoksa 1,0000", () => {
    expect(amountText({ amount: "1234.5", currency: "EUR" })).toBe("1.234,50 €");
    expect(rateText(null)).toBe("1,0000");
    expect(rateText(undefined)).toBe("1,0000");
    expect(rateText(36.1234)).toBe("36,1234");
    expect(rateText(1)).toBe("1,0000");
  });
});

describe("Düzenle / Sil görünürlüğü", () => {
  it("ödeme: Düzenle yalnız correctable Nakit/Banka (Kredi Kartı yok); Sil reversible ve çek değil", () => {
    expect(canEdit("PAYMENT", makeItem())).toBe(true);
    expect(canEdit("PAYMENT", bankItem())).toBe(true);
    expect(canEdit("PAYMENT", makeItem({ displayMethod: "CREDIT_CARD" }))).toBe(false);
    expect(canEdit("PAYMENT", makeItem({ correctable: false }))).toBe(false);
    expect(canDelete("PAYMENT", makeItem({ displayMethod: "CREDIT_CARD" }))).toBe(true);
    expect(canDelete("PAYMENT", makeItem({ displayMethod: "CHECK" }))).toBe(false);
    expect(canDelete("PAYMENT", makeItem({ displayMethod: "NOTE" }))).toBe(false);
    expect(canDelete("PAYMENT", makeItem({ reversible: false }))).toBe(false);
    // Döviz bozumu ödemede Sil'i etkilemez (fxUsed hep 0; kural tahsilata özgü).
    expect(canDelete("PAYMENT", makeItem({ fxUsed: "5" }))).toBe(true);
  });

  it("taşınmış (TRANSFERRED) satırda ikisi de gizli", () => {
    const moved = makeItem({
      transferred: true,
      lockReason: "TRANSFERRED",
      reversible: false,
      correctable: false,
    });
    expect(canEdit("PAYMENT", moved)).toBe(false);
    expect(canDelete("PAYMENT", moved)).toBe(false);
    expect(canEdit("COLLECTION", moved)).toBe(false);
    expect(canDelete("COLLECTION", moved)).toBe(false);
  });

  it("tahsilat: Düzenle + Sil yalnız bozulmamış, çek/senet olmayan; Kredi Kartı düzenlenebilir", () => {
    const row = makeItem({ type: "COLLECTION" });
    expect(canEdit("COLLECTION", row)).toBe(true);
    expect(canDelete("COLLECTION", row)).toBe(true);
    expect(canEdit("COLLECTION", makeItem({ displayMethod: "CREDIT_CARD" }))).toBe(true);
    expect(canEdit("COLLECTION", makeItem({ fxUsed: "10.00" }))).toBe(false);
    expect(canDelete("COLLECTION", makeItem({ fxUsed: "0.0001" }))).toBe(false);
    expect(canDelete("COLLECTION", makeItem({ displayMethod: "CHECK" }))).toBe(false);
    expect(canEdit("COLLECTION", makeItem({ displayMethod: "NOTE" }))).toBe(false);
    expect(canEdit("COLLECTION", makeItem({ correctable: false }))).toBe(false);
    expect(canDelete("COLLECTION", makeItem({ correctable: false }))).toBe(true);
  });

  it("Detay maskeli personel satırında gizli", () => {
    expect(canShowDetail(makeItem())).toBe(true);
    expect(canShowDetail(makeItem({ employeeMasked: true }))).toBe(false);
  });
});

describe("Döviz Bozum hücresi (Rev 1 F7)", () => {
  const eur = (fxUsed: string, fxRemaining: string, amount = "1000.00") =>
    fxCell(makeItem({ money: { amount, currency: "EUR" }, fxUsed, fxRemaining }));

  it("TRY: yalnız 'Döviz Değil'", () => {
    expect(fxCell(makeItem())).toEqual({ kind: "notFx" });
  });

  it("Bekliyor: %0 • toplam sembol, Boz var", () => {
    expect(eur("0", "1000.00")).toEqual({
      kind: "progress",
      status: "WAITING",
      badgeClass: "badge-warning",
      barClass: "bg-warning",
      width: "0",
      percentText: "0",
      info: "%0 • 1.000,00 €",
      showExchange: true,
      showTransfers: false,
    });
  });

  it("Kısmi: %oran • bozulan / toplam sembol; tam sayıda 0, değilse 1 ondalık", () => {
    expect(eur("250.00", "750.00")).toMatchObject({
      status: "PARTIAL",
      badgeClass: "badge-info",
      barClass: "bg-info",
      width: "25.00",
      percentText: "25",
      info: "%25 • 250,00 / 1.000,00 €",
      showExchange: true,
      showTransfers: false,
    });
    const third = eur("1.00", "2.00", "3.00");
    expect(third).toMatchObject({ width: "33.33", percentText: "33.3" });
    // Kalan sunucudan gelir: bozulan = toplam − kalan (ondalık güvenli, 0.1 + 0.2 sorunu yok).
    expect(eur("0.10", "0.20", "0.30")).toMatchObject({
      status: "PARTIAL",
      info: "%33.3 • 0,10 / 0,30 €",
    });
  });

  it("Tamamlandı: %100 • toplam sembol + Transferler bağlantısı, Boz yok", () => {
    expect(eur("1000.00", "0")).toMatchObject({
      status: "DONE",
      badgeClass: "badge-success",
      barClass: "bg-success",
      width: "100.00",
      percentText: "100",
      info: "%100 • 1.000,00 €",
      showExchange: false,
      showTransfers: true,
    });
  });

  it("aşırı/geçersiz değerler kırpılır", () => {
    expect(eur("10", "-5")).toMatchObject({ status: "DONE", width: "100.00" });
    expect(eur("5", "2000")).toMatchObject({ status: "PARTIAL", width: "0.00", percentText: "0" });
    expect(eur("x", "y")).toMatchObject({ status: "WAITING" });
    expect(eur("0", "0", "0")).toMatchObject({ status: "WAITING", info: "%0 • 0 €" });
  });
});

describe("silme onayı", () => {
  it("iptal tarihi: kayıt tarihi ≤ tarih ≤ max(bugün, kayıt tarihi), varsayılan üst sınır", () => {
    expect(reverseBounds("2026-11-10", "2026-11-15")).toEqual({
      min: "2026-11-10",
      max: "2026-11-15",
      initial: "2026-11-15",
    });
    // İleri tarihli kayıt: üst sınır kaydın kendi tarihi.
    expect(reverseBounds("2026-11-20", "2026-11-15")).toEqual({
      min: "2026-11-20",
      max: "2026-11-20",
      initial: "2026-11-20",
    });
    const bounds = reverseBounds("2026-11-10", "2026-11-15");
    expect(isReverseDateValid("2026-11-10", bounds)).toBe(true);
    expect(isReverseDateValid("2026-11-15", bounds)).toBe(true);
    expect(isReverseDateValid("2026-11-09", bounds)).toBe(false);
    expect(isReverseDateValid("2026-11-16", bounds)).toBe(false);
    expect(isReverseDateValid("", bounds)).toBe(false);
  });

  it("ileti: 'TL' sabiti yerine para birimi sembolü; maskeli carinin adı yok", () => {
    expect(deleteMessageParts(makeItem({ money: { amount: "99.5", currency: "USD" } }))).toEqual({
      amount: "99,50",
      currency: "$",
      account: "Kuzey Lojistik",
    });
    expect(deleteMessageParts(makeItem({ employeeMasked: true, accountName: null })).account).toBe(
      null,
    );
    expect(deleteMessageParts(makeItem({ accountName: null })).account).toBe("");
  });
});

describe("Excel satırı", () => {
  const texts = {
    headers: [],
    method: (m: string) => `M:${m}`,
    accounting: (c: { key: string }) => `A:${c.key}`,
    masked: "Personel (gizli)",
  };
  const date = (iso: string) => iso.split("-").reverse().join(".");

  it("ödeme: görünen hücre metinleri (İşlem hariç)", () => {
    expect(exportRow("PAYMENT", bankItem(), texts, date)).toEqual([
      "14.11.2026",
      "Merkez",
      "Kuzey Lojistik (120.01)",
      "FT-1",
      "1.500,00 ₺",
      "M:BANK",
      "A:regular",
      "Ziraat - Konak",
      "Kasım ödemesi",
    ]);
  });

  it("tahsilat: şirket sütunu, maskeli cari, çek numarası ve Döviz Bozum", () => {
    const row = makeItem({
      employeeMasked: true,
      accountName: null,
      accountCode: null,
      documentNo: null,
      description: null,
      branchName: "",
      displayMethod: "CHECK",
      instrumentNumber: "1234567",
      fundAccountId: null,
      fundKind: null,
      money: { amount: "100", currency: "EUR" },
      fxUsed: "0",
      fxRemaining: "100",
    });
    expect(
      exportRow("COLLECTION", row, { ...texts, companyName: (id) => `Şirket ${id}` }, date),
    ).toEqual([
      "14.11.2026",
      "-",
      "Şirket c1",
      "Personel (gizli)",
      "-",
      "100,00 €",
      "M:CHECK 1234567",
      "A:check",
      "-",
      "-",
      "%0 • 100,00 €",
    ]);
    expect(exportRow("COLLECTION", makeItem(), texts, date).at(-1)).toBe("-");
    expect(exportRow("PAYMENT", makeItem({ accountCode: null }), texts, date)[2]).toBe(
      "Kuzey Lojistik",
    );
  });
});

describe("dil parçaları", () => {
  it("ödeme ve tahsilat türe özgü alt ağaçları aynı anahtarlara sahip", () => {
    for (const part of ["accounting", "detail", "reverse", "dailyModal", "table"] as const) {
      const p = Object.keys(payments[part]).filter((k) => k !== "fx");
      const c = Object.keys(collections[part]).filter((k) => k !== "fx");
      expect(c, part).toEqual(p);
    }
    expect(Object.keys(collections.header)).toEqual(
      expect.arrayContaining(Object.keys(payments.header)),
    );
  });
});
