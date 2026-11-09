package org.ece.blackrose.crm.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.crm.domain.CrmTypes.ActivityType;
import org.ece.blackrose.crm.domain.CrmTypes.ContractStatus;
import org.ece.blackrose.crm.domain.CrmTypes.OpportunityStage;
import org.ece.blackrose.crm.domain.CrmTypes.PriceUnit;
import org.ece.blackrose.crm.domain.CrmTypes.QuoteStatus;
import org.ece.blackrose.crm.domain.CrmTypes.TariffLineKind;
import org.ece.blackrose.crm.domain.CrmTypes.TariffSource;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;

public final class CrmDtos {

  private CrmDtos() {}

  public record SaveCustomerRequest(
      @NotBlank @Size(max = 50) String code,
      @NotBlank @Size(max = 200) String name,
      @NotNull AccountType type,
      @Size(max = 20) String taxNumber,
      @Size(max = 50) String segment,
      Set<@NotBlank @Size(max = 50) String> tags) {}

  public record CustomerResponse(
      UUID id,
      String code,
      String name,
      AccountType type,
      String taxNumber,
      String segment,
      Set<String> tags) {}

  public record SaveContactRequest(
      @NotBlank @Size(max = 200) String fullName,
      @Size(max = 100) String title,
      @Email @Size(max = 254) String email,
      @Size(max = 30) String phone,
      boolean notifyDeliveries) {}

  public record ContactResponse(
      UUID id,
      UUID accountId,
      String fullName,
      String title,
      String email,
      String phone,
      boolean notifyDeliveries) {}

  public record SaveOpportunityRequest(
      @NotNull UUID accountId,
      @NotBlank @Size(max = 200) String title,
      @NotNull @Valid Money money,
      LocalDate expectedCloseDate) {}

  public record OpportunityResponse(
      UUID id,
      UUID accountId,
      String title,
      OpportunityStage stage,
      Money money,
      String ownerEmail,
      LocalDate expectedCloseDate,
      String lostReason) {}

  public record MoveStageRequest(@NotNull OpportunityStage stage, @Size(max = 500) String note) {}

  public record SaveActivityRequest(
      @NotNull UUID accountId,
      UUID opportunityId,
      @NotNull ActivityType type,
      @NotBlank @Size(max = 300) String subject,
      LocalDate dueDate) {}

  public record ActivityResponse(
      UUID id,
      UUID accountId,
      UUID opportunityId,
      ActivityType type,
      String subject,
      LocalDate dueDate,
      Instant completedAt,
      String createdBy,
      Instant createdAt) {}

  public record SaveTaxRateRequest(
      @NotBlank @Size(max = 50) String code,
      @NotBlank @Size(max = 100) String name,
      @NotNull @DecimalMin("0") BigDecimal vatPercent,
      @Min(0) int withholdingNumerator,
      @Min(1) int withholdingDenominator) {}

  public record TaxRateResponse(
      UUID id,
      String code,
      String name,
      BigDecimal vatPercent,
      int withholdingNumerator,
      int withholdingDenominator) {}

  public record SaveTariffRequest(
      @NotBlank @Size(max = 50) String code,
      @NotBlank @Size(max = 200) String name,
      @NotBlank @Size(min = 3, max = 3) String currency,
      UUID accountId,
      @NotNull LocalDate validFrom,
      LocalDate validTo,
      boolean active,
      @PositiveOrZero BigDecimal fuelSurchargePercent,
      @PositiveOrZero BigDecimal waitingHourlyFee,
      @PositiveOrZero BigDecimal extraStopFee,
      @PositiveOrZero BigDecimal adrPercent,
      @PositiveOrZero BigDecimal insurancePercent,
      UUID taxRateId) {}

  public record TariffResponse(
      UUID id,
      String code,
      String name,
      String currency,
      UUID accountId,
      LocalDate validFrom,
      LocalDate validTo,
      boolean active,
      BigDecimal fuelSurchargePercent,
      BigDecimal waitingHourlyFee,
      BigDecimal extraStopFee,
      BigDecimal adrPercent,
      BigDecimal insurancePercent,
      UUID taxRateId) {}

  public record SaveTariffLineRequest(
      @NotNull TariffLineKind kind,
      @Size(max = 100) String origin,
      @Size(max = 100) String destination,
      @Size(max = 50) String vehicleType,
      @NotNull PriceUnit unit,
      @NotNull @PositiveOrZero BigDecimal unitPrice,
      @PositiveOrZero BigDecimal minAmount) {}

  public record TariffLineResponse(
      UUID id,
      UUID tariffId,
      TariffLineKind kind,
      String origin,
      String destination,
      String vehicleType,
      PriceUnit unit,
      BigDecimal unitPrice,
      BigDecimal minAmount) {}

  /** Fiyat motorunun girdisi. Aynı girdi her zaman aynı kırılımı üretir. */
  public record PriceRequest(
      UUID accountId,
      UUID tariffId,
      UUID taxRateId,
      @NotNull LocalDate date,
      @NotBlank @Size(max = 100) String origin,
      @NotBlank @Size(max = 100) String destination,
      @Size(max = 50) String vehicleType,
      @PositiveOrZero BigDecimal weightTon,
      @PositiveOrZero Integer pallets,
      @PositiveOrZero BigDecimal distanceKm,
      @PositiveOrZero BigDecimal waitingHours,
      @PositiveOrZero Integer extraStops,
      boolean adr,
      @PositiveOrZero BigDecimal tollAmount) {}

  public record PriceComponent(String code, String basis, BigDecimal amount) {}

  public record PriceBreakdown(
      TariffSource source,
      UUID tariffId,
      String tariffCode,
      UUID contractId,
      UUID tariffLineId,
      String currency,
      List<PriceComponent> components,
      BigDecimal net,
      BigDecimal vatPercent,
      BigDecimal vat,
      BigDecimal withholding,
      BigDecimal total) {}

  public record SaveQuoteRequest(
      @NotNull UUID accountId,
      UUID opportunityId,
      UUID tariffId,
      UUID taxRateId,
      @NotBlank @Size(min = 3, max = 3) String currency,
      @NotNull LocalDate validUntil,
      @Size(max = 1000) String notes) {}

  public record AddQuoteLineRequest(
      @NotBlank @Size(max = 100) String origin,
      @NotBlank @Size(max = 100) String destination,
      @Size(max = 50) String vehicleType,
      @PositiveOrZero BigDecimal weightTon,
      @PositiveOrZero Integer pallets,
      @PositiveOrZero BigDecimal distanceKm,
      @PositiveOrZero BigDecimal waitingHours,
      @PositiveOrZero Integer extraStops,
      boolean adr,
      @PositiveOrZero BigDecimal tollAmount,
      @PositiveOrZero BigDecimal manualNet,
      @Size(max = 300) String description) {}

  public record QuoteLineResponse(
      UUID id,
      String origin,
      String destination,
      String vehicleType,
      BigDecimal weightTon,
      Integer pallets,
      BigDecimal distanceKm,
      String description,
      BigDecimal net,
      BigDecimal vat,
      BigDecimal withholding,
      BigDecimal total,
      PriceBreakdown breakdown) {}

  public record QuoteResponse(
      UUID id,
      String number,
      int version,
      UUID accountId,
      UUID opportunityId,
      UUID tariffId,
      UUID taxRateId,
      String currency,
      LocalDate validUntil,
      QuoteStatus status,
      Money net,
      Money vat,
      Money withholding,
      Money total,
      String notes,
      List<QuoteLineResponse> lines) {}

  public record AcceptQuoteRequest(
      @NotNull LocalDate startDate,
      @NotNull LocalDate endDate,
      UUID tariffId,
      @PositiveOrZero Integer paymentTermDays,
      @PositiveOrZero BigDecimal fuelSurchargePercent,
      @PositiveOrZero BigDecimal waitingHourlyFee,
      @Size(max = 2000) String specialTerms) {}

  public record SaveContractRequest(
      @NotNull UUID accountId,
      UUID tariffId,
      @NotNull LocalDate startDate,
      @NotNull LocalDate endDate,
      @PositiveOrZero Integer paymentTermDays,
      @PositiveOrZero BigDecimal fuelSurchargePercent,
      @PositiveOrZero BigDecimal waitingHourlyFee,
      @Size(max = 2000) String specialTerms) {}

  public record ContractResponse(
      UUID id,
      String number,
      UUID accountId,
      UUID quoteId,
      UUID tariffId,
      LocalDate startDate,
      LocalDate endDate,
      ContractStatus status,
      Integer paymentTermDays,
      BigDecimal fuelSurchargePercent,
      BigDecimal waitingHourlyFee,
      String specialTerms) {}

  public record ContractStatusRequest(@NotNull ContractStatus status) {}

  public record FunnelEntry(
      OpportunityStage stage, String currency, long count, BigDecimal total) {}

  public record OwnerPerformance(String ownerEmail, long open, long won, long lost) {}

  public record CrmDashboardResponse(
      List<FunnelEntry> funnel,
      BigDecimal winRatePercent,
      List<OwnerPerformance> owners,
      List<ActivityResponse> upcomingActivities) {}
}
