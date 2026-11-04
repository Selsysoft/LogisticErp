package org.ece.blackrose.finance.web;

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
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.DensityLevel;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.InvoiceStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.PlanStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;

public final class FinanceDtos {

  private FinanceDtos() {}

  public record SaveAccountRequest(
      @NotBlank @Size(max = 50) String code,
      @NotBlank @Size(max = 200) String name,
      @NotNull AccountType type,
      @Size(max = 20) String taxNumber,
      UUID branchId) {}

  public record BalanceResponse(
      String currency,
      BigDecimal debit,
      BigDecimal credit,
      BigDecimal balance,
      BigDecimal tlBalance) {}

  public record AccountResponse(
      UUID id,
      String code,
      String name,
      AccountType type,
      String taxNumber,
      UUID branchId,
      List<BalanceResponse> balances) {}

  public record ManualAccountTransactionRequest(
      @NotNull UUID branchId,
      @NotNull Direction direction,
      @NotNull @Valid Money money,
      @NotNull LocalDate date,
      @Size(max = 500) String description,
      @Positive BigDecimal exchangeRate) {}

  public record ReverseRequest(@NotNull LocalDate date, @Size(max = 500) String description) {}

  public record AccountTransactionResponse(
      UUID id,
      UUID accountId,
      UUID branchId,
      Direction direction,
      Money money,
      BigDecimal exchangeRate,
      LocalDate rateDate,
      BigDecimal tlAmount,
      LocalDate transactionDate,
      String description,
      String sourceType,
      UUID sourceId) {}

  public record StatementLine(
      UUID id,
      LocalDate date,
      String direction,
      BigDecimal amount,
      BigDecimal exchangeRate,
      BigDecimal tlAmount,
      String description,
      String sourceType,
      BigDecimal balance) {}

  public record StatementResponse(
      String currency,
      BigDecimal openingBalance,
      List<StatementLine> lines,
      int page,
      int size,
      long totalElements,
      int totalPages) {}

  public record AgingResponse(
      UUID accountId,
      String accountName,
      String currency,
      BigDecimal days0To30,
      BigDecimal days31To60,
      BigDecimal days61To90,
      BigDecimal daysOver90,
      BigDecimal total) {}

  public record CreateFundRequest(
      @NotBlank @Size(max = 50) String code,
      @NotBlank @Size(max = 200) String name,
      @NotNull FundKind kind,
      @NotBlank @Size(min = 3, max = 3) String currency,
      @NotNull UUID branchId,
      @Size(max = 100) String bankName,
      @Size(max = 34) String iban,
      boolean allowNegative) {}

  public record UpdateFundRequest(
      @NotBlank @Size(max = 200) String name,
      @NotNull UUID branchId,
      @Size(max = 100) String bankName,
      @Size(max = 34) String iban,
      boolean allowNegative) {}

  public record FundResponse(
      UUID id,
      String code,
      String name,
      FundKind kind,
      String currency,
      UUID branchId,
      String bankName,
      String iban,
      boolean allowNegative,
      BigDecimal balance) {}

  public record ManualFundTransactionRequest(
      @NotNull FundDirection direction,
      @NotNull @Valid Money money,
      @NotNull LocalDate date,
      @Size(max = 500) String description,
      @Positive BigDecimal exchangeRate) {}

  public record TransferRequest(
      @NotNull UUID fromFundId,
      @NotNull UUID toFundId,
      @NotNull @Valid Money money,
      @NotNull LocalDate date,
      @Size(max = 500) String description,
      @Positive BigDecimal exchangeRate) {}

  public record FundTransactionResponse(
      UUID id,
      UUID fundAccountId,
      FundDirection direction,
      Money money,
      BigDecimal tlAmount,
      LocalDate transactionDate,
      String description,
      String sourceType,
      UUID sourceId) {}

  public record TransferResponse(UUID transferId) {}

  public record NewInstrument(
      @NotNull InstrumentKind kind,
      @NotBlank @Size(max = 50) String number,
      @Size(max = 100) String bankName,
      @NotNull LocalDate dueDate) {}

  public record InstrumentResponse(
      UUID id,
      InstrumentKind kind,
      InstrumentDirection direction,
      String number,
      String bankName,
      UUID accountId,
      UUID endorsedAccountId,
      UUID branchId,
      UUID fundAccountId,
      Money money,
      LocalDate dueDate,
      InstrumentStatus status) {}

  public record InstrumentTransitionRequest(
      @NotNull InstrumentStatus toStatus,
      UUID fundAccountId,
      @NotNull LocalDate date,
      @Size(max = 500) String note,
      @Positive BigDecimal exchangeRate) {}

  public record InstrumentMovementResponse(
      UUID id,
      InstrumentStatus fromStatus,
      InstrumentStatus toStatus,
      LocalDate movementDate,
      String note,
      String createdBy) {}

  public record SettlementRequest(
      @NotNull SettlementMethod method,
      UUID accountId,
      @NotNull UUID branchId,
      UUID fundAccountId,
      UUID expenseItemId,
      UUID instrumentId,
      @Valid NewInstrument instrument,
      @NotNull @Valid Money money,
      @NotNull LocalDate date,
      @Size(max = 500) String description,
      @Positive BigDecimal exchangeRate) {}

  public record SettlementResponse(
      UUID id,
      SettlementType type,
      SettlementMethod method,
      UUID accountId,
      UUID branchId,
      UUID fundAccountId,
      UUID instrumentId,
      UUID expenseItemId,
      UUID planId,
      Money money,
      LocalDate settlementDate,
      String description,
      SettlementStatus status) {}

  public record DailyTotal(UUID branchId, String currency, BigDecimal total, int count) {}

  public record DailyReportResponse(
      SettlementType type,
      LocalDate date,
      List<SettlementResponse> rows,
      List<DailyTotal> totals) {}

  public record CreatePurchaseInvoiceRequest(
      @NotNull UUID accountId,
      @NotNull UUID branchId,
      @NotBlank @Size(max = 50) String number,
      @NotNull LocalDate invoiceDate,
      @NotNull LocalDate dueDate,
      @NotNull @Valid Money net,
      @NotNull @Valid Money vat,
      @Size(max = 500) String description,
      @Positive BigDecimal exchangeRate) {}

  public record PurchaseInvoiceResponse(
      UUID id,
      UUID accountId,
      UUID branchId,
      String number,
      LocalDate invoiceDate,
      LocalDate dueDate,
      Money net,
      Money vat,
      Money total,
      InvoiceStatus status,
      String description) {}

  public record CreatePlanRequest(
      @NotNull UUID accountId,
      @NotNull UUID branchId,
      @NotNull @Valid Money money,
      @NotNull LocalDate dueDate,
      @Size(max = 500) String description) {}

  public record PlanResponse(
      UUID id,
      UUID accountId,
      UUID branchId,
      Money money,
      LocalDate dueDate,
      PlanStatus status,
      UUID purchaseInvoiceId,
      String description) {}

  public record PlanNoteRequest(@Size(max = 500) String note) {}

  public record PostponePlanRequest(@NotNull LocalDate dueDate, @Size(max = 500) String note) {}

  public record PayPlanRequest(
      @NotNull SettlementMethod method,
      @NotNull UUID fundAccountId,
      @NotNull LocalDate date,
      @Positive BigDecimal exchangeRate) {}

  public record PlanEventResponse(UUID id, String eventType, String note, String createdBy) {}

  public record SaveFinanceSettingsRequest(@NotNull Boolean allowSelfApproval) {}

  public record FinanceSettingsResponse(boolean allowSelfApproval) {}

  public record SaveThresholdRequest(
      @NotNull @PositiveOrZero BigDecimal low,
      @NotNull @PositiveOrZero BigDecimal medium,
      @NotNull @PositiveOrZero BigDecimal high) {}

  public record ThresholdResponse(
      String currency, BigDecimal low, BigDecimal medium, BigDecimal high) {}

  public record HeatmapCell(
      String period, String currency, BigDecimal total, int count, DensityLevel level) {}

  public record CurrencyTotal(String currency, BigDecimal total, int count) {}

  public record DashboardResponse(
      List<CurrencyTotal> overdue,
      List<CurrencyTotal> dueToday,
      List<CurrencyTotal> dueThisWeek,
      long pendingApproval,
      List<PlanResponse> upcoming) {}

  public record SaveExpenseTypeRequest(
      @NotBlank @Size(max = 50) String code, @NotBlank @Size(max = 100) String name) {}

  public record ExpenseTypeResponse(UUID id, String code, String name) {}

  public record SaveExpenseItemRequest(
      @NotNull UUID expenseTypeId,
      @NotBlank @Size(max = 50) String code,
      @NotBlank @Size(max = 100) String name) {}

  public record ExpenseItemResponse(UUID id, UUID expenseTypeId, String code, String name) {}

  public record CurrencyResponse(String code, String name) {}

  public record ExchangeRateResponse(
      String currency, LocalDate rateDate, BigDecimal rate, String source) {}
}
