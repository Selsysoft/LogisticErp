package org.ece.blackrose.fleet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.ece.blackrose.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

class FleetIT extends AbstractIntegrationTest {

  private static final LocalDate TODAY = LocalDate.now();
  private static final String DATE = "2026-10-15";

  @Test
  void vehicleAndTrailerCrudNormalizesPlateAndRejectsDuplicate() throws Exception {
    String t = tenantCode("crud");
    String id = vehicle(t, "34 abc 12", "TRACTOR", "ACTIVE");
    vehicle(t, "34 DRS 99", "TRAILER", "ACTIVE");

    JsonNode found = body(send(t, get("/api/v1/fleet/vehicles/" + id)));
    assertThat(found.get("plate").asText()).isEqualTo("34ABC12");
    assertThat(body(send(t, get("/api/v1/fleet/vehicles"))).get("totalElements").asInt())
        .isEqualTo(2);

    post(t, "/api/v1/fleet/vehicles", vehicleBody("34abc12", "TRUCK", "ACTIVE"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("PLATE_TAKEN"));

    Map<String, Object> update = vehicleBody("34ABC12", "TRACTOR", "MAINTENANCE");
    send(
            t,
            MockMvcRequestBuilders.put("/api/v1/fleet/vehicles/" + id)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(update)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("MAINTENANCE"));
  }

  @Test
  void driverGetsOwnEmployeeAccount() throws Exception {
    String t = tenantCode("drv");
    JsonNode driver = driverNode(t, "S1", "Ali Veli");

    assertThat(driver.get("accountId").asText()).isNotBlank();
    JsonNode account =
        body(send(t, get("/api/v1/finance/accounts/" + driver.get("accountId").asText())));
    assertThat(account.get("type").asText()).isEqualTo("EMPLOYEE");
    assertThat(account.get("code").asText()).isEqualTo("SRC-S1");

    post(t, "/api/v1/fleet/drivers", driverBody("S1", "Başka")).andExpect(status().isConflict());
  }

  @Test
  void remindersListExpiringDocumentsAndOnlyLatestRenewal() throws Exception {
    String t = tenantCode("rem");
    String truck = vehicle(t, "06AA01", "TRUCK", "ACTIVE");
    String driver = driverNode(t, "S1", "Ali Veli").get("id").asText();
    document(t, "VEHICLE", truck, "INSPECTION", TODAY.minusDays(5));
    document(t, "VEHICLE", truck, "KASKO", TODAY.plusDays(10));
    document(t, "VEHICLE", truck, "EXHAUST", TODAY.plusDays(200));
    document(t, "DRIVER", driver, "SRC", TODAY.minusDays(100));
    document(t, "DRIVER", driver, "SRC", TODAY.plusDays(300));

    JsonNode reminders = body(send(t, get("/api/v1/fleet/reminders")));

    assertThat(reminders.size()).isEqualTo(2);
    assertThat(reminders.get(0).get("docType").asText()).isEqualTo("INSPECTION");
    assertThat(reminders.get(0).get("overdue").asBoolean()).isTrue();
    assertThat(reminders.get(0).get("subjectName").asText()).isEqualTo("06AA01");
    assertThat(reminders.get(1).get("docType").asText()).isEqualTo("KASKO");
    assertThat(reminders.get(1).get("overdue").asBoolean()).isFalse();

    assertThat(body(send(t, get("/api/v1/fleet/reminders").param("days", "365"))).size())
        .isEqualTo(4);
  }

  @Test
  void expiredDocumentBlocksOrWarnsByTenantSetting() throws Exception {
    String t = tenantCode("pol");
    String valid = vehicle(t, "06VA01", "TRUCK", "ACTIVE");
    validDocuments(t, valid);
    String expired = vehicle(t, "06EX01", "TRUCK", "ACTIVE");
    document(t, "VEHICLE", expired, "INSPECTION", TODAY.minusDays(1));
    document(t, "VEHICLE", expired, "TRAFFIC_INSURANCE", TODAY.plusDays(90));
    String missing = vehicle(t, "06MI01", "TRUCK", "ACTIVE");

    Map<String, JsonNode> blocked = availability(t, "VEHICLE", null);
    assertThat(blocked.get(valid).get("availability").asText()).isEqualTo("AVAILABLE");
    assertThat(blocked.get(expired).get("availability").asText()).isEqualTo("BLOCKED");
    assertThat(blocked.get(expired).get("issues").get(0).asText()).isEqualTo("EXPIRED:INSPECTION");
    assertThat(blocked.get(missing).get("availability").asText()).isEqualTo("BLOCKED");
    assertThat(blocked.get(missing).get("issues").size()).isEqualTo(2);

    send(
            t,
            MockMvcRequestBuilders.put("/api/v1/fleet/settings")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"blockOnExpired\":false,\"reminderDays\":30}"))
        .andExpect(status().isOk());

    Map<String, JsonNode> warned = availability(t, "VEHICLE", null);
    assertThat(warned.get(expired).get("availability").asText()).isEqualTo("WARNING");
    assertThat(warned.get(valid).get("availability").asText()).isEqualTo("AVAILABLE");
  }

  @Test
  void documentExpiringDuringPeriodCountsAsExpired() throws Exception {
    String t = tenantCode("per");
    String truck = vehicle(t, "06PE01", "TRUCK", "ACTIVE");
    document(t, "VEHICLE", truck, "INSPECTION", TODAY.plusDays(2));
    document(t, "VEHICLE", truck, "TRAFFIC_INSURANCE", TODAY.plusDays(90));

    JsonNode rows =
        body(
            send(
                t,
                get("/api/v1/fleet/availability")
                    .param("type", "VEHICLE")
                    .param("from", TODAY.toString())
                    .param("to", TODAY.plusDays(5).toString())));
    assertThat(rows.get(0).get("availability").asText()).isEqualTo("BLOCKED");
  }

  @Test
  void calendarBlockAndStatusAlwaysBlockEvenWhenPolicyWarns() throws Exception {
    String t = tenantCode("cal");
    send(
            t,
            MockMvcRequestBuilders.put("/api/v1/fleet/settings")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"blockOnExpired\":false,\"reminderDays\":30}"))
        .andExpect(status().isOk());
    String inMaintenance = vehicle(t, "06BK01", "TRUCK", "MAINTENANCE");
    validDocuments(t, inMaintenance);
    String calendar = vehicle(t, "06BK02", "TRUCK", "ACTIVE");
    validDocuments(t, calendar);
    post(
            t,
            "/api/v1/fleet/VEHICLE/" + calendar + "/blocks",
            Map.of(
                "startDate", TODAY.toString(),
                "endDate", TODAY.plusDays(3).toString(),
                "reason", "Periyodik bakım"))
        .andExpect(status().isCreated());

    Map<String, JsonNode> rows = availability(t, "VEHICLE", null);
    assertThat(rows.get(inMaintenance).get("issues").get(0).asText())
        .isEqualTo("STATUS:MAINTENANCE");
    assertThat(rows.get(inMaintenance).get("availability").asText()).isEqualTo("BLOCKED");
    assertThat(rows.get(calendar).get("issues").get(0).asText()).isEqualTo("CALENDAR");
    assertThat(rows.get(calendar).get("availability").asText()).isEqualTo("BLOCKED");
  }

  @Test
  void availabilityFiltersByCapacityAndDriverStatus() throws Exception {
    String t = tenantCode("cap");
    Map<String, Object> small = vehicleBody("06KC01", "VAN", "ACTIVE");
    small.put("capacityTon", "3");
    created(post(t, "/api/v1/fleet/vehicles", small));
    Map<String, Object> big = vehicleBody("06KC02", "TRUCK", "ACTIVE");
    big.put("capacityTon", "25");
    String bigId = created(post(t, "/api/v1/fleet/vehicles", big));

    Map<String, JsonNode> rows = availability(t, "VEHICLE", "10");
    assertThat(rows).containsOnlyKeys(bigId);

    String active = driverNode(t, "S1", "Çalışan").get("id").asText();
    Map<String, Object> left = driverBody("S2", "Ayrılan");
    left.put("status", "LEFT");
    created(post(t, "/api/v1/fleet/drivers", left));
    assertThat(availability(t, "DRIVER", null)).containsOnlyKeys(active);
  }

  @Test
  void supplierExpensePostsDebtAndReverseRestoresIt() throws Exception {
    String t = tenantCode("sup");
    String branch = branch(t);
    String truck = vehicle(t, "06SU01", "TRUCK", "ACTIVE");
    String supplier = account(t, "T1", "SUPPLIER");
    Map<String, Object> body = expense("REPAIR", branch, "1500");
    body.put("supplierAccountId", supplier);
    body.put("odometerKm", "120000");

    String id = created(post(t, "/api/v1/fleet/vehicles/" + truck + "/expenses", body));

    assertThat(tryBalance(t, supplier)).isEqualByComparingTo("-1500");
    assertThat(
            body(send(t, get("/api/v1/fleet/vehicles/" + truck))).get("odometerKm").decimalValue())
        .isEqualByComparingTo("120000");

    post(t, "/api/v1/fleet/expenses/" + id + "/reverse", Map.of("date", DATE))
        .andExpect(status().isNoContent());
    assertThat(tryBalance(t, supplier)).isEqualByComparingTo("0");
    assertThat(body(send(t, get("/api/v1/fleet/expenses"))).get("totalElements").asInt()).isZero();
  }

  @Test
  void cashExpensePaysFromFundWithExpenseItemAndRollsBackIfInsufficient() throws Exception {
    String t = tenantCode("cash");
    String branch = branch(t);
    String truck = vehicle(t, "06CA01", "TRUCK", "ACTIVE");
    String cash = fund(t, "K1", "CASH", branch);
    deposit(t, cash, "1000");
    Map<String, Object> tire = expense("TIRE", branch, "400");
    tire.put("fundAccountId", cash);
    tire.put("tirePosition", "Ön sol");

    JsonNode created =
        body(
            post(t, "/api/v1/fleet/vehicles/" + truck + "/expenses", tire)
                .andExpect(status().isCreated()));
    assertThat(created.get("settlementId").asText()).isNotBlank();
    assertThat(fundBalance(t, cash)).isEqualByComparingTo("600");
    JsonNode payments = body(send(t, get("/api/v1/finance/payments")));
    assertThat(payments.get("content").get(0).get("expenseItemId").asText()).isNotBlank();

    Map<String, Object> tooMuch = expense("TIRE", branch, "9000");
    tooMuch.put("fundAccountId", cash);
    post(t, "/api/v1/fleet/vehicles/" + truck + "/expenses", tooMuch)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INSUFFICIENT_FUNDS"));
    assertThat(body(send(t, get("/api/v1/fleet/expenses"))).get("totalElements").asInt())
        .isEqualTo(1);

    post(
            t,
            "/api/v1/fleet/expenses/" + created.get("id").asText() + "/reverse",
            Map.of("date", DATE))
        .andExpect(status().isNoContent());
    assertThat(fundBalance(t, cash)).isEqualByComparingTo("1000");
  }

  @Test
  void expenseRequiresExactlyOneFinanceTargetAndFuelData() throws Exception {
    String t = tenantCode("val");
    String branch = branch(t);
    String truck = vehicle(t, "06VL01", "TRUCK", "ACTIVE");
    String supplier = account(t, "T1", "SUPPLIER");
    String cash = fund(t, "K1", "CASH", branch);

    post(t, "/api/v1/fleet/vehicles/" + truck + "/expenses", expense("REPAIR", branch, "10"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("EXPENSE_TARGET_REQUIRED"));
    Map<String, Object> both = expense("REPAIR", branch, "10");
    both.put("supplierAccountId", supplier);
    both.put("fundAccountId", cash);
    post(t, "/api/v1/fleet/vehicles/" + truck + "/expenses", both)
        .andExpect(status().isBadRequest());
    Map<String, Object> fuel = expense("FUEL", branch, "10");
    fuel.put("supplierAccountId", supplier);
    post(t, "/api/v1/fleet/vehicles/" + truck + "/expenses", fuel)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("FUEL_DATA_REQUIRED"));
  }

  @Test
  void fuelConsumptionAndAnomalyAreCalculated() throws Exception {
    String t = tenantCode("fuel");
    String branch = branch(t);
    String truck = vehicle(t, "06FU01", "TRUCK", "ACTIVE");
    String supplier = account(t, "T1", "SUPPLIER");
    fuel(t, truck, branch, supplier, "100000", "300", "2026-10-01");
    fuel(t, truck, branch, supplier, "101000", "300", "2026-10-05");
    fuel(t, truck, branch, supplier, "102000", "300", "2026-10-09");
    fuel(t, truck, branch, supplier, "103000", "600", "2026-10-13");

    JsonNode consumption =
        body(send(t, get("/api/v1/fleet/vehicles/" + truck + "/fuel-consumption")));

    // Toplam 1200 L / 3000 km = 40 L/100km; son alım 60 L/100km ile ortalamanın %25 üstünde.
    assertThat(consumption.get("averageLitersPer100Km").decimalValue()).isEqualByComparingTo("40");
    JsonNode rows = consumption.get("rows");
    assertThat(rows.size()).isEqualTo(4);
    assertThat(rows.get(0).get("litersPer100Km").isNull()).isTrue();
    assertThat(rows.get(1).get("litersPer100Km").decimalValue()).isEqualByComparingTo("30");
    assertThat(rows.get(1).get("anomaly").asBoolean()).isFalse();
    assertThat(rows.get(3).get("litersPer100Km").decimalValue()).isEqualByComparingTo("60");
    assertThat(rows.get(3).get("anomaly").asBoolean()).isTrue();
  }

  @Test
  void vehicleCostReportSumsKindsAndCostPerKm() throws Exception {
    String t = tenantCode("cost");
    String branch = branch(t);
    String truck = vehicle(t, "06CO01", "TRUCK", "ACTIVE");
    String other = vehicle(t, "06CO02", "TRUCK", "ACTIVE");
    String supplier = account(t, "T1", "SUPPLIER");
    fuel(t, truck, branch, supplier, "1000", "100", "2026-10-01");
    fuel(t, truck, branch, supplier, "2000", "300", "2026-10-10");
    Map<String, Object> repair = expense("REPAIR", branch, "5000");
    repair.put("supplierAccountId", supplier);
    post(t, "/api/v1/fleet/vehicles/" + truck + "/expenses", repair)
        .andExpect(status().isCreated());
    Map<String, Object> outOfPeriod = expense("REPAIR", branch, "777");
    outOfPeriod.put("supplierAccountId", supplier);
    outOfPeriod.put("date", "2026-01-01");
    post(t, "/api/v1/fleet/vehicles/" + truck + "/expenses", outOfPeriod)
        .andExpect(status().isCreated());
    assertThat(other).isNotBlank();

    JsonNode rows =
        body(
            send(
                t,
                get("/api/v1/fleet/reports/vehicle-costs")
                    .param("from", "2026-10-01")
                    .param("to", "2026-10-31")));

    assertThat(rows.size()).isEqualTo(1);
    JsonNode row = rows.get(0);
    assertThat(row.get("plate").asText()).isEqualTo("06CO01");
    assertThat(row.get("repairTl").decimalValue()).isEqualByComparingTo("5000");
    assertThat(row.get("fuelTl").decimalValue()).isEqualByComparingTo("400");
    assertThat(row.get("totalTl").decimalValue()).isEqualByComparingTo("5400");
    assertThat(row.get("distanceKm").decimalValue()).isEqualByComparingTo("1000");
    assertThat(row.get("litersPer100Km").decimalValue()).isEqualByComparingTo("30");
    assertThat(row.get("costPerKmTl").decimalValue()).isEqualByComparingTo("5.40");
  }

  @Test
  void maintenancePlanRemindsByDateAndKm() throws Exception {
    String t = tenantCode("mnt");
    String branch = branch(t);
    String byDate = vehicle(t, "06MN01", "TRUCK", "ACTIVE");
    String byKm = vehicle(t, "06MN02", "TRUCK", "ACTIVE");
    String far = vehicle(t, "06MN03", "TRUCK", "ACTIVE");
    String supplier = account(t, "T1", "SUPPLIER");

    Map<String, Object> dated = expense("MAINTENANCE", branch, "100");
    dated.put("supplierAccountId", supplier);
    dated.put("nextDueDate", TODAY.minusDays(1).toString());
    post(t, "/api/v1/fleet/vehicles/" + byDate + "/expenses", dated)
        .andExpect(status().isCreated());

    Map<String, Object> kmPlan = expense("MAINTENANCE", branch, "100");
    kmPlan.put("supplierAccountId", supplier);
    kmPlan.put("odometerKm", "99500");
    kmPlan.put("nextDueKm", "100000");
    post(t, "/api/v1/fleet/vehicles/" + byKm + "/expenses", kmPlan).andExpect(status().isCreated());

    Map<String, Object> farPlan = expense("MAINTENANCE", branch, "100");
    farPlan.put("supplierAccountId", supplier);
    farPlan.put("odometerKm", "50000");
    farPlan.put("nextDueKm", "100000");
    farPlan.put("nextDueDate", TODAY.plusYears(1).toString());
    post(t, "/api/v1/fleet/vehicles/" + far + "/expenses", farPlan).andExpect(status().isCreated());

    List<String> summary = new ArrayList<>();
    body(send(t, get("/api/v1/fleet/reminders")))
        .forEach(r -> summary.add(r.get("subjectName").asText() + ":" + r.get("type").asText()));
    assertThat(summary)
        .containsExactlyInAnyOrder("06MN01:MAINTENANCE_DATE", "06MN02:MAINTENANCE_KM");
  }

  @Test
  void permissionsAndTenantIsolation() throws Exception {
    String a = tenantCode("isoa");
    String b = tenantCode("isob");
    String truck = vehicle(a, "06IS01", "TRUCK", "ACTIVE");

    send(b, get("/api/v1/fleet/vehicles/" + truck)).andExpect(status().isNotFound());

    String ops = inviteAndLogin(a, "ops@" + a + ".test", "OPERATIONS");
    mvc.perform(get("/api/v1/fleet/vehicles").with(tenant(a)).with(bearer(ops)))
        .andExpect(status().isOk());
    mvc.perform(
            MockMvcRequestBuilders.post("/api/v1/fleet/vehicles")
                .with(tenant(a))
                .with(bearer(ops))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(vehicleBody("06IS02", "VAN", "ACTIVE"))))
        .andExpect(status().isForbidden());

    String manager = inviteAndLogin(a, "filo@" + a + ".test", "FLEET_MANAGER");
    mvc.perform(get("/api/v1/fleet/options").with(tenant(a)).with(bearer(manager)))
        .andExpect(status().isOk());
    mvc.perform(get("/api/v1/finance/accounts").with(tenant(a)).with(bearer(manager)))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/v1/auth/me").with(tenant(a)).with(bearer(manager)))
        .andExpect(jsonPath("$.landingPath").value("/fleet"));
  }

  // Yardımcılar

  private String tenantCode(String prefix) throws Exception {
    String code = "flt-" + prefix;
    createTenant(code);
    return code;
  }

  private ResultActions send(String t, MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request.with(asOwner(t)));
  }

  private ResultActions post(String t, String path, Object body) throws Exception {
    return send(
        t,
        MockMvcRequestBuilders.post(path)
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(body)));
  }

  private String created(ResultActions actions) throws Exception {
    return body(actions.andExpect(status().isCreated())).get("id").asText();
  }

  private static Map<String, Object> vehicleBody(String plate, String kind, String status) {
    Map<String, Object> body = new HashMap<>();
    body.put("plate", plate);
    body.put("kind", kind);
    body.put("ownership", "OWNED");
    body.put("status", status);
    return body;
  }

  private String vehicle(String t, String plate, String kind, String status) throws Exception {
    return created(post(t, "/api/v1/fleet/vehicles", vehicleBody(plate, kind, status)));
  }

  private static Map<String, Object> driverBody(String code, String name) {
    Map<String, Object> body = new HashMap<>();
    body.put("code", code);
    body.put("fullName", name);
    body.put("status", "ACTIVE");
    return body;
  }

  private JsonNode driverNode(String t, String code, String name) throws Exception {
    return body(
        post(t, "/api/v1/fleet/drivers", driverBody(code, name)).andExpect(status().isCreated()));
  }

  private void document(String t, String subject, String id, String type, LocalDate expires)
      throws Exception {
    post(
            t,
            "/api/v1/fleet/" + subject + "/" + id + "/documents",
            Map.of("docType", type, "expiresOn", expires.toString()))
        .andExpect(status().isCreated());
  }

  private void validDocuments(String t, String vehicle) throws Exception {
    document(t, "VEHICLE", vehicle, "INSPECTION", TODAY.plusDays(100));
    document(t, "VEHICLE", vehicle, "TRAFFIC_INSURANCE", TODAY.plusDays(100));
  }

  private Map<String, JsonNode> availability(String t, String type, String minTon)
      throws Exception {
    MockHttpServletRequestBuilder request =
        get("/api/v1/fleet/availability")
            .param("type", type)
            .param("from", TODAY.toString())
            .param("to", TODAY.toString());
    if (minTon != null) {
      request.param("minTon", minTon);
    }
    Map<String, JsonNode> rows = new HashMap<>();
    body(send(t, request)).forEach(row -> rows.put(row.get("subjectId").asText(), row));
    return rows;
  }

  private String branch(String t) throws Exception {
    return created(
        post(
            t,
            "/api/v1/organization/branches",
            Map.of("code", "S" + System.nanoTime(), "name", "Şube")));
  }

  private String account(String t, String code, String type) throws Exception {
    return created(
        post(t, "/api/v1/finance/accounts", Map.of("code", code, "name", code, "type", type)));
  }

  private String fund(String t, String code, String kind, String branch) throws Exception {
    return created(
        post(
            t,
            "/api/v1/finance/funds",
            Map.of(
                "code", code, "name", code, "kind", kind, "currency", "TRY", "branchId", branch)));
  }

  private void deposit(String t, String fund, String amount) throws Exception {
    post(
            t,
            "/api/v1/finance/funds/" + fund + "/transactions",
            Map.of(
                "direction",
                "IN",
                "money",
                Map.of("amount", amount, "currency", "TRY"),
                "date",
                DATE))
        .andExpect(status().isCreated());
  }

  private BigDecimal fundBalance(String t, String fund) throws Exception {
    for (JsonNode row : body(send(t, get("/api/v1/finance/funds")))) {
      if (fund.equals(row.get("id").asText())) {
        return row.get("balance").decimalValue();
      }
    }
    throw new AssertionError("Hesap yok");
  }

  private BigDecimal tryBalance(String t, String account) throws Exception {
    for (JsonNode row : body(send(t, get("/api/v1/finance/accounts/" + account))).get("balances")) {
      if ("TRY".equals(row.get("currency").asText())) {
        return row.get("balance").decimalValue();
      }
    }
    return BigDecimal.ZERO;
  }

  private static Map<String, Object> expense(String kind, String branch, String amount) {
    Map<String, Object> body = new HashMap<>();
    body.put("kind", kind);
    body.put("date", DATE);
    body.put("branchId", branch);
    body.put("money", Map.of("amount", amount, "currency", "TRY"));
    return body;
  }

  private void fuel(
      String t, String truck, String branch, String supplier, String km, String liters, String date)
      throws Exception {
    Map<String, Object> body = expense("FUEL", branch, liters);
    body.put("supplierAccountId", supplier);
    body.put("odometerKm", km);
    body.put("liters", liters);
    body.put("date", date);
    post(t, "/api/v1/fleet/vehicles/" + truck + "/expenses", body).andExpect(status().isCreated());
  }

  private String inviteAndLogin(String t, String email, String roleCode) throws Exception {
    String roleId = null;
    for (JsonNode role : body(send(t, get("/api/v1/identity/roles")))) {
      if (roleCode.equals(role.get("code").asText())) {
        roleId = role.get("id").asText();
      }
    }
    post(
            t,
            "/api/v1/identity/users",
            Map.of("email", email, "fullName", "Test", "roleIds", List.of(roleId)))
        .andExpect(status().isCreated());
    return acceptInviteAndLogin(t, email);
  }
}
