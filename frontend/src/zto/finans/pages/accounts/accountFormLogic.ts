/*
 * Cari kart formu mantığı (12.1 §5.8; ZTO CustomerAccounts/Add.cshtml, Edit.cshtml): zod şeması (ZTO
 * istemci iletileri), vergi no zorunluluğu, banka satırları, istek gövdeleri, grup değişimi bilgisi ve
 * değişiklik geçmişi metni.
 */
import { z } from "zod";
import type {
  Account,
  AccountBankAccount,
  AccountGroup,
  AccountHistory,
  AccountProfileBody,
  AccountType,
  BankAccountCategory,
  BankAccountKind,
  CompanyType,
  LimitBody,
  SaveAccountBody,
  SaveBankAccountBody,
} from "../../../../pages/finance/types";
import { formatDateTime } from "../../../format";
import {
  BANK_LIMITS,
  normalizeAccountNumber,
  normalizeIbanInput,
  optional,
  validAccountNumber,
} from "./bankAccountLogic";

/** Sunucu sınırları (§4.1 SaveAccountRequest). */
export const ACCOUNT_LIMITS = {
  code: 50,
  name: 200,
  taxNumber: 20,
  taxOffice: 100,
  phone: 30,
  email: 254,
  website: 200,
  contactName: 200,
  contactTitle: 100,
  contactMobile: 30,
  address: 1000,
  city: 100,
  district: 100,
  country: 100,
  postalCode: 20,
  paymentTerms: 1000,
  notes: 2000,
} as const;

/** ZTO: "Malzeme/İlaç Tedarikçisi" → vergi no zorunlu (OK-11: YEDEK_PARCA_SERVIS, AKARYAKIT). */
export const TAX_REQUIRED_GROUPS: readonly string[] = ["YEDEK_PARCA_SERVIS", "AKARYAKIT"];

export function taxRequired(subGroup: string): boolean {
  return TAX_REQUIRED_GROUPS.includes(subGroup);
}

/** Vergi no girdi süzgeci: yalnız rakam. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

let rowSeq = 0;

/** Banka satırı form değeri (`key` yalnız React anahtarı; `id` mevcut kaydın kimliği). */
export type BankRowValues = {
  key: string;
  id?: string;
  bankName: string;
  branchName: string;
  accountNumber: string;
  iban: string;
  holderName: string;
  currency: string;
  accountKind: BankAccountKind;
  category: BankAccountCategory;
  openedOn: string;
  description: string;
};

/** Add.cshtml addBankRow(): Vadesiz, Yan Hesap, açılış bugün. */
export function emptyBankRow(today: string): BankRowValues {
  rowSeq += 1;
  return {
    key: `new-${rowSeq}`,
    bankName: "",
    branchName: "",
    accountNumber: "",
    iban: "",
    holderName: "",
    currency: "",
    accountKind: "DEMAND",
    category: "SUB",
    openedOn: today,
    description: "",
  };
}

export function bankRowFrom(bank: AccountBankAccount): BankRowValues {
  return {
    key: bank.id,
    id: bank.id,
    bankName: bank.bankName,
    branchName: bank.branchName ?? "",
    accountNumber: bank.accountNumber ?? "",
    iban: bank.iban ?? "",
    holderName: bank.holderName ?? "",
    currency: bank.currency,
    accountKind: (bank.accountKind as BankAccountKind) || "DEMAND",
    category: (bank.category as BankAccountCategory) || "SUB",
    openedOn: bank.openedOn ?? "",
    description: bank.description ?? "",
  };
}

/** Boş satır (banka adı, IBAN, hesap no hepsi boş) gönderilmez (§5.8). */
export function isEmptyBankRow(row: Pick<BankRowValues, "bankName" | "iban" | "accountNumber">) {
  return row.bankName.trim() === "" && row.iban.trim() === "" && row.accountNumber.trim() === "";
}

/** ZTO submit kuralı: 1–15 karakterli IBAN varsa uyarı (Add.cshtml:665-674). */
export function hasShortIban(rows: readonly Pick<BankRowValues, "iban">[]): boolean {
  return rows.some((row) => {
    const length = normalizeIbanInput(row.iban).length;
    return length > 0 && length < 16;
  });
}

export type AccountFormValues = {
  subGroup: string;
  branchId: string;
  code: string;
  name: string;
  phone: string;
  companyId: string;
  taxNumber: string;
  taxOffice: string;
  companyType: CompanyType | "";
  defaultCurrency: string;
  creditLimit: string;
  riskLimit: string;
  email: string;
  website: string;
  contactName: string;
  contactTitle: string;
  contactMobile: string;
  address: string;
  city: string;
  district: string;
  country: string;
  postalCode: string;
  paymentTerms: string;
  notes: string;
  bankAccounts: BankRowValues[];
};

export function emptyAccountForm(today: string, country: string): AccountFormValues {
  return {
    subGroup: "",
    branchId: "",
    code: "",
    name: "",
    phone: "",
    companyId: "",
    taxNumber: "",
    taxOffice: "",
    companyType: "",
    defaultCurrency: "TRY",
    creditLimit: "0.00",
    riskLimit: "0.00",
    email: "",
    website: "",
    contactName: "",
    contactTitle: "",
    contactMobile: "",
    address: "",
    city: "",
    district: "",
    country,
    postalCode: "",
    paymentTerms: "",
    notes: "",
    bankAccounts: [emptyBankRow(today)],
  };
}

const limitText = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

export function accountFormFrom(
  account: Account,
  banks: readonly AccountBankAccount[],
  defaultCountry: string,
): AccountFormValues {
  return {
    subGroup: account.subGroup,
    branchId: account.branchId ?? "",
    code: account.code,
    name: account.name,
    phone: account.phone ?? "",
    companyId: account.companyId ?? "",
    taxNumber: account.taxNumber ?? "",
    taxOffice: account.taxOffice ?? "",
    companyType: account.companyType ?? "",
    defaultCurrency: account.defaultCurrency ?? "TRY",
    creditLimit: limitText(account.creditLimit),
    riskLimit: limitText(account.riskLimit),
    email: account.email ?? "",
    website: account.website ?? "",
    contactName: account.contactName ?? "",
    contactTitle: account.contactTitle ?? "",
    contactMobile: account.contactMobile ?? "",
    address: account.address ?? "",
    city: account.city ?? "",
    district: account.district ?? "",
    country: account.country?.trim() ? account.country : defaultCountry,
    postalCode: account.postalCode ?? "",
    paymentTerms: account.paymentTerms ?? "",
    notes: account.notes ?? "",
    bankAccounts: banks.filter((bank) => bank.active).map(bankRowFrom),
  };
}

export type AccountFormMessages = {
  required: string;
  selectRequired: string;
  taxRequired: string;
  tooLong: (max: number) => string;
  invalidNumber: string;
  ibanShort: string;
  accountNumberInvalid: string;
  emailInvalid: string;
};

const text = (max: number, messages: AccountFormMessages) =>
  z.string().max(max, { message: messages.tooLong(max) });

const limitField = (messages: AccountFormMessages) =>
  z.string().refine((value) => value.trim() === "" || parseLimit(value) !== null, {
    message: messages.invalidNumber,
  });

/** Boş e-posta geçerli (isteğe bağlı alan); dolu ise zod 4 `z.email()` kuralı. */
export function validEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === "" || z.email().safeParse(trimmed).success;
}

/** "1.234,50" ya da "1234.5" → 1234.5; boş → undefined; negatif/geçersiz → null. */
export function parseLimit(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/**
 * Form şeması. Zorunlu: Hesap Grubu, Varsayılan İş Yeri, Hesap Adı, Para Birimi, Edit'te Hesap Kodu,
 * YPS/AKY grubunda (Add) Vergi No; dolu banka satırında Banka Adı ve 16+ karakterli IBAN.
 */
export function accountFormSchema(mode: "add" | "edit", messages: AccountFormMessages) {
  const bankRow = z
    .object({
      key: z.string(),
      id: z.string().optional(),
      bankName: text(BANK_LIMITS.bankName, messages),
      branchName: text(BANK_LIMITS.branchName, messages),
      accountNumber: text(BANK_LIMITS.accountNumber, messages).refine(validAccountNumber, {
        message: messages.accountNumberInvalid,
      }),
      iban: z.string(),
      holderName: text(BANK_LIMITS.holderName, messages),
      currency: z.string(),
      accountKind: z.enum(["TIME", "DEMAND", "SAVINGS", "CORPORATE"]),
      category: z.enum(["MAIN", "SUB"]),
      openedOn: z.string(),
      description: text(BANK_LIMITS.description, messages),
    })
    .superRefine((row, ctx) => {
      if (isEmptyBankRow(row)) return;
      if (row.bankName.trim() === "") {
        ctx.addIssue({ code: "custom", path: ["bankName"], message: messages.required });
      }
      const length = normalizeIbanInput(row.iban).length;
      if (length > 0 && length < 16) {
        ctx.addIssue({ code: "custom", path: ["iban"], message: messages.ibanShort });
      }
    });

  return z
    .object({
      subGroup: z.string().min(1, { message: messages.selectRequired }),
      branchId: z.string().min(1, { message: messages.selectRequired }),
      code:
        mode === "edit"
          ? text(ACCOUNT_LIMITS.code, messages).trim().min(1, { message: messages.required })
          : z.string(),
      name: text(ACCOUNT_LIMITS.name, messages).trim().min(1, { message: messages.required }),
      phone: text(ACCOUNT_LIMITS.phone, messages),
      companyId: z.string(),
      taxNumber: text(ACCOUNT_LIMITS.taxNumber, messages),
      taxOffice: text(ACCOUNT_LIMITS.taxOffice, messages),
      companyType: z.enum(["", "INDIVIDUAL", "CORPORATE"]),
      defaultCurrency: z.string().min(1, { message: messages.selectRequired }),
      creditLimit: limitField(messages),
      riskLimit: limitField(messages),
      // Sunucu `@Email`; form `noValidate` olduğu için tarayıcı denetimi yok, burada denetlenir.
      email: text(ACCOUNT_LIMITS.email, messages).refine(validEmail, {
        message: messages.emailInvalid,
      }),
      website: text(ACCOUNT_LIMITS.website, messages),
      contactName: text(ACCOUNT_LIMITS.contactName, messages),
      contactTitle: text(ACCOUNT_LIMITS.contactTitle, messages),
      contactMobile: text(ACCOUNT_LIMITS.contactMobile, messages),
      address: text(ACCOUNT_LIMITS.address, messages),
      city: text(ACCOUNT_LIMITS.city, messages),
      district: text(ACCOUNT_LIMITS.district, messages),
      country: text(ACCOUNT_LIMITS.country, messages),
      postalCode: text(ACCOUNT_LIMITS.postalCode, messages),
      paymentTerms: text(ACCOUNT_LIMITS.paymentTerms, messages),
      notes: text(ACCOUNT_LIMITS.notes, messages),
      bankAccounts: z.array(bankRow),
    })
    .superRefine((values, ctx) => {
      if (mode === "add" && taxRequired(values.subGroup) && values.taxNumber.trim() === "") {
        ctx.addIssue({ code: "custom", path: ["taxNumber"], message: messages.taxRequired });
      }
    });
}

/** Seçilebilir gruplar (formda): `selectable && active`; EMPLOYEE grupları yalnız izinle. */
export function selectableGroups(
  groups: readonly AccountGroup[],
  canEmployee: boolean,
  keepCode?: string,
): AccountGroup[] {
  return [...groups]
    .filter(
      (group) =>
        group.code === keepCode ||
        (group.selectable && group.active && (group.accountType !== "EMPLOYEE" || canEmployee)),
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Grup kodunun cari türü (gövdedeki `type`). */
export function typeOfGroup(
  groups: readonly AccountGroup[],
  code: string,
): AccountType | undefined {
  return groups.find((group) => group.code === code)?.accountType;
}

/** Edit: grup değişince bilgi kutusu (`#refMigrateInfo`) — "'{eski}' → '{yeni}'". */
export function groupChange(
  groups: readonly AccountGroup[],
  original: string,
  current: string,
): { from: string; to: string } | null {
  if (!original || !current || original === current) return null;
  const name = (code: string) => groups.find((group) => group.code === code)?.name ?? code;
  return { from: name(original), to: name(current) };
}

function bankRowBody(row: BankRowValues): SaveBankAccountBody {
  return {
    bankName: row.bankName.trim(),
    branchName: optional(row.branchName),
    accountNumber: optional(normalizeAccountNumber(row.accountNumber)),
    iban: optional(normalizeIbanInput(row.iban)),
    holderName: optional(row.holderName),
    currency: row.currency,
    accountKind: row.accountKind,
    category: row.category,
    openedOn: optional(row.openedOn),
    description: optional(row.description),
  };
}

function profileFields(values: AccountFormValues) {
  return {
    subGroup: values.subGroup,
    companyId: optional(values.companyId),
    defaultCurrency: values.defaultCurrency,
    taxOffice: optional(values.taxOffice),
    companyType: values.companyType === "" ? undefined : values.companyType,
    phone: optional(values.phone),
    email: optional(values.email),
    website: optional(values.website),
    contactName: optional(values.contactName),
    contactTitle: optional(values.contactTitle),
    contactMobile: optional(values.contactMobile),
    address: optional(values.address),
    city: optional(values.city),
    district: optional(values.district),
    country: optional(values.country),
    postalCode: optional(values.postalCode),
    paymentTerms: optional(values.paymentTerms),
    notes: optional(values.notes),
  };
}

/**
 * Banka satırı para birimi boşsa kartın para birimi (ZTO'da "Para birimi" seçilmeden kaydedilen
 * satır sunucuda 3 harfli kod ister).
 */
function withCurrency(row: BankRowValues, fallback: string): BankRowValues {
  return row.currency ? row : { ...row, currency: fallback };
}

/** Add → `POST /finance/accounts` (code boş: sunucu gruptan üretir; `type` = grubun türü). */
export function createBody(values: AccountFormValues, type: AccountType): SaveAccountBody {
  return {
    ...profileFields(values),
    creditLimit: parseLimit(values.creditLimit) ?? undefined,
    riskLimit: parseLimit(values.riskLimit) ?? undefined,
    name: values.name.trim(),
    type,
    taxNumber: optional(values.taxNumber),
    branchId: optional(values.branchId),
    bankAccounts: values.bankAccounts
      .filter((row) => !isEmptyBankRow(row))
      .map((row) => bankRowBody(withCurrency(row, values.defaultCurrency))),
  };
}

/**
 * Edit → `PUT /finance/accounts/{id}/profile`. Formdan kaldırılan mevcut satırlar
 * `deactivatedBankAccountIds`'e girer; boşaltılmış mevcut satır da kaldırılmış sayılır.
 */
export function profileBody(
  values: AccountFormValues,
  type: AccountType,
  originalBankIds: readonly string[],
): AccountProfileBody {
  const kept = values.bankAccounts.filter((row) => !isEmptyBankRow(row));
  const keptIds = new Set(kept.map((row) => row.id).filter((id): id is string => !!id));
  return {
    ...profileFields(values),
    code: values.code.trim(),
    name: values.name.trim(),
    type,
    subGroup: values.subGroup,
    taxNumber: optional(values.taxNumber),
    branchId: optional(values.branchId),
    bankAccounts: kept.map((row) => ({
      ...bankRowBody(withCurrency(row, values.defaultCurrency)),
      ...(row.id ? { id: row.id } : {}),
    })),
    deactivatedBankAccountIds: originalBankIds.filter((id) => !keptIds.has(id)),
  };
}

/**
 * Edit: profil PUT'u limit almaz (`AccountProfileRequest`); kart (konsolide) limiti değiştiyse
 * `PUT /finance/accounts/{id}/limits` gövdesi, değişmediyse null. Boş alan limiti kaldırır (null).
 */
export function limitsChange(values: AccountFormValues, account: Account): LimitBody | null {
  const credit = parseLimit(values.creditLimit) ?? null;
  const risk = parseLimit(values.riskLimit) ?? null;
  if (credit === (account.creditLimit ?? null) && risk === (account.riskLimit ?? null)) return null;
  return { companyId: null, creditLimit: credit, riskLimit: risk };
}

/** Kayıt Bilgileri tarihi: `dd.MM.yyyy HH:mm`, boşsa "-". */
export function recordDate(value: string | null | undefined): string {
  return (value && formatDateTime(value)) || "-";
}

/** "Değişiklik Geçmişi" metni: satır başına "{tarih} {kullanıcı}: {olay}" (en yeni önce). */
export function historyText(
  history: readonly AccountHistory[],
  eventLabel: (event: string) => string,
): string {
  return history
    .map((entry) =>
      [formatDateTime(entry.at), `${entry.actorEmail ?? "-"}:`, eventLabel(entry.event)]
        .filter((part) => part !== "")
        .join(" "),
    )
    .join("\n");
}

/** Sunucu hata kodu → form alanı (yoksa formun üstündeki uyarı). */
export function accountErrorField(
  code: string | undefined,
): "code" | "taxNumber" | "subGroup" | "bank" | null {
  switch (code) {
    case "ACCOUNT_CODE_TAKEN":
    case "ACCOUNT_CODE_EXHAUSTED":
      return "code";
    case "TAX_NUMBER_REQUIRED":
    case "TAX_NUMBER_INVALID":
      return "taxNumber";
    case "ACCOUNT_GROUP_INVALID":
    case "ACCOUNT_TYPE_LOCKED":
    case "ACCOUNT_TYPE_RESERVED":
      return "subGroup";
    case "IBAN_INVALID":
    case "IBAN_TAKEN":
    case "BANK_ACCOUNT_IDENTIFIER_REQUIRED":
      return "bank";
    default:
      return null;
  }
}

/** Sunucunun banka hatası hangi satırın altında: dolu IBAN'lı ilk satır, yoksa dolu ilk satır. */
export function bankErrorRow(rows: readonly BankRowValues[]): number {
  const withIban = rows.findIndex((row) => row.iban.trim() !== "");
  if (withIban >= 0) return withIban;
  const filled = rows.findIndex((row) => !isEmptyBankRow(row));
  return filled >= 0 ? filled : 0;
}
