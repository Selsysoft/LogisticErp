// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { Me, useAuthStore } from "../../auth/authStore";
import { useCompanyStore } from "../../auth/companyStore";
import type { MeCompany } from "../organization/types";
import { companyIdOf, FieldDef, FormDialog, usePaging } from "./common";
import { transferTargets } from "./FundsPage";
import { Fund } from "./types";

const company = (id: string, defaultCompany = false): MeCompany => ({
  id,
  code: id.toUpperCase(),
  shortName: `Şirket ${id}`,
  title: `Şirket ${id} A.Ş.`,
  defaultCompany,
  active: true,
});

const me = (companies: MeCompany[]): Me => ({
  id: "u1",
  email: "x@y.z",
  fullName: "X",
  tenant: "acme",
  permissions: [],
  roles: [],
  landingPath: "/",
  twoFactorEnabled: false,
  companies,
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function choose(label: string, option: string) {
  fireEvent.mouseDown(screen.getByRole("combobox", { name: new RegExp(label) }));
  fireEvent.click(screen.getByRole("option", { name: option }));
}

beforeEach(() => {
  useCompanyStore.setState({ activeCompanyId: null });
  useAuthStore.setState({ me: null });
});

afterEach(cleanup);

describe("FormDialog bağımlı seçenekler", { timeout: 20_000 }, () => {
  const FUNDS: Record<string, { value: string; label: string }[]> = {
    A1: [{ value: "kasa-a", label: "KASA-A" }],
    B1: [{ value: "kasa-b", label: "KASA-B" }],
  };
  const fields: FieldDef[] = [
    {
      name: "branchId",
      label: "İş yeri",
      type: "select",
      required: true,
      options: [
        { value: "A1", label: "A1" },
        { value: "B1", label: "B1" },
      ],
    },
    {
      name: "fundId",
      label: "Kasa",
      type: "select",
      optionsFrom: (values) => FUNDS[String(values.branchId)] ?? [],
    },
  ];

  it("bağlı alan değişip eski seçim seçeneklerden düşünce değer temizlenir (422 COMPANY_MISMATCH olmaz)", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <FormDialog
        title="Ödeme"
        fields={fields}
        onClose={() => {}}
        onSubmit={onSubmit}
        onSaved={() => {}}
      />,
      { wrapper },
    );

    choose("İş yeri", "A1");
    choose("Kasa", "KASA-A");
    choose("İş yeri", "B1");
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled(), { timeout: 5_000 });
    expect(onSubmit.mock.calls[0][0]).toEqual({ branchId: "B1", fundId: "" });
  });

  it("seçim yeni seçeneklerde de varsa korunur", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const shared: FieldDef[] = [
      fields[0],
      { ...fields[1], optionsFrom: () => [{ value: "ortak", label: "ORTAK" }] },
    ];
    render(
      <FormDialog
        title="Ödeme"
        fields={shared}
        onClose={() => {}}
        onSubmit={onSubmit}
        onSaved={() => {}}
      />,
      { wrapper },
    );

    choose("İş yeri", "A1");
    choose("Kasa", "ORTAK");
    choose("İş yeri", "B1");
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled(), { timeout: 5_000 });
    expect(onSubmit.mock.calls[0][0]).toEqual({ branchId: "B1", fundId: "ortak" });
  });
});

describe("transferTargets", () => {
  const fund = (id: string, companyId: string): Fund =>
    ({ id, companyId, name: id, currency: "TRY" }) as Fund;
  const funds = [fund("a1", "A"), fund("a2", "A"), fund("b1", "B")];

  it("kaynak seçiliyse yalnız aynı şirketin diğer fonları; şirketler arası transfer sunulmaz", () => {
    expect(transferTargets(funds, "a1").map((o) => o.value)).toEqual(["a2"]);
    expect(transferTargets(funds, "b1")).toEqual([]);
    expect(transferTargets(funds, "").map((o) => o.value)).toEqual(["a1", "a2", "b1"]);
    expect(transferTargets(undefined, "a1")).toEqual([]);
  });
});

describe("usePaging", () => {
  it("aktif şirket değişince ilk sayfaya döner", () => {
    const { result } = renderHook(() => usePaging());
    act(() => result.current.setPage(3));
    expect(result.current.page).toBe(3);

    act(() => useCompanyStore.getState().setActive("B"));
    expect(result.current.page).toBe(0);

    act(() => result.current.setPage(2));
    expect(result.current.page).toBe(2);
  });
});

describe("companyIdOf", () => {
  it("seçilen şirketi, alan yoksa varsayılan olmayan tek görünen şirketi gönderir", () => {
    expect(companyIdOf({ companyId: "a" })).toEqual({ companyId: "a" });

    // Gerçek tek şirketli kiracı: gövdeye companyId konmaz (§6.13).
    useAuthStore.setState({ me: me([company("a", true)]) });
    expect(companyIdOf({})).toEqual({});

    // LIMITED, yalnız varsayılan olmayan B görünür: sunucu null'ı A'ya çözüp 403 verirdi (FE-2).
    useAuthStore.setState({ me: me([company("b")]) });
    expect(companyIdOf({})).toEqual({ companyId: "b" });
    expect(companyIdOf({ companyId: "" })).toEqual({ companyId: "b" });
  });
});
