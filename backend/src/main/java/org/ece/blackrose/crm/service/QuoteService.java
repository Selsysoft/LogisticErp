package org.ece.blackrose.crm.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.crm.domain.Contract;
import org.ece.blackrose.crm.domain.CrmTypes.OpportunityStage;
import org.ece.blackrose.crm.domain.CrmTypes.QuoteStatus;
import org.ece.blackrose.crm.domain.Quote;
import org.ece.blackrose.crm.domain.QuoteLine;
import org.ece.blackrose.crm.repository.CrmRepositories.OpportunityRepository;
import org.ece.blackrose.crm.repository.CrmRepositories.QuoteLineRepository;
import org.ece.blackrose.crm.repository.CrmRepositories.QuoteRepository;
import org.ece.blackrose.crm.web.CrmDtos.AcceptQuoteRequest;
import org.ece.blackrose.crm.web.CrmDtos.AddQuoteLineRequest;
import org.ece.blackrose.crm.web.CrmDtos.PriceBreakdown;
import org.ece.blackrose.crm.web.CrmDtos.PriceRequest;
import org.ece.blackrose.crm.web.CrmDtos.QuoteLineResponse;
import org.ece.blackrose.crm.web.CrmDtos.QuoteResponse;
import org.ece.blackrose.crm.web.CrmDtos.SaveQuoteRequest;
import org.ece.blackrose.files.FileService;
import org.ece.blackrose.files.FileService.Download;
import org.ece.blackrose.files.StoredFile;
import org.ece.blackrose.tenant.TenantClock;
import org.ece.blackrose.tenant.TenantContext;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Taslak düzenlenebilir. Gönderilince fiyatlar ve PDF donar; değişiklik için yeni sürüm açılır.
 * Kabul, fırsatı kazanılmış yapar, adayı müşteriye çevirir ve sözleşme oluşturur.
 */
@Service
public class QuoteService {

  private static final String PDF_OWNER_TYPE = "QUOTE_PDF";
  private static final String PDF_TYPE = "application/pdf";

  public record RenderedPdf(String fileName, byte[] content) {}

  private final QuoteRepository quotes;
  private final QuoteLineRepository lines;
  private final OpportunityRepository opportunityRepository;
  private final OpportunityService opportunities;
  private final CustomerService customers;
  private final ContractService contracts;
  private final PricingService pricing;
  private final FileService files;
  private final TenantRepository tenants;
  private final ObjectMapper json;
  private final TenantClock clock;

  public QuoteService(
      QuoteRepository quotes,
      QuoteLineRepository lines,
      OpportunityRepository opportunityRepository,
      OpportunityService opportunities,
      CustomerService customers,
      ContractService contracts,
      PricingService pricing,
      FileService files,
      TenantRepository tenants,
      ObjectMapper json,
      TenantClock clock) {
    this.clock = clock;
    this.quotes = quotes;
    this.lines = lines;
    this.opportunityRepository = opportunityRepository;
    this.opportunities = opportunities;
    this.customers = customers;
    this.contracts = contracts;
    this.pricing = pricing;
    this.files = files;
    this.tenants = tenants;
    this.json = json;
  }

  @Transactional(readOnly = true)
  public Page<QuoteResponse> list(QuoteStatus status, UUID accountId, Pageable pageable) {
    return quotes.search(status, accountId, pageable).map(this::toResponse);
  }

  @Transactional(readOnly = true)
  public QuoteResponse get(UUID id) {
    return toResponse(find(id));
  }

  @Transactional(readOnly = true)
  public List<QuoteResponse> versions(UUID id) {
    return quotes.findByNumberOrderByVersion(find(id).getNumber()).stream()
        .map(this::toResponse)
        .toList();
  }

  @Transactional
  public QuoteResponse create(SaveQuoteRequest request) {
    customers.find(request.accountId());
    if (request.opportunityId() != null
        && !opportunityRepository.existsById(request.opportunityId())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "OPPORTUNITY_NOT_FOUND", "Fırsat bulunamadı.");
    }
    String number = "T-%d-%06d".formatted(clock.today().getYear(), quotes.nextNumber());
    return toResponse(
        quotes.save(
            new Quote(
                number,
                1,
                request.accountId(),
                request.opportunityId(),
                request.tariffId(),
                request.taxRateId(),
                request.currency(),
                request.validUntil(),
                request.notes())));
  }

  @Transactional
  public QuoteResponse addLine(UUID quoteId, AddQuoteLineRequest request) {
    Quote quote = lockDraft(quoteId);
    PriceBreakdown price = priceLine(quote, request);
    if (!quote.getCurrency().equals(price.currency())) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "CURRENCY_MISMATCH",
          "Tarifenin para birimi teklifin para birimiyle aynı olmalıdır.");
    }
    lines.save(
        new QuoteLine(
            quote.getId(),
            request.origin(),
            request.destination(),
            request.vehicleType(),
            request.weightTon(),
            request.pallets(),
            request.distanceKm(),
            request.description(),
            price.net(),
            price.vat(),
            price.withholding(),
            price.total(),
            write(price)));
    recalculate(quote);
    return toResponse(quote);
  }

  @Transactional
  public QuoteResponse removeLine(UUID quoteId, UUID lineId) {
    Quote quote = lockDraft(quoteId);
    QuoteLine line =
        lines
            .findById(lineId)
            .filter(candidate -> candidate.getQuoteId().equals(quoteId))
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "QUOTE_LINE_NOT_FOUND", "Teklif satırı bulunamadı."));
    line.markDeleted();
    lines.flush();
    recalculate(quote);
    return toResponse(quote);
  }

  @Transactional
  public QuoteResponse send(UUID id) {
    Quote quote = lockDraft(id);
    List<QuoteLine> quoteLines = lines.findByQuoteIdOrderByCreatedAt(id);
    if (quoteLines.isEmpty()) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "QUOTE_EMPTY", "Satırı olmayan teklif gönderilemez.");
    }
    if (quote.getOpportunityId() != null) {
      opportunities.advanceToQuote(quote.getOpportunityId());
    }
    byte[] pdf = render(quote, quoteLines);
    StoredFile file =
        files.storeGenerated(PDF_OWNER_TYPE, quote.getId(), fileName(quote), PDF_TYPE, pdf);
    quote.attachPdf(file.getId());
    quote.moveTo(QuoteStatus.SENT);
    return toResponse(quote);
  }

  /** Gönderilmiş veya reddedilmiş teklifin üzerine yeni taslak sürüm açar. */
  @Transactional
  public QuoteResponse newVersion(UUID id) {
    Quote current = lock(id);
    if (current.getStatus() != QuoteStatus.SENT && current.getStatus() != QuoteStatus.REJECTED) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "QUOTE_INVALID_STATE",
          "Yalnız gönderilmiş veya reddedilmiş teklifin yeni sürümü açılabilir.");
    }
    Quote next =
        quotes.save(
            new Quote(
                current.getNumber(),
                current.getVersion() + 1,
                current.getAccountId(),
                current.getOpportunityId(),
                current.getTariffId(),
                current.getTaxRateId(),
                current.getCurrency(),
                current.getValidUntil(),
                current.getNotes()));
    List<QuoteLine> copies =
        lines.findByQuoteIdOrderByCreatedAt(id).stream()
            .map(line -> line.copyTo(next.getId()))
            .toList();
    lines.saveAll(copies);
    next.recalculate(copies);
    current.moveTo(QuoteStatus.SUPERSEDED);
    return toResponse(next);
  }

  @Transactional
  public QuoteResponse reject(UUID id) {
    Quote quote = lock(id);
    requireSent(quote);
    quote.moveTo(QuoteStatus.REJECTED);
    return toResponse(quote);
  }

  @Transactional
  public Contract accept(UUID id, AcceptQuoteRequest request, LocalDate today) {
    Quote quote = lock(id);
    requireSent(quote);
    if (quote.getValidUntil().isBefore(today)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "QUOTE_EXPIRED", "Teklifin geçerlilik süresi dolmuş.");
    }
    quote.moveTo(QuoteStatus.ACCEPTED);
    customers.promoteLead(quote.getAccountId());
    if (quote.getOpportunityId() != null) {
      opportunities.move(
          quote.getOpportunityId(), OpportunityStage.WON, "Teklif " + quote.getNumber());
    }
    return contracts.create(
        quote.getAccountId(),
        quote.getId(),
        request.tariffId() != null ? request.tariffId() : quote.getTariffId(),
        request.startDate(),
        request.endDate(),
        request.paymentTermDays(),
        request.fuelSurchargePercent(),
        request.waitingHourlyFee(),
        request.specialTerms());
  }

  /** Gönderilmiş teklifte arşivdeki belge, taslakta anlık önizleme döner. */
  @Transactional(readOnly = true)
  public RenderedPdf pdf(UUID id) {
    Quote quote = find(id);
    if (quote.getPdfFileId() != null) {
      Download download = files.openGenerated(quote.getPdfFileId());
      try (var content = download.content()) {
        return new RenderedPdf(download.file().getFileName(), content.readAllBytes());
      } catch (java.io.IOException ex) {
        throw new java.io.UncheckedIOException(ex);
      }
    }
    return new RenderedPdf(fileName(quote), render(quote, lines.findByQuoteIdOrderByCreatedAt(id)));
  }

  private PriceBreakdown priceLine(Quote quote, AddQuoteLineRequest request) {
    if (request.manualNet() != null) {
      return pricing.manual(request.manualNet(), quote.getCurrency(), quote.getTaxRateId());
    }
    return pricing.price(
        new PriceRequest(
            quote.getAccountId(),
            quote.getTariffId(),
            quote.getTaxRateId(),
            clock.today(),
            request.origin(),
            request.destination(),
            request.vehicleType(),
            request.weightTon(),
            request.pallets(),
            request.distanceKm(),
            request.waitingHours(),
            request.extraStops(),
            request.adr(),
            request.tollAmount()));
  }

  private byte[] render(Quote quote, List<QuoteLine> quoteLines) {
    String company =
        tenants.findByCode(TenantContext.currentCode().orElseThrow()).orElseThrow().getName();
    return QuotePdf.render(
        quote, quoteLines, customers.find(quote.getAccountId()).getName(), company);
  }

  private static String fileName(Quote quote) {
    return "%s-v%d.pdf".formatted(quote.getNumber(), quote.getVersion());
  }

  private void recalculate(Quote quote) {
    quote.recalculate(lines.findByQuoteIdOrderByCreatedAt(quote.getId()));
  }

  private static void requireSent(Quote quote) {
    if (quote.getStatus() != QuoteStatus.SENT) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "QUOTE_INVALID_STATE",
          "Bu işlem yalnız gönderilmiş teklifte yapılır.");
    }
  }

  private Quote lockDraft(UUID id) {
    Quote quote = lock(id);
    if (quote.getStatus() != QuoteStatus.DRAFT) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "QUOTE_LOCKED",
          "Gönderilmiş teklif değiştirilemez; yeni sürüm açın.");
    }
    return quote;
  }

  private Quote lock(UUID id) {
    return quotes.findForUpdate(id).orElseThrow(QuoteService::notFound);
  }

  private Quote find(UUID id) {
    return quotes.findById(id).orElseThrow(QuoteService::notFound);
  }

  private static BusinessException notFound() {
    return new BusinessException(HttpStatus.NOT_FOUND, "QUOTE_NOT_FOUND", "Teklif bulunamadı.");
  }

  private QuoteResponse toResponse(Quote quote) {
    List<QuoteLineResponse> lineResponses =
        lines.findByQuoteIdOrderByCreatedAt(quote.getId()).stream()
            .map(
                line ->
                    new QuoteLineResponse(
                        line.getId(),
                        line.getOrigin(),
                        line.getDestination(),
                        line.getVehicleType(),
                        line.getWeightTon(),
                        line.getPallets(),
                        line.getDistanceKm(),
                        line.getDescription(),
                        line.getNetAmount(),
                        line.getVatAmount(),
                        line.getWithholdingAmount(),
                        line.getTotalAmount(),
                        read(line.getBreakdown())))
            .toList();
    return new QuoteResponse(
        quote.getId(),
        quote.getNumber(),
        quote.getVersion(),
        quote.getAccountId(),
        quote.getOpportunityId(),
        quote.getTariffId(),
        quote.getTaxRateId(),
        quote.getCurrency(),
        quote.getValidUntil(),
        quote.getStatus(),
        quote.getNet(),
        quote.getVat(),
        quote.getWithholding(),
        quote.getTotal(),
        quote.getNotes(),
        lineResponses);
  }

  private String write(PriceBreakdown breakdown) {
    try {
      return json.writeValueAsString(breakdown);
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException(ex);
    }
  }

  private PriceBreakdown read(String value) {
    try {
      return json.readValue(value, PriceBreakdown.class);
    } catch (JsonProcessingException ex) {
      throw new IllegalStateException(ex);
    }
  }
}
