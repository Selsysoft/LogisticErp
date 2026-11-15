import type {
  Account,
  AccountType,
  AllocationBody,
  Fund,
  FundKind,
  Instrument,
  PayMethod,
  Settlement,
  SettlementType,
} from "../../../../pages/finance/types";

/*
 * Ödeme / tahsilat modallarının ortak giriş noktası (12.2a_TASARIM §5.7–§5.10). Prop tipleri FE-0'da
 * DONMUŞTUR: FE-1 sayfaları (`settlements/**`) ve FE-3 (`FundTransactionsPage`) modalları yalnız bu
 * dosyadan içe aktarır. Gövde FE-2'nindir: bileşenler ayrı `.tsx` dosyalarına yazılıp buradan yeniden
 * dışa aktarılır; aşağıdaki `return null` saplamaları o zamana dek derlemeyi ve paralel çalışmayı
 * sağlar. Arayüz (interface) dışa aktarılmaz (ZTO sayfa kuralı; sözleşme testi taramaz).
 * FE-2 teslimi: saplamalar gerçek bileşenlerle değiştirildi (dosyanın sonundaki yeniden dışa aktarımlar).
 */

// ---------------------------------------------------------------------------------------------
// Ödeme / tahsilat modalları (§5.7, §5.8)
// ---------------------------------------------------------------------------------------------

/** `PaymentModal` (ZTO `#addPaymentModal` / `#editPaymentModal`). */
export type PaymentModalProps = {
  show: boolean;
  onHide: () => void;
  mode: "add" | "edit";
  /** edit: düzeltilecek kayıt (`GET /settlements/{id}`; `correctable=false` ise modal açılmaz). */
  settlementId?: string;
  /** Ön değerler (derin bağlantı `id`, `workPlaceId`, `bankId`/`cashId`, `paymentMethod`, `currencyId`). */
  presetAccountId?: string;
  presetBranchId?: string;
  presetFundAccountId?: string;
  presetMethod?: PayMethod;
  presetCurrency?: string;
  /** Barındıran sayfa listeyi tazeler (ek olarak mutasyon ["finance"]'ı geçersizler). */
  onSaved?: (s: Settlement) => void;
};

/** `CollectionModal` (ZTO `#addCollectionModal` / `#editCollectionModal`); `PaymentModalProps` ile aynı yapı. */
export type CollectionModalProps = {
  show: boolean;
  onHide: () => void;
  mode: "add" | "edit";
  settlementId?: string;
  presetAccountId?: string;
  presetBranchId?: string;
  presetFundAccountId?: string;
  /** Tahsilat yöntemi (Banka/Kasa Hareketleri'nden `collectionMethod`). */
  presetMethod?: PayMethod;
  presetCurrency?: string;
  onSaved?: (s: Settlement) => void;
};

/**
 * `PostPaymentPlanningModal` (ZTO `#postPaymentPlanningModal`, §5.10): yalnız add kipinde ödeme 201
 * döndükten sonra `postPlanningLogic.shouldOffer` doğruysa açılır.
 */
export type PostPaymentPlanningModalProps = {
  show: boolean;
  onHide: () => void;
  /** Yapılan ödeme (şirket ve para birimi tetiğin ve kalan borç listesinin kaynağı). */
  settlement: Settlement;
  /** "CARİ HESAP" özeti (ad + kod). */
  account: Pick<Account, "id" | "code" | "name" | "type">;
  /** Planlar kaydedildikten sonra (kısmi başarı dahil). */
  onSaved?: () => void;
};

// ---------------------------------------------------------------------------------------------
// Alt bileşenler (§5.9)
// ---------------------------------------------------------------------------------------------

/** `FundSelect`: iş yeri + tür + aktif süzgeçli banka/kasa seçici (OK-12.2a-13). */
export type FundSelectProps = {
  /** Tetikleyici kimliği (ZTO `#CashID`, `#BankID`, …). */
  id: string;
  kind: FundKind;
  /** Boşken tek seçenek "Önce iş yeri seçiniz" ve devre dışı. */
  branchId: string | null | undefined;
  /** Yalnız ciro kilidinde (seçilen çekin para birimi). */
  currency?: string | null;
  /** Fon sorgusunun şirketi (edit: kaydın şirketi; §5.7 Rev 1 F5); undefined → aktif şirket. */
  companyId?: string | null;
  value: string;
  /** Seçimle birlikte fon (para birimi kilidi için); temizlenince `("", null)`. */
  onChange: (fundAccountId: string, fund: Fund | null) => void;
  disabled?: boolean;
  /** Görünür etiketin kimliği (`aria-labelledby`). */
  ariaLabelledBy?: string;
};

/** `CounterpartyBankSelect`: carinin banka hesapları (maskeli IBAN; OK-12.2a-14). */
export type CounterpartyBankSelectProps = {
  id?: string;
  accountId: string | null | undefined;
  /** EMPLOYEE iken açıklama cümlesi yazılmaz (Rev 1 SEC-01). */
  accountType?: AccountType | null;
  /** Cümledeki tarih (ISO `YYYY-MM-DD`; ödeme/tahsilat tarihi). */
  date?: string;
  value: string;
  onChange: (counterpartyBankAccountId: string) => void;
  /**
   * Seçimde üretilen otomatik açıklama cümlesi ("[{banka} - {şube}] - {gg/AA/yyyy} - {maskeli IBAN}
   * iban bilgisine sahip hesaba yatırılmıştır."); seçim kalkınca ya da personel carisinde `null`.
   * Açıklama alanına ekleme / önceki cümlenin yerine koyma çağıranın işidir.
   */
  onDescription?: (sentence: string | null) => void;
  disabled?: boolean;
};

/** `RemainingDebtPanel` (`#remainingDebtInfo`, ödeme modalı). */
export type RemainingDebtPanelProps = {
  accountId: string;
  /** Kalan borcun hesaplandığı şirket (null → konsolide). */
  companyId: string | null;
};

/** `RemainingCreditPanel` (`#remainingCreditInfo > #customerCreditInfoContainer`, tahsilat modalı). */
export type RemainingCreditPanelProps = {
  accountId: string;
  companyId: string | null;
};

/** Ödeme çeki türü: "Kendi Çekimiz" / "Müşteri Çeki Ciro Et". */
export type IssuedCheckMode = "OWN" | "ENDORSE";
/**
 * Tahsilat çek durumu: "Bankaya Yatırıldı" (AT_BANK) / "Portföyde (Elde)" (PORTFOLIO) / "Kasaya Al
 * (Ciro)" (CASH_BOX → gövdede `initialStatus: "PORTFOLIO"`, kasa 12.3).
 */
export type ReceivedCheckStatus = "AT_BANK" | "PORTFOLIO" | "CASH_BOX";

/** `CheckFields` form değeri (tarihler ISO; 12.3 alanları — keşide, açıklama, koçan — yok). */
export type CheckFieldsValue = {
  /** Yalnız `variant="issued"`. */
  mode: IssuedCheckMode;
  /** Yalnız `variant="received"`. */
  status: ReceivedCheckStatus;
  /** issued + ENDORSE: ciro edilecek portföy çeki. */
  instrumentId: string;
  /** issued + OWN: "İş Yeri Bankası"; received + AT_BANK: "Çekin Yatırıldığı Banka Hesabı". */
  fundAccountId: string;
  /** 7 hane (`^\d{7}$`, yalnız istemci — OK-12.2a-10). */
  number: string;
  /** issued: seçilen fonun banka adı (salt okunur); received: "Çekin Bankası". */
  bankName: string;
  /** Vade (varsayılan bugün + 30, yerel takvim). */
  dueDate: string;
};

/** Alan → gösterilecek ZTO doğrulama metni (etkileşim/gönderim sonrası; `fieldA11yProps`). */
export type FieldErrors<T> = Partial<Record<keyof T, string>>;

/** `CheckFields` (issued: APM:706-917; received: CMP:417-616). */
export type CheckFieldsProps = {
  variant: "issued" | "received";
  value: CheckFieldsValue;
  onChange: (value: CheckFieldsValue) => void;
  /** Ödeme/tahsilat iş yeri (banka seçicisi bu iş yerine süzülür). */
  branchId: string;
  /** Fon ve ciro edilebilir çek sorgularının şirketi. */
  companyId: string | null;
  /** Ödeme para birimi (ciro listesi süzgeci). */
  currency: string;
  /** Ciro edilecek çek seçilince (tutar ve para birimi kilidi); kaldırılınca null. */
  onEndorsedCheck?: (instrument: Instrument | null) => void;
  errors?: FieldErrors<CheckFieldsValue>;
  disabled?: boolean;
};

/** `NoteFields` form değeri. */
export type NoteFieldsValue = {
  /** issued: "İş Yeri Bankası (Opsiyonel)". */
  fundAccountId: string;
  /** Serbest metin ≤ 50. */
  number: string;
  /** issued: seçilen fonun banka adı (salt okunur); received: "Banka Adı". */
  bankName: string;
  dueDate: string;
};

/** `NoteFields` (issued: APM:919-1019; received: CMP). */
export type NoteFieldsProps = {
  variant: "issued" | "received";
  value: NoteFieldsValue;
  onChange: (value: NoteFieldsValue) => void;
  /** issued: "Keşideci (İş Yeri)" bu iş yerine kilitli. */
  branchId: string;
  companyId: string | null;
  /** received: "Keşideci (Cari Hesap)" bu cariye kilitli (seçenek metni). */
  accountLabel?: string;
  errors?: FieldErrors<NoteFieldsValue>;
  disabled?: boolean;
};

/**
 * `InvoiceAllocationTable` ("Fatura Eşleştirme (Opsiyonel)"; OK-12.2a-2). `value` seçili satırlar
 * (`amount` ondalık metin; gövdeye yalnız > 0 olanlar gider). Kaynak `useOpenInvoices` yalnız
 * "Faturaları Yükle" tıklanınca.
 */
export type InvoiceAllocationTableProps = {
  type: SettlementType;
  accountId: string | null | undefined;
  branchId: string | null | undefined;
  currency: string;
  /** Ödeme/tahsilat tutarı (ondalık metin; boş = 0). */
  settlementAmount: string;
  /** Düzenlemede kaydın kendi eşleşmeleri açık kalemden düşülmez. */
  excludeSettlementId?: string;
  value: AllocationBody[];
  onChange: (value: AllocationBody[]) => void;
  /** Toplam eşleştirme tutarı tahsilat/ödeme tutarını aşıyor mu (gönderim engeli için). */
  onExceededChange?: (exceeded: boolean) => void;
  disabled?: boolean;
  /**
   * FE-2 eki (geriye uyumlu, isteğe bağlı): öğe kimliklerinin öneki. Düzenleme modalında "edit"
   * (`#editInvoiceAllocationSection`, ZTO CMP `edit…` deseni); varsayılan "".
   */
  idPrefix?: string;
};

// ---------------------------------------------------------------------------------------------
// Bileşenler (FE-2): her biri kendi `.tsx` dosyasında; tüketiciler yalnız bu dosyadan içe aktarır.
// ---------------------------------------------------------------------------------------------

export { PaymentModal } from "./PaymentModal";
export { CollectionModal } from "./CollectionModal";
export { PostPaymentPlanningModal } from "./PostPaymentPlanningModal";
export { FundSelect } from "./FundSelect";
export { CounterpartyBankSelect } from "./CounterpartyBankSelect";
export { RemainingDebtPanel } from "./RemainingDebtPanel";
export { RemainingCreditPanel } from "./RemainingCreditPanel";
export { CheckFields } from "./CheckFields";
export { NoteFields } from "./NoteFields";
export { InvoiceAllocationTable } from "./InvoiceAllocationTable";
