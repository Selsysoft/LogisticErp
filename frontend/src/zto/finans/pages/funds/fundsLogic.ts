import type { MeCompany } from "../../../../pages/organization/types";
import type {
  Fund,
  FundAccountType,
  FundDeleteReason,
  FundKind,
  FundSummaryRow,
} from "../../../../pages/finance/types";
import type { BranchTree } from "../../../branch/branchTree";
import { OTHER_GROUP_NAME } from "../../../branch/branchTree";
import { currencySymbol } from "../../../format";
import { searchKey } from "../../../searchKey";

/*
 * Bankalar / Kasalar liste mantığı (12.2 §5.5, §5.8; ZTO BankIntroduction/Index + _AccountCardsListPartial,
 * CashIntroduction/Index + _CashCardsListPartial). Kartlar sunucudan gelen fon listesinden kurulur;
 * arama, çip süzgeçleri, gruplama, bakiye çubuğu ve ileri tarih metni burada saf fonksiyonlardır.
 */

/** Tanımsız alan çip adı (ZTO `Localizer["Tanımsız"]`). */
export const UNDEFINED_LABEL = "Tanımsız";
/** Çip kartındaki "Tümü" öğesinin değeri (ZTO `__ALL__`). */
export const ALL_VALUE = "__ALL__";
/** Canlı arama en az 2 karakter (ZTO performSearch). */
export const MIN_SEARCH = 2;
/** Arama gecikmesi (ms). */
export const SEARCH_DELAY_MS = 300;
/** Bu kadar karttan fazlasında arama/gruplama 50 ms parçalarla yapılır (§5.0 #9). */
export const CHUNK_THRESHOLD = 500;

export const ACCOUNT_TYPES: readonly FundAccountType[] = [
  "DEMAND",
  "CREDIT",
  "DEPOSIT",
  "INVESTMENT",
];

export type AccountTypeMeta = {
  /** ZTO sınıf eki: type-vadesiz, type-kredi … */
  slug: "vadesiz" | "kredi" | "mevduat" | "yatirim";
  icon: string;
  color: string;
};

const TYPE_META: Record<FundAccountType, AccountTypeMeta> = {
  DEMAND: { slug: "vadesiz", icon: "fa-wallet", color: "#3b82f6" },
  CREDIT: { slug: "kredi", icon: "fa-hand-holding-usd", color: "#f59e0b" },
  DEPOSIT: { slug: "mevduat", icon: "fa-piggy-bank", color: "#10b981" },
  INVESTMENT: { slug: "yatirim", icon: "fa-chart-line", color: "#8b5cf6" },
};

export function accountTypeMeta(type: FundAccountType | null | undefined): AccountTypeMeta {
  return TYPE_META[type ?? "DEMAND"] ?? TYPE_META.DEMAND;
}

/** `?type=` parametresi; tanınmayan değer → null (Tümü). */
export function parseAccountType(value: string | null | undefined): FundAccountType | null {
  const upper = (value ?? "").trim().toUpperCase();
  return (ACCOUNT_TYPES as readonly string[]).includes(upper) ? (upper as FundAccountType) : null;
}

export type BranchInfo = { name: string; groupName: string; companyId: string | null };

/** İş yeri kimliği → ad, şube grubu (ZTO "Şube İli"), şirket. */
export function branchIndex(tree: BranchTree | undefined): Map<string, BranchInfo> {
  const map = new Map<string, BranchInfo>();
  for (const company of tree ?? []) {
    for (const group of company.groups) {
      for (const branch of group.branches) {
        map.set(branch.id, {
          name: branch.name,
          groupName: group.groupName || OTHER_GROUP_NAME,
          companyId: company.companyId,
        });
      }
    }
  }
  return map;
}

/** Seçili iş yerinin şube grubu adı ("Şube İli", salt okunur; yoksa "Diğer" — 12.1a kararı). */
export function branchGroupName(index: Map<string, BranchInfo>, branchId: string): string {
  return branchId ? (index.get(branchId)?.groupName ?? OTHER_GROUP_NAME) : "";
}

export function companyNames(companies: readonly MeCompany[] | undefined): Map<string, string> {
  return new Map((companies ?? []).map((c) => [c.id, c.shortName]));
}

/** Kart görünüm modeli: fon + çözülmüş adlar + arama metni. */
export type FundCard = {
  fund: Fund;
  workPlaceName: string;
  branchGroupName: string;
  companyName: string;
  symbol: string;
  /** Bankalar çipi (ZTO `data-bank-name` = banka markası) ya da Kasalar çipi ("ad|kod"). */
  chipKey: string;
  /** Kasalar çipinin görünen adı ("Ad (Kod)"). */
  chipLabel: string;
  /** Arama metni (katlanmış). */
  searchText: string;
};

export function buildCard(
  fund: Fund,
  branches: Map<string, BranchInfo>,
  companies: Map<string, string>,
): FundCard {
  const branch = branches.get(fund.branchId);
  const workPlaceName = branch?.name ?? "";
  const symbol = currencySymbol(fund.currency);
  const chipKey =
    fund.kind === "CASH"
      ? `${fund.name.trim()}|${fund.code.trim()}`
      : fund.bankName?.trim() || UNDEFINED_LABEL;
  const chipLabel = fund.kind === "CASH" ? `${fund.name} (${fund.code})` : chipKey;
  const parts = [
    fund.name,
    fund.bankName,
    fund.bankBranchName,
    fund.code,
    fund.iban,
    fund.iban?.replace(/\s+/g, ""),
    workPlaceName,
    branch?.groupName,
    fund.currency,
    symbol,
    companies.get(fund.companyId),
  ];
  return {
    fund,
    workPlaceName,
    branchGroupName: branch?.groupName ?? OTHER_GROUP_NAME,
    companyName: companies.get(fund.companyId) ?? "",
    symbol,
    chipKey,
    chipLabel,
    searchText: searchKey(parts.filter(Boolean).join(" ")),
  };
}

/** Arama sözcükleri (katlanmış); toplam < 2 karakterse boş (ZTO: canlı arama ≥ 2). */
export function searchWords(query: string): string[] {
  const trimmed = query.trim();
  if (trimmed.length < MIN_SEARCH) return [];
  return searchKey(trimmed).split(/\s+/).filter(Boolean);
}

/** Çok kelimeli arama: her sözcük metinde geçmeli. */
export function matchesSearch(
  card: Pick<FundCard, "searchText">,
  words: readonly string[],
): boolean {
  return words.every((word) => card.searchText.includes(word));
}

export type MarkPart = { text: string; mark: boolean };

/** Metinde sözcüklerin geçtiği yerler `<mark>` için işaretlenir (ZTO highlightInHtml). */
export function markParts(text: string, words: readonly string[]): MarkPart[] {
  if (!text || words.length === 0) return [{ text, mark: false }];
  const chars = Array.from(text);
  const folded = chars.map((ch) => searchKey(ch));
  // Katlanmış metindeki konum → karakter dizini.
  const starts: number[] = [];
  let pos = 0;
  for (const piece of folded) {
    starts.push(pos);
    pos += piece.length;
  }
  const joined = folded.join("");
  const marked = new Array<boolean>(chars.length).fill(false);
  for (const word of words) {
    let from = 0;
    for (;;) {
      const at = joined.indexOf(word, from);
      if (at < 0) break;
      for (let i = 0; i < chars.length; i++) {
        const end = starts[i] + folded[i].length;
        if (end > at && starts[i] < at + word.length) marked[i] = true;
      }
      from = at + Math.max(word.length, 1);
    }
  }
  const parts: MarkPart[] = [];
  chars.forEach((ch, i) => {
    const last = parts[parts.length - 1];
    if (last && last.mark === marked[i]) last.text += ch;
    else parts.push({ text: ch, mark: marked[i] });
  });
  return parts;
}

export type FilterType = "company" | "workplace" | "bank" | "currency";
export type ChipFilters = Partial<Record<FilterType, string | null>>;

export function chipValueOf(card: FundCard, type: FilterType): string {
  switch (type) {
    case "company":
      return card.companyName || UNDEFINED_LABEL;
    case "workplace":
      return card.workPlaceName || UNDEFINED_LABEL;
    case "bank":
      return card.chipKey;
    case "currency":
      return card.symbol || UNDEFINED_LABEL;
  }
}

/** Çip süzgeçleri + arama (ZTO applyCombinedFilters). */
export function filterCards(
  cards: readonly FundCard[],
  filters: ChipFilters,
  words: readonly string[],
): FundCard[] {
  const active = (Object.entries(filters) as Array<[FilterType, string | null | undefined]>).filter(
    ([, value]) => value !== null && value !== undefined,
  );
  return cards.filter(
    (card) =>
      active.every(([type, value]) => chipValueOf(card, type) === value) &&
      matchesSearch(card, words),
  );
}

export type StatItem = {
  value: string;
  label: string;
  count: number;
  /** ZTO paintFilterBars `--pct` (Tümü = 100). */
  pct: number;
  /** Görünür kartta yoksa ve etkin değilse `stat-item-empty`. */
  empty: boolean;
};

/**
 * Çip kartı öğeleri (ZTO updateDynamicFilterCards + paintFilterBars): öğeler tüm kartlardan
 * (sıra: sayı azalan, ad), sayılar görünür kartlardan; "Tümü" öğesi verilirse başta.
 */
export function statItems(
  all: readonly FundCard[],
  visible: readonly FundCard[],
  type: FilterType,
  active: string | null | undefined,
  allLabel?: string,
): StatItem[] {
  const labels = new Map<string, string>();
  const totals = new Map<string, number>();
  for (const card of all) {
    const value = chipValueOf(card, type);
    labels.set(value, type === "bank" ? card.chipLabel : value);
    totals.set(value, (totals.get(value) ?? 0) + 1);
  }
  const visibleCounts = new Map<string, number>();
  for (const card of visible) {
    const value = chipValueOf(card, type);
    visibleCounts.set(value, (visibleCounts.get(value) ?? 0) + 1);
  }
  const values = [...totals.keys()].sort(
    (a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0) || a.localeCompare(b, "tr"),
  );
  const sum = values.reduce((acc, v) => acc + (visibleCounts.get(v) ?? 0), 0);
  const items: StatItem[] = values.map((value) => {
    const count = visibleCounts.get(value) ?? 0;
    return {
      value,
      label: labels.get(value) ?? value,
      count,
      pct: sum > 0 ? Math.round((count / sum) * 100) : 0,
      empty: count === 0 && active !== value,
    };
  });
  if (allLabel !== undefined) {
    items.unshift({
      value: ALL_VALUE,
      label: allLabel,
      count: visible.length,
      pct: 100,
      empty: visible.length === 0 && !!active,
    });
  }
  return items;
}

/** Çip tıklaması (ZTO toggleDynamicFilter): aynı öğe kaldırır; "Tümü" süzgeci kaldırır. */
export function toggleChip(active: string | null | undefined, value: string): string | null {
  if (value === ALL_VALUE) return null;
  return active === value ? null : value;
}

export type CurrencyTotal = { currency: string; symbol: string; total: number };

/** Para birimi toplamları (sembol sırasıyla; ZTO OrderBy(CurrencySymbol)). */
export function currencyTotals(
  cards: readonly FundCard[],
  amount: (fund: Fund) => number = (f) => f.currentBalance,
): CurrencyTotal[] {
  const map = new Map<string, number>();
  for (const card of cards) {
    map.set(card.fund.currency, (map.get(card.fund.currency) ?? 0) + amount(card.fund));
  }
  return [...map.entries()]
    .map(([currency, total]) => ({ currency, symbol: currencySymbol(currency), total }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol, "tr"));
}

/**
 * Bakiye dağılım çubuğu (ZTO paintBalanceBars): kartın |bakiye|si, aynı grupta aynı para birimli
 * kartların |bakiye| toplamına oranı (yüzde, 2 hane).
 */
export function progressPct(card: FundCard, group: readonly FundCard[]): number {
  const total = group
    .filter((c) => c.fund.currency === card.fund.currency)
    .reduce((acc, c) => acc + Math.abs(c.fund.currentBalance), 0);
  if (total <= 0) return 0;
  return Math.round((Math.abs(card.fund.currentBalance) / total) * 10000) / 100;
}

export type TypeGroup = { type: FundAccountType; cards: FundCard[]; totals: CurrencyTotal[] };
export type CompanyGroup = {
  companyId: string | null;
  companyName: string;
  totals: CurrencyTotal[];
  types: TypeGroup[];
};

const byBankOrder = (a: FundCard, b: FundCard) =>
  a.fund.name.localeCompare(b.fund.name, "tr") ||
  (a.fund.bankBranchName ?? "").localeCompare(b.fund.bankBranchName ?? "", "tr");

function typeGroups(cards: readonly FundCard[]): TypeGroup[] {
  return ACCOUNT_TYPES.map((type) => {
    const members = cards
      .filter((c) => (c.fund.accountType ?? "DEMAND") === type)
      .sort(byBankOrder);
    return { type, cards: members, totals: currencyTotals(members) };
  }).filter((group) => group.cards.length > 0);
}

/**
 * Bankalar listesi grupları (ZTO GroupBy(AccountType), sıra Vadesiz/Kredi/Mevduat/Yatırım; grup içi
 * ad + şube adı). `byCompany` (≥ 2 şirket ve konsolide) iken önce şirket başlığı (Blackrose eki).
 */
export function groupBanks(cards: readonly FundCard[], byCompany: boolean): CompanyGroup[] {
  if (!byCompany) {
    return [{ companyId: null, companyName: "", totals: [], types: typeGroups(cards) }];
  }
  const companies = new Map<string, FundCard[]>();
  for (const card of cards) {
    const list = companies.get(card.fund.companyId) ?? [];
    list.push(card);
    companies.set(card.fund.companyId, list);
  }
  return [...companies.entries()]
    .map(([companyId, members]) => ({
      companyId,
      companyName: members[0].companyName,
      totals: currencyTotals(members),
      types: typeGroups(members),
    }))
    .sort((a, b) => a.companyName.localeCompare(b.companyName, "tr"));
}

export type CashGroupMode = "all" | "workplace" | "branch" | "currency" | "company";
export const CASH_GROUP_MODES: readonly CashGroupMode[] = [
  "all",
  "workplace",
  "branch",
  "currency",
  "company",
];

/** `?group=` (ZTO varsayılanı workplace); şirket kipi yalnız ≥ 2 şirkette. */
export function parseCashGroup(
  value: string | null | undefined,
  multiCompany: boolean,
): CashGroupMode {
  const lower = (value ?? "").trim().toLowerCase();
  if (lower === "company" && !multiCompany) return "workplace";
  return (CASH_GROUP_MODES as readonly string[]).includes(lower)
    ? (lower as CashGroupMode)
    : "workplace";
}

export type CashGroup = {
  key: string;
  name: string;
  icon: string;
  cards: FundCard[];
  totals: CurrencyTotal[];
};

const CASH_GROUP_ICON: Record<CashGroupMode, string> = {
  all: "fa-list",
  workplace: "fa-industry",
  branch: "fa-building",
  currency: "fa-coins",
  company: "fa-landmark",
};

/**
 * Kasalar grupları (ZTO _CashCardsListPartial: GroupBy(WorkPlaceID | BranchProvinceID | CurrencyID),
 * grup içi CashName sırası). `all` tek grup "Tüm Kasalar".
 */
export function groupCashes(
  cards: readonly FundCard[],
  mode: CashGroupMode,
  allLabel: string,
  unknownLabel: string,
): CashGroup[] {
  const keyOf = (card: FundCard): [string, string] => {
    switch (mode) {
      case "all":
        return ["all", allLabel];
      case "workplace":
        return [card.fund.branchId, card.workPlaceName || unknownLabel];
      case "branch":
        return [card.branchGroupName, card.branchGroupName || unknownLabel];
      case "currency":
        return [card.fund.currency, card.symbol];
      case "company":
        return [card.fund.companyId, card.companyName || unknownLabel];
    }
  };
  const groups = new Map<string, CashGroup>();
  for (const card of cards) {
    const [key, name] = keyOf(card);
    const group = groups.get(key) ?? {
      key,
      name,
      icon: CASH_GROUP_ICON[mode],
      cards: [],
      totals: [],
    };
    group.cards.push(card);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      cards: [...group.cards].sort((a, b) => a.fund.name.localeCompare(b.fund.name, "tr")),
      totals: currencyTotals(group.cards),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

/** Kasalar gruplama sekmesi sayıları (ZTO type-tabs `.count`). */
export function cashGroupCounts(cards: readonly FundCard[]): Record<CashGroupMode, number> {
  const distinct = (values: string[]) => new Set(values).size;
  return {
    all: cards.length,
    workplace: distinct(cards.map((c) => c.fund.branchId)),
    branch: distinct(cards.map((c) => c.branchGroupName)),
    currency: distinct(cards.map((c) => c.fund.currency)),
    company: distinct(cards.map((c) => c.fund.companyId)),
  };
}

export type CurrencyStat = {
  currency: string;
  symbol: string;
  total: number;
  count: number;
  opening: number;
};

/**
 * Özet kartları (`/funds/summary` satırları): hesap türü başına para birimi toplamları. Tür
 * süzgecinden bağımsız (ZTO B1 düzeltmesi); şirket seçiliyse sunucu yalnız o şirketi döndürür.
 */
export function summaryByType(
  rows: readonly FundSummaryRow[],
  kind: FundKind,
): Record<FundAccountType, { count: number; currencies: CurrencyStat[] }> {
  const result = Object.fromEntries(
    ACCOUNT_TYPES.map((type) => [type, { count: 0, currencies: [] as CurrencyStat[] }]),
  ) as Record<FundAccountType, { count: number; currencies: CurrencyStat[] }>;
  for (const row of rows) {
    if (row.kind !== kind) continue;
    const bucket = result[row.accountType];
    if (!bucket) continue;
    bucket.count += row.count;
    const existing = bucket.currencies.find((c) => c.currency === row.currency);
    if (existing) {
      existing.total += row.currentBalance;
      existing.count += row.count;
      existing.opening += row.openingTotal;
    } else {
      bucket.currencies.push({
        currency: row.currency,
        symbol: currencySymbol(row.currency),
        total: row.currentBalance,
        count: row.count,
        opening: row.openingTotal,
      });
    }
  }
  for (const bucket of Object.values(result)) {
    bucket.currencies.sort((a, b) => a.symbol.localeCompare(b.symbol, "tr"));
  }
  return result;
}

/** Hesap türü sekmesi sayıları (süzgeçsiz listeden). */
export function typeCounts(funds: readonly Fund[]): Record<FundAccountType | "ALL", number> {
  const counts = { ALL: funds.length, DEMAND: 0, CREDIT: 0, DEPOSIT: 0, INVESTMENT: 0 };
  for (const fund of funds) counts[fund.accountType ?? "DEMAND"] += 1;
  return counts;
}

/** Kasalar dört kartı: para birimi başına toplam/ortalama/açılış; farklı şube grubu ve para birimi sayısı. */
export function cashStats(cards: readonly FundCard[]) {
  const map = new Map<string, CurrencyStat>();
  for (const card of cards) {
    const stat = map.get(card.fund.currency) ?? {
      currency: card.fund.currency,
      symbol: card.symbol,
      total: 0,
      count: 0,
      opening: 0,
    };
    stat.total += card.fund.currentBalance;
    stat.count += 1;
    stat.opening += card.fund.openingBalance;
    map.set(card.fund.currency, stat);
  }
  const currencies = [...map.values()].sort((a, b) => a.symbol.localeCompare(b.symbol, "tr"));
  return {
    currencies: currencies.map((c) => ({ ...c, average: c.total / c.count })),
    branchCount: new Set(cards.map((c) => c.branchGroupName)).size,
    currencyCount: currencies.length,
  };
}

/** Bakiye rengi (ZTO): Kredi her zaman kırmızı; diğerleri ≥ 0 yeşil, < 0 kırmızı. */
export function balanceClass(fund: Pick<Fund, "accountType" | "currentBalance">): string {
  if (fund.accountType === "CREDIT") return "text-danger";
  return fund.currentBalance >= 0 ? "text-success" : "text-danger";
}

/** Silme engeli sıra ve metin anahtarları (ZTO CheckCanDelete mesaj sırası + Blackrose türleri). */
export const DELETE_REASON_ORDER = [
  "FUND_TRANSACTION",
  "PAYMENT",
  "COLLECTION",
  "SETTLEMENT",
  "INSTRUMENT",
  "FUND_TRANSFER",
  "INTERCOMPANY_TRANSFER",
  "VEHICLE_EXPENSE",
  "BANK_STATEMENT_LINE",
] as const;

export type DeleteReasonTexts = {
  /** "Bu hesaba bağlı işlemler var:" / "Bu kasaya bağlı işlemler var:" (ardından boşluk eklenir). */
  intro: string;
  /** ". Silmek için önce bu işlemleri silmeniz gerekiyor." */
  outro: string;
  /** "Şirketin varsayılan banka hesabıdır." */
  companyDefault: string;
  /** Tür + sayı → "3 adet banka işlemi". */
  item: (kind: string, count: number) => string;
};

/**
 * ZTO silme engeli cümlesi (BankIntroductionController.cs:828-899): sıfır olanlar atlanır; varsayılan
 * şirket hesabı ayrı cümle.
 */
export function deleteBlockedReason(
  reasons: readonly FundDeleteReason[],
  texts: DeleteReasonTexts,
): string {
  const order = (kind: string) => {
    const index = (DELETE_REASON_ORDER as readonly string[]).indexOf(kind);
    return index < 0 ? DELETE_REASON_ORDER.length : index;
  };
  const items = reasons
    .filter((r) => r.count > 0 && r.kind !== "COMPANY_DEFAULT")
    .sort((a, b) => order(a.kind) - order(b.kind))
    .map((r) => texts.item(r.kind, r.count));
  const sentences: string[] = [];
  if (items.length > 0) sentences.push(`${texts.intro} ${items.join(", ")}${texts.outro}`);
  if (reasons.some((r) => r.kind === "COMPANY_DEFAULT" && r.count > 0)) {
    sentences.push(texts.companyDefault);
  }
  return sentences.join(" ");
}

/** Detay sayfasında "Son İşlemler" / CI-1 tablosu: sembol para biriminden, işaret yönden (ZTO B3). */
export function signedAmountText(direction: "IN" | "OUT", formatted: string): string {
  return `${direction === "IN" ? "+" : "-"}${formatted}`;
}

/**
 * Ödeme / tahsilat bağlantısı: MUI ödeme penceresi yeni sekmede, fon ön seçili (OK-12.2-22; ZTO
 * BankTransactions?openModal / openCollection yerine).
 */
export function settlementPath(
  type: "PAYMENT" | "COLLECTION",
  kind: FundKind,
  fundId?: string,
): string {
  const params = new URLSearchParams({ new: type, method: kind });
  if (fundId) params.set("fundAccountId", fundId);
  return `/finance/settlements?${params.toString()}`;
}

/** "Ödeme Onay Yönetimi" rozetleri (ZTO sırası; Talimat Verildi 12.4'e kadar 0 — OK-12.2-25). */
export const APPROVAL_BADGES = [
  { status: "DRAFT", gradient: "linear-gradient(135deg, #94a3b8, #64748b)" },
  { status: "PENDING", gradient: "linear-gradient(135deg, #f59e0b, #d97706)" },
  { status: "APPROVED", gradient: "linear-gradient(135deg, #10b981, #059669)" },
  { status: "REJECTED", gradient: "linear-gradient(135deg, #ef4444, #dc2626)" },
  { status: "ORDERED", gradient: "linear-gradient(135deg, #3b82f6, #2563eb)" },
  { status: "PAID", gradient: "linear-gradient(135deg, #8b5cf6, #7c3aed)" },
] as const;
