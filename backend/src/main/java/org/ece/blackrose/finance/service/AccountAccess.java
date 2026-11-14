package org.ece.blackrose.finance.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.identity.domain.Permission;
import org.ece.blackrose.identity.security.AuthenticatedUser;
import org.ece.blackrose.organization.BranchScopeService;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * Cari uçlarının ortak kapısı (12.1 §3.1): personel carisi görünürlüğü, pasif cari, kart yazımında
 * iş yeri kapsamı ve tür değişim kuralı. Personel carisi izinsiz kullanıcıya hiç yokmuş gibi
 * davranır (404); varlığı sızdırılmaz.
 */
@Component
public class AccountAccess {

  private final AccountRepository accounts;
  private final AccountTransactionRepository transactions;
  private final BranchScopeService scope;

  @PersistenceContext private EntityManager entityManager;

  public AccountAccess(
      AccountRepository accounts,
      AccountTransactionRepository transactions,
      BranchScopeService scope) {
    this.accounts = accounts;
    this.transactions = transactions;
    this.scope = scope;
  }

  /**
   * Personel carilerini görebilir mi? Oturumsuz çağrı (arka plan işi, zamanlayıcı) görür; oturumda
   * {@code FINANCE_EMPLOYEE_VIEW} gerekir (PATRON tüm izinleri alır).
   */
  public boolean employeeVisible() {
    return AuthenticatedUser.current().isEmpty()
        || hasAuthority(Permission.FINANCE_EMPLOYEE_VIEW.name());
  }

  /** Oturumdaki kullanıcının izni var mı? Oturum yoksa {@code false}. */
  public static boolean hasAuthority(String permission) {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    return authentication != null
        && authentication.getAuthorities().stream()
            .anyMatch(authority -> permission.equals(authority.getAuthority()));
  }

  /** Yoksa ya da izinsiz kullanıcıya personel carisiyse 404 {@code ACCOUNT_NOT_FOUND}. */
  public Account readable(UUID id) {
    Account account = accounts.findById(id).orElseThrow(AccountAccess::notFound);
    requireReadable(account);
    return account;
  }

  public void requireReadable(Account account) {
    if (account.getType() == AccountType.EMPLOYEE && !employeeVisible()) {
      throw notFound();
    }
  }

  /** Kullanıcı girişli yeni belge/hareket: pasif cariye 422 {@code ACCOUNT_INACTIVE}. */
  public Account usable(UUID id) {
    Account account = readable(id);
    requireUsable(account);
    return account;
  }

  /**
   * Kullanıcı girişli yollarda kart–şirket kimlik kuralından önce (SEC-12.1-04): kart satırı {@code
   * FOR SHARE} ile kilitlenip işlenmiş son durumuyla yeniden okunur. Bu kilit profilin şirket
   * bağlamasıyla ({@code findForUpdate}) ve taşımayla ({@code lockForTransfer}) çakışır, aynı karta
   * eşzamanlı girişlerle çakışmaz; böylece "şirkete bağla ∥ başka şirkette belge" yarışında önce
   * gelen kazanır, diğeri 409 {@code ACCOUNT_COMPANY_LOCKED} ya da 422 {@code COMPANY_MISMATCH}
   * alır. Etkin işlem gerekir.
   */
  public Account usableLocked(UUID id) {
    Account account = lockShared(id);
    requireReadable(account);
    requireUsable(account);
    return account;
  }

  /**
   * Kartı {@code FOR SHARE} ile kilitler ve kilitten sonra yeniden okur (kalıcılık bağlamında
   * önceden okunmuş kart bayat kalmaz). Yoksa 404 {@code ACCOUNT_NOT_FOUND}.
   */
  public Account lockShared(UUID id) {
    Account account = entityManager.find(Account.class, id);
    if (account == null) {
      throw notFound();
    }
    entityManager.refresh(account, LockModeType.PESSIMISTIC_READ);
    return account;
  }

  /** Kilit alındıktan sonra kartın işlenmiş son durumu (taşıma hedefi; SEC-12.1-04). */
  public Account refresh(Account account) {
    entityManager.refresh(account);
    return account;
  }

  public static void requireUsable(Account account) {
    if (!account.isActive()) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "ACCOUNT_INACTIVE",
          "Pasif cariye yeni işlem girilemez.");
    }
  }

  /**
   * Kart düzeyindeki her yazım (profil, aktiflik, limit, silme, banka hesabı): kartın iş yeri
   * kapsamda olmalı (şubesiz kart herkese açık; değilse 403 {@code BRANCH_OUT_OF_SCOPE}).
   */
  public Account writable(UUID id) {
    Account account = readable(id);
    scope.requireVisible(account.getBranchId());
    return account;
  }

  /** Personel carisi açma/türe geçiş izni (403 {@code ACCOUNT_EMPLOYEE_FORBIDDEN}). */
  public void requireCanOpen(AccountType type) {
    if (type == AccountType.EMPLOYEE && !employeeVisible()) {
      throw new BusinessException(
          HttpStatus.FORBIDDEN, "ACCOUNT_EMPLOYEE_FORBIDDEN", "Personel carisi açma yetkiniz yok.");
    }
  }

  /**
   * Tür değişimi: aynı türde no-op; personel türüne/türünden geçiş izin ister (403), hareketi olan
   * caride tür değişmez (409 {@code ACCOUNT_TYPE_LOCKED}). Aynı tür içinde grup değişimi
   * serbesttir.
   */
  public void requireTypeChange(Account account, AccountType newType) {
    if (newType == null || newType == account.getType()) {
      return;
    }
    if (account.getType() == AccountType.EMPLOYEE || newType == AccountType.EMPLOYEE) {
      requireCanOpen(AccountType.EMPLOYEE);
    }
    if (transactions.existsByAccountIdAndDeletedFalse(account.getId())) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "ACCOUNT_TYPE_LOCKED",
          "Hareketi olan carinin hesap türü değiştirilemez; aynı tür içinde hesap grubu"
              + " değiştirilebilir.");
    }
  }

  public static BusinessException notFound() {
    return new BusinessException(HttpStatus.NOT_FOUND, "ACCOUNT_NOT_FOUND", "Cari bulunamadı.");
  }
}
