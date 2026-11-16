import { keepPreviousData, useQuery, type UseMutationOptions } from "@tanstack/react-query";
import { apiGet, apiRequest } from "../../api/client";
import { useActiveCompanyId } from "../../auth/companyStore";
import { buildQuery, effectiveCompany, useFinanceMutation } from "./accountApi";
import type {
  CheckBook,
  CheckBookBody,
  CheckBookCreated,
  CheckLeaf,
  CheckLeafStatus,
  CheckLeafVoidBody,
  InstrumentCustodyBody,
  InstrumentDetail,
  InstrumentDirection,
  InstrumentKind,
  InstrumentListItem,
  InstrumentMovement,
  InstrumentNumberCheck,
  InstrumentStatus,
  InstrumentTransitionBody,
  InstrumentUpdateBody,
  NoteType,
  Page,
} from "./types";

/*
 * 12.3 çek / senet / çek koçanı istemcisi (12.3_TASARIM §4.2, §5.2; `settlementApi.ts` kalıbı). Sorgu
 * anahtarları ["finance", "instrument-center", …] önekli: MUI ["finance", "instruments", …] ile
 * konumsal çakışma yok; mutasyonlar ["finance"]'ı geçersizler (`useFinanceMutation`). Şirkete duyarlı
 * sorgularda `companyId`: undefined → aktif şirket, null → konsolide (accountApi kuralı).
 * Liste ekranları istemci kipindedir (OK-12.3-15): `fetchAllInstruments` en çok 5.000 satır getirir.
 */

// ---------------------------------------------------------------------------------------------
// Sınırlar (sunucu doğrulamasıyla aynı)
// ---------------------------------------------------------------------------------------------

/** `GET /instruments` `size` 1–500 (varsayılan 50). */
export const INSTRUMENT_LIST_MAX_SIZE = 500;
export const INSTRUMENT_LIST_DEFAULT_SIZE = 50;
/** İstemci kipi: 500'lük en çok 10 sayfa = 5.000 satır (OK-12.3-15). */
export const INSTRUMENT_FETCH_MAX_PAGES = 10;
/** `GET /check-leaves` `size` 1–1000; istemci kipi en çok 5 sayfa. */
export const CHECK_LEAF_MAX_SIZE = 1000;
export const CHECK_LEAF_FETCH_MAX_PAGES = 5;
/** Koçan yaprağı araması `number.length ≥ 3` iken (`/check-leaves/lookup`, ≤ 5 sonuç). */
export const CHECK_LEAF_LOOKUP_MIN_LENGTH = 3;

const path = encodeURIComponent;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

// ---------------------------------------------------------------------------------------------
// Sorgu yolları (saf)
// ---------------------------------------------------------------------------------------------

/** `GET /finance/instruments` süzgeçleri (§4.2). */
export type InstrumentListParams = {
  /** undefined → aktif şirket; null → konsolide. */
  companyId?: string | null;
  kind?: InstrumentKind;
  direction?: InstrumentDirection;
  /** Tekrarlı `status`; boş = hepsi. */
  statuses?: readonly InstrumentStatus[];
  accountId?: string;
  /** ISO `YYYY-MM-DD` (vade aralığı). */
  dueFrom?: string;
  dueTo?: string;
  checkBookId?: string;
  noteType?: NoteType;
  /** true → `PORTFOLIO + RECEIVED + CHECK`. */
  endorsable?: boolean;
  /** Numara, banka, cari/keşideci adı, açıklama (1–100). */
  q?: string;
  branchIds?: readonly string[];
  /** 0 tabanlı. */
  page?: number;
  /** 1–500. */
  size?: number;
};

/** Sayfa boyutunu 1–500'e kırpar (geçersiz → varsayılan 50). */
export function instrumentPageSize(size: number | undefined): number {
  if (size === undefined || !Number.isFinite(size)) return INSTRUMENT_LIST_DEFAULT_SIZE;
  return clamp(size, 1, INSTRUMENT_LIST_MAX_SIZE);
}

/**
 * Liste sorgu parametreleri: boş/undefined alan yazılmaz, çoklu alanlar tekrar eder
 * (`status=A&status=B`), `page`/`size` her zaman yazılır. `companyId` `activeCompanyId` ile çözülür.
 */
export function instrumentListQuery(
  params: InstrumentListParams,
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
  put("kind", params.kind);
  put("direction", params.direction);
  putAll("status", params.statuses);
  put("accountId", params.accountId);
  put("dueFrom", params.dueFrom);
  put("dueTo", params.dueTo);
  put("checkBookId", params.checkBookId);
  put("noteType", params.noteType);
  put("endorsable", params.endorsable);
  put("q", params.q);
  put("companyId", effectiveCompany(params.companyId, activeCompanyId));
  putAll("branchIds", params.branchIds);
  put("page", Math.max(0, Math.trunc(params.page ?? 0)) || 0);
  put("size", instrumentPageSize(params.size));
  return query;
}

/** `GET /finance/instruments?…`. */
export function instrumentListPath(
  params: InstrumentListParams,
  activeCompanyId: string | null = null,
): string {
  return `/finance/instruments?${instrumentListQuery(params, activeCompanyId).toString()}`;
}

/** `GET /finance/instruments/{id}` (PATCH aynı yol). */
export function instrumentDetailPath(id: string): string {
  return `/finance/instruments/${path(id)}`;
}

export function instrumentMovementsPath(id: string): string {
  return `${instrumentDetailPath(id)}/movements`;
}

export function instrumentTransitionPath(id: string): string {
  return `${instrumentDetailPath(id)}/transition`;
}

export function instrumentCustodyPath(id: string): string {
  return `${instrumentDetailPath(id)}/custody`;
}

/** `GET /instruments/check-number` (çek numarası ön denetimi; `companyId` zorunlu). */
export type CheckNumberParams = {
  /** undefined → aktif şirket; çözülen şirket yoksa istek atılmaz. */
  companyId?: string | null;
  kind?: InstrumentKind;
  direction: InstrumentDirection;
  number: string;
  bankName?: string;
  /** Düzenlemede kaydın kendisi. */
  excludeId?: string;
};

export function checkNumberPath(params: CheckNumberParams, companyId: string): string {
  return (
    "/finance/instruments/check-number" +
    buildQuery({
      companyId,
      kind: params.kind ?? "CHECK",
      direction: params.direction,
      number: params.number.trim(),
      bankName: params.bankName?.trim(),
      excludeId: params.excludeId,
    })
  );
}

/** `GET /check-books` süzgeçleri. */
export type CheckBookParams = {
  companyId?: string | null;
  fundAccountId?: string;
  branchIds?: readonly string[];
};

export function checkBookListPath(params: CheckBookParams, activeCompanyId: string | null = null) {
  return (
    "/finance/check-books" +
    buildQuery({
      fundAccountId: params.fundAccountId,
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      branchIds: params.branchIds,
    })
  );
}

/** `GET /check-leaves` süzgeçleri. */
export type CheckLeafParams = {
  companyId?: string | null;
  fundAccountId?: string;
  checkBookId?: string;
  status?: CheckLeafStatus;
  /** Seri (ilike). */
  serial?: string;
  page?: number;
  /** 1–1000 (varsayılan 1000). */
  size?: number;
};

export function checkLeafListPath(params: CheckLeafParams, activeCompanyId: string | null = null) {
  return (
    "/finance/check-leaves" +
    buildQuery({
      fundAccountId: params.fundAccountId,
      checkBookId: params.checkBookId,
      status: params.status,
      serial: params.serial?.trim(),
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      page: Math.max(0, Math.trunc(params.page ?? 0)) || 0,
      size:
        params.size === undefined || !Number.isFinite(params.size)
          ? CHECK_LEAF_MAX_SIZE
          : clamp(params.size, 1, CHECK_LEAF_MAX_SIZE),
    })
  );
}

/** `GET /check-leaves/lookup` (1–7 rakam; baştaki sıfırlar korunur). */
export function checkLeafLookupPath(
  number: string,
  fundAccountId: string | null | undefined,
  companyId: string | null,
): string {
  return (
    "/finance/check-leaves/lookup" +
    buildQuery({ number: number.trim(), fundAccountId: fundAccountId || undefined, companyId })
  );
}

/** Yaprak araması yapılır mı: yalnız rakam, 3–7 hane. */
export function leafLookupReady(number: string | null | undefined): boolean {
  const text = (number ?? "").trim();
  return text.length >= CHECK_LEAF_LOOKUP_MIN_LENGTH && /^\d{1,7}$/.test(text);
}

export function checkLeafVoidPath(id: string): string {
  return `/finance/check-leaves/${path(id)}/void`;
}

export function checkLeafPath(id: string): string {
  return `/finance/check-leaves/${path(id)}`;
}

// ---------------------------------------------------------------------------------------------
// Sorgu anahtarları
// ---------------------------------------------------------------------------------------------

const ROOT = ["finance", "instrument-center"] as const;

/** Tüm anahtarlar ["finance", "instrument-center", …]; şirkete duyarlılarda çözülmüş `companyId`. */
export const instrumentKeys = {
  all: ROOT,
  list: (q: InstrumentListParams & { companyId: string | null }) => [...ROOT, "list", q] as const,
  detail: (id: string) => [...ROOT, "detail", id] as const,
  movements: (id: string) => [...ROOT, "movements", id] as const,
  checkNumber: (q: CheckNumberParams & { companyId: string | null }) =>
    [...ROOT, "check-number", q] as const,
  checkBooks: (q: CheckBookParams & { companyId: string | null }) =>
    [...ROOT, "check-books", q] as const,
  checkLeaves: (q: CheckLeafParams & { companyId: string | null }) =>
    [...ROOT, "check-leaves", q] as const,
  leafLookup: (q: { number: string; fundAccountId: string | null; companyId: string | null }) =>
    [...ROOT, "leaf-lookup", q] as const,
};

// ---------------------------------------------------------------------------------------------
// İstemci kipi toplu okuma
// ---------------------------------------------------------------------------------------------

/** İstemci kipi sonucu: `truncated` = sunucuda sınırdan fazla satır var (ZTO alert'i gösterilir). */
export type FetchAllResult<T> = { rows: T[]; totalElements: number; truncated: boolean };

async function fetchPages<T>(
  maxPages: number,
  pageSize: number,
  pathOf: (page: number) => string,
): Promise<FetchAllResult<T>> {
  const rows: T[] = [];
  let totalElements = 0;
  let totalPages = 1;
  for (let page = 0; page < maxPages && page < totalPages; page++) {
    const result = await apiGet<Page<T>>(pathOf(page));
    rows.push(...result.content);
    totalElements = result.totalElements;
    totalPages = result.totalPages;
    if (result.content.length < pageSize) break;
  }
  return { rows, totalElements, truncated: totalElements > rows.length };
}

/**
 * Süzülmüş çek/senet listesinin tamamı: `size=500` ile sırayla en çok 10 sayfa (5.000 satır).
 * Sınır aşılırsa `truncated: true`; sayfa "İlk 5.000 kayıt gösteriliyor." uyarısını yazar.
 */
export function fetchAllInstruments(
  query: InstrumentListParams,
  activeCompanyId: string | null = null,
): Promise<FetchAllResult<InstrumentListItem>> {
  return fetchPages<InstrumentListItem>(
    INSTRUMENT_FETCH_MAX_PAGES,
    INSTRUMENT_LIST_MAX_SIZE,
    (page) =>
      instrumentListPath({ ...query, page, size: INSTRUMENT_LIST_MAX_SIZE }, activeCompanyId),
  );
}

/** Koçan yapraklarının tamamı: `size=1000` ile en çok 5 sayfa. */
export function fetchAllCheckLeaves(
  query: CheckLeafParams,
  activeCompanyId: string | null = null,
): Promise<FetchAllResult<CheckLeaf>> {
  return fetchPages<CheckLeaf>(CHECK_LEAF_FETCH_MAX_PAGES, CHECK_LEAF_MAX_SIZE, (page) =>
    checkLeafListPath({ ...query, page, size: CHECK_LEAF_MAX_SIZE }, activeCompanyId),
  );
}

// ---------------------------------------------------------------------------------------------
// Okuma
// ---------------------------------------------------------------------------------------------

type Enabled = { enabled?: boolean };

/**
 * Çek/senet listesi (istemci kipi, `fetchAllInstruments`; `page`/`size` yok sayılır). Eski sonuç
 * yenisi gelene dek görünür kalır (INP).
 */
export function useInstrumentList(query: InstrumentListParams, options: Enabled = {}) {
  const active = useActiveCompanyId();
  const companyId = effectiveCompany(query.companyId, active);
  const resolved = { ...query, companyId, page: undefined, size: undefined };
  return useQuery({
    queryKey: instrumentKeys.list(resolved),
    queryFn: () => fetchAllInstruments(resolved),
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

/** Tekil çek/senet + hareketleri (404 INSTRUMENT_NOT_FOUND — personel carisi dahil). */
export function useInstrument(id: string | null | undefined, options: Enabled = {}) {
  return useQuery({
    queryKey: instrumentKeys.detail(id ?? ""),
    queryFn: () => apiGet<InstrumentDetail>(instrumentDetailPath(String(id))),
    enabled: !!id && (options.enabled ?? true),
  });
}

/** Hareket geçmişi (fon adlarıyla). */
export function useInstrumentMovements(id: string | null | undefined, options: Enabled = {}) {
  return useQuery({
    queryKey: instrumentKeys.movements(id ?? ""),
    queryFn: () => apiGet<InstrumentMovement[]>(instrumentMovementsPath(String(id))),
    enabled: !!id && (options.enabled ?? true),
  });
}

/**
 * Çek numarası ön denetimi. Debounce çağıranın işidir; numara boşken ya da şirket çözülemezken
 * (konsolide) istek atılmaz.
 */
export function useCheckNumber(params: CheckNumberParams, options: Enabled = {}) {
  const active = useActiveCompanyId();
  const companyId = effectiveCompany(params.companyId, active);
  const number = params.number.trim();
  return useQuery({
    queryKey: instrumentKeys.checkNumber({ ...params, number, companyId }),
    queryFn: () =>
      apiGet<InstrumentNumberCheck>(checkNumberPath({ ...params, number }, String(companyId))),
    enabled: !!companyId && number !== "" && (options.enabled ?? true),
  });
}

/** Çek koçanları (sayımlarla). */
export function useCheckBooks(params: CheckBookParams = {}, options: Enabled = {}) {
  const active = useActiveCompanyId();
  const companyId = effectiveCompany(params.companyId, active);
  const resolved = { ...params, companyId };
  return useQuery({
    queryKey: instrumentKeys.checkBooks(resolved),
    queryFn: () => apiGet<CheckBook[]>(checkBookListPath(resolved)),
    enabled: options.enabled ?? true,
  });
}

/** Koçan yaprakları (istemci kipi, `fetchAllCheckLeaves`). */
export function useCheckLeaves(params: CheckLeafParams = {}, options: Enabled = {}) {
  const active = useActiveCompanyId();
  const companyId = effectiveCompany(params.companyId, active);
  const resolved = { ...params, companyId, page: undefined, size: undefined };
  return useQuery({
    queryKey: instrumentKeys.checkLeaves(resolved),
    queryFn: () => fetchAllCheckLeaves(resolved),
    enabled: options.enabled ?? true,
  });
}

/**
 * Elle girilen çek numarasının koçan karşılığı (≤ 5 yaprak, `number like :n%`). `number` 3–7 rakam
 * iken etkin; debounce çağıranın işidir (`useCheckLeafGuard`).
 */
export function useCheckLeafLookup(
  number: string | null | undefined,
  fundAccountId: string | null | undefined,
  options: Enabled & { companyId?: string | null } = {},
) {
  const active = useActiveCompanyId();
  const companyId = effectiveCompany(options.companyId, active);
  const text = (number ?? "").trim();
  const fund = fundAccountId || null;
  return useQuery({
    queryKey: instrumentKeys.leafLookup({ number: text, fundAccountId: fund, companyId }),
    queryFn: () => apiGet<CheckLeaf[]>(checkLeafLookupPath(text, fund, companyId)),
    enabled: leafLookupReady(text) && (options.enabled ?? true),
  });
}

// ---------------------------------------------------------------------------------------------
// Yazma
// ---------------------------------------------------------------------------------------------

export function transitionInstrument(id: string, body: InstrumentTransitionBody) {
  return apiRequest<InstrumentListItem>("POST", instrumentTransitionPath(id), body);
}

export function updateInstrument(id: string, body: InstrumentUpdateBody) {
  return apiRequest<InstrumentListItem>("PATCH", instrumentDetailPath(id), body);
}

export function moveCustody(id: string, body: InstrumentCustodyBody) {
  return apiRequest<InstrumentListItem>("PUT", instrumentCustodyPath(id), body);
}

export function createCheckBook(body: CheckBookBody) {
  return apiRequest<CheckBookCreated>("POST", "/finance/check-books", body);
}

export function voidCheckLeaf(id: string, body: CheckLeafVoidBody = {}) {
  return apiRequest<CheckLeaf>("POST", checkLeafVoidPath(id), body);
}

export function deleteCheckLeaf(id: string) {
  return apiRequest<void>("DELETE", checkLeafPath(id));
}

type MutationOptions<TData, TVariables> = Omit<
  UseMutationOptions<TData, Error, TVariables>,
  "mutationFn"
>;

export type InstrumentTransitionVariables = { id: string; body: InstrumentTransitionBody };
export type UpdateInstrumentVariables = { id: string; body: InstrumentUpdateBody };
export type MoveCustodyVariables = { id: string; body: InstrumentCustodyBody };
export type VoidCheckLeafVariables = { id: string; body?: CheckLeafVoidBody };

export function useInstrumentTransition(
  options: MutationOptions<InstrumentListItem, InstrumentTransitionVariables> = {},
) {
  return useFinanceMutation(
    ({ id, body }: InstrumentTransitionVariables) => transitionInstrument(id, body),
    options,
  );
}

export function useUpdateInstrument(
  options: MutationOptions<InstrumentListItem, UpdateInstrumentVariables> = {},
) {
  return useFinanceMutation(
    ({ id, body }: UpdateInstrumentVariables) => updateInstrument(id, body),
    options,
  );
}

export function useMoveCustody(
  options: MutationOptions<InstrumentListItem, MoveCustodyVariables> = {},
) {
  return useFinanceMutation(({ id, body }: MoveCustodyVariables) => moveCustody(id, body), options);
}

export function useCreateCheckBook(options: MutationOptions<CheckBookCreated, CheckBookBody> = {}) {
  return useFinanceMutation((body: CheckBookBody) => createCheckBook(body), options);
}

export function useVoidCheckLeaf(options: MutationOptions<CheckLeaf, VoidCheckLeafVariables> = {}) {
  return useFinanceMutation(
    ({ id, body }: VoidCheckLeafVariables) => voidCheckLeaf(id, body),
    options,
  );
}

export function useDeleteCheckLeaf(options: MutationOptions<void, string> = {}) {
  return useFinanceMutation((id: string) => deleteCheckLeaf(id), options);
}
