package org.ece.blackrose.notification;

import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.FinanceTypes.PlanStatus;
import org.ece.blackrose.finance.domain.PaymentPlan;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.service.PlanDecisionEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Ödeme planı akışının anlık e-postaları. Onaya gönderilen plan, onay yetkisi olanlara; onay ve ret
 * kararı, planı girene gider (ret gerekçesiyle).
 */
@Component
public class PlanDecisionNotifier {

  static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");

  private final InstantMail mail;
  private final AccountRepository accounts;

  public PlanDecisionNotifier(InstantMail mail, AccountRepository accounts) {
    this.mail = mail;
    this.accounts = accounts;
  }

  @EventListener
  public void on(PlanDecisionEvent event) {
    PaymentPlan plan = event.plan();
    String actor = event.actorEmail();
    if (event.status() == PlanStatus.PENDING) {
      mail.send(
          NotificationTopic.PAYMENT_APPROVAL,
          actor,
          user -> true,
          "Onay bekleyen ödeme planı: " + summary(plan),
          details(plan)
              + "\nOnaya gönderen: "
              + actor
              + "\n\nOnaylamak veya reddetmek için:\n"
              + mail.link("/finance/plans"));
      return;
    }
    boolean approved = event.status() == PlanStatus.APPROVED;
    String reason =
        event.note() == null || event.note().isBlank()
            ? ""
            : (approved ? "\nNot: " : "\nRet gerekçesi: ") + event.note();
    mail.send(
        NotificationTopic.PLAN_DECISION,
        actor,
        user -> user.getEmail().equalsIgnoreCase(plan.getCreatedBy()),
        (approved ? "Ödeme planı onaylandı: " : "Ödeme planı reddedildi: ") + summary(plan),
        details(plan)
            + (approved ? "\nOnaylayan: " : "\nReddeden: ")
            + actor
            + reason
            + (approved
                ? "\n\nÖdeme yapılabilir:\n"
                : "\n\nPlanı düzeltip yeniden onaya gönderebilirsiniz:\n")
            + mail.link("/finance/plans"));
  }

  private String summary(PaymentPlan plan) {
    return accountName(plan) + " — " + money(plan.getMoney());
  }

  private String details(PaymentPlan plan) {
    return "Cari: "
        + accountName(plan)
        + "\nTutar: "
        + money(plan.getMoney())
        + "\nVade: "
        + DATE.format(plan.getDueDate())
        + (plan.getDescription() == null ? "" : "\nAçıklama: " + plan.getDescription());
  }

  private String accountName(PaymentPlan plan) {
    return accounts.findById(plan.getAccountId()).map(a -> a.getName()).orElse("—");
  }

  /** "12.500,00 TRY" */
  static String money(Money money) {
    DecimalFormat format =
        new DecimalFormat("#,##0.00", DecimalFormatSymbols.getInstance(new Locale("tr")));
    format.setRoundingMode(RoundingMode.HALF_UP);
    return format.format(money.amount()) + " " + money.currency();
  }
}
