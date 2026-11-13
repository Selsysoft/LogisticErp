// "npm run build" sonrası dist CSS'inde ZTO kurallarının .zto-finans dışına sızmadığını denetler.
// ZTO paketi (".zto-finans" içeren CSS): her seçici .zto-finans ile başlamalı (@keyframes içi hariç),
// @page kalmamalı, lisans bildirimi (ztoLicensePlugin) başta olmalı, aynı @keyframes adı farklı gövdeyle
// iki kez tanımlanmamalı (sonraki öncekini sessizce ezer; 12.x sayfa CSS'lerinde ad zto-<sayfa>-x yapılır).
// Diğer CSS dosyaları: ZTO/Bootstrap'a özgü sınıflar hiç geçmemeli.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";

const ASSETS = join(import.meta.dirname, "..", "dist", "assets");
const SCOPED = /^\.zto-finans(?![\w-])/;
const LICENSE_MARKERS = [
  "SB Admin v6.0.0",
  "Bootstrap v4.4.1",
  "SpryMedia",
  "Select2 4.1.0-rc.0",
  "Select2 Bootstrap Theme",
  "Font Awesome Free 5.15.4",
  "fontawesome.com/license/free",
];
const ZTO_MARKERS =
  /\.(select2-|dataTables_|dt-button|sb-nav-fixed|btn-primary|modal-backdrop|fa-)/;

const files = readdirSync(ASSETS).filter((name) => name.endsWith(".css"));
const errors = [];
let ztoFiles = 0;
let checkedRules = 0;

for (const name of files) {
  const source = readFileSync(join(ASSETS, name), "utf8");
  const root = postcss.parse(source, { from: name });
  const isZto = root.toString().includes(".zto-finans");
  if (isZto) {
    ztoFiles += 1;
    for (const marker of LICENSE_MARKERS) {
      if (!source.includes(marker)) {
        errors.push(`${name}: lisans bildirimi eksik ("${marker}")`);
      }
    }
    const keyframes = new Map();
    root.walkAtRules(/keyframes$/, (atRule) => {
      const key = `${atRule.name} ${atRule.params}`;
      const body = atRule.nodes?.map((node) => node.toString()).join("") ?? "";
      if (keyframes.has(key) && keyframes.get(key) !== body) {
        errors.push(`${name}: @${key} farklı gövdeyle birden çok kez tanımlı`);
      }
      keyframes.set(key, body);
    });
  }
  root.walkAtRules("page", () => {
    if (isZto) errors.push(`${name}: @page kuralı kalmış`);
  });
  root.walkRules((rule) => {
    const parent = rule.parent;
    if (parent?.type === "atrule" && parent.name.endsWith("keyframes")) {
      return;
    }
    for (const selector of rule.selectors) {
      if (isZto) {
        checkedRules += 1;
        if (!SCOPED.test(selector)) {
          errors.push(`${name}: kapsam dışı seçici "${selector}"`);
        }
      } else if (ZTO_MARKERS.test(selector)) {
        errors.push(`${name}: ZTO seçicisi ZTO paketi dışında "${selector}"`);
      }
    }
  });
}

if (ztoFiles === 0) {
  errors.push("dist/assets içinde ZTO Finans CSS paketi bulunamadı (.zto-finans yok)");
}
if (errors.length > 0) {
  console.error(errors.slice(0, 50).join("\n"));
  console.error(`check:zto-css BAŞARISIZ — ${errors.length} sorun`);
  process.exit(1);
}
console.log(
  `check:zto-css tamam — ${files.length} CSS dosyası, ${ztoFiles} ZTO paketi, ${checkedRules} seçici .zto-finans kapsamında`,
);
