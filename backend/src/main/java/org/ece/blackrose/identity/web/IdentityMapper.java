package org.ece.blackrose.identity.web;

import org.ece.blackrose.identity.domain.AuditLog;
import org.ece.blackrose.identity.domain.Role;
import org.ece.blackrose.identity.domain.UserAccount;
import org.ece.blackrose.identity.web.IdentityDtos.AuditLogResponse;
import org.ece.blackrose.identity.web.IdentityDtos.RoleResponse;
import org.ece.blackrose.identity.web.IdentityDtos.UserResponse;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper
public interface IdentityMapper {

  @Mapping(target = "permissions", source = "effectivePermissions")
  RoleResponse toResponse(Role role);

  @Mapping(target = "twoFactorEnabled", source = "totpEnabled")
  @Mapping(target = "mailIssue", ignore = true)
  UserResponse toResponse(UserAccount user);

  AuditLogResponse toResponse(AuditLog log);
}
