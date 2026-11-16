// ztoFinans ad alanı, "currencies" parçası: Para Birimleri (FE-1; 12.8_TASARIM §5.9, ZTO
// Views/Currency/Index.cshtml). Salt okunur kur ekranı (OK-12.8-13): "Yeni Kayıt" ve İşlemler yok,
// yerine "Kurları Yenile"; "Oluşturma Tarihi" başlığı "Kur Tarihi" olur.
export default {
  crumbRoot: "Temel Tanımlar",
  crumb: "Para Birimleri",
  heading: "Para Birimleri",
  title: "Para Birimi Listesi",
  refresh: "Kurları Yenile",
  refreshed: "Kur güncelleme isteği alındı.",
  refreshFailed: "Kurlar yenilenemedi: {{message}}",
  loadFailed: "Para birimleri yüklenemedi: {{message}}",
  name: "Adı",
  symbol: "Sembol",
  rate: "Kur Bilgisi",
  rateDate: "Kur Tarihi",
  rateText: "1 {{code}} = {{rate}} ₺",
  noRate: "Kur bulunamadı",
} as const;
