import { abilities, moves } from '../data';
import { estimateDamage, getTypeMultiplier, isGrounded, moveAccuracy, weatherBallMove } from './calculations';
import { getPokemonAt } from './effects';
import { usableMoves } from './choices';
import { activateGimmick, gimmickReason, previewMove } from './gimmicks';
import type { Gimmick } from './types';
import type { BattleAction, BattleState, Combatant, Move, Side, TargetRef } from './types';

function targetScore(state: BattleState, user: Combatant, target: Combatant, move: Move): number {
  const ally=state.sides.cpu.team.includes(target);
  if(move.id==='pollenpuff'&&ally)return target.hp<target.maxHp?Math.min(target.maxHp-target.hp,Math.floor(target.maxHp/2))+12:-30;
  if (move.category !== 'status') {
    const damage = estimateDamage(state, user, target, move, move.target === 'allEnemies');
    if(ally)return -damage*2;
    const accuracy = moveAccuracy(state, user, target, move) / 100;
    const knockout = damage >= target.hp ? 18 : 0;
    const predictionRisk=move.id==='suckerpunch'&&target.lastMove&&moves[target.lastMove]?.category==='status'?-24:0;
    return damage * accuracy + knockout + predictionRisk;
  }
  let score = 3;
  for (const effect of move.effects ?? []) {
    if (effect.kind === 'status') score += !target.status ? (ally?-30:18) * ((effect.chance ?? 100) / 100) : 0;
    if (effect.kind === 'volatile' && effect.condition === 'confusion') score += (target.confusionTurns ?? 0) <= 0 ? 16 : 0;
    if (effect.kind === 'stat') score += effect.stages * (effect.target === 'self'||ally ? 8 : -7);
    if (effect.kind === 'heal') {
      const recipient=effect.target==='target'?target:user;
      score += (recipient===user||ally)&&recipient.maxHp-recipient.hp>recipient.maxHp/3?25:0;
    }
    if(effect.kind==='helpingHand')score+=ally&&target.actedTurn!==state.turn&&target.set.moves.some(id=>moves[id]?.category!=='status')?30:-30;
    if(effect.kind==='dragonCheer')score+=ally&&!target.dragonCheerCritStages?24:-30;
    if(effect.kind==='acupressure')score+=ally&&Object.values(target.stages).some(stage=>stage<6)?20:-30;
    if(effect.kind==='teamCure')score+=state.sides.cpu.team.filter(mon=>mon.status).length*18;
    if(effect.kind==='entrainment')score+=ally&&target.set.abilityId!==user.set.abilityId?8:-12;
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

function damagingPressure(state: BattleState, attacker: Combatant, defender: Combatant): number {
  return usableMoves(attacker,false,state.turn).reduce((best, move) => {
    if (move.category === 'status' || !(move.power || move.ohko || move.fixedDamage || move.fixedHpFraction !== undefined)) return best;
    return Math.max(best, estimateDamage(state, attacker, defender, move) * moveAccuracy(state, attacker, defender, move) / 100);
  }, 0);
}

function totalPressure(values: number[]): number {
  const ordered = [...values].sort((a, b) => b - a);
  return (ordered[0] ?? 0) + (ordered[1] ?? 0) * 0.65 + ordered.slice(2).reduce((sum, value) => sum + value * 0.15, 0);
}

function entryHazardCost(state: BattleState, side: Side, candidate: Combatant): number {
  const hazards = state.sides[side].hazards;
  if (!hazards || candidate.set.abilityId === 'magicguard') return 0;
  const hp = candidate.original?.maxHp ?? candidate.maxHp;
  let damage = 0;
  if (hazards.stealthrock) damage += Math.max(1, Math.floor(hp / 8 * getTypeMultiplier('rock', candidate.types)));
  if (hazards.steelsurge) damage += Math.max(1, Math.floor(hp / 8 * getTypeMultiplier('steel', candidate.types)));
  if (isGrounded(candidate, state)) {
    if (hazards.spikes) damage += Math.max(1, Math.floor(hp / [8, 6, 4][hazards.spikes - 1]));
    if (hazards.toxicspikes && !candidate.types.includes('poison') && !candidate.types.includes('steel')) damage += hp * 0.12;
  }
  if (damage >= candidate.hp) return Number.POSITIVE_INFINITY;
  const stickyWebPenalty = hazards.stickyweb && isGrounded(candidate, state) ? candidate.stats.spe * 0.04 : 0;
  return damage * 1.25 + stickyWebPenalty;
}

function matchupPressure(state: BattleState, candidate: Combatant, foes: Combatant[]) {
  const offense = totalPressure(foes.map(foe => damagingPressure(state, candidate, foe)));
  const incoming = totalPressure(foes.map(foe => damagingPressure(state, foe, candidate)));
  const entryPenalty = entryHazardCost(state, 'cpu', candidate);
  const intimidation = abilities[candidate.set.abilityId]?.effects.some(effect => effect.trigger === 'onEnter'
    && effect.kind === 'stat' && effect.target === 'foes' && effect.stat === 'atk' && effect.stages < 0)
    ? foes.filter(foe => usableMoves(foe,false,state.turn).some(move => move.category === 'physical')).length * 8 : 0;
  return { offense, incoming, score: offense - incoming * 0.68 + candidate.hp / candidate.maxHp * 22 - entryPenalty + intimidation };
}

function benchChoice(state: BattleState, side: Side, slot: number, foes: Combatant[], reserved: ReadonlySet<number>): number | null {
  const current = getPokemonAt(state, { side, slot });
  if (!current || !foes.length) return null;
  const own = state.sides[side];
  const candidates = own.team.flatMap((pokemon, index) => {
    if (pokemon.fainted || own.active.includes(index) || reserved.has(index)) return [];
    const pressure = matchupPressure(state, pokemon, foes);
    return Number.isFinite(pressure.score) ? [{ index, ...pressure }] : [];
  }).sort((a, b) => b.score - a.score);
  if (!candidates.length || state.turn < 2 || state.turn - (state.switchTurns?.[side]?.[slot] ?? -100) < 3) return null;
  const currentPressure = matchupPressure(state, current, foes);
  const best = candidates[0];
  const hpRatio = current.hp / current.maxHp;
  if (hpRatio < 0.28 && best.offense > 0 && best.score > currentPressure.score - 18) return best.index;
  if (currentPressure.incoming >= current.hp * 0.72 && best.score > currentPressure.score + 14 && hpRatio > 0.3) return best.index;
  if (best.offense > currentPressure.offense * 1.35 && best.incoming < currentPressure.incoming * 0.78
    && best.score > currentPressure.score + 30 && hpRatio > 0.42) return best.index;
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
    const foes = foeRefs.map(ref => getPokemonAt(state, ref)).filter((p): p is Combatant => !!p);
    if (foes.length) {
      const switchTo = benchChoice(state, side, slot, foes, reservedSwitches);
      if (switchTo !== null) {
        reservedSwitches.add(switchTo);
        return [{ kind: 'switch' as const, slot, to: switchTo }];
      }
    }
    const candidates = usableMoves(user,false,state.turn).map(move=>weatherBallMove(state,user,previewMove(user,move)));
    if (!candidates.length) return [{ kind: 'move' as const, slot, moveId: 'struggle' }];
    let best: { move: Move; target?: TargetRef; score: number } | null = null;
    for (const move of candidates) {
      const friendlyRefs=state.sides.cpu.active.flatMap((_, allySlot) => {
        const ally=getPokemonAt(state,{side,slot:allySlot});
        return ally&&!ally.fainted?[{side,slot:allySlot}]:[];
      });
      const targets = move.target === 'allAllies' ? friendlyRefs : move.target === 'self' ? [{ side, slot }]
        : move.target === 'ally' ? friendlyRefs.filter(ref=>ref.slot!==slot)
        : move.target === 'allyOrSelf' ? friendlyRefs
        : move.target === 'any' ? [...foeRefs,...friendlyRefs.filter(ref=>ref.slot!==slot)] : foeRefs;
      if (!targets.length) continue;
      if (move.target === 'allEnemies' || move.target === 'allOthers' || move.target === 'allAllies') {
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
    for(const kind of ['mega','tera','z','dynamax'] as const) for(const base of usableMoves(user,false,state.turn)) {
      if(gimmickReason(state,'cpu',user,kind,base.id)) continue;
      const simulated=structuredClone(state);
      activateGimmick(simulated,'cpu',action.slot,kind,base.id);
      const transformed=getPokemonAt(simulated,{side:'cpu',slot:action.slot})!;
      const enhanced=previewMove(transformed,base,kind);
      for(const targetRef of foeRefs) {
        const foe=getPokemonAt(state,targetRef)!;
        const before=targetScore(state,user,foe,moves[action.moveId]??base);
        const after=targetScore(simulated,transformed,foe,enhanced);
        const threat=(p:Combatant)=>Math.max(0,...usableMoves(foe,false,state.turn).map(m=>estimateDamage(simulated,foe,p,m)));
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
