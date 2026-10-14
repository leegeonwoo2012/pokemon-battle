import { abilities, items, natures, species, typeChart } from '../data';
import type { BattleState, BoostStat, Combatant, Move, PassiveEffect, Species, Stat, Stats, TeamSet, Weather } from './types';

export const LEVEL = 50;

export function effectiveWeather(state:BattleState,source?:Combatant):Weather|undefined{
  if([...state.sides.player.active.map(index=>state.sides.player.team[index]),...state.sides.cpu.active.map(index=>state.sides.cpu.team[index])]
    .some(mon=>mon&&!mon.fainted&&(mon.set.abilityId==='cloudnine'||mon.set.abilityId==='airlock')))return undefined;
  return source?.set.abilityId==='megasol'?'sun':state.weather?.id??undefined;
}

/** Weather Ball resolves its type and doubled base power at use time. */
export function weatherBallMove(state:BattleState,attacker:Combatant,move:Move):Move {
  if(move.id!=='weatherball'||move.powered)return move;
  const weather=effectiveWeather(state,attacker);
  const type=weather==='sun'?'fire':weather==='rain'?'water':weather==='sand'?'rock':weather==='snow'?'ice':undefined;
  return type?{...move,type,power:100}:{...move,type:'normal',power:50};
}

export function calculateStats(species: Species, set: TeamSet): Stats {
  const nature = natures[set.natureId];
  const result = {} as Stats;
  for (const stat of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const) {
    const iv = Math.max(0, Math.min(31, set.ivs?.[stat] ?? 31));
    const ev = Math.max(0, Math.min(252, set.evs?.[stat] ?? 0));
    const core = Math.floor(((2 * species.baseStats[stat] + iv + Math.floor(ev / 4)) * LEVEL) / 100);
    result[stat] = stat === 'hp'
      ? core + LEVEL + 10
      : Math.floor((core + 5) * (nature?.up === stat ? 1.1 : nature?.down === stat ? 0.9 : 1));
  }
  return result;
}

export function stageMultiplier(stage: number, accuracy = false): number {
  const base = accuracy ? 3 : 2;
  return stage >= 0 ? (base + stage) / base : base / (base - stage);
}

export function getTypeMultiplier(attackType: string, defenderTypes: string[]): number {
  return defenderTypes.reduce((value, type) => value * (typeChart[attackType]?.[type] ?? 1), 1);
}

export function battleTypeMultiplier(state:BattleState,move:Move,defender:Combatant,attacker?:Combatant):number {
  if(move.type==='stellar')return defender.transformation?.kind==='tera'?2:1;
  let types=state.gravity&&move.type==='ground'?defender.types.filter(type=>type!=='flying'):defender.types;
  if(attacker?.set.abilityId==='scrappy'&&['normal','fighting'].includes(move.type))types=types.filter(type=>type!=='ghost');
  return getTypeMultiplier(move.type,types);
}

export function passiveEffects(pokemon: Combatant): PassiveEffect[] {
  const maxed=pokemon.transformation?.kind==='dynamax';
  return [
    ...(abilities[pokemon.set.abilityId]?.effects ?? []),
    ...(!pokemon.itemConsumed&&pokemon.set.abilityId!=='klutz' ? (items[pokemon.set.itemId]?.effects ?? []).filter(e=>!maxed||!['onChoice','onStat','onSpeed'].includes(e.trigger)||!pokemon.set.itemId.toLowerCase().startsWith('choice')) : []),
  ];
}

type AttackDamageEffect=Extract<PassiveEffect,{trigger:'onAttack'|'onDamage';kind:'damageMultiplier'}>;
function conditionMatches(effect: AttackDamageEffect, pokemon: Combatant, move: Move): boolean {
  if (effect.condition === 'fullHp') return pokemon.hp === pokemon.maxHp;
  if (effect.condition === 'lowHp') return pokemon.hp <= pokemon.maxHp / 3;
  if (effect.condition === 'lowPower') return move.power > 0 && move.power <= 60;
  if (effect.condition === 'contact') return !!move.contact;
  if (effect.condition === 'secondary') return move.category!=='status'&&!!move.effects?.some(secondary=>
    'chance' in secondary&&secondary.chance!==undefined&&(!('target' in secondary)||secondary.target!=='self'));
  if (effect.condition === 'recoil') return move.id!=='struggle'&&!!move.effects?.some(secondary=>secondary.kind==='recoil'&&secondary.basis!=='maxHp');
  if (effect.condition === 'pulse') return !!move.pulse;
  if (effect.condition === 'bite') return !!move.bite;
  if (effect.condition === 'slicing') return !!move.slicing;
  if (effect.condition === 'punch') return !!move.punch;
  if (effect.condition === 'sound') return !!move.sound;
  return true;
}

export function damagePassiveMultiplier(pokemon: Combatant, move: Move, trigger: 'onAttack' | 'onDamage'): number {
  const absorbed = trigger === 'onAttack' && pokemon.absorbedTypes?.includes(move.type) ? 1.5 : 1;
  const fallen=trigger==='onAttack'&&passiveEffects(pokemon).some(effect=>effect.trigger==='onAttack'&&effect.kind==='fallenAllyBoost')
    ? 1+Math.min(5,pokemon.fallenAllies??0)*0.1 : 1;
  return matchingDamageEffects(pokemon, move, trigger).reduce((value, effect) => value * effect.multiplier, absorbed*fallen);
}

export function matchingDamageEffects(pokemon: Combatant, move: Move, trigger: 'onAttack' | 'onDamage'): AttackDamageEffect[] {
  return passiveEffects(pokemon).filter((effect): effect is AttackDamageEffect =>
    effect.kind === 'damageMultiplier' && effect.trigger === trigger
    && !(trigger==='onDamage'&&move.ignoreAbility&&abilities[pokemon.set.abilityId]?.effects.includes(effect))
    && (!effect.type || effect.type === move.type) && (!effect.category || effect.category === move.category)
    && conditionMatches(effect, pokemon, move));
}

export function isTypeImmune(pokemon: Combatant, move: Move, state?:BattleState): boolean {
  return passiveEffects(pokemon).some(effect => effect.trigger === 'onDamage' && effect.kind === 'typeImmunity' && effect.type === move.type
    && !(state?.gravity&&move.type==='ground'&&pokemon.set.abilityId==='levitate'&&abilities.levitate?.effects.includes(effect))
    && !(move.ignoreAbility&&abilities[pokemon.set.abilityId]?.effects.includes(effect)));
}

export function effectiveSpeed(state: BattleState, pokemon: Combatant): number {
  let speed = pokemon.stats.spe * stageMultiplier(pokemon.stages.spe);
  if(pokemon.set.abilityId==='unburden'&&pokemon.itemConsumed)speed*=2;
  const weather=effectiveWeather(state,pokemon);
  const side=state.sides.player.team.includes(pokemon)?state.sides.player:state.sides.cpu;
  if(side.tailwind)speed*=2;
  if (pokemon.status === 'paralysis') speed *= 0.5;
  if(pokemon.set.abilityId==='surgesurfer'&&state.field?.id==='electric')speed*=2;
  for (const effect of passiveEffects(pokemon)) {
    if (effect.trigger === 'onSpeed' && effect.kind === 'speedMultiplier' && (!effect.weather || effect.weather === weather)) {
      speed *= effect.multiplier;
    }
  }
  return Math.max(1, Math.floor(speed));
}

export function adjustStage(pokemon: Combatant, stat: BoostStat, amount: number): number {
  const before = pokemon.stages[stat];
  pokemon.stages[stat] = Math.max(-6, Math.min(6, before + amount));
  return pokemon.stages[stat] - before;
}

export function getModifiedStat(pokemon: Combatant, stat: Exclude<Stat, 'hp'>, critIgnore: 'negative' | 'positive' | 'all' | null = null): number {
  let stage = pokemon.stages[stat];
  if (critIgnore === 'all') stage = 0;
  else if (critIgnore === 'negative') stage = Math.max(0, stage);
  if (critIgnore === 'positive') stage = Math.min(0, stage);
  const multiplier = passiveEffects(pokemon).reduce((value, effect) => effect.trigger === 'onStat'
    && effect.stat === stat && (!effect.condition || effect.condition==='status'&&!!pokemon.status) ? value * effect.multiplier : value, 1);
  const abilityMultiplier=pokemon.set.abilityId==='hustle'&&stat==='atk'?1.5:1;
  return Math.max(1, Math.floor(pokemon.stats[stat] * stageMultiplier(stage) * multiplier*abilityMultiplier));
}

export function burnMultiplier(pokemon: Combatant, move: Move): number {
  const ignoreBurn = passiveEffects(pokemon).some(effect => effect.trigger === 'onStat' && effect.ignoreBurn);
  return pokemon.status === 'burn' && move.category === 'physical' && !ignoreBurn ? 0.5 : 1;
}

export function moveAccuracy(state: BattleState, user: Combatant, target: Combatant, move: Move): number {
  const weather=effectiveWeather(state,user);
  const accuracy = weather ? move.weatherAccuracy?.[weather] : undefined;
  const base = accuracy === undefined ? move.id==='sheercold'&&!user.types.includes('ice')?20:move.accuracy : accuracy;
  if (base === null) return 100;
  const ignoreEvasion=user.set.abilityId==='illuminate'||passiveEffects(user).some(effect=>effect.trigger==='onAccuracy'&&effect.kind==='ignoreEvasion');
  const targetEvasion=target.stages.evasion+(target.confusionTurns&&target.set.abilityId==='tangledfeet'?2:0);
  let result = base * stageMultiplier(user.stages.accuracy, true) / (ignoreEvasion&&targetEvasion>0?1:stageMultiplier(targetEvasion, true));
  for (const [pokemon, role] of [[user, 'self'], [target, 'attacker']] as const) {
    for (const effect of passiveEffects(pokemon)) {
      if (effect.trigger === 'onAccuracy' && effect.kind === 'accuracyMultiplier' && effect.target === role && (!effect.weather || effectiveWeather(state,user) === effect.weather)) result *= effect.multiplier;
    }
  }
  if(user.set.abilityId==='hustle'&&move.category==='physical')result*=0.8;
  if(state.gravity)result*=5/3;
  return Math.min(100, result);
}

export function alwaysHits(state: BattleState, move: Move, user?: Combatant, target?: Combatant): boolean {
  if ([user, target].some(pokemon => pokemon && passiveEffects(pokemon).some(effect => effect.trigger === 'onAccuracy' && effect.kind === 'accuracyAlwaysHits'))) return true;
  const weather=user?effectiveWeather(state,user):effectiveWeather(state);
  const weatherAccuracy = weather ? move.weatherAccuracy?.[weather] : undefined;
  return (weatherAccuracy === undefined ? move.accuracy : weatherAccuracy) === null;
}

export function isGrounded(pokemon: Combatant,state?:BattleState): boolean {
  if(state?.gravity)return true;
  return !pokemon.types.includes('flying') && !passiveEffects(pokemon).some(effect =>
    effect.trigger === 'onDamage' && effect.kind === 'typeImmunity' && effect.type === 'ground');
}

export function defensiveStat(state: BattleState, pokemon: Combatant, stat: 'def' | 'spd', critIgnore: 'positive' | 'all' | null = null): number {
  const value = getModifiedStat(pokemon, stat, critIgnore);
  const grassPelt=stat==='def'&&pokemon.set.abilityId==='grasspelt'&&state.field?.id==='grassy';
  const weather=effectiveWeather(state,pokemon);
  const weatherBoost = stat === 'spd' && weather === 'sand' && pokemon.types.includes('rock')
    || stat === 'def' && weather === 'snow' && pokemon.types.includes('ice');
  return Math.max(1, Math.floor(value * (weatherBoost||grassPelt ? 1.5 : 1)));
}

export function partnerAbilityMultiplier(state:BattleState,attacker:Combatant,move:Move):number {
  const side=state.sides.player.team.includes(attacker)?state.sides.player:state.sides.cpu;
  const allies=side.active.map(index=>side.team[index]).filter(mon=>mon&&!mon.fainted&&mon!==attacker);
  let multiplier=1;
  if(move.category==='special'&&(attacker.set.abilityId==='plus'&&allies.some(mon=>mon.set.abilityId==='minus')
    ||attacker.set.abilityId==='minus'&&allies.some(mon=>mon.set.abilityId==='plus')))multiplier*=1.5;
  if(move.type==='steel'&&attacker.set.abilityId==='steelyspirit')multiplier*=1.5;
  if(move.type==='steel')for(const ally of allies)if(ally.set.abilityId==='steelyspirit')multiplier*=1.5;
  return multiplier;
}

export function genderAbilityMultiplier(attacker:Combatant,defender:Combatant):number {
  if(attacker.set.abilityId!=='rivalry'||!attacker.gender||!defender.gender||attacker.gender==='N'||defender.gender==='N')return 1;
  return attacker.gender===defender.gender?1.25:.75;
}

export function criticalChance(attacker: Combatant, defender: Combatant, move: Move): number {
  if (passiveEffects(defender).some(effect => effect.trigger === 'onCritical' && effect.kind === 'criticalImmunity')) return 0;
  if(attacker.set.abilityId==='merciless'&&defender.status==='poison')return 100;
  const stage = passiveEffects(attacker).reduce((value, effect) =>
    effect.trigger === 'onCritical' && effect.kind === 'criticalBoost' && (!effect.speciesIds||effect.speciesIds.includes(attacker.set.speciesId)) ? value + effect.stages : value, (move.critStage ?? 0)+(attacker.gmaxCritStages??0)+(attacker.dragonCheerCritStages??0));
  return [100 / 24, 12.5, 50, 100][Math.min(3, Math.max(0, stage))];
}

export function secondaryChance(pokemon: Combatant, chance: number): number {
  return Math.min(100, passiveEffects(pokemon).reduce((value, effect) =>
    effect.trigger === 'onSecondary' ? value * effect.multiplier : value, chance));
}

export function weatherMultiplier(state: BattleState, move: Move, attacker?:Combatant): number {
  const weather=effectiveWeather(state,attacker);
  if (weather === 'sun') return move.type === 'fire' ? 1.5 : move.type === 'water' ? 0.5 : 1;
  if (weather === 'rain') return move.type === 'water' ? 1.5 : move.type === 'fire' ? 0.5 : 1;
  return 1;
}

export function fieldMultiplier(state: BattleState, attacker: Combatant, move: Move, defender?: Combatant): number {
  const fieldTypes: Record<string, string> = { electric: 'electric', grassy: 'grass', psychic: 'psychic' };
  let value = isGrounded(attacker,state) && fieldTypes[state.field?.id ?? ''] === move.type ? 1.3 : 1;
  if (defender && isGrounded(defender,state)) {
    if (state.field?.id === 'grassy' && move.id === 'earthquake') value *= 0.5;
    if (state.field?.id === 'misty' && move.type === 'dragon') value *= 0.5;
  }
  return value;
}

export function estimateDamage(state: BattleState, attacker: Combatant, defender: Combatant, move: Move, spread = false): number {
  move=weatherBallMove(state,attacker,move);
  if(move.fixedDamage){
    const hit=attacker.lastReceivedHit;
    if(move.fixedDamage==='endeavor')return Math.max(0,defender.hp-attacker.hp);
    return hit?.turn===state.turn&&hit.category===(move.fixedDamage==='counter'?'physical':'special')&&hit.sourceUid===defender.uid?hit.damage*2:0;
  }
  if (move.category === 'status' || move.power <= 0 || isTypeImmune(defender, move,state)) return 0;
  const type = battleTypeMultiplier(state,move,defender);
  if (type === 0) return 0;
  if(move.ohko)return passiveEffects(defender).some(effect=>effect.trigger==='onOHKO')||move.id==='sheercold'&&defender.types.includes('ice')?0:defender.hp;
  const offense = getModifiedStat(attacker, move.category === 'physical' ? 'atk' : 'spa')
    * (attacker.set.abilityId==='solarpower'&&move.category==='special'&&effectiveWeather(state,attacker)==='sun'?1.5:1);
  const defense = defensiveStat(state, defender, move.category === 'physical' ? 'def' : 'spd');
  let multiplier = stabMultiplier(attacker,move);
  multiplier *= type * weatherMultiplier(state, move,attacker) * fieldMultiplier(state, attacker, move, defender)*genderAbilityMultiplier(attacker,defender)*partnerAbilityMultiplier(state,attacker,move);
  multiplier *= damagePassiveMultiplier(attacker, move, 'onAttack') * damagePassiveMultiplier(defender, move, 'onDamage');
  if(attacker.set.abilityId==='sandforce'&&effectiveWeather(state,attacker)==='sand'&&['rock','ground','steel'].includes(move.type))multiplier*=1.3;
  if(move.type==='fairy'&&Object.values(state.sides).some(side=>side.active.some(index=>side.team[index]?.set.abilityId==='fairyaura')))multiplier*=1.33;
  const attackerSide=state.sides.player.team.includes(attacker)?'player':'cpu';
  const defenderSide=state.sides.player.team.includes(defender)?'player':'cpu';
  if(attackerSide!==defenderSide)multiplier*=.75**state.sides[defenderSide].active.map(index=>state.sides[defenderSide].team[index]).filter(mon=>mon&&mon!==defender&&mon.set.abilityId==='friendguard').length;
  if(attacker.set.abilityId==='stakeout'&&defender.enteredTurn===state.turn)multiplier*=2;
  if(type>1)for(const effect of passiveEffects(defender))if(effect.trigger==='onSuperEffectiveDamage'&&(!('type' in effect)||effect.type===move.type)
    &&!(move.ignoreAbility&&abilities[defender.set.abilityId]?.effects.includes(effect)))multiplier*=effect.multiplier;
  multiplier *= screenMultiplier(state,defender,move,false,attacker);
  if (spread) multiplier *= 0.75;
  multiplier *= burnMultiplier(attacker, move);
  if(move.multihit)multiplier*=typeof move.multihit==='number'?move.multihit:passiveEffects(attacker).some(effect=>effect.trigger==='onMultiHit')?move.multihit[1]:3;
  const basePower=dynamicMovePower(state,attacker,weightBasedPower(attacker,defender,move),move);
  const powerMove={...move,power:attacker.helpingHandTurn===state.turn?Math.floor(basePower*1.5):basePower};
  const base = Math.floor(Math.floor(((2 * LEVEL / 5 + 2) * effectiveMovePower(attacker,powerMove) * offense) / defense) / 50) + 2;
  return Math.max(1, Math.floor(base * multiplier * 0.925));
}

/** Resolve power at the moment the move hits, after speed-ordered prior damage. */
export function dynamicMovePower(state:BattleState,attacker:Combatant,base:number,move:Move):number {
  if(move.dynamicPower==='positiveBoosts')return base+20*Object.values(attacker.stages).reduce((total,stage)=>total+Math.max(0,stage),0);
  if(move.dynamicPower==='remainingHp')return Math.max(1,Math.floor(base*attacker.hp/attacker.maxHp));
  if(move.dynamicPower==='faintedAllies'){
    const side=state.sides.player.team.includes(attacker)?'player':'cpu';
    return base+50*state.sides[side].team.filter(pokemon=>pokemon!==attacker&&pokemon.fainted).length;
  }
  return base;
}

/** Tera keeps original STAB; Adaptability affects only the current Tera type. */
export function stabMultiplier(p:Combatant,move:Move):number {
  if(move.id==='struggle') return 1;
  const tera=p.transformation?.kind==='tera';
  const original=(p.original?.types??p.types).includes(move.type),current=p.types.includes(move.type);
  if(tera&&p.transformation?.teraType==='stellar'){
    const first=!(p.stellarBoostedTypes??[]).includes(move.type);
    return first?(original?2:1.2):(original?1.5:1);
  }
  let value=tera?(current&&original?2:current||original?1.5:1):(current?1.5:1);
  if(current) for(const e of passiveEffects(p)) if(e.trigger==='onAttack'&&e.kind==='stabMultiplier') value=tera&&original?2.25:e.multiplier;
  return value;
}

export function effectiveMovePower(p:Combatant,move:Move):number {
  if(p.transformation?.kind!=='tera'||move.powered||move.ohko||move.power>=60||move.priority>0||move.multihit)return move.power;
  const teraType=p.transformation.teraType;
  return teraType==='stellar' ? (p.stellarBoostedTypes??[]).includes(move.type)?move.power:60 : teraType===move.type?60:move.power;
}

function effectiveWeightKg(p:Combatant):number {
  const base=Math.max(.1,species[p.set.speciesId]?.weightKg??1);
  return p.set.abilityId==='heavymetal'?base*2:p.set.abilityId==='lightmetal'?base/2:base;
}

/** Weight-based move power including Heavy Metal and Light Metal. */
export function weightBasedPower(attacker:Combatant,defender:Combatant,move:Move):number {
  if(move.id==='lowkick'||move.id==='grassknot'){
    const weight=effectiveWeightKg(defender);
    return weight<=10?20:weight<=25?40:weight<=50?60:weight<=100?80:weight<=200?100:120;
  }
  if(move.id==='heavyslam'||move.id==='heatcrash'){
    const ratio=effectiveWeightKg(attacker)/effectiveWeightKg(defender);
    return ratio>=5?120:ratio>=4?100:ratio>=3?80:ratio>=2?60:40;
  }
  return move.power;
}

/** Reflect/Light Screen/Aurora Veil never stack; critical hits ignore them. */
export function screenMultiplier(state:BattleState,defender:Combatant,move:Move,critical:boolean,attacker?:Combatant):number {
  if(critical||attacker&&passiveEffects(attacker).some(effect=>effect.trigger==='onAttack'&&effect.kind==='ignoreScreens'))return 1;
  const side=state.sides.player.team.includes(defender)?state.sides.player:state.sides.cpu;
  const screens=side.screens;
  const active=screens?.auroraveil||(move.category==='physical'?screens?.reflect:move.category==='special'?screens?.lightscreen:0);
  return active?(state.format==='doubles'?2/3:1/2):1;
}
