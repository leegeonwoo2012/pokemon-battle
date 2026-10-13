import { describe,expect,it } from 'vitest';
import { createBattle,runTurn } from './battle';
import { createSet } from '../team';
import { species } from '../data';

function withMove(id:string,moveId:string){
  const set=createSet(id);
  set.moves=[moveId,...species[id].learnset.filter(move=>move!==moveId)].slice(0,id==='ditto'?1:4);
  return set;
}

describe('Regulation M-C additions in the playable engine',()=>{
  it('Torch Song deals damage and raises Skeledirge Special Attack',()=>{
    const battle=createBattle({format:'singles',playerTeam:[withMove('skeledirge','torchsong')],cpuTeam:[withMove('snorlax','tackle')],seed:101});
    const before=battle.sides.cpu.team[0].hp;
    const result=runTurn(battle,[{kind:'move',slot:0,moveId:'torchsong'}],[{kind:'move',slot:0,moveId:'tackle'}]);
    expect(result.sides.cpu.team[0].hp).toBeLessThan(before);
    expect(result.sides.player.team[0].stages.spa).toBe(1);
  });

  it('Stone Axe sets Stealth Rock after damage and Aqua Step increases Speed',()=>{
    const battle=createBattle({format:'doubles',playerTeam:[withMove('kleavor','stoneaxe'),withMove('quaquaval','aquastep')],cpuTeam:[withMove('snorlax','tackle'),withMove('blastoise','tackle')],seed:17});
    const result=runTurn(battle,[{kind:'move',slot:0,moveId:'stoneaxe',target:{side:'cpu',slot:0}},{kind:'move',slot:1,moveId:'aquastep',target:{side:'cpu',slot:1}}],[{kind:'move',slot:0,moveId:'tackle'},{kind:'move',slot:1,moveId:'tackle'}]);
    expect(result.sides.cpu.hazards?.stealthrock).toBe(1);
    expect(result.sides.player.team[1].stages.spe).toBe(1);
  });

  it('Ditto transforms, copies combat traits and restores itself on switching',()=>{
    const ditto=withMove('ditto','transform');ditto.abilityId='limber';
    const battle=createBattle({format:'singles',playerTeam:[ditto,createSet('raichu')],cpuTeam:[withMove('charizard','roost')],seed:29});
    const transformed=runTurn(battle,[{kind:'move',slot:0,moveId:'transform'}],[{kind:'move',slot:0,moveId:'roost'}]);
    const copy=transformed.sides.player.team[0];
    expect(copy.appearanceSpeciesId).toBe('charizard');
    expect(copy.types).toEqual(species.charizard.types);
    expect(copy.set.abilityId).toBe('blaze');
    expect(copy.set.moves).toEqual(transformed.sides.cpu.team[0].set.moves);
    const switched=runTurn(transformed,[{kind:'switch',slot:0,to:1}],[{kind:'move',slot:0,moveId:'roost'}]);
    expect(switched.sides.player.team[0].set.moves).toEqual(['transform']);
    expect(switched.sides.player.team[0].appearanceSpeciesId).toBeUndefined();
  });

  it('Imposter transforms at entry and female Meowstic reaches its own Mega form',()=>{
    const ditto=withMove('ditto','transform');ditto.abilityId='imposter';
    const entry=createBattle({format:'singles',playerTeam:[ditto],cpuTeam:[createSet('charizard')],seed:31});
    expect(entry.sides.player.team[0].appearanceSpeciesId).toBe('charizard');
    const female=createSet('meowsticf');female.itemId='meowsticite';
    const battle=createBattle({format:'singles',playerTeam:[female],cpuTeam:[withMove('snorlax','protect')],seed:32});
    const result=runTurn(battle,[{kind:'move',slot:0,moveId:female.moves[0],gimmick:'mega'}],[{kind:'move',slot:0,moveId:'protect'}]);
    expect(result.sides.player.team[0].transformation?.formId).toBe('meowsticfmega');
  });
});
