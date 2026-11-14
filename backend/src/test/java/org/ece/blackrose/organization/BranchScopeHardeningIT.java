package org.ece.blackrose.organization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.ece.blackrose.AbstractIntegrationTest;
import org.ece.blackrose.identity.domain.Permission;
import org.ece.blackrose.notification.DailyDigestMailer;
import org.ece.blackrose.tenant.TenantContext;
import org.ece.blackrose.tenant.repository.TenantRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * 12.1 K-1 LIMITED kapsam sertleştirmesi (§3.12): depo stok/hareket/sayım, filo belge/blok/ayar/
 * hatırlatma/uygunluk/maliyet, gümrük, GPS, eski e-belge ayarı, dosyalar, sürücü–kullanıcı bağı,
 * ödeme/tahsilat ve çekte fon, pano ve günlük özet. Her modülde ALL kullanıcının (patron) davranışı
 * değişmez.
 */
class BranchScopeHardeningIT extends AbstractIntegrationTest {

  private static final String WAREHOUSE = "/api/v1/warehouse";
  private static final String FLEET = "/api/v1/fleet";
  private static final String CUSTOMS = "/api/v1/customs";
  private static final String INTEGRATION = "/api/v1/integration";
  private static final String FINANCE = "/api/v1/finance";
  private static final String FILES = "/api/v1/files";
  private static final LocalDate TODAY = tenantToday();

  @Autowired TenantRepository tenants;
  @Autowired JdbcTemplate jdbc;
  @Autowired DailyDigestMailer digest;

  /**
   * A varsayılan şirket (A1, A2), B "SIR2" (B1); A1 ve A2'de kasa; her modül izni olan ve A1'e
   * sınırlı bir yönetici ({@code token}, rol {@code role}).
   */
  private record World(
      String t,
      String schema,
      String companyA,
      String companyB,
      String a1,
      String a2,
      String b1,
      String cashA1,
      String cashA2,
      String customer,
      String supplier,
      String role,
      String token) {}

  // --- depo ve gümrük

  @Test
  void depoVeGumrukSeferinVeDeponunIsYerineGoreSuzulur() throws Exception {
    World w = world("bhw");

    // Depo: göz, bakiye, hareket ve sayım A1 deposuyla sınırlı; A2 deposuna yazım 403.
    String whA1 = id(owner(w, post(WAREHOUSE + "/warehouses"), warehouse("D-A1", w.a1())));
    String whA2 = id(owner(w, post(WAREHOUSE + "/warehouses"), warehouse("D-A2", w.a2())));
    String binA1 = id(owner(w, post(WAREHOUSE + "/warehouses/" + whA1 + "/bins"), bin("G1")));
    String binA2 = id(owner(w, post(WAREHOUSE + "/warehouses/" + whA2 + "/bins"), bin("G2")));
    String item =
        id(
            owner(
                w,
                post(WAREHOUSE + "/items"),
                Map.of(
                    "accountId",
                    w.customer(),
                    "sku",
                    "SKU-1",
                    "name",
                    "Koli",
                    "unit",
                    "ADET",
                    "unitsPerBillingUnit",
                    "1")));
    owner(w, post(WAREHOUSE + "/receipts"), receipt(item, binA1, "5")).andExpect(created());
    owner(w, post(WAREHOUSE + "/receipts"), receipt(item, binA2, "7")).andExpect(created());

    assertThat(ids(asManager(w, get(WAREHOUSE + "/bins")))).containsExactly(binA1);
    assertThat(ids(body(owner(w, get(WAREHOUSE + "/bins")))))
        .containsExactlyInAnyOrder(binA1, binA2);
    expect(
        manager(w, get(WAREHOUSE + "/bins").param("warehouseId", whA2)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    assertThat(ids(asManager(w, get(WAREHOUSE + "/bins").param("warehouseId", whA1))))
        .containsExactly(binA1);
    expect(
        managerSave(w, post(WAREHOUSE + "/warehouses/" + whA2 + "/bins"), bin("G3")),
        403,
        "BRANCH_OUT_OF_SCOPE");
    managerSave(w, post(WAREHOUSE + "/warehouses/" + whA1 + "/bins"), bin("G4"))
        .andExpect(created());

    JsonNode balances = asManager(w, get(WAREHOUSE + "/balances")).get("content");
    assertThat(balances.findValuesAsText("warehouseId")).containsExactly(whA1);
    assertThat(body(owner(w, get(WAREHOUSE + "/balances"))).get("content")).hasSize(2);
    expect(
        manager(w, get(WAREHOUSE + "/balances").param("warehouseId", whA2)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    JsonNode movements = asManager(w, get(WAREHOUSE + "/movements")).get("content");
    assertThat(movements.findValuesAsText("warehouseName")).containsExactly("D-A1");
    assertThat(body(owner(w, get(WAREHOUSE + "/movements"))).get("content")).hasSize(2);
    expect(
        manager(w, get(WAREHOUSE + "/movements").param("warehouseId", whA2)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        managerSave(w, post(WAREHOUSE + "/receipts"), receipt(item, binA2, "1")),
        403,
        "BRANCH_OUT_OF_SCOPE");
    managerSave(w, post(WAREHOUSE + "/receipts"), receipt(item, binA1, "1")).andExpect(created());
    send(
            w.t(),
            w.token(),
            multipart(WAREHOUSE + "/opening-stock/preview")
                .file(new MockMultipartFile("file", "stok.csv", "text/csv", new byte[] {'x'}))
                .param("warehouseId", whA2)
                .param("date", TODAY.toString()))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("BRANCH_OUT_OF_SCOPE"));

    // Sayım: A2 sayımı listede yok, kimlikle ve satır girişinde 403; A2'de sayım açmak 403.
    JsonNode countA2 =
        body(
            owner(w, post(WAREHOUSE + "/counts"), Map.of("warehouseId", whA2, "date", today()))
                .andExpect(created()));
    String countA2Id = countA2.get("count").get("id").asText();
    String lineA2 = countA2.get("lines").get(0).get("id").asText();
    assertThat(asManager(w, get(WAREHOUSE + "/counts"))).isEmpty();
    assertThat(body(owner(w, get(WAREHOUSE + "/counts")))).hasSize(1);
    expect(manager(w, get(WAREHOUSE + "/counts/" + countA2Id)), 403, "BRANCH_OUT_OF_SCOPE");
    expect(
        managerSave(w, put(WAREHOUSE + "/count-lines/" + lineA2), Map.of("countedQuantity", "7")),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        managerSave(
            w,
            post(WAREHOUSE + "/counts/" + countA2Id + "/lines"),
            Map.of("binId", binA2, "itemId", item, "lotNo", "L9", "countedQuantity", "1")),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        manager(w, post(WAREHOUSE + "/counts/" + countA2Id + "/post")), 403, "BRANCH_OUT_OF_SCOPE");
    owner(w, put(WAREHOUSE + "/count-lines/" + lineA2), Map.of("countedQuantity", "7"))
        .andExpect(status().isNoContent());
    owner(w, get(WAREHOUSE + "/counts/" + countA2Id)).andExpect(status().isOk());
    JsonNode countA1 =
        body(
            managerSave(
                    w, post(WAREHOUSE + "/counts"), Map.of("warehouseId", whA1, "date", today()))
                .andExpect(created()));
    assertThat(ids(asManager(w, get(WAREHOUSE + "/counts"))))
        .containsExactly(countA1.get("count").get("id").asText());

    // Gümrük: listeler yalnız A1 seferlerininki; A2 seferine kayıt ve A2 beyannamesi 403.
    UUID pA1 = shipment(w, w.a1(), "SV-GA1");
    UUID pA2 = shipment(w, w.a2(), "SV-GA2");
    String decA1 = id(owner(w, post(CUSTOMS + "/declarations"), declaration(pA1)));
    String decA2 = id(owner(w, post(CUSTOMS + "/declarations"), declaration(pA2)));
    String trA1 = id(owner(w, post(CUSTOMS + "/transits"), transit(pA1, "T-1")));
    String trA2 = id(owner(w, post(CUSTOMS + "/transits"), transit(pA2, "T-2")));
    String crA1 = id(owner(w, post(CUSTOMS + "/crossings"), crossing(pA1)));
    String crA2 = id(owner(w, post(CUSTOMS + "/crossings"), crossing(pA2)));
    assertThat(ids(asManager(w, get(CUSTOMS + "/declarations")))).containsExactly(decA1);
    assertThat(ids(asManager(w, get(CUSTOMS + "/transits")))).containsExactly(trA1);
    assertThat(ids(asManager(w, get(CUSTOMS + "/crossings")))).containsExactly(crA1);
    assertThat(ids(body(owner(w, get(CUSTOMS + "/declarations")))))
        .containsExactlyInAnyOrder(decA1, decA2);
    assertThat(ids(body(owner(w, get(CUSTOMS + "/transits")))))
        .containsExactlyInAnyOrder(trA1, trA2);
    assertThat(ids(body(owner(w, get(CUSTOMS + "/crossings")))))
        .containsExactlyInAnyOrder(crA1, crA2);
    manager(w, get(CUSTOMS + "/declarations/" + decA1)).andExpect(status().isOk());
    expect(manager(w, get(CUSTOMS + "/declarations/" + decA2)), 403, "BRANCH_OUT_OF_SCOPE");
    expect(
        managerSave(
            w,
            post(CUSTOMS + "/declarations/" + decA2 + "/lines"),
            Map.of("hsCode", "8708", "description", "Parça", "value", "10")),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        managerSave(w, post(CUSTOMS + "/declarations"), declaration(pA2)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        managerSave(w, post(CUSTOMS + "/transits/" + trA2 + "/discharge"), Map.of("date", today())),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(manager(w, delete(CUSTOMS + "/crossings/" + crA2)), 403, "BRANCH_OUT_OF_SCOPE");
    assertThat(asManager(w, get(CUSTOMS + "/options")).get("shipments").findValuesAsText("id"))
        .containsExactly(pA1.toString());
    assertThat(body(owner(w, get(CUSTOMS + "/options"))).get("shipments").findValuesAsText("id"))
        .containsExactlyInAnyOrder(pA1.toString(), pA2.toString());

    // İzin belgesi kiracı geneli; kapsam dışı seferin numarası kullanımda gizli.
    String permit =
        id(
            owner(
                w,
                post(CUSTOMS + "/permits"),
                Map.of(
                    "number",
                    "IZ-1",
                    "kind",
                    "BILATERAL",
                    "country",
                    "DE",
                    "validFrom",
                    TODAY.minusDays(1).toString(),
                    "validTo",
                    TODAY.plusDays(30).toString(),
                    "quota",
                    5)));
    owner(w, post(CUSTOMS + "/permits/" + permit + "/usages"), usage(pA1)).andExpect(created());
    owner(w, post(CUSTOMS + "/permits/" + permit + "/usages"), usage(pA2)).andExpect(created());
    JsonNode permits = asManager(w, get(CUSTOMS + "/permits"));
    assertThat(permits).hasSize(1);
    Map<String, String> numbers = new HashMap<>();
    permits
        .get(0)
        .get("usages")
        .forEach(
            u -> numbers.put(u.get("shipmentId").asText(), u.get("shipmentNumber").textValue()));
    assertThat(numbers).containsEntry(pA1.toString(), "SV-GA1").containsEntry(pA2.toString(), null);
    assertThat(
            body(owner(w, get(CUSTOMS + "/permits")))
                .get(0)
                .get("usages")
                .findValuesAsText("shipmentNumber"))
        .containsExactlyInAnyOrder("SV-GA1", "SV-GA2");

    // Pano: açık transit sayısı seferin iş yerine göre.
    JsonNode board = asManager(w, get("/api/v1/reports/dashboard"));
    assertThat(board.get("customs").get("openTransits").asLong()).isEqualTo(1);
    assertThat(
            body(owner(w, get("/api/v1/reports/dashboard")))
                .get("customs")
                .get("openTransits")
                .asLong())
        .isEqualTo(2);
  }

  // --- filo, GPS, dosyalar, sürücü bağı, pano ve günlük özet

  @Test
  void filoGpsDosyaVeOzetIsYeriKapsaminaUyar() throws Exception {
    World w = world("bhf");
    String vA1 = vehicle(w, "34HA1", w.a1());
    String vA2 = vehicle(w, "34HA2", w.a2());
    String vNone = vehicle(w, "34HNN", null);
    String dA1 = driver(w, "S1", w.a1());
    String dA2 = driver(w, "S2", w.a2());
    for (String vehicle : List.of(vA1, vA2, vNone)) {
      owner(w, post(FLEET + "/VEHICLE/" + vehicle + "/documents"), document()).andExpect(created());
    }

    // Belge, takvim kapatması ve dosya: A2 aracı 403; A1 ve şubesiz araç açık.
    expect(
        managerSave(w, post(FLEET + "/VEHICLE/" + vA2 + "/documents"), document()),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(manager(w, get(FLEET + "/VEHICLE/" + vA2 + "/documents")), 403, "BRANCH_OUT_OF_SCOPE");
    expect(manager(w, get(FLEET + "/DRIVER/" + dA2 + "/blocks")), 403, "BRANCH_OUT_OF_SCOPE");
    String docA2 =
        body(owner(w, get(FLEET + "/VEHICLE/" + vA2 + "/documents"))).get(0).get("id").asText();
    expect(manager(w, delete(FLEET + "/documents/" + docA2)), 403, "BRANCH_OUT_OF_SCOPE");
    String blockA2 =
        id(
            owner(
                w,
                post(FLEET + "/VEHICLE/" + vA2 + "/blocks"),
                Map.of(
                    "startDate",
                    TODAY.plusDays(40).toString(),
                    "endDate",
                    TODAY.plusDays(41).toString(),
                    "reason",
                    "Bakım")));
    expect(manager(w, delete(FLEET + "/blocks/" + blockA2)), 403, "BRANCH_OUT_OF_SCOPE");
    manager(w, get(FLEET + "/VEHICLE/" + vNone + "/documents")).andExpect(status().isOk());
    managerSave(w, post(FLEET + "/VEHICLE/" + vA1 + "/documents"), document()).andExpect(created());

    expectFile(upload(w, w.token(), "VEHICLE", vA2), 403, "BRANCH_OUT_OF_SCOPE");
    expectFile(upload(w, w.token(), "COMPLIANCE_DOCUMENT", docA2), 403, "BRANCH_OUT_OF_SCOPE");
    String vehicleFile = fileId(upload(w, null, "VEHICLE", vA2));
    expect(
        manager(w, get(FILES).param("ownerType", "VEHICLE").param("ownerId", vA2)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(manager(w, get(FILES + "/" + vehicleFile + "/content")), 403, "BRANCH_OUT_OF_SCOPE");
    expect(manager(w, delete(FILES + "/" + vehicleFile)), 403, "BRANCH_OUT_OF_SCOPE");
    expect(
        manager(w, get(FILES).param("ownerType", "DRIVER").param("ownerId", dA2)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    fileId(upload(w, w.token(), "VEHICLE", vNone));
    assertThat(body(owner(w, get(FILES).param("ownerType", "VEHICLE").param("ownerId", vA2))))
        .hasSize(1);

    // Sefer dosyaları seferin iş yerine bağlı.
    UUID pA1 = shipment(w, w.a1(), "SV-FA1");
    UUID pA2 = shipment(w, w.a2(), "SV-FA2");
    String shipmentFile = fileId(upload(w, null, "SHIPMENT", pA2.toString()));
    expect(
        manager(w, get(FILES).param("ownerType", "SHIPMENT").param("ownerId", pA2.toString())),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(manager(w, get(FILES + "/" + shipmentFile + "/content")), 403, "BRANCH_OUT_OF_SCOPE");
    fileId(upload(w, w.token(), "SHIPMENT", pA1.toString()));
    owner(w, get(FILES + "/" + shipmentFile + "/content")).andExpect(status().isOk());

    // Ayar kiracı genelidir; hatırlatma, uygunluk ve maliyet A1 + şubesiz.
    expect(
        managerSave(
            w, put(FLEET + "/settings"), Map.of("blockOnExpired", false, "reminderDays", 30)),
        403,
        "BRANCH_SCOPE_ALL_REQUIRED");
    owner(w, put(FLEET + "/settings"), Map.of("blockOnExpired", false, "reminderDays", 30))
        .andExpect(status().isOk());
    // Araç başına tür başına son belge hatırlatılır: A1 (iki muayene → bir) ve şubesiz araç.
    assertThat(asManager(w, get(FLEET + "/reminders")).findValuesAsText("subjectId"))
        .containsExactlyInAnyOrder(vA1, vNone);
    assertThat(body(owner(w, get(FLEET + "/reminders"))).findValuesAsText("subjectId"))
        .contains(vA2);
    String from = TODAY.toString();
    String to = TODAY.plusDays(1).toString();
    assertThat(
            asManager(
                    w,
                    get(FLEET + "/availability")
                        .param("type", "VEHICLE")
                        .param("from", from)
                        .param("to", to))
                .findValuesAsText("subjectId"))
        .containsExactlyInAnyOrder(vA1, vNone);
    assertThat(
            asManager(
                    w,
                    get(FLEET + "/availability")
                        .param("type", "DRIVER")
                        .param("from", from)
                        .param("to", to))
                .findValuesAsText("subjectId"))
        .containsExactly(dA1);
    assertThat(
            body(owner(
                    w,
                    get(FLEET + "/availability")
                        .param("type", "VEHICLE")
                        .param("from", from)
                        .param("to", to)))
                .findValuesAsText("subjectId"))
        .containsExactlyInAnyOrder(vA1, vA2, vNone);
    expect(
        manager(w, get(FLEET + "/vehicles/" + vA2 + "/fuel-consumption")),
        403,
        "BRANCH_OUT_OF_SCOPE");
    manager(w, get(FLEET + "/vehicles/" + vA1 + "/fuel-consumption")).andExpect(status().isOk());
    owner(w, post(FLEET + "/vehicles/" + vA1 + "/expenses"), expense(w, w.a1()))
        .andExpect(created());
    owner(w, post(FLEET + "/vehicles/" + vNone + "/expenses"), expense(w, w.a2()))
        .andExpect(created());
    String costFrom = TODAY.minusDays(1).toString();
    assertThat(
            asManager(
                    w,
                    get(FLEET + "/reports/vehicle-costs").param("from", costFrom).param("to", to))
                .findValuesAsText("vehicleId"))
        .containsExactly(vA1);
    assertThat(
            body(owner(
                    w,
                    get(FLEET + "/reports/vehicle-costs").param("from", costFrom).param("to", to)))
                .findValuesAsText("vehicleId"))
        .containsExactlyInAnyOrder(vA1, vNone);

    // Seçenekler: fonların şirketi dolu, pasif tedarikçi yok.
    String passive = account(w.t(), "T2", "SUPPLIER");
    owner(w, patch(FINANCE + "/accounts/" + passive + "/active"), Map.of("active", false))
        .andExpect(status().isOk());
    JsonNode options = asManager(w, get(FLEET + "/options"));
    assertThat(options.get("funds").findValuesAsText("companyId")).containsOnly(w.companyA());
    assertThat(options.get("funds").findValuesAsText("kind")).containsOnly("CASH");
    assertThat(options.get("suppliers").findValuesAsText("id"))
        .contains(w.supplier())
        .doesNotContain(passive);

    // GPS: son konumlar ve bölge olayları süzülür; kapsam dışı aracın konumu yazılmaz.
    Instant at = Instant.now().minus(1, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS);
    JsonNode ingested =
        body(
            owner(
                    w,
                    post(INTEGRATION + "/gps/positions"),
                    Map.of(
                        "positions",
                        List.of(
                            position("34HA1", at), position("34HA2", at), position("34HNN", at))))
                .andExpect(status().isOk()));
    assertThat(ingested.get("stored").asInt()).isEqualTo(3);
    assertThat(asManager(w, get(INTEGRATION + "/gps/positions")).findValuesAsText("plate"))
        .containsExactlyInAnyOrder("34HA1", "34HNN");
    assertThat(body(owner(w, get(INTEGRATION + "/gps/positions"))).findValuesAsText("plate"))
        .containsExactlyInAnyOrder("34HA1", "34HA2", "34HNN");
    JsonNode limitedIngest =
        body(
            managerSave(
                    w,
                    post(INTEGRATION + "/gps/positions"),
                    Map.of(
                        "positions",
                        List.of(
                            position("34HA2", at.plusSeconds(60)),
                            position("34HA1", at.plusSeconds(60)))))
                .andExpect(status().isOk()));
    assertThat(limitedIngest.get("stored").asInt()).isEqualTo(1);
    assertThat(limitedIngest.get("unknownVehicles").asInt()).isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from \"%s\".vehicle_position where vehicle_id = ?"
                    .formatted(w.schema()),
                Long.class,
                UUID.fromString(vA2)))
        .isEqualTo(1);
    expect(manager(w, get(INTEGRATION + "/gps/shipments/" + pA2)), 403, "BRANCH_OUT_OF_SCOPE");
    manager(w, get(INTEGRATION + "/gps/shipments/" + pA1)).andExpect(status().isOk());
    Map<String, Object> zone =
        Map.of("name", "Depo", "latitude", "41.0", "longitude", "29.0", "radiusM", 500);
    expect(
        managerSave(w, post(INTEGRATION + "/gps/geofences"), zone),
        403,
        "BRANCH_SCOPE_ALL_REQUIRED");
    String zoneId = id(owner(w, post(INTEGRATION + "/gps/geofences"), zone));
    expect(
        manager(w, delete(INTEGRATION + "/gps/geofences/" + zoneId)),
        403,
        "BRANCH_SCOPE_ALL_REQUIRED");
    assertThat(asManager(w, get(INTEGRATION + "/gps/geofences"))).hasSize(1);
    Map<String, Object> route =
        Map.of("origin", "İstanbul", "destination", "Bursa", "distanceKm", "150", "minutes", 120);
    expect(
        managerSave(w, post(INTEGRATION + "/distances"), route), 403, "BRANCH_SCOPE_ALL_REQUIRED");
    String routeId = id(owner(w, post(INTEGRATION + "/distances"), route));
    expect(
        manager(w, delete(INTEGRATION + "/distances/" + routeId)),
        403,
        "BRANCH_SCOPE_ALL_REQUIRED");
    assertThat(asManager(w, get(INTEGRATION + "/distances"))).hasSize(1);
    // Bölgeye giriş olayları: A2 aracının olayı LIMITED kullanıcıya görünmez.
    Instant later = at.plusSeconds(600);
    owner(
            w,
            post(INTEGRATION + "/gps/positions"),
            Map.of(
                "positions",
                List.of(
                    position("34HA1", later, "41.0", "29.0"),
                    position("34HA2", later, "41.0", "29.0"))))
        .andExpect(status().isOk());
    assertThat(asManager(w, get(INTEGRATION + "/gps/events")).findValuesAsText("plate"))
        .containsExactly("34HA1");
    assertThat(body(owner(w, get(INTEGRATION + "/gps/events"))).findValuesAsText("plate"))
        .containsExactlyInAnyOrder("34HA1", "34HA2");

    // Sürücü–kullanıcı bağı: A2 sürücüsü 403; kapsam dışı (ALL) kullanıcı 403; A1 kullanıcısı 200.
    String driverEmail = "surucu@" + w.t() + ".test";
    String driverUserId = inviteDriver(w, driverEmail);
    expect(
        managerSave(w, put(FLEET + "/drivers/" + dA2 + "/user"), Map.of("email", driverEmail)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(manager(w, get(FLEET + "/drivers/" + dA2 + "/user")), 403, "BRANCH_OUT_OF_SCOPE");
    expect(
        managerSave(w, put(FLEET + "/drivers/" + dA1 + "/user"), Map.of("email", driverEmail)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    Map<String, Object> scope = new HashMap<>();
    scope.put("scope", "LIMITED");
    scope.put("branchIds", List.of(w.a1()));
    scope.put("defaultBranchId", w.a1());
    owner(w, put("/api/v1/identity/users/" + driverUserId + "/branch-scope"), scope)
        .andExpect(status().isOk());
    managerSave(w, put(FLEET + "/drivers/" + dA1 + "/user"), Map.of("email", driverEmail))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.email").value(driverEmail));

    // Pano: filo hatırlatma sayısı A1 + şubesiz araç belgeleri (A2 hariç).
    JsonNode board = asManager(w, get("/api/v1/reports/dashboard")).get("fleet");
    assertThat(board.get("overdueReminders").asLong() + board.get("upcomingReminders").asLong())
        .isEqualTo(2);
    JsonNode ownerBoard = body(owner(w, get("/api/v1/reports/dashboard"))).get("fleet");
    assertThat(
            ownerBoard.get("overdueReminders").asLong()
                + ownerBoard.get("upcomingReminders").asLong())
        .isEqualTo(3);

    // Günlük özet: LIMITED alıcıya yalnız kendi kapsamının içeriği, patrona tümü. (Zamanlanmış
    // koşuyla çakışmasın diye yarının özeti.)
    String managerEmail = "mudur@" + w.t() + ".test";
    String ownerMail = ownerEmail(w.t());
    int managerBefore = sent(managerEmail).size();
    int ownerBefore = sent(ownerMail).size();
    TenantContext.set(w.t(), w.schema());
    try {
      assertThat(digest.sendForCurrentTenant(TODAY.plusDays(1))).isGreaterThanOrEqualTo(2);
    } finally {
      TenantContext.clear();
    }
    List<Notice> managerDigest = digests(managerEmail, managerBefore);
    assertThat(managerDigest).hasSize(1);
    assertThat(managerDigest.get(0).text())
        .contains("34HA1")
        .contains("34HNN")
        .doesNotContain("34HA2");
    List<Notice> ownerDigest = digests(ownerMail, ownerBefore);
    assertThat(ownerDigest).hasSize(1);
    assertThat(ownerDigest.get(0).text()).contains("34HA1").contains("34HA2").contains("34HNN");
  }

  // --- fon kapsamı, eski e-belge ayarı ve personel carisi dosyaları

  @Test
  void fonEBelgeAyariVePersonelCarisiDosyalariKorunur() throws Exception {
    World w = world("bhc");

    // Ödeme/tahsilat: A1 iş yerinden A2 kasasıyla 403; A1 kasasıyla 201.
    expect(
        managerSave(w, post(FINANCE + "/collections"), cash(w.customer(), w.a1(), w.cashA2())),
        403,
        "BRANCH_OUT_OF_SCOPE");
    expect(
        managerSave(w, post(FINANCE + "/payments"), cash(w.supplier(), w.a1(), w.cashA2())),
        403,
        "BRANCH_OUT_OF_SCOPE");
    managerSave(w, post(FINANCE + "/collections"), cash(w.customer(), w.a1(), w.cashA1()))
        .andExpect(created());
    owner(w, post(FINANCE + "/collections"), cash(w.customer(), w.a1(), w.cashA2()))
        .andExpect(created());

    // Çek: A2 bankasına tahsile verme 403; A1 bankasına 200.
    String bankA1 = bank(w, "BANKA-A1", w.a1());
    String bankA2 = bank(w, "BANKA-A2", w.a2());
    Map<String, Object> checkBody = cash(w.customer(), w.a1(), null);
    checkBody.put("method", "CHECK");
    checkBody.put(
        "instrument",
        Map.of(
            "kind",
            "CHECK",
            "number",
            "C-1",
            "bankName",
            "Test Bank",
            "dueDate",
            TODAY.plusDays(60).toString()));
    String check =
        body(managerSave(w, post(FINANCE + "/collections"), checkBody).andExpect(created()))
            .get("instrumentId")
            .asText();
    expect(
        managerSave(w, post(FINANCE + "/instruments/" + check + "/transition"), toBank(bankA2)),
        403,
        "BRANCH_OUT_OF_SCOPE");
    managerSave(w, post(FINANCE + "/instruments/" + check + "/transition"), toBank(bankA1))
        .andExpect(status().isOk());

    // Eski e-belge ayarı varsayılan şirketin; o şirketi görmeyen LIMITED kullanıcıya kapalı.
    String bToken = limitedUser(w, "bmudur", w.role(), List.of(w.b1()));
    expect(
        send(w.t(), bToken, get(INTEGRATION + "/e-document-settings")),
        403,
        "COMPANY_OUT_OF_SCOPE");
    manager(w, get(INTEGRATION + "/e-document-settings")).andExpect(status().isOk());
    owner(w, get(INTEGRATION + "/e-document-settings")).andExpect(status().isOk());
    JsonNode bankOptions = asManager(w, get(INTEGRATION + "/options")).get("bankAccounts");
    assertThat(bankOptions.findValuesAsText("id")).containsExactly(bankA1);
    assertThat(bankOptions.findValuesAsText("companyId")).containsExactly(w.companyA());

    // Personel carisinin dosyaları FINANCE_EMPLOYEE_VIEW izni olmayana yokmuş gibi (404).
    String employee = account(w.t(), "P-1", "EMPLOYEE");
    String regular = account(w.t(), "M-2", "CUSTOMER");
    String employeeFile = fileId(upload(w, null, "ACCOUNT", employee));
    String regularFile = fileId(upload(w, null, "ACCOUNT", regular));
    String crmRole =
        role(
            w,
            "CRM_FIN",
            Set.of(
                Permission.CRM_VIEW,
                Permission.CRM_EDIT,
                Permission.FINANCE_VIEW,
                Permission.FINANCE_MANAGE));
    String crm = user(w, "crm", crmRole);
    expect(
        send(w.t(), crm, get(FILES).param("ownerType", "ACCOUNT").param("ownerId", employee)),
        404,
        "ACCOUNT_NOT_FOUND");
    expect(
        send(w.t(), crm, get(FILES + "/" + employeeFile + "/content")), 404, "ACCOUNT_NOT_FOUND");
    expect(send(w.t(), crm, delete(FILES + "/" + employeeFile)), 404, "ACCOUNT_NOT_FOUND");
    expectFile(upload(w, crm, "ACCOUNT", employee), 404, "ACCOUNT_NOT_FOUND");
    assertThat(
            body(
                send(w.t(), crm, get(FILES).param("ownerType", "ACCOUNT").param("ownerId", regular))
                    .andExpect(status().isOk())))
        .hasSize(1);
    send(w.t(), crm, get(FILES + "/" + regularFile + "/content")).andExpect(status().isOk());
    assertThat(body(owner(w, get(FILES).param("ownerType", "ACCOUNT").param("ownerId", employee))))
        .hasSize(1);
    owner(w, get(FILES + "/" + employeeFile + "/content")).andExpect(status().isOk());
    // Cari kartı ortak: LIMITED kullanıcı şubesiz carinin dosyasını görür.
    manager(w, get(FILES + "/" + regularFile + "/content")).andExpect(status().isOk());

    // Teklif dosyası şirket kapsamında: B teklifinin dosyası A1 kullanıcısına 403.
    Map<String, Object> quote = new HashMap<>();
    quote.put("accountId", w.customer());
    quote.put("currency", "TRY");
    quote.put("validUntil", TODAY.plusDays(30).toString());
    quote.put("companyId", w.companyB());
    String quoteB = id(owner(w, post("/api/v1/crm/quotes"), quote));
    String quoteFile = fileId(upload(w, null, "QUOTE", quoteB));
    expect(
        manager(w, get(FILES).param("ownerType", "QUOTE").param("ownerId", quoteB)),
        403,
        "COMPANY_OUT_OF_SCOPE");
    expect(manager(w, get(FILES + "/" + quoteFile + "/content")), 403, "COMPANY_OUT_OF_SCOPE");
    send(w.t(), bToken, get(FILES + "/" + quoteFile + "/content")).andExpect(status().isOk());
  }

  // --- kurulum

  private World world(String prefix) throws Exception {
    String t = prefix + "-" + Long.toString(System.nanoTime(), 36);
    createTenant(t);
    String schema = tenants.findByCode(t).orElseThrow().getSchemaName();
    String companyA =
        jdbc.queryForObject(
            "select id::text from \"%s\".company where is_default".formatted(schema), String.class);
    Map<String, Object> b = new HashMap<>();
    b.put("code", "SIR2");
    b.put("title", "Beta Lojistik AS");
    b.put("shortName", "Beta");
    b.put("taxIdType", "VKN");
    String companyB = id(sendJson(t, null, post("/api/v1/organization/companies"), b));
    String a1 = branch(t, "A1", companyA);
    String a2 = branch(t, "A2", companyA);
    String b1 = branch(t, "B1", companyB);
    String cashA1 = fund(t, "KASA-A1", a1);
    String cashA2 = fund(t, "KASA-A2", a2);
    String customer = account(t, "M1", "CUSTOMER");
    String supplier = account(t, "T1", "SUPPLIER");
    Set<Permission> permissions =
        Arrays.stream(Permission.values())
            .filter(p -> p != Permission.DRIVER_APP && p != Permission.SUBSCRIPTION_VIEW)
            .collect(Collectors.toSet());
    World partial =
        new World(
            t, schema, companyA, companyB, a1, a2, b1, cashA1, cashA2, customer, supplier, null,
            null);
    String role = role(partial, "SUBE_MUDURU", permissions);
    String token = limitedUser(partial, "mudur", role, List.of(a1));
    return new World(
        t, schema, companyA, companyB, a1, a2, b1, cashA1, cashA2, customer, supplier, role, token);
  }

  private String role(World w, String code, Set<Permission> permissions) throws Exception {
    return id(
        owner(
            w,
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
                permissions.stream().map(Enum::name).collect(Collectors.toSet()))));
  }

  /** Rolüyle davet eder (ALL kapsam) ve token döner. */
  private String user(World w, String name, String role) throws Exception {
    String email = name + "@" + w.t() + ".test";
    owner(
            w,
            post("/api/v1/identity/users"),
            Map.of("email", email, "fullName", name, "roleIds", List.of(role)))
        .andExpect(created());
    return acceptInviteAndLogin(w.t(), email);
  }

  /** Rolüyle davet eder, kapsamı verilen iş yerlerine daraltır ve token döner. */
  private String limitedUser(World w, String name, String role, List<String> branches)
      throws Exception {
    String token = user(w, name, role);
    Map<String, Object> scope = new HashMap<>();
    scope.put("scope", "LIMITED");
    scope.put("branchIds", branches);
    scope.put("defaultBranchId", branches.get(0));
    owner(
            w,
            put(
                "/api/v1/identity/users/"
                    + userId(w, name + "@" + w.t() + ".test")
                    + "/branch-scope"),
            scope)
        .andExpect(status().isOk());
    return token;
  }

  private String userId(World w, String email) throws Exception {
    for (JsonNode user :
        body(owner(w, get("/api/v1/identity/users").param("size", "100"))).get("content")) {
      if (email.equals(user.get("email").asText())) {
        return user.get("id").asText();
      }
    }
    throw new AssertionError(email);
  }

  /** DRIVER rolüyle davet eder; kullanıcı kimliğini döner. */
  private String inviteDriver(World w, String email) throws Exception {
    String roleId = null;
    for (JsonNode role : body(owner(w, get("/api/v1/identity/roles")))) {
      if ("DRIVER".equals(role.get("code").asText())) {
        roleId = role.get("id").asText();
      }
    }
    owner(
            w,
            post("/api/v1/identity/users"),
            Map.of("email", email, "fullName", "Sürücü", "roleIds", List.of(roleId)))
        .andExpect(created());
    acceptInviteAndLogin(w.t(), email);
    return userId(w, email);
  }

  private String branch(String t, String code, String companyId) throws Exception {
    return id(
        sendJson(
            t,
            null,
            post("/api/v1/organization/branches"),
            Map.of("code", code, "name", code + " Merkez", "companyId", companyId)));
  }

  private String fund(String t, String code, String branch) throws Exception {
    return id(
        sendJson(
            t,
            null,
            post(FINANCE + "/funds"),
            Map.of(
                "code",
                code,
                "name",
                code,
                "kind",
                "CASH",
                "currency",
                "TRY",
                "branchId",
                branch,
                "allowNegative",
                true)));
  }

  private String bank(World w, String code, String branch) throws Exception {
    return id(
        owner(
            w,
            post(FINANCE + "/funds"),
            Map.of(
                "code",
                code,
                "name",
                code,
                "kind",
                "BANK",
                "currency",
                "TRY",
                "branchId",
                branch,
                "bankName",
                "Test Bank",
                "allowNegative",
                true)));
  }

  private String account(String t, String code, String type) throws Exception {
    return id(
        sendJson(
            t,
            null,
            post(FINANCE + "/accounts"),
            Map.of("code", code, "name", code, "type", type)));
  }

  private String vehicle(World w, String plate, String branch) throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("plate", plate);
    body.put("kind", "TRUCK");
    body.put("ownership", "OWNED");
    body.put("status", "ACTIVE");
    body.put("branchId", branch);
    return id(owner(w, post(FLEET + "/vehicles"), body));
  }

  private String driver(World w, String code, String branch) throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("code", code);
    body.put("fullName", "Sürücü " + code);
    body.put("status", "ACTIVE");
    body.put("branchId", branch);
    return id(owner(w, post(FLEET + "/drivers"), body));
  }

  /** Şema nitelikli SQL ile sefer (fiyat alanları dolu, yükleme şimdi). */
  private UUID shipment(World w, String branch, String number) {
    OffsetDateTime now = OffsetDateTime.now(ZoneOffset.UTC);
    Map<String, Object> values = new HashMap<>();
    values.put("number", number);
    values.put("account_id", UUID.fromString(w.customer()));
    values.put("branch_id", UUID.fromString(branch));
    values.put("status", "PLANNED");
    values.put("planned_pickup", now.minusHours(2));
    values.put("planned_delivery", now.plusHours(2));
    values.put("net_amount", new BigDecimal("100"));
    values.put("vat_amount", new BigDecimal("20"));
    values.put("withholding_amount", BigDecimal.ZERO);
    values.put("total_amount", new BigDecimal("120"));
    values.put("breakdown", "{}");
    return new SchemaRows(jdbc).insert(w.schema(), "shipment", values);
  }

  private static Map<String, Object> warehouse(String code, String branch) {
    return Map.of("code", code, "name", code, "branchId", branch);
  }

  private static Map<String, Object> bin(String code) {
    return Map.of("code", code);
  }

  private static Map<String, Object> receipt(String item, String bin, String quantity) {
    return Map.of("itemId", item, "binId", bin, "quantity", quantity, "date", today());
  }

  private static Map<String, Object> declaration(UUID shipment) {
    return Map.of(
        "shipmentId",
        shipment,
        "type",
        "EXPORT",
        "customsOffice",
        "Halkalı",
        "declaredOn",
        today(),
        "currency",
        "EUR");
  }

  private static Map<String, Object> transit(UUID shipment, String number) {
    return Map.of(
        "shipmentId",
        shipment,
        "kind",
        "T1",
        "documentNo",
        number,
        "departureOffice",
        "Halkalı",
        "destinationOffice",
        "Kapıkule",
        "guarantee",
        Map.of("amount", "1000", "currency", "EUR"),
        "issuedOn",
        today(),
        "deadline",
        TODAY.plusDays(10).toString());
  }

  private static Map<String, Object> crossing(UUID shipment) {
    return Map.of("shipmentId", shipment, "gate", "Kapıkule", "direction", "EXIT", "date", today());
  }

  private static Map<String, Object> usage(UUID shipment) {
    return Map.of("shipmentId", shipment, "date", today());
  }

  private static Map<String, Object> document() {
    return Map.of(
        "docType", "INSPECTION", "number", "M-1", "expiresOn", TODAY.plusDays(5).toString());
  }

  private static Map<String, Object> expense(World w, String branch) {
    return Map.of(
        "kind",
        "MAINTENANCE",
        "date",
        today(),
        "money",
        Map.of("amount", "50", "currency", "TRY"),
        "branchId",
        branch,
        "supplierAccountId",
        w.supplier());
  }

  private static Map<String, Object> position(String plate, Instant at) {
    return position(plate, at, "40.0", "28.0");
  }

  private static Map<String, Object> position(
      String plate, Instant at, String latitude, String longitude) {
    return Map.of(
        "plate", plate, "recordedAt", at.toString(), "latitude", latitude, "longitude", longitude);
  }

  private static Map<String, Object> cash(String account, String branch, String fund) {
    Map<String, Object> body = new HashMap<>();
    body.put("method", "CASH");
    body.put("accountId", account);
    body.put("branchId", branch);
    if (fund != null) {
      body.put("fundAccountId", fund);
    }
    body.put("money", Map.of("amount", "10", "currency", "TRY"));
    body.put("date", today());
    // 12.2 B4: şirket dağılımı uyarısı onaylı (409 CONFIRMATION_REQUIRED olmasın).
    body.put("confirmWarnings", true);
    return body;
  }

  private static Map<String, Object> toBank(String fund) {
    return Map.of("toStatus", "AT_BANK", "date", today(), "fundAccountId", fund);
  }

  private static String today() {
    return TODAY.toString();
  }

  private ResultActions upload(World w, String token, String ownerType, String ownerId)
      throws Exception {
    return send(
        w.t(),
        token,
        multipart(FILES)
            .file(
                new MockMultipartFile(
                    "file",
                    "belge.pdf",
                    "application/pdf",
                    "%PDF-1.4 belge".getBytes(StandardCharsets.UTF_8)))
            .param("ownerType", ownerType)
            .param("ownerId", ownerId));
  }

  private String fileId(ResultActions upload) throws Exception {
    return body(upload.andExpect(created())).get("id").asText();
  }

  private static void expectFile(ResultActions result, int status, String code) throws Exception {
    expect(result, status, code);
  }

  /** {@code from} sırasından sonra gelen günlük özet e-postaları (anlık bildirimler hariç). */
  private static List<Notice> digests(String email, int from) {
    List<Notice> all = SENT_NOTICES.stream().filter(n -> n.email().equals(email)).toList();
    return all.subList(from, all.size()).stream()
        .filter(n -> n.text() != null && n.text().contains("Ayrıntılar: "))
        .toList();
  }

  private static List<Notice> sent(String email) {
    return SENT_NOTICES.stream().filter(n -> n.email().equals(email)).toList();
  }

  // --- istek yardımcıları

  private ResultActions owner(World w, MockHttpServletRequestBuilder request) throws Exception {
    return send(w.t(), null, request);
  }

  private ResultActions owner(World w, MockHttpServletRequestBuilder request, Object body)
      throws Exception {
    return sendJson(w.t(), null, request, body);
  }

  private JsonNode asManager(World w, MockHttpServletRequestBuilder request) throws Exception {
    return body(manager(w, request).andExpect(status().isOk()));
  }

  private ResultActions manager(World w, MockHttpServletRequestBuilder request) throws Exception {
    return send(w.t(), w.token(), request);
  }

  private ResultActions managerSave(World w, MockHttpServletRequestBuilder request, Object body)
      throws Exception {
    return sendJson(w.t(), w.token(), request, body);
  }

  /** {@code token} null ise patron. */
  private ResultActions send(String t, String token, MockHttpServletRequestBuilder request)
      throws Exception {
    return mvc.perform(request.with(token == null ? asOwner(t) : bearer(token)).with(tenant(t)));
  }

  private ResultActions sendJson(
      String t, String token, MockHttpServletRequestBuilder request, Object body) throws Exception {
    return send(
        t,
        token,
        request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)));
  }

  private String id(ResultActions actions) throws Exception {
    return body(actions.andExpect(created())).get("id").asText();
  }

  private static org.springframework.test.web.servlet.ResultMatcher created() {
    return status().isCreated();
  }

  private static List<String> ids(JsonNode rows) {
    List<String> ids = new ArrayList<>();
    rows.forEach(row -> ids.add(row.get("id").asText()));
    return ids;
  }

  private static void expect(ResultActions result, int status, String code) throws Exception {
    result.andExpect(status().is(status)).andExpect(jsonPath("$.code").value(code));
  }
}
