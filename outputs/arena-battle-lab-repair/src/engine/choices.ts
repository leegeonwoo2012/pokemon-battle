import { items, moves } from '../data';
import { passiveEffects } from './calculations';
import type { Combatant, Move } from './types';

/** Only an active held Choice item's effect restricts the remembered move. */
export function lockedMove(pokemon: Combatant): string | undefined {
  const heldEffects = items[pokemon.set.itemId]?.effects ?? [];
  const hasChoiceEffect = passiveEffects(pokemon).some(effect =>
    heldEffects.includes(effect) && effect.trigger === 'onChoice' && effect.kind === 'choiceLock');
  return hasChoiceEffect ? pokemon.choiceLock : undefined;
}

export function usableMoves(pokemon: Combatant): Move[] {
  if (pokemon.fainted) return [];
  const lock = lockedMove(pokemon);
  return pokemon.set.moves.flatMap(id => {
    const move = moves[id];
    return move && id !== 'struggle' && (pokemon.pp[id] ?? 0) > 0 && (!lock || lock === id) ? [move] : [];
  });
}

export function isMoveUsable(pokemon: Combatant, moveId: string): boolean {
  if (pokemon.fainted) return false;
  const available = usableMoves(pokemon);
  return moveId === 'struggle' ? available.length === 0 : available.some(move => move.id === moveId);
}

/** Shared explanation for disabled UI actions; the engine uses the same rules. */
export function moveUnavailableReason(pokemon: Combatant, moveId: string): string | undefined {
  if (pokemon.fainted) return '기절한 포켓몬은 행동할 수 없습니다.';
  if (moveId === 'struggle') return usableMoves(pokemon).length ? '사용 가능한 기술이 남아 있습니다.' : undefined;
  if (!pokemon.set.moves.includes(moveId) || !moves[moveId]) return '배우지 않은 기술입니다.';
  if ((pokemon.pp[moveId] ?? 0) <= 0) return 'PP가 부족합니다.';
  const lock = lockedMove(pokemon);
  if (lock && lock !== moveId) return `${items[pokemon.set.itemId].name}: 교체 전까지 ${moves[lock]?.name ?? lock}만 사용할 수 있습니다.`;
  return undefined;
}
