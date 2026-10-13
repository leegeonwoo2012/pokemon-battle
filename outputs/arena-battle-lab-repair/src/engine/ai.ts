import { moves } from '../data';
import { estimateDamage, getTypeMultiplier, moveAccuracy } from './calculations';
import { getPokemonAt } from './effects';
import { usableMoves } from './choices';
import type { BattleAction, BattleState, Combatant, Move, Side, TargetRef } from './types';

function targetScore(state: BattleState, user: Combatant, target: Combatant, move: Move): number {
  if (move.category !== 'status') {
    const damage = estimateDamage(state, user, target, move, move.target === 'allEnemies');
    const accuracy = moveAccuracy(state, user, target, move) / 100;
    const knockout = damage >= target.hp ? 18 : 0;
    return damage * accuracy + knockout;
  }
  let score = 3;
  for (const effect of move.effects ?? []) {
    if (effect.kind === 'status') score += !target.status ? 18 * ((effect.chance ?? 100) / 100) : 0;
    if (effect.kind === 'volatile' && effect.condition === 'confusion') score += (target.confusionTurns ?? 0) <= 0 ? 16 : 0;
    if (effect.kind === 'stat') score += effect.stages * (effect.target === 'self' ? 8 : -7);
    if (effect.kind === 'heal') score += user.maxHp - user.hp > user.maxHp / 3 ? 25 : 0;
    if (effect.kind === 'weather' && state.weather?.id !== effect.weather) score += 10;
    if (effect.kind === 'field' && state.field?.id !== effect.field) score += 10;
    if (effect.kind === 'protect' && user.hp < user.maxHp / 3) score += 12;
  }
  return score;
}

function benchChoice(state: BattleState, side: Side, slot: number, foe: Combatant, reserved: ReadonlySet<number>): number | null {
  const current = getPokemonAt(state, { side, slot });
  if (!current) return null;
  const own = state.sides[side];
  const candidates = own.team.flatMap((pokemon, index) => {
    if (pokemon.fainted || own.active.includes(index) || reserved.has(index)) return [];
    const offense = pokemon.set.moves.reduce((best, id) => {
      const move = moves[id];
      return move?.power ? Math.max(best, move.power * getTypeMultiplier(move.type, foe.types)) : best;
    }, 0);
    const threat = foe.set.moves.reduce((best, id) => {
      const move = moves[id];
      return move?.power ? Math.max(best, move.power * getTypeMultiplier(move.type, pokemon.types)) : best;
    }, 0);
    return [{ index, score: offense - threat * 0.6 + pokemon.hp / pokemon.maxHp * 20 }];
  }).sort((a, b) => b.score - a.score);
  if (!candidates.length || state.turn < 2 || state.turn - (state.switchTurns?.[side]?.[slot] ?? -100) < 3) return null;
  const currentThreat = foe.set.moves.reduce((best, id) => {
    const move = moves[id];
    return move?.power ? Math.max(best, move.power * getTypeMultiplier(move.type, current.types)) : best;
  }, 0);
  if (current.hp / current.maxHp < 0.27 && candidates[0].score > -30) return candidates[0].index;
  const currentOffense = usableMoves(current).reduce((best, move) => {
    return move?.power ? Math.max(best, move.power * getTypeMultiplier(move.type, foe.types)) : best;
  }, 0);
  const currentScore = currentOffense - currentThreat * 0.6 + current.hp / current.maxHp * 20;
  if (currentThreat > 150 && candidates[0].score > currentScore + 70 && current.hp / current.maxHp > 0.6) return candidates[0].index;
  return null;
}

/** Deterministic baseline AI. It scores expected damage, status utility, and situational switches. */
export function chooseCpuActions(state: BattleState): BattleAction[] {
  const side: Side = 'cpu';
  const reservedSwitches = new Set<number>();
  const foeRefs: TargetRef[] = state.sides.player.active.flatMap((_, slot) => {
    const pokemon = getPokemonAt(state, { side: 'player', slot });
    return pokemon && !pokemon.fainted ? [{ side: 'player' as const, slot }] : [];
  });
  return state.sides.cpu.active.flatMap<BattleAction>((_, slot) => {
    const user = getPokemonAt(state, { side, slot });
    if (!user || user.fainted) return [];
    const firstFoe = foeRefs.map(ref => getPokemonAt(state, ref)).find((p): p is Combatant => !!p);
    if (firstFoe) {
      const switchTo = benchChoice(state, side, slot, firstFoe, reservedSwitches);
      if (switchTo !== null) {
        reservedSwitches.add(switchTo);
        return [{ kind: 'switch' as const, slot, to: switchTo }];
      }
    }
    const candidates = usableMoves(user);
    if (!candidates.length) return [{ kind: 'move' as const, slot, moveId: 'struggle' }];
    let best: { move: Move; target?: TargetRef; score: number } | null = null;
    for (const move of candidates) {
      const targets = move.target === 'self' ? [{ side, slot }] : move.target === 'ally'
        ? state.sides.cpu.active.flatMap((_, allySlot) => allySlot === slot ? [] : [{ side, slot: allySlot }])
        : foeRefs;
      if (!targets.length) continue;
      if (move.target === 'allEnemies' || move.target === 'allOthers') {
        let score = targets.reduce((sum, ref) => {
          const target = getPokemonAt(state, ref);
          return sum + (target ? targetScore(state, user, target, move) : 0);
        }, 0);
        if (move.target === 'allOthers') {
          for (let allySlot = 0; allySlot < state.sides.cpu.active.length; allySlot++) {
            if (allySlot === slot) continue;
            const ally = getPokemonAt(state, { side: 'cpu', slot: allySlot });
            if (ally && !ally.fainted) score -= estimateDamage(state, user, ally, move, true) * 1.25;
          }
        }
        if (!best || score > best.score) best = { move, score };
      } else {
        for (const ref of targets) {
          const target = getPokemonAt(state, ref);
          if (!target) continue;
          const score = targetScore(state, user, target, move);
          if (!best || score > best.score) best = { move, target: ref, score };
        }
      }
    }
    return [{ kind: 'move' as const, slot, moveId: best?.move.id ?? candidates[0].id, target: best?.target }];
  });
}
