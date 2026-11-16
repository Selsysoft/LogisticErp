import type {
  CheckBook,
  CheckBookBody,
  CheckBookCreated,
  CheckLeaf,
  CheckLeafStatus,
} from "../../../../pages/finance/types";

/*
 * Çek Koçanları (ZTO Views/CheckBooks/Index.cshtml; 12.3_TASARIM §5.6) saf mantığı: yaprak sayısı
 * göstergesi (calculateCheckCount), alan doğrulaması (validateForm iletileri birebir), istek gövdesi,
 * durum rozeti, çip toplamları ve yaprak eylemleri.
 */

/** Sunucu sınırı (CHECK_BOOK_RANGE_INVALID); ZTO istemcide 100'de uyarıyordu. */
export const MAX_LEAVES = 1000;

const SEVEN_DIGITS = /^\d{7}$/;
const FOUR_DIGITS = /^\d{4}$/;

export type CheckBookForm = {
  fundAccountId: string;
  serialNo: string;
  startNumber: string;
  endNumber: string;
  bankCode: string;
  branchCode: string;
};

export const EMPTY_CHECK_BOOK_FORM: CheckBookForm = {
  fundAccountId: "",
  serialNo: "",
  startNumber: "",
  endNumber: "",
  bankCode: "",
  branchCode: "",
};

/** Yalnız rakam, en çok `max` hane (inputmode=numeric alanların girişi). */
export function digitsOnly(value: string, max: number): string {
  return value.replace(/\D/g, "").slice(0, max);
}

/** "Toplam Yaprak" (iki numara da 7 hane ve başlangıç ≤ bitiş); geçersizse 0. */
export function leafCount(startNumber: string, endNumber: string): number {
  const start = startNumber.trim();
  const end = endNumber.trim();
  if (!SEVEN_DIGITS.test(start) || !SEVEN_DIGITS.test(end)) return 0;
  const count = Number(end) - Number(start) + 1;
  return count > 0 ? count : 0;
}

/** Gösterge sınıfı: > 1000 tehlike (BR eki sınırı), > 50 uyarı, diğer başarı (ZTO eşikleri). */
export function leafCountClass(count: number): string {
  if (count > MAX_LEAVES) return "alert-danger";
  if (count > 50) return "alert-warning";
  return "alert-success";
}

export type CheckBookField = keyof CheckBookForm | "range";

/** Alan → ilk hata anahtarı (`checkBooks.errors.<alan>`); ZTO sırası: banka, seri, başlangıç, bitiş, kodlar. */
export function validateCheckBook(form: CheckBookForm): Partial<Record<CheckBookField, string>> {
  const errors: Partial<Record<CheckBookField, string>> = {};
  if (!form.fundAccountId) errors.fundAccountId = "fundAccountId";
  if (!form.serialNo.trim() || form.serialNo.trim().length > 50) errors.serialNo = "serialNo";
  if (!SEVEN_DIGITS.test(form.startNumber.trim())) errors.startNumber = "startNumber";
  if (!SEVEN_DIGITS.test(form.endNumber.trim())) errors.endNumber = "endNumber";
  if (!errors.startNumber && !errors.endNumber) {
    const count = leafCount(form.startNumber, form.endNumber);
    if (count === 0) errors.endNumber = "endNumber";
    else if (count > MAX_LEAVES) errors.range = "range";
  }
  const bankCode = form.bankCode.trim();
  const branchCode = form.branchCode.trim();
  // İkisi birlikte boş ya da ikisi de 4 hane (sunucu kuralı; ZTO alanları ayrı denetler).
  if (bankCode || branchCode) {
    if (!FOUR_DIGITS.test(bankCode)) errors.bankCode = "bankCode";
    if (!FOUR_DIGITS.test(branchCode)) errors.branchCode = "branchCode";
  }
  return errors;
}

/** İlk hatalı alan (ZTO yalnız ilk iletiyi gösterir). */
export function firstError(errors: Partial<Record<CheckBookField, string>>): CheckBookField | null {
  const order: CheckBookField[] = [
    "fundAccountId",
    "serialNo",
    "startNumber",
    "endNumber",
    "range",
    "bankCode",
    "branchCode",
  ];
  return order.find((field) => errors[field]) ?? null;
}

export function checkBookBody(form: CheckBookForm): CheckBookBody {
  const bankCode = form.bankCode.trim();
  const branchCode = form.branchCode.trim();
  return {
    fundAccountId: form.fundAccountId,
    serialNo: form.serialNo.trim(),
    startNumber: form.startNumber.trim(),
    endNumber: form.endNumber.trim(),
    ...(bankCode && branchCode ? { bankCode, branchCode } : {}),
  };
}

/** Başarı iletisinin parçaları: atlanan numaralardan ilk 10'u + "…". */
export function createdSummary(result: Pick<CheckBookCreated, "createdCount" | "skippedNumbers">) {
  const skipped = result.skippedNumbers ?? [];
  const shown = skipped.slice(0, 10).join(", ");
  return {
    created: result.createdCount,
    skippedCount: skipped.length,
    numbers: skipped.length > 10 ? `${shown}, …` : shown,
  };
}

// ---------------------------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------------------------

/** `.check-status-badge` alt sınıfı (index.css). */
export function leafStatusClass(status: CheckLeafStatus): string {
  switch (status) {
    case "UNUSED":
      return "status-available";
    case "USED":
      return "status-used";
    default:
      return "status-cancelled";
  }
}

/** "İptal Et": kullanılmamış ya da kullanılmış yaprak (sunucu etkin çekte 409 döner). */
export function canVoidLeaf(leaf: Pick<CheckLeaf, "status">): boolean {
  return leaf.status !== "VOID";
}

/** "Sil": yalnız kullanılmamış yaprak. */
export function canDeleteLeaf(leaf: Pick<CheckLeaf, "status">): boolean {
  return leaf.status === "UNUSED";
}

export type CheckBookTotals = { books: number; leaves: number; available: number; used: number };

/** Başlık çipleri ("N Defter / Yaprak / Kullanılabilir / Kullanılan"). */
export function checkBookTotals(books: readonly CheckBook[]): CheckBookTotals {
  return books.reduce<CheckBookTotals>(
    (sum, book) => ({
      books: sum.books + 1,
      leaves: sum.leaves + book.unusedCount + book.usedCount + book.voidCount,
      available: sum.available + book.unusedCount,
      used: sum.used + book.usedCount,
    }),
    { books: 0, leaves: 0, available: 0, used: 0 },
  );
}

/** Varsayılan sıra: Defter Seri No, Yaprak No artan (ZTO order [[0,'asc'],[1,'asc']]). */
export function compareLeaves(a: CheckLeaf, b: CheckLeaf): number {
  const serial = a.checkBookSerial.localeCompare(b.checkBookSerial, "tr");
  return serial !== 0 ? serial : a.leafNo - b.leafNo;
}

export type LeafFilters = { fundAccountId: string; serial: string; status: CheckLeafStatus | "" };

export const EMPTY_LEAF_FILTERS: LeafFilters = { fundAccountId: "", serial: "", status: "" };
