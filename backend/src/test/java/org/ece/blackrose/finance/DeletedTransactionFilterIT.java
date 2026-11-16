package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import org.ece.blackrose.AbstractIntegrationTest;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/**
 * Silinmiş işaretli (deleted = true) cari ve banka/kasa hareketi hiçbir bakiye, ekstre ve kontrol
 * sorgusunda sayılmaz. Uygulama hareketi silmez (ters kayıt yazar); işaret doğrudan SQL ile konur.
 */
class DeletedTransactionFilterIT extends AbstractIntegrationTest {

  @Autowired JdbcTemplate jdbc;
  @Autowired TenantRepository tenants;

  @Test
  void silinmisCariHareketiBakiyeEkstreVeEskitmedeSayilmaz() throws Exception {
    String t = tenantCode("dta");
    String branch = branch(t);
    String customer = account(t, "M1", "CUSTOMER");

    String ghostBefore = manual(t, customer, branch, "DEBIT", "100", "2026-10-01");
    manual(t, customer, branch, "DEBIT", "40", "2026-10-02");
    manual(t, customer, branch, "DEBIT", "50", "2026-11-01");
    String ghostInside = manual(t, customer, branch, "DEBIT", "70", "2026-11-03");
    markDeleted(t, "account_transaction", ghostBefore);
    markDeleted(t, "account_transaction", ghostInside);

    // Bakiye: 40 + 50; silinmişler sayılsaydı 260 olurdu.
    JsonNode balance =
        body(send(t, get("/api/v1/finance/accounts/" + customer))).get("balances").get(0);
    assertThat(balance.get("balance").decimalValue()).isEqualByComparingTo("90");
    assertThat(balance.get("tlBalance").decimalValue()).isEqualByComparingTo("90");

    // Ekstre: dönem başı 40, tek satır, toplam sayısı da 1.
    JsonNode statement =
        body(
            send(
                    t,
                    get("/api/v1/finance/accounts/" + customer + "/statement")
                        .param("currency", "TRY")
                        .param("from", "2026-11-01")
                        .param("to", "2026-11-30")
                        .param("size", "1"))
                .andExpect(status().isOk()));
    assertThat(statement.get("openingBalance").decimalValue()).isEqualByComparingTo("40");
    assertThat(statement.get("totalElements").asLong()).isEqualTo(1);
    assertThat(statement.get("totalPages").asInt()).isEqualTo(1);
    assertThat(statement.get("lines").size()).isEqualTo(1);
    assertThat(statement.get("lines").get(0).get("balance").decimalValue())
        .isEqualByComparingTo("90");

    // Eskitme zaten süzüyordu; gerilemeye karşı korunur.
    JsonNode aging =
        body(
            send(
                t,
                get("/api/v1/finance/reports/aging")
                    .param("type", "RECEIVABLE")
                    .param("asOf", "2026-11-04")));
    assertThat(aging.size()).isEqualTo(1);
    assertThat(aging.get(0).get("total").decimalValue()).isEqualByComparingTo("90");
    assertThat(aging.get(0).get("days31To60").decimalValue()).isEqualByComparingTo("40");

    // Finansal durum raporu zaten süzüyordu; gerilemeye karşı korunur.
    JsonNode position = tryPosition(t);
    assertThat(position.get("receivable").decimalValue()).isEqualByComparingTo("90");
  }

  /**
   * 12.1 uçları: tür kırılımlı bakiye, ekstre v2 (açılış dahil, çok para birimli), çapraz liste +
   * facet'ler, tek hareket detayı ve cari fatura listesi silinmiş satırı saymaz.
   */
  @Test
  void silinmisHareketVeBelge12_1UclarindaSayilmaz() throws Exception {
    String t = tenantCode("dtk");
    String branch = branch(t);
    String supplier = account(t, "T1", "SUPPLIER");

    String ghostBefore = manual(t, supplier, branch, "CREDIT", "100", "2026-10-01");
    manual(t, supplier, branch, "CREDIT", "40", "2026-10-02");
    manual(t, supplier, branch, "CREDIT", "50", "2026-11-01");
    String ghostInside = manual(t, supplier, branch, "CREDIT", "70", "2026-11-03");
    markDeleted(t, "account_transaction", ghostBefore);
    markDeleted(t, "account_transaction", ghostInside);
    Map<String, Object> invoice = new HashMap<>();
    invoice.put("side", "PAYABLE");
    invoice.put("documentType", "ALIS_FATURASI");
    invoice.put("documentNo", "AF-SIL");
    invoice.put("documentDate", "2026-11-02");
    invoice.put("amount", "10");
    invoice.put("currency", "TRY");
    invoice.put("paymentMethod", "BANK");
    invoice.put("branchId", branch);
    invoice.put("reflectToLedger", false);
    String ghostDocument =
        created(post(t, "/api/v1/finance/accounts/" + supplier + "/documents", invoice));
    markDeleted(t, "account_document", ghostDocument);

    JsonNode balances =
        body(send(t, get("/api/v1/finance/accounts/" + supplier + "/balances"))).get("rows").get(0);
    assertThat(balances.get("balance").decimalValue()).isEqualByComparingTo("-90");
    assertThat(balances.get("debt").decimalValue()).isEqualByComparingTo("90");

    JsonNode statement =
        body(
            send(
                    t,
                    get("/api/v1/finance/accounts/" + supplier + "/statement")
                        .param("from", "2026-11-01")
                        .param("to", "2026-11-30"))
                .andExpect(status().isOk()));
    assertThat(statement.get("openingBalances").get(0).get("amount").decimalValue())
        .isEqualByComparingTo("-40");
    assertThat(statement.get("totalElements").asLong()).isEqualTo(1);
    assertThat(statement.get("lines").get(0).get("balance").decimalValue())
        .isEqualByComparingTo("-90");

    JsonNode page =
        body(
            send(
                    t,
                    get("/api/v1/finance/account-transactions")
                        .param("from", "2026-10-01")
                        .param("to", "2026-11-30")
                        .param("facets", "true"))
                .andExpect(status().isOk()));
    assertThat(page.get("totalElements").asLong()).isEqualTo(2);
    assertThat(page.get("facets").get("kinds").get(0).get("count").asLong()).isEqualTo(2);
    assertThat(page.get("facets").get("branches").get(0).get("count").asLong()).isEqualTo(2);
    send(t, get("/api/v1/finance/accounts/transactions/" + ghostInside))
        .andExpect(status().isNotFound());

    JsonNode invoices =
        body(
            send(
                    t,
                    get("/api/v1/finance/accounts/" + supplier + "/invoices")
                        .param("direction", "PURCHASE"))
                .andExpect(status().isOk()));
    assertThat(invoices).isEmpty();
    assertThat(
            body(send(t, get("/api/v1/finance/accounts/" + supplier + "/balances")))
                .get("payableInvoiceTotals"))
        .isEmpty();

    // B4: silinmiş hareket taşınabilir listede yoktur.
    JsonNode transferable =
        body(
            send(t, get("/api/v1/finance/accounts/" + supplier + "/transferable-transactions"))
                .andExpect(status().isOk()));
    assertThat(transferable).hasSize(2);
    assertThat(transferable.findValuesAsText("transactionId"))
        .doesNotContain(ghostBefore, ghostInside);
  }

  @Test
  void silinmisFonHareketiBakiyeEkstreVeYeterlilikKontrolundeSayilmaz() throws Exception {
    String t = tenantCode("dtf");
    String branch = branch(t);
    String bank = fund(t, branch);

    String ghostBefore = fundMove(t, bank, "IN", "500", "2026-11-01");
    fundMove(t, bank, "IN", "300", "2026-11-02");
    fundMove(t, bank, "IN", "200", "2026-11-04");
    String ghostInside = fundMove(t, bank, "IN", "999", "2026-11-04");
    markDeleted(t, "fund_transaction", ghostBefore);
    markDeleted(t, "fund_transaction", ghostInside);

    assertThat(fundBalance(t, bank)).isEqualByComparingTo("500");

    JsonNode statement =
        body(
            send(
                    t,
                    get("/api/v1/finance/funds/" + bank + "/statement")
                        .param("from", "2026-11-03")
                        .param("to", "2026-11-04")
                        .param("size", "1"))
                .andExpect(status().isOk()));
    assertThat(statement.get("openingBalance").decimalValue()).isEqualByComparingTo("300");
    assertThat(statement.get("totalElements").asLong()).isEqualTo(1);
    assertThat(statement.get("lines").size()).isEqualTo(1);
    assertThat(statement.get("lines").get(0).get("balance").decimalValue())
        .isEqualByComparingTo("500");

    // Silinmiş girişler çıkışı karşılamaz.
    post(
            t,
            "/api/v1/finance/funds/" + bank + "/transactions",
            Map.of("direction", "OUT", "money", money("600"), "date", "2026-11-04"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INSUFFICIENT_FUNDS"));

    assertThat(tryPosition(t).get("cash").decimalValue()).isEqualByComparingTo("500");
  }

  @Test
  void silinmisFonHareketiBankaMutabakatindaAdayOlmazVeEslenemez() throws Exception {
    String t = tenantCode("dtb");
    String branch = branch(t);
    String bank = fund(t, branch);
    String ghost = fundMove(t, bank, "IN", "500", DATE);
    fundMove(t, bank, "IN", "300", DATE);
    markDeleted(t, "fund_transaction", ghost);

    String file =
        "tarih;tutar;aciklama;ref\n" + DATE + ";500,00;Hayalet;G1\n" + DATE + ";300;Canlı;L1\n";
    JsonNode result =
        body(
            mvc.perform(
                    multipart("/api/v1/integration/bank/" + bank + "/statements")
                        .file(csv(file))
                        .with(asOwner(t)))
                .andExpect(status().isCreated()));
    assertThat(result.get("imported").asInt()).isEqualTo(2);
    assertThat(result.get("matched").asInt()).isEqualTo(1);

    String ghostLine = null;
    for (JsonNode line : body(send(t, get("/api/v1/integration/bank/" + bank + "/lines")))) {
      if ("G1".equals(line.get("reference").asText())) {
        assertThat(line.get("status").asText()).isEqualTo("UNMATCHED");
        ghostLine = line.get("id").asText();
      }
    }
    assertThat(ghostLine).isNotNull();
    assertThat(body(send(t, get("/api/v1/integration/bank/lines/" + ghostLine + "/candidates"))))
        .isEmpty();
    post(
            t,
            "/api/v1/integration/bank/lines/" + ghostLine + "/match",
            Map.of("transactionId", ghost))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("TRANSACTION_NOT_FOUND"));
  }

  @Test
  void silinmisCekHareketiGecmisteGorunmez() throws Exception {
    String t = tenantCode("dti");
    String branch = branch(t);
    String customer = account(t, "M1", "CUSTOMER");
    String bank = fund(t, branch);
    manual(t, customer, branch, "DEBIT", "500", DATE);
    Map<String, Object> collection = new HashMap<>();
    collection.put("method", "CHECK");
    collection.put("accountId", customer);
    collection.put("branchId", branch);
    collection.put("money", money("500"));
    collection.put("date", DATE);
    collection.put(
        "instrument",
        Map.of(
            "kind",
            "CHECK",
            "number",
            "0000001",
            "bankName",
            "Test Bank",
            "dueDate",
            "2027-01-15"));
    String check =
        body(post(t, "/api/v1/finance/collections", collection).andExpect(status().isCreated()))
            .get("instrumentId")
            .asText();
    post(
            t,
            "/api/v1/finance/instruments/" + check + "/transition",
            Map.of("toStatus", "AT_BANK", "date", DATE, "fundAccountId", bank))
        .andExpect(status().isOk());
    int updated =
        jdbc.update(
            "update \""
                + schema(t)
                + "\".instrument_movement set deleted = true"
                + " where instrument_id = ?::uuid and from_status is null",
            check);
    assertThat(updated).isEqualTo(1);

    JsonNode history = body(send(t, get("/api/v1/finance/instruments/" + check + "/movements")));
    assertThat(history.size()).isEqualTo(1);
    assertThat(history.get(0).get("toStatus").asText()).isEqualTo("AT_BANK");
  }

  @Test
  void silinmisAcilisHareketiYeniAcilisiEngellemez() throws Exception {
    String t = tenantCode("dto");
    String branch = branch(t);
    LocalDate date = tenantToday().minusDays(1);
    openingUpload(t, branch, date, "1000").andExpect(status().isOk());
    jdbc.update(
        "update \""
            + schema(t)
            + "\".account_transaction set deleted = true"
            + " where source_type = 'OPENING'");

    openingUpload(t, branch, date, "1200").andExpect(status().isOk());

    String id = null;
    for (JsonNode row : body(send(t, get("/api/v1/finance/accounts"))).get("content")) {
      if ("M001".equals(row.get("code").asText())) {
        id = row.get("id").asText();
      }
    }
    assertThat(id).isNotNull();
    JsonNode balances = body(send(t, get("/api/v1/finance/accounts/" + id))).get("balances");
    assertThat(balances.size()).isEqualTo(1);
    assertThat(balances.get(0).get("balance").decimalValue()).isEqualByComparingTo("1200");
  }

  // Yardımcılar

  private static final String DATE = "2026-11-04";

  private JsonNode tryPosition(String t) throws Exception {
    for (JsonNode row : body(send(t, get("/api/v1/reports/position")))) {
      if ("TRY".equals(row.get("currency").asText())) {
        return row;
      }
    }
    throw new AssertionError("TRY satırı yok");
  }

  private static MockMultipartFile csv(String content) {
    return new MockMultipartFile(
        "file", "ekstre.csv", "text/csv", content.getBytes(StandardCharsets.UTF_8));
  }

  private String tenantCode(String prefix) throws Exception {
    String code = prefix + "-" + Long.toString(System.nanoTime(), 36);
    createTenant(code);
    return code;
  }

  private String schema(String t) {
    return tenants.findByCode(t).orElseThrow().getSchemaName();
  }

  private void markDeleted(String t, String table, String id) {
    int updated =
        jdbc.update(
            "update \"" + schema(t) + "\"." + table + " set deleted = true where id = ?::uuid", id);
    assertThat(updated).isEqualTo(1);
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

  private String branch(String t) throws Exception {
    return created(
        post(t, "/api/v1/organization/branches", Map.of("code", "S1", "name", "Merkez")));
  }

  private String account(String t, String code, String type) throws Exception {
    return created(
        post(
            t,
            "/api/v1/finance/accounts",
            Map.of("code", code, "name", code + " Ltd", "type", type)));
  }

  private String fund(String t, String branch) throws Exception {
    return created(
        post(
            t,
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
                branch)));
  }

  private static Map<String, Object> money(String amount) {
    return Map.of("amount", amount, "currency", "TRY");
  }

  private String manual(
      String t, String account, String branch, String direction, String amount, String date)
      throws Exception {
    return created(
        post(
            t,
            "/api/v1/finance/accounts/" + account + "/transactions",
            Map.of(
                "branchId", branch, "direction", direction, "money", money(amount), "date", date)));
  }

  private String fundMove(String t, String fund, String direction, String amount, String date)
      throws Exception {
    return created(
        post(
            t,
            "/api/v1/finance/funds/" + fund + "/transactions",
            Map.of("direction", direction, "money", money(amount), "date", date)));
  }

  private BigDecimal fundBalance(String t, String fund) throws Exception {
    for (JsonNode row : body(send(t, get("/api/v1/finance/funds")))) {
      if (fund.equals(row.get("id").asText())) {
        return row.get("balance").decimalValue();
      }
    }
    throw new AssertionError("Hesap yok: " + fund);
  }

  private ResultActions openingUpload(String t, String branch, LocalDate date, String amount)
      throws Exception {
    MockMultipartFile file =
        new MockMultipartFile(
            "file",
            "acilis.csv",
            "text/csv",
            ("Kod;Ad;Tür;Bakiye\nM001;Alfa Ltd;Müşteri;" + amount + "\n")
                .getBytes(StandardCharsets.UTF_8));
    return mvc.perform(
        multipart("/api/v1/finance/opening-balances")
            .file(file)
            .param("branchId", branch)
            .param("date", date.toString())
            .with(asOwner(t)));
  }
}
