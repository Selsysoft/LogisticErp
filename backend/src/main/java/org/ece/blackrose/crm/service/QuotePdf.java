package org.ece.blackrose.crm.service;

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
import java.util.List;
import java.util.Locale;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.crm.domain.Quote;
import org.ece.blackrose.crm.domain.QuoteLine;

/** Teklif belgesi. Türkçe karakterler için Windows-1254 kodlaması kullanılır. */
final class QuotePdf {

  private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
  private static final String[] HEADERS = {"Güzergâh", "Araç", "Açıklama", "Net", "KDV", "Toplam"};
  private static final float[] WIDTHS = {4, 2, 4, 2, 2, 2};
  private static final int TITLE_SIZE = 16;
  private static final int BODY_SIZE = 10;
  private static final float SPACING = 12f;

  private QuotePdf() {}

  static byte[] render(
      Quote quote, List<QuoteLine> lines, String customerName, String companyName) {
    try {
      BaseFont base = BaseFont.createFont(BaseFont.HELVETICA, "Cp1254", BaseFont.NOT_EMBEDDED);
      BaseFont bold = BaseFont.createFont(BaseFont.HELVETICA_BOLD, "Cp1254", BaseFont.NOT_EMBEDDED);
      Font body = new Font(base, BODY_SIZE);
      Font strong = new Font(bold, BODY_SIZE);

      ByteArrayOutputStream out = new ByteArrayOutputStream();
      Document document = new Document(PageSize.A4);
      PdfWriter.getInstance(document, out);
      document.open();
      document.add(new Paragraph(companyName, new Font(bold, TITLE_SIZE)));
      document.add(
          new Paragraph("Teklif " + quote.getNumber() + " / Sürüm " + quote.getVersion(), strong));
      document.add(new Paragraph("Müşteri: " + customerName, body));
      document.add(new Paragraph("Geçerlilik: " + quote.getValidUntil().format(DATE), body));

      PdfPTable table = new PdfPTable(WIDTHS);
      table.setWidthPercentage(100);
      table.setSpacingBefore(SPACING);
      table.setSpacingAfter(SPACING);
      for (String header : HEADERS) {
        table.addCell(new Phrase(header, strong));
      }
      for (QuoteLine line : lines) {
        table.addCell(new Phrase(line.getOrigin() + " - " + line.getDestination(), body));
        table.addCell(new Phrase(text(line.getVehicleType()), body));
        table.addCell(new Phrase(text(line.getDescription()), body));
        table.addCell(amountCell(line.getNetAmount(), body));
        table.addCell(amountCell(line.getVatAmount(), body));
        table.addCell(amountCell(line.getTotalAmount(), body));
      }
      document.add(table);
      document.add(new Paragraph("Net: " + money(quote.getNet()), body));
      document.add(new Paragraph("KDV: " + money(quote.getVat()), body));
      if (quote.getWithholding().amount().signum() > 0) {
        document.add(new Paragraph("Tevkifat: " + money(quote.getWithholding()), body));
      }
      document.add(new Paragraph("Ödenecek toplam: " + money(quote.getTotal()), strong));
      if (quote.getNotes() != null) {
        Paragraph notes = new Paragraph(quote.getNotes(), body);
        notes.setSpacingBefore(SPACING);
        document.add(notes);
      }
      document.close();
      return out.toByteArray();
    } catch (DocumentException | IOException ex) {
      throw new IllegalStateException("Teklif belgesi oluşturulamadı", ex);
    }
  }

  private static PdfPCell amountCell(BigDecimal value, Font font) {
    PdfPCell cell = new PdfPCell(new Phrase(number(value), font));
    cell.setHorizontalAlignment(Element.ALIGN_RIGHT);
    return cell;
  }

  private static String money(Money money) {
    return number(money.amount()) + " " + money.currency();
  }

  private static String number(BigDecimal value) {
    DecimalFormat format =
        new DecimalFormat(
            "#,##0.00", DecimalFormatSymbols.getInstance(Locale.forLanguageTag("tr")));
    return format.format(value);
  }

  private static String text(String value) {
    return value == null ? "" : value;
  }
}
