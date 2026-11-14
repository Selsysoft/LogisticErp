package org.ece.blackrose.organization;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.files.FileStorage;
import org.ece.blackrose.files.StoredFile;
import org.ece.blackrose.files.StoredFileRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

/**
 * Belgelerde görünen şirket kimliği (unvan, vergi kimliği, adres, logo). Belge başlıkları kiracı
 * adını değil, kaydın tüzel kişisini taşır.
 *
 * <p>Logo okuma asla belge üretimini durdurmaz: dosya silinmiş, depolamada yok ya da okunamıyorsa
 * logo boş döner ve uyarı loglanır. Bu yüzden dosya {@code FileService} işlem sınırından değil
 * doğrudan depodan okunur (iç işlemde fırlayan istisna dıştaki salt okunur işlemi geri alınacak
 * diye işaretlerdi). Silinmiş şirket için de çalışır (geçmiş belge).
 */
@Service
public class CompanyIdentityService {

  private static final Logger log = LoggerFactory.getLogger(CompanyIdentityService.class);

  /** Belge başlığı için şirket kimliği; {@code logo} boş olabilir (PNG/JPEG baytları). */
  public record CompanyIdentity(
      UUID companyId,
      String title,
      String shortName,
      TaxIdType taxIdType,
      String taxNumber,
      String taxOffice,
      String mersisNo,
      String address,
      String city,
      String district,
      String phone,
      String email,
      String website,
      byte[] logo) {}

  private final CompanyRepository companies;
  private final CompanyResolver resolver;
  private final StoredFileRepository files;
  private final FileStorage storage;

  public CompanyIdentityService(
      CompanyRepository companies,
      CompanyResolver resolver,
      StoredFileRepository files,
      FileStorage storage) {
    this.companies = companies;
    this.resolver = resolver;
    this.files = files;
    this.storage = storage;
  }

  /** Logolu kimlik; yalnız PDF başlıkları kullanır. */
  public CompanyIdentity of(UUID companyId) {
    Company company = find(companyId);
    return identity(company, logo(company));
  }

  /** Logosuz kimlik: e-belge göndericisi, e-posta, takip sayfası, CMR/irsaliye taşıyıcı adı. */
  public CompanyIdentity withoutLogo(UUID companyId) {
    return identity(find(companyId), null);
  }

  /** İş yerinin şirketinin logosuz kimliği. */
  public CompanyIdentity ofBranch(UUID branchId) {
    return withoutLogo(resolver.companyOf(branchId));
  }

  private Company find(UUID companyId) {
    return companies
        .findByIdIncludingDeleted(companyId)
        .orElseThrow(
            () ->
                new BusinessException(
                    HttpStatus.NOT_FOUND, "COMPANY_NOT_FOUND", "Şirket bulunamadı."));
  }

  private byte[] logo(Company company) {
    UUID fileId = company.getLogoFileId();
    if (fileId == null) {
      return null;
    }
    StoredFile file = files.findById(fileId).orElse(null);
    if (file == null) {
      log.warn("Şirket logosu bulunamadı, belge logosuz üretiliyor: {}", fileId);
      return null;
    }
    try (InputStream content = storage.read(file.getStorageKey())) {
      return content.readAllBytes();
    } catch (IOException | UncheckedIOException ex) {
      log.warn("Şirket logosu okunamadı, belge logosuz üretiliyor: {}", fileId, ex);
      return null;
    }
  }

  private static CompanyIdentity identity(Company company, byte[] logo) {
    return new CompanyIdentity(
        company.getId(),
        company.getTitle(),
        company.getShortName(),
        company.getTaxIdType(),
        company.getTaxNumber(),
        company.getTaxOffice(),
        company.getMersisNo(),
        company.getAddress(),
        company.getCity(),
        company.getDistrict(),
        company.getPhone(),
        company.getEmail(),
        company.getWebsite(),
        logo);
  }
}
