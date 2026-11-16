import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { useAuthStore } from "../../../../auth/authStore";
import { useCompanyStore } from "../../../../auth/companyStore";
import type { Branch, BranchGroup, Company, MeCompany } from "../../../../pages/organization/types";
import { missingDefinitionFormClasses } from "../../../components/definitionFormDecor";
import { ZtoFinansLayout } from "../../ZtoFinansLayout";

/**
 * Tanım ekranı testlerinin ortak düzeneği (yalnız testler içe aktarır): sahte API yanıtları,
 * oturum, ZtoFinansLayout içinde rota. `api/client` testte vi.mock ile `fakeApi`'ye bağlanır.
 */

export type ApiCall = {
  method: string;
  path: string;
  body?: unknown;
  /** İstek başlıkları (ör. `Idempotency-Key`); yalnız başlık geçiren testler doldurur. */
  headers?: Record<string, string>;
};
type Handler = (call: ApiCall) => unknown;

export const fakeApi = {
  calls: [] as ApiCall[],
  handlers: [] as Array<{ method: string; match: RegExp | string; reply: Handler }>,
  reset() {
    this.calls = [];
    this.handlers = [];
  },
  on(method: string, match: RegExp | string, reply: unknown | Handler) {
    this.handlers.unshift({
      method,
      match,
      reply: typeof reply === "function" ? (reply as Handler) : () => reply,
    });
  },
  async request(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<unknown> {
    const call: ApiCall = { method, path, body, headers };
    this.calls.push(call);
    const handler = this.handlers.find(
      (h) =>
        h.method === method &&
        (typeof h.match === "string" ? h.match === path : h.match.test(path)),
    );
    if (!handler) throw new Error(`Sahte API: yanıt yok ${method} ${path}`);
    return handler.reply(call);
  },
  /** Yalnız yol listesi (yöntemle). */
  log(method?: string) {
    return this.calls.filter((c) => !method || c.method === method).map((c) => c.path);
  },
};

/** ApiError benzeri (message + body.code). */
export function apiError(status: number, code: string, message: string) {
  return Object.assign(new Error(message), { status, body: { code, message, details: [] } });
}

export const page = <T,>(content: T[]) => ({
  content,
  page: 0,
  size: 200,
  totalElements: content.length,
  totalPages: 1,
});

const audit = {
  createdBy: "ayse@acme.com",
  createdAt: "2026-03-04T08:05:00",
  updatedBy: "ayse@acme.com",
  updatedAt: "2026-03-04T08:05:00",
  updateCount: 0,
};

export function makeBranch(overrides: Partial<Branch> = {}): Branch {
  return {
    id: "b1",
    code: "IY-0001",
    name: "Merkez",
    companyId: "c1",
    companyName: "Acme",
    branchGroupId: "g1",
    branchGroupName: "İzmir",
    phone: "02321112233",
    address: "Alsancak",
    city: null,
    district: null,
    latitude: 38.4,
    longitude: 27.14,
    sgkWorkplaceNo: null,
    active: true,
    ...audit,
    ...overrides,
  };
}

export function makeGroup(overrides: Partial<BranchGroup> = {}): BranchGroup {
  return {
    id: "g1",
    companyId: "c1",
    companyName: "Acme",
    name: "İzmir",
    groupType: "MAIN",
    phone: "02320000000",
    email: "izmir@acme.com",
    address: "Konak",
    managerName: null,
    taxNumber: "1234567890",
    taxOffice: "Konak",
    active: true,
    branchCount: 1,
    ...audit,
    ...overrides,
  };
}

export function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "c1",
    code: "ACME",
    title: "Acme Lojistik A.Ş.",
    shortName: "Acme",
    taxIdType: "VKN",
    taxNumber: "1234567890",
    taxOffice: "Konak",
    mersisNo: null,
    tradeRegistryNo: null,
    sgkWorkplaceNo: null,
    address: "Alsancak",
    city: null,
    district: null,
    postalCode: null,
    country: "TR",
    phone: "02321112233",
    email: "info@acme.com",
    kepAddress: null,
    website: null,
    logoFileId: null,
    defaultFundAccountId: null,
    defaultCompany: true,
    active: true,
    edocumentEnabled: false,
    edocumentTestMode: true,
    branchCount: 1,
    ...audit,
    ...overrides,
  };
}

export const ONE_COMPANY: MeCompany[] = [
  { id: "c1", code: "ACME", shortName: "Acme", title: "Acme", defaultCompany: true, active: true },
];
export const TWO_COMPANIES: MeCompany[] = [
  ...ONE_COMPANY,
  { id: "c2", code: "BETA", shortName: "Beta", title: "Beta", defaultCompany: false, active: true },
];

export function signIn(
  permissions: string[] = ["FINANCE_VIEW", "BRANCH_VIEW", "BRANCH_MANAGE", "COMPANY_MANAGE"],
  companies: MeCompany[] = ONE_COMPANY,
) {
  useAuthStore.setState({
    status: "authenticated",
    me: {
      id: "u1",
      email: "ayse@acme.com",
      fullName: "Ayşe",
      tenant: "acme",
      permissions,
      roles: [],
      landingPath: "/",
      twoFactorEnabled: false,
      companies,
    },
    reloadMe: async () => undefined,
  });
  useCompanyStore.setState({ activeCompanyId: null });
}

function Where() {
  const location = useLocation();
  return (
    <span data-testid="where" data-state={JSON.stringify(location.state ?? null)}>
      {location.pathname + location.search}
    </span>
  );
}

/** Sayfayı /zto-finans kabuğunda verilen yolla çizer; `routes` path → öğe. */
export function renderAt(path: string, routes: Record<string, ReactNode>, state?: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[
          {
            pathname: path.split("?")[0],
            search: path.includes("?") ? `?${path.split("?")[1]}` : "",
            state,
          },
        ]}
      >
        <Routes>
          <Route path="/zto-finans" element={<ZtoFinansLayout />}>
            {Object.entries(routes).map(([routePath, element]) => (
              <Route key={routePath} path={routePath} element={element} />
            ))}
          </Route>
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Formdaki eksik ZTO süsleme sınıfları (boş olmalı: ZTO betiği hiçbir şey eklemezdi). */
export function missingFormClasses(): string[] {
  const form = document.querySelector("form.definition-form") ?? document.querySelector("form");
  if (!form) throw new Error("form yok");
  return missingDefinitionFormClasses(form);
}

export function headers(): string[] {
  return Array.from(document.querySelectorAll("#dataTable thead th"), (th) =>
    (th.textContent ?? "").trim(),
  );
}
