import {describe,expect,it} from 'vitest';
import {createSet} from '../team';
import {createBattle,runTurn,validateTeam} from './battle';
import {effectiveMovePower,stabMultiplier} from './calculations';
import {activateGimmick,previewMove} from './gimmicks';
import {moves} from '../data';
import type {TeamSet} from './types';

const set=(id:string,extra:Partial<TeamSet>={})=>({...createSet(id),...extra});
const use=(moveId:string)=>[{kind:'move' as const,slot:0,moveId}];

describe('advanced battle rules',()=>{
  it('creates a substitute at quarter HP cost, blocks ordinary damage and status, and clears on switch',()=>{
    const player=set('clefable',{moves:['substitute','moonblast','protect','gravity']});
    const foe=set('blastoise',{moves:['waterpulse','surf','protect','icebeam']});
    expect(validateTeam([player])).toEqual([]);
    const first=createBattle({format:'singles',playerTeam:[player,set('snorlax')],cpuTeam:[foe],seed:11});
    const made=runTurn(first,use('substitute'),use('protect'));
    const sub=made.sides.player.team[0];
    expect(sub.substituteHp).toBe(Math.floor(sub.maxHp/4));
    expect(sub.hp).toBe(first.sides.player.team[0].hp-Math.floor(sub.maxHp/4));
    const hit=runTurn(made,use('moonblast'),use('waterpulse'));
    expect(hit.sides.player.team[0].hp).toBe(sub.hp);
    const switched=runTurn(made,[{kind:'switch',slot:0,to:1}],use('protect'));
    expect(switched.sides.player.team[0].substituteHp).toBeUndefined();
  });

  it('lets sound moves bypass a substitute',()=>{
    const first=createBattle({format:'singles',playerTeam:[set('clefable')],cpuTeam:[set('snorlax',{moves:['hypervoice','protect','return','earthquake']})],seed:19});
    first.sides.player.team[0].substituteHp=100;
    const next=runTurn(first,use(first.sides.player.team[0].set.moves[0]),use('hypervoice'));
    expect(next.sides.player.team[0].hp).toBeLessThan(first.sides.player.team[0].hp);
    expect(next.sides.player.team[0].substituteHp).toBe(100);
  });

  it('forces a legal replacement and applies entry hazards',()=>{
    const first=createBattle({format:'singles',playerTeam:[set('tyranitar',{moves:['roar','crunch','stoneedge','protect']})],cpuTeam:[set('blastoise'),set('charizard')],seed:7});
    first.sides.cpu.hazards={stealthrock:1};
    const next=runTurn(first,use('roar'),use('waterpulse'));
    expect(next.sides.cpu.active[0]).toBe(1);
    expect(next.sides.cpu.team[1].hp).toBeLessThan(next.sides.cpu.team[1].maxHp);
    expect(next.log.some(entry=>entry.text.includes('스텔스록'))).toBe(true);
  });

  it('uses one-hit knockout accuracy and lets Sturdy block the hit even when damaged',()=>{
    const attacker=set('lapras',{moves:['sheercold','fissure','horndrill','protect']});
    expect(validateTeam([attacker])).toEqual([]);
    const base=createBattle({format:'singles',playerTeam:[attacker],cpuTeam:[set('donphan',{abilityId:'sturdy'})],seed:28});
    base.sides.player.team[0].set.abilityId='noGuard';
    base.sides.cpu.team[0].hp-=10;
    const blocked=runTurn(base,use('sheercold'),use('earthquake'));
    expect(blocked.sides.cpu.team[0].fainted).toBe(false);
    expect(blocked.log.some(entry=>entry.text.includes('일격기가 통하지 않았다'))).toBe(true);
    const plain=createBattle({format:'singles',playerTeam:[attacker],cpuTeam:[set('donphan',{abilityId:'sandveil'})],seed:28});
    plain.sides.player.team[0].set.abilityId='noGuard';
    const hit=runTurn(plain,use('sheercold'),use('earthquake'));
    expect(hit.sides.cpu.team[0].fainted).toBe(true);
  });

  it('resolves Doom Desire two turns later against the current occupant of the target slot',()=>{
    const jirachi=set('jirachi',{moves:['doomdesire','ironhead','protect','psychic']});
    expect(validateTeam([jirachi])).toEqual([]);
    const first=createBattle({format:'singles',playerTeam:[jirachi],cpuTeam:[set('blastoise'),set('charizard')],seed:22});
    const scheduled=runTurn(first,use('doomdesire'),use('protect'));
    expect(scheduled.delayedAttacks).toHaveLength(1);
    expect(scheduled.sides.cpu.team[0].hp).toBe(scheduled.sides.cpu.team[0].maxHp);
    const changed=runTurn(scheduled,use('protect'),[{kind:'switch',slot:0,to:1}]);
    const before=changed.sides.cpu.team[1].hp;
    const hit=runTurn(changed,use('protect'),use('protect'));
    expect(hit.sides.cpu.team[1].hp).toBeLessThan(before);
    expect(hit.delayedAttacks).toHaveLength(0);
    expect(hit.log.some(entry=>entry.text.includes('파멸의소원이 닥쳤다'))).toBe(true);
  });

  it('raises eligible low-power Tera moves to 60 and spends Stellar boosts once per type',()=>{
    const state=createBattle({format:'singles',playerTeam:[set('charizard',{itemId:'tera-stellar',moves:['terablast','flamethrower','protect','airslash']})],cpuTeam:[set('blastoise')],seed:5});
    expect(previewMove(state.sides.player.team[0],moves.terablast,'tera','stellar')).toMatchObject({type:'stellar',power:100});
    expect(activateGimmick(state,'player',0,'tera','flamethrower','stellar')).toBe(true);
    const mon=state.sides.player.team[0];
    expect(mon.types).toEqual(['fire','flying']);
    expect(effectiveMovePower(mon,moves.tackle)).toBe(60);
    expect(stabMultiplier(mon,moves.flamethrower)).toBe(2);
    expect(stabMultiplier(mon,moves.tackle)).toBe(1.2);
    expect(previewMove(mon,moves.terablast).type).toBe('stellar');
    mon.stellarBoostedTypes=['fire','normal'];
    expect(stabMultiplier(mon,moves.flamethrower)).toBe(1.5);
    expect(stabMultiplier(mon,moves.tackle)).toBe(1);
    expect(effectiveMovePower(mon,moves.tackle)).toBe(40);
  });
});
