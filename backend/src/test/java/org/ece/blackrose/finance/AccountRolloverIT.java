package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.Direction;
import org.junit.jupiter.api.Test;

/** Cari devir / sezon (12.1 §3.10, §4.6). */
class AccountRolloverIT extends AccountTestSupport {

  @Test
  void sezonYasamDongusuTekAktifSezonuKorurVeDefterYazmaz() throws Exception {
    World w = world("rov");
    UUID account = account(w, AccountType.CUSTOMER, null);
    manual(w, account, w.a1(), Direction.DEBIT, "100", "TRY");
    long ledgerRows = ledgerRows(w);

    String first = id(create(w, null, account, "2026-01-01", "2026 Sezonu"));
    assertThat(rollover(w, first).get("active").asBoolean()).isTrue();

    // İkinci sezon: hatasız oluşur, ilk pasifleşir, yeni aktif olur (F6).
    String second = id(create(w, null, account, "2026-07-01", "  2026 Yaz  "));
    assertThat(rollover(w, first).get("active").asBoolean()).isFalse();
    JsonNode secondRow = rollover(w, second);
    assertThat(secondRow.get("active").asBoolean()).isTrue();
    assertThat(secondRow.get("seasonName").asText()).isEqualTo("2026 Yaz");
    assertThat(activeCount(w, account)).isEqualTo(1);

    expect(create(w, null, account, "2026-07-01", "Tekrar"), 409, "ROLLOVER_DATE_TAKEN");
    expect(create(w, null, account, null, "Eksik"), 400, "ROLLOVER_FIELDS_REQUIRED");
    expect(create(w, null, account, "2026-08-01", " "), 400, "ROLLOVER_FIELDS_REQUIRED");

    // Güncelle: sayaç artar; başka sezonun tarihine çekilemez.
    JsonNode updated =
        body(
            sendJson(
                    w.t(),
                    null,
                    put(FINANCE + "/rollovers/" + first),
                    Map.of("rolloverDate", "2026-01-02", "seasonName", "2026 Kış"))
                .andExpect(status().isOk()));
    assertThat(updated.get("updateCount").asInt()).isGreaterThanOrEqualTo(1);
    assertThat(updated.get("rolloverDate").asText()).isEqualTo("2026-01-02");
    expect(
        sendJson(
            w.t(),
            null,
            put(FINANCE + "/rollovers/" + first),
            Map.of("rolloverDate", "2026-07-01", "seasonName", "Çakışma")),
        409,
        "ROLLOVER_DATE_TAKEN");

    // Aktifi değiştir.
    send(w.t(), null, post(FINANCE + "/rollovers/" + first + "/activate"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.active").value(true));
    assertThat(rollover(w, second).get("active").asBoolean()).isFalse();
    assertThat(activeCount(w, account)).isEqualTo(1);

    // Aktif sezon silinirken yeni aktif seçilmeli; başka carinin sezonu geçersiz.
    send(w.t(), null, delete(FINANCE + "/rollovers/" + first))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("ROLLOVER_NEW_ACTIVE_REQUIRED"))
        .andExpect(jsonPath("$.details[0]").value("needNewActive=true"));
    UUID other = account(w, AccountType.CUSTOMER, null);
    String foreign = id(create(w, null, other, "2026-01-01", "Başka"));
    expect(
        send(w.t(), null, delete(FINANCE + "/rollovers/" + first).param("newActiveId", foreign)),
        422,
        "ROLLOVER_NEW_ACTIVE_INVALID");
    send(w.t(), null, delete(FINANCE + "/rollovers/" + first).param("newActiveId", second))
        .andExpect(status().isNoContent());
    assertThat(rollover(w, second).get("active").asBoolean()).isTrue();
    JsonNode live = list(w, account, false);
    assertThat(live).hasSize(1);
    JsonNode deleted = list(w, account, true);
    assertThat(deleted).hasSize(1);
    assertThat(deleted.get(0).get("id").asText()).isEqualTo(first);
    assertThat(deleted.get(0).get("deletedBy").isNull()).isFalse();
    assertThat(deleted.get(0).get("deletedAt").isNull()).isFalse();
    assertThat(deleted.get(0).get("active").asBoolean()).isFalse();
    expect(
        sendJson(
            w.t(),
            null,
            put(FINANCE + "/rollovers/" + first),
            Map.of("rolloverDate", "2026-01-03", "seasonName", "Silinmiş")),
        404,
        "ROLLOVER_NOT_FOUND");

    // Geri getir: pasif gelir; silinmemişi geri getirmek 409.
    send(w.t(), null, post(FINANCE + "/rollovers/" + first + "/restore"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.active").value(false))
        .andExpect(jsonPath("$.deletedAt").doesNotExist());
    expect(
        send(w.t(), null, post(FINANCE + "/rollovers/" + first + "/restore")),
        409,
        "ROLLOVER_NOT_DELETED");
    assertThat(activeCount(w, account)).isEqualTo(1);

    // Aynı tarihte silinmemiş sezon varken geri getirme 409.
    send(w.t(), null, delete(FINANCE + "/rollovers/" + first)).andExpect(status().isNoContent());
    id(create(w, null, account, "2026-01-02", "Aynı tarih"));
    expect(
        send(w.t(), null, post(FINANCE + "/rollovers/" + first + "/restore")),
        409,
        "ROLLOVER_DATE_TAKEN");

    // Son aktif sezon tek başına silinebilir (yeni aktif gerekmez).
    UUID single = account(w, AccountType.SUPPLIER, null);
    String only = id(create(w, null, single, "2026-03-01", "Tek"));
    send(w.t(), null, delete(FINANCE + "/rollovers/" + only)).andExpect(status().isNoContent());
    assertThat(activeCount(w, single)).isZero();

    // Devir defter kaydı üretmez.
    assertThat(ledgerRows(w)).isEqualTo(ledgerRows);
  }

  @Test
  void yetkiVePersonelCarisiKurallari() throws Exception {
    World w = world("rovy");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    String accounting = userWithRole(w, "muhasebe", "ACCOUNTING");
    String finance = userWithRole(w, "finans", "FINANCE");

    // ACCOUNTING (FINANCE_MANAGE yok) yazamaz, okuyabilir.
    create(w, accounting, customer, "2026-01-01", "Yetkisiz").andExpect(status().isForbidden());
    send(w.t(), accounting, get(FINANCE + "/accounts/" + customer + "/rollovers"))
        .andExpect(status().isOk());

    // Personel carisinin sezonu FINANCE_EMPLOYEE_VIEW izni olmayana yok gibidir.
    String season = id(create(w, null, employee, "2026-01-01", "Personel"));
    expect(
        send(w.t(), finance, get(FINANCE + "/accounts/" + employee + "/rollovers")),
        404,
        "ACCOUNT_NOT_FOUND");
    expect(create(w, finance, employee, "2026-02-01", "Yeni"), 404, "ACCOUNT_NOT_FOUND");
    expect(
        sendJson(
            w.t(),
            finance,
            put(FINANCE + "/rollovers/" + season),
            Map.of("rolloverDate", "2026-01-05", "seasonName", "Değişti")),
        404,
        "ROLLOVER_NOT_FOUND");
    expect(
        send(w.t(), finance, post(FINANCE + "/rollovers/" + season + "/activate")),
        404,
        "ROLLOVER_NOT_FOUND");
    expect(
        send(w.t(), finance, delete(FINANCE + "/rollovers/" + season)), 404, "ROLLOVER_NOT_FOUND");
    expect(
        send(w.t(), finance, post(FINANCE + "/rollovers/" + season + "/restore")),
        404,
        "ROLLOVER_NOT_FOUND");
    assertThat(rollover(w, season).get("seasonName").asText()).isEqualTo("Personel");
    assertThat(rollover(w, season).get("active").asBoolean()).isTrue();
    expect(
        send(w.t(), null, post(FINANCE + "/rollovers/" + UUID.randomUUID() + "/activate")),
        404,
        "ROLLOVER_NOT_FOUND");
  }

  @Test
  void eszamanliIkiSezonOlusturmaTekAktifBirakir() throws Exception {
    World w = world("rovc");
    UUID account = account(w, AccountType.CUSTOMER, null);
    List<Integer> statuses =
        concurrently(
            () ->
                create(w, null, account, "2026-01-01", "Sezon 1")
                    .andReturn()
                    .getResponse()
                    .getStatus(),
            () ->
                create(w, null, account, "2026-02-01", "Sezon 2")
                    .andReturn()
                    .getResponse()
                    .getStatus());
    assertThat(statuses).containsOnly(201);
    assertThat(list(w, account, false)).hasSize(2);
    assertThat(activeCount(w, account)).isEqualTo(1);
  }

  // --- yardımcılar

  private org.springframework.test.web.servlet.ResultActions create(
      World w, String token, UUID accountId, String date, String season) throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("rolloverDate", date);
    body.put("seasonName", season);
    return sendJson(w.t(), token, post(FINANCE + "/accounts/" + accountId + "/rollovers"), body);
  }

  private JsonNode list(World w, UUID accountId, boolean deleted) throws Exception {
    return body(
        send(
                w.t(),
                null,
                get(FINANCE + "/accounts/" + accountId + "/rollovers")
                    .param("deleted", String.valueOf(deleted)))
            .andExpect(status().isOk()));
  }

  /** Sezonu silinmiş olsa da patron listesinden bulur. */
  private JsonNode rollover(World w, String id) throws Exception {
    UUID accountId =
        jdbc.queryForObject(
            "select account_id from \"%s\".account_rollover where id = ?".formatted(w.schema()),
            UUID.class,
            UUID.fromString(id));
    for (boolean deleted : List.of(false, true)) {
      for (JsonNode row : list(w, accountId, deleted)) {
        if (id.equals(row.get("id").asText())) {
          return row;
        }
      }
    }
    throw new AssertionError("Sezon yok: " + id);
  }

  private int activeCount(World w, UUID accountId) {
    return jdbc.queryForObject(
        "select count(*) from \"%s\".account_rollover where account_id = ? and active and not deleted"
            .formatted(w.schema()),
        Integer.class,
        accountId);
  }

  private long ledgerRows(World w) {
    return jdbc.queryForObject(
        "select count(*) from \"%s\".account_transaction".formatted(w.schema()), Long.class);
  }
}
