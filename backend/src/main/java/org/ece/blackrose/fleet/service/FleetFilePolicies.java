package org.ece.blackrose.fleet.service;

import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.Predicate;
import org.ece.blackrose.files.FileOwnerPolicy;
import org.ece.blackrose.fleet.repository.FleetRepositories.ComplianceDocumentRepository;
import org.ece.blackrose.fleet.repository.FleetRepositories.DriverRepository;
import org.ece.blackrose.fleet.repository.FleetRepositories.VehicleRepository;
import org.ece.blackrose.organization.BranchScopeService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Araç, sürücü ve belge kayıtlarına eklenen dosyaların izin kuralları. Erişim konunun (araç/sürücü)
 * iş yerine bağlıdır; şubesiz konu herkese açıktır.
 */
@Configuration
public class FleetFilePolicies {

  private static FileOwnerPolicy policy(
      String type, Predicate<UUID> exists, Consumer<UUID> access) {
    return new FileOwnerPolicy() {
      @Override
      public String ownerType() {
        return type;
      }

      @Override
      public String viewPermission() {
        return "FLEET_VIEW";
      }

      @Override
      public String editPermission() {
        return "FLEET_EDIT";
      }

      @Override
      public boolean exists(UUID ownerId) {
        return exists.test(ownerId);
      }

      @Override
      public void requireAccess(UUID ownerId) {
        access.accept(ownerId);
      }
    };
  }

  @Bean
  FileOwnerPolicy vehicleFilePolicy(VehicleRepository vehicles, BranchScopeService scope) {
    return policy(
        "VEHICLE",
        vehicles::existsById,
        ownerId ->
            vehicles
                .findById(ownerId)
                .ifPresent(vehicle -> scope.requireVisible(vehicle.getBranchId())));
  }

  @Bean
  FileOwnerPolicy driverFilePolicy(DriverRepository drivers, BranchScopeService scope) {
    return policy(
        "DRIVER",
        drivers::existsById,
        ownerId ->
            drivers
                .findById(ownerId)
                .ifPresent(driver -> scope.requireVisible(driver.getBranchId())));
  }

  @Bean
  FileOwnerPolicy documentFilePolicy(
      ComplianceDocumentRepository documents, FleetRegistryService registry) {
    return policy(
        "COMPLIANCE_DOCUMENT",
        documents::existsById,
        ownerId ->
            documents
                .findById(ownerId)
                .ifPresent(
                    document ->
                        registry.requireSubjectVisible(
                            document.getSubjectType(), document.getSubjectId())));
  }
}
