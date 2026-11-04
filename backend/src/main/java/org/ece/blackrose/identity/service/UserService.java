package org.ece.blackrose.identity.service;

import java.time.Instant;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.domain.Permission;
import org.ece.blackrose.identity.domain.Role;
import org.ece.blackrose.identity.domain.UserAccount;
import org.ece.blackrose.identity.domain.UserStatus;
import org.ece.blackrose.identity.repository.IdentityRepositories.RefreshTokenRepository;
import org.ece.blackrose.identity.repository.IdentityRepositories.RoleRepository;
import org.ece.blackrose.identity.repository.IdentityRepositories.UserAccountRepository;
import org.ece.blackrose.identity.web.IdentityDtos.InviteUserRequest;
import org.ece.blackrose.identity.web.IdentityDtos.UpdateUserRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

  private final UserAccountRepository users;
  private final RoleRepository roles;
  private final RefreshTokenRepository refreshTokens;
  private final AccountTokenService accountTokens;
  private final AuditService audit;

  public UserService(
      UserAccountRepository users,
      RoleRepository roles,
      RefreshTokenRepository refreshTokens,
      AccountTokenService accountTokens,
      AuditService audit) {
    this.users = users;
    this.roles = roles;
    this.refreshTokens = refreshTokens;
    this.accountTokens = accountTokens;
    this.audit = audit;
  }

  @Transactional(readOnly = true)
  public Page<UserAccount> list(Pageable pageable) {
    return users.findAll(pageable);
  }

  @Transactional(readOnly = true)
  public UserAccount get(UUID id) {
    return find(id);
  }

  @Transactional
  public UserAccount invite(InviteUserRequest request) {
    String email = AuthService.normalize(request.email());
    if (users.findByEmail(email).isPresent()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "USER_EMAIL_TAKEN", "Bu e-posta zaten kayıtlı.");
    }
    List<Role> assigned = findRoles(request.roleIds());
    ensureActorHolds(permissionsOf(assigned));
    UserAccount user = users.save(new UserAccount(email, request.fullName(), assigned));
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
    List<Role> assigned = findRoles(request.roleIds());
    ensureActorHolds(permissionsOf(assigned));

    boolean staysOwner = request.enabled() && assigned.stream().anyMatch(Role::isOwner);
    ensureAnotherOwnerRemains(user, staysOwner);

    user.updateProfile(request.fullName(), assigned);
    if (request.enabled() && user.getStatus() == UserStatus.DISABLED) {
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
    ensureAnotherOwnerRemains(user, false);
    user.disable();
    user.markDeleted();
    refreshTokens.revokeAllForUser(user.getId(), Instant.now());
    audit.record(AuditEvent.USER_DELETED, user.getEmail(), null);
  }

  @Transactional
  public void resendInvite(UUID id) {
    UserAccount user = find(id);
    if (user.getStatus() != UserStatus.INVITED) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "USER_NOT_INVITED", "Kullanıcı daveti zaten kabul etmiş.");
    }
    accountTokens.sendInvite(user);
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
