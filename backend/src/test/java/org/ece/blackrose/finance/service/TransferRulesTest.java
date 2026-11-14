package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Optional;
import java.util.UUID;
import org.ece.blackrose.common.error.BusinessException;
import org.ece.blackrose.finance.domain.FinanceTypes.FundAccountType;
import org.ece.blackrose.finance.domain.FinanceTypes.FundKind;
import org.ece.blackrose.finance.domain.FinanceTypes.FundTransferType;
import org.ece.blackrose.finance.domain.FundAccount;
import org.ece.blackrose.finance.service.FundTransferService.RuleViolation;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

/**
 * ZTO hedef kuralları (12.2_TASARIM §3.3.1 adım 4–5, §3.4.1 adım 4): her tür ve her ihlal kodu;
 * döviz bozumunda iş yeri kısıtı yok (OK-12.2-30).
 */
class TransferRulesTest {

  private static final UUID COMPANY = UUID.randomUUID();
  private static final UUID W1 = UUID.randomUUID();
  private static final UUID W2 = UUID.randomUUID();

  @Test
  void eskiGovdeTuruHesapTurlerindenTuretilir() {
    assertThat(FundTransferService.derivedType(FundKind.BANK, FundKind.BANK))
        .isEqualTo(FundTransferType.EFT);
    assertThat(FundTransferService.derivedType(FundKind.BANK, FundKind.CASH))
        .isEqualTo(FundTransferType.BANK_TO_CASH);
    assertThat(FundTransferService.derivedType(FundKind.CASH, FundKind.BANK))
        .isEqualTo(FundTransferType.CASH_TO_BANK);
    assertThat(FundTransferService.derivedType(FundKind.CASH, FundKind.CASH))
        .isEqualTo(FundTransferType.CASH_TO_CASH);
  }

  @Test
  void virman() {
    FundAccount a = bank("Ziraat", W1, "TRY");
    assertThat(rule(FundTransferType.VIREMENT, a, bank(" ziraat ", W1, "TRY"))).isEmpty();
    assertThat(rule(FundTransferType.VIREMENT, a, cash(W1, "TRY"))).contains("KIND");
    assertThat(rule(FundTransferType.VIREMENT, a, bank("Ziraat", W1, "USD"))).contains("CURRENCY");
    assertThat(rule(FundTransferType.VIREMENT, a, bank("Garanti", W1, "TRY")))
        .contains("SAME_BANK");
    assertThat(rule(FundTransferType.VIREMENT, a, bank("Ziraat", W2, "TRY")))
        .contains("SAME_WORKPLACE");
    assertThat(rule(FundTransferType.VIREMENT, bank(null, W1, "TRY"), bank(null, W1, "TRY")))
        .as("banka adı boş hesaplar aynı banka sayılmaz")
        .contains("SAME_BANK");
    assertThat(
            FundTransferService.ruleViolation(
                    FundTransferType.VIREMENT, a, bank("Garanti", W1, "TRY"))
                .map(RuleViolation::message))
        .contains("Virman sadece aynı banka (Bank alanı) arasında yapılabilir.");
  }

  @ParameterizedTest
  @EnumSource(
      value = FundTransferType.class,
      names = {"EFT", "WIRE"})
  void eftHavale(FundTransferType type) {
    FundAccount a = bank("Ziraat", W1, "TRY");
    assertThat(rule(type, a, bank("Garanti", W1, "TRY"))).isEmpty();
    assertThat(rule(type, a, bank("Ziraat", W2, "TRY"))).isEmpty();
    assertThat(rule(type, a, bank("ZİRAAT", W1, "TRY"))).contains("SAME_BANK_SAME_WORKPLACE");
    assertThat(rule(type, a, cash(W1, "TRY"))).contains("KIND");
    assertThat(rule(type, a, bank("Garanti", W1, "EUR"))).contains("CURRENCY");
  }

  @Test
  void dovizBozumundaIsYeriKisitiYok() {
    FundAccount a = bank("Ziraat", W1, "USD");
    assertThat(rule(FundTransferType.FX_EXCHANGE, a, bank("Ziraat", W2, "TRY"))).isEmpty();
    assertThat(rule(FundTransferType.FX_EXCHANGE, a, bank("Garanti", W1, "TRY"))).isEmpty();
    assertThat(rule(FundTransferType.FX_EXCHANGE, a, bank("Ziraat", W1, "USD")))
        .contains("FX_CURRENCY");
    assertThat(rule(FundTransferType.FX_EXCHANGE, a, cash(W1, "TRY"))).contains("KIND");
  }

  @Test
  void bankaKasaYonleri() {
    FundAccount bank = bank("Ziraat", W1, "TRY");
    FundAccount cash = cash(W2, "TRY");
    assertThat(rule(FundTransferType.BANK_TO_CASH, bank, cash)).isEmpty();
    assertThat(rule(FundTransferType.BANK_TO_CASH, cash, bank)).contains("KIND");
    assertThat(rule(FundTransferType.BANK_TO_CASH, bank, cash(W1, "USD"))).contains("CURRENCY");
    assertThat(rule(FundTransferType.CASH_TO_BANK, cash, bank)).isEmpty();
    assertThat(rule(FundTransferType.CASH_TO_BANK, bank, cash)).contains("KIND");
    assertThat(rule(FundTransferType.CASH_TO_BANK, cash, bank("Z", W1, "USD")))
        .contains("CURRENCY");
    assertThat(rule(FundTransferType.CASH_TO_CASH, cash, cash(W1, "TRY"))).isEmpty();
    assertThat(rule(FundTransferType.CASH_TO_CASH, cash, bank)).contains("KIND");
    assertThat(rule(FundTransferType.CASH_TO_CASH, cash, cash(W1, "EUR"))).contains("CURRENCY");
  }

  @Test
  void yalnizVadesizHesaplar() {
    FundAccount credit = account(FundKind.BANK, "Ziraat", W1, "TRY", FundAccountType.CREDIT);
    assertThat(rule(FundTransferType.EFT, credit, bank("Garanti", W1, "TRY")))
        .contains("ACCOUNT_TYPE");
    assertThat(rule(FundTransferType.EFT, bank("Garanti", W1, "TRY"), credit))
        .contains("ACCOUNT_TYPE");
  }

  @Test
  void bankaAdiKarsilastirmasi() {
    assertThat(FundTransferService.sameBank("İş Bankası", "iş   bankası")).isTrue();
    assertThat(FundTransferService.sameBank("", "")).isFalse();
    assertThat(FundTransferService.sameBank(null, "Ziraat")).isFalse();
  }

  @Test
  void sirketlerArasiTurKurallari() {
    FundAccount bank = bank("Ziraat", W1, "TRY");
    FundAccount cash = cash(W2, "TRY");
    IntercompanyTransferService.requireRule(FundTransferType.EFT, bank, bank("Ziraat", W1, "TRY"));
    IntercompanyTransferService.requireRule(
        FundTransferType.WIRE, bank, bank("Garanti", W2, "TRY"));
    IntercompanyTransferService.requireRule(FundTransferType.BANK_TO_CASH, bank, cash);
    IntercompanyTransferService.requireRule(FundTransferType.CASH_TO_BANK, cash, bank);
    IntercompanyTransferService.requireRule(FundTransferType.CASH_TO_CASH, cash, cash(W1, "TRY"));
    assertIntercompany(FundTransferType.VIREMENT, bank, bank, "rule=VIREMENT_INTERCOMPANY");
    assertIntercompany(FundTransferType.FX_EXCHANGE, bank, bank, "rule=FX_INTERCOMPANY");
    assertIntercompany(FundTransferType.EFT, bank, cash, "rule=KIND");
    assertIntercompany(FundTransferType.WIRE, cash, bank, "rule=KIND");
    assertIntercompany(FundTransferType.BANK_TO_CASH, cash, bank, "rule=KIND");
    assertIntercompany(FundTransferType.CASH_TO_BANK, bank, cash, "rule=KIND");
    assertIntercompany(FundTransferType.CASH_TO_CASH, bank, cash, "rule=KIND");
    assertIntercompany(
        FundTransferType.EFT,
        account(FundKind.BANK, "Z", W1, "TRY", FundAccountType.DEPOSIT),
        bank,
        "rule=ACCOUNT_TYPE");
  }

  private static void assertIntercompany(
      FundTransferType type, FundAccount from, FundAccount to, String detail) {
    assertThatThrownBy(() -> IntercompanyTransferService.requireRule(type, from, to))
        .isInstanceOfSatisfying(
            BusinessException.class,
            e -> {
              assertThat(e.getCode()).isEqualTo("TRANSFER_RULE_VIOLATION");
              assertThat(e.getDetails()).containsExactly(detail);
            });
  }

  private static Optional<String> rule(FundTransferType type, FundAccount from, FundAccount to) {
    return FundTransferService.ruleViolation(type, from, to).map(RuleViolation::rule);
  }

  private static FundAccount bank(String bankName, UUID branch, String currency) {
    return account(FundKind.BANK, bankName, branch, currency, FundAccountType.DEMAND);
  }

  private static FundAccount cash(UUID branch, String currency) {
    return account(FundKind.CASH, null, branch, currency, FundAccountType.DEMAND);
  }

  private static FundAccount account(
      FundKind kind, String bankName, UUID branch, String currency, FundAccountType type) {
    return new FundAccount(
        "K" + UUID.randomUUID(),
        "Hesap",
        kind,
        currency,
        branch,
        COMPANY,
        bankName,
        null,
        false,
        type,
        null,
        null,
        null,
        null);
  }
}
