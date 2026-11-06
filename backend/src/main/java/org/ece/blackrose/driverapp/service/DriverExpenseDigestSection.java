package org.ece.blackrose.driverapp.service;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.ece.blackrose.driverapp.domain.DriverExpense;
import org.ece.blackrose.driverapp.repository.DriverAppRepositories.DriverExpenseRepository;
import org.ece.blackrose.fleet.domain.Driver;
import org.ece.blackrose.fleet.repository.FleetRepositories.DriverRepository;
import org.ece.blackrose.notification.DigestLines;
import org.ece.blackrose.notification.DigestSection;
import org.ece.blackrose.notification.NotificationTopic;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Ofis onayı bekleyen sürücü masrafları. */
@Component
public class DriverExpenseDigestSection implements DigestSection {

  private final DriverExpenseRepository expenses;
  private final DriverRepository drivers;

  public DriverExpenseDigestSection(DriverExpenseRepository expenses, DriverRepository drivers) {
    this.expenses = expenses;
    this.drivers = drivers;
  }

  @Override
  public NotificationTopic topic() {
    return NotificationTopic.DRIVER_EXPENSE_APPROVAL;
  }

  @Override
  @Transactional(readOnly = true)
  public Optional<Content> build(LocalDate today) {
    Page<DriverExpense> pending =
        expenses.findByStatusOrderByCreatedAtDesc(
            DriverExpense.Status.PENDING, PageRequest.of(0, DigestLines.MAX_LINES));
    if (pending.isEmpty()) {
      return Optional.empty();
    }
    Map<UUID, String> names =
        drivers
            .findAllById(pending.stream().map(DriverExpense::getDriverId).distinct().toList())
            .stream()
            .collect(Collectors.toMap(Driver::getId, Driver::getFullName, (a, b) -> a));
    List<String> lines =
        pending.stream()
            .map(
                expense ->
                    names.getOrDefault(expense.getDriverId(), "Sürücü")
                        + " — "
                        + DigestLines.money(expense.getAmount(), expense.getCurrency())
                        + ", "
                        + DigestLines.date(expense.getExpenseDate()))
            .toList();
    return Optional.of(
        new Content(
            "Onay bekleyen sürücü masrafı: %d".formatted(pending.getTotalElements()),
            DigestLines.limited(lines, pending.getTotalElements()),
            "/operations/driver-expenses"));
  }
}
