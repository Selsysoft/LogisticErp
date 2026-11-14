package org.ece.blackrose.organization;

import static org.assertj.core.api.Assertions.assertThat;

import com.lowagie.text.pdf.PdfPTable;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.ece.blackrose.organization.CompanyIdentityService.CompanyIdentity;
import org.junit.jupiter.api.Test;

class CompanyPdfHeaderTest {

  @Test
  void gecerliLogoIkiSutunBozukLogoTekSutunCizilir() throws Exception {
    BufferedImage image = new BufferedImage(4, 2, BufferedImage.TYPE_INT_RGB);
    ByteArrayOutputStream png = new ByteArrayOutputStream();
    ImageIO.write(image, "png", png);

    PdfPTable withLogo = CompanyPdfHeader.render(identity(TaxIdType.VKN, png.toByteArray()));
    assertThat(withLogo.getNumberOfColumns()).isEqualTo(2);
    PdfPTable broken =
        CompanyPdfHeader.render(identity(TaxIdType.VKN, new byte[] {(byte) 0x89, 0x50, 1}));
    assertThat(broken.getNumberOfColumns()).isEqualTo(1);
    assertThat(CompanyPdfHeader.render(identity(TaxIdType.VKN, null)).getNumberOfColumns())
        .isEqualTo(1);
  }

  @Test
  void vergiKimligiVeAdresSatirlari() {
    assertThat(CompanyPdfHeader.lines(identity(TaxIdType.TCKN, null)))
        .containsExactly(
            "TCKN: 10000000146 · Vergi Dairesi: Kadıköy", "Moda Cad. 1, Kadıköy/İstanbul");
    CompanyIdentity bare =
        new CompanyIdentity(
            UUID.randomUUID(),
            "Unvan",
            "Kısa",
            TaxIdType.VKN,
            "1234567890",
            null,
            null,
            null,
            "Mersin",
            " ",
            null,
            null,
            null,
            null);
    List<String> lines = CompanyPdfHeader.lines(bare);
    assertThat(lines).containsExactly("VKN: 1234567890", "Mersin");
    CompanyIdentity empty =
        new CompanyIdentity(
            UUID.randomUUID(),
            "Unvan",
            "Kısa",
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            null);
    assertThat(CompanyPdfHeader.lines(empty)).isEmpty();
  }

  private static CompanyIdentity identity(TaxIdType type, byte[] logo) {
    return new CompanyIdentity(
        UUID.randomUUID(),
        "Alfa Lojistik AŞ",
        "Alfa",
        type,
        "10000000146",
        "Kadıköy",
        null,
        "Moda Cad. 1",
        "İstanbul",
        "Kadıköy",
        null,
        null,
        null,
        logo);
  }
}
