package org.ece.blackrose.crm.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

@Entity
@Table(name = "contact")
@SQLRestriction("deleted = false")
public class Contact extends AuditableEntity {

  @Id private UUID id;
  private UUID accountId;
  private String fullName;
  private String title;
  private String email;
  private String phone;
  private boolean notifyDeliveries;

  protected Contact() {}

  public Contact(
      UUID accountId,
      String fullName,
      String title,
      String email,
      String phone,
      boolean notifyDeliveries) {
    this.id = UUID.randomUUID();
    this.accountId = accountId;
    update(fullName, title, email, phone, notifyDeliveries);
  }

  public final void update(
      String fullName, String title, String email, String phone, boolean notifyDeliveries) {
    this.fullName = fullName;
    this.title = title;
    this.email = email;
    this.phone = phone;
    this.notifyDeliveries = notifyDeliveries;
  }

  public UUID getId() {
    return id;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public String getFullName() {
    return fullName;
  }

  public String getTitle() {
    return title;
  }

  public String getEmail() {
    return email;
  }

  public String getPhone() {
    return phone;
  }

  /** Sefer teslim edilince takip bağlantılı e-posta alır. */
  public boolean isNotifyDeliveries() {
    return notifyDeliveries;
  }
}
