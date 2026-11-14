package org.ece.blackrose.identity.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import org.ece.blackrose.identity.security.PersonalDataProtector.TaxIdentity;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PersonalDataProtectorTest {

  private static final String KEY = "test-totp-anahtari-en-az-32-bayt-uzunlukta";

  private final PersonalDataProtector protector = new PersonalDataProtector(properties(KEY));

  @Test
  void sifreleVeCozGidisDonus() {
    String cipher = protector.encrypt("Bağdat Cad. No:1");

    assertThat(cipher).isNotEqualTo("Bağdat Cad. No:1");
    assertThat(protector.decrypt(cipher)).isEqualTo("Bağdat Cad. No:1");
    // Aynı girdi farklı şifreli metin verir (rastgele IV).
    assertThat(protector.encrypt("Bağdat Cad. No:1")).isNotEqualTo(cipher);
  }

  @Test
  void bosDegerSifrelenmez() {
    assertThat(protector.encrypt(null)).isNull();
    assertThat(protector.encrypt("  ")).isNull();
    assertThat(protector.decrypt(null)).isNull();
  }

  @Test
  void binKarakterlikTurkceAdresTextKolonunaSigarVeGeriCozulur() {
    String address = "ğüşİöçĞÜŞıÖÇ ".repeat(80).substring(0, 1000);
    assertThat(address).hasSize(1000);

    String cipher = protector.encrypt(address);

    assertThat(protector.decrypt(cipher)).isEqualTo(address);
    assertThat(cipher).doesNotContain("ğüş");
    // AES-GCM onaltılık: 2 × (tuz + IV + UTF-8 bayt + etiket); TEXT kolon sınırsızdır, eski 500
    // karakterlik VARCHAR'a sığmazdı.
    assertThat(cipher.length()).isGreaterThan(500).isLessThan(5000);
  }

  @Test
  void hashSabitVeAnahtaraBagli() {
    String hash = protector.hash("TR330006100519786457841326");

    assertThat(hash).hasSize(64).matches("[0-9a-f]{64}");
    assertThat(protector.hash("TR330006100519786457841326")).isEqualTo(hash);
    assertThat(protector.hash("TR330006100519786457841327")).isNotEqualTo(hash);
    PersonalDataProtector other =
        new PersonalDataProtector(properties("baska-bir-anahtar-en-az-32-bayt-uzunlukta"));
    assertThat(other.hash("TR330006100519786457841326")).isNotEqualTo(hash);
  }

  @ParameterizedTest
  @ValueSource(strings = {"TR330006100519786457841326", "DE89370400440532013000"})
  void gecerliIban(String iban) {
    assertThat(PersonalDataProtector.isValidIban(iban)).isTrue();
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        // son hane değişmiş (mod-97 tutmaz)
        "TR330006100519786457841327",
        // TR 26 hane değil
        "TR33000610051978645784132",
        // biçim: ülke kodu harf değil
        "1R330006100519786457841326",
        // çok kısa
        "DE8937040044",
        ""
      })
  void gecersizIban(String iban) {
    assertThat(PersonalDataProtector.isValidIban(iban)).isFalse();
  }

  @Test
  void nullIbanGecersizdir() {
    assertThat(PersonalDataProtector.isValidIban(null)).isFalse();
  }

  @Test
  void ibanNormalizeVeMaske() {
    String normalized = PersonalDataProtector.normalizeIban(" tr33 0006-1005 1978 6457 8413 26 ");

    assertThat(normalized).isEqualTo("TR330006100519786457841326");
    assertThat(PersonalDataProtector.isValidIban(normalized)).isTrue();
    assertThat(PersonalDataProtector.maskIban(normalized)).isEqualTo("TR33 **** 1326");
    assertThat(PersonalDataProtector.maskIban("TR33")).isEqualTo("****");
    assertThat(PersonalDataProtector.maskIban(null)).isNull();
    assertThat(PersonalDataProtector.normalizeIban(null)).isNull();
  }

  @Test
  void hesapNoVeVergiNoMaskesi() {
    assertThat(PersonalDataProtector.maskAccountNumber("12345678")).isEqualTo("****5678");
    assertThat(PersonalDataProtector.maskAccountNumber("1234")).isEqualTo("****");
    assertThat(PersonalDataProtector.maskAccountNumber(null)).isNull();
    assertThat(PersonalDataProtector.maskTaxNumber("12345678901")).isEqualTo("*******8901");
    assertThat(PersonalDataProtector.maskTaxNumber("123")).isEqualTo("****");
    assertThat(PersonalDataProtector.maskTaxNumber(null)).isNull();
  }

  @Test
  void onBirHaneTcknSifrelenirHashlenirMaskelenir() {
    TaxIdentity identity = protector.taxIdentity(" 10000000146 ");

    assertThat(identity.plain()).isNull();
    assertThat(identity.enc()).doesNotContain("10000000146");
    assertThat(protector.decrypt(identity.enc())).isEqualTo("10000000146");
    assertThat(identity.hash()).isEqualTo(protector.hash("10000000146"));
    assertThat(identity.masked()).isEqualTo("*******0146");
  }

  @Test
  void onHaneVknDuzKalir() {
    TaxIdentity identity = protector.taxIdentity("1234567890");

    assertThat(identity).isEqualTo(new TaxIdentity("1234567890", null, null, null));
  }

  @Test
  void bosVergiNoHepsiNull() {
    assertThat(protector.taxIdentity(null)).isEqualTo(new TaxIdentity(null, null, null, null));
    assertThat(protector.taxIdentity("   ")).isEqualTo(new TaxIdentity(null, null, null, null));
  }

  private static SecurityProperties properties(String totpKey) {
    return new SecurityProperties(
        "jwt-gizli-anahtari-en-az-32-bayt-uzunlukta-olmali",
        totpKey,
        Duration.ofMinutes(15),
        Duration.ofDays(7),
        Duration.ofHours(1),
        "http://localhost:5173",
        "noreply@blackrose.test",
        "saas@blackrose.test",
        "Test-Admin-12345",
        false);
  }
}
