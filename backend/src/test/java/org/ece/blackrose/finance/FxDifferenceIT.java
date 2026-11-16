package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
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
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Kur farkı raporu ve elle onaylı kesim (04 §6.2-Y8; 12.8_TASARIM §3.2, §6.2 FxDifferenceIT 1–11).
 * Kur tablosu ({@code admin.exchange_rate}) tüm kiracılarda ortaktır: bu sınıf yalnız {@code JPY}
 * yazar, tarihleri geçmişte sabittir ve her değerleme tarihi açıkça verilir.
 */
class FxDifferenceIT extends AccountTestSupport {

  private static final String JPY = "JPY";
  private static final String REPORT = FINANCE + "/reports/fx-differences";
  private static final String CUT = FINANCE + "/fx-differences";

  /** Kaynak tarihi; işlem kuru elle 0,20 (1000 JPY = 200 TL). */
  private static final LocalDate SOURCE_DATE = TODAY.minusDays(40);

  /** Kur tablosu: D30 = 0,25, D20 = 0,15, D10 = 0,30 (D60 = 0,20 taban). */
  private static final LocalDate D60 = TODAY.minusDays(60);

  private static final LocalDate D30 = TODAY.minusDays(30);
  private static final LocalDate D25 = TODAY.minusDays(25);
  private static final LocalDate D20 = TODAY.minusDays(20);
  private static final LocalDate D15 = TODAY.minusDays(15);
  private static final LocalDate D10 = TODAY.minusDays(10);

  @BeforeEach
  void rates() {
    rate(D60, "0.20");
    rate(D30, "0.25");
    rate(D20, "0.15");
    rate(D10, "0.30");
  }

  // --- 1. kayıt (4 durum)

  @Test
  void dortYonDurumuDogruBelgeDefterVeGelirGiderYazar() throws Exception {
    World w = world("fxd");
    assertCase(w, Direction.DEBIT, D25, "50", "RECEIVABLE", "DEBIT", "INCOME");
    assertCase(w, Direction.DEBIT, D15, "-50", "PAYABLE", "CREDIT", "EXPENSE");
    assertCase(w, Direction.CREDIT, D25, "50", "PAYABLE", "CREDIT", "EXPENSE");
    assertCase(w, Direction.CREDIT, D15, "-50", "RECEIVABLE", "DEBIT", "INCOME");
  }

  private void assertCase(
      World w,
      Direction direction,
      LocalDate valuation,
      String difference,
      String side,
      String ledgerDirection,
      String ieDirection)
      throws Exception {
    UUID account = account(w, AccountType.CUSTOMER, null);
    UUID source = manualJpy(w, account, w.a1(), direction, "1000", SOURCE_DATE);
    JsonNode doc = body(cut(w, null, source, valuation, difference, null).andExpect(created()));
    assertThat(doc.get("side").asText()).isEqualTo(side);
    assertThat(doc.get("documentType").asText()).isEqualTo("KUR_FARKI");
    assertThat(doc.get("currency").asText()).isEqualTo("TRY");
    assertThat(dec(doc.get("amount"))).isEqualByComparingTo("50");
    assertThat(doc.get("documentNo").asText())
        .isEqualTo("KF-" + source.toString().substring(0, 8).toUpperCase());
    assertThat(doc.get("fxSourceTransactionId").asText()).isEqualTo(source.toString());
    assertThat(dec(doc.get("fxRate")))
        .isEqualByComparingTo(valuation.equals(D25) ? "0.25" : "0.15");
    assertThat(doc.get("fxRateDate").asText())
        .isEqualTo(valuation.equals(D25) ? D30 + "" : D20 + "");
    assertThat(doc.get("documentDate").asText()).isEqualTo(valuation.toString());
    assertThat(doc.get("description").asText()).startsWith("Kur farkı (JPY 1.000,00 × (");

    Map<String, Object> ledger =
        row(
            w,
            "select direction, amount, currency, transaction_date from \"%s\".account_transaction"
                + " where source_type = 'ACCOUNT_DOCUMENT' and source_id = ?",
            UUID.fromString(doc.get("id").asText()));
    assertThat(ledger.get("direction")).isEqualTo(ledgerDirection);
    assertThat((BigDecimal) ledger.get("amount")).isEqualByComparingTo("50");
    assertThat(ledger.get("currency")).isEqualTo("TRY");
    Map<String, Object> ie =
        row(
            w,
            "select direction, category, amount, currency from \"%s\".fin_income_expense"
                + " where source_type = 'ACCOUNT_DOCUMENT' and source_id = ?",
            UUID.fromString(doc.get("id").asText()));
    assertThat(ie.get("direction")).isEqualTo(ieDirection);
    assertThat(ie.get("category")).isEqualTo("FX_DIFF");
    assertThat((BigDecimal) ie.get("amount")).isEqualByComparingTo("50");
    // Kaynak TL karşılığı hiç değişmez (Y8).
    assertThat(
            (BigDecimal)
                row(w, "select tl_amount from \"%s\".account_transaction where id = ?", source)
                    .get("tl_amount"))
        .isEqualByComparingTo("200");
  }

  @Test
  void belgeKaynagindaBelgeNumarasiVeAciklamaKullanilir() throws Exception {
    World w = world("fxn");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    JsonNode source =
        body(
            sendJson(
                    w.t(),
                    null,
                    post(FINANCE + "/accounts/" + customer + "/documents"),
                    jpyDocument("FTR-77", w.a1()))
                .andExpect(created()));
    UUID tx = UUID.fromString(source.get("transactionId").asText());
    Map<String, Object> request = cutBody(tx, D25, "50");
    request.put("description", "Elle açıklama");
    JsonNode doc = body(send(w.t(), null, json(post(CUT), request)).andExpect(created()));
    assertThat(doc.get("documentNo").asText()).isEqualTo("KF-FTR-77");
    assertThat(doc.get("description").asText()).isEqualTo("Elle açıklama");

    // Kaynağın belgesi açık kur farkı varken iptal edilemez, revize de edilemez (LS.reverse).
    expect(cancel(w, source.get("id").asText()), 409, "FX_DOCUMENT_OPEN");
    // Kur farkı belgesi revize edilemez.
    expect(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/account-documents/" + doc.get("id").asText() + "/revise"),
            jpyDocument("FTR-78", w.a1())),
        409,
        "FX_DOCUMENT_NOT_REVISABLE");
    // Kur farkı iptal edilince kaynak serbest kalır.
    cancel(w, doc.get("id").asText()).andExpect(status().isOk());
    cancel(w, source.get("id").asText()).andExpect(status().isOk());
  }

  // --- 2. idempotent tekrar ve tekrar yolunda erişim

  @Test
  void ayniAnahtarAyniBelgeyiDonerBaskaKaynak422() throws Exception {
    World w = world("fxi");
    UUID account = account(w, AccountType.CUSTOMER, null);
    UUID source = manualJpy(w, account, w.a1(), Direction.DEBIT, "1000", SOURCE_DATE);
    UUID other =
        manualJpy(
            w,
            account(w, AccountType.CUSTOMER, null),
            w.a1(),
            Direction.DEBIT,
            "1000",
            SOURCE_DATE);
    String first = id(cut(w, null, source, D25, "50", "FX-KEY-1"));
    String again = id(cut(w, null, source, D25, "50", "FX-KEY-1"));
    assertThat(again).isEqualTo(first);
    assertThat(
            count(w, "select count(*) from \"%s\".account_transaction where source_id = ?", first))
        .isEqualTo(1);
    assertThat(
            count(w, "select count(*) from \"%s\".fin_income_expense where source_id = ?", first))
        .isEqualTo(1);
    expect(cut(w, null, other, D25, "50", "FX-KEY-1"), 422, "IDEMPOTENCY_KEY_REUSED");
  }

  @Test
  void tekrarYolundaOnceErisimDenetlenir() throws Exception {
    World w = world("fxr");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID outOfScope = manualJpy(w, customer, w.a2(), Direction.DEBIT, "1000", SOURCE_DATE);
    id(cut(w, null, outOfScope, D25, "50", "FX-A2"));
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    UUID employeeSource = manualJpy(w, employee, w.a1(), Direction.DEBIT, "1000", SOURCE_DATE);
    id(cut(w, null, employeeSource, D25, "50", "FX-EMP"));
    UUID unrelated =
        manualJpy(
            w,
            account(w, AccountType.CUSTOMER, null),
            w.a1(),
            Direction.DEBIT,
            "1000",
            SOURCE_DATE);

    String limited = limitedUser(w, "sinirli", "FINANCE", List.of(w.a1()));
    ResultActions denied = cut(w, limited, outOfScope, D25, "50", "FX-A2");
    expect(denied, 403, "BRANCH_OUT_OF_SCOPE");
    denied.andExpect(jsonPath("$.documentNo").doesNotExist());
    expect(cut(w, limited, unrelated, D25, "50", "FX-A2"), 403, "BRANCH_OUT_OF_SCOPE");

    String finance = userWithRole(w, "finans", "FINANCE");
    expect(cut(w, finance, employeeSource, D25, "50", "FX-EMP"), 404, "FX_SOURCE_NOT_FOUND");
    expect(cut(w, finance, unrelated, D25, "50", "FX-EMP"), 404, "FX_SOURCE_NOT_FOUND");
  }

  // --- 3. kaynak başına tek kesim

  @Test
  void kaynakBasinaTekKesimEszamanliDahil() throws Exception {
    World w = world("fxc");
    UUID account = account(w, AccountType.CUSTOMER, null);
    UUID source = manualJpy(w, account, w.a1(), Direction.DEBIT, "1000", SOURCE_DATE);
    id(cut(w, null, source, D25, "50", null));
    expect(cut(w, null, source, D25, "50", "baska"), 409, "FX_DIFFERENCE_EXISTS");

    UUID raced =
        manualJpy(
            w,
            account(w, AccountType.CUSTOMER, null),
            w.a1(),
            Direction.DEBIT,
            "1000",
            SOURCE_DATE);
    List<Integer> codes =
        new ArrayList<>(
            concurrently(
                () -> code(cut(w, null, raced, D25, "50", "yaris-1")),
                () -> code(cut(w, null, raced, D25, "50", "yaris-2"))));
    codes.sort(Integer::compareTo);
    assertThat(codes).containsExactly(201, 409);
    assertThat(
            count(
                w,
                "select count(*) from \"%s\".account_document where fx_source_transaction_id = ?"
                    + " and status = 'OPEN'",
                raced))
        .isEqualTo(1);
  }

  // --- 4. ters kayıt + yeniden kesim

  @Test
  void iptalTersKayitYazarVeYenidenKesimeIzinVerir() throws Exception {
    World w = world("fxt");
    UUID account = account(w, AccountType.CUSTOMER, null);
    UUID source = manualJpy(w, account, w.a1(), Direction.DEBIT, "1000", SOURCE_DATE);
    String first = id(cut(w, null, source, D25, "50", null));
    // Açık kur farkı varken kaynağın elle ters kaydı da engellenir.
    expect(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/accounts/transactions/" + source + "/reverse"),
            Map.of("date", TODAY.toString())),
        409,
        "FX_DOCUMENT_OPEN");

    cancel(w, first).andExpect(status().isOk());
    UUID firstTx = txOf(w, first);
    assertThat(
            count(
                w,
                "select count(*) from \"%s\".account_transaction where source_type = 'REVERSAL'"
                    + " and source_id = ?",
                firstTx))
        .isEqualTo(1);
    assertThat(
            count(
                w,
                "select count(*) from \"%s\".fin_income_expense where source_type = 'REVERSAL'"
                    + " and category = 'FX_DIFF' and source_id in (select id from \"%s\""
                    + ".fin_income_expense where source_id = ?)",
                UUID.fromString(first)))
        .isEqualTo(1);
    String second = id(cut(w, null, source, D15, "-50", null));
    assertThat(second).isNotEqualTo(first);
  }

  // --- 6. doğrulamalar

  @Test
  void dogrulamalar() throws Exception {
    World w = world("fxv");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID tryTx = manual(w, customer, w.a1(), Direction.DEBIT, "100", "TRY");
    expect(cut(w, null, tryTx, D25, "1", null), 422, "FX_SOURCE_INVALID");

    UUID settlementTx =
        manualJpy(
            w,
            account(w, AccountType.CUSTOMER, null),
            w.a1(),
            Direction.DEBIT,
            "1000",
            SOURCE_DATE);
    jdbc.update(
        "update \"%s\".account_transaction set source_type = 'SETTLEMENT', source_id = ? where id = ?"
            .formatted(w.schema()),
        UUID.randomUUID(),
        settlementTx);
    expect(cut(w, null, settlementTx, D25, "50", null), 422, "FX_SOURCE_INVALID");

    UUID reversed =
        manualJpy(
            w,
            account(w, AccountType.CUSTOMER, null),
            w.a1(),
            Direction.DEBIT,
            "1000",
            SOURCE_DATE);
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/accounts/transactions/" + reversed + "/reverse"),
            Map.of("date", TODAY.toString()))
        .andExpect(status().isOk());
    expect(cut(w, null, reversed, D25, "50", null), 409, "FX_SOURCE_REVERSED");

    UUID from = account(w, AccountType.CUSTOMER, null);
    UUID transferred = manualJpy(w, from, w.a1(), Direction.DEBIT, "1000", SOURCE_DATE);
    transfer(w, from, account(w, AccountType.CUSTOMER, null), transferred)
        .andExpect(status().isCreated());
    expect(cut(w, null, transferred, D25, "50", null), 409, "TRANSACTION_TRANSFERRED");

    UUID noRate = manualOther(w, account(w, AccountType.CUSTOMER, null), "ISK");
    expect(cut(w, null, noRate, D25, "50", null), 422, "RATE_MISSING");

    // D60 kuru işlem kuruyla aynı → fark 0.
    UUID zero =
        manualJpy(w, account(w, AccountType.CUSTOMER, null), w.a1(), Direction.DEBIT, "1000", D60);
    expect(cut(w, null, zero, D60, "0", null), 422, "FX_DIFFERENCE_ZERO");

    UUID changed =
        manualJpy(
            w,
            account(w, AccountType.CUSTOMER, null),
            w.a1(),
            Direction.DEBIT,
            "1000",
            SOURCE_DATE);
    cut(w, null, changed, D25, "49.99", null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("FX_DIFFERENCE_CHANGED"))
        .andExpect(jsonPath("$.details[0]").value(startsWith("difference=50.")))
        .andExpect(jsonPath("$.details[2]").value("rateDate=" + D30));
    // Ölçek farkı engel değil (compareTo).
    id(cut(w, null, changed, D25, "50.000", null));

    UUID dated =
        manualJpy(
            w,
            account(w, AccountType.CUSTOMER, null),
            w.a1(),
            Direction.DEBIT,
            "1000",
            SOURCE_DATE);
    expect(cut(w, null, dated, TODAY.plusDays(1), "50", null), 422, "FX_DATE_INVALID");
    expect(cut(w, null, dated, SOURCE_DATE.minusDays(1), "50", null), 422, "FX_DATE_INVALID");

    UUID passive = account(w, AccountType.CUSTOMER, null);
    UUID passiveTx = manualJpy(w, passive, w.a1(), Direction.DEBIT, "1000", SOURCE_DATE);
    jdbc.update(
        "update \"%s\".account set active = false where id = ?".formatted(w.schema()), passive);
    expect(cut(w, null, passiveTx, D25, "50", null), 422, "ACCOUNT_INACTIVE");

    UUID bound = account(w, AccountType.CUSTOMER, null);
    UUID boundTx = manualJpy(w, bound, w.a1(), Direction.DEBIT, "1000", SOURCE_DATE);
    jdbc.update(
        "update \"%s\".account set company_id = ? where id = ?".formatted(w.schema()),
        w.companyBId(),
        bound);
    expect(cut(w, null, boundTx, D25, "50", null), 422, "COMPANY_MISMATCH");

    expect(cut(w, null, UUID.randomUUID(), D25, "50", null), 404, "FX_SOURCE_NOT_FOUND");
  }

  @Test
  void fifoKapanisiDegerlemeTarihiniSinirlar() throws Exception {
    World w = world("fxf");
    UUID account = account(w, AccountType.CUSTOMER, null);
    UUID invoice = manualJpy(w, account, w.a1(), Direction.DEBIT, "1000", SOURCE_DATE);
    manualJpy(w, account, w.a1(), Direction.CREDIT, "1000", D25);

    cut(w, null, invoice, D15, "-50", null)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("FX_SOURCE_SETTLED"))
        .andExpect(jsonPath("$.details[0]").value("closedOn=" + D25));
    JsonNode settled = reportRow(w, null, invoice, D15, true);
    assertThat(settled.get("valuationBlock").asText()).isEqualTo("SETTLED");
    assertThat(settled.get("closedOn").asText()).isEqualTo(D25.toString());
    assertThat(dec(settled.get("openRemaining"))).isEqualByComparingTo("0");
    assertThat(settled.get("difference").isNull()).isTrue();
    assertThat(settled.get("currentRate").isNull()).isTrue();
    // Kapanış günü değerleme engel değil; fark o günün kuruyla.
    JsonNode onClose = reportRow(w, null, invoice, D25, true);
    assertThat(onClose.get("valuationBlock").isNull()).isTrue();
    assertThat(dec(onClose.get("difference"))).isEqualByComparingTo("50");
    id(cut(w, null, invoice, D25, "50", null));

    // Kısmi tahsilat: kesim tüm tutardan.
    UUID partial = account(w, AccountType.CUSTOMER, null);
    UUID partialTx = manualJpy(w, partial, w.a1(), Direction.DEBIT, "1000", SOURCE_DATE);
    manualJpy(w, partial, w.a1(), Direction.CREDIT, "400", D25);
    JsonNode open = reportRow(w, null, partialTx, D15, true);
    assertThat(dec(open.get("openRemaining"))).isEqualByComparingTo("600");
    assertThat(open.get("closedOn").isNull()).isTrue();
    JsonNode doc = body(cut(w, null, partialTx, D15, "-50", null).andExpect(created()));
    assertThat(dec(doc.get("amount"))).isEqualByComparingTo("50");
  }

  /**
   * Rev 2 (F-12.8-02): ters kayıt çiftleri FIFO kapanışına girmez. İptal edilmiş tahsilat ya da
   * iptal edilmiş başka fatura kaynağı "kapanmış" göstermez; ters kaydı değerleme tarihinden sonra
   * olan tahsilat ise değerleme gününde yürürlükte olduğu için kapanış sayılır.
   */
  @Test
  void tersKayitCiftleriFifoKapanisinaGirmez() throws Exception {
    World w = world("fxv");
    // (a) Tahsilat iptal edildi: fatura açık, kesim serbest.
    UUID first = account(w, AccountType.CUSTOMER, null);
    UUID invoice = manualJpy(w, first, w.a1(), Direction.DEBIT, "1000", SOURCE_DATE);
    UUID collection = manualJpy(w, first, w.a1(), Direction.CREDIT, "1000", D25);
    reverseManual(w, collection, D20);
    JsonNode open = reportRow(w, null, invoice, D15, true);
    assertThat(dec(open.get("openRemaining"))).isEqualByComparingTo("1000");
    assertThat(open.get("closedOn").isNull()).isTrue();
    assertThat(open.get("valuationBlock").isNull()).isTrue();
    id(cut(w, null, invoice, D15, "-50", null));

    // (b) Sonraki fatura iptal edildi: ilk fatura kapanmış görünmez.
    UUID second = account(w, AccountType.CUSTOMER, null);
    UUID older = manualJpy(w, second, w.a1(), Direction.DEBIT, "1000", SOURCE_DATE);
    UUID newer = manualJpy(w, second, w.a1(), Direction.DEBIT, "1000", D30);
    reverseManual(w, newer, D25);
    JsonNode olderRow = reportRow(w, null, older, D15, true);
    assertThat(dec(olderRow.get("openRemaining"))).isEqualByComparingTo("1000");
    assertThat(olderRow.get("closedOn").isNull()).isTrue();
    id(cut(w, null, older, D15, "-50", null));

    // (c) Ters kaydı değerleme tarihinden sonra: değerleme gününde tahsilat yürürlükte.
    UUID third = account(w, AccountType.CUSTOMER, null);
    UUID paidInvoice = manualJpy(w, third, w.a1(), Direction.DEBIT, "1000", SOURCE_DATE);
    UUID payment = manualJpy(w, third, w.a1(), Direction.CREDIT, "1000", D25);
    reverseManual(w, payment, D10);
    JsonNode settled = reportRow(w, null, paidInvoice, D15, true);
    assertThat(settled.get("valuationBlock").asText()).isEqualTo("SETTLED");
    assertThat(settled.get("closedOn").asText()).isEqualTo(D25.toString());
    cut(w, null, paidInvoice, D15, "-50", null)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("FX_SOURCE_SETTLED"));
  }

  /**
   * Rev 2 (R-12.8-5): önceki avansla kapanan kaynak kendi gününde kapanır (kapanış tarihi kaynağın
   * tarihinden önce olamaz); o gün kesilebilir, sonrası 422 {@code FX_SOURCE_SETTLED}.
   */
  @Test
  void oncedenAvanslaKapananKaynakKendiGunundeKapanir() throws Exception {
    World w = world("fxa");
    UUID account = account(w, AccountType.CUSTOMER, null);
    manualJpy(w, account, w.a1(), Direction.CREDIT, "1000", D30);
    UUID invoice = manualJpy(w, account, w.a1(), Direction.DEBIT, "1000", D25);

    JsonNode onDay = reportRow(w, null, invoice, D25, true);
    assertThat(onDay.get("closedOn").asText()).isEqualTo(D25.toString());
    assertThat(onDay.get("valuationBlock").isNull()).isTrue();
    assertThat(dec(onDay.get("difference"))).isEqualByComparingTo("50");
    JsonNode later = reportRow(w, null, invoice, D15, true);
    assertThat(later.get("valuationBlock").asText()).isEqualTo("SETTLED");
    assertThat(later.get("closedOn").asText()).isEqualTo(D25.toString());
    cut(w, null, invoice, D15, "-50", null)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("FX_SOURCE_SETTLED"))
        .andExpect(jsonPath("$.details[0]").value("closedOn=" + D25));
    id(cut(w, null, invoice, D25, "50", null));
  }

  // --- 7–10. yetki, kiracı, kapsam, personel

  @Test
  void yetkiKiraciVeKapsam() throws Exception {
    World w = world("fxk");
    UUID a1Account = account(w, AccountType.CUSTOMER, null);
    UUID a1Tx = manualJpy(w, a1Account, w.a1(), Direction.DEBIT, "1000", SOURCE_DATE);
    UUID a2Tx =
        manualJpy(
            w,
            account(w, AccountType.CUSTOMER, null),
            w.a2(),
            Direction.DEBIT,
            "1000",
            SOURCE_DATE);
    UUID b1Tx =
        manualJpy(
            w,
            account(w, AccountType.CUSTOMER, null),
            w.b1(),
            Direction.DEBIT,
            "1000",
            SOURCE_DATE);

    String accounting = userWithRole(w, "muhasebe", "ACCOUNTING");
    cut(w, accounting, a1Tx, D25, "50", null).andExpect(status().isForbidden());
    assertThat(report(w, accounting, Map.of("valuationDate", D25.toString())).get("rows"))
        .hasSize(3);

    World y = world("fxy");
    expect(cut(y, null, a1Tx, D25, "50", null), 404, "FX_SOURCE_NOT_FOUND");
    assertThat(report(y, null, Map.of()).get("rows")).isEmpty();

    String limited = limitedUser(w, "sinirli", "FINANCE", List.of(w.a1()));
    expect(cut(w, limited, a2Tx, D25, "50", null), 403, "BRANCH_OUT_OF_SCOPE");
    JsonNode limitedRows = report(w, limited, Map.of()).get("rows");
    assertThat(limitedRows).hasSize(1);
    assertThat(limitedRows.get(0).get("transactionId").asText()).isEqualTo(a1Tx.toString());
    send(w.t(), limited, get(REPORT).param("branchIds", w.a2())).andExpect(status().isForbidden());

    JsonNode companyB = report(w, null, Map.of("companyId", w.companyB())).get("rows");
    assertThat(companyB).hasSize(1);
    assertThat(companyB.get(0).get("transactionId").asText()).isEqualTo(b1Tx.toString());

    String finance = userWithRole(w, "finans", "FINANCE");
    id(cut(w, finance, a1Tx, D25, "50", null));
  }

  @Test
  void personelCarisiIzinsizGorunmez() throws Exception {
    World w = world("fxp");
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    UUID tx = manualJpy(w, employee, w.a1(), Direction.DEBIT, "1000", SOURCE_DATE);
    String finance = userWithRole(w, "finans", "FINANCE");
    assertThat(report(w, finance, Map.of()).get("rows")).isEmpty();
    send(w.t(), finance, get(REPORT).param("accountId", employee.toString()))
        .andExpect(status().isNotFound());
    expect(cut(w, finance, tx, D25, "50", null), 404, "FX_SOURCE_NOT_FOUND");

    String superUser = userWithRole(w, "super", "FINANCE_SUPER");
    assertThat(report(w, superUser, Map.of()).get("rows")).hasSize(1);
    id(cut(w, superUser, tx, D25, "50", null));
  }

  // --- 11. rapor

  @Test
  void raporKurlarKesimDurumuVeSayfa() throws Exception {
    World w = world("fxq");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID cutTx = manualJpy(w, customer, w.a1(), Direction.DEBIT, "1000", SOURCE_DATE);
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    UUID openTx = manualJpy(w, supplier, w.a1(), Direction.CREDIT, "1000", SOURCE_DATE);
    UUID late =
        manualJpy(w, account(w, AccountType.CUSTOMER, null), w.a1(), Direction.DEBIT, "1000", D10);
    UUID noRate = manualOther(w, account(w, AccountType.CUSTOMER, null), "ISK");
    String documentId = id(cut(w, null, cutTx, D25, "50", null));

    JsonNode plain = report(w, null, Map.of("valuationDate", D15.toString()));
    assertThat(plain.get("withRates").asBoolean()).isFalse();
    assertThat(plain.get("totalElements").asLong()).isEqualTo(4);
    JsonNode plainRow = find(plain, openTx);
    assertThat(plainRow.get("currentRate").isNull()).isTrue();
    assertThat(plainRow.get("difference").isNull()).isTrue();
    assertThat(plainRow.get("effect").isNull()).isTrue();
    assertThat(dec(plainRow.get("openRemaining"))).isEqualByComparingTo("1000");
    assertThat(plainRow.get("accountCode").asText()).isNotBlank();
    assertThat(dec(plainRow.get("tlAmount"))).isEqualByComparingTo("200");

    JsonNode rated = report(w, null, Map.of("valuationDate", D15.toString(), "withRates", "true"));
    JsonNode openRow = find(rated, openTx);
    assertThat(dec(openRow.get("currentRate"))).isEqualByComparingTo("0.15");
    assertThat(openRow.get("currentRateDate").asText()).isEqualTo(D20.toString());
    assertThat(dec(openRow.get("currentTl"))).isEqualByComparingTo("150");
    assertThat(dec(openRow.get("difference"))).isEqualByComparingTo("-50");
    // Borcumuzun TL karşılığı düştü: kazanç.
    assertThat(openRow.get("effect").asText()).isEqualTo("GAIN");
    assertThat(find(rated, cutTx).get("effect").asText()).isEqualTo("LOSS");
    JsonNode cutRow = find(rated, cutTx).get("cut");
    assertThat(cutRow.get("documentId").asText()).isEqualTo(documentId);
    assertThat(cutRow.get("side").asText()).isEqualTo("RECEIVABLE");
    assertThat(dec(cutRow.get("amount"))).isEqualByComparingTo("50");
    JsonNode lateRow = find(rated, late);
    assertThat(lateRow.get("valuationBlock").asText()).isEqualTo("AFTER_VALUATION");
    assertThat(lateRow.get("currentRate").isNull()).isTrue();
    assertThat(lateRow.get("difference").isNull()).isTrue();
    assertThat(find(rated, noRate).get("currentRate").isNull()).isTrue();
    assertThat(rated.get("missingRates")).hasSize(1);
    assertThat(rated.get("missingRates").get(0).asText()).isEqualTo("ISK");

    assertThat(report(w, null, Map.of("cutState", "CUT")).get("rows")).hasSize(1);
    assertThat(report(w, null, Map.of("cutState", "OPEN")).get("rows")).hasSize(3);
    assertThat(report(w, null, Map.of("currency", "ISK")).get("rows")).hasSize(1);
    assertThat(
            report(w, null, Map.of("accountId", supplier.toString()))
                .get("rows")
                .get(0)
                .get("transactionId")
                .asText())
        .isEqualTo(openTx.toString());
    assertThat(report(w, null, Map.of("from", D15.toString(), "to", TODAY.toString())).get("rows"))
        .hasSize(1);

    JsonNode paged = report(w, null, Map.of("page", "1", "size", "3"));
    assertThat(paged.get("rows")).hasSize(1);
    assertThat(paged.get("totalPages").asInt()).isEqualTo(2);
    assertThat(report(w, null, Map.of("size", "5000")).get("size").asInt()).isEqualTo(2000);

    for (Map<String, String> bad :
        List.of(
            Map.of("page", "-1"),
            Map.of("page", "100001"),
            Map.of("size", "0"),
            Map.of("page", "2147483647"))) {
      expect(reportRequest(w, null, bad), 400, "PAGE_INVALID");
    }
    expect(
        reportRequest(w, null, Map.of("valuationDate", TODAY.plusDays(1).toString())),
        400,
        "FX_DATE_INVALID");
    expect(
        reportRequest(w, null, Map.of("from", D10.toString(), "to", D20.toString())),
        400,
        "PERIOD_INVALID");
  }

  // --- yardımcılar

  private void rate(LocalDate date, String value) {
    jdbc.update(
        "insert into admin.exchange_rate (id, currency, rate_date, rate, source, created_at)"
            + " values (gen_random_uuid(), ?, ?, ?, 'TEST', now()) on conflict do nothing",
        JPY,
        date,
        new BigDecimal(value));
  }

  /** Elle JPY hareketi; işlem kuru 0,20. */
  private UUID manualJpy(
      World w, UUID account, String branch, Direction direction, String amount, LocalDate date)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("branchId", branch);
    body.put("direction", direction.name());
    body.put("money", Map.of("amount", amount, "currency", JPY));
    body.put("date", date.toString());
    body.put("description", "Kaynak " + direction);
    body.put("exchangeRate", "0.20");
    return UUID.fromString(
        id(sendJson(w.t(), null, post(FINANCE + "/accounts/" + account + "/transactions"), body)));
  }

  /** Elle hareketin ters kaydı (LS.reverse). */
  private void reverseManual(World w, UUID transaction, LocalDate date) throws Exception {
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/accounts/transactions/" + transaction + "/reverse"),
            Map.of("date", date.toString(), "description", "İptal"))
        .andExpect(status().isOk());
  }

  /** Kur tablosunda hiç kuru olmayan para biriminde hareket. */
  private UUID manualOther(World w, UUID account, String currency) throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("branchId", w.a1());
    body.put("direction", "DEBIT");
    body.put("money", Map.of("amount", "1000", "currency", currency));
    body.put("date", SOURCE_DATE.toString());
    body.put("exchangeRate", "0.20");
    return UUID.fromString(
        id(sendJson(w.t(), null, post(FINANCE + "/accounts/" + account + "/transactions"), body)));
  }

  private static Map<String, Object> jpyDocument(String number, String branch) {
    Map<String, Object> body = new HashMap<>();
    body.put("side", "RECEIVABLE");
    body.put("documentType", "DIGER");
    body.put("documentNo", number);
    body.put("documentDate", SOURCE_DATE.toString());
    body.put("amount", "1000");
    body.put("currency", JPY);
    body.put("exchangeRate", "0.20");
    body.put("paymentMethod", "BANK");
    body.put("branchId", branch);
    return body;
  }

  private static Map<String, Object> cutBody(UUID source, LocalDate valuation, String expected) {
    Map<String, Object> body = new HashMap<>();
    body.put("sourceTransactionId", source.toString());
    body.put("valuationDate", valuation.toString());
    body.put("expectedDifference", expected);
    return body;
  }

  private ResultActions cut(
      World w, String token, UUID source, LocalDate valuation, String expected, String key)
      throws Exception {
    MockHttpServletRequestBuilder request = json(post(CUT), cutBody(source, valuation, expected));
    if (key != null) {
      request.header("Idempotency-Key", key);
    }
    return send(w.t(), token, request);
  }

  private MockHttpServletRequestBuilder json(
      MockHttpServletRequestBuilder request, Map<String, Object> body) throws Exception {
    return request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
  }

  private ResultActions cancel(World w, String documentId) throws Exception {
    return sendJson(
        w.t(), null, post(FINANCE + "/account-documents/" + documentId + "/cancel"), Map.of());
  }

  private ResultActions transfer(World w, UUID from, UUID to, UUID transaction) throws Exception {
    return sendJson(
        w.t(),
        null,
        post(FINANCE + "/account-transfers"),
        Map.of(
            "fromAccountId",
            from.toString(),
            "toAccountId",
            to.toString(),
            "transactionIds",
            List.of(transaction.toString())));
  }

  private ResultActions reportRequest(World w, String token, Map<String, String> params)
      throws Exception {
    MockHttpServletRequestBuilder request = get(REPORT);
    params.forEach(request::param);
    return send(w.t(), token, request);
  }

  private JsonNode report(World w, String token, Map<String, String> params) throws Exception {
    return body(reportRequest(w, token, params).andExpect(status().isOk()));
  }

  private JsonNode reportRow(
      World w, String token, UUID transaction, LocalDate valuation, boolean withRates)
      throws Exception {
    return find(
        report(
            w,
            token,
            Map.of("valuationDate", valuation.toString(), "withRates", String.valueOf(withRates))),
        transaction);
  }

  private static JsonNode find(JsonNode report, UUID transaction) {
    for (JsonNode row : report.get("rows")) {
      if (transaction.toString().equals(row.get("transactionId").asText())) {
        return row;
      }
    }
    throw new AssertionError("Satır yok: " + transaction);
  }

  private UUID txOf(World w, String documentId) {
    return jdbc.queryForObject(
        "select id from \"%s\".account_transaction where source_type = 'ACCOUNT_DOCUMENT'"
                .formatted(w.schema())
            + " and source_id = ?",
        UUID.class,
        UUID.fromString(documentId));
  }

  private Map<String, Object> row(World w, String sql, Object id) {
    return jdbc.queryForMap(sql.formatted(w.schema()), id);
  }

  private long count(World w, String sql, Object id) {
    Object key = id instanceof String text ? UUID.fromString(text) : id;
    String formatted = sql.replace("%s", w.schema());
    Long value = jdbc.queryForObject(formatted, Long.class, key);
    return value == null ? 0 : value;
  }

  /** Ondalık metin (rapor) ya da sayı (belge) alanı. */
  private static BigDecimal dec(JsonNode node) {
    return new BigDecimal(node.asText());
  }

  private static int code(ResultActions actions) {
    return actions.andReturn().getResponse().getStatus();
  }

  private static org.springframework.test.web.servlet.ResultMatcher created() {
    return status().isCreated();
  }
}
