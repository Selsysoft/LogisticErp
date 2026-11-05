package org.ece.blackrose.customs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.parser.PdfTextExtractor;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.ece.blackrose.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

class CustomsIT extends AbstractIntegrationTest {

  private static final String BASE = "/api/v1/customs";
  private static final Instant START =
      Instant.now().plus(1, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
  private static final Instant END = START.plus(2, ChronoUnit.DAYS);
  private static final LocalDate TODAY = LocalDate.now().minusDays(1);
  private static final LocalDate FAR = LocalDate.now().plusDays(400);

  private record Setup(String tenant, String branch, String customer, String supplier) {}

  @Test
  void declarationCarriesLinesAndFollowsStatusRules() throws Exception {
    Setup s = setup("dec");
    String shipment = shipment(s, null).get("id").asText();
    JsonNode declaration =
        body(
            post(
                    s.tenant(),
                    BASE + "/declarations",
                    Map.of(
                        "shipmentId", shipment,
                        "type", "EXPORT",
                        "customsOffice", "Kapıkule",
                        "declaredOn", TODAY.toString(),
                        "currency", "EUR"))
                .andExpect(status().isCreated()));
    String id = declaration.get("id").asText();
    assertThat(declaration.get("number").asText()).startsWith("GB-");
    assertThat(declaration.get("status").asText()).isEqualTo("DRAFT");

    changeStatus(s, id, "SUBMITTED", "TR123")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("DECLARATION_EMPTY"));

    JsonNode withLine =
        body(
            post(
                    s.tenant(),
                    BASE + "/declarations/" + id + "/lines",
                    Map.of("hsCode", "5208.11", "description", "Kumaş", "value", "1500"))
                .andExpect(status().isCreated()));
    post(
            s.tenant(),
            BASE + "/declarations/" + id + "/lines",
            Map.of("hsCode", "5208.12", "description", "Kumaş 2", "value", "500"))
        .andExpect(status().isCreated());
    assertThat(withLine.get("lines")).hasSize(1);

    changeStatus(s, id, "SUBMITTED", null)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("REGISTRATION_REQUIRED"));
    changeStatus(s, id, "CLEARED", null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("DECLARATION_INVALID_TRANSITION"));
    changeStatus(s, id, "SUBMITTED", "TR123").andExpect(status().isOk());

    post(
            s.tenant(),
            BASE + "/declarations/" + id + "/lines",
            Map.of("hsCode", "1", "description", "Geç", "value", "1"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("DECLARATION_NOT_DRAFT"));

    JsonNode cleared = body(changeStatus(s, id, "CLEARED", null).andExpect(status().isOk()));
    assertThat(cleared.get("registrationNo").asText()).isEqualTo("TR123");
    assertThat(new BigDecimal(cleared.get("totalValue").get("amount").asText()))
        .isEqualByComparingTo("2000");
  }

  @Test
  void transitTracksDeadlineAndGuaranteeUntilDischarge() throws Exception {
    Setup s = setup("trn");
    String shipment = shipment(s, null).get("id").asText();
    Map<String, Object> transit = transitBody(shipment, "T1-001", TODAY.minusDays(5), TODAY);
    JsonNode created =
        body(post(s.tenant(), BASE + "/transits", transit).andExpect(status().isCreated()));
    assertThat(created.get("overdue").asBoolean()).isTrue();
    assertThat(new BigDecimal(created.get("guarantee").get("amount").asText()))
        .isEqualByComparingTo("10000");

    post(s.tenant(), BASE + "/transits", transit)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CODE_TAKEN"));
    post(s.tenant(), BASE + "/transits", transitBody(shipment, "T1-002", TODAY, TODAY.minusDays(1)))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("DEADLINE_INVALID"));

    String id = created.get("id").asText();
    JsonNode discharged =
        body(
            post(
                    s.tenant(),
                    BASE + "/transits/" + id + "/discharge",
                    Map.of("date", TODAY.toString()))
                .andExpect(status().isOk()));
    assertThat(discharged.get("status").asText()).isEqualTo("DISCHARGED");
    assertThat(discharged.get("overdue").asBoolean()).isFalse();
    post(s.tenant(), BASE + "/transits/" + id + "/discharge", Map.of("date", TODAY.toString()))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("TRANSIT_CLOSED"));
  }

  @Test
  void adrCargoRequiresAdrDocumentsAndCarrierGetsWarning() throws Exception {
    Setup s = setup("adr");
    String truck = compliantVehicle(s.tenant(), "34AD01", "TRUCK");
    String driver = compliantDriver(s.tenant(), "S1");
    JsonNode adr = shipment(s, "3");
    String leg = adr.get("legs").get(0).get("id").asText();
    assertThat(adr.get("cargo").get(0).get("unNumber").asText()).isEqualTo("UN1203");

    assign(s.tenant(), leg, Map.of("vehicleId", truck, "driverId", driver))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("RESOURCE_BLOCKED"));

    // ADR'siz yük aynı kaynaklarla atanır.
    JsonNode plain = shipment(s, null);
    String plainLeg = plain.get("legs").get(0).get("id").asText();
    assign(s.tenant(), plainLeg, Map.of("vehicleId", truck, "driverId", driver))
        .andExpect(status().isOk());
    moveTo(s.tenant(), plain.get("id").asText(), "CANCELLED").andExpect(status().isOk());

    String vehicleCandidates =
        body(send(s.tenant(), get("/api/v1/shipment/legs/" + leg + "/candidates"))).toString();
    assertThat(vehicleCandidates).contains("MISSING:VEHICLE_ADR").contains("MISSING:DRIVER_ADR");

    document(s.tenant(), "VEHICLE", truck, "VEHICLE_ADR", FAR);
    assign(s.tenant(), leg, Map.of("vehicleId", truck, "driverId", driver))
        .andExpect(status().isConflict());
    document(s.tenant(), "DRIVER", driver, "DRIVER_ADR", LocalDate.now().minusDays(1));
    assign(s.tenant(), leg, Map.of("vehicleId", truck, "driverId", driver))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("RESOURCE_BLOCKED"));

    // Firma ayarı uyarıya çevrilirse atama yapılır, uyarı döner.
    send(
            s.tenant(),
            MockMvcRequestBuilders.put("/api/v1/fleet/settings")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"blockOnExpired\":false,\"reminderDays\":30}"))
        .andExpect(status().isOk());
    JsonNode warned =
        body(
            assign(s.tenant(), leg, Map.of("vehicleId", truck, "driverId", driver))
                .andExpect(status().isOk()));
    assertThat(warned.get("warnings").toString()).contains("EXPIRED:DRIVER_ADR");

    String carrier = account(s.tenant(), "TS1", "CARRIER");
    JsonNode byCarrier =
        body(
            assign(
                    s.tenant(),
                    leg,
                    Map.of(
                        "carrierAccountId",
                        carrier,
                        "carrierCost",
                        Map.of("amount", "100", "currency", "TRY")))
                .andExpect(status().isOk()));
    assertThat(byCarrier.get("warnings").toString()).contains("ADR");
  }

  @Test
  void borderFeeBecomesTripCostAndReachesFinanceOnlyOnClose() throws Exception {
    Setup s = setup("brd");
    String truck = compliantVehicle(s.tenant(), "34BR01", "TRUCK");
    String driver = compliantDriver(s.tenant(), "S1");
    JsonNode shipment = shipment(s, null);
    String id = shipment.get("id").asText();
    assign(
            s.tenant(),
            shipment.get("legs").get(0).get("id").asText(),
            Map.of("vehicleId", truck, "driverId", driver))
        .andExpect(status().isOk());

    Map<String, Object> noAccount = crossingBody(id, "Kapıkule", "250", null);
    post(s.tenant(), BASE + "/crossings", noAccount)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("FEE_ACCOUNT_REQUIRED"));

    post(s.tenant(), BASE + "/crossings", crossingBody(id, "Ücretsiz Kapı", null, null))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.posted").value(false));
    String crossing =
        body(post(
                    s.tenant(),
                    BASE + "/crossings",
                    crossingBody(id, "Kapıkule", "250", s.supplier()))
                .andExpect(status().isCreated()))
            .get("id")
            .asText();
    String wrong =
        body(post(s.tenant(), BASE + "/crossings", crossingBody(id, "Yanlış", "99", s.supplier()))
                .andExpect(status().isCreated()))
            .get("id")
            .asText();
    send(s.tenant(), MockMvcRequestBuilders.delete(BASE + "/crossings/" + wrong))
        .andExpect(status().isNoContent());

    JsonNode costs = body(send(s.tenant(), get("/api/v1/shipment/shipments/" + id + "/costs")));
    assertThat(costs).hasSize(1);
    assertThat(costs.get(0).get("kind").asText()).isEqualTo("BORDER_FEE");
    assertThat(balance(s.tenant(), s.supplier())).isEqualByComparingTo("0");

    moveTo(s.tenant(), id, "PLANNED").andExpect(status().isOk());
    moveTo(s.tenant(), id, "LOADED").andExpect(status().isOk());
    moveTo(s.tenant(), id, "IN_TRANSIT").andExpect(status().isOk());
    post(
            s.tenant(),
            "/api/v1/shipment/shipments/" + id + "/pod",
            Map.of("recipientName", "Alıcı", "deliveredAt", END.toString()))
        .andExpect(status().isOk());
    moveTo(s.tenant(), id, "DELIVERED").andExpect(status().isOk());
    post(
            s.tenant(),
            "/api/v1/shipment/shipments/" + id + "/invoice",
            Map.of("invoiceDate", TODAY.toString(), "dueDate", FAR.toString()))
        .andExpect(status().isCreated());
    post(
            s.tenant(),
            "/api/v1/shipment/shipments/" + id + "/close",
            Map.of("date", TODAY.toString(), "dueDate", FAR.toString()))
        .andExpect(status().isOk());

    assertThat(balance(s.tenant(), s.supplier())).isEqualByComparingTo("-250");
    send(s.tenant(), MockMvcRequestBuilders.delete(BASE + "/crossings/" + crossing))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("COST_POSTED"));
    assertThat(
            body(send(s.tenant(), get("/api/v1/shipment/shipments/" + id + "/profit")))
                .get("costTl")
                .decimalValue())
        .isEqualByComparingTo("250");
  }

  @Test
  void permitQuotaAndValidityAreEnforcedAndCancelledShipmentReturnsQuota() throws Exception {
    Setup s = setup("prm");
    String permit =
        body(post(
                    s.tenant(),
                    BASE + "/permits",
                    Map.of(
                        "number",
                        "CEMT-1",
                        "kind",
                        "MULTILATERAL",
                        "country",
                        "Almanya",
                        "validFrom",
                        TODAY.minusDays(10).toString(),
                        "validTo",
                        TODAY.plusDays(10).toString(),
                        "quota",
                        1))
                .andExpect(status().isCreated()))
            .get("id")
            .asText();
    String first = shipment(s, null).get("id").asText();
    String second = shipment(s, null).get("id").asText();

    usePermit(s, permit, first, TODAY.plusDays(20))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("PERMIT_NOT_VALID"));
    usePermit(s, permit, first, TODAY)
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.used").value(1));
    usePermit(s, permit, first, TODAY)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("PERMIT_ALREADY_USED"));
    usePermit(s, permit, second, TODAY)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("PERMIT_QUOTA_FULL"));

    moveTo(s.tenant(), first, "CANCELLED").andExpect(status().isOk());
    usePermit(s, permit, second, TODAY)
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.used").value(1));
  }

  @Test
  void internationalCmrIsMultilingualWithConventionAndDomesticStaysSimple() throws Exception {
    Setup s = setup("cmr");
    String truck = compliantVehicle(s.tenant(), "34CM01", "TRUCK");
    String driver = compliantDriver(s.tenant(), "S1");
    JsonNode shipment = shipment(s, null);
    String id = shipment.get("id").asText();
    assign(
            s.tenant(),
            shipment.get("legs").get(0).get("id").asText(),
            Map.of("vehicleId", truck, "driverId", driver))
        .andExpect(status().isOk());

    String domestic = cmrText(s, id);
    assertThat(domestic).contains("CMR Taşıma Senedi").doesNotContain("Absender");

    send(
            s.tenant(),
            MockMvcRequestBuilders.put("/api/v1/shipment/shipments/" + id + "/international")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of(
                            "originCountry", "TR",
                            "destinationCountry", "DE",
                            "incoterm", "CIP",
                            "liabilityPolicy", "POL-77",
                            "senderInstructions", "Soğuk tutulacak",
                            "attachedDocuments", "Fatura, ATR"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.international").value(true));

    assertThat(cmrText(s, id))
        .contains("Absender")
        .contains("Sender")
        .contains("Gönderici")
        .contains("Convention")
        .contains("TR")
        .contains("POL-77")
        .contains("Soğuk tutulacak")
        .contains("Fatura, ATR");
  }

  @Test
  void customsRoleManagesDeclarationsButOperationsCannot() throws Exception {
    Setup s = setup("rol");
    String shipment = shipment(s, null).get("id").asText();
    Map<String, Object> request =
        Map.of(
            "shipmentId", shipment,
            "type", "EXPORT",
            "customsOffice", "Kapıkule",
            "declaredOn", TODAY.toString(),
            "currency", "EUR");

    String customs = inviteAndLogin(s.tenant(), "gmr@" + s.tenant() + ".test", "CUSTOMS");
    mvc.perform(
            MockMvcRequestBuilders.post(BASE + "/declarations")
                .with(tenant(s.tenant()))
                .with(bearer(customs))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(request)))
        .andExpect(status().isCreated());

    String ops = inviteAndLogin(s.tenant(), "ops@" + s.tenant() + ".test", "OPERATIONS");
    mvc.perform(
            MockMvcRequestBuilders.post(BASE + "/declarations")
                .with(tenant(s.tenant()))
                .with(bearer(ops))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(request)))
        .andExpect(status().isForbidden());
  }

  // Yardımcılar

  private String cmrText(Setup s, String shipment) throws Exception {
    String id =
        body(post(s.tenant(), "/api/v1/shipment/shipments/" + shipment + "/documents/CMR", null)
                .andExpect(status().isOk()))
            .get("id")
            .asText();
    byte[] pdf =
        send(s.tenant(), get("/api/v1/shipment/documents/" + id + "/pdf"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsByteArray();
    try (PdfReader reader = new PdfReader(pdf)) {
      return new PdfTextExtractor(reader).getTextFromPage(1);
    }
  }

  private Setup setup(String prefix) throws Exception {
    String t = "gmr-" + prefix;
    createTenant(t);
    String branch =
        created(
            post(
                t,
                "/api/v1/organization/branches",
                Map.of("code", "S" + System.nanoTime(), "name", "Şube")));
    return new Setup(t, branch, account(t, "M1", "CUSTOMER"), account(t, "T1", "SUPPLIER"));
  }

  private ResultActions send(String t, MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request.with(asOwner(t)));
  }

  private ResultActions post(String t, String path, Object body) throws Exception {
    MockHttpServletRequestBuilder request = MockMvcRequestBuilders.post(path);
    if (body != null) {
      request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
    }
    return send(t, request);
  }

  private String created(ResultActions actions) throws Exception {
    return body(actions.andExpect(status().isCreated())).get("id").asText();
  }

  private String account(String t, String code, String type) throws Exception {
    return created(
        post(t, "/api/v1/finance/accounts", Map.of("code", code, "name", code, "type", type)));
  }

  private JsonNode shipment(Setup s, String adrClass) throws Exception {
    Map<String, Object> cargo = new HashMap<>();
    cargo.put("description", "Yük");
    cargo.put("weightKg", "100");
    if (adrClass != null) {
      cargo.put("adrClass", adrClass);
      cargo.put("unNumber", "UN1203");
    }
    Map<String, Object> body = new HashMap<>();
    body.put("accountId", s.customer());
    body.put("branchId", s.branch());
    body.put("shipperName", "Gönderici");
    body.put("consigneeName", "Alıcı");
    body.put("origin", "İstanbul");
    body.put("destination", "Münih");
    body.put("plannedPickup", START.toString());
    body.put("plannedDelivery", END.toString());
    body.put("currency", "TRY");
    body.put("manualNet", "1000");
    body.put("cargo", List.of(cargo));
    return body(
        post(s.tenant(), "/api/v1/shipment/shipments", body).andExpect(status().isCreated()));
  }

  private String compliantVehicle(String t, String plate, String kind) throws Exception {
    String id =
        created(
            post(
                t,
                "/api/v1/fleet/vehicles",
                Map.of("plate", plate, "kind", kind, "ownership", "OWNED", "status", "ACTIVE")));
    document(t, "VEHICLE", id, "INSPECTION", FAR);
    document(t, "VEHICLE", id, "TRAFFIC_INSURANCE", FAR);
    return id;
  }

  private String compliantDriver(String t, String code) throws Exception {
    String id =
        created(
            post(
                t,
                "/api/v1/fleet/drivers",
                Map.of("code", code, "fullName", "Sürücü " + code, "status", "ACTIVE")));
    document(t, "DRIVER", id, "LICENSE", FAR);
    document(t, "DRIVER", id, "SRC", FAR);
    document(t, "DRIVER", id, "PSYCHOTECHNIC", FAR);
    return id;
  }

  private void document(String t, String subject, String id, String type, LocalDate expires)
      throws Exception {
    post(
            t,
            "/api/v1/fleet/" + subject + "/" + id + "/documents",
            Map.of("docType", type, "expiresOn", expires.toString()))
        .andExpect(status().isCreated());
  }

  private ResultActions assign(String t, String leg, Map<String, Object> body) throws Exception {
    return post(t, "/api/v1/shipment/legs/" + leg + "/assign", body);
  }

  private ResultActions moveTo(String t, String id, String target) throws Exception {
    return post(t, "/api/v1/shipment/shipments/" + id + "/status", Map.of("status", target));
  }

  private ResultActions changeStatus(Setup s, String id, String target, String registration)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("status", target);
    body.put("registrationNo", registration);
    return post(s.tenant(), BASE + "/declarations/" + id + "/status", body);
  }

  private static Map<String, Object> transitBody(
      String shipment, String number, LocalDate issued, LocalDate deadline) {
    Map<String, Object> body = new HashMap<>();
    body.put("shipmentId", shipment);
    body.put("kind", "T1");
    body.put("documentNo", number);
    body.put("departureOffice", "İstanbul");
    body.put("destinationOffice", "Münih");
    body.put("guarantee", Map.of("amount", "10000", "currency", "EUR"));
    body.put("issuedOn", issued.toString());
    body.put("deadline", deadline.toString());
    return body;
  }

  private static Map<String, Object> crossingBody(
      String shipment, String gate, String fee, String account) {
    Map<String, Object> body = new HashMap<>();
    body.put("shipmentId", shipment);
    body.put("gate", gate);
    body.put("direction", "EXIT");
    body.put("date", TODAY.toString());
    if (fee != null) {
      body.put("fee", Map.of("amount", fee, "currency", "TRY"));
    }
    body.put("accountId", account);
    return body;
  }

  private ResultActions usePermit(Setup s, String permit, String shipment, LocalDate date)
      throws Exception {
    return post(
        s.tenant(),
        BASE + "/permits/" + permit + "/usages",
        Map.of("shipmentId", shipment, "date", date.toString()));
  }

  private BigDecimal balance(String t, String account) throws Exception {
    for (JsonNode row : body(send(t, get("/api/v1/finance/accounts/" + account))).get("balances")) {
      if ("TRY".equals(row.get("currency").asText())) {
        return row.get("balance").decimalValue();
      }
    }
    return BigDecimal.ZERO;
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
