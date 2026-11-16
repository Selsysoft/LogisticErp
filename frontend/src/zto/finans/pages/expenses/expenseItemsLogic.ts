import type { ExpenseItem, SaveExpenseItemRequest } from "../../../../pages/finance/types";

/*
 * Masraf Kalemleri (EIX/EIA/EIE) saf mantığı (12.7_TASARIM §5.4). ZTO ad doğrulaması sunucuya
 * (`/ExpenseItems/CheckExpenseItemExists`, `SearchExpenseItems`) gidiyordu; burada yerel listeyle
 * (GET /finance/expense-items, pasifler dahil) yapılır. Tekillik yalnız AKTİF kalemler arasındadır
 * (`expense_item_name_active_uq`); büyük/küçük harf Türkçe kurallarıyla karşılaştırılır (İ/i, I/ı).
 */

/** ZTO 300 ms; tasarım 250 ms (öneri listesi). */
export const SUGGESTION_DEBOUNCE_MS = 250;
export const MAX_SUGGESTIONS = 10;
export const NAME_MAX_LENGTH = 100;
export const DESCRIPTION_MAX_LENGTH = 500;
export const UNIT_MAX_LENGTH = 30;

export type ExpenseItemFormMode = "new" | "edit";

/** Türkçe küçük harf (I → ı, İ → i). */
export function trLower(value: string): string {
  return value.toLocaleLowerCase("tr");
}

/** İki ad aynı mı (baş/son boşluk ve Türkçe büyük/küçük harf duyarsız). */
export function sameName(a: string, b: string): boolean {
  return trLower(a.trim()) === trLower(b.trim());
}

/** Listede gösterilen kalemler: yalnız aktifler (ZTO ExpenseItemsController:43 `IsActive`). */
export function activeItems(items: readonly ExpenseItem[]): ExpenseItem[] {
  return items.filter((item) => item.active);
}

/**
 * Öneri listesi: aktif kalemlerden adı terimi içerenler; önce terimle başlayanlar, sonra Türkçe
 * alfabetik; en çok 10. Düzenlenen kalemin kendisi önerilmez.
 */
export function suggestNames(
  items: readonly ExpenseItem[],
  term: string,
  excludeId?: string | null,
): string[] {
  const needle = trLower(term.trim());
  if (!needle) return [];
  return activeItems(items)
    .filter((item) => item.id !== excludeId && trLower(item.name).includes(needle))
    .sort((a, b) => {
      const aStarts = trLower(a.name).startsWith(needle) ? 0 : 1;
      const bStarts = trLower(b.name).startsWith(needle) ? 0 : 1;
      return aStarts - bStarts || a.name.localeCompare(b.name, "tr");
    })
    .slice(0, MAX_SUGGESTIONS)
    .map((item) => item.name);
}

/** Aynı adlı başka aktif kalem (kendisi hariç). */
export function findDuplicate(
  items: readonly ExpenseItem[],
  name: string,
  excludeId?: string | null,
): ExpenseItem | undefined {
  if (!name.trim()) return undefined;
  return activeItems(items).find((item) => item.id !== excludeId && sameName(item.name, name));
}

/**
 * Ad alanı durumu:
 * - idle: değerlendirilmedi (yazarken hata temizlenir),
 * - available: kullanılabilir (yeni ad),
 * - original: düzenlemede ad değişmedi,
 * - duplicate: başka aktif kalemde var,
 * - suggested: öneriden seçildi (ZTO: öneriler veritabanındaki kayıtlardır),
 * - empty: gönderimde boş,
 * - invalid: gönderimde geçerli ve benzersiz ad yok (ZTO alert'i).
 */
export type NameStatus =
  "idle" | "available" | "original" | "duplicate" | "suggested" | "empty" | "invalid";

/** Yerel listeye göre ad durumu (boş → idle; çağıran gönderimde `empty` verir). */
export function evaluateName(
  items: readonly ExpenseItem[],
  name: string,
  mode: ExpenseItemFormMode,
  original?: ExpenseItem | null,
): NameStatus {
  const value = name.trim();
  if (!value) return "idle";
  if (mode === "edit" && original && value === original.name.trim()) return "original";
  return findDuplicate(items, value, original?.id) ? "duplicate" : "available";
}

/**
 * Gönder düğmesi açık mı: ad kullanılabilir ya da (düzenlemede) değişmemiş. ZTO yeni kayıtta düğmeyi
 * ad doğrulanana kadar kapalı tutar; düzenlemede farklı bir ad doğrulanana kadar kapalıdır.
 */
export function canSubmitName(status: NameStatus): boolean {
  return status === "available" || status === "original";
}

/** Gönderim anındaki durum: boş → empty; geçerli değilse invalid (ZTO validateForm alert'leri). */
export function submitNameStatus(
  items: readonly ExpenseItem[],
  name: string,
  mode: ExpenseItemFormMode,
  original?: ExpenseItem | null,
): NameStatus {
  if (!name.trim()) return "empty";
  const status = evaluateName(items, name, mode, original);
  return canSubmitName(status) ? status : "invalid";
}

export const EXPENSE_ITEM_TEXT = {
  required: "Lütfen bir masraf adı girin!",
  invalid: "Lütfen geçerli ve mevcut olmayan bir masraf adı girin!",
  original: "Mevcut masraf adı - değişiklik yapmadınız.",
  titleIdle: "Lütfen geçerli bir masraf adı girin",
  titleCreate: "Yeni masraf kalemi oluştur",
  titleDuplicate: "Bu masraf adı zaten mevcut. Lütfen farklı bir ad girin.",
  titleSuggested: "Mevcut bir masraf adı seçtiniz. Lütfen yeni bir ad girin.",
} as const;

/** `#nameError` metni (ZTO Add/Edit showNameError); hata yoksa null. */
export function nameErrorText(
  status: NameStatus,
  name: string,
  mode: ExpenseItemFormMode,
): string | null {
  const quoted = `"${name.trim()}"`;
  switch (status) {
    case "duplicate":
      return mode === "edit"
        ? `${quoted} masraf adı başka bir kayıtta zaten mevcut! Lütfen farklı bir ad girin.`
        : `${quoted} masraf adı zaten mevcut! Lütfen farklı bir ad girin.`;
    case "suggested":
      return mode === "edit"
        ? `${quoted} masraf adı başka bir kayıtta zaten mevcut! Lütfen farklı bir ad girin.`
        : `${quoted} masraf adı zaten mevcut! Autocomplete'ten seçtiğiniz isimler veritabanında bulunan kayıtlardır. Lütfen yeni bir ad girin.`;
    case "empty":
      return EXPENSE_ITEM_TEXT.required;
    case "invalid":
      return EXPENSE_ITEM_TEXT.invalid;
    default:
      return null;
  }
}

/** `#nameSuccess` metni (ZTO showNameSuccess); yoksa null. */
export function nameSuccessText(status: NameStatus, name: string): string | null {
  if (status === "available") return `"${name.trim()}" masraf adı kullanılabilir.`;
  if (status === "original") return EXPENSE_ITEM_TEXT.original;
  return null;
}

/** Gönder düğmesinin `title`'ı (ZTO enable/disableSubmitButton). */
export function submitTitle(status: NameStatus, mode: ExpenseItemFormMode): string | undefined {
  if (mode === "edit") return undefined;
  switch (status) {
    case "available":
      return EXPENSE_ITEM_TEXT.titleCreate;
    case "duplicate":
      return EXPENSE_ITEM_TEXT.titleDuplicate;
    case "suggested":
      return EXPENSE_ITEM_TEXT.titleSuggested;
    default:
      return EXPENSE_ITEM_TEXT.titleIdle;
  }
}

export type ExpenseItemFormValues = {
  expenseTypeId: string;
  name: string;
  description: string;
  defaultUnit: string;
};

export const EMPTY_EXPENSE_ITEM_FORM: ExpenseItemFormValues = {
  expenseTypeId: "",
  name: "",
  description: "",
  defaultUnit: "",
};

export function formOf(item: ExpenseItem): ExpenseItemFormValues {
  return {
    expenseTypeId: item.expenseTypeId,
    name: item.name,
    description: item.description ?? "",
    defaultUnit: item.defaultUnit ?? "",
  };
}

const blankToNull = (value: string): string | null => value.trim() || null;

/**
 * İstek gövdesi. Yeni kalemde `code` gönderilmez (sunucu MK-00001 dizisinden verir, OK-12.7-18);
 * düzenlemede mevcut kod aynen gönderilir (ZTO gizli `Key` alanı).
 */
export function toSaveRequest(
  values: ExpenseItemFormValues,
  existing?: ExpenseItem | null,
): SaveExpenseItemRequest {
  return {
    expenseTypeId: values.expenseTypeId,
    ...(existing ? { code: existing.code } : {}),
    name: values.name.trim(),
    description: blankToNull(values.description),
    defaultUnit: blankToNull(values.defaultUnit),
  };
}

/** ApiError gövdesindeki kod (yoksa null). */
export function errorCodeOf(error: unknown): string | null {
  const code = (error as { body?: { code?: unknown } } | null)?.body?.code;
  return typeof code === "string" ? code : null;
}

/** ZTO hata snackbar'ı: "Hata oluştu: {message}". */
export function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return `Hata oluştu: ${message}`;
}
