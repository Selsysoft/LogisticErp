package org.ece.blackrose.tenant.web;

import org.ece.blackrose.tenant.domain.Tenant;
import org.mapstruct.Mapper;

@Mapper
public interface TenantMapper {

  TenantResponse toResponse(Tenant tenant);
}
