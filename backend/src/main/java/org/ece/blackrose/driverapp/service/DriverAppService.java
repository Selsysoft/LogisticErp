package org.ece.blackrose.driverapp.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.driverapp.domain.DriverEvent;
import org.ece.blackrose.driverapp.domain.DriverExpense;
import org.ece.blackrose.driverapp.repository.DriverAppRepositories.DriverEventRepository;
import org.ece.blackrose.driverapp.repository.DriverAppRepositories.DriverExpenseRepository;
import org.ece.blackrose.driverapp.web.DriverAppDtos.ClientOpResponse;
import org.ece.blackrose.driverapp.web.DriverAppDtos.DriverPositionRequest;
import org.ece.blackrose.driverapp.web.DriverAppDtos.TripCargo;
import org.ece.blackrose.driverapp.web.DriverAppDtos.TripEventRequest;
import org.ece.blackrose.driverapp.web.DriverAppDtos.TripLeg;
import org.ece.blackrose.driverapp.web.DriverAppDtos.TripResponse;
import org.ece.blackrose.files.FileService;
import org.ece.blackrose.fleet.domain.Driver;
import org.ece.blackrose.fleet.domain.Vehicle;
import org.ece.blackrose.fleet.repository.FleetRepositories.DriverRepository;
import org.ece.blackrose.fleet.repository.FleetRepositories.VehicleRepository;
import org.ece.blackrose.identity.security.AuthenticatedUser;
import org.ece.blackrose.integration.service.GpsService;
import org.ece.blackrose.integration.web.IntegrationDtos.PositionRequest;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.domain.ShipmentEvent;
import org.ece.blackrose.shipment.domain.ShipmentLeg;
import org.ece.blackrose.shipment.domain.ShipmentTypes.CostKind;
import org.ece.blackrose.shipment.domain.ShipmentTypes.EventType;
import org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentCargoRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentEventRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentLegRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentRepository;
import org.ece.blackrose.shipment.service.ShipmentDocumentService;
import org.ece.blackrose.shipment.service.ShipmentService;
import org.ece.blackrose.shipment.web.ShipmentDtos.SavePodRequest;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Sürücünün sahadan yaptığı işlemler. Sürücü yalnız etabına atandığı seferi görür; başka sefer için
 * "bulunamadı" döner. Her yazma işlemi istemci anahtarıyla tekilleştirilir, böylece çevrimdışı
 * kuyruğun tekrar göndermesi ikinci kayıt üretmez.
 */
@Service
public class DriverAppService {

  private static final String SHIPMENT_OWNER = "SHIPMENT";
  private static final Duration DELIVERED_VISIBLE = Duration.ofDays(7);
  private static final Set<ShipmentStatus> ACTIVE =
      Set.of(ShipmentStatus.PLANNED, ShipmentStatus.LOADED, ShipmentStatus.IN_TRANSIT);
  private static final Set<ShipmentStatus> ON_ROAD =
      Set.of(ShipmentStatus.LOADED, ShipmentStatus.IN_TRANSIT);
  private static final Set<CostKind> DRIVER_COST_KINDS =
      Set.of(CostKind.FUEL, CostKind.TOLL, CostKind.PER_DIEM, CostKind.OTHER);
  private static final Map<DriverEvent.Kind, String> EVENT_LABELS =
      Map.of(
          DriverEvent.Kind.LOADED, "Yüklendi",
          DriverEvent.Kind.IN_TRANSIT, "Yola çıktı",
          DriverEvent.Kind.BREAK, "Mola",
          DriverEvent.Kind.UNLOADED, "Boşaltıldı");
  private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G'};
  private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
  private static final int MAX_NOTE = 500;

  @PersistenceContext private EntityManager entityManager;
  private final DriverRepository drivers;
  private final VehicleRepository vehicles;
  private final ShipmentRepository shipments;
  private final ShipmentLegRepository legs;
  private final ShipmentCargoRepository cargo;
  private final ShipmentEventRepository shipmentEvents;
  private final ShipmentService shipmentService;
  private final ShipmentDocumentService documents;
  private final DriverEventRepository events;
  private final DriverExpenseRepository expenses;
  private final FileService files;
  private final GpsService gps;
  private final TenantClock clock;
  private final ApplicationEventPublisher publisher;

  public DriverAppService(
      DriverRepository drivers,
      VehicleRepository vehicles,
      ShipmentRepository shipments,
      ShipmentLegRepository legs,
      ShipmentCargoRepository cargo,
      ShipmentEventRepository shipmentEvents,
      ShipmentService shipmentService,
      ShipmentDocumentService documents,
      DriverEventRepository events,
      DriverExpenseRepository expenses,
      FileService files,
      GpsService gps,
      TenantClock clock,
      ApplicationEventPublisher publisher) {
    this.publisher = publisher;
    this.drivers = drivers;
    this.vehicles = vehicles;
    this.shipments = shipments;
    this.legs = legs;
    this.cargo = cargo;
    this.shipmentEvents = shipmentEvents;
    this.shipmentService = shipmentService;
    this.documents = documents;
    this.events = events;
    this.expenses = expenses;
    this.files = files;
    this.gps = gps;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public List<TripResponse> trips() {
    Driver driver = currentDriver();
    List<Shipment> visible =
        shipments.visibleToDriver(
            driver.getId(),
            ACTIVE,
            ShipmentStatus.DELIVERED,
            Instant.now().minus(DELIVERED_VISIBLE));
    Map<UUID, Vehicle> byId =
        vehicles.findAll().stream().collect(Collectors.toMap(Vehicle::getId, Function.identity()));
    return visible.stream().map(shipment -> toTrip(shipment, driver, byId)).toList();
  }

  @Transactional
  public ClientOpResponse recordEvent(UUID shipmentId, TripEventRequest request) {
    Driver driver = currentDriver();
    requireOwnTrip(driver, shipmentId);
    if (request.kind() == DriverEvent.Kind.DELIVERED) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "POD_REQUIRED", "Teslim yalnız teslim tutanağıyla bildirilir.");
    }
    UUID previous = claim(request.clientId(), driver, "EVENT");
    if (previous != null) {
      return new ClientOpResponse(previous, true);
    }
    Instant at = notInFuture(request.occurredAt());
    DriverEvent event =
        events.save(
            new DriverEvent(
                shipmentId,
                driver.getId(),
                request.kind(),
                at,
                request.latitude(),
                request.longitude(),
                request.note()));
    String message = "Sürücü: " + EVENT_LABELS.get(request.kind()) + stamp(at, request);
    switch (request.kind()) {
      case LOADED -> shipmentService.changeStatus(shipmentId, ShipmentStatus.LOADED, message);
      case IN_TRANSIT ->
          shipmentService.changeStatus(shipmentId, ShipmentStatus.IN_TRANSIT, message);
      default ->
          shipmentEvents.save(new ShipmentEvent(shipmentId, EventType.NOTE, null, null, message));
    }
    finish(request.clientId(), event.getId());
    return new ClientOpResponse(event.getId(), false);
  }

  /** İmza zorunludur. Tutanak, dosyalar ve "teslim edildi" aynı işlemde kaydedilir. */
  @Transactional
  public ClientOpResponse deliver(
      UUID shipmentId,
      UUID clientId,
      String recipientName,
      Instant deliveredAt,
      BigDecimal latitude,
      BigDecimal longitude,
      String note,
      MultipartFile signature,
      MultipartFile photo) {
    Driver driver = currentDriver();
    requireOwnTrip(driver, shipmentId);
    UUID previous = claim(clientId, driver, "POD");
    if (previous != null) {
      return new ClientOpResponse(previous, true);
    }
    if (recipientName == null || recipientName.isBlank()) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "RECIPIENT_REQUIRED", "Teslim alan kişinin adı zorunludur.");
    }
    if (signature == null || signature.isEmpty()) {
      throw new BusinessException(HttpStatus.BAD_REQUEST, "SIGNATURE_REQUIRED", "İmza zorunludur.");
    }
    Instant at = notInFuture(deliveredAt);
    var pod =
        documents.savePod(
            shipmentId,
            new SavePodRequest(recipientName.trim(), at, latitude, longitude, trim(note)));
    storeImage(shipmentId, "imza", signature);
    if (photo != null && !photo.isEmpty()) {
      storeImage(shipmentId, "teslim-foto", photo);
    }
    events.save(
        new DriverEvent(
            shipmentId, driver.getId(), DriverEvent.Kind.DELIVERED, at, latitude, longitude, null));
    shipmentService.changeStatus(shipmentId, ShipmentStatus.DELIVERED, "Sürücü: Teslim edildi");
    finish(clientId, pod.getId());
    return new ClientOpResponse(pod.getId(), false);
  }

  /** Taslak olarak kaydeder; cari ve kârlılık ancak ofis onayından sonra etkilenir. */
  @Transactional
  public ClientOpResponse addExpense(
      UUID shipmentId,
      UUID clientId,
      CostKind kind,
      BigDecimal amount,
      String currency,
      LocalDate date,
      String description,
      MultipartFile receipt) {
    Driver driver = currentDriver();
    requireOwnTrip(driver, shipmentId);
    UUID previous = claim(clientId, driver, "EXPENSE");
    if (previous != null) {
      return new ClientOpResponse(previous, true);
    }
    if (!DRIVER_COST_KINDS.contains(kind)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "EXPENSE_KIND_INVALID", "Bu gider türü girilemez.");
    }
    if (amount == null || amount.signum() <= 0) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "AMOUNT_INVALID", "Tutar sıfırdan büyük olmalıdır.");
    }
    if (currency == null || !currency.matches("^[A-Z]{3}$")) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "CURRENCY_INVALID", "Para birimi geçersiz.");
    }
    UUID fileId =
        receipt == null || receipt.isEmpty() ? null : storeImage(shipmentId, "masraf", receipt);
    DriverExpense expense =
        expenses.save(
            new DriverExpense(
                driver.getId(),
                shipmentId,
                kind,
                amount,
                currency,
                date,
                trim(description),
                fileId));
    finish(clientId, expense.getId());
    publisher.publishEvent(
        new DriverExpenseEvent(
            expense, AuthenticatedUser.current().map(AuthenticatedUser::email).orElse(null)));
    return new ClientOpResponse(expense.getId(), false);
  }

  @Transactional(readOnly = true)
  public List<DriverExpense> myExpenses() {
    return expenses.findTop30ByDriverIdOrderByCreatedAtDesc(currentDriver().getId());
  }

  /** Konum yalnız yükte veya yoldayken, sürücünün kendi aracı için alınır. */
  @Transactional
  public void recordPosition(DriverPositionRequest request) {
    Driver driver = currentDriver();
    UUID vehicleId =
        shipments
            .visibleToDriver(driver.getId(), ON_ROAD, ShipmentStatus.DELIVERED, Instant.now())
            .stream()
            .flatMap(shipment -> legs.findByShipmentIdOrderBySequenceNo(shipment.getId()).stream())
            .filter(leg -> driver.getId().equals(leg.getDriverId()) && leg.getVehicleId() != null)
            .map(ShipmentLeg::getVehicleId)
            .findFirst()
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.CONFLICT, "NO_ACTIVE_TRIP", "Yolda olan seferiniz yok."));
    Vehicle vehicle = vehicles.findById(vehicleId).orElseThrow();
    gps.ingest(
        List.of(
            new PositionRequest(
                vehicle.getPlate(),
                notInFuture(request.recordedAt()),
                request.latitude(),
                request.longitude(),
                request.speedKmh())));
  }

  private TripResponse toTrip(Shipment shipment, Driver driver, Map<UUID, Vehicle> vehiclesById) {
    List<TripLeg> own =
        legs.findByShipmentIdOrderBySequenceNo(shipment.getId()).stream()
            .filter(leg -> driver.getId().equals(leg.getDriverId()))
            .map(
                leg ->
                    new TripLeg(
                        leg.getSequenceNo(),
                        leg.getOrigin(),
                        leg.getDestination(),
                        leg.getPlannedStart(),
                        leg.getPlannedEnd(),
                        leg.getVehicleId() == null || !vehiclesById.containsKey(leg.getVehicleId())
                            ? null
                            : vehiclesById.get(leg.getVehicleId()).getPlate()))
            .toList();
    List<TripCargo> goods =
        cargo.findByShipmentIdOrderByCreatedAt(shipment.getId()).stream()
            .map(item -> new TripCargo(item.getDescription(), item.getWeightKg()))
            .toList();
    return new TripResponse(
        shipment.getId(),
        shipment.getNumber(),
        shipment.getStatus(),
        shipment.getOrigin(),
        shipment.getDestination(),
        shipment.getPlannedPickup(),
        shipment.getPlannedDelivery(),
        shipment.getShipperName(),
        shipment.getConsigneeName(),
        own,
        goods);
  }

  private Driver currentDriver() {
    UUID userId = AuthenticatedUser.current().orElseThrow().id();
    return drivers
        .findByUserId(userId)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.FORBIDDEN,
                    "DRIVER_NOT_LINKED",
                    "Hesabınız bir sürücü kaydına bağlı değil. Filo yöneticinizle görüşün."));
  }

  private void requireOwnTrip(Driver driver, UUID shipmentId) {
    if (!legs.existsByShipmentIdAndDriverId(shipmentId, driver.getId())) {
      throw new BusinessException(HttpStatus.NOT_FOUND, "TRIP_NOT_FOUND", "Sefer bulunamadı.");
    }
  }

  /**
   * İstemci anahtarını işlemle birlikte kaydeder. Aynı anda gelen ikinci istek ilk işlem bitene
   * kadar bekler; ilk işlem geri dönerse anahtar da silinir ve tekrar deneme yeni işlem sayılır.
   *
   * @return daha önce işlendiyse sonucun kimliği, yeni ise {@code null}
   */
  private UUID claim(UUID clientId, Driver driver, String kind) {
    int inserted =
        entityManager
            .createNativeQuery(
                """
                insert into driver_client_op (client_id, driver_id, kind, created_at)
                values (:id, :driver, :kind, now()) on conflict (client_id) do nothing
                """)
            .setParameter("id", clientId)
            .setParameter("driver", driver.getId())
            .setParameter("kind", kind)
            .executeUpdate();
    if (inserted == 1) {
      return null;
    }
    Object[] row =
        (Object[])
            entityManager
                .createNativeQuery(
                    "select driver_id, result_id from driver_client_op where client_id = :id")
                .setParameter("id", clientId)
                .getSingleResult();
    if (!driver.getId().equals(row[0])) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "CLIENT_ID_CONFLICT", "İşlem anahtarı başka bir sürücüye ait.");
    }
    return (UUID) row[1];
  }

  private void finish(UUID clientId, UUID resultId) {
    entityManager
        .createNativeQuery("update driver_client_op set result_id = :result where client_id = :id")
        .setParameter("result", resultId)
        .setParameter("id", clientId)
        .executeUpdate();
  }

  /** Telefon saati ileride olabilir; gelecekteki an şimdiye çekilir, geçmiş korunur. */
  private static Instant notInFuture(Instant at) {
    Instant now = Instant.now();
    return at == null || at.isAfter(now) ? now : at;
  }

  private String stamp(Instant at, TripEventRequest request) {
    String text = " · " + clock.dateOf(at);
    return request.latitude() == null || request.longitude() == null
        ? text
        : text + " · " + request.latitude() + ", " + request.longitude();
  }

  /** İstemcinin bildirdiği tür yerine içerik imzası denetlenir. */
  private UUID storeImage(UUID shipmentId, String prefix, MultipartFile upload) {
    try {
      byte[] content = upload.getBytes();
      String extension;
      String type;
      if (startsWith(content, PNG)) {
        extension = "png";
        type = "image/png";
      } else if (startsWith(content, JPEG)) {
        extension = "jpg";
        type = "image/jpeg";
      } else {
        throw new BusinessException(
            HttpStatus.BAD_REQUEST, "IMAGE_TYPE_INVALID", "Yalnız PNG veya JPEG yüklenebilir.");
      }
      String name =
          "%s-%s.%s".formatted(prefix, UUID.randomUUID().toString().substring(0, 8), extension);
      return files.storeSubmitted(SHIPMENT_OWNER, shipmentId, name, type, content).getId();
    } catch (IOException ex) {
      throw new UncheckedIOException(ex);
    }
  }

  private static boolean startsWith(byte[] content, byte[] prefix) {
    if (content.length < prefix.length) {
      return false;
    }
    for (int i = 0; i < prefix.length; i++) {
      if (content[i] != prefix[i]) {
        return false;
      }
    }
    return true;
  }

  private static String trim(String text) {
    if (text == null || text.isBlank()) {
      return null;
    }
    String value = text.trim();
    return value.length() <= MAX_NOTE ? value : value.substring(0, MAX_NOTE);
  }
}
