package org.ece.blackrose.crm.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.crm.domain.CrmActivity;
import org.ece.blackrose.crm.domain.CrmTypes.ActivityType;
import org.ece.blackrose.crm.domain.CrmTypes.OpportunityStage;
import org.ece.blackrose.crm.domain.Opportunity;
import org.ece.blackrose.crm.repository.CrmRepositories.CrmActivityRepository;
import org.ece.blackrose.crm.repository.CrmRepositories.OpportunityRepository;
import org.ece.blackrose.crm.repository.CrmRepositories.OwnerRow;
import org.ece.blackrose.crm.web.CrmDtos.CrmDashboardResponse;
import org.ece.blackrose.crm.web.CrmDtos.FunnelEntry;
import org.ece.blackrose.crm.web.CrmDtos.OwnerPerformance;
import org.ece.blackrose.crm.web.CrmDtos.SaveActivityRequest;
import org.ece.blackrose.crm.web.CrmDtos.SaveOpportunityRequest;
import org.ece.blackrose.crm.web.CrmMapper;
import org.ece.blackrose.identity.security.AuthenticatedUser;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Her aşama geçişi fırsat geçmişine yazılır. */
@Service
public class OpportunityService {

  private static final Map<OpportunityStage, Set<OpportunityStage>> TRANSITIONS =
      Map.of(
          OpportunityStage.LEAD, Set.of(OpportunityStage.QUALIFIED, OpportunityStage.LOST),
          OpportunityStage.QUALIFIED, Set.of(OpportunityStage.QUOTE, OpportunityStage.LOST),
          OpportunityStage.QUOTE,
              Set.of(OpportunityStage.WON, OpportunityStage.LOST, OpportunityStage.QUALIFIED));
  private static final int UPCOMING_DAYS = 7;
  private static final int UPCOMING_LIMIT = 20;

  private final OpportunityRepository opportunities;
  private final CrmActivityRepository activities;
  private final CustomerService customers;
  private final CrmMapper mapper;

  public OpportunityService(
      OpportunityRepository opportunities,
      CrmActivityRepository activities,
      CustomerService customers,
      CrmMapper mapper) {
    this.opportunities = opportunities;
    this.activities = activities;
    this.customers = customers;
    this.mapper = mapper;
  }

  @Transactional(readOnly = true)
  public Page<Opportunity> list(OpportunityStage stage, Pageable pageable) {
    return opportunities.search(stage, pageable);
  }

  @Transactional
  public Opportunity create(SaveOpportunityRequest request) {
    customers.find(request.accountId());
    Opportunity opportunity =
        opportunities.save(
            new Opportunity(
                request.accountId(),
                request.title(),
                request.money(),
                AuthenticatedUser.require().email(),
                request.expectedCloseDate()));
    logStage(opportunity, null, OpportunityStage.LEAD, null);
    return opportunity;
  }

  @Transactional
  public Opportunity update(UUID id, SaveOpportunityRequest request) {
    Opportunity opportunity = lock(id);
    opportunity.update(request.title(), request.money(), request.expectedCloseDate());
    return opportunity;
  }

  @Transactional
  public Opportunity move(UUID id, OpportunityStage target, String note) {
    Opportunity opportunity = lock(id);
    OpportunityStage from = opportunity.getStage();
    if (!TRANSITIONS.getOrDefault(from, Set.of()).contains(target)) {
      throw new BusinessException(
          HttpStatus.CONFLICT,
          "OPPORTUNITY_INVALID_STAGE",
          "Fırsat " + from + " aşamasından " + target + " aşamasına geçemez.");
    }
    opportunity.moveTo(target, target == OpportunityStage.LOST ? note : null);
    logStage(opportunity, from, target, note);
    return opportunity;
  }

  /** Teklif gönderilince fırsatı, ara aşamalardan geçirerek teklif aşamasına getirir. */
  @Transactional
  public void advanceToQuote(UUID id) {
    Opportunity opportunity = lock(id);
    if (opportunity.getStage() == OpportunityStage.LEAD) {
      move(id, OpportunityStage.QUALIFIED, null);
    }
    if (opportunity.getStage() == OpportunityStage.QUALIFIED) {
      move(id, OpportunityStage.QUOTE, null);
    }
    if (opportunity.getStage() != OpportunityStage.QUOTE) {
      throw new BusinessException(
          HttpStatus.CONFLICT, "OPPORTUNITY_CLOSED", "Kapanmış fırsata teklif gönderilemez.");
    }
  }

  @Transactional(readOnly = true)
  public List<CrmActivity> history(UUID opportunityId) {
    return activities.findByOpportunityIdOrderByCreatedAt(opportunityId);
  }

  @Transactional
  public CrmActivity addActivity(SaveActivityRequest request) {
    customers.find(request.accountId());
    if (request.type() == ActivityType.STAGE_CHANGE) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "ACTIVITY_TYPE_INVALID", "Bu aktivite türü elle eklenemez.");
    }
    return activities.save(
        new CrmActivity(
            request.accountId(),
            request.opportunityId(),
            request.type(),
            request.subject(),
            request.dueDate()));
  }

  @Transactional
  public CrmActivity completeActivity(UUID id) {
    CrmActivity activity =
        activities
            .findById(id)
            .orElseThrow(
                () ->
                    new BusinessException(
                        HttpStatus.NOT_FOUND, "ACTIVITY_NOT_FOUND", "Aktivite bulunamadı."));
    activity.complete();
    return activity;
  }

  @Transactional(readOnly = true)
  public Page<CrmActivity> activitiesOf(UUID accountId, Pageable pageable) {
    return activities.findByAccountId(accountId, pageable);
  }

  @Transactional(readOnly = true)
  public CrmDashboardResponse dashboard(LocalDate today) {
    List<FunnelEntry> funnel =
        opportunities.funnel().stream()
            .map(
                row ->
                    new FunnelEntry(
                        OpportunityStage.valueOf(row.getStage()),
                        row.getCurrency(),
                        row.getCount(),
                        row.getTotal()))
            .toList();
    long won = 0;
    long lost = 0;
    for (FunnelEntry entry : funnel) {
      won += entry.stage() == OpportunityStage.WON ? entry.count() : 0;
      lost += entry.stage() == OpportunityStage.LOST ? entry.count() : 0;
    }
    BigDecimal winRate =
        won + lost == 0
            ? BigDecimal.ZERO
            : BigDecimal.valueOf(won * 100)
                .divide(BigDecimal.valueOf(won + lost), 2, RoundingMode.HALF_UP);
    List<OwnerRow> owners = opportunities.byOwner();
    return new CrmDashboardResponse(
        funnel,
        winRate,
        owners.stream()
            .map(
                row ->
                    new OwnerPerformance(
                        row.getOwnerEmail(), row.getOpen(), row.getWon(), row.getLost()))
            .toList(),
        activities
            .upcoming(today.plusDays(UPCOMING_DAYS), PageRequest.of(0, UPCOMING_LIMIT))
            .stream()
            .map(mapper::toResponse)
            .toList());
  }

  private void logStage(
      Opportunity opportunity, OpportunityStage from, OpportunityStage to, String note) {
    String subject = (from == null ? "" : from + " → ") + to + (note == null ? "" : " · " + note);
    activities.save(
        new CrmActivity(
            opportunity.getAccountId(),
            opportunity.getId(),
            ActivityType.STAGE_CHANGE,
            subject,
            null));
  }

  private Opportunity lock(UUID id) {
    return opportunities
        .findForUpdate(id)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "OPPORTUNITY_NOT_FOUND", "Fırsat bulunamadı."));
  }
}
