package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.FinanceTypes.FundAccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.FundAccountingType;
import org.ece.blackrose.finance.domain.FinanceTypes.FundCategory;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.domain.FundTransaction;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundAccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundTransactionRepository;
import org.ece.blackrose.finance.repository.FundRepositories.FundBalanceAsOfRow;
import org.ece.blackrose.finance.repository.FundRepositories.FundDeleteCountsRow;
import org.ece.blackrose.finance.repository.FundRepositories.FundOpeningRow;
import org.ece.blackrose.finance.repository.FundRepositories.FundQueryRepository;
import org.ece.blackrose.finance.repository.FundRepositories.FundSparkRow;
import org.ece.blackrose.finance.repository.FundRepositories.FundTxRow;
import org.ece.blackrose.finance.web.FinanceDtos.FundResponse;
import org.ece.blackrose.finance.web.FundDtos.FundActivityInflowResponse;
import org.ece.blackrose.finance.web.FundDtos.FundActivityOutflowResponse;
import org.ece.blackrose.finance.web.FundDtos.FundActivityReportResponse;
import org.ece.blackrose.finance.web.FundDtos.FundActivityUnspentResponse;
import org.ece.blackrose.finance.web.FundDtos.FundCanDeleteResponse;
import org.ece.blackrose.finance.web.FundDtos.FundCurrencyTotalResponse;
import org.ece.blackrose.finance.web.FundDtos.FundDeleteReasonResponse;
import org.ece.blackrose.finance.web.FundDtos.FundDetailResponse;
import org.ece.blackrose.finance.web.FundDtos.FundRefResponse;
import org.ece.blackrose.finance.web.FundDtos.FundSourceRefResponse;
import org.ece.blackrose.finance.web.FundDtos.FundSparklineResponse;
import org.ece.blackrose.finance.web.FundDtos.FundSummaryRowResponse;
import org.ece.blackrose.finance.web.FundDtos.FundTransactionDetailResponse;
import org.ece.blackrose.finance.web.FundDtos.FundTransactionPageResponse;
import org.ece.blackrose.finance.web.FundDtos.FundTransactionRowResponse;
import org.ece.blackrose.finance.web.FundDtos.FundTransactionSummaryResponse;
import org.ece.blackrose.identity.domain.Permission;
import org.ece.blackrose.identity.security.PersonalDataProtector;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Banka/kasa salt okuma (12.2_TASARIM §3.2): süzgeçli liste, tekil detay, şirket kırılımlı özet,
 * sparkline, silme denetimi, çok hesaplı hareket araması (yürüyen bakiye sunucuda) ve FIFO faaliyet
 * raporu. Tüm sorgular kullanıcının iş yeri kapsamına daralır; şirket boşsa konsolide.
 */
@Service
public class FundQueryService {

  static final int MAX_RANGE_DAYS = 366;
  static final int MAX_PAGE_SIZE = 500;

  /** Başlangıç tarihi olmadan (tek hesabın tüm geçmişi) en çok bu kadar satır (SEC-12.2-08). */
  static final int NO_FROM_MAX_SIZE = 50;

  static final int MAX_IDS = 200;
  static final int MAX_QUERY_LENGTH = 100;
  static final int MAX_ROWS = 10_000;

  private static final LocalDate MIN_DATE = LocalDate.of(1, 1, 1);
  private static final List<String> NO_TYPES = List.of("");
  private static final String TRANSFER_CENTER = "/zto-finans/transfer-merkezi?tab=transfers";

  /** {@code GET /funds} süzgeçleri; boş alan süzmez, {@code asOf} boşsa bugün. */
  public record FundSearch(
      UUID companyId,
      List<UUID> branchIds,
      FundKind kind,
      FundAccountType accountType,
      Boolean active,
      String currency,
      LocalDate asOf) {}

  /** {@code GET /funds/transactions} süzgeçleri (§3.2.6). */
  public record FundTransactionSearch(
      UUID companyId,
      FundKind kind,
      List<UUID> fundIds,
      List<UUID> branchIds,
      FundAccountType accountType,
      FundDirection direction,
      List<FundAccountingType> accountingTypes,
      String currency,
      LocalDate from,
      LocalDate to,
      String q,
      boolean summary,
      boolean ascending) {}

  /** FIFO girdisi: dönem içi tek hareket. */
  record ActivityMove(
      UUID id,
      LocalDate date,
      String accountingType,
      String description,
      FundDirection direction,
      BigDecimal amount) {}

  record FifoResult(
      BigDecimal totalIn,
      BigDecimal totalOut,
      List<FundActivityInflowResponse> inflows,
      List<FundActivityUnspentResponse> unspent,
      BigDecimal unmatchedOut) {}

  /** Yerel sorgunun bağlanmış parametreleri. */
  private record Criteria(
      LocalDate from,
      LocalDate to,
      BranchFilter filter,
      String kind,
      List<UUID> fundIds,
      String accountType,
      String currency,
      boolean employeeVisible,
      String direction,
      List<String> types,
      UUID rowId,
      String q) {

    boolean allCompanies() {
      return filter.companyId() == null;
    }

    UUID companyId() {
      return filter.companyId() == null ? BranchFilter.NONE : filter.companyId();
    }

    boolean allFunds() {
      return fundIds.isEmpty();
    }

    List<UUID> fundIdsOrNone() {
      return fundIds.isEmpty() ? List.of(BranchFilter.NONE) : fundIds;
    }

    boolean allTypes() {
      return types.isEmpty();
    }

    List<String> typesOrNone() {
      return types.isEmpty() ? NO_TYPES : types;
    }

    boolean allRows() {
      return rowId == null;
    }

    UUID rowIdOrNone() {
      return rowId == null ? BranchFilter.NONE : rowId;
    }
  }

  private final FundAccountRepository funds;
  private final FundTransactionRepository transactions;
  private final FundQueryRepository queries;
  private final BranchScopeService scope;
  private final AccountAccess access;
  private final PersonalDataProtector protector;
  private final TenantClock clock;

  public FundQueryService(
      FundAccountRepository funds,
      FundTransactionRepository transactions,
      FundQueryRepository queries,
      BranchScopeService scope,
      AccountAccess access,
      PersonalDataProtector protector,
      TenantClock clock) {
    this.funds = funds;
    this.transactions = transactions;
    this.queries = queries;
    this.scope = scope;
    this.access = access;
    this.protector = protector;
    this.clock = clock;
  }

  // --- Tanımlar (§3.2.1–§3.2.5)

  /** Süzgeçli liste; sıra tür, hesap türü, banka adı, ad (ZTO BankIntroduction). */
  @Transactional(readOnly = true)
  public List<FundResponse> list(FundSearch search) {
    List<FundAccount> rows =
        funds.searchFiltered(
            scope.filter(search.companyId(), search.branchIds()),
            search.kind(),
            search.accountType(),
            search.active(),
            normalizeCurrency(search.currency()));
    return responses(rows, asOfOrToday(search.asOf()));
  }

  /** Bugün itibarıyla tek hesabın yanıtı (oluşturma/güncelleme sonrası). */
  @Transactional(readOnly = true)
  public FundResponse response(FundAccount fund) {
    return responses(List.of(fund), clock.today()).get(0);
  }

  /** Tekil detay; hesap no yalnız {@code FINANCE_MANAGE} yetkisinde düz döner (SEC-12.2-07). */
  @Transactional(readOnly = true)
  public FundDetailResponse get(UUID id, LocalDate asOf) {
    FundAccount fund = findVisible(id);
    LocalDate date = asOfOrToday(asOf);
    FundBalanceAsOfRow balance =
        queries.balancesAsOf(List.of(id), date).stream().findFirst().orElse(null);
    FundOpeningRow opening = queries.openings(List.of(id)).stream().findFirst().orElse(null);
    FundResponse r = toResponse(fund, balance, opening);
    String accountNo =
        AccountAccess.hasAuthority(Permission.FINANCE_MANAGE.name())
            ? protector.decrypt(fund.getAccountNoEnc())
            : fund.getAccountNoMasked();
    return new FundDetailResponse(
        r.id(),
        r.code(),
        r.name(),
        r.kind(),
        r.currency(),
        r.branchId(),
        r.companyId(),
        r.bankName(),
        r.iban(),
        r.allowNegative(),
        r.balance(),
        r.accountType(),
        accountNo,
        r.bankBranchName(),
        r.description(),
        r.active(),
        r.currentBalance(),
        r.futureCount(),
        r.futureNet(),
        r.openingBalance(),
        r.openingDate(),
        r.transactionCount(),
        fund.getCreatedBy(),
        fund.getCreatedAt(),
        fund.getUpdatedBy(),
        fund.getUpdatedAt(),
        fund.getUpdateCount(),
        balance == null ? null : balance.getLastTransactionDate());
  }

  /** Şirket × tür × hesap türü × para birimi özeti; pasifler {@code inactiveCount}'ta. */
  @Transactional(readOnly = true)
  public List<FundSummaryRowResponse> summary(UUID companyId, FundKind kind, LocalDate asOf) {
    BranchFilter filter = scope.filter(companyId, null);
    return queries
        .summary(
            filter.companyId() == null,
            filter.companyId() == null ? BranchFilter.NONE : filter.companyId(),
            filter.allBranches(),
            filter.branchIds(),
            kind == null ? "" : kind.name(),
            asOfOrToday(asOf))
        .stream()
        .map(
            row ->
                new FundSummaryRowResponse(
                    row.getCompanyId(),
                    FundKind.valueOf(row.getKind()),
                    FundAccountType.valueOf(row.getAccountType()),
                    row.getCurrency(),
                    row.getCount().intValue(),
                    row.getInactiveCount().intValue(),
                    row.getCurrentBalance(),
                    row.getBalance(),
                    row.getFutureNet(),
                    row.getOpeningTotal()))
        .toList();
  }

  /**
   * En çok {@value #MAX_IDS} hesabın son 20 hareketi (bugün dahil, ileri tarihliler hariç). Kapsam
   * dışı ya da bilinmeyen kimlik sessizce atlanır; sıra istek sırasıdır.
   */
  @Transactional(readOnly = true)
  public List<FundSparklineResponse> sparklines(List<UUID> ids) {
    List<UUID> requested = ids == null ? List.of() : ids.stream().distinct().toList();
    if (requested.size() > MAX_IDS) {
      throw tooManyIds();
    }
    Set<UUID> allowed = scope.allowedOrNull();
    Set<UUID> visible =
        funds.findAllById(requested).stream()
            .filter(f -> allowed == null || allowed.contains(f.getBranchId()))
            .map(FundAccount::getId)
            .collect(Collectors.toSet());
    List<UUID> ordered = requested.stream().filter(visible::contains).toList();
    if (ordered.isEmpty()) {
      return List.of();
    }
    Map<UUID, List<BigDecimal>> points = new LinkedHashMap<>();
    for (FundSparkRow row : queries.sparklines(ordered, clock.today())) {
      points.computeIfAbsent(row.getFundAccountId(), k -> new ArrayList<>()).add(row.getAmount());
    }
    return ordered.stream()
        .map(id -> new FundSparklineResponse(id, points.getOrDefault(id, List.of())))
        .toList();
  }

  @Transactional(readOnly = true)
  public FundCanDeleteResponse canDelete(UUID id) {
    return canDelete(findVisible(id));
  }

  /**
   * Silmeyi engelleyen kayıtlar (yalnız sıfırdan büyük sayılar). Açılış hareketi ve onun tersi
   * engellemez; silmede açılış ters çevrilir.
   */
  FundCanDeleteResponse canDelete(FundAccount fund) {
    FundDeleteCountsRow counts = queries.deleteCounts(fund.getId());
    Map<String, Long> kinds = new LinkedHashMap<>();
    kinds.put("FUND_TRANSACTION", counts.getFundTransaction());
    kinds.put("SETTLEMENT", counts.getSettlement());
    kinds.put("INSTRUMENT", counts.getInstrument());
    kinds.put("FUND_TRANSFER", counts.getFundTransfer());
    kinds.put("INTERCOMPANY_TRANSFER", counts.getIntercompanyTransfer());
    kinds.put("VEHICLE_EXPENSE", counts.getVehicleExpense());
    kinds.put("BANK_STATEMENT_LINE", counts.getBankStatementLine());
    kinds.put("COMPANY_DEFAULT", funds.isCompanyDefault(fund.getId()) ? 1L : 0L);
    List<FundDeleteReasonResponse> reasons =
        kinds.entrySet().stream()
            .filter(e -> e.getValue() > 0)
            .map(e -> new FundDeleteReasonResponse(e.getKey(), e.getValue()))
            .toList();
    return new FundCanDeleteResponse(reasons.isEmpty(), reasons);
  }

  // --- Hareket merkezi (§3.2.6–§3.2.7)

  /**
   * Çok hesaplı hareket araması. Sayfa boyutu 1–{@value #MAX_PAGE_SIZE} (400 {@code
   * PAGE_SIZE_INVALID}); {@code from} yalnız tek hesapla boş olabilir ({@code size} ≤ {@value
   * #NO_FROM_MAX_SIZE}), diğer her durumda aralık ≤ {@value #MAX_RANGE_DAYS} gün.
   */
  @Transactional(readOnly = true)
  public FundTransactionPageResponse transactions(
      FundTransactionSearch search, int page, int size) {
    if (size < 1 || size > MAX_PAGE_SIZE) {
      throw pageSizeInvalid("Sayfa boyutu 1–500 olmalıdır.");
    }
    int pageNumber = Math.max(0, page);
    Criteria c = criteria(search, size);
    List<FundTransactionRowResponse> content =
        rows(c, search.ascending(), size, (long) pageNumber * size).stream()
            .map(FundQueryService::toRow)
            .toList();
    long total =
        queries.count(
            c.from(),
            c.to(),
            c.allCompanies(),
            c.companyId(),
            c.filter().allBranches(),
            c.filter().branchIds(),
            c.kind(),
            c.allFunds(),
            c.fundIdsOrNone(),
            c.accountType(),
            c.currency(),
            c.employeeVisible(),
            c.direction(),
            c.allTypes(),
            c.typesOrNone(),
            c.allRows(),
            c.rowIdOrNone(),
            c.q());
    return new FundTransactionPageResponse(
        content,
        pageNumber,
        size,
        total,
        (int) ((total + size - 1) / size),
        search.summary() ? summaryOf(c) : null);
  }

  /** Sayfasız dışa aktarım (en çok {@value #MAX_ROWS} satır; fazlası 422). */
  @Transactional(readOnly = true)
  public List<FundTransactionRowResponse> export(FundTransactionSearch search) {
    Criteria c = criteria(search, NO_FROM_MAX_SIZE);
    List<FundTxRow> rows = rows(c, search.ascending(), MAX_ROWS + 1, 0);
    if (rows.size() > MAX_ROWS) {
      throw resultTooLarge();
    }
    return rows.stream().map(FundQueryService::toRow).toList();
  }

  /** Tek hareket: satır (yürüyen bakiyesiyle), hesap ve kaynak belge bağlantısı. */
  @Transactional(readOnly = true)
  public FundTransactionDetailResponse transaction(UUID id) {
    FundTransaction tx =
        transactions
            .findById(id)
            .filter(t -> !t.isDeleted())
            .orElseThrow(AccountTransactionQueryService::notFound);
    FundAccount fund =
        funds.findById(tx.getFundAccountId()).orElseThrow(AccountTransactionQueryService::notFound);
    scope.requireVisible(fund.getBranchId());
    Criteria c =
        new Criteria(
            tx.getTransactionDate(),
            tx.getTransactionDate(),
            BranchFilter.all(null),
            "",
            List.of(fund.getId()),
            "",
            "",
            access.employeeVisible(),
            "",
            List.of(),
            id,
            "");
    FundTxRow row = rows(c, false, 1, 0).get(0);
    return FundTransactionDetailResponse.of(
        toRow(row),
        new FundRefResponse(
            fund.getId(),
            fund.getCode(),
            fund.getName(),
            fund.getBankName(),
            fund.getIban(),
            fund.getAccountNoMasked(),
            fund.getBankBranchName(),
            fund.getCurrency()),
        sourceOf(row, fund));
  }

  // --- Faaliyet raporu (§3.2.8)

  @Transactional(readOnly = true)
  public FundActivityReportResponse activity(UUID fundId, LocalDate from, LocalDate to) {
    FundAccount fund = findVisible(fundId);
    requireRange(from, to);
    Criteria c =
        new Criteria(
            from,
            to,
            BranchFilter.all(null),
            "",
            List.of(fundId),
            "",
            "",
            access.employeeVisible(),
            "",
            List.of(),
            null,
            "");
    List<FundTxRow> rows = rows(c, true, MAX_ROWS + 1, 0);
    if (rows.size() > MAX_ROWS) {
      throw resultTooLarge();
    }
    BigDecimal opening = transactions.balanceBefore(fundId, from);
    FifoResult fifo =
        fifo(
            opening,
            from,
            rows.stream()
                .map(
                    r ->
                        new ActivityMove(
                            r.getId(),
                            r.getTransactionDate(),
                            r.getAccountingType(),
                            r.getDescription(),
                            FundDirection.valueOf(r.getDirection()),
                            r.getAmount()))
                .toList());
    return new FundActivityReportResponse(
        response(fund),
        from,
        to,
        opening,
        fifo.totalIn(),
        fifo.totalOut(),
        opening.add(fifo.totalIn()).subtract(fifo.totalOut()),
        fifo.inflows(),
        fifo.unspent(),
        fifo.unmatchedOut());
  }

  /**
   * FIFO eşleştirme: pozitif dönem başı ilk giriş lotudur ("Başlangıç"), negatif dönem başı ilk
   * çıkış gibi karşılanmamış kalır. Her çıkış en eski kalanı olan lottan düşülür; lot kalmazsa
   * karşılanmayan kısım {@code unmatchedOut}'a eklenir.
   */
  static FifoResult fifo(BigDecimal opening, LocalDate from, List<ActivityMove> moves) {
    List<Lot> lots = new ArrayList<>();
    BigDecimal unmatched = BigDecimal.ZERO;
    if (opening.signum() > 0) {
      lots.add(new Lot(1, null, from, FundAccountingType.OPENING.name(), "Başlangıç", opening));
    } else if (opening.signum() < 0) {
      unmatched = opening.negate();
    }
    BigDecimal totalIn = BigDecimal.ZERO;
    BigDecimal totalOut = BigDecimal.ZERO;
    int head = 0;
    for (ActivityMove move : moves) {
      if (move.direction() == FundDirection.IN) {
        totalIn = totalIn.add(move.amount());
        lots.add(
            new Lot(
                lots.size() + 1,
                move.id(),
                move.date(),
                move.accountingType(),
                move.description(),
                move.amount()));
        continue;
      }
      totalOut = totalOut.add(move.amount());
      BigDecimal left = move.amount();
      while (left.signum() > 0 && head < lots.size()) {
        Lot lot = lots.get(head);
        BigDecimal take = lot.remaining.min(left);
        lot.remaining = lot.remaining.subtract(take);
        lot.outflows.add(
            new FundActivityOutflowResponse(
                move.id(), move.date(), move.accountingType(), move.description(), take));
        left = left.subtract(take);
        if (lot.remaining.signum() == 0) {
          head++;
        }
      }
      unmatched = unmatched.add(left);
    }
    List<FundActivityInflowResponse> inflows =
        lots.stream()
            .map(
                lot ->
                    new FundActivityInflowResponse(
                        lot.no,
                        lot.id,
                        lot.date,
                        lot.accountingType,
                        lot.description,
                        lot.amount,
                        lot.remaining,
                        List.copyOf(lot.outflows)))
            .toList();
    List<FundActivityUnspentResponse> unspent =
        lots.stream()
            .filter(lot -> lot.remaining.signum() > 0)
            .map(
                lot ->
                    new FundActivityUnspentResponse(
                        lot.no,
                        lot.date,
                        lot.accountingType,
                        lot.description,
                        lot.amount,
                        lot.remaining,
                        lot.amount.subtract(lot.remaining)))
            .toList();
    return new FifoResult(totalIn, totalOut, inflows, unspent, unmatched);
  }

  /** FIFO giriş lotu (hesaplama sırasında değişir). */
  private static final class Lot {
    private final int no;
    private final UUID id;
    private final LocalDate date;
    private final String accountingType;
    private final String description;
    private final BigDecimal amount;
    private final List<FundActivityOutflowResponse> outflows = new ArrayList<>();
    private BigDecimal remaining;

    private Lot(
        int no,
        UUID id,
        LocalDate date,
        String accountingType,
        String description,
        BigDecimal amount) {
      this.no = no;
      this.id = id;
      this.date = date;
      this.accountingType = accountingType;
      this.description = description;
      this.amount = amount;
      this.remaining = amount;
    }
  }

  // --- Yardımcılar

  /** Kapsam denetimiyle hesap: yoksa 404 {@code FUND_NOT_FOUND}, kapsam dışıysa 403. */
  FundAccount findVisible(UUID id) {
    FundAccount fund =
        funds
            .findById(id)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "FUND_NOT_FOUND", "Banka/kasa hesabı bulunamadı."));
    scope.requireVisible(fund.getBranchId());
    return fund;
  }

  private List<FundResponse> responses(List<FundAccount> rows, LocalDate asOf) {
    if (rows.isEmpty()) {
      return List.of();
    }
    List<UUID> ids = rows.stream().map(FundAccount::getId).toList();
    Map<UUID, FundBalanceAsOfRow> balances =
        queries.balancesAsOf(ids, asOf).stream()
            .collect(Collectors.toMap(FundBalanceAsOfRow::getFundAccountId, Function.identity()));
    Map<UUID, FundOpeningRow> openings =
        queries.openings(ids).stream()
            .collect(Collectors.toMap(FundOpeningRow::getFundAccountId, Function.identity()));
    return rows.stream()
        .map(f -> toResponse(f, balances.get(f.getId()), openings.get(f.getId())))
        .toList();
  }

  private static FundResponse toResponse(
      FundAccount fund, FundBalanceAsOfRow balance, FundOpeningRow opening) {
    return new FundResponse(
        fund.getId(),
        fund.getCode(),
        fund.getName(),
        fund.getKind(),
        fund.getCurrency(),
        fund.getBranchId(),
        fund.getCompanyId(),
        fund.getBankName(),
        fund.getIban(),
        fund.isAllowNegative(),
        balance == null ? BigDecimal.ZERO : balance.getBalance(),
        fund.getAccountType(),
        fund.getAccountNoMasked(),
        fund.getBankBranchName(),
        fund.getDescription(),
        fund.isActive(),
        balance == null ? BigDecimal.ZERO : balance.getCurrentBalance(),
        balance == null ? 0 : balance.getFutureCount().intValue(),
        balance == null ? BigDecimal.ZERO : balance.getFutureNet(),
        opening == null ? BigDecimal.ZERO : opening.getSignedAmount(),
        opening == null ? null : opening.getOpeningDate(),
        balance == null ? 0 : balance.getTransactionCount());
  }

  /** Arama süzgeçlerini doğrular ve sorgu parametrelerine çevirir. */
  private Criteria criteria(FundTransactionSearch s, int size) {
    List<UUID> fundIds = s.fundIds() == null ? List.of() : s.fundIds().stream().distinct().toList();
    if (fundIds.size() > MAX_IDS) {
      throw tooManyIds();
    }
    String q = s.q() == null ? "" : s.q().trim();
    if (q.length() > MAX_QUERY_LENGTH) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "QUERY_TOO_LONG", "Arama metni en çok 100 karakter olabilir.");
    }
    LocalDate from = s.from();
    if (from == null && fundIds.size() == 1 && s.to() != null) {
      if (size > NO_FROM_MAX_SIZE) {
        throw pageSizeInvalid("Başlangıç tarihi olmadan en çok 50 satır istenebilir.");
      }
      from = MIN_DATE;
    } else {
      requireRange(from, s.to());
    }
    // Açıkça istenen hesaplar kapsamda olmalı (bilinmeyen kimlik sonuç üretmez).
    funds.findAllById(fundIds).forEach(f -> scope.requireVisible(f.getBranchId()));
    BranchFilter filter = scope.filter(s.companyId(), s.branchIds());
    List<String> types =
        s.accountingTypes() == null
            ? List.of()
            : s.accountingTypes().stream().map(Enum::name).distinct().toList();
    String currency = normalizeCurrency(s.currency());
    return new Criteria(
        from,
        s.to(),
        filter,
        s.kind() == null ? "" : s.kind().name(),
        fundIds,
        s.accountType() == null ? "" : s.accountType().name(),
        currency == null ? "" : currency,
        access.employeeVisible(),
        s.direction() == null ? "" : s.direction().name(),
        types,
        null,
        likePattern(q));
  }

  private List<FundTxRow> rows(Criteria c, boolean ascending, int limit, long offset) {
    return queries.rows(
        c.from(),
        c.to(),
        c.allCompanies(),
        c.companyId(),
        c.filter().allBranches(),
        c.filter().branchIds(),
        c.kind(),
        c.allFunds(),
        c.fundIdsOrNone(),
        c.accountType(),
        c.currency(),
        c.employeeVisible(),
        c.direction(),
        c.allTypes(),
        c.typesOrNone(),
        c.allRows(),
        c.rowIdOrNone(),
        c.q(),
        ascending,
        limit,
        offset);
  }

  /** Para birimi başına toplamlar; tek hesapta dönem başı/sonu (ZTO "FİLTRELENEN"). */
  private FundTransactionSummaryResponse summaryOf(Criteria c) {
    List<FundCurrencyTotalResponse> currencies =
        queries
            .totals(
                c.from(),
                c.to(),
                c.allCompanies(),
                c.companyId(),
                c.filter().allBranches(),
                c.filter().branchIds(),
                c.kind(),
                c.allFunds(),
                c.fundIdsOrNone(),
                c.accountType(),
                c.currency(),
                c.employeeVisible(),
                c.direction(),
                c.allTypes(),
                c.typesOrNone(),
                c.allRows(),
                c.rowIdOrNone(),
                c.q())
            .stream()
            .map(
                t ->
                    new FundCurrencyTotalResponse(
                        t.getCurrency(),
                        t.getTotalIn(),
                        t.getTotalOut(),
                        t.getTotalIn().subtract(t.getTotalOut()),
                        t.getCount()))
            .toList();
    if (c.fundIds().size() != 1) {
      return new FundTransactionSummaryResponse(currencies, null, null);
    }
    BigDecimal opening =
        MIN_DATE.equals(c.from())
            ? BigDecimal.ZERO
            : transactions.balanceBefore(c.fundIds().get(0), c.from());
    BigDecimal net =
        currencies.stream()
            .map(FundCurrencyTotalResponse::net)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    return new FundTransactionSummaryResponse(currencies, opening, opening.add(net));
  }

  static FundTransactionRowResponse toRow(FundTxRow row) {
    return new FundTransactionRowResponse(
        row.getId(),
        row.getFundAccountId(),
        row.getFundCode(),
        row.getFundName(),
        row.getBankName(),
        FundKind.valueOf(row.getKind()),
        FundAccountType.valueOf(row.getAccountType()),
        row.getCompanyId(),
        row.getBranchId(),
        row.getCurrency(),
        row.getTransactionDate(),
        FundDirection.valueOf(row.getDirection()),
        row.getAmount(),
        row.getExchangeRate(),
        row.getTlAmount(),
        row.getRunningBalance(),
        row.getDescription(),
        row.getSourceType(),
        row.getSourceId(),
        row.getAccountingType(),
        row.getTransferCode(),
        row.getCategory() == null ? null : FundCategory.valueOf(row.getCategory()),
        row.getAccountId(),
        row.getAccountCode(),
        row.getAccountName(),
        Boolean.TRUE.equals(row.getReversal()),
        Boolean.TRUE.equals(row.getReversed()),
        row.getCreatedBy(),
        AccountTransactionQueryService.instant(row.getCreatedAt()));
  }

  /**
   * Taban kaynak belge ve açılabilen sayfası: ödeme/tahsilat listesi, transfer merkezi (kodla),
   * çek/senet listesi, açılış için hesap düzenleme formu; manuel ve eski virmanda rota yok.
   */
  static FundSourceRefResponse sourceOf(FundTxRow row, FundAccount fund) {
    String base = row.getBaseType();
    String code = row.getSourceRefCode();
    boolean intercompany = FundAccountingType.INTERCOMPANY.name().equals(row.getAccountingType());
    String route =
        switch (base) {
          case "SETTLEMENT" ->
              intercompany ? transferCenter(code, row.getSourceRefDate()) : "/finance/settlements";
          case "FUND_TRANSFER", "FUND_TRANSFER_COST" ->
              transferCenter(code, row.getSourceRefDate());
          case "INSTRUMENT" -> "/finance/instruments";
          case "FUND_OPENING" ->
              "/zto-finans/"
                  + (fund.getKind() == FundKind.BANK ? "bankalar" : "kasalar")
                  + "/"
                  + fund.getId()
                  + "/duzenle";
          default -> null;
        };
    return new FundSourceRefResponse(
        intercompany ? FundAccountingType.INTERCOMPANY.name() : base,
        row.getSourceRefId(),
        code,
        route);
  }

  /** Kodlu derin bağlantı transfer tarihini de taşır (F-12.2-R2; 7 günden eski kayıt bulunur). */
  private static String transferCenter(String code, LocalDate transferDate) {
    return code == null ? TRANSFER_CENTER : FundTransferService.route(code, transferDate);
  }

  /** Büyük/küçük harf duyarsız {@code %metin%} deseni; {@code \ % _} kaçışlanır. Boşsa "". */
  static String likePattern(String q) {
    if (q == null || q.isBlank()) {
      return "";
    }
    String escaped = q.trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    return "%" + escaped + "%";
  }

  private static void requireRange(LocalDate from, LocalDate to) {
    if (from == null
        || to == null
        || to.isBefore(from)
        || ChronoUnit.DAYS.between(from, to) > MAX_RANGE_DAYS) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "DATE_RANGE_TOO_LARGE", "Tarih aralığı en çok 1 yıl olabilir.");
    }
  }

  private LocalDate asOfOrToday(LocalDate asOf) {
    return asOf == null ? clock.today() : asOf;
  }

  private static String normalizeCurrency(String currency) {
    return currency == null || currency.isBlank()
        ? null
        : currency.trim().toUpperCase(java.util.Locale.ROOT);
  }

  private static BusinessException tooManyIds() {
    return new BusinessException(
        HttpStatus.BAD_REQUEST, "TOO_MANY_IDS", "En çok 200 hesap seçilebilir.");
  }

  private static BusinessException pageSizeInvalid(String message) {
    return new BusinessException(HttpStatus.BAD_REQUEST, "PAGE_SIZE_INVALID", message);
  }

  private static BusinessException resultTooLarge() {
    return new BusinessException(
        HttpStatus.UNPROCESSABLE_ENTITY, "RESULT_TOO_LARGE", "Tarih aralığını daraltın.");
  }
}
