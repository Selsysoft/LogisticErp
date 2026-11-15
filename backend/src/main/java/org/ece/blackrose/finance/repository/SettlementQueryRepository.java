package org.ece.blackrose.finance.repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.finance.domain.Settlement;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

/**
 * Ödeme/tahsilat okuma sorguları (12.2a_TASARIM §3.7): zengin liste satırı, tek kayıt, açık fatura
 * kalemleri, eşleşmeler ve defter satırları. Personel carisi izinsiz kullanıcıda cari, açıklama ve
 * karşı taraf banka alanları maskeli döner (Rev 1 SEC-01); {@code :q} kaçışlanmış {@code %metin%}
 * desenidir ve maskeli alanlarla eşleşmez. Liste ve günlük rapor (B4) aynı SELECT gövdesini
 * kullanır ({@link #ITEM_COLUMNS} + {@link #ITEM_FROM}).
 */
public interface SettlementQueryRepository extends Repository<Settlement, UUID> {

  /** Satırın cari bilgileri bu kullanıcıya görünür mü (carisiz satır her zaman görünür). */
  String VISIBLE = " (:employeeVisible = true or a.type is null or a.type <> 'EMPLOYEE') ";

  /** ZTO görünen yöntemi: Senet = CHECK + NOTE, Kredi Kartı = BANK + CREDIT_CARD. */
  String DISPLAY_METHOD =
      """
       (case when s.method = 'CHECK' then coalesce(i.kind, 'CHECK')
             when s.method = 'BANK' and s.channel = 'CREDIT_CARD' then 'CREDIT_CARD'
             else s.method end)
      """;

  /** {@link SettlementItemRow} kolonları ({@link #ITEM_FROM} gerekir). */
  String ITEM_COLUMNS =
      " s.id as \"id\", s.type as \"type\", s.method as \"method\", s.channel as \"channel\","
          + DISPLAY_METHOD
          + " as \"displayMethod\", case when"
          + VISIBLE
          + "then a.id end as \"accountId\", case when"
          + VISIBLE
          + "then a.code end as \"accountCode\", case when"
          + VISIBLE
          + "then a.name end as \"accountName\","
          + """
           a.type as "accountType", a.sub_group as "accountSubGroup",
           ag.name as "accountGroupName",
           coalesce(a.type = 'EMPLOYEE' and :employeeVisible = false, false) as "employeeMasked",
           s.branch_id as "branchId", b.name as "branchName", bg.name as "branchGroupName",
           s.company_id as "companyId", s.fund_account_id as "fundAccountId",
           f.name as "fundName", f.kind as "fundKind", f.bank_name as "fundBankName",
           f.bank_branch_name as "fundBankBranchName", f.branch_id as "fundBranchId",
           s.instrument_id as "instrumentId", i.kind as "instrumentKind",
           i.number as "instrumentNumber", i.status as "instrumentStatus",
           s.expense_item_id as "expenseItemId", ei.name as "expenseItemName",
           s.plan_id as "planId", s.amount as "amount", s.currency as "currency",
           coalesce(atx.exchange_rate, ftx.exchange_rate) as "exchangeRate",
           coalesce(atx.tl_amount, ftx.tl_amount) as "tlAmount",
           s.settlement_date as "settlementDate", s.document_no as "documentNo",
          """
          + " case when"
          + VISIBLE
          + "then s.description end as \"description\", s.status as \"status\", case when"
          + VISIBLE
          + "then s.counterparty_bank_account_id end as \"counterpartyBankAccountId\", case when"
          + VISIBLE
          + "then ab.iban_masked end as \"counterpartyIbanMasked\", case when"
          + VISIBLE
          + "then ab.bank_name end as \"counterpartyBankName\","
          + """
           exists (select 1 from account_transaction tt
                     join account_transfer_line tl on tl.account_transaction_id = tt.id
                                                  and tl.active and tl.deleted = false
                    where tt.source_type = 'SETTLEMENT' and tt.source_id = s.id) as "transferred",
           s.corrects_settlement_id as "correctsSettlementId",
           (select c.id from settlement c
             where c.corrects_settlement_id = s.id and c.deleted = false
             order by c.created_at limit 1) as "correctedById",
           s.reverse_reason as "reverseReason", s.reversed_on as "reversedOn",
           s.created_at as "createdAt", s.created_by as "createdBy",
           coalesce(a.type = 'INTERCOMPANY', false) as "intercompany",
           coalesce(a.type = 'BANK', false) as "credit",
           coalesce((select sum(x.used_amount) from fund_transfer_source x
                       join fund_transfer d on d.id = x.transfer_id and d.deleted = false
                                           and d.status = 'POSTED'
                      where x.settlement_id = s.id and x.deleted = false), 0) as "fxUsed",
           exists (select 1 from intercompany_transfer it
                    where (it.payment_settlement_id = s.id or it.collection_settlement_id = s.id)
                      and it.deleted = false) as "intercompanyLinked",
           exists (select 1 from vehicle_expense v
                    where v.settlement_id = s.id and v.deleted = false) as "vehicleExpenseLinked"
          """;

  /** Süzgeçlerin gerektirdiği birleşimler (sayım sorgusu da kullanır). */
  String FILTER_FROM =
      """
       from settlement s
       left join account a on a.id = s.account_id
       left join instrument i on i.id = s.instrument_id and i.deleted = false
      """;

  /**
   * Satır kolonlarının birleşimleri; silinmiş cari ve fon süzülmez (geçmiş kayıt listede kalır).
   */
  String ITEM_FROM =
      FILTER_FROM
          + """
           left join account_group ag on ag.code = a.sub_group
           join branch b on b.id = s.branch_id
           left join branch_group bg on bg.id = b.branch_group_id
           left join fund_account f on f.id = s.fund_account_id
           left join expense_item ei on ei.id = s.expense_item_id
           left join account_bank_account ab on ab.id = s.counterparty_bank_account_id
           left join lateral (select t.exchange_rate, t.tl_amount from account_transaction t
                               where t.source_type = 'SETTLEMENT' and t.source_id = s.id
                                 and t.deleted = false
                               order by t.created_at limit 1) atx on true
           left join lateral (select t.exchange_rate, t.tl_amount from fund_transaction t
                               where t.source_type = 'SETTLEMENT' and t.source_id = s.id
                                 and t.deleted = false
                               order by t.created_at limit 1) ftx on true
          """;

  /** Liste süzgeçleri (§3.7); boş liste/metin süzgeçleri bayrak ve nöbetçiyle kapatılır. */
  String LIST_WHERE =
      " where s.deleted = false and s.type = :type"
          + " and (:allCompanies = true or s.company_id = :companyId)"
          + " and (:allBranches = true or s.branch_id in (:branchIds))"
          + " and (:allAccounts = true or s.account_id = :accountId)"
          + " and (:accountType = '' or a.type = :accountType)"
          + " and (:subGroup = '' or a.sub_group = :subGroup)"
          + " and (:allFunds = true or s.fund_account_id in (:fundIds))"
          + " and (:allMethods = true or"
          + DISPLAY_METHOD
          + "in (:methods))"
          + " and (:status = '' or s.status = :status)"
          + " and s.settlement_date between :from and :to"
          + " and (:allCounterparties = true or s.counterparty_bank_account_id = :counterpartyId)"
          + " and (:hasAccount = '' or (s.account_id is not null) = (:hasAccount = 'Y'))"
          + " and (:q = ''"
          + "      or s.document_no ilike :q escape '\\'"
          + "      or i.number ilike :q escape '\\'"
          + "      or ("
          + VISIBLE
          + "          and (s.description ilike :q escape '\\'"
          + "               or a.name ilike :q escape '\\'"
          + "               or a.code ilike :q escape '\\'))) ";

  /** Sıralama yuvası için metin anahtarı; cari adı maskeli ifadeyle (SEC-01). */
  String TEXT_KEY_1 =
      " (case :k1 when 'accountName' then (case when"
          + VISIBLE
          + "then lower(a.name) end) when 'documentNo' then lower(s.document_no)"
          + " when 'branchName' then lower(b.name) end) ";

  String TEXT_KEY_2 =
      " (case :k2 when 'accountName' then (case when"
          + VISIBLE
          + "then lower(a.name) end) when 'documentNo' then lower(s.document_no)"
          + " when 'branchName' then lower(b.name) end) ";

  String TEXT_KEY_3 =
      " (case :k3 when 'accountName' then (case when"
          + VISIBLE
          + "then lower(a.name) end) when 'documentNo' then lower(s.document_no)"
          + " when 'branchName' then lower(b.name) end) ";

  /**
   * En çok üç sıralama yuvası ({@code :kN} alan, {@code :aN} artan mı); kullanılmayan yuvada {@code
   * :kN = ''} ve tüm ifadeler NULL olur. Metin anahtarlarında NULL'lar sonda; kararlılık için sonda
   * {@code s.id}.
   */
  String ITEM_ORDER =
      """
       order by
        case when :k1 = 'settlementDate' and :a1 = true then s.settlement_date end asc,
        case when :k1 = 'settlementDate' and :a1 = false then s.settlement_date end desc,
        case when :k1 = 'createdAt' and :a1 = true then s.created_at end asc,
        case when :k1 = 'createdAt' and :a1 = false then s.created_at end desc,
        case when :k1 = 'amount' and :a1 = true then s.amount end asc,
        case when :k1 = 'amount' and :a1 = false then s.amount end desc,
        case when :a1 = true then
      """
          + TEXT_KEY_1
          + """
         end asc nulls last,
        case when :a1 = false then
      """
          + TEXT_KEY_1
          + """
         end desc nulls last,
        case when :k2 = 'settlementDate' and :a2 = true then s.settlement_date end asc,
        case when :k2 = 'settlementDate' and :a2 = false then s.settlement_date end desc,
        case when :k2 = 'createdAt' and :a2 = true then s.created_at end asc,
        case when :k2 = 'createdAt' and :a2 = false then s.created_at end desc,
        case when :k2 = 'amount' and :a2 = true then s.amount end asc,
        case when :k2 = 'amount' and :a2 = false then s.amount end desc,
        case when :a2 = true then
      """
          + TEXT_KEY_2
          + """
         end asc nulls last,
        case when :a2 = false then
      """
          + TEXT_KEY_2
          + """
         end desc nulls last,
        case when :k3 = 'settlementDate' and :a3 = true then s.settlement_date end asc,
        case when :k3 = 'settlementDate' and :a3 = false then s.settlement_date end desc,
        case when :k3 = 'createdAt' and :a3 = true then s.created_at end asc,
        case when :k3 = 'createdAt' and :a3 = false then s.created_at end desc,
        case when :k3 = 'amount' and :a3 = true then s.amount end asc,
        case when :k3 = 'amount' and :a3 = false then s.amount end desc,
        case when :a3 = true then
      """
          + TEXT_KEY_3
          + """
         end asc nulls last,
        case when :a3 = false then
      """
          + TEXT_KEY_3
          + """
         end desc nulls last,
        s.id
      """;

  @Query(
      value =
          "select"
              + ITEM_COLUMNS
              + ITEM_FROM
              + LIST_WHERE
              + ITEM_ORDER
              + " limit :limit offset :offset",
      nativeQuery = true)
  List<SettlementItemRow> listItems(
      @Param("type") String type,
      @Param("employeeVisible") boolean employeeVisible,
      @Param("allCompanies") boolean allCompanies,
      @Param("companyId") UUID companyId,
      @Param("allBranches") boolean allBranches,
      @Param("branchIds") Collection<UUID> branchIds,
      @Param("allAccounts") boolean allAccounts,
      @Param("accountId") UUID accountId,
      @Param("accountType") String accountType,
      @Param("subGroup") String subGroup,
      @Param("allFunds") boolean allFunds,
      @Param("fundIds") Collection<UUID> fundIds,
      @Param("allMethods") boolean allMethods,
      @Param("methods") Collection<String> methods,
      @Param("status") String status,
      @Param("from") LocalDate from,
      @Param("to") LocalDate to,
      @Param("allCounterparties") boolean allCounterparties,
      @Param("counterpartyId") UUID counterpartyId,
      @Param("hasAccount") String hasAccount,
      @Param("q") String q,
      @Param("k1") String k1,
      @Param("a1") boolean a1,
      @Param("k2") String k2,
      @Param("a2") boolean a2,
      @Param("k3") String k3,
      @Param("a3") boolean a3,
      @Param("limit") int limit,
      @Param("offset") long offset);

  @Query(value = "select count(*)" + FILTER_FROM + LIST_WHERE, nativeQuery = true)
  long countItems(
      @Param("type") String type,
      @Param("employeeVisible") boolean employeeVisible,
      @Param("allCompanies") boolean allCompanies,
      @Param("companyId") UUID companyId,
      @Param("allBranches") boolean allBranches,
      @Param("branchIds") Collection<UUID> branchIds,
      @Param("allAccounts") boolean allAccounts,
      @Param("accountId") UUID accountId,
      @Param("accountType") String accountType,
      @Param("subGroup") String subGroup,
      @Param("allFunds") boolean allFunds,
      @Param("fundIds") Collection<UUID> fundIds,
      @Param("allMethods") boolean allMethods,
      @Param("methods") Collection<String> methods,
      @Param("status") String status,
      @Param("from") LocalDate from,
      @Param("to") LocalDate to,
      @Param("allCounterparties") boolean allCounterparties,
      @Param("counterpartyId") UUID counterpartyId,
      @Param("hasAccount") String hasAccount,
      @Param("q") String q);

  /** Liste sorgusunun Java tarafı süzgeçleri (bayraklar ve nöbetçiler çözülmüş). */
  record ListCriteria(
      String type,
      boolean employeeVisible,
      boolean allCompanies,
      UUID companyId,
      boolean allBranches,
      Collection<UUID> branchIds,
      boolean allAccounts,
      UUID accountId,
      String accountType,
      String subGroup,
      boolean allFunds,
      Collection<UUID> fundIds,
      boolean allMethods,
      Collection<String> methods,
      String status,
      LocalDate from,
      LocalDate to,
      boolean allCounterparties,
      UUID counterpartyId,
      String hasAccount,
      String q) {}

  /** Sıralama yuvaları ({@code key} boşsa yuva kullanılmaz). */
  record SortSlots(String k1, boolean a1, String k2, boolean a2, String k3, boolean a3) {}

  default List<SettlementItemRow> listItems(
      ListCriteria c, SortSlots sort, int limit, long offset) {
    return listItems(
        c.type(),
        c.employeeVisible(),
        c.allCompanies(),
        c.companyId(),
        c.allBranches(),
        c.branchIds(),
        c.allAccounts(),
        c.accountId(),
        c.accountType(),
        c.subGroup(),
        c.allFunds(),
        c.fundIds(),
        c.allMethods(),
        c.methods(),
        c.status(),
        c.from(),
        c.to(),
        c.allCounterparties(),
        c.counterpartyId(),
        c.hasAccount(),
        c.q(),
        sort.k1(),
        sort.a1(),
        sort.k2(),
        sort.a2(),
        sort.k3(),
        sort.a3(),
        limit,
        offset);
  }

  default long countItems(ListCriteria c) {
    return countItems(
        c.type(),
        c.employeeVisible(),
        c.allCompanies(),
        c.companyId(),
        c.allBranches(),
        c.branchIds(),
        c.allAccounts(),
        c.accountId(),
        c.accountType(),
        c.subGroup(),
        c.allFunds(),
        c.fundIds(),
        c.allMethods(),
        c.methods(),
        c.status(),
        c.from(),
        c.to(),
        c.allCounterparties(),
        c.counterpartyId(),
        c.hasAccount(),
        c.q());
  }

  /** Tek kayıt (silinmemiş); personel maskesi listeyle aynı. */
  @Query(
      value = "select" + ITEM_COLUMNS + ITEM_FROM + " where s.id = :id and s.deleted = false",
      nativeQuery = true)
  Optional<SettlementItemRow> item(
      @Param("id") UUID id, @Param("employeeVisible") boolean employeeVisible);

  /**
   * Kaydın cari ve banka/kasa defter satırları ile bunların ters satırları (tarih sırası). Cari
   * taşıma satırları dahil edilmez.
   */
  @Query(
      value =
          """
          select 'ACCOUNT' as "ledger", t.id as "transactionId", t.direction as "direction",
                 t.amount as "amount", t.currency as "currency",
                 t.exchange_rate as "exchangeRate", t.tl_amount as "tlAmount",
                 t.transaction_date as "transactionDate",
                 (t.source_type = 'REVERSAL') as "reversal", t.created_at as "createdAt"
          from account_transaction t
          where t.deleted = false
            and ((t.source_type = 'SETTLEMENT' and t.source_id = :id)
                 or (t.source_type = 'REVERSAL' and t.source_id in (
                       select o.id from account_transaction o
                        where o.source_type = 'SETTLEMENT' and o.source_id = :id)))
          union all
          select 'FUND', t.id, t.direction, t.amount, t.currency, t.exchange_rate, t.tl_amount,
                 t.transaction_date, (t.source_type = 'REVERSAL'), t.created_at
          from fund_transaction t
          where t.deleted = false
            and ((t.source_type = 'SETTLEMENT' and t.source_id = :id)
                 or (t.source_type = 'REVERSAL' and t.source_id in (
                       select o.id from fund_transaction o
                        where o.source_type = 'SETTLEMENT' and o.source_id = :id)))
          order by "transactionDate", "createdAt", "ledger"
          """,
      nativeQuery = true)
  List<SettlementLineRow> lines(@Param("id") UUID id);

  /** Kaydın banka/kasa satırı ekstre satırıyla eşleşmiş mi (yalnız bilgi). */
  @Query(
      value =
          """
          select exists (select 1 from bank_statement_line l
                           join fund_transaction t on t.id = l.matched_transaction_id
                          where t.source_type = 'SETTLEMENT' and t.source_id = :id
                            and l.deleted = false)
          """,
      nativeQuery = true)
  boolean bankStatementMatched(@Param("id") UUID id);

  /**
   * Kaydın eşleşmeleri (silinmemiş satırlar) hedef belge bilgileriyle; hedef silinmiş ya da iptal
   * edilmişse {@code targetCancelled = true}.
   */
  @Query(
      value =
          """
          select a.id as "id", a.target_type as "targetType",
                 coalesce(a.purchase_invoice_id, a.freight_invoice_id, a.warehouse_invoice_id,
                          a.opening_invoice_id, a.account_document_id) as "targetId",
                 a.amount as "amount", a.currency as "currency",
                 coalesce(p.number, f.number, w.number, o.number, d.document_no) as "targetNumber",
                 case a.target_type when 'PURCHASE_INVOICE' then 'Alış Faturası'
                                    when 'FREIGHT_INVOICE' then 'Navlun Faturası'
                                    when 'WAREHOUSE_INVOICE' then 'Depo Faturası'
                                    when 'OPENING_INVOICE' then 'Açılış Faturası'
                                    else ty.name end as "targetTypeName",
                 coalesce(p.invoice_date, f.invoice_date, w.invoice_date, o.invoice_date,
                          d.document_date) as "invoiceDate",
                 coalesce(p.due_date, f.due_date, w.due_date, o.due_date, d.due_date)
                   as "dueDate",
                 coalesce(p.branch_id, f.branch_id, w.branch_id, o.branch_id, d.branch_id)
                   as "targetBranchId",
                 not coalesce(
                   case a.target_type
                     when 'PURCHASE_INVOICE' then p.status = 'OPEN' and not p.deleted
                     when 'FREIGHT_INVOICE' then f.status = 'ISSUED' and not f.deleted
                     when 'WAREHOUSE_INVOICE' then w.status = 'ISSUED' and not w.deleted
                     when 'OPENING_INVOICE' then o.status = 'OPEN' and not o.deleted
                     else d.status = 'OPEN' and not d.deleted end, false) as "targetCancelled"
          from settlement_allocation a
          left join purchase_invoice p on p.id = a.purchase_invoice_id
          left join freight_invoice f on f.id = a.freight_invoice_id
          left join warehouse_invoice w on w.id = a.warehouse_invoice_id
          left join opening_invoice o on o.id = a.opening_invoice_id
          left join account_document d on d.id = a.account_document_id
          left join account_document_type ty on ty.side = d.side and ty.code = d.document_type
          where a.settlement_id = :id and a.deleted = false
          order by a.created_at, a.id
          """,
      nativeQuery = true)
  List<AllocationRow> allocationsOf(@Param("id") UUID id);

  /**
   * Carinin şirketteki açık fatura kalemleri (12.2a §3.3 tür × taraf tablosu): kalan = toplam −
   * eşleşen; eşleşen = geçerli eşleşmeler ({@code excludedSettlementId} hariç) + faturaya plan
   * üzerinden bağlı POSTED plan ödemeleri (Rev 1 F-3). Yalnız kalanı olanlar; en eski vade önce, en
   * çok {@code limit} satır.
   */
  @Query(
      value =
          """
          with c as (
            select 'PURCHASE_INVOICE' as target_type, p.id, p.number,
                   'Alış Faturası' as type_name, p.invoice_date, p.due_date, p.currency,
                   p.total_amount as total, p.branch_id, p.company_id
            from purchase_invoice p
            where :side = 'PAYABLE' and p.account_id = :accountId and p.company_id = :companyId
              and p.currency = :currency and p.status = 'OPEN' and p.deleted = false
              and (:allBranches = true or p.branch_id in (:branchIds))
            union all
            select 'FREIGHT_INVOICE', f.id, f.number, 'Navlun Faturası', f.invoice_date,
                   f.due_date, f.currency, f.total_amount, f.branch_id, f.company_id
            from freight_invoice f
            where :side = 'RECEIVABLE' and f.account_id = :accountId
              and f.company_id = :companyId and f.currency = :currency
              and f.status = 'ISSUED' and f.deleted = false
              and (:allBranches = true or f.branch_id in (:branchIds))
            union all
            select 'WAREHOUSE_INVOICE', w.id, w.number, 'Depo Faturası', w.invoice_date,
                   w.due_date, w.currency, w.total_amount, w.branch_id, w.company_id
            from warehouse_invoice w
            where :side = 'RECEIVABLE' and w.account_id = :accountId
              and w.company_id = :companyId and w.currency = :currency
              and w.status = 'ISSUED' and w.deleted = false
              and (:allBranches = true or w.branch_id in (:branchIds))
            union all
            select 'OPENING_INVOICE', o.id, o.number, 'Açılış Faturası', o.invoice_date,
                   o.due_date, o.currency, o.total_amount, o.branch_id, o.company_id
            from opening_invoice o
            where o.kind = :side and o.account_id = :accountId and o.company_id = :companyId
              and o.currency = :currency and o.status = 'OPEN' and o.deleted = false
              and (:allBranches = true or o.branch_id in (:branchIds))
            union all
            select 'ACCOUNT_DOCUMENT', d.id, d.document_no, ty.name, d.document_date, d.due_date,
                   d.currency,
                   case when d.reflect_to_ledger then d.ledger_amount
                        else coalesce(x.net_payable, d.amount) end,
                   d.branch_id, d.company_id
            from account_document d
            join account_document_type ty on ty.side = d.side and ty.code = d.document_type
            left join account_document_tax x on x.document_id = d.id and x.deleted = false
            where d.side = :side and d.account_id = :accountId and d.company_id = :companyId
              and d.currency = :currency and d.status = 'OPEN' and d.deleted = false
              and ty.counts_as_invoice
              and (:allBranches = true or d.branch_id in (:branchIds))
          ),
          al as (
            select u.target_id, sum(u.amount) as allocated
            from (
              select coalesce(a.purchase_invoice_id, a.freight_invoice_id, a.warehouse_invoice_id,
                              a.opening_invoice_id, a.account_document_id) as target_id,
                     a.amount as amount
              from settlement_allocation a
              join settlement s on s.id = a.settlement_id
              where a.deleted = false and s.deleted = false and s.status = 'POSTED'
                and s.id <> :excludedSettlementId
                and coalesce(a.purchase_invoice_id, a.freight_invoice_id, a.warehouse_invoice_id,
                             a.opening_invoice_id, a.account_document_id) in (select id from c)
              union all
              select pp.purchase_invoice_id, s.amount
              from settlement s
              join payment_plan pp on pp.id = s.plan_id
              where s.deleted = false and s.status = 'POSTED'
                and pp.purchase_invoice_id in (select id from c)
              union all
              select o.id, s.amount
              from settlement s
              join opening_invoice o on o.payment_plan_id = s.plan_id
              where s.deleted = false and s.status = 'POSTED' and o.id in (select id from c)
            ) u
            group by u.target_id
          )
          select c.target_type as "targetType", c.id as "id", c.number as "number",
                 c.type_name as "typeName", c.invoice_date as "invoiceDate",
                 c.due_date as "dueDate", c.currency as "currency", c.total as "total",
                 coalesce(al.allocated, 0) as "allocated",
                 c.total - coalesce(al.allocated, 0) as "remaining",
                 c.branch_id as "branchId", c.company_id as "companyId"
          from c
          left join al on al.target_id = c.id
          where c.total - coalesce(al.allocated, 0) > 0
          order by c.due_date asc nulls last, c.invoice_date asc, c.number, c.id
          limit :limit
          """,
      nativeQuery = true)
  List<OpenInvoiceRow> openInvoices(
      @Param("side") String side,
      @Param("accountId") UUID accountId,
      @Param("companyId") UUID companyId,
      @Param("currency") String currency,
      @Param("allBranches") boolean allBranches,
      @Param("branchIds") Collection<UUID> branchIds,
      @Param("excludedSettlementId") UUID excludedSettlementId,
      @Param("limit") int limit);

  // --- günlük rapor (12.2a §3.8, B4)

  /**
   * Günlük rapor satırları, "o tarihteki durum" (Rev 1 F-4): {@code settlement_date = :date} ve
   * rapor günü itibarıyla geçerli ({@code POSTED} ya da rapor gününden sonra iptal edilmiş). Aynı
   * gün iptal edilen (ve düzeltilen) kayıt girmez. Sıra kayıt zamanı ({@code :ascending}), sonra
   * {@code s.id}; en çok {@code :limit} satır.
   */
  @Query(
      value =
          "select"
              + ITEM_COLUMNS
              + ITEM_FROM
              + " where s.deleted = false and s.type = :type and s.settlement_date = :date"
              + " and (s.status = 'POSTED' or s.reversed_on > :date)"
              + " and (:allCompanies = true or s.company_id = :companyId)"
              + " and (:allBranches = true or s.branch_id in (:branchIds))"
              + " and (:allFunds = true or s.fund_account_id in (:fundIds))"
              + " and (:currency = '' or s.currency = :currency)"
              + " and (:allMethods = true or"
              + DISPLAY_METHOD
              + "in (:methods))"
              + " order by case when :ascending = true then s.created_at end asc,"
              + " case when :ascending = false then s.created_at end desc, s.id"
              + " limit :limit",
      nativeQuery = true)
  List<SettlementItemRow> dailyItems(
      @Param("type") String type,
      @Param("date") LocalDate date,
      @Param("employeeVisible") boolean employeeVisible,
      @Param("allCompanies") boolean allCompanies,
      @Param("companyId") UUID companyId,
      @Param("allBranches") boolean allBranches,
      @Param("branchIds") Collection<UUID> branchIds,
      @Param("allFunds") boolean allFunds,
      @Param("fundIds") Collection<UUID> fundIds,
      @Param("currency") String currency,
      @Param("allMethods") boolean allMethods,
      @Param("methods") Collection<String> methods,
      @Param("ascending") boolean ascending,
      @Param("limit") int limit);

  /**
   * Günlük rapor fon bakiyeleri (Rev 1 SEC-02): yalnız şirket, iş yeri kapsamı ve para birimi
   * süzgecinden geçen aday fonlar (kapsam dışı fon sessizce atlanır). {@code balanceAtDate} rapor
   * günü sonu ({@code transaction_date <= :date}), {@code balanceNow} tüm hareketler (ileri tarihli
   * dahil; 12.2 "güncel" tanımı).
   */
  @Query(
      value =
          """
          select f.id as "fundAccountId", f.name as "name", f.kind as "kind",
                 f.currency as "currency", f.branch_id as "branchId", b.name as "branchName",
                 f.bank_name as "bankName", f.bank_branch_name as "bankBranchName",
                 coalesce((select sum(case when t.direction = 'IN' then t.amount else -t.amount end)
                             from fund_transaction t
                            where t.fund_account_id = f.id and t.deleted = false
                              and t.transaction_date <= :date), 0) as "balanceAtDate",
                 coalesce((select sum(case when t.direction = 'IN' then t.amount else -t.amount end)
                             from fund_transaction t
                            where t.fund_account_id = f.id and t.deleted = false), 0)
                   as "balanceNow"
          from fund_account f
          join branch b on b.id = f.branch_id
          where f.id in (:ids)
            and (:allCompanies = true or f.company_id = :companyId)
            and (:allBranches = true or f.branch_id in (:branchIds))
            and (:currency = '' or f.currency = :currency)
          order by lower(b.name), f.kind, lower(f.name), f.id
          """,
      nativeQuery = true)
  List<DailyFundBalanceRow> dailyFundBalances(
      @Param("ids") Collection<UUID> ids,
      @Param("date") LocalDate date,
      @Param("allCompanies") boolean allCompanies,
      @Param("companyId") UUID companyId,
      @Param("allBranches") boolean allBranches,
      @Param("branchIds") Collection<UUID> branchIds,
      @Param("currency") String currency);

  /**
   * O gün banka/kasaya yansıyan çek/senet hareketleri ({@code fund_transaction.source_type =
   * 'INSTRUMENT'}, yön {@code :direction}), çekin iş yeri × fon × para birimi başına (Rev 1 F-4,
   * SEC-02). Çekin şirketi ve iş yeri ile fonun iş yeri aynı kapsam süzgecinden geçer. Ters
   * satırlar sayılmaz; orijinal yalnız rapor gününe kadar (dahil) ters çevrildiyse düşer.
   */
  @Query(
      value =
          """
          select i.branch_id as "branchId", b.name as "branchName",
                 ft.fund_account_id as "fundAccountId", f.name as "fundName",
                 f.kind as "fundKind", ft.currency as "currency",
                 count(*) as "count", sum(ft.amount) as "total"
          from fund_transaction ft
          join instrument_movement m on m.id = ft.source_id
          join instrument i on i.id = m.instrument_id
          join fund_account f on f.id = ft.fund_account_id
          join branch b on b.id = i.branch_id
          where ft.source_type = 'INSTRUMENT' and ft.transaction_date = :date
            and ft.deleted = false and ft.direction = :direction
            and (:allCompanies = true or i.company_id = :companyId)
            and (:allBranches = true or i.branch_id in (:branchIds))
            and (:allBranches = true or f.branch_id in (:branchIds))
            and (:allFunds = true or ft.fund_account_id in (:fundIds))
            and (:currency = '' or ft.currency = :currency)
            and not exists (select 1 from fund_transaction r
                             where r.source_type = 'REVERSAL' and r.source_id = ft.id
                               and r.deleted = false and r.transaction_date <= :date)
          group by i.branch_id, b.name, ft.fund_account_id, f.name, f.kind, ft.currency
          order by lower(b.name), lower(f.name), ft.currency, ft.fund_account_id
          """,
      nativeQuery = true)
  List<DailyInstrumentMovementRow> instrumentFundMovements(
      @Param("date") LocalDate date,
      @Param("direction") String direction,
      @Param("allCompanies") boolean allCompanies,
      @Param("companyId") UUID companyId,
      @Param("allBranches") boolean allBranches,
      @Param("branchIds") Collection<UUID> branchIds,
      @Param("allFunds") boolean allFunds,
      @Param("fundIds") Collection<UUID> fundIds,
      @Param("currency") String currency);

  /** {@link #dailyFundBalances} satırı. */
  interface DailyFundBalanceRow {
    UUID getFundAccountId();

    String getName();

    String getKind();

    String getCurrency();

    UUID getBranchId();

    String getBranchName();

    String getBankName();

    String getBankBranchName();

    BigDecimal getBalanceAtDate();

    BigDecimal getBalanceNow();
  }

  /** {@link #instrumentFundMovements} satırı. */
  interface DailyInstrumentMovementRow {
    UUID getBranchId();

    String getBranchName();

    UUID getFundAccountId();

    String getFundName();

    String getFundKind();

    String getCurrency();

    Long getCount();

    BigDecimal getTotal();
  }

  /** Liste/detay/günlük rapor satırı (§4.3 {@code SettlementListItemResponse} ham alanları). */
  interface SettlementItemRow {
    UUID getId();

    String getType();

    String getMethod();

    String getChannel();

    String getDisplayMethod();

    UUID getAccountId();

    String getAccountCode();

    String getAccountName();

    String getAccountType();

    String getAccountSubGroup();

    String getAccountGroupName();

    Boolean getEmployeeMasked();

    UUID getBranchId();

    String getBranchName();

    String getBranchGroupName();

    UUID getCompanyId();

    UUID getFundAccountId();

    String getFundName();

    String getFundKind();

    String getFundBankName();

    String getFundBankBranchName();

    /** Fonun iş yeri (detayda IBAN kapsam denetimi; yanıta yazılmaz). */
    UUID getFundBranchId();

    UUID getInstrumentId();

    String getInstrumentKind();

    String getInstrumentNumber();

    String getInstrumentStatus();

    UUID getExpenseItemId();

    String getExpenseItemName();

    UUID getPlanId();

    BigDecimal getAmount();

    String getCurrency();

    BigDecimal getExchangeRate();

    BigDecimal getTlAmount();

    LocalDate getSettlementDate();

    String getDocumentNo();

    String getDescription();

    String getStatus();

    UUID getCounterpartyBankAccountId();

    String getCounterpartyIbanMasked();

    String getCounterpartyBankName();

    Boolean getTransferred();

    UUID getCorrectsSettlementId();

    UUID getCorrectedById();

    String getReverseReason();

    LocalDate getReversedOn();

    Object getCreatedAt();

    String getCreatedBy();

    Boolean getIntercompany();

    Boolean getCredit();

    BigDecimal getFxUsed();

    Boolean getIntercompanyLinked();

    Boolean getVehicleExpenseLinked();
  }

  /** {@link #lines} satırı. */
  interface SettlementLineRow {
    String getLedger();

    UUID getTransactionId();

    String getDirection();

    BigDecimal getAmount();

    String getCurrency();

    BigDecimal getExchangeRate();

    BigDecimal getTlAmount();

    LocalDate getTransactionDate();

    Boolean getReversal();
  }

  /** {@link #allocationsOf} satırı. */
  interface AllocationRow {
    UUID getId();

    String getTargetType();

    UUID getTargetId();

    BigDecimal getAmount();

    String getCurrency();

    String getTargetNumber();

    String getTargetTypeName();

    LocalDate getInvoiceDate();

    LocalDate getDueDate();

    UUID getTargetBranchId();

    Boolean getTargetCancelled();
  }

  /** {@link #openInvoices} satırı. */
  interface OpenInvoiceRow {
    String getTargetType();

    UUID getId();

    String getNumber();

    String getTypeName();

    LocalDate getInvoiceDate();

    LocalDate getDueDate();

    String getCurrency();

    BigDecimal getTotal();

    BigDecimal getAllocated();

    BigDecimal getRemaining();

    UUID getBranchId();

    UUID getCompanyId();
  }
}
