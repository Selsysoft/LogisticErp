package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Günlük ödeme/tahsilat raporu (12.2a §3.8, §6.2 {@code DailyReportIT}): o tarihteki durum ve fon
 * bakiyesi uzlaşması (Rev 1 F-4), banka/kasaya yansıyan çek hareketleri ve ters tarihleri,
 * süzgeçler, iki şirket ve LIMITED kapsamda sessiz fon atlaması (Rev 1 SEC-02), personel maskesi
 * (SEC-01), sıralama, satır sınırı ve ondalık metin para alanları.
 */
class DailyReportIT extends SettlementTestSupport {

  private static final String DAILY = FINANCE + "/reports/daily";

  /** Rapor günü: iptal tarihleri (D+2, D+3) bugünden ileri olmasın diye geçmişte. */
  private static final LocalDate D = TODAY.minusDays(5);

  @Test
  void oTarihtekiDurumVeFonBakiyesiUzlasir() throws Exception {
    World w = world("dr1");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    String cash = w.fundA1();
    // Açılış: rapor gününden önce 50.
    id(collect(w, null, dated(body("CASH", customer, w.a1(), cash, "50"), D.minusDays(1)), null));
    String later =
        id(collect(w, null, dated(body("CASH", customer, w.a1(), cash, "100"), D), null));
    String kept = id(collect(w, null, dated(body("CASH", customer, w.a1(), cash, "200"), D), null));
    String sameDay =
        id(collect(w, null, dated(body("CASH", customer, w.a1(), cash, "30"), D), null));
    reverse(w, null, sameDay, D, "Aynı gün iptal").andExpect(status().isOk());
    reverse(w, null, later, D.plusDays(3), "Sonradan iptal").andExpect(status().isOk());
    // İleri tarihli hareket: güncel bakiyeye girer, gün sonuna girmez.
    id(collect(w, null, dated(body("CASH", customer, w.a1(), cash, "7"), TODAY.plusDays(2)), null));

    JsonNode report = daily(w, null, "COLLECTION", D);
    assertThat(report.get("type").asText()).isEqualTo("COLLECTION");
    assertThat(report.get("date").asText()).isEqualTo(D.toString());
    assertThat(ids(report)).containsExactly(later, kept);
    JsonNode reversedLater = byId(report).get(later);
    assertThat(reversedLater.get("status").asText()).isEqualTo("REVERSED");
    assertThat(reversedLater.get("reversedOn").asText()).isEqualTo(D.plusDays(3).toString());
    assertThat(reversedLater.get("lockReason").asText()).isEqualTo("REVERSED");
    assertThat(byId(report).get(kept).get("reversedOn").isNull()).isTrue();
    // Liste satırının alanları (üst küme) ve ondalık metin para alanları.
    assertThat(reversedLater.get("money").get("amount").isTextual()).isTrue();
    assertThat(reversedLater.get("fxUsed").isTextual()).isTrue();
    assertThat(reversedLater.get("displayMethod").asText()).isEqualTo("CASH");
    assertThat(reversedLater.get("branchName").asText()).isEqualTo("A1 Merkez");

    // totals eski biçimde (iş yeri × para birimi; sonradan iptal edilen dahil).
    assertThat(report.get("totals")).hasSize(1);
    JsonNode total = report.get("totals").get(0);
    assertThat(total.get("branchId").asText()).isEqualTo(w.a1());
    assertThat(total.get("currency").asText()).isEqualTo("TRY");
    assertThat(total.get("total").decimalValue()).isEqualByComparingTo("300");
    assertThat(total.get("count").asInt()).isEqualTo(2);

    // Açılış + satır toplamı = gün sonu bakiyesi; güncel bakiye ileri tarihli hareketi içerir.
    assertThat(report.get("fundBalances")).hasSize(1);
    JsonNode balance = report.get("fundBalances").get(0);
    assertThat(balance.get("fundAccountId").asText()).isEqualTo(cash);
    assertThat(balance.get("name").asText()).isEqualTo("KASA-A1");
    assertThat(balance.get("kind").asText()).isEqualTo("CASH");
    assertThat(balance.get("currency").asText()).isEqualTo("TRY");
    assertThat(balance.get("branchId").asText()).isEqualTo(w.a1());
    assertThat(balance.get("branchName").asText()).isEqualTo("A1 Merkez");
    assertThat(balance.get("balanceAtDate").isTextual()).isTrue();
    assertThat(balance.get("balanceNow").isTextual()).isTrue();
    BigDecimal opening = fundBalanceBefore(w, cash, D);
    assertThat(opening).isEqualByComparingTo("50");
    BigDecimal rowSum = BigDecimal.ZERO;
    for (JsonNode row : report.get("rows")) {
      rowSum = rowSum.add(new BigDecimal(row.get("money").get("amount").asText()));
    }
    assertThat(new BigDecimal(balance.get("balanceAtDate").asText()))
        .isEqualByComparingTo(opening.add(rowSum))
        .isEqualByComparingTo("350");
    assertThat(new BigDecimal(balance.get("balanceNow").asText())).isEqualByComparingTo("257");
    assertThat(report.get("instrumentFundMovements")).isEmpty();

    // Sıralama: varsayılan kayıt zamanı artan, TIME_DESC azalan.
    assertThat(ids(daily(w, null, "COLLECTION", D, "sort", "TIME_ASC")))
        .containsExactly(later, kept);
    assertThat(ids(daily(w, null, "COLLECTION", D, "sort", "TIME_DESC")))
        .containsExactly(kept, later);
    // İptal günü (D+3) ve iptal edilen kaydın kendi günü dışındaki raporlar.
    assertThat(ids(daily(w, null, "COLLECTION", D.plusDays(3)))).isEmpty();
    assertThat(daily(w, null, "PAYMENT", D).get("rows")).isEmpty();
    // Satırsız gün: aday fon yok.
    assertThat(daily(w, null, "COLLECTION", D.plusDays(1)).get("fundBalances")).isEmpty();
    // Süzgeçte istenen fon satırsız günde de bakiyesiyle döner.
    JsonNode requested = daily(w, null, "COLLECTION", D.plusDays(1), "fundAccountIds", cash);
    assertThat(requested.get("fundBalances")).hasSize(1);
    assertThat(new BigDecimal(requested.get("fundBalances").get(0).get("balanceAtDate").asText()))
        .isEqualByComparingTo("350");
  }

  @Test
  void bankayaYansiyanCekHareketleriTersTarihineGore() throws Exception {
    World w = world("dr2");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    String kept = collectCheck(w, customer, w.a1(), "1000", "1000001");
    String laterReversed = collectCheck(w, customer, w.a1(), "300", "1000002");
    String sameDayReversed = collectCheck(w, customer, w.a1(), "50", "1000003");
    for (String check : List.of(kept, laterReversed, sameDayReversed)) {
      move(w, null, check, "AT_BANK", bank, D).andExpect(status().isOk());
      move(w, null, check, "COLLECTED", null, D).andExpect(status().isOk());
    }
    reverseInstrumentFund(w, laterReversed, D.plusDays(2));
    reverseInstrumentFund(w, sameDayReversed, D);
    // Verilen çekin ödenmesi ödeme raporuna (OUT) düşer.
    String issued = issueCheck(w, supplier, w.a1(), "400", "2000001");
    move(w, null, issued, "PAID", bank, D).andExpect(status().isOk());

    JsonNode collections = daily(w, null, "COLLECTION", D);
    assertThat(collections.get("instrumentFundMovements")).hasSize(1);
    JsonNode movement = collections.get("instrumentFundMovements").get(0);
    assertThat(movement.get("branchId").asText()).isEqualTo(w.a1());
    assertThat(movement.get("branchName").asText()).isEqualTo("A1 Merkez");
    assertThat(movement.get("fundAccountId").asText()).isEqualTo(bank);
    assertThat(movement.get("fundName").asText()).isEqualTo("BANKA-A1");
    assertThat(movement.get("fundKind").asText()).isEqualTo("BANK");
    assertThat(movement.get("currency").asText()).isEqualTo("TRY");
    // D+2'de ters çevrilen hareket D raporunda var; aynı gün ters çevrilen yok.
    assertThat(movement.get("count").asInt()).isEqualTo(2);
    assertThat(movement.get("total").isTextual()).isTrue();
    assertThat(new BigDecimal(movement.get("total").asText())).isEqualByComparingTo("1300");
    // Çekli tahsilat kendi tarihinde (D − 1) satırdır; çek hareketi o güne yansımaz.
    JsonNode checkDay = daily(w, null, "COLLECTION", D.minusDays(1));
    assertThat(checkDay.get("rows")).hasSize(3);
    checkDay
        .get("rows")
        .forEach(row -> assertThat(row.get("displayMethod").asText()).isEqualTo("CHECK"));
    assertThat(checkDay.get("fundBalances")).isEmpty();
    assertThat(checkDay.get("instrumentFundMovements")).isEmpty();
    // Ters satırlar kendi günlerinde sayılmaz.
    assertThat(daily(w, null, "COLLECTION", D.plusDays(2)).get("instrumentFundMovements"))
        .isEmpty();

    JsonNode payments = daily(w, null, "PAYMENT", D);
    assertThat(payments.get("instrumentFundMovements")).hasSize(1);
    assertThat(payments.get("instrumentFundMovements").get(0).get("count").asInt()).isEqualTo(1);
    assertThat(new BigDecimal(payments.get("instrumentFundMovements").get(0).get("total").asText()))
        .isEqualByComparingTo("400");

    // Fon ve para birimi süzgeci çek hareketine de uygulanır.
    assertThat(
            daily(w, null, "COLLECTION", D, "fundAccountIds", w.fundA1())
                .get("instrumentFundMovements"))
        .isEmpty();
    assertThat(daily(w, null, "COLLECTION", D, "currency", "USD").get("instrumentFundMovements"))
        .isEmpty();
    assertThat(
            daily(w, null, "COLLECTION", D, "currency", "try", "fundAccountIds", bank)
                .get("instrumentFundMovements"))
        .hasSize(1);
  }

  @Test
  void suzgeclerIkiSirketVeLimitedKapsamdaFonSessizAtlanir() throws Exception {
    World w = world("dr3");
    String a1User = limitedUser(w, "a1", "FINANCE", List.of(w.a1()));
    UUID customer = account(w, AccountType.CUSTOMER, null);
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    String usd = bankFund(w, "USD-A1", w.a1(), "USD");
    String bankA2 = bankFund(w, "BANKA-A2", w.a2(), "TRY");
    String cashA1 =
        id(collect(w, null, dated(body("CASH", customer, w.a1(), w.fundA1(), "10"), D), null));
    String cashA2 =
        id(collect(w, null, dated(body("CASH", customer, w.a2(), w.fundA2(), "20"), D), null));
    String cashB1 =
        id(collect(w, null, dated(body("CASH", customer, w.b1(), w.fundB1(), "30"), D), null));
    Map<String, Object> card = dated(body("BANK", customer, w.a1(), bank, "40"), D);
    card.put("channel", "CREDIT_CARD");
    String cardA1 = id(collect(w, null, card, null));
    Map<String, Object> dollars = dated(body("BANK", customer, w.a1(), usd, "5"), D);
    dollars.put("money", Map.of("amount", "5", "currency", "USD"));
    dollars.put("exchangeRate", "30");
    String usdA1 = id(collect(w, null, dollars, null));
    // A1'deki çek A2'deki bankaya yatırılıp tahsil edilir.
    String check = collectCheck(w, customer, w.a1(), "500", "3000001");
    move(w, null, check, "AT_BANK", bankA2, D).andExpect(status().isOk());
    move(w, null, check, "COLLECTED", null, D).andExpect(status().isOk());

    JsonNode all = daily(w, null, "COLLECTION", D);
    assertThat(ids(all)).containsExactlyInAnyOrder(cashA1, cashA2, cashB1, cardA1, usdA1);
    assertThat(fundIds(all))
        .containsExactlyInAnyOrder(w.fundA1(), w.fundA2(), w.fundB1(), bank, usd);
    assertThat(all.get("instrumentFundMovements")).hasSize(1);
    assertThat(all.get("totals")).hasSize(4);

    // Süzgeçler: fon, para birimi, yöntem, iş yeri, şirket.
    assertThat(ids(daily(w, null, "COLLECTION", D, "fundAccountIds", bank, "fundAccountIds", usd)))
        .containsExactlyInAnyOrder(cardA1, usdA1);
    JsonNode dollarsOnly = daily(w, null, "COLLECTION", D, "currency", "USD");
    assertThat(ids(dollarsOnly)).containsExactly(usdA1);
    assertThat(fundIds(dollarsOnly)).containsExactly(usd);
    assertThat(ids(daily(w, null, "COLLECTION", D, "method", "CREDIT_CARD")))
        .containsExactly(cardA1);
    assertThat(ids(daily(w, null, "COLLECTION", D, "method", "BANK"))).containsExactly(usdA1);
    assertThat(ids(daily(w, null, "COLLECTION", D, "method", "CASH", "method", "CREDIT_CARD")))
        .containsExactlyInAnyOrder(cashA1, cashA2, cashB1, cardA1);
    expect(dailyCall(w, null, "COLLECTION", D, "method", "OTHER"), 400, "METHOD_INVALID");
    assertThat(ids(daily(w, null, "COLLECTION", D, "branchIds", w.a2()))).containsExactly(cashA2);

    // SEC-02: A şirketi süzgecinde B'nin fonu istenirse sessizce atlanır (403 yok).
    JsonNode companyA =
        daily(
            w,
            null,
            "COLLECTION",
            D,
            "companyId",
            w.companyA(),
            "fundAccountIds",
            w.fundA1(),
            "fundAccountIds",
            w.fundB1());
    assertThat(ids(companyA)).containsExactly(cashA1);
    assertThat(fundIds(companyA)).containsExactly(w.fundA1());
    JsonNode companyB = daily(w, null, "COLLECTION", D, "companyId", w.companyB());
    assertThat(ids(companyB)).containsExactly(cashB1);
    assertThat(fundIds(companyB)).containsExactly(w.fundB1());
    assertThat(companyB.get("instrumentFundMovements")).isEmpty();
    // İstenen iş yerleri dışındaki fon yok.
    JsonNode a1Only =
        daily(
            w,
            null,
            "COLLECTION",
            D,
            "branchIds",
            w.a1(),
            "fundAccountIds",
            w.fundA1(),
            "fundAccountIds",
            w.fundA2());
    assertThat(fundIds(a1Only)).containsExactly(w.fundA1());
    // Çek A1'de ama banka A2'de: A1 süzgecinde görünmez.
    assertThat(a1Only.get("instrumentFundMovements")).isEmpty();

    // LIMITED (yalnız A1): kapsam dışı fon ve A2 bankasına yatırılan çek yok.
    JsonNode limited =
        daily(w, a1User, "COLLECTION", D, "fundAccountIds", w.fundA2(), "fundAccountIds", bank);
    assertThat(ids(limited)).containsExactly(cardA1);
    assertThat(fundIds(limited)).containsExactly(bank);
    JsonNode limitedAll = daily(w, a1User, "COLLECTION", D);
    assertThat(ids(limitedAll)).containsExactlyInAnyOrder(cashA1, cardA1, usdA1);
    assertThat(fundIds(limitedAll)).containsExactlyInAnyOrder(w.fundA1(), bank, usd);
    assertThat(limitedAll.get("instrumentFundMovements")).isEmpty();
    expect(dailyCall(w, a1User, "COLLECTION", D, "branchIds", w.a2()), 403, "BRANCH_OUT_OF_SCOPE");

    // Kiracı izolasyonu.
    World other = world("dr3b");
    JsonNode empty = daily(other, null, "COLLECTION", D, "fundAccountIds", w.fundA1());
    assertThat(empty.get("rows")).isEmpty();
    assertThat(empty.get("fundBalances")).isEmpty();
  }

  @Test
  void personelMaskesiVeSatirSiniri() throws Exception {
    World w = world("dr4");
    String finance = userWithRole(w, "finans", "FINANCE");
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    String employeeBank = counterpartyBank(w, employee, "99998888");
    Map<String, Object> salary = dated(body("BANK", employee, w.a1(), bank, "70"), D);
    salary.put("counterpartyBankAccountId", employeeBank);
    salary.put("description", "Maaş ödemesi ****8888 hesabına");
    salary.put("documentNo", "MAAS-1");
    String payment = id(pay(w, null, salary, null));

    JsonNode masked = byId(daily(w, finance, "PAYMENT", D)).get(payment);
    for (String field :
        List.of(
            "accountId",
            "accountCode",
            "accountName",
            "description",
            "counterpartyBankAccountId",
            "counterpartyIbanMasked",
            "counterpartyBankName")) {
      assertThat(masked.get(field).isNull()).as(field).isTrue();
    }
    assertThat(masked.get("employeeMasked").asBoolean()).isTrue();
    assertThat(masked.get("documentNo").asText()).isEqualTo("MAAS-1");
    JsonNode visible = byId(daily(w, null, "PAYMENT", D)).get(payment);
    assertThat(visible.get("employeeMasked").asBoolean()).isFalse();
    assertThat(visible.get("accountId").asText()).isEqualTo(employee.toString());
    assertThat(visible.get("counterpartyBankAccountId").asText()).isEqualTo(employeeBank);

    // 5000 satır sınırı: fazlası 422.
    update(
        w,
        """
        insert into %s.settlement (id, type, method, account_id, branch_id, company_id,
          fund_account_id, amount, currency, settlement_date, status, channel, created_by,
          created_at, updated_by, updated_at, deleted)
        select gen_random_uuid(), 'PAYMENT', 'CASH', null, ?::uuid, ?::uuid, ?::uuid, g, 'TRY', ?,
               'POSTED', null, 'test', now(), 'test', now(), false
        from generate_series(1, 5000) g
        """,
        w.a1(),
        w.companyA(),
        w.fundA1(),
        D.plusDays(1));
    assertThat(daily(w, null, "PAYMENT", D.plusDays(1)).get("rows")).hasSize(5000);
    update(
        w,
        """
        insert into %s.settlement (id, type, method, account_id, branch_id, company_id,
          fund_account_id, amount, currency, settlement_date, status, channel, created_by,
          created_at, updated_by, updated_at, deleted)
        values (gen_random_uuid(), 'PAYMENT', 'CASH', null, ?::uuid, ?::uuid, ?::uuid, 1, 'TRY',
                ?, 'POSTED', null, 'test', now(), 'test', now(), false)
        """,
        w.a1(),
        w.companyA(),
        w.fundA1(),
        D.plusDays(1));
    expect(dailyCall(w, null, "PAYMENT", D.plusDays(1)), 422, "RESULT_TOO_LARGE");
    // Süzgeçle daraltılınca yeniden çalışır.
    assertThat(daily(w, null, "PAYMENT", D.plusDays(1), "branchIds", w.a2()).get("rows").size())
        .isZero();
  }

  // --- yardımcılar

  private static Map<String, Object> dated(Map<String, Object> body, LocalDate date) {
    body.put("date", date.toString());
    return body;
  }

  /** {@code D − 1} tarihli çekli tahsilat; çekin kimliği döner. */
  private String collectCheck(World w, UUID customer, String branch, String amount, String number)
      throws Exception {
    Map<String, Object> body = dated(body("CHECK", customer, branch, null, amount), D.minusDays(1));
    body.put("instrument", instrument(number));
    return body(collect(w, null, body, null).andExpect(status().isCreated()))
        .get("instrumentId")
        .asText();
  }

  /** {@code D − 1} tarihli kendi çekimizle ödeme; çekin kimliği döner. */
  private String issueCheck(World w, UUID supplier, String branch, String amount, String number)
      throws Exception {
    Map<String, Object> body = dated(body("CHECK", supplier, branch, null, amount), D.minusDays(1));
    body.put("instrument", instrument(number));
    return body(pay(w, null, body, null).andExpect(status().isCreated()))
        .get("instrumentId")
        .asText();
  }

  private static Map<String, Object> instrument(String number) {
    return Map.of(
        "kind",
        "CHECK",
        "number",
        number,
        "bankName",
        "Test Bankası",
        "dueDate",
        TODAY.plusDays(30).toString());
  }

  private ResultActions move(
      World w, String token, String instrument, String target, String fund, LocalDate date)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("toStatus", target);
    body.put("date", date.toString());
    if (fund != null) {
      body.put("fundAccountId", fund);
    }
    return sendJson(
        w.t(), token, post(FINANCE + "/instruments/" + instrument + "/transition"), body);
  }

  /**
   * Çekin banka/kasa hareketini verilen tarihte ters çevirir ({@code FundLedgerService.reverse}
   * satırının eşdeğeri: {@code source_type = 'REVERSAL'}, {@code source_id} = orijinal satır).
   * {@code InstrumentService}'te bugün geri alma yolu yok (§6.2).
   */
  private void reverseInstrumentFund(World w, String instrument, LocalDate date) {
    int rows =
        update(
            w,
            """
            insert into %s.fund_transaction (id, fund_account_id, company_id, direction, amount,
              currency, exchange_rate, rate_date, tl_amount, transaction_date, description,
              source_type, source_id, category, created_by, created_at, updated_by, updated_at,
              deleted)
            select gen_random_uuid(), t.fund_account_id, t.company_id,
                   case when t.direction = 'IN' then 'OUT' else 'IN' end, t.amount, t.currency,
                   t.exchange_rate, t.rate_date, t.tl_amount, ?, 'Test ters', 'REVERSAL', t.id,
                   t.category, 'test', now(), 'test', now(), false
            from %s.fund_transaction t
            join %s.instrument_movement m on m.id = t.source_id
            where t.source_type = 'INSTRUMENT' and m.instrument_id = ?::uuid
            """,
            date,
            instrument);
    assertThat(rows).isEqualTo(1);
  }

  private BigDecimal fundBalanceBefore(World w, String fund, LocalDate date) {
    return jdbc.queryForObject(
        ("select coalesce(sum(case when direction = 'IN' then amount else -amount end), 0)"
                + " from \"%s\".fund_transaction where fund_account_id = ?::uuid"
                + " and transaction_date < ? and deleted = false")
            .formatted(w.schema()),
        BigDecimal.class,
        fund,
        date);
  }

  private ResultActions dailyCall(
      World w, String token, String type, LocalDate date, String... params) throws Exception {
    MockHttpServletRequestBuilder request =
        get(DAILY).param("type", type).param("date", date.toString());
    for (int i = 0; i < params.length; i += 2) {
      request.param(params[i], params[i + 1]);
    }
    return send(w.t(), token, request);
  }

  private JsonNode daily(World w, String token, String type, LocalDate date, String... params)
      throws Exception {
    return body(dailyCall(w, token, type, date, params).andExpect(status().isOk()));
  }

  private static List<String> ids(JsonNode report) {
    List<String> ids = new ArrayList<>();
    report.get("rows").forEach(row -> ids.add(row.get("id").asText()));
    return ids;
  }

  private static List<String> fundIds(JsonNode report) {
    List<String> ids = new ArrayList<>();
    report.get("fundBalances").forEach(row -> ids.add(row.get("fundAccountId").asText()));
    return ids;
  }

  private static Map<String, JsonNode> byId(JsonNode report) {
    Map<String, JsonNode> map = new HashMap<>();
    report.get("rows").forEach(row -> map.put(row.get("id").asText(), row));
    return map;
  }
}
