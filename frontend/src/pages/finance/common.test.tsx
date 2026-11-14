// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { ReactNode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { Me, useAuthStore } from "../../auth/authStore";
import { useCompanyStore } from "../../auth/companyStore";
import type { MeCompany } from "../organization/types";
import { ApiError } from "../../api/client";
import {
  companyIdOf,
  ConfirmDialog,
  FieldDef,
  FormDialog,
  localizeFinanceError,
  SubmitCancelled,
  useConfirm,
  usePaging,
} from "./common";
import { fundListRows, transferTargets } from "./FundsPage";
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

describe("FormDialog 12.2 ekleri", { timeout: 20_000 }, () => {
  const textFields: FieldDef[] = [
    { name: "amount", label: "Tutar", type: "amount", required: true },
    { name: "note", label: "Not" },
  ];

  it("prop verilmeyen form eskisi gibi: not alanı yok, gönderim değerleri aynı", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onSaved = vi.fn();
    render(
      <FormDialog
        title="Eski"
        fields={textFields}
        onClose={() => {}}
        onSubmit={onSubmit}
        onSaved={onSaved}
      />,
      { wrapper },
    );
    expect(screen.queryByTestId("form-notice")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: /Tutar/ }), { target: { value: "12,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual({ amount: "12.5", note: "" });
  });

  it("onValuesChange: üst setState yapsa da alan değişimi başına tek çağrı, render döngüsü yok", async () => {
    const calls: Array<Record<string, unknown>> = [];
    let renders = 0;
    function Parent() {
      const [, setLast] = useState<Record<string, unknown>>({});
      renders += 1;
      return (
        <FormDialog
          title="Abonelik"
          fields={textFields}
          onClose={() => {}}
          onSubmit={() => Promise.resolve()}
          onSaved={() => {}}
          // Her çizimde yeni fonksiyon ve her çağrıda yeni nesne: döngü kurulmamalı.
          onValuesChange={(values) => {
            calls.push({ ...values });
            setLast({ ...values });
          }}
        />
      );
    }
    render(<Parent />, { wrapper });
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({ amount: "", note: "" });

    const note = screen.getByRole("textbox", { name: "Not" });
    fireEvent.change(note, { target: { value: "a" } });
    fireEvent.change(note, { target: { value: "ab" } });
    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls[2]).toMatchObject({ note: "ab" });
    // Biraz bekleyince yeni çağrı/çizim gelmez (sonsuz döngü yok).
    const rendersAfter = renders;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(calls).toHaveLength(3);
    expect(renders).toBe(rendersAfter);
    expect(renders).toBeLessThan(10);
  });

  it("notice değerlere göre gönder düğmesinin üstünde çizilir", async () => {
    render(
      <FormDialog
        title="Not"
        fields={textFields}
        onClose={() => {}}
        onSubmit={() => Promise.resolve()}
        onSaved={() => {}}
        notice={(values) => (values.note ? <span>not: {String(values.note)}</span> : null)}
      />,
      { wrapper },
    );
    // Canlı bölge içerik gelmeden önce DOM'da (boş ve görünmez) durur; ilk uyarı duyurulur (F-12.2-R7).
    const region = screen.getByTestId("form-notice");
    expect(region.getAttribute("role")).toBe("status");
    expect(region.childNodes).toHaveLength(0);
    expect(region.style.position).toBe("absolute");
    fireEvent.change(screen.getByRole("textbox", { name: "Not" }), { target: { value: "x" } });
    expect(await screen.findByText("not: x")).toBeTruthy();
    expect(screen.getByTestId("form-notice")).toBe(region);
    expect(region.style.position).toBe("");
    expect(within(screen.getByRole("status")).getByText("not: x")).toBeTruthy();
  });

  it("SubmitCancelled: pencere açık kalır, hata gösterilmez, onSaved çağrılmaz", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new SubmitCancelled());
    const onSaved = vi.fn();
    render(
      <FormDialog
        title="İptal"
        fields={textFields}
        onClose={() => {}}
        onSubmit={onSubmit}
        onSaved={onSaved}
      />,
      { wrapper },
    );
    fireEvent.change(screen.getByRole("textbox", { name: /Tutar/ }), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    await waitFor(() =>
      expect((screen.getByRole("button", { name: "Kaydet" }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "İptal" })).toBeTruthy();
    expect(new SubmitCancelled().name).toBe("SubmitCancelled");
  });

  it("signedAmount eksi tutarı kabul eder, harfi reddeder", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <FormDialog
        title="Açılış"
        fields={[{ name: "opening", label: "Açılış", type: "signedAmount" }]}
        onClose={() => {}}
        onSubmit={onSubmit}
        onSaved={() => {}}
      />,
      { wrapper },
    );
    const input = screen.getByRole("textbox", { name: "Açılış" });
    expect(input.getAttribute("inputmode")).toBe("decimal");
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "-100,5" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toEqual({ opening: "-100.5" });
  });
});

describe("ConfirmDialog ve useConfirm", { timeout: 20_000 }, () => {
  it("başlıkla adlandırılır, ilk odak Vazgeç", () => {
    render(
      <ConfirmDialog
        open
        title="Uyarı"
        confirmLabel="Tamam"
        cancelLabel="Vazgeç"
        onConfirm={() => {}}
        onCancel={() => {}}
      >
        Metin
      </ConfirmDialog>,
    );
    expect(screen.getByRole("dialog", { name: "Uyarı" })).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("Vazgeç");
  });

  it("ask: Tamam → true, Vazgeç → false; yeni soru eskisini false ile kapatır", async () => {
    let api: ReturnType<typeof useConfirm> | null = null;
    function Host() {
      api = useConfirm({ title: "Uyarı", confirm: "Tamam", cancel: "Vazgeç" });
      return api.dialog;
    }
    render(<Host />);
    let first!: Promise<boolean>;
    act(() => {
      first = api!.ask("Birinci");
    });
    expect(await screen.findByText("Birinci")).toBeTruthy();
    let second!: Promise<boolean>;
    act(() => {
      second = api!.ask("İkinci");
    });
    await expect(first).resolves.toBe(false);
    fireEvent.click(await screen.findByRole("button", { name: "Tamam" }));
    await expect(second).resolves.toBe(true);
    let third!: Promise<boolean>;
    act(() => {
      third = api!.ask("Üçüncü");
    });
    fireEvent.click(await screen.findByRole("button", { name: "Vazgeç" }));
    await expect(third).resolves.toBe(false);
  });
});

describe("localizeFinanceError", () => {
  const body = { code: "FUND_INACTIVE", message: "server", details: ["a"], traceId: "t" };

  it("bilinen kodda yerel ileti, diğerlerinde hata aynen", () => {
    const known = localizeFinanceError(new ApiError(422, body), (key) =>
      key === "finance.error.FUND_INACTIVE" ? "Pasif" : null,
    ) as ApiError;
    expect(known).toBeInstanceOf(ApiError);
    expect(known.message).toBe("Pasif");
    expect(known.status).toBe(422);
    expect(known.body.details).toEqual(["a"]);
    const unknown = new ApiError(400, { ...body, code: "X" });
    expect(localizeFinanceError(unknown, () => null)).toBe(unknown);
    const plain = new Error("x");
    expect(localizeFinanceError(plain, () => "y")).toBe(plain);
  });
});

describe("fundListRows", () => {
  const fund = (
    id: string,
    companyId: string,
    kind: "BANK" | "CASH",
    currency = "TRY",
    balance = 10,
  ) => ({ id, companyId, kind, currency, balance, name: id }) as Fund;
  const funds = [
    fund("a1", "A", "BANK"),
    fund("b1", "B", "CASH", "TRY", 5),
    fund("a2", "A", "CASH", "USD", 3),
    fund("a3", "A", "CASH", "TRY", 0.1),
  ];

  it("süzgeç: Tümü/Banka/Kasa; gruplama yoksa yalnız fon satırları", () => {
    expect(fundListRows(funds, "ALL", false).map((r) => r.key)).toEqual(["a1", "b1", "a2", "a3"]);
    expect(fundListRows(funds, "BANK", false).map((r) => r.key)).toEqual(["a1"]);
    expect(fundListRows(funds, "CASH", false).map((r) => r.key)).toEqual(["b1", "a2", "a3"]);
  });

  it("≥ 2 şirkette şirket grupları ve para birimi başına toplam satırı", () => {
    const rows = fundListRows(funds, "ALL", true);
    expect(rows.map((r) => r.key)).toEqual([
      "a1",
      "a2",
      "a3",
      "total-A-TRY",
      "total-A-USD",
      "b1",
      "total-B-TRY",
    ]);
    expect(rows[3]).toEqual({
      type: "total",
      key: "total-A-TRY",
      companyId: "A",
      currency: "TRY",
      balance: 10.1,
    });
    expect(fundListRows(funds, "BANK", true).map((r) => r.key)).toEqual(["a1", "total-A-TRY"]);
  });

  it("pasif fon transfer hedefi olmaz", () => {
    const passive = { ...fund("a4", "A", "BANK"), active: false } as Fund;
    expect(transferTargets([...funds, passive], "a1").map((o) => o.value)).toEqual(["a2", "a3"]);
  });
});
