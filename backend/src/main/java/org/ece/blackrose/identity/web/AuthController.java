package org.ece.blackrose.identity.web;

import jakarta.validation.Valid;
import java.time.Duration;
import org.ece.blackrose.common.error.BusinessException;
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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

  /**
   * Yenileme token'ı yalnız bu çerezle verilir: JavaScript okuyamaz (XSS ile çalınamaz), başka
   * siteden gelen istekle gönderilmez ve yalnız oturum uçlarına gider. Gövdeden gönderim tarayıcı
   * dışı istemciler için kabul edilir.
   */
  public static final String REFRESH_COOKIE = "br_refresh";

  private static final String COOKIE_PATH = "/api/v1/auth";

  private final AuthService auth;
  private final Duration refreshTtl;
  private final boolean secureCookie;

  public AuthController(
      AuthService auth,
      @Value("${app.security.refresh-token-ttl}") Duration refreshTtl,
      @Value("${app.security.refresh-cookie-secure:true}") boolean secureCookie) {
    this.auth = auth;
    this.refreshTtl = refreshTtl;
    this.secureCookie = secureCookie;
  }

  @PostMapping("/login")
  ResponseEntity<TokenResponse> login(@Valid @RequestBody LoginRequest request) {
    return withRefreshCookie(auth.login(request));
  }

  @PostMapping("/refresh")
  ResponseEntity<TokenResponse> refresh(
      @CookieValue(name = REFRESH_COOKIE, required = false) String cookie,
      @RequestBody(required = false) RefreshRequest request) {
    String token = cookie != null ? cookie : request != null ? request.refreshToken() : null;
    if (token == null || token.isBlank()) {
      throw new BusinessException(
          HttpStatus.UNAUTHORIZED, "REFRESH_TOKEN_INVALID", "Oturum süresi doldu.");
    }
    return withRefreshCookie(auth.refresh(token));
  }

  @PostMapping("/logout")
  ResponseEntity<Void> logout(
      @CookieValue(name = REFRESH_COOKIE, required = false) String cookie,
      @RequestBody(required = false) LogoutRequest request) {
    auth.logout(cookie != null ? cookie : request != null ? request.refreshToken() : null);
    return ResponseEntity.noContent()
        .header(HttpHeaders.SET_COOKIE, refreshCookie("", Duration.ZERO).toString())
        .build();
  }

  private ResponseEntity<TokenResponse> withRefreshCookie(TokenResponse tokens) {
    return ResponseEntity.ok()
        .header(HttpHeaders.SET_COOKIE, refreshCookie(tokens.refreshToken(), refreshTtl).toString())
        .body(new TokenResponse(tokens.accessToken(), null, tokens.expiresInSeconds()));
  }

  private ResponseCookie refreshCookie(String value, Duration maxAge) {
    return ResponseCookie.from(REFRESH_COOKIE, value)
        .httpOnly(true)
        .secure(secureCookie)
        .sameSite("Strict")
        .path(COOKIE_PATH)
        .maxAge(maxAge)
        .build();
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
