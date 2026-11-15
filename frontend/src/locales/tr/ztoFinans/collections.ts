// ztoFinans ad alanı, "collections" parçası (12.2a_TASARIM §5.6, §5.11, §5.12: Tahsilatlar listesi,
// Döviz Bozum hücresi, detay ve silme modalları, Günlük Tahsilat Raporu modalı). ZTO
// Views/CustomerAccountCollection/Collections.cshtml ve wwwroot/js/zt/collections/collections.js
// metinleri birebir (süzgeç etiketlerinin büyük/küçük harf karışıklığı ZTO'daki gibi). İki listenin
// ortak metinleri payments.ts `list` alt ağacındadır.
export default {
  header: {
    title: "Tahsilat Yönetimi",
    finance: "Finans",
    crumb: "Tahsilatlar",
    back: "Geri",
    backTitle: "Cari Listesine Dön",
    chipMethods: "Çoklu Yöntem",
    chipFilter: "Aktif Filtreleme",
    newItem: "Yeni Tahsilat",
    payments: "Ödemeler",
    paymentsTitle: "Ödeme Yönetimi",
    checks: "Çekler",
    checksTitle: "Çek Yönetimi",
    notes: "Senetler",
    notesTitle: "Senet Yönetimi",
    daily: "Günlük Tahsilat Raporu",
    excel: "Excel",
    excelTitle: "Excel'e Aktar",
    print: "Yazdır",
  },
  filter: {
    account: "CARİ HESAP",
    group: "Hesap Grubu",
    allGroups: "Tüm Hesap Grupları",
    workPlace: "İŞ YERİ",
    start: "Başlangıç",
    end: "BİTİŞ",
    method: "TAHSİLAT YÖNTEMİ",
    allMethods: "Tüm Yöntemler",
  },
  table: {
    method: "Tahsilat Yöntemi",
    fx: "Döviz Bozum",
  },
  accounting: {
    regular: "Cari Tahsilat",
    check: "Çek Tahsil",
    note: "Senet Tahsil",
  },
  fx: {
    notFx: "Döviz Değil",
    waiting: "Bekliyor",
    partial: "Kısmi Bozum",
    done: "Tamamlandı",
    transfers: "Transferler",
    exchange: "Boz",
    rate: "Kur: {{rate}}",
  },
  detail: {
    title: "Tahsilat Detayı",
    info: "Tahsilat Bilgileri",
    notFound: "Tahsilat bilgileri alınamadı.",
  },
  reverse: {
    title: "Tahsilat Silme Onayı",
    message: "{{amount}} {{currency}} tutarındaki tahsilatı silmek istediğinize emin misiniz?",
    methodLabel: "Tahsilat Yöntemi:",
    done: "Tahsilat başarıyla silindi.",
  },
  dailyModal: {
    title: "Günlük Tahsilat Raporu",
    help: "Seçtiğiniz güne ait tahsilatlar, oluşturulma saatine göre listelenir.",
    submit: "Günlük Tahsilat Raporu Al",
  },
  excelFile: "Tahsilatlar",
} as const;
