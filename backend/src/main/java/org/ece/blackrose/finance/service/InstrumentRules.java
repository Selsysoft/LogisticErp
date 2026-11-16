package org.ece.blackrose.finance.service;

import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.ece.blackrose.finance.domain.FinanceTypes.SettlementType;

/**
 * Çek/senet geçiş kuralları (saf, Spring'siz; 12.3_TASARIM §2.1, §3.1, §3.4). Tablo dışındaki her
 * geçiş reddedilir.
 */
public final class InstrumentRules {

  private static final Set<InstrumentStatus> OPEN =
      EnumSet.of(
          InstrumentStatus.PORTFOLIO,
          InstrumentStatus.AT_BANK,
          InstrumentStatus.ENDORSED,
          InstrumentStatus.ISSUED,
          InstrumentStatus.COLLATERAL);

  private InstrumentRules() {}

  /**
   * Kullanıcı geçişleri (§3.1). {@code ENDORSED} ve {@code CANCELLED} hiçbir zaman dönmez: ikisi
   * yalnız ödeme/iptal yolundan gelir. {@code BOUNCED} yalnız çekte, {@code PROTESTED} ve {@code
   * COLLATERAL} yalnız senette.
   */
  public static Set<InstrumentStatus> allowedTargets(
      InstrumentKind kind, InstrumentDirection direction, InstrumentStatus from) {
    boolean note = kind == InstrumentKind.NOTE;
    InstrumentStatus dishonour = note ? InstrumentStatus.PROTESTED : InstrumentStatus.BOUNCED;
    if (direction == InstrumentDirection.ISSUED) {
      return from == InstrumentStatus.ISSUED
          ? EnumSet.of(InstrumentStatus.PAID, dishonour)
          : EnumSet.noneOf(InstrumentStatus.class);
    }
    return switch (from) {
      case PORTFOLIO -> {
        EnumSet<InstrumentStatus> targets =
            EnumSet.of(
                InstrumentStatus.AT_BANK,
                InstrumentStatus.COLLECTED,
                InstrumentStatus.COLLECTED_TO_CASH,
                InstrumentStatus.RETURNED);
        if (note) {
          targets.add(InstrumentStatus.COLLATERAL);
          targets.add(InstrumentStatus.PROTESTED);
        }
        yield targets;
      }
      case AT_BANK -> EnumSet.of(InstrumentStatus.COLLECTED, dishonour, InstrumentStatus.PORTFOLIO);
      case ENDORSED -> EnumSet.of(dishonour);
      case COLLATERAL ->
          note ? EnumSet.of(InstrumentStatus.PORTFOLIO) : EnumSet.noneOf(InstrumentStatus.class);
      default -> EnumSet.noneOf(InstrumentStatus.class);
    };
  }

  /** Ciro yalnız portföydeki çekten ({@code PORTFOLIO → ENDORSED}; ödeme yolundan). */
  public static boolean canEndorse(InstrumentStatus status) {
    return status == InstrumentStatus.PORTFOLIO;
  }

  /**
   * Kayıt çeki doğuran köken kayıt mı: alınan çekte tahsilat, verilen çekte ödeme. {@code PAYMENT +
   * RECEIVED} ciro kaydıdır.
   */
  public static boolean isOrigin(SettlementType type, InstrumentDirection direction) {
    return (type == SettlementType.COLLECTION && direction == InstrumentDirection.RECEIVED)
        || (type == SettlementType.PAYMENT && direction == InstrumentDirection.ISSUED);
  }

  /**
   * Çekli kayıt iptal/düzeltilebilir mi (§3.4): köken + alınan → {@code PORTFOLIO|AT_BANK}; köken +
   * verilen → {@code ISSUED}; ciro → çek hâlâ bu kaydın carisine cirolu.
   */
  public static boolean settlementReversible(
      SettlementType type,
      InstrumentDirection direction,
      InstrumentStatus status,
      UUID endorsedAccountId,
      UUID settlementAccountId) {
    if (isOrigin(type, direction)) {
      return direction == InstrumentDirection.RECEIVED
          ? status == InstrumentStatus.PORTFOLIO || status == InstrumentStatus.AT_BANK
          : status == InstrumentStatus.ISSUED;
    }
    if (type == SettlementType.PAYMENT && direction == InstrumentDirection.RECEIVED) {
      return status == InstrumentStatus.ENDORSED
          && endorsedAccountId != null
          && endorsedAccountId.equals(settlementAccountId);
    }
    return false;
  }

  /** Açık (son durum olmayan) çek/senet: vade düzenlenebilir, raporlarda açık sayılır. */
  public static boolean isOpen(InstrumentStatus status) {
    return OPEN.contains(status);
  }
}
