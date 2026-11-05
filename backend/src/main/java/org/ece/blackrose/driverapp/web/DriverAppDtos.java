package org.ece.blackrose.driverapp.web;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.driverapp.domain.DriverEvent;
import org.ece.blackrose.driverapp.domain.DriverExpense;
import org.ece.blackrose.shipment.domain.ShipmentTypes.CostKind;
import org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus;

public final class DriverAppDtos {

  private DriverAppDtos() {}

  /** Fiyat, cari ve kâr bilgisi bilerek yoktur. */
  public record TripResponse(
      UUID id,
      String number,
      ShipmentStatus status,
      String origin,
      String destination,
      Instant plannedPickup,
      Instant plannedDelivery,
      String shipperName,
      String consigneeName,
      List<TripLeg> legs,
      List<TripCargo> cargo) {}

  public record TripLeg(
      int sequenceNo,
      String origin,
      String destination,
      Instant plannedStart,
      Instant plannedEnd,
      String plate) {}

  public record TripCargo(String description, BigDecimal weightKg) {}

  public record TripEventRequest(
      @NotNull UUID clientId,
      @NotNull DriverEvent.Kind kind,
      @NotNull Instant occurredAt,
      @DecimalMin("-90") @DecimalMax("90") BigDecimal latitude,
      @DecimalMin("-180") @DecimalMax("180") BigDecimal longitude,
      @Size(max = 500) String note) {}

  public record ClientOpResponse(UUID id, boolean duplicate) {}

  public record DriverPositionRequest(
      @NotNull Instant recordedAt,
      @NotNull @DecimalMin("-90") @DecimalMax("90") BigDecimal latitude,
      @NotNull @DecimalMin("-180") @DecimalMax("180") BigDecimal longitude,
      @PositiveOrZero BigDecimal speedKmh) {}

  public record MyExpenseResponse(
      UUID id,
      UUID shipmentId,
      CostKind kind,
      Money money,
      LocalDate date,
      String description,
      DriverExpense.Status status,
      String reviewNote) {}

  public record ReviewExpenseResponse(
      UUID id,
      String driverName,
      UUID shipmentId,
      String shipmentNumber,
      CostKind kind,
      Money money,
      LocalDate date,
      String description,
      DriverExpense.Status status,
      String reviewNote,
      UUID receiptFileId) {}

  public record RejectExpenseRequest(@NotBlank @Size(max = 500) String note) {}

  public record LinkDriverUserRequest(@Size(max = 254) String email) {}

  public record DriverUserResponse(String email) {}
}
