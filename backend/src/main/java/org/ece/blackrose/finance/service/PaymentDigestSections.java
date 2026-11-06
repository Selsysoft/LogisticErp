package org.ece.blackrose.finance.service;

import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;
import org.ece.blackrose.finance.domain.Account;
import org.ece.blackrose.finance.domain.FinanceTypes.PlanStatus;
import org.ece.blackrose.finance.domain.PaymentPlan;
import org.ece.blackrose.finance.repository.FinanceRepositories.AccountRepository;
import org.ece.blackrose.finance.repository.FinanceRepositories.PaymentPlanRepository;
import org.ece.blackrose.notification.DigestLines;
import org.ece.blackrose.notification.DigestSection;
import org.ece.blackrose.notification.NotificationTopic;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Ödeme planı bölümleri: onay bekleyenler ve vadesi gelen onaylılar. */
public final class PaymentDigestSections {

  /** Vadesine bu kadar gün kalan onaylı ödemeler hatırlatılır. */
  static final int DUE_WINDOW_DAYS = 3;

  private PaymentDigestSections() {}

  @Component
  public static class Approval implements DigestSection {

    private final PaymentPlanRepository plans;
    private final AccountRepository accounts;

    public Approval(PaymentPlanRepository plans, AccountRepository accounts) {
      this.plans = plans;
      this.accounts = accounts;
    }

    @Override
    public NotificationTopic topic() {
      return NotificationTopic.PAYMENT_APPROVAL;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Content> build(LocalDate today) {
      Page<PaymentPlan> pending =
          plans.search(
              PlanStatus.PENDING,
              PageRequest.of(0, DigestLines.MAX_LINES, Sort.by("dueDate", "id")));
      if (pending.isEmpty()) {
        return Optional.empty();
      }
      List<String> lines = lines(pending.getContent(), accounts, today);
      return Optional.of(
          new Content(
              "Onay bekleyen ödeme planı: %d".formatted(pending.getTotalElements()),
              DigestLines.limited(lines, pending.getTotalElements()),
              "/finance/plans"));
    }
  }

  @Component
  public static class Due implements DigestSection {

    private final PaymentPlanRepository plans;
    private final AccountRepository accounts;

    public Due(PaymentPlanRepository plans, AccountRepository accounts) {
      this.plans = plans;
      this.accounts = accounts;
    }

    @Override
    public NotificationTopic topic() {
      return NotificationTopic.PAYMENT_DUE;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Content> build(LocalDate today) {
      List<PaymentPlan> due =
          plans
              .findByStatusInAndDueDateBefore(
                  List.of(PlanStatus.APPROVED), today.plusDays(DUE_WINDOW_DAYS + 1L))
              .stream()
              .sorted(Comparator.comparing(PaymentPlan::getDueDate))
              .toList();
      if (due.isEmpty()) {
        return Optional.empty();
      }
      long overdue = due.stream().filter(plan -> plan.getDueDate().isBefore(today)).count();
      String title =
          overdue > 0
              ? "Vadesi gelen ödeme: %d, %d tanesi gecikmiş".formatted(due.size(), overdue)
              : "Vadesi gelen ödeme: %d".formatted(due.size());
      List<PaymentPlan> shown = due.subList(0, Math.min(due.size(), DigestLines.MAX_LINES));
      return Optional.of(
          new Content(
              title,
              DigestLines.limited(lines(shown, accounts, today), due.size()),
              "/finance/plans"));
    }
  }

  private static List<String> lines(
      List<PaymentPlan> plans, AccountRepository accounts, LocalDate today) {
    Map<UUID, String> names =
        accounts
            .findAllById(plans.stream().map(PaymentPlan::getAccountId).distinct().toList())
            .stream()
            .collect(Collectors.toMap(Account::getId, Account::getName, (a, b) -> a));
    return plans.stream()
        .map(
            plan ->
                names.getOrDefault(plan.getAccountId(), "Cari")
                    + " — "
                    + DigestLines.money(plan.getMoney().amount(), plan.getMoney().currency())
                    + ", vade "
                    + DigestLines.date(plan.getDueDate())
                    + (plan.getDueDate().isBefore(today) ? " (GECİKMİŞ)" : ""))
        .toList();
  }
}
