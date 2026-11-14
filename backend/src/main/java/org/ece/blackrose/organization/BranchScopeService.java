package org.ece.blackrose.organization;

import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.identity.domain.BranchScope;
import org.ece.blackrose.identity.domain.UserAccount;
import org.ece.blackrose.identity.repository.IdentityRepositories.UserBranchRepository;
import org.ece.blackrose.identity.security.AuthenticatedUser;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * Kullanıcının iş yeri kapsamını sunucuda uygular. Oturumsuz çağrılar (arka plan işleri,
 * zamanlayıcılar, provisioning, herkese açık uçlar) ALL sayılır.
 *
 * <p>{@link #requireNew} yalnız kullanıcının seçtiği iş yeriyle yeni kayıt açan HTTP girişlerinde
 * çağrılır (aktiflik denetimi yapar); türetilmiş akışlar (plan ödemesi, sefer kapanışı vb.) yalnız
 * {@link #requireVisible} uygular, böylece pasif iş yerinin kayıtları işlenmeye devam eder.
 */
@Service
public class BranchScopeService {

  private final BranchRepository branches;
  private final CompanyRepository companies;
  private final UserBranchRepository userBranches;

  public BranchScopeService(
      BranchRepository branches, CompanyRepository companies, UserBranchRepository userBranches) {
    this.branches = branches;
    this.companies = companies;
    this.userBranches = userBranches;
  }

  public BranchScope current() {
    return limited() ? BranchScope.LIMITED : BranchScope.ALL;
  }

  public boolean limited() {
    return allowedOrNull() != null;
  }

  /** İzinli iş yerleri; ALL (ya da oturumsuz) ise {@code null}. */
  public Set<UUID> allowedOrNull() {
    return AuthenticatedUser.current().map(AuthenticatedUser::allowedBranchIds).orElse(null);
  }

  /**
   * Kullanıcının seçtiği iş yeriyle yeni kayıt: var mı (400 {@code BRANCH_NOT_FOUND}), kapsamda mı
   * (403 {@code BRANCH_OUT_OF_SCOPE}), aktif mi (422 {@code BRANCH_INACTIVE}), şirketi aktif mi
   * (422 {@code COMPANY_INACTIVE}).
   */
  public void requireNew(UUID branchId) {
    Branch branch = (branchId == null ? null : branches.findById(branchId).orElse(null));
    if (branch == null) {
      throw new BusinessException(HttpStatus.BAD_REQUEST, "BRANCH_NOT_FOUND", "Şube bulunamadı.");
    }
    requireVisible(branchId);
    if (!branch.isActive()) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY, "BRANCH_INACTIVE", "Pasif iş yeri seçilemez.");
    }
    if (!companies.findById(branch.getCompanyId()).map(Company::isActive).orElse(false)) {
      throw CompanyService.companyInactive();
    }
  }

  /**
   * Kaydın mevcut iş yeri her zaman kapsamda olmalı (kapsam dışı kayıt kendi iş yerine taşınamaz);
   * iş yeri değiştiyse yeni iş yerine yeni kayıt kuralları uygulanır.
   */
  public void requireForUpdate(UUID newBranchId, UUID oldBranchId) {
    requireVisible(oldBranchId);
    if (newBranchId != null && !newBranchId.equals(oldBranchId)) {
      requireNew(newBranchId);
    }
  }

  /** Yalnız kapsam (aktiflik denetlenmez); {@code null} iş yeri her zaman görünür. */
  public void requireVisible(UUID branchId) {
    Set<UUID> allowed = allowedOrNull();
    if (branchId != null && allowed != null && !allowed.contains(branchId)) {
      throw outOfScope();
    }
  }

  /** Bildirim alıcısı süzgeci: ALL kullanıcı her iş yerini, LIMITED yalnız kendi iş yerlerini. */
  public boolean allows(UserAccount user, UUID branchId) {
    if (user.getBranchScope() != BranchScope.LIMITED) {
      return true;
    }
    return branchId != null && userBranches.branchIdsOf(user.getId()).contains(branchId);
  }

  /**
   * Liste süzgeci. Seçili şirket var olmalı (400 {@code COMPANY_NOT_FOUND}), LIMITED kullanıcıda
   * görünür de olmalı (403). Açıkça istenen iş yerleri kapsamda olmalı (değilse 403); istek boşsa
   * kullanıcının kapsamına daralır.
   */
  public BranchFilter filter(UUID companyId, Collection<UUID> requestedBranchIds) {
    Set<UUID> allowed = allowedOrNull();
    if (companyId != null) {
      requireCompanyVisible(companyId);
    }
    if (requestedBranchIds == null || requestedBranchIds.isEmpty()) {
      return allowed == null
          ? BranchFilter.all(companyId)
          : BranchFilter.limited(companyId, allowed);
    }
    requestedBranchIds.forEach(this::requireVisible);
    return BranchFilter.limited(companyId, requestedBranchIds);
  }

  /**
   * {@code companyId} verilmeyen yeni belgenin (teklif, sözleşme, şube, iş yeri) şirketi. ALL
   * kullanıcıda kiracının varsayılan şirketi; LIMITED kullanıcıda varsayılan şirket görünürse o,
   * değilse görünür tek aktif şirket; birden çok aday varsa 400 {@code COMPANY_REQUIRED}. Hiç
   * görünür şirket yoksa 403 {@code COMPANY_OUT_OF_SCOPE}.
   */
  public UUID defaultCompanyForNew(UUID tenantDefault) {
    if (!limited()) {
      return tenantDefault;
    }
    List<UUID> visible = visibleCompanyIds();
    if (visible.isEmpty()) {
      throw companyOutOfScope();
    }
    if (visible.contains(tenantDefault)) {
      return tenantDefault;
    }
    List<UUID> active =
        companies.findAllById(visible).stream()
            .filter(Company::isActive)
            .map(Company::getId)
            .toList();
    if (active.size() == 1) {
      return active.get(0);
    }
    throw new BusinessException(HttpStatus.BAD_REQUEST, "COMPANY_REQUIRED", "Şirket seçin.");
  }

  /** Şirket yoksa 400 {@code COMPANY_NOT_FOUND}; LIMITED ve izinli iş yeri yoksa 403. */
  public void requireCompanyVisible(UUID companyId) {
    if (companyId == null || !companies.existsById(companyId)) {
      throw CompanyService.companyNotFound(HttpStatus.BAD_REQUEST);
    }
    if (limited() && !visibleCompanyIds().contains(companyId)) {
      throw companyOutOfScope();
    }
  }

  /**
   * Kiracı geneli raporlar LIMITED kullanıcıya kapalıdır. {@code reportName} yalnız çağıranı
   * belgelemek içindir.
   */
  public void requireAll(String reportName) {
    if (limited()) {
      throw new BusinessException(
          HttpStatus.FORBIDDEN,
          "BRANCH_SCOPE_ALL_REQUIRED",
          "Bu rapor yalnız tüm iş yerlerini gören kullanıcılara açıktır.");
    }
  }

  /** ALL → tüm şirketler; LIMITED → izinli iş yerlerinin şirketleri. */
  public List<UUID> visibleCompanyIds() {
    Set<UUID> allowed = allowedOrNull();
    if (allowed == null) {
      return companies.findAll().stream().map(Company::getId).toList();
    }
    return allowed.isEmpty() ? List.of() : branches.companyIdsOf(allowed);
  }

  public static BusinessException outOfScope() {
    return new BusinessException(
        HttpStatus.FORBIDDEN, "BRANCH_OUT_OF_SCOPE", "Bu iş yerinde işlem yetkiniz yok.");
  }

  public static BusinessException companyOutOfScope() {
    return new BusinessException(
        HttpStatus.FORBIDDEN, "COMPANY_OUT_OF_SCOPE", "Bu şirkette işlem yetkiniz yok.");
  }
}
