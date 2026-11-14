// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { lazy } from "react";
import { MemoryRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { useAuthStore } from "../../auth/authStore";
import { AllTransactionsPlaceholderPage } from "./pages/AllTransactionsPlaceholderPage";
import { SIDEBAR_LEAVE_DELAY_MS } from "./ZtoFinanceSidebar";
import { ZtoFinansLayout } from "./ZtoFinansLayout";
import { useZtoRootClass } from "./ZtoRootClassContext";
import { addRootClass, removeRootClass, rootClassName } from "./rootClass";

function ListLike() {
  useZtoRootClass("definition-list-page");
  return <p>liste</p>;
}

function FormLike() {
  useZtoRootClass("definition-form-page");
  useZtoRootClass("definition-form-page");
  return <p>form</p>;
}

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>;
}

function renderAt(path: string, broken = false) {
  const Broken = lazy(() => Promise.reject(new Error("yüklenemedi")));
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/zto-finans" element={<ZtoFinansLayout />}>
          <Route index element={<Navigate to="cari-hareketler" replace />} />
          <Route
            path="cari-hareketler"
            element={broken ? <Broken /> : <AllTransactionsPlaceholderPage />}
          />
          <Route path="vitrin" element={<p>vitrin</p>} />
          <Route path="tanimlar/is-yerleri" element={<ListLike />} />
          <Route path="tanimlar/is-yerleri/yeni" element={<FormLike />} />
        </Route>
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

const q = <T extends Element = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector) as T;
const sidebar = () => q("#ztSidebar");
const arrow = () => screen.getByRole("button", { name: "Finans menüsünü aç/kapat" });

beforeEach(() => {
  useAuthStore.setState({
    me: { fullName: "Ayşe Yılmaz", permissions: ["FINANCE_VIEW", "BRANCH_VIEW"] } as never,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ZtoFinansLayout", () => {
  it("/zto-finans Cari Hareketler iskeletine yönlenir; ZTO sayfa başı kapsam kökünde", () => {
    renderAt("/zto-finans");
    expect(screen.getByTestId("where").textContent).toBe("/zto-finans/cari-hareketler");
    const title = screen.getByRole("heading", { level: 6, name: "Günlük Tüm Cari İşlemleri" });
    expect(title.closest(".zto-finans")).not.toBeNull();
    expect(title.closest(".container-fluid.bank-statement-page")).not.toBeNull();
    expect(title.closest(".card.mb-3.at-header-card > .card-header.bg-white")).not.toBeNull();
    expect(q(".erp-header-icon > i").className).toBe("fas fa-calendar-day");
    const crumbs = q(".erp-breadcrumb.d-none.d-md-block");
    expect(crumbs.textContent).toBe(" Cari Kartlar /  Günlük Cari İşlemleri");
    expect(crumbs.querySelectorAll("i.fas.fa-home, i.fas.fa-file-invoice-dollar")).toHaveLength(2);
    // Üst panel: başlık, şube/iş yeri, karşılama.
    expect(q(".at-top-panel .page-header-modern h6").textContent).toBe(" Finans Paneli");
    expect(q(".at-top-panel .page-subtitle").textContent).toContain("ödeme planlamalarını");
    expect(screen.getByText(/Tüm Şubeler/)).toBeTruthy();
    expect(screen.getByText(/Tüm İş Yerleri/)).toBeTruthy();
    expect(q(".welcome .welcome-content").textContent).toBe("Merhaba, Ayşe Yılmaz (Finans)");
    const info = screen.getByRole("status");
    expect(info.className).toBe("alert alert-info mb-0");
    expect(info.textContent).toContain("Bu ekran Faz 12.1 ile gelecek.");
  });

  it("ZTO yan menüsü: başlık, gruplar, etkin öğe, pasif öğeler", () => {
    renderAt("/zto-finans/cari-hareketler");
    const root = q(".zto-finans > .zto-finans-layout");
    expect(root.firstElementChild).toBe(sidebar());
    expect(root.lastElementChild?.className).toBe("zto-finans-content");
    expect(sidebar().className).toBe("zt-sidebar");
    expect(q(".zt-sidebar-header span").textContent).toBe("FİNANS İŞLEMLERİ");
    const groups = Array.from(
      document.querySelectorAll(".zt-sidebar-group-header span"),
      (s) => s.textContent,
    );
    expect(groups[0]).toBe("CARİ İŞLEMLERİ");
    expect(groups).not.toContain("EK İŞLEMLERİ");
    expect(document.querySelectorAll(".zt-sidebar-divider")).toHaveLength(groups.length - 1);

    const active = q<HTMLAnchorElement>("a.zt-active");
    expect(active.getAttribute("href")).toBe("/zto-finans/cari-hareketler");
    expect(active.getAttribute("aria-current")).toBe("page");
    expect(active.querySelector(".zt-icon > i.fas.fa-calendar-day")).not.toBeNull();
    expect(active.querySelector(".zt-label")?.textContent).toBe("Günlük Cari İşlemleri");

    const payments = screen.getByText("Ödemeler").closest("a") as HTMLAnchorElement;
    expect(payments.className).toBe("disabled");
    expect(payments.hasAttribute("href")).toBe(false);
    expect(payments.getAttribute("aria-disabled")).toBe("true");
    expect(payments.title).toBe("Bu ekran Faz 12.2a ile gelecek.");
    expect(payments.querySelector(".zt-phase")?.textContent).toBe("Faz 12.2a");
    const add = screen.getByText("Yeni Cari Kart").closest("a") as HTMLAnchorElement;
    expect(add.className).toBe("zt-action-add disabled");
    expect(screen.queryByText("Yatırımlar")).toBeNull();
  });

  it("ok tıklamayla açılır/kapanır; dışarı tıklama ve Escape kapatır; sayfa değişince kapanır", () => {
    renderAt("/zto-finans/cari-hareketler");
    expect(arrow().getAttribute("aria-expanded")).toBe("false");
    expect(q(".zt-sidebar-panel").getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(arrow());
    expect(sidebar().className).toBe("zt-sidebar open");
    expect(q(".zt-sidebar-panel").getAttribute("aria-hidden")).toBe("false");
    fireEvent.click(q(".zt-sidebar-header"));
    expect(sidebar().classList.contains("open")).toBe(true);
    fireEvent.click(document.body);
    expect(sidebar().classList.contains("open")).toBe(false);

    fireEvent.keyDown(arrow(), { key: "Enter" });
    expect(sidebar().classList.contains("open")).toBe(true);
    fireEvent.keyDown(q(".zt-sidebar-nav"), { key: "Escape" });
    expect(sidebar().classList.contains("open")).toBe(false);
    expect(document.activeElement).toBe(arrow());
    fireEvent.keyDown(arrow(), { key: " " });
    fireEvent.keyDown(arrow(), { key: "a" });
    expect(sidebar().classList.contains("open")).toBe(true);
    fireEvent.keyDown(arrow(), { key: "Escape" });
    fireEvent.keyDown(arrow(), { key: "Escape" });
    expect(sidebar().classList.contains("open")).toBe(false);

    fireEvent.click(arrow());
    fireEvent.click(q("a.zt-active"));
    expect(sidebar().classList.contains("open")).toBe(false);
  });

  it("fareyle üzerine gelince açılır, çıkınca gecikmeyle kapanır; dokunmatik olaylar yok sayılır", () => {
    vi.useFakeTimers();
    renderAt("/zto-finans/cari-hareketler");
    fireEvent.pointerEnter(sidebar(), { pointerType: "touch" });
    expect(sidebar().classList.contains("open")).toBe(false);
    fireEvent.pointerEnter(sidebar(), { pointerType: "mouse" });
    expect(sidebar().classList.contains("open")).toBe(true);
    fireEvent.pointerLeave(sidebar(), { pointerType: "touch" });
    fireEvent.pointerLeave(sidebar(), { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(SIDEBAR_LEAVE_DELAY_MS - 1));
    expect(sidebar().classList.contains("open")).toBe(true);
    // Geri gelirse kapanma iptal.
    fireEvent.pointerEnter(sidebar(), { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(SIDEBAR_LEAVE_DELAY_MS * 2));
    expect(sidebar().classList.contains("open")).toBe(true);
    fireEvent.pointerLeave(sidebar(), { pointerType: "mouse" });
    act(() => vi.advanceTimersByTime(SIDEBAR_LEAVE_DELAY_MS));
    expect(sidebar().classList.contains("open")).toBe(false);
  });

  it("geliştirmede vitrin öğesi bağlantıdır", () => {
    renderAt("/zto-finans/vitrin");
    // vitest import.meta.env.DEV = true
    const link = screen.getByText("Bileşen vitrini").closest("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/zto-finans/vitrin");
    expect(link.className).toBe("zt-active");
    expect(screen.getByText("GELİŞTİRME")).toBeTruthy();
  });

  it("sayfa yüklenemezse Bootstrap uyarısı gösterir", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    renderAt("/zto-finans/cari-hareketler", true);
    const alert = await screen.findByRole("alert");
    expect(alert.className).toContain("alert-danger");
    expect(alert.closest(".zto-finans")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Sayfayı yenile" }).className).toContain("btn");
    error.mockRestore();
  });

  it("TEMEL TANIMLAR bölümü 'GELİŞTİRME'den önce; BRANCH_VIEW yoksa gizli", () => {
    renderAt("/zto-finans/cari-hareketler");
    const groups = Array.from(
      document.querySelectorAll(".zt-sidebar-group-header span"),
      (s) => s.textContent,
    );
    expect(groups.slice(-2)).toEqual(["TEMEL TANIMLAR", "GELİŞTİRME"]);
    expect(document.querySelectorAll(".zt-sidebar-divider")).toHaveLength(groups.length - 1);
    const workPlaces = screen.getByText("İş Yerleri").closest("a") as HTMLAnchorElement;
    expect(workPlaces.getAttribute("href")).toBe("/zto-finans/tanimlar/is-yerleri");
    expect(workPlaces.querySelector(".zt-icon > i.fas.fa-building")).not.toBeNull();
    expect(screen.getByText("Şubeler").closest("a")?.getAttribute("href")).toBe(
      "/zto-finans/tanimlar/subeler",
    );
    expect(screen.getByText("Şirketler").closest("a")?.getAttribute("href")).toBe(
      "/zto-finans/tanimlar/sirketler",
    );
    cleanup();

    useAuthStore.setState({ me: { fullName: "A", permissions: ["FINANCE_VIEW"] } as never });
    renderAt("/zto-finans/cari-hareketler");
    expect(screen.queryByText("TEMEL TANIMLAR")).toBeNull();
    expect(screen.queryByText("İş Yerleri")).toBeNull();
  });

  it("sayfalar köke sınıf ekler (ZTO body sınıfı); alt yolda menü öğesi etkin kalır", () => {
    renderAt("/zto-finans/tanimlar/is-yerleri");
    const root = q(".zto-finans");
    expect(root.className).toBe("zto-finans sb-nav-fixed definition-list-page");
    // Derlenmiş ".definition-list-page x" kuralları için kök altında da bir ata.
    expect(q(".zto-finans > .zto-finans-layout").className).toBe(
      "zto-finans-layout definition-list-page",
    );
    expect(q("a.zt-active").getAttribute("href")).toBe("/zto-finans/tanimlar/is-yerleri");
    cleanup();

    renderAt("/zto-finans/tanimlar/is-yerleri/yeni");
    expect(q(".zto-finans").className).toBe("zto-finans sb-nav-fixed definition-form-page");
    expect(q("a.zt-active").getAttribute("href")).toBe("/zto-finans/tanimlar/is-yerleri");
    cleanup();

    renderAt("/zto-finans/cari-hareketler");
    expect(q(".zto-finans").className).toBe("zto-finans sb-nav-fixed");
    expect(q(".zto-finans-layout").className).toBe("zto-finans-layout");
  });

  it("kök sınıf listesi sayaçlıdır", () => {
    let list = addRootClass([], "a");
    list = addRootClass(list, "b");
    list = addRootClass(list, "a");
    expect(rootClassName(list)).toBe("a b");
    list = removeRootClass(list, "a");
    expect(rootClassName(list)).toBe("b a");
    expect(removeRootClass(list, "yok")).toEqual(list);
    expect(rootClassName(removeRootClass(removeRootClass(list, "a"), "b"))).toBeUndefined();
    expect(rootClassName([" ", ""])).toBeUndefined();
  });
});
