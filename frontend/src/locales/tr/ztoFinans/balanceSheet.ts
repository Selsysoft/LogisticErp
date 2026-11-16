// ztoFinans ad alanı, "balanceSheet" parçası: Finansal Varlıklar & Bilanço (FE-2; 12.8_TASARIM §5.6, ZTO
// Views/FinancialBalanceSheet/Index.cshtml). Metinler ZTO görünümünden birebir; "Blackrose eki"
// işaretli olanlar ZTO'da yoktur.
export default {
  title: "Finansal Bilanço",
  subtitle:
    "İş yeri bazında toplam varlıklar, borçlar, banka/kasa/çek bakiyeleri ve cari hareketler",
  rateDate: "TCMB Kuru",
  // Blackrose eki: şirket ve tarih seçimi.
  company: "Şirket",
  consolidated: "Konsolide",
  asOf: "Tarih",
  // Blackrose eki: tarih doğrulaması (sunucu AS_OF_INVALID ile aynı metin).
  asOfInvalid: "Tarih bugünden ileri olamaz.",
  asOfMissing: "Geçerli bir tarih girin.",
  grand: {
    assets: "Toplam Varlıklar (TL)",
    assetsHint: "Tüm iş yerleri toplam",
    liabilities: "Toplam Borç / Yükümlülük (TL)",
    liabilitiesHint: "Borç + Ödenecek Çekler",
    net: "Net Bilanço (TL)",
    positive: "Pozitif",
    negative: "Negatif",
    workplaces: "İş Yeri",
    workplacesHint: "Aktif iş yeri sayısı",
    // Blackrose eki (Rev 1 F2, OK-12.8-24).
    note: "Genel toplamlarda cari bakiyeleri şirket düzeyinde mahsuplaşır; iş yeri kartları iş yerinde girilen hareketleri gösterir ve toplamları genel özetten farklı olabilir.",
    missingRates: "Kur bulunamadı: {{currencies}} — bu para birimi TL toplamlarına katılmadı.",
  },
  emptyWorkplaces: "Henüz aktif iş yeri tanımlanmamış.",
  // Blackrose eki: ≥ 2 şirkette şirket grubu başlığı.
  companyGroup: {
    assets: "Varlık",
    liabilities: "Yükümlülük",
    net: "Net",
    workplaceCount: "{{count}} İş Yeri",
  },
  card: {
    assetsTitle: "Toplam Varlık (TL)",
    debtTitle: "Toplam Borç (TL)",
    netTitle: "Net Bilanço (TL)",
    currencyCount: "{{count}} Para Birimi",
    accountCount: "{{count}} Cari",
    expand: "{{name}} ayrıntıları",
  },
  block: {
    empty: "Bu iş yerinde henüz finansal hareket yok.",
    debtor: "(+) Borçlu Bakiye",
    creditor: "(−) Alacaklı Bakiye",
    balanced: "Dengede",
    debt: "Borç",
    payment: "Ödeme",
    receivable: "Alacak",
    collection: "Tahsilat",
    bank: "Banka",
    cash: "Kasa",
    received: "Tahsil",
    issued: "Ödenecek",
    checks: "{{count}} çek",
    notes: "{{count}} senet",
    net: "Mahsuplaşma Net Bakiye",
    // Blackrose eki (Rev 1 F6, F1).
    overdraft: "Eksi bakiyeli banka hesabı (KMH): {{amount}}",
    fxAdjustment: "Açık kaynaklı kur farkı (değerlemede düşüldü): {{amount}}",
  },
  accounts: {
    title: "Bu İş Yerindeki Cariler",
    search: "Cari ara...",
    empty: "Cari hareketi yok.",
    newTab: "Yeni sekme",
    masked: "Personel carisi",
  },
  intercompany: {
    title: "İş Yerleri Arası Bakiye",
    empty: "İş yerleri arası hareket yok.",
    receivable: "Alacaklıyız",
    payable: "Borçluyuz",
    balanced: "Dengede",
  },
  footer: {
    assets: "Toplam Varlık (TL)",
    liabilities: "Toplam Borç / Yükümlülük (TL)",
    net: "Net Bilanço (TL)",
    rates: "TCMB Kurları ({{date}}):",
  },
  // Blackrose eki (12.5/12.6 atlandı).
  creditDepositPending:
    "Kredi ve vadeli mevduat kalemleri ilgili modüller açıldığında eklenecektir.",
  loading: "Yükleniyor…",
  error: "Bilanço yüklenemedi: {{message}}",
} as const;
