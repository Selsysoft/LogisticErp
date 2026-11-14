package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.AccountTransaction;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountTransactionRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.LedgerDetailRow;
import org.ece.blackrose.tenant.TenantClock;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

/** ZTO "Sil" yönlendiricisi: kaynak türü → eylem tablosunun her satırı (12.1 §3.8). */
class AccountTransactionVoidServiceTest {

  private static final LocalDate TODAY = LocalDate.of(2026, 11, 14);
  private static final LocalDate DATE = LocalDate.of(2026, 11, 10);

  private AccountTransactionRepository transactions;
  private AccountTransactionQueryService queries;
  private AccountDocumentService documents;
  private SettlementService settlements;
  private AccountService accounts;
  private PurchaseInvoiceService invoices;
  private AccountTransactionVoidService service;
  private final UUID id = UUID.randomUUID();
  private final UUID sourceId = UUID.randomUUID();
  private final AccountTransaction reversal = mock(AccountTransaction.class);

  @BeforeEach
  void setUp() {
    transactions = mock(AccountTransactionRepository.class);
    queries = mock(AccountTransactionQueryService.class);
    documents = mock(AccountDocumentService.class);
    settlements = mock(SettlementService.class);
    accounts = mock(AccountService.class);
    invoices = mock(PurchaseInvoiceService.class);
    TenantClock clock = mock(TenantClock.class);
    when(clock.today()).thenReturn(TODAY);
    service =
        new AccountTransactionVoidService(
            transactions, queries, documents, settlements, accounts, invoices, clock);
    when(transactions.findBySourceTypeAndSourceId(LedgerService.SOURCE_REVERSAL, id))
        .thenReturn(Optional.of(reversal));
  }

  private LedgerDetailRow row(String sourceType, String kind) {
    LedgerDetailRow row = mock(LedgerDetailRow.class);
    when(row.getId()).thenReturn(id);
    when(row.getSourceType()).thenReturn(sourceType);
    when(row.getBaseSourceType()).thenReturn(sourceType);
    when(row.getSourceId()).thenReturn(sourceId);
    when(row.getBaseSourceId()).thenReturn(sourceId);
    when(row.getKind()).thenReturn(kind);
    when(row.getReversed()).thenReturn(false);
    when(queries.visibleRow(id)).thenReturn(row);
    return row;
  }

  @Test
  void belgeIptalEdilirVeVarsayilanAciklamaYazilir() {
    row(AccountDocumentService.SOURCE, "DEBT");

    assertThat(service.voidTransaction(id, null, null)).isSameAs(reversal);

    verify(documents).cancel(sourceId, TODAY, "ZTO ekranından silindi: Borç");
  }

  @Test
  void odemeTahsilatTersCevrilir() {
    row("SETTLEMENT", "COLLECTION");

    service.voidTransaction(id, DATE, "  Yanlış giriş  ");

    verify(settlements).reverse(sourceId, DATE, "Yanlış giriş");
  }

  @ParameterizedTest
  @CsvSource({
    "MANUAL,RECEIVABLE,Alacak",
    "OPENING,PAYMENT,Ödeme",
    "OPENING_INVOICE,COLLECTION,Tahsilat"
  })
  void elleVeAcilisHareketiHareketUzerindenTersCevrilir(String type, String kind, String label) {
    row(type, kind);

    service.voidTransaction(id, DATE, null);

    verify(accounts).reverseManual(id, DATE, "ZTO ekranından silindi: " + label);
  }

  @Test
  void alisFaturasiIptalEdilir() {
    row("PURCHASE_INVOICE", "DEBT");

    service.voidTransaction(id, DATE, null);

    verify(invoices).cancel(sourceId, DATE);
  }

  @Test
  void uzunAciklamaBesYuzKaraktereKesilir() {
    row(AccountDocumentService.SOURCE, "DEBT");

    service.voidTransaction(id, DATE, "x".repeat(700));

    verify(documents).cancel(eq(sourceId), eq(DATE), eq("x".repeat(497) + "..."));
  }

  @Test
  void tersKayitYenidenTersCevrilemez() {
    row(LedgerService.SOURCE_REVERSAL, "DEBT");

    assertCode(() -> service.voidTransaction(id, DATE, null), "ALREADY_REVERSAL");
    verifyNoInteractions(documents, settlements, accounts, invoices);
  }

  @Test
  void zatenTersCevrilmisHareket409() {
    LedgerDetailRow row = row("MANUAL", "RECEIVABLE");
    when(row.getReversed()).thenReturn(true);

    assertCode(() -> service.voidTransaction(id, DATE, null), "TRANSACTION_ALREADY_REVERSED");
    verify(accounts, never()).reverseManual(any(), any(), anyString());
  }

  @ParameterizedTest
  @ValueSource(strings = {"ACCOUNT_TRANSFER_OUT", "ACCOUNT_TRANSFER_IN"})
  void tasimaSatiriGecmisTasimalardanGeriAlinir(String type) {
    row(type, "DEBT");

    assertCode(() -> service.voidTransaction(id, DATE, null), "TRANSACTION_IS_TRANSFER");
  }

  @ParameterizedTest
  @CsvSource(
      nullValues = "-",
      value = {
        "FREIGHT_INVOICE,true,/operations/shipments/",
        "TRIP_COST,true,/operations/shipments/",
        "WAREHOUSE_INVOICE,true,/warehouse/billing/",
        "VEHICLE_EXPENSE,true,/fleet/vehicles/",
        "FREIGHT_INVOICE,false,-",
        "INSTRUMENT,false,/finance/instruments",
        "INSTRUMENT_ENDORSEE_BOUNCE,false,/finance/instruments",
        "UNKNOWN_SOURCE,false,-"
      })
  void modulKayitlariKendiModulundenIptalEdilir(String type, boolean withRef, String route) {
    LedgerDetailRow row = row(type, "RECEIVABLE");
    UUID ref = UUID.randomUUID();
    when(row.getRefId()).thenReturn(withRef ? ref : null);

    BusinessException ex =
        catchBusiness(() -> service.voidTransaction(id, DATE, null), "TRANSACTION_SOURCE_MANAGED");

    if (route == null) {
      assertThat(ex.getDetails()).isEmpty();
    } else {
      assertThat(ex.getDetails()).containsExactly("route=" + route + (withRef ? ref : ""));
    }
  }

  @Test
  void kaynakTersKayitUretmezse409() {
    row("PURCHASE_INVOICE", "DEBT");
    when(transactions.findBySourceTypeAndSourceId(LedgerService.SOURCE_REVERSAL, id))
        .thenReturn(Optional.empty());

    assertCode(() -> service.voidTransaction(id, DATE, null), "TRANSACTION_NOT_REVERSED");
  }

  @Test
  void kaynakEtiketleri() {
    LedgerDetailRow row = row("ACCOUNT_DOCUMENT", "DEBT");
    when(row.getDocumentNo()).thenReturn("F-1");
    var source = AccountTransactionQueryService.sourceOf(row);
    assertThat(source.label()).isEqualTo("Cari belgesi F-1");
    assertThat(source.route()).isNull();

    for (String type :
        new String[] {
          "SETTLEMENT",
          "PURCHASE_INVOICE",
          "WAREHOUSE_INVOICE",
          "TRIP_COST",
          "VEHICLE_EXPENSE",
          "INSTRUMENT",
          "OPENING",
          "OPENING_INVOICE",
          "MANUAL"
        }) {
      LedgerDetailRow other = row(type, "DEBT");
      assertThat(AccountTransactionQueryService.sourceOf(other).label()).isNotBlank();
    }
    LedgerDetailRow unknown = row("X_SOURCE", "DEBT");
    when(unknown.getDocumentType()).thenReturn("X_SOURCE");
    assertThat(AccountTransactionQueryService.sourceOf(unknown).label()).isEqualTo("X_SOURCE");
    assertThat(AccountTransactionVoidService.kindLabel("OTHER")).isEqualTo("OTHER");
  }

  private static void assertCode(Runnable call, String code) {
    catchBusiness(call, code);
  }

  private static BusinessException catchBusiness(Runnable call, String code) {
    BusinessException[] holder = new BusinessException[1];
    assertThatThrownBy(call::run)
        .isInstanceOfSatisfying(BusinessException.class, ex -> holder[0] = ex)
        .extracting(ex -> ((BusinessException) ex).getCode())
        .isEqualTo(code);
    return holder[0];
  }
}
