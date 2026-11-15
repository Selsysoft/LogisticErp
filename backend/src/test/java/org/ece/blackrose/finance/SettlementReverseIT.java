package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.junit.jupiter.api.Test;

/**
 * Kullanıcı iptali (ZTO "Sil"; 12.2a §3.5, §6.2 {@code SettlementReverseIT}): gerekçe ve iptal
 * tarihi saklanır, tarih kuralı, araç giderine bağlı ödeme, Cari Hareketler "sil" varsayılan
 * tarihi, personel carisi (404 {@code SETTLEMENT_NOT_FOUND}) ve cari taşıma (409 {@code
 * TRANSACTION_TRANSFERRED}).
 */
class SettlementReverseIT extends SettlementTestSupport {

  @Test
  void gerekceVeTarihSaklanirDenetimYazilir() throws Exception {
    World w = world("sr1");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    Map<String, Object> request = body("CASH", supplier, w.a1(), w.fundA1(), "100");
    request.put("date", TODAY.minusDays(2).toString());
    String payment = id(pay(w, null, request, null));

    JsonNode reversed =
        body(
            reverse(w, null, payment, TODAY.minusDays(1), "  Yanlış giriş  ")
                .andExpect(status().isOk()));
    assertThat(reversed.get("status").asText()).isEqualTo("REVERSED");
    assertThat(reversed.get("reverseReason").asText()).isEqualTo("Yanlış giriş");
    assertThat(reversed.get("reversedOn").asText()).isEqualTo(TODAY.minusDays(1).toString());
    assertThat(
            row(
                w,
                "select reverse_reason, reversed_on, status from %s.settlement where id = ?::uuid",
                payment))
        .containsEntry("reverse_reason", "Yanlış giriş")
        .containsEntry("reversed_on", java.sql.Date.valueOf(TODAY.minusDays(1)))
        .containsEntry("status", "REVERSED");
    // Ters satırlar iptal tarihinde ve gerekçe açıklamasıyla; bakiyeler sıfır.
    assertThat(
            count(
                w,
                "select count(*) from %s.account_transaction where source_type = 'REVERSAL'"
                    + " and transaction_date = ? and description = 'Yanlış giriş'",
                TODAY.minusDays(1)))
        .isEqualTo(1);
    assertThat(
            count(
                w,
                "select count(*) from %s.fund_transaction where source_type = 'REVERSAL'"
                    + " and transaction_date = ?",
                TODAY.minusDays(1)))
        .isEqualTo(1);
    assertThat(accountNet(w, supplier)).isEqualByComparingTo("0");
    assertThat(fundNet(w, w.fundA1())).isEqualByComparingTo("0");
    assertThat(audits(w, "SETTLEMENT_REVERSED", "SETTLEMENT:" + payment)).isEqualTo(1);
    assertThat(row(w, "select details from %s.audit_log where event_type = 'SETTLEMENT_REVERSED'"))
        .containsEntry("details", "date=" + TODAY.minusDays(1));

    // İkinci iptal aynı kaydı döner; yeni ters satır ve denetim yok.
    reverse(w, null, payment, TODAY, "tekrar")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.reverseReason").value("Yanlış giriş"));
    assertThat(audits(w, "SETTLEMENT_REVERSED", "SETTLEMENT:" + payment)).isEqualTo(1);
    assertThat(count(w, "select count(*) from %s.account_transaction")).isEqualTo(2);

    // Gerekçesiz iptal: gerekçe boş, ters satır varsayılan açıklamayla.
    UUID customer = account(w, AccountType.CUSTOMER, null);
    String collection =
        id(collect(w, null, body("CASH", customer, w.a1(), w.fundA1(), "40"), null));
    JsonNode plain = body(reverse(w, null, collection, TODAY, null).andExpect(status().isOk()));
    assertThat(plain.get("reverseReason").isNull()).isTrue();
    assertThat(
            count(
                w,
                "select count(*) from %s.account_transaction where source_type = 'REVERSAL'"
                    + " and description = 'Tahsilat iptali'"))
        .isEqualTo(1);
  }

  @Test
  void iptalTarihiKaydinTarihiIleBugunArasinda() throws Exception {
    World w = world("sr2");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    String today = id(pay(w, null, body("CASH", supplier, w.a1(), w.fundA1(), "10"), null));
    expect(reverse(w, null, today, TODAY.minusDays(1), null), 400, "REVERSE_BEFORE_SETTLEMENT");
    expect(reverse(w, null, today, TODAY.plusDays(1), null), 400, "DATE_IN_FUTURE");
    assertThat(count(w, "select count(*) from %s.settlement where status = 'REVERSED'")).isZero();

    // İleri tarihli kayıt: yalnız kendi tarihiyle iptal edilir (max(bugün, kayıt tarihi)).
    Map<String, Object> future = body("CASH", supplier, w.a1(), w.fundA1(), "20");
    future.put("date", TODAY.plusDays(5).toString());
    String ahead = id(pay(w, null, future, null));
    expect(reverse(w, null, ahead, TODAY, null), 400, "REVERSE_BEFORE_SETTLEMENT");
    expect(reverse(w, null, ahead, TODAY.plusDays(6), null), 400, "DATE_IN_FUTURE");
    reverse(w, null, ahead, TODAY.plusDays(5), null)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.reversedOn").value(TODAY.plusDays(5).toString()));

    // Sınırlar dahil: bugün tarihli kayıt bugün iptal edilir.
    reverse(w, null, today, TODAY, null).andExpect(status().isOk());
  }

  @Test
  void aracGiderineBagliOdemeYalnizGiderEkranindanIptalEdilir() throws Exception {
    World w = world("sr3");
    String expense = vehicleExpense(w, vehicle(w, "06SR03"), w.a1(), w.fundA1(), "45");
    UUID settlement = settlementOfExpense(w, expense);
    assertThat(settlement).isNotNull();

    reverse(w, null, settlement, TODAY, null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("SETTLEMENT_SOURCE_MANAGED"))
        .andExpect(jsonPath("$.details[0]").value("route=/fleet/vehicles"));
    assertThat(fundNet(w, w.fundA1())).isEqualByComparingTo("-45");

    // Araç gideri yolu (reverseManaged) iptal eder ve gideri siler.
    sendJson(
            w.t(),
            null,
            post("/api/v1/fleet/expenses/" + expense + "/reverse"),
            Map.of("date", TODAY.toString()))
        .andExpect(status().isNoContent());
    assertThat(row(w, "select status, reversed_on from %s.settlement where id = ?", settlement))
        .containsEntry("status", "REVERSED")
        .containsEntry("reversed_on", java.sql.Date.valueOf(TODAY));
    assertThat(count(w, "select count(*) from %s.vehicle_expense where deleted = true"))
        .isEqualTo(1);
    assertThat(fundNet(w, w.fundA1())).isEqualByComparingTo("0");
    // Kullanıcı iptali olmadığından denetim kaydı yazılmaz.
    assertThat(audits(w, "SETTLEMENT_REVERSED", "SETTLEMENT:" + settlement)).isZero();
  }

  @Test
  void cariHareketSilmeTarihsizIleriTarihliKaydiIptalEder() throws Exception {
    World w = world("sr4");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    Map<String, Object> future = body("CASH", supplier, w.a1(), w.fundA1(), "30");
    future.put("date", TODAY.plusDays(3).toString());
    String payment = id(pay(w, null, future, null));

    sendJson(
            w.t(),
            null,
            post(FINANCE + "/accounts/transactions/" + ledgerLine(w, payment) + "/void"),
            Map.of())
        .andExpect(status().isOk());
    assertThat(row(w, "select status, reversed_on from %s.settlement where id = ?::uuid", payment))
        .containsEntry("status", "REVERSED")
        .containsEntry("reversed_on", java.sql.Date.valueOf(TODAY.plusDays(3)));
    assertThat(accountNet(w, supplier)).isEqualByComparingTo("0");

    // Bugün tarihli kayıtta varsayılan bugündür.
    String current = id(pay(w, null, body("CASH", supplier, w.a1(), w.fundA1(), "5"), null));
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/accounts/transactions/" + ledgerLine(w, current) + "/void"),
            Map.of())
        .andExpect(status().isOk());
    assertThat(row(w, "select reversed_on from %s.settlement where id = ?::uuid", current))
        .containsEntry("reversed_on", java.sql.Date.valueOf(TODAY));
  }

  @Test
  void personelCarisiIzinsizKullaniciyaKayitYok() throws Exception {
    World w = world("sr5");
    String finance = userWithRole(w, "finans", "FINANCE");
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    String payment = id(pay(w, null, body("CASH", employee, w.a1(), w.fundA1(), "70"), null));

    expect(reverse(w, finance, payment, TODAY, null), 404, "SETTLEMENT_NOT_FOUND");
    expect(reverse(w, finance, UUID.randomUUID(), TODAY, null), 404, "SETTLEMENT_NOT_FOUND");
    assertThat(row(w, "select status from %s.settlement where id = ?::uuid", payment))
        .containsEntry("status", "POSTED");

    // İzinli kullanıcı (patron) iptal eder; izinsiz kullanıcı normal cariyi iptal eder.
    reverse(w, null, payment, TODAY, null).andExpect(status().isOk());
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    String other = id(pay(w, null, body("CASH", supplier, w.a1(), w.fundA1(), "5"), null));
    reverse(w, finance, other, TODAY, null).andExpect(status().isOk());
  }

  @Test
  void tasinmisKayitTasimaGeriAlinmadanIptalEdilmez() throws Exception {
    World w = world("sr6");
    UUID from = account(w, AccountType.SUPPLIER, null);
    UUID to = account(w, AccountType.SUPPLIER, null);
    String payment = id(pay(w, null, body("CASH", from, w.a1(), w.fundA1(), "60"), null));
    String transfer = transferLine(w, from, to, ledgerLine(w, payment));

    expect(reverse(w, null, payment, TODAY, null), 409, "TRANSACTION_TRANSFERRED");
    assertThat(row(w, "select status from %s.settlement where id = ?::uuid", payment))
        .containsEntry("status", "POSTED");
    assertThat(fundNet(w, w.fundA1())).isEqualByComparingTo("-60");

    undoTransfer(w, transfer);
    reverse(w, null, payment, TODAY, null).andExpect(status().isOk());
    assertThat(fundNet(w, w.fundA1())).isEqualByComparingTo("0");
    assertThat(accountNet(w, from)).isEqualByComparingTo("0");
    assertThat(accountNet(w, to)).isEqualByComparingTo("0");
  }
}
