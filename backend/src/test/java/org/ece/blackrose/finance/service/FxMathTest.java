package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.LocalDate;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.FinanceTypes.FxCalcMode;
import org.ece.blackrose.finance.domain.FinanceTypes.RateOperation;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** Döviz bozumu kur hesabı (12.2_TASARIM §3.3.1 adım 6 ve 11): ×/÷, yuvarlama, tolerans. */
class FxMathTest {

  @ParameterizedTest
  @CsvSource({
    "100, 30, MULTIPLY, 3000.00",
    "100, 32.5678, MULTIPLY, 3256.78",
    "3000, 30, DIVIDE, 100.00",
    "1000, 3, DIVIDE, 333.33",
    "2, 3, DIVIDE, 0.67",
    "10.005, 1, MULTIPLY, 10.01"
  })
  void beklenenHedefIkiHaneHalfUp(
      String source, String rate, RateOperation operation, String expected) {
    assertThat(FundTransferService.fxExpected(dec(source), dec(rate), operation))
        .isEqualByComparingTo(expected)
        .satisfies(v -> assertThat(v.scale()).isEqualTo(2));
  }

  @Test
  void hedefTutarEnCokBirKurusSapabilir() {
    BigDecimal source = dec("1000");
    BigDecimal rate = dec("3");
    assertThat(FundTransferService.fxMatches(source, rate, RateOperation.DIVIDE, dec("333.33")))
        .isTrue();
    assertThat(FundTransferService.fxMatches(source, rate, RateOperation.DIVIDE, dec("333.34")))
        .isTrue();
    assertThat(FundTransferService.fxMatches(source, rate, RateOperation.DIVIDE, dec("333.32")))
        .isTrue();
    assertThat(FundTransferService.fxMatches(source, rate, RateOperation.DIVIDE, dec("333.35")))
        .isFalse();
    assertThat(
            FundTransferService.fxMatches(
                dec("100"), dec("30"), RateOperation.MULTIPLY, dec("3001")))
        .isFalse();
  }

  /**
   * F-12.2-1: denetim kipe bağlıdır; istemcinin hesapladığı alan yeniden hesaplanır. Örnekler ön
   * yüz {@code fxCalcLogic.test.ts} karşı örnekleridir (eski kipten bağımsız kural reddediyordu).
   */
  @ParameterizedTest
  @CsvSource({
    // Kur + Hedef => Kaynak (kaynak 2 hane)
    "28.99, 34.5, MULTIPLY, 1000, RATE_TARGET, true",
    "29.31, 34.1234, MULTIPLY, 1000, RATE_TARGET, true",
    "1000.37, 0.03, DIVIDE, 33345.60, RATE_TARGET, true",
    "29.01, 34.5, MULTIPLY, 1000, RATE_TARGET, false",
    // Kaynak + Hedef => Kur (kur 6 hane)
    "100000, 34.123457, MULTIPLY, 3412345.67, SOURCE_TARGET, true",
    "100000.37, 34.567763, MULTIPLY, 3456789.12, SOURCE_TARGET, true",
    "1000, 0.029989, DIVIDE, 33345.67, SOURCE_TARGET, true",
    "1000000, 33.34567, MULTIPLY, 33345670.12, SOURCE_TARGET, true",
    "1000000, 33.3457, MULTIPLY, 33345670.12, SOURCE_TARGET, false",
    // Kaynak + Kur => Hedef (eski kural)
    "1000, 3, DIVIDE, 333.34, SOURCE_RATE, true",
    "1000, 3, DIVIDE, 333.35, SOURCE_RATE, false"
  })
  void kipeBagliTutarDenetimi(
      String source,
      String rate,
      RateOperation operation,
      String target,
      FxCalcMode mode,
      boolean accepted) {
    assertThat(FundTransferService.fxMatches(dec(source), dec(rate), operation, dec(target), mode))
        .isEqualTo(accepted);
  }

  @Test
  void kipsizIstekKaynakKurHedefKuraliyla() {
    assertThat(
            FundTransferService.fxMatches(
                dec("1000"), dec("3"), RateOperation.DIVIDE, dec("333.33"), null))
        .isTrue();
    assertThat(
            FundTransferService.fxMatches(
                dec("28.99"), dec("34.5"), RateOperation.MULTIPLY, dec("1000"), null))
        .isFalse();
    assertThat(
            FundTransferService.fxExpectedDetail(
                dec("28.99"), dec("34.5"), RateOperation.MULTIPLY, dec("1000"), null))
        .isEqualTo("expected=1000.16");
    assertThat(
            FundTransferService.fxExpectedDetail(
                dec("28.99"),
                dec("34.5"),
                RateOperation.MULTIPLY,
                dec("1000"),
                FxCalcMode.RATE_TARGET))
        .isEqualTo("expectedSource=28.99");
    assertThat(
            FundTransferService.fxExpectedDetail(
                dec("1000"),
                dec("0.03"),
                RateOperation.DIVIDE,
                dec("33345.67"),
                FxCalcMode.SOURCE_TARGET))
        .isEqualTo("expectedRate=0.029989");
  }

  @Test
  void kurYokkenDovizBacagininKuruTlBoluDoviz() {
    assertThat(FundTransferService.derivedRate(dec("3000"), dec("100")))
        .isEqualByComparingTo("30")
        .satisfies(v -> assertThat(v.scale()).isEqualTo(6));
    assertThat(FundTransferService.derivedRate(dec("1000"), dec("333.33")))
        .isEqualByComparingTo("3.000030");
  }

  @Test
  void iptalTarihiAraligi() {
    LocalDate today = LocalDate.of(2026, 11, 14);
    LocalDate past = LocalDate.of(2026, 10, 1);
    LocalDate future = LocalDate.of(2026, 11, 20);

    FundTransferService.requireReverseDate(past, past, today);
    FundTransferService.requireReverseDate(past, today, today);
    FundTransferService.requireReverseDate(future, future, today);
    assertCode(
        () -> FundTransferService.requireReverseDate(past, past.minusDays(1), today),
        "REVERSE_BEFORE_TRANSFER");
    assertCode(
        () -> FundTransferService.requireReverseDate(past, today.plusDays(1), today),
        "DATE_IN_FUTURE");
    assertCode(
        () -> FundTransferService.requireReverseDate(future, today, today),
        "REVERSE_BEFORE_TRANSFER");
    assertCode(
        () -> FundTransferService.requireReverseDate(future, future.plusDays(1), today),
        "DATE_IN_FUTURE");
  }

  @Test
  void tarihAraligiEnCok366Gun() {
    LocalDate from = LocalDate.of(2026, 1, 1);
    FundTransferService.requireRange(from, from.plusDays(366));
    assertCode(
        () -> FundTransferService.requireRange(from, from.plusDays(367)), "DATE_RANGE_TOO_LARGE");
    assertCode(
        () -> FundTransferService.requireRange(from, from.minusDays(1)), "DATE_RANGE_TOO_LARGE");
    assertCode(() -> FundTransferService.requireRange(null, from), "DATE_RANGE_TOO_LARGE");
  }

  @Test
  void rotaKoduKodlar() {
    assertThat(FundTransferService.route("SIR2-VRM-2026-000001"))
        .isEqualTo("/zto-finans/transfer-merkezi?tab=transfers&q=SIR2-VRM-2026-000001");
    assertThat(FundTransferService.route("A B")).endsWith("&q=A+B");
    // F-12.2-R2: transfer tarihi bağlantıya girer (Transferler sekmesi o günü süzer).
    assertThat(FundTransferService.route("VRM-2026-000007", LocalDate.of(2026, 9, 1)))
        .isEqualTo(
            "/zto-finans/transfer-merkezi?tab=transfers&q=VRM-2026-000007"
                + "&from=2026-09-01&to=2026-09-01");
    assertThat(FundTransferService.route("X", null))
        .isEqualTo("/zto-finans/transfer-merkezi?tab=transfers&q=X");
  }

  private static void assertCode(Runnable call, String code) {
    assertThatThrownBy(call::run)
        .isInstanceOfSatisfying(
            BusinessException.class, e -> assertThat(e.getCode()).isEqualTo(code));
  }

  private static BigDecimal dec(String value) {
    return new BigDecimal(value);
  }
}
