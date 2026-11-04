package org.ece.blackrose.finance.service;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.domain.Instrument;
import org.ece.blackrose.finance.domain.InstrumentMovement;
import org.ece.blackrose.finance.repository.FinanceRepositories.InstrumentMovementRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.InstrumentRepository;
import org.ece.blackrose.finance.service.FundLedgerService.FundPosting;
import org.ece.blackrose.finance.service.LedgerService.Posting;
import org.ece.blackrose.finance.web.FinanceDtos.InstrumentTransitionRequest;
import org.ece.blackrose.finance.web.FinanceDtos.NewInstrument;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Çek/senet yaşam döngüsü. Tablo dışındaki her geçiş reddedilir. */
@Service
public class InstrumentService {

  private static final Map<InstrumentStatus, Set<InstrumentStatus>> RECEIVED_TRANSITIONS =
      Map.of(
          InstrumentStatus.PORTFOLIO,
          Set.of(
              InstrumentStatus.AT_BANK,
              InstrumentStatus.ENDORSED,
              InstrumentStatus.COLLECTED_TO_CASH),
          InstrumentStatus.AT_BANK,
          Set.of(InstrumentStatus.COLLECTED, InstrumentStatus.BOUNCED, InstrumentStatus.PORTFOLIO),
          InstrumentStatus.ENDORSED,
          Set.of(InstrumentStatus.BOUNCED));

  private static final Map<InstrumentStatus, Set<InstrumentStatus>> ISSUED_TRANSITIONS =
      Map.of(InstrumentStatus.ISSUED, Set.of(InstrumentStatus.PAID, InstrumentStatus.BOUNCED));

  private static final String SOURCE_MOVEMENT = "INSTRUMENT";
  private static final String SOURCE_ENDORSEE_BOUNCE = "INSTRUMENT_ENDORSEE_BOUNCE";

  private final InstrumentRepository instruments;
  private final InstrumentMovementRepository movements;
  private final LedgerService ledger;
  private final FundLedgerService fundLedger;
  private final FundService funds;

  public InstrumentService(
      InstrumentRepository instruments,
      InstrumentMovementRepository movements,
      LedgerService ledger,
      FundLedgerService fundLedger,
      FundService funds) {
    this.instruments = instruments;
    this.movements = movements;
    this.ledger = ledger;
    this.fundLedger = fundLedger;
    this.funds = funds;
  }

  @Transactional(readOnly = true)
  public Page<Instrument> list(InstrumentStatus status, Pageable pageable) {
    return instruments.search(status, pageable);
  }

  @Transactional(readOnly = true)
  public List<InstrumentMovement> history(UUID id) {
    return movements.findByInstrumentIdOrderByCreatedAt(id);
  }

  /**
   * Tahsilatta alınan veya ödemede verilen yeni çek/senedi kaydeder. Cari hareketi çağıran yazar.
   */
  @Transactional
  public Instrument register(
      NewInstrument data,
      InstrumentDirection direction,
      UUID accountId,
      UUID branchId,
      Money money,
      LocalDate date) {
    InstrumentStatus initial =
        direction == InstrumentDirection.RECEIVED
            ? InstrumentStatus.PORTFOLIO
            : InstrumentStatus.ISSUED;
    Instrument instrument =
        instruments.save(
            new Instrument(
                data.kind(),
                direction,
                data.number(),
                data.bankName(),
                accountId,
                branchId,
                money,
                data.dueDate(),
                initial));
    movements.save(new InstrumentMovement(instrument.getId(), null, initial, date, null));
    return instrument;
  }

  /** Ciro yalnız ödeme kaydıyla olur; böylece çek ile tedarikçi ödemesi her zaman eşleşir. */
  @Transactional
  public Instrument endorse(UUID id, UUID supplierId, Money money, LocalDate date) {
    Instrument instrument = lock(id);
    ensureAllowed(instrument, InstrumentStatus.ENDORSED);
    if (!instrument.getMoney().equals(money)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "INSTRUMENT_AMOUNT_MISMATCH",
          "Ödeme tutarı çek/senet tutarıyla aynı olmalıdır.");
    }
    instrument.endorseTo(supplierId);
    record(instrument, InstrumentStatus.ENDORSED, date, null);
    return instrument;
  }

  @Transactional
  public Instrument transition(UUID id, InstrumentTransitionRequest request) {
    Instrument instrument = lock(id);
    InstrumentStatus target = request.toStatus();
    ensureAllowed(instrument, target);
    if (target == InstrumentStatus.ENDORSED) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "INSTRUMENT_ENDORSE_VIA_PAYMENT",
          "Ciro işlemi ödeme kaydıyla yapılır.");
    }
    InstrumentStatus from = instrument.getStatus();
    assignFundIfNeeded(instrument, target, request.fundAccountId());
    InstrumentMovement movement = record(instrument, target, request.date(), request.note());
    applyEffects(instrument, from, target, movement.getId(), request);
    return instrument;
  }

  private void assignFundIfNeeded(Instrument instrument, InstrumentStatus target, UUID fundId) {
    switch (target) {
      case AT_BANK, PAID -> instrument.assignFund(requireFund(instrument, fundId, FundKind.BANK));
      case COLLECTED_TO_CASH ->
          instrument.assignFund(requireFund(instrument, fundId, FundKind.CASH));
      default -> {}
    }
  }

  private void applyEffects(
      Instrument instrument,
      InstrumentStatus from,
      InstrumentStatus target,
      UUID movementId,
      InstrumentTransitionRequest request) {
    switch (target) {
      case COLLECTED, COLLECTED_TO_CASH ->
          postFund(instrument, FundDirection.IN, movementId, request, "Çek/senet tahsili");
      case PAID ->
          postFund(instrument, FundDirection.OUT, movementId, request, "Çek/senet ödemesi");
      case BOUNCED -> applyBounce(instrument, from, movementId, request);
      default -> {}
    }
  }

  /**
   * Karşılıksız: alınan çekte borç müşteriye döner; cirolu çekte tedarikçiye olan borcumuz da geri
   * gelir; verilen çekte tedarikçiye borcumuz geri gelir.
   */
  private void applyBounce(
      Instrument instrument,
      InstrumentStatus from,
      UUID movementId,
      InstrumentTransitionRequest request) {
    if (instrument.getDirection() == InstrumentDirection.ISSUED) {
      postAccount(
          instrument.getAccountId(),
          Direction.CREDIT,
          instrument,
          SOURCE_MOVEMENT,
          movementId,
          request);
      return;
    }
    postAccount(
        instrument.getAccountId(),
        Direction.DEBIT,
        instrument,
        SOURCE_MOVEMENT,
        movementId,
        request);
    if (from == InstrumentStatus.ENDORSED) {
      postAccount(
          instrument.getEndorsedAccountId(),
          Direction.CREDIT,
          instrument,
          SOURCE_ENDORSEE_BOUNCE,
          movementId,
          request);
    }
  }

  private void postAccount(
      UUID accountId,
      Direction direction,
      Instrument instrument,
      String sourceType,
      UUID sourceId,
      InstrumentTransitionRequest request) {
    ledger.post(
        new Posting(
            accountId,
            instrument.getBranchId(),
            direction,
            instrument.getMoney(),
            request.date(),
            "Karşılıksız çek/senet " + instrument.getNumber(),
            sourceType,
            sourceId,
            request.exchangeRate()));
  }

  private void postFund(
      Instrument instrument,
      FundDirection direction,
      UUID movementId,
      InstrumentTransitionRequest request,
      String description) {
    fundLedger.post(
        new FundPosting(
            instrument.getFundAccountId(),
            direction,
            instrument.getMoney(),
            request.date(),
            description + " " + instrument.getNumber(),
            SOURCE_MOVEMENT,
            movementId,
            request.exchangeRate()));
  }

  private UUID requireFund(Instrument instrument, UUID fundId, FundKind kind) {
    if (fundId == null) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "FUND_REQUIRED", "Bu işlem için hesap seçilmelidir.");
    }
    FundAccount fund = funds.find(fundId);
    if (fund.getKind() != kind) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "FUND_KIND_MISMATCH",
          "Seçilen hesap türü bu işleme uygun değil.");
    }
    if (!fund.getCurrency().equals(instrument.getMoney().currency())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "CURRENCY_MISMATCH",
          "Hesabın para birimi çek/senetle aynı olmalıdır.");
    }
    return fundId;
  }

  private InstrumentMovement record(
      Instrument instrument, InstrumentStatus target, LocalDate date, String note) {
    InstrumentStatus from = instrument.getStatus();
    instrument.moveTo(target);
    return movements.save(new InstrumentMovement(instrument.getId(), from, target, date, note));
  }

  private static void ensureAllowed(Instrument instrument, InstrumentStatus target) {
    Map<InstrumentStatus, Set<InstrumentStatus>> table =
        instrument.getDirection() == InstrumentDirection.RECEIVED
            ? RECEIVED_TRANSITIONS
            : ISSUED_TRANSITIONS;
    if (!table.getOrDefault(instrument.getStatus(), Set.of()).contains(target)) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "INSTRUMENT_INVALID_TRANSITION",
          "Çek/senet " + instrument.getStatus() + " durumundan " + target + " durumuna geçemez.");
    }
  }

  private Instrument lock(UUID id) {
    return instruments
        .findForUpdate(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "INSTRUMENT_NOT_FOUND", "Çek/senet bulunamadı."));
  }
}
