package org.ece.blackrose.identity.service;

import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.identity.domain.BranchScope;
import org.ece.blackrose.identity.domain.UserAccount;
import org.ece.blackrose.identity.repository.IdentityRepositories.UserBranchRepository;
import org.ece.blackrose.identity.security.AuthenticatedUser;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Kullanıcı yönetiminde iş yeri kapsamı: tüm iş yerlerini gören (ALL) yönetici herkesi yönetir;
 * LIMITED yönetici yalnız tüm iş yerleri kendi kapsamında olan LIMITED kullanıcıları (kendisi
 * dahil) yönetebilir. Böylece bir iş yerine sınırlı yönetici kiracı genelindeki kullanıcıların
 * rolünü, durumunu ya da kapsamını değiştiremez.
 */
@Component
public class UserScopeGuard {

  private final UserBranchRepository userBranches;

  public UserScopeGuard(UserBranchRepository userBranches) {
    this.userBranches = userBranches;
  }

  /** Oturumdaki yöneticinin izinli iş yerleri; ALL (ya da oturumsuz) ise {@code null}. */
  public Set<UUID> actorScope() {
    return AuthenticatedUser.current().map(AuthenticatedUser::allowedBranchIds).orElse(null);
  }

  /** Hedef yönetilemiyorsa 403 {@code BRANCH_OUT_OF_SCOPE}. */
  public void requireManageable(UserAccount target) {
    Set<UUID> allowed = actorScope();
    if (allowed == null) {
      return;
    }
    if (target.getBranchScope() != BranchScope.LIMITED
        || !allowed.containsAll(userBranches.branchIdsOf(target.getId()))) {
      throw outOfScope();
    }
  }

  static BusinessException outOfScope() {
    return new BusinessException(
        HttpStatus.FORBIDDEN, "BRANCH_OUT_OF_SCOPE", "Bu iş yerinde işlem yetkiniz yok.");
  }
}
