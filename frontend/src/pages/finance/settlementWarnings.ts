import type {
  AccountInvoiceGap,
  CurrencyAmount,
  DocumentSide,
  SettlementBody,
  SettlementChannel,
  SettlementCheck,
  SettlementLockReason,
  SettlementType,
  SettlementWarning,
} from "./types";

/*
 * Ödeme/tahsilat şirket dağılımı uyarısı ve eksik fatura göstergelerinin saf mantığı (12.2 §5.13,
 * K-12.2-3, K-12.2-4). Kural sunucudadır (`SettlementWarningService`, `InvoiceCoverageService`);
 * burada yalnız metin, onay gereksinimi, 409 ayrıntılarının ayrıştırılması ve seçiciler vardır.
 * MUI ödeme penceresi ve 12.2a ZTO ödeme modalları aynı fonksiyonları kullanır.
 *
 * Gizlilik (SEC-12.2-02): sunucunun verdiği tutarlar kullanıcının kapsamındakilerdir; kapsam dışı
 * kısım yalnız `partialScope` / `otherHiddenExists` bayraklarıyla gelir ve hiçbir metinde tutar olarak
 * gösterilmez.
 */

/** i18next `t` karşılığı (bileşen `(k, v) => t(k, v)` geçirir). */
export type Translate = (key: string, values?: Record<string, string | number>) => string;
/** Tutar + para birimi biçimi (MUI `formatMoney`, ZTO `formatN2 + symbol`). */
export type MoneyFormat = (amount: number, currency: string) => string;
/** Şirket kimliği → kısa ad (bilinmiyorsa kimliğin kendisi ya da "—"). */
export type CompanyNameOf = (companyId: string) => string;

/** ZTO eksik fatura toleransı (transactionsLogic.invoiceGap ile aynı: 1 birim). */
export const INVOICE_GAP_TOLERANCE = 1;

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------------------------------------
// Şirket dağılımı uyarısı
// ---------------------------------------------------------------------------------------------

/**
 * Uyarı metni (§5.13). Ödeme (CONFIRM): şirketin cariye borcu, ödeme ve fark; görünür diğer şirket
 * borçları; gizli kısım için yalnız bayrak cümleleri. Tahsilat (INFO): şirketteki cari borcu (carinin
 * şirkete borcu).
 */
export function allocationWarningText(
  warning: SettlementWarning,
  companyName: CompanyNameOf,
  fmt: MoneyFormat,
  t: Translate,
): string {
  const money = (value: number) => fmt(value, warning.currency);
  const values = {
    companyOutstanding: money(warning.companyOutstanding),
    amount: money(warning.amount),
    excess: money(warning.excess),
  };
  if (warning.severity === "INFO") {
    return t("finance.warning.collection", values);
  }
  const parts = [t("finance.warning.payment", values)];
  const others = warning.others.filter((other) => other.outstanding > 0);
  if (others.length > 0) {
    parts.push(
      t("finance.warning.others", {
        list: others
          .map((other) => `${companyName(other.companyId)} ${money(other.outstanding)}`)
          .join(", "),
      }),
    );
  }
  if (warning.otherHiddenExists) {
    parts.push(t("finance.warning.otherHidden"));
  }
  if (warning.partialScope) {
    parts.push(t("finance.warning.partialScope"));
  }
  return parts.join(" ");
}

/** Kayıttan önce onay gerektiren (CONFIRM) uyarı var mı. */
export function needsConfirmation(check: SettlementCheck | null | undefined): boolean {
  return (check?.warnings ?? []).some((warning) => warning.severity === "CONFIRM");
}

type ErrorLike = { status?: unknown; body?: { code?: unknown; details?: unknown } };

/** `ApiError` (ya da testlerdeki benzeri) 409 `CONFIRMATION_REQUIRED` mı. */
export function isConfirmationRequired(error: unknown): boolean {
  const body = (error as ErrorLike | null)?.body;
  return !!body && body.code === "CONFIRMATION_REQUIRED";
}

function decimal(value: string | undefined): number {
  const parsed = Number(value);
  return value !== undefined && value !== "" && Number.isFinite(parsed) ? parsed : 0;
}

/**
 * 409 `CONFIRMATION_REQUIRED` gövdesinin `details` satırlarını (`anahtar=değer`, §3.6 adım 5) uyarıya
 * çevirir; başka hata ya da `details` yoksa null. `other.<companyId>=tutar` satırları görünür diğer
 * şirketlerdir (gizli tutar gelmez).
 */
export function parseConfirmationDetails(error: unknown): SettlementWarning | null {
  if (!isConfirmationRequired(error)) return null;
  const details = (error as ErrorLike).body?.details;
  if (!Array.isArray(details) || details.length === 0) return null;
  const map = new Map<string, string>();
  const others: SettlementWarning["others"] = [];
  for (const line of details) {
    if (typeof line !== "string") continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key.startsWith("other.")) {
      const companyId = key.slice("other.".length);
      if (companyId !== "") others.push({ companyId, outstanding: decimal(value) });
    } else {
      map.set(key, value);
    }
  }
  const currency = map.get("currency");
  if (!map.has("amount") || currency === undefined) return null;
  return {
    code: "COMPANY_ALLOCATION_EXCEEDED",
    severity: "CONFIRM",
    currency,
    companyId: map.get("companyId") ?? "",
    companyOutstanding: decimal(map.get("companyOutstanding")),
    amount: decimal(map.get("amount")),
    excess: decimal(map.get("excess")),
    others,
    partialScope: map.get("partialScope") === "true",
    otherHiddenExists: map.get("otherHiddenExists") === "true",
  };
}

// ---------------------------------------------------------------------------------------------
// Uyarı önizlemesinin girdisi (ödeme penceresi)
// ---------------------------------------------------------------------------------------------

/**
 * Uyarı sorgusunu etkileyen form alanları (§5.13; 12.2a §5.14 `channel`, `instrumentKind` ekleri).
 * Sıra sabittir: anahtar bu sırayla kurulur. `instrumentId` çekle ödemede gövdeyi belirler.
 */
export const CHECK_FIELDS = [
  "accountId",
  "branchId",
  "fundAccountId",
  "method",
  "amount",
  "currency",
  "instrumentId",
  "channel",
  "instrumentKind",
] as const;

/**
 * `POST /settlements/check` gövdesi. 12.2a'da sunucu önizlemede çek/senet bilgisini zorunlu tutmaz
 * (F-12.2-R4 kapandı), bu yüzden yer tutucu `instrument` eklenmez (12.2a §5.14).
 */
export type SettlementCheckBody = SettlementBody;

const CHANNELS: readonly SettlementChannel[] = ["TRANSFER", "CREDIT_CARD"];

type CheckValues = Partial<Record<string, string | boolean | null | undefined>>;

function text(value: string | boolean | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** "150,5" → "150.5"; sayı değilse "". */
export function normalizedAmount(value: string | boolean | null | undefined): string {
  const raw = text(value).replace(",", ".");
  if (raw === "") return "";
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? String(parsed) : "";
}

/**
 * Kararlı uyarı sorgu anahtarı: yalnız ilgili alanların `|` ile birleşimi. Açıklama/tarih gibi alanlar
 * değişince anahtar aynı kalır (yeni istek ve üstte `setState` yok — render döngüsü önlemi).
 */
export function checkKey(values: CheckValues): string {
  return CHECK_FIELDS.map((field) =>
    field === "amount" ? normalizedAmount(values.amount) : text(values[field]),
  ).join("|");
}

/**
 * `POST /settlements/check` gövdesi: cari + iş yeri + pozitif tutar + para birimi yoksa null (istek
 * atılmaz). Tarih yoksa bugün (uyarı tarihten bağımsızdır; sunucu doğrulaması için dolu gönderilir).
 * CHECK yönteminde yalnız cirolanacak çek seçiliyse `instrumentId` (yer tutucu araç yok); BANK
 * yönteminde geçerli `channel` (TRANSFER | CREDIT_CARD) gövdeye yazılır, başka yöntemde yazılmaz
 * (sunucu 400 `CHANNEL_INVALID`).
 */
export function settlementCheckBody(
  values: CheckValues,
  method: SettlementBody["method"],
  fallbackDate: string,
): SettlementCheckBody | null {
  const accountId = text(values.accountId);
  const branchId = text(values.branchId);
  const currency = text(values.currency);
  const amount = normalizedAmount(values.amount);
  if (!accountId || !branchId || !currency || amount === "" || Number(amount) <= 0) return null;
  const fundAccountId = text(values.fundAccountId);
  const date = text(values.date) || fallbackDate;
  const body: SettlementCheckBody = {
    method,
    accountId,
    branchId,
    ...(fundAccountId ? { fundAccountId } : {}),
    money: { amount, currency },
    date,
  };
  if (method === "CHECK") {
    const instrumentId = text(values.instrumentId);
    if (instrumentId) body.instrumentId = instrumentId;
  }
  const channel = text(values.channel) as SettlementChannel;
  if (method === "BANK" && CHANNELS.includes(channel)) body.channel = channel;
  return body;
}

// ---------------------------------------------------------------------------------------------
// İptal tarihi ve kilit nedenleri (12.2a §3.5, §3.12)
// ---------------------------------------------------------------------------------------------

/**
 * İptal penceresinin varsayılan tarihi: `max(bugün, kayıt tarihi)` (12.2a §3.5). Sunucu kuralı
 * `settlement_date ≤ tarih ≤ max(bugün, settlement_date)`; ileri tarihli kayıtta bugün gönderilirse 400
 * `REVERSE_BEFORE_SETTLEMENT` döner. ISO `YYYY-MM-DD` metinleri sözlük sırasıyla karşılaştırılır.
 */
export function defaultReverseDate(settlementDate: string, todayIso: string): string {
  return settlementDate > todayIso ? settlementDate : todayIso;
}

/** Kilit nedeni → `finance.error.<KOD>` (12.2a §5.7 eşlemesi; `REVERSED` düzeltilmişse ALREADY). */
const LOCK_REASON_CODES: Record<SettlementLockReason, string> = {
  REVERSED: "SETTLEMENT_REVERSED",
  CHECK: "SETTLEMENT_CHECK_NOT_REVERSIBLE",
  PLAN: "SETTLEMENT_LINKED_TO_PLAN",
  INTERCOMPANY: "SETTLEMENT_LINKED_TO_INTERCOMPANY",
  FX_SOURCE: "SETTLEMENT_USED_IN_FX_EXCHANGE",
  VEHICLE_EXPENSE: "SETTLEMENT_SOURCE_MANAGED",
  // 12.7 (Rev 1 F1): Nakit/Banka masrafın settlement'ı yalnız masraf ekranından ters çevrilir.
  EXPENSE: "SETTLEMENT_SOURCE_MANAGED",
  TRANSFERRED: "TRANSACTION_TRANSFERRED",
  NO_ACCOUNT: "SETTLEMENT_NOT_CORRECTABLE",
};

/**
 * Düzenlenemeyen kaydın nedeni olan hata kodu. Kilit nedeni yoksa (ör. personel maskesi)
 * `SETTLEMENT_NOT_CORRECTABLE`; iptal edilmiş ve düzeltilmiş kayıtta `SETTLEMENT_ALREADY_CORRECTED`.
 * 12.3: çekli kayıt `CHECK` nedeniyle yalnız çek ilerlemişse kilitlidir.
 */
export function settlementLockErrorCode(
  lockReason: SettlementLockReason | null | undefined,
  correctedById?: string | null,
): string {
  if (lockReason === "REVERSED" && correctedById) return "SETTLEMENT_ALREADY_CORRECTED";
  return (lockReason && LOCK_REASON_CODES[lockReason]) || "SETTLEMENT_NOT_CORRECTABLE";
}

/**
 * Bir sunucu hata kodunun `finance.error.*` anahtar adayları, en özelden genele (i18next anahtar
 * dizisi: ilk bulunan kullanılır, hiçbiri yoksa `defaultValue` = sunucu iletisi). Tür ve neden ekleri:
 * `ALLOCATION_EXCEEDS_SETTLEMENT_PAYMENT` ("ödeme tutarını"), `SETTLEMENT_NOT_FOUND_COLLECTION`
 * ("Tahsilat bilgileri…"), `ALLOCATION_TARGET_INVALID_CLOSED` / `_CURRENCY[_PAYMENT]` (§3.12).
 */
export function settlementErrorKeys(
  code: string,
  type?: SettlementType | null,
  reason?: string | null,
): string[] {
  const base = `finance.error.${code}`;
  const keys: string[] = [];
  if (reason && type) keys.push(`${base}_${reason}_${type}`);
  if (reason) keys.push(`${base}_${reason}`);
  if (type) keys.push(`${base}_${type}`);
  keys.push(base);
  return keys;
}

// ---------------------------------------------------------------------------------------------
// Eksik fatura
// ---------------------------------------------------------------------------------------------

/** Uyarı eşiği: `missing > 1` (fazla fatura bilgi, uyarı değil). */
export function isMissing(gap: Pick<AccountInvoiceGap, "missing">): boolean {
  return gap.missing > INVOICE_GAP_TOLERANCE;
}

/**
 * PAYABLE: "Cari alacağı …, girilen fatura …: kalan … için fatura bilgisi eksik."; RECEIVABLE: "Cari
 * borcu …, kesilen fatura …: kalan … için fatura bilgisi eksik.".
 */
export function invoiceGapText(gap: AccountInvoiceGap, fmt: MoneyFormat, t: Translate): string {
  return t(
    gap.side === "PAYABLE" ? "finance.warning.gapPayable" : "finance.warning.gapReceivable",
    {
      ledgerTotal: fmt(gap.ledgerTotal, gap.currency),
      invoiceTotal: fmt(gap.invoiceTotal, gap.currency),
      missing: fmt(gap.missing, gap.currency),
    },
  );
}

export type GapFilter = {
  accountId?: string;
  side?: DocumentSide;
  currency?: string;
};

function matches(gap: AccountInvoiceGap, filter: GapFilter): boolean {
  return (
    (!filter.accountId || gap.accountId === filter.accountId) &&
    (!filter.side || gap.side === filter.side) &&
    (!filter.currency || gap.currency === filter.currency)
  );
}

/**
 * Bir şirket görünümünün eksik fatura satırları (yalnız `missing > 1`). Şirket seçiliyse o şirketin
 * satırları; konsolidede `companyId = null` satırları, yoksa (yalnız şirket satırı dönen uç) şirket
 * satırları cari × taraf × para birimi başına toplanır.
 */
export function gapsForCompany(
  gaps: readonly AccountInvoiceGap[] | null | undefined,
  companyId: string | null,
  filter: GapFilter = {},
): AccountInvoiceGap[] {
  const rows = (gaps ?? []).filter((gap) => matches(gap, filter));
  if (companyId) {
    return rows.filter((gap) => gap.companyId === companyId && isMissing(gap));
  }
  const consolidated = rows.filter((gap) => gap.companyId === null);
  if (consolidated.length > 0 || rows.length === 0) {
    return consolidated.filter(isMissing);
  }
  const sums = new Map<string, AccountInvoiceGap>();
  for (const gap of rows) {
    const key = `${gap.accountId}|${gap.side}|${gap.currency}`;
    const current = sums.get(key);
    sums.set(
      key,
      current
        ? {
            ...current,
            ledgerTotal: round2(current.ledgerTotal + gap.ledgerTotal),
            invoiceTotal: round2(current.invoiceTotal + gap.invoiceTotal),
            missing: round2(current.missing + gap.missing),
          }
        : { ...gap, companyId: null },
    );
  }
  return [...sums.values()].filter(isMissing);
}

/**
 * Gösterilecek satırlar: şirket seçiliyse o şirket; konsolidede ≥ 2 şirkette şirket başına satırlar
 * (şirket satırı yoksa konsolide), tek şirkette konsolide satır.
 */
export function displayGaps(
  gaps: readonly AccountInvoiceGap[] | null | undefined,
  activeCompanyId: string | null,
  multiCompany: boolean,
  filter: GapFilter = {},
): AccountInvoiceGap[] {
  if (activeCompanyId || !multiCompany) {
    return gapsForCompany(gaps, activeCompanyId, filter);
  }
  const perCompany = (gaps ?? []).filter(
    (gap) => gap.companyId !== null && matches(gap, filter) && isMissing(gap),
  );
  return perCompany.length > 0 ? perCompany : gapsForCompany(gaps, null, filter);
}

/** Cari başına eksik tutarlar (para birimi başına toplam; iki taraf toplanır). */
export function missingByAccount(
  gaps: readonly AccountInvoiceGap[],
): Map<string, CurrencyAmount[]> {
  const map = new Map<string, Map<string, number>>();
  for (const gap of gaps) {
    if (!isMissing(gap)) continue;
    const byCurrency = map.get(gap.accountId) ?? new Map<string, number>();
    byCurrency.set(gap.currency, round2((byCurrency.get(gap.currency) ?? 0) + gap.missing));
    map.set(gap.accountId, byCurrency);
  }
  return new Map(
    [...map].map(([accountId, byCurrency]) => [
      accountId,
      [...byCurrency]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, amount]) => ({ currency, amount })),
    ]),
  );
}

// ---------------------------------------------------------------------------------------------
// Ödeme penceresini dışarıdan açma (ZTO Banka/Kasa Hareketleri "Yeni Ödeme/Tahsilat", OK-12.2-22)
// ---------------------------------------------------------------------------------------------

export type NewSettlementRequest = {
  type: "PAYMENT" | "COLLECTION";
  method: "BANK" | "CASH" | "CHECK";
  fundAccountId?: string;
};

const METHODS = ["BANK", "CASH", "CHECK"] as const;

/** `/finance/settlements?new=PAYMENT&method=BANK&fundAccountId=…` (yeni sekmede açılır). */
export function newSettlementPath(request: NewSettlementRequest): string {
  const params = new URLSearchParams({ new: request.type, method: request.method });
  if (request.fundAccountId) params.set("fundAccountId", request.fundAccountId);
  return `/finance/settlements?${params.toString()}`;
}

/** Sorgu parametrelerinden açılacak pencere; geçersizse null. */
export function parseNewSettlement(params: URLSearchParams): NewSettlementRequest | null {
  const type = params.get("new");
  const method = params.get("method") ?? "BANK";
  if (type !== "PAYMENT" && type !== "COLLECTION") return null;
  if (!(METHODS as readonly string[]).includes(method)) return null;
  const fundAccountId = params.get("fundAccountId") ?? "";
  return {
    type,
    method: method as NewSettlementRequest["method"],
    ...(fundAccountId ? { fundAccountId } : {}),
  };
}
