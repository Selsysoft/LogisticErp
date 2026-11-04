package org.ece.blackrose.identity.service;

import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Locale;
import java.util.OptionalLong;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** RFC 6238 TOTP: HMAC-SHA1, 30 saniye, 6 hane. */
public final class Totp {

  private static final String BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  private static final int SECRET_BYTES = 20;
  private static final long STEP_SECONDS = 30;
  private static final int ALLOWED_DRIFT_STEPS = 1;
  private static final SecureRandom RANDOM = new SecureRandom();

  private Totp() {}

  public static String newSecret() {
    byte[] bytes = new byte[SECRET_BYTES];
    RANDOM.nextBytes(bytes);
    return base32Encode(bytes);
  }

  public static long stepAt(long epochSeconds) {
    return epochSeconds / STEP_SECONDS;
  }

  public static String codeAt(String base32Secret, long step) {
    try {
      Mac mac = Mac.getInstance("HmacSHA1");
      mac.init(new SecretKeySpec(base32Decode(base32Secret), "HmacSHA1"));
      byte[] hash = mac.doFinal(ByteBuffer.allocate(Long.BYTES).putLong(step).array());
      int offset = hash[hash.length - 1] & 0x0f;
      int binary = ByteBuffer.wrap(hash, offset, Integer.BYTES).getInt() & 0x7fffffff;
      return String.format(Locale.ROOT, "%06d", binary % 1_000_000);
    } catch (GeneralSecurityException ex) {
      throw new IllegalStateException(ex);
    }
  }

  /** Eşleşen adımı döner. Daha önce kullanılmış adımlar kabul edilmez. */
  public static OptionalLong matchingStep(
      String base32Secret, String code, long epochSeconds, Long lastUsedStep) {
    long current = stepAt(epochSeconds);
    for (long step = current - ALLOWED_DRIFT_STEPS; step <= current + ALLOWED_DRIFT_STEPS; step++) {
      boolean unused = lastUsedStep == null || step > lastUsedStep;
      if (unused && constantTimeEquals(codeAt(base32Secret, step), code)) {
        return OptionalLong.of(step);
      }
    }
    return OptionalLong.empty();
  }

  private static boolean constantTimeEquals(String expected, String actual) {
    return MessageDigest.isEqual(expected.getBytes(), actual.getBytes());
  }

  static String base32Encode(byte[] data) {
    StringBuilder out = new StringBuilder();
    int buffer = 0;
    int bits = 0;
    for (byte value : data) {
      buffer = (buffer << 8) | (value & 0xff);
      bits += 8;
      while (bits >= 5) {
        out.append(BASE32.charAt((buffer >> (bits - 5)) & 0x1f));
        bits -= 5;
      }
    }
    if (bits > 0) {
      out.append(BASE32.charAt((buffer << (5 - bits)) & 0x1f));
    }
    return out.toString();
  }

  static byte[] base32Decode(String text) {
    ByteBuffer out = ByteBuffer.allocate(text.length() * 5 / 8);
    int buffer = 0;
    int bits = 0;
    for (char symbol : text.toCharArray()) {
      int value = BASE32.indexOf(symbol);
      if (value < 0) {
        throw new IllegalArgumentException("Geçersiz Base32 karakteri");
      }
      buffer = (buffer << 5) | value;
      bits += 5;
      if (bits >= 8) {
        out.put((byte) (buffer >> (bits - 8)));
        bits -= 8;
      }
    }
    return out.array();
  }
}
