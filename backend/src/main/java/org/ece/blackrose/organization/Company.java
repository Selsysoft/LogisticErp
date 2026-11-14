package org.ece.blackrose.organization;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.hibernate.annotations.SQLRestriction;

/**
 * Tüzel kişi. Kiracı 2–3 şirket adına işlem yapabilir; para ve yasal belge tablolarının her satırı
 * bir şirkete aittir ({@code company_id}). Her kiracıda tam bir varsayılan şirket vardır.
 */
@Entity
@Table(name = "company")
@SQLRestriction("deleted = false")
public class Company extends AuditableEntity {

  /** Şirket kartının düzenlenebilir alanları. */
  public record CompanyData(
      String title,
      String shortName,
      TaxIdType taxIdType,
      String taxNumber,
      String taxOffice,
      String mersisNo,
      String tradeRegistryNo,
      String sgkWorkplaceNo,
      String address,
      String city,
      String district,
      String postalCode,
      String phone,
      String email,
      String kepAddress,
      String website,
      UUID defaultFundAccountId) {}

  @Id private UUID id;
  private String code;
  private String title;
  private String shortName;

  @Enumerated(EnumType.STRING)
  private TaxIdType taxIdType;

  private String taxNumber;
  private String taxOffice;
  private String mersisNo;
  private String tradeRegistryNo;
  private String sgkWorkplaceNo;
  private String address;
  private String city;
  private String district;
  private String postalCode;
  private String country;
  private String phone;
  private String email;
  private String kepAddress;
  private String website;
  private UUID logoFileId;
  private UUID defaultFundAccountId;

  @Column(name = "is_default")
  private boolean defaultCompany;

  private boolean active;
  private int updateCount;

  protected Company() {}

  public Company(String code, CompanyData data) {
    this(code, data, true, false);
  }

  /** Başlangıç durumu güncelleme sayılmaz ({@code updateCount = 0}). */
  public Company(String code, CompanyData data, boolean active, boolean defaultCompany) {
    this.id = UUID.randomUUID();
    this.code = code;
    this.country = "TR";
    this.active = active;
    this.defaultCompany = defaultCompany;
    apply(data);
  }

  /** Kodu ve kart alanlarını değiştirir. */
  public void update(String code, CompanyData data) {
    this.code = code;
    apply(data);
    updateCount++;
  }

  /** Yalnız vergi kimliği ve adres (eski e-belge ayarı cephesi). */
  public void updateIdentity(
      TaxIdType taxIdType, String taxNumber, String taxOffice, String address) {
    this.taxIdType = taxIdType;
    this.taxNumber = taxNumber;
    this.taxOffice = taxOffice;
    this.address = address;
    updateCount++;
  }

  private void apply(CompanyData data) {
    this.title = data.title();
    this.shortName = data.shortName();
    this.taxIdType = data.taxIdType() == null ? TaxIdType.VKN : data.taxIdType();
    this.taxNumber = data.taxNumber();
    this.taxOffice = data.taxOffice();
    this.mersisNo = data.mersisNo();
    this.tradeRegistryNo = data.tradeRegistryNo();
    this.sgkWorkplaceNo = data.sgkWorkplaceNo();
    this.address = data.address();
    this.city = data.city();
    this.district = data.district();
    this.postalCode = data.postalCode();
    this.phone = data.phone();
    this.email = data.email();
    this.kepAddress = data.kepAddress();
    this.website = data.website();
    this.defaultFundAccountId = data.defaultFundAccountId();
  }

  public void setLogo(UUID logoFileId) {
    this.logoFileId = logoFileId;
    updateCount++;
  }

  public void markDefault(boolean defaultCompany) {
    this.defaultCompany = defaultCompany;
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

  public String getTitle() {
    return title;
  }

  public String getShortName() {
    return shortName;
  }

  public TaxIdType getTaxIdType() {
    return taxIdType;
  }

  public String getTaxNumber() {
    return taxNumber;
  }

  public String getTaxOffice() {
    return taxOffice;
  }

  public String getMersisNo() {
    return mersisNo;
  }

  public String getTradeRegistryNo() {
    return tradeRegistryNo;
  }

  public String getSgkWorkplaceNo() {
    return sgkWorkplaceNo;
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

  public String getPostalCode() {
    return postalCode;
  }

  public String getCountry() {
    return country;
  }

  public String getPhone() {
    return phone;
  }

  public String getEmail() {
    return email;
  }

  public String getKepAddress() {
    return kepAddress;
  }

  public String getWebsite() {
    return website;
  }

  public UUID getLogoFileId() {
    return logoFileId;
  }

  public UUID getDefaultFundAccountId() {
    return defaultFundAccountId;
  }

  public boolean isDefaultCompany() {
    return defaultCompany;
  }

  public boolean isActive() {
    return active;
  }

  public int getUpdateCount() {
    return updateCount;
  }
}
