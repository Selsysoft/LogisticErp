package org.ece.blackrose.organization;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BranchRepository extends JpaRepository<Branch, UUID> {

  /** Silinmiş iş yeri dahil şirket kimliği (native sorguya {@code @SQLRestriction} uygulanmaz). */
  @Query(value = "select company_id from branch where id = :id", nativeQuery = true)
  Optional<UUID> findCompanyIdIncludingDeleted(@Param("id") UUID id);

  /**
   * Kiracı başına iş yeri kilidi (işlem sonuna kadar): plan sayımı ve otomatik kod üretimi
   * yarışsız. Anahtar şema adını içerir; kiracılar birbirini beklemez.
   */
  @Query(
      value =
          "select count(*) from (select pg_advisory_xact_lock("
              + "hashtext(current_schema() || ':branch'))) x",
      nativeQuery = true)
  long lockTenantBranches();

  /** {@code q}: küçük harfli LIKE deseni ({@code %metin%}) ya da null. */
  @Query(
      """
      select b from Branch b
      where (:companyId is null or b.companyId = :companyId)
        and (:allBranches = true or b.id in :branchIds)
        and (:groupId is null or b.branchGroupId = :groupId)
        and (:active is null or b.active = :active)
        and (:q is null or lower(b.name) like :q or lower(b.code) like :q)
      """)
  Page<Branch> search(
      @Param("companyId") UUID companyId,
      @Param("allBranches") boolean allBranches,
      @Param("branchIds") Collection<UUID> branchIds,
      @Param("groupId") UUID groupId,
      @Param("active") Boolean active,
      @Param("q") String q,
      Pageable pageable);

  /**
   * Otomatik kodların ({@code IY-0001}) en büyük sıra numarası; silinmişler dahil (kod yeniden
   * verilmez).
   */
  @Query(
      value =
          "select coalesce(max(cast(substring(code from 4) as bigint)), 0) from branch"
              + " where code ~ '^IY-[0-9]{1,18}$'",
      nativeQuery = true)
  long maxAutoCodeNumber();

  boolean existsByCodeAndIdNot(String code, UUID id);

  /** Verilen iş yerlerinin şirketleri (kapsam: görünür şirketler). */
  @Query("select distinct b.companyId from Branch b where b.id in :ids")
  List<UUID> companyIdsOf(@Param("ids") Collection<UUID> ids);

  /** Verilen iş yerlerinin şube grupları (kapsam: görünür gruplar). */
  @Query(
      "select distinct b.branchGroupId from Branch b"
          + " where b.id in :ids and b.branchGroupId is not null")
  List<UUID> groupIdsOf(@Param("ids") Collection<UUID> ids);

  boolean existsByCompanyIdAndActiveTrue(UUID companyId);

  boolean existsByBranchGroupId(UUID branchGroupId);

  boolean existsByBranchGroupIdAndActiveTrue(UUID branchGroupId);

  /** Şirket başına aktif iş yeri sayısı: {@code [companyId, count]}. */
  @Query("select b.companyId, count(b) from Branch b where b.active = true group by b.companyId")
  List<Object[]> countActiveByCompany();

  /** Şube grubu başına aktif iş yeri sayısı: {@code [branchGroupId, count]}. */
  @Query(
      """
      select b.branchGroupId, count(b) from Branch b
      where b.active = true and b.branchGroupId is not null
      group by b.branchGroupId
      """)
  List<Object[]> countActiveByGroup();

  /**
   * İş yerine bağlı şirkete ait kayıt var mı (silinmişler dahil): para/yasal belge tabloları ve
   * faturası henüz kesilmemiş olabilecek sefer ve depolar. Varsa iş yerinin şirketi değiştirilemez.
   */
  @Query(
      value =
          """
          select exists(select 1 from account_transaction where branch_id = :id)
              or exists(select 1 from fund_account where branch_id = :id)
              or exists(select 1 from instrument where branch_id = :id)
              or exists(select 1 from purchase_invoice where branch_id = :id)
              or exists(select 1 from payment_plan where branch_id = :id)
              or exists(select 1 from settlement where branch_id = :id)
              or exists(select 1 from opening_invoice where branch_id = :id)
              or exists(select 1 from vehicle_expense where branch_id = :id)
              or exists(select 1 from freight_invoice where branch_id = :id)
              or exists(select 1 from warehouse_invoice where branch_id = :id)
              or exists(select 1 from shipment where branch_id = :id)
              or exists(select 1 from warehouse where branch_id = :id)
          """,
      nativeQuery = true)
  boolean isReferenced(@Param("id") UUID id);
}
