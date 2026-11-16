package org.ece.blackrose.finance.web;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.web.NullableInSchema;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentSide;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;

/**
 * Faz 12.8 finans raporu ve kur farkı DTO'ları (12.8_TASARIM §4). Para ve oran alanları ondalık
 * metindir (12.2a §4.4); null olabilen alanlar {@link NullableInSchema} ile işaretlidir ({@link
 * FinanceOpenApiNullability#HOLDERS}). Şema adları başka DTO kabında yoktur.
 */
public final class FinanceReportDtos {

  private FinanceReportDtos() {}

  // --- ortak

  /** Rapor kuru: TCMB döviz alış (admin.exchange_rate), tarih ya da öncesindeki son kur. */
  public record ReportRateResponse(
      String currency,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "34.123400")
          BigDecimal rate,
      LocalDate rateDate) {}

  // --- genel bakış ve liste (12.8 §3.4.3–§3.4.4)

  /** FinanceReport genel bakış: {@code to} tarihindeki kapanış (OK-12.8-14). */
  public record LedgerSummaryResponse(
      @NullableInSchema LocalDate from,
      LocalDate to,
      List<LedgerSummaryRowResponse> rows,
      boolean personnelHidden) {}

  /** Tür × para birimi; {@code reportType} null = Rapor dışı. Netleşme cari × şirket × PB (Y1). */
  public record LedgerSummaryRowResponse(
      @NullableInSchema String reportType,
      String currency,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal weOwe,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal theyOwe,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal net,
      int openAccounts) {}

  /** FinanceReport liste kipi (OK-12.8-28). */
  public record LedgerAccountsResponse(
      String reportType,
      AccountDocumentSide side,
      @NullableInSchema LocalDate from,
      LocalDate to,
      long postPeriodCount,
      List<LedgerAccountRowResponse> rows) {}

  /** Cari × şirket × para birimi satırı (Rev 1 F3). */
  public record LedgerAccountRowResponse(
      UUID accountId,
      String accountCode,
      String accountName,
      String accountType,
      String subGroup,
      String subGroupName,
      boolean active,
      UUID companyId,
      String companyName,
      String currency,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal opening,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal debt,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal payment,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal receivable,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal penalty,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal collection,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal closing,
      @NullableInSchema LocalDate lastSettlementDate,
      @NullableInSchema
          @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal lastSettlementAmount,
      @NullableInSchema LocalDate lastMovementDate) {}

  /** Cari ekstre ödeme/tahsilat yöntem kırılımı ({@code CASH|BANK|CHECK|NOTE|CREDIT_CARD}). */
  public record AccountMethodTotalResponse(
      String type,
      String method,
      String currency,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal amount) {}

  // --- finansal bilanço (12.8 §3.4.5)

  /**
   * Bilanço: genel toplamlar şirket düzeyi brüttür (Rev 1 F2); iş yeri kartı iş yeri görünümüdür.
   */
  public record BalanceSheetResponse(
      LocalDate asOf,
      @NullableInSchema LocalDate rateDate,
      List<ReportRateResponse> rates,
      List<String> missingRates,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal assetsTl,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal liabilitiesTl,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal netTl,
      int workplaceCount,
      List<BalanceSheetCompanyResponse> companies,
      List<BalanceSheetWorkplaceResponse> workplaces,
      List<BalanceSheetIntercompanyResponse> intercompany,
      boolean creditDepositPending) {}

  /** Şirket özeti (Rev 1 F2). */
  public record BalanceSheetCompanyResponse(
      UUID companyId,
      String companyName,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal assetsTl,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal liabilitiesTl,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal netTl) {}

  /** İş yeri kartı (OK-12.8-24). */
  public record BalanceSheetWorkplaceResponse(
      UUID branchId,
      String branchName,
      @NullableInSchema String branchGroupName,
      UUID companyId,
      String companyName,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal assetsTl,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal liabilitiesTl,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal netTl,
      int currencyCount,
      int accountCount,
      List<BalanceSheetCurrencyResponse> currencies,
      List<BalanceSheetAccountResponse> accounts) {}

  /** İş yeri × para birimi bloğu; {@code fxAdjustment} yalnız TRY'de (Rev 1 F1). */
  public record BalanceSheetCurrencyResponse(
      String currency,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal debt,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal payment,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal receivable,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal collection,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal bank,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal cash,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal receivedChecks,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal receivedNotes,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal issuedChecks,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal issuedNotes,
      int receivedCheckCount,
      int receivedNoteCount,
      int issuedCheckCount,
      int issuedNoteCount,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal accountReceivable,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal accountPayable,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal bankOverdraft,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal fxAdjustment,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal net,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal assets,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal liabilities,
      @NullableInSchema
          @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal tlAssets,
      @NullableInSchema
          @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal tlLiabilities) {}

  /** İş yeri cari satırı; personel carisi izinsiz kullanıcıda maskeli (OK-12.8-18). */
  public record BalanceSheetAccountResponse(
      @NullableInSchema UUID accountId,
      @NullableInSchema String accountCode,
      @NullableInSchema String accountName,
      String subGroupName,
      boolean masked,
      List<ReportCurrencyAmountResponse> balances) {}

  /** İşaretli tutar (Blackrose: + cari bize borçlu). */
  public record ReportCurrencyAmountResponse(
      String currency,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal amount) {}

  /** Grup şirketi carisi bakiyesi (OK-12.8-11); toplamlara girmez. */
  public record BalanceSheetIntercompanyResponse(
      UUID accountId,
      String accountName,
      UUID representsCompanyId,
      UUID companyId,
      List<ReportCurrencyAmountResponse> balances) {}

  // --- hazine (12.8 §3.4.6)

  /** Hızlı Bakiye Özeti. */
  public record TreasuryResponse(
      Instant generatedAt,
      @NullableInSchema LocalDate rateDate,
      List<ReportRateResponse> rates,
      List<String> missingRates,
      List<TreasuryFundResponse> banks,
      List<TreasuryFundResponse> cashes,
      List<TreasuryInstrumentResponse> pendingChecks,
      List<TreasuryInstrumentResponse> pendingBills,
      List<TreasuryCurrencyResponse> byCurrency,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal bankTl,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal cashTl,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal checkTl,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal noteTl,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal netTl,
      List<TreasuryDailyResponse> bankDaily,
      List<TreasuryDailyResponse> cashDaily,
      List<TreasuryDueBucketResponse> dueBuckets,
      boolean creditDepositPending) {}

  /** Banka/kasa hesabı satırı (IBAN fon listesindeki gibi; OK-12.2-18). */
  public record TreasuryFundResponse(
      UUID fundAccountId,
      FundKind kind,
      UUID branchId,
      String branchName,
      @NullableInSchema String branchGroupName,
      String code,
      String name,
      @NullableInSchema String bankName,
      @NullableInSchema String bankBranchName,
      @NullableInSchema String accountNoMasked,
      @NullableInSchema String iban,
      String currency,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal balance,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal in30,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal out30,
      int checkCount,
      int noteCount,
      boolean active) {}

  /**
   * Bekleyen çek/senet; personel carisinde ad ve keşideci izinsiz kullanıcıya boş (SEC-12.8-02).
   */
  public record TreasuryInstrumentResponse(
      UUID instrumentId,
      InstrumentKind kind,
      InstrumentDirection direction,
      String number,
      @NullableInSchema String bankName,
      @NullableInSchema String bankBranch,
      @NullableInSchema String accountName,
      boolean masked,
      @NullableInSchema String drawerName,
      @NullableInSchema String noteType,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal amount,
      String currency,
      LocalDate dueDate,
      int daysLeft,
      InstrumentStatus status) {}

  /** Para birimi kartı. */
  public record TreasuryCurrencyResponse(
      String currency,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal bank,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal cash,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal receivedChecks,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal issuedChecks,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal receivedNotes,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal issuedNotes,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal net) {}

  /** Son 30 gün gün başına giriş/çıkış (TL; hareketin kendi kuru). */
  public record TreasuryDailyResponse(
      LocalDate date,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal inTl,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal outTl) {}

  /** Önümüzdeki 6 ay vade dağılımı ({@code month} = YYYY-MM; vadesi geçmişler bu ayda). */
  public record TreasuryDueBucketResponse(
      String month,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal checksTl,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal notesTl) {}

  // --- nakit akışı, performans, pozisyon (12.8 §3.4.7–§3.4.10)

  /** Haftalık nakit akışı; {@code currency} null = TL karşılığı (OK-12.8-9). */
  public record CashFlowResponse(
      LocalDate today,
      int weeks,
      @NullableInSchema String currency,
      @NullableInSchema LocalDate rateDate,
      List<String> missingRates,
      List<CashFlowWeekResponse> rows,
      boolean planExcluded) {}

  /** Hafta satırı; {@code payableDue} yalnız API'de. */
  public record CashFlowWeekResponse(
      int index,
      LocalDate weekStart,
      LocalDate weekEnd,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal receivableDue,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal receivedChecks,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal issuedChecks,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal notesInfo,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal payableDue,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal net,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal cumulative) {}

  /** Cari bazlı ödeme performansı; gecikme eşleşme (allocation) başına (OK-12.8-20). */
  public record AccountPerformanceRowResponse(
      UUID accountId,
      String accountCode,
      String accountName,
      String subGroupName,
      String currency,
      long paymentCount,
      long collectionCount,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal paymentAmount,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal collectionAmount,
      @NullableInSchema
          @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "1.5")
          BigDecimal avgDelayDays,
      long lateCount,
      long onTimeCount,
      long unmatchedCount,
      @NullableInSchema Integer score) {}

  /** Döviz pozisyonu satırı; {@code byCompany} iken şirket dolu (Rev 1 F3). */
  public record CurrencyPositionRowResponse(
      String currency,
      @NullableInSchema UUID companyId,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal cash,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal receivable,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal payable,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "100.00")
          BigDecimal net) {}

  // --- kur farkı (12.8 §3.2, Y8)

  /** Kur farkı raporu kesim süzgeci: tümü, kesilmemiş, kesilmiş. */
  public enum FxCutState {
    ALL,
    OPEN,
    CUT
  }

  /** Kur farkının cariye etkisi (Blackrose işareti; bize borçlu cari için artış kazançtır). */
  public enum FxEffect {
    GAIN,
    LOSS,
    NONE
  }

  /**
   * Satırda kesimi engelleyen değerleme durumu (Rev 1 F4/F7): kaynak değerleme tarihinden sonra ya
   * da değerleme tarihinden önce FIFO'da kapanmış. Doluysa kur alanları boştur.
   */
  public enum FxValuationBlock {
    AFTER_VALUATION,
    SETTLED
  }

  /**
   * Elle onaylı kur farkı kesimi. {@code expectedDifference} ekranda gösterilen işaretli farktır;
   * sunucunun hesapladığıyla eşit değilse 409 {@code FX_DIFFERENCE_CHANGED}.
   */
  public record FxDifferenceRequest(
      @NotNull UUID sourceTransactionId,
      @NotNull LocalDate valuationDate,
      @NotNull
          @Digits(integer = 17, fraction = 4)
          @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "125.50")
          BigDecimal expectedDifference,
      @NullableInSchema @Size(max = 500) String description) {}

  public record FxDifferenceReportResponse(
      LocalDate valuationDate,
      boolean withRates,
      List<String> missingRates,
      List<FxDifferenceRowResponse> rows,
      int page,
      int size,
      long totalElements,
      int totalPages) {}

  public record FxDifferenceRowResponse(
      UUID transactionId,
      UUID accountId,
      String accountCode,
      String accountName,
      boolean accountActive,
      UUID companyId,
      UUID branchId,
      Direction direction,
      LocalDate transactionDate,
      String sourceType,
      @NullableInSchema String documentNo,
      @NullableInSchema String documentTypeName,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "1000.00")
          BigDecimal amount,
      String currency,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "0.200000")
          BigDecimal transactionRate,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "200.00")
          BigDecimal tlAmount,
      @NullableInSchema
          @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "0.250000")
          BigDecimal currentRate,
      @NullableInSchema LocalDate currentRateDate,
      @NullableInSchema
          @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "250.00")
          BigDecimal currentTl,
      @NullableInSchema
          @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "50.00")
          BigDecimal difference,
      @NullableInSchema FxEffect effect,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "1000.00")
          BigDecimal openRemaining,
      @NullableInSchema LocalDate closedOn,
      @NullableInSchema FxValuationBlock valuationBlock,
      @NullableInSchema FxDifferenceCutResponse cut) {}

  /** Satırın açık (iptal edilmemiş) kur farkı belgesi. */
  public record FxDifferenceCutResponse(
      UUID documentId,
      String documentNo,
      AccountDocumentSide side,
      @JsonFormat(shape = JsonFormat.Shape.STRING)
          @Schema(type = "string", format = "decimal", example = "50.00")
          BigDecimal amount,
      LocalDate documentDate) {}
}
