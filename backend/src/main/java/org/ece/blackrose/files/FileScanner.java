package org.ece.blackrose.files;

import java.io.IOException;
import java.io.InputStream;

/** Kullanıcıdan gelen dosyayı saklamadan önce tarar. Tarama yapılamazsa IOException fırlatır. */
public interface FileScanner {

  /** Temizse null, zararlıysa bulunan imzanın adını döner. */
  String findThreat(InputStream content) throws IOException;
}
