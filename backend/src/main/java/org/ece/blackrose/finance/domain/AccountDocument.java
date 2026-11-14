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
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentSide;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.DocumentPaymentMethod;
import org.hibernate.annotations.SQLRestriction;
import org.springframework.http.HttpStatus;

/**
 * Borç/Alacak Ekle belgesi. Deftere yansıyorsa cari hareketi LedgerService yazar (kaynak {@code
 * ACCOUNT_DOCUMENT}); iptal ters kayıttır, belge silinmez.
 */
@Entity
@Table(name = "account_document")
@SQLRestriction("deleted = false")
public class AccountDocument extends AuditableEntity {

  @Id private UUID id;
  private UUID accountId;
  private UUID branchId;
  private UUID companyId;

  @Enumerated(EnumType.STRING)
  private AccountDocumentSide side;

  private String documentType;
  private String documentNo;
  private LocalDate documentDate;
  private LocalDate dueDate;
  private BigDecimal amount;
  private String currency;
  private BigDecimal exchangeRate;

  @Enumerated(EnumType.STRING)
  private DocumentPaymentMethod paymentMethod;

  private String description;
  private boolean reflectToLedger;

  /** Deftere yazılan tutar (fatura türünde net ödenecek); yansımayan belgede boş. */
  private BigDecimal ledgerAmount;

  @Enumerated(EnumType.STRING)
  private AccountDocumentStatus status;

  private LocalDate cancelDate;
  private String cancelReason;
  private UUID revisedFromId;

  /** Kur farkı belgesinin kaynak hareketi (12.8). */
  private UUID fxSourceTransactionId;

  private String idempotencyKey;

  protected AccountDocument() {}

  public AccountDocument(
      UUID accountId,
      UUID branchId,
      UUID companyId,
      AccountDocumentSide side,
      String documentType,
      String documentNo,
      LocalDate documentDate,
      LocalDate dueDate,
      Money money,
      BigDecimal exchangeRate,
      DocumentPaymentMethod paymentMethod,
      String description,
      boolean reflectToLedger,
      BigDecimal ledgerAmount,
      String idempotencyKey) {
    this.id = UUID.randomUUID();
    this.accountId = accountId;
    this.branchId = branchId;
    this.companyId = companyId;
    this.side = side;
    this.documentType = documentType;
    this.documentNo = documentNo;
    this.documentDate = documentDate;
    this.dueDate = dueDate;
    this.amount = money.amount();
    this.currency = money.currency();
    this.exchangeRate = exchangeRate;
    this.paymentMethod = paymentMethod;
    this.description = description;
    this.reflectToLedger = reflectToLedger;
    this.ledgerAmount = reflectToLedger ? ledgerAmount : null;
    this.status = AccountDocumentStatus.OPEN;
    this.idempotencyKey = idempotencyKey;
  }

  /** İptal (ters kayıt servis katmanında). İptal edilmiş belge için 409. */
  public void cancel(LocalDate date, String reason) {
    if (status != AccountDocumentStatus.OPEN) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "DOCUMENT_ALREADY_CANCELLED", "Belge zaten iptal edilmiş.");
    }
    this.status = AccountDocumentStatus.CANCELLED;
    this.cancelDate = date;
    this.cancelReason = reason;
  }

  /** Bu belge {@code previousId} belgesinin revizesidir (iptal + yeni belge). */
  public void markRevisionOf(UUID previousId) {
    this.revisedFromId = previousId;
  }

  /** Kur farkı belgesini kaynak harekete bağlar (12.8 akışı). */
  public void linkFxSource(UUID transactionId) {
    this.fxSourceTransactionId = transactionId;
  }

  /** Defter yönü: Alacak Ekle → DEBIT (cari bize borçlanır), Borç Ekle → CREDIT. */
  public Direction ledgerDirection() {
    return side == AccountDocumentSide.RECEIVABLE ? Direction.DEBIT : Direction.CREDIT;
  }

  public Money getMoney() {
    return new Money(amount, currency);
  }

  public UUID getId() {
    return id;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public UUID getBranchId() {
    return branchId;
  }

  public UUID getCompanyId() {
    return companyId;
  }

  public AccountDocumentSide getSide() {
    return side;
  }

  public String getDocumentType() {
    return documentType;
  }

  public String getDocumentNo() {
    return documentNo;
  }

  public LocalDate getDocumentDate() {
    return documentDate;
  }

  public LocalDate getDueDate() {
    return dueDate;
  }

  public BigDecimal getAmount() {
    return amount;
  }

  public String getCurrency() {
    return currency;
  }

  public BigDecimal getExchangeRate() {
    return exchangeRate;
  }

  public DocumentPaymentMethod getPaymentMethod() {
    return paymentMethod;
  }

  public String getDescription() {
    return description;
  }

  public boolean isReflectToLedger() {
    return reflectToLedger;
  }

  public BigDecimal getLedgerAmount() {
    return ledgerAmount;
  }

  public AccountDocumentStatus getStatus() {
    return status;
  }

  public LocalDate getCancelDate() {
    return cancelDate;
  }

  public String getCancelReason() {
    return cancelReason;
  }

  public UUID getRevisedFromId() {
    return revisedFromId;
  }

  public UUID getFxSourceTransactionId() {
    return fxSourceTransactionId;
  }

  public String getIdempotencyKey() {
    return idempotencyKey;
  }
}
