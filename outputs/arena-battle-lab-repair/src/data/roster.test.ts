import { describe, expect, it } from 'vitest';
import { abilities, species, typeNames } from './index';
import sourceEvidence from '../../docs/roster-evidence.json';
import { createSet, validateTeam } from '../team';

const evidence = sourceEvidence as Record<string,{nationalDex:number;types:string[];stats:Record<string,number>;abilities:string[];learnsetSources:Record<string,string[]>}>;
const normalize = (value:string) => value.toLowerCase().replace(/[^a-z0-9]/g,'');
describe('source-verified roster',()=>{
  it('has exactly 180 unique species and 10 valid representatives of each of 18 types',()=>{
    const roster=Object.values(species);
    expect(roster).toHaveLength(180);
    expect(new Set(roster.map(mon=>mon.nationalDex)).size).toBe(180);
    expect(new Set(roster.map(mon=>mon.id)).size).toBe(180);
    expect(Object.keys(typeNames)).toHaveLength(18);
    for(const type of Object.keys(typeNames))expect(roster.filter(mon=>mon.representativeType===type)).toHaveLength(10);
    for(const mon of roster)expect(mon.types).toContain(mon.representativeType);
  });
  it('matches recorded upstream stats, dual types, abilities and learnset evidence for every species',()=>{
    for(const mon of Object.values(species)){
      const original=evidence[mon.id];
      expect(mon.nationalDex).toBe(original.nationalDex);
      expect(mon.baseStats).toEqual(original.stats);
      expect(mon.types).toEqual(original.types.map(type=>type.toLowerCase()));
      expect(mon.abilities.map(normalize).sort()).toEqual(original.abilities.map(normalize).sort());
      for(const ability of mon.abilities)expect(abilities[ability]).toBeDefined();
      for(const move of mon.learnset)expect(original.learnsetSources[move]?.length).toBeGreaterThan(0);
      expect(mon.learnset.length).toBeGreaterThanOrEqual(4);
      expect(validateTeam([createSet(mon.id)])).toEqual([]);
    }
  });
});
