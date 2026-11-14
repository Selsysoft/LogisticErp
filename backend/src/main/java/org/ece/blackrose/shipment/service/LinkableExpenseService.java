package org.ece.blackrose.shipment.service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.ece.blackrose.fleet.domain.Vehicle;
import org.ece.blackrose.fleet.domain.VehicleExpense;
import org.ece.blackrose.fleet.repository.FleetRepositories.VehicleExpenseRepository;
import org.ece.blackrose.fleet.repository.FleetRepositories.VehicleRepository;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.organization.CompanyResolver;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.domain.ShipmentLeg;
import org.ece.blackrose.shipment.domain.TripCost;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentLegRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.TripCostRepository;
import org.ece.blackrose.shipment.web.ShipmentDtos.LinkableExpense;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Sefere bağlanabilecek araç giderleri: seferin araçları, etap tarihleri, henüz bağlanmamış ve
 * seferin şirketinde (başka şirketin gideri bağlanamaz, §4.13 #6).
 */
@Service
public class LinkableExpenseService {

  private static final int MARGIN_DAYS = 1;

  private final ShipmentLegRepository legs;
  private final VehicleExpenseRepository expenses;
  private final VehicleRepository vehicles;
  private final TripCostRepository costs;
  private final TenantClock clock;
  private final ShipmentRepository shipments;
  private final CompanyResolver companies;
  private final BranchScopeService scope;

  public LinkableExpenseService(
      ShipmentLegRepository legs,
      VehicleExpenseRepository expenses,
      VehicleRepository vehicles,
      TripCostRepository costs,
      TenantClock clock,
      ShipmentRepository shipments,
      CompanyResolver companies,
      BranchScopeService scope) {
    this.scope = scope;
    this.shipments = shipments;
    this.companies = companies;
    this.legs = legs;
    this.expenses = expenses;
    this.vehicles = vehicles;
    this.costs = costs;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public List<LinkableExpense> forShipment(UUID shipmentId) {
    Shipment shipment = shipments.findById(shipmentId).orElse(null);
    if (shipment == null) {
      return List.of();
    }
    scope.requireVisible(shipment.getBranchId());
    List<ShipmentLeg> shipmentLegs = legs.findByShipmentIdOrderBySequenceNo(shipmentId);
    Set<UUID> vehicleIds =
        shipmentLegs.stream()
            .map(ShipmentLeg::getVehicleId)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
    if (vehicleIds.isEmpty()) {
      return List.of();
    }
    Instant start =
        shipmentLegs.stream()
            .map(ShipmentLeg::getPlannedStart)
            .min(Instant::compareTo)
            .orElseThrow();
    Instant end =
        shipmentLegs.stream().map(ShipmentLeg::getPlannedEnd).max(Instant::compareTo).orElseThrow();
    LocalDate from = clock.dateOf(start).minusDays(MARGIN_DAYS);
    LocalDate to = clock.dateOf(end).plusDays(MARGIN_DAYS);
    UUID companyId = companies.companyOf(shipment.getBranchId());
    List<VehicleExpense> candidates =
        expenses.findByVehicleIdInAndExpenseDateBetween(vehicleIds, from, to).stream()
            .filter(expense -> companyId.equals(expense.getCompanyId()))
            .toList();
    Set<UUID> linked =
        costs
            .findByVehicleExpenseIdIn(candidates.stream().map(VehicleExpense::getId).toList())
            .stream()
            .map(TripCost::getVehicleExpenseId)
            .collect(Collectors.toSet());
    Map<UUID, String> plates =
        vehicles.findAllById(vehicleIds).stream()
            .collect(Collectors.toMap(Vehicle::getId, Vehicle::getPlate));
    return candidates.stream()
        .filter(expense -> !linked.contains(expense.getId()))
        .map(
            expense ->
                new LinkableExpense(
                    expense.getId(),
                    plates.get(expense.getVehicleId()),
                    expense.getExpenseDate(),
                    expense.getKind().name(),
                    expense.getMoney()))
        .toList();
  }
}
