package org.ece.blackrose.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.organization.TaxIdType;
import org.junit.jupiter.api.Test;

class TaxNumbersTest {

  @Test
  void vknKontrolHanesi() {
    assertThat(TaxNumbers.isValidVkn("1234567890")).isTrue();
    assertThat(TaxNumbers.isValidVkn("4840847211")).isTrue();
    assertThat(TaxNumbers.isValidVkn("1234567891")).isFalse();
    assertThat(TaxNumbers.isValidVkn("123456789")).isFalse();
    assertThat(TaxNumbers.isValidVkn("12345678AB")).isFalse();
    assertThat(TaxNumbers.isValidVkn(null)).isFalse();
  }

  @Test
  void tcknKontrolHaneleri() {
    assertThat(TaxNumbers.isValidTckn("10000000146")).isTrue();
    assertThat(TaxNumbers.isValidTckn("10000000147")).as("11. hane").isFalse();
    assertThat(TaxNumbers.isValidTckn("10000000156")).as("10. hane").isFalse();
    assertThat(TaxNumbers.isValidTckn("01234567890")).as("0 ile başlayamaz").isFalse();
    assertThat(TaxNumbers.isValidTckn("1000000014")).isFalse();
    assertThat(TaxNumbers.isValidTckn(null)).isFalse();
  }

  @Test
  void turUzunlukUyusmazligiGecersizdir() {
    assertThat(TaxNumbers.isValid(TaxIdType.VKN, "1234567890")).isTrue();
    assertThat(TaxNumbers.isValid(TaxIdType.TCKN, "10000000146")).isTrue();
    assertThat(TaxNumbers.isValid(TaxIdType.VKN, "10000000146")).isFalse();
    assertThat(TaxNumbers.isValid(TaxIdType.TCKN, "1234567890")).isFalse();
    assertThat(TaxNumbers.isValid(TaxIdType.VKN, null)).isFalse();
    TaxNumbers.validate(TaxIdType.VKN, "1234567890");
    assertThatThrownBy(() -> TaxNumbers.validate(TaxIdType.TCKN, "1234567890"))
        .isInstanceOfSatisfying(
            BusinessException.class,
            ex -> assertThat(ex.getCode()).isEqualTo("TAX_NUMBER_INVALID"));
  }

  @Test
  void temizlemeVeTurCikarimi() {
    assertThat(TaxNumbers.digitsOnly(" 123-456 7890 ")).isEqualTo("1234567890");
    assertThat(TaxNumbers.digitsOnly("abc")).isNull();
    assertThat(TaxNumbers.digitsOnly(null)).isNull();
    assertThat(TaxNumbers.typeOf("10000000146")).isEqualTo(TaxIdType.TCKN);
    assertThat(TaxNumbers.typeOf("1234567890")).isEqualTo(TaxIdType.VKN);
    assertThat(TaxNumbers.typeOf(null)).isEqualTo(TaxIdType.VKN);
  }
}
