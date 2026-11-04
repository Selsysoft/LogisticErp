package org.ece.blackrose.common.money;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Tek yerden yapılandırılan yuvarlama kuralı. Değerler tenant kaydından gelir. */
public record MoneyRounding(int scale, RoundingMode mode) {

  public MoneyRounding {
    if (scale < 0) {
      throw new IllegalArgumentException("scale negatif olamaz");
    }
    if (mode == null || mode == RoundingMode.UNNECESSARY) {
      throw new IllegalArgumentException("Geçersiz yuvarlama modu: " + mode);
    }
  }

  public BigDecimal apply(BigDecimal value) {
    return value.setScale(scale, mode);
  }
}
