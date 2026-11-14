package org.ece.blackrose.organization;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.ece.blackrose.common.audit.AuditColumns;

/**
 * Şirket başına e-belge ayarı (ZTO {@code ZT_UyumsoftSetting}). 12.1a'da yalnız saklanır;
 * gönderimde kullanılması Faz 12.10'dadır. Gönderen VKN/unvan {@link Company}'den okunur.
 */
@Entity
@Table(name = "company_edocument_settings")
public class CompanyEDocumentSettings extends AuditColumns {

  @Id private UUID companyId;
  private String provider;
  private boolean enabled;
  private boolean testMode;
  private String serviceUrl;
  private String username;
  private String passwordEnc;
  private String defaultProfile;
  private String invoiceSeries;
  private String despatchSeries;
  private boolean despatchEnabled;
  private boolean inboxEnabled;
  private Instant inboxLastSync;

  protected CompanyEDocumentSettings() {}

  /** Yeni şirketin varsayılan (kapalı, test modunda) ayarı. */
  public CompanyEDocumentSettings(UUID companyId) {
    this.companyId = companyId;
    this.provider = "TEST";
    this.testMode = true;
    this.defaultProfile = "TICARIFATURA";
  }

  public void update(
      boolean enabled,
      boolean testMode,
      String serviceUrl,
      String username,
      String defaultProfile,
      String invoiceSeries,
      String despatchSeries,
      boolean despatchEnabled,
      boolean inboxEnabled) {
    this.enabled = enabled;
    this.testMode = testMode;
    this.serviceUrl = serviceUrl;
    this.username = username;
    this.defaultProfile = defaultProfile;
    this.invoiceSeries = invoiceSeries;
    this.despatchSeries = despatchSeries;
    this.despatchEnabled = despatchEnabled;
    this.inboxEnabled = inboxEnabled;
  }

  /** Şifrelenmiş parola; düz parola hiçbir zaman saklanmaz. */
  public void setPasswordEnc(String passwordEnc) {
    this.passwordEnc = passwordEnc;
  }

  public UUID getCompanyId() {
    return companyId;
  }

  public String getProvider() {
    return provider;
  }

  public boolean isEnabled() {
    return enabled;
  }

  public boolean isTestMode() {
    return testMode;
  }

  public String getServiceUrl() {
    return serviceUrl;
  }

  public String getUsername() {
    return username;
  }

  public String getPasswordEnc() {
    return passwordEnc;
  }

  public String getDefaultProfile() {
    return defaultProfile;
  }

  public String getInvoiceSeries() {
    return invoiceSeries;
  }

  public String getDespatchSeries() {
    return despatchSeries;
  }

  public boolean isDespatchEnabled() {
    return despatchEnabled;
  }

  public boolean isInboxEnabled() {
    return inboxEnabled;
  }

  public Instant getInboxLastSync() {
    return inboxLastSync;
  }
}
