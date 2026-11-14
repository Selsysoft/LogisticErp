package org.ece.blackrose.organization;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.organization.BranchDtos.BranchResponse;
import org.ece.blackrose.organization.BranchDtos.BranchTreeCompanyResponse;
import org.ece.blackrose.organization.BranchDtos.SaveBranchRequest;
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

/**
 * İş yerleri ({@code branch}) ve ZTO seçim bileşenlerinin ortak veri kaynağı {@code branch-tree}.
 */
@RestController
@RequestMapping("/api/v1/organization")
public class BranchController {

  private static final String VIEW = "hasAuthority('BRANCH_VIEW')";
  private static final String MANAGE = "hasAuthority('BRANCH_MANAGE')";

  private final BranchService branches;

  public BranchController(BranchService branches) {
    this.branches = branches;
  }

  @GetMapping("/branches")
  @PreAuthorize(VIEW)
  PageResponse<BranchResponse> list(
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) UUID groupId,
      @RequestParam(required = false) Boolean active,
      @RequestParam(required = false) String q,
      Pageable pageable) {
    return branches.list(companyId, groupId, active, q, pageable);
  }

  @GetMapping("/branches/{id}")
  @PreAuthorize(VIEW)
  BranchResponse get(@PathVariable UUID id) {
    return branches.get(id);
  }

  @PostMapping("/branches")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(MANAGE)
  BranchResponse create(@Valid @RequestBody SaveBranchRequest request) {
    return branches.create(request);
  }

  @PutMapping("/branches/{id}")
  @PreAuthorize(MANAGE)
  BranchResponse update(@PathVariable UUID id, @Valid @RequestBody SaveBranchRequest request) {
    return branches.update(id, request);
  }

  @PostMapping("/branches/{id}/activate")
  @PreAuthorize(MANAGE)
  BranchResponse activate(@PathVariable UUID id) {
    return branches.activate(id);
  }

  @PostMapping("/branches/{id}/deactivate")
  @PreAuthorize(MANAGE)
  BranchResponse deactivate(@PathVariable UUID id) {
    return branches.deactivate(id);
  }

  /**
   * {@code scope} kabul edilir; iki değer de çağıranın görebildiği iş yerlerini döndürür ({@code
   * all} ileride ayrıştırılmak üzere saklıdır).
   */
  @GetMapping("/branch-tree")
  @PreAuthorize(
      "hasAnyAuthority('BRANCH_VIEW','FINANCE_VIEW','SHIPMENT_VIEW','FLEET_VIEW',"
          + "'WAREHOUSE_VIEW','USER_MANAGE')")
  List<BranchTreeCompanyResponse> tree(
      @RequestParam(defaultValue = "mine") String scope,
      @RequestParam(defaultValue = "false") boolean includeInactive) {
    return branches.tree(includeInactive);
  }
}
