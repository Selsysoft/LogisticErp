package org.ece.blackrose.finance.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Dış kur kaynağı. */
public interface RateSource {

  record FetchedRate(String currency, LocalDate date, BigDecimal rate) {}

  List<FetchedRate> fetchLatest();
}
