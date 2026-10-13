import { describe, expect, it } from 'vitest';
import { createSet } from '../team';
import { createBattle, runTurn, runTurnWithEvents } from './battle';
import { chooseCpuActions } from './ai';
import type { BattleEvent, BattleState, TeamSet } from './types';

const build=(id:string,moveIds?:string[]):TeamSet=>({...createSet(id),...(moveIds?{moves:moveIds}:{})});
const p=()=>build('raichu',['quickattack','thunderbolt','thunderwave','protect']);
const b=()=>build('blastoise',['waterpulse','icebeam','surf','protect']);
const g=()=>build('garchomp',['dragonclaw','earthquake','swordsdance','protect']);
const mon=(event:BattleEvent,uid:string)=>Object.values(event.snapshot.sides).flatMap(s=>s.team).find(pokemon=>pokemon.uid===uid)!;
const action=(moveId:string,slot=0)=>({kind:'move' as const,slot,moveId});
describe('real ordered engine events',()=>{
  it('matches the engine result exactly and records priority, PP and intermediate HP in order',()=>{
    const initial=createBattle({format:'singles',playerTeam:[p()],cpuTeam:[b()],seed:8});
    const player=[action('quickattack')], cpu=[action('waterpulse')];
    const result=runTurnWithEvents(initial,player,cpu);
    expect(result.state).toEqual(runTurn(initial,player,cpu));
    expect(result.events.at(-1)?.snapshot).toEqual(result.state);
    const moves=result.events.filter(event=>event.kind==='move');
    expect(moves.map(event=>event.actorUid)).toEqual(['player-0','cpu-0']);
    expect(moves[0].category).toBe('physical');expect(moves[0].targetUids).toEqual(['cpu-0']);
    expect(mon(moves[0],'cpu-0').hp).toBe(initial.sides.cpu.team[0].hp);
    expect(mon(moves[0],'player-0').pp.quickattack).toBe(29);
    const damage=result.events.find(event=>event.kind==='damage')!;
    expect(damage.afterHp).toBeLessThan(damage.beforeHp!);
    expect(mon(damage,damage.targetUid!).hp).toBe(damage.afterHp);
    expect(result.events.indexOf(damage)).toBeLessThan(result.events.indexOf(moves[1]));
    expect(initial.sides.player.team[0].pp.quickattack).toBe(30);
  });
  it('reports actual rank-up and protection separately from damage',()=>{
    const initial=createBattle({format:'singles',playerTeam:[g()],cpuTeam:[b()],seed:4});
    const boosted=runTurnWithEvents(initial,[action('swordsdance')],[action('protect')]);
    const change=boosted.events.find(event=>event.kind==='stat')!;
    expect(change).toMatchObject({targetUid:'player-0',stat:'atk',stages:2,beforeStage:0,afterStage:2});
    expect(mon(change,'player-0').stages.atk).toBe(2);
    expect(boosted.events.some(event=>event.kind==='damage')).toBe(false);
    const guarded=runTurnWithEvents(initial,[action('protect')],[action('waterpulse')]);
    expect(guarded.events.find(event=>event.kind==='protect')).toMatchObject({targetUid:'player-0'});
    expect(guarded.events.find(event=>event.kind==='blocked')).toMatchObject({targetUid:'player-0'});
    expect(guarded.state.sides.player.team[0].hp).toBe(initial.sides.player.team[0].hp);
  });
  it('can fail repeated Protect and describes the actual failure',()=>{
    const initial=createBattle({format:'singles',playerTeam:[g()],cpuTeam:[b()],seed:4});
    initial.sides.player.team[0].protectStreak=10;initial.sides.player.team[0].lastProtectTurn=0;
    const result=runTurnWithEvents(initial,[action('protect')],[action('waterpulse')]);
    expect(result.events.some(event=>event.kind==='miss'&&event.text.includes('연속 방어'))).toBe(true);
    expect(result.state.sides.player.team[0].hp).toBeLessThan(initial.sides.player.team[0].hp);
  });
  it('keeps the old combatant until switch-out, then publishes the true replacement and entry effects',()=>{
    const initial=createBattle({format:'singles',playerTeam:[p()],cpuTeam:[b(),build('arcanine')],seed:2});
    const result=runTurnWithEvents(initial,[action('protect')],[{kind:'switch',slot:0,to:1}]);
    const out=result.events.find(event=>event.kind==='switch-out')!;
    const entry=result.events.find(event=>event.kind==='switch-in')!;
    expect(out.snapshot.sides.cpu.active[0]).toBe(0);
    expect(entry.snapshot.sides.cpu.active[0]).toBe(1);
    expect(out.actorUid).toBe('cpu-0');expect(entry.actorUid).toBe('cpu-1');
    expect(entry.id).toBeGreaterThan(out.id);
    expect(result.events.find(event=>event.kind==='ability')?.sourceId).toBe('intimidate');
    expect(result.state.sides.player.team[0].stages.atk).toBe(-1);
  });
  it('never replaces a living Pokémon without a switch action and gives the CPU a switch cooldown',()=>{
    const initial=createBattle({format:'singles',playerTeam:[p()],cpuTeam:[b(),build('arcanine')],seed:2});
    const stable=runTurnWithEvents(initial,[action('protect')],[action('protect')]);
    expect(stable.state.sides.cpu.active[0]).toBe(0);
    expect(stable.events.some(event=>event.kind.startsWith('switch'))).toBe(false);
    initial.turn=2;initial.sides.cpu.team[0].hp=1;
    const switched=runTurn(initial,[action('protect')],[{kind:'switch',slot:0,to:1}]);
    switched.sides.cpu.team[1].hp=1;
    expect(chooseCpuActions(switched)[0]?.kind).toBe('move');
  });
  it('records faint before replacement and ends single battles only after a real knockout',()=>{
    const initial=createBattle({format:'singles',playerTeam:[g()],cpuTeam:[p(),b()],seed:4});
    const result=runTurnWithEvents(initial,[action('earthquake')],[action('thunderbolt')]);
    const faint=result.events.find(event=>event.kind==='faint')!;
    const enter=result.events.find(event=>event.kind==='switch-in')!;
    expect(faint.snapshot.sides.cpu.active[0]).toBe(0);
    expect(enter.id).toBeGreaterThan(faint.id);
    const duel=createBattle({format:'singles',playerTeam:[g()],cpuTeam:[p()],seed:4});
    const ended=runTurnWithEvents(duel,[action('earthquake')],[action('thunderbolt')]);
    expect(ended.events.at(-1)?.kind).toBe('result');expect(ended.state.winner).toBe('player');
    expect(runTurnWithEvents(ended.state,[action('earthquake')]).events).toEqual([]);
  });
  it('handles four doubles actors and explicit spread targets',()=>{
    const initial=createBattle({format:'doubles',playerTeam:[p(),b()],cpuTeam:[p(),b()],seed:5});
    const result=runTurnWithEvents(initial,[action('quickattack'),action('surf',1)],[action('quickattack'),action('waterpulse',1)]);
    const moves=result.events.filter(event=>event.kind==='move');
    expect(new Set(moves.map(event=>event.actorUid)).size).toBe(4);
    expect(moves.find(event=>event.moveId==='surf')?.targetUids).toEqual(['player-0','cpu-0','cpu-1']);
    expect(result.events.at(-1)?.kind).toBe('turn-end');
  });
  it('emits actual item healing and residual damage without stale move metadata',()=>{
    const initial:BattleState=createBattle({format:'singles',playerTeam:[b()],cpuTeam:[p()],seed:5});
    initial.sides.player.team[0].set.itemId='leftovers';initial.sides.player.team[0].hp-=40;initial.sides.player.team[0].status='burn';
    const result=runTurnWithEvents(initial,[action('protect')],[action('protect')]);
    const item=result.events.find(event=>event.kind==='item');expect(item?.sourceId).toBe('leftovers');
    const residual=result.events.find(event=>event.kind==='damage')!;
    expect(residual.moveId).toBeUndefined();expect(residual.targetUid).toBe('player-0');
    expect(result.events.some(event=>event.kind==='heal'&&event.afterHp!>event.beforeHp!)).toBe(true);
  });
  it('ties contact retaliation to the real ability owner and attacker HP',()=>{
    const shark=g();shark.abilityId='roughSkin';
    const initial=createBattle({format:'singles',playerTeam:[p()],cpuTeam:[shark],seed:5});
    const result=runTurnWithEvents(initial,[action('quickattack')],[action('swordsdance')]);
    const passive=result.events.find(event=>event.kind==='ability'&&event.sourceId==='roughSkin')!;
    expect(passive).toMatchObject({actorUid:'cpu-0',targetUid:'cpu-0'});
    const recoil=result.events.find(event=>event.kind==='damage'&&event.targetUid==='player-0')!;
    expect(recoil.beforeHp!-recoil.afterHp!).toBe(Math.floor(initial.sides.player.team[0].maxHp/8));
    expect(recoil.moveId).toBeUndefined();
  });
});
