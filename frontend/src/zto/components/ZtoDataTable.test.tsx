// @vitest-environment jsdom
import { createColumnHelper } from "@tanstack/react-table";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { copyRowsAsTsv } from "../export/copy";
import { exportExcel } from "../export/excel";
import { exportPdf } from "../export/pdf";
import { printTable } from "../export/print";
import { ZtoFinansRoot } from "../ZtoFinansRoot";
import { ZTO_DOM, type DataTableState } from "./dataTableLogic";
import { ZtoDataTable } from "./ZtoDataTable";

vi.mock("../export/copy", () => ({ copyRowsAsTsv: vi.fn(() => Promise.resolve()) }));
vi.mock("../export/excel", () => ({ exportExcel: vi.fn(() => Promise.resolve()) }));
vi.mock("../export/pdf", () => ({ exportPdf: vi.fn(() => Promise.resolve()) }));
vi.mock("../export/print", () => ({ printTable: vi.fn(() => true) }));

interface Tx {
  id: number;
  name: string;
  amount: number;
  city: string;
}

const helper = createColumnHelper<Tx>();
const columns = [
  helper.accessor("id", { header: "No" }),
  helper.accessor("name", { header: "Cari" }),
  helper.accessor("amount", {
    header: "Tutar",
    meta: { className: "text-right" },
    cell: (c) => c.getValue().toFixed(2),
  }),
  helper.accessor("city", { header: "Şehir" }),
  helper.display({ id: "actions", header: () => <i className="fa fa-cog" />, cell: () => "…" }),
];

const CITIES = ["IĞDIR", "İzmir", "Çorum", "Adana", "Şırnak"];

function makeRows(n: number): Tx[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    name: `Cari ${String(i + 1).padStart(3, "0")}`,
    amount: (i + 1) * 10.5,
    city: CITIES[i % CITIES.length],
  }));
}

function bodyColumn(container: HTMLElement, index: number): string[] {
  return [...container.querySelectorAll("tbody tr")].map(
    (tr) => tr.children[index]?.textContent ?? "",
  );
}

function infoText(container: HTMLElement): string {
  return container.querySelector(".dataTables_info")?.textContent ?? "";
}

function pageLinks(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".dataTables_paginate li")].map(
    (li) =>
      `${li.textContent}${li.classList.contains("active") ? "*" : ""}${li.classList.contains("disabled") ? "-" : ""}`,
  );
}

/** Sayfalama bağlantısına tıklar (hücre metinleriyle karışmasın diye yalnız sayfalamada arar). */
function clickPage(container: HTMLElement, label: string) {
  const paginate = container.querySelector(".dataTables_paginate") as HTMLElement;
  fireEvent.click(within(paginate).getByText(label));
}

beforeEach(() => {
  vi.mocked(copyRowsAsTsv).mockClear();
  vi.mocked(exportExcel).mockClear();
  vi.mocked(exportPdf).mockClear();
  vi.mocked(printTable).mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ZtoDataTable işaretlemesi", () => {
  it("dataTables.bootstrap4 varsayılan düzeni ve sınıflar birebir", () => {
    const { container } = render(<ZtoDataTable id="dt" columns={columns} data={makeRows(25)} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.id).toBe("dt_wrapper");
    expect(wrapper.className).toBe("dataTables_wrapper dt-bootstrap4 no-footer");

    const rows = wrapper.querySelectorAll(":scope > div.row");
    expect(rows).toHaveLength(3);
    const length = rows[0].querySelector(":scope > div.col-sm-12.col-md-6 > div.dataTables_length");
    expect(length?.id).toBe("dt_length");
    const label = length!.querySelector("label")!;
    expect(label.textContent).toBe("Sayfada 102550100 kayıt göster");
    const select = label.querySelector("select")!;
    expect(select.className).toBe("custom-select custom-select-sm form-control form-control-sm");
    expect(select.getAttribute("name")).toBe("dt_length");
    expect(select.getAttribute("aria-controls")).toBe("dt");
    expect(select.value).toBe("10");

    const filter = rows[0].querySelector("div.col-sm-12.col-md-6 > div.dataTables_filter")!;
    expect(filter.id).toBe("dt_filter");
    expect(filter.querySelector("label")!.firstChild?.textContent).toBe("Ara:");
    const input = filter.querySelector("input")!;
    expect(input.type).toBe("search");
    expect(input.className).toBe("form-control form-control-sm");
    expect(input.getAttribute("aria-controls")).toBe("dt");

    const table = rows[1].querySelector(":scope > div.col-sm-12 > table")!;
    expect(table.id).toBe("dt");
    expect(table.className).toBe("table table-bordered dataTable no-footer");
    expect(table.getAttribute("role")).toBe("grid");
    expect(table.getAttribute("aria-describedby")).toBe("dt_info");
    expect(table.querySelector("thead tr")?.getAttribute("role")).toBe("row");

    const info = rows[2].querySelector("div.col-sm-12.col-md-5 > div.dataTables_info")!;
    expect(info.id).toBe("dt_info");
    expect(info.getAttribute("role")).toBe("status");
    expect(info.getAttribute("aria-live")).toBe("polite");
    expect(info.textContent).toBe("25 kayıttan 1 - 10 arasındaki kayıtlar gösteriliyor");

    const paginate = rows[2].querySelector("div.col-sm-12.col-md-7 > div.dataTables_paginate")!;
    expect(paginate.className).toBe("dataTables_paginate paging_simple_numbers");
    expect(paginate.id).toBe("dt_paginate");
    const items = paginate.querySelectorAll("ul.pagination > li");
    expect(items[0].className).toBe("paginate_button page-item previous disabled");
    expect(items[0].id).toBe("dt_previous");
    expect(items[1].className).toBe("paginate_button page-item active");
    expect(items[4].className).toBe("paginate_button page-item next");
    const link = items[4].querySelector("a")!;
    expect(link.className).toBe("page-link");
    expect(link.getAttribute("href")).toBe("#");
    expect(link.getAttribute("data-dt-idx")).toBe("4");
    expect(link.getAttribute("aria-controls")).toBe("dt");
    expect(link.tabIndex).toBe(0);
    expect(items[0].querySelector("a")!.tabIndex).toBe(-1);
    expect(pageLinks(container)).toEqual(["Önceki-", "1*", "2", "3", "Sonraki"]);
  });

  it("başlık hücreleri: sorting sınıfları, aria-sort, aria-label, sorting_1", () => {
    const { container } = render(<ZtoDataTable id="dt" columns={columns} data={makeRows(3)} />);
    const ths = container.querySelectorAll("thead th");
    expect(ths[0].className).toBe("sorting_asc");
    expect(ths[0].getAttribute("aria-sort")).toBe("ascending");
    expect(ths[0].getAttribute("aria-label")).toBe("No: azalan sütun sıralamasını aktifleştir");
    expect(ths[0].getAttribute("tabindex")).toBe("0");
    expect(ths[0].getAttribute("rowspan")).toBe("1");
    expect(ths[0].getAttribute("colspan")).toBe("1");
    expect(ths[1].className).toBe("sorting");
    expect(ths[1].getAttribute("aria-sort")).toBeNull();
    expect(ths[1].getAttribute("aria-label")).toBe("Cari: artan sütun sıralamasını aktifleştir");
    expect(ths[2].className).toBe("sorting text-right");
    expect(ths[4].className).toBe("sorting_disabled");
    expect(ths[4].getAttribute("aria-label")).toBe("actions");
    expect(ths[4].getAttribute("tabindex")).toBeNull();
    expect(ths[4].querySelector("i.fa.fa-cog")).not.toBeNull();

    const firstRow = container.querySelector("tbody tr")!;
    expect(firstRow.getAttribute("role")).toBe("row");
    expect(firstRow.className).toBe("odd");
    expect(container.querySelectorAll("tbody tr")[1].className).toBe("even");
    expect(firstRow.children[0].className).toBe("sorting_1");
    expect(firstRow.children[1].getAttribute("class")).toBeNull();
    expect(firstRow.children[2].className).toBe("text-right");
    expect(firstRow.children[2].textContent).toBe("10.50");
  });

  it("ZTO masraf düzeni: l / B / f satırda, Buttons 2.2.2 dt-button işaretlemesi", () => {
    const { container } = render(
      <ZtoDataTable
        id="dataTable2"
        columns={columns}
        data={makeRows(3)}
        dom={ZTO_DOM.lengthButtonsFilter}
        buttons={[
          {
            extend: "copy",
            className: "btn btn-grey rounded",
            text: (
              <>
                <i className="fa fa-copy" /> Kopyala
              </>
            ),
          },
          "excel",
          "pdf",
          "print",
        ]}
      />,
    );
    const row = container.querySelector(".dataTables_wrapper > div.row")!;
    expect(row.querySelector(":scope > .col-sm-2 > .dataTables_length")).not.toBeNull();
    expect(row.querySelector(":scope > .col-sm-6.text-right > .dataTables_filter")).not.toBeNull();
    const group = row.querySelector(":scope > .col-sm-4 > div.dt-buttons")!;
    expect(group.className).toBe("dt-buttons");
    const buttons = group.querySelectorAll("button");
    expect([...buttons].map((b) => b.className)).toEqual([
      "dt-button buttons-copy buttons-html5 btn btn-grey rounded",
      "dt-button buttons-excel buttons-html5",
      "dt-button buttons-pdf buttons-html5",
      "dt-button buttons-print",
    ]);
    expect(buttons[0].querySelector("span > i.fa.fa-copy")).not.toBeNull();
    expect(buttons[1].querySelector("span")?.textContent).toBe("Excel");
    expect(buttons[3].textContent).toBe("Yazdır");
    expect(buttons[0].getAttribute("aria-controls")).toBe("dataTable2");
    expect(buttons[0].getAttribute("type")).toBe("button");
    expect(buttons[0].getAttribute("tabindex")).toBe("0");
    // r t i p kapsayıcısız doğrudan sarmalayıcıda.
    const direct = [...container.querySelector(".dataTables_wrapper")!.children].map(
      (c) => c.tagName.toLowerCase() + "." + c.className.split(" ")[0],
    );
    expect(direct).toEqual([
      "div.row",
      "table.table",
      "div.dataTables_info",
      "div.dataTables_paginate",
    ]);
  });

  it("düğme varsa varsayılan Bfrtip; bootstrap4 düğme stili", () => {
    const { container } = render(
      <ZtoDataTable
        columns={columns}
        data={makeRows(3)}
        buttons={["copy"]}
        buttonsStyle="bootstrap4"
      />,
    );
    const wrapper = container.querySelector(".dataTables_wrapper")!;
    expect(wrapper.id).toMatch(/^ztoDataTable[\w-]+_wrapper$/);
    const first = wrapper.firstElementChild!;
    expect(first.className).toBe("dt-buttons btn-group flex-wrap");
    expect(first.querySelector("button")!.className).toBe(
      "btn btn-secondary buttons-copy buttons-html5",
    );
    expect(wrapper.children[1].className).toBe("dataTables_filter");
    // l yok (Bfrtip).
    expect(wrapper.querySelector(".dataTables_length")).toBeNull();
  });

  it("lfrtip; özellikler kapatılabilir; ikinci örnek kimlik almaz", () => {
    const { container, rerender } = render(
      <ZtoDataTable id="t" columns={columns} data={makeRows(3)} dom="lfrtipi" processing={false} />,
    );
    const infos = container.querySelectorAll(".dataTables_info");
    expect(infos).toHaveLength(2);
    expect(infos[0].id).toBe("t_info");
    expect(infos[1].id).toBe("");
    const proc = container.querySelector(".dataTables_processing") as HTMLElement;
    expect(proc.className).toBe("dataTables_processing card");
    expect(proc.style.display).toBe("none");
    expect(proc.textContent).toBe("İşleniyor...");

    rerender(
      <ZtoDataTable
        id="t"
        columns={columns}
        data={makeRows(3)}
        dom="lfrtip"
        searchable={false}
        info={false}
        paging={false}
        ordering={false}
      />,
    );
    expect(container.querySelector(".dataTables_length")).toBeNull();
    expect(container.querySelector(".dataTables_filter")).toBeNull();
    expect(container.querySelector(".dataTables_info")).toBeNull();
    expect(container.querySelector(".dataTables_paginate")).toBeNull();
    expect(container.querySelector(".dataTables_processing")).toBeNull();
    expect(container.querySelector("table")!.getAttribute("aria-describedby")).toBeNull();
    const th = container.querySelector("thead th")!;
    expect(th.getAttribute("class")).toBeNull();
    expect(th.getAttribute("aria-label")).toBeNull();
    expect(container.querySelector("tbody td")!.getAttribute("class")).toBeNull();
  });

  it("boş tablo, eşleşme yok, özel boş metin, yükleniyor", () => {
    const { container, rerender } = render(<ZtoDataTable columns={columns} data={[]} />);
    const empty = container.querySelector("tbody tr td.dataTables_empty")!;
    expect(empty.getAttribute("colspan")).toBe("5");
    expect(empty.getAttribute("valign")).toBe("top");
    expect(empty.parentElement!.className).toBe("odd");
    expect(empty.textContent).toBe("Tabloda veri bulunmuyor");
    expect(infoText(container)).toBe("Kayıt yok");
    expect(pageLinks(container)).toEqual(["Önceki-", "Sonraki-"]);

    rerender(<ZtoDataTable columns={columns} data={[]} emptyText="Hareket yok" />);
    expect(container.querySelector(".dataTables_empty")!.textContent).toBe("Hareket yok");

    rerender(<ZtoDataTable columns={columns} data={[]} processing />);
    expect(container.querySelector(".dataTables_empty")!.textContent).toBe("Yükleniyor...");

    rerender(<ZtoDataTable columns={columns} data={makeRows(3)} />);
    fireEvent.change(container.querySelector("input[type=search]")!, {
      target: { value: "yokböyle" },
    });
    expect(container.querySelector(".dataTables_empty")!.textContent).toBe(
      "Eşleşen kayıt bulunamadı",
    );
    expect(infoText(container)).toBe("Kayıt yok (3 kayıt içerisinden bulunan)");
  });
});

describe("ZtoDataTable davranışı", () => {
  it("sıralama: tık artan↔azalan, Enter tuşu, sayfa başa döner, Türkçe sıra", () => {
    const { container } = render(
      <ZtoDataTable
        id="dt"
        columns={columns}
        data={makeRows(25)}
        order={[{ id: "id", desc: false }]}
        lengthMenu={[10, -1]}
      />,
    );
    clickPage(container, "Sonraki");
    expect(infoText(container)).toContain("11 - 20");

    const cityTh = container.querySelectorAll("thead th")[3] as HTMLElement;
    fireEvent.click(cityTh);
    expect(cityTh.className).toBe("sorting_asc");
    expect(infoText(container)).toContain("1 - 10");
    expect(new Set(bodyColumn(container, 3).slice(0, 5))).toEqual(new Set(["Adana"]));
    expect(container.querySelectorAll("thead th")[0].className).toBe("sorting");
    expect(container.querySelector("tbody td:nth-child(4)")!.className).toBe("sorting_1");

    fireEvent.keyDown(cityTh, { key: "Enter" });
    expect(cityTh.className).toBe("sorting_desc");
    expect(cityTh.getAttribute("aria-sort")).toBe("descending");
    expect(cityTh.getAttribute("aria-label")).toBe("Şehir: artan sütun sıralamasını aktifleştir");
    expect(bodyColumn(container, 3)[0]).toBe("Şırnak");

    fireEvent.click(cityTh);
    expect(cityTh.className).toBe("sorting_asc");
    // Türkçe sıra: Adana < Çorum < IĞDIR < İzmir < Şırnak
    fireEvent.change(container.querySelector("select")!, { target: { value: "-1" } });
    const order = [...new Set(bodyColumn(container, 3))];
    expect(order).toEqual(["Adana", "Çorum", "IĞDIR", "İzmir", "Şırnak"]);

    fireEvent.keyDown(cityTh, { key: "a" });
    expect(cityTh.className).toBe("sorting_asc");
  });

  it("shift ile çoklu sıralama: sorting_1 / sorting_2", () => {
    const { container } = render(<ZtoDataTable columns={columns} data={makeRows(10)} />);
    const ths = container.querySelectorAll("thead th");
    fireEvent.click(ths[3]);
    fireEvent.click(ths[2], { shiftKey: true });
    fireEvent.click(ths[2], { shiftKey: true });
    const cells = container.querySelector("tbody tr")!.children;
    expect(cells[3].className).toBe("sorting_1");
    expect(cells[2].className).toBe("text-right sorting_2");
    expect(ths[2].className).toBe("sorting_desc text-right");
    expect(ths[2].getAttribute("aria-sort")).toBeNull();
    expect(bodyColumn(container, 3).slice(0, 2)).toEqual(["Adana", "Adana"]);
    expect(bodyColumn(container, 2).slice(0, 2)).toEqual(["94.50", "42.00"]);
  });

  it("sıralamasız (order=[]) ve sıralanamayan ilk sütun", () => {
    const { container, rerender } = render(
      <ZtoDataTable columns={columns} data={makeRows(3)} order={[]} />,
    );
    expect(container.querySelector("thead th")!.className).toBe("sorting");
    rerender(<ZtoDataTable columns={[columns[4], ...columns.slice(0, 4)]} data={makeRows(3)} />);
    expect(container.querySelector(".sorting_asc")).toBeNull();
  });

  it("arama: akıllı, Türkçe büyük/küçük harf, süzülünce bilgi ve sayfa başa", () => {
    const { container } = render(<ZtoDataTable columns={columns} data={makeRows(25)} />);
    clickPage(container, "3");
    expect(infoText(container)).toContain("21 - 25");
    const input = container.querySelector("input[type=search]")!;
    fireEvent.change(input, { target: { value: "ığdır" } });
    expect(infoText(container)).toBe(
      "5 kayıttan 1 - 5 arasındaki kayıtlar gösteriliyor (25 kayıt içerisinden bulunan)",
    );
    expect(new Set(bodyColumn(container, 3))).toEqual(new Set(["IĞDIR"]));
    fireEvent.change(input, { target: { value: "izmir 012" } });
    expect(bodyColumn(container, 1)).toEqual(["Cari 012"]);
    // Biçimli sayı ile arama (tr-TR) ve aranmayan sütun.
    fireEvent.change(input, { target: { value: "126" } });
    expect(bodyColumn(container, 1)).toEqual(["Cari 012"]);
  });

  it("searchable=false sütun ve searchValue / exportValue arama metni", () => {
    const cols = [
      helper.accessor("name", { header: "Cari", meta: { searchable: false } }),
      helper.accessor("city", {
        header: "Şehir",
        meta: { searchValue: (v: string) => `il:${v}` },
      }),
      helper.display({
        id: "tag",
        header: "Etiket",
        meta: { exportValue: (row: Tx) => `E-${row.id}` },
      }),
    ];
    const { container } = render(<ZtoDataTable columns={cols} data={makeRows(5)} />);
    const input = container.querySelector("input[type=search]")!;
    fireEvent.change(input, { target: { value: "Cari" } });
    expect(container.querySelector(".dataTables_empty")).not.toBeNull();
    fireEvent.change(input, { target: { value: "il:adana" } });
    expect(bodyColumn(container, 0)).toEqual(["Cari 004"]);
    fireEvent.change(input, { target: { value: "e-2" } });
    expect(bodyColumn(container, 0)).toEqual(["Cari 002"]);
  });

  it("görünen biçimle arama: N2 tutar (exportValue sayı) ve ISO tarih gg.aa.yyyy", () => {
    interface Row {
      id: number;
      date: string;
      amount: number;
    }
    const h = createColumnHelper<Row>();
    const cols = [
      h.accessor("id", { header: "No" }),
      h.accessor("date", { header: "Tarih" }),
      h.display({
        id: "amount",
        header: "Tutar",
        meta: { exportValue: (row: Row) => row.amount },
      }),
    ];
    const data: Row[] = [
      { id: 1, date: "2026-03-01", amount: 1250.5 },
      { id: 2, date: "2026-04-02", amount: 99 },
    ];
    const { container } = render(<ZtoDataTable columns={cols} data={data} />);
    const input = container.querySelector("input[type=search]")!;
    fireEvent.change(input, { target: { value: "1.250,50" } });
    expect(bodyColumn(container, 0)).toEqual(["1"]);
    fireEvent.change(input, { target: { value: "01.03.2026" } });
    expect(bodyColumn(container, 0)).toEqual(["1"]);
    fireEvent.change(input, { target: { value: "99,00" } });
    expect(bodyColumn(container, 0)).toEqual(["2"]);
  });

  it("sayfa uzunluğu, lengthMenu 'Tümü', pageLength -1, full_numbers ve üç nokta", () => {
    const { container } = render(
      <ZtoDataTable
        columns={columns}
        data={makeRows(120)}
        pageLength={10}
        lengthMenu={[10, 25, 50, 100, -1]}
        pagingType="full_numbers"
      />,
    );
    const options = [...container.querySelectorAll("select option")].map((o) => o.textContent);
    expect(options).toEqual(["10", "25", "50", "100", "Tümü"]);
    expect(pageLinks(container)).toEqual([
      "İlk-",
      "Önceki-",
      "1*",
      "2",
      "3",
      "4",
      "5",
      "…-",
      "12",
      "Sonraki",
      "Son",
    ]);
    clickPage(container, "5");
    expect(pageLinks(container).slice(2, 9)).toEqual(["1", "…-", "4", "5*", "6", "…-", "12"]);
    clickPage(container, "Son");
    expect(infoText(container)).toContain("111 - 120");
    // Etkin ve devre dışı düğmeler bir şey yapmaz.
    clickPage(container, "Sonraki");
    clickPage(container, "12");
    expect(infoText(container)).toContain("111 - 120");
    clickPage(container, "İlk");
    expect(infoText(container)).toContain("1 - 10");

    clickPage(container, "3");
    fireEvent.change(container.querySelector("select")!, { target: { value: "25" } });
    expect(infoText(container)).toContain("1 - 25");
    fireEvent.change(container.querySelector("select")!, { target: { value: "-1" } });
    expect(container.querySelectorAll("tbody tr")).toHaveLength(120);
    expect(pageLinks(container)).toEqual(["İlk-", "Önceki-", "1*", "Sonraki-", "Son-"]);
    clickPage(container, "1");

    cleanup();
    const fresh = render(
      <ZtoDataTable columns={columns} data={makeRows(30)} pageLength={-1} lengthMenu={[10, -1]} />,
    );
    expect(fresh.container.querySelectorAll("tbody tr")).toHaveLength(30);
    expect(fresh.container.querySelector("select")!.value).toBe("-1");
    expect(infoText(fresh.container)).toBe("30 kayıttan 1 - 30 arasındaki kayıtlar gösteriliyor");
  });

  it("veri azalınca son sayfaya çekilir; rowClassName, onRowClick, getRowId", () => {
    const onRowClick = vi.fn();
    const props = {
      columns,
      pageLength: 10,
      rowClassName: (row: Tx) => (row.amount > 100 ? "table-danger" : undefined),
      onRowClick,
      getRowId: (row: Tx) => `tx-${row.id}`,
    };
    const { container, rerender } = render(<ZtoDataTable {...props} data={makeRows(25)} />);
    clickPage(container, "3");
    rerender(<ZtoDataTable {...props} data={makeRows(15)} />);
    expect(infoText(container)).toBe("15 kayıttan 11 - 15 arasındaki kayıtlar gösteriliyor");
    const tr = container.querySelector("tbody tr")!;
    expect(tr.className).toBe("odd table-danger");
    fireEvent.click(tr);
    expect(onRowClick).toHaveBeenCalledWith(expect.objectContaining({ id: 11 }), expect.anything());
  });

  it("tfoot: sütun footer tanımları ya da footer prop; no-footer kalkar", () => {
    const withFooter = [
      helper.accessor("name", { header: "Cari", footer: "Toplam" }),
      helper.accessor("amount", {
        header: "Tutar",
        footer: () => "31,50",
        meta: { className: "text-right" },
      }),
    ];
    const { container, rerender } = render(
      <ZtoDataTable columns={withFooter} data={makeRows(3)} />,
    );
    expect(container.querySelector(".dataTables_wrapper")!.className).toBe(
      "dataTables_wrapper dt-bootstrap4",
    );
    expect(container.querySelector("table")!.className).toBe("table table-bordered dataTable");
    const ths = container.querySelectorAll("tfoot th");
    expect([...ths].map((th) => th.textContent)).toEqual(["Toplam", "31,50"]);
    expect(ths[1].className).toBe("text-right");

    rerender(
      <ZtoDataTable
        columns={columns}
        data={makeRows(3)}
        className="mt-2"
        tableClassName="table table-hover"
        tableStyle={{ fontSize: 11 }}
        footer={
          <tr>
            <th colSpan={5}>Özel</th>
          </tr>
        }
      />,
    );
    expect(container.querySelector("tfoot th")!.textContent).toBe("Özel");
    expect(container.querySelector(".dataTables_wrapper")!.className).toContain("mt-2");
    expect((container.querySelector("table") as HTMLElement).style.fontSize).toBe("11px");
    expect(container.querySelector("table")!.className).toBe("table table-hover dataTable");
  });

  it("gruplu başlık: üst satır sıralanmaz, yaprak sıralanır", () => {
    const grouped = [
      helper.group({
        id: "g",
        header: "Cari Bilgisi",
        columns: [
          helper.accessor("id", { header: "No" }),
          helper.accessor("name", { header: "Ad" }),
        ],
      }),
    ];
    const { container } = render(<ZtoDataTable columns={grouped} data={makeRows(2)} />);
    const headRows = container.querySelectorAll("thead tr");
    expect(headRows).toHaveLength(2);
    const top = headRows[0].querySelector("th")!;
    expect(top.getAttribute("colspan")).toBe("2");
    expect(top.getAttribute("class")).toBeNull();
    expect(headRows[1].querySelector("th")!.className).toBe("sorting_asc");
  });
});

describe("ZtoDataTable dışa aktarım", () => {
  const exportColumns = [
    helper.accessor("name", { header: "Cari" }),
    helper.accessor("amount", { header: "Tutar", meta: { exportHeader: "Tutar (TL)" } }),
    helper.accessor("city", { header: "Şehir", meta: { exportable: false } }),
    helper.display({
      id: "tag",
      header: "Etiket",
      meta: { exportValue: (row: Tx) => `E-${row.id}` },
    }),
    helper.display({ id: "actions", header: "İşlem", cell: () => "x" }),
  ];

  it("kopyala: süzülmüş tüm satırlar (sayfa değil), son sütun hariç; bilgi kutusu kökte", async () => {
    vi.useFakeTimers();
    render(
      <ZtoFinansRoot>
        <ZtoDataTable
          columns={exportColumns}
          data={makeRows(25)}
          buttons={["copy"]}
          exportTitle="Cari Listesi"
          exportExcludeLastColumn
          pageLength={10}
        />
      </ZtoFinansRoot>,
    );
    const root = document.querySelector(".zto-finans")!;
    fireEvent.change(root.querySelector("input[type=search]")!, { target: { value: "ığdır" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kopyala" }));
    });
    expect(copyRowsAsTsv).toHaveBeenCalledTimes(1);
    const [headers, rows, opts] = vi.mocked(copyRowsAsTsv).mock.calls[0];
    expect(headers).toEqual(["Cari", "Tutar (TL)", "Etiket"]);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual(["Cari 001", 10.5, "E-1"]);
    expect(opts).toEqual({ title: "Cari Listesi" });

    const infoBox = root.querySelector(":scope > .dt-button-info")!;
    expect(infoBox.querySelector("h2")!.textContent).toBe("Panoya kopyala");
    expect(infoBox.querySelector("div")!.textContent).toBe("5 satır panoya kopyalandı");
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(root.querySelector(".dt-button-info")).toBeNull();
  });

  it("Excel / PDF / Yazdır: başlık, dosya adı, yön; düğme başlığı önceliği", async () => {
    render(
      <ZtoDataTable
        columns={exportColumns}
        data={makeRows(2)}
        buttons={["excel", { extend: "pdf", title: "Özel PDF" }, "print"]}
        exportTitle="Liste"
        fileName="liste"
        pdfOrientation="landscape"
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    });
    expect(exportExcel).toHaveBeenCalledWith({
      title: "Liste",
      headers: ["Cari", "Tutar (TL)", "Etiket", "İşlem"],
      rows: [
        ["Cari 001", 10.5, "E-1", ""],
        ["Cari 002", 21, "E-2", ""],
      ],
      fileName: "liste",
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    });
    expect(vi.mocked(exportPdf).mock.calls[0][0]).toMatchObject({
      title: "Özel PDF",
      fileName: "liste",
      orientation: "landscape",
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Yazdır" }));
    });
    expect(vi.mocked(printTable).mock.calls[0][0]).toMatchObject({ title: "Liste" });
  });

  it("yazdırma penceresi engellenince ve dışa aktarım hata verince uyarı; tık kapatır", async () => {
    vi.mocked(printTable).mockReturnValueOnce(false);
    vi.mocked(exportExcel).mockRejectedValueOnce(new Error("x"));
    vi.mocked(copyRowsAsTsv).mockRejectedValueOnce(new Error("x"));
    const { container } = render(
      <ZtoDataTable columns={columns} data={makeRows(2)} buttons={["copy", "excel", "print"]} />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Yazdır" }));
    });
    let box = container.querySelector(".dt-button-info")!;
    expect(box.textContent).toContain("Yazdırma penceresi açılamadı");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    });
    box = container.querySelector(".dt-button-info")!;
    expect(within(box as HTMLElement).getByText("Dosya oluşturulamadı.")).toBeTruthy();
    expect(box.querySelector("h2")!.textContent).toBe("Excel");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kopyala" }));
    });
    box = container.querySelector(".dt-button-info")!;
    expect(box.textContent).toBe("Panoya kopyalaPanoya kopyalanamadı.");
    fireEvent.click(box);
    expect(container.querySelector(".dt-button-info")).toBeNull();
  });

  it("dışa aktarım sürerken düğmeler kilitli, çalışan düğmede processing", async () => {
    let finish: () => void = () => undefined;
    vi.mocked(exportExcel).mockImplementationOnce(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    render(<ZtoDataTable columns={columns} data={makeRows(2)} buttons={["excel", "pdf"]} />);
    const excel = screen.getByRole("button", { name: "Excel" });
    await act(async () => {
      fireEvent.click(excel);
    });
    expect(excel.className).toContain("processing");
    expect((screen.getByRole("button", { name: "PDF" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => finish());
    expect(excel.className).not.toContain("processing");
  });
});

describe("ZtoDataTable sunucu taraflı", () => {
  it("onStateChange: ilk çizim, sayfa, sıralama, gecikmeli arama; bilgi recordsTotal/Filtered", () => {
    vi.useFakeTimers();
    const states: DataTableState[] = [];
    const { container, rerender } = render(
      <ZtoDataTable
        columns={columns}
        data={makeRows(10)}
        manualPagination
        recordsTotal={1250}
        onStateChange={(s) => states.push(s)}
      />,
    );
    expect(states.at(-1)).toEqual({
      start: 0,
      length: 10,
      search: "",
      sorting: [{ id: "id", desc: false }],
    });
    expect(infoText(container)).toBe("1.250 kayıttan 1 - 10 arasındaki kayıtlar gösteriliyor");
    expect(pageLinks(container).at(-2)).toBe("125");

    clickPage(container, "Sonraki");
    expect(states.at(-1)!.start).toBe(10);
    // Sunucu verisi sıralanmaz/süzülmez; geldiği gibi çizilir.
    rerender(
      <ZtoDataTable
        columns={columns}
        data={makeRows(10).reverse()}
        manualPagination
        recordsTotal={1250}
        onStateChange={(s) => states.push(s)}
      />,
    );
    expect(bodyColumn(container, 0)[0]).toBe("10");

    fireEvent.click(container.querySelectorAll("thead th")[1]);
    expect(states.at(-1)).toMatchObject({ start: 0, sorting: [{ id: "name", desc: false }] });

    const count = states.length;
    fireEvent.change(container.querySelector("input[type=search]")!, { target: { value: "ali" } });
    expect(states.length).toBe(count);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(states.at(-1)).toMatchObject({ search: "ali", start: 0 });

    rerender(
      <ZtoDataTable
        columns={columns}
        data={makeRows(3)}
        manualPagination
        recordsTotal={1250}
        recordsFiltered={3}
        onStateChange={(s) => states.push(s)}
      />,
    );
    expect(infoText(container)).toBe(
      "3 kayıttan 1 - 3 arasındaki kayıtlar gösteriliyor (1.250 kayıt içerisinden bulunan)",
    );
  });

  it("recordsTotal verilmezse veri uzunluğu; özel searchDelay", () => {
    vi.useFakeTimers();
    const onStateChange = vi.fn();
    const { container } = render(
      <ZtoDataTable
        columns={columns}
        data={makeRows(4)}
        manualPagination
        searchDelay={100}
        onStateChange={onStateChange}
      />,
    );
    expect(infoText(container)).toBe("4 kayıttan 1 - 4 arasındaki kayıtlar gösteriliyor");
    fireEvent.change(container.querySelector("input[type=search]")!, { target: { value: "x" } });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onStateChange).toHaveBeenLastCalledWith(expect.objectContaining({ search: "x" }));
  });
});

describe("ZtoDataTable tanım listesi seçenekleri (12.1a)", () => {
  it("searchPlaceholder arama kutusunun placeholder ve aria-label'ı; lengthAriaLabel", () => {
    const { container } = render(
      <ZtoDataTable
        columns={columns}
        data={makeRows(3)}
        searchPlaceholder="Listede ara..."
        lengthAriaLabel="Sayfadaki kayıt sayısı"
      />,
    );
    const search = container.querySelector(".dataTables_filter input") as HTMLInputElement;
    expect(search.placeholder).toBe("Listede ara...");
    expect(search.getAttribute("aria-label")).toBe("Listede ara...");
    const length = container.querySelector(".dataTables_length select") as HTMLSelectElement;
    expect(length.getAttribute("aria-label")).toBe("Sayfadaki kayıt sayısı");
  });

  it("varsayılanlar bugünkü gibi: boş placeholder, aria-label ve data-label yok", () => {
    const { container } = render(<ZtoDataTable columns={columns} data={makeRows(2)} />);
    const search = container.querySelector(".dataTables_filter input") as HTMLInputElement;
    expect(search.placeholder).toBe("");
    expect(search.hasAttribute("aria-label")).toBe(false);
    expect(container.querySelector(".dataTables_length select")?.hasAttribute("aria-label")).toBe(
      false,
    );
    expect(container.querySelector("td[data-label]")).toBeNull();
  });

  it("cellDataLabel: her gövde td'si başlık metnini taşır (JSX başlıkta exportHeader, yoksa id)", () => {
    const labelled = [
      ...columns.slice(0, 4),
      helper.display({
        id: "islem",
        header: () => <i className="fa fa-cog" />,
        meta: { exportHeader: "İşlemler" },
        cell: () => "…",
      }),
      helper.display({ id: "kimlik", header: () => <b>x</b>, cell: () => "-" }),
    ];
    const { container } = render(
      <ZtoDataTable
        columns={labelled}
        data={makeRows(2)}
        cellDataLabel
        tableDataAttributes={{ "data-definition-density": "grouped" }}
      />,
    );
    const firstRow = container.querySelector("tbody tr") as HTMLTableRowElement;
    expect(Array.from(firstRow.cells, (td) => td.getAttribute("data-label"))).toEqual([
      "No",
      "Cari",
      "Tutar",
      "Şehir",
      "İşlemler",
      "kimlik",
    ]);
    expect(container.querySelector("table")?.getAttribute("data-definition-density")).toBe(
      "grouped",
    );
  });

  it("meta.cellClassName yalnız td'ye; meta.className th ve td'ye", () => {
    const withCell = [
      helper.accessor("name", {
        header: "Cari",
        meta: { className: "ortak", cellClassName: "yalniz-td", headerClassName: "yalniz-th" },
      }),
    ];
    const { container } = render(<ZtoDataTable columns={withCell} data={makeRows(1)} />);
    const th = container.querySelector("thead th") as HTMLElement;
    const td = container.querySelector("tbody td") as HTMLElement;
    expect(th.classList.contains("ortak")).toBe(true);
    expect(th.classList.contains("yalniz-th")).toBe(true);
    expect(th.classList.contains("yalniz-td")).toBe(false);
    expect(td.classList.contains("ortak")).toBe(true);
    expect(td.classList.contains("yalniz-td")).toBe(true);
    expect(td.classList.contains("yalniz-th")).toBe(false);
  });
});

describe("ZtoDataTable 12.1 eklemeleri", () => {
  it("language: uzunluk, arama, bilgi ve boş tablo metinleri sayfanınki", () => {
    const language = {
      lengthMenu: "Göster _MENU_ kayıt",
      info: "_TOTAL_ kayıttan _START_ - _END_ arası gösteriliyor",
      infoEmpty: "0 kayıt gösteriliyor",
      infoFiltered: "(_MAX_ kayıt içinden filtrelendi)",
      search: "Ara:",
      emptyTable: "Tabloda veri bulunmuyor",
      zeroRecords: "Eşleşen yok",
    };
    const { container, rerender } = render(
      <ZtoFinansRoot>
        <ZtoDataTable columns={columns} data={makeRows(30)} pageLength={25} language={language} />
      </ZtoFinansRoot>,
    );
    const label = container.querySelector(".dataTables_length label") as HTMLElement;
    expect(label.textContent).toBe("Göster 102550100 kayıt");
    expect(infoText(container)).toBe("30 kayıttan 1 - 25 arası gösteriliyor");
    fireEvent.change(container.querySelector(".dataTables_filter input") as HTMLInputElement, {
      target: { value: "Cari 001" },
    });
    expect(infoText(container)).toBe(
      "1 kayıttan 1 - 1 arası gösteriliyor (30 kayıt içinden filtrelendi)",
    );
    fireEvent.change(container.querySelector(".dataTables_filter input") as HTMLInputElement, {
      target: { value: "yokyok" },
    });
    expect(container.querySelector(".dataTables_empty")?.textContent).toBe("Eşleşen yok");
    rerender(
      <ZtoFinansRoot>
        <ZtoDataTable columns={columns} data={[]} language={language} />
      </ZtoFinansRoot>,
    );
    expect(container.querySelector(".dataTables_empty")?.textContent).toBe(
      "Tabloda veri bulunmuyor",
    );
    expect(infoText(container)).toBe("0 kayıt gösteriliyor");
  });

  it("domSlots: içerik eşleşen dom kabına yazılır", () => {
    const { container } = render(
      <ZtoFinansRoot>
        <ZtoDataTable
          columns={columns}
          data={makeRows(3)}
          dom={
            '<"row align-items-center mb-2"<"col-12 col-md dt-length-col"l><"col-12 col-md-auto dt-filter-center"f><"col d-none d-md-block dt-toggle-col text-right">>rt<"row"<"col-sm-12 col-md-5"i><"col-sm-12 col-md-7"p>>'
          }
          domSlots={{ "dt-toggle-col": <div id="totalsModeToggle">mod</div> }}
        />
      </ZtoFinansRoot>,
    );
    const slot = container.querySelector(".dt-toggle-col") as HTMLElement;
    expect(slot.className).toBe("col d-none d-md-block dt-toggle-col text-right");
    expect(slot.querySelector("#totalsModeToggle")?.textContent).toBe("mod");
    expect(container.querySelectorAll("#totalsModeToggle")).toHaveLength(1);
  });

  it("pageDecorator: süs satırları sayılmaz, sayfa değişince yeniden hesaplanır", () => {
    const decorator = vi.fn((rows: Tx[], ctx: { columnsCount: number }) =>
      rows
        .filter((row) => row.id % 4 === 0)
        .map((row) => ({
          beforeIndex: rows.indexOf(row),
          key: `s${row.id}`,
          node: (
            <tr className="season-marker">
              <td colSpan={ctx.columnsCount}>Sezon {row.id}</td>
            </tr>
          ),
        })),
    );
    const { container } = render(
      <ZtoFinansRoot>
        <ZtoDataTable
          columns={columns}
          data={makeRows(12)}
          pageLength={10}
          order={[{ id: "id", desc: false }]}
          pageDecorator={decorator}
        />
      </ZtoFinansRoot>,
    );
    const markers = () =>
      [...container.querySelectorAll("tbody tr.season-marker")].map((tr) => tr.textContent);
    expect(markers()).toEqual(["Sezon 4", "Sezon 8"]);
    const marker = container.querySelector("tbody tr.season-marker td") as HTMLTableCellElement;
    expect(marker.colSpan).toBe(5);
    expect(container.querySelector("tbody tr.season-marker + tr")?.children[0].textContent).toBe(
      "4",
    );
    expect(container.querySelectorAll("tbody tr:not(.season-marker)")).toHaveLength(10);
    expect(infoText(container)).toContain("12 kayıttan 1 - 10");
    expect(decorator.mock.lastCall?.[0]).toHaveLength(10);
    fireEvent.click(screen.getByText("Sonraki"));
    expect(markers()).toEqual(["Sezon 12"]);
    expect(decorator.mock.lastCall?.[0].map((row: Tx) => row.id)).toEqual([11, 12]);
  });
});
