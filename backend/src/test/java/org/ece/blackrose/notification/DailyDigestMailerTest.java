package org.ece.blackrose.notification;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;
import org.ece.blackrose.organization.BranchFilter;
import org.junit.jupiter.api.Test;

/** Günlük özet içerik önbelleği anahtarı: kapsam + personel carisi izni (SEC-12.1-03). */
class DailyDigestMailerTest {

  @Test
  void anahtarKapsamVePersonelIzniniAyirir() {
    UUID first = UUID.fromString("00000000-0000-0000-0000-000000000001");
    UUID second = UUID.fromString("00000000-0000-0000-0000-000000000002");

    assertThat(DailyDigestMailer.scopeKey(BranchFilter.all(null), true)).isEqualTo("ALL|E");
    assertThat(DailyDigestMailer.scopeKey(BranchFilter.all(null), false)).isEqualTo("ALL|-");
    assertThat(
            DailyDigestMailer.scopeKey(BranchFilter.limited(null, List.of(second, first)), false))
        .isEqualTo(first + "," + second + "|-");
    assertThat(DailyDigestMailer.scopeKey(BranchFilter.limited(null, List.of(first, second)), true))
        .isEqualTo(first + "," + second + "|E");
  }
}
