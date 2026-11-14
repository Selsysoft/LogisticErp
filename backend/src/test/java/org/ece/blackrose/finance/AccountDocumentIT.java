package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Borç/Alacak Ekle belgesi: vergi, defter, tür kuralları, idempotency, iptal, revize, kapsam. */
class AccountDocumentIT extends AccountTestSupport {

  @Test
  void kayitVergiDefterVeTurKurallari() throws Exception {
    World w = world("adk");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID supplier = account(w, AccountType.SUPPLIER, null);

    // Alacak (Satış Faturası, KDV %20): istemci toplamı yok sayılır, net ödenecek deftere.
    Map<String, Object> sale = doc("RECEIVABLE", "SATIS_FATURASI", "1000", w.a1());
    sale.put("tax", Map.of("vatRate", 20, "netPayable", 1));
    JsonNode receivable =
        body(create(w, null, customer, sale, null).andExpect(status().isCreated()));
    assertThat(receivable.get("status").asText()).isEqualTo("OPEN");
    assertThat(receivable.get("ledgerAmount").decimalValue()).isEqualByComparingTo("1200");
    assertThat(receivable.get("tax").get("vatAmount").decimalValue()).isEqualByComparingTo("200");
    assertThat(receivable.get("documentTypeName").asText()).isEqualTo("Satış Faturası");
    assertThat(receivable.get("companyId").asText()).isEqualTo(w.companyA());
    Map<String, Object> saleTx = ledgerRow(w, receivable.get("id").asText());
    assertThat(saleTx.get("id").toString()).isEqualTo(receivable.get("transactionId").asText());
    assertThat(saleTx.get("direction")).isEqualTo("DEBIT");
    assertThat((BigDecimal) saleTx.get("amount")).isEqualByComparingTo("1200");

    // Borç (Alış Faturası; iskonto %10, KDV %20, stopaj 50) → CREDIT net ödenecek.
    Map<String, Object> purchase = doc("PAYABLE", "ALIS_FATURASI", "1000", w.a1());
    purchase.put("tax", Map.of("discountRate", 10, "vatRate", 20, "withholdingAmount", 50));
    JsonNode payable =
        body(create(w, null, supplier, purchase, null).andExpect(status().isCreated()));
    JsonNode tax = payable.get("tax");
    assertThat(tax.get("discountAmount").decimalValue()).isEqualByComparingTo("100");
    assertThat(tax.get("netExclVat").decimalValue()).isEqualByComparingTo("900");
    assertThat(tax.get("totalInclVat").decimalValue()).isEqualByComparingTo("1080");
    assertThat(tax.get("netPayable").decimalValue()).isEqualByComparingTo("1030");
    Map<String, Object> purchaseTx = ledgerRow(w, payable.get("id").asText());
    assertThat(purchaseTx.get("direction")).isEqualTo("CREDIT");
    assertThat((BigDecimal) purchaseTx.get("amount")).isEqualByComparingTo("1030");

    // Yansıtılmayan fatura: hareket yok, listede var, resmi fatura toplamına girer.
    Map<String, Object> hidden = doc("PAYABLE", "ALIS_FATURASI", "500", w.a1());
    hidden.put("reflectToLedger", false);
    hidden.put("tax", Map.of("vatRate", 20));
    JsonNode notReflected =
        body(create(w, null, supplier, hidden, null).andExpect(status().isCreated()));
    assertThat(notReflected.get("reflectToLedger").asBoolean()).isFalse();
    assertThat(notReflected.get("ledgerAmount").isNull()).isTrue();
    assertThat(notReflected.get("transactionId").isNull()).isTrue();
    assertThat(ledgerCount(w, notReflected.get("id").asText())).isZero();
    JsonNode documents =
        body(
            send(w.t(), null, get(FINANCE + "/accounts/" + supplier + "/documents"))
                .andExpect(status().isOk()));
    assertThat(documents.get("totalElements").asInt()).isEqualTo(2);
    JsonNode balances =
        body(
            send(w.t(), null, get(FINANCE + "/accounts/" + supplier + "/balances"))
                .andExpect(status().isOk()));
    // 12.2 §3.7 (S-16/S-19): defter tabanı — yansıtılan belgenin net ödenecek tutarı 1030 +
    // yansıtılmayanın net ödenecek tutarı 600 (12.1'de KDV dahil taban 1080 + 600 = 1680).
    assertThat(balances.get("payableInvoiceTotals").get(0).get("amount").decimalValue())
        .isEqualByComparingTo("1630");

    // Fatura dışı tür her zaman yansır.
    Map<String, Object> expense = doc("PAYABLE", "MASRAF_YANSITMASI", "75", w.a1());
    expense.put("reflectToLedger", false);
    expense.put("tax", Map.of("vatRate", 20));
    JsonNode reflected =
        body(create(w, null, customer, expense, null).andExpect(status().isCreated()));
    assertThat(reflected.get("reflectToLedger").asBoolean()).isTrue();
    assertThat(reflected.get("tax").isNull()).isTrue();
    assertThat(reflected.get("ledgerAmount").decimalValue()).isEqualByComparingTo("75");

    // Döviz + elle kur.
    Map<String, Object> usd = doc("RECEIVABLE", "DIGER", "10", w.a1());
    usd.put("currency", "USD");
    usd.put("exchangeRate", 30);
    JsonNode usdDoc = body(create(w, null, customer, usd, null).andExpect(status().isCreated()));
    assertThat((BigDecimal) ledgerRow(w, usdDoc.get("id").asText()).get("tl_amount"))
        .isEqualByComparingTo("300");

    // Tür kuralları.
    expect(
        create(w, null, customer, doc("RECEIVABLE", "KUR_FARKI", "10", w.a1()), null),
        422,
        "DOCUMENT_TYPE_INVALID");
    expect(
        create(w, null, customer, doc("PAYABLE", "ALIS_FATURASI", "10", w.a1()), null),
        422,
        "DOCUMENT_TYPE_INVALID");
    expect(
        create(w, null, supplier, doc("PAYABLE", "KALITE_KESINTISI", "10", w.a1()), null),
        422,
        "DOCUMENT_TYPE_INVALID");
    create(w, null, customer, doc("PAYABLE", "CEZA_BIZE", "10", w.a1()), null)
        .andExpect(status().isCreated());
    create(w, null, supplier, doc("PAYABLE", "CEZA_BIZE", "10", w.a1()), null)
        .andExpect(status().isCreated());
    create(w, null, supplier, doc("RECEIVABLE", "CEZA_KARSI_TARAF", "10", w.a1()), null)
        .andExpect(status().isCreated());

    // Tutarlar.
    expect(
        create(w, null, customer, doc("RECEIVABLE", "DIGER", "0", w.a1()), null),
        400,
        "AMOUNT_INVALID");
    Map<String, Object> negative = doc("PAYABLE", "ALIS_FATURASI", "100", w.a1());
    negative.put("tax", Map.of("withholdingAmount", 150));
    expect(create(w, null, supplier, negative, null), 422, "AMOUNT_INVALID");

    // Belge türleri: seçilemeyen Kur Farkı da döner.
    JsonNode types =
        body(
            send(w.t(), null, get(FINANCE + "/account-document-types").param("side", "PAYABLE"))
                .andExpect(status().isOk()));
    assertThat(types.size()).isEqualTo(20);
    assertThat(types.findValuesAsText("side")).containsOnly("PAYABLE");

    // 500 karakterlik açıklama; 480 karakterlik iptal gerekçesiyle ters kayıt ≤ 500.
    Map<String, Object> longText = doc("RECEIVABLE", "DIGER", "5", w.a1());
    longText.put("description", "ç".repeat(500));
    JsonNode longDoc =
        body(create(w, null, customer, longText, null).andExpect(status().isCreated()));
    assertThat(ledgerRow(w, longDoc.get("id").asText()).get("description").toString()).hasSize(500);
    JsonNode cancelled =
        body(
            sendJson(
                    w.t(),
                    null,
                    post(FINANCE + "/account-documents/" + longDoc.get("id").asText() + "/cancel"),
                    Map.of("reason", "ğ".repeat(480)))
                .andExpect(status().isOk()));
    assertThat(cancelled.get("cancelReason").asText()).hasSize(480);
    String reversalText =
        jdbc.queryForObject(
            "select description from \"%s\".account_transaction where source_type = 'REVERSAL'"
                    .formatted(w.schema())
                + " and source_id = ?::uuid",
            String.class,
            longDoc.get("transactionId").asText());
    assertThat(reversalText).hasSize(500).startsWith("Belge iptali: Diğer");

    // Detay.
    JsonNode detail =
        body(
            send(w.t(), null, get(FINANCE + "/account-documents/" + payable.get("id").asText()))
                .andExpect(status().isOk()));
    assertThat(detail.get("accountId").asText()).isEqualTo(supplier.toString());
    assertThat(detail.get("tax").get("withholdingAmount").decimalValue())
        .isEqualByComparingTo("50");
  }

  @Test
  void idempotencyIptalVeRevize() throws Exception {
    World w = world("adi");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID other = account(w, AccountType.CUSTOMER, null);

    // Aynı anahtar → aynı belge, tek hareket.
    Map<String, Object> body = doc("RECEIVABLE", "DIGER", "100", w.a1());
    body.put("currency", "USD");
    body.put("exchangeRate", 30);
    String first = id(create(w, null, customer, body, "K-1"));
    assertThat(id(create(w, null, customer, body, "K-1"))).isEqualTo(first);
    assertThat(ledgerCount(w, first)).isEqualTo(1);
    // Başka cari ya da yönle aynı anahtar 422.
    expect(create(w, null, other, body, "K-1"), 422, "IDEMPOTENCY_KEY_REUSED");
    expect(
        create(w, null, customer, doc("PAYABLE", "CEZA_BIZE", "100", w.a1()), "K-1"),
        422,
        "IDEMPOTENCY_KEY_REUSED");

    // İptal: aynı kur, TL ve şirketle ters kayıt; ikinci iptal 409.
    JsonNode cancelled = body(cancel(w, null, first).andExpect(status().isOk()));
    assertThat(cancelled.get("status").asText()).isEqualTo("CANCELLED");
    assertThat(cancelled.get("cancelDate").asText()).isEqualTo(TODAY.toString());
    Map<String, Object> original = ledgerRow(w, first);
    Map<String, Object> reversal =
        jdbc.queryForMap(
            "select * from \"%s\".account_transaction where source_type = 'REVERSAL'"
                    .formatted(w.schema())
                + " and source_id = ?",
            original.get("id"));
    assertThat(reversal.get("direction")).isEqualTo("CREDIT");
    assertThat((BigDecimal) reversal.get("exchange_rate"))
        .isEqualByComparingTo((BigDecimal) original.get("exchange_rate"));
    assertThat((BigDecimal) reversal.get("tl_amount"))
        .isEqualByComparingTo((BigDecimal) original.get("tl_amount"));
    assertThat(reversal.get("company_id")).isEqualTo(original.get("company_id"));
    expect(cancel(w, null, first), 409, "DOCUMENT_ALREADY_CANCELLED");

    // Yansımayan belgenin iptali hareket yazmaz.
    Map<String, Object> hidden = doc("RECEIVABLE", "SATIS_FATURASI", "40", w.a1());
    hidden.put("reflectToLedger", false);
    String hiddenId = id(create(w, null, customer, hidden, null));
    cancel(w, null, hiddenId).andExpect(status().isOk());
    assertThat(
            jdbc.queryForObject(
                "select count(*) from \"%s\".account_transaction where account_id = ?"
                    .formatted(w.schema()),
                Integer.class,
                customer))
        .isEqualTo(2);

    // Revize: aynı anahtarla iki kez → aynı yeni belge, tek ters kayıt.
    String old = id(create(w, null, customer, doc("RECEIVABLE", "DIGER", "200", w.a1()), null));
    Map<String, Object> fixed = doc("RECEIVABLE", "DIGER", "250", w.a1());
    JsonNode revised = body(revise(w, null, old, fixed, "R-1").andExpect(status().isCreated()));
    JsonNode again = body(revise(w, null, old, fixed, "R-1").andExpect(status().isCreated()));
    assertThat(again.get("id").asText()).isEqualTo(revised.get("id").asText());
    assertThat(revised.get("revisedFromId").asText()).isEqualTo(old);
    assertThat(revised.get("ledgerAmount").decimalValue()).isEqualByComparingTo("250");
    JsonNode oldDoc =
        body(
            send(w.t(), null, get(FINANCE + "/account-documents/" + old))
                .andExpect(status().isOk()));
    assertThat(oldDoc.get("status").asText()).isEqualTo("CANCELLED");
    assertThat(oldDoc.get("cancelReason").asText()).isEqualTo("Revize");
    assertThat(oldDoc.get("revisedById").asText()).isEqualTo(revised.get("id").asText());
    assertThat(
            jdbc.queryForObject(
                "select count(*) from \"%s\".account_transaction where source_type = 'REVERSAL'"
                        .formatted(w.schema())
                    + " and source_id = ?::uuid",
                Integer.class,
                oldDoc.get("transactionId").asText()))
        .isEqualTo(1);
    // Anahtarsız ikinci revize 409; başka belgenin anahtarı 422; yön değişimi 422.
    expect(revise(w, null, old, fixed, null), 409, "DOCUMENT_ALREADY_CANCELLED");
    String third = id(create(w, null, customer, doc("RECEIVABLE", "DIGER", "30", w.a1()), null));
    expect(revise(w, null, third, fixed, "K-1"), 422, "IDEMPOTENCY_KEY_REUSED");
    expect(
        revise(w, null, third, doc("PAYABLE", "CEZA_BIZE", "30", w.a1()), null),
        422,
        "DOCUMENT_SIDE_LOCKED");
    // Pasif iş yerine revize 422.
    String a3 =
        id(
            sendJson(
                w.t(),
                null,
                post("/api/v1/organization/branches"),
                Map.of("code", "A3", "name", "A3 Merkez", "companyId", w.companyA())));
    send(w.t(), null, post("/api/v1/organization/branches/" + a3 + "/deactivate"))
        .andExpect(status().isOk());
    expect(
        revise(w, null, third, doc("RECEIVABLE", "DIGER", "30", a3), null), 422, "BRANCH_INACTIVE");
    assertThat(
            body(send(w.t(), null, get(FINANCE + "/account-documents/" + third)))
                .get("status")
                .asText())
        .isEqualTo("OPEN");

    // Kiracı izolasyonu: başka kiracıda belge yok.
    String y = "ady-" + Long.toString(System.nanoTime(), 36);
    createTenant(y);
    expect(send(y, null, get(FINANCE + "/account-documents/" + first)), 404, "DOCUMENT_NOT_FOUND");
  }

  @Test
  void yetkiKapsamVeSirketKurallari() throws Exception {
    World w = world("ady");
    UUID customer = account(w, AccountType.CUSTOMER, null);

    // ACCOUNTING belge yazamaz.
    String accounting = userWithRole(w, "muhasebe", "ACCOUNTING");
    create(w, accounting, customer, doc("RECEIVABLE", "DIGER", "10", w.a1()), null)
        .andExpect(status().isForbidden());

    // LIMITED (A1): A2 ile oluşturma 403; A2 belgesine erişim 403; liste yalnız A1.
    String limited = limitedUser(w, "sinirli", "FINANCE", List.of(w.a1()));
    expect(
        create(w, limited, customer, doc("RECEIVABLE", "DIGER", "10", w.a2()), null),
        403,
        "BRANCH_OUT_OF_SCOPE");
    String inA1 = id(create(w, limited, customer, doc("RECEIVABLE", "DIGER", "11", w.a1()), null));
    String inA2 = id(create(w, null, customer, doc("RECEIVABLE", "DIGER", "12", w.a2()), "A2-KEY"));
    expect(
        send(w.t(), limited, get(FINANCE + "/account-documents/" + inA2)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(cancel(w, limited, inA2), 403, "BRANCH_OUT_OF_SCOPE");
    JsonNode limitedList =
        body(
            send(w.t(), limited, get(FINANCE + "/accounts/" + customer + "/documents"))
                .andExpect(status().isOk()));
    assertThat(limitedList.get("content").findValuesAsText("id")).containsExactly(inA1);
    // Anahtar A2'de oluşmuşsa A1 kullanıcısına 403.
    expect(
        create(w, limited, customer, doc("RECEIVABLE", "DIGER", "12", w.a1()), "A2-KEY"),
        403,
        "BRANCH_OUT_OF_SCOPE");
    // Revizede kapsam dışı iş yeri 403, eski belge açık kalır.
    expect(
        revise(w, limited, inA1, doc("RECEIVABLE", "DIGER", "13", w.a2()), null),
        403,
        "BRANCH_OUT_OF_SCOPE");
    assertThat(
            body(send(w.t(), null, get(FINANCE + "/account-documents/" + inA1)))
                .get("status")
                .asText())
        .isEqualTo("OPEN");

    // Şirket: B1 iş yerli belge B şirketine yazılır; A süzgecinde görünmez, konsolidede görünür.
    JsonNode inB =
        body(
            create(w, null, customer, doc("RECEIVABLE", "DIGER", "50", w.b1()), null)
                .andExpect(status().isCreated()));
    assertThat(inB.get("companyId").asText()).isEqualTo(w.companyB());
    JsonNode onlyA =
        body(
            send(
                    w.t(),
                    null,
                    get(FINANCE + "/accounts/" + customer + "/balances")
                        .param("companyId", w.companyA()))
                .andExpect(status().isOk()));
    assertThat(onlyA.get("rows").get(0).get("balance").decimalValue()).isEqualByComparingTo("23");
    JsonNode consolidated =
        body(
            send(w.t(), null, get(FINANCE + "/accounts/" + customer + "/balances"))
                .andExpect(status().isOk()));
    assertThat(consolidated.get("rows").get(0).get("balance").decimalValue())
        .isEqualByComparingTo("73");

    // A'ya bağlı karta B1'den yansıtılmayan fatura türü belge de açılamaz.
    UUID bound = account(w, AccountType.SUPPLIER, null);
    jdbc.update(
        "update \"%s\".account set company_id = ?::uuid where id = ?".formatted(w.schema()),
        w.companyA(),
        bound);
    Map<String, Object> hidden = doc("PAYABLE", "ALIS_FATURASI", "10", w.b1());
    hidden.put("reflectToLedger", false);
    expect(create(w, null, bound, hidden, null), 422, "COMPANY_MISMATCH");
    // Grup carisine kendi şirketinden yansıtılmayan belge 422.
    UUID group =
        jdbc.queryForObject(
            "select id from \"%s\".account where represents_company_id = ?::uuid"
                .formatted(w.schema()),
            UUID.class,
            w.companyA());
    Map<String, Object> toGroup = doc("PAYABLE", "ALIS_FATURASI", "10", w.a1());
    toGroup.put("reflectToLedger", false);
    expect(create(w, null, group, toGroup, null), 422, "COMPANY_MISMATCH");

    // Pasif cari 422.
    sendJson(
            w.t(),
            null,
            patch(FINANCE + "/accounts/" + customer + "/active"),
            Map.of("active", false))
        .andExpect(status().isOk());
    expect(
        create(w, null, customer, doc("RECEIVABLE", "DIGER", "10", w.a1()), null),
        422,
        "ACCOUNT_INACTIVE");

    // Personel carisinin belge anahtarı izinsiz kullanıcıya 404 (varlık sızmaz).
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    create(w, null, employee, doc("RECEIVABLE", "DIGER", "10", w.a1()), "EMP-KEY")
        .andExpect(status().isCreated());
    String finance = userWithRole(w, "finans", "FINANCE");
    UUID active = account(w, AccountType.CUSTOMER, null);
    create(w, finance, active, doc("RECEIVABLE", "DIGER", "10", w.a1()), "EMP-KEY")
        .andExpect(status().isNotFound());
    expect(
        send(w.t(), finance, get(FINANCE + "/accounts/" + employee + "/documents")),
        404,
        "ACCOUNT_NOT_FOUND");
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

  private ResultActions create(
      World w, String token, UUID accountId, Map<String, Object> body, String key)
      throws Exception {
    return sendJson(
        w.t(), token, withKey(post(FINANCE + "/accounts/" + accountId + "/documents"), key), body);
  }

  private ResultActions revise(
      World w, String token, String documentId, Map<String, Object> body, String key)
      throws Exception {
    return sendJson(
        w.t(),
        token,
        withKey(post(FINANCE + "/account-documents/" + documentId + "/revise"), key),
        body);
  }

  private ResultActions cancel(World w, String token, String documentId) throws Exception {
    return sendJson(
        w.t(), token, post(FINANCE + "/account-documents/" + documentId + "/cancel"), Map.of());
  }

  private static MockHttpServletRequestBuilder withKey(
      MockHttpServletRequestBuilder request, String key) {
    return key == null ? request : request.header("Idempotency-Key", key);
  }

  private Map<String, Object> ledgerRow(World w, String documentId) {
    return jdbc.queryForMap(
        "select * from \"%s\".account_transaction where source_type = 'ACCOUNT_DOCUMENT'"
                .formatted(w.schema())
            + " and source_id = ?::uuid",
        documentId);
  }

  private int ledgerCount(World w, String documentId) {
    return jdbc.queryForObject(
        "select count(*) from \"%s\".account_transaction where source_type = 'ACCOUNT_DOCUMENT'"
                .formatted(w.schema())
            + " and source_id = ?::uuid",
        Integer.class,
        documentId);
  }
}
