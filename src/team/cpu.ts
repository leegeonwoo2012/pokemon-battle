import { abilities, items, moves, natures, regulationSpecies, species, typeChart } from '../data';
import { megaForms } from '../data/gimmicks';
import { calculateStats } from '../engine/calculations';
import type { Format, Stats, TeamSet } from '../engine/types';
import type { RestrictedLimit } from './index';

type CpuPreset = Omit<TeamSet, 'ivs' | 'evs' | 'friendship' | 'teraType' | 'gigantamax'> & {
  evs: Stats;
  rank: number;
};

const balancedEvs: Stats = { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 };
const physicalEvs: Stats = { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 };
const bulkyPhysicalEvs: Stats = { hp: 252, atk: 252, def: 0, spa: 0, spd: 4, spe: 0 };
const bulkySpecialEvs: Stats = { hp: 252, atk: 0, def: 4, spa: 0, spd: 252, spe: 0 };

const doublesPresets: CpuPreset[] = [
  { speciesId: 'rillaboom', moves: ['grassyglide', 'fakeout', 'woodhammer', 'uturn'], abilityId: 'grassysurge', itemId: 'miracleSeed', natureId: 'adamant', evs: bulkyPhysicalEvs, rank: 1 },
  { speciesId: 'sneasler', moves: ['closecombat', 'direclaw', 'protect', 'fakeout'], abilityId: 'unburden', itemId: 'whiteherb', natureId: 'adamant', evs: bulkyPhysicalEvs, rank: 2 },
  { speciesId: 'incineroar', moves: ['fakeout', 'partingshot', 'flareblitz', 'throatchop'], abilityId: 'intimidate', itemId: 'sitrusBerry', natureId: 'careful', evs: { hp: 252, atk: 0, def: 108, spa: 0, spd: 148, spe: 0 }, rank: 3 },
  { speciesId: 'salamence', moves: ['protect', 'hypervoice', 'tailwind', 'dracometeor'], abilityId: 'intimidate', itemId: 'salamencite', natureId: 'timid', evs: balancedEvs, rank: 4 },
  { speciesId: 'kingambit', moves: ['kowtowcleave', 'suckerpunch', 'ironhead', 'protect'], abilityId: 'defiant', itemId: 'chopleberry', natureId: 'adamant', evs: bulkyPhysicalEvs, rank: 5 },
  { speciesId: 'gholdengo', moves: ['shadowball', 'makeitrain', 'protect', 'nastyplot'], abilityId: 'goodasgold', itemId: 'lifeOrb', natureId: 'timid', evs: balancedEvs, rank: 6 },
];

const singlesPresets: CpuPreset[] = [
  { speciesId: 'salamence', moves: ['doubleedge', 'earthquake', 'dragondance', 'roost'], abilityId: 'intimidate', itemId: 'salamencite', natureId: 'jolly', evs: physicalEvs, rank: 1 },
  { speciesId: 'primarina', moves: ['moonblast', 'sparklingaria', 'aquajet', 'calmmind'], abilityId: 'liquidvoice', itemId: 'leftovers', natureId: 'modest', evs: { hp: 252, atk: 0, def: 4, spa: 252, spd: 0, spe: 0 }, rank: 2 },
  { speciesId: 'gholdengo', moves: ['shadowball', 'makeitrain', 'nastyplot', 'recover'], abilityId: 'goodasgold', itemId: 'airballoon', natureId: 'timid', evs: balancedEvs, rank: 3 },
  { speciesId: 'garchomp', moves: ['earthquake', 'stealthrock', 'dragonclaw', 'stoneedge'], abilityId: 'roughSkin', itemId: 'choiceScarf', natureId: 'jolly', evs: physicalEvs, rank: 4 },
  { speciesId: 'golisopod', moves: ['ironhead', 'firstimpression', 'suckerpunch', 'liquidation'], abilityId: 'emergencyexit', itemId: 'golisopite', natureId: 'adamant', evs: bulkyPhysicalEvs, rank: 5 },
  { speciesId: 'rillaboom', moves: ['grassyglide', 'uturn', 'highhorsepower', 'woodhammer'], abilityId: 'grassysurge', itemId: 'miracleSeed', natureId: 'adamant', evs: bulkyPhysicalEvs, rank: 6 },
];

const restrictedPresets: CpuPreset[] = [
  { speciesId: 'kyogre', moves: ['waterspout', 'originpulse', 'thunder', 'icebeam'], abilityId: 'drizzle', itemId: 'choiceSpecs', natureId: 'timid', evs: balancedEvs, rank: 1 },
  { speciesId: 'dialga', moves: ['dracometeor', 'flashcannon', 'earthpower', 'trickroom'], abilityId: 'pressure', itemId: 'adamantorb', natureId: 'modest', evs: { hp: 252, atk: 0, def: 4, spa: 252, spd: 0, spe: 0 }, rank: 2 },
  { speciesId: 'palkia', moves: ['spacialrend', 'hydropump', 'earthpower', 'protect'], abilityId: 'pressure', itemId: 'lustrousorb', natureId: 'timid', evs: balancedEvs, rank: 3 },
  { speciesId: 'giratina', moves: ['shadowball', 'dragonpulse', 'earthpower', 'willowisp'], abilityId: 'pressure', itemId: 'griseousorb', natureId: 'calm', evs: bulkySpecialEvs, rank: 4 },
];

function presetToSet(preset: CpuPreset): TeamSet {
  const entry = regulationSpecies[preset.speciesId];
  if (!entry) throw new Error(`CPU 샘플의 포켓몬 데이터가 없습니다: ${preset.speciesId}`);
  const unavailableMove = preset.moves.find(id => !entry.learnset.includes(id) || !moves[id]);
  if (unavailableMove) throw new Error(`${entry.name}의 CPU 샘플에 배울 수 없는 기술이 있습니다: ${unavailableMove}`);
  const unavailable = !entry.abilities.includes(preset.abilityId) || !abilities[preset.abilityId]
    || !natures[preset.natureId] || !species[preset.speciesId]
    || !items[preset.itemId] || items[preset.itemId].supported === false;
  if (unavailable) throw new Error(`${entry.name}의 CPU 샘플 데이터가 완전하지 않습니다.`);
  return {
    speciesId: preset.speciesId,
    friendship: 255,
    moves: [...preset.moves],
    abilityId: preset.abilityId,
    itemId: preset.itemId,
    natureId: preset.natureId,
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    evs: { ...preset.evs },
    teraType: entry.types[0],
    gigantamax: false,
  };
}

/** Builds a six-Pokémon preview roster from current M-C samples and the selected restricted cap. */
export function createCpuTeamPool(limit: RestrictedLimit, format: Format): TeamSet[] {
  const ordinary = format === 'doubles' ? doublesPresets : singlesPresets;
  const restrictedCount = Math.min(limit, restrictedPresets.length);
  const selected = [
    ...restrictedPresets.slice(0, restrictedCount),
    ...ordinary.slice(0, 6 - restrictedCount),
  ];
  return selected.map(presetToSet);
}

function bestDamageRatio(attacker: TeamSet, defender: TeamSet): number {
  const attackSpecies = species[attacker.speciesId];
  const defenderSpecies = species[defender.speciesId];
  const attackStats = calculateStats(attackSpecies, attacker);
  const defenderStats = calculateStats(defenderSpecies, defender);
  const mega = megaForms.find(form => form.speciesId === attacker.speciesId && form.stoneId === attacker.itemId);
  const megaStats = mega ? calculateStats({ ...attackSpecies, ...mega, baseStats: mega.baseStats } as typeof attackSpecies, attacker) : attackStats;
  const attackTypes = mega?.types ?? attackSpecies.types;
  const attackAbilities = mega?.abilityId ?? attacker.abilityId;
  const attack = (moveId: string) => {
    const move = moves[moveId];
    if (!move || move.category === 'status' || move.power <= 0) return 0;
    const targetDef = move.category === 'physical' ? defenderStats.def : defenderStats.spd;
    const attackingStat = move.category === 'physical' ? megaStats.atk : megaStats.spa;
    let typeMultiplier = move.type === 'stellar' ? 1 : move.type ? (species[defender.speciesId].types.reduce((value, type) => value * (typeChart[move.type]?.[type] ?? 1), 1)) : 1;
    const defenderMega = megaForms.find(form => form.speciesId === defender.speciesId && form.stoneId === defender.itemId);
    if (defenderMega && move.type !== 'stellar') typeMultiplier = defenderMega.types.reduce((value, type) => value * (typeChart[move.type]?.[type] ?? 1), 1);
    if (typeMultiplier === 0) return 0;
    const stab = attackTypes.includes(move.type) ? (attackAbilities === 'adaptability' ? 2 : 1.5) : 1;
    const accuracy = move.accuracy === null ? 1 : (move.accuracy ?? 100) / 100;
    const power = move.power * stab * typeMultiplier * accuracy;
    return Math.floor((((22 * power * attackingStat) / Math.max(1, targetDef)) / 50) + 2) / Math.max(1, defenderStats.hp);
  };
  return Math.max(0, ...attacker.moves.map(attack));
}

function matchupValue(cpu: TeamSet, opponent: TeamSet): number {
  const offense = bestDamageRatio(cpu, opponent);
  const defense = bestDamageRatio(opponent, cpu);
  const cpuStats = calculateStats(species[cpu.speciesId], cpu);
  const opponentStats = calculateStats(species[opponent.speciesId], opponent);
  const speedEdge = cpuStats.spe >= opponentStats.spe ? 0.08 : -0.02;
  const attackControl = abilities[cpu.abilityId]?.effects.some(effect => effect.trigger === 'onEnter' && effect.kind === 'stat' && effect.stat === 'atk' && effect.stages < 0) ? 0.05 : 0;
  return offense * 100 - defense * 64 + speedEdge * 100 + attackControl * 100;
}

function assignmentScore(lineup: TeamSet[], opponents: TeamSet[], format: Format): number {
  const used = new Set<number>();
  function assign(opponentIndex: number): number {
    if (opponentIndex >= opponents.length) return 0;
    let best = -Infinity;
    for (let index = 0; index < lineup.length; index++) {
      if (used.has(index)) continue;
      used.add(index);
      best = Math.max(best, matchupValue(lineup[index], opponents[opponentIndex]) + assign(opponentIndex + 1));
      used.delete(index);
    }
    return best;
  }
  let score = assign(0);
  const sharedRoles = lineup.flatMap(set => set.moves.map(id => moves[id])).filter(move => move && ['fakeout', 'tailwind', 'partingshot', 'stealthrock', 'recover', 'roost'].includes(move.id)).length;
  score += sharedRoles * (format === 'doubles' ? 1.4 : 0.8);
  const uniqueTypes = new Set(lineup.flatMap(set => species[set.speciesId].types)).size;
  score += uniqueTypes * 0.6;
  score += lineup.reduce((sum, set) => sum + (6 - (restrictedPresets.find(preset => preset.speciesId === set.speciesId)?.rank ?? 6)) * 0.15, 0);
  return score;
}

/** Selects the strongest distinct set of CPU answers to the player's selected team. */
export function chooseCpuLineup(pool: TeamSet[], opponents: TeamSet[], size: number, format: Format): TeamSet[] {
  let best: TeamSet[] = pool.slice(0, size);
  let bestScore = -Infinity;
  function search(start: number, chosen: TeamSet[]): void {
    if (chosen.length === size) {
      const score = assignmentScore(chosen, opponents, format);
      if (score > bestScore) {
        bestScore = score;
        best = chosen;
      }
      return;
    }
    for (let index = start; index <= pool.length - (size - chosen.length); index++) {
      search(index + 1, [...chosen, pool[index]]);
    }
  }
  search(0, []);
  return structuredClone(best);
}
