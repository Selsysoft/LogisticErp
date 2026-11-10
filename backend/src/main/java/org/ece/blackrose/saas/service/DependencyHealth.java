package org.ece.blackrose.saas.service;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.ece.blackrose.files.FileScanner;
import org.ece.blackrose.files.FileStorage;
import org.ece.blackrose.identity.security.SecurityProperties;
import org.ece.blackrose.identity.service.BulkMailClient;
import org.ece.blackrose.saas.service.PaymentProvider.PaymentProviders;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Dış bağımlılıkların (e-posta, dosya deposu, virüs tarayıcı, ödeme sağlayıcısı) erişilebilirliği.
 * E-posta gönderim hataları yalnız günlüğe yazıldığı için yanlış ayar ancak burada görünür.
 * Kontroller paralel ve zaman aşımlıdır; konsol sık yenilendiği için sonuç kısa süre saklanır.
 *
 * <p>Açılıştan kısa süre sonra ve dakikada bir arka planda da denetlenir: durum değişimi günlüğe
 * yazılır (her dakika aynı uyarı tekrarlanmaz) ve {@code blackrose_dependency_up} göstergesiyle
 * yayımlanır: 1 çalışıyor veya uyarı, 0 ulaşılamıyor, -1 tanımlı değil.
 */
@Component
public class DependencyHealth {

  public enum State {
    UP,
    DOWN,
    WARNING,
    NOT_CONFIGURED
  }

  public record Dependency(
      String key, String name, State state, String detail, long millis, boolean essential) {}

  static final Duration CACHE = Duration.ofSeconds(60);
  static final Duration TIMEOUT = Duration.ofSeconds(8);
  static final String METRIC = "blackrose.dependency.up";
  static final List<String> KEYS = List.of("mail", "maildomain", "storage", "scanner", "payment");

  /** Gönderen adresi, isteğe bağlı DKIM seçicisi ve DNS sorgusu. */
  public record MailDomain(String from, String dkimSelector, MailDomainRecords records) {}

  private static final Logger log = LoggerFactory.getLogger(DependencyHealth.class);

  private final ObjectProvider<JavaMailSender> mail;
  private final ObjectProvider<BulkMailClient> bulkMail;
  private final FileStorage storage;
  private final FileScanner scanner;
  private final PaymentProviders payments;
  private final MailDomain mailDomain;
  private final Clock clock;
  private final Duration timeout;
  private final ExecutorService executor =
      Executors.newCachedThreadPool(
          task -> {
            Thread thread = new Thread(task, "dependency-health");
            thread.setDaemon(true);
            return thread;
          });
  private volatile Snapshot last;
  private final Map<String, State> observed = new ConcurrentHashMap<>();

  private record Snapshot(Instant at, List<Dependency> dependencies) {}

  @FunctionalInterface
  private interface Probe {
    Dependency run() throws Exception;
  }

  @Autowired
  public DependencyHealth(
      ObjectProvider<JavaMailSender> mail,
      ObjectProvider<BulkMailClient> bulkMail,
      FileStorage storage,
      FileScanner scanner,
      PaymentProviders payments,
      MeterRegistry metrics,
      SecurityProperties security,
      @Value("${app.mail.dkim-selector:}") String dkimSelector) {
    this(
        mail,
        bulkMail,
        storage,
        scanner,
        payments,
        new MailDomain(
            security.mailFrom(), dkimSelector, new MailDomainRecords(MailDomainRecords.dns())),
        metrics,
        Clock.systemUTC(),
        TIMEOUT);
  }

  DependencyHealth(
      ObjectProvider<JavaMailSender> mail,
      ObjectProvider<BulkMailClient> bulkMail,
      FileStorage storage,
      FileScanner scanner,
      PaymentProviders payments,
      MailDomain mailDomain,
      MeterRegistry metrics,
      Clock clock,
      Duration timeout) {
    this.mailDomain = mailDomain;
    for (String key : KEYS) {
      Gauge.builder(METRIC, this, health -> health.gaugeOf(key))
          .tag("dependency", key)
          .description("1 çalışıyor veya uyarı, 0 ulaşılamıyor, -1 tanımlı değil")
          .register(metrics);
    }
    this.timeout = timeout;
    this.mail = mail;
    this.bulkMail = bulkMail;
    this.storage = storage;
    this.scanner = scanner;
    this.payments = payments;
    this.clock = clock;
  }

  public List<Dependency> check() {
    Snapshot snapshot = last;
    if (snapshot != null && snapshot.at().plus(CACHE).isAfter(clock.instant())) {
      return snapshot.dependencies();
    }
    List<Dependency> fresh = probeAll();
    last = new Snapshot(clock.instant(), fresh);
    record(fresh);
    return fresh;
  }

  /** Konsol açılmasa da yanlış ayar fark edilsin; ilk denetim açılışı geciktirmez. */
  @Scheduled(initialDelayString = "PT10S", fixedDelayString = "PT60S")
  public void refresh() {
    forget();
    check();
  }

  /** Göstergeler denetim yapmaz, son sonucu okur; ölçüm toplama isteği bekletilmez. */
  private double gaugeOf(String key) {
    Snapshot snapshot = last;
    if (snapshot == null) {
      return Double.NaN;
    }
    return snapshot.dependencies().stream()
        .filter(dependency -> dependency.key().equals(key))
        .findFirst()
        .map(
            dependency ->
                switch (dependency.state()) {
                  case UP, WARNING -> 1.0;
                  case DOWN -> 0.0;
                  case NOT_CONFIGURED -> -1.0;
                })
        .orElse(Double.NaN);
  }

  /** Yalnız ilk gözlem ve durum değişimi günlüğe yazılır. */
  private void record(List<Dependency> dependencies) {
    for (Dependency dependency : dependencies) {
      State previous = observed.put(dependency.key(), dependency.state());
      if (previous == dependency.state()) {
        continue;
      }
      if (dependency.state() == State.DOWN) {
        log.warn(
            "Dış bağlantı ulaşılamıyor: {} — {}{}",
            dependency.name(),
            dependency.detail(),
            previous == null ? "" : " (önceki durum: " + previous + ")");
      } else if (previous == State.DOWN) {
        log.info("Dış bağlantı düzeldi: {} — {}", dependency.name(), dependency.detail());
      } else {
        log.info(
            "Dış bağlantı: {} {} — {}", dependency.name(), dependency.state(), dependency.detail());
      }
    }
  }

  /** Bir sonraki çağrının yeniden denetlemesi için; ayar değişikliğinden sonra kullanılır. */
  public void forget() {
    last = null;
  }

  private List<Dependency> probeAll() {
    List<Probe> probes =
        List.of(this::mail, this::mailDomain, this::storage, this::scanner, this::payment);
    List<String> keys = KEYS;
    List<String> names =
        List.of(
            "E-posta", "Gönderen alan adı", "Dosya deposu", "Virüs tarama", "Ödeme sağlayıcısı");
    List<Boolean> essential = List.of(true, false, true, true, false);
    List<CompletableFuture<Dependency>> futures =
        probes.stream()
            .map(probe -> CompletableFuture.supplyAsync(() -> unchecked(probe), executor))
            .toList();
    return java.util.stream.IntStream.range(0, futures.size())
        .mapToObj(
            i -> {
              try {
                return futures.get(i).get(timeout.toMillis(), TimeUnit.MILLISECONDS);
              } catch (TimeoutException ex) {
                futures.get(i).cancel(true);
                return new Dependency(
                    keys.get(i),
                    names.get(i),
                    State.DOWN,
                    "Yanıt zamanında gelmedi (" + timeout.toMillis() + " ms).",
                    timeout.toMillis(),
                    essential.get(i));
              } catch (Exception ex) {
                Throwable cause = ex.getCause() != null ? ex.getCause() : ex;
                log.warn("{} denetlenemedi", names.get(i), cause);
                return new Dependency(
                    keys.get(i), names.get(i), State.DOWN, reason(cause), 0, essential.get(i));
              }
            })
        .toList();
  }

  private static Dependency unchecked(Probe probe) {
    try {
      return probe.run();
    } catch (RuntimeException ex) {
      throw ex;
    } catch (Exception ex) {
      throw new IllegalStateException(ex.getMessage(), ex);
    }
  }

  private Dependency mail() throws Exception {
    BulkMailClient bulk = bulkMail.getIfAvailable();
    if (bulk != null) {
      long started = System.nanoTime();
      BulkMailClient.KeyInfo key = bulk.whoAmI();
      boolean live = "live".equals(key.mode());
      return new Dependency(
          "mail",
          "E-posta",
          live ? State.UP : State.WARNING,
          live
              ? "BulkMail (canlı anahtar)"
              : "BulkMail test anahtarı: yalnız doğrulanmış sandbox alıcılarına gider.",
          millisSince(started),
          true);
    }
    JavaMailSender sender = mail.getIfAvailable();
    if (!(sender instanceof JavaMailSenderImpl smtp) || smtp.getHost() == null) {
      return new Dependency(
          "mail",
          "E-posta",
          State.NOT_CONFIGURED,
          "SMTP tanımlı değil; e-postalar yalnız günlüğe yazılır.",
          0,
          true);
    }
    long started = System.nanoTime();
    smtp.testConnection();
    return new Dependency(
        "mail",
        "E-posta",
        State.UP,
        "SMTP " + smtp.getHost() + ":" + smtp.getPort(),
        millisSince(started),
        true);
  }

  private Dependency storage() throws Exception {
    long started = System.nanoTime();
    storage.check();
    return new Dependency(
        "storage", "Dosya deposu", State.UP, storage.describe(), millisSince(started), true);
  }

  private Dependency scanner() throws Exception {
    if (!scanner.enabled()) {
      return new Dependency(
          "scanner",
          "Virüs tarama",
          State.NOT_CONFIGURED,
          "Kapalı; yüklenen dosyalar taranmaz.",
          0,
          true);
    }
    long started = System.nanoTime();
    scanner.check();
    return new Dependency(
        "scanner", "Virüs tarama", State.UP, "ClamAV", millisSince(started), true);
  }

  /**
   * Eksik kayıt veya DNS'e ulaşılamaması uyarıdır, genel durumu düşürmez: gönderim sürer ama
   * e-postalar istenmeyen postaya düşebilir.
   */
  private Dependency mailDomain() {
    String name = "Gönderen alan adı";
    BulkMailClient bulk = bulkMail.getIfAvailable();
    JavaMailSender sender = mail.getIfAvailable();
    boolean smtp = sender instanceof JavaMailSenderImpl impl && impl.getHost() != null;
    if (bulk == null && !smtp) {
      return new Dependency(
          "maildomain", name, State.NOT_CONFIGURED, "E-posta tanımlı değil.", 0, false);
    }
    if (bulk != null && bulk.isTestKey()) {
      return new Dependency(
          "maildomain",
          name,
          State.NOT_CONFIGURED,
          "Test anahtarı sandbox adresinden gönderir; alan adı canlı anahtarda denetlenir.",
          0,
          false);
    }
    String domain = MailDomainRecords.domainOf(mailDomain.from());
    if (domain == null) {
      return new Dependency(
          "maildomain", name, State.WARNING, "MAIL_FROM geçerli bir adres değil.", 0, false);
    }
    long started = System.nanoTime();
    MailDomainRecords.Report report;
    try {
      report = mailDomain.records().check(domain, mailDomain.dkimSelector());
    } catch (javax.naming.NamingException ex) {
      return new Dependency(
          "maildomain",
          name,
          State.WARNING,
          domain + ": DNS sorgulanamadı (" + reason(ex) + ")",
          millisSince(started),
          false);
    }
    List<String> missing = report.missing();
    String checked = report.dkim() == null ? "SPF, DMARC" : "SPF, DMARC, DKIM";
    return missing.isEmpty()
        ? new Dependency(
            "maildomain",
            name,
            State.UP,
            domain + ": " + checked + " tanımlı",
            millisSince(started),
            false)
        : new Dependency(
            "maildomain",
            name,
            State.WARNING,
            domain
                + ": "
                + String.join(", ", missing)
                + " kaydı yok; e-postalar istenmeyen postaya düşebilir.",
            millisSince(started),
            false);
  }

  private Dependency payment() {
    return payments
        .configured()
        .map(
            provider ->
                new Dependency(
                    "payment",
                    "Ödeme sağlayıcısı",
                    provider.test() ? State.WARNING : State.UP,
                    provider.test()
                        ? provider.describe() + "; gerçek tahsilat yapılmaz."
                        : provider.describe(),
                    0,
                    false))
        .orElseGet(
            () ->
                new Dependency(
                    "payment",
                    "Ödeme sağlayıcısı",
                    State.NOT_CONFIGURED,
                    "Tanımlı değil; faturalar elle ödendi işaretlenir.",
                    0,
                    false));
  }

  private static long millisSince(long started) {
    return TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
  }

  /** Ayrıntı yöneticiye gösterilir; parola veya anahtar içeren ham mesaj taşımaz. */
  private static String reason(Throwable error) {
    Throwable root = error;
    while (root.getCause() != null && root.getCause() != root) {
      root = root.getCause();
    }
    if (root instanceof java.net.UnknownHostException) {
      return "Sunucu adı çözülemedi.";
    }
    if (root instanceof java.net.ConnectException) {
      return "Bağlantı reddedildi.";
    }
    if (root instanceof java.net.SocketTimeoutException) {
      return "Bağlantı zaman aşımına uğradı.";
    }
    if (root instanceof jakarta.mail.AuthenticationFailedException) {
      return "Kimlik doğrulama başarısız.";
    }
    return error.getMessage() != null ? error.getMessage() : root.getClass().getSimpleName();
  }
}
