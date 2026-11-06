package org.ece.blackrose.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.AbstractIntegrationTest;
import org.ece.blackrose.identity.domain.SaasAdmin;
import org.ece.blackrose.identity.repository.IdentityRepositories.SaasAdminRepository;
import org.ece.blackrose.identity.service.Totp;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.ResultActions;

/** Paylaşılan yöneticiyi bozmamak için her test kendi yöneticisini açar. */
@TestPropertySource(properties = "app.security.saas-two-factor-required=true")
class SaasTwoFactorIT extends AbstractIntegrationTest {

  private static final String ADMIN_PASSWORD = "Yonetici-Sifre-123";

  @Autowired private SaasAdminRepository admins;
  @Autowired private PasswordEncoder encoder;

  private String newAdmin() {
    String email = "y" + UUID.randomUUID().toString().substring(0, 8) + "@blackrose.test";
    admins.save(new SaasAdmin(email, encoder.encode(ADMIN_PASSWORD)));
    return email;
  }

  private ResultActions adminPost(String path, Map<String, String> body) throws Exception {
    return mvc.perform(
        post("/api/v1/admin/auth" + path)
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(body)));
  }

  private ResultActions adminLogin(String email, String password, String code) throws Exception {
    return adminPost(
        "/login",
        code == null
            ? Map.of("email", email, "password", password)
            : Map.of("email", email, "password", password, "totpCode", code));
  }

  private String setup(String email) throws Exception {
    return body(adminPost("/2fa/setup", Map.of("email", email, "password", ADMIN_PASSWORD))
            .andExpect(status().isOk()))
        .get("secret")
        .asText();
  }

  private static String code(String secret, int stepOffset) {
    return Totp.codeAt(secret, Totp.stepAt(Instant.now().getEpochSecond()) + stepOffset);
  }

  private String enable(String email, String secret) throws Exception {
    JsonNode tokens =
        body(
            adminPost(
                    "/2fa/enable",
                    Map.of("email", email, "password", ADMIN_PASSWORD, "code", code(secret, -1)))
                .andExpect(status().isOk()));
    return tokens.get("accessToken").asText();
  }

  @Test
  void kurulmadanGirisYapilamazKurulumlaOturumAcilir() throws Exception {
    String email = newAdmin();

    adminLogin(email, ADMIN_PASSWORD, null)
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("TWO_FACTOR_SETUP_REQUIRED"));

    String token = enable(email, setup(email));

    mvc.perform(get("/api/v1/admin/tenants").with(bearer(token))).andExpect(status().isOk());
  }

  @Test
  void kurulumdanSonraKodZorunluVeAyniKodTekrarKullanilamaz() throws Exception {
    String email = newAdmin();
    String secret = setup(email);
    enable(email, secret);

    adminLogin(email, ADMIN_PASSWORD, null)
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("TOTP_REQUIRED"));
    adminLogin(email, ADMIN_PASSWORD, code(secret, -1))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("TOTP_INVALID"));
    adminLogin(email, ADMIN_PASSWORD, code(secret, 0)).andExpect(status().isOk());
    adminLogin(email, ADMIN_PASSWORD, code(secret, 0))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("TOTP_INVALID"));
  }

  @Test
  void kurulumUclariParolaIsterVeAcikKurulumuDegistiremez() throws Exception {
    String email = newAdmin();

    adminPost("/2fa/setup", Map.of("email", email, "password", "Yanlis-Sifre-123"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));

    String secret = setup(email);
    adminPost(
            "/2fa/enable",
            Map.of("email", email, "password", "Yanlis-Sifre-123", "code", code(secret, 0)))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
    enable(email, secret);

    adminPost("/2fa/setup", Map.of("email", email, "password", ADMIN_PASSWORD))
        .andExpect(status().isConflict());
    assertThat(admins.findByEmail(email).orElseThrow().getTotpSecret())
        .isNotBlank()
        .doesNotContain(secret);
  }

  @Test
  void hataliKodlarHesabiKilitler() throws Exception {
    String email = newAdmin();
    String secret = setup(email);
    enable(email, secret);

    for (int i = 0; i < 5; i++) {
      adminLogin(email, ADMIN_PASSWORD, "000000").andExpect(status().isUnauthorized());
    }

    adminLogin(email, ADMIN_PASSWORD, code(secret, 1))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
  }
}
