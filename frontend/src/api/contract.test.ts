// @vitest-environment node
/// <reference types="node" />
/**
 * Sözleşme testi: elle yazılmış API tiplerinin her alanı backend'in OpenAPI şemasında
 * (docs/api/openapi.json) bulunmalıdır. Backend bir yanıt alanını yeniden adlandırır veya kaldırırsa
 * ekran sessizce "undefined" göstermek yerine bu test kırılır. Şema dosyası backend'deki
 * OpenApiContractIT ile güncel tutulur.
 */
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SPEC = resolve(SRC, "../../docs/api/openapi.json");

/** Adı şemadakinden farklı olan tipler: "modül/Tip" -> şema adı. */
const SCHEMA_OF: Record<string, string> = {
  "crm/StoredFile": "FileResponse",
  "crm/Dashboard": "CrmDashboardResponse",
  "finance/Invoice": "PurchaseInvoiceResponse",
  "finance/Rate": "ExchangeRateResponse",
  "integrations/StatementLine": "StatementLineResponse",
  "fleet/ComplianceDocument": "ComplianceDocumentResponse",
  "fleet/ResourceBlock": "BlockResponse",
  "fleet/AvailabilityRow": "AvailabilityResponse",
  "fleet/VehicleCost": "VehicleCostRow",
  "identity/PermissionInfo": "PermissionResponse",
  "identity/AuditEntry": "AuditLogResponse",
  "integrations/VehiclePosition": "PositionResponse",
  "integrations/StatementImportResult": "StatementImportResponse",
  "integrations/RouteDistance": "DistanceResponse",
  "operations/ShipmentEvent": "EventResponse",
  "operations/ShipmentDocument": "ShipmentDocumentResponse",
  "operations/FreightInvoice": "FreightInvoiceResponse",
  "operations/TripCost": "CostResponse",
  "reports/Dashboard": "ReportDashboardResponse",
  "saas/SaasInvoice": "SaasInvoiceResponse",
  "saas/Plan": "SaasPlanResponse",
  "saas/AuditRow": "AuditLogResponse",
  "saas/MailEventRow": "MailEventResponse",
  "warehouse/CountDetail": "CountResponse",
  "warehouse/Contract": "WarehouseContractResponse",
  "warehouse/Balance": "WarehouseBalanceResponse",
};

/** API yanıtı olmayan, yalnız ekranda kullanılan tipler. */
const LOCAL = new Set([
  "driver/QueuedOp",
  "driver/QueueStore",
  "driver/SyncResult",
  "finance/FieldDef",
  "finance/Column",
  "finance/Option",
  "finance/Page",
  "identity/Page",
]);

interface Schema {
  properties?: Record<string, unknown>;
}

const schemas: Record<string, Schema> = JSON.parse(readFileSync(SPEC, "utf8")).components.schemas;

function sourceFiles(): string[] {
  const config = ts.readConfigFile(join(SRC, "../tsconfig.json"), ts.sys.readFile).config;
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, join(SRC, ".."));
  return parsed.fileNames.filter((file) => file.includes("/pages/") && !file.includes(".test."));
}

interface ApiType {
  key: string;
  fields: string[];
}

function exportedInterfaces(): ApiType[] {
  const files = sourceFiles();
  const program = ts.createProgram(files, { strict: true, jsx: ts.JsxEmit.ReactJSX });
  const checker = program.getTypeChecker();
  const result: ApiType[] = [];
  for (const file of files) {
    const source = program.getSourceFile(file);
    if (!source) continue;
    const module = relative(join(SRC, "pages"), file).split(/[\\/]/)[0];
    source.forEachChild((node) => {
      const exported =
        ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export;
      if (!ts.isInterfaceDeclaration(node) || !exported) return;
      const symbol = checker.getSymbolAtLocation(node.name);
      if (!symbol) return;
      const fields = checker
        .getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol))
        .map((property) => property.getName());
      result.push({ key: `${module}/${node.name.text}`, fields });
    });
  }
  return result;
}

function schemaFor(key: string): string | undefined {
  if (SCHEMA_OF[key]) return SCHEMA_OF[key];
  const name = key.split("/")[1];
  return [name, `${name}Response`].find((candidate) => candidate in schemas);
}

describe("API sözleşmesi", () => {
  const types = exportedInterfaces();

  it("tipler bulunur", () => {
    expect(types.length).toBeGreaterThan(100);
  });

  it("her API tipinin şemada karşılığı vardır", () => {
    const missing = types
      .filter((type) => !LOCAL.has(type.key))
      .filter((type) => {
        const name = schemaFor(type.key);
        return !name || !(name in schemas);
      })
      .map((type) => type.key);
    // Yeni tip yerel ise LOCAL'e, adı farklıysa SCHEMA_OF'a eklenir.
    expect(missing).toEqual([]);
  });

  it("frontend'in okuduğu her alan backend yanıtında vardır", () => {
    const unknown: string[] = [];
    for (const type of types) {
      if (LOCAL.has(type.key)) continue;
      const name = schemaFor(type.key);
      const properties = (name && schemas[name]?.properties) || {};
      for (const field of type.fields) {
        if (!(field in properties)) {
          unknown.push(`${type.key}.${field} (${name})`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });
});
