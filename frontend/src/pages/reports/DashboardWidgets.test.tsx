// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { apiGet } from "../../api/client";
import { DashboardWidgets } from "./DashboardWidgets";
import { Dashboard, PositionRow } from "./types";

vi.mock("../../api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/client")>()),
  apiGet: vi.fn(),
}));

const finance = (position: PositionRow[] | null): Dashboard => ({
  operations: null,
  finance: {
    overdue: [{ currency: "TRY", total: 150, count: 2 }],
    dueThisWeek: [],
    pendingApproval: 2,
    position,
  },
  fleet: null,
  customs: null,
});

function renderWidgets() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DashboardWidgets />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(apiGet).mockReset();
});

afterEach(cleanup);

describe("DashboardWidgets", { timeout: 20_000 }, () => {
  it("LIMITED kullanıcıda position null gelince pano çökmez; net pozisyon kutucuğu çizilmez", async () => {
    vi.mocked(apiGet).mockResolvedValue(finance(null));
    renderWidgets();

    expect(await screen.findByText("Onay bekleyen plan", {}, { timeout: 5_000 })).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.queryByText(/Net pozisyon/)).toBeNull();
    expect(vi.mocked(apiGet)).toHaveBeenCalledWith("/reports/dashboard");
  });

  it("position doluysa para birimi başına net pozisyon kutucuğu çizilir", async () => {
    vi.mocked(apiGet).mockResolvedValue(
      finance([{ currency: "TRY", cash: 0, receivable: 100, payable: 0, net: 100 }]),
    );
    renderWidgets();

    expect(await screen.findByText("Net pozisyon (TRY)", {}, { timeout: 5_000 })).toBeTruthy();
  });
});
