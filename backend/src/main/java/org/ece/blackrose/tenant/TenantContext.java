package org.ece.blackrose.tenant;

import java.util.Optional;

/** Geçerli isteğin tenant'ı. Set eden kod bağlamı mutlaka temizlemelidir. */
public final class TenantContext {

  private static final ThreadLocal<Current> CURRENT = new ThreadLocal<>();

  private TenantContext() {}

  public record Current(String code, String schema) {}

  public static Optional<Current> current() {
    return Optional.ofNullable(CURRENT.get());
  }

  public static Optional<String> currentSchema() {
    return current().map(Current::schema);
  }

  public static Optional<String> currentCode() {
    return current().map(Current::code);
  }

  public static void set(String code, String schema) {
    CURRENT.set(new Current(code, schema));
  }

  public static void restore(Current current) {
    CURRENT.set(current);
  }

  public static void clear() {
    CURRENT.remove();
  }
}
