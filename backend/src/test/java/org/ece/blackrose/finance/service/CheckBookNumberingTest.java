package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;
import org.ece.blackrose.finance.service.CheckBookService.Numbering;
import org.ece.blackrose.finance.service.CheckBookService.PlannedLeaf;
import org.junit.jupiter.api.Test;

/** Koçan yaprak planı (12.3_TASARIM §3.6, §6.3): aralık, sıfır doldurma, MICR, atlama. */
class CheckBookNumberingTest {

  @Test
  void araliktakiHerNumaraIcinYaprakOlusur() {
    Numbering plan = CheckBookService.plan(1234567, 1234617, null, null, Set.of());
    assertThat(plan.leaves()).hasSize(51);
    assertThat(plan.skipped()).isEmpty();
    assertThat(plan.leaves().get(0)).isEqualTo(new PlannedLeaf(1, "1234567", null));
    assertThat(plan.leaves().get(50)).isEqualTo(new PlannedLeaf(51, "1234617", null));
  }

  @Test
  void bastakiSifirlarKorunur() {
    Numbering plan = CheckBookService.plan(42, 44, null, null, Set.of());
    assertThat(plan.leaves())
        .extracting(PlannedLeaf::number)
        .containsExactly("0000042", "0000043", "0000044");
  }

  @Test
  void micrBankaVeSubeKoduylaUretilir() {
    Numbering plan = CheckBookService.plan(7, 8, "0001", "1124", Set.of());
    assertThat(plan.leaves())
        .extracting(PlannedLeaf::micrCode)
        .containsExactly("c0001112400000007", "c0001112400000008");
  }

  @Test
  void kayitliNumaralarAtlanirYaprakNoKonumuKorur() {
    Numbering plan = CheckBookService.plan(100, 104, null, null, Set.of("0000101", "0000103"));
    assertThat(plan.skipped()).containsExactly("0000101", "0000103");
    assertThat(plan.leaves())
        .containsExactly(
            new PlannedLeaf(1, "0000100", null),
            new PlannedLeaf(3, "0000102", null),
            new PlannedLeaf(5, "0000104", null));
  }

  @Test
  void tumuKayitliysaPlanBos() {
    Numbering plan = CheckBookService.plan(5, 6, null, null, Set.of("0000005", "0000006"));
    assertThat(plan.leaves()).isEmpty();
    assertThat(plan.skipped()).hasSize(2);
  }

  @Test
  void tekYaprakliAralik() {
    Numbering plan = CheckBookService.plan(9999999, 9999999, null, null, Set.of());
    assertThat(plan.leaves()).containsExactly(new PlannedLeaf(1, "9999999", null));
  }
}
