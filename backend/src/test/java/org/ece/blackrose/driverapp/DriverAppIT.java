package org.ece.blackrose.driverapp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.AbstractIntegrationTest;
import org.ece.blackrose.files.FakeFileScannerConfig;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

@Import(FakeFileScannerConfig.class)
class DriverAppIT extends AbstractIntegrationTest {

  private static final String BASE = "/api/v1/driver";
  private static final byte[] PNG = {(byte) 0x89, 'P', 'N', 'G', 1, 2, 3};
  private static final byte[] JPEG = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, 1, 2, 3};
  private static final LocalDate FAR = LocalDate.now().plusDays(400);
  private static final LocalDate TODAY = LocalDate.now().minusDays(1);
  private static final Instant START = Instant.now().plus(1, ChronoUnit.DAYS);

  private record Fixture(
      String tenant,
      String branch,
      String customer,
      String driverId,
      String accountId,
      String token) {
    RequestPostProcessor asDriver() {
      return request -> {
        AbstractIntegrationTest.tenant(tenant).postProcessRequest(request);
        bearer(token).postProcessRequest(request);
        return request;
      };
    }
  }

  @Test
  void driverSeesOnlyOwnTripsWithoutPricesAndCannotReachOtherData() throws Exception {
    Fixture f = fixture("drv-see");
    String mine = plannedTrip(f, f.driverId(), "34DS01");
    Fixture other = secondDriver(f, "S2", "drv2@drv-see.test");
    String theirs = plannedTrip(f, other.driverId(), "34DS02");

    JsonNode trips = body(driver(f, get(BASE + "/trips")).andExpect(status().isOk()));
    assertThat(trips).hasSize(1);
    JsonNode trip = trips.get(0);
    assertThat(trip.get("id").asText()).isEqualTo(mine);
    assertThat(trip.get("legs").get(0).get("plate").asText()).isEqualTo("34DS01");
    assertThat(trip.toString()).doesNotContain("manualNet").doesNotContain("revenue");

    driver(f, event(theirs, "LOADED"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("TRIP_NOT_FOUND"));
    driver(f, get("/api/v1/shipment/shipments")).andExpect(status().isForbidden());
    driver(f, get("/api/v1/finance/accounts")).andExpect(status().isForbidden());
    mvc.perform(get(BASE + "/trips").with(asOwner(f.tenant())))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.code").value("DRIVER_NOT_LINKED"));
  }

  @Test
  void statusEventsMoveShipmentAndRetryDoesNotRepeat() throws Exception {
    Fixture f = fixture("drv-evt");
    String trip = plannedTrip(f, f.driverId(), "34EV01");

    UUID clientId = UUID.randomUUID();
    JsonNode first = body(driver(f, event(trip, "LOADED", clientId)).andExpect(status().isOk()));
    assertThat(first.get("duplicate").asBoolean()).isFalse();
    assertThat(shipmentStatus(f, trip)).isEqualTo("LOADED");

    JsonNode retry = body(driver(f, event(trip, "LOADED", clientId)).andExpect(status().isOk()));
    assertThat(retry.get("duplicate").asBoolean()).isTrue();
    assertThat(retry.get("id").asText()).isEqualTo(first.get("id").asText());

    driver(f, event(trip, "BREAK")).andExpect(status().isOk());
    assertThat(shipmentStatus(f, trip)).isEqualTo("LOADED");

    // Reddedilen işlem anahtarı tüketmez.
    UUID rejected = UUID.randomUUID();
    driver(f, event(trip, "LOADED", rejected)).andExpect(status().isConflict());
    driver(f, event(trip, "IN_TRANSIT", rejected)).andExpect(status().isOk());
    assertThat(shipmentStatus(f, trip)).isEqualTo("IN_TRANSIT");

    driver(f, event(trip, "DELIVERED")).andExpect(status().isBadRequest());

    JsonNode events =
        body(
            mvc.perform(
                get("/api/v1/shipment/shipments/" + trip + "/timeline").with(asOwner(f.tenant()))));
    assertThat(events.toString()).contains("Sürücü: Mola").contains("41.0");
  }

  @Test
  void podRequiresSignatureThenDeliversAndRetryIsIdempotent() throws Exception {
    Fixture f = fixture("drv-pod");
    String trip = plannedTrip(f, f.driverId(), "34PD01");
    driver(f, event(trip, "LOADED")).andExpect(status().isOk());
    driver(f, event(trip, "IN_TRANSIT")).andExpect(status().isOk());

    UUID clientId = UUID.randomUUID();
    driver(f, pod(trip, clientId, null, null))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("SIGNATURE_REQUIRED"));
    driver(f, pod(trip, clientId, new byte[] {'<', 's', 'v', 'g'}, null))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("IMAGE_TYPE_INVALID"));
    assertThat(shipmentStatus(f, trip)).isEqualTo("IN_TRANSIT");

    JsonNode saved = body(driver(f, pod(trip, clientId, PNG, JPEG)).andExpect(status().isOk()));
    assertThat(saved.get("duplicate").asBoolean()).isFalse();
    assertThat(shipmentStatus(f, trip)).isEqualTo("DELIVERED");

    JsonNode retry = body(driver(f, pod(trip, clientId, PNG, JPEG)).andExpect(status().isOk()));
    assertThat(retry.get("duplicate").asBoolean()).isTrue();

    JsonNode files =
        body(
            mvc.perform(
                get("/api/v1/files")
                    .param("ownerType", "SHIPMENT")
                    .param("ownerId", trip)
                    .with(asOwner(f.tenant()))));
    assertThat(files).hasSize(2);
    assertThat(files.toString()).contains("imza-").contains("teslim-foto-");

    JsonNode pod =
        body(
            mvc.perform(
                get("/api/v1/shipment/shipments/" + trip + "/pod").with(asOwner(f.tenant()))));
    assertThat(pod.get("recipientName").asText()).isEqualTo("Alıcı");
    assertThat(pod.get("latitude").decimalValue()).isEqualByComparingTo("41.01");

    // Teslim edilen sefer listede kalır ama yeniden teslim edilemez.
    driver(f, pod(trip, UUID.randomUUID(), PNG, null)).andExpect(status().isConflict());
    assertThat(body(driver(f, get(BASE + "/trips")))).hasSize(1);
  }

  @Test
  void expenseStaysDraftUntilApprovedAndReachesDriverAccountOnClose() throws Exception {
    Fixture f = fixture("drv-exp");
    String trip = plannedTrip(f, f.driverId(), "34XP01");

    UUID clientId = UUID.randomUUID();
    JsonNode saved =
        body(driver(f, expense(trip, clientId, "250", "FUEL")).andExpect(status().isOk()));
    driver(f, expense(trip, clientId, "250", "FUEL"))
        .andExpect(jsonPath("$.duplicate").value(true));
    driver(f, expense(trip, UUID.randomUUID(), "0", "FUEL")).andExpect(status().isBadRequest());
    driver(f, expense(trip, UUID.randomUUID(), "10", "SUBCONTRACTOR"))
        .andExpect(status().isBadRequest());
    String rejectedId =
        body(driver(f, expense(trip, UUID.randomUUID(), "99", "TOLL")).andExpect(status().isOk()))
            .get("id")
            .asText();

    // Onay öncesi finans etkilenmez.
    assertThat(costCount(f, trip)).isZero();
    JsonNode pending =
        body(
            mvc.perform(get("/api/v1/shipment/driver-expenses").with(asOwner(f.tenant())))
                .andExpect(status().isOk()));
    assertThat(pending.get("content")).hasSize(2);
    assertThat(pending.toString()).contains("Sürücü S1");

    driver(f, post("/api/v1/shipment/driver-expenses/" + saved.get("id").asText() + "/approve"))
        .andExpect(status().isForbidden());

    owner(
            f,
            post("/api/v1/shipment/driver-expenses/" + saved.get("id").asText() + "/approve"),
            null)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("APPROVED"));
    owner(
            f,
            post("/api/v1/shipment/driver-expenses/" + saved.get("id").asText() + "/approve"),
            null)
        .andExpect(status().isConflict());
    owner(
            f,
            post("/api/v1/shipment/driver-expenses/" + rejectedId + "/reject"),
            Map.of("note", "Fiş yok"))
        .andExpect(status().isOk());
    assertThat(costCount(f, trip)).isEqualTo(1);

    JsonNode mine = body(driver(f, get(BASE + "/expenses")));
    assertThat(mine.toString()).contains("Fiş yok").contains("APPROVED");

    // Sefer kapanınca sürücü carisine alacak yazılır.
    driver(f, event(trip, "LOADED")).andExpect(status().isOk());
    driver(f, event(trip, "IN_TRANSIT")).andExpect(status().isOk());
    driver(f, pod(trip, UUID.randomUUID(), PNG, null)).andExpect(status().isOk());
    owner(
            f,
            post("/api/v1/shipment/shipments/" + trip + "/invoice"),
            Map.of(
                "invoiceDate",
                TODAY.toString(),
                "dueDate",
                LocalDate.now().plusDays(20).toString()))
        .andExpect(status().isCreated());
    owner(
            f,
            post("/api/v1/shipment/shipments/" + trip + "/close"),
            Map.of("date", TODAY.toString(), "dueDate", LocalDate.now().plusDays(20).toString()))
        .andExpect(status().isOk());
    assertThat(balance(f, f.accountId())).isEqualByComparingTo("-250");
  }

  @Test
  void positionNeedsActiveTripAndUsesOwnVehicle() throws Exception {
    Fixture f = fixture("drv-gps");
    String trip = plannedTrip(f, f.driverId(), "34GP01");
    Map<String, Object> position =
        Map.of("recordedAt", Instant.now().toString(), "latitude", "41.0", "longitude", "29.0");

    driver(f, json(post(BASE + "/positions"), position))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("NO_ACTIVE_TRIP"));

    driver(f, event(trip, "LOADED")).andExpect(status().isOk());
    driver(f, json(post(BASE + "/positions"), position)).andExpect(status().isNoContent());

    JsonNode positions =
        body(mvc.perform(get("/api/v1/integration/gps/positions").with(asOwner(f.tenant()))));
    assertThat(positions.toString()).contains("34GP01");
  }

  @Test
  void linkingChecksDriverPermissionAndOneUserPerDriver() throws Exception {
    Fixture f = fixture("drv-lnk");
    String url = "/api/v1/fleet/drivers/" + f.driverId() + "/user";
    JsonNode linked = body(mvc.perform(get(url).with(asOwner(f.tenant()))));
    assertThat(linked.get("email").asText()).isEqualTo("surucu@drv-lnk.test");

    String otherDriver = driverRecord(f.tenant(), "S9");
    owner(
            f,
            put("/api/v1/fleet/drivers/" + otherDriver + "/user"),
            Map.of("email", "surucu@drv-lnk.test"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("USER_ALREADY_LINKED"));
    owner(f, put("/api/v1/fleet/drivers/" + otherDriver + "/user"), Map.of("email", "yok@x.test"))
        .andExpect(status().isNotFound());

    invite(f.tenant(), "ops@drv-lnk.test", "OPERATIONS");
    owner(
            f,
            put("/api/v1/fleet/drivers/" + otherDriver + "/user"),
            Map.of("email", "ops@drv-lnk.test"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("USER_NOT_DRIVER"));

    Map<String, Object> unlink = new HashMap<>();
    unlink.put("email", null);
    owner(f, put(url), unlink).andExpect(status().isOk());
    driver(f, get(BASE + "/trips")).andExpect(status().isForbidden());
  }

  // Yardımcılar

  private Fixture fixture(String t) throws Exception {
    createTenant(t);
    String branch =
        created(
            ownerRaw(
                t,
                post("/api/v1/organization/branches"),
                Map.of("code", "S" + System.nanoTime(), "name", "Şube")));
    String customer =
        created(
            ownerRaw(
                t,
                post("/api/v1/finance/accounts"),
                Map.of("code", "M1", "name", "Müşteri", "type", "CUSTOMER")));
    Fixture base = new Fixture(t, branch, customer, null, null, null);
    return secondDriver(base, "S1", "surucu@" + t + ".test");
  }

  private Fixture secondDriver(Fixture base, String code, String email) throws Exception {
    String id = driverRecord(base.tenant(), code);
    String accountId =
        body(mvc.perform(get("/api/v1/fleet/drivers/" + id).with(asOwner(base.tenant()))))
            .get("accountId")
            .asText();
    invite(base.tenant(), email, "DRIVER");
    String token = acceptInviteAndLogin(base.tenant(), email);
    ownerRaw(base.tenant(), put("/api/v1/fleet/drivers/" + id + "/user"), Map.of("email", email))
        .andExpect(status().isOk());
    return new Fixture(base.tenant(), base.branch(), base.customer(), id, accountId, token);
  }

  private String driverRecord(String t, String code) throws Exception {
    String id =
        created(
            ownerRaw(
                t,
                post("/api/v1/fleet/drivers"),
                Map.of("code", code, "fullName", "Sürücü " + code, "status", "ACTIVE")));
    for (String type : List.of("LICENSE", "SRC", "PSYCHOTECHNIC")) {
      ownerRaw(
              t,
              post("/api/v1/fleet/DRIVER/" + id + "/documents"),
              Map.of("docType", type, "expiresOn", FAR.toString()))
          .andExpect(status().isCreated());
    }
    return id;
  }

  private void invite(String t, String email, String roleCode) throws Exception {
    String roleId = null;
    for (JsonNode role : body(mvc.perform(get("/api/v1/identity/roles").with(asOwner(t))))) {
      if (roleCode.equals(role.get("code").asText())) {
        roleId = role.get("id").asText();
      }
    }
    ownerRaw(
            t,
            post("/api/v1/identity/users"),
            Map.of("email", email, "fullName", "Test", "roleIds", List.of(roleId)))
        .andExpect(status().isCreated());
  }

  private String plannedTrip(Fixture f, String driverId, String plate) throws Exception {
    String vehicle =
        created(
            ownerRaw(
                f.tenant(),
                post("/api/v1/fleet/vehicles"),
                Map.of("plate", plate, "kind", "TRUCK", "ownership", "OWNED", "status", "ACTIVE")));
    for (String type : List.of("INSPECTION", "TRAFFIC_INSURANCE")) {
      ownerRaw(
              f.tenant(),
              post("/api/v1/fleet/VEHICLE/" + vehicle + "/documents"),
              Map.of("docType", type, "expiresOn", FAR.toString()))
          .andExpect(status().isCreated());
    }
    Map<String, Object> body = new HashMap<>();
    Instant start = START.plus(System.nanoTime() % 100_000, ChronoUnit.MINUTES);
    body.put("accountId", f.customer());
    body.put("branchId", f.branch());
    body.put("shipperName", "Gönderici");
    body.put("consigneeName", "Alıcı Firma");
    body.put("origin", "İstanbul");
    body.put("destination", "Ankara");
    body.put("plannedPickup", start.toString());
    body.put("plannedDelivery", start.plus(2, ChronoUnit.DAYS).toString());
    body.put("currency", "TRY");
    body.put("manualNet", "1000");
    body.put("cargo", List.of(Map.of("description", "Yük", "weightKg", "1000")));
    JsonNode shipment =
        body(
            ownerRaw(f.tenant(), post("/api/v1/shipment/shipments"), body)
                .andExpect(status().isCreated()));
    String id = shipment.get("id").asText();
    ownerRaw(
            f.tenant(),
            post(
                "/api/v1/shipment/legs/"
                    + shipment.get("legs").get(0).get("id").asText()
                    + "/assign"),
            Map.of("vehicleId", vehicle, "driverId", driverId))
        .andExpect(status().isOk());
    ownerRaw(
            f.tenant(),
            post("/api/v1/shipment/shipments/" + id + "/status"),
            Map.of("status", "PLANNED"))
        .andExpect(status().isOk());
    return id;
  }

  private MockHttpServletRequestBuilder event(String trip, String kind) throws Exception {
    return event(trip, kind, UUID.randomUUID());
  }

  private MockHttpServletRequestBuilder event(String trip, String kind, UUID clientId)
      throws Exception {
    Map<String, Object> body = new HashMap<>();
    body.put("clientId", clientId.toString());
    body.put("kind", kind);
    body.put("occurredAt", Instant.now().toString());
    body.put("latitude", "41.01");
    body.put("longitude", "28.97");
    return json(post(BASE + "/trips/" + trip + "/events"), body);
  }

  @Test
  void zararliVeyaTaranamayanDosyaKabulEdilmezVeSeferDegismez() throws Exception {
    Fixture f = fixture("drv-scan");
    String trip = plannedTrip(f, f.driverId(), "34DS90");
    driver(f, event(trip, "LOADED")).andExpect(status().isOk());
    driver(f, event(trip, "IN_TRANSIT")).andExpect(status().isOk());
    byte[] infected = withMarker(FakeFileScannerConfig.THREAT_MARKER);
    byte[] outage = withMarker(FakeFileScannerConfig.OUTAGE_MARKER);

    driver(f, pod(trip, UUID.randomUUID(), PNG, infected))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("FILE_INFECTED"));
    driver(f, pod(trip, UUID.randomUUID(), PNG, outage))
        .andExpect(status().isServiceUnavailable())
        .andExpect(jsonPath("$.code").value("FILE_SCAN_UNAVAILABLE"));
    assertThat(shipmentStatus(f, trip)).isEqualTo("IN_TRANSIT");
    assertThat(filesOf(f, trip)).isEmpty();

    mvc.perform(
            multipart("/api/v1/files")
                .file(new MockMultipartFile("file", "belge.txt", "text/plain", infected))
                .param("ownerType", "SHIPMENT")
                .param("ownerId", trip)
                .with(asOwner(f.tenant())))
        .andExpect(status().isUnprocessableEntity())
        .andExpect(jsonPath("$.code").value("FILE_INFECTED"));
    mvc.perform(
            multipart("/api/v1/files")
                .file(
                    new MockMultipartFile("file", "belge.txt", "text/plain", new byte[] {'o', 'k'}))
                .param("ownerType", "SHIPMENT")
                .param("ownerId", trip)
                .with(asOwner(f.tenant())))
        .andExpect(status().isCreated());
    assertThat(filesOf(f, trip)).hasSize(1);
  }

  private static byte[] withMarker(String marker) {
    byte[] text = marker.getBytes(java.nio.charset.StandardCharsets.ISO_8859_1);
    byte[] content = java.util.Arrays.copyOf(JPEG, JPEG.length + text.length);
    System.arraycopy(text, 0, content, JPEG.length, text.length);
    return content;
  }

  private JsonNode filesOf(Fixture f, String trip) throws Exception {
    return body(
        mvc.perform(
            get("/api/v1/files")
                .param("ownerType", "SHIPMENT")
                .param("ownerId", trip)
                .with(asOwner(f.tenant()))));
  }

  private MockMultipartHttpServletRequestBuilder pod(
      String trip, UUID clientId, byte[] signature, byte[] photo) {
    MockMultipartHttpServletRequestBuilder request = multipart(BASE + "/trips/" + trip + "/pod");
    request
        .param("clientId", clientId.toString())
        .param("recipientName", "Alıcı")
        .param("deliveredAt", Instant.now().toString())
        .param("latitude", "41.01")
        .param("longitude", "28.97");
    if (signature != null) {
      request.file(new MockMultipartFile("signature", "imza.png", "image/png", signature));
    }
    if (photo != null) {
      request.file(new MockMultipartFile("photo", "foto.jpg", "image/jpeg", photo));
    }
    return request;
  }

  private MockMultipartHttpServletRequestBuilder expense(
      String trip, UUID clientId, String amount, String kind) {
    MockMultipartHttpServletRequestBuilder request =
        multipart(BASE + "/trips/" + trip + "/expenses");
    request
        .param("clientId", clientId.toString())
        .param("kind", kind)
        .param("amount", amount)
        .param("currency", "TRY")
        .param("date", TODAY.toString());
    return request;
  }

  private MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, Object body)
      throws Exception {
    return request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
  }

  private ResultActions driver(Fixture f, MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request.with(f.asDriver()));
  }

  private ResultActions owner(Fixture f, MockHttpServletRequestBuilder request, Object body)
      throws Exception {
    return ownerRaw(f.tenant(), request, body);
  }

  private ResultActions ownerRaw(String t, MockHttpServletRequestBuilder request, Object body)
      throws Exception {
    if (body != null) {
      json(request, body);
    }
    return mvc.perform(request.with(asOwner(t)));
  }

  private String created(ResultActions actions) throws Exception {
    return body(actions.andExpect(status().isCreated())).get("id").asText();
  }

  private String shipmentStatus(Fixture f, String id) throws Exception {
    return body(mvc.perform(get("/api/v1/shipment/shipments/" + id).with(asOwner(f.tenant()))))
        .get("status")
        .asText();
  }

  private int costCount(Fixture f, String trip) throws Exception {
    return body(mvc.perform(
            get("/api/v1/shipment/shipments/" + trip + "/costs").with(asOwner(f.tenant()))))
        .size();
  }

  private BigDecimal balance(Fixture f, String account) throws Exception {
    JsonNode detail =
        body(mvc.perform(get("/api/v1/finance/accounts/" + account).with(asOwner(f.tenant()))));
    for (JsonNode row : detail.get("balances")) {
      if ("TRY".equals(row.get("currency").asText())) {
        return row.get("balance").decimalValue();
      }
    }
    return BigDecimal.ZERO;
  }
}
