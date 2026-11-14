import { expect, Page, test as base } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:8090";
export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? "http://localhost:8026";
/** application-dev.yml'deki ilk SaaS yöneticisi; yalnız yerel ve test yığınında geçerlidir. */
export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@blackrose.local";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "Dev-Admin-12345";

export const STATE_FILE = join(import.meta.dirname, ".state", "tenant.json");

export type TenantState = { code: string; email: string; password: string };

export function tenantState(): TenantState {
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as TenantState;
}

export function newPassword() {
  return `E2e-${Math.random().toString(36).slice(2, 10)}-9a`;
}

export async function api<T>(
  method: string,
  path: string,
  options: { body?: unknown; token?: string; tenant?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.tenant) headers["X-Tenant-Code"] = options.tenant;
  const response = await fetch(`${BASE_URL}/api/v1${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${await response.text()}`);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

/** Alıcıya gelen son e-postadaki uygulama bağlantısını döner; e-posta gelene kadar bekler. */
/** Mailpit'e gelen ilk eşleşen e-postanın metin ve HTML bölümleri. */
export async function mailMessage(
  to: string,
  subject: string,
): Promise<{ Text: string; HTML: string }> {
  let found: { Text: string; HTML: string } | undefined;
  await expect
    .poll(
      async () => {
        const query = encodeURIComponent(`to:"${to}" subject:"${subject}"`);
        const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
        const { messages } = (await search.json()) as { messages: { ID: string }[] };
        if (!messages.length) return undefined;
        const message = await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`);
        found = (await message.json()) as { Text: string; HTML: string };
        return found;
      },
      { timeout: 15_000 },
    )
    .toBeTruthy();
  return found!;
}

export async function linkFromMail(to: string, subject: string): Promise<string> {
  const { Text } = await mailMessage(to, subject);
  const link = Text.match(/https?:\/\/\S+/)?.[0];
  expect(link, "e-postada bağlantı").toBeTruthy();
  return link!;
}

export async function login(page: Page, state: TenantState, password = state.password) {
  await page.goto("/login");
  await page.getByLabel("Firma kodu").fill(state.code);
  await page.getByLabel("E-posta").fill(state.email);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Giriş yap" }).click();
  // Şifre özeti bilerek yavaştır; paralel testlerde giriş birkaç saniyeyi bulabilir.
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

/**
 * Her testte CSP ihlali, yakalanmamış hata ve konsol hatası testi düşürür; böylece üretim
 * başlıklarıyla bozulan bir ekran fark edilir.
 */
export const test = base.extend<{ pageErrors: string[]; allowedStatuses: number[] }>({
  /** Testin bilerek tetiklediği, varsayılanların dışındaki hata kodları (ör. yetki için 403). */
  allowedStatuses: [[], { option: true }],
  pageErrors: [
    async ({ page, allowedStatuses }, use) => {
      const statuses = [...DEFAULT_STATUSES, ...allowedStatuses];
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error" && !expectedConsoleError(message.text(), statuses)) {
          errors.push(`console: ${message.text()}`);
        }
      });
      await use(errors);
      expect(errors, "tarayıcı hataları").toEqual([]);
    },
    { auto: true },
  ],
});

/** Doğrulama, oturum, bulunamadı ve çakışma yanıtlarını testler kendisi denetler. */
const DEFAULT_STATUSES = [400, 401, 404, 409];

/** Tarayıcının başarısız istekler için yazdığı satırlar. */
function expectedConsoleError(text: string, statuses: number[]) {
  const match = /Failed to load resource: the server responded with a status of (\d{3})/.exec(text);
  return match !== null && statuses.includes(Number(match[1]));
}

// ---------------------------------------------------------------------------------------------
// ZTO CSS sızma denetimi
// ---------------------------------------------------------------------------------------------

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
export async function openModule(page: Page, name: string, url: RegExp) {
  await page.getByRole("navigation").getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(url);
}

/** ZTO CSS parçası belgede mi (kapsamlı .zto-finans kuralı içeren bir stil sayfası). */
export function ztoCssLoaded(page: Page) {
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

export const MODULES = [
  { name: "Finans", url: /\/finance$/ },
  { name: "Operasyon", url: /\/operations$/ },
  { name: "Filo", url: /\/fleet$/ },
  // 12.1a: kullanıcı diyaloğunun "İş Yeri Yetkisi" sekmesi ZTO bileşenini (ve CSS'ini) yükler.
  { name: "Kullanıcılar", url: /\/users$/ },
];

/**
 * ZTO CSS sızma denetimi (12.2 §6.5; zto-finans.spec.ts'ten taşındı): (a) ZTO hiç açılmadan her MUI
 * modülü ölçülür ve ZTO CSS parçası yüklü olmamalıdır; (b) `visitZto` ZTO ekranlarını SPA içinde
 * (drawer ve iç bağlantılarla, `page.goto` olmadan) açar ve yüklenen CSS parçaları belgede kalır;
 * (c) aynı modüllere dönülünce hesaplanmış stiller ilk ölçümle birebir aynı, ZTO CSS hâlâ yüklü ve
 * `.zto-finans` kökü yok olmalıdır.
 */
export async function assertNoZtoCssLeak(page: Page, visitZto: (page: Page) => Promise<void>) {
  const before: Record<string, Snapshot> = {};
  for (const module of MODULES) {
    await openModule(page, module.name, module.url);
    expect(await ztoCssLoaded(page)).toBe(false);
    before[module.name] = await snapshot(page);
  }

  await visitZto(page);
  expect(await ztoCssLoaded(page)).toBe(true);

  for (const module of MODULES) {
    await openModule(page, module.name, module.url);
    expect(await ztoCssLoaded(page)).toBe(true);
    await expect(page.locator(".zto-finans")).toHaveCount(0);
    const after = await snapshot(page);
    expect(after, `${module.name} ekranı`).toEqual(before[module.name]);
  }
}

/**
 * ZTO yan menüsünü klavyeyle (ok düğmesi + Enter) açar ve panelin genişlik geçişinin (0,32 sn)
 * bitmesini bekler. Üzerine gelerek açmak yük altında yarışıyordu: geçiş sürerken bağlantı "kararlı"
 * görünür ama panel onu kırptığından tıklama içeriğe düşer; sayfa yerleşimi kayınca da imleç oktan
 * çıkıp menü kapanır (12.2 son kapı). İmleç önce içerik alanına çekilir, menü kapalıyken açılır.
 */
export async function openZtoSidebar(page: Page) {
  const sidebar = page.locator(".zto-finans #ztSidebar");
  await page.mouse.move(900, 600);
  const classes = ((await sidebar.getAttribute("class")) ?? "").split(" ");
  if (!classes.includes("open")) {
    await page.locator(".zto-finans .zt-sidebar-arrow").focus();
    await page.keyboard.press("Enter");
  }
  await expect(sidebar).toHaveClass(/open/);
  await expect(sidebar.locator(".zt-sidebar-panel")).toHaveCSS("width", "260px");
  return sidebar;
}

/** ZTO yan menüsünden verilen ekrana SPA içinde geçer, sonra imleci içeriğe çeker. */
export async function openZtoSidebarLink(page: Page, name: string, url: RegExp) {
  // İlk ZTO açılışında kabuk tembel parça yüklenince yeniden çizilebilir ve açılan menü kapanır;
  // açma + tıklama birlikte yeniden denenir.
  await expect(async () => {
    const sidebar = await openZtoSidebar(page);
    await sidebar.getByRole("link", { name, exact: true }).click({ timeout: 5_000 });
    await expect(page).toHaveURL(url, { timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  await page.mouse.move(900, 600);
}

export { expect };
