import { keepPreviousData, useQuery, type UseMutationOptions } from "@tanstack/react-query";
import { apiGet, apiRequest } from "../../api/client";
import { useActiveCompanyId } from "../../auth/companyStore";
import { buildQuery, effectiveCompany, useFinanceMutation } from "./accountApi";
import type {
  AccountType,
  CorrectSettlementBody,
  DailyReport,
  DailyReportSort,
  DocumentPaymentMethod,
  Instrument,
  OpenInvoice,
  Page,
  Plan,
  ReverseSettlementBody,
  Settlement,
  SettlementBody,
  SettlementDetail,
  SettlementListItem,
  SettlementStatus,
  SettlementType,
} from "./types";

/*
 * 12.2a ödeme / tahsilat istemcisi (12.2a_TASARIM §4.2, §5.2; 12.2 `fundApi.ts` kalıbı). Sorgu
 * anahtarları ["finance", "settlement-center", …] önekli: MUI anahtarları ["finance", kind, …] ve
 * fon merkezi ["finance", "fund-center", …] ile konumsal çakışma yok; mutasyonlar ["finance"]'ı
 * geçersizler (`useFinanceMutation`), MUI ve ZTO ekranları birlikte tazelenir. Şirkete duyarlı
 * sorgularda `companyId`: undefined → aktif şirket, null → konsolide (accountApi kuralı).
 * Para alanları ondalık metindir; toplama/karşılaştırma `zto/decimal.ts` ile.
 */

// ---------------------------------------------------------------------------------------------
// Sınırlar (sunucu doğrulamasıyla aynı)
// ---------------------------------------------------------------------------------------------

/** `GET /payments|collections` `size` 1–500 (açık `@RequestParam`, Rev 1 F1); sunucu varsayılanı 20. */
export const SETTLEMENT_LIST_MAX_SIZE = 500;
export const SETTLEMENT_LIST_DEFAULT_SIZE = 20;
/** Excel dışa aktarımı: 500'lük en çok 4 sayfa = 2000 satır (ZTO LIMIT 2000 paritesi). */
export const SETTLEMENT_EXPORT_PAGE_SIZE = 500;
export const SETTLEMENT_EXPORT_MAX_PAGES = 4;
/** Açık plan sorgusu (kalan borç paneli, plan sonrası modal). */
export const ACCOUNT_PLANS_SIZE = 50;
/** Ciro edilebilir çek listesi tek sayfa. */
export const ENDORSABLE_CHECKS_SIZE = 200;
/** Kalan borç paneli / plan sonrası modalda listelenen plan durumları. */
export const OPEN_PLAN_STATUSES = ["DRAFT", "PENDING", "APPROVED", "REJECTED"] as const;

type PlanStatus = Plan["status"];

const path = encodeURIComponent;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

// ---------------------------------------------------------------------------------------------
// Sorgu yolları (saf)
// ---------------------------------------------------------------------------------------------

/** `GET /finance/payments|collections` süzgeçleri (§4.2). */
export type SettlementListParams = {
  /** undefined → aktif şirket; null → konsolide. */
  companyId?: string | null;
  accountId?: string;
  accountType?: AccountType;
  subGroup?: string;
  branchIds?: readonly string[];
  fundAccountIds?: readonly string[];
  /** Görünen yöntem (`displayMethod`): Kredi Kartı = CREDIT_CARD, Senet = NOTE. */
  methods?: readonly DocumentPaymentMethod[];
  status?: SettlementStatus;
  from?: string;
  to?: string;
  q?: string;
  counterpartyBankAccountId?: string;
  /** ZTO listeleri `true` (carisiz gider ödemeleri listelenmez). */
  hasAccount?: boolean;
  /** 0 tabanlı. */
  page?: number;
  /** 1–500. */
  size?: number;
  /** Tekrarlı `alan,yön` (beyaz liste §3.7: settlementDate, branchName, accountName, documentNo, amount). */
  sort?: readonly string[];
};

/** Sayfa boyutunu 1–500'e kırpar (geçersiz → varsayılan 20). */
export function settlementPageSize(size: number | undefined): number {
  if (size === undefined || !Number.isFinite(size)) return SETTLEMENT_LIST_DEFAULT_SIZE;
  return clamp(size, 1, SETTLEMENT_LIST_MAX_SIZE);
}

/**
 * Liste sorgu parametreleri: boş/undefined alan yazılmaz, çoklu alanlar tekrar eder
 * (`branchIds=a&branchIds=b`), `page`/`size` her zaman yazılır (sunucu `Pageable` kullanmaz).
 * `companyId` çözülmüş verilir (`effectiveCompany`); `activeCompanyId` undefined'da kullanılır.
 */
export function settlementListQuery(
  params: SettlementListParams,
  activeCompanyId: string | null = null,
): URLSearchParams {
  const query = new URLSearchParams();
  const put = (key: string, value: string | number | boolean | null | undefined) => {
    if (value === undefined || value === null) return;
    const text = String(value).trim();
    if (text !== "") query.append(key, text);
  };
  const putAll = (key: string, values: readonly string[] | undefined) => {
    for (const value of values ?? []) put(key, value);
  };
  put("companyId", effectiveCompany(params.companyId, activeCompanyId));
  put("accountId", params.accountId);
  put("accountType", params.accountType);
  put("subGroup", params.subGroup);
  putAll("branchIds", params.branchIds);
  putAll("fundAccountIds", params.fundAccountIds);
  putAll("method", params.methods);
  put("status", params.status);
  put("from", params.from);
  put("to", params.to);
  put("q", params.q);
  put("counterpartyBankAccountId", params.counterpartyBankAccountId);
  put("hasAccount", params.hasAccount);
  put("page", Math.max(0, Math.trunc(params.page ?? 0)) || 0);
  put("size", settlementPageSize(params.size));
  putAll("sort", params.sort);
  return query;
}

/** Ödeme / tahsilat liste ucu. */
export function settlementListBase(type: SettlementType): string {
  return type === "PAYMENT" ? "/finance/payments" : "/finance/collections";
}

/** `GET /finance/payments?…` | `/finance/collections?…`. */
export function settlementListPath(
  type: SettlementType,
  params: SettlementListParams,
  activeCompanyId: string | null = null,
): string {
  const query = settlementListQuery(params, activeCompanyId).toString();
  return `${settlementListBase(type)}${query ? `?${query}` : ""}`;
}

/** `GET /finance/settlements/{id}`. */
export function settlementDetailPath(id: string): string {
  return `/finance/settlements/${path(id)}`;
}

/** `GET /settlements/open-invoices` (zorunlu: type, accountId, branchId, currency). */
export type OpenInvoiceParams = {
  type: SettlementType;
  accountId: string;
  branchId: string;
  currency: string;
  /** Düzenlemede kaydın kendi eşleşmeleri hariç tutulur. */
  excludeSettlementId?: string;
};

/** Zorunlu alanların hepsi dolu mu (değilse istek atılmaz). */
export function openInvoicesReady(params: OpenInvoiceParams | null | undefined): boolean {
  return !!params && !!params.type && !!params.accountId && !!params.branchId && !!params.currency;
}

export function openInvoicesPath(params: OpenInvoiceParams): string {
  return (
    "/finance/settlements/open-invoices" +
    buildQuery({
      type: params.type,
      accountId: params.accountId,
      branchId: params.branchId,
      currency: params.currency,
      excludeSettlementId: params.excludeSettlementId,
    })
  );
}

/** `GET /reports/daily` (§4.2; mevcut + 12.2a süzgeçleri). */
export type DailyReportParams = {
  type: SettlementType;
  /** ISO `YYYY-MM-DD` (yerel takvim, `toIsoDate`). */
  date: string;
  branchIds?: readonly string[];
  companyId?: string | null;
  fundAccountIds?: readonly string[];
  currency?: string;
  methods?: readonly DocumentPaymentMethod[];
  sort?: DailyReportSort;
};

export function dailyReportPath(
  params: DailyReportParams,
  activeCompanyId: string | null = null,
): string {
  return (
    "/finance/reports/daily" +
    buildQuery({
      type: params.type,
      date: params.date,
      branchIds: params.branchIds,
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      fundAccountIds: params.fundAccountIds,
      currency: params.currency,
      method: params.methods,
      sort: params.sort,
    })
  );
}

/** Carinin planları (`GET /payment-plans?accountId&statuses…&size=50`; şirket süzgeci yok). */
export function accountPlansPath(accountId: string, statuses: readonly PlanStatus[]): string {
  return (
    "/finance/payment-plans" +
    buildQuery({
      accountId,
      statuses,
      page: 0,
      size: ACCOUNT_PLANS_SIZE,
      sort: "dueDate",
    })
  );
}

/** Portföydeki müşteri çekleri (ciro; `GET /instruments?status=PORTFOLIO&direction=RECEIVED&kind=CHECK`). */
export function endorsableChecksPath(companyId: string | null): string {
  return (
    "/finance/instruments" +
    buildQuery({
      status: "PORTFOLIO",
      direction: "RECEIVED",
      kind: "CHECK",
      companyId,
      page: 0,
      size: ENDORSABLE_CHECKS_SIZE,
      sort: "dueDate",
    })
  );
}

/** `POST /finance/settlements/{id}/correct`. */
export function correctSettlementPath(id: string): string {
  return `${settlementDetailPath(id)}/correct`;
}

/** `POST /finance/settlements/{id}/reverse`. */
export function reverseSettlementPath(id: string): string {
  return `${settlementDetailPath(id)}/reverse`;
}

// ---------------------------------------------------------------------------------------------
// Sorgu anahtarları
// ---------------------------------------------------------------------------------------------

const ROOT = ["finance", "settlement-center"] as const;

/** Tüm anahtarlar ["finance", "settlement-center", …]; şirkete duyarlılarda çözülmüş `companyId`. */
export const settlementKeys = {
  all: ROOT,
  list: (type: SettlementType, q: SettlementListParams & { companyId: string | null }) =>
    [...ROOT, "list", type, q] as const,
  detail: (id: string) => [...ROOT, "detail", id] as const,
  openInvoices: (q: OpenInvoiceParams) => [...ROOT, "open-invoices", q] as const,
  daily: (q: DailyReportParams & { companyId: string | null }) => [...ROOT, "daily", q] as const,
  plans: (q: { accountId: string; statuses: readonly PlanStatus[] }) =>
    [...ROOT, "plans", q] as const,
  endorsable: (q: { companyId: string | null; currency: string | null }) =>
    [...ROOT, "endorsable", q] as const,
};

// ---------------------------------------------------------------------------------------------
// Okuma
// ---------------------------------------------------------------------------------------------

type Enabled = { enabled?: boolean };

/** Ödeme / tahsilat listesi (sunucu sayfalı); eski sayfa yenisi gelene dek görünür kalır (INP). */
export function useSettlementList(
  type: SettlementType,
  query: SettlementListParams,
  options: Enabled = {},
) {
  const active = useActiveCompanyId();
  const companyId = effectiveCompany(query.companyId, active);
  const resolved = { ...query, companyId };
  return useQuery({
    queryKey: settlementKeys.list(type, resolved),
    queryFn: () => apiGet<Page<SettlementListItem>>(settlementListPath(type, resolved)),
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

/** Ödeme / tahsilat detayı (404 SETTLEMENT_NOT_FOUND — personel carisi dahil). */
export function useSettlement(id: string | null | undefined, options: Enabled = {}) {
  return useQuery({
    queryKey: settlementKeys.detail(id ?? ""),
    queryFn: () => apiGet<SettlementDetail>(settlementDetailPath(String(id))),
    enabled: !!id && (options.enabled ?? true),
  });
}

/** Açık faturalar (eşleştirme tablosu); zorunlu alanlar boşsa ya da `enabled: false` iken istek yok. */
export function useOpenInvoices(params: OpenInvoiceParams | null, options: Enabled = {}) {
  const ready = openInvoicesReady(params);
  return useQuery({
    queryKey: settlementKeys.openInvoices(
      ready ? (params as OpenInvoiceParams) : ({} as OpenInvoiceParams),
    ),
    queryFn: () => apiGet<OpenInvoice[]>(openInvoicesPath(params as OpenInvoiceParams)),
    enabled: ready && (options.enabled ?? true),
  });
}

/** Günlük ödeme / tahsilat raporu (tarih boşken istek yok). */
export function useDailyReport(params: DailyReportParams, options: Enabled = {}) {
  const active = useActiveCompanyId();
  const companyId = effectiveCompany(params.companyId, active);
  const resolved = { ...params, companyId };
  return useQuery({
    queryKey: settlementKeys.daily(resolved),
    queryFn: () => apiGet<DailyReport>(dailyReportPath(resolved)),
    enabled: !!params.date && (options.enabled ?? true),
    placeholderData: keepPreviousData,
  });
}

/** Carinin açık planları (kalan borç paneli, plan sonrası modal). */
export function useAccountPlans(
  accountId: string | null | undefined,
  statuses: readonly PlanStatus[] = OPEN_PLAN_STATUSES,
  options: Enabled = {},
) {
  return useQuery({
    queryKey: settlementKeys.plans({ accountId: accountId ?? "", statuses }),
    queryFn: () => apiGet<Page<Plan>>(accountPlansPath(String(accountId), statuses)),
    enabled: !!accountId && (options.enabled ?? true),
  });
}

/**
 * Ciro edilebilir çekler: ödeyen şirketin portföyündeki müşteri çekleri. Sunucu para birimine göre
 * süzmez; `currency` verilirse istemcide süzülür (ciro kilidi).
 */
export function useEndorsableChecks(
  companyId: string | null | undefined,
  currency?: string | null,
  options: Enabled = {},
) {
  const active = useActiveCompanyId();
  const resolved = effectiveCompany(companyId, active);
  const wanted = currency || null;
  return useQuery({
    queryKey: settlementKeys.endorsable({ companyId: resolved, currency: wanted }),
    queryFn: async () => {
      const page = await apiGet<Page<Instrument>>(endorsableChecksPath(resolved));
      return wanted ? page.content.filter((i) => i.money.currency === wanted) : page.content;
    },
    enabled: options.enabled ?? true,
  });
}

/**
 * Excel için süzülmüş listenin tamamı: `size=500` ile sırayla en çok 4 sayfa (2000 satır, ZTO LIMIT
 * 2000). `truncated` = sunucuda 2000'den fazla satır var.
 */
export async function fetchAllSettlements(
  type: SettlementType,
  query: SettlementListParams,
  activeCompanyId: string | null = null,
): Promise<{ content: SettlementListItem[]; totalElements: number; truncated: boolean }> {
  const content: SettlementListItem[] = [];
  let totalElements = 0;
  let totalPages = 1;
  for (let page = 0; page < SETTLEMENT_EXPORT_MAX_PAGES && page < totalPages; page++) {
    const result = await apiGet<Page<SettlementListItem>>(
      settlementListPath(
        type,
        { ...query, page, size: SETTLEMENT_EXPORT_PAGE_SIZE },
        activeCompanyId,
      ),
    );
    content.push(...result.content);
    totalElements = result.totalElements;
    totalPages = result.totalPages;
    if (result.content.length < SETTLEMENT_EXPORT_PAGE_SIZE) break;
  }
  return { content, totalElements, truncated: totalElements > content.length };
}

// ---------------------------------------------------------------------------------------------
// Yazma
// ---------------------------------------------------------------------------------------------

function idempotency(key: string | undefined): Record<string, string> | undefined {
  return key ? { "Idempotency-Key": key } : undefined;
}

/** `POST /finance/payments|collections` (201 `Settlement`; 409 CONFIRMATION_REQUIRED). */
export function createSettlement(type: SettlementType, body: SettlementBody, key?: string) {
  return apiRequest<Settlement>("POST", settlementListBase(type), body, idempotency(key));
}

/** `POST /finance/settlements/{id}/correct` (201 yeni kayıt; eski kayıt kendi tarihiyle ters). */
export function correctSettlement(id: string, body: CorrectSettlementBody, key?: string) {
  return apiRequest<Settlement>("POST", correctSettlementPath(id), body, idempotency(key));
}

/** `POST /finance/settlements/{id}/reverse`. */
export function reverseSettlement(id: string, body: ReverseSettlementBody) {
  return apiRequest<Settlement>("POST", reverseSettlementPath(id), body);
}

type MutationOptions<TData, TVariables> = Omit<
  UseMutationOptions<TData, Error, TVariables>,
  "mutationFn"
>;

/**
 * Kayıt değişkenleri: anahtar modal açılışında `useIdempotencyKey(show)` ile üretilir; 409 onayından
 * sonra aynı anahtarla `confirmWarnings: true` gönderilir (12.2 deseni).
 */
export type CreateSettlementVariables = { body: SettlementBody; idempotencyKey: string };
export type CorrectSettlementVariables = {
  id: string;
  body: CorrectSettlementBody;
  idempotencyKey: string;
};
export type ReverseSettlementVariables = { id: string; body: ReverseSettlementBody };

export function useCreateSettlement(
  type: SettlementType,
  options: MutationOptions<Settlement, CreateSettlementVariables> = {},
) {
  return useFinanceMutation(
    ({ body, idempotencyKey }: CreateSettlementVariables) =>
      createSettlement(type, body, idempotencyKey),
    options,
  );
}

export function useCorrectSettlement(
  options: MutationOptions<Settlement, CorrectSettlementVariables> = {},
) {
  return useFinanceMutation(
    ({ id, body, idempotencyKey }: CorrectSettlementVariables) =>
      correctSettlement(id, body, idempotencyKey),
    options,
  );
}

export function useReverseSettlement(
  options: MutationOptions<Settlement, ReverseSettlementVariables> = {},
) {
  return useFinanceMutation(
    ({ id, body }: ReverseSettlementVariables) => reverseSettlement(id, body),
    options,
  );
}
