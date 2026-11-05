package org.ece.blackrose.shipment.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.shipment.domain.ProofOfDelivery;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.domain.ShipmentDocument;
import org.ece.blackrose.shipment.domain.ShipmentTypes.DocumentStatus;
import org.ece.blackrose.shipment.domain.ShipmentTypes.DocumentType;
import org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ProofOfDeliveryRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentCargoRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentDocumentRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentLegRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentRepository;
import org.ece.blackrose.shipment.web.ShipmentDtos.CargoResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.DocumentContent;
import org.ece.blackrose.shipment.web.ShipmentDtos.DocumentResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.LegResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.SavePodRequest;
import org.ece.blackrose.tenant.TenantClock;
import org.ece.blackrose.tenant.TenantContext;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** CMR, irsaliye ve teslim kanıtı. Yayımlanan belge donar; gerçek GİB gönderimi Faz 8'dedir. */
@Service
public class ShipmentDocumentService {

  private static final Set<ShipmentStatus> POD_ALLOWED =
      Set.of(ShipmentStatus.IN_TRANSIT, ShipmentStatus.LOADED);

  public record RenderedPdf(String fileName, byte[] content) {}

  private final ShipmentDocumentRepository documents;
  private final ShipmentRepository shipments;
  private final ShipmentLegRepository legs;
  private final ShipmentCargoRepository cargo;
  private final ProofOfDeliveryRepository pods;
  private final ShipmentViews views;
  private final TenantRepository tenants;
  private final TenantClock clock;

  public ShipmentDocumentService(
      ShipmentDocumentRepository documents,
      ShipmentRepository shipments,
      ShipmentLegRepository legs,
      ShipmentCargoRepository cargo,
      ProofOfDeliveryRepository pods,
      ShipmentViews views,
      TenantRepository tenants,
      TenantClock clock) {
    this.documents = documents;
    this.shipments = shipments;
    this.legs = legs;
    this.cargo = cargo;
    this.pods = pods;
    this.views = views;
    this.tenants = tenants;
    this.clock = clock;
  }

  @Transactional(readOnly = true)
  public List<DocumentResponse> list(UUID shipmentId) {
    return documents.findByShipmentIdOrderByType(shipmentId).stream()
        .map(this::toResponse)
        .toList();
  }

  /** Taslağı üretir veya sefer değiştiyse yeniler. Numara ilk oluşturmada verilir ve değişmez. */
  @Transactional
  public DocumentResponse generate(UUID shipmentId, DocumentType type) {
    Shipment shipment = find(shipmentId);
    List<LegResponse> legResponses =
        views.legResponses(legs.findByShipmentIdOrderBySequenceNo(shipmentId));
    if (legResponses.stream()
        .anyMatch(leg -> leg.vehicleId() == null && leg.carrierAccountId() == null)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "LEGS_NOT_ASSIGNED", "Belge için tüm etaplar atanmış olmalıdır.");
    }
    String content = views.write(contentOf(shipment, legResponses));
    ShipmentDocument document =
        documents
            .findByShipmentIdAndType(shipmentId, type)
            .map(
                existing -> {
                  if (existing.getStatus() == DocumentStatus.ISSUED) {
                    throw new BusinessException(
                        HttpStatus.CONFLICT, "DOCUMENT_ISSUED", "Yayımlanan belge değiştirilemez.");
                  }
                  existing.refresh(content);
                  return existing;
                })
            .orElseGet(
                () ->
                    documents.save(
                        new ShipmentDocument(shipmentId, type, nextNumber(type), content)));
    return toResponse(document);
  }

  @Transactional
  public DocumentResponse issue(UUID id) {
    ShipmentDocument document = findDocument(id);
    document.issue();
    return toResponse(document);
  }

  @Transactional(readOnly = true)
  public RenderedPdf pdf(UUID id) {
    ShipmentDocument document = findDocument(id);
    DocumentContent content = views.read(document.getContent(), DocumentContent.class);
    return new RenderedPdf(document.getNumber() + ".pdf", ShipmentPdf.document(document, content));
  }

  @Transactional
  public ProofOfDelivery savePod(UUID shipmentId, SavePodRequest request) {
    Shipment shipment =
        shipments.findForUpdate(shipmentId).orElseThrow(ShipmentDocumentService::notFound);
    if (!POD_ALLOWED.contains(shipment.getStatus())) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "POD_NOT_ALLOWED", "Teslim kanıtı yalnız yoldaki sefere girilir.");
    }
    ProofOfDelivery pod =
        pods.findByShipmentId(shipmentId).orElseGet(() -> new ProofOfDelivery(shipmentId));
    pod.update(request);
    return pods.save(pod);
  }

  @Transactional(readOnly = true)
  public ProofOfDelivery pod(UUID shipmentId) {
    return pods.findByShipmentId(shipmentId).orElse(null);
  }

  private DocumentContent contentOf(Shipment shipment, List<LegResponse> legResponses) {
    List<CargoResponse> goods =
        cargo.findByShipmentIdOrderByCreatedAt(shipment.getId()).stream()
            .map(ShipmentViews::cargoResponse)
            .toList();
    BigDecimal weight =
        goods.stream()
            .map(CargoResponse::weightKg)
            .filter(Objects::nonNull)
            .reduce(BigDecimal.ZERO, BigDecimal::add);
    String company =
        tenants.findByCode(TenantContext.currentCode().orElseThrow()).orElseThrow().getName();
    Map<Boolean, List<LegResponse>> split =
        legResponses.stream()
            .collect(Collectors.partitioningBy(leg -> leg.carrierAccountId() != null));
    String carriers =
        split.get(true).stream()
            .map(LegResponse::carrierName)
            .distinct()
            .collect(Collectors.joining(", "));
    String carrierName =
        split.get(false).isEmpty()
            ? carriers
            : carriers.isEmpty() ? company : company + ", " + carriers;
    String plates =
        split.get(false).stream()
            .map(
                leg ->
                    leg.trailerPlate() == null
                        ? leg.vehiclePlate()
                        : leg.vehiclePlate() + " / " + leg.trailerPlate())
            .distinct()
            .collect(Collectors.joining(", "));
    String driverNames =
        split.get(false).stream()
            .map(LegResponse::driverName)
            .distinct()
            .collect(Collectors.joining(", "));
    return new DocumentContent(
        shipment.getShipperName(),
        shipment.getShipperAddress(),
        shipment.getConsigneeName(),
        shipment.getConsigneeAddress(),
        carrierName,
        plates,
        driverNames,
        shipment.getOrigin(),
        shipment.getDestination(),
        clock.dateOf(shipment.getPlannedPickup()),
        goods,
        weight,
        shipment.isInternational(),
        shipment.getOriginCountry(),
        shipment.getDestinationCountry(),
        shipment.getIncoterm(),
        shipment.getLiabilityPolicy(),
        shipment.getSenderInstructions(),
        shipment.getAttachedDocuments());
  }

  private String nextNumber(DocumentType type) {
    int year = clock.today().getYear();
    return type == DocumentType.CMR
        ? "CMR-%d-%06d".formatted(year, shipments.nextCmrNumber())
        : "IRS-%d-%06d".formatted(year, shipments.nextWaybillNumber());
  }

  private DocumentResponse toResponse(ShipmentDocument document) {
    return new DocumentResponse(
        document.getId(),
        document.getShipmentId(),
        document.getType(),
        document.getNumber(),
        document.getStatus(),
        views.read(document.getContent(), DocumentContent.class));
  }

  private Shipment find(UUID id) {
    return shipments.findById(id).orElseThrow(ShipmentDocumentService::notFound);
  }

  private ShipmentDocument findDocument(UUID id) {
    return documents
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "DOCUMENT_NOT_FOUND", "Belge bulunamadı."));
  }

  private static BusinessException notFound() {
    return new BusinessException(HttpStatus.NOT_FOUND, "SHIPMENT_NOT_FOUND", "Sefer bulunamadı.");
  }
}
