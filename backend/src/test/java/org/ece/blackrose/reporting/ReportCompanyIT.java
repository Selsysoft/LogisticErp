package org.ece.blackrose.reporting;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.ece.blackrose.finance.SettlementTestSupport;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * {@code /api/v1/reports/position|forecast|settlement-performance|export} şirket kırılımı (12.8
 * §3.4.10, B4): netleşme cari × şirket × para birimi (Rev 1 F3), konsolidede grup şirketi carisi
 * yok, silinmiş cari yok, {@code companyId} süzgeci, kiracı geneli rapor LIMITED'e kapalı.
 */
class ReportCompanyIT extends SettlementTestSupport {

  private static final String BASE = "/api/v1/reports";

  @Test
  void pozisyonSirketKirilimiVeNetlesmeYok() throws Exception {
    World w = world("rpc");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    tx(w, customer, w.a1(), "DEBIT", "100");
    tx(w, customer, w.b1(), "CREDIT", "100");
    UUID group =
        jdbc.queryForObject(
            "select id from \"%s\".account where represents_company_id = ?::uuid"
                .formatted(w.schema()),
            UUID.class,
            w.companyB());
    tx(w, group, w.a1(), "DEBIT", "500");
    UUID deleted = account(w, AccountType.CUSTOMER, null);
    tx(w, deleted, w.a1(), "DEBIT", "999");
    update(w, "update %s.account set deleted = true where id = ?", deleted);

    JsonNode consolidated = position(w, null, Map.of());
    JsonNode row = currency(consolidated, "TRY");
    assertThat(row.get("receivable").decimalValue()).isEqualByComparingTo("100");
    assertThat(row.get("payable").decimalValue()).isEqualByComparingTo("100");
    assertThat(row.get("net").decimalValue()).isEqualByComparingTo("0");
    assertThat(row.get("companyId").isNull()).isTrue();

    JsonNode byCompany = position(w, null, Map.of("byCompany", "true"));
    assertThat(byCompany).hasSize(2);
    for (JsonNode company : byCompany) {
      BigDecimal expected =
          w.companyA().equals(company.get("companyId").asText())
              ? new BigDecimal("100")
              : BigDecimal.ZERO;
      assertThat(company.get("receivable").decimalValue()).isEqualByComparingTo(expected);
    }

    // Şirket seçiliyken grup şirketi carisi dahil; satır şirketi taşır.
    JsonNode companyA = position(w, null, Map.of("companyId", w.companyA()));
    JsonNode inA = currency(companyA, "TRY");
    assertThat(inA.get("receivable").decimalValue()).isEqualByComparingTo("600");
    assertThat(inA.get("companyId").asText()).isEqualTo(w.companyA());

    // Tahsilat performansı ve öngörü şirket süzgeci.
    settlement(w, customer, w.a1(), "70");
    settlement(w, customer, w.b1(), "30");
    JsonNode performance =
        body(
            send(
                    w.t(),
                    null,
                    get(BASE + "/settlement-performance")
                        .param("from", TODAY.minusDays(1).toString())
                        .param("to", TODAY.toString())
                        .param("companyId", w.companyB()))
                .andExpect(status().isOk()));
    assertThat(performance).hasSize(1);
    assertThat(performance.get(0).get("collected").decimalValue()).isEqualByComparingTo("30");
    UUID debtor = account(w, AccountType.CUSTOMER, null);
    tx(w, debtor, w.a1(), "DEBIT", "400");
    freightInvoice(w, debtor, w.a1(), w.companyA(), "400", "TRY");
    JsonNode forecastB =
        body(
            send(w.t(), null, get(BASE + "/forecast").param("companyId", w.companyB()))
                .andExpect(status().isOk()));
    JsonNode forecastA =
        body(
            send(w.t(), null, get(BASE + "/forecast").param("companyId", w.companyA()))
                .andExpect(status().isOk()));
    assertThat(inflow(forecastA)).isEqualByComparingTo("400");
    assertThat(inflow(forecastB)).isEqualByComparingTo("0");

    // Dışa aktarma şirketli (Rev 4 T2: içerik şirkete göre süzülür); LIMITED kullanıcıya kiracı
    // geneli rapor kapalı (/forecast ve /settlement-performance: BranchScopeModulesIT).
    // A: 100 müşteri + 500 grup şirketi + 400 öngörü borçlusu; B: yalnız borç (100).
    assertThat(exportedTryReceivable(w, w.companyA())).isEqualTo(1000d);
    assertThat(exportedTryReceivable(w, w.companyB())).isEqualTo(0d);
    String limited = limitedUser(w, "lim", "FINANCE", List.of(w.a1()));
    send(w.t(), limited, get(BASE + "/position")).andExpect(status().isForbidden());
  }

  /**
   * Rev 4 T2: öngörünün üç şirket süzgeci ayrı ayrı sınanır. Her senaryoda yalnız bir süzgeç satırı
   * düşürür: bakiye süzgeci (fatura A'da, borç bakiyesi B'de), fatura süzgeci (bakiye A'da, fatura
   * B'de) ve ödeme planı (çıkış) süzgeci. Denetim: konsolidede hepsi görünür.
   */
  @Test
  void ongoruSirketSuzgecleriAyriAyriVeCikis() throws Exception {
    World w = world("rpf");
    // Bakiye süzgeci: A faturası, B'de borç bakiyesi. Süzgeç yoksa A girişi 400 olurdu.
    UUID byBalance = account(w, AccountType.CUSTOMER, null);
    freightInvoice(w, byBalance, w.a1(), w.companyA(), "400", "TRY");
    tx(w, byBalance, w.b1(), "DEBIT", "400");
    // Fatura süzgeci: A'da bakiye, fatura B'de. Süzgeç yoksa A girişi 300 olurdu.
    UUID byInvoice = account(w, AccountType.CUSTOMER, null);
    tx(w, byInvoice, w.a1(), "DEBIT", "300");
    freightInvoice(w, byInvoice, w.b1(), w.companyB(), "300", "TRY");
    // Çıkış: B şirketinin onaylı ödeme planı.
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    Map<String, Object> plan = new HashMap<>();
    plan.put("account_id", supplier);
    plan.put("branch_id", UUID.fromString(w.b1()));
    plan.put("company_id", w.companyBId());
    plan.put("amount", new BigDecimal("250"));
    plan.put("currency", "TRY");
    plan.put("due_date", TODAY.plusDays(7));
    plan.put("status", "APPROVED");
    plan.put("deleted", false);
    insert(w, "payment_plan", plan);

    JsonNode all = forecast(w, null);
    assertThat(sum(all, "inflow")).isEqualByComparingTo("700");
    assertThat(sum(all, "outflow")).isEqualByComparingTo("250");
    JsonNode inA = forecast(w, w.companyA());
    assertThat(sum(inA, "inflow")).isEqualByComparingTo("0");
    assertThat(sum(inA, "outflow")).isEqualByComparingTo("0");
    JsonNode inB = forecast(w, w.companyB());
    assertThat(sum(inB, "inflow")).isEqualByComparingTo("0");
    assertThat(sum(inB, "outflow")).isEqualByComparingTo("250");
  }

  private JsonNode forecast(World w, String company) throws Exception {
    MockHttpServletRequestBuilder request = get(BASE + "/forecast");
    if (company != null) {
      request.param("companyId", company);
    }
    return body(send(w.t(), null, request).andExpect(status().isOk()));
  }

  private static BigDecimal sum(JsonNode rows, String field) {
    BigDecimal total = BigDecimal.ZERO;
    for (JsonNode row : rows) {
      total = total.add(row.get(field).decimalValue());
    }
    return total;
  }

  /** POSITION XLSX dışa aktarımında TRY satırının "Alacak" hücresi. */
  private double exportedTryReceivable(World w, String company) throws Exception {
    byte[] xlsx =
        send(
                w.t(),
                null,
                get(BASE + "/export")
                    .param("report", "POSITION")
                    .param("format", "XLSX")
                    .param("companyId", company))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsByteArray();
    try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(xlsx))) {
      var sheet = workbook.getSheetAt(0);
      for (int i = 0; i <= sheet.getLastRowNum(); i++) {
        var row = sheet.getRow(i);
        if (row != null
            && row.getCell(0) != null
            && row.getCell(0).getCellType() == CellType.STRING
            && "TRY".equals(row.getCell(0).getStringCellValue())) {
          return row.getCell(2).getNumericCellValue();
        }
      }
    }
    throw new AssertionError("TRY satırı yok");
  }

  private JsonNode position(World w, String token, Map<String, String> params) throws Exception {
    MockHttpServletRequestBuilder request = get(BASE + "/position");
    params.forEach(request::param);
    return body(send(w.t(), token, request).andExpect(status().isOk()));
  }

  private static JsonNode currency(JsonNode rows, String currency) {
    for (JsonNode row : rows) {
      if (currency.equals(row.get("currency").asText())) {
        return row;
      }
    }
    throw new AssertionError("Para birimi yok: " + currency);
  }

  private static BigDecimal inflow(JsonNode forecast) {
    BigDecimal total = BigDecimal.ZERO;
    for (JsonNode row : forecast) {
      total = total.add(row.get("inflow").decimalValue());
    }
    return total;
  }

  private void tx(World w, UUID account, String branch, String direction, String amount) {
    Map<String, Object> values = new HashMap<>();
    values.put("account_id", account);
    values.put("branch_id", UUID.fromString(branch));
    values.put("company_id", UUID.fromString(w.b1().equals(branch) ? w.companyB() : w.companyA()));
    values.put("direction", direction);
    values.put("amount", new BigDecimal(amount));
    values.put("currency", "TRY");
    values.put("exchange_rate", BigDecimal.ONE);
    values.put("rate_date", TODAY);
    values.put("tl_amount", new BigDecimal(amount));
    values.put("transaction_date", TODAY);
    values.put("source_type", "MANUAL");
    values.put("source_id", UUID.randomUUID());
    insert(w, "account_transaction", values);
  }

  private void settlement(World w, UUID account, String branch, String amount) {
    Map<String, Object> values = new HashMap<>();
    values.put("type", "COLLECTION");
    values.put("method", "CASH");
    values.put("account_id", account);
    values.put("branch_id", UUID.fromString(branch));
    values.put("company_id", UUID.fromString(w.b1().equals(branch) ? w.companyB() : w.companyA()));
    values.put("amount", new BigDecimal(amount));
    values.put("currency", "TRY");
    values.put("settlement_date", TODAY);
    values.put("status", "POSTED");
    values.put("deleted", false);
    insert(w, "settlement", values);
  }
}
