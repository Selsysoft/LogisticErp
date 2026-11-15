import { keepPreviousData, useQuery, type UseMutationOptions } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiRequest } from "../../api/client";
import { useActiveCompanyId } from "../../auth/companyStore";
import { buildQuery, effectiveCompany, newIdempotencyKey, useFinanceMutation } from "./accountApi";
import type {
  AccountInvoiceGap,
  DocumentSide,
  Fund,
  FundAccountType,
  FundActivityReport,
  FundBody,
  FundCanDelete,
  FundDetail,
  FundDirection,
  FundKind,
  FundSparkline,
  FundSummaryRow,
  FundTransactionDetail,
  FundTransactionPage,
  FundTransactionRow,
  FundTransfer,
  FundTransferBody,
  FxCandidateAccount,
  FxCandidateCollection,
  FxReport,
  FxSource,
  IntercompanyTransfer,
  IntercompanyTransferBody,
  Page,
  ReplaceTransferBody,
  ReverseTransferBody,
  SettlementBody,
  SettlementCheck,
  SettlementType,
  Statement,
  TransferDependent,
  TransferListRow,
  TransferListType,
  TransferStatus,
  TransferSummaryRow,
  UpdateFundBody,
} from "./types";

/*
 * 12.2 banka / kasa / transfer merkezi istemcisi (12.2_TASARIM §4, §5.2). Sorgu anahtarları
 * ["finance", "fund-center", …] önekli: mevcut MUI anahtarları ["finance", "funds", companyId] ve
 * ["finance", "funds", "company", id] ile konumsal çakışma yok; mutasyonlar ["finance"]'ı geçersizler
 * (`useFinanceMutation`), MUI ve ZTO ekranları birlikte tazelenir. Şirkete duyarlı sorgularda
 * `companyId` parametresi accountApi kuralındadır: undefined → aktif şirket, null → konsolide.
 */

// ---------------------------------------------------------------------------------------------
// Sınırlar (sunucu doğrulamasıyla aynı)
// ---------------------------------------------------------------------------------------------

/** `GET /funds/sparklines` ve `/funds/transactions?fundId=` en çok 200 kimlik (400 TOO_MANY_IDS). */
export const FUND_IDS_MAX = 200;
/** `GET /funds/transactions` sayfa boyutu 1–500 (OK-12.2-34); varsayılan 50. */
export const FUND_TRANSACTIONS_MAX_SIZE = 500;
export const FUND_TRANSACTIONS_DEFAULT_SIZE = 50;
/** Tarih aralıksız tek fon sorgusunda en çok 50 satır. */
export const FUND_TRANSACTIONS_UNBOUNDED_MAX_SIZE = 50;
/** `GET /funds/transfers` ve `/intercompany-transfers` sayfa boyutu ≤ 200; transfer varsayılanı 25. */
export const TRANSFERS_MAX_SIZE = 200;
export const TRANSFERS_DEFAULT_SIZE = 25;
/** Mevcut `GET /funds/{id}/statement` (`Pageable`) en çok 200. */
export const FUND_STATEMENT_MAX_SIZE = 200;
/** Ödeme/tahsilat uyarı önizlemesinin gecikmesi (§5.13). */
export const SETTLEMENT_CHECK_DELAY_MS = 400;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

const path = encodeURIComponent;

// ---------------------------------------------------------------------------------------------
// Sorgu yolları (saf)
// ---------------------------------------------------------------------------------------------

export type FundListParams = {
  companyId?: string | null;
  branchIds?: string[];
  kind?: FundKind;
  accountType?: FundAccountType;
  /** Yoksa aktif ve pasif hepsi. */
  active?: boolean;
  currency?: string;
  /** Bakiye tarihi (varsayılan bugün; yerel takvim `toIsoDate`). */
  asOf?: string;
};

/** `GET /finance/funds`. */
export function fundListQuery(params: FundListParams, activeCompanyId: string | null = null) {
  return (
    "/finance/funds" +
    buildQuery({
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      branchId: params.branchIds,
      kind: params.kind,
      accountType: params.accountType,
      active: params.active,
      currency: params.currency,
      asOf: params.asOf,
    })
  );
}

export type FundSummaryParams = {
  companyId?: string | null;
  kind?: FundKind;
  asOf?: string;
};

/** `GET /finance/funds/summary`. */
export function fundSummaryQuery(params: FundSummaryParams, activeCompanyId: string | null = null) {
  return (
    "/finance/funds/summary" +
    buildQuery({
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      kind: params.kind,
      asOf: params.asOf,
    })
  );
}

/** Kimlikleri tekilleştirip sıralar (anahtar kararlılığı) ve 200'lük parçalara böler. */
export function chunkIds(ids: readonly string[], size = FUND_IDS_MAX): string[][] {
  const unique = [...new Set(ids.filter((id) => id !== ""))].sort();
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += size) {
    chunks.push(unique.slice(i, i + size));
  }
  return chunks;
}

/** `GET /finance/funds/sparklines?ids=…` (tek parça, ≤ 200). */
export function fundSparklinesQuery(ids: readonly string[]) {
  return "/finance/funds/sparklines" + buildQuery({ ids: [...ids] });
}

/** `GET /finance/funds/{id}?asOf=`. */
export function fundDetailQuery(id: string, asOf?: string) {
  return `/finance/funds/${path(id)}` + buildQuery({ asOf });
}

export type FundTransactionParams = {
  companyId?: string | null;
  kind?: FundKind;
  fundIds?: string[];
  branchIds?: string[];
  accountType?: FundAccountType;
  direction?: FundDirection;
  /** ZTO "MUHASEBE TİPİ" değerleri (§3.2.6). */
  accountingTypes?: string[];
  currency?: string;
  /** Zorunlu; yalnız tek fon seçiliyken boş olabilir (o zaman en çok 50 satır). */
  from?: string;
  to?: string;
  q?: string;
  /** true: para birimi toplamları ve tek fonda dönem açılış/kapanış (`summary`). */
  summary?: boolean;
  /** `transactionDate` yönü; varsayılan sunucuda desc. */
  sort?: "asc" | "desc";
};

/** Sunucu kuralı: `to` zorunlu; `from` yalnız tek fonda boş olabilir. */
export function fundTransactionsReady(params: FundTransactionParams): boolean {
  if (!params.to) return false;
  return !!params.from || (params.fundIds?.length ?? 0) === 1;
}

/** Sayfa boyutu 1–500; tarih aralıksız (tek fon) sorguda en çok 50. */
export function fundTransactionsPageSize(params: FundTransactionParams, size: number): number {
  const max = params.from ? FUND_TRANSACTIONS_MAX_SIZE : FUND_TRANSACTIONS_UNBOUNDED_MAX_SIZE;
  return clamp(Number.isFinite(size) ? size : FUND_TRANSACTIONS_DEFAULT_SIZE, 1, max);
}

function fundTransactionFilter(params: FundTransactionParams, activeCompanyId: string | null) {
  return {
    companyId: effectiveCompany(params.companyId, activeCompanyId),
    kind: params.kind,
    fundId: params.fundIds,
    branchId: params.branchIds,
    accountType: params.accountType,
    direction: params.direction,
    accountingType: params.accountingTypes,
    currency: params.currency,
    from: params.from,
    to: params.to,
    q: params.q?.trim().slice(0, 100),
  };
}

/** `GET /finance/funds/transactions` (açık page/size, OK-12.2-34). */
export function fundTransactionsQuery(
  params: FundTransactionParams,
  page = 0,
  size = FUND_TRANSACTIONS_DEFAULT_SIZE,
  activeCompanyId: string | null = null,
) {
  return (
    "/finance/funds/transactions" +
    buildQuery({
      ...fundTransactionFilter(params, activeCompanyId),
      summary: params.summary,
      page: Math.max(0, Math.trunc(page)),
      size: fundTransactionsPageSize(params, size),
      sort: params.sort ? `transactionDate,${params.sort}` : undefined,
    })
  );
}

/** `GET /finance/funds/transactions/export` (aynı süzgeç, sayfasız; ≤ 10.000 satır). */
export function fundTransactionsExportQuery(
  params: FundTransactionParams,
  activeCompanyId: string | null = null,
) {
  return (
    "/finance/funds/transactions/export" +
    buildQuery({
      ...fundTransactionFilter(params, activeCompanyId),
      sort: params.sort ? `transactionDate,${params.sort}` : undefined,
    })
  );
}

export type DateRange = { from: string; to: string };

/** `GET /finance/funds/{id}/activity-report?from&to` (FIFO faaliyet raporu). */
export function fundActivityQuery(id: string, range: DateRange) {
  return `/finance/funds/${path(id)}/activity-report` + buildQuery(range);
}

export type FundStatementParams = { from?: string; to?: string };

/** Mevcut `GET /finance/funds/{id}/statement` (değişmez; en çok 200 satır/sayfa). */
export function fundStatementQuery(
  id: string,
  params: FundStatementParams,
  page = 0,
  size = FUND_STATEMENT_MAX_SIZE,
) {
  return (
    `/finance/funds/${path(id)}/statement` +
    buildQuery({
      from: params.from,
      to: params.to,
      page: Math.max(0, Math.trunc(page)),
      size: clamp(size, 1, FUND_STATEMENT_MAX_SIZE),
    })
  );
}

export type TransferListParams = {
  companyId?: string | null;
  branchIds?: string[];
  transferType?: TransferListType;
  status?: TransferStatus;
  /** Zorunlu; aralık ≤ 366 gün. */
  from: string;
  to: string;
  q?: string;
};

function transferFilter(params: TransferListParams, activeCompanyId: string | null) {
  return {
    companyId: effectiveCompany(params.companyId, activeCompanyId),
    branchId: params.branchIds,
    transferType: params.transferType,
    status: params.status,
    from: params.from,
    to: params.to,
    q: params.q?.trim(),
  };
}

/** `GET /finance/funds/transfers` (şirket içi + şirketler arası satırlar). */
export function transfersQuery(
  params: TransferListParams,
  page = 0,
  size = TRANSFERS_DEFAULT_SIZE,
  activeCompanyId: string | null = null,
) {
  return (
    "/finance/funds/transfers" +
    buildQuery({
      ...transferFilter(params, activeCompanyId),
      page: Math.max(0, Math.trunc(page)),
      size: clamp(size, 1, TRANSFERS_MAX_SIZE),
    })
  );
}

/** `GET /finance/funds/transfers/summary` (aynı süzgeç, sayfasız). */
export function transferSummaryQuery(
  params: TransferListParams,
  activeCompanyId: string | null = null,
) {
  return "/finance/funds/transfers/summary" + buildQuery(transferFilter(params, activeCompanyId));
}

export type FxSourceParams = { fundId: string; currency: string };
export type FxCandidateParams = FxSourceParams & { accountId?: string };

/** `GET /finance/funds/transfers/fx-sources`. */
export function fxSourcesQuery(params: FxSourceParams) {
  return "/finance/funds/transfers/fx-sources" + buildQuery(params);
}

/**
 * `GET /finance/funds/transfers/fx-collection-candidates`: `accountId` yoksa cari listesi
 * (`FxCandidateAccount[]`), varsa o carinin tahsilatları (`FxCandidateCollection[]`).
 */
export function fxCandidatesQuery(params: FxCandidateParams) {
  return (
    "/finance/funds/transfers/fx-collection-candidates" +
    buildQuery({ fundId: params.fundId, currency: params.currency, accountId: params.accountId })
  );
}

export type FxReportParams = DateRange & { companyId?: string | null };

/** `GET /finance/funds/transfers/fx-report`. */
export function fxReportQuery(params: FxReportParams, activeCompanyId: string | null = null) {
  return (
    "/finance/funds/transfers/fx-report" +
    buildQuery({
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      from: params.from,
      to: params.to,
    })
  );
}

export type IntercompanyListParams = DateRange & { companyId?: string | null };

/** `GET /finance/intercompany-transfers`. */
export function intercompanyTransfersQuery(
  params: IntercompanyListParams,
  page = 0,
  size = TRANSFERS_MAX_SIZE,
  activeCompanyId: string | null = null,
) {
  return (
    "/finance/intercompany-transfers" +
    buildQuery({
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      from: params.from,
      to: params.to,
      page: Math.max(0, Math.trunc(page)),
      size: clamp(size, 1, TRANSFERS_MAX_SIZE),
    })
  );
}

export type InvoiceGapParams = { companyId?: string | null; side?: DocumentSide };

/** `GET /finance/accounts/invoice-gaps` (yalnız `missing > 1`; şirketsiz → konsolide satırlar). */
export function invoiceGapsQuery(params: InvoiceGapParams, activeCompanyId: string | null = null) {
  return (
    "/finance/accounts/invoice-gaps" +
    buildQuery({
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      side: params.side,
    })
  );
}

/**
 * `POST /finance/settlements/check?type=…` (yazmaz). Düzeltme önizlemesinde (12.2a §3.4)
 * `correctsSettlementId`: eski kaydın bakiye etkisi düşülerek hesaplanır.
 */
export function settlementCheckPath(type: SettlementType, correctsSettlementId?: string | null) {
  return (
    "/finance/settlements/check" +
    buildQuery({ type, correctsSettlementId: correctsSettlementId ?? undefined })
  );
}

/** Uyarı önizlemesi için zorunlu alanlar: cari + iş yeri + pozitif tutar + para birimi (§5.13). */
export function settlementCheckReady(body: SettlementBody | null | undefined): boolean {
  if (!body) return false;
  const amount = Number(body.money?.amount);
  return (
    !!body.accountId &&
    !!body.branchId &&
    !!body.money?.currency &&
    Number.isFinite(amount) &&
    amount > 0
  );
}

// ---------------------------------------------------------------------------------------------
// Sorgu anahtarları
// ---------------------------------------------------------------------------------------------

const ROOT = ["finance", "fund-center"] as const;

/** Tüm anahtarlar ["finance", "fund-center", …]; şirkete duyarlılarda çözülmüş `companyId` anahtarda. */
export const fundKeys = {
  all: ROOT,
  list: (q: FundListParams & { companyId: string | null }) => [...ROOT, "list", q] as const,
  summary: (q: FundSummaryParams & { companyId: string | null }) =>
    [...ROOT, "summary", q] as const,
  sparklines: (ids: readonly string[]) => [...ROOT, "sparklines", ids] as const,
  detail: (id: string, asOf?: string) => [...ROOT, "detail", id, asOf ?? null] as const,
  canDelete: (id: string) => [...ROOT, "can-delete", id] as const,
  transactions: (
    q: FundTransactionParams & { companyId: string | null; page: number; size: number },
  ) => [...ROOT, "transactions", q] as const,
  transaction: (id: string) => [...ROOT, "transaction", id] as const,
  activity: (id: string, q: DateRange) => [...ROOT, "activity", id, q] as const,
  statement: (id: string, q: FundStatementParams & { page: number; size: number }) =>
    [...ROOT, "statement", id, q] as const,
  transfers: (q: TransferListParams & { companyId: string | null; page: number; size: number }) =>
    [...ROOT, "transfers", q] as const,
  transferSummary: (q: TransferListParams & { companyId: string | null }) =>
    [...ROOT, "transfer-summary", q] as const,
  transfer: (id: string) => [...ROOT, "transfer", id] as const,
  dependents: (id: string) => [...ROOT, "transfer", id, "dependents"] as const,
  fxSources: (q: FxSourceParams) => [...ROOT, "fx-sources", q] as const,
  fxCandidates: (q: FxCandidateParams) => [...ROOT, "fx-candidates", q] as const,
  fxReport: (q: FxReportParams & { companyId: string | null }) =>
    [...ROOT, "fx-report", q] as const,
  intercompanyList: (
    q: IntercompanyListParams & { companyId: string | null; page: number; size: number },
  ) => [...ROOT, "intercompany", "list", q] as const,
  intercompany: (id: string) => [...ROOT, "intercompany", id] as const,
  invoiceGaps: (q: InvoiceGapParams & { companyId: string | null }) =>
    [...ROOT, "invoice-gaps", q] as const,
  settlementCheck: (q: {
    type: SettlementType;
    body: SettlementBody | null;
    correctsSettlementId?: string | null;
  }) => [...ROOT, "settlement-check", q] as const,
};

// ---------------------------------------------------------------------------------------------
// Okuma kancaları
// ---------------------------------------------------------------------------------------------

type Enabled = { enabled?: boolean };

/** Fon listesi (aktif + pasif; `active` verilirse süzülür). */
export function useFundList(params: FundListParams = {}, options: Enabled = {}) {
  const active = useActiveCompanyId();
  const companyId = effectiveCompany(params.companyId, active);
  return useQuery({
    queryKey: fundKeys.list({ ...params, companyId }),
    queryFn: () => apiGet<Fund[]>(fundListQuery({ ...params, companyId })),
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

/** Şirket × tür × hesap türü × para birimi özeti (`/funds/summary`). */
export function useFundSummary(params: FundSummaryParams = {}, options: Enabled = {}) {
  const active = useActiveCompanyId();
  const companyId = effectiveCompany(params.companyId, active);
  return useQuery({
    queryKey: fundKeys.summary({ ...params, companyId }),
    queryFn: () => apiGet<FundSummaryRow[]>(fundSummaryQuery({ ...params, companyId })),
    enabled: options.enabled ?? true,
  });
}

/** Kart sparkline'ları: kimlikler 200'lük parçalarla sırayla istenir; boş listede istek yok. */
export function useFundSparklines(ids: readonly string[], options: Enabled = {}) {
  const chunks = chunkIds(ids);
  const key = chunks.flat();
  return useQuery({
    queryKey: fundKeys.sparklines(key),
    queryFn: async () => {
      const result: FundSparkline[] = [];
      for (const chunk of chunks) {
        result.push(...(await apiGet<FundSparkline[]>(fundSparklinesQuery(chunk))));
      }
      return result;
    },
    enabled: (options.enabled ?? true) && key.length > 0,
    staleTime: 60_000,
  });
}

/** Tekil fon detayı (`FundDetail`; 404 FUND_NOT_FOUND). */
export function useFund(id: string | undefined, asOf?: string) {
  return useQuery({
    queryKey: fundKeys.detail(id ?? "", asOf),
    queryFn: () => apiGet<FundDetail>(fundDetailQuery(String(id), asOf)),
    enabled: !!id,
  });
}

/** Silme denetimi (engelleyen kayıt türleri ve sayıları). */
export function useFundCanDelete(id: string | undefined, options: Enabled = {}) {
  return useQuery({
    queryKey: fundKeys.canDelete(id ?? ""),
    queryFn: () => apiGet<FundCanDelete>(`/finance/funds/${path(String(id))}/can-delete`),
    enabled: !!id && (options.enabled ?? true),
  });
}

/**
 * Banka/Kasa hareket araması (sunucu sayfalı). Zorunlu tarih koşulu sağlanmadan istek yok
 * (`fundTransactionsReady`); eski sayfa yenisi gelene dek görünür kalır (INP).
 */
export function useFundTransactions(
  params: FundTransactionParams,
  page = 0,
  size = FUND_TRANSACTIONS_DEFAULT_SIZE,
  options: Enabled = {},
) {
  const active = useActiveCompanyId();
  const companyId = effectiveCompany(params.companyId, active);
  const effectiveSize = fundTransactionsPageSize(params, size);
  return useQuery({
    queryKey: fundKeys.transactions({ ...params, companyId, page, size: effectiveSize }),
    queryFn: () =>
      apiGet<FundTransactionPage>(
        fundTransactionsQuery({ ...params, companyId }, page, effectiveSize),
      ),
    enabled: (options.enabled ?? true) && fundTransactionsReady(params),
    placeholderData: keepPreviousData,
  });
}

/** CSV için tüm satırlar (sayfasız uç; > 10.000 satırda 422 RESULT_TOO_LARGE). */
export function exportFundTransactions(
  params: FundTransactionParams,
  activeCompanyId: string | null,
): Promise<FundTransactionRow[]> {
  return apiGet<FundTransactionRow[]>(fundTransactionsExportQuery(params, activeCompanyId));
}

/** Hareket detayı (kaynak belge bağlantısıyla). */
export function useFundTransaction(id: string | undefined) {
  return useQuery({
    queryKey: fundKeys.transaction(id ?? ""),
    queryFn: () => apiGet<FundTransactionDetail>(`/finance/funds/transactions/${path(String(id))}`),
    enabled: !!id,
  });
}

/** FIFO faaliyet raporu. */
export function useFundActivity(id: string | undefined, range: DateRange) {
  return useQuery({
    queryKey: fundKeys.activity(id ?? "", range),
    queryFn: () => apiGet<FundActivityReport>(fundActivityQuery(String(id), range)),
    enabled: !!id && range.from !== "" && range.to !== "",
  });
}

/** Mevcut fon ekstresi (`StatementResponse`, sayfa ≤ 200). */
export function useFundStatement(
  id: string | undefined,
  params: FundStatementParams,
  page = 0,
  size = FUND_STATEMENT_MAX_SIZE,
) {
  const effectiveSize = clamp(size, 1, FUND_STATEMENT_MAX_SIZE);
  return useQuery({
    queryKey: fundKeys.statement(id ?? "", { ...params, page, size: effectiveSize }),
    queryFn: () => apiGet<Statement>(fundStatementQuery(String(id), params, page, effectiveSize)),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
}

/** Transferler sekmesi (sayfalı). */
export function useTransfers(
  params: TransferListParams,
  page = 0,
  size = TRANSFERS_DEFAULT_SIZE,
  options: Enabled = {},
) {
  const active = useActiveCompanyId();
  const companyId = effectiveCompany(params.companyId, active);
  const effectiveSize = clamp(size, 1, TRANSFERS_MAX_SIZE);
  return useQuery({
    queryKey: fundKeys.transfers({ ...params, companyId, page, size: effectiveSize }),
    queryFn: () =>
      apiGet<Page<TransferListRow>>(transfersQuery({ ...params, companyId }, page, effectiveSize)),
    enabled: (options.enabled ?? true) && params.from !== "" && params.to !== "",
    placeholderData: keepPreviousData,
  });
}

/** Transfer özet kartları (grup başına adet ve tutar). */
export function useTransferSummary(params: TransferListParams, options: Enabled = {}) {
  const active = useActiveCompanyId();
  const companyId = effectiveCompany(params.companyId, active);
  return useQuery({
    queryKey: fundKeys.transferSummary({ ...params, companyId }),
    queryFn: () => apiGet<TransferSummaryRow[]>(transferSummaryQuery({ ...params, companyId })),
    enabled: (options.enabled ?? true) && params.from !== "" && params.to !== "",
  });
}

export function useTransfer(id: string | undefined) {
  return useQuery({
    queryKey: fundKeys.transfer(id ?? ""),
    queryFn: () => apiGet<FundTransfer>(`/finance/funds/transfers/${path(String(id))}`),
    enabled: !!id,
  });
}

/** Bu transferi kaynak kullanan döviz bozumları (silme engeli, BS-10). */
export function useTransferDependents(id: string | undefined, options: Enabled = {}) {
  return useQuery({
    queryKey: fundKeys.dependents(id ?? ""),
    queryFn: () =>
      apiGet<TransferDependent[]>(`/finance/funds/transfers/${path(String(id))}/dependents`),
    enabled: !!id && (options.enabled ?? true),
  });
}

/** Döviz bozumu: önceki bozumlardan kalan döviz kaynakları. */
export function useFxSources(params: FxSourceParams | null) {
  return useQuery({
    queryKey: fundKeys.fxSources(params ?? { fundId: "", currency: "" }),
    queryFn: () => apiGet<FxSource[]>(fxSourcesQuery(params as FxSourceParams)),
    enabled: !!params?.fundId && !!params.currency,
  });
}

/** Döviz bozumu tahsilat seçimi, 1. adım: bozulabilir tahsilatı olan cariler. */
export function useFxCandidateAccounts(params: FxSourceParams | null) {
  const q = { fundId: params?.fundId ?? "", currency: params?.currency ?? "" };
  return useQuery({
    queryKey: fundKeys.fxCandidates(q),
    queryFn: () => apiGet<FxCandidateAccount[]>(fxCandidatesQuery(q)),
    enabled: q.fundId !== "" && q.currency !== "",
  });
}

/** Döviz bozumu tahsilat seçimi, 2. adım: seçilen carinin tahsilatları. */
export function useFxCandidateCollections(params: FxCandidateParams | null) {
  const q = {
    fundId: params?.fundId ?? "",
    currency: params?.currency ?? "",
    accountId: params?.accountId ?? "",
  };
  return useQuery({
    queryKey: fundKeys.fxCandidates(q),
    queryFn: () => apiGet<FxCandidateCollection[]>(fxCandidatesQuery(q)),
    enabled: q.fundId !== "" && q.currency !== "" && q.accountId !== "",
  });
}

/** Döviz Bozum & Tahsilat İzlenebilirliği raporu. */
export function useFxReport(params: FxReportParams, options: Enabled = {}) {
  const active = useActiveCompanyId();
  const companyId = effectiveCompany(params.companyId, active);
  return useQuery({
    queryKey: fundKeys.fxReport({ ...params, companyId }),
    queryFn: () => apiGet<FxReport>(fxReportQuery({ ...params, companyId })),
    enabled: (options.enabled ?? true) && params.from !== "" && params.to !== "",
  });
}

/** Şirketler arası virman listesi (iki taraftan biri görünür). */
export function useIntercompanyTransfers(
  params: IntercompanyListParams,
  page = 0,
  size = TRANSFERS_MAX_SIZE,
  options: Enabled = {},
) {
  const active = useActiveCompanyId();
  const companyId = effectiveCompany(params.companyId, active);
  const effectiveSize = clamp(size, 1, TRANSFERS_MAX_SIZE);
  return useQuery({
    queryKey: fundKeys.intercompanyList({ ...params, companyId, page, size: effectiveSize }),
    queryFn: () =>
      apiGet<Page<IntercompanyTransfer>>(
        intercompanyTransfersQuery({ ...params, companyId }, page, effectiveSize),
      ),
    enabled: (options.enabled ?? true) && params.from !== "" && params.to !== "",
  });
}

export function useIntercompanyTransfer(id: string | undefined) {
  return useQuery({
    queryKey: fundKeys.intercompany(id ?? ""),
    queryFn: () =>
      apiGet<IntercompanyTransfer>(`/finance/intercompany-transfers/${path(String(id))}`),
    enabled: !!id,
  });
}

/** Eksik faturalı cariler (tek istek; cari süzmesi ekranda). */
export function useInvoiceGaps(params: InvoiceGapParams = {}, options: Enabled = {}) {
  const active = useActiveCompanyId();
  const companyId = effectiveCompany(params.companyId, active);
  return useQuery({
    queryKey: fundKeys.invoiceGaps({ ...params, companyId }),
    queryFn: () => apiGet<AccountInvoiceGap[]>(invoiceGapsQuery({ ...params, companyId })),
    enabled: options.enabled ?? true,
  });
}

/**
 * Değeri `delay` ms sabit kaldıktan sonra döndürür (ilk değer hemen). Karşılaştırma JSON ile yapılır;
 * her çizimde yeni nesne veren çağıran zamanlayıcıyı yeniden başlatmaz.
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const serialized = JSON.stringify(value) ?? "";
  const [state, setState] = useState(() => ({ serialized, value }));
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => {
    if (serialized === state.serialized) return;
    const timer = setTimeout(() => setState({ serialized, value: latest.current }), delay);
    return () => clearTimeout(timer);
  }, [serialized, state.serialized, delay]);
  return state.value;
}

/**
 * Ödeme/tahsilat uyarı önizlemesi (`POST /settlements/check`): gövde 400 ms sabit kaldıktan sonra ve
 * zorunlu alanlar (cari, iş yeri, tutar, para birimi) doluyken istenir; yazmaz. Üçüncü argümanın
 * `correctsSettlementId`'si (12.2a düzenleme modalı) sorguya `correctsSettlementId=` olarak eklenir.
 */
export function useSettlementCheck(
  type: SettlementType,
  body: SettlementBody | null,
  options: Enabled & { delayMs?: number; correctsSettlementId?: string | null } = {},
) {
  const debounced = useDebouncedValue(body, options.delayMs ?? SETTLEMENT_CHECK_DELAY_MS);
  const ready = (options.enabled ?? true) && settlementCheckReady(debounced);
  const correctsSettlementId = options.correctsSettlementId || null;
  return useQuery({
    queryKey: fundKeys.settlementCheck({
      type,
      body: ready ? debounced : null,
      correctsSettlementId,
    }),
    queryFn: () =>
      apiRequest<SettlementCheck>("POST", settlementCheckPath(type, correctsSettlementId), {
        ...(debounced as SettlementBody),
        confirmWarnings: undefined,
      }),
    enabled: ready,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}

// ---------------------------------------------------------------------------------------------
// Yazma
// ---------------------------------------------------------------------------------------------

function idempotency(key: string | undefined): Record<string, string> | undefined {
  return key ? { "Idempotency-Key": key } : undefined;
}

export function createFund(body: FundBody) {
  return apiRequest<Fund>("POST", "/finance/funds", body);
}

export function updateFund(id: string, body: UpdateFundBody) {
  return apiRequest<Fund>("PUT", `/finance/funds/${path(id)}`, body);
}

export function setFundActive(id: string, active: boolean) {
  return apiRequest<Fund>("PATCH", `/finance/funds/${path(id)}/active`, { active });
}

export function deleteFund(id: string) {
  return apiRequest<void>("DELETE", `/finance/funds/${path(id)}`);
}

export function createTransfer(body: FundTransferBody, key?: string) {
  return apiRequest<FundTransfer>("POST", "/finance/funds/transfers", body, idempotency(key));
}

export function replaceTransfer(id: string, body: ReplaceTransferBody, key?: string) {
  return apiRequest<FundTransfer>(
    "POST",
    `/finance/funds/transfers/${path(id)}/replace`,
    body,
    idempotency(key),
  );
}

export function reverseTransfer(id: string, body: ReverseTransferBody) {
  return apiRequest<FundTransfer>("POST", `/finance/funds/transfers/${path(id)}/reverse`, body);
}

export function createIntercompanyTransfer(body: IntercompanyTransferBody, key?: string) {
  return apiRequest<IntercompanyTransfer>(
    "POST",
    "/finance/intercompany-transfers",
    body,
    idempotency(key),
  );
}

export function reverseIntercompanyTransfer(id: string, body: ReverseTransferBody) {
  return apiRequest<IntercompanyTransfer>(
    "POST",
    `/finance/intercompany-transfers/${path(id)}/reverse`,
    body,
  );
}

type MutationOptions<TData, TVariables> = Omit<
  UseMutationOptions<TData, Error, TVariables>,
  "mutationFn"
>;

/**
 * Idempotency-Key taşıyan finans mutasyonu: anahtar kanca başına üretilir, hata sonrası yeniden
 * denemede aynı kalır (sunucu başarısız isteği saklamaz; aynı anahtar aynı belgeyi verir), başarıda
 * yenilenir. Form temizlenince `resetIdempotencyKey` ile elle de yenilenebilir.
 */
function useIdempotentMutation<TData, TVariables>(
  send: (variables: TVariables, key: string) => Promise<TData>,
  options: MutationOptions<TData, TVariables>,
) {
  const keyRef = useRef<string>("");
  const currentKey = useCallback(() => {
    if (keyRef.current === "") keyRef.current = newIdempotencyKey();
    return keyRef.current;
  }, []);
  const resetIdempotencyKey = useCallback(() => {
    keyRef.current = newIdempotencyKey();
  }, []);
  const mutation = useFinanceMutation<TData, TVariables>(
    (variables) => send(variables, currentKey()),
    {
      ...options,
      onSuccess: async (...args) => {
        resetIdempotencyKey();
        await options.onSuccess?.(...args);
      },
    },
  );
  return { ...mutation, resetIdempotencyKey };
}

export function useCreateFund(options: MutationOptions<Fund, FundBody> = {}) {
  return useFinanceMutation(createFund, options);
}

export function useUpdateFund(
  options: MutationOptions<Fund, { id: string; body: UpdateFundBody }> = {},
) {
  return useFinanceMutation(
    ({ id, body }: { id: string; body: UpdateFundBody }) => updateFund(id, body),
    options,
  );
}

export function useSetFundActive(
  options: MutationOptions<Fund, { id: string; active: boolean }> = {},
) {
  return useFinanceMutation(
    ({ id, active }: { id: string; active: boolean }) => setFundActive(id, active),
    options,
  );
}

export function useDeleteFund(options: MutationOptions<void, string> = {}) {
  return useFinanceMutation(deleteFund, options);
}

export function useCreateTransfer(options: MutationOptions<FundTransfer, FundTransferBody> = {}) {
  return useIdempotentMutation(createTransfer, options);
}

export function useReplaceTransfer(
  options: MutationOptions<FundTransfer, { id: string; body: ReplaceTransferBody }> = {},
) {
  return useIdempotentMutation(
    ({ id, body }: { id: string; body: ReplaceTransferBody }, key: string) =>
      replaceTransfer(id, body, key),
    options,
  );
}

export function useReverseTransfer(
  options: MutationOptions<FundTransfer, { id: string; body: ReverseTransferBody }> = {},
) {
  return useFinanceMutation(
    ({ id, body }: { id: string; body: ReverseTransferBody }) => reverseTransfer(id, body),
    options,
  );
}

export function useCreateIntercompany(
  options: MutationOptions<IntercompanyTransfer, IntercompanyTransferBody> = {},
) {
  return useIdempotentMutation(createIntercompanyTransfer, options);
}

export function useReverseIntercompany(
  options: MutationOptions<IntercompanyTransfer, { id: string; body: ReverseTransferBody }> = {},
) {
  return useFinanceMutation(
    ({ id, body }: { id: string; body: ReverseTransferBody }) =>
      reverseIntercompanyTransfer(id, body),
    options,
  );
}
