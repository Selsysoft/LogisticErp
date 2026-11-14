package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Şirketler arası virman (12.2_TASARIM §3.4, §6.2 IntercompanyTransferIT): A'da GS-B carisine ödeme
 * + B'de GS-A carisinden tahsilat, beş tür, uzun açıklama, sunucu anahtarları, kurallar,
 * idempotency, döviz bozumu kaynağı olan tahsilat, okuma/yazma kapsamı, tek başına iptal/void
 * engeli ve geri alma.
 */
class IntercompanyTransferIT extends AccountTestSupport {

  private static final String VIRMAN = FINANCE + "/intercompany-transfers";
  private static final String YEAR = String.valueOf(TODAY.getYear());

  @Test
  void besTurDefterEtkisiVeKurallar() throws Exception {
    World w = world("ict");
    String bankA = bank(w, "BA", w.a1(), "TRY", "10000", false);
    String bankB = bank(w, "BB", w.b1(), "TRY", null, false);
    UUID groupA = groupAccount(w, w.companyA());
    UUID groupB = groupAccount(w, w.companyB());

    JsonNode eft = created(w, vb("EFT", "DEBT_PAID", bankA, bankB, "100"), null);
    String id = eft.get("id").asText();
    assertThat(eft.get("code").asText()).isEqualTo("SVR-" + YEAR + "-000001");
    assertThat(eft.get("fromCompanyId").asText()).isEqualTo(w.companyA());
    assertThat(eft.get("toCompanyId").asText()).isEqualTo(w.companyB());
    assertThat(eft.get("reasonText").asText())
        .endsWith(
            "'YE BORCUNU ÖDÜYOR / Beta - "
                + shortName(w, w.companyA())
                + " 'TAN ALACAĞINI TAHSİL EDİYOR");
    assertThat(eft.get("description").isNull()).isTrue();
    Map<String, Object> payment = settlement(w, eft.get("paymentSettlementId").asText());
    Map<String, Object> collection = settlement(w, eft.get("collectionSettlementId").asText());
    assertThat(payment)
        .containsEntry("type", "PAYMENT")
        .containsEntry("method", "BANK")
        .containsEntry("account_id", groupB)
        .containsEntry("fund_account_id", UUID.fromString(bankA))
        .containsEntry("company_id", UUID.fromString(w.companyA()))
        .containsEntry("idempotency_key", "ict:" + id + ":P");
    assertThat(collection)
        .containsEntry("type", "COLLECTION")
        .containsEntry("account_id", groupA)
        .containsEntry("fund_account_id", UUID.fromString(bankB))
        .containsEntry("company_id", UUID.fromString(w.companyB()))
        .containsEntry("idempotency_key", "ict:" + id + ":C");
    assertThat(ledgerDirection(w, groupB, eft.get("paymentSettlementId").asText()))
        .isEqualTo("DEBIT");
    assertThat(ledgerDirection(w, groupA, eft.get("collectionSettlementId").asText()))
        .isEqualTo("CREDIT");
    assertThat(fundBalance(w, bankA)).isEqualByComparingTo("9900");
    assertThat(fundBalance(w, bankB)).isEqualByComparingTo("100");

    // Beş türün hepsi; tahsilat bacağının yöntemi hedef fonun türü (F9).
    created(w, vb("WIRE", "LOAN_GIVEN", bankA, bankB, "10"), null);
    JsonNode toCash = created(w, vb("BANK_TO_CASH", "DEBT_PAID", bankA, w.fundB1(), "10"), null);
    assertThat(settlement(w, toCash.get("collectionSettlementId").asText()))
        .containsEntry("method", "CASH");
    JsonNode toBank = created(w, vb("CASH_TO_BANK", "DEBT_PAID", w.fundA1(), bankB, "10"), null);
    assertThat(settlement(w, toBank.get("paymentSettlementId").asText()))
        .containsEntry("method", "CASH");
    assertThat(settlement(w, toBank.get("collectionSettlementId").asText()))
        .containsEntry("method", "BANK");
    JsonNode cashes =
        created(w, vb("CASH_TO_CASH", "LOAN_GIVEN", w.fundA1(), w.fundB1(), "10"), null);
    assertThat(cashes.get("reasonText").asText()).contains("'YE BORÇ VERİYOR");
    assertThat(cashes.get("code").asText()).isEqualTo("SVR-" + YEAR + "-000005");
    JsonNode fromB = created(w, vb("CASH_TO_CASH", "DEBT_PAID", w.fundB1(), w.fundA1(), "1"), null);
    assertThat(fromB.get("code").asText()).isEqualTo("SIR2-SVR-" + YEAR + "-000001");

    // Kurallar.
    virman(w, null, vb("VIREMENT", "DEBT_PAID", bankA, bankB, "1"), null)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("TRANSFER_RULE_VIOLATION"))
        .andExpect(jsonPath("$.details[0]").value("rule=VIREMENT_INTERCOMPANY"));
    virman(w, null, vb("EFT", "DEBT_PAID", bankA, w.fundB1(), "1"), null)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.details[0]").value("rule=KIND"));
    expect(
        virman(w, null, vb("BANK_TO_CASH", "DEBT_PAID", bankA, w.fundA1(), "1"), null),
        422,
        "INTERCOMPANY_SAME_COMPANY");
    String usdB = bank(w, "USDB", w.b1(), "USD", null, true);
    expect(
        virman(w, null, vb("EFT", "DEBT_PAID", bankA, usdB, "1"), null), 400, "CURRENCY_MISMATCH");

    // Idempotency.
    String first = created(w, vb("EFT", "DEBT_PAID", bankA, bankB, "3"), "K1").get("id").asText();
    assertThat(created(w, vb("EFT", "DEBT_PAID", bankA, bankB, "3"), "K1").get("id").asText())
        .isEqualTo(first);
    expect(
        virman(w, null, vb("EFT", "LOAN_GIVEN", bankA, bankB, "3"), "K1"),
        422,
        "IDEMPOTENCY_KEY_REUSED");

    // Liste: şirket süzgeci iki tarafa.
    JsonNode list = body(send(w.t(), null, range(get(VIRMAN))));
    assertThat(list.get("totalElements").asInt()).isEqualTo(7);
    JsonNode detail = body(send(w.t(), null, get(VIRMAN + "/" + id)).andExpect(status().isOk()));
    assertThat(detail.get("fromFundCode").asText()).isEqualTo("BA");
    assertThat(detail.get("toFundName").asText()).isEqualTo("BB Hesap");
  }

  @Test
  void tekSirketVePasifSirket() throws Exception {
    World w = world("ics");
    String bankA = bank(w, "BA", w.a1(), "TRY", "100", false);
    // Üçüncü şirket pasif: virman 422 COMPANY_INACTIVE.
    Map<String, Object> company = new HashMap<>();
    company.put("code", "SIR3");
    company.put("title", "Gama AS");
    company.put("shortName", "Gama");
    company.put("taxIdType", "VKN");
    String companyC = id(sendJson(w.t(), null, post("/api/v1/organization/companies"), company));
    String branchC =
        id(
            sendJson(
                w.t(),
                null,
                post("/api/v1/organization/branches"),
                Map.of("code", "C1", "name", "C1 Merkez", "companyId", companyC)));
    String bankC = bank(w, "BC", branchC, "TRY", null, true);
    jdbc.update(
        "update \"%s\".company set active = false where id = ?::uuid".formatted(w.schema()),
        companyC);
    expect(
        virman(w, null, vb("EFT", "DEBT_PAID", bankA, bankC, "1"), null), 422, "COMPANY_INACTIVE");

    // Tek aktif şirket kalınca 422 INTERCOMPANY_REQUIRES_COMPANIES.
    jdbc.update(
        "update \"%s\".company set active = false where id = ?::uuid".formatted(w.schema()),
        w.companyB());
    expect(
        virman(w, null, vb("CASH_TO_CASH", "DEBT_PAID", w.fundA1(), w.fundB1(), "1"), null),
        422,
        "INTERCOMPANY_REQUIRES_COMPANIES");
  }

  @Test
  void uzunAciklamaVeSunucuAnahtarlari() throws Exception {
    World w = world("icl");
    String longName = "Ş".repeat(100);
    jdbc.update("update \"%s\".company set short_name = ?".formatted(w.schema()), longName);
    String text = "a".repeat(500);
    Map<String, Object> request = vb("CASH_TO_CASH", "DEBT_PAID", w.fundA1(), w.fundB1(), "25");
    request.put("description", text);
    JsonNode transfer = created(w, request, null);
    assertThat(transfer.get("description").asText()).isEqualTo(text);
    String stored =
        jdbc.queryForObject(
            "select description from \"%s\".settlement where id = ?::uuid".formatted(w.schema()),
            String.class,
            transfer.get("paymentSettlementId").asText());
    assertThat(stored).hasSize(500).endsWith("...").startsWith(longName + " - " + longName);
    assertThat(
            jdbc.queryForObject(
                ("select max(length(description)) from \"%s\".fund_transaction where source_id"
                        + " in (?::uuid, ?::uuid)")
                    .formatted(w.schema()),
                Integer.class,
                transfer.get("paymentSettlementId").asText(),
                transfer.get("collectionSettlementId").asText()))
        .isEqualTo(500);
    assertThat(
            jdbc.queryForObject(
                "select description from \"%s\".intercompany_transfer where id = ?::uuid"
                    .formatted(w.schema()),
                String.class,
                transfer.get("id").asText()))
        .isEqualTo(text);

    // Sabotaj (SEC-12.2-03): kullanıcının "ict:K:P" anahtarlı ödemesi virmana bağlanamaz.
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    Map<String, Object> pay = new HashMap<>();
    pay.put("method", "CASH");
    pay.put("accountId", supplier.toString());
    pay.put("branchId", w.a1());
    pay.put("fundAccountId", w.fundA1());
    pay.put("money", money("1", "TRY"));
    pay.put("date", TODAY.toString());
    pay.put("confirmWarnings", true);
    MockHttpServletRequestBuilder sabotage = post(FINANCE + "/payments");
    sabotage.header("Idempotency-Key", "ict:K:P");
    // B4 bu anahtarı 400 IDEMPOTENCY_KEY_INVALID ile reddeder; reddedilmese de virman etkilenmez.
    assertThat(sendJson(w.t(), null, sabotage, pay).andReturn().getResponse().getStatus())
        .isIn(201, 400);
    JsonNode linked = created(w, vb("CASH_TO_CASH", "DEBT_PAID", w.fundA1(), w.fundB1(), "2"), "K");
    String linkedId = linked.get("id").asText();
    assertThat(settlement(w, linked.get("paymentSettlementId").asText()))
        .containsEntry("idempotency_key", "ict:" + linkedId + ":P");
    assertThat(settlement(w, linked.get("collectionSettlementId").asText()))
        .containsEntry("idempotency_key", "ict:" + linkedId + ":C");
    assertThat(
            jdbc.queryForObject(
                ("select count(*) from \"%s\".fund_transaction where source_type = 'SETTLEMENT'"
                        + " and source_id in (?::uuid, ?::uuid)")
                    .formatted(w.schema()),
                Long.class,
                linked.get("paymentSettlementId").asText(),
                linked.get("collectionSettlementId").asText()))
        .isEqualTo(2);
  }

  @Test
  void dovizBozumuKaynagiOlanTahsilatVirmanIptaliniEngeller() throws Exception {
    jdbc.update(
        "insert into admin.exchange_rate (id, currency, rate_date, rate, source, created_at)"
            + " values (gen_random_uuid(), 'AUD', ?, 20, 'TEST', now()) on conflict do nothing",
        LocalDate.of(2026, 1, 2));
    World w = world("icf");
    String audA = bank(w, "AUDA", w.a1(), "AUD", null, true);
    String audB = bank(w, "AUDB", w.b1(), "AUD", null, false);
    String tlB = bank(w, "TLB", w.b1(), "TRY", null, false);
    JsonNode transfer = created(w, vb("EFT", "DEBT_PAID", audA, audB, "100", "AUD"), null);
    String collection = transfer.get("collectionSettlementId").asText();

    Map<String, Object> fx = new HashMap<>();
    fx.put("transferType", "FX_EXCHANGE");
    fx.put("fromFundId", audB);
    fx.put("toFundId", tlB);
    fx.put("money", money("100", "AUD"));
    fx.put("targetMoney", money("2000", "TRY"));
    fx.put("rate", "20");
    fx.put("rateOperation", "MULTIPLY");
    fx.put("date", TODAY.toString());
    fx.put("sources", List.of(Map.of("kind", "SETTLEMENT", "id", collection, "usedAmount", "100")));
    String fxId = id(sendJson(w.t(), null, post(FINANCE + "/funds/transfers"), fx));

    long reversals = reversalCount(w);
    expect(
        reverse(w, null, transfer.get("id").asText(), TODAY),
        409,
        "SETTLEMENT_USED_IN_FX_EXCHANGE");
    assertThat(reversalCount(w)).isEqualTo(reversals);
    assertThat(settlement(w, collection)).containsEntry("status", "POSTED");
    assertThat(
            body(send(w.t(), null, get(VIRMAN + "/" + transfer.get("id").asText())))
                .get("status")
                .asText())
        .isEqualTo("POSTED");

    sendJson(
            w.t(),
            null,
            post(FINANCE + "/funds/transfers/" + fxId + "/reverse"),
            Map.of("date", TODAY.toString()))
        .andExpect(status().isOk());
    reverse(w, null, transfer.get("id").asText(), TODAY)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("REVERSED"));
    assertThat(settlement(w, collection)).containsEntry("status", "REVERSED");
  }

  @Test
  void kapsamTekBasinaIptalVoidVeGeriAlma() throws Exception {
    World w = world("icr");
    String bankA = bank(w, "BA", w.a1(), "TRY", "10000", false);
    String bankB = bank(w, "BB", w.b1(), "TRY", null, false);
    JsonNode transfer = created(w, vb("EFT", "DEBT_PAID", bankA, bankB, "100"), null);
    String id = transfer.get("id").asText();
    String payment = transfer.get("paymentSettlementId").asText();
    String code = transfer.get("code").asText();

    // Okuma kapsamı: yalnız B tarafını gören kullanıcı A fon adını görmez; iki taraf da dışında
    // 404.
    String b1User = limitedUser(w, "b1", "FINANCE", List.of(w.b1()));
    JsonNode list = body(send(w.t(), b1User, range(get(VIRMAN))));
    assertThat(list.get("content").findValuesAsText("id")).containsExactly(id);
    JsonNode row = list.get("content").get(0);
    assertThat(row.get("fromFundName").isNull()).isTrue();
    assertThat(row.get("fromBranchId").isNull()).isTrue();
    assertThat(row.get("toFundName").asText()).isEqualTo("BB Hesap");
    JsonNode detail = body(send(w.t(), b1User, get(VIRMAN + "/" + id)).andExpect(status().isOk()));
    assertThat(detail.get("fromFundCode").isNull()).isTrue();
    String a2User = limitedUser(w, "a2", "FINANCE", List.of(w.a2()));
    expect(send(w.t(), a2User, get(VIRMAN + "/" + id)), 404, "INTERCOMPANY_TRANSFER_NOT_FOUND");
    assertThat(body(send(w.t(), a2User, range(get(VIRMAN)))).get("totalElements").asInt()).isZero();
    expect(reverse(w, b1User, id, TODAY), 403, "BRANCH_OUT_OF_SCOPE");
    expect(
        virman(w, b1User, vb("EFT", "DEBT_PAID", bankB, bankA, "1"), null),
        403,
        "BRANCH_OUT_OF_SCOPE");

    // Bacak tek başına iptal edilemez; void ucu transfer merkezine yönlendirir.
    expect(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/settlements/" + payment + "/reverse"),
            Map.of("date", TODAY.toString())),
        409,
        "SETTLEMENT_LINKED_TO_INTERCOMPANY");
    String ledgerRow =
        jdbc.queryForObject(
            ("select id::text from \"%s\".account_transaction where source_type = 'SETTLEMENT'"
                    + " and source_id = ?::uuid")
                .formatted(w.schema()),
            String.class,
            payment);
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/accounts/transactions/" + ledgerRow + "/void"),
            Map.of("date", TODAY.toString()))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("TRANSACTION_SOURCE_MANAGED"))
        .andExpect(
            jsonPath("$.details[0]")
                .value(
                    "route=/zto-finans/transfer-merkezi?tab=transfers&q="
                        + code
                        + "&from="
                        + TODAY
                        + "&to="
                        + TODAY));
    send(w.t(), null, get(FINANCE + "/accounts/transactions/" + ledgerRow + "/source"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.label").value("Şirketler arası virman " + code));

    // B bakiyesi yetmezse geri alma 409 ve hiçbir şey değişmez.
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    Map<String, Object> pay = new HashMap<>();
    pay.put("method", "BANK");
    pay.put("accountId", supplier.toString());
    pay.put("branchId", w.b1());
    pay.put("fundAccountId", bankB);
    pay.put("money", money("60", "TRY"));
    pay.put("date", TODAY.toString());
    pay.put("confirmWarnings", true);
    id(sendJson(w.t(), null, post(FINANCE + "/payments"), pay));
    long reversals = reversalCount(w);
    expect(reverse(w, null, id, TODAY), 409, "INSUFFICIENT_FUNDS");
    assertThat(reversalCount(w)).isEqualTo(reversals);
    assertThat(settlement(w, payment)).containsEntry("status", "POSTED");
    expect(reverse(w, null, id, TODAY.minusDays(1)), 400, "REVERSE_BEFORE_TRANSFER");

    sendJson(
            w.t(),
            null,
            post(FINANCE + "/funds/" + bankB + "/transactions"),
            Map.of("direction", "IN", "money", money("100", "TRY"), "date", TODAY.toString()))
        .andExpect(status().isCreated());
    JsonNode reversed = body(reverse(w, null, id, TODAY).andExpect(status().isOk()));
    assertThat(reversed.get("status").asText()).isEqualTo("REVERSED");
    assertThat(reversed.get("reversedAt").asText()).isEqualTo(TODAY.toString());
    assertThat(settlement(w, payment)).containsEntry("status", "REVERSED");
    assertThat(settlement(w, transfer.get("collectionSettlementId").asText()))
        .containsEntry("status", "REVERSED");
    assertThat(fundBalance(w, bankA)).isEqualByComparingTo("10000");
    assertThat(reversalCount(w)).isEqualTo(reversals + 2);
    reverse(w, null, id, TODAY).andExpect(status().isOk());
    assertThat(reversalCount(w)).isEqualTo(reversals + 2);
  }

  // --- yardımcılar

  private String bank(
      World w, String code, String branch, String currency, String opening, boolean negative)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("code", code);
    body.put("name", code + " Hesap");
    body.put("kind", "BANK");
    body.put("currency", currency);
    body.put("branchId", branch);
    body.put("bankName", "Ziraat");
    body.put("allowNegative", negative);
    if (opening != null) {
      body.put("openingBalance", opening);
      body.put("openingDate", TODAY.minusDays(30).toString());
    }
    return id(sendJson(w.t(), null, post(FINANCE + "/funds"), body));
  }

  private static Map<String, Object> vb(
      String type, String reason, String from, String to, String amount) {
    return vb(type, reason, from, to, amount, "TRY");
  }

  private static Map<String, Object> vb(
      String type, String reason, String from, String to, String amount, String currency) {
    Map<String, Object> body = new HashMap<>();
    body.put("transferType", type);
    body.put("reasonType", reason);
    body.put("fromFundId", from);
    body.put("toFundId", to);
    body.put("money", money(amount, currency));
    body.put("date", TODAY.toString());
    return body;
  }

  private static Map<String, Object> money(String amount, String currency) {
    return Map.of("amount", amount, "currency", currency);
  }

  private ResultActions virman(World w, String token, Map<String, Object> body, String key)
      throws Exception {
    MockHttpServletRequestBuilder request =
        org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(VIRMAN);
    if (key != null) {
      request.header("Idempotency-Key", key);
    }
    return sendJson(w.t(), token, request, body);
  }

  private JsonNode created(World w, Map<String, Object> body, String key) throws Exception {
    return body(virman(w, null, body, key).andExpect(status().isCreated()));
  }

  private ResultActions reverse(World w, String token, String id, LocalDate date) throws Exception {
    return sendJson(
        w.t(),
        token,
        org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(
            VIRMAN + "/" + id + "/reverse"),
        Map.of("date", date.toString(), "reason", "Hatalı virman"));
  }

  private static MockHttpServletRequestBuilder range(MockHttpServletRequestBuilder request) {
    return request.param("from", TODAY.minusDays(1).toString()).param("to", TODAY.toString());
  }

  private UUID groupAccount(World w, String companyId) {
    return jdbc.queryForObject(
        "select id from \"%s\".account where represents_company_id = ?::uuid".formatted(w.schema()),
        UUID.class,
        companyId);
  }

  private String shortName(World w, String companyId) {
    return jdbc.queryForObject(
        "select coalesce(nullif(short_name, ''), code) from \"%s\".company where id = ?::uuid"
            .formatted(w.schema()),
        String.class,
        companyId);
  }

  private Map<String, Object> settlement(World w, String id) {
    Map<String, Object> row =
        jdbc.queryForMap(
            "select * from \"%s\".settlement where id = ?::uuid".formatted(w.schema()), id);
    row.replaceAll((k, v) -> v instanceof String s ? s.trim() : v);
    return row;
  }

  private String ledgerDirection(World w, UUID account, String settlementId) {
    return jdbc.queryForObject(
        ("select direction from \"%s\".account_transaction where account_id = ?"
                + " and source_type = 'SETTLEMENT' and source_id = ?::uuid")
            .formatted(w.schema()),
        String.class,
        account,
        settlementId);
  }

  private BigDecimal fundBalance(World w, String fund) {
    return jdbc.queryForObject(
        ("select coalesce(sum(case when direction = 'IN' then amount else -amount end), 0)"
                + " from \"%s\".fund_transaction where fund_account_id = ?::uuid"
                + " and deleted = false")
            .formatted(w.schema()),
        BigDecimal.class,
        fund);
  }

  private long reversalCount(World w) {
    return jdbc.queryForObject(
        "select count(*) from \"%s\".fund_transaction where source_type = 'REVERSAL'"
            .formatted(w.schema()),
        Long.class);
  }
}
