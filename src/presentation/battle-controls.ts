import { useEffect, useRef } from 'react';
import { battleAudio } from './audio';

/** Uses the same real buttons for mouse, keyboard and standard gamepads. */
export function useBattleControls(menu: string, locked: boolean, back: () => void, closeLog: () => void) {
  const callbacks=useRef({back,closeLog});callbacks.current={back,closeLog};
  const padState=useRef({pressed:new Set<string>(),axisHeld:false});
  useEffect(() => {
    const choices=()=>Array.from(document.querySelectorAll<HTMLButtonElement>('.battle-action-box .root-actions>button,.battle-action-box .move-actions>button:not(.action-back),.battle-action-box .party-actions>button:not(.action-back),.battle-action-box .target-actions>button:not(.action-back)'));
    function key(event: KeyboardEvent) {
      if((event.target as HTMLElement)?.matches('input,select,textarea')||event.altKey||event.ctrlKey||event.metaKey)return;
      if(event.key==='Escape'){event.preventDefault();callbacks.current.closeLog();if(!locked)callbacks.current.back();return;}
      if(locked)return;
      const all=choices(),buttons=all.filter(button=>!button.matches(':disabled'));if(!buttons.length)return;
      if(/^[1-6]$/.test(event.key)){const button=all[Number(event.key)-1];if(button&&!button.matches(':disabled')){event.preventDefault();button.click();}return;}
      if(event.key===' '||event.key==='Enter') {
        if(document.activeElement?.tagName==='BUTTON')return;
        event.preventDefault();(document.querySelector<HTMLButtonElement>('.action-footer .game-choice-confirm:not(:disabled)')??buttons[0]).click();return;
      }
      const direction={ArrowRight:1,ArrowLeft:-1,ArrowDown:menu==='moves'&&getComputedStyle(buttons[0].parentElement!).gridTemplateColumns.split(' ').length===2?2:1,ArrowUp:menu==='moves'&&getComputedStyle(buttons[0].parentElement!).gridTemplateColumns.split(' ').length===2?-2:-1}[event.key];
      if(direction!==undefined){event.preventDefault();const current=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[current<0?0:(current+direction+buttons.length)%buttons.length].focus({preventScroll:true});battleAudio.cursor();}
    }
    window.addEventListener('keydown',key);
    let frame=0;
    const poll=()=>{
      const pad=navigator.getGamepads?.().find(pad=>pad?.mapping==='standard');
      const pressed=new Set<string>();
      if(pad) {
        for(const [index,name] of [[0,'Enter'],[1,'Escape'],[12,'ArrowUp'],[13,'ArrowDown'],[14,'ArrowLeft'],[15,'ArrowRight']] as const)if(pad.buttons[index]?.pressed)pressed.add(name);
        const [x,y]=pad.axes,axis=Math.abs(x??0)>.55||Math.abs(y??0)>.55;
        if(axis&&!padState.current.axisHeld)pressed.add(Math.abs(x)>Math.abs(y)?x>0?'ArrowRight':'ArrowLeft':y>0?'ArrowDown':'ArrowUp');padState.current.axisHeld=axis;
      }
      for(const name of pressed)if(!padState.current.pressed.has(name)) {
        if(name==='Enter'&&document.activeElement instanceof HTMLButtonElement&&!locked)document.activeElement.click();
        else key(new KeyboardEvent('keydown',{key:name}));
      }
      padState.current.pressed=pressed;frame=requestAnimationFrame(poll);
    };
    if(typeof navigator.getGamepads==='function')frame=requestAnimationFrame(poll);
    return ()=>{window.removeEventListener('keydown',key);cancelAnimationFrame(frame);};
  },[menu,locked]);
}
