import { getTypeMultiplier, isGrounded,passiveEffects,effectiveWeather } from './calculations';
import { activePokemon, addLog, applyDamage, applyStatChange, applyStatus, displayName,announcePassive } from './effects';
import { withEventContext } from './events';
import { moves } from '../data';
import type { BattleState, Combatant, Hazard, MoveEffect, ScreenCondition, Side } from './types';

export const hazardNames: Record<Hazard, string> = { stealthrock:'스텔스록', spikes:'압정뿌리기', toxicspikes:'독압정', stickyweb:'끈적끈적네트', steelsurge:'거다이강철진' };
export const screenNames: Record<ScreenCondition, string> = { reflect:'리플렉터', lightscreen:'빛의장막', auroraveil:'오로라베일' };
export function sideOf(state: BattleState, pokemon: Combatant): Side {
  return state.sides.player.team.includes(pokemon) ? 'player' : 'cpu';
}

/** Triggers only on actual entry, not Mega ability activation. */
export function applyHazards(state: BattleState, side: Side, pokemon: Combatant): void {
  const hazards = state.sides[side].hazards;
  if (!hazards || pokemon.fainted) return;
  const immunity=passiveEffects(pokemon).find(effect=>effect.trigger==='onEntryHazard');
  if(immunity){if(Object.values(hazards).some(Boolean))announcePassive(state,pokemon,immunity);return;}
  withEventContext(state, { actorUid:pokemon.uid, targetUid:pokemon.uid, moveId:undefined, category:undefined }, () => {
    const hp = pokemon.original?.maxHp ?? pokemon.maxHp;
    if (hazards.stealthrock&&pokemon.set.abilityId!=='magicguard') applyDamage(state,pokemon,Math.max(1,Math.floor(hp/8*getTypeMultiplier('rock',pokemon.types))),hazardNames.stealthrock);
    if (pokemon.fainted) return;
    if (hazards.steelsurge&&pokemon.set.abilityId!=='magicguard') applyDamage(state,pokemon,Math.max(1,Math.floor(hp/8*getTypeMultiplier('steel',pokemon.types))),hazardNames.steelsurge);
    if (pokemon.fainted || !isGrounded(pokemon,state)) return;
    if (hazards.spikes&&pokemon.set.abilityId!=='magicguard') applyDamage(state,pokemon,Math.max(1,Math.floor(hp/[8,6,4][hazards.spikes-1])),hazardNames.spikes);
    if (pokemon.fainted) return;
    if (hazards.toxicspikes) {
      if (pokemon.types.includes('poison')) { delete hazards.toxicspikes; addLog(state,`${displayName(pokemon)}이 독압정을 흡수했다!`,'status'); }
      else if (applyStatus(state,pokemon,'poison',hazardNames.toxicspikes) && hazards.toxicspikes === 2) {
        pokemon.toxicCounter=1; addLog(state,`${displayName(pokemon)}이 맹독에 걸렸다!`,'status',{targetUid:pokemon.uid});
      }
    }
    if (hazards.stickyweb) applyStatChange(state,pokemon,'spe',-1,activePokemon(state,side==='player'?'cpu':'player')[0]??pokemon,'stickyweb');
  });
}

function consumeMentalHerb(state:BattleState,target:Combatant):void{
  if(target.set.itemId!=='mentalherb'||target.itemConsumed)return;
  target.tauntTurns=0;target.encore=undefined;target.itemConsumed=true;target.consumedItemTurn=state.turn;
  addLog(state,`${displayName(target)}의 멘탈허브가 행동 제한을 풀었다!`,'status',{kind:'item',actorUid:target.uid,sourceId:'mentalherb',sourceKind:'item'});
}

export function applyTacticalEffect(state: BattleState, effect: MoveEffect, user: Combatant, target: Combatant): boolean {
  const side=sideOf(state,user),own=state.sides[side],foe=state.sides[side==='player'?'cpu':'player'];
  const ownLabel=side==='player'?'아군':'상대',foeLabel=side==='player'?'상대':'아군';
  const fail=(message:string)=>addLog(state,message,'status',{kind:'blocked',targetUid:target.uid});
  if(effect.kind==='taunt'||effect.kind==='encore') {
    const targetSide=sideOf(state,target);
    for(const ally of activePokemon(state,targetSide)) {
      const immunity=passiveEffects(ally).find(passive=>passive.trigger==='onTactical'&&passive.condition===effect.kind&&(passive.target==='allies'||ally===target));
      if(immunity){announcePassive(state,ally,immunity);fail('특성이 변화 기술의 제한을 막았다!');return true;}
    }
  }
  switch(effect.kind) {
    case 'hazard': {
      const hazards=foe.hazards??= {},max=effect.hazard==='spikes'?3:effect.hazard==='toxicspikes'?2:1;
      if ((hazards[effect.hazard]??0)>=max) fail('이미 충분히 설치되어 있다!');
      else { hazards[effect.hazard]=(hazards[effect.hazard]??0)+1;addLog(state,`${foeLabel} 진영에 ${hazardNames[effect.hazard]} 설치!`,'status'); }
      return true;
    }
    case 'screen': {
      const screens=own.screens??={};
      if(screens[effect.screen]) fail(`${screenNames[effect.screen]}은 이미 펼쳐져 있다!`);
      else if(effect.screen==='auroraveil'&&effectiveWeather(state,user)!=='snow') fail('오로라베일은 눈이 내릴 때만 사용할 수 있다!');
      else { const duration=passiveEffects(user).find(passive=>passive.trigger==='onScreen');screens[effect.screen]=duration?.kind==='screenDuration'?duration.turns:5;if(duration)announcePassive(state,user,duration);addLog(state,`${ownLabel} 진영에 ${screenNames[effect.screen]} 전개!`,'status'); }
      return true;
    }
    case 'tailwind':
      if(own.tailwind)fail('순풍은 이미 불고 있다!');else {own.tailwind=4;addLog(state,`${ownLabel} 진영에 순풍이 불기 시작했다!`,'status');}return true;
    case 'trickroom':
      state.trickRoom=state.trickRoom?0:5;addLog(state,state.trickRoom?'트릭룸! 느린 포켓몬부터 움직인다.':'트릭룸이 해제되었다!','status');
      if(state.trickRoom)for(const active of [...activePokemon(state,'player'),...activePokemon(state,'cpu')])
        if(active.set.itemId==='roomservice'&&!active.itemConsumed){
          applyStatChange(state,active,'spe',-1,active,'roomservice');active.itemConsumed=true;active.consumedItemTurn=state.turn;
          addLog(state,`${displayName(active)}의 룸서비스가 발동했다!`,'status',{kind:'item',actorUid:active.uid,sourceId:'roomservice',sourceKind:'item'});
        }
      return true;
    case 'gravity':
      if(state.gravity)fail('이미 중력이 강해져 있다!');else{state.gravity=5;addLog(state,'중력이 강해졌다! 모든 포켓몬이 지면에 내려왔다.','status',{kind:'field'});}return true;
    case 'taunt':
      if(target.tauntTurns)fail('이미 도발 상태다!');else {target.tauntTurns=target.actedTurn===state.turn?4:3;addLog(state,`${displayName(target)}이 도발에 넘어갔다!`,'status',{targetUid:target.uid});consumeMentalHerb(state,target);}return true;
    case 'encore':
      if(target.encore||!target.lastMove||['struggle','encore'].includes(target.lastMove)||!moves[target.lastMove]||(target.pp[target.lastMove]??0)<=0)fail('앵콜이 실패했다!');
      else {target.encore={moveId:target.lastMove,turns:3};addLog(state,`${displayName(target)}에게 앵콜! ${moves[target.lastMove].name}을 반복한다.`,'status',{targetUid:target.uid});consumeMentalHerb(state,target);}return true;
    case 'clearHazards': {
      own.hazards={};if(effect.bothSides)foe.hazards={};if(effect.screens)foe.screens={};
      if(effect.bothSides)state.field=null;
      addLog(state,effect.bothSides?`양쪽 진영의 설치물과 ${foeLabel} 장막, 필드가 사라졌다!`:`${ownLabel} 진영의 설치물이 사라졌다!`,'status');return true;
    }
    default:return false;
  }
}

export function finishTactics(state: BattleState): void {
  if(state.trickRoom&&--state.trickRoom===0)addLog(state,'트릭룸이 끝났다!','status');
  if(state.gravity&&--state.gravity===0)addLog(state,'중력이 원래대로 돌아왔다!','status',{kind:'field'});
  for(const side of ['player','cpu'] as const) {
    const own=state.sides[side];
    if(own.tailwind&&--own.tailwind===0)addLog(state,`${side==='player'?'아군':'상대'} 진영의 순풍이 끝났다!`,'status');
    for(const id of Object.keys(own.screens??{}) as ScreenCondition[])if(--own.screens![id]!<=0){delete own.screens![id];addLog(state,`${side==='player'?'아군':'상대'} ${screenNames[id]} 종료!`,'status');}
    for(const mon of activePokemon(state,side)) {
      if(mon.tauntTurns&&--mon.tauntTurns===0)addLog(state,`${displayName(mon)}의 도발이 풀렸다!`,'status',{targetUid:mon.uid});
      if(mon.encore&&(--mon.encore.turns<=0||(mon.pp[mon.encore.moveId]??0)<=0)){mon.encore=undefined;addLog(state,`${displayName(mon)}의 앵콜이 끝났다!`,'status',{targetUid:mon.uid});}
      if(mon.tormentedMove&&--mon.tormentedMove.turns<=0){mon.tormentedMove=undefined;addLog(state,`${displayName(mon)}의 반복 사용 제한이 풀렸다!`,'status',{targetUid:mon.uid});}
      if(mon.disabledMove&&--mon.disabledMove.turns<=0){mon.disabledMove=undefined;addLog(state,`${displayName(mon)}의 기술 봉인이 풀렸다!`,'status',{targetUid:mon.uid});}
    }
  }
}
