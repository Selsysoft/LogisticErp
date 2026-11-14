package org.ece.blackrose.organization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.ece.blackrose.AbstractIntegrationTest;
import org.ece.blackrose.identity.domain.Permission;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/**
 * Kullanıcı iş yeri kapsamının finans dışı modüllerde uygulanması (§4.16 B5 satırları): filo, sefer
 * (yükleyiciler, liste, pano), depo, entegrasyon, sürücü masrafı onayı, raporlar (dışa aktarım
 * dahil), ana sayfa panosu ve CRM teklif/sözleşme.
 */
class BranchScopeModulesIT extends AbstractIntegrationTest {

  private static final String FLEET = "/api/v1/fleet";
  private static final String SHIPMENT = "/api/v1/shipment";
  private static final String REPORTS = "/api/v1/reports";
  private static final String INTEGRATION = "/api/v1/integration";
  private static final String CRM = "/api/v1/crm";
  private static final LocalDate TODAY = tenantToday();
  private static final String TOLL_HEADER =
      "plaka;tarih_saat;gecis_noktasi;tutar;para_birimi;referans\n";

  @Autowired TenantRepository tenants;
  @Autowired JdbcTemplate jdbc;

  /**
   * A varsayılan şirket (A1, A2), B "SIR2" (B1); A1 ve A2'de kasa; her modül izni olan ve A1'e
   * sınırlı bir yönetici ({@code token}).
   */
  private record World(
      String t,
      String schema,
      String companyA,
      String companyB,
      String a1,
      String a2,
      String b1,
      String cashA1,
      String cashA2,
      String customer,
      String supplier,
      String token) {}

  @Test
  void filoSeferDepoVeEntegrasyonKapsamaUyar() throws Exception {
    World w = world("bsm");

    // Filo: şubesiz kayıt herkese görünür, başka iş yerininki görünmez.
    String vA1 = vehicle(w, "34A1", w.a1());
    String vA2 = vehicle(w, "34A2", w.a2());
    String vNone = vehicle(w, "34NN", null);
    assertThat(ids(asManager(w, get(FLEET + "/vehicles")).get("content")))
        .containsExactlyInAnyOrder(vA1, vNone);
    expect(manager(w, get(FLEET + "/vehicles/" + vA2)), 403, "BRANCH_OUT_OF_SCOPE");
    manager(w, get(FLEET + "/vehicles/" + vNone)).andExpect(status().isOk());
    expect(
        managerSave(w, put(FLEET + "/vehicles/" + vA2), vehicleBody("34A2", w.a2())),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        managerSave(w, put(FLEET + "/vehicles/" + vA1), vehicleBody("34A1", w.a2())),
        403,
        "BRANCH_OUT_OF_SCOPE");
    managerSave(w, put(FLEET + "/vehicles/" + vA1), vehicleBody("34A1", w.a1()))
        .andExpect(status().isOk());
    expect(
        managerSave(w, post(FLEET + "/vehicles"), vehicleBody("34XX", w.a2())),
        403,
        "BRANCH_OUT_OF_SCOPE");

    String dA1 = driver(w, "S1", w.a1());
    String dA2 = driver(w, "S2", w.a2());
    String dNone = driver(w, "S3", null);
    assertThat(ids(asManager(w, get(FLEET + "/drivers")).get("content")))
        .containsExactlyInAnyOrder(dA1, dNone);
    expect(manager(w, get(FLEET + "/drivers/" + dA2)), 403, "BRANCH_OUT_OF_SCOPE");
    expect(
        managerSave(
            w,
            put(FLEET + "/drivers/" + dA2),
            Map.of("fullName", "X", "status", "ACTIVE", "branchId", w.a2())),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        managerSave(
            w,
            post(FLEET + "/drivers"),
            Map.of("code", "S9", "fullName", "X", "status", "ACTIVE", "branchId", w.a2())),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        managerSave(w, post(FLEET + "/drivers/" + dA2 + "/advances"), advance(w.a1(), w.cashA1())),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        managerSave(w, post(FLEET + "/drivers/" + dA1 + "/advances"), advance(w.a2(), w.cashA2())),
        403,
        "BRANCH_OUT_OF_SCOPE");

    // Araç gideri: liste süzülür; kapsam dışı iş yeri ve kapsam dışı araç 403, iptal 403.
    owner(w, post(FLEET + "/vehicles/" + vA1 + "/expenses"), expense(w, w.a1()))
        .andExpect(status().isCreated());
    String expenseA2 =
        id(owner(w, post(FLEET + "/vehicles/" + vA2 + "/expenses"), expense(w, w.a2())));
    JsonNode expenses = asManager(w, get(FLEET + "/expenses")).get("content");
    assertThat(expenses.findValuesAsText("branchId")).containsExactly(w.a1());
    expect(
        managerSave(w, post(FLEET + "/vehicles/" + vA1 + "/expenses"), expense(w, w.a2())),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        managerSave(w, post(FLEET + "/vehicles/" + vA2 + "/expenses"), expense(w, w.a1())),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        managerSave(
            w,
            post(FLEET + "/expenses/" + expenseA2 + "/reverse"),
            Map.of("date", TODAY.toString())),
        403,
        "BRANCH_OUT_OF_SCOPE");
    assertThat(asManager(w, get(FLEET + "/options")).get("funds").findValuesAsText("id"))
        .containsExactly(w.cashA1());

    // Sefer: liste ve pano süzülür; kapsam dışı seferin alt uçları yükleyicide 403.
    UUID pA1 = shipment(w, w.a1(), "SV-PA1", "PLANNED");
    UUID pA2 = shipment(w, w.a2(), "SV-PA2", "PLANNED");
    UUID legA1 = leg(w, pA1, dA1);
    UUID legA2 = leg(w, pA2, dA2);
    assertThat(ids(asManager(w, get(SHIPMENT + "/shipments")).get("content")))
        .containsExactly(pA1.toString());
    JsonNode board =
        asManager(
            w,
            get(SHIPMENT + "/board")
                .param("from", TODAY.minusDays(1).toString())
                .param("to", TODAY.plusDays(1).toString()));
    assertThat(board.findValuesAsText("shipmentId")).containsExactly(pA1.toString());
    assertThat(
            body(owner(
                    w,
                    get(SHIPMENT + "/board")
                        .param("from", TODAY.minusDays(1).toString())
                        .param("to", TODAY.plusDays(1).toString())))
                .findValuesAsText("shipmentId"))
        .containsExactlyInAnyOrder(pA1.toString(), pA2.toString());
    manager(w, get(SHIPMENT + "/shipments/" + pA1)).andExpect(status().isOk());
    String a2 = SHIPMENT + "/shipments/" + pA2;
    for (String path :
        List.of(
            a2,
            a2 + "/timeline",
            a2 + "/invoice",
            a2 + "/pod",
            a2 + "/documents",
            a2 + "/costs",
            a2 + "/profit",
            a2 + "/linkable-expenses",
            SHIPMENT + "/legs/" + legA2 + "/candidates")) {
      expect(manager(w, get(path)), 403, "BRANCH_OUT_OF_SCOPE");
    }
    expect(
        managerSave(w, post(a2 + "/status"), Map.of("status", "CANCELLED")),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        managerSave(w, post(a2 + "/events"), Map.of("type", "NOTE", "message", "x")),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(manager(w, post(a2 + "/documents/CMR")), 403, "BRANCH_OUT_OF_SCOPE");
    expect(
        manager(w, MockMvcRequestBuilders.delete(SHIPMENT + "/legs/" + legA2)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    manager(w, get(SHIPMENT + "/legs/" + legA1 + "/candidates")).andExpect(status().isOk());
    Map<String, Object> newShipment = new HashMap<>();
    newShipment.put("accountId", w.customer());
    newShipment.put("branchId", w.a2());
    newShipment.put("origin", "İstanbul");
    newShipment.put("destination", "Ankara");
    newShipment.put("plannedPickup", OffsetDateTime.now(ZoneOffset.UTC).toString());
    newShipment.put("plannedDelivery", OffsetDateTime.now(ZoneOffset.UTC).plusDays(1).toString());
    newShipment.put("vehicleType", "TRUCK");
    newShipment.put("manualNet", "100");
    newShipment.put("currency", "TRY");
    expect(managerSave(w, post(SHIPMENT + "/shipments"), newShipment), 403, "BRANCH_OUT_OF_SCOPE");

    // Sürücü masrafı onayı: liste yalnız A1 seferlerinin masrafları; A2 masrafına onay/ret 403.
    UUID expA1 = driverExpense(w, dA1, pA1);
    UUID expA2 = driverExpense(w, dA2, pA2);
    assertThat(ids(asManager(w, get(SHIPMENT + "/driver-expenses")).get("content")))
        .containsExactly(expA1.toString());
    assertThat(ids(body(owner(w, get(SHIPMENT + "/driver-expenses"))).get("content")))
        .containsExactlyInAnyOrder(expA1.toString(), expA2.toString());
    expect(
        manager(w, post(SHIPMENT + "/driver-expenses/" + expA2 + "/approve")),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        managerSave(
            w, post(SHIPMENT + "/driver-expenses/" + expA2 + "/reject"), Map.of("note", "Hayır")),
        403,
        "BRANCH_OUT_OF_SCOPE");
    managerSave(
            w, post(SHIPMENT + "/driver-expenses/" + expA1 + "/reject"), Map.of("note", "Fiş yok"))
        .andExpect(status().isOk());

    // Sürücü uygulaması (DRIVER rolü, ALL) etkilenmez: A2 seferini görür.
    String driverEmail = "surucu@" + w.t() + ".test";
    String driverToken = inviteDriver(w, driverEmail);
    owner(w, put(FLEET + "/drivers/" + dA2 + "/user"), Map.of("email", driverEmail))
        .andExpect(status().isOk());
    JsonNode trips =
        body(send(w.t(), driverToken, get("/api/v1/driver/trips")).andExpect(status().isOk()));
    assertThat(trips.findValuesAsText("id")).contains(pA2.toString());

    // Sürücünün girdiği masrafın onay e-postası yalnız seferin iş yerini gören onaycıya gider.
    String driverA1Email = "surucu1@" + w.t() + ".test";
    String driverA1Token = inviteDriver(w, driverA1Email);
    owner(w, put(FLEET + "/drivers/" + dA1 + "/user"), Map.of("email", driverA1Email))
        .andExpect(status().isOk());
    driverExpenseViaApp(w, driverToken, pA2, "333").andExpect(status().isOk());
    driverExpenseViaApp(w, driverA1Token, pA1, "444").andExpect(status().isOk());
    String managerEmail = "mudur@" + w.t() + ".test";
    String ownerMail = ownerEmail(w.t());
    awaitSubject(managerEmail, "Onay bekleyen sürücü masrafı: Sürücü S1 — Yakıt — 444,00 TRY");
    awaitSubject(ownerMail, "Onay bekleyen sürücü masrafı: Sürücü S2 — Yakıt — 333,00 TRY");
    awaitSubject(ownerMail, "Onay bekleyen sürücü masrafı: Sürücü S1 — Yakıt — 444,00 TRY");
    Thread.sleep(300);
    assertThat(sent(managerEmail))
        .noneMatch(
            n ->
                n.subject().startsWith("Onay bekleyen sürücü masrafı:")
                    && n.subject().contains("333,00 TRY"));

    // Depo: liste süzülür; kapsam dışı iş yeriyle oluşturma/güncelleme 403.
    String whA1 = id(owner(w, post("/api/v1/warehouse/warehouses"), warehouse("D-A1", w.a1())));
    String whA2 = id(owner(w, post("/api/v1/warehouse/warehouses"), warehouse("D-A2", w.a2())));
    assertThat(ids(asManagerList(w, get("/api/v1/warehouse/warehouses")))).containsExactly(whA1);
    expect(
        managerSave(w, post("/api/v1/warehouse/warehouses"), warehouse("D-X", w.a2())),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        managerSave(w, put("/api/v1/warehouse/warehouses/" + whA2), warehouse("D-A2", w.a2())),
        403,
        "BRANCH_OUT_OF_SCOPE");
    String contractA2 =
        id(
            owner(
                w,
                post("/api/v1/warehouse/contracts"),
                Map.of(
                    "accountId",
                    w.customer(),
                    "warehouseId",
                    whA2,
                    "startDate",
                    TODAY.minusDays(10).toString(),
                    "endDate",
                    TODAY.plusDays(300).toString(),
                    "currency",
                    "TRY",
                    "storageBasis",
                    "PALLET_DAY",
                    "storageRate",
                    "1")));
    assertThat(asManagerList(w, get("/api/v1/warehouse/contracts"))).isEmpty();
    assertThat(body(owner(w, get("/api/v1/warehouse/contracts")))).hasSize(1);
    expect(
        manager(w, get("/api/v1/warehouse/contracts/" + contractA2 + "/invoices")),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        manager(w, get("/api/v1/warehouse/contracts/" + contractA2 + "/rates")),
        403,
        "BRANCH_OUT_OF_SCOPE");
    assertThat(
            asManager(w, get("/api/v1/warehouse/options")).get("shipments").findValuesAsText("id"))
        .doesNotContain(pA2.toString());

    // Entegrasyon: içe aktarma listesi ve kimlikle erişim, banka satırları.
    String importA1 = upload(w, null, w.a1()).get("batch").get("id").asText();
    String importA2 = upload(w, null, w.a2()).get("batch").get("id").asText();
    assertThat(asManagerList(w, get(INTEGRATION + "/imports")).findValuesAsText("id"))
        .containsExactly(importA1);
    expect(manager(w, get(INTEGRATION + "/imports/" + importA2)), 403, "BRANCH_OUT_OF_SCOPE");
    expect(
        manager(w, post(INTEGRATION + "/imports/" + importA2 + "/post")),
        403,
        "BRANCH_OUT_OF_SCOPE");
    send(
            w.t(),
            w.token(),
            MockMvcRequestBuilders.multipart(INTEGRATION + "/imports")
                .file(tollFile())
                .param("kind", "TOLL")
                .param("accountId", w.supplier())
                .param("branchId", w.a2()))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("BRANCH_OUT_OF_SCOPE"));
    expect(
        manager(w, get(INTEGRATION + "/bank/" + w.cashA2() + "/lines")),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        manager(w, get(INTEGRATION + "/bank/" + w.cashA2() + "/summary")),
        403,
        "BRANCH_OUT_OF_SCOPE");
    manager(w, get(INTEGRATION + "/bank/" + w.cashA1() + "/lines")).andExpect(status().isOk());
    assertThat(asManager(w, get(INTEGRATION + "/options")).get("shipments").findValuesAsText("id"))
        .containsExactly(pA1.toString());

    // e-Belge: liste ve kimlikle erişim şirket kapsamıyla, adaylar ve gönderim iş yeri kapsamıyla.
    String taxSql = "update \"%s\".company set tax_number = ? where id = ?";
    jdbc.update(taxSql.formatted(w.schema()), "1234567890", UUID.fromString(w.companyB()));
    jdbc.update(taxSql.formatted(w.schema()), "9876543217", UUID.fromString(w.companyA()));
    String invB = issueInvoice(w, shipment(w, w.b1(), "SV-EB1", "DELIVERED"));
    String invA2 = issueInvoice(w, shipment(w, w.a2(), "SV-EA2", "DELIVERED"));
    String invA1 = issueInvoice(w, shipment(w, w.a1(), "SV-EA1", "DELIVERED"));
    String docB = id(owner(w, post(INTEGRATION + "/e-documents"), eArchive(invB)));
    assertThat(ids(body(owner(w, get(INTEGRATION + "/e-documents"))))).contains(docB);
    assertThat(ids(asManagerList(w, get(INTEGRATION + "/e-documents")))).doesNotContain(docB);
    String docPath = INTEGRATION + "/e-documents/" + docB;
    expect(manager(w, get(docPath + "/ubl")), 403, "COMPANY_OUT_OF_SCOPE");
    expect(manager(w, post(docPath + "/refresh")), 403, "COMPANY_OUT_OF_SCOPE");
    expect(manager(w, post(docPath + "/cancel")), 403, "COMPANY_OUT_OF_SCOPE");
    assertThat(ids(asManagerList(w, get(INTEGRATION + "/e-documents/candidates"))))
        .contains(invA1)
        .doesNotContain(invA2, invB);
    assertThat(ids(body(owner(w, get(INTEGRATION + "/e-documents/candidates")))))
        .contains(invA1, invA2);
    expect(
        managerSave(w, post(INTEGRATION + "/e-documents"), eArchive(invA2)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    String docA1 = id(managerSave(w, post(INTEGRATION + "/e-documents"), eArchive(invA1)));
    assertThat(ids(asManagerList(w, get(INTEGRATION + "/e-documents"))))
        .contains(docA1)
        .doesNotContain(docB);
  }

  @Test
  void varsayilanOlmayanSirketeSinirliKullaniciSirketsizBelgeAcar() throws Exception {
    World w = world("bsc");
    Map<String, Object> gama = new HashMap<>();
    gama.put("code", "SIR3");
    gama.put("title", "Gama Lojistik AS");
    gama.put("shortName", "Gama");
    gama.put("taxIdType", "VKN");
    String companyC = id(owner(w, post("/api/v1/organization/companies"), gama));
    String c1 = branch(w.t(), "C1", companyC);
    String role = null;
    for (JsonNode row : body(owner(w, get("/api/v1/identity/roles")))) {
      if ("SUBE_MUDURU".equals(row.get("code").asText())) {
        role = row.get("id").asText();
      }
    }
    String bToken = limitedUser(w, "bmudur", role, List.of(w.b1()));
    String bcToken = limitedUser(w, "bcmudur", role, List.of(w.b1(), c1));

    // Yalnız B'yi gören kullanıcı: şirket verilmezse varsayılan (A) değil B seçilir.
    JsonNode quote =
        body(
            sendJson(w.t(), bToken, post(CRM + "/quotes"), quote(w, null))
                .andExpect(status().isCreated()));
    assertThat(quote.get("companyId").asText()).isEqualTo(w.companyB());
    JsonNode contract =
        body(
            sendJson(w.t(), bToken, post(CRM + "/contracts"), contract(w, null))
                .andExpect(status().isCreated()));
    assertThat(contract.get("companyId").asText()).isEqualTo(w.companyB());
    JsonNode group =
        body(
            sendJson(
                    w.t(),
                    bToken,
                    post("/api/v1/organization/branch-groups"),
                    Map.of("name", "B Grubu"))
                .andExpect(status().isCreated()));
    assertThat(group.get("companyId").asText()).isEqualTo(w.companyB());
    JsonNode branch =
        body(
            sendJson(
                    w.t(),
                    bToken,
                    post("/api/v1/organization/branches"),
                    Map.of("code", "B2", "name", "B2 Merkez"))
                .andExpect(status().isCreated()));
    assertThat(branch.get("companyId").asText()).isEqualTo(w.companyB());

    // İki varsayılan olmayan şirketi gören kullanıcı şirket seçmelidir.
    expect(
        sendJson(w.t(), bcToken, post(CRM + "/quotes"), quote(w, null)), 400, "COMPANY_REQUIRED");
    expect(
        sendJson(w.t(), bcToken, post(CRM + "/contracts"), contract(w, null)),
        400,
        "COMPANY_REQUIRED");
    sendJson(w.t(), bcToken, post(CRM + "/quotes"), quote(w, companyC))
        .andExpect(status().isCreated());
    // Varsayılan şirketi gören LIMITED kullanıcı (A1) varsayılan şirkete düşer.
    JsonNode managerQuote =
        body(managerSave(w, post(CRM + "/quotes"), quote(w, null)).andExpect(status().isCreated()));
    assertThat(managerQuote.get("companyId").asText()).isEqualTo(w.companyA());
  }

  @Test
  void raporlarPanoVeCrmKapsamaUyar() throws Exception {
    World w = world("bsr");
    String dA1 = driver(w, "S1", w.a1());
    String dA2 = driver(w, "S2", w.a2());
    UUID sA1 = shipment(w, w.a1(), "SV-RA1", "DELIVERED");
    UUID sA2 = shipment(w, w.a2(), "SV-RA2", "DELIVERED");
    leg(w, sA1, dA1);
    leg(w, sA2, dA2);
    for (UUID shipment : List.of(sA1, sA2)) {
      owner(
              w,
              post(SHIPMENT + "/shipments/" + shipment + "/invoice"),
              Map.of("invoiceDate", TODAY.toString(), "dueDate", TODAY.plusDays(30).toString()))
          .andExpect(status().isCreated());
    }
    String from = TODAY.minusDays(5).toString();
    String to = TODAY.toString();

    // Kiracı geneli raporlar LIMITED kullanıcıya kapalı.
    expect(manager(w, get(REPORTS + "/position")), 403, "BRANCH_SCOPE_ALL_REQUIRED");
    expect(manager(w, get(REPORTS + "/forecast")), 403, "BRANCH_SCOPE_ALL_REQUIRED");
    expect(
        manager(w, get(REPORTS + "/settlement-performance").param("from", from).param("to", to)),
        403,
        "BRANCH_SCOPE_ALL_REQUIRED");
    owner(w, get(REPORTS + "/position")).andExpect(status().isOk());
    for (String report : List.of("POSITION", "FORECAST")) {
      expect(
          manager(w, get(REPORTS + "/export").param("report", report).param("format", "XLSX")),
          403,
          "BRANCH_SCOPE_ALL_REQUIRED");
    }

    // Kârlılık, KPI ve sürücü raporu A1'e daralır; kapsam dışı iş yeri açıkça istenirse 403.
    JsonNode profit = profitability(w, w.token(), null);
    assertThat(profit.get("rows")).hasSize(1);
    assertThat(profit.get("rows").get(0).get("label").asText()).contains("SV-RA1");
    assertThat(profitability(w, null, null).get("rows")).hasSize(2);
    expect(
        manager(
            w,
            get(REPORTS + "/profitability")
                .param("group", "SHIPMENT")
                .param("from", from)
                .param("to", to)
                .param("branchId", w.a2())),
        403,
        "BRANCH_OUT_OF_SCOPE");
    assertThat(
            asManager(w, get(REPORTS + "/kpi").param("from", from).param("to", to))
                .get("shipments")
                .asLong())
        .isEqualTo(1);
    JsonNode drivers =
        asManagerList(w, get(REPORTS + "/drivers").param("from", from).param("to", to));
    assertThat(drivers.findValuesAsText("driverId")).containsExactly(dA1);

    // Dışa aktarım aynı kapsamı servis üzerinden alır.
    String profitText = xlsxText(export(w, w.token(), "PROFITABILITY", from, to));
    assertThat(profitText).contains("SV-RA1").doesNotContain("SV-RA2");
    assertThat(xlsxText(export(w, null, "PROFITABILITY", from, to)))
        .contains("SV-RA1")
        .contains("SV-RA2");
    String driverText = xlsxText(export(w, w.token(), "DRIVERS", from, to));
    assertThat(driverText).contains("Sürücü S1").doesNotContain("Sürücü S2");
    assertThat(xlsxText(export(w, null, "DRIVERS", from, to))).contains("Sürücü S2");

    // Pano: LIMITED'de pozisyon yok ve sayılar kapsamla; ALL kullanıcının panosu ayrı kalır.
    JsonNode ownerBoard = body(owner(w, get(REPORTS + "/dashboard")));
    assertThat(ownerBoard.get("finance").get("position").isArray()).isTrue();
    JsonNode managerBoard = asManager(w, get(REPORTS + "/dashboard"));
    assertThat(managerBoard.get("finance").get("position").isNull()).isTrue();
    assertThat(managerBoard.get("operations").get("lastThirtyDays").get("shipments").asLong())
        .isEqualTo(1);
    assertThat(ownerBoard.get("operations").get("lastThirtyDays").get("shipments").asLong())
        .isEqualTo(2);
    JsonNode ownerAgain = body(owner(w, get(REPORTS + "/dashboard")));
    assertThat(ownerAgain.get("finance").get("position").isArray()).isTrue();
    assertThat(ownerAgain.get("operations").get("lastThirtyDays").get("shipments").asLong())
        .isEqualTo(2);

    // CRM: teklif ve sözleşme listeleri görünür şirketlerle sınırlı; B'nin teklifi 403.
    String quoteA = id(owner(w, post(CRM + "/quotes"), quote(w, null)));
    String quoteB = id(owner(w, post(CRM + "/quotes"), quote(w, w.companyB())));
    assertThat(ids(asManager(w, get(CRM + "/quotes")).get("content"))).containsExactly(quoteA);
    assertThat(body(owner(w, get(CRM + "/quotes"))).get("content")).hasSize(2);
    expect(manager(w, get(CRM + "/quotes/" + quoteB + "/pdf")), 403, "COMPANY_OUT_OF_SCOPE");
    expect(manager(w, get(CRM + "/quotes/" + quoteB)), 403, "COMPANY_OUT_OF_SCOPE");
    expect(manager(w, get(CRM + "/quotes/" + quoteB + "/versions")), 403, "COMPANY_OUT_OF_SCOPE");
    expect(manager(w, post(CRM + "/quotes/" + quoteB + "/send")), 403, "COMPANY_OUT_OF_SCOPE");
    manager(w, get(CRM + "/quotes/" + quoteA)).andExpect(status().isOk());
    expect(
        managerSave(w, post(CRM + "/quotes"), quote(w, w.companyB())), 403, "COMPANY_OUT_OF_SCOPE");
    managerSave(w, post(CRM + "/quotes"), quote(w, w.companyA())).andExpect(status().isCreated());

    owner(w, post(CRM + "/contracts"), contract(w, null)).andExpect(status().isCreated());
    String contractB = id(owner(w, post(CRM + "/contracts"), contract(w, w.companyB())));
    JsonNode contracts = asManager(w, get(CRM + "/contracts")).get("content");
    assertThat(contracts.findValuesAsText("companyId")).containsExactly(w.companyA());
    assertThat(body(owner(w, get(CRM + "/contracts"))).get("content")).hasSize(2);
    expect(
        managerSave(
            w, post(CRM + "/contracts/" + contractB + "/status"), Map.of("status", "ENDED")),
        403,
        "COMPANY_OUT_OF_SCOPE");
    expect(
        managerSave(w, post(CRM + "/contracts"), contract(w, w.companyB())),
        403,
        "COMPANY_OUT_OF_SCOPE");
  }

  // --- kurulum

  private World world(String prefix) throws Exception {
    String t = prefix + "-" + Long.toString(System.nanoTime(), 36);
    createTenant(t);
    String schema = tenants.findByCode(t).orElseThrow().getSchemaName();
    String companyA =
        jdbc.queryForObject(
            "select id::text from \"%s\".company where is_default".formatted(schema), String.class);
    Map<String, Object> b = new HashMap<>();
    b.put("code", "SIR2");
    b.put("title", "Beta Lojistik AS");
    b.put("shortName", "Beta");
    b.put("taxIdType", "VKN");
    String companyB = id(sendJson(t, null, post("/api/v1/organization/companies"), b));
    String a1 = branch(t, "A1", companyA);
    String a2 = branch(t, "A2", companyA);
    String b1 = branch(t, "B1", companyB);
    String cashA1 = fund(t, "KASA-A1", a1);
    String cashA2 = fund(t, "KASA-A2", a2);
    String customer = account(t, "M1", "CUSTOMER");
    String supplier = account(t, "T1", "SUPPLIER");

    // Her modülde yetkili yönetici; patron kapsamını A1'e daraltır.
    Set<String> permissions =
        Arrays.stream(Permission.values())
            .filter(p -> p != Permission.DRIVER_APP && p != Permission.SUBSCRIPTION_VIEW)
            .map(Enum::name)
            .collect(Collectors.toSet());
    String role =
        id(
            sendJson(
                t,
                null,
                post("/api/v1/identity/roles"),
                Map.of(
                    "code",
                    "SUBE_MUDURU",
                    "name",
                    "Şube müdürü",
                    "priority",
                    5,
                    "landingPath",
                    "/operations",
                    "permissions",
                    permissions)));
    String email = "mudur@" + t + ".test";
    sendJson(
            t,
            null,
            post("/api/v1/identity/users"),
            Map.of("email", email, "fullName", "Müdür", "roleIds", List.of(role)))
        .andExpect(status().isCreated());
    String token = acceptInviteAndLogin(t, email);
    String userId = null;
    for (JsonNode user :
        body(send(t, null, get("/api/v1/identity/users").param("size", "100"))).get("content")) {
      if (email.equals(user.get("email").asText())) {
        userId = user.get("id").asText();
      }
    }
    Map<String, Object> scope = new HashMap<>();
    scope.put("scope", "LIMITED");
    scope.put("branchIds", List.of(a1));
    scope.put("defaultBranchId", a1);
    sendJson(t, null, put("/api/v1/identity/users/" + userId + "/branch-scope"), scope)
        .andExpect(status().isOk());
    return new World(
        t, schema, companyA, companyB, a1, a2, b1, cashA1, cashA2, customer, supplier, token);
  }

  private String branch(String t, String code, String companyId) throws Exception {
    return id(
        sendJson(
            t,
            null,
            post("/api/v1/organization/branches"),
            Map.of("code", code, "name", code + " Merkez", "companyId", companyId)));
  }

  private String fund(String t, String code, String branch) throws Exception {
    return id(
        sendJson(
            t,
            null,
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
                true)));
  }

  private String account(String t, String code, String type) throws Exception {
    return id(
        sendJson(
            t,
            null,
            post("/api/v1/finance/accounts"),
            Map.of("code", code, "name", code, "type", type)));
  }

  private String vehicle(World w, String plate, String branch) throws Exception {
    return id(owner(w, post(FLEET + "/vehicles"), vehicleBody(plate, branch)));
  }

  private static Map<String, Object> vehicleBody(String plate, String branch) {
    Map<String, Object> body = new HashMap<>();
    body.put("plate", plate);
    body.put("kind", "TRUCK");
    body.put("ownership", "OWNED");
    body.put("status", "ACTIVE");
    body.put("branchId", branch);
    return body;
  }

  private String driver(World w, String code, String branch) throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("code", code);
    body.put("fullName", "Sürücü " + code);
    body.put("status", "ACTIVE");
    body.put("branchId", branch);
    return id(owner(w, post(FLEET + "/drivers"), body));
  }

  private static Map<String, Object> advance(String branch, String fund) {
    return Map.of(
        "branchId", branch, "fundAccountId", fund, "money", money("10"), "date", TODAY.toString());
  }

  private static Map<String, Object> expense(World w, String branch) {
    return Map.of(
        "kind",
        "MAINTENANCE",
        "date",
        TODAY.toString(),
        "money",
        money("50"),
        "branchId",
        branch,
        "supplierAccountId",
        w.supplier());
  }

  private static Map<String, Object> warehouse(String code, String branch) {
    return Map.of("code", code, "name", code, "branchId", branch);
  }

  private static Map<String, Object> quote(World w, String companyId) {
    Map<String, Object> body = new HashMap<>();
    body.put("accountId", w.customer());
    body.put("currency", "TRY");
    body.put("validUntil", TODAY.plusDays(30).toString());
    body.put("companyId", companyId);
    return body;
  }

  private static Map<String, Object> contract(World w, String companyId) {
    Map<String, Object> body = new HashMap<>();
    body.put("accountId", w.customer());
    body.put("startDate", TODAY.toString());
    body.put("endDate", TODAY.plusDays(365).toString());
    body.put("companyId", companyId);
    return body;
  }

  /** Şema nitelikli SQL ile sefer (fiyat alanları dolu, yükleme şimdi). */
  private UUID shipment(World w, String branch, String number, String status) {
    OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
    Map<String, Object> values = new HashMap<>();
    values.put("number", number);
    values.put("account_id", UUID.fromString(w.customer()));
    values.put("branch_id", UUID.fromString(branch));
    values.put("status", status);
    values.put("planned_pickup", now.minusHours(2));
    values.put("planned_delivery", now.plusHours(2));
    values.put("net_amount", new BigDecimal("100"));
    values.put("vat_amount", new BigDecimal("20"));
    values.put("withholding_amount", BigDecimal.ZERO);
    values.put("total_amount", new BigDecimal("120"));
    values.put("breakdown", "{}");
    return new SchemaRows(jdbc).insert(w.schema(), "shipment", values);
  }

  private UUID leg(World w, UUID shipment, String driver) {
    OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
    Map<String, Object> values = new HashMap<>();
    values.put("id", UUID.randomUUID());
    values.put("shipment_id", shipment);
    values.put("sequence_no", 1);
    values.put("origin", "İstanbul");
    values.put("destination", "Ankara");
    values.put("planned_start", now.minusHours(1));
    values.put("planned_end", now.plusHours(1));
    values.put("driver_id", UUID.fromString(driver));
    return new SchemaRows(jdbc).insert(w.schema(), "shipment_leg", values);
  }

  private UUID driverExpense(World w, String driver, UUID shipment) {
    Map<String, Object> values = new HashMap<>();
    values.put("id", UUID.randomUUID());
    values.put("driver_id", UUID.fromString(driver));
    values.put("shipment_id", shipment);
    values.put("kind", "FUEL");
    values.put("amount", new BigDecimal("10"));
    values.put("currency", "TRY");
    values.put("expense_date", TODAY);
    values.put("status", "PENDING");
    return new SchemaRows(jdbc).insert(w.schema(), "driver_expense", values);
  }

  /** Rolüyle davet eder, kapsamı verilen iş yerlerine daraltır ve token döner. */
  private String limitedUser(World w, String name, String role, List<String> branches)
      throws Exception {
    String email = name + "@" + w.t() + ".test";
    owner(
            w,
            post("/api/v1/identity/users"),
            Map.of("email", email, "fullName", name, "roleIds", List.of(role)))
        .andExpect(status().isCreated());
    String token = acceptInviteAndLogin(w.t(), email);
    String userId = null;
    for (JsonNode user :
        body(owner(w, get("/api/v1/identity/users").param("size", "100"))).get("content")) {
      if (email.equals(user.get("email").asText())) {
        userId = user.get("id").asText();
      }
    }
    Map<String, Object> scope = new HashMap<>();
    scope.put("scope", "LIMITED");
    scope.put("branchIds", branches);
    scope.put("defaultBranchId", branches.get(0));
    owner(w, put("/api/v1/identity/users/" + userId + "/branch-scope"), scope)
        .andExpect(status().isOk());
    return token;
  }

  private String issueInvoice(World w, UUID shipment) throws Exception {
    return id(
        owner(
            w,
            post(SHIPMENT + "/shipments/" + shipment + "/invoice"),
            Map.of("invoiceDate", TODAY.toString(), "dueDate", TODAY.plusDays(30).toString())));
  }

  private static Map<String, Object> eArchive(String invoice) {
    return Map.of("kind", "EARSIV", "sourceType", "FREIGHT_INVOICE", "sourceId", invoice);
  }

  /** Sürücü uygulamasından masraf girer (onay e-postası olayı buradan yayımlanır). */
  private ResultActions driverExpenseViaApp(World w, String token, UUID trip, String amount)
      throws Exception {
    return send(
        w.t(),
        token,
        MockMvcRequestBuilders.multipart("/api/v1/driver/trips/" + trip + "/expenses")
            .param("clientId", UUID.randomUUID().toString())
            .param("kind", "FUEL")
            .param("amount", amount)
            .param("currency", "TRY")
            .param("date", TODAY.toString()));
  }

  private static List<Notice> sent(String email) {
    return SENT_NOTICES.stream().filter(n -> n.email().equals(email)).toList();
  }

  private static void awaitSubject(String email, String subject) throws InterruptedException {
    for (int i = 0; i < 100; i++) {
      if (sent(email).stream().anyMatch(n -> n.subject().equals(subject))) {
        return;
      }
      Thread.sleep(50);
    }
    throw new AssertionError(email + " için e-posta gelmedi: " + subject + " — " + sent(email));
  }

  private String inviteDriver(World w, String email) throws Exception {
    String roleId = null;
    for (JsonNode role : body(send(w.t(), null, get("/api/v1/identity/roles")))) {
      if ("DRIVER".equals(role.get("code").asText())) {
        roleId = role.get("id").asText();
      }
    }
    sendJson(
            w.t(),
            null,
            post("/api/v1/identity/users"),
            Map.of("email", email, "fullName", "Sürücü", "roleIds", List.of(roleId)))
        .andExpect(status().isCreated());
    return acceptInviteAndLogin(w.t(), email);
  }

  private JsonNode upload(World w, String token, String branch) throws Exception {
    return body(
        send(
                w.t(),
                token,
                MockMvcRequestBuilders.multipart(INTEGRATION + "/imports")
                    .file(tollFile())
                    .param("kind", "TOLL")
                    .param("accountId", w.supplier())
                    .param("branchId", branch))
            .andExpect(status().isCreated()));
  }

  private static MockMultipartFile tollFile() {
    return new MockMultipartFile(
        "file", "hgs.csv", "text/csv", TOLL_HEADER.getBytes(StandardCharsets.UTF_8));
  }

  private JsonNode profitability(World w, String token, String branch) throws Exception {
    MockHttpServletRequestBuilder request =
        get(REPORTS + "/profitability")
            .param("group", "SHIPMENT")
            .param("from", TODAY.minusDays(5).toString())
            .param("to", TODAY.toString());
    if (branch != null) {
      request.param("branchId", branch);
    }
    return body(send(w.t(), token, request).andExpect(status().isOk()));
  }

  private byte[] export(World w, String token, String report, String from, String to)
      throws Exception {
    return send(
            w.t(),
            token,
            get(REPORTS + "/export")
                .param("report", report)
                .param("format", "XLSX")
                .param("from", from)
                .param("to", to))
        .andExpect(status().isOk())
        .andReturn()
        .getResponse()
        .getContentAsByteArray();
  }

  /** Çalışma kitabının ilk sayfasındaki tüm hücre metinleri. */
  private static String xlsxText(byte[] content) throws Exception {
    StringBuilder text = new StringBuilder();
    try (XSSFWorkbook workbook = new XSSFWorkbook(new ByteArrayInputStream(content))) {
      for (Row row : workbook.getSheetAt(0)) {
        for (Cell cell : row) {
          text.append(cell.toString()).append('|');
        }
      }
    }
    return text.toString();
  }

  private static Map<String, Object> money(String amount) {
    return Map.of("amount", amount, "currency", "TRY");
  }

  // --- istek yardımcıları

  private ResultActions owner(World w, MockHttpServletRequestBuilder request) throws Exception {
    return send(w.t(), null, request);
  }

  private ResultActions owner(World w, MockHttpServletRequestBuilder request, Object body)
      throws Exception {
    return sendJson(w.t(), null, request, body);
  }

  private JsonNode asManager(World w, MockHttpServletRequestBuilder request) throws Exception {
    return body(manager(w, request).andExpect(status().isOk()));
  }

  private JsonNode asManagerList(World w, MockHttpServletRequestBuilder request) throws Exception {
    JsonNode list = asManager(w, request);
    assertThat(list.isArray()).isTrue();
    return list;
  }

  private ResultActions manager(World w, MockHttpServletRequestBuilder request) throws Exception {
    return send(w.t(), w.token(), request);
  }

  private ResultActions managerSave(World w, MockHttpServletRequestBuilder request, Object body)
      throws Exception {
    return sendJson(w.t(), w.token(), request, body);
  }

  /** {@code token} null ise patron. */
  private ResultActions send(String t, String token, MockHttpServletRequestBuilder request)
      throws Exception {
    return mvc.perform(request.with(token == null ? asOwner(t) : bearer(token)).with(tenant(t)));
  }

  private ResultActions sendJson(
      String t, String token, MockHttpServletRequestBuilder request, Object body) throws Exception {
    return send(
        t,
        token,
        request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
  }

  private String id(ResultActions actions) throws Exception {
    return body(actions.andExpect(status().isCreated())).get("id").asText();
  }

  private static List<String> ids(JsonNode rows) {
    List<String> ids = new ArrayList<>();
    rows.forEach(row -> ids.add(row.get("id").asText()));
    return ids;
  }

  private static void expect(ResultActions result, int status, String code) throws Exception {
    result.andExpect(status().is(status)).andExpect(jsonPath("$.code").value(code));
  }
}
