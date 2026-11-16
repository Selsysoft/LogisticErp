import type {
  InstrumentKind,
  InstrumentListItem,
  InstrumentNumberCheck,
  InstrumentUpdateBody,
  NoteType,
} from "../../../../pages/finance/types";
import { errorCode, errorMessage } from "../../../components/definitionLogic";
import { collectionsPath, paymentsPath } from "../../navItems";
import { isOpenStatus, remainingDays } from "./instrumentLogic";

/*
 * Çek / Senet Düzenle (ZTO Checks/EditCheck, Bills/EditBill; 12.3_TASARIM §5.7) saf mantığı. Yalnız
 * finansal olmayan alanlar PATCH ile değişir (tutar, para birimi, cari köken kaydın düzeltmesiyle);
 * gövdede yalnız değişen alanlar gider. ZTO native alert'leri alan hatası olur (ECK:375-490).
 */

export type EditForm = {
  number: string;
  bankName: string;
  bankBranch: string;
  issueDate: string;
  dueDate: string;
  drawerName: string;
  description: string;
  noteType: NoteType | "";
};

export function formFromItem(item: InstrumentListItem): EditForm {
  return {
    number: item.number ?? "",
    bankName: item.bankName ?? "",
    bankBranch: item.bankBranch ?? "",
    issueDate: item.issueDate ?? "",
    dueDate: item.dueDate ?? "",
    drawerName: item.drawerName ?? "",
    description: item.description ?? "",
    noteType: item.noteType ?? "",
  };
}

/** Çek numarası girişi: yalnız rakam, en çok 7 hane (ECK setupCheckNumberValidation). */
export function sanitizeCheckNumber(value: string): string {
  return value.replace(/[^0-9]/g, "").slice(0, 7);
}

/**
 * Değişen alanlar (PATCH). Metinler kırpılır; `bankBranch`/`drawerName`/`description` boşaltılırsa ""
 * gider (sunucu NULL yapar). `number`/`dueDate` boşsa gönderilmez (doğrulama zaten engeller).
 * `noteType` yalnız senette, `drawerName` yalnız alınan çek/senette.
 */
export function diffBody(
  item: InstrumentListItem,
  original: EditForm,
  form: EditForm,
): InstrumentUpdateBody {
  const body: InstrumentUpdateBody = {};
  const text = (key: keyof EditForm) => (form[key] ?? "").trim();
  const changed = (key: keyof EditForm) => text(key) !== (original[key] ?? "").trim();
  if (changed("number") && text("number")) body.number = text("number");
  if (changed("bankName") && text("bankName")) body.bankName = text("bankName");
  if (changed("bankBranch")) body.bankBranch = text("bankBranch");
  if (changed("issueDate") && text("issueDate")) body.issueDate = text("issueDate");
  if (changed("dueDate") && text("dueDate")) body.dueDate = text("dueDate");
  if (item.direction === "RECEIVED" && changed("drawerName")) body.drawerName = text("drawerName");
  if (changed("description")) body.description = text("description");
  if (item.kind === "NOTE" && changed("noteType") && form.noteType) body.noteType = form.noteType;
  return body;
}

export function isEmptyBody(body: InstrumentUpdateBody): boolean {
  return Object.keys(body).length === 0;
}

export type EditErrors = Partial<Record<"number" | "bankName" | "dueDate", string>>;

/**
 * Alan hataları (i18n anahtarı, `editInstrument.*`). Çekte numara 7 hane (ZTO sırası: boş → uzunluk →
 * rakam), banka adı zorunlu; vade zorunlu ve keşide/düzenlenme tarihinden önce olamaz.
 */
export function validateEdit(kind: InstrumentKind, form: EditForm): EditErrors {
  const errors: EditErrors = {};
  const number = form.number.trim();
  if (kind === "CHECK") {
    if (!number) errors.number = "numberRequired";
    else if (number.length !== 7) errors.number = "numberLength";
    else if (!/^\d{7}$/.test(number)) errors.number = "numberDigits";
    if (!form.bankName.trim()) errors.bankName = "bankNameRequired";
  } else if (!number) {
    errors.number = "bill.numberRequired";
  }
  if (!form.dueDate) errors.dueDate = "dueDateRequired";
  else if (form.issueDate && form.dueDate < form.issueDate) {
    errors.dueDate = kind === "NOTE" ? "bill.datesInvalid" : "check.datesInvalid";
  }
  return errors;
}

/** Tekillik ön denetimi gerekir mi: çekte, numara geçerli ve özgün numaradan farklı. */
export function needsNumberCheck(kind: InstrumentKind, original: string, number: string): boolean {
  const value = number.trim();
  return kind === "CHECK" && /^\d{7}$/.test(value) && value !== original.trim();
}

/** Çakışma iletisinin parametreleri; çakışma yoksa null. */
export function numberConflict(
  check: InstrumentNumberCheck | undefined,
): { account: string; status: InstrumentNumberCheck["conflictStatus"] } | null {
  if (!check || check.available) return null;
  return { account: check.conflictAccountName ?? "-", status: check.conflictStatus };
}

export type RemainingView = { days: number | null; expired: boolean; color: string };

/** "Vadeye Kalan Gün": ≥ 0 "N gün", < 0 "Günü Doldu"; renk kırmızı/turuncu/yeşil (ECK). */
export function remainingView(dueDate: string, today: string): RemainingView {
  const days = remainingDays(dueDate, today);
  if (days === null) return { days: null, expired: false, color: "" };
  if (days < 0) return { days, expired: true, color: "red" };
  return { days, expired: false, color: days <= 7 ? "orange" : "green" };
}

/** Vade düzenlenebilir mi (açık durumlar; OK-12.3-14). */
export function canEditDueDate(item: Pick<InstrumentListItem, "status">): boolean {
  return isOpenStatus(item.status);
}

/** Koçandan seçilen çekin numarası kilitli (INSTRUMENT_LEAF_NUMBER_LOCKED). */
export function numberLocked(item: Pick<InstrumentListItem, "checkLeafId">): boolean {
  return item.checkLeafId !== null && item.checkLeafId !== undefined;
}

/**
 * Köken kaydı düzeltilebilir görünüyor mu ("Düzelt (ters kayıt + yeni)" bağlantısı). Kesin karar
 * sunucudadır (settlementReversible): köken kaydı POSTED ve çek ilk durumunda (alınan: portföy ya da
 * bankada; verilen: kullanıldı).
 */
export function correctionPath(item: InstrumentListItem): string | null {
  if (!item.originSettlementId || item.originSettlementStatus !== "POSTED") return null;
  const initial =
    item.direction === "ISSUED"
      ? item.status === "ISSUED"
      : item.status === "PORTFOLIO" || item.status === "AT_BANK";
  if (!initial) return null;
  return item.direction === "ISSUED"
    ? paymentsPath({ openEditPayment: true, paymentId: item.originSettlementId })
    : collectionsPath({ openEditCollection: true, collectionId: item.originSettlementId });
}

/**
 * "İptal Et" düğmesinin eylemi (ZTO "Çeki Sil"/"Senedi Sil" yerine; ters kayıt):
 * - alınan + portföyde + `RETURNED` izinli → keşideciye iade onayı;
 * - verilen + kullanıldı + köken kaydı POSTED → köken ödemenin iptali (`ReverseSettlementModal`);
 * - diğer → düğme çizilmez.
 */
export function cancelAction(
  item: InstrumentListItem,
): { kind: "return" } | { kind: "reverse"; settlementId: string } | null {
  if (item.employeeMasked) return null;
  if (
    item.direction === "RECEIVED" &&
    item.status === "PORTFOLIO" &&
    item.allowedTransitions.includes("RETURNED")
  ) {
    return { kind: "return" };
  }
  if (
    item.direction === "ISSUED" &&
    item.status === "ISSUED" &&
    item.originSettlementId &&
    item.originSettlementStatus === "POSTED"
  ) {
    return { kind: "reverse", settlementId: item.originSettlementId };
  }
  return null;
}

/**
 * Sunucu hata metni: kod varsa sırayla `<önek>.errors.<KOD>` anahtarları (§3.11 iletileri; ilk bulunan),
 * yoksa sunucu iletisi, o da yoksa `fallback`. `lookup` anahtar yoksa null döner (i18n.exists).
 */
export function errorTextOf(
  error: unknown,
  fallback: string,
  prefixes: readonly string[],
  lookup: (key: string) => string | null,
): string {
  const code = errorCode(error);
  if (code) {
    for (const prefix of prefixes) {
      const text = lookup(`${prefix}.errors.${code}`);
      if (text) return text;
    }
  }
  return errorMessage(error, fallback);
}
