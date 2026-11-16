// ztoFinans ad alanı: ZTO finans menüsü (_SideMenu_FinanceItems sırası, _NavMenu_Finance* üst menüsü).
// Tarım/üretime özgü öğeler (bahçe, çavuş, malzeme/drencher stoğu, yatırımlar) 04 §3'e göre ÇIKAR.
export default {
  root: "ZTO Finans",
  menu: "Menü",
  // zt-sidebar başlığı (_SideMenu_Finance.cshtml:45) ve Blackrose ekleri
  sidebarTitle: "FİNANS İŞLEMLERİ",
  toggleMenu: "Finans menüsünü aç/kapat",
  phase: "Faz {{step}}",
  notReady: "Bu ekran Faz {{step}} ile gelecek.",
  financePanel: "Finans Paneli",
  // Bölüm başlıkları
  sectionAccounts: "CARİ İŞLEMLERİ",
  sectionBankCash: "BANKA & KASA İŞLEMLERİ",
  sectionPaymentCollection: "ÖDEME & TAHSİLAT",
  sectionPaymentPlanning: "ÖDEME PLANLAMA İŞLEMLERİ",
  sectionFinancial: "FİNANSAL İŞLEMLER",
  sectionCreditDeposit: "KREDİ & YATIRIM",
  sectionTransportExpense: "NAKLİYE MASRAF İŞLEMLERİ",
  sectionLaborExpense: "İŞÇİLİK & GENEL MASRAF İŞLEMLERİ",
  sectionCustomerReceivable: "MÜŞTERİ ALACAK İŞLEMLERİ",
  sectionExtra: "EK İŞLEMLERİ",
  sectionEDocument: "E-DÖNÜŞÜM",
  // CARİ İŞLEMLERİ
  financeReports: "Finans Raporları",
  // 12.8 (§5.3): Blackrose eki menü öğesi (ZTO CustomerAccountReport/Reports başlığı).
  customerAccountReport: "Cari Hesap Raporları",
  allTransactions: "Günlük Cari İşlemleri",
  quickTransaction: "Hızlı Cari İşlemi",
  accounts: "Cari Kartlar",
  newAccount: "Yeni Cari Kart",
  personnel: "Personel Yönetimi",
  // BANKA & KASA İŞLEMLERİ
  banks: "Bankalar",
  allBankTransactions: "Tüm Banka Hareketleri",
  cashes: "Kasalar",
  allCashTransactions: "Tüm Kasa Hareketleri",
  transferCenter: "Banka & Kasa Transferi & Virman & Döviz Bozum",
  // ÖDEME & TAHSİLAT
  payments: "Ödemeler",
  collections: "Tahsilatlar",
  checks: "Çekler",
  bills: "Senetler",
  // ÖDEME PLANLAMA İŞLEMLERİ
  allPlans: "Tüm Planlamalar",
  paymentApproval: "Ödeme Onay Yönetimi",
  // FİNANSAL İŞLEMLER
  quickBalance: "Hızlı Bakiye Özeti",
  balanceSheet: "Finansal Varlıklar & Bilanço",
  // 12.8: ZTO _SideMenu_Recipe_Finance.cshtml:86, :100
  fxReport: "Kur Farkı Raporu",
  cashFlow: "Nakit Akış",
  // KREDİ & YATIRIM
  credits: "Krediler",
  timeDeposits: "Vadeli Mevduatlar",
  // NAKLİYE MASRAF İŞLEMLERİ
  shipmentTransportExpenses: "Sevk İhracat Nakliye Hesapları",
  // İŞÇİLİK & GENEL MASRAF İŞLEMLERİ
  generalExpenses: "Genel Masraf Hesapları",
  // MÜŞTERİ ALACAK İŞLEMLERİ
  customerReceivables: "Müşteri Alacak Hesapları",
  // EK İŞLEMLERİ
  reports: "Raporlar",
  definitions: "Tanıtımlar",
  // E-DÖNÜŞÜM
  uyumsoftDashboard: "Uyumsoft İşlem Takibi",
  incomingInvoices: "Gelen e-Faturalar",
  uyumsoftSettings: "Uyumsoft Ayarları",
  // _NavMenu_Finance_Financial üst menüsünde ayrıca geçenler
  cashTransactions: "Kasa Hareketleri",
  bankTransactions: "Banka Hareketleri",
  bankAccounts: "Banka Hesapları",
  // TEMEL TANIMLAR (Blackrose eki; ZTO _Layout.cshtml:1263 "Temel Tanımlar", 12.1a §6.6)
  sectionBasicDefinitions: "TEMEL TANIMLAR",
  // 12.7 (§5.9): ZTO _Layout.cshtml:1201 "Masraf Kalemleri".
  expenseItems: "Masraf Kalemleri",
  // 12.8 (§5.9): ZTO _Layout.cshtml:1268 "Para Birimleri".
  currencies: "Para Birimleri",
  workPlaces: "İş Yerleri",
  branchGroups: "Şubeler",
  companies: "Şirketler",
  // Yalnız Blackrose: geliştirme vitrini
  sectionDev: "GELİŞTİRME",
  showcase: "Bileşen vitrini",
} as const;
