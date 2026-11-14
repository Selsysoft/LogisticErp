package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Banka/kasa hareket merkezi (12.2_TASARIM §3.2.6–§3.2.8, §6.2 FundTransactionQueryIT): muhasebe
 * tipi, yürüyen bakiye, özet, tarih/sayfa sınırları, personel gizliliği, kapsam, hareket detayı ve
 * FIFO faaliyet raporu.
 */
class FundTransactionQueryIT extends AccountTestSupport {

  private static final String TX = FINANCE + "/funds/transactions";

  @Test
  void muhasebeTipleriVeKaynakRotasi() throws Exception {
    World w = world("ftq");
    Map<String, Object> bankBody = fundBody("BNK", "BANK", w.a1());
    bankBody.put("openingBalance", "100");
    bankBody.put("openingDate", TODAY.minusDays(5).toString());
    bankBody.put("accountNo", "99990001");
    bankBody.put("bankBranchName", "Merkez");
    String bank = id(sendJson(w.t(), null, post(FINANCE + "/funds"), bankBody));

    // Manuel (kategori), ters kayıt.
    String expense = manual(w, bank, "OUT", "10", TODAY, "EXPENSE", "Kira gideri");
    String income = manual(w, bank, "IN", "20", TODAY, "INCOME", "Faiz geliri");
    String other = manual(w, bank, "IN", "5", TODAY, null, "Diğer giriş");
    String reversal =
        body(sendJson(
                    w.t(),
                    null,
                    post(TX + "/" + expense + "/reverse"),
                    Map.of("date", TODAY.toString(), "description", "Kira iptal"))
                .andExpect(status().isOk()))
            .get("id")
            .asText();

    // Ödeme/tahsilat: cari ödeme, cari tahsilat, doğrudan gider.
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    UUID customer = account(w, AccountType.CUSTOMER, null);
    String payment = settle(w, "payments", "CASH", supplier, w.a1(), w.fundA1(), "30", null);
    String collection = settle(w, "collections", "CASH", customer, w.a1(), w.fundA1(), "25", null);
    String type =
        id(
            sendJson(
                w.t(),
                null,
                post(FINANCE + "/expense-types"),
                Map.of("code", "GT1", "name", "Genel")));
    String item =
        id(
            sendJson(
                w.t(),
                null,
                post(FINANCE + "/expense-items"),
                Map.of("expenseTypeId", type, "code", "GK1", "name", "Kırtasiye")));
    String directExpense = settle(w, "payments", "CASH", null, w.a1(), w.fundA1(), "7", item);

    // Çek tahsili (kasaya) ve senet ödemesi (bankadan).
    Map<String, Object> checkBody = settlementBody("CHECK", customer, w.a1(), null, "40", null);
    checkBody.put(
        "instrument",
        Map.of("kind", "CHECK", "number", "Q-1", "dueDate", TODAY.plusDays(30).toString()));
    String check =
        body(sendJson(w.t(), null, post(FINANCE + "/collections"), checkBody)
                .andExpect(status().isCreated()))
            .get("instrumentId")
            .asText();
    transition(w, check, "COLLECTED_TO_CASH", w.fundA1());
    Map<String, Object> noteBody = settlementBody("CHECK", supplier, w.a1(), null, "12", null);
    noteBody.put(
        "instrument",
        Map.of("kind", "NOTE", "number", "N-1", "dueDate", TODAY.plusDays(30).toString()));
    String note =
        body(sendJson(w.t(), null, post(FINANCE + "/payments"), noteBody)
                .andExpect(status().isCreated()))
            .get("instrumentId")
            .asText();
    transition(w, note, "PAID", bank);

    // Transfer merkezi (B3 servisi yokken SQL ile): EFT + komisyon; eski TRANSFER çifti.
    UUID transfer = UUID.randomUUID();
    jdbc.update(
        ("insert into \"%s\".fund_transfer (id, company_id, code, transfer_type, transfer_date,"
                + " source_fund_id, source_amount, source_currency, target_fund_id,"
                + " target_amount, target_currency, created_by, created_at, updated_by,"
                + " updated_at) values (?, ?, 'VRM-T1', 'EFT', ?, ?, 40, 'TRY', ?, 40, 'TRY',"
                + " 'test', now(), 'test', now())")
            .formatted(w.schema()),
        transfer,
        w.companyAId(),
        TODAY,
        UUID.fromString(bank),
        UUID.fromString(w.fundA1()));
    UUID transferOut = insertTx(w, bank, "OUT", "40", TODAY, "FUND_TRANSFER", transfer, null);
    UUID transferIn = insertTx(w, w.fundA1(), "IN", "40", TODAY, "FUND_TRANSFER", transfer, null);
    UUID cost = UUID.randomUUID();
    jdbc.update(
        ("insert into \"%s\".fund_transfer_cost (id, transfer_id, company_id, cost_kind,"
                + " fund_account_id, amount, currency, created_by, created_at, updated_by,"
                + " updated_at) values (?, ?, ?, 'COMMISSION', ?, 2, 'TRY', 'test', now(),"
                + " 'test', now())")
            .formatted(w.schema()),
        cost,
        transfer,
        w.companyAId(),
        UUID.fromString(bank));
    UUID costTx = insertTx(w, bank, "OUT", "2", TODAY, "FUND_TRANSFER_COST", cost, "COMMISSION");
    UUID legacy = UUID.randomUUID();
    UUID legacyOut = insertTx(w, bank, "OUT", "3", TODAY, "TRANSFER", legacy, null);

    // Şirketler arası virman: A'da ödeme + B'de tahsilat, SQL ile bağlanır.
    String icPayment = settle(w, "payments", "CASH", supplier, w.a1(), w.fundA1(), "15", null);
    String icCollection =
        settle(w, "collections", "CASH", customer, w.b1(), w.fundB1(), "15", null);
    UUID intercompany = UUID.randomUUID();
    jdbc.update(
        ("insert into \"%s\".intercompany_transfer (id, code, transfer_type, reason_type,"
                + " transfer_date, from_company_id, to_company_id, from_branch_id, to_branch_id,"
                + " from_fund_id, to_fund_id, amount, currency, payment_settlement_id,"
                + " collection_settlement_id, created_by, created_at, updated_by, updated_at)"
                + " values (?, 'SVR-T1', 'EFT', 'DEBT_PAID', ?, ?, ?, ?, ?, ?, ?, 15, 'TRY', ?, ?,"
                + " 'test', now(), 'test', now())")
            .formatted(w.schema()),
        intercompany,
        TODAY,
        w.companyAId(),
        w.companyBId(),
        UUID.fromString(w.a1()),
        UUID.fromString(w.b1()),
        UUID.fromString(w.fundA1()),
        UUID.fromString(w.fundB1()),
        UUID.fromString(icPayment),
        UUID.fromString(icCollection));

    Map<String, JsonNode> rows = byId(search(w, null, range(TODAY.minusDays(10), TODAY)));
    assertThat(type(rows, expense)).isEqualTo("EXPENSE");
    assertThat(rows.get(expense).get("category").asText()).isEqualTo("EXPENSE");
    assertThat(rows.get(expense).get("reversed").asBoolean()).isTrue();
    assertThat(type(rows, reversal)).isEqualTo("EXPENSE");
    assertThat(rows.get(reversal).get("reversal").asBoolean()).isTrue();
    assertThat(type(rows, income)).isEqualTo("INCOME");
    assertThat(type(rows, other)).isEqualTo("OTHER");
    assertThat(type(rows, fundTx(w, "FUND_OPENING", null, bank))).isEqualTo("OPENING");
    String paymentTx = fundTx(w, "SETTLEMENT", payment, null);
    assertThat(type(rows, paymentTx)).isEqualTo("ACCOUNT_PAYMENT");
    assertThat(rows.get(paymentTx).get("accountId").asText()).isEqualTo(supplier.toString());
    assertThat(rows.get(paymentTx).get("accountCode").asText()).startsWith("C");
    assertThat(type(rows, fundTx(w, "SETTLEMENT", collection, null)))
        .isEqualTo("ACCOUNT_COLLECTION");
    String directTx = fundTx(w, "SETTLEMENT", directExpense, null);
    assertThat(type(rows, directTx)).isEqualTo("EXPENSE");
    assertThat(rows.get(directTx).get("accountId").isNull()).isTrue();
    assertThat(type(rows, instrumentTx(w, check))).isEqualTo("CHECK_COLLECTION");
    assertThat(type(rows, instrumentTx(w, note))).isEqualTo("NOTE_PAYMENT");
    assertThat(type(rows, transferOut.toString())).isEqualTo("EFT");
    assertThat(rows.get(transferIn.toString()).get("transferCode").asText()).isEqualTo("VRM-T1");
    assertThat(type(rows, costTx.toString())).isEqualTo("TRANSFER_COST");
    assertThat(rows.get(costTx.toString()).get("transferCode").asText()).isEqualTo("VRM-T1");
    assertThat(type(rows, legacyOut.toString())).isEqualTo("LEGACY_TRANSFER");
    String icOut = fundTx(w, "SETTLEMENT", icPayment, null);
    String icIn = fundTx(w, "SETTLEMENT", icCollection, null);
    assertThat(type(rows, icOut)).isEqualTo("INTERCOMPANY");
    assertThat(type(rows, icIn)).isEqualTo("INTERCOMPANY");
    assertThat(rows.get(icIn).get("transferCode").asText()).isEqualTo("SVR-T1");
    assertThat(rows.get(icIn).get("companyId").asText()).isEqualTo(w.companyB());
    assertThat(rows.get(expense).get("fundCode").asText()).isEqualTo("BNK");
    assertThat(rows.get(expense).get("kind").asText()).isEqualTo("BANK");
    assertThat(rows.get(expense).get("accountType").asText()).isEqualTo("DEMAND");
    assertThat(rows.get(expense).get("branchId").asText()).isEqualTo(w.a1());

    // Muhasebe tipi, yön, tür ve arama süzgeçleri.
    assertThat(
            search(w, null, range(TODAY.minusDays(10), TODAY).param("accountingType", "EXPENSE"))
                .get("content")
                .findValuesAsText("id"))
        .containsExactlyInAnyOrder(expense, reversal, directTx);
    assertThat(
            search(
                    w,
                    null,
                    range(TODAY.minusDays(10), TODAY)
                        .param("accountingType", "EFT", "TRANSFER_COST"))
                .get("totalElements")
                .asLong())
        .isEqualTo(3);
    JsonNode bankIn =
        search(
            w,
            null,
            range(TODAY.minusDays(10), TODAY).param("kind", "BANK").param("direction", "IN"));
    bankIn
        .get("content")
        .forEach(
            r -> {
              assertThat(r.get("direction").asText()).isEqualTo("IN");
              assertThat(r.get("kind").asText()).isEqualTo("BANK");
            });
    // Açılış, gelir, diğer ve giderin tersi.
    assertThat(bankIn.get("totalElements").asLong()).isEqualTo(4);
    assertThat(
            search(w, null, range(TODAY.minusDays(10), TODAY).param("q", "vrm-t1"))
                .get("totalElements")
                .asLong())
        .isEqualTo(3);
    assertThat(
            search(w, null, range(TODAY.minusDays(10), TODAY).param("q", "kira"))
                .get("content")
                .findValuesAsText("id"))
        .containsExactlyInAnyOrder(expense, reversal);
    assertThat(
            search(w, null, range(TODAY.minusDays(10), TODAY).param("q", "%"))
                .get("totalElements")
                .asLong())
        .isZero();
    assertThat(
            search(w, null, range(TODAY.minusDays(10), TODAY).param("currency", "usd"))
                .get("totalElements")
                .asLong())
        .isZero();

    // Hareket detayı: hesap (maskeli) ve kaynak rotası.
    JsonNode settlementDetail = detail(w, paymentTx);
    assertThat(settlementDetail.get("accountingType").asText()).isEqualTo("ACCOUNT_PAYMENT");
    assertThat(settlementDetail.get("source").get("kind").asText()).isEqualTo("SETTLEMENT");
    assertThat(settlementDetail.get("source").get("id").asText()).isEqualTo(payment);
    assertThat(settlementDetail.get("source").get("route").asText())
        .isEqualTo("/finance/settlements");
    JsonNode transferDetail = detail(w, costTx.toString());
    assertThat(transferDetail.get("source").get("kind").asText()).isEqualTo("FUND_TRANSFER_COST");
    assertThat(transferDetail.get("source").get("id").asText()).isEqualTo(transfer.toString());
    assertThat(transferDetail.get("source").get("route").asText())
        .isEqualTo(
            "/zto-finans/transfer-merkezi?tab=transfers&q=VRM-T1&from=" + TODAY + "&to=" + TODAY);
    assertThat(transferDetail.get("fund").get("accountNo").asText()).isEqualTo("****0001");
    assertThat(transferDetail.get("fund").get("bankBranchName").asText()).isEqualTo("Merkez");
    assertThat(detail(w, transferOut.toString()).get("source").get("code").asText())
        .isEqualTo("VRM-T1");
    JsonNode icDetail = detail(w, icIn);
    assertThat(icDetail.get("source").get("kind").asText()).isEqualTo("INTERCOMPANY");
    assertThat(icDetail.get("source").get("id").asText()).isEqualTo(intercompany.toString());
    assertThat(icDetail.get("source").get("route").asText())
        .endsWith("q=SVR-T1&from=" + TODAY + "&to=" + TODAY);
    JsonNode openingDetail = detail(w, fundTx(w, "FUND_OPENING", null, bank));
    assertThat(openingDetail.get("source").get("route").asText())
        .isEqualTo("/zto-finans/bankalar/" + bank + "/duzenle");
    assertThat(openingDetail.get("runningBalance").decimalValue()).isEqualByComparingTo("100");
    JsonNode checkDetail = detail(w, instrumentTx(w, check));
    assertThat(checkDetail.get("source").get("route").asText()).isEqualTo("/finance/instruments");
    assertThat(checkDetail.get("source").get("code").asText()).isEqualTo("Q-1");
    assertThat(checkDetail.get("source").get("id").asText()).isEqualTo(check);
    JsonNode manualDetail = detail(w, income);
    assertThat(manualDetail.get("source").get("kind").asText()).isEqualTo("MANUAL");
    assertThat(manualDetail.get("source").get("route").isNull()).isTrue();
    assertThat(detail(w, legacyOut.toString()).get("source").get("route").isNull()).isTrue();
    JsonNode cashOpening =
        detail(
            w,
            fundTx(
                w,
                "FUND_OPENING",
                null,
                id(
                    sendJson(
                        w.t(),
                        null,
                        post(FINANCE + "/funds"),
                        withOpening(fundBody("KS-OP", "CASH", w.a2()), "5")))));
    assertThat(cashOpening.get("source").get("route").asText()).startsWith("/zto-finans/kasalar/");
    expect(send(w.t(), null, get(TX + "/" + UUID.randomUUID())), 404, "TRANSACTION_NOT_FOUND");
  }

  @Test
  void yuruyenBakiyeOzetVeSinirlar() throws Exception {
    World w = world("ftr");
    String bank =
        id(sendJson(w.t(), null, post(FINANCE + "/funds"), fundBody("BNK", "BANK", w.a1())));
    manual(w, bank, "IN", "100", TODAY.minusDays(20), "INCOME", "Başlangıç parası");
    String d1 = manual(w, bank, "OUT", "30", TODAY.minusDays(10), "EXPENSE", "Kira");
    String d2 = manual(w, bank, "IN", "50", TODAY.minusDays(5), "INCOME", "Tahsil_50");
    String d3 = manual(w, bank, "OUT", "20", TODAY, "EXPENSE", "Elektrik");

    // Yürüyen bakiye hesabın gerçek bakiyesidir; dönem başı dahil, süzgeçten bağımsız.
    JsonNode page =
        search(
            w,
            null,
            range(TODAY.minusDays(10), TODAY).param("fundId", bank).param("summary", "true"));
    List<String> ids = page.get("content").findValuesAsText("id");
    assertThat(ids).containsExactly(d3, d2, d1);
    assertThat(running(page, d1)).isEqualByComparingTo("70");
    assertThat(running(page, d2)).isEqualByComparingTo("120");
    assertThat(running(page, d3)).isEqualByComparingTo("100");
    JsonNode summary = page.get("summary");
    assertThat(summary.get("periodOpening").decimalValue()).isEqualByComparingTo("100");
    assertThat(summary.get("periodClosing").decimalValue()).isEqualByComparingTo("100");
    JsonNode totals = summary.get("currencies").get(0);
    assertThat(totals.get("currency").asText()).isEqualTo("TRY");
    assertThat(totals.get("totalIn").decimalValue()).isEqualByComparingTo("50");
    assertThat(totals.get("totalOut").decimalValue()).isEqualByComparingTo("50");
    assertThat(totals.get("net").decimalValue()).isEqualByComparingTo("0");
    assertThat(totals.get("count").asLong()).isEqualTo(3);

    JsonNode onlyIn =
        search(
            w,
            null,
            range(TODAY.minusDays(10), TODAY)
                .param("fundId", bank)
                .param("direction", "IN")
                .param("summary", "true"));
    assertThat(onlyIn.get("content").findValuesAsText("id")).containsExactly(d2);
    assertThat(running(onlyIn, d2)).isEqualByComparingTo("120");
    assertThat(onlyIn.get("summary").get("periodClosing").decimalValue())
        .isEqualByComparingTo("150");
    // Çok hesapta dönem başı/sonu yok; özetsiz istekte özet null.
    JsonNode multi = search(w, null, range(TODAY.minusDays(10), TODAY).param("summary", "true"));
    assertThat(multi.get("summary").get("periodOpening").isNull()).isTrue();
    assertThat(page.has("summary")).isTrue();
    assertThat(
            search(w, null, range(TODAY.minusDays(10), TODAY).param("fundId", bank))
                .get("summary")
                .isNull())
        .isTrue();

    // Sıra ve sayfalama; `_` kaçışlanır.
    assertThat(
            search(
                    w,
                    null,
                    range(TODAY.minusDays(10), TODAY)
                        .param("fundId", bank)
                        .param("sort", "transactionDate,asc"))
                .get("content")
                .findValuesAsText("id"))
        .containsExactly(d1, d2, d3);
    JsonNode second =
        search(
            w,
            null,
            range(TODAY.minusDays(10), TODAY)
                .param("fundId", bank)
                .param("size", "2")
                .param("page", "1"));
    assertThat(second.get("content").findValuesAsText("id")).containsExactly(d1);
    assertThat(second.get("totalElements").asLong()).isEqualTo(3);
    assertThat(second.get("totalPages").asInt()).isEqualTo(2);
    assertThat(
            search(w, null, range(TODAY.minusDays(10), TODAY).param("q", "tahsil_"))
                .get("content")
                .findValuesAsText("id"))
        .containsExactly(d2);

    // Tek hesap + başlangıç tarihi yok: tüm geçmiş, en çok 50 satır.
    JsonNode all =
        search(
            w,
            null,
            get(TX).param("fundId", bank).param("to", TODAY.toString()).param("size", "20"));
    assertThat(all.get("totalElements").asLong()).isEqualTo(4);
    expect(
        send(
            w.t(),
            null,
            get(TX).param("fundId", bank).param("to", TODAY.toString()).param("size", "51")),
        400,
        "PAGE_SIZE_INVALID");
    expect(
        send(
            w.t(),
            null,
            get(TX)
                .param("fundId", bank, w.fundA1())
                .param("to", TODAY.toString())
                .param("size", "20")),
        400,
        "DATE_RANGE_TOO_LARGE");
    expect(send(w.t(), null, get(TX).param("to", TODAY.toString())), 400, "DATE_RANGE_TOO_LARGE");
    expect(send(w.t(), null, range(TODAY.minusDays(367), TODAY)), 400, "DATE_RANGE_TOO_LARGE");
    expect(
        send(w.t(), null, range(TODAY.minusDays(367), TODAY).param("fundId", bank)),
        400,
        "DATE_RANGE_TOO_LARGE");
    expect(send(w.t(), null, range(TODAY, TODAY.minusDays(1))), 400, "DATE_RANGE_TOO_LARGE");
    send(w.t(), null, range(TODAY.minusDays(366), TODAY)).andExpect(status().isOk());
    expect(
        send(w.t(), null, range(TODAY.minusDays(1), TODAY).param("size", "501")),
        400,
        "PAGE_SIZE_INVALID");
    expect(
        send(w.t(), null, range(TODAY.minusDays(1), TODAY).param("size", "0")),
        400,
        "PAGE_SIZE_INVALID");
    List<String> tooMany = new ArrayList<>();
    for (int i = 0; i < 201; i++) {
      tooMany.add(UUID.randomUUID().toString());
    }
    expect(
        send(
            w.t(),
            null,
            range(TODAY.minusDays(1), TODAY).param("fundId", tooMany.toArray(String[]::new))),
        400,
        "TOO_MANY_IDS");
    expect(
        send(w.t(), null, range(TODAY.minusDays(1), TODAY).param("q", "x".repeat(101))),
        400,
        "QUERY_TOO_LONG");

    // 500 satırlık sayfa (genel 200 tavanı uygulanmaz) ve 10.000 satır sınırı.
    String bulk =
        id(sendJson(w.t(), null, post(FINANCE + "/funds"), fundBody("BULK", "CASH", w.a2())));
    jdbc.update(
        ("insert into \"%s\".fund_transaction (id, fund_account_id, company_id, direction,"
                + " amount, currency, exchange_rate, rate_date, tl_amount, transaction_date,"
                + " description, source_type, source_id, category, created_by, created_at,"
                + " updated_by, updated_at)"
                + " select gen_random_uuid(), ?, ?, 'IN', 1, 'TRY', 1, ?, 1, ?, 'Toplu ' || g,"
                + " 'MANUAL', gen_random_uuid(), 'OTHER', 'test', now(), 'test', now()"
                + " from generate_series(1, 10001) g")
            .formatted(w.schema()),
        UUID.fromString(bulk),
        w.companyAId(),
        TODAY.minusDays(1),
        TODAY.minusDays(1));
    JsonNode big =
        search(
            w, null, range(TODAY.minusDays(1), TODAY).param("fundId", bulk).param("size", "500"));
    assertThat(big.get("content")).hasSize(500);
    assertThat(big.get("size").asInt()).isEqualTo(500);
    assertThat(big.get("totalElements").asLong()).isEqualTo(10001);
    assertThat(big.get("content").get(0).get("runningBalance").decimalValue())
        .isEqualByComparingTo("10001");
    expect(
        send(w.t(), null, exportRange(TODAY.minusDays(1), TODAY).param("fundId", bulk)),
        422,
        "RESULT_TOO_LARGE");
    expect(
        send(
            w.t(),
            null,
            get(FINANCE + "/funds/" + bulk + "/activity-report")
                .param("from", TODAY.minusDays(1).toString())
                .param("to", TODAY.toString())),
        422,
        "RESULT_TOO_LARGE");
    JsonNode exported =
        body(
            send(w.t(), null, exportRange(TODAY.minusDays(30), TODAY).param("fundId", bank))
                .andExpect(status().isOk()));
    assertThat(exported).hasSize(4);
    assertThat(exported.findValuesAsText("id")).contains(d1, d2, d3);
  }

  @Test
  void personelGizliligiSirketVeKapsam() throws Exception {
    World w = world("fts");
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    jdbc.update(
        "update \"%s\".account set name = 'Personel Zeynep Deneme' where id = ?"
            .formatted(w.schema()),
        employee);
    String advance = settle(w, "payments", "CASH", employee, w.a1(), w.fundA1(), "60", null);
    String advanceTx = fundTx(w, "SETTLEMENT", advance, null);
    manual(w, w.fundA2(), "IN", "11", TODAY, null, "A2 girişi");
    manual(w, w.fundB1(), "IN", "22", TODAY, null, "B1 girişi");

    // Patron (FINANCE_EMPLOYEE_VIEW var) personel adıyla bulur.
    JsonNode owner = search(w, null, range(TODAY, TODAY).param("q", "zeynep"));
    assertThat(owner.get("content").findValuesAsText("id")).containsExactly(advanceTx);
    assertThat(owner.get("content").get(0).get("accountName").asText())
        .isEqualTo("Personel Zeynep Deneme");

    // İzinsiz kullanıcı: cari alanları boş, adla arama 0 satır (dışa aktarım dahil).
    String finance = userWithRole(w, "finans", "FINANCE");
    Map<String, JsonNode> rows = byId(search(w, finance, range(TODAY, TODAY)));
    assertThat(rows.get(advanceTx).get("accountId").isNull()).isTrue();
    assertThat(rows.get(advanceTx).get("accountName").isNull()).isTrue();
    assertThat(rows.get(advanceTx).get("accountingType").asText()).isEqualTo("ACCOUNT_PAYMENT");
    assertThat(
            search(w, finance, range(TODAY, TODAY).param("q", "zeynep"))
                .get("totalElements")
                .asLong())
        .isZero();
    assertThat(
            body(
                send(w.t(), finance, exportRange(TODAY, TODAY).param("q", "Zeynep"))
                    .andExpect(status().isOk())))
        .isEmpty();
    assertThat(detail(w, finance, advanceTx).get("accountName").isNull()).isTrue();

    // Şirket ve iş yeri süzgeci.
    assertThat(
            search(w, null, range(TODAY, TODAY).param("companyId", w.companyB()))
                .get("content")
                .findValuesAsText("fundAccountId"))
        .containsOnly(w.fundB1());
    assertThat(
            search(w, null, range(TODAY, TODAY).param("branchId", w.a2()))
                .get("content")
                .findValuesAsText("fundAccountId"))
        .containsOnly(w.fundA2());

    // LIMITED (A1): yalnız kendi iş yerinin hesapları; kapsam dışı hesap 403.
    String a1User = limitedUser(w, "a1", "FINANCE", List.of(w.a1()));
    assertThat(
            Set.copyOf(
                search(w, a1User, range(TODAY, TODAY))
                    .get("content")
                    .findValuesAsText("fundAccountId")))
        .containsOnly(w.fundA1());
    expect(
        send(w.t(), a1User, range(TODAY, TODAY).param("fundId", w.fundB1())),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        send(w.t(), a1User, range(TODAY, TODAY).param("companyId", w.companyB())),
        403,
        "COMPANY_OUT_OF_SCOPE");
    expect(
        send(w.t(), a1User, get(TX + "/" + fundTx(w, "MANUAL", null, w.fundB1()))),
        403,
        "BRANCH_OUT_OF_SCOPE");
  }

  @Test
  void fifoFaaliyetRaporu() throws Exception {
    World w = world("ftf");
    Map<String, Object> bankBody = fundBody("BNK", "BANK", w.a1());
    bankBody.put("openingBalance", "100");
    bankBody.put("openingDate", TODAY.minusDays(30).toString());
    String bank = id(sendJson(w.t(), null, post(FINANCE + "/funds"), bankBody));
    String in50 = manual(w, bank, "IN", "50", TODAY.minusDays(20), "INCOME", "Giriş 50");
    String out120 = manual(w, bank, "OUT", "120", TODAY.minusDays(15), "EXPENSE", "Çıkış 120");
    String in30 = manual(w, bank, "IN", "30", TODAY.minusDays(10), "INCOME", "Giriş 30");
    String out40 = manual(w, bank, "OUT", "40", TODAY.minusDays(5), "EXPENSE", "Çıkış 40");

    JsonNode report =
        body(
            send(
                    w.t(),
                    null,
                    get(FINANCE + "/funds/" + bank + "/activity-report")
                        .param("from", TODAY.minusDays(25).toString())
                        .param("to", TODAY.toString()))
                .andExpect(status().isOk()));
    assertThat(report.get("fund").get("code").asText()).isEqualTo("BNK");
    assertThat(report.get("opening").decimalValue()).isEqualByComparingTo("100");
    assertThat(report.get("totalIn").decimalValue()).isEqualByComparingTo("80");
    assertThat(report.get("totalOut").decimalValue()).isEqualByComparingTo("160");
    assertThat(report.get("net").decimalValue()).isEqualByComparingTo("20");
    assertThat(report.get("unmatchedOut").decimalValue()).isEqualByComparingTo("0");
    JsonNode inflows = report.get("inflows");
    assertThat(inflows).hasSize(3);
    assertThat(inflows.get(0).get("id").isNull()).isTrue();
    assertThat(inflows.get(0).get("accountingType").asText()).isEqualTo("OPENING");
    assertThat(inflows.get(0).get("remaining").decimalValue()).isEqualByComparingTo("0");
    assertThat(inflows.get(0).get("outflows").get(0).get("id").asText()).isEqualTo(out120);
    assertThat(inflows.get(0).get("outflows").get(0).get("amount").decimalValue())
        .isEqualByComparingTo("100");
    assertThat(inflows.get(1).get("id").asText()).isEqualTo(in50);
    assertThat(inflows.get(1).get("outflows")).hasSize(2);
    assertThat(inflows.get(1).get("outflows").get(1).get("id").asText()).isEqualTo(out40);
    assertThat(inflows.get(1).get("outflows").get(1).get("amount").decimalValue())
        .isEqualByComparingTo("30");
    assertThat(inflows.get(2).get("accountingType").asText()).isEqualTo("INCOME");
    JsonNode unspent = report.get("unspent");
    assertThat(unspent).hasSize(1);
    assertThat(unspent.get(0).get("no").asInt()).isEqualTo(3);
    assertThat(unspent.get(0).get("original").decimalValue()).isEqualByComparingTo("30");
    assertThat(unspent.get(0).get("remaining").decimalValue()).isEqualByComparingTo("20");
    assertThat(unspent.get(0).get("used").decimalValue()).isEqualByComparingTo("10");
    assertThat(in30).isNotNull();

    expect(
        send(
            w.t(),
            null,
            get(FINANCE + "/funds/" + bank + "/activity-report")
                .param("from", TODAY.minusDays(400).toString())
                .param("to", TODAY.toString())),
        400,
        "DATE_RANGE_TOO_LARGE");
    String a2User = limitedUser(w, "a2", "FINANCE", List.of(w.a2()));
    expect(
        send(
            w.t(),
            a2User,
            get(FINANCE + "/funds/" + bank + "/activity-report")
                .param("from", TODAY.minusDays(25).toString())
                .param("to", TODAY.toString())),
        403,
        "BRANCH_OUT_OF_SCOPE");
  }

  // --- yardımcılar

  private static Map<String, Object> fundBody(String code, String kind, String branch) {
    Map<String, Object> body = new HashMap<>();
    body.put("code", code);
    body.put("name", code + " Hesap");
    body.put("kind", kind);
    body.put("currency", "TRY");
    body.put("branchId", branch);
    body.put("allowNegative", true);
    return body;
  }

  private static Map<String, Object> withOpening(Map<String, Object> body, String amount) {
    body.put("openingBalance", amount);
    return body;
  }

  private String manual(
      World w,
      String fund,
      String direction,
      String amount,
      LocalDate date,
      String category,
      String description)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("direction", direction);
    body.put("money", Map.of("amount", amount, "currency", "TRY"));
    body.put("date", date.toString());
    body.put("description", description);
    if (category != null) {
      body.put("category", category);
    }
    return id(sendJson(w.t(), null, post(FINANCE + "/funds/" + fund + "/transactions"), body));
  }

  private static Map<String, Object> settlementBody(
      String method, UUID account, String branch, String fund, String amount, String item) {
    Map<String, Object> body = new HashMap<>();
    body.put("method", method);
    if (account != null) {
      body.put("accountId", account.toString());
    }
    body.put("branchId", branch);
    if (fund != null) {
      body.put("fundAccountId", fund);
    }
    if (item != null) {
      body.put("expenseItemId", item);
    }
    body.put("money", Map.of("amount", amount, "currency", "TRY"));
    body.put("date", TODAY.toString());
    // 12.2 B4 şirket dağılımı uyarısı onayı (bilinmeyen alan bugün yok sayılır).
    body.put("confirmWarnings", true);
    return body;
  }

  private String settle(
      World w,
      String path,
      String method,
      UUID account,
      String branch,
      String fund,
      String amount,
      String item)
      throws Exception {
    return id(
        sendJson(
            w.t(),
            null,
            post(FINANCE + "/" + path),
            settlementBody(method, account, branch, fund, amount, item)));
  }

  private void transition(World w, String instrument, String target, String fund) throws Exception {
    sendJson(
            w.t(),
            null,
            post(FINANCE + "/instruments/" + instrument + "/transition"),
            Map.of("toStatus", target, "date", TODAY.toString(), "fundAccountId", fund))
        .andExpect(status().isOk());
  }

  private UUID insertTx(
      World w,
      String fund,
      String direction,
      String amount,
      LocalDate date,
      String sourceType,
      UUID sourceId,
      String category) {
    UUID id = UUID.randomUUID();
    jdbc.update(
        ("insert into \"%s\".fund_transaction (id, fund_account_id, company_id, direction,"
                + " amount, currency, exchange_rate, rate_date, tl_amount, transaction_date,"
                + " description, source_type, source_id, category, created_by, created_at,"
                + " updated_by, updated_at)"
                + " select ?, f.id, f.company_id, ?, ?, 'TRY', 1, ?, ?, ?, 'Test', ?, ?, ?,"
                + " 'test', now(), 'test', now() from \"%s\".fund_account f where f.id = ?")
            .formatted(w.schema(), w.schema()),
        id,
        direction,
        new BigDecimal(amount),
        date,
        new BigDecimal(amount),
        date,
        sourceType,
        sourceId,
        category,
        UUID.fromString(fund));
    return id;
  }

  /** Kaynağa göre hareket kimliği (kaynak ya da hesap verilir). */
  private String fundTx(World w, String sourceType, String sourceId, String fund) {
    return jdbc.queryForObject(
        ("select id::text from \"%s\".fund_transaction where source_type = ?"
                + " and (?::uuid is null or source_id = ?::uuid)"
                + " and (?::uuid is null or fund_account_id = ?::uuid) limit 1")
            .formatted(w.schema()),
        String.class,
        sourceType,
        sourceId,
        sourceId,
        fund,
        fund);
  }

  private String instrumentTx(World w, String instrument) {
    return jdbc.queryForObject(
        ("select t.id::text from \"%s\".fund_transaction t"
                + " join \"%s\".instrument_movement m on m.id = t.source_id"
                + " where t.source_type = 'INSTRUMENT' and m.instrument_id = ?")
            .formatted(w.schema(), w.schema()),
        String.class,
        UUID.fromString(instrument));
  }

  private static MockHttpServletRequestBuilder range(LocalDate from, LocalDate to) {
    return get(TX).param("from", from.toString()).param("to", to.toString());
  }

  private static MockHttpServletRequestBuilder exportRange(LocalDate from, LocalDate to) {
    return get(TX + "/export").param("from", from.toString()).param("to", to.toString());
  }

  private JsonNode search(World w, String token, MockHttpServletRequestBuilder request)
      throws Exception {
    return body(send(w.t(), token, request).andExpect(status().isOk()));
  }

  private JsonNode detail(World w, String id) throws Exception {
    return detail(w, null, id);
  }

  private JsonNode detail(World w, String token, String id) throws Exception {
    return body(send(w.t(), token, get(TX + "/" + id)).andExpect(status().isOk()));
  }

  private static Map<String, JsonNode> byId(JsonNode page) {
    Map<String, JsonNode> map = new HashMap<>();
    page.get("content").forEach(r -> map.put(r.get("id").asText(), r));
    return map;
  }

  private static String type(Map<String, JsonNode> rows, String id) {
    assertThat(rows).containsKey(id);
    return rows.get(id).get("accountingType").asText();
  }

  private static BigDecimal running(JsonNode page, String id) {
    for (JsonNode row : page.get("content")) {
      if (id.equals(row.get("id").asText())) {
        return row.get("runningBalance").decimalValue();
      }
    }
    throw new AssertionError("Satır yok: " + id);
  }
}
