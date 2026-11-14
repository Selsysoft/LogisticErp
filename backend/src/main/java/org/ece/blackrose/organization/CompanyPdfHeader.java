package org.ece.blackrose.organization;

import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.Image;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.BaseFont;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.ece.blackrose.organization.CompanyIdentityService.CompanyIdentity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Navlun faturası, depo faturası ve teklif belgelerinin ortak şirket başlığı: solda logo, sağda
 * unvan, vergi kimliği ve adres. Bozuk logo belgeyi durdurmaz; başlık logosuz çizilir.
 */
public final class CompanyPdfHeader {

  private static final Logger log = LoggerFactory.getLogger(CompanyPdfHeader.class);
  private static final String ENCODING = "Cp1254";
  private static final int TITLE_SIZE = 14;
  private static final int BODY_SIZE = 9;
  private static final float LOGO_HEIGHT = 40f;
  private static final float SPACING = 8f;
  private static final float[] WITH_LOGO = {1, 4};

  private CompanyPdfHeader() {}

  public static PdfPTable render(CompanyIdentity company) {
    try {
      BaseFont regular = BaseFont.createFont(BaseFont.HELVETICA, ENCODING, BaseFont.NOT_EMBEDDED);
      BaseFont bold = BaseFont.createFont(BaseFont.HELVETICA_BOLD, ENCODING, BaseFont.NOT_EMBEDDED);
      Font title = new Font(bold, TITLE_SIZE);
      Font body = new Font(regular, BODY_SIZE);

      Image logo = logo(company);
      PdfPTable table = logo == null ? new PdfPTable(1) : new PdfPTable(WITH_LOGO);
      table.setWidthPercentage(100);
      table.setSpacingAfter(SPACING);
      if (logo != null) {
        PdfPCell cell = new PdfPCell(logo, false);
        cell.setBorder(Rectangle.NO_BORDER);
        cell.setVerticalAlignment(Element.ALIGN_MIDDLE);
        table.addCell(cell);
      }
      PdfPCell text = new PdfPCell();
      text.setBorder(Rectangle.NO_BORDER);
      text.addElement(new Paragraph(company.title(), title));
      for (String line : lines(company)) {
        text.addElement(new Paragraph(line, body));
      }
      table.addCell(text);
      return table;
    } catch (DocumentException | IOException ex) {
      throw new IllegalStateException("Belge başlığı oluşturulamadı", ex);
    }
  }

  /** Vergi kimliği ve adres satırları (boş alanlar atlanır). */
  static List<String> lines(CompanyIdentity company) {
    List<String> lines = new ArrayList<>();
    if (company.taxNumber() != null) {
      String label = company.taxIdType() == TaxIdType.TCKN ? "TCKN" : "VKN";
      String tax = label + ": " + company.taxNumber();
      if (company.taxOffice() != null) {
        tax += " · Vergi Dairesi: " + company.taxOffice();
      }
      lines.add(tax);
    }
    List<String> address = new ArrayList<>();
    if (company.address() != null) {
      address.add(company.address());
    }
    String place =
        String.join(
            "/",
            java.util.stream.Stream.of(company.district(), company.city())
                .filter(value -> value != null && !value.isBlank())
                .toList());
    if (!place.isEmpty()) {
      address.add(place);
    }
    if (!address.isEmpty()) {
      lines.add(String.join(", ", address));
    }
    return lines;
  }

  private static Image logo(CompanyIdentity company) {
    if (company.logo() == null) {
      return null;
    }
    try {
      Image image = Image.getInstance(company.logo());
      image.scaleToFit(LOGO_HEIGHT * 4, LOGO_HEIGHT);
      return image;
    } catch (IOException | RuntimeException ex) {
      log.warn("Şirket logosu çizilemedi, başlık logosuz: {}", company.companyId(), ex);
      return null;
    }
  }
}
