package org.ece.blackrose.identity.service;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.ece.blackrose.tenant.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * BulkMail (qrestos) HTTP API'siyle e-posta gönderir. Gönderim sağlayıcı tarafında kuyruğa alınır
 * (202); teslim sonucu daha sonra oluşur.
 *
 * <p>Ağ hatası, 429 ve 5xx aynı {@code Idempotency-Key} ile en çok iki kez yeniden denenir;
 * sağlayıcı aynı anahtarla ikinci e-posta göndermez. Diğer 4xx hatalar (bastırılmış alıcı,
 * doğrulanmamış alan adı, yetersiz kredi) yeniden denenmez. Hata hiçbir zaman çağırana fırlatılmaz:
 * SMTP gerçeklemesi gibi günlüğe yazılır, iş akışı sürer.
 */
public class BulkMailClient {

  /** Test anahtarları yalnız bu adresten gönderebilir. */
  static final String SANDBOX_FROM = "onboarding@sandbox.qrestos.com";

  private static final Logger log = LoggerFactory.getLogger(BulkMailClient.class);
  private static final int MAX_ATTEMPTS = 3;
  private static final Duration MAX_WAIT = Duration.ofSeconds(5);

  @JsonInclude(JsonInclude.Include.NON_NULL)
  record EmailRequest(
      String from,
      String to,
      String subject,
      String text,
      String html,
      Map<String, String> tags,
      @JsonProperty("track_opens") Boolean trackOpens,
      @JsonProperty("track_clicks") Boolean trackClicks) {}

  /** Anahtarın kimliği ve modu (test/live). */
  public record KeyInfo(String id, String mode) {}

  /** Bekleme süresini testte kısaltmak için. */
  @FunctionalInterface
  interface Sleeper {
    void sleep(Duration duration) throws InterruptedException;
  }

  private final RestClient client;
  private final String from;
  private final boolean testKey;
  private final Sleeper sleeper;

  public BulkMailClient(String baseUrl, String apiKey, String mailFrom) {
    this(defaultBuilder(baseUrl), apiKey, mailFrom, duration -> Thread.sleep(duration.toMillis()));
  }

  BulkMailClient(RestClient.Builder builder, String apiKey, String mailFrom, Sleeper sleeper) {
    this.client =
        builder
            .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
            .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
            .build();
    this.testKey = apiKey.startsWith("sk_test_");
    this.from = testKey ? sandboxFrom(mailFrom) : mailFrom;
    this.sleeper = sleeper;
    if (testKey) {
      log.warn(
          "BulkMail test anahtarı: e-postalar {} adresinden yalnız doğrulanmış sandbox alıcılarına"
              + " gider.",
          SANDBOX_FROM);
    }
  }

  static RestClient.Builder defaultBuilder(String baseUrl) {
    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
    factory.setConnectTimeout(Duration.ofSeconds(5));
    factory.setReadTimeout(Duration.ofSeconds(10));
    return RestClient.builder().baseUrl(baseUrl).requestFactory(factory);
  }

  public boolean isTestKey() {
    return testKey;
  }

  /** Gönderen adresi; test anahtarında görünen ad korunur, adres sandbox adresine çevrilir. */
  public String from() {
    return from;
  }

  /** Bağlantı ve anahtar denetimi; sağlık tablosu kullanır. Hata fırlatır. */
  public KeyInfo whoAmI() {
    JsonNode body = client.get().uri("/v1/me").retrieve().body(JsonNode.class);
    return new KeyInfo(body.path("id").asText(), body.path("mode").asText());
  }

  /**
   * E-postayı kuyruğa verir. Takip ve tıklama izleme açıkça kapatılır: davet ve şifre bağlantıları
   * yeniden yazılmamalı, bildirimlerde de izleme gerekmez.
   *
   * @return sağlayıcının e-posta kimliği; gönderilemediyse {@code null}
   */
  public String send(String to, String subject, String text, String html, String kind) {
    EmailRequest request =
        new EmailRequest(from, to, subject, text, html, tags(kind), false, false);
    String idempotencyKey = UUID.randomUUID().toString();
    for (int attempt = 1; ; attempt++) {
      try {
        JsonNode body =
            client
                .post()
                .uri("/v1/emails")
                .header("Idempotency-Key", idempotencyKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(request)
                .retrieve()
                .body(JsonNode.class);
        return body == null ? null : body.path("id").asText(null);
      } catch (RestClientResponseException ex) {
        HttpStatusCode status = ex.getStatusCode();
        boolean retryable = status.value() == 429 || status.is5xxServerError();
        if (!retryable || attempt >= MAX_ATTEMPTS) {
          log.error(
              "E-posta gönderilemedi (BulkMail {} {}, istek {}): {}",
              status.value(),
              errorCode(ex),
              ex.getResponseHeaders() == null
                  ? "-"
                  : ex.getResponseHeaders().getFirst("X-Request-Id"),
              kind);
          return null;
        }
        if (!pause(retryAfter(ex, attempt))) {
          return null;
        }
      } catch (ResourceAccessException ex) {
        if (attempt >= MAX_ATTEMPTS) {
          log.error("E-posta gönderilemedi (BulkMail'e ulaşılamadı): {}", kind, ex);
          return null;
        }
        if (!pause(backoff(attempt))) {
          return null;
        }
      }
    }
  }

  /**
   * Teslim bildirimi geldiğinde e-postanın türü ve hangi firmadan gittiği etiketlerden okunur.
   * Etiket değerleri yalnız harf, rakam, alt çizgi ve tire olabilir; firma kodları buna uyar.
   */
  static Map<String, String> tags(String kind) {
    Map<String, String> tags = new java.util.LinkedHashMap<>();
    tags.put("kind", kind);
    TenantContext.current()
        .map(TenantContext.Current::code)
        .filter(code -> code.matches("[A-Za-z0-9_-]{1,64}"))
        .ifPresent(code -> tags.put("tenant", code));
    return tags;
  }

  private boolean pause(Duration duration) {
    try {
      sleeper.sleep(duration);
      return true;
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
      return false;
    }
  }

  private static Duration backoff(int attempt) {
    return Duration.ofSeconds(1L << (attempt - 1));
  }

  /**
   * {@code Retry-After} saniyesine uyulur ama istek iş parçacığını uzun tutmamak için sınırlıdır.
   */
  private static Duration retryAfter(RestClientResponseException ex, int attempt) {
    String header =
        ex.getResponseHeaders() == null ? null : ex.getResponseHeaders().getFirst("Retry-After");
    Duration wait = backoff(attempt);
    if (header != null) {
      try {
        wait = Duration.ofSeconds(Long.parseLong(header.trim()));
      } catch (NumberFormatException ignored) {
        // Tarih biçimli Retry-After için üstel bekleme yeterlidir.
      }
    }
    return wait.compareTo(MAX_WAIT) > 0 ? MAX_WAIT : wait;
  }

  private static String errorCode(RestClientResponseException ex) {
    try {
      JsonNode error = ex.getResponseBodyAs(JsonNode.class);
      return error == null ? "-" : error.path("error").path("code").asText("-");
    } catch (RuntimeException unreadable) {
      return "-";
    }
  }

  /** "Ad <adres>" biçiminde ad korunur; ad yoksa uygulama adı kullanılır. */
  static String sandboxFrom(String mailFrom) {
    String name = "Blackrose";
    if (mailFrom != null) {
      int open = mailFrom.indexOf('<');
      if (open > 0) {
        String candidate = mailFrom.substring(0, open).trim().replace("\"", "");
        if (!candidate.isEmpty()) {
          name = candidate;
        }
      }
    }
    return name + " <" + SANDBOX_FROM + ">";
  }
}
