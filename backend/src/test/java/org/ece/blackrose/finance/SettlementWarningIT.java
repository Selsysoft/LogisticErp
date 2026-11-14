package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Şirket dağılımı uyarısı (12.2 §3.6, §4.5, K-12.2-3): {@code POST /settlements/check} önizlemesi,
 * {@code createByUser}'da 409 {@code CONFIRMATION_REQUIRED} ve {@code confirmWarnings}, kapsamlı
 * kullanıcıda gizli tutar yok, türetilmiş akışlar uyarısız.
 */
class SettlementWarningIT extends AccountTestSupport {

  private static final String CHECK = FINANCE + "/settlements/check";

  @Test
  void kullaniciOrnegiUyariOnayVeDenetim() throws Exception {
    World w = world("swa");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    manual(w, supplier, w.a1(), Direction.CREDIT, "100", "TRY");
    manual(w, supplier, w.b1(), Direction.CREDIT, "50", "TRY");
    Map<String, Object> body = cash(supplier, w.b1(), w.fundB1(), "150");

    JsonNode check = check(w, null, "PAYMENT", body);
    assertThat(check.get("warnings")).hasSize(1);
    JsonNode warning = check.get("warnings").get(0);
    assertThat(warning.get("code").asText()).isEqualTo("COMPANY_ALLOCATION_EXCEEDED");
    assertThat(warning.get("severity").asText()).isEqualTo("CONFIRM");
    assertThat(warning.get("currency").asText()).isEqualTo("TRY");
    assertThat(warning.get("companyId").asText()).isEqualTo(w.companyB());
    assertThat(warning.get("companyOutstanding").decimalValue()).isEqualByComparingTo("50");
    assertThat(warning.get("amount").decimalValue()).isEqualByComparingTo("150");
    assertThat(warning.get("excess").decimalValue()).isEqualByComparingTo("100");
    assertThat(warning.get("others")).hasSize(1);
    assertThat(warning.get("others").get(0).get("companyId").asText()).isEqualTo(w.companyA());
    assertThat(warning.get("others").get(0).get("outstanding").decimalValue())
        .isEqualByComparingTo("100");
    assertThat(warning.get("partialScope").asBoolean()).isFalse();
    assertThat(warning.get("otherHiddenExists").asBoolean()).isFalse();
    // Faturasız 50 borç: ödeme şirketi + para birimi, PAYABLE.
    assertThat(check.get("invoiceGaps")).hasSize(1);
    JsonNode gap = check.get("invoiceGaps").get(0);
    assertThat(gap.get("side").asText()).isEqualTo("PAYABLE");
    assertThat(gap.get("companyId").asText()).isEqualTo(w.companyB());
    assertThat(gap.get("missing").decimalValue()).isEqualByComparingTo("50");
    assertThat(settlementCount(w)).isZero();

    // Onaysız kayıt 409; hiçbir şey yazılmaz.
    JsonNode error = body(pay(w, null, body, null).andExpect(status().isConflict()));
    assertThat(error.get("code").asText()).isEqualTo("CONFIRMATION_REQUIRED");
    assertThat(error.get("message").asText()).contains("borcunu aşıyor");
    List<String> details = texts(error.get("details"));
    assertThat(details)
        .contains(
            "warning=COMPANY_ALLOCATION_EXCEEDED",
            "currency=TRY",
            "companyId=" + w.companyB(),
            "companyOutstanding=50.00",
            "amount=150.00",
            "excess=100.00",
            "other." + w.companyA() + "=100.00",
            "partialScope=false",
            "otherHiddenExists=false");
    assertThat(settlementCount(w)).isZero();
    assertThat(fundTransactionCount(w, w.fundB1())).isZero();

    // "Tamam": confirmWarnings=true ile kayıt ve denetim.
    body.put("confirmWarnings", true);
    String id = id(pay(w, null, body, "K-1"));
    assertThat(settlementCount(w)).isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                ("select details from \"%s\".audit_log where event_type ="
                        + " 'SETTLEMENT_ALLOCATION_OVERRIDE' and target = ?")
                    .formatted(w.schema()),
                String.class,
                "SETTLEMENT:" + id))
        .isEqualTo("currency=TRY;companyOutstanding=50.00;amount=150.00");

    // Aynı anahtarla tekrar: uyarı çalışmaz, aynı kayıt döner.
    body.remove("confirmWarnings");
    assertThat(id(pay(w, null, body, "K-1"))).isEqualTo(id);
    assertThat(settlementCount(w)).isEqualTo(1);

    // Ödemeden sonra B borcu −100 (avans): yeni ödeme yine onay ister, diğer şirket A 100.
    JsonNode after = check(w, null, "PAYMENT", cash(supplier, w.b1(), w.fundB1(), "1"));
    assertThat(after.get("warnings").get(0).get("companyOutstanding").decimalValue())
        .isEqualByComparingTo("0");
    // Eksik fatura ödemeden bağımsızdır: B'deki faturasız 50 borç sürer.
    assertThat(after.get("invoiceGaps").get(0).get("missing").decimalValue())
        .isEqualByComparingTo("50");
  }

  @Test
  void borcYeterliyseUyariYokBorcsuzCariyeOnayTahsilatBilgi() throws Exception {
    World w = world("swb");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    manual(w, supplier, w.a1(), Direction.CREDIT, "200", "TRY");
    // USD borcu TRY ödemesini etkilemez.
    manual(w, supplier, w.b1(), Direction.CREDIT, "1000", "USD");

    Map<String, Object> enough = cash(supplier, w.a1(), w.fundA1(), "200");
    assertThat(check(w, null, "PAYMENT", enough).get("warnings")).isEmpty();
    id(pay(w, null, enough, null));

    // B'de TRY borcu yok (yalnız USD): diğer şirket satırı da yok.
    JsonNode none =
        check(w, null, "PAYMENT", cash(supplier, w.b1(), w.fundB1(), "10")).get("warnings");
    assertThat(none.get(0).get("companyOutstanding").decimalValue()).isEqualByComparingTo("0");
    assertThat(none.get(0).get("others")).isEmpty();

    // Hiç hareketi olmayan cari: onay ister (OK-12.2-4).
    UUID fresh = account(w, AccountType.SUPPLIER, null);
    Map<String, Object> freshBody = cash(fresh, w.a1(), w.fundA1(), "5");
    JsonNode freshCheck = check(w, null, "PAYMENT", freshBody);
    assertThat(freshCheck.get("warnings").get(0).get("excess").decimalValue())
        .isEqualByComparingTo("5");
    assertThat(freshCheck.get("warnings").get(0).get("others")).isEmpty();
    expect(pay(w, null, freshBody, null), 409, "CONFIRMATION_REQUIRED");
    freshBody.put("confirmWarnings", true);
    id(pay(w, null, freshBody, null));

    // Tahsilat: yalnız bilgi, onaysız 201.
    UUID customer = account(w, AccountType.CUSTOMER, null);
    manual(w, customer, w.a1(), Direction.DEBIT, "30", "TRY");
    Map<String, Object> collection = cash(customer, w.a1(), w.fundA1(), "80");
    JsonNode info = check(w, null, "COLLECTION", collection);
    assertThat(info.get("warnings").get(0).get("severity").asText()).isEqualTo("INFO");
    assertThat(info.get("warnings").get(0).get("companyOutstanding").decimalValue())
        .isEqualByComparingTo("30");
    assertThat(info.get("warnings").get(0).get("excess").decimalValue()).isEqualByComparingTo("50");
    // Tahsilatta eksik fatura RECEIVABLE tarafıdır: faturasız 30 alacak.
    assertThat(info.get("invoiceGaps").get(0).get("side").asText()).isEqualTo("RECEIVABLE");
    assertThat(info.get("invoiceGaps").get(0).get("missing").decimalValue())
        .isEqualByComparingTo("30");
    id(collect(w, collection));
    assertThat(
            jdbc.queryForObject(
                ("select count(*) from \"%s\".audit_log"
                        + " where event_type = 'SETTLEMENT_ALLOCATION_OVERRIDE'")
                    .formatted(w.schema()),
                Long.class))
        .isEqualTo(1L);

    // Doğrudan gider (cari yok): uyarı ve eksik fatura yok.
    String type =
        id(
            sendJson(
                w.t(),
                null,
                post(FINANCE + "/expense-types"),
                Map.of("code", "GT1", "name", "Genel")));
    String item =
        id(
            sendJson(
                w.t(),
                null,
                post(FINANCE + "/expense-items"),
                Map.of("expenseTypeId", type, "code", "GK1", "name", "Kırtasiye")));
    Map<String, Object> direct = cash(null, w.a1(), w.fundA1(), "3");
    direct.put("expenseItemId", item);
    JsonNode directCheck = check(w, null, "PAYMENT", direct);
    assertThat(directCheck.get("warnings")).isEmpty();
    assertThat(directCheck.get("invoiceGaps")).isEmpty();
  }

  @Test
  void dogrulamaUyaridanOnceVeAnahtarKurallari() throws Exception {
    World w = world("swc");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    // Başka şirketin kasası: uyarıdan önce 422 (check'te de).
    Map<String, Object> wrongFund = cash(supplier, w.b1(), w.fundA1(), "10");
    expect(sendJson(w.t(), null, checkRequest("PAYMENT"), wrongFund), 422, "COMPANY_MISMATCH");
    expect(pay(w, null, wrongFund, null), 422, "COMPANY_MISMATCH");
    Map<String, Object> zero = cash(supplier, w.a1(), w.fundA1(), "0");
    expect(sendJson(w.t(), null, checkRequest("PAYMENT"), zero), 400, "AMOUNT_INVALID");

    // "ict:" önekli kullanıcı anahtarı reddedilir (şirketler arası virmana ayrılmıştır).
    Map<String, Object> body = cash(supplier, w.a1(), w.fundA1(), "10");
    body.put("confirmWarnings", true);
    expect(pay(w, null, body, "ict:K:P"), 400, "IDEMPOTENCY_KEY_INVALID");
    expect(pay(w, null, body, "ICT:x"), 400, "IDEMPOTENCY_KEY_INVALID");
    MockHttpServletRequestBuilder collection =
        post(FINANCE + "/collections").header("Idempotency-Key", "Ict:abc");
    expect(sendJson(w.t(), null, collection, body), 400, "IDEMPOTENCY_KEY_INVALID");
    assertThat(settlementCount(w)).isZero();

    // Pasif kasa: kullanıcı ödemesi 422 FUND_INACTIVE.
    sendJson(
            w.t(),
            null,
            org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch(
                FINANCE + "/funds/" + w.fundA2() + "/active"),
            Map.of("active", false))
        .andExpect(status().isOk());
    Map<String, Object> inactive = cash(supplier, w.a2(), w.fundA2(), "10");
    inactive.put("confirmWarnings", true);
    expect(pay(w, null, inactive, null), 422, "FUND_INACTIVE");

    // Bir şirkete bağlı kart başka şirkette: check 422 COMPANY_MISMATCH.
    UUID bound = account(w, AccountType.SUPPLIER, null);
    jdbc.update(
        "update \"%s\".account set company_id = ?::uuid where id = ?".formatted(w.schema()),
        w.companyA(),
        bound);
    expect(
        sendJson(w.t(), null, checkRequest("PAYMENT"), cash(bound, w.b1(), w.fundB1(), "10")),
        422,
        "COMPANY_MISMATCH");

    // Personel carisi: FINANCE_EMPLOYEE_VIEW'sız kullanıcıya check ve kayıt 404.
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    String finance = userWithRole(w, "finans", "FINANCE");
    Map<String, Object> toEmployee = cash(employee, w.a1(), w.fundA1(), "10");
    expect(sendJson(w.t(), finance, checkRequest("PAYMENT"), toEmployee), 404, "ACCOUNT_NOT_FOUND");
    toEmployee.put("confirmWarnings", true);
    expect(pay(w, finance, toEmployee, null), 404, "ACCOUNT_NOT_FOUND");
    // Patron görür: uyarı döner.
    assertThat(check(w, null, "PAYMENT", toEmployee).get("warnings")).hasSize(1);
    // İzinsiz kullanıcı (yalnız FINANCE_VIEW) check yapamaz.
    String accounting = userWithRole(w, "muhasebe", "ACCOUNTING");
    sendJson(w.t(), accounting, checkRequest("PAYMENT"), body).andExpect(status().isForbidden());
  }

  @Test
  void kapsamliKullanicidaGizliTutarYok() throws Exception {
    World w = world("swd");
    String b2 =
        id(
            sendJson(
                w.t(),
                null,
                post("/api/v1/organization/branches"),
                Map.of("code", "B2", "name", "B2 Merkez", "companyId", w.companyB())));
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    // B1 (görünen) 100 borç; B2 (görünmeyen) 30 avans → B gerçek borcu 70; A'da 40 borç (gizli).
    manual(w, supplier, w.b1(), Direction.CREDIT, "100", "TRY");
    manual(w, supplier, b2, Direction.DEBIT, "30", "TRY");
    manual(w, supplier, w.a1(), Direction.CREDIT, "40", "TRY");
    String limited = limitedUser(w, "sinirli", "FINANCE", List.of(w.b1()));
    Map<String, Object> body = cash(supplier, w.b1(), w.fundB1(), "90");

    JsonNode check = check(w, limited, "PAYMENT", body);
    JsonNode warning = check.get("warnings").get(0);
    assertThat(warning.get("severity").asText()).isEqualTo("CONFIRM");
    assertThat(warning.get("companyOutstanding").decimalValue()).isEqualByComparingTo("100");
    assertThat(warning.get("excess").decimalValue()).isEqualByComparingTo("0");
    assertThat(warning.get("others")).isEmpty();
    assertThat(warning.get("partialScope").asBoolean()).isTrue();
    assertThat(warning.get("otherHiddenExists").asBoolean()).isTrue();
    // Gizli toplam (70) ve gizli şirket borcu (40) hiçbir tutar alanında yok. Metin araması
    // rastgele şirket UUID'sinde "40" geçince kırılıyordu; yalnız sayısal alanlar denetlenir.
    List<java.math.BigDecimal> amounts = new java.util.ArrayList<>();
    warning
        .fields()
        .forEachRemaining(
            field -> {
              if (field.getValue().isNumber()) {
                amounts.add(field.getValue().decimalValue());
              }
            });
    assertThat(amounts)
        .hasSize(3)
        .noneMatch(
            value ->
                value.compareTo(new java.math.BigDecimal("70")) == 0
                    || value.compareTo(new java.math.BigDecimal("40")) == 0);
    // Eksik fatura da kapsamlı: yalnız B1'in 100'ü.
    JsonNode gap = check.get("invoiceGaps").get(0);
    assertThat(gap.get("ledgerTotal").decimalValue()).isEqualByComparingTo("100");
    assertThat(gap.get("missing").decimalValue()).isEqualByComparingTo("100");

    JsonNode error = body(pay(w, limited, body, null).andExpect(status().isConflict()));
    assertThat(error.get("code").asText()).isEqualTo("CONFIRMATION_REQUIRED");
    assertThat(error.get("message").asText()).contains("Yetkili olmadığınız iş yerlerindeki");
    List<String> details = texts(error.get("details"));
    assertThat(details).contains("partialScope=true", "otherHiddenExists=true");
    assertThat(details).noneMatch(detail -> detail.startsWith("other."));
    assertThat(String.join(";", details)).doesNotContain("70.00").doesNotContain("40.00");

    // Patron aynı ödemede tam tutarları görür.
    JsonNode full = check(w, null, "PAYMENT", body).get("warnings").get(0);
    assertThat(full.get("companyOutstanding").decimalValue()).isEqualByComparingTo("70");
    assertThat(full.get("excess").decimalValue()).isEqualByComparingTo("20");
    assertThat(full.get("others").get(0).get("outstanding").decimalValue())
        .isEqualByComparingTo("40");
    assertThat(full.get("partialScope").asBoolean()).isFalse();

    body.put("confirmWarnings", true);
    id(pay(w, limited, body, null));
  }

  @Test
  void turetilmisAkislarUyarisiz() throws Exception {
    World w = world("swe");
    // Sürücü avansı: personel carisinde borç yokken onaysız kayıt.
    String driver =
        id(
            sendJson(
                w.t(),
                null,
                post("/api/v1/fleet/drivers"),
                Map.of("code", "D1", "fullName", "Sürücü Bir", "status", "ACTIVE")));
    sendJson(
            w.t(),
            null,
            post("/api/v1/fleet/drivers/" + driver + "/advances"),
            Map.of(
                "branchId",
                w.a1(),
                "fundAccountId",
                w.fundA1(),
                "money",
                Map.of("amount", "25", "currency", "TRY"),
                "date",
                TODAY.toString()))
        .andExpect(status().isCreated());

    // Şirketler arası virman: GS carilerine borçsuz ödeme/tahsilat, onaysız.
    Map<String, Object> virman = new HashMap<>();
    virman.put("transferType", "CASH_TO_CASH");
    virman.put("reasonType", "DEBT_PAID");
    virman.put("fromFundId", w.fundA1());
    virman.put("toFundId", w.fundB1());
    virman.put("money", Map.of("amount", "15", "currency", "TRY"));
    virman.put("date", TODAY.toString());
    sendJson(w.t(), null, post(FINANCE + "/intercompany-transfers"), virman)
        .andExpect(status().isCreated());

    assertThat(settlementCount(w)).isEqualTo(3);
    assertThat(
            jdbc.queryForObject(
                ("select count(*) from \"%s\".audit_log"
                        + " where event_type = 'SETTLEMENT_ALLOCATION_OVERRIDE'")
                    .formatted(w.schema()),
                Long.class))
        .isZero();
  }

  // --- yardımcılar

  private static Map<String, Object> cash(UUID account, String branch, String fund, String amount) {
    Map<String, Object> body = new HashMap<>();
    body.put("method", "CASH");
    if (account != null) {
      body.put("accountId", account.toString());
    }
    body.put("branchId", branch);
    body.put("fundAccountId", fund);
    body.put("money", Map.of("amount", amount, "currency", "TRY"));
    body.put("date", TODAY.toString());
    return body;
  }

  private static MockHttpServletRequestBuilder checkRequest(String type) {
    return post(CHECK).param("type", type);
  }

  private JsonNode check(World w, String token, String type, Map<String, Object> body)
      throws Exception {
    return body(sendJson(w.t(), token, checkRequest(type), body).andExpect(status().isOk()));
  }

  private ResultActions pay(World w, String token, Map<String, Object> body, String key)
      throws Exception {
    MockHttpServletRequestBuilder request = post(FINANCE + "/payments");
    if (key != null) {
      request.header("Idempotency-Key", key);
    }
    return sendJson(w.t(), token, request, body);
  }

  private ResultActions collect(World w, Map<String, Object> body) throws Exception {
    return sendJson(w.t(), null, post(FINANCE + "/collections"), body);
  }

  private long settlementCount(World w) {
    return jdbc.queryForObject(
        "select count(*) from \"%s\".settlement".formatted(w.schema()), Long.class);
  }

  private long fundTransactionCount(World w, String fund) {
    return jdbc.queryForObject(
        "select count(*) from \"%s\".fund_transaction where fund_account_id = ?::uuid"
            .formatted(w.schema()),
        Long.class,
        fund);
  }

  private static List<String> texts(JsonNode array) {
    List<String> values = new ArrayList<>();
    array.forEach(node -> values.add(node.asText()));
    return values;
  }
}
