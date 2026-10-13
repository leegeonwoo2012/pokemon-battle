const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function csvRows(path) {
  const lines = fs.readFileSync(path, 'utf8').trim().split(/\r?\n/);
  const parse = line => [...line.matchAll(/(?:^|,)("(?:[^\"]|"\")*"|[^,]*)/g)].map(match => match[1].replace(/^"|"$/g, '').replace(/""/g, '"'));
  return lines.slice(1).map(parse);
}

const generated = fs.readFileSync('src/data/roster.generated.ts', 'utf8');
const rosterText = generated.match(/export const roster: Species\[\] = ([\s\S]*?);\r?\nexport const importedAbilities/)[1];
const roster = JSON.parse(rosterText);
const source = fs.readFileSync('work/upstream/pokedex.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const sandbox = { exports: {} };
vm.runInNewContext(js, sandbox);
const pokedex = sandbox.exports.Pokedex;
const rows = csvRows('work/sprite-supplement/pokemon_species.csv');
const byId = new Map(rows.map(row => [Number(row[0]), { id: Number(row[0]), name: row[1], parent: row[3] ? Number(row[3]) : null, chain: Number(row[4]) }]));
const children = new Map();
for (const row of byId.values()) if (row.parent !== null) children.set(row.parent, [...(children.get(row.parent) ?? []), row.id]);
const descendants = id => [...(children.get(id) ?? [])].flatMap(child => [child, ...descendants(child)]);
const bst = id => {
  const data = pokedex[byId.get(id)?.name];
  return data?.baseStats ? Object.values(data.baseStats).reduce((sum, value) => sum + value, 0) : null;
};

const report = roster.flatMap(mon => {
  const row = byId.get(mon.nationalDex);
  if (!row) throw new Error(`Missing species CSV row for ${mon.id} #${mon.nationalDex}`);
  const later = descendants(row.id);
  if (!later.length) return [];
  const leaves = [...byId.values()].filter(candidate => candidate.chain === row.chain && !(children.get(candidate.id)?.length));
  return [{ current: mon.id, name: mon.name, representativeType: mon.representativeType, finals: leaves.map(candidate => ({ id: candidate.name, bst: bst(candidate.id), types: pokedex[candidate.name]?.types ?? [] })).sort((a, b) => (b.bst ?? 0) - (a.bst ?? 0)) }];
});

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
