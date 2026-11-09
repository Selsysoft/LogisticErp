package org.ece.blackrose.driverapp.service;

import org.ece.blackrose.driverapp.domain.DriverExpense;

/**
 * Sürücü masrafı girildi, onaylandı veya reddedildi. İşlemin içinde yayımlanır; dinleyen bildirimi
 * hazırlar, e-posta işlem kaydedilince gider.
 */
public record DriverExpenseEvent(DriverExpense expense, String actorEmail) {}
