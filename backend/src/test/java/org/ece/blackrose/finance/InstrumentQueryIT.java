package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Çek/senet okuma yolu (12.3_TASARIM §3.7, §3.9, §6.2 {@code InstrumentQueryIT}): liste süzgeçleri,
 * ad alanları, personel maskesi, türetmeler, detay, numara ön denetimi, yazım yanıtları ve çek
 * belgeleri.
 */
class InstrumentQueryIT extends InstrumentTestSupport {

  @Test
  void listeSuzgecleriVeTuretmeler() throws Exception {
    World w = world("iq1");
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    UUID employee = account(w, AccountType.EMPLOYEE, null);

    Map<String, Object> first = instrumentData("CHECK", "7000001");
    first.put("drawerName", "Ayşe Keşideci");
    first.put("description", "Ön açıklama");
    first.put("issueDate", TODAY.toString());
    first.put("bankBranch", "Merkez");
    JsonNode c1 = collectInstrument(w, customer, w.a1(), "100", first);
    String check1 = c1.get("instrumentId").asText();
    Map<String, Object> second = instrumentData("CHECK", "7000002");
    second.put("dueDate", TODAY.plusDays(60).toString());
    String check2 =
        collectInstrument(w, customer, w.a2(), "50", second).get("instrumentId").asText();
    Map<String, Object> bond = instrumentData("NOTE", "SN-9");
    bond.put("noteType", "BOND");
    String note = collectInstrument(w, customer, w.a1(), "70", bond).get("instrumentId").asText();
    UUID leaf = leaves(w, bank, w.a1(), "7100001").get(0);
    Map<String, Object> own = instrumentData("CHECK", "7100001");
    own.put("fundAccountId", bank);
    own.put("checkLeafId", leaf.toString());
    String issued = payInstrument(w, supplier, w.a1(), "20", own).get("instrumentId").asText();
    String employeeCheck =
        collectInstrument(w, employee, w.a1(), "10", instrumentData("CHECK", "7000003"))
            .get("instrumentId")
            .asText();
    String otherCompany =
        collectInstrument(w, customer, w.b1(), "30", instrumentData("CHECK", "7000004"))
            .get("instrumentId")
            .asText();

    // Süzgeçler.
    assertThat(ids(list(w, null))).hasSize(6);
    assertThat(ids(list(w, null, "companyId", w.companyA())))
        .containsExactlyInAnyOrder(check1, check2, note, issued, employeeCheck);
    assertThat(ids(list(w, null, "kind", "NOTE"))).containsExactly(note);
    assertThat(ids(list(w, null, "noteType", "BOND"))).containsExactly(note);
    assertThat(ids(list(w, null, "direction", "ISSUED"))).containsExactly(issued);
    assertThat(ids(list(w, null, "status", "ISSUED", "status", "PORTFOLIO"))).hasSize(6);
    assertThat(ids(list(w, null, "dueFrom", TODAY.plusDays(45).toString())))
        .containsExactly(check2);
    assertThat(ids(list(w, null, "dueTo", TODAY.plusDays(45).toString()))).hasSize(5);
    assertThat(ids(list(w, null, "endorsable", "true", "companyId", w.companyA())))
        .containsExactlyInAnyOrder(check1, check2, employeeCheck);
    assertThat(ids(list(w, null, "q", "keşideci"))).containsExactly(check1);
    assertThat(ids(list(w, null, "q", "7000002"))).containsExactly(check2);
    assertThat(ids(list(w, null, "accountId", customer.toString())))
        .containsExactlyInAnyOrder(check1, check2, note, otherCompany);
    assertThat(ids(list(w, null, "branchIds", w.a2()))).containsExactly(check2);
    // Sıra: vade, numara.
    assertThat(ids(list(w, null, "companyId", w.companyA())).get(4)).isEqualTo(check2);
    expect(send(w.t(), null, get(INSTRUMENTS).param("size", "501")), 400, "PAGE_SIZE_INVALID");
    expect(send(w.t(), null, get(INSTRUMENTS).param("q", "x".repeat(101))), 400, "QUERY_TOO_LONG");
    expect(
        send(
            w.t(),
            null,
            get(INSTRUMENTS)
                .param("dueFrom", TODAY.plusDays(2).toString())
                .param("dueTo", TODAY.toString())),
        400,
        "DATE_RANGE_INVALID");

    // Koçan süzgeci ve koçan alanları.
    String book =
        (String)
            row(w, "select check_book_id::text as b from %s.check_leaf where id = ?", leaf)
                .get("b");
    JsonNode own1 = list(w, null, "checkBookId", book).get("content").get(0);
    assertThat(own1.get("id").asText()).isEqualTo(issued);
    assertThat(own1.get("leafNo").asInt()).isEqualTo(1);
    assertThat(own1.get("checkBookSerial").asText()).startsWith("SR-");
    assertThat(own1.get("fundName").asText()).isEqualTo("BANKA-A1");
    assertThat(own1.get("fundKind").asText()).isEqualTo("BANK");
    assertThat(texts(own1.get("allowedTransitions"))).containsExactlyInAnyOrder("PAID", "BOUNCED");

    // Ad alanları ve türetmeler.
    JsonNode row1 = byId(list(w, null)).get(check1);
    assertThat(row1.get("accountName").asText()).startsWith("Cari ");
    assertThat(row1.get("accountType").asText()).isEqualTo("CUSTOMER");
    assertThat(row1.get("drawerName").asText()).isEqualTo("Ayşe Keşideci");
    assertThat(row1.get("description").asText()).isEqualTo("Ön açıklama");
    assertThat(row1.get("bankBranch").asText()).isEqualTo("Merkez");
    assertThat(row1.get("issueDate").asText()).isEqualTo(TODAY.toString());
    assertThat(row1.get("companyName").isNull()).isFalse();
    assertThat(row1.get("branchName").isNull()).isFalse();
    assertThat(row1.get("employeeMasked").asBoolean()).isFalse();
    assertThat(row1.get("originSettlementId").asText()).isEqualTo(c1.get("id").asText());
    assertThat(row1.get("originSettlementStatus").asText()).isEqualTo("POSTED");
    assertThat(row1.get("movementCount").asInt()).isEqualTo((int) movementCount(w, check1));
    assertThat(row1.get("lastMovementDate").asText()).isEqualTo(TODAY.toString());
    assertThat(row1.get("collateral").asBoolean()).isFalse();
    assertThat(texts(row1.get("allowedTransitions")))
        .containsExactlyInAnyOrder("AT_BANK", "COLLECTED", "COLLECTED_TO_CASH", "RETURNED");
    assertThat(texts(byId(list(w, null)).get(note).get("allowedTransitions")))
        .contains("COLLATERAL", "PROTESTED");

    // Yazım yanıtları liste satırıdır; hareket fon adını taşır.
    JsonNode atBank = body(transition(w, null, check1, "AT_BANK", bank).andExpect(status().isOk()));
    assertThat(atBank.get("status").asText()).isEqualTo("AT_BANK");
    assertThat(atBank.get("fundName").asText()).isEqualTo("BANKA-A1");
    assertThat(texts(atBank.get("allowedTransitions"))).contains("PORTFOLIO", "BOUNCED");
    JsonNode moves = body(movements(w, null, check1).andExpect(status().isOk()));
    JsonNode last = moves.get(moves.size() - 1);
    assertThat(last.get("toStatus").asText()).isEqualTo("AT_BANK");
    assertThat(last.get("fundAccountId").asText()).isEqualTo(bank);
    assertThat(last.get("fundName").asText()).isEqualTo("BANKA-A1");
    JsonNode patched =
        body(
            patchInstrument(w, null, check2, Map.of("description", "Yeni"))
                .andExpect(status().isOk()));
    assertThat(patched.get("description").asText()).isEqualTo("Yeni");
    JsonNode custody = body(moveCustody(w, null, check2, w.fundA2()).andExpect(status().isOk()));
    assertThat(custody.get("custodyFundName").asText()).isEqualTo("KASA-A2");

    // Ciro: ciro edilen cari adı; köken kayıt tahsilat olarak kalır.
    String endorsement = id(pay(w, null, endorseBody(supplier, w.a2(), "50", check2), null));
    JsonNode endorsed = byId(list(w, null)).get(check2);
    assertThat(endorsed.get("status").asText()).isEqualTo("ENDORSED");
    assertThat(endorsed.get("endorsedAccountId").asText()).isEqualTo(supplier.toString());
    assertThat(endorsed.get("endorsedAccountName").asText()).startsWith("Cari ");
    assertThat(endorsed.get("originSettlementId").asText()).isNotEqualTo(endorsement);

    // Detay.
    JsonNode detail = body(send(w.t(), null, get(INSTRUMENTS + "/" + check1)));
    assertThat(detail.get("item").get("id").asText()).isEqualTo(check1);
    assertThat(detail.get("movements").size()).isEqualTo(moves.size());
    expect(
        send(w.t(), null, get(INSTRUMENTS + "/" + UUID.randomUUID())), 404, "INSTRUMENT_NOT_FOUND");

    // Personel maskesi: liste satırı görünür, alanlar boş; tekil uçlar 404.
    String finance = userWithRole(w, "finans", "FINANCE");
    JsonNode masked = byId(list(w, finance)).get(employeeCheck);
    assertThat(masked.get("employeeMasked").asBoolean()).isTrue();
    assertThat(masked.get("accountId").isNull()).isTrue();
    assertThat(masked.get("accountName").isNull()).isTrue();
    assertThat(masked.get("drawerName").isNull()).isTrue();
    assertThat(masked.get("allowedTransitions")).isEmpty();
    assertThat(byId(list(w, null)).get(employeeCheck).get("accountName").isNull()).isFalse();
    expect(
        send(w.t(), finance, get(INSTRUMENTS + "/" + employeeCheck)), 404, "INSTRUMENT_NOT_FOUND");
    expect(
        send(w.t(), finance, get(INSTRUMENTS).param("accountId", employee.toString())),
        404,
        "ACCOUNT_NOT_FOUND");

    // Kapsam: LIMITED (A2) kullanıcı A1 çekinde 403; açıkça istenen kapsam dışı iş yeri 403.
    String limited = limitedUser(w, "sinirli", "FINANCE", List.of(w.a2()));
    send(w.t(), limited, get(INSTRUMENTS + "/" + check1)).andExpect(status().isForbidden());
    assertThat(ids(list(w, limited))).containsExactly(check2);
    send(w.t(), limited, get(INSTRUMENTS).param("branchIds", w.a1()))
        .andExpect(status().isForbidden());

    // Kiracı izolasyonu.
    World other = world("iq1b");
    expect(send(other.t(), null, get(INSTRUMENTS + "/" + check1)), 404, "INSTRUMENT_NOT_FOUND");
    assertThat(ids(list(other, null))).isEmpty();

    // Numara ön denetimi.
    JsonNode taken = numberCheck(w, null, w.companyA(), "RECEIVED", "7000001", null);
    assertThat(taken.get("valid").asBoolean()).isTrue();
    assertThat(taken.get("available").asBoolean()).isFalse();
    assertThat(taken.get("conflictId").asText()).isEqualTo(check1);
    assertThat(taken.get("conflictStatus").asText()).isEqualTo("AT_BANK");
    assertThat(taken.get("conflictAccountName").asText()).startsWith("Cari ");
    assertThat(
            numberCheck(w, null, w.companyA(), "RECEIVED", "7000001", check1)
                .get("available")
                .asBoolean())
        .isTrue();
    assertThat(
            numberCheck(w, null, w.companyB(), "RECEIVED", "7000001", null)
                .get("available")
                .asBoolean())
        .isTrue();
    JsonNode invalid = numberCheck(w, null, w.companyA(), "RECEIVED", "123", null);
    assertThat(invalid.get("valid").asBoolean()).isFalse();
    assertThat(invalid.get("available").asBoolean()).isFalse();
    JsonNode hidden = numberCheck(w, finance, w.companyA(), "RECEIVED", "7000003", null);
    assertThat(hidden.get("available").asBoolean()).isFalse();
    assertThat(hidden.get("conflictAccountName").isNull()).isTrue();
    JsonNode outOfScope = numberCheck(w, limited, w.companyA(), "RECEIVED", "7000001", null);
    assertThat(outOfScope.get("conflictId").asText()).isEqualTo(check1);
    assertThat(outOfScope.get("conflictAccountName").isNull()).isTrue();
    expect(
        send(
            w.t(),
            null,
            get(INSTRUMENTS + "/check-number")
                .param("direction", "RECEIVED")
                .param("number", "7000001")),
        400,
        "COMPANY_REQUIRED");
  }

  @Test
  void cekBelgeleri() throws Exception {
    World w = world("iq2");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    String check =
        collectInstrument(w, customer, w.a1(), "10", instrumentData("CHECK", "8000001"))
            .get("instrumentId")
            .asText();
    String employeeCheck =
        collectInstrument(w, employee, w.a1(), "10", instrumentData("CHECK", "8000002"))
            .get("instrumentId")
            .asText();
    byte[] content = "çek görüntüsü".getBytes(StandardCharsets.UTF_8);

    JsonNode uploaded =
        body(upload(w, null, check, "cek.pdf", content).andExpect(status().isCreated()));
    String file = uploaded.get("id").asText();
    assertThat(body(files(w, null, check).andExpect(status().isOk())).size()).isEqualTo(1);
    send(w.t(), null, get("/api/v1/files/" + file + "/content")).andExpect(status().isOk());

    // Yalnız FINANCE_VIEW: listeler, yükleyemez.
    String viewer = userWithRole(w, "muhasebe", "ACCOUNTING");
    files(w, viewer, check).andExpect(status().isOk());
    upload(w, viewer, check, "x.pdf", content).andExpect(status().isForbidden());

    // Kapsam dışı 403; personel carili çek izinsiz kullanıcıya 404.
    String limited = limitedUser(w, "sinirli", "FINANCE", List.of(w.a2()));
    files(w, limited, check).andExpect(status().isForbidden());
    upload(w, limited, check, "x.pdf", content).andExpect(status().isForbidden());
    String finance = userWithRole(w, "finans", "FINANCE");
    expect(upload(w, finance, employeeCheck, "x.pdf", content), 404, "INSTRUMENT_NOT_FOUND");
    expect(files(w, finance, employeeCheck), 404, "INSTRUMENT_NOT_FOUND");
    upload(w, null, employeeCheck, "y.pdf", content).andExpect(status().isCreated());

    // Olmayan çek 404; silme yükleme izniyle.
    upload(w, null, UUID.randomUUID().toString(), "x.pdf", content)
        .andExpect(status().isNotFound());
    send(w.t(), finance, delete("/api/v1/files/" + file)).andExpect(status().isNoContent());
  }

  private ResultActions upload(World w, String token, String owner, String name, byte[] content)
      throws Exception {
    return send(
        w.t(),
        token,
        multipart("/api/v1/files")
            .file(new MockMultipartFile("file", name, "application/octet-stream", content))
            .param("ownerType", "INSTRUMENT")
            .param("ownerId", owner));
  }

  private ResultActions files(World w, String token, String owner) throws Exception {
    return send(
        w.t(),
        token,
        get("/api/v1/files").param("ownerType", "INSTRUMENT").param("ownerId", owner));
  }

  private JsonNode numberCheck(
      World w, String token, String company, String direction, String number, String exclude)
      throws Exception {
    MockHttpServletRequestBuilder request =
        get(INSTRUMENTS + "/check-number")
            .param("companyId", company)
            .param("direction", direction)
            .param("number", number)
            .param("bankName", "Test Bankası");
    if (exclude != null) {
      request.param("excludeId", exclude);
    }
    return body(send(w.t(), token, request).andExpect(status().isOk()));
  }

  private JsonNode list(World w, String token, String... params) throws Exception {
    MockHttpServletRequestBuilder request = get(INSTRUMENTS).param("size", "500");
    for (int i = 0; i < params.length; i += 2) {
      request.param(params[i], params[i + 1]);
    }
    return body(send(w.t(), token, request).andExpect(status().isOk()));
  }

  private static List<String> ids(JsonNode page) {
    return page.get("content").findValuesAsText("id");
  }

  private static Map<String, JsonNode> byId(JsonNode page) {
    Map<String, JsonNode> rows = new HashMap<>();
    page.get("content").forEach(row -> rows.put(row.get("id").asText(), row));
    return rows;
  }
}
