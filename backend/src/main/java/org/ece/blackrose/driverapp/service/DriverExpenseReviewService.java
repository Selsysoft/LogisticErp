package org.ece.blackrose.driverapp.service;

import java.util.Locale;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.driverapp.domain.DriverExpense;
import org.ece.blackrose.driverapp.repository.DriverAppRepositories.DriverExpenseRepository;
import org.ece.blackrose.fleet.domain.Driver;
import org.ece.blackrose.fleet.repository.FleetRepositories.DriverRepository;
import org.ece.blackrose.identity.domain.Permission;
import org.ece.blackrose.identity.domain.UserAccount;
import org.ece.blackrose.identity.repository.IdentityRepositories.UserAccountRepository;
import org.ece.blackrose.identity.security.AuthenticatedUser;
import org.ece.blackrose.shipment.service.TripFinanceService;
import org.ece.blackrose.shipment.web.ShipmentDtos.SaveCostRequest;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Ofisin sürücü masrafı onayı ve sürücü kaydının kullanıcı hesabına bağlanması. */
@Service
public class DriverExpenseReviewService {

  private final DriverExpenseRepository expenses;
  private final DriverRepository drivers;
  private final UserAccountRepository users;
  private final TripFinanceService tripFinance;
  private final ApplicationEventPublisher publisher;

  public DriverExpenseReviewService(
      DriverExpenseRepository expenses,
      DriverRepository drivers,
      UserAccountRepository users,
      TripFinanceService tripFinance,
      ApplicationEventPublisher publisher) {
    this.publisher = publisher;
    this.expenses = expenses;
    this.drivers = drivers;
    this.users = users;
    this.tripFinance = tripFinance;
  }

  @Transactional(readOnly = true)
  public Page<DriverExpense> list(DriverExpense.Status status, Pageable pageable) {
    return expenses.findByStatusOrderByCreatedAtDesc(status, pageable);
  }

  /** Masraf sefer gideri olur; sürücü carisine alacak olarak sefer kapanışında yazılır. */
  @Transactional
  public DriverExpense approve(UUID id) {
    DriverExpense expense = pending(id);
    Driver driver = drivers.findById(expense.getDriverId()).orElseThrow();
    var cost =
        tripFinance.addCost(
            expense.getShipmentId(),
            new SaveCostRequest(
                expense.getKind(),
                null,
                driver.getAccountId(),
                null,
                new Money(expense.getAmount(), expense.getCurrency()),
                null,
                expense.getExpenseDate(),
                expense.getDescription() == null
                    ? "Sürücü masrafı: " + driver.getFullName()
                    : expense.getDescription()));
    expense.approve(cost.getId());
    publish(expense);
    return expense;
  }

  @Transactional
  public DriverExpense reject(UUID id, String note) {
    DriverExpense expense = pending(id);
    expense.reject(note.trim());
    publish(expense);
    return expense;
  }

  private void publish(DriverExpense expense) {
    publisher.publishEvent(
        new DriverExpenseEvent(
            expense, AuthenticatedUser.current().map(AuthenticatedUser::email).orElse(null)));
  }

  @Transactional(readOnly = true)
  public String linkedEmail(UUID driverId) {
    Driver driver = driver(driverId);
    return driver.getUserId() == null
        ? null
        : users.findById(driver.getUserId()).map(UserAccount::getEmail).orElse(null);
  }

  /** Boş e-posta bağlantıyı kaldırır. Hesabın sürücü izni olmalıdır. */
  @Transactional
  public String link(UUID driverId, String rawEmail) {
    Driver driver = driver(driverId);
    if (rawEmail == null || rawEmail.isBlank()) {
      driver.linkUser(null);
      return null;
    }
    String email = rawEmail.trim().toLowerCase(Locale.ROOT);
    UserAccount user =
        users
            .findByEmail(email)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "Bu e-postada kullanıcı yok."));
    if (!user.getEffectivePermissions().contains(Permission.DRIVER_APP)) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "USER_NOT_DRIVER", "Kullanıcının sürücü uygulaması izni yok.");
    }
    drivers
        .findByUserId(user.getId())
        .filter(other -> !other.getId().equals(driverId))
        .ifPresent(
            other -> {
              throw new BusinessException(
                  HttpStatus.CONFLICT,
                  "USER_ALREADY_LINKED",
                  "Bu kullanıcı başka bir sürücüye bağlı: " + other.getCode());
            });
    driver.linkUser(user.getId());
    return email;
  }

  private Driver driver(UUID id) {
    return drivers
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "DRIVER_NOT_FOUND", "Sürücü bulunamadı."));
  }

  private DriverExpense pending(UUID id) {
    DriverExpense expense =
        expenses
            .findById(id)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "EXPENSE_NOT_FOUND", "Masraf bulunamadı."));
    if (expense.getStatus() != DriverExpense.Status.PENDING) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "EXPENSE_ALREADY_REVIEWED", "Bu masraf zaten sonuçlandırıldı.");
    }
    return expense;
  }
}
