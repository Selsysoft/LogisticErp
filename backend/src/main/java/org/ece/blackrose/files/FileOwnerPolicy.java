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
}
