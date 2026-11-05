package org.ece.blackrose.integration.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.integration.domain.IntegrationTypes.StatementLineStatus;

/** Banka ekstresi satırı. Tutar işaretlidir: giren artı, çıkan eksi. Finans kaydı üretmez. */
@Entity
@Table(name = "bank_statement_line")
public class BankStatementLine extends AuditableEntity {

  @Id private UUID id;
  private UUID fundAccountId;
  private LocalDate lineDate;
  private BigDecimal amount;
  private String description;
  private String reference;
  private String externalKey;
  private UUID matchedTransactionId;

  @Enumerated(EnumType.STRING)
  private StatementLineStatus status;

  protected BankStatementLine() {}

  public BankStatementLine(
      UUID fundAccountId,
      LocalDate lineDate,
      BigDecimal amount,
      String description,
      String reference,
      String externalKey) {
    this.id = UUID.randomUUID();
    this.fundAccountId = fundAccountId;
    this.lineDate = lineDate;
    this.amount = amount;
    this.description = description;
    this.reference = reference;
    this.externalKey = externalKey;
    this.status = StatementLineStatus.UNMATCHED;
  }

  public void match(UUID transactionId) {
    matchedTransactionId = transactionId;
    status = StatementLineStatus.MATCHED;
  }

  public void unmatch() {
    matchedTransactionId = null;
    status = StatementLineStatus.UNMATCHED;
  }

  public void ignore() {
    matchedTransactionId = null;
    status = StatementLineStatus.IGNORED;
  }

  public UUID getId() {
    return id;
  }

  public UUID getFundAccountId() {
    return fundAccountId;
  }

  public LocalDate getLineDate() {
    return lineDate;
  }

  public BigDecimal getAmount() {
    return amount;
  }

  public String getDescription() {
    return description;
  }

  public String getReference() {
    return reference;
  }

  public UUID getMatchedTransactionId() {
    return matchedTransactionId;
  }

  public StatementLineStatus getStatus() {
    return status;
  }
}
