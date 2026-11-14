package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Hareket türü türetimi, kırılımlı bakiye, ekstre v2, çapraz liste + facet'ler, hareket
 * detayı/kaynağı, "Sil" yönlendiricisi ve cari fatura listesi (12.1 §3.5–§3.9).
 */
class AccountLedgerQueryIT extends AccountTestSupport {

  @Test
  void turTuretimiBakiyeVeEkstre() throws Exception {
    World w = world("alk");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID supplier = account(w, AccountType.SUPPLIER, null);

    String collection = settlement(w, "/collections", customer, "300");
    String payment = settlement(w, "/payments", supplier, "200");
    String invoice = purchaseInvoice(w, supplier, "PI-1", "100", "20");
    UUID manual = manual(w, customer, w.a1(), Direction.DEBIT, "1000", "TRY");
    reverse(w, manual);
    UUID shipment = shipment(w, customer, w.a1());
    JsonNode freight = freightInvoice(w, shipment);

    // Tek cari listesi: tarih sınırı yok.
    Map<String, JsonNode> rows = rowsBySource(w, customer);
    assertThat(rows.get("SETTLEMENT").get("kind").asText()).isEqualTo("COLLECTION");
    JsonNode manualRow = rows.get("MANUAL");
    assertThat(manualRow.get("kind").asText()).isEqualTo("RECEIVABLE");
    assertThat(manualRow.get("sign").asInt()).isEqualTo(1);
    assertThat(manualRow.get("reversed").asBoolean()).isTrue();
    JsonNode reversalRow = rows.get("REVERSAL");
    assertThat(reversalRow.get("kind").asText()).isEqualTo("RECEIVABLE");
    assertThat(reversalRow.get("sign").asInt()).isEqualTo(-1);
    assertThat(reversalRow.get("reversal").asBoolean()).isTrue();
    JsonNode freightRow = rows.get("FREIGHT_INVOICE");
    assertThat(freightRow.get("kind").asText()).isEqualTo("RECEIVABLE");
    assertThat(freightRow.get("documentNo").asText()).isEqualTo(freight.get("number").asText());
    assertThat(freightRow.get("documentType").asText()).isEqualTo("FREIGHT_INVOICE");
    assertThat(freightRow.get("accountCode").asText()).startsWith("C");
    assertThat(freightRow.get("subGroupName").asText()).isEqualTo("Müşteri");
    assertThat(freightRow.get("branchName").asText()).isEqualTo("A1 Merkez");
    Map<String, JsonNode> supplierRows = rowsBySource(w, supplier);
    assertThat(supplierRows.get("SETTLEMENT").get("kind").asText()).isEqualTo("PAYMENT");
    assertThat(supplierRows.get("SETTLEMENT").get("paymentMethod").asText()).isEqualTo("CASH");
    JsonNode invoiceRow = supplierRows.get("PURCHASE_INVOICE");
    assertThat(invoiceRow.get("kind").asText()).isEqualTo("DEBT");
    assertThat(invoiceRow.get("documentNo").asText()).isEqualTo("PI-1");
    assertThat(invoiceRow.get("dueDate").asText()).isEqualTo(TODAY.plusDays(30).toString());

    // Cari seçiliyken 10 yıllık aralık ve tarihsiz istek 200.
    send(
            w.t(),
            null,
            get(FINANCE + "/account-transactions")
                .param("accountId", customer.toString())
                .param("from", TODAY.minusYears(10).toString())
                .param("to", TODAY.toString()))
        .andExpect(status().isOk());

    // Kırılımlı bakiye: tür toplamları debit/credit ile tutarlı.
    JsonNode breakdown = balances(w, customer, Map.of());
    JsonNode all = breakdown.get("rows").get(0);
    assertThat(all.get("segment").asText()).isEqualTo("ALL");
    assertKindsConsistent(all);
    assertThat(all.get("receivable").decimalValue()).isEqualByComparingTo("120");
    assertThat(all.get("collection").decimalValue()).isEqualByComparingTo("300");
    assertThat(all.get("balance").decimalValue()).isEqualByComparingTo("-180");
    assertThat(breakdown.get("payableInvoiceTotals").size()).isZero();
    JsonNode supplierAll = balances(w, supplier, Map.of()).get("rows").get(0);
    assertKindsConsistent(supplierAll);
    assertThat(supplierAll.get("debt").decimalValue()).isEqualByComparingTo("120");
    assertThat(supplierAll.get("payment").decimalValue()).isEqualByComparingTo("200");
    assertThat(
            balances(w, supplier, Map.of())
                .get("payableInvoiceTotals")
                .get(0)
                .get("amount")
                .decimalValue())
        .isEqualByComparingTo("120");

    // Şirket ve iş yeri kırılımı; asOf.
    manual(w, customer, w.b1(), Direction.DEBIT, "50", "TRY");
    JsonNode byCompany = balances(w, customer, Map.of("groupBy", "COMPANY")).get("rows");
    assertThat(byCompany.size()).isEqualTo(2);
    assertThat(byCompany.findValuesAsText("companyId"))
        .containsExactlyInAnyOrder(w.companyA(), w.companyB());
    JsonNode byBranch = balances(w, customer, Map.of("groupBy", "BRANCH")).get("rows");
    assertThat(byBranch.findValuesAsText("branchId")).containsExactlyInAnyOrder(w.a1(), w.b1());
    assertThat(balances(w, customer, Map.of("asOf", TODAY.minusDays(1).toString())).get("rows"))
        .isEmpty();

    // Sezon bölmesi: BEFORE + AFTER = ALL.
    postManual(w, customer, w.a1(), "DEBIT", "70", TODAY.minusDays(10));
    UUID rollover = rollover(w, customer, TODAY.minusDays(5));
    JsonNode split = balances(w, customer, Map.of("rolloverId", rollover.toString()));
    assertThat(split.get("splitDate").asText()).isEqualTo(TODAY.minusDays(5).toString());
    BigDecimal total = BigDecimal.ZERO;
    BigDecimal parts = BigDecimal.ZERO;
    for (JsonNode row : split.get("rows")) {
      if ("ALL".equals(row.get("segment").asText())) {
        total = total.add(row.get("balance").decimalValue());
      } else {
        parts = parts.add(row.get("balance").decimalValue());
      }
    }
    assertThat(total).isEqualByComparingTo(parts).isEqualByComparingTo("-60");
    assertThat(split.get("rows").findValuesAsText("segment")).contains("BEFORE", "AFTER");
    // T-3: sınır `transaction_date < splitDate` — hangi hareket hangi segmentte.
    JsonNode before = segment(split, "BEFORE");
    assertKindsConsistent(before);
    assertThat(before.get("debit").decimalValue()).isEqualByComparingTo("70");
    assertThat(before.get("credit").decimalValue()).isEqualByComparingTo("0");
    assertThat(before.get("receivable").decimalValue()).isEqualByComparingTo("70");
    assertThat(before.get("balance").decimalValue()).isEqualByComparingTo("70");
    JsonNode after = segment(split, "AFTER");
    assertKindsConsistent(after);
    // Navlun 120 + B1 elle 50; 1000'lik elle hareket ve ters kaydı net sıfır.
    assertThat(after.get("receivable").decimalValue()).isEqualByComparingTo("170");
    assertThat(after.get("collection").decimalValue()).isEqualByComparingTo("300");
    assertThat(after.get("balance").decimalValue()).isEqualByComparingTo("-130");
    assertKindsConsistent(segment(split, "ALL"));
    assertThat(segment(split, "ALL").get("balance").decimalValue()).isEqualByComparingTo("-60");
    // Sınır günü: devir tarihi bugün olan (pasif) sezon — bugünkü hareketlerin hepsi AFTER'da.
    UUID boundary = rollover(w, customer, TODAY, false);
    JsonNode onBoundary = balances(w, customer, Map.of("rolloverId", boundary.toString()));
    assertThat(onBoundary.get("splitDate").asText()).isEqualTo(TODAY.toString());
    assertThat(segment(onBoundary, "BEFORE").get("balance").decimalValue())
        .isEqualByComparingTo("70");
    assertThat(segment(onBoundary, "AFTER").get("balance").decimalValue())
        .isEqualByComparingTo("-130");
    // asOf devirden sonra ama hareketlerden önce: yalnız BEFORE (ve ALL).
    JsonNode early =
        balances(
            w,
            customer,
            Map.of("rolloverId", rollover.toString(), "asOf", TODAY.minusDays(1).toString()));
    assertThat(early.get("rows").findValuesAsText("segment"))
        .containsExactlyInAnyOrder("BEFORE", "ALL");
    assertThat(segment(early, "BEFORE").get("balance").decimalValue()).isEqualByComparingTo("70");
    assertThat(segment(early, "ALL").get("balance").decimalValue()).isEqualByComparingTo("70");
    expect(
        send(
            w.t(),
            null,
            get(FINANCE + "/accounts/" + supplier + "/balances")
                .param("rolloverId", rollover.toString())),
        404,
        "ROLLOVER_NOT_FOUND");

    // Ekstre v2: para birimiyle eski sıra ve açılış; yeni alanlar ek.
    JsonNode statement =
        statement(
            w,
            customer,
            Map.of(
                "currency", "TRY", "from", TODAY.minusDays(7).toString(), "to", TODAY.toString()));
    assertThat(statement.get("currency").asText()).isEqualTo("TRY");
    assertThat(statement.get("openingBalance").decimalValue()).isEqualByComparingTo("70");
    JsonNode lines = statement.get("lines");
    assertThat(lines.size()).isEqualTo(5);
    assertThat(lines.get(lines.size() - 1).get("balance").decimalValue())
        .isEqualByComparingTo("-60");
    assertThat(lines.get(0).get("kind").asText()).isNotBlank();
    assertThat(lines.get(0).get("currency").asText()).isEqualTo("TRY");
    assertThat(lines.get(0).get("createdBy").asText()).isNotBlank();
    assertThat(lines.get(0).get("createdAt").asText()).isNotBlank();
    // Para birimi yoksa çok para birimli; açılışlar listede.
    manual(w, customer, w.a1(), Direction.DEBIT, "10", "USD");
    JsonNode multi =
        statement(
            w, customer, Map.of("from", TODAY.minusDays(7).toString(), "to", TODAY.toString()));
    assertThat(multi.get("currency").isNull()).isTrue();
    assertThat(multi.get("openingBalance").isNull()).isTrue();
    assertThat(multi.get("openingBalances").findValuesAsText("currency")).containsExactly("TRY");
    assertThat(multi.get("lines").findValuesAsText("currency")).contains("TRY", "USD");
    // İş yeri süzgeci.
    JsonNode onlyB1 =
        statement(
            w,
            customer,
            Map.of(
                "from", TODAY.minusDays(7).toString(),
                "to", TODAY.toString(),
                "branchIds", w.b1()));
    assertThat(onlyB1.get("lines").size()).isEqualTo(1);
    // Belge tarihi tabanı: faturanın belge tarihi dönem dışındaysa açılışa girer.
    jdbc.update(
        "update \"%s\".purchase_invoice set invoice_date = ? where id = ?::uuid"
            .formatted(w.schema()),
        TODAY.minusDays(40),
        invoice);
    Map<String, String> window =
        Map.of("currency", "TRY", "from", TODAY.minusDays(7).toString(), "to", TODAY.toString());
    JsonNode byTransaction = statement(w, supplier, window);
    Map<String, String> documentWindow = new HashMap<>(window);
    documentWindow.put("dateBasis", "DOCUMENT");
    JsonNode byDocument = statement(w, supplier, documentWindow);
    assertThat(byTransaction.get("lines").size()).isEqualTo(2);
    assertThat(byDocument.get("lines").size()).isEqualTo(1);
    assertThat(byDocument.get("openingBalance").decimalValue()).isEqualByComparingTo("-120");
    assertThat(byDocument.get("lines").get(0).get("balance").decimalValue())
        .isEqualByComparingTo("80");
    // Eski MUI çağrısı (sayfalı) aynen çalışır.
    JsonNode paged =
        statement(
            w,
            customer,
            Map.of(
                "currency", "TRY",
                "from", TODAY.minusDays(7).toString(),
                "to", TODAY.toString(),
                "size", "2",
                "page", "1"));
    assertThat(paged.get("lines").size()).isEqualTo(2);
    assertThat(paged.get("totalElements").asInt()).isEqualTo(5);
    assertThat(paged.get("totalPages").asInt()).isEqualTo(3);
    assertThat(paged.get("lines").get(0).get("id").asText())
        .isEqualTo(lines.get(2).get("id").asText());

    // Detay ve kaynak.
    String freightTx = freightRow.get("id").asText();
    JsonNode detail =
        body(
            send(w.t(), null, get(FINANCE + "/accounts/transactions/" + freightTx))
                .andExpect(status().isOk()));
    assertThat(detail.get("row").get("id").asText()).isEqualTo(freightTx);
    assertThat(detail.get("document").isNull()).isTrue();
    JsonNode source =
        body(
            send(w.t(), null, get(FINANCE + "/accounts/transactions/" + freightTx + "/source"))
                .andExpect(status().isOk()));
    assertThat(source.get("route").asText()).isEqualTo("/operations/shipments/" + shipment);
    assertThat(source.get("label").asText()).startsWith("Navlun faturası");
    JsonNode manualSource =
        body(
            send(
                    w.t(),
                    null,
                    get(
                        FINANCE
                            + "/accounts/transactions/"
                            + manualRow.get("id").asText()
                            + "/source"))
                .andExpect(status().isOk()));
    assertThat(manualSource.get("route").isNull()).isTrue();
    JsonNode manualDetail =
        body(
            send(
                    w.t(),
                    null,
                    get(FINANCE + "/accounts/transactions/" + manualRow.get("id").asText()))
                .andExpect(status().isOk()));
    assertThat(manualDetail.get("reversedById").asText()).isEqualTo(reversalRow.get("id").asText());
    assertThat(manualDetail.get("transfer").isNull()).isTrue();
    expect(
        send(w.t(), null, get(FINANCE + "/accounts/transactions/" + UUID.randomUUID())),
        404,
        "TRANSACTION_NOT_FOUND");
    assertThat(collection).isNotBlank();
    assertThat(payment).isNotBlank();
  }

  @Test
  void caprazListeFacetlerKapsamVePersonel() throws Exception {
    World w = world("alc");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    settlement(w, "/collections", customer, "300");
    manual(w, customer, w.a1(), Direction.DEBIT, "100", "TRY");
    manual(w, customer, w.a2(), Direction.DEBIT, "40", "TRY");
    manual(w, supplier, w.b1(), Direction.CREDIT, "60", "TRY");
    UUID employeeTx = manual(w, employee, w.a1(), Direction.DEBIT, "10", "TRY");

    // Tarih kuralı: cari yokken zorunlu ve ≤ 366 gün.
    expect(send(w.t(), null, get(FINANCE + "/account-transactions")), 400, "DATE_RANGE_TOO_LARGE");
    expect(
        send(
            w.t(),
            null,
            get(FINANCE + "/account-transactions")
                .param("from", TODAY.minusDays(367).toString())
                .param("to", TODAY.toString())),
        400,
        "DATE_RANGE_TOO_LARGE");

    // Seçimler listeyi süzer; facet'ler seçimden etkilenmez.
    JsonNode page =
        cross(
            w,
            null,
            Map.of(
                "kinds", "COLLECTION",
                "branchIds", w.a1(),
                "facets", "true"));
    assertThat(page.get("content").size()).isEqualTo(1);
    assertThat(page.get("content").get(0).get("kind").asText()).isEqualTo("COLLECTION");
    JsonNode facets = page.get("facets");
    assertThat(count(facets.get("kinds"), "kind", "RECEIVABLE")).isEqualTo(3);
    assertThat(count(facets.get("kinds"), "kind", "COLLECTION")).isEqualTo(1);
    assertThat(count(facets.get("kinds"), "kind", "DEBT")).isEqualTo(1);
    assertThat(facets.get("branches").findValuesAsText("id"))
        .containsExactlyInAnyOrder(w.a1(), w.a2(), w.b1());
    assertThat(count(facets.get("groups"), "code", "MUSTERI")).isEqualTo(3);
    assertThat(count(facets.get("groups"), "code", "SURUCU")).isEqualTo(1);
    // Grup ve tür süzgeci; sıralama tarih/oluşturma azalan.
    JsonNode suppliers = cross(w, null, Map.of("accountTypes", "SUPPLIER"));
    assertThat(suppliers.get("content").findValuesAsText("accountId"))
        .containsOnly(supplier.toString());
    JsonNode everything = cross(w, null, Map.of());
    assertThat(everything.get("totalElements").asInt()).isEqualTo(5);
    assertThat(everything.get("facets").isNull()).isTrue();
    List<Instant> created = new ArrayList<>();
    everything
        .get("content")
        .forEach(row -> created.add(Instant.parse(row.get("createdAt").asText())));
    assertThat(created).isSortedAccordingTo((a, b) -> b.compareTo(a));
    JsonNode groups = cross(w, null, Map.of("subGroups", "GENEL"));
    assertThat(groups.get("content").size()).isEqualTo(1);

    // Personel hareketi FINANCE'e görünmez, FINANCE_SUPER'a görünür.
    String finance = userWithRole(w, "finans", "FINANCE");
    JsonNode financeView = cross(w, finance, Map.of("facets", "true"));
    assertThat(financeView.get("content").findValuesAsText("accountId"))
        .doesNotContain(employee.toString());
    assertThat(financeView.get("facets").get("groups").findValuesAsText("code"))
        .doesNotContain("SURUCU");
    String superUser = userWithRole(w, "patron2", "FINANCE_SUPER");
    assertThat(cross(w, superUser, Map.of()).get("content").findValuesAsText("accountId"))
        .contains(employee.toString());
    expect(
        send(w.t(), finance, get(FINANCE + "/accounts/transactions/" + employeeTx + "/source")),
        404,
        "TRANSACTION_NOT_FOUND");

    // LIMITED (A1): yalnız A1; facet'lerde A2/B1 yok; A2 hareketine 403.
    String limited = limitedUser(w, "sinirli", "FINANCE_SUPER", List.of(w.a1()));
    JsonNode limitedView = cross(w, limited, Map.of("facets", "true"));
    assertThat(limitedView.get("content").findValuesAsText("branchId")).containsOnly(w.a1());
    assertThat(limitedView.get("facets").get("branches").findValuesAsText("id"))
        .containsExactly(w.a1());
    String a2Tx = null;
    for (JsonNode row : everything.get("content")) {
      if (w.a2().equals(row.get("branchId").asText())) {
        a2Tx = row.get("id").asText();
      }
    }
    expect(
        send(w.t(), limited, get(FINANCE + "/accounts/transactions/" + a2Tx)),
        403,
        "BRANCH_OUT_OF_SCOPE");
  }

  @Test
  void silYonlendiricisiVeFaturaListesi() throws Exception {
    World w = world("alv");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID supplier = account(w, AccountType.SUPPLIER, null);

    // Belge → belge iptali.
    Map<String, Object> sale = new HashMap<>();
    sale.put("side", "RECEIVABLE");
    sale.put("documentType", "SATIS_FATURASI");
    sale.put("documentNo", "SF-1");
    sale.put("documentDate", TODAY.toString());
    sale.put("amount", "100");
    sale.put("currency", "TRY");
    sale.put("paymentMethod", "BANK");
    sale.put("branchId", w.a1());
    sale.put("tax", Map.of("vatRate", 20));
    JsonNode document =
        body(
            sendJson(w.t(), null, post(FINANCE + "/accounts/" + customer + "/documents"), sale)
                .andExpect(status().isCreated()));
    String documentTx = document.get("transactionId").asText();
    JsonNode documentDetail =
        body(send(w.t(), null, get(FINANCE + "/accounts/transactions/" + documentTx)));
    assertThat(documentDetail.get("document").get("id").asText())
        .isEqualTo(document.get("id").asText());
    assertThat(
            body(send(
                    w.t(), null, get(FINANCE + "/accounts/transactions/" + documentTx + "/source")))
                .get("route")
                .isNull())
        .isTrue();
    JsonNode voided = body(voidTx(w, null, documentTx).andExpect(status().isOk()));
    assertThat(voided.get("sourceType").asText()).isEqualTo("REVERSAL");
    assertThat(voided.get("description").asText())
        .isEqualTo("Belge iptali: Satış Faturası SF-1 — ZTO ekranından silindi: Alacak");
    assertThat(
            body(send(
                    w.t(),
                    null,
                    get(FINANCE + "/account-documents/" + document.get("id").asText())))
                .get("status")
                .asText())
        .isEqualTo("CANCELLED");
    // Ters kayıt yeniden ters çevrilemez.
    expect(voidTx(w, null, voided.get("id").asText()), 409, "ALREADY_REVERSAL");

    // Ödeme/tahsilat → settlement + fon ters kaydı.
    String settlementId = settlement(w, "/collections", customer, "300");
    String settlementTx = txOf(w, "SETTLEMENT", settlementId);
    voidTx(w, null, settlementTx).andExpect(status().isOk());
    assertThat(
            jdbc.queryForObject(
                "select status from \"%s\".settlement where id = ?::uuid".formatted(w.schema()),
                String.class,
                settlementId))
        .isEqualTo("REVERSED");
    assertThat(
            jdbc.queryForObject(
                "select count(*) from \"%s\".fund_transaction where source_type = 'REVERSAL'"
                    .formatted(w.schema()),
                Integer.class))
        .isEqualTo(1);

    // Elle hareket → ters kayıt; ikinci void 409.
    UUID manual = manual(w, customer, w.a1(), Direction.DEBIT, "40", "TRY");
    voidTx(w, null, manual.toString()).andExpect(status().isOk());
    expect(voidTx(w, null, manual.toString()), 409, "TRANSACTION_ALREADY_REVERSED");

    // Alış faturası → fatura iptali.
    String invoice = purchaseInvoice(w, supplier, "PI-9", "100", "20");
    Map<String, Object> payableInvoice = new HashMap<>(sale);
    payableInvoice.put("side", "PAYABLE");
    payableInvoice.put("documentType", "ALIS_FATURASI");
    payableInvoice.put("documentNo", "AF-1");
    payableInvoice.put("reflectToLedger", false);
    sendJson(w.t(), null, post(FINANCE + "/accounts/" + supplier + "/documents"), payableInvoice)
        .andExpect(status().isCreated());
    Map<String, Object> penalty = new HashMap<>(sale);
    penalty.put("side", "PAYABLE");
    penalty.put("documentType", "CEZA_BIZE");
    penalty.put("documentNo", "CZ-1");
    sendJson(w.t(), null, post(FINANCE + "/accounts/" + supplier + "/documents"), penalty)
        .andExpect(status().isCreated());
    JsonNode purchases = invoices(w, supplier, Map.of("direction", "PURCHASE"));
    assertThat(purchases.findValuesAsText("kind"))
        .containsExactlyInAnyOrder("PURCHASE_INVOICE", "ACCOUNT_DOCUMENT");
    assertThat(statusOf(purchases, "PURCHASE_INVOICE")).isEqualTo("OPEN");
    JsonNode notReflected =
        invoices(w, supplier, Map.of("direction", "PURCHASE", "reflected", "false"));
    assertThat(notReflected.findValuesAsText("number")).containsExactly("AF-1");
    assertThat(
            invoices(w, supplier, Map.of("direction", "PURCHASE", "documentType", "ALIS_FATURASI"))
                .size())
        .isEqualTo(2);
    voidTx(w, null, txOf(w, "PURCHASE_INVOICE", invoice)).andExpect(status().isOk());
    assertThat(statusOf(invoices(w, supplier, Map.of("direction", "PURCHASE")), "PURCHASE_INVOICE"))
        .isEqualTo("CANCELLED");

    // Navlun faturası kendi modülünden iptal edilir (409 + rota).
    UUID shipment = shipment(w, customer, w.a1());
    JsonNode freight = freightInvoice(w, shipment);
    String freightTx = txOf(w, "FREIGHT_INVOICE", freight.get("id").asText());
    JsonNode managed = body(voidTx(w, null, freightTx).andExpect(status().isConflict()));
    assertThat(managed.get("code").asText()).isEqualTo("TRANSACTION_SOURCE_MANAGED");
    assertThat(managed.get("details").get(0).asText())
        .isEqualTo("route=/operations/shipments/" + shipment);
    // Yetki: ACCOUNTING void yapamaz.
    String accounting = userWithRole(w, "muhasebe", "ACCOUNTING");
    voidTx(w, accounting, freightTx).andExpect(status().isForbidden());

    // Satış listesi: navlun ISSUED → OPEN, iptal → CANCELLED; Alacak fatura türü belge.
    JsonNode sales = invoices(w, customer, Map.of("direction", "SALES"));
    assertThat(sales.findValuesAsText("kind"))
        .containsExactlyInAnyOrder("FREIGHT_INVOICE", "ACCOUNT_DOCUMENT");
    assertThat(statusOf(sales, "FREIGHT_INVOICE")).isEqualTo("OPEN");
    assertThat(statusOf(sales, "ACCOUNT_DOCUMENT")).isEqualTo("CANCELLED");
    sendJson(
            w.t(),
            null,
            post("/api/v1/shipment/invoices/" + freight.get("id").asText() + "/cancel"),
            Map.of("date", TODAY.toString()))
        .andExpect(status().isOk());
    assertThat(statusOf(invoices(w, customer, Map.of("direction", "SALES")), "FREIGHT_INVOICE"))
        .isEqualTo("CANCELLED");
  }

  // --- yardımcılar

  private static void assertKindsConsistent(JsonNode row) {
    BigDecimal net = row.get("debit").decimalValue().subtract(row.get("credit").decimalValue());
    BigDecimal kinds =
        row.get("receivable")
            .decimalValue()
            .add(row.get("payment").decimalValue())
            .subtract(row.get("debt").decimalValue())
            .subtract(row.get("collection").decimalValue());
    assertThat(kinds).isEqualByComparingTo(net);
    assertThat(row.get("balance").decimalValue()).isEqualByComparingTo(net);
  }

  private static long count(JsonNode facets, String field, String value) {
    for (JsonNode facet : facets) {
      if (value.equals(facet.get(field).asText())) {
        return facet.get("count").asLong();
      }
    }
    return 0;
  }

  private static String statusOf(JsonNode rows, String kind) {
    for (JsonNode row : rows) {
      if (kind.equals(row.get("kind").asText())) {
        return row.get("status").asText();
      }
    }
    throw new AssertionError("Satır yok: " + kind);
  }

  private Map<String, JsonNode> rowsBySource(World w, UUID accountId) throws Exception {
    JsonNode page =
        body(
            send(
                    w.t(),
                    null,
                    get(FINANCE + "/account-transactions").param("accountId", accountId.toString()))
                .andExpect(status().isOk()));
    Map<String, JsonNode> rows = new HashMap<>();
    page.get("content").forEach(row -> rows.put(row.get("sourceType").asText(), row));
    return rows;
  }

  private JsonNode cross(World w, String token, Map<String, String> params) throws Exception {
    var request =
        get(FINANCE + "/account-transactions")
            .param("from", TODAY.toString())
            .param("to", TODAY.toString());
    params.forEach(request::param);
    return body(send(w.t(), token, request).andExpect(status().isOk()));
  }

  private JsonNode balances(World w, UUID accountId, Map<String, String> params) throws Exception {
    var request = get(FINANCE + "/accounts/" + accountId + "/balances");
    params.forEach(request::param);
    return body(send(w.t(), null, request).andExpect(status().isOk()));
  }

  private JsonNode statement(World w, UUID accountId, Map<String, String> params) throws Exception {
    var request = get(FINANCE + "/accounts/" + accountId + "/statement");
    params.forEach(request::param);
    return body(send(w.t(), null, request).andExpect(status().isOk()));
  }

  private JsonNode invoices(World w, UUID accountId, Map<String, String> params) throws Exception {
    var request = get(FINANCE + "/accounts/" + accountId + "/invoices");
    params.forEach(request::param);
    return body(send(w.t(), null, request).andExpect(status().isOk()));
  }

  private ResultActions voidTx(World w, String token, String transactionId) throws Exception {
    return sendJson(
        w.t(),
        token,
        post(FINANCE + "/accounts/transactions/" + transactionId + "/void"),
        Map.of());
  }

  private String txOf(World w, String sourceType, String sourceId) {
    return jdbc.queryForObject(
        "select id::text from \"%s\".account_transaction where source_type = ?"
                .formatted(w.schema())
            + " and source_id = ?::uuid",
        String.class,
        sourceType,
        sourceId);
  }

  private String settlement(World w, String path, UUID accountId, String amount) throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("method", "CASH");
    body.put("accountId", accountId);
    body.put("branchId", w.a1());
    body.put("fundAccountId", w.fundA1());
    body.put("money", Map.of("amount", amount, "currency", "TRY"));
    body.put("date", TODAY.toString());
    return id(sendJson(w.t(), null, post(FINANCE + path), body));
  }

  private String purchaseInvoice(World w, UUID supplier, String number, String net, String vat)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("accountId", supplier);
    body.put("branchId", w.a1());
    body.put("number", number);
    body.put("invoiceDate", TODAY.toString());
    body.put("dueDate", TODAY.plusDays(30).toString());
    body.put("net", Map.of("amount", net, "currency", "TRY"));
    body.put("vat", Map.of("amount", vat, "currency", "TRY"));
    return id(sendJson(w.t(), null, post(FINANCE + "/purchase-invoices"), body));
  }

  private void reverse(World w, UUID transactionId) throws Exception {
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/accounts/transactions/" + transactionId + "/reverse"),
            Map.of("date", TODAY.toString(), "description", "Ters"))
        .andExpect(status().isOk());
  }

  private void postManual(
      World w, UUID accountId, String branch, String direction, String amount, LocalDate date)
      throws Exception {
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/accounts/" + accountId + "/transactions"),
            Map.of(
                "branchId",
                branch,
                "direction",
                direction,
                "money",
                Map.of("amount", amount, "currency", "TRY"),
                "date",
                date.toString()))
        .andExpect(status().isCreated());
  }

  private UUID rollover(World w, UUID accountId, LocalDate date) {
    return rollover(w, accountId, date, true);
  }

  /** Carinin tek aktif sezonu olabilir (account_rollover_active_uq); ek sezonlar pasif yazılır. */
  private UUID rollover(World w, UUID accountId, LocalDate date, boolean active) {
    UUID id = UUID.randomUUID();
    Timestamp now = Timestamp.from(Instant.now());
    jdbc.update(
        "insert into \"%s\".account_rollover (id, account_id, rollover_date, season_name, active,"
                .formatted(w.schema())
            + " created_by, created_at, updated_by, updated_at) values (?, ?, ?, ?, ?,"
            + " 'test', ?, 'test', ?)",
        id,
        accountId,
        date,
        "Sezon",
        active,
        now,
        now);
    return id;
  }

  /** Kırılımda verilen segmentin (tek para birimi) satırı. */
  private static JsonNode segment(JsonNode breakdown, String name) {
    for (JsonNode row : breakdown.get("rows")) {
      if (name.equals(row.get("segment").asText())) {
        return row;
      }
    }
    throw new AssertionError("Segment yok: " + name + " " + breakdown);
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

  private JsonNode freightInvoice(World w, UUID shipment) throws Exception {
    return body(
        sendJson(
                w.t(),
                null,
                post("/api/v1/shipment/shipments/" + shipment + "/invoice"),
                Map.of("invoiceDate", TODAY.toString(), "dueDate", TODAY.plusDays(30).toString()))
            .andExpect(status().isCreated()));
  }
}
