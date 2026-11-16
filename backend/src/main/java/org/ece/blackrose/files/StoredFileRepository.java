package org.ece.blackrose.files;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface StoredFileRepository extends JpaRepository<StoredFile, UUID> {

  List<StoredFile> findByOwnerTypeAndOwnerIdOrderByCreatedAtDesc(String ownerType, UUID ownerId);

  /**
   * Silinmemiş dosyaları başka sahibe taşır (masraf düzeltmesi: eski kaydın belgeleri yeni kayda;
   * 12.7 §3.2.2). Taşınan dosya sayısını döner.
   */
  @Modifying(flushAutomatically = true)
  @Query(
      value =
          "update stored_file set owner_id = :to where owner_type = :ownerType"
              + " and owner_id = :from and deleted = false",
      nativeQuery = true)
  int reassignOwner(
      @Param("ownerType") String ownerType, @Param("from") UUID from, @Param("to") UUID to);
}
