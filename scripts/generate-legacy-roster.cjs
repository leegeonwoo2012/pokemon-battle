// Preserve pre-M-C engine fixtures and saved teams outside the selectable M-C catalog.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function read(path){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports});return exports;}
const normalize=x=>x.toLowerCase().replace(/[^a-z0-9]/g,'');
const groups={};vm.runInNewContext(fs.readFileSync('scripts/roster-selection.mjs','utf8').replace('export const rosterSelection =','globalThis.rosterSelection ='),groups);
const ids=Object.values(groups.rosterSelection).flat();
const {Pokedex}=read('work/upstream/pokedex.ts'),{Learnsets}=read('work/upstream/learnsets.ts');
const source=fs.readFileSync('src/data/index.ts','utf8');
const core=source.replace(/^import .*(roster.generated|legacy-roster.generated|gimmicks).*;\r?\n/gm,'').split('export const regulationSpecies:')[0];
const sandbox={exports:{}};vm.runInNewContext(ts.transpileModule(core,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,sandbox);
const {moves,abilities}=sandbox.exports;
const aliases=Object.fromEntries(Object.keys(abilities).map(id=>[normalize(id),id]));
const nameCsv=fs.readFileSync('work/upstream/pokemon_species_names.csv','utf8').trim().split(/\r?\n/).slice(1).map(line=>line.split(','));
const names=Object.fromEntries(nameCsv.filter(row=>row[1]==='3').map(row=>[Number(row[0]),row[2]]));
function known(id,seen=new Set()){if(seen.has(id))return {};seen.add(id);const p=Pokedex[id];return {...(p?.prevo?known(normalize(p.prevo),seen):{}),...(Learnsets[id]?.learnset??{})};}
const roster=ids.map(id=>{const p=Pokedex[id],learn=known(id),representativeType=Object.keys(groups.rosterSelection).find(type=>groups.rosterSelection[type].includes(id));if(!p)throw Error(id);return {id,nationalDex:p.num,spriteId:p.num,name:names[p.num],englishName:p.name,representativeType,types:p.types.map(x=>x.toLowerCase()),baseStats:p.baseStats,abilities:[...new Set(Object.values(p.abilities).map(name=>aliases[normalize(name)]??normalize(name)))],learnset:Object.keys(moves).filter(move=>learn[move])};});
fs.writeFileSync('src/data/legacy-roster.generated.ts',`// Historical engine compatibility data; excluded from Regulation M-C selection.\nimport type {Species} from '../engine/types';\nexport const legacyRoster:Species[]=${JSON.stringify(roster,null,2)};\n`);
const mC=new Set(read('src/data/roster.generated.ts').roster.map(p=>p.id));
console.log(JSON.stringify({legacy:roster.length,extra:roster.filter(p=>!mC.has(p.id)).length}));
