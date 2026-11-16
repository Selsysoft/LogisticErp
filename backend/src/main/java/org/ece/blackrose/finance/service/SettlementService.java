package org.ece.blackrose.finance.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.AccountBankAccount;
import org.ece.blackrose.finance.domain.CheckLeaf;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.CheckLeafStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.InvoiceSide;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.domain.Instrument;
import org.ece.blackrose.finance.domain.Settlement;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountBankAccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.CheckLeafRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.ExpenseItemRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundAccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.InstrumentRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.SettlementRepository;
import org.ece.blackrose.finance.repository.FundRepositories.FundTransferSourceRepository;
import org.ece.blackrose.finance.repository.FundRepositories.IntercompanyTransferRepository;
import org.ece.blackrose.finance.service.FundLedgerService.FundPosting;
import org.ece.blackrose.finance.service.LedgerService.Posting;
import org.ece.blackrose.finance.web.FinanceDtos.NewInstrument;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementCheckResponse;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementCorrectionRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementWarningResponse;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.organization.CompanyResolver;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Ödeme ve tahsilat: cari ve banka/kasa hareketini tek işlemde yazar. Tahsilatta cari ALACAK, para
 * GİRİŞ; ödemede cari BORÇ, para ÇIKIŞ. Düzeltme ve iptal ters kayıtla yapılır (12.2a §3.5–§3.6).
 */
@Service
public class SettlementService {

  static final String SOURCE_SETTLEMENT = "SETTLEMENT";

  /** Şirketler arası virmanın sunucu ürettiği settlement anahtarlarının öneki (SEC-12.2-03). */
  static final String INTERCOMPANY_KEY_PREFIX = "ict:";

  /** Araç giderine bağlı ödemenin iptal ekranı (409 {@code SETTLEMENT_SOURCE_MANAGED}). */
  static final String VEHICLE_ROUTE = "/fleet/vehicles";

  /** Genel masrafa bağlı ödemenin iptal ekranı (409 {@code SETTLEMENT_SOURCE_MANAGED}; 12.7 F1). */
  static final String EXPENSE_ROUTE = "/zto-finans/genel-masraflar";

  private final SettlementRepository settlements;
  private final AccountRepository accounts;
  private final ExpenseItemRepository expenseItems;
  private final FundService funds;
  private final LedgerService ledger;
  private final FundLedgerService fundLedger;
  private final InstrumentService instruments;
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
  private final SettlementAllocationService allocations;
  private final AccountBankAccountRepository bankAccounts;
  private final TenantClock clock;
  private final InstrumentRepository instrumentRecords;
  private final CheckLeafRepository leaves;

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
      CompanyResolver companies,
      BranchScopeService scope,
      AccountAccess access,
      CompanyIdentityRule identityRule,
      FundAccountRepository fundAccounts,
      IntercompanyTransferRepository intercompanyTransfers,
      FundTransferSourceRepository transferSources,
      SettlementWarningService warnings,
      InvoiceCoverageService invoiceCoverage,
      AuditService audit,
      SettlementAllocationService allocations,
      AccountBankAccountRepository bankAccounts,
      TenantClock clock,
      InstrumentRepository instrumentRecords,
      CheckLeafRepository leaves) {
    this.instrumentRecords = instrumentRecords;
    this.leaves = leaves;
    this.allocations = allocations;
    this.bankAccounts = bankAccounts;
    this.clock = clock;
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
  }

  /**
   * Kullanıcı girişli ödeme/tahsilat (MUI ve ZTO uçları; 12.2 §3.6 + 12.2a §3.1 sırası): {@code
   * ict:} önekli anahtar 400 {@code IDEMPOTENCY_KEY_INVALID}; aynı anahtarla tekrar ilk kaydı döner
   * (uyarı çalışmaz, eşleştirme yeniden yazılmaz) — yalnız kayıt kapsamda (403), okunabilir
   * (izinsiz personel carisi 404 {@code SETTLEMENT_NOT_FOUND}) ve aynı türde bir düzeltme dışı
   * kayıtsa; aksi 422 {@code IDEMPOTENCY_KEY_REUSED} (SEC-12.2a-R2); kapı ({@link #gate}); kayıt,
   * eşleştirmeler ve onaylı uyarıda {@code SETTLEMENT_ALLOCATION_OVERRIDE} denetimi. Türetilmiş
   * akışlar (plan ödemesi, araç gideri, sürücü avansı, şirketler arası virman) doğrudan {@link
   * #create} çağırır (OK-28).
   */
  @Transactional
  public Settlement createByUser(
      SettlementType type, SettlementRequest request, String idempotencyKey) {
    rejectIntercompanyKey(idempotencyKey);
    if (idempotencyKey != null) {
      Optional<Settlement> existing = settlements.findByIdempotencyKey(idempotencyKey);
      if (existing.isPresent()) {
        return userReplay(existing.get(), type);
      }
    }
    Gate gate = gate(type, request);
    Settlement settlement = insert(type, request, gate.companyId(), idempotencyKey, null, null);
    allocations.save(settlement, request.allocations());
    gate.confirmation().ifPresent(warning -> auditOverride(settlement, warning));
    return settlement;
  }

  /**
   * Kullanıcı ucunda aynı anahtarla tekrar (SEC-12.2a-R2): kapsam (403), personel carisi (404
   * {@code SETTLEMENT_NOT_FOUND}); başka türün ya da bir düzeltmenin anahtarı 422 {@code
   * IDEMPOTENCY_KEY_REUSED}.
   */
  private Settlement userReplay(Settlement found, SettlementType type) {
    scope.requireVisible(found.getBranchId());
    requireSettlementReadable(found);
    if (found.getType() != type || found.getCorrectsSettlementId() != null) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "IDEMPOTENCY_KEY_REUSED",
          "Bu işlem anahtarı başka bir kayıt için kullanılmış.");
    }
    return found;
  }

  /** Kapı sonucu: kaydın şirketi ve (varsa) onaylanmış uyarı. */
  private record Gate(UUID companyId, Optional<SettlementWarningResponse> confirmation) {}

  /**
   * Kullanıcı kapısı (12.2a §3.1): (1) cari kartı {@code FOR SHARE} + kimlik kuralı, (2) pasif fon
   * 422 {@code FUND_INACTIVE} (çekte çekin banka hesabı da), (2a) fonlar kimlik sırasıyla {@code
   * FOR UPDATE} (Rev 1 F-1: eşleştirme hedef kilitlerinden önce), (3) doğrulamalar, (4) eşleştirme
   * doğrulaması (hedef kilitleri), (5) şirket dağılımı uyarısı (onaysız 409 {@code
   * CONFIRMATION_REQUIRED}).
   */
  private Gate gate(SettlementType type, SettlementRequest request) {
    if (request.accountId() != null) {
      identityRule.require(
          access.usableLocked(request.accountId()), companies.companyOf(request.branchId()));
    }
    List<UUID> fundIds = userFundIds(request);
    for (UUID fundId : fundIds) {
      FundService.requireActive(funds.findVisible(fundId));
    }
    lockFunds(fundIds);
    UUID companyId = validate(type, request, false);
    allocations.validate(type, request, companyId, null);
    return new Gate(companyId, confirm(type, request, companyId));
  }

  /** Kullanıcının seçtiği fonlar: nakit/banka fonu ya da yeni çekin banka hesabı. */
  private static List<UUID> userFundIds(SettlementRequest request) {
    List<UUID> ids = new ArrayList<>();
    if (request.method() != SettlementMethod.CHECK && request.fundAccountId() != null) {
      ids.add(request.fundAccountId());
    }
    if (request.method() == SettlementMethod.CHECK
        && request.instrument() != null
        && request.instrument().fundAccountId() != null) {
      ids.add(request.instrument().fundAccountId());
    }
    return ids;
  }

  private void lockFunds(Collection<UUID> ids) {
    List<UUID> distinct = ids.stream().filter(Objects::nonNull).distinct().toList();
    if (!distinct.isEmpty()) {
      fundAccounts.lockAll(distinct);
    }
  }

  /** Şirket dağılımı uyarısı; onay gerekip verilmediyse 409 {@code CONFIRMATION_REQUIRED}. */
  private Optional<SettlementWarningResponse> confirm(
      SettlementType type, SettlementRequest request, UUID companyId) {
    Optional<SettlementWarningResponse> confirmation =
        SettlementWarningService.confirmation(warnings.check(type, request, companyId));
    if (confirmation.isPresent() && !Boolean.TRUE.equals(request.confirmWarnings())) {
      throw SettlementWarningService.confirmationRequired(confirmation.get());
    }
    return confirmation;
  }

  private void auditOverride(Settlement settlement, SettlementWarningResponse warning) {
    audit.record(
        AuditEvent.SETTLEMENT_ALLOCATION_OVERRIDE,
        "SETTLEMENT:" + settlement.getId(),
        SettlementWarningService.auditDetails(warning));
  }

  private static void rejectIntercompanyKey(String idempotencyKey) {
    if (isIntercompanyKey(idempotencyKey)) {
      throw bad("IDEMPOTENCY_KEY_INVALID", "Bu işlem anahtarı kullanılamaz.");
    }
  }

  private static boolean isIntercompanyKey(String key) {
    return key != null && key.toLowerCase(Locale.ROOT).startsWith(INTERCOMPANY_KEY_PREFIX);
  }

  /**
   * Ödeme/tahsilat önizlemesi (§4.5; yazmaz). Kayıtla aynı kapı (SEC-12.2-01): cari okunabilir
   * olmalı (izinsiz personel carisi 404), kimlik kuralı (422 {@code COMPANY_MISMATCH}) ve kayıt
   * doğrulamaları (çek bilgisi zorunlu değil, F-12.2-R4); ardından şirket dağılımı uyarısı ve
   * ödemenin şirketi + para birimi için eksik fatura. {@code correctsSettlementId}: düzeltme
   * önizlemesi (12.2a §3.4) — eski kayıt görünür ve okunabilir olmalı (izinsiz personel carisi 404
   * {@code SETTLEMENT_NOT_FOUND}), POSTED ve aynı türde (422 {@code CORRECTION_TARGET_INVALID});
   * eski ödeme borçtan düşülmüş gibi değerlendirilir. İş yeri kapsamı controller'da ({@code
   * requireNew}). Eşleştirme önizlemede doğrulanmaz.
   */
  @Transactional(readOnly = true)
  public SettlementCheckResponse check(
      SettlementType type, SettlementRequest request, UUID correctsSettlementId) {
    Settlement excluded = null;
    if (correctsSettlementId != null) {
      excluded = readableSettlement(correctsSettlementId);
      if (excluded.getStatus() != SettlementStatus.POSTED || excluded.getType() != type) {
        throw new BusinessException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "CORRECTION_TARGET_INVALID",
            "Düzeltilecek kayıt bu işlem türünde geçerli bir kayıt değil.");
      }
    }
    if (request.accountId() != null) {
      Account account = access.readable(request.accountId());
      identityRule.require(account, companies.companyOf(request.branchId()));
    }
    UUID companyId = validate(type, request, true);
    if (request.accountId() == null) {
      return new SettlementCheckResponse(List.of(), List.of());
    }
    return new SettlementCheckResponse(
        warnings.check(type, request, companyId, excluded),
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
    return insert(type, request, validate(type, request, false), idempotencyKey, planId, null);
  }

  /** Doğrulanmış isteğin kaydı: settlement, çek/senet, cari ve fon hareketleri. */
  private Settlement insert(
      SettlementType type,
      SettlementRequest request,
      UUID companyId,
      String idempotencyKey,
      UUID planId,
      UUID correctsSettlementId) {
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
                    idempotencyKey)
                .withDetails(
                    documentNo(request),
                    request.channel(),
                    request.counterpartyBankAccountId(),
                    correctsSettlementId));
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

  /** Belge no kırpılır; boşsa saklanmaz. */
  private static String documentNo(SettlementRequest request) {
    String value = request.documentNo();
    return value == null || value.isBlank() ? null : value.trim();
  }

  /** İptal yolu: kullanıcı, şirketler arası virman ya da araç gideri (12.2a §3.5). */
  enum ReverseMode {
    USER,
    INTERCOMPANY,
    MANAGED
  }

  /**
   * Kullanıcı iptali (ZTO "Sil"). Çekli ve plana bağlı kayıtlar ters çevrilmez; şirketler arası
   * virmanın bacağı virmandan (409 {@code SETTLEMENT_LINKED_TO_INTERCOMPANY}), araç giderine bağlı
   * ödeme araç gideri ekranından (409 {@code SETTLEMENT_SOURCE_MANAGED}), geçerli bir döviz
   * bozumunun kaynağı olan tahsilat önce bozum iptal edilerek (409 {@code
   * SETTLEMENT_USED_IN_FX_EXCHANGE}), taşınmış kayıt önce taşıma geri alınarak (409 {@code
   * TRANSACTION_TRANSFERRED}) iptal edilir. İptal tarihi {@code kayıt tarihi ≤ tarih ≤ max(bugün,
   * kayıt tarihi)}; gerekçe saklanır; denetim {@code SETTLEMENT_REVERSED}. İzinsiz kullanıcıya
   * personel carili kayıt 404 {@code SETTLEMENT_NOT_FOUND}.
   */
  @Transactional
  public Settlement reverse(UUID id, LocalDate date, String reason) {
    return doReverse(id, date, reason, ReverseMode.USER);
  }

  /**
   * Yalnız {@code IntercompanyTransferService}: şirketler arası bağ denetimi atlanır; döviz bozumu
   * kaynak denetimi, çek ve plan denetimleri aynen uygulanır (12.2 §3.9, F5).
   */
  @Transactional
  public Settlement reverseLinked(UUID id, LocalDate date, String reason) {
    return doReverse(id, date, reason, ReverseMode.INTERCOMPANY);
  }

  /**
   * Yalnız {@code VehicleExpenseService.reverse}: araç giderine bağlı ödemenin iptali (araç gideri
   * bağı ve kullanıcı tarih kuralı denetlenmez; 12.2a §3.5).
   */
  @Transactional
  public Settlement reverseManaged(UUID id, LocalDate date, String reason) {
    return doReverse(id, date, reason, ReverseMode.MANAGED);
  }

  /**
   * Kilit sırası (12.2 §3.10, F8): settlement kilitsiz okunur → fon {@code FOR UPDATE} → settlement
   * {@code FOR UPDATE} (durum yeniden okunur) → bağ denetimleri → defter tersleri. Döviz bozumu
   * oluşturma da fon → settlement sırasıyla kilitlediğinden iki yol kilitlenmeye girmez.
   */
  private Settlement doReverse(UUID id, LocalDate date, String reason, ReverseMode mode) {
    Settlement settlement = settlements.findById(id).orElseThrow(SettlementService::notFound);
    scope.requireVisible(settlement.getBranchId());
    if (mode == ReverseMode.USER) {
      requireSettlementReadable(settlement);
    }
    if (settlement.getStatus() == SettlementStatus.REVERSED) {
      return settlement;
    }
    requireReversibleKind(settlement);
    precheckInstrument(settlement);
    if (mode == ReverseMode.USER) {
      requireReverseDate(settlement.getSettlementDate(), date, clock.today());
    }
    if (settlement.getFundAccountId() != null) {
      fundAccounts.findForUpdate(settlement.getFundAccountId());
    }
    entityManager.refresh(settlement, LockModeType.PESSIMISTIC_WRITE);
    if (settlement.getStatus() == SettlementStatus.REVERSED) {
      return settlement;
    }
    requireUnlinked(settlement, mode);
    Instrument instrument = lockInstrument(settlement);
    String defaultText = defaultReverseText(settlement.getType());
    reverseLedgers(settlement, date, reason, defaultText);
    if (instrument != null) {
      releaseInstrument(settlement, instrument, date, reverseText(reason, defaultText), false);
    }
    if (mode == ReverseMode.USER) {
      audit.record(AuditEvent.SETTLEMENT_REVERSED, "SETTLEMENT:" + id, "date=" + date);
    }
    return settlement;
  }

  /**
   * Plana bağlı kayıt ters çevrilmez. Çekli kayıt 12.3'ten beri çek ilerlememişse ters çevrilir
   * ({@link #requireInstrumentReversible}).
   */
  private static void requireReversibleKind(Settlement settlement) {
    if (settlement.getPlanId() != null) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "SETTLEMENT_LINKED_TO_PLAN",
          "Ödeme planına bağlı kayıt ters çevrilemez.");
    }
  }

  /**
   * Kilit altındaki bağ denetimleri: şirketler arası virman ({@code INTERCOMPANY} kipinde atlanır),
   * araç gideri (yalnız kullanıcı), döviz bozumu kaynağı, cari taşıma (yalnız kullanıcı; Rev 1
   * F-2).
   */
  private void requireUnlinked(Settlement settlement, ReverseMode mode) {
    UUID id = settlement.getId();
    if (mode != ReverseMode.INTERCOMPANY
        && (isIntercompanyKey(settlement.getIdempotencyKey())
            || intercompanyTransfers.existsBySettlement(id))) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "SETTLEMENT_LINKED_TO_INTERCOMPANY",
          "Şirketler arası virmana bağlı kayıt transfer merkezinden iptal edilir.");
    }
    if (mode == ReverseMode.USER && settlements.existsVehicleExpenseLink(id)) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "SETTLEMENT_SOURCE_MANAGED",
          "Araç giderine bağlı ödeme araç gideri ekranından iptal edilir.",
          List.of("route=" + VEHICLE_ROUTE));
    }
    if (mode == ReverseMode.USER && settlements.existsExpenseLink(id)) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "SETTLEMENT_SOURCE_MANAGED",
          "Genel masrafa bağlı ödeme Genel Masraf ekranından iptal edilir.",
          List.of("route=" + EXPENSE_ROUTE));
    }
    if (transferSources.existsActiveBySettlementId(id)) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "SETTLEMENT_USED_IN_FX_EXCHANGE",
          "Döviz bozumunda kaynak olarak kullanılan tahsilat iptal edilemez; önce bozumu iptal"
              + " edin.");
    }
    if (mode == ReverseMode.USER && settlements.isTransferred(id)) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "TRANSACTION_TRANSFERRED",
          "Cari taşıma geri alınmadan düzenlenemez/silinemez.");
    }
  }

  /** Cari ve fon ters kayıtları verilen tarihle; gerekçe boşsa varsayılan açıklama. */
  private void reverseLedgers(
      Settlement settlement, LocalDate date, String reason, String defaultText) {
    String text = reverseText(reason, defaultText);
    ledger.reverseSource(SOURCE_SETTLEMENT, settlement.getId(), date, text);
    fundLedger.reverseSource(SOURCE_SETTLEMENT, settlement.getId(), date, text);
    settlement.markReversed(date, reason);
  }

  private static String reverseText(String reason, String defaultText) {
    return reason == null || reason.isBlank() ? defaultText : reason.trim();
  }

  /**
   * Çekli kaydın kilitsiz ön denetimi (§3.4 adım 3): çek ilerlemişse hızlı 409 {@code
   * SETTLEMENT_CHECK_NOT_REVERSIBLE}. Asıl denetim kilit altında ({@link #lockInstrument}).
   */
  private void precheckInstrument(Settlement settlement) {
    if (settlement.getMethod() != SettlementMethod.CHECK || settlement.getInstrumentId() == null) {
      return;
    }
    instrumentRecords
        .findById(settlement.getInstrumentId())
        .ifPresent(instrument -> requireInstrumentReversible(settlement, instrument));
  }

  /**
   * Çekli kayıtta kilit sırası (§3.4 adım 8, §3.10; Rev 1 F2): kaydın cari hareketi → çek; çek
   * kilit altında yeniden okunur ve denetlenir. Çeksiz kayıtta {@code null}.
   */
  private Instrument lockInstrument(Settlement settlement) {
    if (settlement.getMethod() != SettlementMethod.CHECK || settlement.getInstrumentId() == null) {
      return null;
    }
    ledger.lockSource(SOURCE_SETTLEMENT, settlement.getId());
    Instrument instrument = instruments.lockForSettlement(settlement.getInstrumentId());
    requireInstrumentReversible(settlement, instrument);
    return instrument;
  }

  /**
   * Ters kayıttan sonra çek: köken kayıtta {@code CANCELLED} (düz iptalde yaprak {@code VOID},
   * düzeltmede {@code UNUSED}); ciro kaydında çek portföye döner (§3.4 adım 10, §3.5).
   */
  private void releaseInstrument(
      Settlement settlement,
      Instrument instrument,
      LocalDate date,
      String text,
      boolean releaseLeaf) {
    if (InstrumentRules.isOrigin(settlement.getType(), instrument.getDirection())) {
      instruments.cancelForSettlement(instrument, date, text, releaseLeaf);
    } else {
      instruments.undoEndorsement(instrument, date, "Ciro iptali");
    }
  }

  /**
   * Çek ilerlemişse 409 {@code SETTLEMENT_CHECK_NOT_REVERSIBLE} ({@code instrumentStatus}, {@code
   * instrumentId} ayrıntılarıyla; §3.4).
   */
  private static void requireInstrumentReversible(Settlement settlement, Instrument instrument) {
    if (InstrumentRules.settlementReversible(
        settlement.getType(),
        instrument.getDirection(),
        instrument.getStatus(),
        instrument.getEndorsedAccountId(),
        settlement.getAccountId())) {
      return;
    }
    throw new BusinessException(
        HttpStatus.CONFLICT,
        "SETTLEMENT_CHECK_NOT_REVERSIBLE",
        "Çek/senet işlem gördü (durum: "
            + statusLabel(instrument.getStatus())
            + "); önce çekin durumunu geri alacak işlemi yapın ya da çek ekranından ilerleyin.",
        List.of(
            "instrumentStatus=" + instrument.getStatus(), "instrumentId=" + instrument.getId()));
  }

  private static String statusLabel(InstrumentStatus status) {
    return switch (status) {
      case PORTFOLIO -> "Portföyde";
      case AT_BANK -> "Bankada";
      case ENDORSED -> "Ciro edildi";
      case ISSUED -> "Verildi";
      case COLLECTED -> "Tahsil edildi";
      case COLLECTED_TO_CASH -> "Kasaya tahsil edildi";
      case PAID -> "Ödendi";
      case BOUNCED -> "Karşılıksız";
      case CANCELLED -> "İptal";
      case RETURNED -> "İade edildi";
      case COLLATERAL -> "Teminatta";
      case PROTESTED -> "Protestolu";
    };
  }

  private static String defaultReverseText(SettlementType type) {
    return type == SettlementType.PAYMENT ? "Ödeme iptali" : "Tahsilat iptali";
  }

  /**
   * Kullanıcı iptal tarihi kuralı (12.2a §3.5, OK-12.2a-6): {@code kayıt tarihi ≤ tarih ≤
   * max(bugün, kayıt tarihi)}.
   */
  static void requireReverseDate(LocalDate settlementDate, LocalDate date, LocalDate today) {
    if (date.isBefore(settlementDate)) {
      throw bad("REVERSE_BEFORE_SETTLEMENT", "İptal tarihi ödeme/tahsilat tarihinden önce olamaz.");
    }
    LocalDate latest = settlementDate.isAfter(today) ? settlementDate : today;
    if (date.isAfter(latest)) {
      throw bad("DATE_IN_FUTURE", "İptal tarihi ileri bir tarih olamaz.");
    }
  }

  /**
   * Düzeltme (ZTO "Düzenle"; 12.2a §3.6): eski kayıt kendi tarihiyle ters kayıtla iptal edilir,
   * yeni kayıt {@code corrects_settlement_id} ile yazılır; tek işlem (409 {@code
   * CONFIRMATION_REQUIRED} dahil her hata tümünü geri alır). Yalnız POSTED, nakit/banka, carili,
   * bağsız kayıt; aynı şirkette; tür eski kaydın türüdür. Yeni iş yerinin kapsamı controller'da
   * ({@code requireNew}). Kilit sırası (§3.11): yeni cari {@code FOR SHARE} → eski ve yeni fon (id
   * sırası) → eski settlement → eşleştirme hedefleri.
   */
  @Transactional
  public Settlement correct(UUID id, SettlementCorrectionRequest body, String idempotencyKey) {
    rejectIntercompanyKey(idempotencyKey);
    if (idempotencyKey != null) {
      Optional<Settlement> existing = settlements.findByIdempotencyKey(idempotencyKey);
      if (existing.isPresent()) {
        if (!id.equals(existing.get().getCorrectsSettlementId())) {
          throw new BusinessException(
              HttpStatus.UNPROCESSABLE_ENTITY,
              "IDEMPOTENCY_KEY_REUSED",
              "Bu işlem anahtarı başka bir kayıt için kullanılmış.");
        }
        return repeated(existing.get(), id);
      }
    }
    Settlement old = readableSettlement(id);
    requireCorrectable(old);
    SettlementRequest replacement = body.replacement();
    SettlementType type = old.getType();
    if (!companies.companyOf(replacement.branchId()).equals(old.getCompanyId())) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "COMPANY_MISMATCH",
          "Düzeltme aynı şirkette yapılır; başka şirkete taşımak için kaydı silip yeni kayıt"
              + " girin.");
    }

    if (replacement.accountId() != null) {
      identityRule.require(access.usableLocked(replacement.accountId()), old.getCompanyId());
    }
    List<UUID> replacementFunds = userFundIds(replacement);
    List<UUID> lockIds = new ArrayList<>(replacementFunds);
    lockIds.add(old.getFundAccountId());
    lockFunds(lockIds);
    entityManager.refresh(old, LockModeType.PESSIMISTIC_WRITE);
    if (idempotencyKey != null) {
      // Aynı anahtarla eşzamanlı tekrar: kilidi ilk istek bıraktığında onun kaydı döner (F-6).
      Optional<Settlement> raced =
          settlements
              .findByCorrectsSettlementId(id)
              .filter(found -> idempotencyKey.equals(found.getIdempotencyKey()));
      if (raced.isPresent()) {
        return repeated(raced.get(), id);
      }
    }
    requireCorrectable(old);
    for (UUID fundId : replacementFunds) {
      FundService.requireActive(funds.findVisible(fundId));
    }
    Instrument oldInstrument = lockInstrument(old);
    UUID companyId = validate(type, replacement, false, correctionContext(old, oldInstrument));
    allocations.validate(type, replacement, companyId, id);

    String reason = body.reason();
    String text = type == SettlementType.PAYMENT ? "Ödeme düzeltmesi" : "Tahsilat düzeltmesi";
    Optional<SettlementWarningResponse> confirmation;
    Settlement created;
    boolean checkInvolved =
        old.getMethod() == SettlementMethod.CHECK || replacement.method() == SettlementMethod.CHECK;
    if (type == SettlementType.PAYMENT || checkInvolved) {
      // Önce eski kayıt ters: uyarı eski ödeme geri alınmış bakiyeyle hesaplanır; çekli kayıtta
      // eski çek iptal edilir/portföye döner, numara ve yaprak yeni kayda serbest kalır (§3.5).
      reverseLedgers(old, old.getSettlementDate(), reason, text);
      if (oldInstrument != null) {
        releaseInstrument(
            old, oldInstrument, old.getSettlementDate(), reverseText(reason, text), true);
      }
      entityManager.flush();
      confirmation = confirm(type, replacement, companyId);
      created = insert(type, replacement, companyId, idempotencyKey, null, id);
      allocations.save(created, replacement.allocations());
    } else {
      // Önce yeni giriş: aynı kasada düzeltmede bakiye yetersizliği oluşmaz.
      confirmation = confirm(type, replacement, companyId);
      created = insert(type, replacement, companyId, idempotencyKey, null, id);
      allocations.save(created, replacement.allocations());
      reverseLedgers(old, old.getSettlementDate(), reason, text);
    }
    audit.record(AuditEvent.SETTLEMENT_CORRECTED, "SETTLEMENT:" + id, "new=" + created.getId());
    confirmation.ifPresent(warning -> auditOverride(created, warning));
    return created;
  }

  /**
   * Aynı anahtarla düzeltme tekrarı: yeni kayıt ve eski kayıt kapsamda ve okunabilir olmalı (Rev 1
   * SEC-06); ilk yeni kayıt döner.
   */
  private Settlement repeated(Settlement created, UUID oldId) {
    scope.requireVisible(created.getBranchId());
    requireSettlementReadable(created);
    readableSettlement(oldId);
    return created;
  }

  /** Düzeltme uygunluğu (§3.6 adım 4–5); kilitten önce ve sonra çağrılır. */
  private void requireCorrectable(Settlement old) {
    if (old.getStatus() == SettlementStatus.REVERSED) {
      Optional<Settlement> corrected = settlements.findByCorrectsSettlementId(old.getId());
      if (corrected.isPresent()) {
        throw new BusinessException(
            HttpStatus.CONFLICT,
            "SETTLEMENT_ALREADY_CORRECTED",
            "Bu kayıt zaten düzenlenmiş; güncel kaydı açın.",
            List.of("correctedById=" + corrected.get().getId()));
      }
      throw new BusinessException(
          HttpStatus.CONFLICT, "SETTLEMENT_REVERSED", "İptal edilmiş kayıt düzenlenemez.");
    }
    requireReversibleKind(old);
    precheckInstrument(old);
    // Bağ denetimleri carisiz kayıt denetiminden önce: araç giderinin (carisiz) ödemesinde
    // kullanıcı
    // genel "düzenlenemez" yerine iptal ekranını söyleyen 409 SETTLEMENT_SOURCE_MANAGED alır.
    requireUnlinked(old, ReverseMode.USER);
    if (old.getAccountId() == null) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "SETTLEMENT_NOT_CORRECTABLE", "Bu kayıt düzenlenemez.");
    }
  }

  /**
   * Kayıt yoksa 404 {@code SETTLEMENT_NOT_FOUND}; iş yeri kapsam dışıysa 403; izinsiz kullanıcıya
   * personel carili kayıt 404 {@code SETTLEMENT_NOT_FOUND}.
   */
  private Settlement readableSettlement(UUID id) {
    Settlement settlement = settlements.findById(id).orElseThrow(SettlementService::notFound);
    scope.requireVisible(settlement.getBranchId());
    requireSettlementReadable(settlement);
    return settlement;
  }

  /**
   * Personel carili kayıt {@code FINANCE_EMPLOYEE_VIEW} izni olmayan kullanıcıya yokmuş gibi
   * davranır (404 {@code SETTLEMENT_NOT_FOUND}; {@code ACCOUNT_NOT_FOUND} kaydın personel carisine
   * ait olduğunu sızdırırdı — Rev 1 SEC-05).
   */
  private void requireSettlementReadable(Settlement settlement) {
    if (settlement.getAccountId() == null || access.employeeVisible()) {
      return;
    }
    boolean employee =
        accounts
            .findById(settlement.getAccountId())
            .map(account -> account.getType() == AccountType.EMPLOYEE)
            .orElse(false);
    if (employee) {
      throw notFound();
    }
  }

  private static BusinessException notFound() {
    return new BusinessException(HttpStatus.NOT_FOUND, "SETTLEMENT_NOT_FOUND", "Kayıt bulunamadı.");
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

  /**
   * Kaydın şirketini (iş yerinden) döndürür; fon, ciro çeki ve çekin banka hesabı bu şirkette
   * olmalıdır. {@code preview}: önizlemede çek/senet bilgisinin zorunluluğu atlanır (F-12.2-R4).
   */
  private UUID validate(SettlementType type, SettlementRequest request, boolean preview) {
    return validate(type, request, preview, null);
  }

  /**
   * Düzeltme bağlamı (§3.3, Rev 1 F1): eski kayıt çekli bir köken kayıtsa eski çekin kimliği,
   * yaprağı, numarası ve fonu. Numara tekilliğinde eski çek dışlanır, eski yaprak {@code USED} olsa
   * da kabul edilir; yapraksız eski çekle aynı numara/fon koçan denetiminden muaftır.
   */
  private record CorrectionContext(
      UUID oldInstrumentId, UUID oldCheckLeafId, String oldNumber, UUID oldFundAccountId) {}

  private static CorrectionContext correctionContext(Settlement old, Instrument instrument) {
    if (instrument == null || !InstrumentRules.isOrigin(old.getType(), instrument.getDirection())) {
      return null;
    }
    return new CorrectionContext(
        instrument.getId(),
        instrument.getCheckLeafId(),
        instrument.getNumber(),
        instrument.getFundAccountId());
  }

  private UUID validate(
      SettlementType type, SettlementRequest request, boolean preview, CorrectionContext ctx) {
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
    if (request.channel() != null && request.method() != SettlementMethod.BANK) {
      throw bad("CHANNEL_INVALID", "Kanal yalnız banka ödemesinde seçilebilir.");
    }
    validateCounterparty(request);
    switch (request.method()) {
      case CASH -> requireFund(request, FundKind.CASH, companyId);
      case BANK -> requireFund(request, FundKind.BANK, companyId);
      case CHECK -> {
        validateCheck(type, request, preview);
        validateInstrument(type, request, companyId, preview, ctx);
      }
    }
    return companyId;
  }

  /** Karşı tarafın banka hesabı: yalnız banka yönteminde, kaydın carisine ait ve aktif. */
  private void validateCounterparty(SettlementRequest request) {
    UUID id = request.counterpartyBankAccountId();
    if (id == null) {
      return;
    }
    boolean valid =
        request.method() == SettlementMethod.BANK
            && request.accountId() != null
            && bankAccounts
                .findByIdAndAccountIdAndDeletedFalse(id, request.accountId())
                .filter(AccountBankAccount::isActive)
                .isPresent();
    if (!valid) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "COUNTERPARTY_BANK_ACCOUNT_INVALID",
          "Seçilen banka hesabı bu cariye ait değil ya da pasif.");
    }
  }

  private void validateCheck(SettlementType type, SettlementRequest request, boolean preview) {
    if (preview) {
      return;
    }
    boolean endorsing = request.instrumentId() != null;
    if (type == SettlementType.COLLECTION && (endorsing || request.instrument() == null)) {
      throw bad("INSTRUMENT_REQUIRED", "Tahsilat için çek/senet bilgisi girilmelidir.");
    }
    if (type == SettlementType.PAYMENT && endorsing == (request.instrument() != null)) {
      throw bad(
          "INSTRUMENT_REQUIRED", "Ödeme için yeni çek/senet veya cirolanacak çek seçilmelidir.");
    }
  }

  /**
   * Yeni çek/senedin banka hesabı ve ilk durumu (12.2a §3.2): ödemede ilk durum verilmez, banka
   * hesabı isteğe bağlıdır; tahsilatta yalnız {@code PORTFOLIO}/{@code AT_BANK}, {@code AT_BANK}
   * yalnız çekte ve banka hesabıyla; portföydeki çeke banka hesabı verilmez (kasa/emanet 12.3).
   */
  private void validateInstrument(
      SettlementType type,
      SettlementRequest request,
      UUID companyId,
      boolean preview,
      CorrectionContext ctx) {
    NewInstrument data = request.instrument();
    if (data == null) {
      return;
    }
    InstrumentStatus status = data.initialStatus();
    if (type == SettlementType.PAYMENT) {
      if (status != null) {
        throw bad("INSTRUMENT_STATUS_INVALID", "Çek durumu bu işlem için geçersiz.");
      }
    } else if (status == InstrumentStatus.AT_BANK) {
      if (data.kind() != InstrumentKind.CHECK) {
        throw bad("INSTRUMENT_STATUS_INVALID", "Yalnız çek bankaya yatırılmış olarak alınabilir.");
      }
      if (data.fundAccountId() == null) {
        throw bad("FUND_REQUIRED", "Çekin yatırıldığı banka hesabı seçilmelidir.");
      }
    } else if (status != null && status != InstrumentStatus.PORTFOLIO) {
      throw bad("INSTRUMENT_STATUS_INVALID", "Çek durumu bu işlem için geçersiz.");
    } else if (data.fundAccountId() != null) {
      throw bad("INSTRUMENT_STATUS_INVALID", "Portföydeki çek/senede banka hesabı seçilemez.");
    }
    if (data.fundAccountId() != null) {
      checkFund(
          funds.findVisible(data.fundAccountId()),
          FundKind.BANK,
          request.money().currency(),
          companyId);
    }
    if (data.issueDate() != null && data.issueDate().isAfter(data.dueDate())) {
      throw InstrumentService.datesInvalid();
    }
    validateCustody(type, request, companyId);
    if (preview) {
      return;
    }
    validateInstrumentIdentity(type, data, companyId, ctx);
  }

  /** Emanet kasası (§3.3 #6): yalnız tahsilatta portföydeki çekte; CASH, aktif, aynı şirket. */
  private void validateCustody(SettlementType type, SettlementRequest request, UUID companyId) {
    NewInstrument data = request.instrument();
    if (data.custodyFundId() == null) {
      return;
    }
    InstrumentStatus status = data.initialStatus();
    if (type != SettlementType.COLLECTION
        || (status != null && status != InstrumentStatus.PORTFOLIO)) {
      throw bad(
          "INSTRUMENT_CUSTODY_INVALID", "Çekin tutulduğu kasa yalnız portföydeki çekte seçilir.");
    }
    FundAccount fund = funds.findVisible(data.custodyFundId());
    checkFund(fund, FundKind.CASH, request.money().currency(), companyId);
    FundService.requireActive(fund);
  }

  /**
   * Numara biçimi, senet türü, koçan yaprağı, elle girilen numaranın koçanda olmaması ve numara
   * tekilliği (§3.3 #1, #7, #3, #4, #2 sırasıyla: yaprak iletisi daha belirleyicidir; önizlemede
   * çalışmaz). Kilitli yaprak denetimi {@code register}'da.
   */
  private void validateInstrumentIdentity(
      SettlementType type, NewInstrument data, UUID companyId, CorrectionContext ctx) {
    boolean check = data.kind() == InstrumentKind.CHECK;
    if (check && !InstrumentService.validCheckNumber(data.number())) {
      throw InstrumentService.checkNumberInvalid();
    }
    if (check && data.noteType() != null) {
      throw InstrumentService.noteTypeInvalid();
    }
    if (data.checkLeafId() != null) {
      validateLeaf(type, data, check, ctx);
    } else if (type == SettlementType.PAYMENT && check && data.fundAccountId() != null) {
      boolean sameAsOld =
          ctx != null
              && ctx.oldCheckLeafId() == null
              && data.number().equals(ctx.oldNumber())
              && data.fundAccountId().equals(ctx.oldFundAccountId());
      if (!sameAsOld) {
        leaves
            .findByFundAccountIdAndNumberAndDeletedFalse(data.fundAccountId(), data.number())
            .ifPresent(
                leaf -> {
                  throw new BusinessException(
                      HttpStatus.CONFLICT,
                      "CHECK_NUMBER_IN_CHECK_BOOK",
                      "Bu çek numarası koçan yaprağı olarak kayıtlı — manuel olarak"
                          + " kullanılamaz, lütfen koçandan seçiniz.",
                      List.of("leafId=" + leaf.getId(), "leafStatus=" + leaf.getStatus()));
                });
      }
    }
    InstrumentDirection direction =
        type == SettlementType.COLLECTION
            ? InstrumentDirection.RECEIVED
            : InstrumentDirection.ISSUED;
    instrumentRecords
        .findActiveByNumber(
            companyId,
            data.kind(),
            direction,
            data.number(),
            data.bankName(),
            ctx == null ? null : ctx.oldInstrumentId())
        .ifPresent(
            conflict -> {
              throw new BusinessException(
                  HttpStatus.CONFLICT,
                  "INSTRUMENT_NUMBER_TAKEN",
                  "Bu çek numarası zaten kullanılıyor!",
                  List.of("status=" + conflict.getStatus()));
            });
  }

  /** Koçan yaprağı (§3.3 #3): yalnız kendi çekimizle (banka hesaplı) ödemede. */
  private void validateLeaf(
      SettlementType type, NewInstrument data, boolean check, CorrectionContext ctx) {
    if (type != SettlementType.PAYMENT || !check || data.fundAccountId() == null) {
      throw bad("CHECK_LEAF_INVALID", "Koçan yaprağı yalnız kendi çekimizle ödemede seçilir.");
    }
    CheckLeaf leaf =
        leaves.findById(data.checkLeafId()).orElseThrow(InstrumentService::leafNotFound);
    if (!leaf.getFundAccountId().equals(data.fundAccountId())
        || !leaf.getNumber().equals(data.number())) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "CHECK_LEAF_MISMATCH",
          "Seçilen koçan yaprağı bu banka hesabına ait değil.");
    }
    boolean oldLeaf = ctx != null && leaf.getId().equals(ctx.oldCheckLeafId());
    if (leaf.getStatus() != CheckLeafStatus.UNUSED && !oldLeaf) {
      throw InstrumentService.leafUsed();
    }
  }

  private void requireFund(SettlementRequest request, FundKind kind, UUID companyId) {
    if (request.fundAccountId() == null) {
      throw bad("FUND_REQUIRED", "Banka/kasa hesabı seçilmelidir.");
    }
    checkFund(
        funds.findVisible(request.fundAccountId()), kind, request.money().currency(), companyId);
  }

  private static void checkFund(FundAccount fund, FundKind kind, String currency, UUID companyId) {
    if (fund.getKind() != kind) {
      throw bad("FUND_KIND_MISMATCH", "Seçilen hesap, ödeme yöntemine uygun değil.");
    }
    if (!fund.getCurrency().equals(currency)) {
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
