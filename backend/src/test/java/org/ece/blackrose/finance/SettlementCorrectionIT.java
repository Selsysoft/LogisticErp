package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.sql.Date;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Düzeltme (ZTO "Düzenle"; 12.2a §3.6, §6.2 {@code SettlementCorrectionIT}): eski kayıt kendi
 * tarihiyle ters, yeni kayıt {@code corrects_settlement_id} ile; idempotent tekrar, uygunluk
 * 409'ları, ödeme/tahsilat sırası, uyarı, eşleştirme, eşzamanlılık, personel ve kapsam, pasif iş
 * yeri/şirket ve cari taşıma.
 */
class SettlementCorrectionIT extends SettlementTestSupport {

  @Test
  void nakitOdemeBankaOdemesineDuzeltilir() throws Exception {
    World w = world("sc1");
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    Map<String, Object> cash = body("CASH", supplier, w.a1(), w.fundA1(), "100");
    cash.put("date", TODAY.minusDays(2).toString());
    String old = id(pay(w, null, cash, null));

    Map<String, Object> replacement = body("BANK", supplier, w.a1(), bank, "120");
    replacement.put("documentNo", "DEK-9");
    JsonNode created =
        body(
            correct(w, null, old, "Tutar hatası", replacement, "DUZ-1")
                .andExpect(status().isCreated()));
    String newId = created.get("id").asText();
    assertThat(newId).isNotEqualTo(old);
    assertThat(created.get("correctsSettlementId").asText()).isEqualTo(old);
    assertThat(created.get("status").asText()).isEqualTo("POSTED");
    assertThat(created.get("method").asText()).isEqualTo("BANK");
    assertThat(created.get("channel").asText()).isEqualTo("TRANSFER");
    assertThat(created.get("documentNo").asText()).isEqualTo("DEK-9");
    assertThat(created.get("settlementDate").asText()).isEqualTo(TODAY.toString());

    // Eski kayıt kendi tarihiyle iptal; gerekçe saklı; ters satırlar eski tarihte.
    assertThat(
            row(
                w,
                "select status, reversed_on, reverse_reason from %s.settlement where id = ?::uuid",
                old))
        .containsEntry("status", "REVERSED")
        .containsEntry("reversed_on", Date.valueOf(TODAY.minusDays(2)))
        .containsEntry("reverse_reason", "Tutar hatası");
    assertThat(
            count(
                w,
                "select count(*) from %s.account_transaction where source_type = 'REVERSAL'"
                    + " and transaction_date = ? and description = 'Tutar hatası'",
                TODAY.minusDays(2)))
        .isEqualTo(1);
    assertThat(
            count(
                w,
                "select count(*) from %s.fund_transaction where source_type = 'REVERSAL'"
                    + " and transaction_date = ?",
                TODAY.minusDays(2)))
        .isEqualTo(1);
    // Net etki yalnız yeni kayıt.
    assertThat(accountNet(w, supplier)).isEqualByComparingTo("120");
    assertThat(fundNet(w, w.fundA1())).isEqualByComparingTo("0");
    assertThat(fundNet(w, bank)).isEqualByComparingTo("-120");
    assertThat(audits(w, "SETTLEMENT_CORRECTED", "SETTLEMENT:" + old)).isEqualTo(1);
    assertThat(row(w, "select details from %s.audit_log where event_type = 'SETTLEMENT_CORRECTED'"))
        .containsEntry("details", "new=" + newId);
    // Kullanıcı iptali değil: SETTLEMENT_REVERSED yazılmaz.
    assertThat(audits(w, "SETTLEMENT_REVERSED", "SETTLEMENT:" + old)).isZero();

    // (2) Aynı anahtarla tekrar: aynı yeni kayıt, ikinci ters yok.
    JsonNode again =
        body(
            correct(w, null, old, "Tutar hatası", replacement, "DUZ-1")
                .andExpect(status().isCreated()));
    assertThat(again.get("id").asText()).isEqualTo(newId);
    assertThat(count(w, "select count(*) from %s.settlement")).isEqualTo(2);
    assertThat(
            count(w, "select count(*) from %s.account_transaction where source_type = 'REVERSAL'"))
        .isEqualTo(1);

    // (3) Farklı anahtarla ikinci düzeltme 409 (yeni kayda yönlendirir); anahtarsız da aynı.
    correct(w, null, old, null, replacement, "DUZ-2")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("SETTLEMENT_ALREADY_CORRECTED"))
        .andExpect(jsonPath("$.details[0]").value("correctedById=" + newId));
    expect(correct(w, null, old, null, replacement, null), 409, "SETTLEMENT_ALREADY_CORRECTED");
    // Başka kayda bağlı anahtar 422.
    String keyed =
        id(pay(w, null, body("CASH", supplier, w.a1(), w.fundA1(), "5"), "ODEME-ANAHTAR"));
    expect(
        correct(w, null, newId, null, replacement, "ODEME-ANAHTAR"), 422, "IDEMPOTENCY_KEY_REUSED");
    expect(correct(w, null, keyed, null, replacement, "DUZ-1"), 422, "IDEMPOTENCY_KEY_REUSED");
    // Düzeltmesiz iptal edilmiş kayıt 409 SETTLEMENT_REVERSED; bilinmeyen kayıt 404.
    reverse(w, null, keyed, TODAY, null).andExpect(status().isOk());
    expect(correct(w, null, keyed, null, replacement, null), 409, "SETTLEMENT_REVERSED");
    expect(
        correct(w, null, UUID.randomUUID(), null, replacement, null), 404, "SETTLEMENT_NOT_FOUND");
    // Sunucu virman anahtarı kullanılamaz.
    expect(correct(w, null, newId, null, replacement, "ict:x"), 400, "IDEMPOTENCY_KEY_INVALID");
  }

  @Test
  void uygunOlmayanKayitlarVeYeniIstekKurallari() throws Exception {
    World w = world("sc4");
    String bankA = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    String bankB = bankFund(w, "BANKA-B1", w.b1(), "TRY");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    UUID customer = account(w, AccountType.CUSTOMER, null);
    Map<String, Object> replacement = body("CASH", supplier, w.a1(), w.fundA1(), "10");

    // Çekli kayıt.
    Map<String, Object> check = body("CHECK", supplier, w.a1(), null, "30");
    check.put(
        "instrument",
        Map.of("kind", "CHECK", "number", "1112223", "dueDate", TODAY.plusDays(30).toString()));
    String checkPayment = id(pay(w, null, check, null));
    expect(
        correct(w, null, checkPayment, null, replacement, null),
        409,
        "SETTLEMENT_CHECK_NOT_REVERSIBLE");
    // Plan ödemesi.
    UUID planPayment = payPlan(w, manualPlan(w, supplier, w.a1(), "20"), bankA, "BANK");
    expect(
        correct(w, null, planPayment, null, replacement, null), 409, "SETTLEMENT_LINKED_TO_PLAN");
    // Şirketler arası virman bacağı.
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
    expect(
        correct(w, null, leg, null, replacement, null), 409, "SETTLEMENT_LINKED_TO_INTERCOMPANY");
    // Döviz bozumu kaynağı tahsilat (kaynak satırı SQL ile).
    String collection = id(collect(w, null, body("BANK", customer, w.a1(), bankA, "50"), null));
    String bankA2 = bankFund(w, "BANKA-A2", w.a1(), "TRY");
    UUID transfer =
        insert(
            w,
            "fund_transfer",
            Map.of(
                "company_id",
                w.companyAId(),
                "transfer_type",
                "VIREMENT",
                "transfer_date",
                TODAY,
                "source_fund_id",
                UUID.fromString(bankA),
                "source_currency",
                "TRY",
                "target_fund_id",
                UUID.fromString(bankA2),
                "target_currency",
                "TRY"));
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
            new BigDecimal("10")));
    expect(
        correct(w, null, collection, null, body("CASH", customer, w.a1(), w.fundA1(), "50"), null),
        409,
        "SETTLEMENT_USED_IN_FX_EXCHANGE");
    // Araç gideri (carisiz) ödemesi: bağ denetimi carisiz denetiminden önce.
    UUID expensePayment =
        settlementOfExpense(w, vehicleExpense(w, vehicle(w, "06SC04"), w.a1(), w.fundA1(), "12"));
    expect(
        correct(w, null, expensePayment, null, replacement, null),
        409,
        "SETTLEMENT_SOURCE_MANAGED");
    // Carisiz doğrudan gider ödemesi.
    Map<String, Object> direct = body("CASH", null, w.a1(), w.fundA1(), "8");
    direct.put("expenseItemId", expenseItem(w, "GK1"));
    String directPayment = id(pay(w, null, direct, null));
    expect(
        correct(w, null, directPayment, null, replacement, null),
        409,
        "SETTLEMENT_NOT_CORRECTABLE");

    // Yeni istek kuralları: çek yöntemi 400; başka şirketin iş yeri 422; pasif fon 422.
    String payment = id(pay(w, null, body("CASH", supplier, w.a1(), w.fundA1(), "40"), null));
    Map<String, Object> toCheck = body("CHECK", supplier, w.a1(), null, "40");
    toCheck.put(
        "instrument",
        Map.of("kind", "CHECK", "number", "1112224", "dueDate", TODAY.plusDays(30).toString()));
    expect(correct(w, null, payment, null, toCheck, null), 400, "CORRECTION_METHOD_INVALID");
    expect(
        correct(w, null, payment, null, body("CASH", supplier, w.b1(), w.fundB1(), "40"), null),
        422,
        "COMPANY_MISMATCH");
    setFundActive(w, bankA2, false);
    expect(
        correct(w, null, payment, null, body("BANK", supplier, w.a1(), bankA2, "40"), null),
        422,
        "FUND_INACTIVE");
    // Başka iş yerine (aynı şirket) ve başka cariye düzeltme yapılabilir.
    UUID otherSupplier = account(w, AccountType.SUPPLIER, null);
    JsonNode moved =
        body(
            correct(
                    w,
                    null,
                    payment,
                    null,
                    body("CASH", otherSupplier, w.a2(), w.fundA2(), "40"),
                    null)
                .andExpect(status().isCreated()));
    assertThat(moved.get("branchId").asText()).isEqualTo(w.a2());
    assertThat(accountNet(w, otherSupplier)).isEqualByComparingTo("40");
    // Bunların hiçbiri (başarılı düzeltme dışında) kayıt yazmadı.
    assertThat(
            count(w, "select count(*) from %s.settlement where corrects_settlement_id is not null"))
        .isEqualTo(1);
  }

  @Test
  void tahsilatDuzeltmesiAyniKasadaYetersizBakiyeVermez() throws Exception {
    World w = world("sc5");
    String strict = strictCash(w, "KASA-S", w.a1());
    UUID customer = account(w, AccountType.CUSTOMER, null);
    String collection = id(collect(w, null, body("CASH", customer, w.a1(), strict, "100"), null));
    assertThat(fundNet(w, strict)).isEqualByComparingTo("100");

    JsonNode created =
        body(
            correct(w, null, collection, null, body("CASH", customer, w.a1(), strict, "80"), null)
                .andExpect(status().isCreated()));
    assertThat(created.get("correctsSettlementId").asText()).isEqualTo(collection);
    assertThat(fundNet(w, strict)).isEqualByComparingTo("80");
    assertThat(accountNet(w, customer)).isEqualByComparingTo("-80");
    // Ödeme düzeltmesi de önce eski ödemeyi geri aldığından sıkı kasada aynı tutara geçer.
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    String payment = id(pay(w, null, body("CASH", supplier, w.a1(), strict, "80"), null));
    assertThat(fundNet(w, strict)).isEqualByComparingTo("0");
    correct(w, null, payment, null, body("CASH", supplier, w.a1(), strict, "80"), null)
        .andExpect(status().isCreated());
    assertThat(fundNet(w, strict)).isEqualByComparingTo("0");
  }

  @Test
  void odemeDuzeltmesindeUyariEskiOdemeGeriAlinmisBakiyeyle() throws Exception {
    World w = world("sc6");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    manual(w, supplier, w.a1(), Direction.CREDIT, "100", "TRY");
    Map<String, Object> exact = body("CASH", supplier, w.a1(), w.fundA1(), "100");
    exact.remove("confirmWarnings");
    String first = id(pay(w, null, exact, null));

    // Aynı tutara düzeltme: borç tam tutar kadar → onay istenmez.
    String second = id(correct(w, null, first, null, exact, null));
    // Borcu aşan düzeltme: 409, işlem tümüyle geri alınır.
    Map<String, Object> more = body("CASH", supplier, w.a1(), w.fundA1(), "130");
    more.remove("confirmWarnings");
    expect(correct(w, null, second, null, more, null), 409, "CONFIRMATION_REQUIRED");
    assertThat(row(w, "select status, reversed_on from %s.settlement where id = ?::uuid", second))
        .containsEntry("status", "POSTED")
        .containsEntry("reversed_on", null);
    assertThat(
            count(
                w,
                "select count(*) from %s.account_transaction r join %s.account_transaction o"
                    + " on r.source_type = 'REVERSAL' and r.source_id = o.id"
                    + " where o.source_type = 'SETTLEMENT' and o.source_id = ?::uuid",
                second))
        .isZero();
    assertThat(count(w, "select count(*) from %s.settlement")).isEqualTo(2);
    // Onaylı: 201 + SETTLEMENT_ALLOCATION_OVERRIDE (yeni kayıt hedefiyle).
    more.put("confirmWarnings", true);
    String third = id(correct(w, null, second, null, more, null));
    assertThat(audits(w, "SETTLEMENT_ALLOCATION_OVERRIDE", "SETTLEMENT:" + third)).isEqualTo(1);
    assertThat(accountNet(w, supplier)).isEqualByComparingTo("30");
  }

  @Test
  void eslestirmeliTahsilatDuzeltmesiEskiEslesmeyiHaricTutar() throws Exception {
    World w = world("sc7");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID invoice = freightInvoice(w, customer, w.a1(), w.companyA(), "100", "TRY");
    Map<String, Object> request =
        withAllocations(
            body("CASH", customer, w.a1(), w.fundA1(), "100"),
            List.of(allocation("FREIGHT_INVOICE", invoice, "100")));
    String old = id(collect(w, null, request, null));
    // Kalan 0: yeni tahsilat aynı faturaya eşleşemez.
    expect(
        collect(
            w,
            null,
            withAllocations(
                body("CASH", customer, w.a1(), w.fundA1(), "1"),
                List.of(allocation("FREIGHT_INVOICE", invoice, "1"))),
            null),
        422,
        "ALLOCATION_EXCEEDS_REMAINING");

    // Düzeltme eski eşleşmeyi serbest sayar: tam kalan kadar yeniden eşleşir.
    String created = id(correct(w, null, old, null, request, null));
    assertThat(
            count(
                w,
                "select count(*) from %s.settlement_allocation where settlement_id = ?::uuid"
                    + " and deleted = false",
                created))
        .isEqualTo(1);
    // Eski eşleşme satırı değişmez (S-3) ama artık sayılmaz; yeni eşleşme sayılır.
    assertThat(
            count(
                w,
                "select count(*) from %s.settlement_allocation where settlement_id = ?::uuid"
                    + " and deleted = false",
                old))
        .isEqualTo(1);
    expect(
        collect(
            w,
            null,
            withAllocations(
                body("CASH", customer, w.a1(), w.fundA1(), "1"),
                List.of(allocation("FREIGHT_INVOICE", invoice, "1"))),
            null),
        422,
        "ALLOCATION_EXCEEDS_REMAINING");
  }

  @Test
  void esZamanliDuzeltmeler() throws Exception {
    World w = world("sc8");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    String first = id(pay(w, null, body("CASH", supplier, w.a1(), w.fundA1(), "50"), null));
    Map<String, Object> replacement = body("CASH", supplier, w.a1(), w.fundA1(), "60");

    // Farklı anahtarlar: biri 201, diğeri 409.
    List<ResultActions> different =
        concurrently(
            () -> correct(w, null, first, null, replacement, "E-1"),
            () -> correct(w, null, first, null, replacement, "E-2"));
    List<Integer> codes = different.stream().map(SettlementCorrectionIT::code).toList();
    assertThat(codes).containsExactlyInAnyOrder(201, 409);
    for (ResultActions result : different) {
      if (code(result) == 409) {
        assertThat(body(result).get("code").asText())
            .isIn("SETTLEMENT_ALREADY_CORRECTED", "SETTLEMENT_REVERSED");
      }
    }
    assertThat(reversalsOf(w, first)).isEqualTo(1);

    // Aynı anahtar: ikisi de 201, aynı yeni kayıt, tek ters kayıt (Rev 1 F-6).
    String second = id(pay(w, null, body("CASH", supplier, w.a1(), w.fundA1(), "70"), null));
    List<ResultActions> same =
        concurrently(
            () -> correct(w, null, second, null, replacement, "AYNI"),
            () -> correct(w, null, second, null, replacement, "AYNI"));
    Set<String> ids = new HashSet<>();
    for (ResultActions result : same) {
      assertThat(code(result)).isEqualTo(201);
      ids.add(body(result).get("id").asText());
    }
    assertThat(ids).hasSize(1);
    assertThat(reversalsOf(w, second)).isEqualTo(1);
    assertThat(count(w, "select count(*) from %s.settlement where idempotency_key = 'AYNI'"))
        .isEqualTo(1);
  }

  @Test
  void personelVeKapsam() throws Exception {
    World w = world("sc9");
    String finance = userWithRole(w, "finans", "FINANCE");
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    String employeePayment =
        id(pay(w, null, body("CASH", employee, w.a1(), w.fundA1(), "70"), null));
    Map<String, Object> replacement = body("CASH", supplier, w.a1(), w.fundA1(), "70");

    // (9) İzinsiz kullanıcıya personel carili kayıt yok (kod SETTLEMENT_NOT_FOUND).
    expect(
        correct(w, finance, employeePayment, null, replacement, null), 404, "SETTLEMENT_NOT_FOUND");
    // (12) Düzeltme önizlemesi de aynı.
    expect(check(w, finance, "PAYMENT", employeePayment, replacement), 404, "SETTLEMENT_NOT_FOUND");
    assertThat(row(w, "select status from %s.settlement where id = ?::uuid", employeePayment))
        .containsEntry("status", "POSTED");
    // İzinsiz kullanıcı personel carili kaydın düzeltmesini anahtarıyla da alamaz.
    correct(w, null, employeePayment, null, replacement, "PERS-K").andExpect(status().isCreated());
    expect(
        correct(w, finance, employeePayment, null, replacement, "PERS-K"),
        404,
        "SETTLEMENT_NOT_FOUND");

    // LIMITED kullanıcı: kapsam dışı kayıt 403; başka iş yerindeki düzeltmenin anahtarıyla 403.
    String a1User = limitedUser(w, "a1", "FINANCE", List.of(w.a1()));
    // Tekrarda yeni kaydın kapsamı (Rev 1 SEC-06, repeated() kapsam denetimi): A1 kaydı A2'ye
    // düzeltilmiş; A1 kullanıcısı anahtarla A2 kaydını alamaz (eski kayıt kendi kapsamında).
    String a1ToA2 = id(pay(w, null, body("CASH", supplier, w.a1(), w.fundA1(), "19"), null));
    String movedToA2 =
        id(
            correct(
                w, null, a1ToA2, null, body("CASH", supplier, w.a2(), w.fundA2(), "19"), "A1A2-K"));
    ResultActions crossLeak =
        correct(
            w, a1User, a1ToA2, null, body("CASH", supplier, w.a1(), w.fundA1(), "19"), "A1A2-K");
    expect(crossLeak, 403, "BRANCH_OUT_OF_SCOPE");
    assertThat(crossLeak.andReturn().getResponse().getContentAsString()).doesNotContain(movedToA2);
    // Tekrarda yeni kaydın personel denetimi (repeated() okunabilirlik): tedarikçi ödemesi personel
    // carisine düzeltilmiş; izinsiz kullanıcı anahtarla yeni kaydı alamaz.
    String supplierPayment =
        id(pay(w, null, body("CASH", supplier, w.a1(), w.fundA1(), "71"), null));
    String toEmployee =
        id(
            correct(
                w,
                null,
                supplierPayment,
                null,
                body("CASH", employee, w.a1(), w.fundA1(), "71"),
                "PERS-Y"));
    ResultActions empLeak = correct(w, finance, supplierPayment, null, replacement, "PERS-Y");
    expect(empLeak, 404, "SETTLEMENT_NOT_FOUND");
    assertThat(empLeak.andReturn().getResponse().getContentAsString()).doesNotContain(toEmployee);

    String a2Payment = id(pay(w, null, body("CASH", supplier, w.a2(), w.fundA2(), "15"), null));
    expect(correct(w, a1User, a2Payment, null, replacement, null), 403, "BRANCH_OUT_OF_SCOPE");
    String a2Other = id(pay(w, null, body("CASH", supplier, w.a2(), w.fundA2(), "16"), null));
    String a2Created =
        id(
            correct(
                w, null, a2Other, null, body("CASH", supplier, w.a2(), w.fundA2(), "17"), "A2-K"));
    ResultActions leaked = correct(w, a1User, a2Other, null, replacement, "A2-K");
    expect(leaked, 403, "BRANCH_OUT_OF_SCOPE");
    assertThat(leaked.andReturn().getResponse().getContentAsString()).doesNotContain(a2Created);
    // Yeni iş yeri kapsam dışı: 403.
    String a1Payment = id(pay(w, null, body("CASH", supplier, w.a1(), w.fundA1(), "18"), null));
    expect(
        correct(w, a1User, a1Payment, null, body("CASH", supplier, w.a2(), w.fundA2(), "18"), null),
        403,
        "BRANCH_OUT_OF_SCOPE");
    // Kendi kapsamında düzeltir.
    correct(w, a1User, a1Payment, null, replacement, null).andExpect(status().isCreated());
  }

  @Test
  void yetkiReddiVeKiraciIzolasyonu() throws Exception {
    World w = world("sc12");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    String payment = id(pay(w, null, body("CASH", supplier, w.a1(), w.fundA1(), "40"), null));
    Map<String, Object> replacement = body("CASH", supplier, w.a1(), w.fundA1(), "45");

    // Yalnız görüntüleme yetkili kullanıcı (ACCOUNTING) düzeltemez: 403, kayıt değişmez.
    String accounting = userWithRole(w, "muhasebe", "ACCOUNTING");
    correct(w, accounting, payment, null, replacement, null).andExpect(status().isForbidden());
    assertThat(row(w, "select status from %s.settlement where id = ?::uuid", payment))
        .containsEntry("status", "POSTED");
    assertThat(reversalsOf(w, payment)).isZero();

    // Başka kiracı: kayıt yokmuş gibi (404); ilk kiracıda hiçbir şey değişmez.
    World other = world("sc12b");
    Map<String, Object> otherReplacement =
        body("CASH", account(other, AccountType.SUPPLIER, null), other.a1(), other.fundA1(), "45");
    expect(
        correct(other, null, payment, null, otherReplacement, null), 404, "SETTLEMENT_NOT_FOUND");
    send(other.t(), null, get(SETTLEMENTS + "/" + payment))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("SETTLEMENT_NOT_FOUND"));
    assertThat(row(w, "select status from %s.settlement where id = ?::uuid", payment))
        .containsEntry("status", "POSTED");
    assertThat(reversalsOf(w, payment)).isZero();
    assertThat(count(w, "select count(*) from %s.settlement")).isEqualTo(1);
  }

  @Test
  void pasifIsYeriVePasifSirketeDuzeltmeYazilmaz() throws Exception {
    World w = world("sc10");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    String a2Payment = id(pay(w, null, body("CASH", supplier, w.a2(), w.fundA2(), "20"), null));
    String b1Payment = id(pay(w, null, body("CASH", supplier, w.b1(), w.fundB1(), "30"), null));
    update(w, "update %s.branch set active = false where id = ?::uuid", w.a2());
    expect(
        correct(w, null, a2Payment, null, body("CASH", supplier, w.a2(), w.fundA2(), "21"), null),
        422,
        "BRANCH_INACTIVE");
    update(w, "update %s.company set active = false where id = ?::uuid", w.companyB());
    expect(
        correct(w, null, b1Payment, null, body("CASH", supplier, w.b1(), w.fundB1(), "31"), null),
        422,
        "COMPANY_INACTIVE");
    assertThat(count(w, "select count(*) from %s.settlement where status = 'REVERSED'")).isZero();
  }

  @Test
  void tasinmisKayitDuzeltilmezOnizlemeBakiyeDuzeltmesiYapmaz() throws Exception {
    World w = world("sc11");
    UUID from = account(w, AccountType.SUPPLIER, null);
    UUID to = account(w, AccountType.SUPPLIER, null);
    manual(w, from, w.a1(), Direction.CREDIT, "100", "TRY");
    Map<String, Object> request = body("CASH", from, w.a1(), w.fundA1(), "100");
    String payment = id(pay(w, null, request, null));
    transferLine(w, from, to, ledgerLine(w, payment));

    expect(correct(w, null, payment, null, request, null), 409, "TRANSACTION_TRANSFERRED");
    assertThat(count(w, "select count(*) from %s.settlement")).isEqualTo(1);
    assertThat(row(w, "select status from %s.settlement where id = ?::uuid", payment))
        .containsEntry("status", "POSTED");

    // Taşınmış eski ödeme önizlemede borçtan düşülmez: borç 100 (taşıma çifti eski ödemeyi
    // nötrledi), 150 ödeme 50 fazla.
    Map<String, Object> more = body("CASH", from, w.a1(), w.fundA1(), "150");
    JsonNode warning = body(check(w, null, "PAYMENT", payment, more)).get("warnings").get(0);
    assertThat(warning.get("companyOutstanding").decimalValue()).isEqualByComparingTo("100");
    assertThat(warning.get("excess").decimalValue()).isEqualByComparingTo("50");
  }

  // --- yardımcılar

  private static int code(ResultActions result) {
    return result.andReturn().getResponse().getStatus();
  }

  /** Kaydın cari ters satırı sayısı. */
  private long reversalsOf(World w, String settlement) {
    return count(
        w,
        "select count(*) from %s.account_transaction r join %s.account_transaction o"
            + " on r.source_type = 'REVERSAL' and r.source_id = o.id"
            + " where o.source_type = 'SETTLEMENT' and o.source_id = ?::uuid",
        settlement);
  }
}
