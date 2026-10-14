import { describe,expect,it } from 'vitest';
import { moves,regulationSpecies } from '../data';
import { championMoves } from '../data/champion-moves.generated';
import { createSet } from '../team';
import { createBattle,runTurnWithEvents } from './battle';
import regulation from '../../docs/regulation-m-c.json';

describe('source-verified attack properties',()=>{
  it('matches the pinned M-C data for all 510 core move records while retaining custom effects',()=>{
    const fields=['type','category','power','accuracy','pp','priority','contact','sound','powder','bite','slicing','pulse','punch','bullet'] as const;
    const core=new Set(regulation.ids.flatMap(id=>regulationSpecies[id].learnset));
    for(const [id,source] of Object.entries(championMoves))if(core.has(id))for(const field of fields)expect(moves[id][field]??false,`${id}.${field}`).toBe(source[field]??false);
    expect(moves.closecombat.punch).toBe(false);expect(moves.gigatonhammer.punch).toBe(false);
    expect(moves.headlongrush.punch).toBe(true);expect(moves.airslash.slicing).toBe(true);
    expect(moves.watershuriken.power).toBe(15);
  });
  it.each([['lucario','aurasphere'],['cinderace','pyroball']])('Bulletproof blocks %s’s %s using the actual attack tag', (speciesId,moveId)=>{
    const player=createSet(speciesId);player.moves=[moveId,...player.moves.filter(id=>id!==moveId)].slice(0,4);
    const cpu=createSet('chesnaught');cpu.abilityId='bulletproof';cpu.moves=['swordsdance',...cpu.moves.filter(id=>id!=='swordsdance')].slice(0,4);
    const state=createBattle({format:'singles',playerTeam:[player],cpuTeam:[cpu],seed:42});
    const result=runTurnWithEvents(state,[{kind:'move',slot:0,moveId}],[{kind:'move',slot:0,moveId:'swordsdance'}]);
    expect(result.state.sides.cpu.team[0].hp).toBe(state.sides.cpu.team[0].hp);
    expect(result.events.some(event=>event.kind==='blocked'&&event.sourceId==='bulletproof')).toBe(true);
  });
});
