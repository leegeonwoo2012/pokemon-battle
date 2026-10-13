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
    ...(!pokemon.itemConsumed ? items[pokemon.set.itemId]?.effects ?? [] : []),
  ];
}

function conditionMatches(effect: Extract<PassiveEffect, { kind: 'damageMultiplier' }>, pokemon: Combatant, move: Move): boolean {
  if (effect.condition === 'fullHp') return pokemon.hp === pokemon.maxHp;
  if (effect.condition === 'lowHp') return pokemon.hp <= pokemon.maxHp / 3;
  if (effect.condition === 'lowPower') return move.power > 0 && move.power <= 60;
  return true;
}

export function damagePassiveMultiplier(pokemon: Combatant, move: Move, trigger: 'onAttack' | 'onDamage'): number {
  const absorbed = trigger === 'onAttack' && pokemon.absorbedTypes?.includes(move.type) ? 1.5 : 1;
  return matchingDamageEffects(pokemon, move, trigger).reduce((value, effect) => value * effect.multiplier, absorbed);
}

export function matchingDamageEffects(pokemon: Combatant, move: Move, trigger: 'onAttack' | 'onDamage'): Extract<PassiveEffect, { kind: 'damageMultiplier' }>[] {
  return passiveEffects(pokemon).filter((effect): effect is Extract<PassiveEffect, { kind: 'damageMultiplier' }> =>
    effect.kind === 'damageMultiplier' && effect.trigger === trigger
    && (!effect.type || effect.type === move.type) && (!effect.category || effect.category === move.category)
    && conditionMatches(effect, pokemon, move));
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
  const multiplier = passiveEffects(pokemon).reduce((value, effect) => effect.trigger === 'onStat'
    && effect.stat === stat && (!effect.condition || pokemon.status) ? value * effect.multiplier : value, 1);
  return Math.max(1, Math.floor(pokemon.stats[stat] * stageMultiplier(stage) * multiplier));
}

export function burnMultiplier(pokemon: Combatant, move: Move): number {
  const ignoreBurn = passiveEffects(pokemon).some(effect => effect.trigger === 'onStat' && effect.ignoreBurn);
  return pokemon.status === 'burn' && move.category === 'physical' && !ignoreBurn ? 0.5 : 1;
}

export function moveAccuracy(state: BattleState, user: Combatant, target: Combatant, move: Move): number {
  const accuracy = state.weather ? move.weatherAccuracy?.[state.weather.id] : undefined;
  const base = accuracy === undefined ? move.accuracy : accuracy;
  if (base === null) return 100;
  let result = base * stageMultiplier(user.stages.accuracy, true) / stageMultiplier(target.stages.evasion, true);
  for (const [pokemon, role] of [[user, 'self'], [target, 'attacker']] as const) {
    for (const effect of passiveEffects(pokemon)) {
      if (effect.trigger === 'onAccuracy' && effect.target === role && (!effect.weather || state.weather?.id === effect.weather)) result *= effect.multiplier;
    }
  }
  return Math.min(100, result);
}

export function alwaysHits(state: BattleState, move: Move): boolean {
  const weatherAccuracy = state.weather ? move.weatherAccuracy?.[state.weather.id] : undefined;
  return (weatherAccuracy === undefined ? move.accuracy : weatherAccuracy) === null;
}

/** Current grounding supports Flying and Levitate. Gravity and grounding items are absent. */
export function isGrounded(pokemon: Combatant): boolean {
  return !pokemon.types.includes('flying') && !passiveEffects(pokemon).some(effect =>
    effect.trigger === 'onDamage' && effect.kind === 'typeImmunity' && effect.type === 'ground');
}

export function defensiveStat(state: BattleState, pokemon: Combatant, stat: 'def' | 'spd', critIgnore: 'positive' | null = null): number {
  const value = getModifiedStat(pokemon, stat, critIgnore);
  const weatherBoost = stat === 'spd' && state.weather?.id === 'sand' && pokemon.types.includes('rock')
    || stat === 'def' && state.weather?.id === 'snow' && pokemon.types.includes('ice');
  return Math.max(1, Math.floor(value * (weatherBoost ? 1.5 : 1)));
}

export function criticalChance(attacker: Combatant, defender: Combatant, move: Move): number {
  if (passiveEffects(defender).some(effect => effect.trigger === 'onCritical' && effect.kind === 'criticalImmunity')) return 0;
  const stage = passiveEffects(attacker).reduce((value, effect) =>
    effect.trigger === 'onCritical' && effect.kind === 'criticalBoost' ? value + effect.stages : value, move.critStage ?? 0);
  return [100 / 24, 12.5, 50, 100][Math.min(3, Math.max(0, stage))];
}

export function secondaryChance(pokemon: Combatant, chance: number): number {
  return Math.min(100, passiveEffects(pokemon).reduce((value, effect) =>
    effect.trigger === 'onSecondary' ? value * effect.multiplier : value, chance));
}

export function weatherMultiplier(state: BattleState, move: Move): number {
  if (state.weather?.id === 'sun') return move.type === 'fire' ? 1.5 : move.type === 'water' ? 0.5 : 1;
  if (state.weather?.id === 'rain') return move.type === 'water' ? 1.5 : move.type === 'fire' ? 0.5 : 1;
  return 1;
}

export function fieldMultiplier(state: BattleState, attacker: Combatant, move: Move, defender?: Combatant): number {
  const fieldTypes: Record<string, string> = { electric: 'electric', grassy: 'grass', psychic: 'psychic' };
  let value = isGrounded(attacker) && fieldTypes[state.field?.id ?? ''] === move.type ? 1.3 : 1;
  if (defender && isGrounded(defender)) {
    if (state.field?.id === 'grassy' && move.id === 'earthquake') value *= 0.5;
    if (state.field?.id === 'misty' && move.type === 'dragon') value *= 0.5;
  }
  return value;
}

export function estimateDamage(state: BattleState, attacker: Combatant, defender: Combatant, move: Move, spread = false): number {
  if (move.category === 'status' || move.power <= 0 || isTypeImmune(defender, move)) return 0;
  const type = getTypeMultiplier(move.type, defender.types);
  if (type === 0) return 0;
  const offense = getModifiedStat(attacker, move.category === 'physical' ? 'atk' : 'spa');
  const defense = defensiveStat(state, defender, move.category === 'physical' ? 'def' : 'spd');
  let multiplier = attacker.types.includes(move.type) ? 1.5 : 1;
  for (const effect of passiveEffects(attacker)) {
    if (effect.trigger === 'onAttack' && effect.kind === 'stabMultiplier' && attacker.types.includes(move.type)) multiplier = effect.multiplier;
  }
  multiplier *= type * weatherMultiplier(state, move) * fieldMultiplier(state, attacker, move, defender);
  multiplier *= damagePassiveMultiplier(attacker, move, 'onAttack') * damagePassiveMultiplier(defender, move, 'onDamage');
  if (spread) multiplier *= 0.75;
  multiplier *= burnMultiplier(attacker, move);
  const base = Math.floor(Math.floor(((2 * LEVEL / 5 + 2) * move.power * offense) / defense) / 50) + 2;
  return Math.max(1, Math.floor(base * multiplier * 0.925));
}
