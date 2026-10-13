import { describe, expect, it, vi } from 'vitest';
import { playEvents } from './queue';
import { createBattle, runTurnWithEvents } from '../engine/battle';
import { createSet } from '../team';
import { spriteSources } from './sprites';

const events=()=>runTurnWithEvents(createBattle({format:'singles',playerTeam:[createSet('pikachu')],cpuTeam:[createSet('blastoise')],seed:3}),[{kind:'move',slot:0,moveId:'protect'}],[{kind:'move',slot:0,moveId:'protect'}]).events;
describe('presentation queue',()=>{
  it('does not present the second event until the first animation resolves',async()=>{
    const presented:number[]=[];let release!:()=>void;
    const frames=events();
    const playback=playEvents(frames,{present:event=>presented.push(event.id),animate:event=>event.id===0?new Promise<void>(resolve=>{release=resolve;}):Promise.resolve()},new AbortController().signal);
    expect(presented).toEqual([0]);await Promise.resolve();expect(presented).toEqual([0]);
    release();await playback;expect(presented).toEqual(frames.map(frame=>frame.id));
  });
  it('cancels future presentation and recovers a failed animation without rerunning battle logic',async()=>{
    const controller=new AbortController(),present=vi.fn();
    await playEvents(events(),{present,animate:async()=>{controller.abort();}},controller.signal);
    expect(present).toHaveBeenCalledTimes(1);
    const recover=vi.fn(),all=vi.fn();const frames=events();
    await playEvents(frames,{present:all,animate:async()=>{throw Error('renderer');},recover},new AbortController().signal);
    expect(all).toHaveBeenCalledTimes(frames.length);expect(recover).toHaveBeenCalledTimes(frames.length);
  });
  it('uses the matching Dex number, then an available front fallback; missing assets never request invented files',()=>{
    const library={'front/25':'/sprites/front/25.png','back/25':'/sprites/back/25.png','front/248':'/sprites/front/248.png'};
    expect(spriteSources('pikachu','back',library)).toEqual(['/sprites/back/25.png','/sprites/front/25.png']);
    expect(spriteSources('tyranitar','back',library)).toEqual(['/sprites/front/248.png']);
    expect(spriteSources('charizard','front',library)).toEqual([]);
  });
});
