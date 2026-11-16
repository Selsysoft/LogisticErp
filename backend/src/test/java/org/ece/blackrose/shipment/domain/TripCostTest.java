package org.ece.blackrose.shipment.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.shipment.domain.ShipmentTypes.CostKind;
import org.ece.blackrose.shipment.domain.ShipmentTypes.TransportMode;
import org.ece.blackrose.shipment.domain.ShipmentTypes.TripCostStatus;
import org.junit.jupiter.api.Test;

/** Taşeron sefer gideri (12.7_TASARIM §2.2): ödenecek tutar, no-op denetimi, durum geçişleri. */
class TripCostTest {

  private static final LocalDate DAY = LocalDate.of(2026, 11, 16);

  private static TripCost cost(String amount) {
    return new TripCost(
        UUID.randomUUID(),
        UUID.randomUUID(),
        CostKind.SUBCONTRACTOR,
        UUID.randomUUID(),
        null,
        Money.of(amount, "TRY"),
        new BigDecimal(amount),
        "Taşeron");
  }

  private static TripCost subcontract() {
    TripCost c = cost("1000");
    c.updateSubcontract(
        Money.of("1000", "TRY"),
        new BigDecimal("1000"),
        new BigDecimal("200"),
        new BigDecimal("40"),
        new BigDecimal("10"),
        "F-1",
        "ALIS_FATURASI",
        DAY,
        null,
        "Taşeron");
    return c;
  }

  @Test
  void yeniSatirAcikVeOdenecekNettir() {
    TripCost c = cost("500");
    assertThat(c.getStatus()).isEqualTo(TripCostStatus.OPEN);
    assertThat(c.getVatAmount()).isEqualByComparingTo("0");
    assertThat(c.getCostDate()).isNull();
    assertThat(c.payable()).isEqualByComparingTo("500");
  }

  @Test
  void odenecekNetArtiKdvEksiTevkifatEksiKesinti() {
    TripCost c = subcontract();
    assertThat(c.payable()).isEqualByComparingTo("1150");
    // amount net kalır.
    assertThat(c.getMoney().amount()).isEqualByComparingTo("1000");
    assertThat(c.getTlAmount()).isEqualByComparingTo("1000");
    assertThat(c.getDocumentNo()).isEqualTo("F-1");
    assertThat(c.getDocumentType()).isEqualTo("ALIS_FATURASI");
    assertThat(c.getCostDate()).isEqualTo(DAY);
  }

  @Test
  void ayniTaseronAlanlariNoOpSayilir() {
    TripCost c = subcontract();
    assertThat(
            c.sameSubcontract(
                Money.of("1000.00", "TRY"),
                new BigDecimal("200.0"),
                new BigDecimal("40"),
                new BigDecimal("10"),
                "F-1",
                "ALIS_FATURASI",
                DAY,
                null,
                "Taşeron"))
        .isTrue();
    assertThat(
            c.sameSubcontract(
                Money.of("1000", "TRY"),
                new BigDecimal("200"),
                new BigDecimal("40"),
                new BigDecimal("11"),
                "F-1",
                "ALIS_FATURASI",
                DAY,
                null,
                "Taşeron"))
        .isFalse();
    assertThat(
            c.sameSubcontract(
                Money.of("1000", "EUR"),
                new BigDecimal("200"),
                new BigDecimal("40"),
                new BigDecimal("10"),
                "F-1",
                "ALIS_FATURASI",
                DAY,
                null,
                "Taşeron"))
        .isFalse();
    assertThat(
            c.sameSubcontract(
                Money.of("1000", "TRY"),
                new BigDecimal("200"),
                new BigDecimal("40"),
                new BigDecimal("10"),
                "F-2",
                "ALIS_FATURASI",
                DAY.plusDays(1),
                null,
                "Taşeron"))
        .isFalse();
    // Verilen kur kayıtlı kurdan farklıysa değişiklik sayılır.
    assertThat(
            c.sameSubcontract(
                Money.of("1000", "TRY"),
                new BigDecimal("200"),
                new BigDecimal("40"),
                new BigDecimal("10"),
                "F-1",
                "ALIS_FATURASI",
                DAY,
                new BigDecimal("1.5"),
                "Taşeron"))
        .isFalse();
  }

  @Test
  void yazilanSatirGuncellenmezVeTersCevrilir() {
    TripCost c = subcontract();
    Instant now = Instant.parse("2026-11-16T09:00:00Z");
    c.markPosted(now);
    assertThat(c.getStatus()).isEqualTo(TripCostStatus.POSTED);
    assertThat(c.isPosted()).isTrue();
    assertThat(c.getPostedAt()).isEqualTo(now);
    assertThatThrownBy(
            () ->
                c.updateSubcontract(
                    Money.of("1", "TRY"),
                    BigDecimal.ONE,
                    null,
                    null,
                    null,
                    null,
                    null,
                    DAY,
                    null,
                    null))
        .isInstanceOf(IllegalStateException.class);

    UUID replacement = UUID.randomUUID();
    c.reverse(DAY, "Tutar düzeltildi", replacement);
    assertThat(c.getStatus()).isEqualTo(TripCostStatus.REVERSED);
    assertThat(c.isDeleted()).isTrue();
    assertThat(c.getReversedOn()).isEqualTo(DAY);
    assertThat(c.getReverseReason()).isEqualTo("Tutar düzeltildi");
    assertThat(c.getReplacedById()).isEqualTo(replacement);
    assertThat(c.isPosted()).isFalse();

    // İkinci ters çevirme bir şey yapmaz.
    c.reverse(DAY.plusDays(1), "x", null);
    assertThat(c.getReversedOn()).isEqualTo(DAY);
    assertThat(c.getReplacedById()).isEqualTo(replacement);
  }

  @Test
  void etabinNakliyeTuruVarsayilanKarayolu() {
    ShipmentLeg leg =
        new ShipmentLeg(
            UUID.randomUUID(),
            1,
            "İstanbul",
            "Mersin",
            Instant.parse("2026-11-16T09:00:00Z"),
            Instant.parse("2026-11-17T09:00:00Z"));
    assertThat(leg.getTransportMode()).isEqualTo(TransportMode.ROAD);
    leg.changeTransportMode(TransportMode.SEA);
    assertThat(leg.getTransportMode()).isEqualTo(TransportMode.SEA);
    leg.changeTransportMode(null);
    assertThat(leg.getTransportMode()).isEqualTo(TransportMode.ROAD);
  }
}
