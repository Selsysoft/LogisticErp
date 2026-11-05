package org.ece.blackrose.fleet.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.fleet.domain.ComplianceDocument;
import org.ece.blackrose.fleet.domain.Driver;
import org.ece.blackrose.fleet.domain.FleetTypes;
import org.ece.blackrose.fleet.domain.FleetTypes.Availability;
import org.ece.blackrose.fleet.domain.FleetTypes.DocumentType;
import org.ece.blackrose.fleet.domain.FleetTypes.DriverStatus;
import org.ece.blackrose.fleet.domain.FleetTypes.ExpenseKind;
import org.ece.blackrose.fleet.domain.FleetTypes.ReminderType;
import org.ece.blackrose.fleet.domain.FleetTypes.SubjectType;
import org.ece.blackrose.fleet.domain.FleetTypes.VehicleStatus;
import org.ece.blackrose.fleet.domain.ResourceBlock;
import org.ece.blackrose.fleet.domain.Vehicle;
import org.ece.blackrose.fleet.domain.VehicleExpense;
import org.ece.blackrose.fleet.repository.FleetRepositories.ComplianceDocumentRepository;
import org.ece.blackrose.fleet.repository.FleetRepositories.DriverRepository;
import org.ece.blackrose.fleet.repository.FleetRepositories.FleetSettingsRepository;
import org.ece.blackrose.fleet.repository.FleetRepositories.ResourceBlockRepository;
import org.ece.blackrose.fleet.repository.FleetRepositories.VehicleExpenseRepository;
import org.ece.blackrose.fleet.repository.FleetRepositories.VehicleRepository;
import org.ece.blackrose.fleet.web.FleetDtos.AvailabilityResponse;
import org.ece.blackrose.fleet.web.FleetDtos.FuelConsumptionResponse;
import org.ece.blackrose.fleet.web.FleetDtos.FuelConsumptionRow;
import org.ece.blackrose.fleet.web.FleetDtos.ReminderResponse;
import org.ece.blackrose.fleet.web.FleetDtos.VehicleCostRow;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Hatırlatmalar, uygun kaynak sorgusu, yakıt tüketimi ve araç maliyeti. */
@Service
public class FleetInsightService {

  private static final BigDecimal HUNDRED = new BigDecimal("100");
  private static final BigDecimal ANOMALY_FACTOR = new BigDecimal("1.25");
  private static final BigDecimal KM_REMINDER_WINDOW = new BigDecimal("1000");
  private static final int RATIO_SCALE = 2;

  private final VehicleRepository vehicles;
  private final DriverRepository drivers;
  private final ComplianceDocumentRepository documents;
  private final ResourceBlockRepository blocks;
  private final VehicleExpenseRepository expenses;
  private final FleetSettingsRepository settings;
  private final List<ResourceBusyProvider> busyProviders;

  public FleetInsightService(
      VehicleRepository vehicles,
      DriverRepository drivers,
      ComplianceDocumentRepository documents,
      ResourceBlockRepository blocks,
      VehicleExpenseRepository expenses,
      FleetSettingsRepository settings,
      @Lazy List<ResourceBusyProvider> busyProviders) {
    this.busyProviders = busyProviders;
    this.vehicles = vehicles;
    this.drivers = drivers;
    this.documents = documents;
    this.blocks = blocks;
    this.expenses = expenses;
    this.settings = settings;
  }

  @Transactional(readOnly = true)
  public List<ReminderResponse> reminders(LocalDate today, Integer days) {
    int window = days != null ? days : settings.findById(1).orElseThrow().getReminderDays();
    LocalDate until = today.plusDays(window);
    Map<UUID, Vehicle> vehicleById = byId(vehicles.findAll(), Vehicle::getId);
    Map<UUID, Driver> driverById = byId(drivers.findAll(), Driver::getId);

    List<ReminderResponse> reminders = new ArrayList<>();
    for (ComplianceDocument document : documents.latestExpiringBy(until)) {
      String name = nameOf(document, vehicleById, driverById);
      if (name != null) {
        reminders.add(
            new ReminderResponse(
                ReminderType.DOCUMENT,
                document.getSubjectType(),
                document.getSubjectId(),
                name,
                document.getDocType(),
                document.getExpiresOn(),
                null,
                null,
                document.getExpiresOn().isBefore(today)));
      }
    }
    for (VehicleExpense plan : expenses.latestMaintenancePlans()) {
      Vehicle vehicle = vehicleById.get(plan.getVehicleId());
      if (vehicle != null) {
        addMaintenanceReminders(reminders, plan, vehicle, today, until);
      }
    }
    reminders.sort(
        Comparator.comparing(ReminderResponse::overdue)
            .reversed()
            .thenComparing(
                ReminderResponse::dueDate, Comparator.nullsLast(Comparator.naturalOrder())));
    return reminders;
  }

  private static void addMaintenanceReminders(
      List<ReminderResponse> reminders,
      VehicleExpense plan,
      Vehicle vehicle,
      LocalDate today,
      LocalDate until) {
    if (plan.getNextDueDate() != null && !plan.getNextDueDate().isAfter(until)) {
      reminders.add(
          new ReminderResponse(
              ReminderType.MAINTENANCE_DATE,
              SubjectType.VEHICLE,
              vehicle.getId(),
              vehicle.getPlate(),
              null,
              plan.getNextDueDate(),
              null,
              null,
              plan.getNextDueDate().isBefore(today)));
    }
    BigDecimal current = vehicle.getOdometerKm();
    if (plan.getNextDueKm() != null
        && current != null
        && plan.getNextDueKm().subtract(current).compareTo(KM_REMINDER_WINDOW) <= 0) {
      reminders.add(
          new ReminderResponse(
              ReminderType.MAINTENANCE_KM,
              SubjectType.VEHICLE,
              vehicle.getId(),
              vehicle.getPlate(),
              null,
              null,
              plan.getNextDueKm(),
              current,
              current.compareTo(plan.getNextDueKm()) >= 0));
    }
  }

  /**
   * Dönem boyunca kaynağın durumunu verir. Belgeler dönem sonuna kadar geçerli olmalıdır. Belge
   * sorunu firma ayarına göre engeller veya uyarır; takvim kapatması ve kaynak durumu her zaman
   * engeller.
   */
  @Transactional(readOnly = true)
  public List<AvailabilityResponse> availability(
      SubjectType type, LocalDate from, LocalDate to, BigDecimal minTon) {
    if (to.isBefore(from)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "PERIOD_INVALID", "Bitiş tarihi başlangıçtan önce olamaz.");
    }
    return availability(type, from, to, minTon, busyIds(type, from, to));
  }

  private List<AvailabilityResponse> availability(
      SubjectType type, LocalDate from, LocalDate to, BigDecimal minTon, Set<UUID> busy) {
    return type == SubjectType.VEHICLE
        ? vehicleAvailability(from, to, minTon, busy)
        : driverAvailability(from, to, busy);
  }

  private Set<UUID> busyIds(SubjectType type, LocalDate from, LocalDate to) {
    Set<UUID> busy = new HashSet<>();
    busyProviders.forEach(provider -> busy.addAll(provider.busyBetween(type, from, to)));
    return busy;
  }

  /**
   * Atama yapılacak tek kaynak için aynı kuralı uygular. Gün içi çakışmayı atama saatleriyle
   * sevkiyat denetlediği için doluluk burada sayılmaz; gün bazlı sayılsa aynı gün iki kısa sefer
   * engellenirdi.
   */
  @Transactional(readOnly = true)
  public AvailabilityResponse check(SubjectType type, UUID id, LocalDate from, LocalDate to) {
    return availability(type, from, to, null, Set.of()).stream()
        .filter(row -> row.subjectId().equals(id))
        .findFirst()
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "Kaynak bulunamadı."));
  }

  private List<AvailabilityResponse> vehicleAvailability(
      LocalDate from, LocalDate to, BigDecimal minTon, Set<UUID> busy) {
    List<Vehicle> all =
        vehicles.findAll().stream()
            .filter(
                v ->
                    minTon == null
                        || (v.getCapacityTon() != null
                            && v.getCapacityTon().compareTo(minTon) >= 0))
            .sorted(Comparator.comparing(Vehicle::getPlate))
            .toList();
    Map<UUID, List<ComplianceDocument>> docs =
        documentsOf(SubjectType.VEHICLE, all.stream().map(Vehicle::getId).toList());
    Set<UUID> blocked = blockedIds(SubjectType.VEHICLE, from, to);
    boolean blockOnExpired = blockOnExpired();
    return all.stream()
        .map(
            vehicle -> {
              List<String> hard = new ArrayList<>();
              if (vehicle.getStatus() != VehicleStatus.ACTIVE) {
                hard.add("STATUS:" + vehicle.getStatus());
              }
              if (busy.contains(vehicle.getId())) {
                hard.add("BUSY");
              }
              return evaluate(
                  SubjectType.VEHICLE,
                  vehicle.getId(),
                  vehicle.getPlate(),
                  hard,
                  docs.getOrDefault(vehicle.getId(), List.of()),
                  blocked,
                  to,
                  blockOnExpired);
            })
        .toList();
  }

  private List<AvailabilityResponse> driverAvailability(
      LocalDate from, LocalDate to, Set<UUID> busy) {
    List<Driver> all =
        drivers.findAll().stream()
            .filter(driver -> driver.getStatus() != DriverStatus.LEFT)
            .sorted(Comparator.comparing(Driver::getFullName))
            .toList();
    Map<UUID, List<ComplianceDocument>> docs =
        documentsOf(SubjectType.DRIVER, all.stream().map(Driver::getId).toList());
    Set<UUID> blocked = blockedIds(SubjectType.DRIVER, from, to);
    boolean blockOnExpired = blockOnExpired();
    return all.stream()
        .map(
            driver -> {
              List<String> hard = new ArrayList<>();
              if (driver.getStatus() != DriverStatus.ACTIVE) {
                hard.add("STATUS:" + driver.getStatus());
              }
              if (busy.contains(driver.getId())) {
                hard.add("BUSY");
              }
              return evaluate(
                  SubjectType.DRIVER,
                  driver.getId(),
                  driver.getFullName(),
                  hard,
                  docs.getOrDefault(driver.getId(), List.of()),
                  blocked,
                  to,
                  blockOnExpired);
            })
        .toList();
  }

  private static AvailabilityResponse evaluate(
      SubjectType type,
      UUID id,
      String name,
      List<String> hardIssues,
      List<ComplianceDocument> docs,
      Set<UUID> blocked,
      LocalDate validThrough,
      boolean blockOnExpired) {
    List<String> hard = new ArrayList<>(hardIssues);
    if (blocked.contains(id)) {
      hard.add("CALENDAR");
    }
    List<String> documentIssues = new ArrayList<>();
    Map<DocumentType, LocalDate> latest = new EnumMap<>(DocumentType.class);
    for (ComplianceDocument document : docs) {
      latest.merge(document.getDocType(), document.getExpiresOn(), (a, b) -> a.isAfter(b) ? a : b);
    }
    FleetTypes.requiredFor(type).stream()
        .sorted()
        .forEach(
            required -> {
              LocalDate expires = latest.get(required);
              if (expires == null) {
                documentIssues.add("MISSING:" + required);
              } else if (expires.isBefore(validThrough)) {
                documentIssues.add("EXPIRED:" + required);
              }
            });
    List<String> issues = new ArrayList<>(hard);
    issues.addAll(documentIssues);
    Availability availability;
    if (!hard.isEmpty() || (blockOnExpired && !documentIssues.isEmpty())) {
      availability = Availability.BLOCKED;
    } else {
      availability = documentIssues.isEmpty() ? Availability.AVAILABLE : Availability.WARNING;
    }
    return new AvailabilityResponse(type, id, name, availability, issues);
  }

  /**
   * Depo dolu girişler varsayılır: tüketim, iki yakıt alımı arasındaki km ile sonraki alımın
   * litresinden hesaplanır. Ortalamanın %25 üstü anomali sayılır.
   */
  @Transactional(readOnly = true)
  public FuelConsumptionResponse fuelConsumption(UUID vehicleId) {
    List<VehicleExpense> fuel =
        expenses.findByVehicleIdAndKindOrderByOdometerKmAscExpenseDateAsc(
            vehicleId, ExpenseKind.FUEL);
    BigDecimal totalLiters = BigDecimal.ZERO;
    BigDecimal totalKm = BigDecimal.ZERO;
    for (int i = 1; i < fuel.size(); i++) {
      BigDecimal distance = fuel.get(i).getOdometerKm().subtract(fuel.get(i - 1).getOdometerKm());
      if (distance.signum() > 0) {
        totalLiters = totalLiters.add(fuel.get(i).getLiters());
        totalKm = totalKm.add(distance);
      }
    }
    BigDecimal average = per100(totalLiters, totalKm);
    List<FuelConsumptionRow> rows = new ArrayList<>();
    for (int i = 0; i < fuel.size(); i++) {
      VehicleExpense current = fuel.get(i);
      BigDecimal distance =
          i == 0 ? null : current.getOdometerKm().subtract(fuel.get(i - 1).getOdometerKm());
      BigDecimal rate =
          distance == null || distance.signum() <= 0 ? null : per100(current.getLiters(), distance);
      boolean anomaly =
          rate != null && average != null && rate.compareTo(average.multiply(ANOMALY_FACTOR)) > 0;
      rows.add(
          new FuelConsumptionRow(
              current.getId(),
              current.getExpenseDate(),
              current.getOdometerKm(),
              current.getLiters(),
              distance,
              rate,
              anomaly));
    }
    return new FuelConsumptionResponse(vehicleId, average, rows);
  }

  /** Araç başına maliyet. Tutarlar her kayıtta sabitlenen TL karşılığından toplanır. */
  @Transactional(readOnly = true)
  public List<VehicleCostRow> vehicleCosts(LocalDate from, LocalDate to) {
    Map<UUID, List<VehicleExpense>> byVehicle =
        expenses.findByExpenseDateBetween(from, to).stream()
            .collect(Collectors.groupingBy(VehicleExpense::getVehicleId));
    Map<UUID, Vehicle> vehicleById = byId(vehicles.findAll(), Vehicle::getId);
    List<VehicleCostRow> rows = new ArrayList<>();
    byVehicle.forEach(
        (vehicleId, list) -> {
          Vehicle vehicle = vehicleById.get(vehicleId);
          if (vehicle != null) {
            rows.add(costRow(vehicle, list));
          }
        });
    rows.sort(Comparator.comparing(VehicleCostRow::plate));
    return rows;
  }

  private static VehicleCostRow costRow(Vehicle vehicle, List<VehicleExpense> list) {
    Map<ExpenseKind, BigDecimal> totals = new EnumMap<>(ExpenseKind.class);
    BigDecimal total = BigDecimal.ZERO;
    for (VehicleExpense expense : list) {
      totals.merge(expense.getKind(), expense.getTlAmount(), BigDecimal::add);
      total = total.add(expense.getTlAmount());
    }
    List<VehicleExpense> fuel =
        list.stream()
            .filter(e -> e.getKind() == ExpenseKind.FUEL)
            .sorted(Comparator.comparing(VehicleExpense::getOdometerKm))
            .toList();
    BigDecimal liters = BigDecimal.ZERO;
    BigDecimal distance = BigDecimal.ZERO;
    if (fuel.size() > 1) {
      distance = fuel.get(fuel.size() - 1).getOdometerKm().subtract(fuel.get(0).getOdometerKm());
      for (int i = 1; i < fuel.size(); i++) {
        liters = liters.add(fuel.get(i).getLiters());
      }
    }
    BigDecimal costPerKm =
        distance.signum() > 0 ? total.divide(distance, RATIO_SCALE, RoundingMode.HALF_UP) : null;
    return new VehicleCostRow(
        vehicle.getId(),
        vehicle.getPlate(),
        totals.getOrDefault(ExpenseKind.MAINTENANCE, BigDecimal.ZERO),
        totals.getOrDefault(ExpenseKind.REPAIR, BigDecimal.ZERO),
        totals.getOrDefault(ExpenseKind.TIRE, BigDecimal.ZERO),
        totals.getOrDefault(ExpenseKind.FUEL, BigDecimal.ZERO),
        total,
        liters,
        distance,
        per100(liters, distance),
        costPerKm);
  }

  private static BigDecimal per100(BigDecimal liters, BigDecimal km) {
    return km.signum() <= 0
        ? null
        : liters.multiply(HUNDRED).divide(km, RATIO_SCALE, RoundingMode.HALF_UP);
  }

  private boolean blockOnExpired() {
    return settings.findById(1).orElseThrow().isBlockOnExpired();
  }

  private Map<UUID, List<ComplianceDocument>> documentsOf(SubjectType type, List<UUID> ids) {
    if (ids.isEmpty()) {
      return Map.of();
    }
    return documents.findBySubjectTypeAndSubjectIdIn(type, ids).stream()
        .collect(Collectors.groupingBy(ComplianceDocument::getSubjectId));
  }

  private Set<UUID> blockedIds(SubjectType type, LocalDate from, LocalDate to) {
    return blocks.overlapping(type, from, to).stream()
        .map(ResourceBlock::getSubjectId)
        .collect(Collectors.toSet());
  }

  private static String nameOf(
      ComplianceDocument document, Map<UUID, Vehicle> vehicles, Map<UUID, Driver> drivers) {
    return document.getSubjectType() == SubjectType.VEHICLE
        ? Optional.ofNullable(vehicles.get(document.getSubjectId()))
            .map(Vehicle::getPlate)
            .orElse(null)
        : Optional.ofNullable(drivers.get(document.getSubjectId()))
            .map(Driver::getFullName)
            .orElse(null);
  }

  private static <T> Map<UUID, T> byId(List<T> items, Function<T, UUID> id) {
    Map<UUID, T> map = new HashMap<>();
    items.forEach(item -> map.put(id.apply(item), item));
    return map;
  }
}
