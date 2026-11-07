package org.ece.blackrose.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.ece.blackrose.AbstractIntegrationTest;
import org.ece.blackrose.tenant.TenantContext;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

class NotificationIT extends AbstractIntegrationTest {

  private static final LocalDate TODAY = LocalDate.now();

  @Autowired DailyDigestMailer digest;
  @Autowired TenantRepository tenants;

  @Test
  void digestGroupsTopicsByPermissionPreferenceAndDay() throws Exception {
    String t = "ntf-dig";
    createTenant(t);
    String finance = "finans@" + t + ".test";
    invite(t, finance, "FINANCE");
    String financeToken = acceptInviteAndLogin(t, finance);

    String truck = created(owner(t, post("/api/v1/fleet/vehicles"), vehicle("06NT01")));
    owner(
            t,
            post("/api/v1/fleet/VEHICLE/" + truck + "/documents"),
            Map.of("docType", "INSPECTION", "expiresOn", TODAY.minusDays(1).toString()))
        .andExpect(status().isCreated());
    String branch =
        created(
            owner(t, post("/api/v1/organization/branches"), Map.of("code", "M", "name", "Merkez")));
    String supplier =
        created(
            owner(
                t,
                post("/api/v1/finance/accounts"),
                Map.of("code", "T1", "name", "Tedarikçi Ltd", "type", "SUPPLIER")));
    String pending = plan(t, supplier, branch, "150", TODAY.plusDays(10));
    owner(t, post("/api/v1/finance/payment-plans/" + pending + "/submit"), null)
        .andExpect(status().isOk());
    owner(t, put("/api/v1/finance/settings"), Map.of("allowSelfApproval", true))
        .andExpect(status().isOk());
    String due = plan(t, supplier, branch, "250", TODAY.plusDays(1));
    owner(t, post("/api/v1/finance/payment-plans/" + due + "/submit"), null)
        .andExpect(status().isOk());
    owner(t, post("/api/v1/finance/payment-plans/" + due + "/approve"), Map.of())
        .andExpect(status().isOk());

    assertThat(run(t, TODAY)).isEqualTo(2);
    Notice ownerMail = last(ownerEmail(t));
    assertThat(ownerMail.subject())
        .startsWith("Günlük özet:")
        .contains(
            "Filo hatırlatması: 1 kayıt", "Onay bekleyen ödeme planı: 1", "Vadesi gelen ödeme: 1");
    assertThat(ownerMail.text())
        .contains(
            "06NT01 — Muayene",
            "Tedarikçi Ltd — 150 TRY",
            "Tedarikçi Ltd — 250 TRY",
            "/finance/plans")
        .doesNotContain("sürücü masrafı");
    Notice financeMail = last(finance);
    assertThat(financeMail.subject()).isEqualTo("Vadesi gelen ödeme: 1");
    assertThat(financeMail.text()).doesNotContain("Filo", "150 TRY");

    assertThat(run(t, TODAY)).isZero();

    // Tercihler: yalnız yetkili konular listelenir ve değiştirilebilir.
    JsonNode ownerPrefs = body(owner(t, get("/api/v1/notifications/preferences"), null));
    assertThat(ownerPrefs.size()).isEqualTo(NotificationTopic.values().length);
    assertThat(ownerPrefs.findValuesAsText("topic")).contains("FLEET_REMINDERS");
    JsonNode financePrefs =
        body(
            mvc.perform(
                get("/api/v1/notifications/preferences")
                    .with(tenant(t))
                    .with(bearer(financeToken))));
    assertThat(financePrefs.findValuesAsText("topic")).containsExactly("PAYMENT_DUE");
    mvc.perform(
            put("/api/v1/notifications/preferences")
                .with(tenant(t))
                .with(bearer(financeToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(prefs("FLEET_REMINDERS", false)))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("TOPIC_NOT_ALLOWED"));
    mvc.perform(
            put("/api/v1/notifications/preferences")
                .with(tenant(t))
                .with(bearer(financeToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"items\":[{\"topic\":null,\"email\":true}]}"))
        .andExpect(status().isBadRequest());

    mvc.perform(
            put("/api/v1/notifications/preferences")
                .with(asOwner(t))
                .contentType(MediaType.APPLICATION_JSON)
                .content(prefs("FLEET_REMINDERS", false)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[?(@.topic=='FLEET_REMINDERS')].email").value(false));

    assertThat(run(t, TODAY.plusDays(1))).isEqualTo(2);
    assertThat(last(ownerEmail(t)).text()).doesNotContain("Filo").contains("250 TRY");

    // Firma filo hatırlatma e-postasını kapatırsa kimse almaz.
    owner(
            t,
            put("/api/v1/fleet/settings"),
            Map.of("blockOnExpired", true, "reminderDays", 30, "reminderEmail", false))
        .andExpect(status().isOk());
    mvc.perform(
            put("/api/v1/notifications/preferences")
                .with(asOwner(t))
                .contentType(MediaType.APPLICATION_JSON)
                .content(prefs("FLEET_REMINDERS", true)))
        .andExpect(status().isOk());
    assertThat(run(t, TODAY.plusDays(2))).isEqualTo(2);
    assertThat(last(ownerEmail(t)).text()).doesNotContain("Filo");
  }

  private int run(String t, LocalDate day) {
    TenantContext.set(t, tenants.findByCode(t).orElseThrow().getSchemaName());
    try {
      return digest.sendForCurrentTenant(day);
    } finally {
      TenantContext.clear();
    }
  }

  private static Notice last(String email) {
    List<Notice> mine = SENT_NOTICES.stream().filter(n -> n.email().equals(email)).toList();
    assertThat(mine).isNotEmpty();
    return mine.get(mine.size() - 1);
  }

  private String prefs(String topic, boolean email) throws Exception {
    return json.writeValueAsString(
        Map.of("items", List.of(Map.of("topic", topic, "email", email))));
  }

  private static Map<String, Object> vehicle(String plate) {
    return Map.of("plate", plate, "kind", "TRUCK", "ownership", "OWNED", "status", "ACTIVE");
  }

  private String plan(String t, String account, String branch, String amount, LocalDate due)
      throws Exception {
    return created(
        owner(
            t,
            post("/api/v1/finance/payment-plans"),
            Map.of(
                "accountId",
                account,
                "branchId",
                branch,
                "money",
                Map.of("amount", amount, "currency", "TRY"),
                "dueDate",
                due.toString())));
  }

  private void invite(String t, String email, String roleCode) throws Exception {
    String roleId = null;
    for (JsonNode role : body(mvc.perform(get("/api/v1/identity/roles").with(asOwner(t))))) {
      if (roleCode.equals(role.get("code").asText())) {
        roleId = role.get("id").asText();
      }
    }
    owner(
            t,
            post("/api/v1/identity/users"),
            Map.of("email", email, "fullName", "Test", "roleIds", List.of(roleId)))
        .andExpect(status().isCreated());
  }

  private ResultActions owner(String t, MockHttpServletRequestBuilder request, Object body)
      throws Exception {
    request.with(asOwner(t));
    if (body != null) {
      request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
    }
    return mvc.perform(request);
  }

  private String created(ResultActions actions) throws Exception {
    return body(actions.andExpect(status().isCreated())).get("id").asText();
  }
}
