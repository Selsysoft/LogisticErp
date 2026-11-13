// ztoFinans ad alanı: şube gruplu iş yeri seçimi (MX5 §1.7). Varyant B: Payments.cshtml
// "Günlük Ödeme Raporu" (dpr-*); Varyant C: CustomerAccounts/Index.cshtml (wp-multiselect).
export default {
  workPlace: "İş Yeri",
  multiSelectHint: "çoklu seçim",
  // Varyant B
  selectAll: "Tümünü seç",
  clear: "Temizle",
  searchPlaceholder: "İş yeri / şube ara...",
  helpText: "Birden fazla iş yeri seçebilirsiniz. Hiçbiri seçilmezse tüm iş yerleri raporlanır.",
  branchCount: "({{checked}}/{{total}})",
  otherGroup: "Diğer",
  toggleGroup: "Grubu aç/kapat",
  loadFailed: "İş yerleri yüklenemedi.",
  // Varyant C
  balanceFilterLabel: "İŞ YERİ (Borç/Alacak)",
  allTotal: "Tüm İş Yerleri Toplamı",
  selectAllButton: "Tümünü Seç",
  removeAll: "Tümünü Kaldır",
  noneSelected: "Hiç Seçilmedi",
  selectedCount: "{{count}} İş Yeri Seçildi",
  refreshTable: "Tabloyu Yenile",
  // Varyant D (BankIntroduction/Index.cshtml:1095-1098 istatistik kartı; boş ad "Tanımsız", BIC:20)
  statTitle: "İş Yerleri",
  undefinedGroup: "Tanımsız",
  // Varyant A (tekli select)
  placeholder: "İş Yeri Seçiniz",
  allWorkPlaces: "Tüm İş Yerleri",
  // Yalnız Blackrose: çoklu şirket katmanı (ZTO'da yok)
  allCompanies: "Tüm Şirketler",
} as const;
