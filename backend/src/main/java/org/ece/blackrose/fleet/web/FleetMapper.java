package org.ece.blackrose.fleet.web;

import org.ece.blackrose.fleet.domain.ComplianceDocument;
import org.ece.blackrose.fleet.domain.Driver;
import org.ece.blackrose.fleet.domain.ResourceBlock;
import org.ece.blackrose.fleet.domain.Vehicle;
import org.ece.blackrose.fleet.domain.VehicleExpense;
import org.ece.blackrose.fleet.web.FleetDtos.BlockResponse;
import org.ece.blackrose.fleet.web.FleetDtos.DocumentResponse;
import org.ece.blackrose.fleet.web.FleetDtos.DriverResponse;
import org.ece.blackrose.fleet.web.FleetDtos.VehicleExpenseResponse;
import org.ece.blackrose.fleet.web.FleetDtos.VehicleResponse;
import org.mapstruct.Mapper;

@Mapper
public interface FleetMapper {

  VehicleResponse toResponse(Vehicle vehicle);

  DriverResponse toResponse(Driver driver);

  DocumentResponse toResponse(ComplianceDocument document);

  BlockResponse toResponse(ResourceBlock block);

  VehicleExpenseResponse toResponse(VehicleExpense expense);
}
