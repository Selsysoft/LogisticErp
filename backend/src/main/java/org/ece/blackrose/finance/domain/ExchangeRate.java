package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/** 1 birim dövizin TL karşılığı. Tüm tenantlar için ortaktır. */
@Entity
@Table(name = "exchange_rate", schema = "admin")
public class ExchangeRate {

  @Id private UUID id;
  private String currency;
  private LocalDate rateDate;
  private BigDecimal rate;
  private String source;
  private Instant createdAt;

  protected ExchangeRate() {}

  public ExchangeRate(String currency, LocalDate rateDate, BigDecimal rate, String source) {
    this.id = UUID.randomUUID();
    this.currency = currency;
    this.rateDate = rateDate;
    this.rate = rate;
    this.source = source;
    this.createdAt = Instant.now();
  }

  public String getCurrency() {
    return currency;
  }

  public LocalDate getRateDate() {
    return rateDate;
  }

  public BigDecimal getRate() {
    return rate;
  }

  public String getSource() {
    return source;
  }
}
