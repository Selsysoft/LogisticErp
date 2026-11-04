package org.ece.blackrose.identity.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class TotpTest {

  /** RFC 6238 ek B'deki SHA-1 anahtarı: ASCII "12345678901234567890". */
  private static final String RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

  @Test
  void matchesRfc6238Vectors() {
    assertThat(Totp.codeAt(RFC_SECRET, Totp.stepAt(59))).isEqualTo("287082");
    assertThat(Totp.codeAt(RFC_SECRET, Totp.stepAt(1111111109))).isEqualTo("081804");
    assertThat(Totp.codeAt(RFC_SECRET, Totp.stepAt(20000000000L))).isEqualTo("353130");
  }

  @Test
  void base32RoundTrip() {
    byte[] raw = "12345678901234567890".getBytes(StandardCharsets.US_ASCII);

    assertThat(Totp.base32Encode(raw)).isEqualTo(RFC_SECRET);
    assertThat(Totp.base32Decode(RFC_SECRET)).isEqualTo(raw);
  }

  @Test
  void acceptsOneStepDriftButNotMore() {
    long now = 1_000_000_020L;
    long step = Totp.stepAt(now);

    assertThat(Totp.matchingStep(RFC_SECRET, Totp.codeAt(RFC_SECRET, step - 1), now, null))
        .hasValue(step - 1);
    assertThat(Totp.matchingStep(RFC_SECRET, Totp.codeAt(RFC_SECRET, step + 2), now, null))
        .isEmpty();
  }

  @Test
  void rejectsReusedCode() {
    long now = 1_000_000_020L;
    long step = Totp.stepAt(now);

    assertThat(Totp.matchingStep(RFC_SECRET, Totp.codeAt(RFC_SECRET, step), now, step)).isEmpty();
  }
}
