package org.ece.blackrose.finance.web;

import jakarta.validation.Valid;
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
import org.ece.blackrose.finance.domain.FinanceTypes.FundAccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.FundCategory;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.FundTransferType;
import org.ece.blackrose.finance.domain.FinanceTypes.FxCalcMode;
import org.ece.blackrose.finance.domain.FinanceTypes.IntercompanyReason;
import org.ece.blackrose.finance.domain.FinanceTypes.RateOperation;
import org.ece.blackrose.finance.domain.FinanceTypes.TransferCostKind;
import org.ece.blackrose.finance.domain.FinanceTypes.TransferSourceKind;
import org.ece.blackrose.finance.domain.FinanceTypes.TransferStatus;
import org.ece.blackrose.finance.web.AccountDtos.CurrencyAmountResponse;

/**
 * Faz 12.2 banka/kasa uçlarının yeni DTO'ları (12.2_TASARIM §4.1–§4.4). Her yanıt ve iç nesne adlı
 * bir record'dur (ön yüz sözleşme testi adları eşler). Mevcut fon DTO'ları {@link FinanceDtos}'ta
 * kalır.
 */
public final class FundDtos {

  private FundDtos() {}

  // --- Fon tanımları (§4.1)

  public record FundActiveRequest(@NotNull Boolean active) {}

  /**
   * Tekil hesap: {@link FinanceDtos.FundResponse} alanları + denetim bilgisi. {@code accountNo}
   * yalnız {@code FINANCE_MANAGE} yetkisinde düz, diğerlerinde maskelidir.
   */
  public record FundDetailResponse(
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
      BigDecimal balance,
      FundAccountType accountType,
      String accountNo,
      String bankBranchName,
      String description,
      boolean active,
      BigDecimal currentBalance,
      int futureCount,
      BigDecimal futureNet,
      BigDecimal openingBalance,
      LocalDate openingDate,
      long transactionCount,
      String createdBy,
      Instant createdAt,
      String updatedBy,
      Instant updatedAt,
      int updateCount,
      LocalDate lastTransactionDate) {}

  /**
   * Şirket/tür/hesap türü/para birimi kırılımlı özet. {@code count} silinmemiş tüm hesaplar, {@code
   * inactiveCount} bunların pasif olanları; tutarlar pasifleri de içerir.
   */
  public record FundSummaryRowResponse(
      UUID companyId,
      FundKind kind,
      FundAccountType accountType,
      String currency,
      int count,
      int inactiveCount,
      BigDecimal currentBalance,
      BigDecimal balance,
      BigDecimal futureNet,
      BigDecimal openingTotal) {}

  /** Bugüne kadarki son 20 hareketin işaretli tutarı (IN +, OUT −), eskiden yeniye. */
  public record FundSparklineResponse(UUID fundId, List<BigDecimal> points) {}

  public record FundCanDeleteResponse(boolean allowed, List<FundDeleteReasonResponse> reasons) {}

  /** {@code kind}: FUND_TRANSACTION, SETTLEMENT, INSTRUMENT, FUND_TRANSFER, ... */
  public record FundDeleteReasonResponse(String kind, long count) {}

  /** FIFO faaliyet raporu (§3.2.8). */
  public record FundActivityReportResponse(
      FinanceDtos.FundResponse fund,
      LocalDate from,
      LocalDate to,
      BigDecimal opening,
      BigDecimal totalIn,
      BigDecimal totalOut,
      BigDecimal net,
      List<FundActivityInflowResponse> inflows,
      List<FundActivityUnspentResponse> unspent,
      BigDecimal unmatchedOut) {}

  /** Giriş lotu; açılıştan gelen ilk lotta {@code id} null. */
  public record FundActivityInflowResponse(
      int no,
      UUID id,
      LocalDate date,
      String accountingType,
      String description,
      BigDecimal amount,
      BigDecimal remaining,
      List<FundActivityOutflowResponse> outflows) {}

  public record FundActivityOutflowResponse(
      UUID id, LocalDate date, String accountingType, String description, BigDecimal amount) {}

  public record FundActivityUnspentResponse(
      int no,
      LocalDate date,
      String accountingType,
      String description,
      BigDecimal original,
      BigDecimal remaining,
      BigDecimal used) {}

  // --- Fon hareketleri (§4.2)

  /**
   * Hareket merkezi satırı. {@code runningBalance} hesabın gerçek yürüyen bakiyesidir (süzgeçlerden
   * bağımsız). Personel carisi izinsiz kullanıcıya {@code account*} null döner.
   */
  public record FundTransactionRowResponse(
      UUID id,
      UUID fundAccountId,
      String fundCode,
      String fundName,
      String bankName,
      FundKind kind,
      FundAccountType accountType,
      UUID companyId,
      UUID branchId,
      String currency,
      LocalDate transactionDate,
      FundDirection direction,
      BigDecimal amount,
      BigDecimal exchangeRate,
      BigDecimal tlAmount,
      BigDecimal runningBalance,
      String description,
      String sourceType,
      UUID sourceId,
      String accountingType,
      String transferCode,
      FundCategory category,
      UUID accountId,
      String accountCode,
      String accountName,
      boolean reversal,
      boolean reversed,
      String createdBy,
      Instant createdAt) {}

  public record FundTransactionPageResponse(
      List<FundTransactionRowResponse> content,
      int page,
      int size,
      long totalElements,
      int totalPages,
      FundTransactionSummaryResponse summary) {}

  /** {@code periodOpening}/{@code periodClosing} yalnız tek hesap seçiliyken dolu. */
  public record FundTransactionSummaryResponse(
      List<FundCurrencyTotalResponse> currencies,
      BigDecimal periodOpening,
      BigDecimal periodClosing) {}

  public record FundCurrencyTotalResponse(
      String currency, BigDecimal totalIn, BigDecimal totalOut, BigDecimal net, long count) {}

  /** Hareket detayı: {@link FundTransactionRowResponse} alanları + hesap + kaynak belge. */
  public record FundTransactionDetailResponse(
      UUID id,
      UUID fundAccountId,
      String fundCode,
      String fundName,
      String bankName,
      FundKind kind,
      FundAccountType accountType,
      UUID companyId,
      UUID branchId,
      String currency,
      LocalDate transactionDate,
      FundDirection direction,
      BigDecimal amount,
      BigDecimal exchangeRate,
      BigDecimal tlAmount,
      BigDecimal runningBalance,
      String description,
      String sourceType,
      UUID sourceId,
      String accountingType,
      String transferCode,
      FundCategory category,
      UUID accountId,
      String accountCode,
      String accountName,
      boolean reversal,
      boolean reversed,
      String createdBy,
      Instant createdAt,
      FundRefResponse fund,
      FundSourceRefResponse source) {

    public static FundTransactionDetailResponse of(
        FundTransactionRowResponse r, FundRefResponse fund, FundSourceRefResponse source) {
      return new FundTransactionDetailResponse(
          r.id(),
          r.fundAccountId(),
          r.fundCode(),
          r.fundName(),
          r.bankName(),
          r.kind(),
          r.accountType(),
          r.companyId(),
          r.branchId(),
          r.currency(),
          r.transactionDate(),
          r.direction(),
          r.amount(),
          r.exchangeRate(),
          r.tlAmount(),
          r.runningBalance(),
          r.description(),
          r.sourceType(),
          r.sourceId(),
          r.accountingType(),
          r.transferCode(),
          r.category(),
          r.accountId(),
          r.accountCode(),
          r.accountName(),
          r.reversal(),
          r.reversed(),
          r.createdBy(),
          r.createdAt(),
          fund,
          source);
    }
  }

  /** {@code accountNo} maskeli. */
  public record FundRefResponse(
      UUID id,
      String code,
      String name,
      String bankName,
      String iban,
      String accountNo,
      String bankBranchName,
      String currency) {}

  /** Taban kaynak belge; {@code route} uygulamada açılabilen sayfa (yoksa null). */
  public record FundSourceRefResponse(String kind, UUID id, String code, String route) {}

  // --- Transfer merkezi (§4.3)

  /** Transferler sekmesi satır türü. */
  public enum TransferRecordType {
    FUND_TRANSFER,
    INTERCOMPANY
  }

  /** Döviz bozumunun bağlı tahsilat durumu (ilk tahsilat kaynağının kalanına göre). */
  public enum TransferCollectionState {
    COMPLETE,
    PARTIAL,
    PENDING,
    CANCELLED,
    NONE
  }

  /** Transfer özeti grupları; VIREMENT+EFT+WIRE tek grup (ZTO B12 düzeltmesi). */
  public enum TransferSummaryGroup {
    VIREMENT_EFT_WIRE,
    FX_EXCHANGE,
    BANK_TO_CASH,
    CASH_TO_BANK,
    CASH_TO_CASH,
    INTERCOMPANY,
    TOTAL
  }

  /**
   * Şirket içi transfer. {@code transferType} boşsa eski MUI gövdesi: tür hesap türlerinden
   * türetilir, ZTO kuralları uygulanmaz. Döviz bozumunda {@code targetMoney}, {@code rate} ve
   * {@code rateOperation} zorunludur; {@code sources} yalnız döviz bozumunda verilebilir.
   */
  public record FundTransferRequest(
      FundTransferType transferType,
      @NotNull UUID fromFundId,
      @NotNull UUID toFundId,
      @NotNull @Valid Money money,
      @Valid Money targetMoney,
      @Positive BigDecimal rate,
      RateOperation rateOperation,
      FxCalcMode calcMode,
      @NotNull LocalDate date,
      @Size(max = 50) String documentNo,
      @Size(max = 500) String description,
      @Positive BigDecimal exchangeRate,
      @Size(max = 3) List<@Valid TransferCostRequest> costs,
      @Size(max = 50) List<@Valid TransferSourceRequest> sources) {}

  /**
   * Masraf: Komisyon/Masraf {@code amount}, KMV {@code ratePercent} (0–10) ile; boş ya da 0 ise
   * atlanır. {@code fundAccountId} boşsa kaynak fon (KMV'de TL taraftaki fon).
   */
  public record TransferCostRequest(
      @NotNull TransferCostKind kind,
      UUID fundAccountId,
      @PositiveOrZero BigDecimal amount,
      @PositiveOrZero BigDecimal ratePercent) {}

  /** Döviz bozumu kaynağı: tahsilat ({@code SETTLEMENT}) ya da önceki bozum ({@code TRANSFER}). */
  public record TransferSourceRequest(
      @NotNull TransferSourceKind kind,
      @NotNull UUID id,
      @NotNull @Positive BigDecimal usedAmount) {}

  /** Düzenleme: eski transfer eski tarihiyle iptal edilir, yeni kodla yenisi yazılır. */
  public record ReplaceTransferRequest(
      @NotNull @Valid FundTransferRequest transfer, @Size(max = 500) String reason) {}

  /** İptal tarihi {@code transferDate ≤ date ≤ max(bugün, transferDate)}. */
  public record ReverseTransferRequest(@NotNull LocalDate date, @Size(max = 500) String reason) {}

  /** Görünmeyen taraftaki fonun kod/adı {@code null}; {@code transferId} = {@code id}. */
  public record FundTransferResponse(
      UUID id,
      UUID transferId,
      String code,
      UUID companyId,
      FundTransferType transferType,
      LocalDate transferDate,
      UUID fromFundId,
      String fromFundCode,
      String fromFundName,
      UUID toFundId,
      String toFundCode,
      String toFundName,
      Money money,
      Money targetMoney,
      BigDecimal rate,
      RateOperation rateOperation,
      FxCalcMode calcMode,
      BigDecimal fxDiffTl,
      String documentNo,
      String description,
      TransferStatus status,
      LocalDate reversedAt,
      String reversalReason,
      UUID replacesTransferId,
      UUID replacedByTransferId,
      List<TransferCostResponse> costs,
      List<TransferSourceResponse> sources,
      String createdBy,
      Instant createdAt) {}

  public record TransferCostResponse(
      UUID id,
      TransferCostKind kind,
      UUID fundAccountId,
      BigDecimal ratePercent,
      BigDecimal baseAmount,
      Money money) {}

  /** {@code code}: tahsilatta açıklama, önceki bozumda transfer kodu. */
  public record TransferSourceResponse(
      UUID id,
      TransferSourceKind kind,
      UUID sourceId,
      String code,
      LocalDate date,
      BigDecimal amount,
      BigDecimal usedAmount) {}

  /** Transferler sekmesi satırı (şirket içi + şirketler arası). */
  public record TransferListRowResponse(
      TransferRecordType recordType,
      UUID id,
      String code,
      FundTransferType transferType,
      IntercompanyReason reasonType,
      LocalDate transferDate,
      UUID companyId,
      UUID toCompanyId,
      UUID fromFundId,
      String fromFundCode,
      String fromFundName,
      FundKind fromKind,
      UUID fromBranchId,
      UUID toFundId,
      String toFundCode,
      String toFundName,
      FundKind toKind,
      UUID toBranchId,
      Money sourceMoney,
      Money targetMoney,
      BigDecimal rate,
      RateOperation rateOperation,
      BigDecimal costTotalTl,
      String costFundNames,
      TransferCollectionResponse collection,
      String description,
      TransferStatus status,
      String documentNo) {}

  public record TransferCollectionResponse(
      UUID settlementId,
      LocalDate date,
      BigDecimal amount,
      UUID accountId,
      String accountName,
      TransferCollectionState state) {}

  public record TransferSummaryRowResponse(
      TransferSummaryGroup group, long count, List<CurrencyAmountResponse> amounts) {}

  /** Bu transferi kaynak kullanan geçerli döviz bozumu; görünmeyen fonun adı {@code null}. */
  public record TransferDependentResponse(
      UUID transferId,
      String code,
      LocalDate date,
      String sourceFundName,
      String targetFundName,
      BigDecimal usedAmount) {}

  /** Önceki döviz bozumundan kalan (Önceki Döviz Bozum Kaynakları). */
  public record FxSourceResponse(
      UUID transferId,
      String code,
      LocalDate date,
      String sourceFundName,
      BigDecimal deposited,
      BigDecimal used,
      BigDecimal remaining) {}

  public record FxCandidateAccountResponse(
      UUID accountId,
      String accountCode,
      String accountName,
      int collectionCount,
      BigDecimal remainingTotal) {}

  public record FxCandidateCollectionResponse(
      UUID settlementId,
      LocalDate date,
      BigDecimal amount,
      BigDecimal broken,
      BigDecimal remaining,
      String description) {}

  public record FxReportResponse(
      FxReportStatsResponse stats,
      List<FxReportRowResponse> rows,
      List<FxUnbrokenCollectionResponse> unbrokenCollections) {}

  public record FxReportStatsResponse(
      long collectionCount,
      long fxCount,
      long fxWithoutCollection,
      long unbrokenCollectionCount,
      List<CurrencyAmountResponse> totalBroken) {}

  /** {@code level}: tahsilattan doğrudan 1, önceki bozumdan önceki + 1. */
  public record FxReportRowResponse(
      UUID transferId,
      String code,
      LocalDate date,
      int level,
      String sourceFundName,
      Money sourceMoney,
      String targetFundName,
      Money targetMoney,
      BigDecimal rate,
      RateOperation rateOperation,
      BigDecimal fxDiffTl,
      TransferStatus status,
      List<FxReportSourceResponse> sources) {}

  public record FxReportSourceResponse(
      TransferSourceKind kind,
      UUID id,
      String code,
      LocalDate date,
      String accountName,
      BigDecimal amount,
      BigDecimal used) {}

  public record FxUnbrokenCollectionResponse(
      UUID settlementId, LocalDate date, String accountName, Money money) {}

  // --- Şirketler arası virman (§4.4)

  public record IntercompanyTransferRequest(
      @NotNull FundTransferType transferType,
      @NotNull IntercompanyReason reasonType,
      @NotNull UUID fromFundId,
      @NotNull UUID toFundId,
      @NotNull @Valid Money money,
      @NotNull LocalDate date,
      @Size(max = 50) String documentNo,
      @Size(max = 500) String description) {}

  /**
   * {@code description} kullanıcı açıklaması; {@code reasonText} sunucunun kurduğu neden metni.
   * Görünmeyen tarafın fon kod/adı ve iş yeri {@code null}.
   */
  public record IntercompanyTransferResponse(
      UUID id,
      String code,
      FundTransferType transferType,
      IntercompanyReason reasonType,
      LocalDate transferDate,
      UUID fromCompanyId,
      UUID toCompanyId,
      UUID fromBranchId,
      UUID toBranchId,
      UUID fromFundId,
      String fromFundCode,
      String fromFundName,
      UUID toFundId,
      String toFundCode,
      String toFundName,
      Money money,
      UUID paymentSettlementId,
      UUID collectionSettlementId,
      String documentNo,
      String description,
      String reasonText,
      TransferStatus status,
      LocalDate reversedAt,
      String reversalReason,
      String createdBy,
      Instant createdAt) {}
}
