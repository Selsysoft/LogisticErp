import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../../api/client";
import { Page } from "../finance/types";
import { Customer, TaxRate, Tariff } from "./types";

export function useCustomers() {
  return useQuery({
    queryKey: ["crm", "customers", "options"],
    queryFn: () => apiGet<Page<Customer>>("/crm/customers?size=200&sort=name"),
    select: (page) => page.content,
  });
}

export function useTariffs() {
  return useQuery({
    queryKey: ["crm", "tariffs"],
    queryFn: () => apiGet<Tariff[]>("/crm/tariffs"),
  });
}

export function useTaxRates() {
  return useQuery({
    queryKey: ["crm", "tax-rates"],
    queryFn: () => apiGet<TaxRate[]>("/crm/tax-rates"),
  });
}

export function customerOptions(customers: Customer[] | undefined) {
  return (customers ?? []).map((customer) => ({
    value: customer.id,
    label: `${customer.code} · ${customer.name}`,
  }));
}

export function customerName(customers: Customer[] | undefined, id: string | null) {
  return customers?.find((customer) => customer.id === id)?.name ?? "—";
}

/** Boş metin alanını API'ye boş değer olarak gönderir. */
export function orNull(value: string | undefined) {
  return value ? value : null;
}
