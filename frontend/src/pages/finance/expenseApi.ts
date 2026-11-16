import { keepPreviousData, useQuery, type UseMutationOptions } from "@tanstack/react-query";
import { apiGet, apiRequest, apiUpload } from "../../api/client";
import { useActiveCompanyId } from "../../auth/companyStore";
import type { StoredFile } from "../crm/types";
import { buildQuery, effectiveCompany, useFinanceMutation } from "./accountApi";
import { useDebouncedValue } from "./fundApi";
import type {
  ExpenseCalendar,
  ExpenseContextOption,
  ExpenseContextType,
  ExpenseDetail,
  ExpenseItem,
  ExpenseItemSummary,
  ExpenseListItem,
  ExpenseMonthly,
  Page,
  ReverseExpenseRequest,
  ReviseExpenseRequest,
  SaveExpenseItemRequest,
  SaveExpenseRequest,
} from "./types";

/*
 * 12.7 masraf kalemi ve masraf istemcisi (12.7_TASARIM §4.2, §5.2; `instrumentApi.ts` kalıbı).
 * Masraf kalemi anahtarı MUI ile aynıdır (["finance", "expense-items"]): iki ekran birbirini
 * geçersizler. Masraf anahtarları ["finance", "expenses", …]. Mutasyonlar `useFinanceMutation` ile
 * ["finance"]'ı geçersizler (masraf + cari ekstre + fon anahtarları). Şirkete duyarlı sorgularda
 * `companyId`: undefined → aktif şirket, null → konsolide (accountApi kuralı).
 */

// ---------------------------------------------------------------------------------------------
// Sınırlar (sunucu doğrulamasıyla aynı)
// ---------------------------------------------------------------------------------------------

/** `GET /expenses` `size` 1–500 (varsayılan 50). */
export const EXPENSE_LIST_MAX_SIZE = 500;
export const EXPENSE_LIST_DEFAULT_SIZE = 50;
/** `GET /expenses/monthly` `months` 1–24 (varsayılan 6). */
export const EXPENSE_MONTHLY_MAX = 24;
export const EXPENSE_MONTHLY_DEFAULT = 6;
/** Bağlam araması: `q` en az 1 karakter, 300 ms gecikmeli; sunucu en çok 20 sonuç döner. */
export const EXPENSE_CONTEXT_MIN_QUERY = 1;
export const EXPENSE_CONTEXT_DEBOUNCE_MS = 300;
/** Masraf belgesi `stored_file.owner_type`. */
export const EXPENSE_FILE_OWNER = "EXPENSE";

const segment = encodeURIComponent;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

// ---------------------------------------------------------------------------------------------
// Sorgu yolları (saf)
// ---------------------------------------------------------------------------------------------

/** Şirket + iş yeri kapsamı (liste/özet/takvim/aylık ortak). */
export type ExpenseScopeParams = {
  /** undefined → aktif şirket; null → konsolide. */
  companyId?: string | null;
  branchIds?: readonly string[];
};

/** `GET /finance/expenses` süzgeçleri. */
export type ExpenseListParams = ExpenseScopeParams & {
  expenseItemId?: string;
  currency?: string;
  /** ISO `YYYY-MM-DD` (fatura tarihi aralığı). */
  from?: string;
  to?: string;
  /** 0 tabanlı. */
  page?: number;
  /** 1–500. */
  size?: number;
};

/** `GET /finance/expenses/summary` süzgeçleri. */
export type ExpenseSummaryParams = ExpenseScopeParams & { from?: string; to?: string };

/** `GET /finance/expenses/calendar`: ay 1–12. */
export type ExpenseCalendarParams = ExpenseScopeParams & { year: number; month: number };

/** `GET /finance/expenses/monthly`: son `months` ay (1–24, vars. 6). */
export type ExpenseMonthlyParams = ExpenseScopeParams & { months?: number };

/** Bağlam araması (`GENERAL` dışı türler). */
export type ExpenseContextSearchType = Exclude<ExpenseContextType, "GENERAL">;

/** Sayfa boyutunu 1–500'e kırpar (geçersiz → 50). */
export function expensePageSize(size: number | undefined): number {
  if (size === undefined || !Number.isFinite(size)) return EXPENSE_LIST_DEFAULT_SIZE;
  return clamp(size, 1, EXPENSE_LIST_MAX_SIZE);
}

/** Ay sayısını 1–24'e kırpar (geçersiz → 6). */
export function expenseMonthCount(months: number | undefined): number {
  if (months === undefined || !Number.isFinite(months)) return EXPENSE_MONTHLY_DEFAULT;
  return clamp(months, 1, EXPENSE_MONTHLY_MAX);
}

/** `GET|POST /finance/expense-items`. */
export function expenseItemsPath(): string {
  return "/finance/expense-items";
}

/** `PUT /finance/expense-items/{id}`. */
export function expenseItemPath(id: string): string {
  return `/finance/expense-items/${segment(id)}`;
}

/** `PUT /finance/expense-items/{id}/active` (ZTO "Sil"). */
export function expenseItemActivePath(id: string): string {
  return `${expenseItemPath(id)}/active`;
}

/** `GET /finance/expenses?…`: boş alan yazılmaz, `branchIds` tekrar eder, page/size her zaman. */
export function expenseListPath(params: ExpenseListParams, activeCompanyId: string | null = null) {
  return (
    "/finance/expenses" +
    buildQuery({
      expenseItemId: params.expenseItemId,
      currency: params.currency?.trim(),
      from: params.from,
      to: params.to,
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      branchIds: params.branchIds,
      page: Math.max(0, Math.trunc(params.page ?? 0)) || 0,
      size: expensePageSize(params.size),
    })
  );
}

/** `GET /finance/expenses/summary?…`. */
export function expenseSummaryPath(
  params: ExpenseSummaryParams = {},
  activeCompanyId: string | null = null,
) {
  return (
    "/finance/expenses/summary" +
    buildQuery({
      from: params.from,
      to: params.to,
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      branchIds: params.branchIds,
    })
  );
}

/** `GET /finance/expenses/calendar?year&month(1–12)…`. */
export function expenseCalendarDataPath(
  params: ExpenseCalendarParams,
  activeCompanyId: string | null = null,
) {
  return (
    "/finance/expenses/calendar" +
    buildQuery({
      year: Math.trunc(params.year),
      month: clamp(params.month, 1, 12),
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      branchIds: params.branchIds,
    })
  );
}

/** `GET /finance/expenses/monthly?months(1–24)…`. */
export function expenseMonthlyPath(
  params: ExpenseMonthlyParams = {},
  activeCompanyId: string | null = null,
) {
  return (
    "/finance/expenses/monthly" +
    buildQuery({
      months: expenseMonthCount(params.months),
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      branchIds: params.branchIds,
    })
  );
}

/** `GET /finance/expenses/context-options?type&q&branchId` (en çok 20). */
export function expenseContextOptionsPath(
  type: ExpenseContextSearchType,
  q: string,
  branchId?: string | null,
): string {
  return (
    "/finance/expenses/context-options" +
    buildQuery({ type, q: q.trim(), branchId: branchId || undefined })
  );
}

/** `GET /finance/expenses/{id}`. */
export function expenseDetailPath(id: string): string {
  return `/finance/expenses/${segment(id)}`;
}

/** `POST /finance/expenses/{id}/reverse`. */
export function expenseReversePath(id: string): string {
  return `${expenseDetailPath(id)}/reverse`;
}

/** `POST /finance/expenses/{id}/revise`. */
export function expenseRevisePath(id: string): string {
  return `${expenseDetailPath(id)}/revise`;
}

/** `GET|POST /files?ownerType=EXPENSE&ownerId=…` (belge; yükleme FINANCE_MANAGE). */
export function expenseFilesPath(expenseId: string): string {
  return `/files${buildQuery({ ownerType: EXPENSE_FILE_OWNER, ownerId: expenseId })}`;
}

// ---------------------------------------------------------------------------------------------
// Sorgu anahtarları
// ---------------------------------------------------------------------------------------------

const ROOT = ["finance", "expenses"] as const;

/** Masraf kalemi MUI ile aynı anahtar; diğerleri ["finance", "expenses", …] (çözülmüş companyId). */
export const expenseKeys = {
  items: ["finance", "expense-items"] as const,
  all: ROOT,
  list: (q: ExpenseListParams & { companyId: string | null }) => [...ROOT, "list", q] as const,
  summary: (q: ExpenseSummaryParams & { companyId: string | null }) =>
    [...ROOT, "summary", q] as const,
  calendar: (q: ExpenseCalendarParams & { companyId: string | null }) =>
    [...ROOT, "calendar", q] as const,
  monthly: (q: ExpenseMonthlyParams & { companyId: string | null }) =>
    [...ROOT, "monthly", q] as const,
  detail: (id: string) => [...ROOT, "detail", id] as const,
  contextOptions: (type: ExpenseContextSearchType, q: string, branchId: string | null) =>
    [...ROOT, "context-options", type, q, branchId] as const,
  files: (id: string) => [...ROOT, "files", id] as const,
};

// ---------------------------------------------------------------------------------------------
// Okuma kancaları
// ---------------------------------------------------------------------------------------------

type Enabled = { enabled?: boolean };

/** Masraf kalemleri (pasifler dahil). */
export function useExpenseItems(options: Enabled = {}) {
  return useQuery({
    queryKey: expenseKeys.items,
    queryFn: () => apiGet<ExpenseItem[]>(expenseItemsPath()),
    enabled: options.enabled ?? true,
  });
}

/** Masraf listesi (sunucu sayfalı); eski sonuç yenisi gelene dek görünür kalır. */
export function useExpenseList(params: ExpenseListParams, options: Enabled = {}) {
  const active = useActiveCompanyId();
  const resolved = { ...params, companyId: effectiveCompany(params.companyId, active) };
  return useQuery({
    queryKey: expenseKeys.list(resolved),
    queryFn: () => apiGet<Page<ExpenseListItem>>(expenseListPath(resolved)),
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

/** Kalem bazında özet (PEL). */
export function useExpenseSummary(params: ExpenseSummaryParams = {}, options: Enabled = {}) {
  const active = useActiveCompanyId();
  const resolved = { ...params, companyId: effectiveCompany(params.companyId, active) };
  return useQuery({
    queryKey: expenseKeys.summary(resolved),
    queryFn: () => apiGet<ExpenseItemSummary[]>(expenseSummaryPath(resolved)),
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

/** Aylık takvim (PEI). */
export function useExpenseCalendar(params: ExpenseCalendarParams, options: Enabled = {}) {
  const active = useActiveCompanyId();
  const resolved = { ...params, companyId: effectiveCompany(params.companyId, active) };
  return useQuery({
    queryKey: expenseKeys.calendar(resolved),
    queryFn: () => apiGet<ExpenseCalendar>(expenseCalendarDataPath(resolved)),
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

/** Son N ay, tür kırılımlı ₺ karşılığı (grafik). */
export function useExpenseMonthly(params: ExpenseMonthlyParams = {}, options: Enabled = {}) {
  const active = useActiveCompanyId();
  const resolved = { ...params, companyId: effectiveCompany(params.companyId, active) };
  return useQuery({
    queryKey: expenseKeys.monthly(resolved),
    queryFn: () => apiGet<ExpenseMonthly[]>(expenseMonthlyPath(resolved)),
    enabled: options.enabled ?? true,
  });
}

/** Tekil masraf (satırlarla). Kapsam dışı 403, yok 404. */
export function useExpense(id: string | null | undefined, options: Enabled = {}) {
  return useQuery({
    queryKey: expenseKeys.detail(id ?? ""),
    queryFn: () => apiGet<ExpenseDetail>(expenseDetailPath(String(id))),
    enabled: !!id && (options.enabled ?? true),
  });
}

/**
 * Bağlam seçeneği araması: `q` 300 ms sabit kaldıktan sonra ve en az 1 karakterken istenir;
 * `type` yoksa (GENERAL) istek yok.
 */
export function useExpenseContextOptions(
  type: ExpenseContextSearchType | null | undefined,
  q: string,
  branchId?: string | null,
  options: Enabled = {},
) {
  const term = useDebouncedValue(q.trim(), EXPENSE_CONTEXT_DEBOUNCE_MS);
  const branch = branchId || null;
  return useQuery({
    queryKey: expenseKeys.contextOptions(type ?? "VEHICLE", term, branch),
    queryFn: () =>
      apiGet<ExpenseContextOption[]>(
        expenseContextOptionsPath(type as ExpenseContextSearchType, term, branch),
      ),
    enabled: !!type && term.length >= EXPENSE_CONTEXT_MIN_QUERY && (options.enabled ?? true),
    placeholderData: keepPreviousData,
  });
}

/** Masrafın belgeleri (`/files?ownerType=EXPENSE`). */
export function useExpenseFiles(expenseId: string | null | undefined, options: Enabled = {}) {
  return useQuery({
    queryKey: expenseKeys.files(expenseId ?? ""),
    queryFn: () => apiGet<StoredFile[]>(expenseFilesPath(String(expenseId))),
    enabled: !!expenseId && (options.enabled ?? true),
  });
}

// ---------------------------------------------------------------------------------------------
// Yazma
// ---------------------------------------------------------------------------------------------

type MutationOptions<TData, TVariables> = Omit<
  UseMutationOptions<TData, Error, TVariables>,
  "mutationFn"
>;

function idempotency(key: string | undefined): Record<string, string> | undefined {
  return key ? { "Idempotency-Key": key } : undefined;
}

/** Yeni (id yok → POST) ya da düzenleme (PUT) masraf kalemi. */
export function saveExpenseItem(id: string | null | undefined, body: SaveExpenseItemRequest) {
  return id
    ? apiRequest<ExpenseItem>("PUT", expenseItemPath(id), body)
    : apiRequest<ExpenseItem>("POST", expenseItemsPath(), body);
}

export function setExpenseItemActive(id: string, active: boolean) {
  return apiRequest<ExpenseItem>("PUT", expenseItemActivePath(id), { active });
}

/** `POST /finance/expenses`; `idempotencyKey` form başına sabit (yeniden deneme aynı kaydı verir). */
export function createExpense(body: SaveExpenseRequest, idempotencyKey?: string) {
  return apiRequest<ExpenseDetail>("POST", "/finance/expenses", body, idempotency(idempotencyKey));
}

export function reverseExpense(id: string, body: ReverseExpenseRequest) {
  return apiRequest<ExpenseDetail>("POST", expenseReversePath(id), body);
}

/** Düzeltme: ters kayıt + yeni kayıt; yanıt YENİ kayıttır. */
export function reviseExpense(id: string, body: ReviseExpenseRequest, idempotencyKey?: string) {
  return apiRequest<ExpenseDetail>(
    "POST",
    expenseRevisePath(id),
    body,
    idempotency(idempotencyKey),
  );
}

/** Belge yükleme (`file` alanı; mevcut `/files` ucu). */
export function uploadExpenseDocument(expenseId: string, file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<StoredFile>(expenseFilesPath(expenseId), form);
}

export function useSaveExpenseItem(
  id?: string | null,
  options: MutationOptions<ExpenseItem, SaveExpenseItemRequest> = {},
) {
  return useFinanceMutation((body: SaveExpenseItemRequest) => saveExpenseItem(id, body), options);
}

export type SetExpenseItemActiveVariables = { id: string; active: boolean };

export function useSetExpenseItemActive(
  options: MutationOptions<ExpenseItem, SetExpenseItemActiveVariables> = {},
) {
  return useFinanceMutation(
    ({ id, active }: SetExpenseItemActiveVariables) => setExpenseItemActive(id, active),
    options,
  );
}

export type CreateExpenseVariables = { body: SaveExpenseRequest; idempotencyKey: string };

/** Anahtar formda `newIdempotencyKey()` ile bir kez üretilir (accountApi). */
export function useCreateExpense(
  options: MutationOptions<ExpenseDetail, CreateExpenseVariables> = {},
) {
  return useFinanceMutation(
    ({ body, idempotencyKey }: CreateExpenseVariables) => createExpense(body, idempotencyKey),
    options,
  );
}

export type ReverseExpenseVariables = { id: string; body: ReverseExpenseRequest };

export function useReverseExpense(
  options: MutationOptions<ExpenseDetail, ReverseExpenseVariables> = {},
) {
  return useFinanceMutation(
    ({ id, body }: ReverseExpenseVariables) => reverseExpense(id, body),
    options,
  );
}

export type ReviseExpenseVariables = {
  id: string;
  body: ReviseExpenseRequest;
  idempotencyKey: string;
};

export function useReviseExpense(
  options: MutationOptions<ExpenseDetail, ReviseExpenseVariables> = {},
) {
  return useFinanceMutation(
    ({ id, body, idempotencyKey }: ReviseExpenseVariables) =>
      reviseExpense(id, body, idempotencyKey),
    options,
  );
}

export type UploadExpenseDocumentVariables = { expenseId: string; file: File };

export function useUploadExpenseDocument(
  options: MutationOptions<StoredFile, UploadExpenseDocumentVariables> = {},
) {
  return useFinanceMutation(
    ({ expenseId, file }: UploadExpenseDocumentVariables) => uploadExpenseDocument(expenseId, file),
    options,
  );
}
