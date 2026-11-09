package org.ece.blackrose.saas;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import io.micrometer.core.instrument.MeterRegistry;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.ece.blackrose.AbstractIntegrationTest;
import org.ece.blackrose.saas.service.BillingService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

class SaasIT extends AbstractIntegrationTest {

  private static final String ADMIN = "/api/v1/admin";
  private static final LocalDate TODAY = tenantToday();

  @Autowired private BillingService billing;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private MeterRegistry meters;

  @Test
  void newTenantStartsOnTrialAndExpiredTrialBlocksUntilExtended() throws Exception {
    createTenant("saas-trial");
    UUID id = tenantId("saas-trial");
    JsonNode overview = overview("saas-trial");
    assertThat(overview.get("subscriptionStatus").asText()).isEqualTo("TRIAL");
    assertThat(overview.get("trialEndsOn").asText()).isEqualTo(TODAY.plusDays(14).toString());

    billing.process(id, TODAY.plusDays(14));
    meStatus("saas-trial").andExpect(status().isOk());

    billing.process(id, TODAY.plusDays(15));
    meStatus("saas-trial")
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("TENANT_NOT_ACTIVE"));
    assertThat(overview("saas-trial").get("suspendReason").asText()).isEqualTo("TRIAL_ENDED");

    admin(post(ADMIN + "/tenants/" + id + "/resume"), null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("TRIAL_ENDED"));

    admin(
            post(ADMIN + "/tenants/" + id + "/extend-trial"),
            Map.of("until", TODAY.plusDays(30).toString()))
        .andExpect(status().isNoContent());
    meStatus("saas-trial").andExpect(status().isOk());
    assertThat(overview("saas-trial").get("subscriptionStatus").asText()).isEqualTo("TRIAL");
  }

  @Test
  void planLimitBlocksAndUpgradeLiftsItAndDowngradeBelowUsageIsRefused() throws Exception {
    createTenant("saas-limit");
    UUID id = tenantId("saas-limit");
    String small = plan("KUCUK", "0", 5, 1, 50);
    String large = plan("BUYUK", "0", 5, 3, 50);
    admin(put(ADMIN + "/tenants/" + id + "/plan"), Map.of("planId", small))
        .andExpect(status().isNoContent());

    vehicle("saas-limit", "34LM01").andExpect(status().isCreated());
    vehicle("saas-limit", "34LM02")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("PLAN_LIMIT_EXCEEDED"));

    JsonNode mine =
        body(
            mvc.perform(get("/api/v1/subscription").with(asOwner("saas-limit")))
                .andExpect(status().isOk()));
    JsonNode vehicles = limit(mine.get("limits"), "VEHICLES");
    assertThat(vehicles.get("used").asInt()).isEqualTo(1);
    assertThat(vehicles.get("reached").asBoolean()).isTrue();
    assertThat(vehicles.get("warning").asBoolean()).isTrue();

    admin(put(ADMIN + "/tenants/" + id + "/plan"), Map.of("planId", large))
        .andExpect(status().isNoContent());
    vehicle("saas-limit", "34LM02").andExpect(status().isCreated());

    admin(put(ADMIN + "/tenants/" + id + "/plan"), Map.of("planId", small))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("PLAN_USAGE_EXCEEDED"));
  }

  @Test
  void paidSubscriptionIsInvoicedOncePerPeriodAndPaidByProvider() throws Exception {
    createTenant("saas-pay");
    UUID id = tenantId("saas-pay");
    admin(
            put(ADMIN + "/tenants/" + id + "/plan"),
            Map.of("planId", plan("UCRETLI", "1000", 9, 9, 99)))
        .andExpect(status().isNoContent());
    admin(post(ADMIN + "/tenants/" + id + "/activate"), null).andExpect(status().isNoContent());

    billing.process(id, TODAY);
    billing.process(id, TODAY);

    List<JsonNode> invoices = invoicesOf("saas-pay");
    assertThat(invoices).hasSize(1);
    assertThat(invoices.get(0).get("status").asText()).isEqualTo("PAID");
    assertThat(invoices.get(0).get("amount").decimalValue()).isEqualByComparingTo("1000");
    assertThat(invoices.get(0).get("paymentRef").asText()).startsWith("MOCK-");
    assertThat(overview("saas-pay").get("nextBillingOn").asText())
        .isEqualTo(TODAY.plusMonths(1).toString());

    billing.process(id, TODAY.plusMonths(1));
    assertThat(invoicesOf("saas-pay")).hasSize(2);
  }

  @Test
  void failedPaymentRemindsThenSuspendsAndPaymentRestoresAccess() throws Exception {
    createTenant("saas-dun-fail");
    UUID id = tenantId("saas-dun-fail");
    admin(put(ADMIN + "/tenants/" + id + "/plan"), Map.of("planId", plan("RED", "500", 9, 9, 99)))
        .andExpect(status().isNoContent());
    admin(post(ADMIN + "/tenants/" + id + "/activate"), null).andExpect(status().isNoContent());

    billing.process(id, TODAY);
    JsonNode invoice = invoicesOf("saas-dun-fail").get(0);
    assertThat(invoice.get("status").asText()).isEqualTo("ISSUED");
    assertThat(invoice.get("failedAttempts").asInt()).isEqualTo(1);
    assertThat(overview("saas-dun-fail").get("subscriptionStatus").asText()).isEqualTo("PAST_DUE");
    meStatus("saas-dun-fail").andExpect(status().isOk());

    LocalDate due = LocalDate.parse(invoice.get("dueOn").asText());
    billing.process(id, due.plusDays(1));
    assertThat(invoicesOf("saas-dun-fail").get(0).get("reminderCount").asInt()).isEqualTo(1);
    billing.process(id, due.plusDays(8));
    assertThat(invoicesOf("saas-dun-fail").get(0).get("reminderCount").asInt()).isEqualTo(2);
    // En çok üç deneme yapılır.
    assertThat(invoicesOf("saas-dun-fail").get(0).get("failedAttempts").asInt()).isEqualTo(3);

    billing.process(id, due.plusDays(14));
    meStatus("saas-dun-fail")
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("TENANT_NOT_ACTIVE"));
    assertThat(overview("saas-dun-fail").get("suspendReason").asText()).isEqualTo("PAYMENT");

    // Vadesi geçmiş fatura varken elle açılamaz; ödeme erişimi geri verir.
    jdbc.update(
        "update admin.saas_invoice set due_on = ? where id = ?::uuid",
        TODAY.minusDays(20),
        invoice.get("id").asText());
    admin(post(ADMIN + "/tenants/" + id + "/resume"), null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INVOICE_OVERDUE"));
    admin(
            post(ADMIN + "/invoices/" + invoice.get("id").asText() + "/pay"),
            Map.of("date", TODAY.toString(), "reference", "EFT-1"))
        .andExpect(status().isOk());
    meStatus("saas-dun-fail").andExpect(status().isOk());
    assertThat(overview("saas-dun-fail").get("subscriptionStatus").asText()).isEqualTo("ACTIVE");

    admin(
            post(ADMIN + "/invoices/" + invoice.get("id").asText() + "/pay"),
            Map.of("date", TODAY.toString(), "reference", "EFT-2"))
        .andExpect(status().isConflict());
  }

  @Test
  void suspendAndCloseCutAccessKeepDataAndRequireConfirmation() throws Exception {
    createTenant("saas-close");
    UUID id = tenantId("saas-close");
    vehicle("saas-close", "34CL01").andExpect(status().isCreated());

    admin(post(ADMIN + "/tenants/" + id + "/suspend"), null).andExpect(status().isNoContent());
    meStatus("saas-close").andExpect(status().isForbidden());
    postLogin("saas-close", ownerEmail("saas-close"), PASSWORD, null)
        .andExpect(status().isForbidden());
    admin(post(ADMIN + "/tenants/" + id + "/resume"), null).andExpect(status().isNoContent());
    meStatus("saas-close").andExpect(status().isOk());

    admin(post(ADMIN + "/tenants/" + id + "/close"), Map.of("confirmCode", "yanlis"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("CONFIRM_CODE_MISMATCH"));
    meStatus("saas-close").andExpect(status().isOk());

    admin(post(ADMIN + "/tenants/" + id + "/close"), Map.of("confirmCode", "saas-close"))
        .andExpect(status().isNoContent());
    meStatus("saas-close").andExpect(status().isForbidden());
    assertThat(overview("saas-close").get("status").asText()).isEqualTo("CLOSED");
    assertThat(limit(overview("saas-close").get("limits"), "VEHICLES").get("used").asInt())
        .isEqualTo(1);

    admin(post(ADMIN + "/tenants/" + id + "/resume"), null).andExpect(status().isNoContent());
    meStatus("saas-close").andExpect(status().isOk());
  }

  @Test
  void reopenedTenantIsNotBilledForTheMonthsItWasClosed() throws Exception {
    createTenant("saas-reopen");
    UUID id = tenantId("saas-reopen");
    admin(
            put(ADMIN + "/tenants/" + id + "/plan"),
            Map.of("planId", plan("YENIDEN", "100", 9, 9, 99)))
        .andExpect(status().isNoContent());
    admin(post(ADMIN + "/tenants/" + id + "/activate"), null).andExpect(status().isNoContent());
    admin(post(ADMIN + "/tenants/" + id + "/close"), Map.of("confirmCode", "saas-reopen"))
        .andExpect(status().isNoContent());
    jdbc.update(
        "update admin.subscription set next_billing_on = ? where tenant_id = ?",
        TODAY.minusMonths(5),
        id);

    admin(post(ADMIN + "/tenants/" + id + "/resume"), null).andExpect(status().isNoContent());
    billing.process(id, TODAY);

    assertThat(invoicesOf("saas-reopen")).hasSize(1);
    assertThat(overview("saas-reopen").get("nextBillingOn").asText())
        .isEqualTo(TODAY.plusMonths(1).toString());
  }

  @Test
  void exportContainsBusinessDataButNeverSecretsAndIsLoggedOnBothSides() throws Exception {
    createTenant("saas-exp");
    vehicle("saas-exp", "34EX99").andExpect(status().isCreated());
    UUID id = tenantId("saas-exp");

    byte[] zip =
        mvc.perform(get(ADMIN + "/tenants/" + id + "/export").with(bearer(saasToken())))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsByteArray();

    Map<String, String> files = new HashMap<>();
    try (ZipInputStream stream = new ZipInputStream(new ByteArrayInputStream(zip))) {
      ZipEntry entry;
      while ((entry = stream.getNextEntry()) != null) {
        files.put(entry.getName(), new String(stream.readAllBytes(), StandardCharsets.UTF_8));
      }
    }
    assertThat(files).containsKeys("BENIOKU.txt", "vehicle.csv", "app_user.csv");
    assertThat(files.get("vehicle.csv")).contains("34EX99");
    assertThat(files.get("app_user.csv")).contains(ownerEmail("saas-exp"));
    assertThat(files.get("app_user.csv").lines().findFirst().orElseThrow())
        .doesNotContain("password")
        .doesNotContain("totp")
        .doesNotContain("token");
    assertThat(files).doesNotContainKeys("refresh_token.csv", "user_token.csv");
    assertThat(String.join("", files.values())).doesNotContain("$2a$");

    assertThat(
            jdbc.queryForObject(
                "select count(*) from admin.audit_log where event_type = 'TENANT_DATA_EXPORTED' and target = ?",
                Integer.class,
                "saas-exp"))
        .isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from \"tenant_saas_exp\".audit_log where event_type = 'TENANT_DATA_EXPORTED'",
                Integer.class))
        .isEqualTo(1);
  }

  @Test
  void consoleIsAdminOnlyReportsPresenceAndEveryAccessIsAudited() throws Exception {
    createTenant("saas-cons");
    meStatus("saas-cons").andExpect(status().isOk());

    String token = saasToken();
    JsonNode online = overview("saas-cons").get("online");
    assertThat(online.get("active").asInt()).isEqualTo(1);

    JsonNode health =
        body(mvc.perform(get(ADMIN + "/health").with(bearer(token))).andExpect(status().isOk()));
    assertThat(health.get("databaseUp").asBoolean()).isTrue();
    assertThat(health.get("requests").asLong()).isGreaterThan(0);
    assertThat(health.get("onlineActive").asLong()).isGreaterThanOrEqualTo(1);
    // Testte SMTP ve virüs tarama tanımlı değildir, dosyalar yerel diske yazılır, ödeme deneme
    // sağlayıcısıdır.
    Map<String, String> states = new HashMap<>();
    health
        .get("dependencies")
        .forEach(d -> states.put(d.get("key").asText(), d.get("state").asText()));
    assertThat(states)
        .containsEntry("mail", "NOT_CONFIGURED")
        .containsEntry("maildomain", "NOT_CONFIGURED")
        .containsEntry("storage", "UP")
        .containsEntry("scanner", "NOT_CONFIGURED")
        .containsEntry("payment", "WARNING");
    mvc.perform(get(ADMIN + "/health").param("fresh", "true").with(bearer(token)))
        .andExpect(status().isOk());
    // Aynı sonuç izleme göstergesiyle de yayımlanır.
    assertThat(dependencyGauge("storage")).isEqualTo(1.0);
    assertThat(dependencyGauge("mail")).isEqualTo(-1.0);

    // Firma yöneticisi konsola giremez.
    mvc.perform(get(ADMIN + "/tenants").with(bearer(ownerToken("saas-cons"))))
        .andExpect(status().isUnauthorized());
    mvc.perform(get(ADMIN + "/tenants")).andExpect(status().isUnauthorized());
    // Yönetici token'ı firma verisine giremez.
    mvc.perform(get("/api/v1/subscription").with(tenant("saas-cons")).with(bearer(token)))
        .andExpect(status().isUnauthorized());

    assertThat(
            jdbc.queryForObject(
                "select count(*) from admin.audit_log where event_type = 'SAAS_ADMIN_ACCESS' and target = ?",
                Integer.class,
                "GET " + ADMIN + "/health"))
        .isGreaterThanOrEqualTo(1);
    JsonNode logs =
        body(
            mvc.perform(get(ADMIN + "/audit-logs").with(bearer(token))).andExpect(status().isOk()));
    assertThat(logs.get("content")).isNotEmpty();
  }

  @Test
  void subscriptionPermissionIsRequiredInsideTenant() throws Exception {
    createTenant("saas-perm");
    mvc.perform(get("/api/v1/subscription").with(asOwner("saas-perm"))).andExpect(status().isOk());
    createBranch("saas-perm", "S1");
    String roleId = null;
    for (JsonNode role :
        body(mvc.perform(get("/api/v1/identity/roles").with(asOwner("saas-perm"))))) {
      if ("OPERATIONS".equals(role.get("code").asText())) {
        roleId = role.get("id").asText();
      }
    }
    String email = "ops@saas-perm.test";
    mvc.perform(
            post("/api/v1/identity/users")
                .with(asOwner("saas-perm"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of("email", email, "fullName", "O", "roleIds", List.of(roleId)))))
        .andExpect(status().isCreated());
    String ops = acceptInviteAndLogin("saas-perm", email);
    mvc.perform(get("/api/v1/subscription").with(tenant("saas-perm")).with(bearer(ops)))
        .andExpect(status().isForbidden());
  }

  /**
   * Vade, faturanın firmasının yerel tarihiyle değerlendirilir. UTC+14 ile UTC−11 arasında takvim
   * en az bir gün farklıdır: batıdaki firmanın bugünü vadeli fatura doğuda gecikmiş, batıda
   * değildir.
   */
  @Test
  void overdueInvoicesAreCountedByEachTenantsOwnDate() throws Exception {
    String planId = plan("SAAT", "700", 9, 9, 99);
    String east = "saas-east-fail";
    String west = "saas-west-fail";
    Map<String, String> zones = Map.of(east, "Pacific/Kiritimati", west, "Pacific/Pago_Pago");
    for (String code : List.of(east, west)) {
      createTenant(code);
      UUID id = tenantId(code);
      admin(put(ADMIN + "/tenants/" + id + "/plan"), Map.of("planId", planId))
          .andExpect(status().isNoContent());
      admin(post(ADMIN + "/tenants/" + id + "/activate"), null).andExpect(status().isNoContent());
      billing.process(id, TODAY);
      jdbc.update("update admin.tenant set time_zone = ? where id = ?", zones.get(code), id);
    }
    LocalDate westToday = LocalDate.now(ZoneId.of(zones.get(west)));
    String eastInvoice = invoicesOf(east).get(0).get("id").asText();
    String westInvoice = invoicesOf(west).get(0).get("id").asText();
    String setDue = "update admin.saas_invoice set due_on = ? where id = ?::uuid";

    jdbc.update(setDue, westToday.plusDays(30), eastInvoice);
    jdbc.update(setDue, westToday.plusDays(30), westInvoice);
    long before = overdueInvoices();
    jdbc.update(setDue, westToday, eastInvoice);
    jdbc.update(setDue, westToday, westInvoice);

    assertThat(overdueInvoices()).isEqualTo(before + 1);
  }

  // Yardımcılar

  private double dependencyGauge(String key) {
    return meters.get("blackrose.dependency.up").tag("dependency", key).gauge().value();
  }

  private long overdueInvoices() throws Exception {
    return body(admin(get(ADMIN + "/health"), null).andExpect(status().isOk()))
        .get("overdueInvoices")
        .asLong();
  }

  private ResultActions admin(
      org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request,
      Object body)
      throws Exception {
    request.with(bearer(saasToken()));
    if (body != null) {
      request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
    }
    return mvc.perform(request);
  }

  private ResultActions meStatus(String code) throws Exception {
    return mvc.perform(get("/api/v1/auth/me").with(asOwner(code)));
  }

  private String ownerToken(String code) throws Exception {
    return login(code, ownerEmail(code), PASSWORD, null).get("accessToken").asText();
  }

  private ResultActions vehicle(String code, String plate) throws Exception {
    return mvc.perform(
        post("/api/v1/fleet/vehicles")
            .with(asOwner(code))
            .contentType(MediaType.APPLICATION_JSON)
            .content(
                json.writeValueAsString(
                    Map.of(
                        "plate",
                        plate,
                        "kind",
                        "TRUCK",
                        "ownership",
                        "OWNED",
                        "status",
                        "ACTIVE"))));
  }

  private String plan(String code, String price, int users, int vehicles, int shipments)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("code", code);
    body.put("name", code);
    body.put("monthlyPrice", price);
    body.put("currency", "TRY");
    body.put("maxUsers", users);
    body.put("maxVehicles", vehicles);
    body.put("maxShipmentsMonth", shipments);
    body.put("active", true);
    return body(admin(post(ADMIN + "/plans"), body).andExpect(status().isCreated()))
        .get("id")
        .asText();
  }

  private JsonNode overview(String code) throws Exception {
    for (JsonNode row : body(admin(get(ADMIN + "/tenants"), null).andExpect(status().isOk()))) {
      if (code.equals(row.get("code").asText())) {
        return row;
      }
    }
    throw new AssertionError(code);
  }

  private UUID tenantId(String code) throws Exception {
    return UUID.fromString(overview(code).get("id").asText());
  }

  private List<JsonNode> invoicesOf(String code) throws Exception {
    List<JsonNode> rows = new java.util.ArrayList<>();
    for (JsonNode row : body(admin(get(ADMIN + "/invoices"), null).andExpect(status().isOk()))) {
      if (code.equals(row.get("tenantCode").asText())) {
        rows.add(row);
      }
    }
    return rows;
  }

  private static JsonNode limit(JsonNode limits, String resource) {
    for (JsonNode row : limits) {
      if (resource.equals(row.get("resource").asText())) {
        return row;
      }
    }
    throw new AssertionError(resource);
  }
}
