package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Ödeme/tahsilat listesi (12.2a §3.7, §6.2 {@code SettlementListIT}): süzgeçler, personel maskesi
 * (SEC-01), LIMITED kapsam, şirket ve kiracı izolasyonu, açık sayfalama (F1), sıralama beyaz
 * listesi, türetilmiş alanlar (F-2 taşınmış kayıt dahil) ve MUI geriye uyumu.
 */
class SettlementListIT extends SettlementTestSupport {

  @Test
  void tahsilatSuzgecleriVeTuretmeler() throws Exception {
    World w = world("sl1");
    UUID c1 = account(w, AccountType.CUSTOMER, null);
    UUID c2 = account(w, AccountType.CUSTOMER, "ACENTE");
    rename(w, c2, "Zeta Acente Müşterisi");
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    String usd = bankFund(w, "USD-A1", w.a1(), "USD");
    String counterparty = counterpartyBank(w, c2, "12345678");

    Map<String, Object> first = body("CASH", c1, w.a1(), w.fundA1(), "100");
    first.put("documentNo", "TBL-001");
    first.put("description", "Kira tahsilatı Ocak");
    String s1 = id(collect(w, null, first, null));
    String s2 = id(collect(w, null, body("BANK", c1, w.a1(), bank, "200"), null));
    // Eski kayıt: kanal NULL = Banka Havalesi/Eft.
    update(w, "update %s.settlement set channel = null where id = ?::uuid", s2);
    Map<String, Object> card = body("BANK", c2, w.a2(), bank, "300");
    card.put("channel", "CREDIT_CARD");
    card.put("counterpartyBankAccountId", counterparty);
    String s3 = id(collect(w, null, card, null));
    Map<String, Object> check = body("CHECK", c1, w.a1(), null, "400");
    check.put("instrument", instrument("CHECK", "7777777"));
    String s4 = id(collect(w, null, check, null));
    Map<String, Object> note = body("CHECK", c2, w.a2(), null, "500");
    note.put("instrument", instrument("NOTE", "S-55"));
    String s5 = id(collect(w, null, note, null));
    Map<String, Object> old = body("CASH", c1, w.a2(), w.fundA2(), "600");
    old.put("date", TODAY.minusDays(10).toString());
    String s6 = id(collect(w, null, old, null));
    String s7 = id(collect(w, null, body("CASH", c2, w.a1(), w.fundA1(), "700"), null));
    reverse(w, null, s7, TODAY, "Yanlış kayıt").andExpect(status().isOk());
    Map<String, Object> dollars = body("BANK", c1, w.a1(), usd, "1000");
    dollars.put("money", Map.of("amount", "1000", "currency", "USD"));
    dollars.put("exchangeRate", "30");
    String s8 = id(collect(w, null, dollars, null));
    seedFxUse(w, usd, s8, "400");

    // Süzgeçsiz (MUI geriye uyumu): tüm durumlar, tarih sınırı yok.
    assertThat(ids(list(w, null, COLLECTIONS)))
        .containsExactlyInAnyOrder(s1, s2, s3, s4, s5, s6, s7, s8);
    assertThat(ids(list(w, null, COLLECTIONS, "accountId", c1.toString())))
        .containsExactlyInAnyOrder(s1, s2, s4, s6, s8);
    assertThat(ids(list(w, null, COLLECTIONS, "accountType", "CUSTOMER", "subGroup", "ACENTE")))
        .containsExactlyInAnyOrder(s3, s5, s7);
    assertThat(ids(list(w, null, COLLECTIONS, "accountType", "SUPPLIER"))).isEmpty();
    assertThat(ids(list(w, null, COLLECTIONS, "branchIds", w.a2())))
        .containsExactlyInAnyOrder(s3, s5, s6);
    assertThat(ids(list(w, null, COLLECTIONS, "fundAccountIds", bank)))
        .containsExactlyInAnyOrder(s2, s3);
    assertThat(ids(list(w, null, COLLECTIONS, "method", "BANK"))).containsExactlyInAnyOrder(s2, s8);
    assertThat(ids(list(w, null, COLLECTIONS, "method", "CREDIT_CARD"))).containsExactly(s3);
    assertThat(ids(list(w, null, COLLECTIONS, "method", "CHECK"))).containsExactly(s4);
    assertThat(ids(list(w, null, COLLECTIONS, "method", "NOTE"))).containsExactly(s5);
    assertThat(ids(list(w, null, COLLECTIONS, "method", "CASH", "method", "NOTE")))
        .containsExactlyInAnyOrder(s1, s5, s6, s7);
    assertThat(ids(list(w, null, COLLECTIONS, "status", "REVERSED"))).containsExactly(s7);
    assertThat(ids(list(w, null, COLLECTIONS, "status", "POSTED"))).hasSize(7).doesNotContain(s7);
    assertThat(
            ids(
                list(
                    w,
                    null,
                    COLLECTIONS,
                    "from",
                    TODAY.minusDays(11).toString(),
                    "to",
                    TODAY.minusDays(9).toString())))
        .containsExactly(s6);
    assertThat(ids(list(w, null, COLLECTIONS, "q", "tbl-001"))).containsExactly(s1);
    assertThat(ids(list(w, null, COLLECTIONS, "q", "KIRA"))).containsExactly(s1);
    assertThat(ids(list(w, null, COLLECTIONS, "q", "7777777"))).containsExactly(s4);
    assertThat(ids(list(w, null, COLLECTIONS, "q", accountName(w, c2))))
        .containsExactlyInAnyOrder(s3, s5, s7);
    assertThat(ids(list(w, null, COLLECTIONS, "q", "%"))).isEmpty();
    assertThat(ids(list(w, null, COLLECTIONS, "counterpartyBankAccountId", counterparty)))
        .containsExactly(s3);
    assertThat(ids(list(w, null, COLLECTIONS, "hasAccount", "false"))).isEmpty();
    assertThat(ids(list(w, null, COLLECTIONS, "hasAccount", "true"))).hasSize(8);
    assertThat(
            ids(
                list(
                    w,
                    null,
                    COLLECTIONS,
                    "accountId",
                    c1.toString(),
                    "method",
                    "CASH",
                    "branchIds",
                    w.a1(),
                    "status",
                    "POSTED")))
        .containsExactly(s1);

    // Türetmeler.
    Map<String, JsonNode> rows = byId(list(w, null, COLLECTIONS, "size", "50"));
    JsonNode cash = rows.get(s1);
    assertThat(cash.get("displayMethod").asText()).isEqualTo("CASH");
    assertThat(cash.get("documentNo").asText()).isEqualTo("TBL-001");
    assertThat(cash.get("accountName").asText()).isEqualTo(accountName(w, c1));
    assertThat(cash.get("accountGroupName").asText()).isEqualTo("Müşteri");
    assertThat(cash.get("branchName").asText()).isEqualTo("A1 Merkez");
    assertThat(cash.get("fundKind").asText()).isEqualTo("CASH");
    assertThat(cash.get("employeeMasked").asBoolean()).isFalse();
    assertThat(cash.get("lockReason").isNull()).isTrue();
    assertThat(cash.get("reversible").asBoolean()).isTrue();
    assertThat(cash.get("correctable").asBoolean()).isTrue();
    assertThat(cash.get("fxUsed").isTextual()).isTrue();
    assertThat(new BigDecimal(cash.get("fxRemaining").asText())).isZero();
    assertThat(cash.get("createdBy").asText()).isNotBlank();
    assertThat(rows.get(s2).get("displayMethod").asText()).isEqualTo("BANK");
    assertThat(rows.get(s2).get("channel").isNull()).isTrue();
    JsonNode cardRow = rows.get(s3);
    assertThat(cardRow.get("displayMethod").asText()).isEqualTo("CREDIT_CARD");
    assertThat(cardRow.get("counterpartyBankAccountId").asText()).isEqualTo(counterparty);
    assertThat(cardRow.get("counterpartyBankName").asText()).isEqualTo("Test Bankası");
    JsonNode checkRow = rows.get(s4);
    assertThat(checkRow.get("instrumentNumber").asText()).isEqualTo("7777777");
    assertThat(checkRow.get("instrumentKind").asText()).isEqualTo("CHECK");
    assertThat(checkRow.get("instrumentStatus").asText()).isEqualTo("PORTFOLIO");
    assertThat(checkRow.get("lockReason").asText()).isEqualTo("CHECK");
    assertThat(checkRow.get("reversible").asBoolean()).isFalse();
    assertThat(rows.get(s5).get("displayMethod").asText()).isEqualTo("NOTE");
    JsonNode reversed = rows.get(s7);
    assertThat(reversed.get("lockReason").asText()).isEqualTo("REVERSED");
    assertThat(reversed.get("reverseReason").asText()).isEqualTo("Yanlış kayıt");
    assertThat(reversed.get("reversedOn").asText()).isEqualTo(TODAY.toString());
    JsonNode fx = rows.get(s8);
    assertThat(fx.get("fxUsed").asText()).isEqualTo("400.0000");
    assertThat(fx.get("fxRemaining").asText()).isEqualTo("600.0000");
    assertThat(fx.get("lockReason").asText()).isEqualTo("FX_SOURCE");
    assertThat(fx.get("exchangeRate").decimalValue()).isEqualByComparingTo("30");
    assertThat(fx.get("tlAmount").decimalValue()).isEqualByComparingTo("30000");
    assertThat(fx.get("money").get("amount").isTextual()).isTrue();

    // Sıralama: tutar artan/azalan, belge no, iş yeri, cari adı.
    assertThat(ids(list(w, null, COLLECTIONS, "sort", "amount,asc")).get(0)).isEqualTo(s1);
    assertThat(ids(list(w, null, COLLECTIONS, "sort", "amount,desc")).get(0)).isEqualTo(s8);
    assertThat(ids(list(w, null, COLLECTIONS, "sort", "documentNo,asc")).get(0)).isEqualTo(s1);
    assertThat(
            ids(list(w, null, COLLECTIONS, "sort", "branchName,desc", "sort", "amount,asc"))
                .subList(0, 3))
        .containsExactly(s3, s5, s6);
    assertThat(ids(list(w, null, COLLECTIONS, "sort", "settlementDate,asc")).get(0)).isEqualTo(s6);
    assertThat(ids(list(w, null, COLLECTIONS, "sort", "createdAt", "sort", "accountName")))
        .hasSize(8);
  }

  @Test
  void odemeBayraklariDuzeltmeZinciriVeMuiUyumu() throws Exception {
    World w = world("sl2");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    UUID bankAccount = account(w, AccountType.SUPPLIER, null);
    update(w, "update %s.account set type = 'BANK', sub_group = 'BANKA' where id = ?", bankAccount);
    String bankA = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    String bankB = bankFund(w, "BANKA-B1", w.b1(), "TRY");

    String p1 = id(pay(w, null, body("CASH", supplier, w.a1(), w.fundA1(), "40"), null));
    UUID plan = payPlan(w, manualPlan(w, supplier, w.a1(), "20"), bankA, "BANK");
    Map<String, Object> virman = new HashMap<>();
    virman.put("transferType", "EFT");
    virman.put("reasonType", "DEBT_PAID");
    virman.put("fromFundId", bankA);
    virman.put("toFundId", bankB);
    virman.put("money", Map.of("amount", "15", "currency", "TRY"));
    virman.put("date", TODAY.toString());
    sendJson(w.t(), null, post(FINANCE + "/intercompany-transfers"), virman)
        .andExpect(status().isCreated());
    UUID leg =
        jdbc.queryForObject(
            "select payment_settlement_id from \"%s\".intercompany_transfer".formatted(w.schema()),
            UUID.class);
    UUID vehiclePayment =
        settlementOfExpense(w, vehicleExpense(w, vehicle(w, "06SL02"), w.a1(), w.fundA1(), "12"));
    Map<String, Object> direct = body("CASH", null, w.a1(), w.fundA1(), "8");
    direct.put("expenseItemId", expenseItem(w, "GL1"));
    String directPayment = id(pay(w, null, direct, null));
    String credit = id(pay(w, null, body("BANK", bankAccount, w.a1(), bankA, "33"), null));

    Map<String, JsonNode> rows = byId(list(w, null, PAYMENTS, "companyId", w.companyA()));
    assertThat(rows.get(plan.toString()).get("lockReason").asText()).isEqualTo("PLAN");
    JsonNode legRow = rows.get(leg.toString());
    assertThat(legRow.get("lockReason").asText()).isEqualTo("INTERCOMPANY");
    assertThat(legRow.get("intercompany").asBoolean()).isTrue();
    JsonNode vehicleRow = rows.get(vehiclePayment.toString());
    assertThat(vehicleRow.get("lockReason").asText()).isEqualTo("VEHICLE_EXPENSE");
    assertThat(vehicleRow.get("accountId").isNull()).isTrue();
    assertThat(vehicleRow.get("reversible").asBoolean()).isFalse();
    JsonNode directRow = rows.get(directPayment);
    assertThat(directRow.get("lockReason").isNull()).isTrue();
    assertThat(directRow.get("reversible").asBoolean()).isTrue();
    assertThat(directRow.get("correctable").asBoolean()).isFalse();
    assertThat(directRow.get("expenseItemName").asText()).isEqualTo("Kalem GL1");
    assertThat(rows.get(credit).get("credit").asBoolean()).isTrue();
    assertThat(rows.get(p1).get("credit").asBoolean()).isFalse();
    assertThat(ids(list(w, null, PAYMENTS, "hasAccount", "false")))
        .containsExactlyInAnyOrder(vehiclePayment.toString(), directPayment);
    assertThat(ids(list(w, null, PAYMENTS, "hasAccount", "true")))
        .doesNotContain(vehiclePayment.toString(), directPayment)
        .contains(p1, credit);

    // Düzeltme zinciri.
    String p2 =
        body(correct(w, null, p1, "Tutar hatası", body("BANK", supplier, w.a1(), bankA, "45"), null)
                .andExpect(status().isCreated()))
            .get("id")
            .asText();
    rows = byId(list(w, null, PAYMENTS));
    assertThat(rows.get(p1).get("correctedById").asText()).isEqualTo(p2);
    assertThat(rows.get(p1).get("status").asText()).isEqualTo("REVERSED");
    assertThat(rows.get(p1).get("reverseReason").asText()).isEqualTo("Tutar hatası");
    assertThat(rows.get(p2).get("correctsSettlementId").asText()).isEqualTo(p1);
    assertThat(rows.get(p2).get("correctedById").isNull()).isTrue();
    assertThat(rows.get(p2).get("channel").asText()).isEqualTo("TRANSFER");

    // MUI: parametresiz liste SettlementResponse alanlarının tümünü taşır, varsayılan boyut 20.
    JsonNode page = list(w, null, PAYMENTS);
    assertThat(page.get("size").asInt()).isEqualTo(20);
    assertThat(page.get("totalElements").asInt()).isEqualTo(rows.size());
    JsonNode item = page.get("content").get(0);
    for (String field :
        List.of(
            "id",
            "type",
            "method",
            "accountId",
            "branchId",
            "companyId",
            "fundAccountId",
            "instrumentId",
            "expenseItemId",
            "planId",
            "money",
            "settlementDate",
            "description",
            "status",
            "documentNo",
            "channel",
            "counterpartyBankAccountId",
            "correctsSettlementId",
            "reverseReason",
            "reversedOn")) {
      assertThat(item.has(field)).as(field).isTrue();
    }
  }

  @Test
  void personelMaskesi() throws Exception {
    World w = world("sl3");
    String finance = userWithRole(w, "finans", "FINANCE");
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    rename(w, employee, "Ayşe Personel Yılmaz");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    String employeeBank = counterpartyBank(w, employee, "99998888");
    Map<String, Object> salary = body("BANK", employee, w.a1(), bank, "70");
    salary.put("counterpartyBankAccountId", employeeBank);
    salary.put("description", "Maaş ödemesi ****8888 hesabına");
    salary.put("documentNo", "MAAS-1");
    String employeePayment = id(pay(w, null, salary, null));
    String supplierPayment =
        id(pay(w, null, body("CASH", supplier, w.a1(), w.fundA1(), "30"), null));

    JsonNode masked = byId(list(w, finance, PAYMENTS)).get(employeePayment);
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
    assertThat(masked.get("accountType").asText()).isEqualTo("EMPLOYEE");
    assertThat(masked.get("reversible").asBoolean()).isFalse();
    assertThat(masked.get("correctable").asBoolean()).isFalse();
    assertThat(masked.get("documentNo").asText()).isEqualTo("MAAS-1");
    // Arama personel adı ve açıklamayla eşleşmez; belge no eşleşir.
    assertThat(ids(list(w, finance, PAYMENTS, "q", accountName(w, employee)))).isEmpty();
    assertThat(ids(list(w, finance, PAYMENTS, "q", "Maaş"))).isEmpty();
    assertThat(ids(list(w, finance, PAYMENTS, "q", "MAAS-1"))).containsExactly(employeePayment);
    // Maskeli satır cari adı sıralamasında iki yönde de sonda.
    assertThat(ids(list(w, finance, PAYMENTS, "sort", "accountName,asc")))
        .containsExactly(supplierPayment, employeePayment);
    assertThat(ids(list(w, finance, PAYMENTS, "sort", "accountName,desc")))
        .containsExactly(supplierPayment, employeePayment);
    expect(
        listCall(w, finance, PAYMENTS, "accountId", employee.toString()), 404, "ACCOUNT_NOT_FOUND");
    expect(
        listCall(w, finance, PAYMENTS, "counterpartyBankAccountId", employeeBank),
        404,
        "ACCOUNT_NOT_FOUND");
    expect(
        listCall(w, finance, PAYMENTS, "counterpartyBankAccountId", UUID.randomUUID().toString()),
        404,
        "ACCOUNT_NOT_FOUND");

    // İzinli kullanıcı (patron) her şeyi görür.
    JsonNode visible = byId(list(w, null, PAYMENTS)).get(employeePayment);
    assertThat(visible.get("employeeMasked").asBoolean()).isFalse();
    assertThat(visible.get("description").asText()).startsWith("Maaş");
    assertThat(visible.get("counterpartyBankAccountId").asText()).isEqualTo(employeeBank);
    assertThat(ids(list(w, null, PAYMENTS, "q", accountName(w, employee))))
        .containsExactly(employeePayment);
  }

  @Test
  void kapsamSirketVeKiraciIzolasyonu() throws Exception {
    World w = world("sl4");
    String a1User = limitedUser(w, "a1", "FINANCE", List.of(w.a1()));
    UUID customer = account(w, AccountType.CUSTOMER, null);
    String a1 = id(collect(w, null, body("CASH", customer, w.a1(), w.fundA1(), "10"), null));
    String a2 = id(collect(w, null, body("CASH", customer, w.a2(), w.fundA2(), "20"), null));
    String b1 = id(collect(w, null, body("CASH", customer, w.b1(), w.fundB1(), "30"), null));

    assertThat(ids(list(w, a1User, COLLECTIONS))).containsExactly(a1);
    expect(listCall(w, a1User, COLLECTIONS, "branchIds", w.a2()), 403, "BRANCH_OUT_OF_SCOPE");
    assertThat(ids(list(w, null, COLLECTIONS, "companyId", w.companyA())))
        .containsExactlyInAnyOrder(a1, a2);
    assertThat(ids(list(w, null, COLLECTIONS, "companyId", w.companyB()))).containsExactly(b1);
    assertThat(ids(list(w, null, COLLECTIONS))).containsExactlyInAnyOrder(a1, a2, b1);

    World other = world("sl4b");
    assertThat(list(other, null, COLLECTIONS).get("totalElements").asInt()).isZero();
  }

  @Test
  void sayfalamaSiralamaVeSuzgecDogrulamasi() throws Exception {
    World w = world("sl5");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    // 600 kayıt (yalnız settlement tablosu; liste birleşimleri soldan).
    update(
        w,
        """
        insert into %s.settlement (id, type, method, account_id, branch_id, company_id,
          fund_account_id, amount, currency, settlement_date, status, channel, created_by,
          created_at, updated_by, updated_at, deleted)
        select gen_random_uuid(), 'PAYMENT', 'CASH', ?, ?::uuid, ?::uuid, ?::uuid, g, 'TRY', ?,
               'POSTED', null, 'test', now(), 'test', now(), false
        from generate_series(1, 600) g
        """,
        supplier,
        w.a1(),
        w.companyA(),
        w.fundA1(),
        TODAY);

    JsonNode first = list(w, null, PAYMENTS, "size", "500");
    assertThat(first.get("content").size()).isEqualTo(500);
    assertThat(first.get("size").asInt()).isEqualTo(500);
    assertThat(first.get("totalElements").asInt()).isEqualTo(600);
    assertThat(first.get("totalPages").asInt()).isEqualTo(2);
    // Tüm satırlar tarih ve oluşturma anında eşit: sayfalar yalnız s.id ile kararlı (ayrık, 600).
    disjointPages(w, ids(first), "size", "500", "page", "1");
    // Her satırın cari adı aynı (tümüyle eşit metin anahtarı).
    disjointPages(
        w,
        ids(list(w, null, PAYMENTS, "size", "500", "sort", "accountName,asc")),
        "size",
        "500",
        "page",
        "1",
        "sort",
        "accountName,asc");
    assertThat(
            list(w, null, PAYMENTS, "sort", "amount,asc")
                .get("content")
                .get(0)
                .get("money")
                .get("amount")
                .asText())
        .isEqualTo("1.0000");
    assertThat(
            list(w, null, PAYMENTS, "sort", "amount", "sort", "desc")
                .get("content")
                .get(0)
                .get("money")
                .get("amount")
                .asText())
        .isEqualTo("600.0000");

    expect(listCall(w, null, PAYMENTS, "size", "501"), 400, "PAGE_SIZE_INVALID");
    expect(listCall(w, null, PAYMENTS, "size", "0"), 400, "PAGE_SIZE_INVALID");
    expect(listCall(w, null, PAYMENTS, "page", "-1"), 400, "PAGE_SIZE_INVALID");
    expect(listCall(w, null, PAYMENTS, "sort", "foo"), 400, "SORT_INVALID");
    expect(listCall(w, null, PAYMENTS, "sort", "amount,sideways"), 400, "SORT_INVALID");
    String from = TODAY.minusDays(367).toString();
    expect(
        listCall(w, null, PAYMENTS, "from", from, "to", TODAY.toString()),
        400,
        "DATE_RANGE_TOO_LARGE");
    listCall(
            w,
            null,
            PAYMENTS,
            "from",
            from,
            "to",
            TODAY.toString(),
            "accountId",
            supplier.toString())
        .andExpect(status().isOk());
    expect(
        listCall(w, null, PAYMENTS, "from", TODAY.toString(), "to", TODAY.minusDays(1).toString()),
        400,
        "DATE_RANGE_INVALID");
    expect(listCall(w, null, PAYMENTS, "q", "x".repeat(101)), 400, "QUERY_TOO_LONG");
    expect(listCall(w, null, PAYMENTS, "method", "OTHER"), 400, "METHOD_INVALID");
  }

  @Test
  void tasinmisKayitKilitli() throws Exception {
    World w = world("sl6");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    UUID target = account(w, AccountType.SUPPLIER, null);
    String payment = id(pay(w, null, body("CASH", supplier, w.a1(), w.fundA1(), "25"), null));
    String transfer = transferLine(w, supplier, target, ledgerLine(w, payment));

    JsonNode row = byId(list(w, null, PAYMENTS)).get(payment);
    assertThat(row.get("transferred").asBoolean()).isTrue();
    assertThat(row.get("lockReason").asText()).isEqualTo("TRANSFERRED");
    assertThat(row.get("reversible").asBoolean()).isFalse();
    assertThat(row.get("correctable").asBoolean()).isFalse();

    undoTransfer(w, transfer);
    row = byId(list(w, null, PAYMENTS)).get(payment);
    assertThat(row.get("transferred").asBoolean()).isFalse();
    assertThat(row.get("correctable").asBoolean()).isTrue();
  }

  // --- yardımcılar

  private static Map<String, Object> instrument(String kind, String number) {
    return Map.of(
        "kind",
        kind,
        "number",
        number,
        "bankName",
        "Test Bankası",
        "dueDate",
        TODAY.plusDays(30).toString());
  }

  /** Döviz bozumu kaynağı kullanımı (SettlementCorrectionIT deseni; şema nitelikli SQL). */
  private void seedFxUse(World w, String fund, String collection, String used) throws Exception {
    String target =
        bankFund(w, "HEDEF-" + UUID.randomUUID().toString().substring(0, 6), w.a1(), "TRY");
    UUID transfer =
        insert(
            w,
            "fund_transfer",
            Map.of(
                "company_id",
                w.companyAId(),
                "transfer_type",
                "FX_EXCHANGE",
                "transfer_date",
                TODAY,
                "source_fund_id",
                UUID.fromString(fund),
                "source_currency",
                "USD",
                "target_fund_id",
                UUID.fromString(target),
                "target_currency",
                "TRY",
                "rate",
                new BigDecimal("30"),
                "rate_operation",
                "MULTIPLY"));
    insert(
        w,
        "fund_transfer_source",
        Map.of(
            "transfer_id",
            transfer,
            "company_id",
            w.companyAId(),
            "source_kind",
            "SETTLEMENT",
            "settlement_id",
            UUID.fromString(collection),
            "used_amount",
            new BigDecimal(used)));
  }

  /** Benzersiz cari adı (arama testleri başka carinin adıyla kısmi eşleşmesin). */
  private void rename(World w, UUID account, String name) {
    update(w, "update %s.account set name = ? where id = ?", name, account);
  }

  private String accountName(World w, UUID account) {
    return jdbc.queryForObject(
        "select name from \"%s\".account where id = ?".formatted(w.schema()),
        String.class,
        account);
  }

  private ResultActions listCall(World w, String token, String path, String... params)
      throws Exception {
    MockHttpServletRequestBuilder request = get(path);
    for (int i = 0; i < params.length; i += 2) {
      request.param(params[i], params[i + 1]);
    }
    return send(w.t(), token, request);
  }

  private JsonNode list(World w, String token, String path, String... params) throws Exception {
    return body(listCall(w, token, path, params).andExpect(status().isOk()));
  }

  /** İkinci sayfa 100 satır, ilk sayfayla kesişmez; birleşim 600 farklı kayıt. */
  private void disjointPages(World w, List<String> firstPage, String... secondParams)
      throws Exception {
    List<String> secondPage = ids(list(w, null, PAYMENTS, secondParams));
    assertThat(firstPage).hasSize(500);
    assertThat(secondPage).hasSize(100);
    assertThat(firstPage).doesNotContainAnyElementsOf(secondPage);
    Set<String> all = new HashSet<>(firstPage);
    all.addAll(secondPage);
    assertThat(all).hasSize(600);
  }

  private static List<String> ids(JsonNode page) {
    List<String> ids = new ArrayList<>();
    page.get("content").forEach(row -> ids.add(row.get("id").asText()));
    return ids;
  }

  private static Map<String, JsonNode> byId(JsonNode page) {
    Map<String, JsonNode> map = new HashMap<>();
    page.get("content").forEach(row -> map.put(row.get("id").asText(), row));
    return map;
  }
}
