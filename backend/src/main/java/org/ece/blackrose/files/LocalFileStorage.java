package org.ece.blackrose.files;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;

/**
 * Yerel disk. Anahtar yalnız sunucunun ürettiği değerlerden oluşur; yine de kök dışına çıkılamaz.
 */
public class LocalFileStorage implements FileStorage {

  private final Path root;

  public LocalFileStorage(String root) {
    this.root = Path.of(root).toAbsolutePath().normalize();
  }

  @Override
  public void write(String key, InputStream content, long size) throws IOException {
    Path target = resolve(key);
    Files.createDirectories(target.getParent());
    Files.copy(content, target, StandardCopyOption.REPLACE_EXISTING);
  }

  @Override
  public InputStream read(String key) throws IOException {
    return Files.newInputStream(resolve(key));
  }

  @Override
  public void check() throws IOException {
    Files.createDirectories(root);
    if (!Files.isWritable(root)) {
      throw new IOException("Dosya klasörüne yazılamıyor: " + root);
    }
  }

  @Override
  public String describe() {
    return "Yerel disk";
  }

  private Path resolve(String key) {
    Path path = root.resolve(key).normalize();
    if (!path.startsWith(root)) {
      throw new IllegalArgumentException("Geçersiz dosya anahtarı");
    }
    return path;
  }
}
