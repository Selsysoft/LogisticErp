package org.ece.blackrose.identity.service;

import java.time.Instant;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.domain.BranchScope;
import org.ece.blackrose.identity.domain.Permission;
import org.ece.blackrose.identity.domain.Role;
import org.ece.blackrose.identity.domain.UserAccount;
import org.ece.blackrose.identity.domain.UserBranch;
import org.ece.blackrose.identity.domain.UserStatus;
import org.ece.blackrose.identity.repository.IdentityRepositories.RefreshTokenRepository;
import org.ece.blackrose.identity.repository.IdentityRepositories.RoleRepository;
import org.ece.blackrose.identity.repository.IdentityRepositories.UserAccountRepository;
import org.ece.blackrose.identity.repository.IdentityRepositories.UserBranchRepository;
import org.ece.blackrose.identity.security.AuthenticatedUser;
import org.ece.blackrose.identity.web.IdentityDtos.InviteUserRequest;
import org.ece.blackrose.identity.web.IdentityDtos.UpdateUserRequest;
import org.ece.blackrose.saas.domain.SaasTypes.LimitedResource;
import org.ece.blackrose.saas.service.PlanLimitService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

  private static final UUID NONE = new UUID(0, 0);

  private final UserAccountRepository users;
  private final RoleRepository roles;
  private final RefreshTokenRepository refreshTokens;
  private final AccountTokenService accountTokens;
  private final AuditService audit;
  private final PlanLimitService planLimits;
  private final UserBranchRepository userBranches;
  private final UserScopeGuard guard;

  public UserService(
      UserAccountRepository users,
      RoleRepository roles,
      RefreshTokenRepository refreshTokens,
      AccountTokenService accountTokens,
      AuditService audit,
      PlanLimitService planLimits,
      UserBranchRepository userBranches,
      UserScopeGuard guard) {
    this.userBranches = userBranches;
    this.guard = guard;
    this.planLimits = planLimits;
    this.users = users;
    this.roles = roles;
    this.refreshTokens = refreshTokens;
    this.accountTokens = accountTokens;
    this.audit = audit;
  }

  /** LIMITED yönetici yalnız kendisini ve kapsamındaki LIMITED kullanıcıları görür. */
  @Transactional(readOnly = true)
  public Page<UserAccount> list(Pageable pageable) {
    Set<UUID> scope = guard.actorScope();
    if (scope == null) {
      return users.findAll(pageable);
    }
    UUID self = AuthenticatedUser.require().id();
    return users.findManageable(self, scope.isEmpty() ? Set.of(NONE) : scope, pageable);
  }

  @Transactional(readOnly = true)
  public UserAccount get(UUID id) {
    UserAccount user = find(id);
    guard.requireManageable(user);
    return user;
  }

  @Transactional
  public UserAccount invite(InviteUserRequest request) {
    String email = AuthService.normalize(request.email());
    if (users.findByEmail(email).isPresent()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "USER_EMAIL_TAKEN", "Bu e-posta zaten kayıtlı.");
    }
    planLimits.require(LimitedResource.USERS);
    List<Role> assigned = findRoles(request.roleIds());
    ensureActorHolds(permissionsOf(assigned));
    if (guard.actorScope() != null && assigned.stream().anyMatch(Role::isOwner)) {
      throw ownerScopeAll();
    }
    UserAccount user = users.save(new UserAccount(email, request.fullName(), assigned));
    inheritActorScope(user);
    accountTokens.sendInvite(user);
    audit.record(AuditEvent.USER_INVITED, email, roleCodes(assigned));
    return user;
  }

  /** Tenant sağlama sırasında çağrılır: henüz oturum olmadığı için yetki kontrolü yoktur. */
  @Transactional
  public void ensureOwner(String rawEmail, String fullName) {
    String email = AuthService.normalize(rawEmail);
    if (users.findByEmail(email).isPresent()) {
      return;
    }
    Role owner = roles.findByCode(Role.OWNER_CODE).orElseThrow();
    accountTokens.sendInvite(users.save(new UserAccount(email, fullName, List.of(owner))));
  }

  @Transactional
  public UserAccount update(UUID id, UpdateUserRequest request) {
    UserAccount user = find(id);
    ensureActorHolds(user.getEffectivePermissions());
    guard.requireManageable(user);
    List<Role> assigned = findRoles(request.roleIds());
    ensureActorHolds(permissionsOf(assigned));
    if (assigned.stream().anyMatch(Role::isOwner) && user.getBranchScope() == BranchScope.LIMITED) {
      throw ownerScopeAll();
    }

    boolean staysOwner = request.enabled() && assigned.stream().anyMatch(Role::isOwner);
    ensureAnotherOwnerRemains(user, staysOwner);

    user.updateProfile(request.fullName(), assigned);
    if (request.enabled() && user.getStatus() == UserStatus.DISABLED) {
      planLimits.require(LimitedResource.USERS);
      user.enable();
    } else if (!request.enabled() && user.getStatus() != UserStatus.DISABLED) {
      user.disable();
      refreshTokens.revokeAllForUser(user.getId(), Instant.now());
    }
    audit.record(AuditEvent.USER_UPDATED, user.getEmail(), roleCodes(assigned));
    return user;
  }

  @Transactional
  public void delete(UUID id) {
    UserAccount user = find(id);
    ensureActorHolds(user.getEffectivePermissions());
    guard.requireManageable(user);
    ensureAnotherOwnerRemains(user, false);
    user.disable();
    user.markDeleted();
    refreshTokens.revokeAllForUser(user.getId(), Instant.now());
    audit.record(AuditEvent.USER_DELETED, user.getEmail(), null);
  }

  @Transactional
  public void resendInvite(UUID id) {
    UserAccount user = find(id);
    guard.requireManageable(user);
    if (user.getStatus() != UserStatus.INVITED) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "USER_NOT_INVITED", "Kullanıcı daveti zaten kabul etmiş.");
    }
    accountTokens.sendInvite(user);
  }

  /**
   * LIMITED yöneticinin davet ettiği kullanıcı aynı kapsamla başlar (yöneticinin iş yerleri ve
   * varsayılan iş yeri); ALL yöneticinin davet ettiği kullanıcı ALL'dır.
   */
  private void inheritActorScope(UserAccount user) {
    Set<UUID> scope = guard.actorScope();
    if (scope == null) {
      return;
    }
    UUID defaultBranch =
        users
            .findById(AuthenticatedUser.require().id())
            .map(UserAccount::getDefaultBranchId)
            .filter(scope::contains)
            .orElse(null);
    user.updateBranchScope(BranchScope.LIMITED, defaultBranch);
    scope.forEach(branchId -> userBranches.save(new UserBranch(user.getId(), branchId)));
  }

  /** Patron rolü yalnız tüm iş yerlerini gören kullanıcıya verilir (§4.15). */
  private static BusinessException ownerScopeAll() {
    return new BusinessException(
        HttpStatus.CONFLICT, "OWNER_SCOPE_ALL", "Patron kullanıcı tüm iş yerlerini görür.");
  }

  private void ensureAnotherOwnerRemains(UserAccount user, boolean staysOwner) {
    if (user.isActiveOwner() && !staysOwner && users.countActiveOwners() <= 1) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "LAST_OWNER", "Son aktif yönetici kaldırılamaz.");
    }
  }

  /** Kullanıcı sahip olmadığı bir yetkiyi başkasına veremez ve kendinden yetkiliyi değiştiremez. */
  static void ensureActorHolds(Collection<Permission> permissions) {
    Set<String> held = new HashSet<>();
    for (GrantedAuthority authority :
        SecurityContextHolder.getContext().getAuthentication().getAuthorities()) {
      held.add(authority.getAuthority());
    }
    if (!permissions.stream().map(Enum::name).allMatch(held::contains)) {
      throw new BusinessException(
          HttpStatus.FORBIDDEN, "PRIVILEGE_ESCALATION", "Sahip olmadığınız yetkiyi veremezsiniz.");
    }
  }

  private UserAccount find(UUID id) {
    return users
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "Kullanıcı bulunamadı."));
  }

  private List<Role> findRoles(Set<UUID> ids) {
    List<Role> found = roles.findAllById(ids);
    if (found.size() != ids.size()) {
      throw new BusinessException(HttpStatus.BAD_REQUEST, "ROLE_NOT_FOUND", "Rol bulunamadı.");
    }
    return found;
  }

  private static Set<Permission> permissionsOf(Collection<Role> assigned) {
    Set<Permission> result = new HashSet<>();
    assigned.forEach(role -> result.addAll(role.getEffectivePermissions()));
    return result;
  }

  private static String roleCodes(Collection<Role> assigned) {
    return assigned.stream().map(Role::getCode).sorted().toList().toString();
  }
}
