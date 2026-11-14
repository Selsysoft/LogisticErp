package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.notification.DailyDigestMailer;
import org.ece.blackrose.tenant.TenantContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.ResultActions;

/** Cari kartı, ZTO profili, personel izni, aktiflik, limit ve liste (12.1 §6.2 B2). */
class AccountProfileIT extends AccountTestSupport {

  @Autowired DailyDigestMailer digest;

  private static final String TCKN = "10000000146";
  private static final String VKN = "1234567890";
  private static final Set<String> CARD_EVENTS =
      Set.of(
          "ACCOUNT_CREATED",
          "ACCOUNT_UPDATED",
          "ACCOUNT_LIMITS_CHANGED",
          "ACCOUNT_ACTIVATED",
          "ACCOUNT_DEACTIVATED",
          "ACCOUNT_BANK_ACCOUNT_CREATED",
          "ACCOUNT_BANK_ACCOUNT_UPDATED",
          "ACCOUNT_BANK_ACCOUNT_ACTIVATED",
          "ACCOUNT_BANK_ACCOUNT_DEACTIVATED");

  @Test
  void kayitKodUretimiVeProfil() throws Exception {
    World w = world("apk");

    // MUI gövdesi aynen çalışır.
    JsonNode mui =
        body(
            sendJson(
                    w.t(),
                    null,
                    post(FINANCE + "/accounts"),
                    Map.of(
                        "code",
                        "M-1",
                        "name",
                        "Mui Müşteri",
                        "type",
                        "CUSTOMER",
                        "taxNumber",
                        VKN,
                        "branchId",
                        w.a1()))
                .andExpect(status().isCreated()));
    assertThat(mui.get("subGroup").asText()).isEqualTo("MUSTERI");
    assertThat(mui.get("subGroupName").asText()).isEqualTo("Müşteri");
    assertThat(mui.get("taxNumber").asText()).isEqualTo(VKN);
    assertThat(mui.get("active").asBoolean()).isTrue();
    assertThat(mui.get("updateCount").asInt()).isZero();

    // Kod boşsa gruptan üretilir; elle açılmış kod atlanır.
    assertThat(create(w, null, zto("CUSTOMER", "MUSTERI", "A")).get("code").asText())
        .isEqualTo("MUS-000001");
    assertThat(create(w, null, zto("CUSTOMER", null, "B")).get("code").asText())
        .isEqualTo("MUS-000002");
    Map<String, Object> manualCode = zto("CUSTOMER", "MUSTERI", "C");
    manualCode.put("code", "MUS-000003");
    create(w, null, manualCode);
    assertThat(create(w, null, zto("CUSTOMER", "MUSTERI", "D")).get("code").asText())
        .isEqualTo("MUS-000004");
    expect(
        sendJson(w.t(), null, post(FINANCE + "/accounts"), manualCode), 409, "ACCOUNT_CODE_TAKEN");

    // Eşzamanlı iki kayıt aynı grupta farklı kod alır.
    List<String> codes = parallelCodes(w, 2);
    assertThat(new HashSet<>(codes)).hasSize(2);
    assertThat(codes).allMatch(code -> code.startsWith("ACN-"));

    // Grup kuralları.
    expect(
        sendJson(w.t(), null, post(FINANCE + "/accounts"), zto("CUSTOMER", "GENEL", "X")),
        422,
        "ACCOUNT_GROUP_INVALID");
    expect(
        sendJson(w.t(), null, post(FINANCE + "/accounts"), zto("LEAD", "ADAY", "X")),
        422,
        "ACCOUNT_GROUP_INVALID");
    expect(
        sendJson(
            w.t(), null, post(FINANCE + "/accounts"), zto("INTERCOMPANY", "GRUP_SIRKETI", "X")),
        422,
        "ACCOUNT_TYPE_RESERVED");
    expect(
        sendJson(
            w.t(), null, post(FINANCE + "/accounts"), zto("SUPPLIER", "YEDEK_PARCA_SERVIS", "X")),
        422,
        "TAX_NUMBER_REQUIRED");
    Map<String, Object> badTax = zto("SUPPLIER", "AKARYAKIT", "X");
    badTax.put("taxNumber", "1234567891");
    expect(sendJson(w.t(), null, post(FINANCE + "/accounts"), badTax), 422, "TAX_NUMBER_INVALID");

    // Profil alanları; en uzun Türkçe adres şifreli saklanır, detayda çözülür, listede yok.
    String address = "ğüşİöç Çamlıca Mahallesi ".repeat(40).substring(0, 999) + "Z";
    Map<String, Object> full = zto("SUPPLIER", "YEDEK_PARCA_SERVIS", "Profil Tedarik");
    full.put("taxNumber", VKN);
    full.put("defaultCurrency", "EUR");
    full.put("creditLimit", 1000);
    full.put("riskLimit", 500);
    full.put("taxOffice", "Kadıköy");
    full.put("companyType", "CORPORATE");
    full.put("phone", "02160000000");
    full.put("email", "info@ornek.test");
    full.put("contactName", "Ayşe Yılmaz");
    full.put("contactMobile", "05320000000");
    full.put("address", address);
    full.put("city", "İstanbul");
    full.put("district", "Kadıköy");
    full.put("country", "Türkiye");
    full.put("postalCode", "34710");
    full.put("paymentTerms", "30 gün");
    full.put("notes", "Not");
    JsonNode created = create(w, null, full);
    String id = created.get("id").asText();
    assertThat(created.get("code").asText()).isEqualTo("YPS-000001");
    assertThat(created.get("defaultCurrency").asText()).isEqualTo("EUR");
    assertThat(created.get("creditLimit").decimalValue()).isEqualByComparingTo("1000");
    assertThat(created.get("contactName").asText()).isEqualTo("Ayşe Yılmaz");
    assertThat(created.get("address").asText()).isEqualTo(address);
    String stored =
        jdbc.queryForObject(
            "select address_enc from \"%s\".account where id = ?".formatted(w.schema()),
            String.class,
            UUID.fromString(id));
    assertThat(stored).doesNotContain("Mahallesi").isNotBlank();
    assertThat(detail(w, null, id).get("address").asText()).isEqualTo(address);
    String accounting = userWithRole(w, "muhasebe", "ACCOUNTING");
    // K-12.2-5: açık adres detayda yetkisiz kullanıcıya da görünür; listede yok.
    assertThat(detail(w, accounting, id).get("address").asText()).isEqualTo(address);
    assertThat(detail(w, accounting, id).get("city").asText()).isEqualTo("İstanbul");
    JsonNode listed = listRow(w, null, id, Map.of("search", "profil tedarik"));
    assertThat(listed.get("address").isNull()).isTrue();
    assertThat(listed.get("companyLimits").isNull()).isTrue();

    // Banka satırında geçersiz IBAN: cari de oluşmaz.
    Map<String, Object> withBank = zto("CUSTOMER", "MUSTERI", "Geri Alınan");
    withBank.put(
        "bankAccounts",
        List.of(
            Map.of(
                "bankName",
                "Banka",
                "iban",
                "TR330006100519786457841327",
                "currency",
                "TRY",
                "category",
                "MAIN")));
    expect(sendJson(w.t(), null, post(FINANCE + "/accounts"), withBank), 422, "IBAN_INVALID");
    assertThat(
            body(send(w.t(), null, get(FINANCE + "/accounts").param("search", "geri alınan"))
                    .andExpect(status().isOk()))
                .get("content"))
        .isEmpty();

    // Yetki reddi: muhasebe kart açamaz.
    send(
            w.t(),
            accounting,
            post(FINANCE + "/accounts")
                .contentType("application/json")
                .content(json.writeValueAsString(zto("CUSTOMER", "MUSTERI", "Y"))))
        .andExpect(status().isForbidden());

    // Kiracı izolasyonu.
    World other = world("apk2");
    send(other.t(), null, get(FINANCE + "/accounts/" + id)).andExpect(status().isNotFound());
  }

  @Test
  void tcknSifreliMaskeliVeMaskeGeriGelinceKorunur() throws Exception {
    World w = world("apt");
    Map<String, Object> body = zto("CUSTOMER", "MUSTERI", "Bireysel Müşteri");
    body.put("taxNumber", TCKN);
    body.put("companyType", "INDIVIDUAL");
    String id = create(w, null, body).get("id").asText();

    Map<String, Object> row =
        jdbc.queryForMap(
            "select tax_number, tax_number_enc, tax_number_hash, tax_number_masked"
                + " from \"%s\".account where id = ?".formatted(w.schema()),
            UUID.fromString(id));
    assertThat(row.get("tax_number")).isNull();
    assertThat((String) row.get("tax_number_enc")).doesNotContain(TCKN);
    assertThat((String) row.get("tax_number_hash")).hasSize(64);
    assertThat(row.get("tax_number_masked")).isEqualTo("*******0146");

    JsonNode listed = listRow(w, null, id, Map.of("search", "bireysel"));
    assertThat(listed.get("taxNumber").asText()).isEqualTo("*******0146");
    assertThat(listed.get("taxNumberMasked").asBoolean()).isTrue();
    JsonNode manage = detail(w, null, id);
    assertThat(manage.get("taxNumber").asText()).isEqualTo(TCKN);
    assertThat(manage.get("taxNumberMasked").asBoolean()).isFalse();
    String accounting = userWithRole(w, "muh", "ACCOUNTING");
    assertThat(detail(w, accounting, id).get("taxNumber").asText()).isEqualTo("*******0146");

    // MUI düzenlemesi maskeyi geri gönderir: değer korunur.
    sendJson(
            w.t(),
            null,
            put(FINANCE + "/accounts/" + id),
            Map.of(
                "name",
                "Bireysel Müşteri 2",
                "type",
                "CUSTOMER",
                "taxNumber",
                "*******0146",
                "code",
                "x"))
        .andExpect(status().isOk());
    assertThat(detail(w, null, id).get("taxNumber").asText()).isEqualTo(TCKN);
    assertThat(
            jdbc.queryForObject(
                "select tax_number_hash from \"%s\".account where id = ?".formatted(w.schema()),
                String.class,
                UUID.fromString(id)))
        .isEqualTo(row.get("tax_number_hash"));
  }

  @Test
  void personelCarisiIzinsizGorunmezVeAcilamaz() throws Exception {
    World w = world("ape");
    String finance = userWithRole(w, "finans", "FINANCE");
    String sup = userWithRole(w, "super", "FINANCE_SUPER");
    String sales = userWithRole(w, "satis", "SALES");

    expect(
        sendJson(w.t(), finance, post(FINANCE + "/accounts"), zto("EMPLOYEE", "SURUCU", "P1")),
        403,
        "ACCOUNT_EMPLOYEE_FORBIDDEN");
    String employee = create(w, sup, zto("EMPLOYEE", "SURUCU", "Personel Bir")).get("id").asText();
    manual(w, UUID.fromString(employee), w.a1(), Direction.DEBIT, "10", "TRY");

    assertThat(ids(list(w, finance, Map.of("types", "EMPLOYEE")))).isEmpty();
    assertThat(ids(list(w, sup, Map.of("types", "EMPLOYEE")))).contains(employee);
    assertThat(ids(list(w, null, Map.of("types", "EMPLOYEE")))).contains(employee);
    expect(send(w.t(), finance, get(FINANCE + "/accounts/" + employee)), 404, "ACCOUNT_NOT_FOUND");
    expect(
        send(
            w.t(),
            finance,
            get(FINANCE + "/accounts/" + employee + "/statement")
                .param("currency", "TRY")
                .param("from", TODAY.minusDays(1).toString())
                .param("to", TODAY.toString())),
        404,
        "ACCOUNT_NOT_FOUND");
    expect(
        send(w.t(), finance, get(FINANCE + "/accounts/" + employee + "/history")),
        404,
        "ACCOUNT_NOT_FOUND");
    Set<String> groups = groupCodes(w, finance);
    assertThat(groups).doesNotContain("SURUCU", "OFIS").contains("MUSTERI");
    assertThat(groupCodes(w, null)).contains("SURUCU", "OFIS");

    // CRM: listede ve detayda personel carisi yok; patron görür.
    JsonNode crm =
        body(
            send(w.t(), sales, get("/api/v1/crm/customers").param("size", "200"))
                .andExpect(status().isOk()));
    assertThat(ids(crm)).doesNotContain(employee);
    send(w.t(), sales, get("/api/v1/crm/customers/" + employee)).andExpect(status().isNotFound());
    send(w.t(), null, get("/api/v1/crm/customers/" + employee)).andExpect(status().isOk());

    // Eski PUT ve CRM PUT ile personel türüne geçiş izinsiz 403; hareketli caride 409.
    String customer = account(w, AccountType.CUSTOMER, null).toString();
    expect(
        sendJson(
            w.t(),
            finance,
            put(FINANCE + "/accounts/" + customer),
            Map.of("name", "Çevrilen", "type", "EMPLOYEE")),
        403,
        "ACCOUNT_EMPLOYEE_FORBIDDEN");
    expect(
        sendJson(
            w.t(),
            sales,
            put("/api/v1/crm/customers/" + customer),
            Map.of("code", "K1", "name", "Çevrilen", "type", "EMPLOYEE")),
        403,
        "ACCOUNT_EMPLOYEE_FORBIDDEN");
    expect(
        sendJson(
            w.t(),
            sales,
            post("/api/v1/crm/customers"),
            Map.of("code", "K2", "name", "Yeni Personel", "type", "EMPLOYEE")),
        403,
        "ACCOUNT_EMPLOYEE_FORBIDDEN");
    manual(w, UUID.fromString(customer), w.a1(), Direction.DEBIT, "5", "TRY");
    expect(
        sendJson(
            w.t(),
            null,
            put(FINANCE + "/accounts/" + customer),
            Map.of("name", "Çevrilen", "type", "SUPPLIER")),
        409,
        "ACCOUNT_TYPE_LOCKED");
    expect(
        sendJson(
            w.t(),
            null,
            put("/api/v1/crm/customers/" + customer),
            Map.of("code", "K1", "name", "Çevrilen", "type", "EMPLOYEE")),
        409,
        "ACCOUNT_TYPE_LOCKED");
    expect(
        sendJson(
            w.t(),
            null,
            put(FINANCE + "/accounts/" + employee),
            Map.of("name", "Personel", "type", "CUSTOMER")),
        409,
        "ACCOUNT_TYPE_LOCKED");
  }

  @Test
  void profilGuncellemeVeSirketBaglama() throws Exception {
    World w = world("app");
    String id = create(w, null, zto("SUPPLIER", "GENEL", "Profil")).get("id").asText();
    String code = detail(w, null, id).get("code").asText();

    Map<String, Object> profile = profile(code, "Profil Yeni", "SUPPLIER", "HIZMET");
    profile.put("phone", "02120000000");
    profile.put("address", "Gizli Sokak No 5");
    profile.put("taxNumber", VKN);
    JsonNode updated =
        body(
            sendJson(w.t(), null, put(FINANCE + "/accounts/" + id + "/profile"), profile)
                .andExpect(status().isOk()));
    assertThat(updated.get("name").asText()).isEqualTo("Profil Yeni");
    assertThat(updated.get("subGroup").asText()).isEqualTo("HIZMET");
    assertThat(updated.get("phone").asText()).isEqualTo("02120000000");
    assertThat(updated.get("updateCount").asInt()).isEqualTo(1);

    // Eski PUT profil alanlarına dokunmaz.
    sendJson(
            w.t(),
            null,
            put(FINANCE + "/accounts/" + id),
            Map.of("name", "Eski Ad", "type", "SUPPLIER", "taxNumber", VKN))
        .andExpect(status().isOk());
    JsonNode after = detail(w, null, id);
    assertThat(after.get("name").asText()).isEqualTo("Eski Ad");
    assertThat(after.get("phone").asText()).isEqualTo("02120000000");
    assertThat(after.get("subGroup").asText()).isEqualTo("HIZMET");
    assertThat(after.get("address").asText()).isEqualTo("Gizli Sokak No 5");

    // Geçmiş: yalnız bu carinin kart olayları, yeniden eskiye; değerler yazılmaz.
    JsonNode history =
        body(
            send(w.t(), null, get(FINANCE + "/accounts/" + id + "/history"))
                .andExpect(status().isOk()));
    List<String> events = new ArrayList<>();
    history.get("content").forEach(row -> events.add(row.get("event").asText()));
    assertThat(events).containsExactly("ACCOUNT_UPDATED", "ACCOUNT_UPDATED", "ACCOUNT_CREATED");
    assertThat(CARD_EVENTS).containsAll(events);
    String details = history.get("content").get(1).get("details").asText();
    assertThat(details).contains("name", "subGroup", "phone", "address");
    assertThat(details).doesNotContain("Gizli", "02120000000", "Profil Yeni");

    // Kod çakışması.
    String otherCode =
        detail(w, null, account(w, AccountType.SUPPLIER, null).toString()).get("code").asText();
    expect(
        sendJson(
            w.t(),
            null,
            put(FINANCE + "/accounts/" + id + "/profile"),
            profile(otherCode, "X", "SUPPLIER", "GENEL")),
        409,
        "ACCOUNT_CODE_TAKEN");

    // Hareketli caride tür değişimi 409; aynı tür içinde grup değişimi 200.
    manual(w, UUID.fromString(id), w.a1(), Direction.CREDIT, "100", "TRY");
    expect(
        sendJson(
            w.t(),
            null,
            put(FINANCE + "/accounts/" + id + "/profile"),
            profile(code, "X", "CARRIER", "TASERON_NAKLIYECI")),
        409,
        "ACCOUNT_TYPE_LOCKED");
    sendJson(
            w.t(),
            null,
            put(FINANCE + "/accounts/" + id + "/profile"),
            profile(code, "X", "SUPPLIER", "AKARYAKIT"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("TAX_NUMBER_REQUIRED"));
    sendJson(
            w.t(),
            null,
            put(FINANCE + "/accounts/" + id + "/profile"),
            profile(code, "X", "SUPPLIER", "ELLECLEME_TASERON"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.subGroup").value("ELLECLEME_TASERON"));

    // Başka şirkette hareketi olan cari o şirkete bağlanamaz; kendi şirketine bağlanır.
    manual(w, UUID.fromString(id), w.b1(), Direction.CREDIT, "50", "TRY");
    Map<String, Object> bindA = profile(code, "X", "SUPPLIER", "GENEL");
    bindA.put("companyId", w.companyA());
    expect(
        sendJson(w.t(), null, put(FINANCE + "/accounts/" + id + "/profile"), bindA),
        409,
        "ACCOUNT_COMPANY_LOCKED");

    // Açık plan, postlanmamış sefer maliyeti ve portföy çeki de bağlamayı engeller.
    String planCard = account(w, AccountType.SUPPLIER, null).toString();
    String planCode = detail(w, null, planCard).get("code").asText();
    sendJson(w.t(), null, post(FINANCE + "/payment-plans"), plan(planCard, w.b1(), TODAY))
        .andExpect(status().isCreated());
    Map<String, Object> bindPlan = profile(planCode, "Plan", "SUPPLIER", "GENEL");
    bindPlan.put("companyId", w.companyA());
    expect(
        sendJson(w.t(), null, put(FINANCE + "/accounts/" + planCard + "/profile"), bindPlan),
        409,
        "ACCOUNT_COMPANY_LOCKED");

    String costCard = account(w, AccountType.CARRIER, null).toString();
    String costCode = detail(w, null, costCard).get("code").asText();
    String customer = account(w, AccountType.CUSTOMER, null).toString();
    UUID shipment = shipment(w, w.b1(), customer, "SV-L1", "DELIVERED");
    tripCost(w, shipment, costCard);
    Map<String, Object> bindCost = profile(costCode, "Nakliye", "CARRIER", "TASERON_NAKLIYECI");
    bindCost.put("companyId", w.companyA());
    expect(
        sendJson(w.t(), null, put(FINANCE + "/accounts/" + costCard + "/profile"), bindCost),
        409,
        "ACCOUNT_COMPANY_LOCKED");

    String checkCard = account(w, AccountType.CUSTOMER, null).toString();
    String checkCode = detail(w, null, checkCard).get("code").asText();
    Map<String, Object> collection = new HashMap<>();
    collection.put("method", "CHECK");
    collection.put("accountId", checkCard);
    collection.put("branchId", w.b1());
    collection.put("money", Map.of("amount", "75", "currency", "TRY"));
    collection.put("date", TODAY.toString());
    collection.put(
        "instrument",
        Map.of("kind", "CHECK", "number", "C-77", "bankName", "Banka", "dueDate", "2027-06-01"));
    sendJson(w.t(), null, post(FINANCE + "/collections"), collection)
        .andExpect(status().isCreated());
    // Yalnız çek kalsın: hareket ve tahsilat satırları silinmiş sayılır.
    jdbc.update(
        "update \"%s\".account_transaction set deleted = true where account_id = ?"
            .formatted(w.schema()),
        UUID.fromString(checkCard));
    jdbc.update(
        "update \"%s\".settlement set deleted = true where account_id = ?".formatted(w.schema()),
        UUID.fromString(checkCard));
    Map<String, Object> bindCheck = profile(checkCode, "Çekli", "CUSTOMER", "MUSTERI");
    bindCheck.put("companyId", w.companyA());
    expect(
        sendJson(w.t(), null, put(FINANCE + "/accounts/" + checkCard + "/profile"), bindCheck),
        409,
        "ACCOUNT_COMPANY_LOCKED");

    // Karta şirket bağla (A) → B şirketindeki seferi kapat: türetilmiş akış çalışır (F8).
    String carrier = account(w, AccountType.CARRIER, null).toString();
    String carrierCode = detail(w, null, carrier).get("code").asText();
    Map<String, Object> bindCarrier =
        profile(carrierCode, "Bağlı Nakliye", "CARRIER", "TASERON_NAKLIYECI");
    bindCarrier.put("companyId", w.companyA());
    sendJson(w.t(), null, put(FINANCE + "/accounts/" + carrier + "/profile"), bindCarrier)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.companyId").value(w.companyA()));
    UUID trip = shipment(w, w.b1(), customer, "SV-L2", "INVOICED");
    tripCost(w, trip, carrier);
    sendJson(
            w.t(),
            null,
            post("/api/v1/shipment/shipments/" + trip + "/close"),
            Map.of("date", TODAY.toString(), "dueDate", TODAY.plusDays(30).toString()))
        .andExpect(status().isOk());
    assertThat(
            jdbc.queryForObject(
                "select count(*) from \"%s\".account_transaction where account_id = ?"
                        .formatted(w.schema())
                    + " and company_id = ? and deleted = false",
                Integer.class,
                UUID.fromString(carrier),
                w.companyBId()))
        .isEqualTo(1);
    // Kullanıcı girişli yolda kimlik kuralı: B iş yerinden elle hareket 422.
    Map<String, Object> manualB = new HashMap<>();
    manualB.put("branchId", w.b1());
    manualB.put("direction", "DEBIT");
    manualB.put("money", Map.of("amount", "5", "currency", "TRY"));
    manualB.put("date", TODAY.toString());
    expect(
        sendJson(w.t(), null, post(FINANCE + "/accounts/" + carrier + "/transactions"), manualB),
        422,
        "COMPANY_MISMATCH");
  }

  @Test
  void pasifCariYeniIslemAlmazTuretilmisAkisCalisir() throws Exception {
    World w = world("apa");
    sendJson(w.t(), null, put(FINANCE + "/settings"), Map.of("allowSelfApproval", true))
        .andExpect(status().isOk());
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    UUID manualTx = manual(w, supplier, w.a1(), Direction.CREDIT, "300", "TRY");
    String plan =
        id(
            sendJson(
                w.t(),
                null,
                post(FINANCE + "/payment-plans"),
                plan(supplier.toString(), w.a1(), TODAY)));
    sendJson(w.t(), null, post(FINANCE + "/payment-plans/" + plan + "/submit"), Map.of())
        .andExpect(status().isOk());
    sendJson(w.t(), null, post(FINANCE + "/payment-plans/" + plan + "/approve"), Map.of())
        .andExpect(status().isOk());

    JsonNode passive =
        body(
            sendJson(
                    w.t(),
                    null,
                    patch(FINANCE + "/accounts/" + supplier + "/active"),
                    Map.of("active", false))
                .andExpect(status().isOk()));
    assertThat(passive.get("active").asBoolean()).isFalse();
    assertThat(passive.get("updateCount").asInt()).isEqualTo(1);

    Map<String, Object> manualBody = new HashMap<>();
    manualBody.put("branchId", w.a1());
    manualBody.put("direction", "DEBIT");
    manualBody.put("money", Map.of("amount", "5", "currency", "TRY"));
    manualBody.put("date", TODAY.toString());
    expect(
        sendJson(
            w.t(), null, post(FINANCE + "/accounts/" + supplier + "/transactions"), manualBody),
        422,
        "ACCOUNT_INACTIVE");
    Map<String, Object> payment = new HashMap<>();
    payment.put("method", "CASH");
    payment.put("accountId", supplier.toString());
    payment.put("branchId", w.a1());
    payment.put("fundAccountId", w.fundA1());
    payment.put("money", Map.of("amount", "5", "currency", "TRY"));
    payment.put("date", TODAY.toString());
    expect(sendJson(w.t(), null, post(FINANCE + "/payments"), payment), 422, "ACCOUNT_INACTIVE");
    Map<String, Object> invoice = new HashMap<>();
    invoice.put("accountId", supplier.toString());
    invoice.put("branchId", w.a1());
    invoice.put("number", "F-1");
    invoice.put("invoiceDate", TODAY.toString());
    invoice.put("dueDate", TODAY.plusDays(30).toString());
    invoice.put("net", Map.of("amount", "100", "currency", "TRY"));
    invoice.put("vat", Map.of("amount", "20", "currency", "TRY"));
    expect(
        sendJson(w.t(), null, post(FINANCE + "/purchase-invoices"), invoice),
        422,
        "ACCOUNT_INACTIVE");
    expect(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/payment-plans"),
            plan(supplier.toString(), w.a1(), TODAY)),
        422,
        "ACCOUNT_INACTIVE");

    // Türetilmiş akışlar: onaylı plan ödenir, elle hareket ters çevrilir.
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/payment-plans/" + plan + "/pay"),
            Map.of("method", "CASH", "fundAccountId", w.fundA1(), "date", TODAY.toString()))
        .andExpect(status().isOk());
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/accounts/transactions/" + manualTx + "/reverse"),
            Map.of("date", TODAY.toString()))
        .andExpect(status().isOk());

    // Hareketli cari silinemez; grup carisi pasifleşemez.
    expect(
        send(w.t(), null, delete(FINANCE + "/accounts/" + supplier)),
        409,
        "ACCOUNT_HAS_TRANSACTIONS");
    UUID intercompany =
        jdbc.queryForObject(
            "select id from \"%s\".account where represents_company_id is not null limit 1"
                .formatted(w.schema()),
            UUID.class);
    expect(
        sendJson(
            w.t(),
            null,
            patch(FINANCE + "/accounts/" + intercompany + "/active"),
            Map.of("active", false)),
        409,
        "INTERCOMPANY_ACCOUNT_LOCKED");

    // Yeniden aktif.
    sendJson(
            w.t(),
            null,
            patch(FINANCE + "/accounts/" + supplier + "/active"),
            Map.of("active", true))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.active").value(true));
  }

  @Test
  void limitlerVeKartYazimKapsami() throws Exception {
    World w = world("apl");
    UUID card = account(w, AccountType.CUSTOMER, null);

    JsonNode limited =
        body(
            sendJson(
                    w.t(),
                    null,
                    put(FINANCE + "/accounts/" + card + "/limits"),
                    Map.of("creditLimit", 1000, "riskLimit", 400))
                .andExpect(status().isOk()));
    assertThat(limited.get("creditLimit").decimalValue()).isEqualByComparingTo("1000");
    assertThat(limited.get("riskLimit").decimalValue()).isEqualByComparingTo("400");
    JsonNode company =
        body(
            sendJson(
                    w.t(),
                    null,
                    put(FINANCE + "/accounts/" + card + "/limits"),
                    Map.of("companyId", w.companyA(), "creditLimit", 700))
                .andExpect(status().isOk()));
    assertThat(company.get("companyLimits")).hasSize(1);
    assertThat(company.get("companyLimits").get(0).get("companyId").asText())
        .isEqualTo(w.companyA());
    assertThat(company.get("companyLimits").get(0).get("creditLimit").decimalValue())
        .isEqualByComparingTo("700");
    sendJson(w.t(), null, put(FINANCE + "/accounts/" + card + "/limits"), Map.of("creditLimit", -1))
        .andExpect(status().isBadRequest());

    // LIMITED (A1): görünmeyen şirket 403; A2 şubeli kartta yazım 403, kart değişmez.
    String a1User = limitedUser(w, "a1fin", "FINANCE", List.of(w.a1()));
    expect(
        sendJson(
            w.t(),
            a1User,
            put(FINANCE + "/accounts/" + card + "/limits"),
            Map.of("companyId", w.companyB(), "creditLimit", 1)),
        403,
        "COMPANY_OUT_OF_SCOPE");
    String a2Card =
        body(sendJson(
                    w.t(),
                    null,
                    post(FINANCE + "/accounts"),
                    Map.of("name", "A2 Kart", "type", "CUSTOMER", "branchId", w.a2()))
                .andExpect(status().isCreated()))
            .get("id")
            .asText();
    expect(
        sendJson(
            w.t(),
            a1User,
            patch(FINANCE + "/accounts/" + a2Card + "/active"),
            Map.of("active", false)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        sendJson(
            w.t(),
            a1User,
            put(FINANCE + "/accounts/" + a2Card + "/limits"),
            Map.of("creditLimit", 5)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        send(w.t(), a1User, delete(FINANCE + "/accounts/" + a2Card)), 403, "BRANCH_OUT_OF_SCOPE");
    JsonNode unchanged = detail(w, null, a2Card);
    assertThat(unchanged.get("active").asBoolean()).isTrue();
    assertThat(unchanged.get("creditLimit").isNull()).isTrue();
    assertThat(unchanged.get("updateCount").asInt()).isZero();

    // Şubesiz kartta LIMITED kullanıcı yazabilir.
    sendJson(
            w.t(),
            a1User,
            patch(FINANCE + "/accounts/" + card + "/active"),
            Map.of("active", false))
        .andExpect(status().isOk());
    sendJson(
            w.t(), a1User, put(FINANCE + "/accounts/" + card + "/limits"), Map.of("creditLimit", 5))
        .andExpect(status().isOk());
    send(w.t(), a1User, delete(FINANCE + "/accounts/" + card)).andExpect(status().isNoContent());
  }

  /**
   * SEC-12.1-03: günlük özette personel carisinin adı yalnız FINANCE_EMPLOYEE_VIEW sahibine
   * yazılır; iki alıcı da ALL kapsamlı olduğundan içerik ayrı önbellek anahtarlarıyla kurulmalıdır.
   */
  @Test
  void gunlukOzetPersonelCarisiAdiniIzinsizAlicidanGizler() throws Exception {
    World w = world("apd");
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    jdbc.update(
        "update \"%s\".account set name = 'Ahmet Personelli' where id = ?".formatted(w.schema()),
        employee);
    String plan =
        id(
            sendJson(
                w.t(),
                null,
                post(FINANCE + "/payment-plans"),
                plan(employee.toString(), w.a1(), TODAY)));
    userWithRole(w, "ozetfin", "FINANCE");
    userWithRole(w, "ozetsuper", "FINANCE_SUPER");
    // Onaya gönderim anlık e-postası da alıcıları personel izni üzerinden ayırır.
    sendJson(w.t(), null, post(FINANCE + "/payment-plans/" + plan + "/submit"), Map.of())
        .andExpect(status().isOk());
    jdbc.update(
        "update \"%s\".payment_plan set status = 'APPROVED' where id = ?".formatted(w.schema()),
        UUID.fromString(plan));
    String financeEmail = "ozetfin@" + w.t() + ".test";
    String superEmail = "ozetsuper@" + w.t() + ".test";
    int financeBefore = notices(financeEmail).size();
    int superBefore = notices(superEmail).size();
    TenantContext.set(w.t(), w.schema());
    try {
      // Zamanlanmış koşuyla çakışmasın diye yarının özeti.
      digest.sendForCurrentTenant(TODAY.plusDays(1));
    } finally {
      TenantContext.clear();
    }
    String financeText = digestText(financeEmail, financeBefore);
    assertThat(financeText).contains("Vadesi gelen ödeme: 1").contains("- Cari — 100 TRY");
    assertThat(financeText).doesNotContain("Ahmet Personelli");
    assertThat(digestText(superEmail, superBefore)).contains("- Ahmet Personelli — 100 TRY");
  }

  /**
   * SEC-12.1-04: profil kart kilidini tutarken (şirkete bağlama işlenmemiş) gelen başka şirket
   * belgesi kilidi bekler ve işlenmiş bağı görür (422); ters sırada giriş önce işlenirse bağlama
   * 409 alır.
   */
  @Test
  void sirketeBaglamaIleKullaniciGirisiYarisindaOnceGelenKazanir() throws Exception {
    World w = world("apy");
    UUID card = account(w, AccountType.SUPPLIER, null);
    String code = detail(w, null, card.toString()).get("code").asText();
    Map<String, Object> document = new HashMap<>();
    document.put("side", "PAYABLE");
    document.put("documentType", "CEZA_BIZE");
    document.put("documentNo", "BLG-YARIS");
    document.put("documentDate", TODAY.toString());
    document.put("amount", "40");
    document.put("currency", "TRY");
    document.put("paymentMethod", "BANK");
    document.put("branchId", w.b1());

    // 1) Bağlama (A) kart kilidini tutarken B belgesi: bekler, sonra 422 COMPANY_MISMATCH.
    ExecutorService pool = Executors.newSingleThreadExecutor();
    try (Connection held = jdbc.getDataSource().getConnection()) {
      held.setAutoCommit(false);
      try (PreparedStatement lock =
              held.prepareStatement(
                  "select id from \"%s\".account where id = ? for update".formatted(w.schema()));
          PreparedStatement bind =
              held.prepareStatement(
                  "update \"%s\".account set company_id = ? where id = ?".formatted(w.schema()))) {
        lock.setObject(1, card);
        lock.executeQuery().close();
        bind.setObject(1, w.companyAId());
        bind.setObject(2, card);
        bind.executeUpdate();
      }
      Future<ResultActions> entry =
          pool.submit(
              () ->
                  sendJson(
                      w.t(), null, post(FINANCE + "/accounts/" + card + "/documents"), document));
      awaitLockWaiter("for share");
      held.commit();
      expect(entry.get(2, TimeUnit.MINUTES), 422, "COMPANY_MISMATCH");
    } finally {
      pool.shutdownNow();
    }
    assertThat(
            jdbc.queryForObject(
                "select count(*) from \"%s\".account_document where account_id = ?"
                    .formatted(w.schema()),
                Long.class,
                card))
        .isZero();

    // 2) Ters sıra: B kaydı kart FOR SHARE altında yazılırken bağlama (A) bekler, sonra 409.
    UUID other = account(w, AccountType.SUPPLIER, null);
    UUID bRow = manual(w, other, w.b1(), Direction.CREDIT, "15", "TRY");
    UUID free = account(w, AccountType.SUPPLIER, null);
    String freeCode = detail(w, null, free.toString()).get("code").asText();
    ExecutorService pool2 = Executors.newSingleThreadExecutor();
    try (Connection held = jdbc.getDataSource().getConnection()) {
      held.setAutoCommit(false);
      try (PreparedStatement share =
              held.prepareStatement(
                  "select id from \"%s\".account where id = ? for share".formatted(w.schema()));
          PreparedStatement move =
              held.prepareStatement(
                  "update \"%s\".account_transaction set account_id = ? where id = ?"
                      .formatted(w.schema()))) {
        share.setObject(1, free);
        share.executeQuery().close();
        move.setObject(1, free);
        move.setObject(2, bRow);
        move.executeUpdate();
      }
      Map<String, Object> bindA = profile(freeCode, "Serbest", "SUPPLIER", "GENEL");
      bindA.put("companyId", w.companyA());
      Future<ResultActions> binding =
          pool2.submit(
              () -> sendJson(w.t(), null, put(FINANCE + "/accounts/" + free + "/profile"), bindA));
      awaitLockWaiter("update");
      held.commit();
      expect(binding.get(2, TimeUnit.MINUTES), 409, "ACCOUNT_COMPANY_LOCKED");
    } finally {
      pool2.shutdownNow();
    }
    assertThat(detail(w, null, free.toString()).get("companyId").isNull()).isTrue();
    assertThat(code).isNotBlank();
  }

  /** SEC-12.1-06: eski ters kayıt ucu personel carisinin hareketini izinsiz kullanıcıya açmaz. */
  @Test
  void eskiTersKayitUcuPersonelHareketiniIzinsizeGizler() throws Exception {
    World w = world("apr6");
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    UUID row = manual(w, employee, w.a1(), Direction.DEBIT, "30", "TRY");
    String finance = userWithRole(w, "terfin", "FINANCE");
    Map<String, Object> reverse = Map.of("date", TODAY.toString(), "description", "Ters");
    expect(
        sendJson(
            w.t(), finance, post(FINANCE + "/accounts/transactions/" + row + "/reverse"), reverse),
        404,
        "TRANSACTION_NOT_FOUND");
    String reversals =
        "select count(*) from \"%s\".account_transaction where source_type = 'REVERSAL'"
                .formatted(w.schema())
            + " and source_id = ?";
    assertThat(jdbc.queryForObject(reversals, Long.class, row)).isZero();
    String superUser = userWithRole(w, "tersuper", "FINANCE_SUPER");
    sendJson(
            w.t(), superUser, post(FINANCE + "/accounts/transactions/" + row + "/reverse"), reverse)
        .andExpect(status().isOk());
    assertThat(jdbc.queryForObject(reversals, Long.class, row)).isEqualTo(1);
  }

  /**
   * T-1 / OK-42: Düzenle formunun kart limiti akışı — önce {@code PUT /limits}, sonra limit
   * içermeyen {@code PUT /profile}. Profil PUT'u limiti (gövdede gelse bile) değiştirmez, şirket
   * limitine de dokunmaz; limit kaybı olmaz.
   */
  @Test
  void duzenleAkisindaKartLimitiProfilPutundaKorunur() throws Exception {
    World w = world("apf");
    String id = create(w, null, zto("CUSTOMER", "MUSTERI", "Limitli")).get("id").asText();
    String code = detail(w, null, id).get("code").asText();
    sendJson(
            w.t(),
            null,
            put(FINANCE + "/accounts/" + id + "/limits"),
            Map.of("companyId", w.companyA(), "creditLimit", 700, "riskLimit", 300))
        .andExpect(status().isOk());

    // Ön yüz akışı (accountFormLogic.limitsChange + profileBody): limit, sonra profil.
    Map<String, Object> cardLimit = new HashMap<>();
    cardLimit.put("companyId", null);
    cardLimit.put("creditLimit", 5000);
    cardLimit.put("riskLimit", 2000);
    sendJson(w.t(), null, put(FINANCE + "/accounts/" + id + "/limits"), cardLimit)
        .andExpect(status().isOk());
    Map<String, Object> profile = profile(code, "Limitli Yeni", "CUSTOMER", "MUSTERI");
    sendJson(w.t(), null, put(FINANCE + "/accounts/" + id + "/profile"), profile)
        .andExpect(status().isOk());
    JsonNode saved = detail(w, null, id);
    assertThat(saved.get("name").asText()).isEqualTo("Limitli Yeni");
    assertThat(saved.get("creditLimit").decimalValue()).isEqualByComparingTo("5000");
    assertThat(saved.get("riskLimit").decimalValue()).isEqualByComparingTo("2000");
    assertThat(
            body(send(w.t(), null, get(FINANCE + "/accounts/" + id + "/history")))
                .findValuesAsText("event"))
        .contains("ACCOUNT_LIMITS_CHANGED", "ACCOUNT_UPDATED");

    // Eski istemci limiti profil gövdesinde gönderse de yok sayılır (sözleşme dışı alan).
    Map<String, Object> stale = profile(code, "Limitli Yeni", "CUSTOMER", "MUSTERI");
    stale.put("creditLimit", 1);
    stale.put("riskLimit", null);
    sendJson(w.t(), null, put(FINANCE + "/accounts/" + id + "/profile"), stale)
        .andExpect(status().isOk());
    JsonNode after = detail(w, null, id);
    assertThat(after.get("creditLimit").decimalValue()).isEqualByComparingTo("5000");
    assertThat(after.get("riskLimit").decimalValue()).isEqualByComparingTo("2000");

    // Boş alan limiti kaldırır (PUT /limits null).
    cardLimit.put("creditLimit", null);
    sendJson(w.t(), null, put(FINANCE + "/accounts/" + id + "/limits"), cardLimit)
        .andExpect(status().isOk());
    JsonNode cleared = detail(w, null, id);
    assertThat(cleared.get("creditLimit").isNull()).isTrue();
    assertThat(cleared.get("riskLimit").decimalValue()).isEqualByComparingTo("2000");

    // Şirket limiti yalnız şirketli PUT /limits ile yazılır.
    JsonNode companyLimit = cleared.get("companyLimits").get(0);
    assertThat(companyLimit.get("companyId").asText()).isEqualTo(w.companyA());
    assertThat(companyLimit.get("creditLimit").decimalValue()).isEqualByComparingTo("700");
    assertThat(companyLimit.get("riskLimit").decimalValue()).isEqualByComparingTo("300");
  }

  /** SEC-12.1-02: kapsam dışı şirkete bağlı kart LIMITED kullanıcıca çözülemez ve taşınamaz. */
  @Test
  void kapsamDisiSirketeBagliKartCozulemez() throws Exception {
    World w = world("apb");
    String id = create(w, null, zto("CUSTOMER", "MUSTERI", "B Bağlı")).get("id").asText();
    String code = detail(w, null, id).get("code").asText();
    Map<String, Object> bindB = profile(code, "B Bağlı", "CUSTOMER", "MUSTERI");
    bindB.put("companyId", w.companyB());
    sendJson(w.t(), null, put(FINANCE + "/accounts/" + id + "/profile"), bindB)
        .andExpect(status().isOk());

    String a1User = limitedUser(w, "a1bag", "FINANCE", List.of(w.a1()));
    expect(
        sendJson(
            w.t(),
            a1User,
            put(FINANCE + "/accounts/" + id + "/profile"),
            profile(code, "B Bağlı", "CUSTOMER", "MUSTERI")),
        403,
        "COMPANY_OUT_OF_SCOPE");
    Map<String, Object> toA = profile(code, "B Bağlı", "CUSTOMER", "MUSTERI");
    toA.put("companyId", w.companyA());
    expect(
        sendJson(w.t(), a1User, put(FINANCE + "/accounts/" + id + "/profile"), toA),
        403,
        "COMPANY_OUT_OF_SCOPE");
    // Şirket bağı değişmiyorsa (yalnız telefon) şubesiz kart LIMITED kullanıcıca güncellenir.
    Map<String, Object> keep = profile(code, "B Bağlı", "CUSTOMER", "MUSTERI");
    keep.put("companyId", w.companyB());
    keep.put("phone", "02120000001");
    sendJson(w.t(), a1User, put(FINANCE + "/accounts/" + id + "/profile"), keep)
        .andExpect(status().isOk());
    assertThat(
            jdbc.queryForObject(
                "select company_id from \"%s\".account where id = ?".formatted(w.schema()),
                UUID.class,
                UUID.fromString(id)))
        .isEqualTo(w.companyBId());
    assertThat(detail(w, null, id).get("phone").asText()).isEqualTo("02120000001");
  }

  /** SEC-12.1-05: kart detayında LIMITED kullanıcı yalnız görünür şirketlerin limitini görür. */
  @Test
  void kartDetayindaGorunmeyenSirketinLimitiGizlenir() throws Exception {
    World w = world("apv");
    UUID card = account(w, AccountType.CUSTOMER, null);
    for (String company : List.of(w.companyA(), w.companyB())) {
      sendJson(
              w.t(),
              null,
              put(FINANCE + "/accounts/" + card + "/limits"),
              Map.of("companyId", company, "creditLimit", 900, "riskLimit", 100))
          .andExpect(status().isOk());
    }
    assertThat(detail(w, null, card.toString()).get("companyLimits")).hasSize(2);

    String a1User = limitedUser(w, "a1lim", "FINANCE", List.of(w.a1()));
    String raw =
        send(w.t(), a1User, get(FINANCE + "/accounts/" + card))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString();
    JsonNode limits = json.readTree(raw).get("companyLimits");
    assertThat(limits).hasSize(1);
    assertThat(limits.get(0).get("companyId").asText()).isEqualTo(w.companyA());
    assertThat(raw).doesNotContain(w.companyB());
  }

  @Test
  void listeSuzgecleriPlanOzetiVeKirilimliBakiye() throws Exception {
    World w = world("apr");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID agency = account(w, AccountType.CUSTOMER, "ACENTE");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    sendJson(
            w.t(),
            null,
            patch(FINANCE + "/accounts/" + agency + "/active"),
            Map.of("active", false))
        .andExpect(status().isOk());

    assertThat(ids(list(w, null, Map.of("types", "SUPPLIER"))))
        .contains(supplier.toString())
        .doesNotContain(customer.toString());
    assertThat(ids(list(w, null, Map.of("subGroups", "ACENTE"))))
        .containsExactly(agency.toString());
    assertThat(ids(list(w, null, Map.of("active", "false")))).contains(agency.toString());
    assertThat(ids(list(w, null, Map.of("active", "true"))))
        .doesNotContain(agency.toString())
        .contains(customer.toString());

    // Plan özeti: gecikmiş ve bugün vadeli.
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/payment-plans"),
            plan(supplier.toString(), w.a1(), TODAY.minusDays(3)))
        .andExpect(status().isCreated());
    sendJson(
            w.t(), null, post(FINANCE + "/payment-plans"), plan(supplier.toString(), w.a1(), TODAY))
        .andExpect(status().isCreated());
    JsonNode summary =
        listRow(
                w,
                null,
                supplier.toString(),
                Map.of("types", "SUPPLIER", "includePlanSummary", "true"))
            .get("planSummary");
    assertThat(summary.get("overdueCount").asInt()).isEqualTo(1);
    assertThat(summary.get("dueTodayCount").asInt()).isEqualTo(1);
    assertThat(summary.get("draftCount").asInt()).isEqualTo(2);
    assertThat(summary.get("nextDueDate").asText()).isEqualTo(TODAY.minusDays(3).toString());
    assertThat(summary.get("planned").get(0).get("amount").decimalValue())
        .isEqualByComparingTo("200");
    assertThat(
            listRow(w, null, supplier.toString(), Map.of("types", "SUPPLIER"))
                .get("planSummary")
                .isNull())
        .isTrue();

    // Şirket kırılımı: A 100 (A1 60 + A2 40), B 50.
    manual(w, customer, w.a1(), Direction.DEBIT, "60", "TRY");
    manual(w, customer, w.a2(), Direction.DEBIT, "40", "TRY");
    manual(w, customer, w.b1(), Direction.DEBIT, "50", "TRY");
    JsonNode balances =
        listRow(
                w,
                null,
                customer.toString(),
                Map.of("types", "CUSTOMER", "balanceGroupBy", "COMPANY"))
            .get("balances");
    Map<String, BigDecimal> byCompany = new HashMap<>();
    balances.forEach(
        row -> byCompany.put(row.get("companyId").asText(), row.get("balance").decimalValue()));
    assertThat(byCompany.get(w.companyA())).isEqualByComparingTo("100");
    assertThat(byCompany.get(w.companyB())).isEqualByComparingTo("50");
    assertThat(balances.get(0).get("receivable").decimalValue()).isPositive();

    // LIMITED (A1) kart listesini tam görür, bakiyeler yalnız A1.
    String a1User = limitedUser(w, "a1", "FINANCE", List.of(w.a1()));
    assertThat(ids(list(w, a1User, Map.of()))).contains(customer.toString(), supplier.toString());
    JsonNode a1Balance =
        listRow(w, a1User, customer.toString(), Map.of("types", "CUSTOMER")).get("balances");
    assertThat(a1Balance).hasSize(1);
    assertThat(a1Balance.get(0).get("balance").decimalValue()).isEqualByComparingTo("60");

    // Sayfa boyutu bu uçta 200'ü aşabilir.
    assertThat(
            body(send(w.t(), null, get(FINANCE + "/accounts").param("size", "1000"))
                    .andExpect(status().isOk()))
                .get("size")
                .asInt())
        .isEqualTo(1000);
  }

  // --- yardımcılar

  /** Başka bir oturumun satır kilidi beklediği görülene kadar (en çok 30 sn) bekler. */
  private void awaitLockWaiter(String sqlFragment) throws InterruptedException {
    long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(30);
    while (System.nanoTime() < deadline) {
      Long waiting =
          jdbc.queryForObject(
              "select count(*) from pg_stat_activity where wait_event_type = 'Lock'"
                  + " and state = 'active' and query ilike ?",
              Long.class,
              "%" + sqlFragment + "%");
      if (waiting != null && waiting > 0) {
        return;
      }
      Thread.sleep(50);
    }
    throw new AssertionError("Kilit bekleyen oturum görülmedi: " + sqlFragment);
  }

  private static List<Notice> notices(String email) {
    return SENT_NOTICES.stream().filter(n -> n.email().equals(email)).toList();
  }

  /** {@code from} sırasından sonra gelen tek günlük özet e-postasının metni. */
  private static String digestText(String email, int from) {
    List<Notice> all = notices(email);
    List<Notice> digests =
        all.subList(from, all.size()).stream()
            .filter(n -> n.text() != null && n.text().contains("Ayrıntılar: "))
            .toList();
    assertThat(digests).hasSize(1);
    return digests.get(0).text();
  }

  private Map<String, Object> zto(String type, String subGroup, String name) {
    Map<String, Object> body = new HashMap<>();
    body.put("name", name);
    body.put("type", type);
    if (subGroup != null) {
      body.put("subGroup", subGroup);
    }
    return body;
  }

  private Map<String, Object> profile(String code, String name, String type, String subGroup) {
    Map<String, Object> body = new HashMap<>();
    body.put("code", code);
    body.put("name", name);
    body.put("type", type);
    body.put("subGroup", subGroup);
    return body;
  }

  private Map<String, Object> plan(String account, String branch, java.time.LocalDate due) {
    Map<String, Object> body = new HashMap<>();
    body.put("accountId", account);
    body.put("branchId", branch);
    body.put("money", Map.of("amount", "100", "currency", "TRY"));
    body.put("dueDate", due.toString());
    body.put("description", "Plan");
    return body;
  }

  private JsonNode create(World w, String token, Map<String, Object> body) throws Exception {
    return body(
        sendJson(w.t(), token, post(FINANCE + "/accounts"), body).andExpect(status().isCreated()));
  }

  private JsonNode detail(World w, String token, String id) throws Exception {
    return body(send(w.t(), token, get(FINANCE + "/accounts/" + id)).andExpect(status().isOk()));
  }

  private JsonNode list(World w, String token, Map<String, String> params) throws Exception {
    var request = get(FINANCE + "/accounts").param("size", "200");
    params.forEach(request::param);
    return body(send(w.t(), token, request).andExpect(status().isOk()));
  }

  private JsonNode listRow(World w, String token, String id, Map<String, String> params)
      throws Exception {
    for (JsonNode row : list(w, token, params).get("content")) {
      if (id.equals(row.get("id").asText())) {
        return row;
      }
    }
    throw new AssertionError("Listede yok: " + id);
  }

  private static List<String> ids(JsonNode page) {
    List<String> ids = new ArrayList<>();
    page.get("content").forEach(row -> ids.add(row.get("id").asText()));
    return ids;
  }

  private Set<String> groupCodes(World w, String token) throws Exception {
    Set<String> codes = new HashSet<>();
    body(send(w.t(), token, get(FINANCE + "/account-groups")).andExpect(status().isOk()))
        .forEach(row -> codes.add(row.get("code").asText()));
    return codes;
  }

  private List<String> parallelCodes(World w, int count) throws Exception {
    ExecutorService pool = Executors.newFixedThreadPool(count);
    try {
      List<Future<String>> futures = new ArrayList<>();
      for (int i = 0; i < count; i++) {
        int index = i;
        Callable<String> task =
            () ->
                body(sendJson(
                            w.t(),
                            null,
                            post(FINANCE + "/accounts"),
                            zto("CUSTOMER", "ACENTE", "Eşzamanlı " + index))
                        .andExpect(status().isCreated()))
                    .get("code")
                    .asText();
        futures.add(pool.submit(task));
      }
      List<String> codes = new ArrayList<>();
      for (Future<String> future : futures) {
        codes.add(future.get(2, TimeUnit.MINUTES));
      }
      return codes;
    } finally {
      pool.shutdownNow();
    }
  }

  private UUID shipment(World w, String branch, String customer, String number, String status) {
    Map<String, Object> values = new LinkedHashMap<>();
    values.put("id", UUID.randomUUID());
    values.put("number", number);
    values.put("account_id", UUID.fromString(customer));
    values.put("branch_id", UUID.fromString(branch));
    values.put("status", status);
    values.put("net_amount", new BigDecimal("100"));
    values.put("vat_amount", new BigDecimal("20"));
    values.put("withholding_amount", BigDecimal.ZERO);
    values.put("total_amount", new BigDecimal("120"));
    values.put("breakdown", "{}");
    return insert(w, "shipment", values);
  }

  private void tripCost(World w, UUID shipment, String account) {
    Map<String, Object> values = new LinkedHashMap<>();
    values.put("id", UUID.randomUUID());
    values.put("shipment_id", shipment);
    values.put("kind", "SUBCONTRACTOR");
    values.put("account_id", UUID.fromString(account));
    values.put("amount", new BigDecimal("80"));
    values.put("currency", "TRY");
    values.put("tl_amount", new BigDecimal("80"));
    insert(w, "trip_cost", values);
  }

  /** Verilmeyen NOT NULL (varsayılansız) kolonlar türüne göre sahte değer alır. */
  private UUID insert(World w, String table, Map<String, Object> values) {
    Map<String, Object> row = new LinkedHashMap<>(values);
    for (Map<String, Object> column :
        jdbc.queryForList(
            """
            select column_name, data_type, character_maximum_length
            from information_schema.columns
            where table_schema = ? and table_name = ? and is_nullable = 'NO'
              and column_default is null
            order by ordinal_position
            """,
            w.schema(),
            table)) {
      String name = (String) column.get("column_name");
      if (!row.containsKey(name)) {
        Object length = column.get("character_maximum_length");
        row.put(
            name,
            switch ((String) column.get("data_type")) {
              case "uuid" -> UUID.randomUUID();
              case "character varying", "text" -> "X";
              case "character" ->
                  name.equals("currency") ? "TRY" : "X".repeat(((Number) length).intValue());
              case "numeric", "integer", "bigint", "smallint" -> 1;
              case "boolean" -> false;
              case "date" -> TODAY;
              case "timestamp with time zone" -> OffsetDateTime.now(TENANT_ZONE);
              default -> throw new IllegalArgumentException(name);
            });
      }
    }
    String names = String.join(", ", row.keySet());
    String marks = row.keySet().stream().map(n -> "?").collect(Collectors.joining(", "));
    jdbc.update(
        "insert into \"%s\".%s (%s) values (%s)".formatted(w.schema(), table, names, marks),
        row.values().toArray());
    return (UUID) row.get("id");
  }
}
