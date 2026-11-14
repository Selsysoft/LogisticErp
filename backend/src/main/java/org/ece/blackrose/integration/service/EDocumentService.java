package org.ece.blackrose.integration.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.integration.domain.EDocument;
import org.ece.blackrose.integration.domain.IntegrationTypes.EDocumentKind;
import org.ece.blackrose.integration.domain.IntegrationTypes.EDocumentSource;
import org.ece.blackrose.integration.domain.IntegrationTypes.EDocumentStatus;
import org.ece.blackrose.integration.repository.IntegrationRepositories.EDocumentRepository;
import org.ece.blackrose.integration.service.EDocumentProvider.Outgoing;
import org.ece.blackrose.integration.service.EDocumentProvider.Result;
import org.ece.blackrose.integration.service.UblWriter.InvoiceData;
import org.ece.blackrose.integration.service.UblWriter.Party;
import org.ece.blackrose.integration.service.UblWriter.WaybillData;
import org.ece.blackrose.integration.web.IntegrationDtos.EDocumentCandidate;
import org.ece.blackrose.integration.web.IntegrationDtos.SendEDocumentRequest;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.organization.Company;
import org.ece.blackrose.organization.CompanyIdentityService;
import org.ece.blackrose.organization.CompanyIdentityService.CompanyIdentity;
import org.ece.blackrose.organization.CompanyResolver;
import org.ece.blackrose.organization.CompanyService;
import org.ece.blackrose.shipment.domain.FreightInvoice;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.domain.ShipmentDocument;
import org.ece.blackrose.shipment.domain.ShipmentTypes.DocumentStatus;
import org.ece.blackrose.shipment.domain.ShipmentTypes.DocumentType;
import org.ece.blackrose.shipment.domain.ShipmentTypes.InvoiceStatus;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.FreightInvoiceRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentDocumentRepository;
import org.ece.blackrose.shipment.repository.ShipmentRepositories.ShipmentRepository;
import org.ece.blackrose.shipment.service.InvoiceCancelGuard;
import org.ece.blackrose.shipment.web.ShipmentDtos.DocumentContent;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Navlun faturası ve irsaliyenin entegratöre gönderimi. Gönderilmiş fatura önce e-belgesi iptal
 * edilmeden iptal edilemez; böylece finans ve e-belge birbirinden kopmaz.
 */
@Service
public class EDocumentService implements InvoiceCancelGuard {

  private static final Set<EDocumentStatus> ACTIVE =
      Set.of(EDocumentStatus.SENT, EDocumentStatus.ACCEPTED);

  private final EDocumentRepository documents;
  private final CompanyService companyService;
  private final FreightInvoiceRepository invoices;
  private final ShipmentDocumentRepository shipmentDocuments;
  private final ShipmentRepository shipments;
  private final AccountRepository accounts;
  private final CompanyIdentityService identities;
  private final EDocumentProvider provider;
  private final ObjectMapper json;
  private final CompanyResolver companies;
  private final TenantClock clock;
  private final BranchScopeService scope;

  public EDocumentService(
      EDocumentRepository documents,
      CompanyService companyService,
      FreightInvoiceRepository invoices,
      ShipmentDocumentRepository shipmentDocuments,
      ShipmentRepository shipments,
      AccountRepository accounts,
      CompanyIdentityService identities,
      EDocumentProvider provider,
      ObjectMapper json,
      TenantClock clock,
      CompanyResolver companies,
      BranchScopeService scope) {
    this.scope = scope;
    this.companies = companies;
    this.documents = documents;
    this.companyService = companyService;
    this.invoices = invoices;
    this.shipmentDocuments = shipmentDocuments;
    this.shipments = shipments;
    this.accounts = accounts;
    this.identities = identities;
    this.provider = provider;
    this.json = json;
    this.clock = clock;
  }

  public EDocumentProvider provider() {
    return provider;
  }

  /**
   * Eski e-belge ayarı cephesi: varsayılan şirketin vergi kimliği ve adresi ({@code
   * edocument_settings} tablosu artık okunmaz).
   */
  @Transactional(readOnly = true)
  public Company settings() {
    return companyService.find(companies.defaultCompanyId());
  }

  /**
   * Cephe yazımı şirket kartından geçer: VKN temizlenir ve doğrulanır, tekillik, denetim kaydı,
   * güncelleme sayacı ve grup carisi eşitlemesi {@link CompanyService#updateIdentity}'dedir.
   */
  @Transactional
  public Company saveSettings(String taxNumber, String taxOffice, String address) {
    return companyService.updateIdentity(
        companies.defaultCompanyId(), taxNumber, taxOffice, address);
  }

  @Transactional
  public EDocument send(SendEDocumentRequest request) {
    if (documents.existsBySourceTypeAndSourceIdAndStatusIn(
        request.sourceType(), request.sourceId(), ACTIVE)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "EDOCUMENT_ALREADY_SENT", "Bu belge zaten gönderilmiş.");
    }
    boolean waybill = request.sourceType() == EDocumentSource.WAYBILL;
    if (waybill != (request.kind() == EDocumentKind.EIRSALIYE)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "EDOCUMENT_KIND_INVALID", "Belge türü kaynakla uyuşmuyor.");
    }
    UUID ettn = UUID.randomUUID();
    return waybill ? sendWaybill(request, ettn) : sendInvoice(request, ettn);
  }

  /**
   * Gönderen, kaynak belgenin şirketidir (unvan, VKN/TCKN, vergi dairesi, adres); kiracı adı ya da
   * varsayılan şirket değil.
   */
  private Party supplier(UUID companyId) {
    CompanyIdentity company = identities.withoutLogo(companyId);
    if (company.taxNumber() == null) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "COMPANY_TAX_REQUIRED", "Önce şirketin vergi numarasını girin.");
    }
    return new Party(company.title(), company.taxNumber(), company.taxOffice(), company.address());
  }

  private EDocument sendInvoice(SendEDocumentRequest request, UUID ettn) {
    FreightInvoice invoice =
        invoices
            .findById(request.sourceId())
            .filter(row -> row.getStatus() == InvoiceStatus.ISSUED)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "INVOICE_NOT_FOUND", "Geçerli fatura bulunamadı."));
    scope.requireVisible(invoice.getBranchId());
    Party supplier = supplier(invoice.getCompanyId());
    Account customer = accounts.findById(invoice.getAccountId()).orElseThrow();
    if (request.kind() == EDocumentKind.EFATURA && customer.getTaxNumber() == null) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "CUSTOMER_TAX_REQUIRED",
          "e-Fatura için müşterinin vergi numarası gerekir.");
    }
    String ubl =
        UblWriter.invoice(
            new InvoiceData(
                request.kind() == EDocumentKind.EFATURA ? "TEMELFATURA" : "EARSIVFATURA",
                invoice.getNumber(),
                ettn,
                invoice.getInvoiceDate(),
                supplier,
                new Party(customer.getName(), customer.getTaxNumber(), null, null),
                invoice.getNet(),
                invoice.getVat(),
                invoice.getWithholding(),
                invoice.getTotal()));
    return deliver(
        request, invoice.getNumber(), invoice.getCompanyId(), ettn, customer.getTaxNumber(), ubl);
  }

  private EDocument sendWaybill(SendEDocumentRequest request, UUID ettn) {
    ShipmentDocument document =
        shipmentDocuments
            .findById(request.sourceId())
            .filter(row -> row.getType() == DocumentType.WAYBILL)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "DOCUMENT_NOT_FOUND", "İrsaliye bulunamadı."));
    if (document.getStatus() != DocumentStatus.ISSUED) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "DOCUMENT_NOT_ISSUED", "Önce irsaliyeyi yayımlayın.");
    }
    Shipment shipment = shipments.findById(document.getShipmentId()).orElseThrow();
    scope.requireVisible(shipment.getBranchId());
    UUID companyId = companies.companyOf(shipment.getBranchId());
    Party supplier = supplier(companyId);
    Account customer = accounts.findById(shipment.getAccountId()).orElseThrow();
    DocumentContent content = read(document.getContent());
    String ubl =
        UblWriter.waybill(
            new WaybillData(
                document.getNumber(),
                ettn,
                clock.today(),
                supplier,
                new Party(
                    content.consigneeName() != null ? content.consigneeName() : customer.getName(),
                    customer.getTaxNumber(),
                    null,
                    content.consigneeAddress()),
                content.plates(),
                content.drivers(),
                content.totalWeightKg()));
    return deliver(request, document.getNumber(), companyId, ettn, customer.getTaxNumber(), ubl);
  }

  private EDocument deliver(
      SendEDocumentRequest request,
      String number,
      UUID companyId,
      UUID ettn,
      String receiverTax,
      String ubl) {
    Result result = provider.send(new Outgoing(request.kind(), ettn, receiverTax, ubl));
    EDocument document =
        new EDocument(
            request.kind(),
            request.sourceType(),
            request.sourceId(),
            number,
            companyId,
            ettn,
            provider.name(),
            ubl);
    document.update(result.status(), result.reference(), result.message());
    return documents.save(document);
  }

  @Transactional
  public EDocument refresh(UUID id) {
    EDocument document = find(id);
    if (document.getStatus() == EDocumentStatus.SENT) {
      Result result = provider.status(document.getProviderRef());
      document.update(result.status(), result.reference(), result.message());
    }
    return document;
  }

  @Transactional
  public EDocument cancel(UUID id) {
    EDocument document = find(id);
    if (!ACTIVE.contains(document.getStatus())) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "EDOCUMENT_NOT_ACTIVE", "Bu belge iptal edilebilir durumda değil.");
    }
    Result result = provider.cancel(document.getProviderRef());
    document.update(result.status(), result.reference(), result.message());
    return document;
  }

  /** Bekleyen belgelerin durumunu sağlayıcıdan sorar. */
  @Transactional
  public void refreshPending() {
    documents
        .findByStatus(EDocumentStatus.SENT)
        .forEach(
            document -> {
              Result result = provider.status(document.getProviderRef());
              document.update(result.status(), result.reference(), result.message());
            });
  }

  @Override
  public void ensureCancellable(UUID invoiceId) {
    if (documents.existsBySourceTypeAndSourceIdAndStatusIn(
        EDocumentSource.FREIGHT_INVOICE, invoiceId, ACTIVE)) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "INVOICE_HAS_EDOCUMENT",
          "Fatura e-belge olarak gönderilmiş; önce e-belgeyi iptal edin.");
    }
  }

  /** e-Belge listesi; LIMITED kullanıcıda yalnız görebildiği şirketlerinkiler. */
  @Transactional(readOnly = true)
  public List<EDocument> list() {
    List<EDocument> all = documents.findAllByOrderByCreatedAtDesc();
    if (!scope.limited()) {
      return all;
    }
    Set<UUID> visible = Set.copyOf(scope.visibleCompanyIds());
    return all.stream().filter(document -> visible.contains(document.getCompanyId())).toList();
  }

  @Transactional(readOnly = true)
  public EDocument get(UUID id) {
    return find(id);
  }

  /** Gönderilebilecek belgeler; LIMITED kullanıcıda yalnız kapsamdaki iş yerlerinin belgeleri. */
  @Transactional(readOnly = true)
  public List<EDocumentCandidate> candidates() {
    Set<UUID> allowed = scope.allowedOrNull();
    List<EDocumentCandidate> rows = new ArrayList<>();
    for (FreightInvoice invoice : invoices.findByStatus(InvoiceStatus.ISSUED)) {
      if (allowed != null && !allowed.contains(invoice.getBranchId())) {
        continue;
      }
      if (!documents.existsBySourceTypeAndSourceIdAndStatusIn(
          EDocumentSource.FREIGHT_INVOICE, invoice.getId(), ACTIVE)) {
        rows.add(
            new EDocumentCandidate(
                invoice.getId(), EDocumentSource.FREIGHT_INVOICE, invoice.getNumber()));
      }
    }
    List<ShipmentDocument> waybills =
        shipmentDocuments.findByTypeAndStatus(DocumentType.WAYBILL, DocumentStatus.ISSUED);
    Set<UUID> visibleShipments =
        allowed == null
            ? null
            : shipments
                .findAllById(waybills.stream().map(ShipmentDocument::getShipmentId).toList())
                .stream()
                .filter(shipment -> allowed.contains(shipment.getBranchId()))
                .map(Shipment::getId)
                .collect(java.util.stream.Collectors.toSet());
    for (ShipmentDocument document : waybills) {
      if (visibleShipments != null && !visibleShipments.contains(document.getShipmentId())) {
        continue;
      }
      if (!documents.existsBySourceTypeAndSourceIdAndStatusIn(
          EDocumentSource.WAYBILL, document.getId(), ACTIVE)) {
        rows.add(
            new EDocumentCandidate(
                document.getId(), EDocumentSource.WAYBILL, document.getNumber()));
      }
    }
    return rows;
  }

  private DocumentContent read(String content) {
    try {
      return json.readValue(content, DocumentContent.class);
    } catch (com.fasterxml.jackson.core.JsonProcessingException ex) {
      throw new IllegalStateException(ex);
    }
  }

  /** e-Belgeyi yükler; LIMITED kullanıcıda belgenin şirketi görünür olmalı (403). */
  private EDocument find(UUID id) {
    EDocument document =
        documents
            .findById(id)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "EDOCUMENT_NOT_FOUND", "e-Belge bulunamadı."));
    if (scope.limited() && !scope.visibleCompanyIds().contains(document.getCompanyId())) {
      throw BranchScopeService.companyOutOfScope();
    }
    return document;
  }
}
