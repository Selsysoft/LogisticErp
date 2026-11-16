package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.AccountDocument;
import org.ece.blackrose.finance.domain.AccountTransaction;
import org.ece.blackrose.finance.domain.ExchangeRate;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentSide;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.IncomeExpenseDirection;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountDocumentRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountTransferLineRepository;
import org.ece.blackrose.finance.repository.FinanceReportRepositories;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.FxCandidateQuery;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.FxCandidateRow;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.FxSettlement;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.ExchangeRateRepository;
import org.ece.blackrose.finance.service.AccountDocumentService.FxDocumentCommand;
import org.ece.blackrose.finance.service.ExchangeRateService.Conversion;
import org.ece.blackrose.finance.web.AccountDtos.AccountDocumentResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.FxCutState;
import org.ece.blackrose.finance.web.FinanceReportDtos.FxDifferenceCutResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.FxDifferenceReportResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.FxDifferenceRequest;
import org.ece.blackrose.finance.web.FinanceReportDtos.FxDifferenceRowResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.FxEffect;
import org.ece.blackrose.finance.web.FinanceReportDtos.FxValuationBlock;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Kur farkı raporu ve kullanıcı onaylı elle kesim (04 §6.2-Y8; 12.8_TASARIM §3.2). Rapor salt
 * okumadır; kesim kaynak başına tek açık {@code KUR_FARKI} belgesi yazar ({@link
 * AccountDocumentService#createFxDifference}). Kaynağın TL karşılığı hiç değişmez; kur sunucuda
 * değerleme tarihinden okunur (OK-12.8-5), istemci yalnız onayladığı farkı gönderir.
 */
@Service
public class FxDifferenceService {

  /** Raporun en çok sayfa boyutu (OK-12.8-22). */
  static final int MAX_PAGE_SIZE = 2000;

  static final int MAX_PAGE = 100_000;

  static final int MAX_DOCUMENT_NO = 50;

  private static final BigDecimal CENT = new BigDecimal("0.01");
  private static final Locale TR = Locale.forLanguageTag("tr-TR");

  /** Rapor süzgeci (§3.2.2); boş alanlar "tümü", {@code valuationDate} boşsa bugün. */
  public record FxReportQuery(
      UUID companyId,
      List<UUID> branchIds,
      UUID accountId,
      String currency,
      LocalDate from,
      LocalDate to,
      FxCutState cutState,
      LocalDate valuationDate,
      boolean withRates) {}

  private final FinanceReportRepositories reports;
  private final AccountTransactionRepository transactions;
  private final AccountRepository accounts;
  private final AccountDocumentRepository documents;
  private final AccountTransferLineRepository transferLines;
  private final AccountDocumentService documentService;
  private final ExchangeRateService rates;
  private final ExchangeRateRepository rateRows;
  private final AccountAccess access;
  private final CompanyIdentityRule identityRule;
  private final BranchScopeService scope;
  private final TenantClock clock;

  @SuppressWarnings("java:S107")
  public FxDifferenceService(
      FinanceReportRepositories reports,
      AccountTransactionRepository transactions,
      AccountRepository accounts,
      AccountDocumentRepository documents,
      AccountTransferLineRepository transferLines,
      AccountDocumentService documentService,
      ExchangeRateService rates,
      ExchangeRateRepository rateRows,
      AccountAccess access,
      CompanyIdentityRule identityRule,
      BranchScopeService scope,
      TenantClock clock) {
    this.reports = reports;
    this.transactions = transactions;
    this.accounts = accounts;
    this.documents = documents;
    this.transferLines = transferLines;
    this.documentService = documentService;
    this.rates = rates;
    this.rateRows = rateRows;
    this.access = access;
    this.identityRule = identityRule;
    this.scope = scope;
    this.clock = clock;
  }

  // --- rapor (§3.2.2)

  @Transactional(readOnly = true)
  public FxDifferenceReportResponse report(FxReportQuery q, int page, int size) {
    if (page < 0 || page > MAX_PAGE || size < 1) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "PAGE_INVALID", "Sayfa parametreleri geçersiz.");
    }
    int pageSize = Math.min(size, MAX_PAGE_SIZE);
    long offset = Math.multiplyExact((long) page, pageSize);
    BranchFilter filter = scope.filter(q.companyId(), q.branchIds());
    if (q.accountId() != null) {
      access.readable(q.accountId());
    }
    if (q.from() != null && q.to() != null && q.to().isBefore(q.from())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "PERIOD_INVALID", "Bitiş tarihi başlangıçtan önce olamaz.");
    }
    LocalDate today = clock.today();
    LocalDate valuationDate = q.valuationDate() == null ? today : q.valuationDate();
    if (valuationDate.isAfter(today)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "FX_DATE_INVALID", "Kur tarihi ileri bir tarih olamaz.");
    }
    FxCandidateQuery candidateQuery =
        new FxCandidateQuery(
            filter,
            access.employeeVisible(),
            q.accountId(),
            blankToNull(q.currency()),
            q.from(),
            q.to(),
            (q.cutState() == null ? FxCutState.ALL : q.cutState()).name());
    List<FxCandidateRow> candidates = reports.fxCandidates(candidateQuery, pageSize, offset);
    long total = reports.fxCandidateCount(candidateQuery);
    Map<UUID, FxSettlement> settlements =
        reports.fxSettlements(candidates.stream().map(FxCandidateRow::id).toList(), valuationDate);
    Map<String, ExchangeRate> latest =
        q.withRates()
            ? rateRows.findLatestOnOrBefore(valuationDate).stream()
                .collect(Collectors.toMap(ExchangeRate::getCurrency, Function.identity()))
            : Map.of();
    List<String> missing = new ArrayList<>();
    List<FxDifferenceRowResponse> rows = new ArrayList<>();
    for (FxCandidateRow row : candidates) {
      FxSettlement settlement = settlements.get(row.id());
      FxValuationBlock block = valuationBlock(row.transactionDate(), settlement, valuationDate);
      ExchangeRate rate = q.withRates() && block == null ? latest.get(row.currency()) : null;
      if (q.withRates() && block == null && rate == null && !missing.contains(row.currency())) {
        missing.add(row.currency());
      }
      rows.add(toRow(row, settlement, block, rate));
    }
    int totalPages = (int) Math.min(Integer.MAX_VALUE, (total + pageSize - 1) / pageSize);
    return new FxDifferenceReportResponse(
        valuationDate, q.withRates(), missing, rows, page, pageSize, total, totalPages);
  }

  /**
   * Değerleme durumu (§3.2.1a): kaynak değerleme tarihinden sonraysa {@code AFTER_VALUATION},
   * değerleme tarihinden önce FIFO'da tamamen kapandıysa {@code SETTLED}; kapanış günü değerleme
   * günüyle aynıysa engel yoktur.
   */
  static FxValuationBlock valuationBlock(
      LocalDate transactionDate, FxSettlement settlement, LocalDate valuationDate) {
    if (transactionDate.isAfter(valuationDate)) {
      return FxValuationBlock.AFTER_VALUATION;
    }
    if (settlement != null
        && settlement.closedOn() != null
        && settlement.closedOn().isBefore(valuationDate)) {
      return FxValuationBlock.SETTLED;
    }
    return null;
  }

  /** Etki: |fark| &lt; 0,01 yok; bize borçlu (DEBIT) kaynakta artış, borcumuzda düşüş kazançtır. */
  static FxEffect effect(Direction direction, BigDecimal difference) {
    if (difference.abs().compareTo(CENT) < 0) {
      return FxEffect.NONE;
    }
    return (direction == Direction.DEBIT) == (difference.signum() > 0)
        ? FxEffect.GAIN
        : FxEffect.LOSS;
  }

  private FxDifferenceRowResponse toRow(
      FxCandidateRow row, FxSettlement settlement, FxValuationBlock block, ExchangeRate rate) {
    BigDecimal currentTl = rate == null ? null : rates.tlAt(row.amount(), rate.getRate());
    BigDecimal difference = currentTl == null ? null : currentTl.subtract(row.tlAmount());
    Direction direction = Direction.valueOf(row.direction());
    FxDifferenceCutResponse cut =
        row.cutId() == null
            ? null
            : new FxDifferenceCutResponse(
                row.cutId(),
                row.cutNo(),
                AccountDocumentSide.valueOf(row.cutSide()),
                row.cutAmount(),
                row.cutDate());
    return new FxDifferenceRowResponse(
        row.id(),
        row.accountId(),
        row.accountCode(),
        row.accountName(),
        row.accountActive(),
        row.companyId(),
        row.branchId(),
        direction,
        row.transactionDate(),
        row.sourceType(),
        row.documentNo(),
        row.documentTypeName(),
        row.amount(),
        row.currency(),
        row.exchangeRate(),
        row.tlAmount(),
        rate == null ? null : rate.getRate(),
        rate == null ? null : rate.getRateDate(),
        currentTl,
        difference,
        difference == null ? null : effect(direction, difference),
        settlement == null ? BigDecimal.ZERO : settlement.openRemaining(),
        settlement == null ? null : settlement.closedOn(),
        block,
        cut);
  }

  // --- kesim (§3.2.3)

  @Transactional
  public AccountDocumentResponse cut(FxDifferenceRequest r, String idempotencyKey) {
    // 1. Tekrar: önce erişim, sonra kaynak karşılaştırması (SEC-12.8-01).
    if (idempotencyKey != null) {
      Optional<AccountDocumentResponse> replay =
          documentService.replayFx(idempotencyKey, r.sourceTransactionId());
      if (replay.isPresent()) {
        return replay.get();
      }
    }
    // 2–3. Kaynak ve cari; personel carisi izinsize yok sayılır.
    AccountTransaction src =
        transactions
            .findById(r.sourceTransactionId())
            .filter(tx -> !tx.isDeleted())
            .orElseThrow(FxDifferenceService::sourceNotFound);
    Account account =
        accounts.findById(src.getAccountId()).orElseThrow(FxDifferenceService::sourceNotFound);
    if (account.getType() == AccountType.EMPLOYEE && !access.employeeVisible()) {
      throw sourceNotFound();
    }
    // 4. Kapsam (istemciden iş yeri/şirket alınmaz).
    scope.requireNew(src.getBranchId());
    // 5. Kilit sırası kart → hareket (12.1 §3.11).
    account = access.usableLocked(src.getAccountId());
    src = transactions.findForUpdate(src.getId()).orElseThrow(FxDifferenceService::sourceNotFound);
    // 6. Kart–şirket kuralı (OK-12.8-7).
    identityRule.require(account, src.getCompanyId());
    // 7. Uygunluk (kilit altında).
    requireEligible(src, account);
    // 8. Tarih.
    LocalDate valuationDate = r.valuationDate();
    if (valuationDate.isAfter(clock.today()) || valuationDate.isBefore(src.getTransactionDate())) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "FX_DATE_INVALID",
          "Kur tarihi hareket tarihinden önce ya da ileri bir tarih olamaz.");
    }
    // 8a. FIFO kapanışı (Rev 1 F4): gerçekleşmiş farkın tarihi kapanış günüdür.
    Optional<FxSettlement> settlement = reports.fxSettlement(src.getId(), valuationDate);
    LocalDate closedOn = settlement.map(FxSettlement::closedOn).orElse(null);
    if (closedOn != null && closedOn.isBefore(valuationDate)) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "FX_SOURCE_SETTLED",
          "Kaynak " + closedOn + " tarihinde kapandı; kur tarihi en çok bu tarih olabilir.",
          List.of("closedOn=" + closedOn));
    }
    // 9–11. Kur, fark ve onaylanan farkla karşılaştırma.
    Conversion c = rates.convert(src.getMoney(), valuationDate, null);
    BigDecimal diff = c.tlAmount().subtract(src.getTlAmount());
    if (diff.abs().compareTo(CENT) < 0) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "FX_DIFFERENCE_ZERO",
          "Kur farkı 0 — kayıt oluşturulmadı.");
    }
    if (r.expectedDifference().compareTo(diff) != 0) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "FX_DIFFERENCE_CHANGED",
          "Kur farkı değişti; raporu yenileyin.",
          List.of(
              "difference=" + diff.toPlainString(),
              "rate=" + c.rate().toPlainString(),
              "rateDate=" + c.rateDate()));
    }
    // 12. Yön.
    Direction docDir = documentDirection(src.getDirection(), diff);
    AccountDocumentSide side =
        docDir == Direction.DEBIT ? AccountDocumentSide.RECEIVABLE : AccountDocumentSide.PAYABLE;
    IncomeExpenseDirection ieDir =
        docDir == Direction.DEBIT ? IncomeExpenseDirection.INCOME : IncomeExpenseDirection.EXPENSE;
    // 13–14. Belge no ve açıklama.
    String sourceNo = reports.documentNoOf(src.getId()).map(String::trim).orElse(null);
    String documentNo = documentNo(sourceNo, src.getId());
    String description =
        r.description() != null && !r.description().isBlank()
            ? r.description().trim()
            : description(src, c.rate(), sourceNo);
    // 15. Belge + defter + gelir/gider.
    return documentService.createFxDifference(
        new FxDocumentCommand(
            src,
            side,
            diff.abs(),
            diff,
            valuationDate,
            documentNo,
            LedgerDescriptions.fit(description),
            c.rate(),
            c.rateDate(),
            ieDir),
        idempotencyKey);
  }

  /** Kural 1/2/5 → 422, ters çevrilmiş → 409, taşınmış → 409, açık kur farkı → 409. */
  private void requireEligible(AccountTransaction src, Account account) {
    if (ExchangeRateService.LOCAL_CURRENCY.equals(src.getMoney().currency())
        || !FinanceReportRepositories.FX_SOURCE_TYPES.contains(src.getSourceType())
        || account.isDeleted()
        || account.getType() == AccountType.INTERCOMPANY) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "FX_SOURCE_INVALID",
          "Bu hareket için kur farkı kesilemez.");
    }
    if (transactions
        .findBySourceTypeAndSourceId(LedgerService.SOURCE_REVERSAL, src.getId())
        .filter(reversal -> !reversal.isDeleted())
        .isPresent()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "FX_SOURCE_REVERSED", "Hareket iptal edilmiş.");
    }
    if (transferLines.existsByAccountTransactionIdAndActiveTrue(src.getId())) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "TRANSACTION_TRANSFERRED",
          "Bu hareket başka cariye taşınmış; önce cari taşımayı geri alın.");
    }
    Optional<AccountDocument> open =
        documents.findFirstByFxSourceTransactionIdAndStatusAndDeletedFalse(
            src.getId(), AccountDocumentStatus.OPEN);
    if (open.isPresent()) {
      throw differenceExists(open.get());
    }
  }

  /** Fark pozitifse kaynağın yönü, negatifse karşı yön (§3.2.3 adım 12). */
  static Direction documentDirection(Direction sourceDirection, BigDecimal difference) {
    return difference.signum() > 0 ? sourceDirection : sourceDirection.opposite();
  }

  /** {@code KF-} + kaynak belge no (yoksa kaynak kimliğinin ilk 8 hanesi), en çok 50 karakter. */
  static String documentNo(String sourceNo, UUID sourceId) {
    String base =
        sourceNo == null || sourceNo.isBlank()
            ? sourceId.toString().substring(0, 8).toUpperCase(Locale.ROOT)
            : sourceNo;
    String value = "KF-" + base;
    return value.length() > MAX_DOCUMENT_NO ? value.substring(0, MAX_DOCUMENT_NO) : value;
  }

  /** Varsayılan açıklama: {@code Kur farkı (USD 1.000,00 × (36,0000 − 34,0000)): FTR-1}. */
  static String description(AccountTransaction src, BigDecimal rate, String sourceNo) {
    return "Kur farkı ("
        + src.getMoney().currency()
        + " "
        + format(src.getMoney().amount(), 2)
        + " × ("
        + format(rate, 4)
        + " − "
        + format(src.getExchangeRate(), 4)
        + ")): "
        + (sourceNo == null || sourceNo.isBlank() ? "-" : sourceNo);
  }

  private static String format(BigDecimal value, int scale) {
    return String.format(TR, "%,." + scale + "f", value.setScale(scale, RoundingMode.HALF_UP));
  }

  static BusinessException sourceNotFound() {
    return new BusinessException(
        HttpStatus.NOT_FOUND, "FX_SOURCE_NOT_FOUND", "Dövizli kaynak hareket bulunamadı.");
  }

  /** Kaynağa açık kur farkı belgesi var (belge biliniyorsa kimliği ve numarası ayrıntıda). */
  static BusinessException differenceExists(AccountDocument document) {
    return new BusinessException(
        HttpStatus.CONFLICT,
        "FX_DIFFERENCE_EXISTS",
        "Bu hareket için kur farkı kaydı zaten kesilmiş.",
        document == null
            ? List.of()
            : List.of("documentId=" + document.getId(), "documentNo=" + document.getDocumentNo()));
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }
}
