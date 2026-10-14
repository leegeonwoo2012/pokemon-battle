import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Clock3, GripVertical, ShieldQuestion } from 'lucide-react';
import { SpeciesMark } from './PokemonArtwork';
import type { Format } from '../engine/types';
import type { TeamPreviewEntry, TeamSelectionPayload } from '../network/friendBattle';

interface Props {
  format: Format;
  own: TeamPreviewEntry[];
  opponent: TeamPreviewEntry[];
  endsAt: number;
  submitted: boolean;
  opponentSubmitted: boolean;
  opponentName: string;
  onSubmit: (selection: TeamSelectionPayload) => void;
  onExit: () => void;
  onTimeout?: () => void;
}

export function TeamPreviewModal({format,own,opponent,endsAt,submitted,opponentSubmitted,opponentName,onSubmit,onExit,onTimeout}: Props) {
  const required = Math.min(format === 'doubles' ? 4 : 3,own.length);
  const [selection,setSelection] = useState<number[]>([]);
  const timeoutNotified=useRef(false);
  const [remaining,setRemaining] = useState(() => Math.max(0,Math.ceil((endsAt-Date.now())/1000)));
  useEffect(() => {
    const update = () => setRemaining(Math.max(0,Math.ceil((endsAt-Date.now())/1000)));
    update();const timer = setInterval(update,250);return () => clearInterval(timer);
  },[endsAt]);
  useEffect(() => { if(remaining===0&&!submitted&&!timeoutNotified.current){timeoutNotified.current=true;onTimeout?.();} },[remaining,submitted,onTimeout]);
  const add = (index:number,slot?:number) => {
    if(submitted)return;
    setSelection(current => {
      const without=current.filter(value=>value!==index);
      if(slot!==undefined){const next=[...without];next.splice(Math.min(slot,next.length),0,index);return next.slice(0,required);}
      return current.includes(index)?without:current.length<required?[...current,index]:current;
    });
  };
  const clock=`${String(Math.floor(remaining/60)).padStart(2,'0')}:${String(remaining%60).padStart(2,'0')}`;
  return <main className="team-preview-screen" aria-label="팀 프리뷰와 선출">
    <div className="team-preview-panel">
      <header className="team-preview-header"><button type="button" className="team-preview-exit" onClick={onExit} aria-label="팀 프리뷰 나가기"><ArrowLeft size={16}/> 나가기</button><div><small>TEAM PREVIEW · {format==='singles'?'SINGLE':'DOUBLE'}</small><h1>출전 순서를 정하세요</h1><p>{own.length}마리 중 {required}마리를 선택합니다. 앞에서부터 출전하고 나머지는 대기합니다.</p></div><div className={`team-preview-clock ${remaining<=15?'urgent':''}`} role="timer" aria-label="선출 남은 시간"><Clock3 size={21}/><strong>{clock}</strong></div></header>
      <div className="team-preview-vs">
        <section aria-label="내 파티"><h2>내 파티 <span>{own.length} ENTRIES</span></h2><div className="team-preview-roster">{own.map((entry,index)=><button type="button" key={index} className={`team-preview-mon ${selection.includes(index)?'selected':''}`} aria-label={`${entry.speciesName} 선출${selection.includes(index)?` ${selection.indexOf(index)+1}번`:''}`} disabled={submitted} draggable={!submitted} onDragStart={event=>event.dataTransfer.setData('text/plain',String(index))} onClick={()=>add(index)}><span className="team-preview-order">{selection.includes(index)?selection.indexOf(index)+1:'+'}</span><SpeciesMark speciesId={entry.speciesId}/><span><strong>{entry.speciesName}</strong><small>Lv. {entry.level}{entry.gender==='M'?' ♂':entry.gender==='F'?' ♀':''}</small></span><GripVertical size={15}/></button>)}</div></section>
        <div className="team-preview-center" aria-hidden="true"><span>VS</span></div>
        <section aria-label="상대 파티"><h2>{opponentName} <span>{opponent.length} ENTRIES</span></h2><div className="team-preview-roster">{opponent.map((entry,index)=><div className="team-preview-mon foe" key={index}><span className="team-preview-order">{index+1}</span><SpeciesMark speciesId={entry.speciesId}/><span><strong>{entry.speciesName}</strong><small>Lv. {entry.level}{entry.gender==='M'?' ♂':entry.gender==='F'?' ♀':''}</small></span><ShieldQuestion size={16} aria-label="특성과 도구 비공개"/></div>)}</div></section>
      </div>
      <section className="team-preview-footer" aria-label="선출 순서"><div className="team-preview-slots">{Array.from({length:required},(_,slot)=><div key={slot} className={`team-preview-slot ${selection[slot]!==undefined?'filled':''}`} onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();const index=Number(event.dataTransfer.getData('text/plain'));if(Number.isInteger(index)&&index>=0&&index<own.length)add(index,slot);}}><span>{slot+1} {slot<(format==='doubles'?2:1)?'선출':'대기'}</span>{selection[slot]!==undefined?<button type="button" disabled={submitted} onClick={()=>add(selection[slot])}><SpeciesMark speciesId={own[selection[slot]].speciesId}/>{own[selection[slot]].speciesName} ×</button>:<small>포켓몬을 선택하거나 끌어오세요</small>}</div>)}</div><div className="team-preview-confirm"><p>{submitted?<><Check size={15}/> 내 선출 완료 · {opponentSubmitted?'상대도 완료':'상대 대기 중'}</>:<>상대 선출: {opponentSubmitted?'완료':'대기 중'} · {remaining===0?'시간 종료 시 상위 순서 자동 선출':`${remaining}초 남음`}</>}</p><button type="button" disabled={submitted||selection.length!==required} onClick={()=>onSubmit({indices:selection})}>{submitted?'선출 완료':`${required}마리 선출 완료`}</button></div></section>
    </div>
  </main>;
}
