package org.ece.blackrose.organization;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

/**
 * Şube (bölge/il; ZTO {@code ZT_BranchProvince}). İş yerleri ({@link Branch}) bir şubeye bağlanır;
 * şube ve iş yerleri aynı şirkettedir.
 */
@Entity
@Table(name = "branch_group")
@SQLRestriction("deleted = false")
public class BranchGroup extends AuditableEntity {

  /** Şubenin düzenlenebilir alanları. */
  public record BranchGroupData(
      String name,
      BranchGroupType groupType,
      String phone,
      String email,
      String address,
      String managerName,
      String taxNumber,
      String taxOffice) {}

  @Id private UUID id;
  private UUID companyId;
  private String name;

  @Enumerated(EnumType.STRING)
  private BranchGroupType groupType;

  private String phone;
  private String email;
  private String address;
  private String managerName;
  private String taxNumber;
  private String taxOffice;
  private boolean active;
  private int updateCount;

  protected BranchGroup() {}

  public BranchGroup(UUID companyId, BranchGroupData data) {
    this(companyId, data, true);
  }

  public BranchGroup(UUID companyId, BranchGroupData data, boolean active) {
    this.id = UUID.randomUUID();
    this.companyId = companyId;
    this.active = active;
    apply(data);
  }

  public void update(BranchGroupData data) {
    apply(data);
    updateCount++;
  }

  /** Şirket değişimi; şubede iş yeri varken çağrılmamalı (servis 409 verir). */
  public void moveTo(UUID companyId) {
    this.companyId = companyId;
    updateCount++;
  }

  private void apply(BranchGroupData data) {
    this.name = data.name();
    this.groupType = data.groupType();
    this.phone = data.phone();
    this.email = data.email();
    this.address = data.address();
    this.managerName = data.managerName();
    this.taxNumber = data.taxNumber();
    this.taxOffice = data.taxOffice();
  }

  public void activate() {
    this.active = true;
    updateCount++;
  }

  public void deactivate() {
    this.active = false;
    updateCount++;
  }

  public UUID getId() {
    return id;
  }

  public UUID getCompanyId() {
    return companyId;
  }

  public String getName() {
    return name;
  }

  public BranchGroupType getGroupType() {
    return groupType;
  }

  public String getPhone() {
    return phone;
  }

  public String getEmail() {
    return email;
  }

  public String getAddress() {
    return address;
  }

  public String getManagerName() {
    return managerName;
  }

  public String getTaxNumber() {
    return taxNumber;
  }

  public String getTaxOffice() {
    return taxOffice;
  }

  public boolean isActive() {
    return active;
  }

  public int getUpdateCount() {
    return updateCount;
  }
}
