import { moves } from '../data';
import { estimateDamage, moveAccuracy } from './calculations';
import { getPokemonAt } from './effects';
import { usableMoves } from './choices';
import { activateGimmick, gimmickReason, previewMove } from './gimmicks';
import type { Gimmick } from './types';
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
    const own=state.sides.cpu,foe=state.sides.player;
    if(effect.kind==='hazard'&&foe.team.some((mon,index)=>!mon.fainted&&!foe.active.includes(index))) {
      const max=effect.hazard==='spikes'?3:effect.hazard==='toxicspikes'?2:1;
      if((foe.hazards?.[effect.hazard]??0)<max)score+=20;
    }
    if(effect.kind==='screen'&&!own.screens?.[effect.screen]&&(effect.screen!=='auroraveil'||state.weather?.id==='snow'))score+=22;
    if(effect.kind==='tailwind'&&!own.tailwind)score+=user.stats.spe<target.stats.spe?30:15;
    if(effect.kind==='trickroom')score+=!state.trickRoom&&user.stats.spe<target.stats.spe?30:-15;
    if(effect.kind==='taunt'&&!target.tauntTurns&&target.set.moves.some(id=>moves[id]?.category==='status'))score+=22;
    if(effect.kind==='encore'&&target.lastMove&&moves[target.lastMove]?.category==='status'&&!target.encore)score+=28;
    if(effect.kind==='clearHazards'&&Object.values(own.hazards??{}).some(Boolean))score+=24;
  }
  return score;
}

function benchChoice(state: BattleState, side: Side, slot: number, foe: Combatant, reserved: ReadonlySet<number>): number | null {
  const current = getPokemonAt(state, { side, slot });
  if (!current) return null;
  const own = state.sides[side];
  const candidates = own.team.flatMap((pokemon, index) => {
    if (pokemon.fainted || own.active.includes(index) || reserved.has(index)) return [];
    const offense = usableMoves(pokemon).reduce((best, move) => {
      return Math.max(best,estimateDamage(state,pokemon,foe,move));
    }, 0);
    const threat = foe.set.moves.reduce((best, id) => {
      const move = moves[id];
      return move&&(move.power||move.ohko||move.fixedDamage) ? Math.max(best, estimateDamage(state,foe,pokemon,move)) : best;
    }, 0);
    return [{ index, score: offense - threat * 0.6 + pokemon.hp / pokemon.maxHp * 20 }];
  }).sort((a, b) => b.score - a.score);
  if (!candidates.length || state.turn < 2 || state.turn - (state.switchTurns?.[side]?.[slot] ?? -100) < 3) return null;
  const currentThreat = foe.set.moves.reduce((best, id) => {
    const move = moves[id];
      return move&&(move.power||move.ohko||move.fixedDamage) ? Math.max(best, estimateDamage(state,foe,current,move)) : best;
  }, 0);
  if (current.hp / current.maxHp < 0.27 && candidates[0].score > -30) return candidates[0].index;
  const currentOffense = usableMoves(current).reduce((best, move) => {
    return Math.max(best, estimateDamage(state,current,foe,move));
  }, 0);
  const currentScore = currentOffense - currentThreat * 0.6 + current.hp / current.maxHp * 20;
  if (currentThreat > current.hp*.75 && candidates[0].score > currentScore + 35 && current.hp / current.maxHp > 0.6) return candidates[0].index;
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
  const actions=state.sides.cpu.active.flatMap<BattleAction>((_, slot) => {
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
    const candidates = usableMoves(user).map(move=>previewMove(user,move));
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
    const id=best?.move.id ?? candidates[0].id;
    const baseId=user.set.moves.find(base=>previewMove(user,moves[base]).id===id)??id;
    return [{ kind: 'move' as const, slot, moveId: baseId, target: best?.target }];
  });
  if(state.sides.cpu.gimmick?.used) return actions;
  let best:{gain:number;index:number;kind:Gimmick;moveId:string;target:TargetRef}|undefined;
  for(const [index,action] of actions.entries()) {
    if(action.kind!=='move') continue;
    const user=getPokemonAt(state,{side:'cpu',slot:action.slot})!;
    for(const kind of ['mega','tera','z','dynamax'] as const) for(const base of usableMoves(user)) {
      if(gimmickReason(state,'cpu',user,kind,base.id)) continue;
      const simulated=structuredClone(state);
      activateGimmick(simulated,'cpu',action.slot,kind,base.id);
      const transformed=getPokemonAt(simulated,{side:'cpu',slot:action.slot})!;
      const enhanced=previewMove(transformed,base,kind);
      for(const targetRef of foeRefs) {
        const foe=getPokemonAt(state,targetRef)!;
        const before=targetScore(state,user,foe,moves[action.moveId]??base);
        const after=targetScore(simulated,transformed,foe,enhanced);
        const threat=(p:Combatant)=>Math.max(0,...usableMoves(foe).map(m=>estimateDamage(simulated,foe,p,m)));
        const defenseGain=threat(user)-threat(transformed);
        const remaining=state.sides.cpu.team.filter(p=>!p.fainted).length;
        const hpRatio=user.hp/user.maxHp;
        const sustained=kind==='mega'?12:kind==='dynamax'?Math.min(threat(user),user.hp)*.35*Math.min(1,hpRatio*2):0;
        const ko=enhanced.power&&estimateDamage(simulated,transformed,foe,enhanced)>=foe.hp?20:0;
        const cost=(remaining>2?18:6)+(hpRatio<.2&&kind!=='z'?20:0);
        const gain=after-before+defenseGain*.45+sustained+ko-cost;
        if(gain>0&&(!best||gain>best.gain)) best={gain,index,kind,moveId:base.id,target:targetRef};
      }
    }
  }
  if(best) { const action=actions[best.index]; if(action.kind==='move') actions[best.index]={...action,moveId:best.moveId,target:best.target,gimmick:best.kind}; }
  return actions;
}
