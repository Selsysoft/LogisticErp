package org.ece.blackrose.shipment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.parser.PdfTextExtractor;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
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

class ShipmentIT extends AbstractIntegrationTest {

  private static final Instant START =
      Instant.now().plus(1, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
  private static final Instant END = START.plus(2, ChronoUnit.DAYS);
  private static final String DATE = tenantToday().toString();
  private static final String DUE = tenantToday().plusDays(30).toString();
  private static final LocalDate FAR = tenantToday().plusDays(400);

  private record Setup(String tenant, String branch, String customer, String supplier) {}

  /** Faz 4 uçtan uca kabul senaryosu: gelir faturada, giderler kapanışta, kâr doğru. */
  @Test
  void fullShipmentLifecyclePostsRevenueAndCostsOnceAndReportsProfit() throws Exception {
    Setup s = setup("e2e");
    String truck = compliantVehicle(s.tenant(), "34E2E01", "TRUCK");
    String driver = compliantDriver(s.tenant(), "S1");
    String driverAccount = driverAccount(s.tenant(), driver);
    String carrier = account(s.tenant(), "TS1", "CARRIER");
    String tax = taxRate(s.tenant(), "KDV", "20", 2, 10);

    Map<String, Object> request = shipmentBody(s, "10000");
    request.put("taxRateId", tax);
    JsonNode shipment = create(s.tenant(), request);
    String id = shipment.get("id").asText();
    String firstLeg = shipment.get("legs").get(0).get("id").asText();
    assertThat(shipment.get("status").asText()).isEqualTo("QUOTED");
    assertThat(amount(shipment.get("total"))).isEqualByComparingTo("11600");

    // Çok bacaklı: ikinci etap taşerona gider, maliyetler ayrışır.
    assign(s.tenant(), firstLeg, Map.of("vehicleId", truck, "driverId", driver))
        .andExpect(status().isOk());
    String secondLeg =
        created(
            post(
                s.tenant(),
                "/api/v1/shipment/shipments/" + id + "/legs",
                Map.of(
                    "origin",
                    "Ankara",
                    "destination",
                    "Adana",
                    "plannedStart",
                    END.toString(),
                    "plannedEnd",
                    END.plus(1, ChronoUnit.DAYS).toString())));
    assign(
            s.tenant(),
            secondLeg,
            Map.of(
                "carrierAccountId",
                carrier,
                "carrierCost",
                Map.of("amount", "3000", "currency", "TRY")))
        .andExpect(status().isOk());

    moveTo(s.tenant(), id, "PLANNED").andExpect(status().isOk());
    moveTo(s.tenant(), id, "LOADED").andExpect(status().isOk());
    moveTo(s.tenant(), id, "IN_TRANSIT").andExpect(status().isOk());

    moveTo(s.tenant(), id, "DELIVERED")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("POD_REQUIRED"));
    pod(s.tenant(), id).andExpect(status().isOk());
    moveTo(s.tenant(), id, "DELIVERED").andExpect(status().isOk());

    addCost(s.tenant(), id, "FUEL", s.supplier(), "2000").andExpect(status().isCreated());
    addCost(s.tenant(), id, "TOLL", s.supplier(), "500").andExpect(status().isCreated());
    addCost(s.tenant(), id, "PER_DIEM", driverAccount, "1000").andExpect(status().isCreated());

    // Fatura öncesi cari hareketi yok.
    assertThat(balance(s.tenant(), s.customer())).isEqualByComparingTo("0");

    JsonNode invoice = issueInvoice(s.tenant(), id);
    assertThat(invoice.get("number").asText()).startsWith("NF-");
    // Net 10000 + KDV 2000 - tevkifat 400 = 11600.
    assertThat(balance(s.tenant(), s.customer())).isEqualByComparingTo("11600");
    // Fatura giderleri yazmaz.
    assertThat(balance(s.tenant(), s.supplier())).isEqualByComparingTo("0");

    close(s.tenant(), id)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("CLOSED"));
    assertThat(balance(s.tenant(), s.supplier())).isEqualByComparingTo("-2500");
    assertThat(balance(s.tenant(), carrier)).isEqualByComparingTo("-3000");
    assertThat(balance(s.tenant(), driverAccount)).isEqualByComparingTo("-1000");
    assertThat(openPlans(s.tenant())).isEqualTo(4);

    // Tekrar kapanış çift kayıt üretmez.
    close(s.tenant(), id).andExpect(status().isOk());
    assertThat(balance(s.tenant(), s.supplier())).isEqualByComparingTo("-2500");
    assertThat(balance(s.tenant(), s.customer())).isEqualByComparingTo("11600");
    assertThat(openPlans(s.tenant())).isEqualTo(4);

    JsonNode profit = body(send(s.tenant(), get("/api/v1/shipment/shipments/" + id + "/profit")));
    assertThat(profit.get("revenueTl").decimalValue()).isEqualByComparingTo("10000");
    assertThat(profit.get("costTl").decimalValue()).isEqualByComparingTo("6500");
    assertThat(profit.get("marginTl").decimalValue()).isEqualByComparingTo("3500");
    assertThat(profit.get("marginPercent").decimalValue()).isEqualByComparingTo("35");

    List<String> timeline = new ArrayList<>();
    body(send(s.tenant(), get("/api/v1/shipment/shipments/" + id + "/timeline")))
        .forEach(
            event -> {
              if ("STATUS".equals(event.get("type").asText())) {
                timeline.add(event.get("toStatus").asText());
              }
            });
    assertThat(timeline)
        .containsExactly(
            "QUOTED", "PLANNED", "LOADED", "IN_TRANSIT", "DELIVERED", "INVOICED", "CLOSED");
  }

  @Test
  void invalidTransitionsAreRejectedAndUnassignedCannotBePlanned() throws Exception {
    Setup s = setup("trn");
    String id = create(s.tenant(), shipmentBody(s, "100")).get("id").asText();

    moveTo(s.tenant(), id, "PLANNED")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("LEGS_NOT_ASSIGNED"));
    moveTo(s.tenant(), id, "IN_TRANSIT")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("SHIPMENT_INVALID_TRANSITION"));
    moveTo(s.tenant(), id, "INVOICED").andExpect(status().isConflict());
    moveTo(s.tenant(), id, "CANCELLED").andExpect(status().isOk());
    moveTo(s.tenant(), id, "PLANNED").andExpect(status().isConflict());
  }

  @Test
  void overlappingAssignmentIsBlockedAndCancelledShipmentReleasesResources() throws Exception {
    Setup s = setup("cnf");
    String truck = compliantVehicle(s.tenant(), "34CN01", "TRUCK");
    String driver = compliantDriver(s.tenant(), "S1");
    String otherTruck = compliantVehicle(s.tenant(), "34CN02", "TRUCK");
    String otherDriver = compliantDriver(s.tenant(), "S2");

    JsonNode first = create(s.tenant(), shipmentBody(s, "100"));
    assign(s.tenant(), legOf(first), Map.of("vehicleId", truck, "driverId", driver))
        .andExpect(status().isOk());

    JsonNode second = create(s.tenant(), shipmentBody(s, "100"));
    assign(s.tenant(), legOf(second), Map.of("vehicleId", truck, "driverId", otherDriver))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("ASSIGNMENT_CONFLICT"));
    assign(s.tenant(), legOf(second), Map.of("vehicleId", otherTruck, "driverId", driver))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("ASSIGNMENT_CONFLICT"));

    // Aynı gün ama çakışmayan saatler serbesttir.
    Map<String, Object> later = shipmentBody(s, "100");
    later.put("plannedPickup", END.plus(1, ChronoUnit.HOURS).toString());
    later.put("plannedDelivery", END.plus(3, ChronoUnit.HOURS).toString());
    assign(
            s.tenant(),
            legOf(create(s.tenant(), later)),
            Map.of("vehicleId", truck, "driverId", driver))
        .andExpect(status().isOk());

    moveTo(s.tenant(), first.get("id").asText(), "CANCELLED").andExpect(status().isOk());
    assign(s.tenant(), legOf(second), Map.of("vehicleId", truck, "driverId", otherDriver))
        .andExpect(status().isOk());
  }

  @Test
  void invalidDocumentsBlockOrWarnByPolicyAndTrailerRulesApply() throws Exception {
    Setup s = setup("doc");
    String expired = vehicle(s.tenant(), "34DC01", "TRUCK");
    document(s.tenant(), "VEHICLE", expired, "INSPECTION", tenantToday().minusDays(1));
    document(s.tenant(), "VEHICLE", expired, "TRAFFIC_INSURANCE", FAR);
    String driver = compliantDriver(s.tenant(), "S1");
    String trailer = compliantVehicle(s.tenant(), "34DC02", "TRAILER");
    String truck = compliantVehicle(s.tenant(), "34DC03", "TRUCK");
    JsonNode shipment = create(s.tenant(), shipmentBody(s, "100"));

    assign(s.tenant(), legOf(shipment), Map.of("vehicleId", expired, "driverId", driver))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("RESOURCE_BLOCKED"));
    assign(s.tenant(), legOf(shipment), Map.of("vehicleId", trailer, "driverId", driver))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("VEHICLE_IS_TRAILER"));
    assign(
            s.tenant(),
            legOf(shipment),
            Map.of("vehicleId", truck, "driverId", driver, "trailerId", truck))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("TRAILER_INVALID"));

    send(
            s.tenant(),
            MockMvcRequestBuilders.put("/api/v1/fleet/settings")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"blockOnExpired\":false,\"reminderDays\":30}"))
        .andExpect(status().isOk());
    JsonNode warned =
        body(
            assign(s.tenant(), legOf(shipment), Map.of("vehicleId", expired, "driverId", driver))
                .andExpect(status().isOk()));
    assertThat(warned.get("warnings").get(0).asText()).contains("EXPIRED:INSPECTION");
  }

  @Test
  void fleetAvailabilityShowsAssignedResourcesAsBusyAndCandidatesFilterCapacity() throws Exception {
    Setup s = setup("bsy");
    String tractor = compliantVehicle(s.tenant(), "34BS01", "TRACTOR");
    String driver = compliantDriver(s.tenant(), "S1");
    Map<String, Object> small = vehicleBody("34BS02", "TRUCK");
    small.put("capacityTon", "1");
    String smallTruck = created(post(s.tenant(), "/api/v1/fleet/vehicles", small));
    JsonNode shipment = create(s.tenant(), shipmentBody(s, "100"));

    JsonNode candidates =
        body(send(s.tenant(), get("/api/v1/shipment/legs/" + legOf(shipment) + "/candidates")));
    List<String> vehicleIds = new ArrayList<>();
    candidates.get("vehicles").forEach(row -> vehicleIds.add(row.get("subjectId").asText()));
    assertThat(vehicleIds).contains(tractor).doesNotContain(smallTruck);

    assign(s.tenant(), legOf(shipment), Map.of("vehicleId", tractor, "driverId", driver))
        .andExpect(status().isOk());
    String day = START.atZone(java.time.ZoneId.of("Europe/Istanbul")).toLocalDate().toString();
    JsonNode rows =
        body(
            send(
                s.tenant(),
                get("/api/v1/fleet/availability")
                    .param("type", "DRIVER")
                    .param("from", day)
                    .param("to", day)));
    assertThat(rows.get(0).get("availability").asText()).isEqualTo("BLOCKED");
    assertThat(rows.get(0).get("issues").toString()).contains("BUSY");

    JsonNode board =
        body(send(s.tenant(), get("/api/v1/shipment/board").param("from", day).param("to", day)));
    assertThat(board.get(0).get("leg").get("vehiclePlate").asText()).isEqualTo("34BS01");
  }

  @Test
  void cmrAndWaybillCarryCorrectFieldsAndFreezeWhenIssued() throws Exception {
    Setup s = setup("cmr");
    String truck = compliantVehicle(s.tenant(), "34CM01", "TRUCK");
    String trailerId = compliantVehicle(s.tenant(), "34CM02", "TRAILER");
    String driver = compliantDriver(s.tenant(), "S1");
    JsonNode shipment = create(s.tenant(), shipmentBody(s, "100"));
    String id = shipment.get("id").asText();

    post(s.tenant(), "/api/v1/shipment/shipments/" + id + "/documents/CMR", null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("LEGS_NOT_ASSIGNED"));

    assign(
            s.tenant(),
            legOf(shipment),
            Map.of("vehicleId", truck, "driverId", driver, "trailerId", trailerId))
        .andExpect(status().isOk());

    JsonNode cmr =
        body(
            post(s.tenant(), "/api/v1/shipment/shipments/" + id + "/documents/CMR", null)
                .andExpect(status().isOk()));
    assertThat(cmr.get("number").asText()).startsWith("CMR-");
    assertThat(cmr.get("status").asText()).isEqualTo("DRAFT");
    JsonNode content = cmr.get("content");
    assertThat(content.get("senderName").asText()).isEqualTo("Gönderici Şirket");
    assertThat(content.get("consigneeName").asText()).isEqualTo("Alıcı Şirket");
    assertThat(content.get("plates").asText()).isEqualTo("34CM01 / 34CM02");
    assertThat(content.get("totalWeightKg").decimalValue()).isEqualByComparingTo("5000");
    assertThat(content.get("goods").get(0).get("description").asText()).isEqualTo("Kumaş");

    byte[] pdf =
        send(s.tenant(), get("/api/v1/shipment/documents/" + cmr.get("id").asText() + "/pdf"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsByteArray();
    try (PdfReader reader = new PdfReader(pdf)) {
      assertThat(new PdfTextExtractor(reader).getTextFromPage(1))
          .contains("CMR Taşıma Senedi")
          .contains("Gönderici Şirket")
          .contains("34CM01");
    }

    JsonNode waybill =
        body(
            post(s.tenant(), "/api/v1/shipment/shipments/" + id + "/documents/WAYBILL", null)
                .andExpect(status().isOk()));
    assertThat(waybill.get("number").asText()).startsWith("IRS-");

    post(s.tenant(), "/api/v1/shipment/documents/" + cmr.get("id").asText() + "/issue", null)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("ISSUED"));
    post(s.tenant(), "/api/v1/shipment/shipments/" + id + "/documents/CMR", null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("DOCUMENT_ISSUED"));
  }

  @Test
  void invoiceRulesCancellationAndSecondInvoice() throws Exception {
    Setup s = setup("inv");
    String id = deliveredShipment(s, "1000", "34IN01", "S1");

    JsonNode invoice = issueInvoice(s.tenant(), id);
    assertThat(balance(s.tenant(), s.customer())).isEqualByComparingTo("1000");
    assertThat(
            body(send(s.tenant(), get("/api/v1/shipment/shipments/" + id))).get("status").asText())
        .isEqualTo("INVOICED");

    post(s.tenant(), "/api/v1/shipment/shipments/" + id + "/invoice", invoiceBody())
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INVOICE_NOT_ALLOWED"));

    post(
            s.tenant(),
            "/api/v1/shipment/invoices/" + invoice.get("id").asText() + "/cancel",
            Map.of("date", DATE))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("CANCELLED"));
    assertThat(balance(s.tenant(), s.customer())).isEqualByComparingTo("0");
    assertThat(
            body(send(s.tenant(), get("/api/v1/shipment/shipments/" + id))).get("status").asText())
        .isEqualTo("DELIVERED");

    JsonNode again = issueInvoice(s.tenant(), id);
    assertThat(again.get("number").asText()).isNotEqualTo(invoice.get("number").asText());
    assertThat(balance(s.tenant(), s.customer())).isEqualByComparingTo("1000");

    close(s.tenant(), id).andExpect(status().isOk());
    post(
            s.tenant(),
            "/api/v1/shipment/invoices/" + again.get("id").asText() + "/cancel",
            Map.of("date", DATE))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INVOICE_NOT_CANCELLABLE"));

    byte[] pdf =
        send(s.tenant(), get("/api/v1/shipment/invoices/" + again.get("id").asText() + "/pdf"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsByteArray();
    try (PdfReader reader = new PdfReader(pdf)) {
      assertThat(new PdfTextExtractor(reader).getTextFromPage(1))
          .contains("yasal e-Fatura yerine geçmez");
    }
  }

  @Test
  void undeliveredShipmentCannotBeInvoicedOrClosed() throws Exception {
    Setup s = setup("und");
    String id = create(s.tenant(), shipmentBody(s, "100")).get("id").asText();

    post(s.tenant(), "/api/v1/shipment/shipments/" + id + "/invoice", invoiceBody())
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INVOICE_NOT_ALLOWED"));
    close(s.tenant(), id)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CLOSE_NOT_ALLOWED"));
  }

  @Test
  void linkedVehicleExpenseCountsInProfitButIsNotPostedTwice() throws Exception {
    Setup s = setup("lnk");
    String truck = compliantVehicle(s.tenant(), "34LK01", "TRUCK");
    String id = deliveredShipmentWith(s, "1000", truck, compliantDriver(s.tenant(), "S1"));
    JsonNode expense =
        body(
            post(
                    s.tenant(),
                    "/api/v1/fleet/vehicles/" + truck + "/expenses",
                    Map.of(
                        "kind",
                        "FUEL",
                        "date",
                        DATE,
                        "branchId",
                        s.branch(),
                        "money",
                        Map.of("amount", "300", "currency", "TRY"),
                        "supplierAccountId",
                        s.supplier(),
                        "odometerKm",
                        "1000",
                        "liters",
                        "10"))
                .andExpect(status().isCreated()));
    String expenseId = expense.get("id").asText();
    assertThat(balance(s.tenant(), s.supplier())).isEqualByComparingTo("-300");

    Map<String, Object> link = Map.of("kind", "FUEL", "vehicleExpenseId", expenseId);
    post(s.tenant(), "/api/v1/shipment/shipments/" + id + "/costs", link)
        .andExpect(status().isCreated());
    post(s.tenant(), "/api/v1/shipment/shipments/" + id + "/costs", link)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("EXPENSE_ALREADY_LINKED"));

    issueInvoice(s.tenant(), id);
    close(s.tenant(), id).andExpect(status().isOk());

    assertThat(balance(s.tenant(), s.supplier())).isEqualByComparingTo("-300");
    JsonNode profit = body(send(s.tenant(), get("/api/v1/shipment/shipments/" + id + "/profit")));
    assertThat(profit.get("costTl").decimalValue()).isEqualByComparingTo("300");
    assertThat(profit.get("marginTl").decimalValue()).isEqualByComparingTo("700");
  }

  @Test
  void reversedVehicleExpenseLeavesProfitAndLinkableListShowsOnlyFreeExpenses() throws Exception {
    Setup s = setup("rev");
    String truck = compliantVehicle(s.tenant(), "34RV01", "TRUCK");
    String id = deliveredShipmentWith(s, "1000", truck, compliantDriver(s.tenant(), "S1"));
    String expenseId =
        body(post(
                    s.tenant(),
                    "/api/v1/fleet/vehicles/" + truck + "/expenses",
                    Map.of(
                        "kind",
                        "FUEL",
                        "date",
                        DATE,
                        "branchId",
                        s.branch(),
                        "money",
                        Map.of("amount", "300", "currency", "TRY"),
                        "supplierAccountId",
                        s.supplier(),
                        "odometerKm",
                        "1000",
                        "liters",
                        "10"))
                .andExpect(status().isCreated()))
            .get("id")
            .asText();

    String linkable = "/api/v1/shipment/shipments/" + id + "/linkable-expenses";
    assertThat(body(send(s.tenant(), get(linkable))).get(0).get("id").asText())
        .isEqualTo(expenseId);

    post(
            s.tenant(),
            "/api/v1/shipment/shipments/" + id + "/costs",
            Map.of("kind", "FUEL", "vehicleExpenseId", expenseId))
        .andExpect(status().isCreated());
    assertThat(body(send(s.tenant(), get(linkable)))).isEmpty();

    post(s.tenant(), "/api/v1/fleet/expenses/" + expenseId + "/reverse", Map.of("date", DATE))
        .andExpect(status().isNoContent());

    JsonNode profit = body(send(s.tenant(), get("/api/v1/shipment/shipments/" + id + "/profit")));
    assertThat(profit.get("costTl").decimalValue()).isEqualByComparingTo("0");
    assertThat(body(send(s.tenant(), get("/api/v1/shipment/shipments/" + id + "/costs"))))
        .isEmpty();
  }

  @Test
  void acceptedQuoteLineCarriesPriceAndContractPricesAutomatically() throws Exception {
    Setup s = setup("quo");
    String tariff =
        created(
            post(
                s.tenant(),
                "/api/v1/crm/tariffs",
                Map.of(
                    "code", "T1",
                    "name", "T1",
                    "currency", "TRY",
                    "validFrom", tenantToday().minusDays(1).toString(),
                    "active", true)));
    post(
            s.tenant(),
            "/api/v1/crm/tariffs/" + tariff + "/lines",
            Map.of(
                "kind", "ROUTE",
                "origin", "İstanbul",
                "destination", "Ankara",
                "unit", "TRIP",
                "unitPrice", "7000"))
        .andExpect(status().isCreated());
    Map<String, Object> quote = new HashMap<>();
    quote.put("accountId", s.customer());
    quote.put("tariffId", tariff);
    quote.put("currency", "TRY");
    quote.put("validUntil", DUE);
    String quoteId = created(post(s.tenant(), "/api/v1/crm/quotes", quote));
    JsonNode withLine =
        body(
            post(
                    s.tenant(),
                    "/api/v1/crm/quotes/" + quoteId + "/lines",
                    Map.of("origin", "İstanbul", "destination", "Ankara"))
                .andExpect(status().isCreated()));
    String lineId = withLine.get("lines").get(0).get("id").asText();

    Map<String, Object> fromQuote = shipmentBody(s, null);
    fromQuote.remove("manualNet");
    fromQuote.put("quoteLineId", lineId);
    post(s.tenant(), "/api/v1/shipment/shipments", fromQuote)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("QUOTE_NOT_ACCEPTED"));

    post(s.tenant(), "/api/v1/crm/quotes/" + quoteId + "/send", null).andExpect(status().isOk());
    post(
            s.tenant(),
            "/api/v1/crm/quotes/" + quoteId + "/accept",
            Map.of(
                "startDate", tenantToday().minusDays(1).toString(),
                "endDate", FAR.toString(),
                "tariffId", tariff))
        .andExpect(status().isOk());

    JsonNode shipment = create(s.tenant(), fromQuote);
    assertThat(amount(shipment.get("net"))).isEqualByComparingTo("7000");

    Map<String, Object> byContract = shipmentBody(s, null);
    byContract.remove("manualNet");
    JsonNode priced = create(s.tenant(), byContract);
    assertThat(amount(priced.get("net"))).isEqualByComparingTo("7000");
    assertThat(priced.get("breakdown").get("source").asText()).isEqualTo("CONTRACT");
  }

  @Test
  void driverAdvanceDebitsDriverAndPaysFromFund() throws Exception {
    Setup s = setup("adv");
    String driver = compliantDriver(s.tenant(), "S1");
    String driverAccount = driverAccount(s.tenant(), driver);
    String cash =
        created(
            post(
                s.tenant(),
                "/api/v1/finance/funds",
                Map.of(
                    "code", "K1",
                    "name", "Kasa",
                    "kind", "CASH",
                    "currency", "TRY",
                    "branchId", s.branch())));
    post(
            s.tenant(),
            "/api/v1/finance/funds/" + cash + "/transactions",
            Map.of(
                "direction",
                "IN",
                "money",
                Map.of("amount", "1000", "currency", "TRY"),
                "date",
                DATE))
        .andExpect(status().isCreated());

    post(
            s.tenant(),
            "/api/v1/fleet/drivers/" + driver + "/advances",
            Map.of(
                "branchId",
                s.branch(),
                "fundAccountId",
                cash,
                "money",
                Map.of("amount", "400", "currency", "TRY"),
                "date",
                DATE))
        .andExpect(status().isCreated());

    assertThat(balance(s.tenant(), driverAccount)).isEqualByComparingTo("400");
  }

  @Test
  void exceptionsAppearInTimelineAndPermissionsSplitOperationsFromFinance() throws Exception {
    Setup s = setup("per");
    String id = deliveredShipment(s, "1000", "34PR01", "S1");
    post(
            s.tenant(),
            "/api/v1/shipment/shipments/" + id + "/events",
            Map.of("type", "EXCEPTION", "message", "Sınırda gecikme"))
        .andExpect(status().isCreated());
    post(
            s.tenant(),
            "/api/v1/shipment/shipments/" + id + "/events",
            Map.of("type", "STATUS", "message", "Elle"))
        .andExpect(status().isBadRequest());

    String ops = inviteAndLogin(s.tenant(), "ops@" + s.tenant() + ".test", "OPERATIONS");
    mvc.perform(get("/api/v1/shipment/shipments/" + id).with(tenant(s.tenant())).with(bearer(ops)))
        .andExpect(status().isOk());
    mvc.perform(
            MockMvcRequestBuilders.post("/api/v1/shipment/shipments/" + id + "/invoice")
                .with(tenant(s.tenant()))
                .with(bearer(ops))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(invoiceBody())))
        .andExpect(status().isForbidden());

    String finance = inviteAndLogin(s.tenant(), "fin@" + s.tenant() + ".test", "FINANCE");
    mvc.perform(
            MockMvcRequestBuilders.post("/api/v1/shipment/shipments/" + id + "/invoice")
                .with(tenant(s.tenant()))
                .with(bearer(finance))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(invoiceBody())))
        .andExpect(status().isCreated());
    mvc.perform(
            MockMvcRequestBuilders.post("/api/v1/shipment/shipments/" + id + "/status")
                .with(tenant(s.tenant()))
                .with(bearer(finance))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"CANCELLED\"}"))
        .andExpect(status().isForbidden());
  }

  @Test
  void statusChangesReachAuditLogAndBlockedMessageIsReadable() throws Exception {
    Setup s = setup("aud");
    String id = deliveredShipment(s, "1000", "34AU01", "S1");
    String number =
        body(send(s.tenant(), get("/api/v1/shipment/shipments/" + id))).get("number").asText();

    String audit =
        body(send(s.tenant(), get("/api/v1/identity/audit-logs").param("size", "50"))).toString();
    assertThat(audit).contains("SHIPMENT_STATUS_CHANGED").contains(number);

    String noDocs = vehicle(s.tenant(), "34AU02", "TRUCK");
    String message =
        body(assign(
                    s.tenant(),
                    legOf(create(s.tenant(), shipmentBody(s, "100"))),
                    Map.of("vehicleId", noDocs, "driverId", compliantDriver(s.tenant(), "S2")))
                .andExpect(status().isConflict()))
            .get("message")
            .asText();
    assertThat(message).contains("eksik belge muayene").doesNotContain("MISSING");
  }

  @Test
  void trackingLinkShowsOnlyPublicFieldsUntilReplacedOrRevoked() throws Exception {
    Setup s = setup("trk");
    String id = deliveredShipment(s, "1000", "34TR01", "S1");
    String link = "/api/v1/shipment/shipments/" + id + "/tracking-link";
    send(s.tenant(), get(link))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.active").value(false));

    String path =
        body(post(s.tenant(), link, null).andExpect(status().isCreated())).get("path").asText();
    assertThat(path).startsWith("/track/" + s.tenant() + "/");
    String token = path.substring(path.lastIndexOf('/') + 1);
    assertThat(token).hasSizeGreaterThanOrEqualTo(40);

    // Oturum ve firma başlığı olmadan açılır; yalnız müşteriye uygun alanlar döner.
    JsonNode view =
        body(
            mvc.perform(get(publicTracking(s.tenant(), token)))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(header().string("X-Robots-Tag", "noindex, nofollow")));
    List<String> fields = new ArrayList<>();
    view.fieldNames().forEachRemaining(fields::add);
    assertThat(fields)
        .containsExactlyInAnyOrder(
            "company",
            "number",
            "status",
            "origin",
            "destination",
            "plannedPickup",
            "plannedDelivery",
            "steps",
            "deliveredAt",
            "recipientInitials");
    assertThat(view.get("status").asText()).isEqualTo("DELIVERED");
    assertThat(view.get("company").asText()).isEqualTo(s.tenant() + " Lojistik");
    assertThat(view.get("recipientInitials").asText()).isEqualTo("T. A.");
    List<String> steps = new ArrayList<>();
    view.get("steps").forEach(step -> steps.add(step.get("status").asText()));
    assertThat(steps).containsSubsequence("PLANNED", "LOADED", "IN_TRANSIT", "DELIVERED");

    send(s.tenant(), get(link))
        .andExpect(jsonPath("$.active").value(true))
        .andExpect(jsonPath("$.viewCount").value(1));

    // Bilinmeyen anahtar ile başka firmanın yolu aynı yanıtı alır.
    mvc.perform(get(publicTracking(s.tenant(), "yanlis-anahtar")))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("TRACKING_NOT_FOUND"));
    Setup other = setup("trk2");
    mvc.perform(get(publicTracking(other.tenant(), token)))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("TRACKING_NOT_FOUND"));

    // Yeni bağlantı eskisini geçersiz kılar; iptal sonrası hiçbiri açılmaz.
    String next =
        body(post(s.tenant(), link, null).andExpect(status().isCreated())).get("path").asText();
    String nextToken = next.substring(next.lastIndexOf('/') + 1);
    mvc.perform(get(publicTracking(s.tenant(), token))).andExpect(status().isNotFound());
    mvc.perform(get(publicTracking(s.tenant(), nextToken))).andExpect(status().isOk());
    send(s.tenant(), MockMvcRequestBuilders.delete(link)).andExpect(status().isNoContent());
    mvc.perform(get(publicTracking(s.tenant(), nextToken))).andExpect(status().isNotFound());
    send(s.tenant(), get(link)).andExpect(jsonPath("$.active").value(false));
  }

  @Test
  void cancelledShipmentGetsNoTrackingLink() throws Exception {
    Setup s = setup("trkc");
    String id = create(s.tenant(), shipmentBody(s, "1000")).get("id").asText();
    moveTo(s.tenant(), id, "CANCELLED").andExpect(status().isOk());
    post(s.tenant(), "/api/v1/shipment/shipments/" + id + "/tracking-link", null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("SHIPMENT_CANCELLED"));
  }

  @Test
  void deliveryEmailsMarkedContactsATrackingLinkOnce() throws Exception {
    Setup s = setup("dlv");
    String contacts = "/api/v1/crm/customers/" + s.customer() + "/contacts";
    String notified = "lojistik@musteri-" + s.tenant() + ".test";
    String silent = "muhasebe@musteri-" + s.tenant() + ".test";
    post(s.tenant(), contacts, contact("Ayşe Lojistik", notified, true))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.notifyDeliveries").value(true));
    post(s.tenant(), contacts, contact("Ali Muhasebe", silent, false))
        .andExpect(status().isCreated());
    post(s.tenant(), contacts, contact("E-postasız", null, true))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("CONTACT_EMAIL_REQUIRED"));

    String id = deliveredShipment(s, "1000", "34DL01", "S1");

    Notice notice = awaitNotice(notified);
    String number =
        body(send(s.tenant(), get("/api/v1/shipment/shipments/" + id))).get("number").asText();
    assertThat(notice.subject()).isEqualTo("Gönderiniz teslim edildi: " + number);
    assertThat(notice.text()).contains(s.tenant() + " Lojistik").doesNotContain("1.000");
    String url =
        notice.text().lines().filter(line -> line.contains("/track/")).findFirst().orElseThrow();
    assertThat(url).contains("/track/" + s.tenant() + "/");
    String token = url.substring(url.lastIndexOf('/') + 1).strip();
    mvc.perform(get(publicTracking(s.tenant(), token)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("DELIVERED"));
    assertThat(SENT_NOTICES).noneMatch(sent -> sent.email().equals(silent));

    // Geçmişte kime gittiği görünür; ofisin yeni bağlantısı e-postadakini de geçersiz kılar.
    List<String> notes = new ArrayList<>();
    body(send(s.tenant(), get("/api/v1/shipment/shipments/" + id + "/timeline")))
        .forEach(event -> notes.add(event.path("message").asText()));
    assertThat(notes).contains("Teslim bildirimi gönderildi: " + notified);
    String link = "/api/v1/shipment/shipments/" + id + "/tracking-link";
    send(s.tenant(), get(link)).andExpect(jsonPath("$.activeCount").value(1));
    post(s.tenant(), link, null).andExpect(status().isCreated());
    mvc.perform(get(publicTracking(s.tenant(), token))).andExpect(status().isNotFound());

    // Fatura iptaliyle teslim durumuna dönüş yeniden e-posta göndermez.
    String invoice = issueInvoice(s.tenant(), id).get("id").asText();
    post(s.tenant(), "/api/v1/shipment/invoices/" + invoice + "/cancel", Map.of("date", DATE))
        .andExpect(status().isOk());
    Thread.sleep(500);
    assertThat(SENT_NOTICES.stream().filter(sent -> sent.email().equals(notified))).hasSize(1);
  }

  // Yardımcılar

  private static Map<String, Object> contact(String name, String email, boolean notify) {
    Map<String, Object> body = new HashMap<>();
    body.put("fullName", name);
    body.put("email", email);
    body.put("notifyDeliveries", notify);
    return body;
  }

  /** E-posta işlem kaydedildikten sonra arka planda gider. */
  private static Notice awaitNotice(String email) throws InterruptedException {
    for (int i = 0; i < 100; i++) {
      for (Notice notice : SENT_NOTICES) {
        if (notice.email().equals(email)) {
          return notice;
        }
      }
      Thread.sleep(50);
    }
    throw new AssertionError("E-posta gitmedi: " + email);
  }

  private static String publicTracking(String tenant, String token) {
    return "/api/v1/public/tracking/" + tenant + "/" + token;
  }

  private Setup setup(String prefix) throws Exception {
    String t = "shp-" + prefix;
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

  private Map<String, Object> vehicleBody(String plate, String kind) {
    Map<String, Object> body = new HashMap<>();
    body.put("plate", plate);
    body.put("kind", kind);
    body.put("ownership", "OWNED");
    body.put("status", "ACTIVE");
    return body;
  }

  private String vehicle(String t, String plate, String kind) throws Exception {
    return created(post(t, "/api/v1/fleet/vehicles", vehicleBody(plate, kind)));
  }

  private String compliantVehicle(String t, String plate, String kind) throws Exception {
    String id = vehicle(t, plate, kind);
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

  private String driverAccount(String t, String driver) throws Exception {
    return body(send(t, get("/api/v1/fleet/drivers/" + driver))).get("accountId").asText();
  }

  private void document(String t, String subject, String id, String type, LocalDate expires)
      throws Exception {
    post(
            t,
            "/api/v1/fleet/" + subject + "/" + id + "/documents",
            Map.of("docType", type, "expiresOn", expires.toString()))
        .andExpect(status().isCreated());
  }

  private String taxRate(String t, String code, String vat, int numerator, int denominator)
      throws Exception {
    return created(
        post(
            t,
            "/api/v1/crm/tax-rates",
            Map.of(
                "code", code,
                "name", code,
                "vatPercent", vat,
                "withholdingNumerator", numerator,
                "withholdingDenominator", denominator)));
  }

  private Map<String, Object> shipmentBody(Setup s, String manualNet) {
    Map<String, Object> body = new HashMap<>();
    body.put("accountId", s.customer());
    body.put("branchId", s.branch());
    body.put("shipperName", "Gönderici Şirket");
    body.put("consigneeName", "Alıcı Şirket");
    body.put("origin", "İstanbul");
    body.put("destination", "Ankara");
    body.put("plannedPickup", START.toString());
    body.put("plannedDelivery", END.toString());
    body.put("currency", "TRY");
    if (manualNet != null) {
      body.put("manualNet", manualNet);
    }
    body.put(
        "cargo",
        List.of(
            Map.of(
                "description", "Kumaş",
                "quantity", "10",
                "packaging", "Palet",
                "weightKg", "5000")));
    return body;
  }

  private JsonNode create(String t, Map<String, Object> body) throws Exception {
    return body(post(t, "/api/v1/shipment/shipments", body).andExpect(status().isCreated()));
  }

  private static String legOf(JsonNode shipment) {
    return shipment.get("legs").get(0).get("id").asText();
  }

  private ResultActions assign(String t, String leg, Map<String, Object> body) throws Exception {
    return post(t, "/api/v1/shipment/legs/" + leg + "/assign", body);
  }

  private ResultActions moveTo(String t, String id, String target) throws Exception {
    return post(t, "/api/v1/shipment/shipments/" + id + "/status", Map.of("status", target));
  }

  private ResultActions pod(String t, String id) throws Exception {
    return post(
        t,
        "/api/v1/shipment/shipments/" + id + "/pod",
        Map.of("recipientName", "Teslim Alan", "deliveredAt", END.toString()));
  }

  private String deliveredShipment(Setup s, String net, String plate, String driverCode)
      throws Exception {
    return deliveredShipmentWith(
        s,
        net,
        compliantVehicle(s.tenant(), plate, "TRUCK"),
        compliantDriver(s.tenant(), driverCode));
  }

  private String deliveredShipmentWith(Setup s, String net, String truck, String driver)
      throws Exception {
    JsonNode shipment = create(s.tenant(), shipmentBody(s, net));
    String id = shipment.get("id").asText();
    assign(s.tenant(), legOf(shipment), Map.of("vehicleId", truck, "driverId", driver))
        .andExpect(status().isOk());
    moveTo(s.tenant(), id, "PLANNED").andExpect(status().isOk());
    moveTo(s.tenant(), id, "LOADED").andExpect(status().isOk());
    moveTo(s.tenant(), id, "IN_TRANSIT").andExpect(status().isOk());
    pod(s.tenant(), id).andExpect(status().isOk());
    moveTo(s.tenant(), id, "DELIVERED").andExpect(status().isOk());
    return id;
  }

  private ResultActions addCost(String t, String id, String kind, String account, String amount)
      throws Exception {
    return post(
        t,
        "/api/v1/shipment/shipments/" + id + "/costs",
        Map.of(
            "kind", kind,
            "accountId", account,
            "money", Map.of("amount", amount, "currency", "TRY"),
            "date", DATE));
  }

  private static Map<String, Object> invoiceBody() {
    return Map.of("invoiceDate", DATE, "dueDate", DUE);
  }

  private JsonNode issueInvoice(String t, String id) throws Exception {
    return body(
        post(t, "/api/v1/shipment/shipments/" + id + "/invoice", invoiceBody())
            .andExpect(status().isCreated()));
  }

  private ResultActions close(String t, String id) throws Exception {
    return post(
        t, "/api/v1/shipment/shipments/" + id + "/close", Map.of("date", DATE, "dueDate", DUE));
  }

  private BigDecimal balance(String t, String account) throws Exception {
    for (JsonNode row : body(send(t, get("/api/v1/finance/accounts/" + account))).get("balances")) {
      if ("TRY".equals(row.get("currency").asText())) {
        return row.get("balance").decimalValue();
      }
    }
    return BigDecimal.ZERO;
  }

  private int openPlans(String t) throws Exception {
    return body(send(t, get("/api/v1/finance/payment-plans").param("status", "DRAFT")))
        .get("totalElements")
        .asInt();
  }

  private static BigDecimal amount(JsonNode money) {
    return new BigDecimal(money.get("amount").asText());
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
