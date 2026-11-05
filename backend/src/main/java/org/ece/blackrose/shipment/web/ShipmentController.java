package org.ece.blackrose.shipment.web;

import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.crm.domain.CrmTypes.QuoteStatus;
import org.ece.blackrose.crm.domain.Quote;
import org.ece.blackrose.crm.repository.CrmRepositories.QuoteLineRepository;
import org.ece.blackrose.crm.repository.CrmRepositories.QuoteRepository;
import org.ece.blackrose.crm.repository.CrmRepositories.TariffRepository;
import org.ece.blackrose.crm.repository.CrmRepositories.TaxRateRepository;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.domain.ShipmentTypes.DocumentType;
import org.ece.blackrose.shipment.domain.ShipmentTypes.ShipmentStatus;
import org.ece.blackrose.shipment.domain.TripCost;
import org.ece.blackrose.shipment.service.DispatchService;
import org.ece.blackrose.shipment.service.LinkableExpenseService;
import org.ece.blackrose.shipment.service.ShipmentDocumentService;
import org.ece.blackrose.shipment.service.ShipmentDocumentService.RenderedPdf;
import org.ece.blackrose.shipment.service.ShipmentService;
import org.ece.blackrose.shipment.service.ShipmentViews;
import org.ece.blackrose.shipment.service.TripFinanceService;
import org.ece.blackrose.shipment.service.TripFinanceService.InvoicePdf;
import org.ece.blackrose.shipment.web.ShipmentDtos.AddEventRequest;
import org.ece.blackrose.shipment.web.ShipmentDtos.AssignLegRequest;
import org.ece.blackrose.shipment.web.ShipmentDtos.AssignmentResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.BoardRow;
import org.ece.blackrose.shipment.web.ShipmentDtos.CancelInvoiceRequest;
import org.ece.blackrose.shipment.web.ShipmentDtos.CandidatesResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.ChangeStatusRequest;
import org.ece.blackrose.shipment.web.ShipmentDtos.CloseShipmentRequest;
import org.ece.blackrose.shipment.web.ShipmentDtos.CostResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.CreateShipmentRequest;
import org.ece.blackrose.shipment.web.ShipmentDtos.DocumentResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.EventResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.InvoiceResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.IssueInvoiceRequest;
import org.ece.blackrose.shipment.web.ShipmentDtos.LegResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.LinkableExpense;
import org.ece.blackrose.shipment.web.ShipmentDtos.Option;
import org.ece.blackrose.shipment.web.ShipmentDtos.PodResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.ProfitResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.QuoteLineOption;
import org.ece.blackrose.shipment.web.ShipmentDtos.SaveCostRequest;
import org.ece.blackrose.shipment.web.ShipmentDtos.SaveInternationalRequest;
import org.ece.blackrose.shipment.web.ShipmentDtos.SaveLegRequest;
import org.ece.blackrose.shipment.web.ShipmentDtos.SavePodRequest;
import org.ece.blackrose.shipment.web.ShipmentDtos.ShipmentOptionsResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.ShipmentResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.ShipmentSummary;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
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
@RequestMapping("/api/v1/shipment")
public class ShipmentController {

  private static final String VIEW = "hasAuthority('SHIPMENT_VIEW')";
  private static final String DISPATCH = "hasAuthority('SHIPMENT_DISPATCH')";
  private static final String INVOICE = "hasAuthority('SHIPMENT_INVOICE')";

  private final ShipmentService shipments;
  private final DispatchService dispatch;
  private final ShipmentDocumentService documents;
  private final TripFinanceService finance;
  private final ShipmentViews views;
  private final ShipmentMapper mapper;
  private final AccountRepository accounts;
  private final TariffRepository tariffs;
  private final TaxRateRepository taxRates;
  private final QuoteRepository quotes;
  private final QuoteLineRepository quoteLines;
  private final LinkableExpenseService linkable;

  public ShipmentController(
      ShipmentService shipments,
      DispatchService dispatch,
      ShipmentDocumentService documents,
      TripFinanceService finance,
      ShipmentViews views,
      ShipmentMapper mapper,
      AccountRepository accounts,
      TariffRepository tariffs,
      TaxRateRepository taxRates,
      QuoteRepository quotes,
      QuoteLineRepository quoteLines,
      LinkableExpenseService linkable) {
    this.linkable = linkable;
    this.shipments = shipments;
    this.dispatch = dispatch;
    this.documents = documents;
    this.finance = finance;
    this.views = views;
    this.mapper = mapper;
    this.accounts = accounts;
    this.tariffs = tariffs;
    this.taxRates = taxRates;
    this.quotes = quotes;
    this.quoteLines = quoteLines;
  }

  // Taşıma emri

  @GetMapping("/shipments")
  @PreAuthorize(VIEW)
  PageResponse<ShipmentSummary> list(
      @RequestParam(required = false) ShipmentStatus status,
      @RequestParam(required = false) String search,
      Pageable pageable) {
    Page<Shipment> page = shipments.list(status, search, pageable);
    return PageResponse.from(
        new PageImpl<>(views.summaries(page.getContent()), pageable, page.getTotalElements()),
        summary -> summary);
  }

  @GetMapping("/shipments/{id}")
  @PreAuthorize(VIEW)
  ShipmentResponse get(@PathVariable UUID id) {
    return views.detail(shipments.get(id));
  }

  @PostMapping("/shipments")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(DISPATCH)
  ShipmentResponse create(@Valid @RequestBody CreateShipmentRequest request) {
    return views.detail(shipments.create(request));
  }

  @PostMapping("/shipments/{id}/status")
  @PreAuthorize(DISPATCH)
  ShipmentResponse changeStatus(
      @PathVariable UUID id, @Valid @RequestBody ChangeStatusRequest request) {
    return views.detail(shipments.changeStatus(id, request.status(), request.message()));
  }

  @PutMapping("/shipments/{id}/international")
  @PreAuthorize(DISPATCH)
  ShipmentResponse saveInternational(
      @PathVariable UUID id, @Valid @RequestBody SaveInternationalRequest request) {
    return views.detail(shipments.updateInternational(id, request));
  }

  @GetMapping("/shipments/{id}/timeline")
  @PreAuthorize(VIEW)
  List<EventResponse> timeline(@PathVariable UUID id) {
    return shipments.timeline(id).stream().map(mapper::toResponse).toList();
  }

  @PostMapping("/shipments/{id}/events")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(DISPATCH)
  EventResponse addEvent(@PathVariable UUID id, @Valid @RequestBody AddEventRequest request) {
    return mapper.toResponse(shipments.addEvent(id, request.type(), request.message()));
  }

  // Etap ve atama

  @PostMapping("/shipments/{id}/legs")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(DISPATCH)
  LegResponse addLeg(@PathVariable UUID id, @Valid @RequestBody SaveLegRequest request) {
    return views.legResponses(List.of(dispatch.addLeg(id, request))).get(0);
  }

  @DeleteMapping("/legs/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize(DISPATCH)
  void removeLeg(@PathVariable UUID id) {
    dispatch.removeLeg(id);
  }

  @PostMapping("/legs/{id}/assign")
  @PreAuthorize(DISPATCH)
  AssignmentResponse assign(@PathVariable UUID id, @Valid @RequestBody AssignLegRequest request) {
    return dispatch.assign(id, request);
  }

  @GetMapping("/legs/{id}/candidates")
  @PreAuthorize(DISPATCH)
  CandidatesResponse candidates(@PathVariable UUID id) {
    return dispatch.candidates(id);
  }

  @GetMapping("/board")
  @PreAuthorize(VIEW)
  List<BoardRow> board(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
    return dispatch.board(from, to);
  }

  // Teslim kanıtı ve belgeler

  @GetMapping("/shipments/{id}/pod")
  @PreAuthorize(VIEW)
  ResponseEntity<PodResponse> pod(@PathVariable UUID id) {
    var pod = documents.pod(id);
    return pod == null
        ? ResponseEntity.noContent().build()
        : ResponseEntity.ok(mapper.toResponse(pod));
  }

  @PostMapping("/shipments/{id}/pod")
  @PreAuthorize(DISPATCH)
  PodResponse savePod(@PathVariable UUID id, @Valid @RequestBody SavePodRequest request) {
    return mapper.toResponse(documents.savePod(id, request));
  }

  @GetMapping("/shipments/{id}/documents")
  @PreAuthorize(VIEW)
  List<DocumentResponse> listDocuments(@PathVariable UUID id) {
    return documents.list(id);
  }

  @PostMapping("/shipments/{id}/documents/{type}")
  @PreAuthorize(DISPATCH)
  DocumentResponse generateDocument(@PathVariable UUID id, @PathVariable DocumentType type) {
    return documents.generate(id, type);
  }

  @PostMapping("/documents/{id}/issue")
  @PreAuthorize(DISPATCH)
  DocumentResponse issueDocument(@PathVariable UUID id) {
    return documents.issue(id);
  }

  @GetMapping("/documents/{id}/pdf")
  @PreAuthorize(VIEW)
  ResponseEntity<byte[]> documentPdf(@PathVariable UUID id) {
    RenderedPdf pdf = documents.pdf(id);
    return pdfResponse(pdf.fileName(), pdf.content());
  }

  // Fatura

  @GetMapping("/shipments/{id}/invoice")
  @PreAuthorize(VIEW)
  ResponseEntity<InvoiceResponse> invoice(@PathVariable UUID id) {
    var invoice = finance.invoiceOf(id);
    return invoice == null
        ? ResponseEntity.noContent().build()
        : ResponseEntity.ok(mapper.toResponse(invoice));
  }

  @PostMapping("/shipments/{id}/invoice")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(INVOICE)
  InvoiceResponse issueInvoice(
      @PathVariable UUID id, @Valid @RequestBody IssueInvoiceRequest request) {
    return mapper.toResponse(finance.issueInvoice(id, request));
  }

  @PostMapping("/invoices/{id}/cancel")
  @PreAuthorize(INVOICE)
  InvoiceResponse cancelInvoice(
      @PathVariable UUID id, @Valid @RequestBody CancelInvoiceRequest request) {
    return mapper.toResponse(finance.cancelInvoice(id, request.date()));
  }

  @GetMapping("/invoices/{id}/pdf")
  @PreAuthorize(VIEW)
  ResponseEntity<byte[]> invoicePdf(@PathVariable UUID id) {
    InvoicePdf pdf = finance.invoicePdf(id);
    return pdfResponse(pdf.fileName(), pdf.content());
  }

  // Sefer gideri, kapanış ve kârlılık

  @GetMapping("/shipments/{id}/costs")
  @PreAuthorize(VIEW)
  List<CostResponse> costs(@PathVariable UUID id) {
    List<TripCost> list = finance.costsOf(id);
    Map<UUID, String> names =
        views.accountNames(
            list.stream()
                .map(TripCost::getAccountId)
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toSet()));
    return list.stream().map(cost -> toResponse(cost, names.get(cost.getAccountId()))).toList();
  }

  @PostMapping("/shipments/{id}/costs")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(DISPATCH)
  CostResponse addCost(@PathVariable UUID id, @Valid @RequestBody SaveCostRequest request) {
    TripCost cost = finance.addCost(id, request);
    return toResponse(
        cost, cost.getAccountId() == null ? null : views.accountName(cost.getAccountId()));
  }

  @GetMapping("/shipments/{id}/linkable-expenses")
  @PreAuthorize(DISPATCH)
  List<LinkableExpense> linkableExpenses(@PathVariable UUID id) {
    return linkable.forShipment(id);
  }

  @DeleteMapping("/costs/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize(DISPATCH)
  void removeCost(@PathVariable UUID id) {
    finance.removeCost(id);
  }

  @PostMapping("/shipments/{id}/close")
  @PreAuthorize(INVOICE)
  ShipmentResponse close(@PathVariable UUID id, @Valid @RequestBody CloseShipmentRequest request) {
    return views.detail(finance.close(id, request));
  }

  @GetMapping("/shipments/{id}/profit")
  @PreAuthorize(VIEW)
  ProfitResponse profit(@PathVariable UUID id) {
    shipments.get(id);
    return finance.profit(id);
  }

  @GetMapping("/reports/profit")
  @PreAuthorize(VIEW)
  List<ProfitResponse> profitReport(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
    return finance.profitBetween(from, to);
  }

  @GetMapping("/options")
  @PreAuthorize(VIEW)
  ShipmentOptionsResponse options() {
    var all = accounts.findAll();
    Set<AccountType> customerTypes = Set.of(AccountType.CUSTOMER);
    Set<AccountType> carrierTypes = Set.of(AccountType.CARRIER, AccountType.SUPPLIER);
    Set<AccountType> costTypes =
        Set.of(AccountType.CARRIER, AccountType.SUPPLIER, AccountType.EMPLOYEE);
    Map<UUID, Quote> accepted =
        quotes.findAll().stream()
            .filter(quote -> quote.getStatus() == QuoteStatus.ACCEPTED)
            .collect(Collectors.toMap(Quote::getId, quote -> quote));
    List<QuoteLineOption> lines =
        accepted.isEmpty()
            ? List.of()
            : accepted.values().stream()
                .flatMap(
                    quote ->
                        quoteLines.findByQuoteIdOrderByCreatedAt(quote.getId()).stream()
                            .map(
                                line ->
                                    new QuoteLineOption(
                                        line.getId(),
                                        quote.getNumber()
                                            + " · "
                                            + line.getOrigin()
                                            + " - "
                                            + line.getDestination(),
                                        quote.getAccountId())))
                .toList();
    return new ShipmentOptionsResponse(
        all.stream()
            .filter(account -> customerTypes.contains(account.getType()))
            .map(account -> new Option(account.getId(), account.getName()))
            .toList(),
        all.stream()
            .filter(account -> carrierTypes.contains(account.getType()))
            .map(account -> new Option(account.getId(), account.getName()))
            .toList(),
        all.stream()
            .filter(account -> costTypes.contains(account.getType()))
            .map(account -> new Option(account.getId(), account.getName()))
            .toList(),
        tariffs.findAll().stream()
            .map(tariff -> new Option(tariff.getId(), tariff.getCode() + " · " + tariff.getName()))
            .toList(),
        taxRates.findAll().stream().map(rate -> new Option(rate.getId(), rate.getName())).toList(),
        lines);
  }

  private static CostResponse toResponse(TripCost cost, String accountName) {
    return new CostResponse(
        cost.getId(),
        cost.getLegId(),
        cost.getKind(),
        cost.getAccountId(),
        accountName,
        cost.getVehicleExpenseId(),
        cost.getMoney(),
        cost.getTlAmount(),
        cost.getDescription(),
        cost.getPostedAt());
  }

  private static ResponseEntity<byte[]> pdfResponse(String fileName, byte[] content) {
    return ResponseEntity.ok()
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment()
                .filename(fileName, StandardCharsets.UTF_8)
                .build()
                .toString())
        .contentType(MediaType.APPLICATION_PDF)
        .body(content);
  }
}
