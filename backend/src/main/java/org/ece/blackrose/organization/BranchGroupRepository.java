package org.ece.blackrose.organization;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BranchGroupRepository extends JpaRepository<BranchGroup, UUID> {

  boolean existsByCompanyIdAndNameIgnoreCaseAndIdNot(UUID companyId, String name, UUID id);

  List<BranchGroup> findAllByCompanyId(UUID companyId);

  @Query(
      """
      select g from BranchGroup g
      where (:companyId is null or g.companyId = :companyId)
        and (:allGroups = true or g.id in :groupIds)
        and (:active is null or g.active = :active)
        and (:q is null or lower(g.name) like :q)
      """)
  Page<BranchGroup> search(
      @Param("companyId") UUID companyId,
      @Param("allGroups") boolean allGroups,
      @Param("groupIds") Collection<UUID> groupIds,
      @Param("active") Boolean active,
      @Param("q") String q,
      Pageable pageable);
}
