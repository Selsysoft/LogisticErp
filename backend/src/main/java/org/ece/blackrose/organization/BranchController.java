package org.ece.blackrose.organization;

import jakarta.validation.Valid;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.organization.BranchDtos.BranchResponse;
import org.ece.blackrose.organization.BranchDtos.CreateBranchRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/organization/branches")
public class BranchController {

  private final BranchRepository branches;
  private final BranchMapper mapper;

  public BranchController(BranchRepository branches, BranchMapper mapper) {
    this.branches = branches;
    this.mapper = mapper;
  }

  @GetMapping
  @PreAuthorize("hasAuthority('BRANCH_VIEW')")
  PageResponse<BranchResponse> list(Pageable pageable) {
    return PageResponse.from(branches.findAll(pageable), mapper::toResponse);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize("hasAuthority('BRANCH_MANAGE')")
  BranchResponse create(@Valid @RequestBody CreateBranchRequest request) {
    return mapper.toResponse(branches.save(new Branch(request.code(), request.name())));
  }
}
