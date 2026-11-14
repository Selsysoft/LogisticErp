package org.ece.blackrose.identity.service;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.domain.BranchScope;
import org.ece.blackrose.identity.domain.UserAccount;
import org.ece.blackrose.identity.domain.UserBranch;
import org.ece.blackrose.identity.repository.IdentityRepositories.UserAccountRepository;
import org.ece.blackrose.identity.repository.IdentityRepositories.UserBranchRepository;
import org.ece.blackrose.identity.web.IdentityDtos.BranchScopeRequest;
import org.ece.blackrose.identity.web.IdentityDtos.UserBranchScopeResponse;
import org.ece.blackrose.organization.BranchRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Kullanıcının iş yeri kapsamı (ALL / LIMITED). Değişiklik bir sonraki istekte geçerlidir; token
 * sürümü artırılmaz (kapsam her istekte veritabanından okunur).
 */
@Service
public class UserBranchScopeService {

  private final UserAccountRepository users;
  private final UserBranchRepository userBranches;
  private final BranchRepository branches;
  private final UserScopeGuard guard;
  private final AuditService audit;

  public UserBranchScopeService(
      UserAccountRepository users,
      UserBranchRepository userBranches,
      BranchRepository branches,
      UserScopeGuard guard,
      AuditService audit) {
    this.users = users;
    this.userBranches = userBranches;
    this.branches = branches;
    this.guard = guard;
    this.audit = audit;
  }

  @Transactional(readOnly = true)
  public UserBranchScopeResponse get(UUID userId) {
    UserAccount user = find(userId);
    guard.requireManageable(user);
    return toResponse(user);
  }

  @Transactional
  public UserBranchScopeResponse update(UUID userId, BranchScopeRequest request) {
    UserAccount target = find(userId);
    UserService.ensureActorHolds(target.getEffectivePermissions());
    guard.requireManageable(target);
    boolean limited = request.scope() == BranchScope.LIMITED;
    if (limited && target.isOwner()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "OWNER_SCOPE_ALL", "Patron kullanıcı tüm iş yerlerini görür.");
    }
    Set<UUID> branchIds =
        limited && request.branchIds() != null
            ? new LinkedHashSet<>(request.branchIds())
            : new LinkedHashSet<>();
    if (limited && branchIds.isEmpty()) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY, "BRANCH_SCOPE_EMPTY", "En az bir iş yeri seçin.");
    }
    // Pasif iş yeri izinlidir (kayıtları görünmeye devam eder); silinmiş ya da olmayan değil.
    if (branches.findAllById(branchIds).size() != branchIds.size()) {
      throw branchNotFound();
    }
    UUID defaultBranchId = request.defaultBranchId();
    if (defaultBranchId != null) {
      if (!branches.existsById(defaultBranchId)) {
        throw branchNotFound();
      }
      if (limited && !branchIds.contains(defaultBranchId)) {
        throw new BusinessException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "DEFAULT_BRANCH_OUT_OF_SCOPE",
            "Varsayılan iş yeri seçili iş yerlerinden olmalı.");
      }
    }
    Set<UUID> actorScope = guard.actorScope();
    if (actorScope != null && (!limited || !actorScope.containsAll(branchIds))) {
      throw UserScopeGuard.outOfScope();
    }
    target.updateBranchScope(request.scope(), defaultBranchId);
    userBranches.deleteByUserId(target.getId());
    branchIds.forEach(id -> userBranches.save(new UserBranch(target.getId(), id)));
    audit.record(
        AuditEvent.USER_BRANCH_SCOPE_CHANGED,
        target.getEmail(),
        limited ? "LIMITED:" + branchIds.size() : "ALL");
    return new UserBranchScopeResponse(request.scope(), List.copyOf(branchIds), defaultBranchId);
  }

  private UserBranchScopeResponse toResponse(UserAccount user) {
    List<UUID> ids =
        user.getBranchScope() == BranchScope.LIMITED
            ? userBranches.branchIdsOf(user.getId()).stream().sorted().toList()
            : List.of();
    return new UserBranchScopeResponse(user.getBranchScope(), ids, user.getDefaultBranchId());
  }

  private UserAccount find(UUID id) {
    return users
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "Kullanıcı bulunamadı."));
  }

  private static BusinessException branchNotFound() {
    return new BusinessException(HttpStatus.BAD_REQUEST, "BRANCH_NOT_FOUND", "Şube bulunamadı.");
  }
}
