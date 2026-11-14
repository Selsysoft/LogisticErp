package org.ece.blackrose.finance.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.finance.service.AccountTransferService;
import org.ece.blackrose.finance.web.AccountDtos.AccountTransferHistoryRowResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountTransferRequest;
import org.ece.blackrose.finance.web.AccountDtos.AccountTransferResponse;
import org.ece.blackrose.finance.web.AccountDtos.AccountTransferReverseRequest;
import org.ece.blackrose.finance.web.AccountDtos.TransferableTransactionResponse;
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

/** Cari taşıma uçları (12.1 §4.7). */
@RestController
@RequestMapping("/api/v1/finance")
public class AccountTransferController {

  private static final String VIEW = "hasAuthority('FINANCE_VIEW')";
  private static final String MANAGE = "hasAuthority('FINANCE_MANAGE')";
  private static final String IDEMPOTENCY_HEADER = "Idempotency-Key";

  private final AccountTransferService transfers;

  public AccountTransferController(AccountTransferService transfers) {
    this.transfers = transfers;
  }

  /** Taşınabilir hareketler; açık planlı satır {@code blockedReason = OPEN_PLAN} ile döner. */
  @GetMapping("/accounts/{id}/transferable-transactions")
  @PreAuthorize(VIEW)
  List<TransferableTransactionResponse> transferable(
      @PathVariable UUID id, @RequestParam(required = false) UUID companyId) {
    return transfers.transferable(id, companyId);
  }

  /** Aynı {@code Idempotency-Key} ile tekrar her durumda 201 ve aynı taşıma. */
  @PostMapping("/account-transfers")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(MANAGE)
  AccountTransferResponse create(
      @Valid @RequestBody AccountTransferRequest request,
      @RequestHeader(name = IDEMPOTENCY_HEADER, required = false) @Size(max = 100)
          String idempotencyKey) {
    return transfers.create(request, blankToNull(idempotencyKey));
  }

  /** Geçmiş taşımalar; tarih verilmezse son 6 ay. Sayfa boyu en çok 500. */
  @GetMapping("/account-transfers")
  @PreAuthorize(VIEW)
  PageResponse<AccountTransferHistoryRowResponse> history(
      @RequestParam(required = false) UUID accountId,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "100") int size) {
    return transfers.history(accountId, from, to, page, size);
  }

  @GetMapping("/account-transfers/{id}")
  @PreAuthorize(VIEW)
  AccountTransferResponse get(@PathVariable UUID id) {
    return transfers.get(id);
  }

  @PostMapping("/account-transfers/{id}/reverse")
  @PreAuthorize(MANAGE)
  AccountTransferResponse reverse(
      @PathVariable UUID id,
      @Valid @RequestBody(required = false) AccountTransferReverseRequest request) {
    return transfers.reverse(id, request);
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }
}
