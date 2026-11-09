package org.ece.blackrose.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.availability.ApplicationAvailability;
import org.springframework.boot.availability.ApplicationAvailabilityBean;
import org.springframework.boot.availability.AvailabilityChangeEvent;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.context.support.StaticApplicationContext;

class PingControllerTest {

  @Test
  void acilisBitmedenHazirDegilBitinceHazirDer() {
    ApplicationAvailabilityBean availability = new ApplicationAvailabilityBean();
    PingController ping = new PingController(availability);
    StaticApplicationContext context = new StaticApplicationContext();

    availability.onApplicationEvent(
        new AvailabilityChangeEvent<>(context, ReadinessState.REFUSING_TRAFFIC));
    assertThat(ping.ping().getStatusCode().value()).isEqualTo(503);

    availability.onApplicationEvent(
        new AvailabilityChangeEvent<>(context, ReadinessState.ACCEPTING_TRAFFIC));
    assertThat(ping.ping().getStatusCode().value()).isEqualTo(200);
    assertThat(availability).isInstanceOf(ApplicationAvailability.class);
  }
}
