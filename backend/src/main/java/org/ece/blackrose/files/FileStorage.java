package org.ece.blackrose.files;

import java.io.IOException;
import java.io.InputStream;

/** Dosya içeriğinin saklandığı yer. Üst katman yalnız bu arayüzü bilir. */
public interface FileStorage {

  void write(String key, InputStream content) throws IOException;

  InputStream read(String key) throws IOException;
}
