package org.ece.blackrose.identity.web;

import jakarta.validation.Valid;
import org.ece.blackrose.identity.service.SaasAuthService;
import org.ece.blackrose.identity.web.IdentityDtos.LoginRequest;
import org.ece.blackrose.identity.web.IdentityDtos.TokenResponse;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SaasAuthController {

  private final SaasAuthService auth;

  public SaasAuthController(SaasAuthService auth) {
    this.auth = auth;
  }

  @PostMapping("/api/v1/admin/auth/login")
  TokenResponse login(@Valid @RequestBody LoginRequest request) {
    return auth.login(request.email(), request.password());
  }
}
