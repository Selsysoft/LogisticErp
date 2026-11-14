package org.ece.blackrose.organization;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

/** Şirket, şirket e-belge ayarı ve /auth/me şirket özeti (12.1a §5.1, §5.3). */
public final class CompanyDtos {

  private CompanyDtos() {}

  /**
   * POST ve PUT gövdesi. Boş metinler {@code null} sayılır. {@code defaultCompany}: true =
   * varsayılan yap, null/false = değiştirme (varsayılanda false → 409). {@code active}: POST null →
   * true, PUT null → değişmez.
   */
  public record SaveCompanyRequest(
      @NotBlank @Pattern(regexp = "^[A-Z0-9_-]{1,20}$") String code,
      @NotBlank @Size(max = 300) String title,
      @NotBlank @Size(max = 100) String shortName,
      @NotNull TaxIdType taxIdType,
      @Pattern(regexp = "^$|^[0-9]{10,11}$") String taxNumber,
      @Size(max = 100) String taxOffice,
      @Pattern(regexp = "^$|^[0-9]{16}$") String mersisNo,
      @Size(max = 50) String tradeRegistryNo,
      @Size(max = 26) String sgkWorkplaceNo,
      @Size(max = 500) String address,
      @Size(max = 100) String city,
      @Size(max = 100) String district,
      @Size(max = 10) String postalCode,
      @Size(max = 30) String phone,
      @Email @Size(max = 254) String email,
      @Email @Size(max = 254) String kepAddress,
      @Size(max = 200) String website,
      UUID defaultFundAccountId,
      Boolean defaultCompany,
      Boolean active) {}

  public record CompanyResponse(
      UUID id,
      String code,
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
      String country,
      String phone,
      String email,
      String kepAddress,
      String website,
      UUID logoFileId,
      UUID defaultFundAccountId,
      boolean defaultCompany,
      boolean active,
      boolean edocumentEnabled,
      boolean edocumentTestMode,
      int branchCount,
      String createdBy,
      Instant createdAt,
      String updatedBy,
      Instant updatedAt,
      int updateCount) {}

  /** /auth/me'deki görünür şirket (sıra: varsayılan, sonra kısa ad). */
  public record MeCompanyResponse(
      UUID id,
      String code,
      String shortName,
      String title,
      boolean defaultCompany,
      boolean active) {}

  /** {@code password} null ya da boş = kayıtlı şifre değişmez; şifre hiçbir yanıtta dönmez. */
  public record SaveCompanyEDocumentSettingsRequest(
      @NotNull Boolean enabled,
      @NotNull Boolean testMode,
      @Size(max = 300) @Pattern(regexp = "^$|^https?://.+") String serviceUrl,
      @Size(max = 100) String username,
      @Size(max = 200) String password,
      @NotNull @Pattern(regexp = "^(TICARIFATURA|TEMELFATURA|EARSIVFATURA)$") String defaultProfile,
      @Pattern(regexp = "^$|^[A-Z0-9]{3}$") String invoiceSeries,
      @Pattern(regexp = "^$|^[A-Z0-9]{3}$") String despatchSeries,
      @NotNull Boolean despatchEnabled,
      @NotNull Boolean inboxEnabled) {}

  public record CompanyEDocumentSettingsResponse(
      UUID companyId,
      String provider,
      boolean enabled,
      boolean testMode,
      String serviceUrl,
      String username,
      boolean passwordSet,
      String defaultProfile,
      String invoiceSeries,
      String despatchSeries,
      boolean despatchEnabled,
      boolean inboxEnabled,
      Instant inboxLastSync,
      String senderTaxNumber,
      String senderTitle) {}
}
