import { describe, expect, it, vi } from 'vitest';
import { playEvents, playbackDuration, readableFrameDuration } from './queue';
import { createBattle, runTurnWithEvents } from '../engine/battle';
import { createSet } from '../team';
import { spriteSources } from './sprites';

const events=()=>runTurnWithEvents(createBattle({format:'singles',playerTeam:[createSet('raichu')],cpuTeam:[createSet('blastoise')],seed:3}),[{kind:'move',slot:0,moveId:'protect'}],[{kind:'move',slot:0,moveId:'protect'}]).events;
describe('presentation queue',()=>{
  it('preserves readable messages with reduced motion and scales both playback speeds',()=>{
    const frame={...events()[0],kind:'move' as const};
    expect(playbackDuration(frame,true,1)).toBe(700);
    expect(playbackDuration(frame,false,1.5)).toBe(readableFrameDuration(frame)/1.5);
    expect(playbackDuration(frame,false,.75)).toBeGreaterThan(readableFrameDuration(frame));
  });
  it('holds named moves and transformation reveals longer than routine turn messages',()=>{
    const frame=events()[0];
    expect(readableFrameDuration({...frame,kind:'move'})).toBeGreaterThan(readableFrameDuration({...frame,kind:'damage'}));
    expect(readableFrameDuration({...frame,kind:'gimmick-transform'})).toBeGreaterThan(readableFrameDuration({...frame,kind:'move'}));
    expect(readableFrameDuration({...frame,kind:'turn-end'})).toBeLessThan(readableFrameDuration({...frame,kind:'damage'}));
  });
  it('does not present the second event until the first animation resolves',async()=>{
    const presented:number[]=[];let release!:()=>void;
    const frames=events();
    const playback=playEvents(frames,{present:event=>presented.push(event.id),animate:event=>event.id===0?new Promise<void>(resolve=>{release=resolve;}):Promise.resolve(),minDurationMs:()=>0},new AbortController().signal);
    expect(presented).toEqual([0]);await Promise.resolve();expect(presented).toEqual([0]);
    release();await playback;expect(presented).toEqual(frames.map(frame=>frame.id));
  });
  it('keeps a completed frame visible for its reading time',async()=>{
    vi.useFakeTimers();
    try {
      const presented:number[]=[];
      const playback=playEvents(events().slice(0,2),{present:event=>presented.push(event.id),animate:async()=>{},minDurationMs:()=>1000},new AbortController().signal);
      expect(presented).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(900);
      expect(presented).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(200);
      expect(presented).toHaveLength(2);
      await vi.runAllTimersAsync();
      await playback;
    } finally { vi.useRealTimers(); }
  });
  it('cancels future presentation and recovers a failed animation without rerunning battle logic',async()=>{
    const controller=new AbortController(),present=vi.fn();
    await playEvents(events(),{present,animate:async()=>{controller.abort();},minDurationMs:()=>0},controller.signal);
    expect(present).toHaveBeenCalledTimes(1);
    const recover=vi.fn(),all=vi.fn();const frames=events();
    await playEvents(frames,{present:all,animate:async()=>{throw Error('renderer');},recover,minDurationMs:()=>0},new AbortController().signal);
    expect(all).toHaveBeenCalledTimes(frames.length);expect(recover).toHaveBeenCalledTimes(frames.length);
  });
  it('uses the matching Dex number, then an available front fallback; missing assets never request invented files',()=>{
    const library={'front/26':'/sprites/front/26.png','back/26':'/sprites/back/26.png','front/248':'/sprites/front/248.png'};
    expect(spriteSources('raichu','back',library)).toEqual(['/sprites/back/26.png','/sprites/front/26.png']);
    expect(spriteSources('tyranitar','back',library)).toEqual(['/sprites/front/248.png']);
    expect(spriteSources('charizard','front',library)).toEqual([]);
  });
});
