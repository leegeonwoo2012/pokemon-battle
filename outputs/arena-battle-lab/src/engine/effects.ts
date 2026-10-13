import { abilities, items } from '../data';
import { adjustStage, passiveEffects } from './calculations';
import { fieldLabel, sourceLabel, statLabel, statusLabel, weatherLabel } from './labels';
import { chance, randomInt } from './rng';
import type { BattleLog, BattleState, Combatant, Side, Status, TargetRef } from './types';

export function addLog(state: BattleState, text: string, kind: BattleLog['kind'] = 'system'): void {
  state.log.push({ turn: state.turn, text, kind });
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

export function applyDamage(state: BattleState, pokemon: Combatant, amount: number, source: string): number {
  if (pokemon.fainted || amount <= 0) return 0;
  const dealt = Math.min(pokemon.hp, Math.max(1, Math.floor(amount)));
  pokemon.hp -= dealt;
  addLog(state, `${displayName(pokemon)}: ${dealt} HP 피해 (${sourceLabel(source)})`, 'damage');
  if (pokemon.hp <= 0) {
    pokemon.hp = 0;
    pokemon.fainted = true;
    addLog(state, `${displayName(pokemon)} 기절!`, 'faint');
  }
  return dealt;
}

export function applyHeal(state: BattleState, pokemon: Combatant, fraction: number, source: string): number {
  if (pokemon.fainted || pokemon.hp >= pokemon.maxHp) return 0;
  const restored = Math.min(pokemon.maxHp - pokemon.hp, Math.max(1, Math.floor(pokemon.maxHp * fraction)));
  pokemon.hp += restored;
  addLog(state, `${displayName(pokemon)}: HP ${restored} 회복 (${sourceLabel(source)})`, 'status');
  return restored;
}

export function applyStatus(state: BattleState, pokemon: Combatant, status: Status, source: string): boolean {
  if (pokemon.fainted || pokemon.status) return false;
  if (status === 'burn' && pokemon.types.includes('fire')) return false;
  if (status === 'poison' && (pokemon.types.includes('poison') || pokemon.types.includes('steel'))) return false;
  if (status === 'paralysis' && pokemon.types.includes('electric')) return false;
  if (status === 'freeze' && pokemon.types.includes('ice')) return false;
  if (!pokemon.types.includes('flying') && (state.field?.id === 'misty' || (status === 'sleep' && state.field?.id === 'electric'))) return false;
  if (passiveEffects(pokemon).some(effect => effect.trigger === 'onStatus' && effect.kind === 'statusImmunity' && effect.status === status)) return false;
  pokemon.status = status;
  if (status === 'sleep') pokemon.sleepTurns = randomInt(state, 1, 3);
  addLog(state, `${displayName(pokemon)}: ${statusLabel[status]} 상태 (${sourceLabel(source)})`, 'status');
  return true;
}

export function applyEntryEffects(state: BattleState, side: Side, pokemon: Combatant): void {
  for (const effect of passiveEffects(pokemon)) {
    if (effect.trigger !== 'onEnter') continue;
    const source = abilities[pokemon.set.abilityId]?.effects.includes(effect)
      ? abilities[pokemon.set.abilityId].name
      : items[pokemon.set.itemId]?.name ?? 'effect';
    if (effect.kind === 'weather') {
      state.weather = { id: effect.weather, turns: effect.turns ?? 5 };
      addLog(state, `${displayName(pokemon)}의 ${source}: ${weatherLabel[effect.weather]} 시작!`, 'status');
    } else if (effect.kind === 'stat') {
      const targets = effect.target === 'self' ? [pokemon] : activePokemon(state, side === 'player' ? 'cpu' : 'player');
      for (const target of targets) {
        const actual = adjustStage(target, effect.stat, effect.stages);
        if (actual) addLog(state, `${displayName(target)}: ${statLabel[effect.stat]} ${actual > 0 ? `${actual}단계 상승` : `${-actual}단계 하락`} (${source})`, 'status');
      }
    }
  }
}

export function triggerContact(state: BattleState, defender: Combatant, attacker: Combatant): void {
  for (const effect of passiveEffects(defender)) {
    if (effect.trigger === 'onContact' && effect.kind === 'status' && chance(state, effect.chance)) {
      applyStatus(state, attacker, effect.status, displayName(defender));
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
      if (state.field?.id === 'grassy' && !pokemon.types.includes('flying')) applyHeal(state, pokemon, 1 / 16, 'grassy field');
      for (const effect of passiveEffects(pokemon)) {
        if (effect.trigger === 'onEndTurn' && effect.kind === 'heal') applyHeal(state, pokemon, effect.fraction, 'held item or ability');
      }
    }
  }
  if (state.weather && --state.weather.turns <= 0) {
    addLog(state, `${weatherLabel[state.weather.id]} 종료.`, 'status');
    state.weather = null;
  }
  if (state.field && --state.field.turns <= 0) {
    addLog(state, `${fieldLabel[state.field.id]} 종료.`, 'status');
    state.field = null;
  }
}
