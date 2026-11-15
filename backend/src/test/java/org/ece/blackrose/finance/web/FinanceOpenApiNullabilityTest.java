package org.ece.blackrose.finance.web;

import static org.assertj.core.api.Assertions.assertThat;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.media.JsonSchema;
import io.swagger.v3.oas.models.media.Schema;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.ece.blackrose.common.web.NullableInSchema;
import org.junit.jupiter.api.Test;

/** {@link FinanceOpenApiNullability}: OAS 3.1 null işaretinin biçimleri (12.2a §4.4). */
class FinanceOpenApiNullabilityTest {

  /** Test kabı: işaretli ve işaretsiz bileşenler, record olmayan iç sınıf. */
  static final class Holder {
    record Sample(
        @NullableInSchema String text,
        @NullableInSchema Object linked,
        @NullableInSchema Object choice,
        @NullableInSchema String legacy,
        @NullableInSchema String missing,
        String plain) {}

    static final class NotRecord {}

    record Unknown(@NullableInSchema String text) {}
  }

  @Test
  @SuppressWarnings({"rawtypes", "unchecked"})
  void skalerBaglantiVeSecenekAlanlariIsaretlenirIsaretsizlerDegismez() {
    Map<String, Schema> properties = new LinkedHashMap<>();
    properties.put("text", new JsonSchema().typesItem("string").format("uuid"));
    properties.put("linked", new JsonSchema().$ref("#/components/schemas/Other"));
    properties.put(
        "choice",
        new JsonSchema()
            .anyOf(
                List.of(
                    new JsonSchema().typesItem("string"), new JsonSchema().typesItem("integer"))));
    Schema legacy = new Schema<>();
    legacy.setType("string");
    properties.put("legacy", legacy);
    properties.put("plain", new JsonSchema().typesItem("string"));
    Schema sample = new JsonSchema().typesItem("object");
    sample.setProperties(properties);
    Map<String, Schema> schemas = new LinkedHashMap<>();
    schemas.put("Sample", sample);
    schemas.put("NotRecord", new JsonSchema());
    schemas.put("Unknown", new JsonSchema());

    FinanceOpenApiNullability.apply(schemas, List.of(Holder.class));
    // İkinci uygulama değiştirmez (idempotent).
    FinanceOpenApiNullability.apply(schemas, List.of(Holder.class));

    Map<String, Schema> result = schemas.get("Sample").getProperties();
    assertThat(result.get("text").getTypes()).containsExactly("string", "null");
    assertThat(result.get("text").getFormat()).isEqualTo("uuid");
    List<Schema> linked = result.get("linked").getAnyOf();
    assertThat(linked).hasSize(2);
    assertThat(linked.get(0).get$ref()).isEqualTo("#/components/schemas/Other");
    assertThat(linked.get(1).getTypes()).containsExactly("null");
    List<Schema> choice = result.get("choice").getAnyOf();
    assertThat(choice).hasSize(3);
    assertThat(choice.get(2).getTypes()).containsExactly("null");
    assertThat(result.get("legacy").getTypes()).containsExactly("string", "null");
    assertThat(result.get("plain").getTypes()).containsExactly("string");
    assertThat(result).doesNotContainKey("missing");
    assertThat(schemas.get("Unknown").getProperties()).isNull();
  }

  @Test
  void bilesenYoksaDokunmaz() {
    FinanceOpenApiNullability customizer = new FinanceOpenApiNullability();
    OpenAPI empty = new OpenAPI();
    customizer.customise(empty);
    assertThat(empty.getComponents()).isNull();
    OpenAPI noSchemas = new OpenAPI().components(new Components());
    customizer.customise(noSchemas);
    assertThat(noSchemas.getComponents().getSchemas()).isNull();

    OpenAPI real = new OpenAPI().components(new Components());
    Schema<?> response = new JsonSchema().typesItem("object");
    response.addProperty("documentNo", new JsonSchema().typesItem("string"));
    response.addProperty("id", new JsonSchema().typesItem("string"));
    real.getComponents().addSchemas("SettlementResponse", response);
    customizer.customise(real);
    assertThat(response.getProperties().get("documentNo").getTypes())
        .containsExactly("string", "null");
    assertThat(response.getProperties().get("id").getTypes()).containsExactly("string");
  }
}
