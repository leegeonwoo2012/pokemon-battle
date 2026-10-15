import { describe, expect, it } from 'vitest';
import { abilities, items, moves, regulationSpecies, species } from '../data';
import { availableFormSprites } from '../data/form-sprites.generated';
import { gmaxForms } from '../data/gimmicks';
import { createSet, validateTeam } from '../team';
import { createBattle, runTurn } from './battle';
import { damagePassiveMultiplier, getModifiedStat } from './calculations';
import { gimmickReason, previewMove } from './gimmicks';
import { applyDamage, processEndTurn } from './effects';
import { applyTacticalEffect } from './tactics';

const battle=(id:string,itemId='none')=>createBattle({format:'singles',playerTeam:[{...createSet(id),itemId}],cpuTeam:[createSet('blissey')],seed:42});

describe('fusion, Crowned, and Gigantamax expansion',()=>{
  it('makes the four fusion forms and seven requested species selectable with coherent data',()=>{
    for(const id of ['kyuremblack','kyuremwhite','calyrexice','calyrexshadow','amoonguss','dondozo','ferrothorn','clodsire','quagsire','dustox','beautifly']){
      const mon=regulationSpecies[id];expect(mon,id).toBeDefined();
      expect(mon.baseStats.hp,id).toBeGreaterThan(0);
      for(const ability of mon.abilities)expect(abilities[ability],`${id}: ${ability}`).toBeDefined();
      for(const move of mon.learnset)expect(moves[move],`${id}: ${move}`).toBeDefined();
      expect(validateTeam([createSet(id)])).toEqual([]);
    }
    expect(regulationSpecies.kyuremblack.baseStats.atk).toBe(170);
    expect(regulationSpecies.calyrexshadow.baseStats.spa).toBe(165);
    expect(regulationSpecies.reshiram).toBeDefined();
    expect(regulationSpecies.zekrom).toBeDefined();
  });

  it('provides a selectable species and local form art for every Gmax entry',()=>{
    for(const id of Object.keys(gmaxForms)){
      expect(regulationSpecies[id],id).toBeDefined();
      expect(availableFormSprites,id).toContain(`${id}gmax`);
      expect(validateTeam([{...createSet(id),gigantamax:true,itemId:'dynamaxband'}])).toEqual([]);
    }
    expect(Object.keys(gmaxForms)).toHaveLength(34);
  });

  it('requires the Rusted items for Crowned forms and changes Iron Head',()=>{
    for(const [id,item,form,signature] of [
      ['zacian','rustedsword','zaciancrowned','behemothblade'],
      ['zamazenta','rustedshield','zamazentacrowned','behemothbash'],
    ]){
      const plain=battle(id).sides.player.team[0];
      expect(plain.battleFormId).toBeUndefined();
      const crowned=battle(id,item).sides.player.team[0];
      expect(crowned.battleFormId).toBe(form);
      expect(crowned.types).toContain('steel');
      expect(previewMove(crowned,moves.ironhead).id).toBe(signature);
      expect(availableFormSprites).toContain(form);
    }
  });

  it('requires the band to Dynamax and doubles HP when used',()=>{
    const empty=battle('charizard');
    expect(gimmickReason(empty,'player',empty.sides.player.team[0],'dynamax')).toBeTruthy();
    const ready=battle('charizard','dynamaxband');
    const hp=ready.sides.player.team[0].maxHp;
    const result=runTurn(ready,[{kind:'move',slot:0,moveId:'protect',gimmick:'dynamax'}],[{kind:'move',slot:0,moveId:'protect'}]);
    expect(result.sides.player.team[0].transformation?.kind).toBe('dynamax');
    expect(result.sides.player.team[0].maxHp).toBe(hp*2);
  });
});

describe('new held item rules',()=>{
  it('applies species restricted Light Ball and Eviolite modifiers',()=>{
    const pikachu=battle('pikachu','lightball').sides.player.team[0];
    const pikachuAtk=getModifiedStat(pikachu,'atk');
    pikachu.itemConsumed=true;
    expect(pikachuAtk).toBe(getModifiedStat(pikachu,'atk')*2);
    const unevolved=battle('pikachu','eviolite').sides.player.team[0];
    const defense=getModifiedStat(unevolved,'def');
    unevolved.itemConsumed=true;
    expect(defense).toBe(Math.floor(getModifiedStat(unevolved,'def')*1.5));
  });

  it('applies typed Plates and marks unimplemented catalog effects explicitly',()=>{
    const arceus=battle('arceus','flameplate').sides.player.team[0];
    expect(arceus.types).toEqual(['fire']);
    expect(damagePassiveMultiplier(arceus,moves.flamethrower,'onAttack')).toBeCloseTo(1.2);
    expect(items.abilityshield.supported).toBe(false);
    expect(validateTeam([{...createSet('pikachu'),itemId:'abilityshield'}])).not.toEqual([]);
    expect(species.arceus).toBeDefined();
  });

  it('resolves Black Sludge and status orbs at end of turn',()=>{
    const sludge=battle('clodsire','blacksludge');
    const poison=sludge.sides.player.team[0];
    poison.hp-=20;const injured=poison.hp;
    processEndTurn(sludge);
    expect(poison.hp).toBeGreaterThan(injured);
    const orb=battle('pikachu','flameorb');
    processEndTurn(orb);
    expect(orb.sides.player.team[0].status).toBe('burn');
  });

  it('consumes Oran Berry at half HP and Mental Herb against Taunt',()=>{
    const berry=battle('pikachu','oranberry');
    const mon=berry.sides.player.team[0];
    const damage=Math.ceil(mon.maxHp/2)+1;
    applyDamage(berry,mon,damage,'test');
    expect(mon.itemConsumed).toBe(true);
    expect(mon.hp).toBe(mon.maxHp-damage+10);
    const herb=battle('pikachu','mentalherb');
    const target=herb.sides.player.team[0],foe=herb.sides.cpu.team[0];
    applyTacticalEffect(herb,{kind:'taunt'},foe,target);
    expect(target.tauntTurns).toBe(0);
    expect(target.itemConsumed).toBe(true);
  });

  it('makes Jaboca Berry recoil trigger on a physical hit',()=>{
    const pikachu={...createSet('pikachu'),moves:['quickattack','thunderbolt','protect','volttackle']};
    const foe={...createSet('blissey'),itemId:'jabocaberry'};
    const state=createBattle({format:'singles',playerTeam:[pikachu],cpuTeam:[foe],seed:75});
    const result=runTurn(state,[{kind:'move',slot:0,moveId:'quickattack'}],[{kind:'move',slot:0,moveId:'recover'}]);
    expect(result.sides.cpu.team[0].itemConsumed).toBe(true);
    expect(result.sides.player.team[0].hp).toBeLessThan(result.sides.player.team[0].maxHp);
  });
});
