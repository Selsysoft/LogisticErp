package org.ece.blackrose.finance.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.CheckLeaf;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.CheckLeafStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.NoteType;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.domain.Instrument;
import org.ece.blackrose.finance.domain.InstrumentMovement;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.CheckLeafRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.InstrumentMovementRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.InstrumentRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.SettlementRepository;
import org.ece.blackrose.finance.service.FundLedgerService.FundPosting;
import org.ece.blackrose.finance.service.LedgerService.Posting;
import org.ece.blackrose.finance.web.FinanceDtos.InstrumentCustodyRequest;
import org.ece.blackrose.finance.web.FinanceDtos.InstrumentTransitionRequest;
import org.ece.blackrose.finance.web.FinanceDtos.InstrumentUpdateRequest;
import org.ece.blackrose.finance.web.FinanceDtos.NewInstrument;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.organization.CompanyResolver;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Çek/senet yaşam döngüsü (12.3 §3.2). Geçişler {@link InstrumentRules#allowedTargets} tablosuna
 * uyar; tablo dışındaki her geçiş reddedilir. Cari hareketi yalnız {@link LedgerService}, fon
 * hareketi yalnız {@link FundLedgerService} yazar; her geçiş kendi hareket kimliğiyle ({@code
 * source_type = INSTRUMENT}) idempotenttir.
 */
@Service
public class InstrumentService {

  private static final String SOURCE_MOVEMENT = "INSTRUMENT";
  private static final String SOURCE_ENDORSEE_BOUNCE = "INSTRUMENT_ENDORSEE_BOUNCE";
  private static final Pattern CHECK_NUMBER = Pattern.compile("^\\d{7}$");

  /** Vadesi düzenlenebilen durumlar (OK-12.3-14). */
  private static final Set<InstrumentStatus> DUE_EDITABLE =
      EnumSet.of(
          InstrumentStatus.PORTFOLIO,
          InstrumentStatus.AT_BANK,
          InstrumentStatus.ISSUED,
          InstrumentStatus.COLLATERAL);

  private final InstrumentRepository instruments;
  private final InstrumentMovementRepository movements;
  private final CheckLeafRepository leaves;
  private final SettlementRepository settlements;
  private final AccountRepository accounts;
  private final AccountAccess access;
  private final LedgerService ledger;
  private final FundLedgerService fundLedger;
  private final FundService funds;
  private final CompanyResolver companies;
  private final BranchScopeService scope;
  private final AuditService audit;

  @PersistenceContext private EntityManager entityManager;

  @SuppressWarnings("java:S107")
  public InstrumentService(
      InstrumentRepository instruments,
      InstrumentMovementRepository movements,
      CheckLeafRepository leaves,
      SettlementRepository settlements,
      AccountRepository accounts,
      AccountAccess access,
      LedgerService ledger,
      FundLedgerService fundLedger,
      FundService funds,
      CompanyResolver companies,
      BranchScopeService scope,
      AuditService audit) {
    this.scope = scope;
    this.companies = companies;
    this.instruments = instruments;
    this.movements = movements;
    this.leaves = leaves;
    this.settlements = settlements;
    this.accounts = accounts;
    this.access = access;
    this.ledger = ledger;
    this.fundLedger = fundLedger;
    this.funds = funds;
    this.audit = audit;
  }

  /**
   * Tahsilatta alınan veya ödemede verilen yeni çek/senedi kaydeder. Cari hareketi çağıran yazar.
   * Verilen çek/senette {@code fundAccountId} çekin çekildiği banka hesabıdır (fon hareketi yok,
   * harekete yazılmaz). Alınan çekte {@code initialStatus = AT_BANK}: portföy kaydından sonra aynı
   * işlemde bankaya yatırılır ({@code PORTFOLIO → AT_BANK}); fon hareketi yazılmaz, para tahsilde
   * girer (12.2a §3.2). 12.3 §3.2: ek alanlar, koçan yaprağı (kilitli; {@code UNUSED} değilse 409
   * {@code CHECK_LEAF_USED}) ve portföydeki alınan çekin emanet kasası. Alan doğrulamaları {@code
   * SettlementService.validateInstrument} içindedir.
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
                companies.companyOf(branchId),
                money,
                data.dueDate(),
                initial));
    instrument.withDetails(
        data.issueDate(),
        trim(data.bankBranch()),
        direction == InstrumentDirection.RECEIVED ? trim(data.drawerName()) : null,
        trim(data.description()),
        noteTypeOf(data.kind(), data.noteType()));
    if (data.checkLeafId() != null) {
      CheckLeaf leaf = lockLeaf(data.checkLeafId());
      if (leaf.getStatus() != CheckLeafStatus.UNUSED) {
        throw leafUsed();
      }
      leaf.use(date);
      instrument.attachLeaf(leaf.getId());
    }
    UUID custody = null;
    if (direction == InstrumentDirection.RECEIVED
        && data.initialStatus() != InstrumentStatus.AT_BANK
        && data.custodyFundId() != null) {
      custody = requireCustodyFund(instrument, data.custodyFundId());
      instrument.assignCustody(custody);
    }
    movements.save(new InstrumentMovement(instrument.getId(), null, initial, date, null, custody));
    if (direction == InstrumentDirection.ISSUED && data.fundAccountId() != null) {
      instrument.assignFund(requireFund(instrument, data.fundAccountId(), FundKind.BANK));
    }
    if (direction == InstrumentDirection.RECEIVED
        && data.initialStatus() == InstrumentStatus.AT_BANK) {
      instrument.assignFund(requireFund(instrument, data.fundAccountId(), FundKind.BANK));
      record(instrument, InstrumentStatus.AT_BANK, date, null);
    }
    return instrument;
  }

  /**
   * Ciro yalnız ödeme kaydıyla olur; böylece çek ile tedarikçi ödemesi her zaman eşleşir. Çek,
   * ödemeyi yapan şirketin portföyünde olmalıdır.
   */
  @Transactional
  public Instrument endorse(UUID id, UUID supplierId, UUID companyId, Money money, LocalDate date) {
    Instrument instrument = lock(id);
    // Türetilmiş akış: yalnız kapsam (pasif iş yerindeki çek de cirolanabilir).
    scope.requireVisible(instrument.getBranchId());
    if (!instrument.getCompanyId().equals(companyId)) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY, "COMPANY_MISMATCH", "Çek başka şirketin portföyünde.");
    }
    if (instrument.getDirection() != InstrumentDirection.RECEIVED
        || !InstrumentRules.canEndorse(instrument.getStatus())) {
      throw invalidTransition(instrument, InstrumentStatus.ENDORSED);
    }
    if (!instrument.getMoney().equals(money)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "INSTRUMENT_AMOUNT_MISMATCH",
          "Ödeme tutarı çek/senet tutarıyla aynı olmalıdır.");
    }
    instrument.endorseTo(supplierId);
    // §3.0: PORTFOLIO'dan çıkan her geçişte emanet kasası boşalır.
    instrument.clearCustody();
    record(instrument, InstrumentStatus.ENDORSED, date, null);
    return instrument;
  }

  /**
   * Kullanıcı geçişi (§3.1–§3.2). {@code ENDORSED} 400 {@code INSTRUMENT_ENDORSE_VIA_PAYMENT},
   * {@code CANCELLED} 409 {@code INSTRUMENT_CANCEL_VIA_SETTLEMENT} ({@code settlementId=<köken>});
   * tablo dışı 409 {@code INSTRUMENT_INVALID_TRANSITION}.
   */
  @Transactional
  public Instrument transition(UUID id, InstrumentTransitionRequest request) {
    Instrument instrument = lock(id);
    scope.requireVisible(instrument.getBranchId());
    requireReadable(instrument);
    InstrumentStatus target = request.toStatus();
    if (target == InstrumentStatus.ENDORSED) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "INSTRUMENT_ENDORSE_VIA_PAYMENT",
          "Ciro işlemi ödeme kaydıyla yapılır.");
    }
    if (target == InstrumentStatus.CANCELLED) {
      List<String> details =
          settlements
              .findOriginByInstrumentId(id)
              .map(origin -> List.of("settlementId=" + origin.getId()))
              .orElse(List.of());
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "INSTRUMENT_CANCEL_VIA_SETTLEMENT",
          "Çek/senet ödeme ya da tahsilat kaydından iptal edilir.",
          details);
    }
    ensureAllowed(instrument, target);
    InstrumentStatus from = instrument.getStatus();
    assignFundIfNeeded(instrument, from, target, request);
    InstrumentMovement movement = record(instrument, target, request.date(), request.note());
    applyEffects(instrument, from, target, movement.getId(), request);
    return instrument;
  }

  /**
   * Finansal olmayan alanların düzeltmesi (PATCH, §3.2). Defter ve hareket satırı yazılmaz; denetim
   * kaydına yalnız değişen alan adları yazılır (KVKK).
   */
  @Transactional
  public Instrument updateDetails(UUID id, InstrumentUpdateRequest request) {
    Instrument instrument = lock(id);
    scope.requireVisible(instrument.getBranchId());
    requireReadable(instrument);
    InstrumentStatus status = instrument.getStatus();
    if (status == InstrumentStatus.CANCELLED || status == InstrumentStatus.RETURNED) {
      throw notEditable("İptal/iade edilmiş çek/senet düzenlenemez.");
    }
    boolean check = instrument.getKind() == InstrumentKind.CHECK;
    List<String> changed = new ArrayList<>();

    String number = instrument.getNumber();
    if (request.number() != null) {
      String value = request.number().trim();
      if (!value.equals(number)) {
        if (value.isEmpty()) {
          throw bad("INSTRUMENT_NUMBER_INVALID", "Çek/senet numarası boş olamaz.");
        }
        if (instrument.getCheckLeafId() != null) {
          throw new BusinessException(
              HttpStatus.CONFLICT,
              "INSTRUMENT_LEAF_NUMBER_LOCKED",
              "Koçandan seçilen çekin numarası değiştirilemez.");
        }
        if (check && !CHECK_NUMBER.matcher(value).matches()) {
          throw checkNumberInvalid();
        }
        number = value;
        changed.add("number");
      }
    }
    String bankName = instrument.getBankName();
    if (request.bankName() != null) {
      String value = trim(request.bankName());
      if (!Objects.equals(value, bankName)) {
        bankName = value;
        changed.add("bankName");
      }
    }
    if ((changed.contains("number") || changed.contains("bankName"))
        && instruments.existsActiveNumber(
            instrument.getCompanyId(),
            instrument.getKind(),
            instrument.getDirection(),
            number,
            bankName,
            id)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "INSTRUMENT_NUMBER_TAKEN", "Bu çek numarası zaten kullanılıyor!");
    }
    LocalDate dueDate = instrument.getDueDate();
    if (request.dueDate() != null && !request.dueDate().equals(dueDate)) {
      if (!DUE_EDITABLE.contains(status)) {
        throw notEditable("Bu durumdaki çek/senedin vadesi değiştirilemez.");
      }
      dueDate = request.dueDate();
      changed.add("dueDate");
    }
    LocalDate issueDate = instrument.getIssueDate();
    if (request.issueDate() != null && !request.issueDate().equals(issueDate)) {
      issueDate = request.issueDate();
      changed.add("issueDate");
    }
    if (issueDate != null && issueDate.isAfter(dueDate)) {
      throw datesInvalid();
    }
    NoteType noteType = instrument.getNoteType();
    if (request.noteType() != null) {
      if (check) {
        throw noteTypeInvalid();
      }
      if (request.noteType() != noteType) {
        noteType = request.noteType();
        changed.add("noteType");
      }
    }
    String bankBranch =
        changedText(request.bankBranch(), instrument.getBankBranch(), "bankBranch", changed);
    String drawerName =
        instrument.getDirection() == InstrumentDirection.RECEIVED
            ? changedText(request.drawerName(), instrument.getDrawerName(), "drawerName", changed)
            : instrument.getDrawerName();
    String description =
        changedText(request.description(), instrument.getDescription(), "description", changed);
    if (changed.isEmpty()) {
      return instrument;
    }
    instrument.changeNumber(number);
    instrument.changeBankName(bankName);
    instrument.changeDueDate(dueDate);
    instrument.withDetails(issueDate, bankBranch, drawerName, description, noteType);
    audit.record(
        AuditEvent.INSTRUMENT_UPDATED, "INSTRUMENT:" + id, "fields=" + String.join(",", changed));
    return instrument;
  }

  /**
   * Portföydeki alınan çekin emanet kasası (PUT custody, §3.2). Para hareketi değildir; {@code
   * PORTFOLIO → PORTFOLIO} hareketi kasayla yazılır. Aynı kasa tekrar istenirse hiçbir şey
   * yazılmaz.
   */
  @Transactional
  public Instrument moveCustody(UUID id, InstrumentCustodyRequest request) {
    Instrument instrument = lock(id);
    scope.requireVisible(instrument.getBranchId());
    requireReadable(instrument);
    if (instrument.getDirection() != InstrumentDirection.RECEIVED
        || instrument.getStatus() != InstrumentStatus.PORTFOLIO) {
      throw invalidTransition(instrument, InstrumentStatus.PORTFOLIO);
    }
    UUID target = request.custodyFundId();
    if (Objects.equals(target, instrument.getCustodyFundId())) {
      return instrument;
    }
    if (target == null) {
      instrument.clearCustody();
    } else {
      instrument.assignCustody(requireCustodyFund(instrument, target));
    }
    String note = trim(request.note());
    movements.save(
        new InstrumentMovement(
            id,
            InstrumentStatus.PORTFOLIO,
            InstrumentStatus.PORTFOLIO,
            request.date(),
            note == null ? "Kasa değişikliği" : note,
            target));
    audit.record(
        AuditEvent.INSTRUMENT_CUSTODY_MOVED,
        "INSTRUMENT:" + id,
        "fund=" + (target == null ? "none" : target));
    return instrument;
  }

  /**
   * Ödeme/tahsilat iptali ve düzeltmesi için çeki kilitler ve durumunu veritabanından yeniden okur
   * (önceki kilitsiz okuma bayat kalmasın). Yoksa 404 {@code INSTRUMENT_NOT_FOUND}.
   */
  @Transactional
  public Instrument lockForSettlement(UUID id) {
    Instrument instrument = lock(id);
    entityManager.refresh(instrument);
    return instrument;
  }

  /**
   * Köken kaydın iptali (§3.4) ve düzeltmesi (§3.5): çek {@code CANCELLED} olur, emanet düşer;
   * yaprak düzeltmede serbest kalır ({@code UNUSED}), düz iptalde {@code VOID} olur (OK-12.3-6).
   * Defter yazmaz; köken kaydın tersi çağırandadır.
   */
  @Transactional
  public void cancelForSettlement(
      Instrument instrument, LocalDate date, String note, boolean releaseLeaf) {
    record(instrument, InstrumentStatus.CANCELLED, date, note);
    instrument.clearCustody();
    if (instrument.getCheckLeafId() == null) {
      return;
    }
    CheckLeaf leaf = lockLeaf(instrument.getCheckLeafId());
    if (releaseLeaf && leaf.getStatus() == CheckLeafStatus.USED) {
      leaf.release();
    } else if (!releaseLeaf && leaf.getStatus() != CheckLeafStatus.VOID) {
      leaf.voidLeaf("Ödeme iptali");
    }
  }

  /**
   * Yaprak kilidi; yaprak daha önce (doğrulamada) kilitsiz okunmuş olabileceğinden durum kilit
   * altında yeniden okunur. Yoksa 404 {@code CHECK_LEAF_NOT_FOUND}.
   */
  private CheckLeaf lockLeaf(UUID id) {
    CheckLeaf leaf = leaves.findForUpdate(id).orElseThrow(InstrumentService::leafNotFound);
    entityManager.refresh(leaf);
    return leaf;
  }

  /** Ciro kaydının iptali (§3.4): çek portföye döner, ciro edilen cari boşalır. Defter yazmaz. */
  @Transactional
  public void undoEndorsement(Instrument instrument, LocalDate date, String note) {
    record(instrument, InstrumentStatus.PORTFOLIO, date, note == null ? "Ciro iptali" : note);
    instrument.clearEndorsement();
  }

  /** Cari taşımada çekin hangi cari alanları taşındı. */
  public record Reassignment(boolean drawer, boolean endorsee) {

    public boolean any() {
      return drawer || endorsee;
    }
  }

  /**
   * Cari taşıma (12.1 §3.11, K3): kilitli çekin keşideci ({@code drawer}) ve/veya lehtar ({@code
   * endorsee}) carisi {@code from} ise {@code to} yapılır; durum, şirket ve fon değişmez. Bir alan
   * taşındıysa {@code TRANSFERRED} hareketi (from = to durum) yazılır. Çek/senet yazımı bu serviste
   * kalır; çağıran çeki kilitlemiştir.
   */
  @Transactional
  public Reassignment transferForAccount(
      Instrument instrument,
      UUID from,
      UUID to,
      boolean drawer,
      boolean endorsee,
      UUID transferId,
      LocalDate date,
      String note) {
    boolean movedDrawer = drawer && instrument.reassignAccount(from, to);
    boolean movedEndorsee = endorsee && instrument.reassignEndorsee(from, to);
    if (movedDrawer || movedEndorsee) {
      movements.save(
          InstrumentMovement.transferred(
              instrument.getId(), instrument.getStatus(), date, from, to, transferId, note));
    }
    return new Reassignment(movedDrawer, movedEndorsee);
  }

  /**
   * Hedefin fonu (§3.2): {@code COLLECTED} bankadaki çekte mevcut banka (farklı banka 400 {@code
   * FUND_MISMATCH}), portföyden tek adımda BANK zorunlu; {@code AT_BANK}/{@code PAID} BANK; {@code
   * COLLECTED_TO_CASH} CASH; bankadan portföye dönüşte banka bağı düşer, kasa verilirse emanet
   * olur.
   */
  private void assignFundIfNeeded(
      Instrument instrument,
      InstrumentStatus from,
      InstrumentStatus target,
      InstrumentTransitionRequest request) {
    UUID fundId = request.fundAccountId();
    switch (target) {
      case COLLECTED -> {
        if (from == InstrumentStatus.AT_BANK) {
          if (fundId != null && !fundId.equals(instrument.getFundAccountId())) {
            throw bad("FUND_MISMATCH", "Çek başka bankada.");
          }
        } else {
          instrument.assignFund(requireFund(instrument, fundId, FundKind.BANK));
        }
      }
      case AT_BANK, PAID -> instrument.assignFund(requireFund(instrument, fundId, FundKind.BANK));
      case COLLECTED_TO_CASH ->
          instrument.assignFund(requireFund(instrument, fundId, FundKind.CASH));
      case PORTFOLIO -> {
        instrument.clearFund();
        if (request.custodyFundId() != null) {
          instrument.assignCustody(requireCustodyFund(instrument, request.custodyFundId()));
        }
      }
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
      case COLLECTED, COLLECTED_TO_CASH -> {
        postFund(instrument, FundDirection.IN, movementId, request, "Çek/senet tahsili");
        instrument.markSettled(request.date());
      }
      case PAID -> {
        postFund(instrument, FundDirection.OUT, movementId, request, "Çek/senet ödemesi");
        instrument.markSettled(request.date());
      }
      case BOUNCED, PROTESTED -> applyBounce(instrument, from, target, movementId, request);
      case RETURNED ->
          postAccount(
              instrument.getAccountId(),
              Direction.DEBIT,
              instrument,
              SOURCE_MOVEMENT,
              movementId,
              request,
              "Çek/senet iadesi " + instrument.getNumber());
      default -> {}
    }
    if (target != InstrumentStatus.PORTFOLIO) {
      instrument.clearCustody();
    }
  }

  /**
   * Karşılıksız/protestolu: alınan çekte borç müşteriye döner; cirolu çekte tedarikçiye olan
   * borcumuz da geri gelir; verilen çekte tedarikçiye borcumuz geri gelir.
   */
  private void applyBounce(
      Instrument instrument,
      InstrumentStatus from,
      InstrumentStatus target,
      UUID movementId,
      InstrumentTransitionRequest request) {
    String description =
        (target == InstrumentStatus.PROTESTED ? "Protestolu senet " : "Karşılıksız çek/senet ")
            + instrument.getNumber();
    if (instrument.getDirection() == InstrumentDirection.ISSUED) {
      postAccount(
          instrument.getAccountId(),
          Direction.CREDIT,
          instrument,
          SOURCE_MOVEMENT,
          movementId,
          request,
          description);
      return;
    }
    postAccount(
        instrument.getAccountId(),
        Direction.DEBIT,
        instrument,
        SOURCE_MOVEMENT,
        movementId,
        request,
        description);
    if (from == InstrumentStatus.ENDORSED) {
      postAccount(
          instrument.getEndorsedAccountId(),
          Direction.CREDIT,
          instrument,
          SOURCE_ENDORSEE_BOUNCE,
          movementId,
          request,
          description);
    }
  }

  @SuppressWarnings("java:S107")
  private void postAccount(
      UUID accountId,
      Direction direction,
      Instrument instrument,
      String sourceType,
      UUID sourceId,
      InstrumentTransitionRequest request,
      String description) {
    ledger.post(
        new Posting(
            accountId,
            instrument.getBranchId(),
            direction,
            instrument.getMoney(),
            request.date(),
            description,
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

  /** Emanet kasası: CASH, aktif, çekin şirketinde ve para biriminde. */
  private UUID requireCustodyFund(Instrument instrument, UUID fundId) {
    requireFund(instrument, fundId, FundKind.CASH);
    FundService.requireActive(funds.findVisible(fundId));
    return fundId;
  }

  private UUID requireFund(Instrument instrument, UUID fundId, FundKind kind) {
    if (fundId == null) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "FUND_REQUIRED", "Bu işlem için hesap seçilmelidir.");
    }
    FundAccount fund = funds.findVisible(fundId);
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
    if (!fund.getCompanyId().equals(instrument.getCompanyId())) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "COMPANY_MISMATCH",
          "Kasa/banka hesabı çekin şirketine ait değil.");
    }
    return fundId;
  }

  /**
   * Durum hareketi: fon {@code AT_BANK}/{@code COLLECTED}/{@code COLLECTED_TO_CASH}/{@code PAID}
   * hedeflerinde atanmış fon, {@code PORTFOLIO} hedefinde emanet kasası (§3.2).
   */
  private InstrumentMovement record(
      Instrument instrument, InstrumentStatus target, LocalDate date, String note) {
    InstrumentStatus from = instrument.getStatus();
    UUID fund =
        switch (target) {
          case AT_BANK, COLLECTED, COLLECTED_TO_CASH, PAID -> instrument.getFundAccountId();
          case PORTFOLIO -> instrument.getCustodyFundId();
          default -> null;
        };
    instrument.moveTo(target);
    return movements.save(
        new InstrumentMovement(instrument.getId(), from, target, date, note, fund));
  }

  /**
   * Personel carili çek {@code FINANCE_EMPLOYEE_VIEW} izni olmayan kullanıcıya yokmuş gibi davranır
   * (404 {@code INSTRUMENT_NOT_FOUND}; OK-12.2a-8 deseni).
   */
  private void requireReadable(Instrument instrument) {
    if (instrument.getAccountId() == null || access.employeeVisible()) {
      return;
    }
    boolean employee =
        accounts
            .findById(instrument.getAccountId())
            .map(account -> account.getType() == AccountType.EMPLOYEE)
            .orElse(false);
    if (employee) {
      throw notFound();
    }
  }

  private static void ensureAllowed(Instrument instrument, InstrumentStatus target) {
    if (!InstrumentRules.allowedTargets(
            instrument.getKind(), instrument.getDirection(), instrument.getStatus())
        .contains(target)) {
      throw invalidTransition(instrument, target);
    }
  }

  private static BusinessException invalidTransition(
      Instrument instrument, InstrumentStatus target) {
    return new BusinessException(
        HttpStatus.CONFLICT,
        "INSTRUMENT_INVALID_TRANSITION",
        "Çek/senet " + instrument.getStatus() + " durumundan " + target + " durumuna geçemez.");
  }

  /** Senet türü yalnız senette; senette boşsa {@code PLAIN} (ZTO "Adi Senet"). */
  private static NoteType noteTypeOf(InstrumentKind kind, NoteType requested) {
    if (kind != InstrumentKind.NOTE) {
      return null;
    }
    return requested == null ? NoteType.PLAIN : requested;
  }

  /** PATCH metin alanı: {@code null} değişmez, boş metin {@code NULL} olur. */
  private static String changedText(
      String requested, String current, String field, List<String> changed) {
    if (requested == null) {
      return current;
    }
    String value = trim(requested);
    if (!Objects.equals(value, current)) {
      changed.add(field);
    }
    return value;
  }

  private static String trim(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }

  private Instrument lock(UUID id) {
    return instruments.findForUpdate(id).orElseThrow(InstrumentService::notFound);
  }

  private static BusinessException notFound() {
    return new BusinessException(
        HttpStatus.NOT_FOUND, "INSTRUMENT_NOT_FOUND", "Çek/senet bulunamadı.");
  }

  static BusinessException leafNotFound() {
    return new BusinessException(HttpStatus.NOT_FOUND, "CHECK_LEAF_NOT_FOUND", "Kayıt bulunamadı.");
  }

  static BusinessException leafUsed() {
    return new BusinessException(
        HttpStatus.CONFLICT,
        "CHECK_LEAF_USED",
        "Bu çek zaten kullanılmış (ödemesi mevcut), tekrar kullanılamaz.");
  }

  static BusinessException checkNumberInvalid() {
    return bad("CHECK_NUMBER_INVALID", "Çek numarası 7 haneli sayısal değer olmalıdır.");
  }

  static BusinessException datesInvalid() {
    return bad("INSTRUMENT_DATES_INVALID", "Vade tarihi, keşide tarihinden önce olamaz!");
  }

  static BusinessException noteTypeInvalid() {
    return bad("NOTE_TYPE_INVALID", "Senet türü yalnız senette seçilir.");
  }

  /** Çek numarası biçimi (12.3 §3.3 #1): 7 haneli sayısal. */
  static boolean validCheckNumber(String number) {
    return number != null && CHECK_NUMBER.matcher(number).matches();
  }

  private static BusinessException notEditable(String message) {
    return new BusinessException(HttpStatus.CONFLICT, "INSTRUMENT_NOT_EDITABLE", message);
  }

  private static BusinessException bad(String code, String message) {
    return new BusinessException(HttpStatus.BAD_REQUEST, code, message);
  }
}
