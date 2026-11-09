package org.ece.blackrose.notification;

import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import org.ece.blackrose.identity.domain.UserAccount;
import org.ece.blackrose.identity.domain.UserStatus;
import org.ece.blackrose.identity.repository.IdentityRepositories.UserAccountRepository;
import org.ece.blackrose.identity.security.SecurityProperties;
import org.ece.blackrose.identity.service.AccountMailer;
import org.ece.blackrose.notification.NotificationRepositories.NotificationPreferenceRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Kullanıcılara anlık e-posta. Alıcılar işlemin içinde belirlenir: etkin, konunun yetkisine sahip,
 * konuyu Hesabım'dan kapatmamış kullanıcılar; işlemi yapan kişi hariç. E-posta işlem kaydedildikten
 * sonra arka planda gider; işlem geri alınırsa gitmez.
 */
@Component
public class InstantMail {

  /** İşlem sonrası gönderilecek e-posta; veritabanı veya firma bağlamı gerekmez. */
  public record Pending(List<String> recipients, String subject, String text) {}

  private static final String FOOTER =
      "\n\nHangi e-postaları alacağınızı Hesabım ekranından seçebilirsiniz.\n";

  private final UserAccountRepository users;
  private final NotificationPreferenceRepository preferences;
  private final SecurityProperties properties;
  private final AccountMailer mailer;
  private final ApplicationEventPublisher publisher;

  public InstantMail(
      UserAccountRepository users,
      NotificationPreferenceRepository preferences,
      SecurityProperties properties,
      AccountMailer mailer,
      ApplicationEventPublisher publisher) {
    this.users = users;
    this.preferences = preferences;
    this.properties = properties;
    this.mailer = mailer;
    this.publisher = publisher;
  }

  /** Konunun alıcılarına; which ile daraltılabilir (ör. yalnız planı giren). */
  public void send(
      NotificationTopic topic,
      String actorEmail,
      Predicate<UserAccount> which,
      String subject,
      String text) {
    List<String> recipients = recipients(topic, actorEmail, which);
    if (!recipients.isEmpty()) {
      publisher.publishEvent(new Pending(recipients, subject, text));
    }
  }

  /** Uygulamadaki sayfanın tam adresi. */
  public String link(String path) {
    return properties.frontendBaseUrl() + path;
  }

  @Async
  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void deliver(Pending mail) {
    mail.recipients()
        .forEach(email -> mailer.sendNotice(email, mail.subject(), mail.text() + FOOTER));
  }

  private List<String> recipients(
      NotificationTopic topic, String actorEmail, Predicate<UserAccount> which) {
    Set<UUID> optedOut =
        preferences.findByEmailFalse().stream()
            .filter(preference -> preference.getTopic() == topic)
            .map(NotificationPreference::getUserId)
            .collect(Collectors.toSet());
    return users.findByStatus(UserStatus.ACTIVE).stream()
        .filter(which)
        .filter(user -> actorEmail == null || !user.getEmail().equalsIgnoreCase(actorEmail))
        .filter(user -> user.getEffectivePermissions().contains(topic.getPermission()))
        .filter(user -> !optedOut.contains(user.getId()))
        .map(UserAccount::getEmail)
        .sorted()
        .toList();
  }
}
