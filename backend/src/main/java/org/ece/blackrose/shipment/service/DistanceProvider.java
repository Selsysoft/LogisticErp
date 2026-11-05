package org.ece.blackrose.shipment.service;

import java.math.BigDecimal;
import java.util.Optional;

/** Güzergâh mesafesi ve süresi kaynağı. */
public interface DistanceProvider {

  record Route(BigDecimal distanceKm, int minutes) {}

  Optional<Route> find(String origin, String destination);
}
