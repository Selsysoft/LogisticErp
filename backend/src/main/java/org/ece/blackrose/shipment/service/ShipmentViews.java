package org.ece.blackrose.shipment.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.ece.blackrose.crm.web.CrmDtos.PriceBreakdown;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.fleet.domain.Driver;
import org.ece.blackrose.fleet.domain.Vehicle;
import org.ece.blackrose.fleet.repository.FleetRepositories.DriverRepository;
import org.ece.blackrose.fleet.repository.FleetRepositories.VehicleRepository;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.domain.ShipmentCargo;
import org.ece.blackrose.shipment.domain.ShipmentLeg;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentCargoRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentLegRepository;
import org.ece.blackrose.shipment.web.ShipmentDtos.CargoResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.LegResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.ShipmentResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.ShipmentSummary;
import org.springframework.stereotype.Component;

/** Kimlikleri plaka ve ad gibi okunur bilgilere çevirerek yanıtları üretir. */
@Component
public class ShipmentViews {

  private final ShipmentLegRepository legs;
  private final ShipmentCargoRepository cargo;
  private final VehicleRepository vehicles;
  private final DriverRepository drivers;
  private final AccountRepository accounts;
  private final ObjectMapper json;

  public ShipmentViews(
      ShipmentLegRepository legs,
      ShipmentCargoRepository cargo,
      VehicleRepository vehicles,
      DriverRepository drivers,
      AccountRepository accounts,
      ObjectMapper json) {
    this.legs = legs;
    this.cargo = cargo;
    this.vehicles = vehicles;
    this.drivers = drivers;
    this.accounts = accounts;
    this.json = json;
  }

  public ShipmentResponse detail(Shipment shipment) {
    return new ShipmentResponse(
        shipment.getId(),
        shipment.getNumber(),
        shipment.getAccountId(),
        accountName(shipment.getAccountId()),
        shipment.getBranchId(),
        shipment.getStatus(),
        shipment.getShipperName(),
        shipment.getShipperAddress(),
        shipment.getConsigneeName(),
        shipment.getConsigneeAddress(),
        shipment.getOrigin(),
        shipment.getDestination(),
        shipment.getPlannedPickup(),
        shipment.getPlannedDelivery(),
        shipment.getVehicleType(),
        shipment.getDistanceKm(),
        shipment.getNet(),
        shipment.getVat(),
        shipment.getWithholding(),
        shipment.getTotal(),
        readBreakdown(shipment.getBreakdown()),
        shipment.getNotes(),
        cargo.findByShipmentIdOrderByCreatedAt(shipment.getId()).stream()
            .map(ShipmentViews::cargoResponse)
            .toList(),
        legResponses(legs.findByShipmentIdOrderBySequenceNo(shipment.getId())),
        shipment.isInternational(),
        shipment.getOriginCountry(),
        shipment.getDestinationCountry(),
        shipment.getIncoterm(),
        shipment.getLiabilityPolicy(),
        shipment.getSenderInstructions(),
        shipment.getAttachedDocuments());
  }

  public List<ShipmentSummary> summaries(List<Shipment> shipments) {
    Map<UUID, String> names =
        accountNames(shipments.stream().map(Shipment::getAccountId).collect(Collectors.toSet()));
    return shipments.stream()
        .map(
            shipment ->
                new ShipmentSummary(
                    shipment.getId(),
                    shipment.getNumber(),
                    shipment.getAccountId(),
                    names.get(shipment.getAccountId()),
                    shipment.getStatus(),
                    shipment.getOrigin(),
                    shipment.getDestination(),
                    shipment.getPlannedPickup(),
                    shipment.getPlannedDelivery(),
                    shipment.getNet(),
                    shipment.getTotal()))
        .toList();
  }

  public List<LegResponse> legResponses(List<ShipmentLeg> list) {
    Set<UUID> vehicleIds = new HashSet<>();
    Set<UUID> driverIds = new HashSet<>();
    Set<UUID> accountIds = new HashSet<>();
    for (ShipmentLeg leg : list) {
      addIfPresent(vehicleIds, leg.getVehicleId());
      addIfPresent(vehicleIds, leg.getTrailerId());
      addIfPresent(driverIds, leg.getDriverId());
      addIfPresent(accountIds, leg.getCarrierAccountId());
    }
    Map<UUID, String> plates =
        vehicles.findAllById(vehicleIds).stream()
            .collect(Collectors.toMap(Vehicle::getId, Vehicle::getPlate));
    Map<UUID, String> driverNames =
        drivers.findAllById(driverIds).stream()
            .collect(Collectors.toMap(Driver::getId, Driver::getFullName));
    Map<UUID, String> carriers = accountNames(accountIds);
    return list.stream()
        .map(
            leg ->
                new LegResponse(
                    leg.getId(),
                    leg.getSequenceNo(),
                    leg.getOrigin(),
                    leg.getDestination(),
                    leg.getPlannedStart(),
                    leg.getPlannedEnd(),
                    leg.getVehicleId(),
                    plates.get(leg.getVehicleId()),
                    leg.getTrailerId(),
                    plates.get(leg.getTrailerId()),
                    leg.getDriverId(),
                    driverNames.get(leg.getDriverId()),
                    leg.getCarrierAccountId(),
                    carriers.get(leg.getCarrierAccountId())))
        .toList();
  }

  public Map<UUID, String> accountNames(Collection<UUID> ids) {
    return accounts.findAllById(ids).stream()
        .collect(Collectors.toMap(Account::getId, Account::getName, (a, b) -> a));
  }

  public String accountName(UUID id) {
    return accounts.findById(id).map(Account::getName).orElse(null);
  }

  public static CargoResponse cargoResponse(ShipmentCargo item) {
    return new CargoResponse(
        item.getId(),
        item.getDescription(),
        item.getQuantity(),
        item.getPackaging(),
        item.getWeightKg(),
        item.getVolumeM3(),
        item.getAdrClass(),
        item.getUnNumber());
  }

  public String write(Object value) {
    try {
      return json.writeValueAsString(value);
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException(ex);
    }
  }

  public PriceBreakdown readBreakdown(String value) {
    try {
      return json.readValue(value, PriceBreakdown.class);
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException(ex);
    }
  }

  public <T> T read(String value, Class<T> type) {
    try {
      return json.readValue(value, type);
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException(ex);
    }
  }

  public static <T> Map<UUID, T> index(List<T> items, Function<T, UUID> key) {
    return items.stream().collect(Collectors.toMap(key, Function.identity(), (a, b) -> a));
  }

  private static void addIfPresent(Set<UUID> set, UUID id) {
    if (id != null) {
      set.add(id);
    }
  }
}
