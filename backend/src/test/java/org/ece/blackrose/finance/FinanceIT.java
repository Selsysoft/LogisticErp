package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.ece.blackrose.AbstractIntegrationTest;
import org.ece.blackrose.finance.domain.ExchangeRate;
import org.ece.blackrose.finance.repository.FinanceRepositories.ExchangeRateRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

class FinanceIT extends AbstractIntegrationTest {

  private static final String DATE = "2026-11-04";

  @Autowired ExchangeRateRepository rates;

  @Test
  void usesLastKnownRateAndKeepsTlAmountAfterNewRateArrives() throws Exception {
    String t = tenantCode("known");
    String branch = branch(t);
    String account = account(t, "M1", "CUSTOMER");
    rates.save(new ExchangeRate("CHF", LocalDate.of(2026, 10, 30), new BigDecimal("50"), "TEST"));

    JsonNode tx = body(manual(t, account, branch, "DEBIT", "10", "CHF", null));
    assertThat(tx.get("rateDate").asText()).isEqualTo("2026-10-30");
    assertThat(tx.get("tlAmount").decimalValue()).isEqualByComparingTo("500");

    rates.save(new ExchangeRate("CHF", LocalDate.of(2026, 11, 3), new BigDecimal("80"), "TEST"));

    JsonNode balances = body(send(t, get("/api/v1/finance/accounts/" + account))).get("balances");
    assertBalance(balances, "CHF", "10", "500");
    JsonNode next = body(manual(t, account, branch, "DEBIT", "10", "CHF", null));
    assertThat(next.get("tlAmount").decimalValue()).isEqualByComparingTo("800");
  }

  @Test
  void accountBalanceIsCorrectPerCurrencyAndInTl() throws Exception {
    String t = tenantCode("bal");
    String branch = branch(t);
    String account = account(t, "M1", "CUSTOMER");

    manual(t, account, branch, "DEBIT", "1000", "TRY", null).andExpect(status().isCreated());
    manual(t, account, branch, "CREDIT", "250.50", "TRY", null).andExpect(status().isCreated());
    manual(t, account, branch, "DEBIT", "100", "USD", "40").andExpect(status().isCreated());

    JsonNode balances = body(send(t, get("/api/v1/finance/accounts/" + account))).get("balances");
    assertBalance(balances, "TRY", "749.50", "749.50");
    assertBalance(balances, "USD", "100", "4000");
  }

  @Test
  void foreignCurrencyWithoutRateIsRejectedAndKnownRateIsFrozen() throws Exception {
    String t = tenantCode("rate");
    String branch = branch(t);
    String account = account(t, "M1", "CUSTOMER");

    manual(t, account, branch, "DEBIT", "10", "GBP", null)
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("RATE_MISSING"));

    JsonNode tx = body(manual(t, account, branch, "DEBIT", "10.55", "GBP", "50.1234"));
    assertThat(tx.get("exchangeRate").decimalValue()).isEqualByComparingTo("50.1234");
    // 528.801... tenant kuralıyla (2 hane, HALF_UP) yuvarlanır.
    assertThat(tx.get("tlAmount").decimalValue()).isEqualByComparingTo("528.80");
  }

  @Test
  void reversalRestoresBalanceAndCannotRepeat() throws Exception {
    String t = tenantCode("rev");
    String branch = branch(t);
    String account = account(t, "M1", "CUSTOMER");
    String txId = body(manual(t, account, branch, "DEBIT", "500", "TRY", null)).get("id").asText();

    JsonNode first = body(reverse(t, "/api/v1/finance/accounts/transactions/" + txId + "/reverse"));
    JsonNode second =
        body(reverse(t, "/api/v1/finance/accounts/transactions/" + txId + "/reverse"));

    assertThat(second.get("id").asText()).isEqualTo(first.get("id").asText());
    JsonNode balances = body(send(t, get("/api/v1/finance/accounts/" + account))).get("balances");
    assertBalance(balances, "TRY", "0", "0");
    reverse(t, "/api/v1/finance/accounts/transactions/" + first.get("id").asText() + "/reverse")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("TRANSACTION_NOT_MANUAL"));
  }

  @Test
  void accountWithTransactionsCannotBeDeleted() throws Exception {
    String t = tenantCode("del");
    String branch = branch(t);
    String used = account(t, "M1", "CUSTOMER");
    String unused = account(t, "M2", "CUSTOMER");
    manual(t, used, branch, "DEBIT", "1", "TRY", null).andExpect(status().isCreated());

    send(t, delete("/api/v1/finance/accounts/" + used))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("ACCOUNT_HAS_TRANSACTIONS"));
    send(t, delete("/api/v1/finance/accounts/" + unused)).andExpect(status().isNoContent());
  }

  @Test
  void transferKeepsTotalAndBlocksOverdraftAndCurrencyMismatch() throws Exception {
    String t = tenantCode("trf");
    String branch = branch(t);
    String bank = fund(t, "B1", "BANK", "TRY", branch);
    String cash = fund(t, "K1", "CASH", "TRY", branch);
    String usd = fund(t, "B2", "BANK", "USD", branch);
    deposit(t, bank, "1000", "TRY");

    transfer(t, bank, cash, "400", "TRY", null).andExpect(status().isCreated());

    assertThat(fundBalance(t, bank)).isEqualByComparingTo("600");
    assertThat(fundBalance(t, cash)).isEqualByComparingTo("400");

    transfer(t, bank, cash, "601", "TRY", null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INSUFFICIENT_FUNDS"));
    transfer(t, bank, usd, "1", "TRY", null)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("CURRENCY_MISMATCH"));
    assertThat(fundBalance(t, bank)).isEqualByComparingTo("600");
    assertThat(fundBalance(t, usd)).isEqualByComparingTo("0");
  }

  @Test
  void transferWithSameIdempotencyKeyPostsOnce() throws Exception {
    String t = tenantCode("trfk");
    String branch = branch(t);
    String bank = fund(t, "B1", "BANK", "TRY", branch);
    String cash = fund(t, "K1", "CASH", "TRY", branch);
    deposit(t, bank, "1000", "TRY");

    transfer(t, bank, cash, "100", "TRY", "anahtar-1").andExpect(status().isCreated());
    transfer(t, bank, cash, "100", "TRY", "anahtar-1").andExpect(status().isCreated());

    assertThat(fundBalance(t, bank)).isEqualByComparingTo("900");
    assertThat(fundBalance(t, cash)).isEqualByComparingTo("100");
  }

  @Test
  void collectionAndPaymentUpdateAccountAndFund() throws Exception {
    String t = tenantCode("set");
    String branch = branch(t);
    String customer = account(t, "M1", "CUSTOMER");
    String supplier = account(t, "T1", "SUPPLIER");
    String bank = fund(t, "B1", "BANK", "TRY", branch);
    manual(t, customer, branch, "DEBIT", "1000", "TRY", null).andExpect(status().isCreated());
    manual(t, supplier, branch, "CREDIT", "300", "TRY", null).andExpect(status().isCreated());

    settlement(t, "collections", settlementBody("BANK", customer, branch, bank, "1000"), null)
        .andExpect(status().isCreated());
    settlement(t, "payments", settlementBody("BANK", supplier, branch, bank, "300"), null)
        .andExpect(status().isCreated());

    assertThat(fundBalance(t, bank)).isEqualByComparingTo("700");
    assertBalance(
        body(send(t, get("/api/v1/finance/accounts/" + customer))).get("balances"),
        "TRY",
        "0",
        "0");
    assertBalance(
        body(send(t, get("/api/v1/finance/accounts/" + supplier))).get("balances"),
        "TRY",
        "0",
        "0");
  }

  @Test
  void settlementWithSameKeyPostsOnceAndReversalRestores() throws Exception {
    String t = tenantCode("setk");
    String branch = branch(t);
    String customer = account(t, "M1", "CUSTOMER");
    String cash = fund(t, "K1", "CASH", "TRY", branch);
    Map<String, Object> request = settlementBody("CASH", customer, branch, cash, "200");

    String id =
        body(settlement(t, "collections", request, "tahsil-1").andExpect(status().isCreated()))
            .get("id")
            .asText();
    String again =
        body(settlement(t, "collections", request, "tahsil-1").andExpect(status().isCreated()))
            .get("id")
            .asText();

    assertThat(again).isEqualTo(id);
    assertThat(fundBalance(t, cash)).isEqualByComparingTo("200");

    reverse(t, "/api/v1/finance/settlements/" + id + "/reverse")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("REVERSED"));
    assertThat(fundBalance(t, cash)).isEqualByComparingTo("0");
    assertBalance(
        body(send(t, get("/api/v1/finance/accounts/" + customer))).get("balances"),
        "TRY",
        "0",
        "0");
  }

  @Test
  void settlementValidatesFundKindAndCurrency() throws Exception {
    String t = tenantCode("setv");
    String branch = branch(t);
    String customer = account(t, "M1", "CUSTOMER");
    String bank = fund(t, "B1", "BANK", "TRY", branch);
    String usdBank = fund(t, "B2", "BANK", "USD", branch);

    settlement(t, "collections", settlementBody("CASH", customer, branch, bank, "1"), null)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("FUND_KIND_MISMATCH"));
    settlement(t, "collections", settlementBody("BANK", customer, branch, usdBank, "1"), null)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("CURRENCY_MISMATCH"));
    assertThat(fundBalance(t, usdBank)).isEqualByComparingTo("0");
  }

  @Test
  void receivedCheckCollectedThroughBank() throws Exception {
    String t = tenantCode("chk");
    String branch = branch(t);
    String customer = account(t, "M1", "CUSTOMER");
    String bank = fund(t, "B1", "BANK", "TRY", branch);
    manual(t, customer, branch, "DEBIT", "500", "TRY", null).andExpect(status().isCreated());

    String check = receiveCheck(t, customer, branch, "C-100", "500");
    assertBalance(
        body(send(t, get("/api/v1/finance/accounts/" + customer))).get("balances"),
        "TRY",
        "0",
        "0");

    move(t, check, "AT_BANK", bank).andExpect(status().isOk());
    assertThat(fundBalance(t, bank)).isEqualByComparingTo("0");
    move(t, check, "COLLECTED", null)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("COLLECTED"));
    assertThat(fundBalance(t, bank)).isEqualByComparingTo("500");

    JsonNode history = body(send(t, get("/api/v1/finance/instruments/" + check + "/movements")));
    assertThat(history.size()).isEqualTo(3);
  }

  @Test
  void invalidCheckTransitionsAreRejected() throws Exception {
    String t = tenantCode("chkx");
    String branch = branch(t);
    String customer = account(t, "M1", "CUSTOMER");
    String bank = fund(t, "B1", "BANK", "TRY", branch);
    String cash = fund(t, "K1", "CASH", "TRY", branch);
    String check = receiveCheck(t, customer, branch, "C-200", "100");

    move(t, check, "COLLECTED", bank)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INSTRUMENT_INVALID_TRANSITION"));
    move(t, check, "PAID", bank).andExpect(status().isConflict());
    move(t, check, "BOUNCED", null).andExpect(status().isConflict());
    move(t, check, "ENDORSED", null)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("INSTRUMENT_ENDORSE_VIA_PAYMENT"));

    move(t, check, "AT_BANK", bank).andExpect(status().isOk());
    move(t, check, "COLLECTED", null).andExpect(status().isOk());
    // Tahsil edilmiş çek ciro edilemez, yeniden tahsil de edilemez.
    move(t, check, "ENDORSED", null).andExpect(status().isConflict());
    move(t, check, "COLLECTED_TO_CASH", cash).andExpect(status().isConflict());
    assertThat(fundBalance(t, bank)).isEqualByComparingTo("100");
    assertThat(fundBalance(t, cash)).isEqualByComparingTo("0");
  }

  @Test
  void bounceRestoresDebtsForDirectAndEndorsedChecks() throws Exception {
    String t = tenantCode("bnc");
    String branch = branch(t);
    String customer = account(t, "M1", "CUSTOMER");
    String supplier = account(t, "T1", "SUPPLIER");
    String bank = fund(t, "B1", "BANK", "TRY", branch);

    String direct = receiveCheck(t, customer, branch, "C-1", "100");
    move(t, direct, "AT_BANK", bank).andExpect(status().isOk());
    move(t, direct, "BOUNCED", null).andExpect(status().isOk());
    assertBalance(
        body(send(t, get("/api/v1/finance/accounts/" + customer))).get("balances"),
        "TRY",
        "0",
        "0");

    String endorsed = receiveCheck(t, customer, branch, "C-2", "300");
    Map<String, Object> payment = settlementBody("CHECK", supplier, branch, null, "300");
    payment.put("instrumentId", endorsed);
    settlement(t, "payments", payment, null).andExpect(status().isCreated());
    assertBalance(
        body(send(t, get("/api/v1/finance/accounts/" + supplier))).get("balances"),
        "TRY",
        "300",
        "300");

    move(t, endorsed, "BOUNCED", null).andExpect(status().isOk());
    assertBalance(
        body(send(t, get("/api/v1/finance/accounts/" + customer))).get("balances"),
        "TRY",
        "0",
        "0");
    assertBalance(
        body(send(t, get("/api/v1/finance/accounts/" + supplier))).get("balances"),
        "TRY",
        "0",
        "0");
  }

  @Test
  void issuedCheckReducesBankOnlyWhenPaid() throws Exception {
    String t = tenantCode("iss");
    String branch = branch(t);
    String supplier = account(t, "T1", "SUPPLIER");
    String bank = fund(t, "B1", "BANK", "TRY", branch);
    deposit(t, bank, "1000", "TRY");
    manual(t, supplier, branch, "CREDIT", "400", "TRY", null).andExpect(status().isCreated());

    Map<String, Object> payment = settlementBody("CHECK", supplier, branch, null, "400");
    payment.put("instrument", newCheck("V-1"));
    String id =
        body(settlement(t, "payments", payment, null).andExpect(status().isCreated()))
            .get("instrumentId")
            .asText();

    assertBalance(
        body(send(t, get("/api/v1/finance/accounts/" + supplier))).get("balances"),
        "TRY",
        "0",
        "0");
    assertThat(fundBalance(t, bank)).isEqualByComparingTo("1000");

    // Portföy durumları verilen çekte geçersizdir.
    move(t, id, "AT_BANK", bank).andExpect(status().isConflict());
    move(t, id, "PAID", bank).andExpect(status().isOk());
    assertThat(fundBalance(t, bank)).isEqualByComparingTo("600");
  }

  @Test
  void dailyReportFiltersByMultipleBranches() throws Exception {
    String t = tenantCode("day");
    String a = branch(t);
    String b = branch(t);
    String c = branch(t);
    String customer = account(t, "M1", "CUSTOMER");
    String cashA = fund(t, "K1", "CASH", "TRY", a);
    String cashB = fund(t, "K2", "CASH", "TRY", b);
    String cashC = fund(t, "K3", "CASH", "TRY", c);
    settlement(t, "collections", settlementBody("CASH", customer, a, cashA, "10"), null);
    settlement(t, "collections", settlementBody("CASH", customer, a, cashA, "15"), null);
    settlement(t, "collections", settlementBody("CASH", customer, b, cashB, "20"), null);
    settlement(t, "collections", settlementBody("CASH", customer, c, cashC, "40"), null);

    JsonNode filtered =
        body(
            send(
                t,
                get("/api/v1/finance/reports/daily")
                    .param("type", "COLLECTION")
                    .param("date", DATE)
                    .param("branchIds", a, b)));
    assertThat(filtered.get("rows").size()).isEqualTo(3);
    BigDecimal sum = BigDecimal.ZERO;
    for (JsonNode total : filtered.get("totals")) {
      sum = sum.add(total.get("total").decimalValue());
    }
    assertThat(sum).isEqualByComparingTo("45");

    JsonNode all =
        body(
            send(
                t,
                get("/api/v1/finance/reports/daily")
                    .param("type", "COLLECTION")
                    .param("date", DATE)));
    assertThat(all.get("rows").size()).isEqualTo(4);
  }

  @Test
  void unapprovedPlanCannotBePaid() throws Exception {
    String t = tenantCode("pln");
    allowSelfApproval(t);
    String branch = branch(t);
    String supplier = account(t, "T1", "SUPPLIER");
    String bank = fund(t, "B1", "BANK", "TRY", branch);
    deposit(t, bank, "1000", "TRY");
    String plan = plan(t, supplier, branch, "100", "TRY", "2026-11-10");

    pay(t, plan, bank)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("PLAN_NOT_APPROVED"));
    post(t, "/api/v1/finance/payment-plans/" + plan + "/submit", null).andExpect(status().isOk());
    pay(t, plan, bank).andExpect(status().isConflict());
    post(t, "/api/v1/finance/payment-plans/" + plan + "/reject", Map.of("note", " "))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("REJECT_REASON_REQUIRED"));
    post(t, "/api/v1/finance/payment-plans/" + plan + "/reject", Map.of("note", "eksik belge"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("REJECTED"))
        .andExpect(jsonPath("$.rejectNote").value("eksik belge"));
    pay(t, plan, bank).andExpect(status().isConflict());
    assertThat(fundBalance(t, bank)).isEqualByComparingTo("1000");

    post(t, "/api/v1/finance/payment-plans/" + plan + "/submit", null)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.rejectNote").isEmpty());
    post(t, "/api/v1/finance/payment-plans/" + plan + "/approve", Map.of())
        .andExpect(status().isOk());
    pay(t, plan, bank).andExpect(status().isOk());
    assertThat(fundBalance(t, bank)).isEqualByComparingTo("900");
    pay(t, plan, bank).andExpect(status().isConflict());
    assertThat(fundBalance(t, bank)).isEqualByComparingTo("900");

    JsonNode events = body(send(t, get("/api/v1/finance/payment-plans/" + plan + "/events")));
    assertThat(events.size()).isEqualTo(6);
    JsonNode rejected = events.get(2);
    assertThat(rejected.get("eventType").asText()).isEqualTo("REJECTED");
    assertThat(rejected.get("note").asText()).isEqualTo("eksik belge");
    assertThat(rejected.get("createdAt").asText()).isNotBlank();
  }

  @Test
  void postponeKeepsStatusAndRequiresLaterDate() throws Exception {
    String t = tenantCode("pst");
    String branch = branch(t);
    String supplier = account(t, "T1", "SUPPLIER");
    String plan = plan(t, supplier, branch, "100", "TRY", "2026-11-10");

    post(t, "/api/v1/finance/payment-plans/" + plan + "/postpone", Map.of("dueDate", "2026-11-09"))
        .andExpect(status().isBadRequest());
    post(t, "/api/v1/finance/payment-plans/" + plan + "/postpone", Map.of("dueDate", "2026-12-01"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.dueDate").value("2026-12-01"))
        .andExpect(jsonPath("$.status").value("DRAFT"));
  }

  @Test
  void heatmapGroupsAndAppliesDensityThresholds() throws Exception {
    String t = tenantCode("hm");
    String branch = branch(t);
    String supplier = account(t, "T1", "SUPPLIER");
    plan(t, supplier, branch, "50", "TRY", "2026-12-01");
    plan(t, supplier, branch, "70", "TRY", "2026-12-01");
    plan(t, supplier, branch, "500", "TRY", "2026-12-02");
    plan(t, supplier, branch, "5000", "TRY", "2026-12-15");
    plan(t, supplier, branch, "30", "USD", "2026-12-01");
    String cancelled = plan(t, supplier, branch, "99999", "TRY", "2026-12-03");
    post(t, "/api/v1/finance/payment-plans/" + cancelled + "/cancel", Map.of())
        .andExpect(status().isOk());
    send(
            t,
            put("/api/v1/finance/density-thresholds/TRY")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"low\":100,\"medium\":400,\"high\":1000}"))
        .andExpect(status().isOk());
    send(
            t,
            put("/api/v1/finance/density-thresholds/USD")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"low\":100,\"medium\":50,\"high\":1000}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("THRESHOLD_ORDER_INVALID"));

    JsonNode daily = heatmap(t, "DAY");
    Map<String, JsonNode> byKey = new HashMap<>();
    daily.forEach(c -> byKey.put(c.get("period").asText() + c.get("currency").asText(), c));
    assertThat(byKey).hasSize(4);
    assertThat(byKey.get("2026-12-01TRY").get("total").decimalValue()).isEqualByComparingTo("120");
    assertThat(byKey.get("2026-12-01TRY").get("count").asInt()).isEqualTo(2);
    assertThat(byKey.get("2026-12-01TRY").get("level").asText()).isEqualTo("MEDIUM");
    assertThat(byKey.get("2026-12-02TRY").get("level").asText()).isEqualTo("HIGH");
    assertThat(byKey.get("2026-12-15TRY").get("level").asText()).isEqualTo("VERY_HIGH");
    assertThat(byKey.get("2026-12-01USD").get("level").isNull()).isTrue();

    JsonNode monthly = heatmap(t, "MONTH");
    assertThat(monthly.size()).isEqualTo(2);
    JsonNode tryMonth = monthly.get(0);
    assertThat(tryMonth.get("period").asText()).isEqualTo("2026-12");
    assertThat(tryMonth.get("currency").asText()).isEqualTo("TRY");
    assertThat(tryMonth.get("total").decimalValue()).isEqualByComparingTo("5620");
  }

  @Test
  void dashboardShowsOverdueTodayAndPending() throws Exception {
    String t = tenantCode("dash");
    String branch = branch(t);
    String supplier = account(t, "T1", "SUPPLIER");
    plan(t, supplier, branch, "10", "TRY", "2026-11-01");
    plan(t, supplier, branch, "20", "TRY", DATE);
    String pending = plan(t, supplier, branch, "30", "TRY", "2026-11-08");
    plan(t, supplier, branch, "40", "TRY", "2026-12-20");
    post(t, "/api/v1/finance/payment-plans/" + pending + "/submit", null)
        .andExpect(status().isOk());

    JsonNode dashboard = body(send(t, get("/api/v1/finance/dashboard").param("today", DATE)));

    assertThat(dashboard.get("overdue").get(0).get("total").decimalValue())
        .isEqualByComparingTo("10");
    assertThat(dashboard.get("dueToday").get(0).get("total").decimalValue())
        .isEqualByComparingTo("20");
    assertThat(dashboard.get("dueThisWeek").get(0).get("total").decimalValue())
        .isEqualByComparingTo("50");
    assertThat(dashboard.get("pendingApproval").asLong()).isEqualTo(1);
    assertThat(dashboard.get("upcoming").size()).isEqualTo(2);
  }

  @Test
  void statementHasOpeningAndRunningBalance() throws Exception {
    String t = tenantCode("stm");
    String branch = branch(t);
    String account = account(t, "M1", "CUSTOMER");
    manualOn(t, account, branch, "DEBIT", "100", "2026-10-01");
    manualOn(t, account, branch, "DEBIT", "50", "2026-11-01");
    manualOn(t, account, branch, "CREDIT", "30", "2026-11-02");
    manualOn(t, account, branch, "DEBIT", "1000", "2026-12-01");

    JsonNode statement =
        body(
            send(
                t,
                get("/api/v1/finance/accounts/" + account + "/statement")
                    .param("currency", "TRY")
                    .param("from", "2026-11-01")
                    .param("to", "2026-11-30")));

    assertThat(statement.get("openingBalance").decimalValue()).isEqualByComparingTo("100");
    assertThat(statement.get("lines").size()).isEqualTo(2);
    assertThat(statement.get("lines").get(0).get("balance").decimalValue())
        .isEqualByComparingTo("150");
    assertThat(statement.get("lines").get(1).get("balance").decimalValue())
        .isEqualByComparingTo("120");
  }

  @Test
  void agingAppliesPaymentsToOldestOpenItems() throws Exception {
    String t = tenantCode("age");
    String branch = branch(t);
    String customer = account(t, "M1", "CUSTOMER");
    account(t, "M2", "CUSTOMER");
    manualOn(t, customer, branch, "DEBIT", "100", "2026-07-01");
    manualOn(t, customer, branch, "DEBIT", "200", "2026-09-20");
    manualOn(t, customer, branch, "DEBIT", "300", "2026-10-20");
    manualOn(t, customer, branch, "CREDIT", "150", "2026-10-25");

    JsonNode aging =
        body(
            send(
                t,
                get("/api/v1/finance/reports/aging")
                    .param("type", "RECEIVABLE")
                    .param("asOf", DATE)));

    assertThat(aging.size()).isEqualTo(1);
    JsonNode row = aging.get(0);
    assertThat(row.get("days0To30").decimalValue()).isEqualByComparingTo("300");
    assertThat(row.get("days31To60").decimalValue()).isEqualByComparingTo("150");
    assertThat(row.get("days61To90").decimalValue()).isEqualByComparingTo("0");
    assertThat(row.get("daysOver90").decimalValue()).isEqualByComparingTo("0");
    assertThat(row.get("total").decimalValue()).isEqualByComparingTo("450");
  }

  @Test
  void invoiceCancelReversesDebtButPaidInvoiceCannotBeCancelled() throws Exception {
    String t = tenantCode("inv");
    allowSelfApproval(t);
    String branch = branch(t);
    String supplier = account(t, "T1", "SUPPLIER");
    String bank = fund(t, "B1", "BANK", "TRY", branch);
    deposit(t, bank, "5000", "TRY");

    String open = invoice(t, supplier, branch, "F-1", "100", "20");
    assertBalance(
        body(send(t, get("/api/v1/finance/accounts/" + supplier))).get("balances"),
        "TRY",
        "-120",
        "-120");
    reverse(t, "/api/v1/finance/purchase-invoices/" + open + "/cancel")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("CANCELLED"));
    assertBalance(
        body(send(t, get("/api/v1/finance/accounts/" + supplier))).get("balances"),
        "TRY",
        "0",
        "0");

    send(
            t,
            MockMvcRequestBuilders.post("/api/v1/finance/purchase-invoices")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(invoiceBody(supplier, branch, "F-1", "100", "20"))))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INVOICE_NUMBER_TAKEN"));

    String paid = invoice(t, supplier, branch, "F-2", "100", "20");
    String plan = onlyOpenPlan(t);
    post(t, "/api/v1/finance/payment-plans/" + plan + "/submit", null).andExpect(status().isOk());
    post(t, "/api/v1/finance/payment-plans/" + plan + "/approve", Map.of())
        .andExpect(status().isOk());
    pay(t, plan, bank).andExpect(status().isOk());
    reverse(t, "/api/v1/finance/purchase-invoices/" + paid + "/cancel")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INVOICE_PAID"));
  }

  @Test
  void selfApprovalIsBlockedByDefaultAndAllowedWhenTurnedOn() throws Exception {
    String t = tenantCode("self");
    String branch = branch(t);
    String supplier = account(t, "T1", "SUPPLIER");
    send(t, get("/api/v1/finance/settings"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.allowSelfApproval").value(false));

    String blocked = plan(t, supplier, branch, "200", "TRY", "2026-11-10");
    post(t, "/api/v1/finance/payment-plans/" + blocked + "/submit", null)
        .andExpect(status().isOk());
    post(t, "/api/v1/finance/payment-plans/" + blocked + "/approve", Map.of())
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("PLAN_SELF_APPROVAL"));

    String approver = inviteAndLogin(t, "onay@" + t + ".test", "FINANCE_SUPER");
    mvc.perform(
            MockMvcRequestBuilders.post("/api/v1/finance/payment-plans/" + blocked + "/approve")
                .with(tenant(t))
                .with(bearer(approver))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("APPROVED"));

    allowSelfApproval(t);
    String allowed = plan(t, supplier, branch, "100", "TRY", "2026-11-10");
    post(t, "/api/v1/finance/payment-plans/" + allowed + "/submit", null)
        .andExpect(status().isOk());
    post(t, "/api/v1/finance/payment-plans/" + allowed + "/approve", Map.of())
        .andExpect(status().isOk());
  }

  /** Tek kişilik firma gibi: planı oluşturan kendisi onaylar. */
  private void allowSelfApproval(String t) throws Exception {
    send(
            t,
            put("/api/v1/finance/settings")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"allowSelfApproval\":true}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.allowSelfApproval").value(true));
  }

  /** Faz 2 uçtan uca kabul senaryosu. */
  @Test
  void supplierInvoiceToBankPaymentClosesAccount() throws Exception {
    String t = tenantCode("e2e");
    allowSelfApproval(t);
    String branch = branch(t);
    String supplier = account(t, "T1", "SUPPLIER");
    String bank = fund(t, "B1", "BANK", "TRY", branch);
    deposit(t, bank, "10000", "TRY");

    invoice(t, supplier, branch, "F-100", "1000", "200");
    assertBalance(
        body(send(t, get("/api/v1/finance/accounts/" + supplier))).get("balances"),
        "TRY",
        "-1200",
        "-1200");
    String plan = onlyOpenPlan(t);

    post(t, "/api/v1/finance/payment-plans/" + plan + "/submit", null)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("PENDING"));
    post(t, "/api/v1/finance/payment-plans/" + plan + "/approve", Map.of("note", "uygun"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("APPROVED"));
    pay(t, plan, bank).andExpect(status().isOk()).andExpect(jsonPath("$.planId").value(plan));

    JsonNode balances = body(send(t, get("/api/v1/finance/accounts/" + supplier))).get("balances");
    assertBalance(balances, "TRY", "0", "0");
    assertThat(fundBalance(t, bank)).isEqualByComparingTo("8800");
    assertThat(
            body(send(t, get("/api/v1/finance/payment-plans").param("status", "PAID")))
                .get("totalElements")
                .asInt())
        .isEqualTo(1);
  }

  @Test
  void permissionsProtectApprovalAndDefinitions() throws Exception {
    String t = tenantCode("perm");
    String branch = branch(t);
    String supplier = account(t, "T1", "SUPPLIER");
    String plan = plan(t, supplier, branch, "100", "TRY", "2026-11-10");
    post(t, "/api/v1/finance/payment-plans/" + plan + "/submit", null).andExpect(status().isOk());

    String financeToken = inviteAndLogin(t, "finans@" + t + ".test", "FINANCE");
    String accountingToken = inviteAndLogin(t, "muhasebe@" + t + ".test", "ACCOUNTING");

    mvc.perform(
            MockMvcRequestBuilders.post("/api/v1/finance/payment-plans/" + plan + "/approve")
                .with(tenant(t))
                .with(bearer(financeToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/v1/finance/accounts").with(tenant(t)).with(bearer(accountingToken)))
        .andExpect(status().isOk());
    mvc.perform(
            MockMvcRequestBuilders.post("/api/v1/finance/accounts/" + supplier + "/transactions")
                .with(tenant(t))
                .with(bearer(accountingToken))
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(manualBody(branch, "DEBIT", "1", "TRY", null, DATE))))
        .andExpect(status().isForbidden());
  }

  @Test
  void financeDataIsIsolatedBetweenTenants() throws Exception {
    String a = tenantCode("isoa");
    String b = tenantCode("isob");
    String account = account(a, "M1", "CUSTOMER");

    assertThat(body(send(a, get("/api/v1/finance/accounts"))).get("totalElements").asInt())
        .isEqualTo(1);
    assertThat(body(send(b, get("/api/v1/finance/accounts"))).get("totalElements").asInt())
        .isEqualTo(0);
    send(b, get("/api/v1/finance/accounts/" + account)).andExpect(status().isNotFound());
  }

  // Yardımcılar

  @Test
  void fonGuncellenirHareketliFonSilinmezElleVeVirmanHareketiTersCevrilir() throws Exception {
    String t = tenantCode("fund");
    String branch = branch(t);
    String bank = fund(t, "B1", "BANK", "TRY", branch);
    String cash = fund(t, "K1", "CASH", "TRY", branch);
    String unused = fund(t, "K2", "CASH", "TRY", branch);

    send(
            t,
            put("/api/v1/finance/funds/" + bank)
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    json.writeValueAsString(
                        Map.of(
                            "name", "Ana Banka",
                            "branchId", branch,
                            "bankName", "Örnek Bankası",
                            "iban", "TR000000000000000000000001",
                            "allowNegative", false))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("Ana Banka"));

    String deposit =
        created(
            post(
                t,
                "/api/v1/finance/funds/" + bank + "/transactions",
                Map.of("direction", "IN", "money", money("1000", "TRY"), "date", DATE)));
    transfer(t, bank, cash, "300", "TRY", null).andExpect(status().isCreated());

    send(t, delete("/api/v1/finance/funds/" + bank))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("FUND_HAS_TRANSACTIONS"));
    send(t, delete("/api/v1/finance/funds/" + unused)).andExpect(status().isNoContent());
    assertThat(body(send(t, get("/api/v1/finance/funds"))).findValuesAsText("id"))
        .doesNotContain(unused);

    // Ekstre: açılış 0, giriş ve virman çıkışı sırasıyla.
    JsonNode statement =
        body(
            send(
                    t,
                    get("/api/v1/finance/funds/" + bank + "/statement")
                        .param("from", DATE)
                        .param("to", DATE))
                .andExpect(status().isOk()));
    assertThat(statement.get("lines").findValuesAsText("sourceType"))
        .containsExactly("MANUAL", "TRANSFER");
    String transferLine = statement.get("lines").get(1).get("id").asText();

    // Virmanın bir bacağını ters çevirmek iki hesabı da eski haline getirir.
    reverse(t, "/api/v1/finance/funds/transactions/" + transferLine + "/reverse")
        .andExpect(status().isOk());
    assertThat(fundBalance(t, bank)).isEqualByComparingTo("1000");
    assertThat(fundBalance(t, cash)).isEqualByComparingTo("0");

    JsonNode reversal =
        body(
            reverse(t, "/api/v1/finance/funds/transactions/" + deposit + "/reverse")
                .andExpect(status().isOk()));
    assertThat(fundBalance(t, bank)).isEqualByComparingTo("0");
    reverse(t, "/api/v1/finance/funds/transactions/" + reversal.get("id").asText() + "/reverse")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("TRANSACTION_NOT_MANUAL"));
    reverse(t, "/api/v1/finance/funds/transactions/" + java.util.UUID.randomUUID() + "/reverse")
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("TRANSACTION_NOT_FOUND"));
  }

  @Test
  void giderTipiVeKalemiTanimlanirListelerBosDoner() throws Exception {
    String t = tenantCode("defs");
    String type =
        created(post(t, "/api/v1/finance/expense-types", Map.of("code", "YAKIT", "name", "Yakıt")));
    post(
            t,
            "/api/v1/finance/expense-items",
            Map.of("expenseTypeId", java.util.UUID.randomUUID(), "code", "X", "name", "X"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("EXPENSE_TYPE_NOT_FOUND"));
    String item =
        created(
            post(
                t,
                "/api/v1/finance/expense-items",
                Map.of("expenseTypeId", type, "code", "MOTORIN", "name", "Motorin")));
    assertThat(body(send(t, get("/api/v1/finance/expense-types"))).findValuesAsText("id"))
        .contains(type);
    JsonNode items = body(send(t, get("/api/v1/finance/expense-items")));
    assertThat(items.findValuesAsText("id")).contains(item);

    // Yeni firmada çek, tahsilat ve alış faturası listeleri boş; eşikler listelenir.
    assertThat(body(send(t, get("/api/v1/finance/instruments"))).get("content")).isEmpty();
    assertThat(body(send(t, get("/api/v1/finance/collections"))).get("content")).isEmpty();
    assertThat(body(send(t, get("/api/v1/finance/purchase-invoices"))).get("content")).isEmpty();
    send(t, get("/api/v1/finance/density-thresholds")).andExpect(status().isOk());
    send(t, get("/api/v1/finance/exchange-rates").param("date", DATE)).andExpect(status().isOk());
  }

  private String tenantCode(String prefix) throws Exception {
    String code = "fin-" + prefix;
    createTenant(code);
    return code;
  }

  private ResultActions send(String tenantCode, MockHttpServletRequestBuilder request)
      throws Exception {
    return mvc.perform(request.with(asOwner(tenantCode)));
  }

  private ResultActions post(String tenantCode, String path, Object body) throws Exception {
    MockHttpServletRequestBuilder request =
        org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(path);
    if (body != null) {
      request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
    }
    return send(tenantCode, request);
  }

  private String created(ResultActions actions) throws Exception {
    return body(actions.andExpect(status().isCreated())).get("id").asText();
  }

  private String branch(String t) throws Exception {
    String code = "S" + System.nanoTime();
    return created(post(t, "/api/v1/organization/branches", Map.of("code", code, "name", "Şube")));
  }

  private String account(String t, String code, String type) throws Exception {
    return created(
        post(
            t,
            "/api/v1/finance/accounts",
            Map.of("code", code, "name", code + " Ltd", "type", type)));
  }

  private String fund(String t, String code, String kind, String currency, String branch)
      throws Exception {
    return created(
        post(
            t,
            "/api/v1/finance/funds",
            Map.of(
                "code",
                code,
                "name",
                code,
                "kind",
                kind,
                "currency",
                currency,
                "branchId",
                branch)));
  }

  private static Map<String, Object> money(String amount, String currency) {
    return Map.of("amount", amount, "currency", currency);
  }

  private void deposit(String t, String fund, String amount, String currency) throws Exception {
    post(
            t,
            "/api/v1/finance/funds/" + fund + "/transactions",
            Map.of("direction", "IN", "money", money(amount, currency), "date", DATE))
        .andExpect(status().isCreated());
  }

  private Map<String, Object> manualBody(
      String branch, String direction, String amount, String currency, String rate, String date) {
    Map<String, Object> body = new HashMap<>();
    body.put("branchId", branch);
    body.put("direction", direction);
    body.put("money", money(amount, currency));
    body.put("date", date);
    if (rate != null) {
      body.put("exchangeRate", rate);
    }
    return body;
  }

  private ResultActions manual(
      String t,
      String account,
      String branch,
      String direction,
      String amount,
      String currency,
      String rate)
      throws Exception {
    return post(
        t,
        "/api/v1/finance/accounts/" + account + "/transactions",
        manualBody(branch, direction, amount, currency, rate, DATE));
  }

  private void manualOn(
      String t, String account, String branch, String direction, String amount, String date)
      throws Exception {
    post(
            t,
            "/api/v1/finance/accounts/" + account + "/transactions",
            manualBody(branch, direction, amount, "TRY", null, date))
        .andExpect(status().isCreated());
  }

  private ResultActions reverse(String t, String path) throws Exception {
    return post(t, path, Map.of("date", DATE, "description", "iptal"));
  }

  private ResultActions transfer(
      String t, String from, String to, String amount, String currency, String key)
      throws Exception {
    MockHttpServletRequestBuilder request =
        org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(
                "/api/v1/finance/funds/transfers")
            .contentType(MediaType.APPLICATION_JSON)
            .content(
                json.writeValueAsString(
                    Map.of(
                        "fromFundId", from,
                        "toFundId", to,
                        "money", money(amount, currency),
                        "date", DATE)));
    if (key != null) {
      request.header("Idempotency-Key", key);
    }
    return send(t, request);
  }

  private BigDecimal fundBalance(String t, String fund) throws Exception {
    for (JsonNode row : body(send(t, get("/api/v1/finance/funds")))) {
      if (fund.equals(row.get("id").asText())) {
        return row.get("balance").decimalValue();
      }
    }
    throw new AssertionError("Hesap yok: " + fund);
  }

  private Map<String, Object> settlementBody(
      String method, String account, String branch, String fund, String amount) {
    Map<String, Object> body = new HashMap<>();
    body.put("method", method);
    body.put("accountId", account);
    body.put("branchId", branch);
    if (fund != null) {
      body.put("fundAccountId", fund);
    }
    body.put("money", money(amount, "TRY"));
    body.put("date", DATE);
    return body;
  }

  private ResultActions settlement(String t, String resource, Map<String, Object> body, String key)
      throws Exception {
    MockHttpServletRequestBuilder request =
        org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(
                "/api/v1/finance/" + resource)
            .contentType(MediaType.APPLICATION_JSON)
            .content(json.writeValueAsString(body));
    if (key != null) {
      request.header("Idempotency-Key", key);
    }
    return send(t, request);
  }

  private static Map<String, Object> newCheck(String number) {
    return Map.of(
        "kind", "CHECK", "number", number, "bankName", "Test Bank", "dueDate", "2027-01-15");
  }

  private String receiveCheck(
      String t, String customer, String branch, String number, String amount) throws Exception {
    Map<String, Object> body = settlementBody("CHECK", customer, branch, null, amount);
    body.put("instrument", newCheck(number));
    return body(settlement(t, "collections", body, null).andExpect(status().isCreated()))
        .get("instrumentId")
        .asText();
  }

  private ResultActions move(String t, String instrument, String target, String fund)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("toStatus", target);
    body.put("date", DATE);
    if (fund != null) {
      body.put("fundAccountId", fund);
    }
    return post(t, "/api/v1/finance/instruments/" + instrument + "/transition", body);
  }

  private String plan(
      String t, String account, String branch, String amount, String currency, String due)
      throws Exception {
    return created(
        post(
            t,
            "/api/v1/finance/payment-plans",
            Map.of(
                "accountId", account,
                "branchId", branch,
                "money", money(amount, currency),
                "dueDate", due)));
  }

  private ResultActions pay(String t, String plan, String fund) throws Exception {
    return post(
        t,
        "/api/v1/finance/payment-plans/" + plan + "/pay",
        Map.of("method", "BANK", "fundAccountId", fund, "date", DATE));
  }

  private String onlyOpenPlan(String t) throws Exception {
    return body(send(t, get("/api/v1/finance/payment-plans").param("status", "DRAFT")))
        .get("content")
        .get(0)
        .get("id")
        .asText();
  }

  private JsonNode heatmap(String t, String period) throws Exception {
    return body(
        send(
            t,
            get("/api/v1/finance/payment-plans/heatmap")
                .param("from", "2026-12-01")
                .param("to", "2026-12-31")
                .param("period", period)));
  }

  private Map<String, Object> invoiceBody(
      String account, String branch, String number, String net, String vat) {
    return Map.of(
        "accountId", account,
        "branchId", branch,
        "number", number,
        "invoiceDate", DATE,
        "dueDate", "2026-12-04",
        "net", money(net, "TRY"),
        "vat", money(vat, "TRY"));
  }

  private String invoice(
      String t, String account, String branch, String number, String net, String vat)
      throws Exception {
    return created(
        post(
            t,
            "/api/v1/finance/purchase-invoices",
            invoiceBody(account, branch, number, net, vat)));
  }

  private String inviteAndLogin(String t, String email, String roleCode) throws Exception {
    String roleId = null;
    for (JsonNode role : body(send(t, get("/api/v1/identity/roles")))) {
      if (roleCode.equals(role.get("code").asText())) {
        roleId = role.get("id").asText();
      }
    }
    post(
            t,
            "/api/v1/identity/users",
            Map.of("email", email, "fullName", "Test", "roleIds", List.of(roleId)))
        .andExpect(status().isCreated());
    return acceptInviteAndLogin(t, email);
  }

  private static void assertBalance(
      JsonNode balances, String currency, String balance, String tlBalance) {
    for (JsonNode row : balances) {
      if (currency.equals(row.get("currency").asText())) {
        assertThat(row.get("balance").decimalValue()).isEqualByComparingTo(balance);
        assertThat(row.get("tlBalance").decimalValue()).isEqualByComparingTo(tlBalance);
        return;
      }
    }
    throw new AssertionError("Para birimi yok: " + currency);
  }
}
