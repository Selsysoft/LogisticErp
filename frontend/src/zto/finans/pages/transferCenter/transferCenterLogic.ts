import type {
  Fund,
  FundKind,
  FundTransactionRow,
  FundTransferBody,
  FundTransferType,
  IntercompanyReasonType,
  IntercompanyTransferBody,
  RateOperation,
  TransferCollectionState,
  TransferCostBody,
  TransferListRow,
  TransferListType,
  TransferSourceBody,
  TransferSummaryGroup,
  TransferSummaryRow,
} from "../../../../pages/finance/types";
import type { BranchTree } from "../../../../pages/organization/types";
import { currencySymbol, toIsoDate } from "../../../format";
import { canonicalTransferType, type TransferCenterTab } from "../../navItems";
import {
  round,
  toCalcMode,
  toRateOperation,
  type CalcOperation,
  type ZtoCalcMode,
} from "./fxCalcLogic";
import {
  allowsIntercompany,
  type BankCashDirection,
  type TransferMode,
  type VirmanSubType,
} from "./transferRulesLogic";

/*
 * Transfer Merkezi saf mantığı (12.2_TASARIM §5.11): derin bağlantı (ZTO bsjs
 * `handleTabAndTransferFromQuery` :102-227), istemci doğrulaması (`saveTransfer` :3133-3308), istek
 * gövdeleri, BS-12 eşiği, iptal tarihi, hata kodu → metin anahtarı, liste/ekstre rozetleri. Metinler
 * `ztoFinans:transferCenter.*` anahtarlarıdır.
 */

// ---------------------------------------------------------------------------------------------
// Tarihler (yerel takvim; toISOString yasak — MWG capture-location-agnostic-data)
// ---------------------------------------------------------------------------------------------

/** Bugünün yerel takvim tarihi ("yyyy-MM-dd"). */
export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now) as string;
}

/** ISO takvim tarihine gün ekler (yerel takvimde; saat dilimi kayması yok). */
export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return toIsoDate(new Date(year, month - 1, day + days)) as string;
}

/** Süzgeç varsayılanı: −7 / +1 gün (ZTO ViewBag.DefaultStartDate/EndDate). */
export function defaultRange(today: string = todayIso()): { from: string; to: string } {
  return { from: addDays(today, -7), to: addDays(today, 1) };
}

/** BS-10 iptal tarihi: max(bugün, transfer tarihi) — ileri tarihli transfer kendi tarihinde (§3.3.2). */
export function reverseDate(transferDate: string, today: string = todayIso()): string {
  return transferDate > today ? transferDate : today;
}

// ---------------------------------------------------------------------------------------------
// Derin bağlantı
// ---------------------------------------------------------------------------------------------

const TABS: readonly TransferCenterTab[] = ["new", "transfers", "bank", "cash"];

export type DeepLink = {
  tab: TransferCenterTab;
  /** null: tür parametresi yok (ZTO varsayılanı Virman kartı, alt tür boş). */
  mode: TransferMode | null;
  subType: VirmanSubType;
  direction: BankCashDirection;
  sourceBranchId: string;
  targetBranchId: string;
  sourceFundId: string;
  targetFundId: string;
  /** Transferler sekmesi araması (`?tab=transfers&q=<kod>`, §3.2.7 kaynak bağlantısı). */
  q: string;
  /**
   * Transferler sekmesi tarih aralığı (`&from=<transferDate>&to=<transferDate>`, F-12.2-R2): yalnız
   * geçerli ISO YYYY-MM-DD; değilse "" (sekme varsayılan aralığı kullanır).
   */
  from: string;
  to: string;
};

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Geçerli bir takvim günü olan "YYYY-MM-DD" değeri; değilse "". */
export function isoDayOrEmpty(value: string): string {
  const match = ISO_DAY.exec(value);
  if (!match) return "";
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? value
    : "";
}

/**
 * Transferler sekmesinin ilk tarih aralığı: bağlantı tarihleri verilmişse onlar (tek taraf
 * verilmişse diğer taraf da o gün; ters sırada verilmişse yer değiştirir), yoksa `defaultRange()`.
 */
export function linkRange(
  from: string,
  to: string,
  today: string = todayIso(),
): { from: string; to: string } {
  if (!from && !to) return defaultRange(today);
  const start = from || to;
  const end = to || from;
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

const DIRECTIONS: Record<string, BankCashDirection> = {
  banktocash: "BANK_TO_CASH",
  bank_to_cash: "BANK_TO_CASH",
  cashtobank: "CASH_TO_BANK",
  cash_to_bank: "CASH_TO_BANK",
  cashtocash: "CASH_TO_CASH",
  cash_to_cash: "CASH_TO_CASH",
};

/**
 * `?tab&transferType&sourceFundId&sourceBranchId&targetFundId&targetBranchId&direction&q&from&to`. Tür ZTO
 * adlarıyla (takma adlar çözülür, bilinmeyen değer Virman — `resolveVirmanSubType`); `bankcash` /
 * `cashbank` / `cashcash` yönü belirler, `direction` yalnız Banka & Kasa'da geçerli bir değerse onu ezer.
 */
export function parseDeepLink(search: string | URLSearchParams): DeepLink {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const get = (name: string) => (params.get(name) ?? "").trim();
  const tabParam = get("tab").toLowerCase() as TransferCenterTab;
  const rawType = get("transferType");
  const link: DeepLink = {
    tab: TABS.includes(tabParam) ? tabParam : "new",
    mode: null,
    subType: "",
    direction: "",
    sourceBranchId: get("sourceBranchId"),
    targetBranchId: get("targetBranchId"),
    sourceFundId: get("sourceFundId"),
    targetFundId: get("targetFundId"),
    q: get("q"),
    from: isoDayOrEmpty(get("from")),
    to: isoDayOrEmpty(get("to")),
  };
  if (rawType) {
    const type = canonicalTransferType(rawType);
    if (type === "exchange" || type === "dovizbozum") {
      link.mode = "FX";
    } else if (type === "bankcash" || type === "bankadankasaya") {
      link.mode = "BANKCASH";
      link.direction = "BANK_TO_CASH";
    } else if (type === "cashbank" || type === "kasadanbankaya") {
      link.mode = "BANKCASH";
      link.direction = "CASH_TO_BANK";
    } else if (type === "cashcash" || type === "kasadankasaya") {
      link.mode = "BANKCASH";
      link.direction = "CASH_TO_CASH";
    } else {
      link.mode = "VIRMAN";
      link.subType = type === "eft" ? "EFT" : type === "havale" ? "WIRE" : "VIREMENT";
    }
  }
  const direction = DIRECTIONS[get("direction").toLowerCase()];
  if (link.mode === "BANKCASH" && direction) link.direction = direction;
  return link;
}

/** Derin bağlantı yeni transfer formunu ön dolduruyor mu. */
export function hasPrefill(link: DeepLink): boolean {
  return (
    link.tab === "new" &&
    (link.mode !== null ||
      !!link.sourceBranchId ||
      !!link.targetBranchId ||
      !!link.sourceFundId ||
      !!link.targetFundId)
  );
}

export type DeepLinkStep =
  | { kind: "type"; mode: TransferMode; subType: VirmanSubType; direction: BankCashDirection }
  | { kind: "sourceBranch"; branchId: string }
  | { kind: "targetBranch"; branchId: string }
  | { kind: "sourceFund"; fundId: string }
  | { kind: "targetFund"; fundId: string };

/**
 * Ön doldurma adımları, ZTO sırasıyla: tür → kaynak iş yeri → hedef iş yeri → bekleyen kaynak/hedef
 * fon (iş yeri seçimiyle fon listesi dolunca uygulanır). İş yeri verilmemiş ama fon verilmişse fonun
 * iş yeri listeden türetilir ("EFT Al": hedef iş yeri önce, sonra hedef banka — F4).
 */
export function deepLinkSteps(link: DeepLink, funds: readonly Pick<Fund, "id" | "branchId">[]) {
  const branchOf = (fundId: string) => funds.find((fund) => fund.id === fundId)?.branchId ?? "";
  const steps: DeepLinkStep[] = [];
  if (link.mode) {
    steps.push({ kind: "type", mode: link.mode, subType: link.subType, direction: link.direction });
  }
  const sourceBranchId =
    link.sourceBranchId || (link.sourceFundId ? branchOf(link.sourceFundId) : "");
  const targetBranchId =
    link.targetBranchId || (link.targetFundId ? branchOf(link.targetFundId) : "");
  if (sourceBranchId) steps.push({ kind: "sourceBranch", branchId: sourceBranchId });
  // Virman'da hedef iş yeri kaynağa kilitlidir; ayrı hedef iş yeri adımı yazılmaz.
  const lockedTarget = link.mode === "VIRMAN" && link.subType === "VIREMENT";
  if (targetBranchId && !lockedTarget)
    steps.push({ kind: "targetBranch", branchId: targetBranchId });
  if (link.sourceFundId) steps.push({ kind: "sourceFund", fundId: link.sourceFundId });
  if (link.targetFundId) steps.push({ kind: "targetFund", fundId: link.targetFundId });
  return steps;
}

// ---------------------------------------------------------------------------------------------
// İş yeri dizini ve seçenek metinleri
// ---------------------------------------------------------------------------------------------

export type BranchInfo = {
  name: string;
  groupName: string;
  companyId: string | null;
  companyName: string;
};

/** İş yeri kimliği → ad, şube (grup) adı ve şirket (seçenek metinleri, şirket kipi). */
export function branchIndex(tree: BranchTree | undefined): Map<string, BranchInfo> {
  const index = new Map<string, BranchInfo>();
  for (const company of tree ?? []) {
    for (const group of company.groups) {
      for (const branch of group.branches) {
        index.set(branch.id, {
          name: branch.name,
          groupName: group.groupName,
          companyId: company.companyId,
          companyName: company.companyName,
        });
      }
    }
  }
  return index;
}

/**
 * Banka & Kasa bölümündeki düz iş yeri listesi (ZTO `ViewBag.WorkPlaces`, optgroup yok); ≥ 2 şirkette
 * "Şirket › İş yeri". Yalnız aktif iş yerleri; `companyId` verilirse o şirketinkiler.
 */
export function flatBranchOptions(
  tree: BranchTree | undefined,
  companyId: string | null,
  multiCompany: boolean,
): Array<{ value: string; label: string }> {
  return (tree ?? [])
    .filter((company) => companyId === null || company.companyId === companyId)
    .flatMap((company) =>
      company.groups.flatMap((group) =>
        group.branches
          .filter((branch) => branch.active)
          .map((branch) => ({
            value: branch.id,
            label: multiCompany ? `${company.companyName} › ${branch.name}` : branch.name,
          })),
      ),
    );
}

/** ZTO banka seçeneği: "BankName - (sym) [İş yeri - Şube]" (bsjs:1503). */
export function bankOptionLabel(fund: Fund, branches: Map<string, BranchInfo>): string {
  const info = branches.get(fund.branchId);
  const where = info ? ` [${info.name} - ${info.groupName}]` : "";
  return `${fund.bankName ?? fund.name} - (${currencySymbol(fund.currency)})${where}`;
}

/** ZTO kasa seçeneği: "CashName - (sym)" (bsjs:1185). */
export function cashOptionLabel(fund: Fund): string {
  return `${fund.name} - (${currencySymbol(fund.currency)})`;
}

export function fundOptionLabel(fund: Fund, branches: Map<string, BranchInfo>): string {
  return fund.kind === "BANK" ? bankOptionLabel(fund, branches) : cashOptionLabel(fund);
}

// ---------------------------------------------------------------------------------------------
// Doğrulama ve istek gövdeleri
// ---------------------------------------------------------------------------------------------

export type DraftField =
  "direction" | "source" | "target" | "amount" | "date" | "type" | "calcMode" | "rate" | "reason";

export type TransferDraft = {
  mode: TransferMode;
  subType: VirmanSubType;
  direction: BankCashDirection;
  date: string;
  source: Fund | null;
  target: Fund | null;
  amount: number;
  calcMode: ZtoCalcMode | "";
  rate: number;
  /** Şirketler arası kipte "Transfer Nedeni *". */
  intercompany: boolean;
  reason: IntercompanyReasonType | "";
};

export type DraftError = { field: DraftField; key: string };

/**
 * İstemci doğrulaması, ZTO sırası ve metinleriyle (bsjs:3133-3308; `alert()` yerine alan hatası +
 * üstte uyarı). Şirketler arası kipte ek "Transfer nedeni seçiniz.".
 */
export function validateDraft(draft: TransferDraft): DraftError | null {
  const { source, target } = draft;
  if (draft.mode === "BANKCASH") {
    if (!draft.direction) return { field: "direction", key: "validation.direction" };
    if (!source) return { field: "source", key: "validation.source" };
    if (!target) return { field: "target", key: "validation.target" };
    if (draft.direction === "CASH_TO_CASH" && source.id === target.id) {
      return { field: "target", key: "validation.sameCash" };
    }
    if (source.currency !== target.currency) {
      return { field: "target", key: "validation.currency" };
    }
  } else {
    if (!source || !target) {
      return { field: source ? "target" : "source", key: "validation.banks" };
    }
    if (source.id === target.id) return { field: "target", key: "validation.sameBank" };
  }
  if (!(draft.amount > 0)) return { field: "amount", key: "validation.amount" };
  if (!draft.date) return { field: "date", key: "validation.date" };
  if (draft.mode === "VIRMAN" && !draft.subType) return { field: "type", key: "validation.type" };
  if (draft.mode === "FX" && !draft.calcMode) {
    return { field: "calcMode", key: "validation.calcMode" };
  }
  if (draft.mode === "FX" && !(draft.rate > 0)) return { field: "rate", key: "validation.rate" };
  if (draft.intercompany && !draft.reason) return { field: "reason", key: "validation.reason" };
  return null;
}

const money = (amount: number, currency: string) => ({ amount: amount.toFixed(2), currency });
const optional = (text: string) => (text.trim() === "" ? undefined : text.trim());

export type FxExtras = {
  targetAmount: number;
  rate: number;
  operation: CalcOperation;
  calcMode: ZtoCalcMode;
  kmvRate: number;
  commission: number;
  fee: number;
  costFundId: string;
  sources: TransferSourceBody[];
};

/** Şirket içi transfer gövdesi (`POST /funds/transfers`); FX'te kur, masraf ve kaynaklar eklenir. */
export function buildTransferBody(
  draft: TransferDraft & { description: string; documentNo: string },
  type: FundTransferType,
  fx?: FxExtras,
): FundTransferBody {
  const source = draft.source as Fund;
  const target = draft.target as Fund;
  const body: FundTransferBody = {
    transferType: type,
    fromFundId: source.id,
    toFundId: target.id,
    money: money(draft.amount, source.currency),
    date: draft.date,
    documentNo: optional(draft.documentNo),
    description: optional(draft.description),
  };
  if (type === "FX_EXCHANGE" && fx) {
    body.targetMoney = money(fx.targetAmount, target.currency);
    body.rate = round(fx.rate, 6);
    body.rateOperation = toRateOperation(fx.operation);
    body.calcMode = toCalcMode(fx.calcMode);
    const costs: TransferCostBody[] = [];
    const costFund = fx.costFundId || undefined;
    if (fx.kmvRate > 0) costs.push({ kind: "KMV", ratePercent: fx.kmvRate });
    if (fx.commission > 0) {
      costs.push({ kind: "COMMISSION", fundAccountId: costFund, amount: round(fx.commission) });
    }
    if (fx.fee > 0) costs.push({ kind: "FEE", fundAccountId: costFund, amount: round(fx.fee) });
    if (costs.length > 0) body.costs = costs;
    if (fx.sources.length > 0) body.sources = fx.sources;
  }
  return body;
}

/** Şirketler arası virman gövdesi (`POST /intercompany-transfers`). */
export function buildIntercompanyBody(
  draft: TransferDraft & { description: string; documentNo: string },
  type: FundTransferType,
): IntercompanyTransferBody {
  const source = draft.source as Fund;
  const target = draft.target as Fund;
  if (!allowsIntercompany(type)) throw new Error(`Şirketler arası tür değil: ${type}`);
  return {
    transferType: type as IntercompanyTransferBody["transferType"],
    reasonType: draft.reason as IntercompanyReasonType,
    fromFundId: source.id,
    toFundId: target.id,
    money: money(draft.amount, source.currency),
    date: draft.date,
    documentNo: optional(draft.documentNo),
    description: optional(draft.description),
  };
}

export type NegativeBalance = { before: number; outgoing: number; after: number };

/**
 * BS-12: yalnız eksi bakiyeye izinli kaynakta ve `bakiye − tutar − (aynı fondan masraflar) < 0` iken
 * onay penceresi; izinsiz kaynakta pencere açılmaz, sunucu 409 INSUFFICIENT_FUNDS verir (C7).
 */
export function negativeBalance(
  source: Pick<Fund, "balance" | "allowNegative"> | null,
  amount: number,
  sameFundCosts = 0,
): NegativeBalance | null {
  if (!source || !source.allowNegative) return null;
  const outgoing = round(amount + sameFundCosts);
  const after = round(source.balance - outgoing);
  return after < 0 ? { before: source.balance, outgoing, after } : null;
}

// ---------------------------------------------------------------------------------------------
// Şirketler arası metinler (§3.4.1 adım 8; ZTO `updateTransferReasonDropdownTexts` :842-869)
// ---------------------------------------------------------------------------------------------

/** "Transfer Nedeni" seçenek metni; iş yeri yerine şirket kısa adı. */
export function intercompanyReasonText(reason: IntercompanyReasonType, a: string, b: string) {
  return reason === "DEBT_PAID"
    ? `${a} - ${b} 'YE BORCUNU ÖDÜYOR / ${b} - ${a} 'TAN ALACAĞINI TAHSİL EDİYOR`
    : `${a} - ${b} 'YE BORÇ VERİYOR / ${b} - ${a} 'TAN BORÇ ALIYOR`;
}

/** Bilgi kutusunun ek satırı (Blackrose). */
export function intercompanyInfoText(a: string, b: string): string {
  return `Şirketler arası transfer: ${a} → ${b}. Grup şirketi carilerine otomatik kayıt oluşur.`;
}

// ---------------------------------------------------------------------------------------------
// Hata kodları (§3.11) → metin anahtarı
// ---------------------------------------------------------------------------------------------

const ERROR_CODES = new Set([
  "FUND_INACTIVE",
  "COMPANY_MISMATCH",
  "CURRENCY_MISMATCH",
  "TARGET_AMOUNT_REQUIRED",
  "RATE_REQUIRED",
  "FX_AMOUNT_MISMATCH",
  "KMV_REQUIRES_TRY",
  "TRANSFER_NOT_FOUND",
  "INTERCOMPANY_TRANSFER_NOT_FOUND",
  "IDEMPOTENCY_KEY_REUSED",
  "IDEMPOTENCY_IN_PROGRESS",
  "DATE_RANGE_TOO_LARGE",
]);

/**
 * Sunucu kodu için ön yüz metni anahtarı (`errors.<KOD>`); ZTO metni sunucu iletisinde olan kodlarda
 * (TRANSFER_RULE_VIOLATION, FX_SOURCE_EXCEEDED, RATE_MISSING, INSUFFICIENT_FUNDS …) null → sunucu iletisi.
 * TRANSFER_SAME_FUND kasa/banka ayrımlı.
 */
export function errorKey(code: string | null | undefined, kind?: FundKind): string | null {
  if (!code) return null;
  if (code === "TRANSFER_SAME_FUND") {
    return kind === "CASH" ? "validation.sameCash" : "validation.sameBank";
  }
  return ERROR_CODES.has(code) ? `errors.${code}` : null;
}

/** ApiError gövdesinden kod ve ileti (kod yoksa null). */
export function errorParts(error: unknown): { code: string | null; message: string | null } {
  const body = (error as { body?: { code?: string; message?: string } } | null)?.body;
  const message =
    body?.message ?? (error instanceof Error && error.message ? error.message : null) ?? null;
  return { code: body?.code ?? null, message };
}

// ---------------------------------------------------------------------------------------------
// Transferler sekmesi
// ---------------------------------------------------------------------------------------------

/** Transfer türü etiket anahtarı (`types.<TÜR>`; şirketler arası `types.INTERCOMPANY`). */
export function typeLabelKey(type: FundTransferType | "INTERCOMPANY"): string {
  return `types.${type}`;
}

/** Liste satırının tür anahtarı: şirketler arası satırlar "Şirketler Arası" + tür. */
export function rowTypeKey(row: Pick<TransferListRow, "recordType" | "transferType">): string {
  return row.recordType === "INTERCOMPANY" ? "types.INTERCOMPANY" : typeLabelKey(row.transferType);
}

/** `transfer-badge` sınıfı (bsjs:3383-3395) + Blackrose `intercompany`. */
export function transferBadgeClass(row: Pick<TransferListRow, "recordType" | "transferType">) {
  if (row.recordType === "INTERCOMPANY") return "intercompany";
  switch (row.transferType) {
    case "EFT":
      return "eft";
    case "WIRE":
      return "havale";
    case "FX_EXCHANGE":
      return "doviz";
    case "BANK_TO_CASH":
    case "CASH_TO_BANK":
    case "CASH_TO_CASH":
      return "bankcash";
    default:
      return "virman";
  }
}

/** "Tahsilat / Cari" durum rozeti (bsjs `getExchangeStatusBadge` :3991-4005). */
export function collectionBadge(state: TransferCollectionState | null | undefined): {
  className: string;
  key: string;
} {
  switch (state) {
    case "COMPLETE":
      return { className: "badge badge-success", key: "collectionState.COMPLETE" };
    case "PARTIAL":
      return { className: "badge badge-warning", key: "collectionState.PARTIAL" };
    case "PENDING":
      return { className: "badge badge-secondary", key: "collectionState.PENDING" };
    case "CANCELLED":
      return { className: "badge badge-danger", key: "collectionState.CANCELLED" };
    default:
      return { className: "badge badge-secondary", key: "collectionState.NONE" };
  }
}

/** "Kur / Yön" döviz satırı: "/ 33,1234 ₺" ya da "x 0,0302 $" (bsjs:3399-3405). */
export function rateText(
  rate: number | null,
  operation: RateOperation | null,
  sourceCurrency: string,
  targetCurrency: string,
): { symbol: string; value: string; currency: string } {
  const divide = operation !== "MULTIPLY";
  return {
    symbol: divide ? "/" : "x",
    value: (rate ?? 1).toFixed(4),
    currency: currencySymbol(divide ? sourceCurrency : targetCurrency),
  };
}

/** Özet kartlarının sırası ve renkleri (BS:1128-1165; B12 "Virman / EFT / Havale"). */
export const SUMMARY_CARDS: ReadonlyArray<{
  group: TransferSummaryGroup;
  className: string;
  key: string;
  multiOnly?: boolean;
}> = [
  { group: "VIREMENT_EFT_WIRE", className: "bg-primary text-white", key: "summary.virmanEftWire" },
  { group: "FX_EXCHANGE", className: "bg-warning text-dark", key: "summary.fx" },
  { group: "BANK_TO_CASH", className: "bg-info text-white", key: "summary.bankToCash" },
  { group: "CASH_TO_BANK", className: "bg-danger text-white", key: "summary.cashToBank" },
  { group: "CASH_TO_CASH", className: "bg-secondary text-white", key: "summary.cashToCash" },
  { group: "TOTAL", className: "bg-success text-white", key: "summary.total" },
  {
    group: "INTERCOMPANY",
    className: "bg-dark text-white",
    key: "summary.intercompany",
    multiOnly: true,
  },
];

/** Grup adedi (yoksa 0). */
export function summaryCount(
  rows: readonly TransferSummaryRow[] | undefined,
  group: TransferSummaryGroup,
) {
  return rows?.find((row) => row.group === group)?.count ?? 0;
}

/** "Transfer Tipi" süzgeç seçenekleri (Tümü + yedi tür; ≥ 2 şirkette Şirketler Arası). */
export function typeFilterOptions(multiCompany: boolean): Array<TransferListType | ""> {
  const base: Array<TransferListType | ""> = [
    "",
    "VIREMENT",
    "EFT",
    "WIRE",
    "FX_EXCHANGE",
    "BANK_TO_CASH",
    "CASH_TO_BANK",
    "CASH_TO_CASH",
  ];
  return multiCompany ? [...base, "INTERCOMPANY"] : base;
}

/** DataTables dili (bsjs:3500-3507 birebir; yer tutucular ZtoDataTable'da doldurulur). */
export const TRANSFERS_LANGUAGE = {
  lengthMenu: "_MENU_ kayıt",
  info: "Toplam _TOTAL_ kayıt — _START_–_END_ gösteriliyor",
  infoEmpty: "Toplam 0 kayıt — 0–0 gösteriliyor",
  emptyTable: "Kayıt yok",
  zeroRecords: "Kayıt yok",
  search: "",
} as const;

/** Ekstre tabloları dili (Blackrose sayfalaması; ZTO tablo boş metni "Kayıt yok"). */
export const STATEMENT_LANGUAGE = {
  info: "Toplam _TOTAL_ kayıt — _START_–_END_ gösteriliyor",
  infoEmpty: "Toplam 0 kayıt — 0–0 gösteriliyor",
  emptyTable: "Kayıt yok",
  zeroRecords: "Kayıt yok",
} as const;

/** Düzenleme modalı başlığı/rengi (BS:1872-2629). */
export function editModalStyle(type: FundTransferType): {
  headerClassName: string;
  icon: string;
  titleKey: string;
  saveClassName: string;
} {
  switch (type) {
    case "FX_EXCHANGE":
      return {
        headerClassName: "bg-warning",
        icon: "fas fa-coins",
        titleKey: "edit.titleFx",
        saveClassName: "btn btn-success edit-save-btn",
      };
    case "EFT":
      return {
        headerClassName: "bg-info text-white",
        icon: "fas fa-exchange-alt",
        titleKey: "edit.titleEft",
        saveClassName: "btn btn-info",
      };
    case "WIRE":
      return {
        headerClassName: "bg-secondary text-white",
        icon: "fas fa-paper-plane",
        titleKey: "edit.titleHavale",
        saveClassName: "btn btn-secondary",
      };
    case "BANK_TO_CASH":
      return {
        headerClassName: "bg-success text-white",
        icon: "fas fa-arrow-circle-right",
        titleKey: "edit.titleBankToCash",
        saveClassName: "btn btn-success",
      };
    case "CASH_TO_BANK":
      return {
        headerClassName: "bg-danger text-white",
        icon: "fas fa-arrow-circle-left",
        titleKey: "edit.titleCashToBank",
        saveClassName: "btn btn-danger",
      };
    case "CASH_TO_CASH":
      return {
        headerClassName: "bg-secondary text-white",
        icon: "fas fa-random",
        titleKey: "edit.titleCashToCash",
        saveClassName: "btn btn-secondary",
      };
    default:
      return {
        headerClassName: "bg-primary text-white",
        icon: "fas fa-random",
        titleKey: "edit.titleVirman",
        saveClassName: "btn btn-primary",
      };
  }
}

/** Düzenlemede kaynak/hedef hesap türleri. */
export function kindsOf(type: FundTransferType): [FundKind, FundKind] {
  switch (type) {
    case "BANK_TO_CASH":
      return ["BANK", "CASH"];
    case "CASH_TO_BANK":
      return ["CASH", "BANK"];
    case "CASH_TO_CASH":
      return ["CASH", "CASH"];
    default:
      return ["BANK", "BANK"];
  }
}

// ---------------------------------------------------------------------------------------------
// Ekstre sekmeleri
// ---------------------------------------------------------------------------------------------

/** Ekstre "Tür" rozeti sınıfı (bsjs `getStatementTypeBadge` :4247-4274; yön + muhasebe tipi). */
export function statementBadgeClass(row: Pick<FundTransactionRow, "accountingType" | "direction">) {
  switch (row.accountingType) {
    case "EFT":
      return "eft";
    case "WIRE":
      return "havale";
    case "FX_EXCHANGE":
      return "doviz";
    case "BANK_TO_CASH":
    case "CASH_TO_BANK":
    case "CASH_TO_CASH":
      return "bankcash";
    case "VIREMENT":
    case "LEGACY_TRANSFER":
    case "INTERCOMPANY":
      return "virman";
    default:
      return row.direction === "IN" ? "in" : "out";
  }
}

/** Ekstre "Tür" metni anahtarı (`accountingTypes.<DEĞER>`; bilinmeyen değer yön metni). */
export const ACCOUNTING_TYPES = [
  "INTERCOMPANY",
  "ACCOUNT_PAYMENT",
  "ACCOUNT_COLLECTION",
  "EXPENSE",
  "INCOME",
  "OTHER",
  "VIREMENT",
  "EFT",
  "WIRE",
  "FX_EXCHANGE",
  "BANK_TO_CASH",
  "CASH_TO_BANK",
  "CASH_TO_CASH",
  "TRANSFER_COST",
  "LEGACY_TRANSFER",
  "CHECK_COLLECTION",
  "NOTE_COLLECTION",
  "CHECK_PAYMENT",
  "NOTE_PAYMENT",
  "OPENING",
  "CREDIT_DRAWDOWN",
  "NET_SALARY",
] as const;

export function statementTypeKey(row: Pick<FundTransactionRow, "accountingType" | "direction">) {
  return (ACCOUNTING_TYPES as readonly string[]).includes(row.accountingType)
    ? `accountingTypes.${row.accountingType}`
    : row.direction === "IN"
      ? "statement.in"
      : "statement.out";
}

// ---------------------------------------------------------------------------------------------
// Döviz bozumu kaynak seçimi
// ---------------------------------------------------------------------------------------------

/** Döviz bozumu tahsilat/önceki bozum seçimi (ZTO bsjs `selectedCollectionData`, break-source girişleri). */
export type FxSelection = {
  accountId: string;
  collectionId: string;
  /** Seçili tahsilatın kalanı (sipariş tablosu yok — S-6; tahsilattan bozulacak tutar). */
  collectionRemaining: number;
  /** Önceki bozum kimliği → kullanılacak tutar. */
  breaks: Record<string, number>;
};

export const EMPTY_FX_SELECTION: FxSelection = {
  accountId: "",
  collectionId: "",
  collectionRemaining: 0,
  breaks: {},
};

/** Seçim toplamı (ZTO `syncSourceAmountFromSelections`: tahsilat kalanı + önceki bozumlar). */
export function selectionTotal(selection: FxSelection): number {
  return round(
    selection.collectionRemaining +
      Object.values(selection.breaks).reduce((sum, value) => sum + value, 0),
  );
}

/** Sunucuya giden kaynak satırları (yalnız tutarı > 0 olanlar). */
export function selectionSources(selection: FxSelection): TransferSourceBody[] {
  const sources: TransferSourceBody[] = [];
  if (selection.collectionId && selection.collectionRemaining > 0) {
    sources.push({
      kind: "SETTLEMENT",
      id: selection.collectionId,
      usedAmount: round(selection.collectionRemaining),
    });
  }
  for (const [id, amount] of Object.entries(selection.breaks)) {
    if (amount > 0) sources.push({ kind: "TRANSFER", id, usedAmount: round(amount) });
  }
  return sources;
}
