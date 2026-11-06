package org.ece.blackrose.notification;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/** Özet satırları için ortak biçimler. */
public final class DigestLines {

  /** Bir bölümde gösterilen en çok satır; kalanı sayıyla belirtilir. */
  public static final int MAX_LINES = 20;

  private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");

  private DigestLines() {}

  public static String date(LocalDate date) {
    return DATE.format(date);
  }

  public static String money(BigDecimal amount, String currency) {
    return amount.stripTrailingZeros().toPlainString() + " " + currency;
  }

  /** İlk {@link #MAX_LINES} satırı alır, toplam daha fazlaysa "ve N kayıt daha" ekler. */
  public static List<String> limited(List<String> lines, long total) {
    List<String> result = new ArrayList<>(lines.subList(0, Math.min(lines.size(), MAX_LINES)));
    if (total > result.size()) {
      result.add("ve %d kayıt daha".formatted(total - result.size()));
    }
    return result;
  }
}
