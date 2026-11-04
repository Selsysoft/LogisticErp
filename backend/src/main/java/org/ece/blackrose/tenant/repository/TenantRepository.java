package org.ece.blackrose.tenant.repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.tenant.domain.Tenant;
import org.ece.blackrose.tenant.domain.TenantStatus;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TenantRepository extends JpaRepository<Tenant, UUID> {

  Optional<Tenant> findByCode(String code);

  List<Tenant> findByStatus(TenantStatus status);
}
