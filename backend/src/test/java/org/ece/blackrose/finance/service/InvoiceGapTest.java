package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.InvoiceSide;
import org.ece.blackrose.finance.repository.FinanceRepositories.InvoiceCoverageRow;
import org.ece.blackrose.finance.web.AccountDtos.AccountInvoiceGapResponse;
import org.ece.blackrose.finance.web.AccountDtos.CurrencyAmountResponse;
import org.junit.jupiter.api.Test;

/** Eksik fatura satırlarının saf mantığı (12.2 §3.7, §6.3 {@code InvoiceGapTest}). */
class InvoiceGapTest {

  private static final UUID ACCOUNT = UUID.fromString("00000000-0000-0000-0000-0000000000aa");
  private static final UUID A = UUID.fromString("00000000-0000-0000-0000-00000000000a");
  private static final UUID B = UUID.fromString("00000000-0000-0000-0000-00000000000b");

  @Test
  void kullaniciOrnegiEksikElli() {
    AccountInvoiceGapResponse gap =
        InvoiceCoverageService.gap(
            ACCOUNT, InvoiceSide.PAYABLE, A, "TRY", new BigDecimal("150"), new BigDecimal("100"));
    assertThat(gap.missing()).isEqualByComparingTo("50");
    assertThat(InvoiceCoverageService.isMissing(gap)).isTrue();
  }

  @Test
  void toleransBirBirim() {
    assertThat(InvoiceCoverageService.isMissing(gap("101", "100"))).isFalse();
    assertThat(InvoiceCoverageService.isMissing(gap("101.01", "100"))).isTrue();
    // Fatura fazlası: uyarı değil, yalnız fark satırı.
    AccountInvoiceGapResponse excess = gap("100", "130");
    assertThat(InvoiceCoverageService.isMissing(excess)).isFalse();
    assertThat(InvoiceCoverageService.isMissing(gap("100", "101"))).isFalse();
  }

  @Test
  void konsolideSatirSirketlerinToplamiVeSifirSatirlarAtilir() {
    List<AccountInvoiceGapResponse> rows =
        InvoiceCoverageService.withConsolidated(
            List.of(
                row(A, "TRY", "PAYABLE", "150", "100"),
                row(B, "TRY", "PAYABLE", "50", "0"),
                row(A, "TRY", "RECEIVABLE", "0", "0"),
                row(A, "USD", "RECEIVABLE", "20", "20")));
    assertThat(rows).hasSize(5);
    AccountInvoiceGapResponse consolidated = rows.get(0);
    assertThat(consolidated.companyId()).isNull();
    assertThat(consolidated.side()).isEqualTo(InvoiceSide.PAYABLE);
    assertThat(consolidated.ledgerTotal()).isEqualByComparingTo("200");
    assertThat(consolidated.invoiceTotal()).isEqualByComparingTo("100");
    assertThat(consolidated.missing()).isEqualByComparingTo("100");
    assertThat(rows.get(1).companyId()).isEqualTo(A);
    assertThat(rows.get(2).companyId()).isEqualTo(B);
    assertThat(rows.get(3).companyId()).isNull();
    assertThat(rows.get(3).currency()).isEqualTo("USD");
    assertThat(rows.get(4).companyId()).isEqualTo(A);
    assertThat(rows.get(4).missing()).isEqualByComparingTo("0");

    List<CurrencyAmountResponse> payable =
        InvoiceCoverageService.invoiceTotals(rows, InvoiceSide.PAYABLE);
    assertThat(payable).hasSize(1);
    assertThat(payable.get(0).currency()).isEqualTo("TRY");
    assertThat(payable.get(0).amount()).isEqualByComparingTo("100");
    List<CurrencyAmountResponse> receivable =
        InvoiceCoverageService.invoiceTotals(rows, InvoiceSide.RECEIVABLE);
    assertThat(receivable).hasSize(1);
    assertThat(receivable.get(0).currency()).isEqualTo("USD");
    assertThat(InvoiceCoverageService.withConsolidated(List.of())).isEmpty();
  }

  private static AccountInvoiceGapResponse gap(String ledger, String invoice) {
    return InvoiceCoverageService.gap(
        ACCOUNT, InvoiceSide.PAYABLE, null, "TRY", new BigDecimal(ledger), new BigDecimal(invoice));
  }

  private static InvoiceCoverageRow row(
      UUID company, String currency, String side, String ledger, String invoice) {
    InvoiceCoverageRow row = mock(InvoiceCoverageRow.class);
    when(row.getAccountId()).thenReturn(ACCOUNT);
    when(row.getCompanyId()).thenReturn(company);
    when(row.getCurrency()).thenReturn(currency);
    when(row.getSide()).thenReturn(side);
    when(row.getLedgerTotal()).thenReturn(new BigDecimal(ledger));
    when(row.getInvoiceTotal()).thenReturn(new BigDecimal(invoice));
    return row;
  }
}
