package org.ece.blackrose.shipment.service;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountDocumentTypeRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.service.CompanyIdentityRule;
import org.ece.blackrose.finance.service.ExchangeRateService;
import org.ece.blackrose.finance.service.LedgerService;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.organization.CompanyResolver;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.domain.ShipmentLeg;
import org.ece.blackrose.shipment.domain.ShipmentTypes.CostKind;
import org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus;
import org.ece.blackrose.shipment.domain.TripCost;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentLegRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.SubcontractQueryRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.TripCostRepository;
import org.ece.blackrose.shipment.web.ShipmentDtos.ReverseCostRequest;
import org.ece.blackrose.shipment.web.ShipmentDtos.SaveSubcontractCostRequest;
import org.ece.blackrose.tenant.TenantClock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Taşeron gideri kaydının çatışma ve doğrulama dalları (12.7 §3.3, §6.3). */
class SubcontractCostServiceTest {

  private static final UUID SHIPMENT = UUID.randomUUID();
  private static final UUID LEG = UUID.randomUUID();
  private static final UUID CARRIER = UUID.randomUUID();
  private static final UUID BRANCH = UUID.randomUUID();

  private final ShipmentService shipments = mock(ShipmentService.class);
  private final ShipmentLegRepository legs = mock(ShipmentLegRepository.class);
  private final TripCostRepository costs = mock(TripCostRepository.class);
  private final SubcontractQueryRepository queries = mock(SubcontractQueryRepository.class);
  private final AccountRepository accounts = mock(AccountRepository.class);
  private final LedgerService ledger = mock(LedgerService.class);
  private final Shipment shipment = mock(Shipment.class);
  private final ShipmentLeg leg = mock(ShipmentLeg.class);

  private SubcontractCostService service;

  @BeforeEach
  void setUp() {
    service =
        new SubcontractCostService(
            shipments,
            legs,
            costs,
            queries,
            accounts,
            mock(AccountDocumentTypeRepository.class),
            mock(CompanyResolver.class),
            mock(CompanyIdentityRule.class),
            mock(BranchScopeService.class),
            mock(ExchangeRateService.class),
            ledger,
            mock(AuditService.class),
            mock(TenantClock.class));
    when(shipments.lock(SHIPMENT)).thenReturn(shipment);
    when(shipment.getStatus()).thenReturn(ShipmentStatus.PLANNED);
    when(shipment.getBranchId()).thenReturn(BRANCH);
    when(legs.findById(LEG)).thenReturn(Optional.of(leg));
    when(leg.getShipmentId()).thenReturn(SHIPMENT);
    when(leg.getCarrierAccountId()).thenReturn(CARRIER);
    when(accounts.findById(CARRIER)).thenReturn(Optional.of(mock(Account.class)));
  }

  private static SaveSubcontractCostRequest request(String vat, String withholding) {
    return new SaveSubcontractCostRequest(
        Money.of("1000", "TRY"),
        new BigDecimal(vat),
        new BigDecimal(withholding),
        BigDecimal.ZERO,
        null,
        null,
        LocalDate.of(2026, 11, 16),
        null,
        null,
        null);
  }

  private static TripCost cost(UUID account) {
    return new TripCost(
        SHIPMENT,
        LEG,
        CostKind.SUBCONTRACTOR,
        account,
        null,
        Money.of("1000", "TRY"),
        new BigDecimal("1000"),
        "Etap 1 taşeron");
  }

  private static void expectCode(Runnable call, String code) {
    assertThatThrownBy(call::run)
        .isInstanceOf(BusinessException.class)
        .extracting("code")
        .isEqualTo(code);
  }

  @Test
  void ayniEtaptaIkiTaseronGideriVarsaCostDuplicate() {
    when(costs.findByLegIdAndKindOrderByCreatedAt(LEG, CostKind.SUBCONTRACTOR))
        .thenReturn(List.of(cost(CARRIER), cost(CARRIER)));

    expectCode(() -> service.save(SHIPMENT, LEG, request("200", "40")), "COST_DUPLICATE");
    verify(ledger, never()).post(any());
  }

  @Test
  void giderBaskaCariyeAitseCarrierMismatch() {
    when(costs.findByLegIdAndKindOrderByCreatedAt(LEG, CostKind.SUBCONTRACTOR))
        .thenReturn(List.of(cost(UUID.randomUUID())));

    expectCode(() -> service.save(SHIPMENT, LEG, request("200", "40")), "CARRIER_MISMATCH");
    verify(ledger, never()).post(any());
  }

  @Test
  void dogrulamaVeDurumDallari() {
    expectCode(() -> service.save(SHIPMENT, LEG, request("10", "20")), "WITHHOLDING_EXCEEDS_VAT");

    when(leg.getCarrierAccountId()).thenReturn(null);
    expectCode(() -> service.save(SHIPMENT, LEG, request("0", "0")), "LEG_NOT_SUBCONTRACTED");

    when(leg.getShipmentId()).thenReturn(UUID.randomUUID());
    expectCode(() -> service.save(SHIPMENT, LEG, request("0", "0")), "LEG_NOT_FOUND");

    when(shipment.getStatus()).thenReturn(ShipmentStatus.CANCELLED);
    expectCode(() -> service.save(SHIPMENT, LEG, request("0", "0")), "SHIPMENT_CANCELLED");

    expectCode(() -> service.summary(0, null, null), "DAYS_INVALID");
    expectCode(() -> service.summary(366, null, null), "DAYS_INVALID");
  }

  @Test
  void tersKayitVeSilmeDallari() {
    TripCost open = cost(CARRIER);
    UUID id = open.getId();
    when(queries.shipmentIdOf(id)).thenReturn(Optional.of(SHIPMENT));
    when(costs.lockById(id)).thenReturn(Optional.of(open));
    ReverseCostRequest reverse = new ReverseCostRequest(LocalDate.of(2026, 11, 16), "x");

    expectCode(() -> service.reverse(id, reverse), "COST_NOT_POSTED");

    open.markPosted(java.time.Instant.now());
    expectCode(() -> service.remove(id), "COST_POSTED");
    when(queries.existsOpenPlanForTripCost(id)).thenReturn(true);
    expectCode(() -> service.reverse(id, reverse), "COST_PLAN_OPEN");

    TripCost fuel =
        new TripCost(
            SHIPMENT,
            LEG,
            CostKind.FUEL,
            CARRIER,
            null,
            Money.of("10", "TRY"),
            BigDecimal.TEN,
            "yakıt");
    when(queries.shipmentIdOf(fuel.getId())).thenReturn(Optional.of(SHIPMENT));
    when(costs.lockById(fuel.getId())).thenReturn(Optional.of(fuel));
    expectCode(() -> service.remove(fuel.getId()), "COST_NOT_REVERSIBLE");

    UUID missing = UUID.randomUUID();
    when(queries.shipmentIdOf(missing)).thenReturn(Optional.empty());
    expectCode(() -> service.reverse(missing, reverse), "COST_NOT_FOUND");
  }
}
