package org.ece.blackrose.shipment.service;

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
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Sefer teslim edilince müşterinin "teslim bildirimi alsın" işaretli kişilerine takip bağlantılı
 * e-posta gönderir. Bağlantı teslim işlemiyle aynı işlemde oluşturulur; e-posta yalnız işlem
 * kaydedildikten sonra ve arka planda gider, teslim geri alınırsa gitmez. Her alıcıya ayrı
 * gönderilir, adresler birbirine görünmez.
 */
@Component
public class DeliveryNotifier {

  /** İşlem sonrası gönderilecek e-postalar; veritabanı veya firma bağlamı gerekmez. */
  public record DeliveryNotice(List<String> recipients, String subject, String text) {}

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

  /** Teslim işleminin içinde çağrılır. İşaretli kişi yoksa hiçbir şey yapmaz. */
  public void prepare(Shipment shipment) {
    List<String> recipients =
        contacts.findByAccountIdAndNotifyDeliveriesTrue(shipment.getAccountId()).stream()
            .map(Contact::getEmail)
            .filter(email -> email != null && !email.isBlank())
            .map(String::strip)
            .distinct()
            .toList();
    if (recipients.isEmpty()) {
      return;
    }
    String code = TenantContext.currentCode().orElseThrow();
    String token = tracking.createForNotice(shipment).token();
    String url = properties.frontendBaseUrl() + "/track/" + code + "/" + token;
    String company = tenants.findByCode(code).map(tenant -> tenant.getName()).orElse(code);

    events.save(
        new ShipmentEvent(
            shipment.getId(),
            EventType.NOTE,
            null,
            null,
            "Teslim bildirimi gönderildi: " + String.join(", ", recipients)));
    publisher.publishEvent(
        new DeliveryNotice(
            recipients,
            "Gönderiniz teslim edildi: " + shipment.getNumber(),
            text(company, shipment, url)));
  }

  @Async
  @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
  public void send(DeliveryNotice notice) {
    notice.recipients().forEach(email -> mailer.sendNotice(email, notice.subject(), notice.text()));
  }

  static String text(String company, Shipment shipment, String url) {
    return "Merhaba,\n\n"
        + company
        + " tarafından taşınan "
        + shipment.getNumber()
        + " numaralı gönderiniz ("
        + shipment.getOrigin()
        + " → "
        + shipment.getDestination()
        + ") teslim edildi.\n\n"
        + "Teslim zamanı ve sefer geçmişi için:\n"
        + url
        + "\n\nBağlantı 60 gün geçerlidir. Bu e-postayı, firmanın sizi teslim bildirimi alacak kişi"
        + " olarak kaydetmesi nedeniyle aldınız.\n";
  }
}
