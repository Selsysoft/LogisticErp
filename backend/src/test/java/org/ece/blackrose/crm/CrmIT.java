package org.ece.blackrose.crm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.parser.PdfTextExtractor;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.ece.blackrose.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

class CrmIT extends AbstractIntegrationTest {

  private static final LocalDate TODAY = tenantToday();
  private static final String DATE = TODAY.toString();
  private static final String FUTURE = TODAY.plusDays(30).toString();

  /** Faz 3 uçtan uca kabul senaryosu: aday → fırsat → teklif → sözleşme → otomatik fiyat. */
  @Test
  void leadToContractFunnelLogsStagesAndEnablesContractPricing() throws Exception {
    String t = tenantCode("e2e");
    String lead = customer(t, "A1", "LEAD");
    String tariff = tariff(t, "T1", null, "10", null);
    routeLine(t, tariff, "İstanbul", "Ankara", null, "TRIP", "10000");

    String opportunity =
        created(
            post(
                t,
                "/api/v1/crm/opportunities",
                Map.of("accountId", lead, "title", "Yıllık taşıma", "money", money("500000"))));
    String quote = quote(t, lead, opportunity, tariff, null);
    addLine(t, quote, line("İstanbul", "Ankara")).andExpect(status().isCreated());

    post(t, "/api/v1/crm/quotes/" + quote + "/send", null)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("SENT"));
    assertThat(stageOf(t, opportunity)).isEqualTo("QUOTE");

    JsonNode contract =
        body(
            post(
                    t,
                    "/api/v1/crm/quotes/" + quote + "/accept",
                    Map.of("startDate", DATE, "endDate", TODAY.plusYears(1).toString()))
                .andExpect(status().isOk()));
    assertThat(contract.get("quoteId").asText()).isEqualTo(quote);
    assertThat(contract.get("status").asText()).isEqualTo("ACTIVE");
    assertThat(stageOf(t, opportunity)).isEqualTo("WON");
    assertThat(body(send(t, get("/api/v1/crm/customers/" + lead))).get("type").asText())
        .isEqualTo("CUSTOMER");

    List<String> history = new ArrayList<>();
    body(send(t, get("/api/v1/crm/opportunities/" + opportunity + "/history")))
        .forEach(row -> history.add(row.get("subject").asText()));
    assertThat(history)
        .containsExactly(
            "LEAD",
            "LEAD → QUALIFIED",
            "QUALIFIED → QUOTE",
            "QUOTE → WON · Teklif " + number(t, quote));

    JsonNode price = calculate(t, priceRequest(lead, "İstanbul", "Ankara", null));
    assertThat(price.get("source").asText()).isEqualTo("CONTRACT");
    assertThat(price.get("contractId").asText()).isEqualTo(contract.get("id").asText());
    assertThat(price.get("net").decimalValue()).isEqualByComparingTo("11000");
  }

  @Test
  void pricingIsDeterministicAndExplainsEveryComponent() throws Exception {
    String t = tenantCode("det");
    String account = customer(t, "M1", "CUSTOMER");
    String tax = taxRate(t, "KDV20", "20", 2, 10);
    Map<String, Object> tariffBody = tariffBody("T1", null, "10", tax);
    tariffBody.put("waitingHourlyFee", "100");
    tariffBody.put("extraStopFee", "250");
    tariffBody.put("adrPercent", "5");
    tariffBody.put("insurancePercent", "1");
    String tariff = created(post(t, "/api/v1/crm/tariffs", tariffBody));
    routeLine(t, tariff, "istanbul", "ANKARA", null, "TON", "500");

    Map<String, Object> request = priceRequest(account, "İSTANBUL", "ankara", null);
    request.put("weightTon", "20");
    request.put("waitingHours", "2");
    request.put("extraStops", 1);
    request.put("adr", true);
    request.put("tollAmount", "300");

    JsonNode first = calculate(t, request);
    JsonNode second = calculate(t, request);
    assertThat(second).isEqualTo(first);

    Map<String, BigDecimal> components = new HashMap<>();
    first
        .get("components")
        .forEach(c -> components.put(c.get("code").asText(), c.get("amount").decimalValue()));
    assertThat(components.get("BASE_ROUTE")).isEqualByComparingTo("10000");
    assertThat(components.get("FUEL_SURCHARGE")).isEqualByComparingTo("1000");
    assertThat(components.get("WAITING")).isEqualByComparingTo("200");
    assertThat(components.get("EXTRA_STOP")).isEqualByComparingTo("250");
    assertThat(components.get("ADR")).isEqualByComparingTo("500");
    assertThat(components.get("INSURANCE")).isEqualByComparingTo("100");
    assertThat(components.get("TOLL")).isEqualByComparingTo("300");

    // Net 12350, KDV %20 = 2470, tevkifat 2/10 = 494, ödenecek 14326.
    assertThat(first.get("net").decimalValue()).isEqualByComparingTo("12350");
    assertThat(first.get("vat").decimalValue()).isEqualByComparingTo("2470");
    assertThat(first.get("withholding").decimalValue()).isEqualByComparingTo("494");
    assertThat(first.get("total").decimalValue()).isEqualByComparingTo("14326");
  }

  @Test
  void routeWinsOverDistanceAndVehicleSpecificWinsOverGeneric() throws Exception {
    String t = tenantCode("sel");
    String account = customer(t, "M1", "CUSTOMER");
    String tariff = tariff(t, "T1", null, null, null);
    routeLine(t, tariff, "Bursa", "İzmir", null, "TRIP", "1000");
    routeLine(t, tariff, "Bursa", "İzmir", "TIR", "TRIP", "2000");
    distanceLine(t, tariff, "KM", "10", "5000");

    assertThat(
            calculate(t, priceRequest(account, "Bursa", "İzmir", null)).get("net").decimalValue())
        .isEqualByComparingTo("1000");
    assertThat(
            calculate(t, priceRequest(account, "Bursa", "İzmir", "TIR")).get("net").decimalValue())
        .isEqualByComparingTo("2000");

    Map<String, Object> fallback = priceRequest(account, "Bursa", "Van", null);
    post(t, "/api/v1/crm/pricing/calculate", fallback)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("PRICE_INPUT_MISSING"));
    fallback.put("distanceKm", "300");
    JsonNode minimum = calculate(t, fallback);
    assertThat(minimum.get("net").decimalValue()).isEqualByComparingTo("5000");
    assertThat(minimum.get("components").get(0).get("basis").asText()).startsWith("MIN");
    fallback.put("distanceKm", "1000");
    assertThat(calculate(t, fallback).get("net").decimalValue()).isEqualByComparingTo("10000");
  }

  @Test
  void customerTariffBeatsGeneralAndContractOverridesFuel() throws Exception {
    String t = tenantCode("pri");
    String account = customer(t, "M1", "CUSTOMER");
    String other = customer(t, "M2", "CUSTOMER");
    String general = tariff(t, "GENEL", null, "10", null);
    routeLine(t, general, "A", "B", null, "TRIP", "1000");
    String own = tariff(t, "OZEL", account, "10", null);
    routeLine(t, own, "A", "B", null, "TRIP", "800");

    JsonNode forOther = calculate(t, priceRequest(other, "A", "B", null));
    assertThat(forOther.get("source").asText()).isEqualTo("GENERAL");
    assertThat(forOther.get("net").decimalValue()).isEqualByComparingTo("1100");
    JsonNode forOwn = calculate(t, priceRequest(account, "A", "B", null));
    assertThat(forOwn.get("source").asText()).isEqualTo("CUSTOMER");
    assertThat(forOwn.get("net").decimalValue()).isEqualByComparingTo("880");

    post(
            t,
            "/api/v1/crm/contracts",
            Map.of(
                "accountId", account,
                "tariffId", own,
                "startDate", DATE,
                "endDate", FUTURE,
                "fuelSurchargePercent", "25"))
        .andExpect(status().isCreated());
    JsonNode underContract = calculate(t, priceRequest(account, "A", "B", null));
    assertThat(underContract.get("source").asText()).isEqualTo("CONTRACT");
    assertThat(underContract.get("net").decimalValue()).isEqualByComparingTo("1000");
  }

  @Test
  void missingTariffAndLineAreExplained() throws Exception {
    String t = tenantCode("mis");
    String account = customer(t, "M1", "CUSTOMER");
    post(t, "/api/v1/crm/pricing/calculate", priceRequest(account, "A", "B", null))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("NO_TARIFF"));

    tariff(t, "T1", null, null, null);
    post(t, "/api/v1/crm/pricing/calculate", priceRequest(account, "A", "B", null))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("NO_TARIFF_LINE"));
  }

  @Test
  void overlappingActiveContractsAreRejectedUntilClosed() throws Exception {
    String t = tenantCode("ctr");
    String account = customer(t, "M1", "CUSTOMER");
    Map<String, Object> contract =
        Map.of("accountId", account, "startDate", DATE, "endDate", FUTURE);
    String id = created(post(t, "/api/v1/crm/contracts", contract));

    post(t, "/api/v1/crm/contracts", contract)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONTRACT_OVERLAP"));

    post(t, "/api/v1/crm/contracts/" + id + "/status", Map.of("status", "ENDED"))
        .andExpect(status().isOk());
    post(t, "/api/v1/crm/contracts", contract).andExpect(status().isCreated());
  }

  @Test
  void sentQuoteIsImmutableAndNewVersionKeepsPrices() throws Exception {
    String t = tenantCode("ver");
    String account = customer(t, "M1", "CUSTOMER");
    String tariff = tariff(t, "T1", null, null, null);
    routeLine(t, tariff, "A", "B", null, "TRIP", "1000");
    String quote = quote(t, account, null, tariff, null);

    post(t, "/api/v1/crm/quotes/" + quote + "/send", null)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("QUOTE_EMPTY"));
    addLine(t, quote, line("A", "B")).andExpect(status().isCreated());
    post(t, "/api/v1/crm/quotes/" + quote + "/send", null).andExpect(status().isOk());

    addLine(t, quote, line("A", "B"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("QUOTE_LOCKED"));

    JsonNode next =
        body(
            post(t, "/api/v1/crm/quotes/" + quote + "/new-version", null)
                .andExpect(status().isCreated()));
    assertThat(next.get("version").asInt()).isEqualTo(2);
    assertThat(next.get("status").asText()).isEqualTo("DRAFT");
    assertThat(new BigDecimal(next.get("total").get("amount").asText()))
        .isEqualByComparingTo("1000");
    assertThat(next.get("number").asText()).isEqualTo(number(t, quote));

    JsonNode original = body(send(t, get("/api/v1/crm/quotes/" + quote)));
    assertThat(original.get("status").asText()).isEqualTo("SUPERSEDED");
    assertThat(original.get("lines").size()).isEqualTo(1);
    assertThat(body(send(t, get("/api/v1/crm/quotes/" + quote + "/versions"))).size()).isEqualTo(2);

    String nextId = next.get("id").asText();
    addLine(t, nextId, manualLine("500")).andExpect(status().isCreated());
    assertThat(
            new BigDecimal(
                body(send(t, get("/api/v1/crm/quotes/" + nextId)))
                    .get("total")
                    .get("amount")
                    .asText()))
        .isEqualByComparingTo("1500");
  }

  @Test
  void expiredQuoteCannotBeAccepted() throws Exception {
    String t = tenantCode("exp");
    String account = customer(t, "M1", "CUSTOMER");
    String quote =
        created(
            post(
                t,
                "/api/v1/crm/quotes",
                Map.of(
                    "accountId",
                    account,
                    "currency",
                    "TRY",
                    "validUntil",
                    TODAY.minusDays(1).toString())));
    addLine(t, quote, manualLine("100")).andExpect(status().isCreated());
    post(t, "/api/v1/crm/quotes/" + quote + "/send", null).andExpect(status().isOk());

    post(t, "/api/v1/crm/quotes/" + quote + "/accept", Map.of("startDate", DATE, "endDate", FUTURE))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("QUOTE_EXPIRED"));
  }

  @Test
  void quotePdfIsReadableAndSentVersionStaysFrozen() throws Exception {
    String t = tenantCode("pdf");
    String account = customer(t, "M1", "CUSTOMER");
    String tax = taxRate(t, "KDV", "20", 0, 1);
    String quote = quote(t, account, null, null, tax);
    Map<String, Object> pdfLine = manualLine("1000");
    pdfLine.put("origin", "İstanbul");
    pdfLine.put("destination", "Şanlıurfa");
    addLine(t, quote, pdfLine).andExpect(status().isCreated());

    String draftText = pdfText(t, quote);
    assertThat(draftText).contains("İstanbul").contains("Şanlıurfa").contains("1.200,00");

    post(t, "/api/v1/crm/quotes/" + quote + "/send", null).andExpect(status().isOk());
    String sentText = pdfText(t, quote);
    assertThat(sentText).contains("Şanlıurfa").contains("Sürüm 1");
  }

  @Test
  void invalidStageChangesAreRejected() throws Exception {
    String t = tenantCode("stg");
    String account = customer(t, "M1", "LEAD");
    String opportunity =
        created(
            post(
                t,
                "/api/v1/crm/opportunities",
                Map.of("accountId", account, "title", "İş", "money", money("10"))));

    post(t, "/api/v1/crm/opportunities/" + opportunity + "/stage", Map.of("stage", "WON"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("OPPORTUNITY_INVALID_STAGE"));
    post(
            t,
            "/api/v1/crm/opportunities/" + opportunity + "/stage",
            Map.of("stage", "LOST", "note", "Fiyat yüksek"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.lostReason").value("Fiyat yüksek"));
    post(t, "/api/v1/crm/opportunities/" + opportunity + "/stage", Map.of("stage", "QUALIFIED"))
        .andExpect(status().isConflict());
  }

  @Test
  void dashboardShowsFunnelWinRateOwnersAndUpcomingActivities() throws Exception {
    String t = tenantCode("dash");
    String account = customer(t, "M1", "CUSTOMER");
    String won = opportunity(t, account, "100");
    move(t, won, "QUALIFIED");
    move(t, won, "QUOTE");
    move(t, won, "WON");
    String lost = opportunity(t, account, "200");
    move(t, lost, "LOST");
    String lost2 = opportunity(t, account, "300");
    move(t, lost2, "LOST");
    opportunity(t, account, "400");
    post(
            t,
            "/api/v1/crm/activities",
            Map.of(
                "accountId",
                account,
                "type",
                "CALL",
                "subject",
                "Ara",
                "dueDate",
                TODAY.plusDays(2).toString()))
        .andExpect(status().isCreated());
    String done =
        created(
            post(
                t,
                "/api/v1/crm/activities",
                Map.of("accountId", account, "type", "TASK", "subject", "Bitti", "dueDate", DATE)));
    post(t, "/api/v1/crm/activities/" + done + "/complete", null).andExpect(status().isOk());

    JsonNode dashboard = body(send(t, get("/api/v1/crm/dashboard").param("today", DATE)));

    assertThat(dashboard.get("winRatePercent").decimalValue()).isEqualByComparingTo("33.33");
    assertThat(dashboard.get("funnel").size()).isEqualTo(3);
    JsonNode owner = dashboard.get("owners").get(0);
    assertThat(owner.get("won").asLong()).isEqualTo(1);
    assertThat(owner.get("lost").asLong()).isEqualTo(2);
    assertThat(owner.get("open").asLong()).isEqualTo(1);
    assertThat(dashboard.get("upcomingActivities").size()).isEqualTo(1);
    assertThat(dashboard.get("upcomingActivities").get(0).get("subject").asText()).isEqualTo("Ara");
  }

  @Test
  void customerWithContactsTagsAndSegment() throws Exception {
    String t = tenantCode("cus");
    String id =
        created(
            post(
                t,
                "/api/v1/crm/customers",
                Map.of(
                    "code",
                    "M1",
                    "name",
                    "Firma",
                    "type",
                    "CUSTOMER",
                    "segment",
                    "Kurumsal",
                    "tags",
                    List.of("ihracat", "soğuk"))));
    String contact =
        created(
            post(
                t,
                "/api/v1/crm/customers/" + id + "/contacts",
                Map.of("fullName", "Deniz Kaya", "email", "deniz@firma.test")));

    // Kişi düzenlenir; sefer bildirimi için e-posta gerekir.
    send(
            t,
            org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(
                    "/api/v1/crm/contacts/" + contact)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of(
                            "fullName", "Deniz Kaya",
                            "title", "Lojistik Müdürü",
                            "email", "deniz@firma.test",
                            "notifyDepartures", true,
                            "notifyDeliveries", true))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.title").value("Lojistik Müdürü"))
        .andExpect(jsonPath("$.notifyDepartures").value(true));
    send(
            t,
            org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(
                    "/api/v1/crm/contacts/" + contact)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of("fullName", "Deniz Kaya", "notifyDeliveries", true))))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("CONTACT_EMAIL_REQUIRED"));
    send(
            t,
            org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(
                    "/api/v1/crm/contacts/" + java.util.UUID.randomUUID())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("fullName", "Yok"))))
        .andExpect(status().isNotFound());

    JsonNode customer = body(send(t, get("/api/v1/crm/customers/" + id)));
    assertThat(customer.get("segment").asText()).isEqualTo("Kurumsal");
    assertThat(customer.get("tags").size()).isEqualTo(2);
    assertThat(body(send(t, get("/api/v1/crm/customers/" + id + "/contacts"))).size()).isEqualTo(1);

    send(t, delete("/api/v1/crm/contacts/" + contact)).andExpect(status().isNoContent());
    assertThat(body(send(t, get("/api/v1/crm/customers/" + id + "/contacts"))).size()).isZero();
    post(
            t,
            "/api/v1/crm/customers/" + id + "/contacts",
            Map.of("fullName", "Hatalı", "email", "gecersiz"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void fileUploadDownloadAndValidation() throws Exception {
    String t = tenantCode("file");
    String account = customer(t, "M1", "CUSTOMER");
    byte[] content = "sözleşme içeriği".getBytes(java.nio.charset.StandardCharsets.UTF_8);

    JsonNode uploaded =
        body(
            upload(t, "ACCOUNT", account, "../../sözleşme.pdf", content)
                .andExpect(status().isCreated()));
    assertThat(uploaded.get("fileName").asText()).isEqualTo("sözleşme.pdf");
    assertThat(uploaded.get("contentType").asText()).isEqualTo("application/pdf");

    String id = uploaded.get("id").asText();
    byte[] downloaded =
        send(t, get("/api/v1/files/" + id + "/content"))
            .andExpect(status().isOk())
            .andExpect(
                header()
                    .string("Content-Disposition", org.hamcrest.Matchers.startsWith("attachment")))
            .andReturn()
            .getResponse()
            .getContentAsByteArray();
    assertThat(downloaded).isEqualTo(content);
    assertThat(
            body(send(
                    t,
                    get("/api/v1/files").param("ownerType", "ACCOUNT").param("ownerId", account)))
                .size())
        .isEqualTo(1);

    upload(t, "ACCOUNT", account, "zararli.exe", content)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("FILE_TYPE_NOT_ALLOWED"));
    upload(t, "ACCOUNT", account, "bos.pdf", new byte[0])
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("FILE_EMPTY"));
    upload(t, "BILINMEYEN", account, "a.pdf", content)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("FILE_OWNER_INVALID"));
    upload(t, "ACCOUNT", java.util.UUID.randomUUID().toString(), "a.pdf", content)
        .andExpect(status().isNotFound());

    send(t, delete("/api/v1/files/" + id)).andExpect(status().isNoContent());
    send(t, get("/api/v1/files/" + id + "/content")).andExpect(status().isNotFound());
  }

  @Test
  void filesAreProtectedByPermissionAndTenant() throws Exception {
    String a = tenantCode("fia");
    String b = tenantCode("fib");
    String account = customer(a, "M1", "CUSTOMER");
    String id =
        body(upload(a, "ACCOUNT", account, "a.pdf", new byte[] {1, 2})
                .andExpect(status().isCreated()))
            .get("id")
            .asText();

    send(b, get("/api/v1/files/" + id + "/content")).andExpect(status().isNotFound());

    String finance = inviteAndLogin(a, "finans@" + a + ".test", "FINANCE");
    mvc.perform(get("/api/v1/files/" + id + "/content").with(tenant(a)).with(bearer(finance)))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    mvc.perform(get("/api/v1/crm/customers").with(tenant(a)).with(bearer(finance)))
        .andExpect(status().isForbidden());
  }

  @Test
  void salesRoleReachesCrmAndCurrenciesButNotFinanceData() throws Exception {
    String t = tenantCode("sls");
    String sales = inviteAndLogin(t, "satis@" + t + ".test", "SALES");

    mvc.perform(get("/api/v1/crm/customers").with(tenant(t)).with(bearer(sales)))
        .andExpect(status().isOk());
    mvc.perform(get("/api/v1/finance/currencies").with(tenant(t)).with(bearer(sales)))
        .andExpect(status().isOk());
    mvc.perform(get("/api/v1/finance/accounts").with(tenant(t)).with(bearer(sales)))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/v1/auth/me").with(tenant(t)).with(bearer(sales)))
        .andExpect(jsonPath("$.landingPath").value("/crm"));
  }

  // Yardımcılar

  private String tenantCode(String prefix) throws Exception {
    String code = "crm-" + prefix;
    createTenant(code);
    return code;
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

  private static Map<String, Object> money(String amount) {
    return Map.of("amount", amount, "currency", "TRY");
  }

  private String customer(String t, String code, String type) throws Exception {
    return created(
        post(
            t,
            "/api/v1/crm/customers",
            Map.of("code", code, "name", code + " A.Ş.", "type", type)));
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

  private Map<String, Object> tariffBody(String code, String account, String fuel, String tax) {
    Map<String, Object> body = new HashMap<>();
    body.put("code", code);
    body.put("name", code);
    body.put("currency", "TRY");
    body.put("validFrom", TODAY.minusDays(10).toString());
    body.put("active", true);
    body.put("accountId", account);
    body.put("fuelSurchargePercent", fuel);
    body.put("taxRateId", tax);
    return body;
  }

  private String tariff(String t, String code, String account, String fuel, String tax)
      throws Exception {
    return created(post(t, "/api/v1/crm/tariffs", tariffBody(code, account, fuel, tax)));
  }

  private void routeLine(
      String t,
      String tariff,
      String origin,
      String destination,
      String vehicle,
      String unit,
      String price)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("kind", "ROUTE");
    body.put("origin", origin);
    body.put("destination", destination);
    body.put("vehicleType", vehicle);
    body.put("unit", unit);
    body.put("unitPrice", price);
    post(t, "/api/v1/crm/tariffs/" + tariff + "/lines", body).andExpect(status().isCreated());
  }

  private void distanceLine(String t, String tariff, String unit, String price, String minimum)
      throws Exception {
    post(
            t,
            "/api/v1/crm/tariffs/" + tariff + "/lines",
            Map.of("kind", "DISTANCE", "unit", unit, "unitPrice", price, "minAmount", minimum))
        .andExpect(status().isCreated());
  }

  private Map<String, Object> priceRequest(
      String account, String origin, String destination, String vehicle) {
    Map<String, Object> body = new HashMap<>();
    body.put("accountId", account);
    body.put("date", DATE);
    body.put("origin", origin);
    body.put("destination", destination);
    body.put("vehicleType", vehicle);
    return body;
  }

  private JsonNode calculate(String t, Map<String, Object> request) throws Exception {
    return body(post(t, "/api/v1/crm/pricing/calculate", request).andExpect(status().isOk()));
  }

  private String quote(String t, String account, String opportunity, String tariff, String tax)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("accountId", account);
    body.put("opportunityId", opportunity);
    body.put("tariffId", tariff);
    body.put("taxRateId", tax);
    body.put("currency", "TRY");
    body.put("validUntil", FUTURE);
    return created(post(t, "/api/v1/crm/quotes", body));
  }

  private static Map<String, Object> line(String origin, String destination) {
    Map<String, Object> body = new HashMap<>();
    body.put("origin", origin);
    body.put("destination", destination);
    return body;
  }

  private static Map<String, Object> manualLine(String net) {
    Map<String, Object> body = line("X", "Y");
    body.put("manualNet", net);
    return body;
  }

  private ResultActions addLine(String t, String quote, Map<String, Object> body) throws Exception {
    return post(t, "/api/v1/crm/quotes/" + quote + "/lines", body);
  }

  private String number(String t, String quote) throws Exception {
    return body(send(t, get("/api/v1/crm/quotes/" + quote))).get("number").asText();
  }

  private String opportunity(String t, String account, String amount) throws Exception {
    return created(
        post(
            t,
            "/api/v1/crm/opportunities",
            Map.of("accountId", account, "title", "İş " + amount, "money", money(amount))));
  }

  private void move(String t, String opportunity, String stage) throws Exception {
    post(t, "/api/v1/crm/opportunities/" + opportunity + "/stage", Map.of("stage", stage))
        .andExpect(status().isOk());
  }

  private String stageOf(String t, String opportunity) throws Exception {
    for (JsonNode row : body(send(t, get("/api/v1/crm/opportunities?size=100"))).get("content")) {
      if (opportunity.equals(row.get("id").asText())) {
        return row.get("stage").asText();
      }
    }
    throw new AssertionError("Fırsat yok");
  }

  private String pdfText(String t, String quote) throws Exception {
    byte[] pdf =
        send(t, get("/api/v1/crm/quotes/" + quote + "/pdf"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsByteArray();
    try (PdfReader reader = new PdfReader(pdf)) {
      return new PdfTextExtractor(reader).getTextFromPage(1);
    }
  }

  private ResultActions upload(
      String t, String ownerType, String ownerId, String name, byte[] content) throws Exception {
    return send(
        t,
        multipart("/api/v1/files")
            .file(new MockMultipartFile("file", name, "application/octet-stream", content))
            .param("ownerType", ownerType)
            .param("ownerId", ownerId));
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
