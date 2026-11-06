package org.ece.blackrose.notification;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.ece.blackrose.identity.domain.Permission;
import org.ece.blackrose.identity.domain.UserAccount;
import org.ece.blackrose.identity.domain.UserStatus;
import org.ece.blackrose.identity.repository.IdentityRepositories.UserAccountRepository;
import org.ece.blackrose.identity.security.SecurityProperties;
import org.ece.blackrose.identity.service.AccountMailer;
import org.ece.blackrose.notification.DigestSection.Content;
import org.ece.blackrose.notification.NotificationRepositories.DigestRunRepository;
import org.ece.blackrose.notification.NotificationRepositories.NotificationPreferenceRepository;
import org.ece.blackrose.tenant.TenantClock;
import org.ece.blackrose.tenant.TenantJobs;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Her sabah firmanın saatiyle 07:00'den sonra her etkin kullanıcıya, yetkisi olan ve kapatmadığı
 * konulardan tek bir özet e-postası gönderir. Gün önce üstlenilir: aynı gün ikinci kez gönderilmez,
 * gönderim başarısız olursa o gün tekrar denenmez (bilgiler uygulamada görünmeye devam eder).
 */
@Component
public class DailyDigestMailer {

  static final int SEND_HOUR = 7;
  private static final Logger log = LoggerFactory.getLogger(DailyDigestMailer.class);

  private final TenantJobs tenantJobs;
  private final TenantClock clock;
  private final DigestRunRepository runs;
  private final NotificationPreferenceRepository preferences;
  private final UserAccountRepository users;
  private final List<DigestSection> sections;
  private final AccountMailer mailer;
  private final SecurityProperties properties;

  public DailyDigestMailer(
      TenantJobs tenantJobs,
      TenantClock clock,
      DigestRunRepository runs,
      NotificationPreferenceRepository preferences,
      UserAccountRepository users,
      List<DigestSection> sections,
      AccountMailer mailer,
      SecurityProperties properties) {
    this.tenantJobs = tenantJobs;
    this.clock = clock;
    this.runs = runs;
    this.preferences = preferences;
    this.users = users;
    this.sections = sections;
    this.mailer = mailer;
    this.properties = properties;
  }

  /** Firmalar farklı saat dilimlerinde olabildiği için saatlik bakılır. */
  @Scheduled(cron = "0 5 * * * *")
  public void sendDue() {
    tenantJobs.forEachActiveTenant(
        () -> {
          if (clock.localNow().getHour() >= SEND_HOUR) {
            sendForCurrentTenant(clock.today());
          }
        });
  }

  /** Geçerli firma için günün özetini gönderir; e-posta gönderilen kullanıcı sayısını döner. */
  public int sendForCurrentTenant(LocalDate today) {
    if (runs.claim(today) == 0) {
      return 0;
    }
    Map<NotificationTopic, Content> contents = new EnumMap<>(NotificationTopic.class);
    for (DigestSection section : sections) {
      section.build(today).ifPresent(content -> contents.put(section.topic(), content));
    }
    if (contents.isEmpty()) {
      return 0;
    }
    Map<UUID, Set<NotificationTopic>> optedOut =
        preferences.findByEmailFalse().stream()
            .collect(
                Collectors.groupingBy(
                    NotificationPreference::getUserId,
                    Collectors.mapping(NotificationPreference::getTopic, Collectors.toSet())));
    int sent = 0;
    for (UserAccount user : users.findByStatus(UserStatus.ACTIVE)) {
      Set<Permission> permissions = user.getEffectivePermissions();
      Set<NotificationTopic> off = optedOut.getOrDefault(user.getId(), Set.of());
      List<Content> mine = new ArrayList<>();
      contents.forEach(
          (topic, content) -> {
            if (permissions.contains(topic.getPermission()) && !off.contains(topic)) {
              mine.add(content);
            }
          });
      if (!mine.isEmpty()) {
        mailer.sendNotice(user.getEmail(), subject(mine), body(mine, properties.frontendBaseUrl()));
        sent++;
      }
    }
    log.info("Günlük özet: {} konu, {} alıcı", contents.size(), sent);
    return sent;
  }

  static String subject(List<Content> contents) {
    return contents.size() == 1
        ? contents.get(0).title()
        : "Günlük özet: " + contents.stream().map(Content::title).collect(Collectors.joining("; "));
  }

  static String body(List<Content> contents, String baseUrl) {
    StringBuilder text = new StringBuilder();
    for (Content content : contents) {
      text.append(content.title()).append('\n');
      content.lines().forEach(line -> text.append("- ").append(line).append('\n'));
      text.append("Ayrıntılar: ").append(baseUrl).append(content.path()).append("\n\n");
    }
    text.append("Hangi e-postaları alacağınızı Hesabım ekranından seçebilirsiniz.\n");
    return text.toString();
  }
}
