package org.ece.blackrose.organization;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/**
 * Repository'lerin ortak şirket/iş yeri süzgeci. {@code companyId} null = konsolide (tüm
 * şirketler). {@code allBranches} false ise yalnız {@code branchIds}; liste hiçbir zaman boş
 * değildir (boş {@code IN ()} olmasın diye {@link #NONE} nöbetçisi).
 */
public record BranchFilter(UUID companyId, boolean allBranches, List<UUID> branchIds) {

  /** Hiçbir iş yerine karşılık gelmeyen nöbetçi kimlik. */
  public static final UUID NONE = new UUID(0, 0);

  public BranchFilter {
    branchIds = branchIds == null || branchIds.isEmpty() ? List.of(NONE) : List.copyOf(branchIds);
  }

  /** Şirketin (ya da konsolidede tüm şirketlerin) bütün iş yerleri. */
  public static BranchFilter all(UUID companyId) {
    return new BranchFilter(companyId, true, List.of(NONE));
  }

  /** Yalnız verilen iş yerleri; liste boşsa hiçbir kayıt eşleşmez. */
  public static BranchFilter limited(UUID companyId, Collection<UUID> branchIds) {
    return new BranchFilter(
        companyId, false, branchIds == null ? List.of() : List.copyOf(branchIds));
  }
}
