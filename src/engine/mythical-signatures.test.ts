import {describe,expect,it} from 'vitest';
import {moves,regulationSpecies} from '../data';
import {createSet,validateTeam} from '../team';
import {hasDedicatedMoveMotion} from '../presentation/move-motions';
import {signatureVisuals} from '../presentation/signature-catalog';
import {createBattle,runTurn,runTurnWithEvents} from './battle';
import {previewMove} from './gimmicks';

const signatures:Record<string,string[]>={
  jirachi:['doomdesire'],deoxys:['psychoboost'],manaphy:['heartswap'],darkrai:['darkvoid'],
  shaymin:['seedflare'],arceus:['judgment'],victini:['vcreate','searingshot'],
  keldeo:['secretsword'],meloetta:['relicsong'],genesect:['technoblast'],
  diancie:['diamondstorm'],hoopa:['hyperspacehole','hyperspacefury'],
  volcanion:['steameruption'],magearna:['fleurcannon'],marshadow:['spectralthief'],
  zeraora:['plasmafists'],melmetal:['doubleironbash'],zarude:['junglehealing'],
  pecharunt:['malignantchain'],
};
const set=(id:string,moveId:string,itemId='none')=>{
  const base=createSet(id);
  return {...base,itemId,moves:[moveId,...regulationSpecies[id].learnset.filter(move=>move!==moveId).slice(0,3)]};
};
const attack=(moveId:string,slot=0)=>({kind:'move' as const,moveId,slot});

describe('mythical signature moves',()=>{
  it('connects each owner to supported mechanics and an individual motion cue',()=>{
    for(const [id,ids] of Object.entries(signatures))for(const moveId of ids){
      expect(regulationSpecies[id].learnset,`${id}: ${moveId}`).toContain(moveId);
      expect(moves[moveId]?.pp,moveId).toBeGreaterThan(0);
      expect(hasDedicatedMoveMotion(moveId),moveId).toBe(true);
      expect(signatureVisuals[moveId],moveId).toBeDefined();
    }
  });
  it('changes Judgment and Techno Blast to the held Plate or Drive type',()=>{
    const arceus=createBattle({format:'singles',playerTeam:[set('arceus','judgment','flameplate')],cpuTeam:[createSet('blissey')]}).sides.player.team[0];
    const genesect=createBattle({format:'singles',playerTeam:[set('genesect','technoblast','dousedrive')],cpuTeam:[createSet('blissey')]}).sides.player.team[0];
    const royaleon=createBattle({format:'singles',playerTeam:[set('royaleon','judgment','pixieplate')],cpuTeam:[createSet('blissey')]}).sides.player.team[0];
    expect(validateTeam([arceus.set,genesect.set])).toEqual([]);
    expect(previewMove(arceus,moves.judgment).type).toBe('fire');
    expect(previewMove(genesect,moves.technoblast).type).toBe('water');
    expect(previewMove(royaleon,moves.judgment).type).toBe('fairy');
  });
  it('uses Arceus’s Plate type for Judgment damage and matchup messages in a real turn',()=>{
    const state=createBattle({format:'singles',seed:31,playerTeam:[set('arceus','judgment','flameplate')],cpuTeam:[createSet('venusaur')]});
    const before=state.sides.cpu.team[0].hp;
    const result=runTurnWithEvents(state,[attack('judgment')],[attack('sleeppowder')]);
    expect(result.events.find(event=>event.kind==='move'&&event.actorUid==='player-0')).toMatchObject({moveId:'judgment',type:'fire'});
    expect(result.events.find(event=>event.kind==='effectiveness'&&event.targetUid==='cpu-0')).toMatchObject({effectiveness:2});
    expect(result.state.sides.cpu.team[0].hp).toBeLessThan(before);
  });
  it('uses a non-Arceus holder’s Plate type for Judgment damage too',()=>{
    const state=createBattle({format:'singles',seed:37,playerTeam:[set('royaleon','judgment','flameplate')],cpuTeam:[createSet('venusaur')]});
    const result=runTurnWithEvents(state,[attack('judgment')],[attack('sleeppowder')]);
    expect(result.events.find(event=>event.kind==='move'&&event.actorUid==='player-0')).toMatchObject({moveId:'judgment',type:'fire'});
    expect(result.events.find(event=>event.kind==='effectiveness'&&event.targetUid==='cpu-0')).toMatchObject({effectiveness:2});
  });
  it('swaps stat stages with Heart Swap',()=>{
    const state=createBattle({format:'singles',playerTeam:[set('manaphy','heartswap')],cpuTeam:[createSet('blissey')],seed:18});
    state.sides.player.team[0].stages.spa=2;state.sides.cpu.team[0].stages.def=3;
    const next=runTurn(state,[attack('heartswap')],[attack('protect')]);
    // Protect blocks the exchange.
    expect(next.sides.player.team[0].stages.spa).toBe(2);
    const unblocked=createBattle({format:'singles',playerTeam:[set('manaphy','heartswap')],cpuTeam:[createSet('blissey')],seed:18});
    unblocked.sides.player.team[0].stages.spa=2;unblocked.sides.cpu.team[0].stages.def=3;
    const swapped=runTurn(unblocked,[attack('heartswap')],[attack('recover')]);
    expect(swapped.sides.player.team[0].stages).toMatchObject({spa:0,def:3});
    expect(swapped.sides.cpu.team[0].stages).toMatchObject({spa:2,def:0});
  });
  it('changes Meloetta to Pirouette Forme after Relic Song connects',()=>{
    const state=createBattle({format:'singles',playerTeam:[set('meloetta','relicsong')],cpuTeam:[createSet('blissey')],seed:7});
    const next=runTurn(state,[attack('relicsong')],[attack('recover')]);
    expect(next.sides.player.team[0].battleFormId).toBe('meloettapirouette');
    expect(next.sides.player.team[0].types).toEqual(['normal','fighting']);
  });
  it('heals the active allies with Jungle Healing and preserves the two-hit Iron Bash',()=>{
    expect(moves.junglehealing.target).toBe('allAllies');
    expect(moves.junglehealing.effects).toContainEqual({kind:'heal',fraction:.25,target:'target'});
    expect(moves.doubleironbash.multihit).toBe(2);
    const state=createBattle({format:'singles',playerTeam:[set('zarude','junglehealing')],cpuTeam:[createSet('blissey')],seed:2});
    state.sides.player.team[0].hp-=50;
    const healed=runTurn(state,[attack('junglehealing')],[attack('protect')]);
    expect(healed.sides.player.team[0].hp).toBeGreaterThan(state.sides.player.team[0].hp);
  });
  it('charges the battlefield with Plasma Fists for later Normal attacks',()=>{
    const partner={...createSet('snorlax'),moves:['bodyslam','protect','rest','crunch']};
    const state=createBattle({format:'doubles',playerTeam:[set('zeraora','plasmafists'),partner],cpuTeam:[createSet('blissey'),createSet('gardevoir')],seed:9});
    const result=runTurnWithEvents(state,[attack('plasmafists',0),attack('bodyslam',1)],[attack('protect',0),attack('protect',1)]);
    expect(result.events.some(event=>event.kind==='move'&&event.moveId==='bodyslam'&&event.type==='electric')).toBe(true);
  });
  it('retains the source secondary effects of the remaining signature attacks',()=>{
    expect(moves.malignantchain.effects).toContainEqual({kind:'status',status:'poison',chance:50,badlyPoisoned:true});
    expect(moves.seedflare.effects).toContainEqual({kind:'stat',stat:'spd',stages:-2,target:'target',chance:40});
    expect(moves.hyperspacehole.bypassProtect).toBe(true);
    expect(moves.hyperspacefury.bypassProtect).toBe(true);
    expect(moves.doomdesire.delayedTurns).toBe(2);
  });
});
