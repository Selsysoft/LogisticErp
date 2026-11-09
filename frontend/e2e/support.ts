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
export async function linkFromMail(to: string, subject: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const query = encodeURIComponent(`to:"${to}" subject:"${subject}"`);
        const search = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
        const { messages } = (await search.json()) as { messages: { ID: string }[] };
        if (!messages.length) return undefined;
        const message = await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`);
        const { Text } = (await message.json()) as { Text: string };
        link = Text.match(/https?:\/\/\S+/)?.[0];
        return link;
      },
      { timeout: 15_000 },
    )
    .toBeTruthy();
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

export { expect };
