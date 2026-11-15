package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementWarningCode;
import org.ece.blackrose.finance.domain.FinanceTypes.WarningSeverity;
import org.ece.blackrose.finance.domain.Settlement;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.KindBalanceRow;
import org.ece.blackrose.finance.repository.FinanceRepositories.SettlementRepository;
import org.ece.blackrose.finance.service.SettlementWarningService.CompanyBalance;
import org.ece.blackrose.finance.web.FinanceDtos.CompanyOutstandingResponse;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementWarningResponse;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.junit.jupiter.api.Test;

/** Şirket dağılımı uyarısının saf kararı (12.2 §3.6, §6.3 {@code AllocationWarningTest}). */
class AllocationWarningTest {

  private static final UUID A = UUID.fromString("00000000-0000-0000-0000-00000000000a");
  private static final UUID B = UUID.fromString("00000000-0000-0000-0000-00000000000b");
  private static final UUID C = UUID.fromString("00000000-0000-0000-0000-00000000000c");

  private static CompanyBalance owed(String credit) {
    return new CompanyBalance(BigDecimal.ZERO, new BigDecimal(credit));
  }

  private static CompanyBalance bal(String debit, String credit) {
    return new CompanyBalance(new BigDecimal(debit), new BigDecimal(credit));
  }

  private static Money tl(String amount) {
    return new Money(new BigDecimal(amount), "TRY");
  }

  @Test
  void kullaniciOrnegiOnayIster() {
    Map<UUID, CompanyBalance> full = Map.of(A, owed("100"), B, owed("50"));
    SettlementWarningResponse warning =
        SettlementWarningService.evaluate(SettlementType.PAYMENT, B, tl("150"), full, full)
            .orElseThrow();
    assertThat(warning.code()).isEqualTo(SettlementWarningCode.COMPANY_ALLOCATION_EXCEEDED);
    assertThat(warning.severity()).isEqualTo(WarningSeverity.CONFIRM);
    assertThat(warning.currency()).isEqualTo("TRY");
    assertThat(warning.companyId()).isEqualTo(B);
    assertThat(warning.companyOutstanding()).isEqualByComparingTo("50");
    assertThat(warning.amount()).isEqualByComparingTo("150");
    assertThat(warning.excess()).isEqualByComparingTo("100");
    assertThat(warning.others()).hasSize(1);
    assertThat(warning.others().get(0).companyId()).isEqualTo(A);
    assertThat(warning.others().get(0).outstanding()).isEqualByComparingTo("100");
    assertThat(warning.partialScope()).isFalse();
    assertThat(warning.otherHiddenExists()).isFalse();

    BusinessException error = SettlementWarningService.confirmationRequired(warning);
    assertThat(error.getCode()).isEqualTo("CONFIRMATION_REQUIRED");
    assertThat(error.getStatus().value()).isEqualTo(409);
    assertThat(error.getMessage()).doesNotContain("Yetkili olmadığınız");
    assertThat(error.getDetails())
        .containsExactly(
            "warning=COMPANY_ALLOCATION_EXCEEDED",
            "currency=TRY",
            "companyId=" + B,
            "companyOutstanding=50.00",
            "amount=150.00",
            "excess=100.00",
            "other." + A + "=100.00",
            "partialScope=false",
            "otherHiddenExists=false");
    assertThat(SettlementWarningService.auditDetails(warning))
        .isEqualTo("currency=TRY;companyOutstanding=50.00;amount=150.00");
    assertThat(SettlementWarningService.confirmation(List.of(warning))).contains(warning);
  }

  @Test
  void borcYeterliyseUyariYok() {
    Map<UUID, CompanyBalance> full = Map.of(B, owed("150"));
    assertThat(SettlementWarningService.evaluate(SettlementType.PAYMENT, B, tl("150"), full, full))
        .isEmpty();
    // Kuruş altı aşım uyarı değildir.
    assertThat(
            SettlementWarningService.evaluate(SettlementType.PAYMENT, B, tl("150.009"), full, full))
        .isEmpty();
    assertThat(
            SettlementWarningService.evaluate(SettlementType.PAYMENT, B, tl("150.01"), full, full))
        .isPresent();
  }

  @Test
  void borcsuzCariyeOdemeDigerSirketSatirsizOnayIster() {
    Map<UUID, CompanyBalance> full = Map.of(A, bal("30", "10"));
    SettlementWarningResponse warning =
        SettlementWarningService.evaluate(SettlementType.PAYMENT, B, tl("20"), full, full)
            .orElseThrow();
    assertThat(warning.severity()).isEqualTo(WarningSeverity.CONFIRM);
    assertThat(warning.companyOutstanding()).isEqualByComparingTo("0");
    assertThat(warning.excess()).isEqualByComparingTo("20");
    assertThat(warning.others()).isEmpty();
    assertThat(warning.otherHiddenExists()).isFalse();
  }

  @Test
  void tahsilatYalnizBilgi() {
    Map<UUID, CompanyBalance> full = Map.of(A, bal("40", "0"), C, bal("70", "20"));
    SettlementWarningResponse warning =
        SettlementWarningService.evaluate(SettlementType.COLLECTION, A, tl("100"), full, full)
            .orElseThrow();
    assertThat(warning.severity()).isEqualTo(WarningSeverity.INFO);
    assertThat(warning.companyOutstanding()).isEqualByComparingTo("40");
    assertThat(warning.excess()).isEqualByComparingTo("60");
    assertThat(warning.others())
        .extracting(CompanyOutstandingResponse::companyId)
        .containsExactly(C);
    assertThat(warning.others().get(0).outstanding()).isEqualByComparingTo("50");
    assertThat(SettlementWarningService.confirmation(List.of(warning))).isEmpty();
    assertThat(SettlementWarningService.outstanding(SettlementType.COLLECTION, null)).isZero();
    assertThat(SettlementWarningService.outstanding(SettlementType.PAYMENT, bal("10", "5")))
        .isZero();
  }

  @Test
  void kapsamliKullanicidaKararTamVeriyleGizliTutarYok() {
    // Tam veri: B'de görünen iş yerinde 100 borç, görünmeyende 30 avans (B net 70); A'da 40 borç.
    Map<UUID, CompanyBalance> full = Map.of(B, bal("30", "100"), A, owed("40"));
    // Kullanıcı yalnız B'nin görünen iş yerini görür.
    Map<UUID, CompanyBalance> shown = Map.of(B, owed("100"));
    SettlementWarningResponse warning =
        SettlementWarningService.evaluate(SettlementType.PAYMENT, B, tl("90"), full, shown)
            .orElseThrow();
    assertThat(warning.severity()).isEqualTo(WarningSeverity.CONFIRM);
    assertThat(warning.companyOutstanding()).isEqualByComparingTo("100");
    assertThat(warning.excess()).isEqualByComparingTo("0");
    assertThat(warning.others()).isEmpty();
    assertThat(warning.partialScope()).isTrue();
    assertThat(warning.otherHiddenExists()).isTrue();
    BusinessException error = SettlementWarningService.confirmationRequired(warning);
    assertThat(error.getMessage()).contains("Yetkili olmadığınız iş yerlerindeki bakiye");
    assertThat(String.join(";", error.getDetails()))
        .doesNotContain("70")
        .doesNotContain("40")
        .contains("partialScope=true", "otherHiddenExists=true");

    // Görünen diğer şirket tutarıyla birlikte, gizli kısmı yoksa bayrak düşer.
    Map<UUID, CompanyBalance> visibleOther = Map.of(B, owed("10"), A, owed("40"));
    SettlementWarningResponse plain =
        SettlementWarningService.evaluate(
                SettlementType.PAYMENT, B, tl("50"), visibleOther, visibleOther)
            .orElseThrow();
    assertThat(plain.otherHiddenExists()).isFalse();
    assertThat(plain.partialScope()).isFalse();
  }

  @Test
  void servisCariYoksaSorgulamazVeKapsamliSorguyuYalnizLimitedKullanicidaYapar() {
    AccountTransactionRepository transactions = mock(AccountTransactionRepository.class);
    BranchScopeService scope = mock(BranchScopeService.class);
    SettlementWarningService service =
        new SettlementWarningService(transactions, scope, mock(SettlementRepository.class));
    assertThat(service.check(SettlementType.PAYMENT, request(null, "10"), B)).isEmpty();
    verifyNoInteractions(transactions);

    UUID account = UUID.randomUUID();
    KindBalanceRow tryRow = row(account, B, "TRY", "0", "50");
    KindBalanceRow usdRow = row(account, A, "USD", "0", "500");
    KindBalanceRow tryA = row(account, A, "TRY", "0", "100");
    when(transactions.kindBalances(
            anyCollection(), anyString(), isNull(), isNull(), any(BranchFilter.class)))
        .thenReturn(List.of(tryRow, usdRow, tryA));
    when(scope.limited()).thenReturn(false);
    List<SettlementWarningResponse> warnings =
        service.check(SettlementType.PAYMENT, request(account, "150"), B);
    assertThat(warnings).hasSize(1);
    assertThat(warnings.get(0).others())
        .extracting(CompanyOutstandingResponse::companyId)
        .containsExactly(A);
    assertThat(warnings.get(0).others().get(0).outstanding()).isEqualByComparingTo("100");
    verify(transactions)
        .kindBalances(
            eq(List.of(account)), eq("COMPANY"), isNull(), isNull(), eq(BranchFilter.all(null)));

    BranchFilter limited = BranchFilter.limited(null, List.of(UUID.randomUUID()));
    KindBalanceRow visibleB = row(account, B, "TRY", "0", "200");
    when(scope.limited()).thenReturn(true);
    when(scope.filter(null, null)).thenReturn(limited);
    when(transactions.kindBalances(anyCollection(), anyString(), isNull(), isNull(), eq(limited)))
        .thenReturn(List.of(visibleB));
    SettlementWarningResponse scoped =
        service.check(SettlementType.PAYMENT, request(account, "150"), B).get(0);
    assertThat(scoped.companyOutstanding()).isEqualByComparingTo("200");
    assertThat(scoped.excess()).isEqualByComparingTo("0");
    assertThat(scoped.partialScope()).isTrue();
    assertThat(scoped.otherHiddenExists()).isTrue();
  }

  /**
   * Düzeltme önizlemesi (12.2a §3.4): aynı cari ve para birimindeki POSTED eski ödeme şirket
   * borcundan düşülmüş gibi; farklı cari/para birimi/tür/durum ya da taşınmış kayıt etkisiz; kapsam
   * dışı iş yerindeki kayıt yalnız karar bakiyesinde.
   */
  @Test
  void duzeltmeOnizlemesiEskiOdemeyiBorctanDuser() {
    AccountTransactionRepository transactions = mock(AccountTransactionRepository.class);
    BranchScopeService scope = mock(BranchScopeService.class);
    SettlementRepository settlements = mock(SettlementRepository.class);
    SettlementWarningService service =
        new SettlementWarningService(transactions, scope, settlements);
    UUID account = UUID.randomUUID();
    UUID branch = UUID.randomUUID();
    // B'de 150 alacak (borcumuz), 100 ödenmiş: kalan borç 50.
    KindBalanceRow b = row(account, B, "TRY", "100", "150");
    when(transactions.kindBalances(
            anyCollection(), anyString(), isNull(), isNull(), any(BranchFilter.class)))
        .thenReturn(List.of(b));
    when(scope.limited()).thenReturn(false);
    SettlementRequest request = request(account, "150");

    assertThat(service.check(SettlementType.PAYMENT, request, B)).hasSize(1);
    assertThat(service.check(SettlementType.PAYMENT, request, B, null)).hasSize(1);
    Settlement old = payment(account, branch, B, "100", "TRY");
    assertThat(service.check(SettlementType.PAYMENT, request, B, old)).isEmpty();
    // Daha fazlası yine onay ister: 150 borç, 160 ödeme.
    SettlementWarningResponse more =
        service.check(SettlementType.PAYMENT, request(account, "160"), B, old).get(0);
    assertThat(more.companyOutstanding()).isEqualByComparingTo("150");
    assertThat(more.excess()).isEqualByComparingTo("10");

    // Etkisiz: başka cari, başka para birimi, tahsilat, iptal edilmiş, taşınmış.
    assertThat(
            service.check(
                SettlementType.PAYMENT,
                request,
                B,
                payment(UUID.randomUUID(), branch, B, "100", "TRY")))
        .hasSize(1);
    assertThat(
            service.check(
                SettlementType.PAYMENT, request, B, payment(account, branch, B, "100", "USD")))
        .hasSize(1);
    Settlement collection =
        new Settlement(
            SettlementType.COLLECTION,
            SettlementMethod.CASH,
            account,
            branch,
            B,
            UUID.randomUUID(),
            null,
            null,
            null,
            tl("100"),
            LocalDate.of(2026, 11, 14),
            null,
            null);
    assertThat(service.check(SettlementType.PAYMENT, request, B, collection)).hasSize(1);
    Settlement reversed = payment(account, branch, B, "100", "TRY");
    reversed.markReversed(LocalDate.of(2026, 11, 14), null);
    assertThat(service.check(SettlementType.PAYMENT, request, B, reversed)).hasSize(1);
    Settlement moved = payment(account, branch, B, "100", "TRY");
    when(settlements.isTransferred(moved.getId())).thenReturn(true);
    assertThat(service.check(SettlementType.PAYMENT, request, B, moved)).hasSize(1);
    Settlement noAccount = payment(null, branch, B, "100", "TRY");
    assertThat(service.check(SettlementType.PAYMENT, request, B, noAccount)).hasSize(1);

    // Kapsamlı kullanıcı: görünen bakiye B1 (kapsamda) için de düşülür, kapsam dışında düşülmez.
    BranchFilter limited = BranchFilter.limited(null, List.of(branch));
    KindBalanceRow visible = row(account, B, "TRY", "100", "120");
    when(scope.limited()).thenReturn(true);
    when(scope.filter(null, null)).thenReturn(limited);
    when(transactions.kindBalances(anyCollection(), anyString(), isNull(), isNull(), eq(limited)))
        .thenReturn(List.of(visible));
    when(scope.allowedOrNull()).thenReturn(java.util.Set.of(branch));
    SettlementWarningResponse inScope =
        service.check(SettlementType.PAYMENT, request(account, "200"), B, old).get(0);
    assertThat(inScope.companyOutstanding()).isEqualByComparingTo("120");
    Settlement hidden = payment(account, UUID.randomUUID(), B, "100", "TRY");
    SettlementWarningResponse outOfScope =
        service.check(SettlementType.PAYMENT, request(account, "200"), B, hidden).get(0);
    assertThat(outOfScope.companyOutstanding()).isEqualByComparingTo("20");
    assertThat(outOfScope.partialScope()).isTrue();
  }

  @Test
  void borcDusmeKopyaUzerinde() {
    Map<UUID, CompanyBalance> balances = Map.of(A, bal("100", "150"));
    Map<UUID, CompanyBalance> adjusted =
        SettlementWarningService.withoutPayment(balances, A, new BigDecimal("40"));
    assertThat(adjusted.get(A).debit()).isEqualByComparingTo("60");
    assertThat(balances.get(A).debit()).isEqualByComparingTo("100");
    Map<UUID, CompanyBalance> missing =
        SettlementWarningService.withoutPayment(balances, B, new BigDecimal("10"));
    assertThat(missing.get(B).debit()).isEqualByComparingTo("-10");
    assertThat(missing.get(B).credit()).isEqualByComparingTo("0");
  }

  private static Settlement payment(
      UUID account, UUID branch, UUID company, String amount, String currency) {
    return new Settlement(
        SettlementType.PAYMENT,
        SettlementMethod.CASH,
        account,
        branch,
        company,
        UUID.randomUUID(),
        null,
        null,
        null,
        new Money(new BigDecimal(amount), currency),
        LocalDate.of(2026, 11, 14),
        null,
        null);
  }

  private static SettlementRequest request(UUID account, String amount) {
    return new SettlementRequest(
        SettlementMethod.CASH,
        account,
        UUID.randomUUID(),
        UUID.randomUUID(),
        null,
        null,
        null,
        tl(amount),
        LocalDate.of(2026, 11, 14),
        null,
        null);
  }

  private static KindBalanceRow row(
      UUID account, UUID company, String currency, String debit, String credit) {
    KindBalanceRow row = mock(KindBalanceRow.class);
    when(row.getAccountId()).thenReturn(account);
    when(row.getCompanyId()).thenReturn(company);
    when(row.getCurrency()).thenReturn(currency);
    when(row.getDebit()).thenReturn(new BigDecimal(debit));
    when(row.getCredit()).thenReturn(new BigDecimal(credit));
    return row;
  }
}
