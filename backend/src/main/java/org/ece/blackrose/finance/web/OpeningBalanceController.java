package org.ece.blackrose.finance.web;

import java.io.IOException;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.finance.service.OpeningBalanceImportService;
import org.ece.blackrose.finance.service.OpeningBalanceImportService.Result;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Önceki sistemden cari açılış bakiyesi; önce önizleme, sonra tek işlemde içe aktarma. */
@RestController
@RequestMapping("/api/v1/finance/opening-balances")
public class OpeningBalanceController {

  private static final String MANAGE = "hasAuthority('FINANCE_MANAGE')";

  private final OpeningBalanceImportService imports;

  public OpeningBalanceController(OpeningBalanceImportService imports) {
    this.imports = imports;
  }

  @PostMapping(value = "/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @PreAuthorize(MANAGE)
  Result preview(
      @RequestParam MultipartFile file,
      @RequestParam UUID branchId,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date)
      throws IOException {
    return imports.preview(file.getBytes(), branchId, date);
  }

  @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @PreAuthorize(MANAGE)
  Result apply(
      @RequestParam MultipartFile file,
      @RequestParam UUID branchId,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date)
      throws IOException {
    return imports.apply(file.getBytes(), branchId, date);
  }
}
