package org.ece.blackrose.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.AbstractIntegrationTest;
import org.ece.blackrose.identity.security.CryptoConfig;
import org.ece.blackrose.identity.security.TokenService;
import org.ece.blackrose.identity.service.Totp;
import org.ece.blackrose.identity.web.AuthController;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;

class AuthenticationIT extends AbstractIntegrationTest {

  @Autowired JwtEncoder encoder;

  @Test
  void expiredAccessTokenIsRejectedAndRefreshIssuesNewOne() throws Exception {
    createTenant("auth-a");
    MockHttpServletResponse loginResponse =
        postLogin("auth-a", ownerEmail("auth-a"), PASSWORD, null)
            .andExpect(status().isOk())
            .andReturn()
            .getResponse();
    JsonNode session = json.readTree(loginResponse.getContentAsString());
    // Yenileme token'ı gövdede değil, JavaScript'in okuyamadığı çerezdedir.
    assertThat(session.get("refreshToken").isNull()).isTrue();
    assertThat(loginResponse.getHeader(HttpHeaders.SET_COOKIE))
        .contains("HttpOnly", "SameSite=Strict", "Path=/api/v1/auth", "Secure");
    String userId =
        body(mvc.perform(
                get("/api/v1/auth/me")
                    .with(tenant("auth-a"))
                    .with(bearer(session.get("accessToken").asText()))))
            .get("id")
            .asText();

    mvc.perform(get("/api/v1/auth/me").with(tenant("auth-a")).with(bearer(expiredToken(userId))))
        .andExpect(status().isUnauthorized());

    JsonNode refreshed = refresh("auth-a", refreshCookie(loginResponse));
    assertThat(refreshed.get("refreshToken").isNull()).isTrue();
    mvc.perform(
            get("/api/v1/auth/me")
                .with(tenant("auth-a"))
                .with(bearer(refreshed.get("accessToken").asText())))
        .andExpect(status().isOk());
  }

  @Test
  void logoutInvalidatesAccessAndRefreshTokens() throws Exception {
    createTenant("auth-b");
    MockHttpServletResponse loginResponse =
        postLogin("auth-b", ownerEmail("auth-b"), PASSWORD, null).andReturn().getResponse();
    String access = json.readTree(loginResponse.getContentAsString()).get("accessToken").asText();
    String refresh = refreshCookie(loginResponse);

    MockHttpServletResponse logout =
        mvc.perform(
                post("/api/v1/auth/logout")
                    .with(tenant("auth-b"))
                    .with(bearer(access))
                    .cookie(new Cookie(AuthController.REFRESH_COOKIE, refresh)))
            .andExpect(status().isNoContent())
            .andReturn()
            .getResponse();
    assertThat(logout.getHeader(HttpHeaders.SET_COOKIE)).contains("Max-Age=0");

    mvc.perform(get("/api/v1/auth/me").with(tenant("auth-b")).with(bearer(access)))
        .andExpect(status().isUnauthorized());
    postRefresh("auth-b", refresh)
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("REFRESH_TOKEN_INVALID"));
  }

  @Test
  void reusedRefreshTokenRevokesWholeSession() throws Exception {
    createTenant("auth-c");
    String first =
        refreshCookie(
            postLogin("auth-c", ownerEmail("auth-c"), PASSWORD, null).andReturn().getResponse());
    String second =
        refreshCookie(
            postRefresh("auth-c", first).andExpect(status().isOk()).andReturn().getResponse());

    postRefresh("auth-c", first).andExpect(status().isUnauthorized());
    postRefresh("auth-c", second).andExpect(status().isUnauthorized());
  }

  @Test
  void wrongPasswordFailsAndAccountLocksAfterFiveAttempts() throws Exception {
    createTenant("auth-d");
    String email = ownerEmail("auth-d");

    for (int i = 0; i < 5; i++) {
      postLogin("auth-d", email, "yanlis-sifre-1", null)
          .andExpect(status().isUnauthorized())
          .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    }

    postLogin("auth-d", email, PASSWORD, null).andExpect(status().isUnauthorized());
  }

  @Test
  void unknownEmailGetsSameErrorAsWrongPassword() throws Exception {
    createTenant("auth-e");

    postLogin("auth-e", "yok@auth-e.test", PASSWORD, null)
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
  }

  @Test
  void twoFactorUserCannotLoginWithoutValidCode() throws Exception {
    createTenant("auth-f");
    String email = ownerEmail("auth-f");
    JsonNode setup =
        body(
            mvc.perform(post("/api/v1/auth/2fa/setup").with(asOwner("auth-f")))
                .andExpect(status().isOk()));
    String secret = setup.get("secret").asText();
    long now = Instant.now().getEpochSecond();

    mvc.perform(
            post("/api/v1/auth/2fa/enable")
                .with(asOwner("auth-f"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of("code", Totp.codeAt(secret, Totp.stepAt(now) - 1)))))
        .andExpect(status().isNoContent());

    postLogin("auth-f", email, PASSWORD, null)
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("TOTP_REQUIRED"));
    postLogin("auth-f", email, PASSWORD, "000000")
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("TOTP_INVALID"));

    String code = Totp.codeAt(secret, Totp.stepAt(now));
    postLogin("auth-f", email, PASSWORD, code).andExpect(status().isOk());
    postLogin("auth-f", email, PASSWORD, code)
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("TOTP_INVALID"));
  }

  @Test
  void passwordResetLinkWorksOnceAndInvalidatesOldTokens() throws Exception {
    createTenant("auth-g");
    String email = ownerEmail("auth-g");
    String oldAccess = login("auth-g", email, PASSWORD, null).get("accessToken").asText();
    String newPassword = "Yeni-Sifre-98765";

    mvc.perform(
            post("/api/v1/auth/password-reset/request")
                .with(tenant("auth-g"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", email))))
        .andExpect(status().isAccepted());
    String token = SENT_TOKENS.get(email);

    setPassword("auth-g", token, "kisa").andExpect(status().isBadRequest());
    setPassword("auth-g", token, newPassword).andExpect(status().isNoContent());
    setPassword("auth-g", token, newPassword)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("TOKEN_INVALID"));

    mvc.perform(get("/api/v1/auth/me").with(tenant("auth-g")).with(bearer(oldAccess)))
        .andExpect(status().isUnauthorized());
    postLogin("auth-g", email, newPassword, null).andExpect(status().isOk());
  }

  @Test
  void passwordResetRequestDoesNotRevealUnknownEmail() throws Exception {
    createTenant("auth-h");

    mvc.perform(
            post("/api/v1/auth/password-reset/request")
                .with(tenant("auth-h"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("email", "yok@auth-h.test"))))
        .andExpect(status().isAccepted());
    assertThat(SENT_TOKENS).doesNotContainKey("yok@auth-h.test");
  }

  @Test
  void tokenOfOneTenantIsRejectedOnAnother() throws Exception {
    createTenant("auth-i");
    createTenant("auth-j");
    String tokenOfI =
        login("auth-i", ownerEmail("auth-i"), PASSWORD, null).get("accessToken").asText();

    mvc.perform(get("/api/v1/auth/me").with(tenant("auth-j")).with(bearer(tokenOfI)))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("TENANT_MISMATCH"));
  }

  @Test
  void singleDomainUsesLoginFormCodeThenJwtClaim() throws Exception {
    createTenant("auth-k");

    JsonNode session =
        body(
            mvc.perform(
                    post("/api/v1/auth/login")
                        .header("X-Tenant-Code", "auth-k")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginJson(ownerEmail("auth-k"), PASSWORD, null)))
                .andExpect(status().isOk()));

    mvc.perform(get("/api/v1/auth/me").with(bearer(session.get("accessToken").asText())))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.tenant").value("auth-k"));
  }

  @Test
  void loginFormCodeIsIgnoredOutsideAuthEndpoints() throws Exception {
    createTenant("auth-l");

    mvc.perform(get("/api/v1/organization/branches").header("X-Tenant-Code", "auth-l"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("TENANT_REQUIRED"));
  }

  @Test
  void invalidBearerWithoutTenantIsUnauthorized() throws Exception {
    mvc.perform(get("/api/v1/auth/me").with(bearer("gecersiz")))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
  }

  @Test
  void saasTokenCannotAccessTenantEndpoints() throws Exception {
    createTenant("auth-m");

    mvc.perform(get("/api/v1/auth/me").with(tenant("auth-m")).with(bearer(saasToken())))
        .andExpect(status().isUnauthorized());
  }

  private JsonNode refresh(String code, String refreshToken) throws Exception {
    return body(postRefresh(code, refreshToken).andExpect(status().isOk()));
  }

  private org.springframework.test.web.servlet.ResultActions postRefresh(
      String code, String refreshToken) throws Exception {
    return mvc.perform(
        post("/api/v1/auth/refresh")
            .with(tenant(code))
            .cookie(new Cookie(AuthController.REFRESH_COOKIE, refreshToken)));
  }

  private static String refreshCookie(MockHttpServletResponse response) {
    Cookie cookie = response.getCookie(AuthController.REFRESH_COOKIE);
    assertThat(cookie).isNotNull();
    return cookie.getValue();
  }

  @Test
  void refreshWithoutCookieOrBodyIsRejectedAndBodyStillWorksForApiClients() throws Exception {
    createTenant("auth-n");
    mvc.perform(post("/api/v1/auth/refresh").with(tenant("auth-n")))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("REFRESH_TOKEN_INVALID"));
    String token =
        refreshCookie(
            postLogin("auth-n", ownerEmail("auth-n"), PASSWORD, null).andReturn().getResponse());
    mvc.perform(
            post("/api/v1/auth/refresh")
                .with(tenant("auth-n"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("refreshToken", token))))
        .andExpect(status().isOk());
  }

  private String expiredToken(String userId) {
    Instant past = Instant.now().minusSeconds(600);
    JwtClaimsSet claims =
        JwtClaimsSet.builder()
            .issuer(CryptoConfig.ISSUER)
            .subject(userId)
            .id(UUID.randomUUID().toString())
            .issuedAt(past)
            .expiresAt(past.plusSeconds(60))
            .claim(TokenService.CLAIM_TYPE, TokenService.TYPE_TENANT)
            .claim(TokenService.CLAIM_TENANT, "auth-a")
            .claim(TokenService.CLAIM_TOKEN_VERSION, 1)
            .build();
    return encoder
        .encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims))
        .getTokenValue();
  }
}
