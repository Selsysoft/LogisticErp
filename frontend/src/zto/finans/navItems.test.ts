import { describe, expect, it } from "vitest";
import nav from "../../locales/tr/ztoFinans/nav";
import {
  accountBankAccountsPath,
  accountEditPath,
  accountTransactionsPath,
  activeItemIds,
  bankAccountEditPath,
  EXCLUDED_ZTO_ITEMS,
  isActive,
  isFinanceMenuItem,
  isModalAction,
  isNavigable,
  itemPath,
  newBankAccountPath,
  statementPath,
  stepOf,
  visibleSections,
  ZTO_FINANS_BASE,
  ZTO_NAV_SECTIONS,
  ZTO_SLUGS,
  type ZtoNavItem,
} from "./navItems";

const items = ZTO_NAV_SECTIONS.flatMap((s) => s.items);
// ZTO finans yan menüsünün (_SideMenu_FinanceItems) öğeleri; TEMEL TANIMLAR (_Layout + Blackrose eki)
// ve vitrin bu sıra/sayım testlerine girmez.
const ztoItems = items.filter((i) => !i.devOnly && isFinanceMenuItem(i));
const definitionItems = items.filter((i) => !i.devOnly && !isFinanceMenuItem(i));
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

  it("uygulanmış ekranlar: 12.1 cari ekranları, 12.1a tanım ekranları ve vitrin", () => {
    expect(items.filter((i) => i.implemented).map((i) => i.id)).toEqual([
      "allTransactions",
      "quickTransaction",
      "accounts",
      "newAccount",
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
    });
    const accounts = items.find((i) => i.id === "accounts")!;
    expect(accounts.matchPrefix).toBe(true);
    const add = items.find((i) => i.id === "newAccount")!;
    expect(add.permission).toBe("FINANCE_MANAGE");
    expect(add.action).toBe("add");
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
      ["workPlaces", "tanimlar/is-yerleri", "_Layout", 1284],
      ["branchGroups", "tanimlar/subeler", "_Layout", 1288],
      ["companies", "tanimlar/sirketler", "blackrose", 0],
    ]);
    for (const item of definitionItems) {
      expect(item.permission).toBe("BRANCH_VIEW");
      expect(item.matchPrefix).toBe(true);
      expect(item.step).toBe("12.1a");
      expect(isNavigable(item)).toBe(true);
    }
    expect(isFinanceMenuItem(items.find((i) => i.id === "payments")!)).toBe(true);
  });

  it("izin süzgeci: izinsiz öğe gizli, boş kalan bölüm atılır", () => {
    const withoutBranch = visibleSections(false, ZTO_NAV_SECTIONS, (p) => p !== "BRANCH_VIEW");
    expect(withoutBranch.some((s) => s.id === "basic-definitions")).toBe(false);
    const all = visibleSections(false, ZTO_NAV_SECTIONS, () => true);
    expect(all.find((s) => s.id === "basic-definitions")?.items).toHaveLength(3);
    // Varsayılan can: hepsi görünür.
    expect(visibleSections(false)).toEqual(all);
    const asked: string[] = [];
    visibleSections(true, ZTO_NAV_SECTIONS, (p) => {
      asked.push(p);
      return true;
    });
    expect(new Set(asked)).toEqual(new Set(["BRANCH_VIEW", "FINANCE_MANAGE"]));
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
