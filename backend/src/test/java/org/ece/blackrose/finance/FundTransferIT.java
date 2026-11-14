package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Transfer merkezi (12.2_TASARIM §3.3, §6.2 FundTransferIT): türler ve ZTO kuralları, kod serisi,
 * eski gövde, döviz bozumu (kur denetimi, kur farkı, masraflar, kaynaklar, zincir), kur tablosu
 * boşken bozum, iptal/düzenleme tarih kuralları, idempotency, okuma/yazma kapsamı ve yarışlar.
 */
class FundTransferIT extends AccountTestSupport {

  private static final String TRANSFERS = FINANCE + "/funds/transfers";
  private static final String YEAR = String.valueOf(TODAY.getYear());
  private static final LocalDate RATE_DATE = LocalDate.of(2026, 1, 2);
  private static final LocalDate OPENING = TODAY.minusDays(60);

  @Test
  void turlerKodlarKurallarVeListe() throws Exception {
    World w = world("ftr");
    String z1 = bank(w, "Z1", w.a1(), "Ziraat", "TRY", "10000");
    String z2 = bank(w, "Z2", w.a1(), "Ziraat", "TRY", null);
    String g1 = bank(w, "G1", w.a1(), "Garanti", "TRY", null);
    String za2 = bank(w, "ZA2", w.a2(), "Ziraat", "TRY", null);
    String bankB = bank(w, "BB", w.b1(), "Ziraat", "TRY", null);

    JsonNode virman = created(w, null, tb("VIREMENT", z1, z2, "100", "TRY", TODAY), null);
    assertThat(virman.get("code").asText()).isEqualTo("VRM-" + YEAR + "-000001");
    assertThat(virman.get("transferType").asText()).isEqualTo("VIREMENT");
    assertThat(virman.get("transferId").asText()).isEqualTo(virman.get("id").asText());
    assertThat(virman.get("fromFundCode").asText()).isEqualTo("Z1");
    assertThat(virman.get("status").asText()).isEqualTo("POSTED");
    assertThat(legs(w, "FUND_TRANSFER", virman.get("id").asText())).isEqualTo(2);
    assertThat(
            jdbc.queryForObject(
                ("select description from \"%s\".fund_transaction where source_id = ?::uuid"
                        + " and direction = 'OUT'")
                    .formatted(w.schema()),
                String.class,
                virman.get("id").asText()))
        .isEqualTo("Virman VRM-" + YEAR + "-000001");

    rule(w, tb("VIREMENT", z1, g1, "1", "TRY", TODAY), "SAME_BANK");
    rule(w, tb("VIREMENT", z1, za2, "1", "TRY", TODAY), "SAME_WORKPLACE");
    rule(w, tb("VIREMENT", z1, w.fundA1(), "1", "TRY", TODAY), "KIND");
    rule(w, tb("EFT", z1, z2, "1", "TRY", TODAY), "SAME_BANK_SAME_WORKPLACE");
    rule(w, tb("BANK_TO_CASH", w.fundA1(), z1, "1", "TRY", TODAY), "KIND");

    created(w, null, tb("EFT", z1, g1, "200", "TRY", TODAY), null);
    created(w, null, tb("WIRE", z1, za2, "300", "TRY", TODAY), null);
    created(w, null, tb("BANK_TO_CASH", z1, w.fundA1(), "400", "TRY", TODAY), null);
    created(w, null, tb("CASH_TO_BANK", w.fundA1(), z1, "50", "TRY", TODAY), null);
    created(w, null, tb("CASH_TO_CASH", w.fundA1(), w.fundA2(), "60", "TRY", TODAY), null);

    // Eski MUI gövdesi: tür hesap türlerinden, ZTO kuralları yok.
    Map<String, Object> legacy = tb(null, z1, w.fundA1(), "10", "TRY", TODAY);
    JsonNode legacyRow = created(w, null, legacy, null);
    assertThat(legacyRow.get("transferType").asText()).isEqualTo("BANK_TO_CASH");
    assertThat(legacyRow.get("code").asText()).isEqualTo("VRM-" + YEAR + "-000007");

    // İkinci şirketin kendi serisi.
    JsonNode inB = created(w, null, tb("CASH_TO_BANK", w.fundB1(), bankB, "5", "TRY", TODAY), null);
    assertThat(inB.get("code").asText()).isEqualTo("SIR2-VRM-" + YEAR + "-000001");
    assertThat(inB.get("companyId").asText()).isEqualTo(w.companyB());

    expect(
        transfer(w, null, tb("EFT", z1, bankB, "1", "TRY", TODAY), null), 422, "COMPANY_MISMATCH");
    expect(
        transfer(w, null, tb("EFT", z1, z1, "1", "TRY", TODAY), null), 400, "TRANSFER_SAME_FUND");

    // Yetersiz bakiye: hiçbir şey yazılmaz.
    long before = count(w, "fund_transfer");
    expect(
        transfer(w, null, tb("EFT", z2, g1, "500", "TRY", TODAY), null), 409, "INSUFFICIENT_FUNDS");
    assertThat(count(w, "fund_transfer")).isEqualTo(before);

    // Pasif hesap.
    sendJson(w.t(), null, patch(FINANCE + "/funds/" + g1 + "/active"), Map.of("active", false))
        .andExpect(status().isOk());
    expect(transfer(w, null, tb("EFT", z1, g1, "1", "TRY", TODAY), null), 422, "FUND_INACTIVE");

    // Şirketler arası virman listede INTERCOMPANY satırı.
    Map<String, Object> ic = new HashMap<>();
    ic.put("transferType", "CASH_TO_CASH");
    ic.put("reasonType", "DEBT_PAID");
    ic.put("fromFundId", w.fundA1());
    ic.put("toFundId", w.fundB1());
    ic.put("money", money("7", "TRY"));
    ic.put("date", TODAY.toString());
    id(sendJson(w.t(), null, post(FINANCE + "/intercompany-transfers"), ic));

    JsonNode list = body(send(w.t(), null, range(get(TRANSFERS)).param("size", "50")));
    assertThat(list.get("totalElements").asInt()).isEqualTo(9);
    assertThat(list.get("content").findValuesAsText("recordType")).contains("INTERCOMPANY");
    JsonNode onlyB =
        body(send(w.t(), null, range(get(TRANSFERS)).param("companyId", w.companyB())));
    assertThat(onlyB.get("content").findValuesAsText("code"))
        .hasSize(2)
        .contains("SIR2-VRM-" + YEAR + "-000001");
    JsonNode onlyIc =
        body(send(w.t(), null, range(get(TRANSFERS)).param("transferType", "INTERCOMPANY")));
    assertThat(onlyIc.get("totalElements").asInt()).isEqualTo(1);
    JsonNode byCode =
        body(send(w.t(), null, range(get(TRANSFERS)).param("q", "vrm-" + YEAR + "-000002")));
    assertThat(byCode.get("content").findValuesAsText("transferType")).containsExactly("EFT");

    Map<String, JsonNode> summary = new HashMap<>();
    for (JsonNode row : body(send(w.t(), null, range(get(TRANSFERS + "/summary"))))) {
      summary.put(row.get("group").asText(), row);
    }
    assertThat(summary.get("VIREMENT_EFT_WIRE").get("count").asInt()).isEqualTo(3);
    assertThat(summary.get("VIREMENT_EFT_WIRE").get("amounts").get(0).get("amount").decimalValue())
        .isEqualByComparingTo("600");
    assertThat(summary.get("BANK_TO_CASH").get("count").asInt()).isEqualTo(2);
    assertThat(summary.get("INTERCOMPANY").get("count").asInt()).isEqualTo(1);
    assertThat(summary.get("FX_EXCHANGE").get("count").asInt()).isZero();
    assertThat(summary.get("TOTAL").get("count").asInt()).isEqualTo(9);
    expect(
        send(
            w.t(),
            null,
            get(TRANSFERS)
                .param("from", TODAY.minusDays(400).toString())
                .param("to", TODAY.toString())),
        400,
        "DATE_RANGE_TOO_LARGE");
    expect(send(w.t(), null, range(get(TRANSFERS)).param("size", "201")), 400, "PAGE_SIZE_INVALID");
  }

  @Test
  void dovizBozumuKurMasrafKaynakZincirVeIptal() throws Exception {
    rate("AUD", "20");
    rate("CAD", "25");
    World w = world("ffx");
    String tl = bank(w, "TL1", w.a1(), "Ziraat", "TRY", "10000");
    String aud = bank(w, "AUD1", w.a2(), "Ziraat", "AUD", null);
    String cad = bank(w, "CAD1", w.a1(), "Garanti", "CAD", null);
    UUID customer = account(w, AccountType.CUSTOMER, null);
    String collection = collect(w, customer, w.a2(), aud, "100", "AUD", "Müşteri tahsilatı");

    // AUD → TRY: kullanıcı kuru 21, TCMB 20 → kur farkı geliri 50; komisyon TL bankadan, KMV TL'de.
    Map<String, Object> fx = fxBody(aud, tl, "50", "AUD", "1050", "TRY", "21", "MULTIPLY");
    fx.put("sources", List.of(Map.of("kind", "SETTLEMENT", "id", collection, "usedAmount", "50")));
    fx.put(
        "costs",
        List.of(
            Map.of("kind", "COMMISSION", "fundAccountId", tl, "amount", "5"),
            Map.of("kind", "KMV", "ratePercent", "0.2")));
    JsonNode fx1 = created(w, null, fx, null);
    String fx1Id = fx1.get("id").asText();
    assertThat(fx1.get("fxDiffTl").decimalValue()).isEqualByComparingTo("50");
    assertThat(new BigDecimal(fx1.get("targetMoney").get("amount").asText()))
        .isEqualByComparingTo("1050");
    assertThat(fx1.get("costs")).hasSize(2);
    assertThat(fx1.get("costs").findValuesAsText("kind"))
        .containsExactlyInAnyOrder("COMMISSION", "KMV");
    for (JsonNode cost : fx1.get("costs")) {
      assertThat(cost.get("fundAccountId").asText()).isEqualTo(tl);
      if ("KMV".equals(cost.get("kind").asText())) {
        assertThat(new BigDecimal(cost.get("money").get("amount").asText()))
            .isEqualByComparingTo("2.10");
        assertThat(cost.get("baseAmount").decimalValue()).isEqualByComparingTo("1050");
      }
    }
    assertThat(fx1.get("sources").get(0).get("usedAmount").decimalValue())
        .isEqualByComparingTo("50");
    assertThat(fx1.get("sources").get(0).get("amount").decimalValue()).isEqualByComparingTo("100");
    assertThat(tlAmount(w, fx1Id, aud)).isEqualByComparingTo("1000");
    assertThat(tlAmount(w, fx1Id, tl)).isEqualByComparingTo("1050");
    assertThat(incomeExpense(w, "FX_DIFF", "INCOME")).isEqualByComparingTo("50");
    assertThat(incomeExpense(w, "BANK_CHARGE", "EXPENSE")).isEqualByComparingTo("7.10");
    assertThat(
            jdbc.queryForObject(
                ("select count(*) from \"%s\".fund_transaction where source_type ="
                        + " 'FUND_TRANSFER_COST' and category in ('COMMISSION', 'KMV')")
                    .formatted(w.schema()),
                Long.class))
        .isEqualTo(2);

    // Kur denetimi, kaynak aşımı, kaynak yalnız bozumda.
    expect(
        transfer(w, null, fxBody(aud, tl, "50", "AUD", "1000", "TRY", "21", "MULTIPLY"), null),
        422,
        "FX_AMOUNT_MISMATCH");
    Map<String, Object> noRate = fxBody(aud, tl, "50", "AUD", "1050", "TRY", null, null);
    expect(transfer(w, null, noRate, null), 400, "RATE_REQUIRED");
    Map<String, Object> over = fxBody(aud, tl, "60", "AUD", "1260", "TRY", "21", "MULTIPLY");
    over.put(
        "sources", List.of(Map.of("kind", "SETTLEMENT", "id", collection, "usedAmount", "60")));
    transfer(w, null, over, null)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("FX_SOURCE_EXCEEDED"))
        .andExpect(jsonPath("$.details[1]").value("max=50.00"));
    Map<String, Object> overTotal = fxBody(aud, tl, "20", "AUD", "420", "TRY", "21", "MULTIPLY");
    overTotal.put(
        "sources", List.of(Map.of("kind", "SETTLEMENT", "id", collection, "usedAmount", "30")));
    expect(transfer(w, null, overTotal, null), 422, "FX_SOURCE_EXCEEDED");
    Map<String, Object> eft = tb("BANK_TO_CASH", tl, w.fundA1(), "1", "TRY", TODAY);
    eft.put("sources", List.of(Map.of("kind", "SETTLEMENT", "id", collection, "usedAmount", "1")));
    expect(transfer(w, null, eft, null), 400, "SOURCES_NOT_ALLOWED");
    Map<String, Object> noTry = fxBody(aud, cad, "10", "AUD", "8", "CAD", "0.8", "MULTIPLY");
    noTry.put("costs", List.of(Map.of("kind", "KMV", "ratePercent", "0.2")));
    expect(transfer(w, null, noTry, null), 422, "KMV_REQUIRES_TRY");

    // TRY → AUD (÷): kur farkı gideri 10; sonra bu bozumdan zincir.
    JsonNode fx2 =
        created(w, null, fxBody(tl, aud, "210", "TRY", "10", "AUD", "21", "DIVIDE"), null);
    String fx2Id = fx2.get("id").asText();
    assertThat(fx2.get("fxDiffTl").decimalValue()).isEqualByComparingTo("-10");
    assertThat(incomeExpense(w, "FX_DIFF", "EXPENSE")).isEqualByComparingTo("10");
    JsonNode sources =
        body(
            send(
                w.t(),
                null,
                get(TRANSFERS + "/fx-sources").param("fundId", aud).param("currency", "AUD")));
    assertThat(sources.findValuesAsText("transferId")).containsExactly(fx2Id);
    assertThat(sources.get(0).get("remaining").decimalValue()).isEqualByComparingTo("10");
    Map<String, Object> chained = fxBody(aud, tl, "10", "AUD", "210", "TRY", "21", "MULTIPLY");
    chained.put("sources", List.of(Map.of("kind", "TRANSFER", "id", fx2Id, "usedAmount", "10")));
    JsonNode fx3 = created(w, null, chained, null);
    assertThat(fx3.get("sources").get(0).get("code").asText()).isEqualTo(fx2.get("code").asText());
    assertThat(
            body(
                send(
                    w.t(),
                    null,
                    get(TRANSFERS + "/fx-sources").param("fundId", aud).param("currency", "AUD"))))
        .isEmpty();
    JsonNode dependents = body(send(w.t(), null, get(TRANSFERS + "/" + fx2Id + "/dependents")));
    assertThat(dependents.findValuesAsText("code")).containsExactly(fx3.get("code").asText());
    sendJson(
            w.t(),
            null,
            post(TRANSFERS + "/" + fx2Id + "/reverse"),
            Map.of("date", TODAY.toString()))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("TRANSFER_HAS_DEPENDENTS"))
        .andExpect(jsonPath("$.details[0]").value("dependent=" + fx3.get("code").asText()));

    // Aday tahsilatlar ve kaynak tahsilatın iptali engeli.
    JsonNode accounts =
        body(
            send(
                w.t(),
                null,
                get(TRANSFERS + "/fx-collection-candidates")
                    .param("fundId", aud)
                    .param("currency", "AUD")));
    assertThat(accounts.findValuesAsText("accountId")).containsExactly(customer.toString());
    assertThat(accounts.get(0).get("remainingTotal").decimalValue()).isEqualByComparingTo("50");
    JsonNode collections =
        body(
            send(
                w.t(),
                null,
                get(TRANSFERS + "/fx-collection-candidates")
                    .param("fundId", aud)
                    .param("currency", "AUD")
                    .param("accountId", customer.toString())));
    assertThat(collections.get(0).get("broken").decimalValue()).isEqualByComparingTo("50");
    assertThat(collections.get(0).get("remaining").decimalValue()).isEqualByComparingTo("50");
    expect(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/settlements/" + collection + "/reverse"),
            Map.of("date", TODAY.toString())),
        409,
        "SETTLEMENT_USED_IN_FX_EXCHANGE");

    // Döviz bozum raporu: zincir derinliği ve istatistik.
    JsonNode report =
        body(
            send(
                w.t(),
                null,
                get(TRANSFERS + "/fx-report")
                    .param("from", TODAY.minusDays(1).toString())
                    .param("to", TODAY.toString())));
    Map<String, Integer> levels = new HashMap<>();
    report
        .get("rows")
        .forEach(r -> levels.put(r.get("transferId").asText(), r.get("level").asInt()));
    assertThat(levels).containsEntry(fx1Id, 1).containsEntry(fx3.get("id").asText(), 2);
    assertThat(report.get("stats").get("fxCount").asInt()).isEqualTo(3);
    assertThat(report.get("stats").get("collectionCount").asInt()).isEqualTo(1);
    assertThat(report.get("stats").get("fxWithoutCollection").asInt()).isEqualTo(2);

    // Liste: bağlı tahsilat durumu.
    JsonNode listed =
        body(send(w.t(), null, range(get(TRANSFERS)).param("transferType", "FX_EXCHANGE")));
    for (JsonNode row : listed.get("content")) {
      if (fx1Id.equals(row.get("id").asText())) {
        assertThat(row.get("collection").get("state").asText()).isEqualTo("PARTIAL");
        assertThat(row.get("collection").get("accountId").asText()).isEqualTo(customer.toString());
        assertThat(row.get("costTotalTl").decimalValue()).isEqualByComparingTo("7.10");
      }
    }

    // İptal: bacaklar + masraflar + gelir/gider ters; ikinci çağrı yeni kayıt üretmez.
    long reversals = reversalCount(w);
    JsonNode reversed =
        body(
            sendJson(
                    w.t(),
                    null,
                    post(TRANSFERS + "/" + fx1Id + "/reverse"),
                    Map.of("date", TODAY.toString(), "reason", "Hatalı"))
                .andExpect(status().isOk()));
    assertThat(reversed.get("status").asText()).isEqualTo("REVERSED");
    assertThat(reversed.get("reversalReason").asText()).isEqualTo("Hatalı");
    assertThat(reversalCount(w)).isEqualTo(reversals + 4);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from \"%s\".fin_income_expense where source_type = 'REVERSAL'"
                    .formatted(w.schema()),
                Long.class))
        .isEqualTo(3);
    sendJson(
            w.t(),
            null,
            post(TRANSFERS + "/" + fx1Id + "/reverse"),
            Map.of("date", TODAY.toString()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("REVERSED"));
    assertThat(reversalCount(w)).isEqualTo(reversals + 4);
    JsonNode cancelled = body(send(w.t(), null, range(get(TRANSFERS)).param("status", "REVERSED")));
    assertThat(cancelled.get("content").get(0).get("collection").get("state").asText())
        .isEqualTo("CANCELLED");
    // Bozum iptal edilince kaynak tahsilat iptal edilebilir.
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/settlements/" + collection + "/reverse"),
            Map.of("date", TODAY.toString()))
        .andExpect(status().isOk());
  }

  @Test
  void kurTablosuBoskenBozum() throws Exception {
    World w = world("fnr");
    String tl = bank(w, "TL1", w.a1(), "Ziraat", "TRY", "10000");
    String nok = negativeBank(w, "NOK1", w.a1(), "NOK");
    String sek = negativeBank(w, "SEK1", w.a2(), "SEK");

    JsonNode fx =
        created(w, null, fxBody(tl, nok, "1000", "TRY", "100", "NOK", "10", "DIVIDE"), null);
    assertThat(fx.get("fxDiffTl").decimalValue()).isZero();
    Map<String, Object> leg =
        jdbc.queryForMap(
            ("select exchange_rate, tl_amount from \"%s\".fund_transaction where source_id = ?::uuid"
                    + " and fund_account_id = ?::uuid")
                .formatted(w.schema()),
            fx.get("id").asText(),
            nok);
    assertThat((BigDecimal) leg.get("exchange_rate")).isEqualByComparingTo("10");
    assertThat((BigDecimal) leg.get("tl_amount")).isEqualByComparingTo("1000");
    assertThat(count(w, "fin_income_expense")).isZero();

    long transfers = count(w, "fund_transfer");
    long legs = count(w, "fund_transaction");
    expect(
        transfer(w, null, fxBody(nok, sek, "10", "NOK", "10", "SEK", "1", "MULTIPLY"), null),
        422,
        "RATE_MISSING");
    assertThat(count(w, "fund_transfer")).isEqualTo(transfers);
    assertThat(count(w, "fund_transaction")).isEqualTo(legs);
  }

  @Test
  void ileriTarihliIptalVeEskiTarihliDuzenleme() throws Exception {
    World w = world("fdt");
    String a = bank(w, "A1", w.a1(), "Ziraat", "TRY", "10000");
    String b = bank(w, "G1", w.a1(), "Garanti", "TRY", null);
    LocalDate future = TODAY.plusDays(6);

    String t1 = created(w, null, tb("EFT", a, b, "100", "TRY", future), null).get("id").asText();
    expect(reverse(w, t1, TODAY), 400, "REVERSE_BEFORE_TRANSFER");
    expect(reverse(w, t1, future.plusDays(1)), 400, "DATE_IN_FUTURE");
    reverse(w, t1, future)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("REVERSED"));
    expect(replace(w, t1, tb("EFT", a, b, "1", "TRY", future)), 409, "TRANSFER_REVERSED");

    JsonNode t2 = created(w, null, tb("EFT", a, b, "50", "TRY", future), null);
    JsonNode replaced =
        body(
            replace(w, t2.get("id").asText(), tb("EFT", a, b, "60", "TRY", future))
                .andExpect(status().isCreated()));
    assertThat(replaced.get("replacesTransferId").asText()).isEqualTo(t2.get("id").asText());
    assertThat(replaced.get("code").asText()).isNotEqualTo(t2.get("code").asText());
    JsonNode old = body(send(w.t(), null, get(TRANSFERS + "/" + t2.get("id").asText())));
    assertThat(old.get("status").asText()).isEqualTo("REVERSED");
    assertThat(old.get("replacedByTransferId").asText()).isEqualTo(replaced.get("id").asText());

    // Hareket merkezi yönlendirmesi aynı tarih aralığına tabi.
    String t3 = created(w, null, tb("EFT", a, b, "70", "TRY", future), null).get("id").asText();
    String leg = legOf(w, t3, a);
    expect(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/funds/transactions/" + leg + "/reverse"),
            Map.of("date", TODAY.toString())),
        400,
        "REVERSE_BEFORE_TRANSFER");
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/funds/transactions/" + leg + "/reverse"),
            Map.of("date", future.toString()))
        .andExpect(status().isOk());
    assertThat(body(send(w.t(), null, get(TRANSFERS + "/" + t3))).get("status").asText())
        .isEqualTo("REVERSED");

    // Geçmiş tarihli düzeltme: eski bacaklar eski tarihle ters, ara tarih bakiyesi yalnız yeniyi
    // yansıtır.
    LocalDate past = TODAY.minusDays(44);
    JsonNode p = created(w, null, tb("EFT", a, b, "1000", "TRY", past), null);
    String pastLeg = legOf(w, p.get("id").asText(), a);
    replace(w, p.get("id").asText(), tb("EFT", a, b, "1100", "TRY", past))
        .andExpect(status().isCreated());
    assertThat(
            jdbc.queryForObject(
                ("select transaction_date from \"%s\".fund_transaction where source_type ="
                        + " 'REVERSAL' and source_id = ?::uuid")
                    .formatted(w.schema()),
                LocalDate.class,
                pastLeg))
        .isEqualTo(past);
    assertThat(balanceAsOf(w, a, TODAY.minusDays(30))).isEqualByComparingTo("8900");
    assertThat(balanceAsOf(w, b, TODAY.minusDays(30))).isEqualByComparingTo("1100");
  }

  @Test
  void idempotencyVeYarislar() throws Exception {
    World w = world("fid");
    String a = bank(w, "A1", w.a1(), "Ziraat", "TRY", "10000");
    String b = bank(w, "G1", w.a1(), "Garanti", "TRY", "10000");
    String c = bank(w, "C2", w.a2(), "Ziraat", "TRY", null);

    String first = created(w, null, tb("EFT", a, b, "100", "TRY", TODAY), "K1").get("id").asText();
    assertThat(created(w, null, tb("EFT", a, b, "100", "TRY", TODAY), "K1").get("id").asText())
        .isEqualTo(first);
    assertThat(legs(w, "FUND_TRANSFER", first)).isEqualTo(2);
    expect(
        transfer(w, null, tb("EFT", a, b, "101", "TRY", TODAY), "K1"),
        422,
        "IDEMPOTENCY_KEY_REUSED");
    expect(
        transfer(w, null, tb("WIRE", a, b, "100", "TRY", TODAY), "K1"),
        422,
        "IDEMPOTENCY_KEY_REUSED");

    // Aynı anahtarla eşzamanlı iki istek: tek transfer, 500 yok.
    Map<String, Object> same = tb("EFT", a, b, "10", "TRY", TODAY);
    List<ResultActions> results =
        concurrently(() -> transfer(w, null, same, "K2"), () -> transfer(w, null, same, "K2"));
    Set<String> ids = new HashSet<>();
    for (ResultActions result : results) {
      int code = result.andReturn().getResponse().getStatus();
      assertThat(code).isIn(201, 409);
      if (code == 201) {
        ids.add(body(result).get("id").asText());
      }
    }
    assertThat(ids).hasSize(1);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from \"%s\".fund_transfer where idempotency_key = 'K2'"
                    .formatted(w.schema()),
                Long.class))
        .isEqualTo(1);

    // Karşılıklı iki transfer kilitlenmez.
    List<Integer> mutual =
        concurrently(
            () -> code(transfer(w, null, tb("EFT", a, b, "5", "TRY", TODAY), null)),
            () -> code(transfer(w, null, tb("EFT", b, a, "5", "TRY", TODAY), null)));
    assertThat(mutual).containsExactly(201, 201);

    // LIMITED tekrar: hedef fon kapsam dışıysa tekrar da 403.
    created(w, null, tb("WIRE", a, c, "1", "TRY", TODAY), "K3");
    String a1User = limitedUser(w, "a1", "FINANCE", List.of(w.a1()));
    expect(
        transfer(w, a1User, tb("WIRE", a, c, "1", "TRY", TODAY), "K3"), 403, "BRANCH_OUT_OF_SCOPE");
  }

  @Test
  void okumaVeYazmaKapsami() throws Exception {
    World w = world("fsc");
    String a = bank(w, "A1", w.a1(), "Ziraat", "TRY", "10000");
    String d = bank(w, "D1", w.a1(), "Garanti", "TRY", null);
    String c = bank(w, "C2", w.a2(), "Ziraat", "TRY", null);
    String cross = created(w, null, tb("WIRE", a, c, "100", "TRY", TODAY), null).get("id").asText();
    String local = created(w, null, tb("EFT", a, d, "10", "TRY", TODAY), null).get("id").asText();
    String a2User = limitedUser(w, "a2", "FINANCE", List.of(w.a2()));

    // İş yeri süzgeci iki taraftan birine uygulanır; tüm kapsamlı kullanıcıya adlar gizlenmez.
    JsonNode filtered = body(send(w.t(), null, range(get(TRANSFERS)).param("branchId", w.a2())));
    assertThat(filtered.get("content").findValuesAsText("id")).containsExactly(cross);
    assertThat(filtered.get("content").get(0).get("fromFundName").asText()).isEqualTo("A1 Hesap");

    JsonNode list = body(send(w.t(), a2User, range(get(TRANSFERS))));
    assertThat(list.get("content").findValuesAsText("id")).containsExactly(cross);
    JsonNode row = list.get("content").get(0);
    assertThat(row.get("fromFundName").isNull()).isTrue();
    assertThat(row.get("fromBranchId").isNull()).isTrue();
    assertThat(row.get("toFundName").asText()).isEqualTo("C2 Hesap");
    JsonNode detail =
        body(send(w.t(), a2User, get(TRANSFERS + "/" + cross)).andExpect(status().isOk()));
    assertThat(detail.get("fromFundCode").isNull()).isTrue();
    assertThat(detail.get("toFundCode").asText()).isEqualTo("C2");
    send(w.t(), a2User, get(TRANSFERS + "/" + cross + "/dependents")).andExpect(status().isOk());
    expect(send(w.t(), a2User, get(TRANSFERS + "/" + local)), 404, "TRANSFER_NOT_FOUND");
    expect(
        send(w.t(), a2User, get(TRANSFERS + "/" + local + "/dependents")),
        404,
        "TRANSFER_NOT_FOUND");
    expect(reverse(w, a2User, cross, TODAY), 403, "BRANCH_OUT_OF_SCOPE");
    expect(reverse(w, a2User, local, TODAY), 404, "TRANSFER_NOT_FOUND");
    expect(
        transfer(w, a2User, tb("WIRE", c, a, "1", "TRY", TODAY), null), 403, "BRANCH_OUT_OF_SCOPE");
    expect(
        send(
            w.t(),
            a2User,
            get(TRANSFERS + "/fx-sources").param("fundId", a).param("currency", "TRY")),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        send(
            w.t(),
            a2User,
            get(TRANSFERS + "/fx-collection-candidates")
                .param("fundId", a)
                .param("currency", "TRY")),
        403,
        "BRANCH_OUT_OF_SCOPE");
  }

  /**
   * SEC-1 / T-12.2-05: yazma yolları (transfer iptali, düzenleme, hareket merkezinden bacak ya da
   * masraf iptali) transferin dokunduğu her fonun kapsamda olmasını ister; masraf bacağı iptali
   * bütün transferi transferin tarih kuralıyla iptal eder.
   */
  @Test
  void masrafFonuKapsamiVeMasrafBacagiIptali() throws Exception {
    World w = world("fcs");
    String a = bank(w, "A1", w.a1(), "Ziraat", "TRY", "10000");
    String b = bank(w, "G1", w.a1(), "Garanti", "TRY", null);
    String c = bank(w, "C2", w.a2(), "Ziraat", "TRY", "1000");
    String d = bank(w, "D2", w.a2(), "Garanti", "TRY", null);
    Map<String, Object> body = tb("EFT", a, b, "100", "TRY", TODAY);
    body.put("costs", List.of(Map.of("kind", "COMMISSION", "fundAccountId", c, "amount", "5")));
    String t1 = created(w, null, body, null).get("id").asText();
    String costTx = costLegOf(w, t1);
    String legA = legOf(w, t1, a);
    long cTx = fundTxCount(w, c);
    long reversals = reversalCount(w);

    // a1'e sınırlı kullanıcı kaynak ve hedefi görür, masraf fonunu görmez: her yazma yolu 403.
    String a1User = limitedUser(w, "a1", "FINANCE", List.of(w.a1()));
    expect(reverse(w, a1User, t1, TODAY), 403, "BRANCH_OUT_OF_SCOPE");
    expect(
        sendJson(
            w.t(),
            a1User,
            post(TRANSFERS + "/" + t1 + "/replace"),
            Map.of("transfer", tb("EFT", a, b, "90", "TRY", TODAY))),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(reverseTx(w, a1User, legA, TODAY), 403, "BRANCH_OUT_OF_SCOPE");

    // a2'ye sınırlı kullanıcı yalnız masraf fonunu görür: transfer görünmez, 404.
    String a2User = limitedUser(w, "a2", "FINANCE", List.of(w.a2()));
    expect(reverseTx(w, a2User, costTx, TODAY), 404, "TRANSFER_NOT_FOUND");
    assertThat(body(send(w.t(), null, get(TRANSFERS + "/" + t1))).get("status").asText())
        .isEqualTo("POSTED");
    assertThat(fundTxCount(w, c)).isEqualTo(cTx);
    assertThat(reversalCount(w)).isEqualTo(reversals);
    assertThat(balanceAsOf(w, c, TODAY)).isEqualByComparingTo("995");

    // Tam kullanıcı masraf bacağından iptal eder: bütün transfer ve masraf ters, bakiyeler geri.
    reverseTx(w, null, costTx, TODAY).andExpect(status().isOk());
    assertThat(body(send(w.t(), null, get(TRANSFERS + "/" + t1))).get("status").asText())
        .isEqualTo("REVERSED");
    assertThat(reversalCount(w)).isEqualTo(reversals + 3);
    assertThat(balanceAsOf(w, a, TODAY)).isEqualByComparingTo("10000");
    assertThat(balanceAsOf(w, b, TODAY)).isEqualByComparingTo("0");
    assertThat(balanceAsOf(w, c, TODAY)).isEqualByComparingTo("1000");

    // Kaynak görünmez, hedef ve masraf görünür: 403 (404 değil); hiçbir şey yazılmaz.
    Map<String, Object> cross = tb("EFT", a, d, "50", "TRY", TODAY);
    cross.put("costs", List.of(Map.of("kind", "FEE", "fundAccountId", c, "amount", "2")));
    String t2 = created(w, null, cross, null).get("id").asText();
    long beforeT2 = reversalCount(w);
    expect(reverseTx(w, a2User, costLegOf(w, t2), TODAY), 403, "BRANCH_OUT_OF_SCOPE");
    assertThat(reversalCount(w)).isEqualTo(beforeT2);

    // Masraf bacağı iptali transferin tarih kuralına tabi.
    LocalDate future = TODAY.plusDays(3);
    Map<String, Object> later = tb("EFT", a, b, "10", "TRY", future);
    later.put("costs", List.of(Map.of("kind", "COMMISSION", "fundAccountId", c, "amount", "1")));
    String t3 = created(w, null, later, null).get("id").asText();
    expect(reverseTx(w, null, costLegOf(w, t3), TODAY), 400, "REVERSE_BEFORE_TRANSFER");
    reverseTx(w, null, costLegOf(w, t3), future).andExpect(status().isOk());
    assertThat(body(send(w.t(), null, get(TRANSFERS + "/" + t3))).get("status").asText())
        .isEqualTo("REVERSED");
  }

  /**
   * SEC-8: düzenlemenin anahtarı başka bir transferin düzenlemesine ya da oluşturmaya bağlanmaz.
   */
  @Test
  void duzenlemeAnahtariBaskaTransfereBaglanmaz() throws Exception {
    World w = world("fik");
    String a = bank(w, "A1", w.a1(), "Ziraat", "TRY", "10000");
    String b = bank(w, "G1", w.a1(), "Garanti", "TRY", null);
    String t1 = created(w, null, tb("EFT", a, b, "100", "TRY", TODAY), null).get("id").asText();
    String t3 = created(w, null, tb("EFT", a, b, "30", "TRY", TODAY), null).get("id").asText();
    Map<String, Object> fixed = tb("EFT", a, b, "110", "TRY", TODAY);

    String t2 =
        body(replaceWithKey(w, t1, fixed, "RK1").andExpect(status().isCreated()))
            .get("id")
            .asText();
    // (c) Aynı düzenleme aynı anahtarla tekrar: aynı yeni transfer.
    assertThat(
            body(replaceWithKey(w, t1, fixed, "RK1").andExpect(status().isCreated()))
                .get("id")
                .asText())
        .isEqualTo(t2);
    // (a) Aynı gövde + anahtar başka transferin düzenlemesinde: 422, T3 değişmez.
    expect(replaceWithKey(w, t3, fixed, "RK1"), 422, "IDEMPOTENCY_KEY_REUSED");
    assertThat(body(send(w.t(), null, get(TRANSFERS + "/" + t3))).get("status").asText())
        .isEqualTo("POSTED");
    // (b) Oluşturma anahtarı düzenlemede, düzenleme anahtarı oluşturmada kullanılamaz.
    Map<String, Object> fresh = tb("EFT", a, b, "7", "TRY", TODAY);
    created(w, null, fresh, "CK1");
    expect(replaceWithKey(w, t3, fresh, "CK1"), 422, "IDEMPOTENCY_KEY_REUSED");
    expect(transfer(w, null, fixed, "RK1"), 422, "IDEMPOTENCY_KEY_REUSED");
    assertThat(body(send(w.t(), null, get(TRANSFERS + "/" + t3))).get("status").asText())
        .isEqualTo("POSTED");
  }

  /**
   * T-12.2-03 (SEC-12.2-05): FINANCE_EMPLOYEE_VIEW'siz kullanıcıya personel cari adı gizlenir; aday
   * listesi ve rapor tahsilatları settlement iş yeri kapsamıyla süzülür.
   */
  @Test
  void personelVeIsYeriKapsamiBozumOkumalari() throws Exception {
    rate("AUD", "20");
    World w = world("fpe");
    String tl = bank(w, "TL1", w.a1(), "Ziraat", "TRY", null);
    String aud = bank(w, "AUD1", w.a1(), "Garanti", "AUD", null);
    UUID emp = account(w, AccountType.EMPLOYEE, null);
    UUID cust = account(w, AccountType.CUSTOMER, null);
    String sEmp = collect(w, emp, w.a1(), aud, "100", "AUD", "E1");
    String sEmp2 = collect(w, emp, w.a1(), aud, "10", "AUD", "E2");
    String sOther = collect(w, cust, w.a2(), aud, "40", "AUD", "O1");
    Map<String, Object> fx = fxBody(aud, tl, "50", "AUD", "1000", "TRY", "20", "MULTIPLY");
    fx.put("sources", List.of(Map.of("kind", "SETTLEMENT", "id", sEmp, "usedAmount", "50")));
    String fxId = created(w, null, fx, null).get("id").asText();

    // Personel adı gizleme (a1 + a2 kapsamı, FINANCE rolünde FINANCE_EMPLOYEE_VIEW yok).
    String noEmp = limitedUser(w, "fin", "FINANCE", List.of(w.a1(), w.a2()));
    JsonNode hidden = listRow(w, noEmp, fxId).get("collection");
    assertThat(hidden.get("settlementId").asText()).isEqualTo(sEmp);
    assertThat(hidden.get("accountName").isNull()).isTrue();
    assertThat(hidden.get("accountId").isNull()).isTrue();
    JsonNode shown = listRow(w, null, fxId).get("collection");
    assertThat(shown.get("accountName").isNull()).isFalse();
    assertThat(shown.get("accountId").asText()).isEqualTo(emp.toString());

    JsonNode report = fxReport(w, noEmp);
    assertThat(reportRow(report, fxId).get("sources").get(0).get("accountName").isNull()).isTrue();
    assertThat(unbroken(report, sEmp2).get("accountName").isNull()).isTrue();
    assertThat(unbroken(report, sOther).get("accountName").isNull()).isFalse();
    JsonNode fullReport = fxReport(w, null);
    assertThat(reportRow(fullReport, fxId).get("sources").get(0).get("accountName").isNull())
        .isFalse();
    assertThat(unbroken(fullReport, sEmp2).get("accountName").isNull()).isFalse();

    assertThat(candidates(w, noEmp, aud, null).findValuesAsText("accountId"))
        .doesNotContain(emp.toString())
        .contains(cust.toString());
    expect(candidatesRequest(w, noEmp, aud, emp), 404, "ACCOUNT_NOT_FOUND");

    // İş yeri kapsamı: a2'deki tahsilat a1 kullanıcısının aday ve rapor listelerinde yok.
    String a1User = limitedUser(w, "a1f", "FINANCE", List.of(w.a1()));
    assertThat(candidates(w, a1User, aud, null).findValuesAsText("accountId"))
        .doesNotContain(cust.toString());
    assertThat(candidates(w, a1User, aud, cust).findValuesAsText("settlementId"))
        .doesNotContain(sOther);
    assertThat(fxReport(w, a1User).get("unbrokenCollections").findValuesAsText("settlementId"))
        .doesNotContain(sOther)
        .contains(sEmp2);
    assertThat(candidates(w, null, aud, null).findValuesAsText("accountId"))
        .contains(cust.toString(), emp.toString());
    assertThat(candidates(w, null, aud, cust).findValuesAsText("settlementId"))
        .containsExactly(sOther);

    // Sunucu denetimi aynı kapsam kuralını uygular.
    Map<String, Object> outOfScope = fxBody(aud, tl, "40", "AUD", "800", "TRY", "20", "MULTIPLY");
    outOfScope.put(
        "sources", List.of(Map.of("kind", "SETTLEMENT", "id", sOther, "usedAmount", "40")));
    expect(transfer(w, a1User, outOfScope, null), 422, "FX_SOURCE_INVALID");
  }

  @Test
  void bozumVeTahsilatIptaliYarisi() throws Exception {
    rate("AUD", "20");
    World w = world("frc");
    String tl = bank(w, "TL1", w.a1(), "Ziraat", "TRY", null);
    String aud = bank(w, "AUD1", w.a1(), "Garanti", "AUD", null);
    UUID customer = account(w, AccountType.CUSTOMER, null);

    // Tahsilatı kaynak alan bozum ∥ tahsilatın iptali: biri başarılı, diğeri 409/422; 500 yok.
    String s1 = collect(w, customer, w.a1(), aud, "100", "AUD", "S1");
    Map<String, Object> fx = fxBody(aud, tl, "100", "AUD", "2000", "TRY", "20", "MULTIPLY");
    fx.put("sources", List.of(Map.of("kind", "SETTLEMENT", "id", s1, "usedAmount", "100")));
    List<Integer> race =
        concurrently(
            () -> code(transfer(w, null, fx, null)),
            () ->
                code(
                    sendJson(
                        w.t(),
                        null,
                        post(FINANCE + "/settlements/" + s1 + "/reverse"),
                        Map.of("date", TODAY.toString()))));
    assertThat(race).hasSize(2);
    assertThat(race.stream().filter(code -> code == 200 || code == 201).count()).isEqualTo(1);
    assertThat(race).allMatch(code -> code == 200 || code == 201 || code == 409 || code == 422);

    // Aynı tahsilattan iki eşzamanlı bozum kalanı aşamaz.
    String s2 = collect(w, customer, w.a1(), aud, "100", "AUD", "S2");
    List<Callable<Integer>> calls = new ArrayList<>();
    for (int i = 0; i < 2; i++) {
      Map<String, Object> part = fxBody(aud, tl, "60", "AUD", "1200", "TRY", "20", "MULTIPLY");
      part.put("sources", List.of(Map.of("kind", "SETTLEMENT", "id", s2, "usedAmount", "60")));
      calls.add(() -> code(transfer(w, null, part, null)));
    }
    @SuppressWarnings("unchecked")
    List<Integer> parts = concurrently(calls.toArray(new Callable[0]));
    assertThat(parts).containsExactlyInAnyOrder(201, 422);
    assertThat(
            jdbc.queryForObject(
                ("select coalesce(sum(used_amount), 0) from \"%s\".fund_transfer_source"
                        + " where settlement_id = ?::uuid")
                    .formatted(w.schema()),
                BigDecimal.class,
                s2))
        .isEqualByComparingTo("60");
  }

  @Test
  void dogrulamaHataKodlari() throws Exception {
    rate("AUD", "20");
    World w = world("fer");
    String a = bank(w, "A1", w.a1(), "Ziraat", "TRY", "1000");
    String g = bank(w, "G1", w.a1(), "Garanti", "TRY", null);
    String aud = bank(w, "AUD1", w.a1(), "Ziraat", "AUD", null);
    String bankB = bank(w, "BB", w.b1(), "Ziraat", "TRY", null);
    UUID supplier = account(w, AccountType.SUPPLIER, null);

    expect(transfer(w, null, tb("EFT", a, g, "0", "TRY", TODAY), null), 400, "AMOUNT_INVALID");
    expect(transfer(w, null, tb("EFT", a, g, "1", "USD", TODAY), null), 400, "CURRENCY_MISMATCH");
    Map<String, Object> noTarget = tb("FX_EXCHANGE", a, aud, "20", "TRY", TODAY);
    expect(transfer(w, null, noTarget, null), 400, "TARGET_AMOUNT_REQUIRED");
    expect(
        transfer(w, null, fxBody(a, aud, "20", "TRY", "1", "TRY", "20", "DIVIDE"), null),
        400,
        "CURRENCY_MISMATCH");
    Map<String, Object> duplicate = tb("EFT", a, g, "1", "TRY", TODAY);
    duplicate.put(
        "costs",
        List.of(Map.of("kind", "FEE", "amount", "1"), Map.of("kind", "FEE", "amount", "2")));
    expect(transfer(w, null, duplicate, null), 400, "COST_DUPLICATE");
    Map<String, Object> kmv = tb("EFT", a, g, "1", "TRY", TODAY);
    kmv.put("costs", List.of(Map.of("kind", "KMV", "ratePercent", "11")));
    expect(transfer(w, null, kmv, null), 400, "KMV_RATE_INVALID");
    Map<String, Object> foreignCost = tb("EFT", a, g, "1", "TRY", TODAY);
    foreignCost.put("costs", List.of(Map.of("kind", "FEE", "fundAccountId", bankB, "amount", "1")));
    expect(transfer(w, null, foreignCost, null), 422, "COMPANY_MISMATCH");
    // Sıfır masraf atlanır; masraf kaynak fondan düşer.
    Map<String, Object> zero = tb("EFT", a, g, "1", "TRY", TODAY);
    zero.put(
        "costs",
        List.of(
            Map.of("kind", "COMMISSION", "amount", "0"),
            Map.of("kind", "FEE", "amount", "2"),
            Map.of("kind", "KMV", "ratePercent", "0")));
    JsonNode withFee = created(w, null, zero, null);
    assertThat(withFee.get("costs").findValuesAsText("kind")).containsExactly("FEE");
    assertThat(withFee.get("costs").get(0).get("fundAccountId").asText()).isEqualTo(a);

    // Geçersiz kaynaklar: ödeme kaydı, aynı kaynak iki kez, bilinmeyen kimlik, bozum olmayan
    // transfer.
    String payment =
        id(
            sendJson(
                w.t(),
                null,
                post(FINANCE + "/payments"),
                Map.of(
                    "method", "BANK",
                    "accountId", supplier.toString(),
                    "branchId", w.a1(),
                    "fundAccountId", a,
                    "money", money("1", "TRY"),
                    "date", TODAY.toString(),
                    "confirmWarnings", true)));
    Map<String, Object> wrongSource = fxBody(a, aud, "20", "TRY", "1", "AUD", "20", "DIVIDE");
    wrongSource.put(
        "sources", List.of(Map.of("kind", "SETTLEMENT", "id", payment, "usedAmount", "1")));
    expect(transfer(w, null, wrongSource, null), 422, "FX_SOURCE_INVALID");
    Map<String, Object> twice = fxBody(a, aud, "20", "TRY", "1", "AUD", "20", "DIVIDE");
    twice.put(
        "sources",
        List.of(
            Map.of("kind", "SETTLEMENT", "id", payment, "usedAmount", "1"),
            Map.of("kind", "SETTLEMENT", "id", payment, "usedAmount", "1")));
    expect(transfer(w, null, twice, null), 422, "FX_SOURCE_INVALID");
    Map<String, Object> unknown = fxBody(a, aud, "20", "TRY", "1", "AUD", "20", "DIVIDE");
    unknown.put(
        "sources",
        List.of(Map.of("kind", "TRANSFER", "id", UUID.randomUUID().toString(), "usedAmount", "1")));
    expect(transfer(w, null, unknown, null), 422, "FX_SOURCE_INVALID");
    Map<String, Object> notFx = fxBody(a, aud, "20", "TRY", "1", "AUD", "20", "DIVIDE");
    notFx.put(
        "sources",
        List.of(Map.of("kind", "TRANSFER", "id", withFee.get("id").asText(), "usedAmount", "1")));
    expect(transfer(w, null, notFx, null), 422, "FX_SOURCE_INVALID");

    // Düzenlemede şirket değişemez; bilinmeyen transfer 404.
    expect(
        sendJson(
            w.t(),
            null,
            post(TRANSFERS + "/" + withFee.get("id").asText() + "/replace"),
            Map.of("transfer", tb("CASH_TO_BANK", w.fundB1(), bankB, "1", "TRY", TODAY))),
        422,
        "COMPANY_MISMATCH");
    expect(send(w.t(), null, get(TRANSFERS + "/" + UUID.randomUUID())), 404, "TRANSFER_NOT_FOUND");
    expect(reverse(w, UUID.randomUUID().toString(), TODAY), 404, "TRANSFER_NOT_FOUND");

    // Liste ve yardımcı uç doğrulamaları.
    expect(
        send(w.t(), null, range(get(TRANSFERS)).param("transferType", "BOGUS")),
        400,
        "TRANSFER_TYPE_INVALID");
    expect(
        send(w.t(), null, range(get(TRANSFERS)).param("q", "x".repeat(101))),
        400,
        "QUERY_TOO_LONG");
    expect(
        send(
            w.t(),
            null,
            get(TRANSFERS + "/fx-sources").param("fundId", aud).param("currency", " ")),
        400,
        "CURRENCY_REQUIRED");
    expect(
        send(
            w.t(),
            null,
            get(TRANSFERS + "/fx-sources")
                .param("fundId", UUID.randomUUID().toString())
                .param("currency", "AUD")),
        404,
        "FUND_NOT_FOUND");
    expect(
        send(w.t(), null, range(get(FINANCE + "/intercompany-transfers")).param("size", "0")),
        400,
        "PAGE_SIZE_INVALID");
    expect(
        send(w.t(), null, get(FINANCE + "/intercompany-transfers/" + UUID.randomUUID())),
        404,
        "INTERCOMPANY_TRANSFER_NOT_FOUND");
    assertThat(
            body(send(w.t(), null, range(get(TRANSFERS)).param("status", "POSTED")))
                .get("totalElements")
                .asInt())
        .isEqualTo(1);
  }

  // --- yardımcılar

  private void rate(String currency, String value) {
    jdbc.update(
        "insert into admin.exchange_rate (id, currency, rate_date, rate, source, created_at)"
            + " values (gen_random_uuid(), ?, ?, ?, 'TEST', now()) on conflict do nothing",
        currency,
        RATE_DATE,
        new BigDecimal(value));
  }

  private String bank(
      World w, String code, String branch, String bankName, String currency, String opening)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("code", code);
    body.put("name", code + " Hesap");
    body.put("kind", "BANK");
    body.put("currency", currency);
    body.put("branchId", branch);
    body.put("bankName", bankName);
    body.put("allowNegative", false);
    if (opening != null) {
      body.put("openingBalance", opening);
      body.put("openingDate", OPENING.toString());
    }
    return id(sendJson(w.t(), null, post(FINANCE + "/funds"), body));
  }

  private String negativeBank(World w, String code, String branch, String currency)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("code", code);
    body.put("name", code + " Hesap");
    body.put("kind", "BANK");
    body.put("currency", currency);
    body.put("branchId", branch);
    body.put("bankName", code + " Bank");
    body.put("allowNegative", true);
    return id(sendJson(w.t(), null, post(FINANCE + "/funds"), body));
  }

  private String collect(
      World w,
      UUID customer,
      String branch,
      String fund,
      String amount,
      String currency,
      String text)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("method", "BANK");
    body.put("accountId", customer.toString());
    body.put("branchId", branch);
    body.put("fundAccountId", fund);
    body.put("money", money(amount, currency));
    body.put("date", TODAY.toString());
    body.put("description", text);
    body.put("confirmWarnings", true);
    return id(sendJson(w.t(), null, post(FINANCE + "/collections"), body));
  }

  private static Map<String, Object> tb(
      String type, String from, String to, String amount, String currency, LocalDate date) {
    Map<String, Object> body = new HashMap<>();
    if (type != null) {
      body.put("transferType", type);
    }
    body.put("fromFundId", from);
    body.put("toFundId", to);
    body.put("money", money(amount, currency));
    body.put("date", date.toString());
    return body;
  }

  private static Map<String, Object> fxBody(
      String from,
      String to,
      String amount,
      String currency,
      String target,
      String targetCurrency,
      String rate,
      String operation) {
    Map<String, Object> body = tb("FX_EXCHANGE", from, to, amount, currency, TODAY);
    body.put("targetMoney", money(target, targetCurrency));
    if (rate != null) {
      body.put("rate", rate);
      body.put("rateOperation", operation);
      body.put("calcMode", "SOURCE_RATE");
    }
    return body;
  }

  private static Map<String, Object> money(String amount, String currency) {
    return Map.of("amount", amount, "currency", currency);
  }

  private ResultActions transfer(World w, String token, Map<String, Object> body, String key)
      throws Exception {
    MockHttpServletRequestBuilder request =
        org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(TRANSFERS);
    if (key != null) {
      request.header("Idempotency-Key", key);
    }
    return sendJson(w.t(), token, request, body);
  }

  private JsonNode created(World w, String token, Map<String, Object> body, String key)
      throws Exception {
    return body(transfer(w, token, body, key).andExpect(status().isCreated()));
  }

  /** {@code expected} null ise yalnız 422 TRANSFER_RULE_VIOLATION (FX_CURRENCY). */
  private void rule(World w, Map<String, Object> body, String expected) throws Exception {
    transfer(w, null, body, null)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("TRANSFER_RULE_VIOLATION"))
        .andExpect(
            jsonPath("$.details[0]")
                .value("rule=" + (expected == null ? "FX_CURRENCY" : expected)));
  }

  private ResultActions reverse(World w, String id, LocalDate date) throws Exception {
    return reverse(w, null, id, date);
  }

  private ResultActions reverse(World w, String token, String id, LocalDate date) throws Exception {
    return sendJson(
        w.t(), token, post(TRANSFERS + "/" + id + "/reverse"), Map.of("date", date.toString()));
  }

  private ResultActions replace(World w, String id, Map<String, Object> transfer) throws Exception {
    return sendJson(
        w.t(),
        null,
        post(TRANSFERS + "/" + id + "/replace"),
        Map.of("transfer", transfer, "reason", "Tutar düzeltmesi"));
  }

  private ResultActions replaceWithKey(World w, String id, Map<String, Object> transfer, String key)
      throws Exception {
    MockHttpServletRequestBuilder request = post(TRANSFERS + "/" + id + "/replace");
    request.header("Idempotency-Key", key);
    return sendJson(w.t(), null, request, Map.of("transfer", transfer));
  }

  private ResultActions reverseTx(World w, String token, String txId, LocalDate date)
      throws Exception {
    return sendJson(
        w.t(),
        token,
        post(FINANCE + "/funds/transactions/" + txId + "/reverse"),
        Map.of("date", date.toString()));
  }

  private String costLegOf(World w, String transferId) {
    return jdbc.queryForObject(
        ("select t.id::text from \"%s\".fund_transaction t join \"%s\".fund_transfer_cost c"
                + " on c.id = t.source_id where t.source_type = 'FUND_TRANSFER_COST'"
                + " and c.transfer_id = ?::uuid")
            .formatted(w.schema(), w.schema()),
        String.class,
        transferId);
  }

  private long fundTxCount(World w, String fund) {
    return jdbc.queryForObject(
        "select count(*) from \"%s\".fund_transaction where fund_account_id = ?::uuid"
            .formatted(w.schema()),
        Long.class,
        fund);
  }

  private JsonNode listRow(World w, String token, String id) throws Exception {
    JsonNode list =
        body(
            send(w.t(), token, range(get(TRANSFERS)).param("transferType", "FX_EXCHANGE"))
                .andExpect(status().isOk()));
    for (JsonNode row : list.get("content")) {
      if (id.equals(row.get("id").asText())) {
        return row;
      }
    }
    throw new AssertionError("Transfer listede yok: " + id);
  }

  private JsonNode fxReport(World w, String token) throws Exception {
    return body(
        send(w.t(), token, range(get(TRANSFERS + "/fx-report"))).andExpect(status().isOk()));
  }

  private static JsonNode reportRow(JsonNode report, String transferId) {
    for (JsonNode row : report.get("rows")) {
      if (transferId.equals(row.get("transferId").asText())) {
        return row;
      }
    }
    throw new AssertionError("Raporda yok: " + transferId);
  }

  private static JsonNode unbroken(JsonNode report, String settlementId) {
    for (JsonNode row : report.get("unbrokenCollections")) {
      if (settlementId.equals(row.get("settlementId").asText())) {
        return row;
      }
    }
    throw new AssertionError("Bozulmamış tahsilat yok: " + settlementId);
  }

  private ResultActions candidatesRequest(World w, String token, String fund, UUID accountId)
      throws Exception {
    MockHttpServletRequestBuilder request =
        get(TRANSFERS + "/fx-collection-candidates").param("fundId", fund).param("currency", "AUD");
    if (accountId != null) {
      request.param("accountId", accountId.toString());
    }
    return send(w.t(), token, request);
  }

  private JsonNode candidates(World w, String token, String fund, UUID accountId) throws Exception {
    return body(candidatesRequest(w, token, fund, accountId).andExpect(status().isOk()));
  }

  private static MockHttpServletRequestBuilder range(MockHttpServletRequestBuilder request) {
    return request.param("from", TODAY.minusDays(1).toString()).param("to", TODAY.toString());
  }

  private static int code(ResultActions result) {
    return result.andReturn().getResponse().getStatus();
  }

  private long count(World w, String table) {
    return jdbc.queryForObject(
        "select count(*) from \"%s\".%s".formatted(w.schema(), table), Long.class);
  }

  private long legs(World w, String sourceType, String sourceId) {
    return jdbc.queryForObject(
        ("select count(*) from \"%s\".fund_transaction where source_type = ?"
                + " and source_id = ?::uuid")
            .formatted(w.schema()),
        Long.class,
        sourceType,
        sourceId);
  }

  private String legOf(World w, String transferId, String fund) {
    return jdbc.queryForObject(
        ("select id::text from \"%s\".fund_transaction where source_type = 'FUND_TRANSFER'"
                + " and source_id = ?::uuid and fund_account_id = ?::uuid")
            .formatted(w.schema()),
        String.class,
        transferId,
        fund);
  }

  private BigDecimal tlAmount(World w, String transferId, String fund) {
    return jdbc.queryForObject(
        ("select tl_amount from \"%s\".fund_transaction where source_type = 'FUND_TRANSFER'"
                + " and source_id = ?::uuid and fund_account_id = ?::uuid")
            .formatted(w.schema()),
        BigDecimal.class,
        transferId,
        fund);
  }

  private BigDecimal incomeExpense(World w, String category, String direction) {
    return jdbc.queryForObject(
        ("select coalesce(sum(amount), 0) from \"%s\".fin_income_expense where category = ?"
                + " and direction = ? and source_type <> 'REVERSAL'")
            .formatted(w.schema()),
        BigDecimal.class,
        category,
        direction);
  }

  private long reversalCount(World w) {
    return jdbc.queryForObject(
        "select count(*) from \"%s\".fund_transaction where source_type = 'REVERSAL'"
            .formatted(w.schema()),
        Long.class);
  }

  private BigDecimal balanceAsOf(World w, String fund, LocalDate asOf) throws Exception {
    for (JsonNode row :
        body(send(w.t(), null, get(FINANCE + "/funds").param("asOf", asOf.toString())))) {
      if (fund.equals(row.get("id").asText())) {
        return row.get("currentBalance").decimalValue();
      }
    }
    throw new AssertionError("Hesap yok: " + fund);
  }
}
