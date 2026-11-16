package org.ece.blackrose.finance.web;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.web.PageResponse;
import org.ece.blackrose.finance.domain.FinanceTypes.CheckLeafStatus;
import org.ece.blackrose.finance.service.CheckBookService;
import org.ece.blackrose.finance.web.FinanceDtos.CheckBookCreatedResponse;
import org.ece.blackrose.finance.web.FinanceDtos.CheckBookRequest;
import org.ece.blackrose.finance.web.FinanceDtos.CheckBookResponse;
import org.ece.blackrose.finance.web.FinanceDtos.CheckLeafResponse;
import org.ece.blackrose.finance.web.FinanceDtos.CheckLeafVoidRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * Çek koçanları ve yaprakları (12.3_TASARIM §4.2): okuma {@code FINANCE_VIEW}, yazma {@code
 * FINANCE_MANAGE} (OK-12.3-16). Kapsam servis içinde uygulanır.
 */
@RestController
@RequestMapping("/api/v1/finance")
public class CheckBookController {

  private static final String VIEW = "hasAuthority('FINANCE_VIEW')";
  private static final String MANAGE = "hasAuthority('FINANCE_MANAGE')";

  private final CheckBookService service;

  public CheckBookController(CheckBookService service) {
    this.service = service;
  }

  @GetMapping("/check-books")
  @PreAuthorize(VIEW)
  List<CheckBookResponse> books(
      @RequestParam(required = false) UUID fundAccountId,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(required = false) List<UUID> branchIds) {
    return service.books(fundAccountId, companyId, branchIds);
  }

  @PostMapping("/check-books")
  @PreAuthorize(MANAGE)
  @ResponseStatus(HttpStatus.CREATED)
  CheckBookCreatedResponse create(@Valid @RequestBody CheckBookRequest request) {
    return service.create(request);
  }

  /** Yaprak listesi; {@code size} 1–1000 (400 {@code PAGE_SIZE_INVALID}). */
  @GetMapping("/check-leaves")
  @PreAuthorize(VIEW)
  PageResponse<CheckLeafResponse> leaves(
      @RequestParam(required = false) UUID fundAccountId,
      @RequestParam(required = false) UUID checkBookId,
      @RequestParam(required = false) CheckLeafStatus status,
      @RequestParam(required = false) String serial,
      @RequestParam(required = false) UUID companyId,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "1000") int size) {
    return service.leaves(fundAccountId, checkBookId, status, serial, companyId, page, size);
  }

  /** Numara önekiyle en çok 5 yaprak; {@code number} 1–7 rakam. */
  @GetMapping("/check-leaves/lookup")
  @PreAuthorize(VIEW)
  List<CheckLeafResponse> lookup(
      @RequestParam String number,
      @RequestParam(required = false) UUID fundAccountId,
      @RequestParam(required = false) UUID companyId) {
    return service.lookup(number, fundAccountId, companyId);
  }

  @PostMapping("/check-leaves/{id}/void")
  @PreAuthorize(MANAGE)
  CheckLeafResponse voidLeaf(
      @PathVariable UUID id, @Valid @RequestBody(required = false) CheckLeafVoidRequest request) {
    return service.voidLeaf(id, request);
  }

  @DeleteMapping("/check-leaves/{id}")
  @PreAuthorize(MANAGE)
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void deleteLeaf(@PathVariable UUID id) {
    service.deleteLeaf(id);
  }
}
