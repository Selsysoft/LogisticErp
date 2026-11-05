package org.ece.blackrose.fleet.service;

import java.util.UUID;
import java.util.function.Predicate;
import org.ece.blackrose.files.FileOwnerPolicy;
import org.ece.blackrose.fleet.repository.FleetRepositories.ComplianceDocumentRepository;
import org.ece.blackrose.fleet.repository.FleetRepositories.DriverRepository;
import org.ece.blackrose.fleet.repository.FleetRepositories.VehicleRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Araç, sürücü ve belge kayıtlarına eklenen dosyaların izin kuralları. */
@Configuration
public class FleetFilePolicies {

  private static FileOwnerPolicy policy(String type, Predicate<UUID> exists) {
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
    };
  }

  @Bean
  FileOwnerPolicy vehicleFilePolicy(VehicleRepository vehicles) {
    return policy("VEHICLE", vehicles::existsById);
  }

  @Bean
  FileOwnerPolicy driverFilePolicy(DriverRepository drivers) {
    return policy("DRIVER", drivers::existsById);
  }

  @Bean
  FileOwnerPolicy documentFilePolicy(ComplianceDocumentRepository documents) {
    return policy("COMPLIANCE_DOCUMENT", documents::existsById);
  }
}
