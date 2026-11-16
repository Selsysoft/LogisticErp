package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.List;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.service.ExpenseCalculator.ExpenseCalcAmounts;
import org.ece.blackrose.finance.service.ExpenseCalculator.ExpenseCalcResult;
import org.ece.blackrose.finance.service.ExpenseCalculator.ExpenseLineInput;
import org.junit.jupiter.api.Test;

/**
 * Masraf hesap kuralları (12.7_TASARIM §3.2.3): 2 hane HALF_UP, iskonto sınırları, diğer vergi
 * toplama eklenir (ZTO hatası düzeltildi), tevkifat KDV'yi aşamaz.
 */
class ExpenseCalculatorTest {

  private static BigDecimal d(String value) {
    return new BigDecimal(value);
  }

  private static ExpenseLineInput line(
      String qty, String price, String discount, String vat, String wh, String other) {
    return new ExpenseLineInput(d(qty), d(price), d(discount), d(vat), d(wh), d(other));
  }

  @Test
  void satirVeBaslikToplamlariDigerVergiEklenir() {
    ExpenseCalcResult r =
        ExpenseCalculator.calculate(
            List.of(
                line("2", "100", "10", "20", "4", "5"), line("1", "50.5", "0", "10", "0", "0")));

    ExpenseCalcAmounts first = r.lines().get(0);
    assertThat(first.subTotal()).isEqualByComparingTo("200.00");
    assertThat(first.discountAmount()).isEqualByComparingTo("20.00");
    assertThat(first.netAmount()).isEqualByComparingTo("180.00");
    assertThat(first.vatAmount()).isEqualByComparingTo("36.00");
    // 180 + 36 + 5 − 4
    assertThat(first.totalAmount()).isEqualByComparingTo("217.00");

    ExpenseCalcAmounts second = r.lines().get(1);
    assertThat(second.vatAmount()).isEqualByComparingTo("5.05");
    assertThat(second.totalAmount()).isEqualByComparingTo("55.55");

    ExpenseCalcAmounts t = r.totals();
    assertThat(t.subTotal()).isEqualByComparingTo("250.50");
    assertThat(t.discountAmount()).isEqualByComparingTo("20.00");
    assertThat(t.netAmount()).isEqualByComparingTo("230.50");
    assertThat(t.vatAmount()).isEqualByComparingTo("41.05");
    assertThat(t.withholdingAmount()).isEqualByComparingTo("4.00");
    assertThat(t.otherTaxAmount()).isEqualByComparingTo("5.00");
    assertThat(t.totalAmount()).isEqualByComparingTo("272.55");
    assertThat(t.totalAmount().scale()).isEqualTo(2);
  }

  @Test
  void yuvarlamaSinirlariHalfUp() {
    // 1 × 0.005 = 0.005 → 0.01; 0.004 → 0.00
    assertThat(ExpenseCalculator.line(line("1", "0.005", "0", "0", "0", "0")).subTotal())
        .isEqualByComparingTo("0.01");
    assertThat(ExpenseCalculator.line(line("1", "0.004", "0", "0", "0", "0")).subTotal())
        .isEqualByComparingTo("0.00");
    // KDV 10.05 × %10 = 1.005 → 1.01
    ExpenseCalcAmounts vat = ExpenseCalculator.line(line("1", "10.05", "0", "10", "0", "0"));
    assertThat(vat.vatAmount()).isEqualByComparingTo("1.01");
    // İskonto 3.33 × %50 = 1.665 → 1.67; net 1.66
    ExpenseCalcAmounts discount = ExpenseCalculator.line(line("1", "3.33", "50", "0", "0", "0"));
    assertThat(discount.discountAmount()).isEqualByComparingTo("1.67");
    assertThat(discount.netAmount()).isEqualByComparingTo("1.66");
  }

  @Test
  void iskontoSifirVeYuzde100() {
    ExpenseCalcAmounts none = ExpenseCalculator.line(line("3", "10", "0", "20", "0", "0"));
    assertThat(none.discountAmount()).isEqualByComparingTo("0");
    assertThat(none.totalAmount()).isEqualByComparingTo("36.00");

    ExpenseCalcAmounts full = ExpenseCalculator.line(line("3", "10", "100", "20", "0", "0"));
    assertThat(full.netAmount()).isEqualByComparingTo("0");
    assertThat(full.vatAmount()).isEqualByComparingTo("0");
    assertThat(full.totalAmount()).isEqualByComparingTo("0");
    // %100 iskontolu satır diğer satırla birlikte geçerli.
    assertThat(
            ExpenseCalculator.calculate(
                    List.of(
                        line("3", "10", "100", "20", "0", "0"),
                        line("1", "10", "0", "0", "0", "0")))
                .totals()
                .totalAmount())
        .isEqualByComparingTo("10.00");
  }

  @Test
  void tevkifatKdvyeEsitOlabilirAsamaz() {
    ExpenseCalcAmounts equal = ExpenseCalculator.line(line("1", "100", "0", "20", "20", "0"));
    assertThat(equal.totalAmount()).isEqualByComparingTo("100.00");

    assertThatThrownBy(() -> ExpenseCalculator.line(line("1", "100", "0", "20", "20.01", "0")))
        .isInstanceOfSatisfying(
            BusinessException.class,
            e -> assertThat(e.getCode()).isEqualTo("WITHHOLDING_EXCEEDS_VAT"));
  }

  @Test
  void bosAlanlarSifirSayilir() {
    ExpenseCalcAmounts a =
        ExpenseCalculator.line(new ExpenseLineInput(d("2"), d("5"), null, null, null, null));
    assertThat(a.totalAmount()).isEqualByComparingTo("10.00");
    assertThat(a.vatAmount()).isEqualByComparingTo("0");
  }

  @Test
  void gecersizToplamlarReddedilir() {
    assertCode(() -> ExpenseCalculator.calculate(List.of()), "AMOUNT_INVALID");
    assertCode(() -> ExpenseCalculator.calculate(null), "AMOUNT_INVALID");
    // Başlık toplamı sıfır.
    assertCode(
        () -> ExpenseCalculator.calculate(List.of(line("1", "0", "0", "0", "0", "0"))),
        "AMOUNT_INVALID");
    // Satır toplamı eksi: tevkifat ≤ KDV iken eksi olamaz; eksi birim fiyatla denetlenir.
    assertCode(() -> ExpenseCalculator.line(line("1", "-5", "0", "0", "0", "0")), "AMOUNT_INVALID");
  }

  private static void assertCode(Runnable work, String code) {
    assertThatThrownBy(work::run)
        .isInstanceOfSatisfying(
            BusinessException.class, e -> assertThat(e.getCode()).isEqualTo(code));
  }
}
