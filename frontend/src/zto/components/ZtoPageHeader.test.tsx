// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import "../../i18n";
import { ZtoPageHeader, ZtoPageHeaderProps } from "./ZtoPageHeader";

function renderHeader(props: Partial<ZtoPageHeaderProps>) {
  return render(
    <MemoryRouter>
      <div className="card">
        <ZtoPageHeader title="Ödeme Yönetimi" icon="fas fa-money-bill-wave" {...props} />
      </div>
    </MemoryRouter>,
  );
}

const q = (selector: string) => document.querySelector(selector) as HTMLElement;

afterEach(cleanup);

describe("ZtoPageHeader", () => {
  it("'page' varyantı: PROFESYONEL HEADER işaretlemesi (Payments.cshtml)", () => {
    renderHeader({
      breadcrumb: [
        { icon: "fas fa-chart-line", label: "Finans", to: "/zto-finans" },
        { label: "Ödemeler" },
      ],
      back: { to: "/zto-finans/cari-kartlar", title: "Cari Listesine Dön" },
      actions: <button className="erp-btn erp-btn-success">Yeni</button>,
      iconStyle: { color: "#fff" },
    });
    const header = q(".card > .card-header.bg-white.border-bottom");
    expect(header.style.padding).toBe("10px 20px");
    const back = screen.getByTitle("Cari Listesine Dön");
    expect(back.className).toBe("erp-btn erp-btn-secondary");
    expect(back.getAttribute("href")).toBe("/zto-finans/cari-kartlar");
    expect(back.querySelector("i.fas.fa-arrow-left")).not.toBeNull();
    expect(back.querySelector("span.d-none.d-md-inline")?.textContent).toBe("Geri");
    expect(q(".erp-header-icon").style.color).toBe("rgb(255, 255, 255)");
    const title = screen.getByRole("heading", { level: 6, name: "Ödeme Yönetimi" });
    expect(title.className).toBe("mb-0 text-dark");
    expect(title.parentElement?.className).toBe("ml-3");
    const crumbs = q(".erp-breadcrumb.mt-1");
    expect(crumbs.querySelector(".separator")?.textContent).toBe("›");
    expect(crumbs.querySelector("a")?.getAttribute("href")).toBe("/zto-finans");
    const current = crumbs.querySelector("[aria-current=page]") as HTMLElement;
    expect(current.className).toBe("text-primary font-weight-semibold");
    expect(current.textContent).toBe(" Ödemeler");
    expect(screen.getByRole("button", { name: "Yeni" })).toBeTruthy();
  });

  it("'page' varyantı breadcrumb ve düğmesiz; tek öğe vurgulanmaz", () => {
    renderHeader({ breadcrumb: [{ label: "Finans" }] });
    expect(q(".erp-breadcrumb span").className).toBe("");
    expect(document.querySelector(".erp-btn")).toBeNull();
    cleanup();
    renderHeader({});
    expect(document.querySelector(".erp-breadcrumb")).toBeNull();
  });

  it("'panel' varyantı: AllTransactions başlık kartı, '/' ayırıcı, geri düğmesi sağda", () => {
    renderHeader({
      variant: "panel",
      breadcrumb: [{ icon: "fas fa-home", label: "Cari Kartlar" }, { label: "Günlük" }],
      back: { to: "/x", label: "Cari Kartlar" },
      actions: <span>eylem</span>,
      children: <div className="atcs-wrap">arama</div>,
    });
    const header = q(".card-header.bg-white.py-2.px-3");
    expect(header.style.overflow).toBe("visible");
    expect(screen.getByRole("heading", { level: 6 }).className).toBe("mb-0 font-weight-bold");
    expect(q(".erp-breadcrumb").className).toBe("erp-breadcrumb d-none d-md-block");
    expect(q(".erp-breadcrumb .separator").textContent).toBe("/");
    expect(q(".atcs-wrap").textContent).toBe("arama");
    const back = q("a.erp-btn");
    expect(back.querySelector(".d-none.d-lg-inline")?.textContent).toBe("Cari Kartlar");
    expect(back.previousElementSibling?.textContent).toBe("eylem");
    cleanup();
    renderHeader({ variant: "panel" });
    expect(document.querySelector(".erp-breadcrumb")).toBeNull();
    expect(document.querySelector(".erp-btn")).toBeNull();
  });
});
