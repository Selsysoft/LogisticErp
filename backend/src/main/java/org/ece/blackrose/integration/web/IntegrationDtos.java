package org.ece.blackrose.integration.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
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
import org.ece.blackrose.integration.domain.IntegrationTypes.EDocumentKind;
import org.ece.blackrose.integration.domain.IntegrationTypes.EDocumentSource;
import org.ece.blackrose.integration.domain.IntegrationTypes.EDocumentStatus;
import org.ece.blackrose.integration.domain.IntegrationTypes.GeofenceEventType;
import org.ece.blackrose.integration.domain.IntegrationTypes.ImportKind;
import org.ece.blackrose.integration.domain.IntegrationTypes.ImportRowStatus;
import org.ece.blackrose.integration.domain.IntegrationTypes.StatementLineStatus;

public final class IntegrationDtos {

  private IntegrationDtos() {}

  public record SaveEDocumentSettingsRequest(
      @NotBlank @Size(max = 20) String taxNumber,
      @Size(max = 100) String taxOffice,
      @Size(max = 500) String address) {}

  public record EDocumentSettingsResponse(
      String taxNumber, String taxOffice, String address, String provider, boolean testProvider) {}

  public record SendEDocumentRequest(
      @NotNull EDocumentKind kind, @NotNull EDocumentSource sourceType, @NotNull UUID sourceId) {}

  public record EDocumentResponse(
      UUID id,
      EDocumentKind kind,
      EDocumentSource sourceType,
      UUID sourceId,
      String sourceNo,
      UUID ettn,
      String provider,
      String providerRef,
      EDocumentStatus status,
      String message) {}

  public record EDocumentCandidate(UUID id, EDocumentSource sourceType, String label) {}

  public record ImportBatchResponse(
      UUID id,
      ImportKind kind,
      String fileName,
      UUID accountId,
      String accountName,
      int duplicates,
      Instant createdAt) {}

  public record ImportRowResponse(
      UUID id,
      int lineNo,
      String plate,
      Instant occurredAt,
      String place,
      Money money,
      BigDecimal liters,
      BigDecimal odometerKm,
      UUID shipmentId,
      String shipmentNumber,
      ImportRowStatus status,
      String message) {}

  public record ImportDetailResponse(ImportBatchResponse batch, List<ImportRowResponse> rows) {}

  public record AssignRowRequest(@NotNull UUID shipmentId) {}

  public record PositionRequest(
      @NotBlank @Size(max = 20) String plate,
      @NotNull Instant recordedAt,
      @NotNull @DecimalMin("-90") @DecimalMax("90") BigDecimal latitude,
      @NotNull @DecimalMin("-180") @DecimalMax("180") BigDecimal longitude,
      @PositiveOrZero BigDecimal speedKmh) {}

  public record IngestPositionsRequest(@NotEmpty List<@Valid PositionRequest> positions) {}

  public record IngestResultResponse(int stored, int duplicates, int unknownVehicles, int events) {}

  public record PositionResponse(
      UUID vehicleId,
      String plate,
      Instant recordedAt,
      BigDecimal latitude,
      BigDecimal longitude,
      BigDecimal speedKmh,
      UUID shipmentId,
      String shipmentNumber) {}

  public record SaveGeofenceRequest(
      @NotBlank @Size(max = 100) String name,
      @NotNull @DecimalMin("-90") @DecimalMax("90") BigDecimal latitude,
      @NotNull @DecimalMin("-180") @DecimalMax("180") BigDecimal longitude,
      @NotNull @Positive Integer radiusM) {}

  public record GeofenceResponse(
      UUID id, String name, BigDecimal latitude, BigDecimal longitude, int radiusM) {}

  public record GeofenceEventResponse(
      UUID id,
      String geofenceName,
      String plate,
      String shipmentNumber,
      GeofenceEventType type,
      Instant occurredAt) {}

  public record StatementLineResponse(
      UUID id,
      UUID fundAccountId,
      LocalDate date,
      BigDecimal amount,
      String description,
      String reference,
      StatementLineStatus status,
      UUID matchedTransactionId,
      String matchedDescription) {}

  public record StatementImportResponse(
      int imported, int duplicates, int matched, List<String> errors) {}

  public record MatchLineRequest(@NotNull UUID transactionId) {}

  public record OpenTransactionResponse(
      UUID id, LocalDate date, BigDecimal amount, String description) {}

  public record ReconciliationResponse(
      int matched, int unmatched, int ignored, BigDecimal unmatchedTotal) {}

  public record SaveDistanceRequest(
      @NotBlank @Size(max = 100) String origin,
      @NotBlank @Size(max = 100) String destination,
      @NotNull @Positive BigDecimal distanceKm,
      @NotNull @Positive Integer minutes) {}

  public record DistanceResponse(
      UUID id, String origin, String destination, BigDecimal distanceKm, int minutes) {}

  public record Option(UUID id, String label) {}

  public record IntegrationOptionsResponse(
      List<Option> shipments, List<Option> accounts, List<Option> bankAccounts) {}
}
