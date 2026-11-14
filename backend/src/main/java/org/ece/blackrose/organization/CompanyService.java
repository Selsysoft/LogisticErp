package org.ece.blackrose.organization;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.ece.blackrose.common.TaxNumbers;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.files.FileService;
import org.ece.blackrose.files.StoredFile;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.repository.FinanceRepositories.FundAccountRepository;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.Company.CompanyData;
import org.ece.blackrose.organization.CompanyDtos.CompanyResponse;
import org.ece.blackrose.organization.CompanyDtos.MeCompanyResponse;
import org.ece.blackrose.organization.CompanyDtos.SaveCompanyRequest;
import org.ece.blackrose.saas.domain.SaasTypes.LimitedResource;
import org.ece.blackrose.saas.service.PlanLimitService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Şirket (tüzel kişi) kartı: oluşturma, düzenleme, aktif/pasif, varsayılan devri, logo ve eski
 * e-belge ayarı cephesinin kimlik güncellemesi. Şirket sayısını değiştiren işlemler kiracı başına
 * danışma kilidi altında çalışır (plan sınırı ve intercompany carisi yarışsız).
 */
@Service
public class CompanyService {

  static final String LOGO_OWNER = "COMPANY_LOGO";
  private static final int LOGO_MAX_BYTES = 1_048_576;
  private static final UUID NONE = new UUID(0, 0);
  private static final int PREFIX_LENGTH = 4;
  private static final Set<String> LOGO_EXTENSIONS = Set.of("png", "jpg", "jpeg");

  private final CompanyRepository companies;
  private final CompanyEDocumentSettingsRepository edocumentSettings;
  private final DocumentSeriesRepository series;
  private final BranchRepository branches;
  private final FundAccountRepository funds;
  private final PlanLimitService planLimits;
  private final IntercompanyAccountService intercompany;
  private final FileService files;
  private final AuditService audit;
  private final BranchScopeService scope;

  public CompanyService(
      CompanyRepository companies,
      CompanyEDocumentSettingsRepository edocumentSettings,
      DocumentSeriesRepository series,
      BranchRepository branches,
      FundAccountRepository funds,
      PlanLimitService planLimits,
      IntercompanyAccountService intercompany,
      FileService files,
      AuditService audit,
      BranchScopeService scope) {
    this.scope = scope;
    this.companies = companies;
    this.edocumentSettings = edocumentSettings;
    this.series = series;
    this.branches = branches;
    this.funds = funds;
    this.planLimits = planLimits;
    this.intercompany = intercompany;
    this.files = files;
    this.audit = audit;
  }

  /** Sıra verilmezse varsayılan şirket önce, sonra kısa ad. N+1 yok: iki toplu yardımcı sorgu. */
  @Transactional(readOnly = true)
  public PageResponse<CompanyResponse> list(Boolean active, String q, Pageable pageable) {
    Pageable sorted =
        pageable.getSort().isSorted()
            ? pageable
            : PageRequest.of(
                pageable.getPageNumber(),
                pageable.getPageSize(),
                Sort.by(Sort.Order.desc("defaultCompany"), Sort.Order.asc("shortName")));
    // LIMITED: yalnız izinli iş yeri olan şirketler.
    boolean all = !scope.limited();
    List<UUID> visible = all ? List.of(NONE) : scope.visibleCompanyIds();
    Page<Company> page =
        companies.search(
            all, visible.isEmpty() ? List.of(NONE) : visible, active, likePattern(q), sorted);
    Map<UUID, Long> branchCounts = activeBranchCounts();
    Map<UUID, CompanyEDocumentSettings> settings =
        edocumentSettings
            .findAllById(page.getContent().stream().map(Company::getId).toList())
            .stream()
            .collect(Collectors.toMap(CompanyEDocumentSettings::getCompanyId, Function.identity()));
    return PageResponse.from(
        page,
        company ->
            toResponse(
                company,
                settings.get(company.getId()),
                branchCounts.getOrDefault(company.getId(), 0L)));
  }

  @Transactional(readOnly = true)
  public CompanyResponse get(UUID id) {
    return toResponse(findVisible(id));
  }

  /** /auth/me için şirketler: varsayılan önce, sonra kısa ad (pasifler {@code active=false}). */
  @Transactional(readOnly = true)
  public List<MeCompanyResponse> meCompanies() {
    List<UUID> visible = scope.limited() ? scope.visibleCompanyIds() : null;
    return companies.findAllByOrderByDefaultCompanyDescShortNameAsc().stream()
        .filter(company -> visible == null || visible.contains(company.getId()))
        .map(
            company ->
                new MeCompanyResponse(
                    company.getId(),
                    company.getCode(),
                    company.getShortName(),
                    company.getTitle(),
                    company.isDefaultCompany(),
                    company.isActive()))
        .toList();
  }

  @Transactional
  public CompanyResponse create(SaveCompanyRequest request) {
    companies.lockTenantCompanies();
    boolean active = request.active() == null || request.active();
    boolean makeDefault = Boolean.TRUE.equals(request.defaultCompany());
    if (active) {
      planLimits.require(LimitedResource.COMPANIES);
    }
    requireCodeFree(request.code(), NONE);
    String taxNumber = checkedTaxNumber(request.taxIdType(), request.taxNumber(), NONE);
    if (request.defaultFundAccountId() != null) {
      throw mismatch("Yeni şirketin varsayılan banka hesabı olamaz; önce hesabı açın.");
    }
    if (makeDefault && !active) {
      throw defaultInactive();
    }
    if (makeDefault) {
      // Kısmi tekil indeks ertelenemez: eski bayrak yeni satır eklenmeden önce kaldırılmalı.
      companies.clearDefault();
    }
    Company company =
        companies.save(
            new Company(request.code(), data(request, taxNumber, null), active, makeDefault));
    edocumentSettings.save(new CompanyEDocumentSettings(company.getId()));
    series.save(
        new DocumentSeries(
            company.getId(),
            DocumentType.FREIGHT_INVOICE,
            null,
            seriesPrefix(company.getCode(), "NF", makeDefault),
            6));
    series.save(
        new DocumentSeries(
            company.getId(),
            DocumentType.WAREHOUSE_INVOICE,
            null,
            seriesPrefix(company.getCode(), "DF", makeDefault),
            6));
    intercompany.ensureAll();
    audit.record(AuditEvent.COMPANY_CREATED, company.getCode(), null);
    return toResponse(company);
  }

  @Transactional
  public CompanyResponse update(UUID id, SaveCompanyRequest request) {
    Company company = findVisible(id);
    requireCodeFree(request.code(), id);
    String taxNumber = checkedTaxNumber(request.taxIdType(), request.taxNumber(), id);
    // Yalnız değer değiştiğinde doğrulanır: önceden silinmiş bir varsayılan hesap kaydı engellemez.
    if (request.defaultFundAccountId() != null
        && !request.defaultFundAccountId().equals(company.getDefaultFundAccountId())) {
      FundAccount fund =
          funds
              .findById(request.defaultFundAccountId())
              .orElseThrow(
                  () ->
                      new BusinessException(
                          HttpStatus.BAD_REQUEST,
                          "FUND_NOT_FOUND",
                          "Kasa/banka hesabı bulunamadı."));
      if (!id.equals(fund.getCompanyId())) {
        throw mismatch("Varsayılan banka hesabı bu şirkete ait değil.");
      }
    }
    boolean wantDefault = Boolean.TRUE.equals(request.defaultCompany());
    boolean resultActive = request.active() == null ? company.isActive() : request.active();
    if (company.isDefaultCompany()
        && (Boolean.FALSE.equals(request.defaultCompany()) || !resultActive)) {
      throw defaultRequired();
    }
    if (wantDefault && !resultActive) {
      throw defaultInactive();
    }
    boolean activated = !company.isActive() && resultActive;
    if (activated) {
      companies.lockTenantCompanies();
      planLimits.require(LimitedResource.COMPANIES);
      company.activate();
    } else if (company.isActive() && !resultActive) {
      requireNoActiveBranches(id);
      company.deactivate();
    }
    if (wantDefault && !company.isDefaultCompany()) {
      companies.lockTenantCompanies();
      companies.clearDefault();
      company.markDefault(true);
    }
    company.update(request.code(), data(request, taxNumber, request.defaultFundAccountId()));
    intercompany.sync(company);
    if (activated) {
      intercompany.ensureAll();
    }
    audit.record(AuditEvent.COMPANY_UPDATED, company.getCode(), null);
    return toResponse(company);
  }

  /**
   * Eski {@code /integration/e-document-settings} cephesi için dar güncelleme: yalnız vergi
   * numarası, vergi dairesi ve adres. Tür uzunluktan çıkar (10 VKN, 11 TCKN).
   */
  @Transactional
  public Company updateIdentity(UUID id, String taxNumber, String taxOffice, String address) {
    Company company = findVisible(id);
    String digits = TaxNumbers.digitsOnly(taxNumber);
    TaxIdType type = TaxNumbers.typeOf(digits);
    TaxNumbers.validate(type, digits);
    requireTaxFree(digits, id);
    company.updateIdentity(type, digits, blankToNull(taxOffice), blankToNull(address));
    intercompany.sync(company);
    audit.record(AuditEvent.COMPANY_UPDATED, company.getCode(), "e-document-settings");
    return company;
  }

  @Transactional
  public CompanyResponse activate(UUID id) {
    Company company = findVisible(id);
    if (!company.isActive()) {
      companies.lockTenantCompanies();
      planLimits.require(LimitedResource.COMPANIES);
      company.activate();
      intercompany.ensureAll();
      audit.record(AuditEvent.COMPANY_ACTIVATED, company.getCode(), null);
    }
    return toResponse(company);
  }

  @Transactional
  public CompanyResponse deactivate(UUID id) {
    Company company = findVisible(id);
    if (company.isDefaultCompany()) {
      throw defaultRequired();
    }
    if (company.isActive()) {
      requireNoActiveBranches(id);
      company.deactivate();
      audit.record(AuditEvent.COMPANY_DEACTIVATED, company.getCode(), null);
    }
    return toResponse(company);
  }

  /**
   * Logo yalnız bu uçtan yönetilir: PNG/JPEG imzası ve en çok 1 MB. Dosya taranarak saklanır; eski
   * logo silinir.
   */
  @Transactional
  public CompanyResponse uploadLogo(UUID id, MultipartFile upload) {
    Company company = findVisible(id);
    if (upload == null || upload.isEmpty()) {
      throw new BusinessException(HttpStatus.BAD_REQUEST, "FILE_EMPTY", "Dosya boş.");
    }
    byte[] content;
    try {
      content = upload.getBytes();
    } catch (IOException ex) {
      throw new UncheckedIOException(ex);
    }
    String original = upload.getOriginalFilename() == null ? "" : upload.getOriginalFilename();
    String extension = original.substring(original.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
    String contentType = imageType(content);
    if (!original.contains(".")
        || !LOGO_EXTENSIONS.contains(extension)
        || contentType == null
        || content.length > LOGO_MAX_BYTES) {
      throw new BusinessException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "LOGO_INVALID",
          "Logo PNG veya JPEG ve en çok 1 MB olmalı.");
    }
    String name = "image/png".equals(contentType) ? "logo.png" : "logo.jpg";
    StoredFile stored = files.storeSubmitted(LOGO_OWNER, id, name, contentType, content);
    if (company.getLogoFileId() != null) {
      files.deleteManaged(company.getLogoFileId());
    }
    company.setLogo(stored.getId());
    audit.record(AuditEvent.COMPANY_LOGO_CHANGED, company.getCode(), null);
    return toResponse(company);
  }

  @Transactional
  public void deleteLogo(UUID id) {
    Company company = findVisible(id);
    if (company.getLogoFileId() != null) {
      files.deleteManaged(company.getLogoFileId());
      company.setLogo(null);
      audit.record(AuditEvent.COMPANY_LOGO_CHANGED, company.getCode(), "deleted");
    }
  }

  /**
   * Yoldaki kimlikle şirket, kapsam denetimiyle: yoksa 404 {@code COMPANY_NOT_FOUND}; LIMITED
   * kullanıcının şirkette izinli iş yeri yoksa 403 {@code COMPANY_OUT_OF_SCOPE}.
   */
  @Transactional(readOnly = true)
  public Company findVisible(UUID id) {
    Company company = find(id);
    if (scope.limited() && !scope.visibleCompanyIds().contains(id)) {
      throw BranchScopeService.companyOutOfScope();
    }
    return company;
  }

  /** Yoldaki kimlikle şirket; yoksa 404 {@code COMPANY_NOT_FOUND}. */
  @Transactional(readOnly = true)
  public Company find(UUID id) {
    return companies.findById(id).orElseThrow(() -> companyNotFound(HttpStatus.NOT_FOUND));
  }

  /**
   * Yeni şirketin seri öneki: kodun ilk 4 harf/rakamı + "-" + sonek; varsayılan şirket ya da kodda
   * harf/rakam yoksa yalnız sonek (tek şirketli kiracıda numaralandırma aynı kalır).
   */
  static String seriesPrefix(String code, String suffix, boolean defaultCompany) {
    String letters = code == null ? "" : code.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
    if (defaultCompany || letters.isEmpty()) {
      return suffix;
    }
    return letters.substring(0, Math.min(PREFIX_LENGTH, letters.length())) + "-" + suffix;
  }

  static BusinessException companyNotFound(HttpStatus status) {
    return new BusinessException(status, "COMPANY_NOT_FOUND", "Şirket bulunamadı.");
  }

  static BusinessException companyInactive() {
    return new BusinessException(
        HttpStatus.UNPROCESSABLE_ENTITY, "COMPANY_INACTIVE", "Pasif şirket seçilemez.");
  }

  static BusinessException mismatch(String message) {
    return new BusinessException(HttpStatus.UNPROCESSABLE_ENTITY, "COMPANY_MISMATCH", message);
  }

  /** Aktif iş yeri sayısı, şirket başına (tek toplu sorgu). */
  Map<UUID, Long> activeBranchCounts() {
    return branches.countActiveByCompany().stream()
        .collect(Collectors.toMap(row -> (UUID) row[0], row -> ((Number) row[1]).longValue()));
  }

  CompanyResponse toResponse(Company company) {
    return toResponse(
        company,
        edocumentSettings.findById(company.getId()).orElse(null),
        activeBranchCounts().getOrDefault(company.getId(), 0L));
  }

  private static CompanyResponse toResponse(
      Company company, CompanyEDocumentSettings settings, long branchCount) {
    return new CompanyResponse(
        company.getId(),
        company.getCode(),
        company.getTitle(),
        company.getShortName(),
        company.getTaxIdType(),
        company.getTaxNumber(),
        company.getTaxOffice(),
        company.getMersisNo(),
        company.getTradeRegistryNo(),
        company.getSgkWorkplaceNo(),
        company.getAddress(),
        company.getCity(),
        company.getDistrict(),
        company.getPostalCode(),
        company.getCountry(),
        company.getPhone(),
        company.getEmail(),
        company.getKepAddress(),
        company.getWebsite(),
        company.getLogoFileId(),
        company.getDefaultFundAccountId(),
        company.isDefaultCompany(),
        company.isActive(),
        settings != null && settings.isEnabled(),
        settings == null || settings.isTestMode(),
        (int) branchCount,
        company.getCreatedBy(),
        company.getCreatedAt(),
        company.getUpdatedBy(),
        company.getUpdatedAt(),
        company.getUpdateCount());
  }

  private static CompanyData data(SaveCompanyRequest request, String taxNumber, UUID fundId) {
    return new CompanyData(
        request.title().trim(),
        request.shortName().trim(),
        request.taxIdType(),
        taxNumber,
        blankToNull(request.taxOffice()),
        blankToNull(request.mersisNo()),
        blankToNull(request.tradeRegistryNo()),
        blankToNull(request.sgkWorkplaceNo()),
        blankToNull(request.address()),
        blankToNull(request.city()),
        blankToNull(request.district()),
        blankToNull(request.postalCode()),
        blankToNull(request.phone()),
        blankToNull(request.email()),
        blankToNull(request.kepAddress()),
        blankToNull(request.website()),
        fundId);
  }

  private String checkedTaxNumber(TaxIdType type, String raw, UUID self) {
    String taxNumber = blankToNull(raw);
    if (taxNumber == null) {
      return null;
    }
    TaxNumbers.validate(type, taxNumber);
    requireTaxFree(taxNumber, self);
    return taxNumber;
  }

  private void requireTaxFree(String taxNumber, UUID self) {
    if (taxNumber != null && companies.existsByTaxNumberAndIdNot(taxNumber, self)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "COMPANY_TAX_TAKEN", "Bu vergi numarası zaten kayıtlı.");
    }
  }

  private void requireCodeFree(String code, UUID self) {
    if (companies.existsByCodeAndIdNot(code, self)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "COMPANY_CODE_TAKEN", "Bu şirket kodu zaten kayıtlı.");
    }
  }

  private void requireNoActiveBranches(UUID companyId) {
    if (branches.existsByCompanyIdAndActiveTrue(companyId)) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "COMPANY_HAS_ACTIVE_BRANCHES",
          "Önce iş yerlerini pasifleştirin veya taşıyın.");
    }
  }

  private static BusinessException defaultRequired() {
    return new BusinessException(
        HttpStatus.CONFLICT,
        "DEFAULT_COMPANY_REQUIRED",
        "Varsayılan şirket pasifleştirilemez; önce başka bir şirketi varsayılan yapın.");
  }

  private static BusinessException defaultInactive() {
    return new BusinessException(
        HttpStatus.UNPROCESSABLE_ENTITY, "COMPANY_INACTIVE", "Pasif şirket varsayılan yapılamaz.");
  }

  /** PNG ({@code 89 50 4E 47}) ya da JPEG ({@code FF D8 FF}) imzası; değilse {@code null}. */
  private static String imageType(byte[] content) {
    if (content.length >= 4
        && (content[0] & 0xFF) == 0x89
        && content[1] == 0x50
        && content[2] == 0x4E
        && content[3] == 0x47) {
      return "image/png";
    }
    if (content.length >= 3
        && (content[0] & 0xFF) == 0xFF
        && (content[1] & 0xFF) == 0xD8
        && (content[2] & 0xFF) == 0xFF) {
      return "image/jpeg";
    }
    return null;
  }

  /** Küçük harfli {@code %metin%} LIKE deseni; boşsa {@code null} (süzgeç yok). */
  static String likePattern(String q) {
    String term = blankToNull(q);
    return term == null ? null : "%" + term.toLowerCase(Locale.ROOT) + "%";
  }

  static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  static Comparator<Company> defaultFirst() {
    return Comparator.comparing(Company::isDefaultCompany).reversed();
  }
}
