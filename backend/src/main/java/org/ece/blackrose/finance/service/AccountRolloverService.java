package org.ece.blackrose.finance.service;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.AccountRollover;
import org.ece.blackrose.finance.repository.AccountRepositories.AccountRolloverRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.web.AccountDtos.AccountRolloverResponse;
import org.ece.blackrose.finance.web.AccountDtos.RolloverRequest;
import org.ece.blackrose.identity.domain.AuditEvent;
import org.ece.blackrose.identity.security.AuthenticatedUser;
import org.ece.blackrose.identity.service.AuditService;
import org.ece.blackrose.organization.BranchFilter;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Cari devir / sezon (12.1 §3.10; ZTO AT:6162-6500). Defter kaydı üretmez, para belgesi değildir:
 * şirket/iş yeri yoktur, kart ortaktır. Tüm yazımlar kart kilidi ({@code findForUpdate}) altındadır
 * ve tek aktif sezon yalnız {@link AccountRolloverRepository#setActiveOnly} ile değişir (F6; kısmi
 * tekil indeks ertelenemez). Kimlikle çalışan akışlar satırın carisini okunabilirlik kuralından
 * geçirir; izinsiz kullanıcıya kayıt yokmuş gibi 404 döner.
 */
@Service
public class AccountRolloverService {

  private static final String TARGET = "ACCOUNT:";
  private static final String DATE_INDEX = "account_rollover_date_uq";
  private static final String ACTIVE_INDEX = "account_rollover_active_uq";

  private final AccountRolloverRepository rollovers;
  private final AccountRepository accounts;
  private final AccountAccess access;
  private final AuditService audit;

  public AccountRolloverService(
      AccountRolloverRepository rollovers,
      AccountRepository accounts,
      AccountAccess access,
      AuditService audit) {
    this.rollovers = rollovers;
    this.accounts = accounts;
    this.access = access;
    this.audit = audit;
  }

  /** {@code deleted = false} tarih sırasıyla sezonlar, {@code true} silinenler. */
  @Transactional(readOnly = true)
  public List<AccountRolloverResponse> list(UUID accountId, boolean deleted) {
    access.readable(accountId);
    return rollovers.findAllByAccount(accountId, deleted).stream()
        .map(AccountRolloverService::toResponse)
        .toList();
  }

  /** Yeni sezon aktif olur, önceki aktif sezon pasifleşir. */
  @Transactional
  public AccountRolloverResponse create(UUID accountId, RolloverRequest request) {
    LocalDate date = request.rolloverDate();
    String season = requireFields(date, request.seasonName());
    access.writable(accountId);
    lockAccount(accountId);
    if (rollovers.dateTaken(accountId, date, BranchFilter.NONE)) {
      throw dateTaken();
    }
    AccountRollover created = save(new AccountRollover(accountId, date, season));
    rollovers.setActiveOnly(accountId, created.getId(), actor());
    audit.record(
        AuditEvent.ACCOUNT_ROLLOVER_CREATED,
        TARGET + accountId,
        created.getId() + " " + date + " " + season);
    return toResponse(reload(created.getId()));
  }

  @Transactional
  public AccountRolloverResponse update(UUID id, RolloverRequest request) {
    LocalDate date = request.rolloverDate();
    String season = requireFields(date, request.seasonName());
    AccountRollover rollover = lockLive(id);
    if (rollovers.dateTaken(rollover.getAccountId(), date, id)) {
      throw dateTaken();
    }
    rollover.update(date, season);
    save(rollover);
    audit.record(
        AuditEvent.ACCOUNT_ROLLOVER_UPDATED,
        TARGET + rollover.getAccountId(),
        id + " " + date + " " + season);
    return toResponse(reload(id));
  }

  /** Bu sezon aktif, carinin diğer sezonları pasif. */
  @Transactional
  public AccountRolloverResponse activate(UUID id) {
    AccountRollover rollover = lockLive(id);
    if (!rollover.isActive()) {
      rollovers.setActiveOnly(rollover.getAccountId(), id, actor());
      audit.record(
          AuditEvent.ACCOUNT_ROLLOVER_ACTIVATED, TARGET + rollover.getAccountId(), id.toString());
    }
    return toResponse(reload(id));
  }

  /**
   * Yumuşak silme. Aktif sezon silinirken başka silinmemiş sezon varsa yeni aktif seçilmelidir (409
   * {@code ROLLOVER_NEW_ACTIVE_REQUIRED}); seçilen aynı carinin silinmemiş başka sezonu değilse
   * 422.
   */
  @Transactional
  public void delete(UUID id, UUID newActiveId) {
    AccountRollover rollover = lockLive(id);
    UUID accountId = rollover.getAccountId();
    boolean wasActive = rollover.isActive();
    if (newActiveId != null) {
      boolean valid =
          !newActiveId.equals(id)
              && rollovers
                  .findById(newActiveId)
                  .filter(other -> accountId.equals(other.getAccountId()))
                  .filter(other -> !other.isDeleted())
                  .isPresent();
      if (!valid) {
        throw new BusinessException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            "ROLLOVER_NEW_ACTIVE_INVALID",
            "Seçilen yeni aktif sezon geçersiz.");
      }
    } else if (wasActive && hasOtherLive(accountId, id)) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "ROLLOVER_NEW_ACTIVE_REQUIRED",
          "Aktif sezon siliniyor. Yeni aktif sezon seçmelisiniz.",
          List.of("needNewActive=true"));
    }
    // Önce aktiflik (tek sorgu), sonra silme: silinen satır aktif kalamaz (CHECK).
    if (newActiveId != null) {
      rollovers.setActiveOnly(accountId, newActiveId, actor());
    } else if (wasActive) {
      rollovers.setActiveOnly(accountId, null, actor());
    }
    AccountRollover current = reload(id);
    current.softDelete(actor(), Instant.now());
    save(current);
    audit.record(
        AuditEvent.ACCOUNT_ROLLOVER_DELETED,
        TARGET + accountId,
        id + (newActiveId == null ? "" : " newActive " + newActiveId));
  }

  /** Silinen sezon pasif olarak geri gelir; aynı tarihte silinmemiş sezon varsa 409. */
  @Transactional
  public AccountRolloverResponse restore(UUID id) {
    AccountRollover rollover = lockAny(id);
    if (!rollover.isDeleted()) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "ROLLOVER_NOT_DELETED", "Kayıt silinmiş değil.");
    }
    if (rollovers.dateTaken(rollover.getAccountId(), rollover.getRolloverDate(), id)) {
      throw dateTaken();
    }
    rollover.restore();
    save(rollover);
    audit.record(
        AuditEvent.ACCOUNT_ROLLOVER_RESTORED, TARGET + rollover.getAccountId(), id.toString());
    return toResponse(reload(id));
  }

  // --- yardımcılar

  /** Silinmemiş sezon: kart okunabilir + yazılabilir, kart kilitli. */
  private AccountRollover lockLive(UUID id) {
    AccountRollover rollover = lockAny(id);
    if (rollover.isDeleted()) {
      throw notFound();
    }
    return rollover;
  }

  /**
   * Sezon yüklenir, carisi okunabilir olmalı (personel carisi izinsize 404 {@code
   * ROLLOVER_NOT_FOUND}; varlık sızdırılmaz), kart iş yeri kapsamda olmalı; kart kilidi alınır ve
   * sezon kilit altında yeniden okunur.
   */
  private AccountRollover lockAny(UUID id) {
    AccountRollover found = rollovers.findById(id).orElseThrow(AccountRolloverService::notFound);
    UUID accountId = found.getAccountId();
    try {
      access.readable(accountId);
    } catch (BusinessException ex) {
      throw notFound();
    }
    access.writable(accountId);
    lockAccount(accountId);
    return reload(id);
  }

  private void lockAccount(UUID accountId) {
    Account account = accounts.findForUpdate(accountId).orElseThrow(AccountAccess::notFound);
    access.requireReadable(account);
  }

  private boolean hasOtherLive(UUID accountId, UUID id) {
    return rollovers.findAllByAccount(accountId, false).stream()
        .anyMatch(other -> !other.getId().equals(id));
  }

  private AccountRollover reload(UUID id) {
    return rollovers.findById(id).orElseThrow(AccountRolloverService::notFound);
  }

  /** Tekillik yarışı (iki eşzamanlı aynı tarih/aktif) kısıt ihlaliyle yakalanır. */
  private AccountRollover save(AccountRollover rollover) {
    try {
      return rollovers.saveAndFlush(rollover);
    } catch (DataIntegrityViolationException ex) {
      String message = String.valueOf(ex.getMostSpecificCause().getMessage());
      if (message.contains(DATE_INDEX) || message.contains(ACTIVE_INDEX)) {
        throw dateTaken();
      }
      throw ex;
    }
  }

  private static String requireFields(LocalDate date, String seasonName) {
    if (date == null || seasonName == null || seasonName.isBlank()) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "ROLLOVER_FIELDS_REQUIRED",
          "Devir tarihi ve sezon adı zorunludur.");
    }
    return seasonName.trim();
  }

  private static String actor() {
    return AuthenticatedUser.current().map(AuthenticatedUser::email).orElse("system");
  }

  private static BusinessException dateTaken() {
    return new BusinessException(
        HttpStatus.CONFLICT,
        "ROLLOVER_DATE_TAKEN",
        "Bu tarihte bu cari için zaten bir devir mevcut.");
  }

  private static BusinessException notFound() {
    return new BusinessException(
        HttpStatus.NOT_FOUND, "ROLLOVER_NOT_FOUND", "Kayıt bulunamadı veya zaten silinmiş.");
  }

  static AccountRolloverResponse toResponse(AccountRollover rollover) {
    return new AccountRolloverResponse(
        rollover.getId(),
        rollover.getAccountId(),
        rollover.getRolloverDate(),
        rollover.getSeasonName(),
        rollover.isActive(),
        rollover.getCreatedBy(),
        rollover.getCreatedAt(),
        rollover.getUpdatedBy(),
        rollover.getUpdatedAt(),
        rollover.getUpdateCount(),
        rollover.getDeletedBy(),
        rollover.getDeletedAt());
  }
}
