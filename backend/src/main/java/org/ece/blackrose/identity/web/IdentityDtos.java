package org.ece.blackrose.identity.web;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.identity.domain.Permission;
import org.ece.blackrose.identity.domain.UserStatus;

public final class IdentityDtos {

  private IdentityDtos() {}

  public record LoginRequest(
      @NotBlank @Email String email, @NotBlank String password, String totpCode) {}

  public record RefreshRequest(@NotBlank String refreshToken) {}

  public record LogoutRequest(String refreshToken) {}

  public record TokenResponse(String accessToken, String refreshToken, long expiresInSeconds) {}

  public record PasswordResetRequest(@NotBlank @Email String email) {}

  public record SetPasswordRequest(@NotBlank String token, @NotBlank String newPassword) {}

  public record ChangePasswordRequest(
      @NotBlank String currentPassword, @NotBlank String newPassword) {}

  public record TwoFactorSetupResponse(String secret, String otpauthUri) {}

  public record TwoFactorCodeRequest(@NotBlank String code) {}

  public record MeResponse(
      UUID id,
      String email,
      String fullName,
      String tenant,
      Set<Permission> permissions,
      List<String> roles,
      String landingPath,
      boolean twoFactorEnabled) {}

  public record InviteUserRequest(
      @NotBlank @Email String email,
      @NotBlank @Size(max = 200) String fullName,
      @NotEmpty Set<UUID> roleIds) {}

  public record UpdateUserRequest(
      @NotBlank @Size(max = 200) String fullName,
      @NotEmpty Set<UUID> roleIds,
      @NotNull Boolean enabled) {}

  public record RoleResponse(
      UUID id,
      String code,
      String name,
      boolean locked,
      int priority,
      String landingPath,
      Set<Permission> permissions) {}

  public record UserResponse(
      UUID id,
      String email,
      String fullName,
      UserStatus status,
      boolean twoFactorEnabled,
      Set<RoleResponse> roles) {}

  public record SaveRoleRequest(
      @NotBlank @Pattern(regexp = "^[A-Z][A-Z0-9_]{1,48}$") String code,
      @NotBlank @Size(max = 100) String name,
      int priority,
      @NotBlank @Pattern(regexp = "^/[a-z0-9/-]*$") String landingPath,
      @NotNull Set<Permission> permissions) {}

  public record PermissionResponse(Permission code, String module) {}

  public record AuditLogResponse(
      UUID id,
      String eventType,
      String actorEmail,
      String target,
      String details,
      String ipAddress,
      String traceId,
      Instant createdAt) {}
}
