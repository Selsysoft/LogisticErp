package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.ece.blackrose.finance.domain.FinanceTypes.IntercompanyReason;
import org.junit.jupiter.api.Test;

/**
 * Şirketler arası virman neden metni (12.2_TASARIM §3.4.1 adım 8; ZTO {@code
 * updateTransferReasonDropdownTexts}, iş yeri yerine şirket kısa adı).
 */
class IntercompanyDescriptionTest {

  @Test
  void borcOdeme() {
    assertThat(IntercompanyTransferService.reasonText(IntercompanyReason.DEBT_PAID, "Alfa", "Beta"))
        .isEqualTo("Alfa - Beta 'YE BORCUNU ÖDÜYOR / Beta - Alfa 'TAN ALACAĞINI TAHSİL EDİYOR");
  }

  @Test
  void borcVerme() {
    assertThat(
            IntercompanyTransferService.reasonText(IntercompanyReason.LOAN_GIVEN, "Alfa", "Beta"))
        .isEqualTo("Alfa - Beta 'YE BORÇ VERİYOR / Beta - Alfa 'TAN BORÇ ALIYOR");
  }

  @Test
  void uzunMetin500eKisaltilir() {
    String name = "Ş".repeat(100);
    String text =
        LedgerDescriptions.fit(
            IntercompanyTransferService.reasonText(IntercompanyReason.DEBT_PAID, name, name)
                + " — "
                + "x".repeat(500));
    assertThat(text).hasSize(500).endsWith("...");
  }
}
