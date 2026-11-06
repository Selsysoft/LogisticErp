package org.ece.blackrose.fleet.web;

import jakarta.validation.Valid;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundAccountRepository;
import org.ece.blackrose.fleet.domain.FleetSettings;
import org.ece.blackrose.fleet.domain.FleetTypes.ExpenseKind;
import org.ece.blackrose.fleet.domain.FleetTypes.SubjectType;
import org.ece.blackrose.fleet.service.DriverAdvanceService;
import org.ece.blackrose.fleet.service.FleetInsightService;
import org.ece.blackrose.fleet.service.FleetRegistryService;
import org.ece.blackrose.fleet.service.VehicleExpenseService;
import org.ece.blackrose.fleet.web.FleetDtos.AvailabilityResponse;
import org.ece.blackrose.fleet.web.FleetDtos.BlockResponse;
import org.ece.blackrose.fleet.web.FleetDtos.CreateDriverRequest;
import org.ece.blackrose.fleet.web.FleetDtos.DocumentResponse;
import org.ece.blackrose.fleet.web.FleetDtos.DriverAdvanceRequest;
import org.ece.blackrose.fleet.web.FleetDtos.DriverAdvanceResponse;
import org.ece.blackrose.fleet.web.FleetDtos.DriverResponse;
import org.ece.blackrose.fleet.web.FleetDtos.FleetOptionsResponse;
import org.ece.blackrose.fleet.web.FleetDtos.FleetSettingsResponse;
import org.ece.blackrose.fleet.web.FleetDtos.FuelConsumptionResponse;
import org.ece.blackrose.fleet.web.FleetDtos.FundOption;
import org.ece.blackrose.fleet.web.FleetDtos.Option;
import org.ece.blackrose.fleet.web.FleetDtos.ReminderResponse;
import org.ece.blackrose.fleet.web.FleetDtos.ReverseExpenseRequest;
import org.ece.blackrose.fleet.web.FleetDtos.SaveBlockRequest;
import org.ece.blackrose.fleet.web.FleetDtos.SaveDocumentRequest;
import org.ece.blackrose.fleet.web.FleetDtos.SaveFleetSettingsRequest;
import org.ece.blackrose.fleet.web.FleetDtos.SaveVehicleExpenseRequest;
import org.ece.blackrose.fleet.web.FleetDtos.SaveVehicleRequest;
import org.ece.blackrose.fleet.web.FleetDtos.UpdateDriverRequest;
import org.ece.blackrose.fleet.web.FleetDtos.VehicleCostRow;
import org.ece.blackrose.fleet.web.FleetDtos.VehicleExpenseResponse;
import org.ece.blackrose.fleet.web.FleetDtos.VehicleResponse;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/fleet")
public class FleetController {

  private static final String VIEW = "hasAuthority('FLEET_VIEW')";
  private static final String EDIT = "hasAuthority('FLEET_EDIT')";

  private final FleetRegistryService registry;
  private final VehicleExpenseService expenses;
  private final FleetInsightService insights;
  private final AccountRepository accounts;
  private final FundAccountRepository funds;
  private final TenantClock clock;
  private final FleetMapper mapper;
  private final DriverAdvanceService advances;

  public FleetController(
      FleetRegistryService registry,
      VehicleExpenseService expenses,
      FleetInsightService insights,
      AccountRepository accounts,
      FundAccountRepository funds,
      TenantClock clock,
      FleetMapper mapper,
      DriverAdvanceService advances) {
    this.advances = advances;
    this.registry = registry;
    this.expenses = expenses;
    this.insights = insights;
    this.accounts = accounts;
    this.funds = funds;
    this.clock = clock;
    this.mapper = mapper;
  }

  // Araç

  @GetMapping("/vehicles")
  @PreAuthorize(VIEW)
  PageResponse<VehicleResponse> listVehicles(
      @RequestParam(required = false) String search, Pageable pageable) {
    return PageResponse.from(registry.listVehicles(search, pageable), mapper::toResponse);
  }

  @GetMapping("/vehicles/{id}")
  @PreAuthorize(VIEW)
  VehicleResponse getVehicle(@PathVariable UUID id) {
    return mapper.toResponse(registry.getVehicle(id));
  }

  @PostMapping("/vehicles")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  VehicleResponse createVehicle(@Valid @RequestBody SaveVehicleRequest request) {
    return mapper.toResponse(registry.createVehicle(request));
  }

  @PutMapping("/vehicles/{id}")
  @PreAuthorize(EDIT)
  VehicleResponse updateVehicle(
      @PathVariable UUID id, @Valid @RequestBody SaveVehicleRequest request) {
    return mapper.toResponse(registry.updateVehicle(id, request));
  }

  // Sürücü

  @GetMapping("/drivers")
  @PreAuthorize(VIEW)
  PageResponse<DriverResponse> listDrivers(
      @RequestParam(required = false) String search, Pageable pageable) {
    return PageResponse.from(registry.listDrivers(search, pageable), mapper::toResponse);
  }

  @GetMapping("/drivers/{id}")
  @PreAuthorize(VIEW)
  DriverResponse getDriver(@PathVariable UUID id) {
    return mapper.toResponse(registry.getDriver(id));
  }

  @PostMapping("/drivers")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  DriverResponse createDriver(@Valid @RequestBody CreateDriverRequest request) {
    return mapper.toResponse(registry.createDriver(request));
  }

  @PutMapping("/drivers/{id}")
  @PreAuthorize(EDIT)
  DriverResponse updateDriver(
      @PathVariable UUID id, @Valid @RequestBody UpdateDriverRequest request) {
    return mapper.toResponse(registry.updateDriver(id, request));
  }

  @PostMapping("/drivers/{id}/advances")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  DriverAdvanceResponse giveAdvance(
      @PathVariable UUID id,
      @Valid @RequestBody DriverAdvanceRequest request,
      @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey) {
    return new DriverAdvanceResponse(advances.giveAdvance(id, request, idempotencyKey).getId());
  }

  // Belge ve takvim (subject: VEHICLE veya DRIVER)

  @GetMapping("/{subject}/{id}/documents")
  @PreAuthorize(VIEW)
  List<DocumentResponse> listDocuments(@PathVariable SubjectType subject, @PathVariable UUID id) {
    return registry.listDocuments(subject, id).stream().map(mapper::toResponse).toList();
  }

  @PostMapping("/{subject}/{id}/documents")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  DocumentResponse addDocument(
      @PathVariable SubjectType subject,
      @PathVariable UUID id,
      @Valid @RequestBody SaveDocumentRequest request) {
    return mapper.toResponse(registry.addDocument(subject, id, request));
  }

  @DeleteMapping("/documents/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize(EDIT)
  void deleteDocument(@PathVariable UUID id) {
    registry.deleteDocument(id);
  }

  @GetMapping("/{subject}/{id}/blocks")
  @PreAuthorize(VIEW)
  List<BlockResponse> listBlocks(@PathVariable SubjectType subject, @PathVariable UUID id) {
    return registry.listBlocks(subject, id).stream().map(mapper::toResponse).toList();
  }

  @PostMapping("/{subject}/{id}/blocks")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  BlockResponse addBlock(
      @PathVariable SubjectType subject,
      @PathVariable UUID id,
      @Valid @RequestBody SaveBlockRequest request) {
    return mapper.toResponse(registry.addBlock(subject, id, request));
  }

  @DeleteMapping("/blocks/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize(EDIT)
  void deleteBlock(@PathVariable UUID id) {
    registry.deleteBlock(id);
  }

  // Gider

  @GetMapping("/expenses")
  @PreAuthorize(VIEW)
  PageResponse<VehicleExpenseResponse> listExpenses(
      @RequestParam(required = false) UUID vehicleId,
      @RequestParam(required = false) ExpenseKind kind,
      Pageable pageable) {
    return PageResponse.from(expenses.list(vehicleId, kind, pageable), mapper::toResponse);
  }

  @PostMapping("/vehicles/{id}/expenses")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  VehicleExpenseResponse createExpense(
      @PathVariable UUID id, @Valid @RequestBody SaveVehicleExpenseRequest request) {
    return mapper.toResponse(expenses.create(id, request));
  }

  @PostMapping("/expenses/{id}/reverse")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize(EDIT)
  void reverseExpense(@PathVariable UUID id, @Valid @RequestBody ReverseExpenseRequest request) {
    expenses.reverse(id, request.date());
  }

  @GetMapping("/options")
  @PreAuthorize(VIEW)
  FleetOptionsResponse options() {
    return new FleetOptionsResponse(
        accounts.findAll().stream()
            .filter(
                account ->
                    account.getType() == AccountType.SUPPLIER
                        || account.getType() == AccountType.CARRIER)
            .map(account -> new Option(account.getId(), account.getName()))
            .toList(),
        funds.findAll().stream()
            .map(
                fund ->
                    new FundOption(
                        fund.getId(), fund.getName(), fund.getKind().name(), fund.getCurrency()))
            .toList());
  }

  // Hatırlatma, uygunluk ve rapor

  @GetMapping("/reminders")
  @PreAuthorize(VIEW)
  List<ReminderResponse> reminders(@RequestParam(required = false) Integer days) {
    return insights.reminders(clock.today(), days);
  }

  @GetMapping("/availability")
  @PreAuthorize(VIEW)
  List<AvailabilityResponse> availability(
      @RequestParam SubjectType type,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) BigDecimal minTon) {
    return insights.availability(type, from, to, minTon);
  }

  @GetMapping("/vehicles/{id}/fuel-consumption")
  @PreAuthorize(VIEW)
  FuelConsumptionResponse fuelConsumption(@PathVariable UUID id) {
    return insights.fuelConsumption(id);
  }

  @GetMapping("/reports/vehicle-costs")
  @PreAuthorize(VIEW)
  List<VehicleCostRow> vehicleCosts(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
    return insights.vehicleCosts(from, to);
  }

  // Ayarlar

  @GetMapping("/settings")
  @PreAuthorize(VIEW)
  FleetSettingsResponse getSettings() {
    return toResponse(registry.settings());
  }

  @PutMapping("/settings")
  @PreAuthorize(EDIT)
  FleetSettingsResponse saveSettings(@Valid @RequestBody SaveFleetSettingsRequest request) {
    return toResponse(
        registry.updateSettings(
            request.blockOnExpired(), request.reminderDays(), request.reminderEmail()));
  }

  private static FleetSettingsResponse toResponse(FleetSettings settings) {
    return new FleetSettingsResponse(
        settings.isBlockOnExpired(), settings.getReminderDays(), settings.isReminderEmail());
  }
}
