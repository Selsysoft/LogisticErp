package org.ece.blackrose.finance.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.InvoiceSide;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.domain.Instrument;
import org.ece.blackrose.finance.domain.Settlement;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.ExpenseItemRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundAccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.SettlementRepository;
import org.ece.blackrose.finance.repository.FundRepositories.FundTransferSourceRepository;
import org.ece.blackrose.finance.repository.FundRepositories.IntercompanyTransferRepository;
import org.ece.blackrose.finance.service.FundLedgerService.FundPosting;
import org.ece.blackrose.finance.service.LedgerService.Posting;
import org.ece.blackrose.finance.web.FinanceDtos.DailyReportResponse;
import org.ece.blackrose.finance.web.FinanceDtos.DailyTotal;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementCheckResponse;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementResponse;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementWarningResponse;
import org.ece.blackrose.finance.web.FinanceMapper;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.organization.CompanyResolver;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ödeme ve tahsilat: cari ve banka/kasa hareketini tek işlemde yazar. Tahsilatta cari ALACAK, para
 * GİRİŞ; ödemede cari BORÇ, para ÇIKIŞ.
 */
@Service
public class SettlementService {

  static final String SOURCE_SETTLEMENT = "SETTLEMENT";

  /** Şirketler arası virmanın sunucu ürettiği settlement anahtarlarının öneki (SEC-12.2-03). */
  static final String INTERCOMPANY_KEY_PREFIX = "ict:";

  private final SettlementRepository settlements;
  private final AccountRepository accounts;
  private final ExpenseItemRepository expenseItems;
  private final FundService funds;
  private final LedgerService ledger;
  private final FundLedgerService fundLedger;
  private final InstrumentService instruments;
  private final FinanceMapper mapper;
  private final CompanyResolver companies;
  private final BranchScopeService scope;
  private final AccountAccess access;
  private final CompanyIdentityRule identityRule;
  private final FundAccountRepository fundAccounts;
  private final IntercompanyTransferRepository intercompanyTransfers;
  private final FundTransferSourceRepository transferSources;
  private final SettlementWarningService warnings;
  private final InvoiceCoverageService invoiceCoverage;
  private final AuditService audit;

  @PersistenceContext private EntityManager entityManager;

  @SuppressWarnings("java:S107")
  public SettlementService(
      SettlementRepository settlements,
      AccountRepository accounts,
      ExpenseItemRepository expenseItems,
      FundService funds,
      LedgerService ledger,
      FundLedgerService fundLedger,
      InstrumentService instruments,
      FinanceMapper mapper,
      CompanyResolver companies,
      BranchScopeService scope,
      AccountAccess access,
      CompanyIdentityRule identityRule,
      FundAccountRepository fundAccounts,
      IntercompanyTransferRepository intercompanyTransfers,
      FundTransferSourceRepository transferSources,
      SettlementWarningService warnings,
      InvoiceCoverageService invoiceCoverage,
      AuditService audit) {
    this.warnings = warnings;
    this.invoiceCoverage = invoiceCoverage;
    this.audit = audit;
    this.scope = scope;
    this.fundAccounts = fundAccounts;
    this.intercompanyTransfers = intercompanyTransfers;
    this.transferSources = transferSources;
    this.access = access;
    this.identityRule = identityRule;
    this.companies = companies;
    this.settlements = settlements;
    this.accounts = accounts;
    this.expenseItems = expenseItems;
    this.funds = funds;
    this.ledger = ledger;
    this.fundLedger = fundLedger;
    this.instruments = instruments;
    this.mapper = mapper;
  }

  @Transactional(readOnly = true)
  public Page<Settlement> list(SettlementType type, UUID companyId, Pageable pageable) {
    return settlements.search(type, scope.filter(companyId, null), pageable);
  }

  /**
   * Kullanıcı girişli ödeme/tahsilat (MUI uçları; 12.2 §3.6 sırası): {@code ict:} önekli anahtar
   * 400 {@code IDEMPOTENCY_KEY_INVALID}; aynı anahtarla tekrar ilk kaydı döner (uyarı çalışmaz);
   * carinin kartı {@code FOR SHARE} ile kilitlenir (pasif cari 422 {@code ACCOUNT_INACTIVE}, kimlik
   * kuralı 422 {@code COMPANY_MISMATCH}; 12.1 §3.1, SEC-12.1-04); pasif fon 422 {@code
   * FUND_INACTIVE}; doğrulamalar; şirket dağılımı aşımında onay yoksa 409 {@code
   * CONFIRMATION_REQUIRED}, onaylı kayıtta {@code SETTLEMENT_ALLOCATION_OVERRIDE} denetimi.
   * Türetilmiş akışlar (plan ödemesi, araç gideri, sürücü avansı, şirketler arası virman) doğrudan
   * {@link #create} çağırır (OK-28).
   */
  @Transactional
  public Settlement createByUser(
      SettlementType type, SettlementRequest request, String idempotencyKey) {
    if (idempotencyKey != null
        && idempotencyKey.toLowerCase(Locale.ROOT).startsWith(INTERCOMPANY_KEY_PREFIX)) {
      throw bad("IDEMPOTENCY_KEY_INVALID", "Bu işlem anahtarı kullanılamaz.");
    }
    if (idempotencyKey != null && settlements.findByIdempotencyKey(idempotencyKey).isPresent()) {
      return create(type, request, idempotencyKey, null);
    }
    if (request.accountId() != null) {
      identityRule.require(
          access.usableLocked(request.accountId()), companies.companyOf(request.branchId()));
    }
    if (request.method() != SettlementMethod.CHECK && request.fundAccountId() != null) {
      FundService.requireActive(funds.findVisible(request.fundAccountId()));
    }
    UUID companyId = validate(type, request);
    Optional<SettlementWarningResponse> confirmation =
        SettlementWarningService.confirmation(warnings.check(type, request, companyId));
    if (confirmation.isPresent() && !Boolean.TRUE.equals(request.confirmWarnings())) {
      throw SettlementWarningService.confirmationRequired(confirmation.get());
    }
    Settlement settlement = insert(type, request, companyId, idempotencyKey, null);
    confirmation.ifPresent(
        warning ->
            audit.record(
                AuditEvent.SETTLEMENT_ALLOCATION_OVERRIDE,
                "SETTLEMENT:" + settlement.getId(),
                SettlementWarningService.auditDetails(warning)));
    return settlement;
  }

  /**
   * Ödeme/tahsilat önizlemesi (§4.5; yazmaz). Kayıtla aynı kapı (SEC-12.2-01): cari okunabilir
   * olmalı (izinsiz personel carisi 404), kimlik kuralı (422 {@code COMPANY_MISMATCH}) ve kayıt
   * doğrulamaları; ardından şirket dağılımı uyarısı ve ödemenin şirketi + para birimi için eksik
   * fatura (ödemede PAYABLE, tahsilatta RECEIVABLE; kullanıcının kapsamıyla). İş yeri kapsamı
   * controller'da ({@code requireNew}).
   */
  @Transactional(readOnly = true)
  public SettlementCheckResponse check(SettlementType type, SettlementRequest request) {
    if (request.accountId() != null) {
      Account account = access.readable(request.accountId());
      identityRule.require(account, companies.companyOf(request.branchId()));
    }
    UUID companyId = validate(type, request);
    if (request.accountId() == null) {
      return new SettlementCheckResponse(List.of(), List.of());
    }
    return new SettlementCheckResponse(
        warnings.check(type, request, companyId),
        invoiceCoverage.missingFor(
            request.accountId(),
            companyId,
            request.money().currency(),
            type == SettlementType.PAYMENT ? InvoiceSide.PAYABLE : InvoiceSide.RECEIVABLE));
  }

  /** Aynı anahtarla gelen ikinci istek ilk kaydı döner. */
  @Transactional
  public Settlement create(
      SettlementType type, SettlementRequest request, String idempotencyKey, UUID planId) {
    if (idempotencyKey != null) {
      var existing = settlements.findByIdempotencyKey(idempotencyKey);
      if (existing.isPresent()) {
        // Aynı anahtarla başka iş yerinin kaydı kapsam dışındaki kullanıcıya dönmez.
        scope.requireVisible(existing.get().getBranchId());
        return existing.get();
      }
    }
    return insert(type, request, validate(type, request), idempotencyKey, planId);
  }

  /** Doğrulanmış isteğin kaydı: settlement, cari ve fon hareketleri. */
  private Settlement insert(
      SettlementType type,
      SettlementRequest request,
      UUID companyId,
      String idempotencyKey,
      UUID planId) {
    Money money = request.money();
    UUID instrumentId = registerInstrument(type, request, companyId, money);
    Settlement settlement =
        settlements.save(
            new Settlement(
                type,
                request.method(),
                request.accountId(),
                request.branchId(),
                companyId,
                request.method() == SettlementMethod.CHECK ? null : request.fundAccountId(),
                instrumentId,
                request.expenseItemId(),
                planId,
                money,
                request.date(),
                request.description(),
                idempotencyKey));
    if (request.accountId() != null) {
      ledger.post(
          new Posting(
              request.accountId(),
              request.branchId(),
              type == SettlementType.COLLECTION ? Direction.CREDIT : Direction.DEBIT,
              money,
              request.date(),
              request.description(),
              SOURCE_SETTLEMENT,
              settlement.getId(),
              request.exchangeRate()));
    }
    if (request.method() != SettlementMethod.CHECK) {
      fundLedger.post(
          new FundPosting(
              request.fundAccountId(),
              type == SettlementType.COLLECTION ? FundDirection.IN : FundDirection.OUT,
              money,
              request.date(),
              request.description(),
              SOURCE_SETTLEMENT,
              settlement.getId(),
              request.exchangeRate()));
    }
    return settlement;
  }

  /**
   * Kullanıcı iptali. Çekli ve plana bağlı kayıtlar ters çevrilmez; şirketler arası virmanın bacağı
   * virmandan (409 {@code SETTLEMENT_LINKED_TO_INTERCOMPANY}), geçerli bir döviz bozumunun kaynağı
   * olan tahsilat önce bozum iptal edilerek (409 {@code SETTLEMENT_USED_IN_FX_EXCHANGE}) iptal
   * edilir.
   */
  @Transactional
  public Settlement reverse(UUID id, LocalDate date, String description) {
    return doReverse(id, date, description, false);
  }

  /**
   * Yalnız {@code IntercompanyTransferService}: şirketler arası bağ denetimi atlanır; döviz bozumu
   * kaynak denetimi, çek ve plan denetimleri aynen uygulanır (12.2 §3.9, F5).
   */
  @Transactional
  public Settlement reverseLinked(UUID id, LocalDate date, String description) {
    return doReverse(id, date, description, true);
  }

  /**
   * Kilit sırası (12.2 §3.10, F8): settlement kilitsiz okunur → fon {@code FOR UPDATE} → settlement
   * {@code FOR UPDATE} (durum yeniden okunur) → bağ denetimleri → defter tersleri. Döviz bozumu
   * oluşturma da fon → settlement sırasıyla kilitlediğinden iki yol kilitlenmeye girmez.
   */
  private Settlement doReverse(
      UUID id, LocalDate date, String description, boolean skipIntercompanyCheck) {
    Settlement settlement =
        settlements
            .findById(id)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "SETTLEMENT_NOT_FOUND", "Kayıt bulunamadı."));
    scope.requireVisible(settlement.getBranchId());
    if (settlement.getStatus() == SettlementStatus.REVERSED) {
      return settlement;
    }
    if (settlement.getMethod() == SettlementMethod.CHECK) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "SETTLEMENT_CHECK_NOT_REVERSIBLE",
          "Çekli kayıt ters çevrilemez; çekin durumunu güncelleyin.");
    }
    if (settlement.getPlanId() != null) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "SETTLEMENT_LINKED_TO_PLAN",
          "Ödeme planına bağlı kayıt ters çevrilemez.");
    }
    if (settlement.getFundAccountId() != null) {
      fundAccounts.findForUpdate(settlement.getFundAccountId());
    }
    entityManager.refresh(settlement, LockModeType.PESSIMISTIC_WRITE);
    if (settlement.getStatus() == SettlementStatus.REVERSED) {
      return settlement;
    }
    if (!skipIntercompanyCheck && intercompanyTransfers.existsBySettlement(id)) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "SETTLEMENT_LINKED_TO_INTERCOMPANY",
          "Şirketler arası virmana bağlı kayıt transfer merkezinden iptal edilir.");
    }
    if (transferSources.existsActiveBySettlementId(id)) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "SETTLEMENT_USED_IN_FX_EXCHANGE",
          "Döviz bozumunda kaynak olarak kullanılan tahsilat iptal edilemez; önce bozumu iptal"
              + " edin.");
    }
    ledger.reverseSource(SOURCE_SETTLEMENT, id, date, description);
    fundLedger.reverseSource(SOURCE_SETTLEMENT, id, date, description);
    settlement.markReversed();
    return settlement;
  }

  /**
   * Şube filtresi boşsa (şirketin ya da konsolidede) kullanıcının görebildiği tüm şubeler
   * raporlanır; açıkça istenen kapsam dışı şube 403.
   */
  @Transactional(readOnly = true)
  public DailyReportResponse daily(
      SettlementType type, LocalDate date, List<UUID> branchIds, UUID companyId) {
    BranchFilter filter = scope.filter(companyId, branchIds);
    List<Settlement> rows = settlements.daily(type, date, filter);
    record Key(String branch, String currency) {}
    Map<String, DailyTotal> totals = new TreeMap<>();
    for (Settlement row : rows) {
      String key = new Key(row.getBranchId().toString(), row.getMoney().currency()).toString();
      DailyTotal current = totals.get(key);
      BigDecimal total = row.getMoney().amount();
      int count = 1;
      if (current != null) {
        total = total.add(current.total());
        count += current.count();
      }
      totals.put(key, new DailyTotal(row.getBranchId(), row.getMoney().currency(), total, count));
    }
    List<SettlementResponse> responses = rows.stream().map(mapper::toResponse).toList();
    return new DailyReportResponse(type, date, responses, new ArrayList<>(totals.values()));
  }

  private UUID registerInstrument(
      SettlementType type, SettlementRequest request, UUID companyId, Money money) {
    if (request.method() != SettlementMethod.CHECK) {
      return null;
    }
    if (request.instrumentId() != null) {
      return instruments
          .endorse(request.instrumentId(), request.accountId(), companyId, money, request.date())
          .getId();
    }
    InstrumentDirection direction =
        type == SettlementType.COLLECTION
            ? InstrumentDirection.RECEIVED
            : InstrumentDirection.ISSUED;
    Instrument instrument =
        instruments.register(
            request.instrument(),
            direction,
            request.accountId(),
            request.branchId(),
            money,
            request.date());
    return instrument.getId();
  }

  /** Kaydın şirketini (iş yerinden) döndürür; fon ve ciro çeki bu şirkette olmalıdır. */
  private UUID validate(SettlementType type, SettlementRequest request) {
    UUID companyId = companies.companyOf(request.branchId());
    if (request.accountId() != null && !accounts.existsById(request.accountId())) {
      throw new BusinessException(HttpStatus.NOT_FOUND, "ACCOUNT_NOT_FOUND", "Cari bulunamadı.");
    }
    if (request.expenseItemId() != null && !expenseItems.existsById(request.expenseItemId())) {
      throw bad("EXPENSE_ITEM_NOT_FOUND", "Gider kalemi bulunamadı.");
    }
    boolean directExpense =
        type == SettlementType.PAYMENT
            && request.expenseItemId() != null
            && request.method() != SettlementMethod.CHECK;
    if (request.accountId() == null && !directExpense) {
      throw bad("ACCOUNT_REQUIRED", "Cari seçilmelidir.");
    }
    if (request.money().amount().signum() <= 0) {
      throw bad("AMOUNT_INVALID", "Tutar sıfırdan büyük olmalıdır.");
    }
    switch (request.method()) {
      case CASH -> requireFund(request, FundKind.CASH, companyId);
      case BANK -> requireFund(request, FundKind.BANK, companyId);
      case CHECK -> validateCheck(type, request);
    }
    return companyId;
  }

  private void validateCheck(SettlementType type, SettlementRequest request) {
    boolean endorsing = request.instrumentId() != null;
    if (type == SettlementType.COLLECTION && (endorsing || request.instrument() == null)) {
      throw bad("INSTRUMENT_REQUIRED", "Tahsilat için çek/senet bilgisi girilmelidir.");
    }
    if (type == SettlementType.PAYMENT && endorsing == (request.instrument() != null)) {
      throw bad(
          "INSTRUMENT_REQUIRED", "Ödeme için yeni çek/senet veya cirolanacak çek seçilmelidir.");
    }
  }

  private void requireFund(SettlementRequest request, FundKind kind, UUID companyId) {
    if (request.fundAccountId() == null) {
      throw bad("FUND_REQUIRED", "Banka/kasa hesabı seçilmelidir.");
    }
    FundAccount fund = funds.findVisible(request.fundAccountId());
    if (fund.getKind() != kind) {
      throw bad("FUND_KIND_MISMATCH", "Seçilen hesap, ödeme yöntemine uygun değil.");
    }
    if (!fund.getCurrency().equals(request.money().currency())) {
      throw bad("CURRENCY_MISMATCH", "Tutarın para birimi hesabın para birimiyle aynı olmalıdır.");
    }
    if (!fund.getCompanyId().equals(companyId)) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "COMPANY_MISMATCH",
          "Kasa/banka hesabı seçilen iş yerinin şirketine ait değil.");
    }
  }

  private static BusinessException bad(String code, String message) {
    return new BusinessException(HttpStatus.BAD_REQUEST, code, message);
  }
}
