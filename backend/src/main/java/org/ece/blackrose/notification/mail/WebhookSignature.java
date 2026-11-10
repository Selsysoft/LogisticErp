package org.ece.blackrose.notification.mail;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/**
 * Standard Webhooks imzası (https://www.standardwebhooks.com): {@code webhook-signature}
 * başlığındaki {@code v1,<base64>} değerlerinden biri, {@code "{id}.{timestamp}.{gövde}"} metninin
 * gizli anahtarla HMAC-SHA256 özetine eşit olmalıdır. Gizli anahtar döndürülürken iki imza gelir;
 * biri yeterlidir. Tekrar saldırısına karşı zaman damgası en çok 5 dakika eski (veya ileri)
 * olabilir.
 */
public final class WebhookSignature {

  static final Duration TOLERANCE = Duration.ofMinutes(5);
  private static final String PREFIX = "whsec_";

  private final byte[] key;

  public WebhookSignature(String secret) {
    String encoded = secret.startsWith(PREFIX) ? secret.substring(PREFIX.length()) : secret;
    this.key = Base64.getDecoder().decode(encoded);
  }

  public boolean verify(String id, String timestamp, String signatures, byte[] body, Instant now) {
    if (id == null || timestamp == null || signatures == null || body == null) {
      return false;
    }
    long seconds;
    try {
      seconds = Long.parseLong(timestamp.trim());
    } catch (NumberFormatException ex) {
      return false;
    }
    Duration age = Duration.between(Instant.ofEpochSecond(seconds), now).abs();
    if (age.compareTo(TOLERANCE) > 0) {
      return false;
    }
    byte[] expected = sign(id, timestamp.trim(), body);
    for (String candidate : signatures.trim().split("\\s+")) {
      int comma = candidate.indexOf(',');
      if (comma < 0 || !candidate.substring(0, comma).equals("v1")) {
        continue;
      }
      byte[] given;
      try {
        given = Base64.getDecoder().decode(candidate.substring(comma + 1));
      } catch (IllegalArgumentException ex) {
        continue;
      }
      if (MessageDigest.isEqual(expected, given)) {
        return true;
      }
    }
    return false;
  }

  /** Testlerde ve gelecekte gönderen tarafta kullanılır. */
  public String signatureOf(String id, String timestamp, byte[] body) {
    return "v1," + Base64.getEncoder().encodeToString(sign(id, timestamp, body));
  }

  private byte[] sign(String id, String timestamp, byte[] body) {
    try {
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(key, "HmacSHA256"));
      mac.update((id + "." + timestamp + ".").getBytes(StandardCharsets.UTF_8));
      return mac.doFinal(body);
    } catch (NoSuchAlgorithmException | InvalidKeyException ex) {
      throw new IllegalStateException("HMAC-SHA256 kullanılamıyor", ex);
    }
  }
}
