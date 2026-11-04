package org.ece.blackrose.tenant;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.tenancy")
public record TenantProperties(String baseDomain) {}
