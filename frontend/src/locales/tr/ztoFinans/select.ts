// ztoFinans ad alanı: select2 4.0.13 Türkçe metinleri (ZTO select2/js/i18n/tr.js) ve ZTO'nun
// iş yeri seçim kutularındaki ilk seçenekler.
export default {
  // ZTO global select2 kurulumu, _ProductionLayout.cshtml:2342 (_Layout.cshtml:1703).
  placeholder: "Seçiniz...",
  errorLoading: "Sonuç yüklenemedi",
  // select2 tr.js burada da "daha girmelisiniz" yazıyor (anlamca yanlış); düzeltildi.
  inputTooLong: "{{count}} karakter silmelisiniz",
  inputTooShort: "En az {{count}} karakter daha girmelisiniz",
  loadingMore: "Daha fazla…",
  maximumSelected: "Sadece {{count}} seçim yapabilirsiniz",
  noResults: "Sonuç bulunamadı",
  searching: "Aranıyor…",
  removeAllItems: "Tüm öğeleri kaldır",
  // select2 4.1 arama kutusu aria-label'ı (tr.js'de yok, en.js "Search"'e düşüyordu).
  search: "Ara",
  workPlacePlaceholder: "İş Yeri Seçiniz",
  allWorkPlaces: "Tüm İş Yerleri",
  selectWorkPlaceFirst: "Önce iş yeri seçiniz",
  allBranches: "Tüm Şubeler",
  // includeInactive ile listelenen pasif iş yeri etiketinin eki.
  inactiveSuffix: "(Pasif)",
} as const;
