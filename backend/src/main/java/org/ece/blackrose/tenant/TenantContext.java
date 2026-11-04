package org.ece.blackrose.tenant;

import java.util.Optional;

/** Geçerli isteğin tenant şeması. Set eden kod bağlamı mutlaka temizlemelidir. */
public final class TenantContext {

  private static final ThreadLocal<String> SCHEMA = new ThreadLocal<>();

  private TenantContext() {}

  public static Optional<String> currentSchema() {
    return Optional.ofNullable(SCHEMA.get());
  }

  public static void setSchema(String schema) {
    SCHEMA.set(schema);
  }

  public static void clear() {
    SCHEMA.remove();
  }
}
