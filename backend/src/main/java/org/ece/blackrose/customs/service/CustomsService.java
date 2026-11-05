package org.ece.blackrose.customs.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.customs.domain.BorderCrossing;
import org.ece.blackrose.customs.domain.CustomsDeclaration;
import org.ece.blackrose.customs.domain.CustomsTypes.DeclarationStatus;
import org.ece.blackrose.customs.domain.CustomsTypes.TransitStatus;
import org.ece.blackrose.customs.domain.DeclarationLine;
import org.ece.blackrose.customs.domain.PermitUsage;
import org.ece.blackrose.customs.domain.RoadPermit;
import org.ece.blackrose.customs.domain.TransitDocument;
import org.ece.blackrose.customs.repository.CustomsRepositories.BorderCrossingRepository;
import org.ece.blackrose.customs.repository.CustomsRepositories.CustomsDeclarationRepository;
import org.ece.blackrose.customs.repository.CustomsRepositories.DeclarationLineRepository;
import org.ece.blackrose.customs.repository.CustomsRepositories.PermitUsageRepository;
import org.ece.blackrose.customs.repository.CustomsRepositories.RoadPermitRepository;
import org.ece.blackrose.customs.repository.CustomsRepositories.TransitDocumentRepository;
import org.ece.blackrose.customs.web.CustomsDtos.ChangeDeclarationStatusRequest;
import org.ece.blackrose.customs.web.CustomsDtos.SaveCrossingRequest;
import org.ece.blackrose.customs.web.CustomsDtos.SaveDeclarationRequest;
import org.ece.blackrose.customs.web.CustomsDtos.SaveLineRequest;
import org.ece.blackrose.customs.web.CustomsDtos.SavePermitRequest;
import org.ece.blackrose.customs.web.CustomsDtos.SaveTransitRequest;
import org.ece.blackrose.customs.web.CustomsDtos.UsePermitRequest;
import org.ece.blackrose.shipment.domain.ShipmentTypes.CostKind;
import org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus;
import org.ece.blackrose.shipment.domain.TripCost;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentRepository;
import org.ece.blackrose.shipment.service.TripFinanceService;
import org.ece.blackrose.shipment.web.ShipmentDtos.SaveCostRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Gümrük, transit, izin ve sınır kayıtları. Gümrük sistemleriyle bağlantı yoktur; belge kaydı
 * tutulur, otomatik gönderim Faz 8'dedir.
 */
@Service
public class CustomsService {

  private static final Map<DeclarationStatus, Set<DeclarationStatus>> TRANSITIONS =
      Map.of(
          DeclarationStatus.DRAFT, Set.of(DeclarationStatus.SUBMITTED, DeclarationStatus.CANCELLED),
          DeclarationStatus.SUBMITTED,
              Set.of(DeclarationStatus.CLEARED, DeclarationStatus.REJECTED));

  private final CustomsDeclarationRepository declarations;
  private final DeclarationLineRepository lines;
  private final TransitDocumentRepository transits;
  private final RoadPermitRepository permits;
  private final PermitUsageRepository usages;
  private final BorderCrossingRepository crossings;
  private final ShipmentRepository shipments;
  private final TripFinanceService finance;

  public CustomsService(
      CustomsDeclarationRepository declarations,
      DeclarationLineRepository lines,
      TransitDocumentRepository transits,
      RoadPermitRepository permits,
      PermitUsageRepository usages,
      BorderCrossingRepository crossings,
      ShipmentRepository shipments,
      TripFinanceService finance) {
    this.declarations = declarations;
    this.lines = lines;
    this.transits = transits;
    this.permits = permits;
    this.usages = usages;
    this.crossings = crossings;
    this.shipments = shipments;
    this.finance = finance;
  }

  // Beyan

  @Transactional
  public CustomsDeclaration createDeclaration(SaveDeclarationRequest request) {
    ensureShipment(request.shipmentId());
    String number =
        "GB-%d-%06d".formatted(request.declaredOn().getYear(), declarations.nextNumber());
    return declarations.save(new CustomsDeclaration(number, request));
  }

  @Transactional
  public DeclarationLine addLine(UUID declarationId, SaveLineRequest request) {
    ensureDraft(findDeclaration(declarationId));
    return lines.save(new DeclarationLine(declarationId, request));
  }

  @Transactional
  public void removeLine(UUID lineId) {
    DeclarationLine line =
        lines
            .findById(lineId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "LINE_NOT_FOUND", "Beyan satırı bulunamadı."));
    ensureDraft(findDeclaration(line.getDeclarationId()));
    line.markDeleted();
  }

  @Transactional
  public CustomsDeclaration changeStatus(UUID id, ChangeDeclarationStatusRequest request) {
    CustomsDeclaration declaration = findDeclaration(id);
    DeclarationStatus target = request.status();
    if (!TRANSITIONS.getOrDefault(declaration.getStatus(), Set.of()).contains(target)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "DECLARATION_INVALID_TRANSITION", "Beyan bu duruma geçirilemez.");
    }
    if (target == DeclarationStatus.SUBMITTED) {
      if (request.registrationNo() == null || request.registrationNo().isBlank()) {
        throw new BusinessException(
            HttpStatus.BAD_REQUEST, "REGISTRATION_REQUIRED", "Tescil numarası zorunludur.");
      }
      if (lines.findByDeclarationIdOrderByCreatedAt(id).isEmpty()) {
        throw new BusinessException(
            HttpStatus.CONFLICT, "DECLARATION_EMPTY", "Satırı olmayan beyan tescil edilemez.");
      }
    }
    declaration.moveTo(target, request.registrationNo());
    return declaration;
  }

  // Transit

  @Transactional
  public TransitDocument createTransit(SaveTransitRequest request) {
    ensureShipment(request.shipmentId());
    if (request.deadline().isBefore(request.issuedOn())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "DEADLINE_INVALID",
          "Süre sonu düzenleme tarihinden önce olamaz.");
    }
    if (transits.existsByDocumentNo(request.documentNo())) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "CODE_TAKEN", "Bu transit belge numarası kayıtlı.");
    }
    if (request.declarationId() != null) {
      findDeclaration(request.declarationId());
    }
    return transits.save(new TransitDocument(request));
  }

  /** Varış gümrüğünde kapatma; teminat serbest kalır. */
  @Transactional
  public TransitDocument discharge(UUID id, LocalDate date) {
    TransitDocument transit = findOpenTransit(id);
    if (date.isBefore(transit.getIssuedOn())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "DATE_INVALID",
          "Kapatma tarihi düzenleme tarihinden önce olamaz.");
    }
    transit.discharge(date);
    return transit;
  }

  @Transactional
  public TransitDocument cancelTransit(UUID id) {
    TransitDocument transit = findOpenTransit(id);
    transit.cancel();
    return transit;
  }

  // İzin

  @Transactional
  public RoadPermit createPermit(SavePermitRequest request) {
    if (request.validTo().isBefore(request.validFrom())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "PERIOD_INVALID", "Bitiş tarihi başlangıçtan önce olamaz.");
    }
    if (permits.existsByNumber(request.number())) {
      throw new BusinessException(HttpStatus.CONFLICT, "CODE_TAKEN", "Bu izin numarası kayıtlı.");
    }
    return permits.save(new RoadPermit(request));
  }

  /** İzin satırı kilitlenir; aynı anda iki sefer son kotayı alamaz. */
  @Transactional
  public PermitUsage usePermit(UUID permitId, UsePermitRequest request) {
    RoadPermit permit =
        permits
            .findForUpdate(permitId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "PERMIT_NOT_FOUND", "İzin belgesi bulunamadı."));
    ensureShipment(request.shipmentId());
    if (!permit.validOn(request.date())) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "PERMIT_NOT_VALID", "İzin belgesi bu tarihte geçerli değil.");
    }
    if (usages.existsByPermitIdAndShipmentId(permitId, request.shipmentId())) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "PERMIT_ALREADY_USED", "Bu sefer bu izni zaten kullanıyor.");
    }
    if (usages.countActive(permitId) >= permit.getQuota()) {
      throw new BusinessException(HttpStatus.CONFLICT, "PERMIT_QUOTA_FULL", "İzin kotası dolu.");
    }
    return usages.save(new PermitUsage(permitId, request.shipmentId(), request.date()));
  }

  @Transactional
  public void releasePermit(UUID usageId) {
    PermitUsage usage =
        usages
            .findById(usageId)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "USAGE_NOT_FOUND", "Kullanım kaydı bulunamadı."));
    usage.markDeleted();
  }

  // Sınır geçişi

  @Transactional
  public BorderCrossing addCrossing(SaveCrossingRequest request) {
    ensureShipment(request.shipmentId());
    UUID costId = null;
    Money fee = request.fee();
    if (fee != null && fee.amount().signum() > 0) {
      if (request.accountId() == null) {
        throw new BusinessException(
            HttpStatus.BAD_REQUEST, "FEE_ACCOUNT_REQUIRED", "Ücret için cari seçilmelidir.");
      }
      TripCost cost =
          finance.addCost(
              request.shipmentId(),
              new SaveCostRequest(
                  CostKind.BORDER_FEE,
                  null,
                  request.accountId(),
                  null,
                  fee,
                  request.exchangeRate(),
                  request.date(),
                  "Sınır geçişi: " + request.gate()));
      costId = cost.getId();
    }
    return crossings.save(
        new BorderCrossing(
            request.shipmentId(),
            request.gate(),
            request.direction(),
            request.date(),
            costId,
            request.note()));
  }

  /** Gideri finansa yazılmış geçiş silinemez. */
  @Transactional
  public void removeCrossing(UUID id) {
    BorderCrossing crossing =
        crossings
            .findById(id)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "CROSSING_NOT_FOUND", "Geçiş kaydı bulunamadı."));
    if (crossing.getTripCostId() != null) {
      finance.removeCost(crossing.getTripCostId());
    }
    crossing.markDeleted();
  }

  // Yardımcılar

  /** Beyanın toplam kıymeti satırların toplamıdır. */
  public static BigDecimal total(List<DeclarationLine> list) {
    return list.stream()
        .map(DeclarationLine::getValueAmount)
        .reduce(BigDecimal.ZERO, BigDecimal::add);
  }

  public Map<UUID, List<DeclarationLine>> linesOf(List<CustomsDeclaration> list) {
    return lines
        .findByDeclarationIdIn(list.stream().map(CustomsDeclaration::getId).toList())
        .stream()
        .collect(Collectors.groupingBy(DeclarationLine::getDeclarationId));
  }

  private void ensureShipment(UUID id) {
    var shipment =
        shipments
            .findById(id)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "SHIPMENT_NOT_FOUND", "Sefer bulunamadı."));
    if (shipment.getStatus() == ShipmentStatus.CANCELLED) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "SHIPMENT_CANCELLED", "İptal edilmiş sefere kayıt eklenemez.");
    }
  }

  private static void ensureDraft(CustomsDeclaration declaration) {
    if (declaration.getStatus() != DeclarationStatus.DRAFT) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "DECLARATION_NOT_DRAFT", "Tescil edilen beyan değiştirilemez.");
    }
  }

  private CustomsDeclaration findDeclaration(UUID id) {
    return declarations
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "DECLARATION_NOT_FOUND", "Beyan bulunamadı."));
  }

  private TransitDocument findOpenTransit(UUID id) {
    TransitDocument transit =
        transits
            .findById(id)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "TRANSIT_NOT_FOUND", "Transit belgesi bulunamadı."));
    if (transit.getStatus() != TransitStatus.OPEN) {
      throw new BusinessException(HttpStatus.CONFLICT, "TRANSIT_CLOSED", "Transit belgesi kapalı.");
    }
    return transit;
  }
}
