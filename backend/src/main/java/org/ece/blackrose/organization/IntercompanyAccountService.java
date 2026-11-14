package org.ece.blackrose.organization;

import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Grup şirketi (intercompany) carileri: kiracıda en az iki aktif şirket varken her aktif şirketi
 * temsil eden ortak bir cari ({@code GS-<kod>}, {@code represents_company_id}). Bu kartlar yalnız
 * buradan açılır ve şirket kartıyla eşitlenir; elle değiştirilemez ve silinemez ({@link Account}).
 * 12.1a'da para hareketi yoktur.
 */
@Service
public class IntercompanyAccountService {

  static final String CODE_PREFIX = "GS-";

  private final CompanyRepository companies;
  private final AccountRepository accounts;
  private final EntityManager entityManager;

  public IntercompanyAccountService(
      CompanyRepository companies, AccountRepository accounts, EntityManager entityManager) {
    this.companies = companies;
    this.accounts = accounts;
    this.entityManager = entityManager;
  }

  /**
   * Eksik grup carilerini açar. Çağıran kiracı şirket kilidini tutar ({@code
   * CompanyRepository.lockTenantCompanies}); iki eşzamanlı çağrı aynı cariyi açmaz.
   */
  @Transactional
  public void ensureAll() {
    List<Company> active = companies.findAll().stream().filter(Company::isActive).toList();
    if (active.size() < 2) {
      return;
    }
    for (Company company : active) {
      if (representing(company.getId()).isPresent()) {
        continue;
      }
      String base = CODE_PREFIX + company.getCode();
      String code = base;
      for (int suffix = 2; accounts.findByCode(code).isPresent(); suffix++) {
        code = base + "-" + suffix;
      }
      accounts.save(
          Account.intercompany(
              code, company.getShortName(), company.getTaxNumber(), company.getId()));
    }
  }

  /** Şirket kartı değişince grup carisinin adı ve vergi numarası eşitlenir (kimlik eşleşmesi). */
  @Transactional
  public void sync(Company company) {
    representing(company.getId())
        .ifPresent(
            account -> account.syncIntercompany(company.getShortName(), company.getTaxNumber()));
  }

  /** Şirketi temsil eden (silinmemiş) grup carisi. */
  @Transactional(readOnly = true)
  public Optional<Account> representing(UUID companyId) {
    return entityManager
        .createQuery("select a from Account a where a.representsCompanyId = :id", Account.class)
        .setParameter("id", companyId)
        .getResultStream()
        .findFirst();
  }
}
