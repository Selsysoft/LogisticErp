import type {
  AccountBankAccount,
  AllocationBody,
  Fund,
  NewInstrumentBody,
  PayMethod,
  SettlementBody,
  SettlementLockReason,
  SettlementType,
} from "../../../../pages/finance/types";
import { tryScaled, fromScaled } from "../../../decimal";
import { currencySymbol } from "../../../format";
import type { CheckFieldsValue, NoteFieldsValue } from "./index";

/*
 * Ödeme / tahsilat modallarının saf mantığı (12.2a_TASARIM §5.7, §5.8): ZTO tutar girişi
 * (`formatDecimalInput`), doğrulama (ZTO metinleri `settlementModals.validation.*` anahtarlarıyla),
 * istek gövdesi, karşı taraf banka hesabı açıklama cümlesi (maskeli IBAN, hesap sahibi yok — S-8) ve
 * düzenleme kilidinin hata kodu. Tutarlar ondalık metin; karşılaştırma `zto/decimal.ts` ile.
 */

/** ZTO yöntem sırası (APM/CMP `#PaymentMethod` / `#CollectionMethod`; "Diğer" yok). */
export const PAY_METHODS: readonly PayMethod[] = ["CASH", "BANK", "CHECK", "NOTE", "CREDIT_CARD"];
/** Düzenleme modalında yalnız Nakit / Banka Havalesi/Eft / Kredi Kartı (EPM, OK-12.2a-4). */
export const EDIT_METHODS: readonly PayMethod[] = ["CASH", "BANK", "CREDIT_CARD"];

export function isPayMethod(value: string): value is PayMethod {
  return (PAY_METHODS as readonly string[]).includes(value);
}

/** Yöntemin fonu: Nakit → kasa, Banka/Kredi Kartı → banka; çek/senet ana fon seçmez. */
export function fundKindOf(method: PayMethod | ""): "CASH" | "BANK" | null {
  if (method === "CASH") return "CASH";
  if (method === "BANK" || method === "CREDIT_CARD") return "BANK";
  return null;
}

/** Banka ya da kredi kartı (karşı taraf banka hesabı bölümü yalnız bunlarda). */
export function isBankLike(method: PayMethod | ""): boolean {
  return method === "BANK" || method === "CREDIT_CARD";
}

// ---------------------------------------------------------------------------------------------
// Tarihler (yerel takvim; `toISOString().slice(0,10)` yasak — MWG capture-location-agnostic-data)
// ---------------------------------------------------------------------------------------------

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

/** Yerel takvimde bugün "yyyy-MM-dd". */
export function todayIso(now: Date = new Date()): string {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** ISO tarihe gün ekler (yerel takvim parçalarıyla; saat dilimi kayması yok). Geçersizde "". */
export function addDaysIso(iso: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return "";
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days);
  return todayIso(date);
}

/** "yyyy-MM-dd" → "dd/MM/yyyy" (ZTO açıklama cümlesindeki tarih). */
export function slashDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

// ---------------------------------------------------------------------------------------------
// Tutar girişi
// ---------------------------------------------------------------------------------------------

/**
 * ZTO `formatDecimalInput(this, maxDecimals)` (BankTransactionsPayments.js:257) saf karşılığı: rakam
 * ve tek ayırıcı (nokta ya da virgül, sonuncusu kalır) bırakır, ondalığı `maxDecimals` haneye keser,
 * baştaki gereksiz sıfırı atar. Ayırıcı her zaman ondalıktır (binlik ayırıcı yok).
 */
export function formatDecimalInput(value: string, maxDecimals = 2): string {
  let cleaned = value.replace(/[^0-9.,]/g, "");
  const separators = (cleaned.match(/[.,]/g) ?? []).length;
  if (separators > 1) {
    const last = Math.max(cleaned.lastIndexOf(","), cleaned.lastIndexOf("."));
    cleaned = cleaned.substring(0, last).replace(/[.,]/g, "") + cleaned.substring(last);
  }
  if (cleaned.includes(",") || cleaned.includes(".")) {
    const separator = cleaned.includes(",") ? "," : ".";
    const parts = cleaned.split(separator);
    cleaned = `${parts[0]}${separator}${(parts[1] ?? "").substring(0, maxDecimals)}`;
  }
  if (cleaned.length > 1 && cleaned[0] === "0" && cleaned[1] !== "." && cleaned[1] !== ",") {
    cleaned = cleaned.substring(1);
  }
  return cleaned;
}

/**
 * `formatDecimalInput` çıktısını API ondalık metnine çevirir ("12,5" → "12.5", "12," → "12",
 * "," → ""). `parseTrNumber` kullanılmaz: ZTO girişinde nokta da ondalıktır ("12.5" = 12,5).
 */
export function amountText(value: string | null | undefined): string {
  const text = (value ?? "").trim().replace(",", ".");
  if (text === "" || text === ".") return "";
  const normalized = text.endsWith(".") ? text.slice(0, -1) : text;
  const scaled = tryScaled(normalized);
  return scaled === null ? "" : fromScaled(scaled);
}

/** Sıfırdan büyük geçerli tutar mı. */
export function isPositiveAmount(value: string | null | undefined): boolean {
  const text = amountText(value);
  if (text === "") return false;
  const scaled = tryScaled(text);
  return scaled !== null && scaled > 0n;
}

/** API tutarını ("1500.0000") giriş metnine çevirir ("1500.00"). */
export function inputAmount(amount: string | null | undefined): string {
  const scaled = tryScaled(amount ?? "");
  return scaled === null || scaled === 0n ? "" : fromScaled(scaled);
}

// ---------------------------------------------------------------------------------------------
// Form değerleri
// ---------------------------------------------------------------------------------------------

export type SettlementFormValues = {
  accountId: string;
  documentNo: string;
  method: PayMethod | "";
  date: string;
  branchId: string;
  currency: string;
  /** `formatDecimalInput` metni. */
  amount: string;
  /** Yalnız tahsilat: "Döviz Kuru (₺)" (boşsa TCMB). */
  exchangeRate: string;
  /** Nakit kasası ya da banka/kredi kartı bankası. */
  fundAccountId: string;
  counterpartyBankAccountId: string;
  description: string;
  /** Düzenleme: "Düzeltme gerekçesi" (OK-12.2a-16). */
  reason: string;
  check: CheckFieldsValue;
  note: NoteFieldsValue;
  allocations: AllocationBody[];
};

export function emptyCheck(today: string): CheckFieldsValue {
  return {
    mode: "OWN",
    status: "AT_BANK",
    instrumentId: "",
    fundAccountId: "",
    number: "",
    bankName: "",
    dueDate: addDaysIso(today, 30),
  };
}

export function emptyNote(today: string): NoteFieldsValue {
  return { fundAccountId: "", number: "", bankName: "", dueDate: addDaysIso(today, 30) };
}

export function emptyForm(today: string): SettlementFormValues {
  return {
    accountId: "",
    documentNo: "",
    method: "",
    date: today,
    branchId: "",
    currency: "TRY",
    amount: "",
    exchangeRate: "",
    fundAccountId: "",
    counterpartyBankAccountId: "",
    description: "",
    reason: "",
    check: emptyCheck(today),
    note: emptyNote(today),
    allocations: [],
  };
}

// ---------------------------------------------------------------------------------------------
// Doğrulama (ZTO metinleri birebir; `^\d{7}$` tek kural — 04 §7-3)
// ---------------------------------------------------------------------------------------------

/** Hatalı alan: focus için alan adı, metin için `settlementModals.validation.<key>`. */
export type FormField =
  | "accountId"
  | "branchId"
  | "method"
  | "amount"
  | "date"
  | "currency"
  | "fundAccountId"
  | "check.instrumentId"
  | "check.fundAccountId"
  | "check.number"
  | "check.dueDate"
  | "note.number"
  | "note.dueDate"
  | "allocations"
  | "id";

export type ValidationError = { field: FormField; key: string };

/** Çek numarası kuralı (yalnız ZTO istemcisinde, OK-12.2a-10); iki ileti bu kuralın parçalarıdır. */
export const CHECK_NUMBER = /^\d{7}$/;

export function isValidCheckNumber(value: string): boolean {
  return CHECK_NUMBER.test(value.trim());
}

function checkNumberErrors(number: string, emptyKey: string): ValidationError[] {
  const value = number.trim();
  if (value === "") return [{ field: "check.number", key: emptyKey }];
  const errors: ValidationError[] = [];
  if (!/^\d+$/.test(value)) errors.push({ field: "check.number", key: "checkDigits" });
  if (value.length !== 7) errors.push({ field: "check.number", key: "checkLength" });
  return errors;
}

export type ValidateOptions = { allocationExceeded?: boolean };

/** Ödeme (pjs:2585-2650; "Keşide/Düzenlenme tarihi" 12.3'e kadar yok). */
export function validatePayment(
  form: SettlementFormValues,
  options: ValidateOptions = {},
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!form.accountId) errors.push({ field: "accountId", key: "account" });
  if (!form.branchId) errors.push({ field: "branchId", key: "branch" });
  if (!form.method) errors.push({ field: "method", key: "paymentMethod" });
  if (!isPositiveAmount(form.amount)) errors.push({ field: "amount", key: "amount" });
  if (!form.date) errors.push({ field: "date", key: "paymentDate" });
  if (form.method === "CHECK") {
    if (form.check.mode === "ENDORSE") {
      if (!form.check.instrumentId) {
        errors.push({ field: "check.instrumentId", key: "endorsedCheck" });
      }
    } else {
      if (!form.check.fundAccountId) {
        errors.push({ field: "check.fundAccountId", key: "checkBank" });
      }
      errors.push(...checkNumberErrors(form.check.number, "checkNumberIssued"));
      if (!form.check.dueDate) errors.push({ field: "check.dueDate", key: "dueDate" });
    }
  } else if (form.method === "NOTE") {
    if (!form.note.number.trim()) errors.push({ field: "note.number", key: "noteNumber" });
    if (!form.note.dueDate) errors.push({ field: "note.dueDate", key: "dueDate" });
  } else if (form.method === "CASH") {
    if (!form.fundAccountId) errors.push({ field: "fundAccountId", key: "cash" });
  } else if (isBankLike(form.method)) {
    if (!form.fundAccountId) errors.push({ field: "fundAccountId", key: "bank" });
  }
  if (options.allocationExceeded) {
    errors.push({ field: "allocations", key: "allocationPayment" });
  }
  return errors;
}

/** Tahsilat (cjs:2880-2965, :6055-6125). */
export function validateCollection(
  form: SettlementFormValues,
  options: ValidateOptions & { editId?: string | null; edit?: boolean } = {},
): ValidationError[] {
  const errors: ValidationError[] = [];
  if (options.edit && !options.editId) errors.push({ field: "id", key: "collectionId" });
  if (!form.accountId) errors.push({ field: "accountId", key: "account" });
  if (!form.branchId) errors.push({ field: "branchId", key: "branch" });
  if (!form.method) errors.push({ field: "method", key: "collectionMethod" });
  if (!isPositiveAmount(form.amount)) errors.push({ field: "amount", key: "collectionAmount" });
  if (!form.date) errors.push({ field: "date", key: "collectionDate" });
  if (!form.currency) errors.push({ field: "currency", key: "collectionCurrency" });
  if (form.method === "CHECK") {
    errors.push(...checkNumberErrors(form.check.number, "checkNumber"));
    if (!form.check.dueDate) errors.push({ field: "check.dueDate", key: "dueDate" });
    if (form.check.status === "AT_BANK" && !form.check.fundAccountId) {
      errors.push({ field: "check.fundAccountId", key: "checkDepositBank" });
    }
  } else if (form.method === "NOTE") {
    if (!form.note.number.trim()) errors.push({ field: "note.number", key: "noteNumber" });
    if (!form.note.dueDate) errors.push({ field: "note.dueDate", key: "dueDate" });
  } else if (form.method === "CASH") {
    if (!form.fundAccountId) errors.push({ field: "fundAccountId", key: "cash" });
  } else if (isBankLike(form.method)) {
    if (!form.fundAccountId) errors.push({ field: "fundAccountId", key: "bank" });
  }
  if (options.allocationExceeded) {
    errors.push({ field: "allocations", key: "allocationCollection" });
  }
  return errors;
}

/** Alanın ilk hatası (alan altı `aria-describedby` için). */
export function errorOf(errors: readonly ValidationError[], field: FormField): string | null {
  return errors.find((error) => error.field === field)?.key ?? null;
}

// ---------------------------------------------------------------------------------------------
// İstek gövdesi (§5.7 "Gövde kurma", §5.8 "Gövde")
// ---------------------------------------------------------------------------------------------

function optional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Seçili ve tutarı > 0 eşleştirme satırları (ondalık metin). */
export function allocationBody(rows: readonly AllocationBody[]): AllocationBody[] | undefined {
  const result = rows
    .map((row) => ({ ...row, amount: amountText(row.amount) }))
    .filter((row) => isPositiveAmount(row.amount));
  return result.length > 0 ? result : undefined;
}

function baseBody(form: SettlementFormValues, method: SettlementBody["method"]): SettlementBody {
  return {
    method,
    accountId: form.accountId,
    branchId: form.branchId,
    money: { amount: amountText(form.amount), currency: form.currency },
    date: form.date,
    description: optional(form.description),
    documentNo: optional(form.documentNo),
    allocations: allocationBody(form.allocations),
  };
}

function bankFields(form: SettlementFormValues): Partial<SettlementBody> {
  return {
    fundAccountId: form.fundAccountId || undefined,
    channel: form.method === "CREDIT_CARD" ? "CREDIT_CARD" : "TRANSFER",
    counterpartyBankAccountId: form.counterpartyBankAccountId || undefined,
  };
}

/** Ödeme gövdesi (`POST /finance/payments`, düzeltmede `replacement`). */
export function paymentBody(form: SettlementFormValues): SettlementBody {
  switch (form.method) {
    case "CASH":
      return { ...baseBody(form, "CASH"), fundAccountId: form.fundAccountId || undefined };
    case "BANK":
    case "CREDIT_CARD":
      return { ...baseBody(form, "BANK"), ...bankFields(form) };
    case "CHECK": {
      if (form.check.mode === "ENDORSE") {
        return { ...baseBody(form, "CHECK"), instrumentId: form.check.instrumentId };
      }
      const instrument: NewInstrumentBody = {
        kind: "CHECK",
        number: form.check.number.trim(),
        bankName: optional(form.check.bankName),
        dueDate: form.check.dueDate,
        fundAccountId: form.check.fundAccountId || undefined,
      };
      return { ...baseBody(form, "CHECK"), instrument };
    }
    case "NOTE": {
      const instrument: NewInstrumentBody = {
        kind: "NOTE",
        number: form.note.number.trim(),
        bankName: optional(form.note.bankName),
        dueDate: form.note.dueDate,
        fundAccountId: form.note.fundAccountId || undefined,
      };
      return { ...baseBody(form, "CHECK"), instrument };
    }
    default:
      return baseBody(form, "CASH");
  }
}

/** Döviz tahsilatında dolu ve > 0 kur (yoksa TCMB; TRY'de gönderilmez). */
export function exchangeRateOf(form: SettlementFormValues): number | undefined {
  if (form.currency === "TRY") return undefined;
  const text = amountText(form.exchangeRate);
  const rate = Number(text);
  return text !== "" && Number.isFinite(rate) && rate > 0 ? rate : undefined;
}

/** Tahsilat gövdesi (`POST /finance/collections`). Kasaya Al (Ciro) = PORTFOLIO (kasa 12.3). */
export function collectionBody(form: SettlementFormValues): SettlementBody {
  const exchangeRate = exchangeRateOf(form);
  const withRate = (body: SettlementBody): SettlementBody =>
    exchangeRate === undefined ? body : { ...body, exchangeRate };
  switch (form.method) {
    case "CASH":
      return withRate({
        ...baseBody(form, "CASH"),
        fundAccountId: form.fundAccountId || undefined,
      });
    case "BANK":
    case "CREDIT_CARD":
      return withRate({ ...baseBody(form, "BANK"), ...bankFields(form) });
    case "CHECK": {
      const atBank = form.check.status === "AT_BANK";
      const instrument: NewInstrumentBody = {
        kind: "CHECK",
        number: form.check.number.trim(),
        bankName: optional(form.check.bankName),
        dueDate: form.check.dueDate,
        initialStatus: atBank ? "AT_BANK" : "PORTFOLIO",
        fundAccountId: atBank ? form.check.fundAccountId || undefined : undefined,
      };
      return withRate({ ...baseBody(form, "CHECK"), instrument });
    }
    case "NOTE": {
      const instrument: NewInstrumentBody = {
        kind: "NOTE",
        number: form.note.number.trim(),
        bankName: optional(form.note.bankName),
        dueDate: form.note.dueDate,
        initialStatus: "PORTFOLIO",
      };
      return withRate({ ...baseBody(form, "CHECK"), instrument });
    }
    default:
      return baseBody(form, "CASH");
  }
}

export function settlementBody(type: SettlementType, form: SettlementFormValues): SettlementBody {
  return type === "PAYMENT" ? paymentBody(form) : collectionBody(form);
}

// ---------------------------------------------------------------------------------------------
// Düzeltmede kur (goc-defter:F1)
// ---------------------------------------------------------------------------------------------

/**
 * Düzeltilen kaydın kur bağlamı. Düzeltme eski kaydı kendi TL tutarıyla ters çevirir, yeni kaydı
 * yeniden çevirir; gövdede kur yoksa sunucu TCMB kurunu kullanır.
 */
export type CorrectionOriginal = { date: string; currency: string; exchangeRate: number | null };

export function correctionOriginalOf(item: {
  settlementDate: string;
  money: { currency: string };
  exchangeRate: number | null;
}): CorrectionOriginal {
  return {
    date: item.settlementDate,
    currency: item.money.currency,
    exchangeRate: item.exchangeRate,
  };
}

/**
 * Ödeme düzeltmesinin kuru: döviz kaydında tarih ve para birimi değişmediyse kaydın kendi kuru (TL
 * karşılığı korunur; MUI'de elle girilmiş kur dahil), aksi halde undefined (TCMB, §5.7).
 */
export function correctionRate(
  form: Pick<SettlementFormValues, "date" | "currency">,
  original: CorrectionOriginal,
): number | undefined {
  if (form.currency === "TRY" || form.currency !== original.currency) return undefined;
  if (form.date !== original.date) return undefined;
  const rate = original.exchangeRate;
  return rate !== null && Number.isFinite(rate) && rate > 0 ? rate : undefined;
}

/**
 * Tahsilat düzenlemesinde tarih ya da para birimi kaydınkinden ayrılınca önyüklenen eski kur
 * temizlenir (eski günün kuru elle kur gibi yeniden gönderilmesin); kullanıcının yazdığı kur kalır.
 */
export function dropStaleRate(
  form: SettlementFormValues,
  original: CorrectionOriginal,
): SettlementFormValues {
  const loaded = rateText(original.exchangeRate, original.currency);
  if (loaded === "" || form.exchangeRate !== loaded) return form;
  if (form.date === original.date && form.currency === original.currency) return form;
  return { ...form, exchangeRate: "" };
}

/** Düzeltmenin `replacement` gövdesi: ödemede `correctionRate`, tahsilatta formdaki kur. */
export function correctionBody(
  type: SettlementType,
  form: SettlementFormValues,
  original: CorrectionOriginal,
): SettlementBody {
  const body = settlementBody(type, form);
  if (type !== "PAYMENT") return body;
  // `paymentBody` kur yazmaz; düzeltmede yalnız tarih/para birimi aynıysa eski kur eklenir.
  const rate = correctionRate(form, original);
  return rate === undefined ? body : { ...body, exchangeRate: rate };
}

/**
 * Uyarı önizlemesinin gövdesi (`POST /settlements/check`): cari, iş yeri, yöntem, pozitif tutar ve
 * (Nakit/Banka/Kredi Kartı'nda) fon dolu değilse null. Çekte araç gönderilmez (F-12.2-R4 sunucuda
 * kapandı); açıklama/belge no/eşleştirme sorguyu yeniden tetiklemesin diye alınmaz.
 */
export function previewBody(
  type: SettlementType,
  form: SettlementFormValues,
): SettlementBody | null {
  if (!form.accountId || !form.branchId || !form.method || !isPositiveAmount(form.amount)) {
    return null;
  }
  if (fundKindOf(form.method) !== null && !form.fundAccountId) return null;
  const full = settlementBody(type, form);
  const body: SettlementBody = {
    method: full.method,
    accountId: full.accountId,
    branchId: full.branchId,
    money: full.money,
    date: full.date,
  };
  if (full.fundAccountId) body.fundAccountId = full.fundAccountId;
  if (full.channel) body.channel = full.channel;
  if (full.instrumentId) body.instrumentId = full.instrumentId;
  return body;
}

// ---------------------------------------------------------------------------------------------
// Seçenek metinleri
// ---------------------------------------------------------------------------------------------

/** Fon seçeneği: banka "{banka} - {şube} ({sembol})" (banka adı yoksa ad), kasa ad. */
export function fundLabel(
  fund: Pick<Fund, "kind" | "name" | "bankName" | "bankBranchName" | "currency">,
): string {
  if (fund.kind !== "BANK" || !fund.bankName) return fund.name;
  const branch = fund.bankBranchName ? ` - ${fund.bankBranchName}` : "";
  return `${fund.bankName}${branch} (${currencySymbol(fund.currency)})`;
}

/** Para birimi seçeneği "{sembol} - ({ad})". */
export function currencyLabel(currency: { code: string; name: string }): string {
  return `${currencySymbol(currency.code)} - (${currency.name})`;
}

/** Ciro edilebilir çek seçeneği (ZTO `GetEndorsableChecks` displayText; kasa 12.3). */
export function endorsableLabel(
  check: {
    number: string;
    bankName: string | null;
    money: { amount: string; currency: string };
    dueDate: string;
  },
  drawer: string | null,
  formatAmount: (amount: string) => string,
  tm: (key: string, values?: Record<string, string | number>) => string,
): string {
  const parts = [tm("check.optionNumber", { number: check.number, bank: check.bankName ?? "-" })];
  parts.push(`${formatAmount(check.money.amount)} ${currencySymbol(check.money.currency)}`);
  if (drawer) parts.push(tm("check.optionDrawer", { name: drawer }));
  parts.push(tm("check.optionDue", { date: dottedDate(check.dueDate) }));
  return parts.join(" | ");
}

/** "yyyy-MM-dd" → "dd.MM.yyyy". */
export function dottedDate(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "-";
}

/** Karşı taraf banka hesabı seçeneği "{banka} - {maskeli IBAN}". */
export function bankAccountLabel(
  account: Pick<AccountBankAccount, "bankName" | "ibanMasked">,
): string {
  return account.ibanMasked ? `${account.bankName} - ${account.ibanMasked}` : account.bankName;
}

// ---------------------------------------------------------------------------------------------
// Karşı taraf banka hesabı açıklama cümlesi (S-8, Rev 1 SEC-01)
// ---------------------------------------------------------------------------------------------

/** Otomatik cümle kalıbı (ZTO regex'inin hesap sahibi alanı olmadan hali). */
export const BANK_SENTENCE =
  /\[.*?\] - \d+\/\d+\/\d+ - .*? iban bilgisine sahip hesaba yatırılmıştır\.?/g;

/**
 * Açıklamaya cümleyi yazar: önceki otomatik cümle varsa yerine koyar, yoksa sona yeni satırla ekler
 * (pjs:1816-1850). `sentence` null → otomatik cümle silinir.
 */
export function applyBankSentence(description: string, sentence: string | null): string {
  const current = description.trim();
  if (sentence === null) {
    return current.replace(BANK_SENTENCE, "").trim();
  }
  const pattern = new RegExp(BANK_SENTENCE.source);
  if (pattern.test(current)) {
    return current.replace(BANK_SENTENCE, () => sentence);
  }
  return current ? `${current}\n${sentence}` : sentence;
}

// ---------------------------------------------------------------------------------------------
// Düzenleme kilidi (§5.7 "Edit önyükleme")
// ---------------------------------------------------------------------------------------------

const LOCK_CODES: Record<SettlementLockReason, string> = {
  TRANSFERRED: "TRANSACTION_TRANSFERRED",
  REVERSED: "SETTLEMENT_REVERSED",
  CHECK: "SETTLEMENT_CHECK_NOT_REVERSIBLE",
  PLAN: "SETTLEMENT_LINKED_TO_PLAN",
  INTERCOMPANY: "SETTLEMENT_LINKED_TO_INTERCOMPANY",
  FX_SOURCE: "SETTLEMENT_USED_IN_FX_EXCHANGE",
  VEHICLE_EXPENSE: "SETTLEMENT_SOURCE_MANAGED",
  NO_ACCOUNT: "SETTLEMENT_NOT_CORRECTABLE",
};

/** Kilit nedeninin hata kodu; düzeltilmiş (REVERSED + `correctedById`) kayıtta ALREADY_CORRECTED. */
export function lockReasonErrorCode(
  reason: SettlementLockReason | null | undefined,
  correctedById?: string | null,
): string {
  if (reason === "REVERSED" && correctedById) return "SETTLEMENT_ALREADY_CORRECTED";
  return reason ? LOCK_CODES[reason] : "SETTLEMENT_NOT_CORRECTABLE";
}

/** `finance.error.<KOD>` (translation ad alanı; FE-3 doldurur). */
export function lockReasonErrorKey(
  reason: SettlementLockReason | null | undefined,
  correctedById?: string | null,
): string {
  return `finance.error.${lockReasonErrorCode(reason, correctedById)}`;
}

// ---------------------------------------------------------------------------------------------
// ZTO öğe kimlikleri (APM/EPM/CMP birebir; kopyalanan CSS ve e2e seçicileri bunlara bakar)
// ---------------------------------------------------------------------------------------------

export type ModalIds = {
  root: string;
  form: string;
  /** `#remainingDebtInfo` / `#remainingCreditInfo` (düzenlemede `edit…`). */
  remaining: string;
  account: string;
  documentNo: string;
  method: string;
  date: string;
  branch: string;
  currency: string;
  amount: string;
  /** Yalnız tahsilat: "Döviz Kuru (₺)". */
  exchangeRate: string;
  /** Yalnız tahsilat: "Cariden Düşülecek Tutar". */
  ledgerAmount: string;
  calculation: string;
  cashFields: string;
  cash: string;
  bankFields: string;
  bank: string;
  selectInfo: string;
  checkInfo: string;
  billInfo: string;
  description: string;
  reason: string;
  counterparty: string;
  /** `InvoiceAllocationTable` kimlik öneki ("" ya da "edit"). */
  allocationPrefix: string;
};

function editId(base: string, edit: boolean, capitalPrefix: boolean): string {
  if (!edit) return base;
  const upper = base[0] === base[0].toUpperCase();
  if (capitalPrefix && upper) return `Edit${base}`;
  return `edit${base[0].toUpperCase()}${base.slice(1)}`;
}

/**
 * Modal öğe kimlikleri. Ödeme düzenleme (EPM) her kimliği `edit` önekiyle yazar (`editPaymentMethod`);
 * tahsilat düzenleme (CMP :854-1530) giriş alanlarında `Edit`, kaplarda `edit` öneki kullanır
 * (`EditCollectionMethod`, `editBankFields`).
 */
export function modalIds(type: SettlementType, mode: "add" | "edit"): ModalIds {
  const edit = mode === "edit";
  const payment = type === "PAYMENT";
  const id = (base: string) => editId(base, edit, !payment);
  return {
    root: payment
      ? edit
        ? "editPaymentModal"
        : "addPaymentModal"
      : edit
        ? "editCollectionModal"
        : "addCollectionModal",
    form: payment
      ? edit
        ? "editPaymentForm"
        : "paymentForm"
      : edit
        ? "editCollectionForm"
        : "collectionForm",
    remaining: id(payment ? "remainingDebtInfo" : "remainingCreditInfo"),
    account: id("CustomerAccountID"),
    documentNo: id(payment ? "PaymentDocumentNo" : "CollectionDocumentNo"),
    method: id(payment ? "PaymentMethod" : "CollectionMethod"),
    date: id(payment ? "PaymentDate" : "CollectionDate"),
    branch: id("WorkPlaceID"),
    currency: id("CurrencyID"),
    amount: id(payment ? "PaymentAmountInput" : "CollectionAmountInput"),
    exchangeRate: id("ExchangeRate"),
    ledgerAmount: id("Amount"),
    calculation: id(payment ? "calculationResult" : "calculationCollectionResult"),
    cashFields: id("cashFields"),
    cash: id("CashID"),
    bankFields: id("bankFields"),
    bank: id("BankID"),
    selectInfo: id("selectPaymentInfo"),
    checkInfo: id("checkPaymentInfo"),
    billInfo: id("billPaymentInfo"),
    description: id("Description"),
    reason: id("CorrectionReason"),
    // EPM ve CMP karşı taraf seçicisini öneksiz yazar (`#CustomerBankAccountID`).
    counterparty: "CustomerBankAccountID",
    allocationPrefix: edit ? "edit" : "",
  };
}

/** Doğrulama alanının odaklanacak öğesi (çek/senet alanları yalnız ekleme kipindedir). */
export function fieldElementId(
  ids: ModalIds,
  field: FormField,
  form: Pick<SettlementFormValues, "method">,
): string | null {
  switch (field) {
    case "accountId":
      return ids.account;
    case "branchId":
      return ids.branch;
    case "method":
      return ids.method;
    case "amount":
      return ids.amount;
    case "date":
      return ids.date;
    case "currency":
      return ids.currency;
    case "fundAccountId":
      return form.method === "CASH" ? ids.cash : ids.bank;
    case "check.instrumentId":
      return "EndorsableCheckID";
    case "check.fundAccountId":
      return "CheckBankID";
    case "check.number":
      return "CheckNumber";
    case "check.dueDate":
      return "DueDate";
    case "note.number":
      return "BillNumber";
    case "note.dueDate":
      return "BillDueDate";
    case "allocations":
      return `${ids.allocationPrefix}${ids.allocationPrefix ? "S" : "s"}electAllInvoices`;
    default:
      return null;
  }
}

/** Yöntem seçenekleri: ekleme beş yöntem, düzenleme yalnız Nakit / Banka / Kredi Kartı (EPM, CMP). */
export function methodOptions(mode: "add" | "edit"): readonly PayMethod[] {
  return mode === "edit" ? EDIT_METHODS : PAY_METHODS;
}

/** Liste satırının görünen yöntemi → form yöntemi (OTHER üretilmez; tanınmayan → ""). */
export function payMethodOf(displayMethod: string | null | undefined): PayMethod | "" {
  return displayMethod && isPayMethod(displayMethod) ? displayMethod : "";
}

/** Döviz kuru giriş metni (4 hane; TRY ya da kur yoksa boş → TCMB). */
export function rateText(rate: number | null | undefined, currency: string): string {
  if (currency === "TRY" || rate === null || rate === undefined || !(rate > 0)) return "";
  return rate.toFixed(4);
}

type DetailLike = {
  item: {
    accountId: string | null;
    documentNo: string | null;
    displayMethod: string;
    settlementDate: string;
    branchId: string;
    money: { amount: string; currency: string };
    exchangeRate: number | null;
    fundAccountId: string | null;
    counterpartyBankAccountId: string | null;
    description: string | null;
  };
  allocations: {
    targetType: AllocationBody["targetType"];
    targetId: string | null;
    money: { amount: string };
    active: boolean;
    outOfScope: boolean;
  }[];
};

/**
 * Düzenleme önyüklemesi (§5.7 "Edit önyükleme"): kayıt alanları + aktif ve kapsam içindeki
 * eşleşmeler (düzeltmede eski eşleşmeler yeni kayda kopyalanmaz; istemci istekte yeniden gönderir).
 */
export function formFromDetail(detail: DetailLike, today: string): SettlementFormValues {
  const { item } = detail;
  return {
    ...emptyForm(today),
    accountId: item.accountId ?? "",
    documentNo: item.documentNo ?? "",
    method: payMethodOf(item.displayMethod),
    date: item.settlementDate,
    branchId: item.branchId,
    currency: item.money.currency,
    amount: inputAmount(item.money.amount),
    exchangeRate: rateText(item.exchangeRate, item.money.currency),
    fundAccountId: item.fundAccountId ?? "",
    counterpartyBankAccountId: item.counterpartyBankAccountId ?? "",
    description: item.description ?? "",
    allocations: detail.allocations
      .filter((row) => row.active && !row.outOfScope && row.targetId)
      .map((row) => ({
        targetType: row.targetType,
        targetId: row.targetId as string,
        amount: inputAmount(row.money.amount),
      })),
  };
}

export type FormPresets = {
  accountId?: string;
  branchId?: string;
  fundAccountId?: string;
  method?: PayMethod;
  currency?: string;
};

/**
 * Ekleme ön değerleri (derin bağlantı / Banka-Kasa Hareketleri): verilen fonun türü yöntemi
 * belirler (yöntem verilmemişse kasa → Nakit, banka → Banka), iş yeri ve para birimi fondan gelir.
 */
export function presetForm(
  presets: FormPresets,
  fund: Pick<Fund, "kind" | "branchId" | "currency"> | null,
  today: string,
): SettlementFormValues {
  const method = presets.method ?? (fund ? (fund.kind === "CASH" ? "CASH" : "BANK") : "");
  const fundUsable = fund !== null && fundKindOf(method) === fund.kind;
  return {
    ...emptyForm(today),
    accountId: presets.accountId ?? "",
    method,
    branchId: presets.branchId ?? fund?.branchId ?? "",
    currency: fundUsable ? fund.currency : (presets.currency ?? "TRY"),
    fundAccountId: fundUsable ? (presets.fundAccountId ?? "") : "",
  };
}

/** Yöntem değişince yönteme ait olmayan alanlar temizlenir (ZTO `togglePaymentFields`). */
export function withMethod(
  form: SettlementFormValues,
  method: PayMethod | "",
): SettlementFormValues {
  const keepFund = fundKindOf(method) !== null && fundKindOf(method) === fundKindOf(form.method);
  return {
    ...form,
    method,
    fundAccountId: keepFund ? form.fundAccountId : "",
    counterpartyBankAccountId: isBankLike(method) ? form.counterpartyBankAccountId : "",
    check: method === "CHECK" ? form.check : emptyCheck(form.date || todayIso()),
    note: method === "NOTE" ? form.note : emptyNote(form.date || todayIso()),
  };
}

/** İş yeri değişince fon seçimleri sıfırlanır (§5.7; kasa/banka iş yerine bağlıdır). */
export function withBranch(form: SettlementFormValues, branchId: string): SettlementFormValues {
  if (branchId === form.branchId) return form;
  return {
    ...form,
    branchId,
    fundAccountId: "",
    check: { ...form.check, fundAccountId: "", instrumentId: "", bankName: "" },
    note: { ...form.note, fundAccountId: "", bankName: "" },
    allocations: [],
  };
}

/** Cari değişince karşı taraf hesabı, otomatik açıklama cümlesi ve eşleştirmeler sıfırlanır. */
export function withAccount(form: SettlementFormValues, accountId: string): SettlementFormValues {
  if (accountId === form.accountId) return form;
  return {
    ...form,
    accountId,
    counterpartyBankAccountId: "",
    description: applyBankSentence(form.description, null),
    allocations: [],
  };
}

/** Para birimi değişince eşleştirmeler (faturanın para birimine bağlı) sıfırlanır. */
export function withCurrency(form: SettlementFormValues, currency: string): SettlementFormValues {
  if (currency === form.currency) return form;
  return {
    ...form,
    currency,
    exchangeRate: currency === "TRY" ? "" : form.exchangeRate,
    allocations: [],
  };
}

/** "Hesaplama: {tutar} {sembol}" satırı yalnız pozitif tutarda. */
export function calculationText(amount: string, currency: string): string | null {
  const text = amountText(amount);
  if (!isPositiveAmount(text)) return null;
  return `${text} ${currencySymbol(currency)}`;
}

// ---------------------------------------------------------------------------------------------
// Hata ayrıştırma
// ---------------------------------------------------------------------------------------------

type ErrorLike = {
  status?: unknown;
  body?: { code?: unknown; message?: unknown; details?: unknown };
};

/**
 * Hata gövdesindeki `details` satırlarından (`anahtar=değer`) `reason=X` değeri (ör. 422
 * ALLOCATION_TARGET_INVALID `["targetId=…", "reason=CURRENCY"]`); yoksa null (zto-onyuz:F5).
 */
export function apiErrorReason(error: unknown): string | null {
  const details = (error as ErrorLike | null)?.body?.details;
  if (!Array.isArray(details)) return null;
  for (const line of details) {
    if (typeof line === "string" && line.startsWith("reason=")) {
      const value = line.slice("reason=".length).trim();
      if (value) return value;
    }
  }
  return null;
}

/** `ApiError` (ya da testteki benzeri) kodu ve iletisi; ağ hatasında kod null. */
export function apiErrorInfo(error: unknown): { code: string | null; message: string } {
  const body = (error as ErrorLike | null)?.body;
  const code = typeof body?.code === "string" ? body.code : null;
  const message =
    typeof body?.message === "string"
      ? body.message
      : error instanceof Error
        ? error.message
        : String(error ?? "");
  return { code, message };
}
