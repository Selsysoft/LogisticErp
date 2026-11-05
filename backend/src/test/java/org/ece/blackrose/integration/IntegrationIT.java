package org.ece.blackrose.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import javax.xml.parsers.DocumentBuilderFactory;
import org.ece.blackrose.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.w3c.dom.Document;

class IntegrationIT extends AbstractIntegrationTest {

  private static final String BASE = "/api/v1/integration";
  private static final Instant START =
      Instant.now().minus(2, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MINUTES);
  private static final Instant END = START.plus(4, ChronoUnit.DAYS);
  private static final LocalDate TODAY = LocalDate.now().minusDays(1);
  private static final LocalDate FAR = LocalDate.now().plusDays(400);
  private static final DateTimeFormatter LOCAL =
      DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm").withZone(ZoneId.of("Europe/Istanbul"));

  private record Setup(String tenant, String branch, String customer, String supplier) {}

  @Test
  void invoiceGoesAsEDocumentBlocksInvoiceCancelAndCanBeResent() throws Exception {
    Setup s = setup("edc");
    JsonNode invoice = deliveredInvoice(s, "34ED01");
    String invoiceId = invoice.get("id").asText();
    Map<String, Object> send =
        Map.of("kind", "EFATURA", "sourceType", "FREIGHT_INVOICE", "sourceId", invoiceId);

    post(s.tenant(), BASE + "/e-documents", send)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("COMPANY_TAX_REQUIRED"));
    settings(s);
    // Müşterinin vergi numarası yok: e-Fatura gitmez, e-Arşiv gider.
    post(s.tenant(), BASE + "/e-documents", send)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CUSTOMER_TAX_REQUIRED"));

    JsonNode sent =
        body(
            post(
                    s.tenant(),
                    BASE + "/e-documents",
                    Map.of(
                        "kind", "EARSIV", "sourceType", "FREIGHT_INVOICE", "sourceId", invoiceId))
                .andExpect(status().isCreated()));
    assertThat(sent.get("status").asText()).isEqualTo("SENT");
    assertThat(sent.get("provider").asText()).isEqualTo("MOCK");
    String id = sent.get("id").asText();

    Document ubl = parse(s, id);
    assertThat(ubl.getDocumentElement().getLocalName()).isEqualTo("Invoice");
    assertThat(ubl.getElementsByTagNameNS("*", "ProfileID").item(0).getTextContent())
        .isEqualTo("EARSIVFATURA");
    assertThat(ubl.getElementsByTagNameNS("*", "PayableAmount").item(0).getTextContent())
        .startsWith("1000");
    assertThat(ubl.getElementsByTagNameNS("*", "UUID").item(0).getTextContent())
        .isEqualTo(sent.get("ettn").asText());
    // Firma adındaki & işareti XML'i bozmaz.
    assertThat(ubl.getElementsByTagNameNS("*", "AccountingCustomerParty").item(0).getTextContent())
        .contains("Müşteri & Ort");

    post(
            s.tenant(),
            BASE + "/e-documents",
            Map.of("kind", "EARSIV", "sourceType", "FREIGHT_INVOICE", "sourceId", invoiceId))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("EDOCUMENT_ALREADY_SENT"));

    post(s.tenant(), BASE + "/e-documents/" + id + "/refresh", null)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("ACCEPTED"));

    post(
            s.tenant(),
            "/api/v1/shipment/invoices/" + invoiceId + "/cancel",
            Map.of("date", TODAY.toString()))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INVOICE_HAS_EDOCUMENT"));

    post(s.tenant(), BASE + "/e-documents/" + id + "/cancel", null)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("CANCELLED"));
    post(
            s.tenant(),
            "/api/v1/shipment/invoices/" + invoiceId + "/cancel",
            Map.of("date", TODAY.toString()))
        .andExpect(status().isOk());
  }

  @Test
  void rejectedEDocumentCanBeResentAndWaybillMustBeIssuedFirst() throws Exception {
    Setup s = setup("rjc");
    settings(s);
    String rejected =
        created(
            post(
                s.tenant(),
                "/api/v1/finance/accounts",
                Map.of(
                    "code",
                    "M2",
                    "name",
                    "Reddedilen",
                    "type",
                    "CUSTOMER",
                    "taxNumber",
                    "0001112223")));
    Setup other = new Setup(s.tenant(), s.branch(), rejected, s.supplier());
    JsonNode invoice = deliveredInvoice(other, "34RJ01");
    Map<String, Object> send =
        Map.of(
            "kind",
            "EFATURA",
            "sourceType",
            "FREIGHT_INVOICE",
            "sourceId",
            invoice.get("id").asText());
    String id = created(post(s.tenant(), BASE + "/e-documents", send));
    post(s.tenant(), BASE + "/e-documents/" + id + "/refresh", null)
        .andExpect(jsonPath("$.status").value("REJECTED"));
    post(s.tenant(), BASE + "/e-documents", send).andExpect(status().isCreated());

    String truck = compliantVehicle(s.tenant(), "34RJ02");
    String driver = compliantDriver(s.tenant(), "S2");
    JsonNode shipment = shipment(s, END.plus(5, ChronoUnit.DAYS), END.plus(6, ChronoUnit.DAYS));
    assign(s.tenant(), shipment, truck, driver);
    String waybill =
        body(post(
                    s.tenant(),
                    "/api/v1/shipment/shipments/"
                        + shipment.get("id").asText()
                        + "/documents/WAYBILL",
                    null)
                .andExpect(status().isOk()))
            .get("id")
            .asText();
    Map<String, Object> sendWaybill =
        Map.of("kind", "EIRSALIYE", "sourceType", "WAYBILL", "sourceId", waybill);
    post(s.tenant(), BASE + "/e-documents", sendWaybill)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("DOCUMENT_NOT_ISSUED"));
    post(s.tenant(), "/api/v1/shipment/documents/" + waybill + "/issue", null)
        .andExpect(status().isOk());
    post(
            s.tenant(),
            BASE + "/e-documents",
            Map.of("kind", "EFATURA", "sourceType", "WAYBILL", "sourceId", waybill))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("EDOCUMENT_KIND_INVALID"));
    String sent = created(post(s.tenant(), BASE + "/e-documents", sendWaybill));
    assertThat(parse(s, sent).getDocumentElement().getLocalName()).isEqualTo("DespatchAdvice");
  }

  @Test
  void tollFileMatchesShipmentByPlateAndTimeAndPostsOnce() throws Exception {
    Setup s = setup("tol");
    String truck = compliantVehicle(s.tenant(), "34 TL 01");
    JsonNode shipment = shipment(s, START, END);
    String shipmentId = shipment.get("id").asText();
    assign(s.tenant(), shipment, truck, compliantDriver(s.tenant(), "S1"));
    String during = LOCAL.format(START.plus(1, ChronoUnit.HOURS));
    String outside = LOCAL.format(END.plus(30, ChronoUnit.DAYS));
    String file =
        "plaka;tarih;nokta;tutar;para;ref\n"
            + "34tl01;"
            + during
            + ";FSM Köprüsü;1.250,50;;R1\n"
            + "34TL01;"
            + outside
            + ";Osmangazi;100;;R2\n"
            + "99ZZ99;"
            + during
            + ";Bilinmeyen;50;;R3\n"
            + "34TL01;tarih yok;Hatalı;10;;R4\n";

    JsonNode detail = upload(s, "TOLL", file);
    List<JsonNode> rows = rows(detail);
    assertThat(rows.get(0).get("status").asText()).isEqualTo("MATCHED");
    assertThat(rows.get(0).get("shipmentId").asText()).isEqualTo(shipmentId);
    assertThat(rows.get(1).get("status").asText()).isEqualTo("UNMATCHED");
    assertThat(rows.get(2).get("message").asText()).contains("Plaka");
    assertThat(rows.get(3).get("status").asText()).isEqualTo("ERROR");
    assertThat(rows.get(3).get("message").asText()).contains("okunamadı");

    String batch = detail.get("batch").get("id").asText();
    JsonNode posted =
        body(
            post(s.tenant(), BASE + "/imports/" + batch + "/post", null)
                .andExpect(status().isOk()));
    assertThat(rows(posted).get(0).get("status").asText()).isEqualTo("POSTED");

    JsonNode costs =
        body(send(s.tenant(), get("/api/v1/shipment/shipments/" + shipmentId + "/costs")));
    assertThat(costs).hasSize(1);
    assertThat(costs.get(0).get("kind").asText()).isEqualTo("TOLL");
    assertThat(costs.get(0).get("tlAmount").decimalValue()).isEqualByComparingTo("1250.50");

    // Elle sefer atama ve yoksayma.
    send(
            s.tenant(),
            MockMvcRequestBuilders.put(BASE + "/import-rows/" + rows.get(1).get("id").asText())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"shipmentId\":\"" + shipmentId + "\"}"))
        .andExpect(status().isOk());
    post(s.tenant(), BASE + "/import-rows/" + rows.get(2).get("id").asText() + "/ignore", null)
        .andExpect(status().isOk());
    post(s.tenant(), BASE + "/imports/" + batch + "/post", null).andExpect(status().isOk());
    assertThat(body(send(s.tenant(), get("/api/v1/shipment/shipments/" + shipmentId + "/costs"))))
        .hasSize(2);

    // Yeniden yükleme: aynı referanslar atlanır, gider çoğalmaz.
    JsonNode again = upload(s, "TOLL", file);
    assertThat(again.get("batch").get("duplicates").asInt()).isEqualTo(3);
    post(s.tenant(), BASE + "/imports/" + again.get("batch").get("id").asText() + "/post", null)
        .andExpect(status().isOk());
    assertThat(body(send(s.tenant(), get("/api/v1/shipment/shipments/" + shipmentId + "/costs"))))
        .hasSize(2);
  }

  @Test
  void fuelFileWritesVehicleExpenseToSupplierAndLinksShipmentWithoutDoublePosting()
      throws Exception {
    Setup s = setup("ful");
    String truck = compliantVehicle(s.tenant(), "34FL01");
    JsonNode shipment = shipment(s, START, END);
    assign(s.tenant(), shipment, truck, compliantDriver(s.tenant(), "S1"));
    String during = LOCAL.format(START.plus(1, ChronoUnit.HOURS));
    String outside = LOCAL.format(START.minus(10, ChronoUnit.DAYS));
    String file =
        "plaka,tarih,litre,tutar,km,istasyon,para,ref\n"
            + "34FL01,"
            + outside
            + ",100,4000,1000,Opet,,F1\n"
            + "34FL01,"
            + during
            + ",50,2000,1500,Shell,,F2\n";

    JsonNode detail = upload(s, "FUEL", file);
    assertThat(rows(detail)).allMatch(row -> "MATCHED".equals(row.get("status").asText()));
    post(s.tenant(), BASE + "/imports/" + detail.get("batch").get("id").asText() + "/post", null)
        .andExpect(status().isOk());

    assertThat(balance(s.tenant(), s.supplier())).isEqualByComparingTo("-6000");
    JsonNode expenses =
        body(send(s.tenant(), get("/api/v1/fleet/expenses").param("vehicleId", truck)));
    assertThat(expenses.get("totalElements").asInt()).isEqualTo(2);

    String id = shipment.get("id").asText();
    JsonNode profit = body(send(s.tenant(), get("/api/v1/shipment/shipments/" + id + "/profit")));
    assertThat(profit.get("costTl").decimalValue()).isEqualByComparingTo("2000");
  }

  @Test
  void bankStatementAutoMatchesOnlyClearCasesAndReportsDifferences() throws Exception {
    Setup s = setup("bnk");
    String fund =
        created(
            post(
                s.tenant(),
                "/api/v1/finance/funds",
                Map.of(
                    "code",
                    "B1",
                    "name",
                    "Banka",
                    "kind",
                    "BANK",
                    "currency",
                    "TRY",
                    "branchId",
                    s.branch())));
    String date = TODAY.toString();
    deposit(s, fund, "1000", TODAY);
    deposit(s, fund, "500", TODAY);
    deposit(s, fund, "500", TODAY);

    String file =
        "tarih;tutar;aciklama;ref\n"
            + date
            + ";1.000,00;Havale;A1\n"
            + date
            + ";500,00;Belirsiz;A2\n"
            + date
            + ";750,00;Sistemde yok;A3\n"
            + date
            + ";-1000;Yön farklı;A4\n"
            + "bozuk;10;Hatalı;A5\n";
    JsonNode result =
        body(
            mvc.perform(
                    MockMvcRequestBuilders.multipart(BASE + "/bank/" + fund + "/statements")
                        .file(file(file))
                        .with(asOwner(s.tenant())))
                .andExpect(status().isCreated()));
    assertThat(result.get("imported").asInt()).isEqualTo(4);
    assertThat(result.get("matched").asInt()).isEqualTo(1);
    assertThat(result.get("errors").get(0).asText()).contains("Satır 6");

    JsonNode summary = body(send(s.tenant(), get(BASE + "/bank/" + fund + "/summary")));
    assertThat(summary.get("matched").asInt()).isEqualTo(1);
    assertThat(summary.get("unmatched").asInt()).isEqualTo(3);

    JsonNode lines = body(send(s.tenant(), get(BASE + "/bank/" + fund + "/lines")));
    String ambiguous = lineId(lines, "A2");
    JsonNode candidates =
        body(send(s.tenant(), get(BASE + "/bank/lines/" + ambiguous + "/candidates")));
    String tx500 = null;
    String tx1000 = null;
    for (JsonNode row : candidates) {
      if (row.get("amount").decimalValue().compareTo(new BigDecimal("500")) == 0) {
        tx500 = row.get("id").asText();
      }
    }
    assertThat(candidates).hasSize(2);
    assertThat(tx1000).isNull();

    post(
            s.tenant(),
            BASE + "/bank/lines/" + lineId(lines, "A3") + "/match",
            Map.of("transactionId", tx500))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("AMOUNT_MISMATCH"));
    post(s.tenant(), BASE + "/bank/lines/" + ambiguous + "/match", Map.of("transactionId", tx500))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("MATCHED"));
    post(s.tenant(), BASE + "/bank/lines/" + lineId(lines, "A4") + "/ignore", null)
        .andExpect(status().isOk());

    // Aynı ekstre yeniden yüklenince satır çoğalmaz; finans bakiyesi değişmez.
    JsonNode again =
        body(
            mvc.perform(
                    MockMvcRequestBuilders.multipart(BASE + "/bank/" + fund + "/statements")
                        .file(file(file))
                        .with(asOwner(s.tenant())))
                .andExpect(status().isCreated()));
    assertThat(again.get("duplicates").asInt()).isEqualTo(4);
    JsonNode after = body(send(s.tenant(), get(BASE + "/bank/" + fund + "/summary")));
    assertThat(after.get("matched").asInt()).isEqualTo(2);
    assertThat(after.get("ignored").asInt()).isEqualTo(1);
    assertThat(after.get("unmatchedTotal").decimalValue()).isEqualByComparingTo("750");
  }

  @Test
  void gpsPositionsShowOnShipmentAndGeofenceEventsReachTimelineOnce() throws Exception {
    Setup s = setup("gps");
    String truck = compliantVehicle(s.tenant(), "34GP01");
    JsonNode shipment = shipment(s, START, END);
    String id = shipment.get("id").asText();
    assign(s.tenant(), shipment, truck, compliantDriver(s.tenant(), "S1"));
    created(
        post(
            s.tenant(),
            BASE + "/gps/geofences",
            Map.of(
                "name",
                "Ankara Depo",
                "latitude",
                "39.9334",
                "longitude",
                "32.8597",
                "radiusM",
                1000)));

    Instant t = START.plus(1, ChronoUnit.HOURS);
    Map<String, Object> batch =
        Map.of(
            "positions",
            List.of(
                position("34GP01", t, "41.0082", "28.9784"),
                position("34gp01", t.plus(1, ChronoUnit.HOURS), "39.9335", "32.8598"),
                position("34GP01", t.plus(2, ChronoUnit.HOURS), "39.0000", "33.0000"),
                position("99ZZ99", t, "40.0000", "30.0000")));
    JsonNode result =
        body(post(s.tenant(), BASE + "/gps/positions", batch).andExpect(status().isOk()));
    assertThat(result.get("stored").asInt()).isEqualTo(3);
    assertThat(result.get("unknownVehicles").asInt()).isEqualTo(1);
    assertThat(result.get("events").asInt()).isEqualTo(2);

    JsonNode again =
        body(post(s.tenant(), BASE + "/gps/positions", batch).andExpect(status().isOk()));
    assertThat(again.get("duplicates").asInt()).isEqualTo(3);
    assertThat(again.get("events").asInt()).isZero();

    JsonNode last = body(send(s.tenant(), get(BASE + "/gps/shipments/" + id)));
    assertThat(last).hasSize(1);
    assertThat(last.get(0).get("plate").asText()).isEqualTo("34GP01");
    assertThat(last.get(0).get("latitude").decimalValue()).isEqualByComparingTo("39.0000");
    assertThat(last.get(0).get("shipmentId").asText()).isEqualTo(id);

    String timeline =
        body(send(s.tenant(), get("/api/v1/shipment/shipments/" + id + "/timeline"))).toString();
    assertThat(timeline)
        .contains("Ankara Depo bölgesine girdi")
        .contains("Ankara Depo bölgesinden çıktı");
    assertThat(body(send(s.tenant(), get(BASE + "/gps/events")))).hasSize(2);

    post(
            s.tenant(),
            BASE + "/gps/positions",
            Map.of("positions", List.of(position("34GP01", t, "95.0", "28.0"))))
        .andExpect(status().isBadRequest());
  }

  @Test
  void distanceTableFillsShipmentKmAndPricesFromIt() throws Exception {
    Setup s = setup("dst");
    post(
            s.tenant(),
            BASE + "/distances",
            Map.of(
                "origin",
                " İstanbul ",
                "destination",
                "Ankara",
                "distanceKm",
                "450",
                "minutes",
                330))
        .andExpect(status().isCreated());
    post(
            s.tenant(),
            BASE + "/distances",
            Map.of("origin", "istanbul", "destination", "ANKARA", "distanceKm", "1", "minutes", 1))
        .andExpect(status().isConflict());

    JsonNode shipment = shipment(s, START, END);
    assertThat(shipment.get("distanceKm").decimalValue()).isEqualByComparingTo("450");

    Map<String, Object> manual = shipmentBody(s, START, END);
    manual.put("distanceKm", "480");
    JsonNode typed =
        body(
            post(s.tenant(), "/api/v1/shipment/shipments", manual).andExpect(status().isCreated()));
    assertThat(typed.get("distanceKm").decimalValue()).isEqualByComparingTo("480");
  }

  @Test
  void permissionsFollowTheOwningModule() throws Exception {
    Setup s = setup("per");
    String ops = inviteAndLogin(s.tenant(), "ops@" + s.tenant() + ".test", "OPERATIONS");
    mvc.perform(get(BASE + "/e-documents").with(tenant(s.tenant())).with(bearer(ops)))
        .andExpect(status().isOk());
    mvc.perform(
            MockMvcRequestBuilders.put(BASE + "/e-document-settings")
                .with(tenant(s.tenant()))
                .with(bearer(ops))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"taxNumber\":\"1\"}"))
        .andExpect(status().isForbidden());
    mvc.perform(
            get(BASE + "/bank/" + s.branch() + "/lines").with(tenant(s.tenant())).with(bearer(ops)))
        .andExpect(status().isForbidden());
    mvc.perform(get(BASE + "/options").with(tenant(s.tenant())).with(bearer(ops)))
        .andExpect(status().isOk());
  }

  // Yardımcılar

  private Document parse(Setup s, String id) throws Exception {
    String xml =
        new String(
            send(s.tenant(), get(BASE + "/e-documents/" + id + "/ubl"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsByteArray(),
            StandardCharsets.UTF_8);
    DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
    factory.setNamespaceAware(true);
    return factory
        .newDocumentBuilder()
        .parse(new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
  }

  private void settings(Setup s) throws Exception {
    send(
            s.tenant(),
            MockMvcRequestBuilders.put(BASE + "/e-document-settings")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"taxNumber\":\"1234567890\",\"taxOffice\":\"Kadıköy\"}"))
        .andExpect(status().isOk());
  }

  private JsonNode deliveredInvoice(Setup s, String plate) throws Exception {
    String truck = compliantVehicle(s.tenant(), plate);
    String driver = compliantDriver(s.tenant(), "D" + plate);
    JsonNode shipment = shipment(s, START, END);
    String id = shipment.get("id").asText();
    assign(s.tenant(), shipment, truck, driver);
    for (String next : List.of("PLANNED", "LOADED", "IN_TRANSIT")) {
      post(s.tenant(), "/api/v1/shipment/shipments/" + id + "/status", Map.of("status", next))
          .andExpect(status().isOk());
    }
    post(
            s.tenant(),
            "/api/v1/shipment/shipments/" + id + "/pod",
            Map.of("recipientName", "Alıcı", "deliveredAt", START.toString()))
        .andExpect(status().isOk());
    post(s.tenant(), "/api/v1/shipment/shipments/" + id + "/status", Map.of("status", "DELIVERED"))
        .andExpect(status().isOk());
    return body(
        post(
                s.tenant(),
                "/api/v1/shipment/shipments/" + id + "/invoice",
                Map.of("invoiceDate", TODAY.toString(), "dueDate", FAR.toString()))
            .andExpect(status().isCreated()));
  }

  private Setup setup(String prefix) throws Exception {
    String t = "ent-" + prefix;
    createTenant(t);
    String branch =
        created(
            post(
                t,
                "/api/v1/organization/branches",
                Map.of("code", "S" + System.nanoTime(), "name", "Şube")));
    String customer =
        created(
            post(
                t,
                "/api/v1/finance/accounts",
                Map.of("code", "M1", "name", "Müşteri & Ort", "type", "CUSTOMER")));
    String supplier =
        created(
            post(
                t,
                "/api/v1/finance/accounts",
                Map.of("code", "T1", "name", "Tedarikçi", "type", "SUPPLIER")));
    return new Setup(t, branch, customer, supplier);
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

  private static MockMultipartFile file(String content) {
    return new MockMultipartFile(
        "file", "dosya.csv", "text/csv", content.getBytes(StandardCharsets.UTF_8));
  }

  private JsonNode upload(Setup s, String kind, String content) throws Exception {
    return body(
        mvc.perform(
                MockMvcRequestBuilders.multipart(BASE + "/imports")
                    .file(file(content))
                    .param("kind", kind)
                    .param("accountId", s.supplier())
                    .param("branchId", s.branch())
                    .with(asOwner(s.tenant())))
            .andExpect(status().isCreated()));
  }

  private static List<JsonNode> rows(JsonNode detail) {
    List<JsonNode> rows = new java.util.ArrayList<>();
    detail.get("rows").forEach(rows::add);
    return rows;
  }

  private static String lineId(JsonNode lines, String reference) {
    for (JsonNode line : lines) {
      if (reference.equals(line.get("reference").asText())) {
        return line.get("id").asText();
      }
    }
    throw new AssertionError(reference);
  }

  private void deposit(Setup s, String fund, String amount, LocalDate date) throws Exception {
    post(
            s.tenant(),
            "/api/v1/finance/funds/" + fund + "/transactions",
            Map.of(
                "direction", "IN",
                "money", Map.of("amount", amount, "currency", "TRY"),
                "date", date.toString()))
        .andExpect(status().isCreated());
  }

  private static Map<String, Object> position(String plate, Instant at, String lat, String lon) {
    return Map.of("plate", plate, "recordedAt", at.toString(), "latitude", lat, "longitude", lon);
  }

  private Map<String, Object> shipmentBody(Setup s, Instant start, Instant end) {
    Map<String, Object> body = new HashMap<>();
    body.put("accountId", s.customer());
    body.put("branchId", s.branch());
    body.put("shipperName", "Gönderici");
    body.put("consigneeName", "Alıcı");
    body.put("origin", "İstanbul");
    body.put("destination", "Ankara");
    body.put("plannedPickup", start.toString());
    body.put("plannedDelivery", end.toString());
    body.put("currency", "TRY");
    body.put("manualNet", "1000");
    return body;
  }

  private JsonNode shipment(Setup s, Instant start, Instant end) throws Exception {
    return body(
        post(s.tenant(), "/api/v1/shipment/shipments", shipmentBody(s, start, end))
            .andExpect(status().isCreated()));
  }

  private void assign(String t, JsonNode shipment, String truck, String driver) throws Exception {
    post(
            t,
            "/api/v1/shipment/legs/" + shipment.get("legs").get(0).get("id").asText() + "/assign",
            Map.of("vehicleId", truck, "driverId", driver))
        .andExpect(status().isOk());
  }

  private String compliantVehicle(String t, String plate) throws Exception {
    String id =
        created(
            post(
                t,
                "/api/v1/fleet/vehicles",
                Map.of("plate", plate, "kind", "TRUCK", "ownership", "OWNED", "status", "ACTIVE")));
    document(t, "VEHICLE", id, "INSPECTION");
    document(t, "VEHICLE", id, "TRAFFIC_INSURANCE");
    return id;
  }

  private String compliantDriver(String t, String code) throws Exception {
    String id =
        created(
            post(
                t,
                "/api/v1/fleet/drivers",
                Map.of("code", code, "fullName", "Sürücü " + code, "status", "ACTIVE")));
    document(t, "DRIVER", id, "LICENSE");
    document(t, "DRIVER", id, "SRC");
    document(t, "DRIVER", id, "PSYCHOTECHNIC");
    return id;
  }

  private void document(String t, String subject, String id, String type) throws Exception {
    post(
            t,
            "/api/v1/fleet/" + subject + "/" + id + "/documents",
            Map.of("docType", type, "expiresOn", FAR.toString()))
        .andExpect(status().isCreated());
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
