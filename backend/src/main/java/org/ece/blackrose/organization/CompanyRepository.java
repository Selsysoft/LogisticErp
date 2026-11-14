package org.ece.blackrose.organization;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CompanyRepository extends JpaRepository<Company, UUID> {

  Optional<Company> findByDefaultCompanyTrue();

  /** Silinmiş şirketi de döndürür (geçmiş belgenin başlığı); native sorguya kısıt uygulanmaz. */
  @Query(value = "select * from company where id = :id", nativeQuery = true)
  Optional<Company> findByIdIncludingDeleted(@Param("id") UUID id);

  @Query("select c.id from Company c where c.defaultCompany = true")
  Optional<UUID> findDefaultId();

  boolean existsByCodeAndIdNot(String code, UUID id);

  boolean existsByTaxNumberAndIdNot(String taxNumber, UUID id);

  long countByActiveTrue();

  List<Company> findAllByOrderByDefaultCompanyDescShortNameAsc();

  @Query(
      """
      select c from Company c
      where (:active is null or c.active = :active)
        and (:allCompanies = true or c.id in :companyIds)
        and (:q is null
             or lower(c.title) like :q
             or lower(c.shortName) like :q
             or lower(c.code) like :q)
      """)
  Page<Company> search(
      @Param("allCompanies") boolean allCompanies,
      @Param("companyIds") Collection<UUID> companyIds,
      @Param("active") Boolean active,
      @Param("q") String q,
      Pageable pageable);

  /**
   * Varsayılan bayrağını anında kaldırır (toplu UPDATE). Kısmi tekil indeks ertelenemediği için
   * yeni varsayılan yazılmadan önce çağrılır; entity üzerinden kaldırmak flush sırası yüzünden
   * çakışırdı.
   */
  @Modifying(flushAutomatically = true)
  @Query("update Company c set c.defaultCompany = false where c.defaultCompany = true")
  int clearDefault();

  /** Kiracı başına şirket kilidi (işlem sonuna kadar): sayım, varsayılan devri, grup carileri. */
  @Query(
      value =
          "select count(*) from (select pg_advisory_xact_lock("
              + "hashtext(current_schema() || ':company'))) x",
      nativeQuery = true)
  long lockTenantCompanies();
}
