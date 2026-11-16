import { describe, expect, it } from "vitest";
import nav from "../../locales/tr/ztoFinans/nav";
import {
  accountBankAccountsPath,
  accountEditPath,
  accountTransactionsPath,
  activeItemIds,
  balanceSheetPath,
  bankAccountEditPath,
  cashFlowPath,
  currenciesPath,
  customerAccountReportPath,
  financeReportPath,
  fxReportPath,
  carrierDetailPath,
  expenseCalendarPath,
  expenseEditPath,
  expenseItemEditPath,
  expenseItemInvoicesPath,
  generalExpensesPath,
  newExpenseItemPath,
  newExpensePath,
  shipmentExpensesPath,
  bankDetailPath,
  bankEditPath,
  billEditPath,
  billsPath,
  canonicalTransferType,
  cashEditPath,
  checkBooksPath,
  checkDetailedReportPath,
  checkDocumentsPath,
  checkEditPath,
  checksPath,
  collectionsPath,
  dailySettlementReportPath,
  exchangeBreakReportPath,
  EXCLUDED_ZTO_ITEMS,
  fundActivityPath,
  fundExtractPath,
  fundTransactionsPath,
  isActive,
  isFinanceMenuItem,
  isModalAction,
  isNavigable,
  itemPath,
  newBankAccountPath,
  newBankPath,
  newCashPath,
  paymentsPath,
  statementPath,
  stepOf,
  TRANSFER_TYPE_ALIASES,
  TRANSFER_TYPE_PARAMS,
  transferCenterPath,
  visibleSections,
  ZTO_FINANS_BASE,
  ZTO_NAV_SECTIONS,
  ZTO_SLUGS,
  type ZtoNavItem,
} from "./navItems";

const items = ZTO_NAV_SECTIONS.flatMap((s) => s.items);
// ZTO finans yan menüsünün (_SideMenu_FinanceItems) öğeleri; TEMEL TANIMLAR (_Layout + Blackrose eki),
// 12.8 ekleri (Cari Hesap Raporları, reçeteli finans menüsü) ve vitrin bu sıra/sayım testlerine girmez.
const ztoItems = items.filter((i) => !i.devOnly && isFinanceMenuItem(i));
// 12.8 (§5.3): TEMEL TANIMLAR öğeleri kaynak dosyasıyla değil bölüm kimliğiyle türetilir.
const definitionItems = ZTO_NAV_SECTIONS.find((s) => s.id === "basic-definitions")!.items;
const STEPS = [
  "12.1",
  "12.1a",
  "12.2",
  "12.2a",
  "12.3",
  "12.4",
  "12.5",
  "12.6",
  "12.7",
  "12.8",
  "12.9",
  "12.10",
];

describe("ZTO finans menü kaydı", () => {
  it("_SideMenu_FinanceItems sırası korunur (kaynak satırları artan)", () => {
    const lines = ztoItems.map((i) => i.source.line);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
    expect(ztoItems.map((i) => i.id)).toEqual([
      "financeReports",
      "allTransactions",
      "quickTransaction",
      "accounts",
      "newAccount",
      "personnel",
      "banks",
      "allBankTransactions",
      "cashes",
      "allCashTransactions",
      "transferCenter",
      "payments",
      "collections",
      "checks",
      "bills",
      "allPlans",
      "paymentApproval",
      "quickBalance",
      "balanceSheet",
      "credits",
      "timeDeposits",
      "shipmentTransportExpenses",
      "generalExpenses",
      "customerReceivables",
      "uyumsoftDashboard",
      "incomingInvoices",
      "uyumsoftSettings",
    ]);
  });

  it("ÇIKAR öğeler listede yok; çıkarılan ve alınan satırlar çakışmaz", () => {
    const taken = new Set(ztoItems.map((i) => i.source.line));
    expect(EXCLUDED_ZTO_ITEMS.filter((e) => taken.has(e.line))).toEqual([]);
    const controllers = ztoItems.map((i) => i.source.controller.toLowerCase());
    for (const banned of ["investments", "materialstockall", "harvestmanagerexpenses", "report"]) {
      expect(controllers).not.toContain(banned);
    }
    // Menü dosyasındaki her bağlantı ya alınmış ya da gerekçeyle çıkarılmıştır.
    expect(taken.size + EXCLUDED_ZTO_ITEMS.length).toBe(37);
  });

  it("etiket anahtarları ztoFinans:nav içinde; kimlikler benzersiz; adımlar FAZ_12 tablosundan", () => {
    for (const label of [...ZTO_NAV_SECTIONS.map((s) => s.label), ...items.map((i) => i.label)]) {
      expect(nav[label], label).toBeTruthy();
    }
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const item of ztoItems) expect(STEPS, item.id).toContain(item.step);
  });

  it("uygulanmış ekranlar: 12.1 cari, 12.2 banka/kasa, 12.2a ödeme/tahsilat, 12.3 çek/senet, 12.7 masraf, 12.8 raporlar, tanımlar, vitrin", () => {
    expect(items.filter((i) => i.implemented).map((i) => i.id)).toEqual([
      "financeReports",
      "customerAccountReport",
      "allTransactions",
      "quickTransaction",
      "accounts",
      "newAccount",
      "banks",
      "allBankTransactions",
      "cashes",
      "allCashTransactions",
      "transferCenter",
      "payments",
      "collections",
      "checks",
      "bills",
      "quickBalance",
      "balanceSheet",
      "fxReport",
      "cashFlow",
      "shipmentTransportExpenses",
      "generalExpenses",
      "expenseItems",
      "currencies",
      "workPlaces",
      "branchGroups",
      "companies",
      "showcase",
    ]);
    expect(ZTO_SLUGS).toEqual({
      allTransactions: "cari-hareketler",
      showcase: "vitrin",
      workPlaces: "tanimlar/is-yerleri",
      branchGroups: "tanimlar/subeler",
      companies: "tanimlar/sirketler",
      accounts: "cari-kartlar",
      newAccount: "cari-kartlar/yeni",
      banks: "bankalar",
      cashes: "kasalar",
      bankTransactions: "banka-hareketleri",
      cashTransactions: "kasa-hareketleri",
      transferCenter: "transfer-merkezi",
      payments: "odemeler",
      collections: "tahsilatlar",
      checks: "cekler",
      bills: "senetler",
      expenseItems: "tanimlar/masraf-kalemleri",
      generalExpenses: "genel-masraflar",
      expenseCalendar: "genel-masraflar/takvim",
      shipmentExpenses: "sevk-nakliye-masraflari",
      financeReports: "finans-raporlari",
      customerAccountReport: "cari-raporlari",
      balanceSheet: "bilanco",
      fxReport: "kur-farki-raporu",
      cashFlow: "nakit-akis",
      currencies: "tanimlar/para-birimleri",
    });
    // 12.7: Sevk Nakliye Masrafları (SHIPMENT_VIEW) ve Genel Masraf alt yollarda da etkin.
    const transport = items.find((i) => i.id === "shipmentTransportExpenses")!;
    expect([transport.step, transport.permission, transport.matchPrefix]).toEqual([
      "12.7",
      "SHIPMENT_VIEW",
      true,
    ]);
    const general = items.find((i) => i.id === "generalExpenses")!;
    expect([general.step, general.permission, general.matchPrefix]).toEqual([
      "12.7",
      undefined,
      true,
    ]);
    expect(isActive(general, "/zto-finans/genel-masraflar/takvim")).toBe(true);
    expect(isActive(transport, "/zto-finans/sevk-nakliye-masraflari/firma/a1")).toBe(true);
    const accounts = items.find((i) => i.id === "accounts")!;
    expect(accounts.matchPrefix).toBe(true);
    const add = items.find((i) => i.id === "newAccount")!;
    expect(add.permission).toBe("FINANCE_MANAGE");
    expect(add.action).toBe("add");
    // 12.2: beş Banka & Kasa öğesi sayfa bağlantısı; Bankalar ve Kasalar alt yollarda da etkin.
    const bankCash = ZTO_NAV_SECTIONS.find((s) => s.id === "bankCash")!.items;
    expect(bankCash.map((i) => [i.slug, i.step, isNavigable(i), i.matchPrefix ?? false])).toEqual([
      ["bankalar", "12.2", true, true],
      ["banka-hareketleri", "12.2", true, false],
      ["kasalar", "12.2", true, true],
      ["kasa-hareketleri", "12.2", true, false],
      ["transfer-merkezi", "12.2", true, false],
    ]);
    // 12.2a: Ödemeler ve Tahsilatlar sayfa bağlantısı, günlük rapor alt yolunda da etkin; 12.3: Çekler
    // ve Senetler alt yollarda (koçanlar, düzenle, belgeler) da etkin.
    const paymentCollection = ZTO_NAV_SECTIONS.find((s) => s.id === "paymentCollection")!.items;
    expect(
      paymentCollection.map((i) => [i.slug, i.step, isNavigable(i), i.matchPrefix ?? false]),
    ).toEqual([
      ["odemeler", "12.2a", true, true],
      ["tahsilatlar", "12.2a", true, true],
      ["cekler", "12.3", true, true],
      ["senetler", "12.3", true, true],
    ]);
    // Tüm Planlamalar 12.4'te (plan modalları).
    expect(items.find((i) => i.id === "allPlans")!.implemented).toBe(false);
  });

  it("TEMEL TANIMLAR bölümü 'dev'den önce; kaynakları _Layout ve Blackrose eki", () => {
    const ids = ZTO_NAV_SECTIONS.map((s) => s.id);
    expect(ids.indexOf("basic-definitions")).toBe(ids.indexOf("dev") - 1);
    const section = ZTO_NAV_SECTIONS.find((s) => s.id === "basic-definitions")!;
    expect(section.label).toBe("sectionBasicDefinitions");
    expect(section.icon).toBe("fas fa-sitemap");
    expect(definitionItems.map((i) => [i.id, i.slug, i.source.file, i.source.line])).toEqual([
      ["expenseItems", "tanimlar/masraf-kalemleri", "_Layout", 1201],
      ["currencies", "tanimlar/para-birimleri", "_Layout", 1268],
      ["workPlaces", "tanimlar/is-yerleri", "_Layout", 1284],
      ["branchGroups", "tanimlar/subeler", "_Layout", 1288],
      ["companies", "tanimlar/sirketler", "blackrose", 0],
    ]);
    // 12.8 (§5.3): Para Birimleri ayrı doğrulanır (FINANCE_VIEW, alt yolu yok).
    const currencies = definitionItems.find((i) => i.id === "currencies")!;
    expect([currencies.permission, currencies.step, currencies.matchPrefix]).toEqual([
      "FINANCE_VIEW",
      "12.8",
      undefined,
    ]);
    expect(isNavigable(currencies)).toBe(true);
    for (const item of definitionItems.filter((i) => i.id !== "currencies")) {
      // 12.7: Masraf Kalemleri finans izniyle; diğer tanımlar iş yeri izniyle (12.1a).
      const expense = item.id === "expenseItems";
      expect(item.permission).toBe(expense ? "FINANCE_VIEW" : "BRANCH_VIEW");
      expect(item.matchPrefix).toBe(true);
      expect(item.step).toBe(expense ? "12.7" : "12.1a");
      expect(isNavigable(item)).toBe(true);
    }
    expect(isFinanceMenuItem(items.find((i) => i.id === "payments")!)).toBe(true);
  });

  it("izin süzgeci: izinsiz öğe gizli, boş kalan bölüm atılır", () => {
    const withoutBranch = visibleSections(
      false,
      ZTO_NAV_SECTIONS,
      (p) => p !== "BRANCH_VIEW" && p !== "FINANCE_VIEW",
    );
    expect(withoutBranch.some((s) => s.id === "basic-definitions")).toBe(false);
    const all = visibleSections(false, ZTO_NAV_SECTIONS, () => true);
    expect(all.find((s) => s.id === "basic-definitions")?.items).toHaveLength(5);
    // Varsayılan can: hepsi görünür.
    expect(visibleSections(false)).toEqual(all);
    const asked: string[] = [];
    visibleSections(true, ZTO_NAV_SECTIONS, (p) => {
      asked.push(p);
      return true;
    });
    expect(new Set(asked)).toEqual(
      new Set(["BRANCH_VIEW", "FINANCE_MANAGE", "FINANCE_VIEW", "SHIPMENT_VIEW"]),
    );
    const withoutManage = visibleSections(false, ZTO_NAV_SECTIONS, (p) => p !== "FINANCE_MANAGE");
    expect(withoutManage.flatMap((s) => s.items).some((i) => i.id === "newAccount")).toBe(false);
  });

  it("matchPrefix: alt yollar (yeni, düzenle) öğeyi etkin yapar; benzer önek etkin yapmaz", () => {
    const workPlaces = items.find((i) => i.id === "workPlaces")!;
    expect(isActive(workPlaces, "/zto-finans/tanimlar/is-yerleri")).toBe(true);
    expect(isActive(workPlaces, "/zto-finans/tanimlar/is-yerleri/yeni")).toBe(true);
    expect(isActive(workPlaces, "/zto-finans/tanimlar/is-yerleri/abc/")).toBe(true);
    expect(isActive(workPlaces, "/zto-finans/tanimlar/is-yerleri-x")).toBe(false);
    expect(isActive(workPlaces, "/zto-finans/tanimlar/subeler")).toBe(false);
    const all = items.find((i) => i.id === "allTransactions")!;
    expect(isActive(all, "/zto-finans/cari-hareketler/alt")).toBe(false);
    expect(stepOf("tanimlar/sirketler")).toBe("12.1a");
  });

  it("vitrin yalnız geliştirmede; boş kalan bölüm atılır", () => {
    expect(visibleSections(true).at(-1)?.id).toBe("dev");
    expect(visibleSections(false).some((s) => s.id === "dev")).toBe(false);
    expect(visibleSections(false)).toHaveLength(ZTO_NAV_SECTIONS.length - 1);
  });

  it("yol, etkinlik ve gezinebilirlik", () => {
    const all = items.find((i) => i.id === "allTransactions") as ZtoNavItem;
    const quick = items.find((i) => i.id === "quickTransaction") as ZtoNavItem;
    expect(itemPath(all)).toBe(`${ZTO_FINANS_BASE}/cari-hareketler`);
    expect(isActive(all, "/zto-finans/cari-hareketler")).toBe(true);
    expect(isActive(all, "/zto-finans/cari-hareketler/")).toBe(true);
    expect(isActive(all, "/zto-finans/vitrin")).toBe(false);
    expect(isActive(all, "/")).toBe(false);
    // Modal öğesi aynı adresi paylaşsa da etkin görünmez ve bağlantı değildir.
    expect(isActive(quick, "/zto-finans/cari-hareketler")).toBe(false);
    expect(isNavigable(all)).toBe(true);
    expect(isNavigable(quick)).toBe(false);
    expect(isModalAction(quick)).toBe(true);
    expect(isModalAction({ ...quick, implemented: false })).toBe(false);
    expect(isModalAction(all)).toBe(false);
  });

  it("ZTO'daki gibi Cari Kartlar ve Tüm Planlamalar aynı sayfada birlikte etkin", () => {
    const active = items.filter((i) => isActive(i, "/zto-finans/cari-kartlar")).map((i) => i.id);
    expect(active).toEqual(["accounts", "allPlans"]);
    expect(stepOf("cari-kartlar")).toBe("12.1");
    expect(stepOf("odemeler")).toBe("12.2a");
    expect(stepOf("yok")).toBeUndefined();
  });
});

describe("activeItemIds (en uzun eşleşme, 12.1 §5.4 F12)", () => {
  const ids = (path: string) => [...activeItemIds(items, path)].sort();

  it("Cari Kartlar ve Tüm Planlamalar aynı yolda birlikte", () => {
    expect(ids("/zto-finans/cari-kartlar")).toEqual(["accounts", "allPlans"]);
    expect(ids("/zto-finans/cari-kartlar/")).toEqual(["accounts", "allPlans"]);
  });

  it("alt yollar: yeni → yalnız Yeni Cari Kart; hareketler → yalnız Cari Kartlar", () => {
    expect(ids("/zto-finans/cari-kartlar/yeni")).toEqual(["newAccount"]);
    expect(ids("/zto-finans/cari-kartlar/abc/hareketler")).toEqual(["accounts"]);
    expect(ids("/zto-finans/cari-kartlar/abc/duzenle")).toEqual(["accounts"]);
    expect(ids("/zto-finans/cari-kartlar/abc/banka-hesaplari/yeni")).toEqual(["accounts"]);
  });

  it("12.2: Bankalar/Kasalar alt yolları; hareket sayfaları kendi öğesi", () => {
    expect(ids("/zto-finans/bankalar")).toEqual(["banks"]);
    expect(ids("/zto-finans/bankalar/yeni")).toEqual(["banks"]);
    expect(ids("/zto-finans/bankalar/f1")).toEqual(["banks"]);
    expect(ids("/zto-finans/bankalar/f1/duzenle")).toEqual(["banks"]);
    expect(ids("/zto-finans/kasalar/k1/duzenle")).toEqual(["cashes"]);
    expect(ids("/zto-finans/banka-hareketleri")).toEqual(["allBankTransactions"]);
    expect(ids("/zto-finans/kasa-hareketleri")).toEqual(["allCashTransactions"]);
    expect(ids("/zto-finans/transfer-merkezi")).toEqual(["transferCenter"]);
    // 12.2a: günlük rapor alt yolu kendi listesini etkin yapar; benzer önek etkin yapmaz.
    expect(ids("/zto-finans/odemeler")).toEqual(["payments"]);
    expect(ids("/zto-finans/odemeler/gunluk-rapor")).toEqual(["payments"]);
    expect(ids("/zto-finans/tahsilatlar/gunluk-rapor")).toEqual(["collections"]);
    expect(ids("/zto-finans/odemeler-x")).toEqual([]);
    // Banka hesapları (cari) yolu Bankalar'ı etkin yapmaz.
    expect(ids("/zto-finans/banka-hesaplari/b1/duzenle")).toEqual([]);
  });

  it("modal öğesi etkin olmaz; eşleşme yoksa boş", () => {
    expect(ids("/zto-finans/cari-hareketler")).toEqual(["allTransactions"]);
    expect(ids("/zto-finans/tanimlar/is-yerleri/yeni")).toEqual(["workPlaces"]);
    expect(ids("/zto-finans/yok")).toEqual([]);
    expect(ids("/")).toEqual([]);
  });
});

describe("yol yardımcıları", () => {
  it("cari ve banka hesabı yolları", () => {
    expect(accountTransactionsPath("a1")).toBe("/zto-finans/cari-kartlar/a1/hareketler");
    expect(accountTransactionsPath("a1", { currency: "EUR", rolloverId: "" })).toBe(
      "/zto-finans/cari-kartlar/a1/hareketler?currency=EUR",
    );
    expect(accountEditPath("a 1")).toBe("/zto-finans/cari-kartlar/a%201/duzenle");
    expect(accountBankAccountsPath("a1")).toBe("/zto-finans/cari-kartlar/a1/banka-hesaplari");
    expect(newBankAccountPath("a1")).toBe("/zto-finans/cari-kartlar/a1/banka-hesaplari/yeni");
    expect(bankAccountEditPath("b1")).toBe("/zto-finans/banka-hesaplari/b1/duzenle");
  });

  it("ekstre yazdırma yolu (kabuk dışı)", () => {
    expect(statementPath("a1")).toBe("/zto-finans-yazdir/cari-ekstre/a1");
    expect(
      statementPath("a1", {
        from: "2026-01-01",
        to: "2026-12-31",
        currency: "TRY",
        branchId: "b1",
        companyId: "c1",
        dateBasis: "DOCUMENT",
      }),
    ).toBe(
      "/zto-finans-yazdir/cari-ekstre/a1?from=2026-01-01&to=2026-12-31&currency=TRY&branchId=b1&companyId=c1&dateBasis=DOCUMENT",
    );
  });
});

describe("12.2 yol yardımcıları", () => {
  it("banka ve kasa tanım yolları", () => {
    expect(newBankPath()).toBe("/zto-finans/bankalar/yeni");
    expect(bankDetailPath("f 1")).toBe("/zto-finans/bankalar/f%201");
    expect(bankEditPath("f1")).toBe("/zto-finans/bankalar/f1/duzenle");
    expect(newCashPath()).toBe("/zto-finans/kasalar/yeni");
    expect(cashEditPath("k1")).toBe("/zto-finans/kasalar/k1/duzenle");
  });

  it("banka / kasa hareketleri", () => {
    expect(fundTransactionsPath("BANK")).toBe("/zto-finans/banka-hareketleri");
    expect(fundTransactionsPath("CASH", { fundId: "k1", branchId: "", currency: "TRY" })).toBe(
      "/zto-finans/kasa-hareketleri?fundId=k1&currency=TRY",
    );
    expect(fundTransactionsPath("BANK", { fundId: "f1", branchId: "b1" })).toBe(
      "/zto-finans/banka-hareketleri?fundId=f1&branchId=b1",
    );
  });

  it("12.2a: banka / kasa hareketlerinden Yeni Ödeme / Yeni Tahsilat (ZTO openModal, openCollection)", () => {
    expect(fundTransactionsPath("BANK", { fundId: "f1", openModal: true })).toBe(
      "/zto-finans/banka-hareketleri?fundId=f1&openModal=true",
    );
    expect(
      fundTransactionsPath("CASH", {
        collectionMethod: "Nakit",
        openCollection: true,
        currency: "TRY",
        fundId: "k1",
      }),
    ).toBe(
      "/zto-finans/kasa-hareketleri?fundId=k1&currency=TRY&openCollection=true&collectionMethod=Nakit",
    );
    expect(
      fundTransactionsPath("BANK", { fundId: "f1", openModal: false, openCollection: undefined }),
    ).toBe("/zto-finans/banka-hareketleri?fundId=f1");
  });

  it("transfer merkezi derin bağlantısı (ZTO 'Gönder' kaynak, 'Al' hedef + hedef iş yeri)", () => {
    expect(transferCenterPath()).toBe("/zto-finans/transfer-merkezi");
    expect(
      transferCenterPath({
        tab: "new",
        transferType: "eft",
        sourceFundId: "f1",
        sourceBranchId: "b1",
      }),
    ).toBe(
      "/zto-finans/transfer-merkezi?tab=new&transferType=eft&sourceFundId=f1&sourceBranchId=b1",
    );
    expect(
      transferCenterPath({
        tab: "new",
        transferType: "havale",
        targetFundId: "f2",
        targetBranchId: "b2",
        direction: "in",
      }),
    ).toBe(
      "/zto-finans/transfer-merkezi?tab=new&transferType=havale&targetFundId=f2&targetBranchId=b2&direction=in",
    );
    expect(transferCenterPath({ tab: "transfers" })).toBe(
      "/zto-finans/transfer-merkezi?tab=transfers",
    );
  });

  it("ZTO tür adları ve takma adları; bilinmeyen Virman", () => {
    expect(TRANSFER_TYPE_PARAMS).toEqual([
      "virman",
      "eft",
      "havale",
      "exchange",
      "dovizbozum",
      "bankcash",
      "bankadankasaya",
      "cashbank",
      "kasadanbankaya",
      "cashcash",
      "kasadankasaya",
    ]);
    for (const [alias, canonical] of Object.entries(TRANSFER_TYPE_ALIASES)) {
      expect(canonicalTransferType(alias)).toBe(canonical);
      expect(TRANSFER_TYPE_PARAMS).toContain(alias);
    }
    expect(canonicalTransferType("DovizBozum")).toBe("exchange");
    expect(canonicalTransferType(" EFT ")).toBe("eft");
    expect(canonicalTransferType("cashcash")).toBe("cashcash");
    expect(canonicalTransferType("bilinmeyen")).toBe("virman");
    expect(canonicalTransferType("")).toBe("virman");
    expect(canonicalTransferType(null)).toBe("virman");
    expect(canonicalTransferType(undefined)).toBe("virman");
  });

  it("yazdırma ve rapor yolları", () => {
    expect(fundExtractPath("BANK", "f1")).toBe("/zto-finans-yazdir/banka-ekstre/f1");
    expect(fundExtractPath("CASH", "k1", { from: "2026-11-01", to: "2026-11-14" })).toBe(
      "/zto-finans-yazdir/kasa-ekstre/k1?from=2026-11-01&to=2026-11-14",
    );
    expect(fundActivityPath("f1", { from: "2026-10-14", to: "2026-11-14" })).toBe(
      "/zto-finans-yazdir/faaliyet-raporu/f1?from=2026-10-14&to=2026-11-14",
    );
    expect(exchangeBreakReportPath()).toBe("/zto-finans/transfer-merkezi/doviz-bozum-raporu");
    expect(exchangeBreakReportPath({ from: "2026-11-07", to: "2026-11-15" })).toBe(
      "/zto-finans/transfer-merkezi/doviz-bozum-raporu?from=2026-11-07&to=2026-11-15",
    );
  });
});

describe("12.2a yol yardımcıları (§5.3)", () => {
  it("ödemeler: ZTO parametre adları, boolean'lar true iken yazılır, değerler kodlanır", () => {
    expect(paymentsPath()).toBe("/zto-finans/odemeler");
    expect(paymentsPath({ id: "a1", openModal: true })).toBe(
      "/zto-finans/odemeler?id=a1&openModal=true",
    );
    expect(paymentsPath({ openEditPayment: true, paymentId: "s1" })).toBe(
      "/zto-finans/odemeler?openEditPayment=true&paymentId=s1",
    );
    expect(
      paymentsPath({
        settlementId: "s9",
        paymentMethod: "Kredi Kartı",
        currencyId: "USD",
        workPlaceId: "w1",
        cashId: "k1",
        bankId: "f1",
        paymentId: "",
        openModal: false,
        id: "a1",
      }),
    ).toBe(
      "/zto-finans/odemeler?id=a1&bankId=f1&cashId=k1&workPlaceId=w1&currencyId=USD&paymentMethod=Kredi%20Kart%C4%B1&settlementId=s9",
    );
  });

  it("tahsilatlar: openEditCollection, collectionId, collectionMethod", () => {
    expect(collectionsPath()).toBe("/zto-finans/tahsilatlar");
    expect(collectionsPath({ id: "a 1", openModal: true, collectionMethod: "Çek" })).toBe(
      "/zto-finans/tahsilatlar?id=a%201&openModal=true&collectionMethod=%C3%87ek",
    );
    expect(collectionsPath({ openEditCollection: true, collectionId: "s1" })).toBe(
      "/zto-finans/tahsilatlar?openEditCollection=true&collectionId=s1",
    );
    expect(collectionsPath({ settlementId: "s2", bankId: "f1", workPlaceId: "w1" })).toBe(
      "/zto-finans/tahsilatlar?bankId=f1&workPlaceId=w1&settlementId=s2",
    );
  });

  it("günlük rapor: kabuk içi alt yol; iş yerleri virgülle", () => {
    expect(dailySettlementReportPath("PAYMENT", { reportDate: "2026-11-15" })).toBe(
      "/zto-finans/odemeler/gunluk-rapor?reportDate=2026-11-15",
    );
    expect(
      dailySettlementReportPath("COLLECTION", {
        reportDate: "2026-11-15",
        workPlaceIds: ["w1", "w2"],
      }),
    ).toBe("/zto-finans/tahsilatlar/gunluk-rapor?reportDate=2026-11-15&workPlaceIds=w1,w2");
    expect(
      dailySettlementReportPath("PAYMENT", { reportDate: "2026-11-15", workPlaceIds: [] }),
    ).toBe("/zto-finans/odemeler/gunluk-rapor?reportDate=2026-11-15");
    expect(
      dailySettlementReportPath("PAYMENT", { reportDate: "", workPlaceIds: ["a,b", "", "c"] }),
    ).toBe("/zto-finans/odemeler/gunluk-rapor?workPlaceIds=a%2Cb,c");
    expect(stepOf("tahsilatlar")).toBe("12.2a");
  });
});

describe("12.3 çek / senet yolları (§5.3)", () => {
  it("çekler: ZTO parametre adları; false/boş yazılmaz", () => {
    expect(checksPath()).toBe("/zto-finans/cekler");
    expect(
      checksPath({
        bankId: "f1",
        workPlaceId: "w1",
        currencyId: "USD",
        openCheckPaymentModal: true,
      }),
    ).toBe("/zto-finans/cekler?bankId=f1&workPlaceId=w1&currencyId=USD&openCheckPaymentModal=true");
    expect(
      checksPath({ accountId: "a 1", status: "PORTFOLIO", openCheckPaymentModal: false }),
    ).toBe("/zto-finans/cekler?accountId=a%201&status=PORTFOLIO");
  });

  it("senetler, koçanlar, düzenle, belgeler, rapor", () => {
    expect(billsPath()).toBe("/zto-finans/senetler");
    expect(billsPath({ accountId: "a1", openBillPaymentModal: true })).toBe(
      "/zto-finans/senetler?accountId=a1&openBillPaymentModal=true",
    );
    expect(checkBooksPath()).toBe("/zto-finans/cekler/kocanlar");
    expect(checkEditPath("i/1")).toBe("/zto-finans/cekler/i%2F1/duzenle");
    expect(billEditPath("n1")).toBe("/zto-finans/senetler/n1/duzenle");
    expect(checkDocumentsPath("i1")).toBe("/zto-finans/cekler/i1/belgeler");
    expect(checkDetailedReportPath({ from: "2026-11-01", to: "2026-11-30" })).toBe(
      "/zto-finans-yazdir/cek-raporu?from=2026-11-01&to=2026-11-30",
    );
    expect(checkDetailedReportPath()).toBe("/zto-finans-yazdir/cek-raporu");
  });

  it("alt yollar Çekler / Senetler öğesini etkin yapar", () => {
    const checks = items.find((i) => i.id === "checks")!;
    const bills = items.find((i) => i.id === "bills")!;
    expect(isActive(checks, checkBooksPath())).toBe(true);
    expect(isActive(checks, checkEditPath("i1"))).toBe(true);
    expect(isActive(bills, billEditPath("n1"))).toBe(true);
    expect(isActive(bills, checkEditPath("i1"))).toBe(false);
    expect(stepOf("cekler")).toBe("12.3");
  });
});

describe("12.7 masraf ve taşeron yolları (§5.3)", () => {
  it("masraf kalemleri, genel masraf, takvim, kalem faturaları; kimlik kodlanır", () => {
    expect(newExpenseItemPath()).toBe("/zto-finans/tanimlar/masraf-kalemleri/yeni");
    expect(expenseItemEditPath("k/1")).toBe("/zto-finans/tanimlar/masraf-kalemleri/k%2F1/duzenle");
    expect(generalExpensesPath()).toBe("/zto-finans/genel-masraflar");
    expect(expenseCalendarPath()).toBe("/zto-finans/genel-masraflar/takvim");
    expect(expenseItemInvoicesPath("k1")).toBe("/zto-finans/genel-masraflar/kalem/k1");
    expect(newExpensePath()).toBe("/zto-finans/genel-masraflar/yeni");
    expect(expenseEditPath("e1")).toBe("/zto-finans/genel-masraflar/e1/duzenle");
  });

  it("sevk nakliye masrafları ve firma detayı; gün isteğe bağlı", () => {
    expect(shipmentExpensesPath()).toBe("/zto-finans/sevk-nakliye-masraflari");
    expect(shipmentExpensesPath(90)).toBe("/zto-finans/sevk-nakliye-masraflari?days=90");
    expect(carrierDetailPath("a 1")).toBe("/zto-finans/sevk-nakliye-masraflari/firma/a%201");
    expect(carrierDetailPath("a1", 150)).toBe(
      "/zto-finans/sevk-nakliye-masraflari/firma/a1?days=150",
    );
  });

  it("alt yollar Masraf Kalemleri öğesini etkin yapar", () => {
    const expenseItems = items.find((i) => i.id === "expenseItems")!;
    expect(isActive(expenseItems, newExpenseItemPath())).toBe(true);
    expect(isActive(expenseItems, expenseItemEditPath("k1"))).toBe(true);
    expect(stepOf("tanimlar/masraf-kalemleri")).toBe("12.7");
    expect(stepOf("genel-masraflar")).toBe("12.7");
  });
});

describe("12.8 rapor menüsü ve yolları (§5.3)", () => {
  it("Cari İşlemleri: Finans Raporları ardından Cari Hesap Raporları (Blackrose eki)", () => {
    const accounts = ZTO_NAV_SECTIONS.find((s) => s.id === "accounts")!.items.map((i) => i.id);
    expect(accounts.slice(0, 3)).toEqual([
      "financeReports",
      "customerAccountReport",
      "allTransactions",
    ]);
    const report = items.find((i) => i.id === "customerAccountReport")!;
    expect(report).toMatchObject({
      label: "customerAccountReport",
      icon: "fas fa-chart-bar",
      slug: "cari-raporlari",
      kind: "page",
      source: {
        controller: "CustomerAccountReport",
        action: "Reports",
        line: 1,
        file: "blackrose",
      },
      step: "12.8",
      implemented: true,
      permission: "FINANCE_VIEW",
    });
    expect(isFinanceMenuItem(report)).toBe(false);
    const finance = items.find((i) => i.id === "financeReports")!;
    expect([finance.implemented, finance.permission, isNavigable(finance)]).toEqual([
      true,
      "FINANCE_VIEW",
      true,
    ]);
  });

  it("Finansal İşlemler: Hızlı Bakiye (modal), Bilanço, Kur Farkı Raporu, Nakit Akış", () => {
    const financial = ZTO_NAV_SECTIONS.find((s) => s.id === "financial")!.items;
    expect(
      financial.map((i) => [i.id, i.slug, i.kind, i.step, i.source.file ?? null, i.source.line]),
    ).toEqual([
      ["quickBalance", "cari-kartlar", "modal", "12.8", null, 151],
      ["balanceSheet", "bilanco", "page", "12.8", null, 157],
      ["fxReport", "kur-farki-raporu", "page", "12.8", "_SideMenu_Recipe_Finance", 86],
      ["cashFlow", "nakit-akis", "page", "12.8", "_SideMenu_Recipe_Finance", 100],
    ]);
    const [quick, balance, fx, cash] = financial;
    expect(isModalAction(quick)).toBe(true);
    expect(isNavigable(quick)).toBe(false);
    expect(fx.icon).toBe("fas fa-exchange-alt");
    expect(cash.icon).toBe("fas fa-water");
    for (const item of [balance, fx, cash]) {
      expect(item.permission, item.id).toBe("FINANCE_VIEW");
      expect(isNavigable(item), item.id).toBe(true);
    }
  });

  it("etkin öğe ve adım", () => {
    const ids = (path: string) => [...activeItemIds(items, path)].sort();
    expect(ids("/zto-finans/finans-raporlari")).toEqual(["financeReports"]);
    expect(ids("/zto-finans/cari-raporlari")).toEqual(["customerAccountReport"]);
    expect(ids("/zto-finans/bilanco")).toEqual(["balanceSheet"]);
    expect(ids("/zto-finans/kur-farki-raporu")).toEqual(["fxReport"]);
    expect(ids("/zto-finans/nakit-akis")).toEqual(["cashFlow"]);
    expect(ids("/zto-finans/tanimlar/para-birimleri")).toEqual(["currencies"]);
    expect(stepOf("nakit-akis")).toBe("12.8");
    expect(stepOf("tanimlar/para-birimleri")).toBe("12.8");
  });

  it("financeReportPath tüm süzgeçleri (branchGroupId dahil) sırayla yazar; boşlar yazılmaz", () => {
    expect(financeReportPath()).toBe("/zto-finans/finans-raporlari");
    expect(
      financeReportPath({
        type: "SALES",
        range: "30",
        from: "2026-10-17",
        to: "2026-11-16",
        cur: "USD",
        account: "a 1",
        branchGroupId: "g1",
        branchId: "w1",
        companyId: "c1",
      }),
    ).toBe(
      "/zto-finans/finans-raporlari?type=SALES&range=30&from=2026-10-17&to=2026-11-16&cur=USD" +
        "&account=a%201&branchGroupId=g1&branchId=w1&companyId=c1",
    );
    expect(financeReportPath({ branchGroupId: "g1", cur: "", account: undefined })).toBe(
      "/zto-finans/finans-raporlari?branchGroupId=g1",
    );
  });

  it("diğer rapor yolları", () => {
    expect(customerAccountReportPath()).toBe("/zto-finans/cari-raporlari");
    expect(customerAccountReportPath("position")).toBe("/zto-finans/cari-raporlari?tab=position");
    expect(balanceSheetPath()).toBe("/zto-finans/bilanco");
    expect(fxReportPath()).toBe("/zto-finans/kur-farki-raporu");
    expect(cashFlowPath()).toBe("/zto-finans/nakit-akis");
    expect(currenciesPath()).toBe("/zto-finans/tanimlar/para-birimleri");
  });
});
