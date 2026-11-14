package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Currency;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.FundAccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.FundCategory;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.FundOpeningStatus;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.domain.FundOpening;
import org.ece.blackrose.finance.domain.FundTransaction;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundAccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundStatementRow;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundTransactionRepository;
import org.ece.blackrose.finance.repository.FundRepositories.FundOpeningRepository;
import org.ece.blackrose.finance.repository.FundRepositories.FundTransferCostRepository;
import org.ece.blackrose.finance.service.FundLedgerService.FundPosting;
import org.ece.blackrose.finance.web.FinanceDtos.CreateFundRequest;
import org.ece.blackrose.finance.web.FinanceDtos.FundResponse;
import org.ece.blackrose.finance.web.FinanceDtos.ManualFundTransactionRequest;
import org.ece.blackrose.finance.web.FinanceDtos.StatementLine;
import org.ece.blackrose.finance.web.FinanceDtos.StatementResponse;
import org.ece.blackrose.finance.web.FinanceDtos.UpdateFundRequest;
import org.ece.blackrose.finance.web.FundDtos.FundCanDeleteResponse;
import org.ece.blackrose.finance.web.FundDtos.FundDeleteReasonResponse;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.security.PersonalDataProtector;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.organization.CompanyResolver;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Banka/kasa tanımı (12.2_TASARIM §3.1): oluşturma, düzenleme, açılış bakiyesi, aktiflik, silme ve
 * manuel hareket. Hesap no şifreli + maskeli saklanır (SEC-12.2-07); bakiye saklanmaz, açılış bir
 * {@code FUND_OPENING} hareketidir. Okuma uçları {@link FundQueryService}'tedir.
 */
@Service
public class FundService {

  /** Açılış bakiyesi hareketinin kaynak türü ({@code source_id} = {@code fund_opening.id}). */
  public static final String SOURCE_OPENING = "FUND_OPENING";

  /** 12.2 öncesi başlıksız virman çifti (OK-12.2-8); yeni transferler {@code FUND_TRANSFER}. */
  private static final String SOURCE_LEGACY_TRANSFER = "TRANSFER";

  private static final String TARGET = "FUND:";
  private static final Pattern WHITESPACE = Pattern.compile("\\s+");

  private final FundAccountRepository funds;
  private final FundTransactionRepository transactions;
  private final FundOpeningRepository openings;
  private final FundTransferCostRepository transferCosts;
  private final FundTransferService fundTransfers;
  private final FundLedgerService ledger;
  private final FundQueryService queries;
  private final CompanyResolver companies;
  private final BranchScopeService scope;
  private final PersonalDataProtector protector;
  private final AuditService audit;
  private final TenantClock clock;
  private final ExchangeRateService rates;

  @SuppressWarnings("java:S107")
  public FundService(
      FundAccountRepository funds,
      FundTransactionRepository transactions,
      FundOpeningRepository openings,
      FundTransferCostRepository transferCosts,
      FundTransferService fundTransfers,
      FundLedgerService ledger,
      FundQueryService queries,
      CompanyResolver companies,
      BranchScopeService scope,
      PersonalDataProtector protector,
      AuditService audit,
      TenantClock clock,
      ExchangeRateService rates) {
    this.scope = scope;
    this.funds = funds;
    this.transactions = transactions;
    this.openings = openings;
    this.transferCosts = transferCosts;
    this.fundTransfers = fundTransfers;
    this.ledger = ledger;
    this.queries = queries;
    this.companies = companies;
    this.protector = protector;
    this.audit = audit;
    this.clock = clock;
    this.rates = rates;
  }

  /**
   * Yeni hesap. Kasa yalnız vadesiz (400 {@code FUND_ACCOUNT_TYPE_INVALID}); kullanıcı yolunda
   * yalnız vadesiz açılır (422 {@code FUND_ACCOUNT_TYPE_MANAGED}, kredi/mevduat kendi modülünden).
   * Açılış bakiyesi verilmişse {@code FUND_OPENING} hareketi yazılır; eksi açılış için eksi bakiye
   * izni gerekir (409 {@code INSUFFICIENT_FUNDS}).
   */
  @Transactional
  public FundResponse create(CreateFundRequest request) {
    if (funds.findByCode(request.code()).isPresent()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "FUND_CODE_TAKEN", "Bu hesap kodu kullanımda.");
    }
    FundAccountType accountType =
        request.accountType() == null ? FundAccountType.DEMAND : request.accountType();
    if (request.kind() == FundKind.CASH && accountType != FundAccountType.DEMAND) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "FUND_ACCOUNT_TYPE_INVALID", "Kasa yalnız vadesiz olabilir.");
    }
    if (accountType != FundAccountType.DEMAND) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "FUND_ACCOUNT_TYPE_MANAGED",
          "Bu hesap türü ilgili modülden açılır.");
    }
    String currency = Currency.getInstance(request.currency()).getCurrencyCode();
    BigDecimal opening = request.openingBalance();
    LocalDate openingDate = request.openingDate() == null ? clock.today() : request.openingDate();
    requireOpeningRate(currency, opening, openingDate, request.openingRate());
    UUID companyId = companies.companyOf(request.branchId());
    String accountNo = normalizeAccountNo(request.accountNo());
    FundAccount fund =
        funds.save(
            new FundAccount(
                request.code(),
                request.name(),
                request.kind(),
                currency,
                request.branchId(),
                companyId,
                request.bankName(),
                request.iban(),
                request.allowNegative(),
                accountType,
                protector.encrypt(accountNo),
                PersonalDataProtector.maskAccountNumber(accountNo),
                blankToNull(request.bankBranchName()),
                blankToNull(request.description())));
    if (Boolean.FALSE.equals(request.active())) {
      fund.deactivate();
    }
    audit.record(AuditEvent.FUND_CREATED, TARGET + fund.getId(), fund.getCode());
    if (opening != null && opening.signum() != 0) {
      setOpening(fund, opening, openingDate, request.openingRate());
    }
    return queries.response(fund);
  }

  /**
   * Düzenleme: kod, tür, para birimi ve hesap türü değişmez; kullanılmış hesabın şirketi değişmez
   * (409 {@code FUND_COMPANY_LOCKED}). {@code active} ve {@code openingBalance} null ise
   * dokunulmaz; açılış farklıysa yeni açılış yazılıp eskisi kendi tarihiyle ters çevrilir.
   */
  @Transactional
  public FundResponse update(UUID id, UpdateFundRequest request) {
    FundAccount fund = find(id);
    scope.requireForUpdate(request.branchId(), fund.getBranchId());
    UUID companyId = companies.companyOf(request.branchId());
    // Kullanılmış hesabın şirketi değişmez; bileşik FK'ler de aynı durumu keser (§4.13 #4).
    if (!companyId.equals(fund.getCompanyId()) && funds.isUsed(id)) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "FUND_COMPANY_LOCKED",
          "Kullanılmış hesabın şirketi değiştirilemez.");
    }
    String accountNo = normalizeAccountNo(request.accountNo());
    String bankBranchName = blankToNull(request.bankBranchName());
    String description = blankToNull(request.description());
    List<String> changed = new ArrayList<>();
    track(changed, "name", fund.getName(), request.name());
    track(changed, "branchId", fund.getBranchId(), request.branchId());
    track(changed, "bankName", fund.getBankName(), request.bankName());
    track(changed, "iban", fund.getIban(), request.iban());
    track(changed, "allowNegative", fund.isAllowNegative(), request.allowNegative());
    track(changed, "bankBranchName", fund.getBankBranchName(), bankBranchName);
    track(changed, "description", fund.getDescription(), description);
    fund.update(
        request.name(),
        request.branchId(),
        companyId,
        request.bankName(),
        request.iban(),
        request.allowNegative());
    String accountNoEnc = fund.getAccountNoEnc();
    String accountNoMasked = fund.getAccountNoMasked();
    // Aynı hesap no yeniden şifrelenmez (şifreli metin her seferinde farklıdır).
    if (!Objects.equals(accountNo, protector.decrypt(accountNoEnc))) {
      changed.add("accountNo");
      accountNoEnc = protector.encrypt(accountNo);
      accountNoMasked = PersonalDataProtector.maskAccountNumber(accountNo);
    }
    fund.updateDetails(accountNoEnc, accountNoMasked, bankBranchName, description);
    fund.incrementUpdateCount();
    if (request.active() != null) {
      applyActive(fund, request.active());
    }
    if (request.openingBalance() != null) {
      LocalDate date = request.openingDate();
      if (date == null) {
        date =
            openings
                .findFirstByFundAccountIdAndStatus(id, FundOpeningStatus.POSTED)
                .map(FundOpening::getOpeningDate)
                .orElse(clock.today());
      }
      setOpening(fund, request.openingBalance(), date, request.openingRate());
    }
    if (!changed.isEmpty()) {
      audit.record(AuditEvent.FUND_UPDATED, TARGET + id, String.join(",", changed));
    }
    return queries.response(fund);
  }

  /** Aktif/pasif (ZTO "Pasifleştir"); değişmezse yazım yok. */
  @Transactional
  public FundResponse setActive(UUID id, boolean active) {
    FundAccount fund = findVisible(id);
    applyActive(fund, active);
    return queries.response(fund);
  }

  /**
   * Silme (ZTO "Sil"): engelleyen kayıt varsa 409 {@code FUND_HAS_TRANSACTIONS} ({@code details} =
   * {@code KIND=sayı}); yalnız şirketin varsayılan hesabıysa 409 {@code FUND_IS_COMPANY_DEFAULT}.
   * Yalnız açılış hareketi olan hesapta açılış kendi tarihiyle ters çevrilir, sonra hesap silinir.
   */
  @Transactional
  public void delete(UUID id) {
    FundAccount fund = findVisible(id);
    FundCanDeleteResponse check = queries.canDelete(fund);
    if (!check.allowed()) {
      List<FundDeleteReasonResponse> blocking =
          check.reasons().stream().filter(r -> !"COMPANY_DEFAULT".equals(r.kind())).toList();
      if (blocking.isEmpty()) {
        throw new BusinessException(
            HttpStatus.CONFLICT,
            "FUND_IS_COMPANY_DEFAULT",
            "Şirketin varsayılan banka hesabı silinemez; önce şirket kartından kaldırın.");
      }
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "FUND_HAS_TRANSACTIONS",
          "Hareketi olan hesap silinemez.",
          check.reasons().stream().map(r -> r.kind() + "=" + r.count()).toList());
    }
    setOpening(fund, BigDecimal.ZERO, clock.today(), null);
    fund.markDeleted();
    audit.record(AuditEvent.FUND_DELETED, TARGET + id, fund.getCode());
  }

  /**
   * Kullanıcı girişli manuel hareket: pasif hesapta 422 {@code FUND_INACTIVE}; kategori
   * EXPENSE/INCOME/OTHER (boşsa OTHER).
   */
  @Transactional
  public FundTransaction postManual(UUID fundId, ManualFundTransactionRequest request) {
    FundAccount fund = findVisible(fundId);
    requireActive(fund);
    FundCategory category = request.category() == null ? FundCategory.OTHER : request.category();
    if (category != FundCategory.EXPENSE
        && category != FundCategory.INCOME
        && category != FundCategory.OTHER) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "FUND_CATEGORY_INVALID",
          "Manuel hareket kategorisi Masraf, Gelir ya da Diğer olmalıdır.");
    }
    return ledger.post(
        new FundPosting(
            fundId,
            request.direction(),
            request.money(),
            request.date(),
            request.description(),
            LedgerService.SOURCE_MANUAL,
            UUID.randomUUID(),
            request.exchangeRate(),
            category));
  }

  /**
   * Hareket iptali (§3.1.7): manuel hareket kendisi, eski başlıksız virman çifti birlikte ters
   * çevrilir; transfer merkezi bacağı ya da masrafı bütün transferi iptal eder (tarih aralığı
   * transferin kuralıyla). Diğer kaynaklar belgesinden iptal edilir (409 {@code
   * TRANSACTION_NOT_MANUAL}). Yanıt asıl harekettir; manuelde ters kayıt.
   */
  @Transactional
  public FundTransaction reverseManual(UUID transactionId, LocalDate date, String description) {
    FundTransaction original =
        transactions
            .findById(transactionId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "TRANSACTION_NOT_FOUND", "Hareket bulunamadı."));
    findVisible(original.getFundAccountId());
    String sourceType = original.getSourceType();
    if (FundTransferService.SOURCE_TRANSFER.equals(sourceType)) {
      fundTransfers.reverse(original.getSourceId(), date, description);
      return original;
    }
    if (FundTransferService.SOURCE_COST.equals(sourceType)) {
      UUID transferId =
          transferCosts
              .findById(original.getSourceId())
              .orElseThrow(FundTransferService::notFound)
              .getTransferId();
      fundTransfers.reverse(transferId, date, description);
      return original;
    }
    if (!LedgerService.SOURCE_MANUAL.equals(sourceType)
        && !SOURCE_LEGACY_TRANSFER.equals(sourceType)) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "TRANSACTION_NOT_MANUAL",
          "Belgeye bağlı hareket, belgesinden iptal edilmelidir.");
    }
    if (SOURCE_LEGACY_TRANSFER.equals(sourceType)) {
      ledger.reverseSource(SOURCE_LEGACY_TRANSFER, original.getSourceId(), date, description);
      return original;
    }
    return ledger.reverse(original, date, description);
  }

  @Transactional(readOnly = true)
  public StatementResponse statement(UUID id, LocalDate from, LocalDate to, Pageable pageable) {
    FundAccount fund = findVisible(id);
    BigDecimal opening = transactions.balanceBefore(id, from);
    Page<FundStatementRow> page = transactions.statement(id, from, to, pageable);
    List<StatementLine> lines =
        page.getContent().stream()
            .map(
                row ->
                    new StatementLine(
                        row.getId(),
                        row.getTransactionDate(),
                        row.getDirection(),
                        row.getAmount(),
                        row.getExchangeRate(),
                        row.getTlAmount(),
                        row.getDescription(),
                        row.getSourceType(),
                        opening.add(row.getRunningBalance()),
                        row.getCurrency() == null ? fund.getCurrency() : row.getCurrency(),
                        row.getCompanyId(),
                        fund.getBranchId(),
                        row.getSourceId(),
                        null,
                        "IN".equals(row.getDirection()) ? 1 : -1,
                        Boolean.TRUE.equals(row.getReversal()),
                        Boolean.TRUE.equals(row.getReversed()),
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        row.getCreatedBy(),
                        AccountTransactionQueryService.instant(row.getCreatedAt())))
            .toList();
    return new StatementResponse(
        fund.getCurrency(),
        opening,
        lines,
        page.getNumber(),
        page.getSize(),
        page.getTotalElements(),
        page.getTotalPages());
  }

  /**
   * Kapsam denetimiyle hesap: fonun iş yeri LIMITED kullanıcının kapsamında olmalı (403 {@code
   * BRANCH_OUT_OF_SCOPE}). Ödeme/tahsilat ve çek işlemlerinde fon seçimi de bundan geçer.
   */
  public FundAccount findVisible(UUID id) {
    FundAccount fund = find(id);
    scope.requireVisible(fund.getBranchId());
    return fund;
  }

  /**
   * Kullanıcı girişli yeni hareket pasif hesapla yapılamaz (422 {@code FUND_INACTIVE}). Türetilmiş
   * akışlar ve ters kayıtlar bu denetimi çağırmaz (OK-12.2-10).
   */
  public static void requireActive(FundAccount fund) {
    if (!fund.isActive()) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "FUND_INACTIVE",
          "Pasif banka/kasa hesabıyla işlem yapılamaz.");
    }
  }

  FundAccount find(UUID id) {
    return funds
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "FUND_NOT_FOUND", "Banka/kasa hesabı bulunamadı."));
  }

  /**
   * Açılış bakiyesini {@code signedAmount}'a (IN +, OUT −; 0 = açılış yok) ve {@code date}'e
   * getirir. Aynıysa yazım yok. Sıra (OK-12.2-28): eski açılış REVERSED işaretlenir ve hemen
   * yazılır (kısmi tekil indeks yeni satırdan önce boşalmalı), yeni açılış hareketi yazılır, sonra
   * eskisinin hareketi kendi tarihiyle ters çevrilir; böylece ara tarih bakiyeleri çift sayılmaz ve
   * net etki pozitifken bakiye denetimi takılmaz.
   */
  private void setOpening(
      FundAccount fund, BigDecimal signedAmount, LocalDate date, BigDecimal openingRate) {
    FundOpening old = openings.findActiveForUpdate(fund.getId()).orElse(null);
    if (old == null && signedAmount.signum() == 0) {
      return;
    }
    if (old != null
        && old.signedAmount().compareTo(signedAmount) == 0
        && old.getOpeningDate().equals(date)) {
      return;
    }
    requireOpeningRate(fund.getCurrency(), signedAmount, date, openingRate);
    if (old != null) {
      old.markReversed(old.getOpeningDate());
      openings.saveAndFlush(old);
    }
    if (signedAmount.signum() != 0) {
      FundDirection direction = signedAmount.signum() > 0 ? FundDirection.IN : FundDirection.OUT;
      Money money = new Money(signedAmount.abs(), fund.getCurrency());
      FundOpening opening = openings.save(new FundOpening(fund, direction, money, date));
      ledger.post(
          new FundPosting(
              fund.getId(),
              direction,
              money,
              date,
              "Başlangıç Bakiyesi",
              SOURCE_OPENING,
              opening.getId(),
              openingRate,
              FundCategory.OPENING));
    }
    if (old != null) {
      ledger.reverseSource(
          SOURCE_OPENING, old.getId(), old.getOpeningDate(), "Başlangıç bakiyesi düzeltmesi");
    }
    audit.record(AuditEvent.FUND_OPENING_SET, TARGET + fund.getId(), "openingBalance");
  }

  /**
   * Döviz cinsi açılışta kur yoksa yazımdan önce 422 {@code RATE_MISSING}; kullanıcı {@code
   * openingRate} ile kuru elle girer (OK-12.2-37, OK-12.2-29 paraleli). TL ya da sıfır açılışta kur
   * gerekmez; elle kur verilmişse TCMB kurundan önceliklidir.
   */
  private void requireOpeningRate(
      String currency, BigDecimal signedAmount, LocalDate date, BigDecimal openingRate) {
    if (signedAmount == null
        || signedAmount.signum() == 0
        || openingRate != null
        || rates.findRate(currency, date).isPresent()) {
      return;
    }
    throw new BusinessException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "RATE_MISSING",
        currency + " için kur bulunamadı. Lütfen kuru elle girin.");
  }

  private void applyActive(FundAccount fund, boolean active) {
    if (fund.isActive() == active) {
      return;
    }
    if (active) {
      fund.activate();
    } else {
      fund.deactivate();
    }
    audit.record(
        active ? AuditEvent.FUND_ACTIVATED : AuditEvent.FUND_DEACTIVATED,
        TARGET + fund.getId(),
        fund.getCode());
  }

  /** Boşluklar silinir; boşsa null. */
  static String normalizeAccountNo(String raw) {
    if (raw == null) {
      return null;
    }
    String value = WHITESPACE.matcher(raw).replaceAll("");
    return value.isEmpty() ? null : value;
  }

  private static void track(List<String> changed, String name, Object before, Object after) {
    if (!Objects.equals(before, after)) {
      changed.add(name);
    }
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }
}
