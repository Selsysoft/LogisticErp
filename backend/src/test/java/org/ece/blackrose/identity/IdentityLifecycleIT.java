package org.ece.blackrose.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.AbstractIntegrationTest;
import org.ece.blackrose.identity.service.Totp;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Şifre değiştirme, iki adımlı doğrulamayı kapatma, kullanıcı ve rol yaşam döngüsü. */
class IdentityLifecycleIT extends AbstractIntegrationTest {

  private static final String ID = "/api/v1/identity";

  @Test
  void sifreDegisincePasswordEskiOturumlarDuserIkiAdimliKapatilir() throws Exception {
    String t = "idl-pw";
    createTenant(t);
    String email = ownerEmail(t);
    String token = login(t, email, PASSWORD, null).get("accessToken").asText();
    String newPassword = "Yeni-Sifre-24680";

    call(
            t,
            token,
            post("/api/v1/auth/password"),
            Map.of("currentPassword", "yanlis-12345", "newPassword", newPassword))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("PASSWORD_INCORRECT"));
    call(
            t,
            token,
            post("/api/v1/auth/password"),
            Map.of("currentPassword", PASSWORD, "newPassword", "kisa1"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("PASSWORD_POLICY"));
    call(
            t,
            token,
            post("/api/v1/auth/password"),
            Map.of("currentPassword", PASSWORD, "newPassword", newPassword))
        .andExpect(status().isNoContent());

    // Eski erişim token'ı ve eski şifre geçersizdir.
    mvc.perform(get("/api/v1/auth/me").with(tenant(t)).with(bearer(token)))
        .andExpect(status().isUnauthorized());
    postLogin(t, email, PASSWORD, null).andExpect(status().isUnauthorized());
    token = login(t, email, newPassword, null).get("accessToken").asText();

    // Açık olmayan doğrulama kapatılamaz; kurulum kodsuz etkinleşmez.
    call(t, token, post("/api/v1/auth/2fa/disable"), Map.of("code", "123456"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("TOTP_INVALID"));
    String secret =
        body(call(t, token, post("/api/v1/auth/2fa/setup"), null).andExpect(status().isOk()))
            .get("secret")
            .asText();
    call(t, token, post("/api/v1/auth/2fa/enable"), Map.of("code", "000000"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("TOTP_INVALID"));
    call(t, token, post("/api/v1/auth/2fa/enable"), Map.of("code", code(secret, -1)))
        .andExpect(status().isNoContent());
    call(t, token, post("/api/v1/auth/2fa/setup"), null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("TWO_FACTOR_ALREADY_ENABLED"));

    call(t, token, post("/api/v1/auth/2fa/disable"), Map.of("code", "000000"))
        .andExpect(status().isBadRequest());
    call(t, token, post("/api/v1/auth/2fa/disable"), Map.of("code", code(secret, 0)))
        .andExpect(status().isNoContent());
    postLogin(t, email, newPassword, null).andExpect(status().isOk());
  }

  @Test
  void davetYenidenGonderilirKullaniciKapatilirSilinirSonYoneticiKorunur() throws Exception {
    String t = "idl-usr";
    createTenant(t);
    String operations = roleId(t, "OPERATIONS");
    String email = "ops@" + t + ".test";

    String user =
        body(call(
                    t,
                    null,
                    post(ID + "/users"),
                    Map.of("email", email, "fullName", "Operasyon", "roleIds", List.of(operations)))
                .andExpect(status().isCreated()))
            .get("id")
            .asText();
    call(t, null, post(ID + "/users/" + user + "/resend-invite"), null)
        .andExpect(status().isAccepted());
    String userToken = acceptInviteAndLogin(t, email);
    call(t, null, post(ID + "/users/" + user + "/resend-invite"), null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("USER_NOT_INVITED"));
    call(t, null, get(ID + "/users/" + UUID.randomUUID()), null)
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("USER_NOT_FOUND"));

    // Kapatılan kullanıcının oturumu düşer, yeniden açılınca girebilir.
    Map<String, Object> disabled =
        Map.of("fullName", "Operasyon", "roleIds", List.of(operations), "enabled", false);
    call(t, null, put(ID + "/users/" + user), disabled).andExpect(status().isOk());
    mvc.perform(get("/api/v1/auth/me").with(tenant(t)).with(bearer(userToken)))
        .andExpect(status().isUnauthorized());
    postLogin(t, email, PASSWORD, null).andExpect(status().isUnauthorized());
    call(
            t,
            null,
            put(ID + "/users/" + user),
            Map.of("fullName", "Operasyon", "roleIds", List.of(operations), "enabled", true))
        .andExpect(status().isOk());
    postLogin(t, email, PASSWORD, null).andExpect(status().isOk());

    // Var olmayan rol atanamaz; son yönetici silinemez, diğer kullanıcı silinir.
    call(
            t,
            null,
            put(ID + "/users/" + user),
            Map.of("fullName", "Operasyon", "roleIds", List.of(UUID.randomUUID()), "enabled", true))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("ROLE_NOT_FOUND"));
    String owner = userIdOf(t, ownerEmail(t));
    call(t, null, delete(ID + "/users/" + owner), null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("LAST_OWNER"));
    call(t, null, delete(ID + "/users/" + user), null).andExpect(status().isNoContent());
    assertThat(body(call(t, null, get(ID + "/users"), null)).findValuesAsText("email"))
        .doesNotContain(email);
  }

  @Test
  void kullanilanRolSilinemezKilitliRolDegismezBosRolSilinir() throws Exception {
    String t = "idl-role";
    createTenant(t);
    String role =
        body(call(
                    t,
                    null,
                    post(ID + "/roles"),
                    Map.of(
                        "code", "DEPO_SEFI",
                        "name", "Depo Şefi",
                        "priority", 5,
                        "landingPath", "/warehouse",
                        "permissions", List.of("WAREHOUSE_VIEW")))
                .andExpect(status().isCreated()))
            .get("id")
            .asText();
    String user =
        body(call(
                    t,
                    null,
                    post(ID + "/users"),
                    Map.of(
                        "email",
                        "depo@" + t + ".test",
                        "fullName",
                        "Depo",
                        "roleIds",
                        List.of(role)))
                .andExpect(status().isCreated()))
            .get("id")
            .asText();

    call(t, null, delete(ID + "/roles/" + role), null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("ROLE_IN_USE"));
    call(
            t,
            null,
            delete(ID + "/roles/" + roleId(t, org.ece.blackrose.identity.domain.Role.OWNER_CODE)),
            null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("ROLE_LOCKED"));
    call(t, null, delete(ID + "/roles/" + UUID.randomUUID()), null)
        .andExpect(status().isNotFound());

    call(t, null, delete(ID + "/users/" + user), null).andExpect(status().isNoContent());
    call(t, null, delete(ID + "/roles/" + role), null).andExpect(status().isNoContent());
    assertThat(body(call(t, null, get(ID + "/roles"), null)).findValuesAsText("code"))
        .doesNotContain("DEPO_SEFI");
  }

  // Yardımcılar

  private ResultActions call(
      String t, String token, MockHttpServletRequestBuilder request, Object payload)
      throws Exception {
    request.with(tenant(t)).with(token == null ? asOwner(t) : bearer(token));
    if (payload != null) {
      request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(payload));
    }
    return mvc.perform(request);
  }

  private String roleId(String t, String code) throws Exception {
    for (JsonNode role : body(call(t, null, get(ID + "/roles"), null))) {
      if (role.get("code").asText().equals(code)) {
        return role.get("id").asText();
      }
    }
    throw new AssertionError("Rol yok: " + code);
  }

  private String userIdOf(String t, String email) throws Exception {
    for (JsonNode user : body(call(t, null, get(ID + "/users"), null)).path("content")) {
      if (user.get("email").asText().equals(email)) {
        return user.get("id").asText();
      }
    }
    throw new AssertionError("Kullanıcı yok: " + email);
  }

  private static String code(String secret, int stepOffset) {
    return Totp.codeAt(secret, Totp.stepAt(Instant.now().getEpochSecond()) + stepOffset);
  }
}
