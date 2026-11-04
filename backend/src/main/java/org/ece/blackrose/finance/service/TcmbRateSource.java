package org.ece.blackrose.finance.service;

import java.io.IOException;
import java.io.StringReader;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;
import org.xml.sax.SAXException;

/** TCMB günlük kur dosyası. Kur olarak döviz alış (ForexBuying) kullanılır. */
@Component
public class TcmbRateSource implements RateSource {

  private static final DateTimeFormatter TCMB_DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
  private static final int RATE_SCALE = 6;

  private final RestClient client = RestClient.create();
  private final String url;

  public TcmbRateSource(@Value("${app.finance.tcmb.url}") String url) {
    this.url = url;
  }

  @Override
  public List<FetchedRate> fetchLatest() {
    return parse(client.get().uri(url).retrieve().body(String.class));
  }

  static List<FetchedRate> parse(String xml) {
    try {
      DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
      factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
      factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
      Element root =
          factory
              .newDocumentBuilder()
              .parse(new InputSource(new StringReader(xml)))
              .getDocumentElement();
      LocalDate date = LocalDate.parse(root.getAttribute("Tarih"), TCMB_DATE);
      List<FetchedRate> rates = new ArrayList<>();
      NodeList currencies = root.getElementsByTagName("Currency");
      for (int i = 0; i < currencies.getLength(); i++) {
        Element currency = (Element) currencies.item(i);
        String buying = text(currency, "ForexBuying");
        if (buying.isEmpty()) {
          continue;
        }
        BigDecimal rate =
            new BigDecimal(buying)
                .divide(new BigDecimal(text(currency, "Unit")), RATE_SCALE, RoundingMode.HALF_UP);
        rates.add(new FetchedRate(currency.getAttribute("Kod"), date, rate));
      }
      return rates;
    } catch (ParserConfigurationException | SAXException | IOException ex) {
      throw new IllegalStateException("TCMB kur dosyası okunamadı", ex);
    }
  }

  private static String text(Element parent, String tag) {
    NodeList nodes = parent.getElementsByTagName(tag);
    return nodes.getLength() == 0 ? "" : nodes.item(0).getTextContent().trim();
  }
}
