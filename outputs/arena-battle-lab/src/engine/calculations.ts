import { abilities, items, natures, typeChart } from '../data';
import type { BattleState, BoostStat, Combatant, Move, PassiveEffect, Species, Stat, Stats, TeamSet } from './types';

export const LEVEL = 50;

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

export function passiveEffects(pokemon: Combatant): PassiveEffect[] {
  return [
    ...(abilities[pokemon.set.abilityId]?.effects ?? []),
    ...(items[pokemon.set.itemId]?.effects ?? []),
  ];
}

function conditionMatches(effect: Extract<PassiveEffect, { kind: 'damageMultiplier' }>, pokemon: Combatant, move: Move): boolean {
  if (effect.condition === 'fullHp') return pokemon.hp === pokemon.maxHp;
  if (effect.condition === 'lowHp') return pokemon.hp <= pokemon.maxHp / 3;
  if (effect.condition === 'lowPower') return move.power > 0 && move.power <= 60;
  return true;
}

export function damagePassiveMultiplier(pokemon: Combatant, move: Move, trigger: 'onAttack' | 'onDamage'): number {
  return passiveEffects(pokemon).reduce((value, effect) => {
    if (effect.kind !== 'damageMultiplier' || effect.trigger !== trigger) return value;
    if (effect.type && effect.type !== move.type) return value;
    if (effect.category && effect.category !== move.category) return value;
    if (!conditionMatches(effect, pokemon, move)) return value;
    return value * effect.multiplier;
  }, 1);
}

export function isTypeImmune(pokemon: Combatant, move: Move): boolean {
  return passiveEffects(pokemon).some(effect => effect.trigger === 'onDamage' && effect.kind === 'typeImmunity' && effect.type === move.type);
}

export function effectiveSpeed(state: BattleState, pokemon: Combatant): number {
  let speed = pokemon.stats.spe * stageMultiplier(pokemon.stages.spe);
  if (pokemon.status === 'paralysis') speed *= 0.5;
  for (const effect of passiveEffects(pokemon)) {
    if (effect.trigger === 'onSpeed' && effect.kind === 'speedMultiplier' && (!effect.weather || effect.weather === state.weather?.id)) {
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

export function getModifiedStat(pokemon: Combatant, stat: Exclude<Stat, 'hp'>, critIgnore: 'negative' | 'positive' | null = null): number {
  let stage = pokemon.stages[stat];
  if (critIgnore === 'negative') stage = Math.max(0, stage);
  if (critIgnore === 'positive') stage = Math.min(0, stage);
  return Math.max(1, Math.floor(pokemon.stats[stat] * stageMultiplier(stage)));
}

export function weatherMultiplier(state: BattleState, move: Move): number {
  if (state.weather?.id === 'sun') return move.type === 'fire' ? 1.5 : move.type === 'water' ? 0.5 : 1;
  if (state.weather?.id === 'rain') return move.type === 'water' ? 1.5 : move.type === 'fire' ? 0.5 : 1;
  return 1;
}

export function fieldMultiplier(state: BattleState, attacker: Combatant, move: Move): number {
  if (attacker.types.includes('flying')) return 1;
  const fieldTypes: Record<string, string> = { electric: 'electric', grassy: 'grass', psychic: 'psychic' };
  return fieldTypes[state.field?.id ?? ''] === move.type ? 1.3 : 1;
}

export function estimateDamage(state: BattleState, attacker: Combatant, defender: Combatant, move: Move, spread = false): number {
  if (move.category === 'status' || move.power <= 0 || isTypeImmune(defender, move)) return 0;
  const type = getTypeMultiplier(move.type, defender.types);
  if (type === 0) return 0;
  const offense = getModifiedStat(attacker, move.category === 'physical' ? 'atk' : 'spa');
  const defense = getModifiedStat(defender, move.category === 'physical' ? 'def' : 'spd');
  let multiplier = attacker.types.includes(move.type) ? 1.5 : 1;
  for (const effect of passiveEffects(attacker)) {
    if (effect.trigger === 'onAttack' && effect.kind === 'stabMultiplier' && attacker.types.includes(move.type)) multiplier = effect.multiplier;
  }
  multiplier *= type * weatherMultiplier(state, move) * fieldMultiplier(state, attacker, move);
  multiplier *= damagePassiveMultiplier(attacker, move, 'onAttack') * damagePassiveMultiplier(defender, move, 'onDamage');
  if (spread) multiplier *= 0.75;
  if (attacker.status === 'burn' && move.category === 'physical') multiplier *= 0.5;
  const base = Math.floor(Math.floor(((2 * LEVEL / 5 + 2) * move.power * offense) / defense) / 50) + 2;
  return Math.max(1, Math.floor(base * multiplier * 0.925));
}
