package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Faz 12.8 finans rapor uçları (12.8_TASARIM §3.4, §6.2 FinanceReportIT 1–10): yaşlandırma v2,
 * FinanceReport genel bakış/liste/yöntem, finansal bilanço (Rev 1 F1, F2, F6, SEC-12.8-04), hazine
 * (SEC-12.8-02), nakit akışı, cari bazlı ödeme performansı, döviz pozisyonu (Rev 1 F3) ve kapsam.
 * Veriler çoğunlukla doğrudan SQL ile kurulur (rapor salt okumadır). Kur tablosu kiracılar arası
 * ortaktır: bu sınıf yalnız {@code SEK} ve {@code DKK} (Rev 4 T3) yazar, tarihleri sabittir.
 */
class FinanceReportIT extends SettlementTestSupport {

  private static final String REPORTS = FINANCE + "/reports";
  private static final String SEK = "SEK";
  private static final String DKK = "DKK";
  private static final LocalDate SEK_BASE = TODAY.minusDays(30);
  private static final LocalDate SEK_UP = TODAY.minusDays(5);

  @BeforeEach
  void rates() {
    rate(SEK_BASE, "3");
    rate(SEK_UP, "3.5");
  }

  // --- 1. yaşlandırma v2

  @Test
  void yaslandirmaVadeTabaniGuncelKovaVeTersKayitCifti() throws Exception {
    World w = world("fra");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    // Vadesi gelmemiş: işlem 10 gün önce, vade 20 gün sonra.
    document(w, customer, w.a1(), "RECEIVABLE", "1000", TODAY.minusDays(10), TODAY.plusDays(20));
    // Vadesi 45 gün geçmiş: işlem 100 gün önce.
    document(w, customer, w.a1(), "RECEIVABLE", "500", TODAY.minusDays(100), TODAY.minusDays(45));

    JsonNode due = aging(w, null, "RECEIVABLE", "DUE", Map.of("accountId", customer.toString()));
    assertThat(due).hasSize(1);
    JsonNode row = due.get(0);
    assertThat(dec(row.get("notDue"))).isEqualByComparingTo("1000");
    assertThat(dec(row.get("days31To60"))).isEqualByComparingTo("500");
    assertThat(dec(row.get("daysOver90"))).isEqualByComparingTo("0");
    assertThat(dec(row.get("total"))).isEqualByComparingTo("1500");
    assertThat(dec(row.get("tlTotal"))).isEqualByComparingTo("1500");
    assertThat(row.get("accountCode").asText()).startsWith("C");
    assertThat(row.get("subGroup").asText()).isEqualTo("MUSTERI");
    assertThat(row.get("subGroupName").asText()).isEqualTo("Müşteri");

    // İşlem tarihi tabanı (varsayılan; eski parametresiz çağrı): notDue 0, değerler değişmez.
    JsonNode legacy =
        body(
            send(
                    w.t(),
                    null,
                    get(REPORTS + "/aging")
                        .param("type", "RECEIVABLE")
                        .param("asOf", TODAY.toString()))
                .andExpect(status().isOk()));
    JsonNode tx = find(legacy, "accountId", customer.toString());
    assertThat(dec(tx.get("notDue"))).isEqualByComparingTo("0");
    assertThat(dec(tx.get("days0To30"))).isEqualByComparingTo("1000");
    assertThat(dec(tx.get("daysOver90"))).isEqualByComparingTo("500");
    assertThat(dec(tx.get("total"))).isEqualByComparingTo("1500");

    // Ters kayıt çifti FIFO'ya girmez (Rev 2): iptal edilmiş tahsilat faturayı kapatmaz.
    UUID other = account(w, AccountType.CUSTOMER, null);
    tx(w, other, w.a1(), "DEBIT", "1000", "TRY", "1", TODAY.minusDays(100), "MANUAL", null);
    UUID collection =
        tx(w, other, w.a1(), "CREDIT", "1000", "TRY", "1", TODAY.minusDays(50), "MANUAL", null);
    tx(w, other, w.a1(), "DEBIT", "1000", "TRY", "1", TODAY.minusDays(40), "REVERSAL", collection);
    JsonNode reversed = aging(w, null, "RECEIVABLE", "TRANSACTION", Map.of());
    JsonNode reversedRow = find(reversed, "accountId", other.toString());
    assertThat(dec(reversedRow.get("daysOver90"))).isEqualByComparingTo("1000");
    assertThat(dec(reversedRow.get("days31To60"))).isEqualByComparingTo("0");

    // İş yeri ve grup süzgeci; kapsam dışı iş yeri LIMITED'e 403.
    assertThat(aging(w, null, "RECEIVABLE", "DUE", Map.of("branchIds", w.a2()))).isEmpty();
    assertThat(aging(w, null, "RECEIVABLE", "DUE", Map.of("subGroups", "ACENTE"))).isEmpty();
    String limited = limitedUser(w, "lim", "FINANCE", List.of(w.a2()));
    send(
            w.t(),
            limited,
            get(REPORTS + "/aging")
                .param("type", "RECEIVABLE")
                .param("asOf", TODAY.toString())
                .param("branchIds", w.a1()))
        .andExpect(status().isForbidden());
    assertThat(aging(w, limited, "RECEIVABLE", "DUE", Map.of())).isEmpty();
  }

  // --- 2–4. FinanceReport genel bakış, liste, yöntem

  @Test
  void genelBakisVeListeSirketlerArasiNetlesmez() throws Exception {
    World w = world("frl");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    tx(w, customer, w.a1(), "DEBIT", "1000", "TRY", "1", TODAY.minusDays(10), "MANUAL", null);
    tx(w, customer, w.b1(), "CREDIT", "300", "TRY", "1", TODAY.minusDays(10), "MANUAL", null);
    UUID group = intercompany(w, w.companyB());
    tx(w, group, w.a1(), "DEBIT", "200", "TRY", "1", TODAY.minusDays(10), "MANUAL", null);
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    tx(w, employee, w.a1(), "DEBIT", "50", "TRY", "1", TODAY.minusDays(10), "MANUAL", null);
    // Ceza belgesi (dönem içi) ve son tahsilat.
    UUID penalty =
        accountDocument(w, customer, w.a1(), w.companyA(), "RECEIVABLE", "CEZA_KARSI_TARAF", "40");
    tx(
        w,
        customer,
        w.a1(),
        "DEBIT",
        "40",
        "TRY",
        "1",
        TODAY.minusDays(2),
        "ACCOUNT_DOCUMENT",
        penalty);
    UUID settlement =
        settlement(w, customer, w.a1(), "COLLECTION", "CASH", null, "60", TODAY.minusDays(3));
    tx(
        w,
        customer,
        w.a1(),
        "CREDIT",
        "60",
        "TRY",
        "1",
        TODAY.minusDays(3),
        "SETTLEMENT",
        settlement);
    // Dönem sonrası hareket.
    tx(w, customer, w.a1(), "DEBIT", "5", "TRY", "1", TODAY, "MANUAL", null);

    LocalDate to = TODAY.minusDays(1);
    JsonNode summary =
        body(
            send(w.t(), null, get(REPORTS + "/ledger-summary").param("to", to.toString()))
                .andExpect(status().isOk()));
    JsonNode sales = findRow(summary.get("rows"), "reportType", "SALES");
    assertThat(dec(sales.get("theyOwe"))).isEqualByComparingTo("980");
    assertThat(dec(sales.get("weOwe"))).isEqualByComparingTo("300");
    assertThat(dec(sales.get("net"))).isEqualByComparingTo("680");
    assertThat(sales.get("openAccounts").asInt()).isEqualTo(1);
    assertThat(findRowOrNull(summary.get("rows"), "reportType", "PERSONNEL")).isNotNull();
    // Konsolidede grup şirketi carisi yok; şirket seçiliyken var (Rapor dışı satırı).
    assertThat(nullTypeRow(summary)).isNull();
    JsonNode companyA =
        body(
            send(
                    w.t(),
                    null,
                    get(REPORTS + "/ledger-summary")
                        .param("to", to.toString())
                        .param("companyId", w.companyA()))
                .andExpect(status().isOk()));
    assertThat(dec(nullTypeRow(companyA).get("theyOwe"))).isEqualByComparingTo("200");
    // Personel izinsiz: PERSONNEL yok, bayrak dolu.
    String finance = userWithRole(w, "fin", "FINANCE");
    JsonNode hidden =
        body(
            send(w.t(), finance, get(REPORTS + "/ledger-summary").param("to", to.toString()))
                .andExpect(status().isOk()));
    assertThat(hidden.get("personnelHidden").asBoolean()).isTrue();
    assertThat(findRowOrNull(hidden.get("rows"), "reportType", "PERSONNEL")).isNull();

    // Liste: konsolidede şirket başına satır (Rev 1 F3), şirket seçiliyken tek satır.
    JsonNode list =
        body(
            send(
                    w.t(),
                    null,
                    get(REPORTS + "/ledger-accounts")
                        .param("reportType", "SALES")
                        .param("from", TODAY.minusDays(5).toString())
                        .param("to", to.toString()))
                .andExpect(status().isOk()));
    assertThat(list.get("side").asText()).isEqualTo("RECEIVABLE");
    assertThat(list.get("postPeriodCount").asLong()).isEqualTo(1);
    List<JsonNode> rows = rowsOf(list.get("rows"), "accountId", customer.toString());
    assertThat(rows).hasSize(2);
    JsonNode inA = findRow(list.get("rows"), "companyId", w.companyA());
    assertThat(dec(inA.get("opening"))).isEqualByComparingTo("1000");
    assertThat(dec(inA.get("penalty"))).isEqualByComparingTo("40");
    assertThat(dec(inA.get("receivable"))).isEqualByComparingTo("0");
    assertThat(dec(inA.get("collection"))).isEqualByComparingTo("60");
    assertThat(dec(inA.get("closing"))).isEqualByComparingTo("980");
    assertThat(inA.get("lastSettlementDate").asText()).isEqualTo(TODAY.minusDays(3).toString());
    assertThat(dec(inA.get("lastSettlementAmount"))).isEqualByComparingTo("60");
    assertThat(inA.get("companyName").asText()).isNotBlank();
    JsonNode inB = findRow(list.get("rows"), "companyId", w.companyB());
    assertThat(dec(inB.get("closing"))).isEqualByComparingTo("-300");
    assertThat(inB.get("lastSettlementDate").isNull()).isTrue();
    JsonNode single =
        body(
            send(
                    w.t(),
                    null,
                    get(REPORTS + "/ledger-accounts")
                        .param("reportType", "SALES")
                        .param("companyId", w.companyA())
                        .param("accountId", customer.toString()))
                .andExpect(status().isOk()));
    assertThat(single.get("rows")).hasSize(1);
    expect(
        send(w.t(), null, get(REPORTS + "/ledger-accounts").param("reportType", "XYZ")),
        404,
        "REPORT_TYPE_NOT_FOUND");
    expect(
        send(w.t(), finance, get(REPORTS + "/ledger-accounts").param("reportType", "PERSONNEL")),
        404,
        "REPORT_TYPE_NOT_FOUND");
    assertThat(
            body(send(
                        w.t(),
                        null,
                        get(REPORTS + "/ledger-accounts").param("reportType", "PERSONNEL"))
                    .andExpect(status().isOk()))
                .get("rows"))
        .hasSize(1);
    expect(
        send(
            w.t(),
            null,
            get(REPORTS + "/ledger-summary")
                .param("from", TODAY.toString())
                .param("to", to.toString())),
        400,
        "PERIOD_INVALID");

    // Yöntem kırılımı: nakit, kredi kartı, senetle tahsilat.
    UUID card = settlement(w, customer, w.a1(), "COLLECTION", "BANK", "CREDIT_CARD", "50", TODAY);
    UUID note =
        instrument(w, customer, w.a1(), "NOTE", "RECEIVED", "PORTFOLIO", "70", TODAY.plusDays(30));
    UUID byNote = settlement(w, customer, w.a1(), "COLLECTION", "CHECK", null, "70", TODAY);
    update(w, "update %s.settlement set instrument_id = ? where id = ?", note, byNote);
    JsonNode methods =
        body(
            send(
                    w.t(),
                    null,
                    get(REPORTS + "/account-methods").param("accountId", customer.toString()))
                .andExpect(status().isOk()));
    Map<String, BigDecimal> byMethod = new HashMap<>();
    methods.forEach(m -> byMethod.put(m.get("method").asText(), dec(m.get("amount"))));
    assertThat(byMethod).containsOnlyKeys("CASH", "CREDIT_CARD", "NOTE");
    assertThat(byMethod.get("CASH")).isEqualByComparingTo("60");
    assertThat(byMethod.get("CREDIT_CARD")).isEqualByComparingTo("50");
    assertThat(byMethod.get("NOTE")).isEqualByComparingTo("70");
    assertThat(card).isNotNull();
    expect(
        send(
            w.t(),
            finance,
            get(REPORTS + "/account-methods").param("accountId", employee.toString())),
        404,
        "ACCOUNT_NOT_FOUND");
  }

  // --- 5. finansal bilanço

  @Test
  void bilancoKurFarkiBirKezFarkliIsYeriTahsilatiVeKmh() throws Exception {
    World w = world("frb");
    // (a) F1: 1000 SEK alacak işlem kuru 3, değerleme 3,5 ile kesilmiş KUR_FARKI (+500 TL).
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID source = manualSek(w, customer, w.a1(), "DEBIT", "1000", TODAY.minusDays(20), "3");
    Map<String, Object> cut = new HashMap<>();
    cut.put("sourceTransactionId", source.toString());
    cut.put("valuationDate", SEK_UP.toString());
    cut.put("expectedDifference", "500");
    sendJson(w.t(), null, post(FINANCE + "/fx-differences"), cut).andExpect(status().isCreated());

    JsonNode sheet = balanceSheet(w, null, w.companyA(), null);
    assertThat(dec(sheet.get("assetsTl"))).isEqualByComparingTo("3500");
    assertThat(dec(sheet.get("liabilitiesTl"))).isEqualByComparingTo("0");
    JsonNode a1 = workplace(sheet, w.a1());
    JsonNode tryBlock = currencyOf(a1, "TRY");
    assertThat(dec(tryBlock.get("fxAdjustment"))).isEqualByComparingTo("500");
    assertThat(dec(tryBlock.get("accountReceivable"))).isEqualByComparingTo("0");
    JsonNode sekBlock = currencyOf(a1, SEK);
    assertThat(dec(sekBlock.get("accountReceivable"))).isEqualByComparingTo("1000");
    assertThat(dec(sekBlock.get("tlAssets"))).isEqualByComparingTo("3500");
    assertThat(sheet.get("creditDepositPending").asBoolean()).isTrue();
    assertThat(texts(sheet.get("missingRates"))).isEmpty();

    // Kaynak tamamen tahsil edilince kur farkı TRY alacağı olarak kalır.
    manualSek(w, customer, w.a1(), "CREDIT", "1000", TODAY.minusDays(2), "3.5");
    JsonNode settled = balanceSheet(w, null, w.companyA(), null);
    assertThat(dec(settled.get("assetsTl"))).isEqualByComparingTo("500");

    // (b) F2: X iş yerinde fatura, Y iş yerinde tahsilat (aynı şirket) varlığı şişirmez.
    UUID other = account(w, AccountType.CUSTOMER, null);
    tx(w, other, w.a1(), "DEBIT", "1000", "TRY", "1", TODAY.minusDays(3), "MANUAL", null);
    tx(w, other, w.a2(), "CREDIT", "1000", "TRY", "1", TODAY.minusDays(2), "MANUAL", null);
    JsonNode split = balanceSheet(w, null, w.companyA(), null);
    assertThat(dec(split.get("assetsTl"))).isEqualByComparingTo("500");
    assertThat(dec(split.get("liabilitiesTl"))).isEqualByComparingTo("0");
    JsonNode companyCard = findRow(split.get("companies"), "companyId", w.companyA());
    assertThat(dec(companyCard.get("assetsTl"))).isEqualByComparingTo("500");
    assertThat(dec(currencyOf(workplace(split, w.a1()), "TRY").get("accountReceivable")))
        .isEqualByComparingTo("1500");
    assertThat(dec(currencyOf(workplace(split, w.a2()), "TRY").get("accountPayable")))
        .isEqualByComparingTo("1000");

    // (c) F6: KMH −2000 yükümlülük, vadesiz +5000 banka; netleşmez.
    String demand = bankFund(w, "BNK-D", w.b1(), "TRY");
    String credit = bankFund(w, "BNK-K", w.b1(), "TRY");
    update(w, "update %s.fund_account set account_type = 'CREDIT' where id = ?::uuid", credit);
    fundTx(w, demand, w.b1(), "IN", "5000", TODAY.minusDays(1));
    fundTx(w, credit, w.b1(), "OUT", "2000", TODAY.minusDays(1));
    JsonNode b = balanceSheet(w, null, w.companyB(), null);
    JsonNode bTry = currencyOf(workplace(b, w.b1()), "TRY");
    assertThat(dec(bTry.get("bank"))).isEqualByComparingTo("5000");
    assertThat(dec(bTry.get("bankOverdraft"))).isEqualByComparingTo("2000");
    assertThat(dec(b.get("assetsTl"))).isEqualByComparingTo("5000");
    assertThat(dec(b.get("liabilitiesTl"))).isEqualByComparingTo("2000");
    assertThat(dec(b.get("netTl"))).isEqualByComparingTo("3000");

    // Çek/senet: portföy çeki varlık, verilen senet yükümlülük, teminattaki senet değil.
    instrument(w, other, w.b1(), "CHECK", "RECEIVED", "PORTFOLIO", "300", TODAY.plusDays(10));
    instrument(w, other, w.b1(), "NOTE", "ISSUED", "ISSUED", "100", TODAY.plusDays(10));
    instrument(w, other, w.b1(), "NOTE", "RECEIVED", "COLLATERAL", "900", TODAY.plusDays(10));
    JsonNode withChecks =
        currencyOf(workplace(balanceSheet(w, null, w.companyB(), null), w.b1()), "TRY");
    assertThat(dec(withChecks.get("receivedChecks"))).isEqualByComparingTo("300");
    assertThat(withChecks.get("receivedCheckCount").asInt()).isEqualTo(1);
    assertThat(dec(withChecks.get("issuedNotes"))).isEqualByComparingTo("100");
    assertThat(dec(withChecks.get("receivedNotes"))).isEqualByComparingTo("0");

    // Kur yoksa TL toplamına girmez; boş aktif iş yeri kartı; ileri tarih 400.
    UUID foreign = account(w, AccountType.CUSTOMER, null);
    tx(w, foreign, w.a2(), "DEBIT", "10", "XAF", "1", TODAY.minusDays(1), "MANUAL", null);
    JsonNode missing = balanceSheet(w, null, null, null);
    assertThat(texts(missing.get("missingRates"))).contains("XAF");
    assertThat(currencyOf(workplace(missing, w.a2()), "XAF").get("tlAssets").isNull()).isTrue();
    expect(
        send(
            w.t(),
            null,
            get(REPORTS + "/balance-sheet").param("asOf", TODAY.plusDays(1).toString())),
        400,
        "AS_OF_INVALID");
  }

  /**
   * Rev 4 T3: orantılı düzeltme ({@code amount × kalan / kaynak}); değerleme asOf kuruyla, düzeltme
   * kesim tutarıyla; iptal edilmiş KUR_FARKI belgesi düzeltme üretmez (iptal tarihinden önceki
   * asOf'ta üretir). Ayrı para birimi (DKK): asOf kuru kesim kurundan farklıdır.
   */
  @Test
  void bilancoKurFarkiKismiTahsilatIptalVeAsOfKuru() throws Exception {
    rate(DKK, SEK_BASE, "3");
    rate(DKK, SEK_UP, "3.5");
    rate(DKK, TODAY.minusDays(1), "4");
    World w = world("frd");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID source = manualFx(w, customer, w.a1(), "DEBIT", "1000", DKK, TODAY.minusDays(20), "3");
    Map<String, Object> cut = new HashMap<>();
    cut.put("sourceTransactionId", source.toString());
    cut.put("valuationDate", SEK_UP.toString());
    cut.put("expectedDifference", "500");
    String fxDocument = id(sendJson(w.t(), null, post(FINANCE + "/fx-differences"), cut));
    // 400 DKK tahsilat: kalan 600 → düzeltme 500 × 600 / 1000 = 300; TRY neti 500 − 300 = 200.
    manualFx(w, customer, w.a1(), "CREDIT", "400", DKK, TODAY.minusDays(2), "3.5");

    // asOf bugün: değerleme kuru 4 (kesim kuru 3,5 değil); düzeltme kesim tutarıyla.
    JsonNode today = balanceSheet(w, null, w.companyA(), null);
    JsonNode tryToday = currencyOf(workplace(today, w.a1()), "TRY");
    assertThat(dec(tryToday.get("fxAdjustment"))).isEqualByComparingTo("300");
    assertThat(dec(tryToday.get("accountReceivable"))).isEqualByComparingTo("200");
    JsonNode dkkToday = currencyOf(workplace(today, w.a1()), DKK);
    assertThat(dec(dkkToday.get("accountReceivable"))).isEqualByComparingTo("600");
    assertThat(dec(dkkToday.get("tlAssets"))).isEqualByComparingTo("2400");
    assertThat(dec(today.get("assetsTl"))).isEqualByComparingTo("2600");
    assertThat(dec(today.get("liabilitiesTl"))).isEqualByComparingTo("0");

    // asOf iki gün önce: kur 3,5; düzeltme yine 300.
    JsonNode earlier = balanceSheet(w, null, w.companyA(), TODAY.minusDays(2));
    assertThat(dec(currencyOf(workplace(earlier, w.a1()), "TRY").get("fxAdjustment")))
        .isEqualByComparingTo("300");
    assertThat(dec(currencyOf(workplace(earlier, w.a1()), DKK).get("tlAssets")))
        .isEqualByComparingTo("2100");
    assertThat(dec(earlier.get("assetsTl"))).isEqualByComparingTo("2300");

    // KUR_FARKI dün iptal: bugün düzeltme yok, sahte yükümlülük doğmaz.
    Map<String, Object> cancel = new HashMap<>();
    cancel.put("date", TODAY.minusDays(1).toString());
    cancel.put("reason", "test");
    sendJson(w.t(), null, post(FINANCE + "/account-documents/" + fxDocument + "/cancel"), cancel)
        .andExpect(status().isOk());
    JsonNode cancelled = balanceSheet(w, null, w.companyA(), null);
    JsonNode tryCancelled =
        findRowOrNull(workplace(cancelled, w.a1()).get("currencies"), "currency", "TRY");
    if (tryCancelled != null) {
      assertThat(dec(tryCancelled.get("fxAdjustment"))).isEqualByComparingTo("0");
      assertThat(dec(tryCancelled.get("accountReceivable"))).isEqualByComparingTo("0");
      assertThat(dec(tryCancelled.get("accountPayable"))).isEqualByComparingTo("0");
    }
    assertThat(dec(cancelled.get("assetsTl"))).isEqualByComparingTo("2400");
    assertThat(dec(cancelled.get("liabilitiesTl"))).isEqualByComparingTo("0");
    // İptal tarihinden önceki asOf: düzeltme hâlâ 300 ({@code r.transaction_date <= asOf}).
    JsonNode beforeCancel = balanceSheet(w, null, w.companyA(), TODAY.minusDays(2));
    assertThat(dec(currencyOf(workplace(beforeCancel, w.a1()), "TRY").get("fxAdjustment")))
        .isEqualByComparingTo("300");
    assertThat(dec(beforeCancel.get("assetsTl"))).isEqualByComparingTo("2300");
  }

  @Test
  void bilancoKapsamPersonelMaskesiVeGrupSirketi() throws Exception {
    World w = world("frk");
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    tx(w, employee, w.a1(), "DEBIT", "50", "TRY", "1", TODAY.minusDays(1), "MANUAL", null);
    UUID group = intercompany(w, w.companyB());
    tx(w, group, w.a2(), "DEBIT", "200", "TRY", "1", TODAY.minusDays(1), "MANUAL", null);
    tx(w, group, w.a1(), "DEBIT", "70", "TRY", "1", TODAY.minusDays(1), "MANUAL", null);

    // Patron: personel adı görünür; grup şirketi listesi dolu, toplama girmez.
    JsonNode owner = balanceSheet(w, null, null, null);
    JsonNode ownerRow = workplace(owner, w.a1()).get("accounts").get(0);
    assertThat(ownerRow.get("masked").asBoolean()).isFalse();
    assertThat(ownerRow.get("accountId").asText()).isEqualTo(employee.toString());
    assertThat(owner.get("intercompany")).hasSize(1);
    assertThat(dec(owner.get("intercompany").get(0).get("balances").get(0).get("amount")))
        .isEqualByComparingTo("270");
    assertThat(dec(owner.get("assetsTl"))).isEqualByComparingTo("50");
    // Boş aktif iş yeri kartı.
    assertThat(workplace(owner, w.b1()).get("currencies")).isEmpty();

    // LIMITED (A1): yalnız A1 kartı; A2'deki grup şirketi bakiyesi görünmez; personel maskeli.
    String limited = limitedUser(w, "lim", "FINANCE", List.of(w.a1()));
    JsonNode scoped = balanceSheet(w, limited, null, null);
    assertThat(scoped.get("workplaces")).hasSize(1);
    assertThat(scoped.get("workplaceCount").asInt()).isEqualTo(1);
    JsonNode masked = scoped.get("workplaces").get(0).get("accounts").get(0);
    assertThat(masked.get("masked").asBoolean()).isTrue();
    assertThat(masked.get("accountId").isNull()).isTrue();
    assertThat(masked.get("accountName").isNull()).isTrue();
    assertThat(dec(scoped.get("assetsTl"))).isEqualByComparingTo("50");
    assertThat(dec(scoped.get("intercompany").get(0).get("balances").get(0).get("amount")))
        .isEqualByComparingTo("70");
    assertThat(scoped.get("companies")).hasSize(1);
    send(w.t(), limited, get(REPORTS + "/balance-sheet").param("branchIds", w.a2()))
        .andExpect(status().isForbidden());
    expect(
        send(w.t(), limited, get(REPORTS + "/balance-sheet").param("companyId", w.companyB())),
        403,
        "COMPANY_OUT_OF_SCOPE");
  }

  // --- 6. hazine

  @Test
  void hazineFonAkisiCekSenetVePersonelMaskesi() throws Exception {
    World w = world("frt");
    String bank = bankFund(w, "BNK-T", w.a1(), "TRY");
    fundTx(w, bank, w.a1(), "IN", "1000", TODAY.minusDays(3));
    fundTx(w, bank, w.a1(), "OUT", "200", TODAY.minusDays(1));
    fundTx(w, bank, w.a1(), "IN", "50", TODAY.minusDays(40));
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    UUID check =
        instrument(
            w, employee, w.a1(), "CHECK", "RECEIVED", "PORTFOLIO", "300", TODAY.plusDays(40));
    update(
        w,
        "update %s.instrument set drawer_name = 'Personel Kişi', fund_account_id = ?::uuid"
            + " where id = ?",
        bank,
        check);
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    instrument(w, supplier, w.a1(), "NOTE", "ISSUED", "ISSUED", "100", TODAY.minusDays(3));
    instrument(w, supplier, w.a1(), "CHECK", "RECEIVED", "COLLECTED", "999", TODAY.plusDays(3));

    JsonNode owner = body(send(w.t(), null, get(REPORTS + "/treasury")).andExpect(status().isOk()));
    JsonNode fund = findRow(owner.get("banks"), "fundAccountId", bank);
    assertThat(dec(fund.get("balance"))).isEqualByComparingTo("850");
    assertThat(dec(fund.get("in30"))).isEqualByComparingTo("1000");
    assertThat(dec(fund.get("out30"))).isEqualByComparingTo("200");
    assertThat(fund.get("checkCount").asInt()).isEqualTo(1);
    assertThat(owner.get("pendingChecks")).hasSize(1);
    assertThat(owner.get("pendingBills")).hasSize(1);
    JsonNode ownerCheck = owner.get("pendingChecks").get(0);
    assertThat(ownerCheck.get("accountName").isNull()).isFalse();
    assertThat(ownerCheck.get("drawerName").asText()).isEqualTo("Personel Kişi");
    assertThat(ownerCheck.get("masked").asBoolean()).isFalse();
    assertThat(owner.get("pendingBills").get(0).get("daysLeft").asInt()).isEqualTo(-3);
    JsonNode tryCard = findRow(owner.get("byCurrency"), "currency", "TRY");
    assertThat(dec(tryCard.get("bank"))).isEqualByComparingTo("850");
    assertThat(dec(tryCard.get("receivedChecks"))).isEqualByComparingTo("300");
    assertThat(dec(tryCard.get("issuedNotes"))).isEqualByComparingTo("100");
    assertThat(dec(tryCard.get("net"))).isEqualByComparingTo("1050");
    assertThat(dec(owner.get("netTl"))).isEqualByComparingTo("1050");
    assertThat(owner.get("bankDaily")).hasSize(30);
    JsonNode day = findRow(owner.get("bankDaily"), "date", TODAY.minusDays(3).toString());
    assertThat(dec(day.get("inTl"))).isEqualByComparingTo("1000");
    assertThat(owner.get("dueBuckets")).hasSize(6);
    YearMonth checkMonth = YearMonth.from(TODAY.plusDays(40));
    JsonNode bucket = findRow(owner.get("dueBuckets"), "month", checkMonth.toString());
    assertThat(dec(bucket.get("checksTl"))).isEqualByComparingTo("300");
    JsonNode current = findRow(owner.get("dueBuckets"), "month", YearMonth.from(TODAY).toString());
    assertThat(dec(current.get("notesTl"))).isEqualByComparingTo("100");

    // SEC-12.8-02: izinsiz kullanıcıda personel çekinin adı ve keşidecisi boş.
    String finance = userWithRole(w, "fin", "FINANCE");
    JsonNode hidden =
        body(send(w.t(), finance, get(REPORTS + "/treasury")).andExpect(status().isOk()));
    JsonNode maskedCheck = hidden.get("pendingChecks").get(0);
    assertThat(maskedCheck.get("masked").asBoolean()).isTrue();
    assertThat(maskedCheck.get("accountName").isNull()).isTrue();
    assertThat(maskedCheck.get("drawerName").isNull()).isTrue();
    // LIMITED (A2): A1 fonu ve çekleri yok.
    String limited = limitedUser(w, "lim", "FINANCE", List.of(w.a2()));
    JsonNode scoped =
        body(send(w.t(), limited, get(REPORTS + "/treasury")).andExpect(status().isOk()));
    assertThat(scoped.get("pendingChecks")).isEmpty();
    assertThat(rowsOf(scoped.get("banks"), "fundAccountId", bank)).isEmpty();
  }

  /**
   * Rev 4 B3-NUM-01: pencere içinde birbirini götüren orijinal + REVERSAL çifti giriş/çıkış ve
   * günlük grafikte sayılmaz; orijinali pencereden önce olan ters kayıt pencerede gerçek giriştir;
   * bugünden sonra ters çevrilen orijinal sayılır. Bakiye değişmez.
   */
  @Test
  void hazineTersKayitCiftiAkislaraGirmez() throws Exception {
    World w = world("frr");
    String bank = bankFund(w, "BNK-R", w.a1(), "TRY");
    fundTx(w, bank, w.a1(), "IN", "1000", TODAY.minusDays(3));
    UUID paid = fundTx(w, bank, w.a1(), "OUT", "10000", TODAY.minusDays(1), "MANUAL", null);
    fundTx(w, bank, w.a1(), "IN", "10000", TODAY.minusDays(1), "REVERSAL", paid);
    UUID old = fundTx(w, bank, w.a1(), "OUT", "70", TODAY.minusDays(40), "MANUAL", null);
    fundTx(w, bank, w.a1(), "IN", "70", TODAY.minusDays(2), "REVERSAL", old);
    UUID later = fundTx(w, bank, w.a1(), "OUT", "30", TODAY.minusDays(1), "MANUAL", null);
    fundTx(w, bank, w.a1(), "IN", "30", TODAY.plusDays(1), "REVERSAL", later);

    JsonNode owner = body(send(w.t(), null, get(REPORTS + "/treasury")).andExpect(status().isOk()));
    JsonNode fund = findRow(owner.get("banks"), "fundAccountId", bank);
    assertThat(dec(fund.get("balance"))).isEqualByComparingTo("970");
    assertThat(dec(fund.get("in30"))).isEqualByComparingTo("1070");
    assertThat(dec(fund.get("out30"))).isEqualByComparingTo("30");
    JsonNode yesterday = findRow(owner.get("bankDaily"), "date", TODAY.minusDays(1).toString());
    assertThat(dec(yesterday.get("inTl"))).isEqualByComparingTo("0");
    assertThat(dec(yesterday.get("outTl"))).isEqualByComparingTo("30");
    JsonNode twoDays = findRow(owner.get("bankDaily"), "date", TODAY.minusDays(2).toString());
    assertThat(dec(twoDays.get("inTl"))).isEqualByComparingTo("70");
    assertThat(dec(twoDays.get("outTl"))).isEqualByComparingTo("0");
  }

  // --- 7. nakit akışı

  @Test
  void nakitAkisiAcikKalanVadeliKalemlerVeCekler() throws Exception {
    World w = world("frc");
    UUID overdue = account(w, AccountType.CUSTOMER, null);
    document(w, overdue, w.a1(), "RECEIVABLE", "400", TODAY.minusDays(20), TODAY.minusDays(3));
    UUID later = account(w, AccountType.CUSTOMER, null);
    document(w, later, w.a1(), "RECEIVABLE", "300", TODAY.minusDays(5), TODAY.plusDays(10));
    // Tahsil edilmiş alacak (ZTO hatası regresyonu) ve vadesiz kalem girmez.
    UUID collected = account(w, AccountType.CUSTOMER, null);
    document(w, collected, w.a1(), "RECEIVABLE", "1000", TODAY.minusDays(5), TODAY.plusDays(3));
    tx(w, collected, w.a1(), "CREDIT", "1000", "TRY", "1", TODAY.minusDays(1), "MANUAL", null);
    UUID noDue = account(w, AccountType.CUSTOMER, null);
    tx(w, noDue, w.a1(), "DEBIT", "777", "TRY", "1", TODAY.minusDays(1), "MANUAL", null);
    // Borç vadesi (yalnız API).
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    document(w, supplier, w.a1(), "PAYABLE", "250", TODAY.minusDays(2), TODAY.plusDays(2));
    instrument(w, later, w.a1(), "CHECK", "RECEIVED", "PORTFOLIO", "150", TODAY.plusDays(15));
    instrument(w, supplier, w.a1(), "CHECK", "ISSUED", "ISSUED", "80", TODAY.plusDays(1));
    instrument(w, later, w.a1(), "NOTE", "RECEIVED", "PORTFOLIO", "60", TODAY.plusDays(1));

    JsonNode flow = body(send(w.t(), null, get(REPORTS + "/cash-flow")).andExpect(status().isOk()));
    assertThat(flow.get("rows")).hasSize(8);
    assertThat(flow.get("currency").isNull()).isTrue();
    assertThat(flow.get("planExcluded").asBoolean()).isTrue();
    JsonNode week1 = flow.get("rows").get(0);
    assertThat(dec(week1.get("receivableDue"))).isEqualByComparingTo("400");
    assertThat(dec(week1.get("issuedChecks"))).isEqualByComparingTo("80");
    assertThat(dec(week1.get("notesInfo"))).isEqualByComparingTo("60");
    assertThat(dec(week1.get("payableDue"))).isEqualByComparingTo("250");
    assertThat(dec(week1.get("net"))).isEqualByComparingTo("320");
    JsonNode week2 = flow.get("rows").get(1);
    assertThat(dec(week2.get("receivableDue"))).isEqualByComparingTo("300");
    JsonNode week3 = flow.get("rows").get(2);
    assertThat(dec(week3.get("receivedChecks"))).isEqualByComparingTo("150");
    assertThat(dec(week3.get("cumulative"))).isEqualByComparingTo("770");
    BigDecimal receivables = BigDecimal.ZERO;
    for (JsonNode row : flow.get("rows")) {
      receivables = receivables.add(dec(row.get("receivableDue")));
    }
    assertThat(receivables).isEqualByComparingTo("700");

    JsonNode inSek =
        body(
            send(
                    w.t(),
                    null,
                    get(REPORTS + "/cash-flow").param("currency", SEK).param("weeks", "4"))
                .andExpect(status().isOk()));
    assertThat(inSek.get("rows")).hasSize(4);
    assertThat(dec(inSek.get("rows").get(0).get("receivableDue"))).isEqualByComparingTo("0");
    expect(
        send(w.t(), null, get(REPORTS + "/cash-flow").param("weeks", "0")), 400, "WEEKS_INVALID");
  }

  // --- 8. ödeme performansı

  @Test
  void performansEslesmeBasinaGecikmeKartezyenCogalmaz() throws Exception {
    World w = world("frp");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID late = accountDocument(w, customer, w.a1(), w.companyA(), "RECEIVABLE", "DIGER", "100");
    UUID onTime = accountDocument(w, customer, w.a1(), w.companyA(), "RECEIVABLE", "DIGER", "100");
    update(
        w, "update %s.account_document set due_date = ? where id = ?", TODAY.minusDays(20), late);
    update(
        w, "update %s.account_document set due_date = ? where id = ?", TODAY.minusDays(5), onTime);
    UUID s1 =
        settlement(w, customer, w.a1(), "COLLECTION", "CASH", null, "100", TODAY.minusDays(10));
    UUID s2 =
        settlement(w, customer, w.a1(), "COLLECTION", "CASH", null, "100", TODAY.minusDays(10));
    settlement(w, customer, w.a1(), "COLLECTION", "CASH", null, "30", TODAY.minusDays(9));
    for (UUID s : List.of(s1, s2)) {
      allocate(w, s, late, "50");
      allocate(w, s, onTime, "50");
    }

    JsonNode rows =
        body(
            send(
                    w.t(),
                    null,
                    get(REPORTS + "/account-performance")
                        .param("from", TODAY.minusDays(30).toString())
                        .param("to", TODAY.toString()))
                .andExpect(status().isOk()));
    JsonNode row = find(rows, "accountId", customer.toString());
    assertThat(row.get("collectionCount").asLong()).isEqualTo(3);
    assertThat(dec(row.get("collectionAmount"))).isEqualByComparingTo("230");
    assertThat(row.get("lateCount").asLong()).isEqualTo(2);
    assertThat(row.get("onTimeCount").asLong()).isEqualTo(2);
    assertThat(row.get("unmatchedCount").asLong()).isEqualTo(1);
    assertThat(row.get("score").asInt()).isEqualTo(50);
    assertThat(dec(row.get("avgDelayDays"))).isEqualByComparingTo("2.5");
    expect(
        send(
            w.t(),
            null,
            get(REPORTS + "/account-performance")
                .param("from", TODAY.minusDays(3000).toString())
                .param("to", TODAY.toString())),
        400,
        "PERIOD_TOO_LONG");
  }

  /**
   * Rev 4 B3-NUM-02: hedefi sonradan iptal edilen eşleşme gecikme/zamanında sayılmaz; tahsilat
   * eşleşmesiz kalır (V36 geçerlilik kuralı; {@code SettlementQueryRepository} targetCancelled).
   */
  @Test
  void performansIptalEdilmisHedefeEslesmeEslesmesizSayilir() throws Exception {
    World w = world("frq");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID document =
        accountDocument(w, customer, w.a1(), w.companyA(), "RECEIVABLE", "DIGER", "100");
    update(
        w,
        "update %s.account_document set due_date = ? where id = ?",
        TODAY.minusDays(20),
        document);
    UUID collection =
        settlement(w, customer, w.a1(), "COLLECTION", "CASH", null, "100", TODAY.minusDays(10));
    allocate(w, collection, document, "100");
    JsonNode before = performance(w, customer);
    assertThat(before.get("lateCount").asLong()).isEqualTo(1);
    assertThat(before.get("unmatchedCount").asLong()).isEqualTo(0);

    update(
        w,
        "update %s.account_document set status = 'CANCELLED', cancel_date = ? where id = ?",
        TODAY.minusDays(1),
        document);
    JsonNode after = performance(w, customer);
    assertThat(after.get("collectionCount").asLong()).isEqualTo(1);
    assertThat(after.get("lateCount").asLong()).isEqualTo(0);
    assertThat(after.get("onTimeCount").asLong()).isEqualTo(0);
    assertThat(after.get("avgDelayDays").isNull()).isTrue();
    assertThat(after.get("unmatchedCount").asLong()).isEqualTo(1);
  }

  private JsonNode performance(World w, UUID account) throws Exception {
    JsonNode rows =
        body(
            send(
                    w.t(),
                    null,
                    get(REPORTS + "/account-performance")
                        .param("from", TODAY.minusDays(30).toString())
                        .param("to", TODAY.toString())
                        .param("accountId", account.toString()))
                .andExpect(status().isOk()));
    return find(rows, "accountId", account.toString());
  }

  // --- 9. döviz pozisyonu

  @Test
  void dovizPozisyonuSirketlerArasiNetlesmezVeKapsamliDaralir() throws Exception {
    World w = world("frx");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    tx(w, customer, w.a1(), "DEBIT", "100", SEK, "3", TODAY.minusDays(1), "MANUAL", null);
    tx(w, customer, w.b1(), "CREDIT", "100", SEK, "3", TODAY.minusDays(1), "MANUAL", null);
    UUID group = intercompany(w, w.companyB());
    tx(w, group, w.a1(), "DEBIT", "500", SEK, "3", TODAY.minusDays(1), "MANUAL", null);

    JsonNode consolidated =
        body(send(w.t(), null, get(REPORTS + "/currency-position")).andExpect(status().isOk()));
    JsonNode sek = findRow(consolidated, "currency", SEK);
    assertThat(dec(sek.get("receivable"))).isEqualByComparingTo("100");
    assertThat(dec(sek.get("payable"))).isEqualByComparingTo("100");
    assertThat(dec(sek.get("net"))).isEqualByComparingTo("0");
    assertThat(sek.get("companyId").isNull()).isTrue();

    JsonNode byCompany =
        body(
            send(w.t(), null, get(REPORTS + "/currency-position").param("byCompany", "true"))
                .andExpect(status().isOk()));
    List<JsonNode> sekRows = rowsOf(byCompany, "currency", SEK);
    assertThat(sekRows).hasSize(2);
    JsonNode inA = findRow(byCompany, "companyId", w.companyA());
    assertThat(dec(inA.get("receivable"))).isEqualByComparingTo("100");

    // Şirket seçiliyken grup şirketi carisi dahil.
    JsonNode companyA =
        body(
            send(w.t(), null, get(REPORTS + "/currency-position").param("companyId", w.companyA()))
                .andExpect(status().isOk()));
    assertThat(dec(findRow(companyA, "currency", SEK).get("receivable")))
        .isEqualByComparingTo("600");

    // LIMITED (B1): yalnız B1 hareketleri.
    String limited = limitedUser(w, "lim", "FINANCE", List.of(w.b1()));
    JsonNode scoped =
        body(send(w.t(), limited, get(REPORTS + "/currency-position")).andExpect(status().isOk()));
    JsonNode scopedSek = findRow(scoped, "currency", SEK);
    assertThat(dec(scopedSek.get("receivable"))).isEqualByComparingTo("0");
    assertThat(dec(scopedSek.get("payable"))).isEqualByComparingTo("100");
  }

  // --- 10. kapsam ve izin

  @Test
  void raporUclariIzinVeKiraciIzolasyonu() throws Exception {
    World w = world("fri");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    document(w, customer, w.a1(), "RECEIVABLE", "100", TODAY.minusDays(1), TODAY.plusDays(2));
    UUID deleted = account(w, AccountType.CUSTOMER, null);
    document(w, deleted, w.a1(), "RECEIVABLE", "999", TODAY.minusDays(1), TODAY.plusDays(2));
    update(w, "update %s.account set deleted = true where id = ?", deleted);
    UUID deletedDoc =
        document(w, customer, w.a1(), "RECEIVABLE", "555", TODAY.minusDays(1), TODAY.plusDays(2));
    update(w, "update %s.account_transaction set deleted = true where source_id = ?", deletedDoc);

    // Rev 4 T1: tüm GET uçları, en küçük geçerli parametreleriyle.
    Map<String, Map<String, String>> endpoints = new LinkedHashMap<>();
    endpoints.put("/aging", Map.of("type", "RECEIVABLE", "asOf", TODAY.toString()));
    endpoints.put("/ledger-summary", Map.of());
    endpoints.put("/ledger-accounts", Map.of("reportType", "SALES"));
    endpoints.put("/account-methods", Map.of("accountId", customer.toString()));
    endpoints.put("/balance-sheet", Map.of());
    endpoints.put("/treasury", Map.of());
    endpoints.put("/cash-flow", Map.of());
    endpoints.put(
        "/account-performance",
        Map.of("from", TODAY.minusDays(30).toString(), "to", TODAY.toString()));
    endpoints.put("/currency-position", Map.of());
    endpoints.put("/fx-differences", Map.of());
    String operations = userWithRole(w, "ops", "OPERATIONS");
    String limited = limitedUser(w, "lim", "FINANCE", List.of(w.a1()));
    for (Map.Entry<String, Map<String, String>> e : endpoints.entrySet()) {
      send(w.t(), operations, request(e.getKey(), e.getValue(), Map.of()))
          .andExpect(status().isForbidden());
      send(w.t(), limited, request(e.getKey(), e.getValue(), Map.of())).andExpect(status().isOk());
      expect(
          send(w.t(), limited, request(e.getKey(), e.getValue(), Map.of("branchIds", w.a2()))),
          403,
          "BRANCH_OUT_OF_SCOPE");
      expect(
          send(
              w.t(), limited, request(e.getKey(), e.getValue(), Map.of("companyId", w.companyB()))),
          403,
          "COMPANY_OUT_OF_SCOPE");
    }

    // Silinmiş cari (999) ve silinmiş hareket (555) hiçbir raporda yok.
    JsonNode summary =
        body(send(w.t(), null, get(REPORTS + "/ledger-summary")).andExpect(status().isOk()));
    assertThat(dec(findRow(summary.get("rows"), "reportType", "SALES").get("theyOwe")))
        .isEqualByComparingTo("100");
    assertThat(dec(balanceSheet(w, null, null, null).get("assetsTl"))).isEqualByComparingTo("100");
    JsonNode aged = aging(w, null, "RECEIVABLE", "TRANSACTION", Map.of());
    assertThat(aged).hasSize(1);
    assertThat(dec(aged.get(0).get("total"))).isEqualByComparingTo("100");
    JsonNode flow = body(send(w.t(), null, get(REPORTS + "/cash-flow")).andExpect(status().isOk()));
    assertThat(sum(flow.get("rows"), "receivableDue")).isEqualByComparingTo("100");
    JsonNode position =
        body(send(w.t(), null, get(REPORTS + "/currency-position")).andExpect(status().isOk()));
    assertThat(dec(findRow(position, "currency", "TRY").get("receivable")))
        .isEqualByComparingTo("100");

    // Başka kiracının verisi görünmez; A kiracısının carisi B'den sorgulanamaz.
    World other = world("frj");
    JsonNode foreign =
        body(send(other.t(), null, get(REPORTS + "/ledger-summary")).andExpect(status().isOk()));
    assertThat(foreign.get("rows")).isEmpty();
    expect(
        send(
            other.t(),
            null,
            get(REPORTS + "/account-methods").param("accountId", customer.toString())),
        404,
        "ACCOUNT_NOT_FOUND");
    expect(
        send(
            other.t(),
            null,
            get(REPORTS + "/ledger-accounts")
                .param("reportType", "SALES")
                .param("accountId", customer.toString())),
        404,
        "ACCOUNT_NOT_FOUND");
  }

  /**
   * Rev 4 B34-SCOPE-01: LIMITED (A1) kullanıcıda ledger-summary, ledger-accounts (son tahsilat,
   * dönem sonrası sayısı), account-methods, cash-flow ve account-performance yalnız A1 verisini
   * içerir. Denetim: aynı çağrılar ALL kullanıcıda A2 verisini gösterir (kurulum kanıtı).
   */
  @Test
  void raporUclariLimitedKapsamdaDaralir() throws Exception {
    World w = world("frs");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    document(w, customer, w.a1(), "RECEIVABLE", "1000", TODAY.minusDays(6), TODAY.plusDays(3));
    document(w, customer, w.a2(), "RECEIVABLE", "500", TODAY.minusDays(5), TODAY.plusDays(3));
    UUID collection =
        settlement(w, customer, w.a2(), "COLLECTION", "CASH", null, "200", TODAY.minusDays(3));
    tx(
        w,
        customer,
        w.a2(),
        "CREDIT",
        "200",
        "TRY",
        "1",
        TODAY.minusDays(3),
        "SETTLEMENT",
        collection);
    tx(w, customer, w.a2(), "DEBIT", "5", "TRY", "1", TODAY, "MANUAL", null);
    instrument(w, customer, w.a2(), "CHECK", "RECEIVED", "PORTFOLIO", "150", TODAY.plusDays(10));
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    settlement(w, supplier, w.a1(), "PAYMENT", "CASH", null, "10", TODAY.minusDays(2));
    settlement(w, supplier, w.a2(), "PAYMENT", "CASH", null, "20", TODAY.minusDays(2));
    String limited = limitedUser(w, "lim", "FINANCE", List.of(w.a1()));
    String to = TODAY.minusDays(1).toString();

    // (a) ledger-summary
    MockHttpServletRequestBuilder summary = request("/ledger-summary", Map.of("to", to), Map.of());
    assertThat(theyOwe(body(send(w.t(), null, summary).andExpect(status().isOk()))))
        .isEqualByComparingTo("1300");
    summary = request("/ledger-summary", Map.of("to", to), Map.of());
    assertThat(theyOwe(body(send(w.t(), limited, summary).andExpect(status().isOk()))))
        .isEqualByComparingTo("1000");

    // (b) ledger-accounts: bakiye, son tahsilat, dönem sonrası sayısı
    Map<String, String> listParams = Map.of("reportType", "SALES", "to", to);
    JsonNode allList =
        body(
            send(w.t(), null, request("/ledger-accounts", listParams, Map.of()))
                .andExpect(status().isOk()));
    JsonNode allRow = findRow(allList.get("rows"), "accountId", customer.toString());
    assertThat(dec(allRow.get("closing"))).isEqualByComparingTo("1300");
    assertThat(allRow.get("lastSettlementDate").asText()).isEqualTo(TODAY.minusDays(3).toString());
    assertThat(allList.get("postPeriodCount").asLong()).isEqualTo(1);
    JsonNode limitedList =
        body(
            send(w.t(), limited, request("/ledger-accounts", listParams, Map.of()))
                .andExpect(status().isOk()));
    List<JsonNode> limitedRows = rowsOf(limitedList.get("rows"), "accountId", customer.toString());
    assertThat(limitedRows).hasSize(1);
    assertThat(dec(limitedRows.get(0).get("closing"))).isEqualByComparingTo("1000");
    assertThat(limitedRows.get(0).get("lastSettlementDate").isNull()).isTrue();
    assertThat(limitedRows.get(0).get("lastSettlementAmount").isNull()).isTrue();
    assertThat(limitedList.get("postPeriodCount").asLong()).isEqualTo(0);

    // (c) account-methods
    Map<String, String> methodParams = Map.of("accountId", customer.toString());
    JsonNode allMethods =
        body(
            send(w.t(), null, request("/account-methods", methodParams, Map.of()))
                .andExpect(status().isOk()));
    assertThat(allMethods).hasSize(1);
    assertThat(dec(allMethods.get(0).get("amount"))).isEqualByComparingTo("200");
    assertThat(
            body(
                send(w.t(), limited, request("/account-methods", methodParams, Map.of()))
                    .andExpect(status().isOk())))
        .isEmpty();

    // (d) cash-flow
    JsonNode allFlow =
        body(send(w.t(), null, get(REPORTS + "/cash-flow")).andExpect(status().isOk()));
    assertThat(sum(allFlow.get("rows"), "receivableDue")).isEqualByComparingTo("1300");
    assertThat(sum(allFlow.get("rows"), "receivedChecks")).isEqualByComparingTo("150");
    JsonNode limitedFlow =
        body(send(w.t(), limited, get(REPORTS + "/cash-flow")).andExpect(status().isOk()));
    assertThat(sum(limitedFlow.get("rows"), "receivableDue")).isEqualByComparingTo("1000");
    assertThat(sum(limitedFlow.get("rows"), "receivedChecks")).isEqualByComparingTo("0");

    // (e) account-performance
    Map<String, String> period =
        Map.of("from", TODAY.minusDays(30).toString(), "to", TODAY.toString());
    JsonNode allPerf =
        body(
            send(w.t(), null, request("/account-performance", period, Map.of()))
                .andExpect(status().isOk()));
    JsonNode allSupplier = find(allPerf, "accountId", supplier.toString());
    assertThat(allSupplier.get("paymentCount").asLong()).isEqualTo(2);
    assertThat(dec(allSupplier.get("paymentAmount"))).isEqualByComparingTo("30");
    assertThat(findRowOrNull(allPerf, "accountId", customer.toString())).isNotNull();
    JsonNode limitedPerf =
        body(
            send(w.t(), limited, request("/account-performance", period, Map.of()))
                .andExpect(status().isOk()));
    JsonNode limitedSupplier = find(limitedPerf, "accountId", supplier.toString());
    assertThat(limitedSupplier.get("paymentCount").asLong()).isEqualTo(1);
    assertThat(dec(limitedSupplier.get("paymentAmount"))).isEqualByComparingTo("10");
    assertThat(findRowOrNull(limitedPerf, "accountId", customer.toString())).isNull();
  }

  private static MockHttpServletRequestBuilder request(
      String path, Map<String, String> params, Map<String, String> extra) {
    MockHttpServletRequestBuilder request = get(REPORTS + path);
    params.forEach(request::param);
    extra.forEach(request::param);
    return request;
  }

  private static BigDecimal theyOwe(JsonNode summary) {
    return dec(findRow(summary.get("rows"), "reportType", "SALES").get("theyOwe"));
  }

  private static BigDecimal sum(JsonNode rows, String field) {
    BigDecimal total = BigDecimal.ZERO;
    for (JsonNode row : rows) {
      total = total.add(dec(row.get(field)));
    }
    return total;
  }

  // --- yardımcılar

  private void rate(LocalDate date, String value) {
    rate(SEK, date, value);
  }

  private void rate(String currency, LocalDate date, String value) {
    jdbc.update(
        "insert into admin.exchange_rate (id, currency, rate_date, rate, source, created_at)"
            + " values (gen_random_uuid(), ?, ?, ?, 'TEST', now()) on conflict do nothing",
        currency,
        date,
        new BigDecimal(value));
  }

  private String companyOf(World w, String branch) {
    return w.b1().equals(branch) ? w.companyB() : w.companyA();
  }

  /** Doğrudan SQL cari hareketi (rapor salt okuma; defter akışı test edilmez). */
  private UUID tx(
      World w,
      UUID account,
      String branch,
      String direction,
      String amount,
      String currency,
      String rate,
      LocalDate date,
      String sourceType,
      UUID sourceId) {
    Map<String, Object> values = new HashMap<>();
    values.put("account_id", account);
    values.put("branch_id", UUID.fromString(branch));
    values.put("company_id", UUID.fromString(companyOf(w, branch)));
    values.put("direction", direction);
    values.put("amount", new BigDecimal(amount));
    values.put("currency", currency);
    values.put("exchange_rate", new BigDecimal(rate));
    values.put("rate_date", date);
    values.put("tl_amount", new BigDecimal(amount).multiply(new BigDecimal(rate)));
    values.put("transaction_date", date);
    values.put("source_type", sourceType);
    values.put("source_id", sourceId == null ? UUID.randomUUID() : sourceId);
    return insert(w, "account_transaction", values);
  }

  /** Vadeli cari belgesi ve deftere yansıyan hareketi. */
  private UUID document(
      World w,
      UUID account,
      String branch,
      String side,
      String amount,
      LocalDate date,
      LocalDate due) {
    UUID doc = accountDocument(w, account, branch, companyOf(w, branch), side, "DIGER", amount);
    update(
        w,
        "update %s.account_document set document_date = ?, due_date = ? where id = ?",
        date,
        due,
        doc);
    tx(
        w,
        account,
        branch,
        "RECEIVABLE".equals(side) ? "DEBIT" : "CREDIT",
        amount,
        "TRY",
        "1",
        date,
        "ACCOUNT_DOCUMENT",
        doc);
    return doc;
  }

  /** API ile elle SEK hareketi (kur farkı kesimi için gerçek kaynak). */
  private UUID manualSek(
      World w,
      UUID account,
      String branch,
      String direction,
      String amount,
      LocalDate date,
      String rate)
      throws Exception {
    return manualFx(w, account, branch, direction, amount, SEK, date, rate);
  }

  private UUID manualFx(
      World w,
      UUID account,
      String branch,
      String direction,
      String amount,
      String currency,
      LocalDate date,
      String rate)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("branchId", branch);
    body.put("direction", direction);
    body.put("money", Map.of("amount", amount, "currency", currency));
    body.put("date", date.toString());
    body.put("exchangeRate", rate);
    return UUID.fromString(
        id(sendJson(w.t(), null, post(FINANCE + "/accounts/" + account + "/transactions"), body)));
  }

  /** Şirket kartıyla açılmış grup şirketi carisi (iki şirketli kiracıda kendiliğinden var). */
  private UUID intercompany(World w, String represents) {
    return jdbc.queryForObject(
        "select id from \"%s\".account where represents_company_id = ?::uuid and deleted = false"
            .formatted(w.schema()),
        UUID.class,
        represents);
  }

  private UUID settlement(
      World w,
      UUID account,
      String branch,
      String type,
      String method,
      String channel,
      String amount,
      LocalDate date) {
    Map<String, Object> values = new HashMap<>();
    values.put("type", type);
    values.put("method", method);
    if (channel != null) {
      values.put("channel", channel);
    }
    values.put("account_id", account);
    values.put("branch_id", UUID.fromString(branch));
    values.put("company_id", UUID.fromString(companyOf(w, branch)));
    values.put("amount", new BigDecimal(amount));
    values.put("currency", "TRY");
    values.put("settlement_date", date);
    values.put("status", "POSTED");
    values.put("deleted", false);
    return insert(w, "settlement", values);
  }

  private void allocate(World w, UUID settlement, UUID document, String amount) {
    Map<String, Object> values = new HashMap<>();
    values.put("settlement_id", settlement);
    values.put("company_id", w.companyAId());
    values.put("target_type", "ACCOUNT_DOCUMENT");
    values.put("account_document_id", document);
    values.put("amount", new BigDecimal(amount));
    values.put("currency", "TRY");
    values.put("deleted", false);
    insert(w, "settlement_allocation", values);
  }

  private UUID instrument(
      World w,
      UUID account,
      String branch,
      String kind,
      String direction,
      String status,
      String amount,
      LocalDate due) {
    Map<String, Object> values = new HashMap<>();
    values.put("kind", kind);
    values.put("direction", direction);
    values.put("number", "N-" + UUID.randomUUID().toString().substring(0, 8));
    values.put("account_id", account);
    values.put("branch_id", UUID.fromString(branch));
    values.put("company_id", UUID.fromString(companyOf(w, branch)));
    values.put("amount", new BigDecimal(amount));
    values.put("currency", "TRY");
    values.put("due_date", due);
    values.put("status", status);
    values.put("is_collateral", "COLLATERAL".equals(status));
    values.put("deleted", false);
    return insert(w, "instrument", values);
  }

  private void fundTx(
      World w, String fund, String branch, String direction, String amount, LocalDate date) {
    fundTx(w, fund, branch, direction, amount, date, "MANUAL", null);
  }

  private UUID fundTx(
      World w,
      String fund,
      String branch,
      String direction,
      String amount,
      LocalDate date,
      String sourceType,
      UUID sourceId) {
    Map<String, Object> values = new HashMap<>();
    values.put("fund_account_id", UUID.fromString(fund));
    values.put("company_id", UUID.fromString(companyOf(w, branch)));
    values.put("direction", direction);
    values.put("amount", new BigDecimal(amount));
    values.put("currency", "TRY");
    values.put("exchange_rate", BigDecimal.ONE);
    values.put("rate_date", date);
    values.put("tl_amount", new BigDecimal(amount));
    values.put("transaction_date", date);
    values.put("source_type", sourceType);
    values.put("source_id", sourceId == null ? UUID.randomUUID() : sourceId);
    values.put("deleted", false);
    return insert(w, "fund_transaction", values);
  }

  private JsonNode aging(
      World w, String token, String type, String basis, Map<String, String> params)
      throws Exception {
    MockHttpServletRequestBuilder request =
        get(REPORTS + "/aging")
            .param("type", type)
            .param("asOf", TODAY.toString())
            .param("basis", basis);
    params.forEach(request::param);
    return body(send(w.t(), token, request).andExpect(status().isOk()));
  }

  private JsonNode balanceSheet(World w, String token, String company, LocalDate asOf)
      throws Exception {
    MockHttpServletRequestBuilder request = get(REPORTS + "/balance-sheet");
    if (company != null) {
      request.param("companyId", company);
    }
    if (asOf != null) {
      request.param("asOf", asOf.toString());
    }
    return body(send(w.t(), token, request).andExpect(status().isOk()));
  }

  private static JsonNode workplace(JsonNode sheet, String branch) {
    return findRow(sheet.get("workplaces"), "branchId", branch);
  }

  private static JsonNode currencyOf(JsonNode workplace, String currency) {
    return findRow(workplace.get("currencies"), "currency", currency);
  }

  private static JsonNode nullTypeRow(JsonNode summary) {
    for (JsonNode row : summary.get("rows")) {
      if (row.get("reportType").isNull()) {
        return row;
      }
    }
    return null;
  }

  private static JsonNode find(JsonNode array, String field, String value) {
    return findRow(array, field, value);
  }

  private static JsonNode findRow(JsonNode array, String field, String value) {
    JsonNode row = findRowOrNull(array, field, value);
    if (row == null) {
      throw new AssertionError("Satır yok: " + field + "=" + value + " in " + array);
    }
    return row;
  }

  private static JsonNode findRowOrNull(JsonNode array, String field, String value) {
    for (JsonNode row : array) {
      if (value.equals(row.get(field).asText())) {
        return row;
      }
    }
    return null;
  }

  private static List<JsonNode> rowsOf(JsonNode array, String field, String value) {
    List<JsonNode> rows = new ArrayList<>();
    array.forEach(
        row -> {
          if (value.equals(row.get(field).asText())) {
            rows.add(row);
          }
        });
    return rows;
  }

  private static BigDecimal dec(JsonNode node) {
    return new BigDecimal(node.asText());
  }
}
