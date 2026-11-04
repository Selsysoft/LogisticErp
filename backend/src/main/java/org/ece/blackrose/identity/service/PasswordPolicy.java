package org.ece.blackrose.identity.service;

import java.nio.charset.StandardCharsets;
import org.ece.blackrose.common.error.BusinessException;
import org.springframework.http.HttpStatus;

final class PasswordPolicy {

  private static final int MIN_LENGTH = 10;

  /** BCrypt 72 bayttan sonrasını yok sayar. */
  private static final int MAX_BYTES = 72;

  private PasswordPolicy() {}

  static void check(String password) {
    boolean valid =
        password.length() >= MIN_LENGTH
            && password.getBytes(StandardCharsets.UTF_8).length <= MAX_BYTES
            && password.chars().anyMatch(Character::isLetter)
            && password.chars().anyMatch(Character::isDigit);
    if (!valid) {
      throw new BusinessException(
          HttpStatus.BAD_REQUEST,
          "PASSWORD_POLICY",
          "Şifre en az 10 karakter olmalı, harf ve rakam içermelidir.");
    }
  }
}
