import { z } from "zod";
import type {
  AccountDocument,
  AccountDocumentBody,
  DocumentPaymentMethod,
  DocumentSide,
} from "../../../../pages/finance/types";

/*
 * Borç/Alacak Ekle modalı (ZTO addDebtModal / addCreditModal) form mantığı (12.1 §5.10): değerler,
 * doğrulama (ZTO istemci iletileri tjs:1440-1560), istek gövdesi ve revize için belgeden değer.
 */

export const PAYMENT_METHODS: readonly DocumentPaymentMethod[] = [
  "CASH",
  "BANK",
  "CHECK",
  "NOTE",
  "CREDIT_CARD",
  "OTHER",
];

export type DocumentFormValues = {
  documentDate: string;
  documentNo: string;
  documentType: string;
  dueDate: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  branchId: string;
  description: string;
  reflectToLedger: boolean;
  discountRate: string;
  vatRate: string;
  withholdingAmount: string;
  otherTaxesAmount: string;
};

/** Hata iletisi anahtarları (ztoFinans:transactions.document.*). */
export type DocumentErrorKey = "fieldRequired" | "errAmount" | "errCurrency";

const required = z.string().trim().min(1, "fieldRequired");

/** Sayı alanı (input type=number: nokta ondalık); boş → 0. */
export function numberOf(value: string | null | undefined): number {
  if (value === null || value === undefined || value.trim() === "") return 0;
  const n = Number(value.replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

const rate = z.string().refine((v) => {
  const n = numberOf(v);
  return Number.isFinite(n) && n >= 0 && n <= 100;
}, "errAmount");
const nonNegative = z.string().refine((v) => {
  const n = numberOf(v);
  return Number.isFinite(n) && n >= 0;
}, "errAmount");

export const documentFormSchema = z.object({
  documentDate: required,
  documentNo: required.max(50, "fieldRequired"),
  documentType: required,
  dueDate: z.string(),
  amount: required.refine((v) => numberOf(v) > 0, "errAmount"),
  currency: z.string().trim().min(1, "errCurrency"),
  paymentMethod: required,
  branchId: required,
  description: z.string().max(500),
  reflectToLedger: z.boolean(),
  discountRate: rate,
  vatRate: rate,
  withholdingAmount: nonNegative,
  otherTaxesAmount: nonNegative,
});

/**
 * Modal üstündeki tek ileti (ZTO alert sırası): para birimi yoksa "Lütfen para birimi seçiniz!",
 * zorunlu alan eksikse "Lütfen tüm zorunlu alanları doldurunuz.", tutar ≤ 0 ise "Tutar sıfırdan büyük
 * olmalıdır.".
 */
export function summaryError(
  errors: Partial<Record<keyof DocumentFormValues, { message?: string }>>,
): "errCurrency" | "errRequired" | "errAmount" | null {
  const messages = Object.values(errors).map((e) => e?.message);
  if (errors.currency) return "errCurrency";
  if (messages.includes("fieldRequired")) return "errRequired";
  if (messages.includes("errAmount")) return "errAmount";
  return null;
}

export function emptyDocumentValues(defaults: {
  date: string;
  documentType: string;
  currency: string;
  branchId: string;
}): DocumentFormValues {
  return {
    documentDate: defaults.date,
    documentNo: "",
    documentType: defaults.documentType,
    dueDate: "",
    amount: "",
    currency: defaults.currency,
    paymentMethod: "",
    branchId: defaults.branchId,
    description: "",
    reflectToLedger: true,
    discountRate: "0",
    vatRate: "20",
    withholdingAmount: "0",
    otherTaxesAmount: "0",
  };
}

/** Revize kipi: açık belgenin değerleri. */
export function valuesFromDocument(doc: AccountDocument): DocumentFormValues {
  return {
    documentDate: doc.documentDate,
    documentNo: doc.documentNo,
    documentType: doc.documentType,
    dueDate: doc.dueDate ?? "",
    amount: String(doc.amount),
    currency: doc.currency,
    paymentMethod: doc.paymentMethod,
    branchId: doc.branchId,
    description: doc.description ?? "",
    reflectToLedger: doc.reflectToLedger,
    discountRate: String(doc.tax?.discountRate ?? 0),
    vatRate: String(doc.tax?.vatRate ?? 20),
    withholdingAmount: String(doc.tax?.withholdingAmount ?? 0),
    otherTaxesAmount: String(doc.tax?.otherTaxesAmount ?? 0),
  };
}

/** İstek gövdesi; fatura bölümü olmayan türde vergi ve "yansıt" gönderilmez (sunucu yok sayar). */
export function toDocumentBody(
  values: DocumentFormValues,
  side: DocumentSide,
  invoiceSection: boolean,
): AccountDocumentBody {
  const body: AccountDocumentBody = {
    side,
    documentType: values.documentType,
    documentNo: values.documentNo.trim(),
    documentDate: values.documentDate,
    amount: numberOf(values.amount),
    currency: values.currency,
    paymentMethod: values.paymentMethod as DocumentPaymentMethod,
    branchId: values.branchId,
  };
  if (values.dueDate) body.dueDate = values.dueDate;
  const description = values.description.trim();
  if (description) body.description = description;
  if (invoiceSection) {
    body.reflectToLedger = values.reflectToLedger;
    body.tax = {
      discountRate: numberOf(values.discountRate),
      vatRate: numberOf(values.vatRate),
      withholdingAmount: numberOf(values.withholdingAmount),
      otherTaxesAmount: numberOf(values.otherTaxesAmount),
    };
  }
  return body;
}

// ---------------------------------------------------------------------------------------------
// 12.2 eksik fatura (§5.14 "fatura girişi", K-12.2-4)
// ---------------------------------------------------------------------------------------------

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type InvoiceContribution = {
  /** Seçili tür eksik fatura hesabında fatura sayılır (`countsAsInvoice`). */
  countsAsInvoice: boolean;
  /** Belge deftere yansır mı (fatura bölümü yoksa her zaman yansır). */
  reflect: boolean;
  /** Deftere yansısaydı yazılacak tutar: fatura bölümünde net ödenecek, değilse tutar (§3.7 tabanı). */
  net: number;
};

/**
 * Belgenin fatura toplamına katkısı: yalnız yansıtılmayan fatura belgesi eksiği azaltır (yansıyan
 * belge hem defter toplamını hem fatura toplamını aynı tutarla artırır, eksik değişmez).
 */
export function unreflectedInvoiceAmount(input: InvoiceContribution): number {
  if (!input.countsAsInvoice || input.reflect) return 0;
  return Number.isFinite(input.net) && input.net > 0 ? round2(input.net) : 0;
}

/**
 * "Bu belge kaydedilince kalan" (§5.14): mevcut eksik − yeni belgenin katkısı (+ revizede eski
 * belgenin katkısı geri eklenir). Sonuç eksiye düşmez (fatura fazlası "0" gösterilir).
 */
export function remainingAfterSave(
  missing: number,
  next: InvoiceContribution,
  previous: InvoiceContribution | null = null,
): number {
  const before = previous ? unreflectedInvoiceAmount(previous) : 0;
  return Math.max(0, round2(missing + before - unreflectedInvoiceAmount(next)));
}
