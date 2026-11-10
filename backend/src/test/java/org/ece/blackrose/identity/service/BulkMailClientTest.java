package org.ece.blackrose.identity.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.headerDoesNotExist;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class BulkMailClientTest {

  private static final String URL = "https://bulk.test/v1/emails";
  private static final String QUEUED =
      "{\"object\":\"email\",\"id\":\"em_123\",\"status\":\"queued\"}";

  private final RestClient.Builder builder = RestClient.builder().baseUrl("https://bulk.test");
  private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
  private final List<Duration> waits = new ArrayList<>();

  private BulkMailClient client(String key, String from) {
    return new BulkMailClient(builder, key, from, waits::add);
  }

  @Test
  void canliAnahtarGondereniKorurIzlemeyiKapatirVeAnahtarlaKimlikDogrular() {
    server
        .expect(requestTo(URL))
        .andExpect(method(HttpMethod.POST))
        .andExpect(header(HttpHeaders.AUTHORIZATION, "Bearer sk_live_abc"))
        .andExpect(header("Idempotency-Key", org.hamcrest.Matchers.matchesPattern("[0-9a-f-]{36}")))
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$.from").value("Firma <noreply@mail.firma.example>"))
        .andExpect(jsonPath("$.to").value("ali@musteri.example"))
        .andExpect(jsonPath("$.subject").value("Seferiniz yola çıktı"))
        .andExpect(jsonPath("$.text").value("Metin"))
        .andExpect(jsonPath("$.html").value("<p>Metin</p>"))
        .andExpect(jsonPath("$.tags.kind").value("notice"))
        .andExpect(jsonPath("$.track_opens").value(false))
        .andExpect(jsonPath("$.track_clicks").value(false))
        .andRespond(
            withStatus(HttpStatus.ACCEPTED).body(QUEUED).contentType(MediaType.APPLICATION_JSON));

    String id =
        client("sk_live_abc", "Firma <noreply@mail.firma.example>")
            .send("ali@musteri.example", "Seferiniz yola çıktı", "Metin", "<p>Metin</p>", "notice");

    assertThat(id).isEqualTo("em_123");
    server.verify();
  }

  @Test
  void firmaBaglamindaGidenEpostaFirmaKoduylaEtiketlenir() {
    org.ece.blackrose.tenant.TenantContext.set("acme-lojistik", "tenant_acme");
    try {
      assertThat(BulkMailClient.tags("notice"))
          .containsEntry("kind", "notice")
          .containsEntry("tenant", "acme-lojistik");
    } finally {
      org.ece.blackrose.tenant.TenantContext.clear();
    }
    assertThat(BulkMailClient.tags("invite")).containsOnlyKeys("kind");
  }

  @Test
  void htmlYoksaAlanGonderilmez() {
    server
        .expect(requestTo(URL))
        .andExpect(jsonPath("$.html").doesNotExist())
        .andExpect(jsonPath("$.tags.kind").value("invite"))
        .andRespond(withSuccess(QUEUED, MediaType.APPLICATION_JSON));

    client("sk_live_abc", "noreply@firma.example")
        .send("a@b.example", "Konu", "Metin", null, "invite");
    server.verify();
  }

  @Test
  void testAnahtariSandboxAdresindenGonderirGorunenAdKorunur() {
    BulkMailClient client = client("sk_test_abc", "\"Firma Lojistik\" <noreply@firma.example>");
    assertThat(client.isTestKey()).isTrue();
    assertThat(client.from()).isEqualTo("Firma Lojistik <onboarding@sandbox.qrestos.com>");
    assertThat(BulkMailClient.sandboxFrom("noreply@firma.example"))
        .isEqualTo("Blackrose <onboarding@sandbox.qrestos.com>");
  }

  @Test
  void hizSiniriVeSunucuHatasiAyniAnahtarlaYenidenDenenir() {
    AtomicReference<String> firstKey = new AtomicReference<>();
    server
        .expect(requestTo(URL))
        .andExpect(request -> firstKey.set(request.getHeaders().getFirst("Idempotency-Key")))
        .andRespond(
            withStatus(HttpStatus.TOO_MANY_REQUESTS)
                .header("Retry-After", "2")
                .contentType(MediaType.APPLICATION_JSON)
                .body(
                    "{\"error\":{\"type\":\"rate_limit_error\",\"code\":\"rate_limit_exceeded\"}}"));
    server
        .expect(requestTo(URL))
        .andExpect(
            request ->
                assertThat(request.getHeaders().getFirst("Idempotency-Key"))
                    .isEqualTo(firstKey.get()))
        .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));
    server
        .expect(requestTo(URL))
        .andExpect(
            request ->
                assertThat(request.getHeaders().getFirst("Idempotency-Key"))
                    .isEqualTo(firstKey.get()))
        .andRespond(withSuccess(QUEUED, MediaType.APPLICATION_JSON));

    String id =
        client("sk_live_abc", "noreply@firma.example")
            .send("a@b.example", "K", "M", null, "notice");

    assertThat(id).isEqualTo("em_123");
    // Retry-After: 2 sn; ikinci denemede üstel bekleme 2 sn.
    assertThat(waits).containsExactly(Duration.ofSeconds(2), Duration.ofSeconds(2));
    server.verify();
  }

  @Test
  void uzunRetryAfterSinirlanirUcDenemedenSonraVazgecilir() {
    server
        .expect(ExpectedCount.times(3), requestTo(URL))
        .andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).header("Retry-After", "86400"));

    String id =
        client("sk_live_abc", "noreply@firma.example")
            .send("a@b.example", "K", "M", null, "notice");

    assertThat(id).isNull();
    assertThat(waits).containsExactly(Duration.ofSeconds(5), Duration.ofSeconds(5));
    server.verify();
  }

  @Test
  void bastirilmisAliciYenidenDenenmezHataFirlatilmaz() {
    server
        .expect(ExpectedCount.once(), requestTo(URL))
        .andRespond(
            withStatus(HttpStatus.UNPROCESSABLE_ENTITY)
                .contentType(MediaType.APPLICATION_JSON)
                .body(
                    "{\"error\":{\"type\":\"invalid_request_error\",\"code\":\"recipient_suppressed\"}}"));

    String id =
        client("sk_live_abc", "noreply@firma.example")
            .send("a@b.example", "K", "M", null, "notice");

    assertThat(id).isNull();
    assertThat(waits).isEmpty();
    server.verify();
  }

  @Test
  void agHatasiUstelBeklemeyleYenidenDenenir() {
    server
        .expect(ExpectedCount.twice(), requestTo(URL))
        .andRespond(withException(new IOException("bağlantı koptu")));
    server.expect(requestTo(URL)).andRespond(withSuccess(QUEUED, MediaType.APPLICATION_JSON));

    String id =
        client("sk_live_abc", "noreply@firma.example")
            .send("a@b.example", "K", "M", null, "notice");

    assertThat(id).isEqualTo("em_123");
    assertThat(waits).containsExactly(Duration.ofSeconds(1), Duration.ofSeconds(2));
    server.verify();
  }

  @Test
  void anahtarDenetimiKimlikVeModuDoner() {
    server
        .expect(requestTo("https://bulk.test/v1/me"))
        .andExpect(method(HttpMethod.GET))
        .andExpect(headerDoesNotExist("Idempotency-Key"))
        .andRespond(
            withSuccess(
                "{\"object\":\"api_key\",\"id\":\"key_9\",\"mode\":\"live\"}",
                MediaType.APPLICATION_JSON));

    BulkMailClient.KeyInfo info = client("sk_live_abc", "noreply@firma.example").whoAmI();

    assertThat(info.id()).isEqualTo("key_9");
    assertThat(info.mode()).isEqualTo("live");
    server.verify();
  }
}
