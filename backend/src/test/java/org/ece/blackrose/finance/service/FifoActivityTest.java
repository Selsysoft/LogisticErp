package org.ece.blackrose.finance.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.ece.blackrose.finance.domain.FinanceTypes.FundDirection;
import org.ece.blackrose.finance.service.FundQueryService.ActivityMove;
import org.ece.blackrose.finance.service.FundQueryService.FifoResult;
import org.ece.blackrose.finance.web.FundDtos.FundActivityInflowResponse;
import org.junit.jupiter.api.Test;

/** FIFO faaliyet raporu eşleştirmesi (12.2_TASARIM §3.2.8). */
class FifoActivityTest {

  private static final LocalDate FROM = LocalDate.of(2026, 1, 1);

  @Test
  void bilinenOrnek() {
    ActivityMove in50 = in("50", 2);
    ActivityMove out120 = out("120", 3);
    ActivityMove in30 = in("30", 4);
    ActivityMove out40 = out("40", 5);

    FifoResult result =
        FundQueryService.fifo(new BigDecimal("100"), FROM, List.of(in50, out120, in30, out40));

    assertThat(result.totalIn()).isEqualByComparingTo("80");
    assertThat(result.totalOut()).isEqualByComparingTo("160");
    assertThat(result.unmatchedOut()).isEqualByComparingTo("0");
    assertThat(result.inflows()).hasSize(3);
    FundActivityInflowResponse opening = result.inflows().get(0);
    assertThat(opening.no()).isEqualTo(1);
    assertThat(opening.id()).isNull();
    assertThat(opening.date()).isEqualTo(FROM);
    assertThat(opening.accountingType()).isEqualTo("OPENING");
    assertThat(opening.description()).isEqualTo("Başlangıç");
    assertThat(opening.remaining()).isEqualByComparingTo("0");
    assertThat(opening.outflows()).hasSize(1);
    assertThat(opening.outflows().get(0).amount()).isEqualByComparingTo("100");
    FundActivityInflowResponse second = result.inflows().get(1);
    assertThat(second.id()).isEqualTo(in50.id());
    assertThat(second.outflows()).extracting(o -> o.id()).containsExactly(out120.id(), out40.id());
    assertThat(second.outflows().get(0).amount()).isEqualByComparingTo("20");
    assertThat(second.outflows().get(1).amount()).isEqualByComparingTo("30");
    FundActivityInflowResponse third = result.inflows().get(2);
    assertThat(third.remaining()).isEqualByComparingTo("20");
    assertThat(third.outflows().get(0).id()).isEqualTo(out40.id());
    assertThat(third.outflows().get(0).amount()).isEqualByComparingTo("10");
    assertThat(result.unspent()).hasSize(1);
    assertThat(result.unspent().get(0).no()).isEqualTo(3);
    assertThat(result.unspent().get(0).original()).isEqualByComparingTo("30");
    assertThat(result.unspent().get(0).remaining()).isEqualByComparingTo("20");
    assertThat(result.unspent().get(0).used()).isEqualByComparingTo("10");
  }

  @Test
  void eksiDonemBasiIlkCikisGibiKarsilanmazKalir() {
    FifoResult result =
        FundQueryService.fifo(new BigDecimal("-25"), FROM, List.of(in("40", 2), out("15", 3)));

    assertThat(result.unmatchedOut()).isEqualByComparingTo("25");
    assertThat(result.inflows()).hasSize(1);
    assertThat(result.inflows().get(0).no()).isEqualTo(1);
    assertThat(result.inflows().get(0).remaining()).isEqualByComparingTo("25");
    assertThat(result.unspent().get(0).used()).isEqualByComparingTo("15");
  }

  @Test
  void lotKalmayincaCikisKarsilanmaz() {
    FifoResult result =
        FundQueryService.fifo(
            BigDecimal.ZERO, FROM, List.of(out("10", 1), in("5", 2), out("8", 3)));

    assertThat(result.totalIn()).isEqualByComparingTo("5");
    assertThat(result.totalOut()).isEqualByComparingTo("18");
    assertThat(result.unmatchedOut()).isEqualByComparingTo("13");
    assertThat(result.inflows()).hasSize(1);
    assertThat(result.inflows().get(0).remaining()).isEqualByComparingTo("0");
    assertThat(result.unspent()).isEmpty();
  }

  @Test
  void hareketsizDonem() {
    FifoResult result = FundQueryService.fifo(new BigDecimal("7"), FROM, List.of());

    assertThat(result.inflows()).hasSize(1);
    assertThat(result.unspent()).hasSize(1);
    assertThat(result.unspent().get(0).used()).isEqualByComparingTo("0");
    assertThat(result.totalIn()).isEqualByComparingTo("0");
  }

  private static ActivityMove in(String amount, int day) {
    return move(FundDirection.IN, amount, day);
  }

  private static ActivityMove out(String amount, int day) {
    return move(FundDirection.OUT, amount, day);
  }

  private static ActivityMove move(FundDirection direction, String amount, int day) {
    return new ActivityMove(
        UUID.randomUUID(),
        FROM.plusDays(day),
        direction == FundDirection.IN ? "INCOME" : "EXPENSE",
        direction + " " + amount,
        direction,
        new BigDecimal(amount));
  }
}
