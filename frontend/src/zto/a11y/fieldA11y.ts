/*
 * Form alanı erişilebilirliği (12.1 §5.0 #12; MWG `accessible-error-announcement`,
 * `required-field-feedback`). Görsel hata ZTO sınıfı ve metniyle RHF durumundan gösterilir; ARIA durumu
 * aynı anda ve yalnız etkileşimden sonra (alan bırakıldı ya da form gönderildi) güncellenir:
 * - `aria-invalid` başta "false" (Firefox/Safari boş zorunlu alanı yüklemede geçersiz okur);
 * - hata metni elemanı (`errorId`) her zaman DOM'dadır, `aria-describedby` yalnız hata görünürken onu
 *   gösterir (gizli metin de okunacağı için işaretlemede sabit bağlanmaz);
 * - alan bırakılınca yeni çıkan hata sayfadaki tek polite canlı bölgeden 500 ms sonra okunur
 *   (useFormErrorAnnouncer); gönderim hatasında RHF ilk geçersiz alana odaklanır (shouldFocusError).
 */

export type FieldA11yState = {
  /** Alan bırakıldı mı (RHF formState.touchedFields). */
  touched?: boolean;
  /** Form gönderildi mi (RHF formState.isSubmitted). */
  submitted?: boolean;
  /** Hata metni (RHF errors[name]?.message); yoksa geçerli. */
  error?: string | null;
  /** Hata metni elemanının id'si; varsayılan `${id}-error`. */
  errorId?: string;
  /** Alanın id'si; varsayılan `name`. */
  id?: string;
};

export type FieldA11yProps = {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby": string | undefined;
  "data-error": string;
};

/** Hata metni elemanının id'si. */
export function errorIdOf(id: string): string {
  return `${id}-error`;
}

/** Hata gösterilmeli mi: etkileşimden sonra ve hata varsa. */
export function showsError(state: FieldA11yState): boolean {
  return Boolean((state.touched || state.submitted) && state.error);
}

/**
 * Girişe yayılacak nitelikler: `<input {...fieldA11yProps("accountName", {...})} />`. Hata metni elemanı
 * `<div id={errorIdOf(id)} className="…ZTO hata sınıfı…" hidden={!showsError(state)}>` olarak her zaman
 * çizilir.
 */
export function fieldA11yProps(name: string, state: FieldA11yState = {}): FieldA11yProps {
  const id = state.id ?? name;
  const errorId = state.errorId ?? errorIdOf(id);
  const shown = showsError(state);
  return {
    id,
    "aria-invalid": shown,
    "aria-describedby": shown ? errorId : undefined,
    "data-error": errorId,
  };
}

type FormStateLike = {
  touchedFields?: unknown;
  isSubmitted?: boolean;
  errors?: unknown;
};

/** "a.0.b" yolundaki değer (RHF iç içe alan adları). */
export function valueAtPath(tree: unknown, path: string): unknown {
  let node: unknown = tree;
  for (const part of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/** RHF formState'ten durum: `fieldA11yProps(name, fieldStateOf(form.formState, name))`. */
export function fieldStateOf(
  formState: FormStateLike,
  name: string,
  options: { id?: string; errorId?: string } = {},
): FieldA11yState {
  const error = valueAtPath(formState.errors, name) as { message?: unknown } | undefined;
  return {
    touched: valueAtPath(formState.touchedFields, name) === true,
    submitted: formState.isSubmitted === true,
    error: typeof error?.message === "string" && error.message !== "" ? error.message : null,
    ...options,
  };
}

/** Canlı bölgede okunacak metin: "{etiket}: {hata}" (etiket boşsa yalnız hata). */
export function announcementText(label: string | null | undefined, error: string): string {
  const cleanLabel = (label ?? "")
    .replace(/\s+/g, " ")
    .replace(/[*:]+\s*$/, "")
    .trim();
  return cleanLabel ? `${cleanLabel}: ${error}` : error;
}

/** Odak sonraki alana geçip okunduktan sonra duyuru (ms). */
export const ANNOUNCE_DELAY_MS = 500;

/**
 * Her alanın son duyurulan hatasını tutar: aynı hata ikinci kez okunmaz, düzeltilince unutulur
 * (alan yeniden hatalanırsa yeniden okunur).
 */
export function createAnnouncementTracker() {
  const announced = new Map<string, string>();
  return {
    /** Bu hata duyurulmalı mı? Duyurulacaksa kaydeder. */
    next(field: string, error: string | null | undefined): boolean {
      if (!error) {
        announced.delete(field);
        return false;
      }
      if (announced.get(field) === error) return false;
      announced.set(field, error);
      return true;
    },
    reset() {
      announced.clear();
    },
  };
}
