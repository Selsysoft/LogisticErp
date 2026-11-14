package org.ece.blackrose.finance.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EntityListeners;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedBy;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

/**
 * Cari devir / sezon: yalnız tarih sınırıdır, defter kaydı üretmez. Silinen sezon geri
 * getirilebildiği için {@code AuditableEntity}'den türemez ve {@code @SQLRestriction} taşımaz;
 * sorgular {@code deleted} koşulunu kendisi yazar.
 */
@Entity
@Table(name = "account_rollover")
@EntityListeners(AuditingEntityListener.class)
public class AccountRollover {

  @Id private UUID id;
  private UUID accountId;
  private LocalDate rolloverDate;
  private String seasonName;
  private boolean active;
  private String deletedBy;
  private Instant deletedAt;
  private int updateCount;

  @CreatedBy
  @Column(nullable = false, updatable = false)
  private String createdBy;

  @CreatedDate
  @Column(nullable = false, updatable = false)
  private Instant createdAt;

  @LastModifiedBy
  @Column(nullable = false)
  private String updatedBy;

  @LastModifiedDate
  @Column(nullable = false)
  private Instant updatedAt;

  @Column(nullable = false)
  private boolean deleted;

  protected AccountRollover() {}

  public AccountRollover(UUID accountId, LocalDate rolloverDate, String seasonName) {
    this.id = UUID.randomUUID();
    this.accountId = accountId;
    this.rolloverDate = rolloverDate;
    this.seasonName = seasonName;
  }

  public void update(LocalDate rolloverDate, String seasonName) {
    this.rolloverDate = rolloverDate;
    this.seasonName = seasonName;
    updateCount++;
  }

  public void activate() {
    this.active = true;
  }

  public void deactivate() {
    this.active = false;
  }

  /** Silinen sezon aktif kalamaz (CHECK {@code NOT (active AND deleted)}). */
  public void softDelete(String by, Instant at) {
    this.active = false;
    this.deleted = true;
    this.deletedBy = by;
    this.deletedAt = at;
  }

  /** Geri getirilen sezon pasif başlar. */
  public void restore() {
    this.deleted = false;
    this.deletedBy = null;
    this.deletedAt = null;
    this.active = false;
  }

  public UUID getId() {
    return id;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public LocalDate getRolloverDate() {
    return rolloverDate;
  }

  public String getSeasonName() {
    return seasonName;
  }

  public boolean isActive() {
    return active;
  }

  public String getDeletedBy() {
    return deletedBy;
  }

  public Instant getDeletedAt() {
    return deletedAt;
  }

  public int getUpdateCount() {
    return updateCount;
  }

  public String getCreatedBy() {
    return createdBy;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public String getUpdatedBy() {
    return updatedBy;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  public boolean isDeleted() {
    return deleted;
  }
}
