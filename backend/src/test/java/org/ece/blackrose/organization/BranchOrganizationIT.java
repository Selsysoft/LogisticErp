package org.ece.blackrose.organization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.AbstractIntegrationTest;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** İş yerleri ve şube grupları: geriye uyum, kurallar, şirket değişim kilidi, plan sınırı, ağaç. */
class BranchOrganizationIT extends AbstractIntegrationTest {

  private static final String BRANCHES = "/api/v1/organization/branches";
  private static final String GROUPS = "/api/v1/organization/branch-groups";
  private static final String COMPANIES = "/api/v1/organization/companies";

  @Autowired TenantRepository tenants;
  @Autowired JdbcTemplate jdbc;

  @Test
  void isYeriGeriyeUyumOtomatikKodVeListeSuzgecleri() throws Exception {
    String t = newTenant("brn");
    String defaultCompany = defaultCompanyId(t);

    JsonNode legacy = created(t, BRANCHES, Map.of("code", "S1", "name", "Merkez"));
    assertThat(legacy.get("companyId").asText()).isEqualTo(defaultCompany);
    assertThat(legacy.get("companyName").asText()).isEqualTo(t + " Lojistik");
    assertThat(legacy.get("branchGroupId").isNull()).isTrue();
    assertThat(legacy.get("active").asBoolean()).isTrue();
    assertThat(legacy.get("updateCount").asInt()).isZero();

    assertThat(created(t, BRANCHES, Map.of("name", "Depo Bir")).get("code").asText())
        .isEqualTo("IY-0001");
    Map<String, Object> blankCode = new HashMap<>();
    blankCode.put("code", null);
    blankCode.put("name", "Depo İki");
    blankCode.put("latitude", new BigDecimal("41.015137"));
    blankCode.put("longitude", new BigDecimal("28.979530"));
    blankCode.put("phone", "2125550000");
    JsonNode second = created(t, BRANCHES, blankCode);
    assertThat(second.get("code").asText()).isEqualTo("IY-0002");
    assertThat(second.get("latitude").decimalValue()).isEqualByComparingTo("41.015137");

    expect(
        save(t, post(BRANCHES), Map.of("code", "S1", "name", "Kopya")), 409, "BRANCH_CODE_TAKEN");
    expect(
        save(t, post(BRANCHES), Map.of("name", "Yarım", "latitude", 41)), 400, "VALIDATION_ERROR");
    expect(
        save(t, post(BRANCHES), Map.of("name", "Uzak", "latitude", 91, "longitude", 1)),
        400,
        "VALIDATION_ERROR");
    expect(
        save(t, post(BRANCHES), Map.of("name", "X", "companyId", UUID.randomUUID().toString())),
        400,
        "COMPANY_NOT_FOUND");
    expect(
        save(t, post(BRANCHES), Map.of("name", "X", "branchGroupId", UUID.randomUUID().toString())),
        400,
        "BRANCH_GROUP_NOT_FOUND");

    String s1 = legacy.get("id").asText();
    send(t, post(BRANCHES + "/" + s1 + "/deactivate"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.active").value(false));
    send(t, post(BRANCHES + "/" + s1 + "/deactivate")).andExpect(status().isOk());
    assertThat(codes(send(t, get(BRANCHES))))
        .as("varsayılan: tümü")
        .containsExactlyInAnyOrder("S1", "IY-0001", "IY-0002");
    assertThat(codes(send(t, get(BRANCHES).param("active", "true"))))
        .containsExactlyInAnyOrder("IY-0001", "IY-0002");
    assertThat(codes(send(t, get(BRANCHES).param("active", "false")))).containsExactly("S1");
    assertThat(codes(send(t, get(BRANCHES).param("q", "DEPO")))).hasSize(2);
    assertThat(codes(send(t, get(BRANCHES).param("q", "iy-0002")))).containsExactly("IY-0002");
    assertThat(codes(send(t, get(BRANCHES).param("companyId", defaultCompany)))).hasSize(3);
    // Bilinmeyen şirket süzgeci sessizce boş liste değil 400 verir (§4.1).
    expect(
        send(t, get(BRANCHES).param("companyId", UUID.randomUUID().toString())),
        400,
        "COMPANY_NOT_FOUND");
    expect(
        send(t, get("/api/v1/finance/funds").param("companyId", UUID.randomUUID().toString())),
        400,
        "COMPANY_NOT_FOUND");
    send(t, post(BRANCHES + "/" + s1 + "/activate"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.active").value(true));
    send(t, post(BRANCHES + "/" + s1 + "/activate")).andExpect(status().isOk());

    // PUT: kod null → değişmez; ad ve iletişim değişir.
    Map<String, Object> rename = new HashMap<>();
    rename.put("name", "Merkez Yeni");
    rename.put("city", "İstanbul");
    JsonNode renamed = body(save(t, put(BRANCHES + "/" + s1), rename).andExpect(status().isOk()));
    assertThat(renamed.get("code").asText()).isEqualTo("S1");
    assertThat(renamed.get("name").asText()).isEqualTo("Merkez Yeni");
    assertThat(renamed.get("city").asText()).isEqualTo("İstanbul");
    assertThat(renamed.get("updateCount").asInt()).isPositive();
    expect(
        save(t, put(BRANCHES + "/" + s1), Map.of("code", "IY-0001", "name", "Merkez")),
        409,
        "BRANCH_CODE_TAKEN");
    send(t, get(BRANCHES + "/" + s1))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("Merkez Yeni"));
    expect(send(t, get(BRANCHES + "/" + UUID.randomUUID())), 404, "BRANCH_NOT_FOUND");
    assertThat(audits(t, "BRANCH_CREATED")).isEqualTo(3);
  }

  @Test
  void subeGrubuKurallari() throws Exception {
    String t = newTenant("brg");
    String a = defaultCompanyId(t);
    String b = company(t, "SIR2", true);

    JsonNode g1 = created(t, GROUPS, Map.of("name", "Marmara", "groupType", "MAIN"));
    assertThat(g1.get("companyId").asText()).isEqualTo(a);
    assertThat(g1.get("branchCount").asInt()).isZero();
    assertThat(g1.get("active").asBoolean()).isTrue();
    String g1Id = g1.get("id").asText();
    expect(save(t, post(GROUPS), Map.of("name", "marmara")), 409, "BRANCH_GROUP_NAME_TAKEN");
    assertThat(
            created(t, GROUPS, Map.of("name", "Marmara", "companyId", b)).get("companyId").asText())
        .as("ad şirket içinde tekildir")
        .isEqualTo(b);
    Map<String, Object> passive = new HashMap<>();
    passive.put("name", "Ege");
    passive.put("active", false);
    passive.put("phone", "");
    JsonNode g2 = created(t, GROUPS, passive);
    assertThat(g2.get("active").asBoolean()).as("onay kutusu gerçekten kaydedilir").isFalse();
    assertThat(g2.get("phone").isNull()).isTrue();
    String g2Id = g2.get("id").asText();
    expect(
        save(t, post(GROUPS), Map.of("name", "X", "companyId", UUID.randomUUID().toString())),
        400,
        "COMPANY_NOT_FOUND");
    String passiveCompany = company(t, "PASIF", false);
    expect(
        save(t, post(GROUPS), Map.of("name", "X", "companyId", passiveCompany)),
        422,
        "COMPANY_INACTIVE");

    expect(
        save(t, post(BRANCHES), Map.of("name", "X", "branchGroupId", g1Id, "companyId", b)),
        422,
        "COMPANY_MISMATCH");
    expect(
        save(t, post(BRANCHES), Map.of("name", "X", "branchGroupId", g2Id)),
        422,
        "BRANCH_GROUP_INACTIVE");
    expect(
        save(t, post(BRANCHES), Map.of("name", "X", "companyId", passiveCompany)),
        422,
        "COMPANY_INACTIVE");
    JsonNode inGroup = created(t, BRANCHES, Map.of("name", "Kadıköy", "branchGroupId", g1Id));
    assertThat(inGroup.get("companyId").asText()).isEqualTo(a);
    assertThat(inGroup.get("branchGroupName").asText()).isEqualTo("Marmara");
    assertThat(body(send(t, get(GROUPS + "/" + g1Id))).get("branchCount").asInt()).isEqualTo(1);
    assertThat(codes(send(t, get(BRANCHES).param("groupId", g1Id))))
        .containsExactly(inGroup.get("code").asText());

    expect(
        send(t, post(GROUPS + "/" + g1Id + "/deactivate")),
        409,
        "BRANCH_GROUP_HAS_ACTIVE_BRANCHES");
    Map<String, Object> deactivateByPut = new HashMap<>();
    deactivateByPut.put("name", "Marmara");
    deactivateByPut.put("active", false);
    expect(
        save(t, put(GROUPS + "/" + g1Id), deactivateByPut),
        409,
        "BRANCH_GROUP_HAS_ACTIVE_BRANCHES");
    expect(
        save(t, put(GROUPS + "/" + g1Id), Map.of("name", "Marmara", "companyId", b)),
        409,
        "BRANCH_GROUP_COMPANY_LOCKED");
    JsonNode kept =
        body(
            save(t, put(GROUPS + "/" + g1Id), Map.of("name", "Marmara Bölge"))
                .andExpect(status().isOk()));
    assertThat(kept.get("companyId").asText()).as("PUT companyId null → değişmez").isEqualTo(a);
    assertThat(kept.get("name").asText()).isEqualTo("Marmara Bölge");
    expect(
        save(t, put(GROUPS + "/" + g2Id), Map.of("name", "Marmara Bölge")),
        409,
        "BRANCH_GROUP_NAME_TAKEN");

    // Boş grup başka şirkete taşınabilir; pasif şirkete taşınamaz.
    JsonNode moved =
        body(
            save(t, put(GROUPS + "/" + g2Id), Map.of("name", "Ege", "companyId", b))
                .andExpect(status().isOk()));
    assertThat(moved.get("companyId").asText()).isEqualTo(b);
    assertThat(moved.get("companyName").asText()).isEqualTo("SIR2 AŞ");
    expect(
        save(t, put(GROUPS + "/" + g2Id), Map.of("name", "Ege", "companyId", passiveCompany)),
        422,
        "COMPANY_INACTIVE");
    Map<String, Object> activateByPut = new HashMap<>();
    activateByPut.put("name", "Ege");
    activateByPut.put("active", true);
    send(
            t,
            put(GROUPS + "/" + g2Id)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(activateByPut)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.active").value(true));
    send(t, post(GROUPS + "/" + g2Id + "/deactivate"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.active").value(false));
    send(t, post(GROUPS + "/" + g2Id + "/deactivate")).andExpect(status().isOk());
    send(t, post(GROUPS + "/" + g2Id + "/activate"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.active").value(true));
    send(t, post(GROUPS + "/" + g2Id + "/activate")).andExpect(status().isOk());

    // Pasif şirketin grubu aktifleştirilemez.
    String passiveGroup = groupInCompanyThenDeactivate(t, "Pasif Grup", b);
    send(t, post(COMPANIES + "/" + b + "/deactivate")).andExpect(status().isOk());
    expect(send(t, post(GROUPS + "/" + passiveGroup + "/activate")), 422, "COMPANY_INACTIVE");

    send(t, get(GROUPS).param("companyId", a))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.totalElements").value(1));
    send(t, get(GROUPS).param("q", "ege").param("active", "true"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.totalElements").value(1));
    expect(send(t, get(GROUPS + "/" + UUID.randomUUID())), 404, "BRANCH_GROUP_NOT_FOUND");

    // İş yeri grubu değişir; grup null → "Diğer", pasif gruba taşınamaz.
    String branchId = inGroup.get("id").asText();
    Map<String, Object> ungroup = new HashMap<>();
    ungroup.put("name", "Kadıköy");
    JsonNode ungrouped =
        body(save(t, put(BRANCHES + "/" + branchId), ungroup).andExpect(status().isOk()));
    assertThat(ungrouped.get("branchGroupId").isNull()).isTrue();
    assertThat(ungrouped.get("companyId").asText()).isEqualTo(a);
    expect(
        save(t, put(BRANCHES + "/" + branchId), Map.of("name", "K", "branchGroupId", passiveGroup)),
        422,
        "BRANCH_GROUP_INACTIVE");
    expect(
        save(
            t,
            put(BRANCHES + "/" + branchId),
            Map.of("name", "K", "branchGroupId", g1Id, "companyId", b)),
        422,
        "COMPANY_MISMATCH");
    send(
            t,
            put(BRANCHES + "/" + branchId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("name", "K", "branchGroupId", g1Id))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.branchGroupId").value(g1Id));
    assertThat(audits(t, "BRANCH_GROUP_CREATED")).isEqualTo(4);
  }

  @Test
  void kaydiOlanIsYerininSirketiDegistirilemez() throws Exception {
    String t = newTenant("brl");
    String a = defaultCompanyId(t);
    String b = company(t, "SIR2", true);

    String free = created(t, BRANCHES, Map.of("code", "BOS", "name", "Boş")).get("id").asText();
    JsonNode movedFree =
        body(
            save(t, put(BRANCHES + "/" + free), Map.of("name", "Boş", "companyId", b))
                .andExpect(status().isOk()));
    assertThat(movedFree.get("companyId").asText()).isEqualTo(b);
    JsonNode keptCompany =
        body(
            save(t, put(BRANCHES + "/" + free), Map.of("name", "Boş 2"))
                .andExpect(status().isOk()));
    assertThat(keptCompany.get("companyId").asText())
        .as("companyId null → değişmez, varsayılana taşınmaz")
        .isEqualTo(b);

    // Finans hareketi olan iş yeri.
    String finance =
        created(t, BRANCHES, Map.of("code", "FIN", "name", "Finans")).get("id").asText();
    String account =
        created(
                t,
                "/api/v1/finance/accounts",
                Map.of("code", "M1", "name", "Müşteri", "type", "CUSTOMER"))
            .get("id")
            .asText();
    send(
            t,
            post("/api/v1/finance/accounts/" + account + "/transactions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of(
                            "branchId",
                            finance,
                            "direction",
                            "DEBIT",
                            "money",
                            Map.of("amount", "100", "currency", "TRY"),
                            "date",
                            tenantToday().toString()))))
        .andExpect(status().isCreated());
    expect(
        save(t, put(BRANCHES + "/" + finance), Map.of("name", "Finans", "companyId", b)),
        409,
        "BRANCH_COMPANY_LOCKED");

    // Yalnız faturasız seferi olan iş yeri.
    String trip = created(t, BRANCHES, Map.of("code", "SEF", "name", "Sefer")).get("id").asText();
    SchemaRows rows = new SchemaRows(jdbc);
    rows.insert(
        schema(t),
        "shipment",
        Map.of(
            "number",
            "SV-1",
            "account_id",
            UUID.fromString(account),
            "branch_id",
            UUID.fromString(trip),
            "status",
            "DELIVERED",
            "net_amount",
            new BigDecimal("100"),
            "vat_amount",
            new BigDecimal("20"),
            "withholding_amount",
            BigDecimal.ZERO,
            "total_amount",
            new BigDecimal("120"),
            "breakdown",
            "{}"));
    expect(
        save(t, put(BRANCHES + "/" + trip), Map.of("name", "Sefer", "companyId", b)),
        409,
        "BRANCH_COMPANY_LOCKED");

    // Yalnız deposu olan iş yeri.
    String depot = created(t, BRANCHES, Map.of("code", "DEP", "name", "Depo")).get("id").asText();
    rows.insert(
        schema(t),
        "warehouse",
        Map.of(
            "code",
            "W1",
            "name",
            "Ana Depo",
            "branch_id",
            UUID.fromString(depot),
            "bonded",
            false));
    expect(
        save(t, put(BRANCHES + "/" + depot), Map.of("name", "Depo", "companyId", b)),
        409,
        "BRANCH_COMPANY_LOCKED");
    send(t, get(BRANCHES + "/" + depot))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.companyId").value(a));

    // Pasif şirkete ya da pasif şirkette iş yeri aktifleştirilemez.
    String passive = company(t, "PASIF", false);
    expect(
        save(t, put(BRANCHES + "/" + free), Map.of("name", "Boş", "companyId", passive)),
        422,
        "COMPANY_INACTIVE");
    send(t, post(BRANCHES + "/" + free + "/deactivate")).andExpect(status().isOk());
    send(t, post(COMPANIES + "/" + b + "/deactivate")).andExpect(status().isOk());
    expect(send(t, post(BRANCHES + "/" + free + "/activate")), 422, "COMPANY_INACTIVE");
  }

  @Test
  void isYeriPlanSiniri() throws Exception {
    String t = newTenant("brp");
    assignPlan(t, plan());
    String first = created(t, BRANCHES, Map.of("code", "P1", "name", "Bir")).get("id").asText();
    expect(
        save(t, post(BRANCHES), Map.of("code", "P2", "name", "İki")), 409, "PLAN_LIMIT_EXCEEDED");
    send(t, post(BRANCHES + "/" + first + "/deactivate")).andExpect(status().isOk());
    created(t, BRANCHES, Map.of("code", "P2", "name", "İki"));
    expect(send(t, post(BRANCHES + "/" + first + "/activate")), 409, "PLAN_LIMIT_EXCEEDED");
  }

  @Test
  void isYeriAgaci() throws Exception {
    String t = newTenant("brt");
    String a = defaultCompanyId(t);
    String b = company(t, "BETA", true);
    company(t, "BOSSIRKET", true);

    String zeta = created(t, GROUPS, Map.of("name", "Zeta")).get("id").asText();
    String alfa = created(t, GROUPS, Map.of("name", "Alfa")).get("id").asText();
    created(t, GROUPS, Map.of("name", "Boş Grup"));
    created(t, BRANCHES, Map.of("code", "Z1", "name", "Zonguldak", "branchGroupId", zeta));
    created(t, BRANCHES, Map.of("code", "A2", "name", "Çorum", "branchGroupId", alfa));
    created(t, BRANCHES, Map.of("code", "A1", "name", "Ankara", "branchGroupId", alfa));
    created(t, BRANCHES, Map.of("code", "D1", "name", "Bursa"));
    created(t, BRANCHES, Map.of("code", "B1", "name", "Beta Merkez", "companyId", b));
    String closed = created(t, GROUPS, Map.of("name", "Kapalı")).get("id").asText();
    String closedBranch =
        created(
                t,
                BRANCHES,
                Map.of("code", "K1", "name", "Kapalı İş Yeri", "branchGroupId", closed))
            .get("id")
            .asText();
    send(t, post(BRANCHES + "/" + closedBranch + "/deactivate")).andExpect(status().isOk());
    send(t, post(GROUPS + "/" + closed + "/deactivate")).andExpect(status().isOk());

    JsonNode tree =
        body(
            send(t, get("/api/v1/organization/branch-tree").param("scope", "mine"))
                .andExpect(status().isOk()));
    assertThat(tree).hasSize(2);
    JsonNode first = tree.get(0);
    assertThat(first.get("companyId").asText()).as("varsayılan şirket önce").isEqualTo(a);
    assertThat(first.get("companyActive").asBoolean()).isTrue();
    assertThat(groupNames(first)).containsExactly("Alfa", "Zeta", "Diğer");
    JsonNode alfaNode = first.get("groups").get(0);
    assertThat(alfaNode.get("groupId").asText()).isEqualTo(alfa);
    assertThat(alfaNode.get("branches").get(0).get("name").asText()).isEqualTo("Ankara");
    assertThat(alfaNode.get("branches").get(1).get("name").asText()).isEqualTo("Çorum");
    assertThat(first.get("groups").get(2).get("groupId").isNull()).isTrue();
    assertThat(tree.get(1).get("companyId").asText()).isEqualTo(b);
    assertThat(tree.get(1).get("companyName").asText()).isEqualTo("BETA AŞ");

    JsonNode all =
        body(send(t, get("/api/v1/organization/branch-tree").param("includeInactive", "true")));
    assertThat(groupNames(all.get(0))).containsExactly("Alfa", "Kapalı", "Zeta", "Diğer");
    JsonNode closedNode = all.get(0).get("groups").get(1);
    assertThat(closedNode.get("groupActive").asBoolean()).isFalse();
    assertThat(closedNode.get("branches").get(0).get("active").asBoolean()).isFalse();

    // FINANCE_VIEW'li ama BRANCH_VIEW'siz rol ağacı okur, iş yeri listesini okuyamaz.
    String token = userWithPermissions(t, "AGAC_OKUR", List.of("FINANCE_VIEW"));
    mvc.perform(get("/api/v1/organization/branch-tree").with(tenant(t)).with(bearer(token)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(2));
    mvc.perform(get(BRANCHES).with(tenant(t)).with(bearer(token)))
        .andExpect(status().isForbidden());
  }

  // --- yardımcılar

  private String newTenant(String prefix) throws Exception {
    String t = prefix + "-" + Long.toString(System.nanoTime(), 36);
    createTenant(t);
    return t;
  }

  private String schema(String t) {
    return tenants.findByCode(t).orElseThrow().getSchemaName();
  }

  private String defaultCompanyId(String t) throws Exception {
    for (JsonNode row : body(send(t, get(COMPANIES))).get("content")) {
      if (row.get("defaultCompany").asBoolean()) {
        return row.get("id").asText();
      }
    }
    throw new AssertionError("varsayılan şirket yok");
  }

  private String company(String t, String code, boolean active) throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("code", code);
    body.put("title", code + " AŞ");
    body.put("shortName", code + " AŞ");
    body.put("taxIdType", "VKN");
    body.put("active", active);
    return created(t, COMPANIES, body).get("id").asText();
  }

  private String groupInCompanyThenDeactivate(String t, String name, String companyId)
      throws Exception {
    String id = created(t, GROUPS, Map.of("name", name, "companyId", companyId)).get("id").asText();
    send(t, post(GROUPS + "/" + id + "/deactivate")).andExpect(status().isOk());
    return id;
  }

  private ResultActions send(String t, MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request.with(asOwner(t)));
  }

  private ResultActions save(String t, MockHttpServletRequestBuilder request, Object body)
      throws Exception {
    return send(
        t, request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
  }

  private JsonNode created(String t, String path, Object body) throws Exception {
    return body(save(t, post(path), body).andExpect(status().isCreated()));
  }

  private static void expect(ResultActions result, int status, String code) throws Exception {
    result.andExpect(status().is(status)).andExpect(jsonPath("$.code").value(code));
  }

  private List<String> codes(ResultActions result) throws Exception {
    List<String> codes = new ArrayList<>();
    body(result.andExpect(status().isOk()))
        .get("content")
        .forEach(row -> codes.add(row.get("code").asText()));
    return codes;
  }

  private static List<String> groupNames(JsonNode company) {
    List<String> names = new ArrayList<>();
    company.get("groups").forEach(group -> names.add(group.get("groupName").asText()));
    return names;
  }

  private int audits(String t, String event) {
    return jdbc.queryForObject(
        "select count(*) from \"%s\".audit_log where event_type = ?".formatted(schema(t)),
        Integer.class,
        event);
  }

  private String userWithPermissions(String t, String roleCode, List<String> permissions)
      throws Exception {
    String roleId =
        created(
                t,
                "/api/v1/identity/roles",
                Map.of(
                    "code",
                    roleCode,
                    "name",
                    roleCode,
                    "priority",
                    5,
                    "landingPath",
                    "/finance",
                    "permissions",
                    permissions))
            .get("id")
            .asText();
    String email = roleCode.toLowerCase(Locale.ROOT) + "@" + t + ".test";
    save(
            t,
            post("/api/v1/identity/users"),
            Map.of("email", email, "fullName", "Test", "roleIds", List.of(roleId)))
        .andExpect(status().isCreated());
    return acceptInviteAndLogin(t, email);
  }

  private String plan() throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("code", "IYR" + Long.toString(System.nanoTime(), 36).toUpperCase(Locale.ROOT));
    body.put("name", "İş yeri sınırı");
    body.put("monthlyPrice", "0");
    body.put("currency", "TRY");
    body.put("maxBranches", 1);
    body.put("active", true);
    return body(mvc.perform(
                post("/api/v1/admin/plans")
                    .with(bearer(saasToken()))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(body)))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.maxBranches").value(1)))
        .get("id")
        .asText();
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
}
