import type navTexts from "../../locales/tr/ztoFinans/nav";
import type { ReportType } from "../../pages/finance/types";

/*
 * ZTO Finans menü kaydı. Sıra ve gruplar ZTO yan menüsüyle birebir:
 * Views/Shared/_CustomerSideMenus/_SideMenu_FinanceItems.cshtml (satır numaraları `source.line`).
 * 04 §3 / §3.3 ve MX4 §A.6, MX8 kararlarıyla ÇIKAR olanlar listelenmez (EXCLUDED_ZTO_ITEMS).
 * Her öğenin Faz 12 adımı FAZ_12 tablosundan; ekran yazıldığında `implemented: true` yapılır ve
 * App.tsx'e rotası eklenir.
 */

/** ztoFinans:nav.* anahtarı (yaprak adı). */
export type ZtoNavLabel = keyof typeof navTexts;

export const ZTO_FINANS_BASE = "/zto-finans";

export type ZtoNavSource = {
  controller: string;
  action: string;
  /** `file` dosyasındaki satır (varsayılan _SideMenu_FinanceItems.cshtml). */
  line: number;
  /**
   * Kaynak menü dosyası: yoksa _SideMenu_FinanceItems; "_Layout" ZTO ana menüsü (Temel Tanımlar);
   * "_SideMenu_Recipe_Finance" reçeteli finans yan menüsü (12.8: Kur Farkı Raporu, Nakit Akış);
   * "blackrose" ZTO'da olmayan Blackrose eki.
   */
  file?: "_SideMenu_FinanceItems" | "_Layout" | "_SideMenu_Recipe_Finance" | "blackrose";
};

export type ZtoNavItem = {
  id: string;
  label: ZtoNavLabel;
  /** Font Awesome 5 sınıfı (ZTO'daki .zt-icon simgesi). */
  icon: string;
  /** /zto-finans altındaki yol; "modal" öğelerinde açılacak modalın sahibi sayfanın yolu. */
  slug: string;
  /** page = sayfa bağlantısı; modal = ZTO'da sayfa değil, modal açan menü öğesi. */
  kind: "page" | "modal";
  source: ZtoNavSource;
  /** Faz 12 adımı (ör. "12.1", "12.2a"). */
  step: string;
  implemented: boolean;
  /** ZTO "zt-action-add" görünümü (Yeni Cari Kart). */
  action?: "add";
  /** Yalnız geliştirme ortamında görünür (bileşen vitrini). */
  devOnly?: boolean;
  /** Öğe yalnız bu izne sahip kullanıcıya görünür. */
  permission?: string;
  /** true: alt yollar da (…/yeni, …/:id) öğeyi etkin yapar. */
  matchPrefix?: boolean;
};

export type ZtoNavSection = {
  id: string;
  label: ZtoNavLabel;
  icon: string;
  items: ZtoNavItem[];
};

const FILE_LINE = (controller: string, action: string, line: number): ZtoNavSource => ({
  controller,
  action,
  line,
});

export const ZTO_NAV_SECTIONS: readonly ZtoNavSection[] = [
  {
    id: "accounts",
    label: "sectionAccounts",
    icon: "fas fa-user-tie",
    items: [
      {
        id: "financeReports",
        label: "financeReports",
        icon: "fas fa-file-invoice-dollar",
        slug: "finans-raporlari",
        kind: "page",
        source: FILE_LINE("FinanceReport", "Index", 12),
        step: "12.8",
        implemented: true,
        permission: "FINANCE_VIEW",
      },
      {
        // 12.8 (§5.3): ZTO'da menü bağlantısı yok (CustomerAccountReport/Reports; başlık ikonu CAR:13).
        id: "customerAccountReport",
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
      },
      {
        id: "allTransactions",
        label: "allTransactions",
        icon: "fas fa-calendar-day",
        slug: "cari-hareketler",
        kind: "page",
        source: FILE_LINE("AccountTransaction", "AllTransactions", 18),
        step: "12.1",
        // 12.0'da iskelet sayfa; menünün varsayılanı (04 §3.3).
        implemented: true,
      },
      {
        id: "quickTransaction",
        label: "quickTransaction",
        icon: "fas fa-bolt",
        slug: "cari-hareketler",
        kind: "modal",
        source: FILE_LINE("AccountTransaction", "openQuickCariModal()", 24),
        step: "12.1",
        // Hızlı Cari İşlemi modalı (ZtoFinansLayout, quickCariContext).
        implemented: true,
      },
      {
        id: "accounts",
        label: "accounts",
        icon: "fas fa-user-tie",
        slug: "cari-kartlar",
        kind: "page",
        source: FILE_LINE("CustomerAccounts", "Index", 30),
        step: "12.1",
        implemented: true,
        // Alt yollar (düzenle, hareketler, banka hesapları) Cari Kartlar'ı etkin yapar.
        matchPrefix: true,
      },
      {
        id: "newAccount",
        label: "newAccount",
        icon: "fas fa-plus",
        slug: "cari-kartlar/yeni",
        kind: "page",
        source: FILE_LINE("CustomerAccounts", "Add", 36),
        step: "12.1",
        implemented: true,
        action: "add",
        permission: "FINANCE_MANAGE",
      },
      {
        id: "personnel",
        label: "personnel",
        icon: "fas fa-user-tie",
        slug: "personel",
        kind: "page",
        source: FILE_LINE("Personnel", "Index", 48),
        step: "12.9",
        implemented: false,
      },
    ],
  },
  {
    id: "bankCash",
    label: "sectionBankCash",
    icon: "fas fa-university",
    items: [
      {
        id: "banks",
        label: "banks",
        icon: "fas fa-university",
        slug: "bankalar",
        kind: "page",
        source: FILE_LINE("BankIntroduction", "Index", 63),
        step: "12.2",
        implemented: true,
        // Alt yollar (yeni, :id, :id/duzenle) öğeyi etkin yapar.
        matchPrefix: true,
      },
      {
        id: "allBankTransactions",
        label: "allBankTransactions",
        icon: "fas fa-university",
        slug: "banka-hareketleri",
        kind: "page",
        source: FILE_LINE("BankTransactions", "Index", 69),
        step: "12.2",
        implemented: true,
      },
      {
        id: "cashes",
        label: "cashes",
        icon: "fas fa-cash-register",
        slug: "kasalar",
        kind: "page",
        source: FILE_LINE("CashIntroduction", "Index", 75),
        step: "12.2",
        implemented: true,
        // Alt yollar (yeni, :id, :id/duzenle) öğeyi etkin yapar.
        matchPrefix: true,
      },
      {
        id: "allCashTransactions",
        label: "allCashTransactions",
        icon: "fas fa-cash-register",
        slug: "kasa-hareketleri",
        kind: "page",
        source: FILE_LINE("CashTransactions", "Index", 81),
        step: "12.2",
        implemented: true,
      },
      {
        id: "transferCenter",
        label: "transferCenter",
        icon: "fas fa-exchange-alt",
        slug: "transfer-merkezi",
        kind: "page",
        source: FILE_LINE("BankStatement", "Index", 87),
        step: "12.2",
        implemented: true,
      },
    ],
  },
  {
    id: "paymentCollection",
    label: "sectionPaymentCollection",
    icon: "fas fa-exchange-alt",
    items: [
      {
        id: "payments",
        label: "payments",
        icon: "fas fa-cash-register",
        slug: "odemeler",
        kind: "page",
        source: FILE_LINE("CustomerAccountPayment", "Payments", 100),
        step: "12.2a",
        implemented: true,
        // Alt yol (gunluk-rapor) öğeyi etkin yapar.
        matchPrefix: true,
      },
      {
        id: "collections",
        label: "collections",
        icon: "fas fa-hand-holding-usd",
        slug: "tahsilatlar",
        kind: "page",
        source: FILE_LINE("CustomerAccountCollection", "Collections", 106),
        step: "12.2a",
        implemented: true,
        matchPrefix: true,
      },
      {
        id: "checks",
        label: "checks",
        icon: "fas fa-money-check",
        slug: "cekler",
        kind: "page",
        source: FILE_LINE("Checks", "Checks", 112),
        step: "12.3",
        implemented: true,
        // Alt yollar (kocanlar, {id}/duzenle, {id}/belgeler) öğeyi etkin yapar.
        matchPrefix: true,
      },
      {
        id: "bills",
        label: "bills",
        icon: "fas fa-file-invoice-dollar",
        slug: "senetler",
        kind: "page",
        source: FILE_LINE("Bills", "Bills", 118),
        step: "12.3",
        implemented: true,
        matchPrefix: true,
      },
    ],
  },
  {
    id: "paymentPlanning",
    label: "sectionPaymentPlanning",
    icon: "fas fa-layer-group",
    items: [
      {
        // ZTO'da "Cari Kartlar" ile aynı sayfa (/CustomerAccounts/Index, plan paneli); plan modalları 12.4.
        id: "allPlans",
        label: "allPlans",
        icon: "fas fa-calendar-alt",
        slug: "cari-kartlar",
        kind: "page",
        source: FILE_LINE("CustomerAccounts", "Index", 132),
        step: "12.4",
        implemented: false,
      },
      {
        id: "paymentApproval",
        label: "paymentApproval",
        icon: "fas fa-check-circle",
        slug: "odeme-onay",
        kind: "page",
        source: FILE_LINE("PaymentApproval", "Index", 138),
        step: "12.4",
        implemented: false,
      },
    ],
  },
  {
    id: "financial",
    label: "sectionFinancial",
    icon: "fas fa-money-bill-wave",
    items: [
      {
        // ZTO: #treasuryModal (12.8 §5.10; GET /finance/reports/treasury). Hızlı Bakiye Özeti modalı
        // (ZtoFinansLayout, treasuryContext; `?treasury=1` ile de açılır).
        id: "quickBalance",
        label: "quickBalance",
        icon: "fas fa-coins",
        slug: "cari-kartlar",
        kind: "modal",
        source: FILE_LINE("CustomerAccounts", "#treasuryModal", 151),
        step: "12.8",
        implemented: true,
      },
      {
        id: "balanceSheet",
        label: "balanceSheet",
        icon: "fas fa-money-bill-alt",
        slug: "bilanco",
        kind: "page",
        source: FILE_LINE("FinancialBalanceSheet", "Index", 157),
        step: "12.8",
        implemented: true,
        permission: "FINANCE_VIEW",
      },
      {
        // 12.8: ZTO reçeteli finans menüsü (_SideMenu_Recipe_Finance.cshtml:86).
        id: "fxReport",
        label: "fxReport",
        icon: "fas fa-exchange-alt",
        slug: "kur-farki-raporu",
        kind: "page",
        source: {
          controller: "RecipeFinance",
          action: "FxReport",
          line: 86,
          file: "_SideMenu_Recipe_Finance",
        },
        step: "12.8",
        implemented: true,
        permission: "FINANCE_VIEW",
      },
      {
        // 12.8: _SideMenu_Recipe_Finance.cshtml:100.
        id: "cashFlow",
        label: "cashFlow",
        icon: "fas fa-water",
        slug: "nakit-akis",
        kind: "page",
        source: {
          controller: "RecipeFinance",
          action: "CashFlow",
          line: 100,
          file: "_SideMenu_Recipe_Finance",
        },
        step: "12.8",
        implemented: true,
        permission: "FINANCE_VIEW",
      },
    ],
  },
  {
    // "Yatırımlar" (/Investments/Index, satır 182) ÇIKAR — MX4 §A.6.
    id: "creditDeposit",
    label: "sectionCreditDeposit",
    icon: "fas fa-chart-pie",
    items: [
      {
        id: "credits",
        label: "credits",
        icon: "fas fa-hand-holding-usd",
        slug: "krediler",
        kind: "page",
        source: FILE_LINE("CreditContracts", "Index", 170),
        step: "12.5",
        implemented: false,
      },
      {
        id: "timeDeposits",
        label: "timeDeposits",
        icon: "fas fa-piggy-bank",
        slug: "vadeli-mevduatlar",
        kind: "page",
        source: FILE_LINE("TimeDeposits", "Index", 176),
        step: "12.6",
        implemented: false,
      },
    ],
  },
  {
    // "Bahçe Nakliye Hesapları" (satır 234) ÇIKAR.
    id: "transportExpense",
    label: "sectionTransportExpense",
    icon: "fas fa-truck",
    items: [
      {
        id: "shipmentTransportExpenses",
        label: "shipmentTransportExpenses",
        icon: "fas fa-truck-moving",
        slug: "sevk-nakliye-masraflari",
        kind: "page",
        source: FILE_LINE("SalesTruckExpenses", "Index", 240),
        step: "12.7",
        implemented: true,
        permission: "SHIPMENT_VIEW",
        matchPrefix: true,
      },
    ],
  },
  {
    // Kesim ve ardiye çavuşu hesapları (satır 253, 259) ÇIKAR.
    id: "laborExpense",
    label: "sectionLaborExpense",
    icon: "fas fa-hard-hat",
    items: [
      {
        id: "generalExpenses",
        label: "generalExpenses",
        icon: "fas fa-receipt",
        slug: "genel-masraflar",
        kind: "page",
        source: FILE_LINE("ProductionExpenses", "IndexExpenses", 265),
        step: "12.7",
        implemented: true,
        matchPrefix: true,
      },
    ],
  },
  {
    id: "customerReceivable",
    label: "sectionCustomerReceivable",
    icon: "fas fa-file-invoice",
    items: [
      {
        id: "customerReceivables",
        label: "customerReceivables",
        icon: "fas fa-wallet",
        slug: "musteri-alacaklari",
        kind: "page",
        source: FILE_LINE("AccountCredits", "Index", 278),
        step: "12.5",
        implemented: false,
      },
    ],
  },
  {
    // "EK İŞLEMLERİ" grubunun iki öğesi de ÇIKAR (Report, OrderDefinitions — MX8); grup listelenmez.
    id: "eDocument",
    label: "sectionEDocument",
    icon: "fas fa-file-invoice",
    items: [
      {
        id: "uyumsoftDashboard",
        label: "uyumsoftDashboard",
        icon: "fas fa-network-wired",
        slug: "uyumsoft",
        kind: "page",
        source: FILE_LINE("Uyumsoft", "Dashboard", 313),
        step: "12.10",
        implemented: false,
      },
      {
        id: "incomingInvoices",
        label: "incomingInvoices",
        icon: "fas fa-inbox",
        slug: "uyumsoft/gelen-faturalar",
        kind: "page",
        source: FILE_LINE("Uyumsoft", "Inbox", 319),
        step: "12.10",
        implemented: false,
      },
      {
        id: "uyumsoftSettings",
        label: "uyumsoftSettings",
        icon: "fas fa-cog",
        slug: "uyumsoft/ayarlar",
        kind: "page",
        source: FILE_LINE("Uyumsoft", "Settings", 327),
        step: "12.10",
        implemented: false,
      },
    ],
  },
  {
    // Blackrose eki (12.1a §6.6): ZTO'da bu ekranlar _Layout.cshtml:1263, 1284-1291 "Temel Tanımlar"
    // altındadır (finans yan menüsünde yok); Şirketler ZTO'da hiç yok (kiracı = tek tüzel kişi).
    id: "basic-definitions",
    label: "sectionBasicDefinitions",
    icon: "fas fa-sitemap",
    items: [
      {
        // 12.7 (§5.3): ZTO _Layout.cshtml:1201 "Masraf Kalemleri" (Temel Tanımlar; 1201 < 1284).
        id: "expenseItems",
        label: "expenseItems",
        icon: "fas fa-receipt",
        slug: "tanimlar/masraf-kalemleri",
        kind: "page",
        source: { controller: "ExpenseItems", action: "Index", line: 1201, file: "_Layout" },
        step: "12.7",
        implemented: true,
        permission: "FINANCE_VIEW",
        matchPrefix: true,
      },
      {
        // 12.8 (§5.9): ZTO _Layout.cshtml:1268 "Para Birimleri" (salt okunur kur ekranı, OK-12.8-13).
        id: "currencies",
        label: "currencies",
        icon: "fas fa-dollar-sign",
        slug: "tanimlar/para-birimleri",
        kind: "page",
        source: { controller: "Currency", action: "Index", line: 1268, file: "_Layout" },
        step: "12.8",
        implemented: true,
        permission: "FINANCE_VIEW",
      },
      {
        id: "workPlaces",
        label: "workPlaces",
        icon: "fas fa-building",
        slug: "tanimlar/is-yerleri",
        kind: "page",
        source: { controller: "WorkPlace", action: "Index", line: 1284, file: "_Layout" },
        step: "12.1a",
        implemented: true,
        permission: "BRANCH_VIEW",
        matchPrefix: true,
      },
      {
        id: "branchGroups",
        label: "branchGroups",
        icon: "fas fa-code-branch",
        slug: "tanimlar/subeler",
        kind: "page",
        source: { controller: "BranchProvince", action: "Index", line: 1288, file: "_Layout" },
        step: "12.1a",
        implemented: true,
        permission: "BRANCH_VIEW",
        matchPrefix: true,
      },
      {
        id: "companies",
        label: "companies",
        icon: "fas fa-landmark",
        slug: "tanimlar/sirketler",
        kind: "page",
        source: { controller: "—", action: "—", line: 0, file: "blackrose" },
        step: "12.1a",
        implemented: true,
        permission: "BRANCH_VIEW",
        matchPrefix: true,
      },
    ],
  },
  {
    // Yalnız Blackrose: geliştirme vitrini (ZTO'da yok).
    id: "dev",
    label: "sectionDev",
    icon: "fas fa-flask",
    items: [
      {
        id: "showcase",
        label: "showcase",
        icon: "fas fa-th-large",
        slug: "vitrin",
        kind: "page",
        source: FILE_LINE("—", "—", 0),
        step: "12.0",
        implemented: true,
        devOnly: true,
      },
    ],
  },
];

/** ZTO menüsünde olup kapsam dışı bırakılanlar (kaynak satırı → gerekçe). */
export const EXCLUDED_ZTO_ITEMS: ReadonlyArray<{ line: number; href: string; reason: string }> = [
  { line: 182, href: "/Investments/Index", reason: "MX4 §A.6, 04 §3" },
  { line: 196, href: "/materialstockall/index", reason: "MX8 §2 (üretim stoğu)" },
  { line: 202, href: "/pesticidestockall/index", reason: "MX8 §2 (drencher stoğu)" },
  {
    line: 215,
    href: "/accountingpurchases/alltruck",
    reason: "04 §3 PurchaseCurrentAccount (bahçe)",
  },
  { line: 221, href: "/expertreport/allreports", reason: "04 §3 (bahçe hesapları)" },
  {
    line: 234,
    href: "/expertreporttruckexpenses/expensesummarybytransportcompany",
    reason: "04 §3 (bahçe nakliyesi)",
  },
  { line: 253, href: "/harvestmanagerexpenses/index", reason: "04 §3.1 (kesim çavuşu)" },
  { line: 259, href: "/ProductionSergeantsExpenses/index", reason: "04 §3 (üretim çavuşu)" },
  { line: 291, href: "/Report/index", reason: "MX8 (fabrika raporları)" },
  { line: 297, href: "/orderdefinitions/index", reason: "MX8 (tanım merkezi)" },
];

/**
 * Ortama ve izne göre görünen bölümler: devOnly öğeler yalnız geliştirmede; `permission`'ı olan öğe
 * `can(permission)` ister; boş bölüm atılır.
 */
export function visibleSections(
  dev: boolean,
  sections: readonly ZtoNavSection[] = ZTO_NAV_SECTIONS,
  can: (permission: string) => boolean = () => true,
): ZtoNavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (i) => (dev || !i.devOnly) && (!i.permission || can(i.permission)),
      ),
    }))
    .filter((section) => section.items.length > 0);
}

/** Öğe ZTO finans yan menüsünden mi (_SideMenu_FinanceItems; Blackrose ve _Layout ekleri değil). */
export function isFinanceMenuItem(item: ZtoNavItem): boolean {
  return (item.source.file ?? "_SideMenu_FinanceItems") === "_SideMenu_FinanceItems";
}

/** Öğenin tam yolu (/zto-finans/…). */
export function itemPath(item: Pick<ZtoNavItem, "slug">): string {
  return `${ZTO_FINANS_BASE}/${item.slug}`;
}

/** Bağlantı olarak çalışan öğe: ekranı yazılmış bir sayfa. Modal öğesi bağlantı değildir (düğme). */
export function isNavigable(item: ZtoNavItem): boolean {
  return item.implemented && item.kind === "page";
}

/** Menüden modal açan öğe (ZTO `onclick="openQuickCariModal()"`). */
export function isModalAction(item: ZtoNavItem): boolean {
  return item.implemented && item.kind === "modal";
}

/**
 * Öğenin yolla eşleşme uzunluğu: tam eşleşmede yolun, `matchPrefix` önek eşleşmesinde önekin
 * uzunluğu; eşleşmezse 0. Sondaki "/" yok sayılır; modal öğeleri eşleşmez.
 */
function matchLength(item: ZtoNavItem, pathname: string): number {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (item.kind !== "page") return 0;
  const own = itemPath(item);
  if (path === own) return own.length;
  return item.matchPrefix === true && path.startsWith(`${own}/`) ? own.length : 0;
}

/**
 * Öğe yolla eşleşiyor mu (geriye uyum; menü `activeItemIds` kullanır). `matchPrefix` öğelerde alt
 * yollar (…/yeni, …/:id) da eşleşir.
 */
export function isActive(item: ZtoNavItem, pathname: string): boolean {
  return matchLength(item, pathname) > 0;
}

/**
 * Etkin öğeler (ZTO "zt-active"): en uzun eşleşmeye sahip sayfa öğeleri. ZTO'da Cari Kartlar ile Tüm
 * Planlamalar aynı adrese gittiği için ikisi birlikte etkin olur; `/cari-kartlar/yeni`'de yalnız Yeni
 * Cari Kart (Cari Kartlar'ın öneki daha kısa), `/cari-kartlar/:id/hareketler`'de yalnız Cari Kartlar.
 */
export function activeItemIds(items: readonly ZtoNavItem[], pathname: string): Set<string> {
  let best = 0;
  const lengths = items.map((item) => {
    const length = matchLength(item, pathname);
    best = Math.max(best, length);
    return length;
  });
  return new Set(best === 0 ? [] : items.filter((_, i) => lengths[i] === best).map((i) => i.id));
}

/** Bir slug'ın Faz adımı; bilinmeyen slug için undefined. */
export function stepOf(slug: string, sections: readonly ZtoNavSection[] = ZTO_NAV_SECTIONS) {
  return sections.flatMap((s) => s.items).find((i) => i.slug === slug && i.kind === "page")?.step;
}

/** Rotalarda kullanılan sabit yollar. */
export const ZTO_SLUGS = {
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
} as const;

/** Uygulama kabuğu dışındaki yazdırma sayfaları (ZTO `Layout = null`, yeni sekme). */
export const ZTO_PRINT_BASE = "/zto-finans-yazdir";

const segment = encodeURIComponent;

/** Cari Hareketler (ZTO AccountTransaction/Transactions/{id}); `?currency&rolloverId`. */
export function accountTransactionsPath(
  id: string,
  query: { currency?: string; rolloverId?: string } = {},
): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.accounts}/${segment(id)}/hareketler${queryOf(query)}`;
}

/** Cari kart düzenle (ZTO CustomerAccounts/Edit/{id}). */
export function accountEditPath(id: string): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.accounts}/${segment(id)}/duzenle`;
}

/** Carinin banka hesapları (ZTO BankAccounts/Index?referenceID={id}). */
export function accountBankAccountsPath(id: string): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.accounts}/${segment(id)}/banka-hesaplari`;
}

/** Yeni banka hesabı (ZTO BankAccounts/Add?referenceID={id}). */
export function newBankAccountPath(accountId: string): string {
  return `${accountBankAccountsPath(accountId)}/yeni`;
}

/** Banka hesabı düzenle (ZTO BankAccounts/Edit/{id}). */
export function bankAccountEditPath(bankAccountId: string): string {
  return `${ZTO_FINANS_BASE}/banka-hesaplari/${segment(bankAccountId)}/duzenle`;
}

export type StatementQuery = {
  from?: string;
  to?: string;
  currency?: string;
  branchId?: string;
  companyId?: string;
  dateBasis?: "TRANSACTION" | "DOCUMENT";
};

/** Ekstre yazdırma sayfası (ZTO AccountTransaction/Statement/{id}; `window.open(…, "_blank")`). */
export function statementPath(id: string, query: StatementQuery = {}): string {
  return `${ZTO_PRINT_BASE}/cari-ekstre/${segment(id)}${queryOf(query)}`;
}

// ---------------------------------------------------------------------------------------------
// 12.2 banka / kasa / transfer merkezi yolları (12.2_TASARIM §5.3)
// ---------------------------------------------------------------------------------------------

export type ZtoFundKind = "BANK" | "CASH";

/** Yeni banka hesabı (ZTO BankIntroduction/Add). */
export function newBankPath(): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.banks}/yeni`;
}

/** Banka hesabı detayı (ZTO BankIntroduction/Details/{id}). */
export function bankDetailPath(id: string): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.banks}/${segment(id)}`;
}

/** Banka hesabı düzenle (ZTO BankIntroduction/Edit/{id}). */
export function bankEditPath(id: string): string {
  return `${bankDetailPath(id)}/duzenle`;
}

/** Yeni kasa (ZTO CashIntroduction/Add). */
export function newCashPath(): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.cashes}/yeni`;
}

/** Kasa düzenle (ZTO CashIntroduction/Edit/{id}); kasa detayı sayfa değil, CI-1 modalıdır. */
export function cashEditPath(id: string): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.cashes}/${segment(id)}/duzenle`;
}

export type FundTransactionsQuery = {
  fundId?: string;
  branchId?: string;
  currency?: string;
  /** 12.2a: sayfa içinde Yeni Ödeme modalı (ZTO `_AccountCardsListPartial:143`, `openModal=true`). */
  openModal?: boolean;
  /** 12.2a: sayfa içinde Yeni Tahsilat modalı (ZTO `_CashCardsListPartial:134`). */
  openCollection?: boolean;
  /** 12.2a: tahsilat yöntemi ön seçimi (ZTO metni). */
  collectionMethod?: "Banka" | "Nakit";
};

/** Banka / Kasa Hareketleri (ZTO BankTransactions/Index, CashTransactions/Index). */
export function fundTransactionsPath(kind: ZtoFundKind, query: FundTransactionsQuery = {}): string {
  const slug = kind === "BANK" ? ZTO_SLUGS.bankTransactions : ZTO_SLUGS.cashTransactions;
  return `${ZTO_FINANS_BASE}/${slug}${queryOf({
    fundId: query.fundId,
    branchId: query.branchId,
    currency: query.currency,
    openModal: query.openModal,
    openCollection: query.openCollection,
    collectionMethod: query.collectionMethod,
  })}`;
}

/** Transfer Merkezi sekmeleri: Yeni Transfer, Transferler, Tüm Banka / Kasa Ekstreleri. */
export type TransferCenterTab = "new" | "transfers" | "bank" | "cash";

/**
 * ZTO transfer türü URL değerleri (bsjs:120-236 `handleTabAndTransferFromQuery`): asıl adlar ve
 * takma adlar; bilinmeyen değer Virman sayılır (`resolveVirmanSubType`).
 */
export const TRANSFER_TYPE_PARAMS = [
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
] as const;
export type TransferTypeParam = (typeof TRANSFER_TYPE_PARAMS)[number];

/** Takma ad → asıl ad (`dovizbozum` → `exchange`, …). */
export const TRANSFER_TYPE_ALIASES: Readonly<Record<string, TransferTypeParam>> = {
  dovizbozum: "exchange",
  bankadankasaya: "bankcash",
  kasadanbankaya: "cashbank",
  kasadankasaya: "cashcash",
};

/** URL'deki tür değerinin asıl adı (küçük harf; takma ad çözülür); bilinmeyen → "virman". */
export function canonicalTransferType(value: string | null | undefined): TransferTypeParam {
  const lower = (value ?? "").trim().toLowerCase();
  if (lower in TRANSFER_TYPE_ALIASES) return TRANSFER_TYPE_ALIASES[lower];
  return (TRANSFER_TYPE_PARAMS as readonly string[]).includes(lower)
    ? (lower as TransferTypeParam)
    : "virman";
}

export type TransferCenterQuery = {
  tab?: TransferCenterTab;
  transferType?: TransferTypeParam;
  /** "Gönder" bağlantıları: kaynak = bu hesap. */
  sourceFundId?: string;
  sourceBranchId?: string;
  /** "Al" / "… Bu Bankaya/Kasaya" bağlantıları: hedef = bu hesap; hedef iş yeri önce seçilir (F4). */
  targetFundId?: string;
  targetBranchId?: string;
  direction?: string;
};

/** Transfer Merkezi (ZTO BankStatement/Index) derin bağlantısı. */
export function transferCenterPath(query: TransferCenterQuery = {}): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.transferCenter}${queryOf({
    tab: query.tab,
    transferType: query.transferType,
    sourceFundId: query.sourceFundId,
    sourceBranchId: query.sourceBranchId,
    targetFundId: query.targetFundId,
    targetBranchId: query.targetBranchId,
    direction: query.direction,
  })}`;
}

/** Döviz Bozum & Tahsilat İzlenebilirliği (ZTO BankStatement/ExchangeBreakReport; yeni sekme). */
export function exchangeBreakReportPath(range: { from?: string; to?: string } = {}): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.transferCenter}/doviz-bozum-raporu${queryOf(range)}`;
}

/** Banka / Kasa ekstresi yazdırma sayfası (ZTO BankExtract / CashExtract; kabuk dışı, yeni sekme). */
export function fundExtractPath(
  kind: ZtoFundKind,
  id: string,
  range: { from?: string; to?: string } = {},
): string {
  const page = kind === "BANK" ? "banka-ekstre" : "kasa-ekstre";
  return `${ZTO_PRINT_BASE}/${page}/${segment(id)}${queryOf(range)}`;
}

/** FIFO faaliyet raporu yazdırma sayfası (ZTO BankTransactions/CashTransactions ActivityReport). */
export function fundActivityPath(id: string, range: { from: string; to: string }): string {
  return `${ZTO_PRINT_BASE}/faaliyet-raporu/${segment(id)}${queryOf(range)}`;
}

// ---------------------------------------------------------------------------------------------
// 12.2a ödeme / tahsilat yolları (12.2a_TASARIM §5.3). Parametre adları ZTO ile birebir; kimlikler
// UUID. Yöntem değerleri ZTO metniyle üretilir (`settlementDeepLink.ts` metni ve kodu kabul eder).
// ---------------------------------------------------------------------------------------------

/** ZTO `paymentMethod` / `collectionMethod` URL değerleri. */
export type ZtoSettlementMethodParam = "Nakit" | "Banka" | "Çek" | "Senet" | "Kredi Kartı";

export type PaymentsQuery = {
  /** Cari (süzgeç; `openModal` ile modal ön seçimi). */
  id?: string;
  openModal?: boolean;
  openEditPayment?: boolean;
  paymentId?: string;
  bankId?: string;
  cashId?: string;
  workPlaceId?: string;
  currencyId?: string;
  paymentMethod?: ZtoSettlementMethodParam;
  /** Detay modalı (backend kaynak rotası). */
  settlementId?: string;
};

export type CollectionsQuery = {
  id?: string;
  openModal?: boolean;
  openEditCollection?: boolean;
  collectionId?: string;
  bankId?: string;
  cashId?: string;
  workPlaceId?: string;
  currencyId?: string;
  collectionMethod?: ZtoSettlementMethodParam;
  settlementId?: string;
};

/** Ödemeler (ZTO CustomerAccountPayment/Payments). */
export function paymentsPath(query: PaymentsQuery = {}): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.payments}${queryOf({
    id: query.id,
    openModal: query.openModal,
    openEditPayment: query.openEditPayment,
    paymentId: query.paymentId,
    bankId: query.bankId,
    cashId: query.cashId,
    workPlaceId: query.workPlaceId,
    currencyId: query.currencyId,
    paymentMethod: query.paymentMethod,
    settlementId: query.settlementId,
  })}`;
}

/** Tahsilatlar (ZTO CustomerAccountCollection/Collections). */
export function collectionsPath(query: CollectionsQuery = {}): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.collections}${queryOf({
    id: query.id,
    openModal: query.openModal,
    openEditCollection: query.openEditCollection,
    collectionId: query.collectionId,
    bankId: query.bankId,
    cashId: query.cashId,
    workPlaceId: query.workPlaceId,
    currencyId: query.currencyId,
    collectionMethod: query.collectionMethod,
    settlementId: query.settlementId,
  })}`;
}

export type DailySettlementReportQuery = {
  /** ISO `YYYY-MM-DD` (yerel takvim). */
  reportDate: string;
  /** Virgülle birleştirilir (`workPlaceIds=a,b`, ZTO DPR/DCR). */
  workPlaceIds?: readonly string[];
};

/**
 * Günlük Ödeme / Tahsilat Raporu (ZTO DailyPaymentReport / DailyCollectionReport; kabuk içi, yeni
 * sekme — OK-12.2a-25): `/zto-finans/odemeler/gunluk-rapor?reportDate=…&workPlaceIds=a,b`.
 */
export function dailySettlementReportPath(
  type: "PAYMENT" | "COLLECTION",
  query: DailySettlementReportQuery,
): string {
  const slug = type === "PAYMENT" ? ZTO_SLUGS.payments : ZTO_SLUGS.collections;
  const ids = (query.workPlaceIds ?? []).filter((id) => id !== "");
  const base = `${ZTO_FINANS_BASE}/${slug}/gunluk-rapor${queryOf({ reportDate: query.reportDate })}`;
  if (ids.length === 0) return base;
  // Kimlikler tek tek kodlanır; ayırıcı virgül ZTO'daki gibi düz kalır.
  const list = ids.map((id) => encodeURIComponent(id)).join(",");
  return `${base}${base.includes("?") ? "&" : "?"}workPlaceIds=${list}`;
}

// ---------------------------------------------------------------------------------------------
// 12.3 çek / senet yolları (12.3_TASARIM §5.3). Parametre adları ZTO ile birebir
// (`_AccountCardsListPartial.cshtml:281-285`); kimlikler UUID.
// ---------------------------------------------------------------------------------------------

export type ChecksQuery = {
  /** Banka hesabı (ZTO `bankId`; "Bankadan Cari Çek Ödemesi" ön seçimi). */
  bankId?: string;
  workPlaceId?: string;
  currencyId?: string;
  /** "Yeni Ödeme Çeki" modalını açar (yalnız FINANCE_PAYMENT_CREATE izninde dikkate alınır). */
  openCheckPaymentModal?: boolean;
  /** Cari süzgeci. */
  accountId?: string;
  /** Durum süzgeci (`InstrumentStatus`). */
  status?: string;
};

export type BillsQuery = {
  accountId?: string;
  /** "Yeni Ödeme Senedi" modalını açar. */
  openBillPaymentModal?: boolean;
};

/** Çekler (ZTO Checks/Checks). */
export function checksPath(query: ChecksQuery = {}): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.checks}${queryOf({
    bankId: query.bankId,
    workPlaceId: query.workPlaceId,
    currencyId: query.currencyId,
    openCheckPaymentModal: query.openCheckPaymentModal,
    accountId: query.accountId,
    status: query.status,
  })}`;
}

/** Senetler (ZTO Bills/Bills). */
export function billsPath(query: BillsQuery = {}): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.bills}${queryOf({
    accountId: query.accountId,
    openBillPaymentModal: query.openBillPaymentModal,
  })}`;
}

/** Çek Koçanları (ZTO CheckBooks/Index; kenar çubuğunda yok, Çekler'in alt yolu). */
export function checkBooksPath(): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.checks}/kocanlar`;
}

/** Çek Düzenle (ZTO Checks/EditCheck). */
export function checkEditPath(id: string): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.checks}/${segment(id)}/duzenle`;
}

/** Senet Düzenle (ZTO Bills/EditBill). */
export function billEditPath(id: string): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.bills}/${segment(id)}/duzenle`;
}

/** Çek Belgeleri (ZTO Checks/CheckDocuments; yeni sekme). */
export function checkDocumentsPath(id: string): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.checks}/${segment(id)}/belgeler`;
}

/** Detaylı Çek Raporu (ZTO Checks/CheckDetailedReport; kabuksuz yazdırma sayfası, OK-12.3-13). */
export function checkDetailedReportPath(range: { from?: string; to?: string } = {}): string {
  return `${ZTO_PRINT_BASE}/cek-raporu${queryOf({ from: range.from, to: range.to })}`;
}

// ---------------------------------------------------------------------------------------------
// 12.7 masraf ve taşeron gideri yolları (12.7_TASARIM §5.3).
// ---------------------------------------------------------------------------------------------

/** Masraf Kalemleri — Yeni Kayıt (ZTO ExpenseItems/Add). */
export function newExpenseItemPath(): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.expenseItems}/yeni`;
}

/** Masraf Kalemi Düzenle (ZTO ExpenseItems/Edit). */
export function expenseItemEditPath(id: string): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.expenseItems}/${segment(id)}/duzenle`;
}

/** Genel Masraf listesi (ZTO ProductionExpenses/IndexExpenses). */
export function generalExpensesPath(): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.generalExpenses}`;
}

/** Genel Masraf takvimi (ZTO ProductionExpenses/Index). */
export function expenseCalendarPath(): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.expenseCalendar}`;
}

/** Kalemin faturaları (ZTO ProductionExpenses/ExpenseGroupDetails). */
export function expenseItemInvoicesPath(itemId: string): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.generalExpenses}/kalem/${segment(itemId)}`;
}

/** Yeni Genel Masraf (ZTO ProductionExpenses/Add). */
export function newExpensePath(): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.generalExpenses}/yeni`;
}

/** Genel Masraf Düzenle (ZTO ProductionExpenses/Edit; düzeltme = revise). */
export function expenseEditPath(id: string): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.generalExpenses}/${segment(id)}/duzenle`;
}

/** Sevk Nakliye Masrafları (ZTO SalesTruckExpenses/Index). */
export function shipmentExpensesPath(days?: number): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.shipmentExpenses}${queryOf({
    days: days === undefined ? undefined : String(days),
  })}`;
}

/** Nakliye firması detayı (ZTO SalesTruckExpenses/CustomerShippingDetails); `?days`. */
export function carrierDetailPath(accountId: string, days?: number): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.shipmentExpenses}/firma/${segment(accountId)}${queryOf({
    days: days === undefined ? undefined : String(days),
  })}`;
}

// ---------------------------------------------------------------------------------------------
// 12.8 rapor yolları (12.8_TASARIM §5.3). FinanceReport parametreleri: `branchGroupId` = ZTO `bp`
// (şube), `branchId` = ZTO `wp` (iş yeri; Rev 1 FE-FRI-BRANCHGROUP).
// ---------------------------------------------------------------------------------------------

/** FinanceReport hazır dönem aralıkları (ZTO `_ReportFilterBar`). */
export type FinanceReportRange = "all" | "30" | "7" | "today";

export type FinanceReportQuery = {
  /** Doluysa liste kipi. */
  type?: ReportType;
  range?: FinanceReportRange;
  from?: string;
  to?: string;
  cur?: string;
  /** Doluysa cari ekstre kipi. */
  account?: string;
  branchGroupId?: string;
  branchId?: string;
  companyId?: string;
};

/** Finans Raporları (ZTO FinanceReport/Index; kabuk içi, OK-12.8-14). Tüm süzgeçler korunur. */
export function financeReportPath(query: FinanceReportQuery = {}): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.financeReports}${queryOf({
    type: query.type,
    range: query.range,
    from: query.from,
    to: query.to,
    cur: query.cur,
    account: query.account,
    branchGroupId: query.branchGroupId,
    branchId: query.branchId,
    companyId: query.companyId,
  })}`;
}

/** Cari Hesap Raporları sekmeleri (ZTO CustomerAccountReport/Reports `#reportTabs`). */
export type CustomerAccountReportTab = "aging" | "checks" | "bills" | "performance" | "position";

/** Cari Hesap Raporları (ZTO CustomerAccountReport/Reports); `?tab`. */
export function customerAccountReportPath(tab?: CustomerAccountReportTab): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.customerAccountReport}${queryOf({ tab })}`;
}

/** Finansal Varlıklar & Bilanço (ZTO FinancialBalanceSheet/Index). */
export function balanceSheetPath(): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.balanceSheet}`;
}

/** Kur Farkı Raporu (ZTO RecipeFinance/FxReport). */
export function fxReportPath(): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.fxReport}`;
}

/** Nakit Akış (ZTO RecipeFinance/CashFlow). */
export function cashFlowPath(): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.cashFlow}`;
}

/** Para Birimleri (ZTO Currency/Index; salt okunur). */
export function currenciesPath(): string {
  return `${ZTO_FINANS_BASE}/${ZTO_SLUGS.currencies}`;
}

function queryOf(query: Record<string, string | boolean | undefined>): string {
  const parts = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== "" && value !== false)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}
