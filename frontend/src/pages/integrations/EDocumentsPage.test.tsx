// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { apiGet, apiRequest, ApiError } from "../../api/client";
import { Me, useAuthStore } from "../../auth/authStore";
import type { MeCompany } from "../organization/types";
import { EDocumentsPage } from "./EDocumentsPage";
import type { EDocument, EDocumentSettings } from "./types";

vi.mock("../../api/client", async (original) => ({
  ...(await original<typeof import("../../api/client")>()),
  apiGet: vi.fn(),
  apiRequest: vi.fn(),
}));

const get = vi.mocked(apiGet);
const request = vi.mocked(apiRequest);

const A: MeCompany = {
  id: "c1",
  code: "A",
  shortName: "Acme",
  title: "Acme AŞ",
  defaultCompany: true,
  active: true,
};
const B: MeCompany = { ...A, id: "c2", code: "B", shortName: "Beta", defaultCompany: false };
const SETTINGS: EDocumentSettings = {
  taxNumber: "1234567890",
  taxOffice: "Kordon",
  address: null,
  provider: "MOCK",
  testProvider: false,
};
const DOCS: EDocument[] = [
  {
    id: "d1",
    kind: "EFATURA",
    sourceType: "FREIGHT_INVOICE",
    sourceId: "f1",
    sourceNo: "NF-2026-000001",
    ettn: "ettn-1",
    provider: "MOCK",
    status: "SENT",
    message: null,
    companyId: "c2",
  },
];

function renderPage(permissions: string[], companies: MeCompany[]) {
  const me: Me = {
    id: "u1",
    email: "a@b.test",
    fullName: "A",
    tenant: "acme",
    permissions,
    roles: [],
    landingPath: "/",
    twoFactorEnabled: false,
    companies,
  };
  useAuthStore.setState({ status: "authenticated", me });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <EDocumentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
  request.mockReset();
  get.mockImplementation(async (path: string) => {
    if (path === "/integration/e-document-settings") return SETTINGS;
    if (path === "/integration/e-documents") return DOCS;
    if (path === "/integration/e-documents/candidates") return [];
    throw new Error(`beklenmeyen istek ${path}`);
  });
  request.mockResolvedValue(SETTINGS);
});

afterEach(cleanup);

const NOTE =
  "Bu bilgiler varsayılan şirkete aittir. Diğer şirketler Şirketler ekranından yönetilir.";

// MUI diyalogları jsdom'da ve kapsam ölçümüyle yavaştır.
describe("EDocumentsPage — firma e-belge bilgileri", { timeout: 20_000 }, () => {
  it("SHIPMENT_INVOICE ile diyalog açılır ve cephe ucuna yazar (K-5)", async () => {
    renderPage(["SHIPMENT_INVOICE"], [A]);
    await screen.findByText(/Vergi no: 1234567890/);
    fireEvent.click(screen.getByRole("button", { name: "Düzenle" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /Vergi no/ }), {
      target: { value: "9876543210" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("PUT", "/integration/e-document-settings", {
        taxNumber: "9876543210",
        taxOffice: "Kordon",
        address: null,
      }),
    );
  });

  it("geçersiz VKN hatası diyalogda ApiError iletisiyle gösterilir", async () => {
    request.mockRejectedValue(
      new ApiError(422, {
        code: "TAX_NUMBER_INVALID",
        message: "Vergi numarası geçersiz.",
        details: [],
        traceId: null,
      }),
    );
    renderPage(["SHIPMENT_INVOICE"], [A]);
    await screen.findByText(/Vergi no: 1234567890/);
    fireEvent.click(screen.getByRole("button", { name: "Düzenle" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByText("Vergi numarası geçersiz.")).toBeTruthy();
  });

  it("tek şirkette bilgi notu ve Şirket kolonu yok; izinsiz kullanıcı düzenleyemez", async () => {
    renderPage([], [A, { ...B, active: false }]);
    await screen.findByText("NF-2026-000001");
    expect(screen.queryByText(NOTE)).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Şirket" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Düzenle" })).toBeNull();
  });

  it("≥2 aktif şirkette bilgi notu, Şirketler bağlantısı ve belgenin şirketi görünür", async () => {
    renderPage(["SHIPMENT_INVOICE", "FINANCE_VIEW"], [A, B]);
    await screen.findByText("NF-2026-000001");
    expect(screen.getByText(NOTE)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Şirketler ekranına git" }).getAttribute("href")).toBe(
      "/zto-finans/tanimlar/sirketler",
    );
    expect(screen.getByRole("columnheader", { name: "Şirket" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Beta" })).toBeTruthy();
  });

  it("FINANCE_VIEW yoksa not görünür ama bağlantı yoktur", async () => {
    renderPage(["SHIPMENT_INVOICE"], [A, B]);
    await screen.findByText(NOTE);
    expect(screen.queryByRole("link", { name: "Şirketler ekranına git" })).toBeNull();
  });
});
