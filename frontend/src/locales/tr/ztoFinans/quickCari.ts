// ztoFinans ad alanı, "quickCari" parçası (12.1 §5.12, §5.14): ZTO Views/Shared/_ProductionLayout.cshtml
// "HIZLI CARİ İŞLEMİ MODALI" (:3838-3990) metinleri birebir. Gruba özel kartlar ZTO'nun tarım kartları
// yerine 12.1 §5.7 eşlemesiyle (Sefer Maliyetleri, Sürücü Kartı).
export default {
  title: "Hızlı Cari İşlemi",
  searchPlaceholder: "Cari ara — ad veya kod yazın...",
  noResults: "Sonuç bulunamadı",
  emptyTitle: "Bir cari arayın ve seçin",
  emptyText: "Ardından işlem kartlarına tıklayarak ilgili sayfaya gidin.",
  cards: {
    transactions: "Cari Hareketler",
    statement: "Ekstre Al",
    bankAccounts: "Banka Hesapları",
    addPayment: "Ödeme Ekle",
    tripCosts: "Sefer Maliyetleri",
    driverCard: "Sürücü Kartı",
    edit: "Düzenle",
  },
  actions: "İşlem kartları",
} as const;
