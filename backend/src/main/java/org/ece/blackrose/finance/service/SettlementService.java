package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.domain.Instrument;
import org.ece.blackrose.finance.domain.Settlement;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.ExpenseItemRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.SettlementRepository;
import org.ece.blackrose.finance.service.FundLedgerService.FundPosting;
import org.ece.blackrose.finance.service.LedgerService.Posting;
import org.ece.blackrose.finance.web.FinanceDtos.DailyReportResponse;
import org.ece.blackrose.finance.web.FinanceDtos.DailyTotal;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementRequest;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementResponse;
import org.ece.blackrose.finance.web.FinanceMapper;
import org.ece.blackrose.organization.BranchRepository;
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

  private final SettlementRepository settlements;
  private final AccountRepository accounts;
  private final ExpenseItemRepository expenseItems;
  private final BranchRepository branches;
  private final FundService funds;
  private final LedgerService ledger;
  private final FundLedgerService fundLedger;
  private final InstrumentService instruments;
  private final FinanceMapper mapper;

  public SettlementService(
      SettlementRepository settlements,
      AccountRepository accounts,
      ExpenseItemRepository expenseItems,
      BranchRepository branches,
      FundService funds,
      LedgerService ledger,
      FundLedgerService fundLedger,
      InstrumentService instruments,
      FinanceMapper mapper) {
    this.settlements = settlements;
    this.accounts = accounts;
    this.expenseItems = expenseItems;
    this.branches = branches;
    this.funds = funds;
    this.ledger = ledger;
    this.fundLedger = fundLedger;
    this.instruments = instruments;
    this.mapper = mapper;
  }

  @Transactional(readOnly = true)
  public Page<Settlement> list(SettlementType type, Pageable pageable) {
    return settlements.findByType(type, pageable);
  }

  /** Aynı anahtarla gelen ikinci istek ilk kaydı döner. */
  @Transactional
  public Settlement create(
      SettlementType type, SettlementRequest request, String idempotencyKey, UUID planId) {
    if (idempotencyKey != null) {
      var existing = settlements.findByIdempotencyKey(idempotencyKey);
      if (existing.isPresent()) {
        return existing.get();
      }
    }
    validate(type, request);
    Money money = request.money();
    UUID instrumentId = registerInstrument(type, request, money);
    Settlement settlement =
        settlements.save(
            new Settlement(
                type,
                request.method(),
                request.accountId(),
                request.branchId(),
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

  /** Çekli kayıtlar ters çevrilmez; çek kendi yaşam döngüsüyle (karşılıksız vb.) yönetilir. */
  @Transactional
  public Settlement reverse(UUID id, LocalDate date, String description) {
    Settlement settlement =
        settlements
            .findById(id)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "SETTLEMENT_NOT_FOUND", "Kayıt bulunamadı."));
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
    ledger.reverseSource(SOURCE_SETTLEMENT, id, date, description);
    fundLedger.reverseSource(SOURCE_SETTLEMENT, id, date, description);
    settlement.markReversed();
    return settlement;
  }

  /** Şube filtresi boşsa tüm şubeler raporlanır. */
  @Transactional(readOnly = true)
  public DailyReportResponse daily(SettlementType type, LocalDate date, List<UUID> branchIds) {
    List<Settlement> rows =
        branchIds == null || branchIds.isEmpty()
            ? settlements.daily(type, date)
            : settlements.dailyForBranches(type, date, branchIds);
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

  private UUID registerInstrument(SettlementType type, SettlementRequest request, Money money) {
    if (request.method() != SettlementMethod.CHECK) {
      return null;
    }
    if (request.instrumentId() != null) {
      return instruments
          .endorse(request.instrumentId(), request.accountId(), money, request.date())
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

  private void validate(SettlementType type, SettlementRequest request) {
    if (!branches.existsById(request.branchId())) {
      throw bad("BRANCH_NOT_FOUND", "Şube bulunamadı.");
    }
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
      case CASH -> requireFund(request, FundKind.CASH);
      case BANK -> requireFund(request, FundKind.BANK);
      case CHECK -> validateCheck(type, request);
    }
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

  private void requireFund(SettlementRequest request, FundKind kind) {
    if (request.fundAccountId() == null) {
      throw bad("FUND_REQUIRED", "Banka/kasa hesabı seçilmelidir.");
    }
    FundAccount fund = funds.find(request.fundAccountId());
    if (fund.getKind() != kind) {
      throw bad("FUND_KIND_MISMATCH", "Seçilen hesap, ödeme yöntemine uygun değil.");
    }
    if (!fund.getCurrency().equals(request.money().currency())) {
      throw bad("CURRENCY_MISMATCH", "Tutarın para birimi hesabın para birimiyle aynı olmalıdır.");
    }
  }

  private static BusinessException bad(String code, String message) {
    return new BusinessException(HttpStatus.BAD_REQUEST, code, message);
  }
}
