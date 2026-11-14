package org.ece.blackrose.finance.domain;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class AccountDocumentTaxTest {

  private static final UUID DOC = UUID.randomUUID();

  @Test
  void iskontoKdvVeStopajZtoFormuluyleHesaplanir() {
    AccountDocumentTax tax =
        AccountDocumentTax.compute(DOC, bd("1000"), bd("10"), bd("20"), bd("36"), bd("4.50"));

    assertThat(tax.getDocumentId()).isEqualTo(DOC);
    assertThat(tax.getGrossAmount()).isEqualByComparingTo("1000");
    assertThat(tax.getDiscountRate()).isEqualByComparingTo("10");
    assertThat(tax.getDiscountAmount()).isEqualByComparingTo("100.00");
    assertThat(tax.getNetExclVat()).isEqualByComparingTo("900.00");
    assertThat(tax.getVatRate()).isEqualByComparingTo("20");
    assertThat(tax.getVatAmount()).isEqualByComparingTo("180.00");
    assertThat(tax.getTotalInclVat()).isEqualByComparingTo("1080.00");
    assertThat(tax.getWithholdingAmount()).isEqualByComparingTo("36");
    assertThat(tax.getOtherTaxesAmount()).isEqualByComparingTo("4.50");
    assertThat(tax.getNetPayable()).isEqualByComparingTo("1039.50");
  }

  @Test
  void araTutarlarIkiHaneHalfUpYuvarlanir() {
    // 333.33 × %7.5 = 24.99975 → 25.00; (333.33 − 25.00) × %18 = 55.4994 → 55.50
    AccountDocumentTax tax =
        AccountDocumentTax.compute(DOC, bd("333.33"), bd("7.5"), bd("18"), null, null);

    assertThat(tax.getDiscountAmount()).isEqualByComparingTo("25.00");
    assertThat(tax.getDiscountAmount().scale()).isEqualTo(2);
    assertThat(tax.getNetExclVat()).isEqualByComparingTo("308.33");
    assertThat(tax.getVatAmount()).isEqualByComparingTo("55.50");
    assertThat(tax.getTotalInclVat()).isEqualByComparingTo("363.83");
    assertThat(tax.getNetPayable()).isEqualByComparingTo("363.83");
  }

  @Test
  void oranlarSifirVeBosOlunca() {
    AccountDocumentTax tax = AccountDocumentTax.compute(DOC, bd("250"), null, bd("0"), null, null);

    assertThat(tax.getDiscountRate()).isZero();
    assertThat(tax.getDiscountAmount()).isZero();
    assertThat(tax.getVatAmount()).isZero();
    assertThat(tax.getWithholdingAmount()).isZero();
    assertThat(tax.getOtherTaxesAmount()).isZero();
    assertThat(tax.getNetPayable()).isEqualByComparingTo("250");
  }

  @Test
  void netOdenecekNegatifCikabilir() {
    // Servis bu durumu 422 AMOUNT_INVALID ile reddeder (§3.4).
    AccountDocumentTax tax =
        AccountDocumentTax.compute(DOC, bd("100"), bd("0"), bd("0"), bd("150"), bd("0"));

    assertThat(tax.getNetPayable()).isEqualByComparingTo("-50");
  }

  private static BigDecimal bd(String value) {
    return new BigDecimal(value);
  }
}
