import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { useState } from "react";
import { apiGet, apiRequest } from "../../api/client";
import { useActiveCompanyId } from "../../auth/companyStore";
import type {
  Account,
  AccountBalanceBreakdown,
  AccountBankAccount,
  AccountDocument,
  AccountDocumentBody,
  AccountDocumentType,
  AccountGroup,
  AccountHistory,
  AccountInvoiceRow,
  AccountProfileBody,
  AccountRollover,
  AccountTransactionDetail,
  AccountTransactionFacets,
  AccountTransactionPage,
  AccountTransactionRow,
  AccountTransfer,
  AccountTransferBody,
  AccountTransferHistoryRow,
  AccountType,
  BalanceGroupBy,
  CancelDocumentBody,
  InvoiceDirection,
  LimitBody,
  Page,
  RolloverBody,
  SaveAccountBody,
  SaveBankAccountBody,
  Statement,
  StatementDateBasis,
  TransactionKind,
  TransactionSource,
  TransferableTransaction,
  VoidBody,
} from "./types";

/*
 * 12.1 cari uçlarının istemcisi (§5.3). Sorgu anahtarları ["finance", …] önekli: MUI mutasyonları
 * ["finance"]'ı geçersizlediği için iki ekran seti eşzamanlı kalır. Şirkete duyarlı sorgular aktif
 * şirketi (`useActiveCompanyId`) anahtara ve `companyId` parametresine koyar; parametrede açıkça
 * `companyId: null` verilirse süzgeç konmaz (konsolide), `undefined` aktif şirketi kullanır.
 */

// ---------------------------------------------------------------------------------------------
// Sorgu dizgesi
// ---------------------------------------------------------------------------------------------

export type QueryValue =
  string | number | boolean | null | undefined | ReadonlyArray<string | number>;

/**
 * `?a=1&b=x&b=y`: dizi değerleri tekrar eden anahtarla (`types=A&types=B`), boş/undefined/null
 * değerler ve boş diziler atlanır. Sıra parametre sırasıdır. Hiç değer yoksa "".
 */
export function buildQuery(params: Record<string, QueryValue>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    const values = Array.isArray(value) ? value : [value];
    for (const item of values as ReadonlyArray<QueryValue>) {
      if (item === undefined || item === null || item === "") continue;
      parts.push(`${key}=${encodeURIComponent(String(item))}`);
    }
  }
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

/** Parametredeki şirket: undefined → aktif şirket; null → süzgeçsiz (konsolide). */
export function effectiveCompany(
  explicit: string | null | undefined,
  active: string | null,
): string | null {
  return explicit === undefined ? active : explicit;
}

export type AccountListParams = {
  search?: string;
  types?: AccountType[];
  subGroups?: string[];
  /** Yoksa aktif ve pasif hepsi (MUI geriye uyum). */
  active?: boolean;
  /** Yalnız bakiye süzgeci. */
  branchIds?: string[];
  balanceGroupBy?: BalanceGroupBy;
  includePlanSummary?: boolean;
  sort?: string;
  companyId?: string | null;
};

/** `GET /finance/accounts` yolu (sayfa ve boyutla). */
export function accountListQuery(
  params: AccountListParams,
  page = 0,
  size = ACCOUNT_PAGE_SIZE,
  activeCompanyId: string | null = null,
): string {
  return (
    "/finance/accounts" +
    buildQuery({
      search: params.search?.trim(),
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      types: params.types,
      subGroups: params.subGroups,
      active: params.active,
      branchIds: params.branchIds,
      balanceGroupBy: params.balanceGroupBy,
      includePlanSummary: params.includePlanSummary,
      sort: params.sort,
      page,
      size,
    })
  );
}

export type TransactionParams = {
  /** Cari Hareketler'de zorunlu; çapraz listede yok. */
  accountId?: string;
  from?: string;
  to?: string;
  currency?: string;
  branchIds?: string[];
  accountTypes?: AccountType[];
  subGroups?: string[];
  kinds?: TransactionKind[];
  facets?: boolean;
  companyId?: string | null;
};

/** `GET /finance/account-transactions` yolu. */
export function transactionsQuery(
  params: TransactionParams,
  page = 0,
  size = TRANSACTION_PAGE_SIZE,
  activeCompanyId: string | null = null,
): string {
  return (
    "/finance/account-transactions" +
    buildQuery({
      accountId: params.accountId,
      from: params.from,
      to: params.to,
      currency: params.currency,
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      branchIds: params.branchIds,
      accountTypes: params.accountTypes,
      subGroups: params.subGroups,
      kinds: params.kinds,
      facets: params.facets,
      page,
      size,
    })
  );
}

export type StatementParams = {
  /** Yoksa tüm para birimleri (ZTO ekstresi); MUI her zaman verir. */
  currency?: string;
  from?: string;
  to?: string;
  branchIds?: string[];
  dateBasis?: StatementDateBasis;
  companyId?: string | null;
};

/** `GET /finance/accounts/{id}/statement` yolu. */
export function statementQuery(
  accountId: string,
  params: StatementParams,
  page = 0,
  size = STATEMENT_PAGE_SIZE,
  activeCompanyId: string | null = null,
): string {
  return (
    `/finance/accounts/${encodeURIComponent(accountId)}/statement` +
    buildQuery({
      currency: params.currency,
      from: params.from,
      to: params.to,
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      branchIds: params.branchIds,
      dateBasis: params.dateBasis,
      page,
      size,
    })
  );
}

export type BalanceParams = {
  groupBy?: BalanceGroupBy;
  branchIds?: string[];
  asOf?: string;
  rolloverId?: string;
  companyId?: string | null;
};

export function balancesQuery(
  accountId: string,
  params: BalanceParams,
  activeCompanyId: string | null = null,
): string {
  return (
    `/finance/accounts/${encodeURIComponent(accountId)}/balances` +
    buildQuery({
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      branchIds: params.branchIds,
      groupBy: params.groupBy,
      asOf: params.asOf,
      rolloverId: params.rolloverId,
    })
  );
}

export type InvoiceParams = {
  direction: InvoiceDirection;
  documentType?: string;
  reflected?: boolean;
  from?: string;
  to?: string;
  companyId?: string | null;
};

export function invoicesQuery(
  accountId: string,
  params: InvoiceParams,
  activeCompanyId: string | null = null,
): string {
  return (
    `/finance/accounts/${encodeURIComponent(accountId)}/invoices` +
    buildQuery({
      direction: params.direction,
      documentType: params.documentType,
      reflected: params.reflected,
      from: params.from,
      to: params.to,
      companyId: effectiveCompany(params.companyId, activeCompanyId),
    })
  );
}

export type AccountSearchOptions = {
  types?: AccountType[];
  subGroups?: string[];
  size?: number;
};

/** Cari arama (ZtoAccountSearch): yalnız aktif kartlar, en çok 20 sonuç. */
export function accountSearchQuery(term: string, options: AccountSearchOptions = {}): string {
  return (
    "/finance/accounts" +
    buildQuery({
      search: term.trim(),
      types: options.types,
      subGroups: options.subGroups,
      active: true,
      size: options.size ?? 20,
    })
  );
}

export type TransferHistoryParams = {
  accountId?: string;
  from?: string;
  to?: string;
  page?: number;
  size?: number;
};

// ---------------------------------------------------------------------------------------------
// Sayfaları birleştirme
// ---------------------------------------------------------------------------------------------

export const ACCOUNT_PAGE_SIZE = 2000;
export const TRANSACTION_PAGE_SIZE = 500;
export const STATEMENT_PAGE_SIZE = 2000;
/** Günlük Tüm Cari İşlemleri istemci modunun üst sınırı (S-22, OK-29/OK-39). */
export const ALL_TRANSACTIONS_LIMIT = 10_000;

type PageLike<T> = { content?: T[]; lines?: T[]; totalPages: number; totalElements: number };

/**
 * Tüm sayfaları sırayla çeker (sunucuyu paralel isteklerle yormaz): ilk sayfa `totalPages`'i verir.
 * `limit` aşılırsa ilk sayfadan sonra durur ve `tooLarge` döner (satırlar boş).
 */
export async function fetchAllPages<T, P extends PageLike<T>>(
  fetchPage: (page: number) => Promise<P>,
  options: { limit?: number; rowsOf?: (page: P) => T[] } = {},
): Promise<{ rows: T[]; first: P; total: number; tooLarge: boolean }> {
  const rowsOf = options.rowsOf ?? ((page: P) => page.content ?? page.lines ?? []);
  const first = await fetchPage(0);
  const total = first.totalElements;
  if (options.limit !== undefined && total > options.limit) {
    return { rows: [], first, total, tooLarge: true };
  }
  const rows = [...rowsOf(first)];
  for (let page = 1; page < first.totalPages; page++) {
    const next = await fetchPage(page);
    rows.push(...rowsOf(next));
  }
  return { rows, first, total, tooLarge: false };
}

export type AllTransactionsResult = {
  rows: AccountTransactionRow[];
  total: number;
  tooLarge: boolean;
  /** İlk sayfanın yanıtından (yalnız `facets: true` istendiyse). */
  facets: AccountTransactionFacets | null;
};

/**
 * Günlük Tüm Cari İşlemleri verisi: seçili aralığın tüm sayfaları (`size=500`); toplam 10.000'i
 * aşarsa sayfalar çekilmez (`tooLarge`). Facet'ler yalnız ilk istekte istenir.
 */
export async function fetchAllTransactions(
  get: (path: string) => Promise<AccountTransactionPage>,
  params: TransactionParams,
  activeCompanyId: string | null,
  limit = ALL_TRANSACTIONS_LIMIT,
): Promise<AllTransactionsResult> {
  const result = await fetchAllPages<AccountTransactionRow, AccountTransactionPage>(
    (page) =>
      get(
        transactionsQuery(
          { ...params, facets: page === 0 ? params.facets : undefined },
          page,
          TRANSACTION_PAGE_SIZE,
          activeCompanyId,
        ),
      ),
    { limit },
  );
  return {
    rows: result.rows,
    total: result.total,
    tooLarge: result.tooLarge,
    facets: result.first.facets ?? null,
  };
}

/** Ekstrenin tüm sayfaları tek yanıtta: açılış ve sayfa bilgisi ilk sayfadan, satırlar birleşik. */
export async function fetchFullStatement(
  get: (path: string) => Promise<Statement>,
  accountId: string,
  params: StatementParams,
  activeCompanyId: string | null,
): Promise<Statement> {
  const result = await fetchAllPages<Statement["lines"][number], Statement>(
    (page) => get(statementQuery(accountId, params, page, STATEMENT_PAGE_SIZE, activeCompanyId)),
    { rowsOf: (page) => page.lines },
  );
  return {
    ...result.first,
    lines: result.rows,
    page: 0,
    size: result.rows.length,
    totalPages: result.rows.length > 0 ? 1 : 0,
  };
}

// ---------------------------------------------------------------------------------------------
// Sorgu anahtarları
// ---------------------------------------------------------------------------------------------

export const financeKeys = {
  all: ["finance"] as const,
  accountGroups: () => ["finance", "account-groups"] as const,
  accountList: (params: AccountListParams, companyId: string | null) =>
    ["finance", "accounts", "list", params, companyId] as const,
  account: (id: string, companyId: string | null, branchIds?: string[]) =>
    ["finance", "account", id, companyId, branchIds ?? null] as const,
  accountSearch: (term: string, options: AccountSearchOptions) =>
    [
      "finance",
      "accounts",
      "search",
      term,
      options.types ?? null,
      options.subGroups ?? null,
    ] as const,
  balances: (id: string, params: BalanceParams, companyId: string | null) =>
    ["finance", "account-balances", id, params, companyId] as const,
  transactions: (params: TransactionParams, companyId: string | null) =>
    ["finance", "account-transactions", params, companyId] as const,
  allTransactions: (params: TransactionParams, companyId: string | null) =>
    ["finance", "account-transactions", "all", params, companyId] as const,
  statement: (id: string, params: StatementParams, companyId: string | null) =>
    ["finance", "account-statement", id, params, companyId] as const,
  invoices: (id: string, params: InvoiceParams, companyId: string | null) =>
    ["finance", "account-invoices", id, params, companyId] as const,
  documentTypes: () => ["finance", "document-types"] as const,
  document: (id: string) => ["finance", "account-document", id] as const,
  transaction: (id: string) => ["finance", "account-transaction", id] as const,
  transactionSource: (id: string) => ["finance", "account-transaction", id, "source"] as const,
  rollovers: (accountId: string, deleted: boolean) =>
    ["finance", "rollovers", accountId, deleted] as const,
  transferable: (accountId: string, companyId: string | null) =>
    ["finance", "transferable", accountId, companyId] as const,
  transferHistory: (params: TransferHistoryParams) =>
    ["finance", "account-transfers", params] as const,
  bankAccounts: (accountId: string, includeInactive: boolean) =>
    ["finance", "bank-accounts", accountId, includeInactive] as const,
  bankAccount: (id: string) => ["finance", "bank-accounts", "detail", id] as const,
  history: (id: string) => ["finance", "account-history", id] as const,
};

// ---------------------------------------------------------------------------------------------
// Okuma kancaları
// ---------------------------------------------------------------------------------------------

const FIVE_MINUTES = 5 * 60 * 1000;

export function useAccountGroups() {
  return useQuery({
    queryKey: financeKeys.accountGroups(),
    queryFn: () => apiGet<AccountGroup[]>("/finance/account-groups"),
    staleTime: FIVE_MINUTES,
  });
}

/** Cari listesi: tüm sayfalar (`size=2000`) birleştirilir. */
export function useAccountList(params: AccountListParams, options: { enabled?: boolean } = {}) {
  const companyId = useActiveCompanyId();
  return useQuery({
    queryKey: financeKeys.accountList(params, companyId),
    queryFn: async () =>
      (
        await fetchAllPages<Account, Page<Account>>((page) =>
          apiGet<Page<Account>>(accountListQuery(params, page, ACCOUNT_PAGE_SIZE, companyId)),
        )
      ).rows,
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

export function useAccount(id: string | undefined, params: { branchIds?: string[] } = {}) {
  const companyId = useActiveCompanyId();
  return useQuery({
    queryKey: financeKeys.account(id ?? "", companyId, params.branchIds),
    queryFn: () =>
      apiGet<Account>(
        `/finance/accounts/${encodeURIComponent(id ?? "")}` +
          buildQuery({ companyId, branchIds: params.branchIds }),
      ),
    enabled: !!id,
  });
}

/** Cari arama (gecikme ZtoAccountSearch'te); boş terimde istek yok. */
export function useAccountSearch(
  term: string,
  options: AccountSearchOptions & { enabled?: boolean } = {},
) {
  const trimmed = term.trim();
  return useQuery({
    queryKey: financeKeys.accountSearch(trimmed, options),
    queryFn: async () =>
      (await apiGet<Page<Account>>(accountSearchQuery(trimmed, options))).content,
    enabled: (options.enabled ?? true) && trimmed !== "",
    staleTime: 30_000,
  });
}

export function useAccountBalances(id: string | undefined, params: BalanceParams = {}) {
  const companyId = useActiveCompanyId();
  return useQuery({
    queryKey: financeKeys.balances(id ?? "", params, companyId),
    queryFn: () => apiGet<AccountBalanceBreakdown>(balancesQuery(id ?? "", params, companyId)),
    enabled: !!id,
  });
}

/**
 * Cari Hareketler (Transactions): tek carinin hareketleri; tarih aralığı isteğe bağlı ve sınırsız
 * (OK-29). Tüm sayfalar `size=500` ile sırayla çekilir.
 */
export function useAccountTransactions(params: TransactionParams & { accountId: string }) {
  const companyId = useActiveCompanyId();
  return useQuery({
    queryKey: financeKeys.transactions(params, companyId),
    queryFn: async () =>
      (
        await fetchAllPages<AccountTransactionRow, AccountTransactionPage>((page) =>
          apiGet<AccountTransactionPage>(
            transactionsQuery(params, page, TRANSACTION_PAGE_SIZE, companyId),
          ),
        )
      ).rows,
    enabled: params.accountId !== "",
    placeholderData: keepPreviousData,
  });
}

/**
 * Günlük Tüm Cari İşlemleri: çapraz liste (`from/to` zorunlu, ≤ 366 gün); toplam 10.000'i aşarsa
 * `{ tooLarge: true, total }` (S-22). Eski veri yeni sorgu gelene dek görünür kalır (INP).
 */
export function useAllAccountTransactions(
  params: TransactionParams & { from: string; to: string },
) {
  const companyId = useActiveCompanyId();
  return useQuery({
    queryKey: financeKeys.allTransactions(params, companyId),
    queryFn: () =>
      fetchAllTransactions((path) => apiGet<AccountTransactionPage>(path), params, companyId),
    enabled: params.from !== "" && params.to !== "",
    placeholderData: keepPreviousData,
  });
}

/** Ekstre: tüm sayfalar (`size=2000`) tek `Statement`'ta. */
export function useAccountStatement(id: string | undefined, params: StatementParams) {
  const companyId = useActiveCompanyId();
  return useQuery({
    queryKey: financeKeys.statement(id ?? "", params, companyId),
    queryFn: () =>
      fetchFullStatement((path) => apiGet<Statement>(path), id ?? "", params, companyId),
    enabled: !!id,
  });
}

export function useAccountInvoices(id: string | undefined, params: InvoiceParams) {
  const companyId = useActiveCompanyId();
  return useQuery({
    queryKey: financeKeys.invoices(id ?? "", params, companyId),
    queryFn: () => apiGet<AccountInvoiceRow[]>(invoicesQuery(id ?? "", params, companyId)),
    enabled: !!id,
  });
}

/** Belge türleri (iki yön birlikte; `side` süzmesi ekranda). */
export function useDocumentTypes() {
  return useQuery({
    queryKey: financeKeys.documentTypes(),
    queryFn: () => apiGet<AccountDocumentType[]>("/finance/account-document-types"),
    staleTime: FIVE_MINUTES,
  });
}

export function useAccountDocument(id: string | undefined) {
  return useQuery({
    queryKey: financeKeys.document(id ?? ""),
    queryFn: () =>
      apiGet<AccountDocument>(`/finance/account-documents/${encodeURIComponent(id ?? "")}`),
    enabled: !!id,
  });
}

export function useTransactionDetail(id: string | undefined) {
  return useQuery({
    queryKey: financeKeys.transaction(id ?? ""),
    queryFn: () =>
      apiGet<AccountTransactionDetail>(
        `/finance/accounts/transactions/${encodeURIComponent(id ?? "")}`,
      ),
    enabled: !!id,
  });
}

export function useTransactionSource(id: string | undefined) {
  return useQuery({
    queryKey: financeKeys.transactionSource(id ?? ""),
    queryFn: () =>
      apiGet<TransactionSource>(
        `/finance/accounts/transactions/${encodeURIComponent(id ?? "")}/source`,
      ),
    enabled: !!id,
  });
}

export function useRollovers(accountId: string | undefined, deleted = false) {
  return useQuery({
    queryKey: financeKeys.rollovers(accountId ?? "", deleted),
    queryFn: () =>
      apiGet<AccountRollover[]>(
        `/finance/accounts/${encodeURIComponent(accountId ?? "")}/rollovers` +
          buildQuery({ deleted }),
      ),
    enabled: !!accountId,
  });
}

export function useTransferable(
  accountId: string | undefined,
  options: { enabled?: boolean } = {},
) {
  const companyId = useActiveCompanyId();
  return useQuery({
    queryKey: financeKeys.transferable(accountId ?? "", companyId),
    queryFn: () =>
      apiGet<TransferableTransaction[]>(
        `/finance/accounts/${encodeURIComponent(accountId ?? "")}/transferable-transactions` +
          buildQuery({ companyId }),
      ),
    enabled: !!accountId && (options.enabled ?? true),
  });
}

export function useTransferHistory(
  params: TransferHistoryParams,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: financeKeys.transferHistory(params),
    queryFn: () =>
      apiGet<Page<AccountTransferHistoryRow>>(
        "/finance/account-transfers" +
          buildQuery({
            accountId: params.accountId,
            from: params.from,
            to: params.to,
            page: params.page ?? 0,
            size: params.size ?? 500,
          }),
      ),
    enabled: options.enabled ?? true,
  });
}

export function useBankAccounts(accountId: string | undefined, includeInactive = false) {
  return useQuery({
    queryKey: financeKeys.bankAccounts(accountId ?? "", includeInactive),
    queryFn: () =>
      apiGet<AccountBankAccount[]>(
        `/finance/accounts/${encodeURIComponent(accountId ?? "")}/bank-accounts` +
          buildQuery({ includeInactive }),
      ),
    enabled: !!accountId,
  });
}

export function useBankAccount(id: string | undefined) {
  return useQuery({
    queryKey: financeKeys.bankAccount(id ?? ""),
    queryFn: () =>
      apiGet<AccountBankAccount>(`/finance/bank-accounts/${encodeURIComponent(id ?? "")}`),
    enabled: !!id,
  });
}

/** Kart değişiklik geçmişi (en yeni önce; ilk 200 kayıt). */
export function useAccountHistory(id: string | undefined, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: financeKeys.history(id ?? ""),
    queryFn: async () =>
      (
        await apiGet<Page<AccountHistory>>(
          `/finance/accounts/${encodeURIComponent(id ?? "")}/history?page=0&size=200`,
        )
      ).content,
    enabled: !!id && (options.enabled ?? true),
  });
}

// ---------------------------------------------------------------------------------------------
// Yazma
// ---------------------------------------------------------------------------------------------

/** Rastgele Idempotency-Key (UUID v4); `randomUUID` yoksa (güvensiz bağlam) getRandomValues. */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") {
    return c.randomUUID();
  }
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Modal başına sabit Idempotency-Key: modal her açılışında (`open` false → true) yeni anahtar üretir,
 * açık kaldıkça aynı anahtarı döndürür (aynı modalda yeniden deneme aynı belgeyi verir, §5.3).
 */
export function useIdempotencyKey(open: boolean): string {
  const [state, setState] = useState(() => ({ open, key: newIdempotencyKey() }));
  if (state.open !== open) {
    const next = { open, key: open ? newIdempotencyKey() : state.key };
    setState(next);
    return next.key;
  }
  return state.key;
}

function idempotency(key: string | undefined): Record<string, string> | undefined {
  return key ? { "Idempotency-Key": key } : undefined;
}

const path = encodeURIComponent;

export function createAccount(body: SaveAccountBody) {
  return apiRequest<Account>("POST", "/finance/accounts", body);
}

export function updateProfile(id: string, body: AccountProfileBody) {
  return apiRequest<Account>("PUT", `/finance/accounts/${path(id)}/profile`, body);
}

export function setAccountActive(id: string, active: boolean) {
  return apiRequest<Account>("PATCH", `/finance/accounts/${path(id)}/active`, { active });
}

export function setLimits(id: string, body: LimitBody) {
  return apiRequest<Account>("PUT", `/finance/accounts/${path(id)}/limits`, body);
}

export function createBankAccount(accountId: string, body: SaveBankAccountBody) {
  return apiRequest<AccountBankAccount>(
    "POST",
    `/finance/accounts/${path(accountId)}/bank-accounts`,
    body,
  );
}

export function updateBankAccount(id: string, body: SaveBankAccountBody) {
  return apiRequest<AccountBankAccount>("PUT", `/finance/bank-accounts/${path(id)}`, body);
}

export function setBankAccountActive(id: string, active: boolean) {
  return apiRequest<AccountBankAccount>("PATCH", `/finance/bank-accounts/${path(id)}/active`, {
    active,
  });
}

export function createDocument(accountId: string, body: AccountDocumentBody, key?: string) {
  return apiRequest<AccountDocument>(
    "POST",
    `/finance/accounts/${path(accountId)}/documents`,
    body,
    idempotency(key),
  );
}

export function cancelDocument(id: string, body: CancelDocumentBody = {}) {
  return apiRequest<AccountDocument>("POST", `/finance/account-documents/${path(id)}/cancel`, body);
}

export function reviseDocument(id: string, body: AccountDocumentBody, key?: string) {
  return apiRequest<AccountDocument>(
    "POST",
    `/finance/account-documents/${path(id)}/revise`,
    body,
    idempotency(key),
  );
}

export function voidTransaction(id: string, body: VoidBody = {}) {
  return apiRequest<unknown>("POST", `/finance/accounts/transactions/${path(id)}/void`, body);
}

export function createRollover(accountId: string, body: RolloverBody) {
  return apiRequest<AccountRollover>(
    "POST",
    `/finance/accounts/${path(accountId)}/rollovers`,
    body,
  );
}

export function updateRollover(id: string, body: RolloverBody) {
  return apiRequest<AccountRollover>("PUT", `/finance/rollovers/${path(id)}`, body);
}

export function activateRollover(id: string) {
  return apiRequest<AccountRollover>("POST", `/finance/rollovers/${path(id)}/activate`);
}

/** Aktif sezon silinirken `newActiveId` gerekir (409 ROLLOVER_NEW_ACTIVE_REQUIRED). */
export function deleteRollover(id: string, newActiveId?: string) {
  return apiRequest<void>("DELETE", `/finance/rollovers/${path(id)}` + buildQuery({ newActiveId }));
}

export function restoreRollover(id: string) {
  return apiRequest<AccountRollover>("POST", `/finance/rollovers/${path(id)}/restore`);
}

export function createTransfer(body: AccountTransferBody, key?: string) {
  return apiRequest<AccountTransfer>("POST", "/finance/account-transfers", body, idempotency(key));
}

export function reverseTransfer(id: string, body: VoidBody = {}) {
  return apiRequest<AccountTransfer>(
    "POST",
    `/finance/account-transfers/${path(id)}/reverse`,
    body,
  );
}

/**
 * Finans mutasyonu: başarıda tüm ["finance"] sorguları geçersizlenir (MUI ve ZTO ekranları birlikte
 * tazelenir), ardından çağıranın `onSuccess`'i çalışır.
 */
export function useFinanceMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: Omit<UseMutationOptions<TData, Error, TVariables>, "mutationFn"> = {},
) {
  const client = useQueryClient();
  return useMutation<TData, Error, TVariables>({
    ...options,
    mutationFn,
    onSuccess: async (data, variables, context, ...rest) => {
      await client.invalidateQueries({ queryKey: financeKeys.all });
      await options.onSuccess?.(data, variables, context, ...rest);
    },
  });
}
