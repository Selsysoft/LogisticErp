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
  /** OpenAPI 3.1: null'lanabilir alan `type: ["string", "null"]` (12.2a §4.4). */
  type?: string | string[];
  enum?: unknown[];
  /** OpenAPI 3.1: null'lanabilir `$ref` `anyOf: [{$ref}, {type: "null"}]`. */
  anyOf?: Property[];
  oneOf?: Property[];
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
  // Yalnız src/pages altı: ZTO sayfaları (src/zto/finans/pages/…) API tipi tanımlamaz, tipleri
  // pages/finance/types.ts'ten alır (12.1 §5.0 #4).
  return parsed.fileNames.filter(
    (file) => file.includes("/src/pages/") && !file.includes(".test."),
  );
}

type Kind = "string" | "number" | "boolean" | "array" | "object";

interface ApiType {
  key: string;
  fields: string[];
  /** Alan adı -> kaba tip; birleşik veya belirsiz tipler (any, karışık) yer almaz. */
  kinds: Record<string, Kind>;
  /** `| null` ya da `?` taşıyan alanlar. */
  nullable: Set<string>;
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

/** `{type: "null"}` dalı mı (3.1 `anyOf`/`oneOf` içinde). */
function isNullBranch(property: Property): boolean {
  return (
    property.type === "null" ||
    (Array.isArray(property.type) && property.type.every((t) => t === "null"))
  );
}

/**
 * OpenAPI 3.1 biçimiyle null'lanabilir işaretli mi: `type` dizisi "null" içerir ya da `anyOf`/`oneOf`
 * dallarından biri `{type: "null"}` (12.2a §4.4, OK-12.2a-15; 3.1'de `nullable` anahtarı yazılmaz).
 */
function isMarkedNullable(property: Property): boolean {
  if (Array.isArray(property.type)) return property.type.includes("null");
  return [...(property.anyOf ?? []), ...(property.oneOf ?? [])].some(isNullBranch);
}

/** Şemadaki alanın kaba tipi; enum ve tarih metindir, başka şemaya bağlantı nesnedir. */
function schemaKind(property: Property): Kind | undefined {
  const branches = (property.anyOf ?? property.oneOf)?.filter((branch) => !isNullBranch(branch));
  if (branches) return branches.length === 1 ? schemaKind(branches[0]) : undefined;
  if (Array.isArray(property.type)) {
    const types = property.type.filter((t) => t !== "null");
    return types.length === 1 ? schemaKind({ ...property, type: types[0] }) : undefined;
  }
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
      const nullable = new Set<string>();
      for (const property of properties) {
        const type = checker.getTypeOfSymbolAtLocation(property, node);
        const kind = kindOf(checker, type);
        if (kind) kinds[property.getName()] = kind;
        const parts = type.isUnion() ? type.types : [type];
        if (
          property.flags & ts.SymbolFlags.Optional ||
          parts.some((part) => part.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined))
        ) {
          nullable.add(property.getName());
        }
      }
      result.push({
        key: `${module}/${node.name.text}`,
        fields: properties.map((property) => property.getName()),
        kinds,
        nullable,
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

/**
 * Şema alanları (12.2a §4.4, OK-12.2a-15): springdoc OpenAPI 3.1 üretir; yeni null'lanabilir yanıt
 * alanları `types = {…, "null"}` / `anyOf: [{$ref}, {type: "null"}]` ile işaretlenir (mevcut alanlar
 * işaretsiz kalır — opt-in). İşaretli her alan TS'de `| null` ya da `?` taşımalı; boş geçmeyi önlemek
 * için en az 25 işaretli alan beklenir (12.2a yeni alanları bunu aşar). B4 bitene kadar kırmızı
 * olabilir (§7).
 */
describe("API sözleşmesi: opt-in null'lanabilirlik ve ondalık metin (12.2a §4, §4.4)", () => {
  const types = exportedInterfaces();
  /** Şema adı -> o şemaya bağlanan TS arayüzleri. */
  const bySchema = new Map<string, ApiType[]>();
  for (const type of types) {
    if (LOCAL.has(type.key)) continue;
    const name = schemaFor(type.key);
    if (!name) continue;
    bySchema.set(name, [...(bySchema.get(name) ?? []), type]);
  }

  const marked: Array<[schema: string, field: string]> = Object.entries(schemas).flatMap(
    ([name, schema]) =>
      Object.entries(schema.properties ?? {})
        .filter(([, property]) => isMarkedNullable(property))
        .map(([field]) => [name, field] as [string, string]),
  );

  it("şemada null işaretli en az 25 alan var (alt sınır)", () => {
    expect(marked.length).toBeGreaterThanOrEqual(25);
  });

  it("null işaretli her alan TS arayüzünde | null ya da ? taşır", () => {
    const strict: string[] = [];
    for (const [schema, field] of marked) {
      for (const type of bySchema.get(schema) ?? []) {
        if (type.fields.includes(field) && !type.nullable.has(field)) {
          strict.push(`${type.key}.${field} (${schema})`);
        }
      }
    }
    expect(strict).toEqual([]);
  });

  it("işaret biçimleri: type dizisi ve anyOf/oneOf null dalı tanınır, kaba tip korunur", () => {
    expect(isMarkedNullable({ type: ["string", "null"] })).toBe(true);
    expect(
      isMarkedNullable({ anyOf: [{ $ref: "#/components/schemas/Money" }, { type: "null" }] }),
    ).toBe(true);
    expect(isMarkedNullable({ oneOf: [{ type: "integer" }, { type: ["null"] }] })).toBe(true);
    expect(isMarkedNullable({ type: "string" })).toBe(false);
    expect(isMarkedNullable({ anyOf: [{ type: "string" }, { type: "integer" }] })).toBe(false);
    expect(schemaKind({ type: ["string", "null"] })).toBe("string");
    expect(schemaKind({ type: ["integer", "null"] })).toBe("number");
    expect(schemaKind({ type: ["string", "integer"] })).toBeUndefined();
    expect(schemaKind({ anyOf: [{ type: "boolean" }, { type: "null" }] })).toBe("boolean");
    expect(schemaKind({ anyOf: [{ type: "string" }, { type: "integer" }] })).toBeUndefined();
  });

  /**
   * Para alanları JSON'da ondalık metin (Rev 1 F-5/SEC-04): `Money.amount` ve §4'ün "decimal"
   * alanları şemada `type: string`, TS'de `string`. Kur/TL karşılığı number kalır (kapsam dışı).
   */
  const DECIMAL_FIELDS: Array<[tsKey: string, field: string]> = [
    ["finance/Money", "amount"],
    ["finance/OpenInvoice", "total"],
    ["finance/OpenInvoice", "allocated"],
    ["finance/OpenInvoice", "remaining"],
    ["finance/SettlementListItem", "fxUsed"],
    ["finance/SettlementListItem", "fxRemaining"],
    ["finance/DailyFundBalance", "balanceAtDate"],
    ["finance/DailyFundBalance", "balanceNow"],
    ["finance/DailyInstrumentMovement", "total"],
  ];

  it("Money ve ondalık para alanları TS'de string", () => {
    const wrong = DECIMAL_FIELDS.filter(([key, field]) => {
      const type = types.find((t) => t.key === key);
      return !type || type.kinds[field] !== "string";
    }).map(([key, field]) => `${key}.${field}`);
    expect(wrong).toEqual([]);
  });

  it("Money ve ondalık para alanları şemada type: string", () => {
    const wrong = DECIMAL_FIELDS.flatMap(([key, field]) => {
      const name = schemaFor(key);
      const property = name ? schemas[name]?.properties?.[field] : undefined;
      const kind = property && schemaKind(property);
      return kind === "string"
        ? []
        : [`${key}.${field} (${name ?? "şema yok"}: ${kind ?? "alan yok"})`];
    });
    expect(wrong).toEqual([]);
  });
});
