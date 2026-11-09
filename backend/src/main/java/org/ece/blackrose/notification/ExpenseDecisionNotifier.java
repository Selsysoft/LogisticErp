package org.ece.blackrose.notification;

import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.driverapp.domain.DriverExpense;
import org.ece.blackrose.driverapp.service.DriverExpenseEvent;
import org.ece.blackrose.fleet.domain.Driver;
import org.ece.blackrose.fleet.repository.FleetRepositories.DriverRepository;
import org.ece.blackrose.shipment.domain.ShipmentTypes.CostKind;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentRepository;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Sürücü masrafının anlık e-postaları. Girilen masraf, sefer yetkisi olanlara (onaylayacak ofis);
 * onay ve ret kararı, sürücünün bağlı hesabına gider (ret gerekçesiyle).
 */
@Component
public class ExpenseDecisionNotifier {

  private static final Map<CostKind, String> KINDS =
      Map.of(
          CostKind.FUEL, "Yakıt",
          CostKind.TOLL, "Geçiş",
          CostKind.PER_DIEM, "Harcırah",
          CostKind.SUBCONTRACTOR, "Taşeron",
          CostKind.BORDER_FEE, "Sınır geçişi",
          CostKind.OTHER, "Diğer");

  private final InstantMail mail;
  private final DriverRepository drivers;
  private final ShipmentRepository shipments;

  public ExpenseDecisionNotifier(
      InstantMail mail, DriverRepository drivers, ShipmentRepository shipments) {
    this.mail = mail;
    this.drivers = drivers;
    this.shipments = shipments;
  }

  @EventListener
  public void on(DriverExpenseEvent event) {
    DriverExpense expense = event.expense();
    Driver driver = drivers.findById(expense.getDriverId()).orElse(null);
    if (driver == null) {
      return;
    }
    String summary =
        KINDS.getOrDefault(expense.getKind(), expense.getKind().name())
            + " — "
            + PlanDecisionNotifier.money(new Money(expense.getAmount(), expense.getCurrency()));
    String details =
        "Sürücü: "
            + driver.getFullName()
            + "\nSefer: "
            + shipments.findById(expense.getShipmentId()).map(s -> s.getNumber()).orElse("—")
            + "\nTür: "
            + KINDS.getOrDefault(expense.getKind(), expense.getKind().name())
            + "\nTutar: "
            + PlanDecisionNotifier.money(new Money(expense.getAmount(), expense.getCurrency()))
            + "\nTarih: "
            + PlanDecisionNotifier.DATE.format(expense.getExpenseDate())
            + (expense.getDescription() == null ? "" : "\nAçıklama: " + expense.getDescription());

    if (expense.getStatus() == DriverExpense.Status.PENDING) {
      mail.send(
          NotificationTopic.DRIVER_EXPENSE_APPROVAL,
          event.actorEmail(),
          user -> true,
          "Onay bekleyen sürücü masrafı: " + driver.getFullName() + " — " + summary,
          details
              + "\n\nOnaylamak veya reddetmek için:\n"
              + mail.link("/operations/driver-expenses"));
      return;
    }
    UUID driverUser = driver.getUserId();
    if (driverUser == null) {
      return;
    }
    boolean approved = expense.getStatus() == DriverExpense.Status.APPROVED;
    mail.send(
        NotificationTopic.EXPENSE_DECISION,
        event.actorEmail(),
        user -> user.getId().equals(driverUser),
        (approved ? "Masrafınız onaylandı: " : "Masrafınız reddedildi: ") + summary,
        details
            + (approved
                ? "\n\nMasraf sefer giderine yazıldı."
                : "\nRet gerekçesi: " + expense.getReviewNote())
            + "\n\nMasraflarınız:\n"
            + mail.link("/driver/expenses"));
  }
}
