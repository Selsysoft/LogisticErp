package org.ece.blackrose.finance.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
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
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentSide;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountTransferStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.BalanceGroupBy;
import org.ece.blackrose.finance.domain.FinanceTypes.BankAccountCategory;
import org.ece.blackrose.finance.domain.FinanceTypes.BankAccountKind;
import org.ece.blackrose.finance.domain.FinanceTypes.CompanyType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.DocumentAudience;
import org.ece.blackrose.finance.domain.FinanceTypes.DocumentPaymentMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.InvoiceSide;
import org.ece.blackrose.finance.domain.FinanceTypes.TransactionKind;

/** Faz 12.1 cari uçlarının yeni DTO'ları (12.1_TASARIM §4). */
public final class AccountDtos {

  private AccountDtos() {}

  public record AccountGroupResponse(
      String code,
      AccountType accountType,
      String name,
      String reportType,
      String codePrefix,
      int sortOrder,
      boolean typeDefault,
      boolean selectable,
      boolean active) {}

  public record AccountCompanyLimitResponse(
      UUID companyId, BigDecimal creditLimit, BigDecimal riskLimit) {}

  public record CurrencyAmountResponse(String currency, BigDecimal amount) {}

  public record AccountPlanSummaryResponse(
      LocalDate nextDueDate,
      long overdueCount,
      long dueTodayCount,
      long draftCount,
      long pendingCount,
      long approvedCount,
      List<CurrencyAmountResponse> planned) {}

  /**
   * ZTO düzenleme formu (PUT /accounts/{id}/profile). Limit almaz: form değişen kart limitini önce
   * {@code PUT /accounts/{id}/limits} ile yazar (12.1 §9 OK-42); gövdedeki limit alanları yok
   * sayılır.
   */
  public record AccountProfileRequest(
      @NotBlank @Size(max = 50) String code,
      @NotBlank @Size(max = 200) String name,
      @NotNull AccountType type,
      @NotBlank @Size(max = 30) String subGroup,
      @Size(max = 20) String taxNumber,
      UUID branchId,
      UUID companyId,
      @Pattern(regexp = "^[A-Z]{3}$") String defaultCurrency,
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
      @Valid List<ProfileBankAccountRequest> bankAccounts,
      List<UUID> deactivatedBankAccountIds) {}

  /** Kart ya da banka hesabı aktifliği. */
  public record AccountActiveRequest(@NotNull Boolean active) {}

  /** {@code companyId} boşsa kart (konsolide) limiti, doluysa o şirketin limiti. */
  public record AccountLimitRequest(
      UUID companyId,
      @PositiveOrZero BigDecimal creditLimit,
      @PositiveOrZero BigDecimal riskLimit) {}

  public record AccountHistoryResponse(
      Instant at, String actorEmail, String event, String details) {}

  public record SaveBankAccountRequest(
      @NotBlank @Size(max = 100) String bankName,
      @Size(max = 100) String branchName,
      @Size(max = 34) @Pattern(regexp = "^[A-Za-z0-9-]*$") String accountNumber,
      @Size(max = 42) String iban,
      @Size(max = 200) String holderName,
      @NotBlank @Pattern(regexp = "^[A-Z]{3}$") String currency,
      BankAccountKind accountKind,
      @NotNull BankAccountCategory category,
      LocalDate openedOn,
      @Size(max = 500) String description) {}

  /** Profil formundaki banka satırı: {@code id} doluysa güncellenir, boşsa eklenir. */
  public record ProfileBankAccountRequest(
      UUID id,
      @NotBlank @Size(max = 100) String bankName,
      @Size(max = 100) String branchName,
      @Size(max = 34) @Pattern(regexp = "^[A-Za-z0-9-]*$") String accountNumber,
      @Size(max = 42) String iban,
      @Size(max = 200) String holderName,
      @NotBlank @Pattern(regexp = "^[A-Z]{3}$") String currency,
      BankAccountKind accountKind,
      @NotNull BankAccountCategory category,
      LocalDate openedOn,
      @Size(max = 500) String description) {

    public SaveBankAccountRequest toSave() {
      return new SaveBankAccountRequest(
          bankName,
          branchName,
          accountNumber,
          iban,
          holderName,
          currency,
          accountKind,
          category,
          openedOn,
          description);
    }
  }

  /** IBAN/hesap no yalnız detayda ve FINANCE_MANAGE sahibine açık; diğerlerinde null. */
  public record AccountBankAccountResponse(
      UUID id,
      UUID accountId,
      String accountCode,
      String accountName,
      AccountType accountType,
      String bankName,
      String branchName,
      String accountNumber,
      String accountNumberMasked,
      String iban,
      String ibanMasked,
      String holderName,
      String currency,
      BankAccountKind accountKind,
      BankAccountCategory category,
      LocalDate openedOn,
      LocalDate lastTransactionOn,
      String description,
      boolean active,
      String createdBy,
      Instant createdAt,
      String updatedBy,
      Instant updatedAt,
      int updateCount) {}

  // --- Borç/Alacak belgesi (12.1 §4.3)

  public record AccountDocumentTypeResponse(
      AccountDocumentSide side,
      String code,
      String name,
      DocumentAudience audience,
      boolean invoiceSection,
      boolean penalty,
      boolean isDefault,
      boolean selectable,
      int sortOrder,
      boolean countsAsInvoice) {}

  /** Fatura bölümü; tutarlar sunucuda yeniden hesaplanır, istemcinin toplamları alınmaz. */
  public record AccountDocumentTaxRequest(
      @DecimalMin("0") @DecimalMax("100") BigDecimal discountRate,
      @DecimalMin("0") @DecimalMax("100") BigDecimal vatRate,
      @PositiveOrZero BigDecimal withholdingAmount,
      @PositiveOrZero BigDecimal otherTaxesAmount) {}

  /**
   * Borç/Alacak Ekle. {@code amount} sıfırdan büyük olmalı (değilse 400 {@code AMOUNT_INVALID});
   * {@code reflectToLedger} yalnız fatura türünde {@code false} olabilir (varsayılan {@code true}).
   */
  public record AccountDocumentRequest(
      @NotNull AccountDocumentSide side,
      @NotBlank @Size(max = 40) String documentType,
      @NotBlank @Size(max = 50) String documentNo,
      @NotNull LocalDate documentDate,
      LocalDate dueDate,
      @NotNull BigDecimal amount,
      @NotBlank @Pattern(regexp = "^[A-Z]{3}$") String currency,
      @Positive BigDecimal exchangeRate,
      @NotNull DocumentPaymentMethod paymentMethod,
      @NotNull UUID branchId,
      @Size(max = 500) String description,
      Boolean reflectToLedger,
      @Valid AccountDocumentTaxRequest tax) {}

  public record AccountDocumentCancelRequest(LocalDate date, @Size(max = 500) String reason) {}

  public record AccountDocumentTaxResponse(
      BigDecimal grossAmount,
      BigDecimal discountRate,
      BigDecimal discountAmount,
      BigDecimal netExclVat,
      BigDecimal vatRate,
      BigDecimal vatAmount,
      BigDecimal totalInclVat,
      BigDecimal withholdingAmount,
      BigDecimal otherTaxesAmount,
      BigDecimal netPayable) {}

  public record AccountDocumentResponse(
      UUID id,
      UUID accountId,
      String accountCode,
      String accountName,
      UUID branchId,
      UUID companyId,
      AccountDocumentSide side,
      String documentType,
      String documentTypeName,
      String documentNo,
      LocalDate documentDate,
      LocalDate dueDate,
      BigDecimal amount,
      String currency,
      BigDecimal exchangeRate,
      DocumentPaymentMethod paymentMethod,
      String description,
      boolean reflectToLedger,
      BigDecimal ledgerAmount,
      AccountDocumentStatus status,
      LocalDate cancelDate,
      String cancelReason,
      UUID revisedFromId,
      UUID revisedById,
      UUID transactionId,
      UUID fxSourceTransactionId,
      BigDecimal fxRate,
      LocalDate fxRateDate,
      AccountDocumentTaxResponse tax,
      String createdBy,
      Instant createdAt,
      String updatedBy,
      Instant updatedAt) {}

  // --- Cari hareketleri (12.1 §4.4)

  public record AccountTransactionRowResponse(
      UUID id,
      LocalDate transactionDate,
      Instant createdAt,
      String createdBy,
      UUID accountId,
      String accountCode,
      String accountName,
      AccountType accountType,
      String subGroup,
      String subGroupName,
      UUID branchId,
      String branchName,
      UUID companyId,
      TransactionKind kind,
      int sign,
      Direction direction,
      BigDecimal amount,
      String currency,
      BigDecimal exchangeRate,
      BigDecimal tlAmount,
      String description,
      String sourceType,
      UUID sourceId,
      String documentNo,
      String documentType,
      LocalDate documentDate,
      LocalDate dueDate,
      String paymentMethod,
      boolean reversal,
      boolean reversed,
      String transferRole,
      boolean transferredOut) {}

  public record BranchFacetResponse(UUID id, String name, long count) {}

  public record GroupFacetResponse(String code, String name, long count) {}

  public record KindFacetResponse(String kind, long count) {}

  public record AccountTransactionFacetsResponse(
      List<BranchFacetResponse> branches,
      List<GroupFacetResponse> groups,
      List<KindFacetResponse> kinds) {}

  public record AccountTransactionPageResponse(
      List<AccountTransactionRowResponse> content,
      int page,
      int size,
      long totalElements,
      int totalPages,
      AccountTransactionFacetsResponse facets) {}

  /** {@code role}: OUT/IN taşıma satırı, MOVED taşınmış orijinal. */
  public record TransactionTransferResponse(
      UUID transferId, String role, UUID fromAccountId, UUID toAccountId) {}

  public record AccountTransactionDetailResponse(
      AccountTransactionRowResponse row,
      AccountDocumentResponse document,
      UUID reversedById,
      TransactionTransferResponse transfer) {}

  /** Hareketin taban kaynağı; {@code route} uygulamada var olan sayfa, yoksa {@code null}. */
  public record TransactionSourceResponse(
      String sourceType, UUID sourceId, String label, String route) {}

  public record AccountTransactionVoidRequest(
      LocalDate date, @Size(max = 500) String description) {}

  // --- Bakiye kırılımı ve faturalar (12.1 §4.5)

  public record BalanceBreakdownRowResponse(
      String segment,
      String currency,
      UUID companyId,
      UUID branchId,
      BigDecimal debit,
      BigDecimal credit,
      BigDecimal balance,
      BigDecimal tlBalance,
      BigDecimal debt,
      BigDecimal payment,
      BigDecimal receivable,
      BigDecimal collection) {}

  /**
   * Kırılımlı bakiye. Fatura toplamları defter tabanlıdır (12.2 §3.7, S-16/S-19); {@code
   * invoiceGaps} şirket başına satırlar ve {@code companyId = null} konsolide satırdır.
   */
  public record AccountBalanceBreakdownResponse(
      BalanceGroupBy groupBy,
      LocalDate splitDate,
      List<BalanceBreakdownRowResponse> rows,
      List<CurrencyAmountResponse> payableInvoiceTotals,
      List<CurrencyAmountResponse> receivableInvoiceTotals,
      List<AccountInvoiceGapResponse> invoiceGaps) {}

  /**
   * Eksik fatura satırı (12.2 §4.6): PAYABLE = cari alacağı / girilen fatura, RECEIVABLE = cari
   * borcu / kesilen fatura; {@code missing = ledgerTotal − invoiceTotal} (eksi: fatura fazlası).
   */
  public record AccountInvoiceGapResponse(
      UUID accountId,
      InvoiceSide side,
      UUID companyId,
      String currency,
      BigDecimal ledgerTotal,
      BigDecimal invoiceTotal,
      BigDecimal missing) {}

  public record AccountInvoiceRowResponse(
      String kind,
      UUID id,
      String number,
      String documentType,
      String documentTypeName,
      LocalDate invoiceDate,
      LocalDate dueDate,
      BigDecimal netAmount,
      BigDecimal vatAmount,
      BigDecimal withholdingAmount,
      BigDecimal totalAmount,
      String currency,
      boolean reflected,
      String status,
      UUID companyId,
      UUID branchId) {}

  // --- Sezon devri (12.1 §4.6)

  public record AccountRolloverResponse(
      UUID id,
      UUID accountId,
      LocalDate rolloverDate,
      String seasonName,
      boolean active,
      String createdBy,
      Instant createdAt,
      String updatedBy,
      Instant updatedAt,
      int updateCount,
      String deletedBy,
      Instant deletedAt) {}

  /** Alanlar serviste zorunlu denetlenir (400 {@code ROLLOVER_FIELDS_REQUIRED}, ZTO iletisi). */
  public record RolloverRequest(LocalDate rolloverDate, @Size(max = 200) String seasonName) {}

  // --- Cari taşıma (12.1 §4.7)

  /** Taşınacak satıra bağlı çek/senet; {@code role} kaynak carinin çekteki yeri. */
  public record TransferableInstrumentResponse(
      UUID id, InstrumentKind kind, String number, InstrumentStatus status, String role) {}

  public record TransferableTransactionResponse(
      UUID transactionId,
      LocalDate transactionDate,
      TransactionKind kind,
      int sign,
      String documentNo,
      String documentType,
      UUID branchId,
      String branchName,
      UUID companyId,
      Direction direction,
      BigDecimal amount,
      String currency,
      String description,
      List<TransferableInstrumentResponse> instruments,
      UUID instrumentGroup,
      String blockedReason) {}

  public record AccountTransferRequest(
      @NotNull UUID fromAccountId,
      @NotNull UUID toAccountId,
      @Size(max = 500) List<@NotNull UUID> transactionIds,
      @Size(max = 500) String description,
      LocalDate date) {}

  public record AccountTransferReverseRequest(
      LocalDate date, @Size(max = 500) String description) {}

  public record AccountTransferLineResponse(
      UUID id,
      UUID transactionId,
      UUID branchId,
      UUID companyId,
      Direction direction,
      BigDecimal amount,
      String currency,
      boolean active) {}

  public record AccountTransferInstrumentResponse(
      UUID instrumentId,
      InstrumentKind kind,
      String number,
      boolean movedDrawer,
      boolean movedEndorsee,
      boolean reverted) {}

  public record AccountTransferResponse(
      UUID id,
      UUID fromAccountId,
      UUID toAccountId,
      LocalDate transferDate,
      String description,
      AccountTransferStatus status,
      LocalDate reverseDate,
      List<AccountTransferLineResponse> lines,
      List<AccountTransferInstrumentResponse> instruments,
      int checkCount,
      int noteCount,
      List<String> skippedInstruments,
      String createdBy,
      Instant createdAt) {}

  public record AccountTransferHistoryRowResponse(
      UUID transferId,
      UUID lineId,
      LocalDate transferDate,
      String status,
      UUID fromAccountId,
      String fromAccountCode,
      String fromAccountName,
      UUID toAccountId,
      String toAccountCode,
      String toAccountName,
      String kind,
      BigDecimal amount,
      String currency,
      List<String> instrumentNumbers,
      String createdBy) {}
}
