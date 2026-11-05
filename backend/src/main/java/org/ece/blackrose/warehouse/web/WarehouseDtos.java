package org.ece.blackrose.warehouse.web;

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
import org.ece.blackrose.warehouse.domain.WarehouseTypes.CountStatus;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.CustomsStatus;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.HandlingKind;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.MovementType;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.StorageBasis;
import org.ece.blackrose.warehouse.domain.WarehouseTypes.WarehouseInvoiceStatus;

public final class WarehouseDtos {

  private WarehouseDtos() {}

  public record SaveWarehouseRequest(
      @Size(max = 30) String code,
      @NotBlank @Size(max = 200) String name,
      @NotNull UUID branchId,
      @Size(max = 500) String address,
      boolean bonded,
      @Size(max = 50) String customsNo) {}

  public record WarehouseResponse(
      UUID id,
      String code,
      String name,
      UUID branchId,
      String address,
      boolean bonded,
      String customsNo) {}

  public record SaveBinRequest(
      @NotBlank @Size(max = 30) String code, @Size(max = 200) String description) {}

  public record BinResponse(UUID id, UUID warehouseId, String code, String description) {}

  public record SaveStockItemRequest(
      @NotNull UUID accountId,
      @NotBlank @Size(max = 50) String sku,
      @NotBlank @Size(max = 200) String name,
      @NotBlank @Size(max = 20) String unit,
      @NotNull @Positive BigDecimal unitsPerBillingUnit) {}

  public record StockItemResponse(
      UUID id,
      UUID accountId,
      String accountName,
      String sku,
      String name,
      String unit,
      BigDecimal unitsPerBillingUnit) {}

  public record ReceiptRequest(
      @NotNull UUID itemId,
      @NotNull UUID binId,
      @Size(max = 50) String lotNo,
      LocalDate expiryDate,
      @NotNull @Positive BigDecimal quantity,
      @NotNull LocalDate date,
      UUID shipmentId,
      @Size(max = 100) String reference,
      @Size(max = 500) String note) {}

  public record IssueRequest(
      @NotNull UUID balanceId,
      @NotNull @Positive BigDecimal quantity,
      @NotNull LocalDate date,
      UUID shipmentId,
      @Size(max = 100) String reference,
      @Size(max = 500) String note) {}

  public record CustomsReleaseRequest(
      @NotNull UUID balanceId,
      @NotNull @Positive BigDecimal quantity,
      @NotNull LocalDate date,
      @NotBlank @Size(max = 100) String reference) {}

  public record ReverseMovementRequest(@NotNull LocalDate date) {}

  public record BalanceResponse(
      UUID id,
      UUID warehouseId,
      String warehouseName,
      UUID binId,
      String binCode,
      UUID itemId,
      String sku,
      String itemName,
      String unit,
      UUID accountId,
      String accountName,
      String lotNo,
      LocalDate expiryDate,
      CustomsStatus customsStatus,
      BigDecimal quantity) {}

  public record MovementResponse(
      UUID id,
      MovementType type,
      String warehouseName,
      String binCode,
      String sku,
      String itemName,
      String accountName,
      String lotNo,
      CustomsStatus customsStatus,
      BigDecimal quantity,
      LocalDate movedOn,
      UUID shipmentId,
      String reference,
      String note,
      String createdBy,
      boolean reversible) {}

  public record CreateCountRequest(@NotNull UUID warehouseId, @NotNull LocalDate date) {}

  public record AddCountLineRequest(
      @NotNull UUID binId,
      @NotNull UUID itemId,
      @Size(max = 50) String lotNo,
      LocalDate expiryDate,
      @NotNull @PositiveOrZero BigDecimal countedQuantity) {}

  public record EnterCountRequest(@NotNull @PositiveOrZero BigDecimal countedQuantity) {}

  public record CountLineResponse(
      UUID id,
      String binCode,
      String sku,
      String itemName,
      String accountName,
      String lotNo,
      CustomsStatus customsStatus,
      BigDecimal systemQuantity,
      BigDecimal countedQuantity,
      BigDecimal difference) {}

  public record CountSummary(
      UUID id,
      String number,
      UUID warehouseId,
      String warehouseName,
      LocalDate date,
      CountStatus status) {}

  public record CountResponse(CountSummary count, List<CountLineResponse> lines) {}

  public record SaveContractRequest(
      @NotNull UUID accountId,
      @NotNull UUID warehouseId,
      @NotNull LocalDate startDate,
      @NotNull LocalDate endDate,
      @NotBlank @Size(min = 3, max = 3) String currency,
      @NotNull StorageBasis storageBasis,
      @NotNull @PositiveOrZero BigDecimal storageRate,
      UUID taxRateId) {}

  public record ContractResponse(
      UUID id,
      UUID accountId,
      String accountName,
      UUID warehouseId,
      String warehouseName,
      LocalDate startDate,
      LocalDate endDate,
      String currency,
      StorageBasis storageBasis,
      BigDecimal storageRate,
      UUID taxRateId) {}

  public record SaveRateRequest(
      @NotNull HandlingKind kind, @NotNull @PositiveOrZero BigDecimal unitPrice) {}

  public record RateResponse(UUID id, HandlingKind kind, BigDecimal unitPrice) {}

  public record SaveHandlingRequest(
      @NotNull HandlingKind kind,
      @NotNull @Positive BigDecimal quantity,
      @NotNull LocalDate date,
      UUID shipmentId,
      @Size(max = 500) String note) {}

  public record HandlingResponse(
      UUID id,
      HandlingKind kind,
      BigDecimal quantity,
      BigDecimal unitPrice,
      BigDecimal amount,
      LocalDate chargedOn,
      UUID invoiceId,
      String note) {}

  public record InvoicePreview(
      LocalDate from,
      LocalDate to,
      BigDecimal storageQuantity,
      Money storage,
      Money handling,
      Money net,
      Money vat,
      Money withholding,
      Money total) {}

  public record IssueWarehouseInvoiceRequest(
      @NotNull LocalDate from,
      @NotNull LocalDate to,
      @NotNull LocalDate invoiceDate,
      @NotNull LocalDate dueDate,
      @Positive BigDecimal exchangeRate) {}

  public record CancelWarehouseInvoiceRequest(@NotNull LocalDate date) {}

  public record WarehouseInvoiceResponse(
      UUID id,
      String number,
      UUID contractId,
      UUID accountId,
      LocalDate periodFrom,
      LocalDate periodTo,
      LocalDate invoiceDate,
      LocalDate dueDate,
      BigDecimal storageQuantity,
      Money storage,
      Money handling,
      Money net,
      Money vat,
      Money withholding,
      Money total,
      WarehouseInvoiceStatus status) {}

  public record Option(UUID id, String label) {}

  public record WarehouseOptionsResponse(
      List<Option> customers, List<Option> taxRates, List<Option> shipments) {}
}
