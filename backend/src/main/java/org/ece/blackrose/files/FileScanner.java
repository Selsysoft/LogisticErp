package org.ece.blackrose.files;

import java.io.IOException;
import java.io.InputStream;

/** Kullanıcıdan gelen dosyayı saklamadan önce tarar. Tarama yapılamazsa IOException fırlatır. */
public interface FileScanner {

  /** Temizse null, zararlıysa bulunan imzanın adını döner. */
  String findThreat(InputStream content) throws IOException;

  /** Tarama kapalıysa false; konsol bunu "tanımlı değil" diye gösterir. */
  default boolean enabled() {
    return true;
  }

  /** Tarayıcının yanıt verdiğini doğrular; sorun varsa IOException fırlatır. */
  default void check() throws IOException {}
}
