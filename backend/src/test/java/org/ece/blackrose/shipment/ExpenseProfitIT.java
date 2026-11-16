package org.ece.blackrose.shipment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.finance.SettlementTestSupport;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.junit.jupiter.api.Test;

/**
 * OK-12.7-8 / OK-12.8-12 (12.8_TASARIM §3.5): ayna kayıt yok; sefer bağlamlı kayıtlı masrafın KDV
 * hariç net TL tutarı sefer kârlılığına (TFS ve RS), araç bağlamlı masrafınki araç maliyetine
 * ("Genel masraf") okunur. Ters çevrilmiş ve genel bağlamlı masraf girmez.
 */
class ExpenseProfitIT extends SettlementTestSupport {

  private static final String SHIPMENT = "/api/v1/shipment";
  private static final String EXPENSES = FINANCE + "/expenses";
  private static final Instant START =
      Instant.now().plus(1, ChronoUnit.DAYS).truncatedTo(ChronoUnit.SECONDS);
  private static final Instant END = START.plus(2, ChronoUnit.DAYS);

  @Test
  void seferBaglamliMasrafKarliligaAracBaglamliMaliyeteGirer() throws Exception {
    World w = world("exp");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    String item = expenseItem(w, "EXPR");
    String trip = trip(w, customer, w.a1());
    // Kapanış için etaba taşeron atanır (taşeron gideri 300).
    UUID carrier = account(w, AccountType.CARRIER, null);
    String leg =
        body(send(w.t(), null, get(SHIPMENT + "/shipments/" + trip)).andExpect(status().isOk()))
            .get("legs")
            .get(0)
            .get("id")
            .asText();
    sendJson(
            w.t(),
            null,
            post(SHIPMENT + "/legs/" + leg + "/assign"),
            Map.of(
                "carrierAccountId",
                carrier.toString(),
                "carrierCost",
                Map.of("amount", "300", "currency", "TRY")))
        .andExpect(status().isOk());
    BigDecimal baseline = profitCost(w, trip);

    expense(w, item, supplier, "SHIPMENT", "shipmentId", trip, "100");
    expense(w, item, supplier, "GENERAL", null, null, "999");
    String reversed = expense(w, item, supplier, "SHIPMENT", "shipmentId", trip, "50");
    sendJson(
            w.t(),
            null,
            post(EXPENSES + "/" + reversed + "/reverse"),
            Map.of("date", TODAY.toString(), "reason", "Hatalı"))
        .andExpect(status().isOk());

    assertThat(profitCost(w, trip).subtract(baseline)).isEqualByComparingTo("100");

    closeTrip(w, trip);
    BigDecimal closedCost = profitCost(w, trip);
    assertThat(closedCost).isEqualByComparingTo("400");
    JsonNode report =
        body(
            send(
                    w.t(),
                    null,
                    get("/api/v1/reports/profitability")
                        .param("group", "SHIPMENT")
                        .param("from", TODAY.toString())
                        .param("to", TODAY.plusDays(5).toString()))
                .andExpect(status().isOk()));
    assertThat(report.get("costTl").decimalValue()).isEqualByComparingTo(closedCost);
    assertThat(report.get("revenueTl").decimalValue()).isEqualByComparingTo("1000");

    // Araç bağlamlı masraf: yalnız masrafı olan araç da satır alır; KDV hariç net.
    String vehicle = vehicle(w, "34EXP01");
    expense(w, item, supplier, "VEHICLE", "vehicleId", vehicle, "200");
    JsonNode costs = vehicleCosts(w, null);
    JsonNode row = rowOf(costs, vehicle);
    assertThat(row.get("generalExpenseTl").decimalValue()).isEqualByComparingTo("200");
    assertThat(row.get("totalTl").decimalValue()).isEqualByComparingTo("200");
    assertThat(row.get("repairTl").decimalValue()).isEqualByComparingTo("0");

    // Araç gideriyle birlikte toplam.
    vehicleExpense(w, vehicle, w.a1(), w.fundA1(), "300");
    JsonNode both = rowOf(vehicleCosts(w, null), vehicle);
    assertThat(both.get("repairTl").decimalValue()).isEqualByComparingTo("300");
    assertThat(both.get("totalTl").decimalValue()).isEqualByComparingTo("500");

    // LIMITED (A2): A1'deki masraf ve gider görünmez.
    String limited = limitedUser(w, "filo", "FLEET_MANAGER", List.of(w.a2()));
    for (JsonNode other : vehicleCosts(w, limited)) {
      assertThat(other.get("vehicleId").asText()).isNotEqualTo(vehicle);
    }
  }

  private String expense(
      World w,
      String item,
      UUID supplier,
      String context,
      String contextField,
      String contextId,
      String net)
      throws Exception {
    Map<String, Object> line = new HashMap<>();
    line.put("description", "Satır");
    line.put("quantity", "1");
    line.put("unitPrice", net);
    line.put("vatRate", "20");
    Map<String, Object> body = new HashMap<>();
    body.put("branchId", w.a1());
    body.put("expenseItemId", item);
    body.put("contextType", context);
    if (contextField != null) {
      body.put(contextField, contextId);
    }
    body.put("paymentMethod", "ACCOUNT");
    body.put("supplierAccountId", supplier.toString());
    body.put("invoiceNumber", "F-" + UUID.randomUUID().toString().substring(0, 6));
    body.put("invoiceDate", TODAY.toString());
    body.put("documentType", "ALIS_FATURASI");
    body.put("department", "ADMIN");
    body.put("currency", "TRY");
    body.put("lines", List.of(line));
    return id(sendJson(w.t(), null, post(EXPENSES), body));
  }

  private BigDecimal profitCost(World w, String trip) throws Exception {
    return body(send(w.t(), null, get(SHIPMENT + "/shipments/" + trip + "/profit"))
            .andExpect(status().isOk()))
        .get("costTl")
        .decimalValue();
  }

  private JsonNode vehicleCosts(World w, String token) throws Exception {
    return body(
        send(
                w.t(),
                token,
                get("/api/v1/fleet/reports/vehicle-costs")
                    .param("from", TODAY.minusDays(1).toString())
                    .param("to", TODAY.plusDays(1).toString()))
            .andExpect(status().isOk()));
  }

  private static JsonNode rowOf(JsonNode rows, String vehicle) {
    for (JsonNode row : rows) {
      if (vehicle.equals(row.get("vehicleId").asText())) {
        return row;
      }
    }
    throw new AssertionError("Araç satırı yok: " + vehicle);
  }

  private String trip(World w, UUID customer, String branch) throws Exception {
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
    return body(sendJson(w.t(), null, post(SHIPMENT + "/shipments"), body)
            .andExpect(status().isCreated()))
        .get("id")
        .asText();
  }

  private void closeTrip(World w, String trip) throws Exception {
    String base = SHIPMENT + "/shipments/" + trip;
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
}
