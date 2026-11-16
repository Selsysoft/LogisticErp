package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Banka/kasa tanımı (12.2_TASARIM §3.1, §3.2.1–§3.2.5, §6.2 FundAccountIT): şifreli hesap no,
 * açılış bakiyesi ve düzeltmesi, aktif/pasif, silme denetimi, liste süzgeçleri, özet, sparkline,
 * yetki ve kiracı izolasyonu.
 */
class FundAccountIT extends AccountTestSupport {

  /** Geçmiş bir ay başı (açılış tarihi). */
  private static final LocalDate JAN1 = TODAY.minusMonths(6).withDayOfMonth(1);

  private static final String ACCOUNT_NO = "1234 5678 9012";

  @Test
  void hesapNoSifreliAcilisVeDuzeltme() throws Exception {
    World w = world("fna");

    // Tür kuralları.
    Map<String, Object> cashCredit = fund("KS-CR", "CASH", "TRY", w.a1(), false);
    cashCredit.put("accountType", "CREDIT");
    expect(createFund(w, null, cashCredit), 400, "FUND_ACCOUNT_TYPE_INVALID");
    Map<String, Object> bankCredit = fund("BN-CR", "BANK", "TRY", w.a1(), false);
    bankCredit.put("accountType", "DEPOSIT");
    expect(createFund(w, null, bankCredit), 422, "FUND_ACCOUNT_TYPE_MANAGED");

    // Yeni vadesiz hesap: hesap no şifreli + maskeli, açılış 1000 (1 Ocak).
    Map<String, Object> body = fund("BN-1", "BANK", "TRY", w.a1(), false);
    body.put("bankName", "Ziraat");
    body.put("accountNo", ACCOUNT_NO);
    body.put("bankBranchName", "Kadıköy");
    body.put("description", "Ana hesap");
    body.put("openingBalance", "1000");
    body.put("openingDate", JAN1.toString());
    JsonNode created = body(createFund(w, null, body).andExpect(status().isCreated()));
    String bank = created.get("id").asText();
    assertThat(created.get("accountType").asText()).isEqualTo("DEMAND");
    assertThat(created.get("accountNo").asText()).isEqualTo("****9012");
    assertThat(created.get("bankBranchName").asText()).isEqualTo("Kadıköy");
    assertThat(created.get("description").asText()).isEqualTo("Ana hesap");
    assertThat(created.get("active").asBoolean()).isTrue();
    assertThat(amount(created, "openingBalance")).isEqualByComparingTo("1000");
    assertThat(created.get("openingDate").asText()).isEqualTo(JAN1.toString());
    assertThat(amount(created, "balance")).isEqualByComparingTo("1000");
    assertThat(created.get("transactionCount").asLong()).isEqualTo(1);

    Map<String, Object> row =
        jdbc.queryForMap(
            "select account_no_enc, account_no_masked from \"%s\".fund_account where id = ?"
                .formatted(w.schema()),
            UUID.fromString(bank));
    assertThat((String) row.get("account_no_enc")).isNotBlank().doesNotContain("123456789012");
    assertThat(row.get("account_no_masked")).isEqualTo("****9012");
    assertThat(
            jdbc.queryForObject(
                ("select category from \"%s\".fund_transaction"
                        + " where fund_account_id = ? and source_type = 'FUND_OPENING'")
                    .formatted(w.schema()),
                String.class,
                UUID.fromString(bank)))
        .isEqualTo("OPENING");

    // Listede maskeli; detayda yalnız MANAGE sahibine düz.
    JsonNode listed = byId(list(w, null, Map.of()), bank);
    assertThat(listed.get("accountNo").asText()).isEqualTo("****9012");
    String accounting = userWithRole(w, "muhasebe", "ACCOUNTING");
    assertThat(detail(w, null, bank).get("accountNo").asText()).isEqualTo("123456789012");
    JsonNode viewOnly = detail(w, accounting, bank);
    assertThat(viewOnly.get("accountNo").asText()).isEqualTo("****9012");
    assertThat(viewOnly.get("createdBy").asText()).isNotBlank();
    assertThat(viewOnly.get("updateCount").asInt()).isZero();
    assertThat(viewOnly.get("lastTransactionDate").asText()).isEqualTo(JAN1.toString());

    // Eksi açılış: eksiye izin yoksa 409, varsa kayıt.
    Map<String, Object> negative = fund("KS-NEG", "CASH", "TRY", w.a1(), false);
    negative.put("openingBalance", "-50");
    expect(createFund(w, null, negative), 409, "INSUFFICIENT_FUNDS");
    negative.put("allowNegative", true);
    JsonNode neg = body(createFund(w, null, negative).andExpect(status().isCreated()));
    assertThat(amount(neg, "balance")).isEqualByComparingTo("-50");
    assertThat(amount(neg, "openingBalance")).isEqualByComparingTo("-50");

    // Harcanmış açılış: 1000 − 700 = 300; 1200'e yükseltme geçer (bakiye 500).
    manualFund(w, bank, "OUT", "700", JAN1.plusDays(14), "EXPENSE");
    Map<String, Object> update = update("Ziraat Ana", w.a1(), false);
    update.put("accountNo", ACCOUNT_NO);
    update.put("bankBranchName", "Kadıköy");
    update.put("description", "Ana hesap");
    update.put("openingBalance", "1200");
    JsonNode raised = body(updateFund(w, bank, update).andExpect(status().isOk()));
    assertThat(amount(raised, "balance")).isEqualByComparingTo("500");
    assertThat(amount(raised, "openingBalance")).isEqualByComparingTo("1200");
    assertThat(raised.get("openingDate").asText()).isEqualTo(JAN1.toString());
    // Ters kayıt eski açılış tarihli; ara tarih bakiyesi çift sayılmaz (2200 değil 500).
    assertThat(
            jdbc.queryForList(
                ("select r.transaction_date from \"%s\".fund_transaction r"
                        + " join \"%s\".fund_transaction o on o.id = r.source_id"
                        + " where r.source_type = 'REVERSAL' and o.source_type = 'FUND_OPENING'"
                        + " and o.fund_account_id = ?")
                    .formatted(w.schema(), w.schema()),
                LocalDate.class,
                UUID.fromString(bank)))
        .containsExactly(JAN1);
    JsonNode asOf = byId(list(w, null, Map.of("asOf", JAN1.plusMonths(1).toString())), bank);
    assertThat(amount(asOf, "currentBalance")).isEqualByComparingTo("500");
    assertThat(amount(byId(list(w, null, Map.of("asOf", JAN1.toString())), bank), "currentBalance"))
        .isEqualByComparingTo("1200");
    assertThat(
            jdbc.queryForObject(
                ("select count(*) from \"%s\".fund_opening where fund_account_id = ?"
                        + " and status = 'REVERSED' and reversed_at = ?")
                    .formatted(w.schema()),
                Integer.class,
                UUID.fromString(bank),
                JAN1))
        .isEqualTo(1);

    // Aynı değer: yeni hareket yok; ama sayaç artar.
    int before = txCount(w, bank);
    JsonNode same = body(updateFund(w, bank, update).andExpect(status().isOk()));
    assertThat(txCount(w, bank)).isEqualTo(before);
    assertThat(detail(w, null, bank).get("updateCount").asInt()).isEqualTo(2);
    assertThat(amount(same, "balance")).isEqualByComparingTo("500");

    // Net etkisi eksiye düşüren düzeltme 409 ve hiçbir şey değişmez; 800'e düşürme geçer.
    update.put("openingBalance", "600");
    expect(updateFund(w, bank, update), 409, "INSUFFICIENT_FUNDS");
    assertThat(txCount(w, bank)).isEqualTo(before);
    assertThat(amount(detail(w, null, bank), "openingBalance")).isEqualByComparingTo("1200");
    update.put("openingBalance", "800");
    assertThat(amount(body(updateFund(w, bank, update).andExpect(status().isOk())), "balance"))
        .isEqualByComparingTo("100");

    // Tarih değişikliği geçmişi yeniden yazar: 1 Ocak'ta bakiye 0, 2 Ocak'ta 800.
    update.put("openingDate", JAN1.plusDays(1).toString());
    JsonNode moved = body(updateFund(w, bank, update).andExpect(status().isOk()));
    assertThat(moved.get("openingDate").asText()).isEqualTo(JAN1.plusDays(1).toString());
    assertThat(amount(byId(list(w, null, Map.of("asOf", JAN1.toString())), bank), "currentBalance"))
        .isEqualByComparingTo("0");
    assertThat(
            amount(
                byId(list(w, null, Map.of("asOf", JAN1.plusDays(1).toString())), bank),
                "currentBalance"))
        .isEqualByComparingTo("800");

    // Hesap no silinebilir; denetim kaydında değişen alan adları (hesap no değeri yok).
    update.remove("accountNo");
    JsonNode cleared = body(updateFund(w, bank, update).andExpect(status().isOk()));
    assertThat(cleared.get("accountNo").isNull()).isTrue();
    List<String> details =
        jdbc.queryForList(
            ("select details from \"%s\".audit_log where event_type = 'FUND_UPDATED'"
                    + " and target = ?")
                .formatted(w.schema()),
            String.class,
            "FUND:" + bank);
    assertThat(details).anyMatch(d -> d.contains("accountNo")).noneMatch(d -> d.contains("9012"));
    assertThat(
            jdbc.queryForObject(
                ("select count(*) from \"%s\".audit_log where event_type = 'FUND_OPENING_SET'"
                        + " and target = ?")
                    .formatted(w.schema()),
                Integer.class,
                "FUND:" + bank))
        .isEqualTo(4);
  }

  /**
   * F-12.2-3 / OK-12.2-37: kur tablosu boşken döviz cinsi açılış kullanıcı kuruyla girilir. HUF'a
   * hiçbir testte kur yazılmaz (paylaşılan {@code admin.exchange_rate}).
   */
  @Test
  void dovizAcilisKurTablosuBoskenElleKur() throws Exception {
    World w = world("fnk");
    Map<String, Object> body = fund("HUF-1", "BANK", "HUF", w.a1(), false);
    body.put("bankName", "OTP");
    body.put("openingBalance", "5000");
    body.put("openingDate", JAN1.toString());

    // Kur yok, elle kur yok: 422 ve hiçbir şey yazılmaz.
    expect(createFund(w, null, body), 422, "RATE_MISSING");
    assertThat(
            jdbc.queryForObject(
                "select count(*) from \"%s\".fund_account where code = 'HUF-1'"
                    .formatted(w.schema()),
                Integer.class))
        .isZero();
    assertThat(
            jdbc.queryForObject(
                "select count(*) from \"%s\".fund_opening".formatted(w.schema()), Integer.class))
        .isZero();

    // Elle kurla açılış: TL karşılığı kullanıcı kuruyla.
    body.put("openingRate", "35");
    JsonNode created = body(createFund(w, null, body).andExpect(status().isCreated()));
    String fund = created.get("id").asText();
    assertThat(amount(created, "openingBalance")).isEqualByComparingTo("5000");
    Map<String, Object> leg = openingLeg(w, fund, "FUND_OPENING");
    assertThat((BigDecimal) leg.get("exchange_rate")).isEqualByComparingTo("35");
    assertThat((BigDecimal) leg.get("tl_amount")).isEqualByComparingTo("175000.00");

    // Aynı açılış kursuz düzenlenir (yazım yok); farklı açılış kursuz 422, değişiklik yok.
    Map<String, Object> update = update("HUF-1", w.a1(), false);
    update.put("openingBalance", "5000");
    update.put("openingDate", JAN1.toString());
    updateFund(w, fund, update).andExpect(status().isOk());
    int before = txCount(w, fund);
    update.put("openingBalance", "6000");
    expect(updateFund(w, fund, update), 422, "RATE_MISSING");
    assertThat(txCount(w, fund)).isEqualTo(before);
    assertThat(amount(detail(w, null, fund), "openingBalance")).isEqualByComparingTo("5000");

    // Elle kurla düzeltme: yeni açılış yeni kurla, eskisi kendi tarihi ve kuruyla ters.
    update.put("openingRate", "36");
    JsonNode raised = body(updateFund(w, fund, update).andExpect(status().isOk()));
    assertThat(amount(raised, "openingBalance")).isEqualByComparingTo("6000");
    assertThat(amount(raised, "balance")).isEqualByComparingTo("6000");
    List<Map<String, Object>> openingsLegs =
        jdbc.queryForList(
            ("select amount, exchange_rate, tl_amount from \"%s\".fund_transaction"
                    + " where fund_account_id = ?::uuid and source_type = 'FUND_OPENING'"
                    + " order by amount")
                .formatted(w.schema()),
            fund);
    assertThat(openingsLegs).hasSize(2);
    assertThat((BigDecimal) openingsLegs.get(1).get("exchange_rate")).isEqualByComparingTo("36");
    assertThat((BigDecimal) openingsLegs.get(1).get("tl_amount")).isEqualByComparingTo("216000");
    Map<String, Object> reversal = openingLeg(w, fund, "REVERSAL");
    assertThat((BigDecimal) reversal.get("exchange_rate")).isEqualByComparingTo("35");
    assertThat((BigDecimal) reversal.get("tl_amount")).isEqualByComparingTo("175000");
    assertThat(reversal.get("transaction_date").toString()).isEqualTo(JAN1.toString());

    // Silmede açılışın tersi kur istemez.
    send(w.t(), null, delete(FINANCE + "/funds/" + fund)).andExpect(status().isNoContent());
  }

  private Map<String, Object> openingLeg(World w, String fund, String sourceType) {
    return jdbc.queryForMap(
        ("select exchange_rate, tl_amount, transaction_date from \"%s\".fund_transaction"
                + " where fund_account_id = ?::uuid and source_type = ?"
                + " order by created_at limit 1")
            .formatted(w.schema()),
        fund,
        sourceType);
  }

  @Test
  void aktifPasifVeSilme() throws Exception {
    World w = world("fnb");
    String cash = id(createFund(w, null, fund("KS-P", "CASH", "TRY", w.a1(), true)));
    String manual = manualFund(w, cash, "IN", "100", TODAY, null);

    // Pasif: manuel hareket 422; liste süzgeci; seçim listelerinde yok.
    JsonNode passive =
        body(
            sendJson(w.t(), null, patch(FINANCE + "/funds/" + cash + "/active"), active(false))
                .andExpect(status().isOk()));
    assertThat(passive.get("active").asBoolean()).isFalse();
    sendJson(w.t(), null, patch(FINANCE + "/funds/" + cash + "/active"), active(false))
        .andExpect(status().isOk());
    expect(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/funds/" + cash + "/transactions"),
            manualBody("IN", "10", TODAY, null)),
        422,
        "FUND_INACTIVE");
    assertThat(codes(list(w, null, Map.of("active", "false")))).containsExactly("KS-P");
    assertThat(codes(list(w, null, Map.of("active", "true")))).doesNotContain("KS-P");
    JsonNode fleetOptions =
        body(send(w.t(), null, get("/api/v1/fleet/options")).andExpect(status().isOk()));
    assertThat(fleetOptions.get("funds").findValuesAsText("id")).doesNotContain(cash).isNotEmpty();
    String bank = id(createFund(w, null, fund("BN-P", "BANK", "TRY", w.a1(), true)));
    JsonNode integrationOptions =
        body(send(w.t(), null, get("/api/v1/integration/options")).andExpect(status().isOk()));
    assertThat(integrationOptions.get("bankAccounts").findValuesAsText("id")).containsExactly(bank);
    sendJson(w.t(), null, patch(FINANCE + "/funds/" + bank + "/active"), active(false))
        .andExpect(status().isOk());
    assertThat(
            body(send(w.t(), null, get("/api/v1/integration/options"))).get("bankAccounts").size())
        .isZero();

    // Ters kayıt ve çek geçişi (türetilmiş akış) pasif hesapta engellenmez.
    send(
            w.t(),
            null,
            post(FINANCE + "/funds/transactions/" + manual + "/reverse")
                .contentType("application/json")
                .content(json.writeValueAsString(Map.of("date", TODAY.toString()))))
        .andExpect(status().isOk());
    UUID customer = account(w, AccountType.CUSTOMER, null);
    Map<String, Object> collection = new HashMap<>();
    collection.put("method", "CHECK");
    collection.put("accountId", customer.toString());
    collection.put("branchId", w.a1());
    collection.put("money", Map.of("amount", "40", "currency", "TRY"));
    collection.put("date", TODAY.toString());
    collection.put(
        "instrument",
        Map.of("kind", "CHECK", "number", "0000011", "dueDate", TODAY.plusDays(30).toString()));
    String instrument =
        body(sendJson(w.t(), null, post(FINANCE + "/collections"), collection)
                .andExpect(status().isCreated()))
            .get("instrumentId")
            .asText();
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/instruments/" + instrument + "/transition"),
            Map.of(
                "toStatus", "COLLECTED_TO_CASH", "date", TODAY.toString(), "fundAccountId", cash))
        .andExpect(status().isOk());

    // Yeniden aktif.
    sendJson(w.t(), null, patch(FINANCE + "/funds/" + cash + "/active"), active(true))
        .andExpect(status().isOk());
    assertThat(
            jdbc.queryForObject(
                ("select count(*) from \"%s\".audit_log where target = ?"
                        + " and event_type in ('FUND_ACTIVATED', 'FUND_DEACTIVATED')")
                    .formatted(w.schema()),
                Integer.class,
                "FUND:" + cash))
        .isEqualTo(2);

    // Silme denetimi: manuel + ters + çek tahsili = 3 hareket, 1 çek.
    JsonNode check = canDelete(w, cash);
    assertThat(check.get("allowed").asBoolean()).isFalse();
    assertThat(reasons(check))
        .containsEntry("FUND_TRANSACTION", 3L)
        .containsEntry("INSTRUMENT", 1L);
    JsonNode refused =
        body(
            send(w.t(), null, delete(FINANCE + "/funds/" + cash)).andExpect(status().isConflict()));
    assertThat(refused.get("code").asText()).isEqualTo("FUND_HAS_TRANSACTIONS");
    List<String> refusedDetails = new ArrayList<>();
    refused.get("details").forEach(d -> refusedDetails.add(d.asText()));
    assertThat(refusedDetails).contains("FUND_TRANSACTION=3", "INSTRUMENT=1");

    // Yalnız açılışlı hesap silinir; açılış kendi tarihiyle ters çevrilir.
    Map<String, Object> opened = fund("KS-OPEN", "CASH", "TRY", w.a2(), false);
    opened.put("openingBalance", "500");
    opened.put("openingDate", TODAY.minusDays(3).toString());
    String openOnly = id(createFund(w, null, opened));
    JsonNode allowed = canDelete(w, openOnly);
    assertThat(allowed.get("allowed").asBoolean()).isTrue();
    assertThat(allowed.get("reasons")).isEmpty();
    send(w.t(), null, delete(FINANCE + "/funds/" + openOnly)).andExpect(status().isNoContent());
    expect(send(w.t(), null, get(FINANCE + "/funds/" + openOnly)), 404, "FUND_NOT_FOUND");
    assertThat(
            jdbc.queryForObject(
                ("select coalesce(sum(case when direction = 'IN' then amount else -amount end), 0)"
                        + " from \"%s\".fund_transaction where fund_account_id = ?")
                    .formatted(w.schema()),
                BigDecimal.class,
                UUID.fromString(openOnly)))
        .isEqualByComparingTo("0");
    assertThat(
            jdbc.queryForObject(
                ("select transaction_date from \"%s\".fund_transaction"
                        + " where fund_account_id = ? and source_type = 'REVERSAL'")
                    .formatted(w.schema()),
                LocalDate.class,
                UUID.fromString(openOnly)))
        .isEqualTo(TODAY.minusDays(3));

    // Hareketsiz hesap silinir; şirketin varsayılan hesabı silinmez.
    String empty = id(createFund(w, null, fund("KS-EMPTY", "CASH", "TRY", w.a1(), false)));
    jdbc.update(
        "update \"%s\".company set default_fund_account_id = ? where id = ?".formatted(w.schema()),
        UUID.fromString(empty),
        w.companyAId());
    JsonNode defaultCheck = canDelete(w, empty);
    assertThat(defaultCheck.get("allowed").asBoolean()).isFalse();
    assertThat(reasons(defaultCheck)).containsExactly(Map.entry("COMPANY_DEFAULT", 1L));
    expect(send(w.t(), null, delete(FINANCE + "/funds/" + empty)), 409, "FUND_IS_COMPANY_DEFAULT");
    jdbc.update(
        "update \"%s\".company set default_fund_account_id = null where id = ?"
            .formatted(w.schema()),
        w.companyAId());
    send(w.t(), null, delete(FINANCE + "/funds/" + empty)).andExpect(status().isNoContent());

    // Manuel hareket kategorisi: yalnız Masraf/Gelir/Diğer.
    expect(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/funds/" + cash + "/transactions"),
            manualBody("IN", "10", TODAY, "OPENING")),
        400,
        "FUND_CATEGORY_INVALID");
    JsonNode income =
        body(
            sendJson(
                    w.t(),
                    null,
                    post(FINANCE + "/funds/" + cash + "/transactions"),
                    manualBody("IN", "10", TODAY, "INCOME"))
                .andExpect(status().isCreated()));
    assertThat(income.get("category").asText()).isEqualTo("INCOME");
    assertThat(income.get("companyId").asText()).isEqualTo(w.companyA());
  }

  @Test
  void listeOzetSparklineYetkiVeIzolasyon() throws Exception {
    World w = world("fnc");
    Map<String, Object> bankBody = fund("BN-A1", "BANK", "TRY", w.a1(), false);
    bankBody.put("bankName", "Akbank");
    bankBody.put("openingBalance", "100");
    bankBody.put("openingDate", TODAY.minusDays(10).toString());
    String bankA = id(createFund(w, null, bankBody));
    Map<String, Object> usdBody = fund("BN-USD", "BANK", "USD", w.b1(), false);
    usdBody.put("bankName", "Garanti");
    String usd = id(createFund(w, null, usdBody));
    manualFund(w, w.fundA1(), "IN", "50", TODAY, "INCOME");
    manualFund(w, w.fundA1(), "IN", "30", TODAY.plusDays(5), "INCOME");

    // Liste: sıra tür (BANK önce), hesap türü, banka adı, ad; süzgeçler.
    assertThat(codes(list(w, null, Map.of())))
        .containsExactly("BN-A1", "BN-USD", "KASA-A1", "KASA-A2", "KASA-B1");
    assertThat(codes(list(w, null, Map.of("kind", "BANK")))).containsExactly("BN-A1", "BN-USD");
    assertThat(codes(list(w, null, Map.of("currency", "usd")))).containsExactly("BN-USD");
    assertThat(codes(list(w, null, Map.of("companyId", w.companyB()))))
        .containsExactly("BN-USD", "KASA-B1");
    assertThat(codes(list(w, null, Map.of("accountType", "DEMAND")))).hasSize(5);
    assertThat(codes(list(w, null, Map.of("accountType", "CREDIT")))).isEmpty();
    assertThat(codes(list(w, null, Map.of("branchId", w.a2())))).containsExactly("KASA-A2");

    JsonNode kasa = byId(list(w, null, Map.of()), w.fundA1());
    assertThat(amount(kasa, "balance")).isEqualByComparingTo("80");
    assertThat(amount(kasa, "currentBalance")).isEqualByComparingTo("50");
    assertThat(kasa.get("futureCount").asInt()).isEqualTo(1);
    assertThat(amount(kasa, "futureNet")).isEqualByComparingTo("30");
    assertThat(kasa.get("transactionCount").asLong()).isEqualTo(2);
    JsonNode later = byId(list(w, null, Map.of("asOf", TODAY.plusDays(5).toString())), w.fundA1());
    assertThat(amount(later, "currentBalance")).isEqualByComparingTo("80");
    assertThat(later.get("futureCount").asInt()).isZero();

    // Özet: şirket kırılımı + konsolide; pasifler inactiveCount'ta.
    sendJson(w.t(), null, patch(FINANCE + "/funds/" + usd + "/active"), active(false))
        .andExpect(status().isOk());
    JsonNode summary =
        body(send(w.t(), null, get(FINANCE + "/funds/summary")).andExpect(status().isOk()));
    assertThat(summary).hasSize(4);
    JsonNode aCash = summaryRow(summary, w.companyA(), "CASH", "TRY");
    assertThat(aCash.get("count").asInt()).isEqualTo(2);
    assertThat(amount(aCash, "currentBalance")).isEqualByComparingTo("50");
    assertThat(amount(aCash, "balance")).isEqualByComparingTo("80");
    assertThat(amount(aCash, "futureNet")).isEqualByComparingTo("30");
    JsonNode aBank = summaryRow(summary, w.companyA(), "BANK", "TRY");
    assertThat(amount(aBank, "openingTotal")).isEqualByComparingTo("100");
    assertThat(aBank.get("accountType").asText()).isEqualTo("DEMAND");
    JsonNode bUsd = summaryRow(summary, w.companyB(), "BANK", "USD");
    assertThat(bUsd.get("count").asInt()).isEqualTo(1);
    assertThat(bUsd.get("inactiveCount").asInt()).isEqualTo(1);
    JsonNode onlyB =
        body(
            send(w.t(), null, get(FINANCE + "/funds/summary").param("companyId", w.companyB()))
                .andExpect(status().isOk()));
    assertThat(onlyB.findValuesAsText("companyId")).containsOnly(w.companyB());
    assertThat(
            body(send(w.t(), null, get(FINANCE + "/funds/summary").param("kind", "BANK")))
                .findValuesAsText("kind"))
        .containsOnly("BANK");

    // Sparkline: son 20 hareket, eskiden yeniye, ileri tarihli hariç.
    String spark = id(createFund(w, null, fund("KS-SP", "CASH", "TRY", w.a1(), true)));
    for (int i = 1; i <= 22; i++) {
      manualFund(
          w, spark, i % 2 == 0 ? "IN" : "OUT", String.valueOf(i), TODAY.minusDays(22 - i), null);
    }
    manualFund(w, spark, "IN", "999", TODAY.plusDays(1), null);
    JsonNode sparks =
        body(
            send(
                    w.t(),
                    null,
                    get(FINANCE + "/funds/sparklines")
                        .param("ids", spark, w.fundA2(), UUID.randomUUID().toString()))
                .andExpect(status().isOk()));
    assertThat(sparks).hasSize(2);
    assertThat(sparks.get(0).get("fundId").asText()).isEqualTo(spark);
    List<BigDecimal> points = new ArrayList<>();
    sparks.get(0).get("points").forEach(p -> points.add(p.decimalValue()));
    assertThat(points).hasSize(20);
    assertThat(points.get(0)).isEqualByComparingTo("-3");
    assertThat(points.get(19)).isEqualByComparingTo("22");
    assertThat(sparks.get(1).get("points")).isEmpty();
    List<String> tooMany = new ArrayList<>();
    for (int i = 0; i < 201; i++) {
      tooMany.add(UUID.randomUUID().toString());
    }
    expect(
        send(
            w.t(),
            null,
            get(FINANCE + "/funds/sparklines").param("ids", tooMany.toArray(String[]::new))),
        400,
        "TOO_MANY_IDS");

    // Yetki: VIEW yazamaz.
    String accounting = userWithRole(w, "muhasebe", "ACCOUNTING");
    createFund(w, accounting, fund("KS-RO", "CASH", "TRY", w.a1(), false))
        .andExpect(status().isForbidden());
    sendJson(w.t(), accounting, patch(FINANCE + "/funds/" + bankA + "/active"), active(false))
        .andExpect(status().isForbidden());
    send(w.t(), accounting, get(FINANCE + "/funds/" + bankA + "/can-delete"))
        .andExpect(status().isOk());

    // LIMITED (A1): yalnız kendi iş yerinin hesapları; kapsam dışı detay 403, sparkline atlar.
    String a1User = limitedUser(w, "a1", "FINANCE", List.of(w.a1()));
    assertThat(codes(list(w, a1User, Map.of()))).containsExactly("BN-A1", "KASA-A1", "KS-SP");
    expect(send(w.t(), a1User, get(FINANCE + "/funds/" + usd)), 403, "BRANCH_OUT_OF_SCOPE");
    expect(
        sendJson(w.t(), a1User, patch(FINANCE + "/funds/" + usd + "/active"), active(true)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    assertThat(
            body(send(
                    w.t(),
                    a1User,
                    get(FINANCE + "/funds/sparklines").param("ids", usd, w.fundA1())))
                .findValuesAsText("fundId"))
        .containsExactly(w.fundA1());
    expect(
        send(w.t(), a1User, get(FINANCE + "/funds/summary").param("companyId", w.companyB())),
        403,
        "COMPANY_OUT_OF_SCOPE");

    // Kiracı izolasyonu: başka kiracının hesabı 404.
    World other = world("fnd");
    expect(send(other.t(), null, get(FINANCE + "/funds/" + bankA)), 404, "FUND_NOT_FOUND");
    expect(
        send(other.t(), null, get(FINANCE + "/funds/" + bankA + "/can-delete")),
        404,
        "FUND_NOT_FOUND");
  }

  // --- yardımcılar

  private static Map<String, Object> fund(
      String code, String kind, String currency, String branch, boolean allowNegative) {
    Map<String, Object> body = new HashMap<>();
    body.put("code", code);
    body.put("name", code);
    body.put("kind", kind);
    body.put("currency", currency);
    body.put("branchId", branch);
    body.put("allowNegative", allowNegative);
    return body;
  }

  private static Map<String, Object> update(String name, String branch, boolean allowNegative) {
    Map<String, Object> body = new HashMap<>();
    body.put("name", name);
    body.put("branchId", branch);
    body.put("bankName", "Ziraat");
    body.put("allowNegative", allowNegative);
    return body;
  }

  private static Map<String, Object> active(boolean active) {
    return Map.of("active", active);
  }

  private static Map<String, Object> manualBody(
      String direction, String amount, LocalDate date, String category) {
    Map<String, Object> body = new HashMap<>();
    body.put("direction", direction);
    body.put("money", Map.of("amount", amount, "currency", "TRY"));
    body.put("date", date.toString());
    body.put("description", "Elle " + direction);
    if (category != null) {
      body.put("category", category);
    }
    return body;
  }

  private ResultActions createFund(World w, String token, Map<String, Object> body)
      throws Exception {
    return sendJson(w.t(), token, post(FINANCE + "/funds"), body);
  }

  private ResultActions updateFund(World w, String id, Map<String, Object> body) throws Exception {
    return sendJson(w.t(), null, put(FINANCE + "/funds/" + id), body);
  }

  private String manualFund(
      World w, String fund, String direction, String amount, LocalDate date, String category)
      throws Exception {
    return id(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/funds/" + fund + "/transactions"),
            manualBody(direction, amount, date, category)));
  }

  private JsonNode list(World w, String token, Map<String, String> params) throws Exception {
    var request = get(FINANCE + "/funds");
    params.forEach(request::param);
    return body(send(w.t(), token, request).andExpect(status().isOk()));
  }

  private JsonNode detail(World w, String token, String id) throws Exception {
    return body(send(w.t(), token, get(FINANCE + "/funds/" + id)).andExpect(status().isOk()));
  }

  private JsonNode canDelete(World w, String id) throws Exception {
    return body(
        send(w.t(), null, get(FINANCE + "/funds/" + id + "/can-delete"))
            .andExpect(status().isOk()));
  }

  private int txCount(World w, String fund) {
    return jdbc.queryForObject(
        "select count(*) from \"%s\".fund_transaction where fund_account_id = ?"
            .formatted(w.schema()),
        Integer.class,
        UUID.fromString(fund));
  }

  private static Map<String, Long> reasons(JsonNode check) {
    Map<String, Long> map = new HashMap<>();
    check.get("reasons").forEach(r -> map.put(r.get("kind").asText(), r.get("count").asLong()));
    return map;
  }

  private static List<String> codes(JsonNode rows) {
    List<String> codes = new ArrayList<>();
    rows.forEach(r -> codes.add(r.get("code").asText()));
    return codes;
  }

  private static JsonNode byId(JsonNode rows, String id) {
    for (JsonNode row : rows) {
      if (id.equals(row.get("id").asText())) {
        return row;
      }
    }
    throw new AssertionError("Hesap yok: " + id);
  }

  private static JsonNode summaryRow(
      JsonNode rows, String companyId, String kind, String currency) {
    for (JsonNode row : rows) {
      if (companyId.equals(row.get("companyId").asText())
          && kind.equals(row.get("kind").asText())
          && currency.equals(row.get("currency").asText())) {
        return row;
      }
    }
    throw new AssertionError("Özet satırı yok: " + companyId + " " + kind + " " + currency);
  }

  private static BigDecimal amount(JsonNode node, String field) {
    return node.get(field).decimalValue();
  }
}
