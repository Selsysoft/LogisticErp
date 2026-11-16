import type {
  InstrumentKind,
  InstrumentListItem,
  InstrumentStatus,
} from "../../../../pages/finance/types";

/*
 * Çekler ve Senetler ekranlarının ortak saf mantığı (12.3_TASARIM §5.2; FE-1 ve FE-2 kullanır).
 * Etiketler `ztoFinans:instruments.*` anahtarı olarak döner (ZTO metinleri `locales/tr/ztoFinans/
 * instruments.ts`). Tarihler ISO `YYYY-MM-DD` takvim günüdür (saat dilimi yok).
 */

/** `ztoFinans` ad alanı içindeki anahtar öneki. */
const NS = "instruments";

/** Açık (henüz sonuçlanmamış) durumlar: vade geçmişi ve düzenleme bunlara bakar. */
export const OPEN_STATUSES: readonly InstrumentStatus[] = [
  "PORTFOLIO",
  "AT_BANK",
  "ISSUED",
  "COLLATERAL",
];

export function isOpenStatus(status: InstrumentStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

// ---------------------------------------------------------------------------------------------
// Durum etiketi
// ---------------------------------------------------------------------------------------------

/**
 * Satırdaki durum etiketinin i18n anahtarı (ZTO CheckStatus / BillStatus). Yön etiketi etkilemez
 * (verilen senet ZTO'da da "Portföyde" görünür; tablo §5.2). Yön imzada tutarlılık için durur.
 */
export function statusLabelKey(
  kind: InstrumentKind,
  _direction: InstrumentListItem["direction"],
  status: InstrumentStatus,
): string {
  return `${NS}.status.${kind === "NOTE" ? "note" : "check"}.${status}`;
}

/** Etiketin alt metni (RETURNED → "İade"); yoksa null. */
export function statusSubKey(status: InstrumentStatus): string | null {
  return status === "RETURNED" ? `${NS}.statusSub.RETURNED` : null;
}

/** Kendi çekimiz ödendi ("Çek Ödendi" gradyan rozeti; CHK:745-752). */
export function isOwnCheckPaid(item: Pick<InstrumentListItem, "kind" | "direction" | "status">) {
  return item.kind === "CHECK" && item.direction === "ISSUED" && item.status === "PAID";
}

// ---------------------------------------------------------------------------------------------
// Muhasebe durumu (CHK:42-56, 676-722)
// ---------------------------------------------------------------------------------------------

export type AccountingStatus = {
  labelKey: string;
  /** Bootstrap rozet sınıfı (`badge-info`, …). */
  className: string;
  /** Font Awesome simge sınıfı (`fa-wallet`, …). */
  icon: string;
  /** Yalnız ENDORSED: koyu kullanıcı rozetinin `title` metni (ciro edilen cari). */
  endorsedTo: string | null;
};

export function accountingStatus(
  item: Pick<
    InstrumentListItem,
    "direction" | "status" | "fundAccountId" | "fundKind" | "endorsedAccountName"
  >,
): AccountingStatus {
  const make = (key: string, className: string, icon: string): AccountingStatus => ({
    labelKey: `${NS}.accounting.${key}`,
    className,
    icon,
    endorsedTo: null,
  });
  switch (item.status) {
    case "PORTFOLIO":
      if (item.direction === "RECEIVED") return make("portfolio", "badge-info", "fa-wallet");
      break;
    case "AT_BANK":
      if (item.direction === "RECEIVED") return make("toCollect", "badge-warning", "fa-clock");
      break;
    case "COLLECTED":
    case "COLLECTED_TO_CASH":
      return make("collected", "badge-success", "fa-check-circle");
    case "PAID":
      return make("paid", "badge-success", "fa-check-circle");
    case "ENDORSED":
      return {
        ...make("endorsed", "badge-warning", "fa-exchange-alt"),
        endorsedTo: item.endorsedAccountName,
      };
    case "ISSUED":
      if (item.fundAccountId && item.fundKind === "BANK") {
        return make("payFromBank", "badge-primary", "fa-university");
      }
      if (!item.fundAccountId) return make("payFromCash", "badge-warning", "fa-hand-holding-usd");
      break;
    default:
      break;
  }
  return make("none", "badge-secondary", "fa-question-circle");
}

// ---------------------------------------------------------------------------------------------
// Vade
// ---------------------------------------------------------------------------------------------

/** ISO takvim gününü UTC gün sayısına çevirir (DST ve saat dilimi etkisiz); geçersizde null. */
function dayNumber(iso: string | null | undefined): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000;
}

/** Vadeye kalan gün (`today` → `dueDate`; geçmişte negatif). Tarih geçersizse null. */
export function remainingDays(dueDate: string | null | undefined, today: string): number | null {
  const due = dayNumber(dueDate);
  const now = dayNumber(today);
  return due === null || now === null ? null : due - now;
}

/** Kalan gün rozeti: < 0 `badge-danger`, ≤ 7 `badge-warning`, diğer `badge-info` (CHK:762-776). */
export function dueBadgeClass(days: number | null): string {
  if (days === null) return "badge-secondary";
  if (days < 0) return "badge-danger";
  if (days <= 7) return "badge-warning";
  return "badge-info";
}

/** Açık durumda ve vadesi bugünden önce (geciken satır `table-danger`). */
export function isOverdue(
  item: Pick<InstrumentListItem, "status" | "dueDate">,
  today: string,
): boolean {
  const days = remainingDays(item.dueDate, today);
  return isOpenStatus(item.status) && days !== null && days < 0;
}

// ---------------------------------------------------------------------------------------------
// Taraflar ve tutulma yeri
// ---------------------------------------------------------------------------------------------

export type PartyColumns = {
  /** Keşideci (maskeli satırda null → ekranda "—"). */
  drawer: string | null;
  /** Keşidecinin ikinci satırı (verilen çekte iş yeri). */
  drawerSub: string | null;
  /** İlk Lehdar. */
  firstPayee: string | null;
  /** Çek Sahibi: `ownCheck` rozeti "Kendi Çekimiz"; `endorsed` rozeti "Ciro Edildi" + ad. */
  holder: {
    kind: "company" | "endorsed" | "ownCheck";
    name: string | null;
    badgeKey: string | null;
  };
};

export function partyColumns(
  item: Pick<
    InstrumentListItem,
    | "direction"
    | "status"
    | "drawerName"
    | "accountName"
    | "endorsedAccountName"
    | "companyName"
    | "branchName"
  >,
): PartyColumns {
  if (item.direction === "ISSUED") {
    return {
      drawer: item.companyName,
      drawerSub: item.branchName,
      firstPayee: item.accountName,
      holder: { kind: "ownCheck", name: null, badgeKey: `${NS}.party.ownCheck` },
    };
  }
  return {
    drawer: item.drawerName ?? item.accountName,
    drawerSub: null,
    firstPayee: item.accountName,
    holder:
      item.status === "ENDORSED"
        ? { kind: "endorsed", name: item.endorsedAccountName, badgeKey: `${NS}.party.endorsed` }
        : { kind: "company", name: item.companyName, badgeKey: null },
  };
}

export type HoldingPlace = {
  kind: "custody" | "bank" | "endorsed" | "none";
  /** Emanet kasasının adı (yalnız `custody`). */
  name: string | null;
  /** `custody` dışında gösterilecek metin anahtarı. */
  labelKey: string | null;
};

/** "Tutulma Yeri": emanet kasası rozeti, "Bankada", "Ciro Edildi" ya da "-". */
export function holdingPlace(
  item: Pick<InstrumentListItem, "status" | "custodyFundName">,
): HoldingPlace {
  if (item.custodyFundName) return { kind: "custody", name: item.custodyFundName, labelKey: null };
  if (item.status === "AT_BANK")
    return { kind: "bank", name: null, labelKey: `${NS}.holding.bank` };
  if (item.status === "ENDORSED") {
    return { kind: "endorsed", name: null, labelKey: `${NS}.holding.endorsed` };
  }
  return { kind: "none", name: null, labelKey: `${NS}.holding.none` };
}

// ---------------------------------------------------------------------------------------------
// Satır menüsü
// ---------------------------------------------------------------------------------------------

export type InstrumentMenuVariant = "check" | "bill";

export type InstrumentMenuItem =
  | { action: "transition"; target: InstrumentStatus; labelKey: string }
  /** "Kasaya Al (Ciro)": durum modalı "Kasaya Al (Ciro - Tahsil Edildi)" seçili → PUT custody. */
  | { action: "custody"; target: null; labelKey: string }
  /** Köken ödeme kaydının iptali (12.2a `ReverseSettlementModal`, `originSettlementId`). */
  | { action: "cancelSettlement"; target: null; labelKey: string; settlementId: string };

type MenuKey = InstrumentStatus | "custody" | "cancelSettlement";

/** ZTO menü sırası (CHK:866-1081; BIL:3300-3420 + BR ekleri sonda). */
const MENU_ORDER: Record<InstrumentMenuVariant, readonly MenuKey[]> = {
  check: [
    "AT_BANK",
    "COLLECTED_TO_CASH",
    "COLLECTED",
    "PAID",
    "BOUNCED",
    "PROTESTED",
    "COLLATERAL",
    "PORTFOLIO",
    "custody",
    "RETURNED",
    "cancelSettlement",
  ],
  bill: [
    "COLLATERAL",
    "COLLECTED",
    "PAID",
    "PROTESTED",
    "PORTFOLIO",
    "RETURNED",
    "cancelSettlement",
    "COLLECTED_TO_CASH",
    "AT_BANK",
    "BOUNCED",
  ],
};

/**
 * Satır menüsünün durum öğeleri: yalnız sunucunun `allowedTransitions` hedefleri (ENDORSED ve
 * CANCELLED transition ucuyla yapılamaz, atlanır). Ek öğeler:
 * - `cancelSettlement`: verilen çek/senet açık (ISSUED) ve köken kaydı POSTED;
 * - `custody` (yalnız çek): alınan çek PORTFOLIO.
 * Maskeli (personel carili) satırda menü boştur (yalnız "Hareket Geçmişi", sayfa ekler).
 */
export function transitionMenu(
  item: Pick<
    InstrumentListItem,
    | "direction"
    | "status"
    | "allowedTransitions"
    | "originSettlementId"
    | "originSettlementStatus"
    | "employeeMasked"
  >,
  variant: InstrumentMenuVariant,
): InstrumentMenuItem[] {
  if (item.employeeMasked) return [];
  const label = (key: MenuKey) => `${NS}.menu.${variant}.${key}`;
  const entries = new Map<MenuKey, InstrumentMenuItem>();
  for (const target of item.allowedTransitions ?? []) {
    if (target === "ENDORSED" || target === "CANCELLED") continue;
    entries.set(target, { action: "transition", target, labelKey: label(target) });
  }
  if (
    item.direction === "ISSUED" &&
    item.status === "ISSUED" &&
    item.originSettlementId &&
    item.originSettlementStatus === "POSTED"
  ) {
    entries.set("cancelSettlement", {
      action: "cancelSettlement",
      target: null,
      labelKey: label("cancelSettlement"),
      settlementId: item.originSettlementId,
    });
  }
  if (variant === "check" && item.direction === "RECEIVED" && item.status === "PORTFOLIO") {
    entries.set("custody", { action: "custody", target: null, labelKey: label("custody") });
  }
  return MENU_ORDER[variant].flatMap((key) => {
    const entry = entries.get(key);
    return entry ? [entry] : [];
  });
}

/** Düzenle bağlantısı görünür mü (iptal/iade edilmiş ve maskeli satırda gizli). */
export function canEditInstrument(
  item: Pick<InstrumentListItem, "status" | "employeeMasked">,
): boolean {
  return !item.employeeMasked && item.status !== "CANCELLED" && item.status !== "RETURNED";
}

/** Senet türü etiketi anahtarı; tür yoksa null. */
export function noteTypeLabelKey(noteType: InstrumentListItem["noteType"]): string | null {
  return noteType ? `${NS}.noteType.${noteType}` : null;
}
