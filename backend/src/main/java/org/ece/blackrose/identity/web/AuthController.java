package org.ece.blackrose.identity.web;

import jakarta.validation.Valid;
import org.ece.blackrose.identity.service.AuthService;
import org.ece.blackrose.identity.web.IdentityDtos.ChangePasswordRequest;
import org.ece.blackrose.identity.web.IdentityDtos.LoginRequest;
import org.ece.blackrose.identity.web.IdentityDtos.LogoutRequest;
import org.ece.blackrose.identity.web.IdentityDtos.MeResponse;
import org.ece.blackrose.identity.web.IdentityDtos.PasswordResetRequest;
import org.ece.blackrose.identity.web.IdentityDtos.RefreshRequest;
import org.ece.blackrose.identity.web.IdentityDtos.SetPasswordRequest;
import org.ece.blackrose.identity.web.IdentityDtos.TokenResponse;
import org.ece.blackrose.identity.web.IdentityDtos.TwoFactorCodeRequest;
import org.ece.blackrose.identity.web.IdentityDtos.TwoFactorSetupResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

  private final AuthService auth;

  public AuthController(AuthService auth) {
    this.auth = auth;
  }

  @PostMapping("/login")
  TokenResponse login(@Valid @RequestBody LoginRequest request) {
    return auth.login(request);
  }

  @PostMapping("/refresh")
  TokenResponse refresh(@Valid @RequestBody RefreshRequest request) {
    return auth.refresh(request.refreshToken());
  }

  @PostMapping("/logout")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void logout(@RequestBody(required = false) LogoutRequest request) {
    auth.logout(request != null ? request.refreshToken() : null);
  }

  @GetMapping("/me")
  MeResponse me() {
    return auth.me();
  }

  @PostMapping("/password-reset/request")
  @ResponseStatus(HttpStatus.ACCEPTED)
  void requestPasswordReset(@Valid @RequestBody PasswordResetRequest request) {
    auth.requestPasswordReset(request.email());
  }

  @PostMapping("/password-reset/confirm")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void confirmPasswordReset(@Valid @RequestBody SetPasswordRequest request) {
    auth.setPasswordWithToken(request.token(), request.newPassword());
  }

  @PostMapping("/password")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void changePassword(@Valid @RequestBody ChangePasswordRequest request) {
    auth.changePassword(request.currentPassword(), request.newPassword());
  }

  @PostMapping("/2fa/setup")
  TwoFactorSetupResponse startTwoFactorSetup() {
    return auth.startTwoFactorSetup();
  }

  @PostMapping("/2fa/enable")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void enableTwoFactor(@Valid @RequestBody TwoFactorCodeRequest request) {
    auth.enableTwoFactor(request.code());
  }

  @PostMapping("/2fa/disable")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void disableTwoFactor(@Valid @RequestBody TwoFactorCodeRequest request) {
    auth.disableTwoFactor(request.code());
  }
}
