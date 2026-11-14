package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Eksik fatura (12.2 §3.7, §4.6, K-12.2-4): defter tabanlı fatura toplamı, yansıtılmayan belgeler,
 * tevkifat, cari taşıma, açılış, iki taraf, şirket kırılımı ve cari listesi ucu.
 */
class InvoiceCoverageIT extends AccountTestSupport {

  private static final String GAPS = FINANCE + "/accounts/invoice-gaps";

  @Test
  void kullaniciOrnegiVeFaturaTurleri() throws Exception {
    World w = world("ica");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    // 150 faturasız borç + 100'lük yansıtılmayan alış faturası → eksik 50.
    manual(w, supplier, w.a1(), Direction.CREDIT, "150", "TRY");
    Map<String, Object> hidden = doc("PAYABLE", "ALIS_FATURASI", "100", w.a1());
    hidden.put("reflectToLedger", false);
    hidden.put("tax", Map.of("vatRate", 0));
    document(w, supplier, hidden);
    JsonNode a = payable(w, supplier, w.companyA());
    assertThat(a.get("ledgerTotal").decimalValue()).isEqualByComparingTo("150");
    assertThat(a.get("invoiceTotal").decimalValue()).isEqualByComparingTo("100");
    assertThat(a.get("missing").decimalValue()).isEqualByComparingTo("50");
    assertThat(
            balances(w, supplier).get("payableInvoiceTotals").get(0).get("amount").decimalValue())
        .isEqualByComparingTo("100");

    // Alış faturası kendi borcunu kapsar: eksik değişmez.
    Map<String, Object> invoice = new HashMap<>();
    invoice.put("accountId", supplier);
    invoice.put("branchId", w.a1());
    invoice.put("number", "PI-1");
    invoice.put("invoiceDate", TODAY.toString());
    invoice.put("dueDate", TODAY.plusDays(30).toString());
    invoice.put("net", Map.of("amount", "100", "currency", "TRY"));
    invoice.put("vat", Map.of("amount", "20", "currency", "TRY"));
    id(sendJson(w.t(), null, post(FINANCE + "/purchase-invoices"), invoice));
    assertThat(payable(w, supplier, w.companyA()).get("missing").decimalValue())
        .isEqualByComparingTo("50");

    // Sevk İrsaliyesi fatura sayılmaz (eksik büyür), Yurt Dışı Fatura sayılır (değişmez).
    document(w, supplier, doc("PAYABLE", "SEVK_IRSALIYESI", "30", w.a1()));
    assertThat(payable(w, supplier, w.companyA()).get("missing").decimalValue())
        .isEqualByComparingTo("80");
    document(w, supplier, doc("PAYABLE", "YURT_DISI_FATURA", "40", w.a1()));
    JsonNode afterForeign = payable(w, supplier, w.companyA());
    assertThat(afterForeign.get("missing").decimalValue()).isEqualByComparingTo("80");
    assertThat(afterForeign.get("ledgerTotal").decimalValue()).isEqualByComparingTo("340");

    // Açılış bakiyesi hesaba girmez; açılış faturası fatura sayılır.
    ledgerRow(w, supplier, w.a1(), w.companyA(), "CREDIT", "500", "OPENING");
    assertThat(payable(w, supplier, w.companyA()).get("missing").decimalValue())
        .isEqualByComparingTo("80");
    ledgerRow(w, supplier, w.a1(), w.companyA(), "CREDIT", "60", "OPENING_INVOICE");
    JsonNode withOpening = payable(w, supplier, w.companyA());
    assertThat(withOpening.get("ledgerTotal").decimalValue()).isEqualByComparingTo("400");
    assertThat(withOpening.get("missing").decimalValue()).isEqualByComparingTo("80");

    // Ters kayıt düşer: 150'lik faturasız borç ters çevrilince eksik kalmaz, fazla −70 olur.
    UUID manualTx =
        jdbc.queryForObject(
            ("select id from \"%s\".account_transaction where account_id = ?"
                    + " and source_type = 'MANUAL'")
                .formatted(w.schema()),
            UUID.class,
            supplier);
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/accounts/transactions/" + manualTx + "/reverse"),
            Map.of("date", TODAY.toString(), "description", "Ters"))
        .andExpect(status().isOk());
    JsonNode reversed = payable(w, supplier, w.companyA());
    assertThat(reversed.get("missing").decimalValue()).isEqualByComparingTo("-70");

    // Müşteride payableInvoiceTotals boş; invoiceGaps yine döner.
    UUID customer = account(w, AccountType.CUSTOMER, null);
    manual(w, customer, w.a1(), Direction.CREDIT, "10", "TRY");
    JsonNode customerBalances = balances(w, customer);
    assertThat(customerBalances.get("payableInvoiceTotals")).isEmpty();
    assertThat(customerBalances.get("invoiceGaps")).isNotEmpty();
  }

  @Test
  void tevkifatliBelgeDefterTabaniyla() throws Exception {
    World w = world("icb");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    // KDV dahil 120, stopaj 20 → deftere 100.
    Map<String, Object> withheld = doc("PAYABLE", "ALIS_FATURASI", "100", w.a1());
    withheld.put("tax", Map.of("vatRate", 20, "withholdingAmount", 20));
    document(w, supplier, withheld);
    JsonNode only = payable(w, supplier, w.companyA());
    assertThat(only.get("ledgerTotal").decimalValue()).isEqualByComparingTo("100");
    assertThat(only.get("invoiceTotal").decimalValue()).isEqualByComparingTo("100");
    assertThat(only.get("missing").decimalValue()).isEqualByComparingTo("0");

    manual(w, supplier, w.a1(), Direction.CREDIT, "50", "TRY");
    assertThat(payable(w, supplier, w.companyA()).get("missing").decimalValue())
        .isEqualByComparingTo("50");

    // Yansıtılmayan tevkifatlı belge net ödenecek tutarıyla sayılır (100, KDV dahil 120 değil).
    Map<String, Object> hidden = doc("PAYABLE", "ALIS_FATURASI", "100", w.a1());
    hidden.put("reflectToLedger", false);
    hidden.put("tax", Map.of("vatRate", 20, "withholdingAmount", 20));
    document(w, supplier, hidden);
    JsonNode covered = payable(w, supplier, w.companyA());
    assertThat(covered.get("invoiceTotal").decimalValue()).isEqualByComparingTo("200");
    assertThat(covered.get("missing").decimalValue()).isEqualByComparingTo("-50");
  }

  @Test
  void tasinmisFaturaliHareketYeniCariyeDuser() throws Exception {
    World w = world("icc");
    UUID from = account(w, AccountType.SUPPLIER, null);
    UUID to = account(w, AccountType.SUPPLIER, null);
    JsonNode created = document(w, from, doc("PAYABLE", "ALIS_FATURASI", "100", w.a1()));
    String transactionId = created.get("transactionId").asText();
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/account-transfers"),
            Map.of(
                "fromAccountId",
                from.toString(),
                "toAccountId",
                to.toString(),
                "transactionIds",
                List.of(transactionId)))
        .andExpect(status().isCreated());
    JsonNode fromGaps = balances(w, from).get("invoiceGaps");
    for (JsonNode row : fromGaps) {
      assertThat(row.get("missing").decimalValue()).isEqualByComparingTo("0");
    }
    JsonNode toRow = payable(w, to, w.companyA());
    assertThat(toRow.get("ledgerTotal").decimalValue()).isEqualByComparingTo("100");
    assertThat(toRow.get("invoiceTotal").decimalValue()).isEqualByComparingTo("100");
    assertThat(toRow.get("missing").decimalValue()).isEqualByComparingTo("0");
  }

  @Test
  void alacakTarafiSirketKirilimiVeListeUcu() throws Exception {
    World w = world("icd");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    // Navlun faturası (120) kendi alacağını kapsar; faturasız 80 alacak A'da, 30 B'de.
    UUID shipment = shipment(w, customer, w.a1());
    sendJson(
            w.t(),
            null,
            post("/api/v1/shipment/shipments/" + shipment + "/invoice"),
            Map.of("invoiceDate", TODAY.toString(), "dueDate", TODAY.plusDays(30).toString()))
        .andExpect(status().isCreated());
    manual(w, customer, w.a1(), Direction.DEBIT, "80", "TRY");
    manual(w, customer, w.b1(), Direction.DEBIT, "30", "TRY");
    // Satış faturası belgesi (yansıtılmayan 20) A'nın eksiğini 60'a indirir.
    Map<String, Object> sale = doc("RECEIVABLE", "SATIS_FATURASI", "20", w.a1());
    sale.put("reflectToLedger", false);
    sale.put("tax", Map.of("vatRate", 0));
    document(w, customer, sale);

    JsonNode breakdown = balances(w, customer);
    Map<String, JsonNode> rows = new HashMap<>();
    for (JsonNode row : breakdown.get("invoiceGaps")) {
      assertThat(row.get("side").asText()).isEqualTo("RECEIVABLE");
      rows.put(row.get("companyId").isNull() ? "ALL" : row.get("companyId").asText(), row);
    }
    assertThat(rows.get(w.companyA()).get("ledgerTotal").decimalValue())
        .isEqualByComparingTo("200");
    assertThat(rows.get(w.companyA()).get("invoiceTotal").decimalValue())
        .isEqualByComparingTo("140");
    assertThat(rows.get(w.companyA()).get("missing").decimalValue()).isEqualByComparingTo("60");
    assertThat(rows.get(w.companyB()).get("missing").decimalValue()).isEqualByComparingTo("30");
    assertThat(rows.get("ALL").get("missing").decimalValue()).isEqualByComparingTo("90");
    assertThat(breakdown.get("receivableInvoiceTotals").get(0).get("amount").decimalValue())
        .isEqualByComparingTo("140");
    assertThat(breakdown.get("payableInvoiceTotals")).isEmpty();

    // Tolerans 1: tam 1 birimlik fark listede yok.
    UUID tolerant = account(w, AccountType.CUSTOMER, null);
    manual(w, tolerant, w.a1(), Direction.DEBIT, "1", "TRY");
    // Personel carisi: izinsiz kullanıcıda satır yok.
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    manual(w, employee, w.a1(), Direction.CREDIT, "45", "TRY");

    List<JsonNode> all = gaps(w, null, Map.of());
    assertThat(accounts(all)).contains(customer.toString(), employee.toString());
    assertThat(accounts(all)).doesNotContain(tolerant.toString());
    JsonNode consolidated = find(all, customer, "RECEIVABLE");
    assertThat(consolidated.get("companyId").isNull()).isTrue();
    assertThat(consolidated.get("missing").decimalValue()).isEqualByComparingTo("90");

    List<JsonNode> onlyB = gaps(w, null, Map.of("companyId", w.companyB()));
    JsonNode bRow = find(onlyB, customer, "RECEIVABLE");
    assertThat(bRow.get("companyId").asText()).isEqualTo(w.companyB());
    assertThat(bRow.get("missing").decimalValue()).isEqualByComparingTo("30");
    assertThat(accounts(onlyB)).doesNotContain(employee.toString());

    List<JsonNode> payableOnly = gaps(w, null, Map.of("side", "PAYABLE"));
    assertThat(payableOnly).allMatch(row -> "PAYABLE".equals(row.get("side").asText()));
    assertThat(accounts(payableOnly)).contains(employee.toString());

    String finance = userWithRole(w, "finans", "FINANCE");
    assertThat(accounts(gaps(w, finance, Map.of()))).doesNotContain(employee.toString());

    // LIMITED kullanıcı yalnız kendi iş yerlerinin satırlarını görür.
    String limited = limitedUser(w, "sinirli", "FINANCE", List.of(w.b1()));
    JsonNode limitedRow = find(gaps(w, limited, Map.of()), customer, "RECEIVABLE");
    assertThat(limitedRow.get("missing").decimalValue()).isEqualByComparingTo("30");
    send(w.t(), limited, get(GAPS).param("companyId", w.companyA()))
        .andExpect(status().isForbidden());

    // Belge türleri countsAsInvoice taşır.
    Map<String, Boolean> flags = new HashMap<>();
    for (JsonNode type :
        body(
            send(w.t(), null, get(FINANCE + "/account-document-types").param("side", "PAYABLE"))
                .andExpect(status().isOk()))) {
      flags.put(type.get("code").asText(), type.get("countsAsInvoice").asBoolean());
    }
    assertThat(flags)
        .containsEntry("ALIS_FATURASI", true)
        .containsEntry("YURT_DISI_FATURA", true)
        .containsEntry("SEVK_IRSALIYESI", false);
  }

  // --- yardımcılar

  private static Map<String, Object> doc(String side, String type, String amount, String branch) {
    Map<String, Object> body = new HashMap<>();
    body.put("side", side);
    body.put("documentType", type);
    body.put("documentNo", "BLG-" + UUID.randomUUID().toString().substring(0, 8));
    body.put("documentDate", TODAY.toString());
    body.put("amount", amount);
    body.put("currency", "TRY");
    body.put("paymentMethod", "BANK");
    body.put("branchId", branch);
    return body;
  }

  private JsonNode document(World w, UUID account, Map<String, Object> body) throws Exception {
    return body(
        sendJson(w.t(), null, post(FINANCE + "/accounts/" + account + "/documents"), body)
            .andExpect(status().isCreated()));
  }

  private JsonNode balances(World w, UUID account) throws Exception {
    return body(
        send(w.t(), null, get(FINANCE + "/accounts/" + account + "/balances"))
            .andExpect(status().isOk()));
  }

  /** {@code /balances} invoiceGaps'te şirketin TRY PAYABLE satırı. */
  private JsonNode payable(World w, UUID account, String companyId) throws Exception {
    for (JsonNode row : balances(w, account).get("invoiceGaps")) {
      if ("PAYABLE".equals(row.get("side").asText())
          && companyId.equals(row.get("companyId").asText(null))
          && "TRY".equals(row.get("currency").asText())) {
        return row;
      }
    }
    throw new AssertionError("PAYABLE satırı yok: " + account);
  }

  private List<JsonNode> gaps(World w, String token, Map<String, String> params) throws Exception {
    MockHttpServletRequestBuilder request = get(GAPS);
    params.forEach(request::param);
    List<JsonNode> rows = new ArrayList<>();
    body(send(w.t(), token, request).andExpect(status().isOk())).forEach(rows::add);
    return rows;
  }

  private static List<String> accounts(List<JsonNode> rows) {
    return rows.stream().map(row -> row.get("accountId").asText()).toList();
  }

  private static JsonNode find(List<JsonNode> rows, UUID account, String side) {
    return rows.stream()
        .filter(
            row ->
                account.toString().equals(row.get("accountId").asText())
                    && side.equals(row.get("side").asText()))
        .findFirst()
        .orElseThrow(() -> new AssertionError("Satır yok: " + account));
  }

  /** Doğrudan defter satırı (açılış bakiyesi / açılış faturası içe aktarımı yerine). */
  private void ledgerRow(
      World w,
      UUID account,
      String branch,
      String company,
      String direction,
      String amount,
      String sourceType) {
    Timestamp now = Timestamp.from(Instant.now());
    jdbc.update(
        ("insert into \"%s\".account_transaction (id, account_id, branch_id, company_id,"
                + " direction, amount, currency, exchange_rate, rate_date, tl_amount,"
                + " transaction_date, description, source_type, source_id, created_by, created_at,"
                + " updated_by, updated_at) values (?, ?, ?::uuid, ?::uuid, ?, ?::numeric, 'TRY',"
                + " 1, ?, ?::numeric, ?, 'Açılış', ?, ?, 'test', ?, 'test', ?)")
            .formatted(w.schema()),
        UUID.randomUUID(),
        account,
        branch,
        company,
        direction,
        amount,
        java.sql.Date.valueOf(TODAY),
        amount,
        java.sql.Date.valueOf(TODAY),
        sourceType,
        UUID.randomUUID(),
        now,
        now);
  }

  private UUID shipment(World w, UUID customer, String branch) {
    UUID id = UUID.randomUUID();
    Timestamp now = Timestamp.from(Instant.now());
    jdbc.update(
        "insert into \"%s\".shipment (id, number, account_id, branch_id, status, origin,"
                .formatted(w.schema())
            + " destination, planned_pickup, planned_delivery, currency, net_amount, vat_amount,"
            + " withholding_amount, total_amount, breakdown, created_by, created_at, updated_by,"
            + " updated_at) values (?, ?, ?, ?::uuid, 'DELIVERED', 'İstanbul', 'Ankara', ?, ?,"
            + " 'TRY', 100, 20, 0, 120, '{}', 'test', ?, 'test', ?)",
        id,
        "SV-" + id.toString().substring(0, 8),
        customer,
        branch,
        now,
        now,
        now,
        now);
    return id;
  }
}
