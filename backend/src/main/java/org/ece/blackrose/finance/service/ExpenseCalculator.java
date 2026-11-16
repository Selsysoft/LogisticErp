package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import org.ece.blackrose.common.error.BusinessException;
import org.springframework.http.HttpStatus;

/**
 * Masraf satır ve başlık hesapları (12.7_TASARIM §3.2.3; ön yüz {@code expenseFormLogic.ts} aynı
 * kuralları uygular). Ara sonuçlar 2 haneye HALF_UP yuvarlanır. ZTO hatası düzeltilmiştir: diğer
 * vergiler toplama eklenir ({@code toplam = net + KDV + diğer − tevkifat}).
 */
public final class ExpenseCalculator {

  private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

  private ExpenseCalculator() {}

  /** Satır girdisi; oranlar yüzde (0–100). Boş tutar ve oranlar sıfır sayılır. */
  public record ExpenseLineInput(
      BigDecimal quantity,
      BigDecimal unitPrice,
      BigDecimal discountRate,
      BigDecimal vatRate,
      BigDecimal withholdingAmount,
      BigDecimal otherTaxAmount) {}

  /** Satırın ya da başlığın hesaplanmış tutarları. */
  public record ExpenseCalcAmounts(
      BigDecimal subTotal,
      BigDecimal discountAmount,
      BigDecimal netAmount,
      BigDecimal vatAmount,
      BigDecimal withholdingAmount,
      BigDecimal otherTaxAmount,
      BigDecimal totalAmount) {

    static ExpenseCalcAmounts zero() {
      BigDecimal z = round(BigDecimal.ZERO);
      return new ExpenseCalcAmounts(z, z, z, z, z, z, z);
    }

    ExpenseCalcAmounts plus(ExpenseCalcAmounts o) {
      return new ExpenseCalcAmounts(
          subTotal.add(o.subTotal),
          discountAmount.add(o.discountAmount),
          netAmount.add(o.netAmount),
          vatAmount.add(o.vatAmount),
          withholdingAmount.add(o.withholdingAmount),
          otherTaxAmount.add(o.otherTaxAmount),
          totalAmount.add(o.totalAmount));
    }
  }

  /** Satır sonuçları (girdi sırasıyla) ve başlık toplamları. */
  public record ExpenseCalcResult(List<ExpenseCalcAmounts> lines, ExpenseCalcAmounts totals) {}

  /**
   * Satırları ve başlığı hesaplar.
   *
   * @throws BusinessException 400 {@code WITHHOLDING_EXCEEDS_VAT} tevkifat KDV'yi aşarsa; 400
   *     {@code AMOUNT_INVALID} satır toplamı eksi, başlık toplamı sıfır/eksi ya da satır yoksa
   */
  public static ExpenseCalcResult calculate(List<ExpenseLineInput> inputs) {
    if (inputs == null || inputs.isEmpty()) {
      throw amountInvalid("Masrafta en az bir satır olmalıdır.");
    }
    List<ExpenseCalcAmounts> lines = new ArrayList<>(inputs.size());
    ExpenseCalcAmounts totals = ExpenseCalcAmounts.zero();
    for (ExpenseLineInput input : inputs) {
      ExpenseCalcAmounts line = line(Objects.requireNonNull(input, "line"));
      lines.add(line);
      totals = totals.plus(line);
    }
    if (totals.totalAmount().signum() <= 0) {
      throw amountInvalid("Masraf toplamı sıfırdan büyük olmalıdır.");
    }
    return new ExpenseCalcResult(List.copyOf(lines), totals);
  }

  /** Tek satırı hesaplar (doğrulamalar {@link #calculate} ile aynı, başlık denetimi hariç). */
  public static ExpenseCalcAmounts line(ExpenseLineInput input) {
    BigDecimal quantity = orZero(input.quantity());
    BigDecimal unitPrice = orZero(input.unitPrice());
    BigDecimal subTotal = round(quantity.multiply(unitPrice));
    BigDecimal discount = round(percent(subTotal, input.discountRate()));
    BigDecimal net = subTotal.subtract(discount);
    BigDecimal vat = round(percent(net, input.vatRate()));
    BigDecimal withholding = round(orZero(input.withholdingAmount()));
    BigDecimal otherTax = round(orZero(input.otherTaxAmount()));
    if (withholding.compareTo(vat) > 0) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "WITHHOLDING_EXCEEDS_VAT", "Tevkifat KDV tutarını aşamaz.");
    }
    BigDecimal total = net.add(vat).add(otherTax).subtract(withholding);
    if (total.signum() < 0) {
      throw amountInvalid("Satır toplamı eksi olamaz.");
    }
    return new ExpenseCalcAmounts(subTotal, discount, net, vat, withholding, otherTax, total);
  }

  private static BigDecimal percent(BigDecimal base, BigDecimal rate) {
    return base.multiply(orZero(rate)).divide(HUNDRED);
  }

  private static BigDecimal round(BigDecimal value) {
    return value.setScale(2, RoundingMode.HALF_UP);
  }

  private static BigDecimal orZero(BigDecimal value) {
    return value == null ? BigDecimal.ZERO : value;
  }

  private static BusinessException amountInvalid(String message) {
    return new BusinessException(HttpStatus.BAD_REQUEST, "AMOUNT_INVALID", message);
  }
}
