package org.ece.blackrose.customs.web;

import jakarta.validation.Valid;
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
import org.ece.blackrose.customs.domain.CustomsTypes.CrossingDirection;
import org.ece.blackrose.customs.domain.CustomsTypes.DeclarationStatus;
import org.ece.blackrose.customs.domain.CustomsTypes.DeclarationType;
import org.ece.blackrose.customs.domain.CustomsTypes.PermitKind;
import org.ece.blackrose.customs.domain.CustomsTypes.TransitKind;
import org.ece.blackrose.customs.domain.CustomsTypes.TransitStatus;

public final class CustomsDtos {

  private CustomsDtos() {}

  public record SaveDeclarationRequest(
      @NotNull UUID shipmentId,
      @NotNull DeclarationType type,
      @NotBlank @Size(max = 100) String customsOffice,
      @NotNull LocalDate declaredOn,
      @NotBlank @Size(min = 3, max = 3) String currency) {}

  public record SaveLineRequest(
      @NotBlank @Size(max = 20) String hsCode,
      @NotBlank @Size(max = 300) String description,
      @PositiveOrZero BigDecimal quantity,
      @PositiveOrZero BigDecimal weightKg,
      @NotNull @PositiveOrZero BigDecimal value) {}

  public record ChangeDeclarationStatusRequest(
      @NotNull DeclarationStatus status, @Size(max = 50) String registrationNo) {}

  public record DeclarationLineResponse(
      UUID id,
      String hsCode,
      String description,
      BigDecimal quantity,
      BigDecimal weightKg,
      BigDecimal value) {}

  public record DeclarationResponse(
      UUID id,
      String number,
      UUID shipmentId,
      String shipmentNumber,
      DeclarationType type,
      String customsOffice,
      String registrationNo,
      LocalDate declaredOn,
      DeclarationStatus status,
      Money totalValue,
      List<DeclarationLineResponse> lines) {}

  public record SaveTransitRequest(
      @NotNull UUID shipmentId,
      UUID declarationId,
      @NotNull TransitKind kind,
      @NotBlank @Size(max = 50) String documentNo,
      @NotBlank @Size(max = 100) String departureOffice,
      @NotBlank @Size(max = 100) String destinationOffice,
      @NotNull @Valid Money guarantee,
      @NotNull LocalDate issuedOn,
      @NotNull LocalDate deadline) {}

  public record DischargeRequest(@NotNull LocalDate date) {}

  public record TransitResponse(
      UUID id,
      UUID shipmentId,
      String shipmentNumber,
      TransitKind kind,
      String documentNo,
      String departureOffice,
      String destinationOffice,
      Money guarantee,
      LocalDate issuedOn,
      LocalDate deadline,
      LocalDate dischargedOn,
      TransitStatus status,
      boolean overdue) {}

  public record SavePermitRequest(
      @NotBlank @Size(max = 50) String number,
      @NotNull PermitKind kind,
      @NotBlank @Size(max = 50) String country,
      @NotNull LocalDate validFrom,
      @NotNull LocalDate validTo,
      @NotNull @Positive Integer quota) {}

  public record UsePermitRequest(@NotNull UUID shipmentId, @NotNull LocalDate date) {}

  public record PermitUsageResponse(
      UUID id, UUID shipmentId, String shipmentNumber, LocalDate usedOn) {}

  public record PermitResponse(
      UUID id,
      String number,
      PermitKind kind,
      String country,
      LocalDate validFrom,
      LocalDate validTo,
      int quota,
      long used,
      List<PermitUsageResponse> usages) {}

  /** Ücret girilirse cari zorunludur; gider sefere yazılır. */
  public record SaveCrossingRequest(
      @NotNull UUID shipmentId,
      @NotBlank @Size(max = 100) String gate,
      @NotNull CrossingDirection direction,
      @NotNull LocalDate date,
      @Valid Money fee,
      UUID accountId,
      @Positive BigDecimal exchangeRate,
      @Size(max = 500) String note) {}

  public record CrossingResponse(
      UUID id,
      UUID shipmentId,
      String shipmentNumber,
      String gate,
      CrossingDirection direction,
      LocalDate crossedOn,
      Money fee,
      String accountName,
      boolean posted,
      String note) {}

  public record Option(UUID id, String label) {}

  public record CustomsOptionsResponse(List<Option> shipments, List<Option> feeAccounts) {}
}
