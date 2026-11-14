package org.ece.blackrose.organization;

import jakarta.validation.Valid;
import java.util.UUID;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.organization.BranchGroupDtos.BranchGroupResponse;
import org.ece.blackrose.organization.BranchGroupDtos.SaveBranchGroupRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Şube grupları (ZTO "Şube"). */
@RestController
@RequestMapping("/api/v1/organization/branch-groups")
public class BranchGroupController {

  private static final String VIEW = "hasAuthority('BRANCH_VIEW')";
  private static final String MANAGE = "hasAuthority('BRANCH_MANAGE')";

  private final BranchGroupService groups;

  public BranchGroupController(BranchGroupService groups) {
    this.groups = groups;
  }

  @GetMapping
  @PreAuthorize(VIEW)
  PageResponse<BranchGroupResponse> list(
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) Boolean active,
      @RequestParam(required = false) String q,
      Pageable pageable) {
    return groups.list(companyId, active, q, pageable);
  }

  @GetMapping("/{id}")
  @PreAuthorize(VIEW)
  BranchGroupResponse get(@PathVariable UUID id) {
    return groups.get(id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(MANAGE)
  BranchGroupResponse create(@Valid @RequestBody SaveBranchGroupRequest request) {
    return groups.create(request);
  }

  @PutMapping("/{id}")
  @PreAuthorize(MANAGE)
  BranchGroupResponse update(
      @PathVariable UUID id, @Valid @RequestBody SaveBranchGroupRequest request) {
    return groups.update(id, request);
  }

  @PostMapping("/{id}/activate")
  @PreAuthorize(MANAGE)
  BranchGroupResponse activate(@PathVariable UUID id) {
    return groups.activate(id);
  }

  @PostMapping("/{id}/deactivate")
  @PreAuthorize(MANAGE)
  BranchGroupResponse deactivate(@PathVariable UUID id) {
    return groups.deactivate(id);
  }
}
