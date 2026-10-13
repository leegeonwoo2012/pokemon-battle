import { describe, expect, it } from 'vitest';
import { abilities, getStarterTeam, items, moves, natures, species, typeChart } from '../data';
import { calculateStats, createSet, loadTeam, saveTeam, TEAM_STORAGE_KEY, validateTeam } from './index';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

describe('curated battle data', () => {
  it('provides a battle-ready six-member starter team', () => {
    const team = getStarterTeam();
    expect(team).toHaveLength(6);
    expect(validateTeam(team, 'singles')).toEqual([]);
    expect(validateTeam(team, 'doubles')).toEqual([]);
  });

  it('keeps species, learnsets, abilities and move references coherent', () => {
    for (const entry of Object.values(species)) {
      expect(entry.abilities.length).toBeGreaterThan(0);
      for (const id of entry.abilities) expect(abilities[id]).toBeDefined();
      for (const id of entry.learnset) expect(moves[id]).toBeDefined();
      expect(validateTeam([createSet(entry.id)])).toEqual([]);
    }
    expect(Object.keys(species).length).toBeGreaterThanOrEqual(16);
    expect(Object.keys(items).length).toBeGreaterThan(0);
    expect(Object.keys(natures)).toHaveLength(25);
    expect(typeChart.electric.ground).toBe(0);
  });
});

describe('team configuration', () => {
  it('calculates level-50 stats using EVs, IVs and nature', () => {
    const neutral = createSet('pikachu');
    const baseline = calculateStats(neutral);
    expect(baseline.hp).toBe(110);
    neutral.evs = { spe: 252, spa: 252, hp: 4 };
    neutral.natureId = 'timid';
    const trained = calculateStats(neutral);
    expect(trained.hp).toBe(111);
    expect(trained.spe).toBeGreaterThan(baseline.spe);
    expect(trained.spa).toBeGreaterThan(baseline.spa);
    expect(trained.atk).toBeLessThan(baseline.atk);
  });

  it('rejects illegal move, ability and EV assignments', () => {
    const team = [createSet('pikachu')];
    team[0].moves[0] = 'earthquake';
    team[0].abilityId = 'levitate';
    team[0].evs = { atk: 252, def: 252, hp: 252 };
    const errors = validateTeam(team);
    expect(errors.some(error => error.includes('배울 수 없는 기술'))).toBe(true);
    expect(errors.some(error => error.includes('특성'))).toBe(true);
    expect(errors.some(error => error.includes('총합'))).toBe(true);
    expect(validateTeam(team, 'doubles').some(error => error.includes('2~6'))).toBe(true);
  });

  it('saves and loads an independent, validated team snapshot', () => {
    const storage = memoryStorage();
    const team = getStarterTeam();
    saveTeam(team, storage);
    expect(storage.getItem(TEAM_STORAGE_KEY)).toContain('"version":1');
    const restored = loadTeam(storage);
    expect(restored).toEqual(team);
    restored![0].moves[0] = 'thunder';
    expect(team[0].moves[0]).toBe('thunderbolt');

    storage.setItem(TEAM_STORAGE_KEY, '{broken');
    expect(loadTeam(storage)).toBeNull();
    storage.setItem(TEAM_STORAGE_KEY, JSON.stringify({ version: 1, team: [{ speciesId: 'missing' }] }));
    expect(loadTeam(storage)).toBeNull();
  });
});
