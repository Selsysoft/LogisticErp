package org.ece.blackrose.finance.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.FinanceTypes.FundAccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.FundTransferType;
import org.ece.blackrose.finance.domain.FinanceTypes.IntercompanyReason;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.domain.FinanceTypes.TransferStatus;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.domain.IntercompanyTransfer;
import org.ece.blackrose.finance.domain.Settlement;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundAccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.SettlementRepository;
import org.ece.blackrose.finance.repository.FundRepositories.IntercompanyTransferRepository;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementRequest;
import org.ece.blackrose.finance.web.FundDtos.IntercompanyTransferRequest;
import org.ece.blackrose.finance.web.FundDtos.IntercompanyTransferResponse;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.organization.Company;
import org.ece.blackrose.organization.CompanyRepository;
import org.ece.blackrose.organization.DocumentNumberService;
import org.ece.blackrose.organization.DocumentType;
import org.ece.blackrose.organization.IntercompanyAccountService;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Şirketler arası virman (12.2_TASARIM §3.4, K-12.2-2; MX5 D8): A şirketinin fonundan B şirketinin
 * fonuna para; A'da grup şirketi B carisine ödeme (PAYMENT), B'de grup şirketi A carisinden
 * tahsilat (COLLECTION) tek işlemde. Bacaklar {@link SettlementService#create} ile yazılır
 * (türetilmiş yol: şirket dağılımı uyarısı ve kart–şirket kimlik kuralı uygulanmaz). Settlement
 * anahtarlarını sunucu üretir ({@code ict:<id>:P/C}, OK-12.2-36). Geri alma yalnız buradandır;
 * settlement'lar tek başına iptal edilemez.
 */
@Service
public class IntercompanyTransferService {

  /** Settlement anahtar öneki; kullanıcı anahtarı olarak kullanılamaz (SEC-12.2-03). */
  public static final String KEY_PREFIX = "ict:";

  private static final String TARGET = "INTERCOMPANY_TRANSFER:";
  private static final String IDEMPOTENCY_INDEX = "intercompany_transfer_idempotency_uq";

  private final IntercompanyTransferRepository transfers;
  private final FundAccountRepository funds;
  private final SettlementRepository settlementRows;
  private final AccountRepository accounts;
  private final CompanyRepository companies;
  private final IntercompanyAccountService groupAccounts;
  private final SettlementService settlements;
  private final DocumentNumberService numbers;
  private final BranchScopeService scope;
  private final AuditService audit;
  private final TenantClock clock;

  @PersistenceContext private EntityManager entityManager;

  @SuppressWarnings("java:S107")
  public IntercompanyTransferService(
      IntercompanyTransferRepository transfers,
      FundAccountRepository funds,
      SettlementRepository settlementRows,
      AccountRepository accounts,
      CompanyRepository companies,
      IntercompanyAccountService groupAccounts,
      SettlementService settlements,
      DocumentNumberService numbers,
      BranchScopeService scope,
      AuditService audit,
      TenantClock clock) {
    this.transfers = transfers;
    this.funds = funds;
    this.settlementRows = settlementRows;
    this.accounts = accounts;
    this.companies = companies;
    this.groupAccounts = groupAccounts;
    this.settlements = settlements;
    this.numbers = numbers;
    this.scope = scope;
    this.audit = audit;
    this.clock = clock;
  }

  /**
   * Yeni virman (§3.4.1). Aynı anahtar aynı istekle ilk kaydı döner, farklı istekle 422 {@code
   * IDEMPOTENCY_KEY_REUSED}; eşzamanlı aynı anahtarın ikincisi aynı kaydı alır ya da 409 {@code
   * IDEMPOTENCY_IN_PROGRESS} (iki settlement de geri alınır).
   */
  @Transactional
  public IntercompanyTransferResponse create(
      IntercompanyTransferRequest request, String idempotencyKey) {
    Optional<IntercompanyTransfer> replay = replay(request, idempotencyKey);
    if (replay.isPresent()) {
      return response(replay.get());
    }
    FundAccount from = visibleFund(request.fromFundId());
    FundAccount to = visibleFund(request.toFundId());
    long activeCompanies = companies.findAll().stream().filter(Company::isActive).count();
    if (activeCompanies < 2) {
      throw unprocessable(
          "INTERCOMPANY_REQUIRES_COMPANIES",
          "Şirketler arası virman için en az iki aktif şirket gerekir.");
    }
    if (from.getCompanyId().equals(to.getCompanyId())) {
      throw unprocessable(
          "INTERCOMPANY_SAME_COMPANY",
          "Aynı şirketin hesapları arasında Transfer Merkezi kullanılır.");
    }
    scope.requireNew(from.getBranchId());
    scope.requireNew(to.getBranchId());
    FundService.requireActive(from);
    FundService.requireActive(to);
    Money money = request.money();
    if (money.amount().signum() <= 0) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "AMOUNT_INVALID", "Tutar 0'dan büyük olmalıdır.");
    }
    if (!from.getCurrency().equals(to.getCurrency())
        || !from.getCurrency().equals(money.currency())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "CURRENCY_MISMATCH",
          "Kaynak ve hedef hesap aynı para biriminde olmalıdır.");
    }
    requireRule(request.transferType(), from, to);

    Account groupOfTo = groupAccount(to.getCompanyId());
    Account groupOfFrom = groupAccount(from.getCompanyId());
    accounts.lockForTransfer(List.of(groupOfTo.getId(), groupOfFrom.getId()));
    funds.lockAll(List.of(from.getId(), to.getId()));
    replay = replay(request, idempotencyKey);
    if (replay.isPresent()) {
      return response(replay.get());
    }

    String code =
        numbers.next(from.getCompanyId(), DocumentType.INTERCOMPANY_TRANSFER, request.date());
    String userText = blankToNull(request.description());
    String text =
        LedgerDescriptions.fit(
            reasonText(
                    request.reasonType(),
                    shortName(from.getCompanyId()),
                    shortName(to.getCompanyId()))
                + (userText == null ? "" : " — " + userText));
    IntercompanyTransfer transfer =
        new IntercompanyTransfer(
            code,
            request.transferType(),
            request.reasonType(),
            request.date(),
            new IntercompanyTransfer.Side(from.getCompanyId(), from.getBranchId(), from.getId()),
            new IntercompanyTransfer.Side(to.getCompanyId(), to.getBranchId(), to.getId()),
            money,
            blankToNull(request.documentNo()),
            userText,
            idempotencyKey);
    Settlement payment =
        settlements.create(
            SettlementType.PAYMENT,
            leg(from, groupOfTo, money, request.date(), text),
            KEY_PREFIX + transfer.getId() + ":P",
            null);
    Settlement collection =
        settlements.create(
            SettlementType.COLLECTION,
            leg(to, groupOfFrom, money, request.date(), text),
            KEY_PREFIX + transfer.getId() + ":C",
            null);
    transfer.attachSettlements(payment.getId(), collection.getId());
    save(transfer);
    audit.record(AuditEvent.INTERCOMPANY_TRANSFER_CREATED, TARGET + transfer.getId(), code);
    return response(transfer);
  }

  /**
   * Geri alma (§3.4.2): önce tahsilat (B fonu çıkışı; bakiye yetmezse 409), sonra ödeme ters
   * çevrilir. Tahsilat geçerli bir döviz bozumunun kaynağıysa 409 {@code
   * SETTLEMENT_USED_IN_FX_EXCHANGE} ve hiçbir şey değişmez. Kilit sırası: grup carileri → virman →
   * fonlar → settlement'lar.
   */
  @Transactional
  public IntercompanyTransferResponse reverse(UUID id, LocalDate date, String reason) {
    IntercompanyTransfer transfer = find(id);
    requireWritable(transfer);
    if (transfer.getStatus() == TransferStatus.REVERSED) {
      return response(transfer);
    }
    FundTransferService.requireReverseDate(transfer.getTransferDate(), date, clock.today());
    Settlement payment = settlementRows.findById(transfer.getPaymentSettlementId()).orElseThrow();
    Settlement collection =
        settlementRows.findById(transfer.getCollectionSettlementId()).orElseThrow();
    accounts.lockForTransfer(List.of(payment.getAccountId(), collection.getAccountId()));
    entityManager.refresh(transfer, LockModeType.PESSIMISTIC_WRITE);
    if (transfer.getStatus() == TransferStatus.REVERSED) {
      return response(transfer);
    }
    funds.lockAll(List.of(transfer.getFromFundId(), transfer.getToFundId()));
    List<Settlement> ordered = new ArrayList<>(List.of(payment, collection));
    ordered.sort(Comparator.comparing(s -> s.getId().toString()));
    for (Settlement settlement : ordered) {
      entityManager.refresh(settlement, LockModeType.PESSIMISTIC_WRITE);
    }
    String text = "İptal: " + transfer.getCode();
    settlements.reverseLinked(collection.getId(), date, text);
    settlements.reverseLinked(payment.getId(), date, text);
    transfer.markReversed(date, blankToNull(reason));
    audit.record(
        AuditEvent.INTERCOMPANY_TRANSFER_REVERSED, TARGET + transfer.getId(), transfer.getCode());
    return response(transfer);
  }

  /**
   * Liste: şirket süzgeci iki tarafa uygulanır; iki taraftan biri görünürse satır görünür, diğer
   * tarafın fon/iş yeri alanları {@code null}. Aralık ≤ 366 gün, sayfa ≤ 200.
   */
  @Transactional(readOnly = true)
  public PageResponse<IntercompanyTransferResponse> list(
      UUID companyId, LocalDate from, LocalDate to, int page, int size) {
    if (size < 1 || size > FundTransferService.MAX_PAGE_SIZE) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "PAGE_SIZE_INVALID", "Sayfa boyutu 1–200 olmalıdır.");
    }
    FundTransferService.requireRange(from, to);
    BranchFilter filter = scope.filter(companyId, null);
    Page<IntercompanyTransfer> rows =
        transfers.search(
            filter.companyId(),
            filter.allBranches(),
            filter.branchIds(),
            from,
            to,
            PageRequest.of(Math.max(0, page), size));
    return PageResponse.from(rows, this::response);
  }

  @Transactional(readOnly = true)
  public IntercompanyTransferResponse get(UUID id) {
    IntercompanyTransfer transfer = find(id);
    Map<UUID, FundAccount> sides = sides(transfer);
    if (!visible(sides.get(transfer.getFromFundId()))
        && !visible(sides.get(transfer.getToFundId()))) {
      throw notFound();
    }
    return response(transfer);
  }

  // --- iç akış

  private Optional<IntercompanyTransfer> replay(IntercompanyTransferRequest request, String key) {
    if (key == null) {
      return Optional.empty();
    }
    return transfers
        .findByIdempotencyKey(key)
        .map(
            existing -> {
              requireWritable(existing);
              boolean same =
                  existing.getTransferType() == request.transferType()
                      && existing.getReasonType() == request.reasonType()
                      && existing.getFromFundId().equals(request.fromFundId())
                      && existing.getToFundId().equals(request.toFundId())
                      && existing.getMoney().equals(request.money())
                      && existing.getTransferDate().equals(request.date());
              if (!same) {
                throw unprocessable(
                    "IDEMPOTENCY_KEY_REUSED",
                    "Bu işlem anahtarı başka bir istek için kullanılmış.");
              }
              return existing;
            });
  }

  /** Tür kuralı (§3.4.1 adım 4): yön hesap türleriyle tutarlı; virman ve döviz bozumu yok. */
  static void requireRule(FundTransferType type, FundAccount from, FundAccount to) {
    FundKind f = from.getKind();
    FundKind t = to.getKind();
    String rule = null;
    String message = null;
    switch (type) {
      case VIREMENT -> {
        rule = "VIREMENT_INTERCOMPANY";
        message = "Virman yalnız aynı şirketin hesapları arasında yapılır.";
      }
      case FX_EXCHANGE -> {
        rule = "FX_INTERCOMPANY";
        message = "Şirketler arası döviz bozumu yapılamaz; önce şirket içinde bozun.";
      }
      case EFT, WIRE -> {
        if (f != FundKind.BANK || t != FundKind.BANK) {
          rule = "KIND";
          message = "EFT/Havale yalnız banka hesapları arasında yapılır.";
        }
      }
      case BANK_TO_CASH -> {
        if (f != FundKind.BANK || t != FundKind.CASH) {
          rule = "KIND";
          message = "Bankadan kasaya transferde kaynak banka, hedef kasa olmalıdır.";
        }
      }
      case CASH_TO_BANK -> {
        if (f != FundKind.CASH || t != FundKind.BANK) {
          rule = "KIND";
          message = "Kasadan bankaya transferde kaynak kasa, hedef banka olmalıdır.";
        }
      }
      case CASH_TO_CASH -> {
        if (f != FundKind.CASH || t != FundKind.CASH) {
          rule = "KIND";
          message = "Kasadan kasaya transfer yalnız kasalar arasında yapılır.";
        }
      }
    }
    if (rule == null
        && (from.getAccountType() != FundAccountType.DEMAND
            || to.getAccountType() != FundAccountType.DEMAND)) {
      rule = "ACCOUNT_TYPE";
      message = "Transfer yalnız vadesiz hesaplar arasında yapılır.";
    }
    if (rule != null) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "TRANSFER_RULE_VIOLATION",
          message,
          List.of("rule=" + rule));
    }
  }

  /**
   * Neden metni (ZTO {@code updateTransferReasonDropdownTexts}; iş yeri yerine şirket kısa adı).
   * Yön her iki nedende aynıdır; neden yalnız metni değiştirir.
   */
  static String reasonText(IntercompanyReason reason, String from, String to) {
    return switch (reason) {
      case DEBT_PAID ->
          from
              + " - "
              + to
              + " 'YE BORCUNU ÖDÜYOR / "
              + to
              + " - "
              + from
              + " 'TAN ALACAĞINI TAHSİL EDİYOR";
      case LOAN_GIVEN ->
          from + " - " + to + " 'YE BORÇ VERİYOR / " + to + " - " + from + " 'TAN BORÇ ALIYOR";
    };
  }

  /** Bacak isteği: yöntem fonun türü (tahsilatta hedef fonun türü, F9). */
  private static SettlementRequest leg(
      FundAccount fund, Account groupAccount, Money money, LocalDate date, String text) {
    return new SettlementRequest(
        fund.getKind() == FundKind.BANK ? SettlementMethod.BANK : SettlementMethod.CASH,
        groupAccount.getId(),
        fund.getBranchId(),
        fund.getId(),
        null,
        null,
        null,
        money,
        date,
        text,
        null);
  }

  /** Şirketi temsil eden grup carisi; yoksa açılır, yine yoksa 409. */
  private Account groupAccount(UUID companyId) {
    Optional<Account> account = groupAccounts.representing(companyId);
    if (account.isEmpty()) {
      companies.lockTenantCompanies();
      groupAccounts.ensureAll();
      account = groupAccounts.representing(companyId);
    }
    return account.orElseThrow(
        () ->
            new BusinessException(
                HttpStatus.CONFLICT,
                "INTERCOMPANY_ACCOUNT_MISSING",
                "Şirketin grup şirketi carisi bulunamadı."));
  }

  private String shortName(UUID companyId) {
    return companies
        .findById(companyId)
        .map(
            c ->
                c.getShortName() == null || c.getShortName().isBlank()
                    ? c.getCode()
                    : c.getShortName())
        .orElse("");
  }

  private void save(IntercompanyTransfer transfer) {
    try {
      transfers.saveAndFlush(transfer);
    } catch (DataIntegrityViolationException ex) {
      if (String.valueOf(ex.getMostSpecificCause().getMessage()).contains(IDEMPOTENCY_INDEX)) {
        throw new BusinessException(
            HttpStatus.CONFLICT, "IDEMPOTENCY_IN_PROGRESS", "Aynı işlem şu anda kaydediliyor.");
      }
      throw ex;
    }
  }

  // --- kapsam ve yanıt

  private void requireWritable(IntercompanyTransfer transfer) {
    Map<UUID, FundAccount> sides = sides(transfer);
    boolean from = visible(sides.get(transfer.getFromFundId()));
    boolean to = visible(sides.get(transfer.getToFundId()));
    if (!from && !to) {
      throw notFound();
    }
    if (!from || !to) {
      throw BranchScopeService.outOfScope();
    }
  }

  private Map<UUID, FundAccount> sides(IntercompanyTransfer transfer) {
    return funds.findAllById(List.of(transfer.getFromFundId(), transfer.getToFundId())).stream()
        .collect(Collectors.toMap(FundAccount::getId, Function.identity()));
  }

  private boolean visible(FundAccount fund) {
    if (fund == null) {
      return false;
    }
    Set<UUID> allowed = scope.allowedOrNull();
    return allowed == null || allowed.contains(fund.getBranchId());
  }

  private FundAccount visibleFund(UUID id) {
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

  private IntercompanyTransfer find(UUID id) {
    return transfers.findById(id).orElseThrow(IntercompanyTransferService::notFound);
  }

  private IntercompanyTransferResponse response(IntercompanyTransfer t) {
    Map<UUID, FundAccount> sides = sides(t);
    FundAccount from = sides.get(t.getFromFundId());
    FundAccount to = sides.get(t.getToFundId());
    boolean fromVisible = visible(from);
    boolean toVisible = visible(to);
    return new IntercompanyTransferResponse(
        t.getId(),
        t.getCode(),
        t.getTransferType(),
        t.getReasonType(),
        t.getTransferDate(),
        t.getFromCompanyId(),
        t.getToCompanyId(),
        fromVisible ? t.getFromBranchId() : null,
        toVisible ? t.getToBranchId() : null,
        t.getFromFundId(),
        fromVisible ? from.getCode() : null,
        fromVisible ? from.getName() : null,
        t.getToFundId(),
        toVisible ? to.getCode() : null,
        toVisible ? to.getName() : null,
        t.getMoney(),
        t.getPaymentSettlementId(),
        t.getCollectionSettlementId(),
        t.getDocumentNo(),
        t.getDescription(),
        reasonText(
            t.getReasonType(), shortName(t.getFromCompanyId()), shortName(t.getToCompanyId())),
        t.getStatus(),
        t.getReversedAt(),
        t.getReversalReason(),
        t.getCreatedBy(),
        t.getCreatedAt());
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  private static BusinessException unprocessable(String code, String message) {
    return new BusinessException(HttpStatus.UNPROCESSABLE_ENTITY, code, message);
  }

  static BusinessException notFound() {
    return new BusinessException(
        HttpStatus.NOT_FOUND, "INTERCOMPANY_TRANSFER_NOT_FOUND", "Transfer bilgisi alınamadı.");
  }
}
