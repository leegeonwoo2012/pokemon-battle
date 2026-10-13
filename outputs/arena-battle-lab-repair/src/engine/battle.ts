import { abilities, items, moves, natures, species } from '../data';
import {
  calculateStats, damagePassiveMultiplier, effectiveSpeed, fieldMultiplier, getModifiedStat,
  getTypeMultiplier, isTypeImmune, passiveEffects, weatherMultiplier, LEVEL,
  matchingDamageEffects, burnMultiplier, moveAccuracy, secondaryChance,
  alwaysHits, defensiveStat, criticalChance, isGrounded,
} from './calculations';
import {
  activePokemon, addLog, applyDamage, applyEntryEffects, applyHeal, applyStatus,
  displayName, getPokemonAt, processEndTurn, triggerContact,
  announcePassive, absorbMove, applyExitEffects, applyStatChange, passiveSource,
} from './effects';
import { startRecording, stopRecording, withEventContext } from './events';
import { chance, random, randomInt } from './rng';
import { chooseCpuActions } from './ai';
import { isMoveUsable, usableMoves } from './choices';
import { applyVolatile, processConfusion, processFlinch } from './conditions';
import { fieldLabel, weatherLabel } from './labels';
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
    if (action?.kind === 'move' && isMoveUsable(actor, action.moveId)) return [action];
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
  if (alwaysHits(state, move)) return true;
  return chance(state, moveAccuracy(state, user, target, move));
}

function moveDamage(state: BattleState, attacker: Combatant, defender: Combatant, move: Move, spread: boolean): { damage: number; critical: boolean; effectiveness: number } {
  const effectiveness = move.id === 'struggle' ? 1 : getTypeMultiplier(move.type, defender.types);
  if (effectiveness === 0 || move.id !== 'struggle' && isTypeImmune(defender, move)) return { damage: 0, critical: false, effectiveness: 0 };
  const critical = chance(state, criticalChance(attacker, defender, move));
  const attackStat = move.category === 'physical' ? 'atk' : 'spa';
  const defenseStat = move.category === 'physical' ? 'def' : 'spd';
  const attack = getModifiedStat(attacker, attackStat, critical ? 'negative' : null);
  const defense = defensiveStat(state, defender, defenseStat, critical ? 'positive' : null);
  const base = Math.floor(Math.floor(((2 * LEVEL / 5 + 2) * move.power * attack) / defense) / 50) + 2;
  let stab = move.id !== 'struggle' && attacker.types.includes(move.type) ? 1.5 : 1;
  for (const effect of passiveEffects(attacker)) if (effect.trigger === 'onAttack' && effect.kind === 'stabMultiplier' && stab > 1) stab = effect.multiplier;
  let modifier = stab * effectiveness * weatherMultiplier(state, move) * fieldMultiplier(state, attacker, move, defender);
  modifier *= damagePassiveMultiplier(attacker, move, 'onAttack') * damagePassiveMultiplier(defender, move, 'onDamage');
  if (critical) modifier *= 1.5;
  if (spread) modifier *= 0.75;
  modifier *= burnMultiplier(attacker, move);
  modifier *= randomInt(state, 85, 100) / 100;
  return { damage: Math.max(1, Math.floor(base * modifier)), critical, effectiveness };
}

function applyMoveEffect(state: BattleState, effect: MoveEffect, user: Combatant, target: Combatant, damageDealt: number): void {
  if ('chance' in effect && effect.chance !== undefined && !chance(state, secondaryChance(user, effect.chance))) return;
  if (effect.kind === 'status') applyStatus(state, effect.target === 'self' ? user : target, effect.status, displayName(user), user);
  else if (effect.kind === 'volatile') applyVolatile(state, target, effect.condition);
  else if (effect.kind === 'stat') {
    const recipient = effect.target === 'self' ? user : target;
    applyStatChange(state, recipient, effect.stat, effect.stages, user);
  } else if (effect.kind === 'heal') applyHeal(state, effect.target === 'target' ? target : user, effect.fraction, displayName(user));
  else if (effect.kind === 'weather') {
    state.weather = { id: effect.weather, turns: effect.turns ?? 5 };
    addLog(state, `${weatherLabel[effect.weather]} 시작!`, 'status', { kind: 'weather' });
  } else if (effect.kind === 'field') {
    state.field = { id: effect.field, turns: effect.turns ?? 5 };
    addLog(state, `${fieldLabel[effect.field]} 전개!`, 'status', { kind: 'field' });
  } else if (effect.kind === 'drain' && damageDealt) applyHeal(state, user, (damageDealt * effect.fraction) / user.maxHp, 'drain');
  else if (effect.kind === 'recoil' && damageDealt) withEventContext(state, { targetUid: user.uid, moveId: undefined, category: undefined }, () =>
    applyDamage(state, user, Math.max(1, Math.floor((effect.basis === 'maxHp' ? user.maxHp : damageDealt) * effect.fraction)), 'recoil'));
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
    addLog(state, `${displayName(user)} 방어 성공!`, 'status', { kind: 'protect', targetUid: user.uid });
  }
}

const STRUGGLE: Move = { id: 'struggle', name: '발버둥', type: 'normal', category: 'physical', power: 50, accuracy: null, pp: 1, priority: 0, target: 'enemy', contact: true, effects: [{ kind: 'recoil', fraction: 0.25, basis: 'maxHp' }] };

function executeMove(state: BattleState, side: Side, action: Extract<BattleAction, { kind: 'move' }>): void {
  const user = getPokemonAt(state, { side, slot: action.slot });
  if (!user || user.fainted) return;
  const move = action.moveId === 'struggle' ? STRUGGLE : moves[action.moveId];
  if (!move) return;
  if (user.status === 'sleep') {
    if (user.sleepTurns > 0) { user.sleepTurns--; addLog(state, `${displayName(user)} 잠들어 있다.`, 'status', { kind: 'blocked', targetUid: user.uid }); return; }
    user.status = null;
    addLog(state, `${displayName(user)} 잠에서 깨어났다!`, 'status', { targetUid: user.uid, status: null });
  }
  if (user.status === 'freeze') {
    if (!move.thawsUser && !chance(state, 20)) { addLog(state, `${displayName(user)} 얼어서 움직일 수 없다.`, 'status', { kind: 'blocked', targetUid: user.uid }); return; }
    user.status = null;
    addLog(state, `${displayName(user)} 얼음이 풀렸다!`, 'status', { targetUid: user.uid, status: null });
  }
  if (!processFlinch(state, user) || !processConfusion(state, user)) return;
  if (user.status === 'paralysis' && chance(state, 25)) { addLog(state, `${displayName(user)} 마비로 움직일 수 없다!`, 'status', { kind: 'blocked', targetUid: user.uid }); return; }
  if (move.id !== 'struggle') user.pp[move.id] = Math.max(0, user.pp[move.id] - 1);
  if (move.id !== 'struggle' && !user.choiceLock) {
    const lock = passiveEffects(user).find(effect => effect.trigger === 'onChoice');
    if (lock) {
      user.choiceLock = move.id;
      announcePassive(state, user, lock);
    }
  }
  const refs = resolveTargets(state, side, action.slot, move, action.target);
  const targetUids = refs.map(ref => getPokemonAt(state, ref)!.uid);
  addLog(state, `${displayName(user)}: ${move.name} 사용!`, 'move', { targetUid: targetUids[0], targetUids });
  if (refs.length === 0) { addLog(state, '기술이 실패했다!', 'move', { kind: 'blocked' }); return; }
  const spread = (move.target === 'allEnemies' || move.target === 'allOthers') && refs.length > 1;
  let totalDamage = 0;
  for (const ref of refs) {
    const target = getPokemonAt(state, ref);
    if (!target || target.fainted || user.fainted) continue;
    withEventContext(state, { targetUid: target.uid }, () => {
      if (target.protected && target !== user) { addLog(state, `${displayName(target)}이 공격을 방어했다!`, 'move', { kind: 'blocked' }); return; }
      if (state.field?.id === 'psychic' && move.priority > 0 && ref.side !== side && isGrounded(target)) {
        addLog(state, `사이코필드가 ${displayName(target)}을(를) 선제공격으로부터 보호했다!`, 'move', {kind:'blocked'}); return;
      }
      if (move.powder && target.types.includes('grass')) {
        addLog(state, `${displayName(target)}에게 가루 기술이 통하지 않는다.`, 'move', {kind:'blocked'}); return;
      }
      // Only Thunder Wave in this supported status set respects type-chart immunity.
      if (move.id === 'thunderwave' && target !== user && getTypeMultiplier(move.type, target.types) === 0) {
        addLog(state, `${displayName(target)}에게 효과가 없다.`, 'move', { kind: 'effectiveness', effectiveness: 0 });
        return;
      }
      if (move.id !== 'struggle' && target !== user && absorbMove(state, target, move)) return;
      if (!accuracyHits(state, user, target, move)) { addLog(state, `${move.name}: ${displayName(target)}에게 빗나갔다!`, 'move', { kind: 'miss' }); return; }
      let dealt = 0;
      if (move.category !== 'status' && move.power > 0) {
        const result = moveDamage(state, user, target, move, spread);
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
        dealt = applyDamage(state, target, result.damage, move.name, true);
        totalDamage += dealt;
        if (move.type === 'fire' && target.status === 'freeze' && !target.fainted) {
          target.status = null;
          addLog(state, `${displayName(target)}의 얼음이 풀렸다!`, 'status', {targetUid:target.uid, status:null});
        }
        if (result.critical) addLog(state, '급소에 맞았다!', 'move', { kind: 'critical' });
        if (result.effectiveness > 1) addLog(state, '효과가 굉장했다!', 'move', { kind: 'effectiveness', effectiveness: result.effectiveness });
        if (result.effectiveness < 1) addLog(state, '효과가 별로였다.', 'move', { kind: 'effectiveness', effectiveness: result.effectiveness });
        if (move.contact && dealt) triggerContact(state, target, user);
      }
      for (const effect of move.effects ?? []) {
        const needsLivingTarget = effect.kind === 'volatile' || (effect.kind === 'status' || effect.kind === 'stat') && effect.target !== 'self'
          || effect.kind === 'heal' && effect.target === 'target';
        if (target.fainted && needsLivingTarget) continue;
        applyMoveEffect(state, effect, user, target, dealt);
      }
    });
  }
  if (totalDamage && !user.fainted) for (const effect of passiveEffects(user)) {
    if (effect.trigger !== 'onAfterMove') continue;
    announcePassive(state, user, effect);
    withEventContext(state, { actorUid: user.uid, targetUid: user.uid, moveId: undefined, category: undefined }, () =>
      applyDamage(state, user, Math.max(1, Math.floor(user.maxHp * effect.fraction)), passiveSource(user, effect).name));
  }
}

function executeSwitch(state: BattleState, side: Side, action: Extract<BattleAction, { kind: 'switch' }>): void {
  const sideState = state.sides[side];
  const oldIndex = sideState.active[action.slot];
  const oldPokemon = sideState.team[oldIndex];
  const replacement = sideState.team[action.to];
  if (!replacement || replacement.fainted || sideState.active.includes(action.to)) return;
  state.switchTurns ??= {};
  state.switchTurns[side] ??= {};
  state.switchTurns[side]![action.slot] = state.turn;
  applyExitEffects(state, oldPokemon);
  addLog(state, `${displayName(oldPokemon)} 교체!`, 'switch', { kind: 'switch-out', actorUid: oldPokemon.uid, side, slot: action.slot });
  oldPokemon.stages = Object.fromEntries(BOOST_KEYS.map(stat => [stat, 0])) as Combatant['stages'];
  oldPokemon.protected = false;
  oldPokemon.protectStreak = 0;
  oldPokemon.choiceLock = undefined;
  oldPokemon.absorbedTypes = [];
  oldPokemon.confusionTurns = 0;
  oldPokemon.flinched = false;
  sideState.active[action.slot] = action.to;
  addLog(state, `${side === 'player' ? '플레이어' : 'CPU'}: ${displayName(replacement)} 출전!`, 'switch', { kind: 'switch-in', actorUid: replacement.uid, side, slot: action.slot });
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
      addLog(state, `${side === 'player' ? '플레이어' : 'CPU'}: ${displayName(pokemon)} 출전!`, 'switch', { kind: 'switch-in', actorUid: pokemon.uid, side, slot });
      applyEntryEffects(state, side, pokemon);
    }
  }
}

interface QueuedAction { side: Side; action: BattleAction; actorUid: string; priority: number; speed: number; tie: number }

function advanceTurn(state: BattleState, playerActions: BattleAction[], cpuActions?: BattleAction[]): BattleState {
  if (state.winner) return state;
  for (const side of ['player', 'cpu'] as const) for (const pokemon of activePokemon(state, side)) { pokemon.protected = false; pokemon.flinched = false; }
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
    actor.actedTurn = state.turn;
    if (queued.action.kind === 'switch') executeSwitch(state, queued.side, queued.action);
    else {
      const move = moves[queued.action.moveId] ?? STRUGGLE;
      withEventContext(state, { actorUid: actor.uid, moveId: move.id, category: move.category, type: move.type, side: queued.side, slot: queued.action.slot },
        () => executeMove(state, queued.side, queued.action as Extract<BattleAction, { kind: 'move' }>));
    }
    if (checkWinner(state)) return state;
  }
  processEndTurn(state);
  if (checkWinner(state)) return state;
  replaceFainted(state);
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
