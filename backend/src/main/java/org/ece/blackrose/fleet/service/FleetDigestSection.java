package org.ece.blackrose.fleet.service;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.ece.blackrose.fleet.domain.FleetSettings;
import org.ece.blackrose.fleet.domain.FleetTypes.DocumentType;
import org.ece.blackrose.fleet.repository.FleetRepositories.FleetSettingsRepository;
import org.ece.blackrose.fleet.web.FleetDtos.ReminderResponse;
import org.ece.blackrose.notification.DigestSection;
import org.ece.blackrose.notification.NotificationTopic;
import org.springframework.stereotype.Component;

/** Belge bitişi ve bakım hatırlatmaları. Firma filo ayarından kapatabilir. */
@Component
public class FleetDigestSection implements DigestSection {

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

  private final FleetSettingsRepository settings;
  private final FleetInsightService insights;

  public FleetDigestSection(FleetSettingsRepository settings, FleetInsightService insights) {
    this.settings = settings;
    this.insights = insights;
  }

  @Override
  public NotificationTopic topic() {
    return NotificationTopic.FLEET_REMINDERS;
  }

  @Override
  public Optional<Content> build(LocalDate today) {
    if (!settings.findById(FleetSettings.SINGLETON_ID).orElseThrow().isReminderEmail()) {
      return Optional.empty();
    }
    List<ReminderResponse> reminders = insights.reminders(today, null);
    if (reminders.isEmpty()) {
      return Optional.empty();
    }
    long overdue = reminders.stream().filter(ReminderResponse::overdue).count();
    String title =
        overdue > 0
            ? "Filo hatırlatması: %d kayıt, %d tanesinin süresi geçti"
                .formatted(reminders.size(), overdue)
            : "Filo hatırlatması: %d kayıt yaklaşıyor".formatted(reminders.size());
    List<String> lines =
        reminders.stream()
            .map(
                reminder ->
                    reminder.subjectName()
                        + " — "
                        + describe(reminder)
                        + (reminder.overdue() ? " (SÜRESİ GEÇTİ)" : ""))
            .toList();
    return Optional.of(new Content(title, lines, "/fleet"));
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
