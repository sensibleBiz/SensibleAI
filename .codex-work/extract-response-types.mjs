import fs from 'node:fs';
import path from 'node:path';
import ts from '../node_modules/typescript/lib/typescript.js';

const root = process.cwd();
const configPath = path.join(root, 'backend', 'tsconfig.json');
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
const checker = program.getTypeChecker();
const inventoryPath = path.join(root, '.codex-work', 'api-inventory.json');
const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));

const normalize = (value) => value.replaceAll('\\', '/').toLowerCase();
const sourceMap = new Map(program.getSourceFiles().map((sf) => [normalize(path.relative(root, sf.fileName)), sf]));

function findResponseCall(sf, lineNumber) {
  let found = null;
  function walk(node) {
    if (found) return;
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      if (line === lineNumber && ['json', 'send', 'sendStatus'].includes(method)) {
        found = node;
        return;
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(sf);
  return found;
}

for (const endpoint of inventory) {
  const responseFile = endpoint.controllerFile || endpoint.routeFile;
  const sf = sourceMap.get(normalize(responseFile));
  for (const response of endpoint.response) {
    if (!sf) { response.bodyType = null; continue; }
    const call = findResponseCall(sf, response.line);
    if (!call?.arguments?.[0]) { response.bodyType = null; continue; }
    const type = checker.getTypeAtLocation(call.arguments[0]);
    response.bodyType = checker.typeToString(
      type,
      call.arguments[0],
      ts.TypeFormatFlags.NoTruncation |
        ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
        ts.TypeFormatFlags.MultilineObjectLiterals,
    );
  }
}

fs.writeFileSync(inventoryPath, JSON.stringify(inventory, null, 2));
const types = [...new Set(inventory.flatMap((e) => e.response.map((r) => r.bodyType)).filter(Boolean))];
console.log(JSON.stringify({ endpoints: inventory.length, responseTypes: types.length, sample: types.slice(0, 25) }, null, 2));
