import { abilities, items } from '../data';
import { adjustStage, passiveEffects, isGrounded } from './calculations';
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

export function announcePassive(state: BattleState, pokemon: Combatant, effect: PassiveEffect): void {
  const source = passiveSource(pokemon, effect);
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

export function applyDamage(state: BattleState, pokemon: Combatant, amount: number, source: string, directAttack = false): number {
  if (pokemon.fainted || amount <= 0) return 0;
  let dealt = Math.min(pokemon.hp, Math.max(1, Math.floor(amount)));
  const survival = directAttack && pokemon.hp === pokemon.maxHp && dealt >= pokemon.hp
    ? passiveEffects(pokemon).find(effect => effect.trigger === 'onDirectDamage') : undefined;
  if (survival?.trigger === 'onDirectDamage') {
    dealt = pokemon.hp - 1;
    if (survival.consume) pokemon.itemConsumed = true;
    announcePassive(state, pokemon, survival);
  }
  const beforeHp = pokemon.hp;
  pokemon.hp -= dealt;
  addLog(state, `${displayName(pokemon)}: ${dealt} HP 피해 (${sourceLabel(source)})`, 'damage',
    { targetUid: pokemon.uid, beforeHp, afterHp: pokemon.hp });
  if (pokemon.hp <= 0) {
    pokemon.hp = 0;
    pokemon.fainted = true;
    addLog(state, `${displayName(pokemon)} 기절!`, 'faint', { targetUid: pokemon.uid });
  }
  if (!pokemon.fainted) {
    for (const effect of passiveEffects(pokemon)) {
      if (effect.trigger !== 'onAfterDamage' || pokemon.hp > pokemon.maxHp * effect.threshold) continue;
      if (effect.consume) pokemon.itemConsumed = true;
      announcePassive(state, pokemon, effect);
      withEventContext(state, { actorUid: pokemon.uid, moveId: undefined, category: undefined }, () =>
        applyHeal(state, pokemon, effect.fraction, passiveSource(pokemon, effect).name));
    }
  }
  return dealt;
}

export function applyHeal(state: BattleState, pokemon: Combatant, fraction: number, source: string): number {
  if (pokemon.fainted || pokemon.hp >= pokemon.maxHp) return 0;
  const restored = Math.min(pokemon.maxHp - pokemon.hp, Math.max(1, Math.floor(pokemon.maxHp * fraction)));
  const beforeHp = pokemon.hp;
  pokemon.hp += restored;
  addLog(state, `${displayName(pokemon)}: HP ${restored} 회복 (${sourceLabel(source)})`, 'status',
    { kind: 'heal', targetUid: pokemon.uid, beforeHp, afterHp: pokemon.hp });
  return restored;
}

export function applyStatus(state: BattleState, pokemon: Combatant, status: Status, source: string, attacker?: Combatant, reflected = false): boolean {
  if (pokemon.fainted) return false;
  const immunity = passiveEffects(pokemon).find(effect => effect.trigger === 'onStatus' && effect.kind === 'statusImmunity' && effect.status === status);
  const blocked = pokemon.status || status === 'burn' && pokemon.types.includes('fire')
    || status === 'poison' && pokemon.types.some(type => ['poison', 'steel'].includes(type))
    || status === 'paralysis' && pokemon.types.includes('electric')
    || status === 'freeze' && (pokemon.types.includes('ice') || state.weather?.id === 'sun')
    || isGrounded(pokemon) && (state.field?.id === 'misty' || status === 'sleep' && state.field?.id === 'electric');
  if (blocked || immunity) {
    if (immunity) announcePassive(state, pokemon, immunity);
    addLog(state, `${displayName(pokemon)}에게 ${statusLabel[status]} 효과가 적용되지 않았다.`, 'status', { kind: 'blocked', targetUid: pokemon.uid });
    return false;
  }
  pokemon.status = status;
  if (status === 'sleep') pokemon.sleepTurns = randomInt(state, 1, 3);
  addLog(state, `${displayName(pokemon)}: ${statusLabel[status]} 상태 (${sourceLabel(source)})`, 'status', { targetUid: pokemon.uid, status });
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
  const other = pokemon.uid !== source.uid;
  const opposing = other && !Object.values(state.sides).some(side => side.team.includes(pokemon) && side.team.includes(source));
  if (stages < 0 && other) {
    const immunity = passiveEffects(pokemon).find(effect => effect.trigger === 'onStatDrop' && effect.kind === 'statImmunity'
      && (!effect.sourceId || effect.sourceId === sourceId));
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
    if (effect.trigger !== 'onStatDrop' || effect.kind !== 'stat') continue;
    announcePassive(state, pokemon, effect);
    withEventContext(state, { actorUid: pokemon.uid, moveId: undefined, category: undefined }, () =>
      applyStatChange(state, pokemon, effect.stat, effect.stages, pokemon));
  }
  return actual;
}

export function applyExitEffects(state: BattleState, pokemon: Combatant): void {
  if (pokemon.fainted) return;
  for (const effect of passiveEffects(pokemon)) {
    if (effect.trigger !== 'onExit' || pokemon.hp >= pokemon.maxHp) continue;
    announcePassive(state, pokemon, effect);
    withEventContext(state, { actorUid: pokemon.uid }, () => applyHeal(state, pokemon, effect.fraction, passiveSource(pokemon, effect).name));
  }
}

/** Absorption runs for damaging and status moves after protection, before accuracy. */
export function absorbMove(state: BattleState, pokemon: Combatant, move: Move): boolean {
  const effect = passiveEffects(pokemon).find(effect => effect.trigger === 'onDamage' && effect.kind === 'typeImmunity' && effect.type === move.type);
  if (!effect || effect.kind !== 'typeImmunity') return false;
  if (effect.activateBoost) pokemon.absorbedTypes = [...new Set([...(pokemon.absorbedTypes ?? []), move.type])];
  announcePassive(state, pokemon, effect);
  if (effect.healFraction) withEventContext(state, { actorUid: pokemon.uid, moveId: undefined, category: undefined }, () =>
    applyHeal(state, pokemon, effect.healFraction!, passiveSource(pokemon, effect).name));
  addLog(state, `${displayName(pokemon)}에게 효과가 없다.`, 'move', { kind: 'effectiveness', effectiveness: 0, targetUid: pokemon.uid });
  return true;
}

export function applyEntryEffects(state: BattleState, side: Side, pokemon: Combatant): void {
  for (const effect of passiveEffects(pokemon)) {
    if (effect.trigger !== 'onEnter') continue;
    const source = passiveSource(pokemon, effect).name;
    announcePassive(state, pokemon, effect);
    if (effect.kind === 'weather') {
      state.weather = { id: effect.weather, turns: effect.turns ?? 5 };
      addLog(state, `${displayName(pokemon)}의 ${source}: ${weatherLabel[effect.weather]} 시작!`, 'status', { kind: 'weather', actorUid: pokemon.uid });
    } else if (effect.kind === 'stat') {
      const targets = effect.target === 'self' ? [pokemon] : activePokemon(state, side === 'player' ? 'cpu' : 'player');
      for (const target of targets) applyStatChange(state, target, effect.stat, effect.stages, pokemon, passiveSource(pokemon, effect).sourceId);
    }
  }
}

export function triggerContact(state: BattleState, defender: Combatant, attacker: Combatant): void {
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
      if (pokemon.status === 'burn') applyDamage(state, pokemon, Math.max(1, Math.floor(pokemon.maxHp / 16)), 'burn');
      if (pokemon.status === 'poison') applyDamage(state, pokemon, Math.max(1, Math.floor(pokemon.maxHp / 8)), 'poison');
      if (pokemon.fainted) continue;
      if (state.weather?.id === 'sand' && !pokemon.types.some(type => ['rock', 'ground', 'steel'].includes(type))) {
        applyDamage(state, pokemon, Math.max(1, Math.floor(pokemon.maxHp / 16)), 'sand');
      }
      if (pokemon.fainted) continue;
      if (state.field?.id === 'grassy' && isGrounded(pokemon)) applyHeal(state, pokemon, 1 / 16, 'grassy field');
      for (const effect of passiveEffects(pokemon)) {
        if (effect.trigger === 'onEndTurn' && effect.kind === 'heal' && pokemon.hp < pokemon.maxHp) {
          announcePassive(state, pokemon, effect);
          withEventContext(state, { actorUid: pokemon.uid }, () => applyHeal(state, pokemon, effect.fraction, passiveSource(pokemon, effect).name));
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
}
