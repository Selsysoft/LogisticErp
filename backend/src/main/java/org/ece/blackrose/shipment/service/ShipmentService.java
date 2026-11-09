package org.ece.blackrose.shipment.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.crm.domain.CrmTypes.QuoteStatus;
import org.ece.blackrose.crm.domain.Quote;
import org.ece.blackrose.crm.domain.QuoteLine;
import org.ece.blackrose.crm.repository.CrmRepositories.QuoteLineRepository;
import org.ece.blackrose.crm.repository.CrmRepositories.QuoteRepository;
import org.ece.blackrose.crm.service.PricingService;
import org.ece.blackrose.crm.web.CrmDtos.PriceBreakdown;
import org.ece.blackrose.crm.web.CrmDtos.PriceRequest;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchRepository;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.domain.ShipmentCargo;
import org.ece.blackrose.shipment.domain.ShipmentEvent;
import org.ece.blackrose.shipment.domain.ShipmentLeg;
import org.ece.blackrose.shipment.domain.ShipmentTypes.EventType;
import org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ProofOfDeliveryRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentCargoRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentEventRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentLegRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentRepository;
import org.ece.blackrose.shipment.web.ShipmentDtos.CargoRequest;
import org.ece.blackrose.shipment.web.ShipmentDtos.CreateShipmentRequest;
import org.ece.blackrose.shipment.web.ShipmentDtos.SaveInternationalRequest;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Taşıma emri ve durum makinesi. Fatura ve kapanış durumları yalnız kendi işlemleriyle değişir,
 * elle geçilemez.
 */
@Service
public class ShipmentService {

  private static final BigDecimal KG_PER_TON = new BigDecimal("1000");

  private static final Map<ShipmentStatus, Set<ShipmentStatus>> TRANSITIONS =
      Map.of(
          ShipmentStatus.QUOTED, Set.of(ShipmentStatus.PLANNED, ShipmentStatus.CANCELLED),
          ShipmentStatus.PLANNED, Set.of(ShipmentStatus.LOADED, ShipmentStatus.CANCELLED),
          ShipmentStatus.LOADED, Set.of(ShipmentStatus.IN_TRANSIT, ShipmentStatus.CANCELLED),
          ShipmentStatus.IN_TRANSIT, Set.of(ShipmentStatus.DELIVERED));

  private final ShipmentRepository shipments;
  private final ShipmentCargoRepository cargo;
  private final ShipmentLegRepository legs;
  private final ShipmentEventRepository events;
  private final ProofOfDeliveryRepository pods;
  private final QuoteLineRepository quoteLines;
  private final QuoteRepository quotes;
  private final PricingService pricing;
  private final AccountRepository accounts;
  private final BranchRepository branches;
  private final ShipmentViews views;
  private final TenantClock clock;
  private final AuditService audit;
  private final DistanceProvider distances;

  private final org.ece.blackrose.saas.service.PlanLimitService planLimits;
  private final DeliveryNotifier deliveryNotifier;

  public ShipmentService(
      ShipmentRepository shipments,
      ShipmentCargoRepository cargo,
      ShipmentLegRepository legs,
      ShipmentEventRepository events,
      ProofOfDeliveryRepository pods,
      QuoteLineRepository quoteLines,
      QuoteRepository quotes,
      PricingService pricing,
      AccountRepository accounts,
      BranchRepository branches,
      ShipmentViews views,
      TenantClock clock,
      AuditService audit,
      DistanceProvider distances,
      org.ece.blackrose.saas.service.PlanLimitService planLimits,
      DeliveryNotifier deliveryNotifier) {
    this.deliveryNotifier = deliveryNotifier;
    this.planLimits = planLimits;
    this.distances = distances;
    this.audit = audit;
    this.shipments = shipments;
    this.cargo = cargo;
    this.legs = legs;
    this.events = events;
    this.pods = pods;
    this.quoteLines = quoteLines;
    this.quotes = quotes;
    this.pricing = pricing;
    this.accounts = accounts;
    this.branches = branches;
    this.views = views;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public Page<Shipment> list(ShipmentStatus status, String search, Pageable pageable) {
    String term = search == null ? "" : search.trim().toLowerCase(Locale.ROOT);
    return shipments.search(status, term, pageable);
  }

  @Transactional(readOnly = true)
  public Shipment get(UUID id) {
    return shipments.findById(id).orElseThrow(ShipmentService::notFound);
  }

  @Transactional
  public Shipment create(CreateShipmentRequest request) {
    planLimits.require(org.ece.blackrose.saas.domain.SaasTypes.LimitedResource.SHIPMENTS_MONTH);
    if (!accounts.existsById(request.accountId())) {
      throw new BusinessException(HttpStatus.NOT_FOUND, "ACCOUNT_NOT_FOUND", "Cari bulunamadı.");
    }
    if (!branches.existsById(request.branchId())) {
      throw new BusinessException(HttpStatus.BAD_REQUEST, "BRANCH_NOT_FOUND", "Şube bulunamadı.");
    }
    if (request.plannedDelivery().isBefore(request.plannedPickup())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "SHIPMENT_DATES_INVALID",
          "Teslim tarihi yüklemeden önce olamaz.");
    }
    BigDecimal distance =
        request.distanceKm() != null
            ? request.distanceKm()
            : distances
                .find(request.origin(), request.destination())
                .map(DistanceProvider.Route::distanceKm)
                .orElse(null);
    PriceBreakdown price = priceFor(request, distance);
    String number = "SV-%d-%06d".formatted(clock.today().getYear(), shipments.nextNumber());
    Shipment created = new Shipment(number, request, price, views.write(price));
    created.fillDistance(distance);
    Shipment shipment = shipments.save(created);
    if (request.cargo() != null) {
      for (CargoRequest item : request.cargo()) {
        cargo.save(new ShipmentCargo(shipment.getId(), item));
      }
    }
    legs.save(
        new ShipmentLeg(
            shipment.getId(),
            1,
            request.origin(),
            request.destination(),
            request.plannedPickup(),
            request.plannedDelivery()));
    events.save(
        new ShipmentEvent(shipment.getId(), EventType.STATUS, null, ShipmentStatus.QUOTED, null));
    return shipment;
  }

  @Transactional
  public Shipment changeStatus(UUID id, ShipmentStatus target, String message) {
    Shipment shipment = lock(id);
    ShipmentStatus from = shipment.getStatus();
    if (!TRANSITIONS.getOrDefault(from, Set.of()).contains(target)) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "SHIPMENT_INVALID_TRANSITION",
          "Sefer " + from + " durumundan " + target + " durumuna geçemez.");
    }
    if (target == ShipmentStatus.PLANNED && !allLegsAssigned(id)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "LEGS_NOT_ASSIGNED", "Tüm etaplara araç veya taşeron atanmalıdır.");
    }
    if (target == ShipmentStatus.DELIVERED && pods.findByShipmentId(id).isEmpty()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "POD_REQUIRED", "Teslim için önce teslim kanıtı girilmelidir.");
    }
    move(shipment, target, message);
    // Fatura iptalinde teslim durumuna dönüş move() ile yapılır; müşteriye tekrar e-posta gitmez.
    if (target == ShipmentStatus.DELIVERED) {
      deliveryNotifier.prepare(shipment);
    }
    return shipment;
  }

  /** Yayımlanan CMR etkilenmez; taslak bir sonraki hazırlamada yeni bilgiyi alır. */
  @Transactional
  public Shipment updateInternational(UUID id, SaveInternationalRequest request) {
    Shipment shipment = lock(id);
    shipment.updateInternational(request);
    return shipment;
  }

  /** Fatura ve kapanış gibi kendi kuralını uygulayan işlemler için. Geçmişe de yazar. */
  void move(Shipment shipment, ShipmentStatus target, String message) {
    ShipmentStatus from = shipment.getStatus();
    shipment.moveTo(target);
    events.save(new ShipmentEvent(shipment.getId(), EventType.STATUS, from, target, message));
    audit.record(AuditEvent.SHIPMENT_STATUS_CHANGED, shipment.getNumber(), from + " -> " + target);
  }

  @Transactional
  public ShipmentEvent addEvent(UUID id, EventType type, String message) {
    get(id);
    if (type == EventType.STATUS) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "EVENT_TYPE_INVALID", "Durum kaydı elle eklenemez.");
    }
    return events.save(new ShipmentEvent(id, type, null, null, message));
  }

  @Transactional(readOnly = true)
  public List<ShipmentEvent> timeline(UUID id) {
    get(id);
    return events.findByShipmentIdOrderByCreatedAt(id);
  }

  Shipment lock(UUID id) {
    return shipments.findForUpdate(id).orElseThrow(ShipmentService::notFound);
  }

  private boolean allLegsAssigned(UUID shipmentId) {
    List<ShipmentLeg> list = legs.findByShipmentIdOrderBySequenceNo(shipmentId);
    return !list.isEmpty() && list.stream().allMatch(ShipmentLeg::isAssigned);
  }

  private PriceBreakdown priceFor(CreateShipmentRequest request, BigDecimal distance) {
    if (request.quoteLineId() != null) {
      return priceFromQuote(request);
    }
    if (request.manualNet() != null) {
      if (request.currency() == null) {
        throw new BusinessException(
            HttpStatus.BAD_REQUEST, "CURRENCY_REQUIRED", "Elle fiyatta para birimi zorunludur.");
      }
      return pricing.manual(request.manualNet(), request.currency(), request.taxRateId());
    }
    LocalDate date = clock.dateOf(request.plannedPickup());
    return pricing.price(
        new PriceRequest(
            request.accountId(),
            request.tariffId(),
            request.taxRateId(),
            date,
            request.origin(),
            request.destination(),
            request.vehicleType(),
            totalWeightTon(request.cargo()),
            request.pallets(),
            distance,
            request.waitingHours(),
            request.extraStops(),
            request.adr(),
            request.tollAmount()));
  }

  /**
   * Teklif fiyatı aynen taşınır; teklif yalnız kabul edilmişse ve aynı müşteriye aitse kullanılır.
   */
  private PriceBreakdown priceFromQuote(CreateShipmentRequest request) {
    QuoteLine line =
        quoteLines
            .findById(request.quoteLineId())
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "QUOTE_LINE_NOT_FOUND", "Teklif satırı bulunamadı."));
    Quote quote = quotes.findById(line.getQuoteId()).orElseThrow();
    if (quote.getStatus() != QuoteStatus.ACCEPTED) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "QUOTE_NOT_ACCEPTED",
          "Yalnız kabul edilmiş tekliften sefer açılır.");
    }
    if (!quote.getAccountId().equals(request.accountId())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "QUOTE_ACCOUNT_MISMATCH", "Teklif başka bir müşteriye ait.");
    }
    return views.readBreakdown(line.getBreakdown());
  }

  private static BigDecimal totalWeightTon(List<CargoRequest> items) {
    if (items == null) {
      return null;
    }
    BigDecimal kg =
        items.stream()
            .map(CargoRequest::weightKg)
            .filter(java.util.Objects::nonNull)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    return kg.signum() == 0 ? null : kg.divide(KG_PER_TON);
  }

  private static BusinessException notFound() {
    return new BusinessException(HttpStatus.NOT_FOUND, "SHIPMENT_NOT_FOUND", "Sefer bulunamadı.");
  }
}
