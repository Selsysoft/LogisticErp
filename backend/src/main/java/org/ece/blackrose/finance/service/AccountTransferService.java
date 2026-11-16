package org.ece.blackrose.finance.service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.AccountGroup;
import org.ece.blackrose.finance.domain.AccountTransaction;
import org.ece.blackrose.finance.domain.AccountTransfer;
import org.ece.blackrose.finance.domain.AccountTransferInstrument;
import org.ece.blackrose.finance.domain.AccountTransferLine;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountTransferStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentKind;
import org.ece.blackrose.finance.domain.FinanceTypes.TransactionKind;
import org.ece.blackrose.finance.domain.Instrument;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountGroupRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountTransferInstrumentRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountTransferLineRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountTransferRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.InstrumentRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.TransferHistoryRow;
import org.ece.blackrose.finance.repository.FinanceRepositories.TransferableRow;
import org.ece.blackrose.finance.service.InstrumentService.Reassignment;
import org.ece.blackrose.finance.web.AccountDtos.AccountTransferHistoryRowResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountTransferInstrumentResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountTransferLineResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountTransferRequest;
import org.ece.blackrose.finance.web.AccountDtos.AccountTransferResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountTransferReverseRequest;
import org.ece.blackrose.finance.web.AccountDtos.TransferableInstrumentResponse;
import org.ece.blackrose.finance.web.AccountDtos.TransferableTransactionResponse;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Cari taşıma (12.1 §3.11; ZTO AT:5826-6100; 04 §6.1-K3). Seçilen hareketler orijinal kur ve TL
 * karşılığıyla virman çifti olarak ({@code ACCOUNT_TRANSFER_OUT} kaynakta ters yön, {@code
 * ACCOUNT_TRANSFER_IN} hedefte aynı yön) {@link LedgerService#mirror} ile yazılır; orijinal satır
 * değişmez. Hareketlere bağlı çek/senetler durumdan bağımsız yeni cariye geçer ({@link
 * InstrumentService#transferForAccount}). Geri alma bütün olarak ters kayıttır.
 *
 * <p>Kilit sırası (§3.15): iki cari ({@code FOR NO KEY UPDATE}, kimlik sırası) → hareket satırları
 * (kimlik sırası) → çekler (kimlik sırası). Ters kayıt da hareket satırını kilitlediği için "iptal
 * ∥ taşıma" sıraya girer.
 */
@Service
public class AccountTransferService {

  static final String TARGET = "ACCOUNT_TRANSFER:";
  static final String NOTE_CREATE = "Cari taşıma";
  static final String NOTE_REVERSE = "Cari taşıma geri alındı";
  static final String ROLE_DRAWER = "DRAWER";
  static final String ROLE_ENDORSEE = "ENDORSEE";

  private static final String LINE_INDEX = "account_transfer_line_tx_uq";
  private static final String IDEMPOTENCY_INDEX = "account_transfer_idempotency_uq";
  private static final int HISTORY_MONTHS = 6;
  private static final int MAX_PAGE_SIZE = 500;

  private final AccountTransferRepository transfers;
  private final AccountTransferLineRepository lines;
  private final AccountTransferInstrumentRepository transferInstruments;
  private final AccountRepository accounts;
  private final AccountGroupRepository groups;
  private final AccountTransactionRepository transactions;
  private final InstrumentRepository instruments;
  private final LedgerService ledger;
  private final InstrumentService instrumentService;
  private final AccountAccess access;
  private final CompanyIdentityRule identityRule;
  private final BranchScopeService scope;
  private final AuditService audit;
  private final TenantClock clock;

  @SuppressWarnings("java:S107")
  public AccountTransferService(
      AccountTransferRepository transfers,
      AccountTransferLineRepository lines,
      AccountTransferInstrumentRepository transferInstruments,
      AccountRepository accounts,
      AccountGroupRepository groups,
      AccountTransactionRepository transactions,
      InstrumentRepository instruments,
      LedgerService ledger,
      InstrumentService instrumentService,
      AccountAccess access,
      CompanyIdentityRule identityRule,
      BranchScopeService scope,
      AuditService audit,
      TenantClock clock) {
    this.transfers = transfers;
    this.lines = lines;
    this.transferInstruments = transferInstruments;
    this.accounts = accounts;
    this.groups = groups;
    this.transactions = transactions;
    this.instruments = instruments;
    this.ledger = ledger;
    this.instrumentService = instrumentService;
    this.access = access;
    this.identityRule = identityRule;
    this.scope = scope;
    this.audit = audit;
    this.clock = clock;
  }

  // --- okuma

  /**
   * Taşınabilir hareketler (tarih sırası). Açık planlı satırlar {@code blockedReason = OPEN_PLAN}
   * ile listelenir ama seçilemez; aynı çeke bağlı satırlar ortak {@code instrumentGroup} taşır.
   */
  @Transactional(readOnly = true)
  public List<TransferableTransactionResponse> transferable(UUID accountId, UUID companyId) {
    access.readable(accountId);
    List<TransferableRow> rows =
        transactions.transferableRows(accountId, scope.filter(companyId, null));
    Map<UUID, Instrument> linked = instrumentsById(instrumentIdsOf(rows));
    return rows.stream()
        .map(
            row ->
                toTransferable(
                    row,
                    row.getInstrumentId() == null ? null : linked.get(row.getInstrumentId()),
                    accountId))
        .toList();
  }

  @Transactional(readOnly = true)
  public AccountTransferResponse get(UUID id) {
    AccountTransfer transfer = transfers.findById(id).orElseThrow(AccountTransferService::notFound);
    List<AccountTransferLine> transferLines = lines.findAllByAccountTransferId(id);
    requireTransferAccess(transfer, transferLines);
    return toResponse(transfer, transferLines, List.of());
  }

  /**
   * Geçmiş taşımalar (taşınan hareket başına satır). Tarih verilmezse son 6 ay (ZTO "Son 6 Ay");
   * {@code accountId} kaynak ya da hedef; personel carisi içeren taşıma izinsize görünmez; satırın
   * iş yeri kullanıcının kapsamında olmalı.
   */
  @Transactional(readOnly = true)
  public PageResponse<AccountTransferHistoryRowResponse> history(
      UUID accountId, LocalDate from, LocalDate to, int page, int size) {
    if (accountId != null) {
      access.readable(accountId);
    }
    LocalDate end = to != null ? to : clock.today();
    LocalDate start = from != null ? from : end.minusMonths(HISTORY_MONTHS);
    int pageSize = Math.clamp(size, 1, MAX_PAGE_SIZE);
    int pageIndex = Math.max(page, 0);
    BranchFilter filter = scope.filter(null, null);
    boolean employeeVisible = access.employeeVisible();
    UUID account = accountId == null ? BranchFilter.NONE : accountId;
    long total =
        transactions.transferHistoryCount(
            start,
            end,
            accountId == null,
            account,
            employeeVisible,
            true,
            BranchFilter.NONE,
            filter.allBranches(),
            filter.branchIds());
    List<AccountTransferHistoryRowResponse> content =
        transactions
            .transferHistoryRows(
                start,
                end,
                accountId == null,
                account,
                employeeVisible,
                true,
                BranchFilter.NONE,
                filter.allBranches(),
                filter.branchIds(),
                pageSize,
                (long) pageIndex * pageSize)
            .stream()
            .map(AccountTransferService::toHistory)
            .toList();
    return new PageResponse<>(
        content, pageIndex, pageSize, total, (int) ((total + pageSize - 1) / pageSize));
  }

  // --- taşıma

  /**
   * Yeni taşıma. Aynı {@code Idempotency-Key} aynı kaynak/hedefle tekrar gelirse ilk taşıma döner,
   * başka cari çifti için 422 {@code IDEMPOTENCY_KEY_REUSED}. Herhangi bir satır reddedilirse
   * hiçbir şey yazılmaz.
   */
  @Transactional
  public AccountTransferResponse create(AccountTransferRequest request, String idempotencyKey) {
    Optional<AccountTransferResponse> replay = replay(request, idempotencyKey);
    if (replay.isPresent()) {
      return replay.get();
    }
    Account from = access.readable(request.fromAccountId());
    if (request.fromAccountId().equals(request.toAccountId())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "TRANSFER_SAME_ACCOUNT",
          "Hedef cari kaynak cari ile aynı olamaz.");
    }
    Account to = access.usable(request.toAccountId());
    requireCompatible(from, to);
    Set<UUID> ids =
        request.transactionIds() == null ? Set.of() : new LinkedHashSet<>(request.transactionIds());
    if (ids.isEmpty()) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "TRANSFER_EMPTY", "Lütfen en az bir hareket seçiniz.");
    }

    // Kilit sırası: cariler → hareketler → çekler (hepsi kimlik sırasıyla).
    accounts.lockForTransfer(List.of(from.getId(), to.getId()));
    // Kilitten önce okunan hedef kart bayat olabilir: kimlik kuralı son şirket bağını görsün.
    access.refresh(to);
    AccountAccess.requireUsable(to);
    replay = replay(request, idempotencyKey);
    if (replay.isPresent()) {
      return replay.get();
    }
    List<AccountTransaction> selected = lockTransactions(from.getId(), ids);
    Map<UUID, TransferableRow> rows =
        transactions.transferableRowsByIds(from.getId(), ids).stream()
            .collect(Collectors.toMap(TransferableRow::getId, Function.identity()));
    for (AccountTransaction tx : selected) {
      TransferableRow row = rows.get(tx.getId());
      if (row == null) {
        throw notTransferable(tx.getId());
      }
      scope.requireVisible(tx.getBranchId());
      if (row.getBlockedReason() != null) {
        throw blocked(row.getBlockedReason(), tx.getId());
      }
      identityRule.require(to, tx.getCompanyId());
    }

    List<Instrument> linked = lockInstruments(instrumentIdsOf(rows.values()));
    List<Instrument> movable = new ArrayList<>();
    List<String> skipped = new ArrayList<>();
    for (Instrument instrument : linked) {
      if (roleOf(instrument, from.getId()) != null) {
        movable.add(instrument);
      } else {
        skipped.add(instrument.getNumber());
      }
    }
    requireCompleteInstrumentLines(from.getId(), ids, movable);

    LocalDate date = request.date() != null ? request.date() : clock.today();
    String note = blankToNull(request.description());
    AccountTransfer transfer =
        saveTransfer(new AccountTransfer(from.getId(), to.getId(), date, note, idempotencyKey));
    String description =
        LedgerDescriptions.fit(
            NOTE_CREATE
                + ": "
                + from.getCode()
                + " → "
                + to.getCode()
                + (note == null ? "" : " — " + note));
    List<AccountTransferLine> created = new ArrayList<>();
    for (AccountTransaction tx : selected) {
      AccountTransferLine line =
          new AccountTransferLine(
              transfer.getId(),
              tx.getId(),
              tx.getBranchId(),
              tx.getCompanyId(),
              tx.getDirection(),
              tx.getMoney());
      created.add(line);
    }
    saveLines(created);
    for (int i = 0; i < selected.size(); i++) {
      AccountTransaction tx = selected.get(i);
      UUID lineId = created.get(i).getId();
      ledger.mirror(
          tx,
          from.getId(),
          tx.getDirection().opposite(),
          date,
          description,
          LedgerService.SOURCE_TRANSFER_OUT,
          lineId);
      ledger.mirror(
          tx,
          to.getId(),
          tx.getDirection(),
          date,
          description,
          LedgerService.SOURCE_TRANSFER_IN,
          lineId);
    }
    for (Instrument instrument : movable) {
      Reassignment moved =
          instrumentService.transferForAccount(
              instrument,
              from.getId(),
              to.getId(),
              true,
              true,
              transfer.getId(),
              date,
              NOTE_CREATE);
      if (moved.any()) {
        transferInstruments.save(
            new AccountTransferInstrument(
                transfer.getId(), instrument.getId(), moved.drawer(), moved.endorsee()));
      } else {
        skipped.add(instrument.getNumber());
      }
    }
    transferInstruments.flush();
    audit.record(
        AuditEvent.ACCOUNT_TRANSFER_CREATED,
        TARGET + transfer.getId(),
        from.getId() + " → " + to.getId() + ", " + created.size());
    return toResponse(transfer, created, skipped);
  }

  /**
   * Taşımayı bütün olarak geri alır: virman satırları ters kayıtla kapanır, satırlar pasifleşir
   * (hareketler yeniden taşınabilir), çekler eski cariye döner. Taşımadan sonra işlem görmüş çek
   * varsa (durum hareketi ya da hedefte çeke bağlı satır) hiçbir şey yazılmaz: 409 {@code
   * TRANSFER_INSTRUMENT_MOVED}.
   */
  @Transactional
  public AccountTransferResponse reverse(UUID id, AccountTransferReverseRequest request) {
    AccountTransfer transfer =
        transfers.findForUpdate(id).orElseThrow(AccountTransferService::notFound);
    List<AccountTransferLine> transferLines = lines.findAllByAccountTransferId(id);
    requireTransferAccess(transfer, transferLines);
    if (transfer.getStatus() == AccountTransferStatus.REVERSED) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "TRANSFER_ALREADY_REVERSED", "Taşıma zaten geri alınmış.");
    }
    UUID from = transfer.getFromAccountId();
    UUID to = transfer.getToAccountId();
    accounts.lockForTransfer(List.of(from, to));
    List<AccountTransferInstrument> moved =
        transferInstruments.findAllByAccountTransferId(id).stream()
            .filter(item -> !item.isReverted())
            .sorted(Comparator.comparing(AccountTransferInstrument::getInstrumentId))
            .toList();
    Map<UUID, Instrument> locked =
        lockInstruments(moved.stream().map(AccountTransferInstrument::getInstrumentId).toList())
            .stream()
            .collect(Collectors.toMap(Instrument::getId, Function.identity()));
    List<UUID> movedAfter = transfers.movedInstruments(id);
    if (!movedAfter.isEmpty()) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "TRANSFER_INSTRUMENT_MOVED",
          "Taşınan çek/senet taşımadan sonra işlem gördü; taşıma geri alınamaz.",
          movedAfter.stream()
              .sorted()
              .map(instrumentId -> "instrumentIds=" + instrumentId)
              .toList());
    }

    LocalDate date = request != null && request.date() != null ? request.date() : clock.today();
    String note = request == null ? null : blankToNull(request.description());
    String description =
        LedgerDescriptions.fit(
            NOTE_REVERSE
                + ": "
                + codeOf(from)
                + " → "
                + codeOf(to)
                + (note == null ? "" : " — " + note));
    for (AccountTransferLine line : transferLines) {
      ledger.reverseSource(LedgerService.SOURCE_TRANSFER_OUT, line.getId(), date, description);
      ledger.reverseSource(LedgerService.SOURCE_TRANSFER_IN, line.getId(), date, description);
      line.deactivate();
    }
    lines.saveAllAndFlush(transferLines);
    transfer.reverse(date);
    transfers.saveAndFlush(transfer);

    List<String> skipped = new ArrayList<>();
    for (AccountTransferInstrument item : moved) {
      Instrument instrument = locked.get(item.getInstrumentId());
      Reassignment back =
          instrumentService.transferForAccount(
              instrument,
              to,
              from,
              item.isMovedDrawer(),
              item.isMovedEndorsee(),
              id,
              date,
              NOTE_REVERSE);
      if (back.any()) {
        item.markReverted();
        transferInstruments.save(item);
      } else {
        skipped.add(instrument.getNumber());
      }
    }
    transferInstruments.flush();
    audit.record(
        AuditEvent.ACCOUNT_TRANSFER_REVERSED,
        TARGET + id,
        from + " → " + to + ", " + transferLines.size());
    return toResponse(transfer, transferLines, skipped);
  }

  // --- kurallar

  private Optional<AccountTransferResponse> replay(
      AccountTransferRequest request, String idempotencyKey) {
    if (idempotencyKey == null) {
      return Optional.empty();
    }
    return transfers
        .findByIdempotencyKey(idempotencyKey)
        .map(
            existing -> {
              List<AccountTransferLine> existingLines =
                  lines.findAllByAccountTransferId(existing.getId());
              requireTransferAccess(existing, existingLines);
              if (!existing.getFromAccountId().equals(request.fromAccountId())
                  || !existing.getToAccountId().equals(request.toAccountId())) {
                throw new BusinessException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "IDEMPOTENCY_KEY_REUSED",
                    "Bu istek anahtarı başka bir kayıt için kullanılmış.");
              }
              return toResponse(existing, existingLines, List.of());
            });
  }

  /** Grup carisi hiçbir yönde taşınmaz; tür ve hesap grubu aynı olmalı. */
  private void requireCompatible(Account from, Account to) {
    if (isIntercompany(from) || isIntercompany(to)) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "TRANSFER_INTERCOMPANY",
          "Grup şirketi carisiyle taşıma yapılamaz.");
    }
    if (from.getType() != to.getType() || !from.getSubGroup().equals(to.getSubGroup())) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "TRANSFER_GROUP_MISMATCH",
          "Farklı hesap grubundaki cariye taşıma yapılamaz. (Kaynak: "
              + groupName(from.getSubGroup())
              + " — Hedef: "
              + groupName(to.getSubGroup())
              + ")");
    }
  }

  private static boolean isIntercompany(Account account) {
    return account.getType() == AccountType.INTERCOMPANY
        || account.getRepresentsCompanyId() != null;
  }

  /** Seçilen satırlar kimlik sırasıyla kilitlenir; yok ya da kaynak caride değilse 409. */
  private List<AccountTransaction> lockTransactions(UUID fromId, Set<UUID> ids) {
    List<AccountTransaction> locked = transactions.findAllForUpdate(ids);
    Set<UUID> found = locked.stream().map(AccountTransaction::getId).collect(Collectors.toSet());
    for (UUID id : ids) {
      if (!found.contains(id)) {
        throw notTransferable(id);
      }
    }
    for (AccountTransaction tx : locked) {
      if (tx.isDeleted() || !fromId.equals(tx.getAccountId())) {
        throw notTransferable(tx.getId());
      }
    }
    return locked;
  }

  /**
   * Taşınan her çeke bağlı, kaynak cariteki tüm taşınabilir satırlar aynı taşımada seçilmiş olmalı
   * (F3a/b); çekler kilitli olduğundan kontrol güncel satırları görür.
   */
  private void requireCompleteInstrumentLines(
      UUID fromId, Set<UUID> selected, List<Instrument> movable) {
    if (movable.isEmpty()) {
      return;
    }
    Map<UUID, List<UUID>> missing =
        missingInstrumentLines(
            selected,
            transactions.transferableRowsByInstruments(
                fromId, movable.stream().map(Instrument::getId).toList()));
    if (missing.isEmpty()) {
      return;
    }
    Map.Entry<UUID, List<UUID>> first = missing.entrySet().iterator().next();
    List<String> details = new ArrayList<>();
    details.add("instrumentId=" + first.getKey());
    first.getValue().forEach(id -> details.add("missingTransactionIds=" + id));
    throw new BusinessException(
        HttpStatus.CONFLICT,
        "INSTRUMENT_LINES_INCOMPLETE",
        "Çek/senede bağlı tüm hareketler birlikte taşınmalıdır.",
        details);
  }

  /** Çek → seçilmemiş bağlı satırlar (çek ve satır kimlik sırasıyla). */
  static Map<UUID, List<UUID>> missingInstrumentLines(
      Set<UUID> selected, List<? extends TransferableRow> instrumentRows) {
    Map<UUID, List<UUID>> missing = new java.util.TreeMap<>();
    for (TransferableRow row : instrumentRows) {
      if (row.getInstrumentId() != null && !selected.contains(row.getId())) {
        missing.computeIfAbsent(row.getInstrumentId(), key -> new ArrayList<>()).add(row.getId());
      }
    }
    missing.values().forEach(list -> list.sort(Comparator.naturalOrder()));
    return missing;
  }

  /** Satırların bağlı çekleri, tekrarsız ve kimlik sırasıyla. */
  static List<UUID> instrumentIdsOf(Collection<? extends TransferableRow> rows) {
    Set<UUID> ids = new TreeSet<>();
    for (TransferableRow row : rows) {
      if (row.getInstrumentId() != null) {
        ids.add(row.getInstrumentId());
      }
    }
    return List.copyOf(ids);
  }

  /** Kaynak carinin çekteki yeri: keşideci önce, sonra lehtar; ikisi de değilse null. */
  static String roleOf(Instrument instrument, UUID accountId) {
    if (accountId.equals(instrument.getAccountId())) {
      return ROLE_DRAWER;
    }
    if (accountId.equals(instrument.getEndorsedAccountId())) {
      return ROLE_ENDORSEE;
    }
    return null;
  }

  private List<Instrument> lockInstruments(Collection<UUID> ids) {
    List<Instrument> locked = new ArrayList<>();
    for (UUID id : new TreeSet<>(ids)) {
      instruments.findForUpdate(id).ifPresent(locked::add);
    }
    return locked;
  }

  private Map<UUID, Instrument> instrumentsById(Collection<UUID> ids) {
    if (ids.isEmpty()) {
      return Map.of();
    }
    return instruments.findAllById(ids).stream()
        .collect(Collectors.toMap(Instrument::getId, Function.identity()));
  }

  /**
   * Okuma ve geri alma kapsamı (SEC-4): iki cari okunabilir (personel carisi izinsize 404 {@code
   * TRANSFER_NOT_FOUND}) ve her satırın iş yeri kullanıcının kapsamında (403).
   */
  private void requireTransferAccess(AccountTransfer transfer, List<AccountTransferLine> lineList) {
    if (!access.employeeVisible()) {
      for (UUID accountId : List.of(transfer.getFromAccountId(), transfer.getToAccountId())) {
        Account account =
            accounts.findById(accountId).orElseThrow(AccountTransferService::notFound);
        if (account.getType() == AccountType.EMPLOYEE) {
          throw notFound();
        }
      }
    }
    for (AccountTransferLine line : lineList) {
      scope.requireVisible(line.getBranchId());
    }
  }

  private AccountTransfer saveTransfer(AccountTransfer transfer) {
    try {
      return transfers.saveAndFlush(transfer);
    } catch (DataIntegrityViolationException ex) {
      if (String.valueOf(ex.getMostSpecificCause().getMessage()).contains(IDEMPOTENCY_INDEX)) {
        throw new BusinessException(
            HttpStatus.CONFLICT,
            "IDEMPOTENCY_IN_PROGRESS",
            "İstek işleniyor; lütfen tekrar deneyin.");
      }
      throw ex;
    }
  }

  /** Son savunma: eşzamanlı taşımada aynı hareket iki etkin taşımaya giremez (kısmi tekil). */
  private void saveLines(List<AccountTransferLine> created) {
    try {
      lines.saveAllAndFlush(created);
    } catch (DataIntegrityViolationException ex) {
      if (String.valueOf(ex.getMostSpecificCause().getMessage()).contains(LINE_INDEX)) {
        throw new BusinessException(
            HttpStatus.CONFLICT,
            "TRANSACTION_ALREADY_TRANSFERRED",
            "Seçilen hareketlerden biri başka bir taşımada.");
      }
      throw ex;
    }
  }

  private String groupName(String code) {
    return groups.findById(code).map(AccountGroup::getName).orElse(code);
  }

  private String codeOf(UUID accountId) {
    return accounts.findById(accountId).map(Account::getCode).orElse(String.valueOf(accountId));
  }

  // --- yanıt

  private AccountTransferResponse toResponse(
      AccountTransfer transfer, List<AccountTransferLine> transferLines, List<String> skipped) {
    List<AccountTransferInstrument> items =
        transferInstruments.findAllByAccountTransferId(transfer.getId());
    Map<UUID, Instrument> byId =
        instrumentsById(items.stream().map(AccountTransferInstrument::getInstrumentId).toList());
    List<AccountTransferInstrumentResponse> instrumentResponses =
        items.stream()
            .sorted(Comparator.comparing(AccountTransferInstrument::getInstrumentId))
            .map(
                item -> {
                  Instrument instrument = byId.get(item.getInstrumentId());
                  return new AccountTransferInstrumentResponse(
                      item.getInstrumentId(),
                      instrument == null ? null : instrument.getKind(),
                      instrument == null ? null : instrument.getNumber(),
                      item.isMovedDrawer(),
                      item.isMovedEndorsee(),
                      item.isReverted());
                })
            .toList();
    int checks =
        (int)
            instrumentResponses.stream()
                .filter(item -> item.kind() == InstrumentKind.CHECK)
                .count();
    int notes =
        (int)
            instrumentResponses.stream().filter(item -> item.kind() == InstrumentKind.NOTE).count();
    return new AccountTransferResponse(
        transfer.getId(),
        transfer.getFromAccountId(),
        transfer.getToAccountId(),
        transfer.getTransferDate(),
        transfer.getDescription(),
        transfer.getStatus(),
        transfer.getReverseDate(),
        transferLines.stream()
            .map(
                line ->
                    new AccountTransferLineResponse(
                        line.getId(),
                        line.getAccountTransactionId(),
                        line.getBranchId(),
                        line.getCompanyId(),
                        line.getDirection(),
                        line.getAmount(),
                        line.getCurrency(),
                        line.isActive()))
            .toList(),
        instrumentResponses,
        checks,
        notes,
        List.copyOf(skipped),
        transfer.getCreatedBy(),
        transfer.getCreatedAt());
  }

  static TransferableTransactionResponse toTransferable(
      TransferableRow row, Instrument instrument, UUID accountId) {
    String role = instrument == null ? null : roleOf(instrument, accountId);
    List<TransferableInstrumentResponse> linked =
        role == null
            ? List.of()
            : List.of(
                new TransferableInstrumentResponse(
                    instrument.getId(),
                    instrument.getKind(),
                    instrument.getNumber(),
                    instrument.getStatus(),
                    role));
    return new TransferableTransactionResponse(
        row.getId(),
        row.getTransactionDate(),
        TransactionKind.valueOf(row.getKind()),
        row.getSign() == null ? 1 : row.getSign(),
        row.getDocumentNo(),
        row.getDocumentType(),
        row.getBranchId(),
        row.getBranchName(),
        row.getCompanyId(),
        Direction.valueOf(row.getDirection()),
        row.getAmount(),
        row.getCurrency(),
        row.getDescription(),
        linked,
        role == null ? null : instrument.getId(),
        row.getBlockedReason());
  }

  private static AccountTransferHistoryRowResponse toHistory(TransferHistoryRow row) {
    return new AccountTransferHistoryRowResponse(
        row.getTransferId(),
        row.getLineId(),
        row.getTransferDate(),
        row.getStatus(),
        row.getFromAccountId(),
        row.getFromAccountCode(),
        row.getFromAccountName(),
        row.getToAccountId(),
        row.getToAccountCode(),
        row.getToAccountName(),
        row.getKind(),
        row.getAmount(),
        row.getCurrency(),
        row.getInstrumentNumber() == null ? List.of() : List.of(row.getInstrumentNumber()),
        row.getCreatedBy());
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  /**
   * Kilit altında engelli satır (12.8 §3.3.2): açık plan, kaynağına açık kur farkı kesilmiş hareket
   * ya da açık kur farkı belgesinin kendi satırı.
   */
  private static BusinessException blocked(String reason, UUID transactionId) {
    return switch (reason) {
      case "FX_DOCUMENT_OPEN" -> LedgerService.fxDocumentOpen(transactionId);
      case "FX_DOCUMENT" ->
          new BusinessException(
              HttpStatus.CONFLICT,
              "FX_DOCUMENT_NOT_TRANSFERABLE",
              "Kur farkı belgesi taşınamaz; kaynağıyla birlikte iptal edip yeniden kesin.",
              List.of("transactionId=" + transactionId));
      default ->
          new BusinessException(
              HttpStatus.CONFLICT,
              "TRANSACTION_HAS_OPEN_PLAN",
              "Hareketin açık ödeme planı var; önce planı ödeyin ya da iptal edin.",
              List.of("transactionId=" + transactionId));
    };
  }

  private static BusinessException notTransferable(UUID transactionId) {
    return new BusinessException(
        HttpStatus.CONFLICT,
        "TRANSACTION_NOT_TRANSFERABLE",
        "Seçilen hareket taşınamaz.",
        List.of("transactionId=" + transactionId));
  }

  static BusinessException notFound() {
    return new BusinessException(HttpStatus.NOT_FOUND, "TRANSFER_NOT_FOUND", "Taşıma bulunamadı.");
  }
}
