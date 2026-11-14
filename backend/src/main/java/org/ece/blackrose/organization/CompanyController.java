package org.ece.blackrose.organization;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.organization.CompanyDtos.CompanyEDocumentSettingsResponse;
import org.ece.blackrose.organization.CompanyDtos.CompanyResponse;
import org.ece.blackrose.organization.CompanyDtos.SaveCompanyEDocumentSettingsRequest;
import org.ece.blackrose.organization.CompanyDtos.SaveCompanyRequest;
import org.ece.blackrose.organization.DocumentSeriesDtos.DocumentSeriesResponse;
import org.ece.blackrose.organization.DocumentSeriesDtos.UpdateDocumentSeriesRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Şirketler (tüzel kişiler): kart, logo, e-belge ayarı ve belge serileri. */
@RestController
@RequestMapping("/api/v1/organization/companies")
public class CompanyController {

  private static final String VIEW = "hasAuthority('BRANCH_VIEW')";
  private static final String MANAGE = "hasAuthority('COMPANY_MANAGE')";

  private final CompanyService companies;
  private final CompanyEDocumentSettingsService edocumentSettings;
  private final DocumentSeriesService series;

  public CompanyController(
      CompanyService companies,
      CompanyEDocumentSettingsService edocumentSettings,
      DocumentSeriesService series) {
    this.companies = companies;
    this.edocumentSettings = edocumentSettings;
    this.series = series;
  }

  @GetMapping
  @PreAuthorize(VIEW)
  PageResponse<CompanyResponse> list(
      @RequestParam(required = false) Boolean active,
      @RequestParam(required = false) String q,
      Pageable pageable) {
    return companies.list(active, q, pageable);
  }

  @GetMapping("/{id}")
  @PreAuthorize(VIEW)
  CompanyResponse get(@PathVariable UUID id) {
    return companies.get(id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(MANAGE)
  CompanyResponse create(@Valid @RequestBody SaveCompanyRequest request) {
    return companies.create(request);
  }

  @PutMapping("/{id}")
  @PreAuthorize(MANAGE)
  CompanyResponse update(@PathVariable UUID id, @Valid @RequestBody SaveCompanyRequest request) {
    return companies.update(id, request);
  }

  @PostMapping("/{id}/activate")
  @PreAuthorize(MANAGE)
  CompanyResponse activate(@PathVariable UUID id) {
    return companies.activate(id);
  }

  @PostMapping("/{id}/deactivate")
  @PreAuthorize(MANAGE)
  CompanyResponse deactivate(@PathVariable UUID id) {
    return companies.deactivate(id);
  }

  @PostMapping(path = "/{id}/logo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @PreAuthorize(MANAGE)
  CompanyResponse uploadLogo(@PathVariable UUID id, @RequestPart("file") MultipartFile file) {
    return companies.uploadLogo(id, file);
  }

  @DeleteMapping("/{id}/logo")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize(MANAGE)
  void deleteLogo(@PathVariable UUID id) {
    companies.deleteLogo(id);
  }

  @GetMapping("/{id}/edocument-settings")
  @PreAuthorize(MANAGE)
  CompanyEDocumentSettingsResponse edocumentSettings(@PathVariable UUID id) {
    return edocumentSettings.get(id);
  }

  @PutMapping("/{id}/edocument-settings")
  @PreAuthorize(MANAGE)
  CompanyEDocumentSettingsResponse saveEdocumentSettings(
      @PathVariable UUID id, @Valid @RequestBody SaveCompanyEDocumentSettingsRequest request) {
    return edocumentSettings.save(id, request);
  }

  @GetMapping("/{id}/document-series")
  @PreAuthorize(VIEW)
  List<DocumentSeriesResponse> documentSeries(@PathVariable UUID id) {
    return series.list(id);
  }

  @PutMapping("/{id}/document-series/{seriesId}")
  @PreAuthorize(MANAGE)
  DocumentSeriesResponse updateDocumentSeries(
      @PathVariable UUID id,
      @PathVariable UUID seriesId,
      @Valid @RequestBody UpdateDocumentSeriesRequest request) {
    return series.update(id, seriesId, request);
  }
}
