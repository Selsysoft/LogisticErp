package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.AllocationTargetType;
import org.ece.blackrose.finance.domain.FinanceTypes.DailyReportSort;
import org.ece.blackrose.finance.domain.FinanceTypes.DocumentPaymentMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.InvoiceSide;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementChannel;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementLockReason;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountBankAccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundAccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.PaymentPlanRepository;
import org.ece.blackrose.finance.repository.SettlementQueryRepository;
import org.ece.blackrose.finance.repository.SettlementQueryRepository.AllocationRow;
import org.ece.blackrose.finance.repository.SettlementQueryRepository.DailyFundBalanceRow;
import org.ece.blackrose.finance.repository.SettlementQueryRepository.DailyInstrumentMovementRow;
import org.ece.blackrose.finance.repository.SettlementQueryRepository.ListCriteria;
import org.ece.blackrose.finance.repository.SettlementQueryRepository.OpenInvoiceRow;
import org.ece.blackrose.finance.repository.SettlementQueryRepository.SettlementItemRow;
import org.ece.blackrose.finance.repository.SettlementQueryRepository.SettlementLineRow;
import org.ece.blackrose.finance.repository.SettlementQueryRepository.SortSlots;
import org.ece.blackrose.finance.web.FinanceDtos.DailyFundBalanceResponse;
import org.ece.blackrose.finance.web.FinanceDtos.DailyInstrumentMovementResponse;
import org.ece.blackrose.finance.web.FinanceDtos.DailyReportResponse;
import org.ece.blackrose.finance.web.FinanceDtos.DailyTotal;
import org.ece.blackrose.finance.web.FinanceDtos.OpenInvoiceResponse;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementAllocationResponse;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementDetailResponse;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementLineResponse;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementListItemResponse;
import org.ece.blackrose.finance.web.FinanceMapper;
import org.ece.blackrose.identity.security.PersonalDataProtector;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.organization.CompanyResolver;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ödeme/tahsilat okuma yolu (12.2a_TASARIM §3.7): süzgeçli ve sunucu sayfalı liste, detay (defter
 * satırları, çek, plan, eşleşmeler) ve eşleştirilebilir açık fatura kalemleri. Personel carisi
 * izinsiz kullanıcıda listede maskeli, detayda 404 {@code SETTLEMENT_NOT_FOUND} (Rev 1
 * SEC-01/SEC-05); kapsam dışı iş yerindeki eşleşme hedefi ve fon IBAN'ı detayda gizlenir (SEC-07).
 */
@Service
@Transactional(readOnly = true)
public class SettlementQueryService {

  static final int MAX_PAGE_SIZE = 500;
  static final int MAX_QUERY_LENGTH = 100;
  static final long MAX_RANGE_DAYS = 366;
  static final int MAX_SORTS = 3;
  static final int OPEN_INVOICE_LIMIT = 200;
  static final int DAILY_LIMIT = 5000;

  /** Sıralanabilir alanlar (§3.7 beyaz listesi). */
  static final Set<String> SORT_FIELDS =
      Set.of("settlementDate", "createdAt", "amount", "accountName", "documentNo", "branchName");

  private static final LocalDate MIN_DATE = LocalDate.of(1900, 1, 1);
  private static final LocalDate MAX_DATE = LocalDate.of(9999, 12, 31);
  private static final UUID NONE = BranchFilter.NONE;
  private static final String TRY = "TRY";

  private final SettlementQueryRepository queries;
  private final BranchScopeService scope;
  private final AccountAccess access;
  private final AccountBankAccountRepository bankAccounts;
  private final CompanyResolver companies;
  private final FundAccountRepository funds;
  private final InstrumentQueryService instruments;
  private final PaymentPlanRepository plans;
  private final FinanceMapper mapper;

  @SuppressWarnings("java:S107")
  public SettlementQueryService(
      SettlementQueryRepository queries,
      BranchScopeService scope,
      AccountAccess access,
      AccountBankAccountRepository bankAccounts,
      CompanyResolver companies,
      FundAccountRepository funds,
      InstrumentQueryService instruments,
      PaymentPlanRepository plans,
      FinanceMapper mapper) {
    this.queries = queries;
    this.scope = scope;
    this.access = access;
    this.bankAccounts = bankAccounts;
    this.companies = companies;
    this.funds = funds;
    this.instruments = instruments;
    this.plans = plans;
    this.mapper = mapper;
  }

  /**
   * Liste süzgeçleri (§4.2). {@code null} alanlar süzmez; {@code methods} görünen yöntemdir (Kredi
   * Kartı = {@code CREDIT_CARD}, Senet = {@code NOTE}).
   */
  public record SettlementSearch(
      UUID companyId,
      UUID accountId,
      AccountType accountType,
      String subGroup,
      List<UUID> branchIds,
      List<UUID> fundAccountIds,
      List<DocumentPaymentMethod> methods,
      SettlementStatus status,
      LocalDate from,
      LocalDate to,
      String q,
      UUID counterpartyBankAccountId,
      Boolean hasAccount) {}

  /** Bir sıralama ölçütü. */
  record SortKey(String field, boolean ascending) {}

  // --- liste

  /**
   * Süzgeçli, sunucu sayfalı liste. {@code size} 1–{@value #MAX_PAGE_SIZE} (400 {@code
   * PAGE_SIZE_INVALID}); {@code sort} tekrarlı {@code alan,yön} (beyaz liste, en çok {@value
   * #MAX_SORTS}; 400 {@code SORT_INVALID}); carisiz aralık ≤ {@value #MAX_RANGE_DAYS} gün.
   */
  public Page<SettlementListItemResponse> list(
      SettlementType type, SettlementSearch search, int page, int size, List<String> sort) {
    if (page < 0 || size < 1 || size > MAX_PAGE_SIZE) {
      throw bad("PAGE_SIZE_INVALID", "Sayfa boyutu 1–500, sayfa 0 ya da büyük olmalıdır.");
    }
    SortSlots slots = slots(parseSort(sort));
    ListCriteria criteria = criteria(type, search);
    List<SettlementListItemResponse> content =
        queries.listItems(criteria, slots, size, (long) page * size).stream()
            .map(SettlementQueryService::toItem)
            .toList();
    long total = queries.countItems(criteria);
    return new PageImpl<>(content, PageRequest.of(page, size), total);
  }

  /** Süzgeçleri doğrular, okuma izinlerini denetler ve sorgu ölçütlerine çevirir. */
  private ListCriteria criteria(SettlementType type, SettlementSearch s) {
    LocalDate from = s.from();
    LocalDate to = s.to();
    if (from != null && to != null && from.isAfter(to)) {
      throw bad("DATE_RANGE_INVALID", "Başlangıç tarihi bitiş tarihinden sonra olamaz.");
    }
    if (s.accountId() == null
        && from != null
        && to != null
        && ChronoUnit.DAYS.between(from, to) > MAX_RANGE_DAYS) {
      throw bad("DATE_RANGE_TOO_LARGE", "Tarih aralığı en çok 1 yıl olabilir.");
    }
    String q = s.q() == null ? "" : s.q().trim();
    if (q.length() > MAX_QUERY_LENGTH) {
      throw bad("QUERY_TOO_LONG", "Arama metni en çok 100 karakter olabilir.");
    }
    List<String> methods = methodNames(s.methods());
    if (s.accountId() != null) {
      access.readable(s.accountId());
    }
    if (s.counterpartyBankAccountId() != null) {
      UUID owner =
          bankAccounts
              .findById(s.counterpartyBankAccountId())
              .orElseThrow(AccountAccess::notFound)
              .getAccountId();
      access.readable(owner);
    }
    BranchFilter filter = scope.filter(s.companyId(), s.branchIds());
    List<UUID> fundIds =
        s.fundAccountIds() == null ? List.of() : s.fundAccountIds().stream().distinct().toList();
    return new ListCriteria(
        type.name(),
        access.employeeVisible(),
        filter.companyId() == null,
        filter.companyId() == null ? NONE : filter.companyId(),
        filter.allBranches(),
        filter.branchIds(),
        s.accountId() == null,
        s.accountId() == null ? NONE : s.accountId(),
        s.accountType() == null ? "" : s.accountType().name(),
        s.subGroup() == null ? "" : s.subGroup().trim(),
        fundIds.isEmpty(),
        fundIds.isEmpty() ? List.of(NONE) : fundIds,
        methods.isEmpty(),
        methods.isEmpty() ? List.of("") : methods,
        s.status() == null ? "" : s.status().name(),
        from == null ? MIN_DATE : from,
        to == null ? MAX_DATE : to,
        s.counterpartyBankAccountId() == null,
        s.counterpartyBankAccountId() == null ? NONE : s.counterpartyBankAccountId(),
        hasAccountFlag(s.hasAccount()),
        FundQueryService.likePattern(q));
  }

  private static List<String> methodNames(List<DocumentPaymentMethod> methods) {
    if (methods == null) {
      return List.of();
    }
    if (methods.contains(DocumentPaymentMethod.OTHER)) {
      throw bad("METHOD_INVALID", "Ödeme şekli geçersiz.");
    }
    return methods.stream().map(Enum::name).distinct().toList();
  }

  private static String hasAccountFlag(Boolean hasAccount) {
    if (hasAccount == null) {
      return "";
    }
    return hasAccount ? "Y" : "N";
  }

  /**
   * {@code sort} parametreleri: Spring tek değeri virgülden böler ({@code ["amount","asc"]}),
   * tekrarlı değerleri bölmez ({@code ["settlementDate,desc","createdAt,desc"]}); ikisi de aynı
   * okunur. Boşsa varsayılan {@code settlementDate desc, createdAt desc}.
   */
  static List<SortKey> parseSort(List<String> sort) {
    List<String> tokens = new ArrayList<>();
    if (sort != null) {
      for (String value : sort) {
        if (value == null) {
          continue;
        }
        for (String token : value.split(",")) {
          if (!token.isBlank()) {
            tokens.add(token.trim());
          }
        }
      }
    }
    List<SortKey> keys = new ArrayList<>();
    for (String token : tokens) {
      String lower = token.toLowerCase(Locale.ROOT);
      if (lower.equals("asc") || lower.equals("desc")) {
        if (keys.isEmpty()) {
          throw sortInvalid();
        }
        SortKey last = keys.remove(keys.size() - 1);
        keys.add(new SortKey(last.field(), lower.equals("asc")));
      } else if (SORT_FIELDS.contains(token)) {
        keys.add(new SortKey(token, true));
      } else {
        throw sortInvalid();
      }
    }
    if (keys.size() > MAX_SORTS) {
      throw sortInvalid();
    }
    if (keys.isEmpty()) {
      return List.of(new SortKey("settlementDate", false), new SortKey("createdAt", false));
    }
    return keys;
  }

  private static SortSlots slots(List<SortKey> keys) {
    SortKey[] slot = new SortKey[MAX_SORTS];
    for (int i = 0; i < MAX_SORTS; i++) {
      slot[i] = i < keys.size() ? keys.get(i) : new SortKey("", true);
    }
    return new SortSlots(
        slot[0].field(),
        slot[0].ascending(),
        slot[1].field(),
        slot[1].ascending(),
        slot[2].field(),
        slot[2].ascending());
  }

  // --- satır türetmeleri (SettlementListItemMapperTest)

  /** Ham satırdan yanıt: kilit nedeni, iptal/düzeltme uygunluğu ve döviz bozumu kalanı. */
  static SettlementListItemResponse toItem(SettlementItemRow row) {
    SettlementType type = SettlementType.valueOf(row.getType());
    SettlementMethod method = SettlementMethod.valueOf(row.getMethod());
    SettlementStatus status = SettlementStatus.valueOf(row.getStatus());
    boolean masked = Boolean.TRUE.equals(row.getEmployeeMasked());
    boolean transferred = Boolean.TRUE.equals(row.getTransferred());
    BigDecimal fxUsed = row.getFxUsed() == null ? BigDecimal.ZERO : row.getFxUsed();
    boolean checkLocked =
        method == SettlementMethod.CHECK
            && !InstrumentRules.settlementReversible(
                type,
                row.getInstrumentDirection() == null
                    ? null
                    : InstrumentDirection.valueOf(row.getInstrumentDirection()),
                row.getInstrumentStatus() == null
                    ? null
                    : InstrumentStatus.valueOf(row.getInstrumentStatus()),
                row.getInstrumentEndorsedAccountId(),
                row.getAccountId());
    SettlementLockReason lockReason =
        lockReason(
            status,
            checkLocked,
            row.getPlanId() != null,
            Boolean.TRUE.equals(row.getIntercompanyLinked()),
            Boolean.TRUE.equals(row.getVehicleExpenseLinked()),
            Boolean.TRUE.equals(row.getExpenseLinked()),
            fxUsed,
            transferred);
    boolean reversible = lockReason == null && !masked;
    boolean correctable =
        reversible
            && (method == SettlementMethod.CASH
                || method == SettlementMethod.BANK
                || method == SettlementMethod.CHECK)
            && row.getAccountId() != null;
    return new SettlementListItemResponse(
        row.getId(),
        type,
        method,
        row.getChannel() == null ? null : SettlementChannel.valueOf(row.getChannel()),
        DocumentPaymentMethod.valueOf(row.getDisplayMethod()),
        row.getAccountId(),
        row.getAccountCode(),
        row.getAccountName(),
        row.getAccountType() == null ? null : AccountType.valueOf(row.getAccountType()),
        row.getAccountSubGroup(),
        row.getAccountGroupName(),
        masked,
        row.getBranchId(),
        row.getBranchName(),
        row.getBranchGroupName(),
        row.getCompanyId(),
        row.getFundAccountId(),
        row.getFundName(),
        row.getFundKind() == null ? null : FundKind.valueOf(row.getFundKind()),
        row.getFundBankName(),
        row.getFundBankBranchName(),
        row.getInstrumentId(),
        row.getInstrumentKind() == null ? null : InstrumentKind.valueOf(row.getInstrumentKind()),
        row.getInstrumentNumber(),
        row.getInstrumentStatus() == null
            ? null
            : InstrumentStatus.valueOf(row.getInstrumentStatus()),
        row.getExpenseItemId(),
        row.getExpenseItemName(),
        row.getPlanId(),
        new Money(row.getAmount(), row.getCurrency()),
        row.getExchangeRate(),
        row.getTlAmount(),
        row.getSettlementDate(),
        row.getDocumentNo(),
        row.getDescription(),
        status,
        row.getCounterpartyBankAccountId(),
        row.getCounterpartyIbanMasked(),
        row.getCounterpartyBankName(),
        row.getCorrectsSettlementId(),
        row.getCorrectedById(),
        row.getReverseReason(),
        row.getReversedOn(),
        AccountTransactionQueryService.instant(row.getCreatedAt()),
        row.getCreatedBy(),
        Boolean.TRUE.equals(row.getIntercompany()),
        Boolean.TRUE.equals(row.getCredit()),
        transferred,
        fxUsed,
        fxRemaining(type, row.getCurrency(), row.getAmount(), fxUsed),
        lockReason,
        reversible,
        correctable);
  }

  /**
   * İptal/düzeltmeyi engelleyen ilk neden (§3.7 sırası): iptal edilmiş, ilerlemiş çek ({@code
   * checkLocked}, 12.3 §3.8), plan ödemesi, şirketler arası virman bacağı, araç gideri, genel
   * masraf, döviz bozumu kaynağı, cari taşıması; yoksa {@code null}.
   */
  @SuppressWarnings("java:S107")
  static SettlementLockReason lockReason(
      SettlementStatus status,
      boolean checkLocked,
      boolean plan,
      boolean intercompany,
      boolean vehicleExpense,
      boolean expense,
      BigDecimal fxUsed,
      boolean transferred) {
    if (status == SettlementStatus.REVERSED) {
      return SettlementLockReason.REVERSED;
    }
    if (checkLocked) {
      return SettlementLockReason.CHECK;
    }
    if (plan) {
      return SettlementLockReason.PLAN;
    }
    if (intercompany) {
      return SettlementLockReason.INTERCOMPANY;
    }
    if (vehicleExpense) {
      return SettlementLockReason.VEHICLE_EXPENSE;
    }
    if (expense) {
      return SettlementLockReason.EXPENSE;
    }
    if (fxUsed.signum() > 0) {
      return SettlementLockReason.FX_SOURCE;
    }
    if (transferred) {
      return SettlementLockReason.TRANSFERRED;
    }
    return null;
  }

  /** Döviz bozumuna kalan: yalnız TRY dışı tahsilatta {@code tutar − kullanılan}, aksi halde 0. */
  static BigDecimal fxRemaining(
      SettlementType type, String currency, BigDecimal amount, BigDecimal fxUsed) {
    if (TRY.equals(currency) || type != SettlementType.COLLECTION) {
      return BigDecimal.ZERO;
    }
    return amount.subtract(fxUsed);
  }

  // --- detay

  /**
   * Tek kayıt: yoksa (ya da izinsiz kullanıcıya personel carili kayıtsa) 404 {@code
   * SETTLEMENT_NOT_FOUND}, iş yeri kapsam dışıysa 403.
   */
  public SettlementDetailResponse detail(UUID id) {
    SettlementItemRow row =
        queries.item(id, access.employeeVisible()).orElseThrow(SettlementQueryService::notFound);
    scope.requireVisible(row.getBranchId());
    if (Boolean.TRUE.equals(row.getEmployeeMasked())) {
      throw notFound();
    }
    SettlementListItemResponse item = toItem(row);
    List<SettlementLineResponse> lines =
        queries.lines(id).stream().map(SettlementQueryService::toLine).toList();
    Set<UUID> allowed = scope.allowedOrNull();
    boolean posted = item.status() == SettlementStatus.POSTED;
    List<SettlementAllocationResponse> allocations =
        queries.allocationsOf(id).stream()
            .map(allocation -> toAllocation(allocation, posted, allowed))
            .toList();
    return new SettlementDetailResponse(
        item,
        lines,
        row.getInstrumentId() == null ? null : instruments.viewOrNull(row.getInstrumentId()),
        row.getPlanId() == null
            ? null
            : plans.findById(row.getPlanId()).map(mapper::toResponse).orElse(null),
        allocations,
        fundIban(row, allowed),
        queries.bankStatementMatched(id));
  }

  /** Fonun maskeli IBAN'ı; fon kapsam dışı iş yerindeyse ya da IBAN yoksa {@code null}. */
  private String fundIban(SettlementItemRow row, Set<UUID> allowed) {
    if (row.getFundAccountId() == null || !inScope(row.getFundBranchId(), allowed)) {
      return null;
    }
    return funds
        .findById(row.getFundAccountId())
        .map(FundAccount::getIban)
        .filter(iban -> !iban.isBlank())
        .map(
            iban ->
                PersonalDataProtector.maskIban(iban.replaceAll("\\s", "").toUpperCase(Locale.ROOT)))
        .orElse(null);
  }

  static SettlementLineResponse toLine(SettlementLineRow row) {
    return new SettlementLineResponse(
        row.getLedger(),
        row.getTransactionId(),
        row.getDirection(),
        new Money(row.getAmount(), row.getCurrency()),
        row.getExchangeRate(),
        row.getTlAmount(),
        row.getTransactionDate(),
        Boolean.TRUE.equals(row.getReversal()));
  }

  /**
   * Eşleşme satırı; hedefin iş yeri kullanıcının kapsamı dışındaysa yalnız tür, tutar ve bayraklar
   * döner (Rev 1 SEC-07). {@code allowed} {@code null} = tüm iş yerleri.
   */
  static SettlementAllocationResponse toAllocation(
      AllocationRow row, boolean settlementPosted, Set<UUID> allowed) {
    boolean cancelled = Boolean.TRUE.equals(row.getTargetCancelled());
    boolean outOfScope = !inScope(row.getTargetBranchId(), allowed);
    return new SettlementAllocationResponse(
        row.getId(),
        AllocationTargetType.valueOf(row.getTargetType()),
        outOfScope ? null : row.getTargetId(),
        outOfScope ? null : row.getTargetNumber(),
        outOfScope ? null : row.getTargetTypeName(),
        outOfScope ? null : row.getInvoiceDate(),
        outOfScope ? null : row.getDueDate(),
        new Money(row.getAmount(), row.getCurrency()),
        cancelled,
        settlementPosted && !cancelled,
        outOfScope);
  }

  private static boolean inScope(UUID branchId, Set<UUID> allowed) {
    return allowed == null || (branchId != null && allowed.contains(branchId));
  }

  // --- açık fatura kalemleri

  /**
   * Carinin kaydın şirketindeki, kullanıcının görebildiği iş yerlerindeki eşleştirilebilir açık
   * kalemleri (en çok {@value #OPEN_INVOICE_LIMIT}; en eski vade önce). {@code
   * excludeSettlementId}: düzeltilen kaydın eşleşmeleri serbest sayılır.
   */
  public List<OpenInvoiceResponse> openInvoices(
      SettlementType type,
      UUID accountId,
      UUID branchId,
      String currency,
      UUID excludeSettlementId) {
    access.readable(accountId);
    scope.requireVisible(branchId);
    UUID companyId = companies.companyOf(branchId);
    BranchFilter filter = scope.filter(companyId, null);
    InvoiceSide side = SettlementAllocationService.requiredSide(type);
    return queries
        .openInvoices(
            side.name(),
            accountId,
            companyId,
            currency.trim().toUpperCase(Locale.ROOT),
            filter.allBranches(),
            filter.branchIds(),
            excludeSettlementId == null
                ? SettlementAllocationService.NO_SETTLEMENT
                : excludeSettlementId,
            OPEN_INVOICE_LIMIT)
        .stream()
        .map(SettlementQueryService::toOpenInvoice)
        .toList();
  }

  static OpenInvoiceResponse toOpenInvoice(OpenInvoiceRow row) {
    return new OpenInvoiceResponse(
        AllocationTargetType.valueOf(row.getTargetType()),
        row.getId(),
        row.getNumber(),
        row.getTypeName(),
        row.getInvoiceDate(),
        row.getDueDate(),
        row.getCurrency(),
        row.getTotal(),
        row.getAllocated(),
        row.getRemaining(),
        row.getBranchId(),
        row.getCompanyId());
  }

  // --- günlük rapor (§3.8)

  /** Günlük rapor süzgeçleri ({@code null}/boş alan süzmez; {@code methods} görünen yöntemdir). */
  public record DailyReportFilter(
      List<UUID> branchIds,
      UUID companyId,
      List<UUID> fundAccountIds,
      String currency,
      List<DocumentPaymentMethod> methods) {}

  /**
   * Günlük ödeme/tahsilat raporu (12.2a §3.8). Satırlar o tarihteki durumdur (Rev 1 F-4): rapor
   * gününde geçerli olup sonradan iptal edilen kayıt {@code reversedOn} dolu kalır; böylece fonun
   * açılışı + satır toplamı gün sonu bakiyesine uzlaşır. Fon bakiyeleri ve çek hareketleri şirket,
   * iş yeri kapsamı, fon ve para birimi süzgecinden geçer; uyuşmayan fon sessizce atlanır (Rev 1
   * SEC-02). Açıkça istenen kapsam dışı iş yeri/şirket 403; en çok {@value #DAILY_LIMIT} satır (422
   * {@code RESULT_TOO_LARGE}).
   */
  public DailyReportResponse daily(
      SettlementType type, LocalDate date, DailyReportFilter q, DailyReportSort sort) {
    List<String> methods = methodNames(q.methods());
    BranchFilter filter = scope.filter(q.companyId(), q.branchIds());
    List<UUID> fundIds =
        q.fundAccountIds() == null
            ? List.of()
            : q.fundAccountIds().stream().filter(Objects::nonNull).distinct().toList();
    String currency = q.currency() == null ? "" : q.currency().trim().toUpperCase(Locale.ROOT);
    boolean allCompanies = filter.companyId() == null;
    UUID companyId = allCompanies ? NONE : filter.companyId();
    List<SettlementItemRow> raw =
        queries.dailyItems(
            type.name(),
            date,
            access.employeeVisible(),
            allCompanies,
            companyId,
            filter.allBranches(),
            filter.branchIds(),
            fundIds.isEmpty(),
            fundIds.isEmpty() ? List.of(NONE) : fundIds,
            currency,
            methods.isEmpty(),
            methods.isEmpty() ? List.of("") : methods,
            sort != DailyReportSort.TIME_DESC,
            DAILY_LIMIT + 1);
    if (raw.size() > DAILY_LIMIT) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "RESULT_TOO_LARGE",
          "Sonuç çok büyük; iş yeri, banka/kasa ya da ödeme şekli seçerek daraltın.");
    }
    List<SettlementListItemResponse> rows =
        raw.stream().map(SettlementQueryService::toItem).toList();

    Set<UUID> candidates = new LinkedHashSet<>();
    rows.stream()
        .map(SettlementListItemResponse::fundAccountId)
        .filter(Objects::nonNull)
        .forEach(candidates::add);
    candidates.addAll(fundIds);
    List<DailyFundBalanceResponse> balances =
        candidates.isEmpty()
            ? List.of()
            : queries
                .dailyFundBalances(
                    candidates,
                    date,
                    allCompanies,
                    companyId,
                    filter.allBranches(),
                    filter.branchIds(),
                    currency)
                .stream()
                .map(SettlementQueryService::toFundBalance)
                .toList();
    String direction =
        type == SettlementType.COLLECTION ? FundDirection.IN.name() : FundDirection.OUT.name();
    List<DailyInstrumentMovementResponse> movements =
        queries
            .instrumentFundMovements(
                date,
                direction,
                allCompanies,
                companyId,
                filter.allBranches(),
                filter.branchIds(),
                fundIds.isEmpty(),
                fundIds.isEmpty() ? List.of(NONE) : fundIds,
                currency)
            .stream()
            .map(SettlementQueryService::toInstrumentMovement)
            .toList();
    return new DailyReportResponse(type, date, rows, totals(rows), balances, movements);
  }

  /** İş yeri × para birimi toplamları (satırlardan; sonradan iptal edilenler dahil). */
  static List<DailyTotal> totals(List<SettlementListItemResponse> rows) {
    record Key(String branch, String currency) {}
    Map<String, DailyTotal> totals = new TreeMap<>();
    for (SettlementListItemResponse row : rows) {
      String currency = row.money().currency();
      String key = new Key(row.branchId().toString(), currency).toString();
      DailyTotal current = totals.get(key);
      BigDecimal total = row.money().amount();
      int count = 1;
      if (current != null) {
        total = total.add(current.total());
        count += current.count();
      }
      totals.put(key, new DailyTotal(row.branchId(), currency, total, count));
    }
    return new ArrayList<>(totals.values());
  }

  static DailyFundBalanceResponse toFundBalance(DailyFundBalanceRow row) {
    return new DailyFundBalanceResponse(
        row.getFundAccountId(),
        row.getName(),
        FundKind.valueOf(row.getKind()),
        row.getCurrency(),
        row.getBranchId(),
        row.getBranchName(),
        row.getBankName(),
        row.getBankBranchName(),
        row.getBalanceAtDate(),
        row.getBalanceNow());
  }

  static DailyInstrumentMovementResponse toInstrumentMovement(DailyInstrumentMovementRow row) {
    return new DailyInstrumentMovementResponse(
        row.getBranchId(),
        row.getBranchName(),
        row.getFundAccountId(),
        row.getFundName(),
        FundKind.valueOf(row.getFundKind()),
        row.getCurrency(),
        row.getCount().intValue(),
        row.getTotal());
  }

  // --- kaynak rotası

  /** ZTO ödeme/tahsilat sayfasına derin bağlantı (kayıt detayı açılır). */
  static String route(SettlementType type, UUID id) {
    return (type == SettlementType.COLLECTION
            ? "/zto-finans/tahsilatlar?settlementId="
            : "/zto-finans/odemeler?settlementId=")
        + id;
  }

  // --- hatalar

  static BusinessException notFound() {
    return new BusinessException(HttpStatus.NOT_FOUND, "SETTLEMENT_NOT_FOUND", "Kayıt bulunamadı.");
  }

  private static BusinessException sortInvalid() {
    return bad("SORT_INVALID", "Sıralama alanı geçersiz.");
  }

  private static BusinessException bad(String code, String message) {
    return new BusinessException(HttpStatus.BAD_REQUEST, code, message);
  }
}
