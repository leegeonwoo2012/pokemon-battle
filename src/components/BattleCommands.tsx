import { useLayoutEffect, useRef, useState } from 'react';
import { Crosshair, Sparkles, Swords, Target, Waves } from 'lucide-react';
import { typeNames } from '../data';
import type { Move } from '../engine/types';
import { battleAudio } from '../presentation/audio';
import { moveHelp } from '../presentation/move-help';

export function MoveChoice({move,baseId,pp,unavailable,effectiveness,onChoose,onPreview}:{move:Move;baseId:string;pp:number;unavailable?:string;effectiveness?:string;onChoose:()=>void;onPreview:(active:boolean)=>void}) {
  const spread=move.target==='allEnemies'||move.target==='allOthers';
  const Icon=move.category==='physical'?Swords:move.category==='special'?Sparkles:Waves;
  return <button className="move-choice" data-type={move.type} data-move-id={baseId} title={unavailable??moveHelp(move)} disabled={!!unavailable}
    onClick={onChoose} onMouseEnter={()=>onPreview(true)} onMouseLeave={()=>onPreview(false)} onFocus={()=>{battleAudio.cursor();onPreview(true);}} onBlur={()=>onPreview(false)}>
    <span className="move-choice-cursor" aria-hidden="true">▶</span>
    <span className="move-name">{move.powered==='z'?'Z · ':''}{move.name}</span>
    <span className={`type-badge type-${move.type}`}>{typeNames[move.type]}</span>
    <span className="move-power"><Icon size={11}/>{move.category==='status'?'변화':move.ohko?'일격':move.fixedHpFraction!==undefined?`현재 HP ${Math.round(move.fixedHpFraction*100)}% 피해`:`위력 ${move.power}`}<span>명중 {move.accuracy??'필중'}</span>{spread?<span className="move-spread"><Crosshair size={10}/>범위</span>:<span><Target size={10}/>단일</span>}{effectiveness&&move.category!=='status'&&<span>{effectiveness}</span>}</span>
    <small className={pp===0?'pp-empty':''}>PP <b>{pp}</b> / {move.pp}{unavailable&&pp>0?' · 제한':''}</small>
  </button>;
}

export function BattleTargetOverlay({sourceUid,targetUids,spread}:{sourceUid?:string;targetUids:string[];spread:boolean}) {
  const svg=useRef<SVGSVGElement>(null);
  const [lines,setLines]=useState<{uid:string;x1:number;y1:number;x2:number;y2:number}[]>([]);
  const signature=targetUids.join(',');
  useLayoutEffect(()=>{
    const scene=svg.current?.closest('.battle-scene');
    if(!scene||!sourceUid||!signature){setLines([]);return;}
    const measure=()=>{
      const rect=scene.getBoundingClientRect();
      const centre=(uid:string)=>{
        const actor=scene.querySelector(`[data-uid="${uid}"] .sprite-crop`)??scene.querySelector(`[data-uid="${uid}"] .sprite-art`);
        const box=actor?.getBoundingClientRect();
        return box?{x:box.left+box.width/2-rect.left,y:box.top+box.height*.7-rect.top}:null;
      };
      const from=centre(sourceUid);if(!from){setLines([]);return;}
      setLines(signature.split(',').flatMap(uid=>{const to=centre(uid);return to?[{uid,x1:from.x,y1:from.y,x2:to.x,y2:to.y}]:[];}));
    };
    measure();window.addEventListener('resize',measure);
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(measure):null;
    observer?.observe(scene);scene.querySelectorAll('.sprite-crop').forEach(node=>observer?.observe(node));
    return ()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
  },[sourceUid,signature]);
  return <svg ref={svg} className={`battle-target-overlay ${spread?'target-overlay-spread':''}`} aria-hidden="true">
    <defs><marker id="target-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>
    {lines.map(line=><path key={line.uid} data-target-line={line.uid} d={`M ${line.x1} ${line.y1} Q ${(line.x1+line.x2)/2} ${Math.min(line.y1,line.y2)-25} ${line.x2} ${line.y2}`} markerEnd="url(#target-arrow)"/>)}
  </svg>;
}
