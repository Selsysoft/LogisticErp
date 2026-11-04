package org.ece.blackrose.files;

import java.util.UUID;

/** Bir kayıt türüne dosya eklenebilmesi için modülün tanımladığı kural. */
public interface FileOwnerPolicy {

  String ownerType();

  String viewPermission();

  String editPermission();

  boolean exists(UUID ownerId);
}
