import type { BattleEvent } from '../engine/types';
import { moves } from '../data';
import { dynamicMovePower } from '../engine/calculations';

export type EffectivenessType = 'super' | 'resisted' | 'neutral';
export type ShakeIntensity = 'none' | 'medium' | 'strong';

export interface HitEffect {
  effectiveness: EffectivenessType;
  shake: ShakeIntensity;
  critical: boolean;
  flash: 'gold' | 'red' | 'blue' | null;
  popups: {text:string;style:'critical'|'super'|'resisted'}[];
  amplitude: number;
}

/** Derived only from the actual damage event, never from the chosen move's type. */
export function describeHit(event: BattleEvent): HitEffect | null {
  if(event.kind!=='damage'||event.beforeHp===undefined||event.afterHp===undefined||event.beforeHp<=event.afterHp)return null;
  const effectiveness:EffectivenessType=(event.effectiveness??1)>1?'super':(event.effectiveness??1)<1?'resisted':'neutral';
  const critical=event.critical===true;
  const move=event.moveId?moves[event.moveId]:undefined;
  const attacker=Object.values(event.snapshot.sides).flatMap(side=>side.team).find(mon=>mon.uid===event.actorUid);
  const power=move ? event.powered ? 140 : attacker?dynamicMovePower(event.snapshot,attacker,move.power,move):move.power : 0;
  const shake=critical&&effectiveness==='super'||power>=120?'strong':critical||effectiveness==='super'||power>=70?'medium':'none';
  const amplitude=shake==='none'?0:Math.min(18,Math.max(4,power/12)+(critical?4:0)+(effectiveness==='super'?3:0));
  return {effectiveness,critical,shake,amplitude,
    flash:critical?'gold':effectiveness==='super'?'red':effectiveness==='resisted'?'blue':null,
    popups:[...(critical?[{text:'급소에 맞았다!',style:'critical' as const}]:[]),
      ...(effectiveness==='super'?[{text:'효과가 굉장했다!',style:'super' as const}]:effectiveness==='resisted'?[{text:'효과가 별로인 듯하다...',style:'resisted' as const}]:[])]};
}

export function animateNode(node:Element,frames:Keyframe[],duration:number,signal:AbortSignal):Promise<void>{
  if(signal.aborted||!node.animate)return Promise.resolve();
  const animation=node.animate(frames,{duration,easing:'cubic-bezier(.2,.7,.2,1)'});
  const abort=()=>animation.cancel();signal.addEventListener('abort',abort,{once:true});
  return animation.finished.then(()=>{},()=>{}).finally(()=>signal.removeEventListener('abort',abort));
}

/** Starts flash, popup and camera impact together, before the HP gauge starts moving. */
export async function playHitEffect(root:HTMLElement,target:Element|null,effect:HitEffect,signal:AbortSignal):Promise<void>{
  if(signal.aborted)return;
  const rate=Number(root.dataset.playbackRate)||1;
  const sceneRect=root.getBoundingClientRect(),targetRect=target?.getBoundingClientRect();
  const x=targetRect?targetRect.left+targetRect.width/2-sceneRect.left:sceneRect.width/2;
  const y=targetRect?targetRect.top+targetRect.height*.12-sceneRect.top:sceneRect.height*.35;
  const nodes:HTMLElement[]=[];const tasks:Promise<void>[]=[];
  if(effect.flash){
    const flash=document.createElement('span');flash.className=`battle-vfx hit-flash hit-flash-${effect.flash}`;root.append(flash);nodes.push(flash);
    tasks.push(animateNode(flash,[{opacity:0},{opacity:effect.critical?0.73:0.56,offset:.24},{opacity:0}],310/rate,signal));
  }
  for(const [index,popup] of effect.popups.entries()){
    const node=document.createElement('span');node.className=`battle-vfx hit-popup hit-popup-${popup.style}`;node.textContent=popup.text;
    node.style.left=`${x}px`;node.style.top=`${y-index*36}px`;root.append(node);nodes.push(node);
    tasks.push(animateNode(node,[{opacity:0,transform:'translate(-50%,16px) scale(.65)'},{opacity:1,transform:'translate(-50%,-12px) scale(1.13)',offset:.32},{opacity:1,transform:'translate(-50%,-29px) scale(1)',offset:.65},{opacity:0,transform:'translate(-50%,-48px) scale(.95)'}],660/rate,signal));
  }
  if(effect.shake!=='none'){
    const camera=root.querySelector('.battle-camera')??root;
    const amplitude=effect.amplitude;
    tasks.push(animateNode(camera,[{transform:'translate(0,0)'},{transform:`translate(${-amplitude}px,${amplitude*.4}px)`},{transform:`translate(${amplitude}px,${-amplitude*.35}px)`},{transform:`translate(${-amplitude*.65}px,${amplitude*.25}px)`},{transform:'translate(0,0)'}],effect.shake==='strong'?390/rate:280/rate,signal));
  }
  if(effect.critical){
    const ring=document.createElement('span');ring.className='battle-vfx impact-critical-ring';
    ring.style.left=`${x}px`;ring.style.top=`${targetRect?targetRect.top+targetRect.height/2-sceneRect.top:y}px`;
    root.append(ring);nodes.push(ring);
    tasks.push(animateNode(ring,[{transform:'translate(-50%,-50%) scale(.15) rotate(-15deg)',opacity:0},{transform:'translate(-50%,-50%) scale(1) rotate(0deg)',opacity:1,offset:.2},{transform:'translate(-50%,-50%) scale(1.3) rotate(12deg)',opacity:.8,offset:.7},{transform:'translate(-50%,-50%) scale(1.7)',opacity:0}],720/rate,signal));
  }
  try{await Promise.all(tasks);}finally{nodes.forEach(node=>node.remove());}
}
