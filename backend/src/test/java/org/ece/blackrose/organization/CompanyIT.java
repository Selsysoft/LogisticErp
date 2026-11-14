package org.ece.blackrose.organization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.ece.blackrose.AbstractIntegrationTest;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Şirket kartı, varsayılan devri, intercompany carisi, logo, e-belge ayarı, seriler, cephe. */
class CompanyIT extends AbstractIntegrationTest {

  private static final String COMPANIES = "/api/v1/organization/companies";
  private static final String VALID_VKN = "1234567890";
  private static final String VALID_TCKN = "10000000146";
  private static final byte[] PNG = {(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2};
  private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 1, 2};

  @Autowired TenantRepository tenants;
  @Autowired JdbcTemplate jdbc;

  @Test
  void sirketKartiVarsayilanDevriVeKurallar() throws Exception {
    String t = newTenant("cmp");
    JsonNode list = body(send(t, get(COMPANIES)).andExpect(status().isOk()));
    assertThat(list.get("totalElements").asInt()).isEqualTo(1);
    JsonNode first = list.get("content").get(0);
    String a = first.get("id").asText();
    assertThat(first.get("code").asText()).isEqualTo("SIRKET1");
    assertThat(first.get("defaultCompany").asBoolean()).isTrue();
    assertThat(first.get("edocumentEnabled").asBoolean()).isFalse();
    assertThat(first.get("edocumentTestMode").asBoolean()).isTrue();
    assertThat(intercompanyCodes(t)).as("tek şirkette grup carisi yok").isEmpty();

    JsonNode b = body(save(t, post(COMPANIES), company("SIR2", "Beta AŞ", VALID_VKN)));
    assertThat(b.get("defaultCompany").asBoolean()).isFalse();
    assertThat(b.get("active").asBoolean()).isTrue();
    assertThat(b.get("updateCount").asInt()).isZero();
    assertThat(b.get("country").asText()).isEqualTo("TR");
    assertThat(b.get("createdBy").asText()).isEqualTo(ownerEmail(t));
    assertThat(intercompanyCodes(t)).containsExactlyInAnyOrder("GS-SIRKET1", "GS-SIR2");

    expectError(save(t, post(COMPANIES), company("SIR2", "X", null)), 409, "COMPANY_CODE_TAKEN");
    expectError(
        save(t, post(COMPANIES), company("SIR3", "X", VALID_VKN)), 409, "COMPANY_TAX_TAKEN");
    expectError(
        save(t, post(COMPANIES), company("SIR3", "X", "1234567891")), 422, "TAX_NUMBER_INVALID");
    Map<String, Object> badTckn = company("SIR3", "X", "10000000147");
    badTckn.put("taxIdType", "TCKN");
    expectError(save(t, post(COMPANIES), badTckn), 422, "TAX_NUMBER_INVALID");
    Map<String, Object> lengthMismatch = company("SIR3", "X", VALID_TCKN);
    expectError(save(t, post(COMPANIES), lengthMismatch), 422, "TAX_NUMBER_INVALID");
    Map<String, Object> badCode = company("sir 3", "X", null);
    expectError(save(t, post(COMPANIES), badCode), 400, "VALIDATION_ERROR");

    Map<String, Object> person = company("SAHIS", "Şahıs Firması", VALID_TCKN);
    person.put("taxIdType", "TCKN");
    person.put("active", false);
    JsonNode inactive = body(save(t, post(COMPANIES), person));
    assertThat(inactive.get("active").asBoolean()).isFalse();
    assertThat(inactive.get("taxIdType").asText()).isEqualTo("TCKN");
    assertThat(intercompanyCodes(t)).as("pasif şirkete grup carisi açılmaz").hasSize(2);

    // Varsayılan devri POST yolundan: eski bayrak kalkar, genel CONFLICT yok.
    Map<String, Object> newDefault = company("SIR4", "Delta", null);
    newDefault.put("defaultCompany", true);
    JsonNode d = body(save(t, post(COMPANIES), newDefault));
    assertThat(d.get("defaultCompany").asBoolean()).isTrue();
    assertThat(company(t, a).get("defaultCompany").asBoolean()).isFalse();
    assertThat(defaultCount(t)).isEqualTo(1);

    Map<String, Object> inactiveDefault = company("SIR5", "Eta", null);
    inactiveDefault.put("defaultCompany", true);
    inactiveDefault.put("active", false);
    expectError(save(t, post(COMPANIES), inactiveDefault), 422, "COMPANY_INACTIVE");
    Map<String, Object> makeInactiveDefault = company("SAHIS", "Şahıs Firması", VALID_TCKN);
    makeInactiveDefault.put("taxIdType", "TCKN");
    makeInactiveDefault.put("defaultCompany", true);
    expectError(
        save(t, put(COMPANIES + "/" + inactive.get("id").asText()), makeInactiveDefault),
        422,
        "COMPANY_INACTIVE");
    assertThat(company(t, d.get("id").asText()).get("defaultCompany").asBoolean()).isTrue();

    // Varsayılan devri PUT yolundan.
    Map<String, Object> backToA = company("SIRKET1", "Alfa", null);
    backToA.put("defaultCompany", true);
    JsonNode updatedA = body(save(t, put(COMPANIES + "/" + a), backToA));
    assertThat(updatedA.get("defaultCompany").asBoolean()).isTrue();
    assertThat(updatedA.get("updateCount").asInt()).isPositive();
    assertThat(company(t, d.get("id").asText()).get("defaultCompany").asBoolean()).isFalse();
    assertThat(defaultCount(t)).isEqualTo(1);

    Map<String, Object> dropDefault = company("SIRKET1", "Alfa", null);
    dropDefault.put("defaultCompany", false);
    expectError(save(t, put(COMPANIES + "/" + a), dropDefault), 409, "DEFAULT_COMPANY_REQUIRED");
    Map<String, Object> deactivateDefault = company("SIRKET1", "Alfa", null);
    deactivateDefault.put("active", false);
    expectError(
        save(t, put(COMPANIES + "/" + a), deactivateDefault), 409, "DEFAULT_COMPANY_REQUIRED");
    expectError(
        send(t, post(COMPANIES + "/" + a + "/deactivate")), 409, "DEFAULT_COMPANY_REQUIRED");

    // Aktif iş yeri olan şirket pasifleştirilemez; iş yeri pasifleşince olur.
    String bId = b.get("id").asText();
    String branch =
        body(save(
                t,
                post("/api/v1/organization/branches"),
                Map.of("code", "B1", "name", "Beta Merkez", "companyId", bId)))
            .get("id")
            .asText();
    assertThat(company(t, bId).get("branchCount").asInt()).isEqualTo(1);
    expectError(
        send(t, post(COMPANIES + "/" + bId + "/deactivate")), 409, "COMPANY_HAS_ACTIVE_BRANCHES");
    Map<String, Object> putInactive = company("SIR2", "Beta AŞ", VALID_VKN);
    putInactive.put("active", false);
    expectError(
        save(t, put(COMPANIES + "/" + bId), putInactive), 409, "COMPANY_HAS_ACTIVE_BRANCHES");
    send(t, post("/api/v1/organization/branches/" + branch + "/deactivate"))
        .andExpect(status().isOk());
    send(t, post(COMPANIES + "/" + bId + "/deactivate"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.active").value(false));
    send(t, post(COMPANIES + "/" + bId + "/deactivate")).andExpect(status().isOk());
    send(t, post(COMPANIES + "/" + bId + "/activate"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.active").value(true));
    send(t, post(COMPANIES + "/" + bId + "/activate")).andExpect(status().isOk());
    // PUT ile pasifleştirme ve yeniden aktifleştirme.
    Map<String, Object> reactivate = company("SAHIS", "Şahıs Firması", VALID_TCKN);
    reactivate.put("taxIdType", "TCKN");
    reactivate.put("active", true);
    send(
            t,
            put(COMPANIES + "/" + inactive.get("id").asText())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(reactivate)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.active").value(true));
    assertThat(intercompanyCodes(t)).contains("GS-SAHIS");

    // Varsayılan banka hesabı yalnız şirketin kendi fonu olabilir.
    String aBranch =
        body(save(t, post("/api/v1/organization/branches"), Map.of("code", "A1", "name", "Alfa")))
            .get("id")
            .asText();
    String aFund = fund(t, "KASA-A", aBranch);
    Map<String, Object> withFund = company("SIR2", "Beta AŞ", VALID_VKN);
    withFund.put("defaultFundAccountId", aFund);
    expectError(save(t, put(COMPANIES + "/" + bId), withFund), 422, "COMPANY_MISMATCH");
    withFund.put("defaultFundAccountId", UUID.randomUUID().toString());
    expectError(save(t, put(COMPANIES + "/" + bId), withFund), 400, "FUND_NOT_FOUND");
    Map<String, Object> ownFund = company("SIRKET1", "Alfa", null);
    ownFund.put("defaultFundAccountId", aFund);
    send(
            t,
            put(COMPANIES + "/" + a)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(ownFund)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.defaultFundAccountId").value(aFund));
    Map<String, Object> createWithFund = company("SIR6", "Teta", null);
    createWithFund.put("defaultFundAccountId", aFund);
    expectError(save(t, post(COMPANIES), createWithFund), 422, "COMPANY_MISMATCH");

    // Şirketin varsayılan hesabı silinemez; kart üzerinden kaldırıldıktan sonra silinir.
    expectError(send(t, delete("/api/v1/finance/funds/" + aFund)), 409, "FUND_IS_COMPANY_DEFAULT");
    ownFund.put("defaultFundAccountId", null);
    assertThat(
            body(save(t, put(COMPANIES + "/" + a), ownFund).andExpect(status().isOk()))
                .get("defaultFundAccountId")
                .isNull())
        .isTrue();
    send(t, delete("/api/v1/finance/funds/" + aFund)).andExpect(status().isNoContent());
    // Eski veri: önceden silinmiş varsayılan hesap şirket kartının kaydını engellemez.
    String staleFund = fund(t, "KASA-ESKI", aBranch);
    ownFund.put("defaultFundAccountId", staleFund);
    save(t, put(COMPANIES + "/" + a), ownFund).andExpect(status().isOk());
    jdbc.update(
        "update \"%s\".fund_account set deleted = true where id = ?"
            .formatted(tenants.findByCode(t).orElseThrow().getSchemaName()),
        UUID.fromString(staleFund));
    save(t, put(COMPANIES + "/" + a), ownFund)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.defaultFundAccountId").value(staleFund));

    // Ad değişince grup carisi eşitlenir.
    Map<String, Object> renamed = company("SIR2", "Beta Yeni", VALID_VKN);
    renamed.put("shortName", "Beta Yeni");
    save(t, put(COMPANIES + "/" + bId), renamed).andExpect(status().isOk());
    JsonNode gs = account(t, "GS-SIR2");
    assertThat(gs.get("name").asText()).isEqualTo("Beta Yeni");
    assertThat(gs.get("type").asText()).isEqualTo("INTERCOMPANY");

    send(t, get(COMPANIES + "/" + UUID.randomUUID()))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("COMPANY_NOT_FOUND"));
    send(t, get(COMPANIES).param("q", "beta").param("active", "true"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.totalElements").value(1));
    JsonNode ordered = body(send(t, get(COMPANIES).param("size", "20")));
    assertThat(ordered.get("content").get(0).get("id").asText()).as("varsayılan önce").isEqualTo(a);
    assertThat(auditCount(t, "COMPANY_CREATED")).isGreaterThanOrEqualTo(3);
  }

  @Test
  void grupCarisiElleAcilamazDegistirilemezSilinemez() throws Exception {
    String t = newTenant("cmpi");
    save(t, post(COMPANIES), company("SIR2", "Beta", null)).andExpect(status().isCreated());
    String gsId = account(t, "GS-SIR2").get("id").asText();

    expectError(
        save(
            t,
            post("/api/v1/finance/accounts"),
            Map.of("code", "X1", "name", "Elle", "type", "INTERCOMPANY")),
        422,
        "ACCOUNT_TYPE_RESERVED");
    expectError(
        save(
            t,
            post("/api/v1/crm/customers"),
            Map.of("code", "X2", "name", "Elle", "type", "INTERCOMPANY")),
        422,
        "ACCOUNT_TYPE_RESERVED");
    expectError(
        save(
            t,
            put("/api/v1/crm/customers/" + gsId),
            Map.of("code", "GS-SIR2", "name", "Değişti", "type", "CUSTOMER")),
        409,
        "INTERCOMPANY_ACCOUNT_LOCKED");
    expectError(
        save(
            t,
            put("/api/v1/finance/accounts/" + gsId),
            Map.of("code", "GS-SIR2", "name", "Değişti", "type", "CUSTOMER")),
        409,
        "INTERCOMPANY_ACCOUNT_LOCKED");
    expectError(
        send(t, delete("/api/v1/finance/accounts/" + gsId)), 409, "INTERCOMPANY_ACCOUNT_LOCKED");
    // Var olan müşteri kartı grup carisine çevrilemez.
    String customer =
        body(save(
                t,
                post("/api/v1/crm/customers"),
                Map.of("code", "M1", "name", "Müşteri", "type", "CUSTOMER")))
            .get("id")
            .asText();
    expectError(
        save(
            t,
            put("/api/v1/crm/customers/" + customer),
            Map.of("code", "M1", "name", "Müşteri", "type", "INTERCOMPANY")),
        422,
        "ACCOUNT_TYPE_RESERVED");
    expectError(
        save(
            t,
            put("/api/v1/finance/accounts/" + customer),
            Map.of("code", "M1", "name", "Müşteri", "type", "INTERCOMPANY")),
        422,
        "ACCOUNT_TYPE_RESERVED");
    assertThat(account(t, "GS-SIR2").get("name").asText()).isEqualTo("Beta");

    // Açılış bakiyesi dosyasında INTERCOMPANY türü tanınmaz: satır hatası, cari açılmaz.
    String branch =
        body(save(t, post("/api/v1/organization/branches"), Map.of("code", "S1", "name", "M")))
            .get("id")
            .asText();
    String csv = "Kod;Ad;Tür;Para birimi;Bakiye;Kur\nIC1;Grup;INTERCOMPANY;TRY;100;\n";
    JsonNode preview =
        body(
            mvc.perform(
                    multipart("/api/v1/finance/opening-balances/preview")
                        .file(
                            new MockMultipartFile(
                                "file",
                                "acilis.csv",
                                "text/csv",
                                csv.getBytes(StandardCharsets.UTF_8)))
                        .param("branchId", branch)
                        .param("date", tenantToday().minusDays(1).toString())
                        .with(asOwner(t)))
                .andExpect(status().isOk()));
    assertThat(preview.get("valid").asBoolean()).isFalse();
    assertThat(preview.get("rows").get(0).get("status").asText()).isEqualTo("ERROR");
  }

  @Test
  void eBelgeCephesiVarsayilanSirketiYazarVeIzinKorunur() throws Exception {
    String t = newTenant("cmpe");
    save(t, post(COMPANIES), company("SIR2", "Beta", null)).andExpect(status().isCreated());
    String a = defaultCompany(t).get("id").asText();
    int before = defaultCompany(t).get("updateCount").asInt();
    String finance = inviteAndLogin(t, "finans@" + t + ".test", "FINANCE");

    mvc.perform(
            put("/api/v1/integration/e-document-settings")
                .with(tenant(t))
                .with(bearer(finance))
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"taxNumber\":\"123 456 7890\",\"taxOffice\":\"Kadıköy\",\"address\":\" \"}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.taxNumber").value(VALID_VKN))
        .andExpect(jsonPath("$.taxOffice").value("Kadıköy"));
    JsonNode updated = company(t, a);
    assertThat(updated.get("taxNumber").asText()).isEqualTo(VALID_VKN);
    assertThat(updated.get("taxIdType").asText()).isEqualTo("VKN");
    assertThat(updated.get("address").isNull()).isTrue();
    assertThat(updated.get("updateCount").asInt()).isGreaterThan(before);
    assertThat(account(t, "GS-SIRKET1").get("taxNumber").asText()).isEqualTo(VALID_VKN);
    assertThat(auditDetails(t, "COMPANY_UPDATED")).contains("e-document-settings");
    send(t, get("/api/v1/integration/e-document-settings"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.taxNumber").value(VALID_VKN));

    mvc.perform(
            put("/api/v1/integration/e-document-settings")
                .with(tenant(t))
                .with(bearer(finance))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"taxNumber\":\"1234567891\"}"))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("TAX_NUMBER_INVALID"));
    mvc.perform(
            put("/api/v1/integration/e-document-settings")
                .with(tenant(t))
                .with(bearer(finance))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"taxNumber\":\"" + VALID_TCKN + "\"}"))
        .andExpect(status().isOk());
    assertThat(company(t, a).get("taxIdType").asText()).isEqualTo("TCKN");

    // Başka şirketin VKN'si alınamaz.
    String b = companyByCode(t, "SIR2").get("id").asText();
    save(t, put(COMPANIES + "/" + b), company("SIR2", "Beta", VALID_VKN))
        .andExpect(status().isOk());
    mvc.perform(
            put("/api/v1/integration/e-document-settings")
                .with(tenant(t))
                .with(bearer(finance))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"taxNumber\":\"" + VALID_VKN + "\"}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("COMPANY_TAX_TAKEN"));

    // FINANCE'te COMPANY_MANAGE yok; FINANCE_SUPER'da var.
    mvc.perform(
            post(COMPANIES)
                .with(tenant(t))
                .with(bearer(finance))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(company("SIR9", "X", null))))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("ACCESS_DENIED"));
    mvc.perform(get(COMPANIES).with(tenant(t)).with(bearer(finance))).andExpect(status().isOk());
    assertThat(rolePermissions(t, "FINANCE_SUPER")).contains("COMPANY_MANAGE");
    assertThat(rolePermissions(t, "FINANCE")).doesNotContain("COMPANY_MANAGE");
  }

  @Test
  void logoYalnizKendiUcundanYonetilir() throws Exception {
    String t = newTenant("cmpl");
    String a = defaultCompany(t).get("id").asText();

    String logo =
        body(uploadLogo(t, a, "logo.png", PNG).andExpect(status().isOk()))
            .get("logoFileId")
            .asText();
    send(t, get("/api/v1/files/" + logo + "/content")).andExpect(status().isOk());
    assertThat(auditCount(t, "COMPANY_LOGO_CHANGED")).isEqualTo(1);

    expectError(
        uploadLogo(t, a, "logo.svg", "<svg/>".getBytes(StandardCharsets.UTF_8)),
        422,
        "LOGO_INVALID");
    expectError(uploadLogo(t, a, "logo.png", JPEG.clone()), 200, null);
    byte[] big = new byte[2 * 1024 * 1024];
    System.arraycopy(PNG, 0, big, 0, PNG.length);
    expectError(uploadLogo(t, a, "buyuk.png", big), 422, "LOGO_INVALID");
    expectError(
        uploadLogo(t, a, "logo.png", "duz metin".getBytes(StandardCharsets.UTF_8)),
        422,
        "LOGO_INVALID");
    expectError(uploadLogo(t, a, "logo.png", new byte[0]), 400, "FILE_EMPTY");

    String current = company(t, a).get("logoFileId").asText();
    assertThat(current).isNotEqualTo(logo);
    send(t, get("/api/v1/files/" + logo + "/content")).andExpect(status().isNotFound());

    // Genel dosya uçları logoyu yönetemez.
    expectError(send(t, delete("/api/v1/files/" + current)), 409, "FILE_MANAGED_BY_OWNER");
    expectError(
        mvc.perform(
            multipart("/api/v1/files")
                .file(new MockMultipartFile("file", "logo.png", "image/png", PNG))
                .param("ownerType", "COMPANY_LOGO")
                .param("ownerId", a)
                .with(asOwner(t))),
        409,
        "FILE_MANAGED_BY_OWNER");

    send(t, delete(COMPANIES + "/" + a + "/logo")).andExpect(status().isNoContent());
    assertThat(company(t, a).get("logoFileId").isNull()).isTrue();
    send(t, get("/api/v1/files/" + current + "/content")).andExpect(status().isNotFound());
    send(t, delete(COMPANIES + "/" + a + "/logo")).andExpect(status().isNoContent());
    expectError(
        uploadLogo(t, UUID.randomUUID().toString(), "l.png", PNG), 404, "COMPANY_NOT_FOUND");
  }

  @Test
  void eBelgeAyariVeBelgeSerileri() throws Exception {
    String t = newTenant("cmps");
    String a = defaultCompany(t).get("id").asText();
    String b = body(save(t, post(COMPANIES), company("SIR2", "Beta", null))).get("id").asText();
    String settings = COMPANIES + "/" + a + "/edocument-settings";

    JsonNode initial = body(send(t, get(settings)).andExpect(status().isOk()));
    assertThat(initial.get("provider").asText()).isEqualTo("TEST");
    assertThat(initial.get("passwordSet").asBoolean()).isFalse();
    assertThat(initial.get("defaultProfile").asText()).isEqualTo("TICARIFATURA");
    assertThat(initial.get("senderTitle").asText()).isEqualTo(t + " Lojistik");

    Map<String, Object> body = edocument("gizli-sifre");
    JsonNode saved = body(save(t, put(settings), body).andExpect(status().isOk()));
    assertThat(saved.get("passwordSet").asBoolean()).isTrue();
    assertThat(saved.has("password")).isFalse();
    assertThat(saved.get("invoiceSeries").asText()).isEqualTo("ABC");
    assertThat(saved.get("enabled").asBoolean()).isTrue();
    String encrypted = passwordEnc(t, a);
    assertThat(encrypted).isNotBlank().doesNotContain("gizli-sifre");
    save(t, put(settings), edocument("")).andExpect(status().isOk());
    assertThat(passwordEnc(t, a)).as("boş şifre eskisini korur").isEqualTo(encrypted);
    save(t, put(settings), edocument(null))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.passwordSet").value(true));
    assertThat(company(t, a).get("edocumentEnabled").asBoolean()).isTrue();
    Map<String, Object> badUrl = edocument(null);
    badUrl.put("serviceUrl", "ftp://x");
    expectError(save(t, put(settings), badUrl), 400, "VALIDATION_ERROR");
    expectError(
        send(t, get(COMPANIES + "/" + UUID.randomUUID() + "/edocument-settings")),
        404,
        "COMPANY_NOT_FOUND");
    assertThat(auditCount(t, "COMPANY_EDOCUMENT_SETTINGS_UPDATED")).isEqualTo(3);

    int year = tenantToday().getYear();
    JsonNode series = body(send(t, get(COMPANIES + "/" + a + "/document-series")));
    assertThat(series).hasSize(2);
    assertThat(series.get(0).get("docType").asText()).isEqualTo("FREIGHT_INVOICE");
    assertThat(series.get(0).get("sample").asText()).isEqualTo("NF-%d-000001".formatted(year));
    assertThat(series.get(1).get("sample").asText()).isEqualTo("DF-%d-000001".formatted(year));
    JsonNode bSeries = body(send(t, get(COMPANIES + "/" + b + "/document-series")));
    assertThat(bSeries.get(0).get("prefix").asText()).isEqualTo("SIR2-NF");
    assertThat(bSeries.get(1).get("prefix").asText()).isEqualTo("SIR2-DF");

    String seriesId = series.get(0).get("id").asText();
    String seriesPath = COMPANIES + "/" + a + "/document-series/" + seriesId;
    send(
            t,
            put(seriesPath)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"prefix\":\"NFX\",\"nextValue\":50}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.sample").value("NFX-%d-000050".formatted(year)));
    expectError(
        save(t, put(seriesPath), Map.of("prefix", "NFX", "nextValue", 10)),
        422,
        "DOCUMENT_SERIES_BACKWARDS");
    expectError(
        save(t, put(seriesPath), Map.of("prefix", "nf x", "nextValue", 60)),
        400,
        "VALIDATION_ERROR");
    expectError(
        save(
            t,
            put(COMPANIES + "/" + b + "/document-series/" + seriesId),
            Map.of("prefix", "NFX", "nextValue", 60)),
        404,
        "DOCUMENT_SERIES_NOT_FOUND");
    assertThat(auditCount(t, "DOCUMENT_SERIES_UPDATED")).isEqualTo(1);

    String finance = inviteAndLogin(t, "finans@" + t + ".test", "FINANCE");
    mvc.perform(get(COMPANIES + "/" + a + "/document-series").with(tenant(t)).with(bearer(finance)))
        .andExpect(status().isOk());
    mvc.perform(
            put(seriesPath)
                .with(tenant(t))
                .with(bearer(finance))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"prefix\":\"NFX\",\"nextValue\":70}"))
        .andExpect(status().isForbidden());
    mvc.perform(get(settings).with(tenant(t)).with(bearer(finance)))
        .andExpect(status().isForbidden());
  }

  @Test
  void planSiniriVeEsZamanliOlusturma() throws Exception {
    String t = newTenant("cmpp");
    assignPlan(t, plan(2));

    List<MockHttpServletResponse> results =
        parallel(
            2,
            i ->
                save(t, post(COMPANIES), company("YARIS" + i, "Yarış " + i, null))
                    .andReturn()
                    .getResponse());
    assertThat(results)
        .extracting(MockHttpServletResponse::getStatus)
        .containsExactlyInAnyOrder(201, 409);
    MockHttpServletResponse loser =
        results.stream().filter(r -> r.getStatus() == 409).findFirst().orElseThrow();
    assertThat(json.readTree(loser.getContentAsString(StandardCharsets.UTF_8)).get("code").asText())
        .isEqualTo("PLAN_LIMIT_EXCEEDED");
    assertThat(intercompanyCodes(t)).hasSize(2).contains("GS-SIRKET1");
    assertThat(body(send(t, get(COMPANIES))).get("totalElements").asInt()).isEqualTo(2);
    expectError(
        save(t, post(COMPANIES), company("SIR3", "Üçüncü", null)), 409, "PLAN_LIMIT_EXCEEDED");

    // Pasif oluşturma ve pasif kayıt sınırda sayılmaz; aktifleştirmede denetlenir.
    Map<String, Object> passive = company("PASIF", "Pasif", null);
    passive.put("active", false);
    String passiveId = body(save(t, post(COMPANIES), passive)).get("id").asText();
    expectError(
        send(t, post(COMPANIES + "/" + passiveId + "/activate")), 409, "PLAN_LIMIT_EXCEEDED");
    Map<String, Object> activateByPut = company("PASIF", "Pasif", null);
    activateByPut.put("active", true);
    expectError(
        save(t, put(COMPANIES + "/" + passiveId), activateByPut), 409, "PLAN_LIMIT_EXCEEDED");
  }

  // --- yardımcılar

  private String newTenant(String prefix) throws Exception {
    String t = prefix + "-" + Long.toString(System.nanoTime(), 36);
    createTenant(t);
    return t;
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

  private static Map<String, Object> edocument(String password) {
    Map<String, Object> body = new HashMap<>();
    body.put("enabled", true);
    body.put("testMode", false);
    body.put("serviceUrl", "https://efatura.example.test/Services");
    body.put("username", "kullanici");
    body.put("password", password);
    body.put("defaultProfile", "TEMELFATURA");
    body.put("invoiceSeries", "ABC");
    body.put("despatchSeries", "IRS");
    body.put("despatchEnabled", true);
    body.put("inboxEnabled", false);
    return body;
  }

  private ResultActions send(String t, MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request.with(asOwner(t)));
  }

  private ResultActions save(String t, MockHttpServletRequestBuilder request, Object body)
      throws Exception {
    return send(
        t, request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
  }

  private static void expectError(ResultActions result, int status, String code) throws Exception {
    result.andExpect(status().is(status));
    if (code != null) {
      result.andExpect(jsonPath("$.code").value(code));
    }
  }

  private ResultActions uploadLogo(String t, String companyId, String name, byte[] content)
      throws Exception {
    return mvc.perform(
        multipart(COMPANIES + "/" + companyId + "/logo")
            .file(new MockMultipartFile("file", name, "application/octet-stream", content))
            .with(asOwner(t)));
  }

  private JsonNode company(String t, String id) throws Exception {
    return body(send(t, get(COMPANIES + "/" + id)).andExpect(status().isOk()));
  }

  private JsonNode defaultCompany(String t) throws Exception {
    for (JsonNode row : body(send(t, get(COMPANIES).param("size", "50"))).get("content")) {
      if (row.get("defaultCompany").asBoolean()) {
        return row;
      }
    }
    throw new AssertionError("varsayılan şirket yok");
  }

  private JsonNode companyByCode(String t, String code) throws Exception {
    for (JsonNode row : body(send(t, get(COMPANIES).param("size", "50"))).get("content")) {
      if (code.equals(row.get("code").asText())) {
        return row;
      }
    }
    throw new AssertionError(code);
  }

  private List<String> intercompanyCodes(String t) throws Exception {
    List<String> codes = new ArrayList<>();
    for (JsonNode row :
        body(send(t, get("/api/v1/finance/accounts").param("size", "200"))).get("content")) {
      if ("INTERCOMPANY".equals(row.get("type").asText())) {
        codes.add(row.get("code").asText());
      }
    }
    return codes;
  }

  private JsonNode account(String t, String code) throws Exception {
    for (JsonNode row :
        body(send(t, get("/api/v1/finance/accounts").param("size", "200"))).get("content")) {
      if (code.equals(row.get("code").asText())) {
        return row;
      }
    }
    throw new AssertionError(code);
  }

  private String fund(String t, String code, String branch) throws Exception {
    return body(save(
                t,
                post("/api/v1/finance/funds"),
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
                    false))
            .andExpect(status().isCreated()))
        .get("id")
        .asText();
  }

  private String schema(String t) {
    return tenants.findByCode(t).orElseThrow().getSchemaName();
  }

  private int defaultCount(String t) {
    return jdbc.queryForObject(
        "select count(*) from \"%s\".company where is_default and not deleted".formatted(schema(t)),
        Integer.class);
  }

  private String passwordEnc(String t, String companyId) {
    return jdbc.queryForObject(
        "select password_enc from \"%s\".company_edocument_settings where company_id = ?"
            .formatted(schema(t)),
        String.class,
        UUID.fromString(companyId));
  }

  private int auditCount(String t, String event) {
    return jdbc.queryForObject(
        "select count(*) from \"%s\".audit_log where event_type = ?".formatted(schema(t)),
        Integer.class,
        event);
  }

  private List<String> auditDetails(String t, String event) {
    return jdbc.queryForList(
        "select details from \"%s\".audit_log where event_type = ? and details is not null"
            .formatted(schema(t)),
        String.class,
        event);
  }

  private List<String> rolePermissions(String t, String roleCode) throws Exception {
    for (JsonNode role : body(send(t, get("/api/v1/identity/roles")))) {
      if (roleCode.equals(role.get("code").asText())) {
        List<String> permissions = new ArrayList<>();
        role.get("permissions").forEach(p -> permissions.add(p.asText()));
        return permissions;
      }
    }
    throw new AssertionError(roleCode);
  }

  private String inviteAndLogin(String t, String email, String roleCode) throws Exception {
    String roleId = null;
    for (JsonNode role : body(send(t, get("/api/v1/identity/roles")))) {
      if (roleCode.equals(role.get("code").asText())) {
        roleId = role.get("id").asText();
      }
    }
    save(
            t,
            post("/api/v1/identity/users"),
            Map.of("email", email, "fullName", "Test", "roleIds", List.of(roleId)))
        .andExpect(status().isCreated());
    return acceptInviteAndLogin(t, email);
  }

  private String plan(int maxCompanies) throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("code", "SRK" + Long.toString(System.nanoTime(), 36).toUpperCase(Locale.ROOT));
    body.put("name", "Şirket sınırı");
    body.put("monthlyPrice", "0");
    body.put("currency", "TRY");
    body.put("maxCompanies", maxCompanies);
    body.put("active", true);
    MvcResult result =
        mvc.perform(
                post("/api/v1/admin/plans")
                    .with(bearer(saasToken()))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(body)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.maxCompanies").value(maxCompanies))
            .andReturn();
    return json.readTree(result.getResponse().getContentAsString()).get("id").asText();
  }

  private void assignPlan(String t, String planId) throws Exception {
    UUID tenantId = tenants.findByCode(t).orElseThrow().getId();
    mvc.perform(
            put("/api/v1/admin/tenants/" + tenantId + "/plan")
                .with(bearer(saasToken()))
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("planId", planId))))
        .andExpect(status().isNoContent());
  }

  private interface Job {
    MockHttpServletResponse run(int index) throws Exception;
  }

  private static List<MockHttpServletResponse> parallel(int count, Job job) throws Exception {
    ExecutorService pool = Executors.newFixedThreadPool(count);
    try {
      List<Future<MockHttpServletResponse>> futures = new ArrayList<>();
      for (int i = 0; i < count; i++) {
        int index = i;
        Callable<MockHttpServletResponse> task = () -> job.run(index);
        futures.add(pool.submit(task));
      }
      List<MockHttpServletResponse> results = new ArrayList<>();
      for (Future<MockHttpServletResponse> future : futures) {
        results.add(future.get(2, TimeUnit.MINUTES));
      }
      return results;
    } finally {
      pool.shutdownNow();
    }
  }
}
