package org.ece.blackrose.common;

import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.organization.TaxIdType;
import org.springframework.http.HttpStatus;

/**
 * Vergi kimlik numarası (VKN, 10 hane) ve T.C. kimlik numarası (TCKN, 11 hane) kontrol hanesi
 * doğrulaması. Saf yardımcı; veritabanı CHECK kısıtları yalnız biçimi denetler.
 */
public final class TaxNumbers {

  private static final int VKN_LENGTH = 10;
  private static final int TCKN_LENGTH = 11;

  private TaxNumbers() {}

  /** Rakam dışı karakterleri atar; sonuç boşsa {@code null}. */
  public static String digitsOnly(String raw) {
    if (raw == null) {
      return null;
    }
    String digits = raw.replaceAll("[^0-9]", "");
    return digits.isEmpty() ? null : digits;
  }

  /** Uzunluktan tür: 11 hane TCKN, diğerleri VKN. */
  public static TaxIdType typeOf(String number) {
    return number != null && number.length() == TCKN_LENGTH ? TaxIdType.TCKN : TaxIdType.VKN;
  }

  public static boolean isValid(TaxIdType type, String number) {
    if (number == null) {
      return false;
    }
    return type == TaxIdType.TCKN ? isValidTckn(number) : isValidVkn(number);
  }

  /** Geçersizse 422 {@code TAX_NUMBER_INVALID}; tür–uzunluk uyuşmazlığı da geçersizdir. */
  public static void validate(TaxIdType type, String number) {
    if (!isValid(type, number)) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY, "TAX_NUMBER_INVALID", "Vergi numarası geçersiz.");
    }
  }

  public static boolean isValidVkn(String number) {
    if (number == null || !number.matches("[0-9]{" + VKN_LENGTH + "}")) {
      return false;
    }
    int[] d = digits(number);
    int sum = 0;
    for (int i = 0; i < VKN_LENGTH - 1; i++) {
      int t = (d[i] + 9 - i) % 10;
      int v = t == 0 ? 0 : (t * (1 << (9 - i))) % 9;
      if (t != 0 && v == 0) {
        v = 9;
      }
      sum += v;
    }
    return (10 - sum % 10) % 10 == d[VKN_LENGTH - 1];
  }

  public static boolean isValidTckn(String number) {
    if (number == null || !number.matches("[1-9][0-9]{" + (TCKN_LENGTH - 1) + "}")) {
      return false;
    }
    int[] d = digits(number);
    int odd = d[0] + d[2] + d[4] + d[6] + d[8];
    int even = d[1] + d[3] + d[5] + d[7];
    int tenth = ((odd * 7 - even) % 10 + 10) % 10;
    if (d[9] != tenth) {
      return false;
    }
    int sum = 0;
    for (int i = 0; i < TCKN_LENGTH - 1; i++) {
      sum += d[i];
    }
    return sum % 10 == d[TCKN_LENGTH - 1];
  }

  private static int[] digits(String number) {
    int[] d = new int[number.length()];
    for (int i = 0; i < d.length; i++) {
      d[i] = number.charAt(i) - '0';
    }
    return d;
  }
}
