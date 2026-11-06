package org.ece.blackrose.fleet.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.ece.blackrose.common.audit.AuditableEntity;

/** Firma başına tek satırlık filo ayarları. */
@Entity
@Table(name = "fleet_settings")
public class FleetSettings extends AuditableEntity {

  public static final int SINGLETON_ID = 1;

  @Id private Integer id;
  private boolean blockOnExpired;
  private int reminderDays;
  private boolean reminderEmail;

  protected FleetSettings() {}

  public void update(boolean blockOnExpired, int reminderDays, boolean reminderEmail) {
    this.blockOnExpired = blockOnExpired;
    this.reminderDays = reminderDays;
    this.reminderEmail = reminderEmail;
  }

  public boolean isReminderEmail() {
    return reminderEmail;
  }

  public boolean isBlockOnExpired() {
    return blockOnExpired;
  }

  public int getReminderDays() {
    return reminderDays;
  }
}
