package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.ece.blackrose.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;

class OpeningBalanceIT extends AbstractIntegrationTest {

  private static final String BASE = "/api/v1/finance/opening-balances";
  private static final LocalDate DATE = tenantToday().minusDays(1);

  @Test
  void hataliSatirlarOnizlemedeGorunurVeHicbirSeyYazilmaz() throws Exception {
    String t = tenantCode("obe");
    String branch = branch(t);
    String file =
        """
        Kod;Ad;Tür;Para birimi;Bakiye;Kur
        M001;Alfa Ltd;Müşteri;TRY;1.500,00;
        T001;Beta AŞ;Tedarikçi;;-2500;
        M002;Gama;Müşteri;TRY;1.500;
        X001;Delta;Rakip;TRY;100;
        M003;Epsilon;Müşteri;USD;100;
        M001;Alfa Ltd;Müşteri;TRY;10;
        Z001;Sıfır;Müşteri;TRY;0;
        """;

    JsonNode preview = body(upload(t, "/preview", file, branch).andExpect(status().isOk()));
    assertThat(preview.get("valid").asBoolean()).isFalse();
    assertThat(statuses(preview))
        .containsExactly(
            "NEW_ACCOUNT", "NEW_ACCOUNT", "ERROR", "ERROR", "ERROR", "ERROR", "NEW_ACCOUNT");
    assertThat(errors(preview))
        .anyMatch(e -> e.contains("belirsiz"))
        .anyMatch(e -> e.contains("Tür tanınmadı"))
        .anyMatch(e -> e.contains("USD için kur bulunamadı"))
        .anyMatch(e -> e.contains("iki kez"));

    upload(t, "", file, branch)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("OPENING_IMPORT_INVALID"));
    assertThat(codes(t)).doesNotContain("M001", "T001");
  }

  @Test
  void gecerliDosyaCarileriVeAcilisBakiyeleriniTekIslemdeYazar() throws Exception {
    String t = tenantCode("obo");
    String branch = branch(t);
    send(
            t,
            post("/api/v1/finance/accounts")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of("code", "E001", "name", "Eski Cari", "type", "CUSTOMER"))))
        .andExpect(status().isCreated());
    // Sütun sırası serbesttir; mevcut cari koduyla eşleşir, adı değişmez.
    String file =
        """
        Bakiye;Kod;Unvan;Tip;Döviz;Kur;Vergi no
        "1.500,25";M001;Alfa Ltd;MÜŞTERİ;TRY;;1234567890
        -2500;T001;Beta AŞ;tedarikçi;;;
        200;M004;Zeta Inc;Müşteri;USD;34,50;
        "750,00";E001;Başka Ad;Müşteri;TRY;;
        0;S001;Sıfır Cari;Müşteri;TRY;;
        0;E001;Başka Ad;Müşteri;USD;;
        """;

    JsonNode preview = body(upload(t, "/preview", file, branch).andExpect(status().isOk()));
    assertThat(preview.get("valid").asBoolean()).isTrue();
    assertThat(preview.get("accountsToCreate").asInt()).isEqualTo(4);
    assertThat(statuses(preview))
        .containsExactly(
            "NEW_ACCOUNT", "NEW_ACCOUNT", "NEW_ACCOUNT", "EXISTING_ACCOUNT", "NEW_ACCOUNT", "ZERO");
    assertThat(codes(t)).doesNotContain("M001");

    JsonNode applied = body(upload(t, "", file, branch).andExpect(status().isOk()));
    assertThat(applied.get("applied").asBoolean()).isTrue();
    assertThat(applied.get("postings").asInt()).isEqualTo(4);
    // Sıfır bakiyeli yeni cari hareketsiz açılır; açık faturası ayrıca yüklenebilir.
    assertThat(account(t, "S001").get("balances")).isEmpty();

    assertThat(balance(t, "M001", "TRY")).isEqualTo("1500.25");
    assertThat(balance(t, "T001", "TRY")).isEqualTo("-2500");
    assertThat(balance(t, "M004", "USD")).isEqualTo("200");
    assertThat(account(t, "M004").get("balances").get(0).get("tlBalance").decimalValue())
        .isEqualByComparingTo("6900");
    assertThat(account(t, "E001").get("name").asText()).isEqualTo("Eski Cari");
    assertThat(account(t, "M001").get("taxNumber").asText()).isEqualTo("1234567890");
  }

  @Test
  void ikinciAcilisEngellenirTersCevrilenAcilisYenidenYuklenir() throws Exception {
    String t = tenantCode("obr");
    String branch = branch(t);
    String file = "Kod;Ad;Tür;Bakiye\nM001;Alfa Ltd;Müşteri;1000\n";
    upload(t, "", file, branch).andExpect(status().isOk());

    JsonNode again = body(upload(t, "/preview", file, branch).andExpect(status().isOk()));
    assertThat(errors(again)).anyMatch(e -> e.contains("açılış bakiyesi zaten var"));

    String id = account(t, "M001").get("id").asText();
    JsonNode statement =
        body(
            send(
                    t,
                    get("/api/v1/finance/accounts/" + id + "/statement")
                        .param("currency", "TRY")
                        .param("from", DATE.minusDays(1).toString())
                        .param("to", DATE.plusDays(1).toString()))
                .andExpect(status().isOk()));
    JsonNode opening = statement.get("lines").get(0);
    assertThat(opening.get("sourceType").asText()).isEqualTo("OPENING");
    send(
            t,
            post("/api/v1/finance/accounts/transactions/" + opening.get("id").asText() + "/reverse")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(Map.of("date", DATE.toString()))))
        .andExpect(status().isOk());

    upload(t, "", "Kod;Ad;Tür;Bakiye\nM001;Alfa Ltd;Müşteri;1200\n", branch)
        .andExpect(status().isOk());
    assertThat(balance(t, "M001", "TRY")).isEqualTo("1200");
  }

  @Test
  void eksikSutunVeIleriTarihReddedilir() throws Exception {
    String t = tenantCode("obh");
    String branch = branch(t);
    upload(t, "/preview", "Kod;Ad;Bakiye\nM001;Alfa;100\n", branch)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("OPENING_IMPORT_HEADER"))
        .andExpect(jsonPath("$.message").value("Başlıkta şu sütunlar bulunamadı: tür."));
    mvc.perform(
            multipart(BASE + "/preview")
                .file(csv("Kod;Ad;Tür;Bakiye\nM001;Alfa;Müşteri;100\n"))
                .param("branchId", branch)
                .param("date", tenantToday().plusDays(1).toString())
                .with(asOwner(t)))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("OPENING_DATE_INVALID"));
  }

  // Yardımcılar

  private static String tenantCode(String prefix) {
    return prefix + "-" + Long.toString(System.nanoTime(), 36);
  }

  private String branch(String t) throws Exception {
    createTenant(t);
    return body(send(
                t,
                post("/api/v1/organization/branches")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(Map.of("code", "S1", "name", "Merkez"))))
            .andExpect(status().isCreated()))
        .get("id")
        .asText();
  }

  private ResultActions send(
      String t, org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request)
      throws Exception {
    return mvc.perform(request.with(asOwner(t)));
  }

  private static MockMultipartFile csv(String content) {
    return new MockMultipartFile(
        "file", "acilis.csv", "text/csv", content.getBytes(StandardCharsets.UTF_8));
  }

  private ResultActions upload(String t, String path, String content, String branch)
      throws Exception {
    return mvc.perform(
        multipart(BASE + path)
            .file(csv(content))
            .param("branchId", branch)
            .param("date", DATE.toString())
            .with(asOwner(t)));
  }

  private static List<String> statuses(JsonNode result) {
    List<String> list = new ArrayList<>();
    result.get("rows").forEach(row -> list.add(row.get("status").asText()));
    return list;
  }

  private static List<String> errors(JsonNode result) {
    List<String> list = new ArrayList<>();
    result.get("rows").forEach(row -> list.add(row.path("error").asText()));
    return list;
  }

  private List<String> codes(String t) throws Exception {
    List<String> list = new ArrayList<>();
    body(send(t, get("/api/v1/finance/accounts").param("size", "200")))
        .get("content")
        .forEach(account -> list.add(account.get("code").asText()));
    return list;
  }

  private JsonNode account(String t, String code) throws Exception {
    for (JsonNode account :
        body(send(t, get("/api/v1/finance/accounts").param("size", "200"))).get("content")) {
      if (account.get("code").asText().equals(code)) {
        return body(send(t, get("/api/v1/finance/accounts/" + account.get("id").asText())));
      }
    }
    throw new AssertionError("Cari yok: " + code);
  }

  private String balance(String t, String code, String currency) throws Exception {
    for (JsonNode row : account(t, code).get("balances")) {
      if (row.get("currency").asText().equals(currency)) {
        return row.get("balance").decimalValue().stripTrailingZeros().toPlainString();
      }
    }
    return "0";
  }
}
