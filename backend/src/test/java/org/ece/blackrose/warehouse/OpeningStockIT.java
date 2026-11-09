package org.ece.blackrose.warehouse;

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
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

class OpeningStockIT extends AbstractIntegrationTest {

  private static final String BASE = "/api/v1/warehouse";
  private static final LocalDate DATE = tenantToday().minusDays(1);

  private record Setup(String tenant, String warehouse) {}

  @Test
  void hataliSatirlarGorunurHicbirSeyYazilmazGecerliDosyaTekIslemdeYazilir() throws Exception {
    Setup s = setup("ost", false);
    created(s, "/api/v1/finance/accounts", Map.of("code", "T1", "name", "Ted", "type", "SUPPLIER"));
    String header = "Müşteri kodu;Ürün kodu;Ürün adı;Birim;Göz;Lot;SKT;Miktar\n";
    String bad =
        header
            + "M1;U-1;Un 50 kg;ÇUVAL;A-01;L1;31.12.2027;120\n"
            + "YOK;U-2;X;KOLİ;A-01;;;5\n"
            + "T1;U-3;Y;KOLİ;A-01;;;5\n"
            + "M1;U-4;Şeker;KG;A-02;;;1.500\n"
            + "M1;U-1;Un 50 kg;ÇUVAL;A-01;L1;31.12.2027;3\n"
            + "M1;U-1;Un 50 kg;ÇUVAL;B-07;L1;01.01.2028;4\n";

    JsonNode preview = body(upload(s, "/preview", bad).andExpect(status().isOk()));
    assertThat(preview.get("valid").asBoolean()).isFalse();
    assertThat(statuses(preview))
        .containsExactly("READY", "ERROR", "ERROR", "ERROR", "ERROR", "ERROR");
    assertThat(errors(preview))
        .anyMatch(e -> e.contains("Müşteri carisi yok: YOK"))
        .anyMatch(e -> e.contains("T1 müşteri carisi değil"))
        .anyMatch(e -> e.contains("Miktar belirsiz"))
        .anyMatch(e -> e.contains("iki kez"))
        .anyMatch(e -> e.contains("farklı son kullanma"));
    upload(s, "", bad)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("OPENING_STOCK_INVALID"));
    assertThat(balances(s)).isEmpty();

    // Sütun sırası serbest; yeni ürün ve yeni göz açılır, ondalık miktar virgülle.
    String good =
        "Göz;Miktar;Ürün kodu;Müşteri kodu;Ürün adı;Birim;Lot;Son kullanma\n"
            + "A-01;120;U-1;M1;Un 50 kg;ÇUVAL;L1;31.12.2027\n"
            + "B-07;12,5;U-1;M1;Un 50 kg;ÇUVAL;L1;31.12.2027\n"
            + "B-07;40;U-9;M1;Yağ;KOLİ;;\n";
    JsonNode ready = body(upload(s, "/preview", good).andExpect(status().isOk()));
    assertThat(ready.get("valid").asBoolean()).isTrue();
    assertThat(ready.get("itemsToCreate").asInt()).isEqualTo(2);
    assertThat(ready.get("binsToCreate").asInt()).isEqualTo(1);

    JsonNode applied = body(upload(s, "", good).andExpect(status().isOk()));
    assertThat(applied.get("applied").asBoolean()).isTrue();
    assertThat(applied.get("receipts").asInt()).isEqualTo(3);

    List<String> rows = new ArrayList<>();
    for (JsonNode b : balances(s)) {
      rows.add(
          b.get("binCode").asText()
              + " "
              + b.get("sku").asText()
              + " "
              + b.get("lotNo").asText()
              + " "
              + b.get("quantity").decimalValue().stripTrailingZeros().toPlainString()
              + " "
              + b.path("expiryDate").asText(""));
    }
    assertThat(rows)
        .containsExactlyInAnyOrder(
            "A-01 U-1 L1 120 2027-12-31", "B-07 U-1 L1 12.5 2027-12-31", "B-07 U-9  40 ");
    JsonNode movements =
        body(send(s.tenant(), get(BASE + "/movements").param("size", "50"))).get("content");
    for (JsonNode m : movements) {
      assertThat(m.get("type").asText()).isEqualTo("RECEIPT");
      assertThat(m.get("reference").asText()).isEqualTo("Açılış stoğu");
      assertThat(m.get("movedOn").asText()).isEqualTo(DATE.toString());
      assertThat(m.get("reversible").asBoolean()).isTrue();
    }

    // Açılış boş depoya yapılır: aynı dosya ikinci kez yüklenemez.
    JsonNode again = body(upload(s, "/preview", good).andExpect(status().isOk()));
    assertThat(errors(again)).allMatch(e -> e.contains("zaten stok var"));
  }

  @Test
  void gumrukluDepodaAcilisStoguGumruktedirVeAcikSayimdaYuklenmez() throws Exception {
    Setup s = setup("osb", true);
    String file = "Müşteri kodu;Ürün kodu;Ürün adı;Birim;Göz;Miktar\nM1;U-1;Kumaş;TOP;A-01;10\n";
    upload(s, "", file).andExpect(status().isOk());
    assertThat(balances(s).get(0).get("customsStatus").asText()).isEqualTo("UNDER_BOND");

    send(
            s.tenant(),
            post(BASE + "/counts")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of("warehouseId", s.warehouse(), "date", DATE.toString()))))
        .andExpect(status().isCreated());
    upload(s, "/preview", file.replace("U-1", "U-2"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("COUNT_OPEN"));
  }

  // Yardımcılar

  private Setup setup(String prefix, boolean bonded) throws Exception {
    String t = prefix + "-" + Long.toString(System.nanoTime(), 36);
    createTenant(t);
    Setup s = new Setup(t, null);
    String branch =
        created(s, "/api/v1/organization/branches", Map.of("code", "S1", "name", "Merkez"));
    created(
        s, "/api/v1/finance/accounts", Map.of("code", "M1", "name", "Müşteri", "type", "CUSTOMER"));
    String warehouse =
        created(
            s,
            BASE + "/warehouses",
            Map.of("code", "D1", "name", "Ana Depo", "branchId", branch, "bonded", bonded));
    created(
        new Setup(t, warehouse),
        BASE + "/warehouses/" + warehouse + "/bins",
        Map.of("code", "A-01"));
    return new Setup(t, warehouse);
  }

  private String created(Setup s, String path, Object body) throws Exception {
    return body(send(
                s.tenant(),
                post(path)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(body)))
            .andExpect(status().isCreated()))
        .get("id")
        .asText();
  }

  private ResultActions send(String t, MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request.with(asOwner(t)));
  }

  private ResultActions upload(Setup s, String path, String content) throws Exception {
    return mvc.perform(
        multipart(BASE + "/opening-stock" + path)
            .file(
                new MockMultipartFile(
                    "file", "stok.csv", "text/csv", content.getBytes(StandardCharsets.UTF_8)))
            .param("warehouseId", s.warehouse())
            .param("date", DATE.toString())
            .with(asOwner(s.tenant())));
  }

  private JsonNode balances(Setup s) throws Exception {
    return body(send(s.tenant(), get(BASE + "/balances").param("size", "50"))).get("content");
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
}
