package org.ece.blackrose.fleet.service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import org.ece.blackrose.fleet.domain.FleetTypes.DocumentType;
import org.ece.blackrose.fleet.repository.FleetRepositories.FleetSettingsRepository;
import org.ece.blackrose.fleet.web.FleetDtos.ReminderResponse;
import org.ece.blackrose.identity.domain.Permission;
import org.ece.blackrose.identity.domain.UserStatus;
import org.ece.blackrose.identity.repository.IdentityRepositories.UserAccountRepository;
import org.ece.blackrose.identity.security.SecurityProperties;
import org.ece.blackrose.identity.service.AccountMailer;
import org.ece.blackrose.tenant.TenantClock;
import org.ece.blackrose.tenant.TenantJobs;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Filo hatırlatmalarını (belge bitişi, bakım) firmanın saatiyle her sabah, filo düzenleme yetkili
 * etkin kullanıcılara tek e-postada gönderir. Gün önce üstlenilir: aynı gün ikinci kez gönderilmez,
 * gönderim başarısız olursa o günün e-postası tekrarlanmaz (uygulama içi liste yine görünür).
 */
@Component
public class FleetReminderMailer {

  static final int SEND_HOUR = 7;
  private static final Logger log = LoggerFactory.getLogger(FleetReminderMailer.class);
  private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
  private static final Map<DocumentType, String> DOC_LABELS =
      Map.ofEntries(
          Map.entry(DocumentType.INSPECTION, "Muayene"),
          Map.entry(DocumentType.TRAFFIC_INSURANCE, "Trafik sigortası"),
          Map.entry(DocumentType.KASKO, "Kasko"),
          Map.entry(DocumentType.K_CERTIFICATE, "K belgesi"),
          Map.entry(DocumentType.U_ETT, "U-ETT"),
          Map.entry(DocumentType.EXHAUST, "Egzoz"),
          Map.entry(DocumentType.VEHICLE_ADR, "Araç ADR"),
          Map.entry(DocumentType.LICENSE, "Ehliyet"),
          Map.entry(DocumentType.SRC, "SRC"),
          Map.entry(DocumentType.PSYCHOTECHNIC, "Psikoteknik"),
          Map.entry(DocumentType.DRIVER_ADR, "Sürücü ADR"),
          Map.entry(DocumentType.HEALTH, "Sağlık raporu"));

  private final TenantJobs tenantJobs;
  private final TenantClock clock;
  private final FleetSettingsRepository settings;
  private final FleetInsightService insights;
  private final UserAccountRepository users;
  private final AccountMailer mailer;
  private final SecurityProperties properties;

  public FleetReminderMailer(
      TenantJobs tenantJobs,
      TenantClock clock,
      FleetSettingsRepository settings,
      FleetInsightService insights,
      UserAccountRepository users,
      AccountMailer mailer,
      SecurityProperties properties) {
    this.tenantJobs = tenantJobs;
    this.clock = clock;
    this.settings = settings;
    this.insights = insights;
    this.users = users;
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

  /** Geçerli firma için günün e-postasını gönderir; gönderilen alıcı sayısını döner. */
  public int sendForCurrentTenant(LocalDate today) {
    if (settings.claimReminderMail(today) == 0) {
      return 0;
    }
    List<ReminderResponse> reminders = insights.reminders(today, null);
    if (reminders.isEmpty()) {
      return 0;
    }
    List<String> recipients =
        users.findByStatus(UserStatus.ACTIVE).stream()
            .filter(user -> user.getEffectivePermissions().contains(Permission.FLEET_EDIT))
            .map(user -> user.getEmail())
            .toList();
    String subject = subject(reminders);
    String body = body(reminders, properties.frontendBaseUrl());
    recipients.forEach(email -> mailer.sendNotice(email, subject, body));
    log.info("Filo hatırlatması: {} kayıt, {} alıcı", reminders.size(), recipients.size());
    return recipients.size();
  }

  static String subject(List<ReminderResponse> reminders) {
    long overdue = reminders.stream().filter(ReminderResponse::overdue).count();
    return overdue > 0
        ? "Filo hatırlatması: %d kayıt, %d tanesinin süresi geçti"
            .formatted(reminders.size(), overdue)
        : "Filo hatırlatması: %d kayıt yaklaşıyor".formatted(reminders.size());
  }

  static String body(List<ReminderResponse> reminders, String baseUrl) {
    StringBuilder text = new StringBuilder("Yaklaşan ve süresi geçen filo işleri:\n\n");
    for (ReminderResponse reminder : reminders) {
      text.append("- ").append(reminder.subjectName()).append(" — ").append(describe(reminder));
      if (reminder.overdue()) {
        text.append(" (SÜRESİ GEÇTİ)");
      }
      text.append('\n');
    }
    text.append("\nAyrıntılar: ").append(baseUrl).append("/fleet\n");
    text.append("Bu e-posta filo ayarlarından kapatılabilir.\n");
    return text.toString();
  }

  private static String describe(ReminderResponse reminder) {
    return switch (reminder.type()) {
      case DOCUMENT ->
          DOC_LABELS.getOrDefault(reminder.docType(), String.valueOf(reminder.docType()))
              + ", bitiş "
              + DATE.format(reminder.dueDate());
      case MAINTENANCE_DATE -> "Bakım, tarih " + DATE.format(reminder.dueDate());
      case MAINTENANCE_KM ->
          "Bakım, %s km (şu an %s km)"
              .formatted(reminder.dueKm().toPlainString(), reminder.currentKm().toPlainString());
    };
  }
}
