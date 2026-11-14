package org.ece.blackrose.finance.service;

/**
 * Cari hareket açıklaması {@code account_transaction.description} (VARCHAR 500) sınırına sığar
 * (12.1 §3.4 F7). Önek eklenen açıklamalar ("Belge iptali: …", "ZTO ekranından silindi: …", "Cari
 * taşıma: …") kesilir; tam metin kaynak belgede kalır.
 */
public final class LedgerDescriptions {

  public static final int MAX = 500;
  private static final String ELLIPSIS = "...";

  private LedgerDescriptions() {}

  /** {@code null} → {@code null}; 500 karakteri aşan metin "..." ile 500'e kısaltılır. */
  public static String fit(String text) {
    if (text == null || text.length() <= MAX) {
      return text;
    }
    return text.substring(0, MAX - ELLIPSIS.length()) + ELLIPSIS;
  }
}
