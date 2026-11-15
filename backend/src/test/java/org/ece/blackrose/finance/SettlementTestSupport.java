package org.ece.blackrose.finance;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Faz 12.2a ödeme/tahsilat yazım yolu IT'lerinin ortak yardımcıları (12.2a_TASARIM §6.2): istek
 * gövdeleri, ödeme/tahsilat/düzeltme/iptal/önizleme uçları, banka fonu, karşı taraf banka hesabı,
 * eşleştirme hedefleri (alış faturası API'den; navlun/depo/açılış faturası ve cari belgesi şema
 * nitelikli SQL ile) ve plan ödemesi.
 */
public abstract class SettlementTestSupport extends AccountTestSupport {

  protected static final String PAYMENTS = FINANCE + "/payments";
  protected static final String COLLECTIONS = FINANCE + "/collections";
  protected static final String SETTLEMENTS = FINANCE + "/settlements";

  // --- gövdeler

  /** Nakit/banka ödeme veya tahsilat gövdesi (TRY, bugün); ödemede uyarı onaylı. */
  protected static Map<String, Object> body(
      String method, UUID account, String branch, String fund, String amount) {
    Map<String, Object> body = new HashMap<>();
    body.put("method", method);
    if (account != null) {
      body.put("accountId", account.toString());
    }
    body.put("branchId", branch);
    if (fund != null) {
      body.put("fundAccountId", fund);
    }
    body.put("money", Map.of("amount", amount, "currency", "TRY"));
    body.put("date", TODAY.toString());
    body.put("confirmWarnings", true);
    return body;
  }

  protected static Map<String, Object> allocation(String type, Object targetId, String amount) {
    return Map.of("targetType", type, "targetId", targetId.toString(), "amount", amount);
  }

  protected static Map<String, Object> withAllocations(
      Map<String, Object> body, List<Map<String, Object>> allocations) {
    body.put("allocations", allocations);
    return body;
  }

  // --- uçlar

  protected ResultActions pay(World w, String token, Map<String, Object> body, String key)
      throws Exception {
    return sendJson(w.t(), token, keyed(post(PAYMENTS), key), body);
  }

  protected ResultActions collect(World w, String token, Map<String, Object> body, String key)
      throws Exception {
    return sendJson(w.t(), token, keyed(post(COLLECTIONS), key), body);
  }

  protected ResultActions correct(
      World w, String token, Object id, String reason, Map<String, Object> replacement, String key)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    if (reason != null) {
      body.put("reason", reason);
    }
    body.put("replacement", replacement);
    return sendJson(w.t(), token, keyed(post(SETTLEMENTS + "/" + id + "/correct"), key), body);
  }

  protected ResultActions reverse(
      World w, String token, Object id, LocalDate date, String description) throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("date", date.toString());
    if (description != null) {
      body.put("description", description);
    }
    return sendJson(w.t(), token, post(SETTLEMENTS + "/" + id + "/reverse"), body);
  }

  protected ResultActions check(
      World w, String token, String type, Object correctsId, Map<String, Object> body)
      throws Exception {
    MockHttpServletRequestBuilder request = post(SETTLEMENTS + "/check").param("type", type);
    if (correctsId != null) {
      request.param("correctsSettlementId", correctsId.toString());
    }
    return sendJson(w.t(), token, request, body);
  }

  private static MockHttpServletRequestBuilder keyed(
      MockHttpServletRequestBuilder request, String key) {
    return key == null ? request : request.header("Idempotency-Key", key);
  }

  // --- veri

  /** Eksiye düşebilen banka fonu. */
  protected String bankFund(World w, String code, String branch, String currency) throws Exception {
    return id(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/funds"),
            Map.of(
                "code",
                code,
                "name",
                code,
                "kind",
                "BANK",
                "currency",
                currency,
                "branchId",
                branch,
                "allowNegative",
                true)));
  }

  /** Eksiye düşemeyen kasa. */
  protected String strictCash(World w, String code, String branch) throws Exception {
    return id(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/funds"),
            Map.of(
                "code",
                code,
                "name",
                code,
                "kind",
                "CASH",
                "currency",
                "TRY",
                "branchId",
                branch,
                "allowNegative",
                false)));
  }

  protected void setFundActive(World w, String fund, boolean active) throws Exception {
    sendJson(w.t(), null, patch(FINANCE + "/funds/" + fund + "/active"), Map.of("active", active))
        .andExpect(status().isOk());
  }

  /** Carinin hesap numaralı (IBAN'sız) banka hesabı. */
  protected String counterpartyBank(World w, UUID account, String number) throws Exception {
    return id(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/accounts/" + account + "/bank-accounts"),
            Map.of(
                "bankName",
                "Test Bankası",
                "currency",
                "TRY",
                "category",
                "MAIN",
                "accountNumber",
                number)));
  }

  /** Gider kalemi (doğrudan gider ödemesi için). */
  protected String expenseItem(World w, String code) throws Exception {
    String type =
        id(
            sendJson(
                w.t(),
                null,
                post(FINANCE + "/expense-types"),
                Map.of("code", "T" + code, "name", "Genel " + code)));
    return id(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/expense-items"),
            Map.of("expenseTypeId", type, "code", code, "name", "Kalem " + code)));
  }

  protected String vehicle(World w, String plate) throws Exception {
    return id(
        sendJson(
            w.t(),
            null,
            post("/api/v1/fleet/vehicles"),
            Map.of("plate", plate, "kind", "TRUCK", "ownership", "OWNED", "status", "ACTIVE")));
  }

  /** Fondan doğrudan ödenen (carisiz settlement'lı) araç gideri; gider kimliği döner. */
  protected String vehicleExpense(
      World w, String vehicle, String branch, String fund, String amount) throws Exception {
    Map<String, Object> expense = new HashMap<>();
    expense.put("kind", "REPAIR");
    expense.put("date", TODAY.toString());
    expense.put("branchId", branch);
    expense.put("fundAccountId", fund);
    expense.put("money", Map.of("amount", amount, "currency", "TRY"));
    return id(
        sendJson(w.t(), null, post("/api/v1/fleet/vehicles/" + vehicle + "/expenses"), expense));
  }

  /** Araç giderinin ödeme kaydı. */
  protected UUID settlementOfExpense(World w, String expense) {
    return jdbc.queryForObject(
        "select settlement_id from \"%s\".vehicle_expense where id = ?::uuid".formatted(w.schema()),
        UUID.class,
        expense);
  }

  /** Denetim kaydı sayısı (olay + hedef). */
  protected long audits(World w, String event, String target) {
    return count(
        w, "select count(*) from %s.audit_log where event_type = ? and target = ?", event, target);
  }

  /** API ile alış faturası (KDV'siz); toplamı kadar plan açılır. */
  protected UUID purchaseInvoice(World w, UUID supplier, String branch, String total)
      throws Exception {
    return UUID.fromString(
        id(
            sendJson(
                w.t(),
                null,
                post(FINANCE + "/purchase-invoices"),
                Map.of(
                    "accountId",
                    supplier.toString(),
                    "branchId",
                    branch,
                    "number",
                    "AF-" + UUID.randomUUID().toString().substring(0, 8),
                    "invoiceDate",
                    TODAY.toString(),
                    "dueDate",
                    TODAY.plusDays(30).toString(),
                    "net",
                    Map.of("amount", total, "currency", "TRY"),
                    "vat",
                    Map.of("amount", "0", "currency", "TRY")))));
  }

  /** Alış faturasının (tek) planı. */
  protected UUID planOf(World w, UUID purchaseInvoice) {
    return jdbc.queryForObject(
        "select id from \"%s\".payment_plan where purchase_invoice_id = ?".formatted(w.schema()),
        UUID.class,
        purchaseInvoice);
  }

  /** Elle plan (DRAFT). */
  protected UUID manualPlan(World w, UUID account, String branch, String amount) throws Exception {
    return UUID.fromString(
        id(
            sendJson(
                w.t(),
                null,
                post(FINANCE + "/payment-plans"),
                Map.of(
                    "accountId",
                    account.toString(),
                    "branchId",
                    branch,
                    "money",
                    Map.of("amount", amount, "currency", "TRY"),
                    "dueDate",
                    TODAY.plusDays(10).toString()))));
  }

  /** Planı gönderir, onaylar (öz onay açık) ve verilen fondan öder; ödeme kaydı kimliği döner. */
  protected UUID payPlan(World w, UUID plan, String fund, String method) throws Exception {
    send(
            w.t(),
            null,
            put(FINANCE + "/settings")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"allowSelfApproval\":true}"))
        .andExpect(status().isOk());
    send(w.t(), null, post(FINANCE + "/payment-plans/" + plan + "/submit"))
        .andExpect(status().isOk());
    sendJson(w.t(), null, post(FINANCE + "/payment-plans/" + plan + "/approve"), Map.of())
        .andExpect(status().isOk());
    JsonNode paid =
        body(
            sendJson(
                    w.t(),
                    null,
                    post(FINANCE + "/payment-plans/" + plan + "/pay"),
                    Map.of("method", method, "fundAccountId", fund, "date", TODAY.toString()))
                .andExpect(status().isOk()));
    return UUID.fromString(paid.get("id").asText());
  }

  protected UUID freightInvoice(
      World w, UUID customer, String branch, String company, String total, String currency) {
    UUID shipment =
        insert(
            w,
            "shipment",
            Map.of(
                "number",
                "SEV-" + UUID.randomUUID().toString().substring(0, 8),
                "account_id",
                customer,
                "branch_id",
                UUID.fromString(branch)));
    return insert(
        w,
        "freight_invoice",
        Map.of(
            "number",
            "NF-" + UUID.randomUUID().toString().substring(0, 8),
            "shipment_id",
            shipment,
            "account_id",
            customer,
            "branch_id",
            UUID.fromString(branch),
            "company_id",
            UUID.fromString(company),
            "total_amount",
            new BigDecimal(total),
            "currency",
            currency,
            "status",
            "ISSUED"));
  }

  protected UUID warehouseInvoice(
      World w, UUID customer, String branch, String company, String total) {
    UUID warehouse =
        insert(
            w,
            "warehouse",
            Map.of(
                "code",
                "D-" + UUID.randomUUID().toString().substring(0, 8),
                "name",
                "Depo",
                "branch_id",
                UUID.fromString(branch)));
    UUID contract =
        insert(
            w,
            "warehouse_contract",
            Map.of("account_id", customer, "warehouse_id", warehouse, "currency", "TRY"));
    return insert(
        w,
        "warehouse_invoice",
        Map.of(
            "number",
            "DF-" + UUID.randomUUID().toString().substring(0, 8),
            "contract_id",
            contract,
            "account_id",
            customer,
            "branch_id",
            UUID.fromString(branch),
            "company_id",
            UUID.fromString(company),
            "total_amount",
            new BigDecimal(total),
            "currency",
            "TRY",
            "status",
            "ISSUED"));
  }

  protected UUID openingInvoice(
      World w, UUID account, String branch, String company, String kind, String total, UUID plan) {
    Map<String, Object> values = new HashMap<>();
    values.put("account_id", account);
    values.put("branch_id", UUID.fromString(branch));
    values.put("company_id", UUID.fromString(company));
    values.put("kind", kind);
    values.put("number", "AC-" + UUID.randomUUID().toString().substring(0, 8));
    values.put("total_amount", new BigDecimal(total));
    values.put("currency", "TRY");
    values.put("status", "OPEN");
    if (plan != null) {
      values.put("payment_plan_id", plan);
    }
    return insert(w, "opening_invoice", values);
  }

  /** Fatura sayılan (ya da sayılmayan) türde cari belgesi; deftere yansıyan tutar = tutar. */
  protected UUID accountDocument(
      World w,
      UUID account,
      String branch,
      String company,
      String side,
      String type,
      String amount) {
    return accountDocument(w, account, branch, company, side, type, amount, true, amount, null);
  }

  /**
   * Cari belgesi; yansımayan belgede {@code ledger_amount} NULL (V28 CHECK). {@code netPayable}
   * verilirse vergi satırı ({@code account_document_tax}) eklenir.
   */
  protected UUID accountDocument(
      World w,
      UUID account,
      String branch,
      String company,
      String side,
      String type,
      String amount,
      boolean reflect,
      String ledgerAmount,
      String netPayable) {
    Map<String, Object> values = new HashMap<>();
    values.put("account_id", account);
    values.put("branch_id", UUID.fromString(branch));
    values.put("company_id", UUID.fromString(company));
    values.put("side", side);
    values.put("document_type", type);
    values.put("document_no", "BE-" + UUID.randomUUID().toString().substring(0, 8));
    values.put("document_date", TODAY);
    values.put("amount", new BigDecimal(amount));
    values.put("currency", "TRY");
    values.put("payment_method", "BANK");
    values.put("reflect_to_ledger", reflect);
    if (ledgerAmount != null) {
      values.put("ledger_amount", new BigDecimal(ledgerAmount));
    }
    values.put("status", "OPEN");
    UUID document = insert(w, "account_document", values);
    if (netPayable != null) {
      // Tablonun kimlik kolonu yok (anahtar document_id): insert() yerine doğrudan SQL.
      BigDecimal gross = new BigDecimal(amount);
      update(
          w,
          "insert into %s.account_document_tax (document_id, gross_amount, net_excl_vat,"
              + " total_incl_vat, net_payable, created_by, created_at, updated_by, updated_at,"
              + " deleted) values (?, ?, ?, ?, ?, 'test', now(), 'test', now(), false)",
          document,
          gross,
          gross,
          gross,
          new BigDecimal(netPayable));
    }
    return document;
  }

  // --- SQL yardımcıları

  protected long count(World w, String sql, Object... args) {
    return jdbc.queryForObject(sql.replace("%s", "\"" + w.schema() + "\""), Long.class, args);
  }

  protected Map<String, Object> row(World w, String sql, Object... args) {
    return jdbc.queryForMap(sql.replace("%s", "\"" + w.schema() + "\""), args);
  }

  protected int update(World w, String sql, Object... args) {
    return jdbc.update(sql.replace("%s", "\"" + w.schema() + "\""), args);
  }

  /** Cari bakiyesi (TRY, borç − alacak). */
  protected BigDecimal accountNet(World w, UUID account) {
    return jdbc.queryForObject(
        ("select coalesce(sum(case when direction = 'DEBIT' then amount else -amount end), 0)"
                + " from \"%s\".account_transaction where account_id = ? and deleted = false")
            .formatted(w.schema()),
        BigDecimal.class,
        account);
  }

  /** Fon bakiyesi (giriş − çıkış). */
  protected BigDecimal fundNet(World w, String fund) {
    return jdbc.queryForObject(
        ("select coalesce(sum(case when direction = 'IN' then amount else -amount end), 0)"
                + " from \"%s\".fund_transaction where fund_account_id = ?::uuid"
                + " and deleted = false")
            .formatted(w.schema()),
        BigDecimal.class,
        fund);
  }

  /** Settlement'ın cari satırı. */
  protected UUID ledgerLine(World w, Object settlement) {
    return jdbc.queryForObject(
        ("select id from \"%s\".account_transaction where source_type = 'SETTLEMENT'"
                + " and source_id = ?::uuid")
            .formatted(w.schema()),
        UUID.class,
        settlement.toString());
  }

  /** Cari taşıma (patron); taşıma kimliği döner. */
  protected String transferLine(World w, UUID from, UUID to, UUID transaction) throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("fromAccountId", from.toString());
    body.put("toAccountId", to.toString());
    body.put("transactionIds", List.of(transaction.toString()));
    return id(sendJson(w.t(), null, post(FINANCE + "/account-transfers"), body));
  }

  protected void undoTransfer(World w, String transfer) throws Exception {
    sendJson(w.t(), null, post(FINANCE + "/account-transfers/" + transfer + "/reverse"), Map.of())
        .andExpect(status().isOk());
  }

  protected static List<String> texts(JsonNode array) {
    List<String> values = new ArrayList<>();
    array.forEach(node -> values.add(node.asText()));
    return values;
  }

  /**
   * Şema nitelikli satır ekler; verilmeyen, varsayılansız NOT NULL kolonlar sahte değerle dolar
   * (SettlementMigrationIT deseni). {@code id} verilmezse üretilir ve döner.
   */
  protected UUID insert(World w, String table, Map<String, Object> values) {
    Map<String, Object> row = new LinkedHashMap<>(values);
    row.putIfAbsent("id", UUID.randomUUID());
    List<Map<String, Object>> columns =
        jdbc.queryForList(
            """
            select column_name, data_type, character_maximum_length
            from information_schema.columns
            where table_schema = ? and table_name = ? and is_nullable = 'NO'
              and column_default is null
            order by ordinal_position
            """,
            w.schema(),
            table);
    for (Map<String, Object> column : columns) {
      String name = (String) column.get("column_name");
      if (!row.containsKey(name)) {
        row.put(
            name,
            dummy(name, (String) column.get("data_type"), column.get("character_maximum_length")));
      }
    }
    List<String> names = new ArrayList<>(row.keySet());
    jdbc.update(
        "insert into \"%s\".%s (%s) values (%s)"
            .formatted(
                w.schema(),
                table,
                String.join(", ", names),
                names.stream().map(n -> "?").collect(Collectors.joining(", "))),
        row.values().toArray());
    return (UUID) row.get("id");
  }

  private static Object dummy(String name, String type, Object length) {
    return switch (type) {
      case "uuid" -> UUID.randomUUID();
      case "character varying", "text" -> "X";
      case "character" ->
          name.equals("currency") ? "TRY" : "X".repeat(((Number) length).intValue());
      case "numeric", "integer", "bigint", "smallint" -> 1;
      case "boolean" -> false;
      case "date" -> TODAY;
      case "timestamp with time zone" -> Timestamp.from(Instant.now());
      default -> throw new IllegalArgumentException(name + " için sahte değer yok: " + type);
    };
  }
}
