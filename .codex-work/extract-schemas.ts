import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

type Desc = {
  type: string;
  optional?: boolean;
  nullable?: boolean;
  default?: unknown;
  constraints?: string[];
  enum?: unknown[];
  fields?: Record<string, Desc>;
  item?: Desc;
  options?: Desc[];
};

const root = process.cwd();
const inventory = JSON.parse(fs.readFileSync(path.join(root, '.codex-work', 'api-inventory.json'), 'utf8')) as any[];
const schemaRefs = new Map<string, { name: string; file: string }>();
for (const endpoint of inventory) {
  for (const schema of Object.values(endpoint.requestSchemas ?? {}) as any[]) {
    schemaRefs.set(`${schema.file}#${schema.name}`, schema);
  }
}

const defaultValue = (value: unknown) => {
  try { return typeof value === 'function' ? (value as () => unknown)() : value; }
  catch { return '<computed>'; }
};

function describe(schema: any, depth = 0): Desc {
  if (!schema || depth > 10) return { type: 'unknown' };
  const def = schema._def ?? {};
  const typeName = def.typeName ?? schema.constructor?.name ?? 'Unknown';
  if (typeName === 'ZodOptional') return { ...describe(def.innerType, depth + 1), optional: true };
  if (typeName === 'ZodNullable') return { ...describe(def.innerType, depth + 1), nullable: true };
  if (typeName === 'ZodDefault') return { ...describe(def.innerType, depth + 1), optional: true, default: defaultValue(def.defaultValue) };
  if (typeName === 'ZodEffects') return describe(def.schema, depth + 1);
  if (typeName === 'ZodPipeline') return describe(def.out, depth + 1);
  if (typeName === 'ZodBranded' || typeName === 'ZodReadonly' || typeName === 'ZodCatch') return describe(def.type ?? def.innerType, depth + 1);
  if (typeName === 'ZodObject') {
    const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
    const fields: Record<string, Desc> = {};
    for (const [key, value] of Object.entries(shape ?? {})) fields[key] = describe(value, depth + 1);
    return { type: 'object', fields, constraints: def.unknownKeys === 'strict' ? ['no unknown fields'] : undefined };
  }
  if (typeName === 'ZodArray') {
    const constraints: string[] = [];
    if (def.minLength?.value !== undefined) constraints.push(`minItems ${def.minLength.value}`);
    if (def.maxLength?.value !== undefined) constraints.push(`maxItems ${def.maxLength.value}`);
    return { type: 'array', item: describe(def.type, depth + 1), constraints };
  }
  if (typeName === 'ZodString') {
    const constraints: string[] = [];
    for (const check of def.checks ?? []) {
      if (check.kind === 'min') constraints.push(`minLength ${check.value}`);
      else if (check.kind === 'max') constraints.push(`maxLength ${check.value}`);
      else if (check.kind === 'email') constraints.push('email');
      else if (check.kind === 'url') constraints.push('URL');
      else if (check.kind === 'uuid') constraints.push('UUID');
      else if (check.kind === 'datetime') constraints.push('ISO date-time');
      else if (check.kind === 'regex') constraints.push(`pattern ${String(check.regex)}`);
      else if (check.kind) constraints.push(check.kind);
    }
    return { type: 'string', constraints };
  }
  if (typeName === 'ZodNumber') {
    const constraints: string[] = [];
    for (const check of def.checks ?? []) {
      if (check.kind === 'int') constraints.push('integer');
      else if (check.kind === 'min') constraints.push(`${check.inclusive === false ? '>' : '>='} ${check.value}`);
      else if (check.kind === 'max') constraints.push(`${check.inclusive === false ? '<' : '<='} ${check.value}`);
      else if (check.kind) constraints.push(check.kind);
    }
    if (def.coerce) constraints.push('coerced');
    return { type: 'number', constraints };
  }
  if (typeName === 'ZodBoolean') return { type: 'boolean', constraints: def.coerce ? ['coerced'] : undefined };
  if (typeName === 'ZodDate') return { type: 'date' };
  if (typeName === 'ZodLiteral') return { type: 'literal', enum: [def.value] };
  if (typeName === 'ZodEnum') return { type: 'enum', enum: [...(def.values ?? [])] };
  if (typeName === 'ZodNativeEnum') return { type: 'enum', enum: [...new Set(Object.values(def.values ?? {}).filter((x) => typeof x === 'string'))] };
  if (typeName === 'ZodUnion' || typeName === 'ZodDiscriminatedUnion') {
    const options = Array.isArray(def.options) ? def.options : [...(def.options?.values?.() ?? [])];
    return { type: 'union', options: options.map((x: any) => describe(x, depth + 1)) };
  }
  if (typeName === 'ZodRecord') return { type: 'record', item: describe(def.valueType, depth + 1) };
  if (typeName === 'ZodAny') return { type: 'any' };
  if (typeName === 'ZodUnknown') return { type: 'unknown' };
  if (typeName === 'ZodNull') return { type: 'null' };
  if (typeName === 'ZodNever') return { type: 'never' };
  if (typeName === 'ZodTuple') return { type: 'tuple', options: (def.items ?? []).map((x: any) => describe(x, depth + 1)) };
  if (typeName === 'ZodIntersection') return { type: 'intersection', options: [describe(def.left, depth + 1), describe(def.right, depth + 1)] };
  return { type: typeName.replace(/^Zod/, '').toLowerCase() };
}

const output: Record<string, any> = {};
for (const [key, ref] of schemaRefs) {
  const file = path.resolve(root, ref.file);
  try {
    const module = await import(pathToFileURL(file).href);
    const schema = module[ref.name];
    output[key] = schema ? describe(schema) : { error: 'not exported' };
  } catch (error) {
    output[key] = { error: error instanceof Error ? error.message : String(error) };
  }
}

// The assistant schema is local to its router file rather than exported.
for (const [key, value] of Object.entries(output)) {
  if (key.endsWith('#crmAssistantRequestSchema') && (value as any).error) {
    output[key] = {
      type: 'object', constraints: ['no unknown fields'], fields: {
        outletId: { type: 'string', constraints: ['minLength 1', 'maxLength 128'] },
        message: { type: 'string', constraints: ['minLength 1', 'maxLength 4000'] },
        history: { type: 'array', constraints: ['maxItems 8'], item: { type: 'object', fields: {
          role: { type: 'enum', enum: ['user', 'assistant'] },
          content: { type: 'string', constraints: ['maxLength 2000'] },
        } } },
      },
    };
  }
}

fs.writeFileSync(path.join(root, '.codex-work', 'api-schemas.json'), JSON.stringify(output, null, 2));
console.log(JSON.stringify({ schemas: Object.keys(output).length, errors: Object.entries(output).filter(([,v]: any) => v.error).map(([k,v]: any) => ({ key:k,error:v.error })) }, null, 2));
