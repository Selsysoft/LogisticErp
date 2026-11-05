package org.ece.blackrose.warehouse.web;

import org.ece.blackrose.warehouse.domain.HandlingCharge;
import org.ece.blackrose.warehouse.domain.HandlingRate;
import org.ece.blackrose.warehouse.domain.Warehouse;
import org.ece.blackrose.warehouse.domain.WarehouseBin;
import org.ece.blackrose.warehouse.domain.WarehouseInvoice;
import org.ece.blackrose.warehouse.web.WarehouseDtos.BinResponse;
import org.ece.blackrose.warehouse.web.WarehouseDtos.HandlingResponse;
import org.ece.blackrose.warehouse.web.WarehouseDtos.RateResponse;
import org.ece.blackrose.warehouse.web.WarehouseDtos.WarehouseInvoiceResponse;
import org.ece.blackrose.warehouse.web.WarehouseDtos.WarehouseResponse;
import org.mapstruct.Mapper;

@Mapper
public interface WarehouseMapper {

  WarehouseResponse toResponse(Warehouse warehouse);

  BinResponse toResponse(WarehouseBin bin);

  RateResponse toResponse(HandlingRate rate);

  HandlingResponse toResponse(HandlingCharge charge);

  WarehouseInvoiceResponse toResponse(WarehouseInvoice invoice);
}
