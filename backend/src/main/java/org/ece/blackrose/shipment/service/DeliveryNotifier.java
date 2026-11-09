package org.ece.blackrose.shipment.service;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.ece.blackrose.crm.domain.Contact;
import org.ece.blackrose.crm.repository.CrmRepositories.ContactRepository;
import org.ece.blackrose.identity.security.SecurityProperties;
import org.ece.blackrose.identity.service.AccountMailer;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.domain.ShipmentEvent;
import org.ece.blackrose.shipment.domain.ShipmentTypes.EventType;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentEventRepository;
import org.ece.blackrose.tenant.TenantContext;
import org.ece.blackrose.tenant.domain.Tenant;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Sefer yola çıkınca ve teslim edilince müşterinin ilgili seçeneği işaretli kişilerine takip
 * bağlantılı e-posta gönderir. Bağlantı durum değişikliğiyle aynı işlemde oluşturulur; e-posta
 * yalnız işlem kaydedildikten sonra ve arka planda gider, işlem geri alınırsa gitmez. Her alıcıya
 * ayrı gönderilir, adresler birbirine görünmez.
 */
@Component
public class DeliveryNotifier {

  /** Hangi durum değişikliğinin bildirildiği. */
  public enum Kind {
    DEPARTURE("Yola çıkış bildirimi gönderildi: ", "Gönderiniz yola çıktı: "),
    DELIVERY("Teslim bildirimi gönderildi: ", "Gönderiniz teslim edildi: ");

    private final String note;
    private final String subject;

    Kind(String note, String subject) {
      this.note = note;
      this.subject = subject;
    }
  }

  /** İşlem sonrası gönderilecek e-postalar; veritabanı veya firma bağlamı gerekmez. */
  public record DeliveryNotice(List<String> recipients, String subject, String text) {}

  private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm");

  private final ContactRepository contacts;
  private final ShipmentTrackingService tracking;
  private final ShipmentEventRepository events;
  private final TenantRepository tenants;
  private final SecurityProperties properties;
  private final AccountMailer mailer;
  private final ApplicationEventPublisher publisher;

  public DeliveryNotifier(
      ContactRepository contacts,
      ShipmentTrackingService tracking,
      ShipmentEventRepository events,
      TenantRepository tenants,
      SecurityProperties properties,
      AccountMailer mailer,
      ApplicationEventPublisher publisher) {
    this.contacts = contacts;
    this.tracking = tracking;
    this.events = events;
    this.tenants = tenants;
    this.properties = properties;
    this.mailer = mailer;
    this.publisher = publisher;
  }

  /** Durum değişikliğinin işleminde çağrılır. İşaretli kişi yoksa hiçbir şey yapmaz. */
  public void prepare(Shipment shipment, Kind kind) {
    List<Contact> marked =
        kind == Kind.DEPARTURE
            ? contacts.findByAccountIdAndNotifyDeparturesTrue(shipment.getAccountId())
            : contacts.findByAccountIdAndNotifyDeliveriesTrue(shipment.getAccountId());
    List<String> recipients =
        marked.stream()
            .map(Contact::getEmail)
            .filter(email -> email != null && !email.isBlank())
            .map(String::strip)
            .distinct()
            .toList();
    if (recipients.isEmpty()) {
      return;
    }
    String code = TenantContext.currentCode().orElseThrow();
    Tenant tenant = tenants.findByCode(code).orElseThrow();
    String token = tracking.createForNotice(shipment).token();
    String url = properties.frontendBaseUrl() + "/track/" + code + "/" + token;

    events.save(
        new ShipmentEvent(
            shipment.getId(),
            EventType.NOTE,
            null,
            null,
            kind.note + String.join(", ", recipients)));
    publisher.publishEvent(
        new DeliveryNotice(
            recipients,
            kind.subject + shipment.getNumber(),
            text(kind, tenant.getName(), shipment, url, ZoneId.of(tenant.getTimeZone()))));
  }

  @Async
  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void send(DeliveryNotice notice) {
    notice.recipients().forEach(email -> mailer.sendNotice(email, notice.subject(), notice.text()));
  }

  static String text(Kind kind, String company, Shipment shipment, String url, ZoneId zone) {
    String route =
        company
            + " tarafından taşınan "
            + shipment.getNumber()
            + " numaralı gönderiniz ("
            + shipment.getOrigin()
            + " → "
            + shipment.getDestination()
            + ")";
    String body =
        kind == Kind.DEPARTURE
            ? route
                + " yola çıktı.\nPlanlanan teslim: "
                + WHEN.format(shipment.getPlannedDelivery().atZone(zone))
                + "\n\nGönderinin durumunu izlemek için:\n"
            : route + " teslim edildi.\n\nTeslim zamanı ve sefer geçmişi için:\n";
    return "Merhaba,\n\n"
        + body
        + url
        + "\n\nBağlantı 60 gün geçerlidir. Bu e-postayı, firmanın sizi sefer bildirimi alacak kişi"
        + " olarak kaydetmesi nedeniyle aldınız.\n";
  }
}
