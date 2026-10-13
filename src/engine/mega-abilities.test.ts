import {describe,expect,it} from 'vitest';
import {createSet} from '../team';
import {moves} from '../data';
import {megaForms} from '../data/gimmicks';
import {createBattle,runTurn} from './battle';
import {matchingDamageEffects} from './calculations';
import {resistBerryMultiplier} from './effects';
import {activateGimmick,previewMove} from './gimmicks';

function mega(id:string){
  const form=megaForms.find(candidate=>candidate.speciesId===id)!;
  const defaults=createSet(id);
  const player={...defaults,itemId:form.stoneId,moves:id==='kangaskhan'?['return',...defaults.moves.filter(move=>move!=='return')].slice(0,4):defaults.moves};
  const state=createBattle({format:'singles',playerTeam:[player],cpuTeam:[createSet('blissey')],seed:44});
  expect(activateGimmick(state,'player',0,'mega','return')).toBe(true);
  return state;
}

describe('Mega ability compatibility',()=>{
  for(const [id,type] of [['gardevoir','fairy'],['pinsir','flying'],['glalie','ice']] as const)
    it(`${id} converts Normal attacks to ${type}`,()=>{
      const state=mega(id);const p=state.sides.player.team[0];
      expect(previewMove(p,moves.return)).toMatchObject({type,power:108});
    });

  it('Mega Launcher boosts pulse moves and Strong Jaw boosts bites',()=>{
    const launcher=mega('blastoise').sides.player.team[0];
    expect(matchingDamageEffects(launcher,moves.waterpulse,'onAttack').some(effect=>effect.multiplier===1.5)).toBe(true);
    launcher.set.abilityId='strongjaw';
    expect(matchingDamageEffects(launcher,moves.crunch,'onAttack').some(effect=>effect.multiplier===1.5)).toBe(true);
  });

  it('Parental Bond deals a weaker second hit',()=>{
    const state=mega('kangaskhan');
    const next=runTurn(state,[{kind:'move',slot:0,moveId:'return'}],[{kind:'move',slot:0,moveId:'recover'}]);
    expect(next.log.some(entry=>entry.text.includes('2번 맞았다'))).toBe(true);
    expect(next.sides.cpu.team[0].hp).toBeLessThan(state.sides.cpu.team[0].hp);
  });

  it('Filter reduces super-effective damage without being consumed',()=>{
    const state=mega('aggron');const p=state.sides.player.team[0];
    expect(resistBerryMultiplier(state,p,moves.earthquake,2)).toBe(0.75);
    expect(p.itemConsumed).toBeFalsy();
  });
});
