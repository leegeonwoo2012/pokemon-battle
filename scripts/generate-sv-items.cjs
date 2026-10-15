// Auditable list of in-battle held items available in the pinned Generation 9 dex.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const sandbox={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('work/regmc/data/items.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,sandbox);
const norm=value=>String(value??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const hasCsv=fs.existsSync('work/upstream/items.csv')&&fs.existsSync('work/upstream/item_names.csv');
const itemIds=new Map(hasCsv?fs.readFileSync('work/upstream/items.csv','utf8').trim().split(/\r?\n/).slice(1).map(line=>{const [id,identifier]=line.split(',');return [norm(identifier),Number(id)];}):[]);
const koNames=new Map(hasCsv?fs.readFileSync('work/upstream/item_names.csv','utf8').trim().split(/\r?\n/).slice(1).map(line=>{const [id,language,...name]=line.split(',');return language==='3'?[Number(id),name.join(',').replace(/^"|"$/g,'')]:null;}).filter(Boolean):[]);
const pinnedNames=new Map(fs.existsSync('docs/sv-held-items.json')?JSON.parse(fs.readFileSync('docs/sv-held-items.json','utf8')).items.map(item=>[item.id,item.name]):[]);
const outsideOnly=new Set(['pomegberry','kelpsyberry','qualotberry','hondewberry','grepaberry','tamatoberry']);
const markerOnly=['bindingband','blunderpolicy','damprock','gripclaw','heatrock','heavydutyboots','icyrock','lightclay','protectivepads','smoothrock','terrainextender','rarebone'];
const rows=Object.entries(sandbox.exports.Items).filter(([id,item])=>!item.isNonstandard&&!outsideOnly.has(id)&&(item.isBerry||Object.keys(item).some(key=>key.startsWith('on'))||markerOnly.includes(id)))
  .map(([id,item])=>({id,name:koNames.get(itemIds.get(id))??pinnedNames.get(id)??item.name,englishName:item.name,callbacks:Object.keys(item).filter(key=>key.startsWith('on')),berry:!!item.isBerry,gen:item.gen??1}))
  .sort((a,b)=>a.id.localeCompare(b.id));
fs.writeFileSync('src/data/sv-items.generated.ts',`// Source: pinned Pokémon Showdown Generation 9 items and PokéAPI Korean item names.\nimport type { Item } from '../engine/types';\nexport const svItemCatalog: Record<string,Item> = Object.fromEntries((${JSON.stringify(rows.map(({id,name})=>({id,name,description:'도구의 배틀 효과를 준비 중입니다.',effects:[],supported:false})),null,2)} as Item[]).map(item=>[item.id,item]));\n`);
const pokemonSandbox={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('work/regmc/data/pokedex.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,pokemonSandbox);
const evolvable=Object.entries(pokemonSandbox.exports.Pokedex).filter(([,pokemon])=>pokemon.evos?.length).map(([id])=>id);
fs.appendFileSync('src/data/sv-items.generated.ts',`export const evolvableSpeciesIds = new Set<string>(${JSON.stringify(evolvable)});\n`);
fs.writeFileSync('docs/sv-held-items.json',JSON.stringify({showdownCommit:fs.readFileSync('work/regmc/COMMIT','utf8').trim(),nameSource:'https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv',selection:'Generation 9 standard held items with battle callbacks or battle-relevant marker',items:rows},null,2)+'\n');
console.log(JSON.stringify({battleHeldItems:rows.length,localized:rows.filter(row=>row.name!==row.englishName).length}));
