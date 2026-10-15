import {describe,expect,it} from 'vitest';
import {createBattle} from '../engine/battle';
import {createSet} from '../team';
import type {BattleEvent} from '../engine/types';
import {describeHit} from './hit-effects';
import {eventSoundKeys} from './audio';

const state=createBattle({format:'singles',playerTeam:[createSet('raichu')],cpuTeam:[createSet('blastoise')]});
const damage:BattleEvent={id:0,kind:'damage',text:'피해',targetUid:'cpu-0',beforeHp:100,afterHp:40,snapshot:state};

describe('hit feedback from real damage metadata',()=>{
  it('combines a critical weak-point hit into a strong camera cue and two popups',()=>{
    const event={...damage,critical:true,effectiveness:4};
    expect(describeHit(event)).toMatchObject({critical:true,effectiveness:'super',shake:'strong',flash:'gold'});
    expect(describeHit(event)?.popups.map(popup=>popup.text)).toEqual(['급소에 맞았다!','효과가 굉장했다!']);
    expect(eventSoundKeys(event)).toEqual(['critical-hit','super-effective','damage']);
  });
  it('uses a blue muted cue only for a resisted hit',()=>{
    expect(describeHit({...damage,effectiveness:.5})).toMatchObject({effectiveness:'resisted',shake:'none',flash:'blue'});
    expect(eventSoundKeys({...damage,effectiveness:.5})).toEqual(['resisted-hit','damage']);
  });
  it('does not play a hit cue for immunity or a healing frame',()=>{
    expect(describeHit({...damage,afterHp:100,effectiveness:0})).toBeNull();
    expect(describeHit({...damage,kind:'heal'})).toBeNull();
  });
  it('scales neutral camera impact with move power without shaking for residual damage',()=>{
    const weak=describeHit({...damage,moveId:'tackle'});
    const medium=describeHit({...damage,moveId:'flamethrower'});
    const strong=describeHit({...damage,moveId:'fireblast'});
    const strongest=describeHit({...damage,moveId:'hyperbeam'});
    expect(weak?.shake).toBe('none');
    expect(medium?.amplitude).toBeGreaterThan(weak?.amplitude??0);
    expect(strong?.amplitude).toBeGreaterThan(medium?.amplitude??0);
    expect(strongest?.shake).toBe('strong');
    expect(describeHit(damage)?.amplitude).toBe(0);
  });
});
