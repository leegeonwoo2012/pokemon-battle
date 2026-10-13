import type { BattleEvent } from '../engine/types';
import { moveMotion } from './move-motions';
import { battleAudio } from './audio';
import { animationPause, battleTiming } from './timing';

const colors: Record<string, string> = { fire:'#ff8550',water:'#77d5ff',electric:'#fff473',grass:'#93ee86',ice:'#c0f7ff',fighting:'#ffc18d',poison:'#d3a1ff',ground:'#e4c994',flying:'#d9f2ff',psychic:'#ffa4d4',bug:'#c6ec89',rock:'#ddcb9c',ghost:'#b99cff',dragon:'#b4b8ff',dark:'#8d99b9',steel:'#d4eaff',fairy:'#ffc6ed',normal:'#fff9d6' };

export function resetBattleVisuals(root:HTMLElement|null):void {
  battleAudio.stopEffects();
  if(!root)return;
  for(const animation of root.getAnimations?.({subtree:true})??[]) {
    // Leave CSS idle/atmosphere loops intact, clear finished WAAPI faint/switch poses too.
    if(typeof CSSAnimation==='undefined'||!(animation instanceof CSSAnimation))animation.cancel();
  }
  root.querySelectorAll('.battle-vfx').forEach(node=>node.remove());
  delete root.dataset.moveId;delete root.dataset.motionPhase;
}

async function tween(element: Element | null, frames: Keyframe[], duration: number, signal: AbortSignal, fill: FillMode = 'none'): Promise<void> {
  if (!element?.animate || signal.aborted) return;
  const scene = element.closest<HTMLElement>('.battle-scene');
  duration /= Number(scene?.dataset.playbackRate) || 1;
  const animation = element.animate(frames, { duration, easing:'cubic-bezier(.25,.65,.3,1)', fill });
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => animation.cancel();
  signal.addEventListener('abort', cancel, { once:true });
  try {
    // Completion comes from the animation API; this timeout only recovers a stalled renderer.
    await Promise.race([animation.finished, new Promise<void>(resolve => { watchdog=setTimeout(() => { animation.cancel(); resolve(); }, duration+1500); })]);
  } catch (error) { if (!signal.aborted) throw error; }
  finally { clearTimeout(watchdog); signal.removeEventListener('abort',cancel); }
}

function point(element: Element, root: Element) {
  const rect=(element.querySelector('.sprite-crop')??element).getBoundingClientRect(), parent=root.getBoundingClientRect();
  return { x:rect.left+rect.width/2-parent.left, y:rect.top+rect.height/2-parent.top };
}

async function effect(root: HTMLElement, target: Element | null, kind: string, color: string, signal: AbortSignal, from?: Element | null, duration?:number) {
  if (!target) return;
  const end=point(target,root), start=from ? point(from,root) : end;
  const node=document.createElement('span');
  node.className=`battle-vfx vfx-${kind}`;
  node.style.setProperty('--vfx-color',color);
  node.style.left=`${start.x}px`;node.style.top=`${start.y}px`;
  root.append(node);
  try {
    await tween(node,kind==='projectile' ? [{transform:'translate(-50%,-50%) scale(.4)',opacity:0},{opacity:1,offset:.15},{transform:`translate(calc(-50% + ${end.x-start.x}px), calc(-50% + ${end.y-start.y}px)) scale(1.3)`,opacity:1}] : [{transform:'translate(-50%,-50%) scale(.35)',opacity:0},{opacity:1,offset:.3},{transform:'translate(-50%,-60%) scale(1.7)',opacity:0}],duration??(kind==='projectile'?660:720),signal);
  } finally { node.remove(); }
}

function moveParticle(root: HTMLElement, family: string, color: string, pointAt: { x: number; y: number }, extra = '') {
  const node = document.createElement('span');
  node.className = `battle-vfx move-vfx vfx-move-${family}${extra ? ` ${extra}` : ''}`;
  node.style.left = `${pointAt.x}px`; node.style.top = `${pointAt.y}px`;
  node.style.setProperty('--vfx-color', color);
  root.append(node);
  return node;
}

function camera(root:HTMLElement){return root.querySelector('.battle-camera')??root;}
function scaledPause(root:HTMLElement,ms:number,signal:AbortSignal){return animationPause(ms/(Number(root.dataset.playbackRate)||1),signal);}

async function featuredMove(root:HTMLElement,event:BattleEvent,user:Element|null,victims:Element[],signal:AbortSignal):Promise<boolean> {
  const id=event.moveId;
  if(!user||!['earthquake','outrage','steelbeam','surf','makeitrain','lastrespects'].includes(id??''))return false;
  const origin=point(user,root),color=colors[event.type??'normal']??colors.normal;
  const nodes:HTMLElement[]=[];
  const spawn=(family:string,at=origin)=>{const node=moveParticle(root,family,color,at);nodes.push(node);return node;};
  try{
    if(id==='earthquake'){
      await tween(user,[{transform:'translateY(0)'},{transform:'translateY(-12px)',offset:.45},{transform:'translateY(3px)',offset:.7},{transform:'translateY(0)'}],280,signal);
      await Promise.all([
        tween(camera(root),[{transform:'translate(0,0)'},{transform:'translate(-10px,4px)',offset:.15},{transform:'translate(9px,-3px)',offset:.32},{transform:'translate(-7px,5px)',offset:.5},{transform:'translate(6px,-2px)',offset:.72},{transform:'translate(0,0)'}],850,signal),
        ...[origin,...victims.map(victim=>point(victim,root))].map(async(at,index)=>{
          const fissure=spawn('earthquake-fissure',{x:at.x,y:at.y+40});
          await scaledPause(root,index*65,signal);
          await tween(fissure,[{transform:'translate(-50%,-50%) scale(.15,.7)',opacity:0},{transform:'translate(-50%,-50%) scale(1)',opacity:1,offset:.3},{transform:'translate(-50%,-50%) scale(1.3)',opacity:0}],760,signal);
        }),
      ]);return true;
    }
    if(id==='steelbeam'){
      const charge=spawn('steelbeam-charge');
      await tween(charge,[{transform:'translate(-50%,-50%) scale(.1)',opacity:0},{transform:'translate(-50%,-50%) scale(1)',opacity:1}],350,signal);
      await Promise.all(victims.map(async victim=>{
        const hit=point(victim,root),dx=hit.x-origin.x,dy=hit.y-origin.y,angle=Math.atan2(dy,dx)*180/Math.PI;
        const beam=spawn('steelbeam-lance',{x:origin.x+dx/2,y:origin.y+dy/2});beam.style.width=`${Math.hypot(dx,dy)}px`;
        await Promise.all([
          tween(beam,[{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(.01)`,opacity:0},{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1)`,opacity:1,offset:.2},{opacity:1,offset:.7},{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1.02)`,opacity:0}],1000,signal),
          tween(camera(root),[{transform:'scale(1)'},{transform:'scale(1.035)',offset:.25},{transform:'scale(1)'}],1000,signal),
          tween(charge,[{opacity:1,filter:'brightness(2)'},{opacity:0,transform:'translate(-50%,-50%) scale(1.8)'}],1000,signal),
        ]);
      }));return true;
    }
    if(id==='outrage'){
      const aura=spawn('outrage-aura');
      const hit=victims[0]?point(victims[0],root):origin,dx=hit.x-origin.x,dy=hit.y-origin.y;
      await Promise.all([
        tween(aura,[{transform:'translate(-50%,-50%) scale(.2)',opacity:0},{transform:'translate(-50%,-50%) scale(1.3)',opacity:1,offset:.3},{transform:`translate(calc(-50% + ${dx*.28}px),calc(-50% + ${dy*.2}px)) scale(1.6)`,opacity:0}],1050,signal),
        tween(user,[{transform:'translate(0,0)'},{transform:`translate(${dx*.28}px,${dy*.23}px) rotate(-6deg)`,offset:.38},{transform:`translate(${dx*.2}px,${dy*.15}px) rotate(5deg)`,offset:.66},{transform:'translate(0,0)'}],1050,signal),
        ...[0,1,2].map(async index=>{await scaledPause(root,260+index*160,signal);const claw=spawn('outrage-claw',{x:hit.x+index*16-16,y:hit.y});await tween(claw,[{transform:`translate(-50%,-50%) rotate(${index%2?-35:35}deg) scale(.1)`,opacity:0},{opacity:1,offset:.2},{transform:`translate(-50%,-50%) rotate(${index%2?-35:35}deg) scale(1.4)`,opacity:0}],480,signal);}),
        tween(camera(root),[{transform:'scale(1)'},{transform:'scale(1.025) translateX(-4px)',offset:.4},{transform:'scale(1)'}],1050,signal),
      ]);return true;
    }
    if(id==='surf'){
      await Promise.all(victims.map(async victim=>{
        const hit=point(victim,root),dx=hit.x-origin.x,dy=hit.y-origin.y;
        const wave=spawn('surf-wave');
        await tween(wave,[{transform:'translate(-50%,-30%) scale(.4)',opacity:0},{transform:`translate(calc(-50% + ${dx*.4}px),calc(-30% + ${dy*.4}px)) scale(1.4)`,opacity:1,offset:.4},{transform:`translate(calc(-50% + ${dx}px),calc(-30% + ${dy}px)) scale(1.8)`,opacity:0}],1200,signal);
      }));return true;
    }
    if(id==='makeitrain'){
      await Promise.all(victims.flatMap(victim=>Array.from({length:10},async(_,index)=>{
        const at=point(victim,root),coin=spawn('gold-coin',{x:at.x+(index%5-2)*35,y:at.y-160});
        await scaledPause(root,(index%5)*80,signal);
        await tween(coin,[{transform:'translate(-50%,-50%) rotateY(0deg)',opacity:0},{opacity:1,offset:.15},{transform:'translate(-50%,150px) rotateY(720deg)',opacity:0}],650,signal);
      })));return true;
    }
    const side=event.actorUid?.startsWith('cpu-')?'cpu':'player';
    const count=Math.min(6,1+event.snapshot.sides[side].team.filter(mon=>mon.fainted).length);
    await Promise.all(victims.flatMap(victim=>Array.from({length:count},async(_,index)=>{
      const hit=point(victim,root),orb=spawn('lastrespects-soul',{x:origin.x+(index-count/2)*35,y:origin.y+35});
      await scaledPause(root,index*80,signal);
      await tween(orb,[{transform:'translate(-50%,-50%) scale(.15)',opacity:0},{transform:'translate(-50%,-110%) scale(1)',opacity:.9,offset:.3},{transform:`translate(calc(-50% + ${hit.x-origin.x}px),calc(-50% + ${hit.y-origin.y}px)) scale(.5)`,opacity:0}],950,signal);
    })));return true;
  }finally{nodes.forEach(node=>node.remove());}
}

async function signatureMove(root: HTMLElement, event: BattleEvent, user: Element | null, victims: Element[], signal: AbortSignal): Promise<boolean> {
  const id = event.moveId;
  if (!['thunderbolt', 'thunder', 'surf', 'hydropump', 'icebeam', 'fireblast', 'xscissor', 'closecombat'].includes(id ?? '') || !user || !victims.length) return false;
  const origin = point(user, root), color = colors[event.type ?? 'normal'];
  await Promise.all(victims.map(async victim => {
    const hit = point(victim, root), dx = hit.x - origin.x, dy = hit.y - origin.y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    const kind = id === 'thunderbolt' || id === 'thunder' ? 'thunder-strike' : id === 'surf' ? 'surf-wave' : id === 'fireblast' ? 'fire-star' : id === 'xscissor' ? 'cross-cut' : id === 'closecombat' ? 'punch-burst' : 'signature-beam';
    const at = ['hydropump', 'icebeam'].includes(id!) ? { x: origin.x + dx / 2, y: origin.y + dy / 2 } : id === 'surf' || id === 'fireblast' ? origin : hit;
    const node = moveParticle(root, kind, color, at);
    try {
      if (kind === 'signature-beam') {
        node.style.width = `${Math.hypot(dx, dy)}px`;
        await tween(node, [{ transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(.05)`, opacity:0 }, { transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1)`, opacity:1, offset:.35 }, { transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1)`, opacity:.9, offset:.75 }, { transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1)`, opacity:0 }], 1050, signal);
      } else if (kind === 'thunder-strike') {
        await tween(node, [{ transform:'translate(-50%,-100%) scaleY(.05)', opacity:0 }, { transform:'translate(-50%,-80%) scaleY(1)', opacity:1, offset:.18 }, { opacity:.15, offset:.35 }, { opacity:1, offset:.55 }, { transform:'translate(-50%,-75%) scale(1.2)', opacity:0 }], 900, signal);
      } else if (kind === 'surf-wave' || kind === 'fire-star') {
        await tween(node, [{ transform:'translate(-50%,-50%) scale(.25)', opacity:0 }, { transform:`translate(calc(-50% + ${dx * .3}px),calc(-50% + ${dy * .3}px)) scale(1)`, opacity:1, offset:.35 }, { transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(${kind === 'surf-wave' ? 1.6 : 1.3}) rotate(${kind === 'fire-star' ? 150 : 0}deg)`, opacity:0 }], 1150, signal);
      } else {
        await tween(node, [{ transform:'translate(-50%,-50%) scale(.2)', opacity:0 }, { transform:'translate(-50%,-50%) scale(1.15) rotate(-15deg)', opacity:1, offset:.2 }, { transform:'translate(-50%,-50%) scale(.7) rotate(15deg)', opacity:.3, offset:.4 }, { transform:'translate(-50%,-50%) scale(1.35) rotate(-15deg)', opacity:1, offset:.6 }, { transform:'translate(-50%,-50%) scale(1.6)', opacity:0 }], 880, signal);
      }
    } finally { node.remove(); }
  }));
  return true;
}

async function animateMove(root: HTMLElement, event: BattleEvent, user: Element | null, targets: (Element | null)[], signal: AbortSignal): Promise<void> {
  const move = { id: event.moveId ?? '', type: event.type ?? 'normal', category: event.category ?? 'physical' };
  const { family } = moveMotion(move);
  const origin = user ? point(user, root) : { x: root.clientWidth * 0.34, y: root.clientHeight * 0.5 };
  const victims = targets.filter((target): target is Element => !!target);
  const color = colors[move.type] ?? colors.normal;
  const hitPoints = victims.map(target => point(target, root));
  if(await featuredMove(root,event,user,victims,signal))return;
  if (await signatureMove(root, event, user, victims, signal)) return;

  if (family === 'heal' || family === 'dance' || family === 'barrier' || move.category === 'status' && !victims.length) {
    const self = moveParticle(root, family, color, origin);
    try {
      const frames = family === 'dance'
        ? [{ transform: 'translate(-50%,-50%) rotate(-35deg) scale(.35)', opacity: 0 }, { transform: 'translate(-50%,-50%) rotate(25deg) scale(1.3)', opacity: 1, offset: .55 }, { transform: 'translate(-50%,-50%) rotate(100deg) scale(.7)', opacity: 0 }]
        : [{ transform: 'translate(-50%,-50%) scale(.35) rotate(0deg)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.15) rotate(90deg)', opacity: 1, offset: .45 }, { transform: 'translate(-50%,-50%) scale(1.55) rotate(170deg)', opacity: 0 }];
      await tween(self, frames, 790, signal);
    } finally { self.remove(); }
    return;
  }

  if (family === 'earth') {
    const shakes = tween(camera(root), [{ transform: 'translate(0,0)' }, { transform: 'translate(-5px,1px)', offset: .2 }, { transform: 'translate(6px,-1px)', offset: .44 }, { transform: 'translate(-4px,1px)', offset: .7 }, { transform: 'translate(0,0)' }], 450, signal);
    const waves = hitPoints.slice(0, move.id === 'earthquake' || move.id === 'rockslide' ? 2 : 1).map(async hit => {
      const node = moveParticle(root, move.id === 'rockslide' || move.id === 'stoneedge' ? 'rock' : 'earth', color, { x: hit.x, y: hit.y + 22 });
      try { await tween(node, [{ transform: 'translate(-50%,-50%) scale(.2) rotate(0)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.2) rotate(32deg)', opacity: .95, offset: .45 }, { transform: 'translate(-50%,-50%) scale(1.65) rotate(54deg)', opacity: 0 }], 470, signal); }
      finally { node.remove(); }
    });
    await Promise.all([shakes, ...waves]);
    return;
  }

  if (family === 'strike' || family === 'charge') {
    const destination = hitPoints[0] ?? { x: origin.x + root.clientWidth * .17, y: origin.y - 16 };
    const dx = destination.x - origin.x, dy = destination.y - origin.y;
    const lunge = tween(user, [
      { transform: 'translate(0,0) scale(1)' },
      { transform: `translate(${dx * (family === 'charge' ? .29 : .2)}px,${dy * .22 - 8}px) scale(${family === 'charge' ? 1.16 : 1.08})`, offset: .52 },
      { transform: 'translate(0,0) scale(1)' },
    ], family === 'charge' ? 750 : 620, signal);
    const trail = family === 'charge' ? effect(root, victims[0] ?? user, move.type === 'fire' ? 'impact' : 'aura', color, signal, user) : Promise.resolve();
    await Promise.all([lunge, trail]);
    return;
  }

  if (!hitPoints.length) {
    await effect(root, user, 'aura', color, signal);
    return;
  }

  const animateTarget = async (destination: { x: number; y: number }, targetIndex: number) => {
    const dx = destination.x - origin.x, dy = destination.y - origin.y;
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    if (family === 'beam') {
      const beam = moveParticle(root, 'beam', color, { x: origin.x + dx / 2, y: origin.y + dy / 2 });
      beam.style.width = `${Math.max(90, Math.hypot(dx, dy))}px`;
      beam.style.setProperty('--beam-angle', `${angle}deg`);
      try { await tween(beam, [{ transform: `translate(-50%,-50%) rotate(${angle}deg) scaleX(0)`, opacity: .2 }, { transform: `translate(-50%,-50%) rotate(${angle}deg) scaleX(1)`, opacity: 1, offset: .45 }, { transform: `translate(-50%,-50%) rotate(${angle}deg) scaleX(1)`, opacity: 0 }], 430, signal); }
      finally { beam.remove(); }
      return;
    }
    if (family === 'slash') {
      const slash = moveParticle(root, 'slash', color, { x: destination.x, y: destination.y });
      slash.style.setProperty('--slash-angle', `${angle + 58 + targetIndex * 9}deg`);
      try { await tween(slash, [{ transform: `translate(-50%,-50%) rotate(${angle + 58}deg) scale(.1,.65)`, opacity: 0 }, { transform: `translate(-50%,-50%) rotate(${angle + 58}deg) scale(1.2,1)`, opacity: 1, offset: .36 }, { transform: `translate(-50%,-50%) rotate(${angle + 58}deg) scale(1.55,.35)`, opacity: 0 }], 330, signal); }
      finally { slash.remove(); }
      return;
    }
    const pieces = family === 'leaf' || family === 'ice' || family === 'poison' || family === 'flame' || family === 'water' || family === 'dragon' ? 3 : family === 'fairy' ? 4 : family === 'lightning' || family === 'shadow' ? 2 : 1;
    const flights = Array.from({ length: pieces }, async (_, index) => {
      const offset = (index - (pieces - 1) / 2) * 23;
      const start = { x: origin.x - Math.sin(angle * Math.PI / 180) * offset, y: origin.y + Math.cos(angle * Math.PI / 180) * offset };
      const node = moveParticle(root, family === 'wind' || family === 'sound' || family === 'psychic' ? 'pulse' : family, color, start, index ? 'move-vfx-trailing' : '');
      const delay = index * 85;
      try {
        if (delay) await scaledPause(root,delay,signal);
        await tween(node, [
          { transform: `translate(-50%,-50%) rotate(${angle}deg) scale(${family === 'water' ? .35 : .55})`, opacity: 0 },
          { transform: `translate(calc(-50% + ${dx * .48}px),calc(-50% + ${dy * .48}px)) rotate(${angle + 120}deg) scale(1)`, opacity: 1, offset: .5 },
          { transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) rotate(${angle + 260}deg) scale(.72)`, opacity: 0 },
        ], family === 'lightning' ? 460 : 650, signal);
      } finally { node.remove(); }
    });
    await Promise.all(flights);
    // A projectile reaching the target isn't proof of a hit. The damage event owns impact.
  };

  const visuals = victims.map((_, index) => animateTarget(hitPoints[index], index));
  if (family === 'sound' || family === 'wind' || family === 'psychic') {
    await Promise.all(visuals);
  } else {
    await Promise.all(visuals);
  }
}

async function transformReveal(root:HTMLElement,event:BattleEvent,user:Element|null,signal:AbortSignal) {
  if(!user)return;
  const kind=event.gimmick??'mega',at=point(user,root),color=kind==='mega'?'#bca0ff':kind==='dynamax'?'#ff478b':colors[event.type??'normal']??'#dcf8ff';
  const wash=moveParticle(root,'form-wash',color,{x:root.clientWidth/2,y:root.clientHeight/2},`wash-${kind}`);
  const rings=Array.from({length:kind==='tera'?12:kind==='dynamax'?5:8},(_,index)=>{
    const node=moveParticle(root,kind==='tera'?'tera-shard':kind==='dynamax'?'max-cloud':'mega-orbit',color,at);node.style.setProperty('--particle-index',String(index));return node;
  });
  root.dataset.gimmick=kind;
  try{await Promise.all([
    tween(wash,[{transform:'translate(-50%,-50%)',opacity:0},{opacity:.75,offset:.25},{opacity:.25,offset:.8},{opacity:0}],1450,signal),
    tween(user,[{filter:'brightness(0)',opacity:.5,transform:'scale(.68)'},{filter:'brightness(3)',opacity:1,transform:`scale(${kind==='dynamax'?1.16:1.08})`,offset:.55},{filter:'brightness(1)',opacity:1,transform:'scale(1)'}],1250,signal),
    tween(camera(root),kind==='dynamax'?[{transform:'scale(1.06)'},{transform:'scale(.97) translateY(4px)',offset:.55},{transform:'scale(1)'}]:[{transform:'scale(1)'},{transform:'scale(1.025)',offset:.55},{transform:'scale(1)'}],1450,signal),
    ...rings.map(async(node,index)=>{
      const angle=index/rings.length*Math.PI*2,radius=kind==='dynamax'?130:100;
      await tween(node,[{transform:`translate(-50%,-50%) rotate(${index*45}deg) scale(.1)`,opacity:0},{transform:`translate(calc(-50% + ${Math.cos(angle)*radius}px),calc(-50% + ${Math.sin(angle)*radius}px)) rotate(${index*45+150}deg) scale(1)`,opacity:1,offset:.6},{transform:`translate(calc(-50% + ${Math.cos(angle)*radius*1.7}px),calc(-50% + ${Math.sin(angle)*radius*1.7}px)) rotate(${index*45+230}deg) scale(.5)`,opacity:0}],1200+index*20,signal);
    }),
  ]);}finally{wash.remove();rings.forEach(node=>node.remove());delete root.dataset.gimmick;}
}

async function recallPokemon(root:HTMLElement,user:Element|null,signal:AbortSignal) {
  if(!user)return;
  root.dataset.motionPhase='recall';
  const at=point(user,root),friendly=!!user.closest('.actor-player'),home={x:root.clientWidth*(friendly?.12:.87),y:root.clientHeight*(friendly?.68:.24)};
  const ball=moveParticle(root,'recall-ball','#ff789c',home),ray=moveParticle(root,'recall-ray','#ff789c',{x:(home.x+at.x)/2,y:(home.y+at.y)/2});
  ray.style.width=`${Math.hypot(at.x-home.x,at.y-home.y)}px`;
  const angle=Math.atan2(at.y-home.y,at.x-home.x)*180/Math.PI;
  try{
    await Promise.all([
      tween(ray,[{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(.1)`,opacity:0},{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1)`,opacity:1,offset:.25},{opacity:0}],battleTiming.recall,signal),
      tween(user,[{transform:'scale(1)',opacity:1,filter:'brightness(1)'},{transform:'scale(.8)',filter:'brightness(2) sepia(1) saturate(5)',offset:.4},{transform:`translate(${home.x-at.x}px,${home.y-at.y}px) scale(.03)`,opacity:0}],battleTiming.recall,signal,'forwards'),
    ]);
    await tween(ball,[{transform:'translate(-50%,-50%) scale(1)',opacity:1},{transform:`translate(calc(-50% + ${friendly?-100:100}px),-50%) scale(.7)`,opacity:0}],240,signal);
  }finally{ball.remove();ray.remove();}
}

async function sendOutPokemon(root:HTMLElement,user:Element|null,signal:AbortSignal) {
  if(!user)return;
  root.dataset.motionPhase='throw';
  const at=point(user,root),friendly=!!user.closest('.actor-player'),start={x:root.clientWidth*(friendly?.09:.92),y:root.clientHeight*(friendly?.7:.2)},dx=at.x-start.x,dy=at.y-start.y;
  const ball=moveParticle(root,'sendout-ball','#eaffff',start);
  const hidden=user.animate?.([{opacity:0},{opacity:0}],{duration:450/(Number(root.dataset.playbackRate)||1),fill:'forwards'});
  try{
    await tween(ball,[{transform:'translate(-50%,-50%) rotate(0deg)',opacity:1},{transform:`translate(calc(-50% + ${dx*.5}px),calc(-50% + ${dy*.5-100}px)) rotate(360deg)`,offset:.5},{transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) rotate(720deg)`,opacity:1}],450,signal);
    if(signal.aborted)return;
    hidden?.cancel();ball.remove();root.dataset.motionPhase='release';
    await Promise.all([
      effect(root,user,'sendout-flash','#fff5c2',signal),
      tween(user,[{transform:'scale(.05) translateY(25px)',opacity:0,filter:'brightness(3)'},{transform:'scale(1.07) translateY(-12px)',opacity:1,filter:'brightness(1.5)',offset:.65},{transform:'scale(1)',opacity:1,filter:'brightness(1)'}],650,signal),
    ]);
    root.dataset.motionPhase='land';
    const ring=moveParticle(root,'landing-ring','#dff4ff',{x:at.x,y:at.y+50});
    try{await tween(ring,[{transform:'translate(-50%,-50%) scale(.25)',opacity:.8},{transform:'translate(-50%,-50%) scale(1.7)',opacity:0}],220,signal);}finally{ring.remove();}
  }finally{hidden?.cancel();ball.remove();}
}

export async function animateBattleEvent(root: HTMLElement | null, event: BattleEvent, signal: AbortSignal, reducedMotion: boolean): Promise<void> {
  if (!root || signal.aborted) return;
  // Friend snapshots are already swapped into the viewer's player/cpu perspective.
  const localSide='player';
  battleAudio.stopEffects();
  if(reducedMotion){battleAudio.play(event,localSide);return;}
  if(event.kind!=='move')battleAudio.play(event,localSide);
  root.dataset.motionPhase=event.kind==='damage'?'impact':'result';
  const actor = (uid?:string) => uid ? root.querySelector<HTMLElement>(`.scene-actor[data-uid="${uid}"] .sprite-art`) : null;
  const user=actor(event.actorUid), target=actor(event.targetUid);
  const color=colors[event.type ?? 'normal'] ?? colors.normal;
  const message=root.querySelector('.battle-message-box');
  switch(event.kind) {
    case 'gimmick-start':
      await effect(root,user,event.gimmick==='mega'?'mega-prism':event.gimmick==='dynamax'?'max-cloud':event.gimmick==='tera'?'tera-prism':'aura',event.gimmick==='dynamax'?'#ff478b':color,signal);
      await tween(user,[{filter:'brightness(1)'},{filter:'brightness(3) saturate(0)',transform:'scale(.85)'},{filter:'brightness(0)',transform:'scale(.9)'}],570,signal);
      break;
    case 'gimmick-transform':
      await transformReveal(root,event,user,signal);
      break;
    case 'gimmick-end': await tween(user,[{filter:'brightness(2.3)',opacity:.4},{filter:'brightness(1)',opacity:1}],400,signal);break;
    case 'move': {
      const targets=(event.targetUids ?? [event.targetUid]).map(uid=>actor(uid));
      root.dataset.moveId=event.moveId??'';
      try {
        root.dataset.motionPhase='announce';
        await scaledPause(root,battleTiming.announce,signal);
        root.dataset.motionPhase='prepare';
        const dx=(target&&user?point(target,root).x-point(user,root).x:80)>0?1:-1;
        const physical=event.category==='physical';
        await tween(user,physical?[{transform:'translate(0,0)'},{transform:`translate(${-dx*12}px,5px) rotate(${-dx*4}deg)`,offset:.65},{transform:'translate(0,0)'}]:[{filter:'brightness(1)',transform:'scale(1)'},{filter:'brightness(1.45)',transform:'translateY(-6px) scale(1.04)',offset:.7},{filter:'brightness(1)',transform:'scale(1)'}],battleTiming.prepare,signal);
        if(signal.aborted)return;
        root.dataset.motionPhase='cast';battleAudio.play(event,localSide);
        if(event.powered==='z') await effect(root,user,'zcharge',color,signal);
        const visuals=animateMove(root,event,user,targets,signal);
        if(event.powered) await Promise.all([visuals,effect(root,user,event.powered==='max'?'max-cloud':'aura',event.powered==='max'?'#ff478b':color,signal),tween(user,[{filter:'brightness(1)'},{filter:'brightness(2.8)'},{filter:'brightness(1)'}],450,signal)]);
        else await visuals;
      } finally { delete root.dataset.moveId;root.dataset.motionPhase='result'; }
      break;
    }
    case 'damage': {
      const tasks=[tween(target,[{transform:'translateX(0)',filter:'brightness(1)'},{transform:'translateX(-12px)',filter:'brightness(2)'},{transform:'translateX(10px)',opacity:.45},{transform:'translateX(-6px)',opacity:1},{transform:'translateX(0)',filter:'brightness(1)'}],battleTiming.impact,signal)];
      if (event.moveId) tasks.push(effect(root,target,'impact',color,signal,undefined,battleTiming.impact));
      await Promise.all(tasks);root.dataset.motionPhase='hp';await scaledPause(root,battleTiming.hpDuration,signal);break;
    }
    case 'switch-out': await recallPokemon(root,user,signal); break;
    case 'switch-in': await sendOutPokemon(root,user,signal); break;
    case 'faint': await tween(target,[{transform:'translateY(0)',opacity:1,filter:'brightness(1)'},{transform:'translateY(15px)',filter:'brightness(.6)',opacity:.7,offset:.5},{transform:'translateY(85px) scaleY(.4)',opacity:0}],battleTiming.faint,signal,'forwards'); break;
    case 'stat': await Promise.all([effect(root,target,'aura',(event.stages ?? 0)>0?'#ffe88b':'#acbbff',signal),tween(target,[{filter:'brightness(1)'},{filter:'brightness(1.6)'},{filter:'brightness(1)'}],450,signal)]); break;
    case 'protect': await effect(root,target ?? user,'shield','#b8f9ff',signal); break;
    case 'blocked': {
      const defended=Object.values(event.snapshot.sides).flatMap(side=>side.team).find(mon=>mon.uid===event.targetUid)?.protected;
      if (defended) await effect(root,target,'shield','#b8f9ff',signal);
      else await tween(message,[{opacity:.4},{opacity:1}],350,signal);
      break;
    }
    case 'heal': {
      await effect(root,target ?? user,'aura','#9fffbb',signal);
      break;
    }
    case 'status': await effect(root,target??user,event.status?`condition-${event.status}`:event.condition==='confusion'?'condition-confusion':'aura',color,signal);break;
    case 'ability': case 'item': await effect(root,target ?? user,'aura',color,signal); break;
    default: await tween(message,[{opacity:.45},{opacity:1,offset:.25},{opacity:1}],event.kind==='turn-end'?150:420,signal);
  }
}
