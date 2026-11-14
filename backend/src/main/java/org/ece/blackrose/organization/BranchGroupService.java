package org.ece.blackrose.organization;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchGroup.BranchGroupData;
import org.ece.blackrose.organization.BranchGroupDtos.BranchGroupResponse;
import org.ece.blackrose.organization.BranchGroupDtos.SaveBranchGroupRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Şube grupları (ZTO "Şube"): bir şirketin iş yerlerini bölge/il olarak toplar. */
@Service
public class BranchGroupService {

  private static final UUID NONE = new UUID(0, 0);

  private final BranchGroupRepository groups;
  private final BranchRepository branches;
  private final CompanyRepository companies;
  private final CompanyResolver resolver;
  private final AuditService audit;
  private final BranchScopeService scope;

  public BranchGroupService(
      BranchGroupRepository groups,
      BranchRepository branches,
      CompanyRepository companies,
      CompanyResolver resolver,
      AuditService audit,
      BranchScopeService scope) {
    this.scope = scope;
    this.groups = groups;
    this.branches = branches;
    this.companies = companies;
    this.resolver = resolver;
    this.audit = audit;
  }

  @Transactional(readOnly = true)
  public PageResponse<BranchGroupResponse> list(
      UUID companyId, Boolean active, String q, Pageable pageable) {
    // LIMITED: yalnız izinli iş yeri içeren gruplar; seçili şirket görünür olmalı.
    Set<UUID> allowed = scope.allowedOrNull();
    if (companyId != null && allowed != null) {
      scope.requireCompanyVisible(companyId);
    }
    List<UUID> visible =
        allowed == null || allowed.isEmpty() ? List.of() : branches.groupIdsOf(allowed);
    Page<BranchGroup> page =
        groups.search(
            companyId,
            allowed == null,
            visible.isEmpty() ? List.of(NONE) : visible,
            active,
            CompanyService.likePattern(q),
            pageable);
    Map<UUID, Long> counts = activeBranchCounts();
    Map<UUID, String> names = companyNames();
    return PageResponse.from(
        page,
        group ->
            toResponse(
                group, names.get(group.getCompanyId()), counts.getOrDefault(group.getId(), 0L)));
  }

  @Transactional(readOnly = true)
  public BranchGroupResponse get(UUID id) {
    return toResponse(findVisible(id));
  }

  @Transactional
  public BranchGroupResponse create(SaveBranchGroupRequest request) {
    UUID companyId =
        request.companyId() != null
            ? request.companyId()
            : scope.defaultCompanyForNew(resolver.defaultCompanyId());
    requireActiveCompany(companyId);
    scope.requireCompanyVisible(companyId);
    requireNameFree(companyId, request.name(), NONE);
    BranchGroup group =
        groups.save(
            new BranchGroup(
                companyId, data(request), request.active() == null || request.active()));
    audit.record(AuditEvent.BRANCH_GROUP_CREATED, group.getName(), null);
    return toResponse(group);
  }

  /** PUT: {@code companyId} null → şirket değişmez; şubesi olan grubun şirketi değiştirilemez. */
  @Transactional
  public BranchGroupResponse update(UUID id, SaveBranchGroupRequest request) {
    BranchGroup group = findVisible(id);
    UUID companyId = request.companyId() != null ? request.companyId() : group.getCompanyId();
    boolean moved = !companyId.equals(group.getCompanyId());
    if (moved) {
      requireActiveCompany(companyId);
      scope.requireCompanyVisible(companyId);
      if (branches.existsByBranchGroupId(id)) {
        throw new BusinessException(
            HttpStatus.CONFLICT,
            "BRANCH_GROUP_COMPANY_LOCKED",
            "Bu şubeye bağlı iş yerleri var; şirketi değiştirilemez.");
      }
    }
    requireNameFree(companyId, request.name(), id);
    if (Boolean.FALSE.equals(request.active()) && group.isActive()) {
      requireNoActiveBranches(id);
      group.deactivate();
    } else if (Boolean.TRUE.equals(request.active()) && !group.isActive()) {
      requireCompanyActive(companyId);
      group.activate();
    }
    group.update(data(request));
    if (moved) {
      group.moveTo(companyId);
    }
    audit.record(AuditEvent.BRANCH_GROUP_UPDATED, group.getName(), null);
    return toResponse(group);
  }

  @Transactional
  public BranchGroupResponse activate(UUID id) {
    BranchGroup group = findVisible(id);
    if (!group.isActive()) {
      requireCompanyActive(group.getCompanyId());
      group.activate();
      audit.record(AuditEvent.BRANCH_GROUP_ACTIVATED, group.getName(), null);
    }
    return toResponse(group);
  }

  @Transactional
  public BranchGroupResponse deactivate(UUID id) {
    BranchGroup group = findVisible(id);
    if (group.isActive()) {
      requireNoActiveBranches(id);
      group.deactivate();
      audit.record(AuditEvent.BRANCH_GROUP_DEACTIVATED, group.getName(), null);
    }
    return toResponse(group);
  }

  /** Kapsam denetimiyle grup: şirketi LIMITED kullanıcıya görünür olmalı (403). */
  BranchGroup findVisible(UUID id) {
    BranchGroup group = find(id);
    scope.requireCompanyVisible(group.getCompanyId());
    return group;
  }

  BranchGroup find(UUID id) {
    return groups.findById(id).orElseThrow(() -> groupNotFound(HttpStatus.NOT_FOUND));
  }

  static BusinessException groupNotFound(HttpStatus status) {
    return new BusinessException(status, "BRANCH_GROUP_NOT_FOUND", "Şube bulunamadı.");
  }

  private void requireActiveCompany(UUID companyId) {
    Company company =
        companies
            .findById(companyId)
            .orElseThrow(() -> CompanyService.companyNotFound(HttpStatus.BAD_REQUEST));
    if (!company.isActive()) {
      throw CompanyService.companyInactive();
    }
  }

  private void requireCompanyActive(UUID companyId) {
    if (!companies.findById(companyId).map(Company::isActive).orElse(false)) {
      throw CompanyService.companyInactive();
    }
  }

  private void requireNameFree(UUID companyId, String name, UUID self) {
    if (groups.existsByCompanyIdAndNameIgnoreCaseAndIdNot(companyId, name.trim(), self)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "BRANCH_GROUP_NAME_TAKEN", "Bu adla bir şube zaten var.");
    }
  }

  private void requireNoActiveBranches(UUID groupId) {
    if (branches.existsByBranchGroupIdAndActiveTrue(groupId)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "BRANCH_GROUP_HAS_ACTIVE_BRANCHES", "Önce iş yerlerini taşıyın.");
    }
  }

  private Map<UUID, Long> activeBranchCounts() {
    return branches.countActiveByGroup().stream()
        .collect(Collectors.toMap(row -> (UUID) row[0], row -> ((Number) row[1]).longValue()));
  }

  private Map<UUID, String> companyNames() {
    return companies.findAll().stream()
        .collect(Collectors.toMap(Company::getId, Company::getShortName, (a, b) -> a));
  }

  private BranchGroupResponse toResponse(BranchGroup group) {
    String companyName =
        companies.findById(group.getCompanyId()).map(Company::getShortName).orElse(null);
    long count = activeBranchCounts().getOrDefault(group.getId(), 0L);
    return toResponse(group, companyName, count);
  }

  private static BranchGroupResponse toResponse(
      BranchGroup group, String companyName, long branchCount) {
    return new BranchGroupResponse(
        group.getId(),
        group.getCompanyId(),
        companyName,
        group.getName(),
        group.getGroupType(),
        group.getPhone(),
        group.getEmail(),
        group.getAddress(),
        group.getManagerName(),
        group.getTaxNumber(),
        group.getTaxOffice(),
        group.isActive(),
        (int) branchCount,
        group.getCreatedBy(),
        group.getCreatedAt(),
        group.getUpdatedBy(),
        group.getUpdatedAt(),
        group.getUpdateCount());
  }

  private static BranchGroupData data(SaveBranchGroupRequest request) {
    return new BranchGroupData(
        request.name().trim(),
        request.groupType(),
        CompanyService.blankToNull(request.phone()),
        CompanyService.blankToNull(request.email()),
        CompanyService.blankToNull(request.address()),
        CompanyService.blankToNull(request.managerName()),
        CompanyService.blankToNull(request.taxNumber()),
        CompanyService.blankToNull(request.taxOffice()));
  }
}
