package org.ece.blackrose.identity.web;

import jakarta.validation.Valid;
import org.ece.blackrose.identity.service.SaasAuthService;
import org.ece.blackrose.identity.web.IdentityDtos.LoginRequest;
import org.ece.blackrose.identity.web.IdentityDtos.SaasTwoFactorEnableRequest;
import org.ece.blackrose.identity.web.IdentityDtos.SaasTwoFactorSetupRequest;
import org.ece.blackrose.identity.web.IdentityDtos.TokenResponse;
import org.ece.blackrose.identity.web.IdentityDtos.TwoFactorSetupResponse;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SaasAuthController {

  private final SaasAuthService auth;

  public SaasAuthController(SaasAuthService auth) {
    this.auth = auth;
  }

  /** /api/v1/admin/** kuralı gereği yalnız geçerli SaaS token'ıyla çağrılabilir. */
  @PostMapping("/api/v1/admin/auth/logout")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void logout() {
    auth.logout();
  }

  @PostMapping("/api/v1/admin/auth/login")
  TokenResponse login(@Valid @RequestBody LoginRequest request) {
    return auth.login(request.email(), request.password(), request.totpCode());
  }

  /** Oturum öncesi kurulum: 2FA zorunluyken yönetici başka türlü giriş yapamaz. */
  @PostMapping("/api/v1/admin/auth/2fa/setup")
  TwoFactorSetupResponse startTwoFactorSetup(
      @Valid @RequestBody SaasTwoFactorSetupRequest request) {
    return auth.startTwoFactorSetup(request.email(), request.password());
  }

  @PostMapping("/api/v1/admin/auth/2fa/enable")
  TokenResponse enableTwoFactor(@Valid @RequestBody SaasTwoFactorEnableRequest request) {
    return auth.enableTwoFactor(request.email(), request.password(), request.code());
  }
}
