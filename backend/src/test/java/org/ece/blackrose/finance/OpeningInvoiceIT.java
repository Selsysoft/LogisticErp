package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.ece.blackrose.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

class OpeningInvoiceIT extends AbstractIntegrationTest {

  private static final String BASE = "/api/v1/finance/opening-invoices";
  private static final LocalDate TODAY = tenantToday();
  private static final DateTimeFormatter TR = DateTimeFormatter.ofPattern("dd.MM.yyyy");
  private static final String HEADER =
      "Cari kodu;Belge no;Belge tarihi;Vade;Tutar;Para birimi;Kur\n";

  private record Setup(String tenant, String branch) {}

  @Test
  void hataliSatirlarGorunurVeHicbirSeyYazilmaz() throws Exception {
    Setup s = setup("oie");
    account(s, "E1", "EMPLOYEE");
    String file =
        HEADER
            + row("M1", "A-1", -10, 20, "1500,00", "", "")
            + row("YOK", "A-2", -10, 20, "100", "", "")
            + row("E1", "A-3", -10, 20, "100", "", "")
            + row("M1", "A-4", -10, -20, "100", "", "")
            + row("M1", "A-5", -10, 20, "1.500", "", "")
            + row("M1", "A-6", -10, 20, "-50", "", "")
            + row("M1", "A-1", -10, 20, "10", "", "")
            + row("M1", "A-7", -10, 20, "100", "USD", "")
            + row("T1", "F-1", 5, 20, "100", "", "");

    JsonNode preview = body(upload(s, "/preview", file).andExpect(status().isOk()));
    assertThat(preview.get("valid").asBoolean()).isFalse();
    assertThat(statuses(preview).get(0)).isEqualTo("READY");
    assertThat(errors(preview))
        .anyMatch(e -> e.contains("Cari yok: YOK"))
        .anyMatch(e -> e.contains("E1 müşteri, tedarikçi veya taşeron carisi değil"))
        .anyMatch(e -> e.contains("Vade belge tarihinden önce olamaz"))
        .anyMatch(e -> e.contains("Tutar belirsiz"))
        .anyMatch(e -> e.contains("Tutar sıfırdan büyük olmalıdır"))
        .anyMatch(e -> e.contains("dosyada iki kez"))
        .anyMatch(e -> e.contains("USD için kur bulunamadı"))
        .anyMatch(e -> e.contains("Belge tarihi ileri bir gün olamaz"));
    upload(s, "", file)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("OPENING_INVOICE_INVALID"));
    assertThat(balance(s, "M1")).isEqualByComparingTo("0");
    assertThat(plans(s)).isEmpty();
  }

  @Test
  void alacakNakitOngorusuneBorcOdemePlaninaGirerYaslandirmaBelgeTarihiyle() throws Exception {
    Setup s = setup("oio");
    String file =
        HEADER
            + row("M1", "A-101", -40, 50, "1.000,00", "", "")
            + row("M1", "A-102", -70, 60, "500", "", "")
            + row("T1", "F-55", -20, 40, "4000", "", "")
            + row("M1", "A-200", -5, 30, "100", "USD", "34,50");

    JsonNode preview = body(upload(s, "/preview", file).andExpect(status().isOk()));
    assertThat(preview.get("valid").asBoolean()).isTrue();
    JsonNode applied = body(upload(s, "", file).andExpect(status().isOk()));
    assertThat(applied.get("applied").asBoolean()).isTrue();

    assertThat(balance(s, "M1")).isEqualByComparingTo("1500");
    assertThat(balance(s, "T1")).isEqualByComparingTo("-4000");

    // Tedarikçi faturası taslak ödeme planı olur.
    JsonNode plans = plans(s);
    assertThat(plans).hasSize(1);
    assertThat(plans.get(0).get("status").asText()).isEqualTo("DRAFT");
    assertThat(plans.get(0).get("dueDate").asText()).isEqualTo(TODAY.plusDays(20).toString());
    assertThat(plans.get(0).get("description").asText()).isEqualTo("Açılış faturası F-55");

    // Müşteri faturaları nakit öngörüsüne vadesiyle girer; vadesi geçen ayrı görünür.
    BigDecimal overdue = BigDecimal.ZERO;
    BigDecimal inflow = BigDecimal.ZERO;
    BigDecimal outflow = BigDecimal.ZERO;
    for (JsonNode week :
        body(send(s.tenant(), get("/api/v1/reports/forecast")).andExpect(status().isOk()))) {
      if (!week.get("currency").asText().equals("TRY")) {
        continue;
      }
      if (week.get("overdue").asBoolean()) {
        overdue = overdue.add(week.get("inflow").decimalValue());
      } else {
        inflow = inflow.add(week.get("inflow").decimalValue());
      }
      outflow = outflow.add(week.get("outflow").decimalValue());
    }
    assertThat(overdue).isEqualByComparingTo("500");
    assertThat(inflow).isEqualByComparingTo("1000");
    assertThat(outflow).isEqualByComparingTo("4000");

    // Yaşlandırma belge tarihine göredir: 40 gün 31-60, 70 gün 61-90 diliminde.
    JsonNode aging =
        body(
            send(
                s.tenant(),
                get("/api/v1/finance/reports/aging")
                    .param("type", "RECEIVABLE")
                    .param("asOf", TODAY.toString())));
    JsonNode m1 = null;
    for (JsonNode r : aging) {
      if ("TRY".equals(r.get("currency").asText())) {
        m1 = r;
      }
    }
    assertThat(m1.get("days31To60").decimalValue()).isEqualByComparingTo("1000");
    assertThat(m1.get("days61To90").decimalValue()).isEqualByComparingTo("500");

    // Aynı dosya ikinci kez yüklenemez.
    JsonNode again = body(upload(s, "/preview", file).andExpect(status().isOk()));
    assertThat(errors(again)).allMatch(e -> e.contains("zaten yüklenmiş"));
  }

  @Test
  void acilisBakiyesiVeAcikFaturaAyniCarideBirlikteYuklenemez() throws Exception {
    Setup s = setup("oig");
    account(s, "M2", "CUSTOMER");
    account(s, "T2", "SUPPLIER");
    openingBalance(s, "Kod;Ad;Tür;Bakiye\nM2;M2;Müşteri;300\n").andExpect(status().isOk());
    JsonNode invoice = body(upload(s, "/preview", HEADER + row("M2", "A-1", -5, 5, "300", "", "")));
    assertThat(errors(invoice)).anyMatch(e -> e.contains("açılış bakiyesi yüklenmiş"));

    upload(s, "", HEADER + row("T2", "F-1", -5, 5, "300", "", "")).andExpect(status().isOk());
    JsonNode balance =
        body(
            openingBalance(s, "Kod;Ad;Tür;Bakiye\nT2;T2;Tedarikçi;-300\n")
                .andExpect(status().isBadRequest()));
    assertThat(balance.get("code").asText()).isEqualTo("OPENING_IMPORT_INVALID");
  }

  @Test
  void eksteredenGeriAlinirPlanIptalOlurOdenmisPlanGeriAlinamaz() throws Exception {
    Setup s = setup("oir");
    upload(
            s,
            "",
            HEADER
                + row("T1", "F-1", -5, 5, "300", "", "")
                + row("T1", "F-2", -5, 5, "200", "", ""))
        .andExpect(status().isOk());

    String f1 = openingLine(s, "Açılış faturası F-1");
    reverse(s, f1).andExpect(status().isOk());
    assertThat(balance(s, "T1")).isEqualByComparingTo("-200");
    List<String> statuses = new ArrayList<>();
    plans(s)
        .forEach(p -> statuses.add(p.get("description").asText() + " " + p.get("status").asText()));
    assertThat(statuses)
        .containsExactlyInAnyOrder("Açılış faturası F-1 CANCELLED", "Açılış faturası F-2 DRAFT");
    // Geri alınan belge yeniden yüklenebilir.
    upload(s, "", HEADER + row("T1", "F-1", -5, 5, "310", "", "")).andExpect(status().isOk());

    // F-2'nin planı ödenir; o fatura artık ekstreden geri alınamaz.
    send(
            s.tenant(),
            put("/api/v1/finance/settings")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"allowSelfApproval\":true}"))
        .andExpect(status().isOk());
    String fund =
        id(
            json(
                s,
                post("/api/v1/finance/funds"),
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
                    s.branch(),
                    "allowNegative",
                    true)));
    String plan = null;
    for (JsonNode p : plans(s)) {
      if (p.get("description").asText().equals("Açılış faturası F-2")) {
        plan = p.get("id").asText();
      }
    }
    send(s.tenant(), post("/api/v1/finance/payment-plans/" + plan + "/submit"))
        .andExpect(status().isOk());
    json(s, post("/api/v1/finance/payment-plans/" + plan + "/approve"), Map.of())
        .andExpect(status().isOk());
    json(
            s,
            post("/api/v1/finance/payment-plans/" + plan + "/pay"),
            Map.of("method", "BANK", "fundAccountId", fund, "date", TODAY.toString()))
        .andExpect(status().isOk());
    reverse(s, openingLine(s, "Açılış faturası F-2"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("OPENING_INVOICE_PAID"));
  }

  // Yardımcılar

  /** Belge tarihi bugünden, vade belge tarihinden gün farkıyla verilir. */
  private static String row(
      String code,
      String number,
      int invoiceDays,
      int dueDays,
      String amount,
      String cur,
      String rate) {
    return code
        + ";"
        + number
        + ";"
        + TR.format(TODAY.plusDays(invoiceDays))
        + ";"
        + TR.format(TODAY.plusDays(invoiceDays + dueDays))
        + ";"
        + amount
        + ";"
        + cur
        + ";"
        + rate
        + "\n";
  }

  private Setup setup(String prefix) throws Exception {
    String t = prefix + "-" + Long.toString(System.nanoTime(), 36);
    createTenant(t);
    Setup s = new Setup(t, null);
    String branch =
        id(json(s, post("/api/v1/organization/branches"), Map.of("code", "S1", "name", "Merkez")));
    s = new Setup(t, branch);
    account(s, "M1", "CUSTOMER");
    account(s, "T1", "SUPPLIER");
    return s;
  }

  private void account(Setup s, String code, String type) throws Exception {
    json(s, post("/api/v1/finance/accounts"), Map.of("code", code, "name", code, "type", type))
        .andExpect(status().isCreated());
  }

  private ResultActions send(String t, MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request.with(asOwner(t)));
  }

  private ResultActions json(Setup s, MockHttpServletRequestBuilder request, Object body)
      throws Exception {
    return send(
        s.tenant(),
        request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
  }

  private String id(ResultActions actions) throws Exception {
    return body(actions.andExpect(status().isCreated())).get("id").asText();
  }

  private ResultActions upload(Setup s, String path, String content) throws Exception {
    return mvc.perform(
        multipart(BASE + path)
            .file(
                new MockMultipartFile(
                    "file", "fatura.csv", "text/csv", content.getBytes(StandardCharsets.UTF_8)))
            .param("branchId", s.branch())
            .with(asOwner(s.tenant())));
  }

  private ResultActions openingBalance(Setup s, String content) throws Exception {
    return mvc.perform(
        multipart("/api/v1/finance/opening-balances")
            .file(
                new MockMultipartFile(
                    "file", "acilis.csv", "text/csv", content.getBytes(StandardCharsets.UTF_8)))
            .param("branchId", s.branch())
            .param("date", TODAY.minusDays(1).toString())
            .with(asOwner(s.tenant())));
  }

  private String accountId(Setup s, String code) throws Exception {
    for (JsonNode a :
        body(send(s.tenant(), get("/api/v1/finance/accounts").param("size", "200")))
            .get("content")) {
      if (a.get("code").asText().equals(code)) {
        return a.get("id").asText();
      }
    }
    throw new AssertionError("Cari yok: " + code);
  }

  private BigDecimal balance(Setup s, String code) throws Exception {
    BigDecimal total = BigDecimal.ZERO;
    for (JsonNode b :
        body(send(s.tenant(), get("/api/v1/finance/accounts/" + accountId(s, code))))
            .get("balances")) {
      if (b.get("currency").asText().equals("TRY")) {
        total = total.add(b.get("balance").decimalValue());
      }
    }
    return total;
  }

  private JsonNode plans(Setup s) throws Exception {
    return body(send(s.tenant(), get("/api/v1/finance/payment-plans").param("size", "50")))
        .get("content");
  }

  private String openingLine(Setup s, String description) throws Exception {
    JsonNode statement =
        body(
            send(
                s.tenant(),
                get("/api/v1/finance/accounts/" + accountId(s, "T1") + "/statement")
                    .param("currency", "TRY")
                    .param("from", TODAY.minusDays(60).toString())
                    .param("to", TODAY.toString())
                    .param("size", "50")));
    for (JsonNode line : statement.get("lines")) {
      if (line.get("description").asText().equals(description)
          && line.get("sourceType").asText().equals("OPENING_INVOICE")) {
        return line.get("id").asText();
      }
    }
    throw new AssertionError("Satır yok: " + description);
  }

  private ResultActions reverse(Setup s, String transactionId) throws Exception {
    return json(
        s,
        post("/api/v1/finance/accounts/transactions/" + transactionId + "/reverse"),
        Map.of("date", TODAY.toString()));
  }

  private static List<String> statuses(JsonNode result) {
    List<String> list = new ArrayList<>();
    result.get("rows").forEach(r -> list.add(r.get("status").asText()));
    return list;
  }

  private static List<String> errors(JsonNode result) {
    List<String> list = new ArrayList<>();
    result.get("rows").forEach(r -> list.add(r.path("error").asText()));
    return list;
  }
}
