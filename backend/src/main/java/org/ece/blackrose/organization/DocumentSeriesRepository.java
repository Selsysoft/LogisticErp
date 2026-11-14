package org.ece.blackrose.organization;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface DocumentSeriesRepository extends JpaRepository<DocumentSeries, UUID> {

  /**
   * Yıla özel satır önce, yoksa yıllara bölünmeyen ({@code year IS NULL}) satır; kilitli okunur.
   */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query(
      """
      select s from DocumentSeries s
      where s.companyId = :companyId and s.docType = :docType
        and (s.year = :year or s.year is null)
      order by s.year desc nulls last
      """)
  List<DocumentSeries> lockFor(
      @Param("companyId") UUID companyId,
      @Param("docType") DocumentType docType,
      @Param("year") int year);

  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select s from DocumentSeries s where s.id = :id")
  Optional<DocumentSeries> findForUpdate(@Param("id") UUID id);

  List<DocumentSeries> findByCompanyIdOrderByDocTypeAscYearAsc(UUID companyId);
}
