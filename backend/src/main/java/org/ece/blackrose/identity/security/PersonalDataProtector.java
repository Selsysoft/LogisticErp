package org.ece.blackrose.identity.security;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.regex.Pattern;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.security.crypto.encrypt.Encryptors;
import org.springframework.security.crypto.encrypt.TextEncryptor;
import org.springframework.stereotype.Component;

/**
 * Kişisel veri (adres, IBAN, hesap no, TCKN) için şifreleme, arama hash'i ve maskeleme. Anahtar
 * mevcut {@code totpKey}'dir, tuz ayrıdır (TOTP ve e-belge deseni, {@link CryptoConfig}). Anahtar
 * değişirse şifreli alanlar ve hash'ler okunamaz (docs/KVKK_VERI_ISLEME_KAYDI.md).
 */
@Component
public class PersonalDataProtector {

  private static final String PII_SALT_HEX = "7d2e5b91c4a06f38";
  private static final String HMAC = "HmacSHA256";
  private static final String HASH_CONTEXT = "blackrose:pii-hash:v1";
  private static final Pattern IBAN = Pattern.compile("^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$");
  private static final Pattern TCKN = Pattern.compile("^[0-9]{11}$");
  private static final Pattern SEPARATORS = Pattern.compile("[\\s-]");
  private static final BigInteger NINETY_SEVEN = BigInteger.valueOf(97);
  private static final int TR_IBAN_LENGTH = 26;

  /**
   * Vergi kimliği yazım sonucu: 10 haneli VKN (ya da yabancı no) {@code plain}'de; 11 haneli TCKN
   * şifreli, hash'li ve maskeli; boş girdide hepsi null.
   */
  public record TaxIdentity(String plain, String enc, String hash, String masked) {

    static final TaxIdentity EMPTY = new TaxIdentity(null, null, null, null);
  }

  private final TextEncryptor encryptor;
  private final byte[] hmacKey;

  PersonalDataProtector(SecurityProperties properties) {
    this.encryptor = Encryptors.delux(properties.totpKey(), PII_SALT_HEX);
    this.hmacKey =
        hmac(
            properties.totpKey().getBytes(StandardCharsets.UTF_8),
            HASH_CONTEXT.getBytes(StandardCharsets.UTF_8));
  }

  /** Boş değer şifrelenmez (null döner). Aynı girdi her seferinde farklı şifreli metin verir. */
  public String encrypt(String plain) {
    return plain == null || plain.isBlank() ? null : encryptor.encrypt(plain);
  }

  public String decrypt(String cipher) {
    return cipher == null ? null : encryptor.decrypt(cipher);
  }

  /** Tekillik/arama için sabit hash: HmacSHA256, 64 küçük harf onaltılık. */
  public String hash(String normalized) {
    return HexFormat.of().formatHex(hmac(hmacKey, normalized.getBytes(StandardCharsets.UTF_8)));
  }

  /** 11 haneli değer TCKN sayılır ve korunur; diğerleri düz kalır. */
  public TaxIdentity taxIdentity(String raw) {
    if (raw == null || raw.isBlank()) {
      return TaxIdentity.EMPTY;
    }
    String value = raw.trim();
    if (TCKN.matcher(value).matches()) {
      return new TaxIdentity(null, encrypt(value), hash(value), maskTaxNumber(value));
    }
    return new TaxIdentity(value, null, null, null);
  }

  /** Boşluk ve tireler silinir, büyük harfe çevrilir. */
  public static String normalizeIban(String raw) {
    return raw == null ? null : SEPARATORS.matcher(raw).replaceAll("").toUpperCase(Locale.ROOT);
  }

  /** ISO 13616: biçim, uzunluk (TR için tam 26) ve mod-97 = 1. Girdi normalize edilmiş olmalı. */
  public static boolean isValidIban(String normalized) {
    if (normalized == null || !IBAN.matcher(normalized).matches()) {
      return false;
    }
    if (normalized.startsWith("TR") && normalized.length() != TR_IBAN_LENGTH) {
      return false;
    }
    String rearranged = normalized.substring(4) + normalized.substring(0, 4);
    StringBuilder digits = new StringBuilder(rearranged.length() * 2);
    for (char c : rearranged.toCharArray()) {
      digits.append(Character.isDigit(c) ? String.valueOf(c) : String.valueOf(c - 'A' + 10));
    }
    return new BigInteger(digits.toString()).mod(NINETY_SEVEN).intValue() == 1;
  }

  /** {@code TR33 **** 1326}. */
  public static String maskIban(String normalized) {
    if (normalized == null) {
      return null;
    }
    if (normalized.length() <= 8) {
      return "****";
    }
    return normalized.substring(0, 4) + " **** " + normalized.substring(normalized.length() - 4);
  }

  /** {@code ****1234}; dört ya da daha az karakterde yalnız {@code ****}. */
  public static String maskAccountNumber(String number) {
    if (number == null) {
      return null;
    }
    String value = number.trim();
    return value.length() <= 4 ? "****" : "****" + value.substring(value.length() - 4);
  }

  /** {@code *******5678}. */
  public static String maskTaxNumber(String number) {
    if (number == null) {
      return null;
    }
    String value = number.trim();
    return value.length() <= 4 ? "****" : "*******" + value.substring(value.length() - 4);
  }

  private static byte[] hmac(byte[] key, byte[] data) {
    try {
      Mac mac = Mac.getInstance(HMAC);
      mac.init(new SecretKeySpec(key, HMAC));
      return mac.doFinal(data);
    } catch (GeneralSecurityException ex) {
      throw new IllegalStateException("HmacSHA256 kullanılamıyor.", ex);
    }
  }
}
