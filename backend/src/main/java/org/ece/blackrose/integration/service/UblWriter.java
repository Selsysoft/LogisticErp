package org.ece.blackrose.integration.service;

import java.io.StringWriter;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import javax.xml.stream.XMLOutputFactory;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamWriter;
import org.ece.blackrose.common.money.Money;

/**
 * UBL-TR biçimine yakın belge üretir. GİB şemasıyla doğrulanmamıştır; entegratör seçilince şematron
 * testinden geçirilmelidir. Metinler XML kütüphanesiyle kaçışlanır.
 */
final class UblWriter {

  private static final String INVOICE_NS = "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2";
  private static final String DESPATCH_NS =
      "urn:oasis:names:specification:ubl:schema:xsd:DespatchAdvice-2";
  private static final String CAC =
      "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2";
  private static final String CBC =
      "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2";

  record Party(String name, String taxNumber, String taxOffice, String address) {}

  record InvoiceData(
      String profile,
      String number,
      UUID ettn,
      LocalDate issueDate,
      Party supplier,
      Party customer,
      Money net,
      Money vat,
      Money withholding,
      Money total) {}

  record WaybillData(
      String number,
      UUID ettn,
      LocalDate issueDate,
      Party supplier,
      Party customer,
      String plates,
      String drivers,
      BigDecimal totalWeightKg) {}

  private UblWriter() {}

  static String invoice(InvoiceData data) {
    return write(
        INVOICE_NS,
        "Invoice",
        xml -> {
          header(xml, data.profile(), data.number(), data.ettn(), data.issueDate());
          text(xml, "InvoiceTypeCode", "SATIS");
          text(xml, "DocumentCurrencyCode", data.total().currency());
          party(xml, "AccountingSupplierParty", data.supplier());
          party(xml, "AccountingCustomerParty", data.customer());
          xml.writeStartElement(CAC, "TaxTotal");
          money(xml, "TaxAmount", data.vat());
          xml.writeEndElement();
          if (data.withholding().amount().signum() > 0) {
            xml.writeStartElement(CAC, "WithholdingTaxTotal");
            money(xml, "TaxAmount", data.withholding());
            xml.writeEndElement();
          }
          xml.writeStartElement(CAC, "LegalMonetaryTotal");
          money(xml, "LineExtensionAmount", data.net());
          money(xml, "PayableAmount", data.total());
          xml.writeEndElement();
          xml.writeStartElement(CAC, "InvoiceLine");
          text(xml, "ID", "1");
          money(xml, "LineExtensionAmount", data.net());
          xml.writeStartElement(CAC, "Item");
          text(xml, "Name", "Navlun bedeli");
          xml.writeEndElement();
          xml.writeEndElement();
        });
  }

  static String waybill(WaybillData data) {
    return write(
        DESPATCH_NS,
        "DespatchAdvice",
        xml -> {
          header(xml, "TEMELIRSALIYE", data.number(), data.ettn(), data.issueDate());
          text(xml, "DespatchAdviceTypeCode", "SEVK");
          party(xml, "DespatchSupplierParty", data.supplier());
          party(xml, "DeliveryCustomerParty", data.customer());
          xml.writeStartElement(CAC, "Shipment");
          text(xml, "ID", data.number());
          text(xml, "GrossWeightMeasure", data.totalWeightKg().toPlainString());
          xml.writeStartElement(CAC, "TransportHandlingUnit");
          text(xml, "ID", data.plates() == null ? "" : data.plates());
          text(xml, "Note", data.drivers() == null ? "" : data.drivers());
          xml.writeEndElement();
          xml.writeEndElement();
        });
  }

  private interface Body {
    void write(XMLStreamWriter xml) throws XMLStreamException;
  }

  private static String write(String namespace, String root, Body body) {
    StringWriter out = new StringWriter();
    try {
      XMLStreamWriter xml = XMLOutputFactory.newFactory().createXMLStreamWriter(out);
      xml.writeStartDocument("UTF-8", "1.0");
      xml.setDefaultNamespace(namespace);
      xml.setPrefix("cac", CAC);
      xml.setPrefix("cbc", CBC);
      xml.writeStartElement(namespace, root);
      xml.writeDefaultNamespace(namespace);
      xml.writeNamespace("cac", CAC);
      xml.writeNamespace("cbc", CBC);
      body.write(xml);
      xml.writeEndElement();
      xml.writeEndDocument();
      xml.close();
    } catch (XMLStreamException ex) {
      throw new IllegalStateException("UBL üretilemedi", ex);
    }
    return out.toString();
  }

  private static void header(
      XMLStreamWriter xml, String profile, String number, UUID ettn, LocalDate issueDate)
      throws XMLStreamException {
    text(xml, "UBLVersionID", "2.1");
    text(xml, "CustomizationID", "TR1.2");
    text(xml, "ProfileID", profile);
    text(xml, "ID", number);
    text(xml, "UUID", ettn.toString());
    text(xml, "IssueDate", issueDate.toString());
  }

  private static void party(XMLStreamWriter xml, String role, Party party)
      throws XMLStreamException {
    xml.writeStartElement(CAC, role);
    xml.writeStartElement(CAC, "Party");
    xml.writeStartElement(CAC, "PartyIdentification");
    xml.writeStartElement(CBC, "ID");
    xml.writeAttribute("schemeID", "VKN");
    xml.writeCharacters(party.taxNumber() == null ? "" : party.taxNumber());
    xml.writeEndElement();
    xml.writeEndElement();
    xml.writeStartElement(CAC, "PartyName");
    text(xml, "Name", party.name() == null ? "" : party.name());
    xml.writeEndElement();
    if (party.address() != null) {
      xml.writeStartElement(CAC, "PostalAddress");
      text(xml, "StreetName", party.address());
      xml.writeEndElement();
    }
    if (party.taxOffice() != null) {
      xml.writeStartElement(CAC, "PartyTaxScheme");
      xml.writeStartElement(CAC, "TaxScheme");
      text(xml, "Name", party.taxOffice());
      xml.writeEndElement();
      xml.writeEndElement();
    }
    xml.writeEndElement();
    xml.writeEndElement();
  }

  private static void money(XMLStreamWriter xml, String element, Money money)
      throws XMLStreamException {
    xml.writeStartElement(CBC, element);
    xml.writeAttribute("currencyID", money.currency());
    xml.writeCharacters(money.amount().toPlainString());
    xml.writeEndElement();
  }

  private static void text(XMLStreamWriter xml, String element, String value)
      throws XMLStreamException {
    xml.writeStartElement(CBC, element);
    xml.writeCharacters(value);
    xml.writeEndElement();
  }
}
