// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { apiGet, apiRequest } from "../../api/client";
import { Me, useAuthStore } from "../../auth/authStore";
import type { BranchTree } from "../organization/types";
import type { Page, Role, User, UserBranchScope } from "./types";
import { UsersPage } from "./UsersPage";

vi.mock("../../api/client", async (original) => ({
  ...(await original<typeof import("../../api/client")>()),
  apiGet: vi.fn(),
  apiRequest: vi.fn(),
}));

const get = vi.mocked(apiGet);
const request = vi.mocked(apiRequest);

const ROLE: Role = {
  id: "r1",
  code: "FINANS",
  name: "Finans",
  locked: false,
  priority: 1,
  landingPath: "/finance",
  permissions: [],
};
const user = (id: string, email: string, branchScope: User["branchScope"]): User => ({
  id,
  email,
  fullName: `Ad ${id}`,
  status: "ACTIVE",
  twoFactorEnabled: false,
  roles: [ROLE],
  mailIssue: null,
  branchScope,
});
const USERS: Page<User> = {
  content: [user("u1", "ben@acme.test", "ALL"), user("u2", "ayse@acme.test", "LIMITED")],
  page: 0,
  size: 20,
  totalElements: 2,
  totalPages: 1,
};
const TREE: BranchTree = [
  {
    companyId: "c1",
    companyName: "Acme",
    companyActive: true,
    groups: [
      {
        groupId: "g1",
        groupName: "İzmir",
        groupActive: true,
        branches: [
          { id: "a", code: "IY-1", name: "Bornova", active: true },
          { id: "b", code: "IY-2", name: "Kemalpaşa", active: false },
        ],
      },
    ],
  },
];
const ME: Me = {
  id: "u1",
  email: "ben@acme.test",
  fullName: "Ben",
  tenant: "acme",
  permissions: ["USER_VIEW", "USER_MANAGE"],
  roles: ["PATRON"],
  landingPath: "/users",
  twoFactorEnabled: false,
  branchScope: "ALL",
  allowedBranchIds: null,
};

let scopes: Record<string, UserBranchScope>;
let client: QueryClient;

beforeEach(() => {
  scopes = {
    u1: { scope: "ALL", branchIds: [], defaultBranchId: null },
    u2: { scope: "ALL", branchIds: [], defaultBranchId: null },
  };
  get.mockReset();
  request.mockReset();
  get.mockImplementation(async (path: string) => {
    if (path.startsWith("/identity/users?")) return USERS;
    if (path === "/identity/roles") return [ROLE];
    if (path.startsWith("/organization/branch-tree")) return TREE;
    const match = /^\/identity\/users\/(\w+)\/branch-scope$/.exec(path);
    if (match) return scopes[match[1]];
    throw new Error(`beklenmeyen istek ${path}`);
  });
  request.mockImplementation(async (_method, _path, body) => body);
  useAuthStore.setState({ status: "authenticated", me: ME, reloadMe: vi.fn() });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <UsersPage />
    </QueryClientProvider>,
  );
});

afterEach(cleanup);

async function openEdit(email: string) {
  const row = (await screen.findByText(email)).closest("tr")!;
  fireEvent.click(within(row).getByRole("button", { name: "Düzenle" }));
  return screen.getByRole("dialog");
}

async function openScopeTab(email: string) {
  const dialog = await openEdit(email);
  fireEvent.click(within(dialog).getByRole("tab", { name: "İş Yeri Yetkisi" }));
  await within(dialog).findByRole("radio", { name: "Seçili iş yerleri" });
  return dialog;
}

// MUI diyalogları jsdom'da ve kapsam ölçümüyle yavaştır.
describe("Kullanıcılar — İş Yeri Yetkisi", { timeout: 20_000 }, () => {
  it("listede kapsam rozeti; davet diyaloğunda sekme yok", async () => {
    const row = (await screen.findByText("ayse@acme.test")).closest("tr")!;
    expect(within(row).getByText("Sınırlı")).toBeTruthy();
    expect(within(screen.getByText("ben@acme.test").closest("tr")!).getByText("Tümü")).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "İş Yerleri" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Kullanıcı davet et" }));
    expect(within(screen.getByRole("dialog")).queryByRole("tab")).toBeNull();
  });

  it("her sekmede tek Kaydet; Genel sekmesi formdur, yetki sekmesi değildir", async () => {
    const dialog = await openEdit("ayse@acme.test");
    expect(within(dialog).getAllByRole("button", { name: "Kaydet" })).toHaveLength(1);
    expect(within(dialog).getByRole("button", { name: "Kaydet" }).closest("form")).not.toBeNull();

    fireEvent.click(within(dialog).getByRole("tab", { name: "İş Yeri Yetkisi" }));
    await within(dialog).findByRole("radio", { name: "Tüm iş yerleri" });
    const save = within(dialog).getAllByRole("button", { name: "Kaydet" });
    expect(save).toHaveLength(1);
    expect(save[0].closest("form")).toBeNull();
    expect(save[0].getAttribute("type")).toBe("button");
    expect(get).toHaveBeenCalledWith("/identity/users/u2/branch-scope");
  });

  it("boş LIMITED seçimi istemcide reddeder, istek göndermez", async () => {
    const dialog = await openScopeTab("ayse@acme.test");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Seçili iş yerleri" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(await within(dialog).findByText("En az bir iş yeri seçin.")).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
  });

  it("arama kutusunda Enter kullanıcı PUT'unu göndermez; Kaydet kapsamı yazar ve ağacı geçersizler", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const dialog = await openScopeTab("ayse@acme.test");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Seçili iş yerleri" }));

    const search = await within(dialog).findByPlaceholderText("İş yeri / şube ara...");
    expect(search.closest("form")).toBeNull();
    fireEvent.change(search, { target: { value: "Kemal" } });
    fireEvent.keyDown(search, { key: "Enter", code: "Enter" });
    fireEvent.keyPress(search, { key: "Enter", code: "Enter", charCode: 13 });
    fireEvent.change(search, { target: { value: "" } });
    expect(request).not.toHaveBeenCalled();

    // Pasif iş yeri de kapsama verilebilir.
    const passive = await waitFor(() => {
      const input = dialog.querySelector<HTMLInputElement>('input.dpr-wp-check[value="b"]');
      expect(input).not.toBeNull();
      return input!;
    });
    fireEvent.click(passive);
    fireEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("PUT", "/identity/users/u2/branch-scope", {
        scope: "LIMITED",
        branchIds: ["b"],
        defaultBranchId: null,
      }),
    );
    expect(request).not.toHaveBeenCalledWith("PUT", "/identity/users/u2", expect.anything());
    expect(await screen.findByText("İş yeri yetkisi kaydedildi.")).toBeTruthy();
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["branch-tree"] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["users"] });
    });
    expect(useAuthStore.getState().reloadMe).not.toHaveBeenCalled();
  });

  it("ALL kapsam iş yeri listesi göndermez; kendi kapsamını kaydeden kullanıcıda /auth/me yenilenir", async () => {
    scopes.u1 = { scope: "LIMITED", branchIds: ["a"], defaultBranchId: "a" };
    const dialog = await openScopeTab("ben@acme.test");
    expect(
      (within(dialog).getByRole("radio", { name: "Seçili iş yerleri" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    fireEvent.click(within(dialog).getByRole("radio", { name: "Tüm iş yerleri" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));

    await waitFor(() =>
      expect(request).toHaveBeenCalledWith("PUT", "/identity/users/u1/branch-scope", {
        scope: "ALL",
        branchIds: [],
        defaultBranchId: "a",
      }),
    );
    await waitFor(() => expect(useAuthStore.getState().reloadMe).toHaveBeenCalled());
  });

  it("sunucu hatasını ApiError iletisiyle gösterir", async () => {
    request.mockRejectedValue(new Error("Patron kullanıcı tüm iş yerlerini görür."));
    const dialog = await openScopeTab("ayse@acme.test");
    fireEvent.click(within(dialog).getByRole("button", { name: "Kaydet" }));
    expect(
      await within(dialog).findByText("Patron kullanıcı tüm iş yerlerini görür."),
    ).toBeTruthy();
  });
});
