package org.ece.blackrose.common;

import static org.assertj.core.api.Assertions.assertThat;

import io.swagger.v3.oas.annotations.media.Schema;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AssignableTypeFilter;

/**
 * OpenAPI şemaları sınıfın kısa adıyla adlandırılır; aynı adlı iki farklı kayıt tek şemaya çöker ve
 * API sözleşmesi bunlardan birini yanlış gösterir. Aynı adı taşıyan, alanları farklı kayıtlar
 * {@code @Schema(name = ...)} ile ayrılmalıdır.
 */
class SchemaNameUniquenessTest {

  @Test
  void farkliAlanliKayitlarAyniSemaAdiniPaylasmaz() throws Exception {
    var scanner = new ClassPathScanningCandidateComponentProvider(false);
    scanner.addIncludeFilter(new AssignableTypeFilter(Record.class));
    Map<String, List<Class<?>>> byName = new HashMap<>();
    for (var candidate : scanner.findCandidateComponents("org.ece.blackrose")) {
      Class<?> type = Class.forName(candidate.getBeanClassName());
      if (!exposable(type)) {
        continue;
      }
      byName.computeIfAbsent(schemaName(type), name -> new ArrayList<>()).add(type);
    }

    List<String> clashes = new ArrayList<>();
    byName.forEach(
        (name, types) -> {
          long shapes = types.stream().map(SchemaNameUniquenessTest::shape).distinct().count();
          if (shapes > 1) {
            clashes.add(
                name
                    + ": "
                    + types.stream()
                        .map(Class::getName)
                        .sorted()
                        .collect(Collectors.joining(", ")));
          }
        });
    assertThat(clashes).as("@Schema(name = ...) ile ayırın").isEmpty();
  }

  /** Yalnız uygulama kodundaki, dışarıdan görünen kayıtlar API yanıtına girebilir. */
  private static boolean exposable(Class<?> type) {
    for (Class<?> c = type; c != null; c = c.getEnclosingClass()) {
      if (!Modifier.isPublic(c.getModifiers())) {
        return false;
      }
    }
    String location = type.getProtectionDomain().getCodeSource().getLocation().getPath();
    return !location.contains("test-classes");
  }

  private static String schemaName(Class<?> type) {
    Schema schema = type.getAnnotation(Schema.class);
    return schema != null && !schema.name().isEmpty() ? schema.name() : type.getSimpleName();
  }

  private static String shape(Class<?> type) {
    return Arrays.stream(type.getRecordComponents())
        .map(component -> component.getName() + ":" + component.getGenericType().getTypeName())
        .collect(Collectors.joining(","));
  }
}
