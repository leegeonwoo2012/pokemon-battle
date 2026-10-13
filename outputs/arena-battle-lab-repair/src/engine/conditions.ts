import { LEVEL, passiveEffects, stageMultiplier, isGrounded } from './calculations';
import { addLog, announcePassive, applyDamage, displayName } from './effects';
import { withEventContext } from './events';
import { chance, randomInt } from './rng';
import type { BattleState, Combatant, VolatileCondition } from './types';

export function applyVolatile(state: BattleState, pokemon: Combatant, condition: VolatileCondition): boolean {
  if (pokemon.fainted || condition === 'flinch' && pokemon.actedTurn === state.turn) return false;
  if (condition === 'confusion' && (pokemon.confusionTurns ?? 0) > 0) return false;
  const immunity = passiveEffects(pokemon).find(effect => effect.trigger === 'onVolatile' && effect.condition === condition);
  if (immunity || condition === 'confusion' && state.field?.id === 'misty' && isGrounded(pokemon)) {
    if (immunity) announcePassive(state, pokemon, immunity);
    addLog(state, `${displayName(pokemon)}에게 ${condition === 'confusion' ? '혼란' : '풀죽음'}이 적용되지 않았다.`, 'status',
      {kind:'blocked', targetUid:pokemon.uid, condition, conditionActive:false});
    return false;
  }
  if (condition === 'flinch') pokemon.flinched = true;
  else pokemon.confusionTurns = randomInt(state, 2, 5);
  addLog(state, `${displayName(pokemon)}${condition === 'confusion' ? '이(가) 혼란에 빠졌다!' : '이(가) 풀죽었다!'}`, 'status',
    {targetUid:pokemon.uid, condition, conditionActive:true});
  return true;
}

export function processFlinch(state: BattleState, pokemon: Combatant): boolean {
  if (!pokemon.flinched) return true;
  pokemon.flinched = false;
  addLog(state, `${displayName(pokemon)}은(는) 풀죽어서 움직일 수 없다!`, 'status',
    {kind:'blocked', targetUid:pokemon.uid, condition:'flinch', conditionActive:false});
  return false;
}

export function processConfusion(state: BattleState, pokemon: Combatant): boolean {
  if (!(pokemon.confusionTurns ?? 0)) return true;
  pokemon.confusionTurns = (pokemon.confusionTurns ?? 0) - 1;
  if (!pokemon.confusionTurns) {
    addLog(state, `${displayName(pokemon)}의 혼란이 풀렸다!`, 'status',
      {targetUid:pokemon.uid, condition:'confusion', conditionActive:false});
    return true;
  }
  addLog(state, `${displayName(pokemon)}은(는) 혼란에 빠져 있다!`, 'status',
    {targetUid:pokemon.uid, condition:'confusion', conditionActive:true});
  if (!chance(state, 33)) return true;
  // Confusion uses its own base stats and ranks; no ability, item, STAB, burn or critical modifiers.
  const attack = Math.max(1, Math.floor(pokemon.stats.atk * stageMultiplier(pokemon.stages.atk)));
  const defense = Math.max(1, Math.floor(pokemon.stats.def * stageMultiplier(pokemon.stages.def)));
  const base = Math.floor(Math.floor((2 * LEVEL / 5 + 2) * 40 * attack / defense) / 50) + 2;
  const damage = Math.max(1, Math.floor(base * randomInt(state, 85, 100) / 100));
  addLog(state, `${displayName(pokemon)}은(는) 영문도 모른 채 자신을 공격했다!`, 'status',
    {kind:'blocked', targetUid:pokemon.uid, condition:'confusion', conditionActive:true});
  withEventContext(state, {targetUid:pokemon.uid, moveId:undefined, category:undefined, type:undefined}, () =>
    applyDamage(state, pokemon, damage, '혼란'));
  return false;
}
