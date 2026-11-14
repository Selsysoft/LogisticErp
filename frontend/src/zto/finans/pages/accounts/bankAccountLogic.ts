/*
 * Cari banka hesapları mantığı (12.1 §5.9; ZTO BankAccounts/{Index,Add,Edit}.cshtml): IBAN girdi
 * süzgeci, "IBAN ya da hesap no" kuralı, form şeması ve gövde, maskeli IBAN okuma metni.
 */
import { z } from "zod";
import type {
  AccountBankAccount,
  BankAccountCategory,
  BankAccountKind,
  SaveBankAccountBody,
} from "../../../../pages/finance/types";

export const BANK_KINDS: readonly BankAccountKind[] = ["TIME", "DEMAND", "SAVINGS", "CORPORATE"];
export const BANK_CATEGORIES: readonly BankAccountCategory[] = ["MAIN", "SUB"];

/** Sunucu sınırları (§4.2). */
export const BANK_LIMITS = {
  bankName: 100,
  branchName: 100,
  accountNumber: 34,
  iban: 34,
  holderName: 200,
  description: 500,
} as const;

/** ZTO `.iban-input` süzgeci: büyük harf, yalnız A-Z0-9 (boşluk ve işaretler atılır). */
export function normalizeIbanInput(value: string): string {
  return value.toLocaleUpperCase("en-US").replace(/[^A-Z0-9]/g, "");
}

/** Hesap numarası: boşluklar atılır ("0012 3456 7890" → "001234567890"; IBAN süzgeci gibi). */
export function normalizeAccountNumber(value: string): string {
  return value.replace(/\s+/g, "");
}

/** Sunucu kuralı (`SaveBankAccountRequest.accountNumber` `^[A-Za-z0-9-]*$`), boşluklar atıldıktan sonra. */
export function validAccountNumber(value: string): boolean {
  return /^[A-Za-z0-9-]*$/.test(normalizeAccountNumber(value));
}

/** IBAN ya da hesap numarasından en az biri dolu mu (Add ve Edit aynı kural, §5.9). */
export function hasIdentifier(values: { iban?: string; accountNumber?: string }): boolean {
  return (values.iban ?? "").trim() !== "" || (values.accountNumber ?? "").trim() !== "";
}

/** Maskeli IBAN'ın son dört hanesi (ekran okuyucu: yıldızlar okunmaz, MWG copy-button). */
export function lastFour(masked: string | null | undefined): string {
  const chars = (masked ?? "").replace(/[^A-Za-z0-9]/g, "");
  return chars.slice(-4);
}

/** Boş metni undefined'a çevirir (isteğe bağlı alanlar gövdeye konmaz). */
export function optional(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

export type BankFormValues = {
  bankName: string;
  branchName: string;
  accountNumber: string;
  iban: string;
  holderName: string;
  accountKind: BankAccountKind | "";
  currency: string;
  category: BankAccountCategory | "";
  openedOn: string;
  description: string;
};

export type BankFormMessages = {
  required: string;
  selectRequired: string;
  identifierRequired: string;
  accountNumberInvalid: string;
  tooLong: (max: number) => string;
};

/** Yeni banka hesabı formunun başlangıç değerleri (BAA: Vadesiz, Yan Hesap, bugün). */
export function emptyBankForm(today: string): BankFormValues {
  return {
    bankName: "",
    branchName: "",
    accountNumber: "",
    iban: "",
    holderName: "",
    accountKind: "DEMAND",
    currency: "",
    category: "SUB",
    openedOn: today,
    description: "",
  };
}

export function bankFormFrom(bank: AccountBankAccount): BankFormValues {
  return {
    bankName: bank.bankName,
    branchName: bank.branchName ?? "",
    accountNumber: bank.accountNumber ?? "",
    iban: bank.iban ?? "",
    holderName: bank.holderName ?? "",
    accountKind: (BANK_KINDS as readonly string[]).includes(bank.accountKind)
      ? (bank.accountKind as BankAccountKind)
      : "",
    currency: bank.currency,
    category: (BANK_CATEGORIES as readonly string[]).includes(bank.category)
      ? (bank.category as BankAccountCategory)
      : "",
    openedOn: bank.openedOn ?? "",
    description: bank.description ?? "",
  };
}

const text = (max: number, messages: BankFormMessages) =>
  z.string().max(max, { message: messages.tooLong(max) });

/**
 * Banka hesabı form şeması. "İkisinden biri" kuralı form düzeyindedir: hata IBAN alanının altında
 * gösterilir, `aria-describedby` her iki alana bağlanır (§5.9 MWG).
 */
export function bankFormSchema(messages: BankFormMessages) {
  return z
    .object({
      bankName: text(BANK_LIMITS.bankName, messages).trim().min(1, { message: messages.required }),
      branchName: text(BANK_LIMITS.branchName, messages),
      accountNumber: text(BANK_LIMITS.accountNumber, messages).refine(validAccountNumber, {
        message: messages.accountNumberInvalid,
      }),
      iban: text(BANK_LIMITS.iban, messages),
      holderName: text(BANK_LIMITS.holderName, messages),
      accountKind: z.enum(["", "TIME", "DEMAND", "SAVINGS", "CORPORATE"]),
      currency: z.string().min(1, { message: messages.selectRequired }),
      category: z
        .enum(["", "MAIN", "SUB"])
        .refine((value) => value !== "", { message: messages.selectRequired }),
      openedOn: z.string(),
      description: text(BANK_LIMITS.description, messages),
    })
    .superRefine((values, ctx) => {
      if (!hasIdentifier(values)) {
        ctx.addIssue({ code: "custom", path: ["iban"], message: messages.identifierRequired });
      }
    });
}

/** Form değeri → istek gövdesi (§4.2 SaveBankAccountRequest). */
export function bankBody(values: BankFormValues): SaveBankAccountBody {
  return {
    bankName: values.bankName.trim(),
    branchName: optional(values.branchName),
    accountNumber: optional(normalizeAccountNumber(values.accountNumber)),
    iban: optional(normalizeIbanInput(values.iban)),
    holderName: optional(values.holderName),
    currency: values.currency,
    accountKind: values.accountKind === "" ? undefined : values.accountKind,
    category: (values.category || "SUB") as BankAccountCategory,
    openedOn: optional(values.openedOn),
    description: optional(values.description),
  };
}

/** Sunucu hata kodu → formdaki alan (yoksa sayfa düzeyi uyarı). */
export function bankErrorField(code: string | undefined): "iban" | null {
  if (
    code === "IBAN_INVALID" ||
    code === "IBAN_TAKEN" ||
    code === "BANK_ACCOUNT_IDENTIFIER_REQUIRED"
  )
    return "iban";
  return null;
}
