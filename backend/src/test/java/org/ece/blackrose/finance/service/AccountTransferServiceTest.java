package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.AccountTransaction;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.TransactionKind;
import org.ece.blackrose.finance.domain.Instrument;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountGroupRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountTransferInstrumentRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountTransferLineRepository;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountTransferRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.InstrumentRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.TransferableRow;
import org.ece.blackrose.finance.service.InstrumentService.Reassignment;
import org.ece.blackrose.finance.web.AccountDtos.AccountTransferRequest;
import org.ece.blackrose.finance.web.AccountDtos.AccountTransferResponse;
import org.ece.blackrose.finance.web.AccountDtos.TransferableTransactionResponse;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.tenant.TenantClock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;

/** Cari taşıma: bağlı çek kümesi çözümü, çek satırı bütünlüğü ve kilit sırası (12.1 §3.11). */
class AccountTransferServiceTest {

  private static final LocalDate TODAY = LocalDate.of(2026, 11, 14);
  private static final UUID BRANCH = UUID.randomUUID();
  private static final UUID COMPANY = UUID.randomUUID();

  private final UUID fromId = fromId();
  private final UUID toId = toId();

  private static UUID fromId() {
    return UUID.fromString("00000000-0000-0000-0000-00000000000a");
  }

  private static UUID toId() {
    return UUID.fromString("00000000-0000-0000-0000-00000000000b");
  }

  private AccountTransferRepository transfers;
  private AccountTransferLineRepository lines;
  private AccountTransferInstrumentRepository transferInstruments;
  private AccountRepository accounts;
  private AccountTransactionRepository transactions;
  private InstrumentRepository instruments;
  private LedgerService ledger;
  private InstrumentService instrumentService;
  private AccountAccess access;
  private AccountTransferService service;

  @BeforeEach
  void setUp() {
    transfers = mock(AccountTransferRepository.class);
    lines = mock(AccountTransferLineRepository.class);
    transferInstruments = mock(AccountTransferInstrumentRepository.class);
    accounts = mock(AccountRepository.class);
    transactions = mock(AccountTransactionRepository.class);
    instruments = mock(InstrumentRepository.class);
    ledger = mock(LedgerService.class);
    instrumentService = mock(InstrumentService.class);
    access = mock(AccountAccess.class);
    TenantClock clock = mock(TenantClock.class);
    when(clock.today()).thenReturn(TODAY);
    service =
        new AccountTransferService(
            transfers,
            lines,
            transferInstruments,
            accounts,
            mock(AccountGroupRepository.class),
            transactions,
            instruments,
            ledger,
            instrumentService,
            access,
            new CompanyIdentityRule(),
            mock(BranchScopeService.class),
            mock(AuditService.class),
            clock);
    Account from = account(fromId, "TED-1");
    Account to = account(toId, "TED-2");
    when(access.readable(fromId)).thenReturn(from);
    when(access.usable(toId)).thenReturn(to);
    when(transfers.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
    when(lines.saveAllAndFlush(anyList())).thenAnswer(call -> call.getArgument(0));
    when(transferInstruments.findAllByAccountTransferId(any())).thenReturn(List.of());
  }

  // --- saf yardımcılar

  @Test
  void bagliCeklerTekrarsizVeKimlikSirasiylaCozulur() {
    UUID high = UUID.fromString("7fffffff-0000-0000-0000-000000000000");
    UUID low = UUID.fromString("00000000-0000-0000-0000-000000000001");
    List<TransferableRow> rows =
        List.of(
            row(UUID.randomUUID(), high),
            row(UUID.randomUUID(), null),
            row(UUID.randomUUID(), low),
            row(UUID.randomUUID(), high));

    assertThat(AccountTransferService.instrumentIdsOf(rows)).containsExactly(low, high);
    assertThat(AccountTransferService.instrumentIdsOf(List.of())).isEmpty();
  }

  @Test
  void cekSatiriButunluguEksikSatirlariCekBazindaVerir() {
    UUID check = UUID.randomUUID();
    UUID settlement = UUID.fromString("00000000-0000-0000-0000-000000000002");
    UUID bounce = UUID.fromString("00000000-0000-0000-0000-000000000001");
    List<TransferableRow> linked = List.of(row(settlement, check), row(bounce, check));

    assertThat(AccountTransferService.missingInstrumentLines(Set.of(settlement, bounce), linked))
        .isEmpty();
    Map<UUID, List<UUID>> missing = AccountTransferService.missingInstrumentLines(Set.of(), linked);
    assertThat(missing).containsOnlyKeys(check);
    assertThat(missing.get(check)).containsExactly(bounce, settlement);
  }

  @Test
  void kaynakCarininCektekiYeriKesideciOnceLehtarSonra() {
    Instrument drawer = instrument(UUID.randomUUID(), fromId, null);
    Instrument endorsee = instrument(UUID.randomUUID(), UUID.randomUUID(), fromId);
    Instrument both = instrument(UUID.randomUUID(), fromId, fromId);
    Instrument elsewhere = instrument(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());

    assertThat(AccountTransferService.roleOf(drawer, fromId)).isEqualTo("DRAWER");
    assertThat(AccountTransferService.roleOf(endorsee, fromId)).isEqualTo("ENDORSEE");
    assertThat(AccountTransferService.roleOf(both, fromId)).isEqualTo("DRAWER");
    assertThat(AccountTransferService.roleOf(elsewhere, fromId)).isNull();
  }

  @Test
  void tasinabilirSatirCekGrubuVePlanEngeliTasir() {
    UUID txId = UUID.randomUUID();
    Instrument check = instrument(UUID.randomUUID(), fromId, null);
    TransferableRow row = row(txId, check.getId());
    when(row.getKind()).thenReturn("COLLECTION");
    when(row.getSign()).thenReturn(null);
    when(row.getDirection()).thenReturn("CREDIT");
    when(row.getBlockedReason()).thenReturn("OPEN_PLAN");

    TransferableTransactionResponse linked =
        AccountTransferService.toTransferable(row, check, fromId);
    assertThat(linked.kind()).isEqualTo(TransactionKind.COLLECTION);
    assertThat(linked.sign()).isEqualTo(1);
    assertThat(linked.direction()).isEqualTo(Direction.CREDIT);
    assertThat(linked.instrumentGroup()).isEqualTo(check.getId());
    assertThat(linked.instruments())
        .singleElement()
        .satisfies(
            i -> {
              assertThat(i.role()).isEqualTo("DRAWER");
              assertThat(i.number()).isEqualTo("C-" + check.getId());
            });
    assertThat(linked.blockedReason()).isEqualTo("OPEN_PLAN");

    // Çek başka cariye geçmişse grup yok (birlikte seçim zorunlu değil).
    TransferableTransactionResponse unlinked =
        AccountTransferService.toTransferable(
            row, instrument(check.getId(), UUID.randomUUID(), null), fromId);
    assertThat(unlinked.instrumentGroup()).isNull();
    assertThat(unlinked.instruments()).isEmpty();
  }

  // --- kayıt akışı

  @Test
  void kilitSirasiCarilerHareketlerSonraKimlikSirasiylaCekler() {
    UUID checkHigh = UUID.fromString("7fffffff-0000-0000-0000-000000000000");
    UUID checkLow = UUID.fromString("00000000-0000-0000-0000-0000000000c1");
    AccountTransaction first = tx(UUID.fromString("00000000-0000-0000-0000-000000000001"));
    AccountTransaction second = tx(UUID.fromString("00000000-0000-0000-0000-000000000002"));
    List<UUID> ids = List.of(second.getId(), first.getId());
    when(transactions.findAllForUpdate(any())).thenReturn(List.of(first, second));
    List<TransferableRow> rows =
        List.of(row(first.getId(), checkHigh), row(second.getId(), checkLow));
    when(transactions.transferableRowsByIds(eq(fromId), any())).thenReturn(rows);
    when(transactions.transferableRowsByInstruments(eq(fromId), any())).thenReturn(rows);
    Instrument low = instrument(checkLow, fromId, null);
    Instrument high = instrument(checkHigh, null, fromId);
    when(instruments.findForUpdate(checkLow)).thenReturn(Optional.of(low));
    when(instruments.findForUpdate(checkHigh)).thenReturn(Optional.of(high));
    when(instrumentService.transferForAccount(
            any(), any(), any(), anyBoolean(), anyBoolean(), any(), any(), anyString()))
        .thenReturn(new Reassignment(true, false));

    AccountTransferResponse response =
        service.create(new AccountTransferRequest(fromId, toId, ids, " not ", null), null);

    assertThat(response.transferDate()).isEqualTo(TODAY);
    assertThat(response.description()).isEqualTo("not");
    assertThat(response.lines()).hasSize(2);
    assertThat(response.skippedInstruments()).isEmpty();
    InOrder order = inOrder(accounts, transactions, instruments, ledger, instrumentService);
    order.verify(accounts).lockForTransfer(List.of(fromId, toId));
    order.verify(transactions).findAllForUpdate(any());
    order.verify(instruments).findForUpdate(checkLow);
    order.verify(instruments).findForUpdate(checkHigh);
    order
        .verify(ledger)
        .mirror(
            eq(first),
            eq(fromId),
            eq(Direction.CREDIT),
            eq(TODAY),
            eq("Cari taşıma: TED-1 → TED-2 — not"),
            eq(LedgerService.SOURCE_TRANSFER_OUT),
            any());
    order
        .verify(ledger)
        .mirror(
            eq(first),
            eq(toId),
            eq(Direction.DEBIT),
            eq(TODAY),
            anyString(),
            eq(LedgerService.SOURCE_TRANSFER_IN),
            any());
    order
        .verify(instrumentService)
        .transferForAccount(
            eq(low), eq(fromId), eq(toId), eq(true), eq(true), any(), eq(TODAY), anyString());
    order
        .verify(instrumentService)
        .transferForAccount(
            eq(high), eq(fromId), eq(toId), eq(true), eq(true), any(), eq(TODAY), anyString());
  }

  @Test
  void eksikCekSatiriHicbirSeyYazmadanReddedilir() {
    UUID check = UUID.randomUUID();
    AccountTransaction selected = tx(UUID.randomUUID());
    UUID missing = UUID.randomUUID();
    when(transactions.findAllForUpdate(any())).thenReturn(List.of(selected));
    TransferableRow selectedRow = row(selected.getId(), check);
    TransferableRow missingRow = row(missing, check);
    Instrument linked = instrument(check, fromId, null);
    when(transactions.transferableRowsByIds(eq(fromId), any())).thenReturn(List.of(selectedRow));
    when(transactions.transferableRowsByInstruments(eq(fromId), any()))
        .thenReturn(List.of(selectedRow, missingRow));
    when(instruments.findForUpdate(check)).thenReturn(Optional.of(linked));

    assertThatThrownBy(
            () ->
                service.create(
                    new AccountTransferRequest(fromId, toId, List.of(selected.getId()), null, null),
                    null))
        .isInstanceOfSatisfying(
            BusinessException.class,
            ex -> {
              assertThat(ex.getCode()).isEqualTo("INSTRUMENT_LINES_INCOMPLETE");
              assertThat(ex.getDetails())
                  .containsExactly("instrumentId=" + check, "missingTransactionIds=" + missing);
            });
    verify(transfers, never()).saveAndFlush(any());
    verify(ledger, never()).mirror(any(), any(), any(), any(), any(), any(), any());
  }

  @Test
  void kaynakCarideOlmayanVeyaTasinamazHareket409() {
    AccountTransaction foreign = tx(UUID.randomUUID());
    when(foreign.getAccountId()).thenReturn(UUID.randomUUID());
    when(transactions.findAllForUpdate(any())).thenReturn(List.of(foreign));

    assertThatThrownBy(
            () ->
                service.create(
                    new AccountTransferRequest(fromId, toId, List.of(foreign.getId()), null, null),
                    null))
        .isInstanceOfSatisfying(
            BusinessException.class,
            ex -> {
              assertThat(ex.getCode()).isEqualTo("TRANSACTION_NOT_TRANSFERABLE");
              assertThat(ex.getDetails()).containsExactly("transactionId=" + foreign.getId());
            });

    AccountTransaction reversed = tx(UUID.randomUUID());
    when(transactions.findAllForUpdate(any())).thenReturn(List.of(reversed));
    when(transactions.transferableRowsByIds(eq(fromId), anyCollection())).thenReturn(List.of());
    assertThatThrownBy(
            () ->
                service.create(
                    new AccountTransferRequest(
                        fromId, toId, new ArrayList<>(List.of(reversed.getId())), null, null),
                    null))
        .isInstanceOfSatisfying(
            BusinessException.class,
            ex -> assertThat(ex.getCode()).isEqualTo("TRANSACTION_NOT_TRANSFERABLE"));
  }

  // --- kısıt ihlalinin koda çevrilmesi (T-2)

  @Test
  void yaristaAyniHareketTekilIndeksi409TransactionAlreadyTransferred() {
    AccountTransaction selected = simpleTransfer();
    when(lines.saveAllAndFlush(anyList())).thenThrow(violation("account_transfer_line_tx_uq"));

    assertThatThrownBy(() -> service.create(request(selected), null))
        .isInstanceOfSatisfying(
            BusinessException.class,
            ex -> {
              assertThat(ex.getStatus()).isEqualTo(HttpStatus.CONFLICT);
              assertThat(ex.getCode()).isEqualTo("TRANSACTION_ALREADY_TRANSFERRED");
            });
    verify(ledger, never()).mirror(any(), any(), any(), any(), any(), any(), any());
  }

  @Test
  void ayniAnahtarlaEszamanliTasima409IdempotencyInProgress() {
    AccountTransaction selected = simpleTransfer();
    when(transfers.saveAndFlush(any())).thenThrow(violation("account_transfer_idempotency_uq"));

    assertThatThrownBy(() -> service.create(request(selected), "anahtar-1"))
        .isInstanceOfSatisfying(
            BusinessException.class,
            ex -> {
              assertThat(ex.getStatus()).isEqualTo(HttpStatus.CONFLICT);
              assertThat(ex.getCode()).isEqualTo("IDEMPOTENCY_IN_PROGRESS");
            });
  }

  @Test
  void baskaKisitIhlaliAynenYenidenFirlatilir() {
    AccountTransaction selected = simpleTransfer();
    DataIntegrityViolationException other = violation("account_transfer_accounts_ck");
    when(transfers.saveAndFlush(any())).thenThrow(other);
    assertThatThrownBy(() -> service.create(request(selected), null)).isSameAs(other);

    DataIntegrityViolationException otherLine = violation("account_transfer_line_direction_ck");
    doAnswer(call -> call.getArgument(0)).when(transfers).saveAndFlush(any());
    when(lines.saveAllAndFlush(anyList())).thenThrow(otherLine);
    assertThatThrownBy(() -> service.create(request(selected), null)).isSameAs(otherLine);
  }

  @Test
  void kilittenSonraHedefKartYenidenOkunurVePasifse422() {
    AccountTransaction selected = simpleTransfer();
    Account to = access.usable(toId);
    when(to.isActive()).thenReturn(false);

    assertThatThrownBy(() -> service.create(request(selected), null))
        .isInstanceOfSatisfying(
            BusinessException.class, ex -> assertThat(ex.getCode()).isEqualTo("ACCOUNT_INACTIVE"));
    InOrder order = inOrder(accounts, access);
    order.verify(accounts).lockForTransfer(List.of(fromId, toId));
    order.verify(access).refresh(to);
  }

  /** Çeksiz tek hareketlik geçerli taşıma kurgusu. */
  private AccountTransaction simpleTransfer() {
    AccountTransaction selected = tx(UUID.randomUUID());
    when(transactions.findAllForUpdate(any())).thenReturn(List.of(selected));
    TransferableRow row = row(selected.getId(), null);
    when(transactions.transferableRowsByIds(eq(fromId), any())).thenReturn(List.of(row));
    when(transactions.transferableRowsByInstruments(eq(fromId), any())).thenReturn(List.of());
    return selected;
  }

  private static AccountTransferRequest request(AccountTransaction selected) {
    return new AccountTransferRequest(fromId(), toId(), List.of(selected.getId()), null, null);
  }

  private static DataIntegrityViolationException violation(String constraint) {
    return new DataIntegrityViolationException(
        "x",
        new RuntimeException(
            "duplicate key value violates unique constraint \"" + constraint + "\""));
  }

  // --- yardımcılar

  private static Account account(UUID id, String code) {
    Account account = mock(Account.class);
    when(account.getId()).thenReturn(id);
    when(account.isActive()).thenReturn(true);
    when(account.getCode()).thenReturn(code);
    when(account.getType()).thenReturn(AccountType.SUPPLIER);
    when(account.getSubGroup()).thenReturn("GENEL");
    return account;
  }

  private AccountTransaction tx(UUID id) {
    AccountTransaction tx = mock(AccountTransaction.class);
    when(tx.getId()).thenReturn(id);
    when(tx.getAccountId()).thenReturn(fromId);
    when(tx.getBranchId()).thenReturn(BRANCH);
    when(tx.getCompanyId()).thenReturn(COMPANY);
    when(tx.getDirection()).thenReturn(Direction.DEBIT);
    when(tx.getMoney()).thenReturn(new Money(new BigDecimal("10.00"), "TRY"));
    return tx;
  }

  private static TransferableRow row(UUID id, UUID instrumentId) {
    TransferableRow row = mock(TransferableRow.class);
    when(row.getId()).thenReturn(id);
    when(row.getInstrumentId()).thenReturn(instrumentId);
    return row;
  }

  private static Instrument instrument(UUID id, UUID drawer, UUID endorsee) {
    Instrument instrument = mock(Instrument.class);
    when(instrument.getId()).thenReturn(id);
    when(instrument.getAccountId()).thenReturn(drawer);
    when(instrument.getEndorsedAccountId()).thenReturn(endorsee);
    when(instrument.getKind()).thenReturn(InstrumentKind.CHECK);
    when(instrument.getStatus()).thenReturn(InstrumentStatus.PORTFOLIO);
    when(instrument.getNumber()).thenReturn("C-" + id);
    return instrument;
  }
}
