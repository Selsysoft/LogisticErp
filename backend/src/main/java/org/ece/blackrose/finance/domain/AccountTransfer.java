package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountTransferStatus;
import org.hibernate.annotations.SQLRestriction;
import org.springframework.http.HttpStatus;

/**
 * Cari taşıma başlığı. Seçilen hareketler virman çifti ({@code ACCOUNT_TRANSFER_OUT/IN}) olarak
 * hedef cariye geçer; bağlı çek/senetler de taşınır. Geri alma bütün olarak yapılır.
 */
@Entity
@Table(name = "account_transfer")
@SQLRestriction("deleted = false")
public class AccountTransfer extends AuditableEntity {

  @Id private UUID id;
  private UUID fromAccountId;
  private UUID toAccountId;
  private LocalDate transferDate;
  private String description;

  @Enumerated(EnumType.STRING)
  private AccountTransferStatus status;

  private LocalDate reverseDate;
  private String idempotencyKey;

  protected AccountTransfer() {}

  public AccountTransfer(
      UUID fromAccountId,
      UUID toAccountId,
      LocalDate transferDate,
      String description,
      String idempotencyKey) {
    this.id = UUID.randomUUID();
    this.fromAccountId = fromAccountId;
    this.toAccountId = toAccountId;
    this.transferDate = transferDate;
    this.description = description;
    this.status = AccountTransferStatus.POSTED;
    this.idempotencyKey = idempotencyKey;
  }

  /** Geri alınmış taşıma için 409. */
  public void reverse(LocalDate date) {
    if (status != AccountTransferStatus.POSTED) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "TRANSFER_ALREADY_REVERSED", "Cari taşıma zaten geri alınmış.");
    }
    this.status = AccountTransferStatus.REVERSED;
    this.reverseDate = date;
  }

  public UUID getId() {
    return id;
  }

  public UUID getFromAccountId() {
    return fromAccountId;
  }

  public UUID getToAccountId() {
    return toAccountId;
  }

  public LocalDate getTransferDate() {
    return transferDate;
  }

  public String getDescription() {
    return description;
  }

  public AccountTransferStatus getStatus() {
    return status;
  }

  public LocalDate getReverseDate() {
    return reverseDate;
  }

  public String getIdempotencyKey() {
    return idempotencyKey;
  }
}
