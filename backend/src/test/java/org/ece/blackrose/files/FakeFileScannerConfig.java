package org.ece.blackrose.files;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/** İçeriğe göre karar veren tarayıcı. clamd protokolü ClamAvScannerTest'te sınanır. */
@TestConfiguration
public class FakeFileScannerConfig {

  public static final String THREAT_MARKER = "ZARARLI";
  public static final String OUTAGE_MARKER = "TARAYICI-KAPALI";

  @Bean
  @Primary
  FileScanner fakeFileScanner() {
    return content -> {
      String text = new String(content.readAllBytes(), StandardCharsets.ISO_8859_1);
      if (text.contains(OUTAGE_MARKER)) {
        throw new IOException("bağlantı yok");
      }
      return text.contains(THREAT_MARKER) ? "Test-Imzasi" : null;
    };
  }
}
