package org.ece.blackrose.shipment.service;

import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.pdf.BaseFont;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.shipment.domain.FreightInvoice;
import org.ece.blackrose.shipment.domain.ShipmentDocument;
import org.ece.blackrose.shipment.domain.ShipmentTypes.DocumentType;
import org.ece.blackrose.shipment.web.ShipmentDtos.CargoResponse;
import org.ece.blackrose.shipment.web.ShipmentDtos.DocumentContent;

/** CMR, irsaliye ve navlun faturası belgeleri. Yasal e-belge değildir; onlar Faz 8'de gelir. */
final class ShipmentPdf {

  private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
  private static final String ENCODING = "Cp1254";
  private static final int TITLE_SIZE = 15;
  private static final int BODY_SIZE = 10;
  private static final float SPACING = 10f;
  private static final float[] GOODS_WIDTHS = {6, 2, 2, 2, 2};
  private static final float[] INTERNATIONAL_GOODS_WIDTHS = {5, 2, 2, 2, 3};
  private static final int SMALL_SIZE = 7;
  private static final String CMR_CONVENTION_TR =
      "Bu taşıma, aksine hükümlere bakılmaksızın Karayoluyla Uluslararası Eşya Taşıma Sözleşmesi"
          + " Konvansiyonu'na (CMR) tabidir.";
  private static final String CMR_CONVENTION_EN =
      "This carriage is subject, notwithstanding any clause to the contrary, to the Convention on"
          + " the Contract for the International Carriage of Goods by Road (CMR).";
  private static final String CMR_CONVENTION_DE =
      "Diese Beförderung unterliegt trotz einer gegenteiligen Abmachung dem Übereinkommen über den"
          + " Beförderungsvertrag im internationalen Straßengüterverkehr (CMR).";

  private final Font body;
  private final Font strong;
  private final Font title;
  private final Font small;
  private final Font smallStrong;

  private ShipmentPdf() throws DocumentException, IOException {
    BaseFont regular = BaseFont.createFont(BaseFont.HELVETICA, ENCODING, BaseFont.NOT_EMBEDDED);
    BaseFont bold = BaseFont.createFont(BaseFont.HELVETICA_BOLD, ENCODING, BaseFont.NOT_EMBEDDED);
    body = new Font(regular, BODY_SIZE);
    strong = new Font(bold, BODY_SIZE);
    title = new Font(bold, TITLE_SIZE);
    small = new Font(regular, SMALL_SIZE);
    smallStrong = new Font(bold, SMALL_SIZE);
  }

  static byte[] document(ShipmentDocument document, DocumentContent content) {
    try {
      return new ShipmentPdf().renderDocument(document, content);
    } catch (DocumentException | IOException ex) {
      throw new IllegalStateException("Belge oluşturulamadı", ex);
    }
  }

  static byte[] invoice(FreightInvoice invoice, String companyName, String customerName) {
    try {
      return new ShipmentPdf().renderInvoice(invoice, companyName, customerName);
    } catch (DocumentException | IOException ex) {
      throw new IllegalStateException("Fatura belgesi oluşturulamadı", ex);
    }
  }

  private byte[] renderDocument(ShipmentDocument document, DocumentContent content)
      throws DocumentException {
    if (document.getType() == DocumentType.CMR && content.international()) {
      return renderInternationalCmr(document, content);
    }
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    Document pdf = open(out);
    String heading =
        document.getType() == DocumentType.CMR ? "CMR Taşıma Senedi" : "Taşıma İrsaliyesi";
    pdf.add(new Paragraph(heading + " " + document.getNumber(), title));
    pdf.add(new Paragraph("Durum: " + document.getStatus(), body));
    pdf.add(line("Gönderici", content.senderName(), content.senderAddress()));
    pdf.add(line("Alıcı", content.consigneeName(), content.consigneeAddress()));
    pdf.add(line("Taşıyıcı", content.carrierName(), null));
    pdf.add(line("Plaka", content.plates(), null));
    pdf.add(line("Sürücü", content.drivers(), null));
    pdf.add(line("Yükleme", content.origin(), content.loadingDate().format(DATE)));
    pdf.add(line("Teslim", content.destination(), null));

    PdfPTable table = new PdfPTable(GOODS_WIDTHS);
    table.setWidthPercentage(100);
    table.setSpacingBefore(SPACING);
    table.setSpacingAfter(SPACING);
    for (String header : new String[] {"Mal", "Miktar", "Ambalaj", "Ağırlık (kg)", "ADR"}) {
      table.addCell(new Phrase(header, strong));
    }
    for (CargoResponse item : content.goods()) {
      table.addCell(new Phrase(item.description(), body));
      table.addCell(right(item.quantity()));
      table.addCell(new Phrase(text(item.packaging()), body));
      table.addCell(right(item.weightKg()));
      table.addCell(new Phrase(text(item.adrClass()), body));
    }
    pdf.add(table);
    pdf.add(new Paragraph("Toplam ağırlık: " + number(content.totalWeightKg()) + " kg", strong));
    pdf.close();
    return out.toByteArray();
  }

  /** Üç dilli, kutu numaralı uluslararası CMR. Resmi matbu formun yerine geçmez. */
  private byte[] renderInternationalCmr(ShipmentDocument document, DocumentContent content)
      throws DocumentException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    Document pdf = open(out);
    pdf.add(
        new Paragraph(
            "CMR "
                + document.getNumber()
                + " · Uluslararası Hamule Senedi / International"
                + " Consignment Note / Internationaler Frachtbrief",
            strong));
    pdf.add(new Paragraph(CMR_CONVENTION_TR, small));
    pdf.add(new Paragraph(CMR_CONVENTION_EN, small));
    pdf.add(new Paragraph(CMR_CONVENTION_DE, small));
    PdfPTable boxes = new PdfPTable(2);
    boxes.setWidthPercentage(100);
    boxes.setSpacingBefore(SPACING);
    box(boxes, "1 Gönderici / Sender / Absender", content.senderName(), content.senderAddress());
    box(
        boxes,
        "2 Alıcı / Consignee / Empfänger",
        content.consigneeName(),
        content.consigneeAddress());
    box(
        boxes,
        "3 Teslim yeri / Place of delivery / Auslieferungsort",
        content.destination(),
        content.destinationCountry());
    box(
        boxes,
        "4 Yükleme yeri ve tarihi / Place and date of taking over / Übernahmeort und -datum",
        content.origin() + " · " + content.originCountry(),
        content.loadingDate().format(DATE));
    box(
        boxes,
        "5 Ekli belgeler / Documents attached / Beigefügte Dokumente",
        content.attachedDocuments(),
        null);
    box(
        boxes,
        "13 Gönderici talimatı / Sender's instructions / Anweisungen des Absenders",
        content.senderInstructions(),
        null);
    box(boxes, "16 Taşıyıcı / Carrier / Frachtführer", content.carrierName(), content.plates());
    box(boxes, "Sürücü / Driver / Fahrer", content.drivers(), null);
    box(
        boxes,
        "Sorumluluk sigortası / Liability insurance / Haftpflichtversicherung",
        content.liabilityPolicy(),
        null);
    box(boxes, "Teslim şekli / Incoterm / Lieferbedingung", content.incoterm(), null);
    pdf.add(boxes);

    PdfPTable goods = new PdfPTable(INTERNATIONAL_GOODS_WIDTHS);
    goods.setWidthPercentage(100);
    goods.setSpacingBefore(SPACING);
    goods.setSpacingAfter(SPACING);
    for (String header :
        new String[] {
          "9 Mal / Goods / Ware",
          "7 Adet / Packages / Anzahl",
          "8 Ambalaj / Packing / Verpackung",
          "11 Brüt kg / Gross kg / Brutto kg",
          "ADR / UN"
        }) {
      goods.addCell(new Phrase(header, smallStrong));
    }
    for (CargoResponse item : content.goods()) {
      goods.addCell(new Phrase(item.description(), body));
      goods.addCell(right(item.quantity()));
      goods.addCell(new Phrase(text(item.packaging()), body));
      goods.addCell(right(item.weightKg()));
      goods.addCell(new Phrase(text(item.adrClass()) + " " + text(item.unNumber()), body));
    }
    pdf.add(goods);
    pdf.add(
        new Paragraph(
            "Toplam / Total / Gesamt: " + number(content.totalWeightKg()) + " kg", strong));
    pdf.add(
        new Paragraph(
            "22 Gönderici imza / Sender signature / Unterschrift Absender     "
                + "23 Taşıyıcı imza / Carrier signature / Unterschrift Frachtführer     "
                + "24 Teslim alan / Goods received / Gut empfangen",
            small));
    pdf.close();
    return out.toByteArray();
  }

  private void box(PdfPTable table, String label, String value, String extra) {
    PdfPCell cell = new PdfPCell();
    cell.addElement(new Phrase(label, smallStrong));
    cell.addElement(new Phrase(text(value) + (extra == null ? "" : " · " + extra), body));
    table.addCell(cell);
  }

  private byte[] renderInvoice(FreightInvoice invoice, String companyName, String customerName)
      throws DocumentException {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    Document pdf = open(out);
    pdf.add(new Paragraph(companyName, title));
    pdf.add(new Paragraph("Navlun Faturası " + invoice.getNumber(), strong));
    pdf.add(new Paragraph("Bu belge yasal e-Fatura yerine geçmez.", body));
    pdf.add(new Paragraph("Müşteri: " + customerName, body));
    pdf.add(new Paragraph("Fatura tarihi: " + invoice.getInvoiceDate().format(DATE), body));
    pdf.add(new Paragraph("Vade: " + invoice.getDueDate().format(DATE), body));
    Paragraph net = new Paragraph("Net: " + money(invoice.getNet()), body);
    net.setSpacingBefore(SPACING);
    pdf.add(net);
    pdf.add(new Paragraph("KDV: " + money(invoice.getVat()), body));
    if (invoice.getWithholding().amount().signum() > 0) {
      pdf.add(new Paragraph("Tevkifat: " + money(invoice.getWithholding()), body));
    }
    pdf.add(new Paragraph("Ödenecek toplam: " + money(invoice.getTotal()), strong));
    pdf.close();
    return out.toByteArray();
  }

  private static Document open(ByteArrayOutputStream out) throws DocumentException {
    Document pdf = new Document(PageSize.A4);
    PdfWriter.getInstance(pdf, out);
    pdf.open();
    return pdf;
  }

  private Paragraph line(String label, String value, String extra) {
    Paragraph paragraph = new Paragraph();
    paragraph.add(new Phrase(label + ": ", strong));
    paragraph.add(new Phrase(text(value) + (extra == null ? "" : " · " + extra), body));
    return paragraph;
  }

  private PdfPCell right(BigDecimal value) {
    PdfPCell cell = new PdfPCell(new Phrase(value == null ? "" : number(value), body));
    cell.setHorizontalAlignment(Element.ALIGN_RIGHT);
    return cell;
  }

  private static String money(Money money) {
    return number(money.amount()) + " " + money.currency();
  }

  private static String number(BigDecimal value) {
    return new DecimalFormat(
            "#,##0.00", DecimalFormatSymbols.getInstance(Locale.forLanguageTag("tr")))
        .format(value);
  }

  private static String text(String value) {
    return value == null ? "" : value;
  }
}
