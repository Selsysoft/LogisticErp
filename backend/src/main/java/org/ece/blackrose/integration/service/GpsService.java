package org.ece.blackrose.integration.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.ece.blackrose.fleet.domain.Vehicle;
import org.ece.blackrose.fleet.repository.FleetRepositories.VehicleRepository;
import org.ece.blackrose.integration.domain.Geofence;
import org.ece.blackrose.integration.domain.GeofenceEvent;
import org.ece.blackrose.integration.domain.IntegrationTypes.GeofenceEventType;
import org.ece.blackrose.integration.domain.VehiclePosition;
import org.ece.blackrose.integration.repository.IntegrationRepositories.GeofenceEventRepository;
import org.ece.blackrose.integration.repository.IntegrationRepositories.GeofenceRepository;
import org.ece.blackrose.integration.repository.IntegrationRepositories.VehiclePositionRepository;
import org.ece.blackrose.integration.web.IntegrationDtos.IngestResultResponse;
import org.ece.blackrose.integration.web.IntegrationDtos.PositionRequest;
import org.ece.blackrose.shipment.domain.ShipmentEvent;
import org.ece.blackrose.shipment.domain.ShipmentLeg;
import org.ece.blackrose.shipment.domain.ShipmentTypes.EventType;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentEventRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentLegRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Konum kaydı ve bölge giriş-çıkış olayları. Olay sefere bağlıysa zaman çizelgesine yazılır. */
@Service
public class GpsService {

  private static final double EARTH_RADIUS_M = 6_371_000d;

  private final VehiclePositionRepository positions;
  private final GeofenceRepository geofences;
  private final GeofenceEventRepository events;
  private final VehicleRepository vehicles;
  private final ShipmentLegRepository legs;
  private final ShipmentEventRepository timeline;

  public GpsService(
      VehiclePositionRepository positions,
      GeofenceRepository geofences,
      GeofenceEventRepository events,
      VehicleRepository vehicles,
      ShipmentLegRepository legs,
      ShipmentEventRepository timeline) {
    this.positions = positions;
    this.geofences = geofences;
    this.events = events;
    this.vehicles = vehicles;
    this.legs = legs;
    this.timeline = timeline;
  }

  /** Aynı konum yeniden gelirse atlanır; sağlayıcı tekrar gönderse de olay çoğalmaz. */
  @Transactional
  public IngestResultResponse ingest(List<PositionRequest> requests) {
    Map<String, Vehicle> byPlate =
        vehicles.findAll().stream()
            .collect(
                Collectors.toMap(
                    vehicle -> CsvRows.plate(vehicle.getPlate()),
                    Function.identity(),
                    (a, b) -> a));
    List<Geofence> zones = geofences.findAll();
    int stored = 0;
    int duplicates = 0;
    int unknown = 0;
    int created = 0;
    List<PositionRequest> ordered =
        requests.stream()
            .sorted(java.util.Comparator.comparing(PositionRequest::recordedAt))
            .toList();
    for (PositionRequest request : ordered) {
      Vehicle vehicle = byPlate.get(CsvRows.plate(request.plate()));
      if (vehicle == null) {
        unknown++;
        continue;
      }
      if (positions.existsByVehicleIdAndRecordedAt(vehicle.getId(), request.recordedAt())) {
        duplicates++;
        continue;
      }
      VehiclePosition previous =
          positions
              .findFirstByVehicleIdAndRecordedAtBeforeOrderByRecordedAtDesc(
                  vehicle.getId(), request.recordedAt())
              .orElse(null);
      VehiclePosition current =
          positions.saveAndFlush(
              new VehiclePosition(
                  vehicle.getId(),
                  request.recordedAt(),
                  request.latitude(),
                  request.longitude(),
                  request.speedKmh()));
      stored++;
      if (previous != null) {
        created += detectEvents(vehicle, zones, previous, current);
      }
    }
    return new IngestResultResponse(stored, duplicates, unknown, created);
  }

  private int detectEvents(
      Vehicle vehicle, List<Geofence> zones, VehiclePosition previous, VehiclePosition current) {
    int created = 0;
    for (Geofence zone : zones) {
      boolean before = inside(zone, previous);
      boolean now = inside(zone, current);
      if (before != now) {
        GeofenceEventType type = now ? GeofenceEventType.ENTER : GeofenceEventType.EXIT;
        UUID shipmentId =
            legs.billableAt(vehicle.getId(), current.getRecordedAt()).stream()
                .map(ShipmentLeg::getShipmentId)
                .findFirst()
                .orElse(null);
        events.save(
            new GeofenceEvent(
                zone.getId(), vehicle.getId(), shipmentId, type, current.getRecordedAt()));
        if (shipmentId != null) {
          timeline.save(
              new ShipmentEvent(
                  shipmentId,
                  EventType.NOTE,
                  null,
                  null,
                  vehicle.getPlate()
                      + " "
                      + zone.getName()
                      + (now ? " bölgesine girdi" : " bölgesinden çıktı")));
        }
        created++;
      }
    }
    return created;
  }

  static boolean inside(Geofence zone, VehiclePosition position) {
    return distanceMeters(
            zone.getLatitude(),
            zone.getLongitude(),
            position.getLatitude(),
            position.getLongitude())
        <= zone.getRadiusM();
  }

  /** İki nokta arası büyük daire mesafesi. */
  static double distanceMeters(BigDecimal lat1, BigDecimal lon1, BigDecimal lat2, BigDecimal lon2) {
    double phi1 = Math.toRadians(lat1.doubleValue());
    double phi2 = Math.toRadians(lat2.doubleValue());
    double dPhi = phi2 - phi1;
    double dLambda = Math.toRadians(lon2.doubleValue() - lon1.doubleValue());
    double a =
        Math.sin(dPhi / 2) * Math.sin(dPhi / 2)
            + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) * Math.sin(dLambda / 2);
    return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
