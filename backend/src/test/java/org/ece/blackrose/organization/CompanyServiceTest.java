package org.ece.blackrose.organization;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class CompanyServiceTest {

  @Test
  void seriOnekiKodunIlkDortHarfVeRakamindanTuretilir() {
    assertThat(CompanyService.seriesPrefix("SIR2", "NF", false)).isEqualTo("SIR2-NF");
    assertThat(CompanyService.seriesPrefix("BETA_LOJ", "DF", false)).isEqualTo("BETA-DF");
    assertThat(CompanyService.seriesPrefix("A-B", "NF", false)).isEqualTo("AB-NF");
    assertThat(CompanyService.seriesPrefix("--", "NF", false)).as("harf/rakam yok").isEqualTo("NF");
    assertThat(CompanyService.seriesPrefix("SIR2", "NF", true)).as("varsayılan").isEqualTo("NF");
    assertThat(CompanyService.seriesPrefix(null, "NF", false)).isEqualTo("NF");
  }

  @Test
  void bosMetinNullSayilir() {
    assertThat(CompanyService.blankToNull("  ")).isNull();
    assertThat(CompanyService.blankToNull(null)).isNull();
    assertThat(CompanyService.blankToNull(" a ")).isEqualTo("a");
  }
}
