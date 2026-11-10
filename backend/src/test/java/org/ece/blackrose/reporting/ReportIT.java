package org.ece.blackrose.reporting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.parser.PdfTextExtractor;
import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.ece.blackrose.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

class ReportIT extends AbstractIntegrationTest {

  private static final String BASE = "/api/v1/reports";
  private static final Instant START =
      Instant.now().minus(5, ChronoUnit.DAYS).truncatedTo(ChronoUnit.MINUTES);
  private static final Instant END = START.plus(2, ChronoUnit.DAYS);
  private static final LocalDate TODAY = tenantToday().minusDays(1);
  private static final LocalDate FROM = tenantToday().minusDays(30);
  private static final LocalDate TO = tenantToday().plusDays(1);
  private static final LocalDate FAR = tenantToday().plusDays(400);

  private record Setup(String tenant, String branch, String customer, String supplier) {}

  @Test
  void profitabilityMatchesFinanceAndAllGroupsAgree() throws Exception {
    Setup s = setup("pro");
    String truck = vehicle(s.tenant(), "34RP01");
    String driver = driver(s.tenant(), "S1");
    String carrier = account(s.tenant(), "TS1", "CARRIER");

    // Öz filo seferi: 10000 gelir, 2500 gider; kapanmış.
    closedShipment(s, "10000", truck, driver, "2500", START);
    // Taşeronlu sefer: 4000 gelir, 3000 taşeron; faturalı, açık.
    JsonNode second = shipment(s, "4000", START.plus(1, ChronoUnit.DAYS));
    String secondId = second.get("id").asText();
    assign(
            s.tenant(),
            second,
            Map.of(
                "carrierAccountId",
                carrier,
                "carrierCost",
                Map.of("amount", "3000", "currency", "TRY")))
        .andExpect(status().isOk());
    deliverAndInvoice(s, secondId);
    // Faturalanmamış sefer kârlılığa girmez.
    shipment(s, "99999", START);

    JsonNode bySefer = profit(s, "SHIPMENT");
    assertThat(bySefer.get("rows")).hasSize(2);
    assertThat(bySefer.get("revenueTl").decimalValue()).isEqualByComparingTo("14000");
    assertThat(bySefer.get("costTl").decimalValue()).isEqualByComparingTo("5500");
    assertThat(bySefer.get("marginTl").decimalValue()).isEqualByComparingTo("8500");
    assertThat(bySefer.get("marginPercent").decimalValue()).isEqualByComparingTo("60.71");

    // Finansla tutarlılık: gelir müşteri borcuna, kapanan gider tedarikçi alacağına eşit.
    assertThat(balance(s.tenant(), s.customer())).isEqualByComparingTo("14000");
    assertThat(balance(s.tenant(), s.supplier())).isEqualByComparingTo("-2500");

    for (String group : List.of("CUSTOMER", "ROUTE", "VEHICLE", "OWNERSHIP")) {
      JsonNode report = profit(s, group);
      assertThat(report.get("revenueTl").decimalValue()).as(group).isEqualByComparingTo("14000");
      assertThat(report.get("costTl").decimalValue()).as(group).isEqualByComparingTo("5500");
    }

    JsonNode ownership = profit(s, "OWNERSHIP");
    assertThat(ownership.get("rows")).hasSize(2);
    Map<String, BigDecimal> margins = new HashMap<>();
    ownership
        .get("rows")
        .forEach(row -> margins.put(row.get("key").asText(), row.get("marginTl").decimalValue()));
    assertThat(margins.get("OWN")).isEqualByComparingTo("7500");
    assertThat(margins.get("CARRIER")).isEqualByComparingTo("1000");

    JsonNode byVehicle = profit(s, "VEHICLE");
    List<String> labels = new ArrayList<>();
    byVehicle.get("rows").forEach(row -> labels.add(row.get("label").asText()));
    assertThat(labels).contains("34RP01", "Taşeron: TS1");
  }

  @Test
  void multiLegShipmentSplitsEquallyAndReversedExpenseLeavesCost() throws Exception {
    Setup s = setup("mlt");
    String a = vehicle(s.tenant(), "34ML01");
    String b = vehicle(s.tenant(), "34ML02");
    JsonNode shipment = shipment(s, "1000", START);
    String id = shipment.get("id").asText();
    assign(s.tenant(), shipment, Map.of("vehicleId", a, "driverId", driver(s.tenant(), "S1")))
        .andExpect(status().isOk());
    String leg2 =
        body(post(
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
                        END.plus(1, ChronoUnit.HOURS).toString()))
                .andExpect(status().isCreated()))
            .get("id")
            .asText();
    post(
            s.tenant(),
            "/api/v1/shipment/legs/" + leg2 + "/assign",
            Map.of("vehicleId", b, "driverId", driver(s.tenant(), "S2")))
        .andExpect(status().isOk());
    deliverAndInvoice(s, id);

    JsonNode expense =
        body(
            post(
                    s.tenant(),
                    "/api/v1/fleet/vehicles/" + a + "/expenses",
                    Map.of(
                        "kind", "FUEL",
                        "date", TODAY.toString(),
                        "branchId", s.branch(),
                        "money", Map.of("amount", "300", "currency", "TRY"),
                        "supplierAccountId", s.supplier(),
                        "odometerKm", "1000",
                        "liters", "10"))
                .andExpect(status().isCreated()));
    String expenseId = expense.get("id").asText();
    post(
            s.tenant(),
            "/api/v1/shipment/shipments/" + id + "/costs",
            Map.of("kind", "FUEL", "vehicleExpenseId", expenseId))
        .andExpect(status().isCreated());

    JsonNode byVehicle = profit(s, "VEHICLE");
    assertThat(byVehicle.get("rows")).hasSize(2);
    assertThat(byVehicle.get("rows").get(0).get("revenueTl").decimalValue())
        .isEqualByComparingTo("500");
    assertThat(byVehicle.get("rows").get(0).get("costTl").decimalValue())
        .isEqualByComparingTo("150");

    post(
            s.tenant(),
            "/api/v1/fleet/expenses/" + expenseId + "/reverse",
            Map.of("date", TODAY.toString()))
        .andExpect(status().isNoContent());
    assertThat(profit(s, "SHIPMENT").get("costTl").decimalValue()).isEqualByComparingTo("0");
  }

  @Test
  void kpiAndDriverReportCountOnTimeDeliveries() throws Exception {
    Setup s = setup("kpi");
    String truck = vehicle(s.tenant(), "34KP01");
    String other = vehicle(s.tenant(), "34KP02");
    String driver = driver(s.tenant(), "S1");
    Map<String, Object> capacity = new HashMap<>();
    capacity.put("plate", "34KP03");
    capacity.put("kind", "TRUCK");
    capacity.put("ownership", "OWNED");
    capacity.put("status", "ACTIVE");
    capacity.put("capacityTon", "10");
    String sized = created(post(s.tenant(), "/api/v1/fleet/vehicles", capacity));
    documents(s.tenant(), "VEHICLE", sized, List.of("INSPECTION", "TRAFFIC_INSURANCE"));

    // Zamanında: yük 5 ton, araç 10 ton.
    JsonNode onTime = shipment(s, "1000", START);
    assign(s.tenant(), onTime, Map.of("vehicleId", sized, "driverId", driver))
        .andExpect(status().isOk());
    deliver(s, onTime.get("id").asText(), END.minus(1, ChronoUnit.HOURS));
    // Geç.
    JsonNode late = shipment(s, "1000", START.plus(3, ChronoUnit.DAYS));
    assign(s.tenant(), late, Map.of("vehicleId", truck, "driverId", driver))
        .andExpect(status().isOk());
    deliver(s, late.get("id").asText(), END.plus(30, ChronoUnit.DAYS));
    // Bekleyen ve iptal.
    shipment(s, "1000", START);
    JsonNode cancelled = shipment(s, "1000", START);
    post(
            s.tenant(),
            "/api/v1/shipment/shipments/" + cancelled.get("id").asText() + "/status",
            Map.of("status", "CANCELLED"))
        .andExpect(status().isOk());
    assertThat(other).isNotNull();

    JsonNode kpi =
        body(
            send(
                s.tenant(),
                get(BASE + "/kpi").param("from", FROM.toString()).param("to", TO.toString())));
    assertThat(kpi.get("shipments").asLong()).isEqualTo(3);
    assertThat(kpi.get("cancelled").asLong()).isEqualTo(1);
    assertThat(kpi.get("delivered").asLong()).isEqualTo(2);
    assertThat(kpi.get("onTime").asLong()).isEqualTo(1);
    assertThat(kpi.get("onTimePercent").decimalValue()).isEqualByComparingTo("50");
    assertThat(kpi.get("averageFillPercent").decimalValue()).isEqualByComparingTo("50");

    JsonNode drivers =
        body(
            send(
                s.tenant(),
                get(BASE + "/drivers").param("from", FROM.toString()).param("to", TO.toString())));
    assertThat(drivers).hasSize(1);
    assertThat(drivers.get(0).get("delivered").asLong()).isEqualTo(2);
    assertThat(drivers.get(0).get("onTimePercent").decimalValue()).isEqualByComparingTo("50");
  }

  @Test
  void branchFilterAndPagingWorkAndPeriodIsValidated() throws Exception {
    Setup s = setup("flt");
    String other =
        created(
            post(
                s.tenant(),
                "/api/v1/organization/branches",
                Map.of("code", "S" + System.nanoTime(), "name", "Diğer")));
    closedShipment(s, "100", vehicle(s.tenant(), "34FT01"), driver(s.tenant(), "S1"), null, START);
    closedShipment(
        s,
        "200",
        vehicle(s.tenant(), "34FT02"),
        driver(s.tenant(), "S2"),
        null,
        START.plus(3, ChronoUnit.DAYS));

    JsonNode empty =
        body(
            send(
                s.tenant(),
                get(BASE + "/profitability")
                    .param("group", "SHIPMENT")
                    .param("from", FROM.toString())
                    .param("to", TO.toString())
                    .param("branchId", other)));
    assertThat(empty.get("rows")).isEmpty();
    assertThat(empty.get("revenueTl").decimalValue()).isEqualByComparingTo("0");

    JsonNode page =
        body(
            send(
                s.tenant(),
                get(BASE + "/profitability")
                    .param("group", "SHIPMENT")
                    .param("from", FROM.toString())
                    .param("to", TO.toString())
                    .param("branchId", s.branch())
                    .param("size", "1")));
    assertThat(page.get("rows")).hasSize(1);
    assertThat(page.get("totalElements").asLong()).isEqualTo(2);
    // Toplam, sayfadaki satır değil tüm dönemdir.
    assertThat(page.get("revenueTl").decimalValue()).isEqualByComparingTo("300");
    assertThat(page.get("rows").get(0).get("revenueTl").decimalValue()).isEqualByComparingTo("200");

    send(s.tenant(), get(BASE + "/kpi").param("from", TO.toString()).param("to", FROM.toString()))
        .andExpect(status().isBadRequest());
  }

  @Test
  void forecastUsesOpenInvoicesAndPlansAndPositionSplitsCurrencies() throws Exception {
    Setup s = setup("frc");
    closedShipment(
        s, "1000", vehicle(s.tenant(), "34FC01"), driver(s.tenant(), "S1"), "400", START);
    String fund =
        created(
            post(
                s.tenant(),
                "/api/v1/finance/funds",
                Map.of(
                    "code",
                    "K1",
                    "name",
                    "Kasa",
                    "kind",
                    "CASH",
                    "currency",
                    "TRY",
                    "branchId",
                    s.branch())));
    post(
            s.tenant(),
            "/api/v1/finance/funds/" + fund + "/transactions",
            Map.of(
                "direction", "IN",
                "money", Map.of("amount", "700", "currency", "TRY"),
                "date", TODAY.toString()))
        .andExpect(status().isCreated());

    JsonNode position = body(send(s.tenant(), get(BASE + "/position")));
    assertThat(position).hasSize(1);
    assertThat(position.get(0).get("currency").asText()).isEqualTo("TRY");
    assertThat(position.get(0).get("cash").decimalValue()).isEqualByComparingTo("700");
    assertThat(position.get(0).get("receivable").decimalValue()).isEqualByComparingTo("1000");
    assertThat(position.get(0).get("payable").decimalValue()).isEqualByComparingTo("400");
    assertThat(position.get(0).get("net").decimalValue()).isEqualByComparingTo("1300");

    JsonNode forecast = body(send(s.tenant(), get(BASE + "/forecast")));
    BigDecimal inflow = BigDecimal.ZERO;
    BigDecimal outflow = BigDecimal.ZERO;
    for (JsonNode row : forecast) {
      inflow = inflow.add(row.get("inflow").decimalValue());
      outflow = outflow.add(row.get("outflow").decimalValue());
    }
    // Fatura ve gider vadesi 20 gün sonra; ufuk içindedir.
    assertThat(inflow).isEqualByComparingTo("1000");
    assertThat(outflow).isEqualByComparingTo("400");
  }

  @Test
  void dashboardShowsOnlyPermittedSectionsAndReportsRespectPermissions() throws Exception {
    Setup s = setup("rol");
    JsonNode owner = body(send(s.tenant(), get(BASE + "/dashboard")));
    assertThat(owner.get("operations").isNull()).isFalse();
    assertThat(owner.get("finance").isNull()).isFalse();
    assertThat(owner.get("fleet").isNull()).isFalse();

    String ops = inviteAndLogin(s.tenant(), "ops@" + s.tenant() + ".test", "OPERATIONS");
    JsonNode operations =
        body(mvc.perform(get(BASE + "/dashboard").with(tenant(s.tenant())).with(bearer(ops))));
    assertThat(operations.get("operations").isNull()).isFalse();
    assertThat(operations.get("finance").isNull()).isTrue();
    assertThat(operations.get("customs").isNull()).isTrue();

    mvc.perform(get(BASE + "/position").with(tenant(s.tenant())).with(bearer(ops)))
        .andExpect(status().isForbidden());
    mvc.perform(
            get(BASE + "/export")
                .param("report", "POSITION")
                .param("format", "XLSX")
                .with(tenant(s.tenant()))
                .with(bearer(ops)))
        .andExpect(status().isForbidden());

    String driverUser = inviteAndLogin(s.tenant(), "src@" + s.tenant() + ".test", "DRIVER");
    JsonNode none =
        body(
            mvc.perform(
                get(BASE + "/dashboard").with(tenant(s.tenant())).with(bearer(driverUser))));
    assertThat(none.get("operations").isNull()).isTrue();
    assertThat(none.get("finance").isNull()).isTrue();
    mvc.perform(
            get(BASE + "/kpi")
                .param("from", FROM.toString())
                .param("to", TO.toString())
                .with(tenant(s.tenant()))
                .with(bearer(driverUser)))
        .andExpect(status().isForbidden());
  }

  @Test
  void exportsExcelAndPdfWithFiguresAndKeepsFormulaTextInert() throws Exception {
    Setup s = setup("exp");
    String evil =
        created(
            post(
                s.tenant(),
                "/api/v1/finance/accounts",
                Map.of("code", "M9", "name", "=HYPERLINK(\"x\")", "type", "CUSTOMER")));
    Setup other = new Setup(s.tenant(), s.branch(), evil, s.supplier());
    closedShipment(
        other, "1500", vehicle(s.tenant(), "34EX01"), driver(s.tenant(), "S1"), null, START);

    byte[] xlsx = export(s, "XLSX");
    try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(xlsx))) {
      var sheet = workbook.getSheetAt(0);
      assertThat(sheet.getRow(0).getCell(0).getStringCellValue()).isEqualTo("Kârlılık");
      assertThat(sheet.getRow(3).getCell(2).getStringCellValue()).isEqualTo("Gelir (TL)");
      assertThat(sheet.getRow(4).getCell(0).getCellType())
          .isEqualTo(org.apache.poi.ss.usermodel.CellType.STRING);
      assertThat(sheet.getRow(4).getCell(0).getStringCellValue()).contains("=HYPERLINK");
      assertThat(sheet.getRow(4).getCell(2).getNumericCellValue()).isEqualTo(1500d);
    }

    byte[] pdf = export(s, "PDF");
    try (PdfReader reader = new PdfReader(pdf)) {
      assertThat(new PdfTextExtractor(reader).getTextFromPage(1))
          .contains("Kârlılık")
          .contains("1.500,00");
    }
  }

  @Test
  void suruculerPozisyonVeOngoruDisaAktarilirTahsilatPerformansiDoner() throws Exception {
    Setup s = setup("expx");
    for (String report : List.of("DRIVERS", "POSITION", "FORECAST")) {
      for (String format : List.of("XLSX", "PDF")) {
        var response =
            send(
                    s.tenant(),
                    get(BASE + "/export")
                        .param("report", report)
                        .param("format", format)
                        .param("from", FROM.toString())
                        .param("to", TO.toString()))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse();
        byte[] content = response.getContentAsByteArray();
        assertThat(response.getHeader("Content-Disposition"))
            .as(report + " " + format)
            .contains("attachment");
        // XLSX bir zip arşividir ("PK"), PDF "%PDF" ile başlar.
        String magic = new String(content, 0, 4, java.nio.charset.StandardCharsets.ISO_8859_1);
        assertThat(magic)
            .as(report + " " + format)
            .startsWith(format.equals("PDF") ? "%PDF" : "PK");
      }
    }
    send(
            s.tenant(),
            get(BASE + "/settlement-performance")
                .param("from", FROM.toString())
                .param("to", TO.toString()))
        .andExpect(status().isOk());
  }

  // Yardımcılar

  private byte[] export(Setup s, String format) throws Exception {
    return send(
            s.tenant(),
            get(BASE + "/export")
                .param("report", "PROFITABILITY")
                .param("format", format)
                .param("group", "SHIPMENT")
                .param("from", FROM.toString())
                .param("to", TO.toString()))
        .andExpect(status().isOk())
        .andReturn()
        .getResponse()
        .getContentAsByteArray();
  }

  private JsonNode profit(Setup s, String group) throws Exception {
    return body(
        send(
                s.tenant(),
                get(BASE + "/profitability")
                    .param("group", group)
                    .param("from", FROM.toString())
                    .param("to", TO.toString()))
            .andExpect(status().isOk()));
  }

  private void closedShipment(
      Setup s, String net, String truck, String driver, String cost, Instant start)
      throws Exception {
    JsonNode shipment = shipment(s, net, start);
    String id = shipment.get("id").asText();
    assign(s.tenant(), shipment, Map.of("vehicleId", truck, "driverId", driver))
        .andExpect(status().isOk());
    if (cost != null) {
      post(
              s.tenant(),
              "/api/v1/shipment/shipments/" + id + "/costs",
              Map.of(
                  "kind", "FUEL",
                  "accountId", s.supplier(),
                  "money", Map.of("amount", cost, "currency", "TRY"),
                  "date", TODAY.toString()))
          .andExpect(status().isCreated());
    }
    deliverAndInvoice(s, id);
    post(
            s.tenant(),
            "/api/v1/shipment/shipments/" + id + "/close",
            Map.of("date", TODAY.toString(), "dueDate", tenantToday().plusDays(20).toString()))
        .andExpect(status().isOk());
  }

  private void deliver(Setup s, String id, Instant at) throws Exception {
    for (String next : List.of("PLANNED", "LOADED", "IN_TRANSIT")) {
      post(s.tenant(), "/api/v1/shipment/shipments/" + id + "/status", Map.of("status", next))
          .andExpect(status().isOk());
    }
    post(
            s.tenant(),
            "/api/v1/shipment/shipments/" + id + "/pod",
            Map.of("recipientName", "Alıcı", "deliveredAt", at.toString()))
        .andExpect(status().isOk());
    post(s.tenant(), "/api/v1/shipment/shipments/" + id + "/status", Map.of("status", "DELIVERED"))
        .andExpect(status().isOk());
  }

  private void deliverAndInvoice(Setup s, String id) throws Exception {
    deliver(s, id, END);
    post(
            s.tenant(),
            "/api/v1/shipment/shipments/" + id + "/invoice",
            Map.of(
                "invoiceDate", TODAY.toString(),
                "dueDate", tenantToday().plusDays(20).toString()))
        .andExpect(status().isCreated());
  }

  private Setup setup(String prefix) throws Exception {
    String t = "rpr-" + prefix;
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

  private JsonNode shipment(Setup s, String net, Instant start) throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("accountId", s.customer());
    body.put("branchId", s.branch());
    body.put("shipperName", "Gönderici");
    body.put("consigneeName", "Alıcı");
    body.put("origin", "İstanbul");
    body.put("destination", "Ankara");
    body.put("plannedPickup", start.toString());
    body.put("plannedDelivery", start.plus(2, ChronoUnit.DAYS).toString());
    body.put("currency", "TRY");
    body.put("manualNet", net);
    body.put("cargo", List.of(Map.of("description", "Yük", "weightKg", "5000")));
    return body(
        post(s.tenant(), "/api/v1/shipment/shipments", body).andExpect(status().isCreated()));
  }

  private ResultActions assign(String t, JsonNode shipment, Map<String, Object> body)
      throws Exception {
    return post(
        t,
        "/api/v1/shipment/legs/" + shipment.get("legs").get(0).get("id").asText() + "/assign",
        body);
  }

  private String vehicle(String t, String plate) throws Exception {
    String id =
        created(
            post(
                t,
                "/api/v1/fleet/vehicles",
                Map.of("plate", plate, "kind", "TRUCK", "ownership", "OWNED", "status", "ACTIVE")));
    documents(t, "VEHICLE", id, List.of("INSPECTION", "TRAFFIC_INSURANCE"));
    return id;
  }

  private String driver(String t, String code) throws Exception {
    String id =
        created(
            post(
                t,
                "/api/v1/fleet/drivers",
                Map.of("code", code, "fullName", "Sürücü " + code, "status", "ACTIVE")));
    documents(t, "DRIVER", id, List.of("LICENSE", "SRC", "PSYCHOTECHNIC"));
    return id;
  }

  private void documents(String t, String subject, String id, List<String> types) throws Exception {
    for (String type : types) {
      post(
              t,
              "/api/v1/fleet/" + subject + "/" + id + "/documents",
              Map.of("docType", type, "expiresOn", FAR.toString()))
          .andExpect(status().isCreated());
    }
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
