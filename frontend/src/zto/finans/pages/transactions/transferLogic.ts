import type { TransferableTransaction } from "../../../../pages/finance/types";

/*
 * Cari Taşıma modalı (ZTO Transactions.cshtml:3550-4059) saf mantığı (12.1 §5.10): gruplama, seçim
 * (aynı çeke bağlı satırlar birlikte, OK-37), engelli satırlar (açık plan, OK-36), uyarı sayıları.
 */

export type TransferGroupBy = "currency" | "workplace";

export type CurrencyGroup = { key: string; currency: string; items: TransferableTransaction[] };
export type WorkplaceGroup = {
  key: string;
  branchId: string;
  label: string;
  items: TransferableTransaction[];
  currencies: CurrencyGroup[];
};

/** ctGroupByCurrency: para birimine göre gruplar, ilk görünme sırası korunur. */
export function groupByCurrency(
  items: readonly TransferableTransaction[],
  prefix = "c",
): CurrencyGroup[] {
  const map = new Map<string, CurrencyGroup>();
  for (const item of items) {
    let group = map.get(item.currency);
    if (!group) {
      group = { key: `${prefix}-${item.currency}`, currency: item.currency, items: [] };
      map.set(item.currency, group);
    }
    group.items.push(item);
  }
  return [...map.values()];
}

/** İç içe: İş Yeri (dış) → Para Birimi (iç); iş yeri adı yoksa `unknownLabel`. */
export function groupByWorkplace(
  items: readonly TransferableTransaction[],
  unknownLabel: string,
): WorkplaceGroup[] {
  const map = new Map<string, WorkplaceGroup>();
  for (const item of items) {
    const id = item.branchId || "";
    let group = map.get(id);
    if (!group) {
      group = {
        key: `w-${id}`,
        branchId: id,
        label: item.branchName || unknownLabel,
        items: [],
        currencies: [],
      };
      map.set(id, group);
    }
    group.items.push(item);
  }
  for (const group of map.values()) {
    group.currencies = groupByCurrency(group.items, group.key);
  }
  return [...map.values()];
}

export function isSelectable(item: TransferableTransaction): boolean {
  return item.blockedReason === null;
}

/** Bir satırın seçimi aynı `instrumentGroup`'taki tüm (seçilebilir) satırları birlikte etkiler. */
function partners(
  all: readonly TransferableTransaction[],
  item: TransferableTransaction,
): TransferableTransaction[] {
  if (!item.instrumentGroup) return [item];
  return all.filter((x) => x.instrumentGroup === item.instrumentGroup);
}

/** Satırı işaretler/kaldırır; çek grubunun eşleri birlikte. Engelli satır değişmez. */
export function toggleRow(
  selected: ReadonlySet<string>,
  all: readonly TransferableTransaction[],
  item: TransferableTransaction,
  checked: boolean,
): Set<string> {
  const next = new Set(selected);
  if (!isSelectable(item)) return next;
  for (const x of partners(all, item)) {
    if (!isSelectable(x)) continue;
    if (checked) next.add(x.transactionId);
    else next.delete(x.transactionId);
  }
  return next;
}

/** Grup "tümünü seç": gruptaki seçilebilir satırlar (ve çek eşleri) birlikte. */
export function toggleGroup(
  selected: ReadonlySet<string>,
  all: readonly TransferableTransaction[],
  groupItems: readonly TransferableTransaction[],
  checked: boolean,
): Set<string> {
  let next = new Set(selected);
  for (const item of groupItems) next = toggleRow(next, all, item, checked);
  return next;
}

/** Grup kutusunun durumu: hepsi / hiçbiri / karışık (MWG `checkbox` ara durum). */
export function groupState(
  selected: ReadonlySet<string>,
  groupItems: readonly TransferableTransaction[],
): "checked" | "unchecked" | "mixed" {
  const selectable = groupItems.filter(isSelectable);
  if (selectable.length === 0) return "unchecked";
  const count = selectable.filter((x) => selected.has(x.transactionId)).length;
  if (count === 0) return "unchecked";
  return count === selectable.length ? "checked" : "mixed";
}

/** Seçili hareket, çek içeren ve senet içeren hareket sayıları (ctConfirmWarn). */
export function selectionSummary(
  selected: ReadonlySet<string>,
  all: readonly TransferableTransaction[],
) {
  const rows = all.filter((x) => selected.has(x.transactionId));
  return {
    count: rows.length,
    checkCount: rows.filter((x) => x.instruments.some((i) => i.kind === "CHECK")).length,
    noteCount: rows.filter((x) => x.instruments.some((i) => i.kind === "NOTE")).length,
  };
}

/** Gönderim öncesi ZTO uyarıları (sırasıyla hedef, liste, seçim). */
export function validateTransfer(
  targetId: string | null,
  selected: ReadonlySet<string>,
  all: readonly TransferableTransaction[],
): "errTarget" | "empty" | "errSelect" | null {
  if (!targetId) return "errTarget";
  if (all.length === 0) return "empty";
  if (![...selected].some((id) => all.some((x) => x.transactionId === id))) return "errSelect";
  return null;
}

/** Seçimi geçerli listeyle sınırlar (liste tazelenince kaybolan id'ler atılır). */
export function pruneSelection(
  selected: ReadonlySet<string>,
  all: readonly TransferableTransaction[],
): Set<string> {
  const ids = new Set(all.filter(isSelectable).map((x) => x.transactionId));
  return new Set([...selected].filter((id) => ids.has(id)));
}

/** Son 6 ay (ZTO ctHistReset): bugünden 6 ay öncesi (ay sonu taşmasında ayın son günü). */
export function sixMonthsAgo(today: string): string {
  const [y, m, d] = today.split("-").map(Number);
  let month = m - 6;
  let year = y;
  while (month <= 0) {
    month += 12;
    year -= 1;
  }
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(d, last);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
