package org.ece.blackrose.finance.web;

import java.io.IOException;
import java.util.UUID;
import org.ece.blackrose.finance.service.OpeningInvoiceImportService;
import org.ece.blackrose.finance.service.OpeningInvoiceImportService.Result;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Önceki sistemden açık faturalar; önce önizleme, sonra tek işlemde içe aktarma. */
@RestController
@RequestMapping("/api/v1/finance/opening-invoices")
public class OpeningInvoiceController {

  private static final String MANAGE = "hasAuthority('FINANCE_MANAGE')";

  private final OpeningInvoiceImportService imports;

  public OpeningInvoiceController(OpeningInvoiceImportService imports) {
    this.imports = imports;
  }

  @PostMapping(value = "/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @PreAuthorize(MANAGE)
  Result preview(@RequestParam MultipartFile file, @RequestParam UUID branchId) throws IOException {
    return imports.preview(file.getBytes(), branchId);
  }

  @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @PreAuthorize(MANAGE)
  Result apply(@RequestParam MultipartFile file, @RequestParam UUID branchId) throws IOException {
    return imports.apply(file.getBytes(), branchId);
  }
}
