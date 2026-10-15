import type { BattleEvent } from '../engine/types';
import { animateNode } from './hit-effects';

/** Short, bounded accents attached to confirmed hits, including spread targets. */
export async function playElementalImpact(root:HTMLElement,target:Element|null,event:BattleEvent,signal:AbortSignal):Promise<void>{
  if(!target||signal.aborted||!event.moveId||event.kind!=='damage'||event.beforeHp===undefined||event.afterHp===undefined||event.beforeHp<=event.afterHp)return;
  const type=event.type??'';
  if(!['fire','water','electric','ice','fighting','rock'].includes(type))return;
  const rect=target.getBoundingClientRect(),scene=root.getBoundingClientRect();
  const x=rect.left+rect.width/2-scene.left,y=rect.top+rect.height*.65-scene.top;
  const shadow=target.closest('.scene-actor')?.querySelector('.actor-shadow')?.getBoundingClientRect();
  const groundY=shadow?shadow.top+shadow.height/2-scene.top:rect.bottom-scene.top;
  const rate=Number(root.dataset.playbackRate)||1;
  const sunny=type==='fire'&&event.snapshot.weather?.id==='sun';
  const blizzard=type==='ice'&&event.snapshot.weather?.id==='snow';
  const scale=sunny?1.45:1;
  const duration=(event.critical?1000:700)/rate;
  const nodes:HTMLElement[]=[],tasks:Promise<void>[]=[];
  const spawn=(family:string,px=x,py=y)=>{
    const node=document.createElement('span');node.className=`battle-vfx elemental-accent accent-${family}${sunny?' accent-sun-boost':''}`;
    node.style.left=`${px}px`;node.style.top=`${py}px`;root.append(node);nodes.push(node);return node;
  };
  const burst=(node:HTMLElement,size=1)=>tasks.push(animateNode(node,[
    {transform:'translate(-50%,-50%) scale(.18)',opacity:0},
    {transform:`translate(-50%,-50%) scale(${size*.75})`,opacity:.9,offset:.22},
    {transform:`translate(-50%,-50%) scale(${size})`,opacity:.6,offset:.65},
    {transform:`translate(-50%,-60%) scale(${size*1.2})`,opacity:0},
  ],duration,signal));
  try{
    if(type==='fire'){
      burst(spawn('fire-bloom'),scale);
      burst(spawn('heat-wash',scene.width*.5,scene.height*.42),scale);
      for(let i=0;i<7;i++){
        const ember=spawn('ember',x+(i-3)*12*scale,y+18);
        tasks.push(animateNode(ember,[{opacity:0,transform:'translate(-50%,-50%) scale(.5)'},{opacity:1,offset:.15},{opacity:0,transform:`translate(${(i-3)*16*scale}px,${-70-(i%3)*25}px) scale(.15)`}],duration*(.75+i*.04),signal));
      }
    }else if(type==='water'){
      burst(spawn('water-splash'),1.2);
      for(let i=0;i<5;i++){
        const drop=spawn('lens-drop',scene.width*(.14+i*.18),scene.height*(.2+(i%3)*.16));
        drop.style.width=`${14+(i%3)*13}px`;drop.style.height=`${22+(i%3)*15}px`;
        tasks.push(animateNode(drop,[{opacity:0,transform:'translateY(-12px) scale(.6)'},{opacity:.7,transform:'translateY(0) scale(1)',offset:.2},{opacity:0,transform:'translateY(28px) scale(.85)'}],duration,signal));
      }
    }else if(type==='electric'){
      burst(spawn('electric-flash'),1.5);
      for(let i=0;i<3;i++){
        const bolt=spawn('electric-bolt',x+(i-1)*38,y-35);
        tasks.push(animateNode(bolt,[{opacity:0,transform:`translate(-50%,-50%) rotate(${(i-1)*25}deg) scaleY(.2)`},{opacity:1,offset:.15},{opacity:.15,offset:.33},{opacity:1,offset:.46},{opacity:0,transform:`translate(-50%,-50%) rotate(${(i-1)*25}deg) scaleY(1.2)`}],duration*.65,signal));
      }
    }else if(type==='ice'){
      burst(spawn('frost-bloom'),blizzard?1.7:1.1);
      for(let i=0;i<8;i++){
        const angle=i*Math.PI/4,shard=spawn('ice-crystal');
        const distance=(blizzard?100:65)+(i%2)*20;
        tasks.push(animateNode(shard,[{opacity:0,transform:`translate(-50%,-50%) rotate(${i*45}deg) scale(.1)`},{opacity:1,offset:.25},{opacity:0,transform:`translate(calc(-50% + ${Math.cos(angle)*distance}px),calc(-50% + ${Math.sin(angle)*distance}px)) rotate(${i*45+25}deg) scale(1.2)`}],duration,signal));
      }
    }else{
      burst(spawn('shockwave',x,groundY),1.5);
      burst(spawn('ground-crack',x,groundY),type==='rock'?1.4:1);
      for(let i=0;i<5;i++){
        const chip=spawn('rock-chip',x,groundY);
        tasks.push(animateNode(chip,[{opacity:0,transform:'translate(-50%,-50%) scale(.2)'},{opacity:1,transform:`translate(${(i-2)*20}px,${-24-(i%2)*22}px) rotate(${i*40}deg)`,offset:.45},{opacity:0,transform:`translate(${(i-2)*38}px,30px) rotate(${i*90}deg) scale(.5)`}],duration,signal));
      }
    }
    await Promise.all(tasks);
  }finally{nodes.forEach(node=>node.remove());}
}

/** A miss gets an evasion afterimage and air trails, without an impact flash. */
export async function playMissEffect(root:HTMLElement,target:Element|null,signal:AbortSignal):Promise<void>{
  if(!target||signal.aborted)return;
  const rect=target.getBoundingClientRect(),scene=root.getBoundingClientRect(),rate=Number(root.dataset.playbackRate)||1;
  const ghost=target.cloneNode(true) as HTMLElement;
  ghost.classList.add('battle-vfx','miss-afterimage');ghost.setAttribute('aria-hidden','true');
  target.parentElement?.append(ghost);
  const trails=Array.from({length:3},(_,i)=>{
    const node=document.createElement('span');node.className='battle-vfx miss-wind';node.style.left=`${rect.left+rect.width/2-scene.left}px`;node.style.top=`${rect.top+rect.height*(.3+i*.18)-scene.top}px`;root.append(node);return node;
  });
  try{await Promise.all([
    animateNode(target,[{transform:'translateX(0)'},{transform:'translateX(24px)',offset:.4},{transform:'translateX(0)'}],430/rate,signal),
    animateNode(ghost,[{opacity:.45,filter:'blur(1px) saturate(.25)',transform:'translateX(0)'},{opacity:0,filter:'blur(5px) saturate(0)',transform:'translateX(-24px)'}],500/rate,signal),
    ...trails.map((node,i)=>animateNode(node,[{opacity:0,transform:'translate(-90%,-50%) scaleX(.2)'},{opacity:.7,offset:.25},{opacity:0,transform:`translate(${30+i*12}px,-50%) scaleX(1.1)`}],450/rate,signal)),
  ]);}finally{ghost.remove();trails.forEach(node=>node.remove());}
}
