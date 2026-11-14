package org.ece.blackrose.organization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.AbstractIntegrationTest;
import org.ece.blackrose.identity.domain.Permission;
import org.ece.blackrose.notification.DailyDigestMailer;
import org.ece.blackrose.tenant.TenantContext;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Kullanıcı iş yeri kapsamı (ALL / LIMITED): organization ve finans uçlarında liste süzgeci,
 * kimlikle erişimde 403, yeni kayıtta aktiflik, kullanıcı yönetiminde kapsam, {@code /auth/me} ve
 * kapsama göre süzülen bildirim e-postaları.
 */
class BranchScopeIT extends AbstractIntegrationTest {

  private static final String ORG = "/api/v1/organization";
  private static final String FINANCE = "/api/v1/finance";
  private static final String USERS = "/api/v1/identity/users";
  private static final LocalDate TODAY = tenantToday();

  @Autowired TenantRepository tenants;
  @Autowired JdbcTemplate jdbc;
  @Autowired DailyDigestMailer digest;

  /**
   * A varsayılan şirket (iş yerleri A1, A2), B "SIR2" (iş yeri B1); her iş yerinde bir kasa.
   * Yönetici ({@code manager}) kullanıcı ve iş yeri yönetebilen, finans onaycısı bir roldedir.
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
      String managerEmail,
      String managerId,
      String managerToken) {}

  @Test
  void limitedKullaniciYalnizKendiIsYeriniGorur() throws Exception {
    World w = world("bsl");
    String date = TODAY.toString();

    // Patron her iki iş yerinde hareket açar.
    created(w, FINANCE + "/collections", cash(w.customer(), w.a1(), w.cashA1(), "100"));
    String key = "idem-" + w.t();
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/collections").header("Idempotency-Key", key),
            cash(w.customer(), w.a2(), w.cashA2(), "50"))
        .andExpect(status().isCreated());
    created(w, FINANCE + "/payments", cash(w.supplier(), w.a1(), w.cashA1(), "10"));
    created(w, FINANCE + "/payments", cash(w.supplier(), w.a2(), w.cashA2(), "20"));
    created(w, FINANCE + "/purchase-invoices", invoice(w, w.a1(), "F-A1"));
    created(w, FINANCE + "/purchase-invoices", invoice(w, w.a2(), "F-A2"));
    created(w, FINANCE + "/collections", check(w.customer(), w.a1(), "C-A1"));
    created(w, FINANCE + "/collections", check(w.customer(), w.a2(), "C-A2"));

    // Kapsam değişmeden önce yönetici her şeyi görür.
    assertThat(asManager(w, get(ORG + "/branches")).get("totalElements").asInt()).isEqualTo(3);
    JsonNode allMe = asManager(w, get("/api/v1/auth/me"));
    assertThat(allMe.get("branchScope").asText()).isEqualTo("ALL");
    assertThat(allMe.get("allowedBranchIds").isNull()).isTrue();
    assertThat(allMe.get("companies")).hasSize(2);

    // Patron kapsamı A1'e daraltır; aynı token bir sonraki istekte daralmış görür (401 yok).
    JsonNode saved =
        body(
            scope(w, null, w.managerId(), "LIMITED", List.of(w.a1()), w.a1())
                .andExpect(status().isOk()));
    assertThat(saved.get("branchIds").get(0).asText()).isEqualTo(w.a1());
    JsonNode page = asManager(w, get(ORG + "/branches"));
    assertThat(ids(page.get("content"))).containsExactly(w.a1());
    JsonNode audit =
        body(send(w.t(), null, get("/api/v1/identity/audit-logs").param("size", "50")));
    assertThat(audit.get("content").findValuesAsText("eventType"))
        .contains("USER_BRANCH_SCOPE_CHANGED");
    assertThat(audit.get("content").findValuesAsText("details")).contains("LIMITED:1");

    // /auth/me: liste + yalnız A1'in şirketi; varsayılan iş yeri.
    JsonNode me = asManager(w, get("/api/v1/auth/me"));
    assertThat(me.get("branchScope").asText()).isEqualTo("LIMITED");
    assertThat(texts(me.get("allowedBranchIds"))).containsExactly(w.a1());
    assertThat(me.get("defaultBranchId").asText()).isEqualTo(w.a1());
    assertThat(me.get("companies")).hasSize(1);
    assertThat(me.get("companies").get(0).get("id").asText()).isEqualTo(w.companyA());
    JsonNode ownerMe = body(send(w.t(), null, get("/api/v1/auth/me")));
    assertThat(ownerMe.get("allowedBranchIds").isNull()).isTrue();
    assertThat(ownerMe.get("companies")).hasSize(2);

    // Organization: ağaç, şirketler, iş yeri ve şirket kimlikle erişimi.
    JsonNode tree = asManager(w, get(ORG + "/branch-tree"));
    assertThat(tree).hasSize(1);
    assertThat(tree.get(0).get("groups").get(0).get("branches")).hasSize(1);
    assertThat(ids(asManager(w, get(ORG + "/companies")).get("content")))
        .containsExactly(w.companyA());
    expect(manager(w, get(ORG + "/branches/" + w.a2())), 403, "BRANCH_OUT_OF_SCOPE");
    manager(w, get(ORG + "/branches/" + w.a1())).andExpect(status().isOk());
    expect(manager(w, get(ORG + "/companies/" + w.companyB())), 403, "COMPANY_OUT_OF_SCOPE");
    expect(
        manager(w, get(ORG + "/branches").param("companyId", w.companyB())),
        403,
        "COMPANY_OUT_OF_SCOPE");
    expect(
        manager(w, post(ORG + "/branches/" + w.a2() + "/deactivate")), 403, "BRANCH_OUT_OF_SCOPE");
    expect(
        manager(w, get(ORG + "/companies/" + w.companyB() + "/document-series")),
        403,
        "COMPANY_OUT_OF_SCOPE");

    // Finans listeleri yalnız A1.
    JsonNode funds = asManager(w, get(FINANCE + "/funds"));
    assertThat(funds.findValuesAsText("id")).containsExactly(w.cashA1());
    expect(
        manager(w, get(FINANCE + "/funds").param("companyId", w.companyB())),
        403,
        "COMPANY_OUT_OF_SCOPE");
    for (String path :
        List.of("/payments", "/collections", "/purchase-invoices", "/payment-plans")) {
      JsonNode rows = asManager(w, get(FINANCE + path)).get("content");
      assertThat(rows).as(path).isNotEmpty();
      assertThat(new HashSet<>(rows.findValuesAsText("branchId"))).as(path).containsOnly(w.a1());
    }
    JsonNode instruments = asManager(w, get(FINANCE + "/instruments")).get("content");
    assertThat(instruments.findValuesAsText("branchId")).containsExactly(w.a1());
    JsonNode daily =
        asManager(
            w, get(FINANCE + "/reports/daily").param("type", "COLLECTION").param("date", date));
    assertThat(new HashSet<>(daily.get("totals").findValuesAsText("branchId")))
        .containsOnly(w.a1());
    expect(
        manager(
            w,
            get(FINANCE + "/reports/daily")
                .param("type", "COLLECTION")
                .param("date", date)
                .param("branchIds", w.a2())),
        403,
        "BRANCH_OUT_OF_SCOPE");
    String a2Plan = null;
    for (JsonNode plan : body(send(w.t(), null, get(FINANCE + "/payment-plans"))).get("content")) {
      if (w.a2().equals(plan.get("branchId").asText())) {
        a2Plan = plan.get("id").asText();
      }
    }
    expect(
        manager(w, get(FINANCE + "/payment-plans/" + a2Plan + "/events")),
        403,
        "BRANCH_OUT_OF_SCOPE");

    // Kapsam dışı iş yeriyle yeni kayıt 403, kapsam dışı fon ekstresi 403.
    expect(
        managerSave(w, post(FINANCE + "/payments"), cash(w.supplier(), w.a2(), w.cashA2(), "5")),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        managerSave(
            w,
            post(FINANCE + "/accounts/" + w.customer() + "/transactions"),
            Map.of("branchId", w.a2(), "direction", "DEBIT", "money", money("1"), "date", date)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        manager(
            w,
            get(FINANCE + "/funds/" + w.cashA2() + "/statement")
                .param("from", date)
                .param("to", date)),
        403,
        "BRANCH_OUT_OF_SCOPE");

    // Cari kart listesi ortak; bakiyesi yalnız A1 hareketleri (nakit 100 + çek 30).
    JsonNode accounts = asManager(w, get(FINANCE + "/accounts").param("size", "100"));
    assertThat(accounts.get("content").findValuesAsText("id")).contains(w.customer(), w.supplier());
    assertThat(balance(w, w.managerToken(), w.customer())).isEqualByComparingTo("-130");
    assertThat(balance(w, null, w.customer())).isEqualByComparingTo("-210");

    // İdempotency: A2'nin anahtarıyla A1 kapsamlı kullanıcı kaydı göremez.
    expect(
        managerSaveWithKey(
            w, post(FINANCE + "/collections"), cash(w.customer(), w.a1(), w.cashA1(), "50"), key),
        403,
        "BRANCH_OUT_OF_SCOPE");

    // Güncelleme: kapsam dışı fon/cari kendi iş yerine taşınamaz, şubesizleştirilemez.
    String fundBranchSql =
        "select branch_id::text from \"%s\".fund_account where id = ?::uuid".formatted(w.schema());
    expect(
        managerSave(w, put(FINANCE + "/funds/" + w.cashA2()), fundUpdate("KASA-A2", w.a1())),
        403,
        "BRANCH_OUT_OF_SCOPE");
    assertThat(jdbc.queryForObject(fundBranchSql, String.class, w.cashA2())).isEqualTo(w.a2());
    managerSave(w, put(FINANCE + "/funds/" + w.cashA1()), fundUpdate("KASA-A1", w.a1()))
        .andExpect(status().isOk());
    Map<String, Object> a2Account = new HashMap<>();
    a2Account.put("code", "M-A2");
    a2Account.put("name", "A2 carisi");
    a2Account.put("type", "CUSTOMER");
    a2Account.put("branchId", w.a2());
    String accountA2 = id(sendJson(w.t(), null, post(FINANCE + "/accounts"), a2Account));
    a2Account.put("branchId", w.a1());
    expect(
        managerSave(w, put(FINANCE + "/accounts/" + accountA2), a2Account),
        403,
        "BRANCH_OUT_OF_SCOPE");
    a2Account.put("branchId", null);
    expect(
        managerSave(w, put(FINANCE + "/accounts/" + accountA2), a2Account),
        403,
        "BRANCH_OUT_OF_SCOPE");
    assertThat(
            jdbc.queryForObject(
                "select branch_id::text from \"%s\".account where id = ?::uuid"
                    .formatted(w.schema()),
                String.class,
                accountA2))
        .isEqualTo(w.a2());

    // Çek cirosu: A2 portföyündeki çek A1'e sınırlı kullanıcıca cirolanamaz; patron cirolar.
    String checkA2 = null;
    for (JsonNode row :
        body(send(w.t(), null, get(FINANCE + "/instruments").param("size", "50"))).get("content")) {
      if (w.a2().equals(row.get("branchId").asText())) {
        checkA2 = row.get("id").asText();
      }
    }
    assertThat(checkA2).isNotNull();
    String instrumentSql =
        "select status from \"%s\".instrument where id = ?::uuid".formatted(w.schema());
    String statusBefore = jdbc.queryForObject(instrumentSql, String.class, checkA2);
    String settlementCountSql =
        "select count(*) from \"%s\".settlement where instrument_id = ?::uuid"
            .formatted(w.schema());
    Integer settlementsBefore = jdbc.queryForObject(settlementCountSql, Integer.class, checkA2);
    Integer ledgerBefore =
        jdbc.queryForObject(
            "select count(*) from \"%s\".account_transaction".formatted(w.schema()), Integer.class);
    expect(
        managerSave(w, post(FINANCE + "/payments"), endorse(w.supplier(), w.a1(), checkA2)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    assertThat(jdbc.queryForObject(instrumentSql, String.class, checkA2)).isEqualTo(statusBefore);
    assertThat(jdbc.queryForObject(settlementCountSql, Integer.class, checkA2))
        .isEqualTo(settlementsBefore);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from \"%s\".account_transaction".formatted(w.schema()),
                Integer.class))
        .isEqualTo(ledgerBefore);
    created(w, FINANCE + "/payments", endorse(w.supplier(), w.a1(), checkA2));
    assertThat(jdbc.queryForObject(instrumentSql, String.class, checkA2)).isEqualTo("ENDORSED");

    // Eski e-belge ayar cephesi: varsayılan şirkette izinli iş yeri yoksa 403.
    String clerkEmail = "clerk@" + w.t() + ".test";
    String clerkToken = invite(w, null, clerkEmail, roleId(w, "FINANCE"));
    scope(w, null, userId(w, clerkEmail), "LIMITED", List.of(w.b1()), null)
        .andExpect(status().isOk());
    expect(
        send(
            w.t(),
            clerkToken,
            put("/api/v1/integration/e-document-settings")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of("taxNumber", "9876543217", "taxOffice", "X", "address", "Y")))),
        403,
        "COMPANY_OUT_OF_SCOPE");
  }

  @Test
  void kullaniciYonetimindeKapsamKurallari() throws Exception {
    World w = world("bsu");
    String ownerId = userId(w, ownerEmail(w.t()));

    // Kapsam isteği doğrulamaları (patron yapar).
    expect(scope(w, null, ownerId, "LIMITED", List.of(w.a1()), null), 409, "OWNER_SCOPE_ALL");
    expect(scope(w, null, w.managerId(), "LIMITED", List.of(), null), 422, "BRANCH_SCOPE_EMPTY");
    expect(
        scope(w, null, w.managerId(), "LIMITED", List.of(w.a1()), w.a2()),
        422,
        "DEFAULT_BRANCH_OUT_OF_SCOPE");
    expect(
        scope(w, null, w.managerId(), "LIMITED", List.of(UUID.randomUUID().toString()), null),
        400,
        "BRANCH_NOT_FOUND");
    expect(
        scope(w, null, w.managerId(), "ALL", List.of(), UUID.randomUUID().toString()),
        400,
        "BRANCH_NOT_FOUND");
    expect(
        send(w.t(), null, get(USERS + "/" + UUID.randomUUID() + "/branch-scope")),
        404,
        "USER_NOT_FOUND");
    // Pasif iş yeri kapsama verilebilir; ALL'a dönüşte liste boşalır.
    send(w.t(), null, post(ORG + "/branches/" + w.a2() + "/deactivate")).andExpect(status().isOk());
    scope(w, null, w.managerId(), "LIMITED", List.of(w.a1(), w.a2()), w.a2())
        .andExpect(status().isOk());
    JsonNode all =
        body(
            scope(w, null, w.managerId(), "ALL", List.of(w.a1()), w.a1())
                .andExpect(status().isOk()));
    assertThat(all.get("branchIds")).isEmpty();
    send(w.t(), null, post(ORG + "/branches/" + w.a2() + "/activate")).andExpect(status().isOk());
    JsonNode allScope = body(send(w.t(), null, get(USERS + "/" + w.managerId() + "/branch-scope")));
    assertThat(allScope.get("scope").asText()).isEqualTo("ALL");
    assertThat(allScope.get("defaultBranchId").asText()).isEqualTo(w.a1());

    // Yönetici A1'e sınırlanır; ALL bir finans kullanıcısı ve A1'li bir kullanıcı vardır.
    scope(w, null, w.managerId(), "LIMITED", List.of(w.a1()), w.a1()).andExpect(status().isOk());
    String financeRole = roleId(w, "FINANCE");
    String allEmail = "all@" + w.t() + ".test";
    invite(w, null, allEmail, financeRole);
    String allId = userId(w, allEmail);
    String localEmail = "local@" + w.t() + ".test";
    invite(w, null, localEmail, financeRole);
    String localId = userId(w, localEmail);
    scope(w, null, localId, "LIMITED", List.of(w.a1()), null).andExpect(status().isOk());
    // Patron rolü LIMITED kullanıcıya verilemez; önce kapsam ALL yapılır.
    String patronRole = roleId(w, "PATRON");
    expect(
        sendJson(
            w.t(),
            null,
            put(USERS + "/" + localId),
            Map.of("fullName", "Yerel", "roleIds", List.of(patronRole), "enabled", true)),
        409,
        "OWNER_SCOPE_ALL");
    assertThat(
            body(send(w.t(), null, get(USERS + "/" + localId + "/branch-scope")))
                .get("scope")
                .asText())
        .isEqualTo("LIMITED");
    String pendingEmail = "pending@" + w.t() + ".test";
    sendJson(
            w.t(),
            null,
            post(USERS),
            Map.of("email", pendingEmail, "fullName", "Bekleyen", "roleIds", List.of(financeRole)))
        .andExpect(status().isCreated());
    String pendingId = userId(w, pendingEmail);

    // LIMITED yönetici ALL kullanıcıyı yönetemez.
    String token = w.managerToken();
    expect(scope(w, token, allId, "LIMITED", List.of(w.a1()), null), 403, "BRANCH_OUT_OF_SCOPE");
    expect(send(w.t(), token, get(USERS + "/" + allId)), 403, "BRANCH_OUT_OF_SCOPE");
    expect(
        send(w.t(), token, get(USERS + "/" + allId + "/branch-scope")), 403, "BRANCH_OUT_OF_SCOPE");
    expect(
        sendJson(
            w.t(),
            token,
            put(USERS + "/" + allId),
            Map.of("fullName", "Değişti", "roleIds", List.of(financeRole), "enabled", false)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(send(w.t(), token, delete(USERS + "/" + allId)), 403, "BRANCH_OUT_OF_SCOPE");
    expect(
        send(w.t(), token, post(USERS + "/" + pendingId + "/resend-invite")),
        403,
        "BRANCH_OUT_OF_SCOPE");

    // Kapsamındaki LIMITED kullanıcıyı yönetir; ALL veremez, dışarı iş yeri veremez.
    expect(scope(w, token, localId, "ALL", List.of(), null), 403, "BRANCH_OUT_OF_SCOPE");
    expect(
        scope(w, token, localId, "LIMITED", List.of(w.a1(), w.a2()), null),
        403,
        "BRANCH_OUT_OF_SCOPE");
    scope(w, token, localId, "LIMITED", List.of(w.a1()), w.a1()).andExpect(status().isOk());
    send(w.t(), token, get(USERS + "/" + localId)).andExpect(status().isOk());
    assertThat(
            body(send(w.t(), token, get(USERS + "/" + localId + "/branch-scope")))
                .get("defaultBranchId")
                .asText())
        .isEqualTo(w.a1());

    // Kullanıcı listesi: kendisi + kapsamındaki LIMITED kullanıcılar; rozet alanı.
    JsonNode users = body(send(w.t(), token, get(USERS).param("size", "50")));
    assertThat(users.get("content").findValuesAsText("email"))
        .containsExactlyInAnyOrder(w.managerEmail(), localEmail);
    assertThat(new HashSet<>(users.get("content").findValuesAsText("branchScope")))
        .containsOnly("LIMITED");
    JsonNode ownerView = body(send(w.t(), null, get(USERS).param("size", "50")));
    assertThat(ownerView.get("content").findValuesAsText("email"))
        .contains(ownerEmail(w.t()), allEmail, pendingEmail);

    // LIMITED yöneticinin davet ettiği kullanıcı aynı kapsamla başlar.
    String invitedEmail = "invited@" + w.t() + ".test";
    sendJson(
            w.t(),
            token,
            post(USERS),
            Map.of("email", invitedEmail, "fullName", "Davetli", "roleIds", List.of(financeRole)))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.branchScope").value("LIMITED"));
    JsonNode invited =
        body(send(w.t(), null, get(USERS + "/" + userId(w, invitedEmail) + "/branch-scope")));
    assertThat(texts(invited.get("branchIds"))).containsExactly(w.a1());
    assertThat(invited.get("defaultBranchId").asText()).isEqualTo(w.a1());
    // ALL patronun davet ettiği kullanıcı ALL'dır.
    assertThat(
            body(send(w.t(), null, get(USERS + "/" + allId + "/branch-scope")))
                .get("scope")
                .asText())
        .isEqualTo("ALL");
    // Tüm yetkileri taşıyan LIMITED kullanıcı patron davet edemez.
    Set<String> everything = new HashSet<>();
    for (Permission p : Permission.values()) {
      everything.add(p.name());
    }
    String fullRole =
        id(
            sendJson(
                w.t(),
                null,
                post("/api/v1/identity/roles"),
                Map.of(
                    "code",
                    "TAM_YETKI",
                    "name",
                    "Tam yetki",
                    "priority",
                    5,
                    "landingPath",
                    "/finance",
                    "permissions",
                    everything)));
    String fullEmail = "full@" + w.t() + ".test";
    String fullToken = invite(w, null, fullEmail, fullRole);
    scope(w, null, userId(w, fullEmail), "LIMITED", List.of(w.a1()), w.a1())
        .andExpect(status().isOk());
    expect(
        sendJson(
            w.t(),
            fullToken,
            post(USERS),
            Map.of(
                "email",
                "patron2@" + w.t() + ".test",
                "fullName",
                "Patron 2",
                "roleIds",
                List.of(patronRole))),
        409,
        "OWNER_SCOPE_ALL");
  }

  @Test
  void pasifIsYeriVeBildirimlerKapsamaUyar() throws Exception {
    World w = world("bsp");
    scope(w, null, w.managerId(), "LIMITED", List.of(w.a1()), w.a1()).andExpect(status().isOk());

    // Onaya gönderilen plan: A2 planı A1'e sınırlı onaycıya gitmez, A1 planı gider.
    String planA2 = plan(w, w.a2(), "222");
    send(w.t(), null, post(FINANCE + "/payment-plans/" + planA2 + "/submit"))
        .andExpect(status().isOk());
    String planA1 = plan(w, w.a1(), "111");
    send(w.t(), null, post(FINANCE + "/payment-plans/" + planA1 + "/submit"))
        .andExpect(status().isOk());
    awaitSubject(w.managerEmail(), "Onay bekleyen ödeme planı: T1 — 111,00 TRY");
    Thread.sleep(300);
    assertThat(sent(w.managerEmail()))
        .noneMatch(n -> n.subject().equals("Onay bekleyen ödeme planı: T1 — 222,00 TRY"));

    // Günlük özet LIMITED kullanıcıya gitmez; patrona gider. (Zamanlanmış koşuyla çakışmasın diye
    // yarının özeti.)
    int before = sent(w.managerEmail()).size();
    int ownerBefore = sent(ownerEmail(w.t())).size();
    TenantContext.set(w.t(), w.schema());
    int recipients;
    try {
      recipients = digest.sendForCurrentTenant(TODAY.plusDays(1));
    } finally {
      TenantContext.clear();
    }
    assertThat(recipients).isPositive();
    assertThat(sent(w.managerEmail())).hasSize(before);
    assertThat(sent(ownerEmail(w.t())).size()).isGreaterThan(ownerBefore);

    // A1 pasifleşir: onaylı planı ödenir, teslim edilmiş seferi faturalanıp kapatılır; aynı
    // iş yeriyle yeni ödeme 422.
    sendJson(
            w.t(),
            w.managerToken(),
            post(FINANCE + "/payment-plans/" + planA1 + "/approve"),
            Map.of())
        .andExpect(status().isOk());
    UUID shipment = deliveredShipment(w, w.a1(), "SV-P1");
    send(w.t(), null, post(ORG + "/branches/" + w.a1() + "/deactivate"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.active").value(false));
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/payment-plans/" + planA1 + "/pay"),
            Map.of("method", "CASH", "fundAccountId", w.cashA1(), "date", TODAY.toString()))
        .andExpect(status().isOk());
    expect(
        sendJson(
            w.t(), null, post(FINANCE + "/payments"), cash(w.supplier(), w.a1(), w.cashA1(), "5")),
        422,
        "BRANCH_INACTIVE");
    expect(
        sendJson(w.t(), null, post(FINANCE + "/payment-plans"), planBody(w, w.a1(), "5")),
        422,
        "BRANCH_INACTIVE");
    expect(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/funds"),
            Map.of(
                "code",
                "KASA-X",
                "name",
                "X",
                "kind",
                "CASH",
                "currency",
                "TRY",
                "branchId",
                w.a1())),
        422,
        "BRANCH_INACTIVE");
    sendJson(
            w.t(),
            null,
            post("/api/v1/shipment/shipments/" + shipment + "/invoice"),
            Map.of("invoiceDate", TODAY.toString(), "dueDate", TODAY.plusDays(30).toString()))
        .andExpect(status().isCreated());
    sendJson(
            w.t(),
            null,
            post("/api/v1/shipment/shipments/" + shipment + "/close"),
            Map.of("date", TODAY.toString(), "dueDate", TODAY.plusDays(30).toString()))
        .andExpect(status().isOk());

    // Pasif şirketin iş yeri: yeni kayıtta 422 COMPANY_INACTIVE.
    send(w.t(), null, post(ORG + "/companies/" + w.companyB() + "/deactivate"))
        .andExpect(status().is(409));
    send(w.t(), null, post(ORG + "/branches/" + w.b1() + "/deactivate")).andExpect(status().isOk());
    send(w.t(), null, post(ORG + "/companies/" + w.companyB() + "/deactivate"))
        .andExpect(status().isOk());
    jdbc.update(
        "update \"%s\".branch set active = true where id = ?".formatted(w.schema()),
        UUID.fromString(w.b1()));
    expect(
        sendJson(w.t(), null, post(FINANCE + "/payment-plans"), planBody(w, w.b1(), "5")),
        422,
        "COMPANY_INACTIVE");
    expect(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/payment-plans"),
            planBody(w, UUID.randomUUID().toString(), "5")),
        400,
        "BRANCH_NOT_FOUND");
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
    String companyB = id(sendJson(t, null, post(ORG + "/companies"), b));
    String a1 = branch(t, "A1", companyA);
    String a2 = branch(t, "A2", companyA);
    String b1 = branch(t, "B1", companyB);
    String cashA1 = fund(t, "KASA-A1", a1);
    String cashA2 = fund(t, "KASA-A2", a2);
    fund(t, "KASA-B1", b1);
    String customer = account(t, "M1", "CUSTOMER");
    String supplier = account(t, "T1", "SUPPLIER");

    // Yönetici rolü: FINANCE izinleri + kullanıcı yönetimi + onay.
    Set<String> permissions = new HashSet<>();
    for (JsonNode role : body(send(t, null, get("/api/v1/identity/roles")))) {
      if ("FINANCE".equals(role.get("code").asText())) {
        role.get("permissions").forEach(p -> permissions.add(p.asText()));
      }
    }
    permissions.addAll(List.of("USER_VIEW", "USER_MANAGE", "FINANCE_APPROVE", "BRANCH_MANAGE"));
    String managerRole =
        id(
            sendJson(
                t,
                null,
                post("/api/v1/identity/roles"),
                Map.of(
                    "code",
                    "SUBE_YONETICI",
                    "name",
                    "Şube yöneticisi",
                    "priority",
                    5,
                    "landingPath",
                    "/finance",
                    "permissions",
                    permissions)));
    String managerEmail = "manager@" + t + ".test";
    World draft =
        new World(
            t,
            schema,
            companyA,
            companyB,
            a1,
            a2,
            b1,
            cashA1,
            cashA2,
            customer,
            supplier,
            managerEmail,
            null,
            null);
    String managerToken = invite(draft, null, managerEmail, managerRole);
    return new World(
        t,
        schema,
        companyA,
        companyB,
        a1,
        a2,
        b1,
        cashA1,
        cashA2,
        customer,
        supplier,
        managerEmail,
        userId(draft, managerEmail),
        managerToken);
  }

  private String branch(String t, String code, String companyId) throws Exception {
    return id(
        sendJson(
            t,
            null,
            post(ORG + "/branches"),
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

  private String account(String t, String code, String type) throws Exception {
    return id(
        sendJson(
            t,
            null,
            post(FINANCE + "/accounts"),
            Map.of("code", code, "name", code, "type", type)));
  }

  /** Davet eder, daveti kabul ettirir ve token döner. */
  private String invite(World w, String token, String email, String roleId) throws Exception {
    sendJson(
            w.t(),
            token,
            post(USERS),
            Map.of("email", email, "fullName", "Test", "roleIds", List.of(roleId)))
        .andExpect(status().isCreated());
    return acceptInviteAndLogin(w.t(), email);
  }

  private String roleId(World w, String code) throws Exception {
    for (JsonNode role : body(send(w.t(), null, get("/api/v1/identity/roles")))) {
      if (code.equals(role.get("code").asText())) {
        return role.get("id").asText();
      }
    }
    throw new AssertionError(code);
  }

  private String userId(World w, String email) throws Exception {
    for (JsonNode user : body(send(w.t(), null, get(USERS).param("size", "100"))).get("content")) {
      if (email.equals(user.get("email").asText())) {
        return user.get("id").asText();
      }
    }
    throw new AssertionError(email);
  }

  private ResultActions scope(
      World w, String token, String userId, String scope, List<String> branches, String def)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("scope", scope);
    body.put("branchIds", branches);
    body.put("defaultBranchId", def);
    return sendJson(w.t(), token, put(USERS + "/" + userId + "/branch-scope"), body);
  }

  private String plan(World w, String branch, String amount) throws Exception {
    return id(sendJson(w.t(), null, post(FINANCE + "/payment-plans"), planBody(w, branch, amount)));
  }

  private static Map<String, Object> planBody(World w, String branch, String amount) {
    return Map.of(
        "accountId",
        w.supplier(),
        "branchId",
        branch,
        "money",
        money(amount),
        "dueDate",
        TODAY.plusDays(5).toString());
  }

  private static Map<String, Object> invoice(World w, String branch, String number) {
    Map<String, Object> body = new HashMap<>();
    body.put("accountId", w.supplier());
    body.put("branchId", branch);
    body.put("number", number);
    body.put("invoiceDate", TODAY.toString());
    body.put("dueDate", TODAY.plusDays(20).toString());
    body.put("net", money("100"));
    body.put("vat", money("20"));
    return body;
  }

  private static Map<String, Object> check(String account, String branch, String number) {
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
    body.put("money", money("30"));
    body.put("date", TODAY.toString());
    return body;
  }

  private static Map<String, Object> fundUpdate(String name, String branch) {
    return Map.of("name", name, "branchId", branch, "allowNegative", true);
  }

  /** Portföydeki çeki tedarikçiye ciro eden ödeme (tutar çekle aynı: 30). */
  private static Map<String, Object> endorse(String supplier, String branch, String instrument) {
    Map<String, Object> body = new HashMap<>();
    body.put("method", "CHECK");
    body.put("accountId", supplier);
    body.put("branchId", branch);
    body.put("instrumentId", instrument);
    body.put("money", money("30"));
    body.put("date", TODAY.toString());
    return body;
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

  private static Map<String, Object> money(String amount) {
    return Map.of("amount", amount, "currency", "TRY");
  }

  private UUID deliveredShipment(World w, String branch, String number) {
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
    return new SchemaRows(jdbc).insert(w.schema(), "shipment", values);
  }

  private BigDecimal balance(World w, String token, String account) throws Exception {
    for (JsonNode row :
        body(send(w.t(), token, get(FINANCE + "/accounts/" + account)).andExpect(status().isOk()))
            .get("balances")) {
      if ("TRY".equals(row.get("currency").asText())) {
        return row.get("balance").decimalValue();
      }
    }
    return BigDecimal.ZERO;
  }

  // --- istek yardımcıları

  private void created(World w, String path, Object body) throws Exception {
    sendJson(w.t(), null, post(path), body).andExpect(status().isCreated());
  }

  private JsonNode asManager(World w, MockHttpServletRequestBuilder request) throws Exception {
    return body(manager(w, request).andExpect(status().isOk()));
  }

  private ResultActions manager(World w, MockHttpServletRequestBuilder request) throws Exception {
    return send(w.t(), w.managerToken(), request);
  }

  private ResultActions managerSave(World w, MockHttpServletRequestBuilder request, Object body)
      throws Exception {
    return sendJson(w.t(), w.managerToken(), request, body);
  }

  private ResultActions managerSaveWithKey(
      World w, MockHttpServletRequestBuilder request, Object body, String key) throws Exception {
    return sendJson(w.t(), w.managerToken(), request.header("Idempotency-Key", key), body);
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

  private static List<String> texts(JsonNode array) {
    List<String> values = new ArrayList<>();
    array.forEach(value -> values.add(value.asText()));
    return values;
  }

  private static void expect(ResultActions result, int status, String code) throws Exception {
    result.andExpect(status().is(status)).andExpect(jsonPath("$.code").value(code));
  }

  private static List<Notice> sent(String email) {
    return SENT_NOTICES.stream().filter(n -> n.email().equals(email)).toList();
  }

  /** Anlık e-posta işlem kaydedildikten sonra arka planda gider. */
  private static void awaitSubject(String email, String subject) throws InterruptedException {
    for (int i = 0; i < 100; i++) {
      if (sent(email).stream().anyMatch(n -> n.subject().equals(subject))) {
        return;
      }
      Thread.sleep(50);
    }
    throw new AssertionError(email + " için e-posta gelmedi: " + subject + " — " + sent(email));
  }
}
