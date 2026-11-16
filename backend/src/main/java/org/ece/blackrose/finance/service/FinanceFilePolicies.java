package org.ece.blackrose.finance.service;

import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.files.FileOwnerPolicy;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.Instrument;
import org.ece.blackrose.finance.repository.ExpenseRepositories.ExpenseRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.InstrumentRepository;
import org.ece.blackrose.organization.BranchScopeService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;

/**
 * Finans kayıtlarına eklenen dosyaların izin kuralları (12.3 §3.7). Çek belgeleri ({@code
 * INSTRUMENT}): görüntüleme {@code FINANCE_VIEW}, yükleme/silme {@code FINANCE_PAYMENT_CREATE};
 * kapsam dışı iş yeri 403, personel carili çek izinsiz kullanıcıya 404 {@code
 * INSTRUMENT_NOT_FOUND}. Masraf belgeleri ({@code EXPENSE}; 12.7 §3.5): görüntüleme {@code
 * FINANCE_VIEW}, yükleme/silme {@code FINANCE_MANAGE}; kapsam dışı iş yeri 403.
 */
@Configuration
public class FinanceFilePolicies {

  static final String INSTRUMENT = "INSTRUMENT";
  static final String EXPENSE = "EXPENSE";

  @Bean
  FileOwnerPolicy expenseFilePolicy(ExpenseRepository expenses, BranchScopeService scope) {
    return new FileOwnerPolicy() {
      @Override
      public String ownerType() {
        return EXPENSE;
      }

      @Override
      public String viewPermission() {
        return "FINANCE_VIEW";
      }

      @Override
      public String editPermission() {
        return "FINANCE_MANAGE";
      }

      @Override
      public boolean exists(UUID ownerId) {
        return expenses.existsById(ownerId);
      }

      @Override
      public void requireAccess(UUID ownerId) {
        expenses.findAnyById(ownerId).ifPresent(e -> scope.requireVisible(e.getBranchId()));
      }
    };
  }

  @Bean
  FileOwnerPolicy instrumentFilePolicy(
      InstrumentRepository instruments,
      AccountRepository accounts,
      AccountAccess access,
      BranchScopeService scope) {
    return new FileOwnerPolicy() {
      @Override
      public String ownerType() {
        return INSTRUMENT;
      }

      @Override
      public String viewPermission() {
        return "FINANCE_VIEW";
      }

      @Override
      public String editPermission() {
        return "FINANCE_PAYMENT_CREATE";
      }

      @Override
      public boolean exists(UUID ownerId) {
        return instruments.existsById(ownerId);
      }

      @Override
      public void requireAccess(UUID ownerId) {
        instruments
            .findById(ownerId)
            .ifPresent(instrument -> requireReadable(instrument, accounts, access, scope));
      }
    };
  }

  private static void requireReadable(
      Instrument instrument,
      AccountRepository accounts,
      AccountAccess access,
      BranchScopeService scope) {
    scope.requireVisible(instrument.getBranchId());
    if (instrument.getAccountId() == null || access.employeeVisible()) {
      return;
    }
    boolean employee =
        accounts
            .findById(instrument.getAccountId())
            .map(account -> account.getType() == AccountType.EMPLOYEE)
            .orElse(false);
    if (employee) {
      throw new BusinessException(
          HttpStatus.NOT_FOUND, "INSTRUMENT_NOT_FOUND", "Çek/senet bulunamadı.");
    }
  }
}
