import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CircleUserRound, Swords, Zap } from 'lucide-react';
import { SceneActor } from './BattleVisuals';
import type { BattleState, Side } from '../engine/types';

interface Props {
  state:BattleState;
  names:{player:string;opponent:string};
  friend:boolean;
  reducedMotion:boolean;
  onStart:()=>void;
}

export function BattleIntro({state,names,friend,reducedMotion,onStart}:Props) {
  const duration=reducedMotion?1500:6500;
  const [remaining,setRemaining]=useState(Math.ceil(duration/1000));
  const startRef=useRef(onStart);startRef.current=onStart;
  useEffect(()=>{
    const started=Date.now();
    const clock=setInterval(()=>setRemaining(Math.max(0,Math.ceil((duration-(Date.now()-started))/1000))),200);
    const finish=setTimeout(()=>startRef.current(),duration);
    return()=>{clearInterval(clock);clearTimeout(finish);};
  },[duration]);

  function sideView(side:Side,name:string,label:string) {
    const squad=state.sides[side], active=squad.active.slice(0,state.format==='doubles'?2:1).map(slot=>squad.team[slot]).filter(Boolean);
    return <section className={`battle-intro-side battle-intro-${side}`} aria-label={`${name} 출전 포켓몬`}>
      <div className="battle-intro-trainer"><span><CircleUserRound size={29}/></span><div><small>{label}</small><strong>{name}</strong><em>파티 {squad.team.length}마리</em></div></div>
      <div className="battle-intro-formation">{active.map((pokemon,index)=><figure className="battle-intro-mon" key={pokemon.uid} style={{'--intro-delay':`${index*150}ms`} as React.CSSProperties}>
        <SceneActor pokemon={pokemon} side={side} slot={index} event={null}/>
        <figcaption><strong>{pokemon.speciesName}</strong><span>Lv. 50</span></figcaption>
      </figure>)}</div>
    </section>;
  }

  return <main className={`battle-intro-screen ${reducedMotion?'intro-reduced-motion':''}`} aria-label="배틀 시작 연출">
    <div className="battle-intro-roof"/><div className="battle-intro-stands"/><div className="battle-intro-floor"/>
    <header className="battle-intro-brand"><span><Zap size={17} fill="currentColor"/> ARENA</span><small>{friend?'FRIEND MATCH':'CPU BATTLE'} · {state.format==='doubles'?'DOUBLE BATTLE':'SINGLE BATTLE'}</small><span>PREPARE TO BATTLE</span></header>
    <div className="battle-intro-arena">
      {sideView('cpu',names.opponent,friend?'도전자':'CPU 라이벌')}
      <div className="battle-intro-vs" aria-label="대전 시작"><span>VS</span><Swords size={19}/></div>
      {sideView('player',names.player,friend?'나':'플레이어')}
    </div>
    <div className="battle-intro-footer"><div><small>전장이 준비되었습니다</small><strong>누가 먼저 승리를 가져갈까요?</strong></div>
      <button className="battle-intro-start" onClick={onStart}><span>{remaining>0?'배틀 시작':'입장하기'}</span><ArrowRight size={18}/></button>
    </div>
    <div className="battle-intro-progress" aria-hidden="true"><span key={duration} style={{animationDuration:`${duration}ms`}}/></div>
  </main>;
}
