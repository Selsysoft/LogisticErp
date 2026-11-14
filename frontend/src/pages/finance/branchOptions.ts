import type { Branch } from "./types";

/**
 * MUI formlarının iş yeri ("Şube") seçenekleri (12.1a §6.13). `GET /organization/branches` pasifleri
 * de döndürür (ad çözümü için); yeni kayıtta yalnız aktifler seçilebilir. Düzenlenen kaydın mevcut
 * iş yeri (`keepId`) pasif ya da başka şirketin olsa da listede kalır.
 */

export type BranchOption = { value: string; label: string };

export type BranchOptionsInput = {
  /** Düzenlenen kaydın iş yeri; süzgeçlerden bağımsız korunur. */
  keepId?: string | null;
  /** Aktif şirket; null/undefined = tüm şirketler (konsolide). */
  companyId?: string | null;
  /** ≥2 aktif şirket: etiket "Şirket › İş yeri". */
  multiCompany: boolean;
};

/** Eski önbellek ya da eski sunucu yanıtında `active` yoksa iş yeri aktif sayılır. */
function isActive(branch: Branch): boolean {
  return branch.active !== false;
}

export function branchLabel(branch: Branch, multiCompany: boolean): string {
  return multiCompany && branch.companyName
    ? `${branch.companyName} › ${branch.name}`
    : branch.name;
}

export function branchOptions(branches: Branch[], input: BranchOptionsInput): BranchOption[] {
  const { keepId, companyId, multiCompany } = input;
  return branches
    .filter(
      (branch) =>
        branch.id === keepId ||
        (isActive(branch) && (!companyId || branch.companyId === companyId)),
    )
    .map((branch) => ({ value: branch.id, label: branchLabel(branch, multiCompany) }));
}

/** Seçili iş yerinin şirketi (fon listesini şirkete göre süzmek için); bilinmiyorsa undefined. */
export function companyOfBranch(
  branches: Branch[] | undefined,
  branchId: string | null | undefined,
) {
  return branchId ? branches?.find((branch) => branch.id === branchId)?.companyId : undefined;
}

/** Varsayılan iş yeri yalnız seçeneklerde varsa önerilir (pasif ya da kapsam dışıysa boş kalır). */
export function defaultBranchValue(
  options: BranchOption[],
  defaultBranchId: string | null | undefined,
): string {
  return defaultBranchId && options.some((option) => option.value === defaultBranchId)
    ? defaultBranchId
    : "";
}

/**
 * Fonlar iş yerinin şirketine göre (12.1a §6.13): başka şirketin kasasına/bankasına kayıt sunucuda
 * 422 COMPANY_MISMATCH'tir, bu yüzden seçenek olarak da sunulmaz. Şirket bilinmiyorsa (iş yeri henüz
 * seçilmedi) tüm fonlar. Şirketi olan her seçenek için de kullanılır (12.1 §5.13): filo seçeneklerinin
 * fonları, entegrasyon banka hesapları (aktif şirket), sefer formunun kabul edilmiş teklif satırları.
 * Şirketi yazılmamış öğe (eski yanıt) her şirkette görünür.
 */
export function fundsOfCompany<T extends { companyId?: string | null }>(
  funds: T[] | undefined,
  companyId: string | null | undefined,
): T[] {
  return (funds ?? []).filter(
    (fund) => !companyId || !fund.companyId || fund.companyId === companyId,
  );
}
