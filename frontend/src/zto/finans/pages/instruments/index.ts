import type {
  InstrumentKind,
  InstrumentListItem,
  InstrumentMovement,
} from "../../../../pages/finance/types";

/*
 * Çek / senet ekranlarının ortak giriş noktası (12.3_TASARIM §5.1, §5.2). Prop tipleri FE-0'da
 * DONMUŞTUR: FE-1 (Çekler, M2 hareket modalı, rapor) ve FE-2 (Senetler, Koçanlar, Düzenle, Belgeler)
 * ortak bileşenleri bu tiplerle yazar; FE-2 `InstrumentMovementsModal`'ı FE-1'den yalnız içe aktarır.
 * Arayüz (interface) dışa aktarılmaz (ZTO sayfa kuralı; sözleşme testi taramaz).
 */

/**
 * `EditInstrumentPage` (ZTO Checks/EditCheck, Bills/EditBill): rota `kind` ile ayrılır (varsayılan
 * CHECK; `lazyPage` isteğe bağlı prop ister, `DailySettlementReportPage` emsali).
 */
export type EditInstrumentPageProps = {
  kind?: InstrumentKind;
};

/**
 * `InstrumentMovementsModal` (M2, "Hareket Geçmişi"; FE-1 yazar, Bills de kullanır). Hareketler
 * `useInstrumentMovements(instrument.id)` ile modal içinde okunur; `movements` verilirse sorgu
 * atılmaz (detay yanıtından gelen liste).
 */
export type InstrumentMovementsModalProps = {
  show: boolean;
  onHide: () => void;
  instrument: InstrumentListItem | null;
  movements?: InstrumentMovement[];
};

/** Satır menüsünün çağırdığı eylem (sayfa modalları açar; FE-1/FE-2 ortak). */
export type InstrumentRowAction =
  | { type: "transition"; item: InstrumentListItem; target: InstrumentListItem["status"] }
  | { type: "custody"; item: InstrumentListItem }
  | { type: "cancelSettlement"; item: InstrumentListItem; settlementId: string }
  | { type: "movements"; item: InstrumentListItem }
  | { type: "detail"; item: InstrumentListItem }
  | { type: "documents"; item: InstrumentListItem }
  | { type: "edit"; item: InstrumentListItem };

export * from "./instrumentLogic";
