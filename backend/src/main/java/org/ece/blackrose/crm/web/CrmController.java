package org.ece.blackrose.crm.web;

import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.crm.domain.Contact;
import org.ece.blackrose.crm.domain.CrmTypes.OpportunityStage;
import org.ece.blackrose.crm.domain.CrmTypes.QuoteStatus;
import org.ece.blackrose.crm.repository.CrmRepositories.ContactRepository;
import org.ece.blackrose.crm.service.ContractService;
import org.ece.blackrose.crm.service.CustomerService;
import org.ece.blackrose.crm.service.OpportunityService;
import org.ece.blackrose.crm.service.PricingService;
import org.ece.blackrose.crm.service.QuoteService;
import org.ece.blackrose.crm.service.QuoteService.RenderedPdf;
import org.ece.blackrose.crm.service.TariffService;
import org.ece.blackrose.crm.web.CrmDtos.AcceptQuoteRequest;
import org.ece.blackrose.crm.web.CrmDtos.ActivityResponse;
import org.ece.blackrose.crm.web.CrmDtos.AddQuoteLineRequest;
import org.ece.blackrose.crm.web.CrmDtos.ContactResponse;
import org.ece.blackrose.crm.web.CrmDtos.ContractResponse;
import org.ece.blackrose.crm.web.CrmDtos.ContractStatusRequest;
import org.ece.blackrose.crm.web.CrmDtos.CrmDashboardResponse;
import org.ece.blackrose.crm.web.CrmDtos.CustomerResponse;
import org.ece.blackrose.crm.web.CrmDtos.MoveStageRequest;
import org.ece.blackrose.crm.web.CrmDtos.OpportunityResponse;
import org.ece.blackrose.crm.web.CrmDtos.PriceBreakdown;
import org.ece.blackrose.crm.web.CrmDtos.PriceRequest;
import org.ece.blackrose.crm.web.CrmDtos.QuoteResponse;
import org.ece.blackrose.crm.web.CrmDtos.SaveActivityRequest;
import org.ece.blackrose.crm.web.CrmDtos.SaveContactRequest;
import org.ece.blackrose.crm.web.CrmDtos.SaveContractRequest;
import org.ece.blackrose.crm.web.CrmDtos.SaveCustomerRequest;
import org.ece.blackrose.crm.web.CrmDtos.SaveOpportunityRequest;
import org.ece.blackrose.crm.web.CrmDtos.SaveQuoteRequest;
import org.ece.blackrose.crm.web.CrmDtos.SaveTariffLineRequest;
import org.ece.blackrose.crm.web.CrmDtos.SaveTariffRequest;
import org.ece.blackrose.crm.web.CrmDtos.SaveTaxRateRequest;
import org.ece.blackrose.crm.web.CrmDtos.TariffLineResponse;
import org.ece.blackrose.crm.web.CrmDtos.TariffResponse;
import org.ece.blackrose.crm.web.CrmDtos.TaxRateResponse;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.data.domain.Pageable;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/crm")
public class CrmController {

  private static final String VIEW = "hasAuthority('CRM_VIEW')";
  private static final String EDIT = "hasAuthority('CRM_EDIT')";

  private final CustomerService customers;
  private final ContactRepository contacts;
  private final OpportunityService opportunities;
  private final TariffService tariffs;
  private final PricingService pricing;
  private final QuoteService quotes;
  private final ContractService contracts;
  private final CrmMapper mapper;
  private final TenantClock clock;

  public CrmController(
      CustomerService customers,
      ContactRepository contacts,
      OpportunityService opportunities,
      TariffService tariffs,
      PricingService pricing,
      QuoteService quotes,
      ContractService contracts,
      CrmMapper mapper,
      TenantClock clock) {
    this.clock = clock;
    this.customers = customers;
    this.contacts = contacts;
    this.opportunities = opportunities;
    this.tariffs = tariffs;
    this.pricing = pricing;
    this.quotes = quotes;
    this.contracts = contracts;
    this.mapper = mapper;
  }

  // Müşteri ve kişi

  @GetMapping("/customers")
  @PreAuthorize(VIEW)
  PageResponse<CustomerResponse> listCustomers(
      @RequestParam(required = false) String search, Pageable pageable) {
    return customers.list(search, pageable);
  }

  @GetMapping("/customers/{id}")
  @PreAuthorize(VIEW)
  CustomerResponse getCustomer(@PathVariable UUID id) {
    return customers.get(id);
  }

  @PostMapping("/customers")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  CustomerResponse createCustomer(@Valid @RequestBody SaveCustomerRequest request) {
    return customers.create(request);
  }

  @PutMapping("/customers/{id}")
  @PreAuthorize(EDIT)
  CustomerResponse updateCustomer(
      @PathVariable UUID id, @Valid @RequestBody SaveCustomerRequest request) {
    return customers.update(id, request);
  }

  @GetMapping("/customers/{id}/contacts")
  @PreAuthorize(VIEW)
  List<ContactResponse> listContacts(@PathVariable UUID id) {
    return contacts.findByAccountIdOrderByFullName(id).stream().map(mapper::toResponse).toList();
  }

  @PostMapping("/customers/{id}/contacts")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  ContactResponse createContact(
      @PathVariable UUID id, @Valid @RequestBody SaveContactRequest request) {
    customers.find(id);
    requireEmailForNotice(request);
    return mapper.toResponse(
        contacts.save(
            new Contact(
                id,
                request.fullName(),
                request.title(),
                request.email(),
                request.phone(),
                request.notifyDeliveries())));
  }

  @PutMapping("/contacts/{id}")
  @PreAuthorize(EDIT)
  ContactResponse updateContact(
      @PathVariable UUID id, @Valid @RequestBody SaveContactRequest request) {
    requireEmailForNotice(request);
    Contact contact = contact(id);
    contact.update(
        request.fullName(),
        request.title(),
        request.email(),
        request.phone(),
        request.notifyDeliveries());
    return mapper.toResponse(contacts.save(contact));
  }

  private static void requireEmailForNotice(SaveContactRequest request) {
    if (request.notifyDeliveries() && (request.email() == null || request.email().isBlank())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "CONTACT_EMAIL_REQUIRED",
          "Teslim bildirimi için kişinin e-postası girilmelidir.");
    }
  }

  private Contact contact(UUID id) {
    return contacts
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "CONTACT_NOT_FOUND", "Kişi bulunamadı."));
  }

  @DeleteMapping("/contacts/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize(EDIT)
  void deleteContact(@PathVariable UUID id) {
    Contact contact = contact(id);
    contact.markDeleted();
    contacts.save(contact);
  }

  // Fırsat ve aktivite

  @GetMapping("/opportunities")
  @PreAuthorize(VIEW)
  PageResponse<OpportunityResponse> listOpportunities(
      @RequestParam(required = false) OpportunityStage stage, Pageable pageable) {
    return PageResponse.from(opportunities.list(stage, pageable), mapper::toResponse);
  }

  @PostMapping("/opportunities")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  OpportunityResponse createOpportunity(@Valid @RequestBody SaveOpportunityRequest request) {
    return mapper.toResponse(opportunities.create(request));
  }

  @PutMapping("/opportunities/{id}")
  @PreAuthorize(EDIT)
  OpportunityResponse updateOpportunity(
      @PathVariable UUID id, @Valid @RequestBody SaveOpportunityRequest request) {
    return mapper.toResponse(opportunities.update(id, request));
  }

  @PostMapping("/opportunities/{id}/stage")
  @PreAuthorize(EDIT)
  OpportunityResponse moveOpportunity(
      @PathVariable UUID id, @Valid @RequestBody MoveStageRequest request) {
    return mapper.toResponse(opportunities.move(id, request.stage(), request.note()));
  }

  @GetMapping("/opportunities/{id}/history")
  @PreAuthorize(VIEW)
  List<ActivityResponse> opportunityHistory(@PathVariable UUID id) {
    return opportunities.history(id).stream().map(mapper::toResponse).toList();
  }

  @GetMapping("/customers/{id}/activities")
  @PreAuthorize(VIEW)
  PageResponse<ActivityResponse> customerActivities(@PathVariable UUID id, Pageable pageable) {
    return PageResponse.from(opportunities.activitiesOf(id, pageable), mapper::toResponse);
  }

  @PostMapping("/activities")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  ActivityResponse addActivity(@Valid @RequestBody SaveActivityRequest request) {
    return mapper.toResponse(opportunities.addActivity(request));
  }

  @PostMapping("/activities/{id}/complete")
  @PreAuthorize(EDIT)
  ActivityResponse completeActivity(@PathVariable UUID id) {
    return mapper.toResponse(opportunities.completeActivity(id));
  }

  @GetMapping("/dashboard")
  @PreAuthorize(VIEW)
  CrmDashboardResponse dashboard(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate today) {
    return opportunities.dashboard(today);
  }

  // Vergi ve tarife

  @GetMapping("/tax-rates")
  @PreAuthorize(VIEW)
  List<TaxRateResponse> listTaxRates() {
    return tariffs.listTaxRates().stream().map(mapper::toResponse).toList();
  }

  @PostMapping("/tax-rates")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  TaxRateResponse createTaxRate(@Valid @RequestBody SaveTaxRateRequest request) {
    return mapper.toResponse(tariffs.createTaxRate(request));
  }

  @GetMapping("/tariffs")
  @PreAuthorize(VIEW)
  List<TariffResponse> listTariffs() {
    return tariffs.list().stream().map(mapper::toResponse).toList();
  }

  @PostMapping("/tariffs")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  TariffResponse createTariff(@Valid @RequestBody SaveTariffRequest request) {
    return mapper.toResponse(tariffs.create(request));
  }

  @PutMapping("/tariffs/{id}")
  @PreAuthorize(EDIT)
  TariffResponse updateTariff(
      @PathVariable UUID id, @Valid @RequestBody SaveTariffRequest request) {
    return mapper.toResponse(tariffs.update(id, request));
  }

  @GetMapping("/tariffs/{id}/lines")
  @PreAuthorize(VIEW)
  List<TariffLineResponse> listTariffLines(@PathVariable UUID id) {
    return tariffs.linesOf(id).stream().map(mapper::toResponse).toList();
  }

  @PostMapping("/tariffs/{id}/lines")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  TariffLineResponse addTariffLine(
      @PathVariable UUID id, @Valid @RequestBody SaveTariffLineRequest request) {
    return mapper.toResponse(tariffs.addLine(id, request));
  }

  @DeleteMapping("/tariff-lines/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize(EDIT)
  void deleteTariffLine(@PathVariable UUID id) {
    tariffs.deleteLine(id);
  }

  @PostMapping("/pricing/calculate")
  @PreAuthorize(VIEW)
  PriceBreakdown calculatePrice(@Valid @RequestBody PriceRequest request) {
    return pricing.price(request);
  }

  // Teklif

  @GetMapping("/quotes")
  @PreAuthorize(VIEW)
  PageResponse<QuoteResponse> listQuotes(
      @RequestParam(required = false) QuoteStatus status,
      @RequestParam(required = false) UUID accountId,
      Pageable pageable) {
    return PageResponse.from(quotes.list(status, accountId, pageable), quote -> quote);
  }

  @GetMapping("/quotes/{id}")
  @PreAuthorize(VIEW)
  QuoteResponse getQuote(@PathVariable UUID id) {
    return quotes.get(id);
  }

  @GetMapping("/quotes/{id}/versions")
  @PreAuthorize(VIEW)
  List<QuoteResponse> quoteVersions(@PathVariable UUID id) {
    return quotes.versions(id);
  }

  @PostMapping("/quotes")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  QuoteResponse createQuote(@Valid @RequestBody SaveQuoteRequest request) {
    return quotes.create(request);
  }

  @PostMapping("/quotes/{id}/lines")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  QuoteResponse addQuoteLine(
      @PathVariable UUID id, @Valid @RequestBody AddQuoteLineRequest request) {
    return quotes.addLine(id, request);
  }

  @DeleteMapping("/quotes/{id}/lines/{lineId}")
  @PreAuthorize(EDIT)
  QuoteResponse removeQuoteLine(@PathVariable UUID id, @PathVariable UUID lineId) {
    return quotes.removeLine(id, lineId);
  }

  @PostMapping("/quotes/{id}/send")
  @PreAuthorize(EDIT)
  QuoteResponse sendQuote(@PathVariable UUID id) {
    return quotes.send(id);
  }

  @PostMapping("/quotes/{id}/new-version")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  QuoteResponse newQuoteVersion(@PathVariable UUID id) {
    return quotes.newVersion(id);
  }

  @PostMapping("/quotes/{id}/reject")
  @PreAuthorize(EDIT)
  QuoteResponse rejectQuote(@PathVariable UUID id) {
    return quotes.reject(id);
  }

  @PostMapping("/quotes/{id}/accept")
  @PreAuthorize(EDIT)
  ContractResponse acceptQuote(
      @PathVariable UUID id, @Valid @RequestBody AcceptQuoteRequest request) {
    return mapper.toResponse(quotes.accept(id, request, clock.today()));
  }

  @GetMapping("/quotes/{id}/pdf")
  @PreAuthorize(VIEW)
  ResponseEntity<byte[]> quotePdf(@PathVariable UUID id) {
    RenderedPdf pdf = quotes.pdf(id);
    return ResponseEntity.ok()
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment()
                .filename(pdf.fileName(), StandardCharsets.UTF_8)
                .build()
                .toString())
        .contentType(MediaType.APPLICATION_PDF)
        .body(pdf.content());
  }

  // Sözleşme

  @GetMapping("/contracts")
  @PreAuthorize(VIEW)
  PageResponse<ContractResponse> listContracts(
      @RequestParam(required = false) UUID accountId, Pageable pageable) {
    return PageResponse.from(contracts.list(accountId, pageable), mapper::toResponse);
  }

  @PostMapping("/contracts")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  ContractResponse createContract(@Valid @RequestBody SaveContractRequest request) {
    return mapper.toResponse(contracts.create(request));
  }

  @PostMapping("/contracts/{id}/status")
  @PreAuthorize(EDIT)
  ContractResponse changeContractStatus(
      @PathVariable UUID id, @Valid @RequestBody ContractStatusRequest request) {
    return mapper.toResponse(contracts.changeStatus(id, request.status()));
  }
}
