package org.ece.blackrose.fleet.service;

import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.fleet.domain.ComplianceDocument;
import org.ece.blackrose.fleet.domain.Driver;
import org.ece.blackrose.fleet.domain.FleetSettings;
import org.ece.blackrose.fleet.domain.FleetTypes.SubjectType;
import org.ece.blackrose.fleet.domain.ResourceBlock;
import org.ece.blackrose.fleet.domain.Vehicle;
import org.ece.blackrose.fleet.repository.FleetRepositories.ComplianceDocumentRepository;
import org.ece.blackrose.fleet.repository.FleetRepositories.DriverRepository;
import org.ece.blackrose.fleet.repository.FleetRepositories.FleetSettingsRepository;
import org.ece.blackrose.fleet.repository.FleetRepositories.ResourceBlockRepository;
import org.ece.blackrose.fleet.repository.FleetRepositories.VehicleRepository;
import org.ece.blackrose.fleet.web.FleetDtos.CreateDriverRequest;
import org.ece.blackrose.fleet.web.FleetDtos.SaveBlockRequest;
import org.ece.blackrose.fleet.web.FleetDtos.SaveDocumentRequest;
import org.ece.blackrose.fleet.web.FleetDtos.SaveVehicleRequest;
import org.ece.blackrose.fleet.web.FleetDtos.UpdateDriverRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Araç ve sürücü kütüğü, belgeleri, takvim kapatmaları ve filo ayarları. */
@Service
public class FleetRegistryService {

  private static final String DRIVER_ACCOUNT_PREFIX = "SRC-";

  private final VehicleRepository vehicles;
  private final DriverRepository drivers;
  private final ComplianceDocumentRepository documents;
  private final ResourceBlockRepository blocks;
  private final FleetSettingsRepository settings;
  private final AccountRepository accounts;
  private final org.ece.blackrose.saas.service.PlanLimitService planLimits;

  public FleetRegistryService(
      VehicleRepository vehicles,
      DriverRepository drivers,
      ComplianceDocumentRepository documents,
      ResourceBlockRepository blocks,
      FleetSettingsRepository settings,
      AccountRepository accounts,
      org.ece.blackrose.saas.service.PlanLimitService planLimits) {
    this.planLimits = planLimits;
    this.vehicles = vehicles;
    this.drivers = drivers;
    this.documents = documents;
    this.blocks = blocks;
    this.settings = settings;
    this.accounts = accounts;
  }

  @Transactional(readOnly = true)
  public Page<Vehicle> listVehicles(String search, Pageable pageable) {
    return vehicles.search(normalizeSearch(search), pageable);
  }

  @Transactional(readOnly = true)
  public Vehicle getVehicle(UUID id) {
    return findVehicle(id);
  }

  @Transactional
  public Vehicle createVehicle(SaveVehicleRequest request) {
    planLimits.require(org.ece.blackrose.saas.domain.SaasTypes.LimitedResource.VEHICLES);
    String plate = normalizePlate(request.plate());
    if (vehicles.findByPlate(plate).isPresent()) {
      throw new BusinessException(HttpStatus.CONFLICT, "PLATE_TAKEN", "Bu plaka zaten kayıtlı.");
    }
    return vehicles.save(new Vehicle(plate, request));
  }

  @Transactional
  public Vehicle updateVehicle(UUID id, SaveVehicleRequest request) {
    Vehicle vehicle = findVehicle(id);
    String plate = normalizePlate(request.plate());
    vehicles
        .findByPlate(plate)
        .filter(other -> !other.getId().equals(id))
        .ifPresent(
            other -> {
              throw new BusinessException(
                  HttpStatus.CONFLICT, "PLATE_TAKEN", "Bu plaka zaten kayıtlı.");
            });
    vehicle.update(plate, request);
    return vehicle;
  }

  @Transactional(readOnly = true)
  public Page<Driver> listDrivers(String search, Pageable pageable) {
    return drivers.search(normalizeSearch(search), pageable);
  }

  @Transactional(readOnly = true)
  public Driver getDriver(UUID id) {
    return findDriver(id);
  }

  /** Sürücüyle birlikte harcırah ve avans için personel carisi açılır. */
  @Transactional
  public Driver createDriver(CreateDriverRequest request) {
    if (drivers.findByCode(request.code()).isPresent()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "DRIVER_CODE_TAKEN", "Bu sürücü kodu kullanımda.");
    }
    String accountCode = DRIVER_ACCOUNT_PREFIX + request.code();
    if (accounts.findByCode(accountCode).isPresent()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "ACCOUNT_CODE_TAKEN", "Bu sürücü için cari kodu kullanımda.");
    }
    Account account =
        accounts.save(
            new Account(
                accountCode, request.fullName(), AccountType.EMPLOYEE, null, request.branchId()));
    return drivers.save(
        new Driver(
            request.code(),
            request.fullName(),
            request.phone(),
            request.licenseClass(),
            request.status(),
            account.getId(),
            request.branchId()));
  }

  @Transactional
  public Driver updateDriver(UUID id, UpdateDriverRequest request) {
    Driver driver = findDriver(id);
    driver.update(
        request.fullName(),
        request.phone(),
        request.licenseClass(),
        request.status(),
        request.branchId());
    return driver;
  }

  @Transactional(readOnly = true)
  public List<ComplianceDocument> listDocuments(SubjectType type, UUID subjectId) {
    ensureSubject(type, subjectId);
    return documents.findBySubjectTypeAndSubjectIdOrderByExpiresOnDesc(type, subjectId);
  }

  @Transactional
  public ComplianceDocument addDocument(
      SubjectType type, UUID subjectId, SaveDocumentRequest request) {
    ensureSubject(type, subjectId);
    if (request.issuedOn() != null && request.expiresOn().isBefore(request.issuedOn())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "DOCUMENT_DATES_INVALID",
          "Bitiş tarihi düzenleme tarihinden önce olamaz.");
    }
    return documents.save(
        new ComplianceDocument(
            type,
            subjectId,
            request.docType(),
            request.number(),
            request.issuedOn(),
            request.expiresOn()));
  }

  @Transactional
  public void deleteDocument(UUID id) {
    documents.findById(id).ifPresent(ComplianceDocument::markDeleted);
  }

  @Transactional(readOnly = true)
  public List<ResourceBlock> listBlocks(SubjectType type, UUID subjectId) {
    ensureSubject(type, subjectId);
    return blocks.findBySubjectTypeAndSubjectIdOrderByStartDateDesc(type, subjectId);
  }

  @Transactional
  public ResourceBlock addBlock(SubjectType type, UUID subjectId, SaveBlockRequest request) {
    ensureSubject(type, subjectId);
    LocalDate start = request.startDate();
    if (request.endDate().isBefore(start)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "BLOCK_DATES_INVALID", "Bitiş tarihi başlangıçtan önce olamaz.");
    }
    return blocks.save(
        new ResourceBlock(type, subjectId, start, request.endDate(), request.reason()));
  }

  @Transactional
  public void deleteBlock(UUID id) {
    blocks.findById(id).ifPresent(ResourceBlock::markDeleted);
  }

  @Transactional(readOnly = true)
  public FleetSettings settings() {
    return settings.findById(FleetSettings.SINGLETON_ID).orElseThrow();
  }

  @Transactional
  public FleetSettings updateSettings(boolean blockOnExpired, int reminderDays) {
    FleetSettings current = settings();
    current.update(blockOnExpired, reminderDays);
    return current;
  }

  private void ensureSubject(SubjectType type, UUID id) {
    if (type == SubjectType.VEHICLE) {
      findVehicle(id);
    } else {
      findDriver(id);
    }
  }

  private Vehicle findVehicle(UUID id) {
    return vehicles
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "VEHICLE_NOT_FOUND", "Araç bulunamadı."));
  }

  private Driver findDriver(UUID id) {
    return drivers
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "DRIVER_NOT_FOUND", "Sürücü bulunamadı."));
  }

  static String normalizePlate(String plate) {
    return plate.replaceAll("\\s+", "").toUpperCase(Locale.forLanguageTag("tr"));
  }

  private static String normalizeSearch(String search) {
    return search == null ? "" : search.trim().toLowerCase(Locale.ROOT);
  }
}
