package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

/**
 * Fatura türü belgenin vergi kırılımı. Tutarlar sunucuda {@link #compute} ile yeniden hesaplanır;
 * istemcinin gönderdiği ara toplamlara güvenilmez (ZTO calculateFaturaAlisDebt/Credit birebir).
 */
@Entity
@Table(name = "account_document_tax")
@SQLRestriction("deleted = false")
public class AccountDocumentTax extends AuditableEntity {

  private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

  @Id private UUID documentId;
  private BigDecimal grossAmount;
  private BigDecimal discountRate;
  private BigDecimal discountAmount;
  private BigDecimal netExclVat;
  private BigDecimal vatRate;
  private BigDecimal vatAmount;
  private BigDecimal totalInclVat;
  private BigDecimal withholdingAmount;
  private BigDecimal otherTaxesAmount;
  private BigDecimal netPayable;

  protected AccountDocumentTax() {}

  /**
   * İskonto = brüt × oran / 100; KDV hariç = brüt − iskonto; KDV = KDV hariç × oran / 100; KDV
   * dahil = KDV hariç + KDV; net ödenecek = KDV dahil − stopaj − diğer vergiler. Ara tutarlar 2
   * hane {@code HALF_UP}. Boş değerler sıfırdır. Net ödenecek negatif çıkabilir; servis reddeder.
   */
  public static AccountDocumentTax compute(
      UUID documentId,
      BigDecimal gross,
      BigDecimal discountRate,
      BigDecimal vatRate,
      BigDecimal withholding,
      BigDecimal otherTaxes) {
    AccountDocumentTax tax = new AccountDocumentTax();
    tax.documentId = documentId;
    tax.grossAmount = gross;
    tax.discountRate = zeroIfNull(discountRate);
    tax.discountAmount = round2(gross.multiply(tax.discountRate).divide(HUNDRED));
    tax.netExclVat = gross.subtract(tax.discountAmount);
    tax.vatRate = zeroIfNull(vatRate);
    tax.vatAmount = round2(tax.netExclVat.multiply(tax.vatRate).divide(HUNDRED));
    tax.totalInclVat = tax.netExclVat.add(tax.vatAmount);
    tax.withholdingAmount = zeroIfNull(withholding);
    tax.otherTaxesAmount = zeroIfNull(otherTaxes);
    tax.netPayable =
        tax.totalInclVat.subtract(tax.withholdingAmount).subtract(tax.otherTaxesAmount);
    return tax;
  }

  private static BigDecimal zeroIfNull(BigDecimal value) {
    return value == null ? BigDecimal.ZERO : value;
  }

  private static BigDecimal round2(BigDecimal value) {
    return value.setScale(2, RoundingMode.HALF_UP);
  }

  public UUID getDocumentId() {
    return documentId;
  }

  public BigDecimal getGrossAmount() {
    return grossAmount;
  }

  public BigDecimal getDiscountRate() {
    return discountRate;
  }

  public BigDecimal getDiscountAmount() {
    return discountAmount;
  }

  public BigDecimal getNetExclVat() {
    return netExclVat;
  }

  public BigDecimal getVatRate() {
    return vatRate;
  }

  public BigDecimal getVatAmount() {
    return vatAmount;
  }

  public BigDecimal getTotalInclVat() {
    return totalInclVat;
  }

  public BigDecimal getWithholdingAmount() {
    return withholdingAmount;
  }

  public BigDecimal getOtherTaxesAmount() {
    return otherTaxesAmount;
  }

  public BigDecimal getNetPayable() {
    return netPayable;
  }
}
