package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.FundTransferType;
import org.ece.blackrose.finance.domain.FinanceTypes.FxCalcMode;
import org.ece.blackrose.finance.domain.FinanceTypes.RateOperation;
import org.ece.blackrose.finance.domain.FinanceTypes.TransferStatus;
import org.hibernate.annotations.SQLRestriction;
import org.springframework.http.HttpStatus;

/**
 * Şirket içi banka/kasa transferi başlığı (V32, transfer merkezi). İki fon da transferin şirketine
 * bağlıdır (bileşik FK). Bacaklar {@code FUND_TRANSFER} fon hareketleridir ({@code source_id} = bu
 * kaydın kimliği); döviz bozumunda iki bacak kendi para birimindedir. Silinmez: iptal ters kayıt,
 * düzenleme yeni transfer ({@code replacesTransferId}) + eskisinin iptalidir.
 */
@Entity
@Table(name = "fund_transfer")
@SQLRestriction("deleted = false")
public class FundTransfer extends AuditableEntity {

  /** Döviz bozumu koşulları; FX olmayan transferde {@code null}. */
  public record FxTerms(BigDecimal rate, RateOperation rateOperation, FxCalcMode calcMode) {}

  @Id private UUID id;
  private UUID companyId;
  private String code;

  @Enumerated(EnumType.STRING)
  private FundTransferType transferType;

  private LocalDate transferDate;
  private UUID sourceFundId;
  private BigDecimal sourceAmount;
  private String sourceCurrency;
  private UUID targetFundId;
  private BigDecimal targetAmount;
  private String targetCurrency;
  private BigDecimal rate;

  @Enumerated(EnumType.STRING)
  private RateOperation rateOperation;

  @Enumerated(EnumType.STRING)
  private FxCalcMode calcMode;

  private BigDecimal fxDiffTl;
  private String documentNo;
  private String description;
  private boolean rulesChecked;

  @Enumerated(EnumType.STRING)
  private TransferStatus status;

  private LocalDate reversedAt;
  private String reversalReason;
  private UUID replacesTransferId;
  private String idempotencyKey;

  protected FundTransfer() {}

  public FundTransfer(
      UUID companyId,
      String code,
      FundTransferType transferType,
      LocalDate transferDate,
      UUID sourceFundId,
      Money sourceMoney,
      UUID targetFundId,
      Money targetMoney,
      FxTerms fx,
      String documentNo,
      String description,
      boolean rulesChecked,
      UUID replacesTransferId,
      String idempotencyKey) {
    this.id = UUID.randomUUID();
    this.companyId = companyId;
    this.code = code;
    this.transferType = transferType;
    this.transferDate = transferDate;
    this.sourceFundId = sourceFundId;
    this.sourceAmount = sourceMoney.amount();
    this.sourceCurrency = sourceMoney.currency();
    this.targetFundId = targetFundId;
    this.targetAmount = targetMoney.amount();
    this.targetCurrency = targetMoney.currency();
    if (fx != null) {
      this.rate = fx.rate();
      this.rateOperation = fx.rateOperation();
      this.calcMode = fx.calcMode();
    }
    this.documentNo = documentNo;
    this.description = description;
    this.rulesChecked = rulesChecked;
    this.status = TransferStatus.POSTED;
    this.replacesTransferId = replacesTransferId;
    this.idempotencyKey = idempotencyKey;
  }

  /** Döviz bozumunun TL kur farkı; yalnız oluşturma işleminde yazılır. */
  public void setFxDiffTl(BigDecimal fxDiffTl) {
    this.fxDiffTl = fxDiffTl;
  }

  /** İptal edilmiş transfer için 409; ters hareketler servis tarafından yazılır. */
  public void markReversed(LocalDate date, String reason) {
    if (status != TransferStatus.POSTED) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "TRANSFER_ALREADY_REVERSED", "Transfer zaten iptal edilmiş.");
    }
    this.status = TransferStatus.REVERSED;
    this.reversedAt = date;
    this.reversalReason = reason;
  }

  public Money getSourceMoney() {
    return new Money(sourceAmount, sourceCurrency);
  }

  public Money getTargetMoney() {
    return new Money(targetAmount, targetCurrency);
  }

  public UUID getId() {
    return id;
  }

  public UUID getCompanyId() {
    return companyId;
  }

  public String getCode() {
    return code;
  }

  public FundTransferType getTransferType() {
    return transferType;
  }

  public LocalDate getTransferDate() {
    return transferDate;
  }

  public UUID getSourceFundId() {
    return sourceFundId;
  }

  public UUID getTargetFundId() {
    return targetFundId;
  }

  public BigDecimal getRate() {
    return rate;
  }

  public RateOperation getRateOperation() {
    return rateOperation;
  }

  public FxCalcMode getCalcMode() {
    return calcMode;
  }

  public BigDecimal getFxDiffTl() {
    return fxDiffTl;
  }

  public String getDocumentNo() {
    return documentNo;
  }

  public String getDescription() {
    return description;
  }

  public boolean isRulesChecked() {
    return rulesChecked;
  }

  public TransferStatus getStatus() {
    return status;
  }

  public LocalDate getReversedAt() {
    return reversedAt;
  }

  public String getReversalReason() {
    return reversalReason;
  }

  public UUID getReplacesTransferId() {
    return replacesTransferId;
  }

  public String getIdempotencyKey() {
    return idempotencyKey;
  }
}
