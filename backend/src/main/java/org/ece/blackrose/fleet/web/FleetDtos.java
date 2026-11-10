package org.ece.blackrose.fleet.web;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.fleet.domain.FleetTypes.Availability;
import org.ece.blackrose.fleet.domain.FleetTypes.DocumentType;
import org.ece.blackrose.fleet.domain.FleetTypes.DriverStatus;
import org.ece.blackrose.fleet.domain.FleetTypes.ExpenseKind;
import org.ece.blackrose.fleet.domain.FleetTypes.Ownership;
import org.ece.blackrose.fleet.domain.FleetTypes.ReminderType;
import org.ece.blackrose.fleet.domain.FleetTypes.SubjectType;
import org.ece.blackrose.fleet.domain.FleetTypes.VehicleKind;
import org.ece.blackrose.fleet.domain.FleetTypes.VehicleStatus;

public final class FleetDtos {

  private FleetDtos() {}

  public record SaveVehicleRequest(
      @NotBlank @Size(max = 20) String plate,
      @NotNull VehicleKind kind,
      @Size(max = 100) String brand,
      @Size(max = 100) String model,
      @Min(1950) Integer modelYear,
      @PositiveOrZero BigDecimal capacityTon,
      @PositiveOrZero BigDecimal capacityM3,
      @PositiveOrZero Integer capacityPallet,
      @Size(max = 20) String fuelType,
      @NotNull Ownership ownership,
      @NotNull VehicleStatus status,
      UUID branchId) {}

  public record VehicleResponse(
      UUID id,
      String plate,
      VehicleKind kind,
      String brand,
      String model,
      Integer modelYear,
      BigDecimal capacityTon,
      BigDecimal capacityM3,
      Integer capacityPallet,
      String fuelType,
      Ownership ownership,
      VehicleStatus status,
      UUID branchId,
      BigDecimal odometerKm) {}

  public record CreateDriverRequest(
      @NotBlank @Size(max = 50) String code,
      @NotBlank @Size(max = 200) String fullName,
      @Size(max = 30) String phone,
      @Size(max = 20) String licenseClass,
      @NotNull DriverStatus status,
      UUID branchId) {}

  public record UpdateDriverRequest(
      @NotBlank @Size(max = 200) String fullName,
      @Size(max = 30) String phone,
      @Size(max = 20) String licenseClass,
      @NotNull DriverStatus status,
      UUID branchId) {}

  public record DriverResponse(
      UUID id,
      String code,
      String fullName,
      String phone,
      String licenseClass,
      DriverStatus status,
      UUID accountId,
      UUID branchId) {}

  public record SaveDocumentRequest(
      @NotNull DocumentType docType,
      @Size(max = 100) String number,
      LocalDate issuedOn,
      @NotNull LocalDate expiresOn) {}

  @Schema(name = "ComplianceDocumentResponse")
  public record DocumentResponse(
      UUID id,
      SubjectType subjectType,
      UUID subjectId,
      DocumentType docType,
      String number,
      LocalDate issuedOn,
      LocalDate expiresOn) {}

  public record SaveBlockRequest(
      @NotNull LocalDate startDate, @NotNull LocalDate endDate, @Size(max = 300) String reason) {}

  public record BlockResponse(
      UUID id,
      SubjectType subjectType,
      UUID subjectId,
      LocalDate startDate,
      LocalDate endDate,
      String reason) {}

  /** Gider ya tedarikçi carisine ya da doğrudan banka/kasaya yazılır; ikisinden biri zorunludur. */
  public record SaveVehicleExpenseRequest(
      @NotNull ExpenseKind kind,
      @NotNull LocalDate date,
      @PositiveOrZero BigDecimal odometerKm,
      @Size(max = 500) String description,
      @NotNull @Valid Money money,
      @NotNull UUID branchId,
      UUID supplierAccountId,
      UUID fundAccountId,
      @Positive BigDecimal exchangeRate,
      @Positive BigDecimal liters,
      @Size(max = 100) String station,
      @Size(max = 50) String tirePosition,
      LocalDate nextDueDate,
      @PositiveOrZero BigDecimal nextDueKm) {}

  public record VehicleExpenseResponse(
      UUID id,
      UUID vehicleId,
      ExpenseKind kind,
      LocalDate expenseDate,
      BigDecimal odometerKm,
      String description,
      Money money,
      BigDecimal tlAmount,
      UUID branchId,
      UUID supplierAccountId,
      UUID fundAccountId,
      UUID settlementId,
      BigDecimal liters,
      String station,
      String tirePosition,
      LocalDate nextDueDate,
      BigDecimal nextDueKm) {}

  public record ReverseExpenseRequest(@NotNull LocalDate date) {}

  public record DriverAdvanceRequest(
      @NotNull UUID branchId,
      @NotNull UUID fundAccountId,
      @NotNull @Valid Money money,
      @NotNull LocalDate date,
      @Size(max = 500) String description,
      @Positive BigDecimal exchangeRate) {}

  public record DriverAdvanceResponse(UUID settlementId) {}

  public record FuelConsumptionRow(
      UUID expenseId,
      LocalDate date,
      BigDecimal odometerKm,
      BigDecimal liters,
      BigDecimal distanceKm,
      BigDecimal litersPer100Km,
      boolean anomaly) {}

  public record FuelConsumptionResponse(
      UUID vehicleId, BigDecimal averageLitersPer100Km, List<FuelConsumptionRow> rows) {}

  public record VehicleCostRow(
      UUID vehicleId,
      String plate,
      BigDecimal maintenanceTl,
      BigDecimal repairTl,
      BigDecimal tireTl,
      BigDecimal fuelTl,
      BigDecimal totalTl,
      BigDecimal liters,
      BigDecimal distanceKm,
      BigDecimal litersPer100Km,
      BigDecimal costPerKmTl) {}

  public record ReminderResponse(
      ReminderType type,
      SubjectType subjectType,
      UUID subjectId,
      String subjectName,
      DocumentType docType,
      LocalDate dueDate,
      BigDecimal dueKm,
      BigDecimal currentKm,
      boolean overdue) {}

  public record AvailabilityResponse(
      SubjectType subjectType,
      UUID subjectId,
      String name,
      Availability availability,
      List<String> issues) {}

  public record FleetSettingsResponse(
      boolean blockOnExpired, int reminderDays, boolean reminderEmail) {}

  public record SaveFleetSettingsRequest(
      @NotNull Boolean blockOnExpired,
      @NotNull @Min(1) Integer reminderDays,
      /** Boşsa mevcut değer korunur. */
      Boolean reminderEmail) {}

  public record Option(UUID id, String label) {}

  public record FundOption(UUID id, String label, String kind, String currency) {}

  /** Filo kullanıcısının finans izni olmadan seçim yapabilmesi için yalnız ad ve kimlik döner. */
  public record FleetOptionsResponse(List<Option> suppliers, List<FundOption> funds) {}
}
