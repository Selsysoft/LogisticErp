package org.ece.blackrose.files;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.tenant.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Yüklenen dosyaları saklar. İçerik türü istemciye değil uzantıya göre belirlenir. Virüs taraması
 * henüz yoktur; bu yüzden izinli türler dardır ve dosyalar yalnız indirme olarak sunulur.
 */
@Service
public class FileService {

  private static final Map<String, String> ALLOWED_TYPES =
      Map.of(
          "pdf", "application/pdf",
          "png", "image/png",
          "jpg", "image/jpeg",
          "jpeg", "image/jpeg",
          "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "txt", "text/plain");
  private static final int MAX_NAME_LENGTH = 200;

  public record Download(StoredFile file, InputStream content) {}

  private final StoredFileRepository files;
  private final FileStorage storage;
  private final Map<String, FileOwnerPolicy> policies;

  public FileService(
      StoredFileRepository files, FileStorage storage, List<FileOwnerPolicy> policies) {
    this.files = files;
    this.storage = storage;
    this.policies =
        policies.stream()
            .collect(Collectors.toMap(FileOwnerPolicy::ownerType, Function.identity()));
  }

  @Transactional
  public StoredFile upload(String ownerType, UUID ownerId, MultipartFile upload) {
    FileOwnerPolicy policy = policy(ownerType);
    requirePermission(policy.editPermission());
    if (!policy.exists(ownerId)) {
      throw new BusinessException(
          HttpStatus.NOT_FOUND, "FILE_OWNER_NOT_FOUND", "Dosyanın bağlanacağı kayıt bulunamadı.");
    }
    if (upload.isEmpty()) {
      throw new BusinessException(HttpStatus.BAD_REQUEST, "FILE_EMPTY", "Dosya boş.");
    }
    String name = sanitize(upload.getOriginalFilename());
    String type = typeOf(name);
    try (InputStream content = upload.getInputStream()) {
      return save(ownerType, ownerId, name, type, upload.getSize(), content);
    } catch (IOException ex) {
      throw new UncheckedIOException(ex);
    }
  }

  /** Sistemin kendi ürettiği belge; izin kontrolünü çağıran iş kuralı yapar. */
  @Transactional
  public StoredFile storeGenerated(
      String ownerType, UUID ownerId, String name, String contentType, byte[] content) {
    return save(
        ownerType, ownerId, name, contentType, content.length, new ByteArrayInputStream(content));
  }

  @Transactional(readOnly = true)
  public List<StoredFile> list(String ownerType, UUID ownerId) {
    requirePermission(policy(ownerType).viewPermission());
    return files.findByOwnerTypeAndOwnerIdOrderByCreatedAtDesc(ownerType, ownerId);
  }

  @Transactional(readOnly = true)
  public Download download(UUID id) {
    StoredFile file = find(id);
    requirePermission(policy(file.getOwnerType()).viewPermission());
    return open(file);
  }

  /** Sistem belgeleri için: izin kontrolünü çağıran iş kuralı yapar. */
  @Transactional(readOnly = true)
  public Download openGenerated(UUID id) {
    return open(find(id));
  }

  @Transactional
  public void delete(UUID id) {
    StoredFile file = find(id);
    requirePermission(policy(file.getOwnerType()).editPermission());
    file.markDeleted();
  }

  private Download open(StoredFile file) {
    try {
      return new Download(file, storage.read(file.getStorageKey()));
    } catch (IOException ex) {
      throw new UncheckedIOException(ex);
    }
  }

  private StoredFile save(
      String ownerType, UUID ownerId, String name, String type, long size, InputStream content) {
    UUID id = UUID.randomUUID();
    String key = TenantContext.currentSchema().orElseThrow() + "/" + id;
    try {
      storage.write(key, content);
    } catch (IOException ex) {
      throw new UncheckedIOException(ex);
    }
    return files.save(new StoredFile(id, ownerType, ownerId, name, type, size, key));
  }

  private StoredFile find(UUID id) {
    return files
        .findById(id)
        .orElseThrow(
            () ->
                new BusinessException(HttpStatus.NOT_FOUND, "FILE_NOT_FOUND", "Dosya bulunamadı."));
  }

  private FileOwnerPolicy policy(String ownerType) {
    FileOwnerPolicy policy = policies.get(ownerType);
    if (policy == null) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "FILE_OWNER_INVALID", "Bu kayıt türüne dosya eklenemez.");
    }
    return policy;
  }

  private static void requirePermission(String permission) {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    boolean allowed =
        authentication != null
            && authentication.getAuthorities().stream()
                .anyMatch(authority -> permission.equals(authority.getAuthority()));
    if (!allowed) {
      throw new AccessDeniedException("İzin yok: " + permission);
    }
  }

  private static String sanitize(String original) {
    String name = original == null ? "" : original.replace('\\', '/');
    name = name.substring(name.lastIndexOf('/') + 1).replaceAll("[\\p{Cntrl}\"]", "").trim();
    if (name.isEmpty()) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "FILE_NAME_INVALID", "Dosya adı geçersiz.");
    }
    return name.length() <= MAX_NAME_LENGTH
        ? name
        : name.substring(name.length() - MAX_NAME_LENGTH);
  }

  private static String typeOf(String name) {
    String extension = name.substring(name.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
    String type = name.contains(".") ? ALLOWED_TYPES.get(extension) : null;
    if (type == null) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST, "FILE_TYPE_NOT_ALLOWED", "Bu dosya türü yüklenemez.");
    }
    return type;
  }
}
