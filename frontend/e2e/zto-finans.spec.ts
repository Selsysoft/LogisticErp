import type { Page } from "@playwright/test";
import { Owner, unique } from "./fixtures";
import { expect, login, tenantState, test } from "./support";

/**
 * ZTO Finans (Faz 12.0, 12.1a tanım ekranları): yönlendirme, kapsam kökü, TEMEL TANIMLAR (Şubeler,
 * İş Yerleri, Şirketler) akışları ve CSS sızma denetimi. ZTO CSS'i (Bootstrap 4,
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
  // 12.1a: kullanıcı diyaloğunun "İş Yeri Yetkisi" sekmesi ZTO bileşenini (ve CSS'ini) yükler.
  { name: "Kullanıcılar", url: /\/users$/ },
];

test("/zto-finans Günlük Tüm Cari İşlemleri'ne yönlenir; ZTO kökü ve yan menü", async ({
  page,
}) => {
  await login(page, tenantState());
  await page.goto("/zto-finans");
  await expect(page).toHaveURL(/\/zto-finans\/cari-hareketler$/);
  const root = page.locator(".zto-finans");
  await expect(root).toHaveCount(1);
  // Sayfa kök sınıfı (zto-page-all-transactions) da eklendiği için düzenli ifade.
  await expect(root).toHaveClass(/zto-finans sb-nav-fixed/);
  await expect(root).toHaveClass(/zto-page-all-transactions/);
  await expect(
    root.getByRole("heading", { level: 6, name: "Günlük Tüm Cari İşlemleri" }),
  ).toBeVisible();
  await expect(root.locator("#allTransactionsFilters")).toBeVisible();

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
  await expect(root.locator("#allTransactionsFilters")).toBeVisible();
  const styles = await page.evaluate(async () => {
    await document.fonts.ready;
    const css = (selector: string, pseudo?: string) => {
      const el = document.querySelector(selector);
      return el ? getComputedStyle(el, pseudo) : null;
    };
    // Bootstrap .btn-primary ve .alert-info örnekleri (kapsam içinde geçici öğeler; 12.1'de sayfada
    // bilgi kutusu yok, stil kuralı ölçülür).
    const button = document.createElement("button");
    button.className = "btn btn-primary";
    document.querySelector(".zto-finans-content")?.appendChild(button);
    const alert = document.createElement("div");
    alert.className = "alert alert-info";
    alert.textContent = "a";
    document.querySelector(".zto-finans-content")?.appendChild(alert);
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
    alert.remove();
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
  await expect(page.locator(".zto-finans #allTransactionsFilters")).toBeVisible();
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
    // 12.1'de Günlük Tüm Cari İşlemleri dolu bir ekran; kısa kalan tanım listesi (Şirketler, tek
    // şirketli test kiracısı) ölçülür.
    await page.goto("/zto-finans/tanimlar/sirketler");
    await expect(page.locator(".zto-finans table").first()).toBeVisible();
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
  await expect(page.locator(".zto-finans #allTransactionsFilters")).toBeVisible();
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

/** ZtoSelect (select2 görünümü): kutuyu açıp metne göre seçer. */
async function pickSelect2(page: Page, selectId: string, text: string) {
  await page.locator(`#${selectId} ~ .select2-container .select2-selection`).click();
  await page.locator(".select2-results__option", { hasText: text }).first().click();
}

test("TEMEL TANIMLAR: yan menü; Şube ve İş Yeri ekle, Sil (pasifleştir), Pasifleri göster, Aktifleştir", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const suffix = Date.now().toString(36);
  const groupName = `E2E Şube ${suffix}`;
  const placeName = `E2E İş Yeri ${suffix}`;
  await login(page, tenantState());
  await page.goto("/zto-finans/cari-hareketler");
  const root = page.locator(".zto-finans");
  const sidebar = root.locator("#ztSidebar");

  // Yan menü: TEMEL TANIMLAR bölümü ve üç öğe.
  await root.locator(".zt-sidebar-arrow").hover();
  await expect(sidebar).toHaveClass(/open/);
  await expect(sidebar.getByText("TEMEL TANIMLAR")).toBeVisible();
  for (const name of ["İş Yerleri", "Şubeler", "Şirketler"]) {
    await expect(sidebar.getByRole("link", { name })).toBeVisible();
  }
  await sidebar.getByRole("link", { name: "Şubeler" }).click();
  await expect(page).toHaveURL(/\/zto-finans\/tanimlar\/subeler$/);
  await expect(root).toHaveClass(/definition-list-page/);
  await expect(root.locator("h5", { hasText: "Şube Listesi" })).toBeVisible();

  // 1) Şube (ZTO BranchProvince): iş yeri formu bir şube ister.
  await root.getByRole("link", { name: "Yeni Kayıt" }).click();
  await expect(page).toHaveURL(/\/subeler\/yeni$/);
  await expect(root).toHaveClass(/definition-form-page/);
  await root.locator("#Name").fill(groupName);
  await pickSelect2(page, "BranchType", "Ana Şube");
  await root.getByRole("button", { name: "Yeni Şube Oluştur" }).click();
  await expect(page).toHaveURL(/\/subeler$/);
  await expect(root.getByText("Şube kaydedildi.")).toBeVisible();
  await root.getByPlaceholder("Listede ara...").fill(groupName);
  await expect(root.locator("#dataTable tbody tr", { hasText: groupName })).toBeVisible();

  // 2) İş yeri ekle.
  await page.goto("/zto-finans/tanimlar/is-yerleri");
  await expect(root.locator("h5", { hasText: "İş Yerleri Listesi" })).toBeVisible();
  await root.getByRole("link", { name: "Yeni Kayıt" }).click();
  await expect(page).toHaveURL(/\/is-yerleri\/yeni$/);
  await root.locator("#Name").fill(placeName);
  await root.locator("#PhoneNumber").fill("0232 111 22 33");
  await expect(root.locator("#PhoneNumber")).toHaveValue("02321112233");
  await pickSelect2(page, "BranchProvinceID", groupName);
  await root.locator("#Address").fill("Alsancak, İzmir");
  await root.locator("#Location").fill("38.4237,27.1428");
  await expect(root.getByRole("link", { name: "Haritada Göster" })).toHaveAttribute(
    "href",
    "https://www.google.com/maps/search/?api=1&query=38.4237,27.1428",
  );
  await root.getByRole("button", { name: "Yeni İş Yeri Oluştur" }).click();
  await expect(page).toHaveURL(/\/is-yerleri$/);
  await expect(root.getByText("İş yeri oluşturuldu.")).toBeVisible();
  await root.getByPlaceholder("Listede ara...").fill(placeName);
  const row = root.locator("#dataTable tbody tr", { hasText: placeName });
  await expect(row).toBeVisible();
  await expect(row.locator('td[data-label="Şube"]')).toHaveText(groupName);
  await expect(row.locator('td[data-label="Ad"]')).toHaveText(placeName);

  // Kayıt Bilgileri ve Detay.
  await row.getByRole("button", { name: "Kayıt bilgilerini görüntüle" }).click();
  await expect(root.locator("aside.intro-audit-popover")).toContainText("Kayıt Geçmişi");
  await page.keyboard.press("Escape");
  await expect(root.locator("aside.intro-audit-popover")).toHaveCount(0);
  await row.getByRole("button", { name: "Kayıt detayını görüntüle" }).click();
  const detail = root.locator(".modal.definition-details-modal");
  await expect(detail.locator("h5.modal-title")).toHaveText("İş Yeri");
  await expect(detail.locator(".definition-details__hero h4")).toHaveText(placeName);
  await detail.getByRole("button", { name: "Kapat" }).click();
  await expect(detail).toHaveCount(0);

  // 3) Sil → onay (geri alınamaz notu yok) → pasifleştirildi, listeden kaybolur.
  await row.getByRole("button", { name: "Sil" }).click();
  const confirm = root.locator(".modal", { hasText: "Silmek istediğinize emin misiniz?" });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText(/geri alınamaz/)).toHaveCount(0);
  await confirm.getByRole("button", { name: "Sil" }).click();
  await expect(root.getByText("İş yeri pasifleştirildi.")).toBeVisible();
  await expect(root.locator("#dataTable tbody tr", { hasText: placeName })).toHaveCount(0);

  // 4) Pasifleri göster → görünür (soluk) → Aktifleştir.
  await root.getByLabel("Pasifleri göster").check();
  const passive = root.locator("#dataTable tbody tr", { hasText: placeName });
  await expect(passive).toHaveClass(/definition-row--inactive/);
  await passive.getByRole("button", { name: "Aktifleştir" }).click();
  await expect(root.getByText("İş yeri aktifleştirildi.")).toBeVisible();
  await expect(root.locator("#dataTable tbody tr", { hasText: placeName })).not.toHaveClass(
    /definition-row--inactive/,
  );

  // 5) Düzenle: yan menü öğesi alt yolda da etkin; ZTO Edit düğmesi.
  await root
    .locator("#dataTable tbody tr", { hasText: placeName })
    .getByRole("link", { name: "Düzenle" })
    .click();
  await expect(page).toHaveURL(/\/is-yerleri\/[0-9a-f-]+$/);
  await expect(root.locator("h4.definition-form-title")).toHaveText("İş Yeri Düzenle");
  await expect(sidebar.locator("a.zt-active")).toHaveAttribute(
    "href",
    "/zto-finans/tanimlar/is-yerleri",
  );
  await root.locator("#Name").fill(`${placeName} 2`);
  await root.getByRole("button", { name: "Güncelle" }).click();
  await expect(root.getByText("İş yeri güncellendi.")).toBeVisible();
});

test("Şirketler: varsayılan şirket listede; düzenle → e-Belge → kaydet mesajı; Seriler", async ({
  page,
}) => {
  await login(page, tenantState());
  await page.goto("/zto-finans/tanimlar/sirketler");
  const root = page.locator(".zto-finans");
  await expect(root.locator("h5", { hasText: "Şirket Listesi" })).toBeVisible();
  const defaultRow = root.locator("#dataTable tbody tr", { hasText: "Varsayılan" });
  await expect(defaultRow).toHaveCount(1);
  await defaultRow.getByRole("link", { name: "Düzenle" }).click();
  await expect(root.locator("h4.definition-form-title")).toHaveText("Şirket Düzenle");
  await expect(root.locator("#Code")).not.toHaveValue("");

  await root.getByRole("tab", { name: "e-Belge" }).click();
  await expect(page).toHaveURL(/\?sekme=e-belge$/);
  await expect(root.locator(".uy-head h1")).toHaveText("Uyumsoft e-Dönüşüm");
  await expect(root.locator("#uyCheckBtn")).toBeDisabled();
  await expect(root.locator("#uyTestBtn")).toBeDisabled();
  await root.locator("#uySeries").fill("e2e");
  await expect(root.locator("#uySeries")).toHaveValue("E2E");
  await root.getByRole("button", { name: "Kaydet" }).click();
  await expect(root.locator("#uyMsg")).toHaveText("Uyumsoft ayarları kaydedildi.");
  await expect(root.locator("#uyMsg")).toHaveClass(/ok/);

  await root.getByRole("tab", { name: "Seriler" }).click();
  await expect(page).toHaveURL(/\?sekme=seriler$/);
  await expect(root.locator("#seriesTable tbody tr")).toHaveCount(2);
  await expect(root.getByText("Navlun Faturası")).toBeVisible();
  await expect(root.getByText("Depo Faturası")).toBeVisible();
});

test("tanım CSS'i ZTO sırasıyla: Detay düğmesinde Bootstrap .btn-sm kazanır", async ({ page }) => {
  await login(page, tenantState());
  await page.goto("/zto-finans/tanimlar/sirketler");
  const root = page.locator(".zto-finans");
  await expect(root.locator("#dataTable tbody tr").first()).toBeVisible();
  const styles = await page.evaluate(() => {
    const css = (selector: string) => {
      const el = document.querySelector(selector);
      return el ? getComputedStyle(el) : null;
    };
    return {
      surfaceRadius: css(".zto-finans .definition-list-surface")?.borderTopLeftRadius,
      detailFont: css(".zto-finans .definition-detail-button")?.fontSize,
      countDisplay: css(".zto-finans .definition-list-count")?.display,
    };
  });
  expect(styles.surfaceRadius).not.toBe("0px");
  // introduction-audit.css .definition-detail-button 11px; sonra yüklenen Bootstrap .btn-sm (.875rem)
  // eşit özgüllükte kazanır (ZTO _Layout.cshtml:31-33 sırası).
  expect(styles.detailFont).not.toBe("11px");
  expect(styles.countDisplay).not.toBe("none");
});

/** Yerel bugün (yyyy-MM-dd; uygulamanın today() karşılığı). */
function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

test("Günlük Tüm Cari İşlemleri: 7 Gün, kart süzgeci çipi, boş durum → Hızlı Cari İşlemi → Cari Hareketler", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const owner = await Owner.login(tenantState());
  const branchName = `E2E AT ${unique("")}`;
  const branchId = await owner.branch(branchName);
  const accountName = `E2E Günlük Cari ${unique("")}`;
  const accountId = await owner.account("SUPPLIER", accountName);
  await owner.request("POST", `/finance/accounts/${accountId}/transactions`, {
    branchId,
    direction: "DEBIT",
    money: { amount: "1250.50", currency: "TRY" },
    date: localToday(),
    description: "E2E günlük hareket",
  });

  await login(page, tenantState());
  await page.goto("/zto-finans/cari-hareketler");
  const root = page.locator(".zto-finans");
  const filters = root.locator("#allTransactionsFilters");
  await expect(filters).toBeVisible();

  // Hızlı aralık: 7 Gün etkin olur, tabloda bugünkü hareket görünür (istemci araması ile bulunur).
  await filters.getByRole("button", { name: "7 Gün" }).click();
  await expect(filters.getByRole("button", { name: "7 Gün" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const table = root.locator("#allCustomerTransactionsTable");
  await root.locator("#allCustomerTransactionsTable_filter input").fill(accountName);
  await expect(table.locator("a.at-cari-link", { hasText: accountName })).toBeVisible();
  await expect(table.locator("tbody tr").first()).toContainText("1.250,50 ₺");

  // Kart süzgeci: İş Yerleri kartında yeni iş yeri → çip "İş Yeri: …"; çip kaldırılınca kaybolur.
  const branchCard = root
    .locator("#atCardWorkPlace")
    .getByRole("button", { name: new RegExp(branchName) });
  await branchCard.click();
  await expect(branchCard).toHaveAttribute("aria-pressed", "true");
  const chip = root.locator("#atDynamicFilterIndicator .at-filter-chip");
  await expect(chip).toContainText(`İş Yeri: ${branchName}`);
  await chip.getByRole("button", { name: /süzgecini kaldır/ }).click();
  await expect(chip).toHaveCount(0);

  // Boş durum: hareketsiz geçmiş bir gün → "Hızlı Cari İşlemi" modalı açar.
  await filters.getByLabel("Başlangıç Tarihi").fill("2001-01-01");
  await filters.getByLabel("Bitiş Tarihi").fill("2001-01-01");
  await expect(root.getByText("Bugün henüz bir cari işlemi yapılmadı")).toBeVisible();
  await root.getByRole("button", { name: "Hızlı Cari İşlemi" }).click();
  const modal = root.locator("#quickCariActionModal.modal");
  await expect(modal).toBeVisible();
  await expect(modal.locator(".modal-content.qca-content > .qca-header")).toBeVisible();
  await modal.getByPlaceholder("Cari ara — ad veya kod yazın...").fill(accountName);
  await modal.getByRole("option", { name: new RegExp(accountName) }).click();
  await expect(modal.locator("#qcaSelected")).toContainText(accountName);
  await modal.getByRole("link", { name: "Cari Hareketler" }).click();
  await expect(page).toHaveURL(new RegExp(`/zto-finans/cari-kartlar/${accountId}/hareketler$`));
  await expect(modal).toHaveCount(0);

  // Menüdeki "Hızlı Cari İşlemi" aynı modalı açar.
  await root.locator(".zt-sidebar-arrow").hover();
  await root.locator("#ztSidebar").getByRole("button", { name: "Hızlı Cari İşlemi" }).click();
  await expect(root.locator("#quickCariActionModal.modal")).toBeVisible();
  await expect(
    root.locator("#quickCariActionModal").getByText("Bir cari arayın ve seçin"),
  ).toBeVisible();
});
