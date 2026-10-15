// Generate data-only move records from the pinned M-C Showdown source.
const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function read(path){const exports={};const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{exports},{filename:path});return exports;}
const root='work/regmc', {Pokedex}=read(`${root}/data/pokedex.ts`), {Learnsets}=read(`${root}/data/mods/champions/learnsets.ts`);
const base=read(`${root}/data/moves.ts`).Moves, mod=read(`${root}/data/mods/champions/moves.ts`).Moves;
const normalize=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]/g,'');
const csv=fs.readFileSync(`${root}/move_names.csv`,'utf8').trim().split(/\r?\n/).slice(1).map(line=>{const [id,language,...name]=line.split(',');return language==='3'?[Number(id),name.join(',').replace(/^"|"$/g,'')]:null;}).filter(Boolean);
const koreanNames=new Map(csv);
const rosterIds=JSON.parse(fs.readFileSync('docs/regulation-m-c.json','utf8')).ids;
const legendaryIds=JSON.parse(fs.readFileSync('docs/legendary-roster.json','utf8')).addedIds;
const expansionIds=JSON.parse(fs.readFileSync('docs/expansion-roster.json','utf8')).addedIds;
const {Learnsets:baseLearnsets}=read(`${root}/data/learnsets.ts`);
const wanted=new Set();
for(const id of rosterIds){const entry=Pokedex[id], known=Learnsets[id]?.learnset??Learnsets[normalize(entry?.baseSpecies??'')]?.learnset??{};for(const move of Object.keys(known))wanted.add(move);}
const legendaryWanted=new Set();
for(const id of legendaryIds){for(const move of Object.keys(baseLearnsets[id]?.learnset??baseLearnsets[normalize(Pokedex[id]?.baseSpecies??'')]?.learnset??{})){wanted.add(move);legendaryWanted.add(move);}}
for(const id of expansionIds){
  const source=Pokedex[id];
  for(const move of new Set([...Object.keys(baseLearnsets[normalize(source?.baseSpecies??'')]?.learnset??{}),...Object.keys(baseLearnsets[id]?.learnset??{})])){
    wanted.add(move);legendaryWanted.add(move);
  }
}
// Mega Zygarde's Z-A signature move is a supported, explicit form-only transfer rule.
wanted.add('nihillight');legendaryWanted.add('nihillight');
for(const id of ['behemothblade','behemothbash']){wanted.add(id);legendaryWanted.add(id);}
const statusMap={brn:'burn',par:'paralysis',psn:'poison',tox:'poison',slp:'sleep',frz:'freeze'};
const weatherMap={sunnyday:'sun',desolateland:'sun',raindance:'rain',primordialsea:'rain',sandstorm:'sand',snowscape:'snow',hail:'snow'};
const fieldMap={electricterrain:'electric',grassyterrain:'grassy',mistyterrain:'misty',psychicterrain:'psychic'};
const hazardMap={stealthrock:'stealthrock',spikes:'spikes',toxicspikes:'toxicspikes',stickyweb:'stickyweb'};
const statMap={atk:'atk',def:'def',spa:'spa',spd:'spd',spe:'spe',accuracy:'accuracy',evasion:'evasion'};
function fraction(value){return Array.isArray(value)&&value.length>1?value[0]/value[1]:typeof value==='number'?value:undefined;}
function makeEffects(m){const effects=[];const add=(data,target='target',chance)=>{if(!data)return;for(const [stat,stages] of Object.entries(data))if(statMap[stat]&&stages)effects.push({kind:'stat',stat:statMap[stat],stages,target:target==='self'?'self':'target',...(chance!==undefined?{chance}:{})});};
  if(m.boosts)add(m.boosts,m.target);
  if(m.self?.boosts)add(m.self.boosts,'self');
  if(m.status&&statusMap[m.status])effects.push({kind:'status',status:statusMap[m.status]});
  if(m.volatileStatus==='confusion')effects.push({kind:'volatile',condition:'confusion'});
  if(m.volatileStatus==='flinch')effects.push({kind:'volatile',condition:'flinch'});
  if(m.volatileStatus==='substitute')effects.push({kind:'substitute'});
  if(m.volatileStatus==='aquaring')effects.push({kind:'aquaRing'});
  if(m.volatileStatus==='yawn')effects.push({kind:'yawn'});
  if(m.volatileStatus==='attract')effects.push({kind:'attract'});
  if(m.volatileStatus==='taunt'||m.volatileStatus==='encore')effects.push({kind:m.volatileStatus});
  const addSecondary=s=>{if(s.status&&statusMap[s.status])effects.push({kind:'status',status:statusMap[s.status],chance:s.chance});if(s.volatileStatus==='confusion'||s.volatileStatus==='flinch')effects.push({kind:'volatile',condition:s.volatileStatus,chance:s.chance});if(s.boosts)add(s.boosts,s.self?'self':'target',s.chance);if(s.self?.boosts)add(s.self.boosts,'self',s.chance);};
  for(const secondary of [...(m.secondary?[m.secondary]:[]),...(m.secondaries??[])])if(secondary)addSecondary(secondary);
  const drain=fraction(m.drain);if(drain)effects.push({kind:'drain',fraction:drain});
  const recoil=fraction(m.recoil);if(recoil)effects.push({kind:'recoil',fraction:recoil});
  const heal=fraction(m.heal);if(heal)effects.push({kind:'heal',fraction:heal,target:'self'});
  const weather=normalize(m.weather);if(weatherMap[weather])effects.push({kind:'weather',weather:weatherMap[weather]});
  const field=normalize(m.terrain);if(fieldMap[field])effects.push({kind:'field',field:fieldMap[field]});
  const condition=normalize(m.sideCondition);if(hazardMap[condition])effects.push({kind:'hazard',hazard:hazardMap[condition]});
  if(['reflect','lightscreen','auroraveil'].includes(condition))effects.push({kind:'screen',screen:condition});
  if(condition==='tailwind')effects.push({kind:'tailwind'});
  if(condition==='trickroom')effects.push({kind:'trickroom'});
  if(condition==='gravity')effects.push({kind:'gravity'});
  if(m.forceSwitch)effects.push({kind:'forceSwitch'});
  if(m.flags?.recharge)effects.push({kind:'recharge'});
  if(m.thawsTarget)effects.push({kind:'cureBurn'});
  return effects.length?effects:undefined;
}
const targets={normal:'enemy',adjacentFoe:'enemy',any:'any',self:'self',ally:'ally',adjacentAlly:'ally',adjacentAllyOrSelf:'any',allAdjacentFoes:'allEnemies',allAdjacent:'allOthers',foeSide:'self',allySide:'self',allyTeam:'self',all:'allOthers'};
const data=[];
for(const id of wanted){const original=base[id];if(!original)throw Error(`M-C learnset move missing from pinned source: ${id}`);const override=mod[id]??{};const m={...original,...Object.fromEntries(Object.entries(override).filter(([key])=>key!=='inherit'))};
  if((m.isNonstandard==='Past'||m.isNonstandard==='Future')&&!legendaryWanted.has(id))continue;
  const category=String(m.category??'Status').toLowerCase();if(!['physical','special','status'].includes(category))continue;
  const flags=m.flags??{}, power=category==='status'?0:(m.basePowerCallback?(m.basePower>0?m.basePower:40):m.basePower??0);
  const target=targets[m.target]??'enemy';
  const entry={id,name:koreanNames.get(Number(m.num))??m.name,type:String(m.type).toLowerCase(),category,power,accuracy:m.accuracy===true||m.accuracy===null?null:Number(m.accuracy),pp:Number(m.pp)||5,priority:Number(m.priority)||0,target,effects:makeEffects(m),contact:!!flags.contact,sound:!!flags.sound,powder:!!flags.powder,bite:!!flags.bite,slicing:!!flags.slicing,pulse:!!flags.pulse,punch:!!flags.punch,bullet:!!flags.bullet};
  if(flags.charge)entry.charge=['solarbeam','solarblade'].includes(id)?'sun':id==='electroshot'?'rain':'always';
  if(['dig','dive','fly','bounce','phantomforce'].includes(id))entry.semiInvulnerable=id==='dig'?'underground':id==='dive'?'underwater':id==='phantomforce'?'vanished':'airborne';
  if(['counter','mirrorcoat','endeavor'].includes(id))entry.fixedDamage=id;
  if(['waterspout','eruption'].includes(id))entry.dynamicPower='remainingHp';
  if(id==='return')entry.dynamicPower='friendship';
  if(id==='frustration')entry.dynamicPower='lowFriendship';
  if(id==='lastrespects')entry.dynamicPower='faintedAllies';
  if(['voltswitch','uturn','flipturn','partingshot'].includes(id))entry.pivot=true;
  if(id==='steelbeam')entry.selfCostFraction=.5;
  if(m.selfdestruct)entry.selfDestruct=true;
  if(['outrage','thrash','petaldance'].includes(id))entry.rampage=[2,5];
  if(id==='entrainment')entry.effects=[{kind:'entrainment'}];
  if(id==='rest')entry.effects=[{kind:'rest'}];
  if(id==='yawn')entry.effects=[{kind:'yawn'}];
  if(id==='attract')entry.effects=[{kind:'attract'}];
  if(id==='aquaring')entry.effects=[{kind:'aquaRing'}];
  if(['moonlight','morningsun','synthesis'].includes(id))entry.effects=[{kind:'heal',fraction:.5,target:'self',weatherAdjusted:'sun'}];
  if(id==='shoreup')entry.effects=[{kind:'heal',fraction:.5,target:'self',weatherAdjusted:'sand'}];
  if(typeof m.multihit==='number'||Array.isArray(m.multihit))entry.multihit=m.multihit;
  if(m.critRatio)entry.critStage=Math.max(0,Number(m.critRatio)-1);
  if(m.ohko)entry.ohko=true;
  if(m.multiaccuracy)entry.multiaccuracy=true;
  if(m.breaksProtect)entry.bypassProtect=true;
  if(id==='nihillight')Object.assign(entry,{name:'니힐레이저',type:'dragon',category:'special',power:200,accuracy:100,target:'allEnemies',requiresForm:'zygardemega',ignoreEvasion:true,ignoreDefenderStages:true,ignoreImmunity:['dragon'],bypassProtect:true,effects:undefined});
  data.push(entry);
}
fs.writeFileSync('src/data/champion-moves.generated.ts',`// Generated from the pinned Pokémon Showdown Champions M-C learnsets and move data.\nimport type { Move } from '../engine/types';\nexport const championMoves: Record<string,Move> = ${JSON.stringify(Object.fromEntries(data.map(move=>[move.id,move])),null,2)};\n`);
console.log(JSON.stringify({learnsetMoves:wanted.size,generated:data.length,missingKoreanNames:data.filter(move=>move.name===base[move.id]?.name).map(move=>move.id)},null,2));
