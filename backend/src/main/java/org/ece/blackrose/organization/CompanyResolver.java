package org.ece.blackrose.organization;

import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

/**
 * Kaydın şirketini iş yerinden türetir. Önbellek bilinçli olarak yoktur: kullanılmamış iş yerinin
 * şirketi değişebilir ve birden çok uygulama örneği çalışabilir; bayat değer bileşik FK hatası
 * üretirdi. Ters kayıtlar şirketi orijinal hareketten kopyalar, buradan yeniden türetmez.
 */
@Component
public class CompanyResolver {

  private final BranchRepository branches;
  private final CompanyRepository companies;

  public CompanyResolver(BranchRepository branches, CompanyRepository companies) {
    this.branches = branches;
    this.companies = companies;
  }

  /** İş yerinin şirketi; silinmiş iş yeri için de çalışır. Yoksa 400 {@code BRANCH_NOT_FOUND}. */
  public UUID companyOf(UUID branchId) {
    if (branchId == null) {
      throw branchNotFound();
    }
    return branches
        .findCompanyIdIncludingDeleted(branchId)
        .orElseThrow(CompanyResolver::branchNotFound);
  }

  /** Kiracının varsayılan şirketi; göç her kiracıda bir tane oluşturur. */
  public UUID defaultCompanyId() {
    return companies
        .findDefaultId()
        .orElseThrow(() -> new IllegalStateException("Varsayılan şirket yok; göç bozuk."));
  }

  /**
   * Şubesi olmayan yeni belgenin (teklif, sözleşme) şirketi: istenmediyse varsayılan şirket; yoksa
   * 400 {@code COMPANY_NOT_FOUND}, pasifse 422 {@code COMPANY_INACTIVE}.
   */
  public UUID forNewDocument(UUID requestedCompanyId) {
    if (requestedCompanyId == null) {
      return defaultCompanyId();
    }
    Company company =
        companies
            .findById(requestedCompanyId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.BAD_REQUEST, "COMPANY_NOT_FOUND", "Şirket bulunamadı."));
    if (!company.isActive()) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY, "COMPANY_INACTIVE", "Pasif şirket seçilemez.");
    }
    return company.getId();
  }

  private static BusinessException branchNotFound() {
    return new BusinessException(HttpStatus.BAD_REQUEST, "BRANCH_NOT_FOUND", "Şube bulunamadı.");
  }
}
