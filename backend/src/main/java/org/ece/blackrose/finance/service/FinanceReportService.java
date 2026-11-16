package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.ExchangeRate;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountDocumentSide;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.AgingBasis;
import org.ece.blackrose.finance.domain.FinanceTypes.AgingType;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentDirection;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentKind;
import org.ece.blackrose.finance.domain.FinanceTypes.InstrumentStatus;
import org.ece.blackrose.finance.repository.FinanceReportRepositories;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.AccountNetItem;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.AgingQuery;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.BranchItem;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.DueItem;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.FundBalanceItem;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.FundDailyItem;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.FxAdjustmentItem;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.InstrumentTotalItem;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.IntercompanyItem;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.KindTotalItem;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.LastSettlementItem;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.LedgerAccountItem;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.LedgerListQuery;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.PendingInstrumentItem;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.PerformanceItem;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.ReportScope;
import org.ece.blackrose.finance.repository.FinanceReportRepositories.TreasuryFundItem;
import org.ece.blackrose.finance.repository.FinanceRepositories.ExchangeRateRepository;
import org.ece.blackrose.finance.web.FinanceDtos.AgingResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.AccountMethodTotalResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.AccountPerformanceRowResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.BalanceSheetAccountResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.BalanceSheetCompanyResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.BalanceSheetCurrencyResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.BalanceSheetIntercompanyResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.BalanceSheetResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.BalanceSheetWorkplaceResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.CashFlowResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.CashFlowWeekResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.CurrencyPositionRowResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.LedgerAccountRowResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.LedgerAccountsResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.LedgerSummaryResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.LedgerSummaryRowResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.ReportCurrencyAmountResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.ReportRateResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.TreasuryCurrencyResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.TreasuryDailyResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.TreasuryDueBucketResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.TreasuryFundResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.TreasuryInstrumentResponse;
import org.ece.blackrose.finance.web.FinanceReportDtos.TreasuryResponse;
import org.ece.blackrose.organization.BranchFilter;
import org.ece.blackrose.organization.BranchScopeService;
import org.ece.blackrose.tenant.TenantClock;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Faz 12.8 finans raporları (12.8_TASARIM §3.4): yaşlandırma v2, FinanceReport genel bakış/liste/
 * yöntem kırılımı, finansal bilanço, hazine, nakit akışı, cari bazlı ödeme performansı ve döviz
 * pozisyonu. Salt okumadır; tüm rakamlar hareketlerden hesaplanır (saklı bakiye yok). Kapsam {@link
 * BranchScopeService#filter} (LIMITED kendi kapsamında; OK-12.8-17); personel carisi satır
 * listelerinde izinsiz gizli/maskeli, toplamlarda dahil (OK-12.8-18). Para birimleri birbirine
 * eklenmez; TL karşılıkları TCMB döviz alış kuruyla ayrı alanlardır (OK-12.8-4).
 */
@Service
@Transactional(readOnly = true)
public class FinanceReportService {

  static final int MAX_PERIOD_DAYS = 1830;
  static final int MAX_WEEKS = 26;
  static final int DEFAULT_WEEKS = 8;
  static final int TREASURY_DAYS = 30;
  static final int DUE_MONTHS = 6;

  private static final String TRY = ExchangeRateService.LOCAL_CURRENCY;
  private static final BigDecimal MIN_BALANCE = new BigDecimal("0.005");
  private static final BigDecimal HUNDRED = new BigDecimal("100");

  /** FinanceReport tür sırası (ZTO {@code FrTypes}); {@code null} = Rapor dışı en sonda. */
  static final List<String> REPORT_TYPES =
      List.of("SALES", "SUPPLIERS", "MATERIAL", "LABOR", "OTHER", "PERSONNEL");

  private static final String PERSONNEL = "PERSONNEL";

  /** Nakit akışı alacak/borç vadesi türleri (§3.4.7; aday cari hariç). */
  private static final List<String> CASH_FLOW_TYPES =
      List.of("CUSTOMER", "CARRIER", "SUPPLIER", "BANK", "INTERCOMPANY", "EMPLOYEE");

  /** Para birimi sırası: TRY önce, sonra alfabetik. */
  static final Comparator<String> CURRENCY_ORDER =
      Comparator.comparing((String c) -> !TRY.equals(c)).thenComparing(Comparator.naturalOrder());

  private final FinanceReportRepositories reports;
  private final ExchangeRateRepository rateRows;
  private final ExchangeRateService rates;
  private final AccountAccess access;
  private final BranchScopeService scope;
  private final TenantClock clock;

  public FinanceReportService(
      FinanceReportRepositories reports,
      ExchangeRateRepository rateRows,
      ExchangeRateService rates,
      AccountAccess access,
      BranchScopeService scope,
      TenantClock clock) {
    this.reports = reports;
    this.rateRows = rateRows;
    this.rates = rates;
    this.access = access;
    this.scope = scope;
    this.clock = clock;
  }

  // --- yaşlandırma v2 (§3.4.2)

  /**
   * Açık kalem (FIFO) yaşlandırması. Taban {@code TRANSACTION} (varsayılan; mevcut davranış) ya da
   * {@code DUE} (vadesi gelmemiş kalem {@code notDue}). Grup şirketi carileri konsolidede {@code
   * excludeIntercompany} ile dışlanır; personel grubu yalnız açık istek ve izinle girer.
   */
  public List<AgingResponse> aging(
      AgingType type,
      LocalDate asOf,
      UUID companyId,
      boolean excludeIntercompany,
      AgingBasis basis,
      UUID accountId,
      List<String> subGroups,
      List<UUID> branchIds) {
    BranchFilter filter = scope.filter(companyId, branchIds);
    if (accountId != null) {
      access.readable(accountId);
    }
    boolean employeeVisible = access.employeeVisible();
    List<String> types = new ArrayList<>();
    if (type == AgingType.RECEIVABLE) {
      types.add(AccountType.CUSTOMER.name());
    } else {
      types.add(AccountType.SUPPLIER.name());
      types.add(AccountType.CARRIER.name());
    }
    types.add(AccountType.INTERCOMPANY.name());
    List<String> groups = subGroups == null ? List.of() : subGroups;
    if (!groups.isEmpty() && employeeVisible) {
      types.add(AccountType.EMPLOYEE.name());
    }
    ReportScope reportScope =
        new ReportScope(filter, employeeVisible, companyId == null && excludeIntercompany);
    AgingQuery query =
        new AgingQuery(
            reportScope,
            asOf,
            type == AgingType.RECEIVABLE ? "DEBIT" : "CREDIT",
            types,
            (basis == null ? AgingBasis.TRANSACTION : basis).name(),
            accountId,
            groups);
    return reports.aging(query).stream()
        .map(
            row ->
                new AgingResponse(
                    row.accountId(),
                    row.accountName(),
                    row.currency(),
                    row.days0To30(),
                    row.days31To60(),
                    row.days61To90(),
                    row.daysOver90(),
                    row.notDue()
                        .add(row.days0To30())
                        .add(row.days31To60())
                        .add(row.days61To90())
                        .add(row.daysOver90()),
                    row.accountCode(),
                    row.subGroup(),
                    row.subGroupName(),
                    row.phone(),
                    row.notDue(),
                    row.tlTotal()))
        .toList();
  }

  // --- FinanceReport (§3.4.3, §3.4.4)

  /** Genel bakış: {@code to} tarihindeki kapanış (OK-12.8-14); {@code to} boşsa bugün. */
  public LedgerSummaryResponse ledgerSummary(
      LocalDate from, LocalDate to, String currency, UUID companyId, List<UUID> branchIds) {
    LocalDate end = to == null ? clock.today() : to;
    requirePeriod(from, end);
    BranchFilter filter = scope.filter(companyId, branchIds);
    boolean employeeVisible = access.employeeVisible();
    List<LedgerSummaryRowResponse> rows =
        reports
            .ledgerSummary(
                new ReportScope(filter, employeeVisible, companyId == null),
                end,
                blankToNull(currency))
            .stream()
            .sorted(
                Comparator.comparingInt(
                        (FinanceReportRepositories.LedgerSummaryItem item) ->
                            typeOrder(item.reportType()))
                    .thenComparing(
                        FinanceReportRepositories.LedgerSummaryItem::currency, CURRENCY_ORDER))
            .map(
                item ->
                    new LedgerSummaryRowResponse(
                        item.reportType(),
                        item.currency(),
                        item.weOwe(),
                        item.theyOwe(),
                        item.net(),
                        (int) item.openAccounts()))
            .toList();
    return new LedgerSummaryResponse(from, end, rows, !employeeVisible);
  }

  /**
   * Liste kipi: cari × şirket × para birimi satırları (Rev 1 F3). Bilinmeyen tür ve izinsiz
   * PERSONNEL 404 {@code REPORT_TYPE_NOT_FOUND}.
   */
  public LedgerAccountsResponse ledgerAccounts(
      String reportType,
      LocalDate from,
      LocalDate to,
      String currency,
      UUID accountId,
      UUID companyId,
      List<UUID> branchIds) {
    boolean employeeVisible = access.employeeVisible();
    if (reportType == null
        || !REPORT_TYPES.contains(reportType)
        || (PERSONNEL.equals(reportType) && !employeeVisible)) {
      throw new BusinessException(
          HttpStatus.NOT_FOUND, "REPORT_TYPE_NOT_FOUND", "Rapor türü bulunamadı.");
    }
    LocalDate end = to == null ? clock.today() : to;
    requirePeriod(from, end);
    BranchFilter filter = scope.filter(companyId, branchIds);
    if (accountId != null) {
      access.readable(accountId);
    }
    AccountDocumentSide side =
        "SALES".equals(reportType) ? AccountDocumentSide.RECEIVABLE : AccountDocumentSide.PAYABLE;
    LedgerListQuery query =
        new LedgerListQuery(
            new ReportScope(filter, employeeVisible, companyId == null),
            reportType,
            from,
            end,
            blankToNull(currency),
            accountId);
    Map<String, LastSettlementItem> last = new HashMap<>();
    for (LastSettlementItem item :
        reports.lastSettlements(
            query, side == AccountDocumentSide.RECEIVABLE ? "COLLECTION" : "PAYMENT")) {
      last.put(key(item.accountId(), item.companyId(), item.currency()), item);
    }
    List<LedgerAccountRowResponse> rows = new ArrayList<>();
    for (LedgerAccountItem item : reports.ledgerAccounts(query)) {
      LastSettlementItem settlement =
          last.get(key(item.accountId(), item.companyId(), item.currency()));
      rows.add(
          new LedgerAccountRowResponse(
              item.accountId(),
              item.accountCode(),
              item.accountName(),
              item.accountType(),
              item.subGroup(),
              item.subGroupName(),
              item.active(),
              item.companyId(),
              item.companyName(),
              item.currency(),
              item.opening(),
              item.debt(),
              item.payment(),
              item.receivable(),
              item.penalty(),
              item.collection(),
              item.closing(),
              settlement == null ? null : settlement.date(),
              settlement == null ? null : settlement.amount(),
              item.lastMovement()));
    }
    return new LedgerAccountsResponse(
        reportType, side, from, end, reports.postPeriodCount(query), rows);
  }

  /** Ekstre kipi ödeme ve tahsilat yöntemleri (personel carisi izinsiz 404). */
  public List<AccountMethodTotalResponse> accountMethods(
      UUID accountId, LocalDate from, LocalDate to, UUID companyId, List<UUID> branchIds) {
    BranchFilter filter = scope.filter(companyId, branchIds);
    access.readable(accountId);
    LocalDate end = to == null ? clock.today() : to;
    requirePeriod(from, end);
    return reports.accountMethods(filter, accountId, from, end).stream()
        .map(
            item ->
                new AccountMethodTotalResponse(
                    item.type(), item.method(), item.currency(), item.amount()))
        .toList();
  }

  // --- finansal bilanço (§3.4.5)

  /** Bir iş yerinin bir para birimindeki bilanço kalemleri (iş yeri görünümü). */
  private static final class Block {
    BigDecimal debt = BigDecimal.ZERO;
    BigDecimal payment = BigDecimal.ZERO;
    BigDecimal receivable = BigDecimal.ZERO;
    BigDecimal collection = BigDecimal.ZERO;
    BigDecimal bank = BigDecimal.ZERO;
    BigDecimal cash = BigDecimal.ZERO;
    BigDecimal receivedChecks = BigDecimal.ZERO;
    BigDecimal receivedNotes = BigDecimal.ZERO;
    BigDecimal issuedChecks = BigDecimal.ZERO;
    BigDecimal issuedNotes = BigDecimal.ZERO;
    int receivedCheckCount;
    int receivedNoteCount;
    int issuedCheckCount;
    int issuedNoteCount;
    BigDecimal accountReceivable = BigDecimal.ZERO;
    BigDecimal accountPayable = BigDecimal.ZERO;
    BigDecimal bankOverdraft = BigDecimal.ZERO;
    BigDecimal fxAdjustment = BigDecimal.ZERO;

    /** Fon, çek ve senet varlıkları (cari hariç; şirket özeti cariyi şirket düzeyinden ekler). */
    BigDecimal fundAssets() {
      return bank.add(cash).add(receivedChecks).add(receivedNotes);
    }

    BigDecimal fundLiabilities() {
      return issuedChecks.add(issuedNotes).add(bankOverdraft);
    }

    BigDecimal assets() {
      return fundAssets().add(accountReceivable);
    }

    BigDecimal liabilities() {
      return fundLiabilities().add(accountPayable);
    }

    BigDecimal net() {
      return receivable.subtract(collection).subtract(debt.subtract(payment));
    }
  }

  /** Bilanço: genel/şirket toplamları şirket düzeyi brüt (Rev 1 F2), tek değerleme (Rev 1 F1). */
  public BalanceSheetResponse balanceSheet(LocalDate asOf, UUID companyId, List<UUID> branchIds) {
    LocalDate today = clock.today();
    LocalDate date = asOf == null ? today : asOf;
    if (date.isAfter(today)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "AS_OF_INVALID", "Tarih bugünden ileri olamaz.");
    }
    BranchFilter filter = scope.filter(companyId, branchIds);
    boolean employeeVisible = access.employeeVisible();
    // Tutarlar personel dahil hesaplanır (OK-12.8-18); maskeleme satır listesinde.
    ReportScope amounts = new ReportScope(filter, true, companyId == null);
    RateTable rateTable = rateTable(date);

    Map<UUID, Map<String, Block>> blocks = new HashMap<>();
    for (KindTotalItem item : reports.kindTotals(amounts, date)) {
      Block block = block(blocks, item.branchId(), item.currency());
      block.debt = item.debt();
      block.payment = item.payment();
      block.receivable = item.receivable();
      block.collection = item.collection();
    }
    Map<UUID, Set<String>> fundCurrencies = new HashMap<>();
    for (FundBalanceItem item : reports.fundBalances(filter, date)) {
      if (item.balance().signum() == 0) {
        continue;
      }
      Block block = block(blocks, item.branchId(), item.currency());
      fundCurrencies.computeIfAbsent(item.branchId(), k -> new HashSet<>()).add(item.currency());
      if (item.balance().signum() < 0) {
        block.bankOverdraft = block.bankOverdraft.add(item.balance().negate());
      } else if (FundKind.BANK.name().equals(item.kind())) {
        block.bank = block.bank.add(item.balance());
      } else {
        block.cash = block.cash.add(item.balance());
      }
    }
    for (InstrumentTotalItem item : reports.instrumentTotals(filter)) {
      Block block = block(blocks, item.branchId(), item.currency());
      boolean received = InstrumentDirection.RECEIVED.name().equals(item.direction());
      boolean check = InstrumentKind.CHECK.name().equals(item.kind());
      int count = (int) item.count();
      if (received && check) {
        block.receivedChecks = block.receivedChecks.add(item.amount());
        block.receivedCheckCount += count;
      } else if (received) {
        block.receivedNotes = block.receivedNotes.add(item.amount());
        block.receivedNoteCount += count;
      } else if (check) {
        block.issuedChecks = block.issuedChecks.add(item.amount());
        block.issuedCheckCount += count;
      } else {
        block.issuedNotes = block.issuedNotes.add(item.amount());
        block.issuedNoteCount += count;
      }
    }

    // Kur farkı düzeltmesi (TRY; cari × iş yeri ve cari × şirket).
    Map<String, BigDecimal> adjByBranch = new HashMap<>();
    Map<String, BigDecimal> adjByCompany = new HashMap<>();
    for (FxAdjustmentItem item : reports.fxAdjustments(amounts, date)) {
      if (item.adjustment().signum() == 0) {
        continue;
      }
      adjByBranch.merge(
          key(item.accountId(), item.branchId(), TRY), item.adjustment(), BigDecimal::add);
      adjByCompany.merge(
          key(item.accountId(), item.companyId(), TRY), item.adjustment(), BigDecimal::add);
      Block block = block(blocks, item.branchId(), TRY);
      block.fxAdjustment = block.fxAdjustment.add(item.adjustment());
    }

    // Cari netleri: iş yeri görünümü ve şirket düzeyi brüt sınıflama.
    Map<String, AccountNetItem> branchNets = new LinkedHashMap<>();
    Map<String, BigDecimal> branchNetValues = new LinkedHashMap<>();
    Map<String, BigDecimal> companyNets = new HashMap<>();
    Map<String, AccountNetItem> identities = new HashMap<>();
    Map<UUID, Set<UUID>> accountsByBranch = new HashMap<>();
    for (AccountNetItem item : reports.accountNets(amounts, date)) {
      String branchKey = key(item.accountId(), item.branchId(), item.currency());
      branchNets.put(branchKey, item);
      branchNetValues.merge(branchKey, item.balance(), BigDecimal::add);
      companyNets.merge(
          key(item.accountId(), item.companyId(), item.currency()),
          item.balance(),
          BigDecimal::add);
      identities.put(item.accountId().toString(), item);
      accountsByBranch.computeIfAbsent(item.branchId(), k -> new HashSet<>()).add(item.accountId());
    }
    adjByBranch.forEach((k, adj) -> branchNetValues.merge(k, adj.negate(), BigDecimal::add));
    adjByCompany.forEach((k, adj) -> companyNets.merge(k, adj.negate(), BigDecimal::add));

    Map<UUID, Map<UUID, Map<String, BigDecimal>>> accountBalancesByBranch = new HashMap<>();
    for (Map.Entry<String, BigDecimal> entry : branchNetValues.entrySet()) {
      String[] parts = entry.getKey().split("\\|");
      UUID accountId = UUID.fromString(parts[0]);
      UUID branchId = UUID.fromString(parts[1]);
      String currency = parts[2];
      BigDecimal net = entry.getValue();
      if (net.abs().compareTo(MIN_BALANCE) < 0) {
        continue;
      }
      Block block = block(blocks, branchId, currency);
      if (net.signum() > 0) {
        block.accountReceivable = block.accountReceivable.add(net);
      } else {
        block.accountPayable = block.accountPayable.add(net.negate());
      }
      accountBalancesByBranch
          .computeIfAbsent(branchId, k -> new LinkedHashMap<>())
          .computeIfAbsent(accountId, k -> new TreeMap<>(CURRENCY_ORDER))
          .put(currency, net);
    }

    // Şirket düzeyi cari brüt (para birimi başına).
    Map<UUID, Map<String, BigDecimal[]>> companyAccounts = new HashMap<>();
    for (Map.Entry<String, BigDecimal> entry : companyNets.entrySet()) {
      BigDecimal net = entry.getValue();
      if (net.abs().compareTo(MIN_BALANCE) < 0) {
        continue;
      }
      String[] parts = entry.getKey().split("\\|");
      BigDecimal[] pair =
          companyAccounts
              .computeIfAbsent(UUID.fromString(parts[1]), k -> new HashMap<>())
              .computeIfAbsent(parts[2], k -> new BigDecimal[] {BigDecimal.ZERO, BigDecimal.ZERO});
      if (net.signum() > 0) {
        pair[0] = pair[0].add(net);
      } else {
        pair[1] = pair[1].add(net.negate());
      }
    }

    Set<String> missing = new TreeSet<>(CURRENCY_ORDER);
    List<BalanceSheetWorkplaceResponse> workplaces = new ArrayList<>();
    Map<UUID, BranchItem> companiesSeen = new LinkedHashMap<>();
    Map<UUID, BigDecimal[]> companyFundTl = new HashMap<>();
    for (BranchItem branch : reports.branches(filter)) {
      Map<String, Block> branchBlocks = blocks.getOrDefault(branch.branchId(), Map.of());
      boolean hasData = !branchBlocks.isEmpty() || accountsByBranch.containsKey(branch.branchId());
      if (!branch.active() && !hasData) {
        continue;
      }
      companiesSeen.putIfAbsent(branch.companyId(), branch);
      List<BalanceSheetCurrencyResponse> currencies = new ArrayList<>();
      BigDecimal assetsTl = BigDecimal.ZERO;
      BigDecimal liabilitiesTl = BigDecimal.ZERO;
      List<String> codes = new ArrayList<>(branchBlocks.keySet());
      codes.sort(CURRENCY_ORDER);
      for (String currency : codes) {
        Block block = branchBlocks.get(currency);
        BigDecimal rate = rateTable.rate(currency);
        BigDecimal tlAssets = rate == null ? null : rates.tlAt(block.assets(), rate);
        BigDecimal tlLiabilities = rate == null ? null : rates.tlAt(block.liabilities(), rate);
        if (rate == null) {
          missing.add(currency);
        } else {
          assetsTl = assetsTl.add(tlAssets);
          liabilitiesTl = liabilitiesTl.add(tlLiabilities);
          BigDecimal[] fund =
              companyFundTl.computeIfAbsent(
                  branch.companyId(), k -> new BigDecimal[] {BigDecimal.ZERO, BigDecimal.ZERO});
          fund[0] = fund[0].add(rates.tlAt(block.fundAssets(), rate));
          fund[1] = fund[1].add(rates.tlAt(block.fundLiabilities(), rate));
        }
        currencies.add(currencyBlock(currency, block, tlAssets, tlLiabilities));
      }
      List<BalanceSheetAccountResponse> accounts = new ArrayList<>();
      accountBalancesByBranch
          .getOrDefault(branch.branchId(), Map.of())
          .forEach(
              (accountId, balances) ->
                  accounts.add(
                      accountRow(identities.get(accountId.toString()), balances, employeeVisible)));
      accounts.sort(
          Comparator.comparing(
              (BalanceSheetAccountResponse a) -> a.accountName() == null ? "" : a.accountName()));
      workplaces.add(
          new BalanceSheetWorkplaceResponse(
              branch.branchId(),
              branch.branchName(),
              branch.branchGroupName(),
              branch.companyId(),
              branch.companyName(),
              assetsTl,
              liabilitiesTl,
              assetsTl.subtract(liabilitiesTl),
              currencies.size(),
              accountsByBranch.getOrDefault(branch.branchId(), Set.of()).size(),
              currencies,
              accounts));
    }

    // Şirket özeti: fon/çek/senet iş yerlerinden, cari şirket düzeyi brütten.
    List<BalanceSheetCompanyResponse> companies = new ArrayList<>();
    for (UUID companyKey : companyAccounts.keySet()) {
      if (!companiesSeen.containsKey(companyKey)) {
        // Kapsamda kartı olmayan şirketin cari bakiyesi (pasif/silinmiş iş yeri) yine özetlenir.
        companiesSeen.put(
            companyKey, new BranchItem(null, null, null, companyKey, companyKey.toString(), true));
      }
    }
    BigDecimal totalAssets = BigDecimal.ZERO;
    BigDecimal totalLiabilities = BigDecimal.ZERO;
    for (BranchItem company : companiesSeen.values()) {
      BigDecimal[] fund =
          companyFundTl.getOrDefault(
              company.companyId(), new BigDecimal[] {BigDecimal.ZERO, BigDecimal.ZERO});
      BigDecimal assets = fund[0];
      BigDecimal liabilities = fund[1];
      for (Map.Entry<String, BigDecimal[]> entry :
          companyAccounts.getOrDefault(company.companyId(), Map.of()).entrySet()) {
        BigDecimal rate = rateTable.rate(entry.getKey());
        if (rate == null) {
          missing.add(entry.getKey());
          continue;
        }
        assets = assets.add(rates.tlAt(entry.getValue()[0], rate));
        liabilities = liabilities.add(rates.tlAt(entry.getValue()[1], rate));
      }
      totalAssets = totalAssets.add(assets);
      totalLiabilities = totalLiabilities.add(liabilities);
      companies.add(
          new BalanceSheetCompanyResponse(
              company.companyId(),
              company.companyName(),
              assets,
              liabilities,
              assets.subtract(liabilities)));
    }

    List<BalanceSheetIntercompanyResponse> intercompany = new ArrayList<>();
    Map<String, List<IntercompanyItem>> byAccountCompany = new LinkedHashMap<>();
    for (IntercompanyItem item : reports.intercompany(filter, date)) {
      byAccountCompany
          .computeIfAbsent(item.accountId() + "|" + item.companyId(), k -> new ArrayList<>())
          .add(item);
    }
    byAccountCompany.forEach(
        (k, items) -> {
          IntercompanyItem first = items.get(0);
          intercompany.add(
              new BalanceSheetIntercompanyResponse(
                  first.accountId(),
                  first.accountName(),
                  first.representsCompanyId(),
                  first.companyId(),
                  items.stream()
                      .sorted(Comparator.comparing(IntercompanyItem::currency, CURRENCY_ORDER))
                      .map(i -> new ReportCurrencyAmountResponse(i.currency(), i.balance()))
                      .toList()));
        });

    return new BalanceSheetResponse(
        date,
        rateTable.rateDate(),
        rateTable.list(),
        List.copyOf(missing),
        totalAssets,
        totalLiabilities,
        totalAssets.subtract(totalLiabilities),
        workplaces.size(),
        companies,
        workplaces,
        intercompany,
        true);
  }

  private static Block block(Map<UUID, Map<String, Block>> blocks, UUID branch, String currency) {
    return blocks
        .computeIfAbsent(branch, k -> new HashMap<>())
        .computeIfAbsent(currency, k -> new Block());
  }

  private static BalanceSheetCurrencyResponse currencyBlock(
      String currency, Block b, BigDecimal tlAssets, BigDecimal tlLiabilities) {
    return new BalanceSheetCurrencyResponse(
        currency,
        b.debt,
        b.payment,
        b.receivable,
        b.collection,
        b.bank,
        b.cash,
        b.receivedChecks,
        b.receivedNotes,
        b.issuedChecks,
        b.issuedNotes,
        b.receivedCheckCount,
        b.receivedNoteCount,
        b.issuedCheckCount,
        b.issuedNoteCount,
        b.accountReceivable,
        b.accountPayable,
        b.bankOverdraft,
        b.fxAdjustment,
        b.net(),
        b.assets(),
        b.liabilities(),
        tlAssets,
        tlLiabilities);
  }

  private static BalanceSheetAccountResponse accountRow(
      AccountNetItem identity, Map<String, BigDecimal> balances, boolean employeeVisible) {
    List<ReportCurrencyAmountResponse> amounts =
        balances.entrySet().stream()
            .map(e -> new ReportCurrencyAmountResponse(e.getKey(), e.getValue()))
            .toList();
    boolean masked = AccountType.EMPLOYEE.name().equals(identity.accountType()) && !employeeVisible;
    return masked
        ? new BalanceSheetAccountResponse(null, null, null, identity.subGroupName(), true, amounts)
        : new BalanceSheetAccountResponse(
            identity.accountId(),
            identity.accountCode(),
            identity.accountName(),
            identity.subGroupName(),
            false,
            amounts);
  }

  // --- hazine (§3.4.6)

  /** Hızlı Bakiye Özeti: bugün itibarıyla fon, bekleyen çek/senet, 30 gün akış, 6 ay vade. */
  public TreasuryResponse treasury(UUID companyId, List<UUID> branchIds) {
    BranchFilter filter = scope.filter(companyId, branchIds);
    boolean employeeVisible = access.employeeVisible();
    LocalDate today = clock.today();
    LocalDate from = today.minusDays(TREASURY_DAYS - 1L);
    RateTable rateTable = rateTable(today);

    List<TreasuryFundResponse> banks = new ArrayList<>();
    List<TreasuryFundResponse> cashes = new ArrayList<>();
    Map<String, BigDecimal[]> byCurrency = new TreeMap<>(CURRENCY_ORDER);
    for (TreasuryFundItem item : reports.treasuryFunds(filter, today, from)) {
      if (!item.active() && item.balance().signum() == 0) {
        continue;
      }
      TreasuryFundResponse fund =
          new TreasuryFundResponse(
              item.fundAccountId(),
              FundKind.valueOf(item.kind()),
              item.branchId(),
              item.branchName(),
              item.branchGroupName(),
              item.code(),
              item.name(),
              item.bankName(),
              item.bankBranchName(),
              item.accountNoMasked(),
              item.iban(),
              item.currency(),
              item.balance(),
              item.in30(),
              item.out30(),
              (int) item.checkCount(),
              (int) item.noteCount(),
              item.active());
      boolean bank = FundKind.BANK.name().equals(item.kind());
      (bank ? banks : cashes).add(fund);
      BigDecimal[] totals = currencyTotals(byCurrency, item.currency());
      totals[bank ? 0 : 1] = totals[bank ? 0 : 1].add(item.balance());
    }

    List<TreasuryInstrumentResponse> checks = new ArrayList<>();
    List<TreasuryInstrumentResponse> bills = new ArrayList<>();
    Map<YearMonth, Map<String, BigDecimal[]>> due = new TreeMap<>();
    YearMonth current = YearMonth.from(today);
    for (PendingInstrumentItem item : reports.pendingInstruments(filter, employeeVisible)) {
      boolean check = InstrumentKind.CHECK.name().equals(item.kind());
      boolean received = InstrumentDirection.RECEIVED.name().equals(item.direction());
      TreasuryInstrumentResponse row =
          new TreasuryInstrumentResponse(
              item.instrumentId(),
              InstrumentKind.valueOf(item.kind()),
              InstrumentDirection.valueOf(item.direction()),
              item.number(),
              item.bankName(),
              item.bankBranch(),
              item.accountName(),
              item.masked(),
              item.drawerName(),
              item.noteType(),
              item.amount(),
              item.currency(),
              item.dueDate(),
              (int) ChronoUnit.DAYS.between(today, item.dueDate()),
              InstrumentStatus.valueOf(item.status()));
      (check ? checks : bills).add(row);
      BigDecimal[] totals = currencyTotals(byCurrency, item.currency());
      int slot = check ? (received ? 2 : 3) : (received ? 4 : 5);
      totals[slot] = totals[slot].add(item.amount());
      YearMonth month = YearMonth.from(item.dueDate());
      if (month.isBefore(current)) {
        month = current;
      }
      if (month.isBefore(current.plusMonths(DUE_MONTHS))) {
        BigDecimal[] bucket =
            due.computeIfAbsent(month, k -> new HashMap<>())
                .computeIfAbsent(
                    item.currency(), k -> new BigDecimal[] {BigDecimal.ZERO, BigDecimal.ZERO});
        bucket[check ? 0 : 1] = bucket[check ? 0 : 1].add(item.amount());
      }
    }

    Set<String> missing = new TreeSet<>(CURRENCY_ORDER);
    List<TreasuryCurrencyResponse> currencies = new ArrayList<>();
    BigDecimal bankTl = BigDecimal.ZERO;
    BigDecimal cashTl = BigDecimal.ZERO;
    BigDecimal checkTl = BigDecimal.ZERO;
    BigDecimal noteTl = BigDecimal.ZERO;
    for (Map.Entry<String, BigDecimal[]> entry : byCurrency.entrySet()) {
      BigDecimal[] t = entry.getValue();
      BigDecimal checksNet = t[2].subtract(t[3]);
      BigDecimal notesNet = t[4].subtract(t[5]);
      BigDecimal net = t[0].add(t[1]).add(checksNet).add(notesNet);
      currencies.add(
          new TreasuryCurrencyResponse(entry.getKey(), t[0], t[1], t[2], t[3], t[4], t[5], net));
      BigDecimal rate = rateTable.rate(entry.getKey());
      if (rate == null) {
        missing.add(entry.getKey());
        continue;
      }
      bankTl = bankTl.add(rates.tlAt(t[0], rate));
      cashTl = cashTl.add(rates.tlAt(t[1], rate));
      checkTl = checkTl.add(rates.tlAt(checksNet, rate));
      noteTl = noteTl.add(rates.tlAt(notesNet, rate));
    }

    Map<String, BigDecimal[]> daily = new HashMap<>();
    for (FundDailyItem item : reports.fundDaily(filter, from, today)) {
      daily.put(item.kind() + "|" + item.date(), new BigDecimal[] {item.inTl(), item.outTl()});
    }
    List<TreasuryDailyResponse> bankDaily = new ArrayList<>();
    List<TreasuryDailyResponse> cashDaily = new ArrayList<>();
    for (LocalDate day = from; !day.isAfter(today); day = day.plusDays(1)) {
      bankDaily.add(dailyRow(daily.get(FundKind.BANK.name() + "|" + day), day));
      cashDaily.add(dailyRow(daily.get(FundKind.CASH.name() + "|" + day), day));
    }

    List<TreasuryDueBucketResponse> buckets = new ArrayList<>();
    for (int i = 0; i < DUE_MONTHS; i++) {
      YearMonth month = current.plusMonths(i);
      BigDecimal checksTl = BigDecimal.ZERO;
      BigDecimal notesTl = BigDecimal.ZERO;
      for (Map.Entry<String, BigDecimal[]> entry : due.getOrDefault(month, Map.of()).entrySet()) {
        BigDecimal rate = rateTable.rate(entry.getKey());
        if (rate == null) {
          missing.add(entry.getKey());
          continue;
        }
        checksTl = checksTl.add(rates.tlAt(entry.getValue()[0], rate));
        notesTl = notesTl.add(rates.tlAt(entry.getValue()[1], rate));
      }
      buckets.add(new TreasuryDueBucketResponse(month.toString(), checksTl, notesTl));
    }

    return new TreasuryResponse(
        Instant.now(),
        rateTable.rateDate(),
        rateTable.list(),
        List.copyOf(missing),
        banks,
        cashes,
        checks,
        bills,
        currencies,
        bankTl,
        cashTl,
        checkTl,
        noteTl,
        bankTl.add(cashTl).add(checkTl).add(noteTl),
        bankDaily,
        cashDaily,
        buckets,
        true);
  }

  /** [banka, kasa, alınan çek, verilen çek, alınan senet, verilen senet]. */
  private static BigDecimal[] currencyTotals(Map<String, BigDecimal[]> map, String currency) {
    return map.computeIfAbsent(
        currency,
        k ->
            new BigDecimal[] {
              BigDecimal.ZERO,
              BigDecimal.ZERO,
              BigDecimal.ZERO,
              BigDecimal.ZERO,
              BigDecimal.ZERO,
              BigDecimal.ZERO
            });
  }

  private static TreasuryDailyResponse dailyRow(BigDecimal[] values, LocalDate day) {
    return values == null
        ? new TreasuryDailyResponse(day, BigDecimal.ZERO, BigDecimal.ZERO)
        : new TreasuryDailyResponse(day, values[0], values[1]);
  }

  // --- nakit akışı (§3.4.7)

  /**
   * {@code weeks} haftalık nakit akışı (1–26). {@code currency} boşsa TL karşılığı (güncel kur),
   * doluysa yalnız o para birimi. Vadesi geçmiş kalemler 1. haftada; alacak vadesi FIFO açık
   * kalandan ve yalnız vadeli kalemlerden (OK-12.8-9).
   */
  public CashFlowResponse cashFlow(
      Integer weeks, String currency, UUID companyId, List<UUID> branchIds) {
    int count = weeks == null ? DEFAULT_WEEKS : weeks;
    if (count < 1 || count > MAX_WEEKS) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "WEEKS_INVALID", "Hafta sayısı 1–26 olmalıdır.");
    }
    BranchFilter filter = scope.filter(companyId, branchIds);
    String only = blankToNull(currency);
    LocalDate today = clock.today();
    LocalDate last = today.plusDays(7L * count - 1);
    RateTable rateTable = only == null ? rateTable(today) : null;
    Set<String> missing = new TreeSet<>(CURRENCY_ORDER);

    // [hafta][alacak, alınan çek, verilen çek, senet, borç] → para birimi → tutar
    List<Map<String, BigDecimal[]>> cells = new ArrayList<>();
    for (int i = 0; i < count; i++) {
      cells.add(new HashMap<>());
    }
    ReportScope amounts = new ReportScope(filter, true, companyId == null);
    for (DueItem item : reports.openDues(amounts, CASH_FLOW_TYPES, today, last)) {
      if (only != null && !only.equals(item.currency())) {
        continue;
      }
      int slot = "DEBIT".equals(item.direction()) ? 0 : 4;
      add(cells, week(today, item.due()), item.currency(), slot, item.amount());
    }
    for (PendingInstrumentItem item : reports.pendingInstruments(filter, true)) {
      if ((only != null && !only.equals(item.currency())) || item.dueDate().isAfter(last)) {
        continue;
      }
      boolean received = InstrumentDirection.RECEIVED.name().equals(item.direction());
      if (InstrumentKind.CHECK.name().equals(item.kind())) {
        add(cells, week(today, item.dueDate()), item.currency(), received ? 1 : 2, item.amount());
      } else {
        add(
            cells,
            week(today, item.dueDate()),
            item.currency(),
            3,
            received ? item.amount() : item.amount().negate());
      }
    }

    List<CashFlowWeekResponse> rows = new ArrayList<>();
    BigDecimal cumulative = BigDecimal.ZERO;
    for (int i = 0; i < count; i++) {
      BigDecimal[] sums = {
        BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO
      };
      for (Map.Entry<String, BigDecimal[]> entry : cells.get(i).entrySet()) {
        BigDecimal rate = rateTable == null ? null : rateTable.rate(entry.getKey());
        if (rateTable != null && rate == null) {
          missing.add(entry.getKey());
          continue;
        }
        for (int s = 0; s < sums.length; s++) {
          BigDecimal value = entry.getValue()[s];
          sums[s] =
              sums[s].add(rate == null || value.signum() == 0 ? value : rates.tlAt(value, rate));
        }
      }
      BigDecimal net = sums[0].add(sums[1]).subtract(sums[2]);
      cumulative = cumulative.add(net);
      LocalDate start = today.plusDays(7L * i);
      rows.add(
          new CashFlowWeekResponse(
              i + 1,
              start,
              start.plusDays(6),
              sums[0],
              sums[1],
              sums[2],
              sums[3],
              sums[4],
              net,
              cumulative));
    }
    return new CashFlowResponse(
        today,
        count,
        only,
        rateTable == null ? null : rateTable.rateDate(),
        List.copyOf(missing),
        rows,
        true);
  }

  private static int week(LocalDate today, LocalDate due) {
    return due.isBefore(today) ? 0 : (int) (ChronoUnit.DAYS.between(today, due) / 7);
  }

  private static void add(
      List<Map<String, BigDecimal[]>> cells,
      int week,
      String currency,
      int slot,
      BigDecimal amount) {
    BigDecimal[] values =
        cells
            .get(week)
            .computeIfAbsent(
                currency,
                k ->
                    new BigDecimal[] {
                      BigDecimal.ZERO,
                      BigDecimal.ZERO,
                      BigDecimal.ZERO,
                      BigDecimal.ZERO,
                      BigDecimal.ZERO
                    });
    values[slot] = values[slot].add(amount);
  }

  // --- cari bazlı ödeme performansı (§3.4.8)

  /**
   * Cari × para birimi ödeme/tahsilat adet ve tutarları; gecikme eşleşme (allocation) başına,
   * eşleşmesiz kayıt skora girmez (OK-12.8-20). Personel carisi izinsiz kullanıcıda yok.
   */
  public List<AccountPerformanceRowResponse> accountPerformance(
      LocalDate from,
      LocalDate to,
      UUID accountId,
      List<String> subGroups,
      UUID companyId,
      List<UUID> branchIds) {
    requirePeriod(from, to);
    if (from.plusDays(MAX_PERIOD_DAYS).isBefore(to)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "PERIOD_TOO_LONG", "Rapor dönemi en çok 5 yıl olabilir.");
    }
    BranchFilter filter = scope.filter(companyId, branchIds);
    if (accountId != null) {
      access.readable(accountId);
    }
    ReportScope reportScope = new ReportScope(filter, access.employeeVisible(), companyId == null);
    List<AccountPerformanceRowResponse> rows = new ArrayList<>();
    for (PerformanceItem item :
        reports.accountPerformance(
            reportScope, from, to, accountId, subGroups == null ? List.of() : subGroups)) {
      long matched = item.lateCount() + item.onTimeCount();
      Integer score =
          matched == 0
              ? null
              : BigDecimal.valueOf(item.onTimeCount())
                  .multiply(HUNDRED)
                  .divide(BigDecimal.valueOf(matched), 0, RoundingMode.HALF_UP)
                  .intValue();
      rows.add(
          new AccountPerformanceRowResponse(
              item.accountId(),
              item.accountCode(),
              item.accountName(),
              item.subGroupName(),
              item.currency(),
              item.paymentCount(),
              item.collectionCount(),
              item.paymentAmount(),
              item.collectionAmount(),
              item.avgDelay(),
              item.lateCount(),
              item.onTimeCount(),
              item.unmatchedCount(),
              score));
    }
    return rows;
  }

  // --- döviz pozisyonu (§3.4.10)

  /**
   * Para birimi (ve {@code byCompany} iken şirket) başına banka/kasa, brüt alacak ve borç; LIMITED
   * kendi kapsamında. Konsolidede grup şirketi carileri dışlanır.
   */
  public List<CurrencyPositionRowResponse> currencyPosition(
      UUID companyId, List<UUID> branchIds, boolean byCompany) {
    BranchFilter filter = scope.filter(companyId, branchIds);
    return reports.currencyPosition(filter, companyId == null, byCompany).stream()
        .map(
            item -> {
              UUID rowCompany = byCompany ? item.companyId() : companyId;
              return new CurrencyPositionRowResponse(
                  item.currency(),
                  rowCompany,
                  item.cash(),
                  item.receivable(),
                  item.payable(),
                  item.cash().add(item.receivable()).subtract(item.payable()));
            })
        .toList();
  }

  // --- ortak

  /** Tarihteki kurlar (TCMB döviz alış; tarih ya da öncesindeki son kur); TRY = 1. */
  private record RateTable(
      LocalDate rateDate, Map<String, BigDecimal> byCurrency, List<ReportRateResponse> list) {

    BigDecimal rate(String currency) {
      return TRY.equals(currency) ? BigDecimal.ONE : byCurrency.get(currency);
    }
  }

  private RateTable rateTable(LocalDate date) {
    Map<String, BigDecimal> byCurrency = new HashMap<>();
    List<ReportRateResponse> list = new ArrayList<>();
    LocalDate latest = null;
    List<ExchangeRate> rows = new ArrayList<>(rateRows.findLatestOnOrBefore(date));
    rows.sort(Comparator.comparing(ExchangeRate::getCurrency, CURRENCY_ORDER));
    for (ExchangeRate rate : rows) {
      byCurrency.put(rate.getCurrency(), rate.getRate());
      list.add(new ReportRateResponse(rate.getCurrency(), rate.getRate(), rate.getRateDate()));
      if (latest == null || rate.getRateDate().isAfter(latest)) {
        latest = rate.getRateDate();
      }
    }
    return new RateTable(latest, byCurrency, list);
  }

  private static int typeOrder(String reportType) {
    int index = reportType == null ? -1 : REPORT_TYPES.indexOf(reportType);
    return index < 0 ? REPORT_TYPES.size() : index;
  }

  private static void requirePeriod(LocalDate from, LocalDate to) {
    if (from != null && to != null && to.isBefore(from)) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "PERIOD_INVALID", "Bitiş tarihi başlangıçtan önce olamaz.");
    }
  }

  private static String key(UUID first, UUID second, String currency) {
    return first + "|" + second + "|" + currency;
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank()
        ? null
        : value.trim().toUpperCase(java.util.Locale.ROOT);
  }
}
