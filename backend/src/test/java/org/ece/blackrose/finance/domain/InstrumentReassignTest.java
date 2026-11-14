package org.ece.blackrose.finance.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentSide;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountTransferStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.ece.blackrose.finance.domain.FinanceTypes.DocumentAudience;
import org.ece.blackrose.finance.domain.FinanceTypes.DocumentPaymentMethod;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentMovementType;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.junit.jupiter.api.Test;

/** Cari taşımanın çek/senet alanları ve 12.1 entity'lerinin durum geçişleri. */
class InstrumentReassignTest {

  private static final UUID FROM = UUID.randomUUID();
  private static final UUID TO = UUID.randomUUID();
  private static final UUID COMPANY = UUID.randomUUID();
  private static final LocalDate DAY = LocalDate.of(2026, 11, 14);

  @Test
  void kesideciYalnizKaynakCarideyseTasinir() {
    Instrument check = check();

    assertThat(check.reassignAccount(TO, FROM)).isFalse();
    assertThat(check.getAccountId()).isEqualTo(FROM);
    assertThat(check.reassignAccount(null, TO)).isFalse();
    assertThat(check.reassignAccount(FROM, TO)).isTrue();
    assertThat(check.getAccountId()).isEqualTo(TO);
    // Şirket, durum ve fon değişmez.
    assertThat(check.getCompanyId()).isEqualTo(COMPANY);
    assertThat(check.getStatus()).isEqualTo(InstrumentStatus.ENDORSED);
    assertThat(check.getFundAccountId()).isNull();
  }

  @Test
  void lehtarYalnizKaynakCarideyseTasinir() {
    Instrument check = check();

    assertThat(check.reassignEndorsee(FROM, TO)).isFalse();
    check.endorseTo(FROM);
    assertThat(check.reassignEndorsee(TO, FROM)).isFalse();
    assertThat(check.reassignEndorsee(FROM, TO)).isTrue();
    assertThat(check.getEndorsedAccountId()).isEqualTo(TO);
    assertThat(check.getAccountId()).isEqualTo(FROM);
  }

  @Test
  void tasimaHareketiDurumuDegistirmez() {
    UUID transfer = UUID.randomUUID();
    UUID instrument = UUID.randomUUID();
    InstrumentMovement movement =
        InstrumentMovement.transferred(
            instrument, InstrumentStatus.PORTFOLIO, DAY, FROM, TO, transfer, "Cari taşıma");

    assertThat(movement.getMovementType()).isEqualTo(InstrumentMovementType.TRANSFERRED);
    assertThat(movement.getFromStatus()).isEqualTo(InstrumentStatus.PORTFOLIO);
    assertThat(movement.getToStatus()).isEqualTo(InstrumentStatus.PORTFOLIO);
    assertThat(movement.getFromAccountId()).isEqualTo(FROM);
    assertThat(movement.getToAccountId()).isEqualTo(TO);
    assertThat(movement.getAccountTransferId()).isEqualTo(transfer);
    assertThat(movement.getInstrumentId()).isEqualTo(instrument);
    assertThat(movement.getMovementDate()).isEqualTo(DAY);

    InstrumentMovement status =
        new InstrumentMovement(instrument, null, InstrumentStatus.PORTFOLIO, DAY, null);
    assertThat(status.getMovementType()).isEqualTo(InstrumentMovementType.STATUS);
    assertThat(status.getFromAccountId()).isNull();
  }

  @Test
  void belgeIptaliBirKezYapilirVeYonuTarafaGoredir() {
    AccountDocument receivable = document(AccountDocumentSide.RECEIVABLE, true);
    AccountDocument payable = document(AccountDocumentSide.PAYABLE, false);

    assertThat(receivable.ledgerDirection()).isEqualTo(Direction.DEBIT);
    assertThat(payable.ledgerDirection()).isEqualTo(Direction.CREDIT);
    assertThat(receivable.getLedgerAmount()).isEqualByComparingTo("90");
    assertThat(payable.getLedgerAmount()).isNull();
    assertThat(receivable.getStatus()).isEqualTo(AccountDocumentStatus.OPEN);
    receivable.cancel(DAY, "Hatalı");
    assertThat(receivable.getStatus()).isEqualTo(AccountDocumentStatus.CANCELLED);
    assertThat(receivable.getCancelDate()).isEqualTo(DAY);
    assertThat(receivable.getCancelReason()).isEqualTo("Hatalı");
    assertThatThrownBy(() -> receivable.cancel(DAY, "tekrar"))
        .isInstanceOf(BusinessException.class)
        .hasMessage("Belge zaten iptal edilmiş.");
  }

  @Test
  void tasimaBirKezGeriAlinir() {
    AccountTransfer transfer = new AccountTransfer(FROM, TO, DAY, "not", "k-1");

    assertThat(transfer.getStatus()).isEqualTo(AccountTransferStatus.POSTED);
    transfer.reverse(DAY.plusDays(1));
    assertThat(transfer.getStatus()).isEqualTo(AccountTransferStatus.REVERSED);
    assertThat(transfer.getReverseDate()).isEqualTo(DAY.plusDays(1));
    assertThatThrownBy(() -> transfer.reverse(DAY))
        .isInstanceOf(BusinessException.class)
        .hasMessage("Cari taşıma zaten geri alınmış.");
  }

  @Test
  void tasinanCekEnAzBirAlanTasimalidir() {
    assertThatThrownBy(() -> new AccountTransferInstrument(UUID.randomUUID(), TO, false, false))
        .isInstanceOf(IllegalArgumentException.class);
    AccountTransferInstrument moved =
        new AccountTransferInstrument(UUID.randomUUID(), TO, true, false);
    assertThat(moved.isReverted()).isFalse();
    moved.markReverted();
    assertThat(moved.isReverted()).isTrue();
  }

  @Test
  void devirSilinipGeriGetirilincePasifKalir() {
    AccountRollover season = new AccountRollover(FROM, DAY, "2026");
    season.activate();
    season.update(DAY.plusDays(1), "2026-2027");
    assertThat(season.getUpdateCount()).isEqualTo(1);

    season.softDelete("a@b.test", java.time.Instant.EPOCH);
    assertThat(season.isActive()).isFalse();
    assertThat(season.isDeleted()).isTrue();
    assertThat(season.getDeletedBy()).isEqualTo("a@b.test");

    season.restore();
    assertThat(season.isDeleted()).isFalse();
    assertThat(season.getDeletedAt()).isNull();
    assertThat(season.isActive()).isFalse();
  }

  @Test
  void belgeTuruKitlesi() {
    assertThat(allowed(DocumentAudience.ALL, AccountType.EMPLOYEE)).isTrue();
    assertThat(allowed(DocumentAudience.CUSTOMER, AccountType.CUSTOMER)).isTrue();
    assertThat(allowed(DocumentAudience.CUSTOMER, AccountType.SUPPLIER)).isFalse();
    assertThat(allowed(DocumentAudience.OTHER, AccountType.CUSTOMER)).isFalse();
    assertThat(allowed(DocumentAudience.OTHER, AccountType.CARRIER)).isTrue();
  }

  private static boolean allowed(DocumentAudience audience, AccountType type) {
    AccountDocumentType documentType = new AccountDocumentType();
    org.springframework.test.util.ReflectionTestUtils.setField(documentType, "audience", audience);
    return documentType.allowedFor(type);
  }

  private static AccountDocument document(AccountDocumentSide side, boolean reflect) {
    return new AccountDocument(
        FROM,
        UUID.randomUUID(),
        COMPANY,
        side,
        "DIGER",
        "B-1",
        DAY,
        null,
        Money.of("100", "TRY"),
        null,
        DocumentPaymentMethod.CASH,
        null,
        reflect,
        new java.math.BigDecimal("90"),
        null);
  }

  private static Instrument check() {
    return new Instrument(
        InstrumentKind.CHECK,
        InstrumentDirection.RECEIVED,
        "C-1",
        "Banka",
        FROM,
        UUID.randomUUID(),
        COMPANY,
        Money.of("100", "TRY"),
        DAY,
        InstrumentStatus.ENDORSED);
  }
}
