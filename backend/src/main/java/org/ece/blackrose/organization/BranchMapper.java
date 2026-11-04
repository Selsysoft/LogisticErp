package org.ece.blackrose.organization;

import org.ece.blackrose.organization.BranchDtos.BranchResponse;
import org.mapstruct.Mapper;

@Mapper
public interface BranchMapper {

  BranchResponse toResponse(Branch branch);
}
