// Regulation M-C roster import from a pinned Pokémon Showdown Champions snapshot.
const fs = require('node:fs'), vm = require('node:vm'), crypto = require('node:crypto'), ts = require('typescript');
const directAbilityHooks = require('./ability-hook-ids.cjs');
function moduleData(path) {
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = { exports: {} }; vm.runInNewContext(code, sandbox, { filename: path }); return sandbox.exports;
}
function csv(path) {
  return fs.readFileSync(path, 'utf8').trim().split(/\r?\n/).slice(1).map(line => [...line.matchAll(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)].map(x => x[1].replace(/^"|"$/g, '').replace(/""/g, '"')));
}
const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const root = 'work/regmc', commit = fs.readFileSync(`${root}/COMMIT`, 'utf8').trim();
const { Pokedex } = moduleData(`${root}/data/pokedex.ts`);
const { FormatsData } = moduleData(`${root}/data/mods/champions/formats-data.ts`);
const { Learnsets } = moduleData(`${root}/data/mods/champions/learnsets.ts`);
const sourceMoves=moduleData(`${root}/data/moves.ts`).Moves;
const championMoveData=moduleData(`${root}/data/mods/champions/moves.ts`).Moves;
const sourceMoveIds=new Set(Object.keys(sourceMoves).filter(id=>!['Past','Future'].includes(championMoveData[id]?.isNonstandard)));
const names = Object.fromEntries(csv('work/upstream/pokemon_species_names.csv').filter(x => x[1] === '3').map(x => [Number(x[0]), x[2]]));
const abilityNumbers = Object.fromEntries(csv('work/upstream/abilities.csv').map(x => [normalize(x[1]), x[0]]));
const abilityNames = Object.fromEntries(csv('work/upstream/ability_names.csv').filter(x => x[1] === '3').map(x => [x[0], x[2]]));
const pokemonIds = new Map(csv(`${root}/pokemon.csv`).map(row => [normalize(row[1]), Number(row[0])]));
const source = fs.readFileSync('src/data/index.ts', 'utf8');
const core = source.replace(/^import .*(roster.generated|legacy-roster.generated|gimmicks|champion-moves.generated).*;\r?\n/gm, '').replace(/^for\(const \[id,entry\] of Object\.entries\(championMoves\)\).*;\r?\n/gm,'').split('const nationalDexById')[0].split('export const regulationSpecies:')[0];
const coreSandbox = { exports: {} };
vm.runInNewContext(ts.transpileModule(core, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, coreSandbox);
const { moves, abilities } = coreSandbox.exports;
for(const id of sourceMoveIds)moves[id]=true;
const abilityAlias = Object.fromEntries(Object.keys(abilities).map(id => [normalize(id), id]));
const abilityDescriptionMatches=[...source.matchAll(/abilities\.([a-z0-9]+)\s*=\s*ability\('[^']+'\s*,\s*'[^']+'\s*,\s*'([^']+)'/g)];
const sourceAbilityDescriptions=new Map(abilityDescriptionMatches.map(match=>[match[1],match[2]]));
const extraAbilities = {}, evidence = {};
const colors = { fire:'#e77b58', water:'#69a6d8', grass:'#6fba88', electric:'#eed264', ice:'#8ccbd5', fighting:'#cb7e68', poison:'#ad86c6', ground:'#c4a172', flying:'#91b6ce', psychic:'#d987ab', bug:'#a0b95c', rock:'#b4a780', ghost:'#9787c1', dragon:'#838bd0', dark:'#89909c', steel:'#94b4c5', fairy:'#e0a5c5', normal:'#b3b9a5' };
// These forms are generated during a battle or differ cosmetically without a team slot.
const autoForms = /^(?:castform(?:sunny|rainy|snowy)|aegislashblade)$/;
const formSuffix = { Alola:'알로라', Hisui:'히스이', Galar:'가라르', 'Paldea-Combat':'팔데아 격투', 'Paldea-Blaze':'팔데아 불꽃', 'Paldea-Aqua':'팔데아 물', Heat:'히트', Wash:'워시', Frost:'프로스트', Fan:'스핀', Mow:'커트', F:'암컷', Eternal:'영원의 꽃', Midnight:'한밤중', Dusk:'황혼', 'Low-Key':'로우키',Small:'소형',Large:'대형',Super:'초대형',Blue:'파란 깃털',Yellow:'노란 깃털',White:'흰 깃털' };
const spriteAliases = {basculegionf:'basculegionfemale', indeedeef:'indeedeefemale', meowsticf:'meowsticfemale',squawkabillyblue:'squawkabillyblueplumage',squawkabillyyellow:'squawkabillyyellowplumage',squawkabillywhite:'squawkabillywhiteplumage'};
// Meowstic-F inherits the base format's legal status; unlike cosmetic variants
// it has a different ability pool and a distinct M-C Mega form.
const legalIds = Object.keys(FormatsData).flatMap(id=>id==='meowstic'?[id,'meowsticf']:[id]).filter(id => {
  const format = FormatsData[id]??FormatsData[normalize(Pokedex[id]?.baseSpecies??'')], entry = Pokedex[id];
  return entry && !format.isNonstandard && format.tier !== 'Illegal' && !entry.requiredItem && !autoForms.test(id);
});
if (legalIds.length !== 264) throw Error(`Pinned Regulation M-C set changed: expected 264, found ${legalIds.length}`);
const roster = legalIds.map(id => {
  const entry = Pokedex[id];
  const known = Learnsets[id]?.learnset ?? Learnsets[normalize(entry.baseSpecies ?? '')]?.learnset ?? {};
  const available = Object.keys(moves).filter(moveId => known[moveId]&&sourceMoveIds.has(moveId));
  if (available.length < 4 && id !== 'ditto') throw Error(`Insufficient implemented M-C moves: ${id} ${available}`);
  const possible = [...new Set(Object.values(entry.abilities))].map(name => {
    const key = normalize(name), abilityId = abilityAlias[key] ?? key;
    if (!abilities[abilityId]) extraAbilities[abilityId] = { id:abilityId, name:abilityNames[abilityNumbers[key]] ?? name, description:sourceAbilityDescriptions.get(abilityId)??(directAbilityHooks.has(abilityId)?'효과가 배틀 엔진에 반영되어 있습니다.':abilityId==='runaway'?'야생 포켓몬에게서 도망칩니다. 현재 게임은 트레이너 대전만 지원합니다.':'M-C 종의 특성입니다. 이 버전에서는 효과 미지원.'), effects:[] };
    return abilityId;
  });
  const nationalDex = entry.num, suffix = entry.forme ? ` (${formSuffix[entry.forme] ?? entry.forme})` : '';
  const spriteName = spriteAliases[id] ?? id + (id.startsWith('taurospaldea') ? 'breed' : '');
  const spriteId = entry.forme ? pokemonIds.get(spriteName) : nationalDex;
  if (!spriteId || !names[nationalDex]) throw Error(`Missing Korean name or PokeAPI sprite identity: ${id} ${spriteName}`);
  const representativeType = entry.types[0].toLowerCase();
  evidence[id] = { nationalDex, spriteId, types:entry.types, stats:entry.baseStats, abilities:Object.values(entry.abilities), learnsetSources:Object.fromEntries(available.map(moveId => [moveId,known[moveId]])) };
  const genderRatio=entry.gender==='N'?{M:0,F:0}:entry.gender==='M'?{M:1,F:0}:entry.gender==='F'?{M:0,F:1}:entry.genderRatio??{M:.5,F:.5};
  return { id, nationalDex, spriteId, name:names[nationalDex] + suffix, englishName:entry.name, representativeType, types:entry.types.map(x=>x.toLowerCase()), baseStats:entry.baseStats, weightKg:entry.weightkg, genderRatio, abilities:possible, learnset:available, color:colors[representativeType] };
});
if (new Set(roster.map(x=>x.id)).size !== 264 || new Set(roster.map(x=>x.spriteId)).size !== 264) throw Error('Duplicate M-C roster id or sprite identity');
fs.writeFileSync('src/data/roster.generated.ts', `// Generated by scripts/generate-roster.cjs from pinned Pokémon Showdown Regulation M-C data.\nimport type { Species, Ability } from '../engine/types';\nexport const roster: Species[] = ${JSON.stringify(roster,null,2)};\nexport const importedAbilities: Record<string,Ability> = ${JSON.stringify(extraAbilities,null,2)};\n`);
fs.mkdirSync('docs',{recursive:true});
fs.writeFileSync('docs/roster-evidence.json',JSON.stringify(evidence,null,2));
fs.writeFileSync('docs/regulation-m-c.json',JSON.stringify({format:'gen9championsvgc2026regmc',showdownCommit:commit,source:`https://github.com/smogon/pokemon-showdown/blob/${commit}/data/mods/champions/formats-data.ts`,selection:'Entries without isNonstandard/Illegal or requiredItem; exclude 4 automatic battle forms; add Meowstic-F inherited from legal Meowstic because its abilities and Mega differ. Includes Gourgeist sizes with different stats and Squawkabilly plumages with different abilities.',teamSelectableCount:roster.length,ids:legalIds},null,2));
fs.writeFileSync('docs/data-sources.json', JSON.stringify({generated:new Date().toISOString(),rules:'Pokémon Showdown Champions Regulation M-C team-selectable roster. Simulator mechanics remain custom and are not equivalent to Champions.',showdownCommit:commit,sources:fs.readdirSync(`${root}/data/mods/champions`).map(file=>({file,sha256:crypto.createHash('sha256').update(fs.readFileSync(`${root}/data/mods/champions/${file}`)).digest('hex')}))},null,2));
console.log(JSON.stringify({species:roster.length,base:roster.filter(x=>x.spriteId===x.nationalDex).length,variants:roster.filter(x=>x.spriteId!==x.nationalDex).length,abilities:Object.keys(extraAbilities).length,minMoves:Math.min(...roster.filter(x=>x.id!=='ditto').map(x=>x.learnset.length))},null,2));
