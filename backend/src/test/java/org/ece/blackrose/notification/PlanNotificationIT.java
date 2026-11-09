package org.ece.blackrose.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Map;
import org.ece.blackrose.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Ödeme planı onaya gönderilince, onaylanınca ve reddedilince giden anlık e-postalar. */
class PlanNotificationIT extends AbstractIntegrationTest {

  @Test
  void onayaGonderilenPlanOnaycilaraKararPlaniGirenegiderTercihlerUygulanir() throws Exception {
    String t = "pln-" + Long.toString(System.nanoTime(), 36);
    createTenant(t);
    String owner = ownerEmail(t);
    String finance = "finans@" + t + ".test";
    String approver = "onay@" + t + ".test";
    invite(t, finance, "FINANCE");
    invite(t, approver, "FINANCE_SUPER");
    String financeToken = acceptInviteAndLogin(t, finance);
    String approverToken = acceptInviteAndLogin(t, approver);

    String branch =
        id(
            as(
                t,
                null,
                post("/api/v1/organization/branches"),
                Map.of("code", "S1", "name", "Merkez")));
    String supplier =
        id(
            as(
                t,
                null,
                post("/api/v1/finance/accounts"),
                Map.of("code", "T1", "name", "Yakıt A.Ş.", "type", "SUPPLIER")));

    // Finans kullanıcısı girer ve onaya gönderir: onaycılara gider, kendisine gitmez.
    String plan = plan(t, financeToken, supplier, branch, "12500");
    as(t, financeToken, post("/api/v1/finance/payment-plans/" + plan + "/submit"), null)
        .andExpect(status().isOk());
    Notice pending = await(owner, "Onay bekleyen ödeme planı: Yakıt A.Ş. — 12.500,00 TRY");
    assertThat(pending.text())
        .contains("Cari: Yakıt A.Ş.", "Tutar: 12.500,00 TRY", "Onaya gönderen: " + finance)
        .contains("/finance/plans");
    await(approver, "Onay bekleyen ödeme planı: Yakıt A.Ş. — 12.500,00 TRY");
    assertThat(sent(finance)).isEmpty();

    // Patron gerekçeyle reddeder: planı girene gerekçesiyle gider.
    as(
            t,
            null,
            post("/api/v1/finance/payment-plans/" + plan + "/reject"),
            Map.of("note", "Fatura eki eksik"))
        .andExpect(status().isOk());
    Notice rejected = await(finance, "Ödeme planı reddedildi: Yakıt A.Ş. — 12.500,00 TRY");
    assertThat(rejected.text()).contains("Reddeden: " + owner, "Ret gerekçesi: Fatura eki eksik");

    // Onaycı konuyu kapatır; yeniden gönderilen plan yalnız patrona gider.
    as(
            t,
            approverToken,
            put("/api/v1/notifications/preferences"),
            Map.of("items", List.of(Map.of("topic", "PAYMENT_APPROVAL", "email", false))))
        .andExpect(status().isOk());
    int ownerBefore = sent(owner).size();
    int approverBefore = sent(approver).size();
    as(t, financeToken, post("/api/v1/finance/payment-plans/" + plan + "/submit"), null)
        .andExpect(status().isOk());
    awaitCount(owner, ownerBefore + 1);
    Thread.sleep(300);
    assertThat(sent(approver)).hasSize(approverBefore);

    // Onaycı onaylar: planı girene gider.
    as(t, approverToken, post("/api/v1/finance/payment-plans/" + plan + "/approve"), Map.of())
        .andExpect(status().isOk());
    Notice approved = await(finance, "Ödeme planı onaylandı: Yakıt A.Ş. — 12.500,00 TRY");
    assertThat(approved.text()).contains("Onaylayan: " + approver, "Ödeme yapılabilir");

    // Planı giren karar konusunu kapatırsa ona da gitmez.
    as(
            t,
            financeToken,
            put("/api/v1/notifications/preferences"),
            Map.of("items", List.of(Map.of("topic", "PLAN_DECISION", "email", false))))
        .andExpect(status().isOk());
    String second = plan(t, financeToken, supplier, branch, "300");
    as(t, financeToken, post("/api/v1/finance/payment-plans/" + second + "/submit"), null)
        .andExpect(status().isOk());
    int financeBefore = sent(finance).size();
    as(
            t,
            null,
            post("/api/v1/finance/payment-plans/" + second + "/reject"),
            Map.of("note", "Mükerrer"))
        .andExpect(status().isOk());
    Thread.sleep(300);
    assertThat(sent(finance)).hasSize(financeBefore);
  }

  // Yardımcılar

  private ResultActions as(
      String t, String token, MockHttpServletRequestBuilder request, Object body) throws Exception {
    request.with(token == null ? asOwner(t) : bearer(token)).with(tenant(t));
    if (body != null) {
      request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
    }
    return mvc.perform(request);
  }

  private String id(ResultActions actions) throws Exception {
    return body(actions.andExpect(status().isCreated())).get("id").asText();
  }

  private String plan(String t, String token, String account, String branch, String amount)
      throws Exception {
    return id(
        as(
            t,
            token,
            post("/api/v1/finance/payment-plans"),
            Map.of(
                "accountId",
                account,
                "branchId",
                branch,
                "money",
                Map.of("amount", amount, "currency", "TRY"),
                "dueDate",
                tenantToday().plusDays(5).toString(),
                "description",
                "Kasım yakıtı")));
  }

  private void invite(String t, String email, String roleCode) throws Exception {
    String roleId = null;
    for (JsonNode role : body(mvc.perform(get("/api/v1/identity/roles").with(asOwner(t))))) {
      if (roleCode.equals(role.get("code").asText())) {
        roleId = role.get("id").asText();
      }
    }
    as(
            t,
            null,
            post("/api/v1/identity/users"),
            Map.of("email", email, "fullName", "Test", "roleIds", List.of(roleId)))
        .andExpect(status().isCreated());
  }

  private static List<Notice> sent(String email) {
    return SENT_NOTICES.stream().filter(n -> n.email().equals(email)).toList();
  }

  /** E-posta işlem kaydedildikten sonra arka planda gider. */
  private static Notice await(String email, String subject) throws InterruptedException {
    for (int i = 0; i < 100; i++) {
      for (Notice notice : sent(email)) {
        if (notice.subject().equals(subject)) {
          return notice;
        }
      }
      Thread.sleep(50);
    }
    throw new AssertionError(email + " için e-posta gelmedi: " + subject + " — " + sent(email));
  }

  private static void awaitCount(String email, int count) throws InterruptedException {
    for (int i = 0; i < 100 && sent(email).size() < count; i++) {
      Thread.sleep(50);
    }
    assertThat(sent(email)).hasSize(count);
  }
}
