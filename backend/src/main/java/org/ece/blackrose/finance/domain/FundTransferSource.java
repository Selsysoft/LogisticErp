package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.finance.domain.FinanceTypes.TransferSourceKind;
import org.hibernate.annotations.SQLRestriction;

/**
 * Döviz bozumunun kaynağı (V32): bir tahsilattan ({@code SETTLEMENT}) ya da önceki bir bozumdan
 * ({@code TRANSFER}) kullanılan tutar. Kaynak kalanı yalnız {@code POSTED} transferlerin
 * satırlarıyla hesaplanır; kaynak satırı varken o tahsilat/bozum iptal edilemez.
 */
@Entity
@Table(name = "fund_transfer_source")
@SQLRestriction("deleted = false")
public class FundTransferSource extends AuditableEntity {

  @Id private UUID id;
  private UUID transferId;
  private UUID companyId;

  @Enumerated(EnumType.STRING)
  private TransferSourceKind sourceKind;

  private UUID settlementId;
  private UUID sourceTransferId;
  private BigDecimal usedAmount;

  protected FundTransferSource() {}

  private FundTransferSource(
      UUID transferId,
      UUID companyId,
      TransferSourceKind sourceKind,
      UUID settlementId,
      UUID sourceTransferId,
      BigDecimal usedAmount) {
    this.id = UUID.randomUUID();
    this.transferId = transferId;
    this.companyId = companyId;
    this.sourceKind = sourceKind;
    this.settlementId = settlementId;
    this.sourceTransferId = sourceTransferId;
    this.usedAmount = usedAmount;
  }

  /** Tahsilat kaynağı. */
  public static FundTransferSource ofSettlement(
      UUID transferId, UUID companyId, UUID settlementId, BigDecimal usedAmount) {
    return new FundTransferSource(
        transferId, companyId, TransferSourceKind.SETTLEMENT, settlementId, null, usedAmount);
  }

  /** Önceki bozum kaynağı. */
  public static FundTransferSource ofTransfer(
      UUID transferId, UUID companyId, UUID sourceTransferId, BigDecimal usedAmount) {
    return new FundTransferSource(
        transferId, companyId, TransferSourceKind.TRANSFER, null, sourceTransferId, usedAmount);
  }

  public UUID getId() {
    return id;
  }

  public UUID getTransferId() {
    return transferId;
  }

  public UUID getCompanyId() {
    return companyId;
  }

  public TransferSourceKind getSourceKind() {
    return sourceKind;
  }

  public UUID getSettlementId() {
    return settlementId;
  }

  public UUID getSourceTransferId() {
    return sourceTransferId;
  }

  public BigDecimal getUsedAmount() {
    return usedAmount;
  }
}
