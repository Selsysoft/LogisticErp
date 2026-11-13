import { describe, expect, it } from "vitest";
import nav from "../../locales/tr/ztoFinans/nav";
import {
  EXCLUDED_ZTO_ITEMS,
  isActive,
  isNavigable,
  itemPath,
  stepOf,
  visibleSections,
  ZTO_FINANS_BASE,
  ZTO_NAV_SECTIONS,
  ZTO_SLUGS,
  type ZtoNavItem,
} from "./navItems";

const items = ZTO_NAV_SECTIONS.flatMap((s) => s.items);
const ztoItems = items.filter((i) => !i.devOnly);
const STEPS = [
  "12.1",
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

  it("12.0'da yalnız Cari Hareketler iskeleti ve vitrin uygulanmış", () => {
    expect(items.filter((i) => i.implemented).map((i) => i.id)).toEqual([
      "allTransactions",
      "showcase",
    ]);
    expect(ZTO_SLUGS).toEqual({ allTransactions: "cari-hareketler", showcase: "vitrin" });
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
    expect(isNavigable({ ...quick, implemented: true })).toBe(false);
  });

  it("ZTO'daki gibi Cari Kartlar ve Tüm Planlamalar aynı sayfada birlikte etkin", () => {
    const active = items.filter((i) => isActive(i, "/zto-finans/cari-kartlar")).map((i) => i.id);
    expect(active).toEqual(["accounts", "allPlans"]);
    expect(stepOf("cari-kartlar")).toBe("12.1");
    expect(stepOf("odemeler")).toBe("12.2a");
    expect(stepOf("yok")).toBeUndefined();
  });
});
