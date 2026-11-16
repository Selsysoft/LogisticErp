package org.ece.blackrose.finance.repository;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Parameter;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.organization.BranchFilter;
import org.springframework.stereotype.Repository;

/**
 * Faz 12.8 finans raporu sorguları (12.8_TASARIM §3.4): native SQL + {@link EntityManager} (dinamik
 * {@code IN} listeleri ve çok sonuç kümesi; Spring Data arayüzü değil). Süzgeç deseni FR ile
 * aynıdır: konsolidede şirket yerine nöbetçi ({@link BranchFilter#NONE}) ve ayrı bayrak; NULL
 * parametre bağlanmaz. Kur farkı sorguları (§3.4.9) B2, rapor sorguları B3'tür.
 */
@Repository
public class FinanceReportRepositories {

  /** Sınırsız tarih süzgeci için nöbetçiler (NULL tarih bağlanmaz). */
  private static final LocalDate MIN_DATE = LocalDate.of(1900, 1, 1);

  private static final LocalDate MAX_DATE = LocalDate.of(9999, 12, 31);

  /** Boş liste {@code IN ()} olmasın diye metin nöbetçisi. */
  private static final List<String> NO_TEXT = List.of("");

  /** Kur farkı kaynağı olabilecek borç/alacak kaynakları (12.8 §3.2.1 kural 2; OK-12.8-2). */
  public static final List<String> FX_SOURCE_TYPES =
      List.of(
          "ACCOUNT_DOCUMENT",
          "PURCHASE_INVOICE",
          "FREIGHT_INVOICE",
          "WAREHOUSE_INVOICE",
          "OPENING_INVOICE",
          "OPENING",
          "EXPENSE",
          "TRIP_COST",
          "MANUAL");

  /**
   * FIFO eşleştirmesinin dışladığı hareketler ({@code t} takma adı; tarih parametresi {@code
   * :<date>}): (1) tarihte yürürlükteki taşımanın orijinali, (2) taşıma çıkışı ve tarihe kadar geri
   * alınmış taşımanın girişi (ve ters kayıtları) — 12.1 F9 kuralı (eski FR {@code agingRows}); (3)
   * ters kayıt satırları ve ters kaydı tarihe kadar yazılmış orijinaller (Rev 2: çift aynı tutarda
   * ve ters yönde, net değişmez; iptal edilmiş tahsilat en eski kalemi kapatmış sayılmaz).
   */
  static String fifoExclusions(String dateParam) {
    return """
         and not exists (select 1 from account_transfer_line l
                         join account_transfer tr on tr.id = l.account_transfer_id
                         where l.account_transaction_id = t.id and l.deleted = false
                           and tr.deleted = false
                           and tr.transfer_date <= cast(:D as date)
                           and (tr.reverse_date is null
                                or tr.reverse_date > cast(:D as date)))
         and not exists (
           select 1 from account_transaction x
           left join account_transfer_line xl on xl.id = x.source_id
           left join account_transfer xtr on xtr.id = xl.account_transfer_id
           where x.id = (case when t.source_type = 'REVERSAL' then t.source_id else t.id end)
             and (x.source_type = 'ACCOUNT_TRANSFER_OUT'
                  or (x.source_type = 'ACCOUNT_TRANSFER_IN'
                      and xtr.reverse_date is not null
                      and xtr.reverse_date <= cast(:D as date))))
         and t.source_type <> 'REVERSAL'
         and not exists (select 1 from account_transaction r
                         where r.source_type = 'REVERSAL' and r.source_id = t.id
                           and r.deleted = false
                           and r.transaction_date <= cast(:D as date))
        """
        .replace(":D", ":" + dateParam);
  }

  /** Şirket ve iş yeri süzgeci ({@code t} = cari hareketi). */
  private static final String SCOPE_T =
      """
       and (:allCompanies = true or t.company_id = :companyId)
       and (:allBranches = true or t.branch_id in (:branchIds))
      """;

  private static final String EMPLOYEE_AND_GROUP =
      """
       and (:employeeVisible = true or a.type <> 'EMPLOYEE')
       and (:excludeIntercompany = false or a.represents_company_id is null)
      """;

  /**
   * Paylaşılan açık kalem CTE'si (§3.4.1): cari × şirket × para birimi partisyonunda karşı yöndeki
   * hareketler en eski kalemleri kapatır; {@code open_items.remaining} kalan tutardır. Vade taban
   * kaynağın vadesinden ({@code explicit_due}; masraf birleşiminde silinme koşulu yok).
   */
  static final String OPEN_ITEMS =
      """
      with moves as (
        select t.id, t.account_id, t.company_id, t.branch_id, t.currency, t.transaction_date,
               t.direction, t.amount, t.exchange_rate,
               coalesce(od.due_date, opi.due_date, ofi.due_date, owi.due_date, ooi.due_date,
                        oex.due_date) as explicit_due,
               sum(case when t.direction = 'DEBIT' then t.amount else 0 end) over w_run as debit_run,
               sum(case when t.direction = 'CREDIT' then t.amount else 0 end) over w_run as credit_run,
               sum(case when t.direction = 'DEBIT' then t.amount else 0 end) over w_all as debit_total,
               sum(case when t.direction = 'CREDIT' then t.amount else 0 end) over w_all as credit_total
        from account_transaction t
        join account a on a.id = t.account_id
      """
          + FinanceRepositories.KIND_JOINS
          + " left join account_document od on"
          + FinanceRepositories.BASE_TYPE
          + "= 'ACCOUNT_DOCUMENT' and od.id ="
          + FinanceRepositories.BASE_ID
          + " left join purchase_invoice opi on"
          + FinanceRepositories.BASE_TYPE
          + "= 'PURCHASE_INVOICE' and opi.id ="
          + FinanceRepositories.BASE_ID
          + " left join freight_invoice ofi on"
          + FinanceRepositories.BASE_TYPE
          + "= 'FREIGHT_INVOICE' and ofi.id ="
          + FinanceRepositories.BASE_ID
          + " left join warehouse_invoice owi on"
          + FinanceRepositories.BASE_TYPE
          + "= 'WAREHOUSE_INVOICE' and owi.id ="
          + FinanceRepositories.BASE_ID
          + " left join opening_invoice ooi on"
          + FinanceRepositories.BASE_TYPE
          + "= 'OPENING_INVOICE' and ooi.id ="
          + FinanceRepositories.BASE_ID
          + " left join expense oex on"
          + FinanceRepositories.BASE_TYPE
          + "= 'EXPENSE' and oex.id ="
          + FinanceRepositories.BASE_ID
          + """
           where t.transaction_date <= :asOf and t.deleted = false and a.deleted = false
             and a.type in (:types)
          """
          + EMPLOYEE_AND_GROUP
          + SCOPE_T
          + fifoExclusions("asOf")
          + """
            window w_run as (partition by t.account_id, t.company_id, t.currency
                             order by t.transaction_date, t.created_at, t.id),
                   w_all as (partition by t.account_id, t.company_id, t.currency)
          ),
          open_items as (
            select id, account_id, company_id, branch_id, currency, transaction_date, direction,
                   exchange_rate, explicit_due, amount,
                   case when direction = 'DEBIT' then least(amount, debit_run - credit_total)
                        else least(amount, credit_run - debit_total) end as remaining
            from moves
            where (direction = 'DEBIT' and debit_run > credit_total)
               or (direction = 'CREDIT' and credit_run > debit_total)
          )
          """;

  /** Kaynağın belge birleşimleri (belge no; §3.4.9). */
  private static final String FX_JOINS =
      """
       left join account_document d on t.source_type = 'ACCOUNT_DOCUMENT' and d.id = t.source_id
       left join account_document_type dt on dt.side = d.side and dt.code = d.document_type
       left join purchase_invoice pi on t.source_type = 'PURCHASE_INVOICE' and pi.id = t.source_id
       left join freight_invoice fi on t.source_type = 'FREIGHT_INVOICE' and fi.id = t.source_id
       left join warehouse_invoice wi on t.source_type = 'WAREHOUSE_INVOICE' and wi.id = t.source_id
       left join opening_invoice oi on t.source_type = 'OPENING_INVOICE' and oi.id = t.source_id
       left join expense ex on t.source_type = 'EXPENSE' and ex.id = t.source_id
      """;

  private static final String FX_DOCUMENT_NO =
      " coalesce(d.document_no, pi.number, fi.number, wi.number, oi.number, ex.invoice_number) ";

  /** Kaynağın açık (iptal edilmemiş) kur farkı belgesi. */
  private static final String FX_CUT_JOIN =
      """
       left join account_document fx on fx.fx_source_transaction_id = t.id
             and fx.status = 'OPEN' and fx.deleted = false
      """;

  /**
   * Uygun kaynak hareket (§3.2.1 kural 1–5): dövizli, borç/alacak kaynağı, ters çevrilmemiş, etkin
   * taşımada değil; cari silinmemiş, grup şirketi değil; personel yalnız izinle.
   */
  private static final String FX_ELIGIBLE =
      """
       t.deleted = false and t.currency <> 'TRY'
       and t.source_type in (:sourceTypes)
       and not exists (select 1 from account_transaction r where r.source_type = 'REVERSAL'
                         and r.source_id = t.id and r.deleted = false)
       and not exists (select 1 from account_transfer_line l where l.account_transaction_id = t.id
                         and l.active and l.deleted = false)
       and a.deleted = false and a.type <> 'INTERCOMPANY'
       and (:employeeVisible = true or a.type <> 'EMPLOYEE')
      """;

  private static final String FX_FILTERS =
      """
       and (:allCompanies = true or t.company_id = :companyId)
       and (:allBranches = true or t.branch_id in (:branchIds))
       and (:allAccounts = true or t.account_id = :accountId)
       and (:currency = '' or t.currency = :currency)
       and (:hasFrom = false or t.transaction_date >= :from)
       and (:hasTo = false or t.transaction_date <= :to)
       and (:cutState = 'ALL' or (:cutState = 'OPEN' and fx.id is null)
            or (:cutState = 'CUT' and fx.id is not null))
      """;

  /**
   * FIFO kapanışı (Rev 1 F4; §3.2.1a): istenen kaynakların cari × şirket × para birimi
   * partisyonları <b>şirket geneli</b> (kullanıcı kapsamı yok; OK-12.8-26), {@code :v} tarihine
   * kadar. Dışlamalar {@link #fifoExclusions} (taşıma 12.1 F9 kuralı; Rev 2 ters kayıt çiftleri
   * FIFO'ya girmez). Kapanış tarihi kaynağın kendi tarihinden önce olamaz (Rev 2: önceki avansla
   * kapanan kaynak kendi gününde kapanır). Değerleme tarihinden sonraki kaynak satır dönmez.
   */
  private static final String FX_SETTLEMENT =
      """
      with src as (select id, account_id, company_id, currency from account_transaction
                    where id in (:txIds)),
      moves as (
        select t.id, t.account_id, t.company_id, t.currency, t.transaction_date, t.direction,
               t.amount,
               sum(case when t.direction = 'DEBIT' then t.amount else 0 end) over w as debit_run,
               sum(case when t.direction = 'CREDIT' then t.amount else 0 end) over w as credit_run,
               sum(case when t.direction = 'DEBIT' then t.amount else 0 end) over p as debit_total,
               sum(case when t.direction = 'CREDIT' then t.amount else 0 end) over p as credit_total
        from account_transaction t
        join (select distinct account_id, company_id, currency from src) k
          on k.account_id = t.account_id and k.company_id = t.company_id
         and k.currency = t.currency
        where t.deleted = false and t.transaction_date <= :v
      """
          + fifoExclusions("v")
          + """
            window w as (partition by t.account_id, t.company_id, t.currency
                         order by t.transaction_date, t.created_at, t.id),
                   p as (partition by t.account_id, t.company_id, t.currency)
          )
          select m.id,
                 case when m.direction = 'DEBIT'
                      then greatest(least(m.amount, m.debit_run - m.credit_total), 0)
                      else greatest(least(m.amount, m.credit_run - m.debit_total), 0) end
                   as open_remaining,
                 (select greatest(min(c.transaction_date), m.transaction_date) from moves c
                   where c.account_id = m.account_id and c.company_id = m.company_id
                     and c.currency = m.currency and c.direction <> m.direction
                     and (case when m.direction = 'DEBIT' then c.credit_run >= m.debit_run
                               else c.debit_run >= m.credit_run end)) as closed_on_candidate
          from moves m where m.id in (:txIds)
          """;

  /** Rapor sorgularının kapsamı: süzgeç, personel görünürlüğü, konsolidede grup şirketi elemesi. */
  public record ReportScope(
      BranchFilter filter, boolean employeeVisible, boolean excludeIntercompany) {}

  /** Kur farkı adayı süzgeci (§3.2.2); boş alanlar "tümü". */
  public record FxCandidateQuery(
      BranchFilter filter,
      boolean employeeVisible,
      UUID accountId,
      String currency,
      LocalDate from,
      LocalDate to,
      String cutState) {}

  /** Kur farkı adayı satırı (§3.4.9). {@code cut*} alanları açık kur farkı belgesinden. */
  public record FxCandidateRow(
      UUID id,
      UUID accountId,
      String accountCode,
      String accountName,
      String accountType,
      boolean accountActive,
      UUID companyId,
      UUID branchId,
      String direction,
      LocalDate transactionDate,
      String sourceType,
      String documentNo,
      String documentTypeName,
      BigDecimal amount,
      String currency,
      BigDecimal exchangeRate,
      BigDecimal tlAmount,
      UUID cutId,
      String cutNo,
      String cutSide,
      BigDecimal cutAmount,
      LocalDate cutDate) {}

  /**
   * Değerleme tarihinde kaynağın FIFO açık kalanı (kaynak para biriminde) ve tamamen kapandıysa
   * kapanış tarihi (açıksa {@code null}).
   */
  public record FxSettlement(BigDecimal openRemaining, LocalDate closedOn) {}

  // --- rapor satırları (B3)

  /** Yaşlandırma v2 süzgeci (§3.4.2). */
  public record AgingQuery(
      ReportScope scope,
      LocalDate asOf,
      String openDirection,
      Collection<String> types,
      String basis,
      UUID accountId,
      List<String> subGroups) {}

  public record AgingItem(
      UUID accountId,
      String accountCode,
      String accountName,
      String subGroup,
      String subGroupName,
      String phone,
      String currency,
      BigDecimal notDue,
      BigDecimal days0To30,
      BigDecimal days31To60,
      BigDecimal days61To90,
      BigDecimal daysOver90,
      BigDecimal tlTotal) {}

  public record LedgerSummaryItem(
      String reportType,
      String currency,
      BigDecimal weOwe,
      BigDecimal theyOwe,
      BigDecimal net,
      long openAccounts) {}

  /** FinanceReport liste süzgeci (§3.4.4); {@code from} null = Tümü. */
  public record LedgerListQuery(
      ReportScope scope,
      String reportType,
      LocalDate from,
      LocalDate to,
      String currency,
      UUID accountId) {}

  public record LedgerAccountItem(
      UUID accountId,
      String accountCode,
      String accountName,
      String accountType,
      String subGroup,
      String subGroupName,
      boolean active,
      UUID companyId,
      String companyName,
      String currency,
      BigDecimal opening,
      BigDecimal debt,
      BigDecimal payment,
      BigDecimal receivable,
      BigDecimal penalty,
      BigDecimal collection,
      BigDecimal closing,
      LocalDate lastMovement) {}

  public record LastSettlementItem(
      UUID accountId, UUID companyId, String currency, LocalDate date, BigDecimal amount) {}

  public record MethodTotalItem(String type, String method, String currency, BigDecimal amount) {}

  public record KindTotalItem(
      UUID branchId,
      String currency,
      BigDecimal debt,
      BigDecimal payment,
      BigDecimal receivable,
      BigDecimal collection) {}

  public record FxAdjustmentItem(
      UUID accountId, UUID companyId, UUID branchId, BigDecimal adjustment) {}

  public record AccountNetItem(
      UUID accountId,
      String accountCode,
      String accountName,
      String accountType,
      String subGroupName,
      UUID companyId,
      UUID branchId,
      String currency,
      BigDecimal balance) {}

  public record IntercompanyItem(
      UUID accountId,
      String accountName,
      UUID representsCompanyId,
      UUID companyId,
      String currency,
      BigDecimal balance) {}

  public record FundBalanceItem(
      UUID fundAccountId, UUID branchId, String kind, String currency, BigDecimal balance) {}

  public record InstrumentTotalItem(
      UUID branchId,
      String currency,
      String kind,
      String direction,
      long count,
      BigDecimal amount) {}

  public record BranchItem(
      UUID branchId,
      String branchName,
      String branchGroupName,
      UUID companyId,
      String companyName,
      boolean active) {}

  public record TreasuryFundItem(
      UUID fundAccountId,
      String kind,
      UUID branchId,
      String branchName,
      String branchGroupName,
      String code,
      String name,
      String bankName,
      String bankBranchName,
      String accountNoMasked,
      String iban,
      String currency,
      BigDecimal balance,
      BigDecimal in30,
      BigDecimal out30,
      long checkCount,
      long noteCount,
      boolean active) {}

  public record PendingInstrumentItem(
      UUID instrumentId,
      String kind,
      String direction,
      String number,
      String bankName,
      String bankBranch,
      String accountName,
      boolean masked,
      String drawerName,
      String noteType,
      BigDecimal amount,
      String currency,
      LocalDate dueDate,
      String status) {}

  public record FundDailyItem(String kind, LocalDate date, BigDecimal inTl, BigDecimal outTl) {}

  public record DueItem(String currency, LocalDate due, String direction, BigDecimal amount) {}

  public record PerformanceItem(
      UUID accountId,
      String accountCode,
      String accountName,
      String subGroupName,
      String currency,
      long paymentCount,
      long collectionCount,
      BigDecimal paymentAmount,
      BigDecimal collectionAmount,
      BigDecimal avgDelay,
      long lateCount,
      long onTimeCount,
      long unmatchedCount) {}

  public record PositionItem(
      String currency,
      UUID companyId,
      BigDecimal cash,
      BigDecimal receivable,
      BigDecimal payable) {}

  @PersistenceContext private EntityManager entityManager;

  // --- kur farkı (B2)

  /** Sayfalı aday satırları; sıra {@code transaction_date desc, created_at desc, id}. */
  public List<FxCandidateRow> fxCandidates(FxCandidateQuery q, int size, long offset) {
    Query query =
        entityManager.createNativeQuery(
            "select t.id, t.account_id, a.code, a.name, a.type, a.active, t.company_id,"
                + " t.branch_id, t.direction, t.transaction_date, t.source_type,"
                + FX_DOCUMENT_NO
                + "as document_no, case when t.source_type = 'ACCOUNT_DOCUMENT' then dt.name end"
                + " as document_type_name, t.amount, t.currency, t.exchange_rate, t.tl_amount,"
                + " fx.id as cut_id, fx.document_no as cut_no, fx.side as cut_side,"
                + " fx.amount as cut_amount, fx.document_date as cut_date"
                + " from account_transaction t join account a on a.id = t.account_id"
                + FX_JOINS
                + FX_CUT_JOIN
                + " where "
                + FX_ELIGIBLE
                + FX_FILTERS
                + " order by t.transaction_date desc, t.created_at desc, t.id"
                + " limit :size offset :offset");
    bind(query, q);
    query.setParameter("size", size);
    query.setParameter("offset", offset);
    return rows(query).stream().map(FinanceReportRepositories::candidate).toList();
  }

  public long fxCandidateCount(FxCandidateQuery q) {
    Query query =
        entityManager.createNativeQuery(
            "select count(*) from account_transaction t join account a on a.id = t.account_id"
                + FX_CUT_JOIN
                + " where "
                + FX_ELIGIBLE
                + FX_FILTERS);
    bind(query, q);
    return ((Number) query.getSingleResult()).longValue();
  }

  /** Hareketin kaynak belge numarası (belge, fatura, açılış faturası, masraf); yoksa boş. */
  public Optional<String> documentNoOf(UUID transactionId) {
    Query query =
        entityManager.createNativeQuery(
            "select"
                + FX_DOCUMENT_NO
                + "from account_transaction t"
                + FX_JOINS
                + " where t.id = :id");
    query.setParameter("id", transactionId);
    List<?> result = query.getResultList();
    return result.isEmpty() ? Optional.empty() : Optional.ofNullable((String) result.get(0));
  }

  /** Sayfadaki kaynakların FIFO kapanışı (tek sorgu); {@code v}'den sonraki kaynak haritada yok. */
  public Map<UUID, FxSettlement> fxSettlements(Collection<UUID> transactionIds, LocalDate v) {
    Map<UUID, FxSettlement> result = new HashMap<>();
    if (transactionIds.isEmpty()) {
      return result;
    }
    Query query = entityManager.createNativeQuery(FX_SETTLEMENT);
    query.setParameter("txIds", transactionIds);
    query.setParameter("v", v);
    for (Object[] cells : rows(query)) {
      BigDecimal open = decimal(cells[1]);
      LocalDate candidate = date(cells[2]);
      result.put(uuid(cells[0]), new FxSettlement(open, open.signum() == 0 ? candidate : null));
    }
    return result;
  }

  /** Tek kaynağın FIFO kapanışı (kesim, kilit altında); {@code v}'den sonraki kaynakta boş. */
  public Optional<FxSettlement> fxSettlement(UUID transactionId, LocalDate v) {
    return Optional.ofNullable(fxSettlements(List.of(transactionId), v).get(transactionId));
  }

  // --- yaşlandırma v2 (§3.4.2)

  public List<AgingItem> aging(AgingQuery q) {
    Query query =
        entityManager.createNativeQuery(
            OPEN_ITEMS
                + """
                select i.account_id, a.code, a.name, a.sub_group, g.name as group_name,
                       case when a.type = 'EMPLOYEE' then null else a.phone end as phone,
                       i.currency,
                       coalesce(sum(i.remaining) filter (where :basis = 'DUE'
                         and coalesce(i.explicit_due, i.transaction_date) > :asOf), 0),
                       coalesce(sum(i.remaining) filter (where x.age between 0 and 30), 0),
                       coalesce(sum(i.remaining) filter (where x.age between 31 and 60), 0),
                       coalesce(sum(i.remaining) filter (where x.age between 61 and 90), 0),
                       coalesce(sum(i.remaining) filter (where x.age > 90), 0),
                       coalesce(sum(round(i.remaining * i.exchange_rate, 2)), 0)
                from open_items i
                join account a on a.id = i.account_id
                join account_group g on g.code = a.sub_group
                cross join lateral (select cast(:asOf as date) - (case when :basis = 'DUE'
                    then coalesce(i.explicit_due, i.transaction_date)
                    else i.transaction_date end) as age) x
                where i.direction = :open
                  and (:allAccounts = true or i.account_id = :accountId)
                  and (:allGroups = true or a.sub_group in (:subGroups))
                group by i.account_id, a.code, a.name, a.sub_group, g.name, a.type, a.phone,
                         i.currency
                order by a.name, i.account_id, i.currency
                """);
    bindScope(query, q.scope());
    query.setParameter("asOf", q.asOf());
    query.setParameter("types", q.types());
    query.setParameter("basis", q.basis());
    query.setParameter("open", q.openDirection());
    bindAccount(query, q.accountId());
    bindGroups(query, q.subGroups());
    return rows(query).stream()
        .map(
            c ->
                new AgingItem(
                    uuid(c[0]),
                    text(c[1]),
                    text(c[2]),
                    text(c[3]),
                    text(c[4]),
                    text(c[5]),
                    text(c[6]),
                    decimal(c[7]),
                    decimal(c[8]),
                    decimal(c[9]),
                    decimal(c[10]),
                    decimal(c[11]),
                    decimal(c[12])))
        .toList();
  }

  // --- FinanceReport (§3.4.3, §3.4.4)

  /** Tür × para birimi kapanış özeti; netleşme cari × şirket × para birimi (Y1). */
  public List<LedgerSummaryItem> ledgerSummary(ReportScope scope, LocalDate to, String currency) {
    Query query =
        entityManager.createNativeQuery(
            """
            with bal as (
              select t.account_id, t.company_id, t.currency,
                     sum(case when t.direction = 'DEBIT' then t.amount else -t.amount end)
                       as balance
              from account_transaction t join account a on a.id = t.account_id
              where t.deleted = false and a.deleted = false and t.transaction_date <= :to
                and (:currency = '' or t.currency = :currency)
            """
                + EMPLOYEE_AND_GROUP
                + SCOPE_T
                + """
                  group by t.account_id, t.company_id, t.currency
                )
                select case when g.report_type = 'BANK' then null else g.report_type end,
                       b.currency,
                       coalesce(-sum(b.balance) filter (where b.balance < 0), 0),
                       coalesce(sum(b.balance) filter (where b.balance > 0), 0),
                       coalesce(sum(b.balance), 0),
                       count(distinct b.account_id) filter (where abs(b.balance) >= 0.005)
                from bal b join account a on a.id = b.account_id
                join account_group g on g.code = a.sub_group
                group by 1, 2 order by 1 nulls last, 2
                """);
    bindScope(query, scope);
    query.setParameter("to", to);
    query.setParameter("currency", currency == null ? "" : currency);
    return rows(query).stream()
        .map(
            c ->
                new LedgerSummaryItem(
                    text(c[0]),
                    text(c[1]),
                    decimal(c[2]),
                    decimal(c[3]),
                    decimal(c[4]),
                    ((Number) c[5]).longValue()))
        .toList();
  }

  private static final String LEDGER_KIND_FROM =
      " from account_transaction t join account a on a.id = t.account_id"
          + " join account_group g on g.code = a.sub_group"
          + FinanceRepositories.KIND_JOINS
          + " left join account_document pd on"
          + FinanceRepositories.BASE_TYPE
          + "= 'ACCOUNT_DOCUMENT' and pd.id ="
          + FinanceRepositories.BASE_ID
          + " left join account_document_type adt on adt.side = pd.side"
          + " and adt.code = pd.document_type"
          + """
           where t.deleted = false and a.deleted = false and g.report_type = :reportType
             and t.transaction_date <= :to
             and (:currency = '' or t.currency = :currency)
             and (:allAccounts = true or t.account_id = :accountId)
          """
          + EMPLOYEE_AND_GROUP
          + SCOPE_T;

  /** Cari × şirket × para birimi satırları: Devir, dönem kırılımları, kapanış (Rev 1 F3). */
  public List<LedgerAccountItem> ledgerAccounts(LedgerListQuery q) {
    Query query =
        entityManager.createNativeQuery(
            "with k as (select t.account_id, t.company_id, t.currency, t.transaction_date,"
                + " t.direction, t.amount,"
                + FinanceRepositories.KIND
                + " as kind,"
                + FinanceRepositories.SIGN
                + " as sgn, coalesce(adt.penalty, false) as is_penalty,"
                + " (:hasFrom = false or t.transaction_date >= :from) as in_period"
                + LEDGER_KIND_FROM
                + """
                ),
                x as (
                  select k.account_id, k.company_id, k.currency,
                    coalesce(sum(case when not k.in_period then (case when k.direction = 'DEBIT'
                      then k.amount else -k.amount end) end), 0) as opening,
                    coalesce(sum(case when k.kind = 'DEBT' and k.in_period
                      then k.sgn * k.amount end), 0) as debt,
                    coalesce(sum(case when k.kind = 'PAYMENT' and k.in_period
                      then k.sgn * k.amount end), 0) as payment,
                    coalesce(sum(case when k.kind = 'RECEIVABLE' and k.in_period
                      and not k.is_penalty then k.sgn * k.amount end), 0) as receivable,
                    coalesce(sum(case when k.kind = 'RECEIVABLE' and k.in_period
                      and k.is_penalty then k.sgn * k.amount end), 0) as penalty,
                    coalesce(sum(case when k.kind = 'COLLECTION' and k.in_period
                      then k.sgn * k.amount end), 0) as collection,
                    coalesce(sum(case when k.direction = 'DEBIT' then k.amount
                      else -k.amount end), 0) as closing,
                    max(k.transaction_date) as last_movement
                  from k group by k.account_id, k.company_id, k.currency
                )
                select x.account_id, a.code, a.name, a.type, a.sub_group, g.name, a.active,
                       x.company_id, c.short_name, x.currency, x.opening, x.debt, x.payment,
                       x.receivable, x.penalty, x.collection, x.closing, x.last_movement
                from x join account a on a.id = x.account_id
                join account_group g on g.code = a.sub_group
                join company c on c.id = x.company_id
                order by a.name, a.id, c.short_name, x.currency
                """);
    bindLedger(query, q);
    return rows(query).stream()
        .map(
            c ->
                new LedgerAccountItem(
                    uuid(c[0]),
                    text(c[1]),
                    text(c[2]),
                    text(c[3]),
                    text(c[4]),
                    text(c[5]),
                    Boolean.TRUE.equals(c[6]),
                    uuid(c[7]),
                    text(c[8]),
                    text(c[9]),
                    decimal(c[10]),
                    decimal(c[11]),
                    decimal(c[12]),
                    decimal(c[13]),
                    decimal(c[14]),
                    decimal(c[15]),
                    decimal(c[16]),
                    date(c[17])))
        .toList();
  }

  /** Son tahsilat (alacak yanı) / ödeme (borç yanı): tarih ve o günün toplamı. */
  public List<LastSettlementItem> lastSettlements(LedgerListQuery q, String settlementType) {
    Query query =
        entityManager.createNativeQuery(
            """
            with st as (
              select s.account_id, s.company_id, s.currency, s.settlement_date, s.amount
              from settlement s join account a on a.id = s.account_id
              join account_group g on g.code = a.sub_group
              where s.deleted = false and s.status = 'POSTED' and s.type = :settlementType
                and s.settlement_date <= :to and a.deleted = false
                and g.report_type = :reportType
                and (:currency = '' or s.currency = :currency)
                and (:allAccounts = true or s.account_id = :accountId)
                and (:allCompanies = true or s.company_id = :companyId)
                and (:allBranches = true or s.branch_id in (:branchIds))
            """
                + EMPLOYEE_AND_GROUP
                + """
                ),
                l as (select account_id, company_id, currency, max(settlement_date) as d
                      from st group by account_id, company_id, currency)
                select l.account_id, l.company_id, l.currency, l.d, sum(st.amount)
                from l join st on st.account_id = l.account_id
                  and st.company_id = l.company_id and st.currency = l.currency
                  and st.settlement_date = l.d
                group by l.account_id, l.company_id, l.currency, l.d
                """);
    bindLedger(query, q);
    query.setParameter("settlementType", settlementType);
    return rows(query).stream()
        .map(
            c ->
                new LastSettlementItem(
                    uuid(c[0]), uuid(c[1]), text(c[2]), date(c[3]), decimal(c[4])))
        .toList();
  }

  /** Dönem sonrasındaki ({@code > to}) hareket sayısı (aynı tür ve süzgeçler). */
  public long postPeriodCount(LedgerListQuery q) {
    Query query =
        entityManager.createNativeQuery(
            """
            select count(*) from account_transaction t join account a on a.id = t.account_id
            join account_group g on g.code = a.sub_group
            where t.deleted = false and a.deleted = false and g.report_type = :reportType
              and t.transaction_date > :to
              and (:currency = '' or t.currency = :currency)
              and (:allAccounts = true or t.account_id = :accountId)
            """
                + EMPLOYEE_AND_GROUP
                + SCOPE_T);
    bindLedger(query, q);
    return ((Number) query.getSingleResult()).longValue();
  }

  /** Ekstre kipi ödeme/tahsilat yöntemleri (FR {@code paymentMethod} kuralı). */
  public List<MethodTotalItem> accountMethods(
      BranchFilter filter, UUID accountId, LocalDate from, LocalDate to) {
    Query query =
        entityManager.createNativeQuery(
            """
            select s.type,
                   coalesce(case when s.method = 'CHECK' then i.kind end,
                            case when s.channel = 'CREDIT_CARD' then 'CREDIT_CARD' end,
                            s.method) as method,
                   s.currency, sum(s.amount)
            from settlement s left join instrument i on i.id = s.instrument_id
            where s.deleted = false and s.status = 'POSTED' and s.account_id = :accountId
              and s.type in ('PAYMENT', 'COLLECTION')
              and (:hasFrom = false or s.settlement_date >= :from) and s.settlement_date <= :to
              and (:allCompanies = true or s.company_id = :companyId)
              and (:allBranches = true or s.branch_id in (:branchIds))
            group by 1, 2, 3 order by 1, 2, 3
            """);
    bindFilter(query, filter);
    query.setParameter("accountId", accountId);
    bindFrom(query, from);
    query.setParameter("to", to);
    return rows(query).stream()
        .map(c -> new MethodTotalItem(text(c[0]), text(c[1]), text(c[2]), decimal(c[3])))
        .toList();
  }

  // --- finansal bilanço (§3.4.5)

  /** İş yeri × para birimi tür toplamları (iş yeri görünümü; nominal). */
  public List<KindTotalItem> kindTotals(ReportScope scope, LocalDate asOf) {
    String kind = FinanceRepositories.KIND;
    String sign = FinanceRepositories.SIGN;
    Query query =
        entityManager.createNativeQuery(
            "select t.branch_id, t.currency, "
                + sumOfKind(kind, sign, "DEBT")
                + ", "
                + sumOfKind(kind, sign, "PAYMENT")
                + ", "
                + sumOfKind(kind, sign, "RECEIVABLE")
                + ", "
                + sumOfKind(kind, sign, "COLLECTION")
                + " from account_transaction t join account a on a.id = t.account_id"
                + FinanceRepositories.KIND_JOINS
                + " where t.deleted = false and a.deleted = false and t.transaction_date <= :asOf"
                + EMPLOYEE_AND_GROUP
                + SCOPE_T
                + " group by t.branch_id, t.currency");
    bindScope(query, scope);
    query.setParameter("asOf", asOf);
    return rows(query).stream()
        .map(
            c ->
                new KindTotalItem(
                    uuid(c[0]),
                    text(c[1]),
                    decimal(c[2]),
                    decimal(c[3]),
                    decimal(c[4]),
                    decimal(c[5])))
        .toList();
  }

  private static String sumOfKind(String kind, String sign, String value) {
    return "coalesce(sum(case when"
        + kind
        + "= '"
        + value
        + "' then"
        + sign
        + "* t.amount end), 0)";
  }

  /**
   * Kur farkı düzeltmesi (Rev 1 F1): asOf'ta etkin KUR_FARKI cari satırı başına kaynağın açık kalan
   * payı ({@code amount × kalan / kaynak tutarı}); DEBIT +, CREDIT −. Cari × şirket × iş yeri.
   */
  public List<FxAdjustmentItem> fxAdjustments(ReportScope scope, LocalDate asOf) {
    Query query =
        entityManager.createNativeQuery(
            OPEN_ITEMS
                + """
                select t.account_id, t.company_id, t.branch_id,
                       coalesce(sum(round(t.amount * coalesce(oi.remaining, 0) / src.amount, 2)
                         * case when t.direction = 'DEBIT' then 1 else -1 end), 0)
                from account_transaction t
                join account a on a.id = t.account_id
                join account_document k on k.id = t.source_id and k.document_type = 'KUR_FARKI'
                join account_transaction src on src.id = k.fx_source_transaction_id
                left join open_items oi on oi.id = src.id
                where t.source_type = 'ACCOUNT_DOCUMENT' and t.deleted = false
                  and a.deleted = false and t.transaction_date <= :asOf
                  and not exists (select 1 from account_transaction r
                                  where r.source_type = 'REVERSAL' and r.source_id = t.id
                                    and r.deleted = false and r.transaction_date <= :asOf)
                """
                + EMPLOYEE_AND_GROUP
                + SCOPE_T
                + " group by t.account_id, t.company_id, t.branch_id");
    bindScope(query, scope);
    query.setParameter("asOf", asOf);
    query.setParameter("types", allAccountTypes());
    return rows(query).stream()
        .map(c -> new FxAdjustmentItem(uuid(c[0]), uuid(c[1]), uuid(c[2]), decimal(c[3])))
        .toList();
  }

  /** Cari × şirket × iş yeri × para birimi neti (DEBIT − CREDIT) ve cari kimliği. */
  public List<AccountNetItem> accountNets(ReportScope scope, LocalDate asOf) {
    Query query =
        entityManager.createNativeQuery(
            """
            select t.account_id, a.code, a.name, a.type, g.name, t.company_id, t.branch_id,
                   t.currency,
                   sum(case when t.direction = 'DEBIT' then t.amount else -t.amount end)
            from account_transaction t join account a on a.id = t.account_id
            join account_group g on g.code = a.sub_group
            where t.deleted = false and a.deleted = false and t.transaction_date <= :asOf
            """
                + EMPLOYEE_AND_GROUP
                + SCOPE_T
                + """
                 group by t.account_id, a.code, a.name, a.type, g.name, t.company_id,
                          t.branch_id, t.currency
                 order by a.name, t.account_id, t.currency
                """);
    bindScope(query, scope);
    query.setParameter("asOf", asOf);
    return rows(query).stream()
        .map(
            c ->
                new AccountNetItem(
                    uuid(c[0]),
                    text(c[1]),
                    text(c[2]),
                    text(c[3]),
                    text(c[4]),
                    uuid(c[5]),
                    uuid(c[6]),
                    text(c[7]),
                    decimal(c[8])))
        .toList();
  }

  /** Grup şirketi carilerinin şirket × para birimi bakiyesi (şirket ve iş yeri süzgeçli). */
  public List<IntercompanyItem> intercompany(BranchFilter filter, LocalDate asOf) {
    Query query =
        entityManager.createNativeQuery(
            """
            select t.account_id, a.name, a.represents_company_id, t.company_id, t.currency,
                   sum(case when t.direction = 'DEBIT' then t.amount else -t.amount end)
            from account_transaction t join account a on a.id = t.account_id
            where t.deleted = false and a.deleted = false and a.type = 'INTERCOMPANY'
              and t.transaction_date <= :asOf
            """
                + SCOPE_T
                + """
                 group by t.account_id, a.name, a.represents_company_id, t.company_id, t.currency
                 having abs(sum(case when t.direction = 'DEBIT' then t.amount
                                else -t.amount end)) >= 0.005
                 order by a.name, t.account_id, t.company_id, t.currency
                """);
    bindFilter(query, filter);
    query.setParameter("asOf", asOf);
    return rows(query).stream()
        .map(
            c ->
                new IntercompanyItem(
                    uuid(c[0]), text(c[1]), uuid(c[2]), uuid(c[3]), text(c[4]), decimal(c[5])))
        .toList();
  }

  /** Fon hesabı başına bakiye (asOf'a kadar; Rev 1 F6: hesaplar arası netleşme yok). */
  public List<FundBalanceItem> fundBalances(BranchFilter filter, LocalDate asOf) {
    Query query =
        entityManager.createNativeQuery(
            """
            select fa.id, fa.branch_id, fa.kind, fa.currency,
                   coalesce(sum(case when ft.direction = 'IN' then ft.amount
                                     else -ft.amount end), 0)
            from fund_account fa
            left join fund_transaction ft on ft.fund_account_id = fa.id and ft.deleted = false
                 and ft.transaction_date <= :asOf
            where fa.deleted = false
              and (:allCompanies = true or fa.company_id = :companyId)
              and (:allBranches = true or fa.branch_id in (:branchIds))
            group by fa.id, fa.branch_id, fa.kind, fa.currency
            """);
    bindFilter(query, filter);
    query.setParameter("asOf", asOf);
    return rows(query).stream()
        .map(
            c -> new FundBalanceItem(uuid(c[0]), uuid(c[1]), text(c[2]), text(c[3]), decimal(c[4])))
        .toList();
  }

  /**
   * Portföydeki alınan (PORTFOLIO, AT_BANK) ve ödenecek verilen (ISSUED) çek/senet toplamları
   * (güncel durum; R-13). Teminattaki senet (COLLATERAL) dahil değil.
   */
  public List<InstrumentTotalItem> instrumentTotals(BranchFilter filter) {
    Query query =
        entityManager.createNativeQuery(
            """
            select i.branch_id, i.currency, i.kind, i.direction, count(*), sum(i.amount)
            from instrument i
            where i.deleted = false
              and ((i.direction = 'RECEIVED' and i.status in ('PORTFOLIO', 'AT_BANK'))
                   or (i.direction = 'ISSUED' and i.status = 'ISSUED'))
              and (:allCompanies = true or i.company_id = :companyId)
              and (:allBranches = true or i.branch_id in (:branchIds))
            group by i.branch_id, i.currency, i.kind, i.direction
            """);
    bindFilter(query, filter);
    return rows(query).stream()
        .map(
            c ->
                new InstrumentTotalItem(
                    uuid(c[0]),
                    text(c[1]),
                    text(c[2]),
                    text(c[3]),
                    ((Number) c[4]).longValue(),
                    decimal(c[5])))
        .toList();
  }

  /** Kapsamdaki iş yerleri (kimlik ve şirket adı; pasifler dahil, çağıran süzer). */
  public List<BranchItem> branches(BranchFilter filter) {
    Query query =
        entityManager.createNativeQuery(
            """
            select b.id, b.name, bg.name, b.company_id, c.short_name, b.active
            from branch b join company c on c.id = b.company_id
            left join branch_group bg on bg.id = b.branch_group_id
            where b.deleted = false
              and (:allCompanies = true or b.company_id = :companyId)
              and (:allBranches = true or b.id in (:branchIds))
            order by c.short_name, b.name
            """);
    bindFilter(query, filter);
    return rows(query).stream()
        .map(
            c ->
                new BranchItem(
                    uuid(c[0]),
                    text(c[1]),
                    text(c[2]),
                    uuid(c[3]),
                    text(c[4]),
                    Boolean.TRUE.equals(c[5])))
        .toList();
  }

  // --- hazine (§3.4.6)

  /**
   * Hareket akışı süzgeci ({@code ft} takma adı): pencere içinde birbirini götüren orijinal +
   * REVERSAL çifti sayılmaz (Rev 4 B3-NUM-01). Orijinali pencereden önce olan ters kayıt pencerede
   * gerçek hareket olarak sayılır; pencere bitişinden sonra ters çevrilen orijinal sayılır. Bakiye
   * bu süzgeçten etkilenmez.
   */
  static String windowNotReversed(String fromParam, String toParam) {
    return "not (ft.source_type = 'REVERSAL' and exists (select 1 from fund_transaction o"
        + " where o.id = ft.source_id and o.deleted = false and o.transaction_date >= :"
        + fromParam
        + "))"
        + " and not exists (select 1 from fund_transaction r where r.source_type = 'REVERSAL'"
        + " and r.source_id = ft.id and r.deleted = false and r.transaction_date <= :"
        + toParam
        + ")";
  }

  /** Fon hesapları: bugüne kadar bakiye, son 30 gün giriş/çıkış, açık çek/senet adedi. */
  public List<TreasuryFundItem> treasuryFunds(
      BranchFilter filter, LocalDate today, LocalDate from30) {
    Query query =
        entityManager.createNativeQuery(
            """
            select fa.id, fa.kind, fa.branch_id, b.name, bg.name, fa.code, fa.name, fa.bank_name,
                   fa.bank_branch_name, fa.account_no_masked, fa.iban, fa.currency,
                   coalesce(sum(case when ft.direction = 'IN' then ft.amount
                                     else -ft.amount end), 0),
                   coalesce(sum(ft.amount) filter (where ft.direction = 'IN'
                                                     and ft.transaction_date >= :from30
                                                     and {NOT_REVERSED}), 0),
                   coalesce(sum(ft.amount) filter (where ft.direction = 'OUT'
                                                     and ft.transaction_date >= :from30
                                                     and {NOT_REVERSED}), 0),
                   (select count(*) from instrument i where i.deleted = false and i.kind = 'CHECK'
                      and (i.fund_account_id = fa.id or i.custody_fund_id = fa.id)
                      and i.status in ('PORTFOLIO', 'AT_BANK', 'ISSUED')),
                   (select count(*) from instrument i where i.deleted = false and i.kind = 'NOTE'
                      and (i.fund_account_id = fa.id or i.custody_fund_id = fa.id)
                      and i.status in ('PORTFOLIO', 'AT_BANK', 'ISSUED')),
                   fa.active
            from fund_account fa
            join branch b on b.id = fa.branch_id
            left join branch_group bg on bg.id = b.branch_group_id
            left join fund_transaction ft on ft.fund_account_id = fa.id and ft.deleted = false
                 and ft.transaction_date <= :today
            where fa.deleted = false
              and (:allCompanies = true or fa.company_id = :companyId)
              and (:allBranches = true or fa.branch_id in (:branchIds))
            group by fa.id, b.name, bg.name
            order by fa.kind, b.name, fa.name, fa.id
            """
                .replace("{NOT_REVERSED}", windowNotReversed("from30", "today")));
    bindFilter(query, filter);
    query.setParameter("today", today);
    query.setParameter("from30", from30);
    return rows(query).stream()
        .map(
            c ->
                new TreasuryFundItem(
                    uuid(c[0]),
                    text(c[1]),
                    uuid(c[2]),
                    text(c[3]),
                    text(c[4]),
                    text(c[5]),
                    text(c[6]),
                    text(c[7]),
                    text(c[8]),
                    text(c[9]),
                    text(c[10]),
                    text(c[11]),
                    decimal(c[12]),
                    decimal(c[13]),
                    decimal(c[14]),
                    ((Number) c[15]).longValue(),
                    ((Number) c[16]).longValue(),
                    Boolean.TRUE.equals(c[17])))
        .toList();
  }

  /**
   * Açık çek (alınan PORTFOLIO/AT_BANK, verilen ISSUED) ve senet (alınan PORTFOLIO/AT_BANK/
   * COLLATERAL, verilen ISSUED). Personel carisinde ad ve keşideci izinsiz kullanıcıya boş
   * (SEC-12.8-02; {@code InstrumentListQueryRepository.VISIBLE} kuralı).
   */
  public List<PendingInstrumentItem> pendingInstruments(
      BranchFilter filter, boolean employeeVisible) {
    String visible = InstrumentQueryRepository.InstrumentListQueryRepository.VISIBLE;
    Query query =
        entityManager.createNativeQuery(
            "select i.id, i.kind, i.direction, i.number, i.bank_name, i.bank_branch,"
                + " case when"
                + visible
                + "then a.name end,"
                + " coalesce(a.type = 'EMPLOYEE' and :employeeVisible = false, false),"
                + " case when"
                + visible
                + "then i.drawer_name end,"
                + """
                 i.note_type, i.amount, i.currency, i.due_date, i.status
                from instrument i left join account a on a.id = i.account_id
                where i.deleted = false
                  and ((i.kind = 'CHECK'
                        and ((i.direction = 'RECEIVED' and i.status in ('PORTFOLIO', 'AT_BANK'))
                             or (i.direction = 'ISSUED' and i.status = 'ISSUED')))
                    or (i.kind = 'NOTE'
                        and ((i.direction = 'RECEIVED'
                              and i.status in ('PORTFOLIO', 'AT_BANK', 'COLLATERAL'))
                             or (i.direction = 'ISSUED' and i.status = 'ISSUED'))))
                  and (:allCompanies = true or i.company_id = :companyId)
                  and (:allBranches = true or i.branch_id in (:branchIds))
                order by i.due_date, i.number, i.id
                """);
    bindFilter(query, filter);
    query.setParameter("employeeVisible", employeeVisible);
    return rows(query).stream()
        .map(
            c ->
                new PendingInstrumentItem(
                    uuid(c[0]),
                    text(c[1]),
                    text(c[2]),
                    text(c[3]),
                    text(c[4]),
                    text(c[5]),
                    text(c[6]),
                    Boolean.TRUE.equals(c[7]),
                    text(c[8]),
                    text(c[9]),
                    decimal(c[10]),
                    text(c[11]),
                    date(c[12]),
                    text(c[13])))
        .toList();
  }

  /** Gün ve fon türü başına giriş/çıkış TL (hareketin kendi kuru). */
  public List<FundDailyItem> fundDaily(BranchFilter filter, LocalDate from, LocalDate to) {
    Query query =
        entityManager.createNativeQuery(
            """
            select fa.kind, ft.transaction_date,
                   coalesce(sum(round(ft.amount * ft.exchange_rate, 2))
                              filter (where ft.direction = 'IN'), 0),
                   coalesce(sum(round(ft.amount * ft.exchange_rate, 2))
                              filter (where ft.direction = 'OUT'), 0)
            from fund_transaction ft join fund_account fa on fa.id = ft.fund_account_id
            where ft.deleted = false and fa.deleted = false
              and ft.transaction_date between :from and :to
              and {NOT_REVERSED}
              and (:allCompanies = true or fa.company_id = :companyId)
              and (:allBranches = true or fa.branch_id in (:branchIds))
            group by fa.kind, ft.transaction_date
            """
                .replace("{NOT_REVERSED}", windowNotReversed("from", "to")));
    bindFilter(query, filter);
    query.setParameter("from", from);
    query.setParameter("to", to);
    return rows(query).stream()
        .map(c -> new FundDailyItem(text(c[0]), date(c[1]), decimal(c[2]), decimal(c[3])))
        .toList();
  }

  // --- nakit akışı (§3.4.7)

  /** Vadeli açık kalemler (FIFO kalanı; yalnız {@code explicit_due} dolu ve {@code <= last}). */
  public List<DueItem> openDues(
      ReportScope scope, Collection<String> types, LocalDate today, LocalDate last) {
    Query query =
        entityManager.createNativeQuery(
            OPEN_ITEMS
                + """
                select i.currency, i.explicit_due, i.direction, sum(i.remaining)
                from open_items i
                where i.explicit_due is not null and i.explicit_due <= :last
                group by i.currency, i.explicit_due, i.direction
                """);
    bindScope(query, scope);
    query.setParameter("asOf", today);
    query.setParameter("types", types);
    query.setParameter("last", last);
    return rows(query).stream()
        .map(c -> new DueItem(text(c[0]), date(c[1]), text(c[2]), decimal(c[3])))
        .toList();
  }

  // --- cari bazlı ödeme performansı (§3.4.8)

  public List<PerformanceItem> accountPerformance(
      ReportScope scope, LocalDate from, LocalDate to, UUID accountId, List<String> subGroups) {
    Query query =
        entityManager.createNativeQuery(
            """
            with s as (
              select s.id, s.account_id, s.type, s.currency, s.amount, s.settlement_date
              from settlement s join account a on a.id = s.account_id
              where s.deleted = false and s.status = 'POSTED'
                and s.settlement_date between :from and :to
                and a.deleted = false
                and (:allAccounts = true or s.account_id = :accountId)
                and (:allGroups = true or a.sub_group in (:subGroups))
                and (:allCompanies = true or s.company_id = :companyId)
                and (:allBranches = true or s.branch_id in (:branchIds))
            """
                + EMPLOYEE_AND_GROUP
                + """
                ),
                totals as (
                  select account_id, currency,
                         count(*) filter (where type = 'PAYMENT') as payment_count,
                         count(*) filter (where type = 'COLLECTION') as collection_count,
                         coalesce(sum(amount) filter (where type = 'PAYMENT'), 0) as payment_amount,
                         coalesce(sum(amount) filter (where type = 'COLLECTION'), 0)
                           as collection_amount
                  from s group by account_id, currency
                ),
                alloc as (
                  select s.account_id, s.currency, s.id as settlement_id,
                         s.settlement_date - coalesce(pi.due_date, fi.due_date, wi.due_date,
                                                      oi.due_date, ad.due_date) as delay
                  from s join settlement_allocation sa
                    on sa.settlement_id = s.id and sa.deleted = false
                  left join purchase_invoice pi on pi.id = sa.purchase_invoice_id
                  left join freight_invoice fi on fi.id = sa.freight_invoice_id
                  left join warehouse_invoice wi on wi.id = sa.warehouse_invoice_id
                  left join opening_invoice oi on oi.id = sa.opening_invoice_id
                  left join account_document ad on ad.id = sa.account_document_id
                  where coalesce(case sa.target_type
                      when 'PURCHASE_INVOICE' then pi.status = 'OPEN' and not pi.deleted
                      when 'FREIGHT_INVOICE' then fi.status = 'ISSUED' and not fi.deleted
                      when 'WAREHOUSE_INVOICE' then wi.status = 'ISSUED' and not wi.deleted
                      when 'OPENING_INVOICE' then oi.status = 'OPEN' and not oi.deleted
                      else ad.status = 'OPEN' and not ad.deleted end, false)
                ),
                delays as (
                  select account_id, currency,
                         round(avg(delay) filter (where delay is not null), 1) as avg_delay,
                         count(*) filter (where delay > 0) as late_count,
                         count(*) filter (where delay <= 0) as on_time_count,
                         count(distinct settlement_id) filter (where delay is not null)
                           as matched_settlements
                  from alloc group by account_id, currency
                )
                select t.account_id, a.code, a.name, g.name, t.currency, t.payment_count,
                       t.collection_count, t.payment_amount, t.collection_amount, d.avg_delay,
                       coalesce(d.late_count, 0), coalesce(d.on_time_count, 0),
                       (t.payment_count + t.collection_count)
                         - coalesce(d.matched_settlements, 0)
                from totals t join account a on a.id = t.account_id
                join account_group g on g.code = a.sub_group
                left join delays d on d.account_id = t.account_id and d.currency = t.currency
                order by a.name, t.account_id, t.currency
                """);
    bindScope(query, scope);
    query.setParameter("from", from);
    query.setParameter("to", to);
    bindAccount(query, accountId);
    bindGroups(query, subGroups);
    return rows(query).stream()
        .map(
            c ->
                new PerformanceItem(
                    uuid(c[0]),
                    text(c[1]),
                    text(c[2]),
                    text(c[3]),
                    text(c[4]),
                    ((Number) c[5]).longValue(),
                    ((Number) c[6]).longValue(),
                    decimal(c[7]),
                    decimal(c[8]),
                    decimal(c[9]),
                    ((Number) c[10]).longValue(),
                    ((Number) c[11]).longValue(),
                    ((Number) c[12]).longValue()))
        .toList();
  }

  // --- döviz pozisyonu (§3.4.10; RS position ile tek SQL, R-15)

  /**
   * Para birimi (ve {@code byCompany} iken şirket) başına banka/kasa, brüt cari alacak ve borç.
   * Netleşme her zaman cari × şirket × para birimi (Rev 1 F3); şirket boyutu yalnız toplamada
   * düşer. Personel tutarları dahildir (ad yok).
   */
  public List<PositionItem> currencyPosition(
      BranchFilter filter, boolean excludeIntercompany, boolean byCompany) {
    Query query =
        entityManager.createNativeQuery(
            """
            with bal as (
              select t.account_id, t.company_id, t.currency,
                     sum(case when t.direction = 'DEBIT' then t.amount else -t.amount end)
                       as balance
              from account_transaction t join account a on a.id = t.account_id
              where t.deleted = false and a.deleted = false
                and (:excludeIntercompany = false or a.represents_company_id is null)
            """
                + SCOPE_T
                + """
                  group by t.account_id, t.company_id, t.currency
                ),
                acc as (
                  select case when :byCompany then company_id end as company_id, currency,
                         coalesce(sum(balance) filter (where balance > 0), 0) as receivable,
                         coalesce(-sum(balance) filter (where balance < 0), 0) as payable
                  from bal group by 1, 2
                ),
                cash as (
                  select case when :byCompany then ft.company_id end as company_id, ft.currency,
                         sum(case when ft.direction = 'IN' then ft.amount else -ft.amount end)
                           as cash
                  from fund_transaction ft join fund_account fa on fa.id = ft.fund_account_id
                  where ft.deleted = false and fa.deleted = false
                    and (:allCompanies = true or ft.company_id = :companyId)
                    and (:allBranches = true or fa.branch_id in (:branchIds))
                  group by 1, 2
                )
                select coalesce(acc.currency, cash.currency),
                       coalesce(acc.company_id, cash.company_id),
                       coalesce(cash.cash, 0), coalesce(acc.receivable, 0),
                       coalesce(acc.payable, 0)
                from acc full join cash on cash.currency = acc.currency
                  and cash.company_id is not distinct from acc.company_id
                order by 2 nulls first, 1
                """);
    bindFilter(query, filter);
    query.setParameter("excludeIntercompany", excludeIntercompany);
    query.setParameter("byCompany", byCompany);
    return rows(query).stream()
        .map(
            c ->
                new PositionItem(
                    text(c[0]), uuid(c[1]), decimal(c[2]), decimal(c[3]), decimal(c[4])))
        .toList();
  }

  // --- bağlama ve dönüşüm

  /** Tüm cari türleri (bilanço kur farkı düzeltmesi; tür süzgeci yok). */
  public static List<String> allAccountTypes() {
    return List.of("CUSTOMER", "CARRIER", "SUPPLIER", "EMPLOYEE", "BANK", "LEAD", "INTERCOMPANY");
  }

  private static void bind(Query query, FxCandidateQuery q) {
    BranchFilter f = q.filter();
    query.setParameter("sourceTypes", FX_SOURCE_TYPES);
    query.setParameter("employeeVisible", q.employeeVisible());
    query.setParameter("allCompanies", f.companyId() == null);
    query.setParameter("companyId", f.companyId() == null ? BranchFilter.NONE : f.companyId());
    query.setParameter("allBranches", f.allBranches());
    query.setParameter("branchIds", f.branchIds());
    query.setParameter("allAccounts", q.accountId() == null);
    query.setParameter("accountId", q.accountId() == null ? BranchFilter.NONE : q.accountId());
    query.setParameter("currency", q.currency() == null ? "" : q.currency());
    query.setParameter("hasFrom", q.from() != null);
    query.setParameter("from", q.from() == null ? MIN_DATE : q.from());
    query.setParameter("hasTo", q.to() != null);
    query.setParameter("to", q.to() == null ? MAX_DATE : q.to());
    query.setParameter("cutState", q.cutState());
  }

  private static void bindFilter(Query query, BranchFilter f) {
    query.setParameter("allCompanies", f.companyId() == null);
    query.setParameter("companyId", f.companyId() == null ? BranchFilter.NONE : f.companyId());
    query.setParameter("allBranches", f.allBranches());
    query.setParameter("branchIds", f.branchIds());
  }

  /** Süzgeç + personel + grup şirketi; sorguda geçmeyen parametre bağlanmaz. */
  private static void bindScope(Query query, ReportScope scope) {
    bindFilter(query, scope.filter());
    setIfPresent(query, "employeeVisible", scope.employeeVisible());
    setIfPresent(query, "excludeIntercompany", scope.excludeIntercompany());
  }

  private static void bindLedger(Query query, LedgerListQuery q) {
    bindScope(query, q.scope());
    query.setParameter("reportType", q.reportType());
    query.setParameter("to", q.to());
    query.setParameter("currency", q.currency() == null ? "" : q.currency());
    bindAccount(query, q.accountId());
    if (hasParameter(query, "hasFrom")) {
      bindFrom(query, q.from());
    }
  }

  private static void bindAccount(Query query, UUID accountId) {
    query.setParameter("allAccounts", accountId == null);
    query.setParameter("accountId", accountId == null ? BranchFilter.NONE : accountId);
  }

  private static void bindGroups(Query query, List<String> subGroups) {
    boolean all = subGroups == null || subGroups.isEmpty();
    query.setParameter("allGroups", all);
    query.setParameter("subGroups", all ? NO_TEXT : subGroups);
  }

  private static void bindFrom(Query query, LocalDate from) {
    query.setParameter("hasFrom", from != null);
    query.setParameter("from", from == null ? MIN_DATE : from);
  }

  private static void setIfPresent(Query query, String name, Object value) {
    if (hasParameter(query, name)) {
      query.setParameter(name, value);
    }
  }

  private static boolean hasParameter(Query query, String name) {
    for (Parameter<?> parameter : query.getParameters()) {
      if (name.equals(parameter.getName())) {
        return true;
      }
    }
    return false;
  }

  @SuppressWarnings("unchecked")
  private static List<Object[]> rows(Query query) {
    return (List<Object[]>) query.getResultList();
  }

  private static FxCandidateRow candidate(Object[] c) {
    return new FxCandidateRow(
        uuid(c[0]),
        uuid(c[1]),
        (String) c[2],
        (String) c[3],
        (String) c[4],
        Boolean.TRUE.equals(c[5]),
        uuid(c[6]),
        uuid(c[7]),
        (String) c[8],
        date(c[9]),
        (String) c[10],
        (String) c[11],
        (String) c[12],
        decimal(c[13]),
        (String) c[14],
        decimal(c[15]),
        decimal(c[16]),
        uuid(c[17]),
        (String) c[18],
        (String) c[19],
        decimal(c[20]),
        date(c[21]));
  }

  static String text(Object value) {
    return value == null ? null : value.toString().trim();
  }

  static UUID uuid(Object value) {
    if (value == null || value instanceof UUID) {
      return (UUID) value;
    }
    return UUID.fromString(value.toString());
  }

  static LocalDate date(Object value) {
    if (value instanceof java.sql.Date sql) {
      return sql.toLocalDate();
    }
    if (value instanceof Timestamp timestamp) {
      return timestamp.toLocalDateTime().toLocalDate();
    }
    return (LocalDate) value;
  }

  static BigDecimal decimal(Object value) {
    if (value == null || value instanceof BigDecimal) {
      return (BigDecimal) value;
    }
    return new BigDecimal(value.toString());
  }
}
