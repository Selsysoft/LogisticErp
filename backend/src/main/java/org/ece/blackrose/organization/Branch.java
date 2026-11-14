package org.ece.blackrose.organization;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

/**
 * İş yeri (ZTO {@code ZT_WorkPlace}; MUI'de eski etiketiyle "Şube"). Her iş yeri bir şirkete,
 * isteğe bağlı olarak aynı şirketin bir şubesine ({@link BranchGroup}) bağlıdır.
 */
@Entity
@Table(name = "branch")
@SQLRestriction("deleted = false")
public class Branch extends AuditableEntity {

  /** İş yerinin düzenlenebilir alanları (kod, şirket ve şube hariç). */
  public record BranchData(
      String name,
      String phone,
      String address,
      String city,
      String district,
      BigDecimal latitude,
      BigDecimal longitude,
      String sgkWorkplaceNo) {}

  @Id private UUID id;
  private String code;
  private String name;
  private UUID companyId;
  private UUID branchGroupId;
  private String phone;
  private String address;
  private String city;
  private String district;
  private BigDecimal latitude;
  private BigDecimal longitude;
  private String sgkWorkplaceNo;
  private boolean active;
  private int updateCount;

  protected Branch() {}

  public Branch(String code, String name, UUID companyId) {
    this.id = UUID.randomUUID();
    this.code = code;
    this.name = name;
    this.companyId = companyId;
    this.active = true;
  }

  /** Tüm alanlarla yeni iş yeri ({@code updateCount = 0}). */
  public Branch(String code, BranchData data, UUID companyId, UUID branchGroupId) {
    this(code, data.name(), companyId);
    this.branchGroupId = branchGroupId;
    apply(data);
  }

  public void update(String code, BranchData data) {
    this.code = code;
    apply(data);
    updateCount++;
  }

  private void apply(BranchData data) {
    this.name = data.name();
    this.phone = data.phone();
    this.address = data.address();
    this.city = data.city();
    this.district = data.district();
    this.latitude = data.latitude();
    this.longitude = data.longitude();
    this.sgkWorkplaceNo = data.sgkWorkplaceNo();
  }

  /** Şirket ve şube ataması; kullanılmış iş yerinin şirketi değiştirilmez (servis 409 verir). */
  public void moveTo(UUID companyId, UUID branchGroupId) {
    this.companyId = companyId;
    this.branchGroupId = branchGroupId;
    updateCount++;
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

  public String getCode() {
    return code;
  }

  public String getName() {
    return name;
  }

  public UUID getCompanyId() {
    return companyId;
  }

  public UUID getBranchGroupId() {
    return branchGroupId;
  }

  public String getPhone() {
    return phone;
  }

  public String getAddress() {
    return address;
  }

  public String getCity() {
    return city;
  }

  public String getDistrict() {
    return district;
  }

  public BigDecimal getLatitude() {
    return latitude;
  }

  public BigDecimal getLongitude() {
    return longitude;
  }

  public String getSgkWorkplaceNo() {
    return sgkWorkplaceNo;
  }

  public boolean isActive() {
    return active;
  }

  public int getUpdateCount() {
    return updateCount;
  }
}
