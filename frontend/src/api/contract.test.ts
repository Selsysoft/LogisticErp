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

interface Property {
  $ref?: string;
  type?: string;
  enum?: unknown[];
}

interface Schema {
  type?: string;
  enum?: unknown[];
  properties?: Record<string, Property>;
}

const schemas: Record<string, Schema> = JSON.parse(readFileSync(SPEC, "utf8")).components.schemas;

function sourceFiles(): string[] {
  const config = ts.readConfigFile(join(SRC, "../tsconfig.json"), ts.sys.readFile).config;
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, join(SRC, ".."));
  return parsed.fileNames.filter((file) => file.includes("/pages/") && !file.includes(".test."));
}

type Kind = "string" | "number" | "boolean" | "array" | "object";

interface ApiType {
  key: string;
  fields: string[];
  /** Alan adı -> kaba tip; birleşik veya belirsiz tipler (any, karışık) yer almaz. */
  kinds: Record<string, Kind>;
}

/** TypeScript tipini JSON'daki kaba karşılığına indirger; null/undefined birleşimden atılır. */
function kindOf(checker: ts.TypeChecker, type: ts.Type): Kind | undefined {
  const parts = (type.isUnion() ? type.types : [type]).filter(
    (part) => !(part.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)),
  );
  const kinds = new Set<Kind | undefined>(
    parts.map((part) => {
      if (part.flags & ts.TypeFlags.StringLike) return "string";
      if (part.flags & ts.TypeFlags.NumberLike) return "number";
      if (part.flags & ts.TypeFlags.BooleanLike) return "boolean";
      if (checker.isArrayType(part) || checker.isTupleType(part)) return "array";
      if (part.flags & ts.TypeFlags.Object) return "object";
      return undefined;
    }),
  );
  return kinds.size === 1 ? [...kinds][0] : undefined;
}

/** Şemadaki alanın kaba tipi; enum ve tarih metindir, başka şemaya bağlantı nesnedir. */
function schemaKind(property: Property): Kind | undefined {
  if (property.$ref) {
    const target = schemas[property.$ref.split("/").pop() ?? ""];
    return target?.enum || target?.type === "string" ? "string" : "object";
  }
  if (property.enum) return "string";
  switch (property.type) {
    case "string":
      return "string";
    case "integer":
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return "array";
    case "object":
      return "object";
    default:
      return undefined;
  }
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
      const properties = checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol));
      const kinds: Record<string, Kind> = {};
      for (const property of properties) {
        const kind = kindOf(checker, checker.getTypeOfSymbolAtLocation(property, node));
        if (kind) kinds[property.getName()] = kind;
      }
      result.push({
        key: `${module}/${node.name.text}`,
        fields: properties.map((property) => property.getName()),
        kinds,
      });
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

  it("frontend'in alan tipi backend'in gönderdiğiyle aynıdır", () => {
    const mismatched: string[] = [];
    for (const type of types) {
      if (LOCAL.has(type.key)) continue;
      const name = schemaFor(type.key);
      const properties = (name && schemas[name]?.properties) || {};
      for (const [field, kind] of Object.entries(type.kinds)) {
        const expected = properties[field] && schemaKind(properties[field]);
        if (expected && expected !== kind) {
          mismatched.push(`${type.key}.${field}: frontend ${kind}, backend ${expected}`);
        }
      }
    }
    expect(mismatched).toEqual([]);
  });
});
