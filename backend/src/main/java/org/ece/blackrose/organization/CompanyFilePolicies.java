package org.ece.blackrose.organization;

import java.util.UUID;
import org.ece.blackrose.files.FileOwnerPolicy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Şirket logosunun dosya kuralı. Logo yalnız {@code /organization/companies/{id}/logo} ucundan
 * yönetilir (PNG/JPEG, 1 MB); genel dosya uçları yükleme ve silmeyi reddeder.
 */
@Configuration
public class CompanyFilePolicies {

  @Bean
  FileOwnerPolicy companyLogoFilePolicy(CompanyRepository companies) {
    return new FileOwnerPolicy() {
      @Override
      public String ownerType() {
        return CompanyService.LOGO_OWNER;
      }

      @Override
      public String viewPermission() {
        return "BRANCH_VIEW";
      }

      @Override
      public String editPermission() {
        return "COMPANY_MANAGE";
      }

      @Override
      public boolean exists(UUID ownerId) {
        return companies.existsById(ownerId);
      }

      @Override
      public boolean managedByOwner() {
        return true;
      }
    };
  }
}
