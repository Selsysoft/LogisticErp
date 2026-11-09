package org.ece.blackrose.shipment.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.time.ZoneId;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.service.DeliveryNotifier.Kind;
import org.junit.jupiter.api.Test;

class ShipmentNoticeEmailTest {

  private static final String URL = "https://app.example/track/acme/AbC_dEf-123";
  private static final ZoneId ISTANBUL = ZoneId.of("Europe/Istanbul");

  private static Shipment shipment(String origin) {
    Shipment shipment = mock(Shipment.class);
    when(shipment.getNumber()).thenReturn("SV-2026-000042");
    when(shipment.getOrigin()).thenReturn(origin);
    when(shipment.getDestination()).thenReturn("Ankara");
    when(shipment.getPlannedDelivery()).thenReturn(Instant.parse("2026-11-10T21:30:00Z"));
    return shipment;
  }

  @Test
  void yolaCikistaPlanlananTeslimFirmaninSaatiyleVeDugmeyleGider() {
    ShipmentNoticeEmail.Content content =
        ShipmentNoticeEmail.build(
            Kind.DEPARTURE, "Acme Lojistik", shipment("İstanbul"), URL, ISTANBUL);

    // 21:30 UTC, İstanbul'da ertesi gün 00:30'dur.
    assertThat(content.text())
        .contains("SV-2026-000042 numaralı gönderiniz yola çıktı.")
        .contains("Planlanan teslim: 11.11.2026 00:30")
        .contains(URL);
    assertThat(content.html())
        .contains("Gönderiniz yola çıktı")
        .contains("11.11.2026 00:30")
        .contains("<a href=\"" + URL + "\"")
        .contains("Gönderiyi izle")
        .doesNotContain("<script")
        .doesNotContain("<img");
  }

  @Test
  void teslimdePlanlananTeslimSatiriYoktur() {
    ShipmentNoticeEmail.Content content =
        ShipmentNoticeEmail.build(Kind.DELIVERY, "Acme Lojistik", shipment("İzmir"), URL, ISTANBUL);

    assertThat(content.text()).contains("gönderiniz teslim edildi.").doesNotContain("Planlanan");
    assertThat(content.html()).contains("Gönderiniz teslim edildi").doesNotContain("Planlanan");
  }

  @Test
  void degiskenAlanlarKacislanir() {
    ShipmentNoticeEmail.Content content =
        ShipmentNoticeEmail.build(
            Kind.DELIVERY,
            "<script>alert(1)</script> & Ortak",
            shipment("\"><img src=x onerror=alert(1)>"),
            URL,
            ISTANBUL);

    assertThat(content.html())
        .doesNotContain("<script>")
        .doesNotContain("<img")
        .contains("&lt;script&gt;alert(1)&lt;/script&gt; &amp; Ortak")
        .contains("&quot;&gt;&lt;img src=x onerror=alert(1)&gt;");
    // Düz metin kaçışlanmaz; istemci onu HTML olarak yorumlamaz.
    assertThat(content.text()).contains("<script>alert(1)</script> & Ortak");
  }
}
