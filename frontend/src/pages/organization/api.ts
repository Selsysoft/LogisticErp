import { QueryClient, useQuery } from "@tanstack/react-query";
import { apiGet } from "../../api/client";
import { useAuthStore } from "../../auth/authStore";
import type { Fund } from "../finance/types";
import type {
  Branch,
  BranchGroup,
  Company,
  CompanyEDocumentSettings,
  DocumentSeries,
  PageResponse,
} from "./types";

/**
 * Organization uçları için sorgu yardımcıları (12.1a §5.1, §6.1). Yardımcı tipler type alias'tır
 * (sözleşme testi `pages/**` altındaki dışa aktarılan interface'leri API tipi sayar).
 */

/** Liste süzgeci: `active` yok = tümü (aktif + pasif), `companyId` yok = tüm şirketler. */
export type OrganizationListFilter = { active?: boolean; companyId?: string | null };

/** Sorgu anahtarı önekleri; şube/grup/şirket mutasyonları hepsini geçersizler. */
export const ORGANIZATION_KEYS = {
  branches: ["branches"],
  branchTree: ["branch-tree"],
  branchGroups: ["branch-groups"],
  companies: ["companies"],
} as const;

function listQuery(base: string, filter: OrganizationListFilter, sort?: string): string {
  const params = [`size=200`];
  if (sort) params.push(`sort=${sort}`);
  if (filter.active !== undefined) params.push(`active=${filter.active}`);
  if (filter.companyId) params.push(`companyId=${encodeURIComponent(filter.companyId)}`);
  return `${base}?${params.join("&")}`;
}

/** GET /organization/branches (iş yerleri), ada göre; ZTO WorkPlace/Index istemci tablosu. */
export function branchListPath(filter: OrganizationListFilter = {}): string {
  return listQuery("/organization/branches", filter, "name");
}

/** GET /organization/branch-groups (ZTO "Şube"), ada göre. */
export function branchGroupListPath(filter: OrganizationListFilter = {}): string {
  return listQuery("/organization/branch-groups", filter, "name");
}

/** GET /organization/companies; sıra sunucudan (varsayılan önce, sonra kısa ad). */
export function companyListPath(filter: Pick<OrganizationListFilter, "active"> = {}): string {
  return listQuery("/organization/companies", filter);
}

function useTenantKey() {
  const me = useAuthStore((state) => state.me);
  return [me?.tenant, me?.id] as const;
}

export function useBranchList(filter: OrganizationListFilter = {}) {
  const [tenant, user] = useTenantKey();
  return useQuery({
    queryKey: ["branches", "list", tenant, user, filter.active ?? null, filter.companyId ?? null],
    queryFn: () => apiGet<PageResponse<Branch>>(branchListPath(filter)),
    select: (page) => page.content,
  });
}

export function useBranch(id: string | undefined) {
  return useQuery({
    queryKey: ["branches", "detail", id],
    queryFn: () => apiGet<Branch>(`/organization/branches/${id}`),
    enabled: !!id,
  });
}

export function useBranchGroups(filter: OrganizationListFilter = {}, enabled = true) {
  const [tenant, user] = useTenantKey();
  return useQuery({
    queryKey: [
      "branch-groups",
      "list",
      tenant,
      user,
      filter.active ?? null,
      filter.companyId ?? null,
    ],
    queryFn: () => apiGet<PageResponse<BranchGroup>>(branchGroupListPath(filter)),
    select: (page) => page.content,
    enabled,
  });
}

export function useBranchGroup(id: string | undefined) {
  return useQuery({
    queryKey: ["branch-groups", "detail", id],
    queryFn: () => apiGet<BranchGroup>(`/organization/branch-groups/${id}`),
    enabled: !!id,
  });
}

export function useCompanies(filter: Pick<OrganizationListFilter, "active"> = {}, enabled = true) {
  const [tenant, user] = useTenantKey();
  return useQuery({
    queryKey: ["companies", "list", tenant, user, filter.active ?? null],
    queryFn: () => apiGet<PageResponse<Company>>(companyListPath(filter)),
    select: (page) => page.content,
    enabled,
  });
}

export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: ["companies", "detail", id],
    queryFn: () => apiGet<Company>(`/organization/companies/${id}`),
    enabled: !!id,
  });
}

export function useCompanyEDocumentSettings(id: string | undefined) {
  return useQuery({
    queryKey: ["companies", "edocument-settings", id],
    queryFn: () =>
      apiGet<CompanyEDocumentSettings>(`/organization/companies/${id}/edocument-settings`),
    enabled: !!id,
  });
}

export function useDocumentSeries(id: string | undefined) {
  return useQuery({
    queryKey: ["companies", "document-series", id],
    queryFn: () => apiGet<DocumentSeries[]>(`/organization/companies/${id}/document-series`),
    enabled: !!id,
  });
}

/** Şirketin banka hesapları ("Varsayılan Banka Hesabı" seçimi; FINANCE_VIEW gerekir). */
export function useCompanyBankFunds(companyId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["finance", "funds", "company", companyId],
    queryFn: () => apiGet<Fund[]>(`/finance/funds?companyId=${encodeURIComponent(companyId!)}`),
    select: (funds) => funds.filter((fund) => fund.kind === "BANK"),
    enabled: enabled && !!companyId,
  });
}

/**
 * Şube, şube grubu ya da şirket değişince ilgili tüm sorgular (MUI `["branches"]` dahil) ve
 * ZTO seçim bileşenlerinin ağacı geçersizlenir. Şirket CRUD'unda `/auth/me` şirket listesi de
 * yenilenir (aktif şirket seçici, form varsayılanı).
 */
export async function invalidateOrganization(
  client: QueryClient,
  options: { reloadMe?: boolean } = {},
): Promise<void> {
  await Promise.all(
    Object.values(ORGANIZATION_KEYS).map((queryKey) => client.invalidateQueries({ queryKey })),
  );
  if (options.reloadMe) {
    await useAuthStore.getState().reloadMe();
  }
}
