package org.ece.blackrose.saas.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class MailDomainRecordsTest {

  @Test
  void gondericidenAlanAdiCikarilir() {
    assertThat(MailDomainRecords.domainOf("noreply@Firma.Example")).isEqualTo("firma.example");
    assertThat(MailDomainRecords.domainOf("Blackrose <bildirim@firma.example>"))
        .isEqualTo("firma.example");
    assertThat(MailDomainRecords.domainOf("gecersiz")).isNull();
    assertThat(MailDomainRecords.domainOf(null)).isNull();
  }

  @Test
  void spfDmarcVeIstenirseDkimDenetlenir() throws Exception {
    Map<String, List<String>> dns =
        Map.of(
            "firma.example", List.of("google-site-verification=abc", "V=SPF1 -all"),
            "_dmarc.firma.example", List.of("v=DMARC1; p=reject"),
            "s1._domainkey.firma.example", List.of("v=DKIM1; k=rsa; p=MIIB"));
    MailDomainRecords records = new MailDomainRecords(name -> dns.getOrDefault(name, List.of()));

    MailDomainRecords.Report withoutSelector = records.check("firma.example", "");
    assertThat(withoutSelector.dkim()).isNull();
    assertThat(withoutSelector.missing()).isEmpty();

    assertThat(records.check("firma.example", "s1").missing()).isEmpty();
    assertThat(records.check("firma.example", "s2").missing()).containsExactly("DKIM");
    assertThat(records.check("baska.example", "").missing()).containsExactly("SPF", "DMARC");
  }
}
