import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { apiGet, apiRequest } from "../../api/client";
import { useActiveCompanyId } from "../../auth/companyStore";
import { buildQuery, effectiveCompany, newIdempotencyKey } from "./accountApi";
import type {
  AccountDocument,
  AccountMethodTotal,
  AccountPerformanceRow,
  Aging,
  AgingBasis,
  BalanceSheet,
  CashFlow,
  CurrencyPositionRow,
  FxCutState,
  FxDifferenceReport,
  FxDifferenceRequest,
  LedgerAccounts,
  LedgerSummary,
  Rate,
  ReportType,
  Treasury,
} from "./types";

/*
 * 12.8 finans raporları istemcisi (12.8_TASARIM §4.2, §5.2; `instrumentApi.ts` kalıbı). Uçlar
 * `/finance/reports/*` (FINANCE_VIEW; LIMITED kullanıcıda sunucu kapsamı daraltır). Sorgu anahtarları
 * ["finance", "reports", <ad>, p] önekli; `p` çözülmüş `companyId`'yi içerir (undefined → aktif şirket,
 * null → konsolide; accountApi kuralı). Liste parametreleri tekrarlı sorgu parametresidir
 * (`branchIds=a&branchIds=b`). Para alanları ondalık metindir; istemci yalnız gösterir.
 * `fundApi.ts` `useFxReport` (döviz bozum raporu) ile karışmasın diye kur farkı kancaları
 * `useFxDifferenceReport` / `useCreateFxDifference` adını taşır.
 */

const path = encodeURIComponent;

// ---------------------------------------------------------------------------------------------
// Sınırlar (sunucu doğrulamasıyla aynı; OK-12.8-22, §4.2)
// ---------------------------------------------------------------------------------------------

/** `GET /finance/reports/fx-differences` `size` 1–2000 (varsayılan 2000; üstü sunucuda kırpılır). */
export const FX_REPORT_MAX_SIZE = 2000;
/** `page` 0–100000 (aşım 400 `PAGE_INVALID`). */
export const FX_REPORT_MAX_PAGE = 100_000;
/** Nakit akışı hafta sayısı (ZTO 8 hafta). */
export const CASH_FLOW_DEFAULT_WEEKS = 8;

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

// ---------------------------------------------------------------------------------------------
// Parametreler
// ---------------------------------------------------------------------------------------------

/** Şirket ve iş yeri kapsamı (her rapor ucunda ortak). */
export type ReportScopeParams = {
  /** undefined → aktif şirket; null → konsolide. */
  companyId?: string | null;
  /** Tekrarlı `branchIds`; boş = kullanıcının tüm kapsamı. */
  branchIds?: readonly string[];
};

/** `GET /finance/reports/aging` (yaşlandırma v2; §4.2). */
export type AgingParams = ReportScopeParams & {
  type: "RECEIVABLE" | "PAYABLE";
  /** `"YYYY-MM-DD"` (zorunlu). */
  asOf: string;
  /** Varsayılan sunucuda true (grup şirketi carileri dışarıda). */
  excludeIntercompany?: boolean;
  /** Varsayılan sunucuda TRANSACTION. */
  basis?: AgingBasis;
  accountId?: string;
  subGroups?: readonly string[];
};

/** `GET /finance/reports/ledger-summary` (`to` boş = bugün). */
export type LedgerSummaryParams = ReportScopeParams & {
  from?: string;
  to?: string;
  currency?: string;
};

/** `GET /finance/reports/ledger-accounts`. */
export type LedgerAccountsParams = LedgerSummaryParams & {
  reportType: ReportType;
  accountId?: string;
};

/** `GET /finance/reports/account-methods`. */
export type AccountMethodsParams = ReportScopeParams & {
  accountId: string;
  from?: string;
  to?: string;
};

/** `GET /finance/reports/balance-sheet` (`asOf` boş = bugün). */
export type BalanceSheetParams = ReportScopeParams & { asOf?: string };

/** `GET /finance/reports/treasury`. */
export type TreasuryParams = ReportScopeParams;

/** `GET /finance/reports/cash-flow` (`currency` boş = TL karşılığı). */
export type CashFlowParams = ReportScopeParams & { weeks?: number; currency?: string };

/** `GET /finance/reports/account-performance` (`from`/`to` zorunlu). */
export type AccountPerformanceParams = ReportScopeParams & {
  from: string;
  to: string;
  accountId?: string;
  subGroups?: readonly string[];
};

/** `GET /finance/reports/currency-position`. */
export type CurrencyPositionParams = ReportScopeParams & { byCompany?: boolean };

/** `GET /finance/reports/fx-differences` (§4.2; `valuationDate` boş = bugün). */
export type FxDifferencesParams = ReportScopeParams & {
  accountId?: string;
  currency?: string;
  from?: string;
  to?: string;
  cutState?: FxCutState;
  valuationDate?: string;
  withRates?: boolean;
  /** 0–100000 (kırpılır). */
  page?: number;
  /** 1–2000 (kırpılır; varsayılan 2000). */
  size?: number;
};

type Resolved<P> = Omit<P, "companyId"> & { companyId: string | null };

function resolve<P extends ReportScopeParams>(params: P, active: string | null): Resolved<P> {
  return { ...params, companyId: effectiveCompany(params.companyId, active) };
}

// ---------------------------------------------------------------------------------------------
// Sorgu yolları (saf). `activeCompanyId` yalnız `companyId` undefined iken kullanılır.
// ---------------------------------------------------------------------------------------------

const REPORTS = "/finance/reports";

export function agingPath(params: AgingParams, activeCompanyId: string | null = null): string {
  return (
    `${REPORTS}/aging` +
    buildQuery({
      type: params.type,
      asOf: params.asOf,
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      excludeIntercompany: params.excludeIntercompany,
      basis: params.basis,
      accountId: params.accountId,
      subGroups: params.subGroups,
      branchIds: params.branchIds,
    })
  );
}

export function ledgerSummaryPath(
  params: LedgerSummaryParams,
  activeCompanyId: string | null = null,
): string {
  return (
    `${REPORTS}/ledger-summary` +
    buildQuery({
      from: params.from,
      to: params.to,
      currency: params.currency,
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      branchIds: params.branchIds,
    })
  );
}

export function ledgerAccountsPath(
  params: LedgerAccountsParams,
  activeCompanyId: string | null = null,
): string {
  return (
    `${REPORTS}/ledger-accounts` +
    buildQuery({
      reportType: params.reportType,
      from: params.from,
      to: params.to,
      currency: params.currency,
      accountId: params.accountId,
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      branchIds: params.branchIds,
    })
  );
}

export function accountMethodsPath(
  params: AccountMethodsParams,
  activeCompanyId: string | null = null,
): string {
  return (
    `${REPORTS}/account-methods` +
    buildQuery({
      accountId: params.accountId,
      from: params.from,
      to: params.to,
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      branchIds: params.branchIds,
    })
  );
}

/** Bilanço ucu (navItems `balanceSheetPath` ekran yoludur; bu API yoludur). */
export function balanceSheetReportPath(
  params: BalanceSheetParams = {},
  activeCompanyId: string | null = null,
): string {
  return (
    `${REPORTS}/balance-sheet` +
    buildQuery({
      asOf: params.asOf,
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      branchIds: params.branchIds,
    })
  );
}

export function treasuryPath(
  params: TreasuryParams = {},
  activeCompanyId: string | null = null,
): string {
  return (
    `${REPORTS}/treasury` +
    buildQuery({
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      branchIds: params.branchIds,
    })
  );
}

/** Nakit akışı ucu (navItems `cashFlowPath` ekran yoludur; bu API yoludur). */
export function cashFlowReportPath(
  params: CashFlowParams = {},
  activeCompanyId: string | null = null,
): string {
  return (
    `${REPORTS}/cash-flow` +
    buildQuery({
      weeks: clampInt(params.weeks, 1, 52, CASH_FLOW_DEFAULT_WEEKS),
      currency: params.currency,
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      branchIds: params.branchIds,
    })
  );
}

export function accountPerformancePath(
  params: AccountPerformanceParams,
  activeCompanyId: string | null = null,
): string {
  return (
    `${REPORTS}/account-performance` +
    buildQuery({
      from: params.from,
      to: params.to,
      accountId: params.accountId,
      subGroups: params.subGroups,
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      branchIds: params.branchIds,
    })
  );
}

export function currencyPositionPath(
  params: CurrencyPositionParams = {},
  activeCompanyId: string | null = null,
): string {
  return (
    `${REPORTS}/currency-position` +
    buildQuery({
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      branchIds: params.branchIds,
      byCompany: params.byCompany ? true : undefined,
    })
  );
}

/** Kur farkı raporu: `page` 0–100000, `size` 1–2000 her zaman yazılır. */
export function fxDifferencesPath(
  params: FxDifferencesParams = {},
  activeCompanyId: string | null = null,
): string {
  return (
    `${REPORTS}/fx-differences` +
    buildQuery({
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      branchIds: params.branchIds,
      accountId: params.accountId,
      currency: params.currency,
      from: params.from,
      to: params.to,
      cutState: params.cutState,
      valuationDate: params.valuationDate,
      withRates: params.withRates ? true : undefined,
      page: clampInt(params.page, 0, FX_REPORT_MAX_PAGE, 0),
      size: clampInt(params.size, 1, FX_REPORT_MAX_SIZE, FX_REPORT_MAX_SIZE),
    })
  );
}

/** `POST /finance/fx-differences` (kur farkı kesimi; 201 `AccountDocument`). */
export const FX_DIFFERENCE_CREATE_PATH = "/finance/fx-differences";

/** `GET /finance/exchange-rates?date` (kur ekranı ve MUI Tanımlar). */
export function exchangeRatesPath(date: string): string {
  return `/finance/exchange-rates?date=${path(date)}`;
}

/** `POST /finance/exchange-rates/refresh` (FINANCE_MANAGE; gövdesiz 202). */
export const EXCHANGE_RATES_REFRESH_PATH = "/finance/exchange-rates/refresh";

// ---------------------------------------------------------------------------------------------
// Sorgu anahtarları
// ---------------------------------------------------------------------------------------------

const ROOT = ["finance", "reports"] as const;

/** Tüm anahtarlar ["finance", "reports", <ad>, p]; `p` çözülmüş `companyId`'yi içerir. */
export const financeReportKeys = {
  all: ROOT,
  aging: (p: Resolved<AgingParams>) => [...ROOT, "aging", p] as const,
  ledgerSummary: (p: Resolved<LedgerSummaryParams>) => [...ROOT, "ledgerSummary", p] as const,
  ledgerAccounts: (p: Resolved<LedgerAccountsParams>) => [...ROOT, "ledgerAccounts", p] as const,
  accountMethods: (p: Resolved<AccountMethodsParams>) => [...ROOT, "accountMethods", p] as const,
  balanceSheet: (p: Resolved<BalanceSheetParams>) => [...ROOT, "balanceSheet", p] as const,
  treasury: (p: Resolved<TreasuryParams>) => [...ROOT, "treasury", p] as const,
  cashFlow: (p: Resolved<CashFlowParams>) => [...ROOT, "cashFlow", p] as const,
  accountPerformance: (p: Resolved<AccountPerformanceParams>) =>
    [...ROOT, "accountPerformance", p] as const,
  currencyPosition: (p: Resolved<CurrencyPositionParams>) =>
    [...ROOT, "currencyPosition", p] as const,
  /** Öneki (`[...ROOT, "fxDifferences"]`) kesimden sonra geçersizlenir. */
  fxDifferences: (p: Resolved<FxDifferencesParams>) => [...ROOT, "fxDifferences", p] as const,
};

/** Kur anahtarı MUI `DefinitionsPage` ile ortak (iki ekran birbirini günceller; §5.2). */
export const exchangeRateKeys = {
  all: ["finance", "rates"] as const,
  byDate: (date: string) => ["finance", "rates", date] as const,
};

// ---------------------------------------------------------------------------------------------
// Okuma
// ---------------------------------------------------------------------------------------------

type Enabled = { enabled?: boolean };

/** Rapor sorgusu: eski sonuç yenisi gelene dek görünür kalır (INP; süzgeç değişiminde titreme yok). */
function useReport<P extends ReportScopeParams, T>(
  params: P,
  keyOf: (resolved: Resolved<P>) => QueryKey,
  pathOf: (resolved: Resolved<P>) => string,
  enabled: boolean,
) {
  const active = useActiveCompanyId();
  const resolved = resolve(params, active);
  return useQuery({
    queryKey: keyOf(resolved),
    queryFn: () => apiGet<T>(pathOf(resolved)),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/** Yaşlandırma v2 (`asOf` boşken istek atılmaz). */
export function useAgingReport(params: AgingParams, options: Enabled = {}) {
  return useReport<AgingParams, Aging[]>(
    params,
    financeReportKeys.aging,
    (p) => agingPath(p),
    !!params.asOf && (options.enabled ?? true),
  );
}

/** FinanceReport genel bakış. */
export function useLedgerSummary(params: LedgerSummaryParams, options: Enabled = {}) {
  return useReport<LedgerSummaryParams, LedgerSummary>(
    params,
    financeReportKeys.ledgerSummary,
    (p) => ledgerSummaryPath(p),
    options.enabled ?? true,
  );
}

/** FinanceReport liste (cari × şirket × para birimi satırları). */
export function useLedgerAccounts(params: LedgerAccountsParams, options: Enabled = {}) {
  return useReport<LedgerAccountsParams, LedgerAccounts>(
    params,
    financeReportKeys.ledgerAccounts,
    (p) => ledgerAccountsPath(p),
    !!params.reportType && (options.enabled ?? true),
  );
}

/** Cari ekstre ödeme/tahsilat yöntem kırılımı. */
export function useAccountMethods(params: AccountMethodsParams, options: Enabled = {}) {
  return useReport<AccountMethodsParams, AccountMethodTotal[]>(
    params,
    financeReportKeys.accountMethods,
    (p) => accountMethodsPath(p),
    !!params.accountId && (options.enabled ?? true),
  );
}

/** Finansal bilanço. */
export function useBalanceSheet(params: BalanceSheetParams = {}, options: Enabled = {}) {
  return useReport<BalanceSheetParams, BalanceSheet>(
    params,
    financeReportKeys.balanceSheet,
    (p) => balanceSheetReportPath(p),
    options.enabled ?? true,
  );
}

/**
 * Hızlı Bakiye Özeti verisi (bağlam kancası `treasuryContext.ts` `useTreasuryModal` ile ad çakışmasın
 * diye `useTreasuryReport`; Rev 1 FE-USETREASURY-NAME). Modal kapalıyken `enabled: false`.
 */
export function useTreasuryReport(params: TreasuryParams = {}, options: Enabled = {}) {
  return useReport<TreasuryParams, Treasury>(
    params,
    financeReportKeys.treasury,
    (p) => treasuryPath(p),
    options.enabled ?? true,
  );
}

/** 8 haftalık nakit akışı. */
export function useCashFlow(params: CashFlowParams = {}, options: Enabled = {}) {
  return useReport<CashFlowParams, CashFlow>(
    params,
    financeReportKeys.cashFlow,
    (p) => cashFlowReportPath(p),
    options.enabled ?? true,
  );
}

/** Cari bazlı ödeme performansı (`from`/`to` boşken istek atılmaz). */
export function useAccountPerformance(params: AccountPerformanceParams, options: Enabled = {}) {
  return useReport<AccountPerformanceParams, AccountPerformanceRow[]>(
    params,
    financeReportKeys.accountPerformance,
    (p) => accountPerformancePath(p),
    !!params.from && !!params.to && (options.enabled ?? true),
  );
}

/** Döviz pozisyonu (CAR sekmesi; LIMITED'e kendi kapsamında açık). */
export function useCurrencyPosition(params: CurrencyPositionParams = {}, options: Enabled = {}) {
  return useReport<CurrencyPositionParams, CurrencyPositionRow[]>(
    params,
    financeReportKeys.currencyPosition,
    (p) => currencyPositionPath(p),
    options.enabled ?? true,
  );
}

/** Kur farkı raporu (sunucu sayfası ≤ 2000 satır; istemci `ZtoRcpTable`). */
export function useFxDifferenceReport(params: FxDifferencesParams = {}, options: Enabled = {}) {
  return useReport<FxDifferencesParams, FxDifferenceReport>(
    params,
    financeReportKeys.fxDifferences,
    (p) => fxDifferencesPath(p),
    options.enabled ?? true,
  );
}

/** Belirli tarihin kurları (`["finance", "rates", date]`; MUI Tanımlar ile ortak). */
export function useExchangeRates(date: string, options: Enabled = {}) {
  return useQuery({
    queryKey: exchangeRateKeys.byDate(date),
    queryFn: () => apiGet<Rate[]>(exchangeRatesPath(date)),
    enabled: !!date && (options.enabled ?? true),
  });
}

// ---------------------------------------------------------------------------------------------
// Yazma
// ---------------------------------------------------------------------------------------------

type MutationOptions<TData, TVariables> = Omit<
  UseMutationOptions<TData, Error, TVariables>,
  "mutationFn"
>;

/**
 * TCMB kur yenileme (202, gövdesiz). TCMB hatası sunucuda yutulur (Rev 1 FE-FXR-REFRESH-ERR): hata
 * dalı yalnız ağ/403/5xx'tir. Başarıda kur ve rapor anahtarları geçersizlenir.
 */
export function useRefreshRates(options: MutationOptions<void, void> = {}) {
  const client = useQueryClient();
  return useMutation<void, Error, void>({
    ...options,
    mutationFn: () => apiRequest<void>("POST", EXCHANGE_RATES_REFRESH_PATH),
    onSuccess: async (data, variables, context, ...rest) => {
      await client.invalidateQueries({ queryKey: exchangeRateKeys.all });
      await client.invalidateQueries({ queryKey: financeReportKeys.all });
      await options.onSuccess?.(data, variables, context, ...rest);
    },
  });
}

/**
 * Kur farkı kesiminden sonra geçersizlenen önekler (§5.2): rapor anahtarları (kur farkı dahil), cari
 * ekstre, hareketler, bakiyeler, cari kart/listesi, belge ve belge listeleri.
 */
export const FX_DIFFERENCE_INVALIDATES: readonly QueryKey[] = [
  financeReportKeys.all,
  ["finance", "account-statement"],
  ["finance", "account-transactions"],
  ["finance", "account-transaction"],
  ["finance", "account-balances"],
  ["finance", "account"],
  ["finance", "accounts"],
  ["finance", "account-document"],
  ["finance", "account-documents"],
];

export type CreateFxDifferenceVariables = {
  body: FxDifferenceRequest;
  /** Satır + değerleme tarihi başına (`createFxCutKeyRegistry`); hata sonrası aynı anahtar. */
  idempotencyKey: string;
};

export function createFxDifference(body: FxDifferenceRequest, idempotencyKey: string) {
  return apiRequest<AccountDocument>("POST", FX_DIFFERENCE_CREATE_PATH, body, {
    "Idempotency-Key": idempotencyKey,
  });
}

/** Kur farkı kesimi ("Kes" onayı; 201 `AccountDocument`). */
export function useCreateFxDifference(
  options: MutationOptions<AccountDocument, CreateFxDifferenceVariables> = {},
) {
  const client = useQueryClient();
  return useMutation<AccountDocument, Error, CreateFxDifferenceVariables>({
    ...options,
    mutationFn: ({ body, idempotencyKey }) => createFxDifference(body, idempotencyKey),
    onSuccess: async (data, variables, context, ...rest) => {
      await Promise.all(
        FX_DIFFERENCE_INVALIDATES.map((queryKey) => client.invalidateQueries({ queryKey })),
      );
      await options.onSuccess?.(data, variables, context, ...rest);
    },
  });
}

/** Kesim anahtarının kimliği: kaynak hareket + değerleme tarihi. */
export function fxCutKeyId(sourceTransactionId: string, valuationDate: string): string {
  return `${sourceTransactionId}|${valuationDate}`;
}

export type FxCutKeyRegistry = {
  /** Onay modalı açılırken çağrılır: aynı satır + tarih için aynı anahtar (yoksa yeni UUID). */
  keyFor: (sourceTransactionId: string, valuationDate: string) => string;
  /** Başarılı kesimden sonra: aynı satır + tarih için sonraki istek yeni anahtar alır. */
  release: (sourceTransactionId: string, valuationDate: string) => void;
};

/**
 * Idempotency-Key kaydı (§5.2): anahtar satır + `valuationDate` başına `crypto.randomUUID()` ile
 * üretilir, hata sonrası korunur (yeniden deneme aynı belgeyi verir), başarıda bırakılır.
 */
export function createFxCutKeyRegistry(
  generate: () => string = newIdempotencyKey,
): FxCutKeyRegistry {
  const keys = new Map<string, string>();
  return {
    keyFor(sourceTransactionId, valuationDate) {
      const id = fxCutKeyId(sourceTransactionId, valuationDate);
      let key = keys.get(id);
      if (!key) {
        key = generate();
        keys.set(id, key);
      }
      return key;
    },
    release(sourceTransactionId, valuationDate) {
      keys.delete(fxCutKeyId(sourceTransactionId, valuationDate));
    },
  };
}
