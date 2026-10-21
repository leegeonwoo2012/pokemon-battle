import { describe, expect, it } from 'vitest';
import { abilities, getStarterTeam, items, moves, natures, species, typeChart } from '../data';
import { alphabetizeMoves, calculateStats, createSet, loadTeam, reorderTeam, saveTeam, TEAM_STORAGE_KEY, validateRestrictedTeam, validateTeam } from './index';

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
    expect(team.map(set=>set.speciesId)).toEqual(['miraidon','calyrexshadow','zacian','eternatus','gholdengo','lucario']);
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

  it('gives the Pokémon Z Eevee evolutions more than four selectable moves', () => {
    expect(species.zephyreon.learnset.length).toBeGreaterThan(4);
    expect(species.zephyreon.learnset).toEqual(expect.arrayContaining(['defog', 'wish', 'helpinghand', 'thunderbolt']));
    expect(species.royaleon.learnset.length).toBeGreaterThan(4);
    expect(species.royaleon.learnset).toEqual(expect.arrayContaining(['boomburst', 'darkpulse', 'sludgebomb', 'powergem']));
  });
});

describe('team configuration', () => {
  it('applies each restricted legend limit to both formats and counts mythicals',()=>{
    const team=['kyogre','dialga','palkia','giratina'].map(createSet);
    expect(validateRestrictedTeam(team,0,'doubles')).not.toEqual([]);
    expect(validateRestrictedTeam(team.slice(0,2),1,'doubles')).not.toEqual([]);
    expect(validateRestrictedTeam(team.slice(0,2),2,'singles')).toEqual([]);
    expect(validateRestrictedTeam(team.slice(0,3),3,'singles')).toEqual([]);
    expect(validateRestrictedTeam(team,4,'singles')).toEqual([]);
    expect(validateRestrictedTeam(team,4,'doubles')).toEqual([]);
    expect(validateRestrictedTeam([createSet('mew')],0,'singles')).not.toEqual([]);
    expect(validateRestrictedTeam([createSet('mew')],1,'singles')).toEqual([]);
  });
  it('calculates level-50 stats using EVs, IVs and nature', () => {
    const neutral = createSet('raichu');
    const baseline = calculateStats(neutral);
    expect(baseline.hp).toBe(135);
    neutral.evs = { spe: 252, spa: 252, hp: 4 };
    neutral.natureId = 'timid';
    const trained = calculateStats(neutral);
    expect(trained.hp).toBe(136);
    expect(trained.spe).toBeGreaterThan(baseline.spe);
    expect(trained.spa).toBeGreaterThan(baseline.spa);
    expect(trained.atk).toBeLessThan(baseline.atk);
  });

  it('rejects illegal move, ability and EV assignments', () => {
    const team = [createSet('raichu')];
    team[0].moves[0] = 'earthquake';
    team[0].abilityId = 'levitate';
    team[0].evs = { atk: 252, def: 252, hp: 252 };
    const errors = validateTeam(team);
    expect(errors.some(error => error.includes('배울 수 없는 기술'))).toBe(true);
    expect(errors.some(error => error.includes('특성'))).toBe(true);
    expect(errors.some(error => error.includes('총합'))).toBe(true);
    expect(validateTeam(team, 'doubles').some(error => error.includes('2~6'))).toBe(true);
  });

  it('allows only one copy of a held item across the team while allowing multiple unheld Pokémon',()=>{
    const team=[createSet('raichu'),createSet('eevee')];
    team[0].itemId='choiceScarf';team[1].itemId='choiceScarf';
    expect(validateTeam(team).some(error=>error.includes('같은 지닌 도구'))).toBe(true);
    team[1].itemId='none';
    expect(validateTeam(team)).toEqual([]);
  });

  it('stores friendship and rejects values outside the battle range',()=>{
    const set=createSet('eevee');
    expect(set.friendship).toBe(255);
    set.friendship=0;expect(validateTeam([set])).toEqual([]);
    set.friendship=256;expect(validateTeam([set]).some(error=>error.includes('친밀도'))).toBe(true);
  });

  it('saves and loads an independent, validated team snapshot', () => {
    const storage = memoryStorage();
    const team = getStarterTeam();
    saveTeam(team, storage);
    expect(storage.getItem(TEAM_STORAGE_KEY)).toContain('"version":1');
    const restored = loadTeam(storage);
    expect(restored).toEqual(team);
    restored![0].moves[0] = 'thunder';
    expect(team[0].moves[0]).toBe('electrodrift');

    storage.setItem(TEAM_STORAGE_KEY, '{broken');
    expect(loadTeam(storage)).toBeNull();
    storage.setItem(TEAM_STORAGE_KEY, JSON.stringify({ version: 1, team: [{ speciesId: 'missing' }] }));
    expect(loadTeam(storage)).toBeNull();
  });
  it('upgrades only the untouched previous starter team while retaining edited teams',()=>{
    const storage=memoryStorage();
    const old=[
      ['rotomwash','leftovers','hydropump,voltswitch,willowisp,protect'],
      ['grimmsnarl','lightclay','spiritbreak,reflect,lightscreen,taunt'],
      ['garchomp','muscleBand','outrage,earthquake,rockslide,protect'],
      ['charizard','charizarditey','flamethrower,airslash,roost,protect'],
      ['gholdengo','wiseGlasses','makeitrain,shadowball,steelbeam,recover'],
      ['basculegion','mysticWater','lastrespects,wavecrash,aquajet,protect'],
    ].map(([id,itemId,moveIds])=>({...createSet(id),itemId,moves:moveIds.split(',')}));
    saveTeam(old,storage);
    expect(loadTeam(storage)?.map(set=>set.speciesId)).toEqual(getStarterTeam().map(set=>set.speciesId));
    old[0].itemId='choiceScarf';saveTeam(old,storage);
    expect(loadTeam(storage)?.[0].speciesId).toBe('rotomwash');
  });

  it('sorts move choices by Korean name and reorders whole sets without losing their loadout', () => {
    const team=getStarterTeam();
    const sorted=alphabetizeMoves(team[0].moves);
    expect(sorted.map(id=>moves[id].name)).toEqual([...sorted.map(id=>moves[id].name)].sort((a,b)=>a.localeCompare(b,'ko-KR')));
    expect(team[0].moves).toEqual(['electrodrift','dracometeor','overheat','voltswitch']);
    team[2].itemId='lifeOrb';
    team[2].moves=['ironhead','playrough','closecombat','swordsdance'];
    team[2].evs={atk:252,spe:252,hp:4};
    const shifted=reorderTeam(team,2,1);
    expect(shifted[1]).toBe(team[2]);
    expect(shifted[2]).toBe(team[1]);
    expect(team[1].speciesId).toBe('calyrexshadow');
    const storage=memoryStorage();saveTeam(shifted,storage);
    expect(loadTeam(storage)?.[1]).toEqual(team[2]);
  });
});
