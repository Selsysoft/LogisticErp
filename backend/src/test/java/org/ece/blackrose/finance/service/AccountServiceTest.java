package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Collections;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.AccountGroup;
import org.ece.blackrose.finance.domain.FinanceTypes.InvoiceDirection;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountCompanyLimitRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountGroupRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountRolloverRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountInvoiceRow;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.PaymentPlanRepository;
import org.ece.blackrose.identity.repository.IdentityRepositories.AuditLogRepository;
import org.ece.blackrose.identity.security.PersonalDataProtector;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.organization.CompanyResolver;
import org.ece.blackrose.tenant.TenantClock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Cari kodu üretim döngüsü (12.1 §3.2 madde 4) ve fatura listesi sınırı (§3.9); repository sahte.
 */
class AccountServiceTest {

  private AccountRepository accounts;
  private AccountTransactionRepository transactions;
  private AccountAccess access;
  private BranchScopeService scope;
  private AccountService service;
  private AccountGroup group;
  private final AtomicInteger next = new AtomicInteger(1);

  @BeforeEach
  void setUp() {
    accounts = mock(AccountRepository.class);
    transactions = mock(AccountTransactionRepository.class);
    access = mock(AccountAccess.class);
    scope = mock(BranchScopeService.class);
    service =
        new AccountService(
            accounts,
            transactions,
            mock(AccountGroupRepository.class),
            mock(AccountCompanyLimitRepository.class),
            mock(AccountRolloverRepository.class),
            mock(PaymentPlanRepository.class),
            mock(LedgerService.class),
            mock(OpeningInvoiceImportService.class),
            scope,
            access,
            mock(CompanyIdentityRule.class),
            mock(CompanyResolver.class),
            mock(AccountBankAccountService.class),
            mock(PersonalDataProtector.class),
            mock(AuditService.class),
            mock(AuditLogRepository.class),
            mock(TenantClock.class),
            mock(InvoiceCoverageService.class));
    group = mock(AccountGroup.class);
    when(group.issueNextCode()).thenAnswer(call -> "MUS-%06d".formatted(next.getAndIncrement()));
  }

  @Test
  void elleAcilmisKodlarAtlanir() {
    when(accounts.findByCode(anyString())).thenReturn(Optional.empty());
    when(accounts.findByCode("MUS-000001")).thenReturn(Optional.of(mock(Account.class)));
    when(accounts.findByCode("MUS-000002")).thenReturn(Optional.of(mock(Account.class)));

    assertThat(service.issueCode(group)).isEqualTo("MUS-000003");
    verify(group, times(3)).issueNextCode();
  }

  @Test
  void bosKodBulunamazsaBinDenemedeDurur() {
    when(accounts.findByCode(anyString())).thenReturn(Optional.of(mock(Account.class)));

    assertThatThrownBy(() -> service.issueCode(group))
        .isInstanceOf(BusinessException.class)
        .extracting(ex -> ((BusinessException) ex).getCode())
        .isEqualTo("ACCOUNT_CODE_EXHAUSTED");
    verify(group, times(AccountService.CODE_ATTEMPTS)).issueNextCode();
  }

  @Test
  void faturaListesiBinSatiriAsarsaDaraltmaIster() {
    UUID id = UUID.randomUUID();
    when(scope.filter(null, null)).thenReturn(BranchFilter.all(null));
    when(transactions.invoiceRows(
            eq(id),
            anyBoolean(),
            anyString(),
            anyBoolean(),
            anyBoolean(),
            any(),
            any(),
            anyBoolean(),
            any(),
            anyBoolean(),
            any(),
            eq(AccountService.INVOICE_LIMIT + 1)))
        .thenReturn(
            Collections.nCopies(AccountService.INVOICE_LIMIT + 1, mock(AccountInvoiceRow.class)));

    assertThatThrownBy(
            () -> service.invoices(id, InvoiceDirection.SALES, null, null, null, null, null))
        .isInstanceOf(BusinessException.class)
        .extracting(ex -> ((BusinessException) ex).getCode())
        .isEqualTo("RESULT_TOO_LARGE");
    verify(access).readable(id);
  }

  @Test
  void faturaListesiSinirdaSatirlariDoner() {
    UUID id = UUID.randomUUID();
    when(scope.filter(null, null)).thenReturn(BranchFilter.all(null));
    AccountInvoiceRow row = mock(AccountInvoiceRow.class);
    when(row.getKind()).thenReturn("FREIGHT_INVOICE");
    when(row.getStatus()).thenReturn("OPEN");
    when(row.getReflected()).thenReturn(true);
    when(transactions.invoiceRows(
            eq(id),
            eq(false),
            eq(""),
            eq(true),
            eq(false),
            any(),
            any(),
            eq(true),
            eq(BranchFilter.NONE),
            eq(true),
            any(),
            anyInt()))
        .thenReturn(Collections.nCopies(AccountService.INVOICE_LIMIT, row));

    var rows = service.invoices(id, InvoiceDirection.SALES, null, null, null, null, null);

    assertThat(rows).hasSize(AccountService.INVOICE_LIMIT);
    assertThat(rows.get(0).status()).isEqualTo("OPEN");
    assertThat(rows.get(0).reflected()).isTrue();
  }
}
