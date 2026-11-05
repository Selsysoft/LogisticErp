package org.ece.blackrose.shipment.service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.service.ExchangeRateService;
import org.ece.blackrose.fleet.domain.FleetTypes.Availability;
import org.ece.blackrose.fleet.domain.FleetTypes.DocumentType;
import org.ece.blackrose.fleet.domain.FleetTypes.SubjectType;
import org.ece.blackrose.fleet.domain.FleetTypes.VehicleKind;
import org.ece.blackrose.fleet.domain.Vehicle;
import org.ece.blackrose.fleet.repository.FleetRepositories.DriverRepository;
import org.ece.blackrose.fleet.repository.FleetRepositories.VehicleRepository;
import org.ece.blackrose.fleet.service.FleetInsightService;
import org.ece.blackrose.fleet.service.ResourceBusyProvider;
import org.ece.blackrose.fleet.web.FleetDtos.AvailabilityResponse;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.domain.ShipmentCargo;
import org.ece.blackrose.shipment.domain.ShipmentEvent;
import org.ece.blackrose.shipment.domain.ShipmentLeg;
import org.ece.blackrose.shipment.domain.ShipmentTypes.CostKind;
import org.ece.blackrose.shipment.domain.ShipmentTypes.EventType;
import org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus;
import org.ece.blackrose.shipment.domain.TripCost;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentCargoRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentEventRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentLegRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.TripCostRepository;
import org.ece.blackrose.shipment.web.ShipmentDtos.AssignLegRequest;
import org.ece.blackrose.shipment.web.ShipmentDtos.AssignmentResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.BoardRow;
import org.ece.blackrose.shipment.web.ShipmentDtos.CandidatesResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.LegResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.SaveLegRequest;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Etap planlama ve kaynak atama. Çakışma ve belge kuralları burada uygulanır. */
@Service
public class DispatchService implements ResourceBusyProvider {

  private static final BigDecimal KG_PER_TON = new BigDecimal("1000");
  private static final String CARRIER_ADR_WARNING =
      "ADR'li yük: taşeronun ADR yetkisi ve belgeleri ayrıca kontrol edilmelidir.";
  private static final Set<ShipmentStatus> EDITABLE =
      Set.of(ShipmentStatus.QUOTED, ShipmentStatus.PLANNED);

  private final ShipmentLegRepository legs;
  private final ShipmentRepository shipments;
  private final ShipmentCargoRepository cargo;
  private final ShipmentEventRepository events;
  private final TripCostRepository costs;
  private final VehicleRepository vehicles;
  private final DriverRepository drivers;
  private final AccountRepository accounts;
  private final FleetInsightService insights;
  private final ExchangeRateService rates;
  private final ShipmentViews views;
  private final TenantClock clock;

  public DispatchService(
      ShipmentLegRepository legs,
      ShipmentRepository shipments,
      ShipmentCargoRepository cargo,
      ShipmentEventRepository events,
      TripCostRepository costs,
      VehicleRepository vehicles,
      DriverRepository drivers,
      AccountRepository accounts,
      FleetInsightService insights,
      ExchangeRateService rates,
      ShipmentViews views,
      TenantClock clock) {
    this.legs = legs;
    this.shipments = shipments;
    this.cargo = cargo;
    this.events = events;
    this.costs = costs;
    this.vehicles = vehicles;
    this.drivers = drivers;
    this.accounts = accounts;
    this.insights = insights;
    this.rates = rates;
    this.views = views;
    this.clock = clock;
  }

  @Transactional
  public ShipmentLeg addLeg(UUID shipmentId, SaveLegRequest request) {
    Shipment shipment = lockEditable(shipmentId);
    ensureOrder(request.plannedStart(), request.plannedEnd());
    int next =
        legs.findByShipmentIdOrderBySequenceNo(shipmentId).stream()
                .mapToInt(ShipmentLeg::getSequenceNo)
                .max()
                .orElse(0)
            + 1;
    return legs.save(
        new ShipmentLeg(
            shipment.getId(),
            next,
            request.origin(),
            request.destination(),
            request.plannedStart(),
            request.plannedEnd()));
  }

  @Transactional
  public void removeLeg(UUID legId) {
    ShipmentLeg leg = findLeg(legId);
    lockEditable(leg.getShipmentId());
    if (legs.findByShipmentIdOrderBySequenceNo(leg.getShipmentId()).size() <= 1) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "LAST_LEG", "Seferin en az bir etabı olmalıdır.");
    }
    removeCarrierCost(legId);
    leg.markDeleted();
  }

  /**
   * Aynı anda iki istek aynı kaynağı atamasın diye araç ve sürücü satırları kilitlenir. Çakışma her
   * zaman engeller; belge sorunu firma ayarına göre engeller veya uyarı döner.
   */
  @Transactional
  public AssignmentResponse assign(UUID legId, AssignLegRequest request) {
    ShipmentLeg leg = findLeg(legId);
    lockEditable(leg.getShipmentId());
    boolean carrier = request.carrierAccountId() != null;
    boolean ownFleet =
        request.vehicleId() != null || request.driverId() != null || request.trailerId() != null;
    if (carrier == ownFleet) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "ASSIGNMENT_INVALID",
          "Araç ve sürücü ya da taşeron seçilmelidir; ikisi birlikte seçilemez.");
    }
    List<String> warnings = carrier ? assignCarrier(leg, request) : assignOwnFleet(leg, request);
    events.save(
        new ShipmentEvent(
            leg.getShipmentId(),
            EventType.NOTE,
            null,
            null,
            "Etap " + leg.getSequenceNo() + " atandı"));
    LegResponse response = views.legResponses(List.of(leg)).get(0);
    return new AssignmentResponse(response, warnings);
  }

  private List<String> assignOwnFleet(ShipmentLeg leg, AssignLegRequest request) {
    if (request.vehicleId() == null || request.driverId() == null) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "ASSIGNMENT_INVALID", "Araç ve sürücü birlikte seçilmelidir.");
    }
    Vehicle vehicle = lockVehicle(request.vehicleId());
    if (vehicle.getKind() == VehicleKind.TRAILER) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "VEHICLE_IS_TRAILER", "Dorse, araç olarak atanamaz.");
    }
    Set<UUID> resources = new HashSet<>(Set.of(request.vehicleId(), request.driverId()));
    if (request.trailerId() != null) {
      Vehicle trailer = lockVehicle(request.trailerId());
      if (trailer.getKind() != VehicleKind.TRAILER) {
        throw new BusinessException(
            HttpStatus.BAD_REQUEST, "TRAILER_INVALID", "Seçilen kayıt dorse değil.");
      }
      resources.add(request.trailerId());
    }
    drivers
        .findForUpdate(request.driverId())
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "DRIVER_NOT_FOUND", "Sürücü bulunamadı."));

    ensureNoConflict(leg, resources);

    LocalDate from = clock.dateOf(leg.getPlannedStart());
    LocalDate to = clock.dateOf(leg.getPlannedEnd());
    List<String> warnings = new ArrayList<>();
    collectCompliance(SubjectType.VEHICLE, request.vehicleId(), from, to, warnings);
    collectCompliance(SubjectType.DRIVER, request.driverId(), from, to, warnings);
    if (request.trailerId() != null) {
      collectCompliance(SubjectType.VEHICLE, request.trailerId(), from, to, warnings);
    }
    if (hasDangerousGoods(leg.getShipmentId())) {
      requireAdr(
          SubjectType.VEHICLE, request.vehicleId(), DocumentType.VEHICLE_ADR, from, to, warnings);
      requireAdr(
          SubjectType.DRIVER, request.driverId(), DocumentType.DRIVER_ADR, from, to, warnings);
      if (request.trailerId() != null) {
        requireAdr(
            SubjectType.VEHICLE, request.trailerId(), DocumentType.VEHICLE_ADR, from, to, warnings);
      }
    }
    removeCarrierCost(leg.getId());
    leg.assignOwnFleet(request.vehicleId(), request.trailerId(), request.driverId());
    return warnings;
  }

  private List<String> assignCarrier(ShipmentLeg leg, AssignLegRequest request) {
    if (request.carrierCost() == null || request.carrierCost().amount().signum() <= 0) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "CARRIER_COST_REQUIRED", "Taşeron maliyeti girilmelidir.");
    }
    boolean validCarrier =
        accounts
            .findById(request.carrierAccountId())
            .filter(
                account ->
                    account.getType() == AccountType.CARRIER
                        || account.getType() == AccountType.SUPPLIER)
            .isPresent();
    if (!validCarrier) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "CARRIER_INVALID", "Seçilen cari taşeron değil.");
    }
    removeCarrierCost(leg.getId());
    leg.assignCarrier(request.carrierAccountId());
    var conversion =
        rates.convert(request.carrierCost(), clock.dateOf(leg.getPlannedStart()), null);
    costs.save(
        new TripCost(
            leg.getShipmentId(),
            leg.getId(),
            CostKind.SUBCONTRACTOR,
            request.carrierAccountId(),
            null,
            request.carrierCost(),
            conversion.tlAmount(),
            "Etap " + leg.getSequenceNo() + " taşeron"));
    return hasDangerousGoods(leg.getShipmentId()) ? List.of(CARRIER_ADR_WARNING) : List.of();
  }

  private boolean hasDangerousGoods(UUID shipmentId) {
    return cargo.findByShipmentIdOrderByCreatedAt(shipmentId).stream()
        .anyMatch(item -> item.getAdrClass() != null && !item.getAdrClass().isBlank());
  }

  /** ADR belgesi de diğer belgeler gibi firma ayarına göre engeller veya uyarır. */
  private void requireAdr(
      SubjectType type,
      UUID id,
      DocumentType docType,
      LocalDate from,
      LocalDate to,
      List<String> warnings) {
    insights
        .documentIssue(type, id, docType, to)
        .ifPresent(
            issue -> {
              String name = insights.check(type, id, from, to).name();
              if (insights.blocksOnExpired()) {
                throw new BusinessException(
                    HttpStatus.CONFLICT,
                    "RESOURCE_BLOCKED",
                    name + " atanamaz: " + describe(List.of(issue)));
              }
              warnings.add(name + " · " + issue);
            });
  }

  /** ADR'li yükte adaylara eksik ADR belgesini de işler. */
  private AvailabilityResponse withAdr(
      AvailabilityResponse row, DocumentType docType, LocalDate to) {
    return insights
        .documentIssue(row.subjectType(), row.subjectId(), docType, to)
        .map(
            issue -> {
              List<String> issues = new ArrayList<>(row.issues());
              issues.add(issue);
              Availability availability =
                  insights.blocksOnExpired() || row.availability() == Availability.BLOCKED
                      ? Availability.BLOCKED
                      : Availability.WARNING;
              return new AvailabilityResponse(
                  row.subjectType(), row.subjectId(), row.name(), availability, issues);
            })
        .orElse(row);
  }

  /** Taşeron değişirse veya etap öz filoya alınırsa eski maliyet kalmamalıdır. */
  private void removeCarrierCost(UUID legId) {
    costs
        .findByLegIdAndKind(legId, CostKind.SUBCONTRACTOR)
        .filter(cost -> cost.getPostedAt() == null)
        .ifPresent(TripCost::markDeleted);
    costs.flush();
  }

  private void ensureNoConflict(ShipmentLeg leg, Set<UUID> resources) {
    List<ShipmentLeg> conflicts =
        legs.conflicting(leg.getId(), resources, leg.getPlannedStart(), leg.getPlannedEnd());
    if (!conflicts.isEmpty()) {
      Shipment other = shipments.findById(conflicts.get(0).getShipmentId()).orElseThrow();
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "ASSIGNMENT_CONFLICT",
          "Kaynak aynı zaman aralığında " + other.getNumber() + " seferinde kullanılıyor.");
    }
  }

  private void collectCompliance(
      SubjectType type, UUID id, LocalDate from, LocalDate to, List<String> warnings) {
    AvailabilityResponse status = insights.check(type, id, from, to);
    if (status.availability() == Availability.BLOCKED) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "RESOURCE_BLOCKED",
          status.name() + " atanamaz: " + describe(status.issues()));
    }
    if (status.availability() == Availability.WARNING) {
      status.issues().forEach(issue -> warnings.add(status.name() + " · " + issue));
    }
  }

  /** Kullanıcıya gösterilen mesajda kodlar yerine okunur metin olur. */
  private static String describe(List<String> issues) {
    return issues.stream()
        .map(
            issue -> {
              String[] parts = issue.split(":", 2);
              return switch (parts[0]) {
                case "MISSING" -> "eksik belge " + documentName(parts[1]);
                case "EXPIRED" -> "süresi dolmuş belge " + documentName(parts[1]);
                case "CALENDAR" -> "takvimde kapalı";
                case "STATUS" -> "durumu uygun değil";
                default -> issue;
              };
            })
        .collect(Collectors.joining(", "));
  }

  private static String documentName(String code) {
    return switch (code) {
      case "INSPECTION" -> "muayene";
      case "TRAFFIC_INSURANCE" -> "trafik sigortası";
      case "LICENSE" -> "ehliyet";
      case "PSYCHOTECHNIC" -> "psikoteknik";
      case "VEHICLE_ADR" -> "araç ADR";
      case "DRIVER_ADR" -> "sürücü ADR";
      default -> code;
    };
  }

  /** Etabın tarihlerinde uygun kaynaklar; kapasite yükün ağırlığına göre süzülür. */
  @Transactional(readOnly = true)
  public CandidatesResponse candidates(UUID legId) {
    ShipmentLeg leg = findLeg(legId);
    LocalDate from = clock.dateOf(leg.getPlannedStart());
    LocalDate to = clock.dateOf(leg.getPlannedEnd());
    BigDecimal weightTon = weightTon(leg.getShipmentId());
    Map<UUID, Vehicle> all = ShipmentViews.index(vehicles.findAll(), Vehicle::getId);

    List<AvailabilityResponse> motorized = new ArrayList<>();
    List<AvailabilityResponse> trailers = new ArrayList<>();
    boolean dangerous = hasDangerousGoods(leg.getShipmentId());
    for (AvailabilityResponse listed : insights.availability(SubjectType.VEHICLE, from, to, null)) {
      AvailabilityResponse row = dangerous ? withAdr(listed, DocumentType.VEHICLE_ADR, to) : listed;
      Vehicle vehicle = all.get(row.subjectId());
      boolean fits =
          vehicle.getKind() == VehicleKind.TRACTOR
              || vehicle.getCapacityTon() == null
              || vehicle.getCapacityTon().compareTo(weightTon) >= 0;
      if (fits) {
        (vehicle.getKind() == VehicleKind.TRAILER ? trailers : motorized).add(row);
      }
    }
    Comparator<AvailabilityResponse> usableFirst =
        Comparator.comparing(AvailabilityResponse::availability);
    motorized.sort(usableFirst);
    trailers.sort(usableFirst);
    List<AvailabilityResponse> people = new ArrayList<>();
    for (AvailabilityResponse listed : insights.availability(SubjectType.DRIVER, from, to, null)) {
      people.add(dangerous ? withAdr(listed, DocumentType.DRIVER_ADR, to) : listed);
    }
    people.sort(usableFirst);
    return new CandidatesResponse(motorized, trailers, people);
  }

  @Transactional(readOnly = true)
  public List<BoardRow> board(LocalDate from, LocalDate to) {
    Instant start = clock.startOf(from);
    Instant end = clock.startOf(to.plusDays(1));
    List<ShipmentLeg> active = legs.activeBetween(start, end);
    Map<UUID, Shipment> byId =
        ShipmentViews.index(
            shipments.findAllById(active.stream().map(ShipmentLeg::getShipmentId).toList()),
            Shipment::getId);
    Map<UUID, LegResponse> responses =
        ShipmentViews.index(views.legResponses(active), LegResponse::id);
    return active.stream()
        .sorted(Comparator.comparing(ShipmentLeg::getPlannedStart))
        .map(
            leg -> {
              Shipment shipment = byId.get(leg.getShipmentId());
              return new BoardRow(
                  shipment.getId(),
                  shipment.getNumber(),
                  shipment.getStatus(),
                  responses.get(leg.getId()));
            })
        .toList();
  }

  /** Filo uygunluk ekranı atamaları da görsün diye dönemde kullanılan kaynakları verir. */
  @Override
  @Transactional(readOnly = true)
  public Set<UUID> busyBetween(SubjectType type, LocalDate from, LocalDate to) {
    Set<UUID> busy = new HashSet<>();
    for (ShipmentLeg leg : legs.activeBetween(clock.startOf(from), clock.startOf(to.plusDays(1)))) {
      if (type == SubjectType.DRIVER) {
        add(busy, leg.getDriverId());
      } else {
        add(busy, leg.getVehicleId());
        add(busy, leg.getTrailerId());
      }
    }
    return busy;
  }

  private static void add(Set<UUID> set, UUID id) {
    if (id != null) {
      set.add(id);
    }
  }

  private BigDecimal weightTon(UUID shipmentId) {
    BigDecimal kg =
        cargo.findByShipmentIdOrderByCreatedAt(shipmentId).stream()
            .map(ShipmentCargo::getWeightKg)
            .filter(java.util.Objects::nonNull)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    return kg.divide(KG_PER_TON);
  }

  private Vehicle lockVehicle(UUID id) {
    return vehicles
        .findForUpdate(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "VEHICLE_NOT_FOUND", "Araç bulunamadı."));
  }

  private ShipmentLeg findLeg(UUID id) {
    return legs.findById(id)
        .orElseThrow(
            () -> new BusinessException(HttpStatus.NOT_FOUND, "LEG_NOT_FOUND", "Etap bulunamadı."));
  }

  private Shipment lockEditable(UUID shipmentId) {
    Shipment shipment =
        shipments
            .findForUpdate(shipmentId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "SHIPMENT_NOT_FOUND", "Sefer bulunamadı."));
    if (!EDITABLE.contains(shipment.getStatus())) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "SHIPMENT_NOT_EDITABLE",
          "Yola çıkmış seferin etabı değiştirilemez.");
    }
    return shipment;
  }

  private static void ensureOrder(Instant start, Instant end) {
    if (end.isBefore(start)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "LEG_DATES_INVALID", "Bitiş başlangıçtan önce olamaz.");
    }
  }
}
