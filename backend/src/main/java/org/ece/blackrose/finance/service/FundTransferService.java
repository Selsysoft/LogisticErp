package org.ece.blackrose.finance.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.finance.domain.FinanceTypes.FundAccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.FundCategory;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.FundTransferType;
import org.ece.blackrose.finance.domain.FinanceTypes.FxCalcMode;
import org.ece.blackrose.finance.domain.FinanceTypes.IncomeExpenseCategory;
import org.ece.blackrose.finance.domain.FinanceTypes.IncomeExpenseDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.IntercompanyReason;
import org.ece.blackrose.finance.domain.FinanceTypes.RateOperation;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.domain.FinanceTypes.TransferCostKind;
import org.ece.blackrose.finance.domain.FinanceTypes.TransferSourceKind;
import org.ece.blackrose.finance.domain.FinanceTypes.TransferStatus;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.domain.FundTransaction;
import org.ece.blackrose.finance.domain.FundTransfer;
import org.ece.blackrose.finance.domain.FundTransferCost;
import org.ece.blackrose.finance.domain.FundTransferSource;
import org.ece.blackrose.finance.domain.Settlement;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundAccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.SettlementRepository;
import org.ece.blackrose.finance.repository.FundRepositories.FundTransferCostRepository;
import org.ece.blackrose.finance.repository.FundRepositories.FundTransferQueryRepository;
import org.ece.blackrose.finance.repository.FundRepositories.FundTransferRepository;
import org.ece.blackrose.finance.repository.FundRepositories.FundTransferSourceRepository;
import org.ece.blackrose.finance.repository.FundRepositories.FxSourceInfoRow;
import org.ece.blackrose.finance.repository.FundRepositories.TransferCollectionRow;
import org.ece.blackrose.finance.repository.FundRepositories.TransferDependentRow;
import org.ece.blackrose.finance.repository.FundRepositories.TransferListRow;
import org.ece.blackrose.finance.repository.FundRepositories.TransferSummaryRow;
import org.ece.blackrose.finance.service.FundLedgerService.FundPosting;
import org.ece.blackrose.finance.web.AccountDtos.CurrencyAmountResponse;
import org.ece.blackrose.finance.web.FundDtos.FundTransferRequest;
import org.ece.blackrose.finance.web.FundDtos.FundTransferResponse;
import org.ece.blackrose.finance.web.FundDtos.FxCandidateAccountResponse;
import org.ece.blackrose.finance.web.FundDtos.FxCandidateCollectionResponse;
import org.ece.blackrose.finance.web.FundDtos.FxReportResponse;
import org.ece.blackrose.finance.web.FundDtos.FxReportRowResponse;
import org.ece.blackrose.finance.web.FundDtos.FxReportSourceResponse;
import org.ece.blackrose.finance.web.FundDtos.FxReportStatsResponse;
import org.ece.blackrose.finance.web.FundDtos.FxSourceResponse;
import org.ece.blackrose.finance.web.FundDtos.FxUnbrokenCollectionResponse;
import org.ece.blackrose.finance.web.FundDtos.ReplaceTransferRequest;
import org.ece.blackrose.finance.web.FundDtos.TransferCollectionResponse;
import org.ece.blackrose.finance.web.FundDtos.TransferCollectionState;
import org.ece.blackrose.finance.web.FundDtos.TransferCostRequest;
import org.ece.blackrose.finance.web.FundDtos.TransferCostResponse;
import org.ece.blackrose.finance.web.FundDtos.TransferDependentResponse;
import org.ece.blackrose.finance.web.FundDtos.TransferListRowResponse;
import org.ece.blackrose.finance.web.FundDtos.TransferRecordType;
import org.ece.blackrose.finance.web.FundDtos.TransferSourceRequest;
import org.ece.blackrose.finance.web.FundDtos.TransferSourceResponse;
import org.ece.blackrose.finance.web.FundDtos.TransferSummaryGroup;
import org.ece.blackrose.finance.web.FundDtos.TransferSummaryRowResponse;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.organization.DocumentNumberService;
import org.ece.blackrose.organization.DocumentType;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Transfer merkezi (12.2_TASARIM §3.3): şirket içi banka/kasa transferi, döviz bozumu, masraflar,
 * kaynak izlenebilirliği, iptal ve düzenleme. Fon hareketleri yalnız {@link FundLedgerService} ile,
 * gelir/gider bilgi kayıtları yalnız {@link IncomeExpenseService} ile yazılır. Kilit sırası
 * (§3.10): fonlar ({@code lockAll}, kimlik sırası) → transfer başlığı / kaynak satırları (kimlik
 * sırası) → belge serisi. Okuma uçlarında kayıt, kaynak ya da hedef fonu görünen kullanıcıya
 * görünür; görünmeyen tarafın kod/adı {@code null} döner (SEC-12.2-05). Yazma uçları iki tarafı da
 * ister (OK-12.2-11).
 */
@Service
public class FundTransferService {

  /** Transfer bacaklarının kaynak türü ({@code source_id} = transfer). */
  public static final String SOURCE_TRANSFER = "FUND_TRANSFER";

  /** Masraf bacağının kaynak türü ({@code source_id} = masraf satırı). */
  public static final String SOURCE_COST = "FUND_TRANSFER_COST";

  static final String TRY = ExchangeRateService.LOCAL_CURRENCY;
  static final int MAX_RANGE_DAYS = 366;
  static final int MAX_PAGE_SIZE = 200;
  static final int MAX_KEY_LENGTH = 100;

  private static final String ROUTE = "/zto-finans/transfer-merkezi?tab=transfers&q=";
  private static final String TARGET = "FUND_TRANSFER:";
  private static final String IDEMPOTENCY_INDEX = "fund_transfer_idempotency_uq";
  private static final BigDecimal FX_TOLERANCE = new BigDecimal("0.01");
  private static final BigDecimal RATE_TOLERANCE = new BigDecimal("0.000001");
  private static final BigDecimal SOURCE_TOLERANCE = new BigDecimal("0.005");
  private static final BigDecimal KMV_MAX = BigDecimal.TEN;
  private static final BigDecimal HUNDRED = new BigDecimal("100");
  private static final int MAX_QUERY_LENGTH = 100;

  /** ZTO kural ihlali: {@code rule} ayrıntı kodu, {@code message} ZTO metni. */
  record RuleViolation(String rule, String message) {}

  /** Doğrulanmış istek: fonlar, tür, tutarlar, masraflar ve kur kararları. */
  private record Plan(
      FundAccount from,
      FundAccount to,
      FundTransferType type,
      boolean rulesChecked,
      Money money,
      Money target,
      FundTransfer.FxTerms fx,
      List<CostPlan> costs,
      Map<String, BigDecimal> manualRates,
      boolean derivedRate) {

    Set<UUID> fundIds() {
      Set<UUID> ids = new LinkedHashSet<>(List.of(from.getId(), to.getId()));
      costs.forEach(c -> ids.add(c.fund().getId()));
      return ids;
    }
  }

  private record CostPlan(
      TransferCostKind kind,
      FundAccount fund,
      BigDecimal ratePercent,
      BigDecimal baseAmount,
      Money money) {}

  private record CheckedSource(TransferSourceKind kind, UUID id, BigDecimal used) {}

  private final FundAccountRepository funds;
  private final FundTransferRepository transfers;
  private final FundTransferCostRepository costs;
  private final FundTransferSourceRepository sources;
  private final FundTransferQueryRepository queries;
  private final SettlementRepository settlements;
  private final FundLedgerService fundLedger;
  private final IncomeExpenseService incomeExpense;
  private final ExchangeRateService rates;
  private final DocumentNumberService numbers;
  private final BranchScopeService scope;
  private final AccountAccess access;
  private final AuditService audit;
  private final TenantClock clock;

  @PersistenceContext private EntityManager entityManager;

  @SuppressWarnings("java:S107")
  public FundTransferService(
      FundAccountRepository funds,
      FundTransferRepository transfers,
      FundTransferCostRepository costs,
      FundTransferSourceRepository sources,
      FundTransferQueryRepository queries,
      SettlementRepository settlements,
      FundLedgerService fundLedger,
      IncomeExpenseService incomeExpense,
      ExchangeRateService rates,
      DocumentNumberService numbers,
      BranchScopeService scope,
      AccountAccess access,
      AuditService audit,
      TenantClock clock) {
    this.funds = funds;
    this.transfers = transfers;
    this.costs = costs;
    this.sources = sources;
    this.queries = queries;
    this.settlements = settlements;
    this.fundLedger = fundLedger;
    this.incomeExpense = incomeExpense;
    this.rates = rates;
    this.numbers = numbers;
    this.scope = scope;
    this.access = access;
    this.audit = audit;
    this.clock = clock;
  }

  // --- yazma

  /**
   * Yeni transfer (§3.3.1). Aynı {@code Idempotency-Key} aynı istekle gelirse ilk transfer döner,
   * farklı istekle 422 {@code IDEMPOTENCY_KEY_REUSED}; eşzamanlı aynı anahtardan ikincisi ya aynı
   * transferi alır ya da 409 {@code IDEMPOTENCY_IN_PROGRESS}.
   */
  @Transactional
  public FundTransferResponse create(FundTransferRequest request, String idempotencyKey) {
    Optional<FundTransfer> replay = replay(request, idempotencyKey, null);
    if (replay.isPresent()) {
      return response(replay.get());
    }
    Plan plan = plan(request);
    lockFunds(plan.fundIds());
    replay = replay(request, idempotencyKey, null);
    if (replay.isPresent()) {
      return response(replay.get());
    }
    return response(write(plan, request, idempotencyKey, null));
  }

  /**
   * İptal (§3.3.2): tüm bacaklar, masraflar ve gelir/gider kayıtları ters çevrilir. Tarih {@code
   * transferDate ≤ date ≤ max(bugün, transferDate)}; iptal edilmiş transfer olduğu gibi döner.
   * Bozumu kaynak alan geçerli bir bozum varsa 409 {@code TRANSFER_HAS_DEPENDENTS}.
   */
  @Transactional
  public FundTransferResponse reverse(UUID id, LocalDate date, String reason) {
    FundTransfer transfer = find(id);
    requireWritable(transfer);
    if (transfer.getStatus() == TransferStatus.REVERSED) {
      return response(transfer);
    }
    requireReverseDate(transfer.getTransferDate(), date, clock.today());
    lockFunds(fundIdsOf(transfer));
    entityManager.refresh(transfer, LockModeType.PESSIMISTIC_WRITE);
    if (transfer.getStatus() == TransferStatus.REVERSED) {
      return response(transfer);
    }
    reverseLegs(transfer, date, "İptal: " + transfer.getCode(), blankToNull(reason));
    audit.record(AuditEvent.FUND_TRANSFER_REVERSED, TARGET + transfer.getId(), transfer.getCode());
    entityManager.flush();
    return response(transfer);
  }

  /**
   * Düzenleme (§3.3.3): eski transfer eski tarihiyle iptal edilir (ara dönem bakiyeleri çift
   * sayılmaz, OK-12.2-26), yenisi yeni kodla yazılır ({@code replacesTransferId}). Şirket
   * değişemez; iptal edilmiş transfer 409 {@code TRANSFER_REVERSED}.
   */
  @Transactional
  public FundTransferResponse replace(
      UUID id, ReplaceTransferRequest request, String idempotencyKey) {
    FundTransferRequest body = request.transfer();
    Optional<FundTransfer> replay = replay(body, idempotencyKey, id);
    if (replay.isPresent()) {
      return response(replay.get());
    }
    FundTransfer old = find(id);
    requireWritable(old);
    requirePosted(old);
    Plan plan = plan(body);
    if (!plan.from().getCompanyId().equals(old.getCompanyId())) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "COMPANY_MISMATCH",
          "Düzenlemede transferin şirketi değiştirilemez.");
    }
    Set<UUID> lock = new LinkedHashSet<>(plan.fundIds());
    lock.addAll(fundIdsOf(old));
    lockFunds(lock);
    entityManager.refresh(old, LockModeType.PESSIMISTIC_WRITE);
    requirePosted(old);
    replay = replay(body, idempotencyKey, id);
    if (replay.isPresent()) {
      return response(replay.get());
    }
    String reason = blankToNull(request.reason());
    reverseLegs(
        old,
        old.getTransferDate(),
        "Düzenleme: " + old.getCode(),
        reason == null ? "Düzenleme" : reason);
    entityManager.flush();
    FundTransfer created = write(plan, body, idempotencyKey, old.getId());
    audit.record(AuditEvent.FUND_TRANSFER_REPLACED, TARGET + old.getId(), created.getCode());
    return response(created);
  }

  // --- okuma

  @Transactional(readOnly = true)
  public FundTransferResponse get(UUID id) {
    FundTransfer transfer = find(id);
    requireReadable(transfer);
    return response(transfer);
  }

  /** Bu transferi kaynak alan geçerli döviz bozumları (BS-10 engeli); adlar kapsamlı. */
  @Transactional(readOnly = true)
  public List<TransferDependentResponse> dependents(UUID id) {
    FundTransfer transfer = find(id);
    requireReadable(transfer);
    List<TransferDependentRow> rows = queries.dependents(id);
    Map<UUID, FundAccount> byId =
        fundsById(
            rows.stream()
                .flatMap(r -> java.util.stream.Stream.of(r.getSourceFundId(), r.getTargetFundId()))
                .toList());
    return rows.stream()
        .map(
            r ->
                new TransferDependentResponse(
                    r.getTransferId(),
                    r.getCode(),
                    r.getDate(),
                    visibleName(byId.get(r.getSourceFundId())),
                    visibleName(byId.get(r.getTargetFundId())),
                    r.getUsedAmount()))
        .toList();
  }

  /** Önceki Döviz Bozum Kaynakları: fona gelmiş, kalanı olan bozumlar (≤ 200). */
  @Transactional(readOnly = true)
  public List<FxSourceResponse> fxSources(UUID fundId, String currency) {
    visibleFund(fundId);
    String cur = normalizeCurrency(currency);
    var rows = queries.fxSources(fundId, cur);
    Map<UUID, FundAccount> byId = fundsById(rows.stream().map(r -> r.getSourceFundId()).toList());
    return rows.stream()
        .map(
            r ->
                new FxSourceResponse(
                    r.getTransferId(),
                    r.getCode(),
                    r.getDate(),
                    visibleName(byId.get(r.getSourceFundId())),
                    r.getDeposited(),
                    r.getUsed(),
                    r.getDeposited().subtract(r.getUsed())))
        .toList();
  }

  /**
   * Kaynak bankaya tahsilatı olan cariler (kalanı olan, kullanıcının iş yeri kapsamındaki
   * tahsilatlar; izinsiz kullanıcıda personel cariler hiç dönmez).
   */
  @Transactional(readOnly = true)
  public List<FxCandidateAccountResponse> fxCandidateAccounts(UUID fundId, String currency) {
    visibleFund(fundId);
    BranchFilter filter = scope.filter(null, null);
    return queries
        .fxCandidateAccounts(
            fundId,
            normalizeCurrency(currency),
            filter.allBranches(),
            filter.branchIds(),
            access.employeeVisible())
        .stream()
        .map(
            r ->
                new FxCandidateAccountResponse(
                    r.getAccountId(),
                    r.getAccountCode(),
                    r.getAccountName(),
                    r.getCollectionCount().intValue(),
                    r.getRemainingTotal()))
        .toList();
  }

  /** Carinin bozulabilir tahsilatları; izinsiz kullanıcıya personel carisi 404. */
  @Transactional(readOnly = true)
  public List<FxCandidateCollectionResponse> fxCandidateCollections(
      UUID fundId, String currency, UUID accountId) {
    visibleFund(fundId);
    access.readable(accountId);
    BranchFilter filter = scope.filter(null, null);
    return queries
        .fxCandidateCollections(
            fundId,
            normalizeCurrency(currency),
            filter.allBranches(),
            filter.branchIds(),
            access.employeeVisible(),
            accountId)
        .stream()
        .map(
            r ->
                new FxCandidateCollectionResponse(
                    r.getSettlementId(),
                    r.getDate(),
                    r.getAmount(),
                    r.getBroken(),
                    r.getAmount().subtract(r.getBroken()),
                    r.getDescription()))
        .toList();
  }

  /** Transferler sekmesi: şirket içi + şirketler arası birleşik liste (§3.3.8). */
  @SuppressWarnings("java:S107")
  @Transactional(readOnly = true)
  public PageResponse<TransferListRowResponse> search(
      UUID companyId,
      List<UUID> branchIds,
      String transferType,
      TransferStatus status,
      LocalDate from,
      LocalDate to,
      String q,
      int page,
      int size) {
    if (size < 1 || size > MAX_PAGE_SIZE) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "PAGE_SIZE_INVALID", "Sayfa boyutu 1–200 olmalıdır.");
    }
    requireRange(from, to);
    String type = typeFilter(transferType);
    String pattern = pattern(q);
    BranchFilter filter = scope.filter(companyId, branchIds);
    BranchFilter visibility = visibility();
    int pageIndex = Math.max(0, page);
    String statusValue = status == null ? "" : status.name();
    List<TransferListRow> rows =
        queries.searchRaw(
            filter.companyId() == null,
            companyOrNone(filter),
            filter.allBranches(),
            filter.branchIds(),
            visibility.allBranches(),
            visibility.branchIds(),
            from,
            to,
            type,
            statusValue,
            pattern,
            size,
            (long) pageIndex * size);
    long total =
        queries.countRaw(
            filter.companyId() == null,
            companyOrNone(filter),
            filter.allBranches(),
            filter.branchIds(),
            visibility.allBranches(),
            visibility.branchIds(),
            from,
            to,
            type,
            statusValue,
            pattern);
    List<UUID> fxIds =
        rows.stream()
            .filter(r -> FundTransferType.FX_EXCHANGE.name().equals(r.getTransferType()))
            .filter(r -> TransferRecordType.FUND_TRANSFER.name().equals(r.getRecordType()))
            .map(TransferListRow::getId)
            .toList();
    Map<UUID, TransferCollectionRow> collections =
        fxIds.isEmpty()
            ? Map.of()
            : queries.collections(fxIds, access.employeeVisible()).stream()
                .collect(
                    Collectors.toMap(TransferCollectionRow::getTransferId, Function.identity()));
    Set<UUID> fx = new HashSet<>(fxIds);
    List<TransferListRowResponse> content =
        rows.stream().map(r -> toListRow(r, fx.contains(r.getId()), collections)).toList();
    return new PageResponse<>(content, pageIndex, size, total, (int) ((total + size - 1) / size));
  }

  /** Özet (yalnız geçerli kayıtlar): gruplar ve para birimi tutarları + TOTAL. */
  @Transactional(readOnly = true)
  public List<TransferSummaryRowResponse> summary(
      UUID companyId,
      List<UUID> branchIds,
      String transferType,
      LocalDate from,
      LocalDate to,
      String q) {
    requireRange(from, to);
    BranchFilter filter = scope.filter(companyId, branchIds);
    BranchFilter visibility = visibility();
    List<TransferSummaryRow> rows =
        queries.summaryRaw(
            filter.companyId() == null,
            companyOrNone(filter),
            filter.allBranches(),
            filter.branchIds(),
            visibility.allBranches(),
            visibility.branchIds(),
            from,
            to,
            typeFilter(transferType),
            TransferStatus.POSTED.name(),
            pattern(q));
    Map<TransferSummaryGroup, Long> counts = new EnumMap<>(TransferSummaryGroup.class);
    Map<TransferSummaryGroup, Map<String, BigDecimal>> amounts =
        new EnumMap<>(TransferSummaryGroup.class);
    for (TransferSummaryGroup group : TransferSummaryGroup.values()) {
      counts.put(group, 0L);
      amounts.put(group, new TreeMap<>());
    }
    for (TransferSummaryRow row : rows) {
      TransferSummaryGroup group = TransferSummaryGroup.valueOf(row.getGrp());
      for (TransferSummaryGroup target : List.of(group, TransferSummaryGroup.TOTAL)) {
        counts.merge(target, row.getCount(), Long::sum);
        amounts.get(target).merge(row.getCurrency().trim(), row.getTotal(), BigDecimal::add);
      }
    }
    return java.util.Arrays.stream(TransferSummaryGroup.values())
        .map(
            group ->
                new TransferSummaryRowResponse(
                    group,
                    counts.get(group),
                    amounts.get(group).entrySet().stream()
                        .map(e -> new CurrencyAmountResponse(e.getKey(), e.getValue()))
                        .toList()))
        .toList();
  }

  /**
   * Döviz bozum raporu (§3.3.9): aralıktaki bozumlar (kaynak ya da hedef fonu görünen), kaynakları,
   * zincir derinliği ve hiç bozulmamış dövizli tahsilatlar. Personel cari adları izinsiz {@code
   * null}.
   */
  @Transactional(readOnly = true)
  public FxReportResponse fxReport(UUID companyId, LocalDate from, LocalDate to) {
    requireRange(from, to);
    BranchFilter filter = scope.filter(companyId, null);
    boolean employees = access.employeeVisible();
    List<FundTransfer> all = transfers.fxInRange(filter.companyId(), from, to);
    Map<UUID, FundAccount> byId =
        fundsById(
            all.stream()
                .flatMap(t -> java.util.stream.Stream.of(t.getSourceFundId(), t.getTargetFundId()))
                .toList());
    List<FundTransfer> visible =
        all.stream()
            .filter(
                t ->
                    visible(byId.get(t.getSourceFundId()))
                        || visible(byId.get(t.getTargetFundId())))
            .toList();
    Map<UUID, List<FxSourceInfoRow>> sourceRows =
        visible.isEmpty()
            ? Map.of()
            : queries
                .sourceInfo(visible.stream().map(FundTransfer::getId).toList(), employees)
                .stream()
                .collect(Collectors.groupingBy(FxSourceInfoRow::getTransferId));
    Map<UUID, Integer> levels = new HashMap<>();
    List<FxReportRowResponse> rows = new ArrayList<>();
    Set<UUID> collectionIds = new HashSet<>();
    long posted = 0;
    long withoutCollection = 0;
    Map<String, BigDecimal> broken = new TreeMap<>();
    for (FundTransfer t : visible) {
      List<FxSourceInfoRow> rowSources = sourceRows.getOrDefault(t.getId(), List.of());
      if (t.getStatus() == TransferStatus.POSTED) {
        posted++;
        boolean hasCollection = false;
        for (FxSourceInfoRow s : rowSources) {
          if (TransferSourceKind.SETTLEMENT.name().equals(s.getKind())) {
            collectionIds.add(s.getRefId());
            hasCollection = true;
          }
        }
        if (!hasCollection) {
          withoutCollection++;
        }
        broken.merge(t.getSourceMoney().currency(), t.getSourceMoney().amount(), BigDecimal::add);
      }
      rows.add(
          new FxReportRowResponse(
              t.getId(),
              t.getCode(),
              t.getTransferDate(),
              level(t.getId(), levels, new HashSet<>()),
              visibleName(byId.get(t.getSourceFundId())),
              t.getSourceMoney(),
              visibleName(byId.get(t.getTargetFundId())),
              t.getTargetMoney(),
              t.getRate(),
              t.getRateOperation(),
              t.getFxDiffTl(),
              t.getStatus(),
              rowSources.stream()
                  .map(
                      s ->
                          new FxReportSourceResponse(
                              TransferSourceKind.valueOf(s.getKind()),
                              s.getRefId(),
                              s.getCode(),
                              s.getDate(),
                              s.getAccountName(),
                              s.getAmount(),
                              s.getUsed()))
                  .toList()));
    }
    List<FxUnbrokenCollectionResponse> unbroken =
        queries
            .unbrokenCollections(
                filter.companyId() == null,
                companyOrNone(filter),
                filter.allBranches(),
                filter.branchIds(),
                from,
                to,
                employees)
            .stream()
            .map(
                r ->
                    new FxUnbrokenCollectionResponse(
                        r.getSettlementId(),
                        r.getDate(),
                        r.getAccountName(),
                        new Money(r.getAmount(), r.getCurrency().trim())))
            .toList();
    return new FxReportResponse(
        new FxReportStatsResponse(
            collectionIds.size(),
            posted,
            withoutCollection,
            unbroken.size(),
            broken.entrySet().stream()
                .map(e -> new CurrencyAmountResponse(e.getKey(), e.getValue()))
                .toList()),
        rows,
        unbroken);
  }

  // --- iç akış

  /**
   * Aynı anahtarlı önceki transfer. İstek ve düzenlenen transfer ({@code replacesId}; oluşturmada
   * null) aynı olmalı; aksi 422 {@code IDEMPOTENCY_KEY_REUSED} — bir düzenlemenin anahtarı başka
   * bir transferin düzenlemesine ya da oluşturmaya bağlanamaz (SEC-8).
   */
  private Optional<FundTransfer> replay(FundTransferRequest request, String key, UUID replacesId) {
    if (key == null) {
      return Optional.empty();
    }
    return transfers
        .findByIdempotencyKey(key)
        .map(
            existing -> {
              requireWritable(existing);
              if (!sameRequest(existing, request)
                  || !Objects.equals(existing.getReplacesTransferId(), replacesId)) {
                throw new BusinessException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "IDEMPOTENCY_KEY_REUSED",
                    "Bu işlem anahtarı başka bir istek için kullanılmış.");
              }
              return existing;
            });
  }

  private boolean sameRequest(FundTransfer existing, FundTransferRequest request) {
    FundTransferType requested = request.transferType();
    if (requested == null) {
      Optional<FundAccount> from = funds.findById(request.fromFundId());
      Optional<FundAccount> to = funds.findById(request.toFundId());
      if (from.isEmpty() || to.isEmpty()) {
        return false;
      }
      requested = derivedType(from.get().getKind(), to.get().getKind());
    }
    boolean same =
        requested == existing.getTransferType()
            && existing.getSourceFundId().equals(request.fromFundId())
            && existing.getTargetFundId().equals(request.toFundId())
            && existing.getSourceMoney().equals(request.money())
            && existing.getTransferDate().equals(request.date());
    if (same && existing.getTransferType() == FundTransferType.FX_EXCHANGE) {
      same = existing.getTargetMoney().equals(request.targetMoney());
    }
    return same;
  }

  /** Kilitsiz doğrulama: fonlar, tür ve ZTO kuralları, tutarlar, masraflar, kur kararları. */
  private Plan plan(FundTransferRequest r) {
    if (r.fromFundId().equals(r.toFundId())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "TRANSFER_SAME_FUND", "Kaynak ve hedef hesap aynı olamaz.");
    }
    FundAccount from = visibleFund(r.fromFundId());
    FundAccount to = visibleFund(r.toFundId());
    if (!from.getCompanyId().equals(to.getCompanyId())) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "COMPANY_MISMATCH",
          "Şirketler arası aktarım 'Şirketler Arası Virman' ile yapılır.");
    }
    FundService.requireActive(from);
    FundService.requireActive(to);
    Money money = r.money();
    if (money.amount().signum() <= 0) {
      throw bad("AMOUNT_INVALID", "Tutar 0'dan büyük olmalıdır.");
    }
    FundTransferType type = r.transferType();
    boolean rulesChecked = type != null;
    if (type == null) {
      if (!from.getCurrency().equals(to.getCurrency())) {
        throw bad("CURRENCY_MISMATCH", "Kaynak ve hedef hesap aynı para biriminde olmalıdır.");
      }
      type = derivedType(from.getKind(), to.getKind());
    } else {
      ruleViolation(type, from, to)
          .ifPresent(
              v -> {
                throw new BusinessException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "TRANSFER_RULE_VIOLATION",
                    v.message(),
                    List.of("rule=" + v.rule()));
              });
    }
    if (!money.currency().equals(from.getCurrency())) {
      throw bad("CURRENCY_MISMATCH", "Tutarın para birimi hesabın para birimiyle aynı olmalıdır.");
    }
    Money target = money;
    FundTransfer.FxTerms fx = null;
    boolean exchange = type == FundTransferType.FX_EXCHANGE;
    if (exchange) {
      target = r.targetMoney();
      if (target == null || target.amount().signum() <= 0) {
        throw bad("TARGET_AMOUNT_REQUIRED", "Geçerli bir tutar giriniz.");
      }
      if (!target.currency().equals(to.getCurrency())) {
        throw bad(
            "CURRENCY_MISMATCH", "Hedef tutarın para birimi hedef hesabın para birimi olmalıdır.");
      }
      if (r.rate() == null || r.rate().signum() <= 0 || r.rateOperation() == null) {
        throw bad("RATE_REQUIRED", "Geçerli bir kur fiyatı giriniz.");
      }
      if (!fxMatches(money.amount(), r.rate(), r.rateOperation(), target.amount(), r.calcMode())) {
        throw new BusinessException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "FX_AMOUNT_MISMATCH",
            "Kaynak tutar, kur ve hedef tutar uyuşmuyor.",
            List.of(
                fxExpectedDetail(
                    money.amount(), r.rate(), r.rateOperation(), target.amount(), r.calcMode())));
      }
      fx = new FundTransfer.FxTerms(r.rate(), r.rateOperation(), r.calcMode());
    } else if (r.sources() != null && !r.sources().isEmpty()) {
      throw bad("SOURCES_NOT_ALLOWED", "Kaynak yalnız döviz bozumunda seçilebilir.");
    }
    List<CostPlan> costPlans = costs(r.costs(), from, to, money, target);

    Map<String, BigDecimal> manual = new HashMap<>();
    boolean derived = false;
    if (exchange) {
      Optional<BigDecimal> sourceRate = rates.findRate(money.currency(), r.date());
      Optional<BigDecimal> targetRate = rates.findRate(target.currency(), r.date());
      if (TRY.equals(money.currency()) && targetRate.isEmpty()) {
        manual.put(target.currency(), derivedRate(money.amount(), target.amount()));
        derived = true;
      } else if (TRY.equals(target.currency()) && sourceRate.isEmpty()) {
        manual.put(money.currency(), derivedRate(target.amount(), money.amount()));
        derived = true;
      } else if (sourceRate.isEmpty()) {
        throw rateMissing(money.currency());
      } else if (targetRate.isEmpty()) {
        throw rateMissing(target.currency());
      }
    } else {
      if (r.exchangeRate() != null) {
        manual.put(money.currency(), r.exchangeRate());
      }
      requireRate(money.currency(), r.date(), manual);
    }
    for (CostPlan cost : costPlans) {
      requireRate(cost.money().currency(), r.date(), manual);
    }
    return new Plan(
        from, to, type, rulesChecked, money, target, fx, costPlans, Map.copyOf(manual), derived);
  }

  private List<CostPlan> costs(
      List<TransferCostRequest> requests,
      FundAccount from,
      FundAccount to,
      Money money,
      Money target) {
    if (requests == null || requests.isEmpty()) {
      return List.of();
    }
    Set<TransferCostKind> seen = EnumSet.noneOf(TransferCostKind.class);
    List<CostPlan> plans = new ArrayList<>();
    for (TransferCostRequest cost : requests) {
      if (!seen.add(cost.kind())) {
        throw bad("COST_DUPLICATE", "Her masraf türü bir kez girilebilir.");
      }
      if (cost.kind() == TransferCostKind.KMV) {
        BigDecimal rate = cost.ratePercent();
        if (rate == null || rate.signum() == 0) {
          continue;
        }
        if (rate.signum() < 0 || rate.compareTo(KMV_MAX) > 0) {
          throw bad("KMV_RATE_INVALID", "KMV oranı 0 ile 10 arasında olmalıdır.");
        }
        FundAccount tryFund;
        BigDecimal base;
        if (TRY.equals(money.currency())) {
          tryFund = from;
          base = money.amount();
        } else if (TRY.equals(target.currency())) {
          tryFund = to;
          base = target.amount();
        } else {
          throw new BusinessException(
              HttpStatus.UNPROCESSABLE_ENTITY,
              "KMV_REQUIRES_TRY",
              "KMV için TL hesabı bulunamadı.");
        }
        if (cost.fundAccountId() != null) {
          FundAccount chosen = costFund(cost.fundAccountId(), from.getCompanyId());
          if (TRY.equals(chosen.getCurrency())) {
            tryFund = chosen;
          }
        }
        BigDecimal amount = kmvAmount(base, rate);
        if (amount.signum() > 0) {
          plans.add(new CostPlan(cost.kind(), tryFund, rate, base, new Money(amount, TRY)));
        }
      } else {
        BigDecimal amount = cost.amount();
        if (amount == null || amount.signum() == 0) {
          continue;
        }
        FundAccount fund =
            cost.fundAccountId() == null
                ? from
                : costFund(cost.fundAccountId(), from.getCompanyId());
        plans.add(
            new CostPlan(cost.kind(), fund, null, null, new Money(amount, fund.getCurrency())));
      }
    }
    return plans;
  }

  private FundAccount costFund(UUID id, UUID companyId) {
    FundAccount fund = visibleFund(id);
    if (!fund.getCompanyId().equals(companyId)) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "COMPANY_MISMATCH",
          "Masraf hesabı transferin şirketine ait olmalıdır.");
    }
    FundService.requireActive(fund);
    return fund;
  }

  private void requireRate(String currency, LocalDate date, Map<String, BigDecimal> manual) {
    if (!manual.containsKey(currency) && rates.findRate(currency, date).isEmpty()) {
      throw rateMissing(currency);
    }
  }

  /** Kilitler alınmışken: kaynaklar, kod, başlık, bacaklar, kur farkı ve masraflar. */
  private FundTransfer write(
      Plan plan, FundTransferRequest r, String idempotencyKey, UUID replacesId) {
    List<CheckedSource> checked = checkSources(plan, r.sources());
    UUID companyId = plan.from().getCompanyId();
    String code = numbers.next(companyId, DocumentType.FUND_TRANSFER, r.date());
    FundTransfer transfer =
        saveTransfer(
            new FundTransfer(
                companyId,
                code,
                plan.type(),
                r.date(),
                plan.from().getId(),
                plan.money(),
                plan.to().getId(),
                plan.target(),
                plan.fx(),
                blankToNull(r.documentNo()),
                blankToNull(r.description()),
                plan.rulesChecked(),
                replacesId,
                idempotencyKey));
    for (CheckedSource source : checked) {
      sources.save(
          source.kind() == TransferSourceKind.SETTLEMENT
              ? FundTransferSource.ofSettlement(
                  transfer.getId(), companyId, source.id(), source.used())
              : FundTransferSource.ofTransfer(
                  transfer.getId(), companyId, source.id(), source.used()));
    }
    String description =
        r.description() == null || r.description().isBlank()
            ? typeLabel(plan.type()) + " " + code
            : LedgerDescriptions.fit(r.description().trim());
    Map<String, BigDecimal> manual = plan.manualRates();
    FundTransaction out =
        fundLedger.post(
            new FundPosting(
                plan.from().getId(),
                FundDirection.OUT,
                plan.money(),
                r.date(),
                description,
                SOURCE_TRANSFER,
                transfer.getId(),
                manual.get(plan.money().currency())));
    FundTransaction in =
        fundLedger.post(
            new FundPosting(
                plan.to().getId(),
                FundDirection.IN,
                plan.target(),
                r.date(),
                description,
                SOURCE_TRANSFER,
                transfer.getId(),
                manual.get(plan.target().currency())));
    if (plan.type() == FundTransferType.FX_EXCHANGE) {
      BigDecimal diff =
          plan.derivedRate() ? BigDecimal.ZERO : in.getTlAmount().subtract(out.getTlAmount());
      transfer.setFxDiffTl(diff);
      if (diff.signum() != 0) {
        incomeExpense.record(
            diff.signum() > 0 ? IncomeExpenseDirection.INCOME : IncomeExpenseDirection.EXPENSE,
            IncomeExpenseCategory.FX_DIFF,
            SOURCE_TRANSFER,
            transfer.getId(),
            r.date(),
            new Money(diff.abs(), TRY),
            plan.from().getBranchId(),
            plan.from().getId(),
            "Döviz bozum kur farkı " + code,
            null);
      }
    }
    for (CostPlan cost : plan.costs()) {
      FundTransferCost row =
          costs.save(
              new FundTransferCost(
                  transfer.getId(),
                  companyId,
                  cost.kind(),
                  cost.fund().getId(),
                  cost.ratePercent(),
                  cost.baseAmount(),
                  cost.money(),
                  null));
      String label = costLabel(cost.kind()) + " " + code;
      BigDecimal rate = manual.get(cost.money().currency());
      fundLedger.post(
          new FundPosting(
              cost.fund().getId(),
              FundDirection.OUT,
              cost.money(),
              r.date(),
              label,
              SOURCE_COST,
              row.getId(),
              rate,
              FundCategory.valueOf(cost.kind().name())));
      incomeExpense.record(
          IncomeExpenseDirection.EXPENSE,
          IncomeExpenseCategory.BANK_CHARGE,
          SOURCE_COST,
          row.getId(),
          r.date(),
          cost.money(),
          cost.fund().getBranchId(),
          cost.fund().getId(),
          label,
          rate);
    }
    audit.record(AuditEvent.FUND_TRANSFER_CREATED, TARGET + transfer.getId(), code);
    entityManager.flush();
    return transfer;
  }

  /**
   * Döviz bozumu kaynakları kimlik sırasıyla {@code FOR UPDATE} kilitlenir ve kilit altında
   * denetlenir: tahsilat bu fona gelmiş, geçerli, aynı para birimli ve kullanıcının iş yeri
   * kapsamında olmalı; önceki bozum bu fona gelmiş geçerli bir bozum olmalı. Kalanı aşan kullanım
   * ve bozum tutarını aşan toplam 422 {@code FX_SOURCE_EXCEEDED}.
   */
  private List<CheckedSource> checkSources(Plan plan, List<TransferSourceRequest> requested) {
    if (requested == null || requested.isEmpty()) {
      return List.of();
    }
    Set<UUID> seen = new HashSet<>();
    for (TransferSourceRequest source : requested) {
      if (!seen.add(source.id())) {
        throw sourceInvalid("Aynı kaynak birden çok kez seçilemez.");
      }
    }
    List<TransferSourceRequest> ordered =
        requested.stream().sorted(Comparator.comparing(s -> s.id().toString())).toList();
    BigDecimal total = BigDecimal.ZERO;
    List<CheckedSource> checked = new ArrayList<>();
    for (TransferSourceRequest source : ordered) {
      BigDecimal remaining =
          source.kind() == TransferSourceKind.SETTLEMENT
              ? settlementRemaining(plan, source.id())
              : transferRemaining(plan, source.id());
      if (source.usedAmount().compareTo(remaining.add(SOURCE_TOLERANCE)) > 0) {
        String max = remaining.setScale(2, RoundingMode.HALF_UP).toPlainString();
        throw new BusinessException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "FX_SOURCE_EXCEEDED",
            "Girilen bozum tutarı tahsilat limitini aşıyor. En fazla " + max + " girebilirsiniz.",
            List.of("sourceId=" + source.id(), "max=" + max));
      }
      total = total.add(source.usedAmount());
      checked.add(new CheckedSource(source.kind(), source.id(), source.usedAmount()));
    }
    if (total.compareTo(plan.money().amount().add(SOURCE_TOLERANCE)) > 0) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "FX_SOURCE_EXCEEDED",
          "Kaynak toplamı bozum tutarını aşamaz.");
    }
    return checked;
  }

  private BigDecimal settlementRemaining(Plan plan, UUID id) {
    Settlement settlement =
        settlements
            .findForUpdate(id)
            .orElseThrow(() -> sourceInvalid("Kaynak tahsilat bulunamadı."));
    entityManager.refresh(settlement);
    Set<UUID> allowed = scope.allowedOrNull();
    boolean valid =
        settlement.getType() == SettlementType.COLLECTION
            && settlement.getStatus() == SettlementStatus.POSTED
            && plan.from().getId().equals(settlement.getFundAccountId())
            && plan.money().currency().equals(settlement.getMoney().currency())
            && plan.from().getCompanyId().equals(settlement.getCompanyId())
            && (allowed == null || allowed.contains(settlement.getBranchId()));
    if (!valid) {
      throw sourceInvalid("Seçilen tahsilat bu bozumda kaynak olarak kullanılamaz.");
    }
    return settlement.getMoney().amount().subtract(sources.usedOfSettlement(id));
  }

  private BigDecimal transferRemaining(Plan plan, UUID id) {
    FundTransfer previous =
        transfers
            .findForUpdate(id)
            .orElseThrow(() -> sourceInvalid("Kaynak döviz bozumu bulunamadı."));
    entityManager.refresh(previous);
    boolean valid =
        previous.getTransferType() == FundTransferType.FX_EXCHANGE
            && previous.getStatus() == TransferStatus.POSTED
            && plan.from().getId().equals(previous.getTargetFundId());
    if (!valid) {
      throw sourceInvalid("Seçilen döviz bozumu bu bozumda kaynak olarak kullanılamaz.");
    }
    return previous.getTargetMoney().amount().subtract(sources.usedOfTransfer(id));
  }

  private void reverseLegs(FundTransfer transfer, LocalDate date, String legText, String reason) {
    List<TransferDependentRow> dependents = queries.dependents(transfer.getId());
    if (!dependents.isEmpty()) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "TRANSFER_HAS_DEPENDENTS",
          "Bu döviz bozum silinemez!",
          dependents.stream().map(d -> "dependent=" + d.getCode()).toList());
    }
    fundLedger.reverseSource(SOURCE_TRANSFER, transfer.getId(), date, legText);
    incomeExpense.reverseSource(SOURCE_TRANSFER, transfer.getId(), date, legText);
    for (FundTransferCost cost : costs.findByTransferId(transfer.getId())) {
      fundLedger.reverseSource(SOURCE_COST, cost.getId(), date, legText);
      incomeExpense.reverseSource(SOURCE_COST, cost.getId(), date, legText);
    }
    transfer.markReversed(date, reason);
  }

  private FundTransfer saveTransfer(FundTransfer transfer) {
    try {
      return transfers.saveAndFlush(transfer);
    } catch (DataIntegrityViolationException ex) {
      if (String.valueOf(ex.getMostSpecificCause().getMessage()).contains(IDEMPOTENCY_INDEX)) {
        throw new BusinessException(
            HttpStatus.CONFLICT, "IDEMPOTENCY_IN_PROGRESS", "Aynı işlem şu anda kaydediliyor.");
      }
      throw ex;
    }
  }

  private void lockFunds(Collection<UUID> ids) {
    funds.lockAll(new ArrayList<>(new LinkedHashSet<>(ids)));
  }

  private List<UUID> fundIdsOf(FundTransfer transfer) {
    Set<UUID> ids = new LinkedHashSet<>();
    ids.add(transfer.getSourceFundId());
    ids.add(transfer.getTargetFundId());
    costs.findByTransferId(transfer.getId()).forEach(c -> ids.add(c.getFundAccountId()));
    return new ArrayList<>(ids);
  }

  private static void requirePosted(FundTransfer transfer) {
    if (transfer.getStatus() != TransferStatus.POSTED) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "TRANSFER_REVERSED", "İptal edilmiş transfer düzenlenemez.");
    }
  }

  // --- kapsam

  /** Kayıt görünür mü: kaynak ya da hedef fon kapsamda; ikisi de dışındaysa 404. */
  private void requireReadable(FundTransfer transfer) {
    if (!visible(fund(transfer.getSourceFundId())) && !visible(fund(transfer.getTargetFundId()))) {
      throw notFound();
    }
  }

  /**
   * Yazma: hareketin dokunduğu her fon (kaynak, hedef ve masraf fonları) kapsamda (OK-12.2-11);
   * kaynak ve hedef görünmüyorsa 404, herhangi biri dışındaysa 403.
   */
  private void requireWritable(FundTransfer transfer) {
    boolean source = visible(fund(transfer.getSourceFundId()));
    boolean target = visible(fund(transfer.getTargetFundId()));
    if (!source && !target) {
      throw notFound();
    }
    if (!source || !target) {
      throw BranchScopeService.outOfScope();
    }
    if (scope.allowedOrNull() == null) {
      return;
    }
    for (FundTransferCost cost : costs.findByTransferId(transfer.getId())) {
      if (!visible(fund(cost.getFundAccountId()))) {
        throw BranchScopeService.outOfScope();
      }
    }
  }

  /** Fon kapsamda mı (LIMITED kullanıcıda iş yeri izinli); bilinmeyen fon görünmez. */
  boolean visible(FundAccount fund) {
    if (fund == null) {
      return false;
    }
    Set<UUID> allowed = scope.allowedOrNull();
    return allowed == null || allowed.contains(fund.getBranchId());
  }

  /** Kullanıcının iş yeri kapsamı (şirket ve iş yeri süzgecinden bağımsız). */
  private BranchFilter visibility() {
    Set<UUID> allowed = scope.allowedOrNull();
    return allowed == null ? BranchFilter.all(null) : BranchFilter.limited(null, allowed);
  }

  private FundAccount fund(UUID id) {
    return funds.findById(id).orElse(null);
  }

  /** Bilinmeyen fon 404 {@code FUND_NOT_FOUND}, kapsam dışı 403. */
  FundAccount visibleFund(UUID id) {
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

  private Map<UUID, FundAccount> fundsById(Collection<UUID> ids) {
    Set<UUID> unique = ids.stream().filter(Objects::nonNull).collect(Collectors.toSet());
    if (unique.isEmpty()) {
      return Map.of();
    }
    return funds.findAllById(unique).stream()
        .collect(Collectors.toMap(FundAccount::getId, Function.identity()));
  }

  private String visibleName(FundAccount fund) {
    return visible(fund) ? fund.getName() : null;
  }

  private FundTransfer find(UUID id) {
    return transfers.findById(id).orElseThrow(FundTransferService::notFound);
  }

  // --- yanıtlar

  private FundTransferResponse response(FundTransfer t) {
    List<FundTransferCost> costRows = costs.findByTransferId(t.getId());
    List<UUID> ids = new ArrayList<>(List.of(t.getSourceFundId(), t.getTargetFundId()));
    costRows.forEach(c -> ids.add(c.getFundAccountId()));
    Map<UUID, FundAccount> byId = fundsById(ids);
    FundAccount from = byId.get(t.getSourceFundId());
    FundAccount to = byId.get(t.getTargetFundId());
    boolean fromVisible = visible(from);
    boolean toVisible = visible(to);
    List<TransferSourceResponse> sourceRows =
        queries.sourceInfo(List.of(t.getId()), access.employeeVisible()).stream()
            .map(
                s ->
                    new TransferSourceResponse(
                        s.getSourceRowId(),
                        TransferSourceKind.valueOf(s.getKind()),
                        s.getRefId(),
                        s.getCode(),
                        s.getDate(),
                        s.getAmount(),
                        s.getUsed()))
            .toList();
    return new FundTransferResponse(
        t.getId(),
        t.getId(),
        t.getCode(),
        t.getCompanyId(),
        t.getTransferType(),
        t.getTransferDate(),
        t.getSourceFundId(),
        fromVisible ? from.getCode() : null,
        fromVisible ? from.getName() : null,
        t.getTargetFundId(),
        toVisible ? to.getCode() : null,
        toVisible ? to.getName() : null,
        t.getSourceMoney(),
        t.getTargetMoney(),
        t.getRate(),
        t.getRateOperation(),
        t.getCalcMode(),
        t.getFxDiffTl(),
        t.getDocumentNo(),
        t.getDescription(),
        t.getStatus(),
        t.getReversedAt(),
        t.getReversalReason(),
        t.getReplacesTransferId(),
        transfers.findFirstByReplacesTransferId(t.getId()).map(FundTransfer::getId).orElse(null),
        costRows.stream()
            .map(
                c ->
                    new TransferCostResponse(
                        c.getId(),
                        c.getCostKind(),
                        c.getFundAccountId(),
                        c.getRatePercent(),
                        c.getBaseAmount(),
                        c.getMoney()))
            .toList(),
        sourceRows,
        t.getCreatedBy(),
        t.getCreatedAt());
  }

  private static TransferListRowResponse toListRow(
      TransferListRow r, boolean fx, Map<UUID, TransferCollectionRow> collections) {
    boolean fromVisible = Boolean.TRUE.equals(r.getFromVisible());
    boolean toVisible = Boolean.TRUE.equals(r.getToVisible());
    TransferStatus status = TransferStatus.valueOf(r.getStatus());
    TransferCollectionResponse collection = null;
    if (fx) {
      TransferCollectionRow c = collections.get(r.getId());
      TransferCollectionState state;
      if (status == TransferStatus.REVERSED) {
        state = TransferCollectionState.CANCELLED;
      } else if (c == null) {
        state = TransferCollectionState.NONE;
      } else {
        state =
            c.getRemaining().compareTo(SOURCE_TOLERANCE) <= 0
                ? TransferCollectionState.COMPLETE
                : TransferCollectionState.PARTIAL;
      }
      collection =
          c == null
              ? new TransferCollectionResponse(null, null, null, null, null, state)
              : new TransferCollectionResponse(
                  c.getSettlementId(),
                  c.getDate(),
                  c.getAmount(),
                  c.getAccountId(),
                  c.getAccountName(),
                  state);
    }
    return new TransferListRowResponse(
        TransferRecordType.valueOf(r.getRecordType()),
        r.getId(),
        r.getCode(),
        FundTransferType.valueOf(r.getTransferType()),
        r.getReasonType() == null ? null : IntercompanyReason.valueOf(r.getReasonType()),
        r.getTransferDate(),
        r.getCompanyId(),
        r.getToCompanyId(),
        r.getFromFundId(),
        fromVisible ? r.getFromFundCode() : null,
        fromVisible ? r.getFromFundName() : null,
        FundKind.valueOf(r.getFromKind()),
        fromVisible ? r.getFromBranchId() : null,
        r.getToFundId(),
        toVisible ? r.getToFundCode() : null,
        toVisible ? r.getToFundName() : null,
        FundKind.valueOf(r.getToKind()),
        toVisible ? r.getToBranchId() : null,
        new Money(r.getSourceAmount(), r.getSourceCurrency().trim()),
        new Money(r.getTargetAmount(), r.getTargetCurrency().trim()),
        r.getRate(),
        r.getRateOperation() == null ? null : RateOperation.valueOf(r.getRateOperation()),
        r.getCostTotalTl(),
        r.getCostFundNames(),
        collection,
        r.getDescription(),
        status,
        r.getDocumentNo());
  }

  /** Döviz bozum zincir derinliği: tahsilattan doğrudan 1, önceki bozumdan önceki + 1. */
  private int level(UUID transferId, Map<UUID, Integer> levels, Set<UUID> visiting) {
    Integer known = levels.get(transferId);
    if (known != null) {
      return known;
    }
    if (!visiting.add(transferId)) {
      return 1;
    }
    int level = 1;
    for (FundTransferSource source : sources.findByTransferId(transferId)) {
      if (source.getSourceKind() == TransferSourceKind.TRANSFER) {
        level = Math.max(level, level(source.getSourceTransferId(), levels, visiting) + 1);
      }
    }
    levels.put(transferId, level);
    return level;
  }

  // --- saf kurallar (birim testli)

  /** Eski gövde: tür hesap türlerinden türetilir. */
  static FundTransferType derivedType(FundKind from, FundKind to) {
    if (from == FundKind.BANK) {
      return to == FundKind.BANK ? FundTransferType.EFT : FundTransferType.BANK_TO_CASH;
    }
    return to == FundKind.BANK ? FundTransferType.CASH_TO_BANK : FundTransferType.CASH_TO_CASH;
  }

  /** ZTO hedef kuralları (§3.3.1 adım 5); döviz bozumunda iş yeri kısıtı yoktur (OK-12.2-30). */
  static Optional<RuleViolation> ruleViolation(
      FundTransferType type, FundAccount from, FundAccount to) {
    boolean bankToBank = from.getKind() == FundKind.BANK && to.getKind() == FundKind.BANK;
    boolean sameCurrency = from.getCurrency().equals(to.getCurrency());
    boolean sameBank = sameBank(from.getBankName(), to.getBankName());
    boolean sameWorkplace = from.getBranchId().equals(to.getBranchId());
    RuleViolation violation =
        switch (type) {
          case VIREMENT -> {
            if (!bankToBank) {
              yield new RuleViolation("KIND", "Virman yalnız banka hesapları arasında yapılır.");
            }
            if (!sameCurrency) {
              yield new RuleViolation("CURRENCY", "Para birimi kaynak banka ile aynı olmalı.");
            }
            if (!sameBank) {
              yield new RuleViolation(
                  "SAME_BANK", "Virman sadece aynı banka (Bank alanı) arasında yapılabilir.");
            }
            if (!sameWorkplace) {
              yield new RuleViolation(
                  "SAME_WORKPLACE",
                  "Virman aynı iş yeri, banka ve para biriminin farklı hesapları arasındaki"
                      + " işlemidir.");
            }
            yield null;
          }
          case EFT, WIRE -> {
            if (!bankToBank) {
              yield new RuleViolation(
                  "KIND", "EFT/Havale yalnız banka hesapları arasında yapılır.");
            }
            if (!sameCurrency) {
              yield new RuleViolation("CURRENCY", "Para birimi kaynak banka ile aynı olmalı.");
            }
            if (sameBank && sameWorkplace) {
              yield new RuleViolation(
                  "SAME_BANK_SAME_WORKPLACE", "Aynı iş yerinde aynı bankaya EFT/Havale yapılamaz.");
            }
            yield null;
          }
          case FX_EXCHANGE -> {
            if (!bankToBank) {
              yield new RuleViolation(
                  "KIND", "Döviz bozum yalnız banka hesapları arasında yapılır.");
            }
            if (sameCurrency) {
              yield new RuleViolation(
                  "FX_CURRENCY", "Döviz bozumda hedef banka farklı para biriminde olmalı.");
            }
            yield null;
          }
          case BANK_TO_CASH ->
              kindAndCurrency(
                  from.getKind() == FundKind.BANK && to.getKind() == FundKind.CASH,
                  sameCurrency,
                  "Bankadan kasaya transferde kaynak banka, hedef kasa olmalıdır.");
          case CASH_TO_BANK ->
              kindAndCurrency(
                  from.getKind() == FundKind.CASH && to.getKind() == FundKind.BANK,
                  sameCurrency,
                  "Kasadan bankaya transferde kaynak kasa, hedef banka olmalıdır.");
          case CASH_TO_CASH ->
              kindAndCurrency(
                  from.getKind() == FundKind.CASH && to.getKind() == FundKind.CASH,
                  sameCurrency,
                  "Kasadan kasaya transfer yalnız kasalar arasında yapılır.");
        };
    if (violation == null
        && (from.getAccountType() != FundAccountType.DEMAND
            || to.getAccountType() != FundAccountType.DEMAND)) {
      violation =
          new RuleViolation("ACCOUNT_TYPE", "Transfer yalnız vadesiz hesaplar arasında yapılır.");
    }
    return Optional.ofNullable(violation);
  }

  private static RuleViolation kindAndCurrency(
      boolean kindOk, boolean sameCurrency, String kindMessage) {
    if (!kindOk) {
      return new RuleViolation("KIND", kindMessage);
    }
    if (!sameCurrency) {
      return new RuleViolation("CURRENCY", "Kaynak ve hedef hesap aynı para biriminde olmalıdır.");
    }
    return null;
  }

  /** Banka adı büyük/küçük harf ve boşluk duyarsız eşit mi; boş ad hiçbir bankaya eşit değil. */
  static boolean sameBank(String a, String b) {
    String left = normalizeBank(a);
    String right = normalizeBank(b);
    return !left.isEmpty() && left.equals(right);
  }

  private static String normalizeBank(String name) {
    return name == null ? "" : name.replaceAll("\\s+", "").toLowerCase(Locale.forLanguageTag("tr"));
  }

  /** Kurla beklenen hedef tutar (2 hane, HALF_UP). */
  static BigDecimal fxExpected(BigDecimal source, BigDecimal rate, RateOperation operation) {
    BigDecimal value =
        operation == RateOperation.MULTIPLY
            ? source.multiply(rate)
            : source.divide(rate, 10, RoundingMode.HALF_UP);
    return value.setScale(2, RoundingMode.HALF_UP);
  }

  /** Hedef tutar kurla beklenen değerden en çok 0,01 sapabilir (kip SOURCE_RATE). */
  static boolean fxMatches(
      BigDecimal source, BigDecimal rate, RateOperation operation, BigDecimal target) {
    return fxMatches(source, rate, operation, target, FxCalcMode.SOURCE_RATE);
  }

  /**
   * Kipe bağlı denetim (F-12.2-1): istemcinin HESAPLADIĞI değer, girilen iki değerden yeniden
   * hesaplanıp karşılaştırılır. SOURCE_RATE (ve eski istemcide {@code null}) → hedef ±0,01;
   * RATE_TARGET → kaynak ±0,01; SOURCE_TARGET → kur 6 hanede ±0,000001.
   */
  static boolean fxMatches(
      BigDecimal source,
      BigDecimal rate,
      RateOperation operation,
      BigDecimal target,
      FxCalcMode mode) {
    if (mode == FxCalcMode.RATE_TARGET) {
      return fxExpectedSource(rate, operation, target)
              .subtract(source)
              .abs()
              .compareTo(FX_TOLERANCE)
          <= 0;
    }
    if (mode == FxCalcMode.SOURCE_TARGET) {
      return fxExpectedRate(source, operation, target)
              .subtract(rate)
              .abs()
              .compareTo(RATE_TOLERANCE)
          <= 0;
    }
    return fxExpected(source, rate, operation).subtract(target).abs().compareTo(FX_TOLERANCE) <= 0;
  }

  /** Kur + hedeften beklenen kaynak tutar (2 hane, HALF_UP): ×'te hedef ÷ kur, ÷'de hedef × kur. */
  static BigDecimal fxExpectedSource(BigDecimal rate, RateOperation operation, BigDecimal target) {
    BigDecimal value =
        operation == RateOperation.MULTIPLY
            ? target.divide(rate, 10, RoundingMode.HALF_UP)
            : target.multiply(rate);
    return value.setScale(2, RoundingMode.HALF_UP);
  }

  /** Kaynak + hedeften beklenen kur (6 hane, HALF_UP): ×'te hedef ÷ kaynak, ÷'de kaynak ÷ hedef. */
  static BigDecimal fxExpectedRate(BigDecimal source, RateOperation operation, BigDecimal target) {
    return operation == RateOperation.MULTIPLY
        ? target.divide(source, 6, RoundingMode.HALF_UP)
        : source.divide(target, 6, RoundingMode.HALF_UP);
  }

  /** Hata ayrıntısındaki beklenen değer: kipin hesapladığı alan. */
  static String fxExpectedDetail(
      BigDecimal source,
      BigDecimal rate,
      RateOperation operation,
      BigDecimal target,
      FxCalcMode mode) {
    if (mode == FxCalcMode.RATE_TARGET) {
      return "expectedSource=" + fxExpectedSource(rate, operation, target).toPlainString();
    }
    if (mode == FxCalcMode.SOURCE_TARGET) {
      return "expectedRate=" + fxExpectedRate(source, operation, target).toPlainString();
    }
    return "expected=" + fxExpected(source, rate, operation).toPlainString();
  }

  /** Kur tablosunda kur yokken döviz bacağının kuru: TL tutarı ÷ döviz tutarı (6 hane). */
  static BigDecimal derivedRate(BigDecimal tryAmount, BigDecimal foreignAmount) {
    return tryAmount.divide(foreignAmount, 6, RoundingMode.HALF_UP);
  }

  /** KMV tutarı: taban × oran / 100 (2 hane, HALF_UP). */
  static BigDecimal kmvAmount(BigDecimal base, BigDecimal ratePercent) {
    return base.multiply(ratePercent).divide(HUNDRED, 2, RoundingMode.HALF_UP);
  }

  /** İptal tarihi aralığı (F1): {@code transferDate ≤ date ≤ max(bugün, transferDate)}. */
  static void requireReverseDate(LocalDate transferDate, LocalDate date, LocalDate today) {
    if (date.isBefore(transferDate)) {
      throw bad("REVERSE_BEFORE_TRANSFER", "İptal tarihi transfer tarihinden önce olamaz.");
    }
    LocalDate max = today.isAfter(transferDate) ? today : transferDate;
    if (date.isAfter(max)) {
      throw bad("DATE_IN_FUTURE", "İptal tarihi ileri bir tarih olamaz.");
    }
  }

  static String typeLabel(FundTransferType type) {
    return switch (type) {
      case VIREMENT -> "Virman";
      case EFT -> "EFT";
      case WIRE -> "Havale";
      case FX_EXCHANGE -> "Döviz Bozum";
      case BANK_TO_CASH -> "Bankadan Kasaya";
      case CASH_TO_BANK -> "Kasadan Bankaya";
      case CASH_TO_CASH -> "Kasadan Kasaya";
    };
  }

  static String costLabel(TransferCostKind kind) {
    return switch (kind) {
      case COMMISSION -> "Komisyon";
      case FEE -> "Masraf";
      case KMV -> "KMV";
    };
  }

  /** Transfer merkezi derin bağlantısı (Transferler sekmesi, kodla arama). */
  public static String route(String code) {
    return ROUTE + URLEncoder.encode(code, StandardCharsets.UTF_8);
  }

  /**
   * Kod + transfer tarihiyle derin bağlantı (F-12.2-R2): Transferler sekmesinin varsayılan 7 günlük
   * aralığı eski kaydı dışarıda bırakmasın diye {@code from=to=transferDate}.
   */
  public static String route(String code, LocalDate transferDate) {
    return transferDate == null
        ? route(code)
        : route(code) + "&from=" + transferDate + "&to=" + transferDate;
  }

  static void requireRange(LocalDate from, LocalDate to) {
    if (from == null
        || to == null
        || to.isBefore(from)
        || ChronoUnit.DAYS.between(from, to) > MAX_RANGE_DAYS) {
      throw bad("DATE_RANGE_TOO_LARGE", "Tarih aralığı en çok 1 yıl olabilir.");
    }
  }

  private static String typeFilter(String transferType) {
    if (transferType == null || transferType.isBlank()) {
      return "";
    }
    String value = transferType.trim().toUpperCase(Locale.ROOT);
    if (TransferRecordType.INTERCOMPANY.name().equals(value)) {
      return value;
    }
    try {
      return FundTransferType.valueOf(value).name();
    } catch (IllegalArgumentException ex) {
      throw bad("TRANSFER_TYPE_INVALID", "Geçersiz transfer tipi.");
    }
  }

  private static String pattern(String q) {
    if (q != null && q.trim().length() > MAX_QUERY_LENGTH) {
      throw bad("QUERY_TOO_LONG", "Arama metni en çok 100 karakter olabilir.");
    }
    return FundQueryService.likePattern(q);
  }

  private static String normalizeCurrency(String currency) {
    if (currency == null || currency.isBlank()) {
      throw bad("CURRENCY_REQUIRED", "Para birimi seçilmelidir.");
    }
    return currency.trim().toUpperCase(Locale.ROOT);
  }

  private static UUID companyOrNone(BranchFilter filter) {
    return filter.companyId() == null ? BranchFilter.NONE : filter.companyId();
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  private static BusinessException bad(String code, String message) {
    return new BusinessException(HttpStatus.BAD_REQUEST, code, message);
  }

  private static BusinessException sourceInvalid(String message) {
    return new BusinessException(HttpStatus.UNPROCESSABLE_ENTITY, "FX_SOURCE_INVALID", message);
  }

  private static BusinessException rateMissing(String currency) {
    return new BusinessException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "RATE_MISSING",
        currency + " için kur bulunamadı. Lütfen kuru elle girin.");
  }

  static BusinessException notFound() {
    return new BusinessException(
        HttpStatus.NOT_FOUND, "TRANSFER_NOT_FOUND", "Transfer bilgisi alınamadı.");
  }
}
