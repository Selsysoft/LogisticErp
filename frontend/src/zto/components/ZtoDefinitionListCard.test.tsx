// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import "../../i18n";
import { ZtoDefinitionListCard } from "./ZtoDefinitionListCard";

afterEach(cleanup);

const q = (selector: string) => document.querySelector(selector) as HTMLElement;

describe("ZtoDefinitionListCard (Şablon A)", () => {
  it("introduction-details.js decorateHeader sonrası DOM", () => {
    render(
      <MemoryRouter>
        <ZtoDefinitionListCard
          title="İş Yerleri Listesi"
          icon="fas fa-building"
          count={7}
          newHref="/yeni"
          notice={<p className="bildirim">b</p>}
          toolbar={<p className="arac">a</p>}
        >
          <table id="dataTable" />
        </ZtoDefinitionListCard>
      </MemoryRouter>,
    );
    const surface = q("div.row > div.col-xl-12 > section.card.custom-card.definition-list-surface");
    expect(surface).not.toBeNull();
    const header = q("section > header.card-header.custom-card-header.definition-list-header");
    const row = header.firstElementChild as HTMLElement;
    expect(row.style.display).toBe("flex");
    expect(row.style.justifyContent).toBe("space-between");
    const titleHost = q(".definition-list-title");
    expect(titleHost.style.alignItems).toBe("center");
    expect(titleHost.children[0].className).toBe("definition-list-title__icon");
    expect(titleHost.querySelector(".definition-list-title__icon > i")?.className).toBe(
      "fas fa-building",
    );
    const copy = titleHost.children[1];
    expect(copy.className).toBe("definition-list-title__copy");
    const h5 = copy.querySelector("h5") as HTMLElement;
    expect(h5.style.margin).toBe("0px");
    expect(h5.textContent).toBe("İş Yerleri Listesi 7");
    expect(h5.querySelector("i.fas.fa-list-ul")).not.toBeNull();
    const count = h5.querySelector(".definition-list-count") as HTMLElement;
    expect(count.textContent).toBe("7");
    expect(count.title).toBe("Toplam kayıt");
    expect(copy.querySelector("small")?.textContent).toBe(
      "Tanım kayıtlarını ve işlem geçmişini tek ekrandan yönetin.",
    );
    const add = row.querySelector("a.btn.btn-primary") as HTMLAnchorElement;
    expect(add.getAttribute("href")).toBe("/yeni");
    expect(add.textContent).toBe(" Yeni Kayıt");
    expect(add.querySelector("i.fas.fa-plus")).not.toBeNull();
    const body = q("section > div.card-body.definition-list-body");
    expect(Array.from(body.children, (c) => c.className)).toEqual([
      "bildirim",
      "arac",
      "table-responsive definition-list-table-wrap",
    ]);
    expect(q(".definition-list-table-wrap > table#dataTable")).not.toBeNull();
  });

  it("yetki yoksa Yeni Kayıt çizilmez", () => {
    render(
      <MemoryRouter>
        <ZtoDefinitionListCard title="Şube Listesi" icon="fas fa-city" count={0}>
          <span />
        </ZtoDefinitionListCard>
      </MemoryRouter>,
    );
    expect(document.querySelector("a.btn")).toBeNull();
    expect(q(".definition-list-count").textContent).toBe("0");
  });
});
