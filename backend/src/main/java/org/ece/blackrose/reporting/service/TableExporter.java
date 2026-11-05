package org.ece.blackrose.reporting.service;

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
import java.util.List;
import java.util.Locale;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;

/**
 * Rapor tablosunu Excel veya PDF yapar. Excel'de metin hücresi metin olarak yazılır; formül gibi
 * başlayan bir müşteri adı çalıştırılmaz.
 */
public final class TableExporter {

  /** Sayılar BigDecimal veya Long olarak verilir, gerisi metne çevrilir. */
  public record Table(
      String title, String subtitle, List<String> headers, List<List<Object>> rows) {}

  private static final String ENCODING = "Cp1254";
  private static final int TITLE_SIZE = 14;
  private static final int BODY_SIZE = 9;
  private static final int COLUMN_WIDTH = 22 * 256;
  private static final float SPACING = 8f;

  private TableExporter() {}

  public static byte[] excel(Table table) {
    try (XSSFWorkbook workbook = new XSSFWorkbook();
        ByteArrayOutputStream out = new ByteArrayOutputStream()) {
      Sheet sheet = workbook.createSheet("Rapor");
      CellStyle bold = workbook.createCellStyle();
      var font = workbook.createFont();
      font.setBold(true);
      bold.setFont(font);
      CellStyle number = workbook.createCellStyle();
      number.setDataFormat(workbook.createDataFormat().getFormat("#,##0.00"));
      int index = 0;
      Row title = sheet.createRow(index++);
      title.createCell(0).setCellValue(table.title());
      title.getCell(0).setCellStyle(bold);
      sheet.createRow(index++).createCell(0).setCellValue(table.subtitle());
      index++;
      Row header = sheet.createRow(index++);
      for (int i = 0; i < table.headers().size(); i++) {
        Cell cell = header.createCell(i);
        cell.setCellValue(table.headers().get(i));
        cell.setCellStyle(bold);
        sheet.setColumnWidth(i, COLUMN_WIDTH);
      }
      for (List<Object> values : table.rows()) {
        Row row = sheet.createRow(index++);
        for (int i = 0; i < values.size(); i++) {
          Object value = values.get(i);
          Cell cell = row.createCell(i);
          if (value instanceof BigDecimal decimal) {
            cell.setCellValue(decimal.doubleValue());
            cell.setCellStyle(number);
          } else if (value instanceof Number count) {
            cell.setCellValue(count.doubleValue());
          } else if (value != null) {
            cell.setCellValue(value.toString());
          }
        }
      }
      workbook.write(out);
      return out.toByteArray();
    } catch (IOException ex) {
      throw new IllegalStateException("Excel oluşturulamadı", ex);
    }
  }

  public static byte[] pdf(Table table) {
    try {
      BaseFont regular = BaseFont.createFont(BaseFont.HELVETICA, ENCODING, BaseFont.NOT_EMBEDDED);
      BaseFont boldFont =
          BaseFont.createFont(BaseFont.HELVETICA_BOLD, ENCODING, BaseFont.NOT_EMBEDDED);
      Font body = new Font(regular, BODY_SIZE);
      Font strong = new Font(boldFont, BODY_SIZE);
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      Document pdf = new Document(PageSize.A4.rotate());
      PdfWriter.getInstance(pdf, out);
      pdf.open();
      pdf.add(new Paragraph(table.title(), new Font(boldFont, TITLE_SIZE)));
      pdf.add(new Paragraph(table.subtitle(), body));
      PdfPTable grid = new PdfPTable(table.headers().size());
      grid.setWidthPercentage(100);
      grid.setSpacingBefore(SPACING);
      grid.setHeaderRows(1);
      table.headers().forEach(text -> grid.addCell(new Phrase(text, strong)));
      for (List<Object> values : table.rows()) {
        for (Object value : values) {
          if (value instanceof Number number) {
            PdfPCell cell = new PdfPCell(new Phrase(format(number), body));
            cell.setHorizontalAlignment(Element.ALIGN_RIGHT);
            grid.addCell(cell);
          } else {
            grid.addCell(new Phrase(value == null ? "" : value.toString(), body));
          }
        }
      }
      pdf.add(grid);
      pdf.close();
      return out.toByteArray();
    } catch (DocumentException | IOException ex) {
      throw new IllegalStateException("PDF oluşturulamadı", ex);
    }
  }

  private static String format(Number value) {
    DecimalFormatSymbols symbols = DecimalFormatSymbols.getInstance(Locale.forLanguageTag("tr"));
    return value instanceof BigDecimal
        ? new DecimalFormat("#,##0.00", symbols).format(value)
        : new DecimalFormat("#,##0", symbols).format(value);
  }
}
