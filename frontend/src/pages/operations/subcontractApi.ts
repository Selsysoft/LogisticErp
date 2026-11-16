import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { apiGet, apiRequest } from "../../api/client";
import { useActiveCompanyId } from "../../auth/companyStore";
import { buildQuery, effectiveCompany } from "../finance/accountApi";
import type {
  ReverseCostRequest,
  SaveSubcontractCostRequest,
  SubcontractCarrierDetail,
  SubcontractCostRow,
  SubcontractSummary,
} from "./types";

/*
 * 12.7 Sevk Nakliye Masrafları (taşeron gideri) istemcisi (12.7_TASARIM §4.2, §5.2). Okuma
 * SHIPMENT_VIEW, yazma SHIPMENT_INVOICE (OK-12.7-16). Anahtarlar ["shipment", "subcontract-costs", …];
 * mutasyonlar ["shipment"]'ı (taşeron + MUI ["shipment", "costs", id] + kârlılık) ve ["finance"]'ı
 * (taşeron gideri cariye hemen yazılır, Y6) geçersizler. `companyId`: undefined → aktif şirket,
 * null → konsolide.
 */

/** `days` 1–365 (vars. 150; ZTO STI sabit 150, CSD süzgeci). */
export const SUBCONTRACT_DAYS_DEFAULT = 150;
export const SUBCONTRACT_DAYS_MAX = 365;

const segment = encodeURIComponent;

/** Gün süzgecini 1–365'e kırpar (geçersiz → 150). */
export function subcontractDays(days: number | null | undefined): number {
  if (days === undefined || days === null || !Number.isFinite(days)) {
    return SUBCONTRACT_DAYS_DEFAULT;
  }
  return Math.min(SUBCONTRACT_DAYS_MAX, Math.max(1, Math.trunc(days)));
}

export type SubcontractParams = {
  days?: number;
  /** undefined → aktif şirket; null → konsolide. */
  companyId?: string | null;
  branchIds?: readonly string[];
};

// ---------------------------------------------------------------------------------------------
// Sorgu yolları (saf)
// ---------------------------------------------------------------------------------------------

/** `GET /shipment/subcontract-costs/summary?days&companyId&branchIds`. */
export function subcontractSummaryPath(
  params: SubcontractParams = {},
  activeCompanyId: string | null = null,
): string {
  return (
    "/shipment/subcontract-costs/summary" +
    buildQuery({
      days: subcontractDays(params.days),
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      branchIds: params.branchIds,
    })
  );
}

/** `GET /shipment/subcontract-costs?carrierAccountId&days&companyId&branchIds`. */
export function subcontractDetailPath(
  carrierAccountId: string,
  params: SubcontractParams = {},
  activeCompanyId: string | null = null,
): string {
  return (
    "/shipment/subcontract-costs" +
    buildQuery({
      carrierAccountId,
      days: subcontractDays(params.days),
      companyId: effectiveCompany(params.companyId, activeCompanyId),
      branchIds: params.branchIds,
    })
  );
}

/** `PUT /shipment/shipments/{id}/legs/{legId}/subcontract-cost` (kaydet + cariye işle). */
export function subcontractCostSavePath(shipmentId: string, legId: string): string {
  return `/shipment/shipments/${segment(shipmentId)}/legs/${segment(legId)}/subcontract-cost`;
}

/** `POST /shipment/subcontract-costs/{costId}/reverse`. */
export function subcontractCostReversePath(costId: string): string {
  return `/shipment/subcontract-costs/${segment(costId)}/reverse`;
}

/** `DELETE /shipment/subcontract-costs/{costId}` (yalnız OPEN; Rev 1 F6). */
export function subcontractCostDeletePath(costId: string): string {
  return `/shipment/subcontract-costs/${segment(costId)}`;
}

// ---------------------------------------------------------------------------------------------
// Anahtarlar ve okuma
// ---------------------------------------------------------------------------------------------

const ROOT = ["shipment", "subcontract-costs"] as const;

type Resolved = { days: number; companyId: string | null; branchIds: readonly string[] | null };

export const subcontractKeys = {
  all: ROOT,
  summary: (q: Resolved) => [...ROOT, "summary", q] as const,
  detail: (accountId: string, q: Resolved) => [...ROOT, "detail", accountId, q] as const,
};

function resolve(params: SubcontractParams, active: string | null): Resolved {
  return {
    days: subcontractDays(params.days),
    companyId: effectiveCompany(params.companyId, active),
    branchIds: params.branchIds && params.branchIds.length > 0 ? params.branchIds : null,
  };
}

type Enabled = { enabled?: boolean };

/** STI: taşeron firma özeti. */
export function useSubcontractSummary(params: SubcontractParams = {}, options: Enabled = {}) {
  const resolved = resolve(params, useActiveCompanyId());
  return useQuery({
    queryKey: subcontractKeys.summary(resolved),
    queryFn: () =>
      apiGet<SubcontractSummary>(
        subcontractSummaryPath({ ...resolved, branchIds: resolved.branchIds ?? undefined }),
      ),
    enabled: options.enabled ?? true,
    placeholderData: keepPreviousData,
  });
}

/** CSD: firmanın etap/gider satırları; `accountId` yoksa istek yok. */
export function useSubcontractDetail(
  accountId: string | null | undefined,
  params: SubcontractParams = {},
  options: Enabled = {},
) {
  const resolved = resolve(params, useActiveCompanyId());
  return useQuery({
    queryKey: subcontractKeys.detail(accountId ?? "", resolved),
    queryFn: () =>
      apiGet<SubcontractCarrierDetail>(
        subcontractDetailPath(String(accountId), {
          ...resolved,
          branchIds: resolved.branchIds ?? undefined,
        }),
      ),
    enabled: !!accountId && (options.enabled ?? true),
    placeholderData: keepPreviousData,
  });
}

// ---------------------------------------------------------------------------------------------
// Yazma
// ---------------------------------------------------------------------------------------------

type MutationOptions<TData, TVariables> = Omit<
  UseMutationOptions<TData, Error, TVariables>,
  "mutationFn"
>;

/** Başarıda ["shipment"] ve ["finance"] geçersizlenir; ardından çağıranın `onSuccess`'i. */
function useSubcontractMutation<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options: MutationOptions<TData, TVariables>,
) {
  const client = useQueryClient();
  return useMutation<TData, Error, TVariables>({
    ...options,
    mutationFn,
    onSuccess: async (data, variables, context, ...rest) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["shipment"] }),
        client.invalidateQueries({ queryKey: ["finance"] }),
      ]);
      await options.onSuccess?.(data, variables, context, ...rest);
    },
  });
}

export function saveSubcontractCost(
  shipmentId: string,
  legId: string,
  body: SaveSubcontractCostRequest,
) {
  return apiRequest<SubcontractCostRow>("PUT", subcontractCostSavePath(shipmentId, legId), body);
}

export function reverseSubcontractCost(costId: string, body: ReverseCostRequest) {
  return apiRequest<void>("POST", subcontractCostReversePath(costId), body);
}

export function deleteSubcontractCost(costId: string) {
  return apiRequest<void>("DELETE", subcontractCostDeletePath(costId));
}

export type SaveSubcontractCostVariables = {
  shipmentId: string;
  legId: string;
  body: SaveSubcontractCostRequest;
};

/** Kaydet + cariye işle (aynı değerle tekrar no-op; farklı değerde ters kayıt + yeni satır). */
export function useSaveSubcontractCost(
  options: MutationOptions<SubcontractCostRow, SaveSubcontractCostVariables> = {},
) {
  return useSubcontractMutation(
    ({ shipmentId, legId, body }: SaveSubcontractCostVariables) =>
      saveSubcontractCost(shipmentId, legId, body),
    options,
  );
}

export type ReverseSubcontractCostVariables = { costId: string; body: ReverseCostRequest };

/** POSTED gideri ters çevirir (204; ikinci çağrı 204). OPEN'da 409 COST_NOT_POSTED. */
export function useReverseSubcontractCost(
  options: MutationOptions<void, ReverseSubcontractCostVariables> = {},
) {
  return useSubcontractMutation(
    ({ costId, body }: ReverseSubcontractCostVariables) => reverseSubcontractCost(costId, body),
    options,
  );
}

/** OPEN taşeron giderini siler (SHIPMENT_INVOICE; POSTED'da 409 COST_POSTED). */
export function useDeleteSubcontractCost(options: MutationOptions<void, string> = {}) {
  return useSubcontractMutation((costId: string) => deleteSubcontractCost(costId), options);
}
