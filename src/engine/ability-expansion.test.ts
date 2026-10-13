import { describe, expect, it } from 'vitest';
import { createSet } from '../team';
import { moves } from '../data';
import { createBattle, runTurn } from './battle';
import { isTypeImmune, moveAccuracy } from './calculations';
import { absorbMove, processEndTurn } from './effects';
import type { BattleState, TeamSet } from './types';

const set=(id:string,extra:Partial<TeamSet>={})=>({...createSet(id),...extra});
const action=(moveId:string)=>[{kind:'move' as const,slot:0,moveId}];
function battle(player='raichu',cpu='blastoise',playerMoves?:string[],cpuMoves?:string[]):BattleState {
  return createBattle({format:'singles',playerTeam:[set(player,playerMoves?{moves:playerMoves}:{})],cpuTeam:[set(cpu,cpuMoves?{moves:cpuMoves}:{})],seed:17});
}

describe('expanded ability hooks',()=>{
  it('Pressure spends an additional PP for a targeted attack',()=>{
    const state=battle('raichu','blastoise',['thunderbolt','quickattack','protect','thunderwave'],['waterpulse','protect','surf','icebeam']);
    state.sides.cpu.team[0].set.abilityId='pressure';
    const next=runTurn(state,action('thunderbolt'),action('waterpulse'));
    expect(next.sides.player.team[0].pp.thunderbolt).toBe(state.sides.player.team[0].pp.thunderbolt-2);
  });

  it('Lightning Rod absorbs Electric moves and raises Special Attack',()=>{
    const state=battle();const target=state.sides.cpu.team[0];target.set.abilityId='lightningrod';
    expect(absorbMove(state,target,moves.thunderbolt)).toBe(true);
    expect(target.hp).toBe(target.maxHp);
    expect(target.stages.spa).toBe(1);
  });

  it('Natural Cure clears status on withdrawal, and Speed Boost raises Speed at turn end',()=>{
    const state=createBattle({format:'singles',playerTeam:[set('blissey'),set('raichu')],cpuTeam:[set('blastoise')],seed:5});
    state.sides.player.team[0].set.abilityId='naturalcure';state.sides.player.team[0].status='burn';
    const switched=runTurn(state,[{kind:'switch',slot:0,to:1}],action('protect'));
    expect(switched.sides.player.team[0].status).toBeNull();
    switched.sides.player.team[1].set.abilityId='speedboost';
    const before=switched.sides.player.team[1].stages.spe;
    processEndTurn(switched);
    expect(switched.sides.player.team[1].stages.spe).toBe(before+1);
  });

  it('Overcoat blocks sand damage and powder moves',()=>{
    const state=battle('venusaur','blastoise',['sleeppowder','energyball','protect','gigadrain']);
    const foe=state.sides.cpu.team[0];foe.set.abilityId='overcoat';state.weather={id:'sand',turns:4};
    const next=runTurn(state,action('sleeppowder'),action('waterpulse'));
    expect(next.sides.cpu.team[0].status).toBeNull();
    expect(next.sides.cpu.team[0].hp).toBe(foe.maxHp);
  });

  it('Moxie boosts Attack on a direct knockout and Contrary inverts stage changes',()=>{
    const state=battle('raichu','blastoise',['quickattack','thunderbolt','protect','thunderwave']);
    state.sides.player.team[0].set.abilityId='moxie';state.sides.cpu.team[0].hp=1;
    const next=runTurn(state,action('quickattack'),action('waterpulse'));
    expect(next.sides.cpu.team[0].fainted).toBe(true);
    expect(next.sides.player.team[0].stages.atk).toBe(1);
    const contrary=battle('garchomp','blastoise',['swordsdance','earthquake','dragonclaw','protect']);
    contrary.sides.player.team[0].set.abilityId='contrary';
    const lowered=runTurn(contrary,action('swordsdance'),action('protect'));
    expect(lowered.sides.player.team[0].stages.atk).toBe(-2);
  });

  it('Mold Breaker bypasses Levitate, while Gravity grounds a normal Levitate target',()=>{
    const state=battle('garchomp','blastoise',['earthquake','dragonclaw','protect','rockslide']);
    const target=state.sides.cpu.team[0];target.set.abilityId='levitate';
    expect(isTypeImmune(target,moves.earthquake,state)).toBe(true);
    state.gravity=4;
    expect(isTypeImmune(target,moves.earthquake,state)).toBe(false);
    state.gravity=undefined;state.sides.player.team[0].set.abilityId='moldbreaker';
    const next=runTurn(state,action('earthquake'),action('waterpulse'));
    expect(next.sides.cpu.team[0].hp).toBeLessThan(target.hp);
    expect(next.log.some(entry=>entry.text.includes('부유 발동'))).toBe(false);
  });

  it('Sheer Force improves damage and suppresses its chance-based secondary effect',()=>{
    const original=battle('charizard','blissey',['flamethrower','airslash','roost','protect']);
    const boosted=battle('charizard','blissey',['flamethrower','airslash','roost','protect']);
    boosted.sides.player.team[0].set.abilityId='sheerforce';
    const base=runTurn(original,action('flamethrower'),action('recover'));
    const powered=runTurn(boosted,action('flamethrower'),action('recover'));
    expect(powered.sides.cpu.team[0].hp).toBeLessThan(base.sides.cpu.team[0].hp);
    expect(powered.sides.cpu.team[0].status).toBeNull();
  });

  it('Keen Eye ignores target evasion and resists accuracy drops',()=>{
    const state=battle();const user=state.sides.player.team[0],target=state.sides.cpu.team[0];
    target.stages.evasion=4;
    const normal=moveAccuracy(state,user,target,moves.thunderbolt);
    user.set.abilityId='keeneye';
    expect(moveAccuracy(state,user,target,moves.thunderbolt)).toBeGreaterThan(normal);
  });

  it('Rock Head avoids move recoil while Struggle still costs HP',()=>{
    const state=battle('charizard','blissey',['flareblitz','flamethrower','protect','airslash']);
    state.sides.player.team[0].set.abilityId='rockhead';
    const next=runTurn(state,action('flareblitz'),action('recover'));
    expect(next.sides.player.team[0].hp).toBe(state.sides.player.team[0].hp);
  });
});
