// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "../i18n";
import { lazyPage, SuspenseOutlet } from "./lazyPage";

function Hello() {
  return <div>merhaba sayfası</div>;
}

function renderAt(element: React.ReactNode) {
  render(
    <MemoryRouter initialEntries={["/page"]}>
      <Routes>
        <Route element={<SuspenseOutlet />}>
          <Route path="/page" element={element} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("lazyPage", () => {
  afterEach(cleanup);

  it("adlı dışa aktarımı yükleyip gösterir", async () => {
    const Page = lazyPage(() => Promise.resolve({ Hello }), "Hello");
    renderAt(<Page />);
    expect(await screen.findByText("merhaba sayfası")).toBeTruthy();
  });

  it("dosya yüklenemezse boş ekran yerine yenileme uyarısı gösterir", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Page = lazyPage(
      () => Promise.reject<{ Hello: typeof Hello }>(new Error("Failed to fetch")),
      "Hello",
    );
    renderAt(<Page />);
    expect(await screen.findByText("Sayfa yüklenemedi", { exact: false })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sayfayı yenile" })).toBeTruthy();
    error.mockRestore();
  });
});
