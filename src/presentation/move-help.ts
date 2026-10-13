import { estimateDamage, getTypeMultiplier, isTypeImmune } from '../engine/calculations';
import { hazardNames, screenNames } from '../engine/tactics';
import { typeNames } from '../data';
import type { BattleState, Combatant, Move } from '../engine/types';

export function effectivenessLabel(move:Move,target:Combatant):string {
  if(move.category==='status')return '변화 기술';
  const value=isTypeImmune(target,move)?0:getTypeMultiplier(move.type,target.types);
  return value===0?'효과 없음':value>1?`약점 ×${value}`:value<1?`반감 ×${value}`:'보통 ×1';
}
export function moveHelp(move:Move):string {
  const effects=(move.effects??[]).map(effect=>{
    switch(effect.kind) {
      case 'hazard':return `상대 진영에 ${hazardNames[effect.hazard]} 설치`;
      case 'screen':return `${screenNames[effect.screen]}으로 아군 피해 감소`;
      case 'tailwind':return '아군 스피드 2배 · 4턴';
      case 'trickroom':return '낮은 스피드부터 행동 · 5턴 · 우선도는 유지';
      case 'gravity':return '5턴 동안 모두 지면 판정 · 기술 명중률 상승';
      case 'substitute':return '최대 HP 1/4을 사용해 대타 생성';
      case 'forceSwitch':return '상대 포켓몬을 무작위 대기 포켓몬으로 교체';
      case 'taunt':return '상대 변화 기술 봉쇄 · 3턴';
      case 'encore':return '마지막 사용 기술로 제한 · 3턴';
      case 'clearHazards':return effect.bothSides?'양쪽 설치물·상대 장막·필드 제거':'아군 설치물 제거';
      case 'heal':return `HP ${Math.round(effect.fraction*100)}% 회복`;
      case 'protect':return '공격 방어 · 연속 사용 시 성공률 감소';
      case 'drain':return `피해의 ${Math.round(effect.fraction*100)}% 회복`;
      case 'recoil':return '사용 후 반동 피해';
      case 'weather':return '날씨 변경 · 5턴';
      case 'field':return '필드 전개 · 5턴';
      case 'stat':return `${effect.target==='self'?'자신':'대상'}의 능력치 ${effect.stages>0?'상승':'하락'}${effect.chance?` (${effect.chance}%)`:''}`;
      case 'status':return `상태 이상 부여${effect.chance?` (${effect.chance}%)`:''}`;
      case 'volatile':return `${effect.condition==='confusion'?'혼란':'풀죽음'}${effect.chance?` (${effect.chance}%)`:''}`;
      case 'aquaRing':return '매 턴 최대 HP의 1/16 회복 · 교체까지 유지';
      case 'yawn':return '다음 턴 종료 시 잠듦';
      case 'attract':return '이성인 상대를 헤롱헤롱 상태로 만듦';
      case 'entrainment':return '대상의 특성을 자신의 특성으로 바꿈';
      case 'rest':return 'HP와 상태 이상을 회복하고 2턴 잠듦';
    }
  });
  return [`${typeNames[move.type]} · ${move.category==='physical'?'물리':move.category==='special'?'특수':'변화'}`,
    move.delayedTurns?`${move.delayedTurns}턴 뒤 대상 위치 공격`:'',move.charge?`${move.charge==='sun'?'햇빛':move.charge==='rain'?'비':'파워풀허브'}가 없으면 1턴 충전`:'',
    move.fixedDamage?'조건에 따른 고정 피해':'',move.dynamicPower==='remainingHp'?'남은 HP가 높을수록 위력 증가':move.dynamicPower==='faintedAllies'?'쓰러진 아군마다 위력 +50':'',
    move.pivot?'명중 후 교체':'',move.selfCostFraction?'사용 후 HP 절반 소모':'',move.selfDestruct?'사용 후 기절':'',move.rampage?'2~5턴 연속 사용 후 혼란':'',
    move.ohko?'명중하면 일격에 기절':'',move.multihit?'2~5회 연속 공격':'',...effects].filter(Boolean).join(' / ');
}
export function tacticalThreat(state:BattleState,user:Combatant,target:Combatant,move:Move):string {
  const damage=estimateDamage(state,user,target,move);
  return `${effectivenessLabel(move,target)}${move.category!=='status'&&damage>=target.hp?' · KO 예상':''}`;
}
