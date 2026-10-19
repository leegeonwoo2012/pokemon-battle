import {describe,expect,it} from 'vitest';
import {createSet} from '../team';
import {moves} from '../data';
import {createBattle,runTurn,validateTeam} from './battle';
import {getModifiedStat} from './calculations';
import {applyStatus} from './effects';
import {moveUnavailableReason} from './choices';
import type {TeamSet} from './types';

const set=(id:string,changes:Partial<TeamSet>={}):TeamSet=>({...createSet(id),...changes});
const use=(moveId:string)=>[{kind:'move' as const,slot:0,moveId}];
const guard=()=>use('protect');

describe('expanded roster effects',()=>{
  it('makes signature moves legal for their owners and spends one PP for Population Bomb',()=>{
    const mouse=set('maushold',{moves:['populationbomb','hypervoice','protect','encore']});
    expect(validateTeam([mouse])).toEqual([]);
    expect(validateTeam([set('tinkaton',{moves:['gigatonhammer','rockslide','protect','encore']})])).toEqual([]);
    expect(validateTeam([set('garganacl',{moves:['saltcure','rockslide','protect','stealthrock']})])).toEqual([]);
    const first=createBattle({format:'singles',playerTeam:[mouse],cpuTeam:[set('snorlax')],seed:9});
    const next=runTurn(first,use('populationbomb'),use('return'));
    expect(next.sides.player.team[0].pp.populationbomb).toBe(moves.populationbomb.pp-1);
    expect(next.log.some(entry=>entry.text.includes('번 맞았다'))).toBe(true);
    expect(next.sides.cpu.team[0].hp).toBeLessThan(first.sides.cpu.team[0].hp);
  });

  it('blocks consecutive Gigaton Hammer without consuming a second PP',()=>{
    const tinkaton=set('tinkaton',{moves:['gigatonhammer','rockslide','protect','encore']});
    const first=createBattle({format:'singles',playerTeam:[tinkaton],cpuTeam:[set('blissey')],seed:12});
    const one=runTurn(first,use('gigatonhammer'),guard());
    expect(moveUnavailableReason(one.sides.player.team[0],'gigatonhammer')).toContain('연속');
    const two=runTurn(one,use('gigatonhammer'),guard());
    expect(two.sides.player.team[0].pp.gigatonhammer).toBe(moves.gigatonhammer.pp-1);
    expect(two.log.filter(entry=>entry.text.includes('거대해머 사용!'))).toHaveLength(1);
  });

  it('applies Salt Cure residual damage and removes it on switch',()=>{
    const attacker=set('garganacl',{moves:['saltcure','rockslide','protect','stealthrock']});
    const first=createBattle({format:'singles',playerTeam:[attacker],cpuTeam:[set('blastoise'),set('snorlax')],seed:18});
    const one=runTurn(first,use('saltcure'),use('raindance'));
    expect(one.sides.cpu.team[0].saltCured).toBe(true);
    expect(one.log.some(entry=>entry.text.includes('소금절이'))).toBe(true);
    const two=runTurn(one,guard(),[{kind:'switch',slot:0,to:1}]);
    expect(two.sides.cpu.team[0].saltCured).toBe(false);
    expect(two.sides.cpu.team[1].saltCured).toBeFalsy();
  });

  it('protects with Purifying Salt and consumes Lum Berry after status',()=>{
    const salt=set('garganacl',{abilityId:'purifyingsalt'});
    const burn=set('arcanine',{moves:['willowisp','flamethrower','protect','crunch']});
    const blocked=runTurn(createBattle({format:'singles',playerTeam:[salt],cpuTeam:[burn],seed:2}),use('rockslide'),use('willowisp'));
    expect(blocked.sides.player.team[0].status).toBeNull();
    const cured=runTurn(createBattle({format:'singles',playerTeam:[set('snorlax',{itemId:'lumberry'})],cpuTeam:[burn],seed:2}),use('return'),use('willowisp'));
    expect(cured.sides.player.team[0].status).toBeNull();
    expect(cured.sides.player.team[0].itemConsumed).toBe(true);
  });

  it('activates Weakness Policy and makes Assault Vest raise special defense while blocking status moves',()=>{
    const target=set('snorlax',{itemId:'weaknesspolicy'});
    const hitter=set('lucario',{moves:['drainpunch','aurasphere','protect','closecombat']});
    const boosted=runTurn(createBattle({format:'singles',playerTeam:[target],cpuTeam:[hitter],seed:6}),use('return'),use('drainpunch'));
    expect(boosted.sides.player.team[0].itemConsumed).toBe(true);
    expect(boosted.sides.player.team[0].stages.atk).toBe(2);
    expect(boosted.sides.player.team[0].stages.spa).toBe(2);
    const vested=createBattle({format:'singles',playerTeam:[set('snorlax',{itemId:'assaultvest',moves:['protect','bodyslam','rest','crunch']})],cpuTeam:[hitter],seed:6}).sides.player.team[0];
    expect(getModifiedStat(vested,'spd')).toBe(Math.floor(vested.stats.spd*1.5));
    expect(moveUnavailableReason(vested,'protect')).toContain('돌격조끼');
  });

  it('counts fallen allies for Supreme Overlord when entering',()=>{
    const state=createBattle({format:'singles',playerTeam:[set('raichu'),set('kingambit',{abilityId:'supremeoverlord'})],cpuTeam:[set('blissey')],seed:4});
    state.sides.player.team[0].hp=0;state.sides.player.team[0].fainted=true;
    const next=runTurn(state,[],guard());
    expect(next.sides.player.active[0]).toBe(1);
    expect(next.sides.player.team[1].fallenAllies).toBe(1);
  });
  it('uses condition-specific status berries and super-effective resistance berries once',()=>{
    const statusBattle=createBattle({format:'singles',playerTeam:[set('snorlax',{itemId:'cheriberry'})],cpuTeam:[set('blastoise')],seed:2});
    const target=statusBattle.sides.player.team[0];
    expect(applyStatus(statusBattle,target,'burn','test')).toBe(true);
    expect(target.status).toBe('burn');expect(target.itemConsumed).toBeFalsy();
    target.status=null;
    expect(applyStatus(statusBattle,target,'paralysis','test')).toBe(true);
    expect(target.status).toBeNull();expect(target.itemConsumed).toBe(true);
    const setup={format:'singles' as const,cpuTeam:[set('blastoise',{moves:['waterpulse','surf','protect','icebeam']})],seed:31};
    const plain=runTurn(createBattle({...setup,playerTeam:[set('charizard')]}),use('airslash'),use('waterpulse'));
    const berry=runTurn(createBattle({...setup,playerTeam:[set('charizard',{itemId:'passhoberry'})]}),use('airslash'),use('waterpulse'));
    expect(berry.sides.player.team[0].itemConsumed).toBe(true);
    expect(berry.sides.player.team[0].hp).toBeGreaterThan(plain.sides.player.team[0].hp);
  });
  it('splits Dragon Darts between two eligible opponents in doubles',()=>{
    const dragapult=set('dragapult',{moves:['dragondarts','dragonclaw','protect','shadowball']});
    expect(validateTeam([dragapult,set('raichu')])).toEqual([]);
    const first=createBattle({format:'doubles',playerTeam:[dragapult,set('raichu')],cpuTeam:[set('blissey'),set('blastoise')],seed:15});
    const next=runTurn(first,[{kind:'move',slot:0,moveId:'dragondarts',target:{side:'cpu',slot:0}},{kind:'move',slot:1,moveId:'protect'}],[{kind:'move',slot:0,moveId:'calmmind'},{kind:'move',slot:1,moveId:'raindance'}]);
    expect(next.sides.cpu.team[0].hp).toBeLessThan(first.sides.cpu.team[0].hp);
    expect(next.sides.cpu.team[1].hp).toBeLessThan(first.sides.cpu.team[1].hp);
    expect(next.sides.player.team[0].pp.dragondarts).toBe(moves.dragondarts.pp-1);
  });
});
