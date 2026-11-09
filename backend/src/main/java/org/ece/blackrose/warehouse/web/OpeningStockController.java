package org.ece.blackrose.warehouse.web;

import java.io.IOException;
import java.time.LocalDate;
import java.util.UUID;
import org.ece.blackrose.warehouse.service.OpeningStockImportService;
import org.ece.blackrose.warehouse.service.OpeningStockImportService.Result;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Önceki sistemden depo açılış stoğu; önce önizleme, sonra tek işlemde içe aktarma. */
@RestController
@RequestMapping("/api/v1/warehouse/opening-stock")
public class OpeningStockController {

  private static final String EDIT = "hasAuthority('WAREHOUSE_EDIT')";

  private final OpeningStockImportService imports;

  public OpeningStockController(OpeningStockImportService imports) {
    this.imports = imports;
  }

  @PostMapping(value = "/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @PreAuthorize(EDIT)
  Result preview(
      @RequestParam MultipartFile file,
      @RequestParam UUID warehouseId,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date)
      throws IOException {
    return imports.preview(file.getBytes(), warehouseId, date);
  }

  @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @PreAuthorize(EDIT)
  Result apply(
      @RequestParam MultipartFile file,
      @RequestParam UUID warehouseId,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date)
      throws IOException {
    return imports.apply(file.getBytes(), warehouseId, date);
  }
}
