import { abilities, getStarterTeam, items, moves, natures, regulationSpecies, restrictedDexNumbers, species } from '../data';
import type { Format, Stat, Stats, TeamSet } from '../engine/types';
import { gimmickSetErrors } from '../engine/gimmicks';
import { exclusiveZMoves } from '../data/gimmicks';
export { chooseCpuLineup, createCpuTeamPool } from './cpu';

export const TEAM_STORAGE_KEY = 'battle-circuit-team-v1';
export const BATTLE_LEVEL = 50;

export interface TeamStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const statKeys: Stat[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

function storageOrBrowser(storage?: TeamStorage): TeamStorage {
  if (storage) return storage;
  if (typeof localStorage === 'undefined') throw new Error('브라우저 저장소를 사용할 수 없습니다.');
  return localStorage;
}

export function createSet(speciesId: string): TeamSet {
  const entry = regulationSpecies[speciesId]??species[speciesId];
  if (!entry) throw new Error(`알 수 없는 포켓몬: ${speciesId}`);
  if(speciesId==='ditto')return {speciesId,friendship:255,moves:['transform'],abilityId:entry.abilities[0],itemId:'none',teraType:'normal',gigantamax:false,natureId:'hardy',ivs:{hp:31,atk:31,def:31,spa:31,spd:31,spe:31},evs:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0}};
  const score = (id: string) => {
    const move = moves[id];
    return move.power * (move.accuracy ?? 100) / 100 * (entry.types.includes(move.type) ? 1.5 : 1)
      * entry.baseStats[move.category === 'physical' ? 'atk' : 'spa'];
  };
  const attackingMoves = entry.learnset.filter(id => moves[id]?.category !== 'status').sort((a,b) => score(b)-score(a));
  const coverage = attackingMoves.filter((id,index) => !attackingMoves.slice(0,index).some(other => moves[other].type === moves[id].type));
  const supportMoves = entry.learnset.filter(id => moves[id]?.category === 'status').sort((a,b) => Number(b === 'protect') - Number(a === 'protect'));
  const exclusiveZ=exclusiveZMoves.find(z=>z.speciesId===speciesId&&entry.learnset.includes(z.baseMove));
  return {
    speciesId,
    friendship: 255,
    moves: [...new Set([...coverage.slice(0, 3), ...(exclusiveZ?[exclusiveZ.baseMove]:[]), ...(speciesId === 'xerneas' ? ['geomancy'] : []), ...supportMoves, ...attackingMoves])].slice(0, 4),
    abilityId: entry.abilities[0],
    itemId: speciesId === 'xerneas' ? 'powerherb' : exclusiveZ?.crystal ?? 'none',
    teraType:entry.types[0],gigantamax:false,
    natureId: 'hardy',
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  };
}

export function createDefaultTeam(): TeamSet[] {
  return getStarterTeam();
}

/** The picker order is independent of the four configured move slots. */
export function alphabetizeMoves(ids: string[]): string[] {
  return [...ids].sort((a, b) => (moves[a]?.name ?? a).localeCompare(moves[b]?.name ?? b, 'ko-KR') || a.localeCompare(b));
}

/** Move the complete set so its moves, item, nature, IVs and EVs stay together. */
export function reorderTeam(team: TeamSet[], from: number, to: number): TeamSet[] {
  if (from < 0 || to < 0 || from >= team.length || to >= team.length) return team;
  const result = [...team];
  [result[from], result[to]] = [result[to], result[from]];
  return result;
}

/** Standard level-50 stat calculation used throughout this prototype. */
export function calculateStats(set: TeamSet): Stats {
  const entry = species[set.speciesId];
  if (!entry) throw new Error(`알 수 없는 포켓몬: ${set.speciesId}`);
  const nature = natures[set.natureId];
  if (!nature) throw new Error(`알 수 없는 성격: ${set.natureId}`);
  const result = {} as Stats;
  for (const stat of statKeys) {
    const base = entry.baseStats[stat];
    const iv = set.ivs?.[stat] ?? 31;
    const ev = set.evs?.[stat] ?? 0;
    const scaled = Math.floor(((2 * base + iv + Math.floor(ev / 4)) * BATTLE_LEVEL) / 100);
    if (stat === 'hp') {
      result.hp = scaled + BATTLE_LEVEL + 10;
    } else {
      const modifier = nature.up === stat ? 1.1 : nature.down === stat ? 0.9 : 1;
      result[stat] = Math.floor((scaled + 5) * modifier);
    }
  }
  return result;
}

/** Returns user-facing errors; a team may contain 1-6 members (2+ for doubles). */
export function validateTeam(team: TeamSet[], format: Format = 'singles'): string[] {
  const errors: string[] = [];
  if (!Array.isArray(team)) return ['팀 데이터가 올바르지 않습니다.'];
  const minimum = format === 'doubles' ? 2 : 1;
  if (team.length < minimum || team.length > 6) {
    errors.push(`팀은 ${minimum}~6마리로 구성해야 합니다.`);
  }

  const usedSpecies = new Set<string>();
  const usedItems = new Set<string>();
  for (let i = 0; i < team.length; i++) {
    const set = team[i];
    const label = `${i + 1}번 슬롯`;
    if (!set || typeof set !== 'object') {
      errors.push(`${label}: 포켓몬 설정이 올바르지 않습니다.`);
      continue;
    }
    const entry = species[set.speciesId];
    errors.push(...gimmickSetErrors(set));
    if (!entry) {
      errors.push(`${label}: 등록되지 않은 포켓몬입니다.`);
      continue;
    }
    if (set.friendship !== undefined && (!Number.isInteger(set.friendship) || set.friendship < 0 || set.friendship > 255)) {
      errors.push(`${label}: 친밀도는 0~255 사이의 정수여야 합니다.`);
    }
    if (usedSpecies.has(set.speciesId)) errors.push(`${label}: 같은 포켓몬은 중복할 수 없습니다.`);
    usedSpecies.add(set.speciesId);
    if(set.gender){
      const ratio=entry.genderRatio??{M:.5,F:.5};
      if(!['M','F','N'].includes(set.gender)||(set.gender==='N'?(ratio.M??0)+(ratio.F??0)>0:(ratio[set.gender]??0)<=0))
        errors.push(`${label}: 선택할 수 없는 성별입니다.`);
    }
    const moveSlots=set.speciesId==='ditto'?1:Math.min(4,entry.learnset.length);
    if (!Array.isArray(set.moves) || set.moves.length !== moveSlots) {
      errors.push(`${label}: 기술 ${moveSlots}개를 선택해야 합니다.`);
    } else {
      const unique = new Set<string>();
      for (const id of set.moves) {
        if (typeof id !== 'string' || !moves[id] || !entry.learnset.includes(id)) {
          errors.push(`${label}: 배울 수 없는 기술이 있습니다.`);
        }
        if (unique.has(id)) errors.push(`${label}: 같은 기술을 중복할 수 없습니다.`);
        unique.add(id);
      }
    }
    if (!entry.abilities.includes(set.abilityId) || !abilities[set.abilityId]) {
      errors.push(`${label}: 선택할 수 없는 특성입니다.`);
    }
    if (!items[set.itemId]) errors.push(`${label}: 등록되지 않은 지닌 도구입니다.`);
    else if(items[set.itemId].supported===false) errors.push(`${label}: 이 도구의 배틀 효과는 아직 지원하지 않습니다.`);
    else if(set.itemId!=='none') {
      if(usedItems.has(set.itemId)) errors.push(`${label}: 같은 지닌 도구는 팀에서 중복할 수 없습니다.`);
      usedItems.add(set.itemId);
    }
    if (!natures[set.natureId]) errors.push(`${label}: 등록되지 않은 성격입니다.`);
    let totalEvs = 0;
    for (const stat of statKeys) {
      const iv = set.ivs?.[stat] ?? 31;
      const ev = set.evs?.[stat] ?? 0;
      if (!Number.isInteger(iv) || iv < 0 || iv > 31) errors.push(`${label}: ${stat} 개체값은 0~31이어야 합니다.`);
      if (!Number.isInteger(ev) || ev < 0 || ev > 252) errors.push(`${label}: ${stat} 노력치는 0~252여야 합니다.`);
      totalEvs += Number.isFinite(ev) ? ev : 0;
    }
    if (totalEvs > 510) errors.push(`${label}: 노력치 총합은 510 이하여야 합니다.`);
  }
  return errors;
}

/** Restricted legends and mythicals are judged by national number so alternate forms count together. */
export type RestrictedLimit = 0 | 1 | 2 | 3 | 4;
export function validateRestrictedTeam(team:TeamSet[],selectedLimit:RestrictedLimit | boolean,_format:Format='singles'):string[] {
  const limit=typeof selectedLimit==='boolean'?(selectedLimit?1:0):selectedLimit;
  const restricted=team.filter(set=>restrictedDexNumbers.has(species[set.speciesId]?.nationalDex));
  if(limit===0&&restricted.length)return ['이 배틀은 초전설·환상 포켓몬을 허용하지 않습니다. 제한을 변경하거나 팀에서 제외하세요.'];
  if(restricted.length>limit)return [`초전설·환상 포켓몬은 팀에 최대 ${limit}마리만 넣을 수 있습니다.`];
  return [];
}

/** Validated persistence with an injectable storage dependency for tests. */
export function saveTeam(team: TeamSet[], storage?: TeamStorage): void {
  const errors = validateTeam(team);
  if (errors.length) throw new Error(errors.join('\n'));
  storageOrBrowser(storage).setItem(TEAM_STORAGE_KEY, JSON.stringify({ version: 1, team }));
}

/** Corrupt or obsolete saves are ignored and the caller can use createDefaultTeam(). */
export function loadTeam(storage?: TeamStorage): TeamSet[] | null {
  try {
    const raw = storageOrBrowser(storage).getItem(TEAM_STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const record = value as { version?: unknown; team?: unknown };
    if (record.version !== 1 || validateTeam(record.team as TeamSet[]).length) return null;
    const saved=record.team as TeamSet[];
    const previousDefaults:[string,string,string][]=[
      ['rotomwash','leftovers','hydropump,voltswitch,willowisp,protect'],
      ['grimmsnarl','lightclay','spiritbreak,reflect,lightscreen,taunt'],
      ['garchomp','muscleBand','outrage,earthquake,rockslide,protect'],
      ['charizard','charizarditey','flamethrower,airslash,roost,protect'],
      ['gholdengo','wiseGlasses','makeitrain,shadowball,steelbeam,recover'],
      ['basculegion','mysticWater','lastrespects,wavecrash,aquajet,protect'],
    ];
    if(saved.length===previousDefaults.length&&saved.every((set,index)=>set.speciesId===previousDefaults[index][0]&&set.itemId===previousDefaults[index][1]&&set.moves.join(',')===previousDefaults[index][2]))
      return getStarterTeam();
    return structuredClone(saved);
  } catch {
    return null;
  }
}
