package org.ece.blackrose.shipment.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.identity.service.SecureTokens;
import org.ece.blackrose.shipment.domain.ProofOfDelivery;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.domain.ShipmentEvent;
import org.ece.blackrose.shipment.domain.ShipmentTrackingLink;
import org.ece.blackrose.shipment.domain.ShipmentTypes.EventType;
import org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ProofOfDeliveryRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentEventRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentTrackingLinkRepository;
import org.ece.blackrose.tenant.TenantContext;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Müşteriye giriş gerektirmeyen takip bağlantısı. Bağlantı yalnız sefer durumunu, şehirleri,
 * planlanan tarihleri ve teslim bilgisini gösterir; fiyat, sürücü, araç, konum ve iç notlar
 * gösterilmez. Ofisin oluşturduğu bağlantı seferdeki bütün eski bağlantıları iptal eder; teslim
 * bildirimi için oluşturulan bağlantı ise ofisin müşteriye verdiğini bozmamak için yanına eklenir.
 */
@Service
public class ShipmentTrackingService {

  static final Duration VALIDITY = Duration.ofDays(60);

  public record CreatedLink(String token, Instant expiresAt) {}

  public record LinkStatus(
      boolean active,
      int activeCount,
      Instant createdAt,
      String createdBy,
      Instant expiresAt,
      int viewCount,
      Instant lastViewedAt) {}

  public record Step(ShipmentStatus status, Instant at) {}

  public record PublicView(
      String company,
      String number,
      ShipmentStatus status,
      String origin,
      String destination,
      Instant plannedPickup,
      Instant plannedDelivery,
      List<Step> steps,
      Instant deliveredAt,
      String recipientInitials) {}

  private final ShipmentTrackingLinkRepository links;
  private final ShipmentRepository shipments;
  private final ShipmentEventRepository events;
  private final ProofOfDeliveryRepository deliveries;
  private final TenantRepository tenants;
  private final AuditService audit;
  private final Clock clock;

  @Autowired
  public ShipmentTrackingService(
      ShipmentTrackingLinkRepository links,
      ShipmentRepository shipments,
      ShipmentEventRepository events,
      ProofOfDeliveryRepository deliveries,
      TenantRepository tenants,
      AuditService audit) {
    this(links, shipments, events, deliveries, tenants, audit, Clock.systemUTC());
  }

  ShipmentTrackingService(
      ShipmentTrackingLinkRepository links,
      ShipmentRepository shipments,
      ShipmentEventRepository events,
      ProofOfDeliveryRepository deliveries,
      TenantRepository tenants,
      AuditService audit,
      Clock clock) {
    this.links = links;
    this.shipments = shipments;
    this.events = events;
    this.deliveries = deliveries;
    this.tenants = tenants;
    this.audit = audit;
    this.clock = clock;
  }

  @Transactional
  public CreatedLink create(UUID shipmentId) {
    return issue(shipment(shipmentId), true);
  }

  /** Teslim e-postası için; ofisin verdiği bağlantı geçerli kalır. */
  @Transactional
  public CreatedLink createForNotice(Shipment shipment) {
    return issue(shipment, false);
  }

  private CreatedLink issue(Shipment shipment, boolean replaceOthers) {
    UUID shipmentId = shipment.getId();
    if (shipment.getStatus() == ShipmentStatus.CANCELLED) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "SHIPMENT_CANCELLED", "İptal edilen sefer için bağlantı verilmez.");
    }
    Instant now = clock.instant();
    if (replaceOthers) {
      links.findByShipmentIdAndRevokedAtIsNull(shipmentId).forEach(link -> link.revoke(now));
    }
    String token = SecureTokens.generate();
    ShipmentTrackingLink link =
        links.save(
            new ShipmentTrackingLink(shipmentId, SecureTokens.hash(token), now.plus(VALIDITY)));
    audit.record(
        AuditEvent.TRACKING_LINK_CREATED,
        shipment.getNumber(),
        replaceOthers ? null : "Teslim bildirimi");
    return new CreatedLink(token, link.getExpiresAt());
  }

  @Transactional
  public void revoke(UUID shipmentId) {
    Shipment shipment = shipment(shipmentId);
    Instant now = clock.instant();
    List<ShipmentTrackingLink> active = links.findByShipmentIdAndRevokedAtIsNull(shipmentId);
    active.forEach(link -> link.revoke(now));
    if (!active.isEmpty()) {
      audit.record(AuditEvent.TRACKING_LINK_REVOKED, shipment.getNumber(), null);
    }
  }

  /** Birden çok geçerli bağlantı olabilir (ofis ve teslim e-postası); özet birlikte verilir. */
  @Transactional(readOnly = true)
  public Optional<LinkStatus> status(UUID shipmentId) {
    shipment(shipmentId);
    Instant now = clock.instant();
    List<ShipmentTrackingLink> usable =
        links.findByShipmentIdAndRevokedAtIsNull(shipmentId).stream()
            .filter(link -> link.isUsableAt(now))
            .sorted(Comparator.comparing(ShipmentTrackingLink::getCreatedAt).reversed())
            .toList();
    if (usable.isEmpty()) {
      return Optional.empty();
    }
    ShipmentTrackingLink latest = usable.get(0);
    return Optional.of(
        new LinkStatus(
            true,
            usable.size(),
            latest.getCreatedAt(),
            latest.getCreatedBy(),
            usable.stream().map(ShipmentTrackingLink::getExpiresAt).max(Instant::compareTo).get(),
            usable.stream().mapToInt(ShipmentTrackingLink::getViewCount).sum(),
            usable.stream()
                .map(ShipmentTrackingLink::getLastViewedAt)
                .filter(java.util.Objects::nonNull)
                .max(Instant::compareTo)
                .orElse(null)));
  }

  /**
   * Bilinmeyen, süresi dolmuş ve iptal edilmiş bağlantı aynı yanıtı alır; hangisi olduğu dışarıya
   * söylenmez.
   */
  @Transactional
  public PublicView view(String token) {
    Instant now = clock.instant();
    ShipmentTrackingLink link =
        links
            .findByTokenHash(SecureTokens.hash(token))
            .filter(candidate -> candidate.isUsableAt(now))
            .orElseThrow(ShipmentTrackingService::notFound);
    Shipment shipment = shipments.findById(link.getShipmentId()).orElseThrow(this::gone);
    links.markViewed(link.getId(), now);

    List<Step> steps =
        events.findByShipmentIdOrderByCreatedAt(shipment.getId()).stream()
            .filter(event -> event.getType() == EventType.STATUS && event.getToStatus() != null)
            .map(ShipmentTrackingService::step)
            .toList();
    Optional<ProofOfDelivery> delivery = deliveries.findByShipmentId(shipment.getId());
    return new PublicView(
        company(),
        shipment.getNumber(),
        shipment.getStatus(),
        shipment.getOrigin(),
        shipment.getDestination(),
        shipment.getPlannedPickup(),
        shipment.getPlannedDelivery(),
        steps,
        delivery.map(ProofOfDelivery::getDeliveredAt).orElse(null),
        delivery
            .map(ProofOfDelivery::getRecipientName)
            .map(ShipmentTrackingService::initials)
            .orElse(null));
  }

  /** Teslim alanın tam adı kişisel veridir; müşteriye yalnız baş harfler gösterilir. */
  static String initials(String name) {
    if (name == null || name.isBlank()) {
      return null;
    }
    StringBuilder result = new StringBuilder();
    for (String part : name.strip().split("\\s+")) {
      result.append(part.substring(0, 1).toUpperCase(new Locale("tr"))).append(". ");
    }
    return result.toString().strip();
  }

  private static Step step(ShipmentEvent event) {
    return new Step(event.getToStatus(), event.getCreatedAt());
  }

  private String company() {
    return TenantContext.currentCode()
        .flatMap(tenants::findByCode)
        .map(tenant -> tenant.getName())
        .orElse(null);
  }

  private Shipment shipment(UUID id) {
    return shipments
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "SHIPMENT_NOT_FOUND", "Sefer bulunamadı."));
  }

  private BusinessException gone() {
    return notFound();
  }

  private static BusinessException notFound() {
    return new BusinessException(
        HttpStatus.NOT_FOUND,
        "TRACKING_NOT_FOUND",
        "Takip bağlantısı geçersiz veya süresi dolmuş.");
  }
}
