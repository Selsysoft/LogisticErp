import type { Page } from "@playwright/test";
import { expect, login, tenantState, test } from "./support";

/**
 * ZTO Finans (Faz 12.0): yönlendirme, kapsam kökü ve CSS sızma denetimi. ZTO CSS'i (Bootstrap 4,
 * SB Admin, DataTables, select2, Font Awesome) ayrı ve tembel bir parçada gelir; her seçicisi
 * .zto-finans altındadır. Parça yüklendikten sonra MUI ekranlarının hesaplanmış stilleri, ZTO hiç
 * açılmamışken ölçülen değerlerle birebir aynı kalmalıdır.
 */

/** Blackrose ekranlarında ölçülen MUI öğeleri; sayfada yoksa null kaydedilir. */
const MUI_TARGETS = [
  "body",
  "html",
  "header.MuiAppBar-root",
  ".MuiDrawer-paper",
  ".MuiListItemButton-root",
  "main",
  "main h1, main h2, main h3, main h4, main h5, main h6",
  "main p",
  "main a",
  "main .MuiButton-root",
  "main .MuiTab-root",
  "main .MuiTableCell-root",
  "main .MuiInputBase-input",
  "main .MuiChip-root",
  "main .MuiPaper-root",
];

/**
 * ZTO kökü dışına eklenen düz HTML öğeleri: Bootstrap'ın eleman (h1, a, table…) ve sınıf (.row,
 * .card, .btn, .d-none…) kuralları kapsamsız kalsaydı bunları değiştirirdi.
 */
const PROBE_HTML = `
  <h1>h1</h1><h2>h2</h2><h3>h3</h3><h4>h4</h4><h5>h5</h5><h6>h6</h6>
  <p>p</p><a href="#x">a</a><button type="button">b</button><small>s</small><code>c</code>
  <label>l</label><input value="i"><select><option>o</option></select><textarea>t</textarea>
  <hr><ul><li>li</li></ul><table><thead><tr><th>th</th></tr></thead><tbody><tr><td>td</td></tr></tbody></table>
  <div class="row"><div class="col-md-6">col</div></div><div class="container-fluid">cf</div>
  <div class="card"><div class="card-header">ch</div><div class="card-body">cb</div></div>
  <span class="btn btn-primary">btn</span><span class="badge badge-success">bd</span>
  <div class="alert alert-info">al</div><div class="d-none">dn</div><div class="modal">m</div>
  <div class="fade">f</div><div class="collapse">co</div><div class="table">tb</div>
  <i class="fas fa-university">fa</i><div class="form-control">fc</div><div class="nav-link">nl</div>
  <div class="dropdown-menu">dm</div><div class="select2-container">s2</div>
  <div class="dataTables_wrapper">dt</div><div class="zt-sidebar">zs</div><div class="erp-btn">eb</div>
`;

const PROPS = [
  "display",
  "position",
  "box-sizing",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-bottom-width",
  "border-left-width",
  "border-top-color",
  "border-top-left-radius",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "color",
  "background-color",
  "text-decoration-line",
  "text-align",
  "text-transform",
  "vertical-align",
  "opacity",
  "visibility",
  "overflow",
  "z-index",
  "flex-wrap",
  "list-style-type",
  "cursor",
];

type Snapshot = Record<string, Record<string, string> | null>;

/**
 * Ekran verisi yüklenip yerleşim durulduktan sonraki ölçüm: ağ boşalır, ardışık iki ölçüm aynı olana
 * dek beklenir (veri gelince öğe eklenmesi sızma sanılmasın).
 */
async function snapshot(page: Page): Promise<Snapshot> {
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  let previous = await measure(page);
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(300);
    const current = await measure(page);
    if (JSON.stringify(current) === JSON.stringify(previous)) return current;
    previous = current;
  }
  return previous;
}

/** Seçili öğelerin ve kapsam dışı sınama öğelerinin hesaplanmış stilleri. */
function measure(page: Page): Promise<Snapshot> {
  return page.evaluate(
    ({ targets, html, props }) => {
      const read = (el: Element | null) => {
        if (!el) return null;
        const style = getComputedStyle(el);
        return Object.fromEntries(props.map((p) => [p, style.getPropertyValue(p)]));
      };
      const result: Record<string, Record<string, string> | null> = {};
      for (const selector of targets) result[selector] = read(document.querySelector(selector));
      const probe = document.createElement("div");
      probe.id = "zto-leak-probe";
      probe.innerHTML = html;
      document.body.appendChild(probe);
      Array.from(probe.children).forEach((el, i) => {
        result[`probe ${i} ${el.tagName.toLowerCase()}.${el.className}`] = read(el);
      });
      result["probe fa::before"] = (() => {
        const icon = probe.querySelector("i.fas");
        if (!icon) return null;
        const style = getComputedStyle(icon, "::before");
        return { content: style.content, "font-family": style.fontFamily };
      })();
      probe.remove();
      return result;
    },
    { targets: MUI_TARGETS, html: PROBE_HTML, props: PROPS },
  );
}

/** Drawer menüsünden SPA içinde gezinir (sayfa yeniden yüklenmez, yüklü CSS parçaları kalır). */
async function openModule(page: Page, name: string, url: RegExp) {
  await page.getByRole("navigation").getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(url);
}

/** ZTO CSS parçası belgede mi (kapsamlı .zto-finans kuralı içeren bir stil sayfası). */
function ztoCssLoaded(page: Page) {
  return page.evaluate(() =>
    Array.from(document.styleSheets).some((sheet) => {
      try {
        return Array.from(sheet.cssRules).some((rule) =>
          (rule as CSSStyleRule).selectorText?.startsWith(".zto-finans .btn-primary"),
        );
      } catch {
        return false;
      }
    }),
  );
}

const MODULES = [
  { name: "Finans", url: /\/finance$/ },
  { name: "Operasyon", url: /\/operations$/ },
  { name: "Filo", url: /\/fleet$/ },
];

test("/zto-finans Cari Hareketler iskeletine yönlenir; ZTO kökü ve yan menü", async ({ page }) => {
  await login(page, tenantState());
  await page.goto("/zto-finans");
  await expect(page).toHaveURL(/\/zto-finans\/cari-hareketler$/);
  const root = page.locator(".zto-finans");
  await expect(root).toHaveCount(1);
  await expect(root).toHaveClass("zto-finans sb-nav-fixed");
  await expect(
    root.getByRole("heading", { level: 6, name: "Günlük Tüm Cari İşlemleri" }),
  ).toBeVisible();
  await expect(root.getByText("Bu ekran Faz 12.1 ile gelecek.")).toBeVisible();

  // ZTO yan menüsü: fareyle açılır; yazılmamış ekranlar pasif.
  const sidebar = root.locator("#ztSidebar");
  await expect(sidebar).not.toHaveClass(/open/);
  await root.locator(".zt-sidebar-arrow").hover();
  await expect(sidebar).toHaveClass(/open/);
  const payments = sidebar.locator("a", { hasText: "Ödemeler" });
  await expect(payments).toHaveClass("disabled");
  await expect(payments).toHaveAttribute("title", "Bu ekran Faz 12.2a ile gelecek.");
  await expect(sidebar.locator("a.zt-active")).toHaveAttribute(
    "href",
    "/zto-finans/cari-hareketler",
  );
  // Vitrin yalnız geliştirmede; üretim paketinde ne menüde ne rotada.
  await expect(sidebar.getByText("Bileşen vitrini")).toHaveCount(0);
  await page.mouse.move(900, 600);
  await expect(sidebar).not.toHaveClass(/open/);
});

test("ZTO kökü içinde Bootstrap 4 / SB Admin ve Font Awesome uygulanır", async ({ page }) => {
  await login(page, tenantState());
  await page.goto("/zto-finans/cari-hareketler");
  const root = page.locator(".zto-finans");
  await expect(root.locator(".alert-info")).toBeVisible();
  const styles = await page.evaluate(async () => {
    await document.fonts.ready;
    const css = (selector: string, pseudo?: string) => {
      const el = document.querySelector(selector);
      return el ? getComputedStyle(el, pseudo) : null;
    };
    // Bootstrap .btn-primary örneği (kapsam içinde geçici düğme).
    const button = document.createElement("button");
    button.className = "btn btn-primary";
    document.querySelector(".zto-finans-content")?.appendChild(button);
    const btn = getComputedStyle(button);
    const result = {
      rootFont: css(".zto-finans")?.fontFamily,
      rootSize: css(".zto-finans")?.fontSize,
      btnBackground: btn.backgroundColor,
      btnRadius: btn.borderTopLeftRadius,
      alertBackground: css(".zto-finans .alert-info")?.backgroundColor,
      alertBorder: css(".zto-finans .alert-info")?.borderTopColor,
      cardBorder: css(".zto-finans .card")?.borderTopWidth,
      arrowBackground: css(".zto-finans .zt-sidebar-arrow")?.backgroundColor,
      iconFont: css(".zto-finans .erp-header-icon i", "::before")?.fontFamily,
      iconContent: css(".zto-finans .erp-header-icon i", "::before")?.content,
      faLoaded: document.fonts.check('900 16px "Font Awesome 5 Free"'),
    };
    button.remove();
    return result;
  });
  expect(styles.rootFont).toContain("Open Sans");
  expect(styles.rootSize).toBe("14px");
  expect(styles.btnBackground).toBe("rgb(0, 123, 255)");
  expect(styles.btnRadius).toBe("4px");
  expect(styles.alertBackground).toBe("rgb(209, 236, 241)");
  expect(styles.alertBorder).toBe("rgb(190, 229, 235)");
  expect(styles.cardBorder).toBe("1px");
  expect(styles.arrowBackground).toBe("rgb(0, 123, 255)");
  expect(styles.iconFont).toContain("Font Awesome 5 Free");
  // fa-calendar-day = \f783
  expect(styles.iconContent).toBe('""');
  expect(styles.faLoaded).toBe(true);
});

test("CSS sırası ZTO ile aynı: Bootstrap layout.css'in modal kurallarını ezer; Open Sans yalnız 400/600", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page, tenantState());
  await page.goto("/zto-finans/cari-hareketler");
  await expect(page.locator(".zto-finans .alert-info")).toBeVisible();
  const styles = await page.evaluate(async () => {
    await document.fonts.ready;
    // ZtoModal işaretlemesi (vitrin üretimde yok): kapsam içinde geçici modal içeriği.
    const host = document.createElement("div");
    host.innerHTML =
      '<div class="modal-content"><div class="modal-header"><h5 class="modal-title">m</h5></div>' +
      '<div class="modal-body">b</div></div><ul class="nav nav-tabs"><li class="nav-item">' +
      '<a class="nav-link active" href="#t">t</a></li></ul>';
    document.querySelector(".zto-finans-content")?.appendChild(host);
    const content = getComputedStyle(host.querySelector(".modal-content")!);
    const header = getComputedStyle(host.querySelector(".modal-header")!);
    const tab = getComputedStyle(host.querySelector(".nav-link.active")!);
    const weights: string[] = [];
    document.fonts.forEach((face) => {
      if (face.family.includes("Open Sans") && !weights.includes(face.weight)) {
        weights.push(face.weight);
      }
    });
    const result = {
      contentBackground: content.backgroundColor,
      contentRadius: content.borderTopLeftRadius,
      headerPaddingTop: header.paddingTop,
      headerBackground: header.backgroundColor,
      tabBorderBottom: tab.borderBottomWidth,
      tabFontSize: tab.fontSize,
      openSansWeights: weights.sort(),
    };
    host.remove();
    return result;
  });
  // ZTO _ExpertLayout: layout.css → styles.css (BS 4.4.1); eşit özgüllükte Bootstrap kazanır.
  expect(styles.contentBackground).toBe("rgb(255, 255, 255)");
  expect(styles.contentRadius).toBe("4.8px");
  expect(styles.headerPaddingTop).toBe("16px");
  // layout.css'in Bootstrap'ta karşılığı olmayan kuralı kalır.
  expect(styles.headerBackground).toBe("rgb(0, 123, 255)");
  // Layout satır içi stili (kompakt nav-tabs).
  expect(styles.tabBorderBottom).toBe("3px");
  expect(styles.tabFontSize).toBe("12px");
  expect(styles.openSansWeights).toEqual(["400", "600"]);
});

for (const viewport of [
  { width: 1280, height: 800, appBar: 64 },
  { width: 390, height: 844, appBar: 56 },
]) {
  test(`yan menü akışa yükseklik katmaz; kısa sayfa kaymaz (${viewport.width}x${viewport.height})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page, tenantState());
    await page.goto("/zto-finans/cari-hareketler");
    await expect(page.locator(".zto-finans .alert-info")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight))
      .toBeLessThanOrEqual(0);
    const arrow = await page.evaluate(() => {
      const rect = document.querySelector(".zto-finans .zt-sidebar-arrow")!.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, innerHeight: window.innerHeight };
    });
    expect(arrow.top).toBe(viewport.appBar);
    expect(arrow.bottom).toBe(arrow.innerHeight);
  });
}

test("ZTO CSS'i yüklendikten sonra MUI ekranlarının stilleri değişmez", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, tenantState());

  // 1) ZTO hiç açılmadan ölç.
  const before: Record<string, Snapshot> = {};
  for (const module of MODULES) {
    await openModule(page, module.name, module.url);
    expect(await ztoCssLoaded(page)).toBe(false);
    before[module.name] = await snapshot(page);
  }

  // 2) ZTO Finans'ı SPA içinde aç: CSS parçası belgeye eklenir.
  await openModule(page, "ZTO Finans", /\/zto-finans\/cari-hareketler$/);
  await expect(page.locator(".zto-finans .alert-info")).toBeVisible();
  expect(await ztoCssLoaded(page)).toBe(true);

  // 3) Aynı ekranlara SPA içinde dönüp yeniden ölç; CSS parçası hâlâ yüklü.
  for (const module of MODULES) {
    await openModule(page, module.name, module.url);
    expect(await ztoCssLoaded(page)).toBe(true);
    await expect(page.locator(".zto-finans")).toHaveCount(0);
    const after = await snapshot(page);
    expect(after, `${module.name} ekranı`).toEqual(before[module.name]);
  }
});
