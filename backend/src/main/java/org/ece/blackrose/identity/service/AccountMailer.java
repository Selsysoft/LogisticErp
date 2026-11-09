package org.ece.blackrose.identity.service;

public interface AccountMailer {

  void sendInvite(String email, String link);

  void sendPasswordReset(String email, String link);

  /** Abonelik bildirimleri. Gönderim hatası iş akışını durdurmaz. */
  default void sendNotice(String email, String subject, String text) {}

  /**
   * Düz metin ve HTML birlikte gönderilir; HTML göstermeyen istemci metni okur. HTML'i
   * desteklemeyen gerçekleme yalnız metni gönderir.
   */
  default void sendNotice(String email, String subject, String text, String html) {
    sendNotice(email, subject, text);
  }
}
