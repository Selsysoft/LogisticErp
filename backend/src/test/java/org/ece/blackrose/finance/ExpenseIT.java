package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Tek masraf modeli (12.7 §3.2, §3.5, §3.6, §6.2): Cari ve Nakit masraf, hesap kuralları, defter
 * etkisi, idempotency, iptal, düzeltme (anahtar, belge taşıma, ileri tarih), kaynak kilidi, eksik
 * fatura, ekstre kaynağı, okuma uçları, doğrulamalar, şirket/LIMITED/kiracı izolasyonu ve izinler.
 */
class ExpenseIT extends SettlementTestSupport {

  private static final String EXPENSES = FINANCE + "/expenses";

  @Test
  void cariMasrafHesapDefterIdempotencyIptalVeDuzeltme() throws Exception {
    World w = world("ex1");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    String item = expenseItem(w, "OFIS");

    // 2 satır: (2 × 100, %10 iskonto, %20 KDV, tevkifat 6, diğer 4) + (1 × 50, %10 KDV).
    List<Map<String, Object>> lines =
        List.of(line("2", "100", "10", "20", "6", "4"), line("1", "50", null, "10", null, null));
    Map<String, Object> body = account(w, item, supplier, "ALIS_FATURASI", TODAY, lines);
    JsonNode created =
        body(
            sendJson(w.t(), null, keyed(post(EXPENSES), "EX1-A"), body)
                .andExpect(status().isCreated()));
    String id = created.get("id").asText();
    assertThat(dec(created.get("subTotal"))).isEqualByComparingTo("250");
    assertThat(dec(created.get("discountAmount"))).isEqualByComparingTo("20");
    assertThat(dec(created.get("netAmount"))).isEqualByComparingTo("230");
    assertThat(dec(created.get("vatAmount"))).isEqualByComparingTo("41");
    assertThat(dec(created.get("withholdingAmount"))).isEqualByComparingTo("6");
    assertThat(dec(created.get("otherTaxAmount"))).isEqualByComparingTo("4");
    assertThat(dec(created.get("totalAmount"))).isEqualByComparingTo("269");
    assertThat(dec(created.get("tlAmount"))).isEqualByComparingTo("269");
    assertThat(created.get("status").asText()).isEqualTo("POSTED");
    assertThat(created.get("companyId").asText()).isEqualTo(w.companyA());
    assertThat(created.get("supplierName").asText()).startsWith("Cari ");
    assertThat(created.get("lines")).hasSize(2);
    assertThat(dec(created.get("lines").get(0).get("totalAmount"))).isEqualByComparingTo("214");

    // Tek CREDIT EXPENSE hareketi; aynı anahtar aynı kayıt.
    assertThat(expenseTx(w, id)).isEqualTo(1);
    assertThat(accountNet(w, supplier)).isEqualByComparingTo("-269");
    JsonNode replay =
        body(
            sendJson(w.t(), null, keyed(post(EXPENSES), "EX1-A"), body)
                .andExpect(status().isCreated()));
    assertThat(replay.get("id").asText()).isEqualTo(id);
    assertThat(count(w, "select count(*) from %s.expense")).isEqualTo(1);
    assertThat(audits(w, "EXPENSE_CREATED", "EXPENSE:" + id)).isEqualTo(1);

    // Ekstre kaynağı: etiket ve kalem rotası.
    UUID tx =
        jdbc.queryForObject(
            ("select id from \"%s\".account_transaction where source_type = 'EXPENSE'"
                    + " and source_id = ?::uuid")
                .formatted(w.schema()),
            UUID.class,
            id);
    JsonNode source =
        body(
            send(w.t(), null, get(FINANCE + "/accounts/transactions/" + tx + "/source"))
                .andExpect(status().isOk()));
    assertThat(source.get("label").asText()).startsWith("Genel masraf");
    assertThat(source.get("route").asText()).isEqualTo("/zto-finans/genel-masraflar/kalem/" + item);

    // Eksik fatura: ALIS_FATURASI fatura sayılır, KASA_FISI sayılmaz.
    assertThat(payableGap(w, supplier).get("missing").decimalValue()).isEqualByComparingTo("0");
    String receipt =
        id(
            sendJson(
                w.t(),
                null,
                post(EXPENSES),
                account(w, item, supplier, "KASA_FISI", TODAY, List.of(simple("100")))));
    JsonNode gap = payableGap(w, supplier);
    assertThat(gap.get("ledgerTotal").decimalValue()).isEqualByComparingTo("369");
    assertThat(gap.get("missing").decimalValue()).isEqualByComparingTo("100");

    // Belge: FINANCE_MANAGE yükler; yalnız FINANCE_VIEW yükleyemez.
    byte[] content = "fatura".getBytes(StandardCharsets.UTF_8);
    upload(w, null, id, content).andExpect(status().isCreated());
    String viewer = userWithRole(w, "muhasebe", "ACCOUNTING");
    upload(w, viewer, id, content).andExpect(status().isForbidden());
    send(w.t(), viewer, get(EXPENSES + "/" + id)).andExpect(status().isOk());

    // Okuma uçları: liste, özet, takvim, aylık.
    JsonNode page =
        body(
            send(w.t(), null, get(EXPENSES).param("expenseItemId", item))
                .andExpect(status().isOk()));
    assertThat(page.get("totalElements").asLong()).isEqualTo(2);
    JsonNode first = rowOf(page, id);
    assertThat(first.get("hasDocument").asBoolean()).isTrue();
    assertThat(first.get("branchName").asText()).isEqualTo("A1 Merkez");
    assertThat(first.get("contextType").asText()).isEqualTo("GENERAL");
    JsonNode summary =
        body(send(w.t(), null, get(EXPENSES + "/summary")).andExpect(status().isOk()));
    assertThat(summary).hasSize(1);
    assertThat(summary.get(0).get("invoiceCount").asLong()).isEqualTo(2);
    assertThat(dec(summary.get(0).get("totals").get(0).get("totalAmount")))
        .isEqualByComparingTo("369");
    assertThat(summary.get(0).get("lastSupplierAccountId").asText()).isEqualTo(supplier.toString());
    assertThat(texts(summary.get(0).get("branchNames"))).containsExactly("A1 Merkez");
    JsonNode calendar =
        body(
            send(
                    w.t(),
                    null,
                    get(EXPENSES + "/calendar")
                        .param("year", String.valueOf(TODAY.getYear()))
                        .param("month", String.valueOf(TODAY.getMonthValue())))
                .andExpect(status().isOk()));
    assertThat(calendar.get("days")).hasSize(1);
    assertThat(calendar.get("days").get(0).get("expenses")).hasSize(2);
    assertThat(calendar.get("allTime").get(0).get("count").asLong()).isEqualTo(2);
    JsonNode monthly =
        body(send(w.t(), null, get(EXPENSES + "/monthly")).andExpect(status().isOk()));
    assertThat(dec(monthly.get(0).get("tlAmount"))).isEqualByComparingTo("369");
    send(w.t(), null, get(EXPENSES + "/monthly").param("months", "0"))
        .andExpect(status().isBadRequest());

    // Düzeltme: eski REVERSED, yeni kayıt zinciri; belge taşınır; aynı anahtar aynı yeni kayıt.
    Map<String, Object> revise =
        Map.of(
            "expense",
            account(w, item, supplier, "ALIS_FATURASI", TODAY, List.of(simple("300"))),
            "reason",
            "Tutar hatası",
            "removeDocument",
            false);
    JsonNode revised =
        body(
            sendJson(w.t(), null, keyed(post(EXPENSES + "/" + id + "/revise"), "EX1-R"), revise)
                .andExpect(status().isCreated()));
    String newId = revised.get("id").asText();
    assertThat(revised.get("replacesExpenseId").asText()).isEqualTo(id);
    assertThat(row(w, "select status, deleted from %s.expense where id = ?::uuid", id))
        .containsEntry("status", "REVERSED")
        .containsEntry("deleted", true);
    assertThat(reversals(w, id)).isEqualTo(1);
    assertThat(files(w, newId)).isEqualTo(1);
    assertThat(files(w, id)).isZero();
    JsonNode again =
        body(
            sendJson(w.t(), null, keyed(post(EXPENSES + "/" + id + "/revise"), "EX1-R"), revise)
                .andExpect(status().isCreated()));
    assertThat(again.get("id").asText()).isEqualTo(newId);
    assertThat(reversals(w, id)).isEqualTo(1);
    expect(
        sendJson(w.t(), null, keyed(post(EXPENSES + "/" + receipt + "/revise"), "EX1-R"), revise),
        409,
        "IDEMPOTENCY_KEY_REUSED");
    expect(
        sendJson(w.t(), null, keyed(post(EXPENSES + "/" + id + "/revise"), "EX1-R2"), revise),
        409,
        "EXPENSE_ALREADY_REVERSED");
    assertThat(accountNet(w, supplier)).isEqualByComparingTo("-400");
    assertThat(audits(w, "EXPENSE_REVISED", "EXPENSE:" + newId)).isEqualTo(1);

    // removeDocument=true: belge eski kayıtta kalır.
    upload(w, null, receipt, content).andExpect(status().isCreated());
    Map<String, Object> drop = new HashMap<>(revise);
    drop.put("removeDocument", true);
    String receiptNew = id(sendJson(w.t(), null, post(EXPENSES + "/" + receipt + "/revise"), drop));
    assertThat(files(w, receipt)).isEqualTo(1);
    assertThat(files(w, receiptNew)).isZero();

    // İptal: tarih fatura tarihinden önce 400; REVERSAL yazılır; ikinci çağrı 200; listeden düşer.
    expect(
        sendJson(
            w.t(),
            null,
            post(EXPENSES + "/" + newId + "/reverse"),
            Map.of("date", TODAY.minusDays(1).toString(), "reason", "x")),
        400,
        "REVERSE_DATE_INVALID");
    Map<String, Object> reverse = Map.of("date", TODAY.toString(), "reason", "Mükerrer");
    JsonNode reversed =
        body(
            sendJson(w.t(), null, post(EXPENSES + "/" + newId + "/reverse"), reverse)
                .andExpect(status().isOk()));
    assertThat(reversed.get("status").asText()).isEqualTo("REVERSED");
    assertThat(reversed.get("reverseReason").asText()).isEqualTo("Mükerrer");
    sendJson(w.t(), null, post(EXPENSES + "/" + newId + "/reverse"), reverse)
        .andExpect(status().isOk());
    assertThat(reversals(w, newId)).isEqualTo(1);
    assertThat(
            body(send(w.t(), null, get(EXPENSES)).andExpect(status().isOk()))
                .get("totalElements")
                .asLong())
        .isEqualTo(1);
    assertThat(accountNet(w, supplier)).isEqualByComparingTo("-300");

    // İleri tarihli masraf düzeltilir; ters kayıt tarihi fatura tarihidir.
    LocalDate future = TODAY.plusDays(5);
    String futureId =
        id(
            sendJson(
                w.t(),
                null,
                post(EXPENSES),
                account(w, item, supplier, "ALIS_FATURASI", future, List.of(simple("10")))));
    Map<String, Object> futureRevise =
        Map.of(
            "expense",
            account(w, item, supplier, "ALIS_FATURASI", future, List.of(simple("12"))),
            "reason",
            "Düzeltme",
            "removeDocument",
            false);
    sendJson(w.t(), null, post(EXPENSES + "/" + futureId + "/revise"), futureRevise)
        .andExpect(status().isCreated());
    assertThat(
            row(w, "select reversed_on from %s.expense where id = ?::uuid", futureId)
                .get("reversed_on"))
        .isEqualTo(java.sql.Date.valueOf(future));

    // Döviz: elle kur 30 ile TL karşılığı.
    Map<String, Object> usd =
        account(w, item, supplier, "ALIS_FATURASI", TODAY, List.of(simple("10")));
    usd.put("currency", "USD");
    usd.put("exchangeRate", "30");
    JsonNode usdExpense =
        body(sendJson(w.t(), null, post(EXPENSES), usd).andExpect(status().isCreated()));
    assertThat(dec(usdExpense.get("tlAmount"))).isEqualByComparingTo("300");
    assertThat(dec(usdExpense.get("exchangeRate"))).isEqualByComparingTo("30");
  }

  /** R-12.7-2: pasifleştirilen kalemli masraf aynı kalemle düzeltilir; başka pasif kaleme 422. */
  @Test
  void pasifKalemliMasrafAyniKalemleDuzeltilir() throws Exception {
    World w = world("ex4");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    String item = expenseItem(w, "PSF");
    String other = expenseItem(w, "PSG");
    String id =
        id(
            sendJson(
                w.t(),
                null,
                post(EXPENSES),
                account(w, item, supplier, "ALIS_FATURASI", TODAY, List.of(simple("100")))));
    for (String passive : List.of(item, other)) {
      sendJson(
              w.t(),
              null,
              put(FINANCE + "/expense-items/" + passive + "/active"),
              Map.of("active", false))
          .andExpect(status().isOk());
    }
    JsonNode revised =
        body(
            sendJson(
                    w.t(),
                    null,
                    post(EXPENSES + "/" + id + "/revise"),
                    Map.of(
                        "expense",
                        account(w, item, supplier, "ALIS_FATURASI", TODAY, List.of(simple("120"))),
                        "reason",
                        "Tutar",
                        "removeDocument",
                        false))
                .andExpect(status().isCreated()));
    assertThat(revised.get("expenseItemId").asText()).isEqualTo(item);
    assertThat(dec(revised.get("totalAmount"))).isEqualByComparingTo("120");
    expect(
        sendJson(
            w.t(),
            null,
            post(EXPENSES + "/" + revised.get("id").asText() + "/revise"),
            Map.of(
                "expense",
                account(w, other, supplier, "ALIS_FATURASI", TODAY, List.of(simple("120"))),
                "reason",
                "Kalem",
                "removeDocument",
                false)),
        422,
        "EXPENSE_ITEM_INACTIVE");
    assertThat(accountNet(w, supplier)).isEqualByComparingTo("-120");
  }

  @Test
  void nakitMasrafSettlementKaynakKilidiVeOdemeIzni() throws Exception {
    World w = world("ex2");
    String item = expenseItem(w, "YEMEK");
    Map<String, Object> body = cash(w, item, w.fundA1(), "75");
    JsonNode created =
        body(sendJson(w.t(), null, post(EXPENSES), body).andExpect(status().isCreated()));
    String id = created.get("id").asText();
    UUID settlement = UUID.fromString(created.get("settlementId").asText());
    assertThat(created.get("fundAccountId").asText()).isEqualTo(w.fundA1());
    Map<String, Object> s =
        row(
            w,
            "select account_id, expense_item_id, idempotency_key, status from %s.settlement"
                + " where id = ?",
            settlement);
    assertThat(s.get("account_id")).isNull();
    assertThat(s.get("expense_item_id").toString()).isEqualTo(item);
    assertThat(s.get("idempotency_key")).isEqualTo("EXPENSE:" + id);
    assertThat(fundNet(w, w.fundA1())).isEqualByComparingTo("-75");
    assertThat(count(w, "select count(*) from %s.account_transaction")).isZero();

    // Ödemeler ekranından iptal ve düzeltme kaynak yönetimli: 409.
    reverse(w, null, settlement, TODAY, null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("SETTLEMENT_SOURCE_MANAGED"))
        .andExpect(jsonPath("$.details[0]").value("route=/zto-finans/genel-masraflar"));
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    expect(
        correct(w, null, settlement, "x", body("CASH", supplier, w.a1(), w.fundA1(), "10"), null),
        409,
        "SETTLEMENT_SOURCE_MANAGED");
    JsonNode payments =
        body(
            send(w.t(), null, get(PAYMENTS).param("companyId", w.companyA()))
                .andExpect(status().isOk()));
    JsonNode paymentRow = rowOf(payments, settlement.toString());
    assertThat(paymentRow.get("lockReason").asText()).isEqualTo("EXPENSE");
    assertThat(paymentRow.get("reversible").asBoolean()).isFalse();

    // Masraf iptali settlement'ı ters çevirir, fon sıfırlanır.
    sendJson(
            w.t(),
            null,
            post(EXPENSES + "/" + id + "/reverse"),
            Map.of("date", TODAY.toString(), "reason", "Hata"))
        .andExpect(status().isOk());
    assertThat(row(w, "select status from %s.settlement where id = ?", settlement))
        .containsEntry("status", "REVERSED");
    assertThat(fundNet(w, w.fundA1())).isEqualByComparingTo("0");

    // FINANCE_MANAGE var, FINANCE_PAYMENT_CREATE yok: Nakit 403, Cari serbest.
    role(w, "MASRAF", Set.of("FINANCE_VIEW", "FINANCE_MANAGE"));
    String manager = userWithRole(w, "masrafci", "MASRAF");
    expect(
        sendJson(w.t(), manager, post(EXPENSES), cash(w, item, w.fundA1(), "5")),
        403,
        "PAYMENT_PERMISSION_REQUIRED");
    String cashId = id(sendJson(w.t(), null, post(EXPENSES), cash(w, item, w.fundA1(), "5")));
    expect(
        sendJson(
            w.t(),
            manager,
            post(EXPENSES + "/" + cashId + "/reverse"),
            Map.of("date", TODAY.toString(), "reason", "x")),
        403,
        "PAYMENT_PERMISSION_REQUIRED");
    sendJson(
            w.t(),
            manager,
            post(EXPENSES),
            account(w, item, supplier, "ALIS_FATURASI", TODAY, List.of(simple("5"))))
        .andExpect(status().isCreated());
    String viewer = userWithRole(w, "muhasebe", "ACCOUNTING");
    sendJson(
            w.t(),
            viewer,
            post(EXPENSES),
            account(w, item, supplier, "ALIS_FATURASI", TODAY, List.of(simple("5"))))
        .andExpect(status().isForbidden());
  }

  @Test
  void dogrulamaSirketKapsamVeKiraciIzolasyonu() throws Exception {
    World w = world("ex3");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    String item = expenseItem(w, "GNL");

    Map<String, Object> wh =
        account(
            w,
            item,
            supplier,
            "ALIS_FATURASI",
            TODAY,
            List.of(line("1", "100", null, "10", "11", null)));
    expect(sendJson(w.t(), null, post(EXPENSES), wh), 400, "WITHHOLDING_EXCEEDS_VAT");
    String vehicleB = vehicle(w, "06EX03");
    update(w, "update %s.vehicle set branch_id = ?::uuid where id = ?::uuid", w.b1(), vehicleB);
    String vehicleFree = vehicle(w, "06EX04");
    Map<String, Object> general = base(w, item, supplier);
    general.put("vehicleId", vehicleFree);
    expect(sendJson(w.t(), null, post(EXPENSES), general), 400, "EXPENSE_CONTEXT_INVALID");
    Map<String, Object> withFund = base(w, item, supplier);
    withFund.put("fundAccountId", w.fundA1());
    expect(sendJson(w.t(), null, post(EXPENSES), withFund), 400, "EXPENSE_FUND_NOT_ALLOWED");
    expect(
        sendJson(
            w.t(), null, post(EXPENSES), base(w, item, account(w, AccountType.EMPLOYEE, null))),
        422,
        "EXPENSE_SUPPLIER_INVALID");
    Map<String, Object> badType = base(w, item, supplier);
    badType.put("documentType", "CEZA_BIZE");
    expect(sendJson(w.t(), null, post(EXPENSES), badType), 400, "DOCUMENT_TYPE_INVALID");

    // Şirket: B'nin aracı ve kasası A iş yerinde 422; şubesiz araç serbest.
    Map<String, Object> foreignVehicle = base(w, item, supplier);
    foreignVehicle.put("contextType", "VEHICLE");
    foreignVehicle.put("vehicleId", vehicleB);
    expect(sendJson(w.t(), null, post(EXPENSES), foreignVehicle), 422, "COMPANY_MISMATCH");
    expect(
        sendJson(w.t(), null, post(EXPENSES), cash(w, item, w.fundB1(), "5")),
        422,
        "COMPANY_MISMATCH");
    Map<String, Object> vehicleExpense = base(w, item, supplier);
    vehicleExpense.put("contextType", "VEHICLE");
    vehicleExpense.put("vehicleId", vehicleFree);
    JsonNode inA =
        body(sendJson(w.t(), null, post(EXPENSES), vehicleExpense).andExpect(status().isCreated()));
    assertThat(inA.get("contextLabel").asText()).isEqualTo("06EX04");
    String inA2 =
        id(sendJson(w.t(), null, post(EXPENSES), withBranch(base(w, item, supplier), w.a2())));
    String inB =
        id(sendJson(w.t(), null, post(EXPENSES), withBranch(base(w, item, supplier), w.b1())));
    List<String> companyA = ids(listOf(w, null, "companyId", w.companyA()));
    assertThat(companyA).contains(inA.get("id").asText(), inA2).doesNotContain(inB);
    JsonNode options =
        body(
            send(
                    w.t(),
                    null,
                    get(EXPENSES + "/context-options")
                        .param("type", "VEHICLE")
                        .param("q", "06ex")
                        .param("branchId", w.a1()))
                .andExpect(status().isOk()));
    assertThat(texts(labels(options))).containsExactly("06EX04");

    // LIMITED (A1): başka iş yerine yazamaz, yalnız A1'i görür.
    String limited = limitedUser(w, "sube", "FINANCE", List.of(w.a1()));
    sendJson(w.t(), limited, post(EXPENSES), withBranch(base(w, item, supplier), w.a2()))
        .andExpect(status().isForbidden());
    assertThat(ids(listOf(w, limited))).containsExactly(inA.get("id").asText());
    send(w.t(), limited, get(EXPENSES + "/" + inA2)).andExpect(status().isForbidden());
    send(w.t(), limited, get(EXPENSES).param("branchIds", w.a2()))
        .andExpect(status().isForbidden());
    sendJson(
            w.t(),
            limited,
            post(EXPENSES + "/" + inA2 + "/reverse"),
            Map.of("date", TODAY.toString(), "reason", "x"))
        .andExpect(status().isForbidden());
    upload(w, limited, inA2, "x".getBytes(StandardCharsets.UTF_8))
        .andExpect(status().isForbidden());

    // Kiracı izolasyonu.
    World other = world("ex3b");
    send(other.t(), null, get(EXPENSES + "/" + inB)).andExpect(status().isNotFound());
  }

  // --- yardımcılar

  private static MockHttpServletRequestBuilder keyed(MockHttpServletRequestBuilder r, String key) {
    return r.header("Idempotency-Key", key);
  }

  private static Map<String, Object> line(
      String qty, String price, String discount, String vat, String wh, String other) {
    Map<String, Object> line = new HashMap<>();
    line.put("description", "Satır");
    line.put("quantity", qty);
    line.put("unitPrice", price);
    line.put("discountRate", discount);
    line.put("vatRate", vat);
    line.put("withholdingAmount", wh);
    line.put("otherTaxAmount", other);
    return line;
  }

  private static Map<String, Object> simple(String amount) {
    return line("1", amount, null, "0", null, null);
  }

  private static Map<String, Object> account(
      World w,
      String item,
      UUID supplier,
      String documentType,
      LocalDate date,
      List<Map<String, Object>> lines) {
    Map<String, Object> body = new HashMap<>();
    body.put("branchId", w.a1());
    body.put("expenseItemId", item);
    body.put("contextType", "GENERAL");
    body.put("paymentMethod", "ACCOUNT");
    body.put("supplierAccountId", supplier.toString());
    body.put("invoiceNumber", "F-" + UUID.randomUUID().toString().substring(0, 6));
    body.put("invoiceDate", date.toString());
    body.put("documentType", documentType);
    body.put("department", "ADMIN");
    body.put("currency", "TRY");
    body.put("lines", lines);
    return body;
  }

  private static Map<String, Object> base(World w, String item, UUID supplier) {
    return account(w, item, supplier, "ALIS_FATURASI", TODAY, List.of(simple("20")));
  }

  private static Map<String, Object> cash(World w, String item, String fund, String amount) {
    Map<String, Object> body =
        account(w, item, UUID.randomUUID(), "KASA_FISI", TODAY, List.of(simple(amount)));
    body.remove("supplierAccountId");
    body.put("paymentMethod", "CASH");
    body.put("fundAccountId", fund);
    return body;
  }

  private static Map<String, Object> withBranch(Map<String, Object> body, String branch) {
    body.put("branchId", branch);
    return body;
  }

  private ResultActions upload(World w, String token, String owner, byte[] content)
      throws Exception {
    return send(
        w.t(),
        token,
        multipart("/api/v1/files")
            .file(new MockMultipartFile("file", "fatura.pdf", "application/octet-stream", content))
            .param("ownerType", "EXPENSE")
            .param("ownerId", owner));
  }

  private long files(World w, String owner) {
    return count(
        w,
        "select count(*) from %s.stored_file where owner_type = 'EXPENSE' and owner_id = ?::uuid"
            + " and deleted = false",
        owner);
  }

  private long expenseTx(World w, String id) {
    return count(
        w,
        "select count(*) from %s.account_transaction where source_type = 'EXPENSE'"
            + " and source_id = ?::uuid and direction = 'CREDIT'",
        id);
  }

  /** Masrafın cari hareketinin ters kayıt sayısı. */
  private long reversals(World w, String id) {
    return count(
        w,
        "select count(*) from %s.account_transaction r join %s.account_transaction t"
            + " on r.source_type = 'REVERSAL' and r.source_id = t.id"
            + " where t.source_type = 'EXPENSE' and t.source_id = ?::uuid",
        id);
  }

  private JsonNode payableGap(World w, UUID account) throws Exception {
    JsonNode balances =
        body(
            send(w.t(), null, get(FINANCE + "/accounts/" + account + "/balances"))
                .andExpect(status().isOk()));
    for (JsonNode row : balances.get("invoiceGaps")) {
      if ("PAYABLE".equals(row.get("side").asText())
          && w.companyA().equals(row.get("companyId").asText(null))
          && "TRY".equals(row.get("currency").asText())) {
        return row;
      }
    }
    throw new AssertionError("PAYABLE satırı yok: " + account);
  }

  private JsonNode listOf(World w, String token, String... params) throws Exception {
    MockHttpServletRequestBuilder request = get(EXPENSES);
    for (int i = 0; i < params.length; i += 2) {
      request.param(params[i], params[i + 1]);
    }
    return body(send(w.t(), token, request).andExpect(status().isOk()));
  }

  /** Masraf tutarları JSON'da ondalık metin (R-12.7-1); sayı gelirse test kırılır. */
  private static BigDecimal dec(JsonNode node) {
    assertThat(node.isTextual()).as("ondalık metin bekleniyor: %s", node).isTrue();
    return new BigDecimal(node.asText());
  }

  private static List<String> ids(JsonNode page) {
    List<String> ids = new ArrayList<>();
    page.get("content").forEach(row -> ids.add(row.get("id").asText()));
    return ids;
  }

  private static JsonNode rowOf(JsonNode page, String id) {
    for (JsonNode row : page.get("content")) {
      if (id.equals(row.get("id").asText())) {
        return row;
      }
    }
    throw new AssertionError("Satır yok: " + id);
  }

  private static JsonNode labels(JsonNode options) {
    com.fasterxml.jackson.databind.node.ArrayNode labels =
        com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode();
    options.forEach(o -> labels.add(o.get("label").asText()));
    return labels;
  }

  private void role(World w, String code, Set<String> permissions) throws Exception {
    sendJson(
            w.t(),
            null,
            post("/api/v1/identity/roles"),
            Map.of(
                "code",
                code,
                "name",
                code,
                "priority",
                5,
                "landingPath",
                "/finance",
                "permissions",
                permissions))
        .andExpect(status().isCreated());
  }
}
