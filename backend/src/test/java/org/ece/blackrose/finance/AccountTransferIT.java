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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Cari taşıma (12.1 §3.11, §4.7; 04 §6.1-K3). */
class AccountTransferIT extends AccountTestSupport {

  // --- kayıt, taşınmış hareket koruması, geri alma

  @Test
  void virmanCiftiYazilirKorumaCalisirVeGeriAlinir() throws Exception {
    World w = world("trf");
    UUID from = account(w, AccountType.SUPPLIER, null);
    UUID to = account(w, AccountType.SUPPLIER, null);

    String invoice = purchaseInvoice(w, from, w.a1(), "AF-1", "100", "20");
    cancelPlansOf(w, invoice);
    UUID invoiceTx = tx(w, "PURCHASE_INVOICE", invoice);
    String payment = payCash(w, from, w.a1(), "50");
    UUID paymentTx = tx(w, "SETTLEMENT", payment);
    UUID manualTx = manual(w, from, w.a2(), Direction.DEBIT, "30", "TRY");
    String document = document(w, from, "CEZA_BIZE", "10", w.b1());
    UUID documentTx = tx(w, "ACCOUNT_DOCUMENT", document);
    // Elle hareket A2'de; belge B şirketinde: satırlar kendi iş yeri/şirketini korur.
    BigDecimal tlBefore = tlTotal(w);
    assertThat(balance(w, from)).isEqualByComparingTo("-50");

    JsonNode listed = transferable(w, null, from);
    assertThat(listed).hasSize(4);
    assertThat(blocked(listed)).isZero();

    LocalDate date = TODAY.minusDays(1);
    JsonNode created =
        body(
            transfer(
                    w,
                    null,
                    from,
                    to,
                    List.of(invoiceTx, paymentTx, manualTx, documentTx),
                    null,
                    Map.of("date", date.toString(), "description", "Birleşme"))
                .andExpect(status().isCreated()));
    String transferId = created.get("id").asText();
    assertThat(created.get("status").asText()).isEqualTo("POSTED");
    assertThat(created.get("lines")).hasSize(4);
    assertThat(created.get("transferDate").asText()).isEqualTo(date.toString());

    // Virman çifti: kaynakta ters yön, hedefte aynı yön; kur, TL, iş yeri, şirket orijinalden.
    for (JsonNode line : created.get("lines")) {
      String lineId = line.get("id").asText();
      Map<String, Object> original =
          row(
              w,
              "select * from \"%s\".account_transaction where id = ?",
              line.get("transactionId"));
      Map<String, Object> out =
          row(
              w,
              "select * from \"%s\".account_transaction where source_type = 'ACCOUNT_TRANSFER_OUT'"
                  + " and source_id = ?",
              lineId);
      Map<String, Object> in =
          row(
              w,
              "select * from \"%s\".account_transaction where source_type = 'ACCOUNT_TRANSFER_IN'"
                  + " and source_id = ?",
              lineId);
      assertThat(out.get("account_id")).isEqualTo(from);
      assertThat(in.get("account_id")).isEqualTo(to);
      assertThat(out.get("direction")).isNotEqualTo(original.get("direction"));
      assertThat(in.get("direction")).isEqualTo(original.get("direction"));
      for (String column : List.of("branch_id", "company_id", "currency", "rate_date")) {
        assertThat(out.get(column)).isEqualTo(original.get(column));
        assertThat(in.get(column)).isEqualTo(original.get(column));
      }
      for (String column : List.of("amount", "exchange_rate", "tl_amount")) {
        assertThat((BigDecimal) in.get(column))
            .isEqualByComparingTo((BigDecimal) original.get(column));
        assertThat((BigDecimal) out.get(column))
            .isEqualByComparingTo((BigDecimal) original.get(column));
      }
      assertThat(in.get("transaction_date").toString()).isEqualTo(date.toString());
      assertThat((String) in.get("description")).startsWith("Cari taşıma: ").endsWith("Birleşme");
      assertThat(original.get("account_id")).isEqualTo(from);
    }
    assertThat(balance(w, from)).isEqualByComparingTo("0");
    assertThat(balance(w, to)).isEqualByComparingTo("-50");
    assertThat(tlTotal(w).subtract(tlBefore)).isEqualByComparingTo("0");
    assertThat(transferable(w, null, from)).isEmpty();

    // Hareket detayı: orijinal MOVED, virman satırı OUT/IN.
    send(w.t(), null, get(FINANCE + "/accounts/transactions/" + invoiceTx))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.transfer.role").value("MOVED"))
        .andExpect(jsonPath("$.transfer.transferId").value(transferId))
        .andExpect(jsonPath("$.row.transferredOut").value(true));
    send(w.t(), null, get(FINANCE + "/accounts/transactions/" + mirrorOf(w, "IN", invoiceTx)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.transfer.role").value("IN"))
        .andExpect(jsonPath("$.row.transferRole").value("IN"));
    // Taşıma satırı ZTO "Sil" ile silinemez.
    expect(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/accounts/transactions/" + mirrorOf(w, "OUT", invoiceTx) + "/void"),
            Map.of()),
        409,
        "TRANSACTION_IS_TRANSFER");

    // Taşınmış hareketin kaynağı iptal edilemez (tek nokta: LedgerService.reverse).
    Map<String, Object> reverse = Map.of("date", TODAY.toString(), "description", "iptal");
    expect(
        sendJson(w.t(), null, post(FINANCE + "/purchase-invoices/" + invoice + "/cancel"), reverse),
        409,
        "TRANSACTION_TRANSFERRED");
    expect(
        sendJson(w.t(), null, post(FINANCE + "/settlements/" + payment + "/reverse"), reverse),
        409,
        "TRANSACTION_TRANSFERRED");
    expect(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/accounts/transactions/" + manualTx + "/reverse"),
            reverse),
        409,
        "TRANSACTION_TRANSFERRED");
    expect(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/account-documents/" + document + "/cancel"),
            Map.of("reason", "x")),
        409,
        "TRANSACTION_TRANSFERRED");
    expect(
        sendJson(
            w.t(), null, post(FINANCE + "/accounts/transactions/" + paymentTx + "/void"), Map.of()),
        409,
        "TRANSACTION_TRANSFERRED");
    assertThat(balance(w, from)).isEqualByComparingTo("0");

    // Zaten taşınmış hareket yeniden taşınamaz.
    expect(
        transfer(w, null, from, to, List.of(invoiceTx), null, Map.of()),
        409,
        "TRANSACTION_NOT_TRANSFERABLE");

    // Geri al: dört satır için sekiz ters kayıt, satırlar pasif, bakiyeler eski hâlinde.
    JsonNode reversed =
        body(
            sendJson(
                    w.t(),
                    null,
                    post(FINANCE + "/account-transfers/" + transferId + "/reverse"),
                    Map.of("description", "Yanlış cari"))
                .andExpect(status().isOk()));
    assertThat(reversed.get("status").asText()).isEqualTo("REVERSED");
    assertThat(reversed.get("reverseDate").asText()).isEqualTo(TODAY.toString());
    assertThat(reversed.findValuesAsText("active")).containsOnly("false");
    assertThat(
            count(
                w,
                "select count(*) from \"%s\".account_transaction r join \"%s\".account_transaction x"
                    + " on x.id = r.source_id where r.source_type = 'REVERSAL'"
                    + " and x.source_type in ('ACCOUNT_TRANSFER_OUT', 'ACCOUNT_TRANSFER_IN')"))
        .isEqualTo(8);
    assertThat(balance(w, from)).isEqualByComparingTo("-50");
    assertThat(balance(w, to)).isEqualByComparingTo("0");
    expect(
        sendJson(
            w.t(), null, post(FINANCE + "/account-transfers/" + transferId + "/reverse"), Map.of()),
        409,
        "TRANSFER_ALREADY_REVERSED");
    assertThat(transferable(w, null, from)).hasSize(4);

    // Geri alınınca aynı iptaller çalışır.
    sendJson(w.t(), null, post(FINANCE + "/purchase-invoices/" + invoice + "/cancel"), reverse)
        .andExpect(status().isOk());
    sendJson(w.t(), null, post(FINANCE + "/settlements/" + payment + "/reverse"), reverse)
        .andExpect(status().isOk());
    sendJson(
            w.t(), null, post(FINANCE + "/accounts/transactions/" + manualTx + "/reverse"), reverse)
        .andExpect(status().isOk());
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/account-documents/" + document + "/cancel"),
            Map.of("reason", "x"))
        .andExpect(status().isOk());
    assertThat(balance(w, from)).isEqualByComparingTo("0");

    // Ters kayıt, taşıma satırı ve ters çevrilmiş hareket taşınamaz.
    UUID reversal = tx(w, "REVERSAL", manualTx.toString());
    UUID out = mirrorOf(w, "OUT", invoiceTx);
    for (UUID blocked : List.of(reversal, out, manualTx)) {
      expect(
          transfer(w, null, from, to, List.of(blocked), null, Map.of()),
          409,
          "TRANSACTION_NOT_TRANSFERABLE");
    }

    // Geçmiş: varsayılan son 6 ay; accountId kaynak ya da hedef.
    JsonNode history =
        body(
            send(w.t(), null, get(FINANCE + "/account-transfers").param("accountId", to.toString()))
                .andExpect(status().isOk()));
    assertThat(history.get("totalElements").asInt()).isEqualTo(4);
    JsonNode first = history.get("content").get(0);
    assertThat(first.get("transferId").asText()).isEqualTo(transferId);
    assertThat(first.get("status").asText()).isEqualTo("REVERSED");
    assertThat(first.get("fromAccountId").asText()).isEqualTo(from.toString());
    assertThat(history.get("content").findValuesAsText("kind"))
        .containsExactlyInAnyOrder("DEBT", "PAYMENT", "RECEIVABLE", "DEBT");
  }

  // --- çek/senet

  @Test
  void bagliCekSenetlerDurumdanBagimsizTasinirVeGeriDoner() throws Exception {
    World w = world("trc");
    String bank = bankFund(w, w.a1());
    UUID c1 = account(w, AccountType.CUSTOMER, null);
    UUID c2 = account(w, AccountType.CUSTOMER, null);

    // Çekle tahsilat → bankaya → karşılıksız: çeke bağlı iki satır.
    JsonNode collection = collectCheck(w, c1, "C-1", "300");
    String check = collection.get("instrumentId").asText();
    UUID collectionTx = tx(w, "SETTLEMENT", collection.get("id").asText());
    transition(w, check, "AT_BANK", bank);
    transition(w, check, "BOUNCED", null);
    UUID bounceTx = only(w, c1, "INSTRUMENT");

    JsonNode listed = transferable(w, null, c1);
    assertThat(listed).hasSize(2);
    for (JsonNode row : listed) {
      assertThat(row.get("instrumentGroup").asText()).isEqualTo(check);
      assertThat(row.get("instruments").get(0).get("role").asText()).isEqualTo("DRAWER");
      assertThat(row.get("instruments").get(0).get("status").asText()).isEqualTo("BOUNCED");
    }

    // Satırlardan yalnız biri seçilince 409; ikisi birlikte 201.
    transfer(w, null, c1, c2, List.of(collectionTx), null, Map.of())
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INSTRUMENT_LINES_INCOMPLETE"))
        .andExpect(jsonPath("$.details[0]").value("instrumentId=" + check))
        .andExpect(jsonPath("$.details[1]").value("missingTransactionIds=" + bounceTx));
    JsonNode created =
        body(
            transfer(w, null, c1, c2, List.of(collectionTx, bounceTx), null, Map.of())
                .andExpect(status().isCreated()));
    assertThat(created.get("checkCount").asInt()).isEqualTo(1);
    assertThat(created.get("noteCount").asInt()).isZero();
    assertThat(created.get("instruments").get(0).get("movedDrawer").asBoolean()).isTrue();
    assertThat(created.get("instruments").get(0).get("movedEndorsee").asBoolean()).isFalse();
    assertThat(instrumentAccount(w, check, "account_id")).isEqualTo(c2);
    assertThat(instrumentStatus(w, check)).isEqualTo("BOUNCED");
    JsonNode movements =
        body(
            send(w.t(), null, get(FINANCE + "/instruments/" + check + "/movements"))
                .andExpect(status().isOk()));
    JsonNode moved = movements.get(movements.size() - 1);
    assertThat(moved.get("movementType").asText()).isEqualTo("TRANSFERRED");
    assertThat(moved.get("fromStatus").asText()).isEqualTo("BOUNCED");
    assertThat(moved.get("toStatus").asText()).isEqualTo("BOUNCED");
    assertThat(moved.get("fromAccountId").asText()).isEqualTo(c1.toString());
    assertThat(moved.get("toAccountId").asText()).isEqualTo(c2.toString());
    assertThat(moved.get("accountTransferId").asText()).isEqualTo(created.get("id").asText());
    assertThat(movements.get(0).get("movementType").asText()).isEqualTo("STATUS");

    // Geri al: çek eski cariye döner, ikinci TRANSFERRED hareketi (to → from).
    JsonNode reversed =
        body(
            sendJson(
                    w.t(),
                    null,
                    post(FINANCE + "/account-transfers/" + created.get("id").asText() + "/reverse"),
                    Map.of())
                .andExpect(status().isOk()));
    assertThat(reversed.get("instruments").get(0).get("reverted").asBoolean()).isTrue();
    assertThat(instrumentAccount(w, check, "account_id")).isEqualTo(c1);
    JsonNode after = body(send(w.t(), null, get(FINANCE + "/instruments/" + check + "/movements")));
    JsonNode back = after.get(after.size() - 1);
    assertThat(back.get("movementType").asText()).isEqualTo("TRANSFERRED");
    assertThat(back.get("fromAccountId").asText()).isEqualTo(c2.toString());
    assertThat(back.get("toAccountId").asText()).isEqualTo(c1.toString());

    // Cirolu çekle ödeme: lehtar (endorsed_account_id) hedefe geçer.
    UUID s1 = account(w, AccountType.SUPPLIER, null);
    UUID s2 = account(w, AccountType.SUPPLIER, null);
    UUID c3 = account(w, AccountType.CUSTOMER, null);
    String endorsed = collectCheck(w, c3, "C-2", "200").get("instrumentId").asText();
    Map<String, Object> pay = settlement("CHECK", s1, w.a1(), null, "200");
    pay.put("instrumentId", endorsed);
    String payment = id(sendJson(w.t(), null, post(FINANCE + "/payments"), pay));
    JsonNode supplierRows = transferable(w, null, s1);
    assertThat(supplierRows.get(0).get("instruments").get(0).get("role").asText())
        .isEqualTo("ENDORSEE");
    transfer(w, null, s1, s2, List.of(tx(w, "SETTLEMENT", payment)), null, Map.of())
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.instruments[0].movedEndorsee").value(true))
        .andExpect(jsonPath("$.instruments[0].movedDrawer").value(false));
    assertThat(instrumentAccount(w, endorsed, "endorsed_account_id")).isEqualTo(s2);
    assertThat(instrumentAccount(w, endorsed, "account_id")).isEqualTo(c3);

    // Çek başka cariye geçmişse taşınmaz, yanıtta skippedInstruments.
    UUID c4 = account(w, AccountType.CUSTOMER, null);
    JsonNode third = collectCheck(w, c4, "C-3", "80");
    jdbc.update(
        "update \"%s\".instrument set account_id = ? where id = ?".formatted(w.schema()),
        c3,
        UUID.fromString(third.get("instrumentId").asText()));
    JsonNode skipped =
        body(
            transfer(
                    w,
                    null,
                    c4,
                    c2,
                    List.of(tx(w, "SETTLEMENT", third.get("id").asText())),
                    null,
                    Map.of())
                .andExpect(status().isCreated()));
    assertThat(skipped.get("skippedInstruments").get(0).asText()).isEqualTo("C-3");
    assertThat(skipped.get("instruments")).isEmpty();
  }

  @Test
  void tasimadanSonraIslemGorenCekGeriAlmayiEngeller() throws Exception {
    World w = world("trm");
    String bank = bankFund(w, w.a1());
    UUID c1 = account(w, AccountType.CUSTOMER, null);
    UUID c2 = account(w, AccountType.CUSTOMER, null);
    JsonNode collection = collectCheck(w, c1, "C-9", "150");
    String check = collection.get("instrumentId").asText();
    String transferId =
        id(
            transfer(
                w,
                null,
                c1,
                c2,
                List.of(tx(w, "SETTLEMENT", collection.get("id").asText())),
                null,
                Map.of()));
    transition(w, check, "AT_BANK", bank);
    transition(w, check, "BOUNCED", null);
    long ledgerRows = count(w, "select count(*) from \"%s\".account_transaction");

    send(
            w.t(),
            null,
            post(FINANCE + "/account-transfers/" + transferId + "/reverse")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("TRANSFER_INSTRUMENT_MOVED"))
        .andExpect(jsonPath("$.details[0]").value("instrumentIds=" + check));
    assertThat(count(w, "select count(*) from \"%s\".account_transaction")).isEqualTo(ledgerRows);
    assertThat(instrumentAccount(w, check, "account_id")).isEqualTo(c2);
    send(w.t(), null, get(FINANCE + "/account-transfers/" + transferId))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("POSTED"))
        .andExpect(jsonPath("$.lines[0].active").value(true));
  }

  // --- açık ödeme planı

  @Test
  void acikPlanliHareketTasinmazOdenenTasinir() throws Exception {
    World w = world("trp");
    allowSelfApproval(w);
    UUID from = account(w, AccountType.SUPPLIER, null);
    UUID to = account(w, AccountType.SUPPLIER, null);
    String invoice = purchaseInvoice(w, from, w.a1(), "AF-P", "100", "20");
    UUID invoiceTx = tx(w, "PURCHASE_INVOICE", invoice);

    JsonNode listed = transferable(w, null, from);
    assertThat(listed.get(0).get("blockedReason").asText()).isEqualTo("OPEN_PLAN");
    transfer(w, null, from, to, List.of(invoiceTx), null, Map.of())
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("TRANSACTION_HAS_OPEN_PLAN"))
        .andExpect(jsonPath("$.details[0]").value("transactionId=" + invoiceTx));

    // Plan ödenir: ödeme kaynak caride, fatura artık taşınabilir.
    String plan = planOf(w, invoice);
    sendJson(w.t(), null, post(FINANCE + "/payment-plans/" + plan + "/submit"), Map.of())
        .andExpect(status().isOk());
    sendJson(w.t(), null, post(FINANCE + "/payment-plans/" + plan + "/approve"), Map.of())
        .andExpect(status().isOk());
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/payment-plans/" + plan + "/pay"),
            Map.of("method", "CASH", "fundAccountId", w.fundA1(), "date", TODAY.toString()))
        .andExpect(status().isOk());
    assertThat(balance(w, from)).isEqualByComparingTo("0");
    assertThat(blocked(transferable(w, null, from))).isZero();
    transfer(w, null, from, to, List.of(invoiceTx), null, Map.of()).andExpect(status().isCreated());
    // Borç hedefe geçti; kaynakta ödeme (plan kaynak caride ödendi) kalır.
    assertThat(balance(w, to)).isEqualByComparingTo("-120");
    assertThat(balance(w, from)).isEqualByComparingTo("120");

    // TRIP_COST: plan kaynağa bağlı değil; aynı cari/iş yeri/tutar/açıklama planı engeller.
    UUID trip = manual(w, from, w.a1(), Direction.CREDIT, "75", "TRY");
    jdbc.update(
        ("update \"%s\".account_transaction set source_type = 'TRIP_COST', source_id = ?"
                + " where id = ?")
            .formatted(w.schema()),
        UUID.randomUUID(),
        trip);
    Map<String, Object> manualPlan = new HashMap<>();
    manualPlan.put("accountId", from.toString());
    manualPlan.put("branchId", w.a1());
    manualPlan.put("money", Map.of("amount", "75", "currency", "TRY"));
    manualPlan.put("dueDate", TODAY.plusDays(30).toString());
    manualPlan.put("description", "Test CREDIT");
    id(sendJson(w.t(), null, post(FINANCE + "/payment-plans"), manualPlan));
    expect(
        transfer(w, null, from, to, List.of(trip), null, Map.of()),
        409,
        "TRANSACTION_HAS_OPEN_PLAN");
  }

  @Test
  void reddedilenPlanAcikSayilirIptalEdilinceTasinir() throws Exception {
    World w = world("trj");
    allowSelfApproval(w);
    UUID from = account(w, AccountType.SUPPLIER, null);
    UUID to = account(w, AccountType.SUPPLIER, null);
    String invoice = purchaseInvoice(w, from, w.a1(), "AF-R", "100", "20");
    UUID invoiceTx = tx(w, "PURCHASE_INVOICE", invoice);
    String plan = planOf(w, invoice);
    sendJson(w.t(), null, post(FINANCE + "/payment-plans/" + plan + "/submit"), Map.of())
        .andExpect(status().isOk());
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/payment-plans/" + plan + "/reject"),
            Map.of("note", "Tutar hatalı"))
        .andExpect(status().isOk());

    // F2: REJECTED plan yeniden onaya gönderilip kaynak cariden ödenebilir; açık sayılır.
    JsonNode listed = transferable(w, null, from);
    assertThat(listed.get(0).get("blockedReason").asText()).isEqualTo("OPEN_PLAN");
    transfer(w, null, from, to, List.of(invoiceTx), null, Map.of())
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("TRANSACTION_HAS_OPEN_PLAN"));
    assertThat(count(w, "select count(*) from \"%s\".account_transfer_line")).isZero();

    // Plan iptal edilince hareket taşınır.
    cancelPlansOf(w, invoice);
    assertThat(blocked(transferable(w, null, from))).isZero();
    transfer(w, null, from, to, List.of(invoiceTx), null, Map.of()).andExpect(status().isCreated());
    assertThat(balance(w, from)).isEqualByComparingTo("0");
    assertThat(balance(w, to)).isEqualByComparingTo("-120");
  }

  // --- doğrulamalar ve şirket kuralı

  @Test
  void dogrulamalarVeSirketKurali() throws Exception {
    World w = world("trv");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID agency = account(w, AccountType.CUSTOMER, "ACENTE");
    UUID customer2 = account(w, AccountType.CUSTOMER, null);
    UUID tx = manual(w, customer, w.a1(), Direction.DEBIT, "40", "TRY");

    transfer(w, null, customer, agency, List.of(tx), null, Map.of())
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("TRANSFER_GROUP_MISMATCH"))
        .andExpect(
            jsonPath("$.message")
                .value(
                    org.hamcrest.Matchers.allOf(
                        org.hamcrest.Matchers.containsString("Kaynak: Müşteri"),
                        org.hamcrest.Matchers.containsString("Hedef: Acente"))));
    expect(
        transfer(w, null, customer, customer, List.of(tx), null, Map.of()),
        400,
        "TRANSFER_SAME_ACCOUNT");
    expect(
        transfer(w, null, customer, customer2, List.of(), null, Map.of()), 400, "TRANSFER_EMPTY");
    UUID groupA = representing(w, w.companyAId());
    UUID groupB = representing(w, w.companyBId());
    expect(
        transfer(w, null, groupA, groupB, List.of(tx), null, Map.of()),
        422,
        "TRANSFER_INTERCOMPANY");
    expect(
        transfer(w, null, customer, customer2, List.of(UUID.randomUUID()), null, Map.of()),
        409,
        "TRANSACTION_NOT_TRANSFERABLE");

    // Pasif hedef.
    sendJson(
            w.t(),
            null,
            patch(FINANCE + "/accounts/" + customer2 + "/active"),
            Map.of("active", false))
        .andExpect(status().isOk());
    expect(
        transfer(w, null, customer, customer2, List.of(tx), null, Map.of()),
        422,
        "ACCOUNT_INACTIVE");

    // Şirket kuralı (MX5 D6): A şirketine bağlı hedefe B1 satırı taşınmaz, hiçbir şey yazılmaz.
    UUID targetA = account(w, AccountType.CUSTOMER, null);
    jdbc.update(
        "update \"%s\".account set company_id = ? where id = ?".formatted(w.schema()),
        w.companyAId(),
        targetA);
    UUID bTx = manual(w, customer, w.b1(), Direction.DEBIT, "25", "TRY");
    long rows = count(w, "select count(*) from \"%s\".account_transaction");
    expect(
        transfer(w, null, customer, targetA, List.of(tx, bTx), null, Map.of()),
        422,
        "COMPANY_MISMATCH");
    assertThat(count(w, "select count(*) from \"%s\".account_transaction")).isEqualTo(rows);
    assertThat(count(w, "select count(*) from \"%s\".account_transfer")).isZero();
    // Aynı karta B1 iş yerinden elle hareket de reddedilir; A1 satırı taşınır.
    Map<String, Object> manualB = new HashMap<>();
    manualB.put("branchId", w.b1());
    manualB.put("direction", "DEBIT");
    manualB.put("money", Map.of("amount", "5", "currency", "TRY"));
    manualB.put("date", TODAY.toString());
    expect(
        sendJson(w.t(), null, post(FINANCE + "/accounts/" + targetA + "/transactions"), manualB),
        422,
        "COMPANY_MISMATCH");
    transfer(w, null, customer, targetA, List.of(tx), null, Map.of())
        .andExpect(status().isCreated());
  }

  // --- yetki ve kapsam

  @Test
  void kapsamYetkiVeIdempotency() throws Exception {
    World w = world("trs");
    UUID from = account(w, AccountType.SUPPLIER, null);
    UUID to = account(w, AccountType.SUPPLIER, null);
    UUID a1Tx = manual(w, from, w.a1(), Direction.CREDIT, "10", "TRY");
    UUID a2Tx = manual(w, from, w.a2(), Direction.CREDIT, "20", "TRY");
    String limited = limitedUser(w, "sinirli", "FINANCE", List.of(w.a1()));
    String accounting = userWithRole(w, "muhasebe", "ACCOUNTING");
    String finance = userWithRole(w, "finans", "FINANCE");

    // LIMITED (A1) liste yalnız A1; A2 satırını seçemez, yazım olmaz.
    assertThat(transferable(w, limited, from)).hasSize(1);
    expect(
        transfer(w, limited, from, to, List.of(a1Tx, a2Tx), null, Map.of()),
        403,
        "BRANCH_OUT_OF_SCOPE");
    assertThat(count(w, "select count(*) from \"%s\".account_transfer")).isZero();
    transfer(w, accounting, from, to, List.of(a1Tx), null, Map.of())
        .andExpect(status().isForbidden());

    // Patron A2 satırını taşır: LIMITED kullanıcı göremez, geri alamaz.
    String transferId = id(transfer(w, null, from, to, List.of(a2Tx), "K-1", Map.of()));
    expect(
        send(w.t(), limited, get(FINANCE + "/account-transfers/" + transferId)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        sendJson(
            w.t(),
            limited,
            post(FINANCE + "/account-transfers/" + transferId + "/reverse"),
            Map.of()),
        403,
        "BRANCH_OUT_OF_SCOPE");
    send(w.t(), null, get(FINANCE + "/account-transfers/" + transferId))
        .andExpect(jsonPath("$.status").value("POSTED"));
    assertThat(
            body(send(w.t(), limited, get(FINANCE + "/account-transfers"))
                    .andExpect(status().isOk()))
                .get("totalElements")
                .asInt())
        .isZero();

    // İdempotent tekrar aynı taşıma; başka kaynak/hedefle aynı anahtar 422.
    JsonNode replay =
        body(
            transfer(w, null, from, to, List.of(a2Tx), "K-1", Map.of())
                .andExpect(status().isCreated()));
    assertThat(replay.get("id").asText()).isEqualTo(transferId);
    assertThat(count(w, "select count(*) from \"%s\".account_transfer")).isEqualTo(1);
    expect(
        transfer(w, null, to, from, List.of(a2Tx), "K-1", Map.of()), 422, "IDEMPOTENCY_KEY_REUSED");

    // Uzun not: hareket açıklaması 500'e sığar, tam not başlıkta.
    String note = "N".repeat(480);
    JsonNode longNote =
        body(
            transfer(w, null, from, to, List.of(a1Tx), null, Map.of("description", note))
                .andExpect(status().isCreated()));
    assertThat(longNote.get("description").asText()).isEqualTo(note);
    String description =
        jdbc.queryForObject(
            ("select description from \"%s\".account_transaction"
                    + " where source_type = 'ACCOUNT_TRANSFER_IN' and source_id = ?")
                .formatted(w.schema()),
            String.class,
            UUID.fromString(longNote.get("lines").get(0).get("id").asText()));
    assertThat(description).hasSize(500).endsWith("...");

    // Personel carileri arası taşıma: izni olmayan FINANCE kullanıcısına yok gibidir.
    UUID e1 = account(w, AccountType.EMPLOYEE, null);
    UUID e2 = account(w, AccountType.EMPLOYEE, null);
    UUID eTx = manual(w, e1, w.a1(), Direction.DEBIT, "15", "TRY");
    String employeeTransfer = id(transfer(w, null, e1, e2, List.of(eTx), null, Map.of()));
    expect(
        sendJson(
            w.t(),
            finance,
            post(FINANCE + "/account-transfers/" + employeeTransfer + "/reverse"),
            Map.of()),
        404,
        "TRANSFER_NOT_FOUND");
    expect(
        send(w.t(), finance, get(FINANCE + "/account-transfers/" + employeeTransfer)),
        404,
        "TRANSFER_NOT_FOUND");
    expect(
        send(w.t(), finance, get(FINANCE + "/accounts/" + e1 + "/transferable-transactions")),
        404,
        "ACCOUNT_NOT_FOUND");
    send(w.t(), null, get(FINANCE + "/account-transfers/" + employeeTransfer))
        .andExpect(jsonPath("$.status").value("POSTED"));
    expect(
        send(w.t(), null, get(FINANCE + "/account-transfers/" + UUID.randomUUID())),
        404,
        "TRANSFER_NOT_FOUND");

    // Geçmiş: tarih aralığı dışındaki taşıma görünmez.
    UUID old = manual(w, from, w.a1(), Direction.CREDIT, "5", "TRY");
    transfer(w, null, from, to, List.of(old), null, Map.of("date", TODAY.minusMonths(7).toString()))
        .andExpect(status().isCreated());
    JsonNode recent =
        body(
            send(
                w.t(),
                null,
                get(FINANCE + "/account-transfers").param("accountId", from.toString())));
    assertThat(recent.get("totalElements").asInt()).isEqualTo(2);
    JsonNode all =
        body(
            send(
                w.t(),
                null,
                get(FINANCE + "/account-transfers")
                    .param("accountId", from.toString())
                    .param("from", TODAY.minusYears(1).toString())));
    assertThat(all.get("totalElements").asInt()).isEqualTo(3);
  }

  // --- eşzamanlılık

  @Test
  void eszamanliTasimaVeIptalCiftEtkiUretmez() throws Exception {
    World w = world("trx");
    UUID x = account(w, AccountType.SUPPLIER, null);
    UUID y = account(w, AccountType.SUPPLIER, null);
    UUID z = account(w, AccountType.SUPPLIER, null);
    UUID shared = manual(w, x, w.a1(), Direction.CREDIT, "10", "TRY");

    // Aynı hareketi taşıyan iki paralel istek: biri 201, diğeri 409 (kilit sonrası ön denetim ya
    // da son savunma olan tekil indeks).
    List<String> outcomes =
        concurrently(
            () -> outcome(transfer(w, null, x, y, List.of(shared), null, Map.of())),
            () -> outcome(transfer(w, null, x, z, List.of(shared), null, Map.of())));
    assertThat(outcomes).contains("201");
    assertThat(outcomes)
        .filteredOn(o -> !"201".equals(o))
        .singleElement()
        .isIn("409 TRANSACTION_NOT_TRANSFERABLE", "409 TRANSACTION_ALREADY_TRANSFERRED");
    assertThat(count(w, "select count(*) from \"%s\".account_transfer_line")).isEqualTo(1);

    // X→Y ve Y→X paralel: kilitlenmeden biter.
    UUID xTx = manual(w, x, w.a1(), Direction.CREDIT, "11", "TRY");
    UUID yTx = manual(w, y, w.a1(), Direction.CREDIT, "12", "TRY");
    assertThat(
            parallel(
                () -> code(transfer(w, null, x, y, List.of(xTx), null, Map.of())),
                () -> code(transfer(w, null, y, x, List.of(yTx), null, Map.of()))))
        .containsOnly(201);

    // Belge iptali ∥ aynı hareketin taşınması: yalnız biri başarılı, tek etki.
    String document = document(w, x, "CEZA_BIZE", "40", w.a1());
    UUID documentTx = tx(w, "ACCOUNT_DOCUMENT", document);
    BigDecimal before = balance(w, x);
    List<Integer> race =
        parallel(
            () ->
                code(
                    sendJson(
                        w.t(),
                        null,
                        post(FINANCE + "/account-documents/" + document + "/cancel"),
                        Map.of("reason", "yarış"))),
            () -> code(transfer(w, null, x, y, List.of(documentTx), null, Map.of())));
    assertThat(race.stream().filter(code -> code == 200 || code == 201).count()).isEqualTo(1);
    assertThat(race.stream().filter(code -> code == 409).count()).isEqualTo(1);
    // Kaynak bakiye: ya iptal (+40) ya taşıma çıkışı (+40); ikisi birden değil.
    assertThat(balance(w, x).subtract(before)).isEqualByComparingTo("40");
  }

  @Test
  void ayniAnahtarlaEszamanliTasimaVeBelgeTekKayitUretir() throws Exception {
    World w = world("trk");
    UUID x = account(w, AccountType.SUPPLIER, null);
    UUID y = account(w, AccountType.SUPPLIER, null);
    UUID moved = manual(w, x, w.a1(), Direction.CREDIT, "10", "TRY");
    String transferKey = "tasima-" + UUID.randomUUID();
    List<ResultActions> transfers =
        concurrently(
            () -> transfer(w, null, x, y, List.of(moved), transferKey, Map.of()),
            () -> transfer(w, null, x, y, List.of(moved), transferKey, Map.of()));
    assertSingleOutcome(transfers);
    assertThat(
            count(
                w,
                "select count(*) from \"%s\".account_transfer where idempotency_key = '"
                    + transferKey
                    + "'"))
        .isEqualTo(1);
    assertThat(count(w, "select count(*) from \"%s\".account_transfer_line")).isEqualTo(1);

    String documentKey = "belge-" + UUID.randomUUID();
    Map<String, Object> body = new HashMap<>();
    body.put("side", "PAYABLE");
    body.put("documentType", "CEZA_BIZE");
    body.put("documentNo", "BLG-IDEM");
    body.put("documentDate", TODAY.toString());
    body.put("amount", "25");
    body.put("currency", "TRY");
    body.put("paymentMethod", "BANK");
    body.put("branchId", w.a1());
    Callable<ResultActions> createDocument =
        () ->
            send(
                w.t(),
                null,
                post(FINANCE + "/accounts/" + x + "/documents")
                    .header("Idempotency-Key", documentKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(body)));
    assertSingleOutcome(concurrently(createDocument, createDocument));
    assertThat(
            count(
                w,
                "select count(*) from \"%s\".account_document where idempotency_key = '"
                    + documentKey
                    + "'"))
        .isEqualTo(1);
    assertThat(
            count(
                w,
                "select count(*) from \"%s\".account_transaction t join \"%s\".account_document d"
                    + " on d.id = t.source_id where d.idempotency_key = '"
                    + documentKey
                    + "'"))
        .isEqualTo(1);
  }

  /** Aynı anahtarlı iki istek: {201, 201 aynı id} ya da {201, 409 IDEMPOTENCY_IN_PROGRESS}. */
  private void assertSingleOutcome(List<ResultActions> results) throws Exception {
    List<Integer> statuses = results.stream().map(AccountTransferIT::code).toList();
    assertThat(statuses).contains(201);
    if (statuses.equals(List.of(201, 201))) {
      assertThat(body(results.get(0)).get("id").asText())
          .isEqualTo(body(results.get(1)).get("id").asText());
    } else {
      ResultActions other = results.get(statuses.get(0) == 201 ? 1 : 0);
      assertThat(code(other)).isEqualTo(409);
      assertThat(body(other).get("code").asText()).isEqualTo("IDEMPOTENCY_IN_PROGRESS");
    }
  }

  // --- yaşlandırma

  @Test
  void yaslandirmaKaynaktaEskiKalemiKorur() throws Exception {
    World w = world("tra");
    UUID from = account(w, AccountType.SUPPLIER, null);
    UUID to = account(w, AccountType.SUPPLIER, null);
    manualOn(w, from, TODAY.minusDays(150), "100");
    UUID recent = manualOn(w, from, TODAY.minusDays(10), "200");

    String transferId = id(transfer(w, null, from, to, List.of(recent), null, Map.of()));
    JsonNode source = agingRow(w, from);
    assertThat(source.get("daysOver90").decimalValue()).isEqualByComparingTo("100");
    assertThat(source.get("total").decimalValue()).isEqualByComparingTo("100");
    JsonNode target = agingRow(w, to);
    assertThat(target.get("days0To30").decimalValue()).isEqualByComparingTo("200");
    assertThat(target.get("total").decimalValue()).isEqualByComparingTo("200");

    sendJson(w.t(), null, post(FINANCE + "/account-transfers/" + transferId + "/reverse"), Map.of())
        .andExpect(status().isOk());
    JsonNode restored = agingRow(w, from);
    assertThat(restored.get("daysOver90").decimalValue()).isEqualByComparingTo("100");
    assertThat(restored.get("days0To30").decimalValue()).isEqualByComparingTo("200");
    assertThat(agingRow(w, to)).isNull();
  }

  /**
   * F3: geçmiş tarihli yaşlandırma o tarihte yürürlükte olan taşımayı izler ve aynı tarihteki
   * bakiyeyle tutar (taşımadan önce kaynakta, taşıma yürürlükteyken hedefte taşıma tarihiyle, geri
   * almadan sonra kaynakta kendi tarihiyle).
   */
  @Test
  void gecmisTarihliYaslandirmaTasimaTarihlerineGoreBakiyeyleTutar() throws Exception {
    World w = world("trg");
    UUID from = account(w, AccountType.SUPPLIER, null);
    UUID to = account(w, AccountType.SUPPLIER, null);
    UUID invoice = manualOn(w, from, TODAY.minusDays(60), "200");
    LocalDate transferDate = TODAY.minusDays(20);
    LocalDate reverseDate = TODAY.minusDays(5);
    String transferId =
        id(
            transfer(
                w,
                null,
                from,
                to,
                List.of(invoice),
                null,
                Map.of("date", transferDate.toString())));
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/account-transfers/" + transferId + "/reverse"),
            Map.of("date", reverseDate.toString()))
        .andExpect(status().isOk());

    // 1) Taşımadan önce: kalem kaynakta kendi tarihiyle (30 gün), hedef boş.
    LocalDate beforeTransfer = TODAY.minusDays(30);
    JsonNode source = agingRow(w, from, beforeTransfer);
    assertThat(source.get("days0To30").decimalValue()).isEqualByComparingTo("200");
    assertThat(source.get("total").decimalValue()).isEqualByComparingTo("200");
    assertThat(agingRow(w, to, beforeTransfer)).isNull();
    assertAgingMatchesBalance(w, from, beforeTransfer, "200");
    assertAgingMatchesBalance(w, to, beforeTransfer, "0");

    // 2) Taşıma ile geri alma arasında: kalem hedefte taşıma tarihiyle (10 gün), kaynakta yok.
    LocalDate inEffect = TODAY.minusDays(10);
    assertThat(agingRow(w, from, inEffect)).isNull();
    JsonNode target = agingRow(w, to, inEffect);
    assertThat(target.get("days0To30").decimalValue()).isEqualByComparingTo("200");
    assertThat(target.get("total").decimalValue()).isEqualByComparingTo("200");
    assertAgingMatchesBalance(w, from, inEffect, "0");
    assertAgingMatchesBalance(w, to, inEffect, "200");

    // 3) Geri almadan sonra: kalem kaynakta kendi tarihiyle (60 gün), hedef boş.
    JsonNode restored = agingRow(w, from, TODAY);
    assertThat(restored.get("days31To60").decimalValue()).isEqualByComparingTo("200");
    assertThat(restored.get("total").decimalValue()).isEqualByComparingTo("200");
    assertThat(agingRow(w, to, TODAY)).isNull();
    assertAgingMatchesBalance(w, from, TODAY, "200");
    assertAgingMatchesBalance(w, to, TODAY, "0");
  }

  /** Yaşlandırma toplamı (borç) ile aynı tarihteki cari bakiyesi (alacaklı = eksi) tutar. */
  private void assertAgingMatchesBalance(World w, UUID account, LocalDate asOf, String payable)
      throws Exception {
    JsonNode aging = agingRow(w, account, asOf);
    BigDecimal agingTotal = aging == null ? BigDecimal.ZERO : aging.get("total").decimalValue();
    assertThat(agingTotal).isEqualByComparingTo(payable);
    JsonNode rows =
        body(send(
                    w.t(),
                    null,
                    get(FINANCE + "/accounts/" + account + "/balances")
                        .param("asOf", asOf.toString()))
                .andExpect(status().isOk()))
            .get("rows");
    BigDecimal balance = BigDecimal.ZERO;
    for (JsonNode row : rows) {
      if ("ALL".equals(row.get("segment").asText())) {
        balance = balance.add(row.get("balance").decimalValue());
      }
    }
    assertThat(balance.negate()).isEqualByComparingTo(payable);
  }

  // --- yardımcılar

  private ResultActions transfer(
      World w,
      String token,
      UUID from,
      UUID to,
      List<UUID> ids,
      String key,
      Map<String, Object> extra)
      throws Exception {
    Map<String, Object> body = new HashMap<>(extra);
    body.put("fromAccountId", from.toString());
    body.put("toAccountId", to.toString());
    body.put("transactionIds", ids.stream().map(UUID::toString).toList());
    MockHttpServletRequestBuilder request =
        post(FINANCE + "/account-transfers")
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(body));
    if (key != null) {
      request.header("Idempotency-Key", key);
    }
    return send(w.t(), token, request);
  }

  /** Açık plan engelli satır sayısı. */
  private static long blocked(JsonNode rows) {
    long count = 0;
    for (JsonNode row : rows) {
      if (!row.get("blockedReason").isNull()) {
        count++;
      }
    }
    return count;
  }

  private JsonNode transferable(World w, String token, UUID accountId) throws Exception {
    return body(
        send(w.t(), token, get(FINANCE + "/accounts/" + accountId + "/transferable-transactions"))
            .andExpect(status().isOk()));
  }

  private String purchaseInvoice(
      World w, UUID account, String branch, String number, String net, String vat)
      throws Exception {
    return id(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/purchase-invoices"),
            Map.of(
                "accountId",
                account.toString(),
                "branchId",
                branch,
                "number",
                number,
                "invoiceDate",
                TODAY.toString(),
                "dueDate",
                TODAY.plusDays(30).toString(),
                "net",
                Map.of("amount", net, "currency", "TRY"),
                "vat",
                Map.of("amount", vat, "currency", "TRY"))));
  }

  private String planOf(World w, String invoice) {
    return jdbc.queryForObject(
        "select id::text from \"%s\".payment_plan where purchase_invoice_id = ?"
            .formatted(w.schema()),
        String.class,
        UUID.fromString(invoice));
  }

  private void cancelPlansOf(World w, String invoice) throws Exception {
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/payment-plans/" + planOf(w, invoice) + "/cancel"),
            Map.of())
        .andExpect(status().isOk());
  }

  private String document(World w, UUID account, String type, String amount, String branch)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("side", "PAYABLE");
    body.put("documentType", type);
    body.put("documentNo", "BLG-" + UUID.randomUUID().toString().substring(0, 8));
    body.put("documentDate", TODAY.toString());
    body.put("amount", amount);
    body.put("currency", "TRY");
    body.put("paymentMethod", "BANK");
    body.put("branchId", branch);
    return id(sendJson(w.t(), null, post(FINANCE + "/accounts/" + account + "/documents"), body));
  }

  private static Map<String, Object> settlement(
      String method, UUID account, String branch, String fund, String amount) {
    Map<String, Object> body = new HashMap<>();
    body.put("method", method);
    body.put("accountId", account.toString());
    body.put("branchId", branch);
    if (fund != null) {
      body.put("fundAccountId", fund);
    }
    body.put("money", Map.of("amount", amount, "currency", "TRY"));
    body.put("date", TODAY.toString());
    // 12.2 B4: şirket dağılımı uyarısı onaylı (409 CONFIRMATION_REQUIRED olmasın).
    body.put("confirmWarnings", true);
    return body;
  }

  private String payCash(World w, UUID account, String branch, String amount) throws Exception {
    return id(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/payments"),
            settlement("CASH", account, branch, w.fundA1(), amount)));
  }

  private JsonNode collectCheck(World w, UUID customer, String number, String amount)
      throws Exception {
    Map<String, Object> body = settlement("CHECK", customer, w.a1(), null, amount);
    body.put(
        "instrument",
        Map.of(
            "kind",
            "CHECK",
            "number",
            number,
            "bankName",
            "Test Bank",
            "dueDate",
            TODAY.plusDays(60).toString()));
    return body(
        sendJson(w.t(), null, post(FINANCE + "/collections"), body)
            .andExpect(status().isCreated()));
  }

  private void transition(World w, String instrument, String target, String fund) throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("toStatus", target);
    body.put("date", TODAY.toString());
    if (fund != null) {
      body.put("fundAccountId", fund);
    }
    sendJson(w.t(), null, post(FINANCE + "/instruments/" + instrument + "/transition"), body)
        .andExpect(status().isOk());
  }

  private String bankFund(World w, String branch) throws Exception {
    return id(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/funds"),
            Map.of(
                "code",
                "BANKA-" + branch.substring(0, 4),
                "name",
                "Banka",
                "kind",
                "BANK",
                "currency",
                "TRY",
                "branchId",
                branch,
                "bankName",
                "Test Bank",
                "allowNegative",
                true)));
  }

  private void allowSelfApproval(World w) throws Exception {
    sendJson(
            w.t(),
            null,
            org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put(
                FINANCE + "/settings"),
            Map.of("allowSelfApproval", true))
        .andExpect(status().isOk());
  }

  private UUID manualOn(World w, UUID account, LocalDate date, String amount) throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("branchId", w.a1());
    body.put("direction", "CREDIT");
    body.put("money", Map.of("amount", amount, "currency", "TRY"));
    body.put("date", date.toString());
    body.put("description", "Fatura " + date);
    return UUID.fromString(
        id(sendJson(w.t(), null, post(FINANCE + "/accounts/" + account + "/transactions"), body)));
  }

  private JsonNode agingRow(World w, UUID account) throws Exception {
    return agingRow(w, account, TODAY);
  }

  private JsonNode agingRow(World w, UUID account, LocalDate asOf) throws Exception {
    JsonNode rows =
        body(
            send(
                    w.t(),
                    null,
                    get(FINANCE + "/reports/aging")
                        .param("type", "PAYABLE")
                        .param("asOf", asOf.toString()))
                .andExpect(status().isOk()));
    for (JsonNode row : rows) {
      if (account.toString().equals(row.get("accountId").asText())) {
        return row;
      }
    }
    return null;
  }

  private UUID tx(World w, String sourceType, String sourceId) {
    return jdbc.queryForObject(
        "select id from \"%s\".account_transaction where source_type = ? and source_id = ?"
            .formatted(w.schema()),
        UUID.class,
        sourceType,
        UUID.fromString(sourceId));
  }

  private UUID only(World w, UUID account, String sourceType) {
    return jdbc.queryForObject(
        "select id from \"%s\".account_transaction where account_id = ? and source_type = ?"
            .formatted(w.schema()),
        UUID.class,
        account,
        sourceType);
  }

  /** Orijinal hareketin etkin ya da son taşımasındaki OUT/IN satırı. */
  private UUID mirrorOf(World w, String role, UUID original) {
    return jdbc.queryForObject(
        ("select t.id from \"%s\".account_transaction t join \"%s\".account_transfer_line l"
                + " on l.id = t.source_id where l.account_transaction_id = ?"
                + " and t.source_type = ? order by t.created_at desc limit 1")
            .formatted(w.schema(), w.schema()),
        UUID.class,
        original,
        "ACCOUNT_TRANSFER_" + role);
  }

  private UUID representing(World w, UUID companyId) {
    return jdbc.queryForObject(
        "select id from \"%s\".account where represents_company_id = ?".formatted(w.schema()),
        UUID.class,
        companyId);
  }

  private UUID instrumentAccount(World w, String instrument, String column) {
    return jdbc.queryForObject(
        "select %s from \"%s\".instrument where id = ?".formatted(column, w.schema()),
        UUID.class,
        UUID.fromString(instrument));
  }

  private String instrumentStatus(World w, String instrument) {
    return jdbc.queryForObject(
        "select status from \"%s\".instrument where id = ?".formatted(w.schema()),
        String.class,
        UUID.fromString(instrument));
  }

  private Map<String, Object> row(World w, String sql, Object id) {
    return jdbc.queryForMap(
        sql.formatted(w.schema()),
        UUID.fromString(id instanceof JsonNode n ? n.asText() : id.toString()));
  }

  private BigDecimal balance(World w, UUID account) {
    return jdbc.queryForObject(
        ("select coalesce(sum(case when direction = 'DEBIT' then amount else -amount end), 0)"
                + " from \"%s\".account_transaction where account_id = ? and deleted = false")
            .formatted(w.schema()),
        BigDecimal.class,
        account);
  }

  private BigDecimal tlTotal(World w) {
    return jdbc.queryForObject(
        ("select coalesce(sum(case when direction = 'DEBIT' then tl_amount else -tl_amount end), 0)"
                + " from \"%s\".account_transaction where deleted = false")
            .formatted(w.schema()),
        BigDecimal.class);
  }

  private long count(World w, String sql) {
    return jdbc.queryForObject(sql.replace("%s", w.schema()), Long.class);
  }

  private static int code(ResultActions actions) {
    return actions.andReturn().getResponse().getStatus();
  }

  /** "201" ya da "409 KOD" — hata gövdesinin kodu da denetlensin. */
  private String outcome(ResultActions actions) throws Exception {
    int status = code(actions);
    if (status < 400) {
      return String.valueOf(status);
    }
    return status + " " + body(actions).get("code").asText();
  }

  /** Ortak başlangıç engeliyle aynı anda başlatılan istekler (T-2). */
  @SafeVarargs
  private static List<Integer> parallel(Callable<Integer>... calls) throws Exception {
    return concurrently(calls);
  }
}
