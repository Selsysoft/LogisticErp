// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { ZtoFinansRoot } from "../ZtoFinansRoot";
import {
  ZtoDefinitionDetailsModal,
  ZtoDefinitionDetailsModalProps,
} from "./ZtoDefinitionDetailsModal";

afterEach(cleanup);

const audit = {
  createdBy: "ayse@acme.com",
  createdAt: "2026-03-04T08:05:00",
  updatedBy: "ayse@acme.com",
  updatedAt: "2026-03-04T08:05:00",
  updateCount: 0,
};

function renderModal(props: Partial<ZtoDefinitionDetailsModalProps> = {}) {
  const onHide = vi.fn();
  render(
    <ZtoFinansRoot>
      <ZtoDefinitionDetailsModal
        show
        onHide={onHide}
        entityKey="workplace"
        entityTitle="İş Yeri"
        recordTitle="Merkez"
        recordId="IY-0001"
        status="Aktif"
        fields={[
          { label: "Adı", value: "Merkez" },
          { label: "Telefon", value: null },
          { label: "Durum", value: "Aktif" },
        ]}
        audit={audit}
        {...props}
      />
    </ZtoFinansRoot>,
  );
  return onHide;
}

const q = (selector: string) => document.querySelector(selector) as HTMLElement;

describe("ZtoDefinitionDetailsModal (Şablon C)", () => {
  it("_DefinitionDetailsModal çerçevesi: lg, ortalı, KAYIT DETAYI + varlık adı başlıkta", () => {
    const onHide = renderModal();
    expect(q(".modal").className).toContain("definition-details-modal");
    expect(q(".modal-dialog").className).toContain("modal-lg");
    expect(q(".modal-dialog").className).toContain("modal-dialog-centered");
    const header = q(".modal-header > div");
    expect(header.querySelector(".definition-details-modal__eyebrow")?.textContent).toBe(
      "KAYIT DETAYI",
    );
    expect(header.querySelector("h5.modal-title")?.textContent).toBe("İş Yeri");
    fireEvent.click(screen.getByRole("button", { name: "Kapat" }));
    expect(onHide).toHaveBeenCalled();
  });

  it("gövde _Details.cshtml birebir; workplace mavi vurgu; alan simgeleri; Son Erişen yok", () => {
    renderModal();
    const root = q(".modal-body > .definition-details");
    expect(root.className).toBe("definition-details definition-details--vivid dd-accent-blue");
    expect(root.getAttribute("data-definition-modal-title")).toBe("İş Yeri");
    const hero = q(".definition-details__hero.definition-details__hero--vivid");
    expect(hero.querySelector(".definition-details__hero-icon > i")?.className).toBe(
      "fas fa-building",
    );
    expect(hero.querySelector(".definition-details__hero-content > small")?.textContent).toBe(
      "İş Yeri",
    );
    expect(hero.querySelector("h4")?.textContent).toBe("Merkez");
    expect(hero.querySelector(".definition-details__status")?.textContent).toBe("Aktif");
    expect(hero.querySelector(".definition-details__record-number")?.textContent).toBe(
      "Kayıt No #IY-0001",
    );
    const fields = Array.from(document.querySelectorAll(".definition-details__field--icon"));
    expect(
      fields.map((f) => [
        f.querySelector(".definition-details__field-icon i")?.className,
        f.querySelector(".definition-details__field-content span")?.textContent,
        f.querySelector(".definition-details__field-content strong")?.textContent,
      ]),
    ).toEqual([
      ["fas fa-tag", "Adı", "Merkez"],
      ["fas fa-phone-alt", "Telefon", "-"],
      ["fas fa-check-circle", "Durum", "Aktif"],
    ]);
    const cards = Array.from(document.querySelectorAll(".definition-audit-card"));
    expect(cards.map((c) => c.className)).toEqual([
      "definition-audit-card definition-audit-card--created",
      "definition-audit-card definition-audit-card--updated",
    ]);
    expect(cards[0].querySelector("strong")?.textContent).toBe("ayse@acme.com");
    expect(cards[0].querySelector("time")?.textContent).toBe("04.03.2026 08:05");
    expect(cards[1].querySelector("strong")?.textContent).toBe("-");
    expect(cards[1].querySelector("time")?.textContent).toBe("Henüz güncellenmedi");
    expect(cards[1].querySelector("b")?.textContent).toBe("0");
    expect(cards[1].querySelector("b")?.getAttribute("title")).toBe("Güncelleme sayısı");
    expect(screen.queryByText("Son Erişen")).toBeNull();
    expect(screen.getByText("Kayıt ve Erişim Bilgileri")).toBeTruthy();
  });

  it("güncellenmiş kayıt; şirket indigo; durum yoksa rozet yok", () => {
    renderModal({
      entityKey: "company",
      entityTitle: "Şirket",
      status: undefined,
      audit: {
        ...audit,
        updatedBy: "ali@acme.com",
        updatedAt: "2026-05-06T10:11:00",
        updateCount: 3,
      },
    });
    expect(q(".definition-details").className).toContain("dd-accent-indigo");
    expect(q(".definition-details__hero-icon > i").className).toBe("fas fa-landmark");
    expect(document.querySelector(".definition-details__hero-meta")).toBeNull();
    const updated = q(".definition-audit-card--updated");
    expect(updated.querySelector("strong")?.textContent).toBe("ali@acme.com");
    expect(updated.querySelector("time")?.textContent).toBe("06.05.2026 10:11");
    expect(updated.querySelector("b")?.textContent).toBe("3");
  });

  it("içerik yokken 'Tanım Bilgileri' ve hazırlanıyor göstergesi; branch mavi", () => {
    renderModal({ audit: null });
    expect(q("h5.modal-title").textContent).toBe("Tanım Bilgileri");
    expect(q(".definition-details-loading").textContent).toBe("Kayıt bilgileri hazırlanıyor…");
    cleanup();
    renderModal({ entityKey: "branch" });
    expect(q(".definition-details").className).toContain("dd-accent-blue");
    expect(q(".definition-details__hero-icon > i").className).toBe("fas fa-city");
  });
});

describe("ZtoDefinitionDetailsModal cari kart ve geçmiş (12.1)", () => {
  const fields = [
    { label: "Cari Adı", value: "Acar Lojistik" },
    { label: "Cari Kodu", value: "MUS-0001" },
    { label: "Cari Grubu", value: "Müşteri" },
    { label: "Vergi No", value: "1234567890" },
    { label: "Telefon", value: null },
    { label: "Durum", value: "Aktif" },
  ];

  it("customer-account: ZTO cari görünümü, başlık 'Cari Hesap Detayı', hero meta", () => {
    renderModal({
      entityKey: "customer-account",
      entityTitle: "Cari Kart",
      recordTitle: "Acar Lojistik",
      recordId: "MUS-0001",
      fields,
    });
    expect(q(".modal-title").textContent).toBe("Cari Hesap Detayı");
    const root = q(".definition-details");
    expect(root.className).toBe("definition-details definition-details--customer-account");
    expect(root.dataset.definitionModalTitle).toBe("Cari Hesap Detayı");
    const hero = q(".definition-details__hero");
    expect(hero.className).toBe(
      "definition-details__hero definition-details__hero--customer-account",
    );
    expect(hero.querySelector(".definition-details__hero-icon i")?.className).toBe(
      "fas fa-file-invoice-dollar",
    );
    expect(hero.querySelector("small")?.textContent).toBe("Cari Yönetimi");
    const meta = Array.from(
      hero.querySelectorAll(".definition-details__hero-meta > span"),
      (s) => s.textContent,
    );
    expect(meta).toEqual(["MUS-0001", "Müşteri", "Aktif"]);
    expect(document.querySelector(".definition-details__section--history")).toBeNull();
  });

  it("geçmiş bölümü: satırlar ve boş durum", () => {
    renderModal({
      entityKey: "customer-account",
      fields,
      history: [
        { at: "2026-11-01T08:00:00Z", actor: "ayse@acme.com", event: "Oluşturuldu", details: null },
      ],
    });
    const section = q(".definition-details__section--history");
    expect(section.querySelector(".definition-details__section-title span")?.textContent).toBe(
      "Düzenleme Geçmişi",
    );
    const items = section.querySelectorAll("li.definition-history__item");
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain("ayse@acme.com");
    expect(items[0].textContent).toContain("Oluşturuldu");
    cleanup();
    renderModal({ history: [] });
    expect(screen.getByText("Henüz değişiklik kaydı yok.")).toBeTruthy();
  });
});
