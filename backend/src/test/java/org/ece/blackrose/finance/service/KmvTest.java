package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import org.ece.blackrose.finance.domain.FinanceTypes.FundTransferType;
import org.ece.blackrose.finance.domain.FinanceTypes.TransferCostKind;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;

/** KMV tutarı TL taraftan (ZTO B13 düzeltmesi): taban × oran / 100, 2 hane HALF_UP. */
class KmvTest {

  @ParameterizedTest
  @CsvSource({
    "3000, 0.2, 6.00",
    "1050, 0.2, 2.10",
    "1234.56, 0.1, 1.23",
    "1234.56, 0.15, 1.85",
    "0.01, 0.2, 0.00",
    "100000, 10, 10000.00"
  })
  void tutar(String base, String rate, String expected) {
    assertThat(FundTransferService.kmvAmount(new BigDecimal(base), new BigDecimal(rate)))
        .isEqualByComparingTo(expected)
        .satisfies(v -> assertThat(v.scale()).isEqualTo(2));
  }

  @ParameterizedTest
  @EnumSource(TransferCostKind.class)
  void masrafEtiketleri(TransferCostKind kind) {
    assertThat(FundTransferService.costLabel(kind)).isNotBlank();
  }

  @ParameterizedTest
  @EnumSource(FundTransferType.class)
  void transferTipiEtiketleri(FundTransferType type) {
    assertThat(FundTransferService.typeLabel(type)).isNotBlank();
  }
}
