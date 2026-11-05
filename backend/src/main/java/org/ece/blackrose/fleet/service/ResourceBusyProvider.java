package org.ece.blackrose.fleet.service;

import java.time.LocalDate;
import java.util.Set;
import java.util.UUID;
import org.ece.blackrose.fleet.domain.FleetTypes.SubjectType;

/** Filo modülünün sevkiyata bağımlı olmadan kaynak doluluğunu öğrenmesini sağlar. */
public interface ResourceBusyProvider {

  Set<UUID> busyBetween(SubjectType type, LocalDate from, LocalDate to);
}
