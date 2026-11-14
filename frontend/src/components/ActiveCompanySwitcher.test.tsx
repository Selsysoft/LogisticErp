// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../i18n";
import { Me, useAuthStore } from "../auth/authStore";
import { useCompanyStore } from "../auth/companyStore";
import { ActiveCompanySwitcher } from "./ActiveCompanySwitcher";

const A = {
  id: "c1",
  code: "A",
  shortName: "Acme",
  title: "Acme AŞ",
  defaultCompany: true,
  active: true,
};
const B = {
  id: "c2",
  code: "B",
  shortName: "Beta",
  title: "Beta Ltd",
  defaultCompany: false,
  active: true,
};
const C = {
  id: "c3",
  code: "C",
  shortName: "Eski",
  title: "Eski AŞ",
  defaultCompany: false,
  active: false,
};

const me = (companies: Me["companies"]): Me => ({
  id: "u1",
  email: "a@b.test",
  fullName: "A",
  tenant: "acme",
  permissions: [],
  roles: [],
  landingPath: "/",
  twoFactorEnabled: false,
  companies,
});

beforeEach(() => {
  useCompanyStore.setState({ activeCompanyId: null });
});

afterEach(cleanup);

describe("ActiveCompanySwitcher", () => {
  it("tek aktif şirkette (pasif şirket sayılmaz) ve şirket bilgisi yokken çizilmez", () => {
    useAuthStore.setState({ status: "authenticated", me: me([A, C]) });
    const { container, rerender } = render(<ActiveCompanySwitcher />);
    expect(container.innerHTML).toBe("");

    useAuthStore.setState({ status: "authenticated", me: me(undefined) });
    rerender(<ActiveCompanySwitcher />);
    expect(container.innerHTML).toBe("");
  });

  it("konsolide seçeneği ve yalnız aktif şirketleri sunar; seçim mağazaya yazılır", () => {
    useAuthStore.setState({ status: "authenticated", me: me([A, B, C]) });
    render(<ActiveCompanySwitcher />);

    const select = screen.getByRole("combobox", { name: "Aktif şirket" });
    expect(select.textContent).toBe("Tüm şirketler (konsolide)");

    fireEvent.mouseDown(select);
    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "Tüm şirketler (konsolide)",
      "Acme",
      "Beta",
    ]);

    fireEvent.click(options[2]);
    expect(useCompanyStore.getState().activeCompanyId).toBe("c2");
    expect(screen.getByRole("combobox", { name: "Aktif şirket" }).textContent).toBe("Beta");

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Aktif şirket" }));
    fireEvent.click(within(screen.getByRole("listbox")).getAllByRole("option")[0]);
    expect(useCompanyStore.getState().activeCompanyId).toBeNull();
  });
});
