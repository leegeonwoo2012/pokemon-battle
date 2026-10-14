import {describe,expect,it} from 'vitest';
import {moves} from '../data';
import {createSet} from '../team';
import {battleTypeMultiplier,effectiveWeather,estimateDamage,auraPowerMultiplier,effectiveSpeed,getModifiedStat} from './calculations';
import {createBattle,runTurn} from './battle';
import {activateGimmick} from './gimmicks';
import {applyEntryEffects,applyExitEffects,processEndTurn,setBattleWeather} from './effects';

describe('Mega aura and Delta Stream rules',()=>{
  it('Mega Rayquaza creates persistent Strong Winds, cancels Flying weaknesses and blocks ordinary weather',()=>{
    const rayquaza={...createSet('rayquaza'),itemId:'none',moves:['dragonascent','protect','earthquake','extremespeed']};
    const state=createBattle({format:'singles',playerTeam:[rayquaza,createSet('raichu')],cpuTeam:[createSet('sylveon')],seed:4});
    expect(activateGimmick(state,'player',0,'mega','dragonascent')).toBe(true);
    const target=state.sides.cpu.team[0];target.types=['dragon','flying'];
    expect(effectiveWeather(state)).toBe('strongwinds');
    expect(state.weather).toMatchObject({id:'strongwinds',turns:99});
    expect(battleTypeMultiplier(state,moves.icebeam,target,state.sides.player.team[0])).toBe(2);
    expect(setBattleWeather(state,'sun',5)).toBe(false);
    const switched=runTurn(state,[{kind:'switch',slot:0,to:1}],[{kind:'move',slot:0,moveId:'protect'}]);
    expect(switched.weather).toBeNull();
  });

  it('Mega Zygarde Aura Break reverses Fairy Aura and uses the engine damage path',()=>{
    const zygarde={...createSet('zygarde'),itemId:'zygardite',moves:['nihillight','thousandarrows','coreenforcer','protect']};
    const state=createBattle({format:'singles',playerTeam:[zygarde],cpuTeam:[createSet('xerneas')],seed:12});
    expect(activateGimmick(state,'player',0,'mega','nihillight')).toBe(true);
    const attacker=state.sides.cpu.team[0],defender=state.sides.player.team[0];
    expect(defender.set.abilityId).toBe('aurabreak');
    expect(auraPowerMultiplier(state,moves.moonblast)).toBe(.75);
    const reversed=estimateDamage(state,attacker,defender,moves.moonblast);
    const noBreak=structuredClone(state);noBreak.sides.player.team[0].set.abilityId='none';
    expect(auraPowerMultiplier(noBreak,moves.moonblast)).toBeCloseTo(1.33);
    expect(reversed).toBeLessThan(estimateDamage(noBreak,attacker,noBreak.sides.player.team[0],moves.moonblast));
  });
});

describe('Ruin and Toxic Chain ability rules',()=>{
  it.each([
    ['tabletsofruin','dragonclaw',false],['swordofruin','dragonclaw',true],
    ['vesselofruin','flamethrower',false],['beadsofruin','flamethrower',true],
  ] as const)('%s changes the matching battle stat modifier', (abilityId,moveId,damageIncreases)=>{
      const attacker={...createSet('charizard'),moves:['dragonclaw','flamethrower','protect','airslash']};
    const state=createBattle({format:'doubles',playerTeam:[attacker,createSet('raichu')],cpuTeam:[createSet('blissey'),createSet('raichu')],seed:21});
    const user=state.sides.player.team[0],target=state.sides.cpu.team[0],holder=state.sides.cpu.team[1];
    const plain=estimateDamage(state,user,target,moves[moveId]);holder.set.abilityId=abilityId;
    const modified=estimateDamage(state,user,target,moves[moveId]);
    expect(damageIncreases?modified>plain:modified<plain).toBe(true);
  });

  it('Toxic Chain badly poisons through a successful damaging hit and Shield Dust/Covert Cloak block it',()=>{
    const attacker={...createSet('charizard'),moves:['dragonclaw','flamethrower','protect','airslash']};
    let poisoned=false;
    for(let seed=1;seed<=100&&!poisoned;seed++){
      const targetSet={...createSet('charizard'),moves:['swordsdance','protect','flamethrower','airslash']};
      const state=createBattle({format:'singles',playerTeam:[attacker],cpuTeam:[targetSet],seed});
      const user=state.sides.player.team[0],target=state.sides.cpu.team[0];user.set.abilityId='toxicchain';user.stats.spe=400;
      target.stats.spe=1;
      const result=runTurn(state,[{kind:'move',slot:0,moveId:'dragonclaw'}],[{kind:'move',slot:0,moveId:'swordsdance'}]);
      if(result.sides.cpu.team[0].toxicCounter){
        poisoned=true;expect(result.sides.cpu.team[0].status).toBe('poison');expect(result.sides.cpu.team[0].toxicCounter).toBeGreaterThan(1);
      }
    }
    expect(poisoned).toBe(true);
    for(const blockedBy of ['shielddust','covertcloak'] as const){
      const targetSet={...createSet('charizard'),moves:['swordsdance','protect','flamethrower','airslash']};
      const state=createBattle({format:'singles',playerTeam:[attacker],cpuTeam:[targetSet],seed:3});
      const user=state.sides.player.team[0],target=state.sides.cpu.team[0];user.set.abilityId='toxicchain';user.stats.spe=400;
      target.stats.spe=1;
      if(blockedBy==='shielddust')target.set.abilityId=blockedBy;else target.set.itemId=blockedBy;
      const result=runTurn(state,[{kind:'move',slot:0,moveId:'dragonclaw'}],[{kind:'move',slot:0,moveId:'swordsdance'}]);
      expect(result.sides.cpu.team[0].toxicCounter).toBeUndefined();
    }
  });
});

it('Slow Start halves Attack and Speed for five active turns and resets on switching back in',()=>{
  const state=createBattle({format:'singles',playerTeam:[createSet('charizard')],cpuTeam:[createSet('blissey')],seed:33});
  const user=state.sides.player.team[0];user.set.abilityId='slowstart';applyEntryEffects(state,'player',user);
  expect(getModifiedStat(user,'atk')).toBe(Math.floor(user.stats.atk/2));
  expect(effectiveSpeed(state,user)).toBe(Math.floor(user.stats.spe/2));
  for(let turn=0;turn<4;turn++)processEndTurn(state);
  expect(user.slowStartTurns).toBe(1);
  processEndTurn(state);
  expect(user.slowStartTurns).toBeUndefined();expect(getModifiedStat(user,'atk')).toBe(user.stats.atk);
  applyExitEffects(state,user);applyEntryEffects(state,'player',user);
  expect(user.slowStartTurns).toBe(5);
});
