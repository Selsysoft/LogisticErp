package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Fatura eşleştirme yazım yolu ve açık kalem ucu (12.2a §3.3, §3.7, §6.2 {@code
 * SettlementAllocationIT}): beş hedef türü, ret nedenleri, tutar sınırları, eşzamanlılık, iptal ve
 * fatura iptali etkisi, FIFO yaşlandırma ve eksik fatura değişmezliği, LIMITED kapsam ve plan
 * ödemeleri.
 */
class SettlementAllocationIT extends SettlementTestSupport {

  @Test
  void tahsilatVeOdemeBesHedefTuruneEslesir() throws Exception {
    World w = world("sa1");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID freight = freightInvoice(w, customer, w.a1(), w.companyA(), "100", "TRY");
    UUID warehouse = warehouseInvoice(w, customer, w.a2(), w.companyA(), "80");
    UUID openingR = openingInvoice(w, customer, w.a1(), w.companyA(), "RECEIVABLE", "60", null);
    UUID sales =
        accountDocument(w, customer, w.a1(), w.companyA(), "RECEIVABLE", "SATIS_FATURASI", "40");
    String collection =
        id(
            collect(
                w,
                null,
                withAllocations(
                    body("CASH", customer, w.a1(), w.fundA1(), "250"),
                    List.of(
                        allocation("FREIGHT_INVOICE", freight, "100"),
                        allocation("WAREHOUSE_INVOICE", warehouse, "50.5"),
                        allocation("OPENING_INVOICE", openingR, "60"),
                        allocation("ACCOUNT_DOCUMENT", sales, "39.5"))),
                null));
    assertThat(
            count(
                w,
                "select count(*) from %s.settlement_allocation where settlement_id = ?::uuid"
                    + " and company_id = ?::uuid and currency = 'TRY' and deleted = false",
                collection,
                w.companyA()))
        .isEqualTo(4);
    assertThat(
            row(
                w,
                "select amount, target_type from %s.settlement_allocation"
                    + " where warehouse_invoice_id = ?",
                warehouse))
        .containsEntry("target_type", "WAREHOUSE_INVOICE");
    assertThat(
            count(
                w,
                "select count(*) from %s.settlement_allocation where account_document_id = ?"
                    + " and amount = 39.5",
                sales))
        .isEqualTo(1);

    UUID supplier = account(w, AccountType.SUPPLIER, null);
    UUID purchase = purchaseInvoice(w, supplier, w.a1(), "70");
    UUID openingP = openingInvoice(w, supplier, w.a1(), w.companyA(), "PAYABLE", "30", null);
    UUID bought =
        accountDocument(w, supplier, w.a1(), w.companyA(), "PAYABLE", "ALIS_FATURASI", "20");
    String payment =
        id(
            pay(
                w,
                null,
                withAllocations(
                    body("CASH", supplier, w.a1(), w.fundA1(), "120"),
                    List.of(
                        allocation("PURCHASE_INVOICE", purchase, "70"),
                        allocation("OPENING_INVOICE", openingP, "30"),
                        allocation("ACCOUNT_DOCUMENT", bought, "20"))),
                null));
    assertThat(
            count(
                w,
                "select count(*) from %s.settlement_allocation where settlement_id = ?::uuid",
                payment))
        .isEqualTo(3);

    // Açık kalemler (B3): tamamı eşleşenler listede yok, kısmi eşleşen kalanla.
    JsonNode receivables = openInvoices(w, null, "COLLECTION", customer, w.a1());
    assertThat(receivables.findValuesAsText("id"))
        .containsExactlyInAnyOrder(warehouse.toString(), sales.toString());
    for (JsonNode row : receivables) {
      if (row.get("id").asText().equals(warehouse.toString())) {
        assertThat(row.get("allocated").asText()).isEqualTo("50.5000");
        assertThat(row.get("remaining").asText()).isEqualTo("29.5000");
        assertThat(row.get("typeName").asText()).isEqualTo("Depo Faturası");
        assertThat(row.get("branchId").asText()).isEqualTo(w.a2());
      } else {
        assertThat(row.get("remaining").asText()).isEqualTo("0.5000");
        assertThat(row.get("typeName").asText()).isEqualTo("Satış Faturası");
      }
    }
    assertThat(openInvoices(w, null, "PAYMENT", supplier, w.a1()).size()).isZero();
  }

  @Test
  void gecersizHedefler() throws Exception {
    World w = world("sa2");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID otherCustomer = account(w, AccountType.CUSTOMER, null);
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    UUID freight = freightInvoice(w, customer, w.a1(), w.companyA(), "100", "TRY");
    UUID foreign = freightInvoice(w, otherCustomer, w.a1(), w.companyA(), "100", "TRY");
    UUID companyB = freightInvoice(w, customer, w.b1(), w.companyB(), "100", "TRY");
    UUID usd = freightInvoice(w, customer, w.a1(), w.companyA(), "100", "USD");
    UUID cancelled = freightInvoice(w, customer, w.a1(), w.companyA(), "100", "TRY");
    update(w, "update %s.freight_invoice set status = 'CANCELLED' where id = ?", cancelled);
    UUID other = accountDocument(w, customer, w.a1(), w.companyA(), "RECEIVABLE", "DIGER", "10");
    UUID openingPayable = openingInvoice(w, customer, w.a1(), w.companyA(), "PAYABLE", "10", null);

    // Ödemede navlun faturası ters taraftır.
    reason(
        pay(w, null, single(w, "CASH", customer, "FREIGHT_INVOICE", freight, "10"), null), "SIDE");
    // Tahsilatta borç (PAYABLE) açılış faturası ters taraftır.
    reason(
        collect(w, null, single(w, "CASH", customer, "OPENING_INVOICE", openingPayable, "5"), null),
        "SIDE");
    reason(
        collect(w, null, single(w, "CASH", customer, "FREIGHT_INVOICE", foreign, "10"), null),
        "ACCOUNT");
    reason(
        collect(w, null, single(w, "CASH", customer, "FREIGHT_INVOICE", companyB, "10"), null),
        "COMPANY");
    reason(
        collect(w, null, single(w, "CASH", customer, "FREIGHT_INVOICE", usd, "10"), null),
        "CURRENCY");
    reason(
        collect(w, null, single(w, "CASH", customer, "FREIGHT_INVOICE", cancelled, "10"), null),
        "CLOSED");
    // Fatura sayılmayan belge ve yanlış türle verilen kimlik yok sayılır.
    reason(
        collect(w, null, single(w, "CASH", customer, "ACCOUNT_DOCUMENT", other, "5"), null),
        "NOT_FOUND");
    reason(
        collect(w, null, single(w, "CASH", customer, "WAREHOUSE_INVOICE", freight, "5"), null),
        "NOT_FOUND");
    reason(
        collect(
            w, null, single(w, "CASH", customer, "FREIGHT_INVOICE", UUID.randomUUID(), "5"), null),
        "NOT_FOUND");
    // Carisiz gider ödemesi eşleştirilemez.
    Map<String, Object> expense =
        withAllocations(
            body("CASH", null, w.a1(), w.fundA1(), "10"),
            List.of(
                allocation("PURCHASE_INVOICE", purchaseInvoice(w, supplier, w.a1(), "10"), "10")));
    expense.put("expenseItemId", expenseItem(w, "GA1"));
    expect(pay(w, null, expense, null), 422, "ALLOCATION_TARGET_INVALID");
    assertThat(count(w, "select count(*) from %s.settlement")).isZero();
    assertThat(count(w, "select count(*) from %s.settlement_allocation")).isZero();
  }

  @Test
  void tutarSinirlariVeTekrarliHedef() throws Exception {
    World w = world("sa3");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID first = freightInvoice(w, customer, w.a1(), w.companyA(), "100", "TRY");
    UUID second = freightInvoice(w, customer, w.a1(), w.companyA(), "100", "TRY");

    // Σ > tutar.
    collect(
            w,
            null,
            withAllocations(
                body("CASH", customer, w.a1(), w.fundA1(), "50"),
                List.of(
                    allocation("FREIGHT_INVOICE", first, "30"),
                    allocation("FREIGHT_INVOICE", second, "20.0001"))),
            null)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("ALLOCATION_EXCEEDS_SETTLEMENT"))
        .andExpect(jsonPath("$.details[0]").value("max=50"));
    // Kalan aşımı (önce 70 eşleşir, kalan 30).
    collect(w, null, single(w, "CASH", customer, "FREIGHT_INVOICE", first, "70"), null)
        .andExpect(status().isCreated());
    collect(
            w,
            null,
            withAllocations(
                body("CASH", customer, w.a1(), w.fundA1(), "100"),
                List.of(allocation("FREIGHT_INVOICE", first, "30.01"))),
            null)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("ALLOCATION_EXCEEDS_REMAINING"))
        .andExpect(jsonPath("$.details[0]").value("targetId=" + first))
        .andExpect(jsonPath("$.details[1]").value("remaining=30"));
    collect(w, null, single(w, "CASH", customer, "FREIGHT_INVOICE", first, "30"), null)
        .andExpect(status().isCreated());
    // Aynı hedef iki satırda 400.
    expect(
        collect(
            w,
            null,
            withAllocations(
                body("CASH", customer, w.a1(), w.fundA1(), "50"),
                List.of(
                    allocation("FREIGHT_INVOICE", second, "10"),
                    allocation("FREIGHT_INVOICE", second, "10"))),
            null),
        400,
        "ALLOCATION_DUPLICATE_TARGET");
    // Sıfır tutar ve 4'ten çok ondalık doğrulama hatası.
    collect(w, null, single(w, "CASH", customer, "FREIGHT_INVOICE", second, "0"), null)
        .andExpect(status().isBadRequest());
    collect(w, null, single(w, "CASH", customer, "FREIGHT_INVOICE", second, "1.00001"), null)
        .andExpect(status().isBadRequest());
  }

  @Test
  void esZamanliIkiTahsilatAyniFaturaninTumKalanini() throws Exception {
    World w = world("sa4");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID invoice = freightInvoice(w, customer, w.a1(), w.companyA(), "100", "TRY");
    List<ResultActions> results =
        concurrently(
            () ->
                collect(
                    w, null, single(w, "CASH", customer, "FREIGHT_INVOICE", invoice, "100"), null),
            () ->
                collect(
                    w,
                    null,
                    withAllocations(
                        body("CASH", customer, w.a2(), w.fundA2(), "100"),
                        List.of(allocation("FREIGHT_INVOICE", invoice, "100"))),
                    null));
    assertThat(results.stream().map(SettlementAllocationIT::code).toList())
        .containsExactlyInAnyOrder(201, 422);
    for (ResultActions result : results) {
      if (code(result) == 422) {
        assertThat(body(result).get("code").asText()).isEqualTo("ALLOCATION_EXCEEDS_REMAINING");
      }
    }
    assertThat(count(w, "select count(*) from %s.settlement")).isEqualTo(1);
    assertThat(count(w, "select count(*) from %s.settlement_allocation")).isEqualTo(1);
  }

  @Test
  void iptalKalaniGeriGetirirFaturaIptaliEslesmeyiKapatir() throws Exception {
    World w = world("sa5");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID invoice = freightInvoice(w, customer, w.a1(), w.companyA(), "100", "TRY");
    String collection =
        id(collect(w, null, single(w, "CASH", customer, "FREIGHT_INVOICE", invoice, "100"), null));
    assertThat(openInvoices(w, null, "COLLECTION", customer, w.a1()).findValuesAsText("id"))
        .doesNotContain(invoice.toString());
    reverse(w, null, collection, TODAY, null).andExpect(status().isOk());
    JsonNode reopened = openInvoices(w, null, "COLLECTION", customer, w.a1());
    assertThat(reopened.findValuesAsText("id")).containsExactly(invoice.toString());
    assertThat(reopened.get(0).get("remaining").asText()).isEqualTo("100.0000");
    // Eşleşme satırı değişmez (S-3), ama REVERSED kaydınki sayılmaz.
    assertThat(
            count(
                w,
                "select count(*) from %s.settlement_allocation where settlement_id = ?::uuid"
                    + " and deleted = false",
                collection))
        .isEqualTo(1);
    // Detayda yalnız kaydın iptali eşleşmeyi pasifler (hedef iptal değil; §6.2 (5)).
    JsonNode reversedAllocation =
        body(send(w.t(), null, get(SETTLEMENTS + "/" + collection)).andExpect(status().isOk()))
            .get("allocations")
            .get(0);
    assertThat(reversedAllocation.get("active").asBoolean()).isFalse();
    assertThat(reversedAllocation.get("targetCancelled").asBoolean()).isFalse();
    collect(w, null, single(w, "CASH", customer, "FREIGHT_INVOICE", invoice, "100"), null)
        .andExpect(status().isCreated());

    // Fatura iptali: iptal edilmiş hedefe yeni eşleşme yapılamaz.
    UUID cancelled = freightInvoice(w, customer, w.a1(), w.companyA(), "50", "TRY");
    String partial =
        id(collect(w, null, single(w, "CASH", customer, "FREIGHT_INVOICE", cancelled, "20"), null));
    assertThat(openInvoices(w, null, "COLLECTION", customer, w.a1()).findValuesAsText("id"))
        .contains(cancelled.toString());
    update(w, "update %s.freight_invoice set status = 'CANCELLED' where id = ?", cancelled);
    assertThat(openInvoices(w, null, "COLLECTION", customer, w.a1()).findValuesAsText("id"))
        .doesNotContain(cancelled.toString());
    JsonNode badge =
        body(send(w.t(), null, get(SETTLEMENTS + "/" + partial)).andExpect(status().isOk()))
            .get("allocations")
            .get(0);
    assertThat(badge.get("targetCancelled").asBoolean()).isTrue();
    assertThat(badge.get("active").asBoolean()).isFalse();
    reason(
        collect(w, null, single(w, "CASH", customer, "FREIGHT_INVOICE", cancelled, "10"), null),
        "CLOSED");
  }

  @Test
  void yaslandirmaVeEksikFaturaEslestirmedenEtkilenmez() throws Exception {
    World w = world("sa7");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    UUID first = purchaseInvoice(w, supplier, w.a1(), "100");
    UUID second = purchaseInvoice(w, supplier, w.a1(), "200");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID sales =
        accountDocument(w, customer, w.a1(), w.companyA(), "RECEIVABLE", "SATIS_FATURASI", "90");
    // SQL ile eklenen belge deftere yazılmadığından alacak defter satırı elle.
    manual(w, customer, w.a1(), Direction.DEBIT, "90", "TRY");
    // Eksik fatura için faturasız iki ödeme/tahsilat daha.
    pay(w, null, body("CASH", supplier, w.a1(), w.fundA1(), "5"), null)
        .andExpect(status().isCreated());
    collect(w, null, body("CASH", customer, w.a1(), w.fundA1(), "7"), null)
        .andExpect(status().isCreated());
    // İkinci (yeni) faturaya eşleşen ödeme: FIFO yine eski faturayı kapatır.
    pay(w, null, single(w, "CASH", supplier, "PURCHASE_INVOICE", second, "150"), null)
        .andExpect(status().isCreated());
    collect(w, null, single(w, "CASH", customer, "ACCOUNT_DOCUMENT", sales, "40"), null)
        .andExpect(status().isCreated());
    assertThat(first).isNotNull();

    String withAllocation = snapshot(w);
    assertThat(count(w, "select count(*) from %s.settlement_allocation")).isEqualTo(2);
    update(w, "update %s.settlement_allocation set deleted = true");
    assertThat(snapshot(w)).isEqualTo(withAllocation);
  }

  @Test
  void limitedKullaniciKapsamDisiFaturayiEslestiremez() throws Exception {
    World w = world("sa8");
    String a1User = limitedUser(w, "a1", "FINANCE", List.of(w.a1()));
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID a2Invoice = freightInvoice(w, customer, w.a2(), w.companyA(), "100", "TRY");
    UUID a1Invoice = freightInvoice(w, customer, w.a1(), w.companyA(), "100", "TRY");
    expect(
        collect(w, a1User, single(w, "CASH", customer, "FREIGHT_INVOICE", a2Invoice, "10"), null),
        403,
        "BRANCH_OUT_OF_SCOPE");
    assertThat(openInvoices(w, a1User, "COLLECTION", customer, w.a1()).findValuesAsText("id"))
        .containsExactly(a1Invoice.toString());
    assertThat(openInvoices(w, null, "COLLECTION", customer, w.a1()).findValuesAsText("id"))
        .containsExactlyInAnyOrder(a1Invoice.toString(), a2Invoice.toString());
    collect(w, a1User, single(w, "CASH", customer, "FREIGHT_INVOICE", a1Invoice, "10"), null)
        .andExpect(status().isCreated());
    assertThat(count(w, "select count(*) from %s.settlement")).isEqualTo(1);
  }

  @Test
  void ayniFonVeFaturadaOlusturmaIleDuzeltmeKilitlenmeyeGirmez() throws Exception {
    World w = world("sa9");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    for (int round = 0; round < 3; round++) {
      UUID invoice = purchaseInvoice(w, supplier, w.a1(), "100");
      String existing = id(pay(w, null, body("BANK", supplier, w.a1(), bank, "10"), null));
      Map<String, Object> request = single(w, "BANK", supplier, "PURCHASE_INVOICE", invoice, "100");
      request.put("fundAccountId", bank);
      List<ResultActions> results =
          concurrently(
              () -> pay(w, null, request, null),
              () -> correct(w, null, existing, null, request, null));
      List<Integer> codes = results.stream().map(SettlementAllocationIT::code).toList();
      assertThat(codes).allMatch(c -> c == 201 || c == 422).contains(201);
      for (ResultActions result : results) {
        if (code(result) == 422) {
          assertThat(body(result).get("code").asText()).isEqualTo("ALLOCATION_EXCEEDS_REMAINING");
        }
      }
      assertThat(
              count(
                  w,
                  "select count(*) from %s.settlement_allocation a join %s.settlement s"
                      + " on s.id = a.settlement_id where s.status = 'POSTED'"
                      + " and a.purchase_invoice_id = ?",
                  invoice))
          .isEqualTo(1);
    }
  }

  @Test
  void planOdemeleriEslesenTutaraSayilir() throws Exception {
    World w = world("sa10");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");

    // Alış faturası planı ödendi: kalan 0.
    UUID paid = purchaseInvoice(w, supplier, w.a1(), "100");
    UUID planPayment = payPlan(w, planOf(w, paid), bank, "BANK");
    assertThat(openInvoices(w, null, "PAYMENT", supplier, w.a1()).findValuesAsText("id"))
        .doesNotContain(paid.toString());
    remaining(
        pay(w, null, single(w, "CASH", supplier, "PURCHASE_INVOICE", paid, "1"), null), paid, "0");
    // Plan ödemesi iptal edilmiş sayılınca (REVERSED) kalan geri gelir.
    update(
        w,
        "update %s.settlement set status = 'REVERSED', reversed_on = ? where id = ?",
        TODAY,
        planPayment);
    pay(w, null, single(w, "CASH", supplier, "PURCHASE_INVOICE", paid, "100"), null)
        .andExpect(status().isCreated());

    // Kısmi: fatura 300, elle 100 eşleşme → kalan 200.
    UUID partial = purchaseInvoice(w, supplier, w.a1(), "300");
    pay(w, null, single(w, "CASH", supplier, "PURCHASE_INVOICE", partial, "100"), null)
        .andExpect(status().isCreated());
    JsonNode partialRow = openRow(w, supplier, partial);
    assertThat(partialRow.get("allocated").asText()).isEqualTo("100.0000");
    assertThat(partialRow.get("remaining").asText()).isEqualTo("200.0000");
    remaining(
        pay(w, null, single(w, "CASH", supplier, "PURCHASE_INVOICE", partial, "250"), null),
        partial,
        "200");

    // Açılış faturası planı (payment_plan_id): plan 50 ödendi → 80'lik faturanın kalanı 30.
    UUID plan = manualPlan(w, supplier, w.a1(), "50");
    UUID opening = openingInvoice(w, supplier, w.a1(), w.companyA(), "PAYABLE", "80", plan);
    payPlan(w, plan, bank, "BANK");
    JsonNode openingRow = openRow(w, supplier, opening);
    assertThat(openingRow.get("allocated").asText()).isEqualTo("50.0000");
    assertThat(openingRow.get("remaining").asText()).isEqualTo("30.0000");
    remaining(
        pay(w, null, single(w, "CASH", supplier, "OPENING_INVOICE", opening, "31"), null),
        opening,
        "30");
    pay(w, null, single(w, "CASH", supplier, "OPENING_INVOICE", opening, "30"), null)
        .andExpect(status().isCreated());
  }

  @Test
  void belgeToplamiYansiyanTutarla() throws Exception {
    World w = world("sa11");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID doc =
        accountDocument(
            w,
            customer,
            w.a1(),
            w.companyA(),
            "RECEIVABLE",
            "SATIS_FATURASI",
            "100",
            true,
            "95",
            null);
    documentTotal(w, customer, doc, "95");
  }

  @Test
  void belgeToplamiYansimayanVergiliNetOdenecekle() throws Exception {
    World w = world("sa12");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID doc =
        accountDocument(
            w,
            customer,
            w.a1(),
            w.companyA(),
            "RECEIVABLE",
            "SATIS_FATURASI",
            "100",
            false,
            null,
            "90");
    documentTotal(w, customer, doc, "90");

    // Vergi satırı silinmişse (iki sorguda da deleted süzgeci) toplam tutara döner: kalan 10.
    update(w, "update %s.account_document_tax set deleted = true where document_id = ?", doc);
    JsonNode row = openRow(w, "COLLECTION", customer, doc);
    assertThat(row.get("total").asText()).isEqualTo("100.0000");
    assertThat(row.get("remaining").asText()).isEqualTo("10.0000");
    remaining(
        collect(w, null, single(w, "CASH", customer, "ACCOUNT_DOCUMENT", doc, "10.01"), null),
        doc,
        "10");
    collect(w, null, single(w, "CASH", customer, "ACCOUNT_DOCUMENT", doc, "10"), null)
        .andExpect(status().isCreated());
  }

  @Test
  void belgeToplamiYansimayanVergisizTutarla() throws Exception {
    World w = world("sa13");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID doc =
        accountDocument(
            w,
            customer,
            w.a1(),
            w.companyA(),
            "RECEIVABLE",
            "SATIS_FATURASI",
            "100",
            false,
            null,
            null);
    documentTotal(w, customer, doc, "100");
  }

  // --- yardımcılar

  /**
   * Belge toplamı (12.2a §3.3) okuma (açık kalemler) ve yazma (kalan aşımı) yolunda aynı: satır
   * toplamı ve kalanı {@code total}; bir kuruş fazlası 422, tamamı 201.
   */
  private void documentTotal(World w, UUID customer, UUID doc, String total) throws Exception {
    JsonNode row = openRow(w, "COLLECTION", customer, doc);
    assertThat(row.get("total").asText()).isEqualTo(total + ".0000");
    assertThat(row.get("remaining").asText()).isEqualTo(total + ".0000");
    remaining(
        collect(
            w,
            null,
            withAllocations(
                body("CASH", customer, w.a1(), w.fundA1(), "200"),
                List.of(
                    allocation(
                        "ACCOUNT_DOCUMENT", doc, new BigDecimal(total).add(CENT).toString()))),
            null),
        doc,
        total);
    collect(w, null, single(w, "CASH", customer, "ACCOUNT_DOCUMENT", doc, total), null)
        .andExpect(status().isCreated());
  }

  private static final BigDecimal CENT = new BigDecimal("0.01");

  /** Açık kalem satırı (A1). */
  private JsonNode openRow(World w, String type, UUID account, UUID target) throws Exception {
    for (JsonNode row : openInvoices(w, null, type, account, w.a1())) {
      if (row.get("id").asText().equals(target.toString())) {
        return row;
      }
    }
    throw new AssertionError("Açık kalem yok: " + target);
  }

  /** {@code GET /settlements/open-invoices} (TRY). */
  private JsonNode openInvoices(World w, String token, String type, UUID account, String branch)
      throws Exception {
    return body(
        send(
                w.t(),
                token,
                get(SETTLEMENTS + "/open-invoices")
                    .param("type", type)
                    .param("accountId", account.toString())
                    .param("branchId", branch)
                    .param("currency", "TRY"))
            .andExpect(status().isOk()));
  }

  /** Ödeme tarafı açık kalem satırı (A1). */
  private JsonNode openRow(World w, UUID supplier, UUID target) throws Exception {
    for (JsonNode row : openInvoices(w, null, "PAYMENT", supplier, w.a1())) {
      if (row.get("id").asText().equals(target.toString())) {
        return row;
      }
    }
    throw new AssertionError("Açık kalem yok: " + target);
  }

  /** Tek eşleşmeli nakit ödeme/tahsilat gövdesi (A1 kasası). */
  private static Map<String, Object> single(
      World w, String method, UUID account, String type, UUID target, String amount) {
    return withAllocations(
        body(method, account, w.a1(), w.fundA1(), amount),
        List.of(allocation(type, target, amount)));
  }

  private void reason(ResultActions result, String reason) throws Exception {
    result
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("ALLOCATION_TARGET_INVALID"))
        .andExpect(jsonPath("$.details[1]").value("reason=" + reason));
  }

  private void remaining(ResultActions result, UUID target, String remaining) throws Exception {
    result
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("ALLOCATION_EXCEEDS_REMAINING"))
        .andExpect(jsonPath("$.details[0]").value("targetId=" + target))
        .andExpect(jsonPath("$.details[1]").value("remaining=" + remaining));
  }

  /** Yaşlandırma (iki taraf) ve eksik fatura yanıtları. */
  private String snapshot(World w) throws Exception {
    StringBuilder text = new StringBuilder();
    for (String type : List.of("RECEIVABLE", "PAYABLE")) {
      JsonNode aging =
          body(
              send(
                      w.t(),
                      null,
                      get(FINANCE + "/reports/aging")
                          .param("type", type)
                          .param("asOf", TODAY.plusDays(60).toString()))
                  .andExpect(status().isOk()));
      assertThat(aging).isNotEmpty();
      text.append(aging);
    }
    for (String side : List.of("RECEIVABLE", "PAYABLE")) {
      text.append(
          body(
              send(w.t(), null, get(FINANCE + "/accounts/invoice-gaps").param("side", side))
                  .andExpect(status().isOk())));
    }
    return text.toString();
  }

  private static int code(ResultActions result) {
    return result.andReturn().getResponse().getStatus();
  }
}
