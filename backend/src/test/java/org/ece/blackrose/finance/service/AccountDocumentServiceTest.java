package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.AccountDocumentType;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentSide;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.DocumentPaymentMethod;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountDocumentRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountDocumentTaxRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountDocumentTypeRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.web.AccountDtos.AccountDocumentRequest;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.organization.CompanyResolver;
import org.ece.blackrose.tenant.TenantClock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;

/** Borç/Alacak belgesi: yarışta kısıt ihlalinin koda çevrilmesi (12.1 §3.4, §3.14; T-2). */
class AccountDocumentServiceTest {

  private static final UUID ACCOUNT = UUID.randomUUID();
  private static final UUID BRANCH = UUID.randomUUID();
  private static final UUID COMPANY = UUID.randomUUID();

  private AccountDocumentRepository documents;
  private LedgerService ledger;
  private AccountDocumentService service;

  @BeforeEach
  void setUp() {
    documents = mock(AccountDocumentRepository.class);
    AccountDocumentTypeRepository types = mock(AccountDocumentTypeRepository.class);
    ledger = mock(LedgerService.class);
    AccountAccess access = mock(AccountAccess.class);
    CompanyResolver companies = mock(CompanyResolver.class);
    TenantClock clock = mock(TenantClock.class);
    when(clock.today()).thenReturn(LocalDate.of(2026, 11, 14));
    service =
        new AccountDocumentService(
            documents,
            types,
            mock(AccountDocumentTaxRepository.class),
            mock(AccountRepository.class),
            mock(AccountTransactionRepository.class),
            ledger,
            access,
            new CompanyIdentityRule(),
            companies,
            mock(BranchScopeService.class),
            mock(AuditService.class),
            clock);
    Account account = mock(Account.class);
    when(account.getId()).thenReturn(ACCOUNT);
    when(account.getType()).thenReturn(AccountType.SUPPLIER);
    when(account.isActive()).thenReturn(true);
    when(access.usableLocked(ACCOUNT)).thenReturn(account);
    when(companies.companyOf(BRANCH)).thenReturn(COMPANY);
    AccountDocumentType type = mock(AccountDocumentType.class);
    when(type.isActive()).thenReturn(true);
    when(type.isSelectable()).thenReturn(true);
    when(type.allowedFor(any())).thenReturn(true);
    when(type.isInvoiceSection()).thenReturn(false);
    when(type.getCode()).thenReturn("CEZA_BIZE");
    when(type.getName()).thenReturn("Ceza (bize kesilen)");
    when(types.findById(any())).thenReturn(Optional.of(type));
    when(documents.findByIdempotencyKey(any())).thenReturn(Optional.empty());
  }

  @Test
  void ayniAnahtarlaEszamanliBelge409IdempotencyInProgress() {
    when(documents.saveAndFlush(any())).thenThrow(violation("account_document_idempotency_uq"));

    assertThatThrownBy(() -> service.create(ACCOUNT, request(), "anahtar-1"))
        .isInstanceOfSatisfying(
            BusinessException.class,
            ex -> {
              assertThat(ex.getStatus()).isEqualTo(HttpStatus.CONFLICT);
              assertThat(ex.getCode()).isEqualTo("IDEMPOTENCY_IN_PROGRESS");
            });
    verify(ledger, never()).post(any());
  }

  @Test
  void baskaKisitIhlaliAynenYenidenFirlatilir() {
    DataIntegrityViolationException other = violation("account_document_amount_ck");
    when(documents.saveAndFlush(any())).thenThrow(other);

    assertThatThrownBy(() -> service.create(ACCOUNT, request(), "anahtar-2")).isSameAs(other);
    verify(ledger, never()).post(any());
  }

  private static AccountDocumentRequest request() {
    return new AccountDocumentRequest(
        AccountDocumentSide.PAYABLE,
        "CEZA_BIZE",
        "BLG-1",
        LocalDate.of(2026, 11, 14),
        null,
        new BigDecimal("40"),
        "TRY",
        null,
        DocumentPaymentMethod.BANK,
        BRANCH,
        null,
        null,
        null);
  }

  private static DataIntegrityViolationException violation(String constraint) {
    return new DataIntegrityViolationException(
        "x",
        new RuntimeException(
            "duplicate key value violates unique constraint \"" + constraint + "\""));
  }
}
