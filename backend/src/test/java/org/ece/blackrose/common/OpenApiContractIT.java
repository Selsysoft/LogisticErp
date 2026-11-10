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
                + " dosyasını yenileyin ve frontend'de 'npm run api:types' çalıştırın.")
        .isEqualTo(expected);
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
