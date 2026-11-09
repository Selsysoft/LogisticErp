package org.ece.blackrose.notification;

import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.ece.blackrose.finance.domain.FinanceTypes.PlanStatus;
import org.ece.blackrose.finance.domain.PaymentPlan;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.service.PlanDecisionEvent;
import org.ece.blackrose.identity.domain.UserAccount;
import org.ece.blackrose.identity.domain.UserStatus;
import org.ece.blackrose.identity.repository.IdentityRepositories.UserAccountRepository;
import org.ece.blackrose.identity.security.SecurityProperties;
import org.ece.blackrose.identity.service.AccountMailer;
import org.ece.blackrose.notification.NotificationRepositories.NotificationPreferenceRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Ödeme planı akışının anlık e-postaları. Onaya gönderilen plan, onay yetkisi olanlara; onay ve ret
 * kararı, planı girene gider. İşlemi yapan kişiye gitmez. Kullanıcı konuyu Hesabım'dan kapattıysa
 * gitmez. Alıcılar işlemin içinde belirlenir, e-posta işlem kaydedildikten sonra arka planda gider.
 */
@Component
public class PlanDecisionNotifier {

  /** İşlem sonrası gönderilecek e-posta; veritabanı veya firma bağlamı gerekmez. */
  public record PlanMail(List<String> recipients, String subject, String text) {}

  private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");

  private final UserAccountRepository users;
  private final NotificationPreferenceRepository preferences;
  private final AccountRepository accounts;
  private final SecurityProperties properties;
  private final AccountMailer mailer;
  private final ApplicationEventPublisher publisher;

  public PlanDecisionNotifier(
      UserAccountRepository users,
      NotificationPreferenceRepository preferences,
      AccountRepository accounts,
      SecurityProperties properties,
      AccountMailer mailer,
      ApplicationEventPublisher publisher) {
    this.users = users;
    this.preferences = preferences;
    this.accounts = accounts;
    this.properties = properties;
    this.mailer = mailer;
    this.publisher = publisher;
  }

  @EventListener
  public void on(PlanDecisionEvent event) {
    PaymentPlan plan = event.plan();
    String actor = event.actorEmail();
    if (event.status() == PlanStatus.PENDING) {
      List<String> approvers = recipients(NotificationTopic.PAYMENT_APPROVAL, actor, null);
      if (!approvers.isEmpty()) {
        publisher.publishEvent(
            new PlanMail(
                approvers,
                "Onay bekleyen ödeme planı: " + summary(plan),
                details(plan)
                    + "\nOnaya gönderen: "
                    + actor
                    + "\n\nOnaylamak veya reddetmek için:\n"
                    + link()));
      }
      return;
    }
    boolean approved = event.status() == PlanStatus.APPROVED;
    List<String> creator = recipients(NotificationTopic.PLAN_DECISION, actor, plan.getCreatedBy());
    if (creator.isEmpty()) {
      return;
    }
    String reason =
        event.note() == null || event.note().isBlank()
            ? ""
            : (approved ? "\nNot: " : "\nRet gerekçesi: ") + event.note();
    publisher.publishEvent(
        new PlanMail(
            creator,
            (approved ? "Ödeme planı onaylandı: " : "Ödeme planı reddedildi: ") + summary(plan),
            details(plan)
                + (approved ? "\nOnaylayan: " : "\nReddeden: ")
                + actor
                + reason
                + (approved
                    ? "\n\nÖdeme yapılabilir:\n"
                    : "\n\nPlanı düzeltip yeniden onaya gönderebilirsiniz:\n")
                + link()));
  }

  @Async
  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void send(PlanMail mail) {
    String text =
        mail.text() + "\n\nHangi e-postaları alacağınızı Hesabım ekranından seçebilirsiniz.\n";
    mail.recipients().forEach(email -> mailer.sendNotice(email, mail.subject(), text));
  }

  /**
   * Etkin, konunun yetkisine sahip, konuyu kapatmamış kullanıcılar; işlemi yapan hariç. only
   * verilirse yalnız o adres değerlendirilir.
   */
  private List<String> recipients(NotificationTopic topic, String actor, String only) {
    Set<UUID> optedOut =
        preferences.findByEmailFalse().stream()
            .filter(preference -> preference.getTopic() == topic)
            .map(NotificationPreference::getUserId)
            .collect(Collectors.toSet());
    return users.findByStatus(UserStatus.ACTIVE).stream()
        .filter(user -> only == null || user.getEmail().equalsIgnoreCase(only))
        .filter(user -> actor == null || !user.getEmail().equalsIgnoreCase(actor))
        .filter(user -> user.getEffectivePermissions().contains(topic.getPermission()))
        .filter(user -> !optedOut.contains(user.getId()))
        .map(UserAccount::getEmail)
        .sorted()
        .toList();
  }

  private String summary(PaymentPlan plan) {
    return accountName(plan) + " — " + money(plan);
  }

  private String details(PaymentPlan plan) {
    return "Cari: "
        + accountName(plan)
        + "\nTutar: "
        + money(plan)
        + "\nVade: "
        + DATE.format(plan.getDueDate())
        + (plan.getDescription() == null ? "" : "\nAçıklama: " + plan.getDescription());
  }

  private String accountName(PaymentPlan plan) {
    return accounts.findById(plan.getAccountId()).map(a -> a.getName()).orElse("—");
  }

  static String money(PaymentPlan plan) {
    DecimalFormat format =
        new DecimalFormat("#,##0.00", DecimalFormatSymbols.getInstance(new Locale("tr")));
    format.setRoundingMode(RoundingMode.HALF_UP);
    return format.format(plan.getMoney().amount()) + " " + plan.getMoney().currency();
  }

  private String link() {
    return properties.frontendBaseUrl() + "/finance/plans";
  }
}
