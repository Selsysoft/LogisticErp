package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementLockReason;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.ece.blackrose.finance.repository.SettlementQueryRepository.AllocationRow;
import org.ece.blackrose.finance.repository.SettlementQueryRepository.OpenInvoiceRow;
import org.ece.blackrose.finance.repository.SettlementQueryRepository.SettlementItemRow;
import org.ece.blackrose.finance.repository.SettlementQueryRepository.SettlementLineRow;
import org.ece.blackrose.finance.service.SettlementQueryService.SortKey;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementAllocationResponse;
import org.ece.blackrose.finance.web.FinanceDtos.SettlementListItemResponse;
import org.junit.jupiter.api.Test;

/** Liste satırı türetmeleri (12.2a §3.7, §6.3): kilit nedeni, uygunluk, döviz kalanı, maske. */
class SettlementListItemMapperTest {

  private static final UUID ID = UUID.randomUUID();
  private static final UUID ACCOUNT = UUID.randomUUID();

  @Test
  void kilitNedeniSirasi() {
    BigDecimal zero = BigDecimal.ZERO;
    BigDecimal used = BigDecimal.ONE;
    SettlementMethod cash = SettlementMethod.CASH;
    SettlementStatus posted = SettlementStatus.POSTED;
    assertThat(
            SettlementQueryService.lockReason(
                SettlementStatus.REVERSED, SettlementMethod.CHECK, true, true, true, used, true))
        .isEqualTo(SettlementLockReason.REVERSED);
    assertThat(
            SettlementQueryService.lockReason(
                posted, SettlementMethod.CHECK, true, true, true, used, true))
        .isEqualTo(SettlementLockReason.CHECK);
    assertThat(SettlementQueryService.lockReason(posted, cash, true, true, true, used, true))
        .isEqualTo(SettlementLockReason.PLAN);
    assertThat(SettlementQueryService.lockReason(posted, cash, false, true, true, used, true))
        .isEqualTo(SettlementLockReason.INTERCOMPANY);
    assertThat(SettlementQueryService.lockReason(posted, cash, false, false, true, used, true))
        .isEqualTo(SettlementLockReason.VEHICLE_EXPENSE);
    assertThat(SettlementQueryService.lockReason(posted, cash, false, false, false, used, true))
        .isEqualTo(SettlementLockReason.FX_SOURCE);
    assertThat(SettlementQueryService.lockReason(posted, cash, false, false, false, zero, true))
        .isEqualTo(SettlementLockReason.TRANSFERRED);
    assertThat(SettlementQueryService.lockReason(posted, cash, false, false, false, zero, false))
        .isNull();
  }

  @Test
  void dovizKalaniYalnizTryDisiTahsilatta() {
    BigDecimal amount = new BigDecimal("100.0000");
    BigDecimal used = new BigDecimal("40.0000");
    assertThat(SettlementQueryService.fxRemaining(SettlementType.COLLECTION, "USD", amount, used))
        .isEqualByComparingTo("60");
    assertThat(SettlementQueryService.fxRemaining(SettlementType.COLLECTION, "TRY", amount, used))
        .isZero();
    assertThat(SettlementQueryService.fxRemaining(SettlementType.PAYMENT, "USD", amount, used))
        .isZero();
  }

  @Test
  void duzenlenebilirNakitCariliSatir() {
    SettlementListItemResponse item = SettlementQueryService.toItem(row("CASH", null, "CASH"));
    assertThat(item.lockReason()).isNull();
    assertThat(item.reversible()).isTrue();
    assertThat(item.correctable()).isTrue();
    assertThat(item.displayMethod().name()).isEqualTo("CASH");
    assertThat(item.channel()).isNull();
    assertThat(item.createdAt()).isEqualTo(Instant.parse("2026-11-15T08:00:00Z"));
    assertThat(item.fxUsed()).isZero();
    assertThat(item.fxRemaining()).isZero();
    assertThat(item.accountType().name()).isEqualTo("SUPPLIER");
    assertThat(item.fundKind().name()).isEqualTo("CASH");
    assertThat(item.instrumentKind()).isNull();
    assertThat(item.instrumentStatus()).isNull();
  }

  @Test
  void kartVeCekSatirlari() {
    SettlementListItemResponse card =
        SettlementQueryService.toItem(row("BANK", "CREDIT_CARD", "CREDIT_CARD"));
    assertThat(card.displayMethod().name()).isEqualTo("CREDIT_CARD");
    assertThat(card.channel().name()).isEqualTo("CREDIT_CARD");
    assertThat(card.correctable()).isTrue();

    SettlementItemRow note = row("CHECK", null, "NOTE");
    when(note.getInstrumentKind()).thenReturn("NOTE");
    when(note.getInstrumentStatus()).thenReturn("PORTFOLIO");
    SettlementListItemResponse item = SettlementQueryService.toItem(note);
    assertThat(item.displayMethod().name()).isEqualTo("NOTE");
    assertThat(item.instrumentKind().name()).isEqualTo("NOTE");
    assertThat(item.instrumentStatus().name()).isEqualTo("PORTFOLIO");
    assertThat(item.lockReason()).isEqualTo(SettlementLockReason.CHECK);
    assertThat(item.reversible()).isFalse();
    assertThat(item.correctable()).isFalse();
  }

  @Test
  void tasinmisVeMaskeliVeCarisizSatirlar() {
    SettlementItemRow transferred = row("CASH", null, "CASH");
    when(transferred.getTransferred()).thenReturn(true);
    SettlementListItemResponse moved = SettlementQueryService.toItem(transferred);
    assertThat(moved.transferred()).isTrue();
    assertThat(moved.lockReason()).isEqualTo(SettlementLockReason.TRANSFERRED);
    assertThat(moved.reversible()).isFalse();
    assertThat(moved.correctable()).isFalse();

    SettlementItemRow masked = row("CASH", null, "CASH");
    when(masked.getEmployeeMasked()).thenReturn(true);
    when(masked.getAccountId()).thenReturn(null);
    when(masked.getAccountType()).thenReturn("EMPLOYEE");
    SettlementListItemResponse hidden = SettlementQueryService.toItem(masked);
    assertThat(hidden.employeeMasked()).isTrue();
    assertThat(hidden.lockReason()).isNull();
    assertThat(hidden.reversible()).isFalse();
    assertThat(hidden.correctable()).isFalse();

    SettlementItemRow expense = row("CASH", null, "CASH");
    when(expense.getAccountId()).thenReturn(null);
    when(expense.getAccountType()).thenReturn(null);
    when(expense.getFundKind()).thenReturn(null);
    SettlementListItemResponse direct = SettlementQueryService.toItem(expense);
    assertThat(direct.reversible()).isTrue();
    assertThat(direct.correctable()).isFalse();
    assertThat(direct.accountType()).isNull();
    assertThat(direct.fundKind()).isNull();
  }

  @Test
  void dovizBozumuKaynagiTahsilat() {
    SettlementItemRow fx = row("BANK", "TRANSFER", "BANK");
    when(fx.getType()).thenReturn("COLLECTION");
    when(fx.getCurrency()).thenReturn("USD");
    when(fx.getFxUsed()).thenReturn(new BigDecimal("30.0000"));
    SettlementListItemResponse item = SettlementQueryService.toItem(fx);
    assertThat(item.fxUsed()).isEqualByComparingTo("30");
    assertThat(item.fxRemaining()).isEqualByComparingTo("70");
    assertThat(item.lockReason()).isEqualTo(SettlementLockReason.FX_SOURCE);
  }

  @Test
  void eslesmeKapsamDisiMaskesi() {
    UUID inside = UUID.randomUUID();
    UUID outside = UUID.randomUUID();
    AllocationRow visible = allocation(inside, false);
    SettlementAllocationResponse open =
        SettlementQueryService.toAllocation(visible, true, Set.of(inside));
    assertThat(open.outOfScope()).isFalse();
    assertThat(open.targetNumber()).isEqualTo("F-1");
    assertThat(open.targetId()).isNotNull();
    assertThat(open.active()).isTrue();
    assertThat(open.targetCancelled()).isFalse();

    SettlementAllocationResponse hidden =
        SettlementQueryService.toAllocation(allocation(outside, true), true, Set.of(inside));
    assertThat(hidden.outOfScope()).isTrue();
    assertThat(
            Arrays.asList(
                hidden.targetId(),
                hidden.targetNumber(),
                hidden.targetTypeName(),
                hidden.invoiceDate(),
                hidden.dueDate()))
        .containsOnlyNulls();
    assertThat(hidden.money().amount()).isEqualByComparingTo("25");
    assertThat(hidden.targetCancelled()).isTrue();
    assertThat(hidden.active()).isFalse();

    // ALL kapsam (allowed = null) her hedefi görür; iptal edilmiş kayıtta eşleşme etkin değil.
    SettlementAllocationResponse all = SettlementQueryService.toAllocation(visible, false, null);
    assertThat(all.outOfScope()).isFalse();
    assertThat(all.active()).isFalse();
  }

  @Test
  void satirVeAcikFaturaDonusumu() {
    SettlementLineRow line = mock(SettlementLineRow.class);
    when(line.getLedger()).thenReturn("FUND");
    when(line.getTransactionId()).thenReturn(ID);
    when(line.getDirection()).thenReturn("OUT");
    when(line.getAmount()).thenReturn(BigDecimal.TEN);
    when(line.getCurrency()).thenReturn("TRY");
    when(line.getExchangeRate()).thenReturn(BigDecimal.ONE);
    when(line.getTlAmount()).thenReturn(BigDecimal.TEN);
    when(line.getTransactionDate()).thenReturn(LocalDate.of(2026, 11, 15));
    when(line.getReversal()).thenReturn(null);
    assertThat(SettlementQueryService.toLine(line).reversal()).isFalse();

    OpenInvoiceRow invoice = mock(OpenInvoiceRow.class);
    when(invoice.getTargetType()).thenReturn("FREIGHT_INVOICE");
    when(invoice.getTotal()).thenReturn(new BigDecimal("100"));
    when(invoice.getAllocated()).thenReturn(new BigDecimal("40"));
    when(invoice.getRemaining()).thenReturn(new BigDecimal("60"));
    assertThat(SettlementQueryService.toOpenInvoice(invoice).remaining())
        .isEqualByComparingTo("60");
  }

  @Test
  void siralamaAyrisimi() {
    assertThat(SettlementQueryService.parseSort(null))
        .containsExactly(new SortKey("settlementDate", false), new SortKey("createdAt", false));
    // Tek değer Spring'de virgülden bölünür; tekrarlı değerler bölünmez.
    assertThat(SettlementQueryService.parseSort(List.of("amount", "asc")))
        .containsExactly(new SortKey("amount", true));
    assertThat(SettlementQueryService.parseSort(List.of("accountName,DESC", "documentNo")))
        .containsExactly(new SortKey("accountName", false), new SortKey("documentNo", true));
    assertThat(SettlementQueryService.parseSort(Arrays.asList(null, " ", "branchName,desc")))
        .containsExactly(new SortKey("branchName", false));
    for (List<String> invalid :
        List.of(
            List.of("foo"),
            List.of("desc"),
            List.of("amount,asc", "createdAt,asc", "documentNo,asc", "branchName,asc"))) {
      assertThatThrownBy(() -> SettlementQueryService.parseSort(invalid))
          .isInstanceOfSatisfying(
              BusinessException.class, e -> assertThat(e.getCode()).isEqualTo("SORT_INVALID"));
    }
  }

  @Test
  void ztoRotasi() {
    assertThat(SettlementQueryService.route(SettlementType.PAYMENT, ID))
        .isEqualTo("/zto-finans/odemeler?settlementId=" + ID);
    assertThat(SettlementQueryService.route(SettlementType.COLLECTION, ID))
        .isEqualTo("/zto-finans/tahsilatlar?settlementId=" + ID);
  }

  // --- yardımcılar

  /** Carili, POSTED, TRY ödeme satırı. */
  private static SettlementItemRow row(String method, String channel, String displayMethod) {
    SettlementItemRow row = mock(SettlementItemRow.class);
    when(row.getId()).thenReturn(ID);
    when(row.getType()).thenReturn("PAYMENT");
    when(row.getMethod()).thenReturn(method);
    when(row.getChannel()).thenReturn(channel);
    when(row.getDisplayMethod()).thenReturn(displayMethod);
    when(row.getAccountId()).thenReturn(ACCOUNT);
    when(row.getAccountType()).thenReturn("SUPPLIER");
    when(row.getFundKind()).thenReturn("CASH");
    when(row.getAmount()).thenReturn(new BigDecimal("100.0000"));
    when(row.getCurrency()).thenReturn("TRY");
    when(row.getStatus()).thenReturn("POSTED");
    when(row.getCreatedAt()).thenReturn(Timestamp.from(Instant.parse("2026-11-15T08:00:00Z")));
    when(row.getFxUsed()).thenReturn(null);
    return row;
  }

  private static AllocationRow allocation(UUID branch, boolean cancelled) {
    AllocationRow row = mock(AllocationRow.class);
    when(row.getId()).thenReturn(UUID.randomUUID());
    when(row.getTargetType()).thenReturn("FREIGHT_INVOICE");
    when(row.getTargetId()).thenReturn(UUID.randomUUID());
    when(row.getTargetNumber()).thenReturn("F-1");
    when(row.getTargetTypeName()).thenReturn("Navlun Faturası");
    when(row.getInvoiceDate()).thenReturn(LocalDate.of(2026, 11, 1));
    when(row.getDueDate()).thenReturn(LocalDate.of(2026, 12, 1));
    when(row.getTargetBranchId()).thenReturn(branch);
    when(row.getAmount()).thenReturn(new BigDecimal("25"));
    when(row.getCurrency()).thenReturn("TRY");
    when(row.getTargetCancelled()).thenReturn(cancelled);
    return row;
  }
}
