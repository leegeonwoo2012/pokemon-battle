import { abilities, items, moves, natures, species } from '../data';
import {
  calculateStats, damagePassiveMultiplier, effectiveSpeed, fieldMultiplier, getModifiedStat,
  getTypeMultiplier, isTypeImmune, passiveEffects, stageMultiplier, weatherMultiplier, LEVEL,
} from './calculations';
import {
  activePokemon, addLog, applyDamage, applyEntryEffects, applyHeal, applyStatus,
  displayName, getPokemonAt, processEndTurn, triggerContact,
} from './effects';
import { chance, random, randomInt } from './rng';
import { chooseCpuActions } from './ai';
import { fieldLabel, statLabel, weatherLabel } from './labels';
import type {
  BattleAction, BattleOptions, BattleState, Combatant, Move, MoveEffect,
  Side, SideState, TargetRef, TeamSet,
} from './types';

const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
const BOOST_KEYS = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'] as const;

export function validateTeam(team: TeamSet[]): string[] {
  const errors: string[] = [];
  if (team.length < 1 || team.length > 6) errors.push('A team must contain 1–6 Pokémon.');
  for (const [index, set] of team.entries()) {
    const label = `Pokémon ${index + 1}`;
    const mon = species[set.speciesId];
    if (!mon) { errors.push(`${label}: unknown species.`); continue; }
    if (!mon.abilities.includes(set.abilityId) || !abilities[set.abilityId]) errors.push(`${label}: invalid ability.`);
    if (!items[set.itemId]) errors.push(`${label}: invalid item.`);
    if (!natures[set.natureId]) errors.push(`${label}: invalid nature.`);
    if (set.moves.length !== 4 || new Set(set.moves).size !== set.moves.length) errors.push(`${label}: choose four different moves.`);
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
    stages: Object.fromEntries(BOOST_KEYS.map(stat => [stat, 0])) as Combatant['stages'],
    pp: Object.fromEntries(set.moves.map(id => [id, moves[id].pp])), protected: false, fainted: false,
  };
}

export function createBattle(options: BattleOptions): BattleState {
  const issues = [...validateTeam(options.playerTeam), ...validateTeam(options.cpuTeam)];
  if (issues.length) throw new Error(issues.join(' '));
  const slots = options.format === 'doubles' ? 2 : 1;
  const sides: Record<Side, SideState> = {
    player: { team: options.playerTeam.map((set, index) => createCombatant(set, 'player', index)), active: [] },
    cpu: { team: options.cpuTeam.map((set, index) => createCombatant(set, 'cpu', index)), active: [] },
  };
  for (const side of ['player', 'cpu'] as const) sides[side].active = sides[side].team.slice(0, slots).map((_, index) => index);
  const state: BattleState = {
    format: options.format, turn: 1, sides, weather: null, field: null, log: [], winner: null,
    rngState: (options.seed ?? Date.now()) >>> 0 || 0x6d2b79f5,
  };
  addLog(state, `${options.format === 'doubles' ? '더블' : '싱글'} 배틀 시작!`);
  for (const side of ['player', 'cpu'] as const) {
    for (const pokemon of activePokemon(state, side)) {
      addLog(state, `${side === 'player' ? '플레이어' : 'CPU'}: ${displayName(pokemon)} 출전!`, 'switch');
      applyEntryEffects(state, side, pokemon);
    }
  }
  return state;
}

function usableMoves(pokemon: Combatant): Move[] {
  return pokemon.set.moves.map(id => moves[id]).filter(move => !!move && pokemon.pp[move.id] > 0);
}

function fallbackAction(state: BattleState, side: Side, slot: number): BattleAction {
  const pokemon = getPokemonAt(state, { side, slot });
  const move = pokemon && usableMoves(pokemon)[0];
  return { kind: 'move', slot, moveId: move?.id ?? 'struggle' };
}

function normalizeActions(state: BattleState, side: Side, submitted: BattleAction[]): BattleAction[] {
  const occupied = new Set<number>(state.sides[side].active);
  const reserved = new Set<number>();
  return state.sides[side].active.flatMap((teamIndex, slot) => {
    const actor = state.sides[side].team[teamIndex];
    if (!actor || actor.fainted) return [];
    const action = submitted.find(candidate => candidate.slot === slot);
    if (action?.kind === 'switch') {
      const replacement = state.sides[side].team[action.to];
      if (replacement && !replacement.fainted && !occupied.has(action.to) && !reserved.has(action.to)) {
        reserved.add(action.to);
        return [action];
      }
    }
    if (action?.kind === 'move' && (action.moveId === 'struggle' || (actor.set.moves.includes(action.moveId) && actor.pp[action.moveId] > 0))) return [action];
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
  if (move.target === 'allEnemies') return activeRefs(foe);
  if (move.target === 'allOthers') return [...activeRefs(side).filter(ref => ref.slot !== slot), ...activeRefs(foe)];
  if (move.target === 'ally') {
    const allies = activeRefs(side).filter(ref => ref.slot !== slot);
    return requested && allies.some(ref => ref.slot === requested.slot && ref.side === requested.side) ? [requested] : allies.slice(0, 1);
  }
  const choices = move.target === 'any' ? [...activeRefs(foe), ...activeRefs(side).filter(ref => ref.slot !== slot)] : activeRefs(foe);
  return requested && choices.some(ref => ref.slot === requested.slot && ref.side === requested.side) ? [requested] : choices.slice(0, 1);
}

function accuracyHits(state: BattleState, user: Combatant, target: Combatant, move: Move): boolean {
  if (move.accuracy === null) return true;
  const adjusted = move.accuracy * stageMultiplier(user.stages.accuracy, true) / stageMultiplier(target.stages.evasion, true);
  return chance(state, Math.min(100, adjusted));
}

function moveDamage(state: BattleState, attacker: Combatant, defender: Combatant, move: Move, spread: boolean): { damage: number; critical: boolean; effectiveness: number } {
  const effectiveness = getTypeMultiplier(move.type, defender.types);
  if (effectiveness === 0 || isTypeImmune(defender, move)) return { damage: 0, critical: false, effectiveness: 0 };
  const critical = chance(state, 100 / 24);
  const attackStat = move.category === 'physical' ? 'atk' : 'spa';
  const defenseStat = move.category === 'physical' ? 'def' : 'spd';
  const attack = getModifiedStat(attacker, attackStat, critical ? 'negative' : null);
  const defense = getModifiedStat(defender, defenseStat, critical ? 'positive' : null);
  const base = Math.floor(Math.floor(((2 * LEVEL / 5 + 2) * move.power * attack) / defense) / 50) + 2;
  let stab = attacker.types.includes(move.type) ? 1.5 : 1;
  for (const effect of passiveEffects(attacker)) if (effect.trigger === 'onAttack' && effect.kind === 'stabMultiplier' && stab > 1) stab = effect.multiplier;
  let modifier = stab * effectiveness * weatherMultiplier(state, move) * fieldMultiplier(state, attacker, move);
  modifier *= damagePassiveMultiplier(attacker, move, 'onAttack') * damagePassiveMultiplier(defender, move, 'onDamage');
  if (critical) modifier *= 1.5;
  if (spread) modifier *= 0.75;
  if (attacker.status === 'burn' && move.category === 'physical') modifier *= 0.5;
  modifier *= randomInt(state, 85, 100) / 100;
  return { damage: Math.max(1, Math.floor(base * modifier)), critical, effectiveness };
}

function applyMoveEffect(state: BattleState, effect: MoveEffect, user: Combatant, target: Combatant, damageDealt: number): void {
  if ('chance' in effect && effect.chance !== undefined && !chance(state, effect.chance)) return;
  if (effect.kind === 'status') applyStatus(state, effect.target === 'self' ? user : target, effect.status, displayName(user));
  else if (effect.kind === 'stat') {
    const recipient = effect.target === 'self' ? user : target;
    const before = recipient.stages[effect.stat];
    recipient.stages[effect.stat] = Math.max(-6, Math.min(6, before + effect.stages));
    if (recipient.stages[effect.stat] !== before) addLog(state, `${displayName(recipient)}: ${statLabel[effect.stat]} ${effect.stages > 0 ? '상승' : '하락'}!`, 'status');
  } else if (effect.kind === 'heal') applyHeal(state, effect.target === 'target' ? target : user, effect.fraction, displayName(user));
  else if (effect.kind === 'weather') {
    state.weather = { id: effect.weather, turns: effect.turns ?? 5 };
    addLog(state, `${weatherLabel[effect.weather]} 시작!`, 'status');
  } else if (effect.kind === 'field') {
    state.field = { id: effect.field, turns: effect.turns ?? 5 };
    addLog(state, `${fieldLabel[effect.field]} 전개!`, 'status');
  } else if (effect.kind === 'drain' && damageDealt) applyHeal(state, user, (damageDealt * effect.fraction) / user.maxHp, 'drain');
  else if (effect.kind === 'recoil' && damageDealt) applyDamage(state, user, Math.max(1, Math.floor(damageDealt * effect.fraction)), 'recoil');
  else if (effect.kind === 'protect') { user.protected = true; addLog(state, `${displayName(user)} 방어 성공!`, 'status'); }
}

const STRUGGLE: Move = { id: 'struggle', name: '발버둥', type: 'normal', category: 'physical', power: 50, accuracy: null, pp: 1, priority: 0, target: 'enemy', effects: [{ kind: 'recoil', fraction: 0.25 }] };

function executeMove(state: BattleState, side: Side, action: Extract<BattleAction, { kind: 'move' }>): void {
  const user = getPokemonAt(state, { side, slot: action.slot });
  if (!user || user.fainted) return;
  const move = action.moveId === 'struggle' ? STRUGGLE : moves[action.moveId];
  if (!move) return;
  if (user.status === 'sleep') {
    if (--user.sleepTurns > 0) { addLog(state, `${displayName(user)} 잠들어 있다.`, 'status'); return; }
    user.status = null;
    addLog(state, `${displayName(user)} 잠에서 깨어났다!`, 'status');
  }
  if (user.status === 'freeze') {
    if (!chance(state, 20)) { addLog(state, `${displayName(user)} 얼어서 움직일 수 없다.`, 'status'); return; }
    user.status = null;
    addLog(state, `${displayName(user)} 얼음이 풀렸다!`, 'status');
  }
  if (user.status === 'paralysis' && chance(state, 25)) { addLog(state, `${displayName(user)} 마비로 움직일 수 없다!`, 'status'); return; }
  if (move.id !== 'struggle') user.pp[move.id] = Math.max(0, user.pp[move.id] - 1);
  addLog(state, `${displayName(user)}: ${move.name} 사용!`, 'move');
  const refs = resolveTargets(state, side, action.slot, move, action.target);
  if (refs.length === 0) { addLog(state, '기술이 실패했다!', 'move'); return; }
  const spread = (move.target === 'allEnemies' || move.target === 'allOthers') && refs.length > 1;
  for (const ref of refs) {
    const target = getPokemonAt(state, ref);
    if (!target || target.fainted || user.fainted) continue;
    if (target.protected && target !== user) { addLog(state, `${displayName(target)} 방어 성공!`, 'move'); continue; }
    if (move.category === 'status' && target !== user && getTypeMultiplier(move.type, target.types) === 0) {
      addLog(state, `${displayName(target)}에게 효과가 없다.`, 'move');
      continue;
    }
    if (!accuracyHits(state, user, target, move)) { addLog(state, `${move.name}: ${displayName(target)}에게 빗나갔다!`, 'move'); continue; }
    let dealt = 0;
    if (move.category !== 'status' && move.power > 0) {
      const result = moveDamage(state, user, target, move, spread);
      if (result.effectiveness === 0) { addLog(state, `${displayName(target)}에게 효과가 없다.`, 'move'); continue; }
      dealt = applyDamage(state, target, result.damage, move.name);
      if (result.critical) addLog(state, '급소에 맞았다!', 'move');
      if (result.effectiveness > 1) addLog(state, '효과가 굉장했다!', 'move');
      if (result.effectiveness < 1) addLog(state, '효과가 별로였다.', 'move');
      if (move.contact && dealt) triggerContact(state, target, user);
    }
    for (const effect of move.effects ?? []) {
      const needsLivingTarget = (effect.kind === 'status' || effect.kind === 'stat') && effect.target !== 'self'
        || effect.kind === 'heal' && effect.target === 'target';
      if (target.fainted && needsLivingTarget) continue;
      applyMoveEffect(state, effect, user, target, dealt);
    }
  }
}

function executeSwitch(state: BattleState, side: Side, action: Extract<BattleAction, { kind: 'switch' }>): void {
  const sideState = state.sides[side];
  const oldIndex = sideState.active[action.slot];
  const oldPokemon = sideState.team[oldIndex];
  const replacement = sideState.team[action.to];
  if (!replacement || replacement.fainted || sideState.active.includes(action.to)) return;
  oldPokemon.stages = Object.fromEntries(BOOST_KEYS.map(stat => [stat, 0])) as Combatant['stages'];
  oldPokemon.protected = false;
  addLog(state, `${displayName(oldPokemon)} 교체!`, 'switch');
  sideState.active[action.slot] = action.to;
  addLog(state, `${side === 'player' ? '플레이어' : 'CPU'}: ${displayName(replacement)} 출전!`, 'switch');
  applyEntryEffects(state, side, replacement);
}

function checkWinner(state: BattleState): boolean {
  const playerAlive = state.sides.player.team.some(pokemon => !pokemon.fainted);
  const cpuAlive = state.sides.cpu.team.some(pokemon => !pokemon.fainted);
  if (playerAlive && cpuAlive) return false;
  state.winner = playerAlive ? 'player' : cpuAlive ? 'cpu' : 'draw';
  addLog(state, state.winner === 'draw' ? '배틀은 무승부로 끝났다.' : `${state.winner === 'player' ? '플레이어' : 'CPU'} 승리!`, 'result');
  return true;
}

function replaceFainted(state: BattleState): void {
  for (const side of ['player', 'cpu'] as const) {
    const sideState = state.sides[side];
    for (let slot = 0; slot < sideState.active.length; slot++) {
      if (!sideState.team[sideState.active[slot]].fainted) continue;
      const next = sideState.team.findIndex((pokemon, index) => !pokemon.fainted && !sideState.active.includes(index));
      if (next < 0) continue;
      sideState.active[slot] = next;
      const pokemon = sideState.team[next];
      addLog(state, `${side === 'player' ? '플레이어' : 'CPU'}: ${displayName(pokemon)} 출전!`, 'switch');
      applyEntryEffects(state, side, pokemon);
    }
  }
}

interface QueuedAction { side: Side; action: BattleAction; actorUid: string; priority: number; speed: number; tie: number }

export function runTurn(previous: BattleState, playerActions: BattleAction[], cpuActions?: BattleAction[]): BattleState {
  const state = structuredClone(previous);
  if (state.winner) return state;
  for (const side of ['player', 'cpu'] as const) for (const pokemon of activePokemon(state, side)) pokemon.protected = false;
  const selected: Record<Side, BattleAction[]> = {
    player: normalizeActions(state, 'player', playerActions),
    cpu: normalizeActions(state, 'cpu', cpuActions ?? chooseCpuActions(state)),
  };
  const queue: QueuedAction[] = [];
  for (const side of ['player', 'cpu'] as const) {
    for (const action of selected[side]) {
      const actor = getPokemonAt(state, { side, slot: action.slot });
      if (!actor) continue;
      queue.push({
        side, action, actorUid: actor.uid,
        priority: action.kind === 'switch' ? 6 : (moves[action.moveId]?.priority ?? 0),
        speed: effectiveSpeed(state, actor), tie: random(state),
      });
    }
  }
  queue.sort((a, b) => b.priority - a.priority || b.speed - a.speed || b.tie - a.tie);
  for (const queued of queue) {
    const actor = getPokemonAt(state, { side: queued.side, slot: queued.action.slot });
    if (!actor || actor.uid !== queued.actorUid || actor.fainted) continue;
    if (queued.action.kind === 'switch') executeSwitch(state, queued.side, queued.action);
    else executeMove(state, queued.side, queued.action);
    if (checkWinner(state)) return state;
  }
  processEndTurn(state);
  if (checkWinner(state)) return state;
  replaceFainted(state);
  state.turn += 1;
  return state;
}
