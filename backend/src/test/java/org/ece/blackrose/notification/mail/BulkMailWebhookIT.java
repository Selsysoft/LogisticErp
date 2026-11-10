package org.ece.blackrose.notification.mail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.ece.blackrose.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

class BulkMailWebhookIT extends AbstractIntegrationTest {

  private static final String URL = BulkMailWebhookController.PATH;

  @Value("${app.mail.bulkmail.webhook-secret}")
  private String secret;

  private int sequence;

  @Test
  void geriDonenDavetKullaniciListesindeGorunurSonrakiTeslimdeKalkar() throws Exception {
    String t = "bmw-usr";
    createTenant(t);
    String email = "Yanlis.Adres@" + t + ".test";
    String role = roleId(t, "OPERATIONS");
    mvc.perform(
            post("/api/v1/identity/users")
                .with(asOwner(t))
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of("email", email, "fullName", "Yanlış", "roleIds", List.of(role)))))
        .andExpect(status().isCreated());

    // Başka firmadaki aynı adresin sorunu bu firmada görünmez.
    String bounceId = nextId();
    deliver(
            bounceId,
            event("email.bounced", email.toLowerCase(), t, Instant.now().minusSeconds(60)))
        .andExpect(status().isNoContent());
    deliver(nextId(), event("email.bounced", email.toLowerCase(), "baska-firma", Instant.now()))
        .andExpect(status().isNoContent());
    // Aynı bildirim yeniden gelirse ikinci kayıt oluşmaz.
    deliver(
            bounceId,
            event("email.bounced", email.toLowerCase(), t, Instant.now().minusSeconds(60)))
        .andExpect(status().isNoContent());

    JsonNode user = userByEmail(t, email.toLowerCase());
    assertThat(user.get("mailIssue").get("type").asText()).isEqualTo("BOUNCED");
    assertThat(user.get("mailIssue").get("detail").asText()).isEqualTo("Permanent / General");

    JsonNode recent =
        body(
            mvc.perform(get("/api/v1/admin/mail-events").with(bearer(saasToken())))
                .andExpect(status().isOk()));
    assertThat(recent.findValuesAsText("tenantCode")).containsOnlyOnce(t);

    // Adres düzeltilip teslim olunca sorun kalkar.
    deliver(nextId(), event("email.delivered", email.toLowerCase(), t, Instant.now()))
        .andExpect(status().isNoContent());
    JsonNode cleared = userByEmail(t, email.toLowerCase()).path("mailIssue");
    assertThat(cleared.isNull() || cleared.isMissingNode()).isTrue();
  }

  @Test
  void imzasizEskiVeyaDegistirilmisBildirimReddedilir() throws Exception {
    byte[] body = event("email.bounced", "x@y.test", null, Instant.now());
    String id = nextId();
    long now = Instant.now().getEpochSecond();
    WebhookSignature signer = new WebhookSignature(secret);

    mvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(body))
        .andExpect(status().isUnauthorized());
    mvc.perform(signed(id, now - 600, body, body)).andExpect(status().isUnauthorized());
    byte[] changed = event("email.bounced", "baska@y.test", null, Instant.now());
    mvc.perform(signed(id, now, body, changed)).andExpect(status().isUnauthorized());
    mvc.perform(signed(id, now, body, body)).andExpect(status().isNoContent());
    assertThat(
            signer.verify(
                id,
                Long.toString(now),
                signer.signatureOf(id, Long.toString(now), body),
                body,
                Instant.now()))
        .isTrue();

    // Yönetici listesi oturum ister.
    mvc.perform(get("/api/v1/admin/mail-events")).andExpect(status().isUnauthorized());
  }

  // Yardımcılar

  private String nextId() {
    return "msg_" + System.nanoTime() + "_" + (sequence++);
  }

  private byte[] event(String type, String to, String tenant, Instant at) throws Exception {
    Map<String, Object> tags = new java.util.HashMap<>();
    tags.put("kind", "invite");
    if (tenant != null) {
      tags.put("tenant", tenant);
    }
    Map<String, Object> data = new java.util.HashMap<>();
    data.put("email_id", "em_" + System.nanoTime());
    data.put("from", "Blackrose <noreply@mail.blackrose.test>");
    data.put("to", List.of(to));
    data.put("subject", "Hesabınızı etkinleştirin");
    data.put("tags", tags);
    data.put("created_at", at.toString());
    if (type.equals("email.bounced")) {
      data.put("bounce", Map.of("type", "Permanent", "sub_type", "General"));
    }
    return json.writeValueAsString(Map.of("type", type, "timestamp", at.toString(), "data", data))
        .getBytes(StandardCharsets.UTF_8);
  }

  private ResultActions deliver(String id, byte[] body) throws Exception {
    return mvc.perform(signed(id, Instant.now().getEpochSecond(), body, body));
  }

  /** {@code signedBody} ile imzalanır, {@code sentBody} gönderilir. */
  private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder signed(
      String id, long timestamp, byte[] signedBody, byte[] sentBody) {
    String ts = Long.toString(timestamp);
    return post(URL)
        .contentType(MediaType.APPLICATION_JSON)
        .header("webhook-id", id)
        .header("webhook-timestamp", ts)
        .header("webhook-signature", new WebhookSignature(secret).signatureOf(id, ts, signedBody))
        .content(sentBody);
  }

  private String roleId(String t, String code) throws Exception {
    for (JsonNode role : body(mvc.perform(get("/api/v1/identity/roles").with(asOwner(t))))) {
      if (role.get("code").asText().equals(code)) {
        return role.get("id").asText();
      }
    }
    throw new AssertionError("Rol yok: " + code);
  }

  private JsonNode userByEmail(String t, String email) throws Exception {
    JsonNode page =
        body(
            mvc.perform(get("/api/v1/identity/users").with(asOwner(t)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray()));
    for (JsonNode user : page.get("content")) {
      if (user.get("email").asText().equals(email)) {
        return user;
      }
    }
    throw new AssertionError("Kullanıcı yok: " + email);
  }
}
