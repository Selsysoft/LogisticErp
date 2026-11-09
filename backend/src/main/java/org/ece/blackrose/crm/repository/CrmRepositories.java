package org.ece.blackrose.crm.repository;

import jakarta.persistence.LockModeType;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.crm.domain.Contact;
import org.ece.blackrose.crm.domain.Contract;
import org.ece.blackrose.crm.domain.CrmActivity;
import org.ece.blackrose.crm.domain.CrmProfile;
import org.ece.blackrose.crm.domain.CrmTypes.ContractStatus;
import org.ece.blackrose.crm.domain.CrmTypes.OpportunityStage;
import org.ece.blackrose.crm.domain.CrmTypes.QuoteStatus;
import org.ece.blackrose.crm.domain.Opportunity;
import org.ece.blackrose.crm.domain.Quote;
import org.ece.blackrose.crm.domain.QuoteLine;
import org.ece.blackrose.crm.domain.Tariff;
import org.ece.blackrose.crm.domain.TariffLine;
import org.ece.blackrose.crm.domain.TaxRate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public final class CrmRepositories {

  private CrmRepositories() {}

  public interface CrmProfileRepository extends JpaRepository<CrmProfile, UUID> {}

  public interface ContactRepository extends JpaRepository<Contact, UUID> {

    List<Contact> findByAccountIdOrderByFullName(UUID accountId);

    List<Contact> findByAccountIdAndNotifyDeliveriesTrue(UUID accountId);
  }

  public interface FunnelRow {
    String getStage();

    String getCurrency();

    long getCount();

    BigDecimal getTotal();
  }

  public interface OwnerRow {
    String getOwnerEmail();

    long getOpen();

    long getWon();

    long getLost();
  }

  public interface OpportunityRepository extends JpaRepository<Opportunity, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select o from Opportunity o where o.id = :id")
    Optional<Opportunity> findForUpdate(@Param("id") UUID id);

    @Query("select o from Opportunity o where (:stage is null or o.stage = :stage)")
    Page<Opportunity> search(@Param("stage") OpportunityStage stage, Pageable pageable);

    @Query(
        value =
            """
            select stage as "stage", currency as "currency", count(*) as "count",
                   coalesce(sum(amount), 0) as "total"
            from opportunity where deleted = false
            group by stage, currency
            """,
        nativeQuery = true)
    List<FunnelRow> funnel();

    @Query(
        value =
            """
            select owner_email as "ownerEmail",
                   count(*) filter (where stage not in ('WON', 'LOST')) as "open",
                   count(*) filter (where stage = 'WON') as "won",
                   count(*) filter (where stage = 'LOST') as "lost"
            from opportunity where deleted = false
            group by owner_email
            order by owner_email
            """,
        nativeQuery = true)
    List<OwnerRow> byOwner();
  }

  public interface CrmActivityRepository extends JpaRepository<CrmActivity, UUID> {

    Page<CrmActivity> findByAccountId(UUID accountId, Pageable pageable);

    List<CrmActivity> findByOpportunityIdOrderByCreatedAt(UUID opportunityId);

    @Query(
        """
        select a from CrmActivity a
        where a.completedAt is null and a.dueDate is not null and a.dueDate <= :until
        order by a.dueDate
        """)
    List<CrmActivity> upcoming(@Param("until") LocalDate until, Pageable pageable);
  }

  public interface TaxRateRepository extends JpaRepository<TaxRate, UUID> {

    Optional<TaxRate> findByCode(String code);
  }

  public interface TariffRepository extends JpaRepository<Tariff, UUID> {

    Optional<Tariff> findByCode(String code);

    @Query(
        """
        select t from Tariff t
        where t.active = true and t.accountId = :accountId and t.validFrom <= :date
          and (t.validTo is null or t.validTo >= :date)
        order by t.validFrom desc, t.code
        """)
    List<Tariff> validForAccount(@Param("accountId") UUID accountId, @Param("date") LocalDate date);

    @Query(
        """
        select t from Tariff t
        where t.active = true and t.accountId is null and t.validFrom <= :date
          and (t.validTo is null or t.validTo >= :date)
        order by t.validFrom desc, t.code
        """)
    List<Tariff> validGeneral(@Param("date") LocalDate date);
  }

  public interface TariffLineRepository extends JpaRepository<TariffLine, UUID> {

    List<TariffLine> findByTariffId(UUID tariffId);
  }

  public interface QuoteRepository extends JpaRepository<Quote, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select q from Quote q where q.id = :id")
    Optional<Quote> findForUpdate(@Param("id") UUID id);

    @Query(
        "select q from Quote q where (:status is null or q.status = :status)"
            + " and (:accountId is null or q.accountId = :accountId)")
    Page<Quote> search(
        @Param("status") QuoteStatus status, @Param("accountId") UUID accountId, Pageable pageable);

    List<Quote> findByNumberOrderByVersion(String number);

    @Query(value = "select nextval('quote_number_seq')", nativeQuery = true)
    long nextNumber();
  }

  public interface QuoteLineRepository extends JpaRepository<QuoteLine, UUID> {

    List<QuoteLine> findByQuoteIdOrderByCreatedAt(UUID quoteId);
  }

  public interface ContractRepository extends JpaRepository<Contract, UUID> {

    @Query(
        """
        select c from Contract c
        where c.accountId = :accountId and c.status = :status
          and c.startDate <= :end and c.endDate >= :start
        order by c.startDate desc, c.number
        """)
    List<Contract> overlapping(
        @Param("accountId") UUID accountId,
        @Param("status") ContractStatus status,
        @Param("start") LocalDate start,
        @Param("end") LocalDate end);

    @Query("select c from Contract c where (:accountId is null or c.accountId = :accountId)")
    Page<Contract> search(@Param("accountId") UUID accountId, Pageable pageable);

    @Query(value = "select nextval('contract_number_seq')", nativeQuery = true)
    long nextNumber();

    List<Contract> findByStatusAndAccountIdIn(ContractStatus status, Collection<UUID> accountIds);
  }
}
