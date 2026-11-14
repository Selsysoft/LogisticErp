package org.ece.blackrose.files;

import java.util.UUID;

/** Bir kayıt türüne dosya eklenebilmesi için modülün tanımladığı kural. */
public interface FileOwnerPolicy {

  String ownerType();

  String viewPermission();

  String editPermission();

  boolean exists(UUID ownerId);

  /**
   * true ise dosya yalnız sahibi modülün kendi ucundan yönetilir (ör. şirket logosu); genel yükleme
   * ve silme uçları 409 {@code FILE_MANAGED_BY_OWNER} verir.
   */
  default boolean managedByOwner() {
    return false;
  }

  /**
   * Kayıt düzeyinde erişim (iş yeri/şirket kapsamı, personel carisi). İzin denetiminden sonra
   * yükleme, listeleme, indirme ve silmede çağrılır; erişim yoksa uygun 403/404 fırlatır. Kayıt
   * yoksa bir şey yapmaz (varlık denetimi {@link #exists} ile ayrıdır).
   */
  default void requireAccess(UUID ownerId) {}
}
