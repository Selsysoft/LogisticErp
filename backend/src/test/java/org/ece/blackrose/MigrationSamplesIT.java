package org.ece.blackrose;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

/**
 * Geçiş rehberindeki örnek dosyalar (docs/ornekler) gerçekten hatasız önizlenir. Rehber ile
 * uygulama birbirinden kopmasın diye.
 */
class MigrationSamplesIT extends AbstractIntegrationTest {

  private static final Path SAMPLES = Path.of("..", "docs", "ornekler");

  @Test
  void acilisBakiyesiOrnegiGecerlidir() throws Exception {
    String t = newTenant("ms-ob");
    JsonNode result =
        preview(
            t,
            "/api/v1/finance/opening-balances/preview",
            "acilis-bakiyesi.csv",
            Map.of("branchId", branch(t), "date", tenantToday().toString()));
    assertThat(result.get("valid").asBoolean()).as(result.toString()).isTrue();
  }

  @Test
  void acikFaturaOrnegiGecerlidir() throws Exception {
    String t = newTenant("ms-oi");
    String branch = branch(t);
    account(t, "M001", "CUSTOMER");
    account(t, "M002", "CUSTOMER");
    account(t, "T001", "SUPPLIER");
    JsonNode result =
        preview(
            t,
            "/api/v1/finance/opening-invoices/preview",
            "acik-faturalar.csv",
            Map.of("branchId", branch));
    assertThat(result.get("valid").asBoolean()).as(result.toString()).isTrue();
  }

  @Test
  void acilisStoguOrnegiGecerlidir() throws Exception {
    String t = newTenant("ms-os");
    String branch = branch(t);
    account(t, "M001", "CUSTOMER");
    account(t, "M002", "CUSTOMER");
    String warehouse =
        created(
            t,
            "/api/v1/warehouse/warehouses",
            Map.of("code", "D1", "name", "Ana Depo", "branchId", branch, "bonded", false));
    JsonNode result =
        preview(
            t,
            "/api/v1/warehouse/opening-stock/preview",
            "acilis-stogu.csv",
            Map.of("warehouseId", warehouse, "date", tenantToday().toString()));
    assertThat(result.get("valid").asBoolean()).as(result.toString()).isTrue();
  }

  private String newTenant(String prefix) throws Exception {
    String t = prefix + "-" + Long.toString(System.nanoTime(), 36);
    createTenant(t);
    return t;
  }

  private String branch(String t) throws Exception {
    return created(t, "/api/v1/organization/branches", Map.of("code", "S1", "name", "Merkez"));
  }

  private void account(String t, String code, String type) throws Exception {
    created(t, "/api/v1/finance/accounts", Map.of("code", code, "name", code, "type", type));
  }

  private String created(String t, String path, Object body) throws Exception {
    return body(mvc.perform(
                post(path)
                    .with(asOwner(t))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(body)))
            .andExpect(status().isCreated()))
        .get("id")
        .asText();
  }

  private JsonNode preview(String t, String path, String file, Map<String, String> params)
      throws Exception {
    var request =
        multipart(path)
            .file(
                new MockMultipartFile(
                    "file", file, "text/csv", Files.readAllBytes(SAMPLES.resolve(file))));
    params.forEach(request::param);
    return body(mvc.perform(request.with(asOwner(t))).andExpect(status().isOk()));
  }
}
