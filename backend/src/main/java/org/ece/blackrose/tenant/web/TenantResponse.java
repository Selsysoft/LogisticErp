package org.ece.blackrose.tenant.web;

import java.util.UUID;
import org.ece.blackrose.tenant.domain.TenantStatus;

public record TenantResponse(
    UUID id,
    String code,
    String name,
    TenantStatus status,
    String defaultCurrency,
    String timeZone) {}
