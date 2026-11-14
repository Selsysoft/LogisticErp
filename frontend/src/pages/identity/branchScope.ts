import type { BranchScopeValue, UserBranchScope } from "./types";

/**
 * Kullanıcı "İş Yeri Yetkisi" sekmesinin saf mantığı (12.1a §6.13). Sunucu yetkili kaynaktır
 * (§4.15); burada yalnız gönderilecek gövde kurulur ve bariz hatalar istemcide yakalanır.
 */

/** `PUT /identity/users/{id}/branch-scope` gövdesi (şema `BranchScopeRequest`). */
export type BranchScopeBody = {
  scope: BranchScopeValue;
  branchIds: string[];
  defaultBranchId: string | null;
};

export type BranchScopeDraft = UserBranchScope;

export type BranchScopeValidation = "selectAtLeastOneBranch" | null;

/** LIMITED'de seçilen iş yerlerinden biri olmayan varsayılan iş yeri düşer (sunucu 422 verirdi). */
export function withSelection(draft: BranchScopeDraft, branchIds: string[]): BranchScopeDraft {
  const keepDefault = draft.defaultBranchId !== null && branchIds.includes(draft.defaultBranchId);
  return { ...draft, branchIds, defaultBranchId: keepDefault ? draft.defaultBranchId : null };
}

/** Kapsam değişimi: LIMITED'e geçişte seçim dışındaki varsayılan iş yeri düşer. */
export function withScope(draft: BranchScopeDraft, scope: BranchScopeValue): BranchScopeDraft {
  return scope === "LIMITED"
    ? withSelection({ ...draft, scope }, draft.branchIds)
    : { ...draft, scope };
}

export function validateScope(draft: BranchScopeDraft): BranchScopeValidation {
  return draft.scope === "LIMITED" && draft.branchIds.length === 0
    ? "selectAtLeastOneBranch"
    : null;
}

/** ALL'da iş yeri listesi gönderilmez (sunucu yok sayar; boş liste açık niyet). */
export function toScopeBody(draft: BranchScopeDraft): BranchScopeBody {
  return {
    scope: draft.scope,
    branchIds: draft.scope === "ALL" ? [] : draft.branchIds,
    defaultBranchId: draft.defaultBranchId,
  };
}
