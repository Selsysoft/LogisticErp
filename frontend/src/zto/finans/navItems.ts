import type navTexts from "../../locales/tr/ztoFinans/nav";

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
   * "blackrose" ZTO'da olmayan Blackrose eki.
   */
  file?: "_SideMenu_FinanceItems" | "_Layout" | "blackrose";
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
        implemented: false,
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
        implemented: false,
      },
      {
        id: "accounts",
        label: "accounts",
        icon: "fas fa-user-tie",
        slug: "cari-kartlar",
        kind: "page",
        source: FILE_LINE("CustomerAccounts", "Index", 30),
        step: "12.1",
        implemented: false,
      },
      {
        id: "newAccount",
        label: "newAccount",
        icon: "fas fa-plus",
        slug: "cari-kartlar/yeni",
        kind: "page",
        source: FILE_LINE("CustomerAccounts", "Add", 36),
        step: "12.1",
        implemented: false,
        action: "add",
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
        implemented: false,
      },
      {
        id: "allBankTransactions",
        label: "allBankTransactions",
        icon: "fas fa-university",
        slug: "banka-hareketleri",
        kind: "page",
        source: FILE_LINE("BankTransactions", "Index", 69),
        step: "12.2",
        implemented: false,
      },
      {
        id: "cashes",
        label: "cashes",
        icon: "fas fa-cash-register",
        slug: "kasalar",
        kind: "page",
        source: FILE_LINE("CashIntroduction", "Index", 75),
        step: "12.2",
        implemented: false,
      },
      {
        id: "allCashTransactions",
        label: "allCashTransactions",
        icon: "fas fa-cash-register",
        slug: "kasa-hareketleri",
        kind: "page",
        source: FILE_LINE("CashTransactions", "Index", 81),
        step: "12.2",
        implemented: false,
      },
      {
        id: "transferCenter",
        label: "transferCenter",
        icon: "fas fa-exchange-alt",
        slug: "transfer-merkezi",
        kind: "page",
        source: FILE_LINE("BankStatement", "Index", 87),
        step: "12.2",
        implemented: false,
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
        implemented: false,
      },
      {
        id: "collections",
        label: "collections",
        icon: "fas fa-hand-holding-usd",
        slug: "tahsilatlar",
        kind: "page",
        source: FILE_LINE("CustomerAccountCollection", "Collections", 106),
        step: "12.2a",
        implemented: false,
      },
      {
        id: "checks",
        label: "checks",
        icon: "fas fa-money-check",
        slug: "cekler",
        kind: "page",
        source: FILE_LINE("Checks", "Checks", 112),
        step: "12.3",
        implemented: false,
      },
      {
        id: "bills",
        label: "bills",
        icon: "fas fa-file-invoice-dollar",
        slug: "senetler",
        kind: "page",
        source: FILE_LINE("Bills", "Bills", 118),
        step: "12.3",
        implemented: false,
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
        // ZTO: #treasuryModal (MX1 §2 modal 9, yeni uç GET /finance/treasury).
        id: "quickBalance",
        label: "quickBalance",
        icon: "fas fa-coins",
        slug: "cari-kartlar",
        kind: "modal",
        source: FILE_LINE("CustomerAccounts", "#treasuryModal", 151),
        step: "12.8",
        implemented: false,
      },
      {
        id: "balanceSheet",
        label: "balanceSheet",
        icon: "fas fa-money-bill-alt",
        slug: "bilanco",
        kind: "page",
        source: FILE_LINE("FinancialBalanceSheet", "Index", 157),
        step: "12.8",
        implemented: false,
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
        implemented: false,
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
        implemented: false,
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

/** Bağlantı olarak çalışan öğe: ekranı yazılmış bir sayfa. Modal öğeleri ekranları gelene dek pasif. */
export function isNavigable(item: ZtoNavItem): boolean {
  return item.implemented && item.kind === "page";
}

/**
 * Etkin öğeler (ZTO "zt-active"): yolu tam eşleşen sayfa öğeleri. ZTO'da Cari Kartlar ile Tüm
 * Planlamalar aynı adrese gittiği için ikisi birlikte etkin olabilir; sondaki "/" yok sayılır.
 * `matchPrefix` öğelerde alt yollar (…/yeni, …/:id) da etkindir.
 */
export function isActive(item: ZtoNavItem, pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (item.kind !== "page") return false;
  const own = itemPath(item);
  return path === own || (item.matchPrefix === true && path.startsWith(`${own}/`));
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
} as const;
