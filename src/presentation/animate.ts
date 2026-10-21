import type { BattleEvent } from '../engine/types';
import { moveMotion } from './move-motions';
import { battleAudio } from './audio';
import { describeHit, playHitEffect } from './hit-effects';
import { animationPause, battleTiming } from './timing';
import { playElementalImpact, playMissEffect } from './elemental-effects';
import { moves } from '../data';
import { signatureVisuals } from './signature-catalog';
import { hasDedicatedAbilityMotion } from './ability-motions';

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
  delete root.dataset.criticalImpact;
  delete root.dataset.gimmick;
  delete root.dataset.abilityMotion;
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
  if(!user||!['earthquake','outrage','steelbeam','surf','makeitrain','lastrespects','geomancy'].includes(id??''))return false;
  const origin=point(user,root),color=colors[event.type??'normal']??colors.normal;
  const nodes:HTMLElement[]=[];
  const spawn=(family:string,at=origin)=>{const node=moveParticle(root,family,color,at);nodes.push(node);return node;};
  try{
    if(id==='geomancy'){
      const hues=['#f5c7ff','#a9f5ff','#ffe9a1'];
      const rays=hues.map((hue,index)=>{
        const ray=spawn('geomancy-ray',{x:origin.x+(index-1)*55,y:origin.y+95});
        ray.style.background=`linear-gradient(0deg,transparent,${hue},#ffffff)`;
        ray.style.boxShadow=`0 0 25px ${hue}`;
        ray.style.width='15px';ray.style.height='145px';ray.style.borderRadius='50%';
        return ray;
      });
      const halo=spawn('geomancy-halo');
      halo.style.width='190px';halo.style.height='190px';halo.style.border='5px solid #fff1bb';
      halo.style.borderRadius='50%';halo.style.boxShadow='0 0 35px #f5c7ff, inset 0 0 28px #a9f5ff';
      await Promise.all([
        ...rays.map((ray,index)=>tween(ray,[{transform:`translate(-50%,-50%) translateY(45px) rotate(${(index-1)*13}deg) scaleY(.2)`,opacity:0},{transform:`translate(-50%,-50%) translateY(-35px) rotate(${(index-1)*13}deg) scaleY(1.2)`,opacity:.9,offset:.48},{transform:`translate(-50%,-50%) translateY(-95px) rotate(${(index-1)*13}deg) scaleY(.5)`,opacity:0}],1000,signal)),
        tween(halo,[{transform:'translate(-50%,-50%) scale(.15) rotate(-40deg)',opacity:0},{transform:'translate(-50%,-50%) scale(1) rotate(30deg)',opacity:1,offset:.55},{transform:'translate(-50%,-50%) scale(1.45) rotate(100deg)',opacity:0}],1100,signal),
        tween(user,[{filter:'brightness(1) saturate(1)',transform:'scale(1)'},{filter:'brightness(2.3) saturate(1.6)',transform:'scale(1.1)',offset:.58},{filter:'brightness(1) saturate(1)',transform:'scale(1)'}],1100,signal),
      ]);
      return true;
    }
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
  const signatureMoves=['spectralthief','sunsteelstrike','moongeistbeam','photongeyser','coreenforcer','thousandarrows','thousandwaves','dragonascent','dracometeor','spacialrend','roaroftime','originpulse','precipiceblades','seedflare','fleurcannon','prismaticlaser'];
  if (!['thunderbolt', 'thunder', 'surf', 'hydropump', 'icebeam', 'fireblast', 'xscissor', 'closecombat', ...signatureMoves].includes(id ?? '') || !user || !victims.length) return false;
  const origin = point(user, root), color = colors[event.type ?? 'normal'];
  if(signatureMoves.includes(id??'')){
    const nodes:HTMLElement[]=[];
    const spawn=(part:string,at:{x:number;y:number})=>{const node=moveParticle(root,`sig-${id}-${part}`,color??colors.normal,at);nodes.push(node);return node;};
    root.dataset.signatureMove=id??'';
    try{
      await Promise.all(victims.map(async victim=>{
        const hit=point(victim,root),dx=hit.x-origin.x,dy=hit.y-origin.y,mid={x:origin.x+dx*.52,y:origin.y+dy*.52};
        const angle=Math.atan2(dy,dx)*180/Math.PI;
        if(id==='dragonascent'){
          const dive=spawn('dragon-dive',{x:origin.x+dx*.48,y:origin.y+dy*.38-150});
          const impact=spawn('dragon-impact',hit);
          await Promise.all([
            tween(user,[{transform:'translate(0,0) scale(1)'},{transform:`translate(${dx*.32}px,${dy*.22-115}px) scale(1.22)`,offset:.3},{transform:`translate(${dx*.54}px,${dy*.46}px) scale(1.12)`,offset:.78},{transform:'translate(0,0) scale(1)'}],880,signal),
            tween(dive,[{transform:`translate(-50%,-50%) rotate(${angle}deg) scale(.3)`,opacity:0},{transform:`translate(-50%,-50%) rotate(${angle}deg) scale(1.2)`,opacity:1,offset:.56},{transform:`translate(-50%,-50%) rotate(${angle+30}deg) scale(1.75)`,opacity:0}],850,signal),
            tween(impact,[{transform:'translate(-50%,-50%) scale(.1)',opacity:0},{transform:'translate(-50%,-50%) scale(1.55)',opacity:1,offset:.55},{transform:'translate(-50%,-50%) scale(2)',opacity:0}],650,signal),
            tween(camera(root),[{transform:'scale(1)'},{transform:'scale(1.045)',offset:.68},{transform:'scale(1)'}],850,signal),
          ]);
        }else if(id==='dracometeor'){
          const meteors=Array.from({length:4},(_,index)=>spawn('meteor',{x:hit.x+(index-1.5)*58,y:hit.y-245-Math.abs(index-1.5)*20}));
          await Promise.all(meteors.map(async(meteor,index)=>{
            await scaledPause(root,index*105,signal);
            await tween(meteor,[{transform:`translate(-50%,-50%) rotate(0deg) scale(.42)`,opacity:0},{transform:`translate(-50%,-50%) translate(${(index-1.5)*9}px,80px) rotate(125deg) scale(1.18)`,opacity:1,offset:.65},{transform:'translate(-50%,-50%) translateY(155px) rotate(250deg) scale(.68)',opacity:0}],760,signal);
          }));
          const crater=spawn('meteor-impact',{x:hit.x,y:hit.y+34});
          await Promise.all([tween(crater,[{transform:'translate(-50%,-50%) scale(.12)',opacity:0},{transform:'translate(-50%,-50%) scale(1.4)',opacity:1,offset:.38},{transform:'translate(-50%,-50%) scale(1.9)',opacity:0}],520,signal),tween(camera(root),[{transform:'translate(0,0)'},{transform:'translate(-8px,3px)',offset:.25},{transform:'translate(7px,-3px)',offset:.52},{transform:'translate(0,0)'}],620,signal)]);
        }else if(id==='spacialrend'){
          const rift=spawn('space-rift',mid),tear=spawn('space-tear',hit);rift.style.width=`${Math.max(150,Math.hypot(dx,dy)*.95)}px`;
          await Promise.all([
            tween(rift,[{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(.02)`,opacity:0},{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1)`,opacity:1,offset:.46},{transform:`translate(-50%,-50%) rotate(${angle+8}deg) scaleX(1.12)`,opacity:0}],760,signal),
            tween(tear,[{transform:'translate(-50%,-50%) rotate(20deg) scale(.2)',opacity:0},{transform:'translate(-50%,-50%) rotate(-24deg) scale(1.3)',opacity:1,offset:.5},{transform:'translate(-50%,-50%) rotate(-50deg) scale(1.8)',opacity:0}],720,signal),
            tween(camera(root),[{transform:'scaleX(1)'},{transform:'scaleX(1.035)',offset:.38},{transform:'scaleX(.985)',offset:.58},{transform:'scale(1)'}],760,signal),
          ]);
        }else if(id==='roaroftime'){
          const rings=Array.from({length:3},()=>spawn('time-ring',origin));
          await Promise.all(rings.map((ring,index)=>tween(ring,[{transform:'translate(-50%,-50%) scale(.06) rotate(0deg)',opacity:0},{transform:`translate(-50%,-50%) scale(${.55+index*.12}) rotate(${index%2?90:-90}deg)`,opacity:.9,offset:.48},{transform:'translate(-50%,-50%) scale(1.18) rotate(${index%2?180:-180}deg)',opacity:0}],550+index*90,signal)));
          const beam=spawn('time-beam',mid);beam.style.width=`${Math.max(140,Math.hypot(dx,dy)*1.1)}px`;
          await Promise.all([tween(beam,[{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(.01)`,opacity:0},{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1)`,opacity:1,offset:.34},{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1.08)`,opacity:0}],800,signal),tween(camera(root),[{transform:'scale(1)'},{transform:'scale(1.04)',offset:.55},{transform:'scale(1)'}],800,signal)]);
        }else if(id==='originpulse'){
          const pulses=Array.from({length:3},()=>spawn('origin-pulse',{x:origin.x+dx*.22,y:origin.y+dy*.22}));
          await Promise.all(pulses.map(async(pulse,index)=>{await scaledPause(root,index*115,signal);await tween(pulse,[{transform:`translate(-50%,-50%) rotate(${angle}deg) scale(.12)`,opacity:0},{transform:`translate(calc(-50% + ${dx*.56}px),calc(-50% + ${dy*.56}px)) rotate(${angle+90}deg) scale(1.15)`,opacity:1,offset:.55},{transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) rotate(${angle+180}deg) scale(1.65)`,opacity:0}],790,signal);}));
          await tween(camera(root),[{transform:'scale(1)'},{transform:'scale(1.025)',offset:.5},{transform:'scale(1)'}],700,signal);
        }else if(id==='precipiceblades'){
          const blades=Array.from({length:5},(_,index)=>spawn('ground-blade',{x:hit.x+(index-2)*35,y:hit.y+82}));
          await Promise.all(blades.map(async(blade,index)=>{await scaledPause(root,index*70,signal);await tween(blade,[{transform:'translate(-50%,-50%) translateY(70px) scaleY(.1)',opacity:0},{transform:'translate(-50%,-50%) translateY(-10px) scaleY(1.2)',opacity:1,offset:.68},{transform:'translate(-50%,-50%) translateY(-32px) scaleY(.65)',opacity:0}],650,signal);}));
          await tween(camera(root),[{transform:'translate(0,0)'},{transform:'translate(-7px,3px)',offset:.3},{transform:'translate(5px,-2px)',offset:.6},{transform:'translate(0,0)'}],600,signal);
        }else if(id==='seedflare'){
          const seed=spawn('seed-core',origin),burst=spawn('seed-burst',hit);
          await tween(seed,[{transform:'translate(-50%,-50%) scale(.12)',opacity:0},{transform:'translate(-50%,-50%) scale(1.15)',opacity:1}],430,signal);
          await Promise.all([tween(seed,[{transform:'translate(-50%,-50%) scale(1)',opacity:1},{transform:`translate(calc(-50% + ${dx*.55}px),calc(-50% + ${dy*.55}px)) scale(.3)`,opacity:0}],460,signal),tween(burst,[{transform:'translate(-50%,-50%) scale(.08) rotate(0deg)',opacity:0},{transform:'translate(-50%,-50%) scale(1.3) rotate(80deg)',opacity:1,offset:.42},{transform:'translate(-50%,-50%) scale(2) rotate(160deg)',opacity:0}],800,signal),tween(victim,[{filter:'brightness(1)'},{filter:'brightness(1.9) saturate(1.5)',offset:.38},{filter:'brightness(1)'}],580,signal)]);
        }else if(id==='fleurcannon'){
          const cannon=spawn('fleur-cannon',origin);await tween(cannon,[{transform:'translate(-50%,-50%) scale(.08) rotate(-35deg)',opacity:0},{transform:'translate(-50%,-50%) scale(1.15) rotate(0deg)',opacity:1}],520,signal);
          const beam=spawn('fleur-beam',mid);beam.style.width=`${Math.max(120,Math.hypot(dx,dy))}px`;
          await Promise.all([tween(beam,[{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(.01)`,opacity:0},{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1.08)`,opacity:1,offset:.36},{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1.15)`,opacity:0}],840,signal),tween(cannon,[{transform:'translate(-50%,-50%) scale(1)',opacity:1},{transform:'translate(-50%,-50%) scale(1.8)',opacity:0}],680,signal),tween(camera(root),[{transform:'scale(1)'},{transform:'scale(1.045)',offset:.48},{transform:'scale(1)'}],840,signal)]);
        }else if(id==='prismaticlaser'){
          const prism=spawn('prism-laser-charge',origin),beam=spawn('prism-laser-beam',mid);beam.style.width=`${Math.max(130,Math.hypot(dx,dy)*1.1)}px`;
          await tween(prism,[{transform:'translate(-50%,-50%) scale(.06) rotate(-90deg)',opacity:0},{transform:'translate(-50%,-50%) scale(1.08) rotate(0deg)',opacity:1}],500,signal);
          await Promise.all([tween(beam,[{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(.01)`,opacity:0},{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1.08)`,opacity:1,offset:.4},{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1.16)`,opacity:0}],850,signal),tween(prism,[{opacity:1},{opacity:0,transform:'translate(-50%,-50%) scale(1.7)'}],680,signal),tween(camera(root),[{transform:'scale(1)'},{transform:'scale(1.035)',offset:.55},{transform:'scale(1)'}],850,signal)]);
        }else if(id==='sunsteelstrike'){
          const orbit=spawn('charge',origin),slash=spawn('slash',mid);slash.style.width=`${Math.max(130,Math.hypot(dx,dy)*1.2)}px`;
          await Promise.all([
            tween(orbit,[{transform:'translate(-50%,-50%) scale(.1) rotate(0deg)',opacity:0},{transform:'translate(-50%,-50%) scale(1.1) rotate(140deg)',opacity:1,offset:.52},{transform:'translate(-50%,-50%) scale(1.35) rotate(250deg)',opacity:0}],600,signal),
            tween(user,[{transform:'translate(0,0) scale(1)'},{transform:`translate(${dx*.52}px,${dy*.4}px) scale(1.18)`,offset:.56},{transform:'translate(0,0) scale(1)'}],760,signal),
            tween(slash,[{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(.02)`,opacity:0},{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1)`,opacity:1,offset:.42},{transform:`translate(-50%,-50%) rotate(${angle+12}deg) scaleX(1.16)`,opacity:0}],760,signal),
            tween(camera(root),[{transform:'scale(1)'},{transform:'scale(1.04)',offset:.6},{transform:'scale(1)'}],760,signal),
          ]);
        }else if(id==='spectralthief'){
          const veil=spawn('veil',hit),tether=spawn('tether',mid);tether.style.width=`${Math.max(110,Math.hypot(dx,dy))}px`;
          await tween(veil,[{transform:'translate(-50%,-50%) scale(.1)',opacity:0},{transform:'translate(-50%,-50%) scale(1.45)',opacity:.9,offset:.5},{transform:'translate(-50%,-50%) scale(.85)',opacity:.55}],760,signal);
          await Promise.all([
            tween(tether,[{transform:`translate(-50%,-50%) rotate(${angle+180}deg) scaleX(.05)`,opacity:0},{transform:`translate(-50%,-50%) rotate(${angle+180}deg) scaleX(1)`,opacity:1,offset:.28},{transform:`translate(-50%,-50%) rotate(${angle+180}deg) scaleX(.08)`,opacity:0}],620,signal),
            tween(victim,[{filter:'brightness(1)'},{filter:'brightness(.45) saturate(.2)',transform:'scale(.94)',offset:.45},{filter:'brightness(1)',transform:'scale(1)'}],620,signal),
            tween(user,[{filter:'brightness(1)'},{filter:'brightness(2.4) saturate(1.6)',transform:'scale(1.1)',offset:.7},{filter:'brightness(1)',transform:'scale(1)'}],620,signal),
          ]);
        }else if(id==='moongeistbeam'||id==='photongeyser'||id==='coreenforcer'){
          const charge=spawn(id==='moongeistbeam'?'eclipse':id==='photongeyser'?'prism-charge':'dragon-charge',origin);
          await tween(charge,[{transform:'translate(-50%,-50%) scale(.08) rotate(-25deg)',opacity:0},{transform:'translate(-50%,-50%) scale(1.08) rotate(20deg)',opacity:1}],500,signal);
          const beams=Array.from({length:id==='coreenforcer'?2:1},(_,index)=>{
            const beam=spawn(id==='coreenforcer'?'dragon-beam':id==='photongeyser'?'prism-beam':'moon-beam',{x:mid.x,y:mid.y+(index?15:-15)});beam.style.width=`${Math.max(120,Math.hypot(dx,dy)*1.15)}px`;return beam;
          });
          const halo=spawn(id==='coreenforcer'?'suppression-ring':id==='moongeistbeam'?'eclipse-impact':'prism-impact',hit);
          await Promise.all([
            ...beams.map((beam,index)=>tween(beam,[{transform:`translate(-50%,-50%) rotate(${angle+(index?5:-5)}deg) scaleX(.01)`,opacity:0},{transform:`translate(-50%,-50%) rotate(${angle+(index?5:-5)}deg) scaleX(1)`,opacity:1,offset:.28},{transform:`translate(-50%,-50%) rotate(${angle+(index?5:-5)}deg) scaleX(1.08)`,opacity:.95,offset:.7},{opacity:0}],900,signal)),
            tween(halo,[{transform:'translate(-50%,-50%) scale(.1)',opacity:0},{transform:'translate(-50%,-50%) scale(1.25)',opacity:1,offset:.48},{transform:'translate(-50%,-50%) scale(1.8)',opacity:0}],920,signal),
            tween(camera(root),[{transform:'scale(1)'},{transform:'scale(1.035)',offset:.45},{transform:'scale(1)'}],920,signal),
            tween(charge,[{opacity:1,transform:'translate(-50%,-50%) scale(1)'},{opacity:0,transform:'translate(-50%,-50%) scale(1.8)'}],650,signal),
          ]);
        }else if(id==='thousandarrows'){
          const arrows=Array.from({length:5},(_,index)=>spawn('arrow',{x:hit.x+(index-2)*24,y:hit.y-175-Math.abs(index-2)*8}));
          await Promise.all(arrows.map(async(arrow,index)=>{
            await scaledPause(root,index*70,signal);
            await tween(arrow,[{transform:'translate(-50%,-50%) translateY(-65px) rotate(180deg) scale(.5)',opacity:0},{transform:'translate(-50%,-50%) translateY(0) rotate(180deg) scale(1.2)',opacity:1,offset:.72},{transform:'translate(-50%,-50%) translateY(22px) rotate(180deg) scale(.3)',opacity:0}],490,signal);
          }));
          const fissure=spawn('ground-impact',{x:hit.x,y:hit.y+45});
          await Promise.all([tween(fissure,[{transform:'translate(-50%,-50%) scale(.15,.5)',opacity:0},{transform:'translate(-50%,-50%) scale(1.5)',opacity:1,offset:.35},{transform:'translate(-50%,-50%) scale(1.8)',opacity:0}],520,signal),tween(camera(root),[{transform:'translate(0,0)'},{transform:'translate(-7px,3px)',offset:.22},{transform:'translate(6px,-2px)',offset:.5},{transform:'translate(0,0)'}],520,signal)]);
        }else{
          const wave=spawn('wave',{x:origin.x+dx*.35,y:hit.y+42}),cage=spawn('wave-ring',hit);wave.style.width=`${Math.max(190,Math.hypot(dx,dy)*.9)}px`;
          await Promise.all([
            tween(wave,[{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(.08)`,opacity:0},{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1.1)`,opacity:1,offset:.54},{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1.35)`,opacity:0}],880,signal),
            tween(cage,[{transform:'translate(-50%,-50%) scale(.2) rotate(0deg)',opacity:0},{transform:'translate(-50%,-50%) scale(1.2) rotate(95deg)',opacity:1,offset:.52},{transform:'translate(-50%,-50%) scale(1.6) rotate(180deg)',opacity:0}],880,signal),
            tween(camera(root),[{transform:'scale(1)'},{transform:'scale(1.025)',offset:.55},{transform:'scale(1)'}],880,signal),
          ]);
        }
      }));
      return true;
    }finally{nodes.forEach(node=>node.remove());delete root.dataset.signatureMove;}
  }
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

async function signatureShowcase(root:HTMLElement,event:BattleEvent,user:Element|null,victims:Element[],signal:AbortSignal):Promise<boolean>{
  const id=event.moveId,profile=id&&signatureVisuals[id];
  if(!id||!profile||!user)return false;
  const origin=point(user,root),hit=victims.length?point(victims[0],root):origin;
  const center={x:(origin.x+hit.x)/2,y:(origin.y+hit.y)/2};
  const color=colors[event.type??'normal']??colors.normal;
  const scene=document.createElement('div');
  scene.className='battle-vfx signature-scene';
  scene.dataset.motif=profile.motif;
  scene.dataset.signatureId=id;
  scene.style.setProperty('--sig-color',color);
  scene.style.setProperty('--sig-x',center.x+'px');
  scene.style.setProperty('--sig-y',center.y+'px');
  const focus=document.createElement('span');focus.className='signature-focus';
  const symbol=document.createElement('span');symbol.className='signature-symbol';symbol.textContent=profile.symbol;
  focus.append(symbol);
  const title=document.createElement('span');title.className='signature-title';title.textContent=moves[id]?.name??id;
  scene.append(focus,title);
  for(let index=0;index<8;index++){
    const particle=document.createElement('i');particle.className='signature-particle';
    particle.style.setProperty('--sig-angle',`${index*45}deg`);
    particle.style.setProperty('--sig-delay',`${index*-90}ms`);
    scene.append(particle);
  }
  const traces=victims.slice(0,2).map(victim=>{
    const end=point(victim,root),dx=end.x-center.x,dy=end.y-center.y;
    const trace=document.createElement('span');trace.className='signature-trace';
    trace.style.setProperty('--trace-x',center.x+'px');
    trace.style.setProperty('--trace-y',center.y+'px');
    trace.style.setProperty('--trace-length',Math.max(75,Math.hypot(dx,dy))+'px');
    trace.style.setProperty('--trace-angle',Math.atan2(dy,dx)+'rad');
    scene.append(trace);return trace;
  });
  root.append(scene);root.dataset.signatureMove=id;
  try{
    await Promise.all([
      tween(focus,[{transform:'scale(.08) rotate(-80deg)',opacity:0},{transform:'scale(1.18) rotate(12deg)',opacity:1,offset:.42},{transform:'scale(.92) rotate(0deg)',opacity:.95,offset:.73},{transform:'scale(1.55) rotate(55deg)',opacity:0}],940,signal),
      tween(title,[{transform:'translateY(15px) scale(.75)',opacity:0},{transform:'translateY(0) scale(1)',opacity:1,offset:.28},{opacity:1,offset:.72},{transform:'translateY(-12px) scale(1.08)',opacity:0}],940,signal),
      ...traces.map((trace,index)=>tween(trace,[{transform:'scaleX(.03)',opacity:0},{transform:'scaleX(1)',opacity:1,offset:.52+index*.07},{transform:'scaleX(1.2)',opacity:0}],820,signal)),
      tween(camera(root),[{transform:'scale(1)'},{transform:'scale(1.025)',offset:.58},{transform:'scale(1)'}],940,signal),
    ]);
    return true;
  }finally{scene.remove();delete root.dataset.signatureMove;}
}

const zMoveMotions:Record<string,string>={
  catastropika:'지그재그로 감기는 거대 전격 돌진',
  '10000000voltthunderbolt':'상공에 축전한 전류를 폭발시키는 초대형 낙뢰',
  clangoroussoulblaze:'용의 음파와 빛나는 비늘이 전장을 휩쓰는 범위 공격',
  extremeevoboost:'다섯 빛의 고리가 사용자를 감싸는 강화 연출',
  genesissupernova:'별의 핵을 압축해 날리는 초신성 폭발',
  guardianofalola:'알로라 수호의 빛기둥이 상대를 내리치는 연출',
  letssnuggleforever:'분홍빛 하트 에너지로 연속 돌진',
  lightthatburnsthesky:'울트라 광채를 모아 쏘는 거대 프리즘 광선',
  maliciousmoonsault:'붉은 초승달 궤적을 그리는 공중 몸통 공격',
  menacingmoonrazemaelstrom:'달빛과 그림자를 압축한 검은 광선',
  oceanicoperetta:'물방울 구체가 파도처럼 터지는 수중 폭발',
  pulverizingpancake:'지면을 울리는 거대한 낙하 충돌',
  searingsunrazesmash:'태양빛 검격 뒤에 불꽃 폭발이 번지는 연출',
  sinisterarrowraid:'어둠의 화살이 순차적으로 쏟아지는 연출',
  soulstealing7starstrike:'영혼의 잔상이 원을 그리며 몰아치는 연속 타격',
  splinteredstormshards:'바위 파편이 회전한 뒤 사방으로 터지는 연출',
  stokedsparksurfer:'전기 파도를 타고 전장을 가로지르는 돌진',
  nihillight:'녹색 광륜이 수렴해 전장을 가르는 니힐레이저',
};

async function signatureZMove(root:HTMLElement,event:BattleEvent,user:Element|null,victims:Element[],signal:AbortSignal):Promise<boolean>{
  const id=event.moveId??'';
  if(!zMoveMotions[id]||!user)return false;
  const origin=point(user,root),color=colors[event.type??'normal']??'#fff7d5';
  const hitPoints=(victims.length?victims:[user]).map(target=>point(target,root));
  const nodes:HTMLElement[]=[];
  const spawn=(suffix:string,at:{x:number;y:number})=>{const node=moveParticle(root,`z-${id}-${suffix}`,color,at);nodes.push(node);return node;};
  const signature=spawn('signature',origin);
  root.dataset.signatureMove=id;
  try{
    const chargeMs=id==='extremeevoboost'?740:500;
    await Promise.all([
      tween(signature,[{transform:'translate(-50%,-50%) scale(.08) rotate(-25deg)',opacity:0},{transform:'translate(-50%,-50%) scale(.72) rotate(0deg)',opacity:.75,offset:.48},{transform:'translate(-50%,-50%) scale(1.18) rotate(35deg)',opacity:1}],chargeMs,signal),
      tween(camera(root),[{transform:'scale(1)'},{transform:'scale(1.035)',offset:.55},{transform:'scale(1)'}],chargeMs+180,signal),
      ...(id==='extremeevoboost'?[tween(user,[{filter:'brightness(1)'},{filter:'brightness(2.2) saturate(1.5)',transform:'scale(1.1)'},{filter:'brightness(1)',transform:'scale(1)'}],chargeMs+180,signal)]:[]),
    ]);
    if(id==='extremeevoboost'){
      const rings=Array.from({length:5},()=>spawn('ring',{x:origin.x,y:origin.y}));
      await Promise.all(rings.map((ring,index)=>tween(ring,[{transform:`translate(-50%,-50%) rotate(${index*72}deg) scale(.1)`,opacity:0},{transform:`translate(-50%,-50%) rotate(${index*72+80}deg) scale(${1+index*.16})`,opacity:.9,offset:.5},{transform:`translate(-50%,-50%) rotate(${index*72+200}deg) scale(${1.7+index*.13})`,opacity:0}],640+index*45,signal)));
      return true;
    }
    const beams=['10000000voltthunderbolt','lightthatburnsthesky','menacingmoonrazemaelstrom','genesissupernova','guardianofalola'].includes(id);
    const slams=['catastropika','maliciousmoonsault','pulverizingpancake','searingsunrazesmash','stokedsparksurfer'].includes(id);
    await Promise.all(hitPoints.map(async(hit,index)=>{
      const dx=hit.x-origin.x,dy=hit.y-origin.y,angle=Math.atan2(dy,dx)*180/Math.PI;
      const impact=spawn('impact',{x:origin.x+dx*.53,y:origin.y+dy*.53});
      if(beams){
        impact.style.width=`${Math.max(120,Math.hypot(dx,dy)*1.25)}px`;
        await tween(impact,[{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(.01) scaleY(.45)`,opacity:0},{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1) scaleY(1.7)`,opacity:1,offset:.38},{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1.04) scaleY(.85)`,opacity:.85,offset:.72},{transform:`translate(-50%,-50%) rotate(${angle}deg) scaleX(1.2) scaleY(0)`,opacity:0}],900,signal);
      }else if(slams){
        await Promise.all([
          tween(user,[{transform:'translate(0,0) scale(1)'},{transform:`translate(${dx*.28}px,${dy*.23-42}px) scale(1.2)`,offset:.52},{transform:`translate(${dx*.48}px,${dy*.36+8}px) scale(.86)`},{transform:'translate(0,0) scale(1)'}],850,signal),
          tween(impact,[{transform:'translate(-50%,-50%) scale(.1) rotate(-30deg)',opacity:0},{transform:'translate(-50%,-50%) scale(1.6) rotate(20deg)',opacity:1,offset:.35},{transform:'translate(-50%,-50%) scale(2.1) rotate(0deg)',opacity:0}],850,signal),
        ]);
      }else{
        const count=id==='sinisterarrowraid'||id==='soulstealing7starstrike'?5:3;
        await Promise.all(Array.from({length:count},async(_,strike)=>{
          await scaledPause(root,strike*115,signal);
          await tween(impact,[{transform:`translate(calc(-50% + ${-dx*.45}px),calc(-50% + ${-dy*.45}px)) scale(.18) rotate(${angle+strike*25}deg)`,opacity:0},{transform:`translate(-50%,-50%) scale(${1.1+strike*.12}) rotate(${angle+70}deg)`,opacity:1,offset:.62},{transform:`translate(calc(-50% + ${dx*.42}px),calc(-50% + ${dy*.42}px)) scale(.25) rotate(${angle+145}deg)`,opacity:0}],510,signal);
        }));
      }
      const flash=spawn('flash',hit);
      await tween(flash,[{transform:'translate(-50%,-50%) scale(.2)',opacity:0},{transform:'translate(-50%,-50%) scale(1.5)',opacity:.85,offset:.25},{transform:'translate(-50%,-50%) scale(2.3)',opacity:0}],430,signal);
      if(index===0&&slams)await tween(camera(root),[{transform:'translate(0,0)'},{transform:'translate(-10px,4px)',offset:.18},{transform:'translate(9px,-3px)',offset:.4},{transform:'translate(-5px,2px)',offset:.65},{transform:'translate(0,0)'}],380,signal);
    }));
    return true;
  }finally{nodes.forEach(node=>node.remove());delete root.dataset.signatureMove;}
}

async function animateMove(root: HTMLElement, event: BattleEvent, user: Element | null, targets: (Element | null)[], signal: AbortSignal): Promise<void> {
  const move = { id: event.moveId ?? '', type: event.type ?? 'normal', category: event.category ?? 'physical' };
  const { family } = moveMotion(move);
  const origin = user ? point(user, root) : { x: root.clientWidth * 0.34, y: root.clientHeight * 0.5 };
  const victims = targets.filter((target): target is Element => !!target);
  const color = colors[move.type] ?? colors.normal;
  const hitPoints = victims.map(target => point(target, root));
  if(move.id==='judgment'&&hitPoints.length){
    const nodes:HTMLElement[]=[];
    const spawn=(family:string,at:{x:number;y:number},hue='#fff1a3')=>{const node=moveParticle(root,family,hue,at);nodes.push(node);return node;};
    const hit=hitPoints[0],sky={x:hit.x,y:Math.max(52,Math.min(hit.y-300,root.clientHeight*.14))};
    const orb=spawn('judgment-orb',sky),trail=spawn('judgment-trail',sky),seal=spawn('judgment-seal',sky),impact=spawn('judgment-impact',hit);
    const rays=Array.from({length:12},(_,index)=>{const ray=spawn('judgment-ray',sky,index%2?'#fff':'#ffe477');ray.style.setProperty('--ray-angle',`${index*30}deg`);return ray;});
    root.dataset.signatureMove='judgment';
    try{
      await Promise.all([
        tween(seal,[{transform:'translate(-50%,-50%) scale(.1) rotate(0deg)',opacity:0},{transform:'translate(-50%,-50%) scale(1.2) rotate(90deg)',opacity:1,offset:.36},{transform:'translate(-50%,-50%) scale(1.65) rotate(180deg)',opacity:.85},{transform:`translate(-50%,-50%) translateY(${hit.y-sky.y}px) scale(.2) rotate(300deg)`,opacity:0}],1500,signal),
        tween(orb,[{transform:'translate(-50%,-50%) scale(.15)',opacity:0},{transform:'translate(-50%,-50%) scale(1.15)',opacity:1,offset:.28},{transform:`translate(-50%,-50%) translateY(${hit.y-sky.y}px) scale(1.8)`,opacity:1,offset:.83},{transform:`translate(-50%,-50%) translateY(${hit.y-sky.y+28}px) scale(2.35)`,opacity:0}],1500,signal),
        tween(trail,[{transform:'translate(-50%,-50%) scale(.4,0)',opacity:0},{transform:'translate(-50%,-50%) scale(.8,.5)',opacity:.72,offset:.35},{transform:`translate(-50%,-50%) translateY(${(hit.y-sky.y)*.5}px) scale(1,${Math.max(1,(hit.y-sky.y)/110)})`,opacity:.9,offset:.84},{transform:`translate(-50%,-50%) translateY(${hit.y-sky.y}px) scale(1.4,${Math.max(1,(hit.y-sky.y)/90)})`,opacity:0}],1500,signal),
        ...rays.map((ray,index)=>tween(ray,[{transform:`translate(-50%,-50%) rotate(${index*30}deg) scaleX(.08)`,opacity:0},{transform:`translate(-50%,-50%) rotate(${index*30}deg) scaleX(1)`,opacity:.92,offset:.25},{transform:`translate(-50%,-50%) translateY(${hit.y-sky.y}px) rotate(${index*30}deg) scaleX(.25)`,opacity:0}],1460,signal)),
        tween(camera(root),[{transform:'scale(1)'},{transform:'scale(1.025)',offset:.25},{transform:'scale(1.01)',offset:.72},{transform:'scale(1)'}],1500,signal),
        (async()=>{await scaledPause(root,1100,signal);if(signal.aborted)return;await Promise.all([
          tween(impact,[{transform:'translate(-50%,-50%) scale(.12)',opacity:0},{transform:'translate(-50%,-50%) scale(1.05)',opacity:1,offset:.22},{transform:'translate(-50%,-50%) scale(2.7)',opacity:0}],650,signal),
          tween(camera(root),[{transform:'translate(0,0)'},{transform:'translate(-13px,5px)',offset:.18},{transform:'translate(12px,-4px)',offset:.4},{transform:'translate(-6px,2px)',offset:.68},{transform:'translate(0,0)'}],500,signal),
          tween(victims[0],[{filter:'brightness(1)'},{filter:'brightness(3) saturate(.2)',offset:.18},{filter:'brightness(1)',opacity:1}],520,signal),
        ]);})(),
      ]);
    }finally{nodes.forEach(node=>node.remove());delete root.dataset.signatureMove;}
    return;
  }
  if(await signatureZMove(root,event,user,victims,signal))return;
  if (await signatureMove(root, event, user, victims, signal)) return;
  if(await featuredMove(root,event,user,victims,signal))return;
  if (await signatureShowcase(root,event,user,victims,signal)) return;

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
  const transformed=event.snapshot.sides.player.team.concat(event.snapshot.sides.cpu.team).find(pokemon=>pokemon.uid===event.actorUid);
  const ultraBurst=transformed?.transformation?.formId==='necrozmaultra';
  const kind=ultraBurst?'ultra':event.gimmick??'mega',at=point(user,root),color=kind==='mega'?'#bca0ff':kind==='ultra'?'#fff29a':kind==='dynamax'?'#ff478b':colors[event.type??'normal']??'#dcf8ff';
  if(kind==='mega'){
    await megaReveal(root,user,at,signal);
    return;
  }
  const wash=moveParticle(root,'form-wash',color,{x:root.clientWidth/2,y:root.clientHeight/2},`wash-${kind}`);
  const rings=Array.from({length:kind==='tera'||kind==='ultra'?12:kind==='dynamax'?5:8},(_,index)=>{
    const node=moveParticle(root,kind==='tera'?'tera-shard':kind==='dynamax'?'max-cloud':kind==='ultra'?'ultra-orbit':'mega-orbit',color,at);node.style.setProperty('--particle-index',String(index));return node;
  });
  root.dataset.gimmick=kind;
  try{await Promise.all([
    tween(wash,[{transform:'translate(-50%,-50%)',opacity:0},{opacity:.75,offset:.25},{opacity:.25,offset:.8},{opacity:0}],1450,signal),
    tween(user,[{filter:'brightness(0)',opacity:.5,transform:'scale(.68)'},{filter:'brightness(3)',opacity:1,transform:`scale(${kind==='dynamax'?1.16:1.08})`,offset:.55},{filter:'brightness(1)',opacity:1,transform:'scale(1)'}],1250,signal),
    tween(camera(root),kind==='dynamax'?[{transform:'scale(1.06)'},{transform:'scale(.97) translateY(4px)',offset:.55},{transform:'scale(1)'}]:[{transform:'scale(1)'},{transform:'scale(1.025)',offset:.55},{transform:'scale(1)'}],1450,signal),
    ...rings.map(async(node,index)=>{
      const angle=index/rings.length*Math.PI*2,radius=kind==='dynamax'?130:kind==='ultra'?118:100;
      await tween(node,[{transform:`translate(-50%,-50%) rotate(${index*45}deg) scale(.1)`,opacity:0},{transform:`translate(calc(-50% + ${Math.cos(angle)*radius}px),calc(-50% + ${Math.sin(angle)*radius}px)) rotate(${index*45+150}deg) scale(1)`,opacity:1,offset:.6},{transform:`translate(calc(-50% + ${Math.cos(angle)*radius*1.7}px),calc(-50% + ${Math.sin(angle)*radius*1.7}px)) rotate(${index*45+230}deg) scale(.5)`,opacity:0}],1200+index*20,signal);
    }),
  ]);}finally{wash.remove();rings.forEach(node=>node.remove());delete root.dataset.gimmick;}
}

async function megaReveal(root:HTMLElement,user:Element,at:{x:number;y:number},signal:AbortSignal){
  const color='#cda5ff',center={x:root.clientWidth/2,y:root.clientHeight/2};
  const wash=moveParticle(root,'mega-wash',color,center);
  const seal=moveParticle(root,'mega-seal',color,at);
  const core=moveParticle(root,'mega-core',color,at);
  const shockwave=moveParticle(root,'mega-shockwave',color,at);
  const shards=Array.from({length:10},(_,index)=>{
    const node=moveParticle(root,'mega-shard',index%2?'#fff4cf':color,at);
    node.style.setProperty('--shard-angle',`${index*36}deg`);
    return node;
  });
  root.dataset.gimmick='mega';
  try{
    await Promise.all([
      tween(wash,[{opacity:0},{opacity:.68,offset:.32},{opacity:.48,offset:.65},{opacity:0}],1770,signal),
      tween(seal,[{transform:'translate(-50%,-50%) rotate(-90deg) scale(.12)',opacity:0},{transform:'translate(-50%,-50%) rotate(0deg) scale(1)',opacity:1,offset:.38},{transform:'translate(-50%,-50%) rotate(105deg) scale(.82)',opacity:.95,offset:.68},{transform:'translate(-50%,-50%) rotate(145deg) scale(1.8)',opacity:0}],1750,signal),
      tween(core,[{transform:'translate(-50%,-50%) scale(.12)',opacity:0},{transform:'translate(-50%,-50%) scale(.55)',opacity:.8,offset:.36},{transform:'translate(-50%,-50%) scale(1.2)',opacity:1,offset:.66},{transform:'translate(-50%,-50%) scale(2.4)',opacity:0}],1660,signal),
      tween(user,[{filter:'brightness(0) drop-shadow(0 0 0 #fff)',transform:'scale(.82)'},{filter:'brightness(0) drop-shadow(0 0 24px #cda5ff)',transform:'scale(.9)',offset:.35},{filter:'brightness(4) drop-shadow(0 0 28px #fff)',transform:'scale(1.13)',offset:.72},{filter:'brightness(1)',transform:'scale(1)'}],1770,signal),
      tween(camera(root),[{transform:'scale(1)'},{transform:'scale(1.05)',offset:.38},{transform:'scale(1.075)',offset:.7},{transform:'scale(1)'}],1770,signal),
      ...shards.map((shard,index)=>{
        const angle=index/10*Math.PI*2,radius=100+(index%2)*28,dx=Math.cos(angle)*radius,dy=Math.sin(angle)*radius;
        return tween(shard,[{transform:`translate(calc(-50% + ${dx*1.5}px),calc(-50% + ${dy*1.5}px)) rotate(${index*36}deg) scale(.3)`,opacity:0},{transform:`translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) rotate(${index*36+90}deg) scale(1)`,opacity:1,offset:.42},{transform:'translate(-50%,-50%) rotate(540deg) scale(.25)',opacity:0}],1250+index*35,signal);
      }),
      (async()=>{await scaledPause(root,1050,signal);if(!signal.aborted)await tween(shockwave,[{transform:'translate(-50%,-50%) scale(.15)',opacity:0},{transform:'translate(-50%,-50%) scale(.65)',opacity:1,offset:.2},{transform:'translate(-50%,-50%) scale(2.2)',opacity:0}],650,signal);})(),
    ]);
  }finally{
    wash.remove();seal.remove();core.remove();shockwave.remove();shards.forEach(shard=>shard.remove());
    delete root.dataset.gimmick;
  }
}

async function abilityFormReveal(root:HTMLElement,event:BattleEvent,user:Element|null,signal:AbortSignal){
  if(!user)return;
  const formId=event.formId??'',zygarde=formId==='zygardecomplete',color=zygarde?'#8dff78':'#62f4ff',origin=point(user,root);
  const wash=moveParticle(root,'ability-form-wash',color,{x:root.clientWidth/2,y:root.clientHeight/2});
  const rings=Array.from({length:zygarde?7:9},()=>moveParticle(root,'form-ripple',color,origin,zygarde?'ripple-zygarde':'ripple-terapagos'));
  root.dataset.abilityForm=formId;
  try{await Promise.all([
    tween(wash,[{opacity:0,filter:'brightness(1)'},{opacity:.82,filter:'brightness(2.2)',offset:.28},{opacity:.38,filter:'brightness(1.2)',offset:.68},{opacity:0}],1120,signal),
    tween(user,[{transform:'scale(.82)',filter:'brightness(1)'},{transform:'scale(1.2)',filter:`brightness(${zygarde?2.8:2.4}) saturate(1.5)`,offset:.35},{transform:'scale(1.08)',filter:'brightness(1.7)',offset:.68},{transform:'scale(1)',filter:'brightness(1)'}],1180,signal),
    tween(camera(root),[{transform:'translate(0,0) scale(1)'},{transform:'translate(-5px,2px) scale(1.025)',offset:.28},{transform:'translate(5px,-2px) scale(1.015)',offset:.55},{transform:'translate(0,0) scale(1)'}],1050,signal),
    ...rings.map((ring,index)=>{
      const angle=index/rings.length*Math.PI*2,radius=zygarde?82:94;
      return tween(ring,[{transform:`translate(-50%,-50%) rotate(${index*32}deg) scale(.08)`,opacity:0},{transform:`translate(calc(-50% + ${Math.cos(angle)*radius}px),calc(-50% + ${Math.sin(angle)*radius}px)) rotate(${index*90+180}deg) scale(1)`,opacity:1,offset:.58},{transform:`translate(calc(-50% + ${Math.cos(angle)*radius*1.55}px),calc(-50% + ${Math.sin(angle)*radius*1.55}px)) rotate(${index*120+280}deg) scale(.55)`,opacity:0}],880+index*24,signal);
    }),
  ]);}finally{wash.remove();rings.forEach(ring=>ring.remove());delete root.dataset.abilityForm;}
}

/** Intimidate gets a readable presence cue instead of the generic passive aura.
 * The ability is announced before its stat drop, so the red pressure wave makes
 * the source obvious and the opposing active sprites visibly recoil together.
 */
async function intimidateReveal(root:HTMLElement,user:Element|null,signal:AbortSignal){
  if(!user)return;
  const sourceActor=user.closest<HTMLElement>('.scene-actor');
  const opposingSide=sourceActor?.classList.contains('actor-player')?'actor-cpu':'actor-player';
  const victims=Array.from(root.querySelectorAll<HTMLElement>(`.scene-actor.${opposingSide} .sprite-art`));
  const origin=point(user,root);
  const waves=Array.from({length:3},(_,index)=>{
    const wave=moveParticle(root,'intimidate-wave','#ff594f',origin);
    wave.style.setProperty('--intimidate-index',String(index));
    return wave;
  });
  const glare=moveParticle(root,'intimidate-glare','#ffbaa0',origin);
  const flash=moveParticle(root,'intimidate-flash','#ff594f',{x:root.clientWidth/2,y:root.clientHeight/2});
  root.dataset.abilityMotion='intimidate';
  try{
    await Promise.all([
      tween(flash,[{transform:'translate(-50%,-50%) scale(.7)',opacity:0},{transform:'translate(-50%,-50%) scale(1.25)',opacity:.52,offset:.26},{transform:'translate(-50%,-50%) scale(1.05)',opacity:0}],760,signal),
      tween(glare,[{transform:'translate(-50%,-50%) scale(.18) rotate(-8deg)',opacity:0},{transform:'translate(-50%,-50%) scale(1.08) rotate(0deg)',opacity:1,offset:.3},{transform:'translate(-50%,-50%) scale(1.55) rotate(8deg)',opacity:0}],820,signal),
      tween(user,[{transform:'translate(0,0) scale(1)',filter:'brightness(1) saturate(1)'},{transform:'translateY(-7px) scale(1.06)',filter:'brightness(1.65) saturate(1.8) drop-shadow(0 0 14px #ff4d4d)',offset:.32},{transform:'translateY(2px) scale(.98)',filter:'brightness(1.15) saturate(1.35)',offset:.6},{transform:'translate(0,0) scale(1)',filter:'brightness(1) saturate(1)'}],900,signal),
      tween(camera(root),[{transform:'translate(0,0) scale(1)'},{transform:'translate(-5px,2px) scale(1.018)',offset:.32},{transform:'translate(5px,-2px) scale(1.012)',offset:.55},{transform:'translate(0,0) scale(1)'}],900,signal),
      ...waves.map((wave,index)=>tween(wave,[
        {transform:'translate(-50%,-50%) scale(.12)',opacity:0},
        {transform:'translate(-50%,-50%) scale(.62)',opacity:.92,offset:.22+index*.06},
        {transform:'translate(-50%,-50%) scale(1.42)',opacity:.54,offset:.62+index*.05},
        {transform:'translate(-50%,-50%) scale(2.1)',opacity:0},
      ],760+index*80,signal)),
      ...victims.map((victim,index)=>tween(victim,[
        {transform:'translate(0,0) scale(1)',filter:'brightness(1)'},
        {transform:`translate(${index%2?-9:9}px,4px) scale(.96)`,filter:'brightness(.72) sepia(.65) saturate(1.35)',offset:.35},
        {transform:`translate(${index%2?5:-5}px,-2px) scale(1.02)`,filter:'brightness(1.25)',offset:.62},
        {transform:'translate(0,0) scale(1)',filter:'brightness(1)'},
      ],760,signal)),
    ]);
  }finally{
    flash.remove();glare.remove();waves.forEach(wave=>wave.remove());
    delete root.dataset.abilityMotion;
  }
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
  if(reducedMotion||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){battleAudio.play(event,localSide);return;}
  if(event.kind!=='move')battleAudio.play(event,localSide);
  root.dataset.motionPhase=event.kind==='damage'?'impact':'result';
  const actor = (uid?:string) => uid ? root.querySelector<HTMLElement>(`.scene-actor[data-uid="${uid}"] .sprite-art`) : null;
  const user=actor(event.actorUid), target=actor(event.targetUid);
  const color=colors[event.type ?? 'normal'] ?? colors.normal;
  const message=root.querySelector('.battle-message-box');
  switch(event.kind) {
    case 'focus-prepare':
      await Promise.all([
        effect(root,user,'aura',colors.fighting,signal),
        tween(user,[{filter:'brightness(1)',transform:'scale(1)'},{filter:'brightness(1.7)',transform:'scale(1.08)',offset:.55},{filter:'brightness(1)',transform:'scale(1)'}],650,signal),
      ]);
      break;
    case 'gimmick-start':
      await effect(root,user,event.gimmick==='mega'?'mega-prism':event.gimmick==='dynamax'?'max-cloud':event.gimmick==='tera'?'tera-prism':'aura',event.gimmick==='dynamax'?'#ff478b':color,signal);
      await tween(user,[{filter:'brightness(1)'},{filter:'brightness(3) saturate(0)',transform:'scale(.85)'},{filter:'brightness(0)',transform:'scale(.9)'}],570,signal);
      break;
    case 'gimmick-transform':
      await transformReveal(root,event,user,signal);
      break;
    case 'form-change':
      await abilityFormReveal(root,event,user,signal);
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
      const ambient=event.critical?(root.querySelector('.battle-camera')?.getAnimations?.({subtree:true})??[]).filter(animation=>typeof CSSAnimation!=='undefined'&&animation instanceof CSSAnimation):[];
      const rates=ambient.map(animation=>animation.playbackRate);
      ambient.forEach(animation=>animation.updatePlaybackRate(.24));
      if(event.critical)root.dataset.criticalImpact='true';
      const tasks=[tween(target,[{transform:'translateX(0)',filter:'brightness(1)'},{transform:'translateX(-12px)',filter:'brightness(2)'},{transform:'translateX(10px)',opacity:.45},{transform:'translateX(-6px)',opacity:1},{transform:'translateX(0)',filter:'brightness(1)'}],battleTiming.impact*(event.critical?1.7:1),signal),playElementalImpact(root,target,event,signal)];
      if (event.moveId) tasks.push(effect(root,target,'impact',color,signal,undefined,battleTiming.impact));
      const hit=describeHit(event);if(hit)tasks.push(playHitEffect(root,target,hit,signal));
      try{await Promise.all(tasks);}finally{ambient.forEach((animation,index)=>animation.updatePlaybackRate(rates[index]));delete root.dataset.criticalImpact;}
      root.dataset.motionPhase='hp';await scaledPause(root,battleTiming.hpDuration,signal);break;
    }
    case 'miss': await playMissEffect(root,target??actor(event.targetUids?.[0]),signal);break;
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
    case 'ability':
      if(hasDedicatedAbilityMotion(event.sourceId)) await intimidateReveal(root,user,signal);
      else await effect(root,target ?? user,'aura',color,signal);
      break;
    case 'item': await effect(root,target ?? user,'aura',color,signal); break;
    default: await tween(message,[{opacity:.45},{opacity:1,offset:.25},{opacity:1}],event.kind==='turn-end'?150:420,signal);
  }
}
