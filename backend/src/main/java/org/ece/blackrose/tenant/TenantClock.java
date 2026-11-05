package org.ece.blackrose.tenant;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.springframework.stereotype.Component;

/** Sunucu UTC çalışır; iş kurallarındaki "bugün" firmanın saat dilimine göredir. */
@Component
public class TenantClock {

  private final TenantRepository tenants;

  public TenantClock(TenantRepository tenants) {
    this.tenants = tenants;
  }

  public LocalDate today() {
    String code = TenantContext.currentCode().orElseThrow();
    return dateAt(Instant.now(), tenants.findByCode(code).orElseThrow().getTimeZone());
  }

  public LocalDate dateOf(Instant instant) {
    return LocalDate.ofInstant(instant, zone());
  }

  public Instant startOf(LocalDate date) {
    return date.atStartOfDay(zone()).toInstant();
  }

  public Instant instantOf(LocalDateTime local) {
    return local.atZone(zone()).toInstant();
  }

  private ZoneId zone() {
    String code = TenantContext.currentCode().orElseThrow();
    return ZoneId.of(tenants.findByCode(code).orElseThrow().getTimeZone());
  }

  static LocalDate dateAt(Instant instant, String timeZone) {
    return LocalDate.ofInstant(instant, ZoneId.of(timeZone));
  }
}
