// Reproducible roster import. Source snapshots and licenses are recorded in docs/data-sources.json.
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
function moduleData(path) {
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = { exports: {} };
  vm.runInNewContext(code, sandbox, { filename: path });
  return sandbox.exports;
}
function csv(path) {
  return fs.readFileSync(path, 'utf8').trim().split(/\r?\n/).slice(1).map(line => [...line.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)].map(x => x[1].replace(/^"|"$/g, '').replace(/""/g, '"')));
}
const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const groups = {
  normal: 'snorlax blissey chansey tauros kangaskhan eevee porygon2 porygonz slaking miltank',
  fire: 'charizard arcanine ninetales typhlosion blaziken infernape emboar darmanitan chandelure magmortar',
  water: 'blastoise gyarados milotic vaporeon feraligatr swampert empoleon samurott suicune starmie',
  electric: 'pikachu raichu jolteon ampharos luxray electivire zebstrika galvantula eelektross raikou',
  grass: 'venusaur meganium sceptile torterra serperior tangrowth leafeon roserade ludicolo ferrothorn',
  ice: 'lapras dewgong cloyster jynx articuno glalie walrein mamoswine glaceon froslass',
  fighting: 'lucario machamp primeape hitmonlee hitmonchan hitmontop hariyama medicham conkeldurr mienshao',
  poison: 'nidoking nidoqueen crobat muk weezing tentacruel toxicroak drapion scolipede garbodor',
  ground: 'excadrill sandslash dugtrio marowak donphan flygon hippowdon quagsire gliscor golurk',
  flying: 'pidgeot fearow dodrio noctowl xatu honchkrow staraptor braviary mandibuzz archeops',
  psychic: 'alakazam espeon slowbro slowking hypno mew reuniclus gothitelle musharna metagross',
  bug: 'scizor butterfree beedrill pinsir heracross forretress shuckle yanmega leavanny volcarona',
  rock: 'tyranitar golem rhydon rhyperior omastar kabutops aerodactyl aggron gigalith crustle',
  ghost: 'gengar misdreavus mismagius banette dusclops dusknoir cofagrigus drifblim spiritomb sableye',
  dragon: 'dragonite garchomp salamence haxorus hydreigon kingdra druddigon altaria latias latios',
  dark: 'umbreon houndoom absol weavile bisharp krookodile scrafty zoroark sharpedo mightyena',
  steel: 'steelix magnezone skarmory mawile bronzong registeel klinklang escavalier durant bastiodon',
  fairy: 'gardevoir togekiss clefable clefairy wigglytuff granbull azumarill sylveon florges aromatisse',
};
const { Pokedex } = moduleData('work/upstream/pokedex.ts');
const { Learnsets } = moduleData('work/upstream/learnsets.ts');
const speciesNames = Object.fromEntries(csv('work/upstream/pokemon_species_names.csv').filter(x => x[1] === '3').map(x => [Number(x[0]), x[2]]));
const abilityNumbers = Object.fromEntries(csv('work/upstream/abilities.csv').map(x => [normalize(x[1]), x[0]]));
const abilityNames = Object.fromEntries(csv('work/upstream/ability_names.csv').filter(x => x[1] === '3').map(x => [x[0], x[2]]));
const source = fs.readFileSync('src/data/index.ts', 'utf8');
// Import only the hand-authored engine move/passive definitions, before roster imports.
const core = source.replace(/^import .*roster.generated.*;\r?\n/gm, '').split('const nationalDexById')[0].split('export const species:')[0];
const coreSandbox = { exports: {} };
vm.runInNewContext(ts.transpileModule(core, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, coreSandbox);
const { moves, abilities } = coreSandbox.exports;
const abilityAlias = Object.fromEntries(Object.keys(abilities).map(id => [normalize(id), id]));
const extraAbilities = {};
const evidence = {};
function learnset(id, visited = new Set()) {
  if (visited.has(id)) return {};
  visited.add(id);
  const entry = Pokedex[id];
  return { ...(entry?.prevo ? learnset(normalize(entry.prevo), visited) : {}), ...(Learnsets[id]?.learnset ?? {}) };
}
const colors = { fire:'#e77b58', water:'#69a6d8', grass:'#6fba88', electric:'#eed264', ice:'#8ccbd5', fighting:'#cb7e68', poison:'#ad86c6', ground:'#c4a172', flying:'#91b6ce', psychic:'#d987ab', bug:'#a0b95c', rock:'#b4a780', ghost:'#9787c1', dragon:'#838bd0', dark:'#89909c', steel:'#94b4c5', fairy:'#e0a5c5', normal:'#b3b9a5' };
const roster = Object.entries(groups).flatMap(([representativeType, ids]) => ids.split(' ').map(id => {
  const entry = Pokedex[id];
  if (!entry || !entry.types.map(x=>x.toLowerCase()).includes(representativeType)) throw Error(`Bad representative: ${id}`);
  const known = learnset(id);
  const available = Object.keys(moves).filter(moveId => known[moveId]);
  if (available.length < 4) throw Error(`Insufficient implemented legal moves: ${id} ${available}`);
  const possible = [...new Set(Object.values(entry.abilities))].map(name => {
    const key = normalize(name); const abilityId = abilityAlias[key] ?? key;
    if (!abilities[abilityId]) extraAbilities[abilityId] = { id:abilityId, name:abilityNames[abilityNumbers[key]] ?? name, description:'실제 종의 특성입니다. 이 규칙 버전에서는 효과 미지원.', effects:[] };
    return abilityId;
  });
  evidence[id] = { nationalDex:entry.num, types:entry.types, stats:entry.baseStats, abilities:Object.values(entry.abilities), learnsetSources:Object.fromEntries(available.map(moveId => [moveId,known[moveId]])) };
  return { id, nationalDex:entry.num, name:speciesNames[entry.num], englishName:entry.name, representativeType, types:entry.types.map(x=>x.toLowerCase()), baseStats:entry.baseStats, abilities:possible, learnset:available, color:colors[representativeType] };
}));
if (roster.length!==180 || new Set(roster.map(x=>x.nationalDex)).size!==180 || roster.some(x=>!x.name)) throw Error('Invalid roster count/names');
fs.writeFileSync('src/data/roster.generated.ts', `// Generated by scripts/generate-roster.cjs. See docs/data-sources.json and THIRD_PARTY_NOTICES.md.\nimport type { Species, Ability } from '../engine/types';\nexport const roster: Species[] = ${JSON.stringify(roster,null,2)};\nexport const importedAbilities: Record<string,Ability> = ${JSON.stringify(extraAbilities,null,2)};\n`);
fs.mkdirSync('docs',{recursive:true});
fs.writeFileSync('docs/roster-evidence.json',JSON.stringify(evidence,null,2));
fs.writeFileSync('docs/data-sources.json', JSON.stringify({ generated:new Date().toISOString(), rules:'National Dex cross-generation union of supported moves; not official Champions legality', sources:fs.readdirSync('work/upstream').map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync('work/upstream/'+file)).digest('hex')})), groups },null,2));
console.log(JSON.stringify({species:roster.length,categories:Object.fromEntries(Object.keys(groups).map(type=>[type,roster.filter(x=>x.representativeType===type).length])),abilities:Object.keys(extraAbilities).length,minMoves:Math.min(...roster.map(x=>x.learnset.length))},null,2));
