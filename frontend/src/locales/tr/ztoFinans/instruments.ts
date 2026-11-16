// ztoFinans ad alanı, "instruments" parçası (12.3_TASARIM §5.2, §5.11): Çekler ve Senetler ekranlarının
// ortak durum, muhasebe durumu, senet türü, menü etiketleri ve hata kodu iletileri. ZTO
// Views/Checks/Checks.cshtml ve Views/Bills/Bills.cshtml metinleri birebir; `instrumentLogic.ts`
// anahtarları buradan üretir.
export default {
  /** Satırdaki durum etiketi (`statusLabelKey`; ZTO CheckStatus / BillStatus). */
  status: {
    check: {
      PORTFOLIO: "Portföyde",
      AT_BANK: "Bankada",
      COLLECTED: "Tahsil Edildi",
      COLLECTED_TO_CASH: "Tahsil Edildi",
      ENDORSED: "Ciro Edildi",
      ISSUED: "Kullanıldı",
      PAID: "Tahsil Edildi",
      BOUNCED: "Karşılıksız",
      PROTESTED: "Protestolu",
      RETURNED: "İptal",
      CANCELLED: "İptal",
      COLLATERAL: "Teminata Verildi",
    },
    note: {
      PORTFOLIO: "Portföyde",
      AT_BANK: "Bankada",
      COLLECTED: "Ödendi",
      COLLECTED_TO_CASH: "Ödendi",
      ENDORSED: "Ciro Edildi",
      ISSUED: "Portföyde",
      PAID: "Ödendi",
      BOUNCED: "Karşılıksız",
      PROTESTED: "Protestolu",
      RETURNED: "İptal",
      CANCELLED: "İptal",
      COLLATERAL: "Teminata Verildi",
    },
  },
  /** Durum etiketinin alt metni (keşideciye iade). */
  statusSub: {
    RETURNED: "İade",
  },
  /** Kendi çekimiz + PAID rozeti (CHK:745-752). */
  paidBadge: "Çek Ödendi",
  paidBadgeTitle: "Kendi çekimiz tahsil edildi — borç ödendi",
  /** "Muhasebe Durumu" sütunu (`accountingStatus`; CHK:42-56, 676-722). */
  accounting: {
    portfolio: "Portföyde (Elde)",
    toCollect: "Tahsil Edilecek",
    collected: "Tahsil Edildi",
    paid: "Ödendi",
    endorsed: "Ciro Edildi",
    payFromBank: "Bankadan Ödenecek",
    payFromCash: "Kasadan Ödenecek",
    none: "-",
  },
  /** Taraf sütunları (`partyColumns`). */
  party: {
    ownCheck: "Kendi Çekimiz",
    endorsed: "Ciro Edildi",
  },
  /** "Tutulma Yeri" (`holdingPlace`). */
  holding: {
    bank: "Bankada",
    endorsed: "Ciro Edildi",
    none: "-",
  },
  /** Senet türü (ZTO `BillTypeModal`; BIL:651-655). */
  noteType: {
    PLAIN: "Adi Senet",
    ORDER: "Emre Yazılı Senet",
    BOND: "Bono",
  },
  /** Teminat sütunu. */
  collateral: {
    normal: "Normal",
    collateral: "Teminatlı",
  },
  /** Satır menüsü (`transitionMenu`; CHK:866-1081, BIL:3300-3420). */
  menu: {
    check: {
      AT_BANK: "Bankaya Yatır",
      COLLECTED_TO_CASH: "Kasaya Tahsil Et",
      COLLECTED: "Bankaya Tahsil Et",
      PAID: "Çek Ödendi İşaretle",
      BOUNCED: "Karşılıksız",
      PROTESTED: "Protestolu Olarak İşaretle",
      COLLATERAL: "Teminata Ver",
      PORTFOLIO: "Portföye Geri Al",
      RETURNED: "İptal Et",
      custody: "Kasaya Al (Ciro)",
      cancelSettlement: "İptal Et",
    },
    bill: {
      COLLATERAL: "Teminata Ver",
      COLLECTED: "Ödendi Olarak İşaretle",
      PAID: "Ödendi Olarak İşaretle",
      PROTESTED: "Protestolu Olarak İşaretle",
      PORTFOLIO: "Portföye Geri Al",
      RETURNED: "İptal Et",
      cancelSettlement: "İptal Et",
      COLLECTED_TO_CASH: "Kasaya Tahsil Et",
      AT_BANK: "Bankaya Yatır",
      BOUNCED: "Karşılıksız",
    },
  },
  /** 12.3 hata kodları (§3.11; ZTO metni varsa o). */
  errors: {
    CHECK_NUMBER_INVALID: "Çek numarası 7 haneli sayısal değer olmalıdır.",
    INSTRUMENT_DATES_INVALID: "Vade tarihi, keşide tarihinden önce olamaz!",
    INSTRUMENT_CUSTODY_INVALID: "Çekin tutulduğu kasa yalnız portföydeki çekte seçilir.",
    NOTE_TYPE_INVALID: "Senet türü yalnız senette seçilir.",
    CHECK_LEAF_INVALID: "Koçan yaprağı yalnız kendi çekimizle ödemede seçilir.",
    FUND_MISMATCH: "Çek başka bankada.",
    CHECK_LEAF_NOT_FOUND: "Kayıt bulunamadı.",
    CHECK_BOOK_NOT_FOUND: "Kayıt bulunamadı.",
    INSTRUMENT_NUMBER_TAKEN: "Bu çek numarası zaten kullanılıyor!",
    CHECK_LEAF_USED: "Bu çek zaten kullanılmış (ödemesi mevcut), tekrar kullanılamaz.",
    CHECK_NUMBER_IN_CHECK_BOOK:
      "Bu çek numarası koçan yaprağı olarak kayıtlı — manuel olarak kullanılamaz, lütfen koçandan seçiniz.",
    INSTRUMENT_CANCEL_VIA_SETTLEMENT: "Çek/senet ödeme ya da tahsilat kaydından iptal edilir.",
    INSTRUMENT_NOT_EDITABLE: "Bu çek/senet düzenlenemez.",
    INSTRUMENT_LEAF_NUMBER_LOCKED: "Koçandan seçilen çekin numarası değiştirilemez.",
    SETTLEMENT_CHECK_NOT_REVERSIBLE: "Çek/senet işlem gördü; önce çekin durumunu güncelleyin.",
    CHECK_LEAF_MISMATCH: "Seçilen koçan yaprağı bu banka hesabına ait değil.",
  },
  /** İstemci kipi sınırı (OK-12.3-15). */
  truncated: "İlk 5.000 kayıt gösteriliyor.",
};
