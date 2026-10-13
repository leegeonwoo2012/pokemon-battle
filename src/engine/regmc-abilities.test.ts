import {describe,expect,it} from 'vitest';
import {abilities,moves} from '../data';
import {createSet} from '../team';
import {createBattle,runTurn} from './battle';
import {estimateDamage,getModifiedStat} from './calculations';
import {absorbMove,applyDamage,applyStatChange,applyStatus} from './effects';

const battle=(player:string,cpu:string)=>createBattle({format:'singles',playerTeam:[createSet(player)],cpuTeam:[createSet(cpu)],seed:9});

describe('Regulation M-C species abilities',()=>{
  it('Hyper Cutter blocks enemy attack drops',()=>{
    const state=battle('pinsir','gyarados'),user=state.sides.player.team[0],source=state.sides.cpu.team[0];
    user.stages.atk=0;
    expect(applyStatChange(state,user,'atk',-1,source,'intimidate')).toBe(0);
    expect(user.stages.atk).toBe(0);
  });
  it('Fur Coat doubles Defense and Solid Rock reduces super-effective damage',()=>{
    const coat=battle('charizard','furfrou'),furfrou=coat.sides.cpu.team[0];
    expect(getModifiedStat(furfrou,'def')).toBe(furfrou.stats.def*2);
    const rock=battle('blastoise','rhyperior'),attacker=rock.sides.player.team[0],defender=rock.sides.cpu.team[0];
    defender.set.abilityId='solidrock';
    const solid=estimateDamage(rock,attacker,defender,moves.surf);
    defender.set.abilityId='reckless';
    expect(solid).toBeLessThan(estimateDamage(rock,attacker,defender,moves.surf));
  });
  it('Earth Eater heals while Motor Drive raises Speed on type immunity',()=>{
    const earth=battle('charizard','orthworm'),worm=earth.sides.cpu.team[0];
    applyDamage(earth,worm,40,'test');const before=worm.hp;
    expect(absorbMove(earth,worm,moves.earthquake)).toBe(true);
    expect(worm.hp).toBeGreaterThan(before);
    const electric=battle('charizard','emolga'),emolga=electric.sides.cpu.team[0];
    emolga.set.abilityId='motordrive';
    expect(absorbMove(electric,emolga,moves.thunderbolt)).toBe(true);
    expect(emolga.stages.spe).toBe(1);
  });
  it('Heatproof halves Fire damage and Thermal Exchange reacts to Fire and burn',()=>{
    const tea=battle('charizard','sinistcha'),attacker=tea.sides.player.team[0],sinistcha=tea.sides.cpu.team[0];
    sinistcha.set.abilityId='heatproof';const reduced=estimateDamage(tea,attacker,sinistcha,moves.flamethrower);
    sinistcha.set.abilityId='hospitality';
    expect(reduced).toBeLessThan(estimateDamage(tea,attacker,sinistcha,moves.flamethrower));
    const dragon=battle('charizard','baxcalibur');dragon.sides.cpu.team[0].set.abilityId='thermalexchange';
    expect(applyStatus(dragon,dragon.sides.cpu.team[0],'burn','test')).toBe(false);
    const next=runTurn(dragon,[{kind:'move',slot:0,moveId:'flamethrower'}],[{kind:'move',slot:0,moveId:'crunch'}]);
    expect(next.sides.cpu.team[0].stages.atk).toBe(1);
  });
  it('Rattled responds to Intimidate and all three triggering attack types',()=>{
    const state=battle('persianalola','gyarados'),cat=state.sides.player.team[0],source=state.sides.cpu.team[0];
    cat.set.abilityId='rattled';cat.stages.spe=0;
    applyStatChange(state,cat,'atk',-1,source,'intimidate');
    expect(cat.stages.spe).toBe(1);
    expect(abilities.rattled.effects.filter(effect=>effect.trigger==='onAfterHit')).toHaveLength(3);
  });
});
