import {describe,expect,it} from 'vitest';
import {abilities,moves,regulationSpecies,restrictedDexNumbers,species} from '../data';
import {megaForms,primalForms} from '../data/gimmicks';
import {createSet,validateRestrictedTeam,validateTeam} from '../team';
import {createBattle,runTurn} from './battle';
import {activateGimmick} from './gimmicks';

describe('generation 1–9 legendary expansion',()=>{
  it('contains every tagged base legendary and usable moves, abilities and stats',()=>{
    expect(Object.keys(regulationSpecies)).toHaveLength(366);
    expect(regulationSpecies.eevee.learnset).toContain('lastresort');
    expect(regulationSpecies.marshadow.learnset).toContain('spectralthief');
    expect(restrictedDexNumbers.size).toBe(27);
    for(const mon of Object.values(regulationSpecies)){
      expect(mon.baseStats.hp).toBeGreaterThan(0);
      expect(mon.baseStats.spe).toBeGreaterThan(0);
      for(const move of mon.learnset)expect(moves[move],`${mon.id}: ${move}`).toBeDefined();
      for(const ability of mon.abilities)expect(abilities[ability],`${mon.id}: ${ability}`).toBeDefined();
      expect(validateTeam([createSet(mon.id)])).toEqual([]);
    }
  });
  it('applies zero or one restricted legend rule to both battle formats',()=>{
    const regular=[createSet('landorus'),createSet('heatran')];
    const one=[...regular,createSet('kyogre')];
    const two=[...one,createSet('mewtwo')];
    expect(validateRestrictedTeam(regular,false)).toEqual([]);
    expect(validateRestrictedTeam(one,false)).toHaveLength(1);
    expect(validateRestrictedTeam(one,true)).toEqual([]);
    expect(validateRestrictedTeam(two,true)).toHaveLength(1);
    expect(validateTeam(one,'singles')).toEqual([]);
    expect(validateTeam(one,'doubles')).toEqual([]);
  });
  it('uses orb on entry for primal stats, ability and sprite form',()=>{
    for(const form of primalForms){
      const basic=createBattle({format:'singles',playerTeam:[createSet(form.speciesId)],cpuTeam:[createSet('blissey')],seed:5}).sides.player.team[0];
      const state=createBattle({format:'singles',playerTeam:[{...createSet(form.speciesId),itemId:form.orbId}],cpuTeam:[createSet('blissey')],seed:5});
      const transformed=state.sides.player.team[0];
      expect(transformed.transformation?.formId).toBe(form.id);
      expect(transformed.stats.atk+transformed.stats.spa).toBeGreaterThan(basic.stats.atk+basic.stats.spa);
      expect(transformed.set.abilityId).toBe(form.abilityId);
      expect(state.log.some(entry=>entry.text.includes('원시회귀'))).toBe(true);
    }
  });
  it('ends primordial weather after the orb holder leaves',()=>{
    const state=createBattle({format:'singles',playerTeam:[{...createSet('kyogre'),itemId:'blueorb'},createSet('raichu')],cpuTeam:[createSet('blissey')],seed:7});
    expect(state.weather?.id).toBe('rain');
    expect(state.sides.player.team[0].transformation?.kind).toBe('primal');
    const next=runTurn(state,[{kind:'switch',slot:0,to:1}],[{kind:'move',slot:0,moveId:'protect'}]);
    expect(next.weather).toBeNull();
  });
  it('uses its own Mega form for Mewtwo and Dragon Ascent Rayquaza',()=>{
    expect(megaForms.filter(form=>form.speciesId==='mewtwo')).toHaveLength(2);
    const rayquaza={...createSet('rayquaza'),moves:['dragonascent','protect','earthquake','extremespeed']};
    expect(rayquaza.moves.every(id=>species.rayquaza.learnset.includes(id))).toBe(true);
    const state=createBattle({format:'singles',playerTeam:[rayquaza],cpuTeam:[createSet('blissey')],seed:5});
    expect(activateGimmick(state,'player',0,'mega','dragonascent')).toBe(true);
    expect(state.sides.player.team[0].transformation?.formId).toBe('rayquazamega');
  });
});
