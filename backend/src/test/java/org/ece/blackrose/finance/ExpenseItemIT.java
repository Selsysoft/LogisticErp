package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.junit.jupiter.api.Test;

/**
 * Masraf kalemi tanımı (12.7 §3.1, §6.2): kod üretimi, ad tekilliği, düzenleme, sistem kalemi
 * koruması, aktif/pasif, pasif kalemle masraf, MUI sözleşmesi ve izinler.
 */
class ExpenseItemIT extends SettlementTestSupport {

  private static final String ITEMS = FINANCE + "/expense-items";

  @Test
  void kalemYasamDongusu() throws Exception {
    World w = world("ei1");
    String type =
        id(
            sendJson(
                w.t(),
                null,
                post(FINANCE + "/expense-types"),
                Map.of("code", "OFIS", "name", "Ofis")));

    // Kod girilmeden: MK-00001; açıklama ve birim saklanır.
    JsonNode created =
        body(
            sendJson(
                    w.t(), null, post(ITEMS), item(type, null, "Kirtasiye", "Kalem, kağıt", "Adet"))
                .andExpect(status().isCreated()));
    String itemId = created.get("id").asText();
    assertThat(created.get("code").asText()).isEqualTo("MK-00001");
    assertThat(created.get("expenseTypeName").asText()).isEqualTo("Ofis");
    assertThat(created.get("defaultUnit").asText()).isEqualTo("Adet");
    assertThat(created.get("active").asBoolean()).isTrue();
    assertThat(created.get("system").asBoolean()).isFalse();

    // Ad çakışması büyük/küçük harf duyarsız.
    expect(
        sendJson(w.t(), null, post(ITEMS), item(type, null, "KIRTASIYE", null, null)),
        409,
        "EXPENSE_ITEM_NAME_EXISTS");
    // MUI sözleşmesi: kodlu POST; aynı kod 409.
    JsonNode mui =
        body(
            sendJson(
                    w.t(),
                    null,
                    post(ITEMS),
                    Map.of("expenseTypeId", type, "code", "X1", "name", "Temizlik"))
                .andExpect(status().isCreated()));
    assertThat(mui.get("code").asText()).isEqualTo("X1");
    expect(
        sendJson(w.t(), null, post(ITEMS), item(type, "X1", "Başka", null, null)),
        409,
        "EXPENSE_ITEM_CODE_EXISTS");
    expect(
        sendJson(
            w.t(), null, post(ITEMS), item(UUID.randomUUID().toString(), null, "Y", null, null)),
        400,
        "EXPENSE_TYPE_NOT_FOUND");

    // PUT: ad, açıklama ve kod değişir; başka kalemin adı 409.
    JsonNode updated =
        body(
            sendJson(
                    w.t(),
                    null,
                    put(ITEMS + "/" + itemId),
                    item(type, "KRT", "Kırtasiye Gideri", "Yeni", "Paket"))
                .andExpect(status().isOk()));
    assertThat(updated.get("name").asText()).isEqualTo("Kırtasiye Gideri");
    assertThat(updated.get("code").asText()).isEqualTo("KRT");
    assertThat(updated.get("description").asText()).isEqualTo("Yeni");
    expect(
        sendJson(w.t(), null, put(ITEMS + "/" + itemId), item(type, null, "temizlik", null, null)),
        409,
        "EXPENSE_ITEM_NAME_EXISTS");

    // Sistem kalemi: kod/tür değişmez, pasifleşmez; ad değişebilir.
    JsonNode fuel = byCode(w, "FUEL");
    assertThat(fuel.get("system").asBoolean()).isTrue();
    String fuelId = fuel.get("id").asText();
    String fuelType = fuel.get("expenseTypeId").asText();
    expect(
        sendJson(
            w.t(), null, put(ITEMS + "/" + fuelId), item(fuelType, "YAKIT", "Yakıt", null, null)),
        409,
        "EXPENSE_ITEM_SYSTEM");
    expect(
        sendJson(w.t(), null, put(ITEMS + "/" + fuelId), item(type, null, "Yakıt", null, null)),
        409,
        "EXPENSE_ITEM_SYSTEM");
    sendJson(w.t(), null, put(ITEMS + "/" + fuelId), item(fuelType, null, "Akaryakıt", null, "Lt"))
        .andExpect(status().isOk());
    assertThat(byCode(w, "FUEL").get("name").asText()).isEqualTo("Akaryakıt");
    expect(
        sendJson(w.t(), null, put(ITEMS + "/" + fuelId + "/active"), Map.of("active", false)),
        409,
        "EXPENSE_ITEM_SYSTEM");

    // Pasif kalem listede kalır; yeni masrafta 422.
    JsonNode inactive =
        body(
            sendJson(w.t(), null, put(ITEMS + "/" + itemId + "/active"), Map.of("active", false))
                .andExpect(status().isOk()));
    assertThat(inactive.get("active").asBoolean()).isFalse();
    assertThat(byCode(w, "KRT").get("active").asBoolean()).isFalse();
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    expect(
        sendJson(w.t(), null, post(FINANCE + "/expenses"), expense(w, itemId, supplier)),
        422,
        "EXPENSE_ITEM_INACTIVE");
    sendJson(w.t(), null, put(ITEMS + "/" + itemId + "/active"), Map.of("active", true))
        .andExpect(status().isOk());
    sendJson(w.t(), null, post(FINANCE + "/expenses"), expense(w, itemId, supplier))
        .andExpect(status().isCreated());
    assertThat(audits(w, "EXPENSE_ITEM_UPDATED", "EXPENSE_ITEM:" + itemId)).isEqualTo(4);

    // Yalnız FINANCE_VIEW: okur, yazamaz.
    String viewer = userWithRole(w, "muhasebe", "ACCOUNTING");
    send(w.t(), viewer, get(ITEMS)).andExpect(status().isOk());
    sendJson(w.t(), viewer, post(ITEMS), item(type, null, "Z", null, null))
        .andExpect(status().isForbidden());
    sendJson(w.t(), viewer, put(ITEMS + "/" + itemId), item(type, null, "Z", null, null))
        .andExpect(status().isForbidden());
    sendJson(w.t(), viewer, put(ITEMS + "/" + itemId + "/active"), Map.of("active", false))
        .andExpect(status().isForbidden());
  }

  private JsonNode byCode(World w, String code) throws Exception {
    for (JsonNode node : body(send(w.t(), null, get(ITEMS)).andExpect(status().isOk()))) {
      if (code.equals(node.get("code").asText())) {
        return node;
      }
    }
    throw new AssertionError("Kalem yok: " + code);
  }

  private static Map<String, Object> item(
      String type, String code, String name, String description, String unit) {
    Map<String, Object> body = new HashMap<>();
    body.put("expenseTypeId", type);
    body.put("code", code);
    body.put("name", name);
    body.put("description", description);
    body.put("defaultUnit", unit);
    return body;
  }

  private static Map<String, Object> expense(World w, String item, UUID supplier) {
    Map<String, Object> body = new HashMap<>();
    body.put("branchId", w.a1());
    body.put("expenseItemId", item);
    body.put("contextType", "GENERAL");
    body.put("paymentMethod", "ACCOUNT");
    body.put("supplierAccountId", supplier.toString());
    body.put("invoiceDate", TODAY.toString());
    body.put("documentType", "ALIS_FATURASI");
    body.put("department", "ADMIN");
    body.put("currency", "TRY");
    body.put("lines", List.of(Map.of("quantity", "1", "unitPrice", "10", "vatRate", "0")));
    return body;
  }
}
