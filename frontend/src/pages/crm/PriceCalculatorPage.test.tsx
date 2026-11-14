// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { apiGet, apiRequest } from "../../api/client";
import { Me, useAuthStore } from "../../auth/authStore";
import { useCompanyStore } from "../../auth/companyStore";
import type { MeCompany } from "../organization/types";
import { PriceCalculatorPage } from "./PriceCalculatorPage";

vi.mock("../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/client")>()),
  apiGet: vi.fn(),
  apiRequest: vi.fn(),
}));

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

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PriceCalculatorPage />
    </QueryClientProvider>,
  );
}

async function calculate() {
  fireEvent.change(await screen.findByRole("textbox", { name: /Çıkış/ }, { timeout: 5_000 }), {
    target: { value: "İzmir" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: /Varış/ }), {
    target: { value: "Ankara" },
  });
  // Pencere başlığı ve gönder düğmesi aynı metni taşır; düğme olanı tıklanır.
  const buttons = screen.getAllByRole("button", { name: "Hesapla" });
  fireEvent.click(buttons[buttons.length - 1]);
  await vi.waitFor(() => expect(apiRequest).toHaveBeenCalled(), { timeout: 5_000 });
  const [method, path, body] = vi.mocked(apiRequest).mock.calls[0];
  expect([method, path]).toEqual(["POST", "/crm/pricing/calculate"]);
  return body as Record<string, unknown>;
}

beforeEach(() => {
  vi.mocked(apiGet).mockReset();
  vi.mocked(apiRequest).mockReset();
  vi.mocked(apiGet).mockImplementation((path: string) =>
    Promise.resolve(path.startsWith("/crm/customers") ? { content: [] } : []),
  );
  vi.mocked(apiRequest).mockReturnValue(new Promise(() => {}));
  useCompanyStore.setState({ activeCompanyId: null });
});

afterEach(cleanup);

describe("PriceCalculatorPage şirket (§5.5 PriceRequest.companyId)", { timeout: 20_000 }, () => {
  it("tek şirkette Şirket alanı yok ve gövdeye companyId konmaz", async () => {
    useAuthStore.setState({ me: me([company("a", true)]) });
    renderPage();

    const body = await calculate();
    expect(screen.queryByRole("combobox", { name: /Şirket/ })).toBeNull();
    expect(body).not.toHaveProperty("companyId");
    expect(body).toMatchObject({ origin: "İzmir", destination: "Ankara" });
  });

  it("çok şirkette alan aktif şirketle (B) dolar ve gövdeye companyId B gider", async () => {
    useAuthStore.setState({ me: me([company("a", true), company("b")]) });
    useCompanyStore.setState({ activeCompanyId: "b" });
    renderPage();

    expect(
      (await screen.findByRole("combobox", { name: /Şirket/ }, { timeout: 5_000 })).textContent,
    ).toBe("Şirket b");
    const body = await calculate();
    expect(body.companyId).toBe("b");
  });
});
