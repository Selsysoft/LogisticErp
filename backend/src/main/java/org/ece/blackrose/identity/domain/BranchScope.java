package org.ece.blackrose.identity.domain;

/**
 * Kullanıcının iş yeri kapsamı: {@code ALL} tüm iş yerleri, {@code LIMITED} yalnız {@code
 * user_branch}'teki iş yerleri. Kapsam token'a yazılmaz; her istekte okunur.
 */
public enum BranchScope {
  ALL,
  LIMITED
}
