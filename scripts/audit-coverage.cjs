// Reports data coverage separately from battle-effect coverage. This does not
// treat a named ability or a legal learnset entry as a working effect.
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const directAbilityHooks = require('./ability-hook-ids.cjs');

function readTs(path) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(code, { exports });
  return exports;
}

const { roster, importedAbilities } = readTs('src/data/roster.generated.ts');
const { legendaryRoster = [], legendaryAbilities = {} } = readTs('src/data/legendary-roster.generated.ts');
const { signatureRoster = [] } = readTs('src/data/signature-roster.generated.ts');
const completeRoster = [...new Map([...roster, ...legendaryRoster, ...signatureRoster].map(pokemon => [pokemon.id, pokemon])).values()];
const { megaForms } = readTs('src/data/gimmicks.generated.ts');
const { championMoves } = readTs('src/data/champion-moves.generated.ts');
const source = fs.readFileSync('src/data/index.ts', 'utf8');
const definedMoves = new Set([...source.matchAll(/move\('([^']+)'/g)].map((match) => match[1]));
for (const id of Object.keys(championMoves)) definedMoves.add(id);
const sourceFile = ts.createSourceFile('src/data/index.ts', source, ts.ScriptTarget.Latest, true);
const implementedAbilities = new Set(Object.entries(importedAbilities)
  .filter(([, definition]) => definition.effects?.length > 0).map(([id]) => id));
for (const [id, definition] of Object.entries(legendaryAbilities)) if (definition.effects?.length > 0) implementedAbilities.add(id);
function visit(node) {
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'ability'
    && node.arguments.length >= 4 && ts.isStringLiteral(node.arguments[0])
    && ts.isArrayLiteralExpression(node.arguments[3]) && node.arguments[3].elements.length > 0) {
    implementedAbilities.add(node.arguments[0].text);
  }
  ts.forEachChild(node, visit);
}
visit(sourceFile);
// These are implemented in battle/turn handlers without a PassiveEffect record.
for (const id of directAbilityHooks) implementedAbilities.add(id);
const abilityUse = new Map();
for (const pokemon of completeRoster) {
  for (const id of pokemon.abilities) abilityUse.set(id, (abilityUse.get(id) ?? 0) + 1);
}
const notApplicableTrainerAbilities = new Set(['runaway']);
const unsupported = [...abilityUse.entries()]
  .filter(([id]) => !implementedAbilities.has(id) && !notApplicableTrainerAbilities.has(id))
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const missingMoves = new Set(completeRoster.flatMap((pokemon) => pokemon.learnset).filter((id) => !definedMoves.has(id)));
console.log(JSON.stringify({
  species: completeRoster.length,
  uniqueRosterAbilities: abilityUse.size,
  implementedRosterAbilities: abilityUse.size - unsupported.length - [...abilityUse.keys()].filter(id => notApplicableTrainerAbilities.has(id)).length,
  notApplicableTrainerAbilities: [...abilityUse.entries()].filter(([id]) => notApplicableTrainerAbilities.has(id)).map(([id, users]) => ({ id, users, reason: 'Wild-battle escape has no trigger in CPU/friendly trainer battles.' })),
  unsupportedAbilityCount: unsupported.length,
  unsupportedAbilities: unsupported.map(([id, users]) => ({ id, users })),
  unsupportedMegaAbilities: [...new Set(megaForms.map(form => form.abilityId).filter(id => !implementedAbilities.has(id)))],
  implementedMoves: definedMoves.size,
  championLearnsetMoves: Object.keys(championMoves).length,
  learnsetReferencesWithoutMoveDefinition: [...missingMoves],
}, null, 2));
