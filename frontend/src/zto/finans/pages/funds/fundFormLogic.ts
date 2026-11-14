/*
 * Banka / Kasa Yeni-Düzenle form mantığı (12.2 §5.6, §5.8; ZTO BankIntroduction/Add.cshtml, Edit.cshtml,
 * CashIntroduction/Add.cshtml, Edit.cshtml): ZTO banka listesi, IBAN süzgeci ve TR doğrulaması, form
 * şeması, istek gövdeleri, açılış bakiyesi değişikliği ve sunucu hata eşlemesi.
 */
import { z } from "zod";
import type {
  FundBody,
  FundDetail,
  FundKind,
  UpdateFundBody,
} from "../../../../pages/finance/types";

/** ZTO Add.cshtml `<select asp-for="Bank">` seçenekleri, sırası birebir. */
export const ZTO_BANKS: readonly string[] = [
  "Türkiye Vakıflar Bankası T.A.O.",
  "Yapı ve Kredi Bankası A.Ş.",
  "Denizbank A.Ş.",
  "T.C. Ziraat Bankası A.Ş.",
  "Türkiye Garanti Bankası A.Ş.",
  "Türkiye Halk Bankası A.Ş.",
  "HSBC Bank A.Ş.",
  "ICBC Turkey Bank A.Ş.",
  "ING Bank A.Ş.",
  "Türkiye İş Bankası A.Ş.",
  "Akbank T.A.Ş.",
  "Alternatifbank A.Ş.",
  "Anadolubank A.Ş.",
  "Arap Türk Bankası A.Ş.",
  "Bank Mellat",
  "Bank of China Turkey A.Ş.",
  "Burgan Bank A.Ş.",
  "Citibank A.Ş.",
  "ColendiBank A.Ş.",
  "Deutsche Bank A.Ş.",
  "Enpara Bank A.Ş.",
  "Fibabanka A.Ş.",
  "JPMorgan Chase Bank N.A.",
  "MUFG Bank Turkey A.Ş.",
  "Odeabank A.Ş.",
  "QNB Bank A.Ş.",
  "Şekerbank T.A.Ş.",
  "Türk Ekonomi Bankası A.Ş.",
  "Turkish Bank A.Ş.",
  "Turkland Bank A.Ş.",
  "Kuveyt Türk Katılım Bankası",
  "Diğer",
];

/** Banka seçenekleri; düzenlenen kaydın listede olmayan değeri en üste eklenir. */
export function bankOptions(saved: string | null | undefined): string[] {
  const value = (saved ?? "").trim();
  return value && !ZTO_BANKS.includes(value) ? [value, ...ZTO_BANKS] : [...ZTO_BANKS];
}

/** Sunucu sınırları (§4.1 CreateFundRequest). */
export const FUND_LIMITS = {
  code: 50,
  name: 200,
  bankName: 100,
  bankBranchName: 100,
  accountNo: 40,
  iban: 34,
  description: 500,
} as const;

/** ZTO IBAN girişi: büyük harf, harf/rakam dışı silinir (Add.cshtml `Iban` input dinleyicisi). */
export function normalizeIban(value: string): string {
  return value.toLocaleUpperCase("en-US").replace(/[^A-Z0-9]/g, "");
}

/** TR IBAN: "TR" + 24 hane (toplam 26) ve ISO 13616 mod-97 = 1. Boş geçerlidir (isteğe bağlı alan). */
export function validTrIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (iban === "") return true;
  if (!/^TR\d{24}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** Hesap numarası: boşluklar atılır. */
export function normalizeAccountNo(value: string): string {
  return value.replace(/\s+/g, "");
}

/** Maskeli değer mi ("****1234"; düz hali yalnız FINANCE_MANAGE'de gelir). */
export function isMasked(value: string | null | undefined): boolean {
  return (value ?? "").includes("*");
}

function optional(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

export type FundFormValues = {
  bankName: string;
  code: string;
  name: string;
  bankBranchName: string;
  currency: string;
  accountNo: string;
  iban: string;
  branchId: string;
  /** `type="number"` metni (ZTO), boşsa 0. */
  openingBalance: string;
  description: string;
  openingDate: string;
  /**
   * Döviz açılışında elle kur (TL karşılığı; OK-12.2-37). Boşsa sunucu açılış tarihindeki TCMB
   * kurunu kullanır, kur yoksa 422 `RATE_MISSING`.
   */
  openingRate: string;
  active: "true" | "false";
  allowNegative: boolean;
};

export function emptyFundForm(today: string): FundFormValues {
  return {
    bankName: "",
    code: "",
    name: "",
    bankBranchName: "",
    currency: "",
    accountNo: "",
    iban: "",
    branchId: "",
    openingBalance: "0",
    description: "",
    openingDate: today,
    openingRate: "",
    active: "true",
    allowNegative: false,
  };
}

export function fundFormFrom(fund: FundDetail, today: string): FundFormValues {
  return {
    bankName: fund.bankName ?? "",
    code: fund.code,
    name: fund.name,
    bankBranchName: fund.bankBranchName ?? "",
    currency: fund.currency,
    accountNo: fund.accountNo ?? "",
    iban: fund.iban ?? "",
    branchId: fund.branchId,
    openingBalance: String(fund.openingBalance ?? 0),
    description: fund.description ?? "",
    openingDate: fund.openingDate ?? today,
    openingRate: "",
    active: fund.active ? "true" : "false",
    allowNegative: fund.allowNegative,
  };
}

/** Başlangıç bakiyesi metni → 2 haneye yuvarlanmış sayı (boş/geçersiz 0). */
export function openingAmount(text: string): number {
  const value = Number(String(text).replace(",", "."));
  return Number.isFinite(value) ? (Math.sign(value) * Math.round(Math.abs(value) * 100)) / 100 : 0;
}

/** Kur alanı gerekli mi: para birimi TRY değil ve açılış tutarı sıfır değil (OK-12.2-37). */
export function needsOpeningRate(values: Pick<FundFormValues, "currency" | "openingBalance">) {
  return (
    values.currency !== "" &&
    values.currency !== "TRY" &&
    openingAmount(values.openingBalance) !== 0
  );
}

/** Kur metni → sayı; boş, geçersiz ya da ≤ 0 ise `undefined` (sunucu TCMB kurunu dener). */
export function openingRateValue(text: string): number | undefined {
  const trimmed = String(text ?? "").trim();
  if (trimmed === "") return undefined;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Gövdeye girecek kur: yalnız kur alanı gerekliyken ve doluysa. */
function rateFor(values: FundFormValues): number | undefined {
  return needsOpeningRate(values) ? openingRateValue(values.openingRate) : undefined;
}

/** Açılış (tutar veya tarih) kayıtlı değerden farklı mı (§3.1.2 — farklıysa sunucuda "değiştir"). */
export function openingChanged(values: FundFormValues, saved: FundDetail): boolean {
  return (
    openingAmount(values.openingBalance) !== Math.round((saved.openingBalance ?? 0) * 100) / 100 ||
    (values.openingDate || null) !== (saved.openingDate ?? null)
  );
}

export type FundFormMessages = {
  required: string;
  selectRequired: string;
  ibanInvalid: string;
  numberInvalid: string;
  tooLong: (max: number) => string;
};

const text = (max: number, messages: FundFormMessages) =>
  z.string().max(max, { message: messages.tooLong(max) });

/** Form şeması (`kind`: banka alanları yalnız BANK'ta zorunlu). */
export function fundFormSchema(kind: FundKind, messages: FundFormMessages) {
  const required = (max: number) =>
    text(max, messages).trim().min(1, { message: messages.required });
  return z.object({
    bankName:
      kind === "BANK"
        ? text(FUND_LIMITS.bankName, messages).min(1, { message: messages.selectRequired })
        : text(FUND_LIMITS.bankName, messages),
    code: required(FUND_LIMITS.code),
    name: required(FUND_LIMITS.name),
    bankBranchName: text(FUND_LIMITS.bankBranchName, messages),
    currency: z.string().min(1, { message: messages.selectRequired }),
    accountNo: text(FUND_LIMITS.accountNo, messages),
    iban: text(FUND_LIMITS.iban, messages).refine(validTrIban, { message: messages.ibanInvalid }),
    branchId: z.string().min(1, { message: messages.selectRequired }),
    openingBalance: z
      .string()
      .refine((v) => v.trim() !== "", { message: messages.required })
      .refine((v) => Number.isFinite(Number(v.replace(",", "."))), {
        message: messages.numberInvalid,
      }),
    description: text(FUND_LIMITS.description, messages),
    openingDate: z.string(),
    openingRate: z.string().refine((v) => v.trim() === "" || openingRateValue(v) !== undefined, {
      message: messages.numberInvalid,
    }),
    active: z.enum(["true", "false"]),
    allowNegative: z.boolean(),
  });
}

/** Yeni hesap gövdesi (kullanıcı yolunda yalnız Vadesiz — OK-12.2-17). */
export function createFundBody(values: FundFormValues, kind: FundKind): FundBody {
  const accountNo = optional(normalizeAccountNo(values.accountNo));
  return {
    code: values.code.trim(),
    name: values.name.trim(),
    kind,
    currency: values.currency,
    branchId: values.branchId,
    bankName: kind === "BANK" ? optional(values.bankName) : undefined,
    iban: kind === "BANK" ? optional(normalizeIban(values.iban)) : undefined,
    allowNegative: values.allowNegative,
    accountType: "DEMAND",
    accountNo: kind === "BANK" ? accountNo : undefined,
    bankBranchName: kind === "BANK" ? optional(values.bankBranchName) : undefined,
    description: optional(values.description),
    active: values.active === "true",
    openingBalance: openingAmount(values.openingBalance),
    openingDate: optional(values.openingDate),
    openingRate: rateFor(values),
  };
}

/**
 * Güncelleme gövdesi: açılış yalnız değiştiyse gönderilir (null = değişmez); maskeli ve değişmemiş
 * hesap no gönderilmez (düz değer yalnız FINANCE_MANAGE detayında gelir).
 */
export function updateFundBody(
  values: FundFormValues,
  saved: FundDetail,
  kind: FundKind,
): UpdateFundBody {
  const changed = openingChanged(values, saved);
  const accountNo = normalizeAccountNo(values.accountNo);
  const accountNoUnchanged = accountNo === normalizeAccountNo(saved.accountNo ?? "");
  return {
    name: values.name.trim(),
    branchId: values.branchId,
    bankName: kind === "BANK" ? optional(values.bankName) : undefined,
    iban: kind === "BANK" ? optional(normalizeIban(values.iban)) : undefined,
    allowNegative: values.allowNegative,
    accountNo:
      kind !== "BANK" || (accountNoUnchanged && isMasked(accountNo))
        ? undefined
        : optional(accountNo),
    bankBranchName: kind === "BANK" ? optional(values.bankBranchName) : undefined,
    description: optional(values.description),
    active: values.active === "true",
    openingBalance: changed ? openingAmount(values.openingBalance) : null,
    openingDate: changed ? optional(values.openingDate) : undefined,
    // Para birimi düzenlemede kilitli: kayıtlı değer esas alınır.
    openingRate: changed ? rateFor({ ...values, currency: saved.currency }) : undefined,
  };
}

export type FundFormField = keyof FundFormValues;

/** Sunucu hata kodu → form alanı (yoksa sayfa düzeyi uyarı). */
export function fundErrorField(code: string | undefined): FundFormField | null {
  switch (code) {
    case "FUND_CODE_TAKEN":
      return "code";
    case "INSUFFICIENT_FUNDS":
      return "openingBalance";
    case "RATE_MISSING":
      return "openingRate";
    case "IBAN_INVALID":
      return "iban";
    case "FUND_COMPANY_LOCKED":
    case "COMPANY_MISMATCH":
      return "branchId";
    default:
      return null;
  }
}
