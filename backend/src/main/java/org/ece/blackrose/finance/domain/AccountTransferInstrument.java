package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

/**
 * Cari taşımayla yeni cariye geçen çek/senet. Keşideci ({@code account_id}) ve lehtar ({@code
 * endorsed_account_id}) ayrı ayrı izlenir; geri almada yalnız taşınan alan geri döner.
 */
@Entity
@Table(name = "account_transfer_instrument")
@SQLRestriction("deleted = false")
public class AccountTransferInstrument extends AuditableEntity {

  @Id private UUID id;
  private UUID accountTransferId;
  private UUID instrumentId;
  private boolean movedDrawer;
  private boolean movedEndorsee;
  private boolean reverted;

  protected AccountTransferInstrument() {}

  public AccountTransferInstrument(
      UUID accountTransferId, UUID instrumentId, boolean movedDrawer, boolean movedEndorsee) {
    if (!movedDrawer && !movedEndorsee) {
      throw new IllegalArgumentException("Çekin en az bir cari alanı taşınmalıdır.");
    }
    this.id = UUID.randomUUID();
    this.accountTransferId = accountTransferId;
    this.instrumentId = instrumentId;
    this.movedDrawer = movedDrawer;
    this.movedEndorsee = movedEndorsee;
  }

  public void markReverted() {
    this.reverted = true;
  }

  public UUID getId() {
    return id;
  }

  public UUID getAccountTransferId() {
    return accountTransferId;
  }

  public UUID getInstrumentId() {
    return instrumentId;
  }

  public boolean isMovedDrawer() {
    return movedDrawer;
  }

  public boolean isMovedEndorsee() {
    return movedEndorsee;
  }

  public boolean isReverted() {
    return reverted;
  }
}
