package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus.AT_BANK;
import static org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus.BOUNCED;
import static org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus.CANCELLED;
import static org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus.COLLATERAL;
import static org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus.COLLECTED;
import static org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus.COLLECTED_TO_CASH;
import static org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus.ENDORSED;
import static org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus.ISSUED;
import static org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus.PAID;
import static org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus.PORTFOLIO;
import static org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus.PROTESTED;
import static org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus.RETURNED;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

/** 12.3_TASARIM §3.1 geçiş tablosu, §3.4 iptal kuralı, §2.1 açık durumlar (12 × 2 × 2 matris). */
class InstrumentRulesTest {

  private static final InstrumentDirection R = InstrumentDirection.RECEIVED;
  private static final InstrumentDirection I = InstrumentDirection.ISSUED;
  private static final InstrumentKind CHECK = InstrumentKind.CHECK;
  private static final InstrumentKind NOTE = InstrumentKind.NOTE;

  @Test
  void durumSayisiOnIkiVeYeniDurumlarSonda() {
    InstrumentStatus[] values = InstrumentStatus.values();
    assertThat(values).hasSize(12);
    assertThat(values[8]).isEqualTo(CANCELLED);
    assertThat(values[11]).isEqualTo(PROTESTED);
  }

  @Test
  void alinanCekTablosu() {
    Map<InstrumentStatus, Set<InstrumentStatus>> expected = empty();
    expected.put(PORTFOLIO, EnumSet.of(AT_BANK, COLLECTED, COLLECTED_TO_CASH, RETURNED));
    expected.put(AT_BANK, EnumSet.of(COLLECTED, BOUNCED, PORTFOLIO));
    expected.put(ENDORSED, EnumSet.of(BOUNCED));
    assertTable(CHECK, R, expected);
  }

  @Test
  void alinanSenetTablosu() {
    Map<InstrumentStatus, Set<InstrumentStatus>> expected = empty();
    expected.put(
        PORTFOLIO,
        EnumSet.of(AT_BANK, COLLECTED, COLLECTED_TO_CASH, RETURNED, COLLATERAL, PROTESTED));
    expected.put(AT_BANK, EnumSet.of(COLLECTED, PROTESTED, PORTFOLIO));
    expected.put(ENDORSED, EnumSet.of(PROTESTED));
    expected.put(COLLATERAL, EnumSet.of(PORTFOLIO));
    assertTable(NOTE, R, expected);
  }

  @Test
  void verilenCekVeSenetTablosu() {
    Map<InstrumentStatus, Set<InstrumentStatus>> check = empty();
    check.put(ISSUED, EnumSet.of(PAID, BOUNCED));
    assertTable(CHECK, I, check);
    Map<InstrumentStatus, Set<InstrumentStatus>> note = empty();
    note.put(ISSUED, EnumSet.of(PAID, PROTESTED));
    assertTable(NOTE, I, note);
  }

  @ParameterizedTest
  @EnumSource(InstrumentStatus.class)
  void cirolamaVeIptalHicbirZamanKullaniciGecisiDegil(InstrumentStatus from) {
    for (InstrumentKind kind : InstrumentKind.values()) {
      for (InstrumentDirection direction : InstrumentDirection.values()) {
        assertThat(InstrumentRules.allowedTargets(kind, direction, from))
            .doesNotContain(ENDORSED, CANCELLED);
      }
    }
    assertThat(InstrumentRules.canEndorse(from)).isEqualTo(from == PORTFOLIO);
  }

  @Test
  void kokenKaydi() {
    assertThat(InstrumentRules.isOrigin(SettlementType.COLLECTION, R)).isTrue();
    assertThat(InstrumentRules.isOrigin(SettlementType.PAYMENT, I)).isTrue();
    assertThat(InstrumentRules.isOrigin(SettlementType.PAYMENT, R)).isFalse();
    assertThat(InstrumentRules.isOrigin(SettlementType.COLLECTION, I)).isFalse();
  }

  @ParameterizedTest
  @EnumSource(InstrumentStatus.class)
  void kayitIptaliTumDallar(InstrumentStatus status) {
    UUID supplier = UUID.randomUUID();
    assertThat(
            InstrumentRules.settlementReversible(SettlementType.COLLECTION, R, status, null, null))
        .isEqualTo(status == PORTFOLIO || status == AT_BANK);
    assertThat(InstrumentRules.settlementReversible(SettlementType.PAYMENT, I, status, null, null))
        .isEqualTo(status == ISSUED);
    assertThat(
            InstrumentRules.settlementReversible(
                SettlementType.PAYMENT, R, status, supplier, supplier))
        .isEqualTo(status == ENDORSED);
    // Ciro başka cariye (ör. ciro iptal edilip yeniden cirolandı) ya da ciro bilgisi yok.
    assertThat(
            InstrumentRules.settlementReversible(
                SettlementType.PAYMENT, R, status, UUID.randomUUID(), supplier))
        .isFalse();
    assertThat(InstrumentRules.settlementReversible(SettlementType.PAYMENT, R, status, null, null))
        .isFalse();
    // Tahsilat + verilen çek hiçbir zaman çeki bağlamaz.
    assertThat(
            InstrumentRules.settlementReversible(SettlementType.COLLECTION, I, status, null, null))
        .isFalse();
  }

  @ParameterizedTest
  @EnumSource(InstrumentStatus.class)
  void acikDurumlar(InstrumentStatus status) {
    assertThat(InstrumentRules.isOpen(status))
        .isEqualTo(EnumSet.of(PORTFOLIO, AT_BANK, ENDORSED, ISSUED, COLLATERAL).contains(status));
  }

  private static Map<InstrumentStatus, Set<InstrumentStatus>> empty() {
    Map<InstrumentStatus, Set<InstrumentStatus>> table = new EnumMap<>(InstrumentStatus.class);
    for (InstrumentStatus status : InstrumentStatus.values()) {
      table.put(status, EnumSet.noneOf(InstrumentStatus.class));
    }
    return table;
  }

  private static void assertTable(
      InstrumentKind kind,
      InstrumentDirection direction,
      Map<InstrumentStatus, Set<InstrumentStatus>> expected) {
    for (InstrumentStatus from : InstrumentStatus.values()) {
      assertThat(InstrumentRules.allowedTargets(kind, direction, from))
          .as("%s %s %s", kind, direction, from)
          .containsExactlyInAnyOrderElementsOf(expected.get(from));
    }
  }
}
