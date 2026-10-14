import { describe,expect,it } from 'vitest';
import { eventSoundKeys,typeSoundProfiles } from './audio';
import { soundFileKey } from './sound-pack';
import { createBattle } from '../engine/battle';
import { createSet } from '../team';
import type { BattleEvent } from '../engine/types';

describe('battle sound routing',()=>{
  it('gives each type a distinct synthesized voice and routes a dedicated file before its type fallback',()=>{
    expect(Object.keys(typeSoundProfiles)).toHaveLength(19);
    expect(new Set(Object.values(typeSoundProfiles).map(profile=>JSON.stringify(profile))).size).toBe(19);
    const snapshot=createBattle({format:'singles',playerTeam:[createSet('garchomp')],cpuTeam:[createSet('charizard')]});
    const event:BattleEvent={id:1,kind:'move',moveId:'earthquake',type:'ground',text:'지진',snapshot};
    expect(eventSoundKeys(event)).toEqual(['move-earthquake','type-ground']);
    expect(eventSoundKeys({...event,kind:'gimmick-transform',gimmick:'tera'})).toEqual(['gimmick-tera']);
    snapshot.winner='cpu';expect(eventSoundKeys({...event,kind:'result'},'cpu')).toEqual(['victory']);
  });
  it('accepts supported local audio keys and rejects unrelated files and wrong types',()=>{
    expect(soundFileKey('MOVE-Steelbeam.WAV')).toBe('move-steelbeam');
    expect(soundFileKey('pack/type-water.ogg')).toBe('type-water');
    expect(soundFileKey('low-hp.mp3')).toBe('low-hp');
    expect(soundFileKey('critical-hit.wav')).toBe('critical-hit');
    expect(soundFileKey('type-invalid.wav')).toBeUndefined();
    expect(soundFileKey('move-surf.png')).toBeUndefined();
    expect(soundFileKey('random.mp3')).toBeUndefined();
  });
});
