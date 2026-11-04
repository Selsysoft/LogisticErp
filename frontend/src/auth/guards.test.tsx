// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "../i18n";
import { Me, useAuthStore } from "./authStore";
import { LandingRedirect, RequireAuth, RequirePermission } from "./guards";
import { tenantFromHost } from "./session";

const baseMe: Me = {
  id: "1",
  email: "a@b.test",
  fullName: "A",
  tenant: "acme",
  permissions: ["FINANCE_VIEW"],
  roles: ["Finans"],
  landingPath: "/finance",
  twoFactorEnabled: false,
};

function renderApp(initial: string) {
  render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/login" element={<div>giriş ekranı</div>} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<LandingRedirect />} />
          <Route path="/finance" element={<div>finans ekranı</div>} />
          <Route
            path="/users"
            element={
              <RequirePermission permission="USER_VIEW">
                <div>kullanıcı ekranı</div>
              </RequirePermission>
            }
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useAuthStore.setState({ status: "authenticated", me: baseMe });
});

afterEach(cleanup);

describe("yetki korumaları", () => {
  it("oturumsuz kullanıcıyı girişe yönlendirir", () => {
    useAuthStore.setState({ status: "anonymous", me: null });
    renderApp("/finance");
    expect(screen.getByText("giriş ekranı")).toBeTruthy();
  });

  it("kullanıcıyı rolünün açılış ekranına götürür", () => {
    renderApp("/");
    expect(screen.getByText("finans ekranı")).toBeTruthy();
  });

  it("izni olmayan ekranı göstermez", () => {
    renderApp("/users");
    expect(screen.queryByText("kullanıcı ekranı")).toBeNull();
    expect(screen.getByText("Yetkiniz yok")).toBeTruthy();
  });

  it("izni olan ekranı gösterir", () => {
    useAuthStore.setState({
      status: "authenticated",
      me: { ...baseMe, permissions: ["USER_VIEW"] },
    });
    renderApp("/users");
    expect(screen.getByText("kullanıcı ekranı")).toBeTruthy();
  });
});

describe("tenantFromHost", () => {
  it("yalnız tek seviyeli subdomain'i firma kodu sayar", () => {
    expect(tenantFromHost("acme.localhost", "localhost")).toBe("acme");
    expect(tenantFromHost("localhost", "localhost")).toBeNull();
    expect(tenantFromHost("a.b.localhost", "localhost")).toBeNull();
  });
});
