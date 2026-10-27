import fs from 'node:fs';
import path from 'node:path';
import ts from '../node_modules/typescript/lib/typescript.js';

const root = process.cwd();
const srcRoot = path.join(root, 'backend', 'src');
const indexPath = path.join(srcRoot, 'routes', 'index.ts');

const read = (file) => fs.readFileSync(file, 'utf8');
const parse = (file) => ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const sourceText = (node, sf) => node.getText(sf);
const stripJs = (specifier) => specifier.replace(/\.js$/, '.ts');
const resolveImport = (fromFile, specifier) => path.resolve(path.dirname(fromFile), stripJs(specifier));
const joinUrl = (...parts) => {
  const value = parts.filter(Boolean).join('/').replace(/\/{2,}/g, '/');
  return value === '' ? '/' : (value.startsWith('/') ? value : `/${value}`);
};

function importsFor(file, sf) {
  const imports = new Map();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const clause = stmt.importClause;
    if (!clause) continue;
    const target = resolveImport(file, stmt.moduleSpecifier.text);
    if (clause.name) imports.set(clause.name.text, { imported: 'default', file: target });
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const item of bindings.elements) {
        imports.set(item.name.text, { imported: item.propertyName?.text ?? item.name.text, file: target });
      }
    }
  }
  return imports;
}

function routerMounts() {
  const sf = parse(indexPath);
  const imports = importsFor(indexPath, sf);
  const mounts = [];
  function walk(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const obj = node.expression.expression;
      const method = node.expression.name.text;
      if (ts.isIdentifier(obj) && obj.text === 'apiRouter' && method === 'use') {
        const args = node.arguments;
        if (args.length >= 2 && ts.isStringLiteralLike(args[0]) && ts.isIdentifier(args[1])) {
          const imp = imports.get(args[1].text);
          if (imp) mounts.push({ prefix: args[0].text, router: args[1].text, file: imp.file });
        }
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(sf);
  return mounts;
}

function responseCalls(target, sf) {
  if (!target) return [];
  const out = [];
  function walk(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (method === 'json' || method === 'send' || method === 'sendStatus') {
        let status = '200';
        const receiver = node.expression.expression;
        if (ts.isCallExpression(receiver) && ts.isPropertyAccessExpression(receiver.expression) && receiver.expression.name.text === 'status') {
          status = receiver.arguments[0] ? sourceText(receiver.arguments[0], sf) : '?';
        }
        out.push({ status, method, body: node.arguments[0] ? sourceText(node.arguments[0], sf) : '', line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1 });
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(target);
  return out;
}

function collectRoutes(file, routerName) {
  const sf = parse(file);
  const imports = importsFor(file, sf);
  const globalMiddleware = [];
  const routes = [];
  function walk(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const obj = node.expression.expression;
      const method = node.expression.name.text.toLowerCase();
      if (ts.isIdentifier(obj) && obj.text === routerName) {
        const args = [...node.arguments];
        if (method === 'use' && args.length >= 1 && !ts.isStringLiteralLike(args[0])) {
          globalMiddleware.push(...args.map((a) => sourceText(a, sf)));
        }
        if (['get','post','put','patch','delete'].includes(method) && args.length >= 2 && ts.isStringLiteralLike(args[0])) {
          const routePath = args[0].text;
          const handlerArg = args.at(-1);
          const handlerText = sourceText(handlerArg, sf);
          let handlerImport = null;
          if (ts.isIdentifier(handlerArg)) handlerImport = imports.get(handlerArg.text) ?? null;
          else if (ts.isCallExpression(handlerArg) && handlerArg.arguments.length && ts.isIdentifier(handlerArg.arguments[0])) {
            handlerImport = imports.get(handlerArg.arguments[0].text) ?? null;
          }
          const requestSchemas = {};
          for (const arg of args.slice(1, -1)) {
            const middlewareText = sourceText(arg, sf);
            for (const part of ['body', 'query', 'params']) {
              const match = middlewareText.match(new RegExp(`${part}\\s*:\\s*([A-Za-z_$][\\w$]*)`));
              if (!match) continue;
              const schemaImport = imports.get(match[1]);
              requestSchemas[part] = {
                name: match[1],
                file: schemaImport
                  ? path.relative(root, schemaImport.file).replaceAll('\\\\','/')
                  : path.relative(root, file).replaceAll('\\\\','/'),
              };
            }
          }
          routes.push({
            method: method.toUpperCase(),
            path: routePath,
            middleware: [...globalMiddleware, ...args.slice(1, -1).map((a) => sourceText(a, sf))],
            handler: handlerText,
            handlerImport,
            inlineResponses: responseCalls(handlerArg, sf),
            requestSchemas,
            routeFile: path.relative(root, file).replaceAll('\\','/'),
            line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
          });
        }
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(sf);
  return routes;
}

function controllerResponses(file, exportName) {
  if (!file || !fs.existsSync(file)) return [];
  const sf = parse(file);
  let target = null;
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name?.text === exportName) target = stmt;
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === exportName) target = decl.initializer;
      }
    }
  }
  if (!target) return [];
  return responseCalls(target, sf);
}

const endpoints = [];
for (const mount of routerMounts()) {
  for (const route of collectRoutes(mount.file, mount.router)) {
    let response = [];
    if (route.handlerImport) response = controllerResponses(route.handlerImport.file, route.handlerImport.imported);
    else response = route.inlineResponses;
    endpoints.push({
      ...route,
      mount: mount.prefix,
      fullPath: joinUrl('/api/v1', mount.prefix, route.path),
      response,
      controllerFile: route.handlerImport ? path.relative(root, route.handlerImport.file).replaceAll('\\','/') : null,
      controller: route.handlerImport?.imported ?? null,
    });
  }
}

endpoints.push({
  method: 'GET', fullPath: '/', path: '/', mount: '/', routeFile: 'backend/src/app.ts', line: 34,
  middleware: [], handler: 'inline', controllerFile: 'backend/src/app.ts', controller: null,
  response: [{ status: '200', method: 'json', body: '{ success: true, message: "Sensible CRM API is running", health: "/api/v1/health" }', line: 35 }],
});

endpoints.sort((a,b) => a.fullPath.localeCompare(b.fullPath) || a.method.localeCompare(b.method));
fs.mkdirSync(path.join(root, '.codex-work'), { recursive: true });
fs.writeFileSync(path.join(root, '.codex-work', 'api-inventory.json'), JSON.stringify(endpoints, null, 2));
const byMethod = Object.fromEntries(Object.entries(Object.groupBy(endpoints, (x) => x.method)).map(([key, value]) => [key, value.length]));
console.log(JSON.stringify({ count: endpoints.length, byMethod, missingResponses: endpoints.filter((x) => x.response.length === 0).map((x) => `${x.method} ${x.fullPath}`) }, null, 2));
