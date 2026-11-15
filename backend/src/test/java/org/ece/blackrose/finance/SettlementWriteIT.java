package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.junit.jupiter.api.Test;

/**
 * Ödeme/tahsilat yazım yolu (12.2a §3.1–§3.4, §6.2 {@code SettlementWriteIT}): belge no, kanal,
 * karşı taraf banka hesabı, kredi kartı, kendi çekin banka hesabı, bankaya yatırılmış çek
 * tahsilatı, türetilmiş akışların kanalı, önizleme (çek bilgisi zorunlu değil, düzeltme önizlemesi)
 * ve idempotent tekrar.
 */
class SettlementWriteIT extends SettlementTestSupport {

  @Test
  void belgeNoKanalVeKarsiTarafHesabiSaklanir() throws Exception {
    World w = world("sw1");
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    String counterparty = counterpartyBank(w, supplier, "11112222");

    Map<String, Object> transfer = body("BANK", supplier, w.a1(), bank, "100");
    transfer.put("documentNo", "  DK-1  ");
    transfer.put("counterpartyBankAccountId", counterparty);
    JsonNode saved = body(pay(w, null, transfer, null).andExpect(status().isCreated()));
    assertThat(saved.get("documentNo").asText()).isEqualTo("DK-1");
    assertThat(saved.get("channel").asText()).isEqualTo("TRANSFER");
    assertThat(saved.get("counterpartyBankAccountId").asText()).isEqualTo(counterparty);
    assertThat(saved.get("correctsSettlementId").isNull()).isTrue();
    assertThat(saved.get("reverseReason").isNull()).isTrue();
    assertThat(saved.get("reversedOn").isNull()).isTrue();
    Map<String, Object> stored =
        row(
            w,
            "select document_no, channel, counterparty_bank_account_id::text as cp"
                + " from %s.settlement where id = ?::uuid",
            saved.get("id").asText());
    assertThat(stored)
        .containsEntry("document_no", "DK-1")
        .containsEntry("channel", "TRANSFER")
        .containsEntry("cp", counterparty);

    // Nakitte kanal 400; boş belge no saklanmaz; 50 karakteri aşan belge no doğrulama hatası.
    Map<String, Object> cash = body("CASH", supplier, w.a1(), w.fundA1(), "10");
    cash.put("channel", "CREDIT_CARD");
    expect(pay(w, null, cash, null), 400, "CHANNEL_INVALID");
    cash.remove("channel");
    cash.put("documentNo", "   ");
    JsonNode blank = body(pay(w, null, cash, null).andExpect(status().isCreated()));
    assertThat(blank.get("documentNo").isNull()).isTrue();
    assertThat(blank.get("channel").isNull()).isTrue();
    cash.put("documentNo", "X".repeat(51));
    pay(w, null, cash, null).andExpect(status().isBadRequest());
  }

  @Test
  void krediKartiOdemesiBankaFonundanCikarVeCariBorclanir() throws Exception {
    World w = world("sw2");
    String bank = bankFund(w, "KART-A1", w.a1(), "TRY");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    Map<String, Object> card = body("BANK", supplier, w.a1(), bank, "75.50");
    card.put("channel", "CREDIT_CARD");
    JsonNode saved = body(pay(w, null, card, null).andExpect(status().isCreated()));
    assertThat(saved.get("channel").asText()).isEqualTo("CREDIT_CARD");
    assertThat(saved.get("method").asText()).isEqualTo("BANK");
    assertThat(fundNet(w, bank)).isEqualByComparingTo("-75.50");
    assertThat(accountNet(w, supplier)).isEqualByComparingTo("75.50");
    // Tahsilatta da kart kanalı kabul edilir.
    UUID customer = account(w, AccountType.CUSTOMER, null);
    Map<String, Object> collection = body("BANK", customer, w.a1(), bank, "20");
    collection.put("channel", "CREDIT_CARD");
    JsonNode collected = body(collect(w, null, collection, null).andExpect(status().isCreated()));
    assertThat(collected.get("channel").asText()).isEqualTo("CREDIT_CARD");
    assertThat(fundNet(w, bank)).isEqualByComparingTo("-55.50");
  }

  @Test
  void karsiTarafHesabiCariyeAitVeAktifOlmali() throws Exception {
    World w = world("sw3");
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    UUID other = account(w, AccountType.SUPPLIER, null);
    String foreign = counterpartyBank(w, other, "33334444");
    String own = counterpartyBank(w, supplier, "55556666");

    Map<String, Object> wrong = body("BANK", supplier, w.a1(), bank, "10");
    wrong.put("counterpartyBankAccountId", foreign);
    expect(pay(w, null, wrong, null), 422, "COUNTERPARTY_BANK_ACCOUNT_INVALID");
    Map<String, Object> cash = body("CASH", supplier, w.a1(), w.fundA1(), "10");
    cash.put("counterpartyBankAccountId", own);
    expect(pay(w, null, cash, null), 422, "COUNTERPARTY_BANK_ACCOUNT_INVALID");
    sendJson(
            w.t(),
            null,
            patch(FINANCE + "/bank-accounts/" + own + "/active"),
            Map.of("active", false))
        .andExpect(status().isOk());
    Map<String, Object> inactive = body("BANK", supplier, w.a1(), bank, "10");
    inactive.put("counterpartyBankAccountId", own);
    expect(pay(w, null, inactive, null), 422, "COUNTERPARTY_BANK_ACCOUNT_INVALID");
    // Önizleme de aynı kuralı uygular.
    expect(check(w, null, "PAYMENT", null, inactive), 422, "COUNTERPARTY_BANK_ACCOUNT_INVALID");
    assertThat(count(w, "select count(*) from %s.settlement")).isZero();
  }

  @Test
  void kendiCekiBankaHesabiylaVerilirFonHareketiYok() throws Exception {
    World w = world("sw4");
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    String bankB = bankFund(w, "BANKA-B1", w.b1(), "TRY");
    String usd = bankFund(w, "USD-A1", w.a1(), "USD");
    UUID supplier = account(w, AccountType.SUPPLIER, null);

    Map<String, Object> check = body("CHECK", supplier, w.a1(), null, "250");
    check.put("instrument", instrument("CHECK", "1234567", bank, null));
    JsonNode saved = body(pay(w, null, check, null).andExpect(status().isCreated()));
    Map<String, Object> instrument =
        row(
            w,
            "select status, fund_account_id::text as fund from %s.instrument where id = ?::uuid",
            saved.get("instrumentId").asText());
    assertThat(instrument).containsEntry("status", "ISSUED").containsEntry("fund", bank);
    assertThat(count(w, "select count(*) from %s.fund_transaction")).isZero();
    assertThat(accountNet(w, supplier)).isEqualByComparingTo("250");

    // Başka şirketin bankası 422; döviz bankası 400; kasa 400.
    check.put("instrument", instrument("CHECK", "1234568", bankB, null));
    expect(pay(w, null, check, null), 422, "COMPANY_MISMATCH");
    check.put("instrument", instrument("CHECK", "1234569", usd, null));
    expect(pay(w, null, check, null), 400, "CURRENCY_MISMATCH");
    check.put("instrument", instrument("NOTE", "S-1", w.fundA1(), null));
    expect(pay(w, null, check, null), 400, "FUND_KIND_MISMATCH");
    // Ödemede ilk durum verilmez.
    check.put("instrument", instrument("CHECK", "1234570", bank, "AT_BANK"));
    expect(pay(w, null, check, null), 400, "INSTRUMENT_STATUS_INVALID");
    // Pasif banka hesabı kullanıcı kapısında 422.
    setFundActive(w, bank, false);
    check.put("instrument", instrument("CHECK", "1234571", bank, null));
    expect(pay(w, null, check, null), 422, "FUND_INACTIVE");
    assertThat(count(w, "select count(*) from %s.instrument")).isEqualTo(1);
  }

  @Test
  void bankayaYatirilmisCekTahsilatiIkiHareketFonHareketsiz() throws Exception {
    World w = world("sw5");
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    UUID customer = account(w, AccountType.CUSTOMER, null);

    Map<String, Object> deposited = body("CHECK", customer, w.a1(), null, "400");
    deposited.put("instrument", instrument("CHECK", "7654321", bank, "AT_BANK"));
    JsonNode saved = body(collect(w, null, deposited, null).andExpect(status().isCreated()));
    String instrumentId = saved.get("instrumentId").asText();
    Map<String, Object> instrument =
        row(
            w,
            "select status, fund_account_id::text as fund from %s.instrument where id = ?::uuid",
            instrumentId);
    assertThat(instrument).containsEntry("status", "AT_BANK").containsEntry("fund", bank);
    List<Map<String, Object>> movements =
        jdbc.queryForList(
            ("select from_status, to_status from \"%s\".instrument_movement"
                    + " where instrument_id = ?::uuid order by from_status nulls first")
                .formatted(w.schema()),
            instrumentId);
    assertThat(movements).hasSize(2);
    assertThat(movements.get(0).get("from_status")).isNull();
    assertThat(movements.get(0).get("to_status")).isEqualTo("PORTFOLIO");
    assertThat(movements.get(1).get("from_status")).isEqualTo("PORTFOLIO");
    assertThat(movements.get(1).get("to_status")).isEqualTo("AT_BANK");
    assertThat(count(w, "select count(*) from %s.fund_transaction")).isZero();
    assertThat(accountNet(w, customer)).isEqualByComparingTo("-400");

    // Portföy (varsayılan ve açık) fonsuz kabul edilir.
    Map<String, Object> portfolio = body("CHECK", customer, w.a1(), null, "50");
    portfolio.put("instrument", instrument("CHECK", "7654322", null, "PORTFOLIO"));
    collect(w, null, portfolio, null).andExpect(status().isCreated());

    // Senet bankaya yatırılamaz; fonsuz AT_BANK; portföye fon; başka durum.
    Map<String, Object> invalid = body("CHECK", customer, w.a1(), null, "50");
    invalid.put("instrument", instrument("NOTE", "S-9", bank, "AT_BANK"));
    expect(collect(w, null, invalid, null), 400, "INSTRUMENT_STATUS_INVALID");
    invalid.put("instrument", instrument("CHECK", "7654323", null, "AT_BANK"));
    expect(collect(w, null, invalid, null), 400, "FUND_REQUIRED");
    invalid.put("instrument", instrument("CHECK", "7654324", bank, null));
    expect(collect(w, null, invalid, null), 400, "INSTRUMENT_STATUS_INVALID");
    invalid.put("instrument", instrument("CHECK", "7654325", null, "COLLECTED"));
    expect(collect(w, null, invalid, null), 400, "INSTRUMENT_STATUS_INVALID");
    invalid.put("instrument", instrument("CHECK", "7654326", w.fundA1(), "AT_BANK"));
    expect(collect(w, null, invalid, null), 400, "FUND_KIND_MISMATCH");
    assertThat(count(w, "select count(*) from %s.instrument")).isEqualTo(2);
  }

  @Test
  void turetilmisAkislarBankaKanaliniHavaleYazar() throws Exception {
    World w = world("sw6");
    String bankA = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    String bankB = bankFund(w, "BANKA-B1", w.b1(), "TRY");
    UUID supplier = account(w, AccountType.SUPPLIER, null);

    // Sürücü avansı (banka).
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
                bankA,
                "money",
                Map.of("amount", "25", "currency", "TRY"),
                "date",
                TODAY.toString()))
        .andExpect(status().isCreated());
    // Araç gideri (bankadan doğrudan ödeme).
    String vehicle = vehicle(w, "06SW06");
    Map<String, Object> expense = new HashMap<>();
    expense.put("kind", "REPAIR");
    expense.put("date", TODAY.toString());
    expense.put("branchId", w.a1());
    expense.put("fundAccountId", bankA);
    expense.put("money", Map.of("amount", "40", "currency", "TRY"));
    sendJson(w.t(), null, post("/api/v1/fleet/vehicles/" + vehicle + "/expenses"), expense)
        .andExpect(status().isCreated());
    // Plan ödemesi (banka).
    payPlan(w, manualPlan(w, supplier, w.a1(), "60"), bankA, "BANK");
    // Şirketler arası virman (EFT).
    Map<String, Object> virman = new HashMap<>();
    virman.put("transferType", "EFT");
    virman.put("reasonType", "DEBT_PAID");
    virman.put("fromFundId", bankA);
    virman.put("toFundId", bankB);
    virman.put("money", Map.of("amount", "15", "currency", "TRY"));
    virman.put("date", TODAY.toString());
    sendJson(w.t(), null, post(FINANCE + "/intercompany-transfers"), virman)
        .andExpect(status().isCreated());

    assertThat(count(w, "select count(*) from %s.settlement where method = 'BANK'")).isEqualTo(5);
    assertThat(
            count(
                w,
                "select count(*) from %s.settlement where method = 'BANK'"
                    + " and channel is distinct from 'TRANSFER'"))
        .isZero();
    assertThat(
            count(
                w,
                "select count(*) from %s.settlement where document_no is not null"
                    + " or counterparty_bank_account_id is not null"
                    + " or corrects_settlement_id is not null"))
        .isZero();
  }

  @Test
  void onizlemeCekBilgisizVeDuzeltmeOnizlemesi() throws Exception {
    World w = world("sw7");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    manual(w, supplier, w.a1(), Direction.CREDIT, "100", "TRY");

    // F-12.2-R4: çekli önizlemede çek bilgisi zorunlu değil (kayıtta zorunlu).
    Map<String, Object> checkOnly = body("CHECK", supplier, w.a1(), null, "100");
    check(w, null, "PAYMENT", null, checkOnly).andExpect(status().isOk());
    expect(pay(w, null, checkOnly, null), 400, "INSTRUMENT_REQUIRED");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    check(w, null, "COLLECTION", null, body("CHECK", customer, w.a1(), null, "5"))
        .andExpect(status().isOk());

    Map<String, Object> paid = body("CASH", supplier, w.a1(), w.fundA1(), "100");
    paid.remove("confirmWarnings");
    String payment = id(pay(w, null, paid, null));
    // Borç 0 iken aynı tutara düzeltme önizlemesi uyarı vermez; düzeltmesiz önizleme verir.
    Map<String, Object> same =
        body("BANK", supplier, w.a1(), bankFund(w, "B", w.a1(), "TRY"), "100");
    assertThat(body(check(w, null, "PAYMENT", payment, same)).get("warnings")).isEmpty();
    assertThat(body(check(w, null, "PAYMENT", null, same)).get("warnings")).hasSize(1);
    // Fazlası uyarı verir: borç 100 (eski ödeme düşülmüş), ödeme 130.
    Map<String, Object> more = body("CASH", supplier, w.a1(), w.fundA1(), "130");
    JsonNode warning = body(check(w, null, "PAYMENT", payment, more)).get("warnings").get(0);
    assertThat(warning.get("companyOutstanding").decimalValue()).isEqualByComparingTo("100");
    assertThat(warning.get("excess").decimalValue()).isEqualByComparingTo("30");

    // Yanlış tür ve bilinmeyen kayıt.
    expect(
        check(w, null, "COLLECTION", payment, body("CASH", customer, w.a1(), w.fundA1(), "1")),
        422,
        "CORRECTION_TARGET_INVALID");
    expect(check(w, null, "PAYMENT", UUID.randomUUID(), more), 404, "SETTLEMENT_NOT_FOUND");
    // İptal edilmiş kayıt düzeltilemez.
    reverse(w, null, payment, TODAY, null).andExpect(status().isOk());
    expect(check(w, null, "PAYMENT", payment, more), 422, "CORRECTION_TARGET_INVALID");
  }

  @Test
  void idempotentTekrarEslestirmeyiYenidenYazmaz() throws Exception {
    World w = world("sw8");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    UUID invoice = purchaseInvoice(w, supplier, w.a1(), "300");
    Map<String, Object> request =
        withAllocations(
            body("CASH", supplier, w.a1(), w.fundA1(), "100"),
            List.of(allocation("PURCHASE_INVOICE", invoice, "100")));
    String first = id(pay(w, null, request, "IDEM-1"));
    String again = id(pay(w, null, request, "IDEM-1"));
    assertThat(again).isEqualTo(first);
    assertThat(count(w, "select count(*) from %s.settlement_allocation")).isEqualTo(1);
    assertThat(
            row(
                w,
                "select settlement_id::text as s, purchase_invoice_id as p, amount, currency,"
                    + " target_type from %s.settlement_allocation"))
        .containsEntry("s", first)
        .containsEntry("p", invoice)
        .containsEntry("currency", "TRY")
        .containsEntry("target_type", "PURCHASE_INVOICE");
    assertThat(count(w, "select count(*) from %s.settlement")).isEqualTo(1);
  }

  @Test
  void tekrarAnahtariPersonelVeTurDenetimindenGecer() throws Exception {
    World w = world("sw9");
    String finance = userWithRole(w, "finans", "FINANCE");
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    UUID customer = account(w, AccountType.CUSTOMER, null);

    // SEC-12.2a-R2: personel carili kaydın anahtarı izinsiz kullanıcıya 404, kayıt sızmaz.
    String employeePayment =
        id(pay(w, null, body("CASH", employee, w.a1(), w.fundA1(), "70"), "PERS-ODEME"));
    var leakedPayment =
        pay(w, finance, body("CASH", supplier, w.a1(), w.fundA1(), "70"), "PERS-ODEME");
    expect(leakedPayment, 404, "SETTLEMENT_NOT_FOUND");
    assertThat(leakedPayment.andReturn().getResponse().getContentAsString())
        .doesNotContain(employeePayment);
    var leakedCollection =
        collect(w, finance, body("CASH", customer, w.a1(), w.fundA1(), "70"), "PERS-ODEME");
    expect(leakedCollection, 404, "SETTLEMENT_NOT_FOUND");
    assertThat(leakedCollection.andReturn().getResponse().getContentAsString())
        .doesNotContain(employeePayment);
    // Yetkili kullanıcı aynı uçta aynı kaydı alır.
    assertThat(id(pay(w, null, body("CASH", employee, w.a1(), w.fundA1(), "70"), "PERS-ODEME")))
        .isEqualTo(employeePayment);

    // Başka türün anahtarı 422.
    String payment = id(pay(w, null, body("CASH", supplier, w.a1(), w.fundA1(), "30"), "ODEME-K"));
    expect(
        collect(w, null, body("CASH", customer, w.a1(), w.fundA1(), "30"), "ODEME-K"),
        422,
        "IDEMPOTENCY_KEY_REUSED");
    // Düzeltme kaydının anahtarı ödeme ucunda 422.
    correct(w, null, payment, null, body("CASH", supplier, w.a1(), w.fundA1(), "31"), "DUZ-K")
        .andExpect(status().isCreated());
    expect(
        pay(w, null, body("CASH", supplier, w.a1(), w.fundA1(), "31"), "DUZ-K"),
        422,
        "IDEMPOTENCY_KEY_REUSED");
    // Hiçbiri kayıt yazmadı: personel ödemesi, ödeme ve düzeltmesi.
    assertThat(count(w, "select count(*) from %s.settlement")).isEqualTo(3);
  }

  // --- yardımcılar

  private static Map<String, Object> instrument(
      String kind, String number, String fund, String initialStatus) {
    Map<String, Object> data = new HashMap<>();
    data.put("kind", kind);
    data.put("number", number);
    data.put("bankName", "Test Bankası");
    data.put("dueDate", TODAY.plusDays(30).toString());
    if (fund != null) {
      data.put("fundAccountId", fund);
    }
    if (initialStatus != null) {
      data.put("initialStatus", initialStatus);
    }
    return data;
  }
}
