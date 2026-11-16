package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Çekli ödeme/tahsilatın iptali ve düzeltmesi (12.3_TASARIM §3.4–§3.5, §3.10; §6.2 {@code
 * SettlementCheckReverseIT}). 12.2a'daki "çekli kayıt ters çevrilemez" beklentileri ({@code
 * FinanceIT}, {@code SettlementCorrectionIT}) buraya taşınıp tersine çevrildi.
 */
class SettlementCheckReverseIT extends InstrumentTestSupport {

  @Test
  void tahsilatIptaliCekiIptalEderNumaraSerbestKalir() throws Exception {
    World w = world("scr1");
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID other = account(w, AccountType.CUSTOMER, null);

    JsonNode portfolio =
        collectInstrument(w, customer, w.a1(), "100", instrumentData("CHECK", "1100001"));
    String check = portfolio.get("instrumentId").asText();
    reverse(w, null, portfolio.get("id").asText(), TODAY, null)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("REVERSED"));
    assertThat(instrumentStatus(w, check)).isEqualTo("CANCELLED");
    assertThat(accountNet(w, customer)).isEqualByComparingTo("0");
    assertThat(
            row(
                w,
                "select note from %s.instrument_movement where instrument_id = ?::uuid"
                    + " and to_status = 'CANCELLED'",
                check))
        .containsEntry("note", "Tahsilat iptali");
    // Tekrar iptal aynı kaydı döner; numara yeniden kullanılabilir.
    long moves = movementCount(w, check);
    reverse(w, null, portfolio.get("id").asText(), TODAY, null).andExpect(status().isOk());
    assertThat(movementCount(w, check)).isEqualTo(moves);
    collectInstrument(w, customer, w.a1(), "100", instrumentData("CHECK", "1100001"));

    // Bankaya yatırılmış (AT_BANK) çekin tahsilatı iptal edilir (fon yazılmamıştır).
    Map<String, Object> deposited = instrumentData("CHECK", "1100002");
    deposited.put("initialStatus", "AT_BANK");
    deposited.put("fundAccountId", bank);
    JsonNode atBank = collectInstrument(w, customer, w.a1(), "40", deposited);
    reverse(w, null, atBank.get("id").asText(), TODAY, "Hatalı").andExpect(status().isOk());
    assertThat(instrumentStatus(w, atBank.get("instrumentId").asText())).isEqualTo("CANCELLED");

    // Tahsil edilmiş çek: 409 + durum ayrıntısı; kayıt ve çek değişmez.
    JsonNode collected =
        collectInstrument(w, customer, w.a1(), "30", instrumentData("CHECK", "1100003"));
    String collectedCheck = collected.get("instrumentId").asText();
    transition(w, null, collectedCheck, "COLLECTED", bank).andExpect(status().isOk());
    reverse(w, null, collected.get("id").asText(), TODAY, null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("SETTLEMENT_CHECK_NOT_REVERSIBLE"))
        .andExpect(jsonPath("$.details[0]").value("instrumentStatus=COLLECTED"))
        .andExpect(jsonPath("$.details[1]").value("instrumentId=" + collectedCheck));
    assertThat(instrumentStatus(w, collectedCheck)).isEqualTo("COLLECTED");

    // Taşınmış kayıt: 409 TRANSACTION_TRANSFERRED (OK-37 korunur).
    JsonNode moved =
        collectInstrument(w, customer, w.a1(), "20", instrumentData("CHECK", "1100004"));
    transferLine(w, customer, other, ledgerLine(w, moved.get("id").asText()));
    expect(reverse(w, null, moved.get("id").asText(), TODAY, null), 409, "TRANSACTION_TRANSFERRED");
    assertThat(instrumentStatus(w, moved.get("instrumentId").asText())).isEqualTo("PORTFOLIO");
  }

  @Test
  void odemeVeCiroIptali() throws Exception {
    World w = world("scr2");
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID supplier = account(w, AccountType.SUPPLIER, null);

    // Kendi çekimizle (yapraklı) ödeme iptali: çek CANCELLED, yaprak VOID.
    List<UUID> leaves = leaves(w, bank, w.a1(), "2200001", "2200002");
    Map<String, Object> own = instrumentData("CHECK", "2200001");
    own.put("fundAccountId", bank);
    own.put("checkLeafId", leaves.get(0).toString());
    JsonNode payment = payInstrument(w, supplier, w.a1(), "50", own);
    assertThat(leafStatus(w, leaves.get(0))).isEqualTo("USED");
    reverse(w, null, payment.get("id").asText(), TODAY, null).andExpect(status().isOk());
    assertThat(instrumentStatus(w, payment.get("instrumentId").asText())).isEqualTo("CANCELLED");
    assertThat(leafStatus(w, leaves.get(0))).isEqualTo("VOID");
    assertThat(accountNet(w, supplier)).isEqualByComparingTo("0");

    // Ödenmiş çekin ödemesi iptal edilemez.
    Map<String, Object> paid = instrumentData("CHECK", "2200002");
    paid.put("fundAccountId", bank);
    paid.put("checkLeafId", leaves.get(1).toString());
    JsonNode paidPayment = payInstrument(w, supplier, w.a1(), "60", paid);
    transition(w, null, paidPayment.get("instrumentId").asText(), "PAID", bank)
        .andExpect(status().isOk());
    expect(
        reverse(w, null, paidPayment.get("id").asText(), TODAY, null),
        409,
        "SETTLEMENT_CHECK_NOT_REVERSIBLE");

    // Ciro ödemesi iptali: çek portföye döner, ciro edilen boşalır, yeniden cirolanabilir.
    Map<String, Object> custodyData = instrumentData("CHECK", "2200009");
    custodyData.put("custodyFundId", w.fundA1());
    String check =
        collectInstrument(w, customer, w.a1(), "70", custodyData).get("instrumentId").asText();
    assertThat(instrumentRow(w, check).get("custody_fund_id")).isNotNull();
    String endorsement = id(pay(w, null, endorseBody(supplier, w.a1(), "70", check), null));
    assertThat(instrumentStatus(w, check)).isEqualTo("ENDORSED");
    // R-12.3-3: ciro emanet kasasını boşaltır.
    assertThat(instrumentRow(w, check).get("custody_fund_id")).isNull();
    reverse(w, null, endorsement, TODAY, null).andExpect(status().isOk());
    Map<String, Object> back = instrumentRow(w, check);
    assertThat(back).containsEntry("status", "PORTFOLIO");
    assertThat(back.get("endorsed_account_id")).isNull();
    assertThat(
            count(
                w,
                "select count(*) from %s.instrument_movement where instrument_id = ?::uuid"
                    + " and from_status = 'ENDORSED' and to_status = 'PORTFOLIO'"
                    + " and note = 'Ciro iptali'",
                check))
        .isEqualTo(1);
    id(pay(w, null, endorseBody(supplier, w.a1(), "70", check), null));
    assertThat(instrumentStatus(w, check)).isEqualTo("ENDORSED");
  }

  @Test
  void cekliDuzeltme() throws Exception {
    World w = world("scr3");
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    List<UUID> leaves = leaves(w, bank, w.a1(), "3300001", "3300002");

    // CHECK→CHECK aynı numara ve aynı yaprak; yalnız tutar değişir (Rev 1 F1).
    Map<String, Object> own = instrumentData("CHECK", "3300001");
    own.put("fundAccountId", bank);
    own.put("checkLeafId", leaves.get(0).toString());
    JsonNode payment = payInstrument(w, supplier, w.a1(), "50", own);
    JsonNode corrected =
        body(
            correct(
                    w,
                    null,
                    payment.get("id").asText(),
                    null,
                    instrumentBody(supplier, w.a1(), "55", own),
                    "scr3-k1")
                .andExpect(status().isCreated()));
    assertThat(instrumentStatus(w, payment.get("instrumentId").asText())).isEqualTo("CANCELLED");
    String newCheck = corrected.get("instrumentId").asText();
    assertThat(instrumentRow(w, newCheck))
        .containsEntry("status", "ISSUED")
        .containsEntry("check_leaf_id", leaves.get(0));
    assertThat(leafStatus(w, leaves.get(0))).isEqualTo("USED");
    assertThat(accountNet(w, supplier)).isEqualByComparingTo("55");
    // Aynı anahtarla tekrar aynı yeni kaydı döner.
    correct(
            w,
            null,
            payment.get("id").asText(),
            null,
            instrumentBody(supplier, w.a1(), "55", own),
            "scr3-k1")
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.id").value(corrected.get("id").asText()));

    // Alınan çekte aynı numara ve bankayla düzeltme: INSTRUMENT_NUMBER_TAKEN yok.
    JsonNode received =
        collectInstrument(w, customer, w.a1(), "80", instrumentData("CHECK", "3300010"));
    String receivedFix =
        id(
            correct(
                w,
                null,
                received.get("id").asText(),
                null,
                instrumentBody(customer, w.a1(), "85", instrumentData("CHECK", "3300010")),
                null));
    assertThat(accountNet(w, customer)).isEqualByComparingTo("-85");

    // Yapraksız eski çek; aynı numara sonradan koçana girdi: elle düzeltme 201.
    Map<String, Object> manual = instrumentData("CHECK", "3300020");
    manual.put("fundAccountId", bank);
    JsonNode manualPayment = payInstrument(w, supplier, w.a1(), "10", manual);
    UUID lateLeaf = leaves(w, bank, w.a1(), "3300020").get(0);
    String manualFix =
        id(
            correct(
                w,
                null,
                manualPayment.get("id").asText(),
                null,
                instrumentBody(supplier, w.a1(), "12", manual),
                null));
    assertThat(leafStatus(w, lateLeaf)).isEqualTo("UNUSED");
    // Başka yaprağın USED numarası: 409 CHECK_LEAF_USED.
    Map<String, Object> taken = instrumentData("CHECK", "3300001");
    taken.put("fundAccountId", bank);
    taken.put("checkLeafId", leaves.get(0).toString());
    expect(
        correct(w, null, manualFix, null, instrumentBody(supplier, w.a1(), "12", taken), null),
        409,
        "CHECK_LEAF_USED");

    // CHECK→BANK (ödeme) ve CASH→CHECK (tahsilat).
    String toBank =
        id(
            correct(
                w,
                null,
                corrected.get("id").asText(),
                null,
                body("BANK", supplier, w.a1(), bank, "55"),
                null));
    assertThat(instrumentStatus(w, newCheck)).isEqualTo("CANCELLED");
    assertThat(leafStatus(w, leaves.get(0))).isEqualTo("UNUSED");
    assertThat(toBank).isNotBlank();
    String cash = id(collect(w, null, body("CASH", customer, w.a1(), w.fundA1(), "30"), null));
    JsonNode toCheck =
        body(
            correct(
                    w,
                    null,
                    cash,
                    null,
                    instrumentBody(customer, w.a1(), "30", instrumentData("CHECK", "3300030")),
                    null)
                .andExpect(status().isCreated()));
    assertThat(instrumentStatus(w, toCheck.get("instrumentId").asText())).isEqualTo("PORTFOLIO");
    assertThat(fundNet(w, w.fundA1())).isEqualByComparingTo("0");

    // Ciro → ciro (aynı çek) ve ciro → başka çek.
    String endorsed = receivedFixCheck(w, receivedFix);
    String endorsement = id(pay(w, null, endorseBody(supplier, w.a1(), "85", endorsed), null));
    Map<String, Object> again = endorseBody(supplier, w.a1(), "85", endorsed);
    again.put("description", "Düzeltilmiş ciro");
    String sameCheck = id(correct(w, null, endorsement, null, again, null));
    assertThat(instrumentRow(w, endorsed))
        .containsEntry("status", "ENDORSED")
        .containsEntry("endorsed_account_id", supplier);
    String otherCheck = toCheck.get("instrumentId").asText();
    id(correct(w, null, sameCheck, null, endorseBody(supplier, w.a1(), "30", otherCheck), null));
    assertThat(instrumentStatus(w, endorsed)).isEqualTo("PORTFOLIO");
    assertThat(instrumentStatus(w, otherCheck)).isEqualTo("ENDORSED");

    // Başka şirket: 422 COMPANY_MISMATCH.
    expect(
        correct(
            w,
            null,
            manualFix,
            null,
            instrumentBody(supplier, w.b1(), "12", instrumentData("CHECK", "3300099")),
            null),
        422,
        "COMPANY_MISMATCH");
  }

  @Test
  void esZamanliIptalGecisYaprakVeCariTasima() throws Exception {
    World w = world("scr4");
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID other = account(w, AccountType.CUSTOMER, null);
    UUID supplier = account(w, AccountType.SUPPLIER, null);

    // İptal ∥ PORTFOLIO→COLLECTED: biri başarılı, diğeri 409.
    JsonNode c1 = collectInstrument(w, customer, w.a1(), "10", instrumentData("CHECK", "4400001"));
    List<MvcResult> race =
        concurrently(
            () -> reverse(w, null, c1.get("id").asText(), TODAY, null).andReturn(),
            () ->
                transition(w, null, c1.get("instrumentId").asText(), "COLLECTED", bank)
                    .andReturn());
    assertOneWins(race, "SETTLEMENT_CHECK_NOT_REVERSIBLE", "INSTRUMENT_INVALID_TRANSITION");

    // Aynı yaprakla iki ödeme: biri 201, diğeri 409 CHECK_LEAF_USED.
    UUID leaf = leaves(w, bank, w.a1(), "4400002").get(0);
    Map<String, Object> own = instrumentData("CHECK", "4400002");
    own.put("fundAccountId", bank);
    own.put("checkLeafId", leaf.toString());
    List<MvcResult> leafRace =
        concurrently(
            () -> pay(w, null, instrumentBody(supplier, w.a1(), "5", own), null).andReturn(),
            () -> pay(w, null, instrumentBody(supplier, w.a1(), "5", own), null).andReturn());
    assertThat(leafRace).extracting(r -> r.getResponse().getStatus()).contains(201, 409);
    assertThat(leafRace.stream().filter(r -> r.getResponse().getStatus() == 409).findFirst())
        .get()
        .satisfies(
            r ->
                assertThat(r.getResponse().getContentAsString())
                    .containsAnyOf("CHECK_LEAF_USED", "INSTRUMENT_NUMBER_TAKEN"));

    // İptal ∥ cari taşıma (o tahsilatın hareketi): biri başarılı, diğeri 409.
    JsonNode c2 = collectInstrument(w, customer, w.a1(), "20", instrumentData("CHECK", "4400003"));
    UUID line = ledgerLine(w, c2.get("id").asText());
    List<MvcResult> transferRace =
        concurrently(
            () -> reverse(w, null, c2.get("id").asText(), TODAY, null).andReturn(),
            () ->
                sendJson(
                        w.t(),
                        null,
                        post(FINANCE + "/account-transfers"),
                        Map.of(
                            "fromAccountId",
                            customer.toString(),
                            "toAccountId",
                            other.toString(),
                            "transactionIds",
                            List.of(line.toString())))
                    .andReturn());
    List<Integer> statuses = race(transferRace);
    assertThat(statuses).allMatch(s -> s < 500);
    assertThat(statuses.stream().filter(s -> s < 300).count()).isEqualTo(1);
  }

  private static List<Integer> race(List<MvcResult> results) {
    return results.stream().map(r -> r.getResponse().getStatus()).toList();
  }

  private static void assertOneWins(List<MvcResult> results, String... loserCodes)
      throws Exception {
    List<Integer> statuses = race(results);
    assertThat(statuses).containsExactlyInAnyOrder(200, 409);
    for (MvcResult result : results) {
      if (result.getResponse().getStatus() == 409) {
        assertThat(result.getResponse().getContentAsString()).containsAnyOf(loserCodes);
      }
    }
  }

  /** Düzeltilmiş tahsilatın yeni çeki. */
  private String receivedFixCheck(World w, String settlement) {
    return row(
            w, "select instrument_id::text as i from %s.settlement where id = ?::uuid", settlement)
        .get("i")
        .toString();
  }
}
