package org.ece.blackrose.integration.service;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;

/**
 * Sağlayıcı dosyalarının ortak okuyucusu. Noktalı virgül, virgül veya sekme ayırıcılı; ilk satır
 * başlıktır. Tutar ve tarih Türkçe veya ISO biçiminde olabilir.
 */
public final class CsvRows {

  private static final DateTimeFormatter TR_DATE =
      DateTimeFormatter.ofPattern("dd.MM.uuuu").withResolverStyle(ResolverStyle.STRICT);
  private static final DateTimeFormatter ISO_MINUTE =
      DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm").withResolverStyle(ResolverStyle.STRICT);
  private static final DateTimeFormatter TR_MINUTE =
      DateTimeFormatter.ofPattern("dd.MM.uuuu HH:mm").withResolverStyle(ResolverStyle.STRICT);
  private static final char BOM = '﻿';

  /** Hatalı satır dosyanın kalanını engellemez; satıra yazılır. */
  public static final class RowException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    public RowException(String message) {
      super(message);
    }
  }

  public record Line(int number, List<String> cells, String raw) {

    public String text(int index) {
      String value = index < cells.size() ? cells.get(index).trim() : "";
      return value.isEmpty() ? null : value;
    }

    public String required(int index, String label) {
      String value = text(index);
      if (value == null) {
        throw new RowException(label + " boş.");
      }
      return value;
    }
  }

  private CsvRows() {}

  public static List<Line> parse(byte[] content) {
    String text = decode(content);
    if (!text.isEmpty() && text.charAt(0) == BOM) {
      text = text.substring(1);
    }
    String[] lines = text.split("\\r?\\n");
    List<Line> rows = new ArrayList<>();
    if (lines.length == 0) {
      return rows;
    }
    char delimiter = detectDelimiter(lines[0]);
    for (int i = 1; i < lines.length; i++) {
      if (!lines[i].isBlank()) {
        rows.add(new Line(i + 1, split(lines[i], delimiter), lines[i].trim()));
      }
    }
    return rows;
  }

  /** Excel'in "1.500" gibi yalnız binlik ayırıcılı yazımı 1,5 mi 1500 mü belirsizdir. */
  private static final java.util.regex.Pattern AMBIGUOUS_THOUSANDS =
      java.util.regex.Pattern.compile("-?\\d{1,3}(\\.\\d{3})+");

  /** Açılış verisinde belirsiz sayı sessizce yanlış okunmasın diye reddedilir. */
  public static boolean ambiguousThousands(String value) {
    return AMBIGUOUS_THOUSANDS.matcher(value.replace(" ", "")).matches();
  }

  /** Başlık ve tür adlarını karşılaştırmak için: "Müşteri kodu" → "MUSTERI_KODU". */
  public static String normalize(String value) {
    return value
        .strip()
        .toUpperCase(new java.util.Locale("tr"))
        .replace('Ü', 'U')
        .replace('Ş', 'S')
        .replace('İ', 'I')
        .replace('Ğ', 'G')
        .replace('Ç', 'C')
        .replace('Ö', 'O')
        .replace(' ', '_');
  }

  /** Sütun adı → sıra; aynı ad iki kez varsa ilki geçerlidir. */
  public static java.util.Map<String, Integer> headerIndex(List<String> header) {
    java.util.Map<String, Integer> index = new java.util.HashMap<>();
    for (int i = 0; i < header.size(); i++) {
      index.putIfAbsent(normalize(header.get(i)), i);
    }
    return index;
  }

  /** Verilen adlardan ilk bulunan sütunun sırası; yoksa -1. */
  public static int column(java.util.Map<String, Integer> index, String... names) {
    for (String name : names) {
      Integer i = index.get(name);
      if (i != null) {
        return i;
      }
    }
    return -1;
  }

  /**
   * UTF-8 olarak okur; geçerli UTF-8 değilse Türkçe Windows'un kodlamasıyla (Windows-1254) okur.
   * Türkçe Excel'in klasik "CSV (noktalı virgülle ayrılmış)" kaydı bu kodlamayla yazılır.
   */
  public static String decode(byte[] content) {
    try {
      return StandardCharsets.UTF_8
          .newDecoder()
          .onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
          .onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT)
          .decode(java.nio.ByteBuffer.wrap(content))
          .toString();
    } catch (java.nio.charset.CharacterCodingException ex) {
      return new String(content, java.nio.charset.Charset.forName("windows-1254"));
    }
  }

  /** Başlık satırının hücreleri; sütunları adla eşlemek için. */
  public static List<String> header(byte[] content) {
    String text = decode(content);
    if (!text.isEmpty() && text.charAt(0) == BOM) {
      text = text.substring(1);
    }
    String first = text.split("\\r?\\n", 2)[0];
    return split(first, detectDelimiter(first)).stream().map(String::trim).toList();
  }

  public static char detectDelimiter(String header) {
    if (header.indexOf(';') >= 0) {
      return ';';
    }
    return header.indexOf('\t') >= 0 ? '\t' : ',';
  }

  public static List<String> split(String line, char delimiter) {
    List<String> cells = new ArrayList<>();
    StringBuilder cell = new StringBuilder();
    boolean quoted = false;
    for (int i = 0; i < line.length(); i++) {
      char c = line.charAt(i);
      if (c == '"') {
        if (quoted && i + 1 < line.length() && line.charAt(i + 1) == '"') {
          cell.append('"');
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (c == delimiter && !quoted) {
        cells.add(cell.toString());
        cell.setLength(0);
      } else {
        cell.append(c);
      }
    }
    cells.add(cell.toString());
    return cells;
  }

  /** 1.234,56 ve 1234.56 biçimlerini okur. */
  public static BigDecimal amount(String value, String label) {
    String text = value.trim().replace(" ", "");
    if (text.contains(",")) {
      text = text.replace(".", "").replace(",", ".");
    }
    try {
      return new BigDecimal(text);
    } catch (NumberFormatException ex) {
      throw new RowException(label + " okunamadı: " + value);
    }
  }

  public static LocalDate date(String value) {
    String text = value.trim();
    try {
      return text.contains(".") ? LocalDate.parse(text, TR_DATE) : LocalDate.parse(text);
    } catch (DateTimeParseException ex) {
      throw new RowException("Tarih okunamadı: " + value);
    }
  }

  /** Saat yoksa günün başı kabul edilir. */
  public static LocalDateTime dateTime(String value) {
    String text = value.trim();
    if (text.length() <= 10) {
      return date(text).atTime(LocalTime.MIN);
    }
    try {
      return LocalDateTime.parse(text, text.contains(".") ? TR_MINUTE : ISO_MINUTE);
    } catch (DateTimeParseException ex) {
      throw new RowException("Tarih ve saat okunamadı: " + value);
    }
  }

  /** Plakayı karşılaştırma için sadeleştirir: 34 ABC 123 ve 34abc123 aynıdır. */
  public static String plate(String value) {
    return value.replaceAll("\\s", "").toUpperCase(Locale.forLanguageTag("tr"));
  }

  /** Sağlayıcı referansı varsa odur; yoksa satırın kendisinden üretilir. */
  public static String key(String reference, String raw) {
    if (reference != null) {
      return reference.length() <= 100 ? reference : hash(reference);
    }
    return hash(raw);
  }

  private static String hash(String value) {
    try {
      return HexFormat.of()
          .formatHex(
              MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException ex) {
      throw new IllegalStateException(ex);
    }
  }
}
