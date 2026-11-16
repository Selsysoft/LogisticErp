package org.ece.blackrose.finance.web;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.media.JsonSchema;
import io.swagger.v3.oas.models.media.Schema;
import java.lang.reflect.RecordComponent;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.ece.blackrose.common.web.NullableInSchema;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.stereotype.Component;

/**
 * Finans DTO'larındaki {@link NullableInSchema} işaretli record bileşenlerini OpenAPI 3.1 biçimiyle
 * null'lanabilir yapar (12.2a §4.4, OK-12.2a-15): skaler alana {@code "null"} türü eklenir, şema
 * bağlantılı alan {@code anyOf: [{$ref}, {type: "null"}]} olur. Şema adı record'un basit adıdır
 * (springdoc varsayılanı); işaretsiz alanlara ve diğer şemalara dokunulmaz.
 */
@Component
public class FinanceOpenApiNullability implements OpenApiCustomizer {

  static final String NULL = "null";

  /** İşaretli record'ları taşıyan DTO kapları. */
  static final List<Class<?>> HOLDERS = List.of(FinanceDtos.class, FinanceReportDtos.class);

  @Override
  public void customise(OpenAPI openApi) {
    if (openApi.getComponents() == null || openApi.getComponents().getSchemas() == null) {
      return;
    }
    apply(openApi.getComponents().getSchemas(), HOLDERS);
  }

  @SuppressWarnings({"rawtypes", "unchecked"})
  static void apply(Map<String, Schema> schemas, List<Class<?>> holders) {
    for (Class<?> holder : holders) {
      for (Class<?> type : holder.getDeclaredClasses()) {
        Schema<?> schema = type.isRecord() ? schemas.get(type.getSimpleName()) : null;
        Map<String, Schema> properties = schema == null ? null : schema.getProperties();
        if (properties == null) {
          continue;
        }
        for (RecordComponent component : type.getRecordComponents()) {
          Schema property = properties.get(component.getName());
          if (property != null && component.isAnnotationPresent(NullableInSchema.class)) {
            properties.put(component.getName(), nullable(property));
          }
        }
      }
    }
  }

  /** Alanın null'lanabilir karşılığı (zaten işaretliyse aynısı). */
  @SuppressWarnings("rawtypes")
  static Schema nullable(Schema property) {
    if (property.get$ref() != null) {
      return new JsonSchema()
          .anyOf(
              List.of(new JsonSchema().$ref(property.get$ref()), new JsonSchema().typesItem(NULL)));
    }
    if (property.getAnyOf() != null) {
      boolean marked =
          ((List<?>) property.getAnyOf())
              .stream()
                  .anyMatch(
                      branch ->
                          branch instanceof Schema<?> s
                              && s.getTypes() != null
                              && s.getTypes().contains(NULL));
      if (!marked) {
        List<Schema> branches = new ArrayList<>(property.getAnyOf());
        branches.add(new JsonSchema().typesItem(NULL));
        property.setAnyOf(branches);
      }
      return property;
    }
    Set<String> types = new LinkedHashSet<>();
    if (property.getTypes() != null) {
      types.addAll(property.getTypes());
    }
    if (types.isEmpty() && property.getType() != null) {
      types.add(property.getType());
    }
    types.add(NULL);
    property.setTypes(types);
    return property;
  }
}
