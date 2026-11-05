package org.ece.blackrose.integration.web;

import jakarta.validation.Valid;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FundTransaction;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundAccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundTransactionRepository;
import org.ece.blackrose.fleet.domain.Vehicle;
import org.ece.blackrose.fleet.repository.FleetRepositories.VehicleRepository;
import org.ece.blackrose.integration.domain.BankStatementLine;
import org.ece.blackrose.integration.domain.EDocument;
import org.ece.blackrose.integration.domain.EDocumentSettings;
import org.ece.blackrose.integration.domain.Geofence;
import org.ece.blackrose.integration.domain.ImportBatch;
import org.ece.blackrose.integration.domain.ImportRow;
import org.ece.blackrose.integration.domain.IntegrationTypes.ImportKind;
import org.ece.blackrose.integration.domain.RouteDistance;
import org.ece.blackrose.integration.domain.VehiclePosition;
import org.ece.blackrose.integration.repository.IntegrationRepositories.BankStatementLineRepository;
import org.ece.blackrose.integration.repository.IntegrationRepositories.EDocumentRepository;
import org.ece.blackrose.integration.repository.IntegrationRepositories.GeofenceEventRepository;
import org.ece.blackrose.integration.repository.IntegrationRepositories.GeofenceRepository;
import org.ece.blackrose.integration.repository.IntegrationRepositories.ImportBatchRepository;
import org.ece.blackrose.integration.repository.IntegrationRepositories.RouteDistanceRepository;
import org.ece.blackrose.integration.repository.IntegrationRepositories.VehiclePositionRepository;
import org.ece.blackrose.integration.service.BankStatementService;
import org.ece.blackrose.integration.service.EDocumentService;
import org.ece.blackrose.integration.service.ExpenseImportService;
import org.ece.blackrose.integration.service.GpsService;
import org.ece.blackrose.integration.service.TableDistanceProvider;
import org.ece.blackrose.integration.web.IntegrationDtos.AssignRowRequest;
import org.ece.blackrose.integration.web.IntegrationDtos.DistanceResponse;
import org.ece.blackrose.integration.web.IntegrationDtos.EDocumentCandidate;
import org.ece.blackrose.integration.web.IntegrationDtos.EDocumentResponse;
import org.ece.blackrose.integration.web.IntegrationDtos.EDocumentSettingsResponse;
import org.ece.blackrose.integration.web.IntegrationDtos.GeofenceEventResponse;
import org.ece.blackrose.integration.web.IntegrationDtos.GeofenceResponse;
import org.ece.blackrose.integration.web.IntegrationDtos.ImportBatchResponse;
import org.ece.blackrose.integration.web.IntegrationDtos.ImportDetailResponse;
import org.ece.blackrose.integration.web.IntegrationDtos.ImportRowResponse;
import org.ece.blackrose.integration.web.IntegrationDtos.IngestPositionsRequest;
import org.ece.blackrose.integration.web.IntegrationDtos.IngestResultResponse;
import org.ece.blackrose.integration.web.IntegrationDtos.IntegrationOptionsResponse;
import org.ece.blackrose.integration.web.IntegrationDtos.MatchLineRequest;
import org.ece.blackrose.integration.web.IntegrationDtos.OpenTransactionResponse;
import org.ece.blackrose.integration.web.IntegrationDtos.Option;
import org.ece.blackrose.integration.web.IntegrationDtos.PositionResponse;
import org.ece.blackrose.integration.web.IntegrationDtos.ReconciliationResponse;
import org.ece.blackrose.integration.web.IntegrationDtos.SaveDistanceRequest;
import org.ece.blackrose.integration.web.IntegrationDtos.SaveEDocumentSettingsRequest;
import org.ece.blackrose.integration.web.IntegrationDtos.SaveGeofenceRequest;
import org.ece.blackrose.integration.web.IntegrationDtos.SendEDocumentRequest;
import org.ece.blackrose.integration.web.IntegrationDtos.StatementImportResponse;
import org.ece.blackrose.integration.web.IntegrationDtos.StatementLineResponse;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.domain.ShipmentLeg;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentLegRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/integration")
public class IntegrationController {

  private static final String SHIPMENT_VIEW = "hasAuthority('SHIPMENT_VIEW')";
  private static final String DISPATCH = "hasAuthority('SHIPMENT_DISPATCH')";
  private static final String INVOICE = "hasAuthority('SHIPMENT_INVOICE')";
  private static final String FLEET_VIEW = "hasAuthority('FLEET_VIEW')";
  private static final String FLEET_EDIT = "hasAuthority('FLEET_EDIT')";
  private static final String FINANCE_VIEW = "hasAuthority('FINANCE_VIEW')";
  private static final String FINANCE_MANAGE = "hasAuthority('FINANCE_MANAGE')";
  private static final int SHIPMENT_OPTION_LIMIT = 200;
  private static final int EVENT_LIMIT = 100;
  private static final int OPEN_TX_WINDOW_DAYS = 45;

  private final EDocumentService edocuments;
  private final EDocumentRepository edocumentRows;
  private final ExpenseImportService imports;
  private final ImportBatchRepository batches;
  private final GpsService gps;
  private final VehiclePositionRepository positions;
  private final GeofenceRepository geofences;
  private final GeofenceEventRepository geofenceEvents;
  private final BankStatementService bank;
  private final BankStatementLineRepository statementLines;
  private final RouteDistanceRepository routes;
  private final VehicleRepository vehicles;
  private final ShipmentRepository shipments;
  private final ShipmentLegRepository legs;
  private final AccountRepository accounts;
  private final FundAccountRepository funds;
  private final FundTransactionRepository fundTransactions;

  public IntegrationController(
      EDocumentService edocuments,
      EDocumentRepository edocumentRows,
      ExpenseImportService imports,
      ImportBatchRepository batches,
      GpsService gps,
      VehiclePositionRepository positions,
      GeofenceRepository geofences,
      GeofenceEventRepository geofenceEvents,
      BankStatementService bank,
      BankStatementLineRepository statementLines,
      RouteDistanceRepository routes,
      VehicleRepository vehicles,
      ShipmentRepository shipments,
      ShipmentLegRepository legs,
      AccountRepository accounts,
      FundAccountRepository funds,
      FundTransactionRepository fundTransactions) {
    this.edocuments = edocuments;
    this.edocumentRows = edocumentRows;
    this.imports = imports;
    this.batches = batches;
    this.gps = gps;
    this.positions = positions;
    this.geofences = geofences;
    this.geofenceEvents = geofenceEvents;
    this.bank = bank;
    this.statementLines = statementLines;
    this.routes = routes;
    this.vehicles = vehicles;
    this.shipments = shipments;
    this.legs = legs;
    this.accounts = accounts;
    this.funds = funds;
    this.fundTransactions = fundTransactions;
  }

  // e-Belge

  @GetMapping("/e-document-settings")
  @PreAuthorize(SHIPMENT_VIEW)
  EDocumentSettingsResponse edocumentSettings() {
    return settingsResponse(edocuments.settings());
  }

  @PutMapping("/e-document-settings")
  @PreAuthorize(INVOICE)
  EDocumentSettingsResponse saveEdocumentSettings(
      @Valid @RequestBody SaveEDocumentSettingsRequest request) {
    return settingsResponse(
        edocuments.saveSettings(request.taxNumber(), request.taxOffice(), request.address()));
  }

  @GetMapping("/e-documents")
  @PreAuthorize(SHIPMENT_VIEW)
  List<EDocumentResponse> listEdocuments() {
    return edocumentRows.findAllByOrderByCreatedAtDesc().stream()
        .map(IntegrationController::edocumentResponse)
        .toList();
  }

  @GetMapping("/e-documents/candidates")
  @PreAuthorize(SHIPMENT_VIEW)
  List<EDocumentCandidate> edocumentCandidates() {
    return edocuments.candidates();
  }

  @PostMapping("/e-documents")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(INVOICE)
  EDocumentResponse sendEdocument(@Valid @RequestBody SendEDocumentRequest request) {
    return edocumentResponse(edocuments.send(request));
  }

  @PostMapping("/e-documents/{id}/refresh")
  @PreAuthorize(INVOICE)
  EDocumentResponse refreshEdocument(@PathVariable UUID id) {
    return edocumentResponse(edocuments.refresh(id));
  }

  @PostMapping("/e-documents/{id}/cancel")
  @PreAuthorize(INVOICE)
  EDocumentResponse cancelEdocument(@PathVariable UUID id) {
    return edocumentResponse(edocuments.cancel(id));
  }

  @GetMapping("/e-documents/{id}/ubl")
  @PreAuthorize(SHIPMENT_VIEW)
  ResponseEntity<String> edocumentUbl(@PathVariable UUID id) {
    EDocument document =
        edocumentRows
            .findById(id)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "EDOCUMENT_NOT_FOUND", "e-Belge bulunamadı."));
    return ResponseEntity.ok().contentType(MediaType.APPLICATION_XML).body(document.getUbl());
  }

  // HGS/OGS ve yakıt kartı

  @GetMapping("/imports")
  @PreAuthorize(FLEET_VIEW)
  List<ImportBatchResponse> listImports() {
    return batches.findAllByOrderByCreatedAtDesc().stream().map(this::batchResponse).toList();
  }

  @GetMapping("/imports/{id}")
  @PreAuthorize(FLEET_VIEW)
  ImportDetailResponse getImport(@PathVariable UUID id) {
    return importDetail(id);
  }

  @PostMapping(value = "/imports", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(FLEET_EDIT)
  ImportDetailResponse uploadImport(
      @RequestParam ImportKind kind,
      @RequestParam UUID accountId,
      @RequestParam UUID branchId,
      @RequestParam MultipartFile file)
      throws IOException {
    ImportBatch batch =
        imports.upload(kind, file.getOriginalFilename(), file.getBytes(), accountId, branchId);
    return importDetail(batch.getId());
  }

  @PostMapping("/imports/{id}/post")
  @PreAuthorize(FLEET_EDIT)
  ImportDetailResponse postImport(@PathVariable UUID id) {
    imports.post(id);
    return importDetail(id);
  }

  @PutMapping("/import-rows/{id}")
  @PreAuthorize(FLEET_EDIT)
  ImportDetailResponse assignRow(
      @PathVariable UUID id, @Valid @RequestBody AssignRowRequest request) {
    return importDetail(imports.assign(id, request.shipmentId()).getBatchId());
  }

  @PostMapping("/import-rows/{id}/ignore")
  @PreAuthorize(FLEET_EDIT)
  ImportDetailResponse ignoreRow(@PathVariable UUID id) {
    return importDetail(imports.ignore(id).getBatchId());
  }

  // GPS

  @PostMapping("/gps/positions")
  @PreAuthorize(FLEET_EDIT)
  IngestResultResponse ingestPositions(@Valid @RequestBody IngestPositionsRequest request) {
    return gps.ingest(request.positions());
  }

  @GetMapping("/gps/positions")
  @PreAuthorize(SHIPMENT_VIEW)
  List<PositionResponse> latestPositions() {
    return positionResponses(positions.latestPerVehicle());
  }

  /** Seferin araçlarının son konumu; sefer takibinde gösterilir. */
  @GetMapping("/gps/shipments/{id}")
  @PreAuthorize(SHIPMENT_VIEW)
  List<PositionResponse> shipmentPositions(@PathVariable UUID id) {
    return positionResponses(
        legs.findByShipmentIdOrderBySequenceNo(id).stream()
            .map(ShipmentLeg::getVehicleId)
            .filter(Objects::nonNull)
            .distinct()
            .flatMap(
                vehicle -> positions.findFirstByVehicleIdOrderByRecordedAtDesc(vehicle).stream())
            .toList());
  }

  @GetMapping("/gps/geofences")
  @PreAuthorize(SHIPMENT_VIEW)
  List<GeofenceResponse> listGeofences() {
    return geofences.findAll(Sort.by("name")).stream()
        .map(
            zone ->
                new GeofenceResponse(
                    zone.getId(),
                    zone.getName(),
                    zone.getLatitude(),
                    zone.getLongitude(),
                    zone.getRadiusM()))
        .toList();
  }

  @PostMapping("/gps/geofences")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(FLEET_EDIT)
  @Transactional
  public GeofenceResponse createGeofence(@Valid @RequestBody SaveGeofenceRequest request) {
    Geofence zone =
        geofences.save(
            new Geofence(
                request.name(), request.latitude(), request.longitude(), request.radiusM()));
    return new GeofenceResponse(
        zone.getId(), zone.getName(), zone.getLatitude(), zone.getLongitude(), zone.getRadiusM());
  }

  @DeleteMapping("/gps/geofences/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize(FLEET_EDIT)
  @Transactional
  public void deleteGeofence(@PathVariable UUID id) {
    geofences.findById(id).ifPresent(Geofence::markDeleted);
  }

  @GetMapping("/gps/events")
  @PreAuthorize(SHIPMENT_VIEW)
  List<GeofenceEventResponse> geofenceEvents() {
    var rows = geofenceEvents.findAllByOrderByOccurredAtDesc(PageRequest.of(0, EVENT_LIMIT));
    Map<UUID, String> zones =
        geofences.findAll().stream().collect(Collectors.toMap(Geofence::getId, Geofence::getName));
    Map<UUID, String> plates = plates();
    Map<UUID, String> numbers =
        shipmentNumbers(
            rows.stream().map(row -> row.getShipmentId()).filter(Objects::nonNull).toList());
    return rows.stream()
        .map(
            row ->
                new GeofenceEventResponse(
                    row.getId(),
                    zones.get(row.getGeofenceId()),
                    plates.get(row.getVehicleId()),
                    numbers.get(row.getShipmentId()),
                    row.getType(),
                    row.getOccurredAt()))
        .toList();
  }

  // Banka

  @GetMapping("/bank/{fundId}/lines")
  @PreAuthorize(FINANCE_VIEW)
  List<StatementLineResponse> statementLines(@PathVariable UUID fundId) {
    return statementLines.findByFundAccountIdOrderByLineDateDesc(fundId).stream()
        .map(this::lineResponse)
        .toList();
  }

  @GetMapping("/bank/{fundId}/summary")
  @PreAuthorize(FINANCE_VIEW)
  ReconciliationResponse bankSummary(@PathVariable UUID fundId) {
    return bank.summary(fundId);
  }

  @PostMapping(value = "/bank/{fundId}/statements", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(FINANCE_MANAGE)
  StatementImportResponse uploadStatement(
      @PathVariable UUID fundId, @RequestParam MultipartFile file) throws IOException {
    return bank.upload(fundId, file.getBytes());
  }

  @GetMapping("/bank/lines/{id}/candidates")
  @PreAuthorize(FINANCE_VIEW)
  List<OpenTransactionResponse> lineCandidates(@PathVariable UUID id) {
    BankStatementLine line = statementLines.findById(id).orElseThrow();
    return statementLines
        .openTransactions(
            line.getFundAccountId(),
            line.getLineDate().minusDays(OPEN_TX_WINDOW_DAYS),
            line.getLineDate().plusDays(OPEN_TX_WINDOW_DAYS))
        .stream()
        .map(
            transaction ->
                new OpenTransactionResponse(
                    transaction.getId(),
                    transaction.getTransactionDate(),
                    signed(transaction),
                    transaction.getDescription()))
        .toList();
  }

  @PostMapping("/bank/lines/{id}/match")
  @PreAuthorize(FINANCE_MANAGE)
  StatementLineResponse matchLine(
      @PathVariable UUID id, @Valid @RequestBody MatchLineRequest request) {
    return lineResponse(bank.match(id, request.transactionId()));
  }

  @PostMapping("/bank/lines/{id}/unmatch")
  @PreAuthorize(FINANCE_MANAGE)
  StatementLineResponse unmatchLine(@PathVariable UUID id) {
    return lineResponse(bank.unmatch(id));
  }

  @PostMapping("/bank/lines/{id}/ignore")
  @PreAuthorize(FINANCE_MANAGE)
  StatementLineResponse ignoreLine(@PathVariable UUID id) {
    return lineResponse(bank.ignore(id));
  }

  // Mesafe

  @GetMapping("/distances")
  @PreAuthorize(SHIPMENT_VIEW)
  List<DistanceResponse> listDistances() {
    return routes.findAllByOrderByOriginAscDestinationAsc().stream()
        .map(IntegrationController::distanceResponse)
        .toList();
  }

  @PostMapping("/distances")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(DISPATCH)
  @Transactional
  public DistanceResponse saveDistance(@Valid @RequestBody SaveDistanceRequest request) {
    String key = TableDistanceProvider.key(request.origin(), request.destination());
    if (routes.findByRouteKey(key).isPresent()) {
      throw new BusinessException(HttpStatus.CONFLICT, "CODE_TAKEN", "Bu güzergâh kayıtlı.");
    }
    return distanceResponse(
        routes.save(
            new RouteDistance(
                request.origin().trim(),
                request.destination().trim(),
                key,
                request.distanceKm(),
                request.minutes())));
  }

  @DeleteMapping("/distances/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize(DISPATCH)
  @Transactional
  public void deleteDistance(@PathVariable UUID id) {
    routes.deleteById(id);
  }

  // Seçenekler

  @GetMapping("/options")
  @PreAuthorize("hasAuthority('INTEGRATION_VIEW')")
  IntegrationOptionsResponse options() {
    Set<AccountType> payees = Set.of(AccountType.SUPPLIER, AccountType.CARRIER);
    return new IntegrationOptionsResponse(
        shipments
            .findAll(
                PageRequest.of(
                    0, SHIPMENT_OPTION_LIMIT, Sort.by(Sort.Direction.DESC, "plannedPickup")))
            .stream()
            .map(shipment -> new Option(shipment.getId(), shipment.getNumber()))
            .toList(),
        accounts.findAll().stream()
            .filter(account -> payees.contains(account.getType()))
            .map(account -> new Option(account.getId(), account.getName()))
            .toList(),
        funds.findAll().stream()
            .filter(fund -> "BANK".equals(fund.getKind().name()))
            .map(fund -> new Option(fund.getId(), fund.getName()))
            .toList());
  }

  // Yanıtlar

  private EDocumentSettingsResponse settingsResponse(EDocumentSettings row) {
    return new EDocumentSettingsResponse(
        row.getTaxNumber(),
        row.getTaxOffice(),
        row.getAddress(),
        edocuments.provider().name(),
        edocuments.provider().isTest());
  }

  private static EDocumentResponse edocumentResponse(EDocument document) {
    return new EDocumentResponse(
        document.getId(),
        document.getKind(),
        document.getSourceType(),
        document.getSourceId(),
        document.getSourceNo(),
        document.getEttn(),
        document.getProvider(),
        document.getProviderRef(),
        document.getStatus(),
        document.getMessage());
  }

  private ImportBatchResponse batchResponse(ImportBatch batch) {
    return new ImportBatchResponse(
        batch.getId(),
        batch.getKind(),
        batch.getFileName(),
        batch.getAccountId(),
        accounts.findById(batch.getAccountId()).map(Account::getName).orElse(null),
        batch.getDuplicates(),
        batch.getCreatedAt());
  }

  private ImportDetailResponse importDetail(UUID id) {
    ImportBatch batch =
        batches
            .findById(id)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "IMPORT_NOT_FOUND", "İçe aktarım bulunamadı."));
    List<ImportRow> rows = imports.rowsOf(id);
    Map<UUID, String> numbers =
        shipmentNumbers(
            rows.stream().map(ImportRow::getShipmentId).filter(Objects::nonNull).toList());
    return new ImportDetailResponse(
        batchResponse(batch),
        rows.stream()
            .map(
                row ->
                    new ImportRowResponse(
                        row.getId(),
                        row.getLineNo(),
                        row.getPlate(),
                        row.getOccurredAt(),
                        row.getPlace(),
                        row.getAmount() == null ? null : row.getMoney(),
                        row.getLiters(),
                        row.getOdometerKm(),
                        row.getShipmentId(),
                        numbers.get(row.getShipmentId()),
                        row.getStatus(),
                        row.getMessage()))
            .toList());
  }

  private List<PositionResponse> positionResponses(List<VehiclePosition> rows) {
    Map<UUID, String> plates = plates();
    return rows.stream()
        .map(
            row -> {
              UUID shipmentId =
                  legs.billableAt(row.getVehicleId(), row.getRecordedAt()).stream()
                      .map(ShipmentLeg::getShipmentId)
                      .findFirst()
                      .orElse(null);
              return new PositionResponse(
                  row.getVehicleId(),
                  plates.get(row.getVehicleId()),
                  row.getRecordedAt(),
                  row.getLatitude(),
                  row.getLongitude(),
                  row.getSpeedKmh(),
                  shipmentId,
                  shipmentId == null
                      ? null
                      : shipments.findById(shipmentId).map(Shipment::getNumber).orElse(null));
            })
        .toList();
  }

  private StatementLineResponse lineResponse(BankStatementLine line) {
    String matched =
        line.getMatchedTransactionId() == null
            ? null
            : fundTransactions
                .findById(line.getMatchedTransactionId())
                .map(FundTransaction::getDescription)
                .orElse(null);
    return new StatementLineResponse(
        line.getId(),
        line.getFundAccountId(),
        line.getLineDate(),
        line.getAmount(),
        line.getDescription(),
        line.getReference(),
        line.getStatus(),
        line.getMatchedTransactionId(),
        matched);
  }

  private static java.math.BigDecimal signed(FundTransaction transaction) {
    return "OUT".equals(transaction.getDirection().name())
        ? transaction.getMoney().amount().negate()
        : transaction.getMoney().amount();
  }

  private static DistanceResponse distanceResponse(RouteDistance route) {
    return new DistanceResponse(
        route.getId(),
        route.getOrigin(),
        route.getDestination(),
        route.getDistanceKm(),
        route.getMinutes());
  }

  private Map<UUID, String> plates() {
    return vehicles.findAll().stream()
        .collect(Collectors.toMap(Vehicle::getId, Vehicle::getPlate, (a, b) -> a));
  }

  private Map<UUID, String> shipmentNumbers(List<UUID> ids) {
    return shipments.findAllById(ids).stream()
        .collect(Collectors.toMap(Shipment::getId, Shipment::getNumber));
  }
}
