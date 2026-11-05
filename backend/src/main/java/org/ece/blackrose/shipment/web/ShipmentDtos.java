package org.ece.blackrose.shipment.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.crm.web.CrmDtos.PriceBreakdown;
import org.ece.blackrose.fleet.web.FleetDtos.AvailabilityResponse;
import org.ece.blackrose.shipment.domain.ShipmentTypes.CostKind;
import org.ece.blackrose.shipment.domain.ShipmentTypes.DocumentStatus;
import org.ece.blackrose.shipment.domain.ShipmentTypes.DocumentType;
import org.ece.blackrose.shipment.domain.ShipmentTypes.EventType;
import org.ece.blackrose.shipment.domain.ShipmentTypes.InvoiceStatus;
import org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus;

public final class ShipmentDtos {

  private ShipmentDtos() {}

  public record CargoRequest(
      @NotBlank @Size(max = 300) String description,
      @PositiveOrZero BigDecimal quantity,
      @Size(max = 50) String packaging,
      @PositiveOrZero BigDecimal weightKg,
      @PositiveOrZero BigDecimal volumeM3,
      @Size(max = 20) String adrClass,
      @Size(max = 10) String unNumber) {}

  public record CargoResponse(
      UUID id,
      String description,
      BigDecimal quantity,
      String packaging,
      BigDecimal weightKg,
      BigDecimal volumeM3,
      String adrClass,
      String unNumber) {}

  /**
   * Fiyat önceliği: onaylı teklif satırı, elle net tutar, tarife. Tarifede sözleşmeli müşterinin
   * fiyatı otomatik gelir.
   */
  public record CreateShipmentRequest(
      @NotNull UUID accountId,
      @NotNull UUID branchId,
      @Size(max = 200) String shipperName,
      @Size(max = 500) String shipperAddress,
      @Size(max = 200) String consigneeName,
      @Size(max = 500) String consigneeAddress,
      @NotBlank @Size(max = 100) String origin,
      @NotBlank @Size(max = 100) String destination,
      @NotNull Instant plannedPickup,
      @NotNull Instant plannedDelivery,
      @Size(max = 50) String vehicleType,
      @PositiveOrZero BigDecimal distanceKm,
      @PositiveOrZero BigDecimal waitingHours,
      @PositiveOrZero Integer extraStops,
      @PositiveOrZero Integer pallets,
      @PositiveOrZero BigDecimal tollAmount,
      boolean adr,
      UUID quoteLineId,
      UUID tariffId,
      UUID taxRateId,
      @PositiveOrZero BigDecimal manualNet,
      @Size(min = 3, max = 3) String currency,
      @Size(max = 1000) String notes,
      List<@Valid CargoRequest> cargo) {}

  public record LegResponse(
      UUID id,
      int sequenceNo,
      String origin,
      String destination,
      Instant plannedStart,
      Instant plannedEnd,
      UUID vehicleId,
      String vehiclePlate,
      UUID trailerId,
      String trailerPlate,
      UUID driverId,
      String driverName,
      UUID carrierAccountId,
      String carrierName) {}

  public record ShipmentSummary(
      UUID id,
      String number,
      UUID accountId,
      String accountName,
      ShipmentStatus status,
      String origin,
      String destination,
      Instant plannedPickup,
      Instant plannedDelivery,
      Money net,
      Money total) {}

  public record ShipmentResponse(
      UUID id,
      String number,
      UUID accountId,
      String accountName,
      UUID branchId,
      ShipmentStatus status,
      String shipperName,
      String shipperAddress,
      String consigneeName,
      String consigneeAddress,
      String origin,
      String destination,
      Instant plannedPickup,
      Instant plannedDelivery,
      String vehicleType,
      BigDecimal distanceKm,
      Money net,
      Money vat,
      Money withholding,
      Money total,
      PriceBreakdown breakdown,
      String notes,
      List<CargoResponse> cargo,
      List<LegResponse> legs,
      boolean international,
      String originCountry,
      String destinationCountry,
      String incoterm,
      String liabilityPolicy,
      String senderInstructions,
      String attachedDocuments) {}

  public record SaveInternationalRequest(
      @NotBlank @Size(min = 2, max = 2) String originCountry,
      @NotBlank @Size(min = 2, max = 2) String destinationCountry,
      @Size(max = 10) String incoterm,
      @Size(max = 100) String liabilityPolicy,
      @Size(max = 500) String senderInstructions,
      @Size(max = 500) String attachedDocuments) {}

  public record ChangeStatusRequest(
      @NotNull ShipmentStatus status, @Size(max = 500) String message) {}

  public record AddEventRequest(
      @NotNull EventType type, @NotBlank @Size(max = 500) String message) {}

  public record EventResponse(
      UUID id,
      EventType type,
      ShipmentStatus fromStatus,
      ShipmentStatus toStatus,
      String message,
      String createdBy,
      Instant createdAt) {}

  public record SaveLegRequest(
      @NotBlank @Size(max = 100) String origin,
      @NotBlank @Size(max = 100) String destination,
      @NotNull Instant plannedStart,
      @NotNull Instant plannedEnd) {}

  /** Ya araç + sürücü (dorse isteğe bağlı) ya da taşeron + maliyet verilir. */
  public record AssignLegRequest(
      UUID vehicleId,
      UUID trailerId,
      UUID driverId,
      UUID carrierAccountId,
      @Valid Money carrierCost) {}

  public record AssignmentResponse(LegResponse leg, List<String> warnings) {}

  public record CandidatesResponse(
      List<AvailabilityResponse> vehicles,
      List<AvailabilityResponse> trailers,
      List<AvailabilityResponse> drivers) {}

  public record BoardRow(
      UUID shipmentId, String shipmentNumber, ShipmentStatus status, LegResponse leg) {}

  public record SavePodRequest(
      @NotBlank @Size(max = 200) String recipientName,
      @NotNull Instant deliveredAt,
      BigDecimal latitude,
      BigDecimal longitude,
      @Size(max = 500) String note) {}

  public record PodResponse(
      UUID id,
      UUID shipmentId,
      String recipientName,
      Instant deliveredAt,
      BigDecimal latitude,
      BigDecimal longitude,
      String note,
      String createdBy) {}

  /** CMR ve irsaliyenin alanları; belge düzenlendiği andaki bilgiyi saklar. */
  public record DocumentContent(
      String senderName,
      String senderAddress,
      String consigneeName,
      String consigneeAddress,
      String carrierName,
      String plates,
      String drivers,
      String origin,
      String destination,
      LocalDate loadingDate,
      List<CargoResponse> goods,
      BigDecimal totalWeightKg,
      boolean international,
      String originCountry,
      String destinationCountry,
      String incoterm,
      String liabilityPolicy,
      String senderInstructions,
      String attachedDocuments) {}

  public record DocumentResponse(
      UUID id,
      UUID shipmentId,
      DocumentType type,
      String number,
      DocumentStatus status,
      DocumentContent content) {}

  public record IssueInvoiceRequest(
      @NotNull LocalDate invoiceDate,
      @NotNull LocalDate dueDate,
      @Positive BigDecimal exchangeRate) {}

  public record CancelInvoiceRequest(@NotNull LocalDate date) {}

  public record InvoiceResponse(
      UUID id,
      String number,
      UUID shipmentId,
      UUID accountId,
      LocalDate invoiceDate,
      LocalDate dueDate,
      Money net,
      Money vat,
      Money withholding,
      Money total,
      InvoiceStatus status) {}

  /** Cari seçilirse kapanışta borç yazılır; araç gideri seçilirse yalnız kârlılıkta sayılır. */
  public record SaveCostRequest(
      @NotNull CostKind kind,
      UUID legId,
      UUID accountId,
      UUID vehicleExpenseId,
      @Valid Money money,
      @Positive BigDecimal exchangeRate,
      LocalDate date,
      @Size(max = 500) String description) {}

  public record CostResponse(
      UUID id,
      UUID legId,
      CostKind kind,
      UUID accountId,
      String accountName,
      UUID vehicleExpenseId,
      Money money,
      BigDecimal tlAmount,
      String description,
      Instant postedAt) {}

  public record LinkableExpense(UUID id, String plate, LocalDate date, String kind, Money money) {}

  public record CloseShipmentRequest(@NotNull LocalDate date, @NotNull LocalDate dueDate) {}

  public record ProfitResponse(
      UUID shipmentId,
      String number,
      String accountName,
      ShipmentStatus status,
      BigDecimal revenueTl,
      BigDecimal costTl,
      BigDecimal marginTl,
      BigDecimal marginPercent,
      boolean invoiced) {}

  public record Option(UUID id, String label) {}

  public record QuoteLineOption(UUID id, String label, UUID accountId) {}

  /** Operasyon kullanıcısının finans ve CRM izni olmadan seçim yapabilmesi için. */
  public record ShipmentOptionsResponse(
      List<Option> customers,
      List<Option> carriers,
      List<Option> costAccounts,
      List<Option> tariffs,
      List<Option> taxRates,
      List<QuoteLineOption> acceptedQuoteLines) {}
}
