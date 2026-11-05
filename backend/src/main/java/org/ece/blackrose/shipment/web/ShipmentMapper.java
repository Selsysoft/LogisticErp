package org.ece.blackrose.shipment.web;

import org.ece.blackrose.shipment.domain.FreightInvoice;
import org.ece.blackrose.shipment.domain.ProofOfDelivery;
import org.ece.blackrose.shipment.domain.ShipmentEvent;
import org.ece.blackrose.shipment.web.ShipmentDtos.EventResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.InvoiceResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.PodResponse;
import org.mapstruct.Mapper;

@Mapper
public interface ShipmentMapper {

  EventResponse toResponse(ShipmentEvent event);

  PodResponse toResponse(ProofOfDelivery pod);

  InvoiceResponse toResponse(FreightInvoice invoice);
}
