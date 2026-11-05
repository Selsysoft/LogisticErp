package org.ece.blackrose.warehouse.service;

import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Font;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.pdf.BaseFont;
import com.lowagie.text.pdf.PdfWriter;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import org.ece.blackrose.common.money.Money;
import org.ece.blackrose.warehouse.domain.WarehouseInvoice;

/** Depo faturası belgesi. Yasal e-Fatura değildir; o Faz 8'de gelir. */
public final class WarehouseInvoicePdf {

  private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("dd.MM.yyyy");
  private static final String ENCODING = "Cp1254";
  private static final int TITLE_SIZE = 15;
  private static final int BODY_SIZE = 10;

  private WarehouseInvoicePdf() {}

  public static byte[] render(WarehouseInvoice invoice, String company, String customer) {
    try {
      BaseFont regular = BaseFont.createFont(BaseFont.HELVETICA, ENCODING, BaseFont.NOT_EMBEDDED);
      BaseFont bold = BaseFont.createFont(BaseFont.HELVETICA_BOLD, ENCODING, BaseFont.NOT_EMBEDDED);
      Font body = new Font(regular, BODY_SIZE);
      Font strong = new Font(bold, BODY_SIZE);
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      Document pdf = new Document(PageSize.A4);
      PdfWriter.getInstance(pdf, out);
      pdf.open();
      pdf.add(new Paragraph(company, new Font(bold, TITLE_SIZE)));
      pdf.add(new Paragraph("Depo Faturası " + invoice.getNumber(), strong));
      pdf.add(new Paragraph("Bu belge yasal e-Fatura yerine geçmez.", body));
      pdf.add(new Paragraph("Müşteri: " + customer, body));
      pdf.add(
          new Paragraph(
              "Dönem: "
                  + invoice.getPeriodFrom().format(DATE)
                  + " - "
                  + invoice.getPeriodTo().format(DATE),
              body));
      pdf.add(new Paragraph("Fatura tarihi: " + invoice.getInvoiceDate().format(DATE), body));
      pdf.add(new Paragraph("Vade: " + invoice.getDueDate().format(DATE), body));
      pdf.add(new Paragraph(" ", body));
      pdf.add(
          new Paragraph(
              "Depolama ("
                  + number(invoice.getStorageQuantity())
                  + " birim-gün): "
                  + money(invoice.getStorage()),
              body));
      pdf.add(new Paragraph("Elleçleme: " + money(invoice.getHandling()), body));
      pdf.add(new Paragraph("Net: " + money(invoice.getNet()), body));
      pdf.add(new Paragraph("KDV: " + money(invoice.getVat()), body));
      if (invoice.getWithholding().amount().signum() > 0) {
        pdf.add(new Paragraph("Tevkifat: " + money(invoice.getWithholding()), body));
      }
      pdf.add(new Paragraph("Ödenecek toplam: " + money(invoice.getTotal()), strong));
      pdf.close();
      return out.toByteArray();
    } catch (DocumentException | IOException ex) {
      throw new IllegalStateException("Fatura belgesi oluşturulamadı", ex);
    }
  }

  private static String money(Money money) {
    return number(money.amount()) + " " + money.currency();
  }

  private static String number(BigDecimal value) {
    return new DecimalFormat(
            "#,##0.00", DecimalFormatSymbols.getInstance(Locale.forLanguageTag("tr")))
        .format(value);
  }
}
