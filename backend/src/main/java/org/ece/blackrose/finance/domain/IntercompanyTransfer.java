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
import org.ece.blackrose.finance.domain.FinanceTypes.IntercompanyReason;
import org.ece.blackrose.finance.domain.FinanceTypes.TransferStatus;
import org.hibernate.annotations.SQLRestriction;
import org.springframework.http.HttpStatus;

/**
 * Şirketler arası virman (V32, K-12.2-2; MX5 D8): A şirketinde grup şirketi B carisine ödeme
 * (PAYMENT) + B şirketinde grup şirketi A carisinden tahsilat (COLLECTION), tek işlemde. Bacaklar
 * settlement'tır; bağ {@code paymentSettlementId}/{@code collectionSettlementId}. Settlement
 * anahtarları kimlikten türetildiği için ({@code ict:<id>:P/C}) kimlik kurucuda üretilir;
 * settlement'lar yazıldıktan sonra {@link #attachSettlements} ile bağlanır ve kayıt öyle yapılır
 * (iki kolon NOT NULL). Tür yalnız EFT/WIRE/BANK_TO_CASH/CASH_TO_BANK/CASH_TO_CASH (CHECK).
 */
@Entity
@Table(name = "intercompany_transfer")
@SQLRestriction("deleted = false")
public class IntercompanyTransfer extends AuditableEntity {

  @Id private UUID id;
  private String code;

  @Enumerated(EnumType.STRING)
  private FundTransferType transferType;

  @Enumerated(EnumType.STRING)
  private IntercompanyReason reasonType;

  private LocalDate transferDate;
  private UUID fromCompanyId;
  private UUID toCompanyId;
  private UUID fromBranchId;
  private UUID toBranchId;
  private UUID fromFundId;
  private UUID toFundId;
  private BigDecimal amount;
  private String currency;
  private UUID paymentSettlementId;
  private UUID collectionSettlementId;
  private String documentNo;
  private String description;

  @Enumerated(EnumType.STRING)
  private TransferStatus status;

  private LocalDate reversedAt;
  private String reversalReason;
  private String idempotencyKey;

  protected IntercompanyTransfer() {}

  /** Taraflar: {@code from} parayı gönderen (ödeme), {@code to} alan (tahsilat) şirkettir. */
  public record Side(UUID companyId, UUID branchId, UUID fundId) {}

  public IntercompanyTransfer(
      String code,
      FundTransferType transferType,
      IntercompanyReason reasonType,
      LocalDate transferDate,
      Side from,
      Side to,
      Money money,
      String documentNo,
      String description,
      String idempotencyKey) {
    this.id = UUID.randomUUID();
    this.code = code;
    this.transferType = transferType;
    this.reasonType = reasonType;
    this.transferDate = transferDate;
    this.fromCompanyId = from.companyId();
    this.fromBranchId = from.branchId();
    this.fromFundId = from.fundId();
    this.toCompanyId = to.companyId();
    this.toBranchId = to.branchId();
    this.toFundId = to.fundId();
    this.amount = money.amount();
    this.currency = money.currency();
    this.documentNo = documentNo;
    this.description = description;
    this.status = TransferStatus.POSTED;
    this.idempotencyKey = idempotencyKey;
  }

  /** Ödeme (A) ve tahsilat (B) settlement'larını bağlar; kayıttan önce çağrılır. */
  public void attachSettlements(UUID paymentSettlementId, UUID collectionSettlementId) {
    this.paymentSettlementId = paymentSettlementId;
    this.collectionSettlementId = collectionSettlementId;
  }

  /** İptal edilmiş virman için 409; settlement ters kayıtları servis tarafından yazılır. */
  public void markReversed(LocalDate date, String reason) {
    if (status != TransferStatus.POSTED) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "TRANSFER_ALREADY_REVERSED", "Virman zaten iptal edilmiş.");
    }
    this.status = TransferStatus.REVERSED;
    this.reversedAt = date;
    this.reversalReason = reason;
  }

  public Money getMoney() {
    return new Money(amount, currency);
  }

  public UUID getId() {
    return id;
  }

  public String getCode() {
    return code;
  }

  public FundTransferType getTransferType() {
    return transferType;
  }

  public IntercompanyReason getReasonType() {
    return reasonType;
  }

  public LocalDate getTransferDate() {
    return transferDate;
  }

  public UUID getFromCompanyId() {
    return fromCompanyId;
  }

  public UUID getToCompanyId() {
    return toCompanyId;
  }

  public UUID getFromBranchId() {
    return fromBranchId;
  }

  public UUID getToBranchId() {
    return toBranchId;
  }

  public UUID getFromFundId() {
    return fromFundId;
  }

  public UUID getToFundId() {
    return toFundId;
  }

  public UUID getPaymentSettlementId() {
    return paymentSettlementId;
  }

  public UUID getCollectionSettlementId() {
    return collectionSettlementId;
  }

  public String getDocumentNo() {
    return documentNo;
  }

  public String getDescription() {
    return description;
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

  public String getIdempotencyKey() {
    return idempotencyKey;
  }
}
