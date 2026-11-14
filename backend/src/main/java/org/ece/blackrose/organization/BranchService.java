package org.ece.blackrose.organization;

import java.text.Collator;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.Branch.BranchData;
import org.ece.blackrose.organization.BranchDtos.BranchResponse;
import org.ece.blackrose.organization.BranchDtos.BranchTreeBranchResponse;
import org.ece.blackrose.organization.BranchDtos.BranchTreeCompanyResponse;
import org.ece.blackrose.organization.BranchDtos.BranchTreeGroupResponse;
import org.ece.blackrose.organization.BranchDtos.SaveBranchRequest;
import org.ece.blackrose.saas.domain.SaasTypes.LimitedResource;
import org.ece.blackrose.saas.service.PlanLimitService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * İş yerleri (ZTO {@code ZT_WorkPlace}): CRUD, aktif/pasif ve tüm seçim bileşenlerinin veri kaynağı
 * olan şirket → şube → iş yeri ağacı. Kaydı olan iş yerinin şirketi değiştirilemez.
 */
@Service
public class BranchService {

  static final String OTHER_GROUP = "Diğer";
  private static final String AUTO_CODE_PREFIX = "IY-";
  private static final UUID NONE = new UUID(0, 0);

  private final BranchRepository branches;
  private final BranchGroupRepository groups;
  private final CompanyRepository companies;
  private final CompanyResolver resolver;
  private final PlanLimitService planLimits;
  private final AuditService audit;
  private final BranchScopeService scope;

  public BranchService(
      BranchRepository branches,
      BranchGroupRepository groups,
      CompanyRepository companies,
      CompanyResolver resolver,
      PlanLimitService planLimits,
      AuditService audit,
      BranchScopeService scope) {
    this.scope = scope;
    this.branches = branches;
    this.groups = groups;
    this.companies = companies;
    this.resolver = resolver;
    this.planLimits = planLimits;
    this.audit = audit;
  }

  /** {@code active} null = tümü (aktif + pasif). Şirket ve grup adları tek toplu sorguyla. */
  @Transactional(readOnly = true)
  public PageResponse<BranchResponse> list(
      UUID companyId, UUID groupId, Boolean active, String q, Pageable pageable) {
    BranchFilter filter = scope.filter(companyId, null);
    Page<Branch> page =
        branches.search(
            filter.companyId(),
            filter.allBranches(),
            filter.branchIds(),
            groupId,
            active,
            CompanyService.likePattern(q),
            pageable);
    Map<UUID, String> companyNames = companyNames();
    Map<UUID, String> groupNames = groupNames();
    return PageResponse.from(page, branch -> toResponse(branch, companyNames, groupNames));
  }

  @Transactional(readOnly = true)
  public BranchResponse get(UUID id) {
    return toResponse(findVisible(id));
  }

  @Transactional
  public BranchResponse create(SaveBranchRequest request) {
    branches.lockTenantBranches();
    planLimits.require(LimitedResource.BRANCHES);
    UUID groupId = request.branchGroupId();
    UUID companyId;
    if (groupId != null) {
      BranchGroup group = activeGroup(groupId);
      if (request.companyId() != null && !request.companyId().equals(group.getCompanyId())) {
        throw CompanyService.mismatch("Seçilen şube başka şirkete ait.");
      }
      companyId = group.getCompanyId();
    } else {
      companyId =
          request.companyId() != null
              ? request.companyId()
              : scope.defaultCompanyForNew(resolver.defaultCompanyId());
    }
    requireActiveCompany(companyId);
    scope.requireCompanyVisible(companyId);
    String code = CompanyService.blankToNull(request.code());
    if (code == null) {
      code = "%s%04d".formatted(AUTO_CODE_PREFIX, branches.maxAutoCodeNumber() + 1);
    } else {
      requireCodeFree(code, NONE);
    }
    requireLocationPair(request);
    Branch branch = branches.save(new Branch(code, data(request), companyId, groupId));
    audit.record(AuditEvent.BRANCH_CREATED, branch.getCode(), null);
    return toResponse(branch);
  }

  /**
   * PUT: {@code code} null → değişmez; {@code branchGroupId} null → grup kaldırılır; {@code
   * companyId} null → şirket değişmez. Kaydı olan iş yerinin şirketi değiştirilemez.
   */
  @Transactional
  public BranchResponse update(UUID id, SaveBranchRequest request) {
    Branch branch = findVisible(id);
    String code = CompanyService.blankToNull(request.code());
    if (code == null) {
      code = branch.getCode();
    } else if (!code.equals(branch.getCode())) {
      requireCodeFree(code, id);
    }
    UUID groupId = request.branchGroupId();
    UUID companyId;
    if (groupId != null) {
      BranchGroup group =
          groups
              .findById(groupId)
              .orElseThrow(() -> BranchGroupService.groupNotFound(HttpStatus.BAD_REQUEST));
      if (!group.isActive() && !groupId.equals(branch.getBranchGroupId())) {
        throw groupInactive();
      }
      if (request.companyId() != null && !request.companyId().equals(group.getCompanyId())) {
        throw CompanyService.mismatch("Seçilen şube başka şirkete ait.");
      }
      companyId = group.getCompanyId();
    } else {
      companyId = request.companyId() != null ? request.companyId() : branch.getCompanyId();
    }
    boolean companyChanged = !companyId.equals(branch.getCompanyId());
    if (companyChanged) {
      requireActiveCompany(companyId);
      scope.requireCompanyVisible(companyId);
      if (branches.isReferenced(id)) {
        throw new BusinessException(
            HttpStatus.CONFLICT,
            "BRANCH_COMPANY_LOCKED",
            "Bu iş yerinde kayıt var; şirketi değiştirilemez.");
      }
    }
    requireLocationPair(request);
    branch.update(code, data(request));
    if (companyChanged || !Objects.equals(groupId, branch.getBranchGroupId())) {
      branch.moveTo(companyId, groupId);
    }
    audit.record(AuditEvent.BRANCH_UPDATED, branch.getCode(), null);
    return toResponse(branch);
  }

  @Transactional
  public BranchResponse activate(UUID id) {
    Branch branch = findVisible(id);
    if (!branch.isActive()) {
      branches.lockTenantBranches();
      planLimits.require(LimitedResource.BRANCHES);
      if (branch.getBranchGroupId() != null
          && !groups.findById(branch.getBranchGroupId()).map(BranchGroup::isActive).orElse(true)) {
        throw groupInactive();
      }
      if (!companies.findById(branch.getCompanyId()).map(Company::isActive).orElse(false)) {
        throw CompanyService.companyInactive();
      }
      branch.activate();
      audit.record(AuditEvent.BRANCH_ACTIVATED, branch.getCode(), null);
    }
    return toResponse(branch);
  }

  /** Pasifleştirme her zaman serbesttir; kayıtlar ve raporlar görünmeye devam eder. */
  @Transactional
  public BranchResponse deactivate(UUID id) {
    Branch branch = findVisible(id);
    if (branch.isActive()) {
      branch.deactivate();
      audit.record(AuditEvent.BRANCH_DEACTIVATED, branch.getCode(), null);
    }
    return toResponse(branch);
  }

  /**
   * Şirket → şube grubu → iş yeri ağacı. Sıra: varsayılan şirket, sonra kısa ad; gruplar ada göre,
   * grupsuzlar ("Diğer") en sonda; iş yerleri ada göre. İş yeri olmayan grup ve şirket atılır.
   * {@code includeInactive=false}: yalnız aktif şirket → aktif grup (ya da grupsuz) → aktif iş
   * yeri. LIMITED kullanıcı yalnız izinli iş yerlerini (ve onların grup/şirketlerini) görür.
   */
  @Transactional(readOnly = true)
  public List<BranchTreeCompanyResponse> tree(boolean includeInactive) {
    Collator collator = Collator.getInstance(Locale.forLanguageTag("tr"));
    Map<UUID, Company> companyById =
        companies.findAll().stream().collect(Collectors.toMap(Company::getId, Function.identity()));
    Map<UUID, BranchGroup> groupById =
        groups.findAll().stream()
            .collect(Collectors.toMap(BranchGroup::getId, Function.identity()));
    Map<UUID, Map<UUID, List<Branch>>> byCompanyAndGroup = new LinkedHashMap<>();
    Set<UUID> allowed = scope.allowedOrNull();
    for (Branch branch : branches.findAll()) {
      if (allowed != null && !allowed.contains(branch.getId())) {
        continue;
      }
      Company company = companyById.get(branch.getCompanyId());
      BranchGroup group =
          branch.getBranchGroupId() == null ? null : groupById.get(branch.getBranchGroupId());
      if (company == null
          || (!includeInactive
              && (!company.isActive()
                  || !branch.isActive()
                  || (group != null && !group.isActive())))) {
        continue;
      }
      byCompanyAndGroup
          .computeIfAbsent(company.getId(), key -> new LinkedHashMap<>())
          .computeIfAbsent(group == null ? NONE : group.getId(), key -> new ArrayList<>())
          .add(branch);
    }
    Comparator<Branch> byName = Comparator.comparing(Branch::getName, collator);
    Comparator<BranchTreeGroupResponse> groupOrder =
        Comparator.<BranchTreeGroupResponse, Boolean>comparing(group -> group.groupId() == null)
            .thenComparing(BranchTreeGroupResponse::groupName, collator);
    List<Company> orderedCompanies =
        byCompanyAndGroup.keySet().stream()
            .map(companyById::get)
            .sorted(CompanyService.defaultFirst().thenComparing(Company::getShortName, collator))
            .toList();
    List<BranchTreeCompanyResponse> tree = new ArrayList<>();
    for (Company company : orderedCompanies) {
      List<BranchTreeGroupResponse> companyGroups = new ArrayList<>();
      byCompanyAndGroup
          .get(company.getId())
          .forEach(
              (groupId, members) -> {
                BranchGroup group = NONE.equals(groupId) ? null : groupById.get(groupId);
                companyGroups.add(
                    new BranchTreeGroupResponse(
                        group == null ? null : group.getId(),
                        group == null ? OTHER_GROUP : group.getName(),
                        group == null || group.isActive(),
                        members.stream()
                            .sorted(byName)
                            .map(
                                branch ->
                                    new BranchTreeBranchResponse(
                                        branch.getId(),
                                        branch.getCode(),
                                        branch.getName(),
                                        branch.isActive()))
                            .toList()));
              });
      companyGroups.sort(groupOrder);
      tree.add(
          new BranchTreeCompanyResponse(
              company.getId(), company.getShortName(), company.isActive(), companyGroups));
    }
    return tree;
  }

  /** Kapsam denetimiyle iş yeri: LIMITED kullanıcının izinli iş yeri değilse 403. */
  Branch findVisible(UUID id) {
    Branch branch = find(id);
    scope.requireVisible(id);
    return branch;
  }

  Branch find(UUID id) {
    return branches
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "BRANCH_NOT_FOUND", "Şube bulunamadı."));
  }

  private BranchGroup activeGroup(UUID groupId) {
    BranchGroup group =
        groups
            .findById(groupId)
            .orElseThrow(() -> BranchGroupService.groupNotFound(HttpStatus.BAD_REQUEST));
    if (!group.isActive()) {
      throw groupInactive();
    }
    return group;
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

  private void requireCodeFree(String code, UUID self) {
    if (branches.existsByCodeAndIdNot(code, self)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "BRANCH_CODE_TAKEN", "Bu iş yeri kodu zaten kullanılıyor.");
    }
  }

  private static void requireLocationPair(SaveBranchRequest request) {
    if ((request.latitude() == null) != (request.longitude() == null)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "VALIDATION_ERROR",
          "Konum için enlem ve boylam birlikte girilmeli.");
    }
  }

  private static BusinessException groupInactive() {
    return new BusinessException(
        HttpStatus.UNPROCESSABLE_ENTITY, "BRANCH_GROUP_INACTIVE", "Pasif şube seçilemez.");
  }

  private Map<UUID, String> companyNames() {
    return companies.findAll().stream()
        .collect(Collectors.toMap(Company::getId, Company::getShortName, (a, b) -> a));
  }

  private Map<UUID, String> groupNames() {
    return groups.findAll().stream()
        .collect(Collectors.toMap(BranchGroup::getId, BranchGroup::getName, (a, b) -> a));
  }

  private BranchResponse toResponse(Branch branch) {
    return toResponse(branch, companyNames(), groupNames());
  }

  private static BranchResponse toResponse(
      Branch branch, Map<UUID, String> companyNames, Map<UUID, String> groupNames) {
    return new BranchResponse(
        branch.getId(),
        branch.getCode(),
        branch.getName(),
        branch.getCompanyId(),
        companyNames.get(branch.getCompanyId()),
        branch.getBranchGroupId(),
        branch.getBranchGroupId() == null ? null : groupNames.get(branch.getBranchGroupId()),
        branch.getPhone(),
        branch.getAddress(),
        branch.getCity(),
        branch.getDistrict(),
        branch.getLatitude(),
        branch.getLongitude(),
        branch.getSgkWorkplaceNo(),
        branch.isActive(),
        branch.getCreatedBy(),
        branch.getCreatedAt(),
        branch.getUpdatedBy(),
        branch.getUpdatedAt(),
        branch.getUpdateCount());
  }

  private static BranchData data(SaveBranchRequest request) {
    return new BranchData(
        request.name().trim(),
        CompanyService.blankToNull(request.phone()),
        CompanyService.blankToNull(request.address()),
        CompanyService.blankToNull(request.city()),
        CompanyService.blankToNull(request.district()),
        request.latitude(),
        request.longitude(),
        CompanyService.blankToNull(request.sgkWorkplaceNo()));
  }
}
