package org.ece.blackrose.shipment.service;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import org.ece.blackrose.shipment.domain.Shipment;
import org.ece.blackrose.shipment.service.DeliveryNotifier.Kind;
import org.springframework.web.util.HtmlUtils;

/**
 * Müşteriye giden sefer e-postasının düz metin ve HTML hali. HTML yalnız satır içi stil kullanır,
 * dış görsel ve betik içermez (çoğu istemci uzak görseli engeller, betiği çalıştırmaz). Firma adı,
 * şehir gibi bütün değişken alanlar kaçışlanır.
 */
final class ShipmentNoticeEmail {

  record Content(String text, String html) {}

  private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm");
  private static final String BRAND = "#3a6ed1";
  private static final String INK = "#1f2937";
  private static final String MUTED = "#6b7280";

  private ShipmentNoticeEmail() {}

  /** Yalnız HTML'de anlamı olan karakterler; Türkçe harfler UTF-8 olarak kalır. */
  private static String escape(String value) {
    return HtmlUtils.htmlEscape(value, "UTF-8");
  }

  static Content build(Kind kind, String company, Shipment shipment, String url, ZoneId zone) {
    boolean departure = kind == Kind.DEPARTURE;
    String headline = departure ? "Gönderiniz yola çıktı" : "Gönderiniz teslim edildi";
    String route = shipment.getOrigin() + " → " + shipment.getDestination();
    List<String[]> rows = new ArrayList<>();
    rows.add(new String[] {"Sefer no", shipment.getNumber()});
    rows.add(new String[] {"Güzergâh", route});
    if (departure) {
      rows.add(
          new String[] {
            "Planlanan teslim", WHEN.format(shipment.getPlannedDelivery().atZone(zone))
          });
    }
    String action =
        departure
            ? "Gönderinin durumunu aşağıdaki bağlantıdan izleyebilirsiniz."
            : "Teslim zamanını ve sefer geçmişini aşağıdaki bağlantıdan görebilirsiniz.";
    String footer =
        "Bağlantı 60 gün geçerlidir. Bu e-postayı, "
            + company
            + " sizi sefer bildirimi alacak kişi olarak kaydettiği için aldınız.";
    return new Content(
        text(company, shipment, headline, rows, action, url, footer),
        html(company, headline, rows, action, url, footer));
  }

  private static String text(
      String company,
      Shipment shipment,
      String headline,
      List<String[]> rows,
      String action,
      String url,
      String footer) {
    StringBuilder text = new StringBuilder("Merhaba,\n\n");
    text.append(company)
        .append(" tarafından taşınan ")
        .append(shipment.getNumber())
        .append(" numaralı gönderiniz ")
        .append(headline.substring("Gönderiniz ".length()))
        .append(".\n\n");
    rows.forEach(row -> text.append(row[0]).append(": ").append(row[1]).append('\n'));
    return text.append('\n')
        .append(action)
        .append('\n')
        .append(url)
        .append("\n\n")
        .append(footer)
        .append('\n')
        .toString();
  }

  private static String html(
      String company,
      String headline,
      List<String[]> rows,
      String action,
      String url,
      String footer) {
    StringBuilder details = new StringBuilder();
    for (String[] row : rows) {
      details
          .append("<tr><td style=\"padding:6px 0;color:")
          .append(MUTED)
          .append(";width:40%\">")
          .append(escape(row[0]))
          .append("</td><td style=\"padding:6px 0;color:")
          .append(INK)
          .append(";font-weight:600\">")
          .append(escape(row[1]))
          .append("</td></tr>");
    }
    String link = escape(url);
    return "<!doctype html><html lang=\"tr\"><head><meta charset=\"utf-8\">"
        + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        + "<title>"
        + escape(headline)
        + "</title></head>"
        + "<body style=\"margin:0;padding:0;background:#f3f5f9;font-family:Arial,Helvetica,"
        + "sans-serif\">"
        + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\""
        + " style=\"background:#f3f5f9;padding:24px 12px\"><tr><td align=\"center\">"
        + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\""
        + " style=\"max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden\">"
        + "<tr><td style=\"background:"
        + BRAND
        + ";padding:20px 24px;color:#ffffff;font-size:18px;font-weight:700\">"
        + escape(company)
        + "</td></tr>"
        + "<tr><td style=\"padding:24px\">"
        + "<h1 style=\"margin:0 0 16px;font-size:22px;color:"
        + INK
        + "\">"
        + escape(headline)
        + "</h1>"
        + "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\""
        + " style=\"font-size:15px;margin-bottom:20px\">"
        + details
        + "</table>"
        + "<p style=\"margin:0 0 20px;font-size:15px;color:"
        + INK
        + "\">"
        + escape(action)
        + "</p>"
        + "<p style=\"margin:0 0 20px\"><a href=\""
        + link
        + "\" style=\"display:inline-block;background:"
        + BRAND
        + ";color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;"
        + "font-weight:700;font-size:15px\">Gönderiyi izle</a></p>"
        + "<p style=\"margin:0;font-size:12px;color:"
        + MUTED
        + ";word-break:break-all\">Düğme çalışmazsa bu adresi tarayıcınıza yapıştırın:<br>"
        + link
        + "</p></td></tr>"
        + "<tr><td style=\"padding:16px 24px;border-top:1px solid #e5e7eb;font-size:12px;"
        + "color:"
        + MUTED
        + "\">"
        + escape(footer)
        + "</td></tr></table></td></tr></table></body></html>";
  }
}
