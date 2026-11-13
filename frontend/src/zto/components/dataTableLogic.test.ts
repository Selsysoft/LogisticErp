import { describe, expect, it } from "vitest";
import {
  BOOTSTRAP4_DOM,
  ZTO_DOM,
  clampStart,
  columnDefId,
  compareValues,
  defaultOrder,
  formatCount,
  headerText,
  infoParts,
  infoText,
  matchesSearch,
  pageButtonViews,
  pageInfo,
  pageRequestQuery,
  pagingButtons,
  pagingNumbers,
  parseDom,
  pickExportColumns,
  rowSearchText,
  smartSearchTerms,
  startAfterLengthChange,
  toPageRequest,
  searchFold,
  searchTextOf,
  valueText,
  type DomNode,
} from "./dataTableLogic";

const E = "ellipsis" as const;

/** Ağacı okunur kısaltmaya çevirir: kapsayıcı "<sınıf>[...]", özellik harfi. */
function sketch(nodes: DomNode[]): string {
  return nodes
    .map((n) =>
      n.kind === "feature"
        ? n.feature
        : `<${n.id ? "#" + n.id : ""}${n.className ? "." + n.className : ""}>[${sketch(n.children)}]`,
    )
    .join(" ");
}

describe("parseDom", () => {
  it("düz özellik dizisi (lfrtip, Bfrtip)", () => {
    expect(sketch(parseDom("lfrtip"))).toBe("l f r t i p");
    expect(sketch(parseDom("Bfrtip"))).toBe("B f r t i p");
  });

  it("dataTables.bootstrap4 varsayılanı: üç satır, tek tırnak", () => {
    expect(sketch(parseDom(BOOTSTRAP4_DOM))).toBe(
      "<.row>[<.col-sm-12 col-md-6>[l] <.col-sm-12 col-md-6>[f]] " +
        "<.row>[<.col-sm-12>[t r]] " +
        "<.row>[<.col-sm-12 col-md-5>[i] <.col-sm-12 col-md-7>[p]]",
    );
  });

  it("ZTO masraf düzeni (IndexExpenses) ve finans düzeni (BankTransactions)", () => {
    expect(sketch(parseDom(ZTO_DOM.lengthButtonsFilter))).toBe(
      "<.row>[<.col-sm-2>[l] <.col-sm-4>[B] <.col-sm-6 text-right>[f]] r t i p",
    );
    expect(sketch(parseDom(ZTO_DOM.finance))).toBe(
      "<.row>[<.col-sm-12 col-md-6>[l] <.col-sm-12 col-md-6>[f]] r t " +
        "<.row>[<.col-sm-12 col-md-5>[i] <.col-sm-12 col-md-7>[p]]",
    );
  });

  it("kimlik, kimlik.sınıf, nitelik siz kapsayıcı, bilinmeyen karakter ve fazla '>'", () => {
    expect(sketch(parseDom('<"#ust"f><"#alt.sinif.ikinci"i><p>x>>t'))).toBe(
      "<#ust>[f] <#alt.sinif>[i] <>[p] t",
    );
    expect(sketch(parseDom('<"."t>'))).toBe("<>[t]");
    expect(sketch(parseDom('<"#"t>'))).toBe("<>[t]");
    expect(sketch(parseDom('<""t>'))).toBe("<>[t]");
  });

  it("kapanmamış tırnak sona kadar okunur", () => {
    expect(sketch(parseDom('<"acik'))).toBe("<.acik>[]");
  });
});

describe("pagingNumbers (DataTables _numbers, numbers_length 7)", () => {
  it("7 ya da daha az sayfa: hepsi", () => {
    expect(pagingNumbers(0, 0)).toEqual([]);
    expect(pagingNumbers(0, 1)).toEqual([0]);
    expect(pagingNumbers(3, 7)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("başta: ilk beş, üç nokta, son", () => {
    expect(pagingNumbers(0, 10)).toEqual([0, 1, 2, 3, 4, E, 9]);
    expect(pagingNumbers(3, 10)).toEqual([0, 1, 2, 3, 4, E, 9]);
  });

  it("ortada: ilk, üç nokta, komşular, üç nokta, son", () => {
    expect(pagingNumbers(4, 10)).toEqual([0, E, 3, 4, 5, E, 9]);
    expect(pagingNumbers(5, 10)).toEqual([0, E, 4, 5, 6, E, 9]);
    expect(pagingNumbers(49, 100)).toEqual([0, E, 48, 49, 50, E, 99]);
  });

  it("sonda: ilk, üç nokta, son beş", () => {
    expect(pagingNumbers(6, 10)).toEqual([0, E, 5, 6, 7, 8, 9]);
    expect(pagingNumbers(9, 10)).toEqual([0, E, 5, 6, 7, 8, 9]);
    expect(pagingNumbers(7, 8)).toEqual([0, E, 3, 4, 5, 6, 7]);
  });

  it("farklı düğme sayısı", () => {
    expect(pagingNumbers(0, 10, 5)).toEqual([0, 1, 2, E, 9]);
    expect(pagingNumbers(5, 10, 5)).toEqual([0, E, 5, E, 9]);
  });
});

describe("pagingButtons", () => {
  it("tüm sayfalama tipleri", () => {
    expect(pagingButtons("simple", 0, 3)).toEqual(["previous", "next"]);
    expect(pagingButtons("full", 0, 3)).toEqual(["first", "previous", "next", "last"]);
    expect(pagingButtons("numbers", 1, 3)).toEqual([0, 1, 2]);
    expect(pagingButtons("simple_numbers", 1, 3)).toEqual(["previous", 0, 1, 2, "next"]);
    expect(pagingButtons("full_numbers", 0, 10)).toEqual([
      "first",
      "previous",
      0,
      1,
      2,
      3,
      4,
      E,
      9,
      "next",
      "last",
    ]);
    expect(pagingButtons("first_last_numbers", 0, 2)).toEqual(["first", 0, 1, "last"]);
  });
});

describe("pageButtonViews (bootstrap renderer)", () => {
  it("ilk sayfada önceki/ilk devre dışı, etkin sayfa active", () => {
    const views = pageButtonViews("full_numbers", 0, 3);
    expect(views.map((v) => v.className)).toEqual([
      "paginate_button page-item first disabled",
      "paginate_button page-item previous disabled",
      "paginate_button page-item active",
      "paginate_button page-item",
      "paginate_button page-item",
      "paginate_button page-item next",
      "paginate_button page-item last",
    ]);
    expect(views.map((v) => v.target)).toEqual([null, null, null, 1, 2, 1, 2]);
    expect(views[2].active).toBe(true);
  });

  it("son sayfada sonraki/son devre dışı; üç nokta devre dışı ve benzersiz anahtar", () => {
    const views = pageButtonViews("full_numbers", 5, 10);
    const last = views[views.length - 1];
    expect(last).toMatchObject({ button: "last", target: 9, disabled: false });
    const ellipses = views.filter((v) => v.button === E);
    expect(ellipses).toHaveLength(2);
    expect(ellipses[0].className).toBe("paginate_button page-item disabled");
    expect(ellipses[0].target).toBeNull();
    expect(new Set(views.map((v) => v.key)).size).toBe(views.length);
    expect(views.find((v) => v.button === "first")?.target).toBe(0);
    expect(views.find((v) => v.button === "previous")?.target).toBe(4);
    expect(views.find((v) => v.button === "next")?.target).toBe(6);

    const end = pageButtonViews("full", 9, 10);
    expect(end.map((v) => v.disabled)).toEqual([false, false, true, true]);
    expect(end[2].className).toBe("paginate_button page-item next disabled");
  });

  it("kayıt yokken önceki ve sonraki devre dışı", () => {
    const views = pageButtonViews("simple_numbers", 0, 0);
    expect(views.map((v) => v.className)).toEqual([
      "paginate_button page-item previous disabled",
      "paginate_button page-item next disabled",
    ]);
  });

  it("bilinmeyen tip simple_numbers gibi davranır", () => {
    expect(pagingButtons("bilinmeyen" as never, 0, 2)).toEqual(["previous", 0, 1, "next"]);
  });
});

describe("pageInfo / uzunluk / sınır", () => {
  it("sayfa, sayfa sayısı ve gösterim sonu", () => {
    expect(pageInfo(0, 10, 25)).toEqual({ page: 0, pages: 3, start: 0, end: 10 });
    expect(pageInfo(20, 10, 25)).toEqual({ page: 2, pages: 3, start: 20, end: 25 });
    expect(pageInfo(0, 10, 0)).toEqual({ page: 0, pages: 0, start: 0, end: 0 });
    expect(pageInfo(0, -1, 25)).toEqual({ page: 0, pages: 1, start: 0, end: 25 });
  });

  it("uzunluk değişimi (_fnLengthOverflow)", () => {
    expect(startAfterLengthChange(20, 25, 100)).toBe(0);
    expect(startAfterLengthChange(30, 25, 100)).toBe(25);
    expect(startAfterLengthChange(60, 50, 100)).toBe(50);
    expect(startAfterLengthChange(40, 10, 100)).toBe(40);
    expect(startAfterLengthChange(40, -1, 100)).toBe(0);
    // Başlangıç kayıt sayısını aşıyorsa son tam sayfaya iner.
    expect(startAfterLengthChange(90, 50, 60)).toBe(0);
    expect(startAfterLengthChange(5, 10, 0)).toBe(0);
  });

  it("veri azalınca son sayfaya çekilir", () => {
    expect(clampStart(30, 10, 25)).toBe(20);
    expect(clampStart(10, 10, 25)).toBe(10);
    expect(clampStart(10, 10, 0)).toBe(0);
    expect(clampStart(10, -1, 5)).toBe(0);
    expect(clampStart(20, 10, 20)).toBe(10);
  });
});

describe("bilgi satırı", () => {
  const t = (key: string, v?: Record<string, string>) => `${key}${v ? JSON.stringify(v) : ""}`;

  it("binlik ayırıcı nokta", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1250)).toBe("1.250");
    expect(formatCount(1234567)).toBe("1.234.567");
  });

  it("_START_ 1 tabanlı, _END_ hariç sınır, süzülünce infoFiltered", () => {
    expect(infoParts(10, 20, 1250, 1250)).toEqual({
      key: "info",
      filtered: false,
      values: { start: "11", end: "20", total: "1.250", max: "1.250" },
    });
    const filtered = infoParts(0, 3, 3, 40);
    expect(filtered.filtered).toBe(true);
    expect(infoText(filtered, t)).toBe(
      'ztoFinans:table.info{"start":"1","end":"3","total":"3","max":"40"} ztoFinans:table.infoFiltered{"start":"1","end":"3","total":"3","max":"40"}',
    );
  });

  it("kayıt yoksa infoEmpty", () => {
    expect(infoParts(0, 0, 0, 0).key).toBe("infoEmpty");
    expect(infoText(infoParts(0, 0, 0, 5), (k) => k)).toBe(
      "ztoFinans:table.infoEmpty ztoFinans:table.infoFiltered",
    );
  });
});

describe("arama", () => {
  it("arama katlaması select2 searchKey ile aynı (aksan ve büyük/küçük harf duyarsız)", () => {
    expect(searchFold("İSTANBUL IĞDIR")).toBe(searchFold("istanbul igdir"));
    expect(searchFold("Işık")).toBe("ISIK");
  });

  it("akıllı arama sözcükleri ve tırnaklı ifade", () => {
    expect(smartSearchTerms("")).toEqual([]);
    expect(smartSearchTerms("  ")).toEqual([]);
    expect(smartSearchTerms("Ali  VELİ")).toEqual(["ALI", "VELI"]);
    expect(smartSearchTerms('"ali veli" kasa')).toEqual(["ALI VELI", "KASA"]);
    expect(smartSearchTerms('"açık')).toEqual(["ACIK"]);
    expect(smartSearchTerms('a"b')).toEqual(["AB"]);
    expect(smartSearchTerms('""')).toEqual([]);
  });

  it("tüm sözcükler satırın bir yerinde geçmeli (VE), sütunlar arası", () => {
    const row = rowSearchText(["IĞDIR Şubesi", 1250.5, null, "Kasa\nAna"]);
    expect(row).toBe("IĞDIR Şubesi  1.250,5 1.250,50    Kasa\nAna");
    expect(matchesSearch(row, smartSearchTerms("ığdır kasa"))).toBe(true);
    expect(matchesSearch(row, smartSearchTerms("1.250"))).toBe(true);
    expect(matchesSearch(row, smartSearchTerms("ığdır banka"))).toBe(false);
    expect(matchesSearch(row, smartSearchTerms('"kasa ana"'))).toBe(true);
    expect(matchesSearch(row, [])).toBe(true);
    // ZtoSelect ile tutarlı: Türkçe karaktersiz yazım da bulur (DataTables /…/i gibi).
    expect(matchesSearch(row, smartSearchTerms("igdir"))).toBe(true);
    expect(matchesSearch(row, smartSearchTerms("1.250,50"))).toBe(true);
    expect(matchesSearch("ISPARTA DEPO", smartSearchTerms("isparta"))).toBe(true);
    expect(matchesSearch("KIRMIZI", smartSearchTerms("kirmizi"))).toBe(true);
    expect(matchesSearch("İZMİR", smartSearchTerms("izmir"))).toBe(true);
  });

  it("arama metni görünen biçimi de içerir (sayı N2, ISO tarih gg.aa.yyyy)", () => {
    expect(searchTextOf(1250.5)).toContain("1.250,50");
    expect(searchTextOf(1250.5)).toContain("1.250,5");
    expect(searchTextOf(250)).toContain("250,00");
    expect(searchTextOf(1.25)).toBe("1,25");
    expect(searchTextOf("2026-03-01")).toContain("01.03.2026");
    expect(searchTextOf("2026-03-01T10:15:00")).toContain("01.03.2026 10:15");
    expect(searchTextOf("2026-13-45")).toBe("2026-13-45");
    expect(searchTextOf("abc")).toBe("abc");
    expect(searchTextOf(Number.NaN)).toBe("");
    expect(searchTextOf(null)).toBe("");
  });

  it("hücre metni: tarih, mantıksal, nesne", () => {
    expect(valueText(new Date(2026, 10, 13))).toBe("13.11.2026");
    expect(valueText({})).toBe("");
    expect(valueText(undefined)).toBe("");
    expect(valueText(BigInt(12))).toBe("12");
  });
});

describe("compareValues", () => {
  it("boşlar başta, sayılar sayısal, tarihler zamana göre", () => {
    expect(compareValues(null, 1)).toBeLessThan(0);
    expect(compareValues(1, "")).toBeGreaterThan(0);
    expect(compareValues(undefined, null)).toBe(0);
    expect(compareValues(2, 10)).toBeLessThan(0);
    expect(compareValues(new Date(2026, 0, 2), new Date(2026, 0, 1))).toBeGreaterThan(0);
    expect(compareValues(true, false)).toBeGreaterThan(0);
  });

  it("Türkçe harf sırası ve sayısal metin", () => {
    const words = ["Zeytin", "çam", "Can", "ılık", "İnce", "Ördek", "ok", "şeker", "Su"];
    expect([...words].sort(compareValues)).toEqual([
      "Can",
      "çam",
      "ılık",
      "İnce",
      "ok",
      "Ördek",
      "Su",
      "şeker",
      "Zeytin",
    ]);
    expect(["F10", "F9", "F100"].sort(compareValues)).toEqual(["F9", "F10", "F100"]);
  });
});

describe("sunucu taraflı istek", () => {
  it("Page<T> sorgusu", () => {
    const req = toPageRequest({
      start: 50,
      length: 25,
      search: " ali ",
      sorting: [
        { id: "date", desc: true },
        { id: "name", desc: false },
      ],
    });
    expect(req).toEqual({ page: 2, size: 25, sort: ["date,desc", "name,asc"], search: "ali" });
    expect(pageRequestQuery(req)).toBe("page=2&size=25&sort=date%2Cdesc&sort=name%2Casc&q=ali");
    expect(pageRequestQuery({ ...req, search: "", sort: [] }, "search")).toBe("page=2&size=25");
  });

  it("tümü (-1) en büyük boyuta çevrilir", () => {
    expect(toPageRequest({ start: 0, length: -1, search: "", sorting: [] }, 500)).toEqual({
      page: 0,
      size: 500,
      sort: [],
      search: "",
    });
    expect(toPageRequest({ start: 0, length: -1, search: "", sorting: [] }).size).toBe(1000);
  });
});

describe("sütun yardımcıları", () => {
  it("dışa aktarılacak sütunlar", () => {
    const cols = ["a", "b", "c", "islem"];
    expect(pickExportColumns(cols, true, () => true)).toEqual(["a", "b", "c"]);
    expect(pickExportColumns(cols, false, (c) => c !== "b")).toEqual(["a", "c", "islem"]);
  });

  it("başlık metni", () => {
    expect(headerText("Tutar", undefined, "amount")).toBe("Tutar");
    expect(headerText(() => null, "Tutar (TL)", "amount")).toBe("Tutar (TL)");
    expect(headerText(() => null, undefined, "amount")).toBe("amount");
  });

  it("sütun kimliği TanStack kuralıyla", () => {
    expect(columnDefId({ id: "x", accessorKey: "y" })).toBe("x");
    expect(columnDefId({ accessorKey: "account.name" })).toBe("account_name");
    expect(columnDefId({ header: "Ad" })).toBe("Ad");
    expect(columnDefId({ header: () => null })).toBeUndefined();
  });

  it("varsayılan sıralama: ilk yaprak sütun artan", () => {
    expect(defaultOrder([{ accessorKey: "date" }, { accessorKey: "name" }])).toEqual([
      { id: "date", desc: false },
    ]);
    expect(defaultOrder([{ header: "Grup", columns: [{ id: "x", accessorFn: () => 1 }] }])).toEqual(
      [{ id: "x", desc: false }],
    );
    expect(defaultOrder([])).toEqual([]);
    expect(defaultOrder([{ accessorKey: "a", enableSorting: false }])).toEqual([]);
    expect(defaultOrder([{ id: "islem" }])).toEqual([]);
    expect(defaultOrder([{ accessorFn: () => 1, header: () => null }])).toEqual([]);
  });
});
