package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.junit.jupiter.api.Test;

/** Cari banka hesapları: IBAN doğrulama, tekillik, şifreleme, maskeleme, kapsam (12.1 §6.2 B2). */
class AccountBankAccountIT extends AccountTestSupport {

  private static final String IBAN = "TR330006100519786457841326";
  private static final String IBAN_RAW = "tr33 0006 1005 1978 6457 8413 26";
  private static final String IBAN_DE = "DE89370400440532013000";

  @Test
  void ibanDogrulamaTekillikVeMaskeleme() throws Exception {
    World w = world("bak");
    UUID first = account(w, AccountType.SUPPLIER, null);
    UUID second = account(w, AccountType.SUPPLIER, null);

    JsonNode created =
        body(createBank(w, null, first, bank(IBAN_RAW, null)).andExpect(status().isCreated()));
    String bankId = created.get("id").asText();
    assertThat(created.get("ibanMasked").asText()).isEqualTo("TR33 **** 1326");
    assertThat(created.get("holderName").asText()).startsWith("Cari C");
    assertThat(created.get("accountKind").asText()).isEqualTo("DEMAND");

    // Listede IBAN açık değil; DB'de şifreli, hash 64 hex.
    JsonNode listed =
        body(
            send(w.t(), null, get(FINANCE + "/accounts/" + first + "/bank-accounts"))
                .andExpect(status().isOk()));
    assertThat(listed).hasSize(1);
    assertThat(listed.get(0).get("iban").isNull()).isTrue();
    assertThat(listed.get(0).get("ibanMasked").asText()).isEqualTo("TR33 **** 1326");
    Map<String, Object> row =
        jdbc.queryForMap(
            "select iban_enc, iban_hash from \"%s\".account_bank_account where id = ?"
                .formatted(w.schema()),
            UUID.fromString(bankId));
    assertThat((String) row.get("iban_enc")).doesNotContain(IBAN).isNotBlank();
    assertThat((String) row.get("iban_hash")).matches("[0-9a-f]{64}");

    // Detay: MANAGE sahibine tam IBAN, muhasebeye null.
    String sup = userWithRole(w, "super", "FINANCE_SUPER");
    String accounting = userWithRole(w, "muhasebe", "ACCOUNTING");
    assertThat(detail(w, sup, bankId).get("iban").asText()).isEqualTo(IBAN);
    assertThat(detail(w, accounting, bankId).get("iban").isNull()).isTrue();

    // Doğrulama.
    expect(
        createBank(w, null, second, bank("TR330006100519786457841327", null)), 422, "IBAN_INVALID");
    expect(
        createBank(w, null, second, bank("TR3300061005197864578413", null)), 422, "IBAN_INVALID");
    expect(createBank(w, null, second, bank(null, null)), 422, "BANK_ACCOUNT_IDENTIFIER_REQUIRED");

    // Tekillik: başka cariye eklemede ve güncellemede 409; yanıtta çakışan kart bilgisi yok.
    JsonNode taken =
        body(createBank(w, null, second, bank(IBAN, null)).andExpect(status().isConflict()));
    assertThat(taken.get("code").asText()).isEqualTo("IBAN_TAKEN");
    assertThat(taken.get("details")).isEmpty();
    assertThat(taken.toString()).doesNotContain(first.toString(), "Cari C");
    String secondBank = id(createBank(w, null, second, bank(IBAN_DE, null)));
    expect(
        sendJson(w.t(), null, put(FINANCE + "/bank-accounts/" + secondBank), bank(IBAN, null)),
        409,
        "IBAN_TAKEN");

    // Eski hesap pasifken aynı IBAN yeni kartta eklenir; eskisini aktifleştirmek 409.
    sendJson(
            w.t(),
            null,
            patch(FINANCE + "/bank-accounts/" + bankId + "/active"),
            Map.of("active", false))
        .andExpect(status().isOk());
    createBank(w, null, second, bank(IBAN, null)).andExpect(status().isCreated());
    expect(
        sendJson(
            w.t(),
            null,
            patch(FINANCE + "/bank-accounts/" + bankId + "/active"),
            Map.of("active", true)),
        409,
        "IBAN_TAKEN");
    assertThat(
            body(send(
                        w.t(),
                        null,
                        get(FINANCE + "/accounts/" + first + "/bank-accounts")
                            .param("includeInactive", "true"))
                    .andExpect(status().isOk()))
                .get(0)
                .get("active")
                .asBoolean())
        .isFalse();

    // Yalnız hesap no ile kayıt; maskeli.
    JsonNode numberOnly =
        body(createBank(w, null, first, bank(null, "12345678")).andExpect(status().isCreated()));
    assertThat(numberOnly.get("accountNumberMasked").asText()).isEqualTo("****5678");
    assertThat(detail(w, sup, numberOnly.get("id").asText()).get("accountNumber").asText())
        .isEqualTo("12345678");

    // Yetki reddi: muhasebe ekleyemez.
    send(
            w.t(),
            accounting,
            post(FINANCE + "/accounts/" + first + "/bank-accounts")
                .contentType("application/json")
                .content(json.writeValueAsString(bank(IBAN_DE, null))))
        .andExpect(status().isForbidden());

    // Çapraz liste: cari adıyla arama.
    String name =
        body(send(w.t(), null, get(FINANCE + "/accounts/" + second))).get("name").asText();
    JsonNode search =
        body(
            send(w.t(), null, get(FINANCE + "/bank-accounts").param("q", name.toLowerCase()))
                .andExpect(status().isOk()));
    assertThat(search.get("content")).isNotEmpty();
    search
        .get("content")
        .forEach(
            r -> {
              assertThat(r.get("accountId").asText()).isEqualTo(second.toString());
              assertThat(r.get("iban").isNull()).isTrue();
            });
  }

  @Test
  void personelPasifCariVeKartKapsami() throws Exception {
    World w = world("bap");
    String finance = userWithRole(w, "finans", "FINANCE");

    // Personel carisinin hesapları izinsiz kullanıcıya yok.
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    String employeeBank = id(createBank(w, null, employee, bank(IBAN, null)));
    send(w.t(), finance, get(FINANCE + "/accounts/" + employee + "/bank-accounts"))
        .andExpect(status().isNotFound());
    expect(
        send(w.t(), finance, get(FINANCE + "/bank-accounts/" + employeeBank)),
        404,
        "BANK_ACCOUNT_NOT_FOUND");
    JsonNode cross =
        body(send(w.t(), finance, get(FINANCE + "/bank-accounts")).andExpect(status().isOk()));
    cross
        .get("content")
        .forEach(r -> assertThat(r.get("accountId").asText()).isNotEqualTo(employee.toString()));
    // Personel carisinin IBAN'ı başka cariye eklenemez; yanıt yine genel.
    UUID customer = account(w, AccountType.CUSTOMER, null);
    JsonNode taken =
        body(createBank(w, finance, customer, bank(IBAN, null)).andExpect(status().isConflict()));
    assertThat(taken.get("details")).isEmpty();
    assertThat(taken.toString()).doesNotContain(employee.toString());

    // Pasif cariye hesap eklenebilir.
    sendJson(
            w.t(),
            null,
            patch(FINANCE + "/accounts/" + customer + "/active"),
            Map.of("active", false))
        .andExpect(status().isOk());
    createBank(w, null, customer, bank(IBAN_DE, null)).andExpect(status().isCreated());

    // LIMITED (A1): A2 şubeli kartın hesabını ekleme/güncelleme/aktiflik 403, kayıt değişmez.
    String a2Card =
        body(sendJson(
                    w.t(),
                    null,
                    post(FINANCE + "/accounts"),
                    Map.of("name", "A2 Kart", "type", "SUPPLIER", "branchId", w.a2()))
                .andExpect(status().isCreated()))
            .get("id")
            .asText();
    String a2Bank =
        id(createBank(w, null, UUID.fromString(a2Card), bank("GB82WEST12345698765432", null)));
    String a1User = limitedUser(w, "a1", "FINANCE", List.of(w.a1()));
    expect(
        createBank(w, a1User, UUID.fromString(a2Card), bank(null, "999")),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        sendJson(w.t(), a1User, put(FINANCE + "/bank-accounts/" + a2Bank), bank(null, "11112222")),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        sendJson(
            w.t(),
            a1User,
            patch(FINANCE + "/bank-accounts/" + a2Bank + "/active"),
            Map.of("active", false)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    JsonNode unchanged = detail(w, null, a2Bank);
    assertThat(unchanged.get("active").asBoolean()).isTrue();
    assertThat(unchanged.get("ibanMasked").asText()).isEqualTo("GB82 **** 5432");
    assertThat(unchanged.get("updateCount").asInt()).isZero();
    // Okuma kapsamdan bağımsız (ortak kart).
    send(w.t(), a1User, get(FINANCE + "/accounts/" + a2Card + "/bank-accounts"))
        .andExpect(status().isOk());

    // Profil formu: id'li satır güncellenir, yenisi eklenir, pasifleştirilen pasifleşir.
    String code =
        body(send(w.t(), null, get(FINANCE + "/accounts/" + a2Card))).get("code").asText();
    Map<String, Object> existing = new HashMap<>(bank("GB82WEST12345698765432", null));
    existing.put("id", a2Bank);
    existing.put("bankName", "Yeni Ad");
    Map<String, Object> profile = new HashMap<>();
    profile.put("code", code);
    profile.put("name", "A2 Kart");
    profile.put("type", "SUPPLIER");
    profile.put("subGroup", "GENEL");
    profile.put("branchId", w.a2());
    profile.put("bankAccounts", List.of(existing, bank(null, "55556666")));
    sendJson(w.t(), null, put(FINANCE + "/accounts/" + a2Card + "/profile"), profile)
        .andExpect(status().isOk());
    JsonNode rows =
        body(send(w.t(), null, get(FINANCE + "/accounts/" + a2Card + "/bank-accounts")));
    assertThat(rows).hasSize(2);
    assertThat(detail(w, null, a2Bank).get("bankName").asText()).isEqualTo("Yeni Ad");
    profile.remove("bankAccounts");
    profile.put("deactivatedBankAccountIds", List.of(a2Bank));
    sendJson(w.t(), null, put(FINANCE + "/accounts/" + a2Card + "/profile"), profile)
        .andExpect(status().isOk());
    assertThat(detail(w, null, a2Bank).get("active").asBoolean()).isFalse();
    // Başka carinin hesabı bu formdan değiştirilemez.
    profile.put("deactivatedBankAccountIds", List.of(employeeBank));
    expect(
        sendJson(w.t(), null, put(FINANCE + "/accounts/" + a2Card + "/profile"), profile),
        404,
        "BANK_ACCOUNT_NOT_FOUND");
  }

  private Map<String, Object> bank(String iban, String number) {
    Map<String, Object> body = new HashMap<>();
    body.put("bankName", "Test Bankası");
    body.put("currency", "TRY");
    body.put("category", "MAIN");
    if (iban != null) {
      body.put("iban", iban);
    }
    if (number != null) {
      body.put("accountNumber", number);
    }
    return body;
  }

  private org.springframework.test.web.servlet.ResultActions createBank(
      World w, String token, UUID account, Map<String, Object> body) throws Exception {
    return sendJson(w.t(), token, post(FINANCE + "/accounts/" + account + "/bank-accounts"), body);
  }

  private JsonNode detail(World w, String token, String id) throws Exception {
    return body(
        send(w.t(), token, get(FINANCE + "/bank-accounts/" + id)).andExpect(status().isOk()));
  }
}
