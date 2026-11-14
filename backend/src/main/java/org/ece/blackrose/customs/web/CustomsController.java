package org.ece.blackrose.customs.web;

import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.customs.domain.BorderCrossing;
import org.ece.blackrose.customs.domain.CustomsDeclaration;
import org.ece.blackrose.customs.domain.CustomsTypes.TransitStatus;
import org.ece.blackrose.customs.domain.DeclarationLine;
import org.ece.blackrose.customs.domain.RoadPermit;
import org.ece.blackrose.customs.domain.TransitDocument;
import org.ece.blackrose.customs.repository.CustomsRepositories.BorderCrossingRepository;
import org.ece.blackrose.customs.repository.CustomsRepositories.CustomsDeclarationRepository;
import org.ece.blackrose.customs.repository.CustomsRepositories.PermitUsageRepository;
import org.ece.blackrose.customs.repository.CustomsRepositories.RoadPermitRepository;
import org.ece.blackrose.customs.repository.CustomsRepositories.TransitDocumentRepository;
import org.ece.blackrose.customs.service.CustomsService;
import org.ece.blackrose.customs.web.CustomsDtos.ChangeDeclarationStatusRequest;
import org.ece.blackrose.customs.web.CustomsDtos.CrossingResponse;
import org.ece.blackrose.customs.web.CustomsDtos.CustomsOptionsResponse;
import org.ece.blackrose.customs.web.CustomsDtos.DeclarationLineResponse;
import org.ece.blackrose.customs.web.CustomsDtos.DeclarationResponse;
import org.ece.blackrose.customs.web.CustomsDtos.DischargeRequest;
import org.ece.blackrose.customs.web.CustomsDtos.Option;
import org.ece.blackrose.customs.web.CustomsDtos.PermitResponse;
import org.ece.blackrose.customs.web.CustomsDtos.PermitUsageResponse;
import org.ece.blackrose.customs.web.CustomsDtos.SaveCrossingRequest;
import org.ece.blackrose.customs.web.CustomsDtos.SaveDeclarationRequest;
import org.ece.blackrose.customs.web.CustomsDtos.SaveLineRequest;
import org.ece.blackrose.customs.web.CustomsDtos.SavePermitRequest;
import org.ece.blackrose.customs.web.CustomsDtos.SaveTransitRequest;
import org.ece.blackrose.customs.web.CustomsDtos.TransitResponse;
import org.ece.blackrose.customs.web.CustomsDtos.UsePermitRequest;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.domain.TripCost;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.TripCostRepository;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/customs")
public class CustomsController {

  private static final String VIEW = "hasAuthority('CUSTOMS_VIEW')";
  private static final String EDIT = "hasAuthority('CUSTOMS_EDIT')";
  private static final int SHIPMENT_OPTION_LIMIT = 200;

  private final CustomsService customs;
  private final CustomsDeclarationRepository declarations;
  private final TransitDocumentRepository transits;
  private final RoadPermitRepository permits;
  private final PermitUsageRepository usages;
  private final BorderCrossingRepository crossings;
  private final ShipmentRepository shipments;
  private final TripCostRepository costs;
  private final AccountRepository accounts;
  private final TenantClock clock;
  private final BranchScopeService scope;

  public CustomsController(
      CustomsService customs,
      CustomsDeclarationRepository declarations,
      TransitDocumentRepository transits,
      RoadPermitRepository permits,
      PermitUsageRepository usages,
      BorderCrossingRepository crossings,
      ShipmentRepository shipments,
      TripCostRepository costs,
      AccountRepository accounts,
      TenantClock clock,
      BranchScopeService scope) {
    this.customs = customs;
    this.declarations = declarations;
    this.transits = transits;
    this.permits = permits;
    this.usages = usages;
    this.crossings = crossings;
    this.shipments = shipments;
    this.costs = costs;
    this.accounts = accounts;
    this.clock = clock;
    this.scope = scope;
  }

  // Beyan

  @GetMapping("/declarations")
  @PreAuthorize(VIEW)
  List<DeclarationResponse> listDeclarations() {
    return declarationResponses(
        visible(declarations.findAllByOrderByDeclaredOnDesc(), CustomsDeclaration::getShipmentId));
  }

  @GetMapping("/declarations/{id}")
  @PreAuthorize(VIEW)
  DeclarationResponse getDeclaration(@PathVariable UUID id) {
    return declarationResponse(id);
  }

  @PostMapping("/declarations")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  DeclarationResponse createDeclaration(@Valid @RequestBody SaveDeclarationRequest request) {
    return declarationResponses(List.of(customs.createDeclaration(request))).get(0);
  }

  @PostMapping("/declarations/{id}/lines")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  DeclarationResponse addLine(@PathVariable UUID id, @Valid @RequestBody SaveLineRequest request) {
    customs.addLine(id, request);
    return declarationResponse(id);
  }

  @DeleteMapping("/declaration-lines/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize(EDIT)
  void removeLine(@PathVariable UUID id) {
    customs.removeLine(id);
  }

  @PostMapping("/declarations/{id}/status")
  @PreAuthorize(EDIT)
  DeclarationResponse changeStatus(
      @PathVariable UUID id, @Valid @RequestBody ChangeDeclarationStatusRequest request) {
    return declarationResponses(List.of(customs.changeStatus(id, request))).get(0);
  }

  // Transit

  @GetMapping("/transits")
  @PreAuthorize(VIEW)
  List<TransitResponse> listTransits() {
    return transitResponses(
        visible(transits.findAllByOrderByDeadlineAsc(), TransitDocument::getShipmentId));
  }

  @PostMapping("/transits")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  TransitResponse createTransit(@Valid @RequestBody SaveTransitRequest request) {
    return transitResponses(List.of(customs.createTransit(request))).get(0);
  }

  @PostMapping("/transits/{id}/discharge")
  @PreAuthorize(EDIT)
  TransitResponse discharge(@PathVariable UUID id, @Valid @RequestBody DischargeRequest request) {
    return transitResponses(List.of(customs.discharge(id, request.date()))).get(0);
  }

  @PostMapping("/transits/{id}/cancel")
  @PreAuthorize(EDIT)
  TransitResponse cancelTransit(@PathVariable UUID id) {
    return transitResponses(List.of(customs.cancelTransit(id))).get(0);
  }

  // İzin

  @GetMapping("/permits")
  @PreAuthorize(VIEW)
  List<PermitResponse> listPermits() {
    return permits.findAllByOrderByValidToAsc().stream().map(this::permitResponse).toList();
  }

  @PostMapping("/permits")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  PermitResponse createPermit(@Valid @RequestBody SavePermitRequest request) {
    return permitResponse(customs.createPermit(request));
  }

  @PostMapping("/permits/{id}/usages")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  PermitResponse usePermit(@PathVariable UUID id, @Valid @RequestBody UsePermitRequest request) {
    customs.usePermit(id, request);
    return permitResponse(permits.findById(id).orElseThrow());
  }

  @DeleteMapping("/permit-usages/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize(EDIT)
  void releasePermit(@PathVariable UUID id) {
    customs.releasePermit(id);
  }

  // Sınır geçişi

  @GetMapping("/crossings")
  @PreAuthorize(VIEW)
  List<CrossingResponse> listCrossings() {
    return crossingResponses(
        visible(crossings.findAllByOrderByCrossedOnDesc(), BorderCrossing::getShipmentId));
  }

  @PostMapping("/crossings")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  CrossingResponse addCrossing(@Valid @RequestBody SaveCrossingRequest request) {
    return crossingResponses(List.of(customs.addCrossing(request))).get(0);
  }

  @DeleteMapping("/crossings/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize(EDIT)
  void removeCrossing(@PathVariable UUID id) {
    customs.removeCrossing(id);
  }

  @GetMapping("/options")
  @PreAuthorize(VIEW)
  CustomsOptionsResponse options() {
    Set<AccountType> feeTypes = Set.of(AccountType.SUPPLIER, AccountType.CARRIER);
    return new CustomsOptionsResponse(
        shipments
            .search(
                null,
                "",
                scope.filter(null, null),
                PageRequest.of(
                    0, SHIPMENT_OPTION_LIMIT, Sort.by(Sort.Direction.DESC, "plannedPickup")))
            .stream()
            .map(
                shipment ->
                    new Option(
                        shipment.getId(),
                        shipment.getNumber()
                            + " · "
                            + shipment.getOrigin()
                            + " - "
                            + shipment.getDestination()))
            .toList(),
        accounts.findAll().stream()
            .filter(account -> feeTypes.contains(account.getType()))
            .map(account -> new Option(account.getId(), account.getName()))
            .toList());
  }

  // Yanıtlar

  private DeclarationResponse declarationResponse(UUID id) {
    return declarationResponses(List.of(customs.findDeclaration(id))).get(0);
  }

  /** LIMITED kullanıcıda yalnız kapsamdaki seferlerin kayıtları. */
  private <T> List<T> visible(List<T> list, Function<T, UUID> shipmentOf) {
    Set<UUID> allowed = scope.allowedOrNull();
    if (allowed == null) {
      return list;
    }
    Set<UUID> ids = visibleShipments(list.stream().map(shipmentOf).collect(Collectors.toSet()));
    return list.stream().filter(row -> ids.contains(shipmentOf.apply(row))).toList();
  }

  private Set<UUID> visibleShipments(Collection<UUID> ids) {
    Set<UUID> allowed = scope.allowedOrNull();
    return shipments.findAllById(ids).stream()
        .filter(shipment -> allowed == null || allowed.contains(shipment.getBranchId()))
        .map(Shipment::getId)
        .collect(Collectors.toSet());
  }

  private List<DeclarationResponse> declarationResponses(List<CustomsDeclaration> list) {
    Map<UUID, String> numbers =
        shipmentNumbers(list.stream().map(CustomsDeclaration::getShipmentId).toList());
    Map<UUID, List<DeclarationLine>> linesById = customs.linesOf(list);
    return list.stream()
        .map(
            declaration -> {
              List<DeclarationLine> lines = linesById.getOrDefault(declaration.getId(), List.of());
              return new DeclarationResponse(
                  declaration.getId(),
                  declaration.getNumber(),
                  declaration.getShipmentId(),
                  numbers.get(declaration.getShipmentId()),
                  declaration.getType(),
                  declaration.getCustomsOffice(),
                  declaration.getRegistrationNo(),
                  declaration.getDeclaredOn(),
                  declaration.getStatus(),
                  new Money(CustomsService.total(lines), declaration.getCurrency()),
                  lines.stream()
                      .map(
                          line ->
                              new DeclarationLineResponse(
                                  line.getId(),
                                  line.getHsCode(),
                                  line.getDescription(),
                                  line.getQuantity(),
                                  line.getWeightKg(),
                                  line.getValueAmount()))
                      .toList());
            })
        .toList();
  }

  private List<TransitResponse> transitResponses(List<TransitDocument> list) {
    Map<UUID, String> numbers =
        shipmentNumbers(list.stream().map(TransitDocument::getShipmentId).toList());
    LocalDate today = clock.today();
    return list.stream()
        .map(
            transit ->
                new TransitResponse(
                    transit.getId(),
                    transit.getShipmentId(),
                    numbers.get(transit.getShipmentId()),
                    transit.getKind(),
                    transit.getDocumentNo(),
                    transit.getDepartureOffice(),
                    transit.getDestinationOffice(),
                    transit.getGuarantee(),
                    transit.getIssuedOn(),
                    transit.getDeadline(),
                    transit.getDischargedOn(),
                    transit.getStatus(),
                    transit.getStatus() == TransitStatus.OPEN
                        && transit.getDeadline().isBefore(today)))
        .toList();
  }

  private PermitResponse permitResponse(RoadPermit permit) {
    var rows = usages.findByPermitIdOrderByUsedOnDesc(permit.getId());
    Map<UUID, String> numbers = shipmentNumbers(rows.stream().map(u -> u.getShipmentId()).toList());
    return new PermitResponse(
        permit.getId(),
        permit.getNumber(),
        permit.getKind(),
        permit.getCountry(),
        permit.getValidFrom(),
        permit.getValidTo(),
        permit.getQuota(),
        usages.countActive(permit.getId()),
        rows.stream()
            .map(
                usage ->
                    new PermitUsageResponse(
                        usage.getId(),
                        usage.getShipmentId(),
                        numbers.get(usage.getShipmentId()),
                        usage.getUsedOn()))
            .toList());
  }

  private List<CrossingResponse> crossingResponses(List<BorderCrossing> list) {
    Map<UUID, String> numbers =
        shipmentNumbers(list.stream().map(BorderCrossing::getShipmentId).toList());
    Map<UUID, TripCost> costById =
        costs
            .findAllById(
                list.stream()
                    .map(BorderCrossing::getTripCostId)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toSet()))
            .stream()
            .collect(Collectors.toMap(TripCost::getId, Function.identity()));
    Map<UUID, String> names =
        accounts
            .findAllById(
                costById.values().stream().map(TripCost::getAccountId).collect(Collectors.toSet()))
            .stream()
            .collect(Collectors.toMap(Account::getId, Account::getName));
    return list.stream()
        .map(
            crossing -> {
              TripCost cost = costById.get(crossing.getTripCostId());
              return new CrossingResponse(
                  crossing.getId(),
                  crossing.getShipmentId(),
                  numbers.get(crossing.getShipmentId()),
                  crossing.getGate(),
                  crossing.getDirection(),
                  crossing.getCrossedOn(),
                  cost == null ? null : cost.getMoney(),
                  cost == null ? null : names.get(cost.getAccountId()),
                  cost != null && cost.getPostedAt() != null,
                  crossing.getNote());
            })
        .toList();
  }

  /**
   * Sefer numaraları; LIMITED kullanıcıda kapsam dışı seferin numarası yoktur (izin kullanım
   * listesinde {@code null}).
   */
  private Map<UUID, String> shipmentNumbers(Collection<UUID> ids) {
    Set<UUID> allowed = scope.allowedOrNull();
    return shipments.findAllById(ids).stream()
        .filter(shipment -> allowed == null || allowed.contains(shipment.getBranchId()))
        .collect(Collectors.toMap(Shipment::getId, Shipment::getNumber));
  }
}
