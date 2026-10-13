import type { BattleState } from './types';

/** A small seeded PRNG. All battle randomness passes through this function. */
export function random(state: BattleState): number {
  let x = state.rngState >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rngState = x >>> 0;
  return (state.rngState >>> 0) / 0x100000000;
}

export function chance(state: BattleState, percent: number): boolean {
  return random(state) * 100 < percent;
}

export function randomInt(state: BattleState, min: number, max: number): number {
  return min + Math.floor(random(state) * (max - min + 1));
}
