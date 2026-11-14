package org.ece.blackrose.finance;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.ece.blackrose.AbstractIntegrationTest;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Faz 12.1 finans entegrasyon testlerinin ortak kurulumu (12.1_TASARIM §6): iki şirketli kiracı, iş
 * yerleri, fonlar, kullanıcılar, cari ve elle hareket. Desen {@code BranchScopeModulesIT}.
 */
public abstract class AccountTestSupport extends AbstractIntegrationTest {

  protected static final String FINANCE = "/api/v1/finance";
  protected static final LocalDate TODAY = tenantToday();

  private static final AtomicInteger SEQUENCE = new AtomicInteger();

  @Autowired protected TenantRepository tenants;
  @Autowired protected JdbcTemplate jdbc;

  /**
   * A varsayılan şirket (iş yerleri A1, A2), B ikinci şirket "SIR2" (iş yeri B1); her iş yerinde
   * eksiye düşebilen TRY kasası.
   */
  protected record World(
      String t,
      String schema,
      String companyA,
      String companyB,
      String a1,
      String a2,
      String b1,
      String fundA1,
      String fundA2,
      String fundB1) {

    public UUID companyAId() {
      return UUID.fromString(companyA);
    }

    public UUID companyBId() {
      return UUID.fromString(companyB);
    }
  }

  protected World world(String prefix) throws Exception {
    String t = prefix + "-" + Long.toString(System.nanoTime(), 36);
    createTenant(t);
    String schema = tenants.findByCode(t).orElseThrow().getSchemaName();
    String companyA =
        jdbc.queryForObject(
            "select id::text from \"%s\".company where is_default".formatted(schema), String.class);
    Map<String, Object> company = new HashMap<>();
    company.put("code", "SIR2");
    company.put("title", "Beta Lojistik AS");
    company.put("shortName", "Beta");
    company.put("taxIdType", "VKN");
    String companyB = id(sendJson(t, null, post("/api/v1/organization/companies"), company));
    String a1 = branch(t, "A1", companyA);
    String a2 = branch(t, "A2", companyA);
    String b1 = branch(t, "B1", companyB);
    return new World(
        t,
        schema,
        companyA,
        companyB,
        a1,
        a2,
        b1,
        fund(t, "KASA-A1", a1),
        fund(t, "KASA-A2", a2),
        fund(t, "KASA-B1", b1));
  }

  /** Rolüyle davet eder, kapsamını verilen iş yerlerine daraltır ve token döner. */
  protected String limitedUser(World w, String name, String roleCode, List<String> branchIds)
      throws Exception {
    String email = invite(w, name, roleCode);
    String token = acceptInviteAndLogin(w.t(), email);
    Map<String, Object> scope = new HashMap<>();
    scope.put("scope", "LIMITED");
    scope.put("branchIds", branchIds);
    scope.put("defaultBranchId", branchIds.get(0));
    sendJson(
            w.t(), null, put("/api/v1/identity/users/" + userId(w, email) + "/branch-scope"), scope)
        .andExpect(status().isOk());
    return token;
  }

  /** Tüm iş yerlerini gören (ALL kapsam) kullanıcı; token döner. */
  protected String userWithRole(World w, String name, String roleCode) throws Exception {
    return acceptInviteAndLogin(w.t(), invite(w, name, roleCode));
  }

  /** Rol koduna göre rol kimliği (tohum roller: FINANCE_SUPER, FINANCE, ACCOUNTING …). */
  protected String roleId(World w, String roleCode) throws Exception {
    for (JsonNode role :
        body(send(w.t(), null, get("/api/v1/identity/roles")).andExpect(status().isOk()))) {
      if (roleCode.equals(role.get("code").asText())) {
        return role.get("id").asText();
      }
    }
    throw new AssertionError("Rol yok: " + roleCode);
  }

  /**
   * Patron olarak ortak (şubesiz) cari açar. {@code subGroup} boşsa türün varsayılan grubu kalır;
   * doluysa (aynı türün grubu olmalı) şema nitelikli SQL ile atanır. Grup carisi yalnız şirket
   * kartından açılır, burada açılamaz.
   */
  protected UUID account(World w, AccountType type, String subGroup) throws Exception {
    if (type == AccountType.INTERCOMPANY) {
      throw new IllegalArgumentException("Grup carisi şirket kartından açılır.");
    }
    String code = "C" + SEQUENCE.incrementAndGet();
    UUID id =
        UUID.fromString(
            id(
                sendJson(
                    w.t(),
                    null,
                    post(FINANCE + "/accounts"),
                    Map.of("code", code, "name", "Cari " + code, "type", type.name()))));
    if (subGroup != null && !subGroup.equals(type.defaultSubGroup())) {
      jdbc.update(
          "update \"%s\".account set sub_group = ? where id = ?".formatted(w.schema()),
          subGroup,
          id);
    }
    return id;
  }

  /** Patron olarak bugün tarihli elle cari hareketi yazar; TRY dışı para biriminde kur 30. */
  protected UUID manual(
      World w, UUID accountId, String branch, Direction direction, String amount, String currency)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("branchId", branch);
    body.put("direction", direction.name());
    body.put("money", Map.of("amount", amount, "currency", currency));
    body.put("date", TODAY.toString());
    body.put("description", "Test " + direction);
    if (!"TRY".equals(currency)) {
      body.put("exchangeRate", "30");
    }
    return UUID.fromString(
        id(
            sendJson(
                w.t(), null, post(FINANCE + "/accounts/" + accountId + "/transactions"), body)));
  }

  // --- eşzamanlılık

  /**
   * Çağrıları ayrı iş parçacıklarında, ortak bir başlangıç engelinden ({@link CyclicBarrier}) sonra
   * aynı anda başlatır; sonuçları çağrı sırasıyla döner. Engel olmadan havuz istekleri seri
   * işleyebilir ve yarış testi yarışı sınamadan geçer (T-2).
   */
  @SafeVarargs
  protected static <T> List<T> concurrently(Callable<T>... calls) throws Exception {
    CyclicBarrier start = new CyclicBarrier(calls.length);
    ExecutorService pool = Executors.newFixedThreadPool(calls.length);
    try {
      List<Future<T>> futures = new ArrayList<>();
      for (Callable<T> call : calls) {
        futures.add(
            pool.submit(
                () -> {
                  start.await(1, TimeUnit.MINUTES);
                  return call.call();
                }));
      }
      List<T> results = new ArrayList<>();
      for (Future<T> future : futures) {
        results.add(future.get(2, TimeUnit.MINUTES));
      }
      return results;
    } finally {
      pool.shutdownNow();
    }
  }

  // --- istek yardımcıları

  /** {@code token} null ise patron. */
  protected ResultActions send(String t, String token, MockHttpServletRequestBuilder request)
      throws Exception {
    return mvc.perform(request.with(token == null ? asOwner(t) : bearer(token)).with(tenant(t)));
  }

  protected ResultActions sendJson(
      String t, String token, MockHttpServletRequestBuilder request, Object body) throws Exception {
    return send(
        t,
        token,
        request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
  }

  /** 201 bekler ve gövdedeki {@code id}'yi döner. */
  protected String id(ResultActions actions) throws Exception {
    return body(actions.andExpect(status().isCreated())).get("id").asText();
  }

  protected static void expect(ResultActions result, int status, String code) throws Exception {
    result.andExpect(status().is(status)).andExpect(jsonPath("$.code").value(code));
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
            post(FINANCE + "/funds"),
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

  private String invite(World w, String name, String roleCode) throws Exception {
    String email = name + "@" + w.t() + ".test";
    sendJson(
            w.t(),
            null,
            post("/api/v1/identity/users"),
            Map.of("email", email, "fullName", name, "roleIds", List.of(roleId(w, roleCode))))
        .andExpect(status().isCreated());
    return email;
  }

  private String userId(World w, String email) throws Exception {
    for (JsonNode user :
        body(send(w.t(), null, get("/api/v1/identity/users").param("size", "100")))
            .get("content")) {
      if (email.equals(user.get("email").asText())) {
        return user.get("id").asText();
      }
    }
    throw new AssertionError("Kullanıcı yok: " + email);
  }
}
