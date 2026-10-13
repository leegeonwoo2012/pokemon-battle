import {describe,expect,it} from 'vitest';
import {createSet} from '../team';
import {moves} from '../data';
import {createBattle,runTurn} from './battle';
import {processEndTurn} from './effects';
import {applyMaxEffect,previewMove} from './gimmicks';
import type {BattleState,TeamSet} from './types';

const set=(id:string,extra:Partial<TeamSet>={})=>({...createSet(id),...extra});
function battle(id:string,format:'singles'|'doubles'='singles'):BattleState {
  return createBattle({format,playerTeam:[set(id,{gigantamax:true}),set('raichu')],cpuTeam:[set('blastoise'),set('charizard')],seed:31});
}
function use(state:BattleState,id:string){
  const p=state.sides.player.team[0];
  const gmaxMove={...moves.tackle,id};
  applyMaxEffect(state,'player',p,gmaxMove);
}

describe('expanded G-Max effects',()=>{
  it('Gengar traps opponents until they leave the field',()=>{
    const state=battle('gengar');use(state,'gmaxterror');
    expect(state.sides.cpu.team[0].trapped).toBe(true);
    const next=runTurn(state,[{kind:'move',slot:0,moveId:state.sides.player.team[0].set.moves[0]}],[{kind:'switch',slot:0,to:1}]);
    expect(next.sides.cpu.active[0]).toBe(0);
    const released=runTurn(state,[{kind:'switch',slot:0,to:1}],[{kind:'move',slot:0,moveId:'protect'}]);
    expect(released.sides.cpu.team[0].trapped).toBe(false);
    const ghost=battle('gengar');ghost.sides.cpu.team[0].types=['ghost'];use(ghost,'gmaxterror');
    expect(ghost.sides.cpu.team[0].trapped).toBeFalsy();
  });

  it('Machamp raises ally critical stage; fixed-power G-Max moves ignore ability',()=>{
    const state=battle('machamp','doubles');use(state,'gmaxchistrike');
    expect(state.sides.player.team[0].gmaxCritStages).toBe(1);
    expect(state.sides.player.team[1].gmaxCritStages).toBe(1);
    for(const [id,type] of [['rillaboom','grass'],['cinderace','fire']] as const){
      const candidate=battle(id);const p=candidate.sides.player.team[0];p.transformation={kind:'dynamax',turns:3};
      const base=Object.values(moves).find(move=>move.type===type&&move.category!=='status')!;
      const powered=previewMove(p,base);
      expect(powered.power).toBe(160);
      expect(powered.ignoreAbility).toBe(true);
    }
  });

  it('Garbodor poisons, Hatterene confuses, and Corviknight removes both sides hazards and screens',()=>{
    const poison=battle('garbodor');use(poison,'gmaxmalodor');
    expect(poison.sides.cpu.team[0].status).toBe('poison');
    const confused=battle('hatterene');use(confused,'gmaxsmite');
    expect(confused.sides.cpu.team[0].confusionTurns).toBeGreaterThan(0);
    const cleared=battle('corviknight');
    cleared.sides.player.hazards={stealthrock:1};cleared.sides.cpu.hazards={spikes:2};cleared.sides.cpu.screens={reflect:3};
    use(cleared,'gmaxwindrage');
    expect(cleared.sides.player.hazards?.stealthrock).toBeUndefined();
    expect(cleared.sides.cpu.hazards?.spikes).toBeUndefined();
    expect(cleared.sides.cpu.screens?.reflect).toBeUndefined();
  });

  it('Grimmsnarl schedules sleep and both random status signatures choose a legal status',()=>{
    const state=battle('grimmsnarl');
    for(let i=0;i<12&&!state.sides.cpu.team[0].yawnTurns;i++)use(state,'gmaxsnooze');
    expect(state.sides.cpu.team[0].yawnTurns).toBe(2);
    processEndTurn(state);processEndTurn(state);
    expect(state.sides.cpu.team[0].status).toBe('sleep');
    for(const [id,signature,allowed] of [
      ['butterfree','gmaxbefuddle',['sleep','paralysis','poison']],
      ['toxtricity','gmaxstunshock',['paralysis','poison']],
    ] as const){
      const candidate=battle(id);use(candidate,signature);
      expect(allowed).toContain(candidate.sides.cpu.team[0].status);
    }
  });
});
