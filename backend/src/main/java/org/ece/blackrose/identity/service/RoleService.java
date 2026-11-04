package org.ece.blackrose.identity.service;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.domain.Permission;
import org.ece.blackrose.identity.domain.Role;
import org.ece.blackrose.identity.repository.IdentityRepositories.RoleRepository;
import org.ece.blackrose.identity.repository.IdentityRepositories.UserAccountRepository;
import org.ece.blackrose.identity.web.IdentityDtos.SaveRoleRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RoleService {

  private final RoleRepository roles;
  private final UserAccountRepository users;
  private final AuditService audit;

  public RoleService(RoleRepository roles, UserAccountRepository users, AuditService audit) {
    this.roles = roles;
    this.users = users;
    this.audit = audit;
  }

  @Transactional(readOnly = true)
  public List<Role> list() {
    return roles.findAll().stream()
        .sorted((a, b) -> Integer.compare(b.getPriority(), a.getPriority()))
        .toList();
  }

  @Transactional
  public Role create(SaveRoleRequest request) {
    if (roles.findByCode(request.code()).isPresent()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "ROLE_CODE_TAKEN", "Bu rol kodu kullanımda.");
    }
    UserService.ensureActorHolds(request.permissions());
    Role role =
        roles.save(
            new Role(
                request.code(),
                request.name(),
                request.priority(),
                request.landingPath(),
                request.permissions()));
    audit.record(AuditEvent.ROLE_CREATED, role.getCode(), request.permissions().toString());
    return role;
  }

  @Transactional
  public Role update(UUID id, SaveRoleRequest request) {
    Role role = find(id);
    ensureUnlocked(role);
    Set<Permission> added = new HashSet<>(request.permissions());
    added.removeAll(role.getEffectivePermissions());
    UserService.ensureActorHolds(added);
    role.update(request.name(), request.priority(), request.landingPath(), request.permissions());
    audit.record(AuditEvent.ROLE_UPDATED, role.getCode(), request.permissions().toString());
    return role;
  }

  @Transactional
  public void delete(UUID id) {
    Role role = find(id);
    ensureUnlocked(role);
    if (users.countByRole(id) > 0) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "ROLE_IN_USE", "Bu role atanmış kullanıcılar var.");
    }
    role.markDeleted();
    audit.record(AuditEvent.ROLE_DELETED, role.getCode(), null);
  }

  private Role find(UUID id) {
    return roles
        .findById(id)
        .orElseThrow(
            () -> new BusinessException(HttpStatus.NOT_FOUND, "ROLE_NOT_FOUND", "Rol bulunamadı."));
  }

  private static void ensureUnlocked(Role role) {
    if (role.isLocked()) {
      throw new BusinessException(HttpStatus.CONFLICT, "ROLE_LOCKED", "Bu rol değiştirilemez.");
    }
  }
}
