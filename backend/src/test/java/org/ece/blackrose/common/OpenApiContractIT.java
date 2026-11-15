package org.ece.blackrose.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.ece.blackrose.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;

/**
 * API sözleşmesi depodaki {@code docs/api/openapi.json} ile aynı olmalıdır. Frontend tipleri bu
 * dosyaya karşı denetlenir; bir yanıt alanı değişip dosya güncellenmezse burada, dosya güncellenip
 * frontend uyarlanmazsa frontend testinde kırılır.
 *
 * <p>Bilerek yapılan değişiklikte dosyayı yenilemek için: {@code mvn verify
 * -Dit.test=OpenApiContractIT -Dopenapi.update=true}.
 */
class OpenApiContractIT extends AbstractIntegrationTest {

  private static final Path SPEC = Path.of("..", "docs", "api", "openapi.json");

  @Test
  void apiSozlesmesiDepodakiDosyaylaAynidir() throws Exception {
    String raw =
        mvc.perform(get("/v3/api-docs"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString(StandardCharsets.UTF_8);
    String actual = canonical(raw);

    if (Boolean.getBoolean("openapi.update")) {
      Files.createDirectories(SPEC.getParent());
      Files.writeString(SPEC, actual, StandardCharsets.UTF_8);
    }
    assertThat(SPEC)
        .as("docs/api/openapi.json bulunamadı; -Dopenapi.update=true ile üretin")
        .exists();
    String expected = Files.readString(SPEC, StandardCharsets.UTF_8).replace("\r\n", "\n");
    assertThat(actual)
        .as(
            "API sözleşmesi değişti. Bilerek yapıldıysa -Dopenapi.update=true ile docs/api/openapi.json"
                + " dosyasını yenileyin ve frontend'de 'npm test' ile src/api/contract.test.ts'i"
                + " çalıştırın.")
        .isEqualTo(expected);
  }

  /**
   * 12.2a §4.4 (OK-12.2a-15): yeni null'lanabilir alanlar OpenAPI 3.1 biçimiyle işaretlidir (skaler
   * alanda {@code type} dizisi, şema bağlantısında {@code anyOf} null dalı); işaretsiz mevcut
   * alanlar değişmez ve {@code nullable} anahtarı hiç yazılmaz.
   */
  @Test
  void yeniNullAlanlarOas31BicimindeIsaretlidir() throws Exception {
    JsonNode spec =
        new ObjectMapper()
            .readTree(
                mvc.perform(get("/v3/api-docs"))
                    .andExpect(status().isOk())
                    .andReturn()
                    .getResponse()
                    .getContentAsString(StandardCharsets.UTF_8));
    assertThat(spec.get("openapi").asText()).startsWith("3.1");
    JsonNode schemas = spec.get("components").get("schemas");

    assertThat(types(schemas, "SettlementResponse", "documentNo"))
        .containsExactly("string", "null");
    assertThat(types(schemas, "SettlementResponse", "reversedOn"))
        .containsExactly("string", "null");
    assertThat(property(schemas, "SettlementResponse", "reversedOn").get("format").asText())
        .isEqualTo("date");
    assertThat(types(schemas, "SettlementListItemResponse", "exchangeRate"))
        .containsExactly("number", "null");
    assertThat(types(schemas, "SettlementListItemResponse", "lockReason"))
        .containsExactly("string", "null");
    assertThat(property(schemas, "SettlementListItemResponse", "lockReason").get("enum"))
        .isNotEmpty();
    assertThat(types(schemas, "DailyFundBalanceResponse", "bankName"))
        .containsExactly("string", "null");
    assertThat(types(schemas, "NewInstrument", "fundAccountId")).containsExactly("string", "null");
    for (String field : new String[] {"instrument", "plan"}) {
      JsonNode anyOf = property(schemas, "SettlementDetailResponse", field).get("anyOf");
      assertThat(anyOf).as(field).hasSize(2);
      assertThat(anyOf.get(0).get("$ref").asText()).startsWith("#/components/schemas/");
      assertThat(anyOf.get(1).get("type").asText()).isEqualTo("null");
    }
    // İşaretsiz alanlar ve ondalık metin alanları değişmez.
    assertThat(types(schemas, "SettlementResponse", "accountId")).containsExactly("string");
    assertThat(types(schemas, "SettlementListItemResponse", "fxUsed")).containsExactly("string");
    assertThat(types(schemas, "DailyFundBalanceResponse", "balanceAtDate"))
        .containsExactly("string");
    assertThat(property(schemas, "SettlementDetailResponse", "item").has("$ref")).isTrue();
    assertThat(spec.toString()).doesNotContain("\"nullable\"");
  }

  private static JsonNode property(JsonNode schemas, String schema, String field) {
    JsonNode property = schemas.get(schema).get("properties").get(field);
    assertThat(property).as(schema + "." + field).isNotNull();
    return property;
  }

  private static List<String> types(JsonNode schemas, String schema, String field) {
    JsonNode type = property(schemas, schema, field).get("type");
    List<String> types = new ArrayList<>();
    if (type.isArray()) {
      type.forEach(t -> types.add(t.asText()));
    } else {
      types.add(type.asText());
    }
    return types;
  }

  /** Anahtarlar sıralanır, ortama bağlı sunucu adresi çıkarılır; çıktı makineden bağımsızdır. */
  private static String canonical(String raw) throws Exception {
    ObjectMapper mapper =
        new ObjectMapper()
            .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS)
            .enable(SerializationFeature.INDENT_OUTPUT);
    JsonNode tree = mapper.readTree(raw);
    ((ObjectNode) tree).remove("servers");
    Object sorted = mapper.treeToValue(tree, Object.class);
    return mapper.writeValueAsString(sorted).replace("\r\n", "\n") + "\n";
  }
}
