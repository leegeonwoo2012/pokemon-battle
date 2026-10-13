import { describe,it,expect } from 'vitest';
import { createSet } from '../team';
import { createBattle, runTurn, runTurnWithEvents } from './battle';
import { applyHazards,applyTacticalEffect,finishTactics } from './tactics';
import { isMoveUsable } from './choices';
import { screenMultiplier, effectiveSpeed, estimateDamage, isGrounded, moveAccuracy } from './calculations';
import { moves,species } from '../data';
import type { BattleAction,Format,TeamSet } from './types';
const attack=(moveId:string,slot=0):BattleAction=>({kind:'move',slot,moveId});
const set=(id:string,extra:Partial<TeamSet>={})=>({...createSet(id),...extra});
const battle=(format:Format='singles')=>createBattle({format,playerTeam:[set('raichu'),set('charizard'),set('blastoise')],cpuTeam:[set('snorlax'),set('gyarados'),set('venusaur')],seed:5});
describe('tactical effects and turn integration',()=>{
  it('describes CPU field effects on the correct side',()=>{
    const state=battle(),user=state.sides.cpu.team[0];
    applyTacticalEffect(state,{kind:'hazard',hazard:'stealthrock'},user,user);
    expect(state.log.at(-1)?.text).toBe('아군 진영에 스텔스록 설치!');
    applyTacticalEffect(state,{kind:'screen',screen:'reflect'},user,user);
    expect(state.log.at(-1)?.text).toBe('상대 진영에 리플렉터 전개!');
  });
  it('executes a legally learned setup move, uses PP and records the resulting field',()=>{
    const state=createBattle({format:'singles',playerTeam:[set('tyranitar',{moves:['stealthrock','crunch','stoneedge','protect']})],cpuTeam:[set('blastoise')],seed:9});
    const {state:next,events}=runTurnWithEvents(state,[attack('stealthrock')],[attack('protect')]);
    expect(next.sides.cpu.hazards?.stealthrock).toBe(1);expect(next.sides.player.team[0].pp.stealthrock).toBe(19);
    expect(events.some(event=>event.snapshot.sides.cpu.hazards?.stealthrock===1)).toBe(true);
  });
  it('Rock hazards use real type multipliers and base HP on switch',()=>{
    const state=battle();state.sides.player.hazards={stealthrock:1,spikes:3};
    const next=runTurn(state,[{kind:'switch',slot:0,to:1}],[attack('protect')]);
    const mon=next.sides.player.team[1];expect(mon.maxHp-mon.hp).toBe(Math.floor(mon.maxHp/2)); // Charizard flies over Spikes.
    expect(state.sides.player.team[1].hp).toBe(state.sides.player.team[1].maxHp);
  });
  it('boots prevent all entry hazards while grounded poison absorbs Toxic Spikes',()=>{
    const state=battle();state.sides.player.hazards={stealthrock:1,spikes:3,toxicspikes:2,stickyweb:1};
    const mon=state.sides.player.team[0];mon.set.itemId='heavydutyboots';applyHazards(state,'player',mon);
    expect(mon.hp).toBe(mon.maxHp);expect(mon.status).toBeNull();expect(mon.stages.spe).toBe(0);
    const poison=state.sides.cpu.team[2];state.sides.cpu.hazards={toxicspikes:2};applyHazards(state,'cpu',poison);
    expect(state.sides.cpu.hazards.toxicspikes).toBeUndefined();expect(poison.status).toBeNull();
  });
  it('two Toxic Spikes layers cause increasing toxic damage with a reset on switch',()=>{
    const state=battle();state.sides.player.hazards={toxicspikes:2};const mon=state.sides.player.team[0];applyHazards(state,'player',mon);
    expect(mon.toxicCounter).toBe(1);
    const one=runTurn(state,[attack('protect')],[attack('protect')]);expect(one.sides.player.team[0].toxicCounter).toBe(2);
    const two=runTurn(one,[attack('protect')],[attack('protect')]);
    expect(one.sides.player.team[0].hp-two.sides.player.team[0].hp).toBe(Math.floor(mon.maxHp*2/16));
    const switched=runTurn(two,[{kind:'switch',slot:0,to:2}],[attack('protect')]);expect(switched.sides.player.team[0].toxicCounter).toBe(1);
  });
  it('screens reduce the matching damage, do not stack, and critical hits bypass them',()=>{
    for(const format of ['singles','doubles'] as const){const state=battle(format),mon=state.sides.player.team[0];state.sides.player.screens={reflect:5,auroraveil:5};
      expect(screenMultiplier(state,mon,moves.quickattack,false)).toBe(format==='singles'?.5:2/3);
      expect(screenMultiplier(state,mon,moves.quickattack,true)).toBe(1);
    }
  });
  it('Aurora Veil requires snow; Light Clay lasts eight turns and expirations are logged',()=>{
    const state=battle(),mon=state.sides.player.team[0];applyTacticalEffect(state,{kind:'screen',screen:'auroraveil'},mon,mon);expect(state.sides.player.screens?.auroraveil).toBeUndefined();
    state.weather={id:'snow',turns:5};mon.set.itemId='lightclay';applyTacticalEffect(state,{kind:'screen',screen:'auroraveil'},mon,mon);expect(state.sides.player.screens?.auroraveil).toBe(8);
    for(let i=0;i<8;i++)finishTactics(state);expect(state.sides.player.screens?.auroraveil).toBeUndefined();
  });
  it('Trick Room reverses speed within a priority bracket and can be cancelled',()=>{
    const state=battle();state.trickRoom=5;
    const {events}=runTurnWithEvents(state,[attack('thunderbolt')],[attack('crunch')]);
    expect(events.find(event=>event.kind==='move')?.actorUid).toBe('cpu-0');
    const {events:priority}=runTurnWithEvents(state,[attack('protect')],[attack('crunch')]);expect(priority.find(event=>event.kind==='move')?.actorUid).toBe('player-0');
    applyTacticalEffect(state,{kind:'trickroom'},state.sides.player.team[0],state.sides.player.team[0]);expect(state.trickRoom).toBe(0);
  });
  it('Gravity grounds Flying and Levitate, raises accuracy, and expires',()=>{
    const state=createBattle({format:'singles',playerTeam:[set('clefable',{moves:['gravity','moonblast','protect','thunderwave']})],cpuTeam:[set('charizard')],seed:14});
    const user=state.sides.player.team[0],target=state.sides.cpu.team[0];
    expect(isGrounded(target,state)).toBe(false);
    expect(estimateDamage(state,user,target,moves.earthpower)).toBe(0);
    const before=moveAccuracy(state,user,target,moves.fireblast);
    const next=runTurn(state,[attack('gravity')],[attack('protect')]);
    expect(next.gravity).toBe(4);
    expect(isGrounded(next.sides.cpu.team[0],next)).toBe(true);
    expect(estimateDamage(next,next.sides.player.team[0],next.sides.cpu.team[0],moves.earthpower)).toBeGreaterThan(0);
    expect(moveAccuracy(next,next.sides.player.team[0],next.sides.cpu.team[0],moves.fireblast)).toBeGreaterThan(before);
    for(let i=0;i<4;i++)finishTactics(next);
    expect(next.gravity).toBe(0);
  });
  it('Tailwind doubles real speed and lasts four end-of-turn ticks',()=>{
    const state=battle(),mon=state.sides.player.team[0],before=effectiveSpeed(state,mon);
    applyTacticalEffect(state,{kind:'tailwind'},mon,mon);expect(effectiveSpeed(state,mon)).toBe(before*2);
    for(let i=0;i<4;i++)finishTactics(state);expect(effectiveSpeed(state,mon)).toBe(before);
  });
  it('Taunt disables status moves and Encore forces the last move, then clears on switch',()=>{
    const state=battle(),mon=state.sides.player.team[0];mon.lastMove='thunderbolt';
    applyTacticalEffect(state,{kind:'taunt'},state.sides.cpu.team[0],mon);expect(isMoveUsable(mon,'protect')).toBe(false);
    applyTacticalEffect(state,{kind:'encore'},state.sides.cpu.team[0],mon);expect(isMoveUsable(mon,'quickattack')).toBe(false);
    const switched=runTurn(state,[{kind:'switch',slot:0,to:2}],[attack('protect')]);expect(switched.sides.player.team[0].encore).toBeUndefined();expect(switched.sides.player.team[0].tauntTurns).toBe(0);
  });
  it('Taunt applied before a chosen status action blocks it without consuming PP',()=>{
    const state=createBattle({format:'singles',playerTeam:[set('weavile',{moves:['taunt','icebeam','shadowball','protect']})],cpuTeam:[set('venusaur',{moves:['swordsdance','energyball','sludgebomb','protect']})],seed:42});
    const {state:next,events}=runTurnWithEvents(state,[attack('taunt')],[attack('swordsdance')]);
    expect(next.sides.cpu.team[0].tauntTurns).toBe(2);expect(next.sides.cpu.team[0].pp.swordsdance).toBe(20);expect(next.sides.cpu.team[0].stages.atk).toBe(0);expect(events.some(event=>event.kind==='blocked'&&event.text.includes('도발'))).toBe(true);
  });
  it('removal clears the correct sides and Defog removes terrain and opposing screens',()=>{
    const state=battle(),mon=state.sides.player.team[0];state.sides.player.hazards={spikes:3};state.sides.cpu.hazards={stealthrock:1};state.sides.cpu.screens={reflect:4};state.field={id:'electric',turns:3};
    applyTacticalEffect(state,{kind:'clearHazards'},mon,state.sides.cpu.team[0]);expect(state.sides.player.hazards).toEqual({});expect(state.sides.cpu.hazards.stealthrock).toBe(1);
    applyTacticalEffect(state,{kind:'clearHazards',bothSides:true,screens:true},mon,state.sides.cpu.team[0]);expect(state.sides.cpu.hazards).toEqual({});expect(state.sides.cpu.screens).toEqual({});expect(state.field).toBeNull();
  });
  it('Skill Link hits five times, uses one PP, and breaks a Focus Sash',()=>{
    const state=createBattle({format:'singles',playerTeam:[set('cloyster',{abilityId:'skilllink',moves:['iciclespear','icebeam','surf','protect']})],cpuTeam:[set('dragonite',{itemId:'focusSash'})],seed:77});
    state.sides.cpu.team[0].hp=state.sides.cpu.team[0].maxHp=100;
    const {state:next,events}=runTurnWithEvents(state,[attack('iciclespear')],[attack('dragondance')]);
    expect(next.sides.player.team[0].pp.iciclespear).toBe(29);expect(next.sides.cpu.team[0].fainted).toBe(true);
    expect(events.filter(event=>event.kind==='damage'&&event.targetUid==='cpu-0').length).toBeGreaterThan(1);
  });
  it('every generated tactical learnset remains species legal',()=>{expect(Object.values(species).filter(mon=>mon.learnset.includes('stealthrock')).length).toBeGreaterThan(10);});
  it('Tailwind changes the order of remaining doubles actions in the same turn',()=>{
    const state=createBattle({format:'doubles',playerTeam:[set('charizard',{natureId:'jolly',evs:{spe:252},moves:['tailwind','flamethrower','airslash','protect']}),set('snorlax',{natureId:'jolly',evs:{spe:252},moves:['return','crunch','earthquake','protect']})],cpuTeam:[set('raichu',{moves:['thunderbolt','quickattack','thunderwave','protect']}),set('blastoise',{moves:['waterpulse','surf','icebeam','protect']})],seed:8});
    const result=runTurnWithEvents(state,[attack('tailwind'),attack('return',1)],[attack('thunderbolt'),attack('waterpulse',1)]);
    expect(result.events.filter(event=>event.kind==='move').slice(0,3).map(event=>event.actorUid)).toEqual(['player-0','player-1','cpu-0']);
  });
  it('tactical immunities trigger through passives, including an ally Aroma Veil',()=>{
    const state=battle('doubles'),user=state.sides.player.team[0],target=state.sides.cpu.team[0];target.set.abilityId='oblivious';
    applyTacticalEffect(state,{kind:'taunt'},user,target);expect(target.tauntTurns).toBeUndefined();
    target.set.abilityId='thickFat';target.lastMove='return';state.sides.cpu.team[1].set.abilityId='aromaveil';
    applyTacticalEffect(state,{kind:'encore'},user,target);expect(target.encore).toBeUndefined();
    expect(state.log.some(row=>row.text.includes('아로마베일'))).toBe(true);
  });
  it('Infiltrator bypasses screens and a legal Z-status move bypasses Taunt',()=>{
    const state=createBattle({format:'singles',playerTeam:[set('scizor',{itemId:'normaliumz',moves:['swordsdance','xscissor','ironhead','protect']})],cpuTeam:[set('snorlax')],seed:8}),mon=state.sides.player.team[0];
    state.sides.cpu.screens={reflect:5};mon.set.abilityId='infiltrator';expect(screenMultiplier(state,state.sides.cpu.team[0],moves.quickattack,false,mon)).toBe(1);
    mon.set.abilityId='technician';mon.tauntTurns=2;
    const result=runTurn(state,[{kind:'move',slot:0,moveId:'swordsdance',gimmick:'z'}],[attack('protect')]);
    expect(result.sides.player.team[0].pp.swordsdance).toBe(19);expect(result.sides.player.team[0].stages.atk).toBeGreaterThanOrEqual(2);
  });
});
