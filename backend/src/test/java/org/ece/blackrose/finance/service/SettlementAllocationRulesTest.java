package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.AllocationTargetType;
import org.ece.blackrose.finance.domain.FinanceTypes.InvoiceSide;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.repository.FinanceRepositories.SettlementAllocationRepository;
import org.ece.blackrose.finance.service.SettlementAllocationService.Reason;
import org.ece.blackrose.finance.service.SettlementAllocationService.Target;
import org.ece.blackrose.finance.web.FinanceDtos.AllocationRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementRequest;
import org.ece.blackrose.organization.BranchScopeService;
import org.junit.jupiter.api.Test;

/**
 * Fatura eşleştirmenin saf kuralları (12.2a §3.3, §6.3): tür × taraf tablosu, toplam formülü, kalan
 * hesabı, ret nedenleri ve kilit sırası.
 */
class SettlementAllocationRulesTest {

  private static final UUID ACCOUNT = UUID.fromString("00000000-0000-0000-0000-0000000000a1");
  private static final UUID COMPANY = UUID.fromString("00000000-0000-0000-0000-0000000000c1");

  @Test
  void turTarafTablosu() {
    assertThat(SettlementAllocationService.requiredSide(SettlementType.PAYMENT))
        .isEqualTo(InvoiceSide.PAYABLE);
    assertThat(SettlementAllocationService.requiredSide(SettlementType.COLLECTION))
        .isEqualTo(InvoiceSide.RECEIVABLE);
    for (AllocationTargetType target : AllocationTargetType.values()) {
      boolean payment = SettlementAllocationService.accepts(SettlementType.PAYMENT, target);
      boolean collection = SettlementAllocationService.accepts(SettlementType.COLLECTION, target);
      switch (target) {
        case PURCHASE_INVOICE -> assertThat(payment && !collection).isTrue();
        case FREIGHT_INVOICE, WAREHOUSE_INVOICE -> assertThat(!payment && collection).isTrue();
        case OPENING_INVOICE, ACCOUNT_DOCUMENT -> assertThat(payment && collection).isTrue();
      }
    }
  }

  @Test
  void toplamFormulu() {
    // Fatura: toplam tutar (reflected + ledgerAmount).
    assertThat(
            SettlementAllocationService.total(
                target(AllocationTargetType.PURCHASE_INVOICE, InvoiceSide.PAYABLE, true, "118")))
        .isEqualByComparingTo("118");
    // Deftere yansıyan belge: defter tutarı.
    Target reflected =
        new Target(
            AllocationTargetType.ACCOUNT_DOCUMENT,
            UUID.randomUUID(),
            ACCOUNT,
            COMPANY,
            UUID.randomUUID(),
            "TRY",
            InvoiceSide.PAYABLE,
            true,
            true,
            true,
            new BigDecimal("95"),
            new BigDecimal("90"),
            new BigDecimal("100"));
    assertThat(SettlementAllocationService.total(reflected)).isEqualByComparingTo("95");
    // Yansımayan, vergili: ödenecek tutar; vergisiz: belge tutarı.
    Target taxed =
        new Target(
            AllocationTargetType.ACCOUNT_DOCUMENT,
            UUID.randomUUID(),
            ACCOUNT,
            COMPANY,
            UUID.randomUUID(),
            "TRY",
            InvoiceSide.PAYABLE,
            true,
            true,
            false,
            null,
            new BigDecimal("90"),
            new BigDecimal("100"));
    assertThat(SettlementAllocationService.total(taxed)).isEqualByComparingTo("90");
    Target plain =
        new Target(
            AllocationTargetType.ACCOUNT_DOCUMENT,
            UUID.randomUUID(),
            ACCOUNT,
            COMPANY,
            UUID.randomUUID(),
            "TRY",
            InvoiceSide.PAYABLE,
            true,
            true,
            false,
            null,
            null,
            new BigDecimal("100"));
    assertThat(SettlementAllocationService.total(plain)).isEqualByComparingTo("100");
  }

  @Test
  void kalanSifirAltinaInmez() {
    assertThat(SettlementAllocationService.remaining(new BigDecimal("100"), new BigDecimal("30")))
        .isEqualByComparingTo("70");
    assertThat(SettlementAllocationService.remaining(new BigDecimal("100"), new BigDecimal("130")))
        .isEqualByComparingTo("0");
    assertThat(SettlementAllocationService.remaining(new BigDecimal("0.30"), new BigDecimal("0.1")))
        .isEqualByComparingTo("0.2");
  }

  @Test
  void retNedenleriSirasiyla() {
    Target open = target(AllocationTargetType.FREIGHT_INVOICE, InvoiceSide.RECEIVABLE, true, "50");
    assertThat(reason(SettlementType.COLLECTION, open, ACCOUNT, COMPANY, "TRY")).isEmpty();
    assertThat(reason(SettlementType.COLLECTION, null, ACCOUNT, COMPANY, "TRY"))
        .contains(Reason.NOT_FOUND);
    // Fatura sayılmayan cari belgesi yok sayılır.
    Target nonInvoice =
        new Target(
            AllocationTargetType.ACCOUNT_DOCUMENT,
            UUID.randomUUID(),
            ACCOUNT,
            COMPANY,
            UUID.randomUUID(),
            "TRY",
            InvoiceSide.RECEIVABLE,
            true,
            false,
            true,
            BigDecimal.TEN,
            null,
            BigDecimal.TEN);
    assertThat(reason(SettlementType.COLLECTION, nonInvoice, ACCOUNT, COMPANY, "TRY"))
        .contains(Reason.NOT_FOUND);
    // Ödemede navlun faturası; tahsilatta borç tarafı açılış faturası.
    assertThat(reason(SettlementType.PAYMENT, open, ACCOUNT, COMPANY, "TRY")).contains(Reason.SIDE);
    Target payableOpening =
        target(AllocationTargetType.OPENING_INVOICE, InvoiceSide.PAYABLE, true, "10");
    assertThat(reason(SettlementType.COLLECTION, payableOpening, ACCOUNT, COMPANY, "TRY"))
        .contains(Reason.SIDE);
    assertThat(reason(SettlementType.PAYMENT, payableOpening, ACCOUNT, COMPANY, "TRY")).isEmpty();
    Target closed =
        target(AllocationTargetType.FREIGHT_INVOICE, InvoiceSide.RECEIVABLE, false, "50");
    assertThat(reason(SettlementType.COLLECTION, closed, ACCOUNT, COMPANY, "TRY"))
        .contains(Reason.CLOSED);
    assertThat(reason(SettlementType.COLLECTION, open, UUID.randomUUID(), COMPANY, "TRY"))
        .contains(Reason.ACCOUNT);
    assertThat(reason(SettlementType.COLLECTION, open, ACCOUNT, UUID.randomUUID(), "TRY"))
        .contains(Reason.COMPANY);
    assertThat(reason(SettlementType.COLLECTION, open, ACCOUNT, COMPANY, "USD"))
        .contains(Reason.CURRENCY);
  }

  @Test
  void kilitSirasiTekilVeArtan() {
    UUID a = UUID.fromString("00000000-0000-0000-0000-000000000003");
    UUID b = UUID.fromString("00000000-0000-0000-0000-000000000001");
    UUID c = UUID.fromString("00000000-0000-0000-0000-000000000002");
    assertThat(SettlementAllocationService.lockOrder(List.of(a, b, c, b))).containsExactly(b, c, a);
    assertThat(SettlementAllocationService.plain(new BigDecimal("100.0000"))).isEqualTo("100");
    assertThat(SettlementAllocationService.plain(new BigDecimal("12.5000"))).isEqualTo("12.5");
  }

  @Test
  void bosEslestirmeVeCarisizOdemeVeTekrarliHedef() {
    SettlementAllocationRepository repository = mock(SettlementAllocationRepository.class);
    BranchScopeService scope = mock(BranchScopeService.class);
    SettlementAllocationService service = new SettlementAllocationService(repository, scope);
    service.validate(SettlementType.PAYMENT, request(ACCOUNT, null), COMPANY, null);
    service.validate(SettlementType.PAYMENT, request(ACCOUNT, List.of()), COMPANY, null);
    service.save(null, null);
    service.save(null, List.of());
    verifyNoInteractions(repository);

    UUID target = UUID.randomUUID();
    AllocationRequest line =
        new AllocationRequest(AllocationTargetType.PURCHASE_INVOICE, target, BigDecimal.ONE);
    BusinessException expense =
        catchBusiness(
            () ->
                service.validate(
                    SettlementType.PAYMENT, request(null, List.of(line)), COMPANY, null));
    assertThat(expense.getCode()).isEqualTo("ALLOCATION_TARGET_INVALID");
    assertThat(expense.getStatus().value()).isEqualTo(422);
    BusinessException duplicate =
        catchBusiness(
            () ->
                service.validate(
                    SettlementType.PAYMENT, request(ACCOUNT, List.of(line, line)), COMPANY, null));
    assertThat(duplicate.getCode()).isEqualTo("ALLOCATION_DUPLICATE_TARGET");
    verify(repository, never()).lockTarget(anyString());

    // Hedef bulunamazsa 422 NOT_FOUND; kilit hedef kimliğiyle alınır, hariç tutulan yer tutucu.
    when(repository.targets(any())).thenReturn(List.of());
    when(repository.allocatedTotals(any(), any())).thenReturn(List.of());
    BusinessException missing =
        catchBusiness(
            () ->
                service.validate(
                    SettlementType.PAYMENT, request(ACCOUNT, List.of(line)), COMPANY, null));
    assertThat(missing.getCode()).isEqualTo("ALLOCATION_TARGET_INVALID");
    assertThat(missing.getDetails()).containsExactly("targetId=" + target, "reason=NOT_FOUND");
    verify(repository).lockTarget(target.toString());
    verify(repository).allocatedTotals(List.of(target), SettlementAllocationService.NO_SETTLEMENT);
  }

  private static Optional<Reason> reason(
      SettlementType type, Target target, UUID account, UUID company, String currency) {
    return SettlementAllocationService.rejection(type, target, account, company, currency);
  }

  private static Target target(
      AllocationTargetType type, InvoiceSide side, boolean open, String total) {
    return new Target(
        type,
        UUID.randomUUID(),
        ACCOUNT,
        COMPANY,
        UUID.randomUUID(),
        "TRY",
        side,
        open,
        true,
        true,
        new BigDecimal(total),
        null,
        new BigDecimal(total));
  }

  private static SettlementRequest request(UUID account, List<AllocationRequest> allocations) {
    return new SettlementRequest(
        SettlementMethod.CASH,
        account,
        UUID.randomUUID(),
        UUID.randomUUID(),
        account == null ? UUID.randomUUID() : null,
        null,
        null,
        new Money(new BigDecimal("100"), "TRY"),
        LocalDate.of(2026, 11, 15),
        null,
        null,
        null,
        null,
        null,
        null,
        allocations);
  }

  private static BusinessException catchBusiness(Runnable call) {
    try {
      call.run();
    } catch (BusinessException error) {
      return error;
    }
    throw new AssertionError("BusinessException bekleniyordu");
  }
}
