package org.ece.blackrose.common;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Uygulama "bugün"ü firmanın saat dilimiyle (TenantClock, SubscriptionService.todayOf) hesaplar.
 * Sunucunun saat dilimine bağlı çağrılar UTC sunucuda gece birkaç saat yanlış tarih üretir ve
 * testte ancak o saatlerde yakalanır; bu yüzden kaynakta hiç bulunmamalıdır.
 */
class TimeZoneUsageTest {

  private static final Pattern FORBIDDEN =
      Pattern.compile(
          "\\b(LocalDate|LocalDateTime|LocalTime|YearMonth|ZonedDateTime|OffsetDateTime)\\.now\\(\\)"
              + "|ZoneId\\.systemDefault\\(\\)|TimeZone\\.getDefault\\(\\)"
              + "|Clock\\.systemDefaultZone\\(\\)");

  @Test
  void mainSourcesDoNotUseTheServerTimeZone() throws IOException {
    List<String> offenders = new ArrayList<>();
    try (Stream<Path> files = Files.walk(Path.of("src/main/java"))) {
      for (Path file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
        List<String> lines = Files.readAllLines(file);
        for (int i = 0; i < lines.size(); i++) {
          if (FORBIDDEN.matcher(lines.get(i)).find()) {
            offenders.add(file + ":" + (i + 1) + "  " + lines.get(i).strip());
          }
        }
      }
    }
    assertThat(offenders).as("saat dilimi verilmeden alınan tarih/saat").isEmpty();
  }
}
