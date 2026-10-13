const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const normalize = value => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const readTs = path => {
  const sandbox = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, sandbox);
  return sandbox.exports;
};
const { Pokedex } = readTs('work/upstream/pokedex.ts');
const { Learnsets } = readTs('work/upstream/learnsets.ts');
const { roster } = readTs('src/data/roster.generated.ts');
const existingDex = new Set(roster.map(mon => mon.nationalDex));
const speciesRows = fs.readFileSync('work/sprite-supplement/pokemon_species.csv', 'utf8').trim().split(/\r?\n/).slice(1);
const evolving = new Set(speciesRows.map(row => Number(row.split(',')[3])).filter(Boolean));
const core = fs.readFileSync('src/data/index.ts', 'utf8').replace(/^import .*(roster.generated|gimmicks).*;\r?\n/gm, '').split('const nationalDexById')[0].split('export const species:')[0];
const sandbox = { exports: {} };
vm.runInNewContext(ts.transpileModule(core, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, sandbox);
const moveIds = Object.keys(sandbox.exports.moves);
function learnset(id, seen = new Set()) {
  if (seen.has(id)) return {};
  seen.add(id);
  const prevo = Pokedex[id]?.prevo;
  return { ...(prevo ? learnset(normalize(prevo), seen) : {}), ...(Learnsets[id]?.learnset ?? {}) };
}
function stats(format) {
  const rows = fs.readFileSync(`work/upstream/${format}-2026-08-1695.txt`, 'utf8').split(/\r?\n/);
  const result = new Map();
  for (const row of rows) {
    const match = row.match(/^\|\s*(\d+)\s*\|\s*(.*?)\s*\|\s*([\d.]+)%/);
    if (match) result.set(normalize(match[2]), { rank: Number(match[1]), usage: Number(match[3]) });
  }
  return result;
}
const ou = stats('gen9ou'), doubles = stats('gen9doublesou');
const types = ['normal','fire','water','electric','grass','ice','fighting','poison','ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'];
for (const type of types) {
  const candidates = Object.entries(Pokedex).filter(([id, mon]) => mon.num > 0 && mon.num <= 1025 && !existingDex.has(mon.num) && !evolving.has(mon.num) && !mon.forme && mon.types?.some(value => value.toLowerCase() === type) && moveIds.filter(moveId => learnset(id)[moveId]).length >= 4)
    .map(([id, mon]) => ({ id, name: mon.name, dex: mon.num, types: mon.types, ou: ou.get(normalize(mon.name)), doubles: doubles.get(normalize(mon.name)) }))
    .sort((a, b) => Math.max(b.ou?.usage ?? 0, (b.doubles?.usage ?? 0) * .8) - Math.max(a.ou?.usage ?? 0, (a.doubles?.usage ?? 0) * .8));
  console.log(`${type}: ${candidates.slice(0, 25).map(mon => `${mon.id}#${mon.dex}(${mon.ou?.rank ?? '-'},${mon.doubles?.rank ?? '-'})`).join(' ')}`);
}
