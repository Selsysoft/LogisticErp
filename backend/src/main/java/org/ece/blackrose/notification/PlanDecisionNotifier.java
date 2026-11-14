package org.ece.blackrose.notification;

import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Optional;
import java.util.function.Predicate;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.PlanStatus;
import org.ece.blackrose.finance.domain.PaymentPlan;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.service.PlanDecisionEvent;
import org.ece.blackrose.identity.domain.Permission;
import org.ece.blackrose.identity.domain.UserAccount;
import org.ece.blackrose.organization.BranchScopeService;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Ödeme planı akışının anlık e-postaları. Onaya gönderilen plan, onay yetkisi olanlara; onay ve ret
 * kararı, planı girene gider (ret gerekçesiyle).
 *
 * <p>Personel carisinin planında carinin adı yalnız {@code FINANCE_EMPLOYEE_VIEW} sahibi alıcılara
 * yazılır; diğerlerine genel "Cari" (12.1 §3.1, SEC-12.1-03). Bunun için alıcılar iki gruba
 * ayrılır.
 */
@Component
public class PlanDecisionNotifier {

  static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");

  /** İzinsiz alıcıya personel carisinin adı yerine yazılır (tür de sızdırılmaz). */
  static final String GENERIC_NAME = "Cari";

  private static final Predicate<UserAccount> EMPLOYEE_VIEW =
      user -> user.getEffectivePermissions().contains(Permission.FINANCE_EMPLOYEE_VIEW);

  private final InstantMail mail;
  private final AccountRepository accounts;
  private final BranchScopeService scope;

  public PlanDecisionNotifier(
      InstantMail mail, AccountRepository accounts, BranchScopeService scope) {
    this.mail = mail;
    this.accounts = accounts;
    this.scope = scope;
  }

  @EventListener
  public void on(PlanDecisionEvent event) {
    Optional<Account> account = accounts.findById(event.plan().getAccountId());
    if (account.map(a -> a.getType() == AccountType.EMPLOYEE).orElse(false)) {
      send(event, EMPLOYEE_VIEW, account.get().getName());
      send(event, EMPLOYEE_VIEW.negate(), GENERIC_NAME);
    } else {
      send(event, user -> true, account.map(Account::getName).orElse("—"));
    }
  }

  private void send(PlanDecisionEvent event, Predicate<UserAccount> audience, String name) {
    PaymentPlan plan = event.plan();
    String actor = event.actorEmail();
    if (event.status() == PlanStatus.PENDING) {
      mail.send(
          NotificationTopic.PAYMENT_APPROVAL,
          actor,
          // Onaycı yalnız kapsamındaki iş yerinin planını duyar.
          audience.and(user -> scope.allows(user, plan.getBranchId())),
          "Onay bekleyen ödeme planı: " + summary(plan, name),
          details(plan, name)
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
        audience.and(user -> user.getEmail().equalsIgnoreCase(plan.getCreatedBy())),
        (approved ? "Ödeme planı onaylandı: " : "Ödeme planı reddedildi: ") + summary(plan, name),
        details(plan, name)
            + (approved ? "\nOnaylayan: " : "\nReddeden: ")
            + actor
            + reason
            + (approved
                ? "\n\nÖdeme yapılabilir:\n"
                : "\n\nPlanı düzeltip yeniden onaya gönderebilirsiniz:\n")
            + mail.link("/finance/plans"));
  }

  private static String summary(PaymentPlan plan, String name) {
    return name + " — " + money(plan.getMoney());
  }

  private static String details(PaymentPlan plan, String name) {
    return "Cari: "
        + name
        + "\nTutar: "
        + money(plan.getMoney())
        + "\nVade: "
        + DATE.format(plan.getDueDate())
        + (plan.getDescription() == null ? "" : "\nAçıklama: " + plan.getDescription());
  }

  /** "12.500,00 TRY" */
  static String money(Money money) {
    DecimalFormat format =
        new DecimalFormat("#,##0.00", DecimalFormatSymbols.getInstance(new Locale("tr")));
    format.setRoundingMode(RoundingMode.HALF_UP);
    return format.format(money.amount()) + " " + money.currency();
  }
}
