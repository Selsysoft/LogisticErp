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
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.FundOpeningStatus;
import org.hibernate.annotations.SQLRestriction;

/**
 * Banka/kasa açılış bakiyesi belgesi (V31). Bakiye etkisi bir {@code FUND_OPENING} hareketidir
 * ({@code source_id} = bu kaydın kimliği). Düzenleme yeni açılış + eskisinin ters kaydıdır; hesap
 * başına en çok bir {@code POSTED} açılış olur (kısmi tekil indeks).
 */
@Entity
@Table(name = "fund_opening")
@SQLRestriction("deleted = false")
public class FundOpening extends AuditableEntity {

  @Id private UUID id;
  private UUID fundAccountId;
  private UUID companyId;

  @Enumerated(EnumType.STRING)
  private FundDirection direction;

  private BigDecimal amount;
  private String currency;
  private LocalDate openingDate;

  @Enumerated(EnumType.STRING)
  private FundOpeningStatus status;

  private LocalDate reversedAt;

  protected FundOpening() {}

  /** {@code money} pozitif tutardır; yönü {@code direction} verir (OUT = eksi açılış). */
  public FundOpening(
      FundAccount fund, FundDirection direction, Money money, LocalDate openingDate) {
    this.id = UUID.randomUUID();
    this.fundAccountId = fund.getId();
    this.companyId = fund.getCompanyId();
    this.direction = direction;
    this.amount = money.amount();
    this.currency = money.currency();
    this.openingDate = openingDate;
    this.status = FundOpeningStatus.POSTED;
  }

  /** Açılış geçersiz olur; ters hareket servis tarafından aynı tarihle yazılır. */
  public void markReversed(LocalDate date) {
    this.status = FundOpeningStatus.REVERSED;
    this.reversedAt = date;
  }

  /** IN pozitif, OUT negatif tutar. */
  public BigDecimal signedAmount() {
    return direction == FundDirection.IN ? amount : amount.negate();
  }

  public Money getMoney() {
    return new Money(amount, currency);
  }

  public UUID getId() {
    return id;
  }

  public UUID getFundAccountId() {
    return fundAccountId;
  }

  public UUID getCompanyId() {
    return companyId;
  }

  public FundDirection getDirection() {
    return direction;
  }

  public BigDecimal getAmount() {
    return amount;
  }

  public String getCurrency() {
    return currency;
  }

  public LocalDate getOpeningDate() {
    return openingDate;
  }

  public FundOpeningStatus getStatus() {
    return status;
  }

  public LocalDate getReversedAt() {
    return reversedAt;
  }
}
