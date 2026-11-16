import type {
  ExpenseCurrencyTotal,
  ExpenseItemSummary,
  ExpenseListItem,
} from "../../../../pages/finance/types";
import type { BranchTree } from "../../../branch/branchTree";
import { addDec, cmpDec, sumDec } from "../../../decimal";
import { currencySymbol, formatN2, formatNumber } from "../../../format";
import { trLower } from "./expenseItemsLogic";

/*
 * Genel Masraf listesi (PEL) ve kalem faturaları (EGD) saf mantığı (12.7_TASARIM §5.5). Para birimleri
 * hiçbir yerde ₺ ile toplanmaz (04 §7 madde 17b düzeltmesi): her toplam para birimi kırılımlıdır.
 */

/** Para birimi sırası: TRY önce, sonra alfabetik. */
function compareCurrency(a: string, b: string): number {
  if (a === b) return 0;
  if (a === "TRY") return -1;
  if (b === "TRY") return 1;
  return a.localeCompare(b, "en");
}

/** Para birimi kırılımlı toplamları birleştirir (adet + tutar). */
export function mergeCurrencyTotals(
  groups: Iterable<readonly ExpenseCurrencyTotal[]>,
): ExpenseCurrencyTotal[] {
  const merged = new Map<string, ExpenseCurrencyTotal>();
  for (const totals of groups) {
    for (const total of totals) {
      const current = merged.get(total.currency);
      merged.set(
        total.currency,
        current
          ? {
              currency: total.currency,
              count: current.count + total.count,
              totalAmount: addDec(current.totalAmount, total.totalAmount),
            }
          : {
              currency: total.currency,
              count: total.count,
              totalAmount: sumDec([total.totalAmount]),
            },
      );
    }
  }
  return [...merged.values()].sort((a, b) => compareCurrency(a.currency, b.currency));
}

/** PEL "Toplam Masraf" kartı: tüm kalemlerin para birimi başına toplamı. */
export function totalsByCurrency(rows: readonly ExpenseItemSummary[]): ExpenseCurrencyTotal[] {
  return mergeCurrencyTotals(rows.map((row) => row.totals));
}

/** Toplam fatura adedi (para birimlerinin toplamı). */
export function totalInvoiceCount(rows: readonly ExpenseItemSummary[]): number {
  return rows.reduce((sum, row) => sum + row.invoiceCount, 0);
}

/** Fatura satırlarını para birimine göre toplar (EGD kartları ve süzgeç seçenekleri). */
export function groupByCurrency(
  rows: readonly Pick<ExpenseListItem, "currency" | "totalAmount">[],
): ExpenseCurrencyTotal[] {
  return mergeCurrencyTotals(
    rows.map((row) => [{ currency: row.currency, count: 1, totalAmount: row.totalAmount }]),
  );
}

export type FooterTotal =
  { kind: "empty" } | { kind: "single"; currency: string; amount: string } | { kind: "mixed" };

/**
 * EGD `tfoot` "TOPLAM:" hücresi: satırlar tek para birimindeyse toplam, birden çoksa "Karışık"
 * (ZTO ExpenseGroupDetails: currencyGroups.Count == 1).
 */
export function footerTotal(
  rows: readonly Pick<ExpenseListItem, "currency" | "totalAmount">[],
): FooterTotal {
  const groups = groupByCurrency(rows);
  if (groups.length === 0) return { kind: "empty" };
  if (groups.length > 1) return { kind: "mixed" };
  return { kind: "single", currency: groups[0].currency, amount: groups[0].totalAmount };
}

/** ZTO para gösterimi "1.234,56 ₺". */
export function moneyText(amount: string, currency: string): string {
  return `${formatN2(amount)} ${currencySymbol(currency)}`;
}

/** Özet kartı tutarı (ZTO `ToString("N0")`). */
export function moneyTextN0(amount: string, currency: string): string {
  return `${formatNumber(amount, 0)} ${currencySymbol(currency)}`;
}

/** ZTO `currency-badge-rotating` renk sınıfı (bilinmeyen → TRY). */
export function currencyClass(currency: string): string {
  return ["TRY", "USD", "EUR", "GBP", "RUB"].includes(currency) ? currency : "TRY";
}

/** Özet kartı adı: 35 karakteri aşarsa ilk 32 + "..." (ZTO IndexExpenses:1188). */
export function truncateName(name: string, max = 35): string {
  return name.length > max ? `${name.slice(0, max - 3)}...` : name;
}

/** "Son Fatura Tarihi" sıralama anahtarı `yyyyMMdd` (boş → ""). */
export function dateSortKey(iso: string | null | undefined): string {
  return iso ? iso.replace(/-/g, "") : "";
}

/** İş yeri sütunu: adlar virgülle. */
export function branchText(names: readonly string[]): string {
  return names.join(", ");
}

/**
 * Özet kartı araması (ZTO initCategorySearch): ad, kod ya da tutarlardan biri terimi içeriyorsa
 * görünür. Türkçe küçük harf; boş terim → hepsi.
 */
export function filterCategoryCards(
  rows: readonly ExpenseItemSummary[],
  term: string,
): ExpenseItemSummary[] {
  const needle = trLower(term.trim());
  if (!needle) return [...rows];
  return rows.filter(
    (row) =>
      trLower(row.expenseItemName ?? "").includes(needle) ||
      trLower(row.expenseItemCode).includes(needle) ||
      row.totals.some(
        (total) =>
          total.totalAmount.includes(needle) || formatN2(total.totalAmount).includes(needle),
      ),
  );
}

/** "N sonuç bulundu" (ZTO). */
export function resultCountText(count: number): string {
  return `${count} sonuç bulundu`;
}

/** EGD sırası: oluşturma zamanı azalan (ZTO `OrderByDescending(CreationDate)`), sonra fatura tarihi. */
export function sortInvoices(rows: readonly ExpenseListItem[]): ExpenseListItem[] {
  return [...rows].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) ||
      b.invoiceDate.localeCompare(a.invoiceDate) ||
      a.id.localeCompare(b.id),
  );
}

/** Para birimi süzgeci seçeneği: "Türk Lirası (₺) - 3 fatura" yerine "TRY (₺) - 3 fatura". */
export function currencyOptionText(total: ExpenseCurrencyTotal): string {
  return `${total.currency} (${currencySymbol(total.currency)}) - ${total.count} fatura`;
}

/** Ters kayıt tarihi: bugün, ileri tarihli faturada fatura tarihi (OK-12.7-25 kuralıyla aynı). */
export function reverseDateOf(today: string, invoiceDate: string): string {
  return invoiceDate > today ? invoiceDate : today;
}

/**
 * Üst şeritteki şube/iş yeri başlığı (ZTO BranchProvinceHeader / WorkPlaceHeader): seçili iş yerinin
 * grubu ve adı; seçim yoksa ya da ağaçta yoksa boş (çağıran "Tüm Şubeler"/"Tüm İş Yerleri" yazar).
 */
export function branchHeader(
  tree: BranchTree | undefined,
  branchId: string,
): { groupName: string; branchName: string } {
  if (!tree || !branchId) return { groupName: "", branchName: "" };
  for (const company of tree) {
    for (const group of company.groups) {
      const branch = group.branches.find((item) => item.id === branchId);
      if (branch) return { groupName: group.groupName, branchName: branch.name };
    }
  }
  return { groupName: "", branchName: "" };
}

/** Süzgeç değeri → `branchIds` ("" → tüm kapsam). */
export function branchIdsOf(branchId: string): string[] | undefined {
  return branchId ? [branchId] : undefined;
}

/** Gerekçe sınırı (`ReverseExpenseRequest.reason`). */
export const REVERSE_REASON_MAX = 500;

/** Tutar sıfırdan büyük mü (ZTO koşullu rozetler). */
export function isPositive(amount: string | null | undefined): boolean {
  return cmpDec(amount ?? "0", "0") > 0;
}
