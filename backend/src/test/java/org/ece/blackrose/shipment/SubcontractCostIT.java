package org.ece.blackrose.shipment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.finance.SettlementTestSupport;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Sevk Nakliye Masrafları — taşeron gideri (12.7 §3.3, §3.4, §6.2): hemen cariye yazma (Y6), no-op,
 * düzeltme, kapanış, etap yeniden atama, sefer iptali, ters kayıt, OPEN silme (FINANCE), açık plan,
 * kapsam, izin ve kiracı izolasyonu.
 */
class SubcontractCostIT extends SettlementTestSupport {

  private static final String SHIPMENT = "/api/v1/shipment";
  private static final Instant START =
      Instant.now().plus(1, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
  private static final Instant END = START.plus(2, ChronoUnit.DAYS);

  private record Trip(String id, String leg) {}

  @Test
  void y6NoOpDuzeltmeOzetVeKapanis() throws Exception {
    World w = world("sc1");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID carrier = account(w, AccountType.CARRIER, null);
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    Trip trip = trip(w, customer, w.a1());
    assignCarrier(w, trip, carrier, "1000").andExpect(status().isOk());
    JsonNode open = subcontractCost(w, trip);
    assertThat(open.get("status").asText()).isEqualTo("OPEN");
    String openId = open.get("id").asText();

    // Y6: kaydedilince hemen cariye: 100 + 20 − 4 − 1 = 115; amount net kalır.
    JsonNode saved = body(save(w, null, trip, "100", "20", "4", "1").andExpect(status().isOk()));
    assertThat(saved.get("costId").asText()).isEqualTo(openId);
    assertThat(saved.get("status").asText()).isEqualTo("POSTED");
    assertThat(dec(saved.get("payableAmount"))).isEqualByComparingTo("115");
    assertThat(dec(saved.get("totalAmount"))).isEqualByComparingTo("120");
    assertThat(dec(saved.get("advanceAmount"))).isEqualByComparingTo("0");
    assertThat(saved.get("ledger").get("transactionId").isNull()).isFalse();
    assertThat(saved.get("cargoDescription").asText()).isEqualTo("Kumaş");
    assertThat(accountNet(w, carrier)).isEqualByComparingTo("-115");
    assertThat(
            count(
                w, "select count(*) from %s.trip_cost where id = ?::uuid and amount = 100", openId))
        .isEqualTo(1);
    assertThat(dec(subcontractCost(w, trip).get("payableAmount"))).isEqualByComparingTo("115");

    // Aynı PUT: no-op.
    JsonNode again = body(save(w, null, trip, "100", "20", "4", "1").andExpect(status().isOk()));
    assertThat(again.get("costId").asText()).isEqualTo(openId);
    assertThat(carrierTx(w, carrier)).isEqualTo(1);

    // Farklı tutar: eski REVERSED (replaced_by_id), REVERSAL + yeni hareket.
    JsonNode revised = body(save(w, null, trip, "200", "20", "4", "1").andExpect(status().isOk()));
    String newId = revised.get("costId").asText();
    assertThat(newId).isNotEqualTo(openId);
    Map<String, Object> old =
        row(
            w,
            "select status, deleted, replaced_by_id::text as r from %s.trip_cost where id = ?::uuid",
            openId);
    assertThat(old.get("status")).isEqualTo("REVERSED");
    assertThat(old.get("deleted")).isEqualTo(true);
    assertThat(old.get("r")).isEqualTo(newId);
    assertThat(carrierTx(w, carrier)).isEqualTo(3);
    assertThat(accountNet(w, carrier)).isEqualByComparingTo("-215");

    // Okuma: özet ve detay.
    JsonNode summary =
        body(
            send(w.t(), null, get(SHIPMENT + "/subcontract-costs/summary"))
                .andExpect(status().isOk()));
    assertThat(summary.get("carrierCount").asLong()).isEqualTo(1);
    JsonNode carrierRow = summary.get("carriers").get(0);
    assertThat(carrierRow.get("accountId").asText()).isEqualTo(carrier.toString());
    assertThat(carrierRow.get("legCount").asLong()).isEqualTo(1);
    assertThat(dec(carrierRow.get("netTotals").get(0).get("amount"))).isEqualByComparingTo("200");
    assertThat(dec(carrierRow.get("payableTotals").get(0).get("amount")))
        .isEqualByComparingTo("215");
    JsonNode detail = detail(w, null, carrier, w.companyA());
    assertThat(detail.get("rows")).hasSize(1);
    assertThat(detail.get("rows").get(0).get("costId").asText()).isEqualTo(newId);
    assertThat(detail.get("rows").get(0).get("transportMode").asText()).isEqualTo("ROAD");

    // Kapanış: POSTED taşeron satırı atlanır; OPEN diğer gider ödenecek tutarla yazılır.
    sendJson(
            w.t(),
            null,
            post(SHIPMENT + "/shipments/" + trip.id() + "/costs"),
            Map.of(
                "kind",
                "OTHER",
                "accountId",
                supplier.toString(),
                "money",
                Map.of("amount", "50", "currency", "TRY"),
                "date",
                TODAY.toString()))
        .andExpect(status().isCreated());
    closeTrip(w, trip);
    assertThat(carrierTx(w, carrier)).isEqualTo(3);
    assertThat(accountNet(w, supplier)).isEqualByComparingTo("-50");
    JsonNode profit =
        body(send(w.t(), null, get(SHIPMENT + "/shipments/" + trip.id() + "/profit")));
    assertThat(profit.get("costTl").decimalValue()).isEqualByComparingTo("250");

    // Kapanışta yazılmış (plan açılmış) taşeron satırı değiştirilemez.
    Trip closed = trip(w, customer, w.a1());
    assignCarrier(w, closed, carrier, "300").andExpect(status().isOk());
    closeTrip(w, closed);
    assertThat(accountNet(w, carrier)).isEqualByComparingTo("-515");
    expect(save(w, null, closed, "310", "0", "0", "0"), 409, "COST_PLAN_OPEN");
  }

  @Test
  void yenidenAtamaIptalTersKayitVeSeferIptali() throws Exception {
    World w = world("sc2");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID carrier = account(w, AccountType.CARRIER, null);
    UUID other = account(w, AccountType.CARRIER, null);
    Trip trip = trip(w, customer, w.a1());
    assignCarrier(w, trip, carrier, "500").andExpect(status().isOk());
    String costId =
        body(save(w, null, trip, "500", "100", "0", "0").andExpect(status().isOk()))
            .get("costId")
            .asText();
    sendJson(
            w.t(),
            null,
            post(SHIPMENT + "/shipments/" + trip.id() + "/status"),
            Map.of("status", "PLANNED"))
        .andExpect(status().isOk());

    // Yazılmış gider varken yeniden atama ve sefer iptali 409.
    expect(assignCarrier(w, trip, other, "400"), 409, "COST_POSTED");
    expect(cancel(w, trip), 409, "COST_POSTED");

    // Ters kayıt: REVERSED + deleted; satır maliyetsiz; ikinci çağrı 204.
    reverse(w, null, costId).andExpect(status().isNoContent());
    reverse(w, null, costId).andExpect(status().isNoContent());
    assertThat(
            count(
                w,
                "select count(*) from %s.trip_cost where id = ?::uuid and status = 'REVERSED' and deleted",
                costId))
        .isEqualTo(1);
    assertThat(accountNet(w, carrier)).isEqualByComparingTo("0");
    JsonNode row = detail(w, null, carrier, null).get("rows").get(0);
    assertThat(row.get("costId").isNull()).isTrue();
    assertThat(row.get("payableAmount").isNull()).isTrue();

    // Ters kayıttan sonra atama serbest; OPEN gider ters çevrilmez; yalnız OPEN varken iptal
    // serbest.
    assignCarrier(w, trip, other, "400").andExpect(status().isOk());
    String openId = subcontractCost(w, trip).get("id").asText();
    expect(reverse(w, null, openId), 409, "COST_NOT_POSTED");
    cancel(w, trip).andExpect(status().isOk());
    expect(save(w, null, trip, "400", "0", "0", "0"), 409, "SHIPMENT_CANCELLED");
  }

  @Test
  void openSilmeKapsamIzinVeKiraciIzolasyonu() throws Exception {
    World w = world("sc3");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID carrier = account(w, AccountType.CARRIER, null);
    String finance = userWithRole(w, "finans", "FINANCE");

    // FINANCE (SHIPMENT_DISPATCH yok) OPEN taşeron giderini siler; ikinci çağrı 204.
    Trip trip = trip(w, customer, w.a1());
    assignCarrier(w, trip, carrier, "100").andExpect(status().isOk());
    String openId = subcontractCost(w, trip).get("id").asText();
    removeCost(w, finance, openId).andExpect(status().isNoContent());
    assertThat(count(w, "select count(*) from %s.trip_cost where id = ?::uuid and deleted", openId))
        .isEqualTo(1);
    removeCost(w, finance, openId).andExpect(status().isNoContent());

    // POSTED silinmez; taşeron dışı gider bu uçtan silinmez.
    String posted =
        body(save(w, finance, trip, "100", "0", "0", "0").andExpect(status().isOk()))
            .get("costId")
            .asText();
    expect(removeCost(w, finance, posted), 409, "COST_POSTED");
    String fuel =
        body(sendJson(
                    w.t(),
                    null,
                    post(SHIPMENT + "/shipments/" + trip.id() + "/costs"),
                    Map.of(
                        "kind",
                        "FUEL",
                        "accountId",
                        carrier.toString(),
                        "money",
                        Map.of("amount", "10", "currency", "TRY"),
                        "date",
                        TODAY.toString()))
                .andExpect(status().isCreated()))
            .get("id")
            .asText();
    expect(removeCost(w, finance, fuel), 409, "COST_NOT_REVERSIBLE");

    // Kapsam: LIMITED (A2) A1 seferine yazamaz; yalnız SHIPMENT_VIEW yazamaz ama okur.
    String limited = limitedUser(w, "sube", "FINANCE", List.of(w.a2()));
    save(w, limited, trip, "120", "0", "0", "0").andExpect(status().isForbidden());
    role(w, "SEVK_OKU", Set.of("SHIPMENT_VIEW"));
    String viewer = userWithRole(w, "okur", "SEVK_OKU");
    save(w, viewer, trip, "120", "0", "0", "0").andExpect(status().isForbidden());
    send(w.t(), viewer, get(SHIPMENT + "/subcontract-costs/summary")).andExpect(status().isOk());

    // Şirket süzgeci: B1 seferi A süzgecinde görünmez.
    Trip inB = trip(w, customer, w.b1());
    assignCarrier(w, inB, carrier, "70").andExpect(status().isOk());
    assertThat(detail(w, null, carrier, w.companyA()).get("rows")).hasSize(1);
    assertThat(detail(w, null, carrier, w.companyB()).get("rows")).hasSize(1);
    assertThat(detail(w, null, carrier, null).get("rows")).hasSize(2);
    assertThat(detail(w, limited, carrier, null).get("rows")).isEmpty();
    expect(
        send(w.t(), null, get(SHIPMENT + "/subcontract-costs/summary").param("days", "0")),
        400,
        "DAYS_INVALID");

    // Kiracı izolasyonu.
    World otherTenant = world("sc3b");
    expect(save(otherTenant, null, trip, "120", "0", "0", "0"), 404, "SHIPMENT_NOT_FOUND");
  }

  // --- yardımcılar

  /** Ondalık metin alanı (JSON'da "115.0000"). */
  private static java.math.BigDecimal dec(JsonNode node) {
    return new java.math.BigDecimal(node.asText());
  }

  private Trip trip(World w, UUID customer, String branch) throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("accountId", customer.toString());
    body.put("branchId", branch);
    body.put("origin", "İstanbul");
    body.put("destination", "Ankara");
    body.put("plannedPickup", START.toString());
    body.put("plannedDelivery", END.toString());
    body.put("manualNet", "1000");
    body.put("currency", "TRY");
    body.put("cargo", List.of(Map.of("description", "Kumaş", "weightKg", "500")));
    JsonNode shipment =
        body(
            sendJson(w.t(), null, post(SHIPMENT + "/shipments"), body)
                .andExpect(status().isCreated()));
    return new Trip(shipment.get("id").asText(), shipment.get("legs").get(0).get("id").asText());
  }

  private ResultActions assignCarrier(World w, Trip trip, UUID carrier, String amount)
      throws Exception {
    return sendJson(
        w.t(),
        null,
        post(SHIPMENT + "/legs/" + trip.leg() + "/assign"),
        Map.of(
            "carrierAccountId",
            carrier.toString(),
            "carrierCost",
            Map.of("amount", amount, "currency", "TRY")));
  }

  private ResultActions save(
      World w, String token, Trip trip, String net, String vat, String wh, String ded)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("money", Map.of("amount", net, "currency", "TRY"));
    body.put("vatAmount", vat);
    body.put("withholdingAmount", wh);
    body.put("deductionAmount", ded);
    body.put("documentNo", "TF-1");
    body.put("documentType", "ALIS_FATURASI");
    body.put("costDate", TODAY.toString());
    return sendJson(
        w.t(),
        token,
        put(SHIPMENT + "/shipments/" + trip.id() + "/legs/" + trip.leg() + "/subcontract-cost"),
        body);
  }

  private ResultActions reverse(World w, String token, String costId) throws Exception {
    return sendJson(
        w.t(),
        token,
        post(SHIPMENT + "/subcontract-costs/" + costId + "/reverse"),
        Map.of("date", TODAY.toString(), "reason", "Hatalı giriş"));
  }

  private ResultActions removeCost(World w, String token, String costId) throws Exception {
    return send(w.t(), token, delete(SHIPMENT + "/subcontract-costs/" + costId));
  }

  private ResultActions cancel(World w, Trip trip) throws Exception {
    return sendJson(
        w.t(),
        null,
        post(SHIPMENT + "/shipments/" + trip.id() + "/status"),
        Map.of("status", "CANCELLED"));
  }

  /** Seferin (tek) taşeron gideri, MUI gider listesinden. */
  private JsonNode subcontractCost(World w, Trip trip) throws Exception {
    for (JsonNode cost :
        body(send(w.t(), null, get(SHIPMENT + "/shipments/" + trip.id() + "/costs")))) {
      if ("SUBCONTRACTOR".equals(cost.get("kind").asText())) {
        return cost;
      }
    }
    throw new AssertionError("Taşeron gideri yok");
  }

  private JsonNode detail(World w, String token, UUID carrier, String companyId) throws Exception {
    var request =
        get(SHIPMENT + "/subcontract-costs").param("carrierAccountId", carrier.toString());
    if (companyId != null) {
      request.param("companyId", companyId);
    }
    return body(send(w.t(), token, request).andExpect(status().isOk()));
  }

  private long carrierTx(World w, UUID carrier) {
    return count(w, "select count(*) from %s.account_transaction where account_id = ?", carrier);
  }

  /** Teslim → fatura → kapanış. */
  private void closeTrip(World w, Trip trip) throws Exception {
    String base = SHIPMENT + "/shipments/" + trip.id();
    for (String target : List.of("PLANNED", "LOADED", "IN_TRANSIT")) {
      sendJson(w.t(), null, post(base + "/status"), Map.of("status", target))
          .andExpect(status().isOk());
    }
    sendJson(
            w.t(),
            null,
            post(base + "/pod"),
            Map.of("recipientName", "Teslim Alan", "deliveredAt", END.toString()))
        .andExpect(status().isOk());
    sendJson(w.t(), null, post(base + "/status"), Map.of("status", "DELIVERED"))
        .andExpect(status().isOk());
    Map<String, Object> dates =
        Map.of("invoiceDate", TODAY.toString(), "dueDate", TODAY.plusDays(30).toString());
    sendJson(w.t(), null, post(base + "/invoice"), dates).andExpect(status().isCreated());
    sendJson(
            w.t(),
            null,
            post(base + "/close"),
            Map.of("date", TODAY.toString(), "dueDate", TODAY.plusDays(30).toString()))
        .andExpect(status().isOk());
  }

  private void role(World w, String code, Set<String> permissions) throws Exception {
    sendJson(
            w.t(),
            null,
            post("/api/v1/identity/roles"),
            Map.of(
                "code",
                code,
                "name",
                code,
                "priority",
                5,
                "landingPath",
                "/operations",
                "permissions",
                permissions))
        .andExpect(status().isCreated());
  }
}
