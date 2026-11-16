package org.ece.blackrose.finance;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Faz 12.3 çek/senet yazım yolu IT'lerinin ortak yardımcıları (12.3_TASARIM §6.2): çek/senet
 * gövdesi, çekli tahsilat/ödeme, geçiş, PATCH, emanet ve SQL ile koçan yaprağı (B3 koçan servisi
 * gelmeden).
 */
public abstract class InstrumentTestSupport extends SettlementTestSupport {

  protected static final String INSTRUMENTS = FINANCE + "/instruments";

  /** Yeni çek/senet gövdesi (vade bugün + 30). */
  protected static Map<String, Object> instrumentData(String kind, String number) {
    Map<String, Object> data = new HashMap<>();
    data.put("kind", kind);
    data.put("number", number);
    data.put("bankName", "Test Bankası");
    data.put("dueDate", TODAY.plusDays(30).toString());
    return data;
  }

  /** Çekli/senetli tahsilat ya da ödeme gövdesi. */
  protected static Map<String, Object> instrumentBody(
      UUID account, String branch, String amount, Map<String, Object> data) {
    Map<String, Object> body = body("CHECK", account, branch, null, amount);
    body.put("instrument", data);
    return body;
  }

  /** 201 bekleyen çekli tahsilat; settlement gövdesi döner. */
  protected JsonNode collectInstrument(
      World w, UUID customer, String branch, String amount, Map<String, Object> data)
      throws Exception {
    return body(
        collect(w, null, instrumentBody(customer, branch, amount, data), null)
            .andExpect(status().isCreated()));
  }

  /** 201 bekleyen çekli ödeme (verilen çek/senet); settlement gövdesi döner. */
  protected JsonNode payInstrument(
      World w, UUID supplier, String branch, String amount, Map<String, Object> data)
      throws Exception {
    return body(
        pay(w, null, instrumentBody(supplier, branch, amount, data), null)
            .andExpect(status().isCreated()));
  }

  /** Portföydeki çeki cirolayan ödeme gövdesi. */
  protected static Map<String, Object> endorseBody(
      UUID supplier, String branch, String amount, String instrument) {
    Map<String, Object> body = body("CHECK", supplier, branch, null, amount);
    body.put("instrumentId", instrument);
    return body;
  }

  protected ResultActions transition(
      World w, String token, Object instrument, String target, String fund) throws Exception {
    return transition(w, token, instrument, target, fund, Map.of());
  }

  protected ResultActions transition(
      World w,
      String token,
      Object instrument,
      String target,
      String fund,
      Map<String, Object> extra)
      throws Exception {
    Map<String, Object> body = new HashMap<>(extra);
    body.put("toStatus", target);
    if (fund != null) {
      body.put("fundAccountId", fund);
    }
    body.putIfAbsent("date", TODAY.toString());
    return sendJson(w.t(), token, post(INSTRUMENTS + "/" + instrument + "/transition"), body);
  }

  protected ResultActions patchInstrument(
      World w, String token, Object instrument, Map<String, Object> body) throws Exception {
    return sendJson(w.t(), token, patch(INSTRUMENTS + "/" + instrument), body);
  }

  protected ResultActions moveCustody(World w, String token, Object instrument, String fund)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("custodyFundId", fund);
    body.put("date", TODAY.toString());
    return sendJson(w.t(), token, put(INSTRUMENTS + "/" + instrument + "/custody"), body);
  }

  protected ResultActions movements(World w, String token, Object instrument) throws Exception {
    return send(w.t(), token, get(INSTRUMENTS + "/" + instrument + "/movements"));
  }

  protected Map<String, Object> instrumentRow(World w, Object instrument) {
    return row(w, "select * from %s.instrument where id = ?::uuid", instrument.toString());
  }

  protected String instrumentStatus(World w, Object instrument) {
    return (String) instrumentRow(w, instrument).get("status");
  }

  protected long movementCount(World w, Object instrument) {
    return count(
        w,
        "select count(*) from %s.instrument_movement where instrument_id = ?::uuid",
        instrument.toString());
  }

  protected long ledgerCount(World w) {
    return count(w, "select count(*) from %s.account_transaction");
  }

  protected long fundLedgerCount(World w) {
    return count(w, "select count(*) from %s.fund_transaction");
  }

  /**
   * Banka fonuna SQL ile koçan ve verilen numaralarla {@code UNUSED} yapraklar ekler (B3 koçan
   * servisi bu IT'lerden bağımsız); yaprak kimlikleri sırayla döner.
   */
  protected List<UUID> leaves(World w, String bankFund, String branch, String... numbers) {
    UUID company =
        UUID.fromString(
            (String)
                row(
                        w,
                        "select company_id::text as c from %s.fund_account where id = ?::uuid",
                        bankFund)
                    .get("c"));
    UUID book =
        insert(
            w,
            "check_book",
            Map.of(
                "company_id",
                company,
                "branch_id",
                UUID.fromString(branch),
                "fund_account_id",
                UUID.fromString(bankFund),
                "serial_no",
                "SR-" + UUID.randomUUID().toString().substring(0, 6),
                "start_number",
                numbers[0],
                "end_number",
                numbers[numbers.length - 1],
                "leaf_count",
                numbers.length));
    List<UUID> ids = new ArrayList<>();
    for (int i = 0; i < numbers.length; i++) {
      ids.add(
          insert(
              w,
              "check_leaf",
              Map.of(
                  "company_id",
                  company,
                  "check_book_id",
                  book,
                  "fund_account_id",
                  UUID.fromString(bankFund),
                  "leaf_no",
                  i + 1,
                  "number",
                  numbers[i])));
    }
    return ids;
  }

  protected String leafStatus(World w, UUID leaf) {
    return (String) row(w, "select status from %s.check_leaf where id = ?", leaf).get("status");
  }
}
