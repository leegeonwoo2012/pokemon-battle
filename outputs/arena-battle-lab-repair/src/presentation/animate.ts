import type { BattleEvent } from '../engine/types';

const colors: Record<string, string> = { fire:'#ff8550',water:'#77d5ff',electric:'#fff473',grass:'#93ee86',ice:'#c0f7ff',fighting:'#ffc18d',poison:'#d3a1ff',ground:'#e4c994',flying:'#d9f2ff',psychic:'#ffa4d4',bug:'#c6ec89',rock:'#ddcb9c',ghost:'#b99cff',dragon:'#b4b8ff',dark:'#8d99b9',steel:'#d4eaff',fairy:'#ffc6ed',normal:'#fff9d6' };

async function tween(element: Element | null, frames: Keyframe[], duration: number, signal: AbortSignal, fill: FillMode = 'none'): Promise<void> {
  if (!element?.animate || signal.aborted) return;
  const animation = element.animate(frames, { duration, easing:'ease-in-out', fill });
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
  const rect=element.getBoundingClientRect(), parent=root.getBoundingClientRect();
  return { x:rect.left+rect.width/2-parent.left, y:rect.top+rect.height/2-parent.top };
}

async function effect(root: HTMLElement, target: Element | null, kind: string, color: string, signal: AbortSignal, from?: Element | null) {
  if (!target) return;
  const end=point(target,root), start=from ? point(from,root) : end;
  const node=document.createElement('span');
  node.className=`battle-vfx vfx-${kind}`;
  node.style.setProperty('--vfx-color',color);
  node.style.left=`${start.x}px`;node.style.top=`${start.y}px`;
  root.append(node);
  try {
    await tween(node,kind==='projectile' ? [{transform:'translate(-50%,-50%) scale(.4)',opacity:0},{opacity:1,offset:.15},{transform:`translate(calc(-50% + ${end.x-start.x}px), calc(-50% + ${end.y-start.y}px)) scale(1.3)`,opacity:1}] : [{transform:'translate(-50%,-50%) scale(.35)',opacity:0},{opacity:1,offset:.3},{transform:'translate(-50%,-60%) scale(1.5)',opacity:0}],kind==='projectile'?480:500,signal);
  } finally { node.remove(); }
}

export async function animateBattleEvent(root: HTMLElement | null, event: BattleEvent, signal: AbortSignal, reducedMotion: boolean): Promise<void> {
  if (!root || reducedMotion || signal.aborted) return;
  const actor = (uid?:string) => uid ? root.querySelector<HTMLElement>(`.scene-actor[data-uid="${uid}"] .sprite-art`) : null;
  const user=actor(event.actorUid), target=actor(event.targetUid);
  const color=colors[event.type ?? 'normal'] ?? colors.normal;
  const message=root.querySelector('.battle-message-box p');
  switch(event.kind) {
    case 'move': {
      if (event.category==='physical' && user && target) {
        const a=point(user,root), b=point(target,root);
        await tween(user,[{transform:'translate(0,0)'},{transform:`translate(${(b.x-a.x)*.24}px,${(b.y-a.y)*.24}px) scale(1.08)`,offset:.5},{transform:'translate(0,0)'}],440,signal);
      } else if (event.category==='special') {
        await Promise.all((event.targetUids ?? [event.targetUid]).map(uid => effect(root,actor(uid),'projectile',color,signal,user)));
      } else await tween(user,[{filter:'brightness(1)'},{filter:'brightness(1.7)',transform:'translateY(-8px)'},{filter:'brightness(1)',transform:'translateY(0)'}],400,signal);
      break;
    }
    case 'damage': {
      const hp=root.querySelector(`[data-status-uid="${event.targetUid}"] .scene-hp>span`);
      const mon=Object.values(event.snapshot.sides).flatMap(side=>side.team).find(p=>p.uid===event.targetUid);
      const tasks=[tween(target,[{transform:'translateX(0)',filter:'brightness(1)'},{transform:'translateX(-10px)',filter:'brightness(2)'},{transform:'translateX(10px)',opacity:.4},{transform:'translateX(-6px)',opacity:1},{transform:'translateX(0)',filter:'brightness(1)'}],420,signal)];
      if (mon && hp) tasks.push(tween(hp,[{width:`${(event.beforeHp ?? mon.hp)/mon.maxHp*100}%`},{width:`${mon.hp/mon.maxHp*100}%`}],480,signal));
      if (event.moveId) tasks.push(effect(root,target,'impact',color,signal));
      await Promise.all(tasks); break;
    }
    case 'switch-out': await tween(user,[{transform:'scale(1)',opacity:1},{transform:'scale(.05)',opacity:0}],400,signal,'forwards'); break;
    case 'switch-in': await tween(user,[{transform:'scale(.05) translateY(35px)',opacity:0},{transform:'scale(1.12)',opacity:1,offset:.75},{transform:'scale(1)',opacity:1}],500,signal); break;
    case 'faint': await tween(target,[{transform:'translateY(0)',opacity:1},{transform:'translateY(70px) scale(.6)',opacity:0}],480,signal,'forwards'); break;
    case 'stat': await Promise.all([effect(root,target,'aura',(event.stages ?? 0)>0?'#ffe88b':'#acbbff',signal),tween(target,[{filter:'brightness(1)'},{filter:'brightness(1.6)'},{filter:'brightness(1)'}],450,signal)]); break;
    case 'protect': await effect(root,target ?? user,'shield','#b8f9ff',signal); break;
    case 'blocked': {
      const defended=Object.values(event.snapshot.sides).flatMap(side=>side.team).find(mon=>mon.uid===event.targetUid)?.protected;
      if (defended) await effect(root,target,'shield','#b8f9ff',signal);
      else await tween(message,[{opacity:.4},{opacity:1}],350,signal);
      break;
    }
    case 'heal': {
      const hp=root.querySelector(`[data-status-uid="${event.targetUid}"] .scene-hp>span`);
      const mon=Object.values(event.snapshot.sides).flatMap(side=>side.team).find(p=>p.uid===event.targetUid);
      await Promise.all([effect(root,target ?? user,'aura','#9fffbb',signal),
        ...(mon && hp ? [tween(hp,[{width:`${(event.beforeHp ?? mon.hp)/mon.maxHp*100}%`},{width:`${mon.hp/mon.maxHp*100}%`}],480,signal)] : [])]);
      break;
    }
    case 'status': case 'ability': case 'item': await effect(root,target ?? user,'aura',color,signal); break;
    default: await tween(message,[{opacity:.45},{opacity:1,offset:.25},{opacity:1}],event.kind==='turn-end'?150:420,signal);
  }
}
