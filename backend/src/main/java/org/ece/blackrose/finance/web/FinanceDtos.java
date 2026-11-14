package org.ece.blackrose.finance.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.CompanyType;
import org.ece.blackrose.finance.domain.FinanceTypes.DensityLevel;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentMovementType;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.InvoiceStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.PlanStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.web.AccountDtos.AccountCompanyLimitResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountPlanSummaryResponse;
import org.ece.blackrose.finance.web.AccountDtos.CurrencyAmountResponse;
import org.ece.blackrose.finance.web.AccountDtos.SaveBankAccountRequest;

public final class FinanceDtos {

  private FinanceDtos() {}

  /**
   * Cari kartı. MUI yalnız ilk beş alanı gönderir; {@code code} boşsa hesap grubundan üretilir.
   * Diğer alanlar ZTO formundandır (12.1 §4.1).
   */
  public record SaveAccountRequest(
      @Size(max = 50) String code,
      @NotBlank @Size(max = 200) String name,
      @NotNull AccountType type,
      @Size(max = 20) String taxNumber,
      UUID branchId,
      @Size(max = 30) String subGroup,
      UUID companyId,
      @Pattern(regexp = "^[A-Z]{3}$") String defaultCurrency,
      @PositiveOrZero BigDecimal creditLimit,
      @PositiveOrZero BigDecimal riskLimit,
      @Size(max = 100) String taxOffice,
      CompanyType companyType,
      @Size(max = 30) String phone,
      @Email @Size(max = 254) String email,
      @Size(max = 200) String website,
      @Size(max = 200) String contactName,
      @Size(max = 100) String contactTitle,
      @Size(max = 30) String contactMobile,
      @Size(max = 1000) String address,
      @Size(max = 100) String city,
      @Size(max = 100) String district,
      @Size(max = 100) String country,
      @Size(max = 20) String postalCode,
      @Size(max = 1000) String paymentTerms,
      @Size(max = 2000) String notes,
      @Valid List<SaveBankAccountRequest> bankAccounts) {}

  /**
   * Bakiye satırı. {@code companyId}/{@code branchId} yalnız şirket/iş yeri kırılımında dolu;
   * {@code debt}, {@code payment}, {@code receivable}, {@code collection} hareket türü toplamları
   * (12.1 §3.5).
   */
  public record BalanceResponse(
      String currency,
      BigDecimal debit,
      BigDecimal credit,
      BigDecimal balance,
      BigDecimal tlBalance,
      UUID companyId,
      UUID branchId,
      BigDecimal debt,
      BigDecimal payment,
      BigDecimal receivable,
      BigDecimal collection) {}

  /**
   * Cari kartı yanıtı. {@code taxNumber}: VKN düz; TCKN listede ve izinsiz detayda maskeli ({@code
   * taxNumberMasked}). {@code address} ve {@code companyLimits} yalnız detayda; adres yalnız
   * FINANCE_MANAGE sahibine çözülür.
   */
  public record AccountResponse(
      UUID id,
      String code,
      String name,
      AccountType type,
      String taxNumber,
      boolean taxNumberMasked,
      UUID branchId,
      UUID companyId,
      UUID representsCompanyId,
      List<BalanceResponse> balances,
      String subGroup,
      String subGroupName,
      boolean active,
      String defaultCurrency,
      BigDecimal creditLimit,
      BigDecimal riskLimit,
      List<AccountCompanyLimitResponse> companyLimits,
      String taxOffice,
      CompanyType companyType,
      String phone,
      String email,
      String website,
      String contactName,
      String contactTitle,
      String contactMobile,
      String address,
      String city,
      String district,
      String country,
      String postalCode,
      String paymentTerms,
      String notes,
      AccountPlanSummaryResponse planSummary,
      String createdBy,
      Instant createdAt,
      String updatedBy,
      Instant updatedAt,
      int updateCount) {}

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
      UUID companyId,
      Direction direction,
      Money money,
      BigDecimal exchangeRate,
      LocalDate rateDate,
      BigDecimal tlAmount,
      LocalDate transactionDate,
      String description,
      String sourceType,
      UUID sourceId) {}

  /**
   * Ekstre satırı. {@code date} etkin tarihtir (belge tarihi tabanında belge tarihi); {@code
   * balance} satırın para birimindeki dönem başı + yürüyen bakiye. 12.1 eklemeleri (§4.5) eski
   * alanlardan sonra gelir.
   */
  public record StatementLine(
      UUID id,
      LocalDate date,
      String direction,
      BigDecimal amount,
      BigDecimal exchangeRate,
      BigDecimal tlAmount,
      String description,
      String sourceType,
      BigDecimal balance,
      String currency,
      UUID companyId,
      UUID branchId,
      UUID sourceId,
      String kind,
      int sign,
      boolean reversal,
      boolean reversed,
      String transferRole,
      String documentNo,
      String documentType,
      LocalDate documentDate,
      LocalDate dueDate,
      String paymentMethod,
      String createdBy,
      Instant createdAt) {

    /** Banka/kasa ekstresi satırı: cari hareketine özgü 12.1 alanları boştur. */
    public StatementLine(
        UUID id,
        LocalDate date,
        String direction,
        BigDecimal amount,
        BigDecimal exchangeRate,
        BigDecimal tlAmount,
        String description,
        String sourceType,
        BigDecimal balance) {
      this(
          id,
          date,
          direction,
          amount,
          exchangeRate,
          tlAmount,
          description,
          sourceType,
          balance,
          null,
          null,
          null,
          null,
          null,
          0,
          false,
          false,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null);
    }
  }

  /**
   * {@code currency} verilmeyen (çok para birimli) ekstrede {@code currency} ve {@code
   * openingBalance} boştur; para birimi başına açılış {@code openingBalances}'tadır.
   */
  public record StatementResponse(
      String currency,
      BigDecimal openingBalance,
      List<CurrencyAmountResponse> openingBalances,
      List<StatementLine> lines,
      int page,
      int size,
      long totalElements,
      int totalPages) {

    /** Banka/kasa ekstresi (para birimi tek; para birimi başına açılış listesi yok). */
    public StatementResponse(
        String currency,
        BigDecimal openingBalance,
        List<StatementLine> lines,
        int page,
        int size,
        long totalElements,
        int totalPages) {
      this(currency, openingBalance, List.of(), lines, page, size, totalElements, totalPages);
    }
  }

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
      UUID companyId,
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
      UUID companyId,
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

  /**
   * {@code movementType = TRANSFERRED}: cari taşıma (12.1 §3.11); durum değişmez, bağlı cari {@code
   * fromAccountId → toAccountId} olur.
   */
  public record InstrumentMovementResponse(
      UUID id,
      InstrumentStatus fromStatus,
      InstrumentStatus toStatus,
      LocalDate movementDate,
      String note,
      String createdBy,
      InstrumentMovementType movementType,
      UUID fromAccountId,
      UUID toAccountId,
      UUID accountTransferId) {}

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
      UUID companyId,
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
      UUID companyId,
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
      UUID companyId,
      Money money,
      LocalDate dueDate,
      PlanStatus status,
      UUID purchaseInvoiceId,
      String description,
      String rejectNote) {}

  public record PlanNoteRequest(@Size(max = 500) String note) {}

  public record PostponePlanRequest(@NotNull LocalDate dueDate, @Size(max = 500) String note) {}

  public record PayPlanRequest(
      @NotNull SettlementMethod method,
      @NotNull UUID fundAccountId,
      @NotNull LocalDate date,
      @Positive BigDecimal exchangeRate) {}

  public record PlanEventResponse(
      UUID id, String eventType, String note, String createdBy, Instant createdAt) {}

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
