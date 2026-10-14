// Additional generation 1-9 legendary roster from the pinned Showdown dex.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function read(path){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports},{filename:path});return exports;}
function csv(path){return fs.readFileSync(path,'utf8').trim().split(/\r?\n/).slice(1).map(line=>[...line.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)].map(x=>x[1].replace(/^"|"$/g,'').replace(/""/g,'"')));}
const norm=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const {Pokedex}=read('work/regmc/data/pokedex.ts');
const {Learnsets}=read('work/regmc/data/learnsets.ts');
const championLearnsets=read('work/regmc/data/mods/champions/learnsets.ts').Learnsets;
const {roster}=read('src/data/roster.generated.ts');
const sourceMoves=read('work/regmc/data/moves.ts').Moves;
const supportedMoves=new Set([...Object.keys(read('src/data/champion-moves.generated.ts').championMoves),...[...fs.readFileSync('src/data/index.ts','utf8').matchAll(/move\('([^']+)'/g)].map(match=>match[1]),'spectralthief']);
const names=Object.fromEntries(csv('work/upstream/pokemon_species_names.csv').filter(row=>row[1]==='3').map(row=>[Number(row[0]),row[2]]));
const abilityNumbers=Object.fromEntries(csv('work/upstream/abilities.csv').map(row=>[norm(row[1]),row[0]]));
const abilityNames=Object.fromEntries(csv('work/upstream/ability_names.csv').filter(row=>row[1]==='3').map(row=>[row[0],row[2]]));
const pokemonIds=new Map(csv('work/regmc/pokemon.csv').map(row=>[norm(row[1]),Number(row[0])]));
const existing=new Set(roster.map(mon=>mon.id));
const specialForms=['urshifurapidstrike','tornadustherian','thundurustherian','landorustherian','enamorustherian','necrozmaduskmane','necrozmadawnwings'];
const baseIds=Object.keys(Pokedex).filter(id=>Pokedex[id].num>0&&!Pokedex[id].forme&&Pokedex[id].tags?.some(tag=>tag==='Sub-Legendary'||tag==='Restricted Legendary'));
if(baseIds.length!==71)throw Error(`Pinned legendary classification changed: ${baseIds.length}`);
const restrictedNationalDex=baseIds.filter(id=>Pokedex[id].tags.includes('Restricted Legendary')).map(id=>Pokedex[id].num);
const ids=[...baseIds,...specialForms].filter(id=>!existing.has(id));
const color={normal:'#b3b9a5',fire:'#e77b58',water:'#69a6d8',grass:'#6fba88',electric:'#eed264',ice:'#8ccbd5',fighting:'#cb7e68',poison:'#ad86c6',ground:'#c4a172',flying:'#91b6ce',psychic:'#d987ab',bug:'#a0b95c',rock:'#b4a780',ghost:'#9787c1',dragon:'#838bd0',dark:'#89909c',steel:'#94b4c5',fairy:'#e0a5c5'};
const forms={urshifurapidstrike:'연격',tornadustherian:'영물',thundurustherian:'영물',landorustherian:'영물',enamorustherian:'영물',necrozmaduskmane:'황혼의갈기',necrozmadawnwings:'새벽의날개'};
const abilityAliases=Object.fromEntries([...fs.readFileSync('src/data/index.ts','utf8').matchAll(/ability\('([^']+)'|abilities\.([a-zA-Z0-9]+)\s*=/g)].map(match=>{const id=match[1]??match[2];return [norm(id),id];}));
const originalAbilities=new Set(Object.keys(abilityAliases));
const importedAbilities={};
const entries=ids.map(id=>{
  const p=Pokedex[id];
  const known=championLearnsets[id]?.learnset??Learnsets[id]?.learnset??{};
  const inherited=Learnsets[norm(p.baseSpecies??p.name)]?.learnset??{};
  const learnset=[...new Set([...Object.keys(inherited),...Object.keys(known)])].filter(moveId=>sourceMoves[moveId]&&!['Past','Future'].includes(sourceMoves[moveId].isNonstandard));
  if(id==='zygarde')for(const move of ['nihillight','thousandarrows','thousandwaves','coreenforcer'])if(!learnset.includes(move))learnset.push(move);
  if(['tapukoko','tapulele','tapubulu','tapufini'].includes(id)&&!learnset.includes('naturesmadness'))learnset.push('naturesmadness');
  if(id==='necrozmaduskmane')for(const move of ['sunsteelstrike','photongeyser'])if(!learnset.includes(move))learnset.push(move);
  if(id==='necrozmadawnwings')for(const move of ['moongeistbeam','photongeyser'])if(!learnset.includes(move))learnset.push(move);
  const abilities=[...new Set(Object.values(p.abilities).map(value=>abilityAliases[norm(value)]??norm(value)))];
  for(const abilityId of abilities)if(!originalAbilities.has(norm(abilityId))&&!importedAbilities[abilityId])importedAbilities[abilityId]={id:abilityId,name:abilityNames[abilityNumbers[norm(abilityId)]]??abilityId,description:'전설 포켓몬의 특성입니다. 상세 효과가 구현되지 않은 경우 팀 편성 화면에 표시됩니다.',effects:[]};
  const spriteId=p.forme?pokemonIds.get(({necrozmaduskmane:'necrozmadusk',necrozmadawnwings:'necrozmadawn'}[id]??norm(p.name))):p.num;
  if(!spriteId||!names[p.num]||!learnset.length)throw Error(`Missing identity or learnset: ${id}`);
  const type=p.types[0].toLowerCase();
  const genderRatio=p.gender==='N'?{M:0,F:0}:p.gender==='M'?{M:1,F:0}:p.gender==='F'?{M:0,F:1}:p.genderRatio??{M:.5,F:.5};
  return {id,nationalDex:p.num,spriteId,name:names[p.num]+(forms[id]?` (${forms[id]})`:''),englishName:p.name,representativeType:type,types:p.types.map(x=>x.toLowerCase()),baseStats:p.baseStats,weightKg:p.weightkg,genderRatio,abilities,learnset,color:color[type]};
});
if(new Set(entries.map(entry=>entry.spriteId)).size!==entries.length)throw Error('Legendary sprite identity collision');
fs.writeFileSync('src/data/legendary-roster.generated.ts',`// Generated from pinned Pokémon Showdown Pokedex and learnsets.\nimport type {Species,Ability} from '../engine/types';\nexport const legendaryRoster:Species[]=${JSON.stringify(entries,null,2)};\nexport const legendaryAbilities:Record<string,Ability>=${JSON.stringify(importedAbilities,null,2)};\nexport const restrictedNationalDex:number[]=${JSON.stringify(restrictedNationalDex)};\n`);
fs.writeFileSync('docs/legendary-roster.json',JSON.stringify({sourceCommit:fs.readFileSync('work/regmc/COMMIT','utf8').trim(),classification:'Showdown Sub-Legendary and Restricted Legendary tags',allBaseSpecies:baseIds,addedIds:ids,restrictedNationalDex},null,2));
console.log({allLegendaryBase:baseIds.length,added:entries.length,specialForms:specialForms.length,restricted:baseIds.filter(id=>Pokedex[id].tags.includes('Restricted Legendary')).length});

// Eevee and Marshadow need selectable source-backed sets for their exclusive Z crystals.
const signatureIds=['eevee','marshadow'];
const signatureRoster=signatureIds.map(id=>{
  const p=Pokedex[id],known=Learnsets[id]?.learnset??{};
  const learnset=Object.keys(known).filter(moveId=>sourceMoves[moveId]&&supportedMoves.has(moveId)&&(!['Past','Future'].includes(sourceMoves[moveId].isNonstandard)||id==='marshadow'&&moveId==='spectralthief'));
  if(!learnset.includes(id==='eevee'?'lastresort':'spectralthief'))throw Error(`Missing signature move learnset: ${id}`);
  const abilities=[...new Set(Object.values(p.abilities).map(value=>abilityAliases[norm(value)]??norm(value)))];
  const type=p.types[0].toLowerCase();
  if(!names[p.num]||!learnset.length)throw Error(`Missing signature species identity: ${id}`);
  return {id,nationalDex:p.num,spriteId:p.num,name:names[p.num],englishName:p.name,representativeType:type,types:p.types.map(x=>x.toLowerCase()),baseStats:p.baseStats,weightKg:p.weightkg,genderRatio:p.gender==='N'?{M:0,F:0}:p.genderRatio??{M:.5,F:.5},abilities,learnset,color:color[type]};
});
fs.writeFileSync('src/data/signature-roster.generated.ts',`// Generated from pinned Pokémon Showdown Pokedex and learnsets for species-exclusive Z moves.\nimport type {Species} from '../engine/types';\nexport const signatureRoster:Species[]=${JSON.stringify(signatureRoster,null,2)};\n`);
