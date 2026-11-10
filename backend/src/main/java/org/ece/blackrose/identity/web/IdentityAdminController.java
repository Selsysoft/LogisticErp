package org.ece.blackrose.identity.web;

import jakarta.validation.Valid;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.identity.domain.Permission;
import org.ece.blackrose.identity.repository.IdentityRepositories.AuditLogRepository;
import org.ece.blackrose.identity.service.RoleService;
import org.ece.blackrose.identity.service.UserService;
import org.ece.blackrose.identity.web.IdentityDtos.AuditLogResponse;
import org.ece.blackrose.identity.web.IdentityDtos.InviteUserRequest;
import org.ece.blackrose.identity.web.IdentityDtos.MailIssueResponse;
import org.ece.blackrose.identity.web.IdentityDtos.PermissionResponse;
import org.ece.blackrose.identity.web.IdentityDtos.RoleResponse;
import org.ece.blackrose.identity.web.IdentityDtos.SaveRoleRequest;
import org.ece.blackrose.identity.web.IdentityDtos.UpdateUserRequest;
import org.ece.blackrose.identity.web.IdentityDtos.UserResponse;
import org.ece.blackrose.notification.mail.MailEventService;
import org.ece.blackrose.tenant.TenantContext;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/identity")
public class IdentityAdminController {

  private final UserService users;
  private final RoleService roles;
  private final AuditLogRepository auditLogs;
  private final IdentityMapper mapper;
  private final MailEventService mailEvents;

  public IdentityAdminController(
      UserService users,
      RoleService roles,
      AuditLogRepository auditLogs,
      IdentityMapper mapper,
      MailEventService mailEvents) {
    this.users = users;
    this.roles = roles;
    this.auditLogs = auditLogs;
    this.mapper = mapper;
    this.mailEvents = mailEvents;
  }

  @GetMapping("/users")
  @PreAuthorize("hasAuthority('USER_VIEW')")
  PageResponse<UserResponse> listUsers(Pageable pageable) {
    PageResponse<UserResponse> page = PageResponse.from(users.list(pageable), mapper::toResponse);
    List<UserResponse> withIssues = withMailIssues(page.content());
    return new PageResponse<>(
        withIssues, page.page(), page.size(), page.totalElements(), page.totalPages());
  }

  @GetMapping("/users/{id}")
  @PreAuthorize("hasAuthority('USER_VIEW')")
  UserResponse getUser(@PathVariable UUID id) {
    return withMailIssues(List.of(mapper.toResponse(users.get(id)))).get(0);
  }

  /** Davet veya bildirim e-postası geri dönen kullanıcı listede işaretlenir. */
  private List<UserResponse> withMailIssues(List<UserResponse> list) {
    String tenant = TenantContext.current().map(TenantContext.Current::code).orElse(null);
    Map<String, MailEventService.Issue> issues =
        mailEvents.latestIssues(tenant, list.stream().map(UserResponse::email).toList());
    return list.stream()
        .map(
            user -> {
              MailEventService.Issue issue = issues.get(user.email().toLowerCase(Locale.ROOT));
              return issue == null
                  ? user
                  : new UserResponse(
                      user.id(),
                      user.email(),
                      user.fullName(),
                      user.status(),
                      user.twoFactorEnabled(),
                      user.roles(),
                      new MailIssueResponse(
                          issue.type().name(), issue.detail(), issue.occurredAt()));
            })
        .toList();
  }

  @PostMapping("/users")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize("hasAuthority('USER_MANAGE')")
  UserResponse inviteUser(@Valid @RequestBody InviteUserRequest request) {
    return mapper.toResponse(users.invite(request));
  }

  @PutMapping("/users/{id}")
  @PreAuthorize("hasAuthority('USER_MANAGE')")
  UserResponse updateUser(@PathVariable UUID id, @Valid @RequestBody UpdateUserRequest request) {
    return mapper.toResponse(users.update(id, request));
  }

  @DeleteMapping("/users/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize("hasAuthority('USER_MANAGE')")
  void deleteUser(@PathVariable UUID id) {
    users.delete(id);
  }

  @PostMapping("/users/{id}/resend-invite")
  @ResponseStatus(HttpStatus.ACCEPTED)
  @PreAuthorize("hasAuthority('USER_MANAGE')")
  void resendInvite(@PathVariable UUID id) {
    users.resendInvite(id);
  }

  @GetMapping("/roles")
  @PreAuthorize("hasAnyAuthority('USER_VIEW', 'ROLE_MANAGE')")
  List<RoleResponse> listRoles() {
    return roles.list().stream().map(mapper::toResponse).toList();
  }

  @PostMapping("/roles")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize("hasAuthority('ROLE_MANAGE')")
  RoleResponse createRole(@Valid @RequestBody SaveRoleRequest request) {
    return mapper.toResponse(roles.create(request));
  }

  @PutMapping("/roles/{id}")
  @PreAuthorize("hasAuthority('ROLE_MANAGE')")
  RoleResponse updateRole(@PathVariable UUID id, @Valid @RequestBody SaveRoleRequest request) {
    return mapper.toResponse(roles.update(id, request));
  }

  @DeleteMapping("/roles/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize("hasAuthority('ROLE_MANAGE')")
  void deleteRole(@PathVariable UUID id) {
    roles.delete(id);
  }

  @GetMapping("/permissions")
  @PreAuthorize("hasAnyAuthority('USER_VIEW', 'ROLE_MANAGE')")
  List<PermissionResponse> listPermissions() {
    return Arrays.stream(Permission.values())
        .map(permission -> new PermissionResponse(permission, permission.getModule()))
        .toList();
  }

  @GetMapping("/audit-logs")
  @PreAuthorize("hasAuthority('AUDIT_VIEW')")
  PageResponse<AuditLogResponse> listAuditLogs(
      @PageableDefault(sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
    return PageResponse.from(auditLogs.findAll(pageable), mapper::toResponse);
  }
}
