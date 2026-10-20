import { items, moves } from '../data';
import { passiveEffects } from './calculations';
import type { Combatant, Move } from './types';

/** Only an active held Choice item's effect restricts the remembered move. */
export function lockedMove(pokemon: Combatant): string | undefined {
  if(pokemon.transformation?.kind==='dynamax') return undefined;
  const heldEffects = items[pokemon.set.itemId]?.effects ?? [];
  const hasChoiceEffect = passiveEffects(pokemon).some(effect =>
    heldEffects.includes(effect) && effect.trigger === 'onChoice' && effect.kind === 'choiceLock');
  return hasChoiceEffect ? pokemon.choiceLock : undefined;
}

export function firstTurnMoveReady(pokemon:Combatant,move:Move,currentTurn?:number):boolean {
  if(!move.requiresFreshEntry||currentTurn===undefined)return true;
  const availableTurn=pokemon.firstTurnMoveTurn??(pokemon.enteredTurn===undefined?1:pokemon.enteredTurn+1);
  return availableTurn===currentTurn;
}

export function usableMoves(pokemon: Combatant,zMove=false,currentTurn?:number): Move[] {
  if (pokemon.fainted) return [];
  const forced=pokemon.charging?.moveId??pokemon.rampage?.moveId;
  if(forced)return moves[forced]?[moves[forced]]:[];
  const lock = lockedMove(pokemon);
  return pokemon.set.moves.flatMap(id => {
    const move = moves[id];
    const maxed=pokemon.transformation?.kind==='dynamax';
    // Extreme Evoboost is the Z-powered form of Last Resort. The ordinary
    // move keeps Last Resort's all-other-moves requirement, but its Z move can
    // be selected immediately (as in the games).
    const lastResortReady=id!=='lastresort'||zMove||pokemon.set.moves.length>=2&&pokemon.set.moves.every(known=>known==='lastresort'||pokemon.usedMoveIds.includes(known));
    return move && id !== 'struggle' && lastResortReady && firstTurnMoveReady(pokemon,move,currentTurn) && (!move.requiresForm||pokemon.transformation?.formId===move.requiresForm) && (pokemon.pp[id] ?? 0) > 0 && (!lock || lock === id)
      && (maxed || zMove || id !== 'gigatonhammer' || pokemon.lastMove !== id)
      && (maxed || zMove || move.category !== 'status' || !passiveEffects(pokemon).some(effect=>effect.trigger==='onMoveChoice'&&effect.kind==='blockStatus'))
      && (maxed||zMove||!pokemon.tauntTurns||move.category!=='status') && (maxed||zMove||!pokemon.encore||pokemon.encore.moveId===id) ? [move] : [];
  });
}

export function isMoveUsable(pokemon: Combatant, moveId: string,zMove=false,currentTurn?:number): boolean {
  if (pokemon.fainted) return false;
  const available = usableMoves(pokemon,zMove,currentTurn);
  return moveId === 'struggle' ? available.length === 0 : available.some(move => move.id === moveId);
}

/** Shared explanation for disabled UI actions; the engine uses the same rules. */
export function moveUnavailableReason(pokemon: Combatant, moveId: string,zMove=false,currentTurn?:number): string | undefined {
  if (pokemon.fainted) return '기절한 포켓몬은 행동할 수 없습니다.';
  if (moveId === 'struggle') return usableMoves(pokemon,false,currentTurn).length ? '사용 가능한 기술이 남아 있습니다.' : undefined;
  if (!pokemon.set.moves.includes(moveId) || !moves[moveId]) return '배우지 않은 기술입니다.';
  if(!firstTurnMoveReady(pokemon,moves[moveId],currentTurn))return `${moves[moveId].name}은(는) 배틀에 나온 뒤 첫 행동 턴에만 사용할 수 있습니다.`;
  if(moveId==='lastresort'&&!zMove&&(pokemon.set.moves.length<2||pokemon.set.moves.some(known=>known!=='lastresort'&&!pokemon.usedMoveIds.includes(known))))return `${moves[moveId].name}은(는) 다른 기술을 모두 한 번 이상 사용한 뒤 사용할 수 있습니다.`;
  if(moves[moveId].requiresForm&&pokemon.transformation?.formId!==moves[moveId].requiresForm)return `${moves[moveId].name}은(는) ${moves[moveId].requiresForm} 폼에서만 사용할 수 있습니다.`;
  const forced=pokemon.charging?.moveId??pokemon.rampage?.moveId;
  if(forced&&forced!==moveId)return `${moves[forced]?.name??forced}을(를) 계속 사용해야 합니다.`;
  if (!forced&&(pokemon.pp[moveId] ?? 0) <= 0) return 'PP가 부족합니다.';
  if(moveId==='gigatonhammer'&&pokemon.lastMove===moveId&&pokemon.transformation?.kind!=='dynamax'&&!zMove)return '거대해머는 연속으로 사용할 수 없습니다.';
  if(moves[moveId].category==='status'&&pokemon.transformation?.kind!=='dynamax'&&!zMove&&passiveEffects(pokemon).some(effect=>effect.trigger==='onMoveChoice'&&effect.kind==='blockStatus'))return '돌격조끼를 지닌 포켓몬은 변화 기술을 사용할 수 없습니다.';
  if(pokemon.transformation?.kind!=='dynamax'&&!zMove) {
    if(pokemon.tauntTurns&&moves[moveId].category==='status')return `도발 · ${pokemon.tauntTurns}턴: 변화 기술을 사용할 수 없습니다.`;
    if(pokemon.encore&&pokemon.encore.moveId!==moveId)return `앵콜 · ${pokemon.encore.turns}턴: ${moves[pokemon.encore.moveId]?.name}만 사용할 수 있습니다.`;
  }
  const lock = lockedMove(pokemon);
  if (lock && lock !== moveId) return `${items[pokemon.set.itemId].name}: 교체 전까지 ${moves[lock]?.name ?? lock}만 사용할 수 있습니다.`;
  return undefined;
}
