// ztoFinans ad alanı, "allTransactions" parçası (12.1 §5.12, §5.14): ZTO
// Views/AccountTransaction/AllTransactions.cshtml (:1153-1343) ve wwwroot/js/zt/accounttransaction/
// alltransactions.js metinleri birebir. Yer tutucular {{n}} biçiminde; DataTables dil metinleri ("dt")
// DataTables yer tutucularına (_TOTAL_ …) sayfa tarafından çevrilir (allTransactionsLogic.ts).
export default {
  // Üst panel ve başlık kartı (12.0'da pages.allTransactions altındaydı)
  title: "Günlük Tüm Cari İşlemleri",
  breadcrumbRoot: "Cari Kartlar",
  breadcrumbCurrent: "Günlük Cari İşlemleri",
  panelTitle: "Finans Paneli",
  panelSubtitle: "Cari hesap işlemleri ve ödeme planlamalarını yönetin",
  // Başlıktaki merkezi cari arama (ajs:500-590)
  headerSearchPlaceholder: "Cari ara (ad / hesap grubu) ve hareketlere git...",
  newAccount: "Yeni Cari Kart Oluştur",
  actMovements: "Hareketler",
  actStatement: "Ekstre",
  actEditTitle: "Cari kartı düzenle",
  heatmap: "Ödeme Planlama Haritası",
  heatmapTitle: "Ödeme Planlama Isı Haritası",
  reminderTitle: "Ödeme Planı Hatırlatıcısı",
  back: "Cari Kartlar",
  backTitle: "Cari Kartlara Dön",
  // Filtre kartı (:1262-1320)
  ranges: {
    today: "Bugün",
    yesterday: "Dün",
    d7: "7 Gün",
    d14: "2 Hafta",
    d30: "1 Ay",
    d90: "3 Ay",
    d180: "6 Ay",
  },
  startDate: "Başlangıç Tarihi",
  endDate: "Bitiş Tarihi",
  rangeArrow: "aralık",
  cari: "Cari",
  cariPlaceholder: "Cari ara...",
  reset: "Sıfırla",
  currency: "Birim",
  all: "Tümü",
  // Tarih aralığı kuralı (sunucu 400 DATE_RANGE_TOO_LARGE ile aynı sınır; ZTO'da yok)
  rangeTooLarge: "Tarih aralığı en çok 1 yıl olabilir.",
  rangeOrder: "Bitiş tarihi başlangıç tarihinden önce olamaz.",
  // Dinamik filtre kartları ve çipler
  cards: {
    branches: "İş Yerleri",
    groups: "Hesap Grupları",
    kinds: "İşlem Türleri",
  },
  chips: {
    branch: "İş Yeri",
    group: "Hesap Grubu",
    kind: "İşlem Türü",
  },
  // Tablo (:1323-1340)
  columns: {
    date: "Tarih",
    branch: "İş Yeri",
    code: "Cari Kodu",
    name: "Cari Adı",
    group: "Hesap Grubu",
    kind: "İşlem Türü",
    documentNo: "Belge No",
    amount: "Tutar",
    description: "Açıklama",
    createdBy: "Oluşturan",
    action: "İşlem",
  },
  openTransactions: "Cari hareketlerini aç",
  sale: "Satış",
  refund: "İade",
  loading: "Yükleniyor...",
  error: "Hata",
  errorOccurred: "Hata oluştu",
  noResults: "Sonuç bulunamadı",
  emptyTitle: "Bugün henüz bir cari işlemi yapılmadı",
  emptyText: "Carileri incelemek veya cari işlemi yapmak için tıklayınız.",
  quickCari: "Hızlı Cari İşlemi",
  // S-22: istemci modu üst sınırı
  tooLarge: "Seçilen aralıkta {{n}} kayıt var; lütfen tarih aralığını daraltın.",
  // DataTables dil metinleri (ajs:53-75 datatableLanguageTR)
  dt: {
    info: "{{total}} kayıttan {{start}} - {{end}} arası gösteriliyor",
    infoEmpty: "0 kayıt gösteriliyor",
    infoFiltered: "({{max}} kayıt içinden filtrelendi)",
    lengthMenu: "Göster {{menu}} kayıt",
    emptyTable: "Tabloda veri bulunmuyor",
    zeroRecords: "Eşleşen kayıt bulunamadı",
    search: "Ara:",
  },
} as const;
