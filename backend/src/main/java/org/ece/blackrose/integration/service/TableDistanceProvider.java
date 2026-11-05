package org.ece.blackrose.integration.service;

import java.util.Locale;
import java.util.Optional;
import org.ece.blackrose.integration.repository.IntegrationRepositories.RouteDistanceRepository;
import org.ece.blackrose.shipment.service.DistanceProvider;
import org.springframework.stereotype.Component;

/** Firmanın güzergâh tablosundan okur. Harita servisi seçilince yerine yeni uygulama gelir. */
@Component
public class TableDistanceProvider implements DistanceProvider {

  private static final Locale TURKISH = Locale.forLanguageTag("tr");

  private final RouteDistanceRepository routes;

  public TableDistanceProvider(RouteDistanceRepository routes) {
    this.routes = routes;
  }

  @Override
  public Optional<Route> find(String origin, String destination) {
    return routes
        .findByRouteKey(key(origin, destination))
        .map(route -> new Route(route.getDistanceKm(), route.getMinutes()));
  }

  public static String key(String origin, String destination) {
    return origin.trim().toLowerCase(TURKISH) + "|" + destination.trim().toLowerCase(TURKISH);
  }
}
