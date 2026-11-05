package org.ece.blackrose.warehouse.web;

import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.crm.repository.CrmRepositories.TaxRateRepository;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.organization.BranchRepository;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentRepository;
import org.ece.blackrose.tenant.TenantContext;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.ece.blackrose.warehouse.domain.StockBalance;
import org.ece.blackrose.warehouse.domain.StockCount;
import org.ece.blackrose.warehouse.domain.StockItem;
import org.ece.blackrose.warehouse.domain.StockMovement;
import org.ece.blackrose.warehouse.domain.Warehouse;
import org.ece.blackrose.warehouse.domain.WarehouseBin;
import org.ece.blackrose.warehouse.domain.WarehouseInvoice;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.HandlingChargeRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.HandlingRateRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.StockBalanceRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.StockCountRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.StockItemRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.StockMovementRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.WarehouseBinRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.WarehouseContractRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.WarehouseInvoiceRepository;
import org.ece.blackrose.warehouse.repository.WarehouseRepositories.WarehouseRepository;
import org.ece.blackrose.warehouse.service.StockCountService;
import org.ece.blackrose.warehouse.service.StockService;
import org.ece.blackrose.warehouse.service.WarehouseBillingService;
import org.ece.blackrose.warehouse.service.WarehouseInvoicePdf;
import org.ece.blackrose.warehouse.service.WarehouseViews;
import org.ece.blackrose.warehouse.web.WarehouseDtos.AddCountLineRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.BalanceResponse;
import org.ece.blackrose.warehouse.web.WarehouseDtos.BinResponse;
import org.ece.blackrose.warehouse.web.WarehouseDtos.CancelWarehouseInvoiceRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.ContractResponse;
import org.ece.blackrose.warehouse.web.WarehouseDtos.CountResponse;
import org.ece.blackrose.warehouse.web.WarehouseDtos.CountSummary;
import org.ece.blackrose.warehouse.web.WarehouseDtos.CreateCountRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.CustomsReleaseRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.EnterCountRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.HandlingResponse;
import org.ece.blackrose.warehouse.web.WarehouseDtos.InvoicePreview;
import org.ece.blackrose.warehouse.web.WarehouseDtos.IssueRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.IssueWarehouseInvoiceRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.MovementResponse;
import org.ece.blackrose.warehouse.web.WarehouseDtos.Option;
import org.ece.blackrose.warehouse.web.WarehouseDtos.RateResponse;
import org.ece.blackrose.warehouse.web.WarehouseDtos.ReceiptRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.ReverseMovementRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.SaveBinRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.SaveContractRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.SaveHandlingRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.SaveRateRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.SaveStockItemRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.SaveWarehouseRequest;
import org.ece.blackrose.warehouse.web.WarehouseDtos.StockItemResponse;
import org.ece.blackrose.warehouse.web.WarehouseDtos.WarehouseInvoiceResponse;
import org.ece.blackrose.warehouse.web.WarehouseDtos.WarehouseOptionsResponse;
import org.ece.blackrose.warehouse.web.WarehouseDtos.WarehouseResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
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
@RequestMapping("/api/v1/warehouse")
public class WarehouseController {

  private static final String VIEW = "hasAuthority('WAREHOUSE_VIEW')";
  private static final String EDIT = "hasAuthority('WAREHOUSE_EDIT')";
  private static final String INVOICE = "hasAuthority('WAREHOUSE_INVOICE')";
  private static final int SHIPMENT_OPTION_LIMIT = 200;

  private final WarehouseRepository warehouses;
  private final WarehouseBinRepository bins;
  private final StockItemRepository items;
  private final StockBalanceRepository balances;
  private final StockMovementRepository movements;
  private final StockCountRepository counts;
  private final WarehouseContractRepository contracts;
  private final HandlingRateRepository rates;
  private final HandlingChargeRepository charges;
  private final WarehouseInvoiceRepository invoices;
  private final BranchRepository branches;
  private final AccountRepository accounts;
  private final TaxRateRepository taxRates;
  private final ShipmentRepository shipments;
  private final TenantRepository tenants;
  private final StockService stock;
  private final StockCountService countService;
  private final WarehouseBillingService billing;
  private final WarehouseViews views;
  private final WarehouseMapper mapper;

  public WarehouseController(
      WarehouseRepository warehouses,
      WarehouseBinRepository bins,
      StockItemRepository items,
      StockBalanceRepository balances,
      StockMovementRepository movements,
      StockCountRepository counts,
      WarehouseContractRepository contracts,
      HandlingRateRepository rates,
      HandlingChargeRepository charges,
      WarehouseInvoiceRepository invoices,
      BranchRepository branches,
      AccountRepository accounts,
      TaxRateRepository taxRates,
      ShipmentRepository shipments,
      TenantRepository tenants,
      StockService stock,
      StockCountService countService,
      WarehouseBillingService billing,
      WarehouseViews views,
      WarehouseMapper mapper) {
    this.warehouses = warehouses;
    this.bins = bins;
    this.items = items;
    this.balances = balances;
    this.movements = movements;
    this.counts = counts;
    this.contracts = contracts;
    this.rates = rates;
    this.charges = charges;
    this.invoices = invoices;
    this.branches = branches;
    this.accounts = accounts;
    this.taxRates = taxRates;
    this.shipments = shipments;
    this.tenants = tenants;
    this.stock = stock;
    this.countService = countService;
    this.billing = billing;
    this.views = views;
    this.mapper = mapper;
  }

  // Depo ve göz

  @GetMapping("/warehouses")
  @PreAuthorize(VIEW)
  List<WarehouseResponse> listWarehouses() {
    return warehouses.findAllByOrderByCode().stream().map(mapper::toResponse).toList();
  }

  @PostMapping("/warehouses")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  @Transactional
  public WarehouseResponse createWarehouse(@Valid @RequestBody SaveWarehouseRequest request) {
    if (request.code() == null || request.code().isBlank()) {
      throw new BusinessException(HttpStatus.BAD_REQUEST, "CODE_REQUIRED", "Depo kodu zorunludur.");
    }
    if (warehouses.existsByCode(request.code())) {
      throw new BusinessException(HttpStatus.CONFLICT, "CODE_TAKEN", "Bu depo kodu kullanılıyor.");
    }
    ensureBranch(request.branchId());
    return mapper.toResponse(warehouses.save(new Warehouse(request)));
  }

  @PutMapping("/warehouses/{id}")
  @PreAuthorize(EDIT)
  @Transactional
  public WarehouseResponse updateWarehouse(
      @PathVariable UUID id, @Valid @RequestBody SaveWarehouseRequest request) {
    ensureBranch(request.branchId());
    Warehouse warehouse = findWarehouse(id);
    warehouse.update(request);
    return mapper.toResponse(warehouse);
  }

  @GetMapping("/bins")
  @PreAuthorize(VIEW)
  List<BinResponse> listBins(@RequestParam(required = false) UUID warehouseId) {
    List<WarehouseBin> list =
        warehouseId == null
            ? bins.findAll(Sort.by("code"))
            : bins.findByWarehouseIdOrderByCode(warehouseId);
    return list.stream().map(mapper::toResponse).toList();
  }

  @PostMapping("/warehouses/{id}/bins")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  @Transactional
  public BinResponse createBin(@PathVariable UUID id, @Valid @RequestBody SaveBinRequest request) {
    findWarehouse(id);
    if (bins.existsByWarehouseIdAndCode(id, request.code())) {
      throw new BusinessException(HttpStatus.CONFLICT, "CODE_TAKEN", "Bu göz kodu kullanılıyor.");
    }
    return mapper.toResponse(
        bins.save(new WarehouseBin(id, request.code(), request.description())));
  }

  // Ürün

  @GetMapping("/items")
  @PreAuthorize(VIEW)
  List<StockItemResponse> listItems() {
    return views.items(items.findAllByOrderBySku());
  }

  @PostMapping("/items")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  @Transactional
  public StockItemResponse createItem(@Valid @RequestBody SaveStockItemRequest request) {
    if (!accounts.existsById(request.accountId())) {
      throw new BusinessException(HttpStatus.NOT_FOUND, "ACCOUNT_NOT_FOUND", "Cari bulunamadı.");
    }
    if (items.existsByAccountIdAndSku(request.accountId(), request.sku())) {
      throw new BusinessException(HttpStatus.CONFLICT, "CODE_TAKEN", "Bu ürün kodu kullanılıyor.");
    }
    StockItem item = items.save(new StockItem(request));
    return views.items(List.of(item)).get(0);
  }

  // Stok

  @GetMapping("/balances")
  @PreAuthorize(VIEW)
  @Transactional(readOnly = true)
  public PageResponse<BalanceResponse> listBalances(
      @RequestParam(required = false) UUID warehouseId,
      @RequestParam(required = false) UUID accountId,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
          LocalDate expiresBy,
      Pageable pageable) {
    Page<StockBalance> page = balances.search(warehouseId, accountId, expiresBy, pageable);
    return PageResponse.from(
        new PageImpl<>(views.balances(page.getContent()), pageable, page.getTotalElements()),
        row -> row);
  }

  @GetMapping("/movements")
  @PreAuthorize(VIEW)
  @Transactional(readOnly = true)
  public PageResponse<MovementResponse> listMovements(
      @RequestParam(required = false) UUID warehouseId,
      @RequestParam(required = false) UUID accountId,
      @RequestParam(required = false) UUID itemId,
      Pageable pageable) {
    Page<StockMovement> page = movements.search(warehouseId, accountId, itemId, pageable);
    return PageResponse.from(
        new PageImpl<>(views.movements(page.getContent()), pageable, page.getTotalElements()),
        row -> row);
  }

  @PostMapping("/receipts")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  MovementResponse receive(@Valid @RequestBody ReceiptRequest request) {
    return views.movements(List.of(stock.receive(request))).get(0);
  }

  @PostMapping("/issues")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  MovementResponse issue(@Valid @RequestBody IssueRequest request) {
    return views.movements(List.of(stock.issue(request))).get(0);
  }

  @PostMapping("/customs-releases")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  MovementResponse releaseCustoms(@Valid @RequestBody CustomsReleaseRequest request) {
    return views.movements(List.of(stock.releaseCustoms(request))).get(0);
  }

  @PostMapping("/movements/{id}/reverse")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  MovementResponse reverse(
      @PathVariable UUID id, @Valid @RequestBody ReverseMovementRequest request) {
    return views.movements(List.of(stock.reverse(id, request.date()))).get(0);
  }

  // Sayım

  @GetMapping("/counts")
  @PreAuthorize(VIEW)
  List<CountSummary> listCounts() {
    return counts.findAll(Sort.by(Sort.Direction.DESC, "countDate", "createdAt")).stream()
        .map(views::countSummary)
        .toList();
  }

  @GetMapping("/counts/{id}")
  @PreAuthorize(VIEW)
  CountResponse getCount(@PathVariable UUID id) {
    return views.count(findCount(id));
  }

  @PostMapping("/counts")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  CountResponse openCount(@Valid @RequestBody CreateCountRequest request) {
    return views.count(countService.open(request.warehouseId(), request.date()));
  }

  @PutMapping("/count-lines/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize(EDIT)
  void enterCount(@PathVariable UUID id, @Valid @RequestBody EnterCountRequest request) {
    countService.enter(id, request.countedQuantity());
  }

  @PostMapping("/counts/{id}/lines")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  CountResponse addCountLine(
      @PathVariable UUID id, @Valid @RequestBody AddCountLineRequest request) {
    countService.addLine(id, request);
    return views.count(findCount(id));
  }

  @PostMapping("/counts/{id}/post")
  @PreAuthorize(EDIT)
  CountResponse postCount(@PathVariable UUID id) {
    return views.count(countService.post(id));
  }

  // Sözleşme, elleçleme ve fatura

  @GetMapping("/contracts")
  @PreAuthorize(VIEW)
  List<ContractResponse> listContracts() {
    return contracts.findAll(Sort.by(Sort.Direction.DESC, "startDate")).stream()
        .map(views::contract)
        .toList();
  }

  @PostMapping("/contracts")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  ContractResponse createContract(@Valid @RequestBody SaveContractRequest request) {
    return views.contract(billing.createContract(request));
  }

  @GetMapping("/contracts/{id}/rates")
  @PreAuthorize(VIEW)
  List<RateResponse> listRates(@PathVariable UUID id) {
    return rates.findByContractId(id).stream().map(mapper::toResponse).toList();
  }

  @PostMapping("/contracts/{id}/rates")
  @PreAuthorize(EDIT)
  RateResponse saveRate(@PathVariable UUID id, @Valid @RequestBody SaveRateRequest request) {
    return mapper.toResponse(billing.saveRate(id, request));
  }

  @GetMapping("/contracts/{id}/handling")
  @PreAuthorize(VIEW)
  List<HandlingResponse> listHandling(@PathVariable UUID id) {
    return charges.findByContractIdOrderByChargedOnDesc(id).stream()
        .map(mapper::toResponse)
        .toList();
  }

  @PostMapping("/contracts/{id}/handling")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(EDIT)
  HandlingResponse addHandling(
      @PathVariable UUID id, @Valid @RequestBody SaveHandlingRequest request) {
    return mapper.toResponse(billing.addHandling(id, request));
  }

  @DeleteMapping("/handling/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize(EDIT)
  void removeHandling(@PathVariable UUID id) {
    billing.removeHandling(id);
  }

  @GetMapping("/contracts/{id}/invoice-preview")
  @PreAuthorize(VIEW)
  InvoicePreview preview(
      @PathVariable UUID id,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
    return billing.preview(id, from, to);
  }

  @GetMapping("/contracts/{id}/invoices")
  @PreAuthorize(VIEW)
  List<WarehouseInvoiceResponse> listInvoices(@PathVariable UUID id) {
    return invoices.findByContractIdOrderByPeriodFromDesc(id).stream()
        .map(mapper::toResponse)
        .toList();
  }

  @PostMapping("/contracts/{id}/invoices")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(INVOICE)
  WarehouseInvoiceResponse issueInvoice(
      @PathVariable UUID id, @Valid @RequestBody IssueWarehouseInvoiceRequest request) {
    return mapper.toResponse(billing.issue(id, request));
  }

  @PostMapping("/invoices/{id}/cancel")
  @PreAuthorize(INVOICE)
  WarehouseInvoiceResponse cancelInvoice(
      @PathVariable UUID id, @Valid @RequestBody CancelWarehouseInvoiceRequest request) {
    return mapper.toResponse(billing.cancel(id, request.date()));
  }

  @GetMapping("/invoices/{id}/pdf")
  @PreAuthorize(VIEW)
  ResponseEntity<byte[]> invoicePdf(@PathVariable UUID id) {
    WarehouseInvoice invoice = billing.findInvoice(id);
    String company =
        tenants.findByCode(TenantContext.currentCode().orElseThrow()).orElseThrow().getName();
    byte[] content =
        WarehouseInvoicePdf.render(invoice, company, views.accountName(invoice.getAccountId()));
    return ResponseEntity.ok()
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment()
                .filename(invoice.getNumber() + ".pdf", StandardCharsets.UTF_8)
                .build()
                .toString())
        .contentType(MediaType.APPLICATION_PDF)
        .body(content);
  }

  @GetMapping("/options")
  @PreAuthorize(VIEW)
  WarehouseOptionsResponse options() {
    Page<Shipment> recent =
        shipments.findAll(
            PageRequest.of(
                0, SHIPMENT_OPTION_LIMIT, Sort.by(Sort.Direction.DESC, "plannedPickup")));
    return new WarehouseOptionsResponse(
        accounts.findAll().stream()
            .filter(account -> account.getType() == AccountType.CUSTOMER)
            .map(account -> new Option(account.getId(), account.getName()))
            .toList(),
        taxRates.findAll().stream().map(rate -> new Option(rate.getId(), rate.getName())).toList(),
        recent.stream()
            .map(
                shipment ->
                    new Option(
                        shipment.getId(),
                        shipment.getNumber()
                            + " · "
                            + shipment.getOrigin()
                            + " - "
                            + shipment.getDestination()))
            .toList());
  }

  private void ensureBranch(UUID branchId) {
    if (!branches.existsById(branchId)) {
      throw new BusinessException(HttpStatus.BAD_REQUEST, "BRANCH_NOT_FOUND", "Şube bulunamadı.");
    }
  }

  private Warehouse findWarehouse(UUID id) {
    return warehouses
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "WAREHOUSE_NOT_FOUND", "Depo bulunamadı."));
  }

  private StockCount findCount(UUID id) {
    return counts
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "COUNT_NOT_FOUND", "Sayım bulunamadı."));
  }
}
