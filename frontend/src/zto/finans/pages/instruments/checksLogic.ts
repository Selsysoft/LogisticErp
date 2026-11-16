import type {
  InstrumentListItem,
  InstrumentMovement,
  InstrumentStatus,
  InstrumentTransitionBody,
  InstrumentCustodyBody,
} from "../../../../pages/finance/types";
import type { InstrumentListParams } from "../../../../pages/finance/instrumentApi";
import { matchesSearch, smartSearchTerms } from "../../../components/dataTableLogic";
import { addDaysIso } from "../fundTransactions/fundTransactionsLogic";
import {
  isOpenStatus,
  remainingDays,
  statusLabelKey,
  type InstrumentMenuItem,
} from "./instrumentLogic";

/*
 * Çekler ekranının saf mantığı (12.3_TASARIM §5.4; ZTO Views/Checks/Checks.cshtml). Süzgeç eşlemesi,
 * URL durumu, derin bağlantı, sıralama önceliği, hareket tarafları ve durum modalı (M3) kuralları.
 * Metinler `ztoFinans:checks.*` anahtarı olarak döner.
 */

const NS = "checks";

// ---------------------------------------------------------------------------------------------
// Durum süzgeci (CHK:33-41 + BR ekleri; ZTO hatası (d) düzeltilir)
// ---------------------------------------------------------------------------------------------

/** Süzgeç seçenekleri: ZTO sırası (Tümü, Portföyde, Bankada, Tahsil Edildi, Karşılıksız) + BR ekleri. */
export const STATUS_FILTER_OPTIONS = [
  "",
  "PORTFOLIO",
  "AT_BANK",
  "COLLECTED",
  "BOUNCED",
  "ISSUED",
  "ENDORSED",
  "CANCELLED",
] as const;

export type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number];

const STATUS_FILTER_MAP: Record<Exclude<StatusFilter, "">, readonly InstrumentStatus[]> = {
  PORTFOLIO: ["PORTFOLIO"],
  AT_BANK: ["AT_BANK"],
  COLLECTED: ["COLLECTED", "COLLECTED_TO_CASH", "PAID"],
  BOUNCED: ["BOUNCED"],
  ISSUED: ["ISSUED"],
  ENDORSED: ["ENDORSED"],
  CANCELLED: ["CANCELLED", "RETURNED"],
};

/** Süzgeç seçeneğinin sunucu durumları ("Tahsil Edildi" → COLLECTED + COLLECTED_TO_CASH + PAID). */
export function statusFilterStatuses(filter: StatusFilter | string): InstrumentStatus[] {
  return filter && filter in STATUS_FILTER_MAP
    ? [...STATUS_FILTER_MAP[filter as Exclude<StatusFilter, "">]]
    : [];
}

/** URL'deki `status` (seçenek ya da sunucu durumu) → süzgeç seçeneği; tanınmazsa "". */
export function statusFilterOf(value: string | null | undefined): StatusFilter {
  const raw = (value ?? "").trim().toUpperCase();
  if (!raw) return "";
  if ((STATUS_FILTER_OPTIONS as readonly string[]).includes(raw)) return raw as StatusFilter;
  for (const [key, statuses] of Object.entries(STATUS_FILTER_MAP)) {
    if ((statuses as readonly string[]).includes(raw)) return key as StatusFilter;
  }
  return "";
}

// ---------------------------------------------------------------------------------------------
// Süzgeç durumu (URL'de tutulur)
// ---------------------------------------------------------------------------------------------

export type ChecksFilters = {
  status: StatusFilter;
  accountId: string;
  checkBookId: string;
  /** ISO `YYYY-MM-DD`. */
  dueFrom: string;
  dueTo: string;
  /** Yalnız çok şirkette; "" = tüm şirketler. */
  companyId: string;
};

/** ZTO varsayılanı: vade bugün − 7 … bugün + 30 (CHK:339, :346; temizle de buna döner). */
export function defaultChecksFilters(today: string, companyId = ""): ChecksFilters {
  return {
    status: "",
    accountId: "",
    checkBookId: "",
    dueFrom: addDaysIso(today, -7),
    dueTo: addDaysIso(today, 30),
    companyId,
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** URL sorgusundan süzgeç (eksik alan varsayılana düşer). */
export function filtersFromSearch(
  params: URLSearchParams,
  today: string,
  companyId = "",
): ChecksFilters {
  const base = defaultChecksFilters(today, companyId);
  const text = (key: string) => (params.get(key) ?? "").trim();
  const date = (key: string, fallback: string) => {
    const value = text(key);
    return ISO_DATE.test(value) ? value : fallback;
  };
  return {
    status: statusFilterOf(params.get("status")),
    accountId: text("accountId"),
    checkBookId: text("checkBookId"),
    dueFrom: date("dueFrom", base.dueFrom),
    dueTo: date("dueTo", base.dueTo),
    companyId: params.has("companyId") ? text("companyId") : base.companyId,
  };
}

/** Süzgeci URL sorgusuna yazar: varsayılana eşit alanlar yazılmaz (temiz bağlantı). */
export function filtersToSearch(
  filters: ChecksFilters,
  today: string,
  companyId = "",
): URLSearchParams {
  const base = defaultChecksFilters(today, companyId);
  const query = new URLSearchParams();
  if (filters.status) query.set("status", filters.status);
  if (filters.accountId) query.set("accountId", filters.accountId);
  if (filters.checkBookId) query.set("checkBookId", filters.checkBookId);
  if (filters.dueFrom !== base.dueFrom) query.set("dueFrom", filters.dueFrom);
  if (filters.dueTo !== base.dueTo) query.set("dueTo", filters.dueTo);
  if (filters.companyId !== base.companyId) query.set("companyId", filters.companyId);
  return query;
}

/** Süzgeç varsayılandan farklı mı ("Aktif Filtreleme" çipi). */
export function hasActiveFilter(filters: ChecksFilters, today: string, companyId = ""): boolean {
  return filtersToSearch(filters, today, companyId).toString() !== "";
}

/** `GET /instruments` parametreleri (istemci kipi). `multiCompany` değilse aktif şirket. */
export function checksListParams(
  filters: ChecksFilters,
  multiCompany: boolean,
): InstrumentListParams {
  return {
    kind: "CHECK",
    statuses: statusFilterStatuses(filters.status),
    accountId: filters.accountId || undefined,
    checkBookId: filters.checkBookId || undefined,
    dueFrom: filters.dueFrom || undefined,
    dueTo: filters.dueTo || undefined,
    companyId: multiCompany ? filters.companyId || null : undefined,
  };
}

// ---------------------------------------------------------------------------------------------
// Derin bağlantı (BankAccountCard "Bankadan Cari Çek Ödemesi"; _AccountCardsListPartial:281-285)
// ---------------------------------------------------------------------------------------------

export type ChecksDeepLink = {
  openPayment: boolean;
  fundAccountId?: string;
  branchId?: string;
  currency?: string;
};

/** Okunup URL'den silinen anahtarlar (`accountId`, `status` süzgeç olarak kalır). */
export const CHECKS_DEEP_LINK_KEYS = [
  "bankId",
  "workPlaceId",
  "currencyId",
  "openCheckPaymentModal",
] as const;

function textParam(params: URLSearchParams, key: string): string | undefined {
  const value = (params.get(key) ?? "").trim();
  return value ? value : undefined;
}

/** `?bankId&workPlaceId&currencyId&openCheckPaymentModal=true` (12.2a `settlementDeepLink` deseni). */
export function parseChecksDeepLink(params: URLSearchParams): ChecksDeepLink {
  return {
    openPayment: (params.get("openCheckPaymentModal") ?? "").trim().toLowerCase() === "true",
    fundAccountId: textParam(params, "bankId"),
    branchId: textParam(params, "workPlaceId"),
    currency: textParam(params, "currencyId")?.toUpperCase(),
  };
}

/** Derin bağlantı anahtarları silinmiş sorgu (`?` olmadan); silinecek yoksa null. */
export function remainingChecksSearch(params: URLSearchParams): string | null {
  if (!CHECKS_DEEP_LINK_KEYS.some((key) => params.has(key))) return null;
  const next = new URLSearchParams(params);
  for (const key of CHECKS_DEEP_LINK_KEYS) next.delete(key);
  return next.toString();
}

// ---------------------------------------------------------------------------------------------
// Satır görünümü
// ---------------------------------------------------------------------------------------------

/**
 * Gizli aciliyet önceliği (CHK:1086-1113): 0 = vadesi geçmiş açık çek, 1 = ≤ 7 gün kalan açık çek,
 * 2 = diğerleri. Açık = PORTFOLIO / AT_BANK / ISSUED / COLLATERAL.
 */
export function checkPriority(
  item: Pick<InstrumentListItem, "status" | "dueDate">,
  today: string,
): 0 | 1 | 2 {
  if (!isOpenStatus(item.status)) return 2;
  const days = remainingDays(item.dueDate, today);
  if (days === null) return 2;
  if (days < 0) return 0;
  return days <= 7 ? 1 : 2;
}

/** Varsayılan sıra: öncelik, sonra vade artan, sonra çek no (ZTO orderFixed + order). */
export function sortChecks<T extends Pick<InstrumentListItem, "status" | "dueDate" | "number">>(
  rows: readonly T[],
  today: string,
): T[] {
  return rows
    .map((row) => ({ row, priority: checkPriority(row, today) }))
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        a.row.dueDate.localeCompare(b.row.dueDate) ||
        a.row.number.localeCompare(b.row.number, "tr"),
    )
    .map((entry) => entry.row);
}

/** "Ciro Edilebilir" rozeti ve M1 listesi: alınan, portföydeki, maskesiz çek. */
export function isEndorsable(
  item: Pick<InstrumentListItem, "kind" | "direction" | "status" | "employeeMasked">,
): boolean {
  return (
    item.kind === "CHECK" &&
    item.direction === "RECEIVED" &&
    item.status === "PORTFOLIO" &&
    !item.employeeMasked
  );
}

export type RemainingCell =
  | { kind: "ownPaid" }
  | { kind: "label"; labelKey: string; className: string }
  | { kind: "days"; count: number; overdue: boolean; className: string };

/** "Kalan Gün" hücresi (CHK:744-777; ZTO metni "N gün kaldı" / "N gün geçmiş"). */
export function remainingCell(
  item: Pick<InstrumentListItem, "kind" | "direction" | "status" | "dueDate">,
  today: string,
): RemainingCell {
  if (item.kind === "CHECK" && item.direction === "ISSUED" && item.status === "PAID") {
    return { kind: "ownPaid" };
  }
  if (item.status === "ENDORSED") {
    return { kind: "label", labelKey: `${NS}.table.endorsed`, className: "badge-warning" };
  }
  if (item.status === "CANCELLED" || item.status === "RETURNED") {
    return { kind: "label", labelKey: `${NS}.table.cancelled`, className: "badge-dark" };
  }
  if (!isOpenStatus(item.status)) {
    return {
      kind: "label",
      labelKey: statusLabelKey(item.kind, item.direction, item.status),
      className: "badge-info",
    };
  }
  const days = remainingDays(item.dueDate, today) ?? 0;
  if (days < 0) return { kind: "days", count: -days, overdue: true, className: "badge-danger" };
  return {
    kind: "days",
    count: days,
    overdue: false,
    className: days <= 7 ? "badge-warning" : "badge-info",
  };
}

/** Açıklama önizlemesi: 50 karakter + "..." (CHK:856). */
export function descriptionPreview(text: string | null | undefined): string {
  const value = text ?? "";
  return value.length > 50 ? `${value.substring(0, 50)}...` : value;
}

/** `#checksSearch` metni: çek no, banka, cari/keşideci, açıklama, şube, koçan (maskeli ad alanları yok). */
export function checkSearchText(item: InstrumentListItem): string {
  const parts = [
    item.number,
    item.bankName,
    item.bankBranch,
    item.checkBookSerial,
    item.branchName,
    item.companyName,
    item.money.amount,
  ];
  if (!item.employeeMasked) {
    parts.push(item.accountName, item.accountCode, item.drawerName, item.endorsedAccountName);
    parts.push(item.description);
  }
  return parts.filter(Boolean).join(" ");
}

/** Türkçe büyük/küçük harf ve aksan duyarsız "akıllı arama" (DataTables ile aynı katlama). */
export function filterChecks<T extends InstrumentListItem>(rows: readonly T[], query: string): T[] {
  const terms = smartSearchTerms(query.trim());
  if (terms.length === 0) return [...rows];
  return rows.filter((row) => matchesSearch(checkSearchText(row), terms));
}

// ---------------------------------------------------------------------------------------------
// M2 hareket tarafları
// ---------------------------------------------------------------------------------------------

export type MovementSide = { kind: "text"; text: string } | { kind: "key"; key: string };

export type MovementParties = { from: MovementSide; to: MovementSide };

const DASH: MovementSide = { kind: "text", text: "-" };
const PORTFOLIO_SIDE: MovementSide = { kind: "key", key: `${NS}.movements.portfolio` };

function side(text: string | null | undefined): MovementSide {
  return text ? { kind: "text", text } : DASH;
}

/**
 * "Kimden → Kime" (§5.4 M2 tablosu). `accountName` taşıma hareketinin cari kimliklerini ada çevirir;
 * maskeli satırda cari adı "-" kalır.
 */
export function movementParties(
  movement: Pick<
    InstrumentMovement,
    "fromStatus" | "toStatus" | "movementType" | "fromAccountId" | "toAccountId" | "fundName"
  >,
  item: Pick<
    InstrumentListItem,
    "direction" | "accountName" | "branchName" | "endorsedAccountName" | "employeeMasked"
  >,
  index: number,
  accountName: (id: string | null) => string | null = () => null,
): MovementParties {
  const account = item.employeeMasked ? DASH : side(item.accountName);
  if (movement.movementType === "TRANSFERRED") {
    return {
      from: side(accountName(movement.fromAccountId)),
      to: side(accountName(movement.toAccountId)),
    };
  }
  if (index === 0 || movement.fromStatus === null) {
    return item.direction === "RECEIVED"
      ? { from: account, to: PORTFOLIO_SIDE }
      : { from: side(item.branchName), to: account };
  }
  switch (movement.toStatus as InstrumentStatus) {
    case "AT_BANK":
      return { from: PORTFOLIO_SIDE, to: side(movement.fundName) };
    case "COLLECTED":
    case "COLLECTED_TO_CASH":
    case "PAID":
      return { from: DASH, to: side(movement.fundName) };
    case "ENDORSED":
      return { from: PORTFOLIO_SIDE, to: side(item.endorsedAccountName) };
    case "PORTFOLIO":
      return { from: DASH, to: movement.fundName ? side(movement.fundName) : PORTFOLIO_SIDE };
    case "RETURNED":
      return { from: PORTFOLIO_SIDE, to: account };
    default:
      return { from: DASH, to: DASH };
  }
}

/** İşlem Tipi simgesi ve rengi (CHK:5265-5284: Giriş / Ciro / Tahsil / İade). */
export function movementIcon(
  movement: Pick<InstrumentMovement, "fromStatus" | "toStatus" | "movementType">,
  index: number,
): { icon: string; className: string } {
  if (movement.movementType === "TRANSFERRED") {
    return { icon: "fa-exchange-alt", className: "text-info" };
  }
  if (index === 0 || movement.fromStatus === null) {
    return { icon: "fa-arrow-down", className: "text-success" };
  }
  switch (movement.toStatus) {
    case "ENDORSED":
      return { icon: "fa-exchange-alt", className: "text-warning" };
    case "COLLECTED":
    case "COLLECTED_TO_CASH":
    case "PAID":
      return { icon: "fa-check-circle", className: "text-success" };
    case "RETURNED":
    case "BOUNCED":
    case "PROTESTED":
    case "CANCELLED":
      return { icon: "fa-undo", className: "text-danger" };
    default:
      return { icon: "fa-circle", className: "text-secondary" };
  }
}

// ---------------------------------------------------------------------------------------------
// M3 durum modalı (CHK:4022-4236)
// ---------------------------------------------------------------------------------------------

/** M3 seçici değeri: geçiş hedefi ya da "custody" (Kasaya Al (Ciro)). */
export type StatusTarget = InstrumentStatus | "custody";

/** Satır menüsü öğesinin M3 hedefi; köken kaydı iptali M3 açmaz (null). */
export function menuTarget(entry: InstrumentMenuItem): StatusTarget | null {
  if (entry.action === "custody") return "custody";
  if (entry.action === "transition") return entry.target;
  return null;
}

/** M3 seçici seçenekleri: satır menüsünün M3 açan öğeleri, menü sırasıyla. */
export function statusTargets(menu: readonly InstrumentMenuItem[]): StatusTarget[] {
  return menu.flatMap((entry) => {
    const target = menuTarget(entry);
    return target ? [target] : [];
  });
}

const BANK_TARGETS: readonly StatusTarget[] = ["AT_BANK", "COLLECTED", "PAID"];

type StatusContext = Pick<
  InstrumentListItem,
  "direction" | "status" | "custodyFundId" | "fundAccountId" | "fundKind"
>;

/** Banka alanı görünür ve zorunlu mu (Bankada / Bankaya Tahsil / Çek Ödendi). */
export function needsBank(target: StatusTarget | ""): boolean {
  return target !== "" && BANK_TARGETS.includes(target);
}

/** Kasa alanı: görünür mü, zorunlu mu (CHK:4086-4112). */
export function cashRule(
  target: StatusTarget | "",
  item: StatusContext,
): { visible: boolean; required: boolean } {
  if (target === "custody" || target === "COLLECTED_TO_CASH") {
    return { visible: true, required: true };
  }
  if (target === "PORTFOLIO" && item.direction === "RECEIVED") {
    return { visible: true, required: item.status === "AT_BANK" && !item.custodyFundId };
  }
  return { visible: false, required: false };
}

export type StatusForm = {
  target: StatusTarget | "";
  bankId: string;
  cashId: string;
  /** "Bankaya Yatırma Tarihi" (= işlem tarihi). */
  date: string;
  /** İade gerekçesi (yalnız RETURNED). */
  note: string;
};

/** Modal açılış değerleri: önerilen hedef, banka ön seçimi (çekin banka fonu), bugün. */
export function initialStatusForm(
  item: StatusContext,
  target: StatusTarget | "",
  today: string,
): StatusForm {
  return {
    target,
    bankId: item.fundKind === "BANK" && item.fundAccountId ? item.fundAccountId : "",
    cashId: item.custodyFundId ?? "",
    date: today,
    note: "",
  };
}

export type StatusFormError = { field: "target" | "bankId" | "cashId" | "date"; key: string };

/** ZTO doğrulaması (CHK:4164-4183); ilk hata döner. */
export function validateStatusForm(form: StatusForm, item: StatusContext): StatusFormError | null {
  if (!form.target) return { field: "target", key: `${NS}.statusModal.errors.target` };
  if (needsBank(form.target) && !form.bankId) {
    return { field: "bankId", key: `${NS}.statusModal.errors.bankRequired` };
  }
  const cash = cashRule(form.target, item);
  if (cash.required && !form.cashId) {
    const key =
      form.target === "custody"
        ? "cashForCustody"
        : form.target === "COLLECTED_TO_CASH"
          ? "cashForCollect"
          : "cashForPortfolio";
    return { field: "cashId", key: `${NS}.statusModal.errors.${key}` };
  }
  if (!ISO_DATE.test(form.date)) return { field: "date", key: `${NS}.statusModal.errors.date` };
  return null;
}

export type StatusRequest =
  | { kind: "transition"; body: InstrumentTransitionBody }
  | { kind: "custody"; body: InstrumentCustodyBody };

/** Gönderim gövdesi: `custody` → PUT custody; diğerleri → POST transition. */
export function buildStatusRequest(form: StatusForm, item: StatusContext): StatusRequest {
  if (form.target === "custody") {
    return { kind: "custody", body: { custodyFundId: form.cashId || null, date: form.date } };
  }
  const target = form.target as InstrumentStatus;
  const body: InstrumentTransitionBody = { toStatus: target, date: form.date };
  if (needsBank(target) && form.bankId) body.fundAccountId = form.bankId;
  if (target === "COLLECTED_TO_CASH" && form.cashId) body.fundAccountId = form.cashId;
  if (target === "PORTFOLIO" && cashRule(target, item).visible && form.cashId) {
    body.custodyFundId = form.cashId;
  }
  const note = form.note.trim();
  if (target === "RETURNED" && note) body.note = note.slice(0, 500);
  return { kind: "transition", body };
}

/** Kendi çekimiz (verilen çek): Tahsil seçenekleri "Çek Ödendi" etiketini alır. */
export function isOwnCheck(item: Pick<InstrumentListItem, "direction">): boolean {
  return item.direction === "ISSUED";
}

/** Seçici seçeneğinin metin anahtarı (CHK:1248-1259, 5345-5357). */
export function targetOptionKey(target: StatusTarget, own: boolean): string {
  if (target === "COLLECTED" && own) return `${NS}.statusModal.option.PAID`;
  return `${NS}.statusModal.option.${target}`;
}

/** Onay etiketi (`statusLabel`, CHK:4189-4199). */
export function targetConfirmKey(target: StatusTarget, own: boolean): string {
  if ((target === "COLLECTED" || target === "PAID") && own) {
    return `${NS}.statusModal.confirmLabel.PAID`;
  }
  return `${NS}.statusModal.confirmLabel.${target}`;
}

/** Yardım metni ve rengi (`#statusHelpText`, CHK:4031-4085; Bekliyor/koçan cümleleri çıkarıldı). */
export function targetHelp(
  target: StatusTarget | "",
  own: boolean,
): { key: string; className: string } {
  const key = (name: string) => `${NS}.statusModal.help.${name}`;
  switch (target) {
    case "":
      return { key: key("choose"), className: "" };
    case "AT_BANK":
      return { key: key("AT_BANK"), className: "text-warning" };
    case "COLLECTED":
    case "PAID":
      return { key: key(own ? "PAID" : "COLLECTED"), className: "text-success" };
    case "PORTFOLIO":
      return { key: key("PORTFOLIO"), className: "text-info" };
    case "custody":
      return { key: key("custody"), className: "text-success" };
    case "COLLECTED_TO_CASH":
      return { key: key("COLLECTED_TO_CASH"), className: "text-success" };
    case "BOUNCED":
      return { key: key("BOUNCED"), className: "text-danger" };
    case "RETURNED":
      return { key: key("RETURNED"), className: "text-danger" };
    default:
      return { key: key("other"), className: "text-info" };
  }
}

/** `#statusWarnings` (alert-danger) anahtarı; yoksa null. */
export function targetWarningKey(target: StatusTarget | ""): string | null {
  if (target === "BOUNCED") return `${NS}.statusModal.warning.BOUNCED`;
  if (target === "RETURNED") return `${NS}.statusModal.warning.RETURNED`;
  return null;
}

/** Kasa yardım metni (`#cashHelpText`). */
export function cashHelpKey(
  target: StatusTarget | "",
  required: boolean,
): {
  key: string;
  className: string;
} {
  const key = (name: string) => `${NS}.statusModal.cashHelp.${name}`;
  if (target === "custody") return { key: key("custody"), className: "text-success" };
  if (target === "COLLECTED_TO_CASH") return { key: key("collect"), className: "text-success" };
  return required
    ? { key: key("required"), className: "text-danger" }
    : { key: key("optional"), className: "text-muted" };
}

/** M8'de "ters kayıt" uyarısı (Karşılıksız ve İptal). */
export function isReversingTarget(target: StatusTarget | ""): boolean {
  return target === "BOUNCED" || target === "RETURNED" || target === "PROTESTED";
}

// ---------------------------------------------------------------------------------------------
// M4 3B çek yaprağı
// ---------------------------------------------------------------------------------------------

const ONES = ["", "Bir", "İki", "Üç", "Dört", "Beş", "Altı", "Yedi", "Sekiz", "Dokuz"];
const TENS = ["", "On", "Yirmi", "Otuz", "Kırk", "Elli", "Altmış", "Yetmiş", "Seksen", "Doksan"];

function hundreds(x: number): string {
  const h = Math.floor(x / 100);
  const t = Math.floor((x % 100) / 10);
  const b = x % 10;
  let s = "";
  if (h === 1) s += "Yüz";
  else if (h > 1) s += `${ONES[h]}Yüz`;
  return s + TENS[t] + ONES[b];
}

function groups(x: number): string {
  if (x === 0) return "Sıfır";
  const billions = Math.floor(x / 1e9);
  const millions = Math.floor((x % 1e9) / 1e6);
  const thousands = Math.floor((x % 1e6) / 1e3);
  const rest = x % 1e3;
  let s = "";
  if (billions) s += `${hundreds(billions)}Milyar`;
  if (millions) s += `${hundreds(millions)}Milyon`;
  if (thousands) s += `${thousands === 1 ? "" : hundreds(thousands)}Bin`;
  if (rest) s += hundreds(rest);
  return s;
}

/** Tutarı Türkçe yazıya çevirir: "#BinİkiYüzTürkLirasıElliKuruş#" (CHK:4311-4333 `c3dYazi`). */
export function amountInWords(amount: string | number | null | undefined): string {
  const value = Math.round((Number(amount) || 0) * 100) / 100;
  const lira = Math.floor(value);
  const kurus = Math.round((value - lira) * 100);
  let s = `${groups(lira)}TürkLirası`;
  if (kurus > 0) s += `${hundreds(kurus)}Kuruş`;
  return `#${s}#`;
}

/** Damga (CHK:4336-4351): metin anahtarı + renk; yoksa null. */
export function stampOf(
  item: Pick<InstrumentListItem, "direction" | "status">,
): { key: string; color: string } | null {
  const key = (name: string) => `${NS}.leaf.stamp.${name}`;
  switch (item.status) {
    case "PORTFOLIO":
      return { key: key("PORTFOLIO"), color: "#2563eb" };
    case "AT_BANK":
      return { key: key("AT_BANK"), color: "#b45309" };
    case "COLLECTED":
    case "COLLECTED_TO_CASH":
    case "PAID":
      return { key: key(item.direction === "ISSUED" ? "PAID" : "COLLECTED"), color: "#16a34a" };
    case "BOUNCED":
      return { key: key("BOUNCED"), color: "#dc2626" };
    case "PROTESTED":
      return { key: key("PROTESTED"), color: "#dc2626" };
    case "CANCELLED":
    case "RETURNED":
      return { key: key("CANCELLED"), color: "#6b7280" };
    case "ISSUED":
      return { key: key("ISSUED"), color: "#0ea5e9" };
    case "ENDORSED":
      return { key: key("ENDORSED"), color: "#7c3aed" };
    case "COLLATERAL":
      return { key: key("COLLATERAL"), color: "#b45309" };
    default:
      return null;
  }
}

/** Detay tablosundaki durum rozeti sınıfı (CHK:4412). */
export function detailBadgeClass(status: InstrumentStatus): string {
  switch (status) {
    case "PORTFOLIO":
      return "badge-info";
    case "AT_BANK":
      return "badge-warning";
    case "COLLECTED":
    case "COLLECTED_TO_CASH":
    case "PAID":
      return "badge-success";
    case "BOUNCED":
    case "PROTESTED":
      return "badge-danger";
    case "CANCELLED":
    case "RETURNED":
      return "badge-secondary";
    case "ISSUED":
      return "badge-primary";
    default:
      return "badge-light";
  }
}

/** MICR satırının seri bölümü: koçan serisinin harf/rakamları ("00000000" yoksa). */
export function micrSerial(serial: string | null | undefined): string {
  return (serial || "00000000").replace(/[^0-9A-Za-z]/g, "");
}
