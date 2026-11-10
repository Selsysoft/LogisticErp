package org.ece.blackrose.notification.mail;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class WebhookSignatureTest {

  // Standard Webhooks belgesindeki örnek değerler; başka kütüphanelerle uyumu gösterir.
  private static final String SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
  private static final String ID = "msg_p5jXN8AQM9LWM0D4loKWxJek";
  private static final String TIMESTAMP = "1614265330";
  private static final byte[] BODY = "{\"test\": 2432232314}".getBytes(StandardCharsets.UTF_8);
  private static final String EXPECTED = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=";
  private static final Instant NOW = Instant.ofEpochSecond(1614265330);

  private final WebhookSignature signature = new WebhookSignature(SECRET);

  @Test
  void standartOrnekImzayiUretirVeDogrular() {
    assertThat(signature.signatureOf(ID, TIMESTAMP, BODY)).isEqualTo(EXPECTED);
    assertThat(signature.verify(ID, TIMESTAMP, EXPECTED, BODY, NOW)).isTrue();
  }

  @Test
  void anahtarDondurulurkenImzalardanBiriYeterli() {
    String rotating = "v1,eW91IHNoYWxsIG5vdCBwYXNzIHRoaXMgc2lnbmF0dXJlIQ== " + EXPECTED;
    assertThat(signature.verify(ID, TIMESTAMP, rotating, BODY, NOW)).isTrue();
  }

  @Test
  void degisenGovdeKimlikVeyaBaskaAnahtarReddedilir() {
    byte[] changed = "{\"test\": 2432232315}".getBytes(StandardCharsets.UTF_8);
    assertThat(signature.verify(ID, TIMESTAMP, EXPECTED, changed, NOW)).isFalse();
    assertThat(signature.verify("msg_baska", TIMESTAMP, EXPECTED, BODY, NOW)).isFalse();
    assertThat(
            new WebhookSignature("whsec_" + "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=")
                .verify(ID, TIMESTAMP, EXPECTED, BODY, NOW))
        .isFalse();
  }

  @Test
  void eskiVeIleriZamanDamgasiReddedilir() {
    assertThat(signature.verify(ID, TIMESTAMP, EXPECTED, BODY, NOW.plusSeconds(301))).isFalse();
    assertThat(signature.verify(ID, TIMESTAMP, EXPECTED, BODY, NOW.minusSeconds(301))).isFalse();
    assertThat(signature.verify(ID, TIMESTAMP, EXPECTED, BODY, NOW.plusSeconds(299))).isTrue();
  }

  @Test
  void bozukBasliklarReddedilir() {
    assertThat(signature.verify(null, TIMESTAMP, EXPECTED, BODY, NOW)).isFalse();
    assertThat(signature.verify(ID, "dun", EXPECTED, BODY, NOW)).isFalse();
    assertThat(signature.verify(ID, TIMESTAMP, null, BODY, NOW)).isFalse();
    assertThat(signature.verify(ID, TIMESTAMP, "v2," + EXPECTED.substring(3), BODY, NOW)).isFalse();
    assertThat(signature.verify(ID, TIMESTAMP, "v1,%%%", BODY, NOW)).isFalse();
    assertThat(signature.verify(ID, TIMESTAMP, "imza", BODY, NOW)).isFalse();
  }
}
