import {describe,expect,it} from 'vitest';
import {moves,regulationSpecies} from '../data';
import {createSet} from '../team';
import {hasDedicatedMoveMotion} from '../presentation/move-motions';
import {createBattle,runTurn} from './battle';

const signatures:Record<string,string>={
  sirfetchd:'meteorassault',rhyperior:'rockwrecker',farigiraf:'twinbeam',wyrdeer:'psyshieldbash',
  lucario:'bonerush',zoroark:'nightdaze',zoroarkhisui:'bittermalice',volcarona:'fierydance',
  greninja:'watershuriken',floetteeternal:'lightofruin',avalugghisui:'mountaingale',salazzle:'firelash',
  tsareena:'tropkick',inteleon:'snipeshot',flapple:'gravapple',appletun:'appleacid',
  toxtricity:'shiftgear',grimmsnarl:'spiritbreak',espathra:'luminacrash',palafin:'jetpunch',glimmora:'mortalspin',
};
const set=(id:string,first:string)=>{
  const base=createSet(id),pool=regulationSpecies[id].learnset;
  return {...base,moves:[first,...pool.filter(move=>move!==first).slice(0,3)]};
};
const battle=(player:string,move:string,cpu='charizard',cpuMove='roost')=>createBattle({format:'singles',playerTeam:[set(player,move)],cpuTeam:[set(cpu,cpuMove)],seed:9});
const attack=(moveId:string)=>({kind:'move' as const,slot:0,moveId});

describe('Regulation M-C signature moves',()=>{
  it('connects 21 source-verified signature moves to their species and distinct visual cues',()=>{
    for(const [id,moveId] of Object.entries(signatures)){
      expect(regulationSpecies[id].learnset,`${id} ${moveId}`).toContain(moveId);
      expect(moves[moveId]?.pp,moveId).toBeGreaterThan(0);
      expect(hasDedicatedMoveMotion(moveId),moveId).toBe(true);
    }
  });
  it('Shift Gear raises attack and speed while Trop Kick lowers the defender attack',()=>{
    const gear=runTurn(battle('toxtricity','shiftgear'),[attack('shiftgear')],[attack('roost')]);
    expect(gear.sides.player.team[0].stages).toMatchObject({atk:1,spe:2});
    const kick=runTurn(battle('tsareena','tropkick'),[attack('tropkick')],[attack('roost')]);
    expect(kick.sides.cpu.team[0].stages.atk).toBe(-1);
  });
  it('Mortal Spin removes own hazards and poisons a hit foe',()=>{
    const state=battle('glimmora','mortalspin');state.sides.player.hazards={stealthrock:1};
    const next=runTurn(state,[attack('mortalspin')],[attack('roost')]);
    expect(next.sides.player.hazards?.stealthrock).toBeUndefined();
    expect(next.sides.cpu.team[0].status).toBe('poison');
  });
  it('Meteor Assault recharges and Twin Beam strikes twice',()=>{
    const meteor=runTurn(battle('sirfetchd','meteorassault'),[attack('meteorassault')],[attack('roost')]);
    expect(meteor.sides.player.team[0].rechargeTurns).toBe(1);
    const twin=runTurn(battle('farigiraf','twinbeam'),[attack('twinbeam')],[attack('roost')]);
    expect(twin.log.some(entry=>entry.text.includes('2번 맞았다'))).toBe(true);
  });
  it('Jet Punch has increased priority and Snipeshot has an increased critical stage',()=>{
    expect(moves.jetpunch.priority).toBe(1);
    expect(moves.snipeshot.critStage).toBe(1);
  });
});
