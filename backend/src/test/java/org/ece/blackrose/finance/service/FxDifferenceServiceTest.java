package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.AccountTransaction;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentSide;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.IncomeExpenseDirection;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountDocumentRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountTransferLineRepository;
import org.ece.blackrose.finance.repository.FinanceReportRepositories;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.FxSettlement;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.ExchangeRateRepository;
import org.ece.blackrose.finance.service.AccountDocumentService.FxDocumentCommand;
import org.ece.blackrose.finance.service.ExchangeRateService.Conversion;
import org.ece.blackrose.finance.service.FxDifferenceService.FxReportQuery;
import org.ece.blackrose.finance.web.FinanceReportDtos.FxCutState;
import org.ece.blackrose.finance.web.FinanceReportDtos.FxDifferenceRequest;
import org.ece.blackrose.finance.web.FinanceReportDtos.FxEffect;
import org.ece.blackrose.finance.web.FinanceReportDtos.FxValuationBlock;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.tenant.TenantClock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;

/** Kur farkı kuralları (12.8 §3.2, §6.3): yön/etki, belge no, açıklama, değerleme, sayfa, fark. */
class FxDifferenceServiceTest {

  private static final LocalDate TODAY = LocalDate.of(2026, 11, 16);
  private static final UUID ACCOUNT = UUID.randomUUID();
  private static final UUID BRANCH = UUID.randomUUID();
  private static final UUID COMPANY = UUID.randomUUID();

  private FinanceReportRepositories reports;
  private AccountTransactionRepository transactions;
  private AccountRepository accounts;
  private AccountDocumentRepository documents;
  private AccountDocumentService documentService;
  private ExchangeRateService rates;
  private AccountAccess access;
  private BranchScopeService scope;
  private FxDifferenceService service;
  private AccountTransaction source;

  @BeforeEach
  void setUp() {
    reports = mock(FinanceReportRepositories.class);
    transactions = mock(AccountTransactionRepository.class);
    accounts = mock(AccountRepository.class);
    documents = mock(AccountDocumentRepository.class);
    documentService = mock(AccountDocumentService.class);
    rates = mock(ExchangeRateService.class);
    access = mock(AccountAccess.class);
    scope = mock(BranchScopeService.class);
    TenantClock clock = mock(TenantClock.class);
    when(clock.today()).thenReturn(TODAY);
    service =
        new FxDifferenceService(
            reports,
            transactions,
            accounts,
            documents,
            mock(AccountTransferLineRepository.class),
            documentService,
            rates,
            mock(ExchangeRateRepository.class),
            access,
            new CompanyIdentityRule(),
            scope,
            clock);
    source =
        new AccountTransaction(
            ACCOUNT,
            BRANCH,
            COMPANY,
            Direction.DEBIT,
            new Money(new BigDecimal("1000"), "USD"),
            new BigDecimal("34"),
            LocalDate.of(2026, 10, 1),
            new BigDecimal("34000.0000"),
            LocalDate.of(2026, 10, 1),
            "kaynak",
            "MANUAL",
            UUID.randomUUID());
    Account account = mock(Account.class);
    when(account.getType()).thenReturn(AccountType.CUSTOMER);
    when(transactions.findById(source.getId())).thenReturn(Optional.of(source));
    when(transactions.findForUpdate(source.getId())).thenReturn(Optional.of(source));
    when(transactions.findBySourceTypeAndSourceId(any(), any())).thenReturn(Optional.empty());
    when(accounts.findById(ACCOUNT)).thenReturn(Optional.of(account));
    when(access.usableLocked(ACCOUNT)).thenReturn(account);
    when(reports.fxSettlement(any(), any())).thenReturn(Optional.empty());
    when(reports.documentNoOf(source.getId())).thenReturn(Optional.of("FTR-1"));
    when(rates.convert(any(), any(), any()))
        .thenReturn(
            new Conversion(
                new BigDecimal("36"), LocalDate.of(2026, 11, 13), new BigDecimal("36000.00")));
  }

  // --- yön ve etki tablosu (4 durum)

  @Test
  void yonVeEtkiTablosu() {
    BigDecimal up = new BigDecimal("10");
    BigDecimal down = new BigDecimal("-10");
    assertThat(FxDifferenceService.documentDirection(Direction.DEBIT, up))
        .isEqualTo(Direction.DEBIT);
    assertThat(FxDifferenceService.documentDirection(Direction.DEBIT, down))
        .isEqualTo(Direction.CREDIT);
    assertThat(FxDifferenceService.documentDirection(Direction.CREDIT, up))
        .isEqualTo(Direction.CREDIT);
    assertThat(FxDifferenceService.documentDirection(Direction.CREDIT, down))
        .isEqualTo(Direction.DEBIT);
    assertThat(FxDifferenceService.effect(Direction.DEBIT, up)).isEqualTo(FxEffect.GAIN);
    assertThat(FxDifferenceService.effect(Direction.DEBIT, down)).isEqualTo(FxEffect.LOSS);
    assertThat(FxDifferenceService.effect(Direction.CREDIT, up)).isEqualTo(FxEffect.LOSS);
    assertThat(FxDifferenceService.effect(Direction.CREDIT, down)).isEqualTo(FxEffect.GAIN);
    assertThat(FxDifferenceService.effect(Direction.DEBIT, new BigDecimal("0.009")))
        .isEqualTo(FxEffect.NONE);
  }

  @Test
  void belgeNumarasiKesilirVeKaynakNoYoksaKimlikOnEki() {
    UUID id = UUID.fromString("abcdef12-0000-0000-0000-000000000000");
    assertThat(FxDifferenceService.documentNo(null, id)).isEqualTo("KF-ABCDEF12");
    assertThat(FxDifferenceService.documentNo(" ", id)).isEqualTo("KF-ABCDEF12");
    assertThat(FxDifferenceService.documentNo("FTR-1", id)).isEqualTo("KF-FTR-1");
    String longNo = "X".repeat(50);
    assertThat(FxDifferenceService.documentNo(longNo, id)).hasSize(50).startsWith("KF-XXX");
  }

  @Test
  void aciklamaBicimi() {
    assertThat(FxDifferenceService.description(source, new BigDecimal("36.5"), "FTR-1"))
        .isEqualTo("Kur farkı (USD 1.000,00 × (36,5000 − 34,0000)): FTR-1");
    assertThat(FxDifferenceService.description(source, new BigDecimal("36"), null)).endsWith(": -");
  }

  @Test
  void degerlemeEngeli() {
    LocalDate v = LocalDate.of(2026, 11, 10);
    assertThat(FxDifferenceService.valuationBlock(v.plusDays(1), null, v))
        .isEqualTo(FxValuationBlock.AFTER_VALUATION);
    assertThat(
            FxDifferenceService.valuationBlock(
                v.minusDays(5), new FxSettlement(BigDecimal.ZERO, v.minusDays(1)), v))
        .isEqualTo(FxValuationBlock.SETTLED);
    // Kapanış günü = değerleme günü engel değildir.
    assertThat(
            FxDifferenceService.valuationBlock(
                v.minusDays(5), new FxSettlement(BigDecimal.ZERO, v), v))
        .isNull();
    assertThat(
            FxDifferenceService.valuationBlock(
                v.minusDays(5), new FxSettlement(BigDecimal.TEN, null), v))
        .isNull();
    assertThat(FxDifferenceService.valuationBlock(v, null, v)).isNull();
  }

  // --- sayfa doğrulaması

  @Test
  void sayfaParametreleriDogrulanir() {
    for (int[] bad : new int[][] {{-1, 10}, {100_001, 10}, {0, 0}, {Integer.MAX_VALUE, 1}}) {
      assertThatThrownBy(() -> service.report(query(), bad[0], bad[1]))
          .isInstanceOfSatisfying(
              BusinessException.class,
              ex -> {
                assertThat(ex.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST);
                assertThat(ex.getCode()).isEqualTo("PAGE_INVALID");
              });
    }
    verify(reports, never()).fxCandidates(any(), anyInt(), anyLong());
  }

  @Test
  void sayfaBoyutuKirpilirVeOfsetUzunHesaplanir() {
    when(scope.filter(any(), any())).thenReturn(BranchFilter.all(null));
    when(reports.fxCandidates(any(), anyInt(), anyLong())).thenReturn(List.of());
    when(reports.fxSettlements(any(), any())).thenReturn(Map.of());
    when(reports.fxCandidateCount(any())).thenReturn(4001L);

    var response = service.report(query(), 100_000, 5000);

    verify(reports).fxCandidates(any(), eq(2000), eq(200_000_000L));
    assertThat(response.size()).isEqualTo(2000);
    assertThat(response.totalPages()).isEqualTo(3);
    assertThat(response.valuationDate()).isEqualTo(TODAY);
  }

  @Test
  void raporTarihleriDogrulanir() {
    when(scope.filter(any(), any())).thenReturn(BranchFilter.all(null));
    FxReportQuery period =
        new FxReportQuery(
            null, null, null, null, TODAY, TODAY.minusDays(1), FxCutState.ALL, null, false);
    assertThatThrownBy(() -> service.report(period, 0, 10))
        .isInstanceOfSatisfying(
            BusinessException.class, ex -> assertThat(ex.getCode()).isEqualTo("PERIOD_INVALID"));
    FxReportQuery future =
        new FxReportQuery(null, null, null, null, null, null, null, TODAY.plusDays(1), false);
    assertThatThrownBy(() -> service.report(future, 0, 10))
        .isInstanceOfSatisfying(
            BusinessException.class, ex -> assertThat(ex.getCode()).isEqualTo("FX_DATE_INVALID"));
  }

  // --- kesim: beklenen fark karşılaştırması

  @Test
  void beklenenFarkOlcekFarkindanBagimsizKarsilastirilir() {
    service.cut(request("2000.0"), null);

    ArgumentCaptor<FxDocumentCommand> command = ArgumentCaptor.forClass(FxDocumentCommand.class);
    verify(documentService).createFxDifference(command.capture(), eq(null));
    FxDocumentCommand cmd = command.getValue();
    assertThat(cmd.amount()).isEqualByComparingTo("2000");
    assertThat(cmd.signedDifference()).isEqualByComparingTo("2000");
    assertThat(cmd.side()).isEqualTo(AccountDocumentSide.RECEIVABLE);
    assertThat(cmd.ieDirection()).isEqualTo(IncomeExpenseDirection.INCOME);
    assertThat(cmd.documentNo()).isEqualTo("KF-FTR-1");
    assertThat(cmd.rate()).isEqualByComparingTo("36");
    assertThat(cmd.rateDate()).isEqualTo(LocalDate.of(2026, 11, 13));
    assertThat(cmd.description())
        .isEqualTo("Kur farkı (USD 1.000,00 × (36,0000 − 34,0000)): FTR-1");
  }

  @Test
  void farkliBeklenenFark409() {
    assertThatThrownBy(() -> service.cut(request("1999.99"), null))
        .isInstanceOfSatisfying(
            BusinessException.class,
            ex -> {
              assertThat(ex.getStatus()).isEqualTo(HttpStatus.CONFLICT);
              assertThat(ex.getCode()).isEqualTo("FX_DIFFERENCE_CHANGED");
              assertThat(ex.getDetails())
                  .containsExactly("difference=2000.0000", "rate=36", "rateDate=2026-11-13");
            });
    verify(documentService, never()).createFxDifference(any(), any());
  }

  @Test
  void kapanmisKaynak422VeKapanisGunuSerbest() {
    when(reports.fxSettlement(any(), any()))
        .thenReturn(Optional.of(new FxSettlement(BigDecimal.ZERO, LocalDate.of(2026, 11, 1))));
    assertThatThrownBy(() -> service.cut(request("2000"), null))
        .isInstanceOfSatisfying(
            BusinessException.class,
            ex -> {
              assertThat(ex.getCode()).isEqualTo("FX_SOURCE_SETTLED");
              assertThat(ex.getDetails()).containsExactly("closedOn=2026-11-01");
            });
  }

  @Test
  void personelCarisiIzinsiz404() {
    Account employee = mock(Account.class);
    when(employee.getType()).thenReturn(AccountType.EMPLOYEE);
    when(accounts.findById(ACCOUNT)).thenReturn(Optional.of(employee));
    when(access.employeeVisible()).thenReturn(false);
    assertThatThrownBy(() -> service.cut(request("2000"), null))
        .isInstanceOfSatisfying(
            BusinessException.class,
            ex -> assertThat(ex.getCode()).isEqualTo("FX_SOURCE_NOT_FOUND"));
    verify(scope, never()).requireNew(any());
  }

  @Test
  void tekrarYoluYeniKayitYazmaz() {
    var existing = mock(org.ece.blackrose.finance.web.AccountDtos.AccountDocumentResponse.class);
    when(documentService.replayFx("k", source.getId())).thenReturn(Optional.of(existing));
    assertThat(service.cut(request("1"), "k")).isSameAs(existing);
    verify(transactions, never()).findForUpdate(any());
  }

  private FxDifferenceRequest request(String expected) {
    return new FxDifferenceRequest(
        source.getId(), LocalDate.of(2026, 11, 14), new BigDecimal(expected), null);
  }

  private static FxReportQuery query() {
    return new FxReportQuery(null, null, null, null, null, null, null, null, false);
  }
}
