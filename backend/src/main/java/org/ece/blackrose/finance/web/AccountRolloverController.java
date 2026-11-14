package org.ece.blackrose.finance.web;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.finance.service.AccountRolloverService;
import org.ece.blackrose.finance.web.AccountDtos.AccountRolloverResponse;
import org.ece.blackrose.finance.web.AccountDtos.RolloverRequest;
import org.springframework.http.HttpStatus;
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

/** Cari devir / sezon uçları (12.1 §4.6). Defter kaydı üretmez. */
@RestController
@RequestMapping("/api/v1/finance")
public class AccountRolloverController {

  private static final String VIEW = "hasAuthority('FINANCE_VIEW')";
  private static final String MANAGE = "hasAuthority('FINANCE_MANAGE')";

  private final AccountRolloverService rollovers;

  public AccountRolloverController(AccountRolloverService rollovers) {
    this.rollovers = rollovers;
  }

  /** {@code deleted=true} silinenler (ZTO "Silinenler"). */
  @GetMapping("/accounts/{id}/rollovers")
  @PreAuthorize(VIEW)
  List<AccountRolloverResponse> list(
      @PathVariable UUID id, @RequestParam(defaultValue = "false") boolean deleted) {
    return rollovers.list(id, deleted);
  }

  /** Yeni sezon aktif olur, önceki aktif sezon pasifleşir. */
  @PostMapping("/accounts/{id}/rollovers")
  @ResponseStatus(HttpStatus.CREATED)
  @PreAuthorize(MANAGE)
  AccountRolloverResponse create(
      @PathVariable UUID id, @Valid @RequestBody RolloverRequest request) {
    return rollovers.create(id, request);
  }

  @PutMapping("/rollovers/{id}")
  @PreAuthorize(MANAGE)
  AccountRolloverResponse update(
      @PathVariable UUID id, @Valid @RequestBody RolloverRequest request) {
    return rollovers.update(id, request);
  }

  @PostMapping("/rollovers/{id}/activate")
  @PreAuthorize(MANAGE)
  AccountRolloverResponse activate(@PathVariable UUID id) {
    return rollovers.activate(id);
  }

  /** Aktif sezon silinirken başka sezon varsa {@code newActiveId} zorunludur (409). */
  @DeleteMapping("/rollovers/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @PreAuthorize(MANAGE)
  void delete(@PathVariable UUID id, @RequestParam(required = false) UUID newActiveId) {
    rollovers.delete(id, newActiveId);
  }

  /** Geri getirilen sezon pasif başlar. */
  @PostMapping("/rollovers/{id}/restore")
  @PreAuthorize(MANAGE)
  AccountRolloverResponse restore(@PathVariable UUID id) {
    return rollovers.restore(id);
  }
}
