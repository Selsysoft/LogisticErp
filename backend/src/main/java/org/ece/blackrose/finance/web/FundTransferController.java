package org.ece.blackrose.finance.web;

import io.swagger.v3.oas.annotations.media.ArraySchema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.finance.domain.FinanceTypes.TransferStatus;
import org.ece.blackrose.finance.service.FundTransferService;
import org.ece.blackrose.finance.service.IntercompanyTransferService;
import org.ece.blackrose.finance.web.FundDtos.FundTransferRequest;
import org.ece.blackrose.finance.web.FundDtos.FundTransferResponse;
import org.ece.blackrose.finance.web.FundDtos.FxCandidateAccountResponse;
import org.ece.blackrose.finance.web.FundDtos.FxCandidateCollectionResponse;
import org.ece.blackrose.finance.web.FundDtos.FxReportResponse;
import org.ece.blackrose.finance.web.FundDtos.FxSourceResponse;
import org.ece.blackrose.finance.web.FundDtos.IntercompanyTransferRequest;
import org.ece.blackrose.finance.web.FundDtos.IntercompanyTransferResponse;
import org.ece.blackrose.finance.web.FundDtos.ReplaceTransferRequest;
import org.ece.blackrose.finance.web.FundDtos.ReverseTransferRequest;
import org.ece.blackrose.finance.web.FundDtos.TransferDependentResponse;
import org.ece.blackrose.finance.web.FundDtos.TransferListRowResponse;
import org.ece.blackrose.finance.web.FundDtos.TransferSummaryRowResponse;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Transfer merkezi ve şirketler arası virman (12.2_TASARIM §4.3–§4.4). Yazma uçları {@code
 * FINANCE_PAYMENT_CREATE}, okuma uçları {@code FINANCE_VIEW} ister. {@code Idempotency-Key} en çok
 * 100 karakterdir; aynı anahtar aynı istekle ilk kaydı döner.
 */
@RestController
@RequestMapping("/api/v1/finance")
public class FundTransferController {

  private static final String VIEW = "hasAuthority('FINANCE_VIEW')";
  private static final String POST = "hasAuthority('FINANCE_PAYMENT_CREATE')";
  private static final String IDEMPOTENCY_HEADER = "Idempotency-Key";

  private final FundTransferService transfers;
  private final IntercompanyTransferService intercompany;

  public FundTransferController(
      FundTransferService transfers, IntercompanyTransferService intercompany) {
    this.transfers = transfers;
    this.intercompany = intercompany;
  }

  // --- şirket içi transfer

  /**
   * Yeni transfer. {@code transferType} boşsa eski gövde (tür hesap türlerinden, ZTO kuralları
   * uygulanmaz); şirketler arası 422 {@code COMPANY_MISMATCH}.
   */
  @PostMapping("/funds/transfers")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(POST)
  FundTransferResponse create(
      @Valid @RequestBody FundTransferRequest request,
      @RequestHeader(name = IDEMPOTENCY_HEADER, required = false) @Size(max = 100)
          String idempotencyKey) {
    return transfers.create(request, blankToNull(idempotencyKey));
  }

  /**
   * Transferler sekmesi: şirket içi + şirketler arası. {@code transferType} bir {@code
   * FundTransferType} ya da {@code INTERCOMPANY}; aralık ≤ 366 gün, sayfa ≤ 200.
   */
  @GetMapping("/funds/transfers")
  @PreAuthorize(VIEW)
  PageResponse<TransferListRowResponse> list(
      @RequestParam(required = false) UUID companyId,
      @RequestParam(name = "branchId", required = false) List<UUID> branchIds,
      @RequestParam(required = false) String transferType,
      @RequestParam(required = false) TransferStatus status,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) String q,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "25") int size) {
    return transfers.search(companyId, branchIds, transferType, status, from, to, q, page, size);
  }

  /** Aynı süzgeçle grup özetleri (yalnız geçerli kayıtlar) ve TOTAL. */
  @GetMapping("/funds/transfers/summary")
  @PreAuthorize(VIEW)
  List<TransferSummaryRowResponse> summary(
      @RequestParam(required = false) UUID companyId,
      @RequestParam(name = "branchId", required = false) List<UUID> branchIds,
      @RequestParam(required = false) String transferType,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(required = false) String q) {
    return transfers.summary(companyId, branchIds, transferType, from, to, q);
  }

  /** Önceki Döviz Bozum Kaynakları; fon kapsam dışıysa 403. */
  @GetMapping("/funds/transfers/fx-sources")
  @PreAuthorize(VIEW)
  List<FxSourceResponse> fxSources(@RequestParam UUID fundId, @RequestParam String currency) {
    return transfers.fxSources(fundId, currency);
  }

  /**
   * {@code accountId} yoksa kaynak bankaya tahsilatı olan cariler ({@code
   * FxCandidateAccountResponse[]}), varsa o carinin bozulabilir tahsilatları ({@code
   * FxCandidateCollectionResponse[]}).
   */
  @GetMapping("/funds/transfers/fx-collection-candidates")
  @PreAuthorize(VIEW)
  @ApiResponse(
      responseCode = "200",
      content =
          @Content(
              array =
                  @ArraySchema(
                      schema =
                          @Schema(
                              type = "object",
                              oneOf = {
                                FxCandidateAccountResponse.class,
                                FxCandidateCollectionResponse.class
                              }))))
  List<?> fxCandidates(
      @RequestParam UUID fundId,
      @RequestParam String currency,
      @RequestParam(required = false) UUID accountId) {
    return accountId == null
        ? transfers.fxCandidateAccounts(fundId, currency)
        : transfers.fxCandidateCollections(fundId, currency, accountId);
  }

  /** Döviz Bozum & Tahsilat İzlenebilirliği (tablo); aralık ≤ 366 gün. */
  @GetMapping("/funds/transfers/fx-report")
  @PreAuthorize(VIEW)
  FxReportResponse fxReport(
      @RequestParam(required = false) UUID companyId,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
    return transfers.fxReport(companyId, from, to);
  }

  @GetMapping("/funds/transfers/{id}")
  @PreAuthorize(VIEW)
  FundTransferResponse get(@PathVariable UUID id) {
    return transfers.get(id);
  }

  @GetMapping("/funds/transfers/{id}/dependents")
  @PreAuthorize(VIEW)
  List<TransferDependentResponse> dependents(@PathVariable UUID id) {
    return transfers.dependents(id);
  }

  /** İptal; tarih {@code transferDate ≤ date ≤ max(bugün, transferDate)}. */
  @PostMapping("/funds/transfers/{id}/reverse")
  @PreAuthorize(POST)
  FundTransferResponse reverse(
      @PathVariable UUID id, @Valid @RequestBody ReverseTransferRequest request) {
    return transfers.reverse(id, request.date(), request.reason());
  }

  /** Düzenleme: eski transfer eski tarihiyle iptal, yenisi yeni kodla. */
  @PostMapping("/funds/transfers/{id}/replace")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(POST)
  FundTransferResponse replace(
      @PathVariable UUID id,
      @Valid @RequestBody ReplaceTransferRequest request,
      @RequestHeader(name = IDEMPOTENCY_HEADER, required = false) @Size(max = 100)
          String idempotencyKey) {
    return transfers.replace(id, request, blankToNull(idempotencyKey));
  }

  // --- şirketler arası virman

  @PostMapping("/intercompany-transfers")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(POST)
  IntercompanyTransferResponse createIntercompany(
      @Valid @RequestBody IntercompanyTransferRequest request,
      @RequestHeader(name = IDEMPOTENCY_HEADER, required = false) @Size(max = 100)
          String idempotencyKey) {
    return intercompany.create(request, blankToNull(idempotencyKey));
  }

  @GetMapping("/intercompany-transfers")
  @PreAuthorize(VIEW)
  PageResponse<IntercompanyTransferResponse> listIntercompany(
      @RequestParam(required = false) UUID companyId,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "200") int size) {
    return intercompany.list(companyId, from, to, page, size);
  }

  @GetMapping("/intercompany-transfers/{id}")
  @PreAuthorize(VIEW)
  IntercompanyTransferResponse getIntercompany(@PathVariable UUID id) {
    return intercompany.get(id);
  }

  @PostMapping("/intercompany-transfers/{id}/reverse")
  @PreAuthorize(POST)
  IntercompanyTransferResponse reverseIntercompany(
      @PathVariable UUID id, @Valid @RequestBody ReverseTransferRequest request) {
    return intercompany.reverse(id, request.date(), request.reason());
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }
}
