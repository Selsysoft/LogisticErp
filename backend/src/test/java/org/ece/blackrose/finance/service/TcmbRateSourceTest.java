package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.List;
import org.ece.blackrose.finance.service.RateSource.FetchedRate;
import org.junit.jupiter.api.Test;

class TcmbRateSourceTest {

  private static final String XML =
      """
      <?xml version="1.0" encoding="UTF-8"?>
      <Tarih_Date Tarih="04.11.2026" Date="11/04/2026" Bulten_No="2026/210">
        <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
          <Unit>1</Unit><ForexBuying>40.1234</ForexBuying><ForexSelling>40.2</ForexSelling>
        </Currency>
        <Currency CrossOrder="1" Kod="JPY" CurrencyCode="JPY">
          <Unit>100</Unit><ForexBuying>26.5000</ForexBuying><ForexSelling>26.6</ForexSelling>
        </Currency>
        <Currency CrossOrder="2" Kod="XDR" CurrencyCode="XDR">
          <Unit>1</Unit><ForexBuying></ForexBuying><ForexSelling></ForexSelling>
        </Currency>
      </Tarih_Date>
      """;

  @Test
  void parsesBuyingRatePerSingleUnitAndSkipsBlankRates() {
    List<FetchedRate> rates = TcmbRateSource.parse(XML);

    assertThat(rates).hasSize(2);
    assertThat(rates.get(0).currency()).isEqualTo("USD");
    assertThat(rates.get(0).date()).isEqualTo(LocalDate.of(2026, 11, 4));
    assertThat(rates.get(0).rate()).isEqualByComparingTo("40.1234");
    assertThat(rates.get(1).rate()).isEqualByComparingTo("0.265");
  }

  @Test
  void rejectsDocumentTypeDeclarations() {
    String malicious =
        """
        <?xml version="1.0"?>
        <!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
        <Tarih_Date Tarih="04.11.2026">&xxe;</Tarih_Date>
        """;

    assertThatThrownBy(() -> TcmbRateSource.parse(malicious))
        .isInstanceOf(IllegalStateException.class);
  }
}
