package org.ece.blackrose.files;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.files.FileService.Download;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/files")
public class FileController {

  public record FileResponse(
      UUID id,
      String ownerType,
      UUID ownerId,
      String fileName,
      String contentType,
      long sizeBytes,
      String createdBy,
      Instant createdAt) {

    static FileResponse of(StoredFile file) {
      return new FileResponse(
          file.getId(),
          file.getOwnerType(),
          file.getOwnerId(),
          file.getFileName(),
          file.getContentType(),
          file.getSizeBytes(),
          file.getCreatedBy(),
          file.getCreatedAt());
    }
  }

  private final FileService files;

  public FileController(FileService files) {
    this.files = files;
  }

  @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  @ResponseStatus(HttpStatus.CREATED)
  FileResponse upload(
      @RequestParam String ownerType,
      @RequestParam UUID ownerId,
      @RequestPart("file") MultipartFile file) {
    return FileResponse.of(files.upload(ownerType, ownerId, file));
  }

  @GetMapping
  List<FileResponse> list(@RequestParam String ownerType, @RequestParam UUID ownerId) {
    return files.list(ownerType, ownerId).stream().map(FileResponse::of).toList();
  }

  @GetMapping("/{id}/content")
  ResponseEntity<InputStreamResource> download(@PathVariable UUID id) {
    return attachment(files.download(id));
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  void delete(@PathVariable UUID id) {
    files.delete(id);
  }

  /** Dosya hiçbir zaman tarayıcıda açılmaz; her zaman indirilir. */
  public static ResponseEntity<InputStreamResource> attachment(Download download) {
    StoredFile file = download.file();
    return ResponseEntity.ok()
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment()
                .filename(file.getFileName(), StandardCharsets.UTF_8)
                .build()
                .toString())
        .contentType(MediaType.parseMediaType(file.getContentType()))
        .contentLength(file.getSizeBytes())
        .body(new InputStreamResource(download.content()));
  }
}
