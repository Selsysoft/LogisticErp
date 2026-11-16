package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.AccountDocument;
import org.ece.blackrose.finance.domain.AccountDocumentType;
import org.ece.blackrose.finance.domain.AccountTransaction;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentSide;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.DocumentPaymentMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.IncomeExpenseCategory;
import org.ece.blackrose.finance.domain.FinanceTypes.IncomeExpenseDirection;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountDocumentRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountDocumentTaxRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountDocumentTypeRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.service.AccountDocumentService.FxDocumentCommand;
import org.ece.blackrose.finance.service.LedgerService.Posting;
import org.ece.blackrose.finance.web.AccountDtos.AccountDocumentRequest;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.organization.CompanyResolver;
import org.ece.blackrose.tenant.TenantClock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;

/**
 * Borç/Alacak belgesi: yarışta kısıt ihlalinin koda çevrilmesi (12.1 §3.4, §3.14; T-2) ve kur farkı
 * belgesi (12.8 §3.3, §6.3): seçilemeyen türde yazım, revize yasağı, iptalde gelir/gider ters
 * kaydı, tekrar yolunda önce erişim.
 */
class AccountDocumentServiceTest {

  private static final UUID ACCOUNT = UUID.randomUUID();
  private static final UUID BRANCH = UUID.randomUUID();
  private static final UUID COMPANY = UUID.randomUUID();

  private AccountDocumentRepository documents;
  private AccountDocumentTypeRepository types;
  private AccountRepository accounts;
  private LedgerService ledger;
  private AccountAccess access;
  private BranchScopeService scope;
  private IncomeExpenseService incomeExpense;
  private AccountDocumentType type;
  private Account account;
  private AccountDocumentService service;

  @BeforeEach
  void setUp() {
    documents = mock(AccountDocumentRepository.class);
    types = mock(AccountDocumentTypeRepository.class);
    accounts = mock(AccountRepository.class);
    ledger = mock(LedgerService.class);
    access = mock(AccountAccess.class);
    scope = mock(BranchScopeService.class);
    incomeExpense = mock(IncomeExpenseService.class);
    CompanyResolver companies = mock(CompanyResolver.class);
    TenantClock clock = mock(TenantClock.class);
    when(clock.today()).thenReturn(LocalDate.of(2026, 11, 14));
    service =
        new AccountDocumentService(
            documents,
            types,
            mock(AccountDocumentTaxRepository.class),
            accounts,
            mock(AccountTransactionRepository.class),
            ledger,
            access,
            new CompanyIdentityRule(),
            companies,
            scope,
            mock(AuditService.class),
            clock,
            incomeExpense);
    account = mock(Account.class);
    when(account.getId()).thenReturn(ACCOUNT);
    when(account.getType()).thenReturn(AccountType.SUPPLIER);
    when(account.isActive()).thenReturn(true);
    when(access.usableLocked(ACCOUNT)).thenReturn(account);
    when(accounts.findById(ACCOUNT)).thenReturn(Optional.of(account));
    when(companies.companyOf(BRANCH)).thenReturn(COMPANY);
    type = mock(AccountDocumentType.class);
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

  // --- 12.8 kur farkı (§3.3, §6.3)

  @Test
  void kurFarkiBelgesiSecilemezTurdeYazilirDefterVeGelirGiderKaydi() {
    when(type.isSelectable()).thenReturn(false);
    AccountTransaction src = source();

    service.createFxDifference(
        command(src, AccountDocumentSide.RECEIVABLE, IncomeExpenseDirection.INCOME), null);

    ArgumentCaptor<AccountDocument> saved = ArgumentCaptor.forClass(AccountDocument.class);
    verify(documents).saveAndFlush(saved.capture());
    AccountDocument document = saved.getValue();
    assertThat(document.getDocumentType()).isEqualTo(AccountDocument.TYPE_FX);
    assertThat(document.getMoney().currency()).isEqualTo("TRY");
    assertThat(document.getExchangeRate()).isNull();
    assertThat(document.getFxSourceTransactionId()).isEqualTo(src.getId());
    assertThat(document.getFxRate()).isEqualByComparingTo("0.25");
    assertThat(document.getFxRateDate()).isEqualTo(LocalDate.of(2026, 11, 9));
    ArgumentCaptor<Posting> posting = ArgumentCaptor.forClass(Posting.class);
    verify(ledger).post(posting.capture());
    assertThat(posting.getValue().direction()).isEqualTo(Direction.DEBIT);
    assertThat(posting.getValue().money().currency()).isEqualTo("TRY");
    assertThat(posting.getValue().manualRate()).isNull();
    assertThat(posting.getValue().sourceId()).isEqualTo(document.getId());
    verify(incomeExpense)
        .record(
            eq(IncomeExpenseDirection.INCOME),
            eq(IncomeExpenseCategory.FX_DIFF),
            eq(AccountDocumentService.SOURCE),
            eq(document.getId()),
            eq(LocalDate.of(2026, 11, 10)),
            any(),
            eq(BRANCH),
            isNull(),
            eq("Kur farkı"),
            isNull());
  }

  @Test
  void kurFarkiKaynakTekilIhlali409FxDifferenceExists() {
    when(documents.saveAndFlush(any())).thenThrow(violation("account_document_fx_source_uq"));

    assertThatThrownBy(
            () ->
                service.createFxDifference(
                    command(source(), AccountDocumentSide.PAYABLE, IncomeExpenseDirection.EXPENSE),
                    "k"))
        .isInstanceOfSatisfying(
            BusinessException.class,
            ex -> {
              assertThat(ex.getStatus()).isEqualTo(HttpStatus.CONFLICT);
              assertThat(ex.getCode()).isEqualTo("FX_DIFFERENCE_EXISTS");
            });
    verify(ledger, never()).post(any());
  }

  @Test
  void kurFarkiTuruYoksa422() {
    when(types.findById(any())).thenReturn(Optional.empty());

    assertThatThrownBy(
            () ->
                service.createFxDifference(
                    command(source(), AccountDocumentSide.PAYABLE, IncomeExpenseDirection.EXPENSE),
                    null))
        .isInstanceOfSatisfying(
            BusinessException.class,
            ex -> assertThat(ex.getCode()).isEqualTo("DOCUMENT_TYPE_INVALID"));
    verify(documents, never()).saveAndFlush(any());
  }

  @Test
  void kurFarkiBelgesiRevizeEdilemez() {
    AccountDocument fx = fxDocument(UUID.randomUUID());
    when(documents.findForUpdate(fx.getId())).thenReturn(Optional.of(fx));

    assertThatThrownBy(() -> service.revise(fx.getId(), request(), null))
        .isInstanceOfSatisfying(
            BusinessException.class,
            ex -> {
              assertThat(ex.getStatus()).isEqualTo(HttpStatus.CONFLICT);
              assertThat(ex.getCode()).isEqualTo("FX_DOCUMENT_NOT_REVISABLE");
            });
    verify(ledger, never()).reverseSource(any(), any(), any(), any());
  }

  @Test
  void iptalGelirGiderKaydiniDaTersCevirir() {
    AccountDocument fx = fxDocument(UUID.randomUUID());
    when(documents.findForUpdate(fx.getId())).thenReturn(Optional.of(fx));
    LocalDate date = LocalDate.of(2026, 11, 12);

    service.cancel(fx.getId(), date, "geri");

    verify(ledger)
        .reverseSource(eq(AccountDocumentService.SOURCE), eq(fx.getId()), eq(date), any());
    verify(incomeExpense)
        .reverseSource(eq(AccountDocumentService.SOURCE), eq(fx.getId()), eq(date), any());
  }

  @Test
  void replayFxOnceErisimSonraKaynak() {
    UUID sourceId = UUID.randomUUID();
    AccountDocument fx = fxDocument(sourceId);
    when(documents.findByIdempotencyKey("k")).thenReturn(Optional.of(fx));

    // Anahtar yok: boş.
    assertThat(service.replayFx("yok", sourceId)).isEmpty();

    // Personel carisi, izin yok: başka kaynak verilse bile 404 (422 değil).
    when(account.getType()).thenReturn(AccountType.EMPLOYEE);
    when(access.employeeVisible()).thenReturn(false);
    assertThatThrownBy(() -> service.replayFx("k", UUID.randomUUID()))
        .isInstanceOfSatisfying(
            BusinessException.class,
            ex -> assertThat(ex.getCode()).isEqualTo("FX_SOURCE_NOT_FOUND"));

    // Kapsam dışı: başka kaynak verilse bile 403 (422 değil).
    when(access.employeeVisible()).thenReturn(true);
    doThrow(BranchScopeService.outOfScope()).when(scope).requireVisible(BRANCH);
    assertThatThrownBy(() -> service.replayFx("k", UUID.randomUUID()))
        .isInstanceOfSatisfying(
            BusinessException.class,
            ex -> assertThat(ex.getCode()).isEqualTo("BRANCH_OUT_OF_SCOPE"));

    // Erişim tamam: başka kaynak 422, aynı kaynak aynı belge.
    doNothing().when(scope).requireVisible(BRANCH);
    assertThatThrownBy(() -> service.replayFx("k", UUID.randomUUID()))
        .isInstanceOfSatisfying(
            BusinessException.class,
            ex -> assertThat(ex.getCode()).isEqualTo("IDEMPOTENCY_KEY_REUSED"));
    assertThat(service.replayFx("k", sourceId).orElseThrow().id()).isEqualTo(fx.getId());

    // Cari bulunamazsa da 404.
    when(accounts.findById(ACCOUNT)).thenReturn(Optional.empty());
    assertThatThrownBy(() -> service.replayFx("k", sourceId))
        .isInstanceOfSatisfying(
            BusinessException.class,
            ex -> assertThat(ex.getCode()).isEqualTo("FX_SOURCE_NOT_FOUND"));
  }

  private static FxDocumentCommand command(
      AccountTransaction src, AccountDocumentSide side, IncomeExpenseDirection direction) {
    return new FxDocumentCommand(
        src,
        side,
        new BigDecimal("50"),
        side == AccountDocumentSide.RECEIVABLE ? new BigDecimal("50") : new BigDecimal("-50"),
        LocalDate.of(2026, 11, 10),
        "KF-1",
        "Kur farkı",
        new BigDecimal("0.25"),
        LocalDate.of(2026, 11, 9),
        direction);
  }

  private static AccountTransaction source() {
    return new AccountTransaction(
        ACCOUNT,
        BRANCH,
        COMPANY,
        Direction.DEBIT,
        new Money(new BigDecimal("1000"), "USD"),
        new BigDecimal("30"),
        LocalDate.of(2026, 10, 1),
        new BigDecimal("30000"),
        LocalDate.of(2026, 10, 1),
        "kaynak",
        "MANUAL",
        UUID.randomUUID());
  }

  private static AccountDocument fxDocument(UUID sourceId) {
    AccountDocument document =
        new AccountDocument(
            ACCOUNT,
            BRANCH,
            COMPANY,
            AccountDocumentSide.RECEIVABLE,
            AccountDocument.TYPE_FX,
            "KF-9",
            LocalDate.of(2026, 11, 10),
            null,
            new Money(new BigDecimal("50"), "TRY"),
            null,
            DocumentPaymentMethod.OTHER,
            "Kur farkı",
            true,
            new BigDecimal("50"),
            "k");
    document.linkFxSource(sourceId, new BigDecimal("0.25"), LocalDate.of(2026, 11, 9));
    return document;
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
