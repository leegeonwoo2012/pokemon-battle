// Selectable form and Gigantamax expansion from the pinned Showdown dex.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function read(path){const sandbox={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,sandbox);return sandbox.exports;}
function csv(path){return fs.readFileSync(path,'utf8').trim().split(/\r?\n/).slice(1).map(line=>[...line.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)].map(match=>match[1].replace(/^"|"$/g,'').replace(/""/g,'"')));}
const norm=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const {Pokedex}=read('work/regmc/data/pokedex.ts');
const {Learnsets}=read('work/regmc/data/learnsets.ts');
const championLearnsets=read('work/regmc/data/mods/champions/learnsets.ts').Learnsets;
const {Moves}=read('work/regmc/data/moves.ts');
const existing=new Set([...read('src/data/roster.generated.ts').roster,...read('src/data/legendary-roster.generated.ts').legendaryRoster,...read('src/data/signature-roster.generated.ts').signatureRoster].map(mon=>mon.id));
const gmaxIds=[...fs.readFileSync('src/data/gimmicks.ts','utf8').matchAll(/^  ([a-z]+):\{id:'gmax/gm)].map(match=>match[1]);
const wanted=[
  'kyuremblack','kyuremwhite','calyrexice','calyrexshadow',
  'amoonguss','dondozo','ferrothorn','clodsire','quagsire','dustox','beautifly',
  ...gmaxIds,
];
const ids=[...new Set(wanted)].filter(id=>!existing.has(id));
const names=Object.fromEntries(csv('work/upstream/pokemon_species_names.csv').filter(row=>row[1]==='3').map(row=>[Number(row[0]),row[2]]));
const pokemonIds=new Map(csv('work/regmc/pokemon.csv').map(row=>[norm(row[1]),Number(row[0])]));
const suffix={kyuremblack:'블랙',kyuremwhite:'화이트',calyrexice:'백마',calyrexshadow:'흑마'};
const color={normal:'#b3b9a5',fire:'#e77b58',water:'#69a6d8',grass:'#6fba88',electric:'#eed264',ice:'#8ccbd5',fighting:'#cb7e68',poison:'#ad86c6',ground:'#c4a172',flying:'#91b6ce',psychic:'#d987ab',bug:'#a0b95c',rock:'#b4a780',ghost:'#9787c1',dragon:'#838bd0',dark:'#89909c',steel:'#94b4c5',fairy:'#e0a5c5'};
const entries=ids.map(id=>{
  const p=Pokedex[id];if(!p)throw Error(`Unknown source species: ${id}`);
  const inherited=Learnsets[norm(p.baseSpecies??p.name)]?.learnset??{};
  const own=Learnsets[id]?.learnset??championLearnsets[id]?.learnset??{};
  const learnset=[...new Set([...Object.keys(inherited),...Object.keys(own)])].filter(moveId=>Moves[moveId]&&!['Future'].includes(Moves[moveId].isNonstandard));
  const spriteId=p.forme?pokemonIds.get(norm(p.name)):p.num;
  if(!names[p.num]||!spriteId||!learnset.length)throw Error(`Missing name, sprite, or moves: ${id}`);
  const type=p.types[0].toLowerCase();
  return {id,nationalDex:p.num,spriteId,name:names[p.num]+(suffix[id]?` (${suffix[id]})`:''),englishName:p.name,representativeType:type,
    types:p.types.map(value=>value.toLowerCase()),baseStats:p.baseStats,weightKg:p.weightkg,
    genderRatio:p.gender==='N'?{M:0,F:0}:p.gender==='M'?{M:1,F:0}:p.gender==='F'?{M:0,F:1}:p.genderRatio??{M:.5,F:.5},
    abilities:[...new Set(Object.values(p.abilities).map(norm))],learnset,color:color[type]};
});
fs.writeFileSync('src/data/expansion-roster.generated.ts',`// Generated from the pinned Pokémon Showdown Pokedex and learnsets.\nimport type { Species } from '../engine/types';\nexport const expansionRoster: Species[] = ${JSON.stringify(entries,null,2)};\n`);
fs.writeFileSync('docs/expansion-roster.json',JSON.stringify({showdownCommit:fs.readFileSync('work/regmc/COMMIT','utf8').trim(),requestedIds:wanted,addedIds:ids,gmaxSpecies:gmaxIds},null,2)+'\n');
console.log(JSON.stringify({added:ids.length,gmaxSpecies:gmaxIds.length,missingGmax:gmaxIds.filter(id=>!existing.has(id))},null,2));
