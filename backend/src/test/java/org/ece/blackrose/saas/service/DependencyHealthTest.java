package org.ece.blackrose.saas.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.net.ServerSocket;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.ece.blackrose.files.FileScanner;
import org.ece.blackrose.files.FileStorage;
import org.ece.blackrose.saas.service.DependencyHealth.Dependency;
import org.ece.blackrose.saas.service.DependencyHealth.State;
import org.ece.blackrose.saas.service.PaymentProvider.MockPaymentProvider;
import org.ece.blackrose.saas.service.PaymentProvider.PaymentProviders;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

class DependencyHealthTest {

  private final MutableClock clock = new MutableClock();
  private final AtomicInteger storageChecks = new AtomicInteger();

  @Test
  void eksikVeBozukBagimliliklariAyriAyriGosterir() throws Exception {
    JavaMailSenderImpl smtp = new JavaMailSenderImpl();
    smtp.setHost("localhost");
    smtp.setPort(closedPort());
    FileStorage broken =
        storage(
            () -> {
              throw new IOException("Dosya klasörüne yazılamıyor: /veri");
            });
    FileScanner off = disabledScanner();

    Map<String, Dependency> result =
        byKey(health(mailOf(smtp), broken, off, List.of(new MockPaymentProvider())).check());

    assertThat(result.get("mail").state()).isEqualTo(State.DOWN);
    assertThat(result.get("mail").detail()).isEqualTo("Bağlantı reddedildi.");
    assertThat(result.get("storage").state()).isEqualTo(State.DOWN);
    assertThat(result.get("storage").detail()).contains("yazılamıyor");
    assertThat(result.get("scanner").state()).isEqualTo(State.NOT_CONFIGURED);
    assertThat(result.get("payment").state()).isEqualTo(State.WARNING);
    assertThat(result.get("payment").detail()).contains("gerçek tahsilat yapılmaz");
  }

  @Test
  void smtpVeOdemeYoksaTanimliDegilDer() {
    Map<String, Dependency> result =
        byKey(health(mailOf(null), storage(() -> {}), scanner(), List.of()).check());

    assertThat(result.get("mail").state()).isEqualTo(State.NOT_CONFIGURED);
    assertThat(result.get("storage").state()).isEqualTo(State.UP);
    assertThat(result.get("scanner").state()).isEqualTo(State.UP);
    assertThat(result.get("payment").state()).isEqualTo(State.NOT_CONFIGURED);
  }

  @Test
  void sonucuBirDakikaSaklarVeIstenirseYenidenDenetler() {
    DependencyHealth health = health(mailOf(null), storage(() -> {}), scanner(), List.of());

    health.check();
    clock.advance(Duration.ofSeconds(59));
    health.check();
    assertThat(storageChecks).hasValue(1);

    clock.advance(Duration.ofSeconds(2));
    health.check();
    assertThat(storageChecks).hasValue(2);

    health.forget();
    health.check();
    assertThat(storageChecks).hasValue(3);
  }

  @Test
  void yanitVermeyenBagimlilikDigerleriniBekletmez() {
    FileStorage hanging = storage(() -> sleep(Duration.ofSeconds(5)));
    long started = System.nanoTime();

    Map<String, Dependency> result =
        byKey(health(mailOf(null), hanging, scanner(), List.of()).check());

    assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(3));
    assertThat(result.get("storage").state()).isEqualTo(State.DOWN);
    assertThat(result.get("storage").detail()).startsWith("Yanıt zamanında gelmedi");
    assertThat(result.get("scanner").state()).isEqualTo(State.UP);
  }

  // Yardımcılar

  private interface Check {
    void run() throws IOException;
  }

  private DependencyHealth health(
      ObjectProvider<JavaMailSender> mail,
      FileStorage storage,
      FileScanner scanner,
      List<PaymentProvider> providers) {
    return new DependencyHealth(
        mail, storage, scanner, new PaymentProviders(providers), clock, Duration.ofMillis(500));
  }

  private static ObjectProvider<JavaMailSender> mailOf(JavaMailSender sender) {
    StaticListableBeanFactory beans = new StaticListableBeanFactory();
    if (sender != null) {
      beans.addBean("mail", sender);
    }
    return beans.getBeanProvider(JavaMailSender.class);
  }

  private FileStorage storage(Check check) {
    return new FileStorage() {
      @Override
      public void write(String key, InputStream content, long size) {}

      @Override
      public InputStream read(String key) {
        return InputStream.nullInputStream();
      }

      @Override
      public void check() throws IOException {
        storageChecks.incrementAndGet();
        check.run();
      }

      @Override
      public String describe() {
        return "Deneme deposu";
      }
    };
  }

  private static FileScanner scanner() {
    return content -> null;
  }

  private static FileScanner disabledScanner() {
    return new FileScanner() {
      @Override
      public String findThreat(InputStream content) {
        return null;
      }

      @Override
      public boolean enabled() {
        return false;
      }
    };
  }

  private static Map<String, Dependency> byKey(List<Dependency> dependencies) {
    assertThat(dependencies)
        .extracting(Dependency::key)
        .containsExactly("mail", "storage", "scanner", "payment");
    return dependencies.stream()
        .collect(java.util.stream.Collectors.toMap(Dependency::key, item -> item));
  }

  private static int closedPort() throws IOException {
    try (ServerSocket server = new ServerSocket(0)) {
      return server.getLocalPort();
    }
  }

  private static void sleep(Duration duration) {
    try {
      Thread.sleep(duration.toMillis());
    } catch (InterruptedException ex) {
      Thread.currentThread().interrupt();
    }
  }

  private static final class MutableClock extends Clock {
    private Instant now = Instant.parse("2026-11-09T09:00:00Z");

    void advance(Duration duration) {
      now = now.plus(duration);
    }

    @Override
    public java.time.ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(java.time.ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return now;
    }
  }
}
