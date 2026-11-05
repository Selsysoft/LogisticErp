package org.ece.blackrose.integration.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

class CsvRowsTest {

  @Test
  void skipsHeaderBomAndBlankLinesAndDetectsDelimiter() {
    String file = "﻿plaka;tutar\r\n34 ABC 123;10\r\n\r\n06XYZ;20\r\n";
    List<CsvRows.Line> rows = CsvRows.parse(file.getBytes(StandardCharsets.UTF_8));

    assertThat(rows).hasSize(2);
    assertThat(rows.get(0).text(0)).isEqualTo("34 ABC 123");
    assertThat(rows.get(0).number()).isEqualTo(2);
    assertThat(rows.get(1).number()).isEqualTo(4);
  }

  @Test
  void respectsQuotesAndEscapedQuotes() {
    assertThat(CsvRows.split("a,\"b, c\",\"d\"\"e\"", ',')).containsExactly("a", "b, c", "d\"e");
  }

  @Test
  void readsTurkishAndPlainAmounts() {
    assertThat(CsvRows.amount("1.234,56", "T")).isEqualByComparingTo("1234.56");
    assertThat(CsvRows.amount("1234.56", "T")).isEqualByComparingTo("1234.56");
    assertThat(CsvRows.amount("-250,5", "T")).isEqualByComparingTo("-250.5");
    assertThatThrownBy(() -> CsvRows.amount("on lira", "Tutar"))
        .isInstanceOf(CsvRows.RowException.class)
        .hasMessageContaining("Tutar");
  }

  @Test
  void readsDatesInBothFormats() {
    assertThat(CsvRows.date("05.11.2026")).isEqualTo(LocalDate.of(2026, 11, 5));
    assertThat(CsvRows.date("2026-11-05")).isEqualTo(LocalDate.of(2026, 11, 5));
    assertThat(CsvRows.dateTime("05.11.2026 14:30"))
        .isEqualTo(LocalDateTime.of(2026, 11, 5, 14, 30));
    assertThat(CsvRows.dateTime("2026-11-05")).isEqualTo(LocalDateTime.of(2026, 11, 5, 0, 0));
    assertThatThrownBy(() -> CsvRows.date("31.02.2026")).isInstanceOf(CsvRows.RowException.class);
  }

  @Test
  void normalizesPlateAndBuildsStableKey() {
    assertThat(CsvRows.plate("34 abc 123")).isEqualTo("34ABC123");
    assertThat(CsvRows.key("REF1", "satır")).isEqualTo("REF1");
    assertThat(CsvRows.key(null, "satır")).isEqualTo(CsvRows.key(null, "satır"));
    assertThat(CsvRows.key(null, "satır")).isNotEqualTo(CsvRows.key(null, "diğer"));
  }
}
