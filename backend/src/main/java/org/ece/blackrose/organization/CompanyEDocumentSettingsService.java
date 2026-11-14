package org.ece.blackrose.organization;

import java.util.UUID;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.CompanyDtos.CompanyEDocumentSettingsResponse;
import org.ece.blackrose.organization.CompanyDtos.SaveCompanyEDocumentSettingsRequest;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.security.crypto.encrypt.TextEncryptor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Şirket başına e-belge ayarı (ZTO Uyumsoft ayar ekranı). 12.1a'da yalnız saklanır; gönderimi
 * etkilemez (Faz 12.10). Entegratör şifresi şifreli saklanır ve hiçbir yanıtta dönmez.
 */
@Service
public class CompanyEDocumentSettingsService {

  private final CompanyEDocumentSettingsRepository settings;
  private final CompanyService companies;
  private final TextEncryptor encryptor;
  private final AuditService audit;

  public CompanyEDocumentSettingsService(
      CompanyEDocumentSettingsRepository settings,
      CompanyService companies,
      @Qualifier("edocumentSecretEncryptor") TextEncryptor encryptor,
      AuditService audit) {
    this.settings = settings;
    this.companies = companies;
    this.encryptor = encryptor;
    this.audit = audit;
  }

  @Transactional(readOnly = true)
  public CompanyEDocumentSettingsResponse get(UUID companyId) {
    Company company = companies.findVisible(companyId);
    return toResponse(
        company,
        settings.findById(companyId).orElseGet(() -> new CompanyEDocumentSettings(companyId)));
  }

  /** Boş ya da null şifre kayıtlı şifreyi korur (ZTO davranışı). */
  @Transactional
  public CompanyEDocumentSettingsResponse save(
      UUID companyId, SaveCompanyEDocumentSettingsRequest request) {
    Company company = companies.findVisible(companyId);
    CompanyEDocumentSettings row =
        settings.findById(companyId).orElseGet(() -> new CompanyEDocumentSettings(companyId));
    row.update(
        request.enabled(),
        request.testMode(),
        CompanyService.blankToNull(request.serviceUrl()),
        CompanyService.blankToNull(request.username()),
        request.defaultProfile(),
        CompanyService.blankToNull(request.invoiceSeries()),
        CompanyService.blankToNull(request.despatchSeries()),
        request.despatchEnabled(),
        request.inboxEnabled());
    if (request.password() != null && !request.password().isEmpty()) {
      row.setPasswordEnc(encryptor.encrypt(request.password()));
    }
    CompanyEDocumentSettings saved = settings.save(row);
    audit.record(AuditEvent.COMPANY_EDOCUMENT_SETTINGS_UPDATED, company.getCode(), null);
    return toResponse(company, saved);
  }

  private static CompanyEDocumentSettingsResponse toResponse(
      Company company, CompanyEDocumentSettings row) {
    return new CompanyEDocumentSettingsResponse(
        company.getId(),
        row.getProvider(),
        row.isEnabled(),
        row.isTestMode(),
        row.getServiceUrl(),
        row.getUsername(),
        row.getPasswordEnc() != null,
        row.getDefaultProfile(),
        row.getInvoiceSeries(),
        row.getDespatchSeries(),
        row.isDespatchEnabled(),
        row.isInboxEnabled(),
        row.getInboxLastSync(),
        company.getTaxNumber(),
        company.getTitle());
  }
}
