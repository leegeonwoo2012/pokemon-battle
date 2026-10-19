// Mythical species from the pinned Showdown dex. Existing selectable species stay in their original roster.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function read(path){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports},{filename:path});return exports;}
function csv(path){return fs.readFileSync(path,'utf8').trim().split(/\r?\n/).slice(1).map(line=>[...line.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)].map(x=>x[1].replace(/^"|"$/g,'').replace(/""/g,'"')));}
const norm=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const {Pokedex}=read('work/regmc/data/pokedex.ts');
const {Learnsets}=read('work/regmc/data/learnsets.ts');
const championLearnsets=read('work/regmc/data/mods/champions/learnsets.ts').Learnsets;
const sourceMoves=read('work/regmc/data/moves.ts').Moves;
const existing=new Set([
  ...read('src/data/roster.generated.ts').roster,
  ...read('src/data/legendary-roster.generated.ts').legendaryRoster,
  ...read('src/data/signature-roster.generated.ts').signatureRoster,
  ...read('src/data/expansion-roster.generated.ts').expansionRoster,
].map(mon=>mon.id));
const supportedMoves=new Set([...Object.keys(read('src/data/champion-moves.generated.ts').championMoves),...[...fs.readFileSync('src/data/index.ts','utf8').matchAll(/move\('([^']+)'/g)].map(match=>match[1]),'spectralthief']);
const signatureMoves=new Set('doomdesire psychoboost heartswap darkvoid seedflare judgment vcreate searingshot secretsword relicsong technoblast diamondstorm hyperspacehole hyperspacefury steameruption fleurcannon spectralthief plasmafists doubleironbash junglehealing malignantchain'.split(' '));
const names=Object.fromEntries(csv('work/upstream/pokemon_species_names.csv').filter(row=>row[1]==='3').map(row=>[Number(row[0]),row[2]]));
const abilityNumbers=Object.fromEntries(csv('work/upstream/abilities.csv').map(row=>[norm(row[1]),row[0]]));
const abilityNames=Object.fromEntries(csv('work/upstream/ability_names.csv').filter(row=>row[1]==='3').map(row=>[row[0],row[2]]));
const abilityAliases=Object.fromEntries([...fs.readFileSync('src/data/index.ts','utf8').matchAll(/ability\('([^']+)'|abilities\.([a-zA-Z0-9]+)\s*=/g)].map(match=>{const id=match[1]??match[2];return [norm(id),id];}));
const originalAbilities=new Set(Object.keys(abilityAliases));
const importedAbilities={};
const color={normal:'#b3b9a5',fire:'#e77b58',water:'#69a6d8',grass:'#6fba88',electric:'#eed264',ice:'#8ccbd5',fighting:'#cb7e68',poison:'#ad86c6',ground:'#c4a172',flying:'#91b6ce',psychic:'#d987ab',bug:'#a0b95c',rock:'#b4a780',ghost:'#9787c1',dragon:'#838bd0',dark:'#89909c',steel:'#94b4c5',fairy:'#e0a5c5'};
const allIds=Object.keys(Pokedex).filter(id=>Pokedex[id].num>0&&!Pokedex[id].forme&&Pokedex[id].tags?.includes('Mythical'));
if(allIds.length!==23)throw Error(`Pinned mythical classification changed: ${allIds.length}`);
const entries=allIds.filter(id=>!existing.has(id)).map(id=>{
  const p=Pokedex[id];
  const known={...Learnsets[id]?.learnset,...championLearnsets[id]?.learnset};
  const learnset=Object.keys(known).filter(moveId=>sourceMoves[moveId]&&supportedMoves.has(moveId)&&(!['Past','Future'].includes(sourceMoves[moveId].isNonstandard)||signatureMoves.has(moveId)));
  const abilities=[...new Set(Object.values(p.abilities).map(value=>abilityAliases[norm(value)]??norm(value)))];
  for(const abilityId of abilities)if(!originalAbilities.has(norm(abilityId))&&!importedAbilities[abilityId])importedAbilities[abilityId]={id:abilityId,name:abilityNames[abilityNumbers[norm(abilityId)]]??abilityId,description:'환상 포켓몬의 특성입니다. 상세 효과가 구현되지 않은 경우 팀 편성 화면에 표시됩니다.',effects:[]};
  if(!names[p.num]||learnset.length<4)throw Error(`Missing name or supported learnset: ${id} (${learnset.length})`);
  const type=p.types[0].toLowerCase();
  const genderRatio=p.gender==='N'?{M:0,F:0}:p.gender==='M'?{M:1,F:0}:p.gender==='F'?{M:0,F:1}:p.genderRatio??{M:.5,F:.5};
  return {id,nationalDex:p.num,spriteId:p.num,name:names[p.num],englishName:p.name,representativeType:type,types:p.types.map(x=>x.toLowerCase()),baseStats:p.baseStats,weightKg:p.weightkg,genderRatio,abilities,learnset,color:color[type]};
});
fs.writeFileSync('src/data/mythical-roster.generated.ts',`// Generated from pinned Pokémon Showdown Mythical tags and supported learnsets.\nimport type {Species,Ability} from '../engine/types';\nexport const mythicalRoster:Species[]=${JSON.stringify(entries,null,2)};\nexport const mythicalAbilities:Record<string,Ability>=${JSON.stringify(importedAbilities,null,2)};\n`);
fs.writeFileSync('docs/mythical-roster.json',JSON.stringify({sourceCommit:fs.readFileSync('work/regmc/COMMIT','utf8').trim(),classification:'Showdown Mythical tag',allBaseSpecies:allIds,addedIds:entries.map(mon=>mon.id),dimensions:Object.fromEntries(allIds.map(id=>[id,{height:Pokedex[id].heightm,weight:Pokedex[id].weightkg}]))},null,2));
console.log({allMythicalBase:allIds.length,alreadySelectable:allIds.length-entries.length,added:entries.length});
