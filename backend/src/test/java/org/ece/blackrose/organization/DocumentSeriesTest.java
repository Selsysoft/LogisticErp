package org.ece.blackrose.organization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.junit.jupiter.api.Test;

class DocumentSeriesTest {

  @Test
  void numaraOnekYilVeDolguylaBicimlenir() {
    assertThat(DocumentSeries.format("NF", 2026, 123, 6)).isEqualTo("NF-2026-000123");
    assertThat(DocumentSeries.format("SIR2-DF", 2027, 7, 4)).isEqualTo("SIR2-DF-2027-0007");
    assertThat(DocumentSeries.format("NF", 2026, 1234567, 6)).isEqualTo("NF-2026-1234567");
  }

  @Test
  void sayacBirerIlerlerVeGeriAlinamaz() {
    DocumentSeries series =
        new DocumentSeries(UUID.randomUUID(), DocumentType.FREIGHT_INVOICE, null, "NF", 6);
    assertThat(series.take()).isEqualTo(1);
    assertThat(series.take()).isEqualTo(2);
    assertThat(series.getNextValue()).isEqualTo(3);

    series.update("NFX", 10);
    assertThat(series.getPrefix()).isEqualTo("NFX");
    assertThat(series.take()).isEqualTo(10);
    assertThatThrownBy(() -> series.update("NF", 5))
        .isInstanceOfSatisfying(
            BusinessException.class,
            ex -> assertThat(ex.getCode()).isEqualTo("DOCUMENT_SERIES_BACKWARDS"));
    assertThat(series.getPrefix()).isEqualTo("NFX");
  }

  @Test
  void subeSuzgeciHicBirZamanBosListeVermez() {
    UUID company = UUID.randomUUID();
    UUID branch = UUID.randomUUID();

    BranchFilter all = BranchFilter.all(company);
    assertThat(all.allBranches()).isTrue();
    assertThat(all.companyId()).isEqualTo(company);
    assertThat(all.branchIds()).containsExactly(BranchFilter.NONE);

    BranchFilter limited = BranchFilter.limited(null, List.of(branch));
    assertThat(limited.allBranches()).isFalse();
    assertThat(limited.companyId()).isNull();
    assertThat(limited.branchIds()).containsExactly(branch);

    assertThat(BranchFilter.limited(company, List.of()).branchIds())
        .containsExactly(BranchFilter.NONE);
    assertThat(BranchFilter.limited(company, null).branchIds()).containsExactly(BranchFilter.NONE);
  }
}
