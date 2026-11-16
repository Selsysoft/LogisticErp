package org.ece.blackrose.finance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.AccountType;
import org.junit.jupiter.api.Test;

/**
 * Çek/senet yaşam döngüsü (12.3_TASARIM §3.0–§3.2, §6.2 {@code InstrumentLifecycleIT}): geçiş
 * tablosu ve defter etkileri, emanet kasası, PATCH, kapsam ve yetki.
 */
class InstrumentLifecycleIT extends InstrumentTestSupport {

  @Test
  void gecisTablosuVeDefterEtkileri() throws Exception {
    World w = world("il1");
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    String bank2 = bankFund(w, "BANKA2-A1", w.a1(), "TRY");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID supplier = account(w, AccountType.SUPPLIER, null);

    // PORTFOLIO → COLLECTED tek adım: banka IN (kaynak INSTRUMENT/hareket), tahsil tarihi yazılır.
    JsonNode c1 = collectInstrument(w, customer, w.a1(), "100", instrumentData("CHECK", "1000001"));
    String check1 = c1.get("instrumentId").asText();
    expect(transition(w, null, check1, "COLLECTED", null), 400, "FUND_REQUIRED");
    transition(w, null, check1, "COLLECTED", bank)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("COLLECTED"));
    assertThat(
            count(
                w,
                "select count(*) from %s.fund_transaction t join %s.instrument_movement m"
                    + " on m.id = t.source_id where t.source_type = 'INSTRUMENT'"
                    + " and m.instrument_id = ?::uuid and m.to_status = 'COLLECTED'"
                    + " and m.fund_account_id = t.fund_account_id",
                check1))
        .isEqualTo(1);
    assertThat(fundNet(w, bank)).isEqualByComparingTo("100");
    assertThat(instrumentRow(w, check1).get("settled_date")).isNotNull();
    // Aynı geçişin tekrarı 409; fon satırı bir kez.
    expect(transition(w, null, check1, "COLLECTED", bank), 409, "INSTRUMENT_INVALID_TRANSITION");
    assertThat(fundNet(w, bank)).isEqualByComparingTo("100");
    // İptal ödeme/tahsilat kaydından; köken kayıt ayrıntıda.
    transition(w, null, check1, "CANCELLED", null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("INSTRUMENT_CANCEL_VIA_SETTLEMENT"))
        .andExpect(jsonPath("$.details[0]").value("settlementId=" + c1.get("id").asText()));
    expect(transition(w, null, check1, "ENDORSED", null), 400, "INSTRUMENT_ENDORSE_VIA_PAYMENT");

    // PORTFOLIO → RETURNED: keşideciye iade, cari DEBIT.
    String check2 =
        collectInstrument(w, customer, w.a1(), "40", instrumentData("CHECK", "1000002"))
            .get("instrumentId")
            .asText();
    assertThat(accountNet(w, customer)).isEqualByComparingTo("-140");
    transition(w, null, check2, "RETURNED", null).andExpect(status().isOk());
    assertThat(accountNet(w, customer)).isEqualByComparingTo("-100");
    assertThat(
            count(
                w,
                "select count(*) from %s.account_transaction where source_type = 'INSTRUMENT'"
                    + " and direction = 'DEBIT' and description = 'Çek/senet iadesi 1000002'"))
        .isEqualTo(1);
    expect(transition(w, null, check2, "PORTFOLIO", null), 409, "INSTRUMENT_INVALID_TRANSITION");

    // AT_BANK: başka bankaya tahsil 400; portföye geri alma banka bağını düşürür, emanet yazar.
    String check3 =
        collectInstrument(w, customer, w.a1(), "30", instrumentData("CHECK", "1000003"))
            .get("instrumentId")
            .asText();
    expect(transition(w, null, check3, "BOUNCED", null), 409, "INSTRUMENT_INVALID_TRANSITION");
    expect(transition(w, null, check3, "PROTESTED", null), 409, "INSTRUMENT_INVALID_TRANSITION");
    expect(transition(w, null, check3, "COLLATERAL", null), 409, "INSTRUMENT_INVALID_TRANSITION");
    transition(w, null, check3, "AT_BANK", bank).andExpect(status().isOk());
    expect(transition(w, null, check3, "COLLECTED", bank2), 400, "FUND_MISMATCH");
    transition(w, null, check3, "PORTFOLIO", null, Map.of("custodyFundId", w.fundA1()))
        .andExpect(status().isOk());
    Map<String, Object> back = instrumentRow(w, check3);
    assertThat(back.get("fund_account_id")).isNull();
    assertThat(back.get("custody_fund_id")).hasToString(w.fundA1());
    assertThat(
            row(
                    w,
                    "select fund_account_id::text as f from %s.instrument_movement"
                        + " where instrument_id = ?::uuid and from_status = 'AT_BANK'",
                    check3)
                .get("f"))
        .isEqualTo(w.fundA1());
    // Kasaya tahsil: emanet düşer.
    transition(w, null, check3, "COLLECTED_TO_CASH", w.fundA1()).andExpect(status().isOk());
    assertThat(instrumentRow(w, check3).get("custody_fund_id")).isNull();

    // Senet: teminat defter etkisiz; portföyden protesto = karşılıksız etkisi.
    String note =
        collectInstrument(w, customer, w.a1(), "70", instrumentData("NOTE", "SN-1"))
            .get("instrumentId")
            .asText();
    assertThat(instrumentRow(w, note).get("note_type")).isEqualTo("PLAIN");
    long ledgers = ledgerCount(w);
    long funds = fundLedgerCount(w);
    transition(w, null, note, "COLLATERAL", null).andExpect(status().isOk());
    transition(w, null, note, "PORTFOLIO", null).andExpect(status().isOk());
    assertThat(ledgerCount(w)).isEqualTo(ledgers);
    assertThat(fundLedgerCount(w)).isEqualTo(funds);
    expect(transition(w, null, note, "BOUNCED", null), 409, "INSTRUMENT_INVALID_TRANSITION");
    transition(w, null, note, "PROTESTED", null).andExpect(status().isOk());
    assertThat(
            count(
                w,
                "select count(*) from %s.account_transaction where source_type = 'INSTRUMENT'"
                    + " and direction = 'DEBIT' and description = 'Protestolu senet SN-1'"))
        .isEqualTo(1);
    expect(transition(w, null, note, "PROTESTED", null), 409, "INSTRUMENT_INVALID_TRANSITION");
    assertThat(ledgerCount(w)).isEqualTo(ledgers + 1);

    // Verilen senet protesto: tedarikçiye borç geri gelir (CREDIT); verilen çek ödendi: banka OUT.
    String issuedNote =
        payInstrument(w, supplier, w.a1(), "25", instrumentData("NOTE", "SN-2"))
            .get("instrumentId")
            .asText();
    transition(w, null, issuedNote, "PROTESTED", null).andExpect(status().isOk());
    assertThat(accountNet(w, supplier)).isEqualByComparingTo("0");
    String issuedCheck =
        payInstrument(w, supplier, w.a1(), "60", instrumentData("CHECK", "2000001"))
            .get("instrumentId")
            .asText();
    transition(w, null, issuedCheck, "PAID", bank).andExpect(status().isOk());
    assertThat(fundNet(w, bank)).isEqualByComparingTo("40");
    assertThat(instrumentRow(w, issuedCheck).get("settled_date")).isNotNull();
  }

  @Test
  void emanetKasasi() throws Exception {
    World w = world("il2");
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    UUID customer = account(w, AccountType.CUSTOMER, null);

    Map<String, Object> data = instrumentData("CHECK", "3000001");
    data.put("custodyFundId", w.fundA1());
    String check = collectInstrument(w, customer, w.a1(), "50", data).get("instrumentId").asText();
    assertThat(instrumentRow(w, check).get("custody_fund_id")).hasToString(w.fundA1());
    assertThat(
            row(
                    w,
                    "select fund_account_id::text as f from %s.instrument_movement"
                        + " where instrument_id = ?::uuid and from_status is null",
                    check)
                .get("f"))
        .isEqualTo(w.fundA1());

    // Uygunsuz emanet: banka 400, başka şirket 422, bankada başlayan çek 400, ödeme 400.
    Map<String, Object> bad = instrumentData("CHECK", "3000002");
    bad.put("custodyFundId", bank);
    expect(
        collect(w, null, instrumentBody(customer, w.a1(), "5", bad), null),
        400,
        "FUND_KIND_MISMATCH");
    bad.put("custodyFundId", w.fundB1());
    expect(
        collect(w, null, instrumentBody(customer, w.a1(), "5", bad), null),
        422,
        "COMPANY_MISMATCH");
    bad.put("custodyFundId", w.fundA1());
    bad.put("initialStatus", "AT_BANK");
    bad.put("fundAccountId", bank);
    expect(
        collect(w, null, instrumentBody(customer, w.a1(), "5", bad), null),
        400,
        "INSTRUMENT_CUSTODY_INVALID");

    // PUT custody: hareket yazılır, aynı kasaya tekrar istek yazmaz; başka şirket kasası 422.
    long before = movementCount(w, check);
    moveCustody(w, null, check, w.fundA2()).andExpect(status().isOk());
    assertThat(movementCount(w, check)).isEqualTo(before + 1);
    assertThat(
            row(
                w,
                "select note, fund_account_id::text as f from %s.instrument_movement"
                    + " where instrument_id = ?::uuid order by created_at desc limit 1",
                check))
        .containsEntry("note", "Kasa değişikliği")
        .containsEntry("f", w.fundA2());
    moveCustody(w, null, check, w.fundA2()).andExpect(status().isOk());
    assertThat(movementCount(w, check)).isEqualTo(before + 1);
    assertThat(audits(w, "INSTRUMENT_CUSTODY_MOVED", "INSTRUMENT:" + check)).isEqualTo(1);
    expect(moveCustody(w, null, check, w.fundB1()), 422, "COMPANY_MISMATCH");
    expect(moveCustody(w, null, check, bank), 400, "FUND_KIND_MISMATCH");
    moveCustody(w, null, check, null).andExpect(status().isOk());
    assertThat(instrumentRow(w, check).get("custody_fund_id")).isNull();
    // Defter etkisi yok; portföy dışındaki çekte 409.
    assertThat(fundLedgerCount(w)).isZero();
    transition(w, null, check, "AT_BANK", bank).andExpect(status().isOk());
    expect(moveCustody(w, null, check, w.fundA1()), 409, "INSTRUMENT_INVALID_TRANSITION");
  }

  @Test
  void alanDuzeltmesi() throws Exception {
    World w = world("il3");
    String bank = bankFund(w, "BANKA-A1", w.a1(), "TRY");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID supplier = account(w, AccountType.SUPPLIER, null);
    String check =
        collectInstrument(w, customer, w.a1(), "80", instrumentData("CHECK", "4000001"))
            .get("instrumentId")
            .asText();
    collectInstrument(w, customer, w.a1(), "10", instrumentData("CHECK", "4000002"));
    long ledgers = ledgerCount(w);
    long moves = movementCount(w, check);

    Map<String, Object> update = new HashMap<>();
    update.put("bankBranch", "  Kadıköy ");
    update.put("description", "Açıklama");
    update.put("drawerName", "Ahmet Yılmaz");
    update.put("dueDate", TODAY.plusDays(60).toString());
    update.put("issueDate", TODAY.minusDays(1).toString());
    patchInstrument(w, null, check, update)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.dueDate").value(TODAY.plusDays(60).toString()));
    assertThat(instrumentRow(w, check))
        .containsEntry("bank_branch", "Kadıköy")
        .containsEntry("drawer_name", "Ahmet Yılmaz")
        .containsEntry("description", "Açıklama");
    assertThat(ledgerCount(w)).isEqualTo(ledgers);
    assertThat(movementCount(w, check)).isEqualTo(moves);
    Map<String, Object> audit =
        row(w, "select details from %s.audit_log where event_type = 'INSTRUMENT_UPDATED'");
    assertThat((String) audit.get("details"))
        .isEqualTo("fields=dueDate,issueDate,bankBranch,drawerName,description")
        .doesNotContain("Ahmet");
    // Boş metin temizler; değişiklik yoksa denetim yazılmaz.
    patchInstrument(w, null, check, Map.of("description", " ")).andExpect(status().isOk());
    assertThat(instrumentRow(w, check).get("description")).isNull();
    patchInstrument(w, null, check, Map.of("bankBranch", "Kadıköy")).andExpect(status().isOk());
    assertThat(audits(w, "INSTRUMENT_UPDATED", "INSTRUMENT:" + check)).isEqualTo(2);

    expect(patchInstrument(w, null, check, Map.of("number", "12")), 400, "CHECK_NUMBER_INVALID");
    expect(
        patchInstrument(w, null, check, Map.of("number", "4000002")),
        409,
        "INSTRUMENT_NUMBER_TAKEN");
    patchInstrument(w, null, check, Map.of("number", "4000003")).andExpect(status().isOk());
    expect(
        patchInstrument(w, null, check, Map.of("issueDate", TODAY.plusDays(90).toString())),
        400,
        "INSTRUMENT_DATES_INVALID");
    expect(patchInstrument(w, null, check, Map.of("noteType", "BOND")), 400, "NOTE_TYPE_INVALID");

    // Son durumda vade değişmez; iade edilen çek hiç düzenlenmez.
    transition(w, null, check, "COLLECTED", bank).andExpect(status().isOk());
    expect(
        patchInstrument(w, null, check, Map.of("dueDate", TODAY.plusDays(70).toString())),
        409,
        "INSTRUMENT_NOT_EDITABLE");
    patchInstrument(w, null, check, Map.of("description", "Tahsil sonrası not"))
        .andExpect(status().isOk());
    String returned =
        collectInstrument(w, customer, w.a1(), "5", instrumentData("CHECK", "4000009"))
            .get("instrumentId")
            .asText();
    transition(w, null, returned, "RETURNED", null).andExpect(status().isOk());
    expect(
        patchInstrument(w, null, returned, Map.of("description", "x")),
        409,
        "INSTRUMENT_NOT_EDITABLE");

    // Koçandan seçilen çekin numarası değişmez.
    UUID leaf = leaves(w, bank, w.a1(), "5000001").get(0);
    Map<String, Object> issued = instrumentData("CHECK", "5000001");
    issued.put("fundAccountId", bank);
    issued.put("checkLeafId", leaf.toString());
    String own = payInstrument(w, supplier, w.a1(), "20", issued).get("instrumentId").asText();
    expect(
        patchInstrument(w, null, own, Map.of("number", "5000002")),
        409,
        "INSTRUMENT_LEAF_NUMBER_LOCKED");
  }

  @Test
  void kapsamYetkiVeIzolasyon() throws Exception {
    World w = world("il4");
    UUID customer = account(w, AccountType.CUSTOMER, null);
    UUID employee = account(w, AccountType.EMPLOYEE, null);
    String check =
        collectInstrument(w, customer, w.a1(), "10", instrumentData("CHECK", "6000001"))
            .get("instrumentId")
            .asText();
    String employeeCheck =
        collectInstrument(w, employee, w.a1(), "10", instrumentData("CHECK", "6000002"))
            .get("instrumentId")
            .asText();

    // LIMITED (yalnız A2) kullanıcı A1 çekinde 403.
    String limited = limitedUser(w, "sinirli", "FINANCE", List.of(w.a2()));
    transition(w, limited, check, "RETURNED", null).andExpect(status().isForbidden());
    patchInstrument(w, limited, check, Map.of("description", "x"))
        .andExpect(status().isForbidden());
    moveCustody(w, limited, check, w.fundA1()).andExpect(status().isForbidden());
    movements(w, limited, check).andExpect(status().isForbidden());

    // Personel carili çek, FINANCE_EMPLOYEE_VIEW izni olmayana yok (404).
    String finance = userWithRole(w, "finans", "FINANCE");
    expect(movements(w, finance, employeeCheck), 404, "INSTRUMENT_NOT_FOUND");
    expect(transition(w, finance, employeeCheck, "RETURNED", null), 404, "INSTRUMENT_NOT_FOUND");
    expect(
        patchInstrument(w, finance, employeeCheck, Map.of("description", "x")),
        404,
        "INSTRUMENT_NOT_FOUND");
    expect(moveCustody(w, finance, employeeCheck, w.fundA1()), 404, "INSTRUMENT_NOT_FOUND");
    movements(w, finance, check).andExpect(status().isOk());

    // Yalnız FINANCE_VIEW: PATCH/custody 403.
    String viewer = userWithRole(w, "muhasebe", "ACCOUNTING");
    patchInstrument(w, viewer, check, Map.of("description", "x")).andExpect(status().isForbidden());
    moveCustody(w, viewer, check, w.fundA1()).andExpect(status().isForbidden());

    // Kiracı izolasyonu ve olmayan çek: 404.
    World other = world("il4b");
    expect(movements(other, null, check), 404, "INSTRUMENT_NOT_FOUND");
    expect(
        patchInstrument(other, null, check, Map.of("description", "x")),
        404,
        "INSTRUMENT_NOT_FOUND");
    expect(transition(other, null, check, "RETURNED", null), 404, "INSTRUMENT_NOT_FOUND");
    expect(movements(w, null, UUID.randomUUID()), 404, "INSTRUMENT_NOT_FOUND");
  }
}
