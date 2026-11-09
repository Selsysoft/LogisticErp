package org.ece.blackrose;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.ece.blackrose.identity.service.AccountMailer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.containers.PostgreSQLContainer;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(AbstractIntegrationTest.RecordingMailerConfig.class)
public abstract class AbstractIntegrationTest {

  protected static final String PASSWORD = "Test-Sifre-12345";

  @ServiceConnection
  static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

  /** E-posta adresine giden son bağlantının token'ı. */
  protected static final Map<String, String> SENT_TOKENS = new ConcurrentHashMap<>();

  protected record Notice(String email, String subject, String text, String html) {}

  /** Gönderilen bildirim e-postaları. */
  protected static final List<Notice> SENT_NOTICES = new CopyOnWriteArrayList<>();

  private static final Map<String, String> OWNER_TOKENS = new ConcurrentHashMap<>();

  static {
    POSTGRES.start();
  }

  @Autowired protected MockMvc mvc;
  @Autowired protected ObjectMapper json;

  @TestConfiguration
  static class RecordingMailerConfig {
    @Bean
    @Primary
    AccountMailer recordingMailer() {
      return new AccountMailer() {
        @Override
        public void sendInvite(String email, String link) {
          record(email, link);
        }

        @Override
        public void sendPasswordReset(String email, String link) {
          record(email, link);
        }

        @Override
        public void sendNotice(String email, String subject, String text) {
          SENT_NOTICES.add(new Notice(email, subject, text, null));
        }

        @Override
        public void sendNotice(String email, String subject, String text, String html) {
          SENT_NOTICES.add(new Notice(email, subject, text, html));
        }

        private void record(String email, String link) {
          String query = URI.create(link).getQuery();
          SENT_TOKENS.put(email, query.substring("token=".length(), query.indexOf('&')));
        }
      };
    }
  }

  protected static RequestPostProcessor tenant(String code) {
    return request -> {
      request.setServerName(code + ".blackrose.test");
      return request;
    };
  }

  protected static RequestPostProcessor bearer(String token) {
    return request -> {
      request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer " + token);
      return request;
    };
  }

  /** Tenant'ın subdomain'i ve yöneticisinin token'ı ile istek yapar. */
  protected RequestPostProcessor asOwner(String code) {
    return request -> {
      tenant(code).postProcessRequest(request);
      bearer(OWNER_TOKENS.get(code)).postProcessRequest(request);
      return request;
    };
  }

  protected static String ownerEmail(String code) {
    return "owner@" + code + ".test";
  }

  /** Test firmalarının saat dilimi; uygulama "bugün"ü firmanın saatine göre hesaplar. */
  protected static final ZoneId TENANT_ZONE = ZoneId.of("Europe/Istanbul");

  /**
   * Firmanın bugünü. JVM saat dilimiyle (CI'da UTC) alınan tarih, İstanbul'da gece yarısından sonra
   * bir gün geride kalır.
   */
  protected static LocalDate tenantToday() {
    return LocalDate.now(TENANT_ZONE);
  }

  protected static String tenantJson(String code) {
    return """
        {"code":"%s","name":"%s Lojistik","defaultCurrency":"TRY","timeZone":"Europe/Istanbul",
         "ownerEmail":"%s","ownerFullName":"Firma Sahibi"}
        """
        .formatted(code, code, ownerEmail(code));
  }

  protected String saasToken() throws Exception {
    JsonNode body =
        body(
            mvc.perform(
                    post("/api/v1/admin/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginJson("saas@blackrose.test", "Test-Admin-12345", null)))
                .andExpect(status().isOk()));
    return body.get("accessToken").asText();
  }

  protected ResultActions postTenant(String code) throws Exception {
    return mvc.perform(
        post("/api/v1/admin/tenants")
            .with(bearer(saasToken()))
            .contentType(MediaType.APPLICATION_JSON)
            .content(tenantJson(code)));
  }

  /** Tenant açar, yöneticinin davetini kabul eder ve oturum açar. */
  protected void createTenant(String code) throws Exception {
    postTenant(code).andExpect(status().isCreated());
    OWNER_TOKENS.put(code, acceptInviteAndLogin(code, ownerEmail(code)));
  }

  protected String acceptInviteAndLogin(String code, String email) throws Exception {
    setPassword(code, SENT_TOKENS.get(email), PASSWORD).andExpect(status().isNoContent());
    return login(code, email, PASSWORD, null).get("accessToken").asText();
  }

  protected ResultActions setPassword(String code, String token, String password) throws Exception {
    return mvc.perform(
        post("/api/v1/auth/password-reset/confirm")
            .with(tenant(code))
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(Map.of("token", token, "newPassword", password))));
  }

  protected ResultActions postLogin(String code, String email, String password, String totp)
      throws Exception {
    return mvc.perform(
        post("/api/v1/auth/login")
            .with(tenant(code))
            .contentType(MediaType.APPLICATION_JSON)
            .content(loginJson(email, password, totp)));
  }

  protected JsonNode login(String code, String email, String password, String totp)
      throws Exception {
    return body(postLogin(code, email, password, totp).andExpect(status().isOk()));
  }

  protected String loginJson(String email, String password, String totp) throws Exception {
    return totp == null
        ? json.writeValueAsString(Map.of("email", email, "password", password))
        : json.writeValueAsString(Map.of("email", email, "password", password, "totpCode", totp));
  }

  protected JsonNode body(ResultActions actions) throws Exception {
    return json.readTree(actions.andReturn().getResponse().getContentAsString());
  }

  protected void createBranch(String tenantCode, String branchCode) throws Exception {
    mvc.perform(
            post("/api/v1/organization/branches")
                .with(asOwner(tenantCode))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"%s\",\"name\":\"Merkez\"}".formatted(branchCode)))
        .andExpect(status().isCreated());
  }
}
