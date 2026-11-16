package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Çek koçanları (12.3_TASARIM §3.6, §6.2 B3): oluşturma, atlama, sınırlar, yaprak iptali/silme,
 * lookup, yetki, kiracı/şirket/LIMITED izolasyonu ve eşzamanlı çakışan aralık.
 */
class CheckBookIT extends InstrumentTestSupport {

  private static final String BOOKS = FINANCE + "/check-books";
  private static final String LEAVES = FINANCE + "/check-leaves";

  @Test
  void olusturmaAtlamaVeSinirlar() throws Exception {
    World w = world("cbk1");
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");

    JsonNode created =
        body(
            createBook(w, null, book(bank, "ZB-001", "1234567", "1234617", "0001", "1124"))
                .andExpect(status().isCreated()));
    assertThat(created.get("createdCount").asInt()).isEqualTo(51);
    assertThat(created.get("skippedNumbers")).isEmpty();
    JsonNode book = created.get("book");
    assertThat(book.get("leafCount").asInt()).isEqualTo(51);
    assertThat(book.get("unusedCount").asInt()).isEqualTo(51);
    assertThat(book.get("usedCount").asInt()).isZero();
    assertThat(book.get("branchId").asText()).isEqualTo(w.a1());
    assertThat(book.get("companyId").asText()).isEqualTo(w.companyA());
    assertThat(book.get("fundName").asText()).isEqualTo("BANKA-A1");
    assertThat(book.get("createdAt").isNull()).isFalse();
    String bookId = book.get("id").asText();
    assertThat(audits(w, "CHECK_BOOK_CREATED", "CHECK_BOOK:" + bookId)).isEqualTo(1);

    JsonNode page =
        body(
            send(w.t(), null, get(LEAVES).param("checkBookId", bookId)).andExpect(status().isOk()));
    assertThat(page.get("totalElements").asLong()).isEqualTo(51);
    JsonNode first = page.get("content").get(0);
    assertThat(first.get("leafNo").asInt()).isEqualTo(1);
    assertThat(first.get("number").asText()).isEqualTo("1234567");
    assertThat(first.get("micrCode").asText()).isEqualTo("c0001112401234567");
    assertThat(first.get("status").asText()).isEqualTo("UNUSED");
    assertThat(first.get("checkBookSerial").asText()).isEqualTo("ZB-001");
    assertThat(first.get("instrumentId").isNull()).isTrue();

    // Baştaki sıfırlar korunur; MICR'siz koçan.
    JsonNode zeros =
        body(
            createBook(w, null, book(bank, "ZB-002", "0000001", "0000003", null, null))
                .andExpect(status().isCreated()));
    String zerosId = zeros.get("book").get("id").asText();
    JsonNode zeroLeaves = body(send(w.t(), null, get(LEAVES).param("checkBookId", zerosId)));
    assertThat(texts(zeroLeaves.get("content"), "number"))
        .containsExactly("0000001", "0000002", "0000003");
    assertThat(zeroLeaves.get("content").get(0).get("micrCode").isNull()).isTrue();

    // Çakışan aralık: kayıtlı numaralar atlanır.
    JsonNode overlap =
        body(
            createBook(w, null, book(bank, "ZB-003", "1234610", "1234620", null, null))
                .andExpect(status().isCreated()));
    assertThat(overlap.get("createdCount").asInt()).isEqualTo(3);
    assertThat(overlap.get("skippedNumbers")).hasSize(8);
    assertThat(overlap.get("book").get("leafCount").asInt()).isEqualTo(3);
    expect(
        createBook(w, null, book(bank, "ZB-004", "1234600", "1234620", null, null)),
        409,
        "CHECK_BOOK_EMPTY");

    // Sınırlar ve biçim hataları.
    expect(
        createBook(w, null, book(bank, "ZB-001", "5000001", "5000002", null, null)),
        409,
        "CHECK_BOOK_SERIAL_TAKEN");
    expect(
        createBook(w, null, book(bank, "ZB-005", "5000001", "5001001", null, null)),
        400,
        "CHECK_BOOK_RANGE_INVALID");
    expect(
        createBook(w, null, book(bank, "ZB-005", "5000002", "5000001", null, null)),
        400,
        "CHECK_BOOK_RANGE_INVALID");
    expect(
        createBook(w, null, book(bank, "ZB-005", "123", "5000001", null, null)),
        400,
        "CHECK_BOOK_INVALID");
    createBook(w, null, book(bank, "ZB-005", "5000001", "5000002", "0001", null))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("CHECK_BOOK_INVALID"))
        .andExpect(jsonPath("$.details[0]").value("field=branchCode"));
    expect(
        createBook(w, null, book(bank, "ZB-005", "5000001", "5000002", "01", "1124")),
        400,
        "CHECK_BOOK_INVALID");
    expect(
        createBook(w, null, book(w.fundA1(), "ZB-005", "5000001", "5000002", null, null)),
        400,
        "FUND_KIND_MISMATCH");
    // 1000 yaprak sınırda kabul.
    assertThat(
            body(createBook(w, null, book(bank, "ZB-006", "6000000", "6000999", null, null))
                    .andExpect(status().isCreated()))
                .get("createdCount")
                .asInt())
        .isEqualTo(1000);

    // Lookup: önek, en çok 5, baştaki sıfırlar.
    JsonNode found = body(send(w.t(), null, get(LEAVES + "/lookup").param("number", "12345")));
    assertThat(found).hasSize(5);
    assertThat(found.get(0).get("number").asText()).isEqualTo("1234567");
    assertThat(
            body(send(w.t(), null, get(LEAVES + "/lookup").param("number", "0000002")))
                .get(0)
                .get("number")
                .asText())
        .isEqualTo("0000002");
    assertThat(
            body(
                send(
                    w.t(),
                    null,
                    get(LEAVES + "/lookup")
                        .param("number", "12345")
                        .param("fundAccountId", UUID.randomUUID().toString()))))
        .isEmpty();
    expect(
        send(w.t(), null, get(LEAVES + "/lookup").param("number", "12a")),
        400,
        "CHECK_NUMBER_INVALID");
    expect(
        send(w.t(), null, get(LEAVES + "/lookup").param("number", "12345678")),
        400,
        "CHECK_NUMBER_INVALID");

    // Liste süzgeçleri ve sayfa sınırı.
    assertThat(
            body(send(w.t(), null, get(LEAVES).param("serial", "zb-00").param("size", "10")))
                .get("totalElements")
                .asLong())
        .isEqualTo(1057);
    expect(send(w.t(), null, get(LEAVES).param("size", "1001")), 400, "PAGE_SIZE_INVALID");
    assertThat(body(send(w.t(), null, get(BOOKS).param("fundAccountId", bank)))).hasSize(4);
  }

  @Test
  void yaprakIptalVeSilme() throws Exception {
    World w = world("cbk2");
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    String bookId =
        body(createBook(w, null, book(bank, "S-1", "2000001", "2000005", null, null))
                .andExpect(status().isCreated()))
            .get("book")
            .get("id")
            .asText();
    List<String> ids =
        texts(
            body(send(w.t(), null, get(LEAVES).param("checkBookId", bookId))).get("content"), "id");

    // UNUSED silinir; tekrar 404.
    send(w.t(), null, delete(LEAVES + "/" + ids.get(0))).andExpect(status().isNoContent());
    assertThat(audits(w, "CHECK_LEAF_DELETED", "CHECK_LEAF:" + ids.get(0))).isEqualTo(1);
    expect(send(w.t(), null, delete(LEAVES + "/" + ids.get(0))), 404, "CHECK_LEAF_NOT_FOUND");
    JsonNode bookRow = body(send(w.t(), null, get(BOOKS))).get(0);
    assertThat(bookRow.get("leafCount").asInt()).isEqualTo(5);
    assertThat(bookRow.get("unusedCount").asInt()).isEqualTo(4);

    // UNUSED iptal edilir (gerekçeyle), tekrar idempotent; VOID silinemez.
    JsonNode voided = body(voidLeaf(w, null, ids.get(1), "Yırtıldı").andExpect(status().isOk()));
    assertThat(voided.get("status").asText()).isEqualTo("VOID");
    assertThat(voided.get("voidReason").asText()).isEqualTo("Yırtıldı");
    voidLeaf(w, null, ids.get(1), "başka")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.voidReason").value("Yırtıldı"));
    send(w.t(), null, post(LEAVES + "/" + ids.get(1) + "/void")).andExpect(status().isOk());
    assertThat(audits(w, "CHECK_LEAF_VOIDED", "CHECK_LEAF:" + ids.get(1))).isEqualTo(1);
    expect(send(w.t(), null, delete(LEAVES + "/" + ids.get(1))), 409, "CHECK_LEAF_NOT_DELETABLE");
    expect(voidLeaf(w, null, UUID.randomUUID().toString(), null), 404, "CHECK_LEAF_NOT_FOUND");

    // Etkin çekteki USED yaprak iptal edilemez, silinemez; çek iptal olunca iptal edilir.
    Map<String, Object> own = instrumentData("CHECK", "2000003");
    own.put("fundAccountId", bank);
    own.put("checkLeafId", ids.get(2));
    String instrument = payInstrument(w, supplier, w.a1(), "5", own).get("instrumentId").asText();
    JsonNode used = body(send(w.t(), null, get(LEAVES + "/lookup").param("number", "2000003")));
    assertThat(used.get(0).get("status").asText()).isEqualTo("USED");
    assertThat(used.get(0).get("instrumentId").asText()).isEqualTo(instrument);
    assertThat(used.get(0).get("instrumentStatus").asText()).isEqualTo("ISSUED");
    expect(voidLeaf(w, null, ids.get(2), null), 409, "CHECK_LEAF_IN_USE");
    expect(send(w.t(), null, delete(LEAVES + "/" + ids.get(2))), 409, "CHECK_LEAF_NOT_DELETABLE");
    update(w, "update %s.instrument set status = 'CANCELLED' where id = ?::uuid", instrument);
    voidLeaf(w, null, ids.get(2), null)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("VOID"))
        .andExpect(jsonPath("$.instrumentStatus").value("CANCELLED"));

    JsonNode counts = body(send(w.t(), null, get(BOOKS))).get(0);
    assertThat(counts.get("unusedCount").asInt()).isEqualTo(2);
    assertThat(counts.get("voidCount").asInt()).isEqualTo(2);
    assertThat(
            body(send(w.t(), null, get(LEAVES).param("status", "VOID")))
                .get("totalElements")
                .asLong())
        .isEqualTo(2);
  }

  @Test
  void yetkiVeIzolasyon() throws Exception {
    World w = world("cbk3");
    String bankA1 = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    String bankA2 = bankFund(w, "BANKA-A2", w.a2(), "TRY");
    String bankB1 = bankFund(w, "BANKA-B1", w.b1(), "TRY");
    createBook(w, null, book(bankA1, "A1-1", "1000001", "1000002", null, null))
        .andExpect(status().isCreated());
    createBook(w, null, book(bankA2, "A2-1", "1000001", "1000002", null, null))
        .andExpect(status().isCreated());
    createBook(w, null, book(bankB1, "B1-1", "1000001", "1000002", null, null))
        .andExpect(status().isCreated());
    String leafB1 =
        body(send(w.t(), null, get(LEAVES).param("fundAccountId", bankB1)))
            .get("content")
            .get(0)
            .get("id")
            .asText();

    // Şirket süzgeci başka şirketin koçanını göstermez.
    assertThat(
            texts(body(send(w.t(), null, get(BOOKS).param("companyId", w.companyA()))), "serialNo"))
        .containsExactlyInAnyOrder("A1-1", "A2-1");
    assertThat(
            body(send(w.t(), null, get(LEAVES).param("companyId", w.companyB())))
                .get("totalElements")
                .asLong())
        .isEqualTo(2);

    // VIEW kullanıcı okur, yazamaz.
    String viewer = userWithRole(w, "muhasebe", "ACCOUNTING");
    send(w.t(), viewer, get(BOOKS)).andExpect(status().isOk());
    send(w.t(), viewer, get(LEAVES + "/lookup").param("number", "100")).andExpect(status().isOk());
    createBook(w, viewer, book(bankA1, "A1-2", "1000003", "1000004", null, null))
        .andExpect(status().isForbidden());
    voidLeaf(w, viewer, leafB1, null).andExpect(status().isForbidden());
    send(w.t(), viewer, delete(LEAVES + "/" + leafB1)).andExpect(status().isForbidden());

    // LIMITED (A1): yalnız kendi iş yerinin koçanları; kapsam dışı fon ve yaprak 403.
    String limited = limitedUser(w, "sinirli", "FINANCE", List.of(w.a1()));
    assertThat(texts(body(send(w.t(), limited, get(BOOKS))), "serialNo")).containsExactly("A1-1");
    assertThat(
            body(send(w.t(), limited, get(LEAVES).param("fundAccountId", bankB1)))
                .get("totalElements")
                .asLong())
        .isZero();
    assertThat(body(send(w.t(), limited, get(LEAVES + "/lookup").param("number", "100"))))
        .hasSize(2);
    expect(
        createBook(w, limited, book(bankB1, "B1-2", "1000003", "1000004", null, null)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(voidLeaf(w, limited, leafB1, null), 403, "BRANCH_OUT_OF_SCOPE");
    expect(send(w.t(), limited, delete(LEAVES + "/" + leafB1)), 403, "BRANCH_OUT_OF_SCOPE");
    createBook(w, limited, book(bankA1, "A1-2", "1000003", "1000004", null, null))
        .andExpect(status().isCreated());

    // Kiracı izolasyonu: başka kiracıda koçan görünmez, yaprak bulunamaz.
    World other = world("cbk3b");
    assertThat(body(send(other.t(), null, get(BOOKS)))).isEmpty();
    expect(voidLeaf(other, null, leafB1, null), 404, "CHECK_LEAF_NOT_FOUND");
  }

  @Test
  void eszamanliCakisanAralik() throws Exception {
    World w = world("cbk4");
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    List<MvcResult> race =
        concurrently(
            () ->
                createBook(w, null, book(bank, "R-1", "3000001", "3000010", null, null))
                    .andReturn(),
            () ->
                createBook(w, null, book(bank, "R-2", "3000006", "3000015", null, null))
                    .andReturn());
    assertThat(race).extracting(r -> r.getResponse().getStatus()).containsOnly(201);
    int created = 0;
    int skipped = 0;
    for (MvcResult result : race) {
      JsonNode node = json.readTree(result.getResponse().getContentAsString());
      created += node.get("createdCount").asInt();
      skipped += node.get("skippedNumbers").size();
    }
    assertThat(created).isEqualTo(15);
    assertThat(skipped).isEqualTo(5);
    assertThat(count(w, "select count(*) from %s.check_leaf where fund_account_id = ?::uuid", bank))
        .isEqualTo(15);
  }

  // --- yardımcılar

  private static Map<String, Object> book(
      String fund, String serial, String start, String end, String bankCode, String branchCode) {
    Map<String, Object> body = new HashMap<>();
    body.put("fundAccountId", fund);
    body.put("serialNo", serial);
    body.put("startNumber", start);
    body.put("endNumber", end);
    body.put("bankCode", bankCode);
    body.put("branchCode", branchCode);
    return body;
  }

  private ResultActions createBook(World w, String token, Map<String, Object> body)
      throws Exception {
    return sendJson(w.t(), token, post(BOOKS), body);
  }

  private ResultActions voidLeaf(World w, String token, String leaf, String reason)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("reason", reason);
    return sendJson(w.t(), token, post(LEAVES + "/" + leaf + "/void"), body);
  }

  private static List<String> texts(JsonNode array, String field) {
    return java.util.stream.StreamSupport.stream(array.spliterator(), false)
        .map(n -> n.get(field).asText())
        .toList();
  }
}
