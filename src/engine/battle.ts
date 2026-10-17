import { abilities, items, moves, natures, species } from '../data';
import {
  calculateStats, damagePassiveMultiplier, effectiveSpeed, fieldMultiplier, getModifiedStat, auraPowerMultiplier, ruinStatMultiplier,
  getTypeMultiplier, battleTypeMultiplier, isTypeImmune, passiveEffects, weatherMultiplier, LEVEL,
  matchingDamageEffects, burnMultiplier, moveAccuracy, secondaryChance, effectiveMovePower,
  alwaysHits, defensiveStat, criticalChance, isGrounded,
  partnerAbilityMultiplier, genderAbilityMultiplier,
  effectiveWeather, weightBasedPower,
  dynamicMovePower,
  weatherBallMove,
} from './calculations';
import {
  activePokemon, addLog, applyDamage, applyEntryEffects, applyHeal, applyStatus,
  displayName, getPokemonAt, processEndTurn, triggerContact, triggerSuperEffectiveHit, resistBerryMultiplier,
  announcePassive, absorbMove, applyExitEffects, applyStatChange, passiveSource, transformCombatant, restoreTransform, restoreAbilityBattleForm, refreshAbilityTypes, setBattleWeather,
} from './effects';
import { startRecording, stopRecording, withEventContext } from './events';
import { chance, random, randomInt } from './rng';
import { chooseCpuActions } from './ai';
import { isMoveUsable, usableMoves } from './choices';
import { applyVolatile, processConfusion, processFlinch } from './conditions';
import { fieldLabel, statLabel, weatherLabel } from './labels';
import { activateGimmick, applyExclusiveZEffect, applyMaxEffect, applyZStatus, endDynamax, finishGimmickTurn, gimmickReason, gimmickSetErrors, megaFormFor, previewMove, restoreBattleForms } from './gimmicks';
import { stabMultiplier } from './calculations';
import { applyHazards, applyTacticalEffect, finishTactics } from './tactics';
import { screenMultiplier } from './calculations';
import type {
  BattleAction, BattleEvent, BattleOptions, BattleState, Combatant, Move, MoveEffect,
  Side, SideState, TargetRef, TeamSet,
} from './types';

const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
const BOOST_KEYS = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'] as const;

export function validateTeam(team: TeamSet[]): string[] {
  const errors: string[] = [];
  if (team.length < 1 || team.length > 6) errors.push('A team must contain 1–6 Pokémon.');
  for (const [index, set] of team.entries()) {
    errors.push(...gimmickSetErrors(set));
    const label = `Pokémon ${index + 1}`;
    const mon = species[set.speciesId];
    if (!mon) { errors.push(`${label}: unknown species.`); continue; }
    if(set.gender){const ratio=mon.genderRatio??{M:.5,F:.5};if(set.gender==='N'?(ratio.M??0)+(ratio.F??0)>0:(ratio[set.gender]??0)<=0)errors.push(`${label}: invalid gender.`);}
    if (!mon.abilities.includes(set.abilityId) || !abilities[set.abilityId]) errors.push(`${label}: invalid ability.`);
    if (!items[set.itemId]) errors.push(`${label}: invalid item.`);
    if (!natures[set.natureId]) errors.push(`${label}: invalid nature.`);
    if (set.moves.length !== (set.speciesId==='ditto'?1:4) || new Set(set.moves).size !== set.moves.length) errors.push(`${label}: choose ${set.speciesId==='ditto'?'Transform':'four different moves'}.`);
    for (const moveId of set.moves) if (!moves[moveId] || !mon.learnset.includes(moveId)) errors.push(`${label}: cannot use ${moveId}.`);
    const totalEv = STAT_KEYS.reduce((sum, stat) => sum + (set.evs?.[stat] ?? 0), 0);
    if (totalEv > 510) errors.push(`${label}: EV total exceeds 510.`);
    for (const stat of STAT_KEYS) {
      const ev = set.evs?.[stat] ?? 0;
      const iv = set.ivs?.[stat] ?? 31;
      if (!Number.isInteger(ev) || ev < 0 || ev > 252) errors.push(`${label}: ${stat} EV must be 0–252.`);
      if (!Number.isInteger(iv) || iv < 0 || iv > 31) errors.push(`${label}: ${stat} IV must be 0–31.`);
    }
  }
  return errors;
}

function createCombatant(set: TeamSet, side: Side, index: number): Combatant {
  const mon = species[set.speciesId];
  const stats = calculateStats(mon, set);
  return {
    uid: `${side}-${index}`, set: structuredClone(set), speciesName: mon.name, types: [...mon.types],
    stats, hp: stats.hp, maxHp: stats.hp, status: null, sleepTurns: 0,
    ...(set.abilityId==='stancechange'?{stanceForm:'shield' as const}:{}),
    ...(set.abilityId==='slowstart'?{slowStartTurns:5}:{}),
    stages: Object.fromEntries(BOOST_KEYS.map(stat => [stat, 0])) as Combatant['stages'],
    pp: Object.fromEntries(set.moves.map(id => [id, moves[id].pp])), usedMoveIds:[], protected: false, fainted: false,
  };
}

export function createBattle(options: BattleOptions): BattleState {
  const issues = [...validateTeam(options.playerTeam), ...validateTeam(options.cpuTeam)];
  if (issues.length) throw new Error(issues.join(' '));
  const slots = options.format === 'doubles' ? 2 : 1;
  const sides: Record<Side, SideState> = {
    player: { team: options.playerTeam.map((set, index) => createCombatant(set, 'player', index)), active: [], gimmick:{used:false} },
    cpu: { team: options.cpuTeam.map((set, index) => createCombatant(set, 'cpu', index)), active: [], gimmick:{used:false} },
  };
  for (const side of ['player', 'cpu'] as const) sides[side].active = sides[side].team.slice(0, slots).map((_, index) => index);
  const state: BattleState = {
    manualReplacementSides: options.manualReplacementSides,
    format: options.format, turn: 1, sides, weather: null, field: null, log: [], winner: null,
    rngState: (options.seed ?? Date.now()) >>> 0 || 0x6d2b79f5,
  };
  for(const side of ['player','cpu'] as const)for(const pokemon of state.sides[side].team){
    const ratio=species[pokemon.set.speciesId].genderRatio;
    const male=ratio?.M??.5,female=ratio?.F??.5;
    // Gender defaults have their own deterministic roll so adding gender data does not shift battle RNG.
    const stableRoll=(((options.seed??0)^pokemon.uid.split('').reduce((hash,char)=>Math.imul(hash,31)+char.charCodeAt(0)|0,17))>>>0)/0x100000000;
    pokemon.gender=pokemon.set.gender??(male+female===0?'N':male===0?'F':female===0?'M':stableRoll<male?'M':'F');
  }
  addLog(state, `${options.format === 'doubles' ? '더블' : '싱글'} 배틀 시작!`);
  for (const side of ['player', 'cpu'] as const) {
    for (const pokemon of activePokemon(state, side)) {
      addLog(state, `${side === 'player' ? '플레이어' : 'CPU'}: ${displayName(pokemon)} 출전!`, 'switch');
      applyEntryEffects(state, side, pokemon);
    }
  }
  return state;
}

function fallbackAction(state: BattleState, side: Side, slot: number): BattleAction {
  const pokemon = getPokemonAt(state, { side, slot });
  const available = pokemon ? usableMoves(pokemon) : [];
  const move = available.find(candidate => !candidate.focus) ?? available[0];
  return { kind: 'move', slot, moveId: move?.id ?? 'struggle' };
}

function normalizeActions(state: BattleState, side: Side, submitted: BattleAction[]): BattleAction[] {
  const occupied = new Set<number>(state.sides[side].active);
  const reserved = new Set<number>();
  return state.sides[side].active.flatMap((teamIndex, slot) => {
    const actor = state.sides[side].team[teamIndex];
    if (!actor || actor.fainted) return [];
    const forced=actor.charging??actor.rampage;
    if(forced)return [{kind:'move' as const,slot,moveId:forced.moveId,target:forced.target}];
    const action = submitted.find(candidate => candidate.slot === slot);
    if (action?.kind === 'switch') {
      const replacement = state.sides[side].team[action.to];
      if ((!actor.trapped||actor.set.itemId==='shedshell'&&!actor.itemConsumed) && replacement && !replacement.fainted && !occupied.has(action.to) && !reserved.has(action.to)) {
        reserved.add(action.to);
        return [action];
      }
    }
    if (action?.kind === 'move') {
      const maxActivation=action.gimmick==='dynamax'&&!gimmickReason(state,side,actor,'dynamax',action.moveId);
      const permitted=maxActivation?{...actor,transformation:{kind:'dynamax' as const}}:actor;
      const megaActivation=action.gimmick==='mega'&&!gimmickReason(state,side,actor,'mega',action.moveId);
      const megaForm=megaActivation?megaFormFor(actor):undefined;
      const projected=megaForm?{...permitted,transformation:{kind:'mega' as const,formId:megaForm.id}}:permitted;
      if(isMoveUsable(projected,action.moveId,action.gimmick==='z'&&!gimmickReason(state,side,actor,'z',action.moveId))) return [{...action}];
    }
    return [fallbackAction(state, side, slot)];
  });
}

function otherSide(side: Side): Side { return side === 'player' ? 'cpu' : 'player'; }

function resolveTargets(state: BattleState, side: Side, slot: number, move: Move, requested?: TargetRef): TargetRef[] {
  const foe = otherSide(side);
  const activeRefs = (targetSide: Side): TargetRef[] => state.sides[targetSide].active.flatMap((_, targetSlot) => {
    const pokemon = getPokemonAt(state, { side: targetSide, slot: targetSlot });
    return pokemon && !pokemon.fainted ? [{ side: targetSide, slot: targetSlot }] : [];
  });
  if (move.target === 'self') return [{ side, slot }];
  if (move.target === 'allAllies') return activeRefs(side);
  if (move.target === 'allyOrSelf') {
    const allies=activeRefs(side);
    return requested&&allies.some(ref=>ref.slot===requested.slot&&ref.side===requested.side)?[requested]:[{side,slot}];
  }
  if (move.target === 'allEnemies') return activeRefs(foe);
  if (move.target === 'allOthers') return [...activeRefs(side).filter(ref => ref.slot !== slot), ...activeRefs(foe)];
  if (move.target === 'ally') {
    const allies = activeRefs(side).filter(ref => ref.slot !== slot);
    return requested && allies.some(ref => ref.slot === requested.slot && ref.side === requested.side) ? [requested] : allies.slice(0, 1);
  }
  let choices = move.target === 'any' ? [...activeRefs(foe), ...activeRefs(side).filter(ref => ref.slot !== slot)] : activeRefs(foe);
  const attacker=getPokemonAt(state,{side,slot});
  if(attacker?.set.abilityId!=='stalwart'&&!move.ignoreAbility&&(move.target==='enemy'||move.target==='any')){
    const redirects=activeRefs(foe).filter(ref=>{
      const mon=getPokemonAt(state,ref)!;
      return mon.redirectTurn===state.turn&&(!mon.redirectPowder||!mon.types.includes('grass')&&mon.set.abilityId!=='overcoat'&&mon.set.itemId!=='safetygoggles');
    });
    const redirect=redirects.at(-1);
    if(redirect)choices=[redirect];
  }
  return requested && choices.some(ref => ref.slot === requested.slot && ref.side === requested.side) ? [requested] : choices.slice(0, 1);
}

function accuracyHits(state: BattleState, user: Combatant, target: Combatant, move: Move): boolean {
  const hidden=target.charging&&moves[target.charging.moveId]?.semiInvulnerable;
  if(hidden){
    const exceptions:Record<NonNullable<Move['semiInvulnerable']>,string[]>={
      underground:['earthquake','magnitude','fissure'],underwater:['surf','whirlpool'],
      airborne:['gust','twister','thunder','hurricane','skyuppercut','smackdown','thousandarrows'],vanished:[],
    };
    if(!exceptions[hidden].includes(move.id))return false;
  }
  if (alwaysHits(state, move, user, target)) return true;
  return chance(state, moveAccuracy(state, user, target, move));
}

function moveDamage(state: BattleState, attacker: Combatant, defender: Combatant, move: Move, spread: boolean, hitSubstitute=false): { damage: number; critical: boolean; effectiveness: number } {
  move=weatherBallMove(state,attacker,move);
  const effectiveness = move.id === 'struggle' ? 1 : battleTypeMultiplier(state,move,defender,attacker);
  if (effectiveness === 0 || move.id !== 'struggle' && isTypeImmune(defender, move,state)) return { damage: 0, critical: false, effectiveness: 0 };
  if(move.fixedHpFraction!==undefined){const baseMaxHp=defender.transformation?.kind==='dynamax'?(defender.original?.maxHp??defender.maxHp):defender.maxHp;const currentHp=defender.transformation?.kind==='dynamax'?Math.floor(defender.hp*baseMaxHp/defender.maxHp):defender.hp;const hp=move.fixedHpBasis==='current'?currentHp:baseMaxHp;return {damage:Math.max(1,Math.floor(hp*move.fixedHpFraction)),critical:false,effectiveness};}
  const critical = chance(state, criticalChance(attacker, defender, move));
  const attackStat = move.category === 'physical' ? 'atk' : 'spa';
  const defenseStat = move.category === 'physical'||['psystrike','psyshock','secretsword'].includes(move.id) ? 'def' : 'spd';
  const defenderUnaware = !move.ignoreAbility&&passiveEffects(defender).some(effect => effect.trigger === 'onDamage' && effect.kind === 'ignoreFoeStages');
  const attackerUnaware = passiveEffects(attacker).some(effect => effect.trigger === 'onAttack' && effect.kind === 'ignoreFoeStages');
  const attack = getModifiedStat(attacker, attackStat, defenderUnaware ? 'all' : critical ? 'negative' : null)*ruinStatMultiplier(state,attacker,attackStat)
    * (attacker.set.abilityId==='solarpower'&&move.category==='special'&&effectiveWeather(state,attacker)==='sun'?1.5:1);
  const defense = defensiveStat(state, defender, defenseStat, attackerUnaware||move.ignoreDefenderStages ? 'all' : critical ? 'positive' : null)*ruinStatMultiplier(state,defender,defenseStat);
  const basePower=dynamicMovePower(state,attacker,weightBasedPower(attacker,defender,move),move);
  const powerMove={...move,power:attacker.helpingHandTurn===state.turn?Math.floor(basePower*1.5):basePower};
  const base = Math.floor(Math.floor(((2 * LEVEL / 5 + 2) * effectiveMovePower(attacker,powerMove) * attack) / defense) / 50) + 2;
  const stab = stabMultiplier(attacker,move);
  let modifier = stab * effectiveness * (effectiveness<1&&attacker.set.abilityId==='tintedlens'?2:1) * weatherMultiplier(state, move,attacker) * fieldMultiplier(state, attacker, move, defender);
  modifier *= damagePassiveMultiplier(attacker, move, 'onAttack') * damagePassiveMultiplier(defender, move, 'onDamage')*genderAbilityMultiplier(attacker,defender)*partnerAbilityMultiplier(state,attacker,move);
  if(move.id==='knockoff'&&defender.set.itemId!=='none'&&!defender.itemConsumed)modifier*=1.5;
  if(attacker.set.abilityId==='analytic'&&defender.movedTurn===state.turn)modifier*=1.3;
  if(move.type==='electric'&&attacker.electromorphosisCharged)modifier*=2;
  if(attacker.set.abilityId==='sandforce'&&effectiveWeather(state,attacker)==='sand'&&['rock','ground','steel'].includes(move.type))modifier*=1.3;
  modifier*=auraPowerMultiplier(state,move);
  if(attacker.set.abilityId==='hadronengine'&&move.category==='special'&&state.field?.id==='electric')modifier*=4/3;
  if(['electrodrift','collisioncourse'].includes(move.id)&&effectiveness>1)modifier*=4/3;
  if(['behemothblade','behemothbash','dynamaxcannon'].includes(move.id)&&defender.transformation?.kind==='dynamax')modifier*=2;
  const defenderSide:Side=state.sides.player.team.includes(defender)?'player':'cpu';
  const attackerSide:Side=state.sides.player.team.includes(attacker)?'player':'cpu';
  if(attackerSide!==defenderSide)modifier*=.75**activePokemon(state,defenderSide).filter(mon=>mon!==defender&&mon.set.abilityId==='friendguard').length;
  if(attacker.set.abilityId==='stakeout'&&defender.enteredTurn===state.turn)modifier*=2;
  if(!hitSubstitute)modifier *= resistBerryMultiplier(state,defender,move,effectiveness);
  modifier *= screenMultiplier(state,defender,move,critical,attacker);
  if (critical) modifier *= attacker.set.abilityId==='sniper'?2.25:1.5;
  if (spread) modifier *= 0.75;
  modifier *= burnMultiplier(attacker, move);
  modifier *= randomInt(state, 85, 100) / 100;
  return { damage: Math.max(1, Math.floor(base * modifier)), critical, effectiveness };
}

function setAegislashStance(state:BattleState,pokemon:Combatant,form:'shield'|'blade'):void {
  if(pokemon.set.abilityId!=='stancechange'||pokemon.set.speciesId!=='aegislash'||pokemon.stanceForm===form)return;
  const baseStats=form==='blade'?{hp:60,atk:140,def:50,spa:140,spd:50,spe:60}:{hp:60,atk:50,def:140,spa:50,spd:140,spe:60};
  const mon=species[pokemon.set.speciesId];
  if(!mon)return;
  pokemon.stats=calculateStats({...mon,baseStats},pokemon.set);
  pokemon.stanceForm=form;
  addLog(state,`${displayName(pokemon)}이(가) ${form==='blade'?'블레이드폼':'실드폼'}으로 변했다!`,'status',{kind:'ability',actorUid:pokemon.uid,sourceId:'stancechange',sourceKind:'ability'});
}

function canTransferHeldItem(pokemon:Combatant):boolean {
  const id=pokemon.set.itemId;
  return id!=='none'&&!pokemon.itemConsumed&&!['rustedsword','rustedshield','dynamaxband'].includes(id)&&(id==='eviolite'||!/(?:ite(?:x|y)?|iumz|niumz|orbs?|memory)$/.test(id));
}
function canRemoveHeldItem(pokemon:Combatant):boolean {
  const id=pokemon.set.itemId;
  return id!=='none'&&!pokemon.itemConsumed&&!['rustedsword','rustedshield','dynamaxband'].includes(id)&&(id==='eviolite'||!/(?:ite(?:x|y)?|iumz|niumz|orbs?|memory)$/.test(id));
}

function applyMoveEffect(state: BattleState, effect: MoveEffect, user: Combatant, target: Combatant, damageDealt: number, moveName: string): void {
  if ('chance' in effect && effect.chance !== undefined && !chance(state, secondaryChance(user, effect.chance))) return;
  if(applyTacticalEffect(state,effect,user,target))return;
  if (effect.kind === 'status') {
    const recipient=effect.target==='self'?user:target;
    if(applyStatus(state,recipient,effect.status,displayName(user),user)&&effect.badlyPoisoned&&recipient.status==='poison'){
      recipient.toxicCounter=1;
      addLog(state,`${displayName(recipient)}이(가) 맹독에 걸렸다!`,'status',{targetUid:recipient.uid});
    }
  }
  else if (effect.kind === 'volatile') applyVolatile(state, target, effect.condition);
  else if (effect.kind === 'stat') {
    const recipient = effect.target === 'self' ? user : target;
    applyStatChange(state, recipient, effect.stat, effect.stages, user);
  } else if (effect.kind === 'heal') {
    const weather=effectiveWeather(state,user);
    const fraction=effect.weatherAdjusted==='sun'?(weather==='sun'?2/3:weather?1/4:effect.fraction)
      :effect.weatherAdjusted==='sand'&&weather==='sand'?2/3:effect.fraction;
    applyHeal(state, effect.target === 'target' ? target : user, effect.pulseBoost&&user.set.abilityId==='megalauncher'?3/4:fraction, displayName(user));
  } else if(effect.kind==='helpingHand') {
    if(target===user||target.actedTurn===state.turn){addLog(state,'도우미를 받을 아군이 행동을 마쳤다!','status',{kind:'blocked',targetUid:target.uid});return;}
    target.helpingHandTurn=state.turn;
    addLog(state,`${displayName(user)}의 도우미로 ${displayName(target)}의 기술이 강해졌다!`,'status',{targetUid:target.uid});
  } else if(effect.kind==='dragonCheer') {
    if(target.dragonCheerCritStages){addLog(state,`${displayName(target)}은(는) 이미 응원을 받았다!`,'status',{kind:'blocked',targetUid:target.uid});return;}
    target.dragonCheerCritStages=target.types.includes('dragon')?2:1;
    addLog(state,`${displayName(target)}의 급소 확률이 올랐다!`,'status',{targetUid:target.uid});
  } else if(effect.kind==='acupressure') {
    const stats=BOOST_KEYS.filter(stat=>target.stages[stat]<6);
    if(!stats.length){addLog(state,`${displayName(target)}의 능력치를 더 높일 수 없다!`,'status',{kind:'blocked',targetUid:target.uid});return;}
    applyStatChange(state,target,stats[randomInt(state,0,stats.length-1)],2,user);
  } else if(effect.kind==='teamCure') {
    const side:Side=state.sides.player.team.includes(user)?'player':'cpu';
    for(const ally of state.sides[side].team)if(ally.status){ally.status=null;ally.sleepTurns=0;ally.toxicCounter=undefined;
      addLog(state,`${displayName(ally)}의 상태 이상이 나았다!`,'status',{targetUid:ally.uid,status:null});}
  }
  else if (effect.kind === 'weather') {
    const weatherRock:Record<string,string>={rain:'damprock',sun:'heatrock',snow:'icyrock',sand:'smoothrock'};
    const turns=user.set.itemId===weatherRock[effect.weather]&&!user.itemConsumed?8:effect.turns??5;
    if(setBattleWeather(state,effect.weather,turns))addLog(state, `${weatherLabel[effect.weather]} 시작!`, 'status', { kind: 'weather' });
    else addLog(state,'강한 날씨가 다른 날씨를 밀어냈다!','status',{kind:'blocked'});
  } else if (effect.kind === 'field') {
    state.field = { id: effect.field, turns: user.set.itemId==='terrainextender'&&!user.itemConsumed?8:effect.turns ?? 5 };
    addLog(state, `${fieldLabel[effect.field]} 전개!`, 'status', { kind: 'field' });
    refreshAbilityTypes(state);
  } else if (effect.kind === 'drain' && damageDealt) {
    const amount=Math.max(1,Math.floor(damageDealt*effect.fraction));
    if(target.set.abilityId==='liquidooze')applyDamage(state,user,amount,'액체괴물');
    else applyHeal(state,user,(damageDealt*effect.fraction*(user.set.itemId==='bigroot'&&!user.itemConsumed?1.3:1))/(user.original?.maxHp??user.maxHp),'drain');
  }
  else if (effect.kind === 'recoil' && damageDealt && user.set.abilityId!=='magicguard' && (effect.basis==='maxHp'||!passiveEffects(user).some(passive=>passive.trigger==='onRecoil'&&passive.kind==='immunity')))
    withEventContext(state, { targetUid: user.uid, moveId: undefined, category: undefined }, () =>
      applyDamage(state, user, Math.max(1, Math.floor((effect.basis === 'maxHp' ? user.maxHp : damageDealt) * effect.fraction)), `${moveName}의 반동`));
  else if(effect.kind==='saltCure'&&damageDealt&&!target.fainted){target.saltCured=true;addLog(state,`${displayName(target)}이 소금절이에 걸렸다!`,'status',{targetUid:target.uid});}
  else if(effect.kind==='aquaRing'){
    if(user.aquaRing)addLog(state,`${displayName(user)}은(는) 이미 아쿠아링에 둘러싸여 있다!`,'status',{kind:'blocked',targetUid:user.uid});
    else {user.aquaRing=true;addLog(state,`${displayName(user)}을(를) 아쿠아링이 감쌌다!`,'status',{targetUid:user.uid});}
  }
  else if(effect.kind==='yawn'){
    if(target.status||target.yawnTurns||target.set.abilityId==='insomnia'||target.set.abilityId==='vitalspirit'
      ||state.field?.id==='electric'&&isGrounded(target,state))addLog(state,`${displayName(target)}에게 하품이 통하지 않았다!`,'status',{kind:'blocked',targetUid:target.uid});
    else {target.yawnTurns=2;addLog(state,`${displayName(target)}이(가) 졸리기 시작했다!`,'status',{targetUid:target.uid});}
  }
  else if(effect.kind==='attract'){
    if(!user.gender||!target.gender||user.gender==='N'||target.gender==='N'||user.gender===target.gender||target.set.abilityId==='oblivious')
      addLog(state,`${displayName(target)}에게 헤롱헤롱이 통하지 않았다!`,'status',{kind:'blocked',targetUid:target.uid});
    else {target.infatuatedBy=user.uid;addLog(state,`${displayName(target)}이(가) ${displayName(user)}에게 반했다!`,'status',{targetUid:target.uid});
      if(target.set.itemId==='destinyknot'&&!target.itemConsumed&&user.set.abilityId!=='oblivious'){
        user.infatuatedBy=target.uid;
        addLog(state,`${displayName(target)}의 빨간실이 헤롱헤롱을 되돌렸다!`,'status',{kind:'item',actorUid:target.uid,targetUid:user.uid,sourceId:'destinyknot',sourceKind:'item'});
      }
    }
  }
  else if(effect.kind==='entrainment'){
    const unchangeable=new Set(['multitype','stancechange','schooling','disguise','battlebond','comatose','protosynthesis','quarkdrive','zenmode','hunger','iceface','gulping','gorging']);
    if(user===target||unchangeable.has(user.set.abilityId)||unchangeable.has(target.set.abilityId)||user.set.abilityId===target.set.abilityId)
      addLog(state,`${displayName(target)}의 특성을 바꿀 수 없다!`,'status',{kind:'blocked',targetUid:target.uid});
    else {target.abilityBeforeChange??=target.set.abilityId;target.set.abilityId=user.set.abilityId;addLog(state,`${displayName(target)}의 특성이 ${abilities[target.set.abilityId]?.name??target.set.abilityId}(으)로 바뀌었다!`,'status',{targetUid:target.uid});}
  }
  else if(effect.kind==='rest'){
    if(user.hp===user.maxHp&&!user.status){addLog(state,`${displayName(user)}은(는) 잠자기를 사용할 필요가 없다!`,'status',{kind:'blocked',targetUid:user.uid});return;}
    const previous=user.status;user.status=null;
    if(!applyStatus(state,user,'sleep',displayName(user),user)){user.status=previous;return;}
    applyHeal(state,user,1,displayName(user));
    if(user.status==='sleep')user.sleepTurns=2;
  }
  else if(effect.kind==='substitute'){
    const cost=Math.max(1,Math.floor(user.maxHp/4));
    if(user.substituteHp||user.hp<=cost){addLog(state,`${displayName(user)}은 대타출동을 사용할 수 없다!`,'status',{kind:'blocked',targetUid:user.uid});return;}
    applyDamage(state,user,cost,'대타출동');
    user.substituteHp=cost;
    addLog(state,`${displayName(user)}의 대타출동이 생겼다!`,'status',{targetUid:user.uid});
  }
  else if(effect.kind==='forceSwitch'){
    const side:Side=state.sides.player.team.includes(target)?'player':'cpu';
    const own=state.sides[side],slot=own.active.findIndex(index=>own.team[index].uid===target.uid);
    const bench=own.team.flatMap((pokemon,index)=>!pokemon.fainted&&!own.active.includes(index)?[index]:[]);
    if(slot<0||!bench.length||target.transformation?.kind==='dynamax'||target.set.abilityId==='suctioncups'){
      addLog(state,`${displayName(target)}을(를) 강제로 교체할 수 없다!`,'status',{kind:'blocked',targetUid:target.uid});return;
    }
    executeSwitch(state,side,{kind:'switch',slot,to:bench[randomInt(state,0,bench.length-1)]});
  }
  else if(effect.kind==='trap'){
    if(target.types.includes('ghost')||target===user||target.fainted)addLog(state,`${displayName(target)}에게는 ${moveName}으로 교체 봉쇄를 걸 수 없다!`,'status',{kind:'blocked',targetUid:target.uid});
    else {target.trapped=true;target.trappedBy=user.uid;addLog(state,`${displayName(target)}은(는) ${moveName}의 파도에 갇혀 교체할 수 없게 되었다!`,'status',{targetUid:target.uid});}
  }
  else if(effect.kind==='suppressAbility'){
    if(target.movedTurn!==state.turn||target===user||target.fainted||target.set.abilityId==='none')return;
    if(['multitype','rkssystem','powerconstruct','terashift','teraformzero','stancechange','schooling','disguise','battlebond','comatose','iceface','gulping','gorging'].includes(target.set.abilityId)){
      addLog(state,`${displayName(target)}의 ${abilities[target.set.abilityId]?.name??target.set.abilityId}은 억눌리지 않는다!`,'status',{kind:'blocked',actorUid:user.uid,targetUid:target.uid});
      return;
    }
    target.abilityBeforeChange??=target.set.abilityId;target.set.abilityId='none';
    addLog(state,`${displayName(target)}의 특성이 ${moveName}에 억눌렸다!`,'status',{kind:'message',targetUid:target.uid});
  }
  else if(effect.kind==='recharge'&&damageDealt)user.rechargeTurns=1;
  else if(effect.kind==='cureBurn'&&damageDealt&&target.status==='burn'){
    target.status=null;addLog(state,`${displayName(target)}의 화상이 나았다!`,'status',{targetUid:target.uid,status:null});
  }
  else if (effect.kind === 'protect') {
    const streak = user.lastProtectTurn === state.turn - 1 ? user.protectStreak ?? 0 : 0;
    user.lastProtectTurn = state.turn;
    if (streak > 0 && !chance(state, 100 / 3 ** streak)) {
      user.protectStreak = 0;
      addLog(state, `${displayName(user)}의 연속 방어가 실패했다!`, 'status', { kind: 'miss', targetUid: user.uid });
      return;
    }
    user.protectStreak = streak + 1;
    user.protected = true;
    user.maxGuard = user.transformation?.kind==='dynamax';
    addLog(state, `${displayName(user)} 방어 성공!`, 'status', { kind: 'protect', targetUid: user.uid });
  }
}

const STRUGGLE: Move = { id: 'struggle', name: '발버둥', type: 'normal', category: 'physical', power: 50, accuracy: null, pp: 1, priority: 0, target: 'enemy', contact: true, effects: [{ kind: 'recoil', fraction: 0.25, basis: 'maxHp' }] };

function applyMoveSelfCost(state: BattleState, user: Combatant, move: Move): void {
  if (!move.selfCostFraction || user.fainted) return;
  const amount = Math.max(1, Math.ceil(user.maxHp * move.selfCostFraction));
  withEventContext(state, { targetUid: user.uid, moveId: undefined, category: undefined }, () =>
    applyDamage(state, user, amount, `${move.name}의 반동`));
}

function priorityEffect(user: Combatant, move: Move) {
  const effect = passiveEffects(user).find(effect => effect.trigger === 'onPriority' && effect.kind === 'priorityBoost' && effect.category === move.category);
  return effect?.kind === 'priorityBoost' ? effect : undefined;
}

function effectivePriority(state:BattleState,user: Combatant, move: Move): number {
  let value=move.priority+(priorityEffect(user, move)?.stages ?? 0);
  if(!user.itemConsumed&&user.set.itemId==='quickclaw'&&chance(state,20))value+=.1;
  if(!user.itemConsumed&&user.set.itemId==='laggingtail')value-=.1;
  if(user.set.abilityId==='galewings'&&move.type==='flying'&&user.hp===user.maxHp)value++;
  if(user.set.abilityId==='quickdraw'){
    if(user.quickDrawCheckedTurn!==state.turn){user.quickDrawCheckedTurn=state.turn;user.quickDrawTurn=chance(state,30)?state.turn:-1;}
    if(user.quickDrawTurn===state.turn)value+=.1;
  }
  if(user.set.abilityId==='stall')value-=.1;
  return value;
}

function triggerBlunderPolicy(state:BattleState,user:Combatant):void{
  if(user.set.itemId!=='blunderpolicy'||user.itemConsumed)return;
  user.itemConsumed=true;user.consumedItemTurn=state.turn;
  addLog(state,`${displayName(user)}의 ${items.blunderpolicy.name}이(가) 발동했다!`,'status',{kind:'item',actorUid:user.uid,sourceId:'blunderpolicy',sourceKind:'item'});
  applyStatChange(state,user,'spe',2,user,'blunderpolicy');
}

function executeMove(state: BattleState, side: Side, action: Extract<BattleAction, { kind: 'move' }>): void {
  const user = getPokemonAt(state, { side, slot: action.slot });
  if (!user || user.fainted) return;
  if(user.rechargeTurns){user.rechargeTurns--;addLog(state,`${displayName(user)}은(는) 반동으로 움직일 수 없다!`,'status',{kind:'blocked',targetUid:user.uid});return;}
  const forcedId=user.charging?.moveId??user.rampage?.moveId??(action.gimmick!=='z'&&user.transformation?.kind!=='dynamax'&&user.encore&&isMoveUsable(user,user.encore.moveId)?user.encore.moveId:action.moveId);
  const baseMove = forcedId === 'struggle' ? STRUGGLE : moves[forcedId];
  if (!baseMove) return;
  const continuingCharge=user.charging?.moveId===baseMove.id;
  const continuingRampage=user.rampage?.moveId===baseMove.id;
  const stopRampage=()=>{if(continuingRampage&&!user.fainted){user.rampage=undefined;addLog(state,`${displayName(user)}의 ${baseMove.name} 연속 사용이 끊겼다!`,'status',{kind:'message',targetUid:user.uid});}};
  if(continuingCharge)user.charging=undefined;
  const move = {...weatherBallMove(state,user,previewMove(user,baseMove,action.gimmick==='z'?'z':undefined))};
  // Expanding Force changes from a single-target move to a spread move only
  // while its grounded user is standing in Psychic Terrain.
  if(move.id==='expandingforce'&&state.field?.id==='psychic'&&isGrounded(user,state))move.target='allEnemies';
  if(user.set.abilityId==='longreach')move.contact=false;
  if(move.id==='aurawheel'&&user.set.speciesId==='morpeko'&&user.morpekoHangry)move.type='dark';
  if(user.disabledMove?.turns&&user.disabledMove.moveId===move.id){addLog(state,`${displayName(user)}은(는) ${move.name}을(를) 봉인당해 사용할 수 없다!`,'status',{kind:'blocked',targetUid:user.uid});stopRampage();return;}
  if(user.set.abilityId==='liquidvoice'&&move.sound)move.type='water';
  if(['explosion','selfdestruct','mistyexplosion','mindblown'].includes(move.id)
    &&[...activePokemon(state,'player'),...activePokemon(state,'cpu')].some(mon=>mon.set.abilityId==='damp')){
    addLog(state,`${displayName(user)}의 ${move.name}은(는) 축축한 특성 때문에 실패했다!`,'move',{kind:'blocked',moveId:move.id});return;
  }
  if(user.tormentedMove&&user.tormentedMove.turns>0&&user.tormentedMove.moveId===move.id){
    addLog(state,`${displayName(user)}은(는) 같은 기술을 연속으로 사용할 수 없다!`,'status',{kind:'blocked',targetUid:user.uid});stopRampage();return;
  }
  if(passiveEffects(user).some(effect=>effect.trigger==='onAttack'&&effect.kind==='ignoreTargetAbility'))move.ignoreAbility=true;
  if(move.contact&&passiveEffects(user).some(effect=>effect.trigger==='onAttack'&&effect.kind==='bypassProtect'))move.bypassProtect=true;
  if(['protean','libero'].includes(user.set.abilityId)&&!user.proteanUsed&&user.transformation?.kind!=='tera'&&move.type!=='stellar'){
    user.types=[move.type];user.proteanUsed=true;
    addLog(state,`${displayName(user)}의 변환자재! ${move.type} 타입으로 변했다!`,'status',{kind:'ability',actorUid:user.uid,sourceId:'protean',sourceKind:'ability'});
  }
  if (user.status === 'sleep') {
    if(user.sleepTurns>0){user.sleepTurns=Math.max(0,user.sleepTurns-(user.set.abilityId==='earlybird'?2:1));addLog(state,`${displayName(user)} 잠들어 있다.`,'status',{kind:'blocked',targetUid:user.uid});stopRampage();return;}
    user.status = null;
    addLog(state, `${displayName(user)} 잠에서 깨어났다!`, 'status', { targetUid: user.uid, status: null });
  }
  if (user.status === 'freeze') {
    if (!move.thawsUser && !chance(state, 20)) { addLog(state, `${displayName(user)} 얼어서 움직일 수 없다.`, 'status', { kind: 'blocked', targetUid: user.uid }); stopRampage(); return; }
    user.status = null;
    addLog(state, `${displayName(user)} 얼음이 풀렸다!`, 'status', { targetUid: user.uid, status: null });
  }
  if (!processFlinch(state, user) || !processConfusion(state, user)) {stopRampage();return;}
  if(user.infatuatedBy){
    const admirer=activePokemon(state,otherSide(side)).find(mon=>mon.uid===user.infatuatedBy);
    if(!admirer)user.infatuatedBy=undefined;
    else if(chance(state,50)){addLog(state,`${displayName(user)}은(는) 사랑에 빠져 움직일 수 없다!`,'status',{kind:'blocked',targetUid:user.uid});stopRampage();return;}
  }
  if (user.status === 'paralysis' && chance(state, 25)) { addLog(state, `${displayName(user)} 마비로 움직일 수 없다!`, 'status', { kind: 'blocked', targetUid: user.uid }); stopRampage(); return; }
  if(user.tauntTurns&&move.category==='status'&&move.powered!=='z'&&move.powered!=='max') {addLog(state,`${displayName(user)}은 도발 때문에 변화 기술을 사용할 수 없다!`,'status',{kind:'blocked',targetUid:user.uid});return;}
  if (baseMove.id !== 'struggle'&&!continuingCharge&&!continuingRampage) user.pp[baseMove.id] = Math.max(0, user.pp[baseMove.id] - 1);
  if(baseMove.id!=='struggle'&&user.pp[baseMove.id]===0&&user.set.itemId==='leppaberry'&&!user.itemConsumed){
    const foe=state.sides[side==='player'?'cpu':'player'];
    if(!foe.active.some(index=>['unnerve','asoneglastrier','asonespectrier'].includes(foe.team[index]?.set.abilityId))){
      user.pp[baseMove.id]=Math.min(baseMove.pp,user.pp[baseMove.id]+(user.set.abilityId==='ripen'?20:10));
      user.itemConsumed=true;user.consumedItemTurn=state.turn;
      addLog(state,`${displayName(user)}의 과사열매가 ${baseMove.name}의 PP를 회복했다!`,'status',{kind:'item',actorUid:user.uid,sourceId:'leppaberry',sourceKind:'item'});
    }
  }
  if(baseMove.id!=='struggle'&&!user.usedMoveIds.includes(baseMove.id))user.usedMoveIds.push(baseMove.id);
  user.lastMove=baseMove.id;
  user.movedTurn=state.turn;
  if(user.set.abilityId==='stancechange'&&user.set.speciesId==='aegislash'&&(move.category!=='status'||move.id==='kingsshield'))
    setAegislashStance(state,user,move.id==='kingsshield'?'shield':'blade');
  if(move.powered==='z'&&move.category==='status') applyZStatus(state,user,baseMove.id);
  if (move.id !== 'struggle' && !user.choiceLock) {
    const lock = passiveEffects(user).find(effect => effect.trigger === 'onChoice');
    if (lock) {
      user.choiceLock = baseMove.id;
      announcePassive(state, user, lock);
    }
  }
  const boostedPriority = priorityEffect(user, move);
  if (boostedPriority) announcePassive(state, user, boostedPriority);
  let refs = resolveTargets(state, side, action.slot, move, action.target);
  if((move.fixedDamage==='counter'||move.fixedDamage==='mirrorcoat')&&user.lastReceivedHit?.turn===state.turn){
    const source=user.lastReceivedHit.sourceUid;
    const foe=otherSide(side);
    const slot=state.sides[foe].active.findIndex(index=>state.sides[foe].team[index]?.uid===source);
    if(slot>=0)refs=[{side:foe,slot}];
  }
  // Support moves without a reflectable flag must not bounce off an ally.
  if(move.category==='status' && !['lifedew','howl','helpinghand','dragoncheer','acupressure','coaching','aromaticmist','decorate','healpulse'].includes(move.id)){
    refs=refs.map(ref=>{
      const target=getPokemonAt(state,ref);
      const reflection=target&&target!==user?passiveEffects(target).find(effect=>effect.trigger==='onTargetStatusMove'&&effect.kind==='reflectStatusMove'):undefined;
      if(!reflection)return ref;
      announcePassive(state,target!,reflection);
      addLog(state,`${displayName(target!)}가 ${move.name}을 되받아쳤다!`,'status',{kind:'ability',actorUid:target!.uid,targetUid:user.uid,sourceId:'magicbounce',sourceKind:'ability'});
      return {side,slot:action.slot};
    });
    refs=refs.filter((ref,index)=>refs.findIndex(other=>other.side===ref.side&&other.slot===ref.slot)===index);
  }
  if(move.id==='dragondarts'&&state.format==='doubles'){
    const foe=otherSide(side);
    const eligible=state.sides[foe].active.flatMap((_,slot)=>{
      const target=getPokemonAt(state,{side:foe,slot});
      return target&&!target.fainted&&!target.protected&&battleTypeMultiplier(state,move,target,user)>0&&!isTypeImmune(target,move,state)?[{side:foe,slot}]:[];
    });
    if(eligible.length)refs=[...eligible].sort((a,b)=>a.slot===action.target?.slot?-1:b.slot===action.target?.slot?1:a.slot-b.slot);
  }
  const targetUids = refs.map(ref => getPokemonAt(state, ref)!.uid);
  if(baseMove.id!=='struggle')for(const ref of refs)if(ref.side!==side){
    const target=getPokemonAt(state,ref);
    if(!target)continue;
    for(const effect of passiveEffects(target))if(effect.trigger==='onPPUse'&&effect.kind==='extraPP'){
      user.pp[baseMove.id]=Math.max(0,user.pp[baseMove.id]-effect.amount);
      announcePassive(state,target,effect);
    }
  }
  // Z and Max conversions replace Focus Punch with their own powered move;
  // only the ordinary Focus Punch keeps the focus interruption rule.
  if(baseMove.focus && !move.powered && user.focusPreparingTurn===state.turn && user.focusInterruptedTurn===state.turn){
    addLog(state,`${displayName(user)}은(는) 힘껏펀치에 집중하지 못했다!`,'move',{kind:'blocked',actorUid:user.uid,moveId:baseMove.id,targetUid:targetUids[0]});
    return;
  }
  if(move.charge&&!continuingCharge&&move.powered!=='z'&&move.powered!=='max'){
    if(move.id==='electroshot'||move.id==='meteorbeam')applyStatChange(state,user,'spa',1,user);
    const weather=effectiveWeather(state,user);
    const instant=move.charge==='sun'&&weather==='sun'||move.charge==='rain'&&weather==='rain';
    const herb=user.set.itemId==='powerherb'&&!user.itemConsumed;
    if(herb&&!instant){user.itemConsumed=true;addLog(state,`${displayName(user)}의 파워풀허브로 충전을 건너뛰었다!`,'status',{kind:'item',actorUid:user.uid,sourceId:'powerherb',sourceKind:'item'});}
    if(!instant&&!herb){user.charging={moveId:baseMove.id,target:action.target};addLog(state,`${displayName(user)}이(가) ${move.name}의 힘을 모으고 있다!`,'status',{kind:'message',actorUid:user.uid,targetUid:targetUids[0]});return;}
  }
  if(move.fixedDamage){
    const target=getPokemonAt(state,refs[0]);
    const hit=user.lastReceivedHit;
    if(!target||move.fixedDamage==='endeavor'&&target.hp<=user.hp
      ||move.fixedDamage!=='endeavor'&&(!hit||hit.turn!==state.turn||hit.category!==(move.fixedDamage==='counter'?'physical':'special')||hit.sourceUid!==target.uid)){
      addLog(state,`${move.name}이(가) 실패했다!`,'move',{kind:'blocked',actorUid:user.uid,targetUid:target?.uid});return;
    }
  }
  addLog(state, `${displayName(user)}: ${move.name} 사용!`, 'move', { kind:'move',moveId:move.id,category:move.category,type:move.type,targetUid: targetUids[0], targetUids });
  if(move.id==='followme'||move.id==='ragepowder'){
    user.redirectTurn=state.turn;user.redirectPowder=move.id==='ragepowder';
    addLog(state,`${displayName(user)}이(가) 공격을 끌어당긴다!`,'status',{kind:'ability',actorUid:user.uid});
    return;
  }
  if (refs.length === 0) { addLog(state, '기술이 실패했다!', 'move', { kind: 'blocked' }); stopRampage(); applyMoveSelfCost(state,user,move); return; }
  if(move.id==='transform'){
    const target=getPokemonAt(state,refs[0]);
    if(!target||!transformCombatant(state,user,target))addLog(state,'변신에 실패했다!','move',{kind:'blocked'});
    return;
  }
  if(move.delayedTurns){
    const target=refs[0];
    state.delayedAttacks??=[];
    if(state.delayedAttacks.some(attack=>attack.targetSide===target.side&&attack.targetSlot===target.slot)){
      addLog(state,'같은 위치에 이미 지연 공격이 예약되어 있다!','move',{kind:'blocked'});return;
    }
    state.delayedAttacks.push({dueTurn:state.turn+move.delayedTurns,sourceUid:user.uid,targetSide:target.side,targetSlot:target.slot,moveId:move.id});
    addLog(state,`${displayName(user)}이 ${move.name}을 미래에 맞도록 예약했다!`,'status',{kind:'field',targetUid:targetUids[0]});
    return;
  }
  const spread = (move.target === 'allEnemies' || move.target === 'allOthers') && refs.length > 1;
  let totalDamage = 0;
  let maxConnected=false;
  const emergencyExits:{side:Side;slot:number;to:number}[]=[];
  const selfEffectsApplied = new Set<MoveEffect>();
  for (const ref of refs) {
    const target = getPokemonAt(state, ref);
    if (!target || target.fainted || user.fainted) continue;
    withEventContext(state, { targetUid: target.uid }, () => {
      if(target!==user&&state.sides[side].team.includes(target)&&target.set.abilityId==='telepathy'&&move.category!=='status'){
        addLog(state,`${displayName(target)}의 텔레파시가 아군의 공격을 피하게 했다!`,'move',{kind:'blocked',targetUid:target.uid,sourceId:'telepathy',sourceKind:'ability'});return;
      }
      if(target!==user&&ref.side!==side&&effectivePriority(state,user,move)>0&&activePokemon(state,ref.side).some(mon=>mon.set.abilityId==='armortail'||mon.set.abilityId==='queenlymajesty')){
        addLog(state,`${displayName(target)}의 특성이 선제 기술을 막았다!`,'move',{kind:'blocked',targetUid:target.uid});return;
      }
      if (target.protected && target !== user && move.target!=='allAllies' && !move.bypassProtect && (!move.powered||move.category==='status'||target.maxGuard)) { addLog(state, `${displayName(target)}이 공격을 방어했다!`, 'move', { kind: 'blocked' }); return; }
      if(move.bullet&&target!==user&&target.set.abilityId==='bulletproof'&&!move.ignoreAbility){
        addLog(state,`${displayName(target)}의 방탄이 ${move.name}을 막았다!`,'move',{kind:'blocked',targetUid:target.uid,sourceId:'bulletproof',sourceKind:'ability'});return;
      }
      if(move.sound&&target!==user&&target.set.abilityId==='soundproof'&&!move.ignoreAbility){
        addLog(state,`${displayName(target)}의 방음이 ${move.name}을 막았다!`,'move',{kind:'blocked',targetUid:target.uid,sourceId:'soundproof',sourceKind:'ability'});return;
      }
      if (boostedPriority && ref.side !== side && target.types.includes('dark')) {
        addLog(state, `악 타입인 ${displayName(target)}에게 ${move.name}이 통하지 않는다.`, 'move', { kind:'blocked' }); return;
      }
      const statusImmunity = move.category === 'status' && target !== user && passiveEffects(target).find(effect => effect.trigger === 'onTargetStatusMove' && effect.kind === 'statusMoveImmunity');
      if (statusImmunity) { announcePassive(state, target, statusImmunity); addLog(state, `${displayName(target)}에게 ${move.name}이 통하지 않는다.`, 'move', { kind:'blocked' }); return; }
      if (state.field?.id === 'psychic' && effectivePriority(state,user,move) > 0 && ref.side !== side && isGrounded(target,state)) {
        addLog(state, `사이코필드가 ${displayName(target)}을(를) 선제공격으로부터 보호했다!`, 'move', {kind:'blocked'}); return;
      }
      if (move.powder && target.types.includes('grass')) {
        addLog(state, `${displayName(target)}에게 가루 기술이 통하지 않는다.`, 'move', {kind:'blocked'}); return;
      }
      if(move.powder&&passiveEffects(target).some(effect=>effect.trigger==='onPowder'&&effect.kind==='immunity')){
        const effect=passiveEffects(target).find(effect=>effect.trigger==='onPowder'&&effect.kind==='immunity')!;
        announcePassive(state,target,effect);addLog(state,`${displayName(target)}에게 가루 기술이 통하지 않는다.`,'move',{kind:'blocked'});return;
      }
      // Only Thunder Wave in this supported status set respects type-chart immunity.
      if (move.id === 'thunderwave' && target !== user && getTypeMultiplier(move.type, target.types) === 0) {
        addLog(state, `${displayName(target)}에게 효과가 없다.`, 'move', { kind: 'effectiveness', effectiveness: 0 });
        return;
      }
      if (move.id !== 'struggle' && target !== user && absorbMove(state, target, move)) return;
      if (!move.multiaccuracy&&!accuracyHits(state, user, target, move)) { addLog(state, `${move.name}: ${displayName(target)}에게 빗나갔다!`, 'move', { kind: 'miss' }); triggerBlunderPolicy(state,user);return; }
      const bypassSub=move.sound||move.bypassSubstitute||passiveEffects(user).some(effect=>effect.trigger==='onAttack'&&effect.kind==='bypassSubstitute');
      if(target!==user&&target.substituteHp&&!bypassSub&&move.category==='status'){
        addLog(state,`${displayName(target)}의 대타출동이 ${move.name}을 막았다!`,'move',{kind:'blocked',targetUid:target.uid});return;
      }
      if(move.stealsBoosts&&target!==user&&battleTypeMultiplier(state,move,target,user)>0&&!isTypeImmune(target,move,state)){
        const stolen=BOOST_KEYS.filter(stat=>target.stages[stat]>0).map(stat=>[stat,target.stages[stat]] as const);
        for(const [stat,stages] of stolen){
          const beforeStage=user.stages[stat];
          target.stages[stat]=0;
          user.stages[stat]=Math.min(6,beforeStage+stages);
          const actual=user.stages[stat]-beforeStage;
          if(actual)addLog(state,`${displayName(user)}: ${statLabel[stat]} ${actual}단계 상승!`,'status',{kind:'stat',actorUid:user.uid,targetUid:user.uid,stat,stages:actual,beforeStage,afterStage:user.stages[stat]});
          addLog(state,`${displayName(target)}의 ${statLabel[stat]} 상승이 빼앗겼다!`,'status',{kind:'stat',actorUid:user.uid,targetUid:target.uid,stat,stages:-stages,beforeStage:stages,afterStage:0});
        }
        if(stolen.length)addLog(state,`${displayName(user)}이(가) ${displayName(target)}의 능력 상승을 빼앗았다!`,'status',{kind:'message',actorUid:user.uid,targetUid:target.uid});
      }
      if(move.id==='pollenpuff'&&ref.side===side){
        applyHeal(state,target,1/2,move.name);
        return;
      }
      let dealt = 0;
      let hitSubstitute=false;
      let hitBody=false;
       if (move.category !== 'status' && (move.power > 0||move.fixedDamage||move.fixedHpFraction!==undefined||move.ohko)) {
        const link=passiveEffects(user).find(effect=>effect.trigger==='onMultiHit');
        const secondStrike=!move.multihit&&!spread&&!move.powered&&!move.ohko&&move.id!=='struggle'
          ?passiveEffects(user).find(effect=>effect.trigger==='onMultiHit'&&effect.kind==='secondStrike'):undefined;
        const loadedDice=!user.itemConsumed&&user.set.itemId==='loadeddice';
        const hits=move.id==='dragondarts'&&refs.length>1?1:typeof move.multihit==='number'?move.multihit:move.multihit?(link?move.multihit[1]:loadedDice?randomInt(state,4,5):[2,2,2,3,3,3,4,5][randomInt(state,0,7)]):secondStrike?2:1;
        if(move.multihit&&link)announcePassive(state,user,link);
        let actualHits=0;
        for(let hit=0;hit<hits&&!target.fainted&&!user.fainted;hit++) {
        if(move.multiaccuracy&&!accuracyHits(state,user,target,move)){
          addLog(state,`${move.name}: ${hit+1}번째 공격이 빗나갔다!`,'move',{kind:'miss',targetUid:target.uid});triggerBlunderPolicy(state,user);break;
        }
        if(move.ohko){
          const immune=passiveEffects(target).find(effect=>effect.trigger==='onOHKO');
          if(immune){announcePassive(state,target,immune);addLog(state,`${displayName(target)}에게 일격기가 통하지 않았다!`,'move',{kind:'blocked',targetUid:target.uid});return;}
          if(move.id==='sheercold'&&target.types.includes('ice')){addLog(state,`${displayName(target)}에게 절대영도가 통하지 않았다!`,'move',{kind:'blocked',targetUid:target.uid});return;}
        }
         const result = move.fixedDamage
           ?{damage:move.fixedDamage==='endeavor'?Math.max(0,target.hp-user.hp):Math.max(0,(user.lastReceivedHit?.damage??0)*2),critical:false,effectiveness:battleTypeMultiplier(state,move,target,user)}
           :move.ohko
          ?{damage:target.hp,critical:false,effectiveness:isTypeImmune(target,move,state)?0:battleTypeMultiplier(state,move,target,user)}
          :moveDamage(state, user, target, move, spread,target!==user&&!!target.substituteHp&&!bypassSub);
        if (result.effectiveness === 0) {
          const immunity = passiveEffects(target).find(effect => effect.trigger === 'onDamage' && effect.kind === 'typeImmunity' && effect.type === move.type);
          if (immunity) announcePassive(state, target, immunity);
          addLog(state, `${displayName(target)}에게 효과가 없다.`, 'move', { kind: 'effectiveness', effectiveness: 0 });
          return;
        }
        for (const effect of matchingDamageEffects(user, move, 'onAttack')) announcePassive(state, user, effect);
        for (const effect of matchingDamageEffects(target, move, 'onDamage')) announcePassive(state, target, effect);
        if (user.types.includes(move.type)) for (const effect of passiveEffects(user)) {
          if (effect.trigger === 'onAttack' && effect.kind === 'stabMultiplier') announcePassive(state, user, effect);
        }
        const strikeDamage=secondStrike&&hit===1?Math.max(1,Math.floor(result.damage*secondStrike.multiplier)):result.damage;
        const protectedDamage=move.fixedHpBasis==='current'?Math.ceil(strikeDamage/4-.5):Math.floor(strikeDamage/4);
        const rawDamage=target.protected&&!move.bypassProtect?Math.max(1,protectedDamage):strikeDamage;
        const targetHpBefore=target.hp;
        const intercepted=target!==user&&!!target.substituteHp&&!bypassSub;
        const remainingSubstitute=target.substituteHp??0;
        const hitDamage=intercepted
          ?Math.min(remainingSubstitute,rawDamage)
          :applyDamage(state,target,rawDamage,move.name,true,move.ignoreAbility,{critical:result.critical,effectiveness:result.effectiveness});
        if(intercepted){
          target.substituteHp=remainingSubstitute-hitDamage;hitSubstitute=true;
          addLog(state,`${displayName(target)}의 대타출동이 ${hitDamage} 피해를 받았다!`,'damage',{targetUid:target.uid});
          if(target.substituteHp<=0){target.substituteHp=undefined;addLog(state,`${displayName(target)}의 대타출동이 사라졌다!`,'status',{targetUid:target.uid});}
        }
        else hitBody=true;
        if(hitDamage&&!intercepted&&target!==user&&target.focusPreparingTurn===state.turn&&target.actedTurn!==state.turn)target.focusInterruptedTurn=state.turn;
        if(move.groundsTarget&&hitDamage&&!intercepted){target.groundedByMove=true;addLog(state,`${displayName(target)}이 지면으로 끌려 내려왔다!`,'status',{targetUid:target.uid,kind:'field'});}
        if(hitDamage&&!intercepted&&target.set.abilityId==='spicyspray')applyStatus(state,user,'burn',displayName(target),target);
        if(hitDamage&&!intercepted&&!target.fainted&&user.set.abilityId==='toxicchain'&&target.set.abilityId!=='shielddust'
          &&!(target.set.itemId==='covertcloak'&&!target.itemConsumed)&&chance(state,30)
          &&applyStatus(state,target,'poison','독사슬',user)){
          target.toxicCounter=1;
          addLog(state,`${displayName(target)}이(가) 독사슬에 맹독 상태가 되었다!`,'status',{kind:'ability',actorUid:user.uid,targetUid:target.uid,sourceId:'toxicchain',sourceKind:'ability',status:'poison'});
        }
        if(target.fainted&&!intercepted&&target.set.abilityId==='innardsout'&&!move.ignoreAbility&&user!==target){
          const recoil=Math.min(user.hp,Math.max(1,targetHpBefore));
          addLog(state,`${displayName(target)}의 내용물분출!`,'status',{kind:'ability',actorUid:target.uid,targetUid:user.uid,sourceId:'innardsout',sourceKind:'ability'});
          applyDamage(state,user,recoil,'내용물분출');
        }
        if(!intercepted)dealt += hitDamage;
         if(hitDamage&&!intercepted&&ref.side!==side){
           const previous=target.lastReceivedHit;
           target.lastReceivedHit={turn:state.turn,damage:previous?.turn===state.turn&&previous.sourceUid===user.uid&&previous.category===move.category?previous.damage+hitDamage:hitDamage,
             category:move.category as 'physical'|'special',sourceUid:user.uid};
         }
        actualHits++;
        maxConnected=true;
        totalDamage += hitDamage;
        if(hitDamage&&!intercepted&&target.hp>0&&targetHpBefore>target.maxHp/2&&target.hp<=target.maxHp/2&&target.set.abilityId==='emergencyexit'){
          const targetSide:Side=state.sides.player.team.includes(target)?'player':'cpu';
          const targetSlot=state.sides[targetSide].active.findIndex(index=>state.sides[targetSide].team[index]===target);
          const bench=state.sides[targetSide].team.flatMap((mon,index)=>!mon.fainted&&!state.sides[targetSide].active.includes(index)?[index]:[]);
          if(targetSlot>=0&&bench.length)emergencyExits.push({side:targetSide,slot:targetSlot,to:bench[randomInt(state,0,bench.length-1)]});
        }
        if(hitDamage&&!intercepted&&!target.fainted){
          if(target.set.abilityId==='cursedbody'&&!target.disabledMove&&user.lastMove&&user.pp[user.lastMove]>0&&chance(state,30)){
            target.disabledMove={moveId:user.lastMove,turns:4};addLog(state,`${target.speciesName}의 저주받은바디! ${moves[user.lastMove]?.name??user.lastMove}이(가) 봉인되었다!`,'status',{kind:'ability',actorUid:target.uid,targetUid:user.uid,sourceId:'cursedbody',sourceKind:'ability'});
          }
          if(target.set.abilityId==='electromorphosis'){
            target.electromorphosisCharged=true;addLog(state,`${displayName(target)}이(가) 전기를 모았다!`,'status',{kind:'ability',actorUid:target.uid,sourceId:'electromorphosis',sourceKind:'ability'});
          }
          if(target.set.abilityId==='sandspit'&&setBattleWeather(state,'sand',5))addLog(state,'모래뿜기: 모래바람이 불기 시작했다!','status',{kind:'ability',actorUid:target.uid,sourceId:'sandspit',sourceKind:'ability'});
          if(target.set.abilityId==='seedsower'){state.field={id:'grassy',turns:5};refreshAbilityTypes(state);addLog(state,'씨뿌리기: 그래스필드가 펼쳐졌다!','status',{kind:'ability',actorUid:target.uid,sourceId:'seedsower',sourceKind:'ability'});}
          if(target.set.abilityId==='toxicdebris'&&move.category==='physical'){
            const foeSide:Side=state.sides.player.team.includes(target)?'cpu':'player';
            state.sides[foeSide].hazards??={};state.sides[foeSide].hazards!.toxicspikes=Math.min(2,(state.sides[foeSide].hazards!.toxicspikes??0)+1);
            addLog(state,'독압정이 상대 진영에 흩뿌려졌다!','status',{kind:'ability',actorUid:target.uid,sourceId:'toxicdebris',sourceKind:'ability'});
          }
        }
        if (move.type === 'fire' && target.status === 'freeze' && !target.fainted) {
          target.status = null;
          addLog(state, `${displayName(target)}의 얼음이 풀렸다!`, 'status', {targetUid:target.uid, status:null});
        }
        if (result.critical) addLog(state, '급소에 맞았다!', 'move', { kind: 'critical' });
        if(result.critical&&!target.fainted&&target.set.abilityId==='angerpoint'){
          const boost=6-target.stages.atk;
          if(boost>0)applyStatChange(state,target,'atk',boost,target);
        }
        if (result.effectiveness > 1) addLog(state, '효과가 굉장했다!', 'move', { kind: 'effectiveness', effectiveness: result.effectiveness });
        if (result.effectiveness < 1) addLog(state, '효과가 별로였다.', 'move', { kind: 'effectiveness', effectiveness: result.effectiveness });
        if(result.effectiveness>1&&hitDamage&&!intercepted)triggerSuperEffectiveHit(state,target,user);
        if (move.contact && hitDamage&&!intercepted&&!(['protectivepads','punchingglove'].includes(user.set.itemId)&&!user.itemConsumed)) triggerContact(state, target, user);
        if(hitDamage&&!intercepted&&!target.fainted&&user.set.abilityId==='stench'&&target.set.abilityId!=='shielddust'&&(target.set.itemId!=='covertcloak'||target.itemConsumed)&&chance(state,10))applyVolatile(state,target,'flinch');
        if(hitDamage&&!intercepted&&!target.fainted&&!user.itemConsumed&&['kingsrock','razorfang'].includes(user.set.itemId)
          &&!move.effects?.some(effect=>effect.kind==='volatile'&&effect.condition==='flinch')
          &&target.set.abilityId!=='shielddust'&&(target.set.itemId!=='covertcloak'||target.itemConsumed)&&chance(state,10))
          applyVolatile(state,target,'flinch');
        if(hitDamage&&!intercepted&&!target.fainted)for(const effect of passiveEffects(target))
          if(effect.trigger==='onAfterHit'&&effect.kind==='stat'&&(!effect.type||effect.type===move.type)
            &&(!effect.category||effect.category===move.category)
            &&(!effect.contact||move.contact)
            &&!(move.ignoreAbility&&abilities[target.set.abilityId]?.effects.includes(effect))){
            announcePassive(state,target,effect);applyStatChange(state,target,effect.stat,effect.stages,target);
            if(effect.consume){target.itemConsumed=true;target.consumedItemTurn=state.turn;}
          }
        if(hitDamage&&!intercepted&&target.set.itemId==='airballoon'&&!target.itemConsumed){
          target.itemConsumed=true;target.consumedItemTurn=state.turn;
          addLog(state,`${displayName(target)}의 풍선이 터졌다!`,'status',{kind:'item',actorUid:target.uid,sourceId:'airballoon',sourceKind:'item'});
        }
        const recoilBerry=move.category==='physical'?'jabocaberry':'rowapberry';
        if(hitDamage&&!intercepted&&!target.fainted&&!user.fainted&&target.set.itemId===recoilBerry&&!target.itemConsumed
          &&!activePokemon(state,side).some(foe=>['unnerve','asoneglastrier','asonespectrier'].includes(foe.set.abilityId))){
          target.itemConsumed=true;target.consumedItemTurn=state.turn;
          addLog(state,`${displayName(target)}의 ${items[recoilBerry].name}이(가) 발동했다!`,'status',{kind:'item',actorUid:target.uid,targetUid:user.uid,sourceId:recoilBerry,sourceKind:'item'});
          applyDamage(state,user,Math.max(1,Math.floor((user.original?.maxHp??user.maxHp)*(target.set.abilityId==='ripen'?.25:.125))),items[recoilBerry].name);
        }
        if(target.fainted&&!intercepted&&ref.side!==side){
          for(const effect of passiveEffects(user))if(effect.trigger==='onKO'){
            if(effect.kind==='stat'){announcePassive(state,user,effect);applyStatChange(state,user,effect.stat,effect.stages,user);}
            else if(effect.kind==='bestStat'){
              const stat=(['atk','def','spa','spd','spe'] as const).reduce((best,next)=>user.stats[next]>user.stats[best]?next:best,'atk');
              announcePassive(state,user,effect);applyStatChange(state,user,stat,1,user);
            }
          }
          if(user.set.abilityId==='eelevate'){
            const stat=(['atk','def','spa','spd','spe'] as const).reduce((best,next)=>user.stats[next]>user.stats[best]?next:best,'atk');
            applyStatChange(state,user,stat,1,user);
          }
          if(user.set.abilityId==='battlebond'&&user.set.speciesId==='greninja'&&!user.battleBondActivated
            &&state.sides[ref.side].team.some(mon=>!mon.fainted)){
            user.battleBondActivated=true;
            for(const stat of ['atk','spa','spe'] as const)applyStatChange(state,user,stat,1,user);
            addLog(state,`${displayName(user)}의 유대변화! 공격·특수공격·스피드가 올랐다!`,'status',{kind:'ability',actorUid:user.uid,sourceId:'battlebond',sourceKind:'ability'});
          }
        }
        }
        if(hits>1)addLog(state,`${actualHits}번 맞았다!`,'move',{kind:'message'});
        if(actualHits===0)return;
      }
      for (const effect of move.effects ?? []) {
        if('chance' in effect&&effect.chance!==undefined&&target!==user&&(target.set.abilityId==='shielddust'||target.set.itemId==='covertcloak'&&!target.itemConsumed))continue;
        if(move.category!=='status'&&passiveEffects(user).some(passive=>passive.trigger==='onAttack'&&passive.kind==='damageMultiplier'&&passive.condition==='secondary')
          &&'chance' in effect&&effect.chance!==undefined&&(!('target' in effect)||effect.target!=='self'))continue;
        if(hitSubstitute&&!hitBody&&effect.kind!=='drain'&&effect.kind!=='recoil'&&!(effect.kind==='stat'&&effect.target==='self'))continue;
        if ('target' in effect && effect.target === 'self') {
          if (selfEffectsApplied.has(effect)) continue;
          selfEffectsApplied.add(effect);
        }
        const needsLivingTarget = effect.kind === 'volatile'||effect.kind==='trap'||effect.kind==='suppressAbility' || (effect.kind === 'status' || effect.kind === 'stat') && effect.target !== 'self'
          || effect.kind === 'heal' && effect.target === 'target';
        if (target.fainted && needsLivingTarget) continue;
        applyMoveEffect(state, effect, user, target, dealt, move.name);
      }
      if(target!==user&&!hitSubstitute){
        if(move.id==='knockoff'&&canRemoveHeldItem(target)&&(move.ignoreAbility||target.set.abilityId!=='stickyhold')){
          const removed=target.set.itemId;target.set.itemId='none';target.itemConsumed=false;target.consumedItemTurn=undefined;target.cudChewReadyTurn=undefined;target.cudChewItemId=undefined;
          addLog(state,`${displayName(target)}의 ${items[removed]?.name??removed}을(를) 탁쳐서 떨궜다!`,'status',{kind:'ability',actorUid:user.uid,targetUid:target.uid});
        }
        if((move.id==='trick'||move.id==='switcheroo')&&(!move.ignoreAbility&&(target.set.abilityId==='stickyhold'||user.set.abilityId==='stickyhold'))){
          addLog(state,`${displayName(target)}의 흡반이 도구 교환을 막았다!`,'status',{kind:'blocked',actorUid:user.uid,targetUid:target.uid,sourceId:'stickyhold',sourceKind:'ability'});
        }else if((move.id==='trick'||move.id==='switcheroo')
          &&(user.set.itemId==='none'||canTransferHeldItem(user))&&(target.set.itemId==='none'||canTransferHeldItem(target))
          &&(user.set.itemId!=='none'||target.set.itemId!=='none')){
          const userItem=user.set.itemId,targetItem=target.set.itemId;
          user.set.itemId=targetItem;target.set.itemId=userItem;
          user.itemConsumed=false;target.itemConsumed=false;user.consumedItemTurn=undefined;target.consumedItemTurn=undefined;
          user.cudChewUsed=false;target.cudChewUsed=false;
          addLog(state,`${displayName(user)}과(와) ${displayName(target)}의 도구가 뒤바뀌었다!`,'status',{kind:'item',actorUid:user.uid,targetUid:target.uid});
        }
      }
    });
  }
  if(move.powered==='max'&&move.category!=='status'&&maxConnected) applyMaxEffect(state,side,user,move);
  if(move.powered==='z'&&totalDamage>0)applyExclusiveZEffect(state,move);
  if(totalDamage>0&&!user.fainted&&!user.itemConsumed&&user.set.itemId==='shellbell')applyHeal(state,user,totalDamage/(8*(user.original?.maxHp??user.maxHp)),'조개껍질방울');
  if(totalDamage>0&&move.type==='normal'&&user.set.itemId==='normalgem'&&!user.itemConsumed){user.itemConsumed=true;user.consumedItemTurn=state.turn;}
  if(move.sound&&user.set.itemId==='throatspray'&&!user.itemConsumed&&!user.fainted){
    applyStatChange(state,user,'spa',1,user);user.itemConsumed=true;user.consumedItemTurn=state.turn;
  }
  if(user.transformation?.kind==='tera'&&user.transformation.teraType==='stellar'&&totalDamage>0&&!user.stellarBoostedTypes?.includes(move.type)){
    user.stellarBoostedTypes??=[];user.stellarBoostedTypes.push(move.type);
  }
  if (totalDamage && !user.fainted) for (const effect of passiveEffects(user)) {
    if (effect.trigger !== 'onAfterMove') continue;
    if(user.set.abilityId==='magicguard')continue;
    announcePassive(state, user, effect);
    withEventContext(state, { actorUid: user.uid, targetUid: user.uid, moveId: undefined, category: undefined }, () =>
       applyDamage(state, user, Math.max(1, Math.floor(user.maxHp * effect.fraction)), passiveSource(user, effect).name));
  }
  if(totalDamage&&user.electromorphosisCharged&&move.type==='electric')user.electromorphosisCharged=false;
  for(const exit of emergencyExits)executeSwitch(state,exit.side,{kind:'switch',slot:exit.slot,to:exit.to});
  if(move.id==='scaleshot'&&totalDamage&&!user.fainted){applyStatChange(state,user,'spe',1,user);applyStatChange(state,user,'def',-1,user);}
  applyMoveSelfCost(state,user,move);
  if(move.selfDestruct&&!user.fainted)applyDamage(state,user,user.hp,move.name);
  if(move.rampage&&!user.fainted){
    if(!maxConnected){stopRampage();return;}
    if(!user.rampage){user.rampage={moveId:baseMove.id,remaining:randomInt(state,move.rampage[0],move.rampage[1])-1,target:action.target};addLog(state,`${displayName(user)}은(는) ${move.name}을(를) 연속 사용한다!`,'status',{kind:'message',actorUid:user.uid});}
    else if(--user.rampage.remaining<=0){user.rampage=undefined;addLog(state,`${displayName(user)}의 ${move.name} 연속 사용이 끝났다!`,'status',{kind:'message',actorUid:user.uid});applyVolatile(state,user,'confusion');}
  }
  if(move.pivot&&totalDamage&&!user.fainted){
    const own=state.sides[side],bench=own.team.findIndex((pokemon,index)=>!pokemon.fainted&&!own.active.includes(index));
    if(bench>=0)executeSwitch(state,side,{kind:'switch',slot:action.slot,to:bench});
  }
}

function executeSwitch(state: BattleState, side: Side, action: Extract<BattleAction, { kind: 'switch' }>): void {
  const sideState = state.sides[side];
  const oldIndex = sideState.active[action.slot];
  const oldPokemon = sideState.team[oldIndex];
  const replacement = sideState.team[action.to];
  if (!replacement || replacement.fainted || sideState.active.includes(action.to)) return;
  if(oldPokemon.set.abilityId==='stancechange'&&oldPokemon.set.speciesId==='aegislash')setAegislashStance(state,oldPokemon,'shield');
  if(oldPokemon.set.abilityId==='zerotohero'&&oldPokemon.set.speciesId==='palafin'&&!oldPokemon.palafinHero){
    oldPokemon.palafinHero=true;
    oldPokemon.stats=calculateStats({...species.palafin,baseStats:{hp:100,atk:160,def:97,spa:106,spd:87,spe:100}},oldPokemon.set);
    addLog(state,`${displayName(oldPokemon)}의 제로투히어로! 영웅폼으로 변했다!`,'status',{kind:'ability',actorUid:oldPokemon.uid,sourceId:'zerotohero',sourceKind:'ability'});
  }
  for(const team of Object.values(state.sides).flatMap(own=>own.team))if(team.infatuatedBy===oldPokemon.uid||team===oldPokemon)team.infatuatedBy=undefined;
  state.switchTurns ??= {};
  state.switchTurns[side] ??= {};
  state.switchTurns[side]![action.slot] = state.turn;
  endDynamax(state,oldPokemon);
  applyExitEffects(state, oldPokemon);
  restoreTransform(oldPokemon);
  if(oldPokemon.transformation?.kind!=='tera'&&oldPokemon.abilityFormOriginal){
    const formName=oldPokemon.battleFormId==='zygardecomplete'?'스웜체인지':oldPokemon.battleFormId?.endsWith('crowned')?'왕관':'테라체인지';
    restoreAbilityBattleForm(state,oldPokemon,formName);
  }
  for(const foe of state.sides[side==='player'?'cpu':'player'].team)if(foe.trappedBy===oldPokemon.uid){foe.trapped=false;foe.trappedBy=undefined;}
  addLog(state, `${displayName(oldPokemon)} 교체!`, 'switch', { kind: 'switch-out', actorUid: oldPokemon.uid, side, slot: action.slot });
  oldPokemon.stages = Object.fromEntries(BOOST_KEYS.map(stat => [stat, 0])) as Combatant['stages'];
  oldPokemon.protected = false;
  oldPokemon.protectStreak = 0;
  oldPokemon.proteanUsed=false;
  oldPokemon.choiceLock = undefined;
  oldPokemon.absorbedTypes = [];
  oldPokemon.confusionTurns = 0;
  oldPokemon.flinched = false;
  oldPokemon.tauntTurns=0;oldPokemon.encore=undefined;oldPokemon.tormentedMove=undefined;oldPokemon.lastMove=undefined;oldPokemon.saltCured=false;
  oldPokemon.disabledMove=undefined;
  oldPokemon.substituteHp=undefined;oldPokemon.gmaxCritStages=0;oldPokemon.trapped=false;oldPokemon.trappedBy=undefined;oldPokemon.groundedByMove=false;oldPokemon.yawnTurns=0;
  oldPokemon.helpingHandTurn=undefined;oldPokemon.dragonCheerCritStages=undefined;oldPokemon.movedTurn=undefined;
  oldPokemon.rechargeTurns=0;
  oldPokemon.charging=undefined;oldPokemon.rampage=undefined;oldPokemon.aquaRing=false;oldPokemon.lastReceivedHit=undefined;
  if(oldPokemon.abilityBeforeChange){oldPokemon.set.abilityId=oldPokemon.abilityBeforeChange;oldPokemon.abilityBeforeChange=undefined;}
  if(oldPokemon.toxicCounter)oldPokemon.toxicCounter=1;
  sideState.active[action.slot] = action.to;
  replacement.enteredTurn=state.turn;
  addLog(state, `${side === 'player' ? '플레이어' : 'CPU'}: ${displayName(replacement)} 출전!`, 'switch', { kind: 'switch-in', actorUid: replacement.uid, side, slot: action.slot });
  applyHazards(state,side,replacement);
  if(!replacement.fainted)applyEntryEffects(state, side, replacement);
}

function checkWinner(state: BattleState): boolean {
  const playerAlive = state.sides.player.team.some(pokemon => !pokemon.fainted);
  const cpuAlive = state.sides.cpu.team.some(pokemon => !pokemon.fainted);
  if (playerAlive && cpuAlive) return false;
  state.winner = playerAlive ? 'player' : cpuAlive ? 'cpu' : 'draw';
  restoreBattleForms(state);
  addLog(state, state.winner === 'draw' ? '배틀은 무승부로 끝났다.' : `${state.winner === 'player' ? '플레이어' : 'CPU'} 승리!`, 'result');
  return true;
}

function resolveDelayedAttacks(state:BattleState):void {
  const due=(state.delayedAttacks??[]).filter(attack=>attack.dueTurn<=state.turn);
  state.delayedAttacks=(state.delayedAttacks??[]).filter(attack=>attack.dueTurn>state.turn);
  for(const attack of due){
    const target=getPokemonAt(state,{side:attack.targetSide,slot:attack.targetSlot});
    const source=[...state.sides.player.team,...state.sides.cpu.team].find(pokemon=>pokemon.uid===attack.sourceUid);
    const move=moves[attack.moveId];
    if(!target||target.fainted||!source||!move)continue;
    withEventContext(state,{actorUid:source.uid,targetUid:target.uid,moveId:move.id,category:move.category,type:move.type},()=>{
      addLog(state,`${displayName(target)}에게 ${move.name}이 닥쳤다!`,'move',{moveId:move.id,type:move.type,targetUid:target.uid});
      const result=moveDamage(state,source,target,move,false);
      if(!result.effectiveness){addLog(state,`${displayName(target)}에게 효과가 없다.`,'move',{kind:'effectiveness',effectiveness:0});return;}
      if(target.substituteHp){
        const dealt=Math.min(target.substituteHp,result.damage);target.substituteHp-=dealt;
        addLog(state,`${displayName(target)}의 대타출동이 ${dealt} 피해를 받았다!`,'damage',{targetUid:target.uid});
        if(!target.substituteHp){target.substituteHp=undefined;addLog(state,`${displayName(target)}의 대타출동이 사라졌다!`,'status',{targetUid:target.uid});}
      }else applyDamage(state,target,result.damage,move.name,true,false,{critical:result.critical,effectiveness:result.effectiveness});
    });
  }
}

function replaceFainted(state: BattleState): void {
  for (const side of ['player', 'cpu'] as const) {
    if (state.manualReplacementSides?.includes(side)) continue;
    const sideState = state.sides[side];
    for (let slot = 0; slot < sideState.active.length; slot++) {
      if (!sideState.team[sideState.active[slot]].fainted) continue;
      while(sideState.team[sideState.active[slot]].fainted) {
      const next = sideState.team.findIndex((pokemon, index) => !pokemon.fainted && !sideState.active.includes(index));
      if (next < 0) break;
      sideState.active[slot] = next;
      const pokemon = sideState.team[next];
      pokemon.enteredTurn=state.turn;
      addLog(state, `${side === 'player' ? '플레이어' : 'CPU'}: ${displayName(pokemon)} 출전!`, 'switch', { kind: 'switch-in', actorUid: pokemon.uid, side, slot });
      applyHazards(state,side,pokemon);
      if(!pokemon.fainted)applyEntryEffects(state, side, pokemon);
      }
    }
  }
}

interface QueuedAction { side: Side; action: BattleAction; actorUid: string; priority: number; speed: number; tie: number }

/** Only as many vacant positions as there are healthy bench Pokémon require choices. */
export function replacementSlots(state: BattleState, side: Side): number[] {
  if (state.winner || !state.manualReplacementSides?.includes(side)) return [];
  const own = state.sides[side];
  const bench = own.team.filter((mon, index) => !mon.fainted && !own.active.includes(index)).length;
  return own.active.flatMap((index, slot) => own.team[index].fainted ? [slot] : []).slice(0, bench);
}

export function needsReplacement(state: BattleState): boolean {
  return replacementSlots(state, 'player').length + replacementSlots(state, 'cpu').length > 0;
}

function resolveReplacements(state: BattleState, playerActions: BattleAction[], cpuActions: BattleAction[]): BattleState {
  const selections = { player: playerActions, cpu: cpuActions };
  // Validate both sides before mutating: malformed remote choices cannot partially enter a team.
  const replacements: { side: Side; slot: number; to: number }[] = [];
  for (const side of ['player', 'cpu'] as const) {
    const own = state.sides[side], reserved = new Set<number>();
    for (const slot of replacementSlots(state, side)) {
      const action = selections[side].find(action => action.slot === slot);
      if (!action || action.kind !== 'switch' || !Number.isInteger(action.to) || !own.team[action.to]
        || own.team[action.to].fainted || own.active.includes(action.to) || reserved.has(action.to)) {
        throw new Error('기절한 포켓몬 대신 출전할 포켓몬을 선택하세요.');
      }
      reserved.add(action.to); replacements.push({ side, slot, to: action.to });
    }
  }
  for (const { side, slot, to } of replacements) {
    state.sides[side].active[slot] = to;
    const mon = state.sides[side].team[to];
    mon.enteredTurn=state.turn;
    addLog(state, `${side === 'player' ? '플레이어' : 'CPU'}: ${displayName(mon)} 출전!`, 'switch', { kind: 'switch-in', actorUid: mon.uid, side, slot });
    applyHazards(state,side,mon);
    if(!mon.fainted)applyEntryEffects(state, side, mon);
  }
  checkWinner(state);
  return state;
}

function advanceTurn(state: BattleState, playerActions: BattleAction[], cpuActions?: BattleAction[]): BattleState {
  if (state.winner) return state;
  if (needsReplacement(state)) return resolveReplacements(state, playerActions, cpuActions ?? []);
  for (const side of ['player', 'cpu'] as const) for (const pokemon of activePokemon(state, side)) { pokemon.protected = false; pokemon.maxGuard=false; pokemon.flinched = false; }
  const selected: Record<Side, BattleAction[]> = {
    player: normalizeActions(state, 'player', playerActions),
    cpu: normalizeActions(state, 'cpu', cpuActions ?? chooseCpuActions(state)),
  };
  for (const side of ['player', 'cpu'] as const) for (const action of selected[side]) {
    if (action.kind !== 'move' || !moves[action.moveId]?.focus) continue;
    const actor = getPokemonAt(state, { side, slot: action.slot });
    if (!actor || previewMove(actor, moves[action.moveId], action.gimmick).powered) continue;
    actor.focusPreparingTurn = state.turn;
    addLog(state, `${displayName(actor)}은(는) 힘껏펀치의 기를 모으고 있다!`, 'status', { kind: 'focus-prepare', actorUid: actor.uid });
  }
  const queue: QueuedAction[] = [];
  for (const side of ['player', 'cpu'] as const) {
    for (const action of selected[side]) {
      const actor = getPokemonAt(state, { side, slot: action.slot });
      if (!actor) continue;
      queue.push({
        side, action, actorUid: actor.uid,
        priority: action.kind === 'switch' ? 6 : (moves[action.moveId]?effectivePriority(state,actor,previewMove(actor,moves[action.moveId],action.gimmick)):0),
        speed: effectiveSpeed(state, actor), tie: random(state),
      });
    }
  }
  // Re-evaluate speed after each action: Tailwind and speed drops affect remaining actions.
  while(queue.length) {
    for(const queued of queue){const mon=getPokemonAt(state,{side:queued.side,slot:queued.action.slot});if(mon)queued.speed=effectiveSpeed(state,mon);}
    queue.sort((a, b) => b.priority - a.priority || (state.trickRoom?a.speed-b.speed:b.speed-a.speed) || b.tie - a.tie);
    const queued=queue.shift()!;
    const actor = getPokemonAt(state, { side: queued.side, slot: queued.action.slot });
    if (!actor || actor.uid !== queued.actorUid || actor.fainted) continue;
    actor.actedTurn = state.turn;
    if (queued.action.kind === 'switch') executeSwitch(state, queued.side, queued.action);
    else {
      // A transformation is part of this Pokémon's chosen action. Present and
      // resolve it here so its announcement follows switch/move priority order,
      // and a Pokémon knocked out earlier in the turn cannot transform first.
      if(queued.action.gimmick&&!activateGimmick(state,queued.side,queued.action.slot,queued.action.gimmick,queued.action.moveId,queued.action.teraType)) queued.action.gimmick=undefined;
      const move = weatherBallMove(state,actor,previewMove(actor,moves[queued.action.moveId] ?? STRUGGLE,queued.action.gimmick));
      withEventContext(state, { actorUid: actor.uid, moveId: move.id, category: move.category, powered:move.powered, type: move.type, side: queued.side, slot: queued.action.slot },
        () => executeMove(state, queued.side, queued.action as Extract<BattleAction, { kind: 'move' }>));
    }
    for(const side of ['player','cpu'] as const) for(const p of state.sides[side].team) if(p.fainted) endDynamax(state,p);
    if (checkWinner(state)) return state;
  }
  resolveDelayedAttacks(state);
  processEndTurn(state);
  finishTactics(state);
  finishGimmickTurn(state);
  if (checkWinner(state)) return state;
  replaceFainted(state);
  if(checkWinner(state))return state;
  for (const side of ['player', 'cpu'] as const) for (const pokemon of activePokemon(state, side)) { pokemon.protected = false; pokemon.flinched = false; }
  state.turn += 1;
  addLog(state, `${state.turn - 1}턴 종료. 다음 행동을 선택하세요.`, 'system', { kind: 'turn-end' });
  return state;
}

export function runTurn(previous: BattleState, playerActions: BattleAction[], cpuActions?: BattleAction[]): BattleState {
  return advanceTurn(structuredClone(previous), playerActions, cpuActions);
}

/** Generates presentation events during actual calculation; never derives events from final HP. */
export function runTurnWithEvents(previous: BattleState, playerActions: BattleAction[], cpuActions?: BattleAction[]): { state: BattleState; events: BattleEvent[] } {
  const state = structuredClone(previous);
  const events = startRecording(state);
  try { advanceTurn(state, playerActions, cpuActions); } finally { stopRecording(state); }
  return { state, events };
}
