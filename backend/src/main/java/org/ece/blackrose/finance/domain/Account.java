package org.ece.blackrose.finance.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.UUID;
import java.util.regex.Pattern;
import org.ece.blackrose.common.audit.AuditableEntity;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.CompanyType;
import org.ece.blackrose.identity.security.PersonalDataProtector.TaxIdentity;
import org.hibernate.annotations.SQLRestriction;
import org.springframework.http.HttpStatus;

@Entity
@Table(name = "account")
@SQLRestriction("deleted = false")
public class Account extends AuditableEntity {

  /** 11 haneli değer TCKN'dir; düz kolona yazılamaz ({@link #applyTaxIdentity} kullanılır). */
  private static final Pattern TCKN = Pattern.compile("^[0-9]{11}$");

  /**
   * ZTO cari formunun profil alanları (12.1 §3.2). Vergi numarası ayrı yazılır ({@link
   * #applyTaxIdentity}); {@code addressEnc} servis katmanında şifrelenmiş adrestir.
   */
  public record AccountProfile(
      String code,
      String name,
      AccountType type,
      String subGroup,
      UUID branchId,
      UUID companyId,
      String defaultCurrency,
      String taxOffice,
      CompanyType companyType,
      String phone,
      String email,
      String website,
      String contactName,
      String contactTitle,
      String contactMobile,
      String addressEnc,
      String city,
      String district,
      String country,
      String postalCode,
      String paymentTerms,
      String notes) {}

  @Id private UUID id;
  private String code;
  private String name;

  @Enumerated(EnumType.STRING)
  private AccountType type;

  private String taxNumber;
  private UUID branchId;

  /** NULL = tüm şirketlerde ortak kart. */
  private UUID companyId;

  /** Dolu ise grup şirketini temsil eden intercompany carisi. */
  private UUID representsCompanyId;

  /**
   * Hesap grubu ({@code account_group.code}); türle uyumlu olmalıdır (FK {@code (type,
   * sub_group)}).
   */
  private String subGroup;

  private String defaultCurrency;
  private BigDecimal creditLimit;
  private BigDecimal riskLimit;
  private String taxOffice;

  @Enumerated(EnumType.STRING)
  private CompanyType companyType;

  private String phone;
  private String email;
  private String website;
  private String contactName;
  private String contactTitle;
  private String contactMobile;

  /** Şifreli adres (PersonalDataProtector); açık değer yalnız servis katmanında çözülür. */
  private String addressEnc;

  /** Bireysel carinin TCKN'si (11 hane) şifreli; {@link #taxNumber} bu durumda boştur. */
  private String taxNumberEnc;

  private String taxNumberHash;
  private String taxNumberMasked;
  private String city;
  private String district;
  private String country;
  private String postalCode;
  private String paymentTerms;
  private String notes;
  private boolean active = true;
  private int updateCount;

  protected Account() {}

  /** {@link AccountType#INTERCOMPANY} bu kurucuyla açılamaz (422 {@code ACCOUNT_TYPE_RESERVED}). */
  public Account(String code, String name, AccountType type, String taxNumber, UUID branchId) {
    requireNotReserved(type);
    requirePlainTaxNumber(taxNumber);
    this.id = UUID.randomUUID();
    this.code = code;
    apply(name, type, taxNumber, branchId);
  }

  /** ZTO formundan yeni kart: profil alanları ve limitlerle; vergi numarası ayrıca yazılır. */
  public Account(AccountProfile profile, BigDecimal creditLimit, BigDecimal riskLimit) {
    requireNotReserved(profile.type());
    this.id = UUID.randomUUID();
    this.code = profile.code();
    apply(profile.name(), profile.type(), null, profile.branchId());
    writeProfile(profile);
    this.creditLimit = creditLimit;
    this.riskLimit = riskLimit;
  }

  /**
   * Grup şirketini temsil eden cari (ortak kart, şubesiz). Bu türü kuran tek yoldur; yalnız
   * organization modülünün intercompany servisi çağırır.
   */
  public static Account intercompany(
      String code, String name, String taxNumber, UUID representsCompanyId) {
    Account account = new Account();
    account.id = UUID.randomUUID();
    account.code = code;
    account.representsCompanyId = representsCompanyId;
    account.apply(name, AccountType.INTERCOMPANY, taxNumber, null);
    return account;
  }

  /** Grup carisi değiştirilemez (409); başka kart grup carisine çevrilemez (422). */
  public void update(String name, AccountType type, String taxNumber, UUID branchId) {
    requireNotIntercompany();
    requireNotReserved(type);
    requirePlainTaxNumber(taxNumber);
    apply(name, type, taxNumber, branchId);
  }

  /**
   * ZTO düzenleme formu: tüm profil alanları yazılır, sayaç artar. Tür değişim kuralı ve grup uyumu
   * servis katmanındadır ({@code AccountAccess.requireTypeChange}).
   */
  public void updateProfile(AccountProfile profile) {
    requireNotIntercompany();
    requireNotReserved(profile.type());
    this.code = profile.code();
    apply(profile.name(), profile.type(), taxNumber, profile.branchId());
    writeProfile(profile);
    updateCount++;
  }

  /**
   * Vergi kimliği: VKN (ya da yabancı no) düz, TCKN şifreli + hash + maskeli. İkisi birlikte
   * dolmaz.
   */
  public void applyTaxIdentity(TaxIdentity identity) {
    this.taxNumber = identity.plain();
    this.taxNumberEnc = identity.enc();
    this.taxNumberHash = identity.hash();
    this.taxNumberMasked = identity.masked();
  }

  /** Kart (konsolide) kredi ve risk limiti; yalnız gösterim/uyarı içindir. */
  public void setLimits(BigDecimal creditLimit, BigDecimal riskLimit) {
    this.creditLimit = creditLimit;
    this.riskLimit = riskLimit;
    updateCount++;
  }

  /** Grup carisi pasifleştirilemez/aktifleştirilemez (409); durum değişirse sayaç artar. */
  public void activate() {
    requireNotIntercompany();
    if (!active) {
      active = true;
      updateCount++;
    }
  }

  public void deactivate() {
    requireNotIntercompany();
    if (active) {
      active = false;
      updateCount++;
    }
  }

  /** Grup carisinin adı ve vergi numarası şirket kartından eşitlenir. */
  public void syncIntercompany(String name, String taxNumber) {
    this.name = name;
    this.taxNumber = taxNumber;
  }

  /** Grup carisi silinemez; şirket kartından yönetilir. */
  @Override
  public void markDeleted() {
    requireNotIntercompany();
    super.markDeleted();
  }

  private void apply(String name, AccountType type, String taxNumber, UUID branchId) {
    if (type != this.type || subGroup == null) {
      // Tür değişince eski grup FK'yi (type, sub_group) bozar; türün varsayılan grubuna geçilir.
      this.subGroup = type.defaultSubGroup();
    }
    this.name = name;
    this.type = type;
    this.taxNumber = taxNumber;
    this.branchId = branchId;
  }

  private void writeProfile(AccountProfile p) {
    this.subGroup = p.subGroup() == null ? p.type().defaultSubGroup() : p.subGroup();
    this.companyId = p.companyId();
    this.defaultCurrency = p.defaultCurrency();
    this.taxOffice = p.taxOffice();
    this.companyType = p.companyType();
    this.phone = p.phone();
    this.email = p.email();
    this.website = p.website();
    this.contactName = p.contactName();
    this.contactTitle = p.contactTitle();
    this.contactMobile = p.contactMobile();
    this.addressEnc = p.addressEnc();
    this.city = p.city();
    this.district = p.district();
    this.country = p.country();
    this.postalCode = p.postalCode();
    this.paymentTerms = p.paymentTerms();
    this.notes = p.notes();
  }

  /** TCKN düz kolona yazılmaz; servisler {@code PersonalDataProtector.taxIdentity} kullanır. */
  private static void requirePlainTaxNumber(String taxNumber) {
    if (taxNumber != null && TCKN.matcher(taxNumber.trim()).matches()) {
      throw new IllegalArgumentException("TCKN düz yazılamaz; applyTaxIdentity kullanılmalı.");
    }
  }

  /** Grup carisi şirket kartından yönetilir (409 {@code INTERCOMPANY_ACCOUNT_LOCKED}). */
  public void requireNotIntercompany() {
    if (representsCompanyId != null) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "INTERCOMPANY_ACCOUNT_LOCKED",
          "Grup şirketi carisi şirket kartından yönetilir.");
    }
  }

  /** Elle açılamayan cari türü için 422. */
  public static void requireNotReserved(AccountType type) {
    if (type == AccountType.INTERCOMPANY) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY, "ACCOUNT_TYPE_RESERVED", "Bu cari türü elle açılamaz.");
    }
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

  public AccountType getType() {
    return type;
  }

  public String getTaxNumber() {
    return taxNumber;
  }

  public UUID getBranchId() {
    return branchId;
  }

  public UUID getCompanyId() {
    return companyId;
  }

  public UUID getRepresentsCompanyId() {
    return representsCompanyId;
  }

  public String getSubGroup() {
    return subGroup;
  }

  public String getDefaultCurrency() {
    return defaultCurrency;
  }

  public BigDecimal getCreditLimit() {
    return creditLimit;
  }

  public BigDecimal getRiskLimit() {
    return riskLimit;
  }

  public String getTaxOffice() {
    return taxOffice;
  }

  public CompanyType getCompanyType() {
    return companyType;
  }

  public String getPhone() {
    return phone;
  }

  public String getEmail() {
    return email;
  }

  public String getWebsite() {
    return website;
  }

  public String getContactName() {
    return contactName;
  }

  public String getContactTitle() {
    return contactTitle;
  }

  public String getContactMobile() {
    return contactMobile;
  }

  public String getAddressEnc() {
    return addressEnc;
  }

  public String getTaxNumberEnc() {
    return taxNumberEnc;
  }

  public String getTaxNumberHash() {
    return taxNumberHash;
  }

  public String getTaxNumberMasked() {
    return taxNumberMasked;
  }

  public String getCity() {
    return city;
  }

  public String getDistrict() {
    return district;
  }

  public String getCountry() {
    return country;
  }

  public String getPostalCode() {
    return postalCode;
  }

  public String getPaymentTerms() {
    return paymentTerms;
  }

  public String getNotes() {
    return notes;
  }

  public boolean isActive() {
    return active;
  }

  public int getUpdateCount() {
    return updateCount;
  }
}
