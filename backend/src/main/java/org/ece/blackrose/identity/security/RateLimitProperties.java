package org.ece.blackrose.identity.security;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** IP başına dakikalık istek sınırları. Aynı ofis ağındaki kullanıcılar tek IP'den gelebilir. */
@ConfigurationProperties("app.security.rate-limit")
public record RateLimitProperties(
    int loginPerMinute, int passwordResetPerMinute, int refreshPerMinute, int trackingPerMinute) {}
