package org.ece.blackrose.warehouse;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.parser.PdfTextExtractor;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.ece.blackrose.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

class WarehouseIT extends AbstractIntegrationTest {

  private static final LocalDate TODAY = LocalDate.now().minusDays(1);
  private static final String BASE = "/api/v1/warehouse";

  private record Setup(
      String tenant, String branch, String customer, String warehouse, String bin) {}

  @Test
  void receiptAndIssueChangeStockByLotAndInsufficientStockIsRejected() throws Exception {
    Setup s = setup("lot", false);
    String item = item(s, "SKU1", "1");
    receipt(s, item, s.bin(), "L1", TODAY, "100").andExpect(status().isCreated());
    receipt(s, item, s.bin(), "L2", null, "30").andExpect(status().isCreated());

    JsonNode rows = balances(s);
    assertThat(rows).hasSize(2);
    assertThat(quantityOf(rows, "L1")).isEqualByComparingTo("100");
    assertThat(quantityOf(rows, "L2")).isEqualByComparingTo("30");

    String l1 = balanceId(rows, "L1");
    issue(s, l1, "40").andExpect(status().isCreated());
    assertThat(quantityOf(balances(s), "L1")).isEqualByComparingTo("60");

    issue(s, l1, "61")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INSUFFICIENT_STOCK"));
    assertThat(quantityOf(balances(s), "L1")).isEqualByComparingTo("60");

    // Aynı lotta farklı son kullanma tarihi kabul edilmez.
    receipt(s, item, s.bin(), "L1", TODAY.plusDays(30), "5")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("LOT_EXPIRY_MISMATCH"));

    JsonNode movements =
        body(send(s.tenant(), get(BASE + "/movements").param("size", "20"))).get("content");
    assertThat(movements).hasSize(3);
  }

  @Test
  void wrongMovementIsCorrectedByReversalOnlyOnce() throws Exception {
    Setup s = setup("rev", false);
    String item = item(s, "SKU1", "1");
    JsonNode receipt =
        body(receipt(s, item, s.bin(), "", null, "10").andExpect(status().isCreated()));
    String id = receipt.get("id").asText();

    post(s.tenant(), BASE + "/movements/" + id + "/reverse", Map.of("date", TODAY.toString()))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.type").value("REVERSAL"));
    assertThat(balances(s)).isEmpty();

    post(s.tenant(), BASE + "/movements/" + id + "/reverse", Map.of("date", TODAY.toString()))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("MOVEMENT_ALREADY_REVERSED"));
  }

  @Test
  void storageAndHandlingReachInvoiceAndCustomerAccountOnce() throws Exception {
    Setup s = setup("inv", false);
    String tax =
        created(
            post(
                s.tenant(),
                "/api/v1/crm/tax-rates",
                Map.of(
                    "code", "KDV",
                    "name", "KDV",
                    "vatPercent", "20",
                    "withholdingNumerator", 0,
                    "withholdingDenominator", 10)));
    String item = item(s, "SKU1", "10"); // 10 adet = 1 palet
    LocalDate start = TODAY.minusDays(9);
    receiptOn(s, item, "100", start).andExpect(status().isCreated());

    String contract = contract(s, start, TODAY, "5", tax);
    post(
            s.tenant(),
            BASE + "/contracts/" + contract + "/handling",
            Map.of("kind", "LABELING", "quantity", "3", "date", start.toString()))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("RATE_NOT_DEFINED"));
    post(
            s.tenant(),
            BASE + "/contracts/" + contract + "/rates",
            Map.of("kind", "LABELING", "unitPrice", "20"))
        .andExpect(status().isOk());
    post(
            s.tenant(),
            BASE + "/contracts/" + contract + "/handling",
            Map.of("kind", "LABELING", "quantity", "3", "date", start.toString()))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.amount").value(60.0));

    // 10 gün x 10 palet x 5 TL = 500; elleçleme 60; net 560; KDV 112; toplam 672.
    JsonNode preview =
        body(
            send(
                s.tenant(),
                get(BASE + "/contracts/" + contract + "/invoice-preview")
                    .param("from", start.toString())
                    .param("to", TODAY.toString())));
    assertThat(preview.get("storageQuantity").decimalValue()).isEqualByComparingTo("100");
    assertThat(amount(preview.get("storage"))).isEqualByComparingTo("500");
    assertThat(amount(preview.get("total"))).isEqualByComparingTo("672");
    assertThat(balance(s)).isEqualByComparingTo("0");

    JsonNode invoice = issueInvoice(s, contract, start, TODAY);
    assertThat(invoice.get("number").asText()).startsWith("DF-");
    assertThat(balance(s)).isEqualByComparingTo("672");

    post(s.tenant(), BASE + "/contracts/" + contract + "/invoices", invoiceBody(start, TODAY))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("PERIOD_ALREADY_INVOICED"));

    // Faturalanmış döneme hareket yazılamaz.
    receiptOn(s, item, "1", TODAY)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("PERIOD_INVOICED"));

    byte[] pdf =
        send(s.tenant(), get(BASE + "/invoices/" + invoice.get("id").asText() + "/pdf"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsByteArray();
    try (PdfReader reader = new PdfReader(pdf)) {
      assertThat(new PdfTextExtractor(reader).getTextFromPage(1))
          .contains("Depo Faturası")
          .contains("yasal e-Fatura yerine geçmez");
    }

    // İptal: cari sıfırlanır, elleçleme ve dönem serbest kalır, yeniden kesilebilir.
    post(
            s.tenant(),
            BASE + "/invoices/" + invoice.get("id").asText() + "/cancel",
            Map.of("date", TODAY.toString()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("CANCELLED"));
    assertThat(balance(s)).isEqualByComparingTo("0");
    receiptOn(s, item, "1", TODAY).andExpect(status().isCreated());

    JsonNode again = issueInvoice(s, contract, start, TODAY);
    assertThat(amount(again.get("handling"))).isEqualByComparingTo("60");
    assertThat(again.get("number").asText()).isNotEqualTo(invoice.get("number").asText());
  }

  @Test
  void overlappingContractAndEmptyPeriodAreRejected() throws Exception {
    Setup s = setup("ovl", false);
    String contract = contract(s, TODAY.minusDays(5), TODAY, "5", null);
    Map<String, Object> second = contractBody(s, TODAY, TODAY.plusDays(5), "5", null);
    post(s.tenant(), BASE + "/contracts", second)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CONTRACT_OVERLAP"));

    post(
            s.tenant(),
            BASE + "/contracts/" + contract + "/invoices",
            invoiceBody(TODAY.minusDays(5), TODAY))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("NOTHING_TO_BILL"));
    post(
            s.tenant(),
            BASE + "/contracts/" + contract + "/invoices",
            invoiceBody(TODAY.minusDays(30), TODAY))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("DATE_OUT_OF_CONTRACT"));
  }

  @Test
  void bondedStockIsMarkedAndCannotLeaveUntilCustomsRelease() throws Exception {
    Setup s = setup("bnd", true);
    String item = item(s, "SKU1", "1");
    receipt(s, item, s.bin(), "A1", null, "20").andExpect(status().isCreated());

    JsonNode rows = balances(s);
    assertThat(rows.get(0).get("customsStatus").asText()).isEqualTo("UNDER_BOND");
    String bonded = rows.get(0).get("id").asText();

    issue(s, bonded, "5")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("CUSTOMS_HOLD"));

    post(
            s.tenant(),
            BASE + "/customs-releases",
            Map.of(
                "balanceId",
                bonded,
                "quantity",
                "8",
                "date",
                TODAY.toString(),
                "reference",
                "BYN-1"))
        .andExpect(status().isCreated());

    rows = balances(s);
    assertThat(rows).hasSize(2);
    String cleared = null;
    BigDecimal total = BigDecimal.ZERO;
    for (JsonNode row : rows) {
      total = total.add(row.get("quantity").decimalValue());
      if ("CLEARED".equals(row.get("customsStatus").asText())) {
        cleared = row.get("id").asText();
      }
    }
    assertThat(total).isEqualByComparingTo("20");
    issue(s, cleared, "8").andExpect(status().isCreated());
  }

  @Test
  void countBlocksMovementsAndPostsDifferencesAsAdjustments() throws Exception {
    Setup s = setup("cnt", false);
    String item = item(s, "SKU1", "1");
    String other = item(s, "SKU2", "1");
    receipt(s, item, s.bin(), "L1", null, "50").andExpect(status().isCreated());

    JsonNode count =
        body(
            post(
                    s.tenant(),
                    BASE + "/counts",
                    Map.of("warehouseId", s.warehouse(), "date", TODAY.toString()))
                .andExpect(status().isCreated()));
    String id = count.get("count").get("id").asText();
    JsonNode line = count.get("lines").get(0);
    assertThat(line.get("systemQuantity").decimalValue()).isEqualByComparingTo("50");

    receipt(s, item, s.bin(), "L1", null, "1")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("COUNT_OPEN"));
    post(s.tenant(), BASE + "/counts/" + id + "/post", null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("COUNT_INCOMPLETE"));

    send(
            s.tenant(),
            MockMvcRequestBuilders.put(BASE + "/count-lines/" + line.get("id").asText())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"countedQuantity\":47}"))
        .andExpect(status().isNoContent());
    // Kayıtta olmayan ama depoda bulunan mal.
    post(
            s.tenant(),
            BASE + "/counts/" + id + "/lines",
            Map.of("binId", s.bin(), "itemId", other, "lotNo", "X", "countedQuantity", "4"))
        .andExpect(status().isCreated());

    JsonNode posted = body(post(s.tenant(), BASE + "/counts/" + id + "/post", null));
    assertThat(posted.get("count").get("status").asText()).isEqualTo("POSTED");
    assertThat(posted.get("lines").toString())
        .contains("\"difference\":-3")
        .contains("\"difference\":4");

    assertThat(quantityOf(balances(s), "L1")).isEqualByComparingTo("47");
    assertThat(quantityOf(balances(s), "X")).isEqualByComparingTo("4");
    assertThat(
            body(send(s.tenant(), get(BASE + "/movements").param("size", "20")))
                .get("content")
                .toString())
        .contains("ADJUSTMENT");

    receipt(s, item, s.bin(), "L1", null, "1").andExpect(status().isCreated());
  }

  @Test
  void warehouseRoleCannotInvoiceAndFinanceCanButCannotMoveStock() throws Exception {
    Setup s = setup("rol", false);
    String item = item(s, "SKU1", "1");
    receiptOn(s, item, "10", TODAY).andExpect(status().isCreated());
    String contract = contract(s, TODAY, TODAY, "5", null);

    String keeper = inviteAndLogin(s.tenant(), "depo@" + s.tenant() + ".test", "WAREHOUSE");
    mvc.perform(get(BASE + "/balances").with(tenant(s.tenant())).with(bearer(keeper)))
        .andExpect(status().isOk());
    mvc.perform(
            MockMvcRequestBuilders.post(BASE + "/contracts/" + contract + "/invoices")
                .with(tenant(s.tenant()))
                .with(bearer(keeper))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(invoiceBody(TODAY, TODAY))))
        .andExpect(status().isForbidden());

    String finance = inviteAndLogin(s.tenant(), "fin@" + s.tenant() + ".test", "FINANCE");
    mvc.perform(
            MockMvcRequestBuilders.post(BASE + "/contracts/" + contract + "/invoices")
                .with(tenant(s.tenant()))
                .with(bearer(finance))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(invoiceBody(TODAY, TODAY))))
        .andExpect(status().isCreated());
    mvc.perform(
            MockMvcRequestBuilders.post(BASE + "/receipts")
                .with(tenant(s.tenant()))
                .with(bearer(finance))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(receiptBody(item, s.bin(), "", null, "1", TODAY))))
        .andExpect(status().isForbidden());
  }

  @Test
  void futurePeriodCannotBeBilledAndDuplicateCountLineIsRejected() throws Exception {
    Setup s = setup("edg", false);
    String item = item(s, "SKU1", "1");
    receiptOn(s, item, "10", TODAY).andExpect(status().isCreated());
    String contract = contract(s, TODAY, TODAY.plusDays(30), "5", null);
    post(
            s.tenant(),
            BASE + "/contracts/" + contract + "/invoices",
            invoiceBody(TODAY, TODAY.plusDays(10)))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("PERIOD_IN_FUTURE"));

    String count =
        body(post(
                    s.tenant(),
                    BASE + "/counts",
                    Map.of("warehouseId", s.warehouse(), "date", TODAY.toString()))
                .andExpect(status().isCreated()))
            .get("count")
            .get("id")
            .asText();
    Map<String, Object> duplicate =
        Map.of("binId", s.bin(), "itemId", item, "countedQuantity", "4");
    post(s.tenant(), BASE + "/counts/" + count + "/lines", duplicate)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("COUNT_LINE_EXISTS"));
  }

  // Yardımcılar

  private Setup setup(String prefix, boolean bonded) throws Exception {
    String t = "dep-" + prefix;
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
                Map.of("code", "M1", "name", "Müşteri", "type", "CUSTOMER")));
    String warehouse =
        created(
            post(
                t,
                BASE + "/warehouses",
                Map.of("code", "D1", "name", "Ana Depo", "branchId", branch, "bonded", bonded)));
    String bin =
        created(post(t, BASE + "/warehouses/" + warehouse + "/bins", Map.of("code", "A-01")));
    return new Setup(t, branch, customer, warehouse, bin);
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

  private String item(Setup s, String sku, String factor) throws Exception {
    return created(
        post(
            s.tenant(),
            BASE + "/items",
            Map.of(
                "accountId", s.customer(),
                "sku", sku,
                "name", sku,
                "unit", "KOLİ",
                "unitsPerBillingUnit", factor)));
  }

  private static Map<String, Object> receiptBody(
      String item, String bin, String lot, LocalDate expiry, String quantity, LocalDate date) {
    Map<String, Object> body = new HashMap<>();
    body.put("itemId", item);
    body.put("binId", bin);
    body.put("lotNo", lot);
    body.put("expiryDate", expiry == null ? null : expiry.toString());
    body.put("quantity", quantity);
    body.put("date", date.toString());
    return body;
  }

  private ResultActions receipt(
      Setup s, String item, String bin, String lot, LocalDate expiry, String quantity)
      throws Exception {
    return post(
        s.tenant(), BASE + "/receipts", receiptBody(item, bin, lot, expiry, quantity, TODAY));
  }

  private ResultActions receiptOn(Setup s, String item, String quantity, LocalDate date)
      throws Exception {
    return post(
        s.tenant(), BASE + "/receipts", receiptBody(item, s.bin(), "", null, quantity, date));
  }

  private ResultActions issue(Setup s, String balance, String quantity) throws Exception {
    return post(
        s.tenant(),
        BASE + "/issues",
        Map.of("balanceId", balance, "quantity", quantity, "date", TODAY.toString()));
  }

  private JsonNode balances(Setup s) throws Exception {
    return body(send(s.tenant(), get(BASE + "/balances").param("size", "50"))).get("content");
  }

  private static BigDecimal quantityOf(JsonNode rows, String lot) {
    for (JsonNode row : rows) {
      if (lot.equals(row.get("lotNo").asText())) {
        return row.get("quantity").decimalValue();
      }
    }
    return BigDecimal.ZERO;
  }

  private static String balanceId(JsonNode rows, String lot) {
    for (JsonNode row : rows) {
      if (lot.equals(row.get("lotNo").asText())) {
        return row.get("id").asText();
      }
    }
    throw new AssertionError("lot yok: " + lot);
  }

  private static Map<String, Object> contractBody(
      Setup s, LocalDate start, LocalDate end, String rate, String tax) {
    Map<String, Object> body = new HashMap<>();
    body.put("accountId", s.customer());
    body.put("warehouseId", s.warehouse());
    body.put("startDate", start.toString());
    body.put("endDate", end.toString());
    body.put("currency", "TRY");
    body.put("storageBasis", "PALLET_DAY");
    body.put("storageRate", rate);
    body.put("taxRateId", tax);
    return body;
  }

  private String contract(Setup s, LocalDate start, LocalDate end, String rate, String tax)
      throws Exception {
    return created(post(s.tenant(), BASE + "/contracts", contractBody(s, start, end, rate, tax)));
  }

  private static Map<String, Object> invoiceBody(LocalDate from, LocalDate to) {
    return Map.of(
        "from", from.toString(),
        "to", to.toString(),
        "invoiceDate", to.toString(),
        "dueDate", to.plusDays(30).toString());
  }

  private JsonNode issueInvoice(Setup s, String contract, LocalDate from, LocalDate to)
      throws Exception {
    return body(
        post(s.tenant(), BASE + "/contracts/" + contract + "/invoices", invoiceBody(from, to))
            .andExpect(status().isCreated()));
  }

  private BigDecimal balance(Setup s) throws Exception {
    for (JsonNode row :
        body(send(s.tenant(), get("/api/v1/finance/accounts/" + s.customer()))).get("balances")) {
      if ("TRY".equals(row.get("currency").asText())) {
        return row.get("balance").decimalValue();
      }
    }
    return BigDecimal.ZERO;
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
