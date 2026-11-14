package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.identity.security.AuthenticatedUser;
import org.ece.blackrose.organization.BranchScopeService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

/** Personel carisi görünürlüğü, pasif cari ve tür değişim kuralı (12.1 §3.1). */
class AccountAccessTest {

  private AccountRepository accounts;
  private AccountTransactionRepository transactions;
  private AccountAccess access;

  @BeforeEach
  void setUp() {
    accounts = mock(AccountRepository.class);
    transactions = mock(AccountTransactionRepository.class);
    access = new AccountAccess(accounts, transactions, mock(BranchScopeService.class));
  }

  @AfterEach
  void clear() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void oturumsuzArkaPlanIsiPersoneliGorur() {
    SecurityContextHolder.clearContext();
    assertThat(access.employeeVisible()).isTrue();
  }

  @Test
  void izinsizKullaniciPersonelCarisiniGormezVeAcamaz() {
    login("FINANCE_VIEW", "FINANCE_MANAGE");
    assertThat(access.employeeVisible()).isFalse();
    Account employee = new Account("P1", "Personel", AccountType.EMPLOYEE, null, null);
    when(accounts.findById(employee.getId())).thenReturn(Optional.of(employee));

    assertThatThrownBy(() -> access.readable(employee.getId()))
        .extracting(ex -> ((BusinessException) ex).getCode())
        .isEqualTo("ACCOUNT_NOT_FOUND");
    assertThatThrownBy(() -> access.requireCanOpen(AccountType.EMPLOYEE))
        .extracting(ex -> ((BusinessException) ex).getCode())
        .isEqualTo("ACCOUNT_EMPLOYEE_FORBIDDEN");
    Account customer = new Account("M1", "Müşteri", AccountType.CUSTOMER, null, null);
    assertThatThrownBy(() -> access.requireTypeChange(customer, AccountType.EMPLOYEE))
        .extracting(ex -> ((BusinessException) ex).getCode())
        .isEqualTo("ACCOUNT_EMPLOYEE_FORBIDDEN");
  }

  @Test
  void izinliKullaniciGorurHareketliCarideTurKilitli() {
    login("FINANCE_VIEW", "FINANCE_EMPLOYEE_VIEW");
    assertThat(access.employeeVisible()).isTrue();
    Account customer = new Account("M1", "Müşteri", AccountType.CUSTOMER, null, null);
    when(accounts.findById(customer.getId())).thenReturn(Optional.of(customer));
    assertThat(access.readable(customer.getId())).isSameAs(customer);

    access.requireTypeChange(customer, AccountType.CUSTOMER);
    access.requireTypeChange(customer, AccountType.SUPPLIER);
    when(transactions.existsByAccountIdAndDeletedFalse(customer.getId())).thenReturn(true);
    assertThatThrownBy(() -> access.requireTypeChange(customer, AccountType.SUPPLIER))
        .extracting(ex -> ((BusinessException) ex).getCode())
        .isEqualTo("ACCOUNT_TYPE_LOCKED");
  }

  @Test
  void pasifCariKullanilamaz() {
    Account customer = new Account("M1", "Müşteri", AccountType.CUSTOMER, null, null);
    customer.deactivate();
    when(accounts.findById(customer.getId())).thenReturn(Optional.of(customer));
    assertThatThrownBy(() -> access.usable(customer.getId()))
        .extracting(ex -> ((BusinessException) ex).getCode())
        .isEqualTo("ACCOUNT_INACTIVE");
    assertThatThrownBy(() -> access.readable(UUID.randomUUID()))
        .extracting(ex -> ((BusinessException) ex).getCode())
        .isEqualTo("ACCOUNT_NOT_FOUND");
  }

  @Test
  void tcknDuzKolonaYazilamaz() {
    assertThatThrownBy(() -> new Account("M2", "Kişi", AccountType.CUSTOMER, "10000000146", null))
        .isInstanceOf(IllegalArgumentException.class);
  }

  private static void login(String... permissions) {
    AuthenticatedUser user =
        new AuthenticatedUser(
            UUID.randomUUID(), "u@test", UUID.randomUUID(), Instant.now().plusSeconds(60));
    SecurityContextHolder.getContext()
        .setAuthentication(
            new UsernamePasswordAuthenticationToken(
                user,
                null,
                List.of(permissions).stream().map(SimpleGrantedAuthority::new).toList()));
  }
}
