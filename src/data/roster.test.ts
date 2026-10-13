import { describe, expect, it } from 'vitest';
import { abilities, regulationSpecies as species, typeNames } from './index';
import sourceEvidence from '../../docs/roster-evidence.json';
import { createSet, validateTeam } from '../team';
import regulation from '../../docs/regulation-m-c.json';

const evidence = sourceEvidence as Record<string,{nationalDex:number;spriteId:number;types:string[];stats:Record<string,number>;abilities:string[];learnsetSources:Record<string,string[]>}>;
const normalize = (value:string) => value.toLowerCase().replace(/[^a-z0-9]/g,'');
describe('source-verified roster',()=>{
  it('matches the pinned M-C selectable roster, including regional forms',()=>{
    const roster=Object.values(species);
    expect(roster).toHaveLength(264);
    expect(roster.map(mon=>mon.id)).toEqual(regulation.ids);
    expect(new Set(roster.map(mon=>mon.spriteId)).size).toBe(264);
    expect(new Set(roster.map(mon=>mon.id)).size).toBe(264);
    const representativeTypes=Object.keys(typeNames).filter(type=>type!=='stellar');
    expect(representativeTypes).toHaveLength(18);
    for(const type of representativeTypes)expect(roster.filter(mon=>mon.representativeType===type).length).toBeGreaterThan(0);
    for(const mon of roster)expect(mon.types).toContain(mon.representativeType);
  });
  it('includes all eight Eevee evolutions',()=>{
    for(const id of ['vaporeon','jolteon','flareon','espeon','umbreon','leafeon','glaceon','sylveon'])expect(species[id],id).toBeDefined();
  });
  it('matches recorded upstream stats, dual types, abilities and learnset evidence for every species',()=>{
    for(const mon of Object.values(species)){
      const original=evidence[mon.id];
      expect(mon.nationalDex).toBe(original.nationalDex);
      expect(mon.spriteId).toBe(original.spriteId);
      expect(mon.baseStats).toEqual(original.stats);
      expect(mon.types).toEqual(original.types.map(type=>type.toLowerCase()));
      expect(mon.abilities.map(normalize).sort()).toEqual(original.abilities.map(normalize).sort());
      for(const ability of mon.abilities)expect(abilities[ability]).toBeDefined();
      for(const move of mon.learnset)expect(original.learnsetSources[move]?.length).toBeGreaterThan(0);
      expect(mon.learnset.length).toBeGreaterThanOrEqual(mon.id==='ditto'?1:4);
      expect(validateTeam([createSet(mon.id)])).toEqual([]);
    }
  });
  it('keeps M-C exceptions to the final-evolution-only policy',()=>{
    expect(species.pikachu).toBeDefined();
    expect(species.floetteeternal).toBeDefined();
    expect(species.raichualola.spriteId).not.toBe(species.raichu.spriteId);
    expect(species.meowsticf.spriteId).not.toBe(species.meowstic.spriteId);
    expect(species.gourgeistsmall.baseStats.spe).not.toBe(species.gourgeistsuper.baseStats.spe);
    expect(species.squawkabillyyellow.abilities).not.toEqual(species.squawkabilly.abilities);
    expect(species.arceus).toBeUndefined();
    for(const id of ['sylveon','raichu','annihilape','rhyperior','kingambit','clefable'])expect(species[id]).toBeDefined();
    expect(species.annihilape.baseStats).toMatchObject({atk:115,spe:90});
    expect(species.kingambit.baseStats).toMatchObject({atk:135,def:120});
  });
});
