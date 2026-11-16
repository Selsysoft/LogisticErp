// ztoFinans ad alanı: DataTables Türkçe dil metinleri (ZTO'nun kullandığı plug-ins 1.13.7/2.1.8
// i18n/tr.json). Eski satır içi "Turkish" bloğu kullanan sayfalar (Checks, BankTransactions,
// paymentmanagement) emptyText prop'uyla kendi metnini geçer. _TOTAL_/_START_/_END_/_MAX_ yer
// tutucuları i18next değişkeni oldu; _MENU_ bir <select> olduğundan uzunluk menüsü öncesi/sonrası iki
// metne bölündü.
export default {
  lengthMenuBefore: "Sayfada",
  lengthMenuAfter: "kayıt göster",
  lengthAll: "Tümü",
  info: "{{total}} kayıttan {{start}} - {{end}} arasındaki kayıtlar gösteriliyor",
  infoEmpty: "Kayıt yok",
  infoFiltered: "({{max}} kayıt içerisinden bulunan)",
  search: "Ara:",
  emptyTable: "Tabloda veri bulunmuyor",
  zeroRecords: "Eşleşen kayıt bulunamadı",
  loadingRecords: "Yükleniyor...",
  processing: "İşleniyor...",
  paginate: {
    first: "İlk",
    last: "Son",
    next: "Sonraki",
    previous: "Önceki",
  },
  aria: {
    sortAscending: ": artan sütun sıralamasını aktifleştir",
    sortDescending: ": azalan sütun sıralamasını aktifleştir",
  },
  buttons: {
    copy: "Kopyala",
    excel: "Excel",
    pdf: "PDF",
    print: "Yazdır",
    copyTitle: "Panoya kopyala",
    copySuccess: "{{count}} satır panoya kopyalandı",
  },
  // 12.8 (§5.3a): ZTO wwwroot/js/recipe-table.js `rcpI18n.tr` (ZtoRcpTable). Metinlerin baş/son
  // boşlukları bileşende; `<b>` vurgulu özet üç parçaya bölündü. Erişilebilirlik adları Blackrose eki.
  rcp: {
    show: "Sayfada göster:",
    all: "Tümü",
    records: "kayıt",
    search: "Ara:",
    placeholder: "Tabloda ara...",
    notFound: "Kayıt bulunamadı",
    emptyHint: "Henüz bu listede kayıt yok.",
    emptyFilterHint: "Arama veya filtre ölçütlerine uyan kayıt yok.",
    infoTotal: "Toplam",
    infoFrom: "kayıttan",
    infoShowing: "arası gösteriliyor",
    sizeLabel: "Sayfada gösterilecek kayıt",
    searchLabel: "Tabloda ara",
    pageLabel: "Sayfa {{page}}",
    previous: "Önceki sayfa",
    next: "Sonraki sayfa",
  },
} as const;
