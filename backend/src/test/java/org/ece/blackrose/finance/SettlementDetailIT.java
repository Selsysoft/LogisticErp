package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
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
 * Ödeme/tahsilat detayı ve okuma uçları (12.2a §3.7, §3.9, §3.10, §6.2 {@code SettlementDetailIT}):
 * defter satırları, çek, plan, eşleşmeler, maskeli fon IBAN'ı, ekstre eşleşmesi, 404/403, SEC-07
 * kapsam maskesi, açık fatura kalemleri, çek/plan süzgeçleri ve kaynak rotaları.
 */
class SettlementDetailIT extends SettlementTestSupport {

  private static final String IBAN = "TR330006100519786457841326";

  @Test
  void detayAlanlari() throws Exception {
    World w = world("sd1");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    update(w, "update %s.fund_account set iban = ? where id = ?::uuid", IBAN, bank);
    UUID invoice = freightInvoice(w, customer, w.a1(), w.companyA(), "100", "TRY");
    Map<String, Object> request =
        withAllocations(
            body("BANK", customer, w.a1(), bank, "150"),
            List.of(allocation("FREIGHT_INVOICE", invoice, "60")));
    request.put("documentNo", "DK-9");
    String collection = id(collect(w, null, request, null));

    JsonNode detail = detail(w, null, collection);
    assertThat(detail.get("item").get("id").asText()).isEqualTo(collection);
    assertThat(detail.get("item").get("documentNo").asText()).isEqualTo("DK-9");
    assertThat(detail.get("fundIbanMasked").asText()).isEqualTo("TR33 **** 1326");
    assertThat(detail.get("bankStatementMatched").asBoolean()).isFalse();
    assertThat(detail.get("instrument").isNull()).isTrue();
    assertThat(detail.get("plan").isNull()).isTrue();
    assertThat(ledgers(detail)).containsExactlyInAnyOrder("ACCOUNT:CREDIT:false", "FUND:IN:false");
    JsonNode allocation = detail.get("allocations").get(0);
    assertThat(allocation.get("targetType").asText()).isEqualTo("FREIGHT_INVOICE");
    assertThat(allocation.get("targetId").asText()).isEqualTo(invoice.toString());
    assertThat(allocation.get("targetTypeName").asText()).isEqualTo("Navlun Faturası");
    assertThat(allocation.get("targetNumber").asText()).startsWith("NF-");
    assertThat(allocation.get("money").get("amount").asText()).isEqualTo("60.0000");
    assertThat(allocation.get("active").asBoolean()).isTrue();
    assertThat(allocation.get("targetCancelled").asBoolean()).isFalse();
    assertThat(allocation.get("outOfScope").asBoolean()).isFalse();

    // Ekstre eşleşmesi (yalnız bilgi).
    UUID fundTx =
        jdbc.queryForObject(
            ("select id from \"%s\".fund_transaction where source_type = 'SETTLEMENT'"
                    + " and source_id = ?::uuid")
                .formatted(w.schema()),
            UUID.class,
            collection);
    insert(
        w,
        "bank_statement_line",
        Map.of(
            "fund_account_id",
            UUID.fromString(bank),
            "line_date",
            TODAY,
            "amount",
            new java.math.BigDecimal("150"),
            "external_key",
            "EXT-1",
            "matched_transaction_id",
            fundTx,
            "status",
            "MATCHED"));
    assertThat(detail(w, null, collection).get("bankStatementMatched").asBoolean()).isTrue();

    // İptal: ters satırlar, eşleşme etkin değil, hedef iptali rozeti.
    reverse(w, null, collection, TODAY, "Hatalı").andExpect(status().isOk());
    // Yalnız kaydın iptali (hedef açık) eşleşmeyi pasifler.
    JsonNode reversedOnly = detail(w, null, collection).get("allocations").get(0);
    assertThat(reversedOnly.get("active").asBoolean()).isFalse();
    assertThat(reversedOnly.get("targetCancelled").asBoolean()).isFalse();
    update(w, "update %s.freight_invoice set status = 'CANCELLED' where id = ?", invoice);
    detail = detail(w, null, collection);
    assertThat(ledgers(detail))
        .containsExactlyInAnyOrder(
            "ACCOUNT:CREDIT:false", "FUND:IN:false", "ACCOUNT:DEBIT:true", "FUND:OUT:true");
    assertThat(detail.get("item").get("status").asText()).isEqualTo("REVERSED");
    allocation = detail.get("allocations").get(0);
    assertThat(allocation.get("active").asBoolean()).isFalse();
    assertThat(allocation.get("targetCancelled").asBoolean()).isTrue();

    // Çekli tahsilat ve plan ödemesi.
    Map<String, Object> check = body("CHECK", customer, w.a1(), null, "70");
    check.put(
        "instrument",
        Map.of("kind", "CHECK", "number", "5555555", "dueDate", TODAY.plusDays(30).toString()));
    String checkCollection = id(collect(w, null, check, null));
    JsonNode checkDetail = detail(w, null, checkCollection);
    assertThat(checkDetail.get("instrument").get("number").asText()).isEqualTo("5555555");
    assertThat(checkDetail.get("fundIbanMasked").isNull()).isTrue();
    assertThat(ledgers(checkDetail)).containsExactly("ACCOUNT:CREDIT:false");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    UUID plan = manualPlan(w, supplier, w.a1(), "20");
    UUID planPayment = payPlan(w, plan, bank, "BANK");
    assertThat(detail(w, null, planPayment.toString()).get("plan").get("id").asText())
        .isEqualTo(plan.toString());

    // 404: yok ve izinsiz kullanıcıya personel carisi (aynı kod); 403: kapsam dışı.
    expect(call(w, null, SETTLEMENTS + "/" + UUID.randomUUID()), 404, "SETTLEMENT_NOT_FOUND");
    String finance = userWithRole(w, "finans", "FINANCE");
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    String employeePayment =
        id(pay(w, null, body("CASH", employee, w.a1(), w.fundA1(), "5"), null));
    expect(call(w, finance, SETTLEMENTS + "/" + employeePayment), 404, "SETTLEMENT_NOT_FOUND");
    detail(w, null, employeePayment);
    String a2User = limitedUser(w, "a2", "FINANCE", List.of(w.a2()));
    expect(call(w, a2User, SETTLEMENTS + "/" + collection), 403, "BRANCH_OUT_OF_SCOPE");
  }

  @Test
  void kapsamDisiHedefVeFonGizlenir() throws Exception {
    World w = world("sd2");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    String bankA2 = bankFund(w, "BANKA-A2", w.a2(), "TRY");
    update(w, "update %s.fund_account set iban = ? where id = ?::uuid", IBAN, bankA2);
    UUID a2Invoice = freightInvoice(w, customer, w.a2(), w.companyA(), "100", "TRY");
    UUID a1Invoice = freightInvoice(w, customer, w.a1(), w.companyA(), "100", "TRY");
    // ALL kullanıcı: X = A1 iş yerindeki kayıt, Y = A2'deki fatura ve fon.
    String collection =
        id(
            collect(
                w,
                null,
                withAllocations(
                    body("BANK", customer, w.a1(), bankA2, "90"),
                    List.of(
                        allocation("FREIGHT_INVOICE", a2Invoice, "40"),
                        allocation("FREIGHT_INVOICE", a1Invoice, "50"))),
                null));
    String a1User = limitedUser(w, "a1", "FINANCE", List.of(w.a1()));

    JsonNode limited = detail(w, a1User, collection);
    assertThat(limited.get("fundIbanMasked").isNull()).isTrue();
    assertThat(limited.get("item").get("fundName").asText()).isEqualTo("BANKA-A2");
    Map<String, JsonNode> byAmount = byAmount(limited.get("allocations"));
    JsonNode hidden = byAmount.get("40.0000");
    assertThat(hidden.get("outOfScope").asBoolean()).isTrue();
    for (String field :
        List.of("targetId", "targetNumber", "targetTypeName", "invoiceDate", "dueDate")) {
      assertThat(hidden.get(field).isNull()).as(field).isTrue();
    }
    assertThat(hidden.get("targetType").asText()).isEqualTo("FREIGHT_INVOICE");
    assertThat(hidden.get("active").asBoolean()).isTrue();
    JsonNode shown = byAmount.get("50.0000");
    assertThat(shown.get("outOfScope").asBoolean()).isFalse();
    assertThat(shown.get("targetId").asText()).isEqualTo(a1Invoice.toString());

    JsonNode all = detail(w, null, collection);
    assertThat(all.get("fundIbanMasked").asText()).isEqualTo("TR33 **** 1326");
    assertThat(byAmount(all.get("allocations")).get("40.0000").get("outOfScope").asBoolean())
        .isFalse();
  }

  @Test
  void acikFaturaKalemleri() throws Exception {
    World w = world("sd3");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID late = freightInvoice(w, customer, w.a1(), w.companyA(), "100", "TRY");
    UUID early = freightInvoice(w, customer, w.a2(), w.companyA(), "100", "TRY");
    UUID undated =
        accountDocument(w, customer, w.a1(), w.companyA(), "RECEIVABLE", "SATIS_FATURASI", "70");
    UUID notInvoice =
        accountDocument(w, customer, w.a1(), w.companyA(), "RECEIVABLE", "DIGER", "10");
    UUID usd = freightInvoice(w, customer, w.a1(), w.companyA(), "100", "USD");
    UUID otherCompany = freightInvoice(w, customer, w.b1(), w.companyB(), "100", "TRY");
    UUID receivable = openingInvoice(w, customer, w.a1(), w.companyA(), "RECEIVABLE", "30", null);
    UUID payable = openingInvoice(w, customer, w.a1(), w.companyA(), "PAYABLE", "30", null);
    update(w, "update %s.freight_invoice set due_date = ? where id = ?", TODAY.plusDays(20), late);
    update(w, "update %s.freight_invoice set due_date = ? where id = ?", TODAY.plusDays(5), early);
    update(
        w,
        "update %s.opening_invoice set due_date = ? where id = ?",
        TODAY.plusDays(10),
        receivable);
    String collection =
        id(
            collect(
                w,
                null,
                withAllocations(
                    body("CASH", customer, w.a1(), w.fundA1(), "40"),
                    List.of(allocation("FREIGHT_INVOICE", late, "40"))),
                null));

    JsonNode open = openInvoices(w, null, "COLLECTION", customer, w.a1(), "TRY", null);
    assertThat(open.findValuesAsText("id"))
        .containsExactly(
            early.toString(), receivable.toString(), late.toString(), undated.toString())
        .doesNotContain(
            notInvoice.toString(), usd.toString(), otherCompany.toString(), payable.toString());
    JsonNode lateRow = open.get(2);
    assertThat(lateRow.get("total").asText()).isEqualTo("100.0000");
    assertThat(lateRow.get("allocated").asText()).isEqualTo("40.0000");
    assertThat(lateRow.get("remaining").asText()).isEqualTo("60.0000");
    assertThat(lateRow.get("typeName").asText()).isEqualTo("Navlun Faturası");
    assertThat(lateRow.get("companyId").asText()).isEqualTo(w.companyA());
    assertThat(open.get(3).get("dueDate").isNull()).isTrue();
    assertThat(open.get(3).get("targetType").asText()).isEqualTo("ACCOUNT_DOCUMENT");
    // Düzeltme önizlemesi: eski kaydın eşleşmesi serbest.
    JsonNode freed = openInvoices(w, null, "COLLECTION", customer, w.a1(), "TRY", collection);
    assertThat(freed.get(2).get("remaining").asText()).isEqualTo("100.0000");
    // Ödeme tarafı: açılış (PAYABLE).
    JsonNode payables = openInvoices(w, null, "PAYMENT", customer, w.a1(), "TRY", null);
    assertThat(payables.size()).isEqualTo(1);
    assertThat(payables.get(0).get("id").asText()).isEqualTo(payable.toString());
    // Para birimi süzgeci (küçük harf de kabul).
    assertThat(
            openInvoices(w, null, "COLLECTION", customer, w.a1(), "usd", null)
                .get(0)
                .get("id")
                .asText())
        .isEqualTo(usd.toString());
    // LIMITED: yalnız görünür iş yerlerinin kalemleri; kapsam dışı iş yeri 403.
    String a1User = limitedUser(w, "a1", "FINANCE", List.of(w.a1()));
    JsonNode limited = openInvoices(w, a1User, "COLLECTION", customer, w.a1(), "TRY", null);
    assertThat(limited.findValuesAsText("id")).doesNotContain(early.toString()).hasSize(3);
    expect(
        call(w, a1User, openPath("COLLECTION", customer, w.a2(), "TRY", null)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    // Personel carisi izinsiz kullanıcıya 404.
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    expect(
        call(w, a1User, openPath("PAYMENT", employee, w.a1(), "TRY", null)),
        404,
        "ACCOUNT_NOT_FOUND");

    // En çok 200 satır, en eski vade önce.
    for (int i = 0; i < 201; i++) {
      openingInvoice(w, customer, w.a1(), w.companyA(), "PAYABLE", "1", null);
    }
    JsonNode many = openInvoices(w, null, "PAYMENT", customer, w.a1(), "TRY", null);
    assertThat(many.size()).isEqualTo(200);
  }

  @Test
  void cekVePlanSuzgecleri() throws Exception {
    World w = world("sd4");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    Map<String, Object> check = body("CHECK", customer, w.a1(), null, "70");
    check.put(
        "instrument",
        Map.of("kind", "CHECK", "number", "1231231", "dueDate", TODAY.plusDays(30).toString()));
    String received =
        body(collect(w, null, check, null).andExpect(status().isCreated()))
            .get("instrumentId")
            .asText();
    Map<String, Object> note = body("CHECK", customer, w.a1(), null, "80");
    note.put(
        "instrument",
        Map.of("kind", "NOTE", "number", "S-1", "dueDate", TODAY.plusDays(30).toString()));
    collect(w, null, note, null).andExpect(status().isCreated());
    Map<String, Object> issued = body("CHECK", supplier, w.a1(), null, "90");
    issued.put(
        "instrument",
        Map.of("kind", "CHECK", "number", "3213213", "dueDate", TODAY.plusDays(30).toString()));
    pay(w, null, issued, null).andExpect(status().isCreated());

    JsonNode endorsable =
        page(
            w,
            FINANCE + "/instruments",
            "status",
            "PORTFOLIO",
            "direction",
            "RECEIVED",
            "kind",
            "CHECK",
            "companyId",
            w.companyA());
    assertThat(endorsable.get("content").findValuesAsText("id")).containsExactly(received);
    assertThat(
            page(w, FINANCE + "/instruments", "direction", "ISSUED").get("totalElements").asInt())
        .isEqualTo(1);
    assertThat(page(w, FINANCE + "/instruments", "kind", "NOTE").get("totalElements").asInt())
        .isEqualTo(1);
    assertThat(page(w, FINANCE + "/instruments").get("totalElements").asInt()).isEqualTo(3);

    UUID draft = manualPlan(w, supplier, w.a1(), "10");
    UUID other = manualPlan(w, account(w, AccountType.SUPPLIER, null), w.a1(), "11");
    UUID paid = manualPlan(w, supplier, w.a1(), "12");
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    payPlan(w, paid, bank, "BANK");
    assertThat(
            page(w, FINANCE + "/payment-plans", "accountId", supplier.toString())
                .get("content")
                .findValuesAsText("id"))
        .containsExactlyInAnyOrder(draft.toString(), paid.toString());
    assertThat(
            page(
                    w,
                    FINANCE + "/payment-plans",
                    "accountId",
                    supplier.toString(),
                    "statuses",
                    "DRAFT",
                    "statuses",
                    "PENDING")
                .get("content")
                .findValuesAsText("id"))
        .containsExactly(draft.toString());
    // Eski tekil status ile çoklu statuses birleşimi.
    assertThat(
            page(w, FINANCE + "/payment-plans", "status", "PAID", "statuses", "DRAFT")
                .get("content")
                .findValuesAsText("id"))
        .containsExactlyInAnyOrder(draft.toString(), other.toString(), paid.toString());
    assertThat(page(w, FINANCE + "/payment-plans", "status", "PAID").get("totalElements").asInt())
        .isEqualTo(1);
    String finance = userWithRole(w, "finans", "FINANCE");
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    expect(
        call(w, finance, FINANCE + "/payment-plans?accountId=" + employee),
        404,
        "ACCOUNT_NOT_FOUND");
  }

  @Test
  void kaynakRotalariVeCariHareketAlanlari() throws Exception {
    World w = world("sd5");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    UUID customer = account(w, AccountType.CUSTOMER, null);
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    Map<String, Object> card = body("BANK", supplier, w.a1(), bank, "30");
    card.put("channel", "CREDIT_CARD");
    card.put("documentNo", "KK-7");
    String payment = id(pay(w, null, card, null));
    Map<String, Object> note = body("CHECK", customer, w.a1(), null, "40");
    note.put(
        "instrument",
        Map.of("kind", "NOTE", "number", "S-9", "dueDate", TODAY.plusDays(30).toString()));
    String collection = id(collect(w, null, note, null));
    String cash = id(collect(w, null, body("CASH", customer, w.a1(), w.fundA1(), "5"), null));
    UUID vehiclePayment =
        settlementOfExpense(w, vehicleExpense(w, vehicle(w, "06SD05"), w.a1(), w.fundA1(), "12"));

    // Cari Hareketler: belge no ve görünen ödeme şekli.
    JsonNode supplierRows =
        page(w, FINANCE + "/account-transactions", "accountId", supplier.toString());
    JsonNode cardRow = supplierRows.get("content").get(0);
    assertThat(cardRow.get("documentNo").asText()).isEqualTo("KK-7");
    assertThat(cardRow.get("paymentMethod").asText()).isEqualTo("CREDIT_CARD");
    Map<String, String> customerMethods = new HashMap<>();
    page(w, FINANCE + "/account-transactions", "accountId", customer.toString())
        .get("content")
        .forEach(
            row ->
                customerMethods.put(
                    row.get("sourceId").asText(), row.get("paymentMethod").asText()));
    assertThat(customerMethods).containsEntry(collection, "NOTE").containsEntry(cash, "CASH");

    // Kaynak rotaları: cari hareketi ve banka/kasa hareketi ZTO sayfalarına.
    String paymentLine = ledgerLine(w, payment).toString();
    assertThat(
            body(send(
                        w.t(),
                        null,
                        get(FINANCE + "/accounts/transactions/" + paymentLine + "/source"))
                    .andExpect(status().isOk()))
                .get("route")
                .asText())
        .isEqualTo("/zto-finans/odemeler?settlementId=" + payment);
    String collectionLine = ledgerLine(w, collection).toString();
    assertThat(
            body(send(
                        w.t(),
                        null,
                        get(FINANCE + "/accounts/transactions/" + collectionLine + "/source"))
                    .andExpect(status().isOk()))
                .get("route")
                .asText())
        .isEqualTo("/zto-finans/tahsilatlar?settlementId=" + collection);
    assertThat(fundRoute(w, cash)).isEqualTo("/zto-finans/tahsilatlar?settlementId=" + cash);
    assertThat(fundRoute(w, payment)).isEqualTo("/zto-finans/odemeler?settlementId=" + payment);
    assertThat(fundRoute(w, vehiclePayment.toString())).isEqualTo("/fleet/vehicles");
    Map<String, Object> direct = body("CASH", null, w.a1(), w.fundA1(), "8");
    direct.put("expenseItemId", expenseItem(w, "GD1"));
    String directPayment = id(pay(w, null, direct, null));
    assertThat(fundRoute(w, directPayment))
        .isEqualTo("/zto-finans/odemeler?settlementId=" + directPayment);
  }

  // --- yardımcılar

  private String fundRoute(World w, String settlement) throws Exception {
    UUID tx =
        jdbc.queryForObject(
            ("select id from \"%s\".fund_transaction where source_type = 'SETTLEMENT'"
                    + " and source_id = ?::uuid")
                .formatted(w.schema()),
            UUID.class,
            settlement);
    return body(send(w.t(), null, get(FINANCE + "/funds/transactions/" + tx))
            .andExpect(status().isOk()))
        .get("source")
        .get("route")
        .asText();
  }

  private JsonNode detail(World w, String token, String id) throws Exception {
    return body(call(w, token, SETTLEMENTS + "/" + id).andExpect(status().isOk()));
  }

  private ResultActions call(World w, String token, String path) throws Exception {
    return send(w.t(), token, get(path));
  }

  private JsonNode page(World w, String path, String... params) throws Exception {
    MockHttpServletRequestBuilder request = get(path);
    for (int i = 0; i < params.length; i += 2) {
      request.param(params[i], params[i + 1]);
    }
    return body(send(w.t(), null, request).andExpect(status().isOk()));
  }

  private static String openPath(
      String type, UUID account, String branch, String currency, String exclude) {
    return SETTLEMENTS
        + "/open-invoices?type="
        + type
        + "&accountId="
        + account
        + "&branchId="
        + branch
        + "&currency="
        + currency
        + (exclude == null ? "" : "&excludeSettlementId=" + exclude);
  }

  private JsonNode openInvoices(
      World w,
      String token,
      String type,
      UUID account,
      String branch,
      String currency,
      String exclude)
      throws Exception {
    return body(
        call(w, token, openPath(type, account, branch, currency, exclude))
            .andExpect(status().isOk()));
  }

  /** {@code ledger:direction:reversal} anahtarları. */
  private static List<String> ledgers(JsonNode detail) {
    List<String> keys = new ArrayList<>();
    detail
        .get("lines")
        .forEach(
            line ->
                keys.add(
                    line.get("ledger").asText()
                        + ":"
                        + line.get("direction").asText()
                        + ":"
                        + line.get("reversal").asBoolean()));
    return keys;
  }

  private static Map<String, JsonNode> byAmount(JsonNode allocations) {
    Map<String, JsonNode> map = new HashMap<>();
    allocations.forEach(a -> map.put(a.get("money").get("amount").asText(), a));
    return map;
  }
}
