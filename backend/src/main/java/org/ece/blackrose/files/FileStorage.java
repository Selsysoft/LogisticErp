package org.ece.blackrose.files;

import java.io.IOException;
import java.io.InputStream;

/** Dosya içeriğinin saklandığı yer. Üst katman yalnız bu arayüzü bilir. */
public interface FileStorage {

  void write(String key, InputStream content, long size) throws IOException;

  InputStream read(String key) throws IOException;

  /** Deponun erişilebilir ve yazılabilir olduğunu doğrular; sorun varsa IOException fırlatır. */
  void check() throws IOException;

  /** Konsolda gösterilecek kısa ad. */
  String describe();
}
