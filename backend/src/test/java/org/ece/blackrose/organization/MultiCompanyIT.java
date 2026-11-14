package org.ece.blackrose.organization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.lowagie.text.pdf.PdfReader;
import com.lowagie.text.pdf.parser.PdfTextExtractor;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.AbstractIntegrationTest;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * İki (ve üç) şirketli kiracı: belge serisi ve başlığı şirketten, e-belge göndericisi kaynak
 * belgenin şirketi, şirketler arası tutarsız kayıtlar 422 {@code COMPANY_MISMATCH}, kullanılmış
 * fonun şirketi kilitli, bakiye/ekstre/yaşlandırma şirket süzgeçli ve konsolide.
 */
class MultiCompanyIT extends AbstractIntegrationTest {

  private static final String COMPANIES = "/api/v1/organization/companies";
  private static final String FINANCE = "/api/v1/finance";
  private static final String VKN_B = "1234567890";
  private static final String VKN_CUSTOMER = "2222222224";
  private static final String VKN_OTHER = "9876543217";
  private static final byte[] FAKE_PNG = {
    (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2
  };
  private static final LocalDate TODAY = tenantToday();
  private static final DateTimeFormatter TR = DateTimeFormatter.ofPattern("dd.MM.yyyy");

  @Autowired TenantRepository tenants;
  @Autowired JdbcTemplate jdbc;

  /** İki şirketli kiracı: A varsayılan (SIRKET1), B "SIR2"; her birinde bir iş yeri ve kasa. */
  private record World(
      String t,
      String schema,
      String companyA,
      String companyB,
      String branchA,
      String branchB,
      String cashA,
      String cashB,
      String customer,
      String supplier,
      String groupA,
      String groupB) {}

  @Test
  void belgeSerisiBaslikVeEBelgeGondericisiSirkettenGelir() throws Exception {
    World w = world("mcd");
    SchemaRows rows = new SchemaRows(jdbc);
    String year = String.valueOf(TODAY.getYear());

    // (a) Her şirketin navlun faturası kendi serisinden; numara şirket başına tekil.
    JsonNode invoiceA = issueInvoice(w, deliveredShipment(rows, w, w.branchA(), "SV-A1"));
    JsonNode invoiceB = issueInvoice(w, deliveredShipment(rows, w, w.branchB(), "SV-B1"));
    assertThat(invoiceA.get("number").asText()).isEqualTo("NF-" + year + "-000001");
    assertThat(invoiceA.get("companyId").asText()).isEqualTo(w.companyA());
    assertThat(invoiceB.get("number").asText()).isEqualTo("SIR2-NF-" + year + "-000001");
    assertThat(invoiceB.get("companyId").asText()).isEqualTo(w.companyB());

    // (b) Fatura PDF'i şirket B'nin unvanı ve VKN'siyle; bozuk ve sonra silinmiş logo belgeyi
    // durdurmaz.
    mvc.perform(
            multipart(COMPANIES + "/" + w.companyB() + "/logo")
                .file(new MockMultipartFile("file", "logo.png", "image/png", FAKE_PNG))
                .with(asOwner(w.t())))
        .andExpect(status().isOk());
    String text = pdfText(w, "/api/v1/shipment/invoices/" + invoiceB.get("id").asText() + "/pdf");
    assertThat(text).contains("Beta Lojistik AS").contains("VKN: " + VKN_B);
    assertThat(text).contains("Vergi Dairesi: Merkez").doesNotContain(w.t() + " Lojistik");
    jdbc.update(
        "update \"%s\".stored_file set deleted = true where owner_type = 'COMPANY_LOGO'"
            .formatted(w.schema()));
    assertThat(pdfText(w, "/api/v1/shipment/invoices/" + invoiceB.get("id").asText() + "/pdf"))
        .contains("Beta Lojistik AS");
    assertThat(pdfText(w, "/api/v1/shipment/invoices/" + invoiceA.get("id").asText() + "/pdf"))
        .contains(w.t() + " Lojistik")
        .doesNotContain("Beta Lojistik AS");

    // (c) Teklif PDF'i teklifin şirketinin unvanını taşır; şirket yoksa 400, pasifse 422.
    String quoteB = quote(w, w.companyB());
    send(w, post("/api/v1/crm/quotes/" + quoteB + "/send")).andExpect(status().isOk());
    assertThat(pdfText(w, "/api/v1/crm/quotes/" + quoteB + "/pdf")).contains("Beta Lojistik AS");
    assertThat(body(send(w, get("/api/v1/crm/quotes/" + quoteB))).get("companyId").asText())
        .isEqualTo(w.companyB());
    Map<String, Object> missing = quoteBody(w, UUID.randomUUID().toString());
    expect(save(w, post("/api/v1/crm/quotes"), missing), 400, "COMPANY_NOT_FOUND");
    Map<String, Object> passive = company("SIR9", "Pasif AS", null);
    passive.put("active", false);
    String passiveId = id(save(w, post(COMPANIES), passive).andExpect(status().isCreated()));
    expect(save(w, post("/api/v1/crm/quotes"), quoteBody(w, passiveId)), 422, "COMPANY_INACTIVE");

    // (d) e-Fatura göndericisi faturanın şirketi; VKN'siz şirket 409.
    JsonNode document =
        body(
            save(
                    w,
                    post("/api/v1/integration/e-documents"),
                    Map.of(
                        "kind",
                        "EFATURA",
                        "sourceType",
                        "FREIGHT_INVOICE",
                        "sourceId",
                        invoiceB.get("id").asText()))
                .andExpect(status().isCreated()));
    assertThat(document.get("companyId").asText()).isEqualTo(w.companyB());
    String ubl =
        send(w, get("/api/v1/integration/e-documents/" + document.get("id").asText() + "/ubl"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString(StandardCharsets.UTF_8);
    String supplierParty =
        ubl.substring(
            ubl.indexOf("AccountingSupplierParty"), ubl.indexOf("AccountingCustomerParty"));
    assertThat(supplierParty).contains(VKN_B).contains("Beta Lojistik AS");

    String companyC =
        id(
            save(w, post(COMPANIES), company("SIR3", "Gama AS", null))
                .andExpect(status().isCreated()));
    String branchC = branch(w, "C1", companyC);
    JsonNode invoiceC = issueInvoice(w, deliveredShipment(rows, w, branchC, "SV-C1"));
    assertThat(invoiceC.get("number").asText()).isEqualTo("SIR3-NF-" + year + "-000001");
    expect(
        save(
            w,
            post("/api/v1/integration/e-documents"),
            Map.of(
                "kind",
                "EARSIV",
                "sourceType",
                "FREIGHT_INVOICE",
                "sourceId",
                invoiceC.get("id").asText())),
        409,
        "COMPANY_TAX_REQUIRED");

    // (m) Eski e-belge ayar cephesi varsayılan şirketi okur/yazar; geçersiz VKN 422.
    JsonNode settings =
        body(send(w, get("/api/v1/integration/e-document-settings")).andExpect(status().isOk()));
    assertThat(settings.get("taxNumber").isNull()).isTrue();
    expect(
        save(
            w,
            put("/api/v1/integration/e-document-settings"),
            Map.of("taxNumber", "1234567891", "taxOffice", "X", "address", "Y")),
        422,
        "TAX_NUMBER_INVALID");
    save(
            w,
            put("/api/v1/integration/e-document-settings"),
            Map.of("taxNumber", VKN_OTHER, "taxOffice", "Kadıköy", "address", "İstanbul"))
        .andExpect(status().isOk());
    assertThat(body(send(w, get(COMPANIES + "/" + w.companyA()))).get("taxNumber").asText())
        .isEqualTo(VKN_OTHER);
    assertThat(body(send(w, get(COMPANIES + "/" + w.companyB()))).get("taxNumber").asText())
        .isEqualTo(VKN_B);
  }

  @Test
  void sirketlerArasiTutarsizKayitlarReddedilir() throws Exception {
    World w = world("mcm");
    String date = TODAY.toString();

    // A şubesiyle B kasasına tahsilat.
    expect(
        save(w, post(FINANCE + "/collections"), cash(w.customer(), w.branchA(), w.cashB(), "100")),
        422,
        "COMPANY_MISMATCH");
    // (k) İdempotent tekrar aynı kaydı döndürür; kayıt iş yerinin şirketinde.
    JsonNode first =
        body(
            send(
                    w,
                    post(FINANCE + "/collections")
                        .header("Idempotency-Key", "mc-1")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(
                            json.writeValueAsString(
                                cash(w.customer(), w.branchA(), w.cashA(), "500"))))
                .andExpect(status().isCreated()));
    JsonNode again =
        body(
            send(
                w,
                post(FINANCE + "/collections")
                    .header("Idempotency-Key", "mc-1")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        json.writeValueAsString(
                            cash(w.customer(), w.branchA(), w.cashA(), "500")))));
    assertThat(again.get("id").asText()).isEqualTo(first.get("id").asText());
    assertThat(first.get("companyId").asText()).isEqualTo(w.companyA());

    // Plan ödemesi başka şirketin kasasından.
    save(w, put(FINANCE + "/settings"), Map.of("allowSelfApproval", true))
        .andExpect(status().isOk());
    String plan =
        id(
            save(
                    w,
                    post(FINANCE + "/payment-plans"),
                    Map.of(
                        "accountId",
                        w.supplier(),
                        "branchId",
                        w.branchA(),
                        "money",
                        money("10"),
                        "dueDate",
                        date))
                .andExpect(status().isCreated()));
    send(w, post(FINANCE + "/payment-plans/" + plan + "/submit")).andExpect(status().isOk());
    save(w, post(FINANCE + "/payment-plans/" + plan + "/approve"), Map.of("note", "tamam"))
        .andExpect(status().isOk());
    expect(
        save(
            w,
            post(FINANCE + "/payment-plans/" + plan + "/pay"),
            Map.of("method", "CASH", "fundAccountId", w.cashB(), "date", date)),
        422,
        "COMPANY_MISMATCH");

    // Araç gideri doğrudan ödemesi ve sürücü avansı başka şirketin kasasından.
    String vehicle = vehicle(w, "34MC001");
    Map<String, Object> expense = expenseBody(w.branchA(), null, w.cashB());
    expect(
        save(w, post("/api/v1/fleet/vehicles/" + vehicle + "/expenses"), expense),
        422,
        "COMPANY_MISMATCH");
    String driver =
        id(
            save(
                    w,
                    post("/api/v1/fleet/drivers"),
                    Map.of("code", "D1", "fullName", "Sürücü Bir", "status", "ACTIVE"))
                .andExpect(status().isCreated()));
    expect(
        save(
            w,
            post("/api/v1/fleet/drivers/" + driver + "/advances"),
            Map.of(
                "branchId",
                w.branchA(),
                "fundAccountId",
                w.cashB(),
                "money",
                money("10"),
                "date",
                date)),
        422,
        "COMPANY_MISMATCH");

    // Şirketler arası fon transferi 12.2'ye kadar yok.
    expect(
        save(
            w,
            post(FINANCE + "/funds/transfers"),
            Map.of(
                "fromFundId", w.cashA(), "toFundId", w.cashB(), "money", money("1"), "date", date)),
        422,
        "COMPANY_MISMATCH");

    // Çek: başka şirketin kasasına tahsil ve başka şirketin portföyünden ciro edilemez.
    JsonNode check = checkCollection(w, w.customer(), w.branchA(), "CK-2", "200");
    String instrument = check.get("instrumentId").asText();
    expect(
        save(
            w,
            post(FINANCE + "/instruments/" + instrument + "/transition"),
            Map.of("toStatus", "COLLECTED_TO_CASH", "fundAccountId", w.cashB(), "date", date)),
        422,
        "COMPANY_MISMATCH");
    Map<String, Object> endorseFromB = new HashMap<>();
    endorseFromB.put("method", "CHECK");
    endorseFromB.put("accountId", w.supplier());
    endorseFromB.put("branchId", w.branchB());
    endorseFromB.put("instrumentId", instrument);
    endorseFromB.put("money", money("200"));
    endorseFromB.put("date", date);
    expect(save(w, post(FINANCE + "/payments"), endorseFromB), 422, "COMPANY_MISMATCH");

    // (#14) A iş yerinden A'nın grup carisine ödeme ya da elle hareket yazılamaz; B'den serbest.
    expect(
        save(w, post(FINANCE + "/payments"), cash(w.groupA(), w.branchA(), w.cashA(), "5")),
        422,
        "COMPANY_MISMATCH");
    expect(
        save(
            w,
            post(FINANCE + "/accounts/" + w.groupA() + "/transactions"),
            manual(w.branchA(), "DEBIT", "5", date)),
        422,
        "COMPANY_MISMATCH");
    save(w, post(FINANCE + "/collections"), cash(w.groupA(), w.branchB(), w.cashB(), "5"))
        .andExpect(status().isCreated());

    // (f) Kullanılmış fonun şirketi değişmez: hareketli kasa, hareketsiz ama çeke atanmış banka,
    // şirketin varsayılan hesabı. Kullanılmamış fon taşınabilir.
    expect(moveFund(w, w.cashA(), w.branchB()), 409, "FUND_COMPANY_LOCKED");
    String bank = fund(w, "BANKA-A", "BANK", w.branchA());
    save(
            w,
            post(FINANCE + "/instruments/" + instrument + "/transition"),
            Map.of("toStatus", "AT_BANK", "fundAccountId", bank, "date", date))
        .andExpect(status().isOk());
    assertThat(
            jdbc.queryForObject(
                "select count(*) from \"%s\".fund_transaction where fund_account_id = ?::uuid"
                    .formatted(w.schema()),
                Long.class,
                bank))
        .isZero();
    expect(moveFund(w, bank, w.branchB()), 409, "FUND_COMPANY_LOCKED");
    String spare = fund(w, "KASA-Y", "CASH", w.branchA());
    JsonNode companyA = body(send(w, get(COMPANIES + "/" + w.companyA())));
    Map<String, Object> withDefaultFund = company("SIRKET1", companyA.get("title").asText(), null);
    withDefaultFund.put("defaultFundAccountId", spare);
    save(w, put(COMPANIES + "/" + w.companyA()), withDefaultFund).andExpect(status().isOk());
    expect(moveFund(w, spare, w.branchB()), 409, "FUND_COMPANY_LOCKED");
    String unused = fund(w, "KASA-Z", "CASH", w.branchA());
    assertThat(
            body(moveFund(w, unused, w.branchB()).andExpect(status().isOk()))
                .get("companyId")
                .asText())
        .isEqualTo(w.companyB());

    // (f2) Veritabanı güvencesi: servisi atlayan bir yazım bileşik FK'ye takılır.
    SchemaRows rows = new SchemaRows(jdbc);
    Map<String, Object> settlement = new HashMap<>();
    settlement.put("type", "PAYMENT");
    settlement.put("method", "CASH");
    settlement.put("branch_id", UUID.fromString(w.branchA()));
    settlement.put("company_id", UUID.fromString(w.companyA()));
    settlement.put("fund_account_id", UUID.fromString(w.cashB()));
    settlement.put("amount", BigDecimal.ONE);
    settlement.put("status", "POSTED");
    assertThatThrownBy(() -> rows.insert(w.schema(), "settlement", settlement))
        .isInstanceOf(DataIntegrityViolationException.class)
        .hasMessageContaining("settlement_fund_company_fk");

    // (n) A'nın müşteri çeki B'nin grup carisine ciro edilir; B aynı çeki A'nın grup carisinden
    // portföyüne alabilir (şirket başına tekillik); aynı şirkette ikinci kez alınamaz.
    JsonNode received = checkCollection(w, w.customer(), w.branchA(), "CK-1", "300");
    Map<String, Object> endorse = new HashMap<>(endorseFromB);
    endorse.put("accountId", w.groupB());
    endorse.put("branchId", w.branchA());
    endorse.put("instrumentId", received.get("instrumentId").asText());
    endorse.put("money", money("300"));
    save(w, post(FINANCE + "/payments"), endorse).andExpect(status().isCreated());
    JsonNode inB = checkCollection(w, w.groupA(), w.branchB(), "CK-1", "300");
    assertThat(inB.get("companyId").asText()).isEqualTo(w.companyB());
    save(w, post(FINANCE + "/collections"), checkBody(w.groupA(), w.branchB(), "CK-1", "300"))
        .andExpect(status().isConflict());

    // Liste uçları şirket süzgeçli; boş = konsolide.
    assertThat(codes(body(send(w, get(FINANCE + "/funds").param("companyId", w.companyB())))))
        .containsExactlyInAnyOrder("KASA-B", "KASA-Z");
    assertThat(codes(body(send(w, get(FINANCE + "/funds"))))).hasSize(5);
    JsonNode collectionsB =
        body(send(w, get(FINANCE + "/collections").param("companyId", w.companyB())));
    assertThat(collectionsB.get("totalElements").asInt()).isEqualTo(2);
    for (JsonNode row : collectionsB.get("content")) {
      assertThat(row.get("companyId").asText()).isEqualTo(w.companyB());
    }
    JsonNode daily =
        body(
            send(
                w,
                get(FINANCE + "/reports/daily")
                    .param("type", "COLLECTION")
                    .param("date", date)
                    .param("companyId", w.companyA())));
    assertThat(daily.get("rows")).hasSize(3);
    assertThat(
            body(send(w, get(FINANCE + "/instruments").param("companyId", w.companyB())))
                .get("totalElements")
                .asInt())
        .isEqualTo(1);
    assertThat(
            body(send(w, get(FINANCE + "/payment-plans").param("companyId", w.companyB())))
                .get("totalElements")
                .asInt())
        .isZero();
    assertThat(
            body(send(w, get(FINANCE + "/payment-plans").param("companyId", w.companyA())))
                .get("totalElements")
                .asInt())
        .isEqualTo(1);
    assertThat(
            body(send(
                    w,
                    get(FINANCE + "/dashboard")
                        .param("today", date)
                        .param("companyId", w.companyB())))
                .get("dueThisWeek"))
        .isEmpty();
  }

  @Test
  void bakiyeYaslandirmaVeAcilisSirketBazindadir() throws Exception {
    World w = world("mcb");
    String date = TODAY.toString();
    String older = TODAY.minusDays(10).toString();

    // (g) Aynı cari: A'da 100, B'de 50 borç → şirket bazında ve konsolide bakiye.
    String m2 = account(w, "M2", "CUSTOMER", null);
    created(
        w,
        FINANCE + "/accounts/" + m2 + "/transactions",
        manual(w.branchA(), "DEBIT", "100", older));
    created(
        w, FINANCE + "/accounts/" + m2 + "/transactions", manual(w.branchB(), "DEBIT", "50", date));
    assertThat(balance(w, m2, w.companyA())).isEqualByComparingTo("100");
    assertThat(balance(w, m2, w.companyB())).isEqualByComparingTo("50");
    assertThat(balance(w, m2, null)).isEqualByComparingTo("150");
    JsonNode listed =
        body(
            send(
                w,
                get(FINANCE + "/accounts").param("search", "M2").param("companyId", w.companyB())));
    assertThat(listed.get("content").get(0).get("balances").get(0).get("balance").decimalValue())
        .isEqualByComparingTo("50");
    String from = TODAY.minusDays(5).toString();
    assertThat(statement(w, m2, from, w.companyA()).get("openingBalance").decimalValue())
        .isEqualByComparingTo("100");
    JsonNode statementB = statement(w, m2, from, w.companyB());
    assertThat(statementB.get("openingBalance").decimalValue()).isEqualByComparingTo("0");
    assertThat(statementB.get("lines")).hasSize(1);
    assertThat(statement(w, m2, from, null).get("openingBalance").decimalValue())
        .isEqualByComparingTo("100");

    // (h1) B'nin grup carisinin A'daki açık kalemi: şirket A'da görünür; konsolidede varsayılan
    // dışlanır, istenirse görünür.
    created(
        w,
        FINANCE + "/accounts/" + w.groupB() + "/transactions",
        manual(w.branchA(), "DEBIT", "70", date));
    assertThat(agingTotal(w, w.groupB(), w.companyA(), null)).isEqualByComparingTo("70");
    assertThat(agingTotal(w, w.groupB(), null, null)).isNull();
    assertThat(agingTotal(w, w.groupB(), null, false)).isEqualByComparingTo("70");

    // (h2) Şirket kırılımlı FIFO: B'deki 30 alacak A'nın kalemini kapatmaz.
    String m3 = account(w, "M3", "CUSTOMER", null);
    created(
        w,
        FINANCE + "/accounts/" + m3 + "/transactions",
        manual(w.branchA(), "DEBIT", "100", older));
    created(
        w,
        FINANCE + "/accounts/" + m3 + "/transactions",
        manual(w.branchB(), "CREDIT", "30", date));
    assertThat(agingTotal(w, m3, w.companyA(), null)).isEqualByComparingTo("100");
    assertThat(agingTotal(w, m3, null, null)).isEqualByComparingTo("100");
    assertThat(balance(w, m3, null)).isEqualByComparingTo("70");

    // (j) Ters kayıt şirketi orijinalden alır, iş yeri sonradan silinmiş olsa da.
    String branchB2 = branch(w, "B2", w.companyB());
    String tx =
        id(
            save(
                    w,
                    post(FINANCE + "/accounts/" + m2 + "/transactions"),
                    manual(branchB2, "DEBIT", "40", date))
                .andExpect(status().isCreated()));
    jdbc.update(
        "update \"%s\".branch set deleted = true where id = ?::uuid".formatted(w.schema()),
        branchB2);
    JsonNode reversal =
        body(
            save(
                    w,
                    post(FINANCE + "/accounts/transactions/" + tx + "/reverse"),
                    Map.of("date", date, "description", "iptal"))
                .andExpect(status().isOk()));
    assertThat(reversal.get("companyId").asText()).isEqualTo(w.companyB());
    assertThat(balance(w, m2, w.companyB())).isEqualByComparingTo("50");

    // (i) Açılış bakiyesi ve açılış faturası şirket bazında: A'da yüklenen cari B'de de yüklenir.
    String openingCsv = "Kod;Ad;Tür;Bakiye\nM5;Müşteri Beş;Müşteri;100\n";
    assertThat(openingBalance(w, "", w.branchA(), openingCsv).get("applied").asBoolean()).isTrue();
    JsonNode againA = openingBalance(w, "/preview", w.branchA(), openingCsv);
    assertThat(againA.get("rows").get(0).get("status").asText()).isEqualTo("ERROR");
    JsonNode inB = openingBalance(w, "/preview", w.branchB(), openingCsv);
    assertThat(inB.get("valid").asBoolean()).isTrue();
    assertThat(inB.get("rows").get(0).get("status").asText()).isEqualTo("EXISTING_ACCOUNT");

    account(w, "M6", "CUSTOMER", null);
    String invoiceCsv =
        "Cari kodu;Belge no;Belge tarihi;Vade;Tutar;Para birimi;Kur\n"
            + "M6;AF-1;%s;%s;100;;\n"
                .formatted(TODAY.minusDays(3).format(TR), TODAY.plusDays(20).format(TR));
    openingInvoices(w, "", w.branchA(), invoiceCsv).andExpect(status().isOk());
    JsonNode invoiceAgainA =
        body(openingInvoices(w, "/preview", w.branchA(), invoiceCsv).andExpect(status().isOk()));
    assertThat(invoiceAgainA.get("valid").asBoolean()).isFalse();
    JsonNode invoiceInB =
        body(openingInvoices(w, "/preview", w.branchB(), invoiceCsv).andExpect(status().isOk()));
    assertThat(invoiceInB.get("valid").asBoolean()).isTrue();
    openingInvoices(w, "", w.branchB(), invoiceCsv).andExpect(status().isOk());

    // (l) Sözleşme çakışması şirket bazında.
    Map<String, Object> contract = new HashMap<>();
    contract.put("accountId", w.customer());
    contract.put("startDate", date);
    contract.put("endDate", TODAY.plusDays(90).toString());
    JsonNode contractA =
        body(save(w, post("/api/v1/crm/contracts"), contract).andExpect(status().isCreated()));
    assertThat(contractA.get("companyId").asText()).isEqualTo(w.companyA());
    contract.put("companyId", w.companyB());
    save(w, post("/api/v1/crm/contracts"), contract).andExpect(status().isCreated());
    expect(save(w, post("/api/v1/crm/contracts"), contract), 409, "CONTRACT_OVERLAP");
  }

  @Test
  void baskaSirketinTeklifiVeAracGideriSefereBaglanamaz() throws Exception {
    World w = world("mcs");
    SchemaRows rows = new SchemaRows(jdbc);

    // (K-2) Başka şirketin kabul edilmiş teklifinden sefer açılamaz.
    String quoteB = quote(w, w.companyB());
    String line =
        body(send(w, get("/api/v1/crm/quotes/" + quoteB))).get("lines").get(0).get("id").asText();
    send(w, post("/api/v1/crm/quotes/" + quoteB + "/send")).andExpect(status().isOk());
    JsonNode contractB =
        body(
            save(
                    w,
                    post("/api/v1/crm/quotes/" + quoteB + "/accept"),
                    Map.of(
                        "startDate",
                        TODAY.minusDays(1).toString(),
                        "endDate",
                        TODAY.plusDays(60).toString()))
                .andExpect(status().isOk()));
    assertThat(contractB.get("companyId").asText()).isEqualTo(w.companyB());
    expect(
        save(w, post("/api/v1/shipment/shipments"), shipmentFromQuote(w, w.branchA(), line)),
        422,
        "COMPANY_MISMATCH");
    save(w, post("/api/v1/shipment/shipments"), shipmentFromQuote(w, w.branchB(), line))
        .andExpect(status().isCreated());

    // (p) Bağlanabilir giderler yalnız seferin şirketinden; başka şirketin gideri 422.
    String vehicle = vehicle(w, "34MC002");
    String expenseA =
        id(
            save(
                    w,
                    post("/api/v1/fleet/vehicles/" + vehicle + "/expenses"),
                    expenseBody(w.branchA(), w.supplier(), null))
                .andExpect(status().isCreated()));
    JsonNode expenseB =
        body(
            save(
                    w,
                    post("/api/v1/fleet/vehicles/" + vehicle + "/expenses"),
                    expenseBody(w.branchB(), w.supplier(), null))
                .andExpect(status().isCreated()));
    assertThat(expenseB.get("companyId").asText()).isEqualTo(w.companyB());
    UUID shipment = deliveredShipment(rows, w, w.branchA(), "SV-L1");
    OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
    rows.insert(
        w.schema(),
        "shipment_leg",
        Map.of(
            "shipment_id",
            shipment,
            "sequence_no",
            1,
            "vehicle_id",
            UUID.fromString(vehicle),
            "planned_start",
            now.minusHours(1),
            "planned_end",
            now.plusHours(1)));
    JsonNode linkable =
        body(
            send(w, get("/api/v1/shipment/shipments/" + shipment + "/linkable-expenses"))
                .andExpect(status().isOk()));
    List<String> ids = new ArrayList<>();
    linkable.forEach(row -> ids.add(row.get("id").asText()));
    assertThat(ids).containsExactly(expenseA);
    expect(
        save(
            w,
            post("/api/v1/shipment/shipments/" + shipment + "/costs"),
            Map.of("kind", "OTHER", "vehicleExpenseId", expenseB.get("id").asText())),
        422,
        "COMPANY_MISMATCH");
    save(
            w,
            post("/api/v1/shipment/shipments/" + shipment + "/costs"),
            Map.of("kind", "OTHER", "vehicleExpenseId", expenseA))
        .andExpect(status().isCreated());
  }

  // --- kurulum

  private World world(String prefix) throws Exception {
    String t = prefix + "-" + Long.toString(System.nanoTime(), 36);
    createTenant(t);
    String schema = tenants.findByCode(t).orElseThrow().getSchemaName();
    String companyA =
        jdbc.queryForObject(
            "select id::text from \"%s\".company where is_default".formatted(schema), String.class);
    Map<String, Object> b = company("SIR2", "Beta Lojistik AS", VKN_B);
    b.put("taxOffice", "Merkez");
    b.put("address", "Liman Cad. 1");
    b.put("city", "Mersin");
    String companyB = id(save(t, post(COMPANIES), b).andExpect(status().isCreated()));
    String branchA = branch(t, "A1", companyA);
    String branchB = branch(t, "B1", companyB);
    String cashA = fund(t, "KASA-A", "CASH", branchA);
    String cashB = fund(t, "KASA-B", "CASH", branchB);
    String customer = account(t, "M1", "CUSTOMER", VKN_CUSTOMER);
    String supplier = account(t, "T1", "SUPPLIER", null);
    return new World(
        t,
        schema,
        companyA,
        companyB,
        branchA,
        branchB,
        cashA,
        cashB,
        customer,
        supplier,
        accountByCode(t, "GS-SIRKET1"),
        accountByCode(t, "GS-SIR2"));
  }

  private static Map<String, Object> company(String code, String title, String taxNumber) {
    Map<String, Object> body = new HashMap<>();
    body.put("code", code);
    body.put("title", title);
    body.put("shortName", title);
    body.put("taxIdType", "VKN");
    body.put("taxNumber", taxNumber);
    return body;
  }

  private String branch(World w, String code, String companyId) throws Exception {
    return branch(w.t(), code, companyId);
  }

  private String branch(String t, String code, String companyId) throws Exception {
    return id(
        save(
                t,
                post("/api/v1/organization/branches"),
                Map.of("code", code, "name", code + " Merkez", "companyId", companyId))
            .andExpect(status().isCreated()));
  }

  private String fund(World w, String code, String kind, String branch) throws Exception {
    return fund(w.t(), code, kind, branch);
  }

  private String fund(String t, String code, String kind, String branch) throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("code", code);
    body.put("name", code);
    body.put("kind", kind);
    body.put("currency", "TRY");
    body.put("branchId", branch);
    body.put("allowNegative", true);
    if ("BANK".equals(kind)) {
      body.put("bankName", "Banka");
    }
    return id(save(t, post(FINANCE + "/funds"), body).andExpect(status().isCreated()));
  }

  private ResultActions moveFund(World w, String fund, String branch) throws Exception {
    return save(
        w,
        put(FINANCE + "/funds/" + fund),
        Map.of("name", "Taşınan", "branchId", branch, "allowNegative", true));
  }

  private String account(World w, String code, String type, String taxNumber) throws Exception {
    return account(w.t(), code, type, taxNumber);
  }

  private String account(String t, String code, String type, String taxNumber) throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("code", code);
    body.put("name", code);
    body.put("type", type);
    body.put("taxNumber", taxNumber);
    return id(save(t, post(FINANCE + "/accounts"), body).andExpect(status().isCreated()));
  }

  private String accountByCode(String t, String code) throws Exception {
    for (JsonNode row :
        body(send(t, get(FINANCE + "/accounts").param("size", "200"))).get("content")) {
      if (code.equals(row.get("code").asText())) {
        return row.get("id").asText();
      }
    }
    throw new AssertionError(code);
  }

  private String vehicle(World w, String plate) throws Exception {
    return id(
        save(
                w,
                post("/api/v1/fleet/vehicles"),
                Map.of("plate", plate, "kind", "TRUCK", "ownership", "OWNED", "status", "ACTIVE"))
            .andExpect(status().isCreated()));
  }

  private static Map<String, Object> expenseBody(String branch, String supplier, String fund) {
    Map<String, Object> body = new HashMap<>();
    body.put("kind", "MAINTENANCE");
    body.put("date", TODAY.toString());
    body.put("money", money("80"));
    body.put("branchId", branch);
    body.put("supplierAccountId", supplier);
    body.put("fundAccountId", fund);
    return body;
  }

  private String quote(World w, String companyId) throws Exception {
    String id =
        id(
            save(w, post("/api/v1/crm/quotes"), quoteBody(w, companyId))
                .andExpect(status().isCreated()));
    save(
            w,
            post("/api/v1/crm/quotes/" + id + "/lines"),
            Map.of("origin", "Mersin", "destination", "Adana", "manualNet", "1000"))
        .andExpect(status().isCreated());
    return id;
  }

  private static Map<String, Object> quoteBody(World w, String companyId) {
    Map<String, Object> body = new HashMap<>();
    body.put("accountId", w.customer());
    body.put("currency", "TRY");
    body.put("validUntil", TODAY.plusDays(30).toString());
    body.put("companyId", companyId);
    return body;
  }

  private static Map<String, Object> shipmentFromQuote(World w, String branch, String line) {
    Map<String, Object> body = new HashMap<>();
    body.put("accountId", w.customer());
    body.put("branchId", branch);
    body.put("origin", "Mersin");
    body.put("destination", "Adana");
    body.put("plannedPickup", TODAY.atStartOfDay(TENANT_ZONE).plusHours(9).toInstant().toString());
    body.put(
        "plannedDelivery", TODAY.atStartOfDay(TENANT_ZONE).plusHours(18).toInstant().toString());
    body.put("currency", "TRY");
    body.put("quoteLineId", line);
    return body;
  }

  private static UUID deliveredShipment(SchemaRows rows, World w, String branch, String number) {
    Map<String, Object> values = new HashMap<>();
    values.put("number", number);
    values.put("account_id", UUID.fromString(w.customer()));
    values.put("branch_id", UUID.fromString(branch));
    values.put("status", "DELIVERED");
    values.put("net_amount", new BigDecimal("100"));
    values.put("vat_amount", new BigDecimal("20"));
    values.put("withholding_amount", BigDecimal.ZERO);
    values.put("total_amount", new BigDecimal("120"));
    values.put("breakdown", "{}");
    return rows.insert(w.schema(), "shipment", values);
  }

  private JsonNode issueInvoice(World w, UUID shipment) throws Exception {
    return body(
        save(
                w,
                post("/api/v1/shipment/shipments/" + shipment + "/invoice"),
                Map.of("invoiceDate", TODAY.toString(), "dueDate", TODAY.plusDays(30).toString()))
            .andExpect(status().isCreated()));
  }

  private static Map<String, Object> money(String amount) {
    return Map.of("amount", amount, "currency", "TRY");
  }

  private static Map<String, Object> cash(
      String account, String branch, String fund, String amount) {
    Map<String, Object> body = new HashMap<>();
    body.put("method", "CASH");
    body.put("accountId", account);
    body.put("branchId", branch);
    body.put("fundAccountId", fund);
    body.put("money", money(amount));
    body.put("date", TODAY.toString());
    return body;
  }

  private static Map<String, Object> checkBody(
      String account, String branch, String number, String amount) {
    Map<String, Object> body = new HashMap<>();
    body.put("method", "CHECK");
    body.put("accountId", account);
    body.put("branchId", branch);
    body.put(
        "instrument",
        Map.of(
            "kind",
            "CHECK",
            "number",
            number,
            "bankName",
            "Banka",
            "dueDate",
            TODAY.plusDays(30).toString()));
    body.put("money", money(amount));
    body.put("date", TODAY.toString());
    return body;
  }

  private JsonNode checkCollection(
      World w, String account, String branch, String number, String amount) throws Exception {
    return body(
        save(w, post(FINANCE + "/collections"), checkBody(account, branch, number, amount))
            .andExpect(status().isCreated()));
  }

  private static Map<String, Object> manual(
      String branch, String direction, String amount, String date) {
    return Map.of("branchId", branch, "direction", direction, "money", money(amount), "date", date);
  }

  private void created(World w, String path, Object body) throws Exception {
    save(w, post(path), body).andExpect(status().isCreated());
  }

  private BigDecimal balance(World w, String account, String companyId) throws Exception {
    MockHttpServletRequestBuilder request = get(FINANCE + "/accounts/" + account);
    if (companyId != null) {
      request.param("companyId", companyId);
    }
    for (JsonNode row : body(send(w, request).andExpect(status().isOk())).get("balances")) {
      if ("TRY".equals(row.get("currency").asText())) {
        return row.get("balance").decimalValue();
      }
    }
    return BigDecimal.ZERO;
  }

  private JsonNode statement(World w, String account, String from, String companyId)
      throws Exception {
    MockHttpServletRequestBuilder request =
        get(FINANCE + "/accounts/" + account + "/statement")
            .param("currency", "TRY")
            .param("from", from)
            .param("to", TODAY.toString());
    if (companyId != null) {
      request.param("companyId", companyId);
    }
    return body(send(w, request).andExpect(status().isOk()));
  }

  /** Carinin alacak yaşlandırması toplamı; satır yoksa null. */
  private BigDecimal agingTotal(World w, String account, String companyId, Boolean exclude)
      throws Exception {
    MockHttpServletRequestBuilder request =
        get(FINANCE + "/reports/aging").param("type", "RECEIVABLE").param("asOf", TODAY.toString());
    if (companyId != null) {
      request.param("companyId", companyId);
    }
    if (exclude != null) {
      request.param("excludeIntercompany", exclude.toString());
    }
    for (JsonNode row : body(send(w, request).andExpect(status().isOk()))) {
      if (account.equals(row.get("accountId").asText())) {
        return row.get("total").decimalValue();
      }
    }
    return null;
  }

  private JsonNode openingBalance(World w, String path, String branch, String csv)
      throws Exception {
    return body(
        mvc.perform(
                multipart(FINANCE + "/opening-balances" + path)
                    .file(
                        new MockMultipartFile(
                            "file", "acilis.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8)))
                    .param("branchId", branch)
                    .param("date", TODAY.minusDays(1).toString())
                    .with(asOwner(w.t())))
            .andExpect(status().isOk()));
  }

  private ResultActions openingInvoices(World w, String path, String branch, String csv)
      throws Exception {
    return mvc.perform(
        multipart(FINANCE + "/opening-invoices" + path)
            .file(
                new MockMultipartFile(
                    "file", "fatura.csv", "text/csv", csv.getBytes(StandardCharsets.UTF_8)))
            .param("branchId", branch)
            .with(asOwner(w.t())));
  }

  private String pdfText(World w, String path) throws Exception {
    byte[] pdf =
        send(w, get(path))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsByteArray();
    PdfReader reader = new PdfReader(pdf);
    try {
      return new PdfTextExtractor(reader).getTextFromPage(1);
    } finally {
      reader.close();
    }
  }

  private static List<String> codes(JsonNode funds) {
    List<String> codes = new ArrayList<>();
    funds.forEach(row -> codes.add(row.get("code").asText()));
    return codes;
  }

  private String id(ResultActions actions) throws Exception {
    return body(actions).get("id").asText();
  }

  private ResultActions send(World w, MockHttpServletRequestBuilder request) throws Exception {
    return send(w.t(), request);
  }

  private ResultActions send(String t, MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request.with(asOwner(t)));
  }

  private ResultActions save(World w, MockHttpServletRequestBuilder request, Object body)
      throws Exception {
    return save(w.t(), request, body);
  }

  private ResultActions save(String t, MockHttpServletRequestBuilder request, Object body)
      throws Exception {
    return send(
        t, request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
  }

  private static void expect(ResultActions result, int status, String code) throws Exception {
    result.andExpect(status().is(status)).andExpect(jsonPath("$.code").value(code));
  }
}
