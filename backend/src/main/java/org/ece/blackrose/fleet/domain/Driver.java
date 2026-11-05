package org.ece.blackrose.fleet.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.fleet.domain.FleetTypes.DriverStatus;
import org.hibernate.annotations.SQLRestriction;

/** Her sürücünün harcırah ve avans için kendi personel carisi vardır. */
@Entity
@Table(name = "driver")
@SQLRestriction("deleted = false")
public class Driver extends AuditableEntity {

  @Id private UUID id;
  private String code;
  private String fullName;
  private String phone;
  private String licenseClass;

  @Enumerated(EnumType.STRING)
  private DriverStatus status;

  private UUID accountId;
  private UUID branchId;

  protected Driver() {}

  public Driver(
      String code,
      String fullName,
      String phone,
      String licenseClass,
      DriverStatus status,
      UUID accountId,
      UUID branchId) {
    this.id = UUID.randomUUID();
    this.code = code;
    this.accountId = accountId;
    update(fullName, phone, licenseClass, status, branchId);
  }

  public final void update(
      String fullName, String phone, String licenseClass, DriverStatus status, UUID branchId) {
    this.fullName = fullName;
    this.phone = phone;
    this.licenseClass = licenseClass;
    this.status = status;
    this.branchId = branchId;
  }

  public UUID getId() {
    return id;
  }

  public String getCode() {
    return code;
  }

  public String getFullName() {
    return fullName;
  }

  public String getPhone() {
    return phone;
  }

  public String getLicenseClass() {
    return licenseClass;
  }

  public DriverStatus getStatus() {
    return status;
  }

  public UUID getAccountId() {
    return accountId;
  }

  public UUID getBranchId() {
    return branchId;
  }
}
