import { abilities, items, moves, species } from '../data';
import { adjustStage, passiveEffects, isGrounded, effectiveWeather, getTypeMultiplier } from './calculations';
import { fieldLabel, sourceLabel, statLabel, statusLabel, weatherLabel } from './labels';
import { chance, randomInt } from './rng';
import { recordEvent, withEventContext, type EventDetails } from './events';
import type { BattleLog, BattleState, BoostStat, Combatant, Move, PassiveEffect, Side, Status, TargetRef } from './types';

export function addLog(state: BattleState, text: string, kind: BattleLog['kind'] = 'system', details: EventDetails = {}): void {
  state.log.push({ turn: state.turn, text, kind });
  recordEvent(state, text, { kind: kind === 'system' || kind === 'switch' ? 'message' : kind, ...details });
}

export function passiveSource(pokemon: Combatant, effect: PassiveEffect): { sourceId: string; sourceKind: 'ability' | 'item'; name: string } {
  const ability = abilities[pokemon.set.abilityId];
  return ability?.effects.includes(effect)
    ? { sourceId: ability.id, sourceKind: 'ability', name: ability.name }
    : { sourceId: pokemon.set.itemId, sourceKind: 'item', name: items[pokemon.set.itemId]?.name ?? '효과' };
}

const passiveAnnouncements=new WeakMap<BattleState,{boundary:number;seen:Set<string>}>();
export function announcePassive(state: BattleState, pokemon: Combatant, effect: PassiveEffect): void {
  const source = passiveSource(pokemon, effect);
  // One notice per source per action; repeated hits still execute all actual effects.
  let boundary=-1;for(let index=state.log.length-1;index>=0;index--){const entry=state.log[index];if(entry.kind==='switch'||entry.kind==='move'&&entry.text.endsWith('사용!')){boundary=index;break;}}
  let notices=passiveAnnouncements.get(state);
  if(!notices||notices.boundary!==boundary){notices={boundary,seen:new Set()};passiveAnnouncements.set(state,notices);}
  const key=`${pokemon.uid}:${source.sourceKind}:${source.sourceId}`;
  if(notices.seen.has(key))return;notices.seen.add(key);
  addLog(state, `${displayName(pokemon)}의 ${source.name} 발동!`, 'status',
    { kind: source.sourceKind, actorUid: pokemon.uid, targetUid: pokemon.uid, sourceId: source.sourceId, sourceKind: source.sourceKind });
}

export function displayName(pokemon: Combatant): string {
  return pokemon.set.nickname || pokemon.speciesName;
}

export function activePokemon(state: BattleState, side: Side): Combatant[] {
  return state.sides[side].active.map(index => state.sides[side].team[index]).filter((pokemon): pokemon is Combatant => !!pokemon && !pokemon.fainted);
}

export function getPokemonAt(state: BattleState, ref: TargetRef): Combatant | null {
  const index = state.sides[ref.side].active[ref.slot];
  return index === undefined ? null : state.sides[ref.side].team[index] ?? null;
}

/** Transform copies battle-facing traits while retaining the user's HP, status and item. */
export function transformCombatant(state:BattleState,user:Combatant,target:Combatant):boolean {
  if(user===target||user.transformedOriginal||target.transformedOriginal||target.substituteHp||target.fainted)return false;
  user.transformedOriginal={speciesName:user.speciesName,types:[...user.types],stats:{...user.stats},abilityId:user.set.abilityId,moves:[...user.set.moves],pp:{...user.pp},stages:{...user.stages}};
  user.speciesName=target.speciesName;
  user.appearanceSpeciesId=target.appearanceSpeciesId??target.set.speciesId;
  user.types=[...target.types];
  user.stats={...target.stats,hp:user.stats.hp};
  user.set.abilityId=target.set.abilityId;
  user.set.moves=[...target.set.moves];
  user.pp=Object.fromEntries(user.set.moves.map(id=>[id,5]));
  user.stages={...target.stages};
  addLog(state,`${displayName(user)}이 ${target.speciesName}의 모습과 능력으로 변신했다!`,'status',{kind:'ability',actorUid:user.uid,targetUid:target.uid});
  return true;
}

export function restoreTransform(pokemon:Combatant):void {
  const original=pokemon.transformedOriginal;if(!original)return;
  pokemon.speciesName=original.speciesName;pokemon.types=original.types;pokemon.stats=original.stats;
  pokemon.set.abilityId=original.abilityId;pokemon.set.moves=original.moves;pokemon.pp=original.pp;
  pokemon.stages=original.stages;pokemon.appearanceSpeciesId=undefined;pokemon.transformedOriginal=undefined;
}

export function applyDamage(state: BattleState, pokemon: Combatant, amount: number, source: string, directAttack = false, ignoreAbility = false): number {
  if (pokemon.fainted || amount <= 0) return 0;
  let dealt = Math.min(pokemon.hp, Math.max(1, Math.floor(amount)));
  if(directAttack&&pokemon.set.abilityId==='illusion'&&pokemon.appearanceSpeciesId){pokemon.appearanceSpeciesId=undefined;addLog(state,`${displayName(pokemon)}의 일루전이 풀렸다!`,'status',{kind:'ability',actorUid:pokemon.uid,sourceId:'illusion',sourceKind:'ability'});}
  if(directAttack&&!ignoreAbility&&pokemon.set.abilityId==='disguise'&&pokemon.set.speciesId==='mimikyu'&&!pokemon.disguiseBroken){
    pokemon.disguiseBroken=true;dealt=Math.min(pokemon.hp,Math.max(1,Math.floor(pokemon.maxHp/8)));
    addLog(state,`${displayName(pokemon)}의 탈이 공격을 막았다!`,'status',{kind:'ability',actorUid:pokemon.uid,targetUid:pokemon.uid,sourceId:'disguise',sourceKind:'ability'});
  }
  const survival = directAttack && pokemon.hp === pokemon.maxHp && dealt >= pokemon.hp
    ? passiveEffects(pokemon).find(effect => effect.trigger === 'onDirectDamage'&&!(ignoreAbility&&abilities[pokemon.set.abilityId]?.effects.includes(effect))) : undefined;
  if (survival?.trigger === 'onDirectDamage') {
    dealt = pokemon.hp - 1;
    if (survival.consume) {pokemon.itemConsumed = true;pokemon.consumedItemTurn=state.turn;if(passiveSource(pokemon,survival).sourceKind==='item')handleConsumedItem(state,pokemon);}
    announcePassive(state, pokemon, survival);
  }
  const beforeHp = pokemon.hp;
  pokemon.hp -= dealt;
  addLog(state, `${displayName(pokemon)}: ${dealt} HP 피해 (${sourceLabel(source)})`, 'damage',
    { targetUid: pokemon.uid, beforeHp, afterHp: pokemon.hp });
  if (pokemon.hp <= 0) {
    pokemon.hp = 0;
    pokemon.fainted = true;
    for(const side of ['player','cpu'] as const)for(const other of state.sides[side].team)if(other.trappedBy===pokemon.uid){other.trapped=false;other.trappedBy=undefined;}
    addLog(state, `${displayName(pokemon)} 기절!`, 'faint', { targetUid: pokemon.uid });
    const side:Side=state.sides.player.team.includes(pokemon)?'player':'cpu';
    const protectedAbilities=new Set(['noability','multitype','stancechange','schooling','disguise','battlebond','comatose','protosynthesis','quarkdrive','zenmode','hunger','iceface','gulping','gorging']);
    for(const ally of activePokemon(state,side))if(ally!==pokemon&&ally.set.abilityId==='receiver'&&!ally.fainted&&!protectedAbilities.has(pokemon.set.abilityId)){
      ally.set.abilityId=pokemon.set.abilityId;
      addLog(state,`${displayName(ally)}의 리시버가 ${pokemon.speciesName}의 ${abilities[pokemon.set.abilityId]?.name??pokemon.set.abilityId}을 이어받았다!`,'status',{kind:'ability',actorUid:ally.uid,targetUid:pokemon.uid,sourceId:'receiver',sourceKind:'ability'});
    }
  }
  if(pokemon.hp>0&&beforeHp>pokemon.maxHp*.5&&pokemon.hp<=pokemon.maxHp*.5){
    for(const effect of passiveEffects(pokemon))if(effect.trigger==='onAfterDamage'&&effect.kind==='stat'&&effect.threshold===.5){
      announcePassive(state,pokemon,effect);applyStatChange(state,pokemon,effect.stat,effect.stages,pokemon);
    }
  }
  if (!pokemon.fainted) {
    let consumedItem=false;
    for (const effect of passiveEffects(pokemon)) {
      const itemEffect=!!items[pokemon.set.itemId]?.effects.includes(effect);
      const berry=itemEffect&&isBerryItem(pokemon);
      if(berry&&berrySuppressed(state,pokemon))continue;
      const threshold=effect.trigger==='onAfterDamage'&&effect.kind==='heal'
        ?berry&&pokemon.set.abilityId==='gluttony'?Math.max(.5,effect.threshold):effect.threshold:1;
      if (effect.trigger !== 'onAfterDamage' || effect.kind!=='heal' || pokemon.hp > pokemon.maxHp * threshold) continue;
      if (effect.consume) {pokemon.itemConsumed = true;consumedItem ||= itemEffect;}
      announcePassive(state, pokemon, effect);
      withEventContext(state, { actorUid: pokemon.uid, moveId: undefined, category: undefined }, () =>
        applyHeal(state, pokemon, effect.fraction*(berry&&pokemon.set.abilityId==='ripen'?2:1), passiveSource(pokemon, effect).name));
    }
    if(consumedItem)handleConsumedItem(state,pokemon);
  }
  return dealt;
}

export function applyHeal(state: BattleState, pokemon: Combatant, fraction: number, source: string): number {
  if (pokemon.fainted || pokemon.hp >= pokemon.maxHp) return 0;
  const restored = Math.min(pokemon.maxHp - pokemon.hp, Math.max(1, Math.floor((pokemon.original?.maxHp??pokemon.maxHp) * fraction)));
  const beforeHp = pokemon.hp;
  pokemon.hp += restored;
  addLog(state, `${displayName(pokemon)}: HP ${restored} 회복 (${sourceLabel(source)})`, 'status',
    { kind: 'heal', targetUid: pokemon.uid, beforeHp, afterHp: pokemon.hp });
  return restored;
}

function isBerryItem(pokemon:Combatant):boolean{return pokemon.set.itemId.toLowerCase().includes('berry');}
function berrySuppressed(state:BattleState,pokemon:Combatant):boolean{
  const side:Side=state.sides.player.team.includes(pokemon)?'player':'cpu';
  return activePokemon(state,side==='player'?'cpu':'player').some(foe=>foe.set.abilityId==='unnerve');
}
function handleConsumedItem(state:BattleState,pokemon:Combatant):void{
  pokemon.consumedItemTurn=state.turn;
  if(isBerryItem(pokemon)){
    if(pokemon.set.abilityId==='cudchew'&&!pokemon.cudChewUsed){pokemon.cudChewReadyTurn=state.turn+1;pokemon.cudChewItemId=pokemon.set.itemId;pokemon.cudChewUsed=true;}
    if(pokemon.set.abilityId==='cheekpouch')applyHeal(state,pokemon,1/3,'먹보주머니');
  }
  const side:Side=state.sides.player.team.includes(pokemon)?'player':'cpu';
  const donor=activePokemon(state,side).find(ally=>ally!==pokemon&&ally.set.abilityId==='symbiosis'&&ally.set.itemId!=='none'&&!ally.itemConsumed&&!/ite|iumz|niumz|orbs?$/.test(ally.set.itemId));
  if(!donor)return;
  pokemon.set.itemId=donor.set.itemId;pokemon.itemConsumed=false;pokemon.cudChewUsed=false;pokemon.consumedItemTurn=undefined;donor.set.itemId='none';donor.itemConsumed=false;donor.consumedItemTurn=undefined;
  addLog(state,`${donor.speciesName}의 공생이 ${pokemon.speciesName}에게 도구를 건넸다!`,'status',{kind:'ability',actorUid:donor.uid,targetUid:pokemon.uid,sourceId:'symbiosis',sourceKind:'ability'});
}

export function applyStatus(state: BattleState, pokemon: Combatant, status: Status, source: string, attacker?: Combatant, reflected = false): boolean {
  if (pokemon.fainted) return false;
  const immunity = passiveEffects(pokemon).find(effect => effect.trigger === 'onStatus' && effect.kind === 'statusImmunity' && effect.status === status);
  const side:Side=state.sides.player.team.includes(pokemon)?'player':'cpu';
  const allies=activePokemon(state,side);
  const flowerVeil=allies.some(ally=>ally.set.abilityId==='flowerveil'&&pokemon.types.includes('grass'));
  const sweetVeil=status==='sleep'&&allies.some(ally=>ally.set.abilityId==='sweetveil');
  const leafGuard=pokemon.set.abilityId==='leafguard'&&effectiveWeather(state,pokemon)==='sun';
  const corrosion=attacker?.set.abilityId==='corrosion'&&status==='poison';
  const blocked = pokemon.status || status === 'burn' && pokemon.types.includes('fire')
    || status === 'poison' && pokemon.types.some(type => ['poison', 'steel'].includes(type))&&!corrosion
    || status === 'paralysis' && pokemon.types.includes('electric')
    || status === 'freeze' && (pokemon.types.includes('ice') || effectiveWeather(state,pokemon) === 'sun')
    || isGrounded(pokemon,state) && (state.field?.id === 'misty' || status === 'sleep' && state.field?.id === 'electric')
    || flowerVeil||sweetVeil||leafGuard;
  if (blocked || immunity) {
    if (immunity) announcePassive(state, pokemon, immunity);
    addLog(state, `${displayName(pokemon)}에게 ${statusLabel[status]} 효과가 적용되지 않았다.`, 'status', { kind: 'blocked', targetUid: pokemon.uid });
    return false;
  }
  pokemon.status = status;
  if (status === 'sleep') pokemon.sleepTurns = randomInt(state, 1, 3);
  addLog(state, `${displayName(pokemon)}: ${statusLabel[status]} 상태 (${sourceLabel(source)})`, 'status', { targetUid: pokemon.uid, status });
  const cure=passiveEffects(pokemon).find(effect=>effect.trigger==='onStatus'&&effect.kind==='cureStatus'&&(!effect.status||effect.status===status)
    &&!(items[pokemon.set.itemId]?.effects.includes(effect)&&berrySuppressed(state,pokemon)));
  if(cure){
    announcePassive(state,pokemon,cure);pokemon.itemConsumed=true;pokemon.status=null;pokemon.sleepTurns=0;pokemon.toxicCounter=undefined;
    if(items[pokemon.set.itemId]?.effects.includes(cure))handleConsumedItem(state,pokemon);
    addLog(state,`${displayName(pokemon)}의 상태 이상이 회복됐다!`,'status',{targetUid:pokemon.uid,status:null});
  }
  const reflection = passiveEffects(pokemon).find(effect => effect.trigger === 'onStatus' && effect.kind === 'reflectStatus');
  if (reflection && attacker && attacker !== pokemon && !reflected && ['burn', 'poison', 'paralysis'].includes(status)) {
    announcePassive(state, pokemon, reflection);
    withEventContext(state, { actorUid: pokemon.uid, targetUid: attacker.uid, moveId: undefined, category: undefined }, () =>
      applyStatus(state, attacker, status, passiveSource(pokemon, reflection).name, pokemon, true));
  }
  return true;
}

/** Every rank change (moves and entry abilities) shares immunity and reaction handling. */
export function applyStatChange(state: BattleState, pokemon: Combatant, stat: BoostStat, stages: number, source: Combatant, sourceId?: string): number {
  if (pokemon.fainted) return 0;
  const inversion=passiveEffects(pokemon).find(effect=>effect.trigger==='onStatChange'&&effect.kind==='invertStages');
  if(inversion){stages=-stages;announcePassive(state,pokemon,inversion);}
  const other = pokemon.uid !== source.uid;
  const opposing = other && !Object.values(state.sides).some(side => side.team.includes(pokemon) && side.team.includes(source));
  if (stages < 0 && other) {
    if(opposing&&pokemon.set.abilityId==='mirrorarmor'&&sourceId!=='mirrorarmor'){
      addLog(state,`${displayName(pokemon)}의 미러아머가 능력 하락을 되돌렸다!`,'status',{kind:'ability',actorUid:pokemon.uid,targetUid:source.uid,sourceId:'mirrorarmor',sourceKind:'ability'});
      applyStatChange(state,source,stat,stages,pokemon,'mirrorarmor');return 0;
    }
    const alliedFlowerVeil=opposing&&pokemon.types.includes('grass')&&activePokemon(state,state.sides.player.team.includes(pokemon)?'player':'cpu').some(ally=>ally.set.abilityId==='flowerveil');
    const directStatImmunity=opposing&&(pokemon.set.abilityId==='whiteSmoke'||pokemon.set.abilityId==='illuminate'&&stat==='accuracy'||pokemon.set.abilityId==='bigpecks'&&stat==='def'||alliedFlowerVeil||pokemon.set.abilityId==='guarddog'&&sourceId==='intimidate');
    if(directStatImmunity){
      addLog(state,`${displayName(pokemon)}의 특성이 능력치 하락을 막았다!`,'status',{kind:'ability',actorUid:pokemon.uid,targetUid:pokemon.uid,sourceId:pokemon.set.abilityId,sourceKind:'ability'});
      if(pokemon.set.abilityId==='guarddog'&&sourceId==='intimidate')applyStatChange(state,pokemon,'atk',1,pokemon);
      return 0;
    }
    const immunity = passiveEffects(pokemon).find(effect => effect.trigger === 'onStatDrop' && effect.kind === 'statImmunity'
      && (!effect.sourceId || effect.sourceId === sourceId)&&(!effect.stat||effect.stat===stat));
    if (immunity) {
      announcePassive(state, pokemon, immunity);
      addLog(state, `${displayName(pokemon)}의 ${statLabel[stat]} 하락이 막혔다!`, 'status', { kind: 'blocked', targetUid: pokemon.uid });
      return 0;
    }
  }
  const beforeStage = pokemon.stages[stat];
  const actual = adjustStage(pokemon, stat, stages);
  if (actual) addLog(state, `${displayName(pokemon)}: ${statLabel[stat]} ${Math.abs(actual)}단계 ${actual > 0 ? '상승' : '하락'}!`, 'status',
    { kind: 'stat', actorUid: source.uid, targetUid: pokemon.uid, stat, stages: actual, beforeStage, afterStage: pokemon.stages[stat] });
  else addLog(state, `${displayName(pokemon)}의 ${statLabel[stat]}은 더 이상 ${stages > 0 ? '올라가지' : '내려가지'} 않는다.`, 'status', { kind: 'blocked', targetUid: pokemon.uid });
  if (actual < 0 && opposing) for (const effect of passiveEffects(pokemon)) {
    if (effect.trigger !== 'onStatDrop' || effect.kind !== 'stat' || effect.sourceId && effect.sourceId !== sourceId) continue;
    announcePassive(state, pokemon, effect);
    withEventContext(state, { actorUid: pokemon.uid, moveId: undefined, category: undefined }, () =>
      applyStatChange(state, pokemon, effect.stat, effect.stages, pokemon));
  }
  if(actual>0&&opposing&&sourceId!=='opportunist')for(const copy of activePokemon(state,state.sides.player.team.includes(source)?'player':'cpu'))if(copy.set.abilityId==='opportunist'&&!copy.fainted){
    addLog(state,`${displayName(copy)}의 기회주의가 능력치 상승을 복사했다!`,'status',{kind:'ability',actorUid:copy.uid,sourceId:'opportunist',sourceKind:'ability'});
    applyStatChange(state,copy,stat,actual,source,'opportunist');
  }
  return actual;
}

export function applyExitEffects(state: BattleState, pokemon: Combatant): void {
  if (pokemon.fainted) return;
  for (const effect of passiveEffects(pokemon)) {
    if (effect.trigger !== 'onExit') continue;
    if(effect.kind==='cureStatus'){
      if(!pokemon.status)continue;
      announcePassive(state,pokemon,effect);pokemon.status=null;pokemon.sleepTurns=0;pokemon.toxicCounter=undefined;
      addLog(state,`${displayName(pokemon)}의 상태 이상이 회복됐다!`,'status',{targetUid:pokemon.uid,status:null});
      continue;
    }
    if (pokemon.hp >= pokemon.maxHp) continue;
    announcePassive(state, pokemon, effect);
    withEventContext(state, { actorUid: pokemon.uid }, () => applyHeal(state, pokemon, effect.fraction, passiveSource(pokemon, effect).name));
  }
}

/** Absorption runs for damaging and status moves after protection, before accuracy. */
export function absorbMove(state: BattleState, pokemon: Combatant, move: Move): boolean {
  const effect = move.category!=='status'&&passiveEffects(pokemon).find(effect => effect.trigger === 'onDamage' && effect.kind === 'typeImmunity' && effect.type === move.type
    && !(move.ignoreAbility&&abilities[pokemon.set.abilityId]?.effects.includes(effect))
    && !(state.gravity&&move.type==='ground'&&pokemon.set.abilityId==='levitate'&&abilities.levitate?.effects.includes(effect)));
  if (!effect || effect.kind !== 'typeImmunity') return false;
  if (effect.activateBoost) pokemon.absorbedTypes = [...new Set([...(pokemon.absorbedTypes ?? []), move.type])];
  announcePassive(state, pokemon, effect);
  if (effect.healFraction) withEventContext(state, { actorUid: pokemon.uid, moveId: undefined, category: undefined }, () =>
    applyHeal(state, pokemon, effect.healFraction!, passiveSource(pokemon, effect).name));
  if(effect.boostStat)applyStatChange(state,pokemon,effect.boostStat,1,pokemon);
  addLog(state, `${displayName(pokemon)}에게 효과가 없다.`, 'move', { kind: 'effectiveness', effectiveness: 0, targetUid: pokemon.uid });
  return true;
}

export function applyEntryEffects(state: BattleState, side: Side, pokemon: Combatant): void {
  if(pokemon.set.abilityId==='trace'){
    const target=activePokemon(state,side==='player'?'cpu':'player')[0];
    if(target&&target.set.abilityId!=='trace'&&target.set.abilityId!=='noability'){
      pokemon.set.abilityId=target.set.abilityId;
      addLog(state,`${displayName(pokemon)}의 트레이스가 ${target.speciesName}의 ${abilities[target.set.abilityId]?.name??target.set.abilityId}을 복사했다!`,'status',{kind:'ability',actorUid:pokemon.uid,sourceId:'trace',sourceKind:'ability'});
    }
  }
  if(pokemon.set.abilityId==='shadowtag')for(const target of activePokemon(state,side==='player'?'cpu':'player')){
    if(target.types.includes('ghost')||target.set.abilityId==='shadowtag')continue;
    target.trapped=true;target.trappedBy=pokemon.uid;
  }
  if(pokemon.set.abilityId==='frisk')for(const target of activePokemon(state,side==='player'?'cpu':'player')){
    const itemName=items[target.set.itemId]?.name??target.set.itemId;
    addLog(state,`${displayName(pokemon)}의 통찰! 상대 ${displayName(target)}이(가) ${itemName}을(를) 지니고 있다.`,'status',{kind:'ability',actorUid:pokemon.uid,targetUid:target.uid,sourceId:'frisk',sourceKind:'ability'});
  }
  if(pokemon.set.abilityId==='illusion'){
    const disguise=[...state.sides[side].team].reverse().find(mon=>mon!==pokemon&&!mon.fainted&&!state.sides[side].active.some(index=>state.sides[side].team[index]===mon));
    if(disguise)pokemon.appearanceSpeciesId=disguise.set.speciesId;
  }
  if(pokemon.set.abilityId==='screencleaner'){
    state.sides.player.screens={};state.sides.cpu.screens={};
    addLog(state,`${displayName(pokemon)}의 스크린클리너가 양쪽 장막을 걷었다!`,'status',{kind:'ability',actorUid:pokemon.uid,sourceId:'screencleaner',sourceKind:'ability'});
  }
  if(pokemon.set.abilityId==='hospitality')for(const ally of activePokemon(state,side))if(ally!==pokemon)applyHeal(state,ally,1/4,'접대');
  if(pokemon.set.abilityId==='curiousmedicine')for(const ally of activePokemon(state,side))if(ally!==pokemon){
    for(const stat of Object.keys(ally.stages) as BoostStat[])ally.stages[stat]=0;
    addLog(state,`${ally.speciesName}의 능력 변화가 원래대로 돌아왔다!`,'status',{kind:'ability',actorUid:pokemon.uid,targetUid:ally.uid,sourceId:'curiousmedicine',sourceKind:'ability'});
  }
  if(pokemon.set.abilityId==='supersweetsyrup')for(const foe of activePokemon(state,side==='player'?'cpu':'player'))applyStatChange(state,foe,'evasion',-1,pokemon);
  if(pokemon.set.abilityId==='anticipation'){
    const foes=activePokemon(state,side==='player'?'cpu':'player');
    const danger=foes.some(foe=>foe.set.moves.some(id=>moves[id]?.ohko||getTypeMultiplier(moves[id]?.type??'normal',pokemon.types)>1));
    if(danger)addLog(state,`${displayName(pokemon)}이(가) 상대의 위협을 감지했다!`,'status',{kind:'ability',actorUid:pokemon.uid,sourceId:'anticipation',sourceKind:'ability'});
  }
  if(pokemon.set.abilityId==='forewarn'){
    const foeMoves=activePokemon(state,side==='player'?'cpu':'player').flatMap(foe=>foe.set.moves.map(id=>moves[id])).filter((move):move is Move=>!!move);
    const strongest=foeMoves.sort((a,b)=>b.power-a.power)[0];
    if(strongest)addLog(state,`${displayName(pokemon)}의 예지몽: 상대 기술 ${strongest.name}을(를) 간파했다!`,'status',{kind:'ability',actorUid:pokemon.uid,sourceId:'forewarn',sourceKind:'ability'});
  }
  if(pokemon.set.abilityId==='imposter'&&!pokemon.transformedOriginal){
    const target=activePokemon(state,side==='player'?'cpu':'player')[0];
    if(target&&transformCombatant(state,pokemon,target))addLog(state,`${displayName(pokemon)}의 괴짜 발동!`,'status',{kind:'ability',actorUid:pokemon.uid,sourceId:'imposter',sourceKind:'ability'});
  }
  if(passiveEffects(pokemon).some(effect=>effect.trigger==='onAttack'&&effect.kind==='fallenAllyBoost')){
    pokemon.fallenAllies=Math.min(5,state.sides[side].team.filter(ally=>ally.uid!==pokemon.uid&&ally.fainted).length);
    if(pokemon.fallenAllies)addLog(state,`${displayName(pokemon)}의 총대장: 쓰러진 아군 ${pokemon.fallenAllies}마리의 힘을 받았다!`,'status',{kind:'ability',actorUid:pokemon.uid,sourceId:'supremeoverlord',sourceKind:'ability'});
  }
  for (const effect of passiveEffects(pokemon)) {
    if (effect.trigger !== 'onEnter') continue;
    const source = passiveSource(pokemon, effect).name;
    announcePassive(state, pokemon, effect);
    if (effect.kind === 'weather') {
      state.weather = { id: effect.weather, turns: effect.turns ?? 5 };
      addLog(state, `${displayName(pokemon)}의 ${source}: ${weatherLabel[effect.weather]} 시작!`, 'status', { kind: 'weather', actorUid: pokemon.uid });
      refreshAbilityTypes(state);
    } else if (effect.kind === 'field') {
      state.field = { id: effect.field, turns: effect.turns ?? 5 };
      addLog(state, `${displayName(pokemon)}의 ${source}: ${fieldLabel[effect.field]} 전개!`, 'status', { kind: 'field', actorUid: pokemon.uid });
      refreshAbilityTypes(state);
    } else if (effect.kind === 'stat') {
      const targets = effect.target === 'self' ? [pokemon] : activePokemon(state, side === 'player' ? 'cpu' : 'player');
      for (const target of targets) applyStatChange(state, target, effect.stat, effect.stages, pokemon, passiveSource(pokemon, effect).sourceId);
    }
  }
  refreshAbilityTypes(state);
}

/** Reactive typing from Forecast and Mimicry follows the current field state. */
export function refreshAbilityTypes(state:BattleState):void {
  for(const side of ['player','cpu'] as const)for(const pokemon of activePokemon(state,side)){
    if(pokemon.transformation?.kind==='tera'||pokemon.transformation?.kind==='mega'||pokemon.transformedOriginal)continue;
    const base=species[pokemon.set.speciesId]?.types.map(type=>type.toLowerCase());
    if(!base)continue;
    let next=base;
    if(pokemon.set.abilityId==='forecast'&&pokemon.set.speciesId==='castform'){
      const weather=effectiveWeather(state,pokemon);
      next=weather==='sun'?['fire']:weather==='rain'?['water']:weather==='snow'?['ice']:base;
    }else if(pokemon.set.abilityId==='mimicry'){
      const fieldType=state.field?.id==='electric'?'electric':state.field?.id==='grassy'?'grass':state.field?.id==='misty'?'fairy':state.field?.id==='psychic'?'psychic':undefined;
      next=fieldType?[fieldType]:base;
    }
    if(next.length!==pokemon.types.length||next.some((type,index)=>type!==pokemon.types[index])){
      pokemon.types=[...next];
      addLog(state,`${displayName(pokemon)}의 타입이 ${next.join('/')} 타입으로 바뀌었다!`,'status',{kind:'ability',actorUid:pokemon.uid,sourceId:pokemon.set.abilityId,sourceKind:'ability'});
    }
  }
}

export function triggerSuperEffectiveHit(state:BattleState,pokemon:Combatant,source:Combatant):void {
  if(pokemon.fainted)return;
  const effects=passiveEffects(pokemon).filter(effect=>effect.trigger==='onSuperEffectiveHit'&&effect.kind==='stat');
  if(!effects.length)return;
  announcePassive(state,pokemon,effects[0]);
  pokemon.itemConsumed=true;
  for(const effect of effects)if(effect.trigger==='onSuperEffectiveHit'&&effect.kind==='stat')applyStatChange(state,pokemon,effect.stat,effect.stages,source);
  if(effects.some(effect=>items[pokemon.set.itemId]?.effects.includes(effect)))handleConsumedItem(state,pokemon);
}

export function resistBerryMultiplier(state:BattleState,pokemon:Combatant,move:Move,effectiveness:number):number {
  if(effectiveness<=1)return 1;
  let multiplier=1;
  for(const effect of passiveEffects(pokemon)){
    if(effect.trigger!=='onSuperEffectiveDamage'||effect.kind==='resistType'&&effect.type!==move.type)continue;
    if(move.ignoreAbility&&abilities[pokemon.set.abilityId]?.effects.includes(effect))continue;
    if(items[pokemon.set.itemId]?.effects.includes(effect)&&isBerryItem(pokemon)&&berrySuppressed(state,pokemon))continue;
    announcePassive(state,pokemon,effect);
    if(effect.kind==='resistType'){
      pokemon.itemConsumed=true;
      pokemon.consumedItemTurn=state.turn;
      multiplier*=pokemon.set.abilityId==='ripen'?effect.multiplier*effect.multiplier:effect.multiplier;
      handleConsumedItem(state,pokemon);
    } else multiplier*=effect.multiplier;
  }
  return multiplier;
}

export function triggerContact(state: BattleState, defender: Combatant, attacker: Combatant): void {
  const blocksDefenderSecondary=defender.set.abilityId==='shielddust'||defender.set.itemId==='covertcloak'&&!defender.itemConsumed;
  const blocksAttackerSecondary=attacker.set.abilityId==='shielddust'||attacker.set.itemId==='covertcloak'&&!attacker.itemConsumed;
  if(attacker.set.abilityId==='poisontouch'&&!blocksDefenderSecondary&&!defender.fainted&&chance(state,30))applyStatus(state,defender,'poison','독수',attacker);
  if(defender.set.abilityId==='cutecharm'&&attacker.gender&&defender.gender&&attacker.gender!=='N'&&defender.gender!=='N'&&attacker.gender!==defender.gender&&!attacker.status&&!attacker.infatuatedBy&&chance(state,30)){
    attacker.infatuatedBy=defender.uid;addLog(state,`${attacker.speciesName}은(는) ${defender.speciesName}에게 반했다!`,'status',{kind:'ability',actorUid:defender.uid,targetUid:attacker.uid,sourceId:'cutecharm',sourceKind:'ability'});
  }
  if(defender.set.abilityId==='effectspore'&&!attacker.fainted&&!blocksAttackerSecondary&&chance(state,30)&&!attacker.status){
    const statuses=['sleep','paralysis','poison'] as const;applyStatus(state,attacker,statuses[randomInt(state,0,2)],'포자',defender);
  }
  if(defender.set.abilityId==='aftermath'&&defender.fainted&&attacker.uid!==defender.uid){
    addLog(state,`${defender.speciesName}의 애프터매스!`,'status',{kind:'ability',actorUid:defender.uid,targetUid:attacker.uid,sourceId:'aftermath',sourceKind:'ability'});
    applyDamage(state,attacker,Math.max(1,Math.floor((attacker.original?.maxHp??attacker.maxHp)/4)),'애프터매스');
  }
  const transferable=(mon:Combatant)=>mon.set.itemId!=='none'&&!mon.itemConsumed&&(mon.set.itemId==='eviolite'||!/ite(?:x|y)?|iumz|niumz|orbs?$/.test(mon.set.itemId));
  if(defender.set.abilityId==='mummy'&&!defender.fainted&&!['mummy','multitype','stancechange','schooling','disguise','battlebond'].includes(attacker.set.abilityId)){
    attacker.set.abilityId='mummy';addLog(state,`${attacker.speciesName}의 특성이 미라로 바뀌었다!`,'status',{kind:'ability',actorUid:defender.uid,targetUid:attacker.uid,sourceId:'mummy',sourceKind:'ability'});
  }else if(defender.set.abilityId==='wanderingspirit'&&!defender.fainted&&!['wanderingspirit','multitype','stancechange','schooling','disguise','battlebond'].includes(attacker.set.abilityId)){
    const old=attacker.set.abilityId;attacker.set.abilityId=defender.set.abilityId;defender.set.abilityId=old;
    addLog(state,`${attacker.speciesName}과(와) ${defender.speciesName}의 특성이 바뀌었다!`,'status',{kind:'ability',actorUid:defender.uid,targetUid:attacker.uid,sourceId:'wanderingspirit',sourceKind:'ability'});
  }
  if(defender.set.abilityId==='pickpocket'&&!defender.fainted&&transferable(attacker)&&defender.set.itemId==='none'&&attacker.set.abilityId!=='stickyhold'){
    defender.set.itemId=attacker.set.itemId;defender.cudChewUsed=false;defender.consumedItemTurn=undefined;attacker.set.itemId='none';attacker.itemConsumed=false;attacker.consumedItemTurn=undefined;attacker.cudChewReadyTurn=undefined;attacker.cudChewItemId=undefined;
    addLog(state,`${defender.speciesName}이(가) ${attacker.speciesName}의 도구를 훔쳤다!`,'status',{kind:'ability',actorUid:defender.uid,targetUid:attacker.uid,sourceId:'pickpocket',sourceKind:'ability'});
  }
  if(attacker.set.abilityId==='magician'&&transferable(defender)&&attacker.set.itemId==='none'&&defender.set.abilityId!=='stickyhold'){
    attacker.set.itemId=defender.set.itemId;attacker.cudChewUsed=false;attacker.consumedItemTurn=undefined;defender.set.itemId='none';defender.itemConsumed=false;defender.consumedItemTurn=undefined;defender.cudChewReadyTurn=undefined;defender.cudChewItemId=undefined;
    addLog(state,`${attacker.speciesName}이(가) ${defender.speciesName}의 도구를 훔쳤다!`,'status',{kind:'ability',actorUid:attacker.uid,targetUid:defender.uid,sourceId:'magician',sourceKind:'ability'});
  }
  for (const effect of passiveEffects(defender)) {
    if (effect.trigger === 'onContact' && effect.kind === 'damage') {
      announcePassive(state, defender, effect);
      withEventContext(state, { actorUid: defender.uid, targetUid: attacker.uid, moveId: undefined, category: undefined }, () =>
        applyDamage(state, attacker, Math.max(1, Math.floor(attacker.maxHp * effect.fraction)), passiveSource(defender, effect).name));
    }
    if (effect.trigger === 'onContact' && effect.kind === 'status' && chance(state, effect.chance)) {
      announcePassive(state, defender, effect);
      withEventContext(state, { actorUid: defender.uid, targetUid: attacker.uid }, () => applyStatus(state, attacker, effect.status, passiveSource(defender, effect).name, defender));
    }
  }
}

export function processEndTurn(state: BattleState): void {
  for (const side of ['player', 'cpu'] as const) {
    for (const pokemon of activePokemon(state, side)) {
      const baseHp=pokemon.original?.maxHp??pokemon.maxHp;
      if(pokemon.cudChewReadyTurn&&state.turn>=pokemon.cudChewReadyTurn&&pokemon.set.itemId===pokemon.cudChewItemId&&pokemon.itemConsumed){
        const berryItem=items[pokemon.set.itemId];pokemon.itemConsumed=false;pokemon.cudChewReadyTurn=undefined;pokemon.cudChewItemId=undefined;
        const heal=berryItem?.effects.find(effect=>effect.trigger==='onAfterDamage'&&effect.kind==='heal');
        if(heal?.trigger==='onAfterDamage'&&heal.kind==='heal'&&pokemon.hp<=pokemon.maxHp*heal.threshold){
          pokemon.itemConsumed=true;pokemon.consumedItemTurn=state.turn;
          applyHeal(state,pokemon,heal.fraction*(pokemon.set.abilityId==='ripen'?2:1),'꿀꺽미덕');
        }
        const cure=berryItem?.effects.find(effect=>effect.trigger==='onStatus'&&effect.kind==='cureStatus'&&pokemon.status&&(!effect.status||effect.status===pokemon.status));
        if(cure){pokemon.itemConsumed=true;pokemon.consumedItemTurn=state.turn;pokemon.status=null;pokemon.sleepTurns=0;pokemon.toxicCounter=undefined;
          addLog(state,`${displayName(pokemon)}의 꿀꺽미덕으로 상태 이상이 나았다!`,'status',{kind:'ability',actorUid:pokemon.uid,sourceId:'cudchew',sourceKind:'ability',status:null});}
        if(!pokemon.itemConsumed)addLog(state,`${displayName(pokemon)}이(가) 꿀꺽미덕으로 열매를 다시 사용할 수 있게 되었다!`,'status',{kind:'ability',actorUid:pokemon.uid,sourceId:'cudchew',sourceKind:'ability'});
      }
      if(pokemon.set.abilityId==='harvest'&&pokemon.itemConsumed&&isBerryItem(pokemon)&&!berrySuppressed(state,pokemon)
        &&(effectiveWeather(state,pokemon)==='sun'||chance(state,50))){
        pokemon.itemConsumed=false;addLog(state,`${displayName(pokemon)}의 수확으로 열매가 돌아왔다!`,'status',{kind:'ability',actorUid:pokemon.uid,sourceId:'harvest',sourceKind:'ability'});
      }
      if(pokemon.set.abilityId==='pickup'&&pokemon.set.itemId==='none'){
        const lost=[...activePokemon(state,side),...activePokemon(state,side==='player'?'cpu':'player')].find(mon=>mon.itemConsumed&&mon.consumedItemTurn===state.turn&&mon.set.itemId!=='none'&&(mon.set.itemId==='eviolite'||!/(?:ite(?:x|y)?|iumz|niumz|orbs?)$/.test(mon.set.itemId)));
        if(lost){pokemon.set.itemId=lost.set.itemId;pokemon.itemConsumed=false;pokemon.cudChewUsed=false;pokemon.cudChewReadyTurn=undefined;pokemon.cudChewItemId=undefined;pokemon.consumedItemTurn=undefined;lost.set.itemId='none';lost.itemConsumed=false;lost.consumedItemTurn=undefined;lost.cudChewReadyTurn=undefined;lost.cudChewItemId=undefined;
          addLog(state,`${displayName(pokemon)}이(가) ${items[pokemon.set.itemId]?.name??pokemon.set.itemId}을 주웠다!`,'status',{kind:'ability',actorUid:pokemon.uid,sourceId:'pickup',sourceKind:'ability'});}
      }
      if(pokemon.set.abilityId==='moody'){
        const stats=['atk','def','spa','spd','spe'] as const;
        const raisable=stats.filter(stat=>pokemon.stages[stat]<6);
        const raised=raisable.length?raisable[randomInt(state,0,raisable.length-1)]:undefined;
        if(raised)applyStatChange(state,pokemon,raised,2,pokemon);
        const lowerable=stats.filter(stat=>pokemon.stages[stat]>-6&&stat!==raised);
        if(lowerable.length)applyStatChange(state,pokemon,lowerable[randomInt(state,0,lowerable.length-1)],-1,pokemon);
        if(raised||lowerable.length)addLog(state,`${displayName(pokemon)}의 변덕쟁이!`,'status',{kind:'ability',actorUid:pokemon.uid,sourceId:'moody',sourceKind:'ability'});
      }
      if(pokemon.set.abilityId==='hungerswitch'){
        pokemon.morpekoHangry=!pokemon.morpekoHangry;
        addLog(state,`${displayName(pokemon)}이(가) ${pokemon.morpekoHangry?'배고픈':'배부른'} 모드가 되었다!`,'status',{kind:'ability',actorUid:pokemon.uid,sourceId:'hungerswitch',sourceKind:'ability'});
      }
      if (pokemon.status === 'burn'&&pokemon.set.abilityId!=='magicguard') applyDamage(state, pokemon, Math.max(1, Math.floor(baseHp / 16)), 'burn');
      if (pokemon.status === 'poison') {
        if(pokemon.set.abilityId==='poisonheal')applyHeal(state,pokemon,1/8,'독치유');
        else if(pokemon.set.abilityId!=='magicguard')applyDamage(state,pokemon,Math.max(1,Math.floor(baseHp*(pokemon.toxicCounter??2)/16)),pokemon.toxicCounter?'맹독':'poison');
        if(pokemon.toxicCounter)pokemon.toxicCounter=Math.min(15,pokemon.toxicCounter+1);
      }
      if (pokemon.fainted) continue;
      if(pokemon.saltCured&&pokemon.set.abilityId!=='magicguard'){
        applyDamage(state,pokemon,Math.max(1,Math.floor(baseHp/(pokemon.types.some(type=>type==='water'||type==='steel')?4:8))),'소금절이');
      }
      if (pokemon.fainted) continue;
      if (effectiveWeather(state,pokemon) === 'sand' && pokemon.set.abilityId!=='magicguard'&&!pokemon.types.some(type => ['rock', 'ground', 'steel'].includes(type))
        && !passiveEffects(pokemon).some(effect=>effect.trigger==='onWeatherDamage'&&effect.weather==='sand')) {
        applyDamage(state, pokemon, Math.max(1, Math.floor(baseHp / 16)), 'sand');
      }
      if (pokemon.fainted) continue;
      if(pokemon.status&&((pokemon.set.abilityId==='hydration'&&effectiveWeather(state,pokemon)==='rain')||(pokemon.set.abilityId==='shedskin'&&chance(state,30)))){
        const source=pokemon.set.abilityId==='hydration'?'촉촉한몸':'탈피';pokemon.status=null;pokemon.sleepTurns=0;pokemon.toxicCounter=undefined;
        addLog(state,`${displayName(pokemon)}의 ${source}! 상태 이상이 나았다!`,'status',{kind:'ability',actorUid:pokemon.uid,sourceId:pokemon.set.abilityId,sourceKind:'ability',status:null});
      }
      if (state.field?.id === 'grassy' && isGrounded(pokemon,state)) applyHeal(state, pokemon, 1 / 16, 'grassy field');
      if(pokemon.aquaRing&&pokemon.hp>0)applyHeal(state,pokemon,1/16,'아쿠아링');
      if(pokemon.hp>0&&effectiveWeather(state,pokemon)==='rain'&&pokemon.set.abilityId==='raindish')applyHeal(state,pokemon,1/16,'rain dish');
      if(pokemon.hp>0&&effectiveWeather(state,pokemon)==='rain'&&pokemon.set.abilityId==='dryskin')applyHeal(state,pokemon,1/8,'dry skin');
      if(pokemon.hp>0&&effectiveWeather(state,pokemon)==='sun'&&pokemon.set.abilityId==='dryskin')applyDamage(state,pokemon,Math.max(1,Math.floor(baseHp/8)),'dry skin');
      if(pokemon.yawnTurns&&--pokemon.yawnTurns===0&&!pokemon.status)applyStatus(state,pokemon,'sleep','하품');
      for (const effect of passiveEffects(pokemon)) {
        if (effect.trigger === 'onEndTurn' && effect.kind === 'heal' && pokemon.hp < pokemon.maxHp && (!effect.weather||effect.weather===effectiveWeather(state,pokemon))) {
          announcePassive(state, pokemon, effect);
          withEventContext(state, { actorUid: pokemon.uid }, () => applyHeal(state, pokemon, effect.fraction, passiveSource(pokemon, effect).name));
        }
        if(effect.trigger==='onEndTurn'&&effect.kind==='stat'){
          announcePassive(state,pokemon,effect);applyStatChange(state,pokemon,effect.stat,effect.stages,pokemon);
        }
        if(effect.trigger==='onEndTurn'&&effect.kind==='damage'&&(!effect.weather||effect.weather===effectiveWeather(state,pokemon))){
          announcePassive(state,pokemon,effect);applyDamage(state,pokemon,Math.max(1,Math.floor(baseHp*effect.fraction)),passiveSource(pokemon,effect).name);
        }
        if(effect.trigger==='onEndTurn'&&effect.kind==='cureStatus'){
          const candidates=effect.target==='ally'?activePokemon(state,side).filter(ally=>ally!==pokemon&&ally.status):pokemon.status?[pokemon]:[];
          for(const ally of candidates)if(chance(state,effect.chance)){
            announcePassive(state,pokemon,effect);ally.status=null;ally.sleepTurns=0;ally.toxicCounter=undefined;
            addLog(state,`${ally.speciesName}의 상태 이상이 나았다!`,'status',{targetUid:ally.uid,status:null});
          }
        }
      }
    }
  }
  if (state.weather && --state.weather.turns <= 0) {
    const text = `${weatherLabel[state.weather.id]} 종료.`;
    state.weather = null;
    addLog(state, text, 'status', { kind: 'weather' });
  }
  if (state.field && --state.field.turns <= 0) {
    const text = `${fieldLabel[state.field.id]} 종료.`;
    state.field = null;
    addLog(state, text, 'status', { kind: 'field' });
  }
  refreshAbilityTypes(state);
}
