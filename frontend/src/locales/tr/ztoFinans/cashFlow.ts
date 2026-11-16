// ztoFinans ad alanı, "cashFlow" parçası: Nakit Akış (FE-3; 12.8_TASARIM §5.8, ZTO
// Views/RecipeFinance/CashFlow.cshtml).
export default {
  breadcrumbRoot: "Finans Raporları",
  breadcrumbLabel: "Kırılım",
  title: "Nakit Akış",
  heroKicker: "Finans",
  heroTitle: "Nakit Akış Projeksiyonu (8 Hafta)",
  // OK-12.8-9: ZTO "BRÜT vade projeksiyonudur…" cümlesi FIFO açık kalan kuralına göre düzeltildi.
  heroText:
    "Giriş = vadeli cari alacaklar + alınan çekler · Çıkış = kendi çeklerimiz · Senetler nötr bilgi. Alacak vadeleri tahsilatlar düşüldükten sonra kalan açık tutardır.",
  tableLabel: "Nakit akış tablosu",
  filter: {
    label: "Nakit akış süzgeci",
    company: "Şirket",
    allCompanies: "Tüm Şirketler",
    currency: "Para birimi",
    tlEquivalent: "TL karşılığı",
    submit: "Filtrele",
  },
  col: {
    week: "Hafta",
    receivableDue: "Alacak Vadesi",
    receivedChecks: "Alınan Çek",
    issuedChecks: "Kendi Çekimiz",
    notes: "Senet (bilgi)",
    net: "Net",
    cumulative: "Kümülatif",
  },
  empty: "Vadeli kalem bulunamadı.",
  loading: "Yükleniyor...",
  loadError: "Rapor yüklenemedi: {{message}}",
  note: "Vadesi geçmiş açık kalemler ilk haftaya dahil edilir. Tutarlar TL karşılığıdır (tutar × kur). İptal/tahsil edilmiş çekler hariçtir.",
  noteCurrency:
    "Vadesi geçmiş açık kalemler ilk haftaya dahil edilir. Tutarlar {{currency}} cinsindendir. İptal/tahsil edilmiş çekler hariçtir.",
  planExcluded: "Ödeme planları bu projeksiyona dahil değildir.",
  missingRates: "Kur bulunamadı (TL toplamına dahil edilmedi): {{list}}",
} as const;
